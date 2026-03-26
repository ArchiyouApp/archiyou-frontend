/**
 * CodeMirror autocompletion source for the Meshup API.
 *
 * Provides completions for classes, static methods, instance methods,
 * and properties exposed in the worker execution scope.
 */

import {
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';

/* ------------------------------------------------------------------ */
/*  Meshup API type descriptors                                       */
/* ------------------------------------------------------------------ */

interface MethodInfo {
  label: string;
  detail: string;      // signature
  info?: string;       // short doc
  type: 'function' | 'property';
}

interface ClassInfo {
  label: string;
  detail: string;
  statics: MethodInfo[];
  members: MethodInfo[];
}

const classes: ClassInfo[] = [
  {
    label: 'Mesh',
    detail: 'class — 3D mesh geometry',
    statics: [
      { label: 'Cube',           detail: '(size: number): Mesh',                   type: 'function' },
      { label: 'Cuboid',         detail: '(w, d?, h?): Mesh',                      type: 'function' },
      { label: 'Box',            detail: '(w, d?, h?): Mesh',                      type: 'function' },
      { label: 'BoxBetween',     detail: '(from, to): Mesh',                       type: 'function' },
      { label: 'Sphere',         detail: '(radius): Mesh',                         type: 'function' },
      { label: 'Cylinder',       detail: '(radius, height): Mesh',                 type: 'function' },
      { label: 'from',           detail: '(mesh): Mesh',                           type: 'function' },
      { label: 'fromPoints',     detail: '(points): Mesh',                         type: 'function' },
      { label: 'fromPointsWithHoles', detail: '(outerPoints, holes): Mesh',        type: 'function' },
      { label: 'fromPolygons',   detail: '(verts): Mesh',                          type: 'function' },
    ],
    members: [
      { label: 'translate',      detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'move',           detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'rotate',         detail: '(angle, axis?): this',                   type: 'function' },
      { label: 'rotateX',        detail: '(angle): this',                          type: 'function' },
      { label: 'rotateY',        detail: '(angle): this',                          type: 'function' },
      { label: 'rotateZ',        detail: '(angle): this',                          type: 'function' },
      { label: 'rotateAround',   detail: '(angle, axis?, pivot?): this',           type: 'function' },
      { label: 'scale',          detail: '(sx, sy, sz): this',                     type: 'function' },
      { label: 'mirror',         detail: '(dir, pos?): this',                      type: 'function' },
      { label: 'moveToCenter',   detail: '(): this',                               type: 'function' },
      { label: 'place',          detail: '(z?): this',                             type: 'function' },
      { label: 'union',          detail: '(other: Mesh): this',                    type: 'function' },
      { label: 'add',            detail: '(other: Mesh): this',                    type: 'function' },
      { label: 'difference',     detail: '(other: Mesh): this',                    type: 'function' },
      { label: 'subtract',       detail: '(other: Mesh): this',                    type: 'function' },
      { label: 'intersection',   detail: '(other: Mesh): this',                    type: 'function' },
      { label: 'hull',           detail: '(): Mesh | undefined',                   type: 'function' },
      { label: 'smooth',         detail: '(lambda, mu, iter, preserveBounds): this', type: 'function' },
      { label: 'triangulate',    detail: '(): this',                               type: 'function' },
      { label: 'inverse',        detail: '(): this',                               type: 'function' },
      { label: 'copy',           detail: '(): Mesh | undefined',                   type: 'function' },
      { label: 'validate',       detail: '(): boolean',                            type: 'function' },
      { label: 'center',         detail: '(): Point',                              type: 'function' },
      { label: 'volume',         detail: '(): number | undefined',                 type: 'function' },
      { label: 'bbox',           detail: '(): Bbox',                               type: 'function' },
      { label: 'obbox',          detail: '(): OBbox',                              type: 'function' },
      { label: 'positions',      detail: '(): Array<Point>',                       type: 'function' },
      { label: 'vertices',       detail: '(): Array<Point>',                       type: 'function' },
      { label: 'normals',        detail: '(): Array<Vector>',                      type: 'function' },
      { label: 'polygons',       detail: '(): Array<Polygon>',                     type: 'function' },
      { label: 'row',            detail: '(count, spacing, dir?): Collection',     type: 'function' },
      { label: 'grid',           detail: '(cx?, cy?, cz?, spacing?): Collection',  type: 'function' },
      { label: 'extrude',        detail: '— use Polygon.extrude() or Sketch.extrude()', type: 'function' },
      { label: 'toSTLBinary',    detail: '(): Uint8Array | undefined',             type: 'function' },
      { label: 'toSTLAscii',     detail: '(): string | undefined',                 type: 'function' },
      { label: 'toGLTF',         detail: '(up?): string | undefined',              type: 'function' },
      { label: 'toAMF',          detail: '(): string | undefined',                 type: 'function' },
      { label: 'metadata',       detail: 'Record<string, any>',                    type: 'property' },
    ],
  },
  {
    label: 'Curve',
    detail: 'class — NURBS / compound curve',
    statics: [
      { label: 'Line',           detail: '(start, end): Curve',                    type: 'function' },
      { label: 'Polyline',       detail: '(points, ...more): Curve',               type: 'function' },
      { label: 'Interpolated',   detail: '(points, degree?): Curve',               type: 'function' },
      { label: 'Circle',         detail: '(radius?, center?, normal?): Curve',     type: 'function' },
      { label: 'Compound',       detail: '(curves): Curve',                        type: 'function' },
      { label: 'fromCsgrs',      detail: '(curve): Curve',                         type: 'function' },
    ],
    members: [
      { label: 'translate',      detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'move',           detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'rotate',         detail: '(angle, axis?, pivot?): this',           type: 'function' },
      { label: 'rotateX',        detail: '(angle, pivot?): this',                  type: 'function' },
      { label: 'rotateY',        detail: '(angle, pivot?): this',                  type: 'function' },
      { label: 'rotateZ',        detail: '(angle, pivot?): this',                  type: 'function' },
      { label: 'scale',          detail: '(sx, sy, sz): this',                     type: 'function' },
      { label: 'mirror',         detail: '(dir, pos?): this',                      type: 'function' },
      { label: 'reverse',        detail: '(): this',                               type: 'function' },
      { label: 'copy',           detail: '(): Curve',                              type: 'function' },
      { label: 'close',          detail: '(): this',                               type: 'function' },
      { label: 'fillet',         detail: '(radius, at?): this | null',             type: 'function' },
      { label: 'offset',         detail: '(distance, cornerType?): Curve | null',  type: 'function' },
      { label: 'trim',           detail: '(t0, t1): Array<Curve>',                 type: 'function' },
      { label: 'split',          detail: '(t): [Curve, Curve] | null',             type: 'function' },
      { label: 'intersect',      detail: '(other): Array<Point> | null',           type: 'function' },
      { label: 'extrude',        detail: '(length, direction): Mesh | null',       type: 'function' },
      { label: 'connectTo',      detail: '(other, maxGap?): this',                 type: 'function' },
      { label: 'extend',         detail: '(length, side?): this',                  type: 'function' },
      { label: 'union',          detail: '(other): CurveCollection | null',        type: 'function' },
      { label: 'difference',     detail: '(other): CurveCollection | null',        type: 'function' },
      { label: 'controlPoints',  detail: '(): Array<Point>',                       type: 'function' },
      { label: 'points',         detail: '(): Array<Point>',                       type: 'function' },
      { label: 'isClosed',       detail: '(): boolean',                            type: 'function' },
      { label: 'isPlanar',       detail: '(): boolean',                            type: 'function' },
      { label: 'length',         detail: '(): number',                             type: 'function' },
      { label: 'start',          detail: '(): Point',                              type: 'function' },
      { label: 'end',            detail: '(): Point',                              type: 'function' },
      { label: 'center',         detail: '(): Point',                              type: 'function' },
      { label: 'bbox',           detail: '(): Bbox | undefined',                   type: 'function' },
      { label: 'obbox',          detail: '(): OBbox',                              type: 'function' },
      { label: 'normal',         detail: '(): Vector | null',                      type: 'function' },
      { label: 'tessellate',     detail: '(tol?): Array<Point>',                   type: 'function' },
      { label: 'toPolygon',      detail: '(tol?): Polygon | undefined',            type: 'function' },
      { label: 'toMesh',         detail: '(tol?): Mesh | undefined',               type: 'function' },
      { label: 'toGLTF',         detail: '(up?): string',                          type: 'function' },
      { label: 'toSVG',          detail: '(plane?): string',                       type: 'function' },
      { label: 'metadata',       detail: 'Record<string, any>',                    type: 'property' },
    ],
  },
  {
    label: 'Polygon',
    detail: 'class — planar polygon',
    statics: [
      { label: 'from',           detail: '(p): Polygon',                           type: 'function' },
    ],
    members: [
      { label: 'vertices',       detail: '(): Array<Point>',                       type: 'function' },
      { label: 'normal',         detail: '(): Vector',                             type: 'function' },
      { label: 'center',         detail: '(): Point',                              type: 'function' },
      { label: 'bbox',           detail: '(): Bbox',                               type: 'function' },
      { label: 'obbox',          detail: '(): OBbox',                              type: 'function' },
      { label: 'flip',           detail: '(): this',                               type: 'function' },
      { label: 'addHole',        detail: '(holeVerts): this',                      type: 'function' },
      { label: 'triangulate',    detail: '(): Array<Polygon>',                     type: 'function' },
      { label: 'extrude',        detail: '(length, direction?): Mesh',             type: 'function' },
      { label: 'hasHoles',       detail: '(): boolean',                            type: 'function' },
      { label: 'holeCount',      detail: '(): number',                             type: 'function' },
    ],
  },
  {
    label: 'Collection',
    detail: 'class — group of Mesh / Curve',
    statics: [
      { label: 'isCollection',   detail: '(obj): boolean',                         type: 'function' },
    ],
    members: [
      { label: 'add',            detail: '(shapes): void',                         type: 'function' },
      { label: 'get',            detail: '(index): Mesh | Curve | undefined',      type: 'function' },
      { label: 'at',             detail: '(index): Mesh | Curve | undefined',      type: 'function' },
      { label: 'first',          detail: '(): Mesh | Curve',                       type: 'function' },
      { label: 'last',           detail: '(): Mesh | Curve',                       type: 'function' },
      { label: 'count',          detail: '(): number',                             type: 'function' },
      { label: 'copy',           detail: '(): Collection',                         type: 'function' },
      { label: 'shapes',         detail: '(): Array<Mesh | Curve>',                type: 'function' },
      { label: 'meshes',         detail: '(): Array<Mesh>',                        type: 'function' },
      { label: 'curves',         detail: '(): Array<Curve>',                       type: 'function' },
      { label: 'forEach',        detail: '(callback): this',                       type: 'function' },
      { label: 'filter',         detail: '(callback): Collection',                 type: 'function' },
      { label: 'translate',      detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'move',           detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'rotate',         detail: '(angle, axis?, origin?): this',          type: 'function' },
      { label: 'scale',          detail: '(factor, origin?): this',                type: 'function' },
      { label: 'mirror',         detail: '(dir, pos?): this',                      type: 'function' },
      { label: 'union',          detail: '(other?): Mesh',                         type: 'function' },
      { label: 'subtract',       detail: '(other): this',                          type: 'function' },
      { label: 'toGLTF',         detail: '(up?): string',                          type: 'function' },
      { label: 'length',         detail: 'number',                                 type: 'property' },
    ],
  },
  {
    label: 'Sketch',
    detail: 'class — 2D sketch on a plane',
    statics: [],
    members: [
      { label: 'moveTo',         detail: '(...coords): this',                      type: 'function' },
      { label: 'lineTo',         detail: '(...coords): this',                      type: 'function' },
      { label: 'arcTo',          detail: '(mid, end): this',                       type: 'function' },
      { label: 'polyline',       detail: '(points): this',                         type: 'function' },
      { label: 'curveTo',        detail: '(points): this',                         type: 'function' },
      { label: 'close',          detail: '(): this',                               type: 'function' },
      { label: 'combine',        detail: '(): this',                               type: 'function' },
      { label: 'offset',         detail: '(distance): this',                       type: 'function' },
      { label: 'extend',         detail: '(length, side?): this',                  type: 'function' },
      { label: 'translate',      detail: '(vecOrX, dy?, dz?): this',               type: 'function' },
      { label: 'rotate',         detail: '(angle, pivot): this',                   type: 'function' },
      { label: 'extrude',        detail: '(length): Mesh | null',                  type: 'function' },
      { label: 'sweep',          detail: '(path: Curve): Mesh | null',             type: 'function' },
      { label: 'loft',           detail: '(other: Sketch): Mesh | null',           type: 'function' },
      { label: 'end',            detail: '(): CurveCollection',                    type: 'function' },
      { label: 'toCurves',       detail: '(): CurveCollection',                    type: 'function' },
      { label: 'copy',           detail: '(): this',                               type: 'function' },
    ],
  },
  {
    label: 'Bbox',
    detail: 'class — axis-aligned bounding box',
    statics: [
      { label: 'fromMesh',       detail: '(m: Mesh): Bbox',                        type: 'function' },
    ],
    members: [
      { label: 'min',            detail: '(): Point',                              type: 'function' },
      { label: 'max',            detail: '(): Point',                              type: 'function' },
      { label: 'center',         detail: '(): Point',                              type: 'function' },
      { label: 'size',           detail: '(): Point3Js',                           type: 'function' },
      { label: 'width',          detail: '(): number',                             type: 'function' },
      { label: 'depth',          detail: '(): number',                             type: 'function' },
      { label: 'height',         detail: '(): number',                             type: 'function' },
      { label: 'is1D',           detail: '(): boolean',                            type: 'function' },
      { label: 'is2D',           detail: '(): boolean',                            type: 'function' },
      { label: 'is3D',           detail: '(): boolean',                            type: 'function' },
    ],
  },
  {
    label: 'OBbox',
    detail: 'class — oriented bounding box',
    statics: [
      { label: 'fromPoints',     detail: '(points): OBbox',                        type: 'function' },
      { label: 'fromMesh',       detail: '(m: Mesh): OBbox',                       type: 'function' },
      { label: 'fromCurve',      detail: '(c: Curve, tol?): OBbox',               type: 'function' },
    ],
    members: [
      { label: 'axes',           detail: '(): [Vector, Vector, Vector]',           type: 'function' },
      { label: 'halfExtents',    detail: '(): [number, number, number]',           type: 'function' },
      { label: 'center',         detail: '(): Point',                              type: 'function' },
      { label: 'min',            detail: '(): Point',                              type: 'function' },
      { label: 'max',            detail: '(): Point',                              type: 'function' },
      { label: 'size',           detail: '(): Point3Js',                           type: 'function' },
      { label: 'width',          detail: '(): number',                             type: 'function' },
      { label: 'depth',          detail: '(): number',                             type: 'function' },
      { label: 'height',         detail: '(): number',                             type: 'function' },
      { label: 'corners',        detail: '(): Array<Point>',                       type: 'function' },
    ],
  },
  {
    label: 'Point',
    detail: 'class — 3D point',
    statics: [
      { label: 'from',           detail: '(x, y?, z?): Point',                     type: 'function' },
    ],
    members: [
      { label: 'x',              detail: 'number',                                 type: 'property' },
      { label: 'y',              detail: 'number',                                 type: 'property' },
      { label: 'z',              detail: 'number',                                 type: 'property' },
      { label: 'copy',           detail: '(): Point',                              type: 'function' },
      { label: 'move',           detail: '(offset): Point',                        type: 'function' },
      { label: 'distance',       detail: '(to): number',                           type: 'function' },
      { label: 'round',          detail: '(tolerance?): Point',                    type: 'function' },
      { label: 'toArray',        detail: '(): [number, number, number?]',          type: 'function' },
      { label: 'toVector',       detail: '(): Vector',                             type: 'function' },
      { label: 'toVertex',       detail: '(n?): Vertex',                           type: 'function' },
      { label: 'toString',       detail: '(): string',                             type: 'function' },
    ],
  },
  {
    label: 'Vector',
    detail: 'class — 3D vector',
    statics: [
      { label: 'from',           detail: '(x, y?, z?): Vector',                    type: 'function' },
    ],
    members: [
      { label: 'x',              detail: 'number',                                 type: 'property' },
      { label: 'y',              detail: 'number',                                 type: 'property' },
      { label: 'z',              detail: 'number',                                 type: 'property' },
      { label: 'length',         detail: '(): number',                             type: 'function' },
      { label: 'angle',          detail: '(other): number',                        type: 'function' },
      { label: 'abs',            detail: '(): Vector',                             type: 'function' },
      { label: 'add',            detail: '(other): Vector',                        type: 'function' },
      { label: 'subtract',       detail: '(other): Vector',                        type: 'function' },
      { label: 'scale',          detail: '(scalar): Vector',                       type: 'function' },
      { label: 'normalize',      detail: '(): Vector',                             type: 'function' },
      { label: 'cross',          detail: '(other): Vector',                        type: 'function' },
      { label: 'dot',            detail: '(other): number',                        type: 'function' },
      { label: 'reverse',        detail: '(): Vector',                             type: 'function' },
      { label: 'copy',           detail: '(): Vector',                             type: 'function' },
      { label: 'rotate',         detail: '(axis, angle): Vector',                  type: 'function' },
      { label: 'toPoint',        detail: '(): Point',                              type: 'function' },
      { label: 'toString',       detail: '(): string',                             type: 'function' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Build flat lookup maps for fast completion                        */
/* ------------------------------------------------------------------ */

/** Top-level completions (class names + `new` keyword) */
const topLevelCompletions: Completion[] = classes.map(c => ({
  label: c.label,
  type: 'class',
  detail: c.detail,
}));

topLevelCompletions.push(
  { label: 'new', type: 'keyword' },
  { label: 'const', type: 'keyword' },
  { label: 'let', type: 'keyword' },
  { label: 'await', type: 'keyword' },
  { label: 'console', type: 'variable', detail: 'Console API' },
);

/** Map from class name → static completions */
const staticMap = new Map<string, Completion[]>();
/** Map from class name → instance completions */
const memberMap = new Map<string, Completion[]>();

for (const cls of classes) {
  staticMap.set(
    cls.label,
    cls.statics.map(m => ({
      label: m.label,
      type: m.type === 'property' ? 'property' : 'method',
      detail: m.detail,
    })),
  );
  memberMap.set(
    cls.label,
    cls.members.map(m => ({
      label: m.label,
      type: m.type === 'property' ? 'property' : 'method',
      detail: m.detail,
    })),
  );
}

/** All instance members merged (used when we can't determine the type) */
const allMembers: Completion[] = [];
{
  const seen = new Set<string>();
  for (const cls of classes) {
    for (const m of cls.members) {
      if (!seen.has(m.label)) {
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

/* ------------------------------------------------------------------ */
/*  Completion source                                                 */
/* ------------------------------------------------------------------ */

/**
 * CodeMirror completion source for the Meshup API.
 *
 * - Typing a class name followed by `.` offers static methods.
 * - Typing after an instance `.` offers all known instance methods.
 * - At top-level scope offers class names.
 */
export function meshupCompletions(
  context: CompletionContext,
): CompletionResult | null {
  // Check for `ClassName.` pattern → static completions
  const dotMatch = context.matchBefore(/\b([A-Z]\w*)\.(\w*)$/);
  if (dotMatch) {
    const className = dotMatch.text.split('.')[0];
    const statics = staticMap.get(className);
    if (statics && statics.length > 0) {
      return {
        from: dotMatch.from + className.length + 1,
        options: statics,
        validFor: /^\w*$/,
      };
    }
  }

  // Check for `expr.` pattern → instance member completions
  const memberMatch = context.matchBefore(/\.\w*$/);
  if (memberMatch) {
    return {
      from: memberMatch.from + 1,
      options: allMembers,
      validFor: /^\w*$/,
    };
  }

  // Top-level word → class names
  const wordMatch = context.matchBefore(/\b\w+$/);
  if (wordMatch) {
    return {
      from: wordMatch.from,
      options: topLevelCompletions,
      validFor: /^\w*$/,
    };
  }

  // After `new ` → class names
  const newMatch = context.matchBefore(/\bnew\s+\w*$/);
  if (newMatch) {
    const spaceIdx = newMatch.text.indexOf(' ') + 1;
    return {
      from: newMatch.from + spaceIdx,
      options: topLevelCompletions.filter(c => c.type === 'class'),
      validFor: /^\w*$/,
    };
  }

  return null;
}
