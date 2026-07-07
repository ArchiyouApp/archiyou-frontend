/**
 *  materials/types.ts
 *
 *  Type definitions for the archiyou materials system.
 *
 *  Canonical storage is SI: densities in kg/m³, lengths (texture real sizes) in mm.
 *  Conversion to a user's unit system (metric/imperial) happens at read time in
 *  the MaterialManager — the stored data is never mutated.
 */

/** A single measurable material property with its canonical (SI) unit. */
export interface MaterialProperty
{
    /** Numeric value in the canonical `unit`. */
    value: number;
    /** Canonical unit string, e.g. 'kg/m3', 'W/mK', 'MPa'. */
    unit: string;
    /** Human-readable explanation of the property. */
    description?: string;
    /** Where the value came from (citation), for validation/cross-check. */
    source?: string;
}

/** A texture image mapped at a real-world size (always in millimetres). */
export interface MaterialTexture
{
    /** Path (relative to materials/) or data-URI of the image. */
    image: string;
    /** Real-world width the image spans, in mm. */
    realWidth: number;
    /** Real-world height the image spans, in mm. */
    realHeight: number;
    /**
     * Whether the texture tiles across the face (default true). When false — used
     * for `section` (cross-section) textures — the image is fitted once to the face
     * (UVs normalized 0..1, clamped) instead of repeating at real-world scale.
     */
    repeat?: boolean;
}

/** Physically-based rendering surface parameters. */
export interface MaterialPBR
{
    /** CSS color string for base color, e.g. '#b5651d'. */
    color?: string;
    /** Opacity 0..1. */
    alpha?: number;
    /** Metalness 0..1. */
    metallic?: number;
    /** Roughness 0..1. */
    roughness?: number;
}

/** Visualization block: textures for the different face roles + PBR fallback. */
export interface MaterialViz
{
    textures?: {
        /** End-grain / cross-section face (normal to the shortest/thickness axis). */
        section?: MaterialTexture;
        /** Long faces of a part. */
        sides?: MaterialTexture;
        /** Thin edge faces of board-like parts (thickness < thinSideThreshold). */
        thinSides?: MaterialTexture;
    };
    pbr?: MaterialPBR;
}

/** Broad material grouping (used for range validation and defaults). */
export type MaterialGroup =
    | 'wood' | 'metal' | 'stone' | 'concrete' | 'masonry' | 'glass'
    | 'plastic' | 'insulation' | 'finish' | 'membrane' | 'composite' | 'other';

/** A full material definition. */
export interface Material
{
    name: string;
    group: MaterialGroup;
    aliases?: string[];
    description?: string;

    density?: MaterialProperty;
    porosity?: MaterialProperty;
    moisture?: MaterialProperty;
    diffusion?: MaterialProperty;
    compressive?: MaterialProperty;
    tensile?: MaterialProperty;
    elastic?: MaterialProperty;
    shear?: MaterialProperty;
    thermalConductivity?: MaterialProperty;
    thermalResistance?: MaterialProperty;
    thermalExpansion?: MaterialProperty;
    heatCapacity?: MaterialProperty;
    fireResistance?: MaterialProperty;
    fireReaction?: MaterialProperty;
    carbon?: MaterialProperty;
    energy?: MaterialProperty;
    water?: MaterialProperty;
    toxicity?: MaterialProperty;
    recyclability?: MaterialProperty;

    viz?: MaterialViz;
}

/** Keys of Material that are MaterialProperty-typed (for iteration/validation). */
export const MATERIAL_PROPERTY_KEYS = [
    'density', 'porosity', 'moisture', 'diffusion', 'compressive', 'tensile',
    'elastic', 'shear', 'thermalConductivity', 'thermalResistance',
    'thermalExpansion', 'heatCapacity', 'fireResistance', 'fireReaction',
    'carbon', 'energy', 'water', 'toxicity', 'recyclability',
] as const;

export type MaterialPropertyKey = typeof MATERIAL_PROPERTY_KEYS[number];

/**
 * Compact render spec threaded from core into the meshup GLTF builder via
 * `Style.material`. Carries everything the builder needs to apply PBR + textures
 * at the correct real-world scale without any dependency on the materials module.
 */
export interface MaterialRenderSpec
{
    name: string;
    pbr?: MaterialPBR;
    textures?: {
        section?: MaterialTexture & { data?: string };
        sides?: MaterialTexture & { data?: string };
        thinSides?: MaterialTexture & { data?: string };
    };
    /** Faces thinner than this (mm) use the `thinSides` texture. */
    thinSideThresholdMM: number;
    /** Millimetres per one model unit — to scale mm texture sizes to model space. */
    modelUnitMM: number;
}
