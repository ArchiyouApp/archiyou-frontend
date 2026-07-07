import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { SignalWatcher } from '@lit-labs/signals';
import { type RouterLocation } from '@vaadin/router';

import { pluginMode, enterPluginMode, exitPluginMode, type PluginModeState } from '../state/plugin-mode';
import { PluginManager, type PluginResultSummary, type GeneratedOutput } from '../plugins/PluginManager';
import { loadPluginFromDirectory, loadPluginFromFiles, loadShapePicker, scriptStem, requestWritePermission, writeFileText, pickPluginFolderFiles } from '../plugins/plugin-loader';
import type { LoadedPlugin } from '../plugins/types';
import { dataToModuleString } from '@archiyou/core/src/utils';
import '../plugins/plugin-part-frame';

import { createExecutionFailureResult, runScript, warmupWorker } from '../services/execution-service';

import '@archiyou/ui/editor/main-menu.js';
import '@archiyou/ui/editor/codebox.js';
import '@archiyou/ui/viewer/model-viewer.js';
import '@archiyou/ui/params/param-menu.js';
import '@archiyou/ui/params/presets-menu.js';
import '@archiyou/ui/editor/toolbar.js';
import '@archiyou/ui/editor/tool-panels.js';
import '@archiyou/ui/editor/tools/scene-tool.js';
import '@archiyou/ui/editor/tools/data-tool.js';
import '@archiyou/ui/editor/tools/metrics-tool.js';
import '@archiyou/ui/editor/tools/document-viewer.js';
import '@archiyou/ui/editor/tools/console-tool.js';
import '@archiyou/ui/editor/file-info.js';
import '@archiyou/ui/editor/script-manager.js';
import '@archiyou/ui/editor/script-importer.js';
import type { ToolDef } from '@archiyou/ui/editor/toolbar.js';

import { editorScript, executing, executionResult, scriptParams, scripts, updateScriptCode, setExecutionResult, setExecuting, paramValue, createNewScript, openScript, deleteScriptById, importScriptFromData, selectedPath, scriptUnitSystem, ensureScriptUnitSystem } from '../state/workspace';
import { registerScheduleExecution, triggerResetCamera } from '../state/viewer';
import { RunnerScriptExecutionRequest } from '@archiyou/core/src/runner/types';
import type { ScriptData, ScriptParamData } from '@archiyou/core/src/execution/types';

@customElement('page-editor')
export class PageEditor extends SignalWatcher(LitElement)
{
  //// SETTINGS ////
  CONST_AUTORUN_DELAY = 1000;    // ms to wait after code changes before auto-running
  CONST_AUTORUN_MIN_SIZE = 20;   // minimum code length to trigger auto-run

  readonly TOOLS: ToolDef[] = [
    { id: 'console', icon: 'terminal',   name: 'Console',   exclusive: false, component: 'editor-console-tool',  width: 30, height: 50 },
    { id: 'scene',   icon: 'network',    name: 'Scene',     exclusive: false, component: 'editor-scene-tool',    width: 30, height: 50 },
    { id: 'data',    icon: 'table',      name: 'Data',      exclusive: false, component: 'editor-data-tool',     width: 30, height: 50 },
    { id: 'metrics', icon: 'chart-bar',  name: 'Metrics',   exclusive: false, component: 'editor-metrics-tool',  width: 30, height: 50,  outputs: ['default/metrics/*/json'] },
    { id: 'docs',    icon: 'file-text',  name: 'Documents', exclusive: true,  component: 'editor-document-tool', width: 40, height: 100, outputs: ['default/docs/*/svg', 'default/docs/*/svg-pages'] },
  ];

  //// 

  override render()
  {
    const pm = pluginMode.get();
    // Track the script's unit system so a flip re-runs to regenerate doc/SVG text.
    this._pendingUnitSystem = scriptUnitSystem.get();
    return html`
      <editor-main-menu
        .active=${this._activeSection}
        @menu-action=${this._handleMenuAction}
        @menu-select=${this._handleMenuSelect}
      ></editor-main-menu>
      <wa-split-panel
            position="50"
            snap="25% 50% 75%"
        >
        <wa-icon class="split-grip"
            slot="divider" variant="solid" name="grip-lines-vertical"></wa-icon>
        ${pm ? this._renderPluginLeftPanel(pm) : html`
        <div class="left-panel" slot="start">
          <editor-file-info></editor-file-info>
          <presets-menu></presets-menu>
          <param-menu @param-value-change=${() => this._scheduleParamExecute()}></param-menu>
          <editor-code-box
              .code=${editorScript.get()?.code ?? ''}
            @change=${this._handleCodeChange}
            @execute=${this._handleExecute}
          ></editor-code-box>
        </div>`}
        <wa-split-panel
          slot="end"
          class="viewer-tools-split"
          position=${this._activeTools.length > 0 ? 100 - this._activeTools.reduce((max, t) => Math.max(max, t.width), 0) : 100}
        >
          ${this._activeTools.length > 0 ? html`<wa-icon slot="divider" class="split-grip" variant="solid" name="grip-lines-vertical"></wa-icon>` : ''}
          <model-viewer slot="start"></model-viewer>
          <editor-tool-panels
            slot="end"
            .tools=${this._activeTools}
            @tool-close=${this._handleToolClose}
          ></editor-tool-panels>
        </wa-split-panel>
      </wa-split-panel>
      <editor-toolbar
        .tools=${this._toolbarTools(pm)}
        .activeIds=${this._activeTools.map(t => t.id)}
        @tool-toggle=${this._handleToolToggle}
      ></editor-toolbar>
      <script-manager
        ?open=${this._showScriptManager}
        @script-manager-open=${this._handleScriptManagerOpen}
        @script-manager-cancel=${this._handleScriptManagerCancel}
        @script-delete=${this._handleScriptDelete}
      ></script-manager>
      <script-importer
        ?open=${this._showScriptImporter}
        @script-importer-cancel=${this._handleScriptImporterCancel}
        @script-importer-import=${this._handleScriptImporterImport}
      ></script-importer>
    `;
  }

  // Properties
  @property({ attribute: false }) location?: RouterLocation;

  @state() private _activeSection: 'info' | 'code' | 'history' | 'files' | 'templates' | 'help' | 'settings' | null = 'code';
  @state() private _activeTools: ToolDef[] = [];
  @state() private _showScriptManager = false;
  @state() private _showScriptImporter = false;

  // Plugin mode (isolated session; personal scripts untouched)
  @state() private _pluginSchema: ScriptParamData[] | null = null;
  @state() private _pluginActiveScriptName: string | null = null;
  @state() private _pluginResult: PluginResultSummary | null = null;
  @state() private _pluginSaved = false;
  private _pluginValues: Record<string, any> = {};
  private _pluginRunTimeout: number | null = null;



  // Lifecycle
  override connectedCallback()
  {
    super.connectedCallback();
    // Register execution callback so the viewer can trigger re-execution
    // when a handle (or other interaction) changes a param value.
    registerScheduleExecution(() => this._scheduleParamExecute());
    // Default: open scene tool
    const sceneTool = this.TOOLS.find(t => t.id === 'scene');
    if (sceneTool) this._activeTools = [sceneTool];

    this._consumeNewQueryParam();

    console.info('Editor::connectedCallback(): Warming up worker…');
    warmupWorker()
      .then(() => {
        console.info('Editor::connectedCallback(): Worker ready');
        this.checkAutoRun(true);
      })
      .catch(err => {
        console.error('Editor: worker init failed:', err);
        setExecutionResult(createExecutionFailureResult({
          kernel: 'mesh',
          script: editorScript.get()?.toData() as any,
        } as any, err));
      });
  }

  override willUpdate(changed: Map<string, unknown>)
  {
    // Also handle in-place navigation to /editor?new (Vaadin Router may
    // re-resolve the route without a full re-mount).
    if (changed.has('location')) this._consumeNewQueryParam();
  }

  override updated()
  {
    // Persist a default (metric) unit system onto any script that has none, so
    // every script carries an explicit setting. Idempotent — runs once per script.
    ensureScriptUnitSystem();

    // Metric/Imperial flip → re-run so doc/SVG dimension text regenerates with
    // the new units (3D dims + readouts already update live). Skip the first
    // paint (no prior value) to avoid an extra run on load.
    if (this._lastUnitSystem !== null && this._pendingUnitSystem !== this._lastUnitSystem)
    {
      this._lastUnitSystem = this._pendingUnitSystem;
      this.checkAutoRun(true);
    }
    else
    {
      this._lastUnitSystem = this._pendingUnitSystem;
    }
  }

  private _pendingUnitSystem: string | null = null;
  private _lastUnitSystem: string | null = null;

  /** If the URL has a `new` query param, archive the active script,
   *  create a fresh one, then clean the URL so a refresh doesn't repeat. */
  private _consumeNewQueryParam()
  {
    try
    {
      const params = new URL(window.location.href).searchParams;
      if (!params.has('new')) return;
      createNewScript();
      history.replaceState(null, '', '/editor');
    }
    catch (err)
    {
      console.warn('Editor::_consumeNewQueryParam():', err);
    }
  }

  // Internal state
  private _code = '';
  private _codeChangeTimeout: number | null = null;
  private _paramExecTimeout: number | null = null;

  // Methods 

  /** Execute immediately (50 ms debounce to coalesce rapid slider ticks) after a param value change */
  private _scheduleParamExecute()
  {
    if (this._paramExecTimeout !== null) clearTimeout(this._paramExecTimeout);
    this._paramExecTimeout = window.setTimeout(() =>
    {
      this._paramExecTimeout = null;
      this.execute();
    }, 50);
  }

  private _handleCodeChange(e: CustomEvent<string>)
  {
    console.log('Code change event:', e.detail);
    this._code = e.detail;
    updateScriptCode(this._code);
    this.checkAutoRun();
  }

  /** Check if code meets criteria and auto-run now or after the idle delay. */
  checkAutoRun(immediate: boolean = false)
  {
    const scriptCode = editorScript.get()?.code ?? '';
    if (this._codeChangeTimeout !== null)
    {
      clearTimeout(this._codeChangeTimeout);
    }

    if (scriptCode.length < this.CONST_AUTORUN_MIN_SIZE)
    {
      this._codeChangeTimeout = null;
      return;
    }

    if (immediate)
    {
      this._codeChangeTimeout = null;
      this.execute();
      return;
    }

    this._codeChangeTimeout = window.setTimeout(() =>
    {
      this._codeChangeTimeout = null;
      this.execute();
    }, this.CONST_AUTORUN_DELAY);
  }

  /** Build an execution request for the current script and params. */
  private _buildRequest(outputs: string[], messages: string[] = ['info', 'geom', 'user', 'warn', 'error', 'exec']): RunnerScriptExecutionRequest
  {
    // The active script already serialises its canonical params (with schema,
    // default, order, units, _value) via toData().
    const active = editorScript.get();
    const scriptData = active?.toData() as any;
    const params = scriptParams.get();

    const paramValues: Record<string, any> = Object.fromEntries(
      params.map(p => [p.name, paramValue(p)])
    );

    // Forward the local library (excluding the active script) so the Runner
    // can resolve $component('./name') against linked scripts. Sent as
    // ScriptData[] — structured-clone-safe over the Comlink boundary.
    const componentScripts = scripts.get()
      .filter(s => s.fileId !== active?.fileId)
      .map(s => s.toData());

    return {
      outputs,
      messages,
      script: scriptData,
      params: paramValues,
      selection: selectedPath.get() ? [selectedPath.get() as string] : [],
      componentScripts,
      // editor: display in the script's own unit system
      unitSystem: scriptUnitSystem.get(),
    } as RunnerScriptExecutionRequest;
  }

  /** Execute the current script: produces model + tables.
   *  Then triggers a separate lean run for any active tool-specific outputs. */
  async execute()
  {
    const result = await runScript(
      this._buildRequest(['default/model/glb', 'default/tables/*/json'])
    );

    if (result)
    {
      setExecutionResult(result);
      await this._executeToolOutputs();
      return result;
    }
    else
    {
      console.error(`Execute failed without result. This should not happen!`);
    }
  }

  /** Run a lean extra execute for any active tools that declare outputs (e.g. metrics, docs).
   *  The results are merged into the current editorState result, avoiding a second heavy model export. */
  private async _executeToolOutputs()
  {
    const toolOutputs = this._activeTools.flatMap(t => t.outputs ?? []);
    if (toolOutputs.length === 0) return;

    const extraResult = await runScript(
      this._buildRequest(toolOutputs, ['error'])
    );

    if (!extraResult)
    {
      return;
    }

    const current = executionResult.get();
    if (!current)
    {
      setExecutionResult(extraResult);
      return;
    }

    const mergedMessages = [...(current.messages ?? []), ...(extraResult.messages ?? [])];
    const mergedOutputs = [...(current.outputs ?? []), ...(extraResult.outputs ?? [])];
    const mergedWarnings = [...(current.warnings ?? []), ...(extraResult.warnings ?? [])];

    if (
      extraResult.status === 'error'
      || (extraResult.errors?.length ?? 0) > 0
      || mergedOutputs.length !== (current.outputs?.length ?? 0)
      || mergedMessages.length !== (current.messages?.length ?? 0)
      || mergedWarnings.length !== (current.warnings?.length ?? 0)
    )
    {
      setExecutionResult({
        ...current,
        status: extraResult.status === 'error' ? 'error' : current.status,
        created: extraResult.created ?? current.created,
        duration: (current.duration ?? 0) + (extraResult.duration ?? 0),
        request: extraResult.request ?? current.request,
        errors: extraResult.status === 'error'
          ? (extraResult.errors ?? current.errors)
          : current.errors,
        warnings: mergedWarnings,
        messages: mergedMessages,
        outputs: mergedOutputs,
      });
    }
  }


  private _handleMenuAction(e: CustomEvent<string>)
  {
    const value = e.detail;

    if (value === 'new')
    {
      // Call directly: Vaadin Router skips re-resolving when the path is
      // unchanged (same /editor route), so a Router.go('/editor?new') won't
      // reliably re-trigger willUpdate. The URL-based ?new entry point still
      // works on first mount via _consumeNewQueryParam.
      createNewScript();
      return;
    }

    if (value === 'open-script')
    {
      this._showScriptManager = true;
      return;
    }

    if (value === 'import-data')
    {
      this._showScriptImporter = true;
      return;
    }

    if (value === 'export-script-data')
    {
      this._exportScriptDataAsJs();
      return;
    }

    if (value === 'plugin-start')
    {
      // Enter plugin mode with the bundled example plugin.
      void this._enterPluginMode(() => loadShapePicker());
      return;
    }

    if (value === 'plugin-add')
    {
      void this._addPluginFromFolder();
      return;
    }

    this.dispatchEvent(new CustomEvent('editor-action', {
      detail: value,
      bubbles: true,
      composed: true,
    }));
  }

  /** Plugins ▸ Add plugin — pick a plugin folder from disk and enter plugin mode in the editor. */
  private async _addPluginFromFolder()
  {
    const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<FileSystemDirectoryHandle>);
    try
    {
      if (typeof picker === 'function')
      {
        const dir = await picker();
        await this._enterPluginMode(() => loadPluginFromDirectory(dir), dir);
      }
      else
      {
        // Firefox/Safari: read-only snapshot — no dirHandle, so save-back stays hidden.
        const files = await pickPluginFolderFiles();
        if (!files) return;
        await this._enterPluginMode(() => loadPluginFromFiles(files), null);
      }
    }
    catch (err)
    {
      if ((err as Error)?.name !== 'AbortError')
      {
        console.error('Add plugin failed:', err);
        window.alert(`Could not load plugin: ${(err as Error)?.message ?? err}`);
      }
    }
  }

  // ── Plugin mode (isolated session) ──

  /** Load a plugin and enter plugin mode (isolated; personal scripts untouched). */
  private async _enterPluginMode(
    loader: () => Promise<LoadedPlugin>,
    dirHandle: FileSystemDirectoryHandle | null = null,
  ): Promise<void>
  {
    const plugin = await loader();
    const manager = new PluginManager();
    this._pluginSchema = await manager.activate(plugin);
    this._pluginValues = {};
    this._pluginResult = manager.summary;
    this._pluginActiveScriptName = manager.mainScriptName() ?? null;
    enterPluginMode({ plugin, dirHandle, manager });
  }

  private _renderPluginLeftPanel(pm: PluginModeState)
  {
    const manager = pm.manager;
    const list = manager.scripts();
    const active = this._pluginActiveScriptName ?? manager.mainScriptName() ?? '';
    const paramMenuHtml = manager.mainUiHtml();
    return html`
      <div class="left-panel plugin" slot="start">
        <div class="plugin-banner">
          <span class="plugin-badge">PLUGIN</span>
          <span class="plugin-name">${pm.plugin.manifest.name}</span>
          ${pm.dirHandle ? html`
            <button class="plugin-save" @click=${this._savePluginToDisk} title="Save edited scripts back to the plugin folder">
              ${this._pluginSaved ? 'Saved ✓' : 'Save'}
            </button>` : ''}
          <button class="plugin-exit" @click=${this._exitPluginMode}>Exit</button>
        </div>
        ${list.length > 1 ? html`
          <select class="plugin-script-select" @change=${this._onPluginScriptSelect}>
            ${list.map(s => html`<option value=${s.name} ?selected=${s.name === active}>${s.name}${s.isMain ? ' (main)' : ''}</option>`)}
          </select>` : ''}
        ${paramMenuHtml ? html`
          <plugin-part-frame
            class="plugin-param-frame"
            .src=${paramMenuHtml}
            .schema=${this._pluginSchema}
            .result=${this._pluginResult}
            .onGenerate=${this._pluginGenerate}
            @plugin-submit=${this._handlePluginSubmit}
            @plugin-ui-command=${this._handlePluginUiCommand}
          ></plugin-part-frame>` : ''}
        <editor-code-box
          .code=${manager.scriptCode(active) ?? ''}
          @change=${this._handlePluginCodeChange}
          @execute=${this._handlePluginExecute}
        ></editor-code-box>
      </div>`;
  }

  private _onPluginScriptSelect = (e: Event): void =>
  {
    this._pluginActiveScriptName = (e.target as HTMLSelectElement).value;
  };

  private _handlePluginCodeChange = (e: CustomEvent<string>): void =>
  {
    const pm = pluginMode.get();
    if (!pm) return;
    const name = this._pluginActiveScriptName ?? pm.manager.mainScriptName();
    if (name) pm.manager.setScriptCode(name, e.detail);
    if (this._pluginRunTimeout !== null) clearTimeout(this._pluginRunTimeout);
    this._pluginRunTimeout = window.setTimeout(() => void this._runPlugin(), this.CONST_AUTORUN_DELAY);
  };

  private _handlePluginExecute = (): void =>
  {
    if (this._pluginRunTimeout !== null) clearTimeout(this._pluginRunTimeout);
    void this._runPlugin();
  };

  private _handlePluginSubmit = (e: Event): void =>
  {
    this._pluginValues = (e as CustomEvent).detail as Record<string, any>;
    void this._runPlugin();
  };

  private _pluginGenerate = (selectors: string[]): Promise<GeneratedOutput[]> =>
    pluginMode.get()?.manager.generate(selectors) ?? Promise.resolve([]);

  private async _runPlugin(): Promise<void>
  {
    const pm = pluginMode.get();
    if (!pm) return;
    await pm.manager.run(this._pluginValues ?? {});
    this._pluginResult = pm.manager.summary;
  }

  /** Save the (scripts-only) working set back to the on-disk plugin folder. */
  private _savePluginToDisk = async (): Promise<void> =>
  {
    const pm = pluginMode.get();
    if (!pm?.dirHandle) return;

    const manifest = pm.plugin.manifest;
    const pathByStem = new Map<string, string>();
    if (manifest.mainScript) pathByStem.set(scriptStem(manifest.mainScript), manifest.mainScript);
    for (const p of manifest.scripts ?? []) pathByStem.set(scriptStem(p), p);

    try
    {
      if (!(await requestWritePermission(pm.dirHandle)))
      {
        window.alert('Write permission was denied.');
        return;
      }
      for (const entry of pm.manager.scripts())
      {
        const path = pathByStem.get(entry.name);
        if (!path) continue;
        // Preserve the module's other fields (name/author/…); only the code changed.
        const moduleObj = pm.plugin.scriptModules[entry.name] ?? { name: entry.name };
        await writeFileText(pm.dirHandle, path, dataToModuleString({ ...moduleObj, code: entry.code }));
      }
      this._pluginSaved = true;
      window.setTimeout(() => { this._pluginSaved = false; }, 1500);
    }
    catch (err)
    {
      console.error('Save plugin failed:', err);
      window.alert(`Save failed: ${(err as Error)?.message ?? err}`);
    }
  };

  private _exitPluginMode = (): void =>
  {
    if (this._pluginRunTimeout !== null) { clearTimeout(this._pluginRunTimeout); this._pluginRunTimeout = null; }
    exitPluginMode();
    this._pluginSchema = null;
    this._pluginActiveScriptName = null;
    this._pluginResult = null;
    this._pluginValues = {};
    this._activeTools = this._activeTools.filter(t => !t.plugin);
    // Restore the viewer to the user's own (untouched) script.
    void this._handleExecute();
  };

  private _handleScriptManagerOpen(e: CustomEvent<string>)
  {
    openScript(e.detail);
    this._showScriptManager = false;
    triggerResetCamera();
    // Run the freshly-opened script so the viewer/params reflect it immediately.
    this._handleExecute();
  }

  private _handleScriptManagerCancel()
  {
    this._showScriptManager = false;
  }

  private _handleScriptImporterCancel()
  {
    this._showScriptImporter = false;
  }

  private _exportScriptDataAsJs()
  {
    const script = editorScript.get();
    if (!script) return;

    const js = script.toScriptJs();
    const blob = new Blob([js], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const filename = script.name ? `${script.name}.js` : 'script.js';

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private _handleScriptImporterImport(e: CustomEvent<ScriptData>)
  {
    const imported = importScriptFromData(e.detail as unknown as Record<string, any>);
    if (!imported) return;
    this._showScriptImporter = false;
  }

  private _handleScriptDelete(e: CustomEvent<string>)
  {
    deleteScriptById(e.detail);
  }

  private _handleMenuSelect(e: CustomEvent<'info' | 'code' | 'history' | 'files' | 'templates' | 'help' | 'settings' | null>)
  {
    this._activeSection = e.detail;
    this.dispatchEvent(new CustomEvent('editor-section', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }));
  }

  /** Plugin tools as toolbar entries (tinted, rendered as flattened parts). */
  private _pluginToolDefs(pm: PluginModeState | null): ToolDef[]
  {
    return (pm?.plugin.manifest.tools ?? []).map(t => ({
      id: `plugin:${t.id}`,
      icon: t.icon ?? 'puzzle',
      name: t.name,
      exclusive: t.exclusive ?? false,
      component: '',
      width: 30,
      height: 100,
      plugin: true,
      ui: t.ui,
    }));
  }

  /** Built-in tools plus (in plugin mode) the plugin's tools. */
  private _toolbarTools(pm: PluginModeState | null): ToolDef[]
  {
    return pm ? [...this.TOOLS, ...this._pluginToolDefs(pm)] : this.TOOLS;
  }

  /** archiyou.ui.open/close/toggle('Export') from a plugin part → toggle its tool panel. */
  private _handlePluginUiCommand = (e: Event): void =>
  {
    const { action, tool } = (e as CustomEvent).detail as { action: 'open' | 'close' | 'toggle'; tool: string };
    const pm = pluginMode.get();
    if (!pm) return;
    const key = String(tool).toLowerCase();
    const def = this._pluginToolDefs(pm).find(d =>
      d.id.replace(/^plugin:/, '').toLowerCase() === key || d.name.toLowerCase() === key);
    if (!def) return;

    const isActive = this._activeTools.some(t => t.id === def.id);
    const open = action === 'toggle' ? !isActive : action === 'open';
    if (open && !isActive)
    {
      const base = def.exclusive ? [] : this._activeTools.filter(t => !t.exclusive);
      this._activeTools = [...base, def];
    }
    else if (!open && isActive)
    {
      this._activeTools = this._activeTools.filter(t => t.id !== def.id);
    }
  };

  private _handleToolToggle(e: CustomEvent<string>)
  {
    const id = e.detail;
    const tool = this._toolbarTools(pluginMode.get()).find(t => t.id === id);
    if (!tool) return;

    const isActive = this._activeTools.some(t => t.id === id);

    if (isActive)
    {
      this._activeTools = this._activeTools.filter(t => t.id !== id);
    }
    else
    {
      const base = tool.exclusive ? [] : this._activeTools.filter(t => !t.exclusive);
      this._activeTools = [...base, tool];
      // If the newly active tool declares outputs and we already have a result,
      // run a lean extra execute immediately to populate its data.
      if (tool.outputs?.length && executionResult.get())
      {
        this._executeToolOutputs();
      }
    }
  }

  private _handleToolClose(e: CustomEvent<string>)
  {
    this._activeTools = this._activeTools.filter(t => t.id !== e.detail);
  }

  private async _handleExecute()
  {
    if (executing.get())
    {
      console.warn('Already running a script, ignoring execute command');
      return;
    }

    setExecuting(true);

    try { 
      const executionResult = await this.execute();
      console.log(executionResult);
    }
    catch (err)
    {
      console.error('Execute error:', err);
    }
    finally
    {
      setExecuting(false);
    }
  }
  

  //// CSS STYLES ////

  static override styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    wa-split-panel {
      flex: 1;
      min-height: 0;
      --divider-width: 12px;
    }

    /* Outer horizontal split: keep both panels at least 300px wide.
       --min applies to the start (left) panel; --max prevents it from
       pushing the end panel below 300px either. */
    wa-split-panel:not(.left-split):not(.viewer-tools-split) {
      --min: 300px;
      --max: calc(100% - 300px);
    }

    editor-main-menu { flex-shrink: 0; }
    editor-toolbar    { flex-shrink: 0; }

    .viewer-tools-split {
      width: 100%;
      height: 100%;
      --divider-width: 12px;
    }

    editor-tool-panels {
      width: 100%;
      height: 100%;
      min-width: 0;
      border-left: 1px solid var(--color-border);
    }

    .left-panel {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    .left-panel editor-code-box {
      flex: 1;
      min-height: 0;
    }

    /* Plugin mode */
    .plugin-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: var(--color-primary-subtle, color-mix(in srgb, var(--color-primary, #4f46e5) 12%, transparent));
      border-bottom: 1px solid var(--color-border, #e5e7eb);
      font-family: system-ui, sans-serif;
    }
    .plugin-badge {
      background: var(--color-primary, #4f46e5);
      color: #fff;
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .plugin-name { font-weight: 600; font-size: 13px; }
    .plugin-save {
      margin-left: auto;
      font: inherit;
      font-size: 12px;
      padding: 3px 10px;
      border: 1px solid var(--color-primary, #4f46e5);
      border-radius: 6px;
      background: var(--color-primary, #4f46e5);
      color: #fff;
      cursor: pointer;
    }
    .plugin-exit {
      font: inherit;
      font-size: 12px;
      padding: 3px 10px;
      border: 1px solid var(--color-border, #d1d5db);
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
    }
    .plugin-banner .plugin-save + .plugin-exit { margin-left: 0; }
    .plugin-banner:not(:has(.plugin-save)) .plugin-exit { margin-left: auto; }
    .plugin-script-select {
      margin: 8px 10px 0;
      padding: 4px 6px;
      font: inherit;
      border: 1px solid var(--color-border, #d1d5db);
      border-radius: 6px;
    }
    .plugin-param-frame {
      display: block;
      flex: 0 0 auto;
      height: 240px;
      border-bottom: 1px solid var(--color-border, #e5e7eb);
    }
    .left-panel.plugin editor-code-box { flex: 1; min-height: 0; }

    wa-split-panel::part(divider) {
      background-color: var(--color-divider);
      backdrop-filter: blur(5px);
    }

    wa-icon.split-grip,
    wa-icon.split-grip-h {
      color: var(--color-gray-dark);
      opacity: 0.3;
    }

    model-viewer {
      width: 100%;
      height: 100%;
    }

  `;
}

declare global
{
  interface HTMLElementTagNameMap
  {
    'page-editor': PageEditor;
  }
}
