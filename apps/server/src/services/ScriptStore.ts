/**
 * ScriptStore — the single `script_versions` table (rows ARE ScriptData).
 *
 * Ownership is by `author` (the user's handle from the JWT). Each save appends
 * a new row (Script.id = version) sharing the file's fileId; "latest" is the
 * newest `updated` per fileId. `shared` is server-side metadata (not part of
 * ScriptData) toggled via its own endpoint.
 */

import { eq, and, desc } from 'drizzle-orm';

import { Script } from '@archiyou/core/src/execution/Script';
import type { ScriptData } from '@archiyou/core/src/execution/types';
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
      tags: row.tags ?? [],
      code: row.code,
      params: (row.params ?? {}) as ScriptData['params'],
      presets: (row.presets ?? {}) as ScriptData['presets'],
      published: (row.published ?? null) as ScriptData['published'],
      created: row.created.toISOString(),
      updated: row.updated.toISOString(),
    };
  }

  private toRow(data: ScriptData, author: string, opts: { id: string; fileId: string; shared: boolean; now: Date }): NewScriptVersionRow {
    return {
      id: opts.id,
      fileId: opts.fileId,
      author,
      name: data.name ?? null,
      description: data.description ?? null,
      details: data.details ?? null,
      tags: (data.tags ?? []) as string[],
      code: data.code,
      params: (data.params ?? null) as Record<string, unknown> | null,
      presets: (data.presets ?? null) as Record<string, unknown> | null,
      published: (data.published ?? null) as Record<string, unknown> | null,
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

  /** All shared scripts, latest version each (across authors). */
  listShared(): ScriptData[] {
    const rows = db
      .select()
      .from(scriptVersions)
      .where(eq(scriptVersions.shared, true))
      .orderBy(desc(scriptVersions.updated))
      .all();
    return this.latestPerFile(rows).map((r) => this.rowToData(r));
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

  /** Whether the file has a current shared flag (from its latest row). */
  private currentShared(author: string, fileId: string): boolean {
    const rows = this.fileRows(author, fileId);
    return rows.length > 0 ? rows[0].shared : false;
  }

  /** Create a new file (first version). `author` is server-authoritative. */
  create(author: string, payload: unknown): ScriptData {
    const data = this.normalize(payload);
    const fileId = data.fileId ?? uuid4();
    const id = data.id ?? uuid4();
    const now = new Date();
    const row = this.toRow(data, author, { id, fileId, shared: false, now });
    db.insert(scriptVersions).values(row).run();
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Append a new version to an existing file (ownership-checked). */
  saveVersion(author: string, fileId: string, payload: unknown): ScriptData {
    this.latestRow(author, fileId); // ownership gate (throws not_found)
    const data = this.normalize(payload);
    const id = uuid4();
    const now = new Date();
    const shared = this.currentShared(author, fileId); // versions inherit the file's shared state
    const row = this.toRow(data, author, { id, fileId, shared, now });
    db.insert(scriptVersions).values(row).run();
    return this.rowToData({ ...row, created: now, updated: now } as ScriptVersionRow);
  }

  /** Toggle sharing on all versions of a file (ownership-checked). */
  setShared(author: string, fileId: string, shared: boolean): void {
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
