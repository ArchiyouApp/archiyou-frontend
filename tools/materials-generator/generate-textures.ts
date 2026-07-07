/**
 *  generate-textures.ts
 *
 *  Generate material textures with Google "Nano Banana" (Gemini image), write them
 *  to packages/core/src/materials/textures/, and patch each material's viz.textures
 *  block into materials.json.
 *
 *  Roles:
 *   - sides   : the LARGEST/broadest continuous face of the material (tiled).
 *   - section : the cut cross-section — for solid wood the tree end-grain (growth
 *               rings), for boards the layered/ply edge. Marked repeat:false so the
 *               renderer fits it to the face (fixed aspect) instead of tiling.
 *  (thinSides was removed — boards use `section` for their thin cut faces.)
 *
 *  Run:  GEMINI_API_KEY=... npm run generate:textures
 */

import './env.js';
import { GoogleGenAI } from '@google/genai';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from './config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PATH = resolve(HERE, CONFIG.output.databaseFile);
const TEX_DIR = resolve(HERE, CONFIG.output.texturesDir);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Role = 'sides' | 'section';
interface RoleSpec { realWidth: number; realHeight: number; repeat?: boolean }

/**
 * Which face roles to generate per group, with real-world texture sizes (mm).
 *
 * Wood `sides` are DIRECTIONAL: a portrait 562×1000 mm tile whose Y (height) is the
 * longitudinal grain direction. 562×1000 matches the model's 9:16 image aspect so
 * the grain maps onto the part's length axis with no stretch. Non-wood groups are
 * isotropic (square). Wood `section` is a 400×400 mm cut cross-section.
 */
const ROLES: Record<string, Partial<Record<Role, RoleSpec>>> = {
    wood:       { sides: { realWidth: 562, realHeight: 1000 }, section: { realWidth: 400, realHeight: 400, repeat: false } },
    stone:      { sides: { realWidth: 300, realHeight: 300 } },
    concrete:   { sides: { realWidth: 300, realHeight: 300 } },
    masonry:    { sides: { realWidth: 250, realHeight: 250 } },
    metal:      { sides: { realWidth: 200, realHeight: 200 } },
    plastic:    { sides: { realWidth: 200, realHeight: 200 } },
    finish:     { sides: { realWidth: 300, realHeight: 300 } },
    membrane:   { sides: { realWidth: 300, realHeight: 300 } },
    insulation: { sides: { realWidth: 250, realHeight: 250 } },
    composite:  { sides: { realWidth: 250, realHeight: 250 } },
    default:    { sides: { realWidth: 250, realHeight: 250 } },
};

const isBoard = (name: string) => /plywood|multiplex|osb|oriented strand|clt|cross.?laminated|glulam|glue.?lam|fiberboard|mdf|particle|chip.?board/i.test(name);
const isPlywood = (name: string) => /plywood|multiplex/i.test(name);
const isOSB = (name: string) => /osb|oriented strand/i.test(name);
const isLaminatedTimber = (name: string) => /clt|cross.?laminated|glulam|glue.?lam/i.test(name);
const isPressedBoard = (name: string) => /fiberboard|mdf|particle|chip.?board/i.test(name);

/** Prompt phrased to avoid the IMAGE_RECITATION filter (original/synthetic/procedural). */
function promptFor(name: string, group: string, role: Role): string
{
    const orig = 'Generate an original, synthetic, procedural, high-resolution, crisp and finely detailed PBR base-color (albedo) material texture for 3D rendering.';
    const lit = 'Flat even studio lighting, straight-on orthographic view, no shadows, no perspective, no text or logos.';

    if (role === 'sides')
    {
        if (group === 'wood')
        {
            // Directional: portrait 1:2 with the grain running along the image Y (height) axis.
            let face: string;
            if (isPlywood(name)) face = `the smooth continuous outer VENEER FACE of ${name} (the large broad face, NOT the thin layered edge)`;
            else if (isOSB(name)) face = `the broad flat FACE of OSB covered in flat compressed wood strands/flakes`;
            else face = `the broad sawn plank FACE of ${name} — the single largest/broadest face of the board`;
            return `${orig} Tall PORTRAIT orientation (about 500 mm wide by 1000 mm tall of real timber). `
                + `CRITICAL: the wood grain must run strictly VERTICALLY, parallel to the image's Y (height) axis — this is the longitudinal direction of the timber. Long straight grain lines from top to bottom, never sideways. `
                + `The wood must fill the ENTIRE frame edge to edge — no borders, no margins, no background, no whitespace. Seamless and tileable on all four edges. ${lit} Show ${face}.`;
        }
        // Non-wood, isotropic broad surface (square tile).
        const face = `the largest broad flat FACE / main surface of ${name}, as one continuous uniform surface`;
        return `${orig} It must be seamless and tileable, square 1:1 frame. ${lit} Show ${face}.`;
    }

    // section — wood family only; a cut cross-section, fitted (not tiled)
    let sec: string;
    if (isPlywood(name)) sec = `the cut EDGE cross-section of a ${name} panel: a horizontal stack of many (~9) thin wood veneer plies glued together, a striped layered edge. This is the thin cut side, NOT the broad grain face`;
    else if (isOSB(name)) sec = `the cut EDGE cross-section of an OSB board: densely compressed wood strands and flakes bonded in layers, seen from the thin side, NOT the flat face`;
    else if (isLaminatedTimber(name)) sec = `the cut cross-section of ${name}: several stacked glued solid-timber laminations (thick layers), NOT the broad face`;
    else if (isPressedBoard(name)) sec = `the cut EDGE cross-section of ${name}: a dense uniform pressed wood-fibre core seen from the thin side, NOT the face`;
    else return `${orig} Square 1:1 frame (about 400 mm × 400 mm of real timber). `
        + `Show the END-GRAIN cross-section of solid ${name} — a slice cut straight across the trunk, showing concentric annual growth rings and radial grain as seen looking at the sawn end of a log or beam. `
        + `CRITICAL: the growth-ring wood must fill the ENTIRE frame edge to edge — absolutely NO whitespace, NO background, NO margins, and NO bark or outer non-essential material; show only the clean inner cross-cut timber. It will NOT be tiled, so edges need not match. ${lit}`;
    return `${orig} Fit the pattern to fill the square frame (it will NOT be tiled, so edges need not match). ${lit} Show ${sec}.`;
}

/** Aspect ratios the Gemini image model accepts. */
const SUPPORTED_ASPECTS: Array<[string, number]> = [
    ['1:1', 1], ['1:4', 0.25], ['1:8', 0.125], ['2:3', 2 / 3], ['3:2', 1.5], ['3:4', 0.75],
    ['4:1', 4], ['4:3', 4 / 3], ['4:5', 0.8], ['5:4', 1.25], ['8:1', 8], ['9:16', 0.5625],
    ['16:9', 16 / 9], ['21:9', 21 / 9],
];

/** Map a desired width:height (mm) to the closest supported aspect ratio (e.g. 500×1000 → "9:16"). */
function nearestSupportedAspect(w: number, h: number): string
{
    const target = w / h;
    let best = SUPPORTED_ASPECTS[0];
    for (const cand of SUPPORTED_ASPECTS)
        if (Math.abs(cand[1] - target) < Math.abs(best[1] - target)) best = cand;
    return best[0];
}

/** Generate one image, retrying past transient IMAGE_RECITATION / empty results.
 *  Requests the given aspect ratio; falls back to no aspect hint if the model rejects it. */
async function generateImage(prompt: string, outPath: string, aspect?: string, attempts = 3): Promise<boolean>
{
    let useAspect = aspect;
    for (let i = 0; i < attempts; i++)
    {
        let res;
        try
        {
            res = await ai.models.generateContent({
                model: CONFIG.imageModel,
                contents: prompt,
                ...(useAspect ? { config: { imageConfig: { aspectRatio: useAspect } } as any } : {}),
            });
        }
        catch (e)
        {
            // The model may reject an unsupported aspect ratio — retry without the hint.
            if (useAspect) { useAspect = undefined; continue; }
            throw e;
        }
        const cand = res.candidates?.[0];
        for (const part of cand?.content?.parts ?? [])
        {
            const data = (part as any).inlineData?.data;
            if (data) { writeFileSync(outPath, Buffer.from(data, 'base64')); return true; }
        }
        // no image (often finishReason IMAGE_RECITATION) — retry with a nudge
        if (i < attempts - 1) prompt += ' Make it a distinct, non-photographic procedural pattern.';
    }
    return false;
}

async function main()
{
    if (!existsSync(DB_PATH)) { console.error(`No materials.json at ${DB_PATH} — run generate:data first.`); process.exit(1); }
    mkdirSync(TEX_DIR, { recursive: true });

    const db = JSON.parse(readFileSync(DB_PATH, 'utf8'));

    // Optional filter: `npm run generate:textures -- wood` (group) or `-- douglas oak` (names).
    // A material matches when its group OR name is listed; no args → all materials.
    const filter = process.argv.slice(2).map(s => s.toLowerCase());
    const matches = (m: any) => filter.length === 0 || filter.includes(m.group) || filter.includes(m.name.toLowerCase());
    if (filter.length) console.log(`Filter: ${filter.join(', ')} → ${(db.materials as any[]).filter(matches).length} material(s)`);

    for (const m of db.materials as any[])
    {
        if (!matches(m)) continue;
        const roles = ROLES[m.group] ?? ROLES.default;
        const textures: Record<string, any> = {};
        for (const [role, spec] of Object.entries(roles) as [Role, RoleSpec][])
        {
            if (!spec) continue;
            const file = `${m.name.replace(/\s+/g, '_')}_${role}.jpg`;
            const outPath = join(TEX_DIR, file);
            process.stdout.write(`- ${m.name}/${role} … `);
            try
            {
                const aspect = nearestSupportedAspect(spec.realWidth, spec.realHeight);
                const ok = await generateImage(promptFor(m.name, m.group, role), outPath, aspect);
                if (ok)
                {
                    const entry: any = { image: `./textures/${file}`, realWidth: spec.realWidth, realHeight: spec.realHeight };
                    if (spec.repeat === false) entry.repeat = false; // fit-to-face, don't tile
                    textures[role] = entry;
                    console.log('ok');
                }
                else { console.log('no image returned'); }
            }
            catch (e) { console.log(`FAILED (${(e as Error).message})`); }
        }
        if (Object.keys(textures).length) m.viz = { ...(m.viz ?? {}), textures };
    }

    writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n');
    console.log(`\nPatched textures into ${DB_PATH}; images in ${TEX_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
