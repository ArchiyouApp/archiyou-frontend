import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("toStringOutputs", () =>
{
    expect(new brep.Vertex(0).toString()).toEqual('<Vertex position="[0,0,0]">');
    expect(new brep.Edge().makeLine([0,0,0],[100,0,0]).toString()).toEqual('<Edge:Line start="[0,0,0]" end="[100,0,0]">');
    expect(new brep.Face().makeCircle(50).toString()).toEqual('<Face:Planar numVertices="1" numEdges="1">');
    expect(new brep.Face().makePlane().toString()).toEqual('<Face:Planar numVertices="4" numEdges="4">');
});
