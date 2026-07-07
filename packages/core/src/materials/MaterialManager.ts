/**
 *  materials/MaterialManager.ts
 *
 *  Central registry of materials. Loads the materials.json database, resolves
 *  names/aliases, and performs unit-system-aware derived calculations (mass /
 *  weight) and property read-out.
 *
 *  Wired like the other archiyou modules (see Calc.ts): construct empty, then
 *  setArchiyou(modules) to gain access to the modeler (units) and shapes.
 */

import type { ArchiyouModules } from '../types';
import type { Material, MaterialProperty, MaterialPropertyKey, MaterialRenderSpec } from './types';
import { MATERIAL_PROPERTY_KEYS } from './types';
import { MM_PER_UNIT } from '../units/UnitConverter';

import materialsDb from './materials.json';

/** Pounds per kilogram, for imperial mass read-out. */
const LB_PER_KG = 2.2046226218;

/** Resolve a bundled texture file to a fetchable URL (Vite emits ./textures/* as assets). */
function textureUrl(filename: string): string | null
{
    try { return new URL(`./textures/${filename}`, import.meta.url).href; }
    catch { return null; }
}

/** Sniff image mime type from the leading magic bytes (files may be PNG or JPEG). */
function sniffMime(b: Uint8Array): string
{
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
    return 'image/png';
}

/** Base64-encode bytes in either Node (Buffer) or the browser/worker (btoa). */
function bytesToBase64(bytes: Uint8Array): string
{
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK)
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
    return btoa(bin);
}

/** Default thickness (mm) below which board faces use the `thinSides` texture. */
export const DEFAULT_THIN_SIDE_THRESHOLD_MM = 25;

/**
 * A material bound to a specific shape. Returned by `shape.material()` (getter).
 * Adds derived calculations that need the shape's geometry (volume).
 */
export class BoundMaterial
{
    readonly material: Material;
    private _manager: MaterialManager;
    private _shape: any; // AnySmartShape — kept loose to avoid a circular import

    constructor(manager: MaterialManager, material: Material, shape?: any)
    {
        this._manager = manager;
        this.material = material;
        this._shape = shape;
    }

    get name(): string { return this.material.name; }
    get group(): string { return this.material.group; }

    /** Density as a {value,unit} in the active unit system. */
    density(): MaterialProperty | undefined { return this._manager.property(this.material, 'density'); }

    /** Any property, converted to the active unit system where possible. */
    property(key: MaterialPropertyKey): MaterialProperty | undefined
    {
        return this._manager.property(this.material, key);
    }

    /** Raw underlying property (canonical SI), unconverted. */
    raw(key: MaterialPropertyKey): MaterialProperty | undefined
    {
        return this.material[key] as MaterialProperty | undefined;
    }

    /**
     * Mass of the bound shape in the active unit system (kg metric / lb imperial).
     * Requires a solid shape with a volume() method.
     */
    mass(): number | undefined
    {
        if (!this._shape || typeof this._shape.volume !== 'function')
        {
            console.warn(`Material::mass(): material '${this.name}' is not bound to a solid shape`);
            return undefined;
        }
        const volumeModelUnits = this._shape.volume();
        return this._manager.massFor(this.material, volumeModelUnits);
    }

    /** Alias of mass() — the colloquial "weight" (a mass read-out, not a force). */
    weight(): number | undefined { return this.mass(); }

    /** Multi-line, human readable read-out (used for console pretty-print). */
    describe(): string { return this._manager.describe(this.material); }

    toString(): string { return this.describe(); }

    // Node console pretty-print
    [Symbol.for('nodejs.util.inspect.custom')](): string { return this.describe(); }
}

export class MaterialManager
{
    //// SETTINGS ////
    thinSideThresholdMM = DEFAULT_THIN_SIDE_THRESHOLD_MM;
    //// END SETTINGS ////

    _archiyou!: ArchiyouModules;
    private _index = new Map<string, Material>();
    /** Cache of loaded texture images: image path → data URI. */
    private _texCache = new Map<string, string>();

    constructor()
    {
        // use setArchiyou() to init; load the DB immediately so lookups work standalone (tests)
        this.load();
    }

    setArchiyou(ay: ArchiyouModules)
    {
        this._archiyou = ay;
        if (this._index.size === 0) this.load();
    }

    /** (Re)build the name/alias index from the bundled database. */
    load()
    {
        this._index.clear();
        const materials = ((materialsDb as any)?.materials ?? []) as Material[];
        for (const m of materials)
        {
            this._index.set(m.name.toLowerCase(), m);
            for (const a of m.aliases ?? []) this._index.set(a.toLowerCase(), m);
        }
    }

    /** All materials in the database. */
    all(): Material[]
    {
        return [...new Set(this._index.values())];
    }

    /** Look up a material definition by name or alias. */
    get(name: string): Material | null
    {
        if (!name) return null;
        return this._index.get(name.toLowerCase()) ?? null;
    }

    /** Whether a material name/alias is known. */
    has(name: string): boolean { return !!this.get(name); }

    /**
     * Resolve a material by name, optionally bound to a shape so mass/weight
     * calculations work. Warns and returns null on unknown names.
     */
    resolve(name?: string, shape?: any): BoundMaterial | null
    {
        if (!name) return null;
        const m = this.get(name);
        if (!m)
        {
            console.warn(`MaterialManager::resolve(): unknown material '${name}'`);
            return null;
        }
        return new BoundMaterial(this, m, shape);
    }

    /** The active display unit system, from the modeler (defaults metric). */
    private unitSystem(): 'metric' | 'imperial'
    {
        return this._archiyou?.modeler?.unitSystem?.() ?? 'metric';
    }

    /** Millimetres per one model unit (geometry space). */
    private modelUnitMM(): number
    {
        const u = this._archiyou?.modeler?.units?.() ?? 'mm';
        return MM_PER_UNIT[u] ?? 1;
    }

    /**
     * Mass of a volume (given in model-unit³) for a material, presented in the
     * active unit system: kilograms (metric) or pounds (imperial).
     */
    massFor(material: Material, volumeModelUnits: number): number | undefined
    {
        const density = material.density?.value;
        if (density === undefined)
        {
            console.warn(`MaterialManager: material '${material.name}' has no density; cannot compute mass`);
            return undefined;
        }
        // model-unit³ → m³ : (mm per unit / 1000)³ metres per unit, cubed
        const metresPerUnit = this.modelUnitMM() / 1000;
        const volumeM3 = volumeModelUnits * metresPerUnit ** 3;
        const massKg = density * volumeM3; // density is kg/m³
        return this.unitSystem() === 'imperial' ? massKg * LB_PER_KG : massKg;
    }

    /**
     * Return a property in the active unit system. Density is converted
     * kg/m³ ↔ lb/ft³; other properties pass through (their SI units are
     * system-neutral). Missing properties return undefined.
     */
    property(material: Material, key: MaterialPropertyKey): MaterialProperty | undefined
    {
        const p = material[key] as MaterialProperty | undefined;
        if (!p) return undefined;
        if (key === 'density' && this.unitSystem() === 'imperial')
        {
            // 1 kg/m³ = 0.0624279606 lb/ft³
            return { ...p, value: p.value * 0.0624279606, unit: 'lb/ft3' };
        }
        return p;
    }

    /** Build the compact render spec threaded into the meshup GLTF builder. */
    renderSpec(material: Material): MaterialRenderSpec | null
    {
        const viz = material.viz;
        if (!viz) return null;
        return {
            name: material.name,
            pbr: viz.pbr,
            textures: viz.textures as MaterialRenderSpec['textures'],
            thinSideThresholdMM: this.thinSideThresholdMM,
            modelUnitMM: this.modelUnitMM(),
        };
    }

    /**
     * Load a texture image (by its materials.json path, e.g. './textures/x.jpg')
     * and return it as a base64 data URI, cached. Returns null if unavailable.
     */
    async loadTextureDataURI(imagePath: string): Promise<string | null>
    {
        if (this._texCache.has(imagePath)) return this._texCache.get(imagePath)!;
        const filename = imagePath.replace(/^.*[/\\]/, ''); // basename
        const url = textureUrl(filename);
        if (!url) return null;
        try
        {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = new Uint8Array(await res.arrayBuffer());
            const dataUri = `data:${sniffMime(bytes)};base64,${bytesToBase64(bytes)}`;
            this._texCache.set(imagePath, dataUri);
            return dataUri;
        }
        catch (e)
        {
            console.warn(`MaterialManager: could not load texture '${imagePath}': ${(e as Error).message}`);
            return null;
        }
    }

    /**
     * Fill in the base64 `data` for every material texture referenced by the given
     * shapes' render specs, so the GLTF builder can bake them into the GLB. Called
     * from the async export path (Modeler.toGLB). No-op when nothing carries textures.
     */
    async embedTexturesInShapes(shapes: any): Promise<void>
    {
        // Accept a plain array or a SmartShapeCollection (.all()).
        const list: any[] = Array.isArray(shapes)
            ? shapes
            : (typeof shapes?.all === 'function' ? shapes.all() : []);
        for (const shape of list)
        {
            const spec = shape?.style?.material;
            if (!spec || typeof spec !== 'object' || !spec.textures) continue;
            for (const role of ['sides', 'section'] as const)
            {
                const tex = spec.textures[role];
                if (tex?.image && !tex.data)
                {
                    const data = await this.loadTextureDataURI(tex.image);
                    if (data) tex.data = data;
                }
            }
        }
    }

    /** Human-readable, multi-line read-out of a material's known properties. */
    describe(material: Material): string
    {
        const lines: string[] = [];
        lines.push(`Material: ${material.name}${material.group ? ` (${material.group})` : ''}`);
        if (material.aliases?.length) lines.push(`  aliases: ${material.aliases.join(', ')}`);
        if (material.description) lines.push(`  ${material.description}`);
        for (const key of MATERIAL_PROPERTY_KEYS)
        {
            const p = this.property(material, key);
            if (p) lines.push(`  ${key}: ${p.value} ${p.unit}`);
        }
        return lines.join('\n');
    }
}
