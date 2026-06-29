/**
 * execution/schemas.ts
 * TypeBox schemas for Script and ScriptParam validation.
 *      Import these into classes that need structural validation.
 */

import semver from 'semver'
import { Type } from 'typebox'

import { ScriptParamType } from './types'

//// PARAMS ////

// @ts-ignore TS2589: TypeBox Refine causes excessively deep type instantiation
const SemverSchema = Type.Refine(
    Type.String(),
    (value): value is string => semver.valid(semver.coerce(value)) !== null,
    'Expected a valid semver version'
)

export const ScriptParamSchema = Type.Object(
{
    type:                     Type.Enum(ScriptParamType),
    name:                     Type.Optional(Type.String({ minLength: 3 })), // can be null on creation
    label:                    Type.Optional(Type.String()),
    group:                    Type.Optional(Type.String()),
    enabled:                  Type.Optional(Type.Boolean()),
    visible:                  Type.Optional(Type.Boolean()),
    order:                    Type.Optional(Type.Number()),
    iterable:                 Type.Optional(Type.Boolean()),
    description:              Type.Optional(Type.String()),
    units:                    Type.Optional(Type.String()),
    default:                  Type.Optional(Type.Unknown()),
    schema: Type.Record(Type.String(), Type.Unknown()),
    
    _value:                   Type.Optional(Type.Unknown()),
    _definedProgrammatically: Type.Optional(Type.Boolean()),
    _behaviours:              Type.Optional(Type.Record(Type.String(), Type.String())),
})

const ParamRecordSchema = Type.Record(Type.String(), ScriptParamSchema)
const ParamPresetsSchema = Type.Record(Type.String(), ParamRecordSchema)

//// SCRIPT ////

/** Published part of script */
export const ScriptPublishedSchema = Type.Object({
    published:   Type.Optional(Type.Boolean()),
    public:      Type.Optional(Type.Boolean()), // if shown up in lists
    version:     SemverSchema, // semver version string, e.g. "1.0.0"
    url:         Type.Optional(Type.String()),
    library:  Type.Optional(Type.String()), // library url
    
    title:      Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),

    // overrides main params/presets 
    params:      Type.Optional(ParamRecordSchema),
    presets:     Type.Optional(Type.Array(Type.String())),
})

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
    author:      Type.Optional(Type.String()),

    description: Type.Optional(Type.String()),
    details:     Type.Optional(Type.String()),
    tags:        Type.Optional(Type.Array(Type.String())),

    code:        Type.String(),

    // params are record { <<name>> : ScriptParam }
    params:      Type.Optional(ParamRecordSchema),
    presets:     Type.Optional(ParamPresetsSchema),

    // null or published as
    published:   Type.Optional(Type.Union([Type.Null(), ScriptPublishedSchema])),
})
