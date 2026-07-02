/**
 * PluginManager (implementation slice 2) — loads a `script`-mode guest plugin,
 * runs its main script in the shared worker, and pushes the result into the
 * host-owned viewer WITHOUT mutating the user's active editor script.
 *
 * This is the minimal real loader behind the `/plugin` preview page. The
 * `archiyou` bridge (param menu ↔ execution) lives in <plugin-part-frame>.
 */

import { Script } from '@archiyou/core/src/execution/Script';
import type {
  RunnerScriptExecutionRequest,
  RunnerScriptExecutionResult,
} from '@archiyou/core/src/runner/types';
import type { ScriptParamData } from '@archiyou/core/src/execution/types';

import { runScript } from '../services/execution-service';
import { executionResult } from '../state/core';
import { scenegraph, reconcileScenegraph, setInteractiveShapes } from '../state/editor';

import type { LoadedPlugin } from './types';

export class PluginManager
{
  private plugin: LoadedPlugin | null = null;
  private script: Script | null = null;
  /**
   * Param definitions captured from the first run's managedParams. They must be
   * sent back on every run (as `script.params`) so the Runner sets up the
   * ParamManager with these params and can bind the submitted `params` values —
   * otherwise the in-code `$PARAMS.define(...)` defaults win and values are lost.
   */
  private paramDefs: Record<string, ScriptParamData> = {};

  get active(): LoadedPlugin | null { return this.plugin; }

  /**
   * Load + first run. Returns the input schema (the main script's $PARAMS,
   * as ScriptParamData[]) for the param menu to render.
   */
  async activate(plugin: LoadedPlugin): Promise<ScriptParamData[]>
  {
    this.plugin = plugin;

    const script = Script.fromData({ name: plugin.manifest.id, code: plugin.mainCode });
    if (!script) throw new Error(`PluginManager: invalid main script for "${plugin.manifest.id}"`);
    this.script = script;

    const result = await this.run({});
    const defs = result?.state?.managedParams?.new ?? [];
    for (const p of defs) this.paramDefs[p.name] = p;
    return defs;
  }

  /** Run the plugin's main script with the given param values; updates the viewer. */
  async run(params: Record<string, any>): Promise<RunnerScriptExecutionResult | undefined>
  {
    if (!this.script) throw new Error('PluginManager: no active plugin');

    const script = this.script.toData();
    script.params = { ...(script.params ?? {}), ...this.paramDefs };

    const request: RunnerScriptExecutionRequest = {
      kernel:  'mesh',
      script,
      params,
      outputs: ['default/model/glb'],
      messages: ['error'],
    };

    const result = await runScript(request);
    if (result) this._applyToViewer(result);
    return result;
  }

  /** The HTML source of the plugin's custom param menu, if it declares one. */
  paramMenuHtml(): string | null
  {
    const p = this.plugin;
    if (!p?.manifest.paramMenu) return null;
    return p.parts[p.manifest.paramMenu] ?? null;
  }

  /**
   * Push execution output into the host-owned viewer signals. Mirrors the
   * viewer-relevant half of state/core.setExecutionResult(), but deliberately
   * skips the managed-param merge so it never clobbers the user's active script.
   */
  private _applyToViewer(result: RunnerScriptExecutionResult): void
  {
    scenegraph.set(reconcileScenegraph(scenegraph.get(), result.state?.scenegraph ?? null));
    setInteractiveShapes(result.state?.interactiveShapes ?? []);
    executionResult.set(result);
  }
}
