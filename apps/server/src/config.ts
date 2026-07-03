/**
 * config.ts — typed environment config. `dotenv/config` is imported in index.ts
 * before this module is used.
 */

const isProduction = process.env.NODE_ENV === 'production';

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
