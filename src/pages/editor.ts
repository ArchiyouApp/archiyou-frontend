import { LitElement, html, css } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import type { RouterLocation } from '@vaadin/router';

import { runScript, warmupWorker } from '../services/execution-service';

import '../components/editor/main-menu.js';
import '../components/editor/codebox.js';
import '../components/editor/console.js';
import '../components/viewer/model-viewer.js';
import '../components/params/param-menu.js';
import '../components/params/presets-menu.js';
import '../components/editor/toolbar.js';
import '../components/editor/tool-panels.js';
import '../components/editor/tools/scene-tool.js';
import '../components/editor/tools/data-tool.js';
import '../components/editor/tools/metrics-tool.js';
import '../components/editor/tools/document-viewer.js';
import type { ToolDef } from '../components/editor/toolbar.js';

import { workspace, editorState, scriptParams, updateScriptCode, setExecutionResult, setExecuting, activeBottomPanel } from '../state/workspace';
import type { ScriptParam } from '../state/workspace';
import { RunnerScriptExecutionRequest } from '../../devlibs/archiyou-core-next/src/runner/types';

@customElement('page-editor')
export class PageEditor extends SignalWatcher(LitElement)
{
  //// SETTINGS ////
  CONST_AUTORUN_DELAY = 1000;    // ms to wait after code changes before auto-running
  CONST_AUTORUN_MIN_SIZE = 20;   // minimum code length to trigger auto-run

  readonly TOOLS: ToolDef[] = [
    { id: 'scene',   icon: 'network',    name: 'Scene',     exclusive: false, component: 'editor-scene-tool',    width: 30, height: 50 },
    { id: 'data',    icon: 'table',      name: 'Data',      exclusive: false, component: 'editor-data-tool',     width: 30, height: 50 },
    { id: 'metrics', icon: 'chart-bar',  name: 'Metrics',   exclusive: false, component: 'editor-metrics-tool',  width: 30, height: 50,  outputs: ['default/metrics/*/json'] },
    { id: 'docs',    icon: 'file-text',  name: 'Documents', exclusive: true,  component: 'editor-document-tool', width: 40, height: 100, outputs: ['default/docs/*/svg'] },
  ];

  //// 

  override render()
  {
    return html`
      <editor-main-menu
        .active=${this._activeSection}
        @menu-action=${this._handleMenuAction}
        @menu-select=${this._handleMenuSelect}
      ></editor-main-menu>
      <wa-split-panel
            position="50"
            snap="25% 50% 75%"
        >
        <wa-icon class="split-grip"
            slot="divider" variant="solid" name="grip-lines-vertical"></wa-icon>
        <wa-split-panel class="left-split" slot="start" orientation="vertical"
            @wa-reposition=${this._handleConsoleSplitReposition}>
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
          </div>
        </wa-split-panel>
        <wa-split-panel
          slot="end"
          class="viewer-tools-split"
          position=${this._activeTools.length > 0 ? 100 - this._activeTools.reduce((max, t) => Math.max(max, t.width), 0) : 100}
        >
          ${this._activeTools.length > 0 ? html`<wa-icon slot="divider" class="split-grip" variant="solid" name="grip-lines-vertical"></wa-icon>` : ''}
          <model-viewer slot="start"></model-viewer>
          <editor-tool-panels
            slot="end"
            .tools=${this._activeTools}
            @tool-close=${this._handleToolClose}
          ></editor-tool-panels>
        </wa-split-panel>
      </wa-split-panel>
      <editor-toolbar
        .tools=${this.TOOLS}
        .activeIds=${this._activeTools.map(t => t.id)}
        @tool-toggle=${this._handleToolToggle}
      ></editor-toolbar>
    `;
  }

  // Properties
  @property({ attribute: false }) location?: RouterLocation;

  @state() private _activeSection: 'info' | 'code' | 'history' | 'files' | 'templates' | 'help' | 'settings' | null = 'code';
  @state() private _activeTools: ToolDef[] = [];

  @query('.left-split') private _leftSplitPanel!: HTMLElement & { position: number };
  private _consoleSplitPosition = 70;
  private _consoleWasOpen: boolean | null = null;


  // Lifecycle
  override connectedCallback()
  {
    super.connectedCallback();
    // Default: open scene tool
    const sceneTool = this.TOOLS.find(t => t.id === 'scene');
    if (sceneTool) this._activeTools = [sceneTool];

    const saved = localStorage.getItem('editor:consoleSplitPosition');
    if (saved) this._consoleSplitPosition = Math.max(10, Math.min(95, parseFloat(saved)));

    console.info('Editor::connectedCallback(): Warming up worker…');
    warmupWorker()
      .then(() => {
        console.info('Editor::connectedCallback(): Worker ready');
        this.checkAutoRun();
      })
      .catch(err => { console.error('Editor: worker init failed:', err); });
  }

  override updated()
  {
    this._syncConsoleSplitPosition();
  }

  // Internal state
  private _code = '';
  private _codeChangeTimeout: number | null = null;
  private _paramExecTimeout: number | null = null;

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

  /** Build an execution request for the current script and params. */
  private _buildRequest(outputs: string[], messages: string[] = ['info', 'geom', 'user', 'warn', 'error', 'exec']): RunnerScriptExecutionRequest
  {
    const scriptData = workspace.get().editor.script?.toData() as any;
    const params = scriptParams.get();

    scriptData.params = Object.fromEntries(
      params.map(p => [p.name, {
        name:    p.name,
        schema:  this._buildParamSchema(p),
        default: p.defaultValue,
        order:   p.order,
        ...(p.units !== undefined && { units: p.units }),
      }])
    );

    const paramValues: Record<string, any> = Object.fromEntries(
      params.map(p => [p.name, p.value ?? p.defaultValue])
    );

    return {
      outputs,
      messages,
      script: scriptData,
      params: paramValues,
    } as RunnerScriptExecutionRequest;
  }

  /** Execute the current script: produces model + tables.
   *  Then triggers a separate lean run for any active tool-specific outputs. */
  async execute()
  {
    const result = await runScript(
      this._buildRequest(['default/model/glb', 'default/tables/*/json'])
    );

    if (result)
    {
      setExecutionResult(result);
      await this._executeToolOutputs();
      return result;
    }
    else
    {
      console.error(`Execute failed without result. This should not happen!`);
    }
  }

  /** Run a lean extra execute for any active tools that declare outputs (e.g. metrics, docs).
   *  The results are merged into the current editorState result, avoiding a second heavy model export. */
  private async _executeToolOutputs()
  {
    const toolOutputs = this._activeTools.flatMap(t => t.outputs ?? []);
    if (toolOutputs.length === 0) return;

    const extraResult = await runScript(
      this._buildRequest(toolOutputs, ['error'])
    );

    if (extraResult?.outputs?.length)
    {
      const current = editorState.get().result;
      if (current)
      {
        setExecutionResult({
          ...current,
          outputs: [...(current.outputs ?? []), ...extraResult.outputs],
        });
      }
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

  private _handleMenuAction(e: CustomEvent<string>)
  {
    this.dispatchEvent(new CustomEvent('editor-action', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }));
  }

  private _handleMenuSelect(e: CustomEvent<'info' | 'code' | 'history' | 'files' | 'templates' | 'help' | 'settings' | null>)
  {
    this._activeSection = e.detail;
    this.dispatchEvent(new CustomEvent('editor-section', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }));
  }

  private _handleToolToggle(e: CustomEvent<string>)
  {
    const id = e.detail;
    const tool = this.TOOLS.find(t => t.id === id);
    if (!tool) return;

    const isActive = this._activeTools.some(t => t.id === id);

    if (isActive)
    {
      this._activeTools = this._activeTools.filter(t => t.id !== id);
    }
    else
    {
      const base = tool.exclusive ? [] : this._activeTools.filter(t => !t.exclusive);
      this._activeTools = [...base, tool];
      // If the newly active tool declares outputs and we already have a result,
      // run a lean extra execute immediately to populate its data.
      if (tool.outputs?.length && editorState.get().result)
      {
        this._executeToolOutputs();
      }
    }
  }

  private _handleToolClose(e: CustomEvent<string>)
  {
    this._activeTools = this._activeTools.filter(t => t.id !== e.detail);
  }

  private _syncConsoleSplitPosition()
  {
    const panel = this._leftSplitPanel as any;
    if (!panel) return;

    const isOpen = activeBottomPanel.get() === 'console';
    if (this._consoleWasOpen === isOpen) return;
    this._consoleWasOpen = isOpen;

    if (isOpen)
    {
      panel.position = this._consoleSplitPosition;
    }
    else
    {
      const totalH = (panel as HTMLElement).offsetHeight;
      if (totalH > 0)
      {
        panel.position = Math.max(0, ((totalH - 40) / totalH) * 100);
      }
    }
  }

  private _handleConsoleSplitReposition(e: Event)
  {
    if (activeBottomPanel.get() !== 'console') return;
    const pos = (e.currentTarget as any).position as number;
    if (typeof pos === 'number' && pos > 1 && pos < 99)
    {
      this._consoleSplitPosition = pos;
      localStorage.setItem('editor:consoleSplitPosition', String(pos));
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

    editor-main-menu { flex-shrink: 0; }
    editor-toolbar    { flex-shrink: 0; }

    .viewer-tools-split {
      width: 100%;
      height: 100%;
      --divider-width: 12px;
    }

    editor-tool-panels {
      width: 100%;
      height: 100%;
      min-width: 0;
      border-left: 1px solid var(--color-border);
    }

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

    editor-console {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    editor-console[collapsed] {
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
