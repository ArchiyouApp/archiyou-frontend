import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import type { ScriptParam } from '../../state/workspace.js';
import { paramMin, paramMax, paramStep, paramValue } from '../../state/workspace.js';

const MODEL_UNITS = ['mm', 'cm', 'dm', 'm', 'km', 'inch', 'feet', 'yd', 'mi'] as const;

@customElement('param-item-number')
export class ParamItemNumber extends LitElement
{
    // ── 1. Render ──

    override render()
    {
        const min  = paramMin(this.param);
        const max  = paramMax(this.param);
        const step = paramStep(this.param);

        return html`
            <div class="wrap"
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dragstart=${(e: DragEvent) => e.stopPropagation()}
            >
                <input
                    type="range"
                    class="slider"
                    min=${min}
                    max=${max}
                    step=${step}
                    .value=${live(String(this._value))}
                    @input=${this._onSlider}
                />

                <button class="step-btn" title="Decrement" @click=${this._decrement}>
                    <wa-icon library="lucide" name="chevron-left"></wa-icon>
                </button>

                <div class="num-unit">
                    <input
                        type="number"
                        class="num"
                        min=${min}
                        max=${max}
                        step=${step}
                        .value=${String(this._value)}
                        @change=${this._onNumber}
                    />
                    <select class="unit" @change=${this._onUnit} title="Unit">
                        <option value="">—</option>
                        ${MODEL_UNITS.map(u => html`
                            <option value=${u} ?selected=${u === this.param.units}>${u}</option>
                        `)}
                    </select>
                </div>

                <button class="step-btn" title="Increment" @click=${this._increment}>
                    <wa-icon library="lucide" name="chevron-right"></wa-icon>
                </button>
            </div>
        `;
    }

    // ── 2. State & Properties ──

    @property({ attribute: false }) param!: ScriptParam;
    @state() private _value = 0;

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._syncValue();
    }

    override updated(changed: Map<string, unknown>)
    {
        if (changed.has('param')) this._syncValue();
    }

    // ── 4. Behaviour ──

    private _syncValue()
    {
        const v = this.param ? paramValue(this.param) : undefined;
        this._value = (v !== undefined && v !== null) ? Number(v) : (this.param ? paramMin(this.param) : 0);
    }

    private _onSlider(e: InputEvent)
    {
        this._value = Number((e.target as HTMLInputElement).value);
        this._dispatchValue(this._value);
    }

    private _onNumber(e: Event)
    {
        const input = e.target as HTMLInputElement;
        const min   = paramMin(this.param);
        const max   = paramMax(this.param);
        const step  = paramStep(this.param);
        const clamped = Math.max(min, Math.min(max, Number(input.value)));
        const snapped = Math.round((clamped - min) / step) * step + min;
        this._value      = snapped;
        input.value      = String(snapped);
        this._dispatchValue(snapped);
    }

    private _onUnit(e: Event)
    {
        const units = (e.target as HTMLSelectElement).value || undefined;
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { id: this.param.id, value: this._value, units },
            bubbles:  true,
            composed: true,
        }));
    }

    private _decrement()
    {
        const step = paramStep(this.param);
        const min  = paramMin(this.param);
        this._value = Math.max(min, this._value - step);
        this._dispatchValue(this._value);
    }

    private _increment()
    {
        const step = paramStep(this.param);
        const max  = paramMax(this.param);
        this._value = Math.min(max, this._value + step);
        this._dispatchValue(this._value);
    }

    private _dispatchValue(value: number)
    {
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { id: this.param.id, value },
            bubbles:  true,
            composed: true,
        }));
    }

    // ── 5. Styles ──

    static override styles = css`
        :host { display: block; width: 100%; }

        .wrap
        {
            display:     flex;
            align-items: center;
            gap:         4px;
            width:       100%;
        }

        .slider
        {
            flex:      1 1 0;
            min-width: 0;
            cursor:    pointer;
        }

        /* ── step arrows ── */
        .step-btn
        {
            flex-shrink:     0;
            display:         inline-flex;
            align-items:     center;
            justify-content: center;
            width:           18px;
            height:          22px;
            padding:         0;
            border:          none;
            background:      transparent;
            cursor:          pointer;
            color:           var(--color-text-muted);
            font-size:       10px;
        }

        .step-btn:hover { color: var(--color-primary); }

        /* ── combined number + unit box ── */
        .num-unit
        {
            display:       flex;
            align-items:   stretch;
            border:        1px solid var(--color-border);
            border-radius: var(--radius-sm, 3px);
            overflow:      hidden;
            flex-shrink:   0;
            width:         110px;
        }

        .num-unit:focus-within { border-color: var(--color-primary); }

        .num
        {
            flex:        1 1 0;
            min-width:   0;
            width:       50px;
            font-family: var(--font-sans);
            font-size:   var(--text-sm);
            color:       var(--color-text);
            background:  var(--color-bg-elevated);
            border:      none;
            border-right: 1px solid var(--color-border);
            padding:     1px 4px;
            text-align:  right;
        }

        .num:focus { outline: none; }

        /* hide native spin buttons */
        .num::-webkit-outer-spin-button,
        .num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .num[type=number]               { -moz-appearance: textfield; }

        .unit
        {
            flex-shrink: 0;
            width:       58px;
            font-family: var(--font-sans);
            font-size:   var(--text-xs);
            color:       var(--color-gray-dark, #666);
            background:  var(--color-bg-elevated);
            border:      none;
            padding:     1px 6px;
            cursor:      pointer;
        }

        .unit:focus { outline: none; }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-number': ParamItemNumber;
    }
}
