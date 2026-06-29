/**
 *   
 *   Modeler.ts
 * 
 *   General modeling API wrapping Brep and Mesh modeling. 
 *   
 *   - Multimode shapes: Modeler can switch between different modes: mesh or brep
 *      - Mesh is using Meshup and is faster, more robust and smaller WASM size, but less accurate
 *      - BREP is using OpenCascade and is more accurate, but slow, brittle and big WASM
 
 *   - SmartShapes: Offer unified interface over different kernel shapes, with automatic conversion and delegation to the underlying kernel shape.
 *  
 *   Basic functionality of modeler:
 *    - Basic settings: units(), 
 *    - Explicit switching of mode: mesh(), brep() [hopefully not needed]
 *    - Create primitive shapes: box(), sphere(), boxbetween()
 *    - Add shapes automatically to shape at appropriate place
 *    - 2D sketching: sketch('xy).lineTo(100,10) ...
 *    - Scene management:
 *          - create layers: layer('diagram').color
 *          - capture shapes at given code intervals (TODO)
 * 
 *   TODO:
 *      - bring API of Meshup and Brep kernels closer together
 *          for example: Meshup.Mesh.Box() vs Brep.Solid.makeBox()
 *  
 */


import type { ArchiyouModules, ArchiyouStateData } from "../types";
import type { ModelMode, ModelUnits, KernelClasses, ModelerSceneExportGLTFOptions } from "./types";

import { ModelModeSchema, ModelUnitsSchema, PointLikeSchema } from "./schemas";

import { Type } from 'typebox'

import { validate, optional } from "../decorators";
import {
    SmartMeshCurve,
    SmartMesh,
    SmartMeshVertex,
    SmartMeshPolygon,
    SmartBrepEdge,
    SmartBrepWire,
    SmartBrepFace,
    SmartBrepShell,
    SmartBrepSolid,
    type AnySmartShape, isAnySmartShape,
    SmartShapeFace,
} from "./SmartShapes";

import { SmartSceneNode } from "./SmartSceneNode";

// Meshup namespace — imported as value (for instanceof) and type
import * as meshup from 'meshup/src/index'

import type { Meshup } from 'meshup/src/index'
import type { Brep } from './brep/index'

// Brep is loaded lazily in _loadBrep() to avoid pulling in the OpenCascade WASM at startup
let brep: Brep | null = null;
import { SmartShapeCollection } from "./SmartShapeCollection";
import { SceneNodeGraphNode } from "meshup/src/types";
import { Layouter } from "./Layouter";
import { GLTFBuilder } from "../GLTFBuilder";
import { Make } from './Make';

import { GLTF_ANIMATION_DURATION } from '../constants';

// Union classes that combine meshup and brep
type PointLike = meshup.PointLike // only use one
type Point = meshup.Point | brep.Point
type Vector = meshup.Vector | brep.Vector
type Vertex = meshup.Vertex | brep.Vertex


export class Modeler
{
    private _mode: ModelMode = 'mesh'
    
    private _kernels = {
        mesh: null as Meshup | null,
        brep: null as Brep | null, // TODO: load OpenCascade WASM and assign here
    } as Record<ModelMode, any>

    declare private _modules: ArchiyouModules
    private _units: ModelUnits

    declare private _scene: SmartSceneNode
    declare private _activeLayer: SmartSceneNode | null
    declare private _activeSketch: any
    declare private _make: Make
    
    stats:Record<string,any> = {}; // stats of last operation

    constructor(mode: ModelMode = 'mesh', units: ModelUnits = 'mm')
    {
        this._mode = mode;
        this._units = units;

        this.reset();

        console.info('Modeler initialized. Please use load() to load primary shape kernel. Use setArchiyou() to set archiyou modules.')
    }

    setArchiyou(modules: ArchiyouModules)
    {
        this._modules = modules;
        this.setMake();
    }

    /** Make are some handy modules. 
     *  Set it on this Modeler instance
     *  user can access them with modeler.make.wall()  */
    setMake()
    {
        this._make = new Make(this);
        this._make.setArchiyou(this._modules);
    }

    /** Public access to the archiyou modules (annotator, calc, docs, console, ...) */
    get modules(): ArchiyouModules
    {
        return this._modules;
    }

    /** Alias for modules */
    get archiyou(): ArchiyouModules
    {
        return this._modules;
    }

    /** Can instance of Make */
    get make(): Make
    {
        if(!this._make) throw new Error('Make module not set. Call setArchiyou() first.');
        return this._make;
    }

    /** Reset state */
    reset()
    {
        this._scene = SmartSceneNode.root('root'); // new scene root
        this._activeLayer = this._scene;
        this.setMake();
    }

    /** Get active kernel */
    kernel(): Meshup|Brep
    {
        return this._kernels[this._mode];
    }

    /** Switch model kernels, load if needed */
    async switch():Promise<ModelMode>
    {
        this._mode = this._mode === 'mesh' ? 'brep' : 'mesh';
        await this.load();
        return this._mode;
    }

    //// LOADING OF KERNELS ////

    /** Dynamically load primary shape kernel */
    async load(): Promise<this>
    {
        if(!this._kernels[this._mode])
        {
            try {
                    if(this._mode === 'mesh')
                    {
                        await this._loadMeshup();    
                    }
                    else {
                        await this._loadBrep();
                    }
                }
            catch (e)
            {
                console.error(`Failed to load ${this._mode} kernel:`, e);
                throw e;
            }            
        }

        return this;
    }

    async _loadMeshup()
    {
        console.info('Modeler: Loading Meshup kernel...');
        const t = performance.now();
        this._kernels.mesh = (await import('meshup/src/index')) as Meshup;
        await this._kernels.mesh.init(); // load wasm
        console.info(`Modeler: Meshup loaded successfully in ${Math.round(performance.now() - t)} ms.`);
        console.info(`With these methods/classes: "${Object.keys(this._kernels.mesh)}"`);
    }

    async _loadBrep()
    {
        console.info('Modeler: Loading BREP kernel...');
        const t = performance.now();
        this._kernels.brep = (await import('./brep/index')) as Brep;
        brep = this._kernels.brep; // make available to method bodies that reference the brep namespace
        const oc = await this._kernels.brep.init(); // load wasm

        console.info(`Modeler: BREP kernel loaded successfully in ${Math.round(performance.now() - t)} ms.`);
        console.info(`With these methods/classes: "${Object.keys(this._kernels.brep)}"`);
    }

    /* At least one kernel is loaded */
    loaded():boolean
    {
        return !!this._kernels.mesh || !!this._kernels.brep;
    }

    /** Copy already-loaded kernel references from another Modeler (e.g. the Runner's pre-loaded modeler) */
    inheritKernels(source: Modeler): this
    {
        (Object.keys(source._kernels) as ModelMode[]).forEach(mode =>
        {
            if (source._kernels[mode] && !this._kernels[mode])
                this._kernels[mode] = source._kernels[mode];
        });
        return this;
    }


    /** Get class constructors from the active kernel */
    get classes(): KernelClasses
    {
        const k = this.kernel();
        if (!k) throw new Error(`Modeler.classes: kernel '${this._mode}' is not loaded. Call load() first.`);
        return k as KernelClasses;
    }

    scene(): SmartSceneNode
    {
        return this._scene;
    }

    layouter(): Layouter
    {
        return new Layouter(this._scene)
    }

    /** Add a Smart* shape (or array of Smart* shapes) to the scene at the active layer. */
    addToScene(shape: AnySmartShape | Array<AnySmartShape>): SmartSceneNode
    {
        const shapes = Array.isArray(shape) ? shape : [shape];
        if (!shapes.every(s => isAnySmartShape(s)))
        {
            throw new Error('Modeler::addToScene(): argument must be a Smart* shape or array of Smart* shapes.');
        }
        shapes.forEach(s => this._activeLayer.addShape(s as any));
        return this._activeLayer;
    }

    /** Set Modeler mode: mesh (default) or brep */
    @validate(ModelModeSchema)
    mode(m?:ModelMode):ModelMode
    {
        if(m){ this._mode = m } // setter
        return this._mode;
    }

    @validate(ModelUnitsSchema)
    units(u?:ModelUnits):ModelUnits
    {
        if(u){ this._units = u } // setter
        return this._units;
    }

    //// ==== MODELING PRIMITIVES ==== ////

    //// POINTLIKES ////

    /** Creates a 2D/3D Point */
    @validate(PointLikeSchema)
    point(xp?:PointLike, y?:number, z?:number): Point
    {
        return (this.mode() === 'mesh')
            ? new meshup.Point(xp, y, z) as meshup.Point
            : new brep.Point(xp as brep.PointLike, y, z) as brep.Point
    }

    /** Creates a 2D/3D Vector */
    @validate(PointLikeSchema)
    vector(xp?:PointLike, y?:number, z?:number): Vector
    {
        return (this.mode() === 'mesh')
            ? new meshup.Vector(xp, y, z) as meshup.Vector
            : new brep.Vector(xp as brep.PointLike, y, z) as brep.Vector
    }


    /** Creates a Vertex */
    @validate(PointLikeSchema)
    vertex(xp?:PointLike, y?:number, z?:number): Vertex
    {
        return (this.mode() === 'mesh')
            ? new meshup.Vertex(meshup.Point.from(xp, y, z)) as meshup.Vertex // TODO: fix better
            : new brep.Vertex(xp as brep.PointLike, y, z) as brep.Vertex
        // TODO: add to scene
    }


    //// LINEAR SHAPES ////

    /** Creates a Line Curve */
    @validate(PointLikeSchema, PointLikeSchema)
    line(start: PointLike, end: PointLike): SmartMeshCurve | SmartBrepEdge
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Line(start, end) as meshup.Curve)
            : SmartBrepEdge.from(this, new brep.Edge(start as brep.PointLike, end as brep.PointLike) as brep.Edge)
        this.addToScene(shape);
        return shape;
    }

    /** Makes an Arc through start, mid and end Point */
    @validate(PointLikeSchema, PointLikeSchema, PointLikeSchema)
    arc(start: PointLike, mid: PointLike, end: PointLike): SmartMeshCurve | SmartBrepEdge
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Arc(start, mid, end) as meshup.Curve)
            : SmartBrepEdge.from(this, new brep.Edge().makeArc(start as brep.PointLike, mid as brep.PointLike, end as brep.PointLike) as brep.Edge)
        this.addToScene(shape);
        return shape;
    }

    /** Makes a Spline going through given Points */
    spline(...points: PointLike[]): SmartMeshCurve | SmartBrepEdge
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Interpolated(...points) as meshup.Curve)
            : SmartBrepEdge.from(this, new brep.Edge().makeSpline(points as brep.PointLike[]) as brep.Edge)
        this.addToScene(shape);
        return shape;
    }

    /** Makes a Polyline through multiple points */
    polyline(points: PointLike | PointLike[], ...args: PointLike[]): SmartMeshCurve | SmartBrepWire
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Polyline(points, ...args) as meshup.Curve)
            : SmartBrepWire.from(this, new brep.Wire().fromVertices(
                Array.isArray(points) ? [...points, ...args] as brep.PointLike[] : [points, ...args] as brep.PointLike[]
              ) as brep.Wire)
        this.addToScene(shape);
        return shape;
    }

    /** Makes a 2D Spiral — brep only */
    spiral(...args: any[]): SmartBrepWire
    {
        if (this.mode() === 'mesh') { throw new Error('spiral(): not available in mesh mode') }
        const shape = SmartBrepWire.from(this, (new brep.Wire() as any).makeSpiral(...args) as brep.Wire)
        this.addToScene(shape);
        return shape;
    }

    /** Makes a Helix — brep only */
    helix(...args: any[]): SmartBrepWire
    {
        if (this.mode() === 'mesh') { throw new Error('helix(): not available in mesh mode') }
        const shape = SmartBrepWire.from(this, (new brep.Wire() as any).makeHelix(...args) as brep.Wire)
        this.addToScene(shape);
        return shape;
    }

    //// CLOSED 2D SHAPES ////

    /** Creates a rectangular Curve */
    rect(width: number = 100, depth: number = 100, center: PointLike = [0, 0, 0]): SmartMeshCurve | SmartBrepWire
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Rect(width, depth, center) as meshup.Curve)
            : SmartBrepWire.from(this, new brep.Wire().makeRect(width, depth, center as brep.PointLike) as brep.Wire)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a rectangular Curve between two Points */
    @validate(PointLikeSchema, PointLikeSchema)
    rectBetween(from: PointLike, to: PointLike): SmartMeshCurve | SmartBrepFace
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.RectBetween(from, to) as meshup.Curve)
            : SmartBrepFace.from(this, new brep.Face().makeRectBetween(from as brep.PointLike, to as brep.PointLike) as unknown as brep.Face)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a closed planar Polygon from 3+ points */
    polygon(vertices: PointLike[]): SmartMeshPolygon | SmartBrepFace
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshPolygon.from(this, new meshup.Polygon(vertices) as meshup.Polygon)
            : SmartBrepFace.from(this, new brep.Face().fromVertices(vertices as brep.PointLike[]) as brep.Face)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a circular Curve */
    circle(radius: number = 50, center: PointLike = [0, 0, 0]): SmartMeshCurve | SmartBrepEdge
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshCurve.from(this, meshup.Curve.Circle(radius, center) as meshup.Curve)
            : SmartBrepEdge.from(this, new brep.Edge().makeCircle(radius, center as brep.PointLike) as brep.Edge)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a planar surface */
    plane(...args: any[]): SmartMesh | SmartBrepFace
    {
        if (this.mode() === 'mesh')
        {
            const [
                width = 50,
                depth = 50,
                position = [0, 0, 0],
                normal = [0, 0, 1],
            ] = args as [number?, number?, PointLike?, PointLike?]

            const baseMesh = meshup.Curve.Rect(width, depth, [0, 0, 0]).toMesh()
            if (!baseMesh)
            {
                throw new Error('plane(): failed to create mesh plane surface.')
            }

            const shape = SmartMesh.from(this, baseMesh as meshup.Mesh)
            const normalVector = new meshup.Vector(normal)
            if (normalVector.length() === 0)
            {
                throw new Error('plane(): normal must be a non-zero vector.')
            }

            const targetNormal = normalVector.normalize()
            const baseNormal = new meshup.Vector(0, 0, 1)
            if (!baseNormal.equals(targetNormal))
            {
                shape.rotateQuaternion(baseNormal.rotationBetween(targetNormal))
            }

            shape.move(position)
            this.addToScene(shape)
            return shape
        }

        const shape = SmartBrepFace.from(this, (new brep.Face() as any).makePlane(...args) as brep.Face)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a planar Face between two Points */
    @validate(PointLikeSchema, PointLikeSchema)
    planeBetween(from: PointLike, to: PointLike): SmartShapeFace
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMeshPolygon.from(this, meshup.Polygon.planeBetween(from, to) as meshup.Polygon)
            : SmartBrepFace.from(this, (new brep.Face() as any).makePlaneBetween(from, to) as brep.Face)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a base plane along a main axis — brep only */
    basePlane(...args: any[]): SmartBrepFace
    {
        if (this.mode() === 'mesh') { throw new Error('basePlane(): not available in mesh mode') }
        const shape = SmartBrepFace.from(this, (new brep.Face() as any).makeBasePlane(...args) as brep.Face)
        this.addToScene(shape);
        return shape;
    }

    //// 3D SHAPES ////

    /** Creates a Box shape */
    @validate(Type.Number(), Type.Number(), Type.Number(), optional(PointLikeSchema))
    box(width: number = 100, depth?: number, height?: number, position?: PointLike): SmartSolid
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMesh.from(this, meshup.Mesh.Box(width, depth, height) as meshup.Mesh)
            : SmartBrepSolid.from(this, new brep.Solid().makeBox(width, depth, height) as brep.Solid)
        if (position) { (shape as any).move(position) }
        this.addToScene(shape);
        return shape;
    }

    /** Alias for box */
    @validate(Type.Number(), Type.Number(), Type.Number(), optional(PointLikeSchema))
    cube(width: number = 100, depth?: number, height?: number, position?: PointLike): SmartMesh | SmartBrepSolid
    {
        return this.box(width, depth, height, position)
    }

    /** Creates a Box shape between two Points */
    @validate(PointLikeSchema, PointLikeSchema)
    boxBetween(from: PointLike, to: PointLike): SmartMesh | SmartBrepSolid
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMesh.from(this, meshup.Mesh.BoxBetween(from, to) as meshup.Mesh)
            : SmartBrepSolid.from(this, new brep.Solid().makeBoxBetween(from as brep.PointLike, to as brep.PointLike) as brep.Solid)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a Sphere shape */
    @validate(Type.Number(), PointLikeSchema)
    sphere(radius: number = 50, position?: PointLike): SmartMesh | SmartBrepSolid
    {
        const shape = (this.mode() === 'mesh')
            ? (() => { const m = SmartMesh.from(this, meshup.Mesh.Sphere(radius) as meshup.Mesh); if (position) (m as any).move(position); return m })()
            : SmartBrepSolid.from(this, new brep.Solid().makeSphere(radius, position as brep.PointLike) as brep.Solid)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a Cone — brep only */
    cone(...args: any[]): SmartBrepSolid
    {
        if (this.mode() === 'mesh') { throw new Error('cone(): not available in mesh mode') }
        const shape = SmartBrepSolid.from(this, new brep.Solid().makeCone(...args) as brep.Solid)
        this.addToScene(shape);
        return shape;
    }

    /** Creates a Cylinder shape */
    @validate(Type.Number(), Type.Number(), PointLikeSchema)
    cylinder(radius: number = 50, height: number = 100, position?: PointLike): SmartMesh | SmartBrepSolid
    {
        const shape = (this.mode() === 'mesh')
            ? SmartMesh.from(this, meshup.Mesh.Cylinder(radius, height) as meshup.Mesh)
            : SmartBrepSolid.from(this, new brep.Solid().makeCylinder(radius, height, position as brep.PointLike) as brep.Solid)
        if (position) { (shape as any).move(position) }
        this.addToScene(shape);
        return shape;
    }

    //// ==== SCENE MANAGEMENT ==== ////

    activeLayer(): SmartSceneNode | null
    {
        return this._activeLayer;
    }

    layerShapes(): SmartShapeCollection
    {
        return this._activeLayer ? this._activeLayer.shapes() : new SmartShapeCollection();
    }

    /** Create or activate a named layer 
     *  a layer is always created as sibling of the active layer, and becomes the new active layer.
    */
    layer(name?: string): SmartSceneNode
    {
        if (!name) { return this._activeLayer ?? null }
        
        // Check if layer name exists
        const existingLayers = this.scene()
            .findAll(n => n.name === name);
            
        if(existingLayers.length > 0)
        { 
            if(existingLayers.length > 1){ console.warn(`Multiple layers with name "${name}" found. Getting the first one.`) }
            return existingLayers[0] as any as SmartSceneNode;
        }
        
        const layer = new SmartSceneNode(name);
        (this._activeLayer.parent() || this._activeLayer).addChild(layer as any);
        this._activeLayer = layer;
        console.info(`Modeler::layer(): Created and switched to layer "${name}".`);
        return this._activeLayer;
    }

    /** Return all Shapes in the scene as a ShapeCollection */
    all(): SmartShapeCollection
    {
        if(!this._scene){ return new SmartShapeCollection(); }
        return new SmartShapeCollection((this._scene as any).shapes());
    }

    /** @alias all */
    allShapes(): SmartShapeCollection
    {
        return this.all();
    }

    /** Create a scene-backed SmartShapeCollection. Its shapes (and groups) are
     *  nested under a new layer parented at the current active layer. */
    collection(...args: Array<any>): SmartShapeCollection
    {
        const col = new SmartShapeCollection() // empty: keep constructor scene-agnostic
        col._modeler = this
        const layer = new SmartSceneNode(col._name)
        this._activeLayer.addChild(layer as any) // child of active layer; do NOT reassign _activeLayer
        col._layer = layer
        args.forEach(arg => col.add(arg))
        return col
    }


    /** Select shapes by a selection string — delegates to the active sketch when in sketch mode. */
    select(selectionString: string): any
    {
        if (this._activeSketch && typeof this._activeSketch.select === 'function')
        {
            return this._activeSketch.select(selectionString)
        }
        console.warn('Modeler::select(): only available inside a sketch or in brep mode')
    }

    /** Operate at vertices — delegates to active sketch. */
    atVertices(): any
    {
        if (this._activeSketch && typeof this._activeSketch.atVertices === 'function')
        {
            return this._activeSketch.atVertices()
        }
        console.warn('Modeler::atVertices(): only available inside a sketch or in brep mode')
    }

    //// ==== SKETCH API ==== ////
    // These methods start a sketch or forward drawing commands to the active sketch.
    // meshup.Sketch handles mesh mode; brep.Sketch handles brep mode.

    /** Start a 2D sketch on a given base plane.
     *  In mesh mode creates a meshup.Sketch; in brep mode creates a brep.Sketch. */
    sketch(plane: any = 'xy', yAxis?: any): meshup.Sketch | brep.Sketch
    {
        if (this._mode === 'mesh')
        {
            this._activeSketch = new meshup.Sketch(plane);
            // we register a callback to capture the result and add to scene
            this._activeSketch.onEnd((curves) =>
            {
                const smartCurves = (curves as meshup.ShapeCollection<meshup.Curve>)
                                        .toArray()
                                        .map(c => SmartMeshCurve.from(this, c));
                this.addToScene(smartCurves);
                return smartCurves.length === 1 ? smartCurves[0] : new SmartShapeCollection(...smartCurves);
            });
            return this._activeSketch
        }
        if (this._kernels.brep)
        {
            this._activeSketch = new (this._kernels.brep.Sketch)(plane, yAxis)
            return this._activeSketch
        }
    }


    //// OUTPUT ////

    toGraph():SceneNodeGraphNode
    {
        return this.scene().toGraph()
    }

    async toGLB(options?: ModelerSceneExportGLTFOptions): Promise<Uint8Array>
    {
        return this._exportGLBWithOptions(options)
    }

    async toGLTF(options?: ModelerSceneExportGLTFOptions): Promise<string>
    {
        const glb = await this._exportGLBWithOptions(options)
        return new GLTFBuilder(glb).toGLTF();
    }


    toSVG(): string
    {
        return this.scene().toSVG()
    }

    /** Build the ArchiyouStateData payload (scenegraph + annotations + managedHandles) used by
     *  RunnerScriptExecutionResult.state and embedded in GLB extras. */
    toArchiyouState(annotations: Array<any> = [], managedHandles?: import('../interaction/types').ManagedHandlesData, interactiveShapes?: Array<string>): ArchiyouStateData
    {
        const sceneRoot = this.scene();
        sceneRoot?.pruneEmptyNodes();
        return {
            scenegraph: sceneRoot ? sceneRoot.toData(true) : undefined,
            annotations,
            ...(managedHandles !== undefined ? { managedHandles } : {}),
            ...(interactiveShapes !== undefined ? { interactiveShapes } : {}),
        };
    }

    //// UTILS ////

    /** @internal Ensure an active sketch exists; throws a descriptive error if not. */
    private _requireSketch(method: string): any
    {
        if (!this._activeSketch)
        {
            throw new Error(
                `Modeler::${method}(): no active sketch. Call sketch() first.`
            )
        }
        return this._activeSketch
    }

    private async _exportGLBWithOptions(options?: ModelerSceneExportGLTFOptions): Promise<Uint8Array>
    {
        // Settings
        const ANIMATION_DEFS = [
            {
                name: 'exploded',
                build: (layouter: Layouter) => layouter.exploded(),
            },
            {
                name: 'layout',
                build: (layouter: Layouter) => layouter.rowOrtho(),
            },
        ]

        console.info(`Modeler::toGLB(): exporting scene with ${this.scene().shapes().length} shapes...`);

        // Remove empty container nodes before export (e.g. pre-allocated Make group slots)
        this.scene().pruneEmptyNodes();

        // Base GLB
        const glb = await this.scene().toGLB();
        const builder = new GLTFBuilder(glb);

        // Animations
        if (options?.animations)
        {
            const animations = ANIMATION_DEFS.map(({ name, build }) =>
            {
                const layouter = build(new Layouter(this.scene()))
                return {
                    result: layouter.result(),
                    options: {
                        duration: options?.duration ?? GLTF_ANIMATION_DURATION,
                        interpolation: options?.interpolation,
                        animationName: name,
                    },
                }
            });

            await builder.addAnimations(animations);
        }

        // Archiyou state in GLTF extras: scenegraph (path-keyed) + annotations.
        // Mirrors RunnerScriptExecutionResult.state so a standalone .glb still
        // carries the data the viewer/scene-navigator need. Legacy `annotations`
        // key is also written for one back-compat cycle on the read side.
        const anns = (options as any)?.annotations
            ? (this._modules?.annotator?.getAnnotationsData?.() ?? [])
            : [];
        const archiyouState = this.toArchiyouState(anns);
        await builder.addData({ state: archiyouState });
        if (anns.length)
        {
            await builder.addData({ annotations: anns });
        }

        // finalize GLB
        return await builder.toGLB();
    }

    /** @internal Guard for brep-only sketch methods. */
    private _requireBrepSketch(method: string): void
    {
        if (this._mode === 'mesh')
        {
            throw new Error(
                `Modeler::${method}(): not available on a mesh-mode sketch. ` +
                `Switch to brep mode or use the equivalent meshup.Sketch methods directly.`
            )
        }
    }

    /** @internal Guard for mesh-only sketch methods. */
    private _requireMeshSketch(method: string): void
    {
        if (this._mode !== 'mesh')
        {
            throw new Error(
                `Modeler::${method}(): only available on a mesh-mode sketch.`
            )
        }
    }

}