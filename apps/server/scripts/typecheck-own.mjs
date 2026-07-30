#!/usr/bin/env node
/**
 * Typecheck the server's OWN source, ignoring errors inside workspace packages.
 *
 * Why this exists: @archiyou/core is consumed as TypeScript source, so a plain
 * `tsc --noEmit` here compiles all of core too and reports its ~207 pre-existing
 * errors. Those are core's backlog, not the server's, and they make a CI gate
 * impossible — so nothing was checked at all.
 *
 * This runs the same compile (core's real types still check every call the server
 * makes across the boundary) but only *fails* on diagnostics in apps/server/src.
 * So the server cannot regress, while core's cleanup proceeds separately.
 *
 * Remove this once packages/core typechecks cleanly and gate on `tsc` directly.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');

const tsc = spawnSync(
  'npx',
  ['tsc', '--noEmit', '--pretty', 'false', '-p', resolve(serverRoot, 'tsconfig.json')],
  { cwd: serverRoot, encoding: 'utf8', shell: process.platform === 'win32' },
);

const lines = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`
  .split('\n')
  .filter((l) => l.includes('error TS'));

// Diagnostics are emitted relative to the server dir, so anything reaching out of
// it with ../ belongs to another package.
const isForeign = (line) => line.startsWith('../') || line.includes('node_modules');

const own = lines.filter((l) => !isForeign(l));
const foreign = lines.filter(isForeign);

if (foreign.length > 0) {
  const byPackage = new Map();
  for (const line of foreign) {
    const m = line.match(/^\.\.\/\.\.\/packages\/([^/]+)\//);
    const key = m ? `packages/${m[1]}` : 'other';
    byPackage.set(key, (byPackage.get(key) ?? 0) + 1);
  }
  const summary = [...byPackage].map(([k, v]) => `${k}: ${v}`).join(', ');
  console.log(`note: ignoring ${foreign.length} pre-existing error(s) in workspace packages (${summary})`);
}

if (own.length > 0) {
  console.error(`\n${own.length} type error(s) in apps/server/src:\n`);
  for (const line of own) console.error(`  ${line}`);
  process.exit(1);
}

console.log('ok: apps/server/src typechecks cleanly against core\'s real types');
