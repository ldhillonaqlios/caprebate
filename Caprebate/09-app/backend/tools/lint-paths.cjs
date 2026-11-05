#!/usr/bin/env node
/**
 * LIVE CODE USES ONLY THE APP'S OWN FILES — checked, not promised. Phase 161d, 4 November 2026.
 *
 * The ITRoadway technical audit (2 November 2026, section 5) found that "parts of the system load code from
 * work-in-progress folders": src/ imported fourteen modules from Caprebate/04-phase-work/phase3 and phase9. Phase 161d
 * moved them into src/, and this check keeps it that way. Every file of code under backend/src/ and the repository's
 * api/ folder is parsed with the TypeScript compiler (not grepped, so prose in a comment can never trip it), and two
 * things are looked at:
 *
 *   1. EVERY MODULE IT LOADS: import and export ... from, import(), require(), and createRequire(...)(...). A relative
 *      one must land inside Caprebate/09-app. A package name (no leading dot) is an installed package and is fine.
 *   2. EVERY PATH IT BUILDS FROM ITS OWN FOLDER: join() or resolve() starting at import.meta.dirname, __dirname or
 *      dirname(fileURLToPath(import.meta.url)), and new URL('...', import.meta.url). The string pieces are worked out;
 *      if they already lead outside Caprebate/09-app, it is a finding. A path into node_modules is an installed
 *      package and is fine.
 *
 * KNOWN, below, lists the few paths that still lead outside, each with the reason. The check fails on any path not in
 * that list, AND on a listed one that is no longer there, so the list can only shrink on purpose. An entry marked
 * `carried` is work for a later phase, named in its reason.
 *
 *   node tools/lint-paths.cjs               the check (npm run lint:paths, part of npm run check)
 *   node tools/lint-paths.cjs --self-test   plants an import from 04-phase-work, and the other faults, in a scratch
 *                                           tree and proves each one fails
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

/** The paths that still lead outside Caprebate/09-app on purpose. File is from the repository root (Development/);
 * target is where the path leads, from the repository root. */
const KNOWN = [
  { file: 'Caprebate/09-app/backend/src/secrets.ts', target: '.',
    why: 'the repository folder, so a key file inside it is refused; nothing in it is read' },
  { file: 'Caprebate/09-app/backend/src/connectors/inspire-store.ts', target: '.',
    why: 'the repository folder, so the INSPIRE file store is refused inside it; nothing in it is read' },
  { file: 'Caprebate/09-app/backend/src/web/public-site.ts', target: 'Caprebate site.html', carried: true,
    why: 'the public website file; carried to Phase 161d1' },
  { file: 'Caprebate/09-app/backend/src/web/notices-site.ts', target: 'Caprebate/03-app/caprebate-notices-page.html', carried: true,
    why: 'the notices page; carried to Phase 161d1' },
  { file: 'Caprebate/09-app/backend/src/web/pack-lines.ts', target: 'Caprebate/02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv', carried: true,
    why: 'the fixture list; carried to Phase 161d1' },
  { file: 'Caprebate/09-app/backend/src/web/letter.ts', target: 'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter.docx', carried: true,
    why: 'the engagement letter; carried to Phase 161d1' },
  { file: 'Caprebate/09-app/backend/src/web/letter.ts', target: 'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter - TEST DEFAULTS, not agreed.docx', carried: true,
    why: "the test website's copy of the engagement letter; carried to Phase 161d1" },
];

const CODE = /\.(ts|mts|cts|mjs|cjs|js)$/;

function loadTs(backendDir) {
  try { return require(path.join(backendDir, 'node_modules', 'typescript')); }
  catch { return require('typescript'); }
}

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (CODE.test(e.name)) out.push(p);
  }
  return out;
}

const inside = (child, parent) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};
const isPackagePath = (p) => p.split(path.sep).includes('node_modules');

/** Is this expression the file's own folder? import.meta.dirname, __dirname, dirname(fileURLToPath(import.meta.url)). */
function isOwnFolder(ts, n) {
  if (ts.isPropertyAccessExpression(n) && n.name.text === 'dirname' && ts.isMetaProperty(n.expression)) return true;
  if (ts.isIdentifier(n) && n.text === '__dirname') return true;
  if (ts.isCallExpression(n) && /^(path\.)?dirname$/.test(n.expression.getText()) && n.arguments.length === 1) {
    const a = n.arguments[0];
    if (ts.isCallExpression(a) && /fileURLToPath$/.test(a.expression.getText()) && a.arguments.length === 1) {
      return /^import\.meta\.url$/.test(a.arguments[0].getText());
    }
  }
  return false;
}
const isImportMetaUrl = (n) => /^import\.meta\.url$/.test(n.getText());
const literal = (ts, n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

/** Every module a file loads and every path it builds from its own folder, as { line, kind, spec, target }. */
function findingsIn(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    /\.m?js$|\.cjs$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const dir = path.dirname(file);
  const out = [];
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const loads = (n, spec) => {
    if (spec.startsWith('.')) out.push({ line: line(n), kind: 'loads', spec, target: path.resolve(dir, spec) });
  };
  const visit = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && literal(ts, n.moduleSpecifier) !== null) {
      loads(n, literal(ts, n.moduleSpecifier));
    } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) {
      const s = literal(ts, n.moduleReference.expression);
      if (s !== null) loads(n, s);
    } else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const first = n.arguments[0];
      const s = first ? literal(ts, first) : null;
      if (s !== null && (callee.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(callee) && callee.text === 'require')
          || (ts.isCallExpression(callee) && /(^|\.)createRequire$/.test(callee.expression.getText()))
          || (ts.isPropertyAccessExpression(callee) && callee.name.text === 'resolve'
              && (callee.expression.getText() === 'require'
                  || (ts.isCallExpression(callee.expression) && /(^|\.)createRequire$/.test(callee.expression.expression.getText())))))) {
        loads(n, s);
      } else if (/^(path\.)?(join|resolve)$/.test(callee.getText()) && first && isOwnFolder(ts, first)) {
        const parts = [];
        for (const a of n.arguments.slice(1)) { const v = literal(ts, a); if (v === null) break; parts.push(v); }
        out.push({ line: line(n), kind: 'builds', spec: parts.join('/'), target: path.resolve(dir, ...parts) });
      }
    } else if (ts.isNewExpression(n) && n.expression.getText() === 'URL' && n.arguments && n.arguments.length === 2
        && isImportMetaUrl(n.arguments[1])) {
      const s = literal(ts, n.arguments[0]);
      if (s !== null && s.startsWith('.')) out.push({ line: line(n), kind: 'builds', spec: s, target: path.resolve(dir, s) });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Run the check. repo = the repository root (Development/); scans <repo>/Caprebate/09-app/backend/src and <repo>/api.
 * Returns { problems: [text], scanned, outside: [finding] }.
 */
function check({ repo, known = KNOWN, backendDir = path.join(__dirname, '..') }) {
  const ts = loadTs(backendDir);
  const app = path.join(repo, 'Caprebate', '09-app');
  const files = [...walk(path.join(app, 'backend', 'src'), []), ...walk(path.join(repo, 'api'), [])];
  const problems = [];
  const outside = [];
  const used = new Set();
  for (const file of files) {
    for (const f of findingsIn(ts, file)) {
      if (inside(f.target, app) || isPackagePath(f.target)) continue;
      const rel = path.relative(repo, file).split(path.sep).join('/');
      const target = path.relative(repo, f.target).split(path.sep).join('/') || '.';
      const k = known.findIndex((e) => e.file === rel && e.target === target);
      if (k >= 0) { used.add(k); outside.push({ ...f, file: rel, target, why: known[k].why }); continue; }
      problems.push(`${rel}:${f.line} ${f.kind === 'loads' ? 'loads' : 'builds a path to'} ${f.spec}, which is ${target}: ` +
        'outside Caprebate/09-app. Move what it needs into 09-app (or, if it must stay, add it to KNOWN in tools/lint-paths.cjs with the reason).');
    }
  }
  known.forEach((e, i) => {
    if (!used.has(i)) problems.push(`KNOWN in tools/lint-paths.cjs lists ${e.file} -> ${e.target}, which is no longer there: take it off the list.`);
  });
  return { problems, scanned: files.length, outside };
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-lint-paths-'));
  const src = path.join(tmp, 'Caprebate', '09-app', 'backend', 'src');
  fs.mkdirSync(path.join(src, 'web'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'api'), { recursive: true });
  const write = (rel, body) => fs.writeFileSync(path.join(src, rel), body);
  const run = (known = []) => check({ repo: tmp, known });
  const cases = [];
  const expect = (name, r, wantProblems) => cases.push([name, wantProblems ? r.problems.length > 0 : r.problems.length === 0, r.problems]);

  write('ok.ts', "import { x } from './web/y.ts';\nimport { readFileSync } from 'node:fs';\nimport Anthropic from '@anthropic-ai/sdk';\n" +
    "// import { z } from '../../../04-phase-work/phase3/caprebate-source-register.ts';\n" +
    "/* ../../../04-phase-work/phase9/x.ts */ const s = 'see 04-phase-work/phase3/caprebate-source-register.ts';\n" +
    "const g = join(import.meta.dirname, '..', '..', '..', '..', 'node_modules', 'gsap', 'x.js');\n");
  write('web/y.ts', "export const x = join(import.meta.dirname, '..', '..', '..', 'engine', 'package.json');\n");
  fs.writeFileSync(path.join(tmp, 'api', 'index.mjs'), "const m = await import('../Caprebate/09-app/backend/src/ok.ts');\n");
  expect('a clean tree passes (packages, prose and comments that name 04-phase-work, paths inside 09-app)', run(), false);

  const plant = (name, body) => {
    write('planted.ts', body);
    expect(name, run(), true);
    fs.rmSync(path.join(src, 'planted.ts'));
  };
  plant('an import from 04-phase-work fails', "import { SOURCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';\n");
  plant('an export ... from 04-phase-work fails', "export * from '../../../04-phase-work/phase9/caprebate-region.ts';\n");
  plant('a dynamic import() from 04-phase-work fails', "const m = await import('../../../04-phase-work/phase3/x.ts');\n");
  plant('a createRequire(...)(...) of 04-phase-work fails', "const CM = createRequire(import.meta.url)('../../../04-phase-work/phase9/caprebate-cost-model.cjs');\n");
  plant('a require() from 03-app fails', "const r = require('../../../03-app/caprebate-regression.cjs');\n");
  plant('a path built to 04-phase-work fails', "const p = join(import.meta.dirname, '..', '..', '..', '04-phase-work', 'phase9', 'x.cjs');\n");
  plant('a path built with dirname(fileURLToPath(import.meta.url)) fails', "const p = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '02-modules-and-build-prep', 'x.csv');\n");
  plant('a new URL(..., import.meta.url) outside fails', "const u = new URL('../../../03-app/x.html', import.meta.url);\n");
  fs.writeFileSync(path.join(tmp, 'api', 'planted.mjs'), "import '../Caprebate/04-phase-work/phase3/x.ts';\n");
  expect('an import in api/ from 04-phase-work fails', run(), true);
  fs.rmSync(path.join(tmp, 'api', 'planted.mjs'));
  expect('a KNOWN entry that is no longer there fails', run([{ file: 'Caprebate/09-app/backend/src/gone.ts', target: 'x', why: 'test' }]), true);
  write('planted.ts', "const p = join(import.meta.dirname, '..', '..', '..', '03-app', 'page.html');\n");
  expect('a path in KNOWN passes', run([{ file: 'Caprebate/09-app/backend/src/planted.ts', target: 'Caprebate/03-app/page.html', why: 'test' }]), false);
  fs.rmSync(tmp, { recursive: true, force: true });

  let ok = 0;
  for (const [name, good, problems] of cases) {
    console.log((good ? '  ✔ ' : '  ✘ ') + name);
    if (!good) for (const p of problems) console.log('      ' + p);
    if (good) ok++;
  }
  console.log(`\nlint-paths self-test: ${ok} of ${cases.length} held`);
  return ok === cases.length;
}

module.exports = { check, KNOWN, findingsIn };

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const repo = path.join(__dirname, '..', '..', '..', '..');
  const r = check({ repo });
  if (r.problems.length) {
    console.error(`lint-paths FAILED — live code reaches outside Caprebate/09-app (${r.problems.length}):\n`);
    for (const p of r.problems) console.error('  ' + p);
    process.exit(1);
  }
  const carried = r.outside.filter((f) => KNOWN.find((e) => e.file === f.file && e.target === f.target && e.carried));
  console.log(`lint-paths — ${r.scanned} files in backend/src and api/ load and build paths only inside Caprebate/09-app` +
    (r.outside.length ? `, apart from ${r.outside.length} listed in KNOWN (${carried.length} carried to a later phase).` : '.'));
}
