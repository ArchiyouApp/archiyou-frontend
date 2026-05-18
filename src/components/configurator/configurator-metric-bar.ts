import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/button/button.js';

import './configurator-metric-card.js';

import { editorState } from '../../state/workspace.js';
import type { Metric } from '../../../devlibs/archiyou-core-next/src/calc/types.js';

@customElement('configurator-metric-bar')
export class ConfiguratorMetricBar extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const metrics = this._collectMetrics();

    return html`
      <div class="bar">
        <button class="nav-btn" title="Scroll left" @click=${this._scrollPrev}>
          <wa-icon library="lucide" name="chevron-left"></wa-icon>
        </button>

        <div class="scroll-area">
          ${metrics.length === 0
            ? html`<span class="empty">No metrics yet — run the script to see results</span>`
            : metrics.map(m => html`
                <configurator-metric-card .metric=${m}></configurator-metric-card>
              `)
          }
        </div>

        <button class="nav-btn" title="Scroll right" @click=${this._scrollNext}>
          <wa-icon library="lucide" name="chevron-right"></wa-icon>
        </button>

        <button class="download-btn" title="Download" @click=${this._handleDownload}>
          <wa-icon library="lucide" name="download"></wa-icon>
          <span>Download</span>
        </button>
      </div>
    `;
  }

  // ── 4. Behaviour & Methods ──
  private _collectMetrics(): Metric[]
  {
    const outputs = editorState.get().result?.outputs ?? [];
    const metrics: Metric[] = [];

    outputs
      .filter(o => o.path.category === 'metrics')
      .forEach(o =>
      {
        const raw = o.output;
        if (Array.isArray(raw))
        {
          metrics.push(...(raw as Metric[]));
        }
        else if (raw && typeof raw === 'object')
        {
          metrics.push(...(Object.values(raw) as Metric[]));
        }
      });

    return metrics;
  }

  private _scrollArea(): HTMLElement | null
  {
    return this.renderRoot.querySelector<HTMLElement>('.scroll-area');
  }

  private _scrollPrev()
  {
    this._scrollArea()?.scrollBy({ left: -200, behavior: 'smooth' });
  }

  private _scrollNext()
  {
    this._scrollArea()?.scrollBy({ left: 200, behavior: 'smooth' });
  }

  private _handleDownload()
  {
    // Stub: download not yet implemented
    console.info('Configurator: download clicked');
  }

  // ── 5. Styles ──
  static override styles = css`
    :host
    {
      display: block;
      border-top: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    .bar
    {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      height: 100%;
    }

    .scroll-area
    {
      display: flex;
      flex: 1;
      gap: var(--space-sm);
      overflow-x: hidden;
      scroll-behavior: smooth;
    }

    .nav-btn
    {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 4px);
      background: var(--color-bg);
      color: var(--color-text-muted, #888);
      cursor: pointer;
      font-size: var(--text-sm);
    }

    .nav-btn:hover
    {
      background: color-mix(in srgb, var(--color-border) 30%, transparent);
      color: var(--color-text);
    }

    .download-btn
    {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-md);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm, 4px);
      background: var(--color-bg);
      color: var(--color-primary);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: 500;
      margin-left: var(--space-sm);
    }

    .download-btn:hover
    {
      background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    }

    .empty
    {
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text-muted, #888);
      font-style: italic;
      white-space: nowrap;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'configurator-metric-bar': ConfiguratorMetricBar;
  }
}
