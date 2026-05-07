import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import type { ScriptParam } from '../../state/workspace.js';

@customElement('param-item-text')
export class ParamItemText extends LitElement
{
    // ── 1. Render ──

    override render()
    {
        return html`
            <div class="wrap">
                <input
                    type="text"
                    class="input ${this._error ? 'invalid' : ''}"
                    .value=${this._value}
                    maxlength=${ifDefined(this.param.maxLength)}
                    placeholder="Enter text…"
                    @input=${this._onInput}
                    @blur=${this._onBlur}
                />
                ${this._error ? html`<span class="error">${this._error}</span>` : ''}
            </div>
        `;
    }

    // ── 2. State & Properties ──

    @property({ attribute: false }) param!: ScriptParam;
    @state() private _value = '';
    @state() private _error = '';

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._value = String(this.param?.value ?? this.param?.defaultValue ?? '');
    }

    override updated(changed: Map<string, unknown>)
    {
        if (changed.has('param')) this._value = String(this.param?.value ?? this.param?.defaultValue ?? '');
    }

    // ── 4. Behaviour ──

    private _onInput(e: InputEvent)
    {
        const val    = (e.target as HTMLInputElement).value;
        const minLen = this.param.minLength ?? 0;
        const maxLen = this.param.maxLength;

        this._value = val;

        if (val.length < minLen)
        {
            this._error = `Min ${minLen} chars`;
            return;
        }

        if (maxLen !== undefined && val.length > maxLen)
        {
            this._error = `Max ${maxLen} chars`;
            return;
        }

        this._error = '';
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { id: this.param.id, value: val },
            bubbles:  true,
            composed: true,
        }));
    }

    private _onBlur(e: FocusEvent)
    {
        const val    = (e.target as HTMLInputElement).value;
        const minLen = this.param.minLength ?? 0;

        if (val.length < minLen)
        {
            this._value = String(this.param.defaultValue ?? '');
            this._error = '';
        }
    }

    // ── 5. Styles ──

    static override styles = css`
        :host { display: block; width: 100%; }

        .wrap
        {
            display:        flex;
            flex-direction: column;
            gap:            2px;
            width:          100%;
        }

        .input
        {
            width:         100%;
            box-sizing:    border-box;
            font-family:   var(--font-sans);
            font-size:     var(--text-sm);
            color:         var(--color-text);
            background:    var(--color-bg-elevated);
            border:        1px solid var(--color-border);
            border-radius: var(--radius-sm, 3px);
            padding:       2px 6px;
        }

        .input:focus
        {
            outline:      none;
            border-color: var(--color-primary);
        }

        .input.invalid { border-color: var(--color-alert); }

        .error
        {
            font-size:   var(--text-xs);
            color:       var(--color-alert);
            line-height: 1.2;
        }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-text': ParamItemText;
    }
}
