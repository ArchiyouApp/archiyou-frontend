import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { Router } from '@vaadin/router';
import { msg } from '@lit/localize';
import { authService } from '../services/auth-service.js';
import { pullUserScripts } from '../services/scripts-sync.js';

type Mode = 'login' | 'register';

@customElement('page-login')
export class PageLogin extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    const isRegister = this._mode === 'register';
    return html`
      <div class="card">
        <h1>Archiyou</h1>
        <p>${isRegister ? msg('Create your account') : msg('Sign in to continue')}</p>

        <form @submit=${this._handleSubmit}>
          ${isRegister
            ? html`<input class="field" type="text" placeholder=${msg('Name (optional)')}
                     .value=${this._name} @input=${(e: Event) => (this._name = (e.target as HTMLInputElement).value)} />`
            : null}
          <input class="field" type="email" required placeholder=${msg('Email')}
                 .value=${this._email} @input=${(e: Event) => (this._email = (e.target as HTMLInputElement).value)} />
          <input class="field" type="password" required minlength="8" placeholder=${msg('Password')}
                 .value=${this._password} @input=${(e: Event) => (this._password = (e.target as HTMLInputElement).value)} />

          ${this._error ? html`<div class="error">${this._error}</div>` : null}

          <wa-button variant="brand" type="submit" ?loading=${this._loading} style="width:100%"
            @click=${this._handleSubmit}>
            ${isRegister ? msg('Create account') : msg('Sign in')}
          </wa-button>
        </form>

        <div class="divider"><span>${msg('or')}</span></div>

        <wa-button variant="neutral" style="width:100%" @click=${this._handleGoogle}>
          ${msg('Continue with Google')}
        </wa-button>

        <button class="switch" @click=${this._toggleMode}>
          ${isRegister
            ? msg('Already have an account? Sign in')
            : msg("Don't have an account? Create one")}
        </button>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _loading = false;
  @state() private _mode: Mode = 'login';
  @state() private _email = '';
  @state() private _password = '';
  @state() private _name = '';
  @state() private _error: string | null = null;

  // ── 4. Behaviour & Methods ──
  private _toggleMode()
  {
    this._mode = this._mode === 'login' ? 'register' : 'login';
    this._error = null;
  }

  private async _handleSubmit(e: Event)
  {
    // Handles both the form's `submit` (Enter key) and the button's `click`.
    // wa-button doesn't reliably submit the light-DOM form, so we drive it from
    // the click too; guard against a double-fire when both events arrive.
    e.preventDefault();
    if (this._loading) return;
    this._loading = true;
    this._error = null;
    try
    {
      if (this._mode === 'register')
        await authService.register(this._email, this._password, this._name || undefined);
      else
        await authService.login(this._email, this._password);

      await pullUserScripts();
      Router.go('/');
    }
    catch (err)
    {
      this._error = err instanceof Error ? err.message : msg('Sign in failed');
      this._loading = false;
    }
  }

  private _handleGoogle()
  {
    authService.loginWithGoogle();
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

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3, 0.75rem);
      margin-bottom: var(--space-4, 1rem);
    }

    .field {
      width: 100%;
      box-sizing: border-box;
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 6px);
      background: var(--color-bg);
      color: var(--color-text);
      font: inherit;
    }
    .field:focus { outline: 2px solid var(--color-brand, #4f46e5); outline-offset: 1px; }

    .error {
      color: var(--color-danger, #dc2626);
      font-size: 0.85rem;
      text-align: left;
    }

    .divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--color-text-muted);
      font-size: 0.8rem;
      margin: var(--space-4, 1rem) 0;
    }
    .divider::before, .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border);
    }

    .switch {
      margin-top: var(--space-4, 1rem);
      background: none;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font: inherit;
      font-size: 0.85rem;
      text-decoration: underline;
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
