/** 
 *  Types for pages
 *  TODO: is this a good pattern to defined internal state of pages?
 */

import type { RunnerScriptExecutionResult } from "../../devlibs/archiyou-core-next/src/runner/types";

export interface PageEditorState 
{
    executing: boolean;
    result: RunnerScriptExecutionResult;
}