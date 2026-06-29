/**
 *  smartshape-decorators.ts
 *
 *  Method decorators for SmartShape kernel dispatch.
 *
 *  @brep  — runs the method in brep mode; auto-converts mesh → brep if needed.
 *  @mesh  — runs the method in mesh mode; auto-converts brep → mesh if needed.
 *
 *  Compatible with experimentalDecorators (legacy TypeScript decorator standard).
 */

/**
 * Ensure the shape is in brep mode before invoking the decorated method.
 * If the shape is currently in mesh mode, _convertTo('brep') is called first.
 */
export function brep(_target: any, key: string, desc: PropertyDescriptor): PropertyDescriptor
{
    const fn = desc.value
    desc.value = function (this: any, ...args: any[])
    {
        if (this._state.mode !== 'brep') this._convertTo('brep', key)
        return fn.apply(this, args)
    }
    return desc
}

/**
 * Ensure the shape is in mesh mode before invoking the decorated method.
 * If the shape is currently in brep mode, _convertTo('mesh') is called first.
 */
export function mesh(_target: any, key: string, desc: PropertyDescriptor): PropertyDescriptor
{
    const fn = desc.value
    desc.value = function (this: any, ...args: any[])
    {
        if (this._state.mode !== 'mesh') this._convertTo('mesh', key)
        return fn.apply(this, args)
    }
    return desc
}