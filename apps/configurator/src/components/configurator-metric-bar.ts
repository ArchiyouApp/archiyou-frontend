import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/spinner/spinner.js';

import './configurator-metric-card.js';

import { executing as scriptExecuting, executionResult } from '../../state/workspace.js';
import type { Metric } from '@archiyou/core/src/calc/types.js';

@customElement('configurator-metric-bar')
export class ConfiguratorMetricBar extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    const metrics = this._collectMetrics();
    const executing = scriptExecuting.get();

    return html`
      <div class="bar">
        ${this._hasOverflow ? html`
          <button class="nav-btn prev" title="Scroll left" @click=${this._scrollPrev}>
            <wa-icon library="lucide" name="chevron-left"></wa-icon>
          </button>
        ` : ''}

        <div class="scroll-area">
          ${metrics.length === 0
            ? executing
              ? html`<span class="empty"><wa-spinner style="font-size:0.9em"></wa-spinner>&ensp;Calculating metrics…</span>`
              : html`<span class="empty">No metrics — add <code>calc.metric()</code> calls to your script</span>`
            : metrics.map(m => html`
                <configurator-metric-card .metric=${m}></configurator-metric-card>
              `)
          }
        </div>

        ${this._hasOverflow ? html`
          <button class="nav-btn next" title="Scroll right" @click=${this._scrollNext}>
            <wa-icon library="lucide" name="chevron-right"></wa-icon>
          </button>
        ` : ''}

        <button class="download-btn" title="Download" @click=${this._handleDownload}>
          <wa-icon library="lucide" name="download"></wa-icon>
          <span>Download</span>
        </button>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _hasOverflow = false;
  private _resizeObserver: ResizeObserver | null = null;

  // ── 3. Lifecycle ──
  override disconnectedCallback()
  {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  override firstUpdated()
  {
    const area = this._scrollArea();
    if (area)
    {
      this._resizeObserver = new ResizeObserver(() => this._checkOverflow());
      this._resizeObserver.observe(area);
      area.addEventListener('scroll', () => this._checkOverflow(), { passive: true });
    }
    this._checkOverflow();
  }

  override updated(_changed: Map<string, unknown>)
  {
    requestAnimationFrame(() => this._checkOverflow());
  }

  // ── 4. Behaviour & Methods ──
  private _collectMetrics(): Metric[]
  {
    const outputs = executionResult.get()?.outputs ?? [];
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

  private _checkOverflow()
  {
    const area = this._scrollArea();
    if (area)
    {
      this._hasOverflow = area.scrollWidth > area.clientWidth;
    }
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
      align-items: stretch;
      height: 100%;
    }

    .scroll-area
    {
      display: flex;
      flex: 1;
      overflow-x: hidden;
      scroll-behavior: smooth;
      align-items: stretch;
    }

    .nav-btn
    {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      padding: 0;
      border: none;
      background: var(--color-bg);
      color: var(--color-text-muted, #888);
      cursor: pointer;
      font-size: var(--text-sm);
    }

    .nav-btn.prev
    {
      border-right: 1px solid var(--color-border);
    }

    .nav-btn.next
    {
      border-left: 1px solid var(--color-border);
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
      padding: 0 var(--space-md);
      border: none;
      border-left: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-primary);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: 500;
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
