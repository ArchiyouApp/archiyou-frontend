import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';

import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/tooltip/tooltip.js';
import '@awesome.me/webawesome/dist/components/popover/popover.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';
import '@dile/editor/editor.js';

import {
  editorScript,
  fileManagerCollapsed,
  setFileManagerCollapsed,
  updateScriptName,
  updateScriptMetadata,
  updateScriptMeta,
  isScriptNameTaken,
} from '../../state/workspace.js';
import type { ScriptMetadata } from '../../state/workspace.js';

import {
  FILE_MANAGER_DISABLED_TOOLBAR_ITEMS,
  SCRIPT_PREDEFINED_TAGS,
} from '../../settings.js';

// ── Field help explanations — edit here to update all tooltips ────────────────

const FIELD_HELP: Record<string, string> = {
  name:        'The script identifier (lowercase). Used when referencing this script from other scripts or the API.',
  version:     'Automatically set when the script is published. Read-only — use the Publish action to update it.',
  description: 'A one- or two-sentence summary shown in listings and search results.',
  details:     'Full documentation: purpose, usage instructions, parameter notes and any technical background.',
  tags:        'Searchable keywords. Only predefined tags are allowed to keep the catalogue consistent.',
};

@customElement('editor-file-manager')
export class EditorFileManager extends SignalWatcher(LitElement)
{

  // ── 1. Render ──────────────────────────────────────────────────────────────

  override render()
  {
    const collapsed = fileManagerCollapsed.get();
    this.toggleAttribute('collapsed', collapsed);

    // Capture the state at opening (first expanded render) so Cancel can revert.
    if (collapsed) this._snapshot = null;
    else if (this._snapshot === null) this._snapshot = structuredClone(this._draft);
    const script = editorScript.get();
    const displayName = script?.name ?? 'untitled';

    return html`
      <div class="header" @click=${this._toggleCollapse}>
        <wa-icon library="lucide" name="file"></wa-icon>

        ${this._editingName
          ? html`
              <input
                id=${`fm-name-header-${this._uid}`}
                class="name-input"
                .value=${this._nameDraft}
                @input=${(e: InputEvent) => (this._nameDraft = (e.target as HTMLInputElement).value)}
                @blur=${this._commitNameEdit}
                @keydown=${this._onNameKeydown}
                @click=${(e: Event) => e.stopPropagation()}
              />`
          : html`
              <span
                class="script-name"
                @dblclick=${(e: Event) => { e.stopPropagation(); this._startNameEdit(displayName); }}
              >${displayName}</span>
              <button
                class="edit-name-btn"
                title="Rename script"
                id="edit-name-btn"
                @click=${(e: Event) => { e.stopPropagation(); this._startNameEdit(displayName); }}
              >
                <wa-icon library="lucide" name="pencil"></wa-icon>
              </button>`
        }

        <span class="spacer"></span>
        <wa-icon library="lucide" name=${collapsed ? 'chevron-down' : 'chevron-up'}></wa-icon>
      </div>

      ${!collapsed ? this._renderBody() : nothing}

      <wa-popover
        class="name-error-popover"
        placement=${this._nameErrorAnchor === 'header' ? 'bottom' : 'right'}
        for=${this._nameErrorAnchor === 'header'
          ? `fm-name-header-${this._uid}`
          : `fm-name-form-${this._uid}`}
        ?open=${this._nameErrorOpen}
        @click=${(e: Event) => e.stopPropagation()}
      >${this._nameErrorText}</wa-popover>
    `;
  }

  private _renderBody()
  {
    const script  = editorScript.get();
    const version = script?.published?.version ?? '—';

    return html`
      <div class="body">
        <div class="form">

          ${this._renderField('name', html`
            <input
              id=${`fm-name-form-${this._uid}`}
              class="text-input"
              .value=${this._draft.projectName}
              placeholder="script name…"
              @input=${(e: InputEvent) =>
                (this._draft = { ...this._draft, projectName: (e.target as HTMLInputElement).value })}
            />
          `)}

          ${this._renderField('version', html`
            <input
              class="text-input"
              .value=${version}
              disabled
            />
          `)}

          ${this._renderField('description', html`
            <div class="editor-wrap">
              <dile-editor
                name="description"
                .value=${this._draft.description}
                disableToolbarItems=${FILE_MANAGER_DISABLED_TOOLBAR_ITEMS}
                @element-changed=${(e: CustomEvent<{ name: string; value: string }>) =>
                  (this._draft = { ...this._draft, description: e.detail.value })}
              ></dile-editor>
            </div>
          `)}

          ${this._renderField('details', html`
            <div class="editor-wrap">
              <dile-editor
                name="details"
                .value=${this._draft.projectDetails}
                disableToolbarItems=${FILE_MANAGER_DISABLED_TOOLBAR_ITEMS}
                @element-changed=${(e: CustomEvent<{ name: string; value: string }>) =>
                  (this._draft = { ...this._draft, projectDetails: e.detail.value })}
              ></dile-editor>
            </div>
          `)}

          ${this._renderField('tags', this._renderTagManager())}

        </div>

        <div class="footer">
          <wa-button
            variant="neutral"
            appearance="outlined"
            size="small"
            @click=${this._handleCancel}
          >Cancel</wa-button>
          <wa-button
            variant="brand"
            appearance="filled"
            size="small"
            @click=${this._handleSave}
          >Save</wa-button>
        </div>
      </div>
    `;
  }

  private _renderTagManager()
  {
    const selected  = this._draft.categories;
    const available = SCRIPT_PREDEFINED_TAGS.filter(t => !selected.includes(t));

    return html`
      <div class="tag-manager">
        ${available.length > 0
          ? html`
              <wa-dropdown
                class="tag-add"
                placement="bottom-start"
                @wa-select=${this._onAddTagSelect}
              >
                <wa-button
                  slot="trigger"
                  appearance="outlined"
                  variant="neutral"
                  size="small"
                  with-caret
                >
                  <wa-icon slot="start" library="lucide" name="plus"></wa-icon>
                  Add tag
                </wa-button>
                ${available.map(t => html`
                  <wa-dropdown-item value=${t}>${t}</wa-dropdown-item>`)}
              </wa-dropdown>`
          : nothing}
        <div class="tag-list">
          ${selected.length === 0
            ? html`<span class="tag-empty">No tags yet</span>`
            : selected.map(tag => html`
                <span class="tag-chip selected">
                  ${tag}
                  <button
                    class="tag-remove"
                    title="Remove tag"
                    @click=${() => this._removeTag(tag)}
                  >
                    <wa-icon library="lucide" name="x"></wa-icon>
                  </button>
                </span>
              `)}
        </div>
      </div>
    `;
  }

  private _renderField(key: string, control: unknown)
  {
    const helpId  = `help-${key}-${this._uid}`;
    const label   = key.charAt(0).toUpperCase() + key.slice(1);
    const helpText = FIELD_HELP[key] ?? '';

    return html`
      <div class="field">
        <div class="field-label-row">
          <span class="field-label">${label}</span>
          <span id=${helpId} class="help-icon">
            <wa-icon library="lucide" name="circle-help"></wa-icon>
          </span>
          <wa-tooltip for=${helpId} placement="right">${helpText}</wa-tooltip>
        </div>
        ${control}
      </div>
    `;
  }

  // ── 2. State ───────────────────────────────────────────────────────────────

  @state() private _editingName = false;
  @state() private _nameDraft   = '';
  @state() private _draft: ScriptMetadata = this._freshDraft();

  /** Snapshot of the draft taken when the body is opened — used by Cancel. */
  private _snapshot: ScriptMetadata | null = null;

  /** Stable per-instance uid suffix for tooltip `for` references. */
  private readonly _uid = Math.random().toString(36).slice(2, 7);

  /** Name-collision popover state. */
  @state() private _nameErrorOpen  = false;
  @state() private _nameErrorText  = '';
  @state() private _nameErrorAnchor: 'header' | 'form' = 'header';
  private _nameErrorTimer: number | null = null;

  /** Tracks the fileId of the script the form is currently bound to,
   *  so we can re-populate when the active script changes (e.g. after
   *  Open Script). */
  private _activeFileId: string | null = null;

  // ── 3. Lifecycle ───────────────────────────────────────────────────────────

  override updated(_changed: Map<string, unknown>)
  {
    // dile-editor hardcodes section.for-input { font-size: 0.9rem } in its
    // shadow root and exposes no var to override it. Inject a stylesheet so
    // the body/paragraph text matches our text-sm. (Heading sizes are left
    // alone — markdown semantics.)
    this._patchDileEditorFontSize();
  }

  private _dileEditorSheet: CSSStyleSheet | null = null;
  private _patchDileEditorFontSize()
  {
    if (!this._dileEditorSheet)
    {
      try
      {
        this._dileEditorSheet = new CSSStyleSheet();
        this._dileEditorSheet.replaceSync(`
          section.for-input { font-size: var(--text-sm, 0.875rem); }
          .ProseMirror      { font-size: var(--text-sm, 0.875rem); }
        `);
      }
      catch { return; /* constructable sheets unsupported */ }
    }
    const sheet = this._dileEditorSheet;
    this.renderRoot.querySelectorAll('dile-editor').forEach(el =>
    {
      const sr = (el as HTMLElement).shadowRoot;
      if (sr && !sr.adoptedStyleSheets.includes(sheet))
      {
        sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
      }
    });
  }

  override willUpdate(_changed: Map<string, unknown>)
  {
    // SignalWatcher runs update() whenever a watched signal ticks, so this
    // fires on every script switch. Re-derive the form draft from the
    // canonical Script whenever the active script changes.
    const script = editorScript.get();
    const fid = script?.fileId ?? null;
    if (fid !== this._activeFileId)
    {
      this._activeFileId = fid;
      this._draft        = this._draftFromScript();
      this._snapshot     = null;          // re-captured on next body-open render
      this._editingName  = false;
      this._nameDraft    = '';
      this._nameErrorOpen = false;
      if (this._nameErrorTimer !== null)
      {
        clearTimeout(this._nameErrorTimer);
        this._nameErrorTimer = null;
      }
    }
  }

  // ── 4. Behaviour ───────────────────────────────────────────────────────────

  private _freshDraft(): ScriptMetadata
  {
    return {
      projectName:    editorScript.get()?.name ?? '',
      version:        '',
      description:    '',
      projectDetails: '',
      categories:     [],
    };
  }

  /** Build the form draft directly from the canonical Script — the
   *  source of truth post-refactor. The legacy `scriptMetadata` signal
   *  is no longer consulted here so script switches always show fresh data. */
  private _draftFromScript(): ScriptMetadata
  {
    const script = editorScript.get();
    return {
      projectName:    script?.name ?? '',
      version:        script?.published?.version ?? '',
      description:    script?.description ?? '',
      projectDetails: script?.details ?? '',
      categories:     [...(script?.tags ?? [])],
    };
  }

  private _toggleCollapse()
  {
    setFileManagerCollapsed(!fileManagerCollapsed.get());
  }

  private _startNameEdit(currentName: string)
  {
    this._nameDraft    = currentName;
    this._editingName  = true;
    // NOTE: deliberately do NOT expand the menu here — renaming happens inline
    // in the header; the body stays collapsed until the user opens it.

    this.updateComplete.then(() =>
    {
      this.renderRoot.querySelector<HTMLInputElement>('.name-input')?.select();
    });
  }

  private _commitNameEdit()
  {
    const name = this._nameDraft.trim();
    if (!name) { this._editingName = false; return; }

    const script = editorScript.get();
    if (script && isScriptNameTaken(name, script.fileId))
    {
      this._showNameError('header', name);
      return; // keep editor open so the user can correct
    }

    this._editingName = false;
    // Commit to the active Script so the header re-renders from the signal,
    // and keep the form draft in sync.
    updateScriptName(name);
    this._draft = { ...this._draft, projectName: name };
  }

  /** Display the collision popover and auto-dismiss after a few seconds. */
  private _showNameError(anchor: 'header' | 'form', tried: string)
  {
    this._nameErrorAnchor = anchor;
    this._nameErrorText   = `File name "${tried}" already taken!`;
    this._nameErrorOpen   = true;

    if (this._nameErrorTimer !== null) clearTimeout(this._nameErrorTimer);
    this._nameErrorTimer = window.setTimeout(() =>
    {
      this._nameErrorOpen  = false;
      this._nameErrorTimer = null;
    }, 2500);
  }

  private _onNameKeydown(e: KeyboardEvent)
  {
    e.stopPropagation();
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    if (e.key === 'Escape') this._editingName = false;
  }

  private _onAddTagSelect(e: CustomEvent)
  {
    const tag = (e.detail.item as { value: string }).value;
    if (tag) this._addTag(tag);
  }

  private _addTag(tag: string)
  {
    if (this._draft.categories.includes(tag)) return;
    this._draft = { ...this._draft, categories: [...this._draft.categories, tag] };
  }

  private _removeTag(tag: string)
  {
    this._draft = {
      ...this._draft,
      categories: this._draft.categories.filter(t => t !== tag),
    };
  }

  private _handleCancel()
  {
    // Revert to the state captured when the menu was opened, then close.
    this._draft = this._snapshot
      ? structuredClone(this._snapshot)
      : this._freshDraft();
    this._editingName = false;
    setFileManagerCollapsed(true);
  }

  private _handleSave()
  {
    const script = editorScript.get();
    if (!script) return;

    // Update the script name on the actual Script object
    const newName = this._draft.projectName.trim();
    if (newName)
    {
      if (isScriptNameTaken(newName, script.fileId))
      {
        this._showNameError('form', newName);
        return; // abort save — keep the panel open
      }
      updateScriptName(newName);
    }

    // Persist metadata onto the canonical Script (description / details / tags)
    updateScriptMeta({
      description: this._draft.description,
      details:     this._draft.projectDetails,
      tags:        this._draft.categories,
    });

    // Keep the editor metadata signal in sync with what we just saved
    updateScriptMetadata(script.id, { ...this._draft });

    setFileManagerCollapsed(true);
  }

  // ── 5. Styles ──────────────────────────────────────────────────────────────

  static override styles = css`
    :host
    {
      display: flex;
      flex-direction: column;
      width: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      background: var(--color-bg-elevated);
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }

    *,
    *::before,
    *::after { box-sizing: border-box; }

    /* ── Name collision popover ── */

    .name-error-popover {
      --background-color: var(--color-alert, #ef4444);
      --border-color:     var(--color-alert, #ef4444);
      color:              var(--color-white, #fff);
      font-size:          var(--text-xs);
      font-weight:        500;
    }

    /* ── Header ── */

    .header
    {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      height: var(--space3xl);
      padding: 0 var(--space-md);
      flex-shrink: 0;
      user-select: none;
      cursor: pointer;
      background: var(--color-gray);
      border-bottom: 1px solid var(--color-border);
    }

    :host([collapsed]) .header
    {
      border-bottom: none;
    }

    .script-name
    {
      font-weight: 500;
      color: var(--color-text);
      font-size: var(--text-sm);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
      cursor: default;
    }

    .name-input
    {
      flex: 1;
      min-width: 0;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text);
      background: var(--color-bg);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-sm, 4px);
      padding: 2px 6px;
      outline: none;
    }

    .edit-name-btn
    {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: var(--radius-sm, 4px);
      opacity: 0;
      transition: opacity 0.1s;
      flex-shrink: 0;
    }

    .header:hover .edit-name-btn { opacity: 1; }

    .spacer { flex: 1; }

    /* ── Body ── */

    .body
    {
      display: flex;
      flex-direction: column;
      position: relative;
      max-height: 480px;
      font-size: var(--text-sm);
    }

    .form
    {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-md);
      display: flex;
      flex-direction: column;
      gap: var(--space-md);
      /* leave room for fixed footer */
      padding-bottom: calc(var(--space-md) + 44px);
    }

    /* ── Field ── */

    .field
    {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field-label-row
    {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .field-label
    {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .help-icon
    {
      display: flex;
      align-items: center;
      font-size: 12px;
      color: var(--color-text-muted);
      opacity: 0.5;
      cursor: default;
    }

    /* ── Text input ── */

    .text-input
    {
      width: 100%;
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      color: var(--color-text);
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm, 4px);
      padding: var(--space-xs) var(--space-sm);
      outline: none;
      transition: border-color 0.15s;
    }

    .text-input:focus
    {
      border-color: var(--color-primary);
    }

    .text-input:disabled
    {
      opacity: 0.5;
      cursor: not-allowed;
      background: var(--color-gray);
    }

    /* ── Dile editor theming ── */

    .editor-wrap
    {
      --dile-editor-border: 1px solid var(--color-border);
      --dile-editor-background-color: var(--color-bg);
      --dile-editor-text-color: var(--color-text);
      --dile-editor-focus-color: var(--color-primary);
      --dile-editor-views-nav-background-color: var(--color-gray);
      --dile-editor-views-nav-color: var(--color-text-muted);
      --dile-editor-views-nav-selected-color: var(--color-primary);
      --dile-editor-views-nav-selected-line-color: var(--color-primary);
      --dile-editor-line-height: 1.5rem;
      --dile-input-label-color: transparent;
      --dile-input-label-font-size: 0;

      /* Markdown toolbar icons: smaller + app colors (these inherit into the
         dile-editor shadow tree). NOTE: the icon glyphs themselves are baked
         into @dile/editor and cannot be swapped for the app's lucide set
         without replacing that component. */
      --dile-icon-size: 16px;
      --dile-icon-color: var(--color-gray-dark, #666);
      /* This var feeds the toolbar's --dile-icon-color (dile-editor-toolbar.js)
         and the active-item color — primary made the icons blue. */
      --dile-editor-toolbar-color: var(--color-gray-dark, #666);

      /* Link dialog buttons — match the main app's button styling */
      --dile-primary-color: var(--color-primary);
      --dile-primary-dark-color: var(--color-primary);
      --dile-primary-light-color: var(--color-primary);
      --dile-on-primary-color: #fff;
      --dile-button-border-radius: var(--radius-sm, 4px);
      --dile-button-border-width: 1px;
      --dile-button-font-size: var(--text-sm);
      --dile-button-font-weight: 500;
      --dile-button-padding-y: var(--space-xs);
      --dile-button-padding-x: var(--space-md);
      --dile-button-hover-background-color: var(--color-primary);
      --dile-button-hover-text-color: #fff;
      --dile-button-hover-border-color: var(--color-primary);
    }

    .editor-wrap dile-editor
    {
      display: block;
      font-family: var(--font-sans);
    }

    /* ── Tag manager ── */

    .tag-manager
    {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }

    .tag-list
    {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-xs);
      min-height: 24px;
    }

    .tag-empty
    {
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      opacity: 0.7;
      font-style: italic;
    }

    .tag-chip
    {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px 2px 10px;
      border-radius: 999px;
      border: 1px solid var(--color-border);
      background: var(--color-bg);
      color: var(--color-text-muted);
      font-family: var(--font-sans);
      font-size: var(--text-sm);
      user-select: none;
    }

    .tag-chip.selected
    {
      background: var(--color-gray-dark, #666);
      border-color: var(--color-gray-dark, #666);
      color: #fff;
    }

    .tag-remove
    {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      width: 14px;
      height: 14px;
      border: none;
      border-radius: 50%;
      background: none;
      color: inherit;
      cursor: pointer;
      opacity: 0.8;
      font-size: 12px;
    }

    .tag-remove:hover
    {
      opacity: 1;
      background: rgba(255, 255, 255, 0.25);
    }

    .tag-add
    {
      display: inline-block;
      align-self: flex-start;
      width: fit-content;
    }

    .tag-add wa-button
    {
      width: auto;
    }

    /* ── Fixed footer ── */

    .footer
    {
      position: sticky;
      bottom: 0;
      display: flex;
      justify-content: flex-end;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      background: var(--color-bg-elevated);
      border-top: 1px solid var(--color-border);
      flex-shrink: 0;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'editor-file-manager': EditorFileManager;
  }
}
