/**
 * ModuleHost — the installed set of gated script modules on this instance.
 *
 * Modules are built and distributed OUTSIDE this repository (see docs/modules.md)
 * and deployed into SERVER_MODULES_DIR as:
 *
 *   <dir>/<id>/manifest.json
 *   <dir>/<id>/bundle.js     (runtime: 'client' — served to entitled browsers)
 *   <dir>/<id>/server.js     (runtime: 'server' — never leaves this machine)
 *
 * The runtime artifact is also accepted at `<id>/dist/<name>.js`, which is where
 * a module's own build puts it. That means SERVER_MODULES_DIR can point straight
 * at the development overlay (`./modules`) and there is no copy step at all while
 * working on a module — see modules/README.md.
 *
 * Scanned at boot, and re-scanned on change when config.modules.dev is on.
 * **With SERVER_MODULES_DIR unset the host is inert** — list() is empty, GET
 * /modules returns [], and the server behaves exactly as it does without this
 * feature. That is what keeps a plain checkout of this repository fully
 * functional.
 */

import { readdirSync, readFileSync, statSync, existsSync, watch, type FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';

import type { AyModuleCatalogEntry } from '@archiyou/module-sdk';

import { config } from '../config';
import { parse, ValidationError } from '../validate';
import { grantsAllModules } from './entitlements';
import { ModuleManifestSchema, type ModuleManifest } from './manifestSchema';
import { moduleWorkerPool, ModuleCallError } from './ModuleWorkerPool';

interface InstalledModule {
  manifest: ModuleManifest;
  /** Absolute path to the module's directory. */
  dir: string;
  /** Absolute path to the runtime artifact (bundle.js or server.js). */
  entry: string;
  /** Content fingerprint of the artifact + manifest. Changes on every rebuild,
   *  which is what lets a caller distinguish "rebuilt" from "same version". */
  rev: string;
}

/**
 * A short fingerprint of a module's built output.
 *
 * Deliberately mtime+size rather than a content hash: it is one stat() per file
 * on a path that runs per request, and the only question being asked is "is this
 * the same build as last time" — for which a rebuild always changes at least the
 * mtime. A hash would cost a full read of a multi-megabyte bundle to answer the
 * same question.
 */
function revisionOf(entryPath: string, manifestPath: string): string {
  let acc = '';
  for (const p of [entryPath, manifestPath]) {
    try {
      const s = statSync(p);
      acc += `${Math.round(s.mtimeMs)}-${s.size}.`;
    } catch {
      acc += 'x.';
    }
  }
  // Base36 keeps it short enough to sit in a URL without being noise.
  let h = 0;
  for (let i = 0; i < acc.length; i++) h = (Math.imul(31, h) + acc.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Files whose change means a module changed. Everything else under a module
 *  directory — node_modules churn, source files, editor temp files — is ignored,
 *  or a single `pnpm install` would trigger hundreds of re-scans. */
const WATCHED_NAMES = new Set(['manifest.json', 'bundle.js', 'server.js']);

export class ModuleHost {
  private _modules = new Map<string, InstalledModule>();
  private _loaded = false;
  private _root = '';
  private _watcher: FSWatcher | null = null;
  private _debounce: NodeJS.Timeout | null = null;
  private _listeners = new Set<() => void>();

  /** Scan the modules directory. Safe to call repeatedly; re-scans. */
  load(dir: string = config.modules.dir): this {
    this._modules.clear();
    this._loaded = true;
    this._root = dir ? resolve(dir) : '';

    if (!dir) return this; // feature off — the default
    const root = this._root;

    if (!existsSync(root)) {
      console.warn(`⚠ SERVER_MODULES_DIR is set but does not exist: ${root}`);
      return this;
    }

    for (const name of readdirSync(root)) {
      const moduleDir = join(root, name);
      try {
        if (!statSync(moduleDir).isDirectory()) continue;
      } catch {
        continue;
      }

      const manifestPath = join(moduleDir, 'manifest.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = parse(ModuleManifestSchema, JSON.parse(readFileSync(manifestPath, 'utf-8')));

        // The directory name is what the deployment controls; the id is what
        // every URL and entitlement uses. Letting them differ would make
        // "which module is this?" ambiguous.
        if (manifest.id !== name) {
          console.warn(`⚠ module '${manifest.id}' skipped: manifest id does not match its directory '${name}'`);
          continue;
        }
        if (this._modules.has(manifest.id)) {
          console.warn(`⚠ module '${manifest.id}' skipped: duplicate id`);
          continue;
        }

        const entryName = manifest.runtime === 'client' ? 'bundle.js' : 'server.js';
        // Deployed layout first, then the in-place build output — so the same
        // code serves a real deployment and a developer's working tree.
        const entry = [join(moduleDir, entryName), join(moduleDir, 'dist', entryName)]
          .find((p) => existsSync(p));
        if (!entry) {
          console.warn(`⚠ module '${manifest.id}' skipped: ${entryName} is missing (looked in ./ and ./dist)`);
          continue;
        }

        this._modules.set(manifest.id, {
          manifest,
          dir: moduleDir,
          entry,
          rev: revisionOf(entry, manifestPath),
        });
      } catch (err) {
        // A bad manifest must not stop the server from booting; it is reported
        // and skipped, exactly like a bad request body would be rejected.
        const detail = err instanceof ValidationError ? err.issues.join('; ') : (err as Error)?.message;
        console.warn(`⚠ module '${name}' skipped: invalid manifest (${detail})`);
      }
    }

    if (this._modules.size > 0) {
      const names = [...this._modules.values()].map((m) => `${m.manifest.id}@${m.manifest.version}`);
      console.log(`🧩 Loaded ${this._modules.size} script module(s): ${names.join(', ')}`);
    }
    return this;
  }

  /** True when at least one module is installed. */
  get enabled(): boolean {
    return this._modules.size > 0;
  }

  /** Every installed manifest. Lazily scans on first use. */
  list(): ModuleManifest[] {
    if (!this._loaded) this.load();
    return [...this._modules.values()].map((m) => m.manifest);
  }

  get(id: string): ModuleManifest | undefined {
    if (!this._loaded) this.load();
    return this._modules.get(id)?.manifest;
  }

  /**
   * The catalog as the given user sees it: every installed module, each marked
   * entitled or not.
   *
   * Locked modules are INCLUDED on purpose. The editor uses this to show what
   * exists and offer an upgrade path, and the runner uses it to turn a script's
   * use of a locked module into "not available on your account" instead of
   * "undefined is not a function".
   *
   * The wildcard entitlement (`'*'`, see UserService.ALL_MODULES) marks every
   * installed module entitled, so a module deployed after the grant is usable
   * without touching the account.
   */
  catalogFor(entitledIds: string[]): AyModuleCatalogEntry[] {
    if (!this._loaded) this.load();
    const all = grantsAllModules(entitledIds);
    const owned = new Set(entitledIds);
    return [...this._modules.values()].map((m) => ({
      ...m.manifest,
      entitled: all || owned.has(m.manifest.id),
      // Only in dev. In production a version bump is the cache key, and shipping
      // a per-build revision would defeat the immutable caching of bundles.
      ...(config.modules.dev ? { rev: m.rev } : {}),
    }));
  }

  /** Current content revision of a module, or undefined if unknown. */
  revision(id: string): string | undefined {
    if (!this._loaded) this.load();
    return this._modules.get(id)?.rev;
  }

  //// DEV WATCHING ////

  /**
   * Re-scan whenever a module's manifest or built artifact changes, so editing a
   * module never needs a server restart.
   *
   * Best-effort: recursive fs.watch is not available on every platform, and a
   * failure here only costs the developer a restart, so it must never prevent
   * the server from starting.
   */
  watch(): this {
    if (this._watcher || !this._root || !existsSync(this._root)) return this;

    try {
      this._watcher = watch(this._root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const name = String(filename).replace(/\\/g, '/').split('/').pop() ?? '';
        if (!WATCHED_NAMES.has(name)) return;

        // A build writes several files in quick succession; re-scanning on each
        // would serve a half-written module to whoever asked in between.
        if (this._debounce) clearTimeout(this._debounce);
        this._debounce = setTimeout(() => {
          this._debounce = null;
          const before = this.list().map((m) => `${m.id}@${m.version}`).join(',');
          this.load(this._root);
          const after = this.list().map((m) => `${m.id}@${m.version}`).join(',');
          console.log(`🧩 modules changed — re-scanned${before !== after ? ` (${after || 'none'})` : ''}`);
          this._listeners.forEach((fn) => { try { fn(); } catch { /* never let a listener break the watcher */ } });
        }, 150);
      });
      console.log(`👀 Watching script modules in ${this._root}`);
    } catch (err) {
      console.warn(`⚠ could not watch ${this._root} (${(err as Error)?.message}) — module changes need a restart`);
    }
    return this;
  }

  /** Subscribe to re-scans. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Stop watching. Called on server shutdown. */
  close(): void {
    if (this._debounce) { clearTimeout(this._debounce); this._debounce = null; }
    this._watcher?.close();
    this._watcher = null;
    this._listeners.clear();
  }

  /**
   * Absolute path of a client module's bundle, or null.
   *
   * Resolved from the in-memory map keyed by validated ids, NEVER by joining a
   * request-supplied id onto a path — that is what keeps `../` out of it. The
   * version must match too, so a stale cached URL cannot serve a new bundle.
   */
  bundlePath(id: string, version: string): string | null {
    if (!this._loaded) this.load();
    const found = this._modules.get(id);
    if (!found) return null;
    if (found.manifest.runtime !== 'client') return null;
    if (found.manifest.version !== version) return null;
    return found.entry;
  }

  /** Invoke a server module's method in a worker thread. */
  async call(id: string, method: string, args: unknown): Promise<unknown> {
    if (!this._loaded) this.load();
    const found = this._modules.get(id);
    if (!found) throw new ModuleCallError('failed', `unknown module '${id}'`);
    if (found.manifest.runtime !== 'server') {
      throw new ModuleCallError('failed', `module '${id}' is a client module and cannot be called`);
    }
    return moduleWorkerPool.call(found.entry, method, args, id);
  }
}

export const moduleHost = new ModuleHost();
