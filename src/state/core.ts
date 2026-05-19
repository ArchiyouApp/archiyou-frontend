/**
 * state/core.ts — the core workspace state.
 *
 * Everything every page/component needs: the user, the active script, all
 * latest scripts, and execution status (executing + result). Param definitions
 * and presets live ON the active `Script` (canonical model); the editor authors
 * them (see editor.ts) and the configurator derives from them.
 */

import { signal, computed } from '@lit-labs/signals';

import { Script } from '../../devlibs/archiyou-core-next/src/execution/Script';
import type { RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

import { EDITOR_START_SCRIPT } from '../settings';
import type { UserState, WorkspaceCoreState } from './types';

//// LOCAL STORAGE ////

const SCRIPT_STORAGE_KEY = 'archiyou:editor:script';

/** Load the persisted active script from localStorage (handles legacy shapes). */
function _loadPersistedScript(): Script
{
  const fresh = () => new Script('anonymous', 'Untitled', EDITOR_START_SCRIPT);

  try
  {
    const raw = localStorage.getItem(SCRIPT_STORAGE_KEY);
    if (!raw) return fresh();

    const data = JSON.parse(raw);

    // Legacy: plain code string
    if (typeof data === 'string') return new Script('anonymous', 'Untitled', data);

    // Legacy: { code, params: [...] } — old flat params are incompatible, drop them
    if (Array.isArray(data.params))
      return new Script('anonymous', 'Untitled', data.code ?? EDITOR_START_SCRIPT);

    // Canonical ScriptData
    const loaded = new Script().fromData(data);
    return (loaded instanceof Script) ? loaded : fresh();
  }
  catch { return fresh(); }
}

/** Persist the active script (code + canonical params + presets) to localStorage. */
export function saveCore(): void
{
  try
  {
    const script = editorScript.get();
    if (!script) return;
    localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(script.toData()));
  }
  catch { /* storage unavailable – silently ignore */ }
}

//// SIGNALS ////

export const userState = signal<UserState>({
  anonymous: true,
  name: null,
});

export const editorScript     = signal<Script | null>(_loadPersistedScript());
export const scripts          = signal<Script[]>([]);   // all latest scripts (populated later)
export const executing        = signal<boolean>(false);
export const executionResult  = signal<RunnerScriptExecutionResult | null>(null);

/** Combined view — use when you need the full core shape. */
export const core = computed<WorkspaceCoreState>(() => ({
  user:      userState.get(),
  script:    editorScript.get(),
  scripts:   scripts.get(),
  executing: executing.get(),
  result:    executionResult.get(),
}));

/** The currently active script. */
export const selectedScript = computed(() => editorScript.get());

//// MUTATIONS ////

/** Trigger reactivity after mutating the active script in place. */
export function bumpScript(): void
{
  editorScript.set(editorScript.get());
}

/** Create a new empty script and select it. Returns the new script. */
export function createScript(name: string = 'Untitled'): Script
{
  const script = new Script(undefined, name);
  editorScript.set(script);
  saveCore();
  return script;
}

/** Replace the active script. */
export function setScript(script: Script | null): void
{
  editorScript.set(script);
  saveCore();
}

/** Update the code of the active script and persist it. */
export function updateScriptCode(code: string): void
{
  const script = editorScript.get();
  if (!script) return;
  script.code = code;
  script.updated = new Date();
  saveCore();
  editorScript.set(script);
}

/** Update the name of the active script. */
export function updateScriptName(name: string): void
{
  const script = editorScript.get();
  if (!script) return;
  script.name = name.toLowerCase();
  saveCore();
  editorScript.set(script);
}

/** Persist editor metadata onto the active Script (canonical model) and save. */
export function updateScriptMeta(
  meta: { description?: string; details?: string; tags?: string[] },
): void
{
  const script = editorScript.get();
  if (!script) return;
  if (meta.description !== undefined) script.description = meta.description;
  if (meta.details !== undefined)     script.details     = meta.details;
  if (meta.tags !== undefined)        script.tags        = [...meta.tags];
  script.updated = new Date();
  saveCore();
  editorScript.set(script);
}

/** Store the result of the latest execution. */
export function setExecutionResult(result: RunnerScriptExecutionResult): void
{
  executionResult.set(result);
}

export function setExecuting(value: boolean): void
{
  executing.set(value);
}

/** Set the list of all latest scripts. */
export function setScripts(list: Script[]): void
{
  scripts.set(list);
}
