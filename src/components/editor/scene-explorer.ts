import { LitElement, html, css, nothing } from 'lit';
import type { HTMLTemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import { sceneTree, hiddenNodes, toggleNodeVisibility, activeBottomPanel, setActiveBottomPanel } from '../../state/workspace.js';
import type { SceneNodeData } from '../../state/workspace.js';

const TYPE_ICON: Record<string, string> = {
  Mesh:          'cube',
  Group:         'layer-group',
  Object3D:      'layer-group',
  LineSegments:  'wave-square',
  LineSegments2: 'wave-square',
  Line2:         'wave-square',
  Line:          'wave-square',
  Points:        'circle-dot',
};

function nodeIcon(type: string): string
{
  return TYPE_ICON[type] ?? 'layer-group';
}

@customElement('scene-explorer')
export class SceneExplorer extends SignalWatcher(LitElement)
{
  @property({ type: Boolean }) standalone = false;

  @state() private _expandedNodes = new Set<string>();

  // Track tree root UUID to reset expansion when a new model loads
  private _knownRootUuid?: string;

  override render()
  {
    const collapsed = this.standalone ? false : activeBottomPanel.get() !== 'scene';
    if (!this.standalone) this.toggleAttribute('collapsed', collapsed);

    const tree   = sceneTree.get();
    const hidden = hiddenNodes.get();

    // Auto-expand everything when a new tree arrives
    if (tree && tree.uuid !== this._knownRootUuid)
    {
      this._knownRootUuid = tree.uuid;
      const expanded = new Set<string>();
      this._collectUuids(tree, expanded);
      this._expandedNodes = expanded;
    }

    return html`
      ${!this.standalone ? html`
        <div class="header" @click=${this._activate}>
          <wa-icon name="sitemap"></wa-icon>
          <span class="title">scene</span>
          <span class="spacer"></span>
          <wa-icon name=${collapsed ? 'chevron-down' : 'chevron-up'}></wa-icon>
        </div>
      ` : nothing}

      ${!collapsed ? html`
        <div class="tree">
          ${tree
            ? this._renderNode(tree, hidden, 0)
            : html`<div class="empty">No scene loaded</div>`
          }
        </div>
      ` : nothing}
    `;
  }

  private _renderNode(node: SceneNodeData, hidden: ReadonlySet<string>, depth: number): HTMLTemplateResult
  {
    const isHidden   = hidden.has(node.uuid);
    const hasKids    = node.children.length > 0;
    const isExpanded = this._expandedNodes.has(node.uuid);
    const mat        = node.material;

    return html`
      <div class="node-row" style="padding-left: ${depth * 14 + 6}px">
        <button
          class="expand-btn"
          ?disabled=${!hasKids}
          @click=${() => hasKids && this._toggleExpand(node.uuid)}
        >
          ${hasKids
            ? html`<wa-icon name=${isExpanded ? 'chevron-down' : 'chevron-right'}></wa-icon>`
            : nothing}
        </button>

        <wa-icon class="node-icon type-${node.type}" name=${nodeIcon(node.type)}></wa-icon>

        <span class="node-name ${isHidden ? 'faded' : ''}" title=${node.name}>${node.name}</span>

        ${mat?.color ? html`
          <span class="mat-swatch" style="background:${mat.color}" title="${mat.color}"></span>
        ` : nothing}
        ${mat && mat.opacity < 0.99 ? html`
          <span class="mat-opacity">${Math.round(mat.opacity * 100)}%</span>
        ` : nothing}

        <button
          class="vis-btn"
          title=${isHidden ? 'Show node' : 'Hide node'}
          @click=${() => toggleNodeVisibility(node.uuid)}
        >
          <wa-icon name=${isHidden ? 'eye-slash' : 'eye'}></wa-icon>
        </button>
      </div>

      ${isExpanded && hasKids
        ? node.children.map(c => this._renderNode(c, hidden, depth + 1))
        : nothing}
    `;
  }

  // ── State helpers ──

  private _activate = () =>
    setActiveBottomPanel(activeBottomPanel.get() === 'scene' ? 'none' : 'scene');

  private _toggleExpand(uuid: string)
  {
    const next = new Set(this._expandedNodes);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    this._expandedNodes = next;
  }

  private _collectUuids(node: SceneNodeData, set: Set<string>)
  {
    set.add(node.uuid);
    node.children.forEach(c => this._collectUuids(c, set));
  }

  // ── Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      border-top: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      overflow: hidden;
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

    .title {
      font-weight: 500;
      color: var(--color-text);
      font-size: var(--text-sm);
    }

    .spacer { flex: 1; }

    /* ── Tree ── */

    .tree {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 0;
    }

    .empty {
      padding: 0.5rem 1rem;
      color: var(--color-text-muted, #6b7280);
      font-size: var(--text-sm);
    }

    .node-row {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 26px;
      padding-right: 6px;
      cursor: default;
    }

    .node-row:hover {
      background: color-mix(in srgb, var(--color-border) 30%, transparent);
    }

    /* expand chevron */
    .expand-btn {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-gray-dark, #666);
      font-size: 10px;
    }

    .expand-btn:disabled {
      cursor: default;
      opacity: 0;
    }

    /* type icon */
    .node-icon {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--color-gray-dark, #666);
    }

    /* name */
    .node-name {
      flex: 1;
      font-size: 0.72rem;
      font-family: var(--font-mono, monospace);
      color: var(--color-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-name.faded { opacity: 0.35; }

    /* material swatch */
    .mat-swatch {
      flex-shrink: 0;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      border: 1px solid rgba(0,0,0,0.15);
    }

    .mat-opacity {
      flex-shrink: 0;
      font-size: 0.65rem;
      color: var(--color-text-muted, #6b7280);
    }

    /* visibility toggle */
    .vis-btn {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text, #111);
      font-size: 11px;
      opacity: 0;
      transition: opacity 0.1s;
    }

    .node-row:hover .vis-btn { opacity: 1; }
    .node-row .vis-btn[title="Show node"] { opacity: 0.5; }
    .node-row:hover .vis-btn[title="Show node"] { opacity: 1; }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'scene-explorer': SceneExplorer;
  }
}
