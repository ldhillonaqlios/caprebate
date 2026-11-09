#!/usr/bin/env node
/**
 * THE BOUNDARY CHECK — the walls' alarm. Phase 161h1, 7 November 2026 (09-app/docs/ARCHITECTURE.md, rules 1 to 4; Lakhbir,
 * 6 Nov 2026: "the ability for the structure to allow us to make a change on one thing without breaking others").
 *
 * WHAT IT READS
 *   architecture/modules.json   every file under src/: its AREA (one of twelve) and its KIND (page, logic, data, routes,
 *                               other), and each area's FRONT DOOR (the one file another area may import).
 *   architecture/tables.json    every table the migrations make, and the one area that OWNS it.
 *   architecture/baseline.json  the breaks that were there on the day the check started (THE RATCHET).
 * Every import is read with the TypeScript compiler, through lint-paths.cjs's own reader; the SQL is read from the
 * string literals, as lint-sql.cjs reads it. The tables are worked out from the migrations themselves.
 *
 * THE FOUR RULES (a "break" is one thing that goes against a rule; each has a key, so the same break is the same key)
 *   1  FRONT DOORS ONLY. A file imports a file of another area only through that area's front door.
 *      key "importer -> imported", counted against the area whose door was gone round.
 *   2  ONE WAY ONLY. Areas depend on each other in one direction: modules.json's "order" lists them from the bottom
 *      up, and an area may import only an area BELOW it. An import up the order is a break (and so is every
 *      area-to-area import inside a cycle, which an order makes impossible). Without an "order", only cycles count.
 *      key "from-area -> to-area", counted against the from-area.
 *   3  EACH TABLE HAS ONE OWNER. Only the owning area's data file runs SQL on a table.
 *      key "file : table", counted against the table's owner.
 *   4  SCREENS HOLD NO SQL; RULES HOLD NO HTML AND NO SQL. A page with SQL, or that imports db.ts; a logic file with
 *      SQL, that imports db.ts, or that builds HTML (imports html.ts or components.ts).
 *      key "file : what", counted against the file's area.
 * Until an area has its front door (the file named in modules.json exists), every import into it is a break of rule 1.
 *
 * THE RATCHET. Today's breaks are written down once (--write-baseline, only when there is no baseline). From then on:
 *   - any break NOT in the baseline fails the check, at once, with its file and rule;
 *   - a baseline break that is gone fails it too, and says to run --lower, which takes the gone ones off. --lower never
 *     adds one, so the count can only go down. (A break left in the baseline after it is fixed could come back unseen.)
 *   - a file under src/ with no area, or a table with no owner, fails it: a new file or table is placed on purpose.
 *
 *   node tools/boundaries.cjs             the check (in npm run check, after lint-paths)
 *   node tools/boundaries.cjs --counts    the breaks by area and rule
 *   node tools/boundaries.cjs --lower     take the breaks that are gone off the baseline
 *   node tools/boundaries.cjs --moved <old> <new>   a file that moved keeps its breaks under its new name (renames only)
 *   node tools/boundaries.cjs --moved-map <file.json>   the same for many files at once
 *   node tools/boundaries.cjs --rebase "<why>"   after a reviewed re-map: today's breaks become the baseline, only if the
 *                                         total does not go up; logged in the baseline's history
 *   node tools/boundaries.cjs --self-test plant a break of each rule, a file with no area and a table with no owner;
 *                                         each must fail, and a clean tree must pass
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findingsIn } = require('./lint-paths.cjs');

/* 'app' (Phase 161l): the start-up wiring at the top of the order (src/app/): the server, the router shell, the timers,
   the command line and the seed. It may import every area; no area imports it, so it has no front door (null). */
const AREAS = ['core', 'shared', 'integrations', 'public-site', 'assessment', 'portal', 'crm', 'claims', 'survey', 'finance', 'compliance', 'admin', 'app'];
const KINDS = ['page', 'logic', 'data', 'routes', 'other'];
const RULES = { 1: 'front doors only', 2: 'one way only (an area imports only areas below it in the order)', 3: 'each table has one owner', 4: 'screens hold no SQL; rules hold no HTML and no SQL' };
const SQL = /\b(SELECT\b[\s\S]*\bFROM|INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE\s+[a-z_][a-z0-9_]*\s+SET|DELETE\s+FROM|CREATE\s+(TABLE|TRIGGER|INDEX|VIEW))\b/;
const TABLE_REF = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([a-z_][a-z0-9_]*)/g;

function loadTs(backendDir) {
  try { return require(path.join(backendDir, 'node_modules', 'typescript')); }
  catch { return require('typescript'); }
}

/**
 * The tables the migrations leave, in order: CREATE TABLE, DROP TABLE and ALTER TABLE ... RENAME TO. Then the one table
 * the database gate makes itself before any migration runs (schema_migrations, in the database gate, src/core/db.ts), read from that file.
 */
function tablesFromMigrations(dir) {
  const live = new Set();
  // src/core/db.ts since Phase 161i (src/db.ts before it)
  const gate = [path.join(dir, '..', 'src', 'core', 'db.ts'), path.join(dir, '..', 'src', 'core', 'db.ts')].find((g) => fs.existsSync(g)) ?? '';
  const texts = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
  if (gate !== '') texts.unshift((fs.readFileSync(gate, 'utf8').match(/CREATE TABLE IF NOT EXISTS [a-z_]+/g) ?? []).join(';\n'));
  for (const text of texts) {
    const sql = text.replace(/--[^\n]*/g, '');
    const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)|\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)|\bALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+RENAME\s+TO\s+([a-z_][a-z0-9_]*)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
      if (m[1]) live.add(m[1].toLowerCase());
      else if (m[2]) live.delete(m[2].toLowerCase());
      else { live.delete(m[3].toLowerCase()); live.add(m[4].toLowerCase()); }
    }
  }
  return [...live].sort();
}

/** The string literals of a file (each template literal's pieces joined), as the SQL text to read. */
function literalsIn(ts, file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.c?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const out = [];
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text);
    else if (ts.isTemplateExpression(n)) out.push([n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' '));
    // a statement wrapped across lines: 'SELECT a ' + 'FROM b' is one statement
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const parts = [];
      const flat = (e) => { if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(e.left); flat(e.right); } else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) parts.push(e.text); };
      flat(n);
      if (parts.length > 1) out.push(parts.join(''));
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/**
 * Imports that carry values (not `import type`), as backend-relative paths of files under src/. Decided statement by
 * statement, with TypeScript's own reader: an `import type ... from` or `export type ... from` is dropped when the file
 * runs, so it loads nothing; any other import of the same path, in another statement, still loads it, so one
 * `import type` of a path never hides a value import of it. `import { type A } from` is not type-only: the statement
 * stays when the file runs, and loads the file.
 */
function importsIn(ts, file, backend) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.m?js$|\.cjs$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const typeOnly = new Set();
  for (const n of sf.statements) {
    const erased = (ts.isImportDeclaration(n) && n.importClause?.isTypeOnly === true) || (ts.isExportDeclaration(n) && n.isTypeOnly);
    if (erased && n.moduleSpecifier !== undefined && ts.isStringLiteral(n.moduleSpecifier)) typeOnly.add(`${line(n)}|${n.moduleSpecifier.text}`);
  }
  return findingsIn(ts, file)
    .filter((f) => f.kind === 'loads' && !typeOnly.has(`${f.line}|${f.spec}`))
    .map((f) => path.relative(backend, f.target).split(path.sep).join('/'))
    .filter((t) => t.startsWith('src/'));
}

function strongGroups(nodes, edges) {
  let index = 0; const idx = new Map(), low = new Map(), on = new Set(), stack = [], groups = [];
  const next = (v) => [...(edges.get(v) ?? [])];
  const go = (v) => {
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    for (const w of next(v)) {
      if (!idx.has(w)) { go(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const g = []; let w;
      do { w = stack.pop(); on.delete(w); g.push(w); } while (w !== v);
      if (g.length > 1) groups.push(g.sort());
    }
  };
  for (const v of nodes) if (!idx.has(v)) go(v);
  return groups;
}

/**
 * Every break, and every problem with the maps. `backend` is the folder holding src/, migrations/ and architecture/;
 * `files` the files under src/ to read (backend-relative). Returns { breaks: {rule: {area: [keys]}}, problems, groups }.
 */
function measure({ backend, files, modules, tables, tableList, ts }) {
  const problems = [];
  const map = modules.files;
  for (const f of files) {
    const e = map[f];
    if (e === undefined) problems.push(`${f} has no area: add it to architecture/modules.json (area and kind)`);
    else {
      if (!AREAS.includes(e.area)) problems.push(`${f}: "${e.area}" is not one of the areas (${AREAS.join(', ')})`);
      if (!KINDS.includes(e.kind)) problems.push(`${f}: "${e.kind}" is not one of the kinds (${KINDS.join(', ')})`);
    }
  }
  for (const f of Object.keys(map)) if (!files.includes(f)) problems.push(`architecture/modules.json lists ${f}, which is not under src/ any more: take it off`);
  for (const t of tableList) if (tables.tables[t] === undefined) problems.push(`the table ${t} has no owner: add it to architecture/tables.json`);
  for (const [t, a] of Object.entries(tables.tables)) {
    if (!tableList.includes(t)) problems.push(`architecture/tables.json lists the table ${t}, which the migrations no longer make: take it off`);
    if (!AREAS.includes(a)) problems.push(`architecture/tables.json: "${a}", the owner of ${t}, is not one of the areas`);
  }
  for (const a of AREAS) if (typeof modules.doors?.[a] !== 'string' && modules.doors?.[a] !== null) problems.push(`architecture/modules.json names no front door for ${a}`);
  /* THE ORDER (Phase 161l): every area once, from the bottom up. */
  const order = Array.isArray(modules.order) ? modules.order : null;
  if (order !== null) {
    for (const a of AREAS) if (order.filter((x) => x === a).length !== 1) problems.push(`architecture/modules.json's order must name ${a} exactly once`);
    for (const a of order) if (!AREAS.includes(a)) problems.push(`architecture/modules.json's order names "${a}", which is not one of the areas`);
  }
  const rank = (a) => (order === null ? -1 : order.indexOf(a));
  const breaks = { 1: {}, 2: {}, 3: {}, 4: {} };
  const add = (rule, area, key) => { (breaks[rule][area] ??= new Set()).add(key); };
  const areaOf = (f) => map[f]?.area;
  const doorOf = (a) => modules.doors?.[a];
  const hasDoor = (a) => typeof doorOf(a) === 'string' && fs.existsSync(path.join(backend, doorOf(a)));
  const edges = new Map();
  const known = new Set(tableList);
  for (const f of files) {
    const e = map[f];
    if (e === undefined) continue;
    const abs = path.join(backend, f);
    const imports = /\.(ts|cjs|cts|mjs|js)$/.test(f) && !f.endsWith('.d.cts') ? importsIn(ts, abs, backend) : [];
    for (const t of imports) {
      const b = areaOf(t);
      if (b === undefined || b === e.area) continue;
      if (!(edges.get(e.area)?.has(b))) { if (!edges.has(e.area)) edges.set(e.area, new Set()); edges.get(e.area).add(b); }
      if (!(hasDoor(b) && t === doorOf(b))) add(1, b, `${f} -> ${t}`);
    }
    if (e.kind === 'page' || e.kind === 'logic') {
      if (imports.includes('src/db.ts') || imports.includes('src/core/db.ts')) add(4, e.area, `${f} : ${e.kind} imports the database gate (db.ts)`);
      if (e.kind === 'logic' && ['src/web/html.ts', 'src/web/components.ts', 'src/shared/html.ts', 'src/shared/components.ts'].some((h) => imports.includes(h))) add(4, e.area, `${f} : logic builds HTML`);
    }
    if (!/\.(ts|cjs|mjs|js)$/.test(f) || f.endsWith('.d.cts')) continue;
    let sql = false;
    for (const lit of literalsIn(ts, abs)) {
      if (!SQL.test(lit)) continue;
      sql = true;
      for (const m of lit.matchAll(TABLE_REF)) {
        const t = m[1];
        if (!known.has(t)) continue;
        const owner = tables.tables[t];
        if (owner === undefined) continue;
        if (!(owner === e.area && e.kind === 'data')) add(3, owner, `${f} : ${t}`);
      }
    }
    if (sql && (e.kind === 'page' || e.kind === 'logic')) add(4, e.area, `${f} : ${e.kind} runs SQL`);
  }
  const groups = strongGroups([...edges.keys()], edges);
  /* With an order, an import up it is the break (every cycle has one); without one, every import inside a cycle. */
  if (order === null) for (const g of groups) for (const a of g) for (const b of edges.get(a) ?? []) if (g.includes(b)) add(2, a, `${a} -> ${b}`);
  if (order !== null) for (const [a, to] of edges) for (const b of to) if (rank(b) > rank(a)) add(2, a, `${a} -> ${b}`);
  const out = {};
  for (const r of Object.keys(breaks)) { out[r] = {}; for (const a of Object.keys(breaks[r]).sort()) out[r][a] = [...breaks[r][a]].sort(); }
  return { breaks: out, problems, groups };
}

/* PHASE 161i, 7 Nov 2026: A BREAK IS WHAT IT IS, NOT WHICH AREA IT IS COUNTED AGAINST. Its identity is its rule and its
   key; the area is how it is counted. So placing a file in another area in modules.json (a reviewed change) moves its
   breaks from one area's count to another's and adds none, and --lower regroups the baseline by today's areas. */
function flat(breaks) { const m = new Map(); for (const r of Object.keys(breaks)) for (const a of Object.keys(breaks[r])) for (const k of breaks[r][a]) m.set(`${r}|${k}`, a); return m; }

/** Compares a measure with the baseline: what is new (fails), what is gone (lower the baseline). Shown as rule|area|key. */
function compare(now, baseline) {
  const a = flat(now.breaks), b = flat(baseline.breaks ?? {});
  const show = (id, area) => { const i = id.indexOf('|'); return `${id.slice(0, i)}|${area}|${id.slice(i + 1)}`; };
  return { added: [...a].filter(([id]) => !b.has(id)).map(([id, ar]) => show(id, ar)).sort(),
    gone: [...b].filter(([id]) => !a.has(id)).map(([id, ar]) => show(id, ar)).sort() };
}

function counts(breaks) {
  const rows = [];
  for (const a of AREAS) {
    const c = [1, 2, 3, 4].map((r) => (breaks[r]?.[a] ?? []).length);
    if (c.some((n) => n > 0)) rows.push({ area: a, r1: c[0], r2: c[1], r3: c[2], r4: c[3], total: c.reduce((x, y) => x + y, 0) });
  }
  return rows;
}

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function listSrc(backend) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(backend, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|cts|mts|cjs|mjs|js)$/.test(e.name) && !/\.(bak|mutsave)/.test(e.name)) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

/** Only the files git tracks, where git can say (an untracked scratch file is not the code). */
function trackedSrc(backend) {
  try {
    const out = require('child_process').execFileSync('git', ['ls-files', 'src'], { cwd: backend, encoding: 'utf8' });
    const list = out.split('\n').filter((l) => /\.(ts|cts|mts|cjs|mjs|js)$/.test(l));
    if (list.length > 0) return list.sort();
  } catch { /* not a git copy: read the folder */ }
  return listSrc(backend);
}

/**
 * A FILE THAT MOVES KEEPS ITS BREAKS (for Phases 161i to 161k, which move files). Renames `from` to `to` in every key
 * of the baseline, and nothing else: it adds no break and removes none. The check then compares the moved code with
 * the same breaks under their new names. Refused if `to` is already named in the baseline.
 */
function renameInBaseline(base, from, to) {
  const has = (p) => JSON.stringify(base.breaks).includes(`"${p} `) || JSON.stringify(base.breaks).includes(` ${p}"`);
  if (!has(from)) return { base, renamed: 0, why: `the baseline names no break of ${from}` };
  if (has(to)) return { base, renamed: 0, why: `the baseline already names ${to}` };
  let renamed = 0;
  const swap = (k) => k.split(' ').map((w) => { if (w === from) { renamed++; return to; } return w; }).join(' ');
  const out = {};
  for (const r of Object.keys(base.breaks)) { out[r] = {}; for (const a of Object.keys(base.breaks[r])) out[r][a] = base.breaks[r][a].map(swap).sort(); }
  return { base: { ...base, breaks: out }, renamed, why: '' };
}

function run({ backend, files, write = null }) {
  const ts = loadTs(backend);
  const arch = path.join(backend, 'architecture');
  const modules = readJson(path.join(arch, 'modules.json'));
  const tables = readJson(path.join(arch, 'tables.json'));
  const tableList = tablesFromMigrations(path.join(backend, 'migrations'));
  const now = measure({ backend, files: files ?? trackedSrc(backend), modules, tables, tableList, ts });
  const basePath = path.join(arch, 'baseline.json');
  const hasBase = fs.existsSync(basePath);
  if (write === 'first') {
    if (hasBase) return { now, problems: ['there is already a baseline: it may only go down (--lower), never be written again'], added: [], gone: [] };
    if (now.problems.length === 0) fs.writeFileSync(basePath, `${JSON.stringify({ note: 'THE RATCHET (tools/boundaries.cjs). Breaks of rules 1 to 4 of ARCHITECTURE.md, by rule and area. It may only go down: node tools/boundaries.cjs --lower.', breaks: now.breaks }, null, 1)}\n`);
    return { now, problems: now.problems, added: [], gone: [] };
  }
  if (!hasBase) return { now, problems: [...now.problems, 'there is no baseline (architecture/baseline.json)'], added: [], gone: [] };
  const base = readJson(basePath);
  const { added, gone } = compare(now, base);
  if (typeof write === 'object' && write !== null && write.rebase !== undefined) {
    /* PHASE 161i: A REVIEWED RE-MAP. When a phase places files in other areas or moves them behind front doors, some
       breaks change their names or areas although nothing new was written. --rebase "<why>" takes today's breaks as the
       baseline ONLY when the maps are clean and the TOTAL does not go up, and logs the date, the reason and both totals
       in the baseline's history, so every rebase is in git and in the pull request. It is not for a new break in code. */
    const before = flat(base.breaks).size, after = flat(now.breaks).size;
    if (now.problems.length > 0) return { now, problems: [...now.problems, 'not rebased: fix the map problems first'], added, gone };
    if (String(write.rebase).trim().length < 10) return { now, problems: ['not rebased: give the reason (--rebase "<why>")'], added, gone };
    if (after > before) return { now, problems: [`not rebased: the total would go up, from ${before} to ${after}`], added, gone };
    const history = [...(base.history ?? []), { date: new Date().toISOString().slice(0, 10), why: String(write.rebase).trim(), before, after, renamed_or_new: added.length, gone: gone.length }];
    fs.writeFileSync(basePath, `${JSON.stringify({ ...base, history, breaks: now.breaks }, null, 1)}\n`);
    return { now, problems: [], added: [], gone: [], rebased: { before, after } };
  }
  if (write === 'lower') {
    if (added.length > 0 || now.problems.length > 0) return { now, problems: [...now.problems, 'not lowered: there are new breaks or map problems; fix them first'], added, gone };
    /* Today's breaks, every one of which is in the baseline (there is no new one), grouped by today's areas. */
    const lowered = {};
    for (const r of Object.keys(now.breaks)) { lowered[r] = {}; for (const a of Object.keys(now.breaks[r])) if (now.breaks[r][a].length) lowered[r][a] = [...now.breaks[r][a]]; }
    fs.writeFileSync(basePath, `${JSON.stringify({ ...base, breaks: lowered }, null, 1)}\n`);
    return { now, problems: [], added: [], gone: [], lowered: gone.length };
  }
  return { now, problems: now.problems, added, gone };
}

function say(r) {
  const lines = [];
  for (const p of r.problems) lines.push(`  ${p}`);
  for (const k of r.added) { const [rule, area, key] = k.split('|'); lines.push(`  NEW BREAK of rule ${rule} (${RULES[rule]}), against ${area}: ${key}`); }
  if (r.gone.length) lines.push(`  ${r.gone.length} break${r.gone.length === 1 ? ' is' : 's are'} gone. Good: now lower the baseline (node tools/boundaries.cjs --lower) so ${r.gone.length === 1 ? 'it' : 'they'} cannot come back unseen.`);
  return lines;
}

function selfTest() {
  const backend = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-boundaries-'));
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), body); };
  const doors = { ...Object.fromEntries(AREAS.map((a) => [a, ['core', 'shared', 'integrations'].includes(a) ? `src/${a}/index.ts` : `src/modules/${a}/index.ts`])), shared: 'src/shared/html.ts', app: null };
  const files = {
    'src/core/db.ts': { area: 'core', kind: 'data' }, 'src/shared/html.ts': { area: 'shared', kind: 'other' },
    'src/modules/claims/index.ts': { area: 'claims', kind: 'other' }, 'src/modules/claims/data.ts': { area: 'claims', kind: 'data' },
    'src/modules/claims/logic.ts': { area: 'claims', kind: 'logic' }, 'src/modules/crm/page.ts': { area: 'crm', kind: 'page' },
    'src/core/index.ts': { area: 'core', kind: 'other' },
  };
  const write = (m, extra = {}) => { put('architecture/modules.json', JSON.stringify({ doors, files: { ...files, ...extra } })); };
  put('migrations/001.sql', 'CREATE TABLE claims (id TEXT);\nCREATE TABLE leads (id TEXT);\nCREATE TABLE old (id TEXT);\nALTER TABLE old RENAME TO kept;\n');
  put('architecture/tables.json', JSON.stringify({ tables: { claims: 'claims', leads: 'crm', kept: 'core' } }));
  put('src/core/db.ts', 'export class Db {}\n');
  put('src/shared/html.ts', 'export const h = 1;\n');
  put('src/core/index.ts', "export { Db } from '../db.ts';\n");
  put('src/modules/claims/index.ts', "export { one } from './data.ts';\n");
  put('src/modules/claims/data.ts', "import type { Db } from '../../core/db.ts';\nexport const one = (db: Db) => db.get('SELECT id FROM claims WHERE id = ?');\n");
  put('src/modules/claims/logic.ts', "import { one } from './data.ts';\nexport const two = one;\n");
  put('src/modules/crm/page.ts', "import { one } from '../claims/index.ts';\nimport { h } from '../../shared/html.ts';\nexport const p = [one, h];\n");
  write();
  const list = () => listSrc(tmp);
  const cases = [];
  /* wantFail: false (passes), true (any failure), or a rule number: only that rule's new break, nothing else */
  const check = (name, wantFail, mutate, undo) => {
    mutate();
    const r = run({ backend: tmp, files: list() });
    const failed = r.problems.length > 0 || r.added.length > 0;
    const good = typeof wantFail === 'number'
      ? r.problems.length === 0 && r.added.length > 0 && r.added.every((k) => k.startsWith(`${wantFail}|`))
      : failed === wantFail;
    cases.push([name, good, [...r.problems, ...r.added].slice(0, 3)]);
    undo();
  };
  // the clean tree, with an empty baseline: no breaks at all
  let r0 = run({ backend: tmp, files: list(), write: 'first' });
  cases.push(['the migrations are read in order (a renamed table is the new name)', JSON.stringify(tablesFromMigrations(path.join(tmp, 'migrations'))) === '["claims","kept","leads"]', []]);
  cases.push(['a clean tree passes with no break, and the first baseline is written', r0.problems.length === 0 && counts(r0.now.breaks).length === 0, r0.problems]);
  cases.push(['the baseline cannot be written a second time', run({ backend: tmp, files: list(), write: 'first' }).problems.length > 0, []]);
  const keep = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
  const plant = (rel, body, extra) => { const had = fs.existsSync(path.join(tmp, rel)) ? keep(rel) : null; return [() => { put(rel, body); if (extra) write(null, extra); }, () => { if (had === null) fs.rmSync(path.join(tmp, rel)); else put(rel, had); write(); }]; };
  check('rule 1: an import round a front door fails', 1, ...plant('src/modules/crm/page.ts', "import { one } from '../claims/data.ts';\nexport const p = one;\n"));
  {
    const [m, u] = plant('src/modules/claims/logic.ts', "import { q } from '../crm/index.ts';\nexport const two = q;\n", { 'src/modules/crm/index.ts': { area: 'crm', kind: 'other' } });
    check('rule 2: a cycle between two areas fails (through their front doors, so rule 1 holds)', 2,
      () => { put('src/modules/crm/index.ts', 'export const q = 1;\n'); m(); }, () => { u(); fs.rmSync(path.join(tmp, 'src/modules/crm/index.ts')); });
  }
  {
    /* THE ORDER: claims sits below crm, so claims importing crm through its door is a break even with no cycle */
    const order = ['shared', 'core', 'integrations', 'assessment', 'claims', 'survey', 'finance', 'compliance', 'admin', 'crm', 'portal', 'public-site', 'app'];
    const withOrder = (crmDoor = true) => put('architecture/modules.json', JSON.stringify({ doors, order, files: { ...files, ...(crmDoor ? { 'src/modules/crm/index.ts': { area: 'crm', kind: 'other' } } : {}) } }));
    const [m, u] = plant('src/modules/claims/logic.ts', "import { q } from '../crm/index.ts';\nexport const two = q;\n");
    check('rule 2: an import up the order fails, with no cycle (through the front door, so rule 1 holds)', 2,
      () => { put('src/modules/crm/index.ts', 'export const q = 1;\n'); m(); withOrder(); }, () => { u(); fs.rmSync(path.join(tmp, 'src/modules/crm/index.ts')); });
    const [m2, u2] = plant('src/modules/crm/page.ts', "import { one } from '../claims/index.ts';\nexport const p = one;\n");
    check('rule 2: an import down the order passes', false, () => { m2(); withOrder(false); }, () => u2());
    check('the order must name every area once', true, () => put('architecture/modules.json', JSON.stringify({ doors, order: order.slice(1), files })), () => write());
  }
  check('rule 3: SQL on a table from a file that is not its owner\'s data file fails', true, ...plant('src/modules/claims/logic.ts', "export const two = (db: any) => db.get('SELECT id FROM leads');\n"));
  check('rule 4: a page that runs SQL fails', true, ...plant('src/modules/crm/page.ts', "export const p = (db: any) => db.all('SELECT id FROM leads');\n"));
  check('rule 4: logic that builds HTML fails (shared\'s door is not gone round: it imports the door)', 4, ...plant('src/modules/claims/logic.ts', "import { h } from '../../shared/html.ts';\nexport const two = h;\n"));
  check('rule 3: a statement wrapped across lines is read whole', true, ...plant('src/modules/claims/logic.ts', "export const two = (db: any) => db.get('SELECT id ' +\n  'FROM leads');\n"));
  check('a file with no area fails', true, ...plant('src/modules/crm/new.ts', 'export const x = 1;\n'));
  check('an import type is not an import', false, ...plant('src/modules/claims/logic.ts', "import type { Db } from '../../core/db.ts';\nexport const two = (d: Db) => d;\n"));
  check('an import type is not an import, nor an export type', false, ...plant('src/modules/claims/logic.ts', "export type { Db } from '../../core/db.ts';\nexport const two = 1;\n"));
  check('a value import is an import though another statement imports types from the same file', 1, ...plant('src/modules/crm/page.ts',
    "import type { one as One } from '../claims/data.ts';\nimport { one } from '../claims/data.ts';\nexport const p: typeof One = one;\n"));
  check('an import of types named one by one still loads the file', 1, ...plant('src/modules/crm/page.ts', "import { type one } from '../claims/data.ts';\nexport type P = typeof one;\n"));
  check('prose that says select and from is not SQL', false, ...plant('src/modules/claims/logic.ts', "export const two = 'select the claims from the list';\n"));
  {
    const mig = keep('migrations/001.sql');
    check('a table with no owner fails', true, () => put('migrations/001.sql', `${mig}CREATE TABLE stray (id TEXT);\n`), () => put('migrations/001.sql', mig));
  }
  // the ratchet: a break in the baseline passes; fixed, it must be lowered; --lower never adds
  {
    const [m, u] = plant('src/modules/crm/page.ts', "import { one } from '../claims/data.ts';\nexport const p = one;\n");
    m();
    const base = path.join(tmp, 'architecture', 'baseline.json');
    fs.rmSync(base);
    run({ backend: tmp, files: list(), write: 'first' });
    const inBase = run({ backend: tmp, files: list() });
    cases.push(['a break already in the baseline passes', inBase.problems.length === 0 && inBase.added.length === 0, inBase.added]);
    u();
    const fixed = run({ backend: tmp, files: list() });
    cases.push(['a break that is gone fails until the baseline is lowered', fixed.gone.length === 1, fixed.gone]);
    const lowered = run({ backend: tmp, files: list(), write: 'lower' });
    const after = run({ backend: tmp, files: list() });
    cases.push(['--lower takes it off, and the check passes again', lowered.lowered === 1 && after.gone.length === 0 && after.added.length === 0, []]);
    m();
    const back = run({ backend: tmp, files: list() });
    cases.push(['the same break back again, after lowering, fails', back.added.length === 1, back.added]);
    const refused = run({ backend: tmp, files: list(), write: 'lower' });
    cases.push(['--lower refuses while there is a new break (it can never add one)', refused.problems.length > 0 && !JSON.stringify(readJson(base)).includes('crm/page.ts'), refused.problems]);
    u();
  }
  {
    const b0 = { breaks: { 1: { claims: ['src/a.ts -> src/b.ts'] }, 3: { crm: ['src/a.ts : leads'] } } };
    const m1 = renameInBaseline(b0, 'src/a.ts', 'src/modules/x/a.ts');
    const flatKeys = (b) => flat(b.breaks).size;
    cases.push(['--moved renames a file in every key, and adds and removes none', m1.renamed === 2 && flatKeys(m1.base) === flatKeys(b0)
      && JSON.stringify(m1.base).includes('src/modules/x/a.ts -> src/b.ts') && !JSON.stringify(m1.base).includes('"src/a.ts'), [m1]]);
    cases.push(['--moved refuses a name already in the baseline', renameInBaseline(b0, 'src/a.ts', 'src/b.ts').renamed === 0, []]);
  }
  {
    // --rebase: refused when the total would go up; allowed (and logged) when it does not
    const base = path.join(tmp, 'architecture', 'baseline.json');
    fs.rmSync(base); run({ backend: tmp, files: list(), write: 'first' });
    const [m, u] = plant('src/modules/crm/page.ts', "import { one } from '../claims/data.ts';\nexport const p = one;\n");
    m();
    const up = run({ backend: tmp, files: list(), write: { rebase: 'a planted break, which must not be taken' } });
    cases.push(['--rebase refuses when the total would go up', up.problems.length > 0 && up.rebased === undefined, up.problems]);
    fs.rmSync(base); run({ backend: tmp, files: list(), write: 'first' });
    u();
    const down = run({ backend: tmp, files: list(), write: { rebase: 'the planted break was taken out again' } });
    cases.push(['--rebase takes a lower total and logs it in the history', down.rebased !== undefined && readJson(base).history?.length === 1, down.problems]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  let ok = true;
  for (const [name, good, why] of cases) { console.log(`${good ? 'AS REQUIRED    ' : 'NOT AS REQUIRED'}  ${name}${good ? '' : `  (${JSON.stringify(why)})`}`); if (!good) ok = false; }
  void backend;
  return ok;
}

module.exports = { AREAS, KINDS, RULES, measure, compare, counts, tablesFromMigrations, run, renameInBaseline };

if (require.main === module) {
  const backend = path.join(__dirname, '..');
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const mm = process.argv.indexOf('--moved-map');
  if (mm > -1) {
    /* PHASE 161i: many moves at once - a JSON file of { "src/old.ts": "src/new.ts", ... }. Renames only, all or none. */
    const basePath = path.join(backend, 'architecture', 'baseline.json');
    let base = readJson(basePath); let n = 0;
    for (const [from, to] of Object.entries(readJson(process.argv[mm + 1]))) {
      const r = renameInBaseline(base, from, to);
      if (r.renamed === 0 && !r.why.startsWith('the baseline names no break')) { console.error(`not renamed (nothing written): ${from} -> ${to}: ${r.why}`); process.exit(1); }
      base = r.base; n += r.renamed;
    }
    fs.writeFileSync(basePath, `${JSON.stringify(base, null, 1)}\n`);
    console.log(`boundaries — ${n} break names moved with their files; none added, none removed.`);
    process.exit(0);
  }
  const mv = process.argv.indexOf('--moved');
  if (mv > -1) {
    const from = process.argv[mv + 1], to = process.argv[mv + 2];
    const basePath = path.join(backend, 'architecture', 'baseline.json');
    if (!from || !to || !from.startsWith('src/') || !to.startsWith('src/')) { console.error('usage: node tools/boundaries.cjs --moved src/<old path> src/<new path>'); process.exit(2); }
    const r = renameInBaseline(readJson(basePath), from, to);
    if (r.renamed === 0) { console.error(`not renamed: ${r.why}`); process.exit(1); }
    fs.writeFileSync(basePath, `${JSON.stringify(r.base, null, 1)}\n`);
    console.log(`boundaries — ${r.renamed} break${r.renamed === 1 ? '' : 's'} of ${from} now named ${to}; none added, none removed.`);
    process.exit(0);
  }
  const rb = process.argv.indexOf('--rebase');
  const write = rb > -1 ? { rebase: process.argv[rb + 1] ?? '' } : process.argv.includes('--write-baseline') ? 'first' : process.argv.includes('--lower') ? 'lower' : null;
  const r = run({ backend, write });
  const rows = counts(r.now.breaks);
  if (process.argv.includes('--counts')) {
    console.log('area           rule1 rule2 rule3 rule4 total');
    for (const x of rows) console.log(`${x.area.padEnd(14)} ${String(x.r1).padStart(5)} ${String(x.r2).padStart(5)} ${String(x.r3).padStart(5)} ${String(x.r4).padStart(5)} ${String(x.total).padStart(5)}`);
    const t = rows.reduce((s, x) => [s[0] + x.r1, s[1] + x.r2, s[2] + x.r3, s[3] + x.r4], [0, 0, 0, 0]);
    console.log(`${'all'.padEnd(14)} ${t.map((n) => String(n).padStart(5)).join(' ')} ${String(t.reduce((a, b) => a + b, 0)).padStart(5)}`);
    console.log(`cycles between areas: ${r.now.groups.map((g) => g.join(' + ')).join('; ') || 'none'}`);
  }
  const lines = say(r);
  if (r.rebased !== undefined) { console.log(`boundaries — rebased: ${r.rebased.before} breaks before, ${r.rebased.after} now (logged in the baseline's history).`); process.exit(0); }
  if (write === 'lower' && r.lowered !== undefined) { console.log(`boundaries — the baseline lowered by ${r.lowered}.`); process.exit(0); }
  if (lines.length) { console.error(`boundaries FAILED (09-app/docs/ARCHITECTURE.md, rules 1 to 4):\n${lines.join('\n')}`); process.exit(1); }
  const total = rows.reduce((s, x) => s + x.total, 0);
  console.log(`boundaries — ${write === 'first' ? 'the baseline written' : 'no new break'}: ${total} breaks of rules 1 to 4 in the baseline, by ${rows.length} areas; the count may only go down.`);
}
