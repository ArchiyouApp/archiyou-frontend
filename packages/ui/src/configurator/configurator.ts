import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';

import { createExecutionFailureResult, runScript, warmupWorker } from '@archiyou/editor/src/services/execution-service';
import { editorScript, setExecutionResult, setExecuting } from '@archiyou/editor/src/state/workspace';
import { configuratorUnitSystem } from '@archiyou/editor/src/state/workspace';
import { configuratorParams, configuratorValueFor } from '@archiyou/editor/src/state/configurator';
import type { RunnerScriptExecutionRequest } from '@archiyou/core/src/runner/types';

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
    // Track the local display system so a switch triggers a re-run (dims/docs
    // are formatted at execution time from request.unitSystem).
    this._pendingUnitSystem = configuratorUnitSystem.get();
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
  private _pendingUnitSystem: string | null = null;
  private _lastUnitSystem: string | null = null;

  // ── 3. Lifecycle ──
  override connectedCallback()
  {
    super.connectedCallback();
    warmupWorker()
      .then(() => this._execute())
      .catch(err =>
      {
        console.error('Configurator: worker init failed:', err);
        setExecutionResult(createExecutionFailureResult(this._buildRequest(), err));
      });
  }

  override updated()
  {
    // Local unit-system flip → re-run so dimension/doc text reformats.
    if (this._lastUnitSystem !== null && this._pendingUnitSystem !== this._lastUnitSystem)
    {
      this._lastUnitSystem = this._pendingUnitSystem;
      this._execute();
    }
    else
    {
      this._lastUnitSystem = this._pendingUnitSystem;
    }
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
      setExecutionResult(createExecutionFailureResult(this._buildRequest(), err));
    }
    finally
    {
      this._executing = false;
      setExecuting(false);
    }
  }

  private _buildRequest(): RunnerScriptExecutionRequest
  {
    // Definitions come from the core active script (already canonical via
    // toData()); values are the configurator's runtime overrides.
    const scriptData = editorScript.get()?.toData() as any;
    const params = configuratorParams.get();

    const paramValues: Record<string, any> = Object.fromEntries(
      params.map(p => [p.name, configuratorValueFor(p)])
    );

    return {
      outputs:  ['default/model/glb', 'default/metrics/*/json'],
      messages: ['error'],
      script:   scriptData,
      params:   paramValues,
      // display = the end-user's local choice (geometry stays in the model unit)
      unitSystem: configuratorUnitSystem.get(),
    } as RunnerScriptExecutionRequest;
  }


  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      background: var(--color-bg);
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
