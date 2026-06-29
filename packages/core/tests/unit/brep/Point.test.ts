import * as brep from '../../../src/modeler/brep/index'

import { test, expect } from 'vitest'

test("Point test", () =>
{
    let point = new brep.Point();
    expect(point.toArray()).toEqual([0,0,0])
})
