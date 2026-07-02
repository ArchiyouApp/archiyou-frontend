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

/** Import an ESM `export default { code }` module from source text, return its code. */
async function importDefaultCode(source: string, id: string): Promise<string>
{
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try
  {
    const mod = await import(/* @vite-ignore */ url);
    const code = mod?.default?.code;
    if (typeof code !== 'string') throw new Error(`Plugin "${id}": mainScript has no code`);
    return code;
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

  const mainMod = await import(/* @vite-ignore */ `${base}/${manifest.mainScript}`);
  const mainCode = mainMod?.default?.code;
  if (typeof mainCode !== 'string') throw new Error(`Plugin "${manifest.id}": mainScript has no code`);

  const parts: Record<string, string> = {};
  for (const p of partPaths(manifest)) parts[p] = await fetchText(`${base}/${p}`);

  return { manifest, mainCode, parts };
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

  const mainCode = await importDefaultCode(await readFileText(dir, manifest.mainScript), manifest.id);

  const parts: Record<string, string> = {};
  for (const p of partPaths(manifest)) parts[p] = await readFileText(dir, p);

  return { manifest, mainCode, parts };
}

/** True when the browser supports the "Open plugin folder" flow. */
export function directoryPickerSupported(): boolean
{
  return typeof (globalThis as any).showDirectoryPicker === 'function';
}

/** Read a file at a `/`-separated path relative to a directory handle. */
async function readFileText(dir: FileSystemDirectoryHandle, relPath: string): Promise<string>
{
  const segments = relPath.split('/').filter(Boolean);
  let handle: FileSystemDirectoryHandle = dir;
  for (let i = 0; i < segments.length - 1; i++)
  {
    handle = await handle.getDirectoryHandle(segments[i]!);
  }
  const fileHandle = await handle.getFileHandle(segments[segments.length - 1]!);
  return (await fileHandle.getFile()).text();
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
