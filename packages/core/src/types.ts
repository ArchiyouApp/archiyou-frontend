/**
 *  General internal types
 *  
 *  - Place types that are used by (script) users in specific modules 
 *  - We use typebox for validation and type inference
 *  
 *  
 * 
 */

import type { Modeler } from "./modeler/Modeler";
import type { Calc } from "./calc/Calc";
import type { Docs } from "./docs/Docs";
import type { Annotator } from "./annotator/Annotator";
import type { Interactor } from "./interaction/Interactor";
import type { ManagedHandlesData } from "./interaction/types";
import type { ParamOperation, ScriptParamData, ManagedBehavioursData } from "./execution/types";
import type { Console } from "./console/Console";
import type { Runner } from "./runner/Runner";
import type { MaterialManager } from "./materials/MaterialManager";
import type { SceneNodeData } from "./modeler/types";


export interface ArchiyouModules 
{
    console: Console,
    modeler: Modeler,
    calc: Calc,
    docs: Docs,
    annotator: Annotator,
    interactor: Interactor,
    runner: Runner,
    materials: MaterialManager
    // modeling kernels
    oc?: any, // OpenCascade (BREP)
    meshup?: any, // Meshup (mesh/curve)
}


/** Archiyou State data that can't be encoded in (GLB) output  
 *  After execution this data is either added to RunnerScriptExecutionResult 
 *  or added to extras of GLB output
 *  
 *  Users of this data are mostly the viewer, scene navigator etc. 
 *   But advanced usage might include defining/changing the params from the script
 *   and handling input options from the script with gizmos
*/
export interface ArchiyouStateData
{
    scenegraph?: SceneNodeData
    annotations?: Array<any> // TODO: TS typing: DimensionLineData etc.
    /** Op stream produced by Interactor.getManagedHandlesData(). Empty array = quiet re-exec. */
    managedHandles?: ManagedHandlesData
    /** Scene paths of shapes that declared onClick() this run. Tells the viewer
     *  which meshes are clickable-for-re-run (a click on one re-runs the script
     *  with that path selected). */
    interactiveShapes?: Array<string>
    //gizmos?: Array<Gizmo>,
    /** Params the script defined/changed/dropped this run (via $PARAMS.define()).
     *  The app merges these into the param menu (code is source of truth). */
    managedParams?:Record<ParamOperation, Array<ScriptParamData>>
    /** Presets the script declared this run (via $PARAMS.preset()).
     *  Shaped like Script.presets: Record<presetName, Record<paramName, ScriptParamData>>. */
    managedPresets?:Record<string, Record<string, ScriptParamData>>
    /** Dynamic param behaviours declared this run (via $PARAMS.NAME.enableIf()/visibleIf()/...).
     *  Serialized fn sources, evaluated app-side on every value change. NOT a definition
     *  change: applying these never sets _definedProgrammatically. Shape: paramName → target → src. */
    managedBehaviours?:ManagedBehavioursData
}

