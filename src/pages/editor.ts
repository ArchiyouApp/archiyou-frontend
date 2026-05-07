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
import '../components/editor/scene-explorer.js';
import '../components/viewer/model-viewer.js';
import '../components/params/param-menu.js';
import '../components/params/presets-menu.js';

import { workspace, scriptParams, updateScriptCode, setExecutionResult, setExecuting } from '../state/workspace';
import type { ScriptParam } from '../state/workspace';
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
        <wa-split-panel class="left-split" slot="start" orientation="vertical" position="70">
          <wa-icon class="split-grip-h"
              slot="divider" variant="solid" name="grip-lines"></wa-icon>
          <div class="top-panel" slot="start">
            <presets-menu></presets-menu>
            <param-menu @param-value-change=${() => this._scheduleParamExecute()}></param-menu>
            <editor-code-box
                .code=${workspace.get().editor.script?.code ?? ''}
              @change=${this._handleCodeChange}
              @execute=${this._handleExecute}
            ></editor-code-box>
          </div>
          <div class="bottom-panel" slot="end">
            <editor-console></editor-console>
            <scene-explorer></scene-explorer>
          </div>
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
  private _paramExecTimeout: number | null = null;
  private _worker: Remote<ArchiyouCoreApi> | null = null;

  // Methods 

  /** Execute immediately (50 ms debounce to coalesce rapid slider ticks) after a param value change */
  private _scheduleParamExecute()
  {
    if (this._paramExecTimeout !== null) clearTimeout(this._paramExecTimeout);
    this._paramExecTimeout = window.setTimeout(() =>
    {
      this._paramExecTimeout = null;
      this.execute();
    }, 50);
  }

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

    const scriptData = workspace.get().editor.script?.toData() as any;
    const params     = scriptParams.get();

    // Inject param definitions into script data so the Runner's ParamManager knows about them
    scriptData.params = Object.fromEntries(
      params.map(p => [p.name, {
        name:    p.name,
        schema:  this._buildParamSchema(p),
        default: p.defaultValue,
        order:   p.order,
        ...(p.units !== undefined && { units: p.units }),
      }])
    );

    // Current param values (value = interactive, falls back to definition default)
    const paramValues: Record<string, any> = Object.fromEntries(
      params.map(p => [p.name, p.value ?? p.defaultValue])
    );

    const result = await worker.execute(
      {
        outputs:  ['default/model/glb'],
        messages: ['info', 'geom', 'user', 'warn', 'error', 'exec'],
        script:   scriptData,
        params:   paramValues,
      } as RunnerScriptExecutionRequest
    );

    if (result)
    {
      setExecutionResult(result);
      return result;
    }
    else
    {
      console.error(`Execute failed without result. This should not happen!`);
    }
  }

  /** Build a JSON-Schema-compatible schema object from a ScriptParam for the Runner's ParamManager */
  private _buildParamSchema(p: ScriptParam): Record<string, unknown>
  {
    const schema: Record<string, unknown> = { type: p.type };

    if (p.type === 'number')
    {
      if (p.min  !== undefined) schema.minimum    = p.min;
      if (p.max  !== undefined) schema.maximum    = p.max;
      if (p.step !== undefined) schema.multipleOf = p.step;
    }
    else if (p.type === 'text')
    {
      if (p.minLength !== undefined) schema.minLength = p.minLength;
      if (p.maxLength !== undefined) schema.maxLength = p.maxLength;
    }
    else if (p.type === 'options')
    {
      schema.enum = p.options ?? [];
    }
    else if (p.type === 'list')
    {
      schema.items = { type: p.listItemType ?? 'string' };
    }

    return schema;
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

    editor-side-menu { flex-shrink: 0; }

    .left-split {
      width: 100%;
      height: 100%;
    }

    wa-split-panel::part(divider) {
      background-color: rgb(0,0,0, 0.05);
      backdrop-filter: blur(5px);
    }

    wa-icon.split-grip,
    wa-icon.split-grip-h {
      color: var(--color-gray-dark);
      opacity: 0.3;
    }

    model-viewer {
      width: 100%;
      height: 100%;
      margin-left: -12px;
    }

    /* ── Bottom tab panel ── */

    .bottom-panel {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .top-panel {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .top-panel editor-code-box {
      flex: 1;
      min-height: 0;
    }

    editor-console,
    scene-explorer {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    editor-console[collapsed],
    scene-explorer[collapsed] {
      flex: 0 0 auto;
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
