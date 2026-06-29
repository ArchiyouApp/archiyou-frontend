/**
 *  SmartShapeCollection.ts
 *  
 *  A collection of SmartShapes that make it possible to switch between Mesh and Brep representation of shapes
 * 
 *  - Per Shape operations use underlying SmartShape methods 
 *  
 *  Methods on the ShapeCollection serve one of these goals:
 * 
 *  - Kernel Switching introspection and transformation methods (like toMeshCollection() and toBrepCollection()) 
 *  - Shape creation methods, which need to make sure to create SmartShapes (using the @toSmart decorator)
 *  - ShapeCollection overrides that need to maintain the SmartShape wrapper
 *  - Scene management methods (normal ShapeCollection don't have scene management)
 *  
 *  
 * 
 */

import type * as meshup from 'meshup/src/index'
import type { Axis } from 'meshup/src/types'
import { ShapeCollection } from 'meshup/src/ShapeCollection'
import { Mesh as MeshupMesh } from 'meshup/src/Mesh'
import type { AnySmartShape } from './SmartShapes'
import { toSmart, sceneAdd, sceneLayer } from './SmartSceneDecorators'
import type { SmartSceneNode } from './SmartSceneNode'
import type { Modeler } from './Modeler'

export class SmartShapeCollection extends ShapeCollection<AnySmartShape>
{
    /** Annotations linked to this collection (for the Annotator). */
    annotations: Array<any> = []

    /** Set by Modeler.collection() to make this collection scene-backed.
     *  Transient collections (internal results) keep these null and stay flat. */
    _modeler: Modeler | null = null
    _layer: SmartSceneNode | null = null
    _name = 'collection'

    //// IDENTITY ////

    type(): string            { return 'ShapeCollection' }
    isShape(): boolean        { return false }
    isShapeCollection(): boolean { return true }

    isEmpty(): boolean        { return this._shapes.length === 0 }

    /** All shapes as a plain array (shallow copy). */
    all(): Array<AnySmartShape>       { return [...this._shapes] }
    children(): Array<AnySmartShape>  { return [...this._shapes] }
    getShapes(): Array<AnySmartShape> { return [...this._shapes] }

    // Some extras (TODO: add to parent classes)
    is2D(): boolean { return this._shapes.every(s => (s as any).is2D?.()) }
    is3D(): boolean { return this._shapes.some(s => !(s as any).is2D?.()) }


    //// ADAPTER REGISTRATION ////

    static _meshCollectionFactory: ((shapes: meshup.Mesh[]) => meshup.ShapeCollection) | null = null
    static _brepCollectionFactory: ((shapes: any[]) => any) | null = null

    static setAdapters(
        meshCollectionFactory: (shapes: meshup.Mesh[]) => meshup.ShapeCollection,
        brepCollectionFactory:  (shapes: any[]) => any,
    ): void
    {
        SmartShapeCollection._meshCollectionFactory = meshCollectionFactory
        SmartShapeCollection._brepCollectionFactory = brepCollectionFactory
    }


    //// JIT KERNEL ADAPTERS ////

    _toMeshCollection(): meshup.ShapeCollection<meshup.Mesh> | null
    {
        // Re-wrap each SmartMesh as a plain meshup.Mesh that SHARES the inner
        // MeshJs but has no scene node. Without this, downstream meshup ops that
        // call .copy() (e.g. ShapeCollection.isometry building an occluder) would
        // dispatch to SmartMesh.copy(), which auto-attaches the temp copy to the
        // active scene layer. That copy then gets consumed by projectEdges
        // (Vec<MeshJs> takes ownership) and leaves a zombie node behind that
        // panics on the next bbox/serialise walk with "null pointer passed to rust".
        const wrapPlain = (m: any): meshup.Mesh | null =>
        {
            if (!m) return null
            const inner = m?._mesh ?? m?.inner?.()
            if (!inner) return null
            const plain = Object.create(MeshupMesh.prototype) as meshup.Mesh
            ;(plain as any)._mesh = inner
            ;(plain as any).style = m.style
            ;(plain as any).metadata = m.metadata
            ;(plain as any)._node = null
            return plain
        }
        const meshes = this._shapes
            .filter(s => (s as any).shapeKind === 'closed')
            .map(s => wrapPlain((s as any).toMesh()))
            .filter((m): m is meshup.Mesh => m != null)
        if (SmartShapeCollection._meshCollectionFactory)
        {
            return SmartShapeCollection._meshCollectionFactory(meshes) as meshup.ShapeCollection<meshup.Mesh>
        }
        return new ShapeCollection(...meshes) as meshup.ShapeCollection<meshup.Mesh>
    }

    _toBrepCollection(): any | null
    {
        if (!SmartShapeCollection._brepCollectionFactory)
        {
            console.warn('SmartShapeCollection._toBrepCollection(): brep adapter not set — call SmartShapeCollection.setAdapters() first.')
            return null
        }
        const brepShapes = this._shapes
            .map(s => (s as any).toBrep())
            .filter(s => s != null)
        return SmartShapeCollection._brepCollectionFactory(brepShapes)
    }

    private _isMeshOnlyCollection(): boolean
    {
        return this._shapes.length > 0 && this._shapes.every(s => (s as any)?.mode === 'mesh')
    }

     //// SCENE MANAGEMENT FOR MESH AND BREP ////

    /** Name this collection. For scene-backed collections this names the backing
    *  layer node (individual shape nodes keep their own names). Returns this. */
    name(value: string): this
    {
        this._name = value
        if (this._layer) this._layer.name = value
        return this
    }

      override add(...shapes: any[]): this
    {
        const before = this._shapes.length
        super.add(...shapes)
        if (this._layer)
        {
            // Re-parent newly-added shapes out of the flat active layer into this
            // collection's layer. addShape() moves an existing node if present.
            this._shapes.slice(before).forEach(s => this._layer!.addShape(s as any))
        }
        return this
    }

    override addGroup(groupName: string, shapes: any): this
    {
        super.addGroup(groupName, shapes)
        if (this._layer)
        {
            // Move this group's shapes into a named sub-layer under the collection
            // layer. addLayer() -> addShape() re-parents each existing node.
            const groupCol = this._groups.get(groupName)
            if (groupCol) this._layer.addLayer(groupName, groupCol as any)
        }
        return this
    }

    override hide(): this
    {
        super.hide()
        this._layer?.hide()
        return this
    }

    override show(): this
    {
        super.show()
        this._layer?.visible(true)
        return this
    }

    /** Navigate to a scene node within this collection's layer.
     *  No argument → returns the root layer node.
     *  Dot-separated path → traverses descendants level by level. */
    node(searchStr?: string): SmartSceneNode | null
    {
        if (!this._layer) return null
        if (!searchStr) return this._layer

        const parts = searchStr.split('.')
        let current: SmartSceneNode | undefined = this._layer

        for (const part of parts)
        {
            current = current.find(part) as SmartSceneNode | undefined
            if (!current) return null
        }

        return current ?? null
    }

    removeFromScene(): this
    {
        const sceneShapes = this._shapes.filter(shape => Boolean((shape as any)?._node))

        if (!this._layer && sceneShapes.length === 0)
        {
            console.warn(`${this.constructor.name}.removeFromScene(): collection is not in the scene`)
            return this
        }

        sceneShapes.forEach(shape => (shape as any).removeFromScene?.())

        if (this._layer)
        {
            this._layer.detach()
            this._layer = null
        }

        return this
    }

    //// SHAPE CREATION METHODS (MESH AND BREP) ////

    /** Orthographic elevation onto the 'elevation' layer. */
    @sceneLayer('elevation')
    elevation(side?: any, all?: boolean): SmartShapeCollection
    {
        return this._toMeshCollection()?.elevation(side, all) as any
    }

    /** Isometric projection, added to the active scene layer. */
    @sceneAdd
    isometry(viewpoint?: any, hiddenLines = false, includeHiddenShapes = false): SmartShapeCollection
    {
        // Delegate to the underlying mesh collection (mirrors elevation()); the prior
        // implementation called this.isometry() and recursed forever.
        return this._toMeshCollection()?.isometry(viewpoint, hiddenLines, includeHiddenShapes) as any;
    }

    /** Isometric projection, added to the 'iso' scene layer. */
    @sceneLayer('iso')
    iso(viewpoint?: any, hiddenLines = false, includeHiddenShapes = false): SmartShapeCollection
    {
        return this._toMeshCollection()?.isometry(viewpoint, hiddenLines, includeHiddenShapes) as any;
    }

    alignByPoints(sourcePoints: any[], targetPoints: any[], withScale?: boolean): this
    {
        this._shapes.forEach(s => (s as any).alignByPoints?.(sourcePoints, targetPoints, withScale))
        return this
    }

   
    //// ITERATION ////

     find(fn: (s: AnySmartShape, i: number, arr: AnySmartShape[]) => boolean): AnySmartShape | undefined
    {
        return this._shapes.find(fn)
    }

    override filter(fn: (s: AnySmartShape, i: number, arr: AnySmartShape[]) => boolean): SmartShapeCollection
    {
        const result = new SmartShapeCollection()
        result._shapes = this._shapes.filter(fn)
        return result
    }

    reduce<T>(fn: (acc: T, s: AnySmartShape, i: number, arr: AnySmartShape[]) => T, initial: T): T
    {
        return this._shapes.reduce(fn, initial)
    }

    override toString(): string
    {
        const groups = Array.from(this._groups.keys())
        const types = [...new Set(this._shapes.map(s => s.type))].join(',')
        return `<SmartShapeCollection shapes="${this._shapes.length}"${groups.length > 0 ? ` groups="${groups.join(',')}"` : ''} types="${types}">`
    }

    every(fn: (s: AnySmartShape, i: number, arr: AnySmartShape[]) => boolean): boolean
    {
        return this._shapes.every(fn)
    }

    /** Iterate over named groups. If no groups exist, yields one "main" group
     *  containing all shapes. Callback receives (groupName, collection, index). */
    forEachGroup(fn: (groupName: string, col: SmartShapeCollection, index: number) => void): this
    {
        if (this._groups.size === 0)
        {
            fn('main', this, 0)
            return this
        }
        let i = 0
        this._groups.forEach((groupCol, groupName) =>
        {
            const smart = new SmartShapeCollection()
            smart._shapes = groupCol.toArray() as AnySmartShape[]
            fn(groupName, smart, i++)
        })
        return this
    }

    //// MERGE OVERRIDE (parent uses MeshJs directly; @toSmart re-wraps as SmartMesh) ////
    // TODO: remove
    @toSmart
    override merge(): AnySmartShape | null
    {
        const meshCol = this._toMeshCollection()
        return (meshCol ? ((meshCol as any).unionAll?.() ?? (meshCol as any).merge?.()) : null) as any
    }


    //// BREP ONLY ////
    // TODO: some of these methods can be remove / made consistent between mesh/brep

    toOcCompound(): any { return this._toBrepCollection()?.toOcCompound() ?? null }

    @toSmart getShapesByType(type: string): SmartShapeCollection 
    { 
        return (this._toBrepCollection()?.getShapesByType(type) ?? []) as any 
    }
    
    @toSmart getShapesByTypes(types: string[]): SmartShapeCollection 
    { 
        return (this._toBrepCollection()?.getShapesByTypes(types) ?? []) as any 
    }

    vertices(): SmartShapeCollection { return this.getShapesByType('Vertex') }
    edges(): SmartShapeCollection    { return this.getShapesByType('Edge') }
    wires(): SmartShapeCollection    { return this.getShapesByType('Wire') }
    faces(): SmartShapeCollection    { return this.getShapesByType('Face') }
    shells(): SmartShapeCollection   { return this.getShapesByType('Shell') }
    solids(): SmartShapeCollection   { return this.getShapesByType('Solid') }

    lowestType(): string | undefined { return this._toBrepCollection()?.lowestType() }

    @toSmart project(planeNormal?: any, all?: boolean): SmartShapeCollection { return (this._toBrepCollection()?.project(planeNormal, all) ?? []) as any }
    @toSmart select(selectString: string): SmartShapeCollection 
    { 
        return (this._toBrepCollection()?.select(selectString) ?? []) as any 
    }

    @toSmart visible(): SmartShapeCollection { return (this._toBrepCollection()?.visible() ?? []) as any }
    @toSmart extrude(amount?: number, direction?: any): SmartShapeCollection { return (this._toBrepCollection()?.extrude(amount, direction) ?? []) as any }
    @toSmart thicken(amount: number, direction?: any): SmartShapeCollection { return (this._toBrepCollection()?.thicken(amount, direction) ?? []) as any }
    @toSmart fillet(radius: number, at?: any): SmartShapeCollection { return (this._toBrepCollection()?.fillet(radius, at) ?? []) as any }
    @toSmart intersections(others: any): SmartShapeCollection { return (this._toBrepCollection()?.intersections(others) ?? []) as any }
    @toSmart intersecting(other: any): SmartShapeCollection { return (this._toBrepCollection()?.intersecting(other) ?? []) as any }
   

    //// EXPORT ////
    // TODO: make consistent between mesh/brep
    

    override async toGLB(up: Axis = 'z'): Promise<Uint8Array>
    {
        if (this._layer) return this._layer.toGLB(up)
        return super.toGLB(up)
    }

    override async toGLTF(up: Axis = 'z'): Promise<string>
    {
        if (this._layer) return this._layer.toGLTF(up)
        return super.toGLTF(up)
    }
}
