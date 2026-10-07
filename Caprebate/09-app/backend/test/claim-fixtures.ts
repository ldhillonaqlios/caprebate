/**
 * CRM 6 of 10 — FIXTURES FOR THE GATES THE CLAIM'S FACTS NOW DECIDE.
 *
 * A suite that walks a claim through the procedure needs the facts those gates
 * read: the election resolved, every grant traced, the amendment window open, the
 * tax adviser's sign-off record, and the deliverables issued. Each fixture here
 * writes the REAL record through the real store where the store can take it, so a
 * walk exercises the same code a person's click does. Two are written as rows —
 * a surveyor's commitment and the sign-off record for a claim a test places
 * straight at a later stage — exactly as `claimAt` places the claim itself, and
 * both still pass the database's own triggers.
 *
 * NONE OF THESE IS A STAND-IN FOR A RECORD: the database refuses the retired
 * sign-off column, and test/claim-record.test.ts proves each gate stays shut
 * without the record these write.
 */

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { Db } from '../src/db.ts';
import type { AuditLog } from '../src/audit.ts';
import * as F from '../src/web/claim-facts.ts';
import * as R from '../src/web/claim-record.ts';
import { allocateNumber } from '../src/web/invoices.ts';
import { actor } from './helpers.ts';

export type FixtureApp = { db: Db; audit: AuditLog; now: () => string };

export function recordDeps(app: FixtureApp): R.RecordDeps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

/** Record one fact through the store, as SALES, and assert it was taken. */
export function fact(app: FixtureApp, claim: string, fact_key: string, value: string | null, source_id = 'CLIENT_DOC'): void {
  const r = F.recordFact(recordDeps(app), actor('SALES'), claim, {
    fact_key, answer: value === null ? 'UNKNOWN' : 'VALUE', value, source_id, note: null,
  });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

/** DATA_GATHERING's fact: no election affects the property. */
export function noElection(app: FixtureApp, claim: string): void {
  fact(app, claim, 'ELECTION_EXISTS', 'NO');
}

/** VALUATION's fact: no grant or contribution met the spend. */
export function noGrants(app: FixtureApp, claim: string): void {
  fact(app, claim, 'GRANTS_EXIST', 'NO');
}

/**
 * THE AMENDMENT WINDOW, OPEN ON THE TEST CLOCK (8 September 2026): a company,
 * a property bought on 1 June 2025, in the accounting period 1 January to
 * 31 December 2025 — the engine's company rule closes it on 31 December 2027.
 */
export function openWindow(app: FixtureApp, business: string, property: string, claim: string): void {
  app.db.run("UPDATE businesses SET claimant_type = 'COMPANY' WHERE id = ?", [business]);
  app.db.run("UPDATE properties SET acquisition_date = '2025-06-01' WHERE id = ?", [property]);
  fact(app, claim, 'ACCOUNTING_PERIOD_START', '2025-01-01');
  fact(app, claim, 'ACCOUNTING_PERIOD_END', '2025-12-31');
}

/**
 * AN ASSESSMENT FOR AN ORGANISATION A TEST MADE WITHOUT ONE — a survey job carries
 * an assessment by NOT NULL, so a commitment, and so a sign-off, needs one.
 */
export function assessmentFor(app: FixtureApp, business: string): string {
  const id = randomUUID();
  const at = app.now();
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [id, business, 'dental', at, 100_00, 200_00, at]);
  return id;
}

/** A surveyor's commitment on a survey job on THIS claim, written as its row. Returns the commitment's id. */
export function commitmentOn(app: FixtureApp, business: string, assessment: string, claim: string, surveyor = 'u-SURVEYING'): string {
  const job = randomUUID();
  const at = app.now();
  app.db.run(
    'INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
    [job, business, assessment, surveyor, 'COMMITTED_AND_RELEASED', at, at, claim]);
  const id = randomUUID();
  app.db.run(
    'INSERT INTO surveyor_commitments (id,job_id,surveyor_id,a_qualifying_plant_pence,b_building_pence,c_bare_land_pence,' +
      'qualifying_pct,method_note,committed_at,figures_hash,released_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [id, job, surveyor, 250_000_00, 700_000_00, 50_000_00, 0.25, 'a fixture commitment', at, 'f'.repeat(64), at]);
  return id;
}

/**
 * PHASE 158c (F35): THE SURVEYOR'S APPROVAL OF THE SURVEY PACK, on a job on THIS claim (the claim's own job if it has one),
 * written as its rows. The Valuation gate reads it in place of the retired VALUATION_SIGNED tick. Returns the approval's id.
 */
export function packApprovedOn(app: FixtureApp, business: string, assessment: string, claim: string, surveyor = 'u-SURVEYING', figure_pence: number | null = null, approved_at?: string): string {
  const at = approved_at ?? app.now();
  let job = app.db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY created_at ASC LIMIT 1', [claim])?.id;
  if (job === undefined) {
    job = randomUUID();
    app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      [job, business, assessment, surveyor, 'COMMITTED_AND_RELEASED', at, at, claim]);
  }
  let pack = app.db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [job])?.id;
  if (pack === undefined) {
    pack = randomUUID();
    app.db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, NULL, ?, ?)', [pack, job, at, surveyor]);
  }
  const version = (app.db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM survey_pack_approvals WHERE pack_id = ?', [pack])?.v ?? 0) + 1;
  const id = randomUUID();
  // The figure the report states, where a test needs the report released (a sign-off of the same figure, recorded after).
  const snapshot = JSON.stringify({ fixture: true, version, ...(figure_pence === null ? {} : { sums: { qualifying_pence: figure_pence } }) });
  app.db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, pack, version, version, 0, snapshot, createHash('sha256').update(snapshot).digest('hex'), surveyor, at]);
  return id;
}

/**
 * THE SIGN-OFF RECORD FOR A CLAIM A TEST PLACES STRAIGHT AT A LATER STAGE —
 * written as its row, against a commitment on a job on the claim, hashed. A claim
 * walked to TAX_ADVISER_SIGNOFF records it through `R.recordSignOff` instead.
 */
export function signOffRow(app: FixtureApp, business: string, assessment: string, claim: string, figure_pence = 240_000_00): string {
  const existing = app.db.get<{ id: string }>(
    'SELECT sc.id FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id WHERE j.claim_id = ? LIMIT 1', [claim]);
  const commitment = existing?.id ?? commitmentOn(app, business, assessment, claim);
  const id = randomUUID();
  const at = app.now();
  app.db.run(
    'INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, ' +
      "figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at) VALUES (?, ?, 'CAPREBATE_CTA', 'Chartered Tax Adviser', " +
      "'2026-09-01', 'the fixture claim', 'a fixture method', '[]', ?, ?, 'RECORD_NOT_A_SIGNATURE', ?, 'u-SALES', ?)",
    [id, claim, figure_pence, commitment, createHash('sha256').update(id).digest('hex'), at]);
  return id;
}

/**
 * PHASE 158c (F38): the client report and the accountant's pack are issued from the survey report the surveyor approved,
 * once a sign-off of its figure is on the claim. A test that issues either gets that version here: approved as of the
 * claim's latest sign-off, stating its figure. With no sign-off, nothing is written and the store refuses, as it should.
 */
export function releaseReportFor(app: FixtureApp, claim: string): void {
  if (R.releasedReportFingerprint(app.db, claim) !== null) return;
  const s = app.db.get<{ figure_pence: number; recorded_at: string; recorded_by: string }>(
    'SELECT figure_pence, recorded_at, recorded_by FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at DESC LIMIT 1', [claim]);
  const c = app.db.get<{ business_id: string; assessment_id: string | null }>('SELECT business_id, assessment_id FROM claims WHERE id = ?', [claim]);
  if (s === undefined || c === undefined || c.assessment_id === null) return;
  const who = app.db.get<{ id: string }>("SELECT id FROM users WHERE id = 'u-SURVEYING'")?.id ?? s.recorded_by;
  packApprovedOn(app, c.business_id, c.assessment_id, claim, who, s.figure_pence, s.recorded_at);
}

/**
 * PHASE 158c (F39): THE CLIENT ACCEPTED THE REPORT, in their portal - written as its row, against the released version
 * (made here where need be), by a client login of the business (made too where it has none). The Reports gate reads an
 * acceptance of the issued client report's own fingerprint, so call it after the report is issued.
 */
export function clientAccepted(app: FixtureApp, claim: string): string {
  releaseReportFor(app, claim);
  const r = app.db.get<{ id: string; fingerprint: string; business_id: string }>(
    'SELECT a.id, a.fingerprint, j.business_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'WHERE j.claim_id = ? AND a.fingerprint = ? LIMIT 1', [claim, R.releasedReportFingerprint(app.db, claim) ?? '']);
  assert.ok(r !== undefined, 'no released report to accept: record the sign-off first');
  const at = app.now();
  let who = app.db.get<{ id: string }>("SELECT id FROM users WHERE business_id = ? AND role = 'CLIENT' ORDER BY id LIMIT 1", [r.business_id])?.id;
  if (who === undefined) {
    who = `u-client-${r.business_id}`;
    app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,'A Client','CLIENT','x',?,?,?)",
      [who, `${who}@example.invalid`, `${who}@example.invalid`, at, at, r.business_id]);
  }
  const id = randomUUID();
  app.db.run('INSERT INTO client_report_acceptances (id, claim_id, approval_id, fingerprint, user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, claim, r.id, r.fingerprint, who, at]);
  return id;
}

/** Draft and issue a deliverable through the register, as SALES. */
export function issue(app: FixtureApp, claim: string, kind: R.DeliverableKind, content_hash: string | null = null): string {
  if (R.MADE_FROM_REPORT.has(kind)) releaseReportFor(app, claim);
  const d = recordDeps(app);
  const drafted = R.recordDeliverable(d, actor('SALES'), claim, { kind, action: 'DRAFT' });
  assert.equal(drafted.ok, true, drafted.ok ? '' : drafted.why);
  const issued = R.recordDeliverable(d, actor('SALES'), claim, {
    kind, action: 'ISSUE', issued_on: '2026-09-01', content_hash: content_hash ?? (kind === 'DEFENCE_PACK' ? 'a'.repeat(64) : null),
  });
  assert.equal(issued.ok, true, issued.ok ? '' : issued.why);
  return issued.ok ? issued.id : '';
}

/**
 * PHASE 132e — OUR REPORT DELIVERED FOR FILING, which is when our fee is earned (FEE_TRIGGER in src/web/pipeline.ts):
 * the claim's computation pack issued in the deliverables register, dated. It stands for delivery to the client's
 * accountant; `issue(app, claim, 'CLIENT_REPORT')` stands for delivery to the client, and either reaches the trigger.
 */
export function deliverForFiling(app: FixtureApp, claim: string): string {
  return issue(app, claim, 'ACCOUNTANT_COMPUTATION_PACK');
}

/** The same delivery written as its register row — for a claim the store would refuse to issue on (no signed figure). */
export function deliveredRow(app: FixtureApp, claim: string, issued_on = '2026-09-01'): string {
  const id = randomUUID();
  const at = app.now();
  app.db.run(
    "INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, created_by, created_at, updated_by, updated_at) " +
      "VALUES (?, ?, 'ACCOUNTANT_COMPUTATION_PACK', 1, 'TAX_COMPUTATION', 'DRAFT', NULL, 'u-SALES', ?, 'u-SALES', ?)",
    [id, claim, at, at]);
  app.db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = ?, updated_at = ? WHERE id = ?", [issued_on, at, id]);
  return id;
}

/** Everything REPORTS reads besides its two confirmations: the sign-off, both reports issued, and the window open. */
export function readyForReports(app: FixtureApp, business: string, property: string, assessment: string, claim: string): void {
  if (app.db.get<{ id: string }>('SELECT id FROM tax_adviser_signoffs WHERE claim_id = ?', [claim]) === undefined) {
    signOffRow(app, business, assessment, claim);
  }
  openWindow(app, business, property, claim);
  issue(app, claim, 'CLIENT_REPORT');
  issue(app, claim, 'ACCOUNTANT_COMPUTATION_PACK');
}

/**
 * CRM 7 of 10 — A CLAIM'S FEE INVOICE, WRITTEN AS ITS ROW, with the next number in
 * the series: for a claim a test places straight at a stage, as `claimAt` places
 * the claim. The store that raises one is `raiseInvoice` in src/web/invoices.ts,
 * and test/finance-claim.test.ts tries every refusal it makes; this is the row a
 * gate, a timeline or a dashboard reads. It passes every CHECK and trigger
 * migration 016 puts on a claim's invoice.
 */
export function claimInvoiceRow(
  app: FixtureApp, business: string, claim: string,
  opts: { fee_pence?: number; by?: string; invoice_date?: string; status?: 'RAISED' | 'SENT' } = {},
): string {
  const id = randomUUID();
  const at = app.now();
  const by = opts.by ?? 'u-ACCOUNTING';
  const fee = opts.fee_pence ?? 900_000;
  const date = opts.invoice_date ?? at.slice(0, 10);
  const status = opts.status ?? 'RAISED';
  app.db.run(
    'INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
      'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, raised_by, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    // Phase 132e: 3% of the allowances identified — the claim value is the fee divided by the rate.
    [id, business, claim, 'FEE', Math.round(fee / 0.03), fee, 0.03, status, 'UNPAID', 'not VAT registered', 'finance-setting-vat-position-2026-08-28', 0,
      date, null, 'UNSET — a fixture', status === 'SENT' ? date : null, 'a fixture fee', by, at]);
  allocateNumber(app.db, 'INVOICE', id, null, by, at);
  return id;
}

/**
 * PHASE 151b — THE DOCUMENTS THAT MUST ARRIVE, ARRIVED. MANDATORY_DOCUMENTS is on (src/web/mandatory-documents.ts), so a
 * claim leaves DATA_GATHERING only once the client's tax return and tax computation are received, and the sale
 * contract and CPSE replies too where the client bought the building. A test that is about something else walks its
 * claim past the gate with this: the client did not buy the building (recorded NO, which excuses those two), and a
 * received tax return and tax computation linked to the claim — rows as the one handler leaves them: stripped,
 * discharged, not failed. test/phase151b-documents.test.ts proves the real uploads open the gate; this only stands in.
 */
export function mustArriveDocuments(app: FixtureApp, business: string, claim: string, who = 'u-SALES'): void {
  fact(app, claim, 'BOUGHT_THE_BUILDING', 'NO', 'CLIENT_ANSWER');
  const at = app.now();
  for (const type_code of ['TAX_RETURN', 'TAX_COMPUTATION']) {
    const seq = (app.db.get<{ n: number }>('SELECT COALESCE(MAX(seq), 0) AS n FROM logical_documents WHERE business_id = ? AND type_code = ?', [business, type_code])?.n ?? 0) + 1;
    const logical = `ld-must-${type_code}-${claim}`;
    app.db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [logical, business, type_code, seq, who, at]);
    app.db.run(
      'INSERT INTO documents (id, business_id, uploaded_by, filename, state, strip_recorded_at, quarantine_discharged_at, created_at, logical_document_id, version_no, type_code) ' +
        "VALUES (?, ?, ?, ?, 'STORED', ?, ?, ?, ?, 1, ?)",
      [`d-must-${type_code}-${claim}`, business, who, `${type_code.toLowerCase().replace(/_/g, '-')}-${seq}-version-1`, at, at, at, logical, type_code]);
    app.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)',
      [`dl-must-${type_code}-${claim}`, logical, claim, who, at]);
  }
}
