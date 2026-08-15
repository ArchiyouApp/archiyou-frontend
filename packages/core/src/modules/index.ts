/**
 * Script modules — the extension point that lets separately-distributed,
 * entitlement-gated capabilities add a global to the script scope.
 *
 * This directory contains only the machinery. The modules themselves live
 * outside this repository; see docs/modules.md.
 */

export { ModuleRegistry, RESERVED_SCOPE_NAMES } from './ModuleRegistry';
export type { ModuleRegistryOptions } from './ModuleRegistry';

export { loadClientModule, clientBundleUrl, ModuleLoadError } from './loadClientModule';
export type { LoadClientModuleOptions } from './loadClientModule';

export { serverModuleStub, ServerModuleCallError } from './serverModuleStub';
export type { ServerModuleStubOptions } from './serverModuleStub';

export { unavailableStub, ModuleUnavailableError } from './unavailableStub';
