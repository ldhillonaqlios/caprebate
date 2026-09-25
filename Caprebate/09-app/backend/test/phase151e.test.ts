/**
 * PHASE 151e, line 1, 25 September 2026 — WHY EVERY PAGE OF THE TEST WEBSITE FAILED, AND THE TEST THAT KEEPS IT FIXED.
 *
 * Every page of caprebate-test.vercel.app answered "500 FUNCTION_INVOCATION_FAILED". Reproduced by running
 * api/index.mjs on a clean checkout with only the repository root's dependencies installed — which is all Vercel
 * installs (vercel.json: `npm install --omit=dev` at the root): the first request threw ERR_MODULE_NOT_FOUND, "Cannot
 * find package '@anthropic-ai/sdk' imported from src/connectors/claude.ts". Phase 146e (22 September 2026) added the
 * Claude API library to THIS package's package.json and not to the root's, so the test website has failed on every
 * request since that deploy — on the Mac it worked, because this folder has its own node_modules.
 *
 * The fix is in the root: the library in its package.json, and vercel.json's function carrying the installed
 * packages. What this file proves: every outside package the back end, the engine and the two module folders import
 * is a dependency of the ROOT package.json, at the version this package has installed; and every root dependency is
 * inside what vercel.json tells the function to carry.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));     // 09-app/backend/ (the path has spaces: never .pathname)
const REPO = join(HERE, '..', '..', '..');                      // Development/ — the repository root
const read = (p: string) => readFileSync(p, 'utf8');

/** Every file under a folder, skipping node_modules and backups. */
function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.includes('.bak')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|mjs|cjs|js)$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** The outside packages a file imports: `from 'x'` and `import('x')`, never node: and never a relative path. */
function packagesImported(text: string): string[] {
  // only a real package name counts: the engine's generated code writes import lines as text ("from '" + src.id + "'")
  const names = [...text.matchAll(/(?:from\s+|import\(\s*)'([^'./][^']*)'/g)].map((m) => m[1]!)
    .filter((n) => !n.startsWith('node:') && /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w./-]*)?$/.test(n));
  return names.map((n) => (n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : n.split('/')[0]!));
}

describe('151e · the test website installs everything the application imports', () => {
  test('every outside package imported by the application is a dependency of the repository ROOT, which is all Vercel installs', () => {
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies?: Record<string, string> };
    const rootDeps = root.dependencies ?? {};
    const dirs = [join(HERE, 'src'), join(REPO, 'api'), join(REPO, 'Caprebate/09-app/engine/src'),
      join(REPO, 'Caprebate/04-phase-work/phase3'), join(REPO, 'Caprebate/04-phase-work/phase9')];
    const imported = new Set<string>();
    for (const d of dirs) for (const f of files(d)) for (const n of packagesImported(read(f))) imported.add(n);
    assert.ok(imported.has('@node-rs/argon2'), 'the scan found no outside package at all - the scan, not the code, is broken');
    const missing = [...imported].filter((n) => rootDeps[n] === undefined).sort();
    assert.deepEqual(missing, [], `imported by the application but not in the root package.json, so the test website cannot start: ${missing.join(', ')}`);
  });

  test('the root pins each of those packages at the version this back end has installed and tests with', () => {
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies: Record<string, string> };
    const mine = JSON.parse(read(join(HERE, 'package.json'))) as { dependencies: Record<string, string> };
    for (const name of Object.keys(mine.dependencies)) {
      assert.ok(root.dependencies[name] !== undefined, `${name} is this package's dependency and not the root's`);
      const installed = (JSON.parse(read(join(HERE, 'node_modules', name, 'package.json'))) as { version: string }).version;
      assert.equal(root.dependencies[name], installed, `${name}: the root pins ${root.dependencies[name]}, the back end runs ${installed}`);
    }
  });

  test('vercel.json tells the function to carry every root dependency', () => {
    const v = JSON.parse(read(join(REPO, 'vercel.json'))) as { functions: Record<string, { includeFiles: string }> };
    const include = v.functions['api/index.mjs']?.includeFiles ?? '';
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies: Record<string, string> };
    for (const name of Object.keys(root.dependencies)) {
      const carried = /(^|[{,])node_modules\/\*\*([},]|$)/.test(include) || include.includes(`node_modules/${name}/**`)
        || (name.startsWith('@') && include.includes(`node_modules/${name.split('/')[0]}/**`));
      assert.ok(carried, `${name} is installed but not carried by the function (includeFiles: ${include})`);
    }
  });
});
