/**
 *  shapeAnnotations.ts
 *
 *  The single place the app-specific "visual" methods live. The modeler works with plain
 *  meshup shapes directly (the old Smart* wrapper layer is gone), so these methods — which
 *  forward into core's Annotator / MaterialManager / Interactor / DXFExporter — are
 *  prototype-augmented onto the meshup classes at module load.
 *
 *  Runtime: patch `meshup.Shape.prototype` (and SceneNode / ShapeCollection for toDXF).
 *  Types:   declaration-merge the signatures onto the meshup interfaces so `box().dim()`
 *           type-checks without any subclass or prototype-swap.
 *
 *  Each method reaches the app via the shape's own opaque `_modeler` reference (set by
 *  Modeler when the shape is adopted). meshup itself never calls `_modeler`.
 *
 *  Import this module for its side effects once, before any script runs (see Modeler.ts).
 */

import * as meshup from 'meshup/src/index'
import { buildDXF, type toDXFOptions } from './DXFExporter'
import { buildDAE, type toDAEOptions } from './DAEExporter'
import type { DimensionOptions, LabelOptions } from '../annotator/types'

//// TYPE AUGMENTATION (declaration merging) ////

declare module 'meshup/src/Shape' {
    interface Shape {
        /** Kernel a shape belongs to. meshup shapes are always the mesh kernel. */
        readonly mode: 'mesh'
        /** Access the archiyou modules (annotator, materials, interactor, …) via the host modeler. */
        readonly _ay: any
        /** Create dimension line(s) for this shape (Annotator). */
        dimension(options?: DimensionOptions): any
        /** Alias for dimension(). */
        dim(options?: DimensionOptions): any
        /** Attach a free-text label at this shape's center (Annotator). */
        label(value: string, options?: LabelOptions): any
        /** Assign (setter, chainable) or read (getter → BoundMaterial) this shape's material. */
        material(name?: string): any
        /** Mass/weight in the active unit system. Shortcut for material().weight(). */
        weight(): number | undefined
        /** Embodied carbon (kgCO2e) of this shape. Defaults to cradle-to-gate A1-A3. */
        carbon(modules?: any): number | undefined
        /** True when this shape is currently selected (clicked) in the viewer. */
        selected(): boolean
        /** Make this shape clickable in the viewer and react to selection. */
        onClick(cb: (shape: this) => void): this
        /** Add this shape to the modeler's active scene layer. */
        addToScene(): this
    }
}

declare module 'meshup/src/SceneNode' {
    interface SceneNode {
        /** Export this subtree's 2D shapes (+ linked dimension lines) to DXF. */
        toDXF(options?: toDXFOptions): string | null
        /** Export this subtree to COLLADA (.dae), preserving the node hierarchy. */
        toDAE(options?: toDAEOptions): Promise<string | null>
        /** Total mass (kg) of the materialized shapes in this subtree. */
        weight(): number | undefined
        /** Total embodied carbon (kgCO2e) of the materialized shapes in this subtree. */
        carbon(): number | undefined
        /** Per-material mass/carbon breakdown — feed to calc.table('carbon', …). */
        materialTotals(): any
    }
}

declare module 'meshup/src/ShapeCollection' {
    interface ShapeCollection {
        /** Export the 2D shapes in this collection (+ linked dimension lines) to DXF. */
        toDXF(options?: toDXFOptions): string | null
        /** Total mass (kg) of the materialized shapes in this collection. */
        weight(): number | undefined
        /** Total embodied carbon (kgCO2e) of the materialized shapes in this collection. */
        carbon(): number | undefined
        /** Per-material mass/carbon breakdown — feed to calc.table('carbon', …). */
        materialTotals(): any
    }
}

//// RUNTIME AUGMENTATION ////

const ShapeProto = meshup.Shape.prototype as any

Object.defineProperty(ShapeProto, 'mode', {
    get() { return 'mesh' },
    configurable: true,
})

Object.defineProperty(ShapeProto, '_ay', {
    get(this: any) { return this._modeler?.modules },
    configurable: true,
})

/** Create dimension line(s) for this shape. Centralized in the Annotator. */
ShapeProto.dimension = function (this: any, options?: DimensionOptions) {
    return this._ay?.annotator?.dimensionLine()?.fromShape(this, options)
}

/** Alias for dimension() */
ShapeProto.dim = function (this: any, options?: DimensionOptions) {
    return this.dimension(options)
}

/** Attach a free-text label at this shape's center. Rendered by the viewer as an overlay. */
ShapeProto.label = function (this: any, value: string, options?: LabelOptions) {
    return this._ay?.annotator?.label()?.fromShape(this, value, options)
}

/**
 *  Assign or read the material of this shape.
 *  Setter (chainable): stores the material name and mirrors it onto the render style so the
 *  GLTF export can apply PBR + textures. Getter (no arg): returns a BoundMaterial with
 *  derived calculations (.weight(), .mass(), …), or null.
 */
ShapeProto.material = function (this: any, name?: string) {
    const manager = this._ay?.materials
    if (name === undefined) {
        return manager?.resolve(this._material, this) ?? null
    }
    this._material = name
    // mirror onto the render style (best-effort — used by GLTF export)
    const style = this.style
    if (style) {
        const spec = manager?.get(name) ? manager.renderSpec(manager.get(name)) : name
        style.material = spec ?? name
    }
    return this
}

/** Mass/weight of this shape in the active unit system (kg / lb). */
ShapeProto.weight = function (this: any): number | undefined {
    return this.material()?.weight?.()
}

/** Embodied carbon (kgCO2e) of this shape, from its material's EN 15804 data. */
ShapeProto.carbon = function (this: any, modules?: any): number | undefined {
    return this.material()?.carbon?.(modules)
}

/** True when this shape is currently selected (clicked) in the viewer. Selection identity is
 *  the scene path, so the shape must be in the scene. */
ShapeProto.selected = function (this: any): boolean {
    const path = this.node()?.path() ?? null
    return this._ay?.interactor?.isSelected(path) ?? false
}

/** Make this shape clickable in the viewer and react to selection. Identity is the scene
 *  path, so the shape must already be in the scene. */
ShapeProto.onClick = function (this: any, cb: (shape: any) => void) {
    const node = this.node()
    if (!node) {
        console.warn(`${this.constructor.name}.onClick(): shape is not in the scene — add it first (it has no path to select by)`)
        return this
    }
    const path = node.path()
    this._ay?.interactor?.markInteractive(path)
    if (this._ay?.interactor?.isSelected(path)) {
        cb(this)
    }
    return this
}

/** Add this shape to the modeler's active scene layer (clears any tmp() suppression). */
ShapeProto.addToScene = function (this: any) {
    if (!this._modeler) {
        console.warn(`${this.constructor.name}.addToScene(): no modeler set — cannot add to scene`)
        return this
    }
    if (this._node) {
        console.warn(`${this.constructor.name}.addToScene(): shape is already in the scene`)
        return this
    }
    this._suppressScene = false
    this._modeler.addToScene(this)
    return this
}

//// DXF (SceneNode + ShapeCollection) ////

/** Global dimension annotations linked to any of `shapes`. */
function linkedAnnotations(modeler: any, shapes: Array<any>): Array<any> {
    const global = modeler?.modules?.annotator?.getAnnotations?.() ?? []
    const set = new Set(shapes)
    return global.filter((a: any) => set.has(a?.linkedTo) || set.has(a?.targetShape))
}

;(meshup.SceneNode.prototype as any).toDXF = function (this: any, options: toDXFOptions = {}): string | null {
    const shapes = this.shapes().toArray()
    const modeler = shapes[0]?._modeler
    return buildDXF(shapes, linkedAnnotations(modeler, shapes), { units: modeler?.units?.(), ...options })
}

;(meshup.SceneNode.prototype as any).toDAE = function (this: any, options: toDAEOptions = {}): Promise<string | null> {
    // Takes `this` (the node) rather than a flat shape list — the hierarchy is the point.
    const modeler = this.shapes().toArray()[0]?._modeler
    return buildDAE(this, { units: modeler?.units?.(), ...options })
}

;(meshup.ShapeCollection.prototype as any).toDXF = function (this: any, options: toDXFOptions = {}): string | null {
    const shapes = this._shapes
    const linked = linkedAnnotations(this._modeler, shapes)
    const local = Array.isArray(this.annotations) ? this.annotations : []
    const annotations = [...new Set([...linked, ...local])]
    return buildDXF(shapes, annotations, { units: this._modeler?.units?.(), ...options })
}

//// COLLECTION / SCENE AGGREGATION ////

/** The MaterialManager reachable from a set of shapes (they all share one modeler). */
function materialsOf(shapes: Array<any>): any {
    for (const s of shapes) { const m = s?._ay?.materials; if (m) return m }
    return null
}

/** Sum a per-shape material read-out over a list of shapes, skipping what it cannot know. */
function sumOver(shapes: Array<any>, pick: (t: any) => number | undefined): number | undefined {
    const materials = materialsOf(shapes)
    if (!materials) return undefined
    const totals = materials.totals(shapes)
    return pick(totals)
}

for (const Proto of [meshup.ShapeCollection.prototype, meshup.SceneNode.prototype] as Array<any>) {
    /** Total mass (kg) of every shape in here that carries a material. */
    Proto.weight = function (this: any): number | undefined {
        return sumOver(this.shapes?.().toArray?.() ?? this._shapes ?? [], (t) => t.total.mass)
    }

    /** Total embodied carbon (kgCO2e) of every shape in here that carries a material. */
    Proto.carbon = function (this: any): number | undefined {
        return sumOver(this.shapes?.().toArray?.() ?? this._shapes ?? [], (t) => t.total.carbon)
    }

    /** Per-material breakdown of mass and carbon — feed to calc.table('carbon', …). */
    Proto.materialTotals = function (this: any): any {
        const shapes = this.shapes?.().toArray?.() ?? this._shapes ?? []
        return materialsOf(shapes)?.totals(shapes) ?? null
    }
}

export {} // module marker
