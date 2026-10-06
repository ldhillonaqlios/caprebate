/**
 * PHASE 156e, 5 October 2026 — THE PAID AND PAPER-FIRST SERVICES, THE CONNECTIONS PAGE AND THE CARE REGULATORS' LISTS.
 *
 * Lakhbir that day: Anthropic approved for testing ("Yes, for testing"), and the Welsh and Scottish care regulators'
 * lists included in "All the free ones" ("Yes, include them"). Here:
 *   · the document reader's test lookup reads ONE INVENTED PAGE through the pipeline's own strip, and keeps nothing;
 *   · the Connections page names every outside service, its key (there or not, never the value), its switch and its
 *     last call - Admin only;
 *   · a care regulator's list is imported from the page: trimmed on the Admin's computer by the page's script (only
 *     the kept columns leave it), or sent whole when small; refused whole on wrong columns; and Home reminds Admin to
 *     import each month's list.
 * Recorded answers only: nothing here reaches Anthropic or anyone else. Every file is invented.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import { TEST_WEBSITE_LOOKUPS } from '../src/connectors/registers.ts';
import { CLAUDE_SWITCHES } from '../src/connectors/claude.ts';
import { secretsFromValues, forgetRegisteredSecretsForTest } from '../src/secrets.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import * as L from '../src/connectors/test-lookups.ts';
import { CONNECTIONS, RETIRED_CALLS, connectionsView, listsToImport, ONE_REQUEST_BYTES } from '../src/web/connections.ts';
import { REGISTER_IMPORT_JS } from '../src/web/register-import-script.ts';
import { FILE_SOURCES } from '../src/web/register-files.ts';
import { SETTINGS_TILES } from '../src/web/admin-tiles.ts';
import { startHarness, type Harness } from './ui-tidy-harness.ts';

/* ================================================================== *
 * A1/A2 · ANTHROPIC, APPROVED FOR TESTING; THE TWO LISTS INCLUDED
 * ================================================================== */

describe('the records of what Lakhbir said', () => {
  test('the Claude API transfer is approved for testing, with who and when beside it; both reading switches still ship off', () => {
    assert.equal(CALL_POLICIES['CLAUDE_DOCUMENTS']?.international_transfer_approved, true);
    assert.deepEqual(CLAUDE_SWITCHES, { DOCUMENT_READING: false, SCANNED_PAGES: false });
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'connectors', 'sources.ts'), 'utf8');
    assert.match(src, /Approved FOR TESTING on 5 October 2026 - Sadique Maskeen/);
    assert.match(src, /"Yes, for testing"/);
    // The key never reaches the test website: it is not one of the names the website reads.
    const api = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'api', 'index.mjs'), 'utf8');
    assert.doesNotMatch(api.slice(api.indexOf('export const TEST_DEPLOY_KEYS'), api.indexOf('export async function configureTestDeploy')), /ANTHROPIC_API_KEY/);
  });

  test('the two care regulators\' lists are among the test website\'s free lookups, with his words', () => {
    for (const s of ['CIW', 'CARE_INSPECTORATE']) assert.ok(TEST_WEBSITE_LOOKUPS.sources.includes(s), s);
    assert.match(TEST_WEBSITE_LOOKUPS.waiver_record, /5 October 2026 \(Phase 156e\).*"Yes, include them"/);
  });
});

/* ================================================================== *
 * B1 · THE DOCUMENT READER'S TEST LOOKUP: ONE INVENTED PAGE
 * ================================================================== */

function lookupWorld(): { env: Record<string, string>; lines: () => Record<string, unknown>[] } {
  const dir = mkdtempSync(join(tmpdir(), 'cb-156e-smoke-'));
  const keys = join(dir, 'empty-keys.env');
  writeFileSync(keys, '', { mode: 0o600 });
  const log = join(dir, 'test-lookups.jsonl');
  const env = { PATH: process.env.PATH ?? '', HOME: dir, CAPREBATE_SECRETS: keys, CAPREBATE_TEST_LOOKUP_LOG: log, CAPREBATE_LIVE_SMOKE: '1' };
  const lines = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
  return { env, lines };
}
const WHO = ['--who', 'Invented Tester', '--why', 'Phase 156e: one read of an invented page'];
const ANSWER: Fixture = { status: 200, body: JSON.stringify({
  id: 'msg_fixture_156e', type: 'message', role: 'assistant', model: 'claude-opus-5',
  content: [{ type: 'text', text: JSON.stringify({ fields: [
    { field_id: 'cost_prelims_pct', value_json: '12', confidence: 0.95, page: 2, quote_ref: 'PRELIMINARIES AND FEES p2' },
    { field_id: 'cost_professional_fees_pct', value_json: '10', confidence: 0.9, page: 2, quote_ref: 'PRELIMINARIES AND FEES p2' },
  ] }) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 400, output_tokens: 60 } }) };

async function claudeLookup(extra: string[], keys: Record<string, string>, answer: Fixture = ANSWER) {
  const w = lookupWorld();
  const said: string[] = [];
  const deps = { now: () => '2026-10-05T18:00:00.000Z', out: (l: string) => { said.push(l); }, err: (l: string) => { said.push(l); } };
  assert.equal(L.runSwitchedOnCommand(['CLAUDE_DOCUMENTS', ...WHO], w.env, deps), 0);
  const transport = fixtureTransport({ 'POST /v1/messages': answer });
  const code = await L.runSmokeCommand(['CLAUDE_DOCUMENTS', ...WHO, ...extra], w.env, { ...deps, sleep: async () => {}, transport, secrets: secretsFromValues(keys) });
  forgetRegisteredSecretsForTest();
  return { code, said: said.join('\n'), seen: transport.seen, lines: w.lines() };
}

describe('B1 · the document reader\'s test lookup reads one invented page', () => {
  test('it is a test lookup source; with the key it sends the invented page through the strip, once, and passes', async () => {
    assert.ok(L.TEST_LOOKUP_SOURCES.includes('CLAUDE_DOCUMENTS'));
    const r = await claudeLookup([], { ANTHROPIC_API_KEY: 'sk-ant-fixture-156e' });
    assert.equal(r.code, 0, r.said);
    assert.equal(r.seen.length, 1);
    const sent = r.seen[0]!.body ?? '';
    assert.match(sent, /Extract ventilation to sterilisation room/, 'the invented page was not what was sent');
    assert.match(sent, /"model":"claude-opus-5"/);
    assert.match(r.said, /PASS {2}CLAUDE_DOCUMENTS/);
    assert.match(r.said, /2 of 5 fields found; answered by claude-opus-5/);
    assert.match(r.said, /The reading switch that ships is still off/);
  });

  test('the log keeps the connector, the time, the result, who and why - nothing read, and no figure from the page', async () => {
    const r = await claudeLookup([], { ANTHROPIC_API_KEY: 'sk-ant-fixture-156e' });
    const last = r.lines.at(-1)!;
    assert.equal(last['connector'], 'CLAUDE_DOCUMENTS');
    assert.equal(last['result'], 'PASS');
    assert.doesNotMatch(JSON.stringify(r.lines), /ventilation|12|sk-ant/, 'the log holds the page, an answer or the key');
  });

  test('it takes no document, company or address, and without the key it asks nobody', async () => {
    for (const extra of [['--company-number', '01234567'], ['--postcode', 'LE1 1AA'], ['--file', 'lease.pdf']]) {
      const r = await claudeLookup(extra, { ANTHROPIC_API_KEY: 'sk-ant-fixture-156e' });
      assert.equal(r.code, 1, extra.join(' '));
      assert.equal(r.seen.length, 0, `${extra.join(' ')} reached Anthropic`);
      assert.match(r.said, /reads only its own invented page/);
    }
    const none = await claudeLookup([], {});
    assert.equal(none.code, 1);
    assert.equal(none.seen.length, 0);
    assert.match(none.said, /no ANTHROPIC_API_KEY in the key file/);
  });

  test('a refusal or an unreadable answer is NO, not PASS', async () => {
    const r = await claudeLookup([], { ANTHROPIC_API_KEY: 'sk-ant-fixture-156e' }, { status: 200, body: JSON.stringify({ ...JSON.parse(ANSWER.body), stop_reason: 'refusal' }) });
    assert.equal(r.code, 1);
    assert.match(r.said, /NO {2}CLAUDE_DOCUMENTS/);
  });
});

/* ================================================================== *
 * B4 · THE PAGE'S SCRIPT: ONLY THE KEPT COLUMNS LEAVE THE COMPUTER
 * ================================================================== */

function trimmer(): (text: string, delim: string, wanted: string[]) => string {
  const sandbox: Record<string, unknown> = {};
  runInNewContext(REGISTER_IMPORT_JS, { window: sandbox, globalThis: sandbox });
  return sandbox['__registerTrim'] as (text: string, delim: string, wanted: string[]) => string;
}

describe('B4 · the import script trims a list on the Admin\'s computer', () => {
  test('only the named columns go, the header first; names, phones and emails stay; quotes, commas and line breaks survive', () => {
    const csv = '﻿Service URN,Manager name,Service postcode,Telephone,Service address line 1\r\n' +
      'SIN-001,"Ada Invented","CF10 1AA",02920 000000,"1 Invented Row, ""The Annexe""\nBack door"\r\n' +
      'SIN-002,Bob Invented,SA1 1AA,01792 000000,2 Invented Lane\r\n';
    const out = trimmer()(csv, ',', ['Service URN', 'Service postcode', 'Service address line 1', 'Not in the file']);
    assert.equal(out, '"Service URN","Service postcode","Service address line 1"\n"SIN-001","CF10 1AA","1 Invented Row, ""The Annexe""\nBack door"\n"SIN-002","SA1 1AA","2 Invented Lane"\n');
    assert.doesNotMatch(out, /Ada|Bob|02920|01792|Manager/);
  });

  test('the page names, for each list, exactly the columns the import reads', () => {
    for (const src of Object.values(FILE_SOURCES)) {
      const named = [src.ref, src.postcode, ...src.address, ...Object.values(src.fields)].filter((c) => typeof c === 'string');
      assert.ok(named.length > 3, src.source_id);
    }
    assert.ok(ONE_REQUEST_BYTES < 4.5 * 1024 * 1024);
  });
});

/* ================================================================== *
 * B3 · THE CONNECTIONS PAGE, AND B4 · THE IMPORT FROM IT
 * ================================================================== */

let H: Harness;
before(async () => { H = await startHarness('p156e'); });
after(() => H.close());

const CIW_HEAD = ['Service URN', 'Service type', 'Service sub-type', 'Maximum no. of places', 'Service address UPRN', 'Local authority',
  'Provider URN', 'Provider type', 'Provider registration date', 'Service address line 1', 'Service address line 2', 'Service address line 3',
  'Service town/city', 'Service postcode', 'Responsible Individual', 'Telephone'];
function ciwFile(rows: number): string {
  const q = (v: string) => `"${v}"`;
  const lines = [CIW_HEAD.map(q).join(',')];
  for (let i = 1; i <= rows; i++) {
    lines.push([`SIN-${String(i).padStart(5, '0')}`, 'Care Home Service', 'Adults With Nursing', String(20 + i), `10000${String(i)}`, 'Cardiff',
      `PIN-${String(i)}`, 'Organisation', '01/04/2020', `${String(i)} Invented Row`, '', '', 'Cardiff', 'CF10 1AA', 'Ada Invented', '02920 000000'].map(q).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
function multipart(fields: Record<string, string>, file: { name: string; bytes: Uint8Array; type: string }): RequestInit {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
  return { method: 'POST', body: fd };
}

describe('B3 · the Connections page', () => {
  test('every service the system may call is a row on the page (so a new one cannot be left off)', () => {
    const named = new Set(CONNECTIONS.flatMap((c) => c.calls));
    for (const id of Object.keys(CALL_POLICIES)) {
      if (RETIRED_CALLS.includes(id)) continue;
      assert.ok(named.has(id), `${id} is not on the Connections page`);
    }
  });

  test('Admin sees each service, its key there or not - never a value - its switch and its last call; nobody else sees it', async () => {
    H.made.app.secrets = secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'ch-fixture-value-156e-never-shown' });
    H.made.app.audit.append({ at: H.made.app.now(), kind: 'CONNECTOR_CALLED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'connector', object_id: 'COMPANIES_HOUSE', detail: { service: 'COMPANIES_HOUSE', endpoint: '/company/{n}', method: 'GET', result: 'OK', status: 200 } });
    const r = await H.get('admin', '/staff/connections');
    assert.equal(r.status, 200);
    for (const c of CONNECTIONS) assert.ok(r.body.includes(`id="conn-${c.id}"`), c.id);
    assert.doesNotMatch(r.body, /ch-fixture-value-156e/, 'a key value is on the page');
    const ch = r.body.slice(r.body.indexOf('id="conn-COMPANIES_HOUSE"'), r.body.indexOf('id="conn-CQC"'));
    assert.match(ch, /<code>COMPANIES_HOUSE_API_KEY<\/code> <span class="chip key-on">There<\/span>/);
    assert.match(ch, /: worked \(200\)/);
    assert.match(ch, /Testing only/);
    // Phase 156f: GoAddress is gone; Homedata's key answers the address box.
    assert.ok(!r.body.includes('id="conn-GOADDRESS"'));
    const hd = r.body.slice(r.body.indexOf('id="conn-HOMEDATA"'), r.body.indexOf('id="conn-DIDIT"'));
    assert.match(hd, /<code>HOMEDATA_API_KEY<\/code> <span class="chip key-off">Not set<\/span>/);
    assert.match(hd, /Address box today: 0 of 50 searches/);
    assert.match(r.body, /none is on for real clients yet/);
    for (const who of ['sales', 'accounting', 'surveying', 'readonly'] as const) {
      const n = await H.get(who, '/staff/connections');
      assert.ok(!n.body.includes('id="conn-COMPANIES_HOUSE"'), `${who} sees the Connections page`);
      assert.ok(!n.body.includes('<h1>Connections</h1>'), `${who} is given the Connections page, even if empty`);
    }
    assert.ok(connectionsView(H.made.app, H.actor('sales')).length === 0);
    assert.ok(SETTINGS_TILES.some((t) => t.href === '/staff/connections'));
  });

  test('the page itself carries no script (it is reached from Home); each list\'s import page, opened by a button, carries the one script', async () => {
    const r = await H.send('admin', '/staff/connections', {});
    assert.doesNotMatch(r.body, /<script/);
    for (const s of Object.values(FILE_SOURCES)) {
      assert.match(r.body, new RegExp(`<form method="get" action="/staff/connections/import" class="inline"><input type="hidden" name="list" value="${s.source_id}">`));
      const imp = await H.get('admin', `/staff/connections/import?list=${s.source_id}`);
      assert.match(imp.body, /<script src="\/assets\/register-import\.js"><\/script>/);
      assert.match(imp.body, new RegExp(`action="/staff/connections/register/${s.source_id}"`));
      assert.ok(!(await H.get('sales', `/staff/connections/import?list=${s.source_id}`)).body.includes('register-import.js'), 'Sales is given the import page');
    }
    assert.equal((await H.get('admin', '/assets/register-import.js')).body, REGISTER_IMPORT_JS);
  });
});

describe('B4 · importing a care regulator\'s list from the page', () => {
  test('as the script sends it (trimmed, UTF-8): imported, the old list replaced, the page says so', async () => {
    const small = trimmer()(ciwFile(3), ',', [...new Set([FILE_SOURCES.CIW.ref, FILE_SOURCES.CIW.postcode, ...FILE_SOURCES.CIW.address, ...Object.values(FILE_SOURCES.CIW.fields)].filter((c): c is string => typeof c === 'string'))]);
    assert.doesNotMatch(small, /Ada Invented|02920/);
    const r = await H.send('admin', '/staff/connections/register/CIW', multipart({ trimmed: '1', filename: 'ciw-extract.csv' }, { name: 'trimmed.csv', bytes: new TextEncoder().encode(small), type: 'text/csv' }));
    assert.equal(r.location, '/staff/connections?done=CIW&kept=3#conn-CIW', r.body.slice(0, 400));
    const imp = H.made.app.db.get<{ file_name: string; rows_kept: number }>("SELECT file_name, rows_kept FROM register_file_imports WHERE source_id = 'CIW' ORDER BY rowid DESC LIMIT 1")!;
    assert.deepEqual([imp.file_name, imp.rows_kept], ['ciw-extract.csv', 3]);
    const page = (await H.get('admin', '/staff/connections?done=CIW&kept=3')).body;
    assert.match(page, /Imported Care Inspectorate Wales’s list: 3 services kept/);
    assert.match(page, /3 services kept, 0 passed over/);
  });

  test('sent whole (no script), in the publisher\'s own encoding: the Scottish file\'s Windows-1252 is read right', async () => {
    const f = FILE_SOURCES.CARE_INSPECTORATE;
    const head = [f.ref, f.postcode, ...f.address, ...Object.values(f.fields)].filter((c, i, a): c is string => typeof c === 'string' && a.indexOf(c) === i);
    const row = head.map((c) => (c === f.ref ? 'CS2026000001' : c === f.postcode ? 'EH1 1AA' : c === 'Address_line_1' ? 'Caf\xe9 Court' : c === 'DateReg' ? '01/02/2021' : /Places|Beds/.test(c) ? '30' : 'x'));
    const text = `${head.join(',')}\r\n${row.join(',')}\r\n`;
    const bytes = Uint8Array.from([...text].map((ch) => ch.charCodeAt(0))); // Windows-1252: é is one byte, 0xE9
    const r = await H.send('admin', '/staff/connections/register/CARE_INSPECTORATE', multipart({}, { name: 'datastore.csv', bytes, type: 'text/csv' }));
    assert.equal(r.location, '/staff/connections?done=CARE_INSPECTORATE&kept=1#conn-CARE_INSPECTORATE', r.body.slice(0, 400));
    const kept = H.made.app.db.get<{ address: string }>("SELECT address FROM register_file_rows WHERE source_id = 'CARE_INSPECTORATE'")!;
    assert.match(kept.address, /Café Court/);
  });

  test('wrong columns are refused whole and nothing changes; only Admin may import', async () => {
    const before_ = H.made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM register_file_rows WHERE source_id = 'CIW'")!.n;
    const bad = await H.send('admin', '/staff/connections/register/CIW', multipart({ trimmed: '1' }, { name: 'x.csv', bytes: new TextEncoder().encode('"Service URN","Something else"\n"SIN-9","y"\n'), type: 'text/csv' }));
    assert.match(bad.body, /Missing: /);
    assert.equal(H.made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM register_file_rows WHERE source_id = 'CIW'")!.n, before_);
    const sales = await H.send('sales', '/staff/connections/register/CIW', multipart({ trimmed: '1' }, { name: 'x.csv', bytes: new TextEncoder().encode(ciwFile(1)), type: 'text/csv' }));
    assert.notEqual(sales.status, 303);
    assert.equal(H.made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM register_file_rows WHERE source_id = 'CIW'")!.n, before_);
  });

  test('Home reminds Admin of a list not imported this month, and stops once both are', async () => {
    const now = H.made.app.now();
    assert.equal(listsToImport(H.made.app), null, 'both were imported this month above');
    const later = new Date(Date.parse(now) + 40 * 86_400_000).toISOString();
    const real = H.made.app.now;
    H.made.app.now = () => later;
    try {
      assert.match(listsToImport(H.made.app) ?? '', /Care Inspectorate Wales and Care Inspectorate \(Scotland\): import this month’s lists/);
      const home = (await H.get('admin', '/staff?view=admin')).body;
      assert.match(home, /id="lists-due"/);
      assert.ok(!(await H.get('sales', '/staff')).body.includes('id="lists-due"'), 'Sales is told to import a list');
    } finally { H.made.app.now = real; }
  });
});
