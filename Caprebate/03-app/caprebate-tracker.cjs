#!/usr/bin/env node
/**
 * THE TRACKER — Phase 151d, 25 September 2026. monday.com was dropped that day; its board is now
 * 00-START-HERE/hub/TRACKER.csv, one row per item AND subitem, and this is the one way to change it.
 *
 *   node 03-app/caprebate-tracker.cjs list [--status "<label>"] [--owner "<type>"] [--group "<text>"]
 *   node 03-app/caprebate-tracker.cjs show <board_id>
 *   node 03-app/caprebate-tracker.cjs set <board_id> status "<label>" [claimed_by "" ...]   (several fields = one change)
 *   node 03-app/caprebate-tracker.cjs note <board_id> "<text>" --phase "Phase 151d" [--date 2026-09-25]
 *   node 03-app/caprebate-tracker.cjs add --name "<name>" --group "<group>" --status "<label>" --owner "<type>" [--parent <id>]
 *   node 03-app/caprebate-tracker.cjs render      TRACKER.csv -> TRACKER.md (every write above renders too)
 *   node 03-app/caprebate-tracker.cjs check       exit 1 on a bad label, a duplicate id, an orphan subitem,
 *                                                 a name over 255 characters, or TRACKER.md out of step
 *   node 03-app/caprebate-tracker.cjs --self-test every planted fault must fail check; the clean copy must pass
 *
 * "POST AN UPDATE ON THE ITEM" now means `note`: a dated line in that row's notes cell. The 1,272 comments
 * monday.com carried are in hub/COMMENTS-ARCHIVE.md and are never edited. A new row gets an id one above the
 * highest in the file, so ids stay unique and never reused - they are how phases address rows, as before.
 *
 * Plain Node, no dependencies, like every other check here, so it runs on the Acer too.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const HUB = path.resolve(opt('--hub') || path.join(ROOT, '00-START-HERE/hub'));
const CSV = path.join(HUB, 'TRACKER.csv');
const MD = path.join(HUB, 'TRACKER.md');

const HEAD = ['board_id', 'parent_id', 'name', 'group', 'status', 'owner_type', 'person', 'deadline',
  'files', 'files_on_disk', 'document', 'claimed_by', 'cta_answer_status', 'cta_severity', 'notes'];

// The ten status labels, kept exactly as monday.com had them (COORDINATES), in the order the plan lists them.
const STATUS = ['Ready - Claude can build', 'Ready - Lakhbir action', 'Built - awaiting sign-off',
  'Blocked - question', 'Blocked - licence or purchase', 'Blocked - incorporation', 'Blocked - needs live jobs',
  'Parked - deliberate', 'Done', 'Working on it'];
// A subitem's status was a different column with five labels of its own; most subitems carry none.
const SUB_STATUS = ['', 'Working on it', 'Done', 'Stuck', 'Drafted, not approved', 'Waiting on someone else'];
// The six owner types, exactly. A seventh value, "Director (CAP REBATE LTD)", was on eight items in the
// 25 Sep 2026 export and in no record before it; it is kept as found, and flagged by `check`, not refused.
const OWNER = ['Claude', 'CTA', 'Lakhbir', 'Surveyor', 'Solicitor/DPO', 'Developer'];
const OWNER_FOUND = ['Director (CAP REBATE LTD)'];
const GROUPS = ['00 · START HERE', '01 · FOR LAKHBIR — decisions, appointments, company, governance',
  '02 · FOR THE TAX ADVISER — rulebooks, switches, tax sign-off', '03 · FOR THE ACCOUNTANT — the referral channel',
  '04 · FOR THE SURVEYOR — valuation, quantities, calibration', '05 · FOR DEVELOPMENT — engine, data layer, build, hosting',
  'Z · Complete / Not Applicable'];
// the three catalogue parents: their blank subitem rows are data, not unfinished work (COORDINATES)
const CATALOGUES = ['12818313893', '12818978746', '12830043701'];

// ---------------------------------------------------------------- CSV, RFC 4180, the shape Python's csv writes
function parseCSV(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const esc = (v) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
const toCSV = (head, recs) => [head, ...recs.map((r) => head.map((h) => r[h] ?? ''))].map((r) => r.map(esc).join(',')).join('\n') + '\n';

function load(file = CSV) {
  const rows = parseCSV(fs.readFileSync(file, 'utf8'));
  const head = rows.shift();
  return { head, recs: rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? '']))) };
}
function save(t, file = CSV) {
  fs.writeFileSync(file, toCSV(t.head, t.recs));
  fs.writeFileSync(path.join(path.dirname(file), 'TRACKER.md'), render(t));
}

// ---------------------------------------------------------------- TRACKER.md, derived, never edited by hand
function tally(recs, key) {
  const m = new Map(); for (const r of recs) m.set(r[key], (m.get(r[key]) || 0) + 1); return m;
}
function render(t) {
  const items = t.recs.filter((r) => !r.parent_id);
  const subs = t.recs.filter((r) => r.parent_id);
  const byParent = new Map(); for (const s of subs) { if (!byParent.has(s.parent_id)) byParent.set(s.parent_id, []); byParent.get(s.parent_id).push(s); }
  const st = tally(items, 'status'); const ow = tally(items, 'owner_type');
  const L = [];
  L.push('# TRACKER — every task, what is in its way, and who acts');
  L.push('');
  L.push('**Generated from `TRACKER.csv` by `node 03-app/caprebate-tracker.cjs render`. Do not edit this file: change the CSV with the tool, which re-renders it.** This was the monday.com board "Health Capital" until 25 September 2026, when monday.com was dropped (see the top of ACTION-PLAN.md). Every id is the one the board gave the item, so phase prompts, the registers and PHASE HISTORY still find it. A dated line under an item is a note — what "post an update on the item" used to mean. The comments the board carried until then are in COMMENTS-ARCHIVE.md.');
  L.push('');
  L.push(`**${items.length} items and ${subs.length} subitems.** Counted by the tool when this file was rendered — re-derive, never quote.`);
  L.push('');
  L.push('| Status | Items |'); L.push('| --- | ---: |');
  for (const s of STATUS) L.push(`| ${s} | ${st.get(s) || 0} |`);
  for (const [s, n] of st) if (!STATUS.includes(s)) L.push(`| ${s || '(blank)'} — NOT ONE OF THE TEN | ${n} |`);
  L.push('');
  L.push('| Owner type | Items |'); L.push('| --- | ---: |');
  for (const o of OWNER) L.push(`| ${o} | ${ow.get(o) || 0} |`);
  for (const [o, n] of ow) if (!OWNER.includes(o)) L.push(`| ${o || '(blank)'} — not one of the six | ${n} |`);
  L.push('');
  const groups = [...GROUPS, ...[...new Set(items.map((r) => r.group))].filter((g) => !GROUPS.includes(g))];
  for (const g of groups) {
    const gi = items.filter((r) => r.group === g);
    if (!gi.length) continue;
    L.push('---'); L.push(''); L.push(`## ${g}`); L.push('');
    L.push(`${gi.length} item${gi.length === 1 ? '' : 's'}.`); L.push('');
    for (const r of gi) {
      L.push(`### ${r.name}`);
      L.push('');
      L.push(`\`${r.board_id}\` · **${r.status || '(no status)'}** · owner ${r.owner_type || '(none)'}${r.person ? ' · ' + r.person : ''}${r.deadline ? ' · due ' + r.deadline : ''}${r.claimed_by ? ' · **CLAIMED BY ' + r.claimed_by + '**' : ''}`);
      L.push('');
      if (r.document) L.push(`- Document: ${r.document}`);
      if (r.files) {
        const names = r.files.split(' ; '); const where = r.files_on_disk.split(' ; ');
        for (let k = 0; k < names.length; k++) L.push(`- File: \`${where[k] || names[k]}\`${where[k] && where[k] !== names[k] && !where[k].endsWith('/' + names[k]) ? ` (attached as ${names[k]})` : ''}`);
      }
      for (const n of r.notes ? r.notes.split('\n') : []) L.push(`- Note ${n}`);
      const ks = byParent.get(r.board_id) || [];
      if (ks.length) {
        L.push(`- Subitems (${ks.length})${CATALOGUES.includes(r.board_id) ? ' — a catalogue: blank rows here are data, not unfinished work' : ''}:`);
        for (const s of ks) {
          const bits = [s.status, s.cta_answer_status && 'answer ' + s.cta_answer_status, s.cta_severity && s.cta_severity].filter(Boolean).join(' · ');
          L.push(`  - ${s.name} — \`${s.board_id}\`${bits ? ' · ' + bits : ''}${s.files ? ' · file `' + (s.files_on_disk || s.files) + '`' : ''}`);
          for (const n of s.notes ? s.notes.split('\n') : []) L.push(`    - Note ${n}`);
        }
      }
      L.push('');
    }
  }
  return L.join('\n') + '\n';
}

// ---------------------------------------------------------------- check
function check(t, mdText) {
  const fails = []; const warns = [];
  if (t.head.join(',') !== HEAD.join(',')) fails.push(`the header is not the tracker's: ${t.head.join(',')}`);
  const ids = new Map();
  for (const r of t.recs) {
    if (!/^\d+$/.test(r.board_id)) fails.push(`a row has no numeric id: "${r.name}"`);
    if (ids.has(r.board_id)) fails.push(`id ${r.board_id} is on two rows`);
    ids.set(r.board_id, r);
    if (!r.name.trim()) fails.push(`${r.board_id} has no name`);
    if (r.name.length > 255) fails.push(`${r.board_id}'s name is ${r.name.length} characters; the limit is 255`);
    for (const n of r.notes ? r.notes.split('\n') : []) if (!/^\d{4}-\d{2}-\d{2} \(.+?\): \S/.test(n)) fails.push(`${r.board_id} has a note that is not "YYYY-MM-DD (who): text": ${n.slice(0, 60)}`);
  }
  for (const r of t.recs) {
    if (r.parent_id) {
      const p = ids.get(r.parent_id);
      if (!p) fails.push(`subitem ${r.board_id} names a parent, ${r.parent_id}, that is not in the tracker`);
      else if (p.parent_id) fails.push(`subitem ${r.board_id}'s parent ${r.parent_id} is itself a subitem`);
      if (!SUB_STATUS.includes(r.status)) fails.push(`subitem ${r.board_id} has status "${r.status}", not one of a subitem's five`);
    } else {
      if (!STATUS.includes(r.status)) fails.push(`${r.board_id} has status "${r.status}", not one of the ten labels`);
      if (!OWNER.includes(r.owner_type)) {
        if (OWNER_FOUND.includes(r.owner_type)) warns.push(r.board_id);
        else fails.push(`${r.board_id} has owner type "${r.owner_type}", not one of the six`);
      }
      if (!GROUPS.includes(r.group)) fails.push(`${r.board_id} is in group "${r.group}", not one of the seven`);
      if (r.status === 'Ready - Lakhbir action' && r.owner_type === 'Claude') fails.push(`${r.board_id} is "Ready - Lakhbir action" and owned by Claude - a contradiction (COORDINATES)`);
      if (r.status === 'Working on it' && !r.claimed_by) fails.push(`${r.board_id} is "Working on it" and nobody has claimed it`);
      if (r.claimed_by && r.status !== 'Working on it') fails.push(`${r.board_id} is claimed by "${r.claimed_by}" and not "Working on it" - a claim left behind`);
    }
  }
  if (mdText !== undefined && mdText !== render(t)) fails.push('TRACKER.md is not what TRACKER.csv renders to - run `render`, never edit the .md');
  return { fails, warns };
}

// ---------------------------------------------------------------- the commands
function mustRow(t, id) {
  const r = t.recs.find((x) => x.board_id === String(id));
  if (!r) { console.error(`no row with id ${id}`); process.exit(2); }
  return r;
}
function main() {
  const cmd = argv[0];
  if (cmd === '--self-test') return selfTest();
  if (!fs.existsSync(CSV)) { console.error(`COULD NOT RUN - no tracker at ${CSV}`); process.exit(2); }
  const t = load();
  if (cmd === 'render') { fs.writeFileSync(MD, render(t)); console.log(`rendered ${path.relative(ROOT, MD)}`); return; }
  if (cmd === 'check') {
    const { fails, warns } = check(t, fs.existsSync(MD) ? fs.readFileSync(MD, 'utf8') : '');
    const items = t.recs.filter((r) => !r.parent_id).length;
    console.log(`THE TRACKER CHECK - ${items} items, ${t.recs.length - items} subitems`);
    if (warns.length) console.log(`  note: ${warns.length} item(s) carry the owner type "${OWNER_FOUND[0]}", which is not one of the six (found in the 25 Sep 2026 export; ACTION-PLAN.md, COORDINATES): ${warns.join(', ')}`);
    for (const f of fails) console.log('  FAIL ' + f);
    console.log(fails.length ? `RED - ${fails.length} failure(s).` : 'GREEN.');
    process.exit(fails.length ? 1 : 0);
  }
  if (cmd === 'list') {
    let rs = t.recs.filter((r) => !r.parent_id);
    if (opt('--status')) rs = rs.filter((r) => r.status === opt('--status'));
    if (opt('--owner')) rs = rs.filter((r) => r.owner_type === opt('--owner'));
    if (opt('--group')) rs = rs.filter((r) => r.group.includes(opt('--group')));
    for (const r of rs) console.log(`${r.board_id}  ${r.status.padEnd(29)} ${r.owner_type.padEnd(14)} ${r.name.slice(0, 110)}`);
    console.log(`${rs.length} item(s)`);
    return;
  }
  if (cmd === 'show') { const r = mustRow(t, argv[1]); for (const h of HEAD) console.log(`${h.padEnd(18)} ${r[h]}`); return; }
  if (cmd === 'set') {
    // several pairs in one call are one change: "status Done claimed_by ''" closes a claimed item, and
    // either half alone would be refused (a claim left behind, or work in progress that nobody holds)
    const r = mustRow(t, argv[1]); const pairs = argv.slice(2); const said = [];
    if (!pairs.length || pairs.length % 2) { console.error('set <board_id> <field> <value> [<field> <value> ...]'); process.exit(2); }
    for (let k = 0; k < pairs.length; k += 2) {
      const field = pairs[k]; const val = pairs[k + 1];
      if (!HEAD.includes(field) || field === 'board_id' || field === 'notes') { console.error(`cannot set "${field}"`); process.exit(2); }
      said.push(`${field}: "${r[field]}" -> "${val}"`); r[field] = val;
    }
    const { fails } = check(t);
    if (fails.length) { console.error('REFUSED - the change would leave the tracker red:\n  ' + fails.join('\n  ')); process.exit(1); }
    save(t); console.log(`${r.board_id} ${said.join('; ')}`); return;
  }
  if (cmd === 'note') {
    const r = mustRow(t, argv[1]); const text = argv[2];
    const who = opt('--phase'); const date = opt('--date') || new Date().toISOString().slice(0, 10);
    if (!text || !who) { console.error('note needs the text and --phase "<who>"'); process.exit(2); }
    if (/\n/.test(text)) { console.error('one line per note'); process.exit(2); }
    r.notes = (r.notes ? r.notes + '\n' : '') + `${date} (${who}): ${text}`;
    save(t); console.log(`${r.board_id} note added`); return;
  }
  if (cmd === 'add') {
    const next = String(t.recs.reduce((m, r) => (BigInt(r.board_id) > m ? BigInt(r.board_id) : m), 0n) + 1n);
    const r = Object.fromEntries(HEAD.map((h) => [h, '']));
    Object.assign(r, { board_id: next, parent_id: opt('--parent') || '', name: opt('--name') || '', group: opt('--group') || '',
      status: opt('--status') || '', owner_type: opt('--owner') || '' });
    if (r.parent_id) { const p = mustRow(t, r.parent_id); r.group = p.group; r.owner_type = ''; }
    t.recs.push(r);
    const { fails } = check(t);
    if (fails.length) { console.error('REFUSED:\n  ' + fails.join('\n  ')); process.exit(1); }
    save(t); console.log(`added ${next}: ${r.name}`); return;
  }
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
  process.exit(cmd ? 2 : 0);
}

function selfTest() {
  const t = load();
  const md = render(t);
  let ok = true;
  const say = (good, name) => { console.log(`${good ? 'AS REQUIRED ' : 'NOT AS REQUIRED'}  ${name}`); if (!good) ok = false; };
  say(toCSV(t.head, t.recs) === fs.readFileSync(CSV, 'utf8'), 'the CSV reads and writes back byte for byte');
  say(check(t, md).fails.length === 0, 'the clean tracker passes');
  const planted = (name, f, mdOverride) => {
    const c = { head: [...t.head], recs: t.recs.map((r) => ({ ...r })) }; f(c);
    say(check(c, mdOverride === undefined ? render(c) : mdOverride).fails.length > 0, 'fails as required: ' + name);
  };
  const firstItem = (c) => c.recs.find((r) => !r.parent_id);
  planted('a status that is not one of the ten', (c) => { firstItem(c).status = 'Stuck'; });
  planted('an owner type that is not one of the six', (c) => { firstItem(c).owner_type = 'Nobody'; });
  planted('two rows with one id', (c) => { c.recs[1].board_id = c.recs[0].board_id; });
  planted('a subitem whose parent is gone', (c) => { c.recs.find((r) => r.parent_id).parent_id = '99999999999'; });
  planted('a name over 255 characters', (c) => { firstItem(c).name = 'x'.repeat(256); });
  planted('a claim left behind on a Done item', (c) => { const r = c.recs.find((x) => !x.parent_id && x.status === 'Done'); r.claimed_by = 'a machine'; });
  planted('"Ready - Lakhbir action" owned by Claude', (c) => { const r = c.recs.find((x) => !x.parent_id && x.status === 'Ready - Lakhbir action'); r.owner_type = 'Claude'; });
  planted('a note with no date', (c) => { firstItem(c).notes = 'said something'; });
  planted('TRACKER.md edited by hand', () => {}, md.replace('# TRACKER', '# TRACKER (edited)'));
  console.log(ok ? '\nSELF-TEST: every planted fault failed, and the clean tracker passed.' : '\nSELF-TEST FAILED.');
  process.exit(ok ? 0 : 1);
}
if (require.main === module) main();
else module.exports = { parseCSV, toCSV, load, render, check, HEAD, STATUS, SUB_STATUS, OWNER, GROUPS };
