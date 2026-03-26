/**
 * <layout-main> — authenticated application shell layout.
 *
 * Renders the top navigation bar above a <slot> for child page content.
 * This component is the parent route component for all guarded routes.
 */

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import '../components/nav-bar.js';

@customElement('layout-main')
export class LayoutMain extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    nav-bar {
      flex-shrink: 0;
    }

    .content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `;

  override render() {
    return html`
      <nav-bar></nav-bar>
      <div class="content">
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'layout-main': LayoutMain;
  }
}
