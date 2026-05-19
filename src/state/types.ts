/**
 * state/types.ts — shared types for the workspace state modules.
 *
 * The canonical `ScriptParam` lives in archiyou-core-next; it is re-exported
 * here so the app has a single import site. The old local flat `ScriptParam`
 * interface is gone — params are JSON-Schema driven (`schema.minimum`,
 * `schema.maximum`, `schema.multipleOf`, `schema.enum`, `schema.items.type`,
 * `default`, `_value`).
 */

import type { Script } from '../../devlibs/archiyou-core-next/src/execution/Script';
import type { RunnerScriptExecutionResult } from '../../devlibs/archiyou-core-next/src/runner/types';

// ── Canonical param re-exports ────────────────────────────────────────────────

export { ScriptParam } from '../../devlibs/archiyou-core-next/src/execution/ScriptParam';
export type { ScriptParamType, ScriptParamData } from '../../devlibs/archiyou-core-next/src/execution/types';

import type { ScriptParam as ScriptParamClass } from '../../devlibs/archiyou-core-next/src/execution/ScriptParam';

/**
 * Schema-field accessors — the canonical param is JSON-Schema driven, so the
 * old flat fields now live under `param.schema`. These keep the param widgets
 * readable (`paramMin(p)` instead of `(p.schema as any).minimum`).
 */
const _s = (p: ScriptParamClass): Record<string, any> => p.schema as any;

export const paramMin          = (p: ScriptParamClass): number => _s(p).minimum ?? 0;
export const paramMax          = (p: ScriptParamClass): number => _s(p).maximum ?? 100;
export const paramStep         = (p: ScriptParamClass): number => _s(p).multipleOf ?? 1;
export const paramMinLength    = (p: ScriptParamClass): number => _s(p).minLength ?? 0;
export const paramMaxLength    = (p: ScriptParamClass): number | undefined => _s(p).maxLength;
export const paramOptions      = (p: ScriptParamClass): string[] => _s(p).enum ?? [];
export const paramListItemType = (p: ScriptParamClass): 'string' | 'number' | 'boolean' =>
  _s(p).items?.type ?? 'string';
/** Effective current value: runtime `_value`, falling back to `default`. */
export const paramValue        = (p: ScriptParamClass): any => p._value ?? p.default;

// ── Scene tree ────────────────────────────────────────────────────────────────

export interface SceneMaterialData
{
  color?: string;       // '#rrggbb'
  opacity: number;
  transparent: boolean;
  wireframe?: boolean;
}

export interface SceneNodeData
{
  uuid: string;
  name: string;
  type: string;         // THREE object type string: 'Mesh', 'Group', 'LineSegments2', …
  visible: boolean;
  children: SceneNodeData[];
  material?: SceneMaterialData;
}

// ── Core ──────────────────────────────────────────────────────────────────────

export interface UserState
{
  anonymous: boolean;
  name: string | null;
  // TODO: more + typing
}

/**
 * The core workspace state shared by every page/component:
 * the user, the active script, all latest scripts, and execution status.
 */
export interface WorkspaceCoreState
{
  user: UserState;
  script: Script | null;        // active script (latest; no versions yet)
  scripts: Script[];            // all latest scripts
  executing: boolean;           // whether a script is currently executing
  result: RunnerScriptExecutionResult | null;
}

// ── Editor: script metadata ───────────────────────────────────────────────────

export interface ScriptMetadata
{
  projectName: string;
  version: string;
  /** Short introductory description (markdown). */
  description: string;
  /** Full documentation / technical details (markdown). */
  projectDetails: string;
  categories: string[];
}

// ── Params ────────────────────────────────────────────────────────────────────

/** Detail payload for the 'param-value-change' custom event. */
export interface ParamValueChangeDetail
{
  id:       string;
  value?:   any;
  units?:   string;
  options?: string[];
}

// ── Presets ───────────────────────────────────────────────────────────────────

export interface ScriptPreset
{
  name: string;
  values: Record<string, any>; // param name → value
}
