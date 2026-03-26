/**
 * <app-shell> — top-level custom element.
 *
 * Responsibilities:
 *  - Provides the router outlet (<main id="outlet">)
 *  - Initialises @vaadin/router in firstUpdated()
 *  - Applies system dark-theme preference on startup
 *  - Initialises @lit/localize
 */

import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { initRouter } from './router.js';
import { applySystemTheme } from '../../styles/dark-theme.js';
import { setLocale, detectLocale } from '../../i18n/locale-config.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      font-family: var(--font-sans);
      background: var(--color-bg);
      color: var(--color-text);
    }

    main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
  `;

  override render() {
    return html`<main id="outlet"></main>`;
  }

  override firstUpdated() {
    applySystemTheme();

    // Initialise locale (best-effort — locale modules may not exist until lit-localize build)
    setLocale(detectLocale()).catch(() => {/* source locale, no module needed */});

    const outlet = this.renderRoot.querySelector<HTMLElement>('#outlet')!;
    initRouter(outlet);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
