/**
 * plugin.ts — the editor backend as a self-contained Fastify plugin.
 *
 * Registering this on a Fastify instance wires up CORS, JWT, the `authenticate`
 * preHandler, the error mapping, and the auth + script routes. Because it is an
 * encapsulated plugin, its CORS/JWT are isolated — so it can be mounted next to
 * another API (e.g. apps/publish) on one server without decorator clashes.
 *
 *   Standalone:  fastify.register(serverApiPlugin)
 *   Combined:    fastify.register(serverApiPlugin, { prefix: '/api' })
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { config } from './config';
import { registerAuthRoutes } from './routes/auth';
import { registerScriptRoutes } from './routes/scripts';
import { ValidationError } from './validate';
import { UserError } from './services/UserService';
import { ScriptStoreError } from './services/ScriptStore';

export async function serverApiPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(import('@fastify/cors'), { origin: true });
  await fastify.register(import('@fastify/jwt'), { secret: config.jwtSecret });

  // preHandler that rejects unauthenticated requests.
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  fastify.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  // Must be set BEFORE registering route sub-plugins: encapsulated child contexts
  // inherit the error handler present at their registration time.
  setupErrorHandling(fastify);

  await fastify.register(registerAuthRoutes);
  await fastify.register(registerScriptRoutes);
}

function setupErrorHandling(fastify: FastifyInstance): void {
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(422).send({ success: false, error: error.message, issues: error.issues });
    }
    if (error instanceof UserError) {
      const code = error.code === 'email_taken' ? 409 : 401;
      return reply.code(code).send({ success: false, error: error.message });
    }
    if (error instanceof ScriptStoreError) {
      const code = error.code === 'not_found' ? 404 : 422;
      return reply.code(code).send({ success: false, error: error.message });
    }
    request.log.error(error);
    return reply.code(error.statusCode || 500).send({ success: false, error: error.message || 'Internal server error' });
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({ success: false, error: `Route ${request.method} ${request.url} not found` });
  });
}

// Fastify instance decorator typing.
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
