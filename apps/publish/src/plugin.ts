/**
 * plugin.ts — the publish library/execution API as a Fastify plugin.
 *
 * Registers the publish routes (CORS, JWT, library GET/execute, admin) onto the
 * given instance and initializes the Redis/BullMQ execution pipeline. Because
 * it is encapsulated, its CORS/JWT are isolated so it can be mounted alongside
 * another API on one server.
 *
 *   Combined:  fastify.register(publishApiPlugin, { prefix: '/library' })
 *
 * Execution init connects to Redis. To keep a combined server resilient, init
 * is best-effort with a timeout: if Redis is unavailable the read/library
 * routes still register and serve; only script *execution* is degraded.
 */

import type { FastifyInstance } from 'fastify';

import { ApiServer } from './ApiServer';

const EXECUTION_INIT_TIMEOUT_MS = 5000;

export async function publishApiPlugin(fastify: FastifyInstance): Promise<void> {
  // Constructing with an injected instance registers all publish routes onto it.
  // Guard construction (e.g. missing LIBRARY_PATH throws in the Library ctor) so
  // a publish misconfig never takes down a co-hosted editor API.
  let server: ApiServer;
  try {
    server = new ApiServer({ fastify });
  } catch (err) {
    console.warn('⚠️  Publish API not mounted:', (err as Error).message);
    return;
  }

  // Execution needs Redis; degrade gracefully (read/library routes still serve).
  try {
    await Promise.race([
      server.initExecution(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`execution init timed out after ${EXECUTION_INIT_TIMEOUT_MS}ms`)), EXECUTION_INIT_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.warn('⚠️  Publish execution pipeline unavailable (is Redis running?):', (err as Error).message);
    console.warn('    Library read routes are served; script execution will error until Redis is reachable.');
  }
}
