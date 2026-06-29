import * as Comlink from 'comlink';

console.log('archiyou.core.worker: module loaded');

import { Runner } from '@archiyou/core/src/runner/Runner';
import { Script } from '@archiyou/core/src/execution/Script';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '@archiyou/core/src/runner/types';

let runner: Runner | null = null;

// Comlink API definition - keep in sync with ArchiyouCoreApi in archiyou-core-loader.ts
export interface ArchiyouCoreApi
{
  init(): Promise<void>;
  execute(script: RunnerScriptExecutionRequest): Promise<RunnerScriptExecutionResult | undefined>;
}

const api = {
  // Init Runner and load WASM kernel
  async init(): Promise<void> 
  {
    try {
      const t = performance.now();
      console.info('core.worker: init() called. Starting Archiyou core Runner');
      runner = new Runner();
      await runner.load();
      console.info(`core.archiyou.worker: Archiyou core Runner initialized in ${(performance.now() - t).toFixed(2)} ms`);
    }
    catch(err) {
      console.error('core.archiyou.worker: failed:', err);
      throw err;
    }
  },
  // Execute a script and return the result
  async execute(req:RunnerScriptExecutionRequest): Promise<RunnerScriptExecutionResult>
  {
    if(!runner) throw new Error('Archiyou.core.worker.ts: Runner not initialized');

    // Hydrate any local component scripts the main thread sent along and
    // link them on the Runner so $component('./name') can resolve them.
    if (Array.isArray(req.componentScripts))
    {
      const hydrated = req.componentScripts
        .map(d => Script.fromData(d))
        .filter((s): s is Script => s !== null);
      runner.linkComponentScripts(hydrated);
    }

    return runner.execute(req); // return raw result for maximum flexibility
  },
};

Comlink.expose(api);
