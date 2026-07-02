/**
 * plugin-loader — loads a plugin's bytes into a LoadedPlugin descriptor.
 *
 * Two sources, same output:
 *  - loadPluginFromUrl(baseUrl)      — runtime URL loading (fetch + dynamic import).
 *      In dev the repo-root `plugins/` dir is served at /plugins/* by a Vite
 *      middleware (see vite.config.ts).
 *  - loadPluginFromDirectory(handle) — the in-editor "Open plugin folder" flow,
 *      reading files straight off disk via the File System Access API. The main
 *      script is imported from a blob URL so it stays a real ESM module.
 *
 * Nothing here is bundled at build time.
 */

import type { LoadedPlugin, PluginManifest } from './types';

/** UI part paths declared by a manifest (param menu + tools). */
function partPaths(manifest: PluginManifest): string[]
{
  return [manifest.paramMenu, ...(manifest.tools ?? []).map(t => t.ui)].filter(Boolean) as string[];
}

/** `$component` script name for a manifest path (its file stem: scripts/bracket.ts → bracket). */
export function scriptStem(path: string): string
{
  return path.split('/').pop()!.replace(/\.[^.]+$/, '');
}

/** Import an ESM `export default {...}` module from source text, return its default object. */
async function importDefaultModule(source: string, id: string): Promise<Record<string, unknown>>
{
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try
  {
    const mod = await import(/* @vite-ignore */ url);
    const def = mod?.default;
    if (!def || typeof def.code !== 'string') throw new Error(`Plugin "${id}": script has no code`);
    return def as Record<string, unknown>;
  }
  finally
  {
    URL.revokeObjectURL(url);
  }
}

// ── URL source ─────────────────────────────────────────────────────────────

/** Load a plugin directory served at `baseUrl` (no trailing slash). */
export async function loadPluginFromUrl(baseUrl: string): Promise<LoadedPlugin>
{
  const base = baseUrl.replace(/\/$/, '');
  const manifest = await fetchJson<PluginManifest>(`${base}/manifest.json`);
  if (!manifest.mainScript) throw new Error(`Plugin "${manifest.id}": no mainScript`);

  const mainMod = (await import(/* @vite-ignore */ `${base}/${manifest.mainScript}`))?.default;
  if (!mainMod || typeof mainMod.code !== 'string') throw new Error(`Plugin "${manifest.id}": mainScript has no code`);

  const scriptModules: Record<string, Record<string, unknown>> = { [scriptStem(manifest.mainScript)]: mainMod };
  const scripts: Record<string, string> = {};
  for (const p of manifest.scripts ?? [])
  {
    const mod = (await import(/* @vite-ignore */ `${base}/${p}`))?.default;
    if (mod && typeof mod.code === 'string') { scripts[scriptStem(p)] = mod.code; scriptModules[scriptStem(p)] = mod; }
  }

  const parts: Record<string, string> = {};
  for (const p of partPaths(manifest)) parts[p] = await fetchText(`${base}/${p}`);

  return { manifest, mainCode: mainMod.code as string, scripts, scriptModules, parts };
}

/** The bundled example plugin, loaded over HTTP like any other. */
export function loadShapePicker(): Promise<LoadedPlugin>
{
  return loadPluginFromUrl('/plugins/shape-picker');
}

// ── Directory source (File System Access API) ──────────────────────────────

/** Load a plugin from a directory the user picked with showDirectoryPicker(). */
export async function loadPluginFromDirectory(dir: FileSystemDirectoryHandle): Promise<LoadedPlugin>
{
  const manifest = JSON.parse(await readFileText(dir, 'manifest.json')) as PluginManifest;
  if (!manifest.mainScript) throw new Error(`Plugin "${manifest.id}": no mainScript`);

  const mainMod = await importDefaultModule(await readFileText(dir, manifest.mainScript), manifest.id);

  const scriptModules: Record<string, Record<string, unknown>> = { [scriptStem(manifest.mainScript)]: mainMod };
  const scripts: Record<string, string> = {};
  for (const p of manifest.scripts ?? [])
  {
    const mod = await importDefaultModule(await readFileText(dir, p), scriptStem(p));
    scripts[scriptStem(p)] = mod.code as string;
    scriptModules[scriptStem(p)] = mod;
  }

  const parts: Record<string, string> = {};
  for (const p of partPaths(manifest)) parts[p] = await readFileText(dir, p);

  return { manifest, mainCode: mainMod.code as string, scripts, scriptModules, parts };
}

/** True when the browser supports the "Open plugin folder" flow. */
export function directoryPickerSupported(): boolean
{
  return typeof (globalThis as any).showDirectoryPicker === 'function';
}

/**
 * Newest mtime across a plugin's files (manifest + main script + parts). Used to
 * poll a picked directory for edits (the browser has no native file-watch).
 */
export async function pluginMaxMtime(dir: FileSystemDirectoryHandle, manifest: PluginManifest): Promise<number>
{
  const paths = ['manifest.json', manifest.mainScript, ...partPaths(manifest)].filter(Boolean) as string[];
  let max = 0;
  for (const p of paths)
  {
    try
    {
      const file = await (await getFileHandle(dir, p)).getFile();
      if (file.lastModified > max) max = file.lastModified;
    }
    catch { /* file may be missing mid-edit; ignore */ }
  }
  return max;
}

/** Resolve a `/`-separated path to a FileSystemFileHandle relative to a directory. */
async function getFileHandle(dir: FileSystemDirectoryHandle, relPath: string, create = false): Promise<FileSystemFileHandle>
{
  const segments = relPath.split('/').filter(Boolean);
  let handle: FileSystemDirectoryHandle = dir;
  for (let i = 0; i < segments.length - 1; i++)
  {
    handle = await handle.getDirectoryHandle(segments[i]!, { create });
  }
  return handle.getFileHandle(segments[segments.length - 1]!, { create });
}

/** Request read-write access to a directory handle (returns true if granted). */
export async function requestWritePermission(dir: FileSystemDirectoryHandle): Promise<boolean>
{
  const opts = { mode: 'readwrite' as const };
  const anyDir = dir as any;
  if ((await anyDir.queryPermission?.(opts)) === 'granted') return true;
  return (await anyDir.requestPermission?.(opts)) === 'granted';
}

/** Write text to a file at a `/`-separated path relative to a directory handle. */
export async function writeFileText(dir: FileSystemDirectoryHandle, relPath: string, content: string): Promise<void>
{
  const fileHandle = await getFileHandle(dir, relPath, true);
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();
}

/** Read a file at a `/`-separated path relative to a directory handle. */
async function readFileText(dir: FileSystemDirectoryHandle, relPath: string): Promise<string>
{
  return (await (await getFileHandle(dir, relPath)).getFile()).text();
}

// ── fetch helpers ──────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T>
{
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string>
{
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}
