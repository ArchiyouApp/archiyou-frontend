/**
 * Main-thread singleton loader for the archiyou core Web Worker.
 *
 * Call `loadArchiyouCore()` to get a Comlink proxy — the worker is created
 * once, WASM is initialised via `init()`, and the same proxy is returned on
 * every subsequent call.
 *
 * Keep ArchiyouCoreApi in sync with the `api` object in core.worker.ts.
 */

import * as Comlink from 'comlink';

import { ArchiyouCoreApi } from './workers/archiyou.core.worker';


let _pending: Promise<Comlink.Remote<ArchiyouCoreApi>> | undefined;

export function loadArchiyouCore(): Promise<Comlink.Remote<ArchiyouCoreApi>>
{  
  if (!_pending)
  {
    _pending = (async () =>
    {
      console.info('loadArchiyouCore(): Starting worker…');
      const worker = new Worker(
        new URL('./workers/archiyou.core.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.onerror = (err) => {
        console.error('loadArchiyouCore(): Worker error:', err);
        _pending = undefined; // reset so a retry is possible
      }
      const proxy = Comlink.wrap<ArchiyouCoreApi>(worker);
      console.info('loadArchiyouCore(): Worker created, calling init()…');
      console.log(proxy);
      await proxy.init();
      console.info('loadArchiyouCore(): init() complete, worker ready');
      return proxy;
    })().catch(err =>
    {
      console.error('loadArchiyouCore(): worker startup failed:', err);
      _pending = undefined; // reset so a retry is possible
      throw err;
    });
  }
  return _pending;
}
