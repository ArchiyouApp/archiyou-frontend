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

/** Persist the current script code to localStorage. */
export function saveScriptCode(code: string): void
{
  try { localStorage.setItem(SCRIPT_STORAGE_KEY, code); }
  catch { /* storage unavailable – silently ignore */ }
}

/** Load the last-saved script code, or null when nothing is stored. */
export function loadPersistedScriptCode(): string | null
{
  try { return localStorage.getItem(SCRIPT_STORAGE_KEY); }
  catch { return null; }
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

const _initialCode = loadPersistedScriptCode() ?? EDITOR_START_SCRIPT;

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
  saveScriptCode(code);
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