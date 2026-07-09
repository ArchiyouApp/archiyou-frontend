/**
 * routes/users.ts — minimal user directory, used by the "Share only with" picker.
 *
 * Only a search endpoint is exposed, and only to authenticated callers. Results
 * are client-safe PublicUser views and always exclude the caller themselves.
 */

import type { FastifyInstance } from 'fastify';

import { userService } from '../services/UserService';

export async function registerUserRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: { q?: string } }>(
    '/users/search',
    { preHandler: fastify.authenticate },
    async (request) => {
      const q = (request.query.q ?? '').trim();
      if (q.length === 0) return { success: true, data: [] };
      return { success: true, data: userService.search(q, request.user.sub) };
    },
  );
}
