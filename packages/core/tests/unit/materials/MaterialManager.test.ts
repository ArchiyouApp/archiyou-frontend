import { describe, it, expect } from 'vitest'

import { MaterialManager } from '../../../src/materials/MaterialManager'
import { rangeFor } from '../../../src/materials/ranges'
import { MATERIAL_PROPERTY_KEYS } from '../../../src/materials/types'
import type { ArchiyouModules } from '../../../src/types'

/** Minimal modeler stub exposing the unit accessors MaterialManager reads. */
function makeManager(system: 'metric' | 'imperial' = 'metric', unit = 'mm'): MaterialManager
{
    const mgr = new MaterialManager()
    mgr.setArchiyou({
        modeler: { unitSystem: () => system, units: () => unit },
    } as unknown as ArchiyouModules)
    return mgr
}

/** A fake solid with a fixed volume (in model units³). */
function fakeShape(volume: number)
{
    return { volume: () => volume }
}

describe('MaterialManager', () =>
{
    describe('lookup & aliases', () =>
    {
        it('resolves by canonical name', () =>
        {
            const mgr = makeManager()
            expect(mgr.get('douglas')?.name).toBe('douglas')
            expect(mgr.get('DOUGLAS')?.name).toBe('douglas') // case-insensitive
        })

        it('resolves by alias', () =>
        {
            const mgr = makeManager()
            expect(mgr.get('multiplex')?.name).toBe('plywood')
            expect(mgr.get('aluminium')?.name).toBe('aluminum')
        })

        it('returns null / warns on unknown', () =>
        {
            const mgr = makeManager()
            expect(mgr.get('unobtainium')).toBeNull()
            expect(mgr.resolve('unobtainium')).toBeNull()
        })
    })

    describe('property values fall within plausible physical ranges', () =>
    {
        const mgr = makeManager()
        for (const mat of mgr.all())
        {
            it(`${mat.name} has in-range properties`, () =>
            {
                for (const key of MATERIAL_PROPERTY_KEYS)
                {
                    const p = mat[key]
                    if (!p) continue
                    const range = rangeFor(key, mat.group)
                    if (!range) continue
                    expect(p.value, `${mat.name}.${key}=${p.value} out of [${range.min},${range.max}]`)
                        .toBeGreaterThanOrEqual(range.min)
                    expect(p.value).toBeLessThanOrEqual(range.max)
                }
            })
        }

        it('every material with a numeric property cites a source', () =>
        {
            for (const mat of mgr.all())
                for (const key of MATERIAL_PROPERTY_KEYS)
                    if (mat[key]) expect(mat[key]!.source, `${mat.name}.${key}`).toBeTruthy()
        })
    })

    describe('mass / weight calculation', () =>
    {
        it('computes kg for a 1m³ solid in metric (mm units)', () =>
        {
            const mgr = makeManager('metric', 'mm')
            // 1 m³ = 1e9 mm³ ; concrete 2400 kg/m³ → 2400 kg
            const mat = mgr.get('concrete')!
            expect(mgr.massFor(mat, 1e9)).toBeCloseTo(2400, 3)
        })

        it('bound shape .mass()/.weight() agree', () =>
        {
            const mgr = makeManager('metric', 'mm')
            // douglas 530 kg/m³, beam 100 x 100 x 2000 mm = 2e7 mm³ = 0.02 m³ → 10.6 kg
            const bound = mgr.resolve('douglas', fakeShape(100 * 100 * 2000))!
            expect(bound.mass()).toBeCloseTo(10.6, 3)
            expect(bound.weight()).toBeCloseTo(bound.mass()!, 6)
        })

        it('presents pounds in imperial mode', () =>
        {
            // model unit is inches in imperial; a 1 ft³ cube = 12³ inch³
            const mgr = makeManager('imperial', 'inch')
            const mat = mgr.get('steel')! // 7850 kg/m³
            const massLb = mgr.massFor(mat, 12 ** 3) // 1 ft³
            // 1 ft³ steel ≈ 222.3 kg → ~490 lb
            expect(massLb).toBeGreaterThan(480)
            expect(massLb).toBeLessThan(500)
        })

        it('returns undefined for a shape without volume()', () =>
        {
            const mgr = makeManager()
            const bound = mgr.resolve('steel', {} as any)!
            expect(bound.mass()).toBeUndefined()
        })
    })

    describe('property read-out unit conversion', () =>
    {
        it('converts density to lb/ft³ in imperial', () =>
        {
            const metric = makeManager('metric')
            const imperial = makeManager('imperial')
            const steel = metric.get('steel')!
            expect(metric.property(steel, 'density')!.unit).toBe('kg/m3')
            const imp = imperial.property(imperial.get('steel')!, 'density')!
            expect(imp.unit).toBe('lb/ft3')
            expect(imp.value).toBeCloseTo(7850 * 0.0624279606, 2) // ≈ 490 lb/ft³
        })
    })

    describe('render spec', () =>
    {
        it('builds a spec with pbr and textures for a wood material', () =>
        {
            const mgr = makeManager('metric', 'mm')
            const spec = mgr.renderSpec(mgr.get('douglas')!)!
            expect(spec.name).toBe('douglas')
            expect(spec.pbr?.color).toBeTruthy()
            expect(spec.textures?.section).toBeTruthy()
            expect(spec.modelUnitMM).toBe(1)
            expect(spec.thinSideThresholdMM).toBe(25)
        })
    })
})
