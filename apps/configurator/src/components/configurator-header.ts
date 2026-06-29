import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import { editorScript } from '../../state/workspace.js';

@customElement('configurator-header')
export class ConfiguratorHeader extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const script = editorScript.get();
    const name    = script?.published?.title ?? script?.name ?? 'Untitled';
    const author  = script?.author ?? '—';
    const version = script?.published?.version ?? '—';

    return html`
      <div class="header">
        <span class="name">${name}</span>
        <div class="meta">
          <span class="author">${author}</span>
          <span class="version">${version}</span>
        </div>
      </div>
    `;
  }

  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: block;
      padding: var(--space-md) var(--space-lg);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    .header
    {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-sm);
    }

    .name
    {
      font-family: var(--font-sans);
      font-size: var(--text-base);
      font-weight: 600;
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .meta
    {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex-shrink: 0;
      gap: 1px;
    }

    .author
    {
      font-family: var(--font-sans);
      font-size: var(--text-xs);
      color: var(--color-text-muted, #888);
    }

    .version
    {
      font-family: var(--font-mono, monospace);
      font-size: var(--text-xs);
      color: var(--color-primary);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'configurator-header': ConfiguratorHeader;
  }
}
