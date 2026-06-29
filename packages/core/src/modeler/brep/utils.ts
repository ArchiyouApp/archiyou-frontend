/**
 * breputils.ts
 * Utility functions for the brep module.
 * Re-exports selected functions from the main utils and provides brep-specific utilities.
 */

export { isNumeric, hash, toRad, toDeg, uuid4 as uuidv4 } from '../../utils'
export { convertValueFromToUnit } from '../../docs/utils'

/** Round a number to the nearest tolerance value */
export function roundToTolerance(n: number, tolerance: number = 0.01): number {
    return Math.round(n / tolerance) * tolerance;
}

/** Check if code is running in a browser environment */
export function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

/** Generate an array of integers from start to end (inclusive) */
export function intRange(start: number, end: number, step: number = 1): number[] {
    const result: number[] = [];
    for (let i = start; i <= end; i += step) {
        result.push(i);
    }
    return result;
}

/** Flatten a nested array of entities into a single flat array */
export function flattenEntities(arr: any[]): any[] {
    return arr.reduce((acc: any[], val: any) =>
        Array.isArray(val) ? acc.concat(flattenEntities(val)) : acc.concat(val), []);
}

/** Flatten entities to a flat array (alias for flattenEntities) */
export function flattenEntitiesToArray(arr: any[]): any[] {
    return flattenEntities(arr);
}

/** Convert a hex color string (e.g. '#ff0000') to an integer */
export function colorHexToInt(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}

/** Check if a string represents a relative coordinate (prefixed with +/- or ends with %) */
export function isRelativeCoordString(s: any): boolean {
    if (typeof s !== 'string') return false;
    const trimmed = s.trim();
    return /^[+-]/.test(trimmed) || trimmed.endsWith('%');
}

/** Check if a string is a relative cartesian coordinate (e.g. '+10', '-5.5') */
export function isRelativeCartesianCoordString(s: any): boolean {
    if (typeof s !== 'string') return false;
    return /^[+-][0-9.]+$/.test(s.trim());
}

/** Parse a relative polar coordinate string (e.g. '@10<45') into length/angle */
export function parseRelativePolarCoordString(s: string): { length: number; angle: number } | null {
    const match = s.match(/@?([0-9.]+)<([0-9.-]+)/);
    if (!match) return null;
    return { length: parseFloat(match[1]), angle: parseFloat(match[2]) };
}

/** Convert a relative coordinate string to a number, optionally relative to a base value */
export function relativeCoordToNumber(s: string, relValue: number = 0): number {
    if (typeof s !== 'string') return Number(s);
    const trimmed = s.trim();
    if (trimmed.endsWith('%')) {
        return relValue * parseFloat(trimmed) / 100;
    }
    return parseFloat(trimmed);
}

/** Register an OpenCascade object for garbage collection (stub) */
export function targetOcForGarbageCollection(_obj: any): void {
    // OpenCascade GC management - implementation depends on OC wasm bindings
}

/** Unregister an OpenCascade object from garbage collection (stub) */
export function removeOcTargetForGarbageCollection(_obj: any): void {
    // OpenCascade GC management - implementation depends on OC wasm bindings
}
