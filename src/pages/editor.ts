import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { RouterLocation } from '@vaadin/router';
import { workspace, updateScriptCode, selectScript, setExecutionResult } from '../state/workspace.js';
import { loadMeshup } from '../wasm/loaders.js';
import type { MeshupApi } from '../wasm/meshup.js';
import type { Remote } from 'comlink';

import '../components/editor-side-menu.js';
import '../components/editor-codemirror.js';
import '../components/model-viewer.js';

@customElement('page-editor')
export class PageEditor extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const scriptId = this.location?.params['scriptId'] as string | undefined;
    const script = scriptId
      ? workspace.get().scripts.find(s => s.id === scriptId)
      : null;

    return html`
      <editor-side-menu></editor-side-menu>
      <wa-split-panel
            position="50"
            snap="25% 50% 75%"
        >
        <wa-icon class="split-grip"
            slot="divider" variant="solid" name="grip-lines-vertical"></wa-icon>
        <code-editor
          slot="start"
          .value=${script?.code ?? ''}
          @change=${this._handleCodeChange}
          @execute=${this._handleExecute}
        ></code-editor>
        <model-viewer slot="end"></model-viewer>
      </wa-split-panel>
    `;
  }

  // ── 2. Properties ──
  @property({ attribute: false }) location?: RouterLocation;

  // ── 3. Lifecycle ──
  override connectedCallback()
  {
    super.connectedCallback();
    const scriptId = this.location?.params['scriptId'] as string | undefined;
    if (scriptId)
    {
      selectScript(scriptId);
    }
    console.info('Editor::connectedCallback(): Webworker starting...');
    loadMeshup().then(w => { this._worker = w; }).catch(() => {});
  }

  // ── 4. Behaviour & Methods ──
  private _running = false;
  private _worker: Remote<MeshupApi> | null = null;

  private _handleCodeChange(e: CustomEvent<string>)
  {
    const scriptId = this.location?.params['scriptId'] as string | undefined;
    if (scriptId)
    {
      updateScriptCode(scriptId, e.detail);
    }
  }

  private async _handleExecute(e: CustomEvent<string>)
  {
    if (this._running)
    {
      console.warn('Already running a script, ignoring execute command');
      return;
    }

    this._running = true;

    try
    {
      const worker = this._worker ?? await loadMeshup();
      const t = performance.now();
      const result = await worker.execute(e.detail);
      const duration = performance.now() - t;
      console.info(`Script executed in ${duration.toFixed(2)} ms`);
      setExecutionResult(result);
    }
    catch (err)
    {
      console.error('Execute error:', err);
    }
    finally
    {
      this._running = false;
    }
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    wa-split-panel {
      flex: 1;
      min-height: 0;
      --divider-width: 12px;
    }

    editor-side-menu {
      flex-shrink: 0;
    }

    wa-split-panel::part(divider)
    {
      background: var(--color-gray);
    }

    wa-icon.split-grip {
      color: var(--color-gray-dark);
      opacity: 0.3;
    }

    code-editor {
      width: 100%;
      height: 100%;
    }

    model-viewer {
      width: 100%;
      height: 100%;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'page-editor': PageEditor;
  }
}
