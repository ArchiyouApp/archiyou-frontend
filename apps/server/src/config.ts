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
 *  secure — never run production without a real SERVER_JWT_SECRET.
 *
 *  Resolved lazily (see the `jwtSecret` getter below) so that processes which
 *  never mint or verify a token — notably the execution worker — do not need the
 *  secret in their environment at all. Handing it to the worker would put it in
 *  reach of the unsandboxed script Runner. */
let jwtSecretCache: string | undefined;
function jwtSecret(): string {
  if (jwtSecretCache !== undefined) return jwtSecretCache;
  const v = process.env.SERVER_JWT_SECRET;
  if (v) return (jwtSecretCache = v);
  if (isProduction) throw new Error('Missing required environment variable: SERVER_JWT_SECRET');
  console.warn('⚠️  SERVER_JWT_SECRET not set — using an insecure dev default. Set SERVER_JWT_SECRET for production.');
  return (jwtSecretCache = 'dev-insecure-jwt-secret-change-me');
}

export const config = {
  //// FRONTEND ////

  /** Public origin of the frontend app (editor + configurator). Base for
   *  password-reset links and the published configurator URLs stamped on
   *  publish. Defaults to the Vite dev server so `pnpm dev` works with no `.env`. */
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',

  //// BACKEND ////

  port: Number(process.env.SERVER_PORT ?? 4100),
  /** Lazy: only the API process touches this, so the worker can run without it. */
  get jwtSecret(): string { return jwtSecret(); },

  /**
   * Browser origins allowed to call this API. `frontendUrl` is always included;
   * SERVER_CORS_ORIGINS adds more (comma-separated) for extra frontends or API
   * consumers. Previously this was `origin: true`, which reflected any origin —
   * so every website on the internet could call every public endpoint.
   *
   * In the recommended same-origin deployment (editor and /api behind one host)
   * no CORS is needed at all and this list is simply unused.
   */
  corsOrigins: [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    ...(process.env.SERVER_CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ],

  /**
   * Server-side script execution (routes/execute.ts → ExecutionWorker → Runner).
   *
   * ⚠️  SECURITY: the Runner compiles script source with `new AsyncFunction` and
   * runs it directly in the worker's Node process — there is no sandbox, so a
   * script gets full Node capability (fs, child_process, network, process.env).
   * In the browser that is contained by the Web Worker boundary; on the server
   * it is not.
   *
   * Therefore this feature is DISABLED BY DEFAULT: `allowedAuthors` is empty, so
   * every request 403s. Set SERVER_EXECUTION_AUTHORS to a comma-separated list of
   * script authors you trust to run arbitrary code on this machine. The route
   * additionally requires an authenticated caller.
   *
   * Tracking issue: replace with a real isolate (isolated-vm / per-job container)
   * so this can be opened up again.
   */
  execution: {
    allowedAuthors: (process.env.SERVER_EXECUTION_AUTHORS ?? '')
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
    /** Wall-clock cap on a single script run, so `while(true){}` can't pin the worker. */
    timeoutMs: Number(process.env.SERVER_EXECUTION_TIMEOUT_MS ?? 30_000),
  },

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

  /**
   * Per-IP rate limits on the credential endpoints (/auth/login, /auth/register,
   * /auth/forgot-password, /auth/reset-password, /auth/resend-verification).
   * There was previously no limiting at all, leaving password brute-force and
   * reset-mail bombing wide open.
   *
   * Keyed on request.ip, which is only meaningful because trustProxy is set in
   * index.ts — behind Caddy without it, every client shares one bucket.
   */
  authRateLimit: {
    max: Number(process.env.SERVER_AUTH_RATE_LIMIT ?? 10),
    timeWindow: process.env.SERVER_AUTH_RATE_WINDOW ?? '5 minutes',
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
   * A convenience development account, seeded on boot by userService.seedTestUser().
   * `username` is the script `author` handle used to scope ownership. The defaults
   * let `pnpm dev` work with no `.env` at all.
   *
   * ⚠️  NOT seeded in production. Previously this ran unconditionally on every
   * boot, so a production container came up with a `test` / `test1234` account —
   * publicly known credentials, and `test` is a plausible script-author handle.
   * To seed it deliberately in production, set SERVER_SEED_TEST_USER=true AND an
   * explicit SERVER_TEST_USER_PASSWORD (see `seedTestUser` below).
   */
  testUser: {
    username: (process.env.SERVER_TEST_USER_USERNAME ?? 'test').toLowerCase(),
    email: process.env.SERVER_TEST_USER_EMAIL ?? 'test@archiyou.com',
    password: process.env.SERVER_TEST_USER_PASSWORD ?? 'test1234',
    name: process.env.SERVER_TEST_USER_NAME ?? 'Test User',
  },

  /**
   * Whether to seed the account above. Always on outside production; in
   * production it requires both an explicit opt-in and a real password, so the
   * default credentials can never reach a live instance.
   */
  seedTestUser: !isProduction
    || (process.env.SERVER_SEED_TEST_USER === 'true' && !!process.env.SERVER_TEST_USER_PASSWORD),
};
