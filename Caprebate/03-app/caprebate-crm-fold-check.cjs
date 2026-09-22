#!/usr/bin/env node
/**
 * THE CRM FOLD CHECK — CRM 10 of 10, 12 September 2026.
 *
 * The CRM was built in ten phases and described in ten increments. This check is
 * what keeps the description true of the code after the phases stop, and it can
 * fail. Four checks:
 *
 *   A  THE DISPOSITION TABLE (09-app/CAPREBATE-CRM-DISPOSITION.md)
 *      A1 every row carries exactly one mark;
 *      A2 every QUESTION row, every title in Part F, and every quoted title in
 *         Developer Spec §5.3 exists in CAPREBATE QUESTIONS under exactly that
 *         title - read from the register check's snapshot of the document;
 *      A3 every ADOPTED row is named, by its exact id or an explicit range, in
 *         the Rows cell of an evidence part (G onwards) - no prefix, no "7.x";
 *      A4 every REJECTED row names the rule or the decision it breaks;
 *      A5 every file and every identifier an evidence part names exists, and
 *         every italic test title in EVERY evidence part (G onwards) is in a real
 *         test's title - a title written with "…" as fragments, all in one title
 *         (every part since Phase 146, 22 Sep 2026; the closing part alone before).
 *   B  THE ROUTES - every route the back end registers appears in the
 *      Developer Spec (§2 or §3.1), read out of the source, not a list.
 *   C  §4's LINE REFERENCES - every `file:NN` in section 4 lands on a line that
 *      carries the name written beside it: back end (src/), the site file, the
 *      engine package, phase9 and phase3 (widened by Phase 132g, 16 Sep 2026).
 *   D  THE GUIDE (09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md) - every CRM screen in
 *      Developer Spec §2 has a "### Training — `id`" section.
 *
 *   node 03-app/caprebate-crm-fold-check.cjs              exit 0 green, 1 on any failure
 *   node 03-app/caprebate-crm-fold-check.cjs --self-test  every negative control must fail
 *   exit 2 means it COULD NOT RUN (a file missing, or the questions snapshot older
 *   than a day) - which is not the same as green.
 *
 * Plain Node, no dependencies, so it runs on both machines the way the drift
 * checker does. It reads; it writes nothing.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const P = {
  table: path.join(ROOT, '09-app/CAPREBATE-CRM-DISPOSITION.md'),
  spec: path.join(ROOT, '09-app/CAPREBATE-DEVELOPER-SPEC.md'),
  guide: path.join(ROOT, '09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md'),
  backend: path.join(ROOT, '09-app/backend'),
  engineGen: path.join(ROOT, '09-app/engine/src/generated'),
  snapshotDir: path.join(ROOT, '03-app/signoff-snapshot'),
};
P.questions = path.join(P.snapshotDir, 'hub-questions.md');
P.plan = path.join(P.snapshotDir, 'hub-action-plan.md');
P.snapshotMeta = path.join(P.snapshotDir, 'snapshot.json');

const MARKS = ['ALREADY BUILT', 'ADOPTED WITH A RULE', 'ADOPTED', 'REJECTED', 'QUESTION'];
const RULE = /\bN[1-4]\b|13\([abc]\)|five roles|no login|by decision|decided|decision|Developer Spec|operating procedure|procedure's|anchor quarantine|derives from the engine|desktop-first|W\d+\b|a sixth is a question/i;

// ---------------------------------------------------------------- helpers
// Quote marks are dropped rather than matched: a title quoted inside a quotation turns its own
// double quotes into single ones, and an apostrophe is typed straight or curly by whoever wrote it.
const norm = (s) => s.replace(/\*\*|\*/g, '').replace(/[‘’“”"']/g, '')
  .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim().replace(/[?.:]+$/, '').toLowerCase();

function cellsOf(line) {
  const cells = []; let cur = ''; let tick = false;
  for (const ch of line) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick) { cells.push(cur); cur = ''; } else cur += ch;
  }
  cells.push(cur); cells.shift(); cells.pop();
  return cells.map((c) => c.trim());
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules') return [];
    const f = path.join(dir, e.name);
    return e.isDirectory() ? walk(f) : [f];
  }).filter((f) => !/\.bak-/.test(f));
}

function loadInputs() {
  const missing = Object.entries({ table: P.table, spec: P.spec, guide: P.guide, questions: P.questions, plan: P.plan, snapshotMeta: P.snapshotMeta })
    .filter(([, f]) => !fs.existsSync(f)).map(([k, f]) => `${k}: ${path.relative(ROOT, f)}`);
  if (missing.length) return { cannot: `missing: ${missing.join('; ')}` };
  let meta;
  try { meta = JSON.parse(fs.readFileSync(P.snapshotMeta, 'utf8')); } catch { return { cannot: 'snapshot.json unreadable' }; }
  const at = Date.parse(meta.capturedAt);
  if (!Number.isFinite(at)) return { cannot: 'snapshot.json has no parseable capturedAt' };
  const ageH = (Date.now() - at) / 36e5;
  if (ageH > 24) return { cannot: `the questions snapshot is ${ageH.toFixed(1)} hours old - refresh it (node 03-app/caprebate-signoff-register-check.cjs --refresh-plan)` };
  const code = walk(path.join(P.backend, 'src')).concat(walk(path.join(P.backend, 'migrations')), walk(path.join(P.backend, 'test')), walk(path.join(P.backend, 'tools')), walk(P.engineGen))
    .filter((f) => /\.(ts|sql|cjs|js)$/.test(f));
  const codeText = new Map(code.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const testFiles = code.filter((f) => /\/test\/[^/]+\.test\.ts$/.test(f));
  // files outside the back end that §4 cites (check C), read once each, on demand; null = not there
  const readCache = new Map();
  const readText = (abs) => {
    if (!readCache.has(abs)) readCache.set(abs, fs.existsSync(abs) && fs.statSync(abs).isFile() ? fs.readFileSync(abs, 'utf8') : null);
    return readCache.get(abs);
  };
  return {
    readText,
    table: fs.readFileSync(P.table, 'utf8'),
    spec: fs.readFileSync(P.spec, 'utf8'),
    guide: fs.readFileSync(P.guide, 'utf8'),
    questions: fs.readFileSync(P.questions, 'utf8'),
    plan: fs.readFileSync(P.plan, 'utf8'),
    codeText, testFiles,
  };
}

// ---------------------------------------------------------------- A
function parseTable(table) {
  const rows = []; const evidence = []; const partF = [];
  let part = ''; let section = '';
  table.split('\n').forEach((line, i) => {
    const pm = line.match(/^# PART ([A-Z])\b/); if (pm) part = pm[1];
    const sm = line.match(/^## (?:(\d+) ·|(B\d) ·)/); if (sm) section = sm[1] || sm[2];
    if (!line.startsWith('|') || /^\|\s*:?-/.test(line)) return;
    const c = cellsOf(line);
    if (part >= 'G' && c.length === 3 && !/^(Rows|What)$/.test(c[0])) { evidence.push({ part, rowsCell: c[0], built: c[1], proved: c[2], line: i + 1 }); return; }
    if (part === 'F' && c.length === 3 && !/^Title/.test(c[0])) { partF.push({ cell: c[0], line: i + 1 }); return; }
    if (!/^(?:[A-D]\d+(?:\.\d+)?|\d+\.\d+)$/.test(c[0])) return;
    let mark = null;
    if (part === 'A' && c.length >= 4) {
      const m = norm(c[2]).toUpperCase(); mark = MARKS.find((k) => m === k || m.startsWith(k + ' ')) || null;
      const count = MARKS.filter((k) => new RegExp(`(^|\\W)${k}(\\W|$)`).test(norm(c[2]).toUpperCase().replace('ADOPTED WITH A RULE', 'AWR'))).length;
      rows.push({ part, id: c[0], mark, last: c[c.length - 1], line: i + 1, markCell: c[2], ambiguous: count > 1 });
    } else if (part === 'B' || part === 'D') {
      const last = c[c.length - 1];
      mark = /^\s*(\*\*)?ALREADY BUILT/.test(last) ? 'ALREADY BUILT' : 'ADOPTED';
      rows.push({ part, id: c[0], mark, last, line: i + 1 });
    } else if (part === 'C') {
      rows.push({ part, id: c[0], mark: 'CONFLICT', last: c[c.length - 1], line: i + 1 });
    }
  });
  return { rows, evidence, partF };
}

function expandIds(rowsCell, allIds) {
  const head = rowsCell.replace(/\*\*/g, '').split(/\s[—-]\s/)[0];
  const out = new Set();
  for (let tok of head.split(',')) {
    tok = tok.trim(); let m;
    if ((m = tok.match(/^([A-D]?)(\d+)\.(\d+)\s*[–-]\s*(?:[A-D]?\d+\.)?(\d+)$/))) {
      for (let k = +m[3]; k <= +m[4]; k++) out.add(`${m[1]}${m[2]}.${k}`);
    } else if ((m = tok.match(/^([A-E])(\d+)\s*[–-]\s*[A-E]?(\d+)$/))) {
      for (let k = +m[2]; k <= +m[3]; k++) out.add(`${m[1]}${k}`);
    } else if ((m = tok.match(/^section (\d+)$/i))) {
      allIds.filter((id) => id.startsWith(m[1] + '.')).forEach((id) => out.add(id));
    } else if ((m = tok.match(/^([A-E]?\d+(?:\.\d+)?)$/))) out.add(m[1]);
  }
  return out;
}

function questionTitles(questions) {
  return new Set(questions.split('\n').filter((l) => /^#{2,3} /.test(l)).map((l) => norm(l.replace(/^#+ /, ''))));
}
const quoted = (s) => [...s.matchAll(/["“]([^"”]{12,})["”]/g)].map((m) => m[1]);

// every test() / it() / describe() title in the back end's test files, unescaped
function testTitles(testText) {
  const out = [];
  for (const m of testText.matchAll(/\b(?:test|it|describe)\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    out.push(m[2].replace(/\\(.)/g, '$1'));
  }
  return out;
}
// the capitalised section headings a test file's comments name (" * STAFF TASKS", " * SURVEYOR REACH —
// BY THE JOB'S CLAIM ..."): the evidence cites a section by its heading, and a heading counts only
// when the cited text is the start of a comment line written in capitals, not anywhere in a body
function testHeadings(testText) {
  const out = [];
  for (const m of testText.matchAll(/^[ \t]*\*[ \t]+([A-Z0-9][A-Z0-9 '’,:()—–&/.-]{3,}.*)$/gm)) {
    if (/^[A-Z0-9 '’,:()—–&/.-]{4,}/.test(m[1]) && m[1].slice(0, 4) === m[1].slice(0, 4).toUpperCase()) out.push(m[1].trim());
  }
  return out;
}

function checkA(inp) {
  const fails = [];
  const { rows, evidence, partF } = parseTable(inp.table);
  const titles = questionTitles(inp.questions);
  const allIds = rows.map((r) => r.id);
  // A1
  for (const r of rows.filter((x) => x.part === 'A')) {
    if (!r.mark) fails.push(`A1 row ${r.id} (line ${r.line}) carries no mark: "${r.markCell}"`);
    else if (r.ambiguous) fails.push(`A1 row ${r.id} (line ${r.line}) carries more than one mark: "${r.markCell}"`);
  }
  // A2
  for (const r of rows.filter((x) => x.mark === 'QUESTION')) {
    const q = quoted(r.last);
    if (!q.length) fails.push(`A2 row ${r.id} is a QUESTION and quotes no title`);
    for (const t of q) if (!titles.has(norm(t))) fails.push(`A2 row ${r.id} cites a question not in CAPREBATE QUESTIONS under that title: "${t}"`);
  }
  for (const f of partF) for (const t of quoted(f.cell)) if (!titles.has(norm(t))) fails.push(`A2 Part F (line ${f.line}) cites a question not in CAPREBATE QUESTIONS: "${t}"`);
  const s53 = sliceSection(inp.spec, /^## 5\.3 /m, /^## 5\.4 /m);
  for (const line of s53.split('\n').filter((l) => l.startsWith('|'))) {
    const first = cellsOf(line)[0] || '';
    for (const t of quoted(first)) if (!titles.has(norm(t))) fails.push(`A2 Developer Spec §5.3 cites a question not in CAPREBATE QUESTIONS: "${t}"`);
  }
  // A3
  const covered = new Set();
  for (const e of evidence) for (const id of expandIds(e.rowsCell, allIds)) covered.add(id);
  // A row found NOT built is not a failure while it is CARRIED into a phase that still exists:
  //   **CARRIED — "<the phase's title>"**   in its last cell, and that title in a heading of the
  // action plan's snapshot. When the phase runs and deletes itself, the row must have its evidence.
  const planHeadings = inp.plan.split('\n').filter((l) => /^#{1,3} /.test(l)).map(norm);
  const carried = [];
  for (const r of rows.filter((x) => x.mark === 'ADOPTED' || x.mark === 'ADOPTED WITH A RULE')) {
    if (covered.has(r.id)) continue;
    const cm = r.last.match(/CARRIED — ["“]([^"”]+)["”]/);
    if (!cm) { fails.push(`A3 row ${r.id} (Part ${r.part}, line ${r.line}) is ${r.mark} and no evidence part names it`); continue; }
    if (!planHeadings.some((h) => h.includes(norm(cm[1])))) fails.push(`A3 row ${r.id} is carried to "${cm[1]}", and no phase of that title is in the action plan`);
    else carried.push(r.id);
  }
  for (const r of rows.filter((x) => x.part === 'C')) {
    for (const tok of r.last.split(',')) {
      const ids = expandIds(tok.trim(), allIds);
      for (const id of ids) if (!allIds.includes(id)) fails.push(`A3 conflict ${r.id} points at row ${id}, which does not exist`);
    }
  }
  // A4
  for (const r of rows.filter((x) => x.mark === 'REJECTED')) if (!RULE.test(r.last)) fails.push(`A4 row ${r.id} is REJECTED and names no rule or decision`);
  // A5
  const allCode = [...inp.codeText.values()].join('\n');
  const allTests = inp.testFiles.map((f) => inp.codeText.get(f)).join('\n');
  const testTitleList = testTitles(allTests);
  const headingList = testHeadings(allTests);
  for (const e of evidence) {
    const toks = [...(e.built + ' ' + e.proved).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
    for (const t of toks) {
      if (/^(GET|POST|PUT|DELETE)\b|^\/(staff|portal|api|refer|upload|assessment)/.test(t) || /[=+@-]$/.test(t) || t.length < 3) continue;
      // a route's own suffix, not a file
      if (/^(view|payload)\.json$|^export\.csv$/.test(t)) continue;
      if (/\//.test(t) || /\.(ts|sql|cjs|md|json)$/.test(t)) {
        const p = t.split(/\s/)[0].replace(/[,;]$/, '');
        if (![path.join(P.backend, p), path.join(ROOT, p), path.join(P.backend, 'src', p)].some((c) => fs.existsSync(c))) fails.push(`A5 Part ${e.part} line ${e.line}: file not found: ${p}`);
        continue;
      }
      for (const id of t.split(/[\s,/()=|]+/).filter((x) => /^[A-Za-z_][A-Za-z0-9_.]{2,}$/.test(x))) {
        // an action ('claim.read_value') is found whole; a table.column is found when both halves are
        const parts = id.split('.');
        const found = allCode.includes(id)
          || (/^[a-z_]+\.[a-z_]+$/.test(id) && parts.every((x) => allCode.includes(x)))
          || (!/^[a-z_]+\.[a-z_]+$/.test(id) && allCode.includes(parts[parts.length - 1]));
        if (!found) fails.push(`A5 Part ${e.part} line ${e.line}: \`${id}\` is in no source, migration, test or tool file`);
      }
    }
    // Every evidence part, not only the closing one (Phase 146, 22 Sep 2026: until then the titles
    // in Parts G to P were never read, and eleven of them named no test while the check was green).
    // A title is matched against the TITLES of the tests, not the whole test text, so a phrase that
    // happens to sit in a test's body no longer passes. A title written with "…" is a set of
    // fragments, and every fragment must be in ONE test title. A title written wholly in capitals may
    // instead name a section heading of a test file, matched from the start of the heading line.
    for (const m of e.proved.matchAll(/(?<![*\w])\*([^*]{6,}?)\*(?![*\w])/g)) {
      const title = m[1].trim();
      const frags = title.split(/…|\.\.\./).map((f) => f.trim()).filter((f) => f.length);
      if (!frags.length) continue;
      const isHeading = frags.length === 1 && title === title.toUpperCase() && headingList.some((h) => h === title || h.startsWith(title + ' ') || h.startsWith(title + ','));
      if (!isHeading && !testTitleList.some((t) => frags.every((f) => t.includes(f)))) {
        fails.push(`A5 Part ${e.part} line ${e.line}: no test is titled *${title}*${frags.length > 1 ? ` (${frags.length} fragments, not all in one title)` : ''}`);
      }
    }
  }
  return { fails, stats: { rows: rows.length, evidence: evidence.length, covered: covered.size } };
}

function sliceSection(text, start, end) {
  const s = text.search(start); if (s < 0) return '';
  const rest = text.slice(s + 1); const e = rest.search(end);
  return e < 0 ? rest : rest.slice(0, e);
}

// ---------------------------------------------------------------- B
const PREFIX = /^\/(staff|portal|api|upload|assessment|refer|login|logout|assets)(\/|$)/;
function expandRegex(src) {
  const s = src.replace(/\\\//g, '/').replace(/\\\./g, '.').replace(/\\-/g, '-');
  let outs = [''];
  const re = /\((\?:)?([^()]*)\)(\?)?|[^(]+/g; let m;
  while ((m = re.exec(s))) {
    if (m[0].startsWith('(')) {
      const alts = m[2].split('|');
      const choices = alts.every((a) => /^[A-Za-z0-9_./-]*$/.test(a)) ? alts : ['{}'];
      if (m[3]) choices.push('');
      outs = outs.flatMap((o) => choices.map((c) => o + c));
    } else outs = outs.map((o) => o + m[0]);
  }
  return outs.map((o) => o.replace(/\/+$/, '').replace(/\/\//g, '/') || '/');
}
function codeRoutes(inp) {
  const routes = new Map();
  for (const [f, t] of inp.codeText) {
    if (!/\/src\/(web\/[^/]+|app|server)\.ts$/.test(f)) continue;
    for (const m of t.matchAll(/path === '(\/[^']*)'/g)) if (PREFIX.test(m[1]) || m[1] === '/') routes.set(m[1], path.basename(f));
    for (const m of t.matchAll(/\/\^(\\\/[^\n]*?)\$\/[a-z]*\.(?:exec|test)\(/g)) for (const r of expandRegex(m[1])) if (PREFIX.test(r)) routes.set(r, path.basename(f));
  }
  return routes;
}
function checkB(inp) {
  const fails = [];
  const nrm = (s) => s.replace(/\{[^}\s|]*\}/g, '{}').replace(/\?.*$/, '').replace(/\/+$/, '') || '/';
  const documented = new Set();
  for (const line of inp.spec.split('\n')) {
    let base = null;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      for (const piece of m[1].trim().split(/\s*·\s*|\s+/)) {
        if (!piece.startsWith('/')) continue;
        let variants = [piece.replace(/\\\|/g, '|')];
        const brace = variants[0].match(/^(.*)\{([^}]*\|[^}]*)\}(.*)$/);
        const bare = variants[0].match(/^(.*\/)([^/{}]*\|[^/{}]*)(.*)$/);
        if (brace) variants = brace[2].split('|').map((a) => brace[1] + a + brace[3]);
        else if (bare) variants = bare[2].split('|').map((a) => bare[1] + a + bare[3]);
        for (const v0 of variants) {
          const v = nrm(v0);
          if (PREFIX.test(v) || v === '/') { documented.add(v); base = v; }
          else if (base) {
            const bs = base.split('/').filter(Boolean); const fsg = v.split('/').filter(Boolean);
            for (let k = 1; k <= bs.length; k++) documented.add('/' + [...bs.slice(0, k), ...fsg].join('/'));
          }
        }
      }
    }
  }
  const routes = codeRoutes(inp);
  for (const [r, f] of routes) if (!documented.has(nrm(r))) fails.push(`B the code registers ${r} (${f}) and the Developer Spec does not describe it`);
  return { fails, stats: { routes: routes.size } };
}

// ---------------------------------------------------------------- C
// Until Phase 132g (16 September 2026) check C read only back-end `src/…ts` references, and the
// site file, the engine package and the phase3/phase9 modules that §4 also cites went unread. The
// file a reference names now decides where it is read from:
//   src/…ts                  the back end (09-app/backend/src), from the code already loaded
//   Caprebate site.html      one level ABOVE the tree
//   09-app/engine/…          the engine package, relative to the tree
//   04-phase-work/phase9/…   phase9, relative to the tree
//   04-phase-work/phase3/…   phase3, relative to the tree
//   any other NN-dir/…       relative to the tree ("other")
// and the rule is the one it always was: the line must carry the name written beside it. A
// reference is `file:NN`, or `:NN` after a file in the same cell, or - the prose form §4 uses for
// phase3 - "`name` at line NN" / "`name` at NN" after a file in the same cell.
const C_FILE = /^(src\/[^\s:]+\.ts|Caprebate site\.html|\d\d-[^\s:]+\.(?:ts|js|cjs|mjs|html|sql))(?::(\d+))?$/;
const C_FORMS = ['back end', 'site', 'package', 'phase9', 'phase3', 'other'];
function formOf(file) {
  if (file.startsWith('src/')) return { form: 'back end', abs: path.join(P.backend, file) };
  if (file === 'Caprebate site.html') return { form: 'site', abs: path.join(ROOT, '..', file) };
  const abs = path.join(ROOT, file);
  if (file.startsWith('09-app/engine/')) return { form: 'package', abs };
  if (file.startsWith('04-phase-work/phase9/')) return { form: 'phase9', abs };
  if (file.startsWith('04-phase-work/phase3/')) return { form: 'phase3', abs };
  return { form: 'other', abs };
}

// every line reference §4 makes: { file, lineNo, name, form, abs, token } - and how many line
// number had no name beside it: `file:NN` each (read, and not checkable)
function refsOfC(spec) {
  const s4 = sliceSection(spec, /^# 4 · /m, /^# 5 · /m);
  const refs = []; const unnamed = [];
  for (const line of s4.split('\n')) {
    for (const cell of line.startsWith('|') ? cellsOf(line) : [line]) {
      let file = null;
      const toks = [...cell.matchAll(/`([^`]+)`/g)].map((m) => ({ t: m[1], at: m.index, end: m.index + m[0].length }));
      const fileAt = []; // [position, file] for the prose form
      toks.forEach((tk, i) => {
        const fm = tk.t.match(C_FILE);
        const lm = tk.t.match(/^:(\d+)$/);
        if (fm) { file = fm[1]; fileAt.push([tk.at, file]); }
        const lineNo = fm && fm[2] ? +fm[2] : lm ? +lm[1] : null;
        if (lineNo === null || !file) return;
        // the name: "(`x`)" right after, else the nearest identifier token before
        let name = null;
        const next = toks[i + 1];
        if (next && /^\s*\(\s*$/.test(cell.slice(tk.end, next.at)) && /^[A-Za-z_]\w+$/.test(next.t)) name = next.t;
        for (let k = i - 1; !name && k >= 0; k--) {
          if (/^[A-Za-z_]\w+$/.test(toks[k].t) && cell.slice(toks[k].end, tk.at).length < 30) name = toks[k].t;
          else break;
        }
        if (!name) { unnamed.push(`${file}:${lineNo}`); return; }
        refs.push({ file, lineNo, name, token: tk.t, at: tk.at, ...formOf(file) });
      });
      for (const m of cell.matchAll(/`([A-Za-z_]\w+)`,? at (?:line )?(\d+)\b/g)) {
        const before = fileAt.filter(([at]) => at < m.index);
        if (!before.length) continue;
        const f = before[before.length - 1][1];
        refs.push({ file: f, lineNo: +m[2], name: m[1], token: m[0], at: m.index, prose: true, ...formOf(f) });
      }
    }
  }
  return { refs, unnamed };
}

function readRefText(inp, r) {
  if (r.form === 'back end') return inp.codeText.get(r.abs) || null;
  return inp.readText(r.abs);
}

function checkC(inp) {
  const fails = [];
  const { refs, unnamed } = refsOfC(inp.spec);
  const forms = Object.fromEntries(C_FORMS.map((f) => [f, 0]));
  for (const r of refs) {
    forms[r.form]++;
    const src = readRefText(inp, r);
    if (src === null) { fails.push(`C §4 names ${r.file}, which does not exist`); continue; }
    const text = src.split('\n')[r.lineNo - 1] || '';
    if (!text.includes(r.name)) fails.push(`C §4 says \`${r.name}\` is at ${r.file}:${r.lineNo}; that line is: ${text.trim().slice(0, 80) || '(beyond the end)'}`);
  }
  if (refs.length === 0) fails.push('C found no line references in §4 at all - the parser, not the document, is broken');
  return { fails, stats: { refs: refs.length, forms, unnamed: unnamed.length, unnamedList: unnamed } };
}

// ---------------------------------------------------------------- D
function checkD(inp) {
  const fails = [];
  const s2 = sliceSection(inp.spec, /^# 2 · /m, /^# 3 · /m);
  const needed = new Set(['B0']);
  for (const h of s2.split('\n').filter((l) => /^### /.test(l) && /CRM \d+ of 10/.test(l))) for (const m of h.matchAll(/`([BC]\d+)`/g)) needed.add(m[1]);
  const have = new Set();
  for (const h of inp.guide.split('\n').filter((l) => /^### Training — /.test(l))) for (const m of h.matchAll(/`([BC]\d+)`/g)) have.add(m[1]);
  for (const id of needed) if (!have.has(id)) fails.push(`D the CRM screen \`${id}\` has no "### Training — \`${id}\`" section in the guide`);
  return { fails, stats: { screens: needed.size } };
}

// ---------------------------------------------------------------- run
function runAll(inp) {
  const out = { A: checkA(inp), B: checkB(inp), C: checkC(inp), D: checkD(inp) };
  return out;
}

// the first §4 reference of a kind that lands today - a control planted in one already failing proves nothing
function goodRef(inp, pick) {
  return refsOfC(inp.spec).refs.find((r) => {
    if (!pick(r)) return false;
    const src = readRefText(inp, r);
    return src !== null && (src.split('\n')[r.lineNo - 1] || '').includes(r.name);
  }) || null;
}
// replace the first occurrence of `from` inside §4 only
function replaceAtRef(spec, r, from, to) {
  const s = spec.search(/^# 4 · /m);
  const i = spec.indexOf(from, s);
  return i < 0 ? spec : spec.slice(0, i) + to + spec.slice(i + from.length);
}

// append a planted cell to the Proved-by column of the first evidence row in the named part
function plantInPart(table, part, cell) {
  const lines = table.split('\n');
  let cur = '';
  for (let i = 0; i < lines.length; i++) {
    const pm = lines[i].match(/^# PART ([A-Z])\b/); if (pm) cur = pm[1];
    if (cur === part && /^\|/.test(lines[i]) && cellsOf(lines[i]).length === 3 && !/^\|\s*(Rows|What)\b|^\|\s*-/.test(lines[i])) {
      lines[i] = lines[i].replace(/\|\s*$/, ' ' + cell.replace(/^\|\s*/, '').replace(/\s*\|$/, '') + ' |');
      return lines.join('\n');
    }
  }
  return table;
}
// two fragments, each the start of a DIFFERENT real test title, joined with "…"
function splitTitle(inp) {
  const t = testTitles(inp.testFiles.map((f) => inp.codeText.get(f)).join('\n')).filter((x) => x.length > 30 && !/\*/.test(x));
  const a = t[0].slice(0, 20).trim();
  const b = t.find((x) => !x.includes(a)).slice(0, 20).trim();
  return `${a} … ${b}`;
}

function selfTest(inp) {
  const base = runAll(inp);
  const baseCount = (k) => base[k].fails.length;
  const controls = [
    ['A3 an evidence row removed', 'A', (x) => ({ ...x, table: x.table.replace(/^\| 1\.4, 1\.5, .*$/m, '') })],
    ['A2 a question title changed in the snapshot', 'A', (x) => ({ ...x, questions: x.questions.replace(/^## Do we need a login for anyone beyond the five roles/m, '## Do we need a login for somebody') })],
    ['A4 a rejected row stripped of its rule', 'A', (x) => ({ ...x, table: x.table.replace(/(\| 25\.10 \|[^|]*\| REJECTED \|)[^\n]*/, '$1 because |') })],
    ['A5 an identifier in the evidence renamed', 'A', (x) => ({ ...x, table: x.table.replace('`nextClaimRef`', '`nextClaimRefX`') })],
    // Phase 146: a stale test title in an EARLY evidence part (Part G), and a fragment title whose
    // fragments are each in some test but not all in one - both must go red.
    ['A5 a stale test title in an early part (G)', 'A', (x) => ({ ...x, table: plantInPart(x.table, 'G', '| *a test title that no test carries, planted by the self-test* |') })],
    ['A5 a fragment title split across two tests', 'A', (x) => ({ ...x, table: plantInPart(x.table, 'H', '| *' + splitTitle(x) + '* |') })],
    ['A1 a mark removed', 'A', (x) => ({ ...x, table: x.table.replace(/(\| 1\.2 \|[^|]*\|) ADOPTED \|/, '$1 built |') })],
    // every mention renamed, not one line dropped: the same route is described in §2 and in §3.1,
    // and a control that removed only one of them stayed green (found by this self-test, 12 Sep 2026)
    ['B a route the spec describes removed', 'B', (x) => ({ ...x, spec: x.spec.split('/staff/next-actions').join('/staff/nowhere-described') })],
    ['C a line reference shifted', 'C', (x) => ({ ...x, spec: x.spec.replace('`src/app.ts:79`', '`src/app.ts:78`') })],
    ['D a training section dropped', 'D', (x) => ({ ...x, guide: x.guide.replace(/^### Training — `B41`.*$/m, '### Search') })],
    // Phase 132g: the forms outside the back end. Their line numbers move while other work edits the
    // site and re-extracts the package, so each control plants its fault in a reference that lands
    // TODAY (a literal line number would go stale and prove nothing), and in memory only.
    ['C a site-file reference shifted by one line', 'C', (x) => {
      const r = goodRef(x, (y) => y.form === 'site' && !y.prose && /:\d+$/.test(y.token));
      return r ? { ...x, spec: replaceAtRef(x.spec, r, '`' + r.token + '`', '`' + `${r.file}:${r.lineNo + 1}` + '`') } : x;
    }],
    ['C a phase9 reference to a file that does not exist', 'C', (x) => {
      const r = goodRef(x, (y) => y.form === 'phase9' && !y.prose && /:\d+$/.test(y.token));
      return r ? { ...x, spec: replaceAtRef(x.spec, r, '`' + r.token + '`', '`' + r.token.replace(/\.ts:/, '-not-there.ts:') + '`') } : x;
    }],
    ['C a package (shared.js) line without the name beside it', 'C', (x) => {
      const r = goodRef(x, (y) => y.form === 'package' && /shared\.js$/.test(y.file));
      if (!r) return x;
      const lines = x.readText(r.abs).split('\n');
      lines[r.lineNo - 1] = lines[r.lineNo - 1].split(r.name).join('renamedAway');
      const planted = lines.join('\n');
      return { ...x, readText: (f) => (f === r.abs ? planted : x.readText(f)) };
    }],
    ['C a phase3 prose reference ("`x` at line NN") shifted', 'C', (x) => {
      const r = goodRef(x, (y) => y.form === 'phase3' && y.prose);
      return r ? { ...x, spec: replaceAtRef(x.spec, r, r.token, r.token.replace(/\d+$/, String(r.lineNo + 1))) } : x;
    }],
  ];
  let ok = true;
  for (const [name, k, mutate] of controls) {
    const m = mutate(inp);
    const changed = m.table !== inp.table || m.spec !== inp.spec || m.guide !== inp.guide || m.questions !== inp.questions || m.readText !== inp.readText;
    const r = runAll(m)[k].fails.length;
    const held = changed && r > baseCount(k);
    console.log(`${held ? 'FAILS AS REQUIRED' : 'DID NOT FAIL     '}  ${name}${changed ? '' : '  (the mutation matched nothing - the control itself is broken)'}`);
    if (!held) ok = false;
  }
  console.log(ok ? '\nSELF-TEST: every negative control failed as required.' : '\nSELF-TEST FAILED: a control did not go red.');
  return ok ? 0 : 1;
}

function main() {
  const inp = loadInputs();
  if (inp.cannot) { console.log(`COULD NOT RUN - ${inp.cannot}`); process.exit(2); }
  if (process.argv.includes('--self-test')) process.exit(selfTest(inp));
  const r = runAll(inp);
  console.log('THE CRM FOLD CHECK');
  console.log(`  A  disposition table   ${r.A.stats.rows} rows, ${r.A.stats.evidence} evidence lines`);
  console.log(`  B  routes              ${r.B.stats.routes} registered by the code`);
  const cf = r.C.stats.forms;
  console.log(`  C  §4 line references  ${r.C.stats.refs} read (back end ${cf['back end']}, site ${cf.site}, package ${cf.package}, phase9 ${cf.phase9}, phase3 ${cf.phase3}${cf.other ? `, other ${cf.other}` : ''})${r.C.stats.unnamed ? `; not checkable, no name beside: ${r.C.stats.unnamedList.join(', ')}` : ''}`);
  console.log(`  D  training sections   ${r.D.stats.screens} CRM screens`);
  const fails = [...r.A.fails, ...r.B.fails, ...r.C.fails, ...r.D.fails];
  console.log(`\nFAILURES (${fails.length})`);
  for (const f of fails) console.log('  ' + f);
  console.log(fails.length ? '\nRED.' : '\nGREEN: the table, the routes, §4 and the guide agree with the code.');
  process.exit(fails.length ? 1 : 0);
}
if (require.main === module) main();
else module.exports = { loadInputs, runAll, codeRoutes, refsOfC };
