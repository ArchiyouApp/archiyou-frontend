import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

import type { ScriptParam } from '@archiyou/editor/src/state/workspace';
import { paramMin, paramMax, paramStep, paramValue } from '@archiyou/editor/src/state/workspace';
import { scriptUnitSystem, configuratorUnitSystem, scriptModelUnits } from '@archiyou/editor/src/state/workspace';

import type { ModelUnits } from '@archiyou/core/src/modeler/types';
import type { UnitSystem } from '@archiyou/core/src/units/UnitConverter';
import {
    MM_PER_UNIT, UNIT_SYSTEMS, convert, systemOfUnit, pickBestUnit,
    toMM, fromMM, snapMMToSystem, formatImperial, paramDisplayDecimals,
} from '@archiyou/core/src/units/UnitConverter';

/** Sentinel stored in param.units to mark a param as explicitly unitless. */
const NONE_UNIT = 'none';

@customElement('param-item-number')
export class ParamItemNumber extends SignalWatcher(LitElement)
{
    // ── 1. Render ──

    override render()
    {
        const src     = this._sourceUnit();          // null → unitless (no conversion)
        const display = src ? this._displayUnit(src) : null;

        // For length params, present bounds/value in the display unit (geometry
        // stays in the source unit). Unitless params render raw.
        const min  = (src && display) ? convert(paramMin(this.param),  src, display) : paramMin(this.param);
        const max  = (src && display) ? convert(paramMax(this.param),  src, display) : paramMax(this.param);
        const step = (src && display) ? convert(paramStep(this.param), src, display) : paramStep(this.param);
        const displayValue = (src && display) ? convert(this._value, src, display) : this._value;

        // Per-unit fixed-decimal display when idle/after a slider drag (mm → integer,
        // other units → 2 decimals); while the field is focused show a light-rounded
        // value so typing isn't reformatted.
        const numStr  = this._focused
            ? String(Math.round(displayValue * 1e4) / 1e4)
            : this._displayFixed(displayValue, display);
        const fracHint = (src && display && this._displaySystem() === 'imperial')
            ? formatImperial(toMM(this._value, src), { unit: display })
            : null;

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
                    .value=${live(String(displayValue))}
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
                        .value=${numStr}
                        @focus=${() => { this._focused = true; }}
                        @blur=${() => { this._focused = false; }}
                        @input=${this._onNumberInput}
                        @change=${this._onNumber}
                    />
                    ${this._renderUnitSelect(src, display)}
                </div>

                ${fracHint ? html`<span class="frac-hint" title="Fractional inches">${fracHint}</span>` : ''}

                <button class="step-btn" title="Increment" @click=${this._increment}>
                    <wa-icon library="lucide" name="chevron-right"></wa-icon>
                </button>
            </div>
        `;
    }

    /** Unit dropdown. In the editor it authors the param's unit (incl. '—' none);
     *  in the configurator it is a display-unit override within the end-user's
     *  system (no '—', and disabled for unitless params). */
    private _renderUnitSelect(src: ModelUnits | null, display: ModelUnits | null)
    {
        const system = this._displaySystem();
        const editor = this.context === 'editor';

        if (!editor && !src)
        {
            // Configurator + unitless param → nothing to convert/choose.
            return html`<select class="unit" disabled title="No unit"><option>—</option></select>`;
        }

        return html`
            <select class="unit" @change=${this._onUnit}
                title=${editor ? 'Parameter unit' : 'Display unit'}>
                ${editor ? html`<option value=${NONE_UNIT} ?selected=${!src}>—</option>` : ''}
                ${UNIT_SYSTEMS[system].map(u => html`
                    <option value=${u} ?selected=${u === display}>${u}</option>
                `)}
            </select>
        `;
    }

    // ── 2. State & Properties ──

    // hasChanged: always true so Lit re-renders this component whenever the
    // parent (param-menu SignalWatcher) passes the same ScriptParam object
    // after an external value change (e.g. handle drag), which mutates
    // _value in-place without changing the object reference.
    @property({ attribute: false, hasChanged: () => true }) param!: ScriptParam;

    /** 'editor' = authoring (display in the script's system, dropdown sets the
     *  param unit). 'configurator' = end-user (display in the local configurator
     *  system, dropdown overrides the display unit only). */
    @property({ type: String }) context: 'editor' | 'configurator' = 'editor';

    @state() private _value = 0;
    @state() private _focused = false;

    // User's chosen display unit (within the active system). Display-only —
    // it never mutates the param's stored value or authored units.
    @state() private _displayUnitOverride: ModelUnits | null = null;

    // Tracks the display system so a Metric/Imperial switch can snap the value.
    private _lastDisplaySystem: UnitSystem | null = null;

    // ── 3. Lifecycle ──

    override connectedCallback()
    {
        super.connectedCallback();
        this._syncValue();
    }

    override updated(changed: Map<string, unknown>)
    {
        // 1. Sync the displayed value from the param state, but only when the
        // external value actually differs — prevents resetting a slider that
        // the user is actively dragging (mid-drag _value ≠ committed param value).
        if (changed.has('param'))
        {
            const external = this.param ? paramValue(this.param) : undefined;
            if (external !== undefined && Number(external) !== this._value)
            {
                this._syncValue();
            }
        }

        // 2. On a Metric/Imperial switch, snap the stored value to a nice number
        // in the new system (25mm ⇄ 1") so the user always sees clean values.
        const sys = this._displaySystem();
        if (this._lastDisplaySystem !== null && sys !== this._lastDisplaySystem)
        {
            this._snapToSystem(sys);
        }
        this._lastDisplaySystem = sys;
    }

    // ── 4. Behaviour ──

    /** The system used for *display*: the script's system in the editor, the
     *  end-user's local system in the configurator. */
    private _displaySystem(): UnitSystem
    {
        return this.context === 'configurator' ? configuratorUnitSystem.get() : scriptUnitSystem.get();
    }

    /** The unit the stored value/bounds are expressed in (the conversion anchor).
     *  null when the param is explicitly unitless. Unset units default to the
     *  script's model unit (mm unless the script sets $modeler.units()). */
    private _sourceUnit(): ModelUnits | null
    {
        const u = this.param?.units as string | undefined;
        if (u === NONE_UNIT) return null;
        if (u && u in MM_PER_UNIT) return u as ModelUnits;
        return scriptModelUnits.get();
    }

    /** The unit to display in: the source unit when already in the display
     *  system, else an auto-picked best unit (or the user's in-system override). */
    private _displayUnit(src: ModelUnits): ModelUnits
    {
        const system = this._displaySystem();
        const override = this._displayUnitOverride;
        if (override && systemOfUnit(override) === system) return override;

        if (systemOfUnit(src) === system) return src;
        return pickBestUnit(toMM(paramMax(this.param), src), system);
    }

    private _syncValue()
    {
        const v = this.param ? paramValue(this.param) : undefined;
        this._value = (v !== undefined && v !== null) ? Number(v) : (this.param ? paramMin(this.param) : 0);
    }

    /** Snap the stored value to a nice number in `system` (nearest 1/16" for
     *  imperial, nearest mm for metric), clamped to bounds, and commit if it
     *  changed. Length params only. */
    private _snapToSystem(system: UnitSystem)
    {
        const src = this._sourceUnit();
        if (!src) return; // unitless — nothing to snap

        const snappedMm = snapMMToSystem(toMM(this._value, src), system);
        const snapped = Math.max(paramMin(this.param),
            Math.min(paramMax(this.param), fromMM(snappedMm, src)));

        if (snapped !== this._value)
        {
            this._value = snapped;
            this._dispatchValue(snapped);
        }
    }

    /** Convert a display-unit input back into the source unit (identity when the
     *  param is unitless), then clamp + snap to the param's authored bounds/step. */
    private _commitFromDisplay(displayVal: number)
    {
        const src = this._sourceUnit();
        const srcVal = src ? convert(displayVal, this._displayUnit(src), src) : displayVal;
        const min  = paramMin(this.param);
        const max  = paramMax(this.param);
        const step = paramStep(this.param);
        const clamped = Math.max(min, Math.min(max, srcVal));
        const snapped = Math.round((clamped - min) / step) * step + min;
        this._value = snapped;
        this._dispatchValue(snapped);
    }

    private _onSlider(e: InputEvent)
    {
        this._commitFromDisplay(Number((e.target as HTMLInputElement).value));
    }

    private _onNumber(e: Event)
    {
        const input = e.target as HTMLInputElement;
        this._commitFromDisplay(Number(input.value));
        // reflect the snapped value back into the display unit (per-unit decimals)
        const src = this._sourceUnit();
        const disp = src ? this._displayUnit(src) : null;
        input.value = this._displayFixed(src && disp ? convert(this._value, src, disp) : this._value, disp);
    }

    private _onNumberInput(e: InputEvent)
    {
        const input = e.target as HTMLInputElement;
        if (input.value === '') return;
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) return;

        // live edit: clamp in source space but don't snap (snap on change)
        const src = this._sourceUnit();
        const srcVal = src ? convert(parsed, this._displayUnit(src), src) : parsed;
        const clamped = Math.max(paramMin(this.param), Math.min(paramMax(this.param), srcVal));
        this._value = clamped;
        this._dispatchValue(clamped);
    }

    private _onUnit(e: Event)
    {
        const chosen = (e.target as HTMLSelectElement).value;

        if (this.context === 'configurator')
        {
            // Display-only: choose which unit within the active system to show.
            this._displayUnitOverride = chosen ? (chosen as ModelUnits) : null;
            return;
        }

        // Editor: author the param's unit (a real ModelUnits, or the '—' sentinel
        // for explicitly unitless). Value stays the same number in the new unit.
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { name: this.param.name, units: chosen },
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
        // Always dispatch in the source (canonical) unit — geometry never changes.
        this.dispatchEvent(new CustomEvent('param-value-change', {
            detail:   { name: this.param.name, value },
            bubbles:  true,
            composed: true,
        }));
    }

    /** Format the number input with the per-unit fixed decimals (mm → integer,
     *  other units → 2 decimals; unitless → 2) so the displayed precision stays
     *  consistent across unit switches. */
    private _displayFixed(v: number, unit: ModelUnits | null): string
    {
        return (Number.isFinite(v) ? v : 0).toFixed(paramDisplayDecimals(unit));
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
            /* Tints the native range track/thumb so it follows the theme
               (avoids a glaring white track in dark mode). */
            accent-color: var(--color-primary);
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

        .frac-hint
        {
            flex-shrink: 0;
            font-family: var(--font-mono, monospace);
            font-size:   var(--text-xs);
            color:       var(--color-text-muted, #888);
            white-space: nowrap;
        }
    `;
}

declare global
{
    interface HTMLElementTagNameMap
    {
        'param-item-number': ParamItemNumber;
    }
}
