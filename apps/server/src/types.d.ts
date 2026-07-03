/**
 * Fastify JWT payload/user typing. The `user` on a request is our decoded
 * session token; `payload` is what we sign.
 */
import '@fastify/jwt';
import type { AuthTokenClaims } from '@archiyou/types';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenClaims;
    user: AuthTokenClaims;
  }
}
