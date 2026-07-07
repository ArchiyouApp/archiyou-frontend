/**
 *  SmartShapes.ts
 * 
 *  Create shapes with either mesh or brep kernel without caring a lot. 
 *  
 *  A SmartShape (SmartMeshCurve, SmartMesh, SmartBrepSolid, etc.) is a thin wrapper 
 *  around a kernel shape that allows some checking and converting if needed.
 *
 *  Typed Smart* shape classes — one per kernel shape type.
 *  Each class extends withSmartShape(KernelClass), inheriting ALL kernel methods
 *  automatically. No forwarding switchboard needed.
 *
 *  Use the static .from(modeler, kernelShape) factory to wrap an existing kernel shape.
 *  Modeler factory functions (line, box, etc.) use this pattern.
 *
 *  TypeScript intellisense:
 *    line()     → SmartMeshCurve  — all meshup.Curve methods visible directly
 *    box()      → SmartBrepSolid  — all brepKernel.Solid methods visible directly
 */

import type { Modeler } from './Modeler'
import type { ModelMode } from './types'
import type { Axis } from 'meshup/src/types'
import type { BasePlane } from 'meshup/src/types'

import * as meshup from 'meshup/src/index'
import * as brepKernel from './brep/index'

import { withSmartShape } from './SmartMixin'
import { SmartShapeCollection } from './SmartShapeCollection'
import { toSmart, sceneReplace, sceneAdd, sceneLayer, sceneUpdate, registerSmartWrappers, wrapSmart } from './SmartSceneDecorators'

//// SMART SHAPE UNION TYPE ////

export type AnySmartShape =
    | SmartMeshVertex
    | SmartMeshCurve
    | SmartMesh
    | SmartMeshPolygon
    | SmartBrepEdge
    | SmartBrepWire
    | SmartBrepFace
    | SmartBrepShell
    | SmartBrepSolid

export type SmartShapeVertex = SmartMeshVertex; // TODO
export type SmartShapeLinear = SmartMeshCurve | SmartBrepEdge | SmartBrepWire
export type SmartShapeFace   = SmartMeshPolygon | SmartBrepFace | SmartBrepShell
export type SmartShapeSolid  = SmartMesh | SmartBrepSolid

//// MESHUP KERNEL ////

export class SmartMeshCurve extends withSmartShape(meshup.Curve)
{
    get mode(): ModelMode { return 'mesh' }

    static from(modeler: Modeler, curve: meshup.Curve): SmartMeshCurve
    {
        Object.setPrototypeOf(curve, SmartMeshCurve.prototype)
        const s = curve as SmartMeshCurve
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }

    /** Start point as a SmartMeshVertex so SmartShape methods (label(), dim(), …)
     *  are available, e.g. line(...).start().label('A'). */
    @toSmart
    start(): SmartMeshVertex
    {
        // @ts-ignore — super.start() exists on the meshup.Curve kernel base at runtime
        return super.start() as any
    }

    /** End point as a SmartMeshVertex (see start()). */
    @toSmart
    end(): SmartMeshVertex
    {
        // @ts-ignore — super.end() exists on the meshup.Curve kernel base at runtime
        return super.end() as any
    }

    /** Corner vertices along the curve as a SmartShapeCollection of SmartMeshVertex,
     *  so SmartShape methods (label(), dim(), …) are available on each. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Vertex>; mixin prevents override check
    override vertices(): SmartShapeCollection
    {
        // @ts-ignore — super.vertices() exists on the meshup.Curve kernel base at runtime
        return super.vertices() as any
    }

    /** Atomic segments of this curve as a SmartShapeCollection of SmartMeshCurve,
     *  so SmartShape methods (label(), dim(), …) are available on each. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Curve>; mixin prevents override check
    override segments(): SmartShapeCollection
    {
        // @ts-ignore — super.segments() exists on the meshup.Curve kernel base at runtime
        return super.segments() as any
    }

    /** Alias for segments() (BREP compatibility) — SmartShapeCollection of SmartMeshCurve. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Curve>; mixin prevents override check
    override edges(): SmartShapeCollection
    {
        // @ts-ignore — super.edges() exists on the meshup.Curve kernel base at runtime
        return super.edges() as any
    }

    override replicate(
        num: number,
        transform: (curve: meshup.Curve, index: number, prev: meshup.Curve | undefined) => meshup.Curve,
    ): any
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const curves = new SmartShapeCollection()
        curves._modeler = this._modeler

        Array.from({ length: num }, (_, index) => index).forEach((index) =>
        {
            const prev = index > 0 ? curves.get(index - 1) as meshup.Curve | undefined : undefined
            const next = transform(this.copy() as meshup.Curve, index, prev) as AnySmartShape | null
            if (next)
            {
                if (originalName) (next as any).name(`${originalName}${index + 1}`)
                curves.add(next)
            }
        })

        return curves
    }

    /** Extrude this curve into a Mesh.
     *  The original Curve is removed from the scene and the resulting Mesh is
     *  added to the active layer.  Returns null when the kernel cannot extrude. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override extrude(length: number, direction?: meshup.PointLike): SmartMesh | null
    {
        return super.extrude(length, direction) as any
    }

    /** Convert this closed planar Curve to a Mesh via tessellation.
     *  The original Curve is removed from the scene and the resulting Mesh is
     *  added to the active layer.  Returns undefined when conversion fails. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override toMesh(tolerance?: number): SmartMesh | undefined
    {
        return super.toMesh(tolerance) as any
    }

    /** Convert this closed planar Curve to a Polygon via tessellation.
     *  The original Curve is removed from the scene and the resulting Polygon is
     *  added to the active layer.  Returns undefined when conversion fails. */
    @sceneReplace
    // @ts-ignore — return type SmartMeshPolygon narrows base Polygon; TypeScript mixin inference prevents override check
    override toPolygon(tolerance?: number): SmartMeshPolygon | undefined
    {
        return super.toPolygon(tolerance) as any
    }

    /** Alias for toPolygon(). */
    @sceneReplace
    // @ts-ignore — return type SmartMeshPolygon narrows base Polygon; TypeScript mixin inference prevents override check
    override toFace(tolerance?: number): SmartMeshPolygon | undefined
    {
        return super.toFace(tolerance) as any
    }

    /** Offset this curve in place without letting meshup's temporary working
     *  copies attach themselves to the smart scene. */
    @sceneUpdate
    // @ts-ignore — return type narrows base; mixin inference prevents override check
    override offset(distance: number, cornerType: 'sharp' | 'round' | 'smooth' = 'sharp'): this | null
    {
        const hadSuppression = Boolean((this as any)._suppressSceneAdd)
        ;(this as any)._suppressSceneAdd = true

        try
        {
            return super.offset(distance, cornerType) as any
        }
        finally
        {
            if (hadSuppression)
            {
                ;(this as any)._suppressSceneAdd = true
            }
            else
            {
                delete (this as any)._suppressSceneAdd
            }
        }
    }

    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Curve>; mixin prevents override check
    override row(count: number, spacing?: number, direction?: meshup.PointLike | Axis): SmartShapeCollection
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const collection = super.row(count, spacing, direction)
        if (originalName)
        {
            let i = 0
            collection.forEach(shape => { (shape as any).name(`${originalName}${++i}`) })
        }
        return collection as any
    }

    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Curve>; mixin prevents override check
    override grid(cx?: number, cy?: number, cz?: number, spacing?: number | meshup.PointLike): SmartShapeCollection
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const resolvedCx = cx ?? 2
        const resolvedCy = cy ?? 2
        const resolvedCz = cz ?? 1
        const collection = super.grid(cx, cy, cz, spacing)
        if (originalName)
        {
            collection.forEach((shape, flatIndex) =>
            {
                const zi = flatIndex % resolvedCz
                const yi = Math.floor(flatIndex / resolvedCz) % resolvedCy
                const xi = Math.floor(flatIndex / (resolvedCz * resolvedCy))
                const suffix = resolvedCz > 1
                    ? `${xi + 1}${yi + 1}${zi + 1}`
                    : `${xi + 1}${yi + 1}`
                ;(shape as any).name(`${originalName}${suffix}`)
            })
        }
        return collection as any
    }
}

// @ts-ignore — static from() shadows Mesh.from(mesh) intentionally;
// different factory signature
export class SmartMesh extends withSmartShape(meshup.Mesh)
{
    get mode(): ModelMode { return 'mesh' }

    static from(modeler: Modeler, mesh: meshup.Mesh): SmartMesh
    {
        Object.setPrototypeOf(mesh, SmartMesh.prototype)
        const s = mesh as SmartMesh
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }

    toMesh(): meshup.Mesh
    {
        // @ts-ignore — SmartMesh IS a Mesh at runtime (prototype swap); mixin inference limits TS check
        return this as unknown as meshup.Mesh
    }

    override overlapPerc(other: meshup.Mesh): number
    {
        const toPlainMesh = (shape: meshup.Mesh): meshup.Mesh =>
        {
            const plain = Object.create(meshup.Mesh.prototype) as meshup.Mesh
            ;(plain as any)._mesh = (shape as any)._mesh ?? shape.inner?.()
            ;(plain as any).style = (shape as any).style
            ;(plain as any).metadata = (shape as any).metadata
            ;(plain as any)._node = null
            return plain
        }

        return meshup.Mesh.prototype.overlapPerc.call(toPlainMesh(this as unknown as meshup.Mesh), toPlainMesh(other))
    }

    override replicate(
        num: number,
        transform: (mesh: meshup.Mesh, index: number, prev: meshup.Mesh | undefined) => meshup.Mesh,
    ): any
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const meshes = new SmartShapeCollection()
        meshes._modeler = this._modeler

        Array.from({ length: num }, (_, index) => index).forEach((index) =>
        {
            const prev = index > 0 ? meshes.get(index - 1) as meshup.Mesh | undefined : undefined
            const next = transform(this.copy() as meshup.Mesh, index, prev) as AnySmartShape | null
            if (next)
            {
                if (originalName) (next as any).name(`${originalName}${index + 1}`)
                meshes.add(next)
            }
        })

        return meshes
    }

    /** Flatten a 3D mesh to its bottom-facing polygons projected onto the XY plane.
     *  The original shape is removed from the scene and the resulting Mesh is added
     *  to the active layer. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override flatten(axis: Axis = 'z'): SmartMesh
    {
        return super.flatten(axis) as any
    }

    /** Project all vertices of this mesh onto a plane.
     *  The original shape is removed from the scene and the result is added to
     *  the active layer. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override projectToPlane(
        planeOrigin: [number, number, number],
        planeNormal: [number, number, number],
    ): SmartMesh
    {
        return super.projectToPlane(planeOrigin, planeNormal) as any
    }

    /** Convex hull of this mesh.
     *  The original shape is removed from the scene and the hull is added to
     *  the active layer.  Returns undefined when the kernel returns no hull. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override hull(): SmartMesh | undefined
    {
        return super.hull() as any
    }

    /** Layout copies of this mesh in a row along an axis.
     *  Returns a SmartShapeCollection so downstream ops like elevation() work. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Mesh>; mixin prevents override check
    override row(count: number, spacing?: number, direction?: meshup.PointLike | Axis): SmartShapeCollection
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const collection = super.row(count, spacing, direction)
        if (originalName)
        {
            let i = 0
            collection.forEach(shape => { (shape as any).name(`${originalName}${++i}`) })
        }
        return collection as any
    }

    /** Layout copies of this mesh in a grid.
     *  Returns a SmartShapeCollection so downstream ops like elevation() work. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Mesh>; mixin prevents override check
    override grid(cx?: number, cy?: number, cz?: number, spacing?: number | meshup.PointLike): SmartShapeCollection
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const resolvedCx = cx ?? 2
        const resolvedCy = cy ?? 2
        const resolvedCz = cz ?? 1
        const collection = super.grid(cx, cy, cz, spacing)
        if (originalName)
        {
            collection.forEach((shape, flatIndex) =>
            {
                const zi = flatIndex % resolvedCz
                const yi = Math.floor(flatIndex / resolvedCz) % resolvedCy
                const xi = Math.floor(flatIndex / (resolvedCz * resolvedCy))
                const suffix = resolvedCz > 1
                    ? `${xi + 1}${yi + 1}${zi + 1}`
                    : `${xi + 1}${yi + 1}`
                ;(shape as any).name(`${originalName}${suffix}`)
            })
        }
        return collection as any
    }

    /** Arrange copies of this mesh in a 3-D rectangular array, naming each {name}{x}{y} or {name}{x}{y}{z}. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Mesh>; mixin prevents override check
    override array(sizes?: meshup.PointLike, offsets?: meshup.PointLike): SmartShapeCollection
    {
        const originalName = (this.name() as string | undefined) ?? ''
        const s = meshup.Point.from(sizes ?? [2, 2, 1])
        const nx = Math.max(1, Math.floor(s.x))
        const ny = Math.max(1, Math.floor(s.y))
        const nz = Math.max(1, Math.floor(s.z))
        const collection = super.array(sizes, offsets)
        if (originalName)
        {
            collection.forEach((shape, flatIndex) =>
            {
                const zi = flatIndex % nz
                const yi = Math.floor(flatIndex / nz) % ny
                const xi = Math.floor(flatIndex / (nz * ny))
                const suffix = nz > 1
                    ? `${xi + 1}${yi + 1}${zi + 1}`
                    : `${xi + 1}${yi + 1}`
                ;(shape as any).name(`${originalName}${suffix}`)
            })
        }
        return collection as any
    }

    /** Get polygons (faces) of this mesh as a SmartShapeCollection of SmartMeshPolygon instances. */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Polygon>; mixin prevents override check
    override polygons(): SmartShapeCollection
    {
        return super.polygons() as any
    }

    /** Alias for polygons(). */
    @toSmart
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Polygon>; mixin prevents override check
    override faces(): SmartShapeCollection
    {
        return super.faces() as any
    }

    /** Split this mesh into geometrically isolated islands.
     *  The original shape is removed from the scene; each island is added
     *  to the active layer and returned in a SmartShapeCollection. */
    @sceneReplace
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Mesh>; mixin prevents override check
    override separateIsolated(): SmartShapeCollection
    {
        return (super.separateIsolated() ?? []) as any
    }

    /** Split this mesh into two pieces using a cutter (Mesh, Polygon, or PlaneJs).
     *  The original shape is removed from the scene; each part is added to the
     *  active layer and returned in a SmartShapeCollection. */
    @sceneReplace
    // @ts-ignore — return type SmartShapeCollection narrows base ShapeCollection<Mesh>; mixin prevents override check
    override split(other: meshup.Mesh | meshup.Polygon | any): SmartShapeCollection
    {
        return (super.split(other) ?? []) as any
    }

    /** Isometric projection — result curves are wrapped as SmartMeshCurve and added
     *  to a dedicated 'iso' layer, then the previously active layer is restored.
     *  The original mesh remains in the scene. */
    @sceneLayer('iso')
    override iso(
        cam: meshup.PointLike = [-1, -1, 1],
        hiddenLines = false,
        includeHiddenShapes = false,
        samples = 16,
        featureAngle = 10,
    ): meshup.ShapeCollection<meshup.Shape>
    {
        return super.isometry(cam, hiddenLines, includeHiddenShapes, samples, featureAngle) as any
    }

    /** Alias for iso() — same 'iso'-layer scene management. */
    @sceneLayer('iso')
    // @ts-ignore — return type narrows base; mixin prevents override check
    override isometry(
        cam: meshup.PointLike = [-1, -1, 1],
        hiddenLines = false,
        includeHiddenShapes = false,
        samples = 16,
        featureAngle = 10,
    ): meshup.ShapeCollection<meshup.Shape>
    {
        return super.isometry(cam, hiddenLines, includeHiddenShapes, samples, featureAngle) as any
    }

    /** Select sub-shapes from this mesh using a selector string (e.g. 'E||top').
     *  The raw meshup result is wrapped as Smart* shapes, added to the scene,
     *  and returned as a SmartShapeCollection. */
    @sceneAdd
    // @ts-ignore — return type SmartShapeCollection narrows base; mixin prevents override check
    override select(what: string): SmartShapeCollection
    {
        return (super.select(what) ?? []) as any
    }

    /** Orthographic elevation projection with hidden-line removal.
     *  The projected curves are added to a dedicated 'elevation' layer.
     *  The original mesh remains in the scene. */
    @sceneLayer('elevation')
    override elevation(
        from: meshup.PointLike | BasePlane = 'front',
        hiddenLines = false,
        samples = 16,
        featureAngle = 10,
    ): meshup.ShapeCollection<meshup.Shape>
    {
        return super.elevation(from, hiddenLines, samples, featureAngle) as any
    }

    /** Architectural section: cut and project.
     *  The projected curves are added to a dedicated 'section' layer.
     *  The original mesh remains in the scene. */
    @sceneLayer('section')
    override section(
        pivot: meshup.PointLike,
        normal: meshup.PointLike | BasePlane = [0, 0, 1],
        hiddenLines = false,
        samples = 16,
        featureAngle = 10,
    ): meshup.ShapeCollection<meshup.Shape>
    {
        return super.section(pivot, normal, hiddenLines, samples, featureAngle) as any
    }
}

// @ts-ignore — static from() shadows Vertex.from(v) intentionally; different factory signature
export class SmartMeshVertex extends withSmartShape(meshup.Vertex)
{
    get mode(): ModelMode { return 'mesh' }

    static from(modeler: Modeler, vertex: meshup.Vertex): SmartMeshVertex
    {
        Object.setPrototypeOf(vertex, SmartMeshVertex.prototype)
        const s = vertex as SmartMeshVertex
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

// @ts-ignore — static from() shadows Polygon.from() intentionally; different factory signature
export class SmartMeshPolygon extends withSmartShape(meshup.Polygon)
{
    get mode(): ModelMode { return 'mesh' }

    static from(modeler: Modeler, polygon: meshup.Polygon): SmartMeshPolygon
    {
        Object.setPrototypeOf(polygon, SmartMeshPolygon.prototype)
        const s = polygon as SmartMeshPolygon
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }

    /** Extrude this polygon into a closed solid Mesh.
     *  The original Polygon is removed from the scene and the resulting Mesh is
     *  added to the active layer. */
    @sceneReplace
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override extrude(length: number, direction?: meshup.PointLike): SmartMesh
    {
        return super.extrude(length, direction) as any
    }

    /** Convert this polygon to a Mesh (a single-polygon Mesh).
     *  Pure geometric conversion — does NOT mutate the scene, because the GLTF
     *  renderer calls toMesh() on scene shapes during export. */
    @toSmart
    // @ts-ignore — return type SmartMesh narrows base Mesh; TypeScript mixin inference prevents override check
    override toMesh(): SmartMesh
    {
        return super.toMesh() as any
    }

    /** Offset this polygon's boundary by `distance` (positive = outward).
     *  Mutates this polygon in place — same object, same scene node — so chaining
     *  like planeBetween(...).offset(100) updates the existing scene shape.
     *  Returns null (polygon unchanged) when the offset fails. */
    @sceneUpdate
    // @ts-ignore — return type narrows base; mixin inference prevents override check
    override offset(distance: number, cornerType: 'sharp' | 'round' | 'smooth' = 'sharp'): this | null
    {
        return super.offset(distance, cornerType) as any
    }

    /** Split this polygon into pieces with a cutting Curve or Polygon.
     *  The original Polygon is removed from the scene and the resulting pieces are added
     *  to the active layer as a SmartShapeCollection. Returns null (scene unchanged) when
     *  no split happens (see meshup Polygon.split() for the rules and warnings). */
    @sceneReplace
    // @ts-ignore — return type SmartShapeCollection narrows base; mixin prevents override check
    override split(other: meshup.Curve | meshup.Polygon, gap?: number): SmartShapeCollection | null
    {
        return super.split(other, gap) as any
    }
}

//// BREP KERNEL ////

export class SmartBrepEdge extends withSmartShape(brepKernel.Edge)
{
    get mode(): ModelMode { return 'brep' }

    static from(modeler: Modeler, edge: brepKernel.Edge): SmartBrepEdge
    {
        Object.setPrototypeOf(edge, SmartBrepEdge.prototype)
        const s = edge as SmartBrepEdge
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

export class SmartBrepWire extends withSmartShape(brepKernel.Wire)
{
    get mode(): ModelMode { return 'brep' }

    static from(modeler: Modeler, wire: brepKernel.Wire): SmartBrepWire
    {
        Object.setPrototypeOf(wire, SmartBrepWire.prototype)
        const s = wire as SmartBrepWire
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

export class SmartBrepFace extends withSmartShape(brepKernel.Face)
{
    get mode(): ModelMode { return 'brep' }

    static from(modeler: Modeler, face: brepKernel.Face): SmartBrepFace
    {
        Object.setPrototypeOf(face, SmartBrepFace.prototype)
        const s = face as SmartBrepFace
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

export class SmartBrepShell extends withSmartShape(brepKernel.Shell)
{
    get mode(): ModelMode { return 'brep' }

    static from(modeler: Modeler, shell: brepKernel.Shell): SmartBrepShell
    {
        Object.setPrototypeOf(shell, SmartBrepShell.prototype)
        const s = shell as SmartBrepShell
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

export class SmartBrepSolid extends withSmartShape(brepKernel.Solid)
{
    get mode(): ModelMode { return 'brep' }

    static from(modeler: Modeler, solid: brepKernel.Solid): SmartBrepSolid
    {
        Object.setPrototypeOf(solid, SmartBrepSolid.prototype)
        const s = solid as SmartBrepSolid
        s._modeler = modeler
        s._node = null
        s._conversionLog = []
        return s
    }
}

//// TYPEGUARDS

/** Duck-type guard — works without importing the concrete classes. */
export function isAnySmartShape(obj: any): obj is AnySmartShape
{
    return obj != null
        && typeof obj === 'object'
        && typeof obj.isShapeClass === 'function'
        && obj.isShapeClass() === true // <== little bit hacky
}

//// SCENE-WRAPPER REGISTRATION ////

// Inject the concrete type→Smart-class factories and the SmartShapeCollection
// builder into the decorator engine (SmartSceneDecorators.ts). This is the single
// source of truth for `type → Smart class`; the @toSmart / @scene* decorators and
// wrapBrepShape() below all dispatch through wrapSmart().
registerSmartWrappers(
    {
        Curve:   (m, s) => SmartMeshCurve.from(m, s as meshup.Curve),
        Mesh:    (m, s) => SmartMesh.from(m, s as meshup.Mesh),
        Vertex:  (m, s) => SmartMeshVertex.from(m, s as meshup.Vertex),
        Polygon: (m, s) => SmartMeshPolygon.from(m, s as meshup.Polygon),
        Edge:    (m, s) => SmartBrepEdge.from(m, s as brepKernel.Edge),
        Wire:    (m, s) => SmartBrepWire.from(m, s as brepKernel.Wire),
        Face:    (m, s) => SmartBrepFace.from(m, s as brepKernel.Face),
        Shell:   (m, s) => SmartBrepShell.from(m, s as brepKernel.Shell),
        Solid:   (m, s) => SmartBrepSolid.from(m, s as brepKernel.Solid),
    },
    (modeler, items) =>
    {
        const col = new SmartShapeCollection()
        col._modeler = modeler as Modeler
        items.forEach(i => col.add(i))
        return col
    },
)

//// UTILS ////

/**
 *  Wrap any brep kernel shape in the correct Smart* class.
 *  Thin wrapper over the unified wrapSmart() dispatcher (kept for the public
 *  re-export in modeler/types.ts and any external callers).
 */
export function wrapBrepShape(modeler: Modeler, shape: any): AnySmartShape
{
    return wrapSmart(modeler, shape) as AnySmartShape
}
