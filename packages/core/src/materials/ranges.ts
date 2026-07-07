/**
 *  materials/ranges.ts
 *
 *  Plausible physical ranges for material properties, per group. Used by the
 *  MaterialManager tests (deterministic, offline) and by the standalone
 *  cross-check script to flag generated values that fall outside reality.
 *
 *  Values are in the canonical SI units (density kg/m³, thermalConductivity W/mK,
 *  strengths MPa, elastic GPa). Ranges are deliberately generous — they catch
 *  gross errors (wrong order of magnitude, wrong unit) rather than enforce a
 *  single "correct" number.
 */

import type { MaterialGroup, MaterialPropertyKey } from './types';

export interface Range { min: number; max: number }

/** Global fallback ranges applied to every material regardless of group. */
export const GLOBAL_RANGES: Partial<Record<MaterialPropertyKey, Range>> = {
    density:             { min: 5,     max: 22000 },  // EPS foam → lead
    thermalConductivity: { min: 0.02,  max: 450 },    // insulation → copper
    compressive:         { min: 0.01,  max: 1000 },
    tensile:             { min: 0.01,  max: 3000 },
    elastic:             { min: 0.0001, max: 450 },   // GPa: foam → steel
    porosity:            { min: 0,     max: 1 },
    recyclability:       { min: 0,     max: 1 },
};

/** Group-specific density ranges (kg/m³) — the most diagnostic property. */
export const GROUP_DENSITY_RANGES: Partial<Record<MaterialGroup, Range>> = {
    wood:       { min: 100,  max: 1200 },
    metal:      { min: 2000, max: 12000 },
    stone:      { min: 1500, max: 3200 },
    concrete:   { min: 300,  max: 2800 },
    masonry:    { min: 600,  max: 2200 },
    glass:      { min: 2200, max: 2800 },
    plastic:    { min: 850,  max: 2200 },
    insulation: { min: 5,    max: 300 },
    membrane:   { min: 900,  max: 2000 },
};

/**
 * Return the effective range for a property on a material of `group`.
 * Group density range wins over the global range when present.
 */
export function rangeFor(key: MaterialPropertyKey, group: MaterialGroup): Range | undefined
{
    if (key === 'density' && GROUP_DENSITY_RANGES[group]) return GROUP_DENSITY_RANGES[group];
    return GLOBAL_RANGES[key];
}
