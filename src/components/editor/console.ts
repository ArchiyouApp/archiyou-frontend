import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import { workspace } from '../../state/workspace.js';
import type { ConsoleMessageType } from '../../../devlibs/archiyou-core-next/src/console/types';

const MESSAGE_TYPES: ConsoleMessageType[] = ['error', 'exec', 'geom', 'user', 'warn', 'info'];

const ICON_MAP: Record<ConsoleMessageType, string> =
{
  info:  'circle-info',
  geom:  'draw-polygon',
  user:  'user',
  warn:  'triangle-exclamation',
  error: 'circle-xmark',
  exec:  'terminal',
};

const TYPE_LABEL: Record<ConsoleMessageType, string> =
{
  info:  'Info',
  geom:  'Geometry',
  user:  'User',
  warn:  'Warning',
  error: 'Error',
  exec:  'Execution',
};

@customElement('editor-console')
export class EditorConsole extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const messages = workspace.get().editor.result?.messages ?? [];

    const counts = Object.fromEntries(
      MESSAGE_TYPES.map(t => [t, messages.filter(m => m.type === t).length])
    ) as Record<ConsoleMessageType, number>;

    const filtered = messages.filter(m => this._activeFilters.has(m.type));

    return html`
      <div class="header">
        <wa-icon name="terminal"></wa-icon>
        <span class="title">
          Console
        </span>
        <span class="badge">${messages.length}</span>
        <span class="spacer"></span>
        <div class="filters">
          ${MESSAGE_TYPES.map(type => html`
            <button
              class="filter-btn type-${type} ${this._activeFilters.has(type) ? 'active' : ''}"
              @click=${() => this._toggleFilter(type)}
              title="${TYPE_LABEL[type]}: ${counts[type]}"
            >
              <wa-icon name=${ICON_MAP[type]}></wa-icon>
              <span class="count">${counts[type]}</span>
            </button>
          `)}
        </div>
        <button class="collapse-btn" @click=${this._toggleCollapse}
            title=${this._collapsed ? 'Expand console' : 'Collapse console'}>
          <wa-icon name=${this._collapsed ? 'chevron-up' : 'chevron-down'}></wa-icon>
        </button>
      </div>

      ${!this._collapsed ? html`
        <div class="messages">
          ${filtered.length === 0
            ? html`<div class="empty">No messages</div>`
            : filtered.map(m => html`
                <div class="message type-${m.type}">
                  <wa-icon class="msg-icon" name=${ICON_MAP[m.type]}></wa-icon>
                  <span class="msg-text">${m.message}</span>
                  <span class="msg-time">${m.time}</span>
                </div>
              `)
          }
        </div>
      ` : ''}
    `;
  }

  // ── 2. State ──
  @state() private _activeFilters: Set<ConsoleMessageType> = new Set(MESSAGE_TYPES);

  // ── 4. Behaviour & Methods ──
  private _toggleFilter(type: ConsoleMessageType)
  {
    const next = new Set(this._activeFilters);
    if (next.has(type)) { next.delete(type); }
    else { next.add(type); }
    this._activeFilters = next;
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      border-top: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      overflow: hidden;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    /* ── Header ── */

    .header {
      display: flex;
      align-items: center;
      gap: var(--space-2, 8px);
      padding: 0.35rem 1rem;
      flex-shrink: 0;
      user-select: none;
      background: var(--color-gray);
    }

    .title {
      font-weight: 500;
      color: var(--color-text);
      font-size: var(--text-sm);
    }

    /* total message count */
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: var(--space-xl);
      height: var(--space-xl);
      border-radius: var(--radius-full);
      background: var(--color-alert);
      color: var(--color-white);
      font-size: var(--text-xxs);
      line-height: 1;
    }

    /* Collapse button */
    .collapse-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: var(--radius-full);
      background: transparent;
      border: none;
      color: var(--color-dark-gray);
      cursor: pointer;
    }

    .spacer { flex: 1; }

    /* ── Filter buttons ── */

    .filters {
      display: flex;
      gap: var(--space-2, 8px);
    }

    .filter-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 5px;
      border: 1px solid transparent;
      border-radius: var(--radius-full);
      background: transparent;
      cursor: pointer;
      font-size: var(--text-sm);
      transition: opacity 0.12s, background 0.12s;
      opacity: 0.35;
    }

    .filter-btn.active {
      opacity: 1;
      background: color-mix(in srgb, currentColor 10%, transparent);
      border-color: color-mix(in srgb, currentColor 25%, transparent);
    }

    .filter-btn:hover {
      opacity: 1;
    }

    .filter-btn .count {
      font-weight: 600;
    }

    /* Per-type accent colors via currentColor */
    .filter-btn.type-info  { color: #3b82f6; }
    .filter-btn.type-geom  { color: #14b8a6; }
    .filter-btn.type-user  { color: #a855f7; }
    .filter-btn.type-warn  { color: #f59e0b; }
    .filter-btn.type-error { color: #ef4444; }
    .filter-btn.type-exec  { color: #6b7280; }

    /* ── Message list ── */

    .messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding-bottom: 0.3rem;
    }

    /** No messages (yet) */
    .empty {
      padding: 0.5rem 1rem;
      color: var(--color-text);
      font-size: var(--text-md);
    }

    .message {
      display: flex;
      align-items: baseline;
      gap: var(--space-2, 8px);
      padding: 0.18rem 1rem;
      font-size: 0.72rem;
      font-family: var(--font-mono, monospace);
      border-left: 2px solid transparent;
    }

    .message:hover {
      background: color-mix(in srgb, var(--color-border) 25%, transparent);
    }

    /* Highlighted rows for warnings and errors */
    .message.type-warn  { border-left-color: #f59e0b; background: color-mix(in srgb, #f59e0b 6%, transparent); }
    .message.type-error { border-left-color: #ef4444; background: color-mix(in srgb, #ef4444 6%, transparent); }

    /* Per-type icon colors */
    .message.type-info  .msg-icon { color: #3b82f6; }
    .message.type-geom  .msg-icon { color: #14b8a6; }
    .message.type-user  .msg-icon { color: #a855f7; }
    .message.type-warn  .msg-icon { color: #f59e0b; }
    .message.type-error .msg-icon { color: #ef4444; }
    .message.type-exec  .msg-icon { color: #6b7280; }

    .msg-icon {
      flex-shrink: 0;
      font-size: 0.75rem;
    }

    .msg-text {
      flex: 1;
      color: var(--color-text);
      white-space: pre-wrap;
      word-break: break-all;
    }

    .msg-time {
      flex-shrink: 0;
      color: var(--color-text-muted, #6b7280);
      font-size: var(--text-xs);
      color: var(--color-gray-dark);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-console': EditorConsole;
  }
}
