/**
 * CodeMirror autocompletion source for the Archiyou Modeler API.
 *
 * Provides completions for:
 *  - top-level Modeler functions (box, sphere, line, sketch, …)
 *  - instance methods on the shapes they return (SmartSolid, SmartMesh, SmartCurve, …)
 */

import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';

/* ------------------------------------------------------------------ */
/*  Type descriptors                                                    */
/* ------------------------------------------------------------------ */

interface MethodInfo {
  label: string;
  detail: string;
  info?: string;
  type: 'function' | 'property';
}

interface ShapeClassInfo {
  label: string;
  detail: string;
  statics?: MethodInfo[];
  members: MethodInfo[];
}

/* ------------------------------------------------------------------ */
/*  Modeler top-level global functions                                  */
/* ------------------------------------------------------------------ */

const modelerFunctions: MethodInfo[] = [
  // Meta
  { label: 'mode',          detail: '(m?): ModelMode',                                           type: 'function', info: 'Get/set model mode: mesh or brep' },
  { label: 'units',         detail: '(u?): ModelUnits',                                          type: 'function', info: 'Get/set model units (e.g. mm, cm, inch)' },

  // Pointlikes
  { label: 'point',         detail: '(xp?, y?, z?): Point',                                      type: 'function', info: 'Creates a 2D/3D Point' },
  { label: 'vector',        detail: '(xp?, y?, z?): Vector',                                     type: 'function', info: 'Creates a 2D/3D Vector' },
  { label: 'vertex',        detail: '(xp?, y?, z?): Vertex',                                     type: 'function', info: 'Creates a Vertex' },

  // Linear shapes
  { label: 'line',          detail: '(start, end): SmartCurve | SmartEdge',                      type: 'function', info: 'Creates a Line' },
  { label: 'arc',           detail: '(start, mid, end): SmartCurve | SmartEdge',                 type: 'function', info: 'Creates an Arc through start, mid and end' },
  { label: 'spline',        detail: '(...points): SmartCurve | SmartEdge',                       type: 'function', info: 'Creates a Spline through given Points' },
  { label: 'polyline',      detail: '(points, ...args): SmartCurve | SmartWire',                 type: 'function', info: 'Creates a Polyline through multiple Points' },
  { label: 'spiral',        detail: '(...args): SmartWire',                                      type: 'function', info: '2D Spiral — brep only' },
  { label: 'helix',         detail: '(...args): SmartWire',                                      type: 'function', info: 'Helix — brep only' },

  // Closed 2D shapes
  { label: 'rect',          detail: '(width?, depth?, center?): SmartCurve | SmartWire',         type: 'function', info: 'Creates a rectangular Curve' },
  { label: 'rectBetween',   detail: '(from, to): SmartCurve | SmartFace',                        type: 'function', info: 'Creates a rectangle between two Points' },
  { label: 'circle',        detail: '(radius?, center?): SmartCurve | SmartEdge',                type: 'function', info: 'Creates a circular Curve' },
  { label: 'plane',         detail: '(...args): SmartFace',                                      type: 'function', info: 'Creates a planar Face — brep only' },
  { label: 'planeBetween',  detail: '(...args): SmartFace',                                      type: 'function', info: 'Creates a planar Face between two Points — brep only' },
  { label: 'basePlane',     detail: '(...args): SmartFace',                                      type: 'function', info: 'Creates a base plane along a main axis — brep only' },

  // 3D shapes
  { label: 'box',           detail: '(width?, depth?, height?, position?): SmartMesh | SmartSolid',  type: 'function', info: 'Creates a Box shape' },
  { label: 'cube',          detail: '(width?, depth?, height?, position?): SmartMesh | SmartSolid',  type: 'function', info: 'Alias for box()' },
  { label: 'boxBetween',    detail: '(from, to): SmartMesh | SmartSolid',                        type: 'function', info: 'Creates a Box between two Points' },
  { label: 'sphere',        detail: '(radius?, position?): SmartMesh | SmartSolid',              type: 'function', info: 'Creates a Sphere' },
  { label: 'cone',          detail: '(...args): SmartSolid',                                     type: 'function', info: 'Creates a Cone — brep only' },
  { label: 'cylinder',      detail: '(radius?, height?, position?): SmartMesh | SmartSolid',     type: 'function', info: 'Creates a Cylinder' },

  // Sketch & scene
  { label: 'sketch',        detail: '(plane?, yAxis?): Sketch',                                  type: 'function', info: 'Starts a 2D Sketch on a given plane' },
  { label: 'layer',         detail: '(name?): SmartSceneNode',                                   type: 'function', info: 'Creates or activates a named layer' },
  { label: 'layerShapes',   detail: '(): SmartShapeCollection',                                  type: 'function', info: 'Returns all shapes in the active layer' },
  { label: 'all',           detail: '(): SmartShapeCollection',                                  type: 'function', info: 'Returns all shapes in the scene' },
  { label: 'collection',    detail: '(...args): SmartShapeCollection',                           type: 'function', info: 'Creates a SmartShapeCollection' },
  { label: 'select',        detail: '(selectionString): any',                                    type: 'function', info: 'Select shapes by a selection string (sketch/brep only)' },
  { label: 'atVertices',    detail: '(): any',                                                   type: 'function', info: 'Operate at vertices (sketch/brep only)' },

  // Sketch drawing commands (forwarded from active sketch)
  { label: 'moveTo',        detail: '(...coords): this',                                         type: 'function', info: 'Move sketch cursor to position' },
  { label: 'lineTo',        detail: '(...coords): this',                                         type: 'function', info: 'Draw a line to position' },
  { label: 'splineTo',      detail: '(...coords): this',                                         type: 'function', info: 'Draw a spline to position' },
  { label: 'arcTo',         detail: '(mid, end): this',                                          type: 'function', info: 'Draw an arc through mid to end' },
  { label: 'rectTo',        detail: '(...coords): this',                                         type: 'function', info: 'Draw a rectangle to position' },
  { label: 'circleTo',      detail: '(...coords): this',                                         type: 'function', info: 'Draw a circle' },
  { label: 'mirror',        detail: '(dir, pos?): this',                                         type: 'function', info: 'Mirror sketch' },
  { label: 'offset',        detail: '(distance): this',                                          type: 'function', info: 'Offset sketch' },
  { label: 'offsetted',     detail: '(distance): this',                                          type: 'function', info: 'Returns an offset copy' },
  { label: 'fillet',        detail: '(radius, at?): this',                                       type: 'function', info: 'Fillet sketch corners' },
  { label: 'chamfer',       detail: '(distance?, edges?): this',                                 type: 'function', info: 'Chamfer sketch corners' },
  { label: 'thicken',       detail: '(amount, direction?): this',                                type: 'function', info: 'Thicken a face or shell' },
  { label: 'thickened',     detail: '(amount, direction?): this',                                type: 'function', info: 'Returns a thickened copy' },
  { label: 'combine',       detail: '(): this',                                                  type: 'function', info: 'Combine sketch segments' },
  { label: 'close',         detail: '(): this',                                                  type: 'function', info: 'Close sketch' },
  { label: 'importSketch',  detail: '(sketch): this',                                            type: 'function', info: 'Import an existing sketch' },
];

/* ------------------------------------------------------------------ */
/*  Common shape members (Shape base class)                            */
/* ------------------------------------------------------------------ */

const shapeCommonMembers: MethodInfo[] = [
  // Transform
  { label: 'move',          detail: '(vector, ...args): this',       type: 'function' },
  { label: 'moveX',         detail: '(distance): this',              type: 'function' },
  { label: 'moveY',         detail: '(distance): this',              type: 'function' },
  { label: 'moveZ',         detail: '(distance): this',              type: 'function' },
  { label: 'moveTo',        detail: '(to, ...args): this',           type: 'function' },
  { label: 'moveToX',       detail: '(x, pivot?): this',             type: 'function' },
  { label: 'moveToY',       detail: '(y, pivot?): this',             type: 'function' },
  { label: 'moveToZ',       detail: '(z, pivot?): this',             type: 'function' },
  { label: 'rotate',        detail: '(r, ...args): this',            type: 'function' },
  { label: 'rotateX',       detail: '(deg, pivot?): this',           type: 'function' },
  { label: 'rotateY',       detail: '(deg, pivot?): this',           type: 'function' },
  { label: 'rotateZ',       detail: '(deg, pivot?): this',           type: 'function' },
  { label: 'rotateAround',  detail: '(angle, axis?, pivot?): this',  type: 'function' },
  { label: 'scale',         detail: '(factor?, pivot?): this',       type: 'function' },
  { label: 'mirror',        detail: '(dir, pos?): this',             type: 'function' },
  // Info
  { label: 'bbox',          detail: '(): Bbox',                      type: 'function' },
  { label: 'obbox',         detail: '(): OBbox | null',              type: 'function' },
  { label: 'center',        detail: '(): Point',                     type: 'function' },
  { label: 'area',          detail: '(): number',                    type: 'function' },
  { label: 'volume',        detail: '(): number',                    type: 'function' },
  { label: 'length',        detail: '(): number',                    type: 'function' },
  { label: 'is2D',          detail: '(): boolean',                   type: 'function' },
  { label: 'is3D',          detail: '(): boolean',                   type: 'function' },
  { label: 'valid',         detail: '(): boolean',                   type: 'function' },
  // Sub-shapes
  { label: 'vertices',      detail: '(): ShapeCollection',           type: 'function' },
  { label: 'edges',         detail: '(): ShapeCollection',           type: 'function' },
  { label: 'wires',         detail: '(): ShapeCollection',           type: 'function' },
  { label: 'faces',         detail: '(): ShapeCollection',           type: 'function' },
  { label: 'shells',        detail: '(): ShapeCollection',           type: 'function' },
  { label: 'solids',        detail: '(): ShapeCollection',           type: 'function' },
  // Copy / style
  { label: 'copy',          detail: '(): this',                      type: 'function' },
  { label: 'clone',         detail: '(): AnyShape',                  type: 'function' },
  { label: 'color',         detail: '(value): this',                 type: 'function' },
  { label: 'attr',          detail: '(key?, value?): any | this',    type: 'function' },
  { label: 'attribute',     detail: '(key?, value?): any | this',    type: 'function' },
];

/* ------------------------------------------------------------------ */
/*  Per-shape class descriptors                                        */
/* ------------------------------------------------------------------ */

const shapeClasses: ShapeClassInfo[] = [
  {
    label: 'SmartSolid',
    detail: 'brep Solid shape',
    members: [
      ...shapeCommonMembers,
      { label: 'fillet',        detail: '(radius?, at?): this',                       type: 'function' },
      { label: 'filleted',      detail: '(radius?, edges?): SmartSolid',              type: 'function' },
      { label: 'chamfer',       detail: '(distance?, edges?): this',                  type: 'function' },
      { label: 'chamfered',     detail: '(distance?, edges?): SmartSolid',            type: 'function' },
      { label: 'bevel',         detail: '(distance?, edges?): SmartSolid',            type: 'function' },
      { label: 'thicken',       detail: '(amount, direction?): SmartSolid',           type: 'function' },
      { label: 'solidType',     detail: '(): string',                                 type: 'function' },
    ],
  },
  {
    label: 'SmartMesh',
    detail: 'mesh geometry shape',
    members: [
      ...shapeCommonMembers,
      { label: 'union',         detail: '(other: SmartMesh): this',                  type: 'function' },
      { label: 'add',           detail: '(other: SmartMesh): this',                  type: 'function' },
      { label: 'difference',    detail: '(other: SmartMesh): this',                  type: 'function' },
      { label: 'subtract',      detail: '(other: SmartMesh): this',                  type: 'function' },
      { label: 'intersection',  detail: '(other: SmartMesh): this',                  type: 'function' },
      { label: 'hull',          detail: '(): SmartMesh | undefined',                 type: 'function' },
      { label: 'triangulate',   detail: '(): this',                                   type: 'function' },
      { label: 'smooth',        detail: '(lambda, mu, iter, preserveBounds): this',  type: 'function' },
      { label: 'inverse',       detail: '(): this',                                   type: 'function' },
      { label: 'positions',     detail: '(): Array<Point>',                           type: 'function' },
      { label: 'normals',       detail: '(): Array<Vector>',                          type: 'function' },
      { label: 'polygons',      detail: '(): Array<Polygon>',                         type: 'function' },
      { label: 'row',           detail: '(count, spacing, dir?): Collection',         type: 'function' },
      { label: 'grid',          detail: '(cx?, cy?, cz?, spacing?): Collection',      type: 'function' },
      { label: 'toSTLBinary',   detail: '(): Uint8Array | undefined',                 type: 'function' },
      { label: 'toSTLAscii',    detail: '(): string | undefined',                    type: 'function' },
      { label: 'toGLTF',        detail: '(up?): string | undefined',                 type: 'function' },
      { label: 'metadata',      detail: 'Record<string, any>',                        type: 'property' },
    ],
  },
  {
    label: 'SmartCurve',
    detail: 'mesh-mode curve / wire',
    members: [
      ...shapeCommonMembers,
      { label: 'reverse',       detail: '(): this',                                   type: 'function' },
      { label: 'close',         detail: '(): this',                                   type: 'function' },
      { label: 'fillet',        detail: '(radius, at?): this | null',                 type: 'function' },
      { label: 'offset',        detail: '(distance, cornerType?): SmartCurve | null', type: 'function' },
      { label: 'trim',          detail: '(t0, t1): Array<SmartCurve>',                type: 'function' },
      { label: 'split',         detail: '(t): [SmartCurve, SmartCurve] | null',       type: 'function' },
      { label: 'intersect',     detail: '(other): Array<Point> | null',               type: 'function' },
      { label: 'extrude',       detail: '(length, direction?): SmartMesh | null',     type: 'function' },
      { label: 'extend',        detail: '(length, side?): this',                      type: 'function' },
      { label: 'isClosed',      detail: '(): boolean',                                type: 'function' },
      { label: 'isPlanar',      detail: '(): boolean',                                type: 'function' },
      { label: 'start',         detail: '(): Point',                                  type: 'function' },
      { label: 'end',           detail: '(): Point',                                  type: 'function' },
      { label: 'normal',        detail: '(): Vector | null',                           type: 'function' },
      { label: 'tessellate',    detail: '(tol?): Array<Point>',                       type: 'function' },
      { label: 'controlPoints', detail: '(): Array<Point>',                           type: 'function' },
      { label: 'toPolygon',     detail: '(tol?): Polygon | undefined',                type: 'function' },
      { label: 'toMesh',        detail: '(tol?): SmartMesh | undefined',              type: 'function' },
      { label: 'toGLTF',        detail: '(up?): string',                              type: 'function' },
      { label: 'toSVG',         detail: '(plane?): string',                           type: 'function' },
      { label: 'metadata',      detail: 'Record<string, any>',                        type: 'property' },
    ],
  },
  {
    label: 'SmartEdge',
    detail: 'brep Edge',
    members: [
      ...shapeCommonMembers,
      { label: 'reverse',       detail: '(): this',                                   type: 'function' },
      { label: 'extrude',       detail: '(length, direction?): SmartFace | null',     type: 'function' },
      { label: 'extend',        detail: '(length, side?): this',                      type: 'function' },
      { label: 'fillet',        detail: '(radius): this',                             type: 'function' },
      { label: 'isClosed',      detail: '(): boolean',                                type: 'function' },
      { label: 'start',         detail: '(): Point',                                  type: 'function' },
      { label: 'end',           detail: '(): Point',                                  type: 'function' },
    ],
  },
  {
    label: 'SmartWire',
    detail: 'brep Wire',
    members: [
      ...shapeCommonMembers,
      { label: 'reverse',       detail: '(): this',                                   type: 'function' },
      { label: 'close',         detail: '(): this',                                   type: 'function' },
      { label: 'fillet',        detail: '(radius, at?): this',                        type: 'function' },
      { label: 'offset',        detail: '(distance): this',                           type: 'function' },
      { label: 'extrude',       detail: '(length, direction?): SmartFace | null',     type: 'function' },
      { label: 'extend',        detail: '(length, side?): this',                      type: 'function' },
      { label: 'isClosed',      detail: '(): boolean',                                type: 'function' },
      { label: 'start',         detail: '(): Point',                                  type: 'function' },
      { label: 'end',           detail: '(): Point',                                  type: 'function' },
      { label: 'normal',        detail: '(): Vector | null',                           type: 'function' },
    ],
  },
  {
    label: 'SmartFace',
    detail: 'brep Face',
    members: [
      ...shapeCommonMembers,
      { label: 'extrude',       detail: '(length, direction?): SmartSolid | null',    type: 'function' },
      { label: 'thicken',       detail: '(amount, direction?): SmartSolid',           type: 'function' },
      { label: 'flip',          detail: '(): this',                                   type: 'function' },
      { label: 'normal',        detail: '(): Vector',                                 type: 'function' },
    ],
  },
  {
    label: 'SmartShapeCollection',
    detail: 'collection of Smart* shapes',
    members: [
      { label: 'all',           detail: '(): Array<AnySmartShape>',                   type: 'function' },
      { label: 'vertices',      detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'edges',         detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'wires',         detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'faces',         detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'shells',        detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'solids',        detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'extrude',       detail: '(amount?, direction?): SmartShapeCollection', type: 'function' },
      { label: 'fillet',        detail: '(radius, at?): SmartShapeCollection',        type: 'function' },
      { label: 'thicken',       detail: '(amount, direction?): SmartShapeCollection', type: 'function' },
      { label: 'select',        detail: '(selectString): SmartShapeCollection',       type: 'function' },
      { label: 'visible',       detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'find',          detail: '(fn): AnySmartShape | undefined',            type: 'function' },
      { label: 'every',         detail: '(fn): boolean',                              type: 'function' },
      { label: 'area',          detail: '(): number',                                 type: 'function' },
      { label: 'volume',        detail: '(): number',                                 type: 'function' },
      { label: 'lowestType',    detail: '(): string | undefined',                     type: 'function' },
      { label: 'is2D',          detail: '(): boolean',                                type: 'function' },
      { label: 'is3D',          detail: '(): boolean',                                type: 'function' },
      { label: 'project',       detail: '(planeNormal?, all?): SmartShapeCollection', type: 'function' },
      { label: 'elevation',     detail: '(side?, all?): SmartShapeCollection',        type: 'function' },
      { label: 'isometry',      detail: '(viewpoint?, showHidden?): SmartShapeCollection', type: 'function' },
      { label: 'iso',           detail: '(viewpoint?, showHidden?): SmartShapeCollection', type: 'function' },
      { label: 'intersections', detail: '(others): SmartShapeCollection',             type: 'function' },
      { label: 'intersecting',  detail: '(other): SmartShapeCollection',              type: 'function' },
      { label: 'alignByPoints', detail: '(sourcePoints, targetPoints, withScale?): this', type: 'function' },
      { label: 'length',        detail: 'number',                                     type: 'property' },
    ],
  },
  {
    label: 'Sketch',
    detail: '2D sketch on a plane',
    members: [
      { label: 'moveTo',        detail: '(...coords): this',                          type: 'function' },
      { label: 'lineTo',        detail: '(...coords): this',                          type: 'function' },
      { label: 'arcTo',         detail: '(mid, end): this',                           type: 'function' },
      { label: 'polyline',      detail: '(points): this',                             type: 'function' },
      { label: 'curveTo',       detail: '(points): this',                             type: 'function' },
      { label: 'close',         detail: '(): this',                                   type: 'function' },
      { label: 'combine',       detail: '(): this',                                   type: 'function' },
      { label: 'offset',        detail: '(distance): this',                           type: 'function' },
      { label: 'extend',        detail: '(length, side?): this',                      type: 'function' },
      { label: 'rotate',        detail: '(angle, pivot): this',                       type: 'function' },
      { label: 'translate',     detail: '(vecOrX, dy?, dz?): this',                   type: 'function' },
      { label: 'extrude',       detail: '(length): SmartMesh | null',                 type: 'function' },
      { label: 'sweep',         detail: '(path: SmartCurve): SmartMesh | null',       type: 'function' },
      { label: 'loft',          detail: '(other: Sketch): SmartMesh | null',          type: 'function' },
      { label: 'end',           detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'toCurves',      detail: '(): SmartShapeCollection',                   type: 'function' },
      { label: 'copy',          detail: '(): this',                                   type: 'function' },
    ],
  },
  {
    label: 'Point',
    detail: '3D point',
    statics: [
      { label: 'from',          detail: '(x, y?, z?): Point',                         type: 'function' },
    ],
    members: [
      { label: 'x',             detail: 'number',                                     type: 'property' },
      { label: 'y',             detail: 'number',                                     type: 'property' },
      { label: 'z',             detail: 'number',                                     type: 'property' },
      { label: 'copy',          detail: '(): Point',                                  type: 'function' },
      { label: 'move',          detail: '(offset): Point',                            type: 'function' },
      { label: 'distance',      detail: '(to): number',                               type: 'function' },
      { label: 'round',         detail: '(tolerance?): Point',                        type: 'function' },
      { label: 'toArray',       detail: '(): [number, number, number?]',              type: 'function' },
      { label: 'toVector',      detail: '(): Vector',                                 type: 'function' },
      { label: 'toString',      detail: '(): string',                                 type: 'function' },
    ],
  },
  {
    label: 'Vector',
    detail: '3D vector',
    statics: [
      { label: 'from',          detail: '(x, y?, z?): Vector',                        type: 'function' },
    ],
    members: [
      { label: 'x',             detail: 'number',                                     type: 'property' },
      { label: 'y',             detail: 'number',                                     type: 'property' },
      { label: 'z',             detail: 'number',                                     type: 'property' },
      { label: 'length',        detail: '(): number',                                 type: 'function' },
      { label: 'angle',         detail: '(other): number',                            type: 'function' },
      { label: 'abs',           detail: '(): Vector',                                 type: 'function' },
      { label: 'add',           detail: '(other): Vector',                            type: 'function' },
      { label: 'subtract',      detail: '(other): Vector',                            type: 'function' },
      { label: 'scale',         detail: '(scalar): Vector',                           type: 'function' },
      { label: 'normalize',     detail: '(): Vector',                                 type: 'function' },
      { label: 'cross',         detail: '(other): Vector',                            type: 'function' },
      { label: 'dot',           detail: '(other): number',                            type: 'function' },
      { label: 'reverse',       detail: '(): Vector',                                 type: 'function' },
      { label: 'copy',          detail: '(): Vector',                                 type: 'function' },
      { label: 'rotate',        detail: '(axis, angle): Vector',                      type: 'function' },
      { label: 'toPoint',       detail: '(): Point',                                  type: 'function' },
      { label: 'toString',      detail: '(): string',                                 type: 'function' },
    ],
  },
  {
    label: 'Bbox',
    detail: 'axis-aligned bounding box',
    statics: [
      { label: 'fromMesh',      detail: '(m): Bbox',                                  type: 'function' },
    ],
    members: [
      { label: 'min',           detail: '(): Point',                                  type: 'function' },
      { label: 'max',           detail: '(): Point',                                  type: 'function' },
      { label: 'center',        detail: '(): Point',                                  type: 'function' },
      { label: 'size',          detail: '(): Point',                                  type: 'function' },
      { label: 'width',         detail: '(): number',                                 type: 'function' },
      { label: 'depth',         detail: '(): number',                                 type: 'function' },
      { label: 'height',        detail: '(): number',                                 type: 'function' },
      { label: 'is1D',          detail: '(): boolean',                                type: 'function' },
      { label: 'is2D',          detail: '(): boolean',                                type: 'function' },
      { label: 'is3D',          detail: '(): boolean',                                type: 'function' },
    ],
  },
  {
    label: 'OBbox',
    detail: 'oriented bounding box',
    statics: [
      { label: 'fromPoints',    detail: '(points): OBbox',                            type: 'function' },
      { label: 'fromMesh',      detail: '(m): OBbox',                                 type: 'function' },
    ],
    members: [
      { label: 'axes',          detail: '(): [Vector, Vector, Vector]',               type: 'function' },
      { label: 'halfExtents',   detail: '(): [number, number, number]',               type: 'function' },
      { label: 'center',        detail: '(): Point',                                  type: 'function' },
      { label: 'min',           detail: '(): Point',                                  type: 'function' },
      { label: 'max',           detail: '(): Point',                                  type: 'function' },
      { label: 'size',          detail: '(): Point',                                  type: 'function' },
      { label: 'width',         detail: '(): number',                                 type: 'function' },
      { label: 'depth',         detail: '(): number',                                 type: 'function' },
      { label: 'height',        detail: '(): number',                                 type: 'function' },
      { label: 'corners',       detail: '(): Array<Point>',                           type: 'function' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Build flat lookup maps for fast completion                         */
/* ------------------------------------------------------------------ */

/** Top-level completions: Modeler global functions + keywords */
const topLevelCompletions: Completion[] = modelerFunctions.map(f => ({
  label: f.label,
  type: 'function',
  detail: f.detail,
  info: f.info,
}));

topLevelCompletions.push(
  { label: 'new',     type: 'keyword' },
  { label: 'const',   type: 'keyword' },
  { label: 'let',     type: 'keyword' },
  { label: 'await',   type: 'keyword' },
  { label: 'console', type: 'variable', detail: 'Console API' },
);

/** Map from class name → static completions (Point, Vector, Bbox, OBbox) */
const staticMap = new Map<string, Completion[]>();

/** Map from class name → instance member completions */
const memberMap = new Map<string, Completion[]>();

for (const cls of shapeClasses)
{
  if (cls.statics && cls.statics.length > 0)
  {
    staticMap.set(
      cls.label,
      cls.statics.map(m => ({
        label: m.label,
        type: m.type === 'property' ? 'property' : 'method',
        detail: m.detail,
      })),
    );
  }

  memberMap.set(
    cls.label,
    cls.members.map(m => ({
      label: m.label,
      type: m.type === 'property' ? 'property' : 'method',
      detail: m.detail,
    })),
  );
}

/** All instance members merged (used when variable type cannot be determined) */
const allMembers: Completion[] = [];
{
  const seen = new Set<string>();
  for (const cls of shapeClasses)
  {
    for (const m of cls.members)
    {
      if (!seen.has(m.label))
      {
        seen.add(m.label);
        allMembers.push({
          label: m.label,
          type: m.type === 'property' ? 'property' : 'method',
          detail: m.detail,
        });
      }
    }
  }
}

/** Shape class names for `new ClassName` completions */
const classNameCompletions: Completion[] = shapeClasses.map(c => ({
  label: c.label,
  type: 'class',
  detail: c.detail,
}));

/* ------------------------------------------------------------------ */
/*  Completion source                                                  */
/* ------------------------------------------------------------------ */

/**
 * CodeMirror completion source for the Archiyou Modeler API.
 *
 * - `ClassName.` (e.g. `Point.`, `Vector.`) → static method completions
 * - `expr.`                                 → all known instance methods
 * - Top-level word                          → Modeler global functions
 * - After `new `                            → shape class names
 */
export function archiyouCompletions(
  context: CompletionContext,
): CompletionResult | null
{
  // ClassName. → static completions (Point.from, Vector.from, etc.)
  const dotMatch = context.matchBefore(/\b([A-Z]\w*)\.(\w*)$/);
  if (dotMatch)
  {
    const className = dotMatch.text.split('.')[0];
    const statics = staticMap.get(className);
    if (statics && statics.length > 0)
    {
      return {
        from: dotMatch.from + className.length + 1,
        options: statics,
        validFor: /^\w*$/,
      };
    }
  }

  // expr. → instance member completions
  const memberMatch = context.matchBefore(/\.\w*$/);
  if (memberMatch)
  {
    return {
      from: memberMatch.from + 1,
      options: allMembers,
      validFor: /^\w*$/,
    };
  }

  // `new ClassName` → shape class names
  const newMatch = context.matchBefore(/\bnew\s+\w*$/);
  if (newMatch)
  {
    const spaceIdx = newMatch.text.indexOf(' ') + 1;
    return {
      from: newMatch.from + spaceIdx,
      options: classNameCompletions,
      validFor: /^\w*$/,
    };
  }

  // Top-level word → Modeler global functions + keywords
  const wordMatch = context.matchBefore(/\b\w+$/);
  if (wordMatch)
  {
    return {
      from: wordMatch.from,
      options: topLevelCompletions,
      validFor: /^\w*$/,
    };
  }

  return null;
}
