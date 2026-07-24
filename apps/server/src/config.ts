/**
 * config.ts — typed environment config. `dotenv/config` is imported in index.ts
 * before this module is used.
 *
 * Convention: the one frontend-facing setting is grouped under FRONTEND;
 * everything else is BACKEND and prefixed `SERVER_` in the environment.
 */

const isProduction = process.env.NODE_ENV === 'production';

// Legacy file-based execution-result cache (execution/Library.ts) reads these
// from the environment directly. They are no longer part of the documented
// .env — keep dev defaults so instantiating that class never throws.
process.env.LIBRARY_PATH ??= './data/cache';
process.env.LIBRARY_URL ??= `http://localhost:${process.env.SERVER_PORT ?? 4100}`;

/** In production a real secret is mandatory; in dev we fall back to a fixed
 *  value so `pnpm dev` boots with no `.env`. Tokens signed with it are not
 *  secure — never run production without a real SERVER_JWT_SECRET. */
function jwtSecret(): string {
  const v = process.env.SERVER_JWT_SECRET;
  if (v) return v;
  if (isProduction) throw new Error('Missing required environment variable: SERVER_JWT_SECRET');
  console.warn('⚠️  SERVER_JWT_SECRET not set — using an insecure dev default. Set SERVER_JWT_SECRET for production.');
  return 'dev-insecure-jwt-secret-change-me';
}

export const config = {
  //// FRONTEND ////

  /** Public origin of the frontend app (editor + configurator). Base for
   *  password-reset links and the published configurator URLs stamped on
   *  publish. Defaults to the Vite dev server so `pnpm dev` works with no `.env`. */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  //// BACKEND ////

  port: Number(process.env.SERVER_PORT ?? 4100),
  jwtSecret: jwtSecret(),

  /** Admin password for the library admin routes (login → JWT). */
  adminPassword: process.env.SERVER_ADMIN_PASSWORD ?? '',

  /**
   * Asset proxy (routes/proxy.ts) — lets browser scripts `$import()` remote
   * assets (SVG/GeoJSON/STL/…) that CORS would otherwise block. Open but
   * guarded: SSRF checks, a size cap, a request timeout and a per-IP rate limit.
   * All env-overridable. `allowlist` (comma-separated hostnames) is optional;
   * when set, only those hosts may be proxied.
   */
  proxy: {
    /** Max response size in bytes (default 5 MB). */
    maxBytes: Number(process.env.SERVER_PROXY_MAX_BYTES ?? 5 * 1024 * 1024),
    /** Upstream request timeout in ms. */
    timeoutMs: Number(process.env.SERVER_PROXY_TIMEOUT_MS ?? 10_000),
    /** Max redirect hops to follow (each revalidated against SSRF rules). */
    maxRedirects: Number(process.env.SERVER_PROXY_MAX_REDIRECTS ?? 4),
    /** Per-IP rate limit: max requests within the window. */
    rateLimit: Number(process.env.SERVER_PROXY_RATE_LIMIT ?? 60),
    /** Rate-limit window in ms. */
    rateWindowMs: Number(process.env.SERVER_PROXY_RATE_WINDOW_MS ?? 60_000),
    /** Optional comma-separated hostname allowlist (empty = allow any public host). */
    allowlist: (process.env.SERVER_PROXY_ALLOWLIST ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  },

  /** Redis/BullMQ for the server-side execution pipeline (ExecutionBroker/Worker). */
  redis: {
    host: process.env.SERVER_REDIS_HOST ?? 'localhost',
    port: Number(process.env.SERVER_REDIS_PORT ?? 6379),
    password: process.env.SERVER_REDIS_PASSWORD || undefined,
  },

  /**
   * Mailgun (transactional email, e.g. password reset). Matches the legacy setup
   * (EU region, mg.archiyou.com). When `key` is empty the EmailService logs the
   * message to the console instead of sending — so dev works with no credentials.
   */
  mailgun: {
    key: process.env.SERVER_MAILGUN_KEY ?? '',
    domain: process.env.SERVER_MAILGUN_DOMAIN ?? 'mg.archiyou.com',
    apiBase: process.env.SERVER_MAILGUN_API_BASE ?? 'https://api.eu.mailgun.net',
    from: process.env.SERVER_EMAIL_FROM ?? 'Archiyou <info@archiyou.com>',
  },

  /**
   * The single test user (no users table yet). `username` is the script
   * `author` handle used to scope ownership. Defaults let `pnpm dev` work with
   * no `.env`; override in `.env` for real credentials.
   */
  testUser: {
    username: (process.env.SERVER_TEST_USER_USERNAME ?? 'test').toLowerCase(),
    email: process.env.SERVER_TEST_USER_EMAIL ?? 'test@archiyou.com',
    password: process.env.SERVER_TEST_USER_PASSWORD ?? 'test1234',
    name: process.env.SERVER_TEST_USER_NAME ?? 'Test User',
  },
};
