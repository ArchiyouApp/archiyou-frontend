/**
 * tests/unit/thumbnails.test.ts — thumbnail validation, storage and serving.
 *
 * Two properties matter most and are asserted directly:
 *
 *   1. A thumbnail can NEVER fail a publish. It is a nicety attached after the row is
 *      already committed, so a malformed, oversized, hostile or simply absent SVG must
 *      still leave the caller with a published script (just without a preview).
 *   2. The bytes reach us through a client-controlled request body and are afterwards
 *      served from our own origin as a file, so they are allowlist-validated, not
 *      blocklist-scanned. Anything our exporter would not emit is rejected outright.
 *
 * Runs against a throwaway SQLite file and a throwaway thumbnail directory, both set
 * before the modules that read them are imported.
 */

import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

import type { ScriptData } from '@archiyou/core/src/execution/types';

let store: typeof import('../../src/services/ScriptStore').scriptStore;
let thumbnails: typeof import('../../src/services/ThumbnailStore').thumbnailStore;
let checkThumbnailSvg: typeof import('../../src/services/svgSanitize').checkThumbnailSvg;

const AUTHOR = 'tester';
let THUMB_ROOT: string;

/** A minimal document in exactly the shape SVGExporter emits. */
const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" data-units="mm">'
  + '<style>svg{color:#1f2937}.line{fill:none;stroke:currentColor;vector-effect:non-scaling-stroke}</style>'
  + '<path d="M0 0 L100 100" class="line"/></svg>';

beforeAll(async () => {
  process.env.SERVER_DATABASE_FILE = join(mkdtempSync(join(tmpdir(), 'ay-thumbs-db-')), 'test.db');
  THUMB_ROOT = mkdtempSync(join(tmpdir(), 'ay-thumbs-'));
  process.env.SERVER_THUMBNAIL_PATH = THUMB_ROOT;

  const { runMigrations } = await import('../../src/db/migrate');
  runMigrations();
  store = (await import('../../src/services/ScriptStore')).scriptStore;
  thumbnails = (await import('../../src/services/ThumbnailStore')).thumbnailStore;
  checkThumbnailSvg = (await import('../../src/services/svgSanitize')).checkThumbnailSvg;
});

function payload(over: Partial<ScriptData> = {}): Record<string, unknown> {
  return { name: 'thing', code: 'const a = 1;', ...over } as Record<string, unknown>;
}

describe('svgSanitize — allowlist', () => {
  it('accepts what the exporter actually emits', () => {
    expect(checkThumbnailSvg(GOOD_SVG, 65536).ok).toBe(true);
  });

  it.each([
    ['script element',       GOOD_SVG.replace('</svg>', '<script>alert(1)</script></svg>')],
    ['event handler',        GOOD_SVG.replace('<path ', '<path onload="alert(1)" ')],
    ['xlink:href',           GOOD_SVG.replace('</svg>', '<use xlink:href="#x"/></svg>')],
    ['foreignObject',        GOOD_SVG.replace('</svg>', '<foreignObject><b>x</b></foreignObject></svg>')],
    ['external image',       GOOD_SVG.replace('</svg>', '<image href="http://evil/x.png"/></svg>')],
    ['anchor',               GOOD_SVG.replace('</svg>', '<a href="javascript:alert(1)">x</a></svg>')],
    ['entity declaration',   `<!DOCTYPE svg [<!ENTITY x "y">]>${GOOD_SVG}`],
    ['CSS url()',            GOOD_SVG.replace('svg{color:#1f2937}', 'svg{background:url(http://evil/x)}')],
    ['animation element',    GOOD_SVG.replace('</svg>', '<animate attributeName="x"/></svg>')],
    ['two roots',            `${GOOD_SVG}${GOOD_SVG}`],
    ['not an svg',           '<html><body>hi</body></html>'],
    ['empty',                ''],
  ])('rejects %s', (_label, hostile) => {
    expect(checkThumbnailSvg(hostile, 65536).ok).toBe(false);
  });

  it('rejects anything over the byte cap', () => {
    const huge = GOOD_SVG.replace('M0 0 L100 100', 'M0 0' + ' L1 1'.repeat(20000));
    expect(checkThumbnailSvg(huge, 1024).ok).toBe(false);
  });
});

describe('ThumbnailStore', () => {
  it('writes a content-addressed file and returns its URL', async () => {
    const url = await thumbnails.write(AUTHOR, 'file-1', 'version-1', GOOD_SVG);
    expect(url).toMatch(/^\/thumbnails\/tester\/file-1\/version-1-[0-9a-f]{8}\.svg$/);
    expect(existsSync(join(THUMB_ROOT, 'tester', 'file-1', url!.split('/').pop()!))).toBe(true);
  });

  it('gives a regenerated thumbnail a NEW url and removes the old file', async () => {
    const first = await thumbnails.write(AUTHOR, 'file-2', 'version-2', GOOD_SVG);
    const changed = GOOD_SVG.replace('M0 0 L100 100', 'M0 0 L200 200');
    const second = await thumbnails.write(AUTHOR, 'file-2', 'version-2', changed);

    // Content-addressed: a different drawing must never reuse the old URL, which is
    // what makes Cache-Control: immutable safe on the static mount.
    expect(second).not.toBe(first);
    expect(readdirSync(join(THUMB_ROOT, 'tester', 'file-2'))).toEqual([second!.split('/').pop()]);
  });

  it('returns null (never throws) for absent or hostile input', async () => {
    for (const bad of [undefined, null, '', '<script>alert(1)</script>', 42, {}]) {
      await expect(thumbnails.write(AUTHOR, 'file-3', 'version-3', bad)).resolves.toBeNull();
    }
    expect(existsSync(join(THUMB_ROOT, 'tester', 'file-3'))).toBe(false);
  });

  it('refuses path traversal in the id segments', async () => {
    for (const evil of ['..', '../..', 'a/../../b', '/etc/passwd']) {
      await expect(thumbnails.write(evil, 'f', 'v', GOOD_SVG)).resolves.toBeNull();
      await expect(thumbnails.write(AUTHOR, evil, 'v', GOOD_SVG)).resolves.toBeNull();
      await expect(thumbnails.write(AUTHOR, 'f', evil, GOOD_SVG)).resolves.toBeNull();
    }
  });

  it('removes a whole file directory on delete', async () => {
    await thumbnails.write(AUTHOR, 'file-4', 'version-4', GOOD_SVG);
    expect(existsSync(join(THUMB_ROOT, 'tester', 'file-4'))).toBe(true);
    await thumbnails.remove(AUTHOR, 'file-4');
    expect(existsSync(join(THUMB_ROOT, 'tester', 'file-4'))).toBe(false);
  });
});

describe('ScriptStore — thumbnail column', () => {
  it('round-trips a stamped url and never persists one the client supplied', () => {
    const fileId = store.create(AUTHOR, payload()).fileId as string;

    // A client-set `thumbnail` is meaningless: the routes overwrite it from the file they
    // actually wrote. What matters here is that the column round-trips a server value.
    const version = store.publish(AUTHOR, fileId, payload({
      version: '1.0.0',
      published: { public: true },
    }));
    expect(version.thumbnail).toBeNull();

    store.setThumbnail(AUTHOR, version.id as string, '/thumbnails/tester/x/y.svg');
    const reloaded = store.listPublishedVersionsForAuthor(AUTHOR).find((s) => s.id === version.id);
    expect(reloaded?.thumbnail).toBe('/thumbnails/tester/x/y.svg');
  });

  it('does not let another author stamp your thumbnail', () => {
    const fileId = store.create(AUTHOR, payload({ name: 'mine' })).fileId as string;
    const version = store.publish(AUTHOR, fileId, payload({
      name: 'mine', version: '1.0.0', published: { public: true },
    }));

    store.setThumbnail('someone-else', version.id as string, '/thumbnails/evil.svg');

    const reloaded = store.listPublishedVersionsForAuthor(AUTHOR).find((s) => s.id === version.id);
    expect(reloaded?.thumbnail).toBeNull();
  });
});

/**
 * End to end over HTTP: publish carries the SVG, the response comes back with a URL, and
 * that URL actually resolves through the static mount with the caching + hardening headers.
 * A URL nothing serves would be worse than no thumbnail at all.
 */
describe('publish → serve (HTTP)', () => {
  const SECRET = 'test-secret-for-thumbnails';
  let app: FastifyInstance;
  let fileId: string;

  beforeAll(async () => {
    const { registerScriptRoutes } = await import('../../src/routes/scripts');
    const { userService } = await import('../../src/services/UserService');
    const { config } = await import('../../src/config');

    // publish sits behind requireVerified — give the test author a verified account.
    // The handle is derived from the email local part, so `tester@…` yields AUTHOR.
    await userService.register(`${AUTHOR}@example.com`, 'test1234', 'Tester').catch(() => undefined);
    const user = userService.findByUsername(AUTHOR);
    expect(user, 'test author account').toBeTruthy();
    userService.markEmailVerified(user!.id);

    app = Fastify();
    await app.register(import('@fastify/jwt'), { secret: SECRET });
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
      try { await request.jwtVerify(); }
      catch { reply.code(401).send({ success: false, error: 'Unauthorized' }); }
    });
    await app.register(import('@fastify/static'), {
      root: resolve(config.thumbnails.path),
      prefix: `${config.thumbnails.urlPrefix}/`,
      index: false, dotfiles: 'deny', immutable: true, maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      },
    });
    await app.register(registerScriptRoutes);
    await app.ready();

    fileId = store.create(AUTHOR, payload({ name: 'http-thing' })).fileId as string;
  });

  const auth = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: AUTHOR, email: 'tester@example.com', name: 'T' })}` });

  const publish = (version: string, thumbnailSvg?: unknown) => app.inject({
    method: 'POST',
    url: `/scripts/${AUTHOR}/${fileId}/publish`,
    headers: auth(),
    payload: { name: 'http-thing', code: 'const a = 1;', version, published: { public: true }, thumbnailSvg },
  });

  it('stamps a working URL and serves the file with cache + hardening headers', async () => {
    const published = await publish('1.0.0', GOOD_SVG);
    expect(published.statusCode).toBe(201);

    const url = published.json().thumbnail as string;
    expect(url).toMatch(/^\/thumbnails\//);
    // The raw SVG must never come back in the API response — only the URL.
    expect(published.body).not.toContain('<svg');

    const served = await app.inject({ method: 'GET', url });
    expect(served.statusCode).toBe(200);
    expect(served.body).toBe(GOOD_SVG);
    expect(served.headers['content-type']).toContain('image/svg+xml');
    expect(served.headers['x-content-type-options']).toBe('nosniff');
    expect(served.headers['content-security-policy']).toContain('sandbox');
    expect(served.headers['cache-control']).toContain('immutable');

    // Conditional request → 304, so list views don't re-download every icon.
    const revalidated = await app.inject({
      method: 'GET', url, headers: { 'if-none-match': served.headers.etag as string },
    });
    expect(revalidated.statusCode).toBe(304);
  });

  it.each([
    ['a hostile svg',  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['a non-svg',      'not an svg at all'],
    ['nothing',        undefined],
  ])('still publishes (201, thumbnail null) when given %s', async (_label, svg) => {
    const version = `1.${_label.length}.0`;
    const res = await publish(version, svg);
    expect(res.statusCode).toBe(201);
    expect(res.json().thumbnail).toBeNull();
  });

  it('404s a thumbnail that was never written', async () => {
    const res = await app.inject({ method: 'GET', url: '/thumbnails/tester/nope/nope-00000000.svg' });
    expect(res.statusCode).toBe(404);
  });
});
