/**
 * @archiyou/core — public entry.
 *
 * The geometry kernel and the ergonomic ways to run it:
 *   - `Runner`       — run scripts on the current thread.
 *   - `RunnerWorker` — run scripts in a Web Worker (recommended for apps).
 *   - `getOutput`    — pull a single output (e.g. a GLB) out of a result.
 *
 * ```ts
 * import { RunnerWorker } from '@archiyou/core';
 * const worker = await new RunnerWorker().init();
 * const glb = await worker.execute('box(100,100,100)', { outputs: ['default/model/glb'] });
 * ```
 */

// Runner (main thread)
export { Runner } from './runner/Runner';

// RunnerWorker (Web Worker) + helpers
export { RunnerWorker, ArchiyouCoreLoadError } from './runner/worker/RunnerWorker';
export type { RunOptions, RunnerWorkerOptions } from './runner/worker/RunnerWorker';
export { getOutput, unwrapOutput } from './runner/worker/output';
export type { OutputData } from './runner/worker/output';

// Scripts
export { Script } from './Script';

// Script modules — the extension point for separately-distributed, gated
// capabilities. Inert unless a run is given a module catalog. See docs/modules.md.
export { ModuleRegistry, RESERVED_SCOPE_NAMES } from './modules/ModuleRegistry';
export type { ModuleRegistryOptions } from './modules/ModuleRegistry';
export { ModuleLoadError } from './modules/loadClientModule';
export { ServerModuleCallError } from './modules/serverModuleStub';
export { ModuleUnavailableError } from './modules/unavailableStub';
export { ARCHIYOU_CORE_VERSION } from './constants';

// Key public types
export type {
  RunnerScriptExecutionRequest,
  RunnerScriptExecutionResult,
} from './runner/types';
export type {
  ScriptData,
  ScriptOutputData,
  ScriptOutputDataWrapper,
  ScriptOutputFormat,
} from './execution/types';
export type { ModelMode } from './modeler/types';
export type { ConsoleMessage, ConsoleMessageType } from './console/types';

export { Importer } from './importer/Importer';
export type { AssetImportOptions, AssetPayload, ImportContext } from './importer/Importer';
