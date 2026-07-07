/**
 * routes/auth.ts — email/password registration + login over the users table.
 *
 * The JWT `sub` is the user's handle (== script `author`), so script routes
 * scope ownership by it. Google OAuth is not wired in this build; the button
 * bounces back to /login with an error rather than hitting a dead route.
 */

import type { FastifyInstance } from 'fastify';

import { RegisterRequestSchema, LoginRequestSchema, type AuthResponse, type AuthTokenClaims } from '@archiyou/types';

import { config } from '../config';
import { parse } from '../validate';
import { userService, toPublicUser } from '../services/UserService';
import type { UserRow } from '../db/schema';

const TOKEN_TTL = '30d';

function issue(fastify: FastifyInstance, user: UserRow): AuthResponse {
  const claims: AuthTokenClaims = { sub: user.username, email: user.email, name: user.name };
  const token = fastify.jwt.sign(claims, { expiresIn: TOKEN_TTL });
  return { token, user: toPublicUser(user) };
}

export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/register', async (request) => {
    const { email, password, name } = parse(RegisterRequestSchema, request.body);
    const user = await userService.register(email, password, name);
    return issue(fastify, user);
  });

  fastify.post('/auth/login', async (request) => {
    // `email` is the login identifier — an email address OR a username handle.
    const { email, password } = parse(LoginRequestSchema, request.body);
    const user = await userService.login(email, password);
    return issue(fastify, user);
  });

  // Stateless JWT — logout is client-side (drop the token). Endpoint for symmetry.
  fastify.post('/auth/logout', async () => ({ success: true }));

  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request, reply) => {
    const user = userService.findByUsername(request.user.sub);
    if (!user) return reply.code(404).send({ success: false, error: 'User not found' });
    return toPublicUser(user);
  });

  // Google OAuth is not configured in this build. Bounce gracefully so the
  // client's "Continue with Google" button doesn't hit a dead route.
  fastify.get('/auth/google', async (_request, reply) => {
    return reply.redirect(`${config.editorUrl}/callback#error=google_not_configured`);
  });
}
