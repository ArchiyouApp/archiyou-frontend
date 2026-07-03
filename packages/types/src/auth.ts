/**
 * auth.ts — shared auth DTOs (TypeBox schemas + derived TS types).
 *
 * Single source of truth for the request/response shapes exchanged between
 * apps/editor and apps/server. The server validates requests with these
 * schemas (Check/Errors from 'typebox/value'); the editor imports the derived
 * types for its API client.
 */

import { Type, type Static } from 'typebox';

//// REQUESTS ////

export const RegisterRequestSchema = Type.Object({
  email: Type.String({ format: 'email', minLength: 3 }),
  password: Type.String({ minLength: 8, maxLength: 200 }),
  name: Type.Optional(Type.String({ maxLength: 200 })),
});
export type RegisterRequest = Static<typeof RegisterRequestSchema>;

export const LoginRequestSchema = Type.Object({
  email: Type.String({ minLength: 3 }),
  password: Type.String({ minLength: 1 }),
});
export type LoginRequest = Static<typeof LoginRequestSchema>;

//// RESPONSES ////

/** The safe, client-facing view of a user (never includes passwordHash). */
export const PublicUserSchema = Type.Object({
  id: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  name: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  emailVerified: Type.Boolean(),
});
export type PublicUser = Static<typeof PublicUserSchema>;

export const AuthResponseSchema = Type.Object({
  token: Type.String(),
  user: PublicUserSchema,
});
export type AuthResponse = Static<typeof AuthResponseSchema>;

/** JWT payload we sign for our own session tokens. */
export interface AuthTokenClaims {
  sub: string; // user id
  email: string | null;
  name: string | null;
}
