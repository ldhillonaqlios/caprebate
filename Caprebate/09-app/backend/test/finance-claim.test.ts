/**
 * FINANCE ON THE CLAIM, THE FEE CONTROLS AND VAT MONITORING — CRM 7 of 10,
 * 11 September 2026.
 *
 * Six parts, each a requirement of the phase, and each refusal proved where it is
 * enforced — at the store, at the table, at the rule and over HTTP:
 *
 *   1  an invoice belongs to a claim, and its amount is never typed
 *   2  the fee controls: built, shipped off, and off is exactly today
 *   3  VAT monitoring: dated settings, the two tests, one task, no invoice changed
 *   4  the finance dashboard: ACCOUNTING and ADMIN, and money only
 *   5  the invoice email is not built
 *   6  the claim's own invoice, everywhere the organisation's was read
 *
 * N4 IS ASSERTED BOTH WAYS wherever a fact can be missing: a VAT position nobody
 * recorded, a due date the letter never set, a bank-details confirmation never
 * asked and one recorded as not known.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import type { Db } from '../src/db.ts';
import type { AuditLog } from '../src/audit.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, NotAuthorised } from '../src/authz.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as T from '../src/web/tasks.ts';
import * as I from '../src/web/invoices.ts';
import * as V from '../src/web/vat.ts';
import * as FC from '../src/web/fee-controls.ts';
import * as F from '../src/web/finance.ts';
import * as R from '../src/web/claim-record.ts';
import * as A from '../src/web/automation.ts';
import * as M from '../src/web/templates.ts';
import * as TL from '../src/web/timeline.ts';
import { feeDisplay, multiSiteDiscount } from '../src/web/engine.ts';
import { loadLetter, unresolvedTerms, TEST_LETTER_PATH } from '../src/web/letter.ts';
import { actor, fixedClock, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const SOP_EXPORT = fileURLToPath(new URL(
  '../../../08-monday-doc-exports/12552682457__Item-2-Standard-Operating-Procedures-enquiry-to-defence-pack.md', import.meta.url));

type Base = { db: Db; audit: AuditLog; now: () => string };
type Org = { business: string; property: string; assessment: string };

const ACC = actor('ACCOUNTING');
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');
const SURVEYING = actor('SURVEYING');

function deps(app: Base): I.InvoiceDeps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

function staff(app: Base, hash = 'x'): void {
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, hash, T0, T0]);
  }
}

let n = 0;
function organisation(app: Base, sector = 'dental'): Org {
  n += 1;
  const business = `fb-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Finance Organisation ${n} Limited`, sector, 'ASSESSMENT_SUBMITTED', T0]);
  const property = `fp-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `fa-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, sector, T0, 100_00, 200_00, T0]);
  return { business, property, assessment };
}

function claimAt(app: Base, org: Org, stage: string, figure: number | null = 240_000_00): string {
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: org.business, property_id: org.property, assessment_id: org.assessment, workstream: 'UNKNOWN',
    stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened({ ...app, newId: randomUUID }, null, made.id, stage, 'a finance test fixture');
  if (figure !== null) CF.signOffRow(app, org.business, org.assessment, made.id, figure);
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'a fixture next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31',
    priority: null, activity_type: 'TASK', business_id: org.business, property_id: null, claim_id: made.id, lead_id: null,
    contact_id: null, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF',
    automation_run_id: null, created_by: 'u-SALES',
  });
  return made.id;
}

/** A claim at INVOICE with the signed-off figure, the amendment window open and the fee trigger reached at its reading. */
function readyToInvoice(app: Base, opts: { figure?: number; sector?: string; org?: Org } = {}): { org: Org; claim: string } {
  const org = opts.org ?? organisation(app, opts.sector);
  const claim = claimAt(app, org, 'INVOICE', opts.figure ?? 240_000_00);
  CF.openWindow(app, org.business, org.property, claim);
  // Phase 132e: the fee trigger is our report delivered for filing, read from the deliverables register.
  CF.deliverForFiling(app, claim);
  return { org, claim };
}

function raise(app: Base, claim: string, opts: I.InvoiceOptions = {}, kind = 'FEE'): string {
  const r = I.raiseInvoice(deps(app), ACC, claim, { kind }, opts);
  assert.equal(r.ok, true, r.ok ? '' : r.why);
  return r.ok ? r.id : '';
}

/** A row from node:sqlite has no prototype and a literal does; compare what they say, not what they are made of. */
function plain<X>(v: X): X {
  return JSON.parse(JSON.stringify(v)) as X;
}

function count(db: Db, sql: string, params: readonly (string | number | null)[] = []): number {
  return db.get<{ n: number }>(sql, params)?.n ?? -1;
}

/** The real letter with clause 4's payment terms and abort fee, and clause 5's break fee, filled in — for the switch tests only. */
function completedLetter(): { paragraphs: { text: string; heading: boolean }[]; openTerms: ReturnType<typeof unresolvedTerms> } {
  const real = loadLetter();
  const paragraphs = real.paragraphs.map((p) => ({
    ...p,
    text: p.text
      .replace(/\[payment terms[^\]]*\]/, 'within 14 days of invoice')
      .replace('[no fee is payable / an abort fee of £[amount] is payable to cover survey and preparation costs already incurred]',
        'an abort fee of £750 is payable to cover survey and preparation costs already incurred')
      .replace('£[X]', '£995'),
  }));
  return { paragraphs, openTerms: unresolvedTerms(paragraphs) };
}

/**
 * PHASE 132e — THE REAL LETTER NOW STATES ITS PAYMENT TERMS ("within 14 days of the date of the invoice"). This is the
 * real letter with that bracket put back, so the UNSET branch is still proved the other way.
 */
function blankTermsLetter(): { paragraphs: { text: string; heading: boolean }[]; openTerms: ReturnType<typeof unresolvedTerms> } {
  const real = loadLetter();
  const paragraphs = real.paragraphs.map((p) => ({
    ...p, text: p.text.replace('payable within 14 days of the date of the invoice.', 'payable [payment terms — e.g. on completion / within 14 days of invoice].'),
  }));
  const letter = { paragraphs, openTerms: unresolvedTerms(paragraphs) };
  assert.equal(FC.letterFees(letter).payment_terms.state, 'BLANK', 'the blank-terms fixture no longer blanks the payment terms');
  return letter;
}

const ALL_ON: FC.FeeControls = {
  above_benefit: { enabled: false, mode: null },
  break_and_abort: { enabled: true },
};

/* ================================================================== *
 * HTTP
 * ================================================================== */

type Res = { status: number; location: string | null; body: string };
type Client = { req(path: string): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };

/**
 * THE CLOCK IS PASSED, NOT READ — Phase 132, 15 September 2026. The fixtures record a VAT position from T0 and an
 * accounting period that is fixed, so on the wall clock the HTTP test was red before September 2026 ("No VAT position
 * is recorded") and red again from 31 December 2027 (the window closed). The same fixed clock testApp() uses.
 */
async function boot(): Promise<{ made: Awaited<ReturnType<typeof createApp>>; signIn(role: AppRole): Promise<Client>; close(): void }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-finance-claim-')), now: fixedClock() });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  staff(made.app, await made.app.hasher.hash(PASSWORD));
  const client = (): Client => {
    let cookie = '';
    const c: Client = {
      async req(path) {
        const r = await fetch(base + path, { redirect: 'manual', headers: cookie === '' ? {} : { cookie } });
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      async post(path, fields) {
        const r = await fetch(base + path, {
          method: 'POST', redirect: 'manual',
          headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie === '' ? {} : { cookie }) },
          body: new URLSearchParams(fields).toString(),
        });
        const set = r.headers.getSetCookie();
        if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
    };
    return c;
  };
  return {
    made,
    async signIn(role) {
      const c = client();
      const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
      assert.equal(r.status, 303, `${role} could not sign in`);
      return c;
    },
    close: made.close,
  };
}

/* ================================================================== *
 * 1 · AN INVOICE BELONGS TO A CLAIM, AND ITS AMOUNT IS NEVER TYPED
 * ================================================================== */

describe('1 · an invoice belongs to a claim, and its amount is never typed', () => {
  test('raised on a claim at INVOICE: the next number, 3% of the signed-off figure (Phase 132e; 5% before), VAT read from the recorded position, and the due date the letter states — 14 days — or UNSET where the terms are blank, never thirty days', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { org, claim } = readyToInvoice(app);
      const id = raise(app, claim);
      const row = app.db.get<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ?', [id]);
      assert.equal(row?.['claim_id'], claim);
      assert.equal(row?.['business_id'], org.business, 'the organisation is kept beside the claim');
      assert.equal(row?.['claim_value_pence'], 240_000_00, 'the figure is the tax adviser’s signed-off figure');
      assert.equal(row?.['fee_pence'], 7_200_00, 'the fee is 3% of the allowances identified');
      assert.equal(row?.['vat_pence'], 0);
      assert.equal(row?.['vat_setting_id'], 'finance-setting-vat-position-2026-08-28', 'the VAT was not read from the recorded position');
      // Phase 132e: clause 4 now reads "within 14 days of the date of the invoice", so the due date is the invoice date + 14.
      assert.equal(row?.['due_on'], T.addDaysToDate(String(row?.['invoice_date']), 14), 'the due date is not the invoice date plus the letter’s 14 days');
      assert.match(String(row?.['due_basis']), /within 14 days of the invoice/);
      assert.equal(/\b30\b|thirty/i.test(String(row?.['due_basis'])), false);
      // AND THE OTHER WAY: with the payment terms blank, no due date is defaulted.
      const blankTerms = readyToInvoice(app);
      const unsetId = raise(app, blankTerms.claim, { letter: blankTermsLetter() });
      const unsetRow = app.db.get<Record<string, unknown>>('SELECT due_on, due_basis FROM invoices WHERE id = ?', [unsetId]);
      assert.equal(unsetRow?.['due_on'], null, 'a due date was defaulted while the letter’s payment terms are blank');
      assert.match(String(unsetRow?.['due_basis']), /^UNSET/);
      assert.match(String(unsetRow?.['due_basis']), /payment terms/);

      const v = I.claimInvoiceById(app.db, ACC, id, app.now());
      assert.equal(v.number, 'CB-000001');
      assert.equal(v.due_shown, T.addDaysToDate(String(row?.['invoice_date']), 14));
      assert.equal(v.money.state, 'NOTHING_RECEIVED');
      assert.equal(v.money.outstanding, '£7,200');
      assert.equal(v.money.overdue, false);
      assert.deepEqual(plain(app.db.get('SELECT seq, kind, state FROM invoice_numbers WHERE invoice_id = ?', [id])), { seq: 1, kind: 'INVOICE', state: 'ISSUED' });

      const line = app.db.get<{ detail: string; outcome: string }>("SELECT detail, outcome FROM audit_log WHERE kind = 'INVOICE_RAISED' ORDER BY seq DESC LIMIT 1");
      assert.equal(line?.outcome, 'ALLOWED');
      assert.equal(/720000|7,200|240000/.test(line?.detail ?? ''), false, 'the audit line carries an amount');
    } finally { app.close(); }
  });

  test('refused, with the reason and an audit line: not at the invoice stage; the fee trigger not reached at FEE_TRIGGER’s own reading; outside the window; no signed figure; a second live invoice', async () => {
    const app = await testApp();
    try {
      staff(app);
      const why = (claim: string): string => { const r = I.raiseInvoice(deps(app), ACC, claim, {}); assert.equal(r.ok, false); return r.ok ? '' : r.why; };

      assert.match(why(claimAt(app, organisation(app), 'REPORTS')), /invoice stage/);

      assert.equal(P.FEE_TRIGGER.decided, true, 'Phase 132e: the fee trigger is decided — our report delivered for filing');
      assert.equal(P.FEE_TRIGGER.reading, 'REPORT_DELIVERED_FOR_FILING');
      const noTrigger = organisation(app);
      const t = claimAt(app, noTrigger, 'INVOICE');
      CF.openWindow(app, noTrigger.business, noTrigger.property, t);
      assert.match(why(t), new RegExp(P.FEE_TRIGGERS[P.FEE_TRIGGER.reading]));

      const noWindow = organisation(app);
      const w = claimAt(app, noWindow, 'INVOICE');
      CF.deliverForFiling(app, w);
      assert.match(why(w), /amendment window/);

      const noFigure = organisation(app);
      const f = claimAt(app, noFigure, 'INVOICE', null);
      CF.openWindow(app, noFigure.business, noFigure.property, f);
      CF.deliveredRow(app, f);
      assert.match(why(f), /signed off/);

      const { claim } = readyToInvoice(app);
      raise(app, claim);
      assert.match(why(claim), /already has a fee invoice/);

      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 1);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INVOICE_RAISED' AND outcome = 'REFUSED'"), 5);
    } finally { app.close(); }
  });

  test('N4 — a VAT position nobody recorded refuses the invoice, and so does a registered position with no rate: VAT is read, never assumed', async () => {
    const app = await testApp();
    try {
      staff(app);
      const before = V.vatForInvoice(app.db, 1_000_00, '2026-08-01');
      assert.equal(before.ok, false, 'a day before any VAT position was recorded, VAT was assumed');
      if (!before.ok) assert.match(before.why, /No VAT position is recorded/);
      const r = V.recordSetting(deps(app), ADMIN, { setting: 'VAT_POSITION', value: 'REGISTERED', effective_from: '2026-09-01', source: 'a test of the refusal' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const { claim } = readyToInvoice(app);
      const refused = I.raiseInvoice(deps(app), ACC, claim, {});
      assert.equal(refused.ok, false);
      if (!refused.ok) assert.match(refused.why, /no VAT rate is recorded/);
      assert.equal(V.recordSetting(deps(app), ADMIN, { setting: 'VAT_RATE', value: '20%', effective_from: '2026-09-01', source: 'a test' }).ok, true);
      const id = raise(app, claim);
      assert.equal(app.db.get<{ vat_pence: number }>('SELECT vat_pence FROM invoices WHERE id = ?', [id])?.vat_pence, 1_440_00);
    } finally { app.close(); }
  });

  test('A CLAIM THAT HAS EXITED IS REFUSED — and OUTSIDE_AMENDMENT_WINDOW refuses every kind of invoice, because it stops the job before a fee is incurred', async () => {
    const app = await testApp();
    try {
      staff(app);
      const outside = readyToInvoice(app);
      const moved = P.moveClaim({ ...app, newId: randomUUID }, SALES, outside.claim, { kind: 'EXIT', to: 'OUTSIDE_AMENDMENT_WINDOW', reason_code: 'AMENDMENT_WINDOW_CLOSED' });
      assert.equal(moved.ok, true, moved.ok ? '' : moved.why);
      for (const kind of ['FEE', 'BREAK_FEE', 'ABORT_FEE']) {
        const r = I.raiseInvoice(deps(app), ACC, outside.claim, { kind }, { controls: ALL_ON, letter: completedLetter() });
        assert.equal(r.ok, false, `${kind} was raised on a claim outside the amendment window`);
        if (!r.ok) assert.match(r.why, /job stops before any fee is due/);
      }
      for (const exit of ['CLIENT_WITHDREW', 'REASONED_NEGATIVE', 'CANCELLED', 'LOST', 'CLIENT_DID_NOT_PROCEED']) {
        const { claim } = readyToInvoice(app);
        app.db.run('UPDATE claims SET stage = ? WHERE id = ?', [exit, claim]);
        const r = I.raiseInvoice(deps(app), ACC, claim, {});
        assert.equal(r.ok, false, `our fee was raised on a claim that exited ${exit}`);
        if (!r.ok) assert.match(r.why, /left the procedure/);
      }
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0);
      assert.ok(count(app.db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INVOICE_RAISED' AND outcome = 'REFUSED' AND detail LIKE '%OUTSIDE_AMENDMENT_WINDOW%'") >= 3);
    } finally { app.close(); }
  });

  test('THE AMOUNTS STAY UNWRITABLE: the table refuses a change to a raised amount, its VAT, its date, its terms or a typed payment state, and the old status route refuses a claim’s invoice', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      const id = raise(app, claim);
      for (const [sql, value] of [
        ['UPDATE invoices SET fee_pence = ? WHERE id = ?', 1], ['UPDATE invoices SET claim_value_pence = ? WHERE id = ?', 1],
        ['UPDATE invoices SET vat_pence = ? WHERE id = ?', 1], ['UPDATE invoices SET invoice_date = ? WHERE id = ?', '2020-01-01'],
        ['UPDATE invoices SET due_on = ? WHERE id = ?', '2026-10-08'], ['UPDATE invoices SET fee_rate = ? WHERE id = ?', 0.01],
        ['UPDATE invoices SET payment_status = ? WHERE id = ?', 'PAID'], ['UPDATE invoices SET kind = ? WHERE id = ?', 'BREAK_FEE'],
      ] as const) {
        assert.throws(() => app.db.run(sql, [value, id]), /E_INVOICE_AMOUNT_FIXED/, `writable: ${sql}`);
      }
      const r = F.setStatuses({ db: app.db, audit: app.audit, now: app.now }, ACC, id, { invoice_status: 'SENT', payment_status: 'PAID' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.match(r.why, /cannot type a claim invoice’s state/);
      assert.throws(() => app.db.run('DELETE FROM invoices WHERE id = ?', [id]), /never deleted/);
      assert.equal(app.db.get<{ fee_pence: number }>('SELECT fee_pence FROM invoices WHERE id = ?', [id])?.fee_pence, 7_200_00);
    } finally { app.close(); }
  });

  test('THE NUMBER SERIES: gapless, never reused, and a cancelled number recorded as cancelled — refused by the table as well as the store', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      const first = raise(app, claim);
      assert.equal(I.cancelInvoice(deps(app), ACC, first, {}).ok, false, 'cancelled without a reason');
      assert.equal(I.cancelInvoice(deps(app), ACC, first, { reason: 'raised against the wrong figure' }).ok, true);
      assert.deepEqual(plain(app.db.get('SELECT state FROM invoice_numbers WHERE invoice_id = ?', [first])), { state: 'CANCELLED' });
      assert.equal(I.claimInvoiceById(app.db, ACC, first, app.now()).money.state, 'CANCELLED');
      const second = raise(app, claim);
      assert.equal(I.claimInvoiceById(app.db, ACC, second, app.now()).number, 'CB-000002', 'a cancelled number was reused');

      assert.equal(I.markSent(deps(app), ACC, second, { sent_on: '2026-09-08' }).ok, true);
      const sent = I.cancelInvoice(deps(app), ACC, second, { reason: 'x' });
      assert.equal(sent.ok, false);
      if (!sent.ok) assert.match(sent.why, /credited/);

      assert.throws(() => app.db.run("INSERT INTO invoice_numbers (seq, kind, invoice_id, state, issued_at, issued_by) VALUES (9, 'INVOICE', ?, 'ISSUED', ?, 'u-ACCOUNTING')", [second, T0]), /E_NUMBER_GAP/);
      assert.throws(() => app.db.run("INSERT INTO invoice_numbers (seq, kind, invoice_id, state, issued_at, issued_by) VALUES (1, 'INVOICE', ?, 'ISSUED', ?, 'u-ACCOUNTING')", [second, T0]));
      assert.throws(() => app.db.run('DELETE FROM invoice_numbers WHERE seq = 1'), /E_NUMBER_GAP/);
      assert.throws(() => app.db.run("UPDATE invoice_numbers SET state = 'ISSUED', cancelled_at = NULL, cancelled_by = NULL WHERE seq = 1"), /only change it takes/);
      assert.deepEqual(app.db.all('SELECT seq FROM invoice_numbers ORDER BY seq').map((r) => r['seq']), [1, 2]);
    } finally { app.close(); }
  });

  test('CREDIT NOTES ARE THEIR OWN ROWS: in full with no amount typed, numbered in the series; clause 13 refused while its switch is off and while the letter is blank, and exact when both are met', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      const id = raise(app, claim);
      assert.equal(I.markSent(deps(app), ACC, id, {}).ok, true);

      const off = I.creditClause13(deps(app), ACC, id, {});
      assert.equal(off.ok, false);
      if (!off.ok) assert.match(off.why, /switched off/i);
      const blank = I.creditClause13(deps(app), ACC, id, {}, { clawback: { enabled: true } });
      assert.equal(blank.ok, false);
      if (!blank.ok) assert.match(blank.why, /clause 13 of the engagement letter still has gaps/);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'FEE_CLAWBACK_NOT_APPLIED' AND outcome = 'REFUSED'"), 2);

      const rdeps = CF.recordDeps(app);
      const opened = R.openEnquiry(rdeps, SALES, claim, { opened_on: '2026-09-01' });
      assert.equal(opened.ok, true, opened.ok ? '' : opened.why);
      const outcome = Object.keys(R.ENQUIRY_OUTCOMES).find((k) => k !== 'NO_CHANGE') ?? '';
      const closed = R.closeEnquiry(rdeps, SALES, claim, opened.ok ? opened.id : '', { closed_on: '2026-09-05', outcome, amended_figure: '200000' });
      assert.equal(closed.ok, true, closed.ok ? '' : closed.why);
      const real = loadLetter();
      const clause13Settled = { paragraphs: real.paragraphs, openTerms: real.openTerms.filter((t) => !/^clause 13 —/.test(t.clause)) };
      const c13 = I.creditClause13(deps(app), ACC, id, {}, { clawback: { enabled: true }, letter: clause13Settled });
      assert.equal(c13.ok, true, c13.ok ? '' : c13.why);
      assert.equal(app.db.get<{ amount_pence: number }>('SELECT amount_pence FROM invoice_credit_notes WHERE basis = ?', ['CLAUSE_13_REDUCTION'])?.amount_pence,
        7_200_00 - 6_000_00, 'clause 13 did not credit 3% of the difference');

      const full = I.creditInFull(deps(app), ACC, id, { reason: 'the claim was withdrawn after invoicing' });
      assert.equal(full.ok, true, full.ok ? '' : full.why);
      const v = I.claimInvoiceById(app.db, ACC, id, app.now());
      assert.equal(v.money.state, 'CREDITED_IN_FULL');
      assert.deepEqual(v.credit_notes.map((c) => c.number), ['CB-000002', 'CB-000003']);
      assert.equal(I.creditInFull(deps(app), ACC, id, { reason: 'again' }).ok, false);
      assert.equal(P.liveFeeInvoiceCount(app.db, claim), 0, 'an invoice credited in full still counts as the claim’s live fee');

      assert.throws(() => app.db.run("INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, issued_on, reason, recorded_by, recorded_at) VALUES ('x', ?, 'CREDIT_IN_FULL', 1, 0, '2026-09-08', 'x', 'u-ACCOUNTING', ?)", [id, T0]), /E_CREDIT_EXCEEDS_INVOICE/);
      assert.throws(() => app.db.run('UPDATE invoice_credit_notes SET amount_pence = 1'), /never changed/);
      assert.throws(() => app.db.run('DELETE FROM invoice_credit_notes'), /never deleted/);
    } finally { app.close(); }
  });

  test('PHASE 153d — CLAUSE 13 RUN AGAINST THE TEST-ONLY LETTER (Word question 34): any reduction, settlements counting; the credit is the fee on the corrected figure, and the real letter still refuses', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      const id = raise(app, claim);
      assert.equal(I.markSent(deps(app), ACC, id, {}).ok, true);
      const rdeps = CF.recordDeps(app);
      const opened = R.openEnquiry(rdeps, SALES, claim, { opened_on: '2026-09-01' });
      assert.equal(opened.ok, true, opened.ok ? '' : opened.why);
      const outcome = Object.keys(R.ENQUIRY_OUTCOMES).find((k) => k !== 'NO_CHANGE') ?? '';
      assert.equal(R.closeEnquiry(rdeps, SALES, claim, opened.ok ? opened.id : '', { closed_on: '2026-09-05', outcome, amended_figure: '200000' }).ok, true);
      const real = I.creditClause13(deps(app), ACC, id, {}, { clawback: { enabled: true }, letter: loadLetter() });
      assert.equal(real.ok, false, 'the real letter, its clause 13 still blank, gave a credit');
      const testCopy = loadLetter({ path: TEST_LETTER_PATH });
      const c13 = I.creditClause13(deps(app), ACC, id, {}, { clawback: { enabled: true }, letter: testCopy });
      assert.equal(c13.ok, true, c13.ok ? '' : c13.why);
      assert.equal(app.db.get<{ amount_pence: number }>('SELECT amount_pence FROM invoice_credit_notes WHERE basis = ?', ['CLAUSE_13_REDUCTION'])?.amount_pence,
        7_200_00 - 6_000_00, 'clause 13 against the test copy did not credit 3% of the difference');
    } finally { app.close(); }
  });

  test('MONEY RECEIVED IS RECORDED, NOT COLLECTED: bank transfer only; never more than owed; the state READ; never asked and not known about the bank details read alike (N4)', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      const id = raise(app, claim);
      const refuse = (fields: Record<string, string>, re: RegExp): void => {
        const r = I.recordReceived(deps(app), ACC, id, fields);
        assert.equal(r.ok, false, JSON.stringify(fields));
        if (!r.ok) assert.match(r.why, re);
      };
      refuse({ received_on: '2026-09-08', amount: '100', method: 'CARD' }, /bank transfer/i);
      refuse({ received_on: '2026-12-01', amount: '100' }, /still to come/);
      refuse({ received_on: '2026-09-08', amount: '12001' }, /more than this invoice still asks for/);
      refuse({ received_on: '2026-09-08', amount: '0' }, /in pounds/);

      assert.equal(I.recordReceived(deps(app), ACC, id, { received_on: '2026-09-08', amount: '5000', bank_details_confirmed: '' }).ok, true);
      let v = I.claimInvoiceById(app.db, ACC, id, app.now());
      assert.equal(v.money.state, 'PART_RECEIVED');
      assert.equal(v.money.outstanding, '£2,200');
      assert.equal(v.received[0]?.bank_details, I.BANK_NEVER_ASKED);
      assert.equal(v.money.unconfirmed_bank_details, 1);

      assert.equal(I.recordReceived(deps(app), ACC, id, { received_on: '2026-09-08', amount: '2200', bank_details_confirmed: 'NOT_KNOWN' }).ok, true);
      v = I.claimInvoiceById(app.db, ACC, id, app.now());
      assert.equal(v.money.state, 'RECEIVED_IN_FULL');
      assert.equal(v.money.unconfirmed_bank_details, 2, 'never asked and not known were not read alike');
      assert.deepEqual(v.received.map((p) => p.confirmed_off_email), [false, false]);

      const other = readyToInvoice(app);
      const confirmedId = raise(app, other.claim);
      assert.equal(I.recordReceived(deps(app), ACC, confirmedId, { received_on: '2026-09-08', amount: '1', bank_details_confirmed: 'OTHER_CHANNEL' }).ok, true);
      assert.equal(I.claimInvoiceById(app.db, ACC, confirmedId, app.now()).money.unconfirmed_bank_details, 0, 'the negative control');

      assert.throws(() => app.db.run("INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, recorded_by, recorded_at) VALUES ('p', ?, '2026-09-08', 1, 'BANK_TRANSFER', 'u-ACCOUNTING', ?)", [id, T0]), /E_MORE_THAN_OWED/);
      assert.throws(() => app.db.run("INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, recorded_by, recorded_at) VALUES ('q', ?, '2026-09-08', 1, 'CARD', 'u-ACCOUNTING', ?)", [confirmedId, T0]), /CHECK constraint/);
      const pid = v.received[1]?.id ?? '';
      assert.throws(() => app.db.run('DELETE FROM invoice_payments WHERE id = ?', [pid]), /never deleted/);
      assert.equal(I.voidReceived(deps(app), ACC, pid, {}).ok, false, 'voided without a reason');
      assert.equal(I.voidReceived(deps(app), ACC, pid, { reason: 'recorded against the wrong invoice' }).ok, true);
      assert.equal(I.voidReceived(deps(app), ACC, pid, { reason: 'again' }).ok, false);
      assert.equal(I.claimInvoiceById(app.db, ACC, id, app.now()).money.outstanding, '£2,200');
      for (const line of app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind IN ('MONEY_RECEIVED_RECORDED','MONEY_RECEIVED_VOIDED')")) {
        /* READ AS FIELDS, NOT AS TEXT. Phase 132, 15 September 2026: this was a
           substring search over the raw detail, and the detail carries a random
           invoice id, so a UUID holding "5000" or "7000" failed a correct record
           about one run in a thousand (a clock grid saw it once at 18 September
           09:30, and forty re-runs there were green). An amount is a field named
           for money, or a value equal to one of the amounts recorded here, in
           pounds or pence. */
        const detail = JSON.parse(line.detail) as Record<string, unknown>;
        const amounts = new Set(['5000', '500000', '2200', '220000']);
        const carries = Object.entries(detail).some(([k, v]) =>
          /amount|pence|pounds|paid|received/i.test(k) || amounts.has(String(v).replace(/[£,\s]/g, '')));
        assert.equal(carries, false, 'an audit line carries an amount: ' + line.detail);
      }
      assert.equal(/pay|charge|refund|card|checkout/i.test('invoice.record_received'), false);
    } finally { app.close(); }
  });

  test('OVERDUE IS DERIVED by the UK date: an UNSET due date is never overdue however late; with the letter’s terms set it falls due, goes overdue, and stops when paid', async () => {
    const app = await testApp();
    try {
      staff(app);
      const unset = readyToInvoice(app);
      const u = raise(app, unset.claim, { letter: blankTermsLetter() });
      const row = app.db.get<{ id: string; fee_pence: number; vat_pence: number; invoice_status: string; due_on: string | null }>(
        'SELECT id, fee_pence, vat_pence, invoice_status, due_on FROM invoices WHERE id = ?', [u]);
      assert.ok(row);
      const late = I.invoiceMoney(app.db, row, '2030-01-01T12:00:00.000Z');
      assert.equal(late.overdue, false, 'an invoice with no due date was read as overdue');
      assert.equal(late.due.state, 'NO_DUE_DATE');

      const set = readyToInvoice(app);
      const s = raise(app, set.claim, { letter: completedLetter() });
      const srow = app.db.get<{ id: string; fee_pence: number; vat_pence: number; invoice_status: string; due_on: string | null; invoice_date: string }>(
        'SELECT id, fee_pence, vat_pence, invoice_status, due_on, invoice_date FROM invoices WHERE id = ?', [s]);
      assert.ok(srow);
      assert.equal(srow.due_on, T.addDaysToDate(srow.invoice_date, 14));
      assert.equal(I.invoiceMoney(app.db, srow, app.now()).overdue, false);
      assert.equal(I.invoiceMoney(app.db, srow, '2026-09-23T12:00:00.000Z').overdue, true, 'not overdue the day after it fell due');
      assert.equal(I.recordReceived(deps(app), ACC, s, { received_on: '2026-09-08', amount: '7200' }).ok, true);
      assert.equal(I.invoiceMoney(app.db, srow, '2026-09-23T12:00:00.000Z').overdue, false, 'a paid invoice was still overdue');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * 2 · THE FEE CONTROLS — BUILT, SHIPPED OFF, AND OFF IS EXACTLY TODAY
 * ================================================================== */

describe('2 · the fee controls: built, shipped off, and off is exactly today’s behaviour', () => {
  test('every switch ships off — and off is exactly today: the plain 3% of CB_FEE, no warning, no minimum, no break or abort fee', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(FC.FEE_CONTROLS)), {
      above_benefit: { enabled: false, mode: null },
      break_and_abort: { enabled: false },
      uplifts: { enabled: false }, // Phase 157b: the old extra charges, at test defaults, off (Word question 235)
    });
    for (const figure of [5_000_00, 123_456_78, 240_000_00, 3_500_000_00]) {
      for (const entity of [null, 'company'] as const) {
        const f = FC.computeFee({ claim_value_pence: figure, sector: 'dental', entity_type: entity, tax_rate: null, pool_split_main_pence: null, pool_split_special_pence: null, period_start: null });
        assert.equal(f.ok, true);
        if (!f.ok) continue;
        const plain = feeDisplay(figure / 100, null, {});
        assert.equal(f.fee_pence, Math.round((plain.amount ?? 0) * 100), 'off is not the plain CB_FEE amount');
        assert.equal(f.fee_pence, f.plain_fee_pence);
        assert.equal(f.fee_rate, 0.03);
        assert.equal(f.warning, null);
      }
    }
    for (const kind of ['BREAK_FEE', 'ABORT_FEE'] as const) {
      const r = FC.letterFee(kind);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, 'SWITCH_OFF');
    }
    assert.equal(Object.keys(FC.FEE_CONTROLS).some((k) => /job/i.test(k)), false, 'a minimum job size switch exists for a decided no');
    assert.match(FC.NO_MINIMUM_JOB_SIZE, /1 September 2026/);
  });

  test('THE FIRST-YEAR CONTROL: WARN writes a warning and moves nothing; CAP and ADJUST_RATE refuse on a range and act only on a determined first-year saving', () => {
    const facts = { claim_value_pence: 300_000_00, sector: 'dental', entity_type: 'company' as const, tax_rate: null, pool_split_main_pence: null, pool_split_special_pence: null, period_start: null };
    const warn = FC.computeFee(facts, { ...FC.FEE_CONTROLS, above_benefit: { enabled: true, mode: 'WARN' } });
    assert.equal(warn.ok, true);
    if (warn.ok) {
      assert.equal(warn.fee_pence, 9_000_00, 'WARN moved the amount');
      // Phase 132e: at 3% a company with no rate and no split straddles the fee, so WARN says it cannot be said.
      assert.match(warn.warning ?? '', /cannot be said on the facts we hold/);
    }
    for (const mode of ['CAP', 'ADJUST_RATE'] as const) {
      const r = FC.computeFee(facts, { ...FC.FEE_CONTROLS, above_benefit: { enabled: true, mode } });
      assert.equal(r.ok, false, `${mode} acted on a bounded range`);
      if (!r.ok) assert.equal(r.code, 'ABOVE_BENEFIT_UNDETERMINED');
    }
    /* Phase 132e: at 3% the main pool's first-year relief (18% × 25% = 4.5%) no longer falls short of the fee, so the
       determined case that exceeds it is now the special-rate pool (6% × 25% = 1.5%). */
    const determinedFacts = { ...facts, tax_rate: 0.25, pool_split_main_pence: 0, pool_split_special_pence: 300_000_00, period_start: '2025-04-01' };
    const c = feeDisplay(3_000_000 / 10, 0.25, { main: 0, special: 300_000, period_start: '2025-04-01', is_company: true }).comparison;
    assert.equal(c.determined, true, 'the fixture no longer gives a determined first-year saving — choose another');
    assert.equal(c.fee_exceeds_year_one_benefit, true);
    const cap = FC.computeFee(determinedFacts, { ...FC.FEE_CONTROLS, above_benefit: { enabled: true, mode: 'CAP' } });
    const adjust = FC.computeFee(determinedFacts, { ...FC.FEE_CONTROLS, above_benefit: { enabled: true, mode: 'ADJUST_RATE' } });
    assert.ok(cap.ok && adjust.ok);
    const warnDetermined = FC.computeFee(determinedFacts, { ...FC.FEE_CONTROLS, above_benefit: { enabled: true, mode: 'WARN' } });
    assert.ok(warnDetermined.ok && /more than the tax this client would relieve in their first year/.test(warnDetermined.warning ?? ''));
    if (cap.ok && adjust.ok) {
      assert.equal(cap.fee_pence, Math.round((c.year_one_benefit ?? 0) * 100));
      assert.ok(cap.fee_pence < 9_000_00);
      assert.ok(adjust.fee_rate < 0.03 && adjust.fee_pence <= cap.fee_pence + 1);
    }
  });

  test('THE MINIMUM FEE IS RETIRED AS DECIDED NONE (Phase 132e): no control, no floor — a small fee stays 3% — and the decision is on the record', () => {
    assert.equal(Object.hasOwn(FC.FEE_CONTROLS, 'minimum_fee'), false, 'the retired minimum-fee control is back');
    assert.equal(FC.MINIMUM_FEE_DECISION.decided, 'NONE');
    assert.match(FC.MINIMUM_FEE_DECISION.answer, /flat fee of 3%/);
    assert.match(FC.MINIMUM_FEE_DECISION.retired, /removed on 16 September 2026/);
    for (const [pence, sector] of [[50_000_00, 'dental'], [10_000_00, 'gp'], [1_000_00, null]] as const) {
      const f = FC.computeFee({ claim_value_pence: pence, sector, entity_type: null, tax_rate: null, pool_split_main_pence: null, pool_split_special_pence: null, period_start: null });
      assert.ok(f.ok);
      if (f.ok) assert.equal(f.fee_pence, Math.round(pence * 0.03), `a £${pence / 100} claim was lifted by a floor`);
    }
    assert.match(FC.controlReadings().minimum_fee, /^none — decided/);
    assert.match(FC.NO_MINIMUM_JOB_SIZE, /no minimum fee either/);
  });

  test('THE MULTI-SITE DISCOUNT IS DISCRETIONARY: no tiers, its ceiling and approver are named nulls, and computeFee never applies one', () => {
    const m = multiSiteDiscount();
    assert.deepEqual({ ...m }, { discretionary: true, fixed_tiers: null, largest_discount: null, approved_by: null, asked: 'the largest discount and who approves it', applied_automatically: false });
    assert.match(FC.controlReadings().multi_site_discount, /never taken off a fee by the system/);
    assert.match(FC.controlReadings().multi_site_discount, /NOT DECIDED/);
  });

  test('THE BREAK FEE AND THE ABORT FEE ARE READ FROM THE LETTER: BLANK today and refused even switched on; with a completed letter the break fee on a withdrawn claim, and the abort fee nowhere else', async () => {
    const lf = FC.letterFees();
    assert.equal(lf.break_fee.state, 'BLANK', 'clause 5 is no longer blank — the break fee question has been answered; re-read it');
    assert.equal(lf.abort_fee.state, 'BLANK');
    // Phase 132e: clause 4's payment terms are completed — "within 14 days of the date of the invoice".
    assert.deepEqual({ ...lf.payment_terms }, { state: 'DAYS', days: 14, label: 'within 14 days of the invoice, as clause 4 states' });
    assert.equal(FC.letterFees(blankTermsLetter()).payment_terms.state, 'BLANK');
    assert.match(lf.break_fee.label, /^BLANK IN THE ENGAGEMENT LETTER/);
    const onButBlank = FC.letterFee('BREAK_FEE', ALL_ON);
    assert.equal(onButBlank.ok, false);
    if (!onButBlank.ok) assert.equal(onButBlank.code, 'LETTER_BLANK');

    const done = FC.letterFees(completedLetter());
    assert.deepEqual([done.break_fee.state, done.abort_fee.state, done.payment_terms.state], ['SET', 'SET', 'DAYS'], 'the completed letter fixture no longer fills the blanks');

    const app = await testApp();
    try {
      staff(app);
      const { claim } = readyToInvoice(app);
      app.db.run("UPDATE claims SET stage = 'CLIENT_WITHDREW' WHERE id = ?", [claim]);
      assert.equal(I.raiseInvoice(deps(app), ACC, claim, { kind: 'BREAK_FEE' }).ok, false, 'a break fee was raised with the switch off');
      assert.equal(I.raiseInvoice(deps(app), ACC, claim, { kind: 'BREAK_FEE' }, { controls: ALL_ON }).ok, false, 'a break fee was raised on a blank letter');
      assert.equal(I.raiseInvoice(deps(app), ACC, claim, { kind: 'ABORT_FEE' }, { controls: ALL_ON, letter: completedLetter() }).ok, false, 'an abort fee on a withdrawn claim');
      const id = raise(app, claim, { controls: ALL_ON, letter: completedLetter() }, 'BREAK_FEE');
      assert.deepEqual(plain(app.db.get('SELECT kind, fee_pence, fee_rate, claim_value_pence FROM invoices WHERE id = ?', [id])),
        { kind: 'BREAK_FEE', fee_pence: 995_00, fee_rate: null, claim_value_pence: null });
    } finally { app.close(); }

    const h = await boot();
    try {
      const page = await (await h.signIn('ACCOUNTING')).req('/staff/finance');
      assert.equal(page.status, 200);
      // Phase 132e: two blanks remain loud — the break fee and the abort fee; the payment terms are stated now.
      assert.ok((page.body.match(/BLANK IN THE ENGAGEMENT LETTER/g) ?? []).length >= 2, 'a blank term is not shown blank, loudly');
      assert.match(page.body, /within 14 days of the invoice, as clause 4 states/);
      assert.equal(/£995|£750/.test(page.body), false);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * 3 · VAT MONITORING
 * ================================================================== */

describe('3 · VAT monitoring: dated settings, the two tests, one task, and no invoice changed', () => {
  test('THE THRESHOLD, THE MARGIN AND THE TRIGGER ARE DATED SETTINGS WITH THEIR SOURCE: append-only, and ADMIN’s alone', async () => {
    const app = await testApp();
    try {
      staff(app);
      const t = V.currentSetting(app.db, 'VAT_REGISTRATION_THRESHOLD_PENCE', '2026-09-08');
      assert.equal(t?.value, '9000000');
      assert.match(t?.source ?? '', /GOV\.UK/);
      assert.match(V.currentSetting(app.db, 'VAT_WARNING_FRACTION', '2026-09-08')?.source ?? '', /section 5/);
      for (const who of [ACC, SALES, SURVEYING, actor('CLIENT', 'u-CLIENT', 'fb-x')]) {
        assert.throws(() => V.recordSetting(deps(app), who, { setting: 'VAT_REGISTRATION_THRESHOLD_PENCE', value: '1', effective_from: '2026-09-01', source: 'x' }), NotAuthorised);
      }
      assert.equal(V.recordSetting(deps(app), ADMIN, { setting: 'VAT_REGISTRATION_THRESHOLD_PENCE', value: '95000', effective_from: '2026-09-10', source: '' }).ok, false, 'a setting with no source');
      assert.equal(V.recordSetting(deps(app), ADMIN, { setting: 'VAT_REGISTRATION_THRESHOLD_PENCE', value: '95000', effective_from: '2026-09-10', source: 'a later reading, for the test' }).ok, true);
      assert.equal(V.currentSetting(app.db, 'VAT_REGISTRATION_THRESHOLD_PENCE', '2026-09-09')?.value, '9000000');
      assert.equal(V.currentSetting(app.db, 'VAT_REGISTRATION_THRESHOLD_PENCE', '2026-09-10')?.value, '9500000');
      assert.throws(() => app.db.run("UPDATE finance_settings SET value = '1'"), /never changed/);
      assert.throws(() => app.db.run('DELETE FROM finance_settings'), /never deleted/);
    } finally { app.close(); }
  });

  test('THE ROLLING TWELVE MONTHS AND THE THIRTY-DAY TEST: below, inside the margin, over; credit notes net off; older invoices out; an undated invoice counted apart; nothing in effect, cannot say', async () => {
    const app = await testApp();
    try {
      staff(app);
      assert.equal(V.vatReading(app.db, app.now()).rolling.band, 'BELOW');
      const a = readyToInvoice(app);
      CF.claimInvoiceRow(app, a.org.business, a.claim, { fee_pence: 70_000_00 });
      let r = V.vatReading(app.db, app.now());
      assert.equal(r.rolling.from, '2025-10-01');
      assert.equal(r.rolling.band, 'INSIDE_MARGIN', '£70,000 is inside the 75% margin of £90,000');
      const b = readyToInvoice(app);
      CF.claimInvoiceRow(app, b.org.business, b.claim, { fee_pence: 30_000_00, invoice_date: '2025-09-30' });
      assert.equal(V.vatReading(app.db, app.now()).rolling.turnover_pence, 70_000_00, 'an invoice older than the twelve months was counted');
      const c = readyToInvoice(app);
      const big = CF.claimInvoiceRow(app, c.org.business, c.claim, { fee_pence: 25_000_00 });
      assert.equal(V.vatReading(app.db, app.now()).rolling.band, 'OVER');
      assert.equal(I.creditInFull(deps(app), ACC, big, { reason: 'the test' }).ok, true);
      r = V.vatReading(app.db, app.now());
      assert.equal(r.rolling.turnover_pence, 70_000_00, 'a credit note did not net off');

      app.db.run("INSERT INTO invoices (id,business_id,claim_value_pence,fee_pence,invoice_status,payment_status,vat_position,created_at) VALUES ('legacy', ?, NULL, 999900, 'RAISED', 'UNPAID', 'x', ?)", [a.org.business, T0]);
      r = V.vatReading(app.db, app.now());
      assert.equal(r.rolling.undated_invoices, 1);
      assert.equal(r.rolling.turnover_pence, 70_000_00, 'an undated invoice was counted as a figure');
      assert.match(r.rolling.basis, /counted apart, never as £0/);

      const waiting = readyToInvoice(app, { figure: 900_000_00 });
      r = V.vatReading(app.db, app.now());
      assert.equal(r.forward.claims_counted >= 1, true);
      assert.ok(r.single_engagements.some((s) => s.expected === '£27,000'), 'a single £27,000 expected fee was not named');
      assert.ok(V.expectedFees(app.db).some((e) => e.claim_id === waiting.claim && e.expected_pence === 27_000_00));

      // THE TAX POINT is the invoice date, or the client report's delivery if earlier (the procedure, section 4.1).
      const later = '2027-09-15T12:00:00.000Z';
      const baseline = V.vatReading(app.db, later).rolling.turnover_pence;
      const delivered = readyToInvoice(app);
      CF.issue(app, delivered.claim, 'CLIENT_REPORT');
      CF.claimInvoiceRow(app, delivered.org.business, delivered.claim, { fee_pence: 10_000_00, invoice_date: '2026-10-02' });
      const undelivered = readyToInvoice(app);
      CF.claimInvoiceRow(app, undelivered.org.business, undelivered.claim, { fee_pence: 3_000_00, invoice_date: '2026-10-02' });
      assert.equal(V.vatReading(app.db, later).rolling.turnover_pence - baseline, 3_000_00,
        'a fee whose report was delivered before the window was counted at its invoice date');

      const early = V.vatReading(app.db, '2026-08-01T12:00:00.000Z');
      assert.equal(early.threshold, null);
      assert.equal(early.rolling.band, 'CANNOT_SAY');
    } finally { app.close(); }
  });

  test('INSIDE THE MARGIN: ONE task, through insertTask, waiting with ACCOUNTING, about Caprebate, due at month end and flagged overdue by dueReading — never a second, and no invoice changed', async () => {
    const app = await testApp();
    try {
      staff(app);
      const a = readyToInvoice(app);
      CF.claimInvoiceRow(app, a.org.business, a.claim, { fee_pence: 70_000_00 });
      const before = JSON.stringify(app.db.all('SELECT * FROM invoices ORDER BY id'));
      assert.throws(() => V.runVatCheck(deps(app), SALES), NotAuthorised);
      const first = V.runVatCheck(deps(app), ACC);
      assert.equal(first.task.state, 'CREATED');
      const task = app.db.get<Record<string, unknown>>('SELECT * FROM staff_tasks WHERE id = ?', [first.task.id]);
      assert.equal(task?.['company_subject'], 'VAT_THRESHOLD');
      assert.equal(task?.['owner_role'], 'ACCOUNTING');
      assert.equal(task?.['owner_id'], null);
      assert.equal(task?.['origin'], 'VAT_MONITOR');
      assert.equal(task?.['business_id'], null);
      assert.equal(task?.['due_on'], '2026-09-30');
      assert.equal(/£|70,000/.test(String(task?.['title']) + String(task?.['description'])), false, 'the task carries a figure');
      assert.ok(T.myWork(app.db, ACC, app.now()).tasks.some((t) => t.id === first.task.id && t.about.some((x) => x.kind === 'company')));
      assert.equal(T.myWork(app.db, SURVEYING, app.now()).tasks.some((t) => t.id === first.task.id), false);
      assert.equal(T.dueReading(String(task?.['due_on']), '2026-10-01T12:00:00.000Z').overdue, true);

      assert.equal(V.runVatCheck(deps(app), ADMIN).task.state, 'ALREADY_OPEN');
      raise(app, readyToInvoice(app).claim);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM staff_tasks WHERE company_subject = 'VAT_THRESHOLD'"), 1, 'a second VAT task was raised');
      assert.equal(JSON.stringify(app.db.all("SELECT * FROM invoices WHERE id IN (SELECT id FROM invoices ORDER BY id) AND claim_id = ? ORDER BY id", [a.claim])),
        JSON.stringify(JSON.parse(before).filter((x: { claim_id: string }) => x.claim_id === a.claim)), 'the VAT check changed an invoice');

      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, {
        title: 'x', description: null, owner_id: null, owner_role: 'ACCOUNTING', due_on: null, priority: null, activity_type: 'TASK',
        business_id: a.org.business, property_id: null, claim_id: null, lead_id: null, contact_id: null, fact_id: null, recurrence: null,
        recurred_from_id: null, is_next_action: false, origin: 'VAT_MONITOR', automation_run_id: null, created_by: null, company_subject: 'VAT_THRESHOLD',
      }), /CHECK constraint/, 'a VAT task was about an organisation too');
      /* PHASE 132, 14 SEPTEMBER 2026 — "vat" AS A WORD IN THE TABLE NAME, NOT AS THREE LETTERS.
         `LIKE '%vat%'` also matched migration 023's `surveyor_control_observations` ("obserVATions"),
         which is not a VAT table. The intent is unchanged: no table for VAT beside staff_tasks. */
      const vatTables = app.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
        .map((t) => t.name).filter((name) => /(^|_)vat(_|$)/i.test(name));
      assert.deepEqual(vatTables, [], 'a VAT table exists beside staff_tasks');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * 4 · THE FINANCE DASHBOARD
 * ================================================================== */

describe('4 · the finance dashboard: ACCOUNTING and ADMIN, and money only', () => {
  test('BY MONTH: invoiced, received, credit notes, outstanding and overdue, and fees expected from claims at INVOICE — with the invoice stage’s finance task read, never a second', async () => {
    const app = await testApp();
    try {
      staff(app);
      const paid = readyToInvoice(app);
      const id = raise(app, paid.claim);
      assert.equal(I.recordReceived(deps(app), ACC, id, { received_on: '2026-09-08', amount: '5000' }).ok, true);

      const org = organisation(app);
      const waiting = claimAt(app, org, 'REPORTS');
      CF.readyForReports(app, org.business, org.property, org.assessment, waiting);
      for (const m of ['CLIENT_ACCEPTED_REPORT', 'ACCOUNTANT_CONFIRMED_RETURN']) {
        assert.equal(P.recordMilestone({ ...app, newId: randomUUID }, SALES, waiting, m, null).ok, true);
      }
      const moved = P.moveClaim({ ...app, newId: randomUUID }, SALES, waiting, { kind: 'FORWARD', to: 'INVOICE' });
      assert.equal(moved.ok, true, moved.ok ? '' : moved.why);
      const tasksBefore = count(app.db, 'SELECT COUNT(*) AS n FROM staff_tasks');

      const d = I.financeDashboard(app.db, ACC, app.now());
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM staff_tasks'), tasksBefore, 'reading the dashboard wrote a task');
      const month = d.months[0];
      assert.equal(month?.month, '2026-09');
      assert.equal(month?.invoiced, '£7,200');
      assert.equal(month?.received, '£5,000');
      assert.equal(month?.expected, '£7,200');
      assert.equal(d.totals.outstanding, '£2,200');
      assert.equal(d.totals.overdue_count, 0);
      // Phase 132e: the letter states 14 days, so the raised invoice carries a due date.
      assert.equal(d.totals.without_a_due_date, 0);
      const expected = d.expected.claims.find((c) => c.claim_id === waiting);
      assert.equal(expected?.finance_task?.title, 'Raise the invoice for this claim in the finance view', 'the finance view did not read the invoice stage’s own task');
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ? AND title = ?', [waiting, 'Raise the invoice for this claim in the finance view']), 1);
      assert.equal(d.months.length, 12);
      assert.throws(() => I.financeDashboard(app.db, SALES, app.now()), NotAuthorised);
      assert.throws(() => I.financeDashboard(app.db, SURVEYING, app.now()), NotAuthorised);
    } finally { app.close(); }
  });

  test('THE SHAPE: no new table joins the answers, the register data, the notes, the surveyor’s workings or the estimate — by foreign key and by column', async () => {
    const app = await testApp();
    try {
      const allowed = new Set(['businesses', 'claims', 'users', 'invoices', 'invoice_credit_notes', 'finance_settings']);
      for (const table of ['invoices', 'invoice_numbers', 'invoice_credit_notes', 'invoice_payments', 'finance_settings']) {
        for (const fk of app.db.all<{ table: string }>('SELECT "table" FROM pragma_foreign_key_list(?)', [table])) {
          assert.equal(allowed.has(fk.table), true, `${table} has a foreign key to ${fk.table}`);
        }
        for (const col of app.db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table])) {
          // A credit note is not an internal note: `credit_note_id` names this module's own table.
          assert.equal(/assessment|answer|estimate|^note_id$|internal_note|register|surveyor|commitment|signoff|working/.test(col.name), false, `${table}.${col.name}`);
        }
      }
    } finally { app.close(); }
  });

  test('WHO REACHES IT, OVER HTTP: ACCOUNTING and ADMIN; SALES and SURVEYING refused the invoice and every new route, writing nothing; ACCOUNTING still refused the assessment and the settings', async () => {
    const h = await boot();
    try {
      const app = h.made.app;
      const { claim } = readyToInvoice(app);
      const id = raise(app, claim);
      const estimate = 'e-finance-claim';
      app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [estimate, app.db.get<{ assessment_id: string }>('SELECT assessment_id FROM claims WHERE id = ?', [claim])?.assessment_id ?? '',
          app.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim])?.business_id ?? '',
          27_182_818, 0.161803, 13_591_409, 13_591_409, 9_999_991, 0.577215, 8_675_309, T0, 'not-a-real-hash']);

      const accounting = await h.signIn('ACCOUNTING');
      for (const path of ['/staff/finance', '/staff/finance/view.json', `/staff/finance/${id}`]) {
        const r = await accounting.req(path);
        assert.equal(r.status, 200, path);
        for (const v of ['27182818', '0.161803', '13591409', '9999991', '8675309']) assert.equal(r.body.includes(v), false, `${path} carries an estimate figure`);
      }
      assert.equal((await accounting.req('/staff/assessments')).status, 403, 'ACCOUNTING reached the assessment');
      assert.equal((await accounting.post('/staff/finance/settings', { setting: 'VAT_WARNING_FRACTION', value: '0.1', effective_from: '2026-09-01', source: 'x' })).status, 403);
      assert.equal((await (await h.signIn('ADMIN')).req('/staff/finance/view.json')).status, 200);

      const counts = (): string => JSON.stringify([
        count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), count(app.db, 'SELECT COUNT(*) AS n FROM invoice_numbers'),
        count(app.db, 'SELECT COUNT(*) AS n FROM invoice_credit_notes'), count(app.db, 'SELECT COUNT(*) AS n FROM invoice_payments'),
        count(app.db, 'SELECT COUNT(*) AS n FROM finance_settings'), count(app.db, 'SELECT COUNT(*) AS n FROM staff_tasks'),
      ]);
      const before = counts();
      for (const role of ['SALES', 'SURVEYING'] as const) {
        const c = await h.signIn(role);
        for (const path of ['/staff/finance', '/staff/finance/view.json', `/staff/finance/${id}`]) {
          assert.equal((await c.req(path)).status, 403, `${role} opened ${path}`);
        }
        for (const [path, fields] of [
          [`/staff/finance/claims/${claim}/raise`, { kind: 'FEE' }], [`/staff/finance/${id}/received`, { received_on: '2026-09-08', amount: '1' }],
          [`/staff/finance/${id}/credit-in-full`, { reason: 'x' }], [`/staff/finance/${id}/sent`, {}], [`/staff/finance/${id}/cancel`, { reason: 'x' }],
          ['/staff/finance/vat-check', {}], ['/staff/finance/settings', { setting: 'VAT_WARNING_FRACTION', value: '0.1', effective_from: '2026-09-01', source: 'x' }],
        ] as const) {
          assert.equal((await c.post(path, fields)).status, 403, `${role} posted ${path}`);
        }
      }
      assert.equal(counts(), before, 'a refused write left something behind');
    } finally { h.close(); }
  });

  test('THE RULE: every new action is refused to every role not granted it — and a CLIENT is on none', () => {
    const granted: Record<string, readonly AppRole[]> = {
      'invoice.raise': ['ADMIN', 'ACCOUNTING'], 'invoice.credit': ['ADMIN', 'ACCOUNTING'],
      'invoice.record_received': ['ADMIN', 'ACCOUNTING'], 'finance_setting.write': ['ADMIN'],
    };
    for (const [action, roles] of Object.entries(granted)) {
      for (const role of APP_ROLES) {
        const a = actor(role, `u-${role}`, role === 'CLIENT' ? 'fb-1' : null);
        assert.equal(can(a, action, { type: 'invoice', id: 'i', business_id: 'fb-1' }), roles.includes(role), `${role} on ${action}`);
      }
    }
    assert.equal(can(ACC, 'assessment.read', { type: 'assessment', id: 'a', business_id: 'fb-1' }), false);
    for (const role of ['SALES', 'SURVEYING'] as const) assert.equal(can(actor(role), 'invoice.read', { type: 'invoice', id: 'i', business_id: 'fb-1' }), false);
  });
});

/* ================================================================== *
 * 5 · THE INVOICE EMAIL IS NOT BUILT
 * ================================================================== */

describe('5 · the invoice email is not built', () => {
  test('THE INVOICE-FRAUD PROCEDURE IS NOT IN FORCE — the SOP export carries it as a flagged DRAFT addition — and while it is not, every refusal holds, at the rule store, the template store and the table', async () => {
    assert.equal(A.INVOICE_FRAUD_PROCEDURE.in_force, false);
    const sop = readFileSync(SOP_EXPORT, 'utf8');
    const sop9 = sop.slice(sop.indexOf('## SOP 9'), sop.indexOf('## SOP 10'));
    assert.match(sop9, /DRAFT ADDITION/, 'the invoice-fraud procedure is not in SOP 9 as a flagged draft');
    assert.match(sop9, /invoice-fraud procedure/i);
    assert.match(sop9, /channel other than email/);
    assert.equal(/DRAFT ADDITION/.test(sop9) && A.INVOICE_FRAUD_PROCEDURE.in_force, false, 'the code says in force while the SOP says draft');

    for (const key of ['INVOICE_EMAIL', 'INVOICE_REMINDER', 'SEND_BANK_DETAILS']) assert.ok(Object.hasOwn(A.FORBIDDEN_EFFECTS, key), key);
    const app = await testApp();
    try {
      staff(app);
      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
      for (const key of ['INVOICE_EMAIL', 'INVOICE_REMINDER', 'SEND_BANK_DETAILS']) {
        const r = A.createRule(d, ADMIN, { label: key, trigger_event: 'STAGE_ENTERED', trigger_stage: 'INVOICE', effect: key, task_title: 'x', task_activity_type: 'TASK', due_in_days: '1', assign_to: 'ROLE', assign_role: 'ACCOUNTING' });
        assert.equal(r.ok, false, `${key} was accepted`);
      }
      for (const body of ['Our payment details are below', 'Please remit the balance', 'Pay by bank transfer', 'The amount due is shown', 'Your fee note', 'A statement of account follows']) {
        const r = M.createTemplate(d, ADMIN, { label: 'A test', subject: 'A subject', body });
        assert.equal(r.ok, false, `the store accepted: ${body}`);
        assert.throws(() => app.db.run('INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
          [randomUUID(), 'raw', 'raw', body, T0, T0]), /E_TEMPLATE_REFUSED/, `the table accepted: ${body}`);
      }
      const seeded = app.db.get<{ label: string; subject: string; body: string }>("SELECT label, subject, body FROM email_templates WHERE id = 'template-next-step'");
      assert.ok(seeded);
      assert.equal(M.templateRefusal(seeded), null, 'the negative control: the seeded template is now refused');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * 6 · THE CLAIM'S OWN INVOICE, EVERYWHERE THE ORGANISATION'S WAS READ
 * ================================================================== */

describe('6 · the claim’s own invoice, everywhere the organisation’s was read', () => {
  test('THE INVOICE GATE reads this claim’s invoice: an organisation’s, another claim’s, a cancelled one and one credited in full do not open it', async () => {
    const app = await testApp();
    try {
      staff(app);
      const x = readyToInvoice(app);
      const y = readyToInvoice(app, { org: x.org });
      const need = (claim: string): boolean => P.gateOut(app.db, P.loadPipelineClaim(app.db, claim), 'INVOICE', { today: app.now() })
        .needs.find((q) => /fee invoice is raised on this claim/.test(q.what))?.met ?? false;
      app.db.run("INSERT INTO invoices (id,business_id,claim_value_pence,fee_pence,invoice_status,payment_status,vat_position,created_at) VALUES ('org-invoice', ?, NULL, 150000, 'RAISED', 'UNPAID', 'x', ?)", [x.org.business, T0]);
      assert.equal(need(x.claim), false, 'an organisation’s invoice opened a claim’s gate');
      const onY = raise(app, y.claim);
      assert.equal(need(x.claim), false, 'another claim’s invoice opened this claim’s gate');
      assert.equal(need(y.claim), true);
      assert.equal(I.cancelInvoice(deps(app), ACC, onY, { reason: 'the test' }).ok, true);
      assert.equal(need(y.claim), false, 'a cancelled invoice kept the gate open');
      const again = raise(app, y.claim);
      assert.equal(I.creditInFull(deps(app), ACC, again, { reason: 'the test' }).ok, true);
      assert.equal(need(y.claim), false, 'an invoice credited in full kept the gate open');
    } finally { app.close(); }
  });

  test('THE TIMELINE: a claim’s financial events are its own invoices, and ACCOUNTING’s holds nothing else', async () => {
    const app = await testApp();
    try {
      staff(app);
      const x = readyToInvoice(app);
      const y = readyToInvoice(app, { org: x.org });
      const id = raise(app, x.claim);
      assert.equal(I.markSent(deps(app), ACC, id, {}).ok, true);
      assert.equal(I.recordReceived(deps(app), ACC, id, { received_on: '2026-09-08', amount: '100' }).ok, true);
      const onX = TL.timelineFor(app.db, ACC, { kind: 'claim', id: x.claim });
      assert.deepEqual([...new Set(onX.events.map((e) => e.category))], ['FINANCE']);
      assert.ok(onX.events.some((e) => e.what === 'Invoice CB-000001 was raised — our fee'));
      assert.ok(onX.events.some((e) => /recorded as sent/.test(e.what)));
      assert.ok(onX.events.some((e) => /recorded as received/.test(e.what)));
      assert.equal(onX.events.some((e) => /£/.test(e.what)), false, 'a financial event carries an amount');
      assert.equal(TL.timelineFor(app.db, ACC, { kind: 'claim', id: y.claim }).events.length, 0, 'another claim’s invoice reached this claim’s timeline');
    } finally { app.close(); }
  });
});
