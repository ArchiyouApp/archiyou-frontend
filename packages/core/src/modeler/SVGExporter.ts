/**
 *  SVGExporter.ts
 *
 *  A small, self-contained SVG writer for the Modeler pipeline — the missing
 *  sibling of DXFExporter.ts and DAEExporter.ts.
 *
 *  Scope:
 *    - Serialize a ShapeCollection of 2D curves into one SVG document with a
 *      proper viewBox, padding, optional square framing and a stylesheet that
 *      works on light AND dark backgrounds.
 *    - Project the scene's 3D meshes to 2D line-work (hidden-line removal in
 *      Rust/WASM) WITHOUT touching the scenegraph, so an export never changes
 *      what the next export sees.
 *    - Produce a size-capped thumbnail via progressive degradation, so a
 *      pathologically dense model can never emit a multi-megabyte icon.
 *
 *  This file is dependency-free and pure-TS (no WASM, no meshup edits). Geometry
 *  is consumed through meshup's public accessors (bbox(), curves(), group(),
 *  toSVGElem()) and the undecorated projection entrypoints _iso()/_elevation().
 *
 *  Why the undecorated projections: ShapeCollection.iso()/elevation() carry
 *  @colSceneLayer decorators that ADD their result to the active scene. Calling
 *  those from an exporter pollutes the scenegraph of every later export in the
 *  same run (the GLB would grow a stray 'iso' layer). _iso()/_elevation() are
 *  the same maths with no scene management — see ShapeCollection.ts.
 */

import type * as meshup from '@archiyou/meshup/src/index'
import type { ModelUnits } from './types'

//// TYPES ////

export interface toSVGOptions
{
    /** Blank margin on every side, as a fraction of the drawing's largest side. Default 0.06. */
    padding?: number
    /** Normalize into a square viewBox so one asset serves 1:1 icons and 16:10 cards. Default false. */
    square?: boolean
    /** Decimals kept on emitted coordinates. Default: derived from the drawing size so
     *  ~1/2000 of the drawing is preserved (sub-pixel at any realistic render size). */
    precision?: number
    /** Stroke width in DEVICE pixels (via vector-effect), independent of model scale. Default 1.25. */
    strokeWidth?: number
    /** Emit the 'hidden' group when the projection produced one. Default true. */
    hidden?: boolean
    /** <title> for accessibility. */
    title?: string
    /** Recorded as data-units. Informational only. */
    units?: ModelUnits
}

export type ProjectionView = 'iso' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

export interface toProjectionSVGOptions extends toSVGOptions
{
    /** Which projection to take. Default 'iso'. Ignored when `cam` is given. */
    view?: ProjectionView
    /** Explicit camera direction, overrides `view`. Default [-1,-1,1]. */
    cam?: [number, number, number]
    /** Tessellation samples for curved edges. Default 16 (8 for thumbnails). */
    samples?: number
    /** Facet-boundary edges below this angle are dropped. Default 10 (20 for thumbnails). */
    featureAngle?: number
    /** Which hidden-line-removal algorithm the kernel should run.
     *
     *  - `'raycast'` (default) — samples visibility along each edge. Endpoints
     *    are approximate and an occluder narrower than the sample spacing is
     *    missed.
     *  - `'exact'` — computes occlusion analytically. Correct endpoints, finds
     *    occluders of any size, and ignores `samples`.
     *  - `'clip'` / `'painter'` — per shape, no merge into a single solid.
     *    Need convex, non-interpenetrating shapes. `'painter'` emits opaque
     *    fills, so it is unsuitable for DXF export.
     */
    strategy?: 'raycast' | 'exact' | 'clip' | 'painter'
    /** Downgrade to `'raycast'` with a warning when a per-shape strategy does
     *  not apply, instead of throwing. Default false. */
    fallback?: boolean
}

export type ThumbnailDegradeStep = 'hidden' | 'precision' | 'cull'

export interface ThumbnailSVGOptions extends toProjectionSVGOptions
{
    /** Soft cap that drives the degradation ladder. Default 65536. */
    maxBytes?: number
    /** Above this even after degrading, give up and return null. Default 131072. */
    hardMaxBytes?: number
}

export interface ThumbnailSVGResult
{
    svg: string
    bytes: number
    /** Number of curves actually emitted (after any culling). */
    curves: number
    /** Which degradation steps had to be applied to fit the budget. */
    degraded: Array<ThumbnailDegradeStep>
}

//// DEFAULTS ////

const DEFAULT_PADDING       = 0.06
const DEFAULT_STROKE_WIDTH  = 1.25
const DEFAULT_CAM: [number, number, number] = [-1, -1, 1]

/** Thumbnail-tuned projection settings. Coarser than the library defaults because at
 *  40–220px an 8-sample arc is indistinguishable from a 16-sample one, and near-coplanar
 *  facet boundaries read as noise rather than as detail. Applied up front rather than as a
 *  degradation step: re-projecting is an unbounded HLR cost, re-serializing is cheap. */
const THUMB_SAMPLES       = 8
const THUMB_FEATURE_ANGLE = 20

const DEFAULT_MAX_BYTES      = 65_536
const DEFAULT_HARD_MAX_BYTES = 131_072

/** Relative coordinate precision: keep ~1/PRECISION_TARGET of the drawing's size.
 *  This is what makes a 3000mm model emit "2847" instead of "2847.193582" while a
 *  10mm model still gets "8.473" — a fixed decimal count can't do both. */
const PRECISION_TARGET = 2000

/** Theme-aware ink. `currentColor` + a root `color` is the only thing that works inside an
 *  <img>-loaded SVG, which is an isolated document and cannot inherit the page's color.
 *  Dark gray rather than near-black: these drawings sit as small previews in lists, where
 *  full-strength ink reads as a heavy blot. Mirrors the app's --color-gray-dark. */
const INK_LIGHT = '#666666'
const INK_DARK  = '#c9d1da'

/** Inline presentation attributes emitted by meshup's Style.toSvgAttrs(). They cost ~60 bytes
 *  per element and are all superseded by our stylesheet (CSS rules beat presentation
 *  attributes), so they are pure overhead in an export we control end to end. */
const STYLE_ATTR_RE =
    /\s(?:fill|fill-opacity|stroke|stroke-opacity|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|vector-effect)="[^"]*"/g

/** Any plain decimal number. meshup emits coordinates via toFixed(6), never exponent notation. */
const DECIMAL_RE = /-?\d*\.\d+/g

/** A path made only of moves and lines — the only shape we dare simplify. Anything with
 *  C/S/Q/T/A segments is left completely alone. */
const POLYLINE_PATH_RE = /^[MLZmlz0-9eE.,\s+-]+$/

//// GEOMETRY HELPERS ////

type Box2D = { minX: number; minY: number; maxX: number; maxY: number }

/** A curve's bounding box in SVG coordinates. meshup's toSVGElem() flips Y (SVG's Y axis
 *  points down, the model's points up), so the box must be flipped identically or the
 *  viewBox won't contain the geometry it frames. */
function curveBoxSVG(curve: any): Box2D | null
{
    const bb = curve?.bbox?.()
    if (!bb) return null
    const min = bb.min(), max = bb.max()
    if (![min?.x, min?.y, max?.x, max?.y].every((n) => typeof n === 'number' && isFinite(n))) return null
    return { minX: min.x, minY: -max.y, maxX: max.x, maxY: -min.y }
}

function unionBox(a: Box2D | null, b: Box2D | null): Box2D | null
{
    if (!a) return b
    if (!b) return a
    return {
        minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
    }
}

function boxDiagonal(b: Box2D): number
{
    return Math.hypot(b.maxX - b.minX, b.maxY - b.minY)
}

/** Decimals needed to preserve ~1/PRECISION_TARGET of a drawing this big. */
function precisionForSize(size: number): number
{
    if (!(size > 0) || !isFinite(size)) return 3
    return Math.max(0, Math.min(6, Math.ceil(-Math.log10(size / PRECISION_TARGET))))
}

//// SERIALIZATION ////

function escapeXML(s: string): string
{
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Drop interior points that lie on the straight line between their neighbours.
 *
 * The HLR projection tessellates EVERY edge at `samples` resolution, so a box's straight
 * edge arrives as a 10-point polyline where 2 points carry all the information. On
 * rectilinear models — the common case for a configurator — this is a ~5x size win, and
 * it costs no fidelity at all because the discarded points are provably on the segment.
 *
 * Conservative by construction: paths containing any curve segment are returned untouched,
 * and `tol` is tied to the coordinate rounding step so a point can only be dropped when
 * rounding would have flattened it anyway.
 */
function simplifyPathData(d: string, tol: number): string
{
    if (!POLYLINE_PATH_RE.test(d)) return d

    const closed = /[Zz]\s*$/.test(d)
    const nums = d.match(/-?\d*\.?\d+(?:[eE][+-]?\d+)?/g)
    if (!nums || nums.length < 6 || nums.length % 2 !== 0) return d

    const pts: Array<[number, number]> = []
    for (let i = 0; i < nums.length; i += 2) pts.push([+nums[i], +nums[i + 1]])

    const kept: Array<[number, number]> = [pts[0]]
    for (let i = 1; i < pts.length - 1; i++)
    {
        const a = kept[kept.length - 1], b = pts[i], c = pts[i + 1]
        const abx = b[0] - a[0], aby = b[1] - a[1]
        const acx = c[0] - a[0], acy = c[1] - a[1]
        const acLen = Math.hypot(acx, acy)
        // Perpendicular distance of b from the segment a→c.
        const dist = acLen > 0 ? Math.abs(abx * acy - aby * acx) / acLen : Math.hypot(abx, aby)
        if (dist > tol) kept.push(b)
    }
    kept.push(pts[pts.length - 1])

    if (kept.length === pts.length) return d

    const parts = kept.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`)
    return parts.join(' ') + (closed ? ' Z' : '')
}

/** Strip meshup's inline style attributes, simplify the geometry and round every coordinate. */
function compactElement(elem: string, decimals: number, tol: number): string
{
    return elem
        .replace(STYLE_ATTR_RE, '')
        .replace(/\sd="([^"]*)"/, (_m, d: string) => ` d="${simplifyPathData(d, tol)}"`)
        .replace(DECIMAL_RE, (m) => String(+(+m).toFixed(decimals)))
}

function stylesheet(strokeWidth: number): string
{
    return '<style>'
        + `svg{color:${INK_LIGHT}}`
        + `@media (prefers-color-scheme:dark){svg{color:${INK_DARK}}}`
        + '.line{fill:none;stroke:currentColor;'
        + `stroke-width:${strokeWidth};vector-effect:non-scaling-stroke;`
        + 'stroke-linecap:round;stroke-linejoin:round}'
        + '.hidden{opacity:.35;stroke-dasharray:6 4}'
        + '</style>'
}

/** Frame a box: pad it, optionally square it, and render the viewBox attribute value. */
function viewBoxFor(box: Box2D, padding: number, square: boolean, decimals: number): string
{
    let { minX, minY, maxX, maxY } = box
    let w = maxX - minX
    let h = maxY - minY

    // A degenerate drawing (a single straight line, or nothing) still needs a sane frame.
    if (!(w > 0)) { const c = (minX + maxX) / 2; w = Math.max(h, 1); minX = c - w / 2 }
    if (!(h > 0)) { const c = (minY + maxY) / 2; h = Math.max(w, 1); minY = c - h / 2 }

    if (square)
    {
        const side = Math.max(w, h)
        minX -= (side - w) / 2
        minY -= (side - h) / 2
        w = side
        h = side
    }

    const pad = Math.max(w, h) * padding
    minX -= pad; minY -= pad; w += 2 * pad; h += 2 * pad

    const f = (n: number) => +n.toFixed(decimals)
    return `${f(minX)} ${f(minY)} ${f(w)} ${f(h)}`
}

//// CURVE COLLECTION ////

interface PreparedCurve
{
    curve: any
    box: Box2D
    /** In the projection's 'hidden' group — occluded edges. */
    isHidden: boolean
}

/** Flatten a ShapeCollection into renderable curves, tagged by projection group.
 *
 *  NOTE: the 'silhouette' group tags the SAME Curve objects as 'visible' (it is a
 *  classification, not a separate edge set), so it must never be emitted as its own
 *  path list — that would draw every silhouette edge twice.
 */
function prepareCurves(collection: any): Array<PreparedCurve>
{
    const curves: Array<any> = collection?.curves?.()?.toArray?.()
        ?? collection?.curves?.()
        ?? []

    const hiddenGroup = collection?.group?.('hidden')
    const hiddenSet = new Set<any>(hiddenGroup?.toArray?.() ?? [])

    const out: Array<PreparedCurve> = []
    for (const curve of Array.isArray(curves) ? curves : [])
    {
        const box = curveBoxSVG(curve)
        if (!box) continue
        out.push({ curve, box, isHidden: hiddenSet.has(curve) })
    }
    return out
}

//// PUBLIC API ////

/** Serialize a ShapeCollection of 2D curves to one SVG document.
 *  Returns null when there is nothing to draw. */
export function buildSVG(collection: any, options?: toSVGOptions): string | null
{
    return buildSVGFromPrepared(prepareCurves(collection), options ?? {})
}

function buildSVGFromPrepared(prepared: Array<PreparedCurve>, options: toSVGOptions): string | null
{
    const includeHidden = options.hidden !== false
    const drawn = includeHidden ? prepared : prepared.filter((p) => !p.isHidden)
    if (drawn.length === 0) return null

    let box: Box2D | null = null
    for (const p of drawn) box = unionBox(box, p.box)
    if (!box) return null

    const size = Math.max(box.maxX - box.minX, box.maxY - box.minY)
    const decimals = options.precision ?? precisionForSize(size)
    // Collinear tolerance = the coordinate rounding step, so simplification can only
    // remove points that rounding was about to collapse onto the line anyway.
    const tol = size / PRECISION_TARGET

    const elems: Array<string> = []
    for (const p of drawn)
    {
        const raw = p.curve?.toSVGElem?.(p.isHidden ? 'line hidden' : 'line')
        if (typeof raw !== 'string' || !raw) continue
        elems.push(compactElement(raw, decimals, tol))
    }
    if (elems.length === 0) return null

    const viewBox = viewBoxFor(box, options.padding ?? DEFAULT_PADDING, options.square === true, decimals)
    const unitsAttr = options.units ? ` data-units="${escapeXML(options.units)}"` : ''
    const titleElem = options.title ? `<title>${escapeXML(options.title)}</title>` : ''

    return '<svg xmlns="http://www.w3.org/2000/svg"'
        + ` viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" role="img"${unitsAttr}>`
        + titleElem
        + stylesheet(options.strokeWidth ?? DEFAULT_STROKE_WIDTH)
        + elems.join('')
        + '</svg>'
}

/** Hidden-line-project a collection of meshes to 2D curves.
 *
 *  Takes the ShapeCollection rather than a mesh array so this module needs no runtime
 *  import of meshup (a type-only dependency, like DXFExporter) — the caller already
 *  holds one via `scene().shapes().meshes()`.
 *
 *  Does NOT mutate the scene: it calls the undecorated _iso()/_elevation(). See the header. */
export function projectMeshes(meshCollection: any, options?: toProjectionSVGOptions): any
{
    if (!meshCollection || meshCollection.length === 0) return null

    const o = options ?? {}
    const samples = o.samples ?? 16
    const featureAngle = o.featureAngle ?? 10
    const hiddenLines = o.hidden !== false

    const view = o.view ?? 'iso'
    // Which hidden-line algorithm to run. Undefined means the kernel default
    // ('raycast'), so nothing changes for a caller that does not ask.
    const viewOpts = { strategy: o.strategy, fallback: o.fallback }
    if (!o.cam && view !== 'iso')
    {
        return meshCollection._elevation(view, hiddenLines, false, samples, featureAngle, viewOpts)
    }
    return meshCollection._iso(o.cam ?? DEFAULT_CAM, hiddenLines, false, samples, featureAngle, viewOpts)
}

/** Projection + serialization in one step. Null when there are no meshes / nothing visible. */
export function buildProjectionSVG(meshCollection: any, options?: toProjectionSVGOptions): string | null
{
    const projected = projectMeshes(meshCollection, options)
    if (!projected) return null
    return buildSVG(projected, options)
}

/**
 * Size-capped projection SVG for use as a thumbnail or list icon.
 *
 * Degradation ladder, re-measuring after each step:
 *   0. base render (coarse projection settings, relative precision, hidden lines off by default)
 *   1. drop the 'hidden' group
 *   2. one decimal less precision
 *   3. cull: keep the largest curves that fit the budget (always converges)
 *   4. still over hardMaxBytes → null, and the caller shows a placeholder icon
 *
 * Returning null rather than emitting a broken or enormous asset is deliberate: a missing
 * thumbnail degrades to the existing placeholder, a 3MB one degrades the whole list.
 */
export function buildThumbnailSVG(meshCollection: any, options?: ThumbnailSVGOptions): ThumbnailSVGResult | null
{
    const o = options ?? {}
    const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES
    const hardMaxBytes = Math.max(o.hardMaxBytes ?? DEFAULT_HARD_MAX_BYTES, maxBytes)

    const projected = projectMeshes(meshCollection, {
        ...o,
        samples: o.samples ?? THUMB_SAMPLES,
        featureAngle: o.featureAngle ?? THUMB_FEATURE_ANGLE,
        // Only pay for hidden-line computation when hidden lines were actually asked for.
        hidden: o.hidden === true,
    })
    if (!projected) return null

    const prepared = prepareCurves(projected)
    if (prepared.length === 0) return null

    const base: toSVGOptions = {
        padding: o.padding, square: o.square !== false, precision: o.precision,
        strokeWidth: o.strokeWidth, title: o.title, units: o.units,
        hidden: o.hidden === true,
    }

    const degraded: Array<ThumbnailDegradeStep> = []

    const attempt = (curves: Array<PreparedCurve>, opts: toSVGOptions) =>
    {
        const svg = buildSVGFromPrepared(curves, opts)
        return svg ? { svg, bytes: byteLength(svg), curves: curves.length } : null
    }

    // 0. base
    let best = attempt(prepared, base)
    if (!best) return null
    if (best.bytes <= maxBytes) return { ...best, degraded }

    // 1. drop hidden lines (a no-op when they were already off)
    if (base.hidden)
    {
        base.hidden = false
        degraded.push('hidden')
        best = attempt(prepared, base) ?? best
        if (best.bytes <= maxBytes) return { ...best, degraded }
    }

    // 2. one decimal less
    const drawn = base.hidden ? prepared : prepared.filter((p) => !p.isHidden)
    let box: Box2D | null = null
    for (const p of drawn) box = unionBox(box, p.box)
    const currentPrecision = base.precision
        ?? precisionForSize(box ? Math.max(box.maxX - box.minX, box.maxY - box.minY) : 1)
    if (currentPrecision > 0)
    {
        base.precision = currentPrecision - 1
        degraded.push('precision')
        best = attempt(prepared, base) ?? best
        if (best.bytes <= maxBytes) return { ...best, degraded }
    }

    // 3. cull the smallest curves — they contribute the least at icon size
    const ranked = [...drawn].sort((a, b) => boxDiagonal(b.box) - boxDiagonal(a.box))
    let lo = 1, hi = ranked.length, keep = 0
    while (lo <= hi)
    {
        const mid = (lo + hi) >> 1
        const trial = attempt(ranked.slice(0, mid), base)
        if (trial && trial.bytes <= maxBytes) { keep = mid; lo = mid + 1 }
        else { hi = mid - 1 }
    }
    if (keep > 0 && keep < ranked.length)
    {
        const culled = attempt(ranked.slice(0, keep), base)
        if (culled) { degraded.push('cull'); return { ...culled, degraded } }
    }

    // 4. give up rather than store something unusable
    return best.bytes <= hardMaxBytes ? { ...best, degraded } : null
}

/** Byte length of a UTF-8 string, without assuming Node's Buffer (core runs in a Worker too). */
function byteLength(s: string): number
{
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = (globalThis as any).Buffer
    return B ? B.byteLength(s, 'utf8') : s.length
}

export type { meshup }
