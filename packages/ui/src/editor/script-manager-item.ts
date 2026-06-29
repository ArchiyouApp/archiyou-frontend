import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import type { Script } from '../../../devlibs/archiyou-core-next/src/execution/Script';

@customElement('script-manager-item')
export class ScriptManagerItem extends LitElement
{
  @property({ attribute: false }) script!: Script;
  @property({ type: Boolean, reflect: true }) selected = false;

  @state() private _confirmingDelete = false;

  // ── Render ──

  override render()
  {
    const name      = this.script.name || 'untitled';
    const loc       = (this.script.code ?? '').split('\n').length;
    const fmt = (d: Date | undefined) => d
      ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : '';
    const created = fmt(this.script.created);
    const updated = fmt(this.script.updated);

    return html`
      <span class="icon">
        <wa-icon library="lucide" name="file-text"></wa-icon>
      </span>

      <span class="info">
        <span class="name">${name}</span>
        <span class="meta">${loc} lines · created ${created} · updated ${updated}</span>
      </span>

      <span class="actions" @click=${(e: Event) => e.stopPropagation()}>
        ${this._confirmingDelete
          ? html`
              <span class="confirm-delete">
                <span class="confirm-label">Delete?</span>
                <button class="action-btn confirm-yes" title="Confirm delete"
                    @click=${this._confirmDelete}>
                  <wa-icon library="lucide" name="check"></wa-icon>
                </button>
                <button class="action-btn confirm-no" title="Cancel"
                    @click=${this._cancelDelete}>
                  <wa-icon library="lucide" name="x"></wa-icon>
                </button>
              </span>`
          : html`
              <button class="action-btn danger" title="Delete"
                  @click=${this._handleDelete}>
                <wa-icon library="lucide" name="trash-2"></wa-icon>
              </button>`
        }
      </span>
    `;
  }

  // ── Lifecycle ──

  override connectedCallback()
  {
    super.connectedCallback();
    this.addEventListener('click', this._onRowClick);
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    this.removeEventListener('click', this._onRowClick);
  }

  // ── Actions ──

  private _onRowClick = () =>
  {
    this.dispatchEvent(new CustomEvent<string>('script-item-select', {
      detail: this.script.fileId,
      bubbles: true,
      composed: true,
    }));
  };

  private _handleDelete()
  {
    this._confirmingDelete = true;
  }

  private _confirmDelete()
  {
    this._confirmingDelete = false;
    this.dispatchEvent(new CustomEvent<string>('script-delete', {
      detail: this.script.fileId,
      bubbles: true,
      composed: true,
    }));
  }

  private _cancelDelete()
  {
    this._confirmingDelete = false;
  }

  // ── Styles ──

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      cursor: pointer;
      user-select: none;
    }

    :host(:hover) {
      background: color-mix(in srgb, var(--color-border) 25%, transparent);
    }

    :host([selected]) {
      background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    }

    :host([selected]):hover {
      background: color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    .icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: var(--color-gray-dark, #666);
      font-size: var(--text-lg);
    }

    :host([selected]) .icon {
      color: var(--color-primary);
    }

    .info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .name {
      color: var(--color-text);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta {
      font-size: var(--text-xs);
      color: var(--color-text-muted, var(--color-gray-dark, #666));
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.1s;
    }

    :host(:hover) .actions { opacity: 1; }
    :host .actions:has(.confirm-delete) { opacity: 1; }

    .action-btn {
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-gray-dark, #666);
      border-radius: var(--radius-sm, 4px);
      font-size: 12px;
    }

    .action-btn:hover {
      background: color-mix(in srgb, var(--color-border) 40%, transparent);
    }

    .action-btn.danger:hover { color: var(--color-alert); }

    /* ── Inline delete confirmation ── */

    .confirm-delete {
      display: flex;
      align-items: center;
      gap: 3px;
    }

    .confirm-label {
      font-size: var(--text-xs);
      color: var(--color-alert, #ef4444);
      font-weight: 500;
      white-space: nowrap;
    }

    .confirm-yes {
      color: var(--color-alert, #ef4444);
    }

    .confirm-yes:hover {
      background: color-mix(in srgb, var(--color-alert, #ef4444) 15%, transparent);
    }

    .confirm-no:hover {
      background: color-mix(in srgb, var(--color-border) 40%, transparent);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'script-manager-item': ScriptManagerItem;
  }
}
