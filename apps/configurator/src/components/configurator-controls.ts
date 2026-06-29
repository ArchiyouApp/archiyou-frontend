import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@awesome.me/webawesome/dist/components/switch/switch.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';

import './configurator-presets.js';
import './configurator-params.js';

@customElement('configurator-controls')
export class ConfiguratorControls extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <div class="unit-toggle-row">
        <wa-icon library="lucide" name="ruler"></wa-icon>
        <span class="unit-label">Metric</span>
        <wa-switch
          class="unit-switch"
          ?checked=${this._imperial}
          @wa-change=${this._handleUnitToggle}
        ></wa-switch>
        <span class="unit-label">Imperial</span>
      </div>
      <configurator-presets></configurator-presets>
      <configurator-params
        @configurator-params-changed=${this._forwardParamsChanged}
      ></configurator-params>
    `;
  }

  // ── 2. State ──
  @state() private _imperial = false;

  // ── 4. Behaviour & Methods ──
  private _handleUnitToggle(e: Event)
  {
    this._imperial = (e.target as HTMLInputElement).checked;
    // Stub: unit switching not yet implemented
  }

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

    .unit-label
    {
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
    }

    wa-icon
    {
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
    }

    .unit-switch
    {
      margin: 0 var(--space-xs);
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
