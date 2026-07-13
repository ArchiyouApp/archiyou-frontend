import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { Modeler } from '../../../src/modeler/Modeler'
import { Annotator } from '../../../src/annotator/Annotator'
import type { ArchiyouModules } from '../../../src/types'

/**
 * DXF export for the Modeler pipeline (SmartSceneNode / SmartShapeCollection).
 * Covers native geometry entities, ALIGNED dimensions, unit header, 2D-only
 * filtering, and structural well-formedness. See src/modeler/DXFExporter.ts.
 */
describe('Modeler DXF export', () =>
{
    let modeler: Modeler
    let annotator: Annotator

    beforeAll(async () =>
    {
        modeler = new Modeler() // mesh kernel, 'mm'
        await modeler.load()

        annotator = new Annotator()
        const modules = { modeler, annotator } as unknown as ArchiyouModules
        modeler.setArchiyou(modules)
        annotator.setArchiyou(modules)
    })

    beforeEach(() =>
    {
        modeler.reset()
        annotator.reset()
    })

    /** Count occurrences of a DXF entity type in the ENTITIES / BLOCKS body. */
    const countEntity = (dxf: string, type: string): number =>
        (dxf.match(new RegExp(`^0\\n${type}\\n`, 'gm')) ?? []).length

    it('emits native geometry entities for 2D shapes', () =>
    {
        modeler.rect(100, 50)          // Rect → LWPOLYLINE (closed)
        modeler.circle(20, [200, 0, 0])  // Circle → CIRCLE
        modeler.arc([300, 0, 0], [320, 20, 0], [340, 0, 0]) // Arc → ARC
        modeler.line([0, 100, 0], [100, 100, 0])            // Line → LINE

        const dxf = modeler.toDXF()
        expect(dxf).not.toBeNull()
        const s = dxf as string

        expect(s).toContain('AC1015')                 // R2000
        expect(countEntity(s, 'LWPOLYLINE')).toBeGreaterThanOrEqual(1)
        expect(countEntity(s, 'CIRCLE')).toBe(1)
        expect(countEntity(s, 'ARC')).toBe(1)
        expect(countEntity(s, 'LINE')).toBeGreaterThanOrEqual(1)
    })

    it('writes ALIGNED DIMENSION entities + baked *D block + DIMSTYLE', () =>
    {
        const line = modeler.line([0, 0, 0], [120, 0, 0])
        ;(line as any).dim()

        const dxf = modeler.toDXF() as string
        expect(dxf).not.toBeNull()

        expect(countEntity(dxf, 'DIMENSION')).toBe(1)
        expect(dxf).toContain('AcDbAlignedDimension')
        expect(dxf).toContain('*D0')      // anonymous dim block
        expect(dxf).toContain('DIMSTYLE') // dimstyle table
        expect(dxf).toContain('AY')       // our dimstyle name
        // The measured value (120) should surface as dimension text.
        expect(dxf).toMatch(/120/)
    })

    it('skips 3D shapes (box) but keeps 2D shapes', () =>
    {
        modeler.rect(100, 100)     // 2D
        modeler.box(50, 50, 50)    // 3D → skipped

        const dxf = modeler.toDXF() as string
        expect(dxf).not.toBeNull()
        expect(countEntity(dxf, 'LWPOLYLINE')).toBeGreaterThanOrEqual(1)
        // A box would only ever appear as 3DFACE/MESH/POLYLINE — none of which we emit.
        expect(countEntity(dxf, '3DFACE')).toBe(0)
    })

    it('sets $INSUNITS from the model unit', () =>
    {
        modeler.units('cm')
        modeler.rect(10, 10)
        const dxf = modeler.toDXF() as string
        // $INSUNITS \n 70 \n 5  (5 = centimeters)
        expect(dxf).toMatch(/\$INSUNITS\n70\n5\n/)
    })

    it('returns null when there is no 2D-on-XY geometry', () =>
    {
        modeler.box(50, 50, 50)
        expect(modeler.toDXF()).toBeNull()
    })

    it('produces a structurally balanced DXF (SECTION/ENDSEC + EOF)', () =>
    {
        modeler.rect(100, 100)
        const dxf = modeler.toDXF() as string
        const sections = (dxf.match(/^0\nSECTION\n/gm) ?? []).length
        const endsecs = (dxf.match(/^0\nENDSEC\n/gm) ?? []).length
        expect(sections).toBe(endsecs)
        expect(sections).toBeGreaterThanOrEqual(4) // HEADER, TABLES, BLOCKS, ENTITIES, OBJECTS
        expect(dxf.trimEnd().endsWith('EOF')).toBe(true)
    })

    it('SmartShapeCollection.toDXF() exports its own shapes', () =>
    {
        const col = modeler.collection(modeler.rect(40, 40), modeler.circle(10, [100, 0, 0]))
        const dxf = (col as any).toDXF() as string
        expect(dxf).not.toBeNull()
        expect(countEntity(dxf, 'CIRCLE')).toBe(1)
        expect(countEntity(dxf, 'LWPOLYLINE')).toBeGreaterThanOrEqual(1)
    })
})
