import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';
import './main-menu-file-menu.js';
import './panel-info.js';

type MenuItem = 'info' | 'code' | 'history' | 'files' | 'templates' | 'help' | 'settings';

@customElement('editor-main-menu')
export class MainMenu extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <!-- top: hamburger dropdown -->
      <editor-main-menu-file-menu></editor-main-menu-file-menu>

      <!-- sections -->
      <div class="sections">
        <wa-button
          id="btn-info"
          appearance="plain"
          class=${this._active === 'info' ? 'active' : ''}
          @click=${() => this._select('info')}
        ><wa-icon name="circle-info" label="Info"></wa-icon></wa-button>
        <wa-tooltip for="btn-info" placement="right">${msg('Info')}</wa-tooltip>

        <wa-button
          id="btn-code"
          appearance="plain"
          class=${this._active === 'code' ? 'active' : ''}
          @click=${() => this._select('code')}
        ><wa-icon name="code" label="Code editor"></wa-icon></wa-button>
        <wa-tooltip for="btn-code" placement="right">${msg('Code editor')}</wa-tooltip>

      </div>

      <!-- bottom: templates, help, settings -->
      <div class="bottom">
        <wa-button
          id="btn-templates"
          appearance="plain"
          class=${this._active === 'templates' ? 'active' : ''}
          @click=${() => this._select('templates')}
        ><wa-icon name="rocket" label="Templates"></wa-icon></wa-button>
        <wa-tooltip for="btn-templates" placement="right">${msg('Templates')}</wa-tooltip>

        <wa-button
          id="btn-help"
          appearance="plain"
          class=${this._active === 'help' ? 'active' : ''}
          @click=${() => this._select('help')}
        ><wa-icon name="circle-question" label="Help"></wa-icon></wa-button>
        <wa-tooltip for="btn-help" placement="right">${msg('Help')}</wa-tooltip>

        <wa-button
          id="btn-settings"
          appearance="plain"
          class=${this._active === 'settings' ? 'active' : ''}
          @click=${() => this._select('settings')}
        ><wa-icon name="gear" label="Settings"></wa-icon></wa-button>
        <wa-tooltip for="btn-settings" placement="right">${msg('Settings')}</wa-tooltip>
      </div>

      <panel-info ?hidden=${this._active !== 'info'}></panel-info>
    `;
  }

  // ── 2. State, Properties ──
  @property({ type: String }) active: MenuItem | null = 'code';

  @state() private _active: MenuItem | null = 'code';

  // ── 3. Lifecycle ──
  override updated(changed: Map<string, unknown>)
  {
    if (changed.has('active'))
    {
      this._active = this.active;
    }
  }

  // ── 4. Behaviour & Methods ──
  private _select(item: MenuItem)
  {
    this._active = this._active === item ? null : item;
    this.dispatchEvent(new CustomEvent('menu-select', {
      detail: this._active,
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
      padding-top: var(--space-sm);
      padding-bottom: var(--space-sm);
      flex-shrink: 0;
      background: var(--color-bg-elevated);
      border-right: 1px solid var(--color-border);
      align-items: center;
      gap: var(--space-1, 4px);
      position: relative;
      z-index: 20;
    }

    panel-info {
      position: absolute;
      top: 0;
      left: 100%;
      height: 100%;
      width: 320px;
      border-right: 1px solid var(--color-border);
      z-index: 20;
      box-shadow: var(--shadow-lg, 4px 0 16px rgba(0,0,0,0.15));
    }

    panel-info[hidden] {
      display: none;
    }

    .sections {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1, 4px);
      flex: 1;
      margin-top: var(--space-sm, 8px);
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
    'editor-main-menu': MainMenu;
  }
}
