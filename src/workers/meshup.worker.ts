/**
 * meshup Web Worker
 *
 * Loads the meshup library (which initialises its embedded WASM binary) and
 * exposes the API to the main thread via Comlink.
 *
 * The `execute` method runs user-supplied code with every Meshup class
 * available as a local binding so scripts can use `Mesh.Cube(10)` directly.
 */

import * as Comlink from 'comlink';
import {
  initAsync,
  Mesh,
  Polygon,
  Curve,
  Collection,
  MeshCollection,
  CurveCollection,
  Sketch,
  Bbox,
  OBbox,
  Point,
  Vector,
  Vertex,
} from '../../devlibs/meshup/src/index.js';

/** Scope object passed to user code — each key becomes a local variable. */
const scope: Record<string, unknown> = {
  Mesh,
  Polygon,
  Curve,
  Collection,
  MeshCollection,
  CurveCollection,
  Sketch,
  Bbox,
  OBbox,
  Point,
  Vector,
  Vertex,
};

export interface ExecuteResult {
  success: boolean;
  /** Serialisable return value (last expression or explicit `return`). */
  value?: unknown;
  /** Captured console.log output lines. */
  logs: string[];
  /** Error message when success === false. */
  error?: string;
  /** GLTF JSON string of all shapes created during execution. */
  gltf?: string;
}

type Shape = InstanceType<typeof Mesh> | InstanceType<typeof Curve>;

function isShape(val: unknown): val is Shape {
  return val instanceof Mesh || val instanceof Curve;
}

/**
 * Creates a tracker that wraps the Mesh and Curve classes so every shape
 * produced by user code (via constructors, static factories, or instance
 * methods) is automatically collected into a Set.
 */
function createTracker() {
  const shapes = new Set<Shape>();

  /** Wrap an instance so any method that returns a new shape is also tracked. */
  function trackInstance<T extends Shape>(instance: T): T {
    shapes.add(instance);
    return new Proxy(instance, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val !== 'function') return val;
        return function (this: unknown, ...args: unknown[]) {
          const result = (val as (...a: unknown[]) => unknown).apply(target, args);
          if (isShape(result)) {
            trackInstance(result);
          } else if (result instanceof Collection) {
            for (const s of result.shapes()) trackInstance(s as Shape);
          }
          // Keep fluent chains working: if method returns `this`, return the proxy
          return result === target ? receiver : result;
        };
      },
    });
  }

  /** Wrap a constructor so `new Mesh()` and static factories are tracked. */
  function wrapClass<T extends new (...args: unknown[]) => Shape>(Ctor: T): T {
    return new Proxy(Ctor, {
      construct(target, args) {
        return trackInstance(Reflect.construct(target, args) as Shape);
      },
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val !== 'function' || prop === 'prototype') return val;
        return function (...args: unknown[]) {
          const result = (val as (...a: unknown[]) => unknown).apply(target, args);
          if (isShape(result)) return trackInstance(result);
          return result;
        };
      },
    });
  }

  return { shapes, wrapClass };
}

const api = {
  async init(): Promise<void>
  {
    console.log('Meshup.worker.ts: Worker initializing meshup library and WASM module…');
    const t = performance.now();
    await initAsync();
    console.log(`Meshup.worker.ts: Initialization complete in ${(performance.now() - t).toFixed(2)} ms`);
  },

  /**
   * Execute user code inside the worker scope.
   *
   * The code is wrapped in an async function so `await` works at the top level.
   * All Meshup classes are injected as parameters so they appear as locals.
   */
  async execute(code: string): Promise<ExecuteResult> 
  {

    const logs: string[] = [];

    // Capture console.log calls inside user code
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    };
    console.warn = console.log;
    console.error = console.log;

    try {
      const { shapes, wrapClass } = createTracker();

      // Use tracked versions of Mesh and Curve in the execution scope
      const execScope: Record<string, unknown> = {
        ...scope,
        Mesh: wrapClass(Mesh as unknown as new (...args: unknown[]) => Shape),
        Curve: wrapClass(Curve as unknown as new (...args: unknown[]) => Shape),
      };

      const paramNames = Object.keys(execScope);
      const paramValues = paramNames.map(k => execScope[k]);

      const wrappedCode = `"use strict";\n${code}`;
      const fn = new Function(...paramNames, `return (async () => {\n${wrappedCode}\n})();`);

      const result = await fn(...paramValues);

      // Collect all tracked shapes into a single GLTF scene
      let gltf: string | undefined;
      if (shapes.size > 0) {
        const scene = new Collection(...shapes);
        gltf = scene.toGLTF();
      }

      return { success: true, value: serialise(result), gltf, logs };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, logs };
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    }
  },
};

/** Best-effort serialisation for transfer back to main thread. */
function serialise(val: unknown): unknown {
  if (val === undefined || val === null) return val;
  if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.map(serialise);
  // Objects with a toString (our domain classes) — return their string repr
  if (typeof val === 'object' && val !== null && 'toString' in val) {
    return String(val);
  }
  try { return JSON.parse(JSON.stringify(val)); } catch { return String(val); }
}

Comlink.expose(api);
