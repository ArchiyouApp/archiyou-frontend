import * as Comlink from 'comlink';

console.log('archiyou.core.worker: module loaded');

import { Runner } from '../../devlibs/archiyou-core-next/src/runner/Runner';
import type { RunnerScriptExecutionRequest, RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

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
    return runner.execute(req); // return raw result for maximum flexibility
  },
};

Comlink.expose(api);
