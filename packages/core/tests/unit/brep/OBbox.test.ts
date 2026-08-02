import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("Bbox3D", () =>
{
    const b = new brep.Solid().makeBox(100,10,200).rotateZ(10);
    const obb = b.obbox();
    expect(obb.width()).toEqual(10);
    expect(obb.depth()).toEqual(100);
    expect(obb.height()).toEqual(200);
    expect(Array.isArray(obb.corners())).toEqual(true);
    expect(obb.is3D()).toEqual(true);
    expect(obb.is2D()).toEqual(false);
})

test("Bbox2D", () =>
{
    const r = new brep.Face().makePlane(100,10).moveY(-100).rotateZ(30);
    expect(r.obbox().is2D()).toEqual(true);
    expect(r.obbox().depthHalfLine().type).toEqual('Edge');
})
