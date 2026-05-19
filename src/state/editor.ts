/**
 * state/editor.ts — editor-only state.
 *
 * UI state for the editor (scene tree, hidden nodes, bottom panel,
 * file-manager, script metadata, param/preset menu collapse) PLUS the param +
 * preset *authoring* API. Param definitions live on the core active `Script`
 * (`script.params` / `script.presets`, canonical model). Mutators translate the
 * param-menu's flat spec into canonical `ScriptParam` (schema-driven) and bump
 * the core script signal so `SignalWatcher` components re-render.
 */

import { signal, computed } from '@lit-labs/signals';

import { ScriptParam } from '../../devlibs/archiyou-core-next/src/execution/ScriptParam';
import type { ScriptParamType, ScriptParamData } from '../../devlibs/archiyou-core-next/src/execution/types';

import { editorScript, bumpScript, saveCore } from './core';
import type { ScriptMetadata, ScriptPreset } from './types';

//// EDITOR UI SIGNALS ////

export const sceneTree         = signal<import('./types').SceneNodeData | null>(null);
export const hiddenNodes       = signal<ReadonlySet<string>>(new Set<string>());
export const activeBottomPanel = signal<'console' | 'scene' | 'none'>('console');
export const fileManagerCollapsed = signal<boolean>(true);
export const paramMenuCollapsed   = signal<boolean>(false);
export const presetMenuCollapsed  = signal<boolean>(true);

export const scriptMetadata = signal<ScriptMetadata>({
  projectName: '',
  version: '',
  description: '',
  projectDetails: '',
  categories: [],
});

//// EDITOR UI MUTATORS ////

export function setSceneTree(tree: import('./types').SceneNodeData | null): void
{
  sceneTree.set(tree);
}

export function toggleNodeVisibility(uuid: string): void
{
  const next = new Set(hiddenNodes.get());
  if (next.has(uuid)) next.delete(uuid);
  else next.add(uuid);
  hiddenNodes.set(next);
}

export function clearSceneState(): void
{
  sceneTree.set(null);
  hiddenNodes.set(new Set<string>());
}

export function setActiveBottomPanel(panel: 'console' | 'scene' | 'none'): void
{
  activeBottomPanel.set(panel);
}

export function setFileManagerCollapsed(collapsed: boolean): void
{
  fileManagerCollapsed.set(collapsed);
}

export function setParamMenuCollapsed(collapsed: boolean): void
{
  paramMenuCollapsed.set(collapsed);
}

export function setPresetMenuCollapsed(collapsed: boolean): void
{
  presetMenuCollapsed.set(collapsed);
}

export function updateScriptMetadata(_scriptId: string, metadata: ScriptMetadata): void
{
  scriptMetadata.set(metadata);
}

/** Convert a param name to a safe JS variable name (lowercase, underscores). */
export function toVariableName(name: string): string
{
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

//// PARAMS (authored on core.script.params) ////

/**
 * Reactive, ordered view of the active script's params.
 * Replaces the old standalone `scriptParams` signal — same `.get()` API.
 */
export const scriptParams = computed<ScriptParam[]>(() =>
{
  const s = editorScript.get();
  if (!s) return [];
  return Object.values(s.params).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

/** Flat spec used by param-menu / param-define-menu (legacy field names). */
export interface ParamSpec
{
  id?: string;
  name?: string;
  type?: ScriptParamType;
  group?: string;
  order?: number;
  units?: string;
  defaultValue?: any;
  value?: any;
  // number
  min?: number;
  max?: number;
  step?: number;
  // text
  minLength?: number;
  maxLength?: number;
  // options
  options?: string[];
  // list
  listItemType?: 'string' | 'number' | 'boolean';
}

/** Apply a flat spec onto a canonical ScriptParam (schema-driven). */
function _applySpec(p: ScriptParam, spec: ParamSpec): void
{
  const schema = p.schema as any;

  if (spec.name  !== undefined) p.name  = spec.name;
  if (spec.group !== undefined) p.group = spec.group;
  if (spec.order !== undefined) p.order = spec.order;
  if (spec.units !== undefined) p.units = spec.units as any;

  if (spec.defaultValue !== undefined)
  {
    p.default      = spec.defaultValue;
    schema.default = spec.defaultValue;
  }
  if (spec.value !== undefined) p._value = spec.value;

  if (spec.min        !== undefined) schema.minimum    = spec.min;
  if (spec.max        !== undefined) schema.maximum    = spec.max;
  if (spec.step       !== undefined) schema.multipleOf = spec.step;
  if (spec.minLength  !== undefined) schema.minLength  = spec.minLength;
  if (spec.maxLength  !== undefined) schema.maxLength  = spec.maxLength;
  if (spec.options    !== undefined) schema.enum       = spec.options;
  if (spec.listItemType !== undefined) schema.items    = { type: spec.listItemType };

  p.iterable = p.isIterable();
}

/** Find a param (and its current key) in the active script by id. */
function _findById(id: string): { key: string; param: ScriptParam } | null
{
  const s = editorScript.get();
  if (!s) return null;
  for (const [key, param] of Object.entries(s.params))
    if (param.id === id) return { key, param };
  return null;
}

/** Add a new param to the active script. */
export function addParam(spec: ParamSpec): void
{
  const s = editorScript.get();
  if (!s) return;

  const p = ScriptParam.fromType((spec.type ?? 'number') as ScriptParamType);
  p.id = spec.id ?? crypto.randomUUID();
  p.name = spec.name ?? p.name;
  p.group = spec.group ?? 'main';
  p.order = spec.order ?? Object.keys(s.params).length;
  _applySpec(p, spec);

  s.params[p.name] = p;
  bumpScript();
  saveCore();
}

/** Update an existing param by id (re-keys the script.params map if renamed). */
export function updateParam(id: string, updates: ParamSpec): void
{
  const found = _findById(id);
  const s = editorScript.get();
  if (!found || !s) return;

  let { key, param } = found;

  // type change → rebuild from the new type, preserving identity fields
  if (updates.type && updates.type !== param.type)
  {
    const next = ScriptParam.fromType(updates.type);
    next.id = param.id;
    next.name = param.name;
    next.group = param.group;
    next.order = param.order;
    param = next;
  }

  _applySpec(param, updates);

  delete s.params[key];
  s.params[param.name] = param;
  bumpScript();
  saveCore();
}

/** Add a new param directly from a canonical ScriptParamData (schema-driven). */
export function addParamDirect(data: ScriptParamData): void
{
  const s = editorScript.get();
  if (!s) return;

  const p = ScriptParam.fromData(data);
  p.id    = data.id    ?? crypto.randomUUID();
  p.order = data.order ?? Object.keys(s.params).length;
  s.params[p.name] = p;
  bumpScript();
  saveCore();
}

/** Update an existing param directly from canonical ScriptParamData.
 *  Re-keys script.params if the name changed. */
export function updateParamDirect(id: string, data: ScriptParamData): void
{
  const found = _findById(id);
  const s = editorScript.get();
  if (!found || !s) return;

  const { key } = found;
  const p = ScriptParam.fromData({ ...data, id });
  p.order = found.param.order;

  delete s.params[key];
  s.params[p.name] = p;
  bumpScript();
  saveCore();
}

export function deleteParam(id: string): void
{
  const found = _findById(id);
  const s = editorScript.get();
  if (!found || !s) return;
  delete s.params[found.key];
  bumpScript();
  saveCore();
}

/** Re-order params within a group according to the supplied ordered id list. */
export function reorderParams(_group: string, orderedIds: string[]): void
{
  orderedIds.forEach((id, idx) =>
  {
    const found = _findById(id);
    if (found) found.param.order = idx;
  });
  bumpScript();
  saveCore();
}

export function renameParamGroup(oldName: string, newName: string): void
{
  const s = editorScript.get();
  if (!s) return;
  for (const p of Object.values(s.params))
    if (p.group === oldName) p.group = newName;
  bumpScript();
  saveCore();
}

export function swapParamGroups(groupA: string, groupB: string): void
{
  const s = editorScript.get();
  if (!s) return;
  for (const p of Object.values(s.params))
  {
    if (p.group === groupA) p.group = groupB;
    else if (p.group === groupB) p.group = groupA;
  }
  bumpScript();
  saveCore();
}

//// PRESETS (stored on core.script.presets) ////

/** Reactive view of presets in the legacy `{ name, values }` shape. */
export const scriptPresets = computed<ScriptPreset[]>(() =>
{
  const s = editorScript.get();
  if (!s) return [];
  return Object.entries(s.presets).map(([name, paramRec]) => ({
    name,
    values: Object.fromEntries(
      Object.entries(paramRec).map(([pname, pdata]) =>
        [pname, (pdata as ScriptParamData)._value ?? (pdata as ScriptParamData).default]),
    ),
  }));
});

export function saveAsPreset(name: string): void
{
  const s = editorScript.get();
  if (!s) return;
  s.presets[name] = Object.fromEntries(
    Object.values(s.params).map(p => [p.name, p.toData()]),
  );
  bumpScript();
  saveCore();
}

export function deletePreset(name: string): void
{
  const s = editorScript.get();
  if (!s) return;
  delete s.presets[name];
  bumpScript();
  saveCore();
}

export function renamePreset(oldName: string, newName: string): void
{
  const s = editorScript.get();
  if (!s || !(oldName in s.presets)) return;
  s.presets[newName] = s.presets[oldName];
  delete s.presets[oldName];
  bumpScript();
  saveCore();
}

export function activatePreset(name: string): void
{
  const s = editorScript.get();
  if (!s) return;
  const preset = s.presets[name];
  if (!preset) return;
  for (const [pname, pdata] of Object.entries(preset))
  {
    const target = s.params[pname];
    if (target) target._value = (pdata as ScriptParamData)._value ?? (pdata as ScriptParamData).default;
  }
  bumpScript();
  saveCore();
}
