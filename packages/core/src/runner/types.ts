import type { ArchiyouModules } from "../types";
import type { Modeler } from "../modeler/Modeler";
import type { ScriptOutputData } from '../execution/types';
import type { Doc } from "../docs/Doc";
import type { Calc } from "../calc/Calc";


import type { ConsoleMessage, ConsoleMessageType } from "../console/types";

import type { Script } from "../execution/Script";
import type { ScriptData, ScriptMeta, ScriptParamData,
    ScriptStatementResult } from "../execution/types";

import type { ModelMode } from "../modeler/types"; // mesh or brep
import type { ArchiyouStateData } from "../types";


/** Basic information of Runner scope */
export interface RunnerActiveScope
{
    name: string
    context?: string
}

/** Result of a Script execution in the Runner
 *   - contains basic information: status, duration, original request
 *   - state data like scenegraph, annotation, managed params that needs to be resolved in viewer
 */
export interface RunnerScriptExecutionResult
{
    created: Date,
    status:'success'|'error',
    duration: number
    request: RunnerScriptExecutionRequest,

    statements?: Array<ScriptStatementResult>
    errors?: Array<ScriptStatementResult>, // seperate the error statements (for backward compat)
    warnings?: Array<string>, // warnings that occured related to request or execution
    messages?: Array<ConsoleMessage>, // based on settings in request you find the relevant messages

    state: ArchiyouStateData // contains state data like annotations, scenegraph etc
    meta?: ScriptMeta, // meta information on the script execution
    
    // All outputs in flat array with request path and data
    outputs?: Array<ScriptOutputData>
}

/** Basic structure and state of scope */
export interface RunnerScriptScope extends ProxyConstructor
{
    _scope:string // name of scope
    _main:boolean // is this the main scope
    _archiyou:ArchiyouModules // reference to modules
    [key:string]: any // dynamic scope properties (modeler, doc, calc, console, etc.)
    // for scope globals like docs, calc etc
    modeler:Modeler
    docs:Doc // TODO: rename
    calc:Calc
}


/** Request results from executing a script */
export interface RunnerScriptExecutionRequest
{
    kernel: ModelMode // which kernel to use for execution - this can be switched in script but initial kernel is set here;
    script:Script|ScriptData // script to execute
    component?:string // name of component if any
    params?:Record<string,any> // param values
    /** Scene paths of shapes the viewer reports as selected (click-selection).
     *  Single-element today (single-select). Read by Interactor.beginRun so
     *  shape.selected()/shape.onClick() can react. Identity is the scene path
     *  (SmartSceneNode.path()), not the shape UUID. */
    selection?:Array<string>
    preset?:string // TODO: preset - overrides param values
    variantId?:string // hash of param values for identifying unique requests - is filled in on submission
    mode?: 'main'|'component'

    /** Local scripts the runner can resolve as components when the parent
     *  script references them via $component('./name'). Sent as ScriptData
     *  (structured-clone-safe over the worker boundary) — the worker shim
     *  hydrates these into Script instances and calls
     *  runner.linkComponentScripts(...) before execute. */
    componentScripts?: Array<ScriptData>;

    // What to calculate and output
    outputs?: Array<string> // requested output paths
    cache?:boolean // enable caching. Default is true
    messages?:Array<ConsoleMessageType>; // output messages of given types
    forceFileResponse?:boolean // if true, force response as file download (either single file or multiple files in zip)

    _onDone?: ((result:RunnerScriptExecutionResult) => any) // internal callback
}   


//// COMPONENTS ////


/** Results of component execution 
 *  This is a flattened version of RunnerScriptExecutionResult for direct use in execution scope
 *  Any output is in internal format
 *   - models -> Obj (which contains Shapes)
 *   - metrics -> Record<string,Metric>
 *   - tables -> CalcTable (or CalcDb?)
 *   - docs -> Doc
 *   
*/
export type ImportComponentOutput = any // TODO: Obj|Record<string,Metric>|Calc|Doc|null
export interface ImportComponentResultPipeline {
    model?: any, // TODO. Used to be Obj
    metrics?: any, // Record<string,Metric>|null,
    tables?: any, // CalcDb|null,
    docs?: any // Doc|null
}
/** Result with multiple pipelines */
export type ImportComponentResultPipelines = Record<string, ImportComponentResultPipeline>
/** Combined type: direct output, per pipeline or multiple pipelines */
export type ImportComponentResult = ImportComponentOutput|ImportComponentResultPipeline|ImportComponentResultPipelines