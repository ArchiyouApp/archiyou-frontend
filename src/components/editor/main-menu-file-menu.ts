import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { msg } from '@lit/localize';

import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';

@customElement('editor-main-menu-file-menu')
export class MainMenuFileMenu extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <wa-dropdown placement="bottom-start" @wa-select=${this._handleSelect}>

        <!-- hamburger button -->
        <wa-button slot="trigger" appearance="plain" class="trigger">
            <wa-icon library="lucide" name="menu" label="Menu"></wa-icon>
        </wa-button>

        <wa-dropdown-item value="new">${msg('New')}</wa-dropdown-item>
        <wa-dropdown-item value="open">${msg('Open file browser')}</wa-dropdown-item>
        <wa-dropdown-item value="save">${msg('Save')}</wa-dropdown-item>

        <wa-divider></wa-divider>

        <wa-dropdown-item value="export">
          ${msg('Export to...')}
          <wa-dropdown-item slot="submenu" value="export-gltf">GLTF</wa-dropdown-item>
          <wa-dropdown-item slot="submenu" value="export-stl">STL</wa-dropdown-item>
          <wa-dropdown-item slot="submenu" value="export-obj">OBJ</wa-dropdown-item>
        </wa-dropdown-item>

        <wa-dropdown-item value="share">
          ${msg('Share script')}
        </wa-dropdown-item>

        <wa-divider></wa-divider>

        <wa-dropdown-item value="changelog">
          <wa-icon slot="icon" library="lucide" name="layers"></wa-icon>
          ${msg('Changelog')}
        </wa-dropdown-item>

        <wa-dropdown-item value="support">
          <wa-icon slot="icon" library="lucide" name="circle-help"></wa-icon>
          ${msg('Support')}
        </wa-dropdown-item>

        <wa-dropdown-item value="api">
          <wa-icon slot="icon" library="lucide" name="box"></wa-icon>
          ${msg('API')}
        </wa-dropdown-item>

        <wa-divider></wa-divider>

        <wa-dropdown-item value="vscode">
          <wa-icon slot="icon" src="/img/vscode.svg"></wa-icon>
          ${msg('Open in VS Code')}
        </wa-dropdown-item>
      </wa-dropdown>
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _handleSelect(e: CustomEvent)
  {
    const value = (e.detail.item as { value: string }).value;
    this.dispatchEvent(new CustomEvent('menu-action', {
      detail: value,
      bubbles: true,
      composed: true,
    }));
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: contents;
    }

    wa-dropdown {
      --wa-color-surface-raised: var(--color-secondary, #180c2d);
      --wa-color-surface-border: color-mix(in srgb, var(--color-secondary, #180c2d) 60%, white);
      --wa-color-text-normal: var(--color-white, #ffffff);
      --wa-color-text-quiet: color-mix(in srgb, white 60%, transparent);
      --wa-color-neutral-fill-normal: color-mix(in srgb, var(--color-secondary, #180c2d) 70%, white);
      --wa-color-neutral-on-quiet: var(--color-white, #ffffff);
      --wa-font-size-m: var(--text-sm, 0.875rem);
    }

    wa-dropdown::part(menu) {
      background-color: var(--color-secondary, #180c2d);
      border-color: color-mix(in srgb, var(--color-secondary, #180c2d) 60%, white);
    }

    wa-button.trigger {
      --wa-color-text-normal: var(--color-primary, #004be3) !important;
      --wa-font-size-m: var(--text-base, 1rem);
    }

    wa-button.trigger::part(base) {
      color: var(--color-primary, #004be3);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-main-menu-file-menu': MainMenuFileMenu;
  }
}
