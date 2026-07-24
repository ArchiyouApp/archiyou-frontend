/**
 * ScriptSchema.ts
 *   TypeBox schema for the Script — the central Archiyou data structure.
 *   Single source of truth: the Script class (Script.ts), the server DB model
 *   (apps/server/src/db/schema.ts) and every wire boundary derive from here.
 *
 *   Lives in the package's main src dir (not execution/) so every package can
 *   reach it easily. Param-level schemas stay in execution/schemas.ts; this file
 *   only imports ScriptParamSchema + the param record/preset helpers from there.
 */

import semver from 'semver'
import { Type, type Static } from 'typebox'

import { ScriptParamSchema, ParamRecordSchema, ParamPresetsSchema } from './execution/schemas'

//// VERSION ////

// @ts-ignore TS2589: TypeBox Refine causes excessively deep type instantiation
export const SemverSchema = Type.Refine(
    Type.String(),
    (value): value is string => semver.valid(semver.coerce(value)) !== null,
    'Expected a valid semver version'
)

//// LICENCES ////

/** Creative Commons 4.0 family (+ CC0). Single source of truth for the licence
 *  vocabulary, reused by the schema and any UI. NOTE: the legacy PublishLicense
 *  union in execution/types.ts uses 'CC BY'-style names and should be reconciled
 *  to reference these SPDX identifiers over time. */
export const CC_LICENCES = [
    'CC0-1.0',
    'CC-BY-4.0',
    'CC-BY-SA-4.0',
    'CC-BY-NC-4.0',
    'CC-BY-ND-4.0',
    'CC-BY-NC-SA-4.0',
    'CC-BY-NC-ND-4.0',
] as const
export type CCLicence = typeof CC_LICENCES[number]
export const CCLicenceSchema = Type.Union(CC_LICENCES.map((l) => Type.Literal(l)))

//// SHARED ////

/** Sharing metadata. Present (non-null) means the script is shared. */
export const ScriptSharedSchema = Type.Object({
    created:     Type.String(),                              // ISO string on the wire (Date on the class)
    description: Type.Optional(Type.String()),
    onlyUsers:   Type.Optional(Type.Array(Type.String())),  // User.id[] (see PublicUser.id in @archiyou/types)
    dev:         Type.Optional(Type.Boolean()), // allow access latest dev version under tag :dev  
    licence:     Type.Optional(CCLicenceSchema),
})

//// PUBLISHED ////

/** How a fulfillment's exported files reach the end-user of the configurator. */
export const FULFILLMENT_DELIVERIES = ['anonymous download', 'email', 'pay'] as const
export type FulfillmentDelivery = typeof FULFILLMENT_DELIVERIES[number]
export const FulfillmentDeliverySchema = Type.Union(
    FULFILLMENT_DELIVERIES.map((d) => Type.Literal(d)),
)

/** A fulfillment: a named bundle of outputs (a model, data tables, documents…) the
 *  configurator makes available to end-users, with a delivery method + optional price.
 *  `exports` are output-path strings (see ScriptOutputPath), for example
 *  "default/model/(all)", "default/tables/(name)/xlsx" or "default/docs/(name)/pdf". */
export const ScriptPublishedFulfillmentSchema = Type.Object({
    name:        Type.String(),
    description: Type.Optional(Type.String()),
    exports:     Type.Array(Type.String()),   // resolved output-path strings
    delivery:    FulfillmentDeliverySchema,
    price:       Type.Optional(Type.Number()), // defaults to 0 (applied in UI/normalize)
})

/** Published part of script
 *      Publishing means people can use the configurator.
 *      NOTE: version now lives at the top level of ScriptSchema (shared by
 *      published + shared), not here.
 */
export const ScriptPublishedSchema = Type.Object({
    public:      Type.Optional(Type.Boolean()), // if shown up in lists
    url:         Type.Optional(Type.String()),
    library:     Type.Optional(Type.String()), // library url

    title:       Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),

    licence:     Type.Optional(CCLicenceSchema),
    validated:   Type.Optional(Type.Boolean()), // set once the script has been validated (used later)

    // overrides main params/presets
    params:      Type.Optional(ParamRecordSchema),
    presets:     Type.Optional(Type.Array(Type.String())),

    fulfillments: Type.Optional(Type.Array(ScriptPublishedFulfillmentSchema)),
})

//// SCRIPT ////

/**
 *  Defines the schema for a Script
 *   See Script.ts for how the Script works
 */
export const ScriptSchema = Type.Object(
{
    id:          Type.Optional(Type.String()),
    fileId:      Type.Optional(Type.String()), // groups scripts version under one file: created for first script version
    created:     Type.Optional(Type.Union([Type.String(), Type.Null()])),
    updated:     Type.Optional(Type.Union([Type.String(), Type.Null()])),

    name:        Type.Optional(Type.String()),
    author:      Type.Optional(Type.String()), // name of author

    description: Type.Optional(Type.String()),
    details:     Type.Optional(Type.String()),
    tags:        Type.Optional(Type.Array(Type.String())),

    // semver version — nullable: a working/unpublished script has no version.
    // Reused by both `shared` and `published`.
    version:     Type.Optional(Type.Union([Type.Null(), SemverSchema])),

    code:        Type.String(),

    // params are record { <<name>> : ScriptParam }
    params:      Type.Optional(ParamRecordSchema),
    presets:     Type.Optional(ParamPresetsSchema),

    // null or published as
    published:   Type.Optional(Type.Union([Type.Null(), ScriptPublishedSchema])),

    // null or shared as (sharing metadata)
    shared:      Type.Optional(Type.Union([Type.Null(), ScriptSharedSchema])),

    // Main unit system of the script (metric shows mm, imperial shows inches).
    // Presentation preference — does not rescale geometry. Default 'metric'.
    units:       Type.Optional(Type.Union([Type.Literal('metric'), Type.Literal('imperial')])),
})

export type ScriptSharedData               = Static<typeof ScriptSharedSchema>
export type ScriptPublishedData            = Static<typeof ScriptPublishedSchema>
export type ScriptPublishedFulfillmentData = Static<typeof ScriptPublishedFulfillmentSchema>
export type ScriptData                     = Static<typeof ScriptSchema>
