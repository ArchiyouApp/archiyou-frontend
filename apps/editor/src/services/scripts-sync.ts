/**
 * scripts-sync — mirrors the local script collection to apps/server when the
 * user is signed in. Anonymous users are unaffected (every export is a no-op
 * without a token), so the existing localStorage-only flow keeps working.
 *
 * Strategy (Phase 1): the server is the per-user store of record.
 *  - On sign-in / app load: `pullUserScripts()` merges the user's server
 *    scripts into the local collection.
 *  - On local mutation: `syncCreate` / `syncSaveActive` (debounced) /
 *    `syncDelete` push changes up. A fileId not yet known to the server is
 *    POSTed (create); a known one is PUT (new version).
 *
 * The core↔sync import cycle is function-level only (both sides touch each
 * other's bindings inside functions, never at module-eval time), which ESM
 * and Vite resolve without issue.
 */

import { Script } from '@archiyou/core/src/execution/Script';
import type { ScriptData } from '@archiyou/core/src/execution/types';

import { api, ApiError } from './api.js';
import { authService } from './auth-service.js';
import { scripts, bumpScripts, saveCollection } from '../state/core.js';

/** fileIds we know exist on the server (so we choose PUT vs POST correctly). */
const serverFileIds = new Set<string>();

/** Per-file debounce timers for active-script saves. */
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 900;

function authed(): boolean {
  return authService.isAuthenticated();
}

/** Pull the signed-in user's scripts and merge them into the local collection. */
export async function pullUserScripts(): Promise<void> {
  if (!authed()) return;
  let remote: ScriptData[];
  try {
    remote = await api.get<ScriptData[]>('/scripts');
  } catch (err) {
    console.warn('scripts-sync: pull failed', err);
    return;
  }

  const list = scripts.get();
  for (const data of remote) {
    if (!data.fileId) continue;
    serverFileIds.add(data.fileId);
    const script = Script.fromData(data);
    if (!script) continue;
    const idx = list.findIndex((s) => s.fileId === script.fileId);
    if (idx >= 0) list[idx] = script; // server wins for non-active twins
    else list.push(script);
  }
  bumpScripts();
  saveCollection();
}

/** Push a brand-new script to the server (POST). */
export async function syncCreate(script: Script): Promise<void> {
  if (!authed()) return;
  const data = script.toData();
  if (!data.fileId) return;
  try {
    await api.post<ScriptData>('/scripts', data);
    serverFileIds.add(data.fileId);
  } catch (err) {
    // A 409-ish "already exists" just means we should PUT instead.
    if (err instanceof ApiError && err.status === 409) {
      serverFileIds.add(data.fileId);
      await syncSaveNow(script);
    } else {
      console.warn('scripts-sync: create failed', err);
    }
  }
}

/** Debounced mirror of the active script (called on every keystroke save). */
export function syncSaveActive(script: Script): void {
  if (!authed()) return;
  const fileId = script.fileId;
  if (!fileId) return;
  const existing = saveTimers.get(fileId);
  if (existing) clearTimeout(existing);
  saveTimers.set(
    fileId,
    setTimeout(() => {
      saveTimers.delete(fileId);
      void syncSaveNow(script);
    }, SAVE_DEBOUNCE_MS),
  );
}

/** Immediate save: PUT if the file is known server-side, else POST (create). */
async function syncSaveNow(script: Script): Promise<void> {
  if (!authed()) return;
  const data = script.toData();
  const fileId = data.fileId;
  if (!fileId) return;
  try {
    if (serverFileIds.has(fileId)) {
      await api.put<ScriptData>(`/scripts/${fileId}`, data);
    } else {
      await api.post<ScriptData>('/scripts', data);
      serverFileIds.add(fileId);
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Server lost the file; recreate it.
      serverFileIds.delete(fileId);
      try { await api.post<ScriptData>('/scripts', data); serverFileIds.add(fileId); }
      catch (e) { console.warn('scripts-sync: recreate failed', e); }
    } else {
      console.warn('scripts-sync: save failed', err);
    }
  }
}

/** Delete a file server-side. */
export async function syncDelete(fileId: string): Promise<void> {
  if (!authed() || !fileId) return;
  const timer = saveTimers.get(fileId);
  if (timer) { clearTimeout(timer); saveTimers.delete(fileId); }
  try {
    await api.delete(`/scripts/${fileId}`);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      console.warn('scripts-sync: delete failed', err);
    }
  }
  serverFileIds.delete(fileId);
}

// Self-initialize: for returning users (token already in localStorage), pull
// once after the module graph has finished evaluating. Deferred via microtask
// so core's signals are fully defined before we touch them.
queueMicrotask(() => { if (authed()) void pullUserScripts(); });
