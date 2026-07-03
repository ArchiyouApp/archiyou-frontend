// Archiyou server — API to host the editor (auth + per-user script sync).

import 'dotenv/config';

import { runMigrations } from './db/migrate';
import { userService } from './services/UserService';
import { ApiServer } from './ApiServer';

async function main(): Promise<void> {
  runMigrations();               // idempotent: brings the SQLite file up to the latest schema
  await userService.seedTestUser(); // ensure the .env test user exists
  await new ApiServer().start();
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
