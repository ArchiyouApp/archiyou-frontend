import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import { Router } from '@vaadin/router';
import { msg } from '@lit/localize';
import { workspace, createScript } from '../state/workspace.js';

@customElement('page-workspace')
export class PageWorkspace extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const { scripts } = workspace.get();

    return html`
      <header>
        <h2>${msg('Workspace')}</h2>
        <wa-button variant="brand" @click=${this._newScript}>
          ${msg('New Script')}
        </wa-button>
      </header>

      ${scripts.length === 0
        ? html`<p class="empty">${msg('No scripts yet. Create your first one!')}</p>`
        : html`
          <div class="script-grid">
            ${scripts.map(s => html`
              <div class="script-card" @click=${() => Router.go(`/editor/${s.id}`)}>
                <strong>${s.name}</strong>
                <p>${new Date(s.updatedAt).toLocaleDateString()}</p>
              </div>
            `)}
          </div>
        `
      }
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _newScript()
  {
    const script = createScript();
    Router.go(`/editor/${script.id}`);
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: block;
      padding: var(--space-6);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-6);
    }

    h2 {
      margin: 0;
      font-family: var(--font-sans);
      color: var(--color-text);
    }

    .script-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--space-4);
    }

    .script-card {
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      cursor: pointer;
      transition: border-color 0.15s;
    }

    .script-card:hover {
      border-color: var(--color-primary);
    }

    .empty {
      color: var(--color-text-muted);
      margin-top: var(--space-8);
      text-align: center;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'page-workspace': PageWorkspace;
  }
}
