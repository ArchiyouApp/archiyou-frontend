import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import type { ScriptParam } from '../../state/workspace.js';
import { paramValue, paramOptions } from '../../state/workspace.js';

@customElement('param-item-options')
export class ParamItemOptions extends LitElement
{
    // ── 1. Render ──

    override render()
    {
        const available = (this.param ? paramOptions(this.param) : []).filter(o => !this._selected.includes(o));

        return html`
            <div class="wrap">
                ${this._selected.map(opt => html`
                    <span class="chip">
                        <span class="chip-label">${opt}</span>
                        <button
                            class="chip-remove"
                            title="Remove"
                            @click=${() => this._remove(opt)}
                        >
                            <wa-icon library="lucide" name="x"></wa-icon>
                        </button>
                    </span>
                `)}

                ${this._picking
                    ? html`
                        <select
                            class="pick-select"
                            @change=${this._onPick}
                            @blur=${() => { this._picking = false; }}
                        >
                            <option value="" disabled selected>Pick…</option>
                            ${available.map(o => html`<option value=${o}>${o}</option>`)}
                        </select>`
                    : available.length > 0
                        ? html`
                            <button class="add-btn" title="Add option" @click=${this._startPick}>
                                <wa-icon library="lucide" name="plus"></wa-icon>
                            </button>`
                        : nothing
                }
            </div>
        `;
    }

    // ── 2. State & Properties ──

    @property({ attribute: false }) param!: ScriptParam;
    @state() private _selected: string[] = [];
    @state() private _picking  = false;

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._selected = (this.param ? paramValue(this.param) : []) as string[] ?? [];
    }

    override updated(changed: Map<string, unknown>)
    {
        if (changed.has('param')) this._selected = (this.param ? paramValue(this.param) : []) as string[] ?? [];
        if (changed.has('_picking') && this._picking)
        {
            this.updateComplete.then(() =>
            {
                this.renderRoot.querySelector<HTMLSelectElement>('.pick-select')?.focus();
            });
        }
    }

    // ── 4. Behaviour ──

    private _startPick()
    {
        this._picking = true;
    }

    private _onPick(e: Event)
    {
        const val = (e.target as HTMLSelectElement).value;
        this._picking  = false;
        if (!val) return;
        this._selected = [...this._selected, val];
        this._dispatch();
    }

    private _remove(opt: string)
    {
        this._selected = this._selected.filter(o => o !== opt);
        this._dispatch();
    }

    private _dispatch()
    {
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { name: this.param.name, value: this._selected },
            bubbles:  true,
            composed: true,
        }));
    }

    // ── 5. Styles ──

    static override styles = css`
        :host { display: block; }

        .wrap
        {
            display:     flex;
            flex-wrap:   wrap;
            gap:         3px;
            align-items: center;
        }

        /* ── chips ── */
        .chip
        {
            display:       inline-flex;
            align-items:   center;
            gap:           2px;
            padding:       2px 6px;
            border-radius: var(--radius-full, 100px);
            border:        1px solid var(--color-border);
            background:    var(--color-bg-elevated);
            font-family:   var(--font-sans);
            font-size:     var(--text-xs);
            color:         var(--color-text);
            white-space:   nowrap;
        }

        .chip-label
        {
            max-width:     80px;
            overflow:      hidden;
            text-overflow: ellipsis;
            white-space:   nowrap;
        }

        .chip-remove
        {
            display:     inline-flex;
            align-items: center;
            padding:     0;
            border:      none;
            background:  transparent;
            cursor:      pointer;
            font-size:   9px;
            color:       var(--color-text-muted);
            opacity:     0.5;
        }

        .chip-remove:hover
        {
            color:   var(--color-alert);
            opacity: 1;
        }

        /* ── add button ── */
        .add-btn
        {
            display:         inline-flex;
            align-items:     center;
            justify-content: center;
            width:           20px;
            height:          20px;
            padding:         0;
            border:          none;
            border-radius:   var(--radius-full, 100px);
            background:      var(--color-primary);
            cursor:          pointer;
            color:           #fff;
            font-size:       10px;
        }

        .add-btn:hover { opacity: 0.85; }

        /* ── pick dropdown ── */
        .pick-select
        {
            font-family:   var(--font-sans);
            font-size:     var(--text-xs);
            color:         var(--color-text);
            background:    var(--color-bg-elevated);
            border:        1px solid var(--color-primary);
            border-radius: var(--radius-sm, 3px);
            padding:       2px 4px;
            cursor:        pointer;
        }

        .pick-select:focus { outline: none; }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-options': ParamItemOptions;
    }
}
