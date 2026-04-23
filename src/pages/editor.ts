import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { RouterLocation } from '@vaadin/router';

import { loadArchiyouCore } from '../archiyou-core-loader';
import { ArchiyouCoreApi } from '../workers/archiyou.core.worker';

import type { Remote } from 'comlink';

import '../components/editor/sidemenu.js';
import '../components/editor/codebox.js';
import '../components/editor/console.js';
import '../components/viewer/model-viewer.js';

import { workspace, updateScriptCode, setExecutionResult, setExecuting } from '../state/workspace';
import { RunnerScriptExecutionRequest } from '../../devlibs/archiyou-core-next/src/runner/types';

@customElement('page-editor')
export class PageEditor extends SignalWatcher(LitElement)
{
  //// SETTINGS ////
  CONST_AUTORUN_DELAY = 1000;    // ms to wait after code changes before auto-running
  CONST_AUTORUN_MIN_SIZE = 20;   // minimum code length to trigger auto-run

  //// 

  override render()
  {
    return html`
      <editor-side-menu></editor-side-menu>
      <wa-split-panel
            position="50"
            snap="25% 50% 75%"
        >
        <wa-icon class="split-grip"
            slot="divider" variant="solid" name="grip-lines-vertical"></wa-icon>
        <wa-split-panel class="left-split" slot="start" orientation="vertical" position="75">
          <wa-icon class="split-grip-h"
              slot="divider" variant="solid" name="grip-lines"></wa-icon>
          <editor-code-box
            slot="start"
              .code=${workspace.get().editor.script?.code ?? ''}
            @change=${this._handleCodeChange}
            @execute=${this._handleExecute}
          ></editor-code-box>
          <editor-console slot="end"></editor-console>
        </wa-split-panel>
        <model-viewer slot="end"></model-viewer>
      </wa-split-panel>
    `;
  }

  // Properties
  @property({ attribute: false }) location?: RouterLocation;  

  // Lifecycle
  override connectedCallback()
  {
    super.connectedCallback();
    console.info('Editor::connectedCallback(): Webworker starting...');
    loadArchiyouCore()
      .then(w => { 
          this._worker = w; 
          console.info('Editor::connectedCallback(): Webworker ready'); 
          // Do auto execute to show result directly
          this.checkAutoRun();
        })
      .catch(err => { console.error('Editor: worker init failed:', err); });
  }

  // Internal state
  private _code = '';
  private _codeChangeTimeout: number | null = null;
  private _worker: Remote<ArchiyouCoreApi> | null = null;

  // Methods 

  private _handleCodeChange(e: CustomEvent<string>)
  {
    console.log('Code change event:', e.detail);
    this._code = e.detail;
    updateScriptCode(this._code);
    this.checkAutoRun();
  }

  /** Check if code meets criteria and schedule auto-run after idle delay */
  checkAutoRun()
  {
    const scriptCode = workspace.get().editor.script?.code ?? '';
    if (this._codeChangeTimeout !== null)
    {
      clearTimeout(this._codeChangeTimeout);
    }

    if (scriptCode.length < this.CONST_AUTORUN_MIN_SIZE)
    {
      this._codeChangeTimeout = null;
      return;
    }

    this._codeChangeTimeout = window.setTimeout(() =>
    {
      this._codeChangeTimeout = null;
      this.execute();
    }, this.CONST_AUTORUN_DELAY);
  }

  /** Execute the current script in workspace */
  async execute()
  {
    const worker = this._worker ?? await loadArchiyouCore();

    const result = await worker.execute(
                      {
                        outputs: ['default/model/glb'],
                        messages: ['info', 'geom', 'user', 'warn', 'error', 'exec'],
                        script: workspace.get().editor.script?.toData()
                      } as RunnerScriptExecutionRequest
                    );     
    if (result)
    {
      setExecutionResult(result);
      return result;
    } 
    else {
      console.error(`Execute failed without result. This should not happen!`);
    }
  }

  private async _handleExecute()
  {
    if (workspace.get().editor.executing)
    {
      console.warn('Already running a script, ignoring execute command');
      return;
    }

    setExecuting(true);

    try { 
      const executionResult = await this.execute();
      console.log(executionResult);
    }
    catch (err)
    {
      console.error('Execute error:', err);
    }
    finally
    {
      setExecuting(false);
    }
  }
  

  //// CSS STYLES ////

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

    .left-split {
      width: 100%;
      height: 100%;
    }

    wa-split-panel::part(divider)
    {
      /* Apply frosted glass effect to divider */
      background-color: rgb(0,0,0, 0.05);
      backdrop-filter: blur(5px); /* var(--color-gray); */
    }

    wa-icon.split-grip {
      color: var(--color-gray-dark);
      opacity: 0.3;
    }

    wa-icon.split-grip-h {
      color: var(--color-gray-dark);
      opacity: 0.3;
    }

    model-viewer {
      width: 100%;
      height: 100%;
      margin-left: -12px; /** Hack to have blur split */
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
