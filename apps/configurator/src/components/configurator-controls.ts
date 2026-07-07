import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';

import './configurator-presets.js';
import './configurator-params.js';

import { configuratorUnitSystem, setConfiguratorUnitSystem } from '../../state/workspace.js';

@customElement('configurator-controls')
export class ConfiguratorControls extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const sys = configuratorUnitSystem.get();

    return html`
      <div class="unit-toggle-row">
        <wa-icon library="lucide" name="ruler"></wa-icon>
        <div class="unit-seg" role="group">
          <button
            class=${`seg-btn ${sys === 'metric' ? 'active' : ''}`}
            @click=${() => setConfiguratorUnitSystem('metric')}
          >Metric <span class="seg-hint">mm</span></button>
          <button
            class=${`seg-btn ${sys === 'imperial' ? 'active' : ''}`}
            @click=${() => setConfiguratorUnitSystem('imperial')}
          >Imperial <span class="seg-hint">in</span></button>
        </div>
        <span id="unit-help" class="unit-help"><wa-icon library="lucide" name="circle-help"></wa-icon></span>
        <wa-tooltip for="unit-help" placement="bottom">
          Choose how measurements are shown for you. Metric uses millimetres (mm); Imperial uses inches (in).
          This is your local preference and does not change the script.
        </wa-tooltip>
      </div>
      <configurator-presets></configurator-presets>
      <configurator-params
        @configurator-params-changed=${this._forwardParamsChanged}
      ></configurator-params>
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _forwardParamsChanged(e: Event)
  {
    this.dispatchEvent(new CustomEvent('configurator-params-changed', {
      bubbles: true,
      composed: true,
      detail:   (e as CustomEvent).detail,
    }));
  }

  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: block;
    }

    .unit-toggle-row
    {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-lg);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    wa-icon
    {
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
    }

    .unit-seg
    {
      display: inline-flex;
      align-items: stretch;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 4px);
      overflow: hidden;
    }

    .seg-btn
    {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: var(--space-xs) var(--space-md);
      border: none;
      background: var(--color-bg);
      color: var(--color-text-muted);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .seg-btn + .seg-btn { border-left: 1px solid var(--color-border); }

    .seg-btn:hover { background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg)); }

    .seg-btn.active
    {
      background: var(--color-primary);
      color: var(--color-bg);
    }

    .seg-hint { font-size: var(--text-xs); opacity: 0.7; }

    .unit-help
    {
      display: inline-flex;
      align-items: center;
      cursor: help;
      opacity: 0.6;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'configurator-controls': ConfiguratorControls;
  }
}
