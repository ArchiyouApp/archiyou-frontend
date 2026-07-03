/**
 * ApiServer — standalone Fastify app for the editor backend (auth + per-user
 * script sync). The routes live in `serverApiPlugin` (plugin.ts) so they can
 * also be mounted into a combined server; this class just hosts + listens.
 */

import Fastify, { type FastifyInstance } from 'fastify';

import { config } from './config';
import { serverApiPlugin } from './plugin';

export class ApiServer {
  private fastify: FastifyInstance;

  constructor() {
    this.fastify = Fastify({ logger: false });
  }

  async build(): Promise<FastifyInstance> {
    await this.fastify.register(serverApiPlugin);
    return this.fastify;
  }

  async start(): Promise<void> {
    await this.build();
    try {
      await this.fastify.listen({ port: config.port, host: '0.0.0.0' });
      console.log(`🚀 Archiyou server running on http://localhost:${config.port}`);
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    await this.fastify.close();
  }
}
