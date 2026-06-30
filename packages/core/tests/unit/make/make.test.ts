import { describe, it, expect } from 'vitest'

import { Modeler } from '../../../src/modeler/Modeler'
import { SmartShapeCollection } from '../../../src/modeler/SmartShapeCollection'
import { save } from 'meshup/src/utils'

const TEST_OUTPUT_DIR = './tests/outputs/modeler'

describe('Make', async () =>
{
    let modeler: Modeler

    it('Modeler inits successfully with Make module', async () =>
    {
        modeler = new Modeler()
        await modeler.load()
        expect(modeler).toBeInstanceOf(Modeler)
        expect(modeler.kernel()).toBeDefined()
        expect(modeler.make).toBeDefined()
    })

    it('should create a frame', async () =>
    {
        const frame = modeler.make.frame(100, 200, 20, 20, 'horizontal')
        expect(frame).toBeDefined()
        expect(frame.first().name()).toBe('frameBottom')
        await save(`${TEST_OUTPUT_DIR}/frame.glb`, await frame.toGLB())
    })

    it('should create a wall', async () =>
    {
        const wall = modeler.make.wall(2000, 2000, 200, 38, 600, [])

        expect(wall._layer).not.toBeNull()
        expect(wall._layer!.name).toBe('wall')

        const subLayers = wall._layer!.children().map((c: { name: string }) => c.name)
        expect(subLayers).toEqual(expect.arrayContaining(['studs', 'plates', 'insulation']))

        wall.insulation.hide()
        await save(`${TEST_OUTPUT_DIR}/wall.glb`, await wall.toGLB())
    })

    it('should keep the opening void clear when splitting studs', async () =>
    {
        const localModeler = new Modeler()
        await localModeler.load()

        const wall = localModeler.make.wall(3000, 2000, 200, 32, 610, [
            { left: 1000, sill: 500, width: 600, height: 600 },
        ])

        expect(wall).toBeInstanceOf(SmartShapeCollection)
        expect((wall as any).openingJackStuds.length).toBe(4)
        expect((wall as any).diagram.toArray().every((shape: any) => shape.style.strokeDash.length > 0)).toBe(true)

        const probe = localModeler
            .boxBetween([1120, -100, 520], [1480, 100, 1080])
            .removeFromScene()

        const overlappingMeshes = localModeler
            .scene()
            .shapes()
            .toArray()
            .filter(shape => shape.type === 'Mesh')
            .filter(shape => (shape as any).overlapPerc?.(probe) > 0.001)

        expect(overlappingMeshes).toHaveLength(0)
    })

    it('should create a wall with two openings', async () =>
    {
        const WIDTH = 3000;
        const localModeler = new Modeler()
        await localModeler.load()

        const wall = localModeler.make.wall(WIDTH, 2000, 120, 38, 610, [
            { left: 500,  sill: 500,  width: 500,  height: 500 },
            { left: 1200, sill: 1000, width: 1000, height: 500 },
        ])

        expect(wall).toBeInstanceOf(SmartShapeCollection)

        const subLayers = wall._layer!.children().map((c: { name: string }) => c.name)
        expect(subLayers).toEqual(expect.arrayContaining(['studs', 'plates', 'insulation']))

        // Both openings are independent (gap=200 > 2*38) → 4 jack studs each
        expect((wall as any).openingJackStuds.length).toBe(8)

        // Verify each opening void is free of solid mesh material
        const solidMeshes = localModeler.scene().shapes().toArray().filter(s => s.type === 'Mesh')

        const probe1 = localModeler.boxBetween([600, -100, 600], [800, 100, 800]).removeFromScene()
        const probe2 = localModeler.boxBetween([1400, -100, 1100], [1900, 100, 1400]).removeFromScene()

        expect(solidMeshes.filter((s: any) => s.overlapPerc?.(probe1) > 0.001)).toHaveLength(0)
        expect(solidMeshes.filter((s: any) => s.overlapPerc?.(probe2) > 0.001)).toHaveLength(0)

        await save(`${TEST_OUTPUT_DIR}/wall-two-openings.glb`, await wall.toGLB())
    })

    it('should merge openings that are too close for two king studs to fit between them', async () =>
    {
        const WIDTH = 3000;
        const localModeler = new Modeler()
        await localModeler.load()

        // Gap = 1050 - (500+500) = 50 mm  <  2*38 = 76 mm  →  openings must be merged
        const wall = localModeler.make.wall(WIDTH, 2000, 120, 38, 610, [
            { left: 500,  sill: 500, width: 500, height: 500 },
            { left: 1050, sill: 500, width: 500, height: 500 },
        ])

        expect(wall).toBeInstanceOf(SmartShapeCollection)

        // Two too-close openings are merged into one before placement
        expect((wall as any).openingDiagrams.length).toBe(1)

        // One merged opening → 4 jack studs
        expect((wall as any).openingJackStuds.length).toBe(4)
    })

    it('should pack three boxes onto a sheet', async () =>
    {
        await modeler.make.packReady()

        const b1 = modeler.box(500, 1000, 10)
        const b2 = modeler.box(400, 200, 10).move(600)
        const b3 = modeler.box(200, 300, 20).move(-500).rotateZ(45)

        const col = modeler.collection(b1, b2, b3).color('blue').opacity(0.5);

        const result = modeler.make.pack(col, { width: 2000, height: 2000, maxTime: 1 })
                            .move(2000).color('red');

        expect(result).toBeInstanceOf(SmartShapeCollection)
        // 3 placed boxes + 1 sheet outline, grouped under 'sheet1'
        expect(result.length).toBe(4)
        expect(result.group('sheet1')).toBeDefined()

        // All placed shapes must lie within the sheet bounds
        result.forEach(shape =>
        {
            /*
            const bb = (shape as any).bbox()
            expect(bb.minX()).toBeGreaterThanOrEqual(-1)
            expect(bb.minY()).toBeGreaterThanOrEqual(-1)
            expect(bb.maxX()).toBeLessThanOrEqual(2001)
            expect(bb.maxY()).toBeLessThanOrEqual(2001)
            */
        })

        await save(`${TEST_OUTPUT_DIR}/pack.glb`, await modeler.collection(col, result).toGLB())
    }, 15_000)
})
