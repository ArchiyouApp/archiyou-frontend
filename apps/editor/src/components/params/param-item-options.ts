import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { ScriptParam } from '../../state/workspace.js';
import { paramValue, paramOptions } from '../../state/workspace.js';

@customElement('param-item-options')
export class ParamItemOptions extends LitElement
{
    // ── 1. Render ──

    override render()
    {
        const options = this.param ? paramOptions(this.param) : [];

        return html`
            <select
                class="select"
                .value=${this._value}
                @change=${this._onChange}
                @mousedown=${(e: MouseEvent) => e.stopPropagation()}
                @dragstart=${(e: DragEvent) => e.stopPropagation()}
            >
                ${options.length === 0
                    ? html`<option value="" disabled>No options defined</option>`
                    : options.map(o => html`
                        <option value=${o} ?selected=${String(o) === this._value}>${o}</option>
                    `)
                }
            </select>
        `;
    }

    // ── 2. State & Properties ──

    @property({ attribute: false }) param!: ScriptParam;
    @state() private _value = '';

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._value = String(this.param ? (paramValue(this.param) ?? '') : '');
    }

    override updated(changed: Map<string, unknown>)
    {
        if (changed.has('param'))
        {
            this._value = String(this.param ? (paramValue(this.param) ?? '') : '');
        }
    }

    // ── 4. Behaviour ──

    private _onChange(e: Event)
    {
        const raw = (e.target as HTMLSelectElement).value;
        this._value = raw;

        // If all enum entries are numbers, dispatch as number
        const options = this.param ? paramOptions(this.param) : [];
        const isNumericEnum = options.length > 0 && options.every(o => typeof o === 'number');
        const dispatched: string | number = isNumericEnum ? Number(raw) : raw;

        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { name: this.param.name, value: dispatched },
            bubbles:  true,
            composed: true,
        }));
    }

    // ── 5. Styles ──

    static override styles = css`
        :host { display: block; }

        .select
        {
            width:         100%;
            font-family:   var(--font-sans);
            font-size:     var(--text-xs);
            color:         var(--color-text);
            background:    var(--color-bg-elevated);
            border:        1px solid var(--color-border);
            border-radius: var(--radius-sm, 3px);
            padding:       3px 6px;
            cursor:        pointer;
        }

        .select:focus
        {
            outline:      none;
            border-color: var(--color-primary);
        }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-options': ParamItemOptions;
    }
}
