// Archiyou server — one backend, one root API namespace.
//
//   /auth/*                          auth
//   /scripts/{user}/*                the user's own scripts (authed, self-scoped)
//   /scripts/{published,shared}/*    public libraries (DB-backed)
//   /scripts/published/execute/*     server-side execution (Redis/BullMQ; `pnpm worker`)
//
// The DB (script_versions) is the single source of truth for scripts; a row is
// "published"/"shared" when that metadata column is set.

import 'dotenv/config';

import Fastify from 'fastify';

import { config } from './config';
import { runMigrations } from './db/migrate';
import { userService } from './services/UserService';
import { serverApiPlugin } from './plugin';

async function main(): Promise<void> {
  runMigrations();               // idempotent: brings the SQLite file up to the latest schema
  await userService.seedTestUser(); // ensure the .env test user exists

  const app = Fastify({ logger: false });

  // The whole API at the root — one JWT/CORS, one /scripts namespace.
  await app.register(serverApiPlugin);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`🚀 Archiyou server on http://localhost:${config.port}  →  /auth + /scripts/{user,published,shared}`);
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
