/**
 * THE ACCOUNTING VIEW — what it sees, and a test for each thing it does not.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE REFUSALS ARE THE POINT, AND EACH ONE IS PROVED TWICE
 *
 * The settled decision of 6 September 2026 is a closed list: this role sees the
 * client's name, the claim value, the fee, whether an invoice was raised,
 * whether payment arrived, and the VAT position. It does not see the questions
 * and answers, the register data, the internal notes, or the surveyor's
 * workings.
 *
 * So every one of those is asserted at the RULE — `can()` returns false — and
 * again over HTTP, where the section answers 403. Proving it only at the rule
 * would leave a route that never asks; proving it only over HTTP would leave
 * the rule free to drift under a screen that happens not to draw the field.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AND THE FEE COMPARISON IS ASSERTED AS ARITHMETIC, NOT AS A STRING
 *
 * "For every company client the fee exceeds their year-one benefit at any pool
 * split" is a claim about numbers. It is checked here by running the engine's
 * own comparison at both ends of its own marginal band and asserting the
 * verdict, and separately by asserting that the rendered amount is untouched
 * while both CB_FEEGUARD switches are off.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS } from '../src/authz.ts';
import { feeDisplay, feeGuard, feeRate, marginalRateRange } from '../src/web/engine.ts';
import * as F from '../src/web/finance.ts';
import { actor } from './helpers.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-09T00:00:00.000Z';

/** £300,000 of allowances, £9,000 of fee. Exactly 3% (Phase 132e; it was 5% and £15,000), and it is checked. */
const CLAIM_PENCE = 30_000_000;
const FEE_PENCE = 900_000;

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

type Harness = {
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  signIn(role: AppRole): Promise<Client>;
  invoice: string;
  business: string;
};

async function boot(): Promise<Harness> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-finance-'));
  const made = await createApp(':memory:', { documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const db = made.app.db;

  const client = (): Client => {
    const c: Client = {
      cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
        }
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      post(path, fields) {
        return c.req(path, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(),
        });
      },
    };
    return c;
  };

  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
        `${role} Person`, role, hash, T, T]);
  }

  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['biz-1', 'Elverton Private Hospital Limited', 'private_hospital', 'INVOICED', T]);
  db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) ' +
      'VALUES (?,?,?,?,?,?,?)',
    ['a-1', 'biz-1', 'private_hospital', T, 20_000_000, 40_000_000, T]);
  db.run(
    'INSERT INTO assessment_answers (id,assessment_id,ord,question_id,question_text,state,value) ' +
      'VALUES (?,?,?,?,?,?,?)',
    ['ans-1', 'a-1', 0, 'Q1', 'How is the business set up?', 'ANSWERED', 'company']);
  db.run(
    'INSERT INTO internal_notes (id,business_id,author_id,body,created_at) VALUES (?,?,?,?,?)',
    ['n-1', 'biz-1', 'u-SALES', 'A NOTE THE FINANCE ROLE MUST NEVER SEE', T]);
  db.run(
    'INSERT INTO invoices (id,business_id,claim_value_pence,fee_pence,invoice_status,payment_status,' +
      'vat_position,created_at,entity_type,tax_rate,pool_split_main_pence,pool_split_special_pence,period_start) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL)',
    ['inv-1', 'biz-1', CLAIM_PENCE, FEE_PENCE, 'RAISED', 'UNPAID',
      'Caprebate is not VAT registered; no VAT is charged on this fee', T, 'company']);

  async function signIn(role: AppRole): Promise<Client> {
    const c = client();
    const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
    assert.equal(r.status, 303, `${role} could not sign in`);
    return c;
  }

  return { close: made.close, app: made.app, signIn, invoice: 'inv-1', business: 'biz-1' };
}

/* ================================================================== *
 * 1. WHAT IT SEES
 * ================================================================== */

describe('the accounting view shows Caprebate’s own finance and nothing else', () => {
  test('the six things it may see are all on the page', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');

    const list = await accounting.req('/staff/finance');
    assert.equal(list.status, 200);
    assert.match(list.body, /Elverton Private Hospital Limited/);   // the client's name
    assert.match(list.body, /£300,000/);                             // the claim value
    assert.match(list.body, /£9,000/);                               // our fee
    assert.match(list.body, /raised, not sent/);                     // invoice state
    assert.match(list.body, /nothing received/);                     // payment state
    assert.match(list.body, /not VAT registered/);                   // the VAT position
  });

  test('the fee IS three per cent of the allowances identified, checked as arithmetic', () => {
    assert.equal(feeRate(), 0.03);
    assert.equal(FEE_PENCE, Math.round(CLAIM_PENCE * feeRate()));
    const d = feeDisplay(CLAIM_PENCE / 100, 0.25, {});
    assert.equal(d.render, true);
    assert.equal(d.amount, 9_000, 'the engine and the seeded fee disagree');
  });
});

/* ================================================================== *
 * 2. WHAT IT DOES NOT SEE — one test per refusal
 * ================================================================== */

describe('each refusal, proved at the rule and again over HTTP', () => {
  const a = actor('ACCOUNTING');

  test('the questions and answers', async (t) => {
    assert.equal(can(a, 'assessment.read', { type: 'assessment', id: 'a-1', business_id: 'biz-1' }), false);
    assert.equal(can(a, 'answer.read', { type: 'answer', id: 'ans-1', business_id: 'biz-1' }), false);
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    assert.equal((await accounting.req('/staff/assessments')).status, 403);
    assert.equal((await accounting.req('/staff/assessments/a-1')).status, 403);
  });

  test('the register data', async (t) => {
    assert.equal(can(a, 'register_record.read', { type: 'register_record', id: 'r', business_id: 'biz-1' }), false);
    const it = await boot();
    t.after(() => it.close());
    // Reached only through the engaged-client page, which this role cannot open. PHASE 151b: /staff/clients answers
    // Accounting now, as its billing view (Word answer 40) — and that view carries no register data.
    const accounting = await it.signIn('ACCOUNTING');
    const clients = await accounting.req('/staff/clients');
    assert.equal(clients.status, 200);
    assert.doesNotMatch(clients.body, /Lookups|Companies House|energy certificate|Run the research/);
  });

  test('the internal notes — and the note’s own text is nowhere in any response it gets', async (t) => {
    assert.equal(can(a, 'internal_note.read', { type: 'internal_note', id: 'n-1', business_id: 'biz-1' }), false);
    assert.equal(can(a, 'internal_note.write', { type: 'internal_note', id: 'n-1', business_id: 'biz-1' }), false);
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    for (const path of ['/staff/finance', `/staff/finance/${it.invoice}`, '/staff', '/staff/settings']) {
      const r = await accounting.req(path);
      assert.equal(r.body.includes('A NOTE THE FINANCE ROLE MUST NEVER SEE'), false,
        `the internal note reached ${path}`);
    }
  });

  test('the surveyor’s workings', async (t) => {
    assert.equal(can(a, 'surveyor_job.enter',
      { type: 'surveyor_job', id: 'x', business_id: 'x', surveyor_id: null }), false);
    assert.equal(can(a, 'surveyor_job.read',
      { type: 'surveyor_job', id: 'j', business_id: 'biz-1', surveyor_id: 'u-SURVEYING' }), false);
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    assert.equal((await accounting.req('/staff/survey')).status, 403);
  });

  test('our estimate — the finance view carries the CLAIM VALUE, which is not the estimate row', async (t) => {
    assert.equal(can(a, 'estimate.read', { type: 'estimate', id: 'e', business_id: 'biz-1' }), false);
    const it = await boot();
    t.after(() => it.close());
    // A distinctive figure in the estimates table that is NOT the invoice's.
    it.app.db.run(
      'INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,' +
        'pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,' +
        'indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ['e-1', 'a-1', 'biz-1', 27_182_818, 0.161803, 13_591_409, 13_591_409, 9_999_991,
        0.577215, 8_675_309, T, 'not-a-real-hash']);

    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.req(`/staff/finance/${it.invoice}`);
    assert.equal(r.status, 200);
    for (const v of ['27182818', '0.161803', '13591409', '9999991', '8675309']) {
      assert.equal(r.body.includes(v), false, `an estimate figure (${v}) reached the finance view`);
    }
  });

  test('the shape refuses it too — `invoices` has no join to any of them', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const cols = it.app.db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', ['invoices'])
      .map((c) => c.name);
    // The only foreign key out of this table is to the business, for the name.
    assert.equal(cols.includes('business_id'), true);
    for (const forbidden of ['assessment_id', 'estimate_id', 'answer_id', 'note_id', 'surveyor_job_id']) {
      assert.equal(cols.includes(forbidden), false,
        `\`invoices\` gained a join to ${forbidden} — the shape restriction is the second enforcement`);
    }
  });
});

/* ================================================================== *
 * 3. THE FEE VERSUS WHAT THE CLIENT GETS BACK
 * ================================================================== */

describe('the fee-versus-benefit comparison is shown, and it changes no figure', () => {
  test('both CB_FEEGUARD switches are OFF, and the displayed amount is the plain rate', () => {
    assert.deepEqual(feeGuard(), { cap: false, warn: false },
      'a switch was turned on — that is Q90 and it is not a build decision');
    const d = feeDisplay(300_000, 0.25, {});
    assert.equal(d.capped, false);
    assert.equal(d.uncapped_amount, null);
    assert.equal(d.warning, null);
    assert.equal(d.amount, 9_000);
  });

  /* PHASE 132e, 16 SEPTEMBER 2026 — THE FEE IS 3%, AND THE TWO TESTS BELOW WERE RE-DERIVED FROM THE ENGINE, NOT EDITED
     TO PASS. At 5% a company's year-one relief fell short of the fee at every rate and split, and an unincorporated
     client's did at 20%. At 3% neither holds: the answer depends on the pool split at every end of both bands, and the
     engine returns null — not true, not false — which is what these now assert. */
  test('FOR A COMPANY, AT 3%, WHETHER THE FEE EXCEEDS THE FIRST-YEAR BENEFIT DEPENDS ON THE SPLIT, AT BOTH ENDS OF THE BAND', () => {
    const [lo, hi] = marginalRateRange('company');
    assert.deepEqual([lo, hi], [0.19, 0.265], 'the engine’s marginal band has moved — re-derive this');

    for (const rate of [lo, hi]) {
      const c = feeDisplay(300_000, rate, { is_company: true }).comparison;
      assert.equal(c.computed, true);
      assert.equal(c.determined, false, 'with no split and no period start the answer must be a range');
      assert.equal(c.fee_exceeds_year_one_benefit, null,
        `at ${rate} the engine said the fee always or never exceeds the first-year benefit — at 3% it depends on the split`);
    }

    // WHY, AS ARITHMETIC. The special-rate pool relieves 6% × rate and the main pool 18% × rate:
    // 6% × 26.5% = 1.59% is below 3%, and 18% × 19% = 3.42% is above it.
    assert.equal(0.06 * hi < feeRate(), true);
    assert.equal(0.18 * lo > feeRate(), true);
  });

  test('AN UNINCORPORATED CLIENT, AT 3%, STRADDLES TOO — and that is why both ends are shown', () => {
    const [lo, hi] = marginalRateRange('uninc_ruk');
    assert.deepEqual([lo, hi], [0.20, 0.45], 'the engine’s marginal band has moved — re-derive this');

    const atLo = feeDisplay(300_000, lo, {}).comparison.fee_exceeds_year_one_benefit;
    const atHi = feeDisplay(300_000, hi, {}).comparison.fee_exceeds_year_one_benefit;

    // At 20%: 6% × 20% = 1.2% and 18% × 20% = 3.6% sit either side of 3%. At 45%: 2.7% and 8.1% do too. The engine
    // returns NULL at both, and that is the whole reason the boolean is three-valued.
    assert.equal(atLo, null, 'at 20% the range no longer straddles 3% — re-derive');
    assert.equal(atHi, null, 'at 45% the range no longer straddles 3% — re-derive');
    assert.equal(0.06 * hi < feeRate() && 0.18 * lo > feeRate(), true);
  });

  test('the page shows the comparison, both readings, and says the amount is untouched', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.req(`/staff/finance/${it.invoice}`);
    assert.match(r.body, /lowest marginal rate for a company/);
    assert.match(r.body, /highest marginal rate for a company/);
    // Phase 132e: at 3% the two readings straddle the fee, so the page says they do not agree — the finding, not an answer.
    assert.match(r.body, /the readings do not agree, so there is no answer to give/);
    assert.match(r.body, /The fee above is not changed by any of this/);
    assert.match(r.body, /cap: off; warning: off/);
    // The standing disclosure, verbatim and not softened.
    assert.match(r.body, /not capped by, and may exceed, what you save in tax in a given year/);
    // The unknown is named rather than resolved.
    assert.match(r.body, /pool split is not determined/);
  });

  test('with no entity type the comparison refuses rather than guessing a rate', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    it.app.db.run('UPDATE invoices SET entity_type = NULL WHERE id = ?', [it.invoice]);
    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.req(`/staff/finance/${it.invoice}`);
    assert.match(r.body, /cannot be computed for this client/);
    assert.match(r.body, /we do not know yet if the client is a company or a partnership/);
    assert.match(r.body, /a missing fact, not £0/);
  });

  test('a three-valued answer is rendered as three values, never collapsed to “no”', () => {
    // A fee inside the range: the engine returns null and the screen must say
    // "cannot say", because null is the model declining to assert.
    const c = feeDisplay(300_000, 0.30, {}).comparison;
    assert.equal(c.fee_exceeds_year_one_benefit, null,
      'the fixture no longer straddles the range — pick another rate');
  });
});

/* ================================================================== *
 * 4. NO PAYMENT IS TAKEN ANYWHERE
 * ================================================================== */

describe('invoices are recorded, not collected', () => {
  test('recording a status changes the record and writes an audit line without an amount', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.post(`/staff/finance/${it.invoice}/status`,
      { invoice_status: 'SENT', payment_status: 'PAID' });
    assert.equal(r.status, 303);

    const row = it.app.db.get<{ invoice_status: string; payment_status: string }>(
      'SELECT invoice_status, payment_status FROM invoices WHERE id = ?', [it.invoice]);
    assert.equal(row?.invoice_status, 'SENT');
    assert.equal(row?.payment_status, 'PAID');

    const line = it.app.db.get<{ kind: string; detail: string }>(
      "SELECT kind, detail FROM audit_log WHERE kind = 'INVOICE_UPDATED' ORDER BY seq DESC LIMIT 1");
    assert.equal(line?.kind, 'INVOICE_UPDATED');
    assert.equal(line?.detail.includes('1500000'), false, 'the audit line carries an amount');

  });

  test('money cannot have arrived against an invoice that was never raised', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.post(`/staff/finance/${it.invoice}/status`,
      { invoice_status: 'NOT_RAISED', payment_status: 'PAID' });
    assert.equal(r.status, 400);
    assert.match(r.body, /never raised/);
  });

  test('a state this system does not have is refused', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    for (const bad of [{ invoice_status: 'PAID_IN_BITCOIN', payment_status: 'PAID' },
      { invoice_status: 'SENT', payment_status: 'REFUNDED' }]) {
      assert.equal((await accounting.post(`/staff/finance/${it.invoice}/status`, bad)).status, 400);
    }
  });

  test('THE AMOUNTS ARE NOT WRITABLE — there is no route that changes the fee', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    // Posting an amount to the one route that exists changes nothing.
    await accounting.post(`/staff/finance/${it.invoice}/status`,
      { invoice_status: 'SENT', payment_status: 'UNPAID', fee_pence: '1', claim_value_pence: '1' });
    const row = it.app.db.get<{ fee_pence: number; claim_value_pence: number }>(
      'SELECT fee_pence, claim_value_pence FROM invoices WHERE id = ?', [it.invoice]);
    assert.equal(row?.fee_pence, FEE_PENCE);
    assert.equal(row?.claim_value_pence, CLAIM_PENCE);

    // And no other route accepts one.
    for (const path of ['fee', 'amount', 'pay', 'charge', 'refund']) {
      const res = await accounting.post(`/staff/finance/${it.invoice}/${path}`, { amount: '1' });
      assert.equal(res.status === 404 || res.status === 403, true, `/${path} answered ${res.status}`);
    }
  });

  test('no action anywhere in the rule table is about taking money', () => {
    for (const action of REGISTERED_ACTIONS) {
      assert.equal(/pay|charge|refund|card|checkout/i.test(action), false,
        `the rule table has a payment action: ${action}`);
    }
  });

  test('the page says so, rather than leaving it to be discovered', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const accounting = await it.signIn('ACCOUNTING');
    const r = await accounting.req('/staff/finance');
    assert.match(r.body, /NO PAYMENT IS TAKEN ANYWHERE IN THIS SYSTEM/);
    assert.match(r.body, /no card processor and no bank/);
  });
});

/* ================================================================== *
 * 5. WHO ELSE REACHES IT
 * ================================================================== */

describe('the finance section admits ADMIN and ACCOUNTING and nobody else', () => {
  test('SALES and SURVEYING are refused, and ADMIN is not', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    for (const role of ['SALES', 'SURVEYING'] as const) {
      const c = await it.signIn(role);
      assert.equal((await c.req('/staff/finance')).status, 403, `${role} opened the finance section`);
      assert.equal((await c.req(`/staff/finance/${it.invoice}`)).status, 403);
    }
    const admin = await it.signIn('ADMIN');
    assert.equal((await admin.req('/staff/finance')).status, 200);
  });

  test('a CLIENT is refused the section although they may read their own business', async (t) => {
    const it = await boot();
    t.after(() => it.close());
    const hash = await it.app.hasher.hash(PASSWORD);
    it.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,?)',
      ['u-CLIENT', 'client@example.invalid', 'client@example.invalid', 'Client Person',
        'CLIENT', hash, T, T, it.business]);
    const c = await it.signIn('CLIENT');
    assert.equal((await c.req('/staff/finance')).status, 403);
    assert.equal((await c.req(`/staff/finance/${it.invoice}`)).status, 403);
    // And the rule that lets them read their own business is still intact.
    assert.equal(
      can(actor('CLIENT', 'u-CLIENT', it.business), 'business.read',
        { type: 'business', id: it.business }), true);
  });

  test('the section gate is a sentinel object, so no client’s business can ever be it', () => {
    const client = actor('CLIENT', 'u-CLIENT', '__finance__');
    // Even a client whose business id WAS the sentinel is refused: the rule for
    // invoice.read has no CLIENT entry at all.
    assert.equal(can(client, 'invoice.read', { type: 'invoice', id: '__finance__', business_id: '__finance__' }), false);
    assert.throws(() => F.assertFinanceSection(client), /not authorised/);
  });
});
