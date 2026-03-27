import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';

type MenuItem = 'menu' | 'help' | 'settings' | 'code';

@customElement('editor-side-menu')
export class SideMenu extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <!-- top: hamburger -->
      <wa-button
        appearance="plain"
        @click=${() => this._select('menu')}
      ><wa-icon name="bars" label="Menu"></wa-icon></wa-button>

      <!-- sections -->
      <div class="sections">
        <wa-button
          appearance="plain"
          class=${this._active === 'code' ? 'active' : ''}
          @click=${() => this._select('code')}
        ><wa-icon name="code" label="Code editor"></wa-icon></wa-button>
      </div>

      <!-- bottom: help + settings -->
      <div class="bottom">
        <wa-button
          appearance="plain"
          class=${this._active === 'help' ? 'active' : ''}
          @click=${() => this._select('help')}
        ><wa-icon name="circle-question" label="Help"></wa-icon></wa-button>

        <wa-button
          appearance="plain"
          class=${this._active === 'settings' ? 'active' : ''}
          @click=${() => this._select('settings')}
        ><wa-icon name="gear" label="Settings"></wa-icon></wa-button>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _active: MenuItem = 'code';

  // ── 4. Behaviour & Methods ──
  private _select(item: MenuItem)
  {
    this._active = item;
    this.dispatchEvent(new CustomEvent('menu-select', {
      detail: item,
      bubbles: true,
      composed: true,
    }));
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 48px;
      padding-right: 8px;
      padding-left: 8px;
      padding-top: var(--space-2);
      padding-bottom: var(--space-2);
      flex-shrink: 0;
      background: var(--color-bg-elevated);
      border-right: 1px solid var(--color-border);
      align-items: center;
      gap: var(--space-1, 4px);
    }

    .sections {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      flex: 1;
      margin-top: var(--space-2, 8px);
    }

    .bottom {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      margin-top: auto;
    }

    wa-button.active::part(base) {
      background-color: var(--color-primary-subtle, color-mix(in srgb, var(--color-primary) 15%, transparent));
      color: var(--color-primary);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-side-menu': SideMenu;
  }
}
