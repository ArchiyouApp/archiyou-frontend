/**
 * <plugin-part-frame> — host side of the `archiyou` bridge.
 *
 * Mounts a flattened HTML part (param menu / tool) in a sandboxed srcdoc
 * iframe and talks to it over postMessage. The bridge shim (injected into the
 * part's <head>) exposes `window.archiyou` inside the iframe:
 *   archiyou.onSchema(cb) · archiyou.submit(values) · archiyou.onResult(cb)
 *
 * Host → iframe:  { type:'schema', schema } · { type:'result', result }
 * iframe → host:  { type:'ready' }          · { type:'submit', values }
 */

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const BRIDGE_SHIM = `<script>
(function(){
  var P = function(m){ parent.postMessage(Object.assign({__archiyou:true}, m), '*'); };
  var schemaCb=null, resultCb=null, lastSchema=null, lastResult=null;
  window.archiyou = {
    onSchema: function(cb){ schemaCb=cb; if(lastSchema!==null) cb(lastSchema); },
    submit:   function(values){ P({type:'submit', values:values}); },
    onResult: function(cb){ resultCb=cb; if(lastResult!==null) cb(lastResult); },
  };
  window.addEventListener('message', function(e){
    var d=e.data; if(!d||!d.__archiyou) return;
    if(d.type==='schema'){ lastSchema=d.schema; if(schemaCb) schemaCb(d.schema); }
    if(d.type==='result'){ lastResult=d.result; if(resultCb) resultCb(d.result); }
  });
  // Announce readiness after the part's own scripts have registered handlers.
  window.addEventListener('load', function(){ P({type:'ready'}); });
})();
</script>`;

@customElement('plugin-part-frame')
export class PluginPartFrame extends LitElement
{
  /** The part's HTML source (self-contained document). */
  @property({ attribute: false }) src = '';
  /** The input schema handed to the part on 'ready'. */
  @property({ attribute: false }) schema: unknown = null;

  static override styles = css`
    :host { display: block; height: 100%; }
    iframe { width: 100%; height: 100%; border: 0; background: #fff; }
  `;

  private _onMessage = (e: MessageEvent): void =>
  {
    const frame = this.renderRoot.querySelector('iframe');
    if (!frame || e.source !== frame.contentWindow) return;

    const d = e.data;
    if (!d || !d.__archiyou) return;

    if (d.type === 'ready')
    {
      this._post({ type: 'schema', schema: this.schema });
    }
    else if (d.type === 'submit')
    {
      this.dispatchEvent(new CustomEvent('plugin-submit', {
        detail: d.values,
        bubbles: true,
        composed: true,
      }));
    }
  };

  private _post(msg: Record<string, unknown>): void
  {
    const frame = this.renderRoot.querySelector('iframe');
    frame?.contentWindow?.postMessage({ __archiyou: true, ...msg }, '*');
  }

  override connectedCallback(): void
  {
    super.connectedCallback();
    window.addEventListener('message', this._onMessage);
  }

  override disconnectedCallback(): void
  {
    window.removeEventListener('message', this._onMessage);
    super.disconnectedCallback();
  }

  /** Inject the bridge shim so `window.archiyou` exists before the part runs. */
  private _srcdoc(): string
  {
    return this.src.includes('</head>')
      ? this.src.replace('</head>', `${BRIDGE_SHIM}</head>`)
      : BRIDGE_SHIM + this.src;
  }

  override render()
  {
    return html`<iframe sandbox="allow-scripts" .srcdoc=${this._srcdoc()}></iframe>`;
  }
}

declare global
{
  interface HTMLElementTagNameMap { 'plugin-part-frame': PluginPartFrame; }
}
