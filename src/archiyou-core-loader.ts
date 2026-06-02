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


export class ArchiyouCoreLoadError extends Error
{
  readonly phase: 'worker' | 'init';
  override readonly cause?: unknown;
  readonly details?: string[];

  constructor(
    phase: 'worker' | 'init',
    message: string,
    options?: { cause?: unknown; details?: string[] },
  )
  {
    super(message);
    this.name = 'ArchiyouCoreLoadError';
    this.phase = phase;
    this.cause = options?.cause;
    this.details = options?.details;
  }
}

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

function describeWorkerError(event: ErrorEvent | Event): string[]
{
  if (typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent)
  {
    return [
      event.message ? `Message: ${event.message}` : '',
      event.filename ? `Source: ${event.filename}${event.lineno ? `:${event.lineno}` : ''}${event.colno ? `:${event.colno}` : ''}` : '',
      event.error ? `Cause: ${formatUnknownError(event.error)}` : '',
    ].filter(Boolean);
  }

  return ['The worker emitted an error event before initialization completed.'];
}

function logWorkerError(event: ErrorEvent | Event, workerUrl: URL): void
{
  const details = describeWorkerError(event);
  console.group('loadArchiyouCore(): Worker startup error');
  console.error(`Worker URL: ${workerUrl.href}`);

  details.forEach(detail => console.error(detail));

  if (typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent && event.error)
  {
    console.error('Original error object:', event.error);
  }
  else
  {
    console.error('Raw worker event:', event);
  }

  console.groupEnd();
}

let _pending: Promise<Comlink.Remote<ArchiyouCoreApi>> | undefined;

export function loadArchiyouCore(): Promise<Comlink.Remote<ArchiyouCoreApi>>
{  
  if (!_pending)
  {
    _pending = (async () =>
    {
      console.info('loadArchiyouCore(): Starting worker…');
      const workerUrl = new URL('./workers/archiyou.core.worker.ts', import.meta.url);
      const worker = new Worker(
        workerUrl,
        { type: 'module' },
      );

      worker.onerror = (event) =>
      {
        logWorkerError(event, workerUrl);
        _pending = undefined;
      };

      worker.onmessageerror = (event) =>
      {
        console.group('loadArchiyouCore(): Worker message error');
        console.error(`Worker URL: ${workerUrl.href}`);
        console.error('The worker sent a message that could not be deserialized on the main thread.');
        console.error('Raw message error event:', event);
        console.groupEnd();
      };

      const proxy = Comlink.wrap<ArchiyouCoreApi>(worker);
      console.info('loadArchiyouCore(): Worker created, calling init()…');

      try
      {
        await proxy.init();
      }
      catch (err)
      {
        const message = `Archiyou core failed during initialization: ${formatUnknownError(err)}`;
        console.error('loadArchiyouCore(): worker init failed:', err);
        worker.terminate();
        throw new ArchiyouCoreLoadError('init', message, {
          cause: err,
          details: [
            'The worker was created, but kernel initialization did not complete.',
            'Check the browser console for the original stack trace from the worker.',
          ],
        });
      }

      console.info('loadArchiyouCore(): init() complete, worker ready');
      return proxy;
    })().catch(err =>
    {
      console.error('loadArchiyouCore(): worker startup failed:', err);
      _pending = undefined; // reset so a retry is possible
      if (err instanceof ArchiyouCoreLoadError) throw err;
      throw new ArchiyouCoreLoadError(
        'worker',
        `Archiyou core worker failed to start: ${formatUnknownError(err)}`,
        {
          cause: err,
          details: err instanceof Event ? describeWorkerError(err) : undefined,
        },
      );
    });
  }
  return _pending;
}
