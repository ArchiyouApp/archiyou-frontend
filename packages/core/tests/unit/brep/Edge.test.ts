import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("Edge OC", () =>
{
    expect(brep.Edge.prototype._oc).not.toBeNull();
})

test("Edge Basics", () =>
{
    // Basics: Line Edge
    const l = new brep.Edge().makeLine([0,0],[100,0]);
    expect(l.type).toEqual('Edge');
    expect(l.edgeType()).toEqual('Line');
    expect(l.toWire().type).toEqual('Wire');
    expect(l.start().toArray()).toEqual([0,0,0]);
    expect(l.end().toArray()).toEqual([100,0,0]);
    expect(l.is2DXY()).toEqual(true);
    expect(l.isCircular()).toEqual(false);
    expect(l.length()).toEqual(100);
    expect(l.center().toArray()).toEqual([50,0,0]);

    // Circle Edge
    const radius = 100;
    const c = new brep.Edge().makeCircle(radius);
    expect(c.type).toEqual('Edge');
    expect(c.edgeType()).toEqual('Circle');
    expect(c.length()).toEqual(brep.roundToTolerance(radius*Math.PI*2));
    expect(Math.round(c.bbox().width())).toEqual(200);

    // Arc Edge
    // TODO

})


test("Edge Advanced", () =>
{
    // ExtendTo Line to Plane
    const l = new brep.Edge().makeLine([0,0,0],[0,0,100])
    const pl = new brep.Face().makePlane(3000,3000).moveZ(-500)
    l.extendTo(pl)
    expect(l.start().toArray()).toEqual([0,0,-500]);

    // ExtendTo Line to Solid
    const l2 = new brep.Edge().makeLine([0,0,10],[0,0,200]);
    const pl2 = new brep.Solid().makeBox(2000,2000).moveZ(-1000);
    l2.extendTo(pl2);
    expect(l2.start().toArray()).toEqual([0,0,0]);

    // extendTo Arc to Line
    const a = new brep.Edge().makeArc([0,0],[100,50],[200,0]);
    const ln = new brep.Edge().makeLine([150,0,0],[300,0,0]).moveY(-50);
    a.extendTo(ln);
    expect(a.end().toArray()).toEqual([222.474,-50,0]);
})
