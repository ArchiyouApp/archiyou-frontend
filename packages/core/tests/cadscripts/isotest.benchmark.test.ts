/**
 * Hidden-line-removal performance comparison, driven by the `isotest` script.
 *
 * `isotest` exists precisely because its author was chasing HLR problems — its
 * comments name them: "big-small ortho contact => dropped seperating edge". Its
 * geometry cases are therefore the right benchmark for the alternative solvers,
 * so they are rebuilt here and each is projected under every strategy.
 *
 * The script is inlined below rather than living in tests/cadscripts/scripts/,
 * which is for application-like scripts: this one is a test fixture, and it is
 * only meaningful next to the cases it drives.
 *
 * Two things come out of this: a wall-clock table per geometry per strategy,
 * and one SVG per combination written to ./svgs/ at the repo root so the
 * drawings can be compared side by side.
 *
 * Timing note: each case is projected once per strategy after a warm-up pass,
 * and the geometry is rebuilt per strategy so no projection benefits from a
 * cache the previous one filled.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, it, expect, beforeAll } from 'vitest'

import { Modeler } from '../../src/modeler/Modeler'
import type { RunnerScriptExecutionRequest } from '../../src/runner/types'
import { Runner } from '../../src/runner/Runner'

type Strategy = 'raycast' | 'exact' | 'clip' | 'painter'
const STRATEGIES: Strategy[] = ['raycast', 'exact', 'clip', 'painter']

/**
 * The `isotest` script, verbatim from the scripts database
 * (version dd265ba4-af4d-4bbb-8269-3aec191af37d, author `archiyou`,
 * updated 2026-07-27). Its own comments record the HLR defects it was written
 * to demonstrate; the CASES below rebuild the same geometry so each one can be
 * projected under every strategy.
 */
const ISOTEST_SCRIPT = String.raw`
box().iso().move(-400)

// stack some boxes

b1 = box(100,100,10);
c = b1.replicate($NUM, (s,i ) => s.move(0,0,10*i))
c.merge().iso().move(200); // OK
iso = c.iso().move(200,400);
modeler.scene().add(c.isoTest().move(200,600));


// another stack like in art crate
bigbox = box(400, 200,10).move(0,-300);
sm = box(5,200, 5).align(bigbox, 'leftfrontbottom', 'leftfronttop')

c2 = collection(bigbox,sm);
c2.merge().iso([1,1,1]).move(500,-400); // big-small ortho contact => dropped seperating edge
c2.iso([1,1,1], false, false, 100, 10).move(500,-800);
//modeler.scene().add(c2.isoTest([1,1,1], false, false, 100, 10).move(500,-1400));


// beams
bs = box(5,500,20).move(500).row(5,45)

bhf = boxbetween(
    bs.bbox().corner('leftfrontbottom'),
    bs.bbox().corner('rightfrontop').moveY(-10)
)
bhb = bhf.copy().mirrorY();
floor = collection(bs,bhf, bhb);
floor.merge().iso([-1,-1,1], false, false, 100, 40).move(1100);
floor.iso([-1,-1,1], false, false, 200, 10).move(1500);
//modeler.scene().add(floor.isoTest([-1,-1,1], false, false, 200, 10).move(2000));

// grid of boxes
grid = box().grid(3,3,3, [150,150,150]).move(-1000);
grid.iso().move(-1000,1000)
//modeler.scene().add(
//  grid.isoTest().move(-1000,2000));
`

/** Repo root, two levels up from packages/core. */
const SVG_DIR = path.resolve('../../svgs')

/** `$NUM` in the script — how many slabs the stack case gets. */
const STACK_COUNT = 5

interface Case
{
    name: string
    /** Rebuilt per measurement so nothing is reused between strategies. */
    build: (m: Modeler) => any
    cam: [number, number, number]
    samples: number
    featureAngle: number
}

/** The geometry cases from isotest, in the order the script builds them. */
const CASES: Case[] = [
    {
        name: 'single-box',
        build: (m) => m.collection(m.box()),
        cam: [-1, -1, 1], samples: 16, featureAngle: 10,
    },
    {
        name: 'stack-merged',
        // c.merge().iso() — one solid, the shape the merged path is happiest with
        build: (m) => m.collection(
            (m.box(100, 100, 10) as any).replicate(STACK_COUNT, (s: any, i: number) => s.move(0, 0, 10 * i)).merge()),
        cam: [-1, -1, 1], samples: 16, featureAngle: 10,
    },
    {
        name: 'stack-collection',
        // c.iso() — the same stack left as separate shapes, all faces touching
        build: (m) => (m.box(100, 100, 10) as any)
            .replicate(STACK_COUNT, (s: any, i: number) => s.move(0, 0, 10 * i)),
        cam: [-1, -1, 1], samples: 16, featureAngle: 10,
    },
    {
        name: 'big-small-contact',
        // The script's own annotated failure: a thin batten sitting on a wide
        // slab, whose separating edge the merged path drops.
        build: (m) =>
        {
            const bigbox = m.box(400, 200, 10).move(0, -300)
            const sm = (m.box(5, 200, 5) as any).align(bigbox, 'leftfrontbottom', 'leftfronttop')
            return m.collection(bigbox, sm)
        },
        cam: [1, 1, 1], samples: 100, featureAngle: 10,
    },
    {
        name: 'beam-floor',
        build: (m) =>
        {
            const bs = (m.box(5, 500, 20).move(500) as any).row(5, 45)
            const bhf = m.boxBetween(
                (bs as any).bbox().corner('leftfrontbottom'),
                (bs as any).bbox().corner('rightfrontop').moveY(-10),
            )
            const bhb = (bhf as any).copy().mirrorY()
            return m.collection(bs, bhf, bhb)
        },
        cam: [-1, -1, 1], samples: 200, featureAngle: 10,
    },
    {
        name: 'grid-3x3x3',
        build: (m) => (m.box() as any).grid(3, 3, 3, [150, 150, 150]).move(-1000),
        cam: [-1, -1, 1], samples: 16, featureAngle: 10,
    },
]

interface Measurement
{
    ms: number | null
    curves: number
    note?: string
}

const results: Record<string, Record<string, Measurement>> = {}

describe('isotest: HLR strategy performance', () =>
{
    let modeler: Modeler

    beforeAll(async () =>
    {
        modeler = await new Modeler().load()
        fs.mkdirSync(SVG_DIR, { recursive: true })
    })

    it('runs the isotest script end to end', async () =>
    {
        // The script still executes — the strategy work below is meaningless if
        // the source case no longer runs.
        const runner = await new Runner().load()
        const request: RunnerScriptExecutionRequest = {
            kernel: 'mesh',
            script: { name: 'isotest', code: ISOTEST_SCRIPT, params: {} },
            outputs: ['default/model/gltf'],
        }
        const result = await runner.execute(request)
        expect(result.status, result.errors?.[0]?.message ?? '').toBe('success')
    }, 600_000)

    CASES.forEach((c) =>
    {
        it(`projects "${c.name}" under every strategy`, async () =>
        {
            results[c.name] ??= {}

            for (const strategy of STRATEGIES)
            {
                // Warm-up, so the first strategy measured is not the one that
                // pays for lazily-built kernel state.
                try { project(modeler, c, strategy) } catch { /* measured below */ }

                let measurement: Measurement
                try
                {
                    const t0 = performance.now()
                    const projected = project(modeler, c, strategy)
                    const ms = performance.now() - t0

                    measurement = {
                        ms: Math.round(ms * 10) / 10,
                        curves: projected.length ?? 0,
                    }
                    fs.writeFileSync(
                        path.join(SVG_DIR, `${c.name}.${strategy}.svg`),
                        projected.toSVG(),
                    )
                }
                catch (e: any)
                {
                    // The per-shape strategies decline geometry they cannot
                    // draw exactly. That is a result worth recording, not a
                    // test failure — it is the honest answer for that case.
                    measurement = { ms: null, curves: 0, note: shortReason(e) }
                }
                results[c.name][strategy] = measurement
            }

            // Every case must at least be drawable by the two general solvers.
            expect(results[c.name].raycast.ms, 'raycast failed').not.toBeNull()
            expect(results[c.name].exact.ms, 'exact failed').not.toBeNull()
        }, 900_000)
    })

    it('reports the comparison', () =>
    {
        const lines: string[] = []
        const pad = (s: string, n: number) => s.padEnd(n)
        const cell = (m: Measurement | undefined) =>
            !m ? '—'
            : m.ms === null ? `n/a (${m.note})`
            : `${m.ms} ms / ${m.curves}`

        lines.push('')
        lines.push('HLR strategy comparison — time / curve count, per geometry')
        lines.push('='.repeat(96))
        lines.push(pad('geometry', 20) + STRATEGIES.map(s => pad(s, 19)).join(''))
        lines.push('-'.repeat(96))
        for (const c of CASES)
        {
            lines.push(pad(c.name, 20)
                + STRATEGIES.map(s => pad(cell(results[c.name]?.[s]), 19)).join(''))
        }
        lines.push('='.repeat(96))
        lines.push(`SVGs written to ${SVG_DIR}`)

        const report = lines.join('\n')
        console.info(report)
        fs.writeFileSync(path.join(SVG_DIR, 'performance.txt'), report + '\n')
        expect(Object.keys(results).length).toBe(CASES.length)
    })
})

function project(modeler: Modeler, c: Case, strategy: Strategy): any
{
    const shapes = c.build(modeler)
    // _iso is the undecorated projection: it does not add to the scenegraph,
    // so repeated measurements do not grow the scene and skew later ones.
    return shapes._iso(c.cam, false, false, c.samples, c.featureAngle, { strategy })
}

function shortReason(e: any): string
{
    const msg = String(e?.message ?? e)
    const m = msg.match(/\(([^)]+)\)/)
    return m ? m[1] : msg.slice(0, 60)
}
