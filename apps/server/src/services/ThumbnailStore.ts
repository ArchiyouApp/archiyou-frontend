/**
 * ThumbnailStore.ts — thumbnail SVGs as files on disk, a URL on the Script.
 *
 * Thumbnails are iso line drawings produced in the BROWSER at publish/share time (see
 * packages/core/src/modeler/SVGExporter.ts — server-side script execution is disabled by
 * design, so the server can never generate one itself). The client sends the SVG source
 * alongside the script; this store writes it and hands back a URL, which is what actually
 * gets persisted on the row.
 *
 * Why files rather than a DB column or table: every library list response already carries
 * each script's full `code`, and `GET /scripts/published` returns them all. Putting ~64 KB
 * of SVG in that payload would make the very lists this feature exists to improve markedly
 * worse. A ~60-byte URL costs nothing, and the bytes are then served by a plain static
 * mount with proper caching (see plugin.ts) instead of through the JSON API.
 *
 * Layout, content-addressed:
 *     {config.thumbnails.path}/{author}/{fileId}/{versionId}-{hash8}.svg
 *
 * The content hash in the filename is load-bearing: the URL changes whenever the drawing
 * changes, which makes `Cache-Control: immutable` unconditionally correct (no `?v=` query
 * dance), guarantees a regenerated thumbnail can never be served stale, and makes the
 * filename unguessable — the only protection a restricted (`onlyUsers`) share's thumbnail
 * has, since a static mount cannot run the access check. That is a knowing trade for a
 * line drawing whose URL is only ever handed out in an access-gated API response.
 *
 * EVERY failure here is silent and returns null. A thumbnail is a nicety; a publish that
 * 500s because a directory was not writable is not.
 */

import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config';
import { checkThumbnailSvg } from './svgSanitize';

/** Path segments come from server-controlled ids, but they end up as filesystem paths —
 *  a traversal check on anything that becomes a path is not optional. */
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function safeSegments(...segments: Array<string | undefined | null>): string[] | null {
  const out: string[] = [];
  for (const s of segments) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 128) return null;
    if (s === '.' || s === '..' || !SAFE_SEGMENT.test(s)) return null;
    out.push(s);
  }
  return out;
}

function contentHash(svg: string): string {
  return createHash('sha256').update(svg, 'utf8').digest('hex').slice(0, 8);
}

export class ThumbnailStore {
  private readonly root = config.thumbnails.path;
  private readonly urlPrefix = config.thumbnails.urlPrefix.replace(/\/+$/, '');

  /**
   * Validate + store `svg` for one script version and return its public URL.
   * Returns null when there is nothing to store or anything at all goes wrong.
   */
  async write(
    author: string,
    fileId: string,
    versionId: string,
    svg: unknown,
  ): Promise<string | null> {
    if (svg === undefined || svg === null || svg === '') return null;

    const segments = safeSegments(author, fileId, versionId);
    if (!segments) {
      console.warn(`ThumbnailStore: refusing unsafe path segments for ${author}/${fileId}`);
      return null;
    }
    const [authorSeg, fileSeg, versionSeg] = segments;

    const check = checkThumbnailSvg(svg, config.thumbnails.maxBytes);
    if (!check.ok) {
      console.warn(`ThumbnailStore: rejected thumbnail for ${authorSeg}/${fileSeg}: ${check.reason}`);
      return null;
    }
    const source = svg as string;

    try {
      const dir = join(this.root, authorSeg, fileSeg);
      await mkdir(dir, { recursive: true });

      const filename = `${versionSeg}-${contentHash(source)}.svg`;
      const target = join(dir, filename);

      // Write to a temp file then rename: a reader (the static mount) can only ever see
      // a complete file, never a half-written one.
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, source, 'utf8');
      await rename(tmp, target);

      // Drop any earlier drawing for this same version — its URL is already superseded.
      await this.removeOtherVersions(dir, versionSeg, filename);

      return `${this.urlPrefix}/${authorSeg}/${fileSeg}/${filename}`;
    } catch (error) {
      console.warn(`ThumbnailStore: failed to write thumbnail for ${authorSeg}/${fileSeg}:`, (error as Error).message);
      return null;
    }
  }

  /** Remove a single version's thumbnail, or the whole file's directory when `versionId`
   *  is omitted (un-publish, delete). Silent — a missing file is the desired end state. */
  async remove(author: string, fileId: string, versionId?: string): Promise<void> {
    const segments = safeSegments(author, fileId);
    if (!segments) return;
    const [authorSeg, fileSeg] = segments;

    try {
      const dir = join(this.root, authorSeg, fileSeg);
      if (!versionId) {
        await rm(dir, { recursive: true, force: true });
        return;
      }
      const versionSeg = safeSegments(versionId)?.[0];
      if (!versionSeg) return;
      await this.removeOtherVersions(dir, versionSeg, null);
    } catch {
      // Nothing to do — the point of this call is for the file not to exist.
    }
  }

  /** Delete every file for `versionId` except `keep` (null ⇒ delete them all). */
  private async removeOtherVersions(dir: string, versionId: string, keep: string | null): Promise<void> {
    try {
      const entries = await readdir(dir);
      await Promise.all(
        entries
          .filter((f) => f !== keep && f.startsWith(`${versionId}-`) && f.endsWith('.svg'))
          .map((f) => unlink(join(dir, f)).catch(() => undefined)),
      );
    } catch {
      // Directory may not exist yet — fine.
    }
  }
}

export const thumbnailStore = new ThumbnailStore();
