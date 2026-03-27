import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { msg } from '@lit/localize';
import { Router } from '@vaadin/router';
import { authService } from '../services/auth-service.js';
import { applyDarkTheme, removeDarkTheme, isDarkTheme } from '../styles/dark-theme.js';


@customElement('nav-bar')
export class NavBar extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <span class="brand" @click=${() => Router.go('/editor')}>
          <img src="img/ay_logo_white.png" alt="Archiyou">
      </span>

      <div class="spacer"></div>

      ${this._userName
        ? html`
            <span class="user">${this._userName}</span>
            <wa-button size="small" @click=${this._logout}>
              ${msg('Sign out')}
            </wa-button>
          `
        : html`
            <wa-button size="small" variant="brand" @click=${this._login}>
              ${msg('Sign in')}
            </wa-button>
          `}

      <wa-button appearance="plain" @click=${this._toggleTheme}>
        <wa-icon
          name=${this._dark ? 'sun' : 'moon'}
          label=${this._dark ? msg('Light mode') : msg('Dark mode')}
        ></wa-icon>
      </wa-button>
    `;
  }

  // ── 2. State ──
  @state() private _userName = '';
  @state() private _dark = false;

  // ── 3. Lifecycle ──
  override async connectedCallback()
  {
    super.connectedCallback();
    this._dark = isDarkTheme();
    const user = await authService.getUser();
    this._userName = user?.profile.name ?? user?.profile.email ?? '';
  }

  // ── 4. Behaviour & Methods ──
  private _toggleTheme()
  {
    if (isDarkTheme())
    {
      removeDarkTheme();
      this._dark = false;
    }
    else
    {
      applyDarkTheme();
      this._dark = true;
    }
  }

  private _login()
  {
    Router.go('/login');
  }

  private async _logout()
  {
    await authService.logout();
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      height: 56px;
      padding: 0 var(--space-4);
      background: var(--color-secondary);
      border-bottom: 1px solid var(--color-border);
      gap: var(--space-4);
    }

    .brand {
      display: flex;
      align-items: center;
      font-weight: 700;
      margin-left: 14px;
      font-size: 1.1rem;
      color: var(--color-primary);
      text-decoration: none;
      cursor: pointer;
    }

    .brand img {
      height: 32px;
    }

    .spacer { flex: 1; }

    .user {
      font-size: 0.875rem;
      color: var(--color-text-muted);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'nav-bar': NavBar;
  }
}
