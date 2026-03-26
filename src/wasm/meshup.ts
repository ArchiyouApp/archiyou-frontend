/**
 * Main-thread proxy for the meshup Web Worker.
 *
 * Import `getMeshupWorker()` to get a Comlink proxy — all calls are
 * automatically async and execute inside the worker.
 *
 * Keep MeshupApi in sync with the `api` object in meshup.worker.ts.
 */

import * as Comlink from 'comlink';
import type { ExecuteResult } from '../workers/meshup.worker.js';

export type { ExecuteResult };

export interface MeshupApi {
  init(): Promise<void>;
  execute(code: string): Promise<ExecuteResult>;
}

let _proxy: Comlink.Remote<MeshupApi> | null = null;

export function getMeshupWorker(): Comlink.Remote<MeshupApi> {
  if (!_proxy) {
    const worker = new Worker(
      new URL('../workers/meshup.worker.ts', import.meta.url),
      { type: 'module' },
    );
    _proxy = Comlink.wrap<MeshupApi>(worker);
  }
  return _proxy;
}
