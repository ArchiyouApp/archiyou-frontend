/**
 * <page-plugin> — minimal in-editor plugin preview (implementation slice 2).
 *
 * Loads the bundled `shape-picker` example plugin, runs its main script in the
 * shared worker, mounts its custom param menu as a sandboxed bridge-driven part
 * on the left, and shows the result in the host-owned <model-viewer> on the
 * right. Changing the dropdown → archiyou.submit(values) → re-run → viewer.
 *
 * Reachable at /plugin. This is a dev/preview surface; it does not touch the
 * user's active editor script (PluginManager writes only the viewer signals).
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@archiyou/ui/viewer/model-viewer.js';
import '../plugins/plugin-part-frame';

import type { ScriptParamData } from '@archiyou/core/src/execution/types';
import { PluginManager } from '../plugins/PluginManager';
import { loadShapePicker } from '../plugins/plugin-loader';

@customElement('page-plugin')
export class PagePlugin extends LitElement
{
  private manager = new PluginManager();

  @state() private _schema: ScriptParamData[] | null = null;
  @state() private _partHtml: string | null = null;
  @state() private _error: string | null = null;

  static override styles = css`
    :host { display: flex; height: 100%; min-height: 0; }
    .menu {
      width: 300px;
      flex: 0 0 300px;
      border-right: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      overflow: auto;
    }
    .viewer { flex: 1 1 auto; min-width: 0; position: relative; }
    model-viewer { width: 100%; height: 100%; display: block; }
    .status { padding: 16px; font-family: system-ui, sans-serif; color: #6b7280; }
    .error { color: #b91c1c; }
  `;

  override async connectedCallback(): Promise<void>
  {
    super.connectedCallback();
    try
    {
      const plugin = await loadShapePicker();
      const schema = await this.manager.activate(plugin);
      this._partHtml = this.manager.paramMenuHtml();
      this._schema = schema;
    }
    catch (e)
    {
      this._error = (e as Error)?.message ?? String(e);
    }
  }

  private _onSubmit = (e: Event): void =>
  {
    const values = (e as CustomEvent).detail as Record<string, any>;
    void this.manager.run(values);
  };

  override render()
  {
    return html`
      <div class="menu">
        ${this._error
          ? html`<div class="status error">Plugin failed: ${this._error}</div>`
          : this._partHtml && this._schema
            ? html`<plugin-part-frame
                .src=${this._partHtml}
                .schema=${this._schema}
                @plugin-submit=${this._onSubmit}
              ></plugin-part-frame>`
            : html`<div class="status">Loading plugin…</div>`}
      </div>
      <div class="viewer"><model-viewer></model-viewer></div>
    `;
  }
}

declare global
{
  interface HTMLElementTagNameMap { 'page-plugin': PagePlugin; }
}
