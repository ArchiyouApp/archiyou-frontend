/**
 * WasmController — Lit ReactiveController for WASM modules.
 *
 * Handles loading state and exposes the WASM value to the host component.
 *
 * Usage:
 *   class MyComponent extends LitElement {
 *     private _foo = new WasmController(this, loadFoo);
 *
 *     render() {
 *       if (this._foo.loading) return html`<wa-spinner></wa-spinner>`;
 *       if (this._foo.error)   return html`<p>Failed to load</p>`;
 *       return html`<p>Result: ${this._foo.value?.add(1, 2)}</p>`;
 *     }
 *   }
 */

import type { ReactiveController, ReactiveControllerHost } from 'lit';
import type { WasmLoader } from './loaders.js';

export class WasmController<T> implements ReactiveController {
  loading = true;
  value: T | null = null;
  error: unknown = null;

  private readonly _host: ReactiveControllerHost;
  private readonly _loader: WasmLoader<T>;

  constructor(host: ReactiveControllerHost, loader: WasmLoader<T>) {
    this._host = host;
    this._loader = loader;
    host.addController(this);
  }

  hostConnected() {
    this._load();
  }

  private async _load() {
    this.loading = true;
    this.error = null;
    this._host.requestUpdate();

    try {
      this.value = await this._loader();
    } catch (err) {
      this.error = err;
    } finally {
      this.loading = false;
      this._host.requestUpdate();
    }
  }
}
