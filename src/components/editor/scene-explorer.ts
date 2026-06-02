import { LitElement, html, css, nothing } from 'lit';
import type { HTMLTemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import { buildScenegraphPath, scenegraph, toggleNodeVisibility, activeBottomPanel, setActiveBottomPanel, selectedPath, setSelectedPath } from '../../state/workspace.js';
import type { SmartSceneNodeData } from '../../../devlibs/archiyou-core-next/src/modeler/types.js';

/** Pick a row icon by node kind. Layer/group nodes have no held shape;
 *  Mesh/Curve nodes show their geometry icon. */
function nodeIcon(node: SmartSceneNodeData): string
{
  if (!node.shape) return 'layer-group'; // container / layer
  // Children-bearing leaf nodes are uncommon; default to cube for shapes.
  return 'cube';
}

@customElement('scene-explorer')
export class SceneExplorer extends SignalWatcher(LitElement)
{
  @property({ type: Boolean }) standalone = false;

  /** Path keys (slash-joined) of expanded rows. */
  @state() private _expandedNodes = new Set<string>();

  /** Track which tree we've seeded expansion for; reset on new tree identity. */
  private _knownTree?: SmartSceneNodeData;

  override render()
  {
    const collapsed = this.standalone ? false : activeBottomPanel.get() !== 'scene';
    if (!this.standalone) this.toggleAttribute('collapsed', collapsed);

    const tree = scenegraph.get();

    // Auto-expand everything when a new tree arrives. Identity is the root
    // reference — `reconcileScenegraph` returns a fresh clone on every run.
    if (tree && tree !== this._knownTree)
    {
      this._knownTree = tree;
      const expanded = new Set<string>();
      this._collectPaths(tree, '', expanded);
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
            ? this._renderNode(tree, '', 0)
            : html`<div class="empty">No scene loaded</div>`
          }
        </div>
      ` : nothing}
    `;
  }

  private _renderNode(node: SmartSceneNodeData, parentPath: string, depth: number): HTMLTemplateResult
  {
    const path       = buildScenegraphPath(parentPath, node.name);
    const isHidden   = node.style.visible === false;
    const hasKids    = node.children.length > 0;
    const isExpanded = this._expandedNodes.has(path);
    const isSelected = selectedPath.get() === path;
    const color      = node.style.color;
    const opacity    = node.style.opacity;

    return html`
      <div class="node-row ${isSelected ? 'selected' : ''}" style="padding-left: ${depth * 14 + 6}px">
        <button
          class="expand-btn"
          ?disabled=${!hasKids}
          @click=${() => hasKids && this._toggleExpand(path)}
        >
          ${hasKids
            ? html`<wa-icon name=${isExpanded ? 'chevron-down' : 'chevron-right'}></wa-icon>`
            : nothing}
        </button>

        <wa-icon class="node-icon" name=${nodeIcon(node)}></wa-icon>

        <span
          class="node-name ${isHidden ? 'faded' : ''}"
          title=${node.name}
          @click=${() => this._select(path)}
        >${node.name}</span>

        ${color ? html`
          <span class="mat-swatch" style="background:${color}" title=${color}></span>
        ` : nothing}
        ${typeof opacity === 'number' && opacity < 0.99 ? html`
          <span class="mat-opacity">${Math.round(opacity * 100)}%</span>
        ` : nothing}

        <button
          class="vis-btn"
          title=${isHidden ? 'Show node' : 'Hide node'}
          @click=${() => toggleNodeVisibility(path)}
        >
          <wa-icon name=${isHidden ? 'eye-slash' : 'eye'}></wa-icon>
        </button>
      </div>

      ${isExpanded && hasKids
        ? node.children.map(c => this._renderNode(c, path, depth + 1))
        : nothing}
    `;
  }

  // ── State helpers ──

  private _activate = () =>
    setActiveBottomPanel(activeBottomPanel.get() === 'scene' ? 'none' : 'scene');

  /** Select this node (toggles off if already selected). Drives the viewer
   *  highlight and, for onClick shapes, the re-run. */
  private _select(path: string)
  {
    setSelectedPath(selectedPath.get() === path ? null : path);
  }

  private _toggleExpand(path: string)
  {
    const next = new Set(this._expandedNodes);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this._expandedNodes = next;
  }

  private _collectPaths(node: SmartSceneNodeData, parentPath: string, set: Set<string>)
  {
    const path = buildScenegraphPath(parentPath, node.name);
    set.add(path);
    node.children.forEach(c => this._collectPaths(c, path, set));
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

    .node-row.selected {
      background: color-mix(in srgb, var(--color-primary, #3b82f6) 22%, transparent);
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
      cursor: pointer;
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
