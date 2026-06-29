/**
 * state/param-behaviours.ts — dynamic, app-side-evaluated param behaviours.
 *
 * Scripts declare behaviours like `$PARAMS.OTHER.enableIf(p => p.SHOWBOX === false)`.
 * The worker serializes each behaviour function to source and ships them via the
 * dedicated `managedBehaviours` channel on the execution result (NOT managedParams,
 * so decorating a UI-authored param never flips it to programmatic mode).
 *
 * Here we:
 *   - hydrate the source strings back into functions (hydrateBehaviour)
 *   - store them on the in-memory ScriptParam._behaviours (applyManagedBehaviours)
 *   - evaluate them against the current param-value snapshot, writing the result
 *     onto enabled / visible / schema.enum / _value (evaluateParamBehaviours)
 *
 * Evaluation runs after each execution and on every client-side value change, so
 * dependent params react instantly without a re-run. Behaviours are never
 * persisted (ScriptParam.toData() omits _behaviours) and never count as a
 * definition change.
 */

import type { Script } from '@archiyou/core/src/execution/Script';
import type { ScriptParam } from '@archiyou/core/src/execution/ScriptParam';
import type { ManagedBehavioursData, ParamBehaviourTarget, ParamBehaviourFn } from '@archiyou/core/src/execution/types';
import { paramValue } from './types';

/** Re-hydrate a serialized behaviour function source into a callable.
 *  Returns null (and logs) when the source can't be parsed. Trust model: this is
 *  the same user's own script code, already executed in the worker. */
export function hydrateBehaviour(src: string): ParamBehaviourFn | null
{
  try
  {
    // Wrap so both arrow (`p => ...`) and function-expression sources evaluate
    // to the function value rather than being treated as a statement.
    // eslint-disable-next-line no-new-func
    const fn = new Function('return (' + src + ')')();
    return (typeof fn === 'function') ? (fn as ParamBehaviourFn) : null;
  }
  catch (e)
  {
    console.error('hydrateBehaviour(): failed to parse behaviour source:', src, e);
    return null;
  }
}

/** Replace every param's in-memory behaviours with the freshly-declared set from
 *  the latest run (full sync). Hydrates sources to functions; touches nothing
 *  else on the param (no definition fields, no _definedProgrammatically). */
export function applyManagedBehaviours(script: Script, managed?: ManagedBehavioursData): void
{
  if (!script?.params) return;

  // Clear first — behaviours are re-declared identically every run, so a param
  // no longer decorated this run must lose its stale behaviour.
  for (const p of Object.values(script.params) as ScriptParam[])
  {
    if (p._behaviours) p._behaviours = {};
  }

  if (!managed) return;

  for (const [name, targets] of Object.entries(managed))
  {
    const upper = name.toUpperCase();
    const param = script.params[upper];
    if (!param || !targets) continue; // behaviours attach to existing params only

    const hydrated: Partial<Record<ParamBehaviourTarget, ParamBehaviourFn>> = {};
    for (const [target, src] of Object.entries(targets))
    {
      const fn = hydrateBehaviour(src as string);
      if (fn) hydrated[target as ParamBehaviourTarget] = fn;
    }
    param._behaviours = hydrated;
  }
}

/** Evaluate all param behaviours against a single snapshot of current values and
 *  apply the results. One synchronous pass (no cascade) so it can never loop.
 *  Mutates param fields in place; returns whether anything changed. The caller
 *  is responsible for bumping the script signal (this never persists/saves). */
export function evaluateParamBehaviours(script: Script | null): boolean
{
  if (!script?.params) return false;

  const params = Object.values(script.params) as ScriptParam[];

  // Snapshot { NAME: value } — the argument every behaviour function receives.
  const values: Record<string, any> = {};
  for (const p of params) values[p.name] = paramValue(p);

  let changed = false;

  for (const p of params)
  {
    const behaviours = p._behaviours;
    if (!behaviours || Object.keys(behaviours).length === 0) continue;

    for (const [target, fn] of Object.entries(behaviours))
    {
      if (typeof fn !== 'function') continue;
      let result: any;
      try { result = (fn as ParamBehaviourFn)(values); }
      catch (e)
      {
        console.error(`evaluateParamBehaviours(): behaviour "${target}" on param "${p.name}" threw:`, e);
        continue;
      }

      switch (target as ParamBehaviourTarget)
      {
        case 'enable':
        {
          const next = !!result;
          if (p.enabled !== next) { p.enabled = next; changed = true; }
          break;
        }
        case 'visible':
        {
          const next = !!result;
          if (p.visible !== next) { p.visible = next; changed = true; }
          break;
        }
        case 'options':
        {
          const schema = p.schema as any;
          if (Array.isArray(result)) { schema.enum = result; changed = true; }
          break;
        }
        case 'value':
        {
          if (p.validateValue(result) && p._value !== result) { p._value = result; changed = true; }
          break;
        }
        // 'values' | 'start' | 'end' — framework targets, not wired in the UI yet.
        default:
          break;
      }
    }
  }

  return changed;
}
