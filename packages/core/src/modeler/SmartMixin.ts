/**
 *  SmartMixin.ts
 *
 *  Mixin factory that adds SmartShape capabilities to any kernel shape class.
 *  Apply once per kernel shape type — each resulting class inherits ALL kernel
 *  methods automatically (no switchboard) while gaining scene management,
 *  kernel switching, and shared style ops.
 *
 *  Usage:
 *    class SmartMeshCurve extends withSmartShape(meshup.Curve) {}
 *    class SmartBrepSolid extends withSmartShape(brepKernel.Solid) {}
 */

import type { Modeler } from './Modeler'
import type { ArchiyouModules } from '../types'
import type { DimensionOptions, LabelOptions } from '../annotator/types'
import type { SmartShapeConversion, ModelMode } from './types'
import type { SceneNode } from 'meshup/src/SceneNode'
import type { SmartSceneNode } from './SmartSceneNode'

export type Constructor<T = object> = new (...args: any[]) => T

/** Brep-only methods added as runtime bridges on non-brep shapes. */
export const BREP_ONLY_METHODS = ['fillet', 'chamfer', 'shell', 'cut', 'fuse', 'intersect'] as const

export function withSmartShape<T extends Constructor>(Base: T)
{
    const Mixed = class extends Base
    {
        _modeler!: Modeler
        _node: SceneNode<any> | null = null
        _conversionLog: SmartShapeConversion[] = []
        /** Assigned material name (see materials module). Set via .material('wood'). */
        _material?: string

        /** Duck-type guard — lets meshup.ShapeCollection and SmartShapeCollection accept this shape. */
        isShapeClass(): boolean { return true }

        /** True for curve-like shapes: mesh Curve, brep Edge or Wire. */
        isCurve(): boolean
        {
            const t = (this as any).type as string
            return t === 'Curve' || t === 'Edge' || t === 'Wire'
        }

        /** True for solid-like shapes: mesh Mesh, brep Shell or Solid. */
        isSolid(): boolean
        {
            const t = (this as any).type as string
            return t === 'Mesh' || t === 'Shell' || t === 'Solid'
        }

        /** Public access to the archiyou modules (annotator, calc, docs, ...) */
        get _ay(): ArchiyouModules { return this._modeler.modules }

        /** Create dimension line(s) for this shape. Centralized in the Annotator. */
        dimension(options?: DimensionOptions)
        {
            return this._ay.annotator.dimensionLine().fromShape(this as any, options)
        }

        /** Alias for dimension() */
        dim(options?: DimensionOptions)
        {
            return this.dimension(options)
        }

        /** Attach a free-text label at this shape's center. Centralized in the
         *  Annotator; rendered by the viewer as an HTML/CSS overlay element. */
        label(value: string, options?: LabelOptions)
        {
            return this._ay.annotator.label().fromShape(this as any, value, options)
        }

        /** Returns the SmartSceneNode this shape belongs to, or null if not in a scene. */
        node(): SmartSceneNode | null
        {
            return this._node as SmartSceneNode | null
        }

        /** True when this shape is currently selected (clicked) in the viewer.
         *  Selection identity is the scene path, so the shape must be in the scene.
         *  Returns false for shapes not in a scene. */
        selected(): boolean
        {
            const path = this.node()?.path() ?? null
            return this._ay.interactor.isSelected(path)
        }

        /** Make this shape clickable in the viewer and react to selection.
         *
         *  Registers the shape as interactive (the viewer makes its mesh clickable;
         *  a click re-runs the script with this shape selected). On every run where
         *  the shape is selected, `cb(shape)` is invoked synchronously — so any
         *  `$handle()` it declares is picked up by this run's op-stream and shown
         *  (and removed again on the run after the shape is deselected).
         *
         *  Identity is the scene path, so the shape must already be in the scene.
         *
         *  ```js
         *  box.onClick(s => $handle().start(s.bbox().center()).along('z').param('HEIGHT'))
         *  ```
         *  Bind a `param(...)` or call `name(...)` on handles created here so their
         *  id is stable across runs. */
        onClick(cb: (shape: this) => void): this
        {
            const node = this.node()
            if (!node)
            {
                console.warn(`${this.constructor.name}.onClick(): shape is not in the scene — add it first (it has no path to select by)`)
                return this
            }
            const path = node.path()
            this._ay.interactor.markInteractive(path)
            if (this._ay.interactor.isSelected(path))
            {
                cb(this)
            }
            return this
        }

        /** Add this shape to the modeler's active scene layer.
         *  No-op (with a warning) if the shape is already in the scene.
         *  Returns `this` for chaining. */
        addToScene(): this
        {
            if (!this._modeler)
            {
                console.warn(`${this.constructor.name}.addToScene(): no modeler set — cannot add to scene`)
                return this
            }
            if (this._node)
            {
                console.warn(`${this.constructor.name}.addToScene(): shape is already in the scene`)
                return this
            }
            this._modeler.addToScene(this as any)
            return this
        }

        /** Remove this shape from the scene (detaches the SceneNode).
         *  No-op (with a warning) if the shape is not currently in the scene.
         *  Returns `this` for chaining. */
        removeFromScene(): this
        {
            if (!this._node)
            {
                console.warn(`${this.constructor.name}.removeFromScene(): shape is not in the scene`)
                return this
            }
            this._node.detach()
            this._node = null
            return this
        }

        /** Get or set the shape name while keeping any scene node label in sync.
         *
         *  Shapes are auto-named after the variable they are assigned to, so
         *  `myTopBox = box(100,100,100)` already carries the name `'myTopBox'`
         *  (see the scope Proxy `set` trap in Runner.createScope()). Calling
         *  `.name('foo')` explicitly overrides that automatic name; because the
         *  auto-namer only fills in shapes that are still unnamed, an explicit
         *  name always wins. */
        name(): string | undefined
        name(value: string): this
        name(value?: string): this | string | undefined
        {
            const baseName = (Base as any).prototype.name

            if (value === undefined)
            {
                if (typeof baseName === 'function')
                {
                    const result = baseName.call(this)
                    if (typeof result === 'string' || result === undefined)
                    {
                        return result
                    }
                }
                return this._node?.name
            }

            if (typeof baseName === 'function')
            {
                baseName.call(this, value)
            }

            if (this._node) this._node.name = value
            // An explicit / auto-assigned name is authoritative: clear the
            // "inherited from copy()" flag so the auto-namer won't override it.
            ;(this as any)._nameInherited = false
            return this
        }

        /**
         *  Assign or read the material of this shape.
         *
         *  Setter (chainable): `box(10,10,2000).material('douglas')` — stores the
         *  material name and mirrors it onto the render style so the GLTF export
         *  can apply PBR + textures.
         *
         *  Getter (no arg): `beam.material()` returns a BoundMaterial with derived
         *  calculations (`.weight()`, `.mass()`, `.density()`, `.property(key)`),
         *  presented in the active unit system. Returns null when no material set
         *  or the name is unknown.
         */
        material(name?: string): any
        {
            const manager = this._ay.materials
            if (name === undefined)
            {
                return manager?.resolve(this._material, this) ?? null
            }
            this._material = name
            // mirror onto the render style (best-effort — used by GLTF export)
            const style = (this as any).style
            if (style)
            {
                const spec = manager?.get(name) ? manager.renderSpec(manager.get(name)!) : name
                style.material = spec ?? name
            }
            return this
        }

        /** Mass/weight of this shape in the active unit system (kg / lb). Shortcut for material().weight(). */
        weight(): number | undefined
        {
            return this.material()?.weight?.()
        }

        get shapeKind(): 'closed' | 'linear'
        {
            const t = (this as any).type as string | undefined
            return (t === 'Curve' || t === 'Edge' || t === 'Wire') ? 'linear' : 'closed'
        }

        toBrep(): any
        {
            console.warn(`${this.constructor.name}.toBrep(): conversion not yet implemented`)
            return this
        }

        // NOTE: toMesh() is NOT defined here as a class method — that would shadow the
        // kernel's own toMesh() (e.g. Curve.toMesh(), Polygon.toMesh()) and break super
        // calls. It is injected below as a fallback only when the base class lacks it.

        /**
         *  Copy this shape. Upgrades the kernel copy to the same Smart* class and
         *  adds it to the scene at the active layer.
         *  The kernel's copy() creates a plain kernel object — we upgrade via prototype swap.
         */
        copy(): this
        {
            const suppressSceneAdd = Boolean((this as any)._suppressSceneAdd)
            // Temporarily null _node so kernel's copy() skips its own scene-add logic.
            const savedNode = this._node
            this._node = null
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore — super.copy() exists on all kernel base classes at runtime
            const kernelCopy: any = super.copy()
            this._node = savedNode

            // Upgrade the plain kernel copy to the same Smart* class.
            Object.setPrototypeOf(kernelCopy, Object.getPrototypeOf(this))
            kernelCopy._modeler = this._modeler
            kernelCopy._node = null
            kernelCopy._conversionLog = []
            kernelCopy._material = this._material
            kernelCopy._suppressSceneAdd = suppressSceneAdd
            // The kernel copy carries the source's name. Mark it as inherited so
            // that when the copy is assigned to a fresh variable the auto-namer
            // (Runner scope Proxy) renames it after that variable, e.g.
            // `rafterRight = rafterLeft.copy().mirrorX(0)` becomes 'rafterRight'.
            kernelCopy._nameInherited = true
            if (this._modeler && !suppressSceneAdd)
            {
                this._modeler.addToScene(kernelCopy)
            }
            return kernelCopy as this
        }

        /** copy() without automatic scene registration. Used by kernel operations
         *  (e.g. meshup Curve.intersect) that need throwaway working copies which must
         *  never appear in the smart scene. The returned copy also carries the
         *  suppression flag, so any further copies it spawns stay out of the scene too. */
        _copy(): this
        {
            const prev = Boolean((this as any)._suppressSceneAdd)
            ;(this as any)._suppressSceneAdd = true
            try
            {
                return this.copy()
            }
            finally
            {
                if (prev) (this as any)._suppressSceneAdd = true
                else delete (this as any)._suppressSceneAdd
            }
        }

        toString(): string
        {
            // Pass through the wrapped kernel object's own toString() (e.g. meshup Vertex<x,y,z>)
            let wrapped: string | undefined
            const baseToString = (Base as any).prototype?.toString
            if (typeof baseToString === 'function' && baseToString !== Object.prototype.toString)
            {
                try { wrapped = baseToString.call(this) } catch { /* ignore */ }
            }
            const wrappedAttr = wrapped ? ` wrapped="${wrapped}"` : ''
            return `<${this.constructor.name} id="${(this as any).id?.()}" type="${(this as any).type}"${wrappedAttr}>`
        }
    }

    // Brep-only bridges — added to prototype only when the base class doesn't already have them.
    // On SmartBrepSolid/SmartBrepFace (brep), these methods exist natively via inheritance, so no bridge is added.
    // On SmartMeshCurve/SmartMesh (mesh), the bridge auto-converts to brep and delegates.
    for (const method of BREP_ONLY_METHODS)
    {
        if (!(method in (Base as any).prototype))
        {
            ;(Mixed.prototype as any)[method] = function (...args: any[])
            {
                console.warn(`${method}() is brep-only — auto-converting to brep`)
                return (this.toBrep() as any)[method](...args)
            }
        }
    }

    // toMesh() fallback — only for base classes that have no native toMesh()
    // (e.g. brep shapes, meshup.Mesh). Shapes with a real kernel toMesh() (Curve,
    // Polygon) keep it, so Smart* overrides can reach it via super.toMesh().
    if (!('toMesh' in (Base as any).prototype))
    {
        ;(Mixed.prototype as any).toMesh = function ()
        {
            console.warn(`${this.constructor.name}.toMesh(): conversion not yet implemented`)
            return this
        }
    }

    // CollectableShape normalizing shims — brep shapes use different method names/signatures
    // than meshup shapes. Add thin adapters so all Smart* shapes satisfy CollectableShape.
    if (!('translate' in (Base as any).prototype))
    {
        // brep shapes have move() instead of translate()
        ;(Mixed.prototype as any).translate = function (v: any, dy?: number, dz?: number)
        {
            return (this as any).move(v, dy, dz)
        }
    }
    if (!('mirror' in (Base as any).prototype))
    {
        // brep shapes have mirrored() with (origin, normal) signature
        ;(Mixed.prototype as any).mirror = function (dir: any, pos?: any)
        {
            return (this as any).mirrored?.(pos, dir) ?? this
        }
    }
    if (!('opacity' in (Base as any).prototype))
    {
        ;(Mixed.prototype as any).opacity = function (_o: number) { return this }
    }
    if (!('rotateQuaternion' in (Base as any).prototype))
    {
        ;(Mixed.prototype as any).rotateQuaternion = function (..._args: any[]) { return this }
    }

    return Mixed
}
