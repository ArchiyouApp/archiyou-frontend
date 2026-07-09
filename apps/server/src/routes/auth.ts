/**
 * routes/auth.ts — email/password registration + login over the users table.
 *
 * The JWT `sub` is the user's handle (== script `author`), so script routes
 * scope ownership by it. Google OAuth is not wired in this build; the button
 * bounces back to /login with an error rather than hitting a dead route.
 */

import type { FastifyInstance } from 'fastify';

import {
  RegisterRequestSchema,
  LoginRequestSchema,
  ForgotPasswordRequestSchema,
  ResetPasswordRequestSchema,
  type AuthResponse,
  type AuthTokenClaims,
  type ResetTokenClaims,
} from '@archiyou/types';

import { config } from '../config';
import { parse } from '../validate';
import { userService, toPublicUser, UserError } from '../services/UserService';
import { emailService } from '../services/EmailService';
import type { UserRow } from '../db/schema';

const TOKEN_TTL = '30d';
/** Password-reset token: short-lived, purpose-scoped, and tied to the current
 *  password hash (`pfp`) so it can't be reused once the password changes. */
const RESET_TOKEN_TTL = '1h';

/** Last 10 chars of the bcrypt hash — a stable per-password fingerprint. */
function pwFingerprint(passwordHash: string): string {
  return passwordHash.slice(-10);
}

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

  // Request a reset email. Always answers 200 with the same body so it never
  // reveals whether an account exists for the address.
  fastify.post('/auth/forgot-password', async (request) => {
    const { email } = parse(ForgotPasswordRequestSchema, request.body);
    const user = userService.findByEmail(email);
    if (user) {
      const token = fastify.jwt.sign(
        { sub: user.id, type: 'reset', pfp: pwFingerprint(user.passwordHash) },
        { expiresIn: RESET_TOKEN_TTL },
      );
      const link = `${config.editorUrl}/reset-password?token=${encodeURIComponent(token)}`;
      await emailService.sendPasswordReset(user.email, link);
    }
    return { success: true };
  });

  // Complete a reset with the emailed token + a new password, then sign the user in.
  fastify.post('/auth/reset-password', async (request) => {
    const { token, password } = parse(ResetPasswordRequestSchema, request.body);

    let claims: ResetTokenClaims;
    try {
      claims = fastify.jwt.verify(token) as ResetTokenClaims;
    } catch {
      throw new UserError('invalid_token', 'This reset link is invalid or has expired');
    }

    const user = claims.type === 'reset' ? userService.findById(claims.sub) : undefined;
    // pfp mismatch ⇒ the link was already used or superseded by a newer password.
    if (!user || claims.pfp !== pwFingerprint(user.passwordHash)) {
      throw new UserError('invalid_token', 'This reset link is invalid or has expired');
    }

    await userService.setPassword(user.id, password);
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
