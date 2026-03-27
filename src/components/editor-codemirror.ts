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
import { EditorState, Compartment } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion } from '@codemirror/autocomplete';
import { meshupCompletions } from './editor-completions.js';

const lightTheme = EditorView.theme({}, { dark: false });
const themeCompartment = new Compartment();


@customElement('code-editor')
export class CodeEditor extends LitElement
{
  // ── 1. Render ──
  override render()
  {
    return html`
      <div class="wrapper">
        <div class="title-bar">
          <wa-icon name="code"></wa-icon>Code Editor
          <span class="spacer"></span>
          <button class="execute-button" @click=${this._handleRunClick} title="Run (Ctrl+Enter)">
            <wa-icon name="play" variant="solid" label="Execute"></wa-icon>
          </button>
        </div>
        <div class="cm-container"></div>
      </div>
    `;
  }

  // ── 2. Properties ──
  @property({ type: String }) value = '';

  // ── 3. Lifecycle ──
  override firstUpdated()
  {
    const container = this.renderRoot.querySelector<HTMLElement>('.cm-container')!;

    this._view = new EditorView({
      state: EditorState.create({
        doc: this.value,
        extensions: [
          basicSetup,
          javascript({ typescript: true }),
          autocompletion({ override: [meshupCompletions] }),
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
    if (changed.has('value') && this._view && !this._skipNextUpdate)
    {
      const current = this._view.state.doc.toString();
      if (current !== this.value)
      {
        this._view.dispatch({
          changes: { from: 0, to: current.length, insert: this.value },
        });
      }
    }
    this._skipNextUpdate = false;
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
  private _darkMQ = window.matchMedia('(prefers-color-scheme: dark)');

  private _currentTheme()
  {
    const isDark = document.documentElement.dataset['theme'] === 'dark' || this._darkMQ.matches;
    return isDark ? oneDark : lightTheme;
  }

  /** Get the current editor text. */
  getCode(): string
  {
    return this._view?.state.doc.toString() ?? this.value;
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

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      position: relative;
      flex-direction: column;
      height: 100%;
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      padding: 2rem;
      flex: 1;
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
      /* flex: 1; */
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      height: 100%;
    }

    /* Override CodeMirror to fill available height */
    .cm-editor {
      height: 100%;
    }

  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'code-editor': CodeEditor;
  }
}
