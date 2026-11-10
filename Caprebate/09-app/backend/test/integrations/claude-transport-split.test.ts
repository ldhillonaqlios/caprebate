/**
 * PHASE 161l2: THE CLAUDE CLIENT IS THE OUTSIDE SERVICES' TRANSPORT, AND THE DOCUMENT READER IS THE CLAIMS'.
 *
 * src/integrations/connectors/claude.ts once loaded the claims' document pipeline (sanitise, callModel, specFor), which
 * reaches back into the outside services, so the file could not load on its own through their front door and every
 * caller went round the door to it. It was split: the transport (the switches, the readiness, the SDK client whose only
 * way out is callOutside, and the scanned pages) stays in the outside services; reading a document's segments for the
 * fields its type carries moved to src/modules/claims/document-reader-claude.ts.
 *
 * This holds the split: the transport loads alone, and nothing it loads (following every import that runs, as the
 * boundary check reads them) is above the outside services in the order; the outside services' door reaches nothing above either; the reader is
 * the claims' and is reached through the claims' door; and no file outside the outside services names a file of
 * theirs but their door.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

const BACKEND = join(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);
const ts = require(join(BACKEND, 'node_modules', 'typescript')) as unknown;
const { findingsIn } = require(join(BACKEND, 'tools', 'lint-paths.cjs')) as {
  findingsIn: (ts: unknown, file: string) => { kind: string; target: string; spec: string; line: number }[];
};
const modules = JSON.parse(readFileSync(join(BACKEND, 'architecture', 'modules.json'), 'utf8')) as {
  order: string[]; files: Record<string, { area: string; kind: string }>; doors: Record<string, string | null>;
};
const rank = (area: string): number => modules.order.indexOf(area);
const rel = (abs: string): string => relative(BACKEND, abs).split(sep).join('/');

type Ts = {
  createSourceFile: (f: string, t: string, v: number, b: boolean) => { statements: readonly Node[]; getLineAndCharacterOfPosition: (p: number) => { line: number } };
  ScriptTarget: { Latest: number };
  isImportDeclaration: (n: Node) => boolean; isExportDeclaration: (n: Node) => boolean; isStringLiteral: (n: unknown) => boolean;
};
type Node = { importClause?: { isTypeOnly?: boolean }; isTypeOnly?: boolean; moduleSpecifier?: { text: string }; getStart: (sf: unknown) => number };

/** The files a file loads when it runs: every import but those whose whole statement is `import type` or `export type`. */
function valueImports(file: string): string[] {
  const t = ts as Ts;
  const abs = join(BACKEND, file);
  const sf = t.createSourceFile(abs, readFileSync(abs, 'utf8'), t.ScriptTarget.Latest, true);
  const erased = new Set<string>();
  for (const n of sf.statements) {
    const typeOnly = (t.isImportDeclaration(n) && n.importClause?.isTypeOnly === true) || (t.isExportDeclaration(n) && n.isTypeOnly === true);
    if (typeOnly && n.moduleSpecifier !== undefined && t.isStringLiteral(n.moduleSpecifier)) erased.add(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}|${n.moduleSpecifier.text}`);
  }
  return findingsIn(ts, abs).filter((x) => x.kind === 'loads' && !erased.has(`${x.line}|${x.spec}`)).map((x) => rel(x.target))
    .filter((f) => f.startsWith('src/') && /\.ts$/.test(f) && existsSync(join(BACKEND, f)));
}

/** Every file under src/ a file loads when it runs, following each value import from file to file. */
function reached(start: string): Set<string> {
  const seen = new Set<string>();
  const next = [start];
  while (next.length > 0) {
    const f = next.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    next.push(...valueImports(f));
  }
  return seen;
}

function above(start: string, area: string): string[] {
  return [...reached(start)].filter((f) => {
    const a = modules.files[f]?.area;
    return a === undefined || rank(a) > rank(area);
  }).sort();
}

test('the Claude transport loads on its own, first, in a process of its own', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./src/integrations/connectors/claude.ts'); console.log(typeof m.claudeClient, typeof m.readScannedPages, typeof m.claudeReadiness);"], { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'function function function');
});

test('the Claude transport reaches nothing above the outside services, and holds no document reading', () => {
  assert.equal(modules.files['src/integrations/connectors/claude.ts']?.area, 'integrations');
  assert.deepEqual(above('src/integrations/connectors/claude.ts', 'integrations'), []);
  const text = readFileSync(join(BACKEND, 'src', 'integrations', 'connectors', 'claude.ts'), 'utf8');
  for (const name of ['readPayloadWithClaude', 'prepareClaudeModel', 'toRawExtraction', 'specFor', 'sanitise(', 'callModel(']) {
    assert.ok(!new RegExp(`(function|const)\\s+${name.replace('(', '')}\\b`).test(text), `${name} is defined in the transport`);
  }
  assert.doesNotMatch(text, /from '\.\.\/\.\.\/modules\//, 'the transport imports a business module');
});

test("the outside services' front door reaches nothing above them, the Claude client and the free registers included", () => {
  const door = modules.doors.integrations as string;
  const reach = reached(door);
  assert.ok(reach.has('src/integrations/connectors/claude.ts'), 'the door names the Claude client');
  assert.ok(reach.has('src/integrations/connectors/free-registers.ts'), 'the door names the free registers');
  assert.deepEqual(above(door, 'integrations'), []);
});

test("the document reader is the claims', reached through the claims' door, and reads the transport through the outside services' door", async () => {
  assert.deepEqual(modules.files['src/modules/claims/document-reader-claude.ts'], { area: 'claims', kind: 'logic' });
  const claims = await import('../../src/modules/claims/index.ts');
  for (const name of ['readPayloadWithClaude', 'prepareClaudeModel', 'toRawExtraction']) assert.equal(typeof (claims as Record<string, unknown>)[name], 'function', name);
  const reader = readFileSync(join(BACKEND, 'src', 'modules', 'claims', 'document-reader-claude.ts'), 'utf8');
  assert.match(reader, /from '\.\.\/\.\.\/integrations\/index\.ts'/);
  assert.doesNotMatch(reader, /from '[^']*integrations\/connectors\//);
});

test("no file outside the outside services loads one of their files except through their front door", () => {
  const out: string[] = [];
  for (const [f, e] of Object.entries(modules.files)) {
    if (e.area === 'integrations' || !f.endsWith('.ts')) continue;
    for (const t of valueImports(f)) if (t.startsWith('src/integrations/') && t !== modules.doors.integrations) out.push(`${f} -> ${t}`);
  }
  assert.deepEqual(out, []);
});
