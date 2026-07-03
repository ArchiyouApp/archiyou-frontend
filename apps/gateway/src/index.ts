/**
 * Combined API gateway — runs the editor backend and the publish library/
 * execution API in a single Fastify process for production. Each package keeps
 * its own standalone entry (apps/server, apps/publish) for separate deployment;
 * this composes them.
 *
 * Layout:
 *   /api/*      → editor backend (auth + per-user scripts)   [@archiyou/server]
 *   /library/*  → publish library + script execution         [@archiyou/publish]
 *
 * The editor talks to `/api` (its default base), so no client change is needed
 * between the standalone and combined deployments.
 */

import 'dotenv/config';

import Fastify from 'fastify';

import { serverApiPlugin } from '@archiyou/server/src/plugin';
import { runMigrations } from '@archiyou/server/src/db/migrate';
import { userService } from '@archiyou/server/src/services/UserService';
import { publishApiPlugin } from '@archiyou/publish/src/plugin';

const PORT = Number(process.env.PORT ?? 4000);
const MOUNT_PUBLISH = process.env.MOUNT_PUBLISH !== 'false';

async function main(): Promise<void> {
  // Bring the editor DB up to schema (server owns the SQLite file) + seed test user.
  runMigrations();
  await userService.seedTestUser();

  const app = Fastify({ logger: false });

  // Editor backend (auth + per-user scripts) — encapsulated, own JWT/CORS.
  await app.register(serverApiPlugin, { prefix: '/api' });

  // Publish library + execution — encapsulated, own JWT/CORS. Best-effort:
  // the plugin degrades gracefully if Redis is down (see publish/plugin.ts).
  if (MOUNT_PUBLISH) {
    await app.register(publishApiPlugin, { prefix: '/library' });
  }

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(
    `🚀 Combined API on http://localhost:${PORT}  →  /api (editor backend)` +
      (MOUNT_PUBLISH ? ' + /library (publish)' : ''),
  );
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
