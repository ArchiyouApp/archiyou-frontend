import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("Obj", () =>
{
    const b = new brep.Solid().makeBox()
    // Basic ops
    expect(b._obj).toBeUndefined();
    b.addToScene()
    expect(b._obj).not.toBeNull();
    // Styling
    b.color('green');
    expect(b.object()._style.point.color).toEqual(32768);
    expect(b.object()._style.line.color).toEqual(32768);
    expect(b.object()._style.fill.color).toEqual(32768);
    b.lineWidth(10);
    expect(b.object()._style.line.width).toEqual(10);
    b.dashed();
    expect(b.object()._style.line.dashed).toEqual(true);
    // Override
    b.color('blue')
    expect(b.object()._style.point.color).toEqual(255);
    // Obj naming
    b.name('mybox')
    expect(b.name()).toEqual('mybox');
})
