/**
 *  schemas.ts
 *      Standard row schemas for Calc Tables. A schema describes a single row;
 *      a Table validates each of its rows against it (see Table.schema/validate).
 *      Defined with TypeBox so they can be validated at runtime with
 *      Check()/Errors() from 'typebox/value' (same pattern as ScriptParam).
 */

import { Type, type TSchema } from 'typebox'

/** One row of a `parts` table (as emitted by Make.partList). */
export const PartsRowSchema = Type.Object({
    part:     Type.String(),
    subpart:  Type.Optional(Type.String()),
    type:     Type.Union([Type.Literal('beam'), Type.Literal('plate')]),
    section:  Type.String(),
    length:   Type.Number(),
    quantity: Type.Number(),
})   // TypeBox Object allows extra props by default → footer/extra columns pass

/** Registry of standard schemas, addressable by name: table.schema('parts') */
export const STANDARD_SCHEMAS:Record<string, TSchema> = {
    parts: PartsRowSchema,
}
