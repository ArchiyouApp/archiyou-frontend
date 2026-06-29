import { describe, it, expect, beforeEach } from 'vitest'
import { Modeler } from '../../../src/modeler/Modeler'
import { SmartShapeCollection } from '../../../src/modeler/SmartShapeCollection'

describe('scene-decorator smoke', () =>
{
    let m: Modeler
    beforeEach(async () => { m = new Modeler(); await m.load() })

    const inScene = (s: any) => m.all().toArray().includes(s)

    it('@sceneReplace: curve.extrude detaches self, adds SmartMesh', () =>
    {
        const c = m.circle(20)
        expect(inScene(c)).toBe(true)
        const mesh = (c as any).extrude(10)
        expect(mesh.constructor.name).toBe('SmartMesh')
        expect(inScene(mesh)).toBe(true)     // result added
        expect(inScene(c)).toBe(false)       // original detached
    })

    it('@sceneReplace: polygon.extrude → SmartMesh in scene', () =>
    {
        const p = m.polygon([[0,0,0],[50,0,0],[50,50,0],[0,50,0]])
        const mesh = (p as any).extrude(10)
        expect(mesh.constructor.name).toBe('SmartMesh')
        expect(inScene(mesh)).toBe(true)
        expect(inScene(p)).toBe(false)
    })

    it('@toSmart: polygon.toMesh wraps, no scene mutation', () =>
    {
        const p = m.polygon([[0,0,0],[50,0,0],[50,50,0],[0,50,0]])
        const before = m.all().length
        const mesh = (p as any).toMesh()
        expect(mesh.constructor.name).toBe('SmartMesh')
        expect(m.all().length).toBe(before)  // pure: no scene change
        expect(inScene(p)).toBe(true)
    })

    it('@sceneAdd: mesh.select wraps faces into SmartShapeCollection in scene', () =>
    {
        const box = m.box(40, 40, 40) as any
        const sel = box.select('F||top')
        expect(sel).toBeInstanceOf(SmartShapeCollection)
        sel.toArray().forEach((s: any) => expect(s.isShapeClass?.()).toBe(true))
    })

    it('@sceneLayer: mesh.elevation puts curves on elevation layer, keeps original', () =>
    {
        const box = m.box(40, 40, 40) as any
        const before = inScene(box)
        const elev = box.elevation('front')
        expect(elev).toBeTruthy()
        expect(inScene(box)).toBe(before)    // original kept
        const layer = m.scene().find('elevation')
        expect(layer).toBeTruthy()
        expect((layer as any).shapes().length).toBeGreaterThan(0)
    })

    it('@toSmart on collection: box.row(3) → SmartShapeCollection of SmartMesh', () =>
    {
        const col = (m.box(20,20,20) as any).row(3, 10)
        expect(col).toBeInstanceOf(SmartShapeCollection)
        expect(col.length).toBe(3)
        col.toArray().forEach((s: any) => expect(s.constructor.name).toBe('SmartMesh'))
    })

    it('regression: planeBetween renders to GLTF', async () =>
    {
        m.planeBetween([0,0,0],[100,100,0])
        const g = await (m as any).toGLTF()
        expect(typeof g).toBe('string')
        expect(g.length).toBeGreaterThan(100)
    })
})
