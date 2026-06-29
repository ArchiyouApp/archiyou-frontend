import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { authService } from '../services/auth-service.js';

@customElement('page-login')
export class PageLogin extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <div class="card">
        <h1>Archiyou</h1>
        <p>${msg('Sign in to continue')}</p>
        <wa-button
          variant="brand"
          ?loading=${this._loading}
          @click=${this._handleLogin}
        >
          ${msg('Sign in')}
        </wa-button>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _loading = false;

  // ── 4. Behaviour & Methods ──
  private async _handleLogin()
  {
    this._loading = true;
    try
    {
      await authService.login();
    }
    catch
    {
      this._loading = false;
    }
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: var(--color-bg);
    }

    .card {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-8);
      text-align: center;
      max-width: 360px;
      width: 100%;
    }

    h1 {
      font-family: var(--font-sans);
      color: var(--color-text);
      margin: 0 0 var(--space-sm);
    }

    p {
      color: var(--color-text-muted);
      margin: 0 0 var(--space-6);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'page-login': PageLogin;
  }
}
