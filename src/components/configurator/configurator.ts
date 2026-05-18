import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';

import { runScript, warmupWorker } from '../../services/execution-service.js';
import { workspace, scriptParams, setExecutionResult, setExecuting } from '../../state/workspace.js';
import type { ScriptParam } from '../../state/workspace.js';
import type { RunnerScriptExecutionRequest } from '../../../devlibs/archiyou-core-next/src/runner/types.js';

import '../viewer/model-viewer.js';
import './configurator-header.js';
import './configurator-controls.js';
import './configurator-metric-bar.js';

@customElement('page-configurator')
export class PageConfigurator extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <wa-split-panel position="33">
        <wa-icon
          class="split-grip"
          slot="divider"
          library="lucide"
          name="grip-lines-vertical"
        ></wa-icon>

        <div class="sidebar" slot="start">
          <configurator-header></configurator-header>
          <configurator-controls
            @configurator-params-changed=${this._handleParamsChanged}
          ></configurator-controls>
        </div>

        <model-viewer slot="end"></model-viewer>
      </wa-split-panel>

      <configurator-metric-bar></configurator-metric-bar>
    `;
  }

  // ── 2. State ──
  @state() private _executing = false;
  private _paramExecTimeout: number | null = null;

  // ── 3. Lifecycle ──
  override connectedCallback()
  {
    super.connectedCallback();
    warmupWorker()
      .then(() => this._execute())
      .catch(err => console.error('Configurator: worker init failed:', err));
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    if (this._paramExecTimeout !== null) clearTimeout(this._paramExecTimeout);
  }

  // ── 4. Behaviour & Methods ──
  private _handleParamsChanged()
  {
    if (this._paramExecTimeout !== null) clearTimeout(this._paramExecTimeout);
    this._paramExecTimeout = window.setTimeout(() =>
    {
      this._paramExecTimeout = null;
      this._execute();
    }, 300);
  }

  private async _execute()
  {
    if (this._executing) return;
    this._executing = true;
    setExecuting(true);

    try
    {
      const result = await runScript(this._buildRequest());
      if (result) setExecutionResult(result);
    }
    catch (err)
    {
      console.error('Configurator: execution failed:', err);
    }
    finally
    {
      this._executing = false;
      setExecuting(false);
    }
  }

  private _buildRequest(): RunnerScriptExecutionRequest
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
      outputs:  ['default/model/glb', 'default/metrics/*/json'],
      messages: ['error'],
      script:   scriptData,
      params:   paramValues,
    } as RunnerScriptExecutionRequest;
  }

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

  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    wa-split-panel
    {
      flex: 1;
      min-height: 0;
    }

    .sidebar
    {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      background: var(--color-bg-elevated);
      border-right: 1px solid var(--color-border);
    }

    model-viewer
    {
      display: block;
      width: 100%;
      height: 100%;
    }

    configurator-metric-bar
    {
      height: 80px;
      flex-shrink: 0;
    }

    .split-grip
    {
      width: 18px;
      background: var(--color-bg-elevated);
      border-left: 1px solid var(--color-border);
      border-right: 1px solid var(--color-border);
      color: var(--color-text-muted, #aaa);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: col-resize;
    }

    wa-split-panel::part(divider)
    {
      background: transparent;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'page-configurator': PageConfigurator;
  }
}
