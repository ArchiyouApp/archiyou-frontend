import { LitElement, html, css, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import { scripts, editorScript } from '../../state/workspace.js';
import { OVERLAY_MENU_WIDTH, OVERLAY_MENU_HEIGHT } from '../../settings.js';

import './script-manager-item.js';

@customElement('script-manager')
export class ScriptManager extends SignalWatcher(LitElement)
{
  @property({ type: Boolean, reflect: true }) open = false;

  @state() private _selectedFileId: string | null = null;

  // ── Render ──

  override render()
  {
    if (!this.open) return nothing;

    // Exclude the currently-active script — opening it would be a no-op.
    const activeFileId = editorScript.get()?.fileId ?? null;
    const list = scripts.get().filter(s => s.fileId !== activeFileId);

    return html`
      <div class="backdrop" @click=${this._cancel}></div>
      <div class="dialog" role="dialog" aria-modal="true"
           @click=${(e: Event) => e.stopPropagation()}>

        <div class="dialog-header">
          <wa-icon library="lucide" name="folder-open"></wa-icon>
          <span>Open Script</span>
          <button class="close-btn" @click=${this._cancel}>
            <wa-icon library="lucide" name="x"></wa-icon>
          </button>
        </div>

        <div class="dialog-body">
          ${list.length === 0
            ? html`<div class="empty">No other scripts yet.</div>`
            : list.map(s => html`
                <script-manager-item
                  .script=${s}
                  ?selected=${this._selectedFileId === s.fileId}
                  @script-item-select=${this._onSelect}
                  @script-delete=${this._onDelete}
                ></script-manager-item>`)
          }
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary" @click=${this._cancel}>Cancel</button>
          <button class="btn-primary"
              ?disabled=${this._selectedFileId === null}
              @click=${this._open}>
            Open
          </button>
        </div>
      </div>
    `;
  }

  // ── Lifecycle ──

  override updated(changed: Map<string, unknown>)
  {
    if (changed.has('open') && this.open)
    {
      // No default selection — the active script is filtered out of the list,
      // and we shouldn't preselect something the user didn't ask for.
      this._selectedFileId = null;
    }
  }

  // ── Behaviour ──

  private _onSelect(e: CustomEvent<string>)
  {
    this._selectedFileId = e.detail;
  }

  private _onDelete(e: CustomEvent<string>)
  {
    // Parent handles the actual deletion (calls deleteScriptById).
    if (this._selectedFileId === e.detail) this._selectedFileId = null;
    // Re-dispatch as-is so the editor catches it.
    // (The event already bubbles/composes through the parent.)
  }

  private _open()
  {
    if (this._selectedFileId === null) return;
    this.dispatchEvent(new CustomEvent<string>('script-manager-open', {
      detail: this._selectedFileId,
      bubbles: true,
      composed: true,
    }));
  }

  private _cancel()
  {
    this.dispatchEvent(new CustomEvent('script-manager-cancel', {
      bubbles: true,
      composed: true,
    }));
  }

  // ── Styles ──

  static override styles = css`
    :host { display: contents; }

    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      z-index: 200;
    }

    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 201;
      width: ${unsafeCSS(OVERLAY_MENU_WIDTH)};
      max-width: calc(100vw - 32px);
      max-height: ${unsafeCSS(OVERLAY_MENU_HEIGHT)};
      background: var(--color-bg-elevated, #fff);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg, 12px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      font-family: var(--font-sans);
      overflow: hidden;
    }

    /* ── Header ── */

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border);
      font-weight: 500;
      font-size: var(--text-sm);
      color: var(--color-text);
      flex-shrink: 0;
    }

    .close-btn {
      margin-left: auto;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-gray-dark, #666);
      border-radius: var(--radius-sm, 4px);
    }

    .close-btn:hover {
      background: color-mix(in srgb, var(--color-border) 40%, transparent);
    }

    /* ── Body ── */

    .dialog-body {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      flex: 1;
    }

    .empty {
      padding: 24px 16px;
      text-align: center;
      color: var(--color-text-muted, var(--color-gray-dark, #666));
      font-size: var(--text-sm);
    }

    /* ── Footer ── */

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid var(--color-border);
      flex-shrink: 0;
    }

    .btn-primary,
    .btn-secondary {
      padding: 7px 16px;
      border-radius: var(--radius-sm, 4px);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: 500;
      cursor: pointer;
      border: none;
    }

    .btn-primary {
      background: var(--color-primary);
      color: var(--color-white, #fff);
    }

    .btn-primary:hover:not(:disabled) { opacity: 0.88; }
    .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

    .btn-secondary {
      background: transparent;
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }

    .btn-secondary:hover {
      background: color-mix(in srgb, var(--color-border) 30%, transparent);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'script-manager': ScriptManager;
  }
}
