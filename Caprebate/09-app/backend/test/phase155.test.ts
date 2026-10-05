/**
 * PHASE 155, 4 OCTOBER 2026 — THE SERVICES THE PLANS NAME BUT NOBODY HAS BUILT.
 *
 * Each line's tests were run on the code from before it and went red (04-phase-work/phase155/proofs/, OneDrive).
 * Recorded answers and invented rows only: nothing here reaches a real service.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { secretsFromValues } from '../src/secrets.ts';
import * as IE from '../src/web/inbound-email.ts';

const PASSWORD = 'an-invented-password-155';
const IMAP_KEYS = { IONOS_IMAP_HOST: 'imap.ionos.co.uk', IONOS_IMAP_PORT: '993', IONOS_IMAP_USER: 'contact@caprebate.co.uk', IONOS_IMAP_PASSWORD: 'not-a-real-password' };
const TIMER_WORD = 'an-invented-timer-word-of-forty-characters';
/** Monday 5 October 2026, 10:00 in the UK (BST), and minutes after it. */
const MON_10 = '2026-10-05T09:00:00.000Z';
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let now = MON_10;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-155-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, email, role] of [['u-155-admin', 'admin155@example.invalid', 'ADMIN'], ['u-155-sales', 'sales155@example.invalid', 'SALES']] as const) {
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, email, email, `${role} 155`, role, hash, MON_10, MON_10]);
  }
});
after(() => made.close());

async function signIn(email: string): Promise<(path: string, init?: RequestInit) => Promise<{ status: number; body: string }>> {
  const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }).toString() });
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return async (path, init = {}) => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined ?? {}), cookie } });
    return { status: x.status, body: await x.text() };
  };
}

const quietBox = { since: async () => [], one: async () => null, highestUid: async () => 7 };

/* ------------------------------------------------------------------ line 5 */

describe('line 5: Admin is told when email replies have not been read for over an hour in working hours', () => {
  test('never read, on a Monday morning, with reading on and its login set: warned', () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    assert.match(IE.repliesStale(made.app, MON_10) ?? '', /^Email replies have never been read in\. The outside timer that reads them \(cron-job\.org\) may have stopped/);
  });

  test('a read that worked clears it for an hour, and then it is back, saying when the last read was', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    made.app.mailbox = quietBox;
    try {
      now = MON_10;
      await IE.readRepliesIfDue(made.app, true);
      assert.equal(IE.repliesStale(made.app, plus(MON_10, 59)), null);
      assert.equal(IE.repliesStale(made.app, plus(MON_10, 60)), null);
      assert.match(IE.repliesStale(made.app, plus(MON_10, 61)) ?? '', /^Email replies were last read in at .*10:00.*, over an hour ago\./);
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('outside working hours, at a weekend, or with no login set: no warning', () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    const lastOk = made.app.db.get<{ last_ok_at: string }>('SELECT last_ok_at FROM mailbox_reads WHERE id = 1')?.last_ok_at;
    assert.equal(lastOk, MON_10);
    assert.equal(IE.repliesStale(made.app, '2026-10-05T16:30:00.000Z'), null, '17:30 on Monday is after hours');
    assert.equal(IE.repliesStale(made.app, '2026-10-06T07:30:00.000Z'), null, '08:30 on Tuesday is before hours');
    assert.equal(IE.repliesStale(made.app, '2026-10-10T11:00:00.000Z'), null, 'Saturday');
    assert.notEqual(IE.repliesStale(made.app, '2026-10-06T08:00:00.000Z'), null, '09:00 on Tuesday, last read Monday 10:00');
    made.app.secrets = secretsFromValues({});
    assert.equal(IE.repliesStale(made.app, '2026-10-06T08:00:00.000Z'), null, 'no mailbox login: nothing is meant to be reading');
  });

  test('a failed read keeps the last good time and says the inbox could not be read; nothing of the error is kept', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    made.app.mailbox = { since: async () => { throw new Error('the mailbox refused contact@caprebate.co.uk'); }, one: async () => null, highestUid: async () => 7 };
    try {
      now = plus(MON_10, 90);
      await IE.readRepliesIfDue(made.app, true);
      const row = made.app.db.get<Record<string, unknown>>('SELECT * FROM mailbox_reads WHERE id = 1');
      assert.deepEqual(row, { id: 1, last_try_at: plus(MON_10, 90), last_ok_at: MON_10, last_failed: 1 });
      assert.match(IE.repliesStale(made.app, plus(MON_10, 90)) ?? '', /or the inbox could not be read on the last try/);
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('the outside timer’s own call records the read (POST /hooks/read-replies)', async () => {
    made.app.secrets = secretsFromValues({ ...IMAP_KEYS, REPLY_TIMER_TOKEN: TIMER_WORD });
    made.app.mailbox = quietBox;
    try {
      now = plus(MON_10, 200);
      const r = await fetch(`${base}/hooks/read-replies`, { method: 'POST', headers: { authorization: `Bearer ${TIMER_WORD}` } });
      assert.equal(r.status, 200);
      assert.equal(made.app.db.get<{ last_ok_at: string }>('SELECT last_ok_at FROM mailbox_reads WHERE id = 1')?.last_ok_at, plus(MON_10, 200));
    } finally { delete made.app.mailbox; now = MON_10; }
  });

  test('Admin’s home shows the warning, on every view; Sales’s does not', async () => {
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    now = plus(MON_10, 24 * 60);
    try {
      const admin = await signIn('admin155@example.invalid');
      for (const view of ['', '?view=admin', '?view=accounting']) {
        const page = (await admin(`/staff${view}`)).body;
        assert.match(page, /<div class="flag" role="alert" id="replies-stale"><strong>Email replies are not being read\.<\/strong>/, view);
      }
      const sales = await signIn('sales155@example.invalid');
      assert.doesNotMatch((await sales('/staff')).body, /replies-stale/);
    } finally { now = MON_10; made.app.secrets = secretsFromValues({}); }
  });
});

/* ------------------------------------------------------------------ line 4 */

describe('line 4: the BCIS index from a file Lakhbir downloads, kept outside the repository', () => {
  const FILE = 'Period,Index\n1Q 2024,380\n2Q 2024,384\nJan 2025,388\n2026-01,396\n';

  test('imported to a file outside the repository, read back in the cost model’s table shape, and the factor uses it', async () => {
    const { importBcisIndex, bcisIndexTable } = await import('../src/web/bcis-index.ts');
    const out = join(mkdtempSync(join(tmpdir(), 'cb-bcis-')), 'index.json');
    const env = { CAPREBATE_BCIS_INDEX_FILE: out };
    assert.deepEqual(bcisIndexTable(env), { table: null, why: 'no BCIS index has been imported: BCIS is not bought yet (Word question 218)' });
    const r = importBcisIndex(FILE, '/Users/someone/Downloads/bcis-tpi.csv', '2026-10-04T15:00:00.000Z', env);
    assert.deepEqual(r, { ok: true, path: out, points: 4, from: '2024-01', to: '2026-01', passed_over: 1 });
    const t = bcisIndexTable(env);
    assert.ok(t.table !== null);
    assert.equal(t.table.source, 'BCIS building price index, imported from bcis-tpi.csv on 2026-10-04');
    const { createRequire } = await import('node:module');
    const M = createRequire(import.meta.url)('../../../04-phase-work/phase9/caprebate-cost-model.cjs') as { indexFactorFromTable: (t: unknown, a: string, b: string) => { factor: number } };
    assert.equal(M.indexFactorFromTable(t.table, '2024-05-01', '2026-01-15').factor, 384 / 396);
  });

  test('a path inside the repository is refused, and nothing is written there', async () => {
    const { importBcisIndex } = await import('../src/web/bcis-index.ts');
    const { repositoryRoot } = await import('../src/secrets.ts');
    const inside = join(repositoryRoot(), 'bcis-index-155.json');
    const r = importBcisIndex(FILE, 'x.csv', '2026-10-04T15:00:00.000Z', { CAPREBATE_BCIS_INDEX_FILE: inside });
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /may not be kept in the code folder/);
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(inside), false);
  });

  test('a file the cost model cannot read whole is refused whole, and an earlier good table is left as it was', async () => {
    const { importBcisIndex, bcisIndexTable } = await import('../src/web/bcis-index.ts');
    const out = join(mkdtempSync(join(tmpdir(), 'cb-bcis-')), 'index.json');
    const env = { CAPREBATE_BCIS_INDEX_FILE: out };
    assert.equal(importBcisIndex(FILE, 'good.csv', '2026-10-04T15:00:00.000Z', env).ok, true);
    const bad = importBcisIndex('2024-01,380\nSpring 2024,381\n', 'bad.csv', '2026-10-04T16:00:00.000Z', env);
    assert.equal(bad.ok, false);
    assert.match(bad.ok ? '' : bad.why, /not a month or a quarter/);
    assert.equal(bcisIndexTable(env).table?.points.length, 4);
  });
});

/* ------------------------------------------------------------------ lines 1 and 2 */

/** Invented files, with the real files' own column names (read 4 October 2026) and some of the columns never read. */
const q = (cells: readonly string[]) => cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
const CIW_HEAD = ['Service URN', 'Service name', 'Service type', 'Service sub-type', 'Service address line 1', 'Service address line 2',
  'Service address line 3', 'Service town/city', 'Service postcode', 'Service address UPRN', 'Local authority', 'Primary email address',
  'Maximum no. of places', 'Responsible Individual names', 'Registered Person names', 'Provider URN', 'Provider name', 'Provider type',
  'Company number', 'Provider registration date'];
const CIW_FILE = [
  q(CIW_HEAD),
  q(['SIN-00000001-AAAA', 'Invented Bryn Care Home', 'Care Home Service', 'Adults With Nursing', '1 Invented Lane', '', '', 'Nowhere', 'zz9 1aa',
    '100000000001', 'Invented Council', 'inventedhome@example.invalid', '42', 'Ann Invented', 'Bob Invented', 'P-0001', 'Carol Invented trading as Bryn', 'Individual', '', '07/03/2015']),
  q(['SIN-00000002-BBBB', 'Invented Other Home', 'Care Home Service', 'Adults Without Nursing', '3 Invented Lane', '', '', 'Nowhere', 'ZZ9 1AA',
    '', 'Invented Council', '', '12', '', '', 'P-0002', 'Invented Care Ltd', 'Organisation', '01234567', '31/02/2020']),
  q(['SIN-00000003-CCCC', 'An invented childminder', 'Child Minder', '', '', '', '', '', '', '', '', '', '6', 'Dee Invented', '', '', '', '', '', '']),
].join('\r\n');
const CI_HEAD = 'CSNumber,CareService,Subtype,ServiceName,Address_line_1,Address_line_2,Address_line_3,Address_line_4,Service_town,Service_Postcode,' +
  'ChopUPRN,Manager_Name,Service_Phone_Number,Eforms_email_address,SP_number,ServiceProvider,ServiceStatus,DateReg,TotalBeds,Council_Area_Name,Registered_Places,Complaints_upheld_2627';

describe('lines 1 and 2: the Welsh and Scottish care regulators, imported on this server and looked up there', () => {
  const ADMIN = { id: 'u-155-admin', role: 'ADMIN' };
  const deps = () => ({ db: made.app.db, audit: made.app.audit, now: () => '2026-10-04T16:00:00.000Z' });

  test('CIW: imported by Admin only; the services kept by their own reference, with places, kind, provider number and dates, and never a name or an email', async () => {
    const RF = await import('../src/web/register-files.ts');
    assert.throws(() => RF.importRegisterFile(deps(), 'CIW', CIW_FILE, 'ciw.csv', { id: 'u-155-sales', role: 'SALES' }), /only Admin/);
    const r = RF.importRegisterFile(deps(), 'CIW', CIW_FILE, 'ciw.csv', ADMIN);
    assert.deepEqual(r, { kept: 2, skipped_unreadable: 1, replaced: 0 });
    const all = made.app.db.all<{ ref: string; fields: string; address: string }>("SELECT ref, fields, address FROM register_file_rows WHERE source_id = 'CIW' ORDER BY ref");
    assert.deepEqual(JSON.parse(all[0]!.fields), {
      ciw_service_id: 'SIN-00000001-AAAA', service_categories: 'Care Home Service', service_subtype: 'Adults With Nursing', capacity: 42,
      ciw_uprn: '100000000001', local_authority: 'Invented Council', ciw_provider_id: 'P-0001', provider_type: 'Individual',
      provider_registration_date: '2015-03-07', location_postcode: 'ZZ9 1AA',
    });
    assert.equal(JSON.parse(all[1]!.fields).provider_registration_date, undefined, '31 February is not a date, so it is not kept');
    assert.doesNotMatch(JSON.stringify(all), /Invented Bryn|Ann Invented|Bob Invented|Carol Invented|inventedhome@|Invented Care Ltd/, 'a name or an email was kept');
    const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'REGISTER_FILE_IMPORTED' ORDER BY seq DESC LIMIT 1");
    assert.match(audit?.detail ?? '', /"kept":2/);
  });

  test('a file whose columns are not the regulator’s is refused whole, and the rows already held stay', async () => {
    const RF = await import('../src/web/register-files.ts');
    const wrong = CIW_FILE.replace('"Service postcode"', '"Postcode"');
    assert.throws(() => RF.importRegisterFile(deps(), 'CIW', wrong, 'wrong.csv', ADMIN), /not the ones Care Inspectorate Wales describes, so nothing was imported\. Missing: Service postcode/);
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM register_file_rows WHERE source_id = 'CIW'")?.n, 2);
  });

  test('the Care Inspectorate: a Windows-1252 file read as such, its own day-month-year dates, beds only where stated, Inactive kept as inactive', async () => {
    const RF = await import('../src/web/register-files.ts');
    const text = [CI_HEAD,
      'CS2001000001,Care Home Service,Older People,Invented House,1 Invented Street,,,,Nowhere,ZZ8 2BB,200000000001,Edna Invented,0100 000 0000,ednainvented@example.invalid,SP2001000001,Fred Invented,Active,01/04/2002,40,Invented Council,40,3',
      'CS2001000002,Care Home Service,Older People,St Invent’s House,2 Invented Street,,,,Nowhere,ZZ8 2BB,,,,,SP2001000002,Invented Group Ltd,Inactive,15/06/2010,,Invented Council,25,0',
    ].join('\r\n');
    const cp1252 = Uint8Array.from(Buffer.from(text.replace('’', '\u0092'), 'latin1'));
    assert.equal(RF.decodeRegisterFile(cp1252, 'CARE_INSPECTORATE').includes('St Invent’s House'), true, 'byte 0x92 is a right quote in Windows-1252');
    const r = RF.importRegisterFile(deps(), 'CARE_INSPECTORATE', RF.decodeRegisterFile(cp1252, 'CARE_INSPECTORATE'), 'ci.csv', ADMIN);
    assert.deepEqual(r, { kept: 2, skipped_unreadable: 0, replaced: 0 });
    const rows = made.app.db.all<{ fields: string }>("SELECT fields FROM register_file_rows WHERE source_id = 'CARE_INSPECTORATE' ORDER BY ref").map((x) => JSON.parse(x.fields));
    assert.deepEqual(rows[0], { ci_cs_number: 'CS2001000001', care_service: 'Care Home Service', care_subtype: 'Older People', registered_places: 40,
      total_beds: 40, registration_date: '2002-04-01', service_status: 'Active', ci_uprn: '200000000001', local_authority: 'Invented Council',
      ci_provider_number: 'SP2001000001', location_postcode: 'ZZ8 2BB' });
    assert.equal(rows[1].total_beds, undefined, 'no beds stated: none kept (N4), never 0');
    assert.equal(rows[1].service_status, 'Inactive');
    assert.doesNotMatch(JSON.stringify(rows), /Edna|Fred|ednainvented|0100 000|Invented Group/);
  });

  test('the lookups: Wales from CIW’s list and Scotland from the Care Inspectorate’s, matched on the address, nothing sent outside', async () => {
    const C = await import('../src/connectors/registers.ts');
    const { ciw, careInspectorate } = await import('../src/connectors/register-files.ts');
    const { fixtureTransport } = await import('../src/connectors/http.ts');
    const { emptySecrets } = await import('../src/secrets.ts');
    const t = fixtureTransport({});
    const ctx = { deps: { audit: made.app.audit, now: made.app.now, transport: t }, actor_id: 'u-155-admin', actor_role: 'ADMIN' as const, claim_id: null,
      gate: { free_gate_open: true, engagement_signed: true, switched_on: true }, secrets: null };
    const ALL_ON = Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true]));
    const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
    const wales = { id: 'p-w', address_line_1: '1 Invented Lane', address_line_2: null, town: 'Nowhere', postcode: 'ZZ9 1AA', jurisdiction: 'wales' as const };
    const w = await C.runConnector(ciw, ctx, { property: wales, nation: 'wales', db: made.app.db }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(w.state, 'FIRED', w.detail);
    assert.equal(w.bundle?.facts['ciw_service_id'], 'SIN-00000001-AAAA');
    assert.equal(w.bundle?.facts['capacity'], 42);
    assert.match(w.detail, /looked up in Care Inspectorate Wales's list on this server \(imported 2026-10-04\).*Nothing was sent outside/);
    const scot = { id: 'p-s', address_line_1: '2 Invented Street', address_line_2: null, town: 'Nowhere', postcode: 'ZZ8 2BB', jurisdiction: 'scotland' as const };
    const s = await C.runConnector(careInspectorate, ctx, { property: scot, nation: 'scotland', db: made.app.db }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(s.state, 'FIRED', s.detail);
    assert.equal(s.bundle?.facts['ci_cs_number'], 'CS2001000002');
    assert.equal(t.seen.length, 0, 'a call went outside');
    // Through the one door, as a research run stores it: the name exclusion register knows both sources and every field.
    const { ingestRegisterRecord } = await import('../src/stubs/registers.ts');
    made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-155', 'Invented Care Limited', 'care_homes', 'ASSESSMENT_SUBMITTED', MON_10]);
    let n = 0;
    for (const rec of [...(w.bundle?.records ?? []), ...(s.bundle?.records ?? [])]) {
      ingestRegisterRecord(made.app.db, () => `rr-155-${++n}`, made.app.now, 'b-155', rec);
    }
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM register_records WHERE business_id = 'b-155'")?.n, 2);
  });

  test('the wrong nation, no nation, no list imported, nothing at the postcode, and the switch off: each says so and keeps nothing', async () => {
    const C = await import('../src/connectors/registers.ts');
    const { ciw, careInspectorate } = await import('../src/connectors/register-files.ts');
    const { fixtureTransport } = await import('../src/connectors/http.ts');
    const { emptySecrets } = await import('../src/secrets.ts');
    const { testApp } = await import('./helpers.ts');
    const ctx = { deps: { audit: made.app.audit, now: made.app.now, transport: fixtureTransport({}) }, actor_id: 'u-155-admin', actor_role: 'ADMIN' as const, claim_id: null,
      gate: { free_gate_open: true, engagement_signed: true, switched_on: true }, secrets: null };
    const ALL_ON = Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true]));
    const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
    const prop = (pc: string, nation: 'wales' | 'scotland' | 'england') => ({ id: 'p', address_line_1: '1 Invented Lane', address_line_2: null, town: 'Nowhere', postcode: pc, jurisdiction: nation });
    const run = (c: typeof ciw, pc: string, nation: 'wales' | 'scotland' | 'england' | null, db = made.app.db, sw: Record<string, boolean> = ALL_ON) =>
      C.runConnector(c, ctx, { property: prop(pc, nation ?? 'wales'), nation, db }, ALLOWED, emptySecrets(), sw);
    assert.match((await run(ciw, 'ZZ9 1AA', 'england')).detail, /not in Wales/);
    assert.match((await run(careInspectorate, 'ZZ9 1AA', 'wales')).detail, /not in Scotland/);
    assert.match((await run(ciw, 'ZZ9 1AA', null)).detail, /do not know which part of the UK/);
    const fresh = await testApp();
    assert.match((await run(ciw, 'ZZ9 1AA', 'wales', fresh.db)).detail, /has not been imported here yet/);
    fresh.close();
    const none = await run(ciw, 'ZZ7 7ZZ', 'wales');
    assert.equal(none.state, 'FAILED');
    assert.match(none.detail, /no service at this postcode/);
    const off = await run(ciw, 'ZZ9 1AA', 'wales', made.app.db, C.REGISTER_SWITCHES);
    assert.equal(off.state, 'NOT_RUN');
    for (const r of [none, off]) assert.equal(r.bundle, null);
  });

  test('both are switched off as shipped; both are on the research panel as free lookups with a connector; the Welsh one is no longer "not built"', async () => {
    const C = await import('../src/connectors/registers.ts');
    const { FREE_CONNECTORS, NOT_BUILT } = await import('../src/connectors/free-registers.ts');
    assert.equal(C.REGISTER_SWITCHES['CIW'], false);
    assert.equal(C.REGISTER_SWITCHES['CARE_INSPECTORATE'], false);
    assert.ok(FREE_CONNECTORS['CIW'] !== undefined && FREE_CONNECTORS['CARE_INSPECTORATE'] !== undefined);
    assert.equal(NOT_BUILT['CIW'], undefined);
  });
});

/* ------------------------------------------------------------------ line 3 */

describe('line 3: the valuation office’s rating list — its licence read, and not built', () => {
  test('the licence is recorded as it is: not the Open Government Licence, rating purposes only, no channel open', async () => {
    const { LICENCES, SOURCES, SUPPLIER_DOCS } = await import('../../../04-phase-work/phase3/caprebate-source-register.ts');
    const voa = SOURCES.find((s) => s.source_id === 'VOA');
    assert.equal(voa?.licence_id, 'VOA_RATING_LIST');
    const lic = LICENCES.find((l) => l.licence_id === 'VOA_RATING_LIST');
    assert.match(lic?.name ?? '', /restricted to Non Domestic Rating purposes; NOT the Open Government Licence/);
    assert.deepEqual(lic?.redistribution, { client_report: false, accountant_report: false, hmrc_pack: false, internal: false });
    assert.equal(LICENCES.some((l) => l.licence_id === 'VOA_OPEN'), false, 'the old row said it was open data; it never was');
    assert.match(SUPPLIER_DOCS.find((x) => x.source_id === 'VOA')?.findings ?? '', /NOT FOR OUR USE/);
  });

  test('nothing imports it, and the research panel says why in plain words', async () => {
    const { FREE_CONNECTORS, NOT_BUILT } = await import('../src/connectors/free-registers.ts');
    const { FILE_SOURCES } = await import('../src/web/register-files.ts');
    assert.equal(FREE_CONNECTORS['VOA'], undefined);
    assert.equal((FILE_SOURCES as Record<string, unknown>)['VOA'], undefined);
    assert.match(NOT_BUILT['VOA'] ?? '', /licence lets its rating list be used for business rates only\. A capital allowances claim is not that/);
  });
});
