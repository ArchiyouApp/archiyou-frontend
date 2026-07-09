/**
 * scriptUrl.ts — parse the library URL segment `{scriptName}:{version?}`.
 * Shared by the library GET routes and the /execute route.
 */

export function parseScriptAndVersion(segment: string): { scriptName: string; version?: string } {
  const match = segment.match(/^([^/:]+)(?::(.+))?$/);
  if (!match) return { scriptName: segment };
  const [, scriptName, version] = match;
  return { scriptName, version: version || undefined };
}
