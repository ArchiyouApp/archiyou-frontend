/**
 * Central workspace state using @lit-labs/signals.
 *
 * The workspace is a flat model: a list of scripts, plus which is selected.
 * Components read from signals and mutate via the exported functions.
 */

import { signal, computed } from '@lit-labs/signals';

// ── Scene tree ────────────────────────────────────────────────────────────────

export interface SceneMaterialData
{
  color?: string;       // '#rrggbb'
  opacity: number;
  transparent: boolean;
  wireframe?: boolean;
}

export interface SceneNodeData
{
  uuid: string;
  name: string;
  type: string;         // THREE object type string: 'Mesh', 'Group', 'LineSegments2', …
  visible: boolean;
  children: SceneNodeData[];
  material?: SceneMaterialData;
}

import { Script } from '../../devlibs/archiyou-core-next/src/execution/Script';
import type { RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

//// LOAD SETTINGS ////

import { EDITOR_START_SCRIPT } from '../settings';

//// LOCAL STORAGE ////

const SCRIPT_STORAGE_KEY = 'archiyou:editor:script';

/** Load the full persisted workspace state (code + UI params) from localStorage. */
function _loadPersistedWorkspaceState(): { code: string; params: ScriptParam[] } | null
{
  try
  {
    const raw = localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Legacy format: plain code string stored before params were added
    if (typeof data === 'string') return { code: data, params: [] };
    return { code: data.code ?? '', params: data.params ?? [] };
  }
  catch { return null; }
}

/** Persist the full workspace state (code + UI params) to localStorage. */
function saveWorkspaceState(): void
{
  try
  {
    localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify({
      code:   editorState.get().script?.code ?? '',
      params: scriptParams.get(),
    }));
  }
  catch { /* storage unavailable – silently ignore */ }
}

//// STATE ////

export interface UserState
{
  anonymous: boolean;
  name: string | null;
  // TODO: more + typing
}

export interface EditorState
{
  executing: boolean;            // whether a script is currently executing
  script: Script | null;         // current script
  scriptVersions: [];            // TODO: for future versioning support
  result: RunnerScriptExecutionResult | null;
}

export interface WorkspaceState
{
  user: UserState;
  editor: EditorState;
}

//// SIGNALS ////

export const sceneTree = signal<SceneNodeData | null>(null);
export const hiddenNodes = signal<ReadonlySet<string>>(new Set<string>());
export const activeBottomPanel = signal<'console' | 'scene' | 'none'>('console');

export const userState = signal<UserState>({
  anonymous: true,
  name: null,
});

const _persistedState = _loadPersistedWorkspaceState();
const _initialCode    = _persistedState?.code   ?? EDITOR_START_SCRIPT;
const _initialParams  = _persistedState?.params ?? [];

export const editorState = signal<EditorState>({
  executing: false,
  script: new Script('anonymous', 'Untitled', _initialCode),
  scriptVersions: [],
  result: null,
});

/** Combined view — use when you need the full workspace shape. */
export const workspace = computed<WorkspaceState>(() => ({
  user: userState.get(),
  editor: editorState.get(),
}));

//// MUTATIONS ////

/** Add a new empty script and select it. Returns the new script. */
export function createScript(name: string = 'Untitled'): Script
{
  const script = new Script(undefined, name);
  editorState.set({ ...editorState.get(), script });
  return script;
}

/** Update the code of the current script and persist it to localStorage. */
export function updateScriptCode(code: string): void
{
  const script = editorState.get().script;
  if (!script) return;
  script.code = code;
  script.updated = new Date();
  saveWorkspaceState();
  editorState.set({ ...editorState.get() }); // shallow copy triggers reactivity
}

/** Store the result of the latest execution. */
export function setExecutionResult(result: RunnerScriptExecutionResult): void
{
  console.log('**** WORKSPACE: New execution result:', result);
  editorState.set({ ...editorState.get(), result });
}

export function setExecuting(executing: boolean): void
{
  editorState.set({ ...editorState.get(), executing });
}

export function setSceneTree(tree: SceneNodeData | null): void
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

// ── Script Metadata ───────────────────────────────────────────────────────────

export interface ScriptMetadata
{
  projectName: string;
  version: string;
  projectDetails: string;
  categories: string[];
}

export const scriptMetadata = signal<ScriptMetadata>({
  projectName: '',
  version: '',
  projectDetails: '',
  categories: [],
});

/** The currently active script (mirrors editorState.script). */
export const selectedScript = computed(() => editorState.get().script);

export function updateScriptMetadata(_scriptId: string, metadata: ScriptMetadata): void
{
  scriptMetadata.set(metadata);
}

// ── Params ───────────────────────────────────────────────────────────────────

export interface ScriptParam
{
  id: string;
  name: string;
  type: string;        // e.g. 'number'
  group: string;       // tab group name, default 'main'
  order: number;
  defaultValue?: any;  // schema / definition default — set in param-define-menu only
  value?: any;          // current interactive value — set by the param-item widgets
  // number
  min?: number;
  max?: number;
  step?: number;
  units?: string;      // e.g. 'mm', 'cm', 'm'
  // text
  minLength?: number;
  maxLength?: number;
  // options
  options?: string[];
  // list
  listItemType?: 'string' | 'number' | 'boolean';
}

/** Detail payload for the 'param-value-change' custom event. */
export interface ParamValueChangeDetail
{
  id:       string;
  value?:   any;
  units?:   string;
  options?: string[];
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

export const scriptParams     = signal<ScriptParam[]>(_initialParams);
export const paramMenuCollapsed = signal<boolean>(false);

export function setParamMenuCollapsed(collapsed: boolean): void
{
  paramMenuCollapsed.set(collapsed);
}

// ── Presets ──────────────────────────────────────────────────────────────────

export interface ScriptPreset
{
  name: string;
  values: Record<string, any>; // param id → current value
}

export const scriptPresets       = signal<ScriptPreset[]>([]);
export const presetMenuCollapsed = signal<boolean>(true);

export function setPresetMenuCollapsed(collapsed: boolean): void
{
  presetMenuCollapsed.set(collapsed);
}

export function saveAsPreset(name: string): void
{
  const values: Record<string, any> = {};
  for (const p of scriptParams.get()) values[p.id] = p.defaultValue;

  const existing = scriptPresets.get();
  const idx = existing.findIndex(pr => pr.name === name);
  if (idx >= 0)
    scriptPresets.set(existing.map((pr, i) => i === idx ? { name, values } : pr));
  else
    scriptPresets.set([...existing, { name, values }]);
}

export function deletePreset(name: string): void
{
  scriptPresets.set(scriptPresets.get().filter(pr => pr.name !== name));
}

export function renamePreset(oldName: string, newName: string): void
{
  scriptPresets.set(
    scriptPresets.get().map(pr => pr.name === oldName ? { ...pr, name: newName } : pr)
  );
}

export function activatePreset(name: string): void
{
  const preset = scriptPresets.get().find(pr => pr.name === name);
  if (!preset) return;
  for (const [id, value] of Object.entries(preset.values)) updateParam(id, { value });
}

export function addParam(param: ScriptParam): void
{
  const next = [...scriptParams.get(), param];
  scriptParams.set(next);
  saveWorkspaceState();
}

export function updateParam(id: string, updates: Partial<ScriptParam>): void
{
  const next = scriptParams.get().map(p => p.id === id ? { ...p, ...updates } : p);
  scriptParams.set(next);
  saveWorkspaceState();
}

export function deleteParam(id: string): void
{
  const next = scriptParams.get().filter(p => p.id !== id);
  scriptParams.set(next);
  saveWorkspaceState();
}

/** Re-order params within a group according to the supplied ordered id list. */
export function reorderParams(group: string, orderedIds: string[]): void
{
  const outside = scriptParams.get().filter(p => p.group !== group);
  const inside  = orderedIds
    .map((id, idx) =>
    {
      const p = scriptParams.get().find(q => q.id === id);
      return p ? { ...p, order: idx } : null;
    })
    .filter((p): p is ScriptParam => p !== null);
  const next = [...outside, ...inside];
  scriptParams.set(next);
  saveWorkspaceState();
}

/** Rename all params in `oldName` group to `newName`. */
export function renameParamGroup(oldName: string, newName: string): void
{
  const next = scriptParams.get().map(p => p.group === oldName ? { ...p, group: newName } : p);
  scriptParams.set(next);
  saveWorkspaceState();
}

/** Swap the group names of two groups (for tab drag-reorder). */
export function swapParamGroups(groupA: string, groupB: string): void
{
  const next = scriptParams.get().map(p =>
  {
    if (p.group === groupA) return { ...p, group: groupB };
    if (p.group === groupB) return { ...p, group: groupA };
    return p;
  });
  scriptParams.set(next);
  saveWorkspaceState();
}