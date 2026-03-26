import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { applySystemTheme } from '../../styles/dark-theme.js';
import '../../components/viewer-3d.js';

@customElement('viewer-shell')
export class ViewerShell extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: var(--color-bg);
    }

    viewer-3d {
      width: 100%;
      height: 100%;
    }
  `;

  override firstUpdated() {
    applySystemTheme();
  }

  override render() {
    return html`<viewer-3d></viewer-3d>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'viewer-shell': ViewerShell;
  }
}
