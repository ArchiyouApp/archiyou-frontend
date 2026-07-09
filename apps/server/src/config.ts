/**
 * config.ts — typed environment config. `dotenv/config` is imported in index.ts
 * before this module is used.
 */

const isProduction = process.env.NODE_ENV === 'production';

// The execution result cache (Library) reads LIBRARY_PATH from the environment
// directly; give it a dev default so a bare `pnpm dev` never throws.
process.env.LIBRARY_PATH ??= './data/cache';
process.env.LIBRARY_URL ??= `http://localhost:${process.env.PORT ?? 4100}`;

/** In production a real secret is mandatory; in dev we fall back to a fixed
 *  value so `pnpm dev` boots with no `.env`. Tokens signed with it are not
 *  secure — never run production without a real JWT_SECRET. */
function jwtSecret(): string {
  const v = process.env.JWT_SECRET;
  if (v) return v;
  if (isProduction) throw new Error('Missing required environment variable: JWT_SECRET');
  console.warn('⚠️  JWT_SECRET not set — using an insecure dev default. Set JWT_SECRET for production.');
  return 'dev-insecure-jwt-secret-change-me';
}

export const config = {
  port: Number(process.env.PORT ?? 4100),
  jwtSecret: jwtSecret(),
  editorUrl: process.env.EDITOR_URL ?? 'http://localhost:5173',

  /** Admin password for the library admin routes (login → JWT). */
  adminPassword: process.env.ADMIN_PASSWORD ?? '',

  /** Published-library + execution result cache. */
  library: {
    path: process.env.LIBRARY_PATH ?? './data/cache',
    url: process.env.LIBRARY_URL ?? `http://localhost:${process.env.PORT ?? 4100}`,
  },

  /** Redis/BullMQ for the server-side execution pipeline (ExecutionBroker/Worker). */
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  /**
   * Mailgun (transactional email, e.g. password reset). Matches the legacy setup
   * (EU region, mg.archiyou.com). When `key` is empty the EmailService logs the
   * message to the console instead of sending — so dev works with no credentials.
   */
  mailgun: {
    key: process.env.MAILGUN_KEY ?? '',
    domain: process.env.MAILGUN_DOMAIN ?? 'mg.archiyou.com',
    apiBase: process.env.MAILGUN_API_BASE ?? 'https://api.eu.mailgun.net',
    from: process.env.EMAIL_FROM ?? 'Archiyou <info@archiyou.com>',
  },

  /**
   * The single test user (no users table yet). `username` is the script
   * `author` handle used to scope ownership. Defaults let `pnpm dev` work with
   * no `.env`; override in `.env` for real credentials.
   */
  testUser: {
    username: (process.env.TEST_USER_USERNAME ?? 'test').toLowerCase(),
    email: process.env.TEST_USER_EMAIL ?? 'test@archiyou.com',
    password: process.env.TEST_USER_PASSWORD ?? 'test1234',
    name: process.env.TEST_USER_NAME ?? 'Test User',
  },
};
