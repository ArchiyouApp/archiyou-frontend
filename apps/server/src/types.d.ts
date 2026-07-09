/**
 * Fastify JWT payload/user typing. The `user` on a request is our decoded
 * session token; `payload` is what we sign.
 */
import '@fastify/jwt';
import type { AuthTokenClaims, ResetTokenClaims } from '@archiyou/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    // We sign two kinds of tokens: the session token and the password-reset token.
    payload: AuthTokenClaims | ResetTokenClaims;
    user: AuthTokenClaims;
  }
}
