import { LitElement, html, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/tab-group/tab-group.js';
import '@awesome.me/webawesome/dist/components/tab/tab.js';
import '@awesome.me/webawesome/dist/components/tab-panel/tab-panel.js';

import '../params/param-item.js';
import '../params/param-item-number.js';
import '../params/param-item-boolean.js';
import '../params/param-item-text.js';
import '../params/param-item-options.js';
import '../params/param-item-list.js';

import {
  paramMenuCollapsed,
  setParamMenuCollapsed,
} from '../../state/workspace.js';
import { configuratorParams, setConfiguratorValue } from '../../state/configurator.js';

import type { ScriptParam, ParamValueChangeDetail } from '../../state/workspace.js';

@customElement('configurator-params')
export class ConfiguratorParams extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const collapsed = paramMenuCollapsed.get();
    const params    = configuratorParams.get();
    const groups    = this._groups(params);

    return html`
      <div class="header" @click=${this._toggleCollapse}>
        <wa-icon library="lucide" name="sliders-horizontal"></wa-icon>
        <span class="title">Parameters</span>
        <span class="spacer"></span>
        <wa-icon library="lucide" name=${collapsed ? 'chevron-down' : 'chevron-up'}></wa-icon>
      </div>

      ${!collapsed ? html`
        <div class="body" @param-value-change=${this._handleParamValueChange}>
          ${groups.length <= 1
            ? this._renderGroup('main', params)
            : html`
                <wa-tab-group>
                  ${groups.map(g => html`<wa-tab panel=${g}>${g}</wa-tab>`)}
                  ${groups.map(g => html`
                    <wa-tab-panel name=${g}>
                      ${this._renderGroup(g, params)}
                    </wa-tab-panel>
                  `)}
                </wa-tab-group>
              `
          }
          ${params.length === 0
            ? html`<div class="empty">No parameters defined</div>`
            : nothing
          }
        </div>
      ` : nothing}
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _groups(params: ScriptParam[]): string[]
  {
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const p of params)
    {
      const g = p.group ?? 'main';
      if (!seen.has(g))
      {
        seen.add(g);
        groups.push(g);
      }
    }
    // 'main' first
    const idx = groups.indexOf('main');
    if (idx > 0)
    {
      groups.splice(idx, 1);
      groups.unshift('main');
    }
    return groups;
  }

  private _renderGroup(group: string, params: ScriptParam[])
  {
    const groupParams = params
      .filter(p => (p.group ?? 'main') === group)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return groupParams.map(p => html`
      <param-item .param=${p} readonly>
        ${this._renderControl(p)}
      </param-item>
    `);
  }

  private _renderControl(p: ScriptParam)
  {
    switch (p.type)
    {
      case 'number':  return html`<param-item-number  .param=${p}></param-item-number>`;
      case 'boolean': return html`<param-item-boolean .param=${p}></param-item-boolean>`;
      case 'text':    return html`<param-item-text    .param=${p}></param-item-text>`;
      case 'options': return html`<param-item-options .param=${p}></param-item-options>`;
      case 'list':    return html`<param-item-list    .param=${p}></param-item-list>`;
      default:        return nothing;
    }
  }

  private _toggleCollapse()
  {
    setParamMenuCollapsed(!paramMenuCollapsed.get());
  }

  private _handleParamValueChange(e: CustomEvent<ParamValueChangeDetail>)
  {
    const { name, value } = e.detail;
    if (value !== undefined) setConfiguratorValue(name, value);

    this.dispatchEvent(new CustomEvent('configurator-params-changed', {
      bubbles:  true,
      composed: true,
      detail:   e.detail,
    }));
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

    .body
    {
      background: var(--color-bg);
    }

    .empty
    {
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
      font-style: italic;
      padding: var(--space-md);
    }

    wa-tab-group
    {
      --track-color: var(--color-border);
    }

    wa-tab-panel
    {
      padding: 0;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'configurator-params': ConfiguratorParams;
  }
}
