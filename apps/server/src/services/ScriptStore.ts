/**
 * ScriptStore — the single `script_versions` table (rows ARE ScriptData).
 *
 * Ownership is by `author` (the user's handle from the JWT). Each save appends
 * a new row (Script.id = version) sharing the file's fileId; "latest" is the
 * newest `updated` per fileId. `shared` is the ScriptShared metadata object (or
 * null) carried on ScriptData, toggled via its own endpoint. `version` resets to
 * null on every save (a concrete semver is assigned only when publishing/sharing).
 */

import { eq, and, desc, isNotNull, sql, type AnyColumn } from 'drizzle-orm';
import semver from 'semver';

import { Script } from '@archiyou/core/src/Script';
import type { ScriptData, ScriptShared } from '@archiyou/core/src/execution/types';
import { uuid4 } from '@archiyou/core/src/utils';

import { db } from '../db/client';
import { scriptVersions, type ScriptVersionRow, type NewScriptVersionRow } from '../db/schema';

export class ScriptStoreError extends Error {
  constructor(public readonly code: 'invalid' | 'not_found', message: string) {
    super(message);
  }
}

export interface VersionMeta {
  id: string;
  created: number; // epoch ms
  updated: number;
}

export class ScriptStore {
  /** Validate + normalize an incoming payload via the core Script model. */
  private normalize(data: unknown): ScriptData {
    const script = Script.fromData(data as Record<string, unknown>);
    if (!script) throw new ScriptStoreError('invalid', 'Script payload failed validation');
    return script.toData();
  }

  /** Turn a DB row into the ScriptData wire shape (ISO dates like Script.toData). */
  private rowToData(row: ScriptVersionRow): ScriptData {
    return {
      id: row.id,
      fileId: row.fileId,
      author: row.author ?? undefined,
      name: row.name ?? undefined,
      description: row.description ?? undefined,
      details: row.details ?? undefined,
      version: row.version ?? null,
      tags: row.tags ?? [],
      code: row.code,
      params: (row.params ?? {}) as ScriptData['params'],
      presets: (row.presets ?? {}) as ScriptData['presets'],
      published: (row.published ?? null) as ScriptData['published'],
      shared: (row.shared ?? null) as ScriptData['shared'],
      created: row.created.toISOString(),
      updated: row.updated.toISOString(),
    };
  }

  private toRow(
    data: ScriptData,
    author: string,
    opts: { id: string; fileId: string; version: string | null; shared: ScriptShared | null; now: Date },
  ): NewScriptVersionRow {
    return {
      id: opts.id,
      fileId: opts.fileId,
      author,
      name: data.name ?? null,
      description: data.description ?? null,
      details: data.details ?? null,
      version: opts.version, // reset-on-save: set by caller (null on ordinary saves)
      tags: (data.tags ?? []) as string[],
      code: data.code,
      params: (data.params ?? null) as ScriptData['params'],
      presets: (data.presets ?? null) as ScriptData['presets'],
      published: (data.published ?? null) as ScriptData['published'],
      shared: opts.shared,
      created: opts.now,
      updated: opts.now,
    };
  }

  /** All rows for one file owned by `author`, newest first. */
  private fileRows(author: string, fileId: string): ScriptVersionRow[] {
    return db
      .select()
      .from(scriptVersions)
      .where(and(eq(scriptVersions.fileId, fileId), eq(scriptVersions.author, author)))
      .orderBy(desc(scriptVersions.updated))
      .all();
  }

  private latestRow(author: string, fileId: string): ScriptVersionRow {
    const rows = this.fileRows(author, fileId);
    if (rows.length === 0) throw new ScriptStoreError('not_found', `Script ${fileId} not found`);
    return rows[0];
  }

  /** Reduce rows (newest first) to the latest per fileId. */
  private latestPerFile(rows: ScriptVersionRow[]): ScriptVersionRow[] {
    const seen = new Set<string>();
    const out: ScriptVersionRow[] = [];
    for (const r of rows) {
      if (seen.has(r.fileId)) continue;
      seen.add(r.fileId);
      out.push(r);
    }
    return out;
  }

  /** All of a user's scripts, latest version each, as ScriptData[]. */
  listForUser(author: string): ScriptData[] {
    const rows = db
      .select()
      .from(scriptVersions)
      .where(eq(scriptVersions.author, author))
      .orderBy(desc(scriptVersions.updated))
      .all();
    return this.latestPerFile(rows).map((r) => this.rowToData(r));
  }

  //// PUBLISHED + SHARED LIBRARY ////
  // The DB is the single source of truth for the library too: a row belongs to
  // the "published" (resp. "shared") library when that metadata column is
  // non-null. All public (not owner-scoped) — they power /scripts/published/*
  // and /scripts/shared/* + the core LibraryConnector. One generalized impl
  // backs both; pass the column (scriptVersions.published | .shared).

  /** All rows in a library (col non-null), optionally by author, latest per file. */
  private libraryList(col: AnyColumn, author?: string): ScriptData[] {
    const cond = author
      ? and(eq(scriptVersions.author, author.toLowerCase()), isNotNull(col))
      : isNotNull(col);
    const rows = db.select().from(scriptVersions).where(cond).orderBy(desc(scriptVersions.updated)).all();
    return this.latestPerFile(rows).map((r) => this.rowToData(r));
  }

  /** All rows in a library for an author/name (any version), newest first. */
  private libraryRows(col: AnyColumn, author: string, name: string): ScriptVersionRow[] {
    return db
      .select()
      .from(scriptVersions)
      // Case-insensitive name match: names are stored with their original case
      // but addressed case-insensitively in library URLs.
      .where(and(eq(scriptVersions.author, author.toLowerCase()), sql`lower(${scriptVersions.name}) = ${name.toLowerCase()}`, isNotNull(col)))
      .orderBy(desc(scriptVersions.updated))
      .all();
  }

  /** Version strings for a library author/name, latest (semver) first. */
  private libraryVersions(col: AnyColumn, author: string, name: string): string[] {
    return this.libraryRows(col, author, name)
      .map((r) => r.version)
      .filter((v): v is string => !!v)
      .sort((a, b) => semver.rcompare(semver.coerce(a) ?? '0.0.0', semver.coerce(b) ?? '0.0.0'));
  }

  /** A specific library script by author/name(/version). No version ⇒ latest. */
  private libraryGet(col: AnyColumn, author: string, name: string, version?: string): ScriptData | null {
    const rows = this.libraryRows(col, author, name);
    if (rows.length === 0) return null;

    if (version) {
      const want = semver.coerce(version);
      const row = rows.find((r) => r.version && want && semver.eq(semver.coerce(r.version) ?? '0.0.0', want));
      return row ? this.rowToData(row) : null;
    }

    // Latest: highest semver when versions are present, else newest updated.
    const sorted = [...rows].sort((a, b) => {
      const av = semver.coerce(a.version ?? '');
      const bv = semver.coerce(b.version ?? '');
      if (av && bv) return semver.rcompare(av, bv);
      return b.updated.getTime() - a.updated.getTime();
    });
    return this.rowToData(sorted[0]);
  }

  // Published library
  listPublished(): ScriptData[] { return this.libraryList(scriptVersions.published); }
  listPublishedByAuthor(author: string): ScriptData[] { return this.libraryList(scriptVersions.published, author); }
  getPublishedVersions(author: string, name: string): string[] { return this.libraryVersions(scriptVersions.published, author, name); }
  getPublished(author: string, name: string, version?: string): ScriptData | null { return this.libraryGet(scriptVersions.published, author, name, version); }

  /** Every published version owned by `author` (NOT deduped per file — powers the
   *  "manage configurators" list), newest semver first (tiebreak newest updated). */
  listPublishedVersionsForAuthor(author: string): ScriptData[] {
    const rows = db
      .select()
      .from(scriptVersions)
      .where(and(eq(scriptVersions.author, author.toLowerCase()), isNotNull(scriptVersions.published)))
      .all();
    return rows
      .map((r) => this.rowToData(r))
      .sort((a, b) => {
        const av = semver.coerce(a.version ?? '') ?? '0.0.0';
        const bv = semver.coerce(b.version ?? '') ?? '0.0.0';
        const cmp = semver.rcompare(av, bv);
        if (cmp !== 0) return cmp;
        return (Date.parse(b.updated ?? '') || 0) - (Date.parse(a.updated ?? '') || 0);
      });
  }

  /** Update the `published` metadata of a single already-published version IN PLACE
   *  (the version + code snapshot are unchanged — editing a configurator must not
   *  create a new version). Ownership-checked by row id + author. */
  updatePublishedVersion(author: string, versionId: string, published: ScriptData['published']): ScriptData {
    const row = db
      .select()
      .from(scriptVersions)
      .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.author, author.toLowerCase())))
      .get();
    if (!row) throw new ScriptStoreError('not_found', `Version ${versionId} not found`);
    const now = new Date();
    db.update(scriptVersions)
      .set({ published: published ?? null, updated: now })
      .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.author, author.toLowerCase())))
      .run();
    return this.rowToData({ ...row, published: (published ?? null) as ScriptVersionRow['published'], updated: now });
  }

  /** Un-publish a single version: clear its `published` metadata (the version row
   *  and any working/shared state are kept). Ownership-checked by row id + author. */
  unpublishVersion(author: string, versionId: string): void {
    const row = db
      .select()
      .from(scriptVersions)
      .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.author, author.toLowerCase())))
      .get();
    if (!row) throw new ScriptStoreError('not_found', `Version ${versionId} not found`);
    db.update(scriptVersions)
      .set({ published: null })
      .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.author, author.toLowerCase())))
      .run();
  }

  // Shared library
  listShared(): ScriptData[] { return this.libraryList(scriptVersions.shared); }
  listSharedByAuthor(author: string): ScriptData[] { return this.libraryList(scriptVersions.shared, author); }
  getSharedVersions(author: string, name: string): string[] { return this.libraryVersions(scriptVersions.shared, author, name); }

  /** One shared script by author/name. No version ⇒ latest; "dev" ⇒ the latest
   *  row (incl. the unversioned working copy) but only when its shared metadata
   *  has `dev` enabled. Enforces nothing about onlyUsers — callers must gate. */
  getShared(author: string, name: string, version?: string): ScriptData | null {
    if (version === 'dev') {
      const rows = this.libraryRows(scriptVersions.shared, author, name); // newest first
      const row = rows[0];
      return row && (row.shared as ScriptShared | null)?.dev ? this.rowToData(row) : null;
    }
    return this.libraryGet(scriptVersions.shared, author, name, version);
  }

  /** All shared files (latest version each) whose shared metadata carries the row. */
  private sharedLatestPerFile(): ScriptVersionRow[] {
    const rows = db
      .select()
      .from(scriptVersions)
      .where(isNotNull(scriptVersions.shared))
      .orderBy(desc(scriptVersions.updated))
      .all();
    return this.latestPerFile(rows);
  }

  /** Community-shared scripts: shared with no `onlyUsers` restriction. */
  listSharedPublic(): ScriptData[] {
    return this.sharedLatestPerFile()
      .filter((r) => {
        const only = (r.shared as ScriptShared | null)?.onlyUsers;
        return !only || only.length === 0;
      })
      .map((r) => this.rowToData(r));
  }

  /** Scripts shared specifically with `username` (present in `onlyUsers`). */
  listSharedWithUser(username: string): ScriptData[] {
    const u = username.toLowerCase();
    return this.sharedLatestPerFile()
      .filter((r) => {
        const only = (r.shared as ScriptShared | null)?.onlyUsers;
        return !!only && only.some((id) => id.toLowerCase() === u);
      })
      .map((r) => this.rowToData(r));
  }

  /** Whether `username` (null = anonymous) may read a shared script. Public
   *  shares (no onlyUsers) are open; restricted shares allow only the author or
   *  a listed user. */
  canAccessShared(script: ScriptData, username: string | null): boolean {
    const only = script.shared?.onlyUsers;
    if (!only || only.length === 0) return true;
    if (!username) return false;
    const u = username.toLowerCase();
    return script.author?.toLowerCase() === u || only.some((id) => id.toLowerCase() === u);
  }

  getFile(author: string, fileId: string): ScriptData {
    return this.rowToData(this.latestRow(author, fileId));
  }

  listVersions(author: string, fileId: string): VersionMeta[] {
    const rows = this.fileRows(author, fileId);
    if (rows.length === 0) throw new ScriptStoreError('not_found', `Script ${fileId} not found`);
    return rows.map((r) => ({ id: r.id, created: r.created.getTime(), updated: r.updated.getTime() }));
  }

  getVersion(author: string, fileId: string, versionId: string): ScriptData {
    const row = db
      .select()
      .from(scriptVersions)
      .where(and(eq(scriptVersions.id, versionId), eq(scriptVersions.fileId, fileId), eq(scriptVersions.author, author)))
      .get();
    if (!row) throw new ScriptStoreError('not_found', `Version ${versionId} not found`);
    return this.rowToData(row);
  }

  /** The file's current shared metadata (from its latest row), or null. */
  private currentShared(author: string, fileId: string): ScriptShared | null {
    const rows = this.fileRows(author, fileId);
    return rows.length > 0 ? (rows[0].shared ?? null) : null;
  }

  /** Insert a row, translating a unique-constraint hit (fileId, version) into an 'invalid' error. */
  private insertRow(row: NewScriptVersionRow): void {
    try {
      db.insert(scriptVersions).values(row).run();
    } catch (e) {
      if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
        throw new ScriptStoreError('invalid', `Version "${row.version}" already exists for this file`);
      }
      throw e;
    }
  }

  /** Create a new file (first version). `author` is server-authoritative. */
  create(author: string, payload: unknown): ScriptData {
    const data = this.normalize(payload);
    const fileId = data.fileId ?? uuid4();
    const id = data.id ?? uuid4();
    const now = new Date();
    // reset-on-save: a fresh file/version starts unversioned (null).
    const row = this.toRow(data, author, { id, fileId, version: null, shared: null, now });
    this.insertRow(row);
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Append a new version to an existing file (ownership-checked). */
  saveVersion(author: string, fileId: string, payload: unknown): ScriptData {
    this.latestRow(author, fileId); // ownership gate (throws not_found)
    const data = this.normalize(payload);
    const id = uuid4();
    const now = new Date();
    const shared = this.currentShared(author, fileId); // versions inherit the file's shared state
    // reset-on-save: each new version resets the version to null.
    const row = this.toRow(data, author, { id, fileId, version: null, shared, now });
    this.insertRow(row);
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Share a file: append a new row carrying a concrete semver + the ScriptShared
   *  metadata (both read from the payload). Ownership-checked; the unique
   *  (fileId, version) index rejects re-sharing an already-shared version. */
  share(author: string, fileId: string, payload: unknown): ScriptData {
    this.latestRow(author, fileId); // ownership gate (throws not_found)
    const data = this.normalize(payload);
    if (!data.version) throw new ScriptStoreError('invalid', 'Share requires a version');
    if (!data.shared) throw new ScriptStoreError('invalid', 'Share requires shared metadata');
    const id = uuid4();
    const now = new Date();
    const row = this.toRow(data, author, { id, fileId, version: data.version, shared: data.shared, now });
    this.insertRow(row);
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Publish a file: append a new row carrying a concrete semver + the published
   *  metadata (both read from the payload). Ownership-checked; the unique
   *  (fileId, version) index rejects re-publishing an already-used version.
   *  The file's current shared state is preserved on the new row. */
  publish(author: string, fileId: string, payload: unknown): ScriptData {
    this.latestRow(author, fileId); // ownership gate (throws not_found)
    const data = this.normalize(payload);
    if (!data.version) throw new ScriptStoreError('invalid', 'Publish requires a version');
    if (!data.published) throw new ScriptStoreError('invalid', 'Publish requires published metadata');
    const id = uuid4();
    const now = new Date();
    const shared = this.currentShared(author, fileId); // preserve the file's shared state
    const row = this.toRow(data, author, { id, fileId, version: data.version, shared, now });
    this.insertRow(row);
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Set/clear sharing metadata on all versions of a file (ownership-checked). */
  setShared(author: string, fileId: string, shared: ScriptShared | null): void {
    this.latestRow(author, fileId); // ownership gate
    db.update(scriptVersions)
      .set({ shared })
      .where(and(eq(scriptVersions.fileId, fileId), eq(scriptVersions.author, author)))
      .run();
  }

  /** Delete a file and all its versions (ownership-checked). */
  deleteFile(author: string, fileId: string): void {
    this.latestRow(author, fileId); // ownership gate
    db.delete(scriptVersions).where(and(eq(scriptVersions.fileId, fileId), eq(scriptVersions.author, author))).run();
  }
}

export const scriptStore = new ScriptStore();
