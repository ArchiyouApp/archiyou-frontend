/**
 * execution-service.ts
 *
 * Thin singleton service that owns the Archiyou core Web Worker and exposes
 * a single `runScript()` function.  Any component (editor, configurator, etc.)
 * can import this without knowing anything about Comlink or the worker lifecycle.
 *
 * The underlying worker is created lazily on the first call and re-used for
 * every subsequent call — the shared `RunnerWorker` from `@archiyou/core` owns
 * the worker lifecycle.
 */

import { RunnerWorker, ArchiyouCoreLoadError } from '@archiyou/core';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '@archiyou/core/src/runner/types';
import type { ConsoleMessage } from '@archiyou/core/src/console/types';

// Shared, lazily-initialised worker for the whole app (editor, plugins, etc.).
const worker = new RunnerWorker();

// Base URL of the backend, used by the core $import() asset proxy. Same value
// api.ts/auth-service.ts use; '' → root-relative /proxy.
const ASSET_PROXY_URL = (import.meta.env.SERVER_API_BASE_URL as string | undefined) ?? '';

function formatUnknownError(error: unknown): string
{
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try
  {
    return JSON.stringify(error);
  }
  catch
  {
    return String(error);
  }
}

function createErrorConsoleMessage(message: string): ConsoleMessage
{
  return {
    type: 'error',
    time: new Date().toLocaleTimeString(),
    from: 'core',
    message,
  };
}

export function createExecutionFailureResult(
  request: RunnerScriptExecutionRequest,
  error: unknown,
): RunnerScriptExecutionResult
{
  const normalizedError = error instanceof ArchiyouCoreLoadError
    ? error
    : new Error(formatUnknownError(error));

  const detailLines = normalizedError instanceof ArchiyouCoreLoadError
    ? normalizedError.details ?? []
    : [];

  const message = [
    normalizedError.message,
    ...detailLines,
  ].filter(Boolean).join('\n');

  return {
    created: new Date(),
    status: 'error',
    duration: 0,
    request,
    errors: [{
      status: 'error',
      message,
      code: typeof request.script === 'string' ? request.script : (request.script as any)?.code,
    }],
    warnings: normalizedError instanceof ArchiyouCoreLoadError
      ? ['Kernel startup failed before script execution began.']
      : undefined,
    messages: [createErrorConsoleMessage(message)],
    state: {} as RunnerScriptExecutionResult['state'],
  };
}

/**
 * Execute a script request in the shared Archiyou core worker.
 * Lazily initialises the worker on the first call.
 */
export async function runScript(request: RunnerScriptExecutionRequest): Promise<RunnerScriptExecutionResult | undefined>
{
  try
  {
    // Point $import() at the backend asset proxy unless the caller set one.
    request.assetProxyUrl ??= ASSET_PROXY_URL;
    // The viewer needs the full result (scenegraph/annotations/handles), so use run().
    return await worker.run(request);
  }
  catch (error)
  {
    console.error('runScript(): failed:', error);
    return createExecutionFailureResult(request, error);
  }
}

/**
 * Pre-warm the worker without running a script.
 * Call this as early as possible (e.g. in connectedCallback) so the WASM
 * kernel is loaded before the user triggers the first execution.
 */
export async function warmupWorker(): Promise<void>
{
  await worker.init();
}
