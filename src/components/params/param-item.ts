import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import type { ScriptParam } from '../../state/workspace.js';
import { toVariableName } from '../../state/workspace.js';

@customElement('param-item')
export class ParamItem extends LitElement
{
  @property({ attribute: false }) param!: ScriptParam;

  @state() private _editingLabel = false;
  @state() private _labelDraft = '';
  @state() private _confirmingDelete = false;

  private _dragLocked = false;

  // ── Render ──

  override render()
  {
    return html`
      <span class="grip" title="Drag to reorder">
        <wa-icon name="grip-lines"></wa-icon>
      </span>

      ${this._editingLabel
        ? html`
            <input
              class="label-input"
              .value=${this._labelDraft}
              @blur=${this._commitLabel}
              @keydown=${this._onLabelKeydown}
            />`
        : html`
            <span class="var-tag" title="use value with $${toVariableName(this.param.name)}">
              <wa-icon name="tag"></wa-icon>
            </span>
            <span class="label" @dblclick=${this._startEditLabel}>
              ${this.param.name}
            </span>`
      }

      <span class="param-slot"
        @pointerdown=${this._onSlotPointerDown}
        @pointerup=${this._onSlotPointerUp}
        @pointercancel=${this._onSlotPointerUp}
      >
        <slot></slot>
      </span>

      <span class="actions">
        ${this._confirmingDelete
          ? html`
              <span class="confirm-delete">
                <span class="confirm-label">Delete?</span>
                <button class="action-btn confirm-yes" title="Confirm delete"
                    @click=${this._confirmDelete}>
                  <wa-icon name="check"></wa-icon>
                </button>
                <button class="action-btn confirm-no" title="Cancel"
                    @click=${this._cancelDelete}>
                  <wa-icon name="xmark"></wa-icon>
                </button>
              </span>`
          : html`
              <button class="action-btn" title="Edit" @click=${this._handleEdit}>
                <wa-icon name="pen"></wa-icon>
              </button>
              <button class="action-btn danger" title="Delete"
                  @click=${this._handleDelete}>
                <wa-icon name="trash"></wa-icon>
              </button>`
        }
      </span>
    `;
  }

  // ── Lifecycle ──

  override connectedCallback()
  {
    super.connectedCallback();
    this.setAttribute('draggable', 'true');
    this.addEventListener('dragstart', this._onDragStart);
    this.addEventListener('dragend', this._onDragEnd);
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    this.removeEventListener('dragstart', this._onDragStart);
    this.removeEventListener('dragend', this._onDragEnd);
  }

  // ── Drag ──

  private _onDragStart = (e: DragEvent) =>
  {
    if (this._dragLocked) { e.preventDefault(); return; }
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', this.param.id);
    this.setAttribute('dragging', '');
    this._confirmingDelete = false;
  };

  private _onDragEnd = () => this.removeAttribute('dragging');

  private _onSlotPointerDown = () => { this._dragLocked = true; };
  private _onSlotPointerUp   = () => { this._dragLocked = false; };

  // ── Label editing ──

  private _startEditLabel()
  {
    this._labelDraft = this.param.name;
    this._editingLabel = true;
    this.updateComplete.then(() =>
    {
      this.renderRoot.querySelector<HTMLInputElement>('.label-input')?.focus();
    });
  }

  private _commitLabel()
  {
    this._editingLabel = false;
    const trimmed = this._labelDraft.trim();
    if (trimmed && trimmed !== this.param.name)
    {
      this.dispatchEvent(new CustomEvent<{ id: string; name: string }>('param-rename', {
        detail: { id: this.param.id, name: trimmed },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _onLabelKeydown(e: KeyboardEvent)
  {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') this._editingLabel = false;
    this._labelDraft = (e.target as HTMLInputElement).value;
  }

  // ── Actions ──

  private _handleEdit()
  {
    this.dispatchEvent(new CustomEvent<ScriptParam>('param-edit', {
      detail: this.param,
      bubbles: true,
      composed: true,
    }));
  }

  private _handleDelete()
  {
    this._confirmingDelete = true;
  }

  private _confirmDelete()
  {
    this.dispatchEvent(new CustomEvent<string>('param-delete', {
      detail: this.param.id,
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
      gap: 6px;
      padding: 4px 8px 4px 4px;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      cursor: default;
      user-select: none;
      position: relative;
    }

    :host(:hover) {
      background: color-mix(in srgb, var(--color-border) 20%, transparent);
    }

    :host([dragging]) { opacity: 0.4; }

    .grip {
      flex-shrink: 0;
      color: var(--color-gray-dark, #666);
      opacity: 0.35;
      cursor: grab;
      display: flex;
      align-items: center;
      font-size: 11px;
    }

    .grip:hover { opacity: 0.8; }

    .label {
      flex: 0 1 auto;
      color: var(--color-gray-dark, #555);
      font-size: var(--text-sm);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .label-input {
      flex: 1;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text);
      background: var(--color-bg, #fff);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm, 4px);
      padding: 1px 4px;
      min-width: 0;
      outline: none;
    }

    .var-tag {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: var(--color-gray-dark, #666);
      opacity: 0.35;
      font-size: 10px;
      cursor: default;
    }

    .var-tag:hover { opacity: 0.8; }

    .param-slot {
      flex: 1;
      min-width: 60px;
      display: flex;
      align-items: center;
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
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-gray-dark, #666);
      border-radius: var(--radius-sm, 4px);
      font-size: 11px;
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
    'param-item': ParamItem;
  }
}
