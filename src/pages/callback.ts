import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { Router } from '@vaadin/router';
import { msg } from '@lit/localize';
import { authService } from '../services/auth-service.js';

@customElement('page-callback')
export class PageCallback extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--color-bg);
      color: var(--color-text);
    }
  `;

  override async connectedCallback() {
    super.connectedCallback();
    try {
      await authService.callback();
      Router.go('/');
    } catch (err) {
      console.error('OAuth callback failed', err);
      Router.go('/login');
    }
  }

  override render() {
    return html`<wa-spinner></wa-spinner><span>${msg('Signing in…')}</span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'page-callback': PageCallback;
  }
}
