import { defineConfig } from 'drizzle-kit';

// Drizzle Kit config — generates SQL migrations from src/db/schema.ts.
// The runtime DB file is resolved from DATABASE_FILE (see src/db/client.ts);
// migrations are generated statically and applied via `pnpm db:migrate`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_FILE ?? './data/archiyou.db',
  },
});
