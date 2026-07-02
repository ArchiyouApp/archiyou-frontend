/// <reference types="vite/client" />
/**
 * example-plugins — assembles LoadedPlugin descriptors for the bundled example
 * plugin(s) that live at the repo root `plugins/`.
 *
 * For this slice the bytes are pulled in via Vite (glob + `?raw`) so the plugin
 * stays single-source at `plugins/shape-picker/`. The `import.meta.glob` for the
 * main script keeps tsc from resolving the out-of-src `.ts` file (Vite compiles
 * it); swap this loader for runtime `fetch(url)` when the network loader lands.
 */

import type { LoadedPlugin, PluginManifest } from './types';

import manifestRaw from '../../../../plugins/shape-picker/manifest.json?raw';
import paramMenuHtml from '../../../../plugins/shape-picker/ui/param-menu.html?raw';

const mainMods = import.meta.glob(
  '../../../../plugins/shape-picker/scripts/main.ts',
  { eager: true, import: 'default' },
) as Record<string, { code: string }>;

export function loadShapePicker(): LoadedPlugin
{
  const manifest = JSON.parse(manifestRaw) as PluginManifest;
  const main = Object.values(mainMods)[0];
  if (!main?.code) throw new Error('shape-picker: could not load scripts/main.ts');

  return {
    manifest,
    mainCode: main.code,
    parts: { [manifest.paramMenu as string]: paramMenuHtml },
  };
}
