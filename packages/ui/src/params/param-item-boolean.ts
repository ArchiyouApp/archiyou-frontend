import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { ScriptParam } from '@archiyou/editor/src/state/workspace';
import { paramValue } from '@archiyou/editor/src/state/workspace';

@customElement('param-item-boolean')
export class ParamItemBoolean extends LitElement
{
    // ── 1. Render ──

    override render()
    {
        return html`
            <label class="wrap">
                <input
                    type="checkbox"
                    class="checkbox"
                    .checked=${this._checked}
                    @change=${this._onChange}
                />
                <span class="label">${this._checked ? 'true' : 'false'}</span>
            </label>
        `;
    }

    // ── 2. State & Properties ──

    @property({ attribute: false }) param!: ScriptParam;
    @state() private _checked = false;

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._checked = Boolean(this.param ? paramValue(this.param) : false);
    }

    override updated(changed: Map<string, unknown>)
    {
        if (changed.has('param')) this._checked = Boolean(this.param ? paramValue(this.param) : false);
    }

    // ── 4. Behaviour ──

    private _onChange(e: Event)
    {
        this._checked = (e.target as HTMLInputElement).checked;
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { name: this.param.name, value: this._checked },
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
            align-items: center;
            gap:         6px;
            cursor:      pointer;
        }

        .checkbox
        {
            width:       14px;
            height:      14px;
            cursor:      pointer;
            flex-shrink: 0;
        }

        .label
        {
            font-family: var(--font-sans);
            font-size:   var(--text-sm);
            color:       var(--color-text-muted);
            user-select: none;
        }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-boolean': ParamItemBoolean;
    }
}
