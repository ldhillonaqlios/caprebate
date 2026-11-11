/**
 * PHASE 161m1 (follow-up), 11 November 2026 — THE BREAK FEE IS NEVER RAISED BY THE APP.
 *
 * Lakhbir, 11 November 2026: "fix this - again we shouldnt charge anyone first its only the 3% admin can send invoices
 * manually". Clause 5 of the engagement letter: £995 a property, plus the charges of any surveyor already booked for the
 * claim, at cost, payable only if the client ends the agreement early. A review found that with the break-and-abort switch
 * (claims.FEE_CONTROLS.break_and_abort) on, the app raised one flat £995: not a property each, and without the surveyor.
 *
 * Proven here, each the other way where the old code differed:
 *   1  no break fee and no abort fee is raised by the app when a client withdraws or a claim closes early, switch on or off
 *   2  the finance page's guide is £995 times the properties (1 and 3), plus the surveyor's line, as a guide only
 *   3  no role but ADMIN can raise the break fee by hand, in the code or over HTTP
 *   4  an ADMIN can, with the amount they enter: sealed, numbered, the versions with it, and audited
 */

/* This file signs in with a password alone, so it builds the application with twoFactor: 'off', as the finance tests do. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app/server.ts';
import type { Db } from '../../src/core/db.ts';
import type { AuditLog } from '../../src/core/audit.ts';
import { APP_ROLES, type AppRole } from '../../src/core/roles.ts';
import { NotAuthorised } from '../../src/core/authz.ts';
import * as C from '../../src/modules/crm/crm.ts';
import * as P from '../../src/modules/crm/pipeline.ts';
import * as I from '../../src/modules/finance/invoices.ts';
import * as FC from '../../src/modules/claims/fee-controls.ts';
import { loadLetter, unresolvedTerms } from '../../src/modules/claims/letter.ts';
import { claimsRules } from '../../src/modules/claims/logic/rules.ts';
import { rulesThroughFinance } from '../../src/modules/finance/index.ts';
import { resultVersions } from '../../src/shared/index.ts';
import { actor, fixedClock, testApp } from '../helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const ADMIN = actor('ADMIN');
const ACC = actor('ACCOUNTING');
const SALES = actor('SALES');

type Base = { db: Db; audit: AuditLog; now: () => string };
const ON: FC.FeeControls = { above_benefit: { enabled: false, mode: null }, break_and_abort: { enabled: true } };

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
/** A client with `properties` buildings and one claim on each, every claim at `stage`; and, if asked, one more claim with no property. */
function client(app: Base, stage: string, properties: number, extra: { claimWithoutProperty?: boolean; surveyor?: boolean } = {}): { business: string; claims: string[] } {
  n += 1;
  const business = `bf-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Break Fee Client ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const assessment = `bfa-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
  const ids: (string | null)[] = [];
  for (let i = 0; i < properties; i++) {
    const p = `bfp-${n}-${i}`;
    app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [p, business, `Site ${i + 1}`, T0]);
    ids.push(p);
  }
  if (extra.claimWithoutProperty === true) ids.push(null);
  const claims = ids.map((property_id) => {
    const made = C.insertClaim(app.db, app.now, randomUUID, {
      business_id: business, property_id, assessment_id: assessment, workstream: 'UNKNOWN', stage, owner_id: null,
      surveyor_id: extra.surveyor === true ? 'u-SURVEYING' : null,
    });
    P.recordOpened({ ...app, newId: randomUUID }, null, made.id, stage, 'a break-fee test fixture');
    return made.id;
  });
  return { business, claims };
}

function count(db: Db, sql: string, params: readonly (string | number | null)[] = []): number {
  return db.get<{ n: number }>(sql, params)?.n ?? -1;
}

/** The real letter with clause 4 giving an abort fee of £750, to prove the abort fee is never raised even where a letter states one. */
function abortFeeLetter(): { paragraphs: { text: string; heading: boolean }[]; openTerms: ReturnType<typeof unresolvedTerms> } {
  const paragraphs = loadLetter().paragraphs.map((p) => ({
    ...p,
    text: p.text.replace('If no material claim is identified following the survey, no fee is payable.',
      'If no material claim is identified following the survey, an abort fee of £750 is payable to cover survey and preparation costs already incurred.'),
  }));
  return { paragraphs, openTerms: unresolvedTerms(paragraphs) };
}

/* ================================================================== *
 * HTTP, as the finance tests sign in
 * ================================================================== */

type Res = { status: number; location: string | null; body: string };
type Client = { req(path: string): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };

async function boot(): Promise<{ made: Awaited<ReturnType<typeof createApp>>; signIn(role: AppRole): Promise<Client>; close(): void }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-break-fee-')), now: fixedClock() });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  staff(made.app, await made.app.hasher.hash(PASSWORD));
  const one = (): Client => {
    let cookie = '';
    return {
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
  };
  return {
    made,
    async signIn(role) {
      const c = one();
      const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
      assert.equal(r.status, 303, `${role} could not sign in`);
      return c;
    },
    close: made.close,
  };
}

/* ================================================================== *
 * 1 · NOTHING IS RAISED BY THE APP
 * ================================================================== */

describe('1 · no break fee and no abort fee is raised by the app, whatever the switch', () => {
  test('a client withdraws and a claim is cancelled: nothing is invoiced, and asking for a break or abort fee is refused and audited, switch off and on', async () => {
    const app = await testApp();
    try {
      staff(app);
      const withdrew = client(app, 'REPORTS', 1);
      const cancelled = client(app, 'DATA_GATHERING', 2);
      const negative = client(app, 'SURVEY', 1);
      app.db.run("UPDATE claims SET stage = 'CLIENT_WITHDREW' WHERE id = ?", [withdrew.claims[0] ?? '']);
      for (const c of cancelled.claims) {
        const m = P.moveClaim({ ...app, newId: randomUUID }, SALES, c, { kind: 'EXIT', to: 'CANCELLED', reason_code: 'OTHER', reason: 'the client ended the agreement' });
        assert.equal(m.ok, true, m.ok ? '' : m.why);
      }
      app.db.run("UPDATE claims SET stage = 'REASONED_NEGATIVE' WHERE id = ?", [negative.claims[0] ?? '']);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0, 'ending early raised an invoice by itself');

      for (const controls of [FC.FEE_CONTROLS, ON]) {
        for (const who of [ADMIN, ACC]) {
          for (const claim of [withdrew.claims[0] ?? '', cancelled.claims[0] ?? '']) {
            const r = I.raiseInvoice(deps(app), who, claim, { kind: 'BREAK_FEE' }, { controls });
            assert.equal(r.ok, false, `the app raised a break fee itself (switch ${controls.break_and_abort.enabled ? 'on' : 'off'}, ${who.role})`);
            if (!r.ok) assert.match(r.why, /never raises a break fee by itself/);
          }
          // Even a letter that states an abort fee raises none: clause 4 says no fee where no material claim is found.
          const a = I.raiseInvoice(deps(app), who, negative.claims[0] ?? '', { kind: 'ABORT_FEE' }, { controls, letter: abortFeeLetter() });
          assert.equal(a.ok, false, `the app raised an abort fee (switch ${controls.break_and_abort.enabled ? 'on' : 'off'})`);
          if (!a.ok) assert.match(a.why, /There is no abort fee/);
        }
      }
      // The finance page reads the guide and writes nothing.
      I.financeDashboard(app.db, ADMIN, app.now(), { controls: ON });
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0, 'an invoice was raised');
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoice_numbers'), 0, 'a number was used');
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INVOICE_RAISED' AND outcome = 'REFUSED' AND detail LIKE '%NOT_RAISED_BY_THE_APP%'"), 8);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INVOICE_RAISED' AND outcome = 'REFUSED' AND detail LIKE '%NO_ABORT_FEE%'"), 4);
    } finally { app.close(); }
  });

  test('the switch stays off and is in the register at version 2, its meaning changed and its value not: on or off it raises nothing', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(FC.FEE_CONTROLS.break_and_abort)), { enabled: false });
    const e = claimsRules().find((r) => r.id === 'claims.FEE_CONTROLS.break_and_abort');
    assert.ok(e !== undefined);
    assert.equal(e?.version, 2);
    assert.equal(e?.effective_from, '2026-11-11');
    assert.equal(e?.approver, 'Lakhbir');
    assert.match(e?.change ?? '', /no longer raises a break fee or an abort fee/);
    for (const controls of [FC.FEE_CONTROLS, ON]) assert.match(FC.controlReadings(controls).break_and_abort, /never raises a break fee or an abort fee by itself/);
    assert.equal(Object.hasOwn(FC, 'letterFee'), false, 'the flat-£995 raising is back');
    assert.match(FC.BREAK_FEE_DECISION.answer, /only the 3% admin can send invoices manually/);
  });
});

/* ================================================================== *
 * 2 · THE GUIDE: £995 A PROPERTY, PLUS THE SURVEYOR
 * ================================================================== */

describe('2 · the break fee shown is £995 a property, plus the surveyor’s charges added by hand, as a guide only', () => {
  test('one property and three: £995 and £2,985, each with the surveyor’s line; nothing counted is guessed', () => {
    const one = FC.breakFeeGuide({ properties: 1, claims_without_property: 0, surveyor_recorded: false });
    assert.deepEqual([one.state, one.per_property, one.per_property_pence, one.letter_pence], ['SET', true, 995_00, 995_00]);
    assert.match(one.lines[0] ?? '', /^£995(\.00)? a property, for 1 property: £995(\.00)?, as clause 5 states\.$/);
    assert.equal(one.lines.at(-1), 'Plus the surveyor’s charges at cost, if a surveyor was booked: add them by hand.');
    const three = FC.breakFeeGuide({ properties: 3, claims_without_property: 0, surveyor_recorded: true });
    assert.equal(three.letter_pence, 2_985_00, 'three properties is not £995 three times');
    assert.match(three.lines[0] ?? '', /for 3 properties: £2,985(\.00)?/);
    assert.match(three.lines.at(-1) ?? '', /A surveyor is recorded on this claim\. Add their charges, at cost, by hand/);
    assert.match(three.guidance_only, /guide only\. Nothing is charged or invoiced by itself/);
    // No property recorded: no figure, and the claim the count cannot see is named.
    const none = FC.breakFeeGuide({ properties: 0, claims_without_property: 1, surveyor_recorded: false });
    assert.equal(none.letter_pence, null);
    assert.ok(none.lines.some((l) => /1 of these claims has no property recorded/.test(l)));
    for (const g of [one, three, none]) for (const l of [...g.lines, g.guidance_only]) assert.equal(/[—–]/.test(l), false, `a long dash: ${l}`);
  });

  test('on the finance page: each client who ended early, their properties counted from the claims, the figure pre-filled, and only for an admin a form', async () => {
    const app = await testApp();
    try {
      staff(app);
      const a = client(app, 'CLIENT_WITHDREW', 1);
      const b = client(app, 'CANCELLED', 3, { surveyor: true });
      const c = client(app, 'CLIENT_WITHDREW', 2, { claimWithoutProperty: true });
      client(app, 'REPORTS', 4); // not ended: no guide
      const rows = I.endedEarlyClients(app.db, ADMIN);
      assert.deepEqual(rows.map((r) => r.business_id), [a.business, b.business, c.business]);
      const [ra, rb, rc] = rows;
      assert.equal(ra?.guide.letter_pence, 995_00);
      assert.equal(ra?.prefill, '995.00');
      assert.equal(ra?.guide.surveyor, FC.SURVEYOR_BY_HAND);
      assert.equal(rb?.guide.letter_pence, 2_985_00);
      assert.equal(rb?.prefill, '2985.00');
      assert.equal(rb?.guide.surveyor, FC.SURVEYOR_RECORDED_BY_HAND);
      assert.ok(b.claims.includes(rb?.raise_on ?? ''), 'the break fee is raised on one of the client’s own claims');
      assert.equal(rc?.guide.letter_pence, 1_990_00, 'two properties, and the claim with none is not guessed');
      assert.ok(rc?.guide.lines.some((l) => /1 of these claims has no property recorded/.test(l)));
      assert.deepEqual(rows.map((r) => r.may_raise_by_hand), [true, true, true]);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0, 'showing the guide raised an invoice');
    } finally { app.close(); }

    const h = await boot();
    try {
      const app = h.made.app;
      const x = client(app, 'CLIENT_WITHDREW', 3);
      const adminPage = await (await h.signIn('ADMIN')).req('/staff/finance');
      assert.equal(adminPage.status, 200);
      assert.match(adminPage.body, /Clients who ended early/);
      assert.match(adminPage.body, /for 3 properties: £2,985(\.00)?, as clause 5 states/);
      assert.match(adminPage.body, /Plus the surveyor’s charges at cost, if a surveyor was booked: add them by hand\./);
      assert.match(adminPage.body, new RegExp(`action="/staff/finance/claims/${x.claims[0] ?? ''}/break-fee"`));
      assert.match(adminPage.body, /name="amount" inputmode="decimal" value="2985\.00"/);
      const accPage = await (await h.signIn('ACCOUNTING')).req('/staff/finance');
      assert.equal(accPage.status, 200);
      assert.equal(/\/break-fee"/.test(accPage.body), false, 'Accounting is offered the break-fee form');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * 3 · ONLY AN ADMIN
 * ================================================================== */

describe('3 · no role but ADMIN can raise the break fee by hand', () => {
  test('every other role is refused in the code and over HTTP, and nothing is written', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { claims } = client(app, 'CLIENT_WITHDREW', 1);
      for (const role of APP_ROLES.filter((r) => r !== 'ADMIN')) {
        const who = actor(role, `u-${role}`, role === 'CLIENT' ? 'bf-1' : null);
        assert.throws(() => I.raiseBreakFeeByHand(deps(app), who, claims[0] ?? '', { amount: '995' }), NotAuthorised, `${role} raised a break fee by hand`);
      }
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0);
    } finally { app.close(); }

    const h = await boot();
    try {
      const { claims } = client(h.made.app, 'CLIENT_WITHDREW', 1);
      for (const role of ['ACCOUNTING', 'SALES', 'SURVEYING'] as const) {
        const r = await (await h.signIn(role)).post(`/staff/finance/claims/${claims[0] ?? ''}/break-fee`, { amount: '995' });
        assert.equal(r.status, 403, `${role} posted the break fee`);
      }
      assert.equal(count(h.made.app.db, 'SELECT COUNT(*) AS n FROM invoices'), 0, 'a refused post left an invoice');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * 4 · AN ADMIN CAN, WITH THE AMOUNT THEY ENTER
 * ================================================================== */

describe('4 · an admin raises it by hand: the amount they enter, sealed, numbered, the versions with it, and audited', () => {
  test('the amount typed is the invoice, the guide is on its basis, the audit says it was typed but not what, and one break fee a client', async () => {
    const app = await testApp();
    try {
      staff(app);
      const { business, claims } = client(app, 'CLIENT_WITHDREW', 3, { surveyor: true });
      const claim = claims[0] ?? '';
      // Refusals first: each says why and is audited.
      const empty = I.raiseBreakFeeByHand(deps(app), ADMIN, claim, { amount: '' });
      assert.deepEqual([empty.ok, empty.ok ? '' : empty.field], [false, 'amount']);
      const open = client(app, 'REPORTS', 1);
      const notEnded = I.raiseBreakFeeByHand(deps(app), ADMIN, open.claims[0] ?? '', { amount: '995' });
      assert.equal(notEnded.ok, false, 'a break fee on a claim nobody ended');

      const r = I.raiseBreakFeeByHand(deps(app), ADMIN, claim, { amount: '£3,435.50', note: 'the surveyor’s £450.50 added' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const id = r.ok ? r.id : '';
      const row = app.db.get<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ?', [id]);
      assert.deepEqual([row?.['kind'], row?.['fee_pence'], row?.['fee_rate'], row?.['claim_value_pence'], row?.['business_id'], row?.['raised_by']],
        ['BREAK_FEE', 3_435_50, null, null, business, 'u-ADMIN']);
      assert.match(String(row?.['fee_basis']), /raised by hand by an admin: £3,435\.50/);
      assert.match(String(row?.['fee_basis']), /for 3 properties: £2,985/);
      assert.match(String(row?.['fee_basis']), /The amount was entered by hand\./);
      assert.match(String(row?.['fee_basis']), /the surveyor’s £450\.50 added/);
      assert.match(String(row?.['due_basis']), /within 14 days of the invoice/);
      assert.deepEqual(JSON.parse(String(row?.['versions_json'])), JSON.parse(JSON.stringify(resultVersions(rulesThroughFinance()))));
      assert.equal(JSON.parse(String(row?.['versions_json'])).rules['claims.FEE_CONTROLS.break_and_abort'], 2);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM invoice_numbers WHERE invoice_id = ? AND kind = 'INVOICE'", [id]), 1, 'not numbered');
      assert.throws(() => app.db.run('UPDATE invoices SET fee_pence = ? WHERE id = ?', [1, id]), /E_INVOICE_AMOUNT_FIXED/, 'the amount is not sealed');

      const audit = app.db.all<{ outcome: string; detail: string }>("SELECT outcome, detail FROM audit_log WHERE kind = 'INVOICE_RAISED' ORDER BY rowid");
      const allowed = audit.filter((a) => a.outcome === 'ALLOWED');
      assert.equal(allowed.length, 1);
      const detail = JSON.parse(allowed[0]?.detail ?? '{}') as Record<string, unknown>;
      assert.deepEqual([detail['kind'], detail['by_hand'], detail['amount'], detail['matches_guide'], detail['claim_id']],
        ['BREAK_FEE', true, 'ENTERED_BY_HAND', false, claim]);
      assert.equal(/3435|3,435/.test(allowed[0]?.detail ?? ''), false, 'the audit carries the amount');
      assert.deepEqual(audit.filter((a) => a.outcome === 'REFUSED').map((a) => (JSON.parse(a.detail) as { reason_code: string }).reason_code), ['NO_AMOUNT', 'NOT_ENDED_EARLY']);

      // One break fee a client: a second is refused, on any of their claims.
      const again = I.raiseBreakFeeByHand(deps(app), ADMIN, claims[1] ?? '', { amount: '995' });
      assert.equal(again.ok, false);
      if (!again.ok) assert.match(again.why, /already has a break fee invoice/);
      const shown = I.endedEarlyClients(app.db, ADMIN).find((e) => e.business_id === business);
      assert.deepEqual([shown?.invoice?.id, shown?.may_raise_by_hand], [id, false]);

      // The guide's own figure, accepted as it is, is recorded as the guide's.
      const same = client(app, 'CANCELLED', 1);
      const s = I.raiseBreakFeeByHand(deps(app), ADMIN, same.claims[0] ?? '', { amount: '995.00' });
      assert.equal(s.ok, true);
      const last = app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'INVOICE_RAISED' AND outcome = 'ALLOWED' ORDER BY rowid DESC LIMIT 1");
      assert.equal((JSON.parse(last?.detail ?? '{}') as { matches_guide: boolean }).matches_guide, true);
    } finally { app.close(); }
  });

  test('over HTTP: the admin posts the amount, lands on the new invoice, and it reads as the break fee', async () => {
    const h = await boot();
    try {
      const { claims } = client(h.made.app, 'CLIENT_WITHDREW', 1);
      const admin = await h.signIn('ADMIN');
      const r = await admin.post(`/staff/finance/claims/${claims[0] ?? ''}/break-fee`, { amount: '1200', note: 'surveyor £205 added' });
      assert.equal(r.status, 303, r.body);
      assert.match(r.location ?? '', /^\/staff\/finance\/[A-Za-z0-9-]+\?saved=break-fee$/);
      const page = await admin.req(r.location ?? '');
      assert.equal(page.status, 200);
      assert.match(page.body, /The break fee invoice is raised by hand/);
      assert.match(page.body, /the break fee, clause 5/);
      assert.match(page.body, /£1,200(\.00)?/);
      const bad = await admin.post(`/staff/finance/claims/${claims[0] ?? ''}/break-fee`, { amount: '995' });
      assert.match(bad.body, /already has a break fee invoice/);
    } finally { h.close(); }
  });
});
