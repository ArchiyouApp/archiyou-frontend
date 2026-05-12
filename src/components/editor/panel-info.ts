import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import { msg } from '@lit/localize';
import { selectedScript, scriptMetadata, updateScriptMetadata } from '../../state/workspace.js';
import type { ScriptMetadata } from '../../state/workspace.js';

import '@awesome.me/webawesome/dist/components/input/input.js';
import '@awesome.me/webawesome/dist/components/textarea/textarea.js';
import '@awesome.me/webawesome/dist/components/button/button.js';
import '@awesome.me/webawesome/dist/components/icon/icon.js';
import '@awesome.me/webawesome/dist/components/divider/divider.js';
import '@awesome.me/webawesome/dist/components/tag/tag.js';
import '@awesome.me/webawesome/dist/components/dropdown/dropdown.js';
import '@awesome.me/webawesome/dist/components/dropdown-item/dropdown-item.js';

const MAX_CHARS = 1000;

@customElement('panel-info')
export class PanelInfo extends SignalWatcher(LitElement)
{

  // ── 1. Render ──
  override render()
  {
    return html`
      <div class="header">
        <h2 class="title">${this._projectName || msg("Untitled")}</h2>
        <wa-dropdown placement="bottom-end">
          <wa-button slot="trigger" appearance="plain" size="small">
            <wa-icon name="ellipsis-vertical"></wa-icon>
          </wa-button>
          <wa-dropdown-item value="duplicate">${msg("Duplicate")}</wa-dropdown-item>
          <wa-dropdown-item value="delete">${msg("Delete")}</wa-dropdown-item>
        </wa-dropdown>
      </div>

      <wa-divider></wa-divider>

      <div class="form">
        <wa-input
          .label=${msg("Project name")}
          required
          .value=${this._projectName}
          @input=${this._onProjectNameInput}
        ></wa-input>

        <wa-input
          .label=${msg("Version")}
          required
          .value=${this._version}
          @input=${this._onVersionInput}
        ></wa-input>

        <wa-divider></wa-divider>

        <div class="section-header">
          <div class="section-label">
            <span class="section-title">${msg("Project details")}</span>
            <wa-icon name="circle-question" class="help-icon"></wa-icon>
          </div>
          <p class="section-subtitle">${msg("Write a summary of the project.")}</p>
        </div>

        <wa-textarea
          .value=${this._projectDetails}
          rows="6"
          resize="vertical"
          maxlength=${MAX_CHARS}
          @input=${this._onProjectDetailsInput}
        ></wa-textarea>
        <span class="char-count">
          ${MAX_CHARS - this._projectDetails.length} ${msg("characters left")}
        </span>

        <div class="category-field">
          <label class="field-label">${msg("Category")}</label>
          <div class="tag-input-container">
            ${this._categories.map(cat => html`
              <wa-tag size="small" with-remove
                @wa-remove=${() => this._removeCategory(cat)}
              >${cat}</wa-tag>
            `)}
            <input
              class="tag-text-input"
              .placeholder=${msg("Add category...")}
              @keydown=${this._onTagKeydown}
            />
          </div>
        </div>
      </div>

      <wa-divider></wa-divider>

      <div class="footer">
        <wa-button variant="neutral" appearance="outlined" @click=${this._handleCancel}>
          ${msg("Cancel")}
        </wa-button>
        <wa-button variant="brand" @click=${this._handleSave}>
          ${msg("Save")}
        </wa-button>
      </div>
    `;
  }

  // ── 2. State ──
  @state() private _projectName = '';
  @state() private _version = '';
  @state() private _projectDetails = '';
  @state() private _categories: string[] = [];

  private _savedState: ScriptMetadata = {
    projectName: '',
    version: '',
    projectDetails: '',
    categories: [],
  };

  // ── 3. Lifecycle ──
  override connectedCallback()
  {
    super.connectedCallback();
    this._loadFromScript();
  }

  // ── 4. Behaviour ──
  private _loadFromScript()
  {
    const script = selectedScript.get();
    if (!script) return;

    const stored = scriptMetadata.get();
    const meta: ScriptMetadata = stored.projectName
      ? stored
      : {
          projectName: script.name ?? '',
          version: '',
          projectDetails: '',
          categories: [],
        };

    this._projectName    = meta.projectName;
    this._version        = meta.version;
    this._projectDetails = meta.projectDetails;
    this._categories     = [...meta.categories];
    this._savedState     = { ...meta, categories: [...meta.categories] };
  }

  private _onProjectNameInput(e: Event)
  {
    this._projectName = (e.target as any).value;
  }

  private _onVersionInput(e: Event)
  {
    this._version = (e.target as any).value;
  }

  private _onProjectDetailsInput(e: Event)
  {
    this._projectDetails = (e.target as any).value;
  }

  private _removeCategory(cat: string)
  {
    this._categories = this._categories.filter(c => c !== cat);
  }

  private _onTagKeydown(e: KeyboardEvent)
  {
    if (e.key === 'Enter')
    {
      e.preventDefault();
      const input = e.target as HTMLInputElement;
      const value = input.value.trim();
      if (value && !this._categories.includes(value))
      {
        this._categories = [...this._categories, value];
        input.value = '';
      }
    }
  }

  private _handleCancel()
  {
    this._projectName    = this._savedState.projectName;
    this._version        = this._savedState.version;
    this._projectDetails = this._savedState.projectDetails;
    this._categories     = [...this._savedState.categories];
  }

  private _handleSave()
  {
    if (!this._projectName.trim() || !this._version.trim())
    {
      return;
    }

    const script = selectedScript.get();
    if (!script) return;

    const metadata: ScriptMetadata = {
      projectName:    this._projectName,
      version:        this._version,
      projectDetails: this._projectDetails,
      categories:     [...this._categories],
    };

    updateScriptMetadata(script.id, metadata);
    this._savedState = { ...metadata, categories: [...metadata.categories] };
  }

  // ── 5. Styles ──
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow-y: auto;
      padding: var(--space-4, 16px);
      padding-top: 18px;
      font-family: var(--font-sans);
      color: var(--color-text);
      box-sizing: border-box;
      background: var(--color-bg-elevated, #ffffff);
    }

    *,
    *::before,
    *::after {
      box-sizing: inherit;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .title {
      font-size: var(--text-lg, 18px);
      font-weight: 600;
      margin: 0;
    }

    /* Align WA form-control labels with design system tokens */
    wa-input::part(form-control-label),
    wa-textarea::part(form-control-label) {
      font-size: var(--form-label-font-size, var(--text-sm, 14px));
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4, 16px);
      flex: 1;
    }

    .section-header {
      display: flex;
      flex-direction: column;
      gap: var(--space-1, 4px);
    }

    .section-label {
      display: flex;
      align-items: center;
      gap: var(--space-1, 4px);
    }

    .section-title {
      font-size: var(--text-sm, 14px);
      font-weight: 600;
    }

    .help-icon {
      font-size: 12px;
      color: var(--color-text-muted);
    }

    .section-subtitle {
      font-size: var(--text-sm, 14px);
      color: var(--color-text-muted);
      margin: 0;
    }

    .char-count {
      font-size: var(--text-sm, 14px);
      color: var(--color-text-muted);
      margin-top: calc(-1 * var(--space-3, 12px));
    }

    .category-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm, 8px);
    }

    .field-label {
      font-size: var(--form-label-font-size, var(--text-sm, 14px));
      font-weight: var(--form-label-font-weight, 500);
      color: var(--form-label-color, var(--color-text));
    }

    .tag-input-container {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1, 4px);
      padding: var(--space-sm, 8px) var(--space-3, 12px);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md, 8px);
      background: var(--color-bg, white);
    }

    .tag-text-input {
      border: none;
      outline: none;
      flex: 1;
      min-width: 80px;
      font-family: var(--font-sans);
      font-size: var(--text-base, 16px);
      color: var(--color-text);
      background: transparent;
      padding: var(--space-1, 4px) 0;
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3, 12px);
      padding-top: var(--space-3, 12px);
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'panel-info': PanelInfo;
  }
}
