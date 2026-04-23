/**
 * Central workspace state using @lit-labs/signals.
 *
 * The workspace is a flat model: a list of scripts, plus which is selected.
 * Components read from signals and mutate via the exported functions.
 */

import { signal, computed } from '@lit-labs/signals';

import { Script } from '../../devlibs/archiyou-core-next/src/execution/Script';
import type { RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

//// LOAD SETTINGS ////
import { EDITOR_START_SCRIPT } from '../settings';

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

export const userState = signal<UserState>({
  anonymous: true,
  name: null,
});

export const editorState = signal<EditorState>({
  executing: false,
  script: new Script('anonymous', 'Untitled', EDITOR_START_SCRIPT), // start with empty script for now
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

/** Update the code of the current script. */
export function updateScriptCode(code: string): void
{
  const script = editorState.get().script;
  if (!script) return;
  script.code = code;
  script.updated = new Date();
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