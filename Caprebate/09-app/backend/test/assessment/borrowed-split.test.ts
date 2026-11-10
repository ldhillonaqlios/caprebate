/**
 * THE ASSESSMENT'S BORROWED STATEMENTS, SPLIT (Phase 161l2). Three statements in src/modules/assessment/data-borrowed.ts
 * joined other areas' tables: the claims at the invoice stage with no live fee invoice (claims, the client record's
 * businesses, finance's invoices and credit notes), the invoiced total in a window by tax point (finance's invoices and
 * the claims' deliverables), and a surveyor's job with its organisation's sector (the survey's jobs and the client
 * record's businesses). Each is now the owner's own read plus a read through the other owner's front door, combined
 * in code, in the file that calls it.
 *
 * So each case below keeps the OLD statement, word for word, and runs it beside the function the caller now calls, on
 * the seeded database with rows added that the seed does not make: a claim whose organisation is not there, a
 * second organisation, a fee invoice fully credited, one cancelled, two live on one claim, an invoice with no
 * date, a client report issued before the invoice and one after, a report with no date, a fee with no amount, and
 * dates on the window's edges. The two must give exactly the same rows, in the same order, with the same keys in the
 * same order. The case was green against the old function before the split, and is green against the new one after.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, fakeHasher, fixedClock } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import type { Db, Param, Row } from '../../src/core/index.ts';
import * as B from '../../src/modules/assessment/data-borrowed.ts';
import * as VAT from '../../src/modules/finance/vat.ts';

type Call = (db: Db, params: readonly Param[]) => unknown;

/** The function the caller now calls by this name. */
function from(name: string): Call {
  for (const space of [VAT, B] as object[]) {
    const f = (space as Record<string, unknown>)[name];
    if (typeof f === 'function') return f as Call;
  }
  throw new Error(`${name} is not found`);
}

type Info = { name: string; type: string; notnull: number };

/** One statement per table the cases fill, every column named, so a case gives only the columns it cares about. */
const INSERTS: Record<string, string> = {
  businesses: 'INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, legal_name, company_number, claimant_type, registered_address, trading_address, website, client_status, source, owner_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claims: 'INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, owner_id, surveyor_id, priority, next_action, next_action_due, hold_reason, lost_reason, expected_completion, created_at, updated_at, hold_return_stage, completed_at, tax_adviser_signoff_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoices: 'INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, fee_warning, raised_by, cancelled_at, cancelled_by, cancel_reason, created_at, entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoice_credit_notes: 'INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, corrected_claim_value_pence, issued_on, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claim_deliverables: 'INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, content_hash, logical_document_id, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  surveyor_jobs: 'INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
};

let filler = 0;
/** Puts a row in: the columns given, and a made-up value for every other column the schema requires. */
function put(db: Db, table: string, values: Record<string, Param>): void {
  const sql = INSERTS[table];
  assert.ok(sql !== undefined, `an insert for ${table}`);
  const info = new Map(db.all<Info>('SELECT name, type, "notnull" FROM pragma_table_info(?)', [table]).map((c) => [c.name, c]));
  const names = /\(([^)]*)\) VALUES/.exec(sql)![1]!.split(', ');
  assert.deepEqual([...info.keys()].sort(), [...names].sort(), `${table}: the statement names every column`);
  for (const k of Object.keys(values)) assert.ok(info.has(k), `${table}.${k} exists`);
  db.run(sql, names.map((n) => {
    const c = info.get(n)!;
    if (Object.hasOwn(values, n)) return values[n]!;
    if (c.notnull !== 1) return null;
    filler++;
    return /INT|REAL|NUM/i.test(c.type) ? filler : `${n}-${filler}`;
  }));
}

let world: Promise<Db> | null = null;
function theWorld(): Promise<Db> {
  world ??= (async () => {
    const app = await testApp();
    await seed(app.db, fakeHasher(), fixedClock());
    const db = app.db;
    // The cases need rows the workflow's own guards would refuse to make out of order; the reads are what is tested.
    db.execDdl('PRAGMA foreign_keys = OFF');
    db.execDdl('PRAGMA ignore_check_constraints = ON');
    for (const g of db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger'")) db.execDdl(`DROP TRIGGER "${g.name}"`);
    const biz = db.get<{ business_id: string }>('SELECT business_id FROM claims ORDER BY claim_ref LIMIT 1')!.business_id;
    put(db, 'businesses', { id: 'bz-nosector', name: 'Second sector Ltd', sector: 'supported_living', stage: 'CLIENT', created_at: '2026-01-01' });

    // Claims at the invoice stage: plain; its organisation not there; a second organisation; a live fee
    // invoice; a fee invoice fully credited; a cancelled fee invoice; two live fee invoices; a live invoice that is not
    // a fee; a fee partly credited; a claim at another stage.
    const claim = (id: string, ref: string, business: string, stage = 'INVOICE'): void =>
      put(db, 'claims', { id, claim_ref: ref, business_id: business, stage, created_at: '2026-01-01' });
    claim('cl-plain', 'ZZ-0005', biz);
    claim('cl-ghost', 'ZZ-0001', 'bz-names-nobody');
    claim('cl-nosector', 'ZZ-0003', 'bz-nosector');
    claim('cl-live', 'ZZ-0002', biz);
    claim('cl-credited', 'ZZ-0004', biz);
    claim('cl-cancelled', 'ZZ-0007', biz);
    claim('cl-twice', 'ZZ-0006', biz);
    claim('cl-notfee', 'ZZ-0008', biz);
    claim('cl-part', 'ZZ-0009', biz);
    claim('cl-other-stage', 'ZZ-0010', biz, 'REPORTS');
    const invoice = (id: string, claim_id: string | null, kind: string, status: string, fee: number | null, date: string | null): void =>
      put(db, 'invoices', { id, business_id: biz, claim_id, kind, invoice_status: status, fee_pence: fee, invoice_date: date, created_at: '2026-01-01' });
    invoice('iv-live', 'cl-live', 'FEE', 'RAISED', 10_000_00, '2026-06-10');
    invoice('iv-credited', 'cl-credited', 'FEE', 'SENT', 5_000_00, '2026-06-11');
    put(db, 'invoice_credit_notes', { id: 'cn-1', invoice_id: 'iv-credited', amount_pence: 3_000_00, issued_on: '2026-06-12' });
    put(db, 'invoice_credit_notes', { id: 'cn-2', invoice_id: 'iv-credited', amount_pence: 2_000_00, issued_on: '2026-06-13' });
    invoice('iv-cancelled', 'cl-cancelled', 'FEE', 'CANCELLED', 7_000_00, '2026-06-14');
    invoice('iv-twice-1', 'cl-twice', 'FEE', 'RAISED', 1_000_00, '2026-07-01');
    invoice('iv-twice-2', 'cl-twice', 'FEE', 'SENT', 2_000_00, '2026-07-02');
    invoice('iv-notfee', 'cl-notfee', 'DISPOSAL', 'RAISED', 4_000_00, '2026-07-03');
    invoice('iv-part', 'cl-part', 'FEE', 'SENT', 9_000_00, '2026-05-31');
    put(db, 'invoice_credit_notes', { id: 'cn-3', invoice_id: 'iv-part', amount_pence: 1_000_00, issued_on: '2026-06-01' });

    // The invoiced total by tax point: an invoice with no date; no claim; a fee with no amount; a draft; reports
    // issued before and after the invoice, one with no date, one that is not the client report, on a fee and on a
    // non-fee invoice; dates on the window's edges.
    invoice('iv-undated', 'cl-plain', 'FEE', 'RAISED', 3_00, null);
    invoice('iv-noclaim', null, 'FEE', 'RAISED', 11_00, '2026-06-15');
    invoice('iv-nofee', 'cl-plain', 'FEE', 'SENT', null, '2026-06-16');
    invoice('iv-draft', 'cl-plain', 'FEE', 'DRAFT', 13_00, '2026-06-17');
    let version = 100;
    const report = (id: string, claim_id: string, kind: string, issued: string | null): void =>
      put(db, 'claim_deliverables', { id, claim_id, kind, version: ++version, state: issued === null ? 'DRAFT' : 'ISSUED', issued_on: issued, created_at: '2026-01-01', updated_at: '2026-01-01' });
    report('dl-early', 'cl-live', 'CLIENT_REPORT', '2026-04-30');
    report('dl-early-2', 'cl-live', 'CLIENT_REPORT', '2026-05-15');
    report('dl-late', 'cl-twice', 'CLIENT_REPORT', '2026-09-01');
    report('dl-undated', 'cl-credited', 'CLIENT_REPORT', null);
    report('dl-other-kind', 'cl-part', 'ACCOUNTANT_PACK', '2026-01-02');
    report('dl-notfee', 'cl-notfee', 'CLIENT_REPORT', '2026-03-01');

    // Surveyor jobs: a second organisation; one not there; one with no claim.
    const job = (id: string, business: string, claim_id: string | null): void =>
      put(db, 'surveyor_jobs', { id, business_id: business, claim_id, state: 'OPEN', created_at: '2026-01-01' });
    job('sj-nosector', 'bz-nosector', 'cl-nosector');
    job('sj-ghost', 'bz-names-nobody', 'cl-ghost');
    job('sj-noclaim', biz, null);
    return db;
  })();
  return world;
}

type Case = { name: string; get?: true; old: string; params: (db: Db) => (readonly Param[])[]; atLeast: number };

const CASES: Case[] = [
  {
    name: 'listClaimsIdClaimRefByStageClaimId',
    old: 'SELECT c.id, c.claim_ref, c.business_id, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id ' +
      "WHERE c.stage = 'INVOICE' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.claim_id = c.id AND i.kind = 'FEE' " +
      "AND i.invoice_status IN ('RAISED','SENT') AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)) " +
      'ORDER BY c.claim_ref ASC',
    params: () => [[]], atLeast: 5,
  },
  {
    name: 'getInvoicesNByClaimIdInvoiceStatus', get: true,
    old: "SELECT SUM(i.fee_pence) AS n FROM invoices i WHERE i.claim_id IS NOT NULL AND i.invoice_status IN ('RAISED','SENT') " +
      "AND MIN(i.invoice_date, CASE WHEN i.kind = 'FEE' THEN COALESCE((SELECT MIN(d.issued_on) FROM claim_deliverables d " +
      "WHERE d.claim_id = i.claim_id AND d.kind = 'CLIENT_REPORT' AND d.issued_on IS NOT NULL), i.invoice_date) ELSE i.invoice_date END) " +
      'BETWEEN ? AND ?',
    params: () => [
      ['2025-11-01', '2026-11-10'], ['2026-05-01', '2026-06-30'], ['2026-04-30', '2026-04-30'], ['2026-06-10', '2026-07-02'],
      ['2026-07-01', '2026-07-01'], ['2026-07-02', '2026-07-03'], ['2026-03-01', '2026-03-31'], ['2030-01-01', '2030-12-31'],
      ['2026-06-01', '2026-05-01'],
    ],
    atLeast: 6,
  },
  {
    name: 'getSurveyorJobsBusinessIdClaimIdById', get: true,
    old: 'SELECT j.business_id, j.claim_id, b.sector FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id WHERE j.id = ?',
    params: (db) => [...db.all<{ id: string }>('SELECT id FROM surveyor_jobs ORDER BY id').map((r) => [r.id]), ['sj-names-nobody']],
    atLeast: 3,
  },
];

for (const c of CASES) {
  test(`161l2: ${c.name} gives the rows the old statement gave`, async () => {
    const db = await theWorld();
    const call = from(c.name);
    let seen = 0;
    for (const p of c.params(db)) {
      const want = c.get === true ? db.get(c.old, p) : db.all(c.old, p);
      const got = call(db, p);
      assert.equal(JSON.stringify(got), JSON.stringify(want), `${c.name}(${JSON.stringify(p)})`);
      if (c.get === true) { if (want !== undefined && Object.values(want as Row).some((v) => v !== 0 && v !== null)) seen++; }
      else seen += (want as Row[]).length;
    }
    assert.ok(seen >= c.atLeast, `${c.name}: the case meets ${seen} rows, at least ${c.atLeast} wanted`);
  });
}
