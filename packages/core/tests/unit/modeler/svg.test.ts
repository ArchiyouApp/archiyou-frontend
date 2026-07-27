import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { Modeler } from '../../../src/modeler/Modeler'
import type { ArchiyouModules } from '../../../src/types'

/** SVG export for the Modeler pipeline — see Modeler.toSVG(). */
describe('Modeler SVG export', () =>
{
    let modeler: Modeler

    beforeAll(async () =>
    {
        modeler = new Modeler()
        await modeler.load()
        modeler.setArchiyou({ modeler } as unknown as ArchiyouModules)
    })

    beforeEach(() => { modeler.reset() })

    it('returns null when the scene has no 2D geometry', () =>
    {
        expect(modeler.toSVG()).toBeNull()

        modeler.box(10, 10, 10)
        expect(modeler.toSVG()).toBeNull()
    })

    it('exports 2D shapes as an SVG document', () =>
    {
        modeler.rect(10, 20)

        const svg = modeler.toSVG() as string
        expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
        expect(svg).toContain('viewBox=')
        expect(svg.trim().endsWith('</svg>')).toBe(true)
    })
})
