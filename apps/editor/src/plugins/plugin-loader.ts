/**
 * plugin-loader — loads a plugin at runtime from a base URL (fetch + dynamic
 * import), the way a published plugin would be served from a static host.
 *
 * In dev the repo-root `plugins/` dir is served at /plugins/* by a Vite
 * middleware (see vite.config.ts). Nothing here is bundled at build time.
 */

import type { LoadedPlugin, PluginManifest } from './types';

/** Load a plugin directory served at `baseUrl` (no trailing slash). */
export async function loadPluginFromUrl(baseUrl: string): Promise<LoadedPlugin>
{
  const base = baseUrl.replace(/\/$/, '');

  const manifest = await fetchJson<PluginManifest>(`${base}/manifest.json`);

  if (!manifest.mainScript) throw new Error(`Plugin "${manifest.id}": no mainScript`);
  // Dynamic import of the served ESM module; @vite-ignore keeps Vite from
  // trying to resolve/transform the runtime URL at build time.
  const mainMod = await import(/* @vite-ignore */ `${base}/${manifest.mainScript}`);
  const mainCode = mainMod?.default?.code;
  if (typeof mainCode !== 'string') throw new Error(`Plugin "${manifest.id}": mainScript has no code`);

  const parts: Record<string, string> = {};
  const partPaths = [manifest.paramMenu, ...(manifest.tools ?? []).map(t => t.ui)].filter(Boolean) as string[];
  for (const p of partPaths) parts[p] = await fetchText(`${base}/${p}`);

  return { manifest, mainCode, parts };
}

/** The bundled example plugin, loaded over HTTP like any other. */
export function loadShapePicker(): Promise<LoadedPlugin>
{
  return loadPluginFromUrl('/plugins/shape-picker');
}

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
