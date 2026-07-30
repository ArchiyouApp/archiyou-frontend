/**
 * plugin.ts — the whole Archiyou backend as one root Fastify plugin.
 *
 * Wires up CORS, JWT, the `authenticate` preHandler, error mapping, `/health`,
 * the Redis/BullMQ execution pipeline, and every route group at the ROOT:
 *   - /auth/*                          auth (routes/auth.ts)
 *   - /scripts/{user}/*                the user's own scripts, authed (routes/scripts.ts)
 *   - /scripts/{published,shared}/*    public libraries (routes/library.ts)
 *   - /scripts/published/execute/*     server-side execution (routes/execute.ts)
 *
 * One JWT/CORS, one namespace — no `/api` split and no duplicate library auth.
 * Execution init connects to Redis; it is best-effort with a timeout so the
 * read routes still serve if Redis is down (only /execute degrades → 503).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { config } from './config';
import { ExecutionManager } from './execution/ExecutionManager';
import { registerAuthRoutes } from './routes/auth';
import { registerUserRoutes } from './routes/users';
import { registerScriptRoutes } from './routes/scripts';
import { registerLibraryRoutes } from './routes/library';
import { registerExecuteRoutes } from './routes/execute';
import { registerProxyRoutes } from './routes/proxy';
import { ValidationError } from './validate';
import { UserError } from './services/UserService';
import { ScriptStoreError } from './services/ScriptStore';

const EXECUTION_INIT_TIMEOUT_MS = 5000;

export async function serverApiPlugin(fastify: FastifyInstance): Promise<void> {
  // Explicit origin allowlist (config.corsOrigins = FRONTEND_URL + SERVER_CORS_ORIGINS).
  // Requests with no Origin header (curl, server-to-server) are allowed through —
  // CORS is a browser mechanism and blocking them would break API consumers.
  await fastify.register(import('@fastify/cors'), {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
  });

  // Baseline security headers at the app layer, so they hold however this is
  // deployed rather than depending on the Caddy vhost in front of it. CSP is set
  // by Caddy for the frontend; this API serves JSON, so the default CSP here
  // would only get in the way of the /proxy asset route.
  await fastify.register(import('@fastify/helmet'), { contentSecurityPolicy: false });

  await fastify.register(import('@fastify/jwt'), { secret: config.jwtSecret });

  // preHandler that rejects unauthenticated requests.
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Redis/BullMQ execution pipeline. Best-effort: read routes must still register
  // if Redis is down — only /execute degrades. Exposed only once init succeeds,
  // so the execute route returns a clean 503 while the pipeline is unavailable.
  let manager: ExecutionManager | undefined;
  try {
    const m = new ExecutionManager();
    await Promise.race([
      m.init(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`execution init timed out after ${EXECUTION_INIT_TIMEOUT_MS}ms`)), EXECUTION_INIT_TIMEOUT_MS),
      ),
    ]);
    manager = m;
    console.log('🔧 Execution pipeline ready (Redis/BullMQ).');
  } catch (err) {
    console.warn('⚠️  Execution pipeline unavailable (is Redis running?):', (err as Error).message);
    console.warn('    Library read routes are served; /scripts/published/execute will 503 until Redis is reachable.');
  }
  fastify.decorate('executionManager', manager);

  fastify.get('/health', async () => ({ status: 'healthy', timestamp: new Date().toISOString() }));

  // Must be set BEFORE registering route sub-plugins: encapsulated child contexts
  // inherit the error handler present at their registration time.
  setupErrorHandling(fastify);

  await fastify.register(registerAuthRoutes);
  await fastify.register(registerUserRoutes);     // /users/search (authed)
  await fastify.register(registerScriptRoutes);   // /scripts/{user}/* (authed)
  await fastify.register(registerLibraryRoutes);  // /scripts/{published,shared}/* (public)
  await fastify.register(registerExecuteRoutes);  // /scripts/published/execute/*
  await fastify.register(registerProxyRoutes);    // /proxy?url= (asset proxy for $import)
}

function setupErrorHandling(fastify: FastifyInstance): void {
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(422).send({ success: false, error: error.message, issues: error.issues });
    }
    if (error instanceof UserError) {
      const code =
        error.code === 'email_taken' ? 409 :
        error.code === 'invalid_token' ? 400 :
        401;
      return reply.code(code).send({ success: false, error: error.message });
    }
    if (error instanceof ScriptStoreError) {
      const code = error.code === 'not_found' ? 404 : 422;
      return reply.code(code).send({ success: false, error: error.message });
    }
    request.log.error(error);
    const status = error.statusCode || 500;
    // Never echo an unmapped error's message to the client: those come from deep
    // internals (file paths, SQL, upstream responses) and make a useful recon
    // oracle. 4xx statuses are ones we set deliberately, so their text is safe.
    const message = status >= 500 ? 'Internal server error' : (error.message || 'Request failed');
    if (status >= 500) console.error('Unhandled server error:', error);
    return reply.code(status).send({ success: false, error: message });
  });

  fastify.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({ success: false, error: `Route ${request.method} ${request.url} not found` });
  });
}

// Fastify instance decorator typing.
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    executionManager?: ExecutionManager;
  }
}
