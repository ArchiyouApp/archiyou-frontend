/**
 * Central workspace state using @lit-labs/signals.
 *
 * The workspace is a flat model: a list of scripts, plus which is selected.
 * Components read from signals and mutate via the exported functions.
 */

import { signal, computed } from '@lit-labs/signals';
import type { ExecuteResult } from '../workers/meshup.worker.js';

// ---- Types ----

export interface Script {
  id: string;
  name: string;
  code: string;
  updatedAt: string;
}

export interface WorkspaceModel {
  scripts: Script[];
  selectedScriptId: string | null;
}

// ---- State ----

export const workspace = signal<WorkspaceModel>({
  scripts: [],
  selectedScriptId: null,
});

/** The result of the most recent script execution, or null if not yet run. */
export const executionResult = signal<ExecuteResult | null>(null);

// ---- Computed ----

export const selectedScript = computed(() => {
  const ws = workspace.get();
  return ws.scripts.find(s => s.id === ws.selectedScriptId) ?? null;
});

export const scriptCount = computed(() => workspace.get().scripts.length);

// ---- Mutations ----

function generateId(): string {
  return crypto.randomUUID();
}

/** Add a new empty script and select it. Returns the new script. */
export function createScript(name = 'Untitled'): Script {
  const script: Script = {
    id: generateId(),
    name,
    code: '',
    updatedAt: new Date().toISOString(),
  };
  workspace.set({
    ...workspace.get(),
    scripts: [...workspace.get().scripts, script],
    selectedScriptId: script.id,
  });
  return script;
}

/** Select an existing script by id. */
export function selectScript(id: string): void {
  workspace.set({ ...workspace.get(), selectedScriptId: id });
}

/** Update the code of an existing script. */
export function updateScriptCode(id: string, code: string): void {
  workspace.set({
    ...workspace.get(),
    scripts: workspace.get().scripts.map(s =>
      s.id === id ? { ...s, code, updatedAt: new Date().toISOString() } : s,
    ),
  });
}

/** Delete a script by id. */
export function deleteScript(id: string): void {
  const ws = workspace.get();
  const scripts = ws.scripts.filter(s => s.id !== id);
  const selectedScriptId = ws.selectedScriptId === id
    ? (scripts[0]?.id ?? null)
    : ws.selectedScriptId;
  workspace.set({ scripts, selectedScriptId });
}

/** Store the result of the latest execution. */
export function setExecutionResult(result: ExecuteResult): void 
{
  console.log(JSON.stringify(result));
  executionResult.set(result);
}
