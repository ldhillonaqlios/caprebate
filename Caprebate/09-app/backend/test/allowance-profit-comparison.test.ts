/**
 * THE WITH-AND-WITHOUT COMPARISON FOR THE ALLOWANCE AND PROFIT ANSWERS.
 * Phase 132, 14 September 2026.
 *
 * Built, run empty, switched off, and imported by no route. The tests assert
 * those four things and N4 twice: a figure nobody could compute is
 * NOT_COMPARABLE and never a zero, and an "I don't know" is counted apart from a
 * question never asked — while producing exactly the same figures, because the
 * engine must treat them alike.
 *
 * NO DIRECTION IS HARD-CODED. Where a test says a figure moved, the expected
 * sign is read off the engine's own benefit chain — CB_BENEFIT.reliefsEstablished
 * into CB_FEE.display — run in the test on both sessions.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { testApp } from './helpers.ts';
import * as C from '../src/web/crm.ts';
import { newSession, feeDisplay, estimate, BENEFIT, type Session, type SectorId, type BenefitContext } from '../src/web/engine.ts';
import { sessionFromFunnel } from '../src/web/funnel-session.ts';
import {
  ALLOWANCE_PROFIT_COMPARISON, runComparison, compareWithAndWithout, classifyFact,
  type BenefitBasis, type ComparisonReport,
} from '../src/web/allowance-profit-comparison.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-09-14T09:00:00.000Z';
const ON = { enabled: true };
const SECTOR: SectorId = 'dental';

/** A determined basis: a measured split and a known period, so the benefit is one figure, not a range. */
const BASIS: BenefitBasis = { allowances: 500_000, main: 300_000, special: 200_000, period_start: '2025-04-01', tax_rate: 0.25 };

/** A session with enough facts for the engine to run, and neither of the two facts under test. */
function session(extra: Record<string, unknown> = {}): Session {
  return {
    ...newSession(SECTOR),
    claimant_type: 'company', claimant_raw: 'company', trigger: ['purchase'], base_amount: 2_000_000,
    is_uk_taxpayer: 'yes', is_taxpayer: 'yes', return_in_time: true,
    ...extra,
  } as unknown as Session;
}

/** The engine's own year-one benefit for a session — the reading a direction is taken from. */
function engineYearOne(s: Session): number | null {
  const reliefs = (BENEFIT as { reliefsEstablished?: unknown }).reliefsEstablished as (s: unknown, dom: string) => unknown;
  const ctx = {
    main: BASIS.main, special: BASIS.special, period_start: BASIS.period_start, is_company: true,
    first_year: reliefs(s, 'purchase'),
  } as unknown as BenefitContext;
  const v = feeDisplay(BASIS.allowances ?? null, BASIS.tax_rate ?? null, ctx).comparison.year_one_benefit;
  return typeof v === 'number' ? v : null;
}

function without(s: Session, keys: readonly string[]): Session {
  const o = { ...(s as unknown as Record<string, unknown>) };
  for (const k of keys) delete o[k];
  return o as unknown as Session;
}

function engineMovement(asIs: Session, keys: readonly string[]): string {
  const a = engineYearOne(asIs);
  const b = engineYearOne(without(asIs, keys));
  if (a === null || b === null) return 'NOT_COMPARABLE';
  return a > b ? 'MOVED_UP' : a < b ? 'MOVED_DOWN' : 'UNCHANGED';
}

type EngineCash = { cash: [number | null, number | null]; cashRoute: string | null; cashBlocked: boolean };

/** CB_CASH's reading straight off the engine's estimate — the reading a cash direction is taken from. */
function engineCash(s: Session): EngineCash {
  return estimate(SECTOR, s) as unknown as EngineCash;
}

/** The cash movement the engine gives: route first, then a gate shutting or opening, then the amount. */
function engineCashMovement(asIs: Session, keys: readonly string[]): string {
  const a = engineCash(asIs);
  const b = engineCash(without(asIs, keys));
  if (a.cashRoute !== b.cashRoute) return 'ROUTE_CHANGED';
  if (a.cashBlocked !== b.cashBlocked) return a.cashBlocked ? 'SHUT' : 'OPENED';
  const [al, ah] = a.cash;
  const [bl, bh] = b.cash;
  if (al === null || ah === null || bl === null || bh === null) return 'NOT_COMPARABLE';
  const dl = al - bl;
  const dh = ah - bh;
  if (dl === 0 && dh === 0) return 'UNCHANGED';
  if (dl >= 0 && dh >= 0) return 'AMOUNT_UP';
  if (dl <= 0 && dh <= 0) return 'AMOUNT_DOWN';
  return 'AMOUNT_MIXED';
}

const CASH_COUNT: Readonly<Record<string, string>> = Object.freeze({
  ROUTE_CHANGED: 'route_changed', SHUT: 'shut', OPENED: 'opened', AMOUNT_UP: 'amount_up',
  AMOUNT_DOWN: 'amount_down', AMOUNT_MIXED: 'amount_mixed', UNCHANGED: 'unchanged', NOT_COMPARABLE: 'not_comparable',
});

const total = (counts: object): number =>
  Object.entries(counts).reduce((sum, [k, v]) => sum + (k !== 'by_state' && typeof v === 'number' ? v : 0), 0);

/* ------------------------------------------------------------------ fixtures */

function user(app: App): void {
  app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-SALES', 'sales@example.invalid', 'sales@example.invalid', 'SALES Person', 'SALES', 'x', T0, T0]);
}

let n = 0;
/** One organisation, one assessment and one claim on it. `funnel` is the stored funnel state, or none survives. */
function claimWith(app: App, funnel: Record<string, unknown> | null): { business: string; claim: string; assessment: string } {
  n += 1;
  const business = `b-apc-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Comparison ${n} Limited`, SECTOR, 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-apc-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-apc-${n}`;
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, SECTOR, T0, 100_000_00, 200_000_00, T0]);
  if (funnel !== null) {
    app.db.run(
      'INSERT INTO assessment_drafts (token,state_json,screen,created_at,updated_at,submitted_assessment_id) VALUES (?,?,?,?,?,?)',
      [`tok-apc-${n}`, JSON.stringify(funnel), 'submitted', T0, T0, assessment]);
  }
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'PLANT_AND_MACHINERY',
    stage: 'SURVEY', owner_id: null, surveyor_id: null,
  });
  return { business, claim: made.id, assessment };
}

function claimFact(app: App, claim: string, key: string, value: string | null): void {
  app.db.run(
    'INSERT INTO claim_facts (id,claim_id,fact_key,answer,value_text,source_id,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?)',
    [randomUUID(), claim, key, value === null ? 'UNKNOWN' : 'VALUE', value, 'CLIENT_ANSWER', 'u-SALES', T0]);
}

/**
 * A portal question, answered. A QUESTION carries no claim id — migration 013's
 * kind trigger refuses one — so it is tied to the claim through its organisation,
 * which is how `classifyFact` reads it (`claim_id IS NULL OR claim_id = ?`).
 */
function portalAnswer(app: App, business: string, fact_id: string, answer: string | null): void {
  app.db.run(
    'INSERT INTO client_tasks (id,business_id,question,why,holds_up,state,answer_state,answer,answered_at,answered_by_role,created_at,fact_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(), business, 'a question', 'a reason', 'the claim', 'ANSWERED',
      answer === null ? 'DONT_KNOW' : 'ANSWERED', answer, T0, 'CLIENT', T0, fact_id]);
}

const link = (app: App, claim: string) =>
  app.db.get<{ id: string; business_id: string; assessment_id: string | null }>(
    'SELECT id, business_id, assessment_id FROM claims WHERE id = ?', [claim])!;

function reportOf(app: App, basis: BenefitBasis = {}): ComparisonReport {
  const r = runComparison(app.db, ON, basis);
  assert.equal(r.ran, true);
  return (r as { ran: true; report: ComparisonReport }).report;
}

/* ================================================================== */

describe('the allowance and profit comparison — built, empty, off, and unrouted', () => {
  test('an empty database reports empty, with every count at zero', async () => {
    const app = await testApp();
    try {
      const r = reportOf(app);
      const cashZeros = {
        route_changed: 0, shut: 0, opened: 0, amount_up: 0, amount_down: 0, amount_mixed: 0, unchanged: 0, not_comparable: 0,
      };
      const zeros = {
        answered: 0, dont_know: 0, never_asked: 0, moved_up: 0, moved_down: 0, unchanged: 0, not_comparable: 0,
        cumulative: { moved_up: 0, moved_down: 0, unchanged: 0, not_comparable: 0 },
        cash: { ...cashZeros, by_state: { answered: cashZeros, dont_know: cashZeros, never_asked: cashZeros } },
      };
      assert.deepEqual(JSON.parse(JSON.stringify(r)), { empty: true, jobs: 0, by_fact: { sufficient_profit: zeros, aia_headroom: zeros } });
      assert.equal('verdict' in r, false, 'the report reached a verdict');
    } finally { app.close(); }
  });

  test('it ships off, and refuses to run while off — even on a database with claims', async () => {
    const app = await testApp();
    try {
      assert.equal(ALLOWANCE_PROFIT_COMPARISON.enabled, false);
      assert.equal(Object.isFrozen(ALLOWANCE_PROFIT_COMPARISON), true);
      assert.match(ALLOWANCE_PROFIT_COMPARISON.waits_on, /real clients answering the allowance and profit questions/);
      user(app);
      claimWith(app, { current_year_position: 'profitable' });
      const refused = runComparison(app.db);
      assert.equal(refused.ran, false);
      assert.equal('report' in refused, false, 'a refused run still produced a report');
      assert.equal(runComparison(app.db, ON).ran, true, 'the negative control: switched on, it runs');
    } finally { app.close(); }
  });

  test('N4: an “unsure” profit and a profit never asked give identical figures — but land in dont_know and never_asked respectively', async () => {
    const unsure = compareWithAndWithout(SECTOR, session({ sufficient_profit: 'unsure' }), undefined, BASIS);
    const neverAsked = compareWithAndWithout(SECTOR, session(), undefined, BASIS);
    assert.deepEqual(unsure, neverAsked, '“unsure” and never asked produced different figures');
    assert.equal(unsure.year_one_benefit.delta, 0, 'removing an “unsure” moved a figure');
    assert.equal(neverAsked.year_one_benefit.delta, 0);

    /* THE CASH READING TOO: the same route, the same block, the same figure, and a delta of 0 — not null. */
    assert.deepEqual(unsure.cash.as_is, neverAsked.cash.as_is, '“unsure” and never asked produced different cash readings');
    assert.notEqual(unsure.cash.as_is.low, null, 'precondition: a cash figure exists on this session');
    assert.equal(unsure.cash.route_changed, false, 'removing an “unsure” changed the cash route');
    assert.equal(unsure.cash.low.delta, 0, 'removing an “unsure” moved the cash figure');
    assert.equal(unsure.cash.high.delta, 0);
    assert.equal(unsure.cash.movement, engineCashMovement(session({ sufficient_profit: 'unsure' }), ['sufficient_profit', 'aia_headroom', 'aia_answer']));

    const app = await testApp();
    try {
      user(app);
      const a = claimWith(app, { current_year_position: 'unsure' });
      const b = claimWith(app, null);
      assert.equal(classifyFact(app.db, link(app, a.claim), 'sufficient_profit'), 'DONT_KNOW');
      assert.equal(classifyFact(app.db, link(app, b.claim), 'sufficient_profit'), 'NEVER_ASKED');
      const r = reportOf(app, BASIS);
      assert.equal(r.by_fact.sufficient_profit.dont_know, 1, '“unsure” was not counted as “I don’t know”');
      assert.equal(r.by_fact.sufficient_profit.never_asked, 1, 'never asked was not counted as never asked');
      assert.equal(r.by_fact.sufficient_profit.answered, 0);

      const cash = r.by_fact.sufficient_profit.cash;
      assert.equal(total(cash.by_state.dont_know), 1, 'the cash block did not count “unsure” as “I don’t know”');
      assert.equal(total(cash.by_state.never_asked), 1, 'the cash block did not count never asked as never asked');
      assert.equal(total(cash.by_state.answered), 0);
      assert.deepEqual(cash.by_state.dont_know, cash.by_state.never_asked, 'identical cash readings landed in different movements');
      assert.equal(total(cash), 2, 'a claim was not counted exactly once in the cash block');
    } finally { app.close(); }
  });

  test('every raw source of “I don’t know” is kept apart from never asked — the claim record and the portal, for both facts', async () => {
    const app = await testApp();
    try {
      user(app);
      const recordUnknown = claimWith(app, null);
      claimFact(app, recordUnknown.claim, 'SUFFICIENT_PROFIT', null);
      claimFact(app, recordUnknown.claim, 'AIA_HEADROOM', null);
      const portalUnknown = claimWith(app, null);
      portalAnswer(app, portalUnknown.business, 'cash_gate.profits', null);
      portalAnswer(app, portalUnknown.business, 'cash_gate.aiaHeadroom', null);
      const answered = claimWith(app, null);
      claimFact(app, answered.claim, 'AIA_HEADROOM', 'NONE');
      portalAnswer(app, answered.business, 'cash_gate.profits', 'comfortably profitable');
      const nothing = claimWith(app, null);

      for (const fact of ['sufficient_profit', 'aia_headroom'] as const) {
        assert.equal(classifyFact(app.db, link(app, recordUnknown.claim), fact), 'DONT_KNOW', `claim record UNKNOWN on ${fact}`);
        assert.equal(classifyFact(app.db, link(app, portalUnknown.claim), fact), 'DONT_KNOW', `portal DONT_KNOW on ${fact}`);
        assert.equal(classifyFact(app.db, link(app, answered.claim), fact), 'ANSWERED', `an answer on ${fact}`);
        assert.equal(classifyFact(app.db, link(app, nothing.claim), fact), 'NEVER_ASKED', `no row on ${fact}`);
      }
      const r = reportOf(app);
      for (const fact of ['sufficient_profit', 'aia_headroom'] as const) {
        assert.deepEqual([r.by_fact[fact].answered, r.by_fact[fact].dont_know, r.by_fact[fact].never_asked], [1, 2, 1], fact);
      }
    } finally { app.close(); }
  });

  test('“yes” against absent: the movement is the one the engine gives, not a hard-coded direction', () => {
    const yes = session({ sufficient_profit: 'yes' });
    const expected = engineMovement(yes, ['sufficient_profit', 'aia_headroom', 'aia_answer']);
    const got = compareWithAndWithout(SECTOR, yes, undefined, BASIS);
    assert.equal(got.year_one_benefit.movement, expected);
    assert.equal(got.year_one_benefit.delta, (got.year_one_benefit.as_is ?? NaN) - (got.year_one_benefit.without ?? NaN));
    assert.equal(got.year_one_benefit.as_is, engineYearOne(yes), 'the module and the engine read different figures');

    /* THE MOVEMENT IS REACHABLE. A headroom the engine can use moves the benefit,
       so a comparison that only ever said UNCHANGED would be caught here. */
    const headroom = session({ aia_headroom: 250_000, aia_answer: 'known' });
    const moved = engineMovement(headroom, ['aia_headroom', 'aia_answer']);
    assert.notEqual(moved, 'UNCHANGED', 'precondition: the engine moves the benefit for a usable headroom');
    assert.equal(compareWithAndWithout(SECTOR, headroom, ['aia_headroom', 'aia_answer'], BASIS).year_one_benefit.movement, moved);
  });

  test('headroom “none” against absent: the movement is the engine’s, and it is counted against headroom', async () => {
    const none = session({ aia_headroom: 'none', aia_answer: 'none' });
    const expected = engineMovement(none, ['aia_headroom', 'aia_answer']);
    assert.equal(compareWithAndWithout(SECTOR, none, ['aia_headroom', 'aia_answer'], BASIS).year_one_benefit.movement, expected);
    assert.equal(compareWithAndWithout(SECTOR, none, undefined, BASIS).year_one_benefit.movement,
      engineMovement(none, ['sufficient_profit', 'aia_headroom', 'aia_answer']));

    const app = await testApp();
    try {
      user(app);
      const c = claimWith(app, { current_year_position: 'profitable' });
      claimFact(app, c.claim, 'AIA_HEADROOM', 'NONE');
      const r = reportOf(app, BASIS);
      const h = r.by_fact.aia_headroom;
      assert.equal(h.answered, 1);
      assert.equal(h.moved_up + h.moved_down + h.unchanged + h.not_comparable, r.jobs, 'a claim was not counted exactly once');
    } finally { app.close(); }
  });

  test('a null benefit is NOT_COMPARABLE and counted so — never a delta of zero', async () => {
    // No basis: the engine's qualifying expenditure is a range, so no single benefit figure exists.
    const cmp = compareWithAndWithout(SECTOR, session({ sufficient_profit: 'yes' }));
    assert.equal(cmp.year_one_benefit.as_is, null, 'precondition: no determined benefit without a basis');
    assert.equal(cmp.year_one_benefit.delta, null, 'a figure nobody could compute became a delta');
    assert.equal(cmp.year_one_benefit.movement, 'NOT_COMPARABLE');
    assert.equal(cmp.cumulative_benefit.delta, null);
    assert.equal(cmp.cumulative_benefit.movement, 'NOT_COMPARABLE');

    const app = await testApp();
    try {
      user(app);
      claimWith(app, { current_year_position: 'profitable' });
      claimWith(app, null);
      const r = reportOf(app);
      for (const fact of ['sufficient_profit', 'aia_headroom'] as const) {
        assert.equal(r.by_fact[fact].not_comparable, 2, `${fact}: a null benefit was not counted as not comparable`);
        assert.equal(r.by_fact[fact].unchanged, 0, `${fact}: a null benefit was counted as unchanged`);
        assert.equal(r.by_fact[fact].cumulative.not_comparable, 2);
      }
    } finally { app.close(); }
  });

  /**
   * THE FINDING, PINNED. The benefit does not read the profit answer; CB_CASH
   * does. So a profit "no" against absent moves the cash reading and leaves the
   * benefit where it was. The direction is the engine's, read in the test.
   */
  test('profit “no” against absent: the cash reading moves the way the engine says, and the benefit does not move', async () => {
    const no = session({ sufficient_profit: 'no' });
    const expected = engineCashMovement(no, ['sufficient_profit']);
    assert.notEqual(expected, 'UNCHANGED', 'precondition: the engine’s cash reading moves on a profit “no”');
    assert.notEqual(expected, 'NOT_COMPARABLE', 'precondition: the engine gives a cash reading on both sides');

    const got = compareWithAndWithout(SECTOR, no, ['sufficient_profit'], BASIS);
    assert.equal(got.cash.movement, expected);
    const eng = engineCash(no);
    assert.deepEqual([got.cash.as_is.route, got.cash.as_is.blocked, got.cash.as_is.low, got.cash.as_is.high],
      [eng.cashRoute, eng.cashBlocked, eng.cash[0], eng.cash[1]], 'the module and the engine read different cash');
    const engWithout = engineCash(without(no, ['sufficient_profit']));
    assert.deepEqual([got.cash.without.route, got.cash.without.blocked, got.cash.without.low, got.cash.without.high],
      [engWithout.cashRoute, engWithout.cashBlocked, engWithout.cash[0], engWithout.cash[1]]);
    assert.equal(got.cash.route_changed, eng.cashRoute !== engWithout.cashRoute);
    for (const end of ['low', 'high'] as const) {
      const f = got.cash[end];
      assert.equal(f.delta, f.as_is === null || f.without === null ? null : f.as_is - f.without, `${end}: a null cash figure became a delta`);
    }

    // …and the benefit does not.
    assert.equal(engineMovement(no, ['sufficient_profit']), 'UNCHANGED', 'precondition: the engine’s benefit does not read the profit answer');
    assert.equal(got.year_one_benefit.movement, 'UNCHANGED');
    assert.equal(got.year_one_benefit.delta, 0);
    assert.equal(got.cumulative_benefit.movement, 'UNCHANGED');

    // Headroom "none" is the same shape on gate 2.
    const none = session({ aia_headroom: 'none', aia_answer: 'none' });
    assert.equal(compareWithAndWithout(SECTOR, none, ['aia_headroom', 'aia_answer'], BASIS).cash.movement,
      engineCashMovement(none, ['aia_headroom', 'aia_answer']));

    // On a real claim, through the runner: a company that bought, whose funnel said loss-making.
    const funnel = { current_year_position: 'loss', is_uk_taxpayer: 'yes', properties: [{ entity_type: 'ltd', trigger: 'purchase', spend: 2_000_000 }] };
    const mapped = sessionFromFunnel(SECTOR, funnel as never).session;
    assert.equal((mapped as unknown as Record<string, unknown>)['claimant_type'], 'company', 'precondition: a company session');
    assert.equal((mapped as unknown as Record<string, unknown>)['sufficient_profit'], 'no', 'precondition: the funnel’s loss is profit “no”');
    const claimExpected = engineCashMovement(mapped, ['sufficient_profit']);
    assert.notEqual(claimExpected, 'UNCHANGED');
    assert.notEqual(claimExpected, 'NOT_COMPARABLE');

    const app = await testApp();
    try {
      user(app);
      claimWith(app, funnel);
      const r = reportOf(app, BASIS);
      const p = r.by_fact.sufficient_profit;
      const key = CASH_COUNT[claimExpected] as keyof typeof p.cash.by_state.answered;
      assert.equal(p.answered, 1);
      assert.equal(p.cash[key], 1, `the cash block did not count the claim as ${claimExpected}`);
      assert.equal(p.cash.by_state.answered[key], 1);
      assert.equal(total(p.cash), 1, 'a claim was not counted exactly once in the cash block');
      assert.equal(p.moved_up + p.moved_down, 0, 'the benefit moved on a profit answer');
      assert.equal(p.unchanged, 1);
    } finally { app.close(); }
  });

  test('a null cash reading is NOT_COMPARABLE and counted so — never a delta of zero', async () => {
    // No return-in-time answer and no year end: no route, so the engine gives no cash figure either side.
    const noRoute = without(session({ sufficient_profit: 'yes' }), ['return_in_time']);
    const eng = engineCash(noRoute);
    assert.deepEqual([eng.cash[0], eng.cash[1]], [null, null], 'precondition: no cash figure without a route');
    assert.equal(eng.cashBlocked, false, 'precondition: not a shut gate');
    const cmp = compareWithAndWithout(SECTOR, noRoute, ['sufficient_profit'], BASIS);
    assert.equal(cmp.cash.movement, 'NOT_COMPARABLE');
    assert.equal(cmp.cash.low.delta, null, 'a cash figure nobody could compute became a delta');
    assert.equal(cmp.cash.high.delta, null);
    assert.equal(cmp.cash.low.movement, 'NOT_COMPARABLE');

    const app = await testApp();
    try {
      user(app);
      claimWith(app, { current_year_position: 'profitable' });
      claimWith(app, null);
      const r = reportOf(app, BASIS);
      for (const fact of ['sufficient_profit', 'aia_headroom'] as const) {
        const c = r.by_fact[fact].cash;
        assert.equal(c.not_comparable, 2, `${fact}: a null cash reading was not counted as not comparable`);
        assert.equal(c.unchanged, 0, `${fact}: a null cash reading was counted as unchanged`);
        assert.equal(total(c), 2);
      }
    } finally { app.close(); }
  });

  /**
   * NOTHING UNDER src CAN RUN IT. Phase 132, 14 September 2026.
   *
   * WHAT IS ALLOWED, AND WHY THE SCAN IS NOT "NO MENTION AT ALL". Another Phase 132
   * workstream's src/web/case-stamp.ts imports `ALLOWANCE_PROFIT_COMPARISON` — the
   * frozen switch object — to list every switch and its position, and that file is
   * reached from the claim record. Reading a switch's position runs nothing. So the
   * scan permits an import of that one name and refuses everything else: an import
   * of any other name from this module, and any call to the three functions that
   * do the work.
   */
  test('no file under src can run the comparison — at most the switch position is read', () => {
    const SRC = fileURLToPath(new URL('../src/', import.meta.url));
    const importsOther: string[] = [];
    const calls: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.ts') || e.name === 'allowance-profit-comparison.ts') continue;
        const src = readFileSync(p, 'utf8');
        for (const m of src.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*allowance-profit-comparison(\.ts)?['"]/g)) {
          const names = (m[2] ?? '').split(',').map((x) => x.trim().replace(/^type\s+/, '')).filter(Boolean);
          if (names.some((x) => x !== 'ALLOWANCE_PROFIT_COMPARISON')) importsOther.push(`${p.slice(SRC.length)}: ${names.join(', ')}`);
        }
        if (/import\s+\*\s+as\s+\w+\s+from\s*['"][^'"]*allowance-profit-comparison/.test(src)) importsOther.push(`${p.slice(SRC.length)}: * as`);
        if (/\b(runComparison|compareWithAndWithout|classifyFact)\s*\(/.test(src)) calls.push(p.slice(SRC.length));
      }
    };
    walk(SRC);
    assert.deepEqual(importsOther, [], 'a src file imports more of the comparison than its switch');
    assert.deepEqual(calls, [], 'a src file calls the comparison');
  });
});
