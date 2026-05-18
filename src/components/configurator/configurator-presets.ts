import { LitElement, html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/button/button.js';

import {
  scriptPresets,
  presetMenuCollapsed,
  setPresetMenuCollapsed,
  activatePreset,
} from '../../state/workspace.js';

@customElement('configurator-presets')
export class ConfiguratorPresets extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const collapsed = presetMenuCollapsed.get();
    const presets   = scriptPresets.get();

    return html`
      <div class="header" @click=${this._toggleCollapse}>
        <wa-icon library="lucide" name="bookmark"></wa-icon>
        <span class="title">Presets</span>
        <span class="spacer"></span>
        <wa-icon library="lucide" name=${collapsed ? 'chevron-down' : 'chevron-up'}></wa-icon>
      </div>

      ${!collapsed ? html`
        <div class="preset-grid">
          ${presets.length === 0
            ? html`<span class="empty">No presets saved yet</span>`
            : presets.map(p => html`
                <wa-button
                  size="small"
                  appearance="outlined"
                  @click=${() => activatePreset(p.name)}
                >${p.name}</wa-button>
              `)
          }
        </div>
      ` : nothing}
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _toggleCollapse()
  {
    setPresetMenuCollapsed(!presetMenuCollapsed.get());
  }

  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: block;
      border-bottom: 1px solid var(--color-border);
    }

    .header
    {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      cursor: pointer;
      user-select: none;
      background: var(--color-bg-elevated);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
    }

    .header:hover
    {
      background: color-mix(in srgb, var(--color-border) 20%, transparent);
    }

    .title
    {
      font-weight: 500;
      color: var(--color-text);
    }

    .spacer { flex: 1; }

    .preset-grid
    {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      padding: var(--space-md);
      background: var(--color-bg);
    }

    .empty
    {
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
      font-style: italic;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'configurator-presets': ConfiguratorPresets;
  }
}
