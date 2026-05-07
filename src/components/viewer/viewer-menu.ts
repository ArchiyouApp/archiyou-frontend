import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { VIEW_STYLES } from './view-styles.js';

import '@awesome.me/webawesome/dist/components/icon/icon.js';

@customElement('viewer-menu')
export class ViewerMenu extends LitElement
{
  @property() activeStyleId = 'realistic';
  @property({ type: Boolean }) arSupported = false;
  @property({ type: Boolean }) arActive = false;
  @property({ type: Boolean }) isOrtho = false;
  @property({ type: Array }) animations: string[] = [];
  @property() activeAnimation: string | null = null;

  @state() private _stylesOpen = false;
  @state() private _animOpen = false;

  private _docClickHandler = (e: MouseEvent) =>
  {
    if ((this._stylesOpen || this._animOpen) && !e.composedPath().includes(this as unknown as EventTarget))
    {
      this._stylesOpen = false;
      this._animOpen = false;
      document.removeEventListener('click', this._docClickHandler);
    }
  };

  private _toggleStyles = () =>
  {
    this._stylesOpen = !this._stylesOpen;
    this._animOpen = false;
    if (this._stylesOpen)
    {
      setTimeout(() => document.addEventListener('click', this._docClickHandler), 0);
    }
    else
    {
      document.removeEventListener('click', this._docClickHandler);
    }
  };

  private _toggleAnim = () =>
  {
    this._animOpen = !this._animOpen;
    this._stylesOpen = false;
    if (this._animOpen)
    {
      setTimeout(() => document.addEventListener('click', this._docClickHandler), 0);
    }
    else
    {
      document.removeEventListener('click', this._docClickHandler);
    }
  };

  private _selectStyle = (styleId: string) =>
  {
    this._stylesOpen = false;
    document.removeEventListener('click', this._docClickHandler);
    this.dispatchEvent(new CustomEvent('viewer-set-style', {
      detail: { styleId },
      bubbles: true,
      composed: true,
    }));
  };

  private _selectAnimation = (name: string | null) =>
  {
    this._animOpen = false;
    document.removeEventListener('click', this._docClickHandler);
    this.dispatchEvent(new CustomEvent('viewer-set-animation', {
      detail: { name },
      bubbles: true,
      composed: true,
    }));
  };

  private _emit = (type: string) =>
  {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
  };

  override disconnectedCallback()
  {
    super.disconnectedCallback();
    document.removeEventListener('click', this._docClickHandler);
    this._stylesOpen = false;
    this._animOpen = false;
  }

  override render()
  {
    const arTitle = this.arActive
      ? 'Exit AR'
      : this.arSupported
        ? 'Enter AR'
        : 'AR not supported on this device';

    return html`
      <aside>
        <!-- nav group -->
        <div class="group">
          <button class="icon-btn" title="Zoom in" @click=${() => this._emit('viewer-zoom-in')}>
            <wa-icon name="magnifying-glass-plus"></wa-icon>
          </button>
          <button class="icon-btn" title="Zoom out" @click=${() => this._emit('viewer-zoom-out')}>
            <wa-icon name="magnifying-glass-minus"></wa-icon>
          </button>
          <button class="icon-btn" title="Fit to view" @click=${() => this._emit('viewer-center')}>
            <wa-icon name="expand"></wa-icon>
          </button>
        </div>

        <hr />

        <!-- view group -->
        <div class="group">
          <!-- view styles with flyout -->
          <div class="style-anchor">
            <button
              class="icon-btn ${this._stylesOpen ? 'active' : ''}"
              title="View style"
              @click=${this._toggleStyles}
            >
              <wa-icon name="palette"></wa-icon>
            </button>

            ${this._stylesOpen ? html`
              <div class="styles-flyout">
                ${VIEW_STYLES.map(s => html`
                  <button
                    class="style-item ${s.id === this.activeStyleId ? 'active' : ''}"
                    @click=${() => this._selectStyle(s.id)}
                  >
                    <wa-icon name=${s.icon}></wa-icon>
                    <span>${s.label}</span>
                  </button>
                `)}
              </div>
            ` : ''}
          </div>

          <!-- animation selector (only shown when animations are available) -->
          ${this.animations.length > 0 ? html`
            <div class="style-anchor">
              <button
                class="icon-btn ${this._animOpen ? 'active' : ''}"
                title="Animations"
                @click=${this._toggleAnim}
              >
                <wa-icon name="film"></wa-icon>
              </button>

              ${this._animOpen ? html`
                <div class="styles-flyout">
                  <button
                    class="style-item ${this.activeAnimation === null ? 'active' : ''}"
                    @click=${() => this._selectAnimation(null)}
                  >
                    <wa-icon name="stop"></wa-icon>
                    <span>Rest pose</span>
                  </button>
                  ${this.animations.map(name => html`
                    <button
                      class="style-item ${name === this.activeAnimation ? 'active' : ''}"
                      @click=${() => this._selectAnimation(name)}
                    >
                      <wa-icon name="play"></wa-icon>
                      <span>${name}</span>
                    </button>
                  `)}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- projection toggle -->
          <button
            class="icon-btn ${this.isOrtho ? 'active' : ''}"
            title=${this.isOrtho ? 'Switch to Perspective' : 'Switch to Isometric'}
            @click=${() => this._emit('viewer-toggle-projection')}
          >
            <wa-icon name="cube"></wa-icon>
          </button>

          <!-- render: placeholder for future -->
          <button class="icon-btn disabled" title="Render (coming soon)" disabled>
            <wa-icon name="camera"></wa-icon>
          </button>

          <!-- AR mode -->
          <button
            class="icon-btn ${this.arActive ? 'active' : ''} ${!this.arSupported ? 'disabled' : ''}"
            title=${arTitle}
            ?disabled=${!this.arSupported}
            @click=${() => this.arSupported && this._emit('viewer-toggle-ar')}
          >
            <wa-icon name="vr-cardboard"></wa-icon>
          </button>
        </div>
      </aside>
    `;
  }

  // ── Styles ──
  static override styles = css`
    :host {
      display: block;
    }

    aside {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px;
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.09);
    }

    .group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    hr {
      width: 22px;
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      margin: 3px 0;
    }

    .icon-btn {
      width: 34px;
      height: 34px;
      padding: 0;
      border: none;
      background: transparent;
      border-radius: 7px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(226, 232, 240, 0.75);
      font-size: 14px;
      transition: background 0.12s ease, color 0.12s ease;
    }

    .icon-btn:hover:not(:disabled):not(.disabled) {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
    }

    .icon-btn.active {
      background: rgba(16, 62, 170, 0.55);
      color: #93c5fd;
    }

    .icon-btn.disabled,
    .icon-btn:disabled {
      opacity: 0.28;
      cursor: not-allowed;
    }

    .style-anchor {
      position: relative;
    }

    .styles-flyout {
      position: absolute;
      right: calc(100% + 10px);
      top: 0;
      z-index: 100;
      background: rgba(10, 16, 32, 0.93);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9px;
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 148px;
    }

    .style-item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 7px 11px;
      border: none;
      background: transparent;
      color: rgba(226, 232, 240, 0.72);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-family: inherit;
      text-align: left;
      white-space: nowrap;
      transition: background 0.1s ease, color 0.1s ease;
    }

    .style-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
    }

    .style-item.active {
      background: rgba(16, 62, 170, 0.45);
      color: #93c5fd;
    }

    .style-item wa-icon {
      font-size: 13px;
      flex-shrink: 0;
    }
  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'viewer-menu': ViewerMenu;
  }
}
