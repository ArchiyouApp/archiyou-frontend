import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("Selectors Basics", () =>
{
    const W = 10;
    const H = 20;
    const D = 30;
    const b = new brep.Solid().makeBox(W,D,H);
    // Parallel
    expect(b.select('E|X').length).toEqual(4);
    expect(b.select('E|Z').length).toEqual(4);
    expect(b.select('E|[0,0,1]').length).toEqual(4);
    expect(b.select('E|[1,1,1]')).toEqual(null);

    // Distance Along Axis
    expect(b.select('V>>X').length).toEqual(4);

    // Side Selector
    expect(b.select('F||top').area()).toEqual(W*D);
    expect(b.select('E||top').length).toEqual(4);
    const vr = new brep.Edge().makeLine([0,0],[100,100])
                .select('V||right') as brep.Vertex;
    expect(vr.toArray()).toEqual([100,100,0]);

    expect((new brep.Face().makePlane(100,100).select('V||frontleft') as brep.Vertex).toArray()).toEqual([-50,-50,0]); // Shape with 2D Bbox

    expect((new brep.Edge().makeLine([0,0],[100,0]).select('V>>X') as brep.Vertex).toArray()).toEqual([100,0,0]);
    expect(new brep.Edge().makeLine([0,0],[100,0]).select('V>>Y').length).toEqual(2);

    // TODO: bbox side selectors need to be fixed!

})
