import { describe, it, expect, beforeAll, beforeEach } from 'vitest'

import { Modeler } from '../../../src/modeler/Modeler'
import { Annotator } from '../../../src/annotator/Annotator'
import { DimensionLine } from '../../../src/annotator/AnnotatorDimensionLine'
import type { ArchiyouModules } from '../../../src/types'
import type { DimensionLineData } from '../../../src/annotator/types'

/**
 * Dimension lines: SmartShape.dim() → centralized Annotator.DimensionLine.fromShape().
 * Regression cover for "init(): argument 2 is invalid — received undefined"
 * (calling .dim() with no options).
 */
describe('Dimensions', () =>
{
    let modeler: Modeler
    let annotator: Annotator

    beforeAll(async () =>
    {
        modeler = new Modeler() // mesh kernel, 'mm'
        await modeler.load()

        annotator = new Annotator()
        // Minimal module wiring — the .dim() path only touches modeler + annotator
        const modules = { modeler, annotator } as unknown as ArchiyouModules
        modeler.setArchiyou(modules)
        annotator.setArchiyou(modules)
    })

    beforeEach(() =>
    {
        modeler.reset()
        annotator.reset()
    })

    it('line(...).dim() with NO options works (regression: undefined options)', () =>
    {
        const line = modeler.line([0, 0], [100, 0])

        expect(() => line.dim()).not.toThrow()

        const anns = annotator.getAnnotations()
        expect(anns.length).toBe(1)
        expect(anns[0]).toBeInstanceOf(DimensionLine)
    })

    it('produces correct value, units and point data', () =>
    {
        modeler.line([0, 0], [100, 0]).dim()

        const data = annotator.getAnnotationsData() as DimensionLineData[]
        expect(data.length).toBe(1)

        const d = data[0]
        expect(d.value).toBeCloseTo(100)
        expect(d.units).toBe('mm') // defaulted from the model
        expect(d.start).toHaveLength(3)
        expect(d.end).toHaveLength(3)
        expect(Array.isArray(d.targetStart)).toBe(true)
    })

    it('keeps a diagonal dimension line parallel to the source line', () =>
    {
        modeler.line([0, 0, 0], [100, 100, 0]).dim()

        const data = annotator.getAnnotationsData() as DimensionLineData[]
        expect(data.length).toBe(1)

        const d = data[0]
        const targetDir = [
            d.targetEnd[0] - d.targetStart[0],
            d.targetEnd[1] - d.targetStart[1],
            d.targetEnd[2] - d.targetStart[2],
        ]
        const dimDir = [
            d.end[0] - d.start[0],
            d.end[1] - d.start[1],
            d.end[2] - d.start[2],
        ]
        const offsetStart = [
            d.start[0] - d.targetStart[0],
            d.start[1] - d.targetStart[1],
            d.start[2] - d.targetStart[2],
        ]
        const offsetEnd = [
            d.end[0] - d.targetEnd[0],
            d.end[1] - d.targetEnd[1],
            d.end[2] - d.targetEnd[2],
        ]

        expect(dimDir[0]).toBeCloseTo(targetDir[0], 6)
        expect(dimDir[1]).toBeCloseTo(targetDir[1], 6)
        expect(dimDir[2]).toBeCloseTo(targetDir[2], 6)

        expect(offsetStart[0]).toBeCloseTo(offsetEnd[0], 6)
        expect(offsetStart[1]).toBeCloseTo(offsetEnd[1], 6)
        expect(offsetStart[2]).toBeCloseTo(offsetEnd[2], 6)

        const dot = targetDir[0] * offsetStart[0]
            + targetDir[1] * offsetStart[1]
            + targetDir[2] * offsetStart[2]
        expect(dot).toBeCloseTo(0, 6)
    })

    it('computes a diagonal planar offset vector before export', () =>
    {
        const dl = modeler.line([0, 0, 0], [100, 100, 0]).dim() as DimensionLine

        expect(dl.targetDir().toArray()).toEqual([100, 100, 0])
        expect(String((dl as unknown as { _calculatePoint: Function })._calculatePoint)).toContain('planarLength')

        const offsetComponents = (dl as unknown as {
            _resolveOffsetComponents(): [number, number, number]
        })._resolveOffsetComponents()

        expect(offsetComponents[0]).toBeCloseTo(Math.SQRT1_2, 6)
        expect(offsetComponents[1]).toBeCloseTo(-Math.SQRT1_2, 6)
        expect(offsetComponents[2]).toBeCloseTo(0, 6)
    })

    it('accepts an explicit options object', () =>
    {
        const dl = modeler.line([0, 0], [50, 0]).dim({ units: 'cm', roundDecimals: 1 }) as DimensionLine

        expect(dl).toBeInstanceOf(DimensionLine)
        expect((dl.toData() as DimensionLineData).units).toBe('cm')
        expect(annotator.getAnnotations().length).toBe(1)
    })

    it('returns the same DimensionLine instance for a single Edge/Curve', () =>
    {
        const dl = modeler.line([0, 0], [10, 0]).dim()
        expect(dl).toBe(annotator.getAnnotations()[0])
    })

    it('a mesh body (box) dimensions its bounding box (no empty placeholder)', () =>
    {
        const result = modeler.box(20, 30, 40).dim()

        const anns = annotator.getAnnotations()
        // width/depth/height → 3 lines, and never the empty placeholder
        expect(anns.length).toBe(3)
        expect(Array.isArray(result)).toBe(true)
        expect((result as DimensionLine[]).length).toBe(3)

        const values = (annotator.getAnnotationsData() as DimensionLineData[])
            .map(d => Math.round(Number(d.value)))
            .sort((a, b) => a - b)
        expect(values).toEqual([20, 30, 40])
    })

    it('multiple .dim() calls accumulate on the annotator', () =>
    {
        modeler.line([0, 0], [10, 0]).dim()
        modeler.line([0, 0], [0, 20]).dim()
        expect(annotator.getAnnotations().length).toBe(2)
    })

    it('annotator.reset() clears annotations', () =>
    {
        modeler.line([0, 0], [10, 0]).dim()
        expect(annotator.getAnnotations().length).toBe(1)
        annotator.reset()
        expect(annotator.getAnnotations().length).toBe(0)
    })
})
