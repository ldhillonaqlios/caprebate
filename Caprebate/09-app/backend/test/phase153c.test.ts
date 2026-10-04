/**
 * PHASE 153c, 4 October 2026 — data protection and the back office, built on our recommendation for Sadique Maskeen
 * (data protection officer) to check. The back end's half; the papers are in OneDrive (06-commercial-and-governance and
 * 08-monday-doc-exports).
 *
 *   line 1   Word question 37  — the address lookup kept seven years in test, every report channel still closed
 *   line 4   Word question 162 — "Through the client" saves only with the published notices page recorded too
 *   line 6   Word question 178 — each complaint's next update and target outcome, as our target
 *   line 7   Word question 181 — the restricted breach names list: the officer and the named deputy only
 *   line 9   Word question 183 — healthcare premises from open registers: four things, no person, no outreach
 *   line 12  Word question 193 — the scanned-page reader's allow list by kind of document
 *   line 13  (added 3 Oct)     — chapter 15 does not show the surveyor what each grant paid
 *   line 14  Word question 201 — the care regulator's 30 days and its attribution line
 *   line 15  Word question 208 — the first four screens' labels, in the site's allow-list and the funnel's
 *   line 16  Word question 219 — kept originals on the test website only; Sales opens only its own clients'
 *   line 17  Word question 222 — closed website enquiries deleted after twelve months, a deletion-log line each; off
 *   line 19  the testing waiver no longer calls Lakhbir the director
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { can, type Obj } from '../src/authz.ts';
import * as S from '../src/web/compliance-identity.ts';
import * as B from '../src/web/compliance-breach.ts';
import * as N from '../src/web/breach-names.ts';
import type * as C from '../src/web/compliance.ts';
import { addCalendarMonth, complaintTargets, COMPLAINT_TARGET_NOTE, COMPLAINT_UPDATE_EVERY_DAYS } from '../src/web/compliance-clock.ts';
import { importPremises, mayNameAPerson, sectorFromServiceTypes, PREMISES_SOURCES } from '../src/web/premises-import.ts';
import { scannedPagesAllowedFor, SCANNED_PAGE_KINDS } from '../src/connectors/claude.ts';
import { grantsChapter } from '../src/web/survey-pack-pages.ts';
import { GRANT_AMOUNTS_TO_SURVEYOR, type PackView } from '../src/web/survey-pack.ts';
import { F4_STEP_LABELS } from '../src/web/funnel4.ts';
import { KEEP_ORIGINALS, KEEP_ORIGINALS_TEST_WEBSITE } from '../src/web/originals.ts';
import { clientOwners } from '../src/web/documents.ts';
import { ENQUIRY_RETENTION, enquiryRetentionMissing, sweepEnquiries, type EnquiryRetention } from '../src/web/enquiry-retention.ts';
import { ADDRESS_KEEP_UNTIL } from '../src/connectors/address-lookup.ts';
import { IDENTITY_CHECK } from '../src/connectors/identity-check.ts';
import { LICENCES, SOURCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { actor, testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-10-04T09:00:00.000Z';
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');
const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function deps(a: App): C.ComplianceDeps {
  return { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
}

async function app(): Promise<App> {
  const a = await testApp();
  for (const [id, role] of [['u-ADMIN', 'ADMIN'], ['u-ADMIN-2', 'ADMIN'], ['u-SALES', 'SALES'], ['u-SURVEYING', 'SURVEYING']] as const) {
    a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, `${id} Person`, role, 'fake$x', T0, T0]);
  }
  return a;
}

function ok(r: C.WriteResult): string {
  assert.ok(r.ok, r.ok ? '' : r.why);
  return r.id;
}

describe('line 1 — Word question 37: the address lookup kept seven years in the test system', () => {
  test('Homedata’s keep-until is seven years as OUR test reading, awaiting its answer; every report channel stays closed', () => {
    const lic = LICENCES.find((l) => l.licence_id === 'HOMEDATA_TERMS');
    assert.ok(lic);
    assert.equal(lic.cache_max_age_days, 2557);
    assert.match(lic.notes ?? '', /TEST READING[\s\S]*awaiting Homedata/);
    assert.deepEqual(lic.redistribution, { client_report: false, accountant_report: false, hmrc_pack: false, internal: true });
  });
  test('GoAddress, which "Find my address" uses, carries the same reading, and says it is not the supplier’s figure', () => {
    assert.equal(ADDRESS_KEEP_UNTIL.days, 2557);
    assert.equal(ADDRESS_KEEP_UNTIL.reports_closed, true);
    assert.match(ADDRESS_KEEP_UNTIL.reading, /test reading, not the supplier/);
    assert.match(ADDRESS_KEEP_UNTIL.awaiting, /Homedata[\s\S]*GoAddress/);
  });
});

describe('line 4 — Word question 162: "Through the client" is never the only route', () => {
  async function person(a: App): Promise<string> {
    const biz = randomUUID();
    a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Dental Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    const doc = randomUUID();
    a.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [doc, biz, 'u-ADMIN', 'x.pdf', 'STORED', T0]);
    return ok(S.recordPerson(deps(a), ADMIN, { doc_id: doc, name: 'Ivy Inventedperson', role: 'ATTESTING_WITNESS' }));
  }
  const notice = (extra: C.Fields) => ({ what: 'NOTICE', notice_template: 'BTC-T7', notice_route: 'CLIENT_ROUTE', notice_sent_on: '2026-10-04', ...extra });

  test('through the client alone is refused, by the application and by the table; with the published page recorded it saves', async () => {
    const a = await app();
    try {
      const ref = await person(a);
      for (const alone of [{}, { notice_published_too: 'NO' }, { notice_published_too: '' }]) {
        const r = S.updatePerson(deps(a), ADMIN, ref, notice(alone));
        assert.equal(r.ok, false, `saved with ${JSON.stringify(alone)}`);
        assert.match(r.ok ? '' : r.why, /never the only route/);
      }
      assert.throws(() => a.db.run("UPDATE identity_persons SET notice_route = 'CLIENT_ROUTE', notice_published_too = 0 WHERE person_ref = ?", [ref]), /published notices page/);
      assert.equal(S.updatePerson(deps(a), ADMIN, ref, notice({ notice_published_too: 'YES' })).ok, true);
      assert.equal(a.db.get<{ p: number }>('SELECT notice_published_too AS p FROM identity_persons WHERE person_ref = ?', [ref])?.p, 1);
      // A direct route needs no published page.
      assert.equal(S.updatePerson(deps(a), ADMIN, ref, notice({ notice_route: 'DIRECT_POST' })).ok, true);
    } finally { a.close(); }
  });
});

describe('line 6 — Word question 178: our own targets for a complaint, never called a legal deadline', () => {
  test('next update 28 days after the last time we told them; the outcome a calendar month after it came in', () => {
    assert.equal(COMPLAINT_UPDATE_EVERY_DAYS, 28);
    const t = complaintTargets('2026-10-01', '2026-10-03', [], null);
    assert.deepEqual([t.last_told, t.next_update_due, t.target_outcome], ['2026-10-03', '2026-10-31', '2026-11-01']);
    const later = complaintTargets('2026-10-01', '2026-10-03', ['2026-10-20'], null);
    assert.equal(later.next_update_due, '2026-11-17', 'an update restarts the 28 days');
    assert.equal(complaintTargets('2026-10-01', '2026-10-03', [], '2026-10-25').next_update_due, null, 'told the outcome: no more updates due');
    assert.match(COMPLAINT_TARGET_NOTE, /^These are our own targets, not legal deadlines\./);
  });
  test('a calendar month from the 31st ends on the month’s last day, never in the month after', () => {
    assert.equal(addCalendarMonth('2026-01-31'), '2026-02-28');
    assert.equal(addCalendarMonth('2026-12-15'), '2027-01-15');
  });
});

describe('line 7 — Word question 181: the restricted breach names list', () => {
  const base = { discovered_at: '2026-10-04T09:00', discovered_by: 'Invented', discovery_route: 'NOTICED', awareness_at: '2026-10-04T09:30', awareness_basis: 'Saw it', occurred_state: 'UNKNOWN', occurred_basis: 'Not yet known' };

  test('nobody opens it until a deputy is named; then the deputy alone (the officer’s role is off) — every other Admin is refused, and the refusal is recorded', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const incident = ok(B.openIncident(d, ADMIN, { ...base, kind: 'SECURITY_INCIDENT', description: 'An invented laptop was lost.' }));
      assert.equal(N.addName(d, ADMIN, incident, { name: 'Ivy Inventedperson', how_involved: 'Her letter was on the laptop' }).ok, false, 'an Admin who is not the deputy added a name');
      assert.ok(a.audit.entries().some((e) => e.kind === 'BREACH_NAMES_REFUSED'));

      assert.equal(N.nameDeputy(d, SALES, { user_id: 'u-ADMIN-2', source: 'The signed letter of authority' }).ok, false, 'Sales named the deputy');
      assert.equal(N.nameDeputy(d, ADMIN, { user_id: 'u-SALES', source: 'The signed letter of authority' }).ok, false, 'a Sales login was named deputy');
      assert.equal(N.nameDeputy(d, ADMIN, { user_id: 'u-ADMIN-2', source: '' }).ok, false, 'named with no paper');
      ok(N.nameDeputy(d, ADMIN, { user_id: 'u-ADMIN-2', source: 'The letter of authority, draft v0.1 (test only)' }));

      const DEPUTY = actor('ADMIN', 'u-ADMIN-2');
      ok(N.addName(d, DEPUTY, incident, { name: 'Ivy Inventedperson', how_involved: 'Her letter was on the laptop' }));
      const got = N.namesFor(d, DEPUTY, incident);
      assert.ok(got.ok);
      assert.equal(got.ok ? got.annex_ref : null, 'ANX-001');
      assert.deepEqual(got.ok ? got.lines.map((l) => l.name) : [], ['Ivy Inventedperson']);
      assert.equal(N.namesFor(d, ADMIN, incident).ok, false, 'another Admin read the names');
      assert.equal(N.namesFor(d, SALES, incident).ok, false);

      // The entry carries the reference, never the name; the list is never edited or deleted.
      const entry = JSON.stringify(a.db.get('SELECT * FROM breach_incidents WHERE id = ?', [incident]));
      assert.match(entry, /ANX-001/);
      assert.ok(!entry.includes('Inventedperson'), 'the name reached the breach entry');
      assert.ok(!JSON.stringify(a.audit.entries()).includes('Inventedperson'), 'the name reached the audit log');
      assert.throws(() => a.db.run("UPDATE breach_names SET name = 'x'"), /never edited/);
      assert.throws(() => a.db.run('DELETE FROM breach_names'), /never deleted/);
      assert.throws(() => a.db.run('DELETE FROM breach_names_deputies'), /never deleted/);
    } finally { a.close(); }
  });
});

describe('line 9 — Word question 183: healthcare premises from open registers, with no person and no outreach', () => {
  const CQC = [
    'Name,Also known as,Address,Postcode,Phone number,Service\'s website (if available),Service types,Registered manager,CQC Location ID',
    'Oak Lodge Care Home,,"12 Mill Lane, Hinckley",le10 1aa,01234 567890,,Residential homes|Nursing homes,Jane Inventedmanager,1-000000001',
    'Dr A Patel Dental Practice,,1 High Street,LE10 1AB,01234 000000,,Dentist,,1-000000002',
    'Mill Street Homecare,,2 Mill Street,LE10 1AC,,,Homecare agencies,,1-000000003',
    'No Postcode House,,3 Nowhere,,,,Residential homes,,1-000000004',
    'Grange Surgery,,4 Grange Road,LE10 1AD,,,Doctors/GPs,,1-000000005',
  ].join('\n');

  test('the four things only, from the columns named; a name that may be a person’s held back; another sector or an unreadable row skipped', async () => {
    const a = await app();
    try {
      const d = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
      const r = importPremises(d, 'CQC_CARE_DIRECTORY', CQC, ADMIN);
      assert.deepEqual(r, { kept: 2, already_held: 0, held_back_may_name_a_person: 1, skipped_unreadable: 1, skipped_not_our_sector: 1 });
      const rows = a.db.all<Record<string, unknown>>('SELECT business_name, address, postcode, sector, source_id, source_ref FROM healthcare_premises ORDER BY business_name');
      assert.deepEqual(rows.map((x) => [x['business_name'], x['postcode'], x['sector']]), [['Grange Surgery', 'LE10 1AD', 'gp'], ['Oak Lodge Care Home', 'LE10 1AA', 'care_homes']]);
      const every = JSON.stringify(a.db.all('SELECT * FROM healthcare_premises'));
      for (const never of ['Jane Inventedmanager', '01234', 'Patel']) assert.ok(!every.includes(never), `${never} was kept`);
      assert.deepEqual(importPremises(d, 'CQC_CARE_DIRECTORY', CQC, ADMIN).already_held, 2, 'a second import keeps nothing twice');
      assert.throws(() => importPremises(d, 'CQC_CARE_DIRECTORY', 'Name,Address\nX,Y', ADMIN), /columns we read/);
    } finally { a.close(); }
  });

  test('the table has no column for a person, an email or a telephone number, and nothing else in the application reads it', async () => {
    const a = await app();
    try {
      const cols = a.db.all<{ name: string }>("SELECT name FROM pragma_table_info('healthcare_premises')").map((c) => c.name).sort();
      assert.deepEqual(cols, ['address', 'business_name', 'id', 'imported_at', 'imported_by', 'licence', 'postcode', 'sector', 'source_id', 'source_ref']);
    } finally { a.close(); }
    const src = join(import.meta.dirname, '..', 'src');
    const { readdirSync } = await import('node:fs');
    const readers: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts') && readFileSync(p, 'utf8').includes('healthcare_premises')) readers.push(p.slice(src.length + 1));
      }
    };
    walk(src);
    assert.deepEqual(readers.sort(), ['web/premises-import.ts'], 'something other than the import reads the premises list');
  });

  test('the name guard and the sector map, both ways', () => {
    for (const n of ['Dr A Patel Dental Practice', 'Mrs J Smith Care', 'A. B. Jones Dental', 'Prof Grey Clinic']) assert.equal(mayNameAPerson(n), true, n);
    for (const n of ['Oak Lodge Care Home', 'St Mary’s Nursing Home', 'Mission House Surgery', 'Smile Dental Limited']) assert.equal(mayNameAPerson(n), false, n);
    assert.equal(sectorFromServiceTypes('Homecare agencies'), null);
    assert.equal(sectorFromServiceTypes('Supported living'), 'supported_living');
    assert.deepEqual(Object.keys(PREMISES_SOURCES).sort(), ['CQC_CARE_DIRECTORY', 'NHS_ODS_DENTAL', 'NHS_ODS_GP']);
    assert.ok(Object.values(PREMISES_SOURCES).every((s) => s.licence === 'Open Government Licence v3.0'));
  });
});

describe('line 12 — Word question 193: page pictures go to the reader only for the kinds on the list', () => {
  test('the three kinds named, and every other kind — or none — refused', () => {
    assert.deepEqual([...SCANNED_PAGE_KINDS], ['CONTRACTOR_COST_BREAKDOWN', 'OM_MANUAL', 'BUILDING_REGS_COMPLETION']);
    for (const k of SCANNED_PAGE_KINDS) assert.equal(scannedPagesAllowedFor(k), true, k);
    for (const k of ['LEASE', 'ACCOUNTS', 'FIRE_RISK_ASSESSMENT', '', null, undefined]) assert.equal(scannedPagesAllowedFor(k), false, String(k));
  });
  test('the upload path passes each document’s kind to the reader', () => {
    const uploads = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'uploads.ts'), 'utf8');
    assert.match(uploads, /SELECT type_code FROM documents WHERE id = \?/);
    assert.match(uploads, /readScannedPages\(ctx, doc_id, images, kind\)/);
  });
});

describe('line 13 — chapter 15 does not show the surveyor what each grant paid', () => {
  const view = (shown: boolean): PackView => ({
    job: { id: 'j-x' }, lines: [{ id: 'LS-MP-003', label: 'Fire alarm' }], sums: { qualifying_pence: 11_520_000 },
    grants: {
      claim_id: 'c-x', amounts_shown: shown, switches: { element_trace: true, connected_no_reduction: false },
      list: [{ id: 'g-1', kind: 'GRANT', payer_class: 'nhs', amount_pence: 4_123_400, traced: 'YES', element_ids: ['LS-MP-003'], element_names: ['Fire alarm'] }],
      reading: { effects: [{ grant_id: 'g-1', route: 'ITEMS', reduction_pence: 3_987_600, words: '', line_ids: ['LS-MP-003'] }], before: { qualifying_pence: 15_507_600 }, reduction_pence: 3_987_600 },
    },
  }) as unknown as PackView;

  test('off for the surveyor, as recommended: who paid and the pack’s totals are shown, each grant’s amount and share are not', () => {
    assert.equal(GRANT_AMOUNTS_TO_SURVEYOR, false);
    const s = grantsChapter(view(false)).html;
    assert.ok(!s.includes('41,234'), 'the grant’s amount was shown to the surveyor');
    assert.match(s, /Held by the office/);
    assert.match(s, /155,076/, 'the total before grants is still shown');
    assert.match(s, /39,876/, 'the pack’s "less grants" total is still shown');
  });
  test('every other role sees the amount', () => {
    const s = grantsChapter(view(true)).html;
    assert.match(s, /41,234/);
    assert.ok(!s.includes('Held by the office'));
  });
  test('the view decides by role: SURVEYING is the only role the amounts are hidden from', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'survey-pack.ts'), 'utf8');
    assert.match(src, /amounts_shown: actor\.role !== 'SURVEYING' \|\| GRANT_AMOUNTS_TO_SURVEYOR/);
  });
});

describe('line 14 — Word question 201: the care regulator, 30 days, and its source line', () => {
  test('30 days in the test system, and the attribution names the regulator and the licence', () => {
    const cqc = SOURCES.find((s) => s.source_id === 'CQC');
    assert.ok(cqc);
    const lic = LICENCES.find((l) => l.licence_id === cqc.licence_id);
    assert.equal(lic?.cache_max_age_days, 30);
    assert.equal(lic?.attribution_text, 'Source: Care Quality Commission, Open Government Licence');
  });
});

describe('line 15 — Word question 208: the first four screens, labelled the same in three places', () => {
  test('the site’s allow-list, the estimate’s calls and the funnel’s labels hold exactly prior_claim, prior_owner_claim, entity and trigger', () => {
    const site = readFileSync(join(ROOT, 'Caprebate site.html'), 'utf8');
    const list = /step_id:\s*\{ oneOf:\[([^\]]*)\]/.exec(site)?.[1] ?? '';
    for (const id of ['prior_claim', 'prior_owner_claim', 'entity', 'trigger']) assert.ok(list.includes(`"${id}"`), `${id} is not in the allow-list`);
    assert.match(site, /var STEP_ID = \{ Q1:"prior_claim", Q1a:"prior_owner_claim", Q2:"entity", Q3:"trigger" \};/);
    assert.deepEqual(Object.values(F4_STEP_LABELS).flat().sort(), ['entity', 'prior_claim', 'prior_owner_claim', 'trigger']);
  });
});

describe('line 16 — Word question 219: kept originals on the test website only, and Sales only for its own clients', () => {
  const ORIGINAL = (owner_ids?: readonly string[]): Obj => ({ type: 'document', id: 'd', business_id: 'b', readers: 'CLAIM_EVIDENCE', carries_value: false, letter_signed: true, assigned_surveyor_ids: [], shown_to_client: true, ...(owner_ids === undefined ? {} : { owner_ids }) }) as Obj;
  test('Sales opens a kept original only where it owns the client; absent and empty owners are both refused (N4); Admin always', () => {
    assert.equal(can(SALES, 'document.read_original', ORIGINAL(['u-SALES'])), true);
    assert.equal(can(SALES, 'document.read_original', ORIGINAL(['u-other-sales'])), false, 'Sales opened another salesperson’s client’s original');
    assert.equal(can(SALES, 'document.read_original', ORIGINAL([])), false);
    assert.equal(can(SALES, 'document.read_original', ORIGINAL()), false);
    assert.equal(can(ADMIN, 'document.read_original', ORIGINAL()), true);
    assert.equal(can(actor('ACCOUNTING'), 'document.read_original', ORIGINAL(['u-ACCOUNTING'])), false);
  });
  test('the owners are the business’s and every claim’s, and nobody where none is recorded', async () => {
    const a = await app();
    try {
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,owner_id) VALUES (?,?,?,?,?,?,?)', ['b-own', 'Invented Care Limited', 'care_homes', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE', 'u-SALES']);
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', ['b-none', 'Unowned Care Limited', 'care_homes', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
      assert.deepEqual(clientOwners(a.db, 'b-own'), ['u-SALES']);
      assert.deepEqual(clientOwners(a.db, 'b-none'), []);
    } finally { a.close(); }
  });
  test('shipped off everywhere; on, seven years, only through the test website’s own start file', () => {
    assert.equal(KEEP_ORIGINALS.enabled, false);
    assert.equal(KEEP_ORIGINALS_TEST_WEBSITE.enabled, true);
    assert.equal(KEEP_ORIGINALS_TEST_WEBSITE.retention_days, 2557);
    assert.match(KEEP_ORIGINALS_TEST_WEBSITE.waiver_record, /Keep them, test only/);
    const api = readFileSync(join(ROOT, 'api', 'index.mjs'), 'utf8');
    assert.match(api, /keepOriginals: \(await import\('\.\.\/Caprebate\/09-app\/backend\/src\/web\/originals\.ts'\)\)\.KEEP_ORIGINALS_TEST_WEBSITE/);
    assert.ok(!/console\.log\([^)]*process\.env\.CAPREBATE_ORIGINALS_KEY\)/.test(api), 'the key’s value is printed');
  });
});

describe('line 17 — Word question 222: closed website enquiries deleted twelve months after they were closed', () => {
  const ON: EnquiryRetention = { ...ENQUIRY_RETENTION, enabled: true, approved_by: 'Invented officer (test only)', review_ref: 'TEST-REVIEW-1' };
  function enquiry(a: App, id: string, status: 'NEW' | 'CLOSED', handled_at: string | null): void {
    a.db.run('INSERT INTO website_enquiries (id, created_at, full_name, email, property_type, contact_consent, status, handled_by, handled_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      [id, '2025-01-01T09:00:00.000Z', 'Ivy Inventedperson', 'ivy@example.invalid', 'Care home', status, handled_at === null ? null : 'u-ADMIN', handled_at]);
  }

  test('shipped off: nothing is deleted, and it says what is missing', async () => {
    const a = await app();
    try {
      enquiry(a, 'e-old', 'CLOSED', '2025-01-01T09:00:00.000Z');
      assert.equal(ENQUIRY_RETENTION.enabled, false);
      assert.equal(ENQUIRY_RETENTION.closed_months, 12);
      const r = sweepEnquiries({ db: a.db, audit: a.audit, now: () => T0, newId: randomUUID });
      assert.equal(r.state, 'OFF');
      assert.deepEqual(enquiryRetentionMissing(ENQUIRY_RETENTION), ['Record who approved it, and where.', 'Then switch the clean-up on.']);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM website_enquiries')?.n, 1);
    } finally { a.close(); }
  });

  test('on: a closed enquiry past twelve months is deleted with a deletion-log line naming no one; the rest stay', async () => {
    const a = await app();
    try {
      enquiry(a, 'e-due', 'CLOSED', '2025-09-01T09:00:00.000Z');
      enquiry(a, 'e-recent', 'CLOSED', '2026-09-01T09:00:00.000Z');
      enquiry(a, 'e-open', 'NEW', null);
      enquiry(a, 'e-held', 'CLOSED', '2025-01-01T09:00:00.000Z');
      a.db.run("INSERT INTO legal_holds (id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_by, set_at) VALUES ('h-1', 'LEGAL_HOLD', 'WEBSITE_ENQUIRY', 'e-held', 'DISPUTE', 'An invented dispute', '2027-01-01', 'u-ADMIN', ?)", [T0]);
      const r = sweepEnquiries({ db: a.db, audit: a.audit, now: () => T0, newId: randomUUID }, ON);
      assert.equal(r.state, 'DONE');
      assert.equal(r.state === 'DONE' ? r.deleted : -1, 1);
      assert.deepEqual(a.db.all<{ id: string }>('SELECT id FROM website_enquiries ORDER BY id').map((x) => x.id), ['e-held', 'e-open', 'e-recent']);
      const log = a.db.all<Record<string, unknown>>("SELECT * FROM deletion_log WHERE record_kind = 'WEBSITE_ENQUIRY'");
      assert.equal(log.length, 1);
      assert.equal(log[0]?.['record_id'], 'e-due');
      assert.equal(log[0]?.['basis_rule'], 'ENQ-RETENTION');
      assert.equal(log[0]?.['basis_due_on'], '2026-09-01');
      assert.ok(!JSON.stringify(log).includes('Inventedperson') && !JSON.stringify(a.audit.entries()).includes('Inventedperson'), 'the person reached the log');
    } finally { a.close(); }
  });

  test('funnel leads are counted, never deleted, by this job', async () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'enquiry-retention.ts'), 'utf8');
    assert.ok(!/DELETE FROM leads/i.test(src), 'the enquiry clean-up deletes a lead');
    assert.match(src, /FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'/);
  });
});

describe('line 19 — the testing waiver names Lakhbir’s role rightly', () => {
  test('Lakhbir is Head of Business Development, never "the director"; the director is Jalil Ahmed', () => {
    const waiver = IDENTITY_CHECK.waiver_record ?? '';
    assert.match(waiver, /Lakhbir Dhillon said it[\s\S]*He is Head of Business Development\./);
    assert.doesNotMatch(waiver, /director/i);
    const lookups = readFileSync(join(import.meta.dirname, '..', 'src', 'connectors', 'test-lookups.ts'), 'utf8');
    assert.doesNotMatch(lookups, /as the director/);
    assert.match(lookups, /Head of Business Development \(the director is Jalil Ahmed/);
  });
});
