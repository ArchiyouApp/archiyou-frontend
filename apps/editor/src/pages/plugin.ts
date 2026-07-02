/**
 * <page-plugin> — in-editor plugin preview + dev loop (implementation slice 2–3).
 *
 * On load it fetches the bundled `shape-picker` example over HTTP and runs it.
 * "Open plugin folder" loads a plugin straight off disk (File System Access API)
 * for the full in-editor dev loop; "Reload" re-reads the opened folder after edits.
 *
 * The plugin's custom param menu mounts as a sandboxed bridge-driven iframe on the
 * left; the result shows in the host-owned <model-viewer> on the right. Changing
 * an input → archiyou.submit(values) → re-run → viewer. Reachable at /plugin.
 * This preview does not touch the user's active editor script.
 */

import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@archiyou/ui/viewer/model-viewer.js';
import '../plugins/plugin-part-frame';

import type { ScriptParamData } from '@archiyou/core/src/execution/types';
import type { LoadedPlugin } from '../plugins/types';
import { PluginManager } from '../plugins/PluginManager';
import { loadShapePicker, loadPluginFromDirectory, directoryPickerSupported } from '../plugins/plugin-loader';

@customElement('page-plugin')
export class PagePlugin extends LitElement
{
  private manager: PluginManager | null = null;
  private _dirHandle: FileSystemDirectoryHandle | null = null;

  @state() private _schema: ScriptParamData[] | null = null;
  @state() private _partHtml: string | null = null;
  @state() private _error: string | null = null;
  @state() private _pluginName = '';
  @state() private _status = 'Loading…';

  private _fsSupported = directoryPickerSupported();

  static override styles = css`
    :host { display: flex; height: 100%; min-height: 0; }
    .menu {
      width: 320px;
      flex: 0 0 320px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--sl-color-neutral-200, #e5e7eb);
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--sl-color-neutral-200, #e5e7eb);
      font-family: system-ui, sans-serif;
      font-size: 13px;
    }
    .toolbar button {
      font: inherit;
      padding: 4px 10px;
      border: 1px solid var(--sl-color-neutral-300, #d1d5db);
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
    .toolbar .name { margin-left: auto; color: #6b7280; }
    .body { flex: 1 1 auto; min-height: 0; overflow: auto; }
    .viewer { flex: 1 1 auto; min-width: 0; position: relative; }
    model-viewer { width: 100%; height: 100%; display: block; }
    .status { padding: 16px; font-family: system-ui, sans-serif; color: #6b7280; }
    .error { color: #b91c1c; }
    plugin-part-frame { display: block; height: 100%; }
  `;

  override async connectedCallback(): Promise<void>
  {
    super.connectedCallback();
    await this._load(() => loadShapePicker());
  }

  private _openFolder = async (): Promise<void> =>
  {
    try
    {
      const dir = await (window as any).showDirectoryPicker();
      this._dirHandle = dir;
      await this._load(() => loadPluginFromDirectory(dir));
    }
    catch (e)
    {
      if ((e as Error)?.name !== 'AbortError') this._error = (e as Error)?.message ?? String(e);
    }
  };

  private _reload = async (): Promise<void> =>
  {
    if (this._dirHandle) await this._load(() => loadPluginFromDirectory(this._dirHandle!));
  };

  /** Load a plugin from any source, (re)run it, and mount its param menu. */
  private async _load(loader: () => Promise<LoadedPlugin>): Promise<void>
  {
    this._error = null;
    this._status = 'Loading plugin…';
    try
    {
      const plugin = await loader();
      // Fresh manager per load so param definitions from a previous plugin don't leak.
      this.manager = new PluginManager();
      const schema = await this.manager.activate(plugin);
      this._pluginName = plugin.manifest.name;
      this._partHtml = this.manager.paramMenuHtml();
      this._schema = schema;
      if (!this._partHtml) this._status = 'Plugin has no param menu.';
    }
    catch (e)
    {
      this._error = (e as Error)?.message ?? String(e);
    }
  }

  private _onSubmit = (e: Event): void =>
  {
    const values = (e as CustomEvent).detail as Record<string, any>;
    void this.manager?.run(values);
  };

  override render()
  {
    return html`
      <div class="menu">
        <div class="toolbar">
          <button
            @click=${this._openFolder}
            ?disabled=${!this._fsSupported}
            title=${this._fsSupported ? 'Load a plugin from a local folder' : 'Not supported in this browser'}
          >Open plugin folder</button>
          <button @click=${this._reload} ?disabled=${!this._dirHandle}>Reload</button>
          <span class="name">${this._pluginName}</span>
        </div>
        <div class="body">
          ${this._error
            ? html`<div class="status error">Plugin failed: ${this._error}</div>`
            : this._partHtml && this._schema
              ? html`<plugin-part-frame
                  .src=${this._partHtml}
                  .schema=${this._schema}
                  @plugin-submit=${this._onSubmit}
                ></plugin-part-frame>`
              : html`<div class="status">${this._status}</div>`}
        </div>
      </div>
      <div class="viewer"><model-viewer></model-viewer></div>
    `;
  }
}

declare global
{
  interface HTMLElementTagNameMap { 'page-plugin': PagePlugin; }
}
