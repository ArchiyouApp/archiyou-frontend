import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'


//// EQUALITY ////

/**
 * Deep structural equality — handles primitives, NaN, Date, RegExp, Array, and plain objects.
 * Equivalent to the `deep-is` package (node assert.deepEqual semantics).
 */
export function deepEqual(a: unknown, b: unknown): boolean
{
    if (a === b) return true

    // NaN
    if (typeof a === 'number' && typeof b === 'number') return isNaN(a) && isNaN(b)

    // null / undefined already handled by ===
    if (a === null || b === null || a === undefined || b === undefined) return false

    // Date
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()

    // RegExp
    if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags

    // Array
    if (Array.isArray(a) && Array.isArray(b))
    {
        if (a.length !== b.length) return false
        return a.every((v, i) => deepEqual(v, (b as unknown[])[i]))
    }

    if (typeof a !== 'object' || typeof b !== 'object') return false

    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => deepEqual((a as any)[k], (b as any)[k]))
}

//// HASHES ////

/** Generate a UUID v4 — works in Node and browser */
export function uuid4(): string
{
    return globalThis.crypto.randomUUID();
}

/** Export sha256 hashing function — works in Node and browser */
// TODO: use in Script.getVariantId
export function hash(s: string): string
{
    if (typeof s !== 'string') throw new Error('Input must be a string');
    const message = new TextEncoder().encode(s);
    return bytesToHex(sha256(message));
}

//// VALUES ////

/** Convert degrees to radians */
export function toRad(deg: number): number { return deg * (Math.PI / 180); }

/** Convert radians to degrees */
export function toDeg(rad: number): number { return rad * (180 / Math.PI); }

/** Round a number to the given number of decimal places */
export function roundTo(num: number, decimals: number): number
{
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

/** Returns true if the value is a finite number or a string that parses to one */
export function isNumeric(v: unknown): boolean
{
    if (typeof v === 'number') return isFinite(v);
    if (typeof v === 'string' && v.trim() !== '') return isFinite(Number(v));
    return false;
}

/**
 * Converts a data object to a JS module string with export default,
 * each key on a separate line for readability.
 * @param data The data object to export
 * @returns JS module string
 * 
 *  This is used to write script.js files in the Library
 *   // TODO ==> Move to Script, because it is used only here
 */
export function dataToModuleString(data: Record<string, any>): string {
    function serialize(val: any, indent: string = '  '): string {
        if (typeof val === 'string')
        {
            if (val.includes('${')) val = val.replace(/\$\{/g, '\\${'); // Escape ${...} to prevent evaluation when imported
            // Use backticks for multiline strings or strings with backticks
            if (val.includes('\n')) return '`' + val.replace(/`/g, '\\`') + '`';
            // Otherwise just use JSON.stringify which results in double quotes
            return JSON.stringify(val);
        }
        if (typeof val === 'number' || typeof val === 'boolean' || val === null)
        {
            return String(val);
        }
        if (Array.isArray(val))
        {
            if (val.length === 0) return '[]';
            return '[\n' + val.map(v => indent + serialize(v, indent + '  ')).join(',\n') + '\n' + indent.slice(2) + ']';
        }
        if (typeof val === 'object' && val !== null)
        {
            const entries = Object.entries(val);
            if (entries.length === 0) return '{}';
            // Don't stringify keys, assume they are valid identifiers
            return '{\n' + entries.map(([k, v]) => `${indent}${k}: ${serialize(v, indent + '  ')}`).join(',\n') + '\n' + indent.slice(2) + '}';
        }
        return undefined;
    }

    return `export default ${serialize(data)};\n`;
}


 /**
 * Convert a string value to its native type if possible.
 * - "true"/"false" (case-insensitive) => boolean
 * - Numeric strings => number
 * - Otherwise, return as string
 */
export function convertStringValue(value: string): string | number | boolean {
    if (typeof value !== 'string') return value;
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (!isNaN(Number(value)) && value.trim() !== '') return Number(value);
    return value;
}


/**
 * Converts a record object to a URL parameter string.
 * Example: { foo: 'bar', baz: 1 } => 'foo=bar&baz=1'
 * @param params Record<string, any>
 * @returns URL parameter string
 * 
 * TODO: Move to appropriate place
 */
export function recordToUrlParams(params: Record<string, any>): string {
    return Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&');
}

//// FUNCTIONS ////

export function _getArgNames(func:any):Array<string>
{
     // taken from: https://stackoverflow.com/questions/1007981/how-to-get-function-parameter-names-values-dynamically?page=1&tab=votes#tab-top
     var STRIP_COMMENTS = /(\/\/.*$)|(\/\*[\s\S]*?\*\/)|(\s*=[^,\)]*(('(?:\\'|[^'\r\n])*')|("(?:\\"|[^"\r\n])*"))|(\s*=[^,\)]*))/mg;
     const ARGUMENT_NAMES = /([^\s,]+)/g;
     
     let fnStr = func.toString().replace(STRIP_COMMENTS, '');
     let result = fnStr.slice(fnStr.indexOf('(')+1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
     if(result === null)
         result = [];
     return result;
}

export function analyzeFunc(func:(any) => any)
    : { argCount: number, argNames: string[], isAsync: boolean, 
        hasMainScopeParam: boolean, returnsPromise: boolean }
{
    const funcStr = func.toString();
    
    // Get argument names (reuse your existing logic)
    const argNames = _getArgNames(func);
    
    // Check if async
    const isAsync = funcStr.startsWith('async ') || funcStr.includes('async function');
    
    // Check if first parameter looks like mainScope
    const hasMainScopeParam = argNames.length > 0 && 
        (argNames[0].toLowerCase().includes('scope') || argNames[0] === 'mainScope');
    
    // Detect return statements and promises
    const returnMatches = funcStr.match(/return\s+([^;}\n]+)/g) || [];
    const returnsPromise = isAsync || returnMatches.some(r => r.includes('Promise'));
    
    return {
        argCount: argNames.length,
        argNames,
        isAsync,
        hasMainScopeParam, // this is indicative
        returnsPromise
    };
}