/**
 * PHASE 151b, 25 September 2026 — THE TAX RETURN AND THE TAX COMPUTATION AS UPLOADS, THE MUST-ARRIVE DOCUMENTS SWITCHED
 * ON, AND THE LATER OF TWO KEEP-UNTIL DATES.
 *
 *   1 · migration 049 binds both tax types to receipt policies of their own name, and what hangs off document_types is
 *       read back by name, as the migration's header promises
 *   2 · each of the four must-arrive documents can be received — a claim is never held by a type nobody can upload
 *   3 · the must-arrive switch is ON: the gate out of data gathering waits for all four, N4 on the bought-the-building
 *       fact, and a real tax return is stripped of the people on it on the way in
 *   4 · the tax computation's recommendation reads as bound, and the other thirteen do not move
 *   5 · Word answer 173: where two retention periods apply, the LATER keep-until date governs
 *
 * Word question 223, answered by the data protection officer and relayed by Lakhbir on 24 September 2026: "yes, clients
 * may upload tax returns and tax computations. Still open: what must be removed from them. Until the officer says
 * otherwise we will treat them like the other financial documents: keep the figures and the company details, and remove
 * individuals' names, addresses and tax references." Every name, number and reference in the fixtures is INVENTED.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import type { AuditLog } from '../src/audit.ts';
import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';
import * as D from '../src/web/documents.ts';
import * as P from '../src/web/pipeline.ts';
import * as F from '../src/web/claim-facts.ts';
import * as MD from '../src/web/mandatory-documents.ts';
import * as RR from '../src/web/receipt-recommendations.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { acceptClientBytes, finishUpload, issuedJob } from '../src/web/uploads.ts';
import {
  retainedTextKeyFor, deletionDueAt, FAIL_CLOSED_SETTINGS, receiptPolicyFor, DOC_SPECS,
  type IngestionSettings, type RawFileRecord,
} from '../src/web/upload-handler-port.ts';
import { pdfOf } from './document-fixtures.ts';
import { fixedClock } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

type Made = Awaited<ReturnType<typeof createApp>>;

async function boot(): Promise<{ made: Made; close(): void }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151b-')), now: fixedClock() });
  await seed(made.app.db, made.app.hasher, made.app.now);
  return { made, close: () => made.close() };
}

function who(db: Db, role: 'ADMIN' | 'SALES'): Actor {
  const u = db.get<{ id: string }>('SELECT id FROM users WHERE role = ? LIMIT 1', [role]);
  assert.ok(u, `no ${role} user`);
  return { id: u.id, role, business_id: null, disabled: false };
}

function deps(made: Made): { db: Db; audit: AuditLog; now: () => string; newId: () => string } {
  return { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
}

/** An upload through the one handler — steps 1 to 7 — linked to a claim. Returns the handler's doc_id. */
async function uploadOnClaim(made: Made, as: Actor, business: string, claim: string, type_code: string, bytes: Uint8Array): Promise<string> {
  const started = await D.startDocumentUpload({ ...deps(made), store: made.store }, as, {
    business_id: business, type_code, logical_document_id: null, request_id: null, claim_id: claim,
  });
  assert.equal(started.ok, true, started.ok ? '' : `${type_code}: ${started.why}`);
  if (!started.ok) return '';
  const up = { db: made.app.db, store: made.store, now: made.app.now, actor: as.id, newId: randomUUID, audit: made.app.audit };
  const token = new URL(`http://x${started.url}`).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(up, { doc_id: started.doc_id, token, bytes });
  const job = issuedJob(made.app.db, started.doc_id);
  assert.ok(w.ok && job !== null, `${type_code}: the bytes were not accepted`);
  if (!w.ok || job === null) return '';
  const done = await finishUpload(up, job, w.written_at);
  assert.equal(done.error, undefined, `${type_code}: the handler refused the upload`);
  return started.doc_id;
}

const PLAIN_PDF = pdfOf([['A document']]);

/** A company's corporation tax return, CT600-shaped, with a director and an agent on it. */
const CT600 = pdfOf([
  ['COMPANY INFORMATION', 'Company name Corvale Invented Holdings Limited', 'Company registration number 09876543',
    'Company tax reference 1234567890', 'RETURN PERIOD', 'From 1 April 2025 to 31 March 2026'],
  ['PROFITS BEFORE OTHER DEDUCTIONS AND RELIEFS', 'Trading profits 412,300',
    'CAPITAL ALLOWANCES AND BALANCING CHARGES', 'Annual investment allowance 180,000'],
  ['DECLARATION', 'I declare that the information I have given on this return is correct.',
    'Name Jane Inventedperson, Director', 'AGENT DETAILS', 'Peter Madeupname, 7 Fictional Street'],
]);

/** An accountant's computation: the preparer and a reviewer on it. */
const COMPUTATION = pdfOf([
  ['TAX COMPUTATION FOR THE YEAR ENDED 31 MARCH 2026', 'Adjusted trading profit 412,300',
    'PREPARED BY INVENTED ACCOUNTANTS LLP', 'Reviewed by Priya Madeupname ACA'],
  ['MAIN POOL', 'Carried forward 114,080', 'SPECIAL RATE POOL', 'Carried forward 28,200'],
]);

const TAX_TYPES = ['TAX_RETURN', 'TAX_COMPUTATION'] as const;

/* ================================================================== *
 * 1 · MIGRATION 049
 * ================================================================== */

describe('1 · migration 049 binds the tax return and the tax computation, and rebuilds nothing else', () => {
  test('each type is received under the receipt policy of its own name, carries RET-7, and keeps its source', () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS_DIR);
    for (const code of TAX_TYPES) {
      const t = db.get<{ handler_type: string | null; retention_ref: string | null; active: number; readers: string; carries_value: number }>(
        'SELECT handler_type, retention_ref, active, readers, carries_value FROM document_types WHERE code = ?', [code]);
      assert.ok(t, `${code} is not a type`);
      assert.equal(t.handler_type, code);
      assert.equal(t.retention_ref, 'RET-7');
      assert.equal(t.active, 1);
      assert.equal(t.readers, 'CLAIM_TEAM', `${code}: a surveyor must still never read it`);
      assert.equal(t.carries_value, 1);
      assert.equal(receiptPolicyFor(code).doc_type, code, `${code}: the upload handler has no receipt policy of that name`);
      assert.ok(DOC_SPECS.some((s) => s.doc_type === code), `${code}: the handler has no spec for it`);
    }
    assert.equal(db.get<{ source: string }>("SELECT source FROM document_types WHERE code = 'TAX_RETURN'")?.source, 'ADMIN',
      'the tax return keeps the source migration 045 gave it');
  });

  test('what hangs off the table is all there, by name: the index, three triggers on it, four on other tables — and no foreign key is broken', () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS_DIR);
    const names = (type: string) => db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = ? AND (tbl_name = 'document_types' OR sql LIKE '%document_types%') ORDER BY name", [type])
      .map((r) => r.name);
    assert.deepEqual(names('index').filter((n) => !n.startsWith('sqlite_autoindex')), ['document_types_handler_uq']);
    assert.deepEqual(names('trigger'), [
      'automation_rules_request_receivable_insert', 'automation_rules_request_receivable_update',
      'client_tasks_request_receivable_insert', 'document_types_fixed', 'document_types_never_deleted',
      'document_types_value_never_unset', 'receipt_strip_recommendations_unbound_only',
    ]);
    assert.deepEqual(names('view'), []);
    assert.equal(db.get("SELECT name FROM sqlite_master WHERE name = 'document_types_new'"), undefined);
    assert.deepEqual(db.all('SELECT * FROM pragma_foreign_key_check'), []);
    // The triggers still hold after the rebuild.
    assert.throws(() => db.run("UPDATE document_types SET handler_type = NULL WHERE code = 'TAX_RETURN'"), /receipt policy are fixed/);
    assert.throws(() => db.run("DELETE FROM document_types WHERE code = 'TAX_COMPUTATION'"), /never deleted/);
    assert.throws(() => db.run("UPDATE document_types SET carries_value = 0 WHERE code = 'TAX_COMPUTATION'"), /never marked as not carrying one/);
  });

  test('the settings-screen rule is intact: a type an administrator adds still carries no receipt policy — only the tax return is excused, by name', async () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS_DIR);
    const sql = db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_types'")?.sql ?? '';
    assert.match(sql, /CHECK \(source <> 'ADMIN' OR handler_type IS NULL OR code = 'TAX_RETURN'\)/);
    const w = await boot();
    try {
      const made = D.createType({ ...deps(w.made) }, who(w.made.app.db, 'ADMIN'), { code: 'DILAPIDATIONS', label: 'Dilapidations schedule', readers: 'CLAIM_TEAM' });
      assert.equal(made.ok, true);
      assert.equal(w.made.app.db.get<{ h: string | null }>("SELECT handler_type AS h FROM document_types WHERE code = 'DILAPIDATIONS'")?.h, null);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 2 · EACH OF THE FOUR MUST-ARRIVE DOCUMENTS CAN BE RECEIVED
 * ================================================================== */

describe('2 · a claim is never held at the gate by a document nobody can upload', () => {
  test('every type the switch requires has an active receipt policy, reads as receivable, can be asked for, and goes through the one handler', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const admin = who(db, 'ADMIN');
      const c = db.get<{ id: string; business_id: string }>(
        "SELECT c.id, c.business_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(c);
      const receivable = D.receivableTypes(db).map((t) => t.code);
      assert.equal(MD.MANDATORY_DOCUMENTS.requires.length, 4);
      for (const req of MD.MANDATORY_DOCUMENTS.requires) {
        const t = db.get<{ handler_type: string | null; active: number }>('SELECT handler_type, active FROM document_types WHERE code = ?', [req.type_code]);
        assert.ok(t && t.handler_type !== null && t.active === 1, `${req.type_code} is required and nobody can upload one`);
        assert.equal(D.stripReading(t.handler_type).receivable, true);
        assert.ok(receivable.includes(req.type_code), `${req.type_code} is not offered for upload`);
        const asked = D.createDocumentRequest({ ...deps(w.made) }, admin,
          { business_id: c.business_id, claim_id: c.id, type_code: req.type_code, why: 'the gate', holds_up: 'data gathering', due_on: null });
        assert.equal(asked.ok, true, `${req.type_code} cannot be asked for`);
        const doc = await uploadOnClaim(w.made, admin, c.business_id, c.id, req.type_code, PLAIN_PDF);
        const row = db.get<{ strip_recorded_at: string | null; quarantine_discharged_at: string | null; failure_code: string | null }>(
          'SELECT strip_recorded_at, quarantine_discharged_at, failure_code FROM documents WHERE id = ?', [doc]);
        assert.ok(row?.strip_recorded_at, `${req.type_code}: no strip recorded`);
        assert.ok(row?.quarantine_discharged_at, `${req.type_code}: the file was not deleted`);
        assert.equal(row?.failure_code, null);
      }
      for (const code of TAX_TYPES) {
        const reading = D.stripReading(code);
        assert.match(reading.label, new RegExp(`“${code.replace('_', ' ').toLowerCase()}” rules`));
      }
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 3 · THE MUST-ARRIVE SWITCH, ON
 * ================================================================== */

describe('3 · the must-arrive documents are switched on — Lakhbir’s four, and N4 on the bought-the-building fact', () => {
  test('it ships ON, the case stamp reads it on, and it waits on nothing', () => {
    assert.equal(MD.MANDATORY_DOCUMENTS.enabled, true);
    assert.deepEqual(backendSwitchReadings().find((s) => s.switch === 'MANDATORY_DOCUMENTS'),
      { switch: 'MANDATORY_DOCUMENTS', on: true, home: 'src/web/mandatory-documents.ts' });
    assert.match(MD.MANDATORY_DOCUMENTS_ALSO_WAITS_ON, /^nothing now/);
    assert.deepEqual(MD.MANDATORY_DOCUMENTS.requires.map((r) => `${r.type_code}:${r.condition}`),
      ['SALE_CONTRACT:BOUGHT', 'CPSE_REPLIES:BOUGHT', 'TAX_RETURN:ALWAYS', 'TAX_COMPUTATION:ALWAYS']);
  });

  test('THE SKIP TEST, AS SHIPPED: the gate stays shut until all four arrive; not known and never recorded read alike; then the claim moves', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = who(db, 'SALES');
      const admin = who(db, 'ADMIN');
      const d = deps(w.made);
      const c = db.get<{ id: string; business_id: string }>(
        "SELECT c.id, c.business_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(c);
      // Everything else the gate reads, settled — so what shuts it below is the documents and nothing else.
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'ELECTION_EXISTS', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_DOC', note: null }).ok, true);
      CF.floorAreaForClaim(w.made.app, c.id); // PHASE 158d (F44): a floor area on record first
      assert.equal(P.recordMilestone(d, sales, c.id, 'DATA_GATHERING_COMPLETE', null).ok, true);
      const pc = () => P.loadPipelineClaim(db, c.id);
      const off = P.gateOut(db, pc(), 'DATA_GATHERING', { mandatoryDocuments: { ...MD.MANDATORY_DOCUMENTS, enabled: false } });
      assert.equal(off.open, true, 'off, the same records open the gate — so the documents are what shut it');
      const need = (label: RegExp) => {
        const n = P.gateOut(db, pc(), 'DATA_GATHERING').needs.find((x) => label.test(x.what));
        assert.ok(n, String(label));
        return n;
      };
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING').open, false);
      assert.equal(need(/^Tax return/).met, false);
      assert.equal(need(/^Tax computation/).met, false);

      // N4 — ASSERT BOTH: never recorded, then recorded as not known. The same need, and neither excuses anything.
      const neverRecorded = need(/^Sale or purchase contract/);
      assert.equal(neverRecorded.met, false);
      assert.match(neverRecorded.why, /not known/);
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'UNKNOWN', value: null, source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      assert.deepEqual(need(/^Sale or purchase contract/), neverRecorded);
      assert.deepEqual(need(/^Pre-contract enquiry replies/).met, false);

      // Bought: all four are needed. Each arrives through the one handler, and the gate opens.
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'VALUE', value: 'YES', source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      const move = () => P.moveClaim(d, sales, c.id, { kind: 'FORWARD', to: 'SURVEY', next_action: { title: 'Book the survey', owner_id: sales.id, due_on: '2026-12-31' } });
      const refused = move();
      assert.equal(refused.ok, false);
      assert.match(refused.ok ? '' : refused.why, /Tax return is received/);
      await uploadOnClaim(w.made, admin, c.business_id, c.id, 'SALE_CONTRACT', PLAIN_PDF);
      await uploadOnClaim(w.made, admin, c.business_id, c.id, 'CPSE_REPLIES', PLAIN_PDF);
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING').open, false, 'two of the four opened the gate');
      const ret = await uploadOnClaim(w.made, admin, c.business_id, c.id, 'TAX_RETURN', CT600);
      const comp = await uploadOnClaim(w.made, admin, c.business_id, c.id, 'TAX_COMPUTATION', COMPUTATION);
      for (const label of [/^Sale or purchase contract/, /^Pre-contract enquiry replies/, /^Tax return/, /^Tax computation/]) {
        assert.equal(need(label).met, true, String(label));
      }
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING').open, true);
      const moved = move();
      assert.equal(moved.ok, true, moved.ok ? '' : moved.why);

      // What was kept of the two tax documents: the figures and the company, and nobody.
      const kept = async (doc: string) => Buffer.from(await w.made.store.get(retainedTextKeyFor(doc))).toString('utf8');
      const r = await kept(ret);
      assert.match(r, /Corvale Invented Holdings Limited/);
      assert.match(r, /Company tax reference 1234567890/);
      assert.match(r, /180,000/);
      assert.doesNotMatch(r, /Inventedperson|Madeupname|Fictional Street|I declare/);
      const k = await kept(comp);
      assert.match(k, /114,080/);
      assert.doesNotMatch(k, /Madeupname|Invented Accountants/);
    } finally { w.close(); }
  });

  test('recorded NO: a client who built or refitted is excused the sale contract and the CPSE replies — never the tax documents', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = who(db, 'SALES');
      const c = db.get<{ id: string }>(
        "SELECT c.id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(c);
      assert.equal(F.recordFact(deps(w.made), sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      const needs = MD.mandatoryDocumentNeeds(db, P.loadPipelineClaim(db, c.id));
      assert.deepEqual(needs.map((n) => n.met), [true, true, false, false]);
      assert.match(needs[0]?.why ?? '', /did not buy the building/);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 4 · THE RECOMMENDATION FOR THE TAX COMPUTATION READS AS BOUND
 * ================================================================== */

describe('4 · the tax computation’s recommendation is kept as the record, and reads as bound', () => {
  test('bound, approved or not; its row is unchanged and still matches migration 021; the other thirteen read exactly as before', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const sales = who(db, 'SALES');
      const approved: RR.ReceiptRecommendations = { ...RR.RECEIPT_RECOMMENDATIONS, approved: true };
      for (const rec of [RR.RECEIPT_RECOMMENDATIONS, approved]) {
        const r = RR.recommendationReading(db, sales, 'TAX_COMPUTATION', rec);
        assert.equal(r.state, 'BOUND');
        assert.equal(r.strip_now.receivable, true);
        assert.ok(!r.label.includes(D.NO_RECEIPT_POLICY), 'a bound type still says it cannot be received');
        assert.match(r.label, /^Switched on\./);
        assert.equal(r.recommended?.strip, 'STRIP_INDIVIDUALS_KEEP_FIGURES');
        for (const code of ['VALUATION', 'ENGAGEMENT_LETTER', 'OTHER']) { // Phase 157d: ACCOUNTS is bound now (migration 099)
          const other = RR.recommendationReading(db, sales, code, rec);
          assert.equal(other.state, rec.approved ? 'APPROVED_NOT_BOUND' : 'RECOMMENDED_NOT_APPROVED');
          assert.ok(other.label.includes(D.NO_RECEIPT_POLICY));
        }
      }
      const row = db.get<{ strip: string; modelled_on: string | null; reason: string }>(
        "SELECT strip, modelled_on, reason FROM receipt_strip_recommendations WHERE type_code = 'TAX_COMPUTATION'");
      const mod = RR.RECEIPT_RECOMMENDATIONS.types.find((t) => t.type_code === 'TAX_COMPUTATION');
      assert.deepEqual({ ...row }, { strip: mod?.strip, modelled_on: mod?.modelled_on, reason: mod?.reason });
      const unbound = db.all<{ code: string }>("SELECT code FROM document_types WHERE handler_type IS NULL AND source = 'CRM_SPECIFICATION'").map((x) => x.code);
      assert.equal(unbound.length, 9); // thirteen until Phase 157d bound four more
      assert.equal(unbound.includes('TAX_COMPUTATION'), false);
    } finally { w.close(); }
  });
});

/* ================================================================== *
 * 5 · WORD ANSWER 173 — THE LATER OF TWO KEEP-UNTIL DATES
 * ================================================================== */

describe('5 · Word answer 173: where two retention periods apply, the file is kept until both have ended', () => {
  test('the dates a claim feeds the clock — 31 March 2027 and 15 September 2027 — with a defence pack either side of RET-7', () => {
    const rec: RawFileRecord = {
      doc_id: 'doc-173', doc_type: 'TAX_RETURN', received_at: '2026-09-01T09:00:00.000Z',
      claim_period_end: '2027-03-31T00:00:00.000Z', report_delivered_at: '2027-09-15T00:00:00.000Z',
    };
    const approved: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true };
    assert.equal(deletionDueAt(rec, approved), '2033-09-15T00:00:00.000Z', 'six years from the later of the two dates');
    assert.equal(deletionDueAt({ ...rec, defence_period_ends_at: '2030-01-31T00:00:00.000Z' }, approved), '2033-09-15T00:00:00.000Z',
      'a defence pack that ends sooner does not cut the file short');
    assert.equal(deletionDueAt({ ...rec, defence_period_ends_at: '2040-01-31T00:00:00.000Z' }, approved), '2040-01-31T00:00:00.000Z',
      'a defence pack that ends later keeps the file until it ends');
    // N4: an unapproved RET-7 is not known, so it cannot lengthen anything, and neither known gives no date.
    const unapproved: IngestionSettings = { ...approved, ret7_approved: false };
    assert.equal(deletionDueAt({ ...rec, defence_period_ends_at: '2030-01-31T00:00:00.000Z' }, unapproved), '2030-01-31T00:00:00.000Z');
    assert.equal(deletionDueAt(rec, unapproved), null);
  });
});
