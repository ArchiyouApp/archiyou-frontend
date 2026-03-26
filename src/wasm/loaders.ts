/**
 * WASM lazy singleton loaders.
 *
 * Pattern: each WASM module has a loader function that:
 *   1. Initialises the WASM binary (once)
 *   2. Caches the result in a module-level variable
 *   3. Returns the cached instance on subsequent calls
 *
 * Usage:
 *   const myModule = await loadMyWasm();
 *
 * Add new loaders by following the template below.
 */

// ---- Type shared by all loader functions ----

export type WasmLoader<T> = () => Promise<T>;

/** Creates a singleton loader from an async factory. */
export function createSingletonLoader<T>(factory: () => Promise<T>): WasmLoader<T> {
  let instance: T | undefined;
  let pending: Promise<T> | undefined;

  return () => {
    if (instance !== undefined) return Promise.resolve(instance);
    if (pending) return pending;

    pending = factory().then(result => {
      instance = result;
      pending = undefined;
      return result;
    });

    return pending;
  };
}

// ---- Loaders ----

import { getMeshupWorker, type MeshupApi } from './meshup.js';
import type * as Comlink from 'comlink';

/**
 * Loads the meshup library in its Web Worker and returns the Comlink proxy.
 * The worker initialises the embedded WASM binary on first call.
 *
 * Usage in a Lit component:
 *   private _meshup = new WasmController(this, loadMeshup);
 *   // this._meshup.value?.someMethod(...)
 */
export const loadMeshup = createSingletonLoader<Comlink.Remote<MeshupApi>>(async () => {
  const proxy = getMeshupWorker();
  await proxy.init();
  return proxy;
});
