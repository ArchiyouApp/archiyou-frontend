/**
 * state/configurator.ts — configurator-only state.
 *
 * The configurator does NOT author params. It *derives* the param definitions
 * from the core active `Script` and keeps only the end-user's runtime values
 * and its own UI state here.
 */

import { signal, computed } from '@lit-labs/signals';

import { ScriptParam } from '../../devlibs/archiyou-core-next/src/execution/ScriptParam';
import type { ScriptParamData } from '../../devlibs/archiyou-core-next/src/execution/types';

import { editorScript } from './core';
import type { ScriptPreset } from './types';

//// DERIVED DEFINITIONS (read-only, from core script) ////

/** Param definitions to configure, taken from the core active script. */
export const configuratorParams = computed<ScriptParam[]>(() =>
{
  const s = editorScript.get();
  if (!s) return [];
  return Object.values(s.params).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

/** Presets available, derived from the core script. */
export const configuratorPresets = computed<ScriptPreset[]>(() =>
{
  const s = editorScript.get();
  if (!s) return [];
  return Object.entries(s.presets).map(([name, paramRec]) => ({
    name,
    values: Object.fromEntries(
      Object.entries(paramRec).map(([pname, pdata]) =>
        [pname, (pdata as ScriptParamData)._value ?? (pdata as ScriptParamData).default]),
    ),
  }));
});

//// RUNTIME VALUES + UI STATE ////

/** End-user values, keyed by param name. Falls back to the param default. */
export const configuratorValues   = signal<Record<string, any>>({});
export const configuratorExecuting = signal<boolean>(false);

/** Resolve the effective value for a param (runtime override → default). */
export function configuratorValueFor(p: ScriptParam): any
{
  const v = configuratorValues.get();
  return (p.name in v) ? v[p.name] : (p._value ?? p.default);
}

export function setConfiguratorValue(name: string, value: any): void
{
  configuratorValues.set({ ...configuratorValues.get(), [name]: value });
}

export function resetConfiguratorValues(): void
{
  configuratorValues.set({});
}

export function setConfiguratorExecuting(value: boolean): void
{
  configuratorExecuting.set(value);
}

/** Apply a preset's values into the configurator runtime values (by param name). */
export function applyConfiguratorPreset(name: string): void
{
  const s = editorScript.get();
  if (!s) return;
  const preset = s.presets[name];
  if (!preset) return;

  const byName = Object.fromEntries(Object.values(s.params).map(p => [p.name, p]));
  const next = { ...configuratorValues.get() };
  for (const [pname, pdata] of Object.entries(preset))
  {
    const target = byName[pname];
    if (target) next[target.name] = (pdata as ScriptParamData)._value ?? (pdata as ScriptParamData).default;
  }
  configuratorValues.set(next);
}
