/**
 * <code-editor> — CodeMirror 6 wrapper.
 *
 * Properties:
 *   value   — current code string (set from outside)
 *
 * Events:
 *   change  — CustomEvent<string> fired on every editor change
 *   execute — CustomEvent<string> fired when the user triggers Run (Ctrl+Enter)
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

// Webawesome imports
import '@awesome.me/webawesome/dist/components/split-panel/split-panel.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/button/button.js';

// CodeMirror imports
import { EditorView, basicSetup } from 'codemirror';
import { keymap, Decoration, DecorationSet } from '@codemirror/view';
import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion } from '@codemirror/autocomplete';
import { archiyouCompletions } from './completions.js';

import { SignalWatcher } from '@lit-labs/signals';
import { workspace } from '../../state/workspace.js';

const lightTheme = EditorView.theme({}, { dark: false });
const themeCompartment = new Compartment();

// ── Error-line highlight ──────────────────────────────────────────────────────
/** Effect: set a 1-indexed line number, 'all' for every line, or null to clear. */
const setErrorLine = StateEffect.define<number | 'all' | null>();
const errorLineMark = Decoration.line({ class: 'cm-error-line' });

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr)
  {
    for (const effect of tr.effects)
    {
      if (!effect.is(setErrorLine)) continue;
      if (effect.value === null) return Decoration.none;
      if (effect.value === 'all')
      {
        const marks: ReturnType<typeof errorLineMark.range>[] = [];
        for (let i = 1; i <= tr.state.doc.lines; i++)
          marks.push(errorLineMark.range(tr.state.doc.line(i).from));
        return Decoration.set(marks);
      }
      // Single line — guard against out-of-range
      if (effect.value < 1 || effect.value > tr.state.doc.lines) return Decoration.none;
      const line = tr.state.doc.line(effect.value);
      return Decoration.set([errorLineMark.range(line.from)]);
    }
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});


@customElement('editor-code-box')
export class CodeBox extends SignalWatcher(LitElement)
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <div class="wrapper">
        <div class="title-bar">
          <wa-icon name="code"></wa-icon>Code Editor
          <span class="state">
            ${workspace.get().editor.executing
                ? html`<wa-icon name="cog" animation="spin-reverse" label="executing"></wa-icon>`
                : workspace.get().editor.result?.status === 'error'
                    ? html`
                        <wa-icon class="error-icon" name="circle-xmark" label="error"></wa-icon>
                        <span class="error-message" title=${this._fullErrorMessage(workspace.get().editor.result?.errors?.[0]?.message)}>
                          ${this._shortErrorMessage(workspace.get().editor.result?.errors?.[0])}
                        </span>`
                    : workspace.get().editor.result?.status === 'success'
                        ? html`
                            <wa-icon class="success-icon" name="circle-check" label="success"></wa-icon>
                            <span class="duration">${this._formatDuration(workspace.get().editor.result!.duration)}</span>`
                        : ''
            }
          </span>
          <span class="spacer"></span>
          <button class="execute-button" 
              @click=${this._handleRunClick} title="Run (Ctrl+Enter)">
              <wa-icon name="play" variant="solid" label="Execute"></wa-icon>
          </button>
        </div>
        <div class="cm-container"></div>
      </div>
    `;
  }

  // ── 2. Properties ──
  @property({ type: String }) code = '';

  // ── 3. Lifecycle ──
  override firstUpdated()
  {
    const container = this.renderRoot.querySelector<HTMLElement>('.cm-container')!;

    this._view = new EditorView({
      state: EditorState.create({
        doc: this.code,
        extensions: [
          basicSetup,
          errorLineField,
          javascript({ typescript: true }),
          autocompletion({ override: [archiyouCompletions] }),
          keymap.of([
            {
              key: 'Ctrl-Enter',
              mac: 'Cmd-Enter',
              run: () => { this._fireExecute(); return true; },
            },
          ]),
          themeCompartment.of(this._currentTheme()),
          EditorView.updateListener.of(update =>
          {
            if (update.docChanged)
            {
              this._skipNextUpdate = true;
              this.dispatchEvent(new CustomEvent<string>('change', {
                detail: update.state.doc.toString(),
                bubbles: true,
                composed: true,
              }));
            }
          }),
        ],
      }),
      parent: container,
    });

    // Switch theme when prefers-color-scheme changes
    this._darkMQ.addEventListener('change', this._onColorSchemeChange);

    // Switch theme when data-theme attribute changes on <html>
    this._themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  override updated(changed: Map<string, unknown>)
  {
    if (changed.has('code') && this._view && !this._skipNextUpdate)
    {
      const current = this._view.state.doc.toString();
      if (current !== this.code)
      {
        this._view.dispatch({
          changes: { from: 0, to: current.length, insert: this.code },
        });
      }
    }
    this._skipNextUpdate = false;

    // Sync error-line highlight whenever the execution result signal changes
    const result = workspace.get().editor.result;
    if (result !== this._lastAppliedResult)
    {
      this._lastAppliedResult = result;
      this._applyErrorHighlight(result);
    }
  }

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    this._darkMQ.removeEventListener('change', this._onColorSchemeChange);
    this._themeObserver.disconnect();
    this._view?.destroy();
    this._view = null;
  }

  // ── 4. Behaviour & Methods ──
  private _view: EditorView | null = null;
  private _skipNextUpdate = false;
  private _lastAppliedResult: ReturnType<typeof workspace.get>['editor']['result'] | undefined = undefined;
  private _darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

  private _currentTheme()
  {
    const isDark = document.documentElement.dataset['theme'] === 'dark' || this._darkMQ.matches;
    return isDark ? oneDark : lightTheme;
  }

  /** Get the current editor text. */
  getCode(): string
  {
    return this._view?.state.doc.toString() ?? this.code;
  }

  private _fireExecute()
  {
    this.dispatchEvent(new CustomEvent<string>('execute', {
      detail: this.getCode(),
      bubbles: true,
      composed: true,
    }));
  }

  private _onColorSchemeChange = () =>
  {
    this._swapTheme();
  };

  private _themeObserver = new MutationObserver(() =>
  {
    this._swapTheme();
  });

  private _swapTheme()
  {
    this._view?.dispatch({
      effects: themeCompartment.reconfigure(this._currentTheme()),
    });
  }

  private _handleRunClick()
  {
    this._fireExecute();
  }

  /** Dispatch the error-line effect to the CodeMirror editor. */
  private _applyErrorHighlight(result: ReturnType<typeof workspace.get>['editor']['result'])
  {
    if (!this._view) return;
    if (result?.status !== 'error') {
      this._view.dispatch({ effects: setErrorLine.of(null) });
      return;
    }
    const lineStart = result.errors?.[0]?.lineStart;
    const value: number | 'all' = (typeof lineStart === 'number' && lineStart > 0)
      ? lineStart
      : 'all';
    this._view.dispatch({ effects: setErrorLine.of(value) });
  }

  /** Extract a 1-line summary from the error result entry, prepending line info. */
  private _shortErrorMessage(err: { message?: string; lineStart?: number } | undefined): string
  {
    const msg = err?.message;
    const lineNum = typeof err?.lineStart === 'number' && err.lineStart > 0 ? err.lineStart : null;
    const prefix = lineNum !== null ? `Line ${lineNum}: ` : '';
    if (!msg) return `${prefix}Execution error`;
    const m = msg.match(/- error: '(.+?)'/);
    const text = m ? m[1] : (msg.split('\n').find(l => l.trim().length > 0) ?? 'Execution error');
    const full = `${prefix}${text}`;
    return full.length > 80 ? full.slice(0, 77) + '…' : full;
  }

  /** Return the full message for the tooltip. */
  private _fullErrorMessage(msg: string | undefined): string
  {
    return msg ?? '';
  }

  /** Format a duration in ms to a human-readable string. */
  private _formatDuration(ms: number | undefined): string
  {
    if (ms === undefined || ms === null) return '';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      position: relative;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      padding: 2rem;
      flex: 1;
      min-height: 0;
    }

    .title-bar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text);
      flex-shrink: 0;
    }

    .title-bar .spacer {
      flex: 1;
    }

    .execute-button {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-white);
      background-color: var(--color-primary);
      border-radius: var(--radius-full);
      cursor: pointer;
      flex-shrink: 0;
      border: none;
    }

    .execute-button:hover {
      background-color: var(--color-alert);
    }

    .cm-container {
      flex: 1;
      min-height: 0;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
    }

    /* Override CodeMirror to fill available height */
    .cm-editor {
      height: 100%;
    }

    /* Error line highlight (applied via CodeMirror StateField) */
    .cm-error-line {
      background: rgba(239, 68, 68, 0.18) !important;
    }

    /* Error state in title bar */
    .error-icon {
      color: var(--wa-color-danger-500, #ef4444);
      flex-shrink: 0;
    }

    .error-message {
      color: var(--wa-color-danger-500, #ef4444);
      font-size: var(--text-xs, 0.75rem);
      max-width: 28ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: default;
    }

    .success-icon {
      color: var(--wa-color-success-500, #22c55e);
    }

    .duration {
      font-size: var(--text-xs, 0.75rem);
      color: var(--color-gray-dark);
    }

  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-code-box': CodeBox;
  }
}
