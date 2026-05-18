import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { SignalWatcher } from '@lit-labs/signals';

import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';

import '@awesome.me/webawesome/dist/components/select/select.js';
import '@awesome.me/webawesome/dist/components/option/option.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';

import { editorState } from '../../../state/workspace.js';

type SvgMap = Record<string, string>;

@customElement('editor-document-tool')
export class EditorDocumentTool extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const result = editorState.get().result;

    if (!result)
    {
      return this._renderEmpty('file-text', 'Run the script to see documents');
    }

    const svgMap = this._buildSvgMap();
    const docNames = Object.keys(svgMap);

    if (docNames.length === 0)
    {
      return this._renderEmpty('file-text', 'No documents in this script');
    }

    const selected = this._resolveSelected(docNames);
    const svg = this._stripProlog(svgMap[selected] ?? '');

    return html`
      <div class="toolbar">
        <wa-select
          class="doc-select"
          size="small"
          .value=${selected}
          @wa-change=${(e: Event) =>
          {
            this._selectedDoc = ((e.target as HTMLElement & { value: string }).value);
          }}
        >
          ${docNames.map(name => html`<wa-option value=${name}>${name}</wa-option>`)}
        </wa-select>
        ${this._docSize
          ? html`<span class="doc-size">${this._docSize}</span>`
          : ''}
        <span class="spacer"></span>
        <wa-button class="reset-btn" size="small" appearance="plain" @click=${this._resetView} title="Reset view">
          <wa-icon library="lucide" name="crosshair" label="Reset view"></wa-icon>
        </wa-button>
      </div>
      <div class="svg-stage">
        <div class="svg-wrapper">${unsafeHTML(svg)}</div>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _selectedDoc: string | null = null;
  @state() private _docSize: string | null = null;
  @query('.svg-wrapper') private _svgWrapper!: HTMLElement;
  @query('.doc-select') private _select!: HTMLElement & { value: string };

  private _panzoom: PanzoomObject | null = null;
  private _pzEl: HTMLElement | null = null;
  private _renderedKey = '';

  // ── 3. Lifecycle ──
  override updated()
  {
    const svgMap = this._buildSvgMap();
    const docNames = Object.keys(svgMap);
    if (docNames.length === 0) return;

    const selected = this._resolveSelected(docNames);

    // Keep wa-select in sync (its value can lag the slotted options on first paint)
    if (this._select && this._select.value !== selected)
    {
      this._select.value = selected;
    }

    // Re-init pan/zoom + size readout only when the rendered SVG actually changed
    const key = `${selected}:${(svgMap[selected] ?? '').length}`;
    if (key === this._renderedKey) return;
    this._renderedKey = key;

    this._destroyPanzoom();

    const wrapperEl = this._svgWrapper;
    const svgEl = wrapperEl?.querySelector('svg') as SVGElement | null;
    if (!wrapperEl || !svgEl) return;

    this._docSize = this._readDocSize(svgEl);

    // Panzoom the whole padded wrapper (page + gray padding + shadow) so it all
    // scales together as one floating sheet — no fixed border when zoomed.
    this._pzEl = wrapperEl;
    this._panzoom = Panzoom(wrapperEl, {
      maxScale: 40,
      minScale: 0.05,
    });
    wrapperEl.parentElement?.addEventListener('wheel', this._onWheel, { passive: false });

    // Default view: fit the whole page (incl. its gray padding) into the stage,
    // slightly zoomed out so it reads as a sheet. Wait a frame so layout/SVG
    // intrinsic height are settled.
    requestAnimationFrame(() => this._fitView());
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    this._destroyPanzoom();
  }

  // ── 4. Behaviour & Methods ──
  private _resolveSelected(docNames: string[]): string
  {
    return (this._selectedDoc && docNames.includes(this._selectedDoc))
      ? this._selectedDoc
      : docNames[0];
  }

  private _buildSvgMap(): SvgMap
  {
    const outputs = editorState.get().result?.outputs ?? [];
    return outputs
      .filter(o => o.path.category === 'docs' && o.path.format === 'svg' && typeof o.output === 'string')
      .reduce<SvgMap>((map, o) =>
      {
        const name = o.path.entityName ?? 'document';
        map[name] = o.output as string;
        return map;
      }, {});
  }

  /** Read the document size (mm) from the SVG viewBox or width/height attributes */
  private _readDocSize(svgEl: SVGElement): string | null
  {
    const vb = svgEl.getAttribute('viewBox');
    let w: number | null = null;
    let h: number | null = null;

    if (vb)
    {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n)))
      {
        w = parts[2];
        h = parts[3];
      }
    }
    if (w === null || h === null)
    {
      w = parseFloat(svgEl.getAttribute('width') ?? '');
      h = parseFloat(svgEl.getAttribute('height') ?? '');
    }
    if (w === null || h === null || isNaN(w) || isNaN(h)) return null;

    return `${Math.round(w)} × ${Math.round(h)} mm`;
  }

  /** Strip the XML prolog / DOCTYPE so the string parses as inline SVG */
  private _stripProlog(svg: string): string
  {
    return svg
      .replace(/^﻿/, '')
      .replace(/<\?xml[\s\S]*?\?>/i, '')
      .replace(/<!DOCTYPE[\s\S]*?>/i, '')
      .trim();
  }

  private _onWheel = (e: WheelEvent) =>
  {
    if (!this._panzoom) return;
    e.preventDefault();
    this._panzoom.zoomWithWheel(e);
  };

  private _resetView = () =>
  {
    this._fitView();
  };

  /** Fit page + gray padding into the stage, slightly zoomed out, centered.
   *  transform-origin is the panzoom default '50% 50%', so to center the
   *  scaled element the pan values are pre-scale: (stage-elem)/(2*scale). */
  private _fitView()
  {
    const pz = this._panzoom;
    const el = this._pzEl;
    const stage = el?.parentElement as HTMLElement | null | undefined;
    if (!pz || !el || !stage) return;

    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const ww = el.offsetWidth;   // border-box: page + gray padding (unscaled)
    const wh = el.offsetHeight;
    if (!sw || !sh || !ww || !wh) return;

    const FIT_MARGIN = 0.94; // leave a little gray around so it reads as a sheet
    const scale = Math.min(sw / ww, sh / wh, 1) * FIT_MARGIN;

    pz.zoom(scale, { animate: false });
    pz.pan((sw - ww) / (2 * scale), (sh - wh) / (2 * scale), { animate: false, force: true });
  }

  private _destroyPanzoom()
  {
    if (this._pzEl)
    {
      this._pzEl.parentElement?.removeEventListener('wheel', this._onWheel);
    }
    this._panzoom?.destroy();
    this._panzoom = null;
    this._pzEl = null;
  }

  private _renderEmpty(icon: string, message: string)
  {
    return html`
      <div class="empty-state">
        <wa-icon library="lucide" name=${icon} class="empty-icon"></wa-icon>
        <span class="empty-msg">${message}</span>
      </div>
    `;
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text);
    }

    /* ─── Empty state ─── */
    .empty-state
    {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm);
      width: 100%;
      height: 100%;
      color: var(--color-gray-dark);
    }

    .empty-icon { font-size: 2rem; opacity: 0.4; }

    .empty-msg
    {
      font-size: var(--text-sm);
      color: var(--color-gray-dark);
      text-align: center;
      padding: 0 var(--space-lg);
      margin: 0;
    }

    /* ─── Toolbar ─── */
    .toolbar
    {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-xs) var(--space-sm);
      background: var(--color-gray-light);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }

    .doc-select
    {
      flex: 0 1 auto;
      min-width: 80px;
      max-width: 180px;
      font-size: var(--text-xs);
    }

    .doc-select::part(combobox),
    .doc-select::part(display-input),
    .doc-select::part(listbox)
    {
      font-size: var(--text-xs);
    }

    .doc-size
    {
      font-size: var(--text-xs);
      color: var(--color-gray-dark);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .spacer { flex: 1; }
    .reset-btn { flex-shrink: 0; }

    /* ─── SVG stage (gray viewport) ─── */
    .svg-stage
    {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      background: var(--color-bg-dark);
      cursor: grab;
    }

    .svg-stage:active { cursor: grabbing; }

    /* The panzoom target: page + its gray padding + shadow, scaled as one unit */
    .svg-wrapper
    {
      width: 100%;
      box-sizing: border-box;
      padding: var(--space2xl);
      background: transparent;
    }

    .svg-wrapper svg
    {
      display: block;
      width: 100%;
      height: auto;
      background: var(--color-white, #fff);
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-document-tool': EditorDocumentTool;
  }
}
