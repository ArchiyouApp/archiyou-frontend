import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '../menu-badge.js';

import {
  scriptPresets,
  presetMenuCollapsed,
  setPresetMenuCollapsed,
  deletePreset,
  renamePreset,
  activatePreset,
} from '../../state/workspace';

import type { ScriptPreset } from '../../state/workspace';

@customElement('presets-menu')
export class PresetsMenu extends SignalWatcher(LitElement)
{
  @state() private _renamingPreset: string | null = null;
  @state() private _renameDraft = '';
  @state() private _deletingPreset: string | null = null;
  @state() private _badgeFlashing = false;

  private _prevCount = 0;
  private _flashTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Render ──

  override render()
  {
    const collapsed = presetMenuCollapsed.get();
    this.toggleAttribute('collapsed', collapsed);

    const presets = scriptPresets.get();
    const count = presets.length;

    return html`
      <div class="header" @click=${this._toggleCollapse}>
        <wa-icon name="bookmark"></wa-icon>
        <span class="title">presets</span>
        ${count > 0 ? html`
          <menu-badge .value=${count} .attention=${this._badgeFlashing}></menu-badge>
        ` : nothing}
        <span class="spacer"></span>
        <wa-icon name=${collapsed ? 'chevron-down' : 'chevron-up'}></wa-icon>
      </div>

      ${!collapsed ? html`
        <div class="preset-list">
          ${presets.length === 0
            ? html`<div class="empty-list">No presets — save one from the Parameters panel</div>`
            : presets.map(p => this._renderPresetRow(p))
          }
        </div>
      ` : nothing}
    `;
  }

  // ── Lifecycle ──

  override updated()
  {
    const count = scriptPresets.get().length;
    if (count > this._prevCount)
    {
      this._triggerBadgeFlash();
    }
    this._prevCount = count;
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    if (this._flashTimer !== null) clearTimeout(this._flashTimer);
  }

  private _triggerBadgeFlash()
  {
    if (this._flashTimer !== null) clearTimeout(this._flashTimer);
    this._badgeFlashing = true;
    this._flashTimer = setTimeout(() =>
    {
      this._badgeFlashing = false;
      this._flashTimer = null;
    }, 1200);
  }

  // ── Row rendering ──

  private _renderPresetRow(preset: ScriptPreset)
  {
    const isRenaming = preset.name === this._renamingPreset;
    const isDeleting = preset.name === this._deletingPreset;

    return html`
      <div class="preset-row">
        <wa-icon class="preset-icon" name="bookmark"></wa-icon>

        ${isRenaming
          ? html`
              <input
                class="name-input"
                .value=${this._renameDraft}
                @blur=${this._commitRename}
                @keydown=${this._onRenameKeydown}
                @click=${(e: Event) => e.stopPropagation()}
                @input=${(e: InputEvent) =>
                  (this._renameDraft = (e.target as HTMLInputElement).value)}
              />`
          : html`
              <span
                class="preset-name"
                @dblclick=${(e: Event) => { e.stopPropagation(); this._startRename(preset.name); }}
              >${preset.name}</span>`
        }

        <span class="spacer"></span>

        ${isDeleting
          ? html`
              <span class="confirm-label">Delete?</span>
              <button class="action-btn confirm-yes" title="Confirm delete"
                  @click=${(e: Event) => { e.stopPropagation(); this._confirmDelete(preset.name); }}>
                <wa-icon name="check"></wa-icon>
              </button>
              <button class="action-btn" title="Cancel"
                  @click=${(e: Event) => { e.stopPropagation(); this._deletingPreset = null; }}>
                <wa-icon name="xmark"></wa-icon>
              </button>`
          : html`
              <button class="action-btn activate-btn" title="Apply preset"
                  @click=${(e: Event) => { e.stopPropagation(); activatePreset(preset.name); }}>
                <wa-icon name="play"></wa-icon>
                Apply
              </button>
              <button class="action-btn danger" title="Delete preset"
                  @click=${(e: Event) => { e.stopPropagation(); this._deletingPreset = preset.name; }}>
                <wa-icon name="trash"></wa-icon>
              </button>`
        }
      </div>
    `;
  }

  // ── Rename ──

  private _startRename(name: string)
  {
    this._renamingPreset = name;
    this._renameDraft = name;
    this.updateComplete.then(() =>
    {
      this.renderRoot.querySelector<HTMLInputElement>('.name-input')?.select();
    });
  }

  private _commitRename()
  {
    const oldName = this._renamingPreset;
    const newName = this._renameDraft.trim();
    this._renamingPreset = null;

    if (!oldName || !newName || newName === oldName) return;

    const exists = scriptPresets.get().some(pr => pr.name === newName);
    if (exists) return;

    renamePreset(oldName, newName);
  }

  private _onRenameKeydown(e: KeyboardEvent)
  {
    e.stopPropagation();
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') this._renamingPreset = null;
  }

  // ── Delete ──

  private _confirmDelete(name: string)
  {
    this._deletingPreset = null;
    deletePreset(name);
  }

  // ── Collapse ──

  private _toggleCollapse()
  {
    setPresetMenuCollapsed(!presetMenuCollapsed.get());
  }

  // ── Styles ──

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      background: var(--color-bg-elevated);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
      overflow: visible;
    }

    *,
    *::before,
    *::after { box-sizing: border-box; }

    /* ── Header ── */

    .header {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: 0.35rem 1rem;
      flex-shrink: 0;
      user-select: none;
      cursor: pointer;
      background: var(--color-gray);
      border-bottom: 1px solid var(--color-border);
    }

    :host([collapsed]) .header {
      border-bottom: none;
    }

    .title {
      font-weight: 500;
      color: var(--color-text);
      font-size: var(--text-sm);
    }

    .spacer { flex: 1; }

    /* ── Preset list ── */

    .preset-list {
      flex-shrink: 0;
      max-height: 180px;
      overflow-y: auto;
    }

    .empty-list {
      padding: 10px 16px;
      color: var(--color-text-gray);
      font-size: var(--text-xs);
    }

    /* ── Row ── */

    .preset-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px 4px 10px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      user-select: none;
    }

    .preset-row:hover {
      background: color-mix(in srgb, var(--color-border) 20%, transparent);
    }

    .preset-icon {
      flex-shrink: 0;
      color: var(--color-gray-dark, #666);
      opacity: 0.35;
      font-size: 11px;
    }

    .preset-name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--text-sm);
      color: var(--color-gray-dark, #555);
      cursor: default;
    }

    .name-input {
      flex: 1;
      min-width: 0;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text);
      background: var(--color-bg, #fff);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm, 4px);
      padding: 1px 4px;
      outline: none;
    }

    /* ── Action buttons ── */

    .action-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 6px;
      border: none;
      background: transparent;
      cursor: pointer;
      border-radius: var(--radius-sm, 4px);
      color: var(--color-gray-dark, #666);
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.1s;
    }

    .preset-row:hover .action-btn { opacity: 1; }
    .preset-row:has(.confirm-label) .action-btn { opacity: 1; }

    .action-btn:hover {
      background: color-mix(in srgb, var(--color-border) 40%, transparent);
    }

    .activate-btn {
      font-weight: 500;
      color: var(--color-primary);
    }

    .activate-btn:hover {
      background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }

    .action-btn.danger:hover { color: var(--color-alert); }

    /* ── Delete confirmation ── */

    .confirm-label {
      font-size: var(--text-xs);
      color: var(--color-alert, #ef4444);
      font-weight: 500;
      white-space: nowrap;
    }

    .confirm-yes { color: var(--color-alert, #ef4444); }
    .confirm-yes:hover {
      background: color-mix(in srgb, var(--color-alert, #ef4444) 15%, transparent) !important;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'presets-menu': PresetsMenu;
  }
}
