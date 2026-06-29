import * as brep from '../../../src/modeler/brep/index'

import { test, beforeAll, expect } from 'vitest'

console.geom = console.log;

beforeAll(async () => { await brep.init() });

test("Sketch Relative", () =>
{
    let w = new brep.Sketch('left')
    .lineTo(100,100)
    .lineTo('100<<-90')
    .lineTo('-100', '+0')
    .lineTo('200<<45')
    .lineTo('100<<-90')
    .arcTo(['+0','+40'],['+100', '+100'])
    .importSketch();

    expect(Math.round(w.length())).toEqual(833);
})
