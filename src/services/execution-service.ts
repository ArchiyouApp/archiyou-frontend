/**
 * execution-service.ts
 *
 * Thin singleton service that owns the Archiyou core Web Worker and exposes
 * a single `runScript()` function.  Any component (editor, configurator, etc.)
 * can import this without knowing anything about Comlink or the worker lifecycle.
 *
 * The underlying worker is created lazily on the first call and re-used for
 * every subsequent call — same guarantee as the old `loadArchiyouCore()` helper,
 * which this replaces as the public API.
 */

import { loadArchiyouCore } from '../archiyou-core-loader';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

/**
 * Execute a script request in the shared Archiyou core worker.
 * Lazily initialises the worker on the first call.
 */
export async function runScript(request: RunnerScriptExecutionRequest): Promise<RunnerScriptExecutionResult>
{
  const worker = await loadArchiyouCore();
  return worker.execute(request);
}

/**
 * Pre-warm the worker without running a script.
 * Call this as early as possible (e.g. in connectedCallback) so the WASM
 * kernel is loaded before the user triggers the first execution.
 */
export async function warmupWorker(): Promise<void>
{
  await loadArchiyouCore();
}
