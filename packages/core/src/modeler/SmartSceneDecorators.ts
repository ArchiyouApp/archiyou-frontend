/**
 *  SmartSceneDecorators.ts
 *
 *  Method decorators that remove the repeated scene-management boilerplate from
 *  the Smart* shape and SmartShapeCollection classes.
 *
 *  Each decorated method just calls super.x() and returns the *raw* kernel result;
 *  the decorator wraps that result into the matching Smart* shape (or a
 *  SmartShapeCollection) and applies a scene policy:
 *
 *    @toSmart        wrap only — no scene change            (start, end, row, collection ops)
 *    @sceneReplace   wrap; detach self; add result          (extrude, flatten, hull, split, …)
 *    @sceneAdd       wrap; add result; keep self            (select)
 *    @sceneLayer(n)  wrap; add result to named layer 'n'    (iso, elevation, section)
 *    @sceneUpdate    mutate self in place; re-attach self   (future in-place mutators)
 *
 *  The concrete Smart* classes are injected once via registerSmartWrappers() to
 *  avoid a circular import (this module never imports SmartShapes / SmartShapeCollection).
 */

import type { Modeler } from './Modeler'

//// WRAPPING ENGINE (registry injected by SmartShapes.ts) ////

type WrapperMap = Record<string, (modeler: Modeler, shape: any) => any>

let WRAPPERS: WrapperMap = {}
let MAKE_COLLECTION: (modeler: Modeler | null, items: any[]) => any = (_m, items) => items

/** Inject the type→Smart-class factories and the SmartShapeCollection builder.
 *  Called once from SmartShapes.ts after all classes are defined. */
export function registerSmartWrappers(
    wrappers: WrapperMap,
    makeCollection: (modeler: Modeler | null, items: any[]) => any,
): void
{
    WRAPPERS = wrappers
    MAKE_COLLECTION = makeCollection
}

/** Is this value already a Smart* wrapper?
 *  NOTE: we cannot use isShapeClass() — the meshup kernel Shape base also defines it,
 *  so it returns true for RAW kernel shapes too. `_conversionLog` (an array) is set
 *  only by the Smart mixin / Smart*.from(), so it uniquely identifies Smart wrappers. */
function isSmart(o: any): boolean
{
    return o != null && typeof o === 'object' && Array.isArray(o._conversionLog)
}

/** A raw kernel value is a collection if it exposes items via toArray()/shapes/getShapes(). */
function collectionItems(raw: any): any[] | null
{
    if (Array.isArray(raw)) return raw
    if (typeof raw?.toArray === 'function') return raw.toArray()
    const s = raw?.shapes ?? raw?.getShapes?.()
    return Array.isArray(s) ? s : null
}

function wrapOne(modeler: Modeler | null, shape: any): any
{
    if (isSmart(shape)) return shape
    const factory = WRAPPERS[shape?.type]
    return (factory && modeler) ? factory(modeler, shape) : null
}

/**
 *  Wrap a raw kernel result — single shape | array | meshup ShapeCollection |
 *  brep collection | null — into a Smart* shape or SmartShapeCollection.
 *  Single source of truth for `type → Smart class` dispatch.
 */
export function wrapSmart(modeler: Modeler | null, raw: any): any
{
    if (raw == null) return raw
    if (isSmart(raw)) return raw

    // A single known kernel shape (Vertex/Mesh/Curve/Polygon/Edge/Wire/Face/Shell/Solid)
    // is identified by its `type`. Handle it BEFORE collection detection — some single
    // shapes (Vertex, Point) also expose toArray()/coords and would be mis-read as collections.
    if (typeof raw.type === 'string' && WRAPPERS[raw.type]) return wrapOne(modeler, raw)

    const items = collectionItems(raw)
    if (items)
    {
        const col = MAKE_COLLECTION(modeler, items.map(i => wrapOne(modeler, i)).filter(Boolean))
        // Preserve sub-groups (mesh elevation/isometry rely on _groups).
        const groups = raw?._groups as Map<string, any> | undefined
        if (groups && col?._groups)
        {
            groups.forEach((g, name) =>
            {
                const gi = (collectionItems(g) ?? []).map(i => wrapOne(modeler, i)).filter(Boolean)
                col._groups.set(name, MAKE_COLLECTION(modeler, gi))
            })
        }
        return col
    }
    return wrapOne(modeler, raw)
}

//// HELPERS ////

/** Resolve the modeler for a SmartShape (this._modeler) or a SmartShapeCollection
 *  (this._modeler, else the modeler of its first shape). */
function resolveModeler(self: any): Modeler | null
{
    return self?._modeler ?? self?._shapes?.[0]?._modeler ?? null
}

/** addToScene() wants a shape or shape[]; unwrap a SmartShapeCollection to its array. */
function asAddable(result: any): any
{
    return result?.isShapeCollection?.() ? result.toArray() : result
}

type MethodDecorator = (target: any, key: string, descriptor: PropertyDescriptor) => PropertyDescriptor

//// DECORATORS ////

/** Wrap the raw result as a Smart shape or SmartShapeCollection. No scene mutation. */
export const toSmart: MethodDecorator = (_t, _k, descriptor) =>
{
    const original = descriptor.value
    descriptor.value = function (this: any, ...args: any[])
    {
        return wrapSmart(resolveModeler(this), original.apply(this, args))
    }
    return descriptor
}

/** Wrap result; remove self from the scene; add the result to the active layer. */
export const sceneReplace: MethodDecorator = (_t, _k, descriptor) =>
{
    const original = descriptor.value
    descriptor.value = function (this: any, ...args: any[])
    {
        const raw = original.apply(this, args)
        if (raw == null) return raw
        const modeler = resolveModeler(this)
        const result = wrapSmart(modeler, raw)
        if (modeler)
        {
            this._node?.detach()
            modeler.addToScene(asAddable(result))
        }
        return result
    }
    return descriptor
}

/** Wrap result; add it to the active layer; keep self in the scene. */
export const sceneAdd: MethodDecorator = (_t, _k, descriptor) =>
{
    const original = descriptor.value
    descriptor.value = function (this: any, ...args: any[])
    {
        const modeler = resolveModeler(this)
        const result = wrapSmart(modeler, original.apply(this, args))
        if (modeler && result != null) modeler.addToScene(asAddable(result))
        return result
    }
    return descriptor
}

/** Wrap result; add it to the dedicated layer `name`, restoring the previous active layer.
 *  Keeps self in the scene. */
export function sceneLayer(name: string): MethodDecorator
{
    return (_t, _k, descriptor) =>
    {
        const original = descriptor.value
        descriptor.value = function (this: any, ...args: any[])
        {
            const modeler = resolveModeler(this)
            const result = wrapSmart(modeler, original.apply(this, args))
            if (modeler && result != null)
            {
                const prev = modeler.activeLayer()
                modeler.layer(name)
                modeler.addToScene(asAddable(result))
                if (prev) modeler.layer(prev.name)
            }
            return result
        }
        return descriptor
    }
}

/** In-place mutator (returns this): keep the same shape, re-attach to the active
 *  layer if it is not currently in the scene. */
export const sceneUpdate: MethodDecorator = (_t, _k, descriptor) =>
{
    const original = descriptor.value
    descriptor.value = function (this: any, ...args: any[])
    {
        const result = original.apply(this, args)
        const modeler = resolveModeler(this)
        if (modeler && !this._node) modeler.addToScene(this)
        return result
    }
    return descriptor
}
