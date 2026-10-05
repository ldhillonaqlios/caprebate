/**
 * THE WITH-AND-WITHOUT COMPARISON FOR THE ALLOWANCE AND PROFIT ANSWERS — built,
 * run empty, and switched off. Phase 132, 14 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT IS FOR
 *
 * Two facts the engine reads and the six screens barely collect: whether the
 * business has enough taxable profit (`sufficient_profit`, CB_CASH gate 1) and
 * how much Annual Investment Allowance headroom is left (`aia_headroom` and its
 * `aia_answer`, CB_CASH gate 2 and CB_BENEFIT.reliefsEstablished). Before anyone
 * decides those questions are worth asking every client, somebody will want to
 * know what the answers did to the figures a client is shown. This measures it:
 * each claim's estimate run as it stands, and again with the two facts removed.
 *
 * IT REPORTS COUNTS AND NO VERDICT. There is no "worth asking" and no threshold.
 * On no real clients it has nothing to say, and it says that — `empty: true`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT FOUND BEFORE ANY CLIENT, MEASURED RATHER THAN ASSUMED
 *
 * The engine's two BENEFIT figures — year-one and cumulative, from CB_BENEFIT
 * through CB_FEE.display — do not read `sufficient_profit` at all, and read
 * `aia_headroom` only as a NUMBER. "yes", "no", "unsure" and absent profit give
 * the same benefit; "none", "unsure" and absent headroom give the same benefit;
 * only the cash gates move. And on a real case the benefit is a RANGE (the pool
 * split and the period are unknown), so `year_one_benefit` comes back null and
 * the comparison is NOT_COMPARABLE rather than a zero. So today every claim
 * would land in `not_comparable` or `unchanged`. That is the true state, and it
 * is the reason this ships off: it measures nothing until the questions are
 * asked of real clients and a determined figure exists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SO THE CASH READING IS COMPARED TOO. Phase 132, later the same day.
 *
 * A comparison of the benefit alone would report "unchanged" for every answer
 * and mislead the measurement. What the two answers move is CB_CASH's reading,
 * which reaches the back end the way every other engine reading does — the
 * `estimate()` result, as `unestablishedGates` in engaged.ts reads its
 * `cashGates`: `cashRoute` (Rulebook A's W1–W4, or null for none established),
 * `cashBlocked` (a gate KNOWN to be shut), and `cash` (the [low, high] near-term
 * figure, null where not established). Nothing here re-computes a gate.
 *
 * MEASURED ON THE ENGINE, not assumed: neither answer moves the route (the
 * route turns on the amendment window and ownership) or the size of the figure
 * (it is the tax saving). Profit "no" and headroom "none" SHUT a gate, and the
 * cash figure goes from a range to null on the same route. That is not a null
 * anybody failed to compute — the engine says `cashBlocked` — so it is counted
 * as SHUT, apart from NOT_COMPARABLE, and its delta is still null, never 0.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * N4, TWICE
 *
 * A NULL ON EITHER SIDE IS NOT_COMPARABLE, NEVER A DELTA OF 0. A zero would say
 * "the answer made no difference", which a figure nobody could compute cannot
 * say.
 *
 * "I DON'T KNOW" IS COUNTED APART FROM "NEVER ASKED" — AND IT IS READ FROM THE
 * RAW ROWS, NEVER FROM THE SESSION. `known()` in funnel-session.ts merges the
 * two on purpose, because the ENGINE must treat them identically; a session
 * therefore cannot tell them apart and this file does not try to read one out
 * of it. The classification reads the funnel's stored answer, the claim's
 * `claim_facts` rows and the portal's `client_tasks` rows directly.
 *
 * NO ROUTE IMPORTS THIS FILE. A test scans src/ for that.
 */

import type { Db } from '../db.ts';
import {
  estimate, feeDisplay, BENEFIT, clientVatFromWorks,
  type SectorId, type Session, type BenefitContext, type EngineResult,
} from './engine.ts';
import { funnelStateFor, sessionFromFunnel } from './funnel-session.ts';

/* ================================================================== *
 * THE SWITCH
 * ================================================================== */

export type ComparisonSwitches = { readonly enabled: boolean };

/** SHIPPED OFF. `runComparison` refuses while it is, unless a switch is passed. */
export const ALLOWANCE_PROFIT_COMPARISON = Object.freeze({
  enabled: false,
  waits_on: 'real clients answering the allowance and profit questions',
});

/* ================================================================== *
 * ONE SESSION, WITH AND WITHOUT
 * ================================================================== */

/** The session keys the two facts live under, as the engine reads them. */
export const FACT_KEYS: Readonly<Record<FactName, readonly string[]>> = Object.freeze({
  sufficient_profit: Object.freeze(['sufficient_profit']),
  aia_headroom: Object.freeze(['aia_headroom', 'aia_answer']),
});

export type FactName = 'sufficient_profit' | 'aia_headroom';

const ALL_KEYS: readonly string[] = Object.freeze(['sufficient_profit', 'aia_headroom', 'aia_answer']);

/**
 * WHAT THE BENEFIT MODEL NEEDS BEYOND THE SESSION, AND IS NOT INVENTED HERE.
 *
 * CB_FEE.display takes the allowances, a marginal tax rate and the pool split
 * and period. None of those is a session fact. The runner passes NOTHING, so
 * the allowances are the engine's qualifying expenditure only where its range
 * has collapsed to one figure, and the tax rate is never picked out of a range.
 * A caller that holds a determined basis (a test, or a future runner with the
 * surveyor's figures) passes it.
 */
export type BenefitBasis = {
  readonly allowances?: number | null;
  readonly tax_rate?: number | null;
  readonly main?: number | null;
  readonly special?: number | null;
  readonly period_start?: string | null;
  readonly profits?: number | null;
};

export type Movement = 'MOVED_UP' | 'MOVED_DOWN' | 'UNCHANGED' | 'NOT_COMPARABLE';

export type FigureComparison = {
  readonly as_is: number | null;
  readonly without: number | null;
  /** as_is − without. Null wherever either side is null — never 0 in its place. */
  readonly delta: number | null;
  readonly movement: Movement;
};

export type WithAndWithout = {
  readonly year_one_benefit: FigureComparison;
  readonly cumulative_benefit: FigureComparison;
  readonly cash: CashComparison;
};

/**
 * CB_CASH's reading on one side, as the estimate returned it. `ran: false` where
 * the engine did not run, and then every field is null: no route, no block, no figure.
 */
export type CashReading = {
  readonly ran: boolean;
  /** The engine's own route value — "W1" … "W4" — or null, none established. */
  readonly route: string | null;
  readonly blocked: boolean | null;
  readonly low: number | null;
  readonly high: number | null;
};

/**
 * One claim's cash movement. Precedence, so every claim is counted exactly once:
 * an engine that did not run either side is NOT_COMPARABLE; then a change of
 * route; then a gate that shut or opened; then the amount, where both sides
 * have one. AMOUNT_MIXED is a range whose ends moved in opposite directions.
 */
export type CashMovement =
  | 'ROUTE_CHANGED' | 'SHUT' | 'OPENED'
  | 'AMOUNT_UP' | 'AMOUNT_DOWN' | 'AMOUNT_MIXED' | 'UNCHANGED' | 'NOT_COMPARABLE';

export type CashComparison = {
  readonly as_is: CashReading;
  readonly without: CashReading;
  /** Null where either side did not run. */
  readonly route_changed: boolean | null;
  /** Signed deltas on each end of the cash range; null wherever either side is null — never 0. */
  readonly low: FigureComparison;
  readonly high: FigureComparison;
  readonly movement: CashMovement;
};

const NO_CASH: CashReading = Object.freeze({ ran: false, route: null, blocked: null, low: null, high: null });

function cashOf(result: EngineResult | null): CashReading {
  if (result === null) return NO_CASH;
  const r = result as unknown as { cash?: unknown; cashRoute?: unknown; cashBlocked?: unknown };
  const pair = Array.isArray(r.cash) ? (r.cash as unknown[]) : [];
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    ran: true,
    route: typeof r.cashRoute === 'string' ? r.cashRoute : null,
    blocked: typeof r.cashBlocked === 'boolean' ? r.cashBlocked : null,
    low: num(pair[0]),
    high: num(pair[1]),
  };
}

function compareCash(as_is: CashReading, without: CashReading): CashComparison {
  const low = compareFigure(as_is.low, without.low);
  const high = compareFigure(as_is.high, without.high);
  const ran = as_is.ran && without.ran;
  const route_changed = ran ? as_is.route !== without.route : null;
  let movement: CashMovement;
  if (!ran) movement = 'NOT_COMPARABLE';
  else if (route_changed === true) movement = 'ROUTE_CHANGED';
  else if (as_is.blocked !== null && without.blocked !== null && as_is.blocked !== without.blocked) {
    movement = as_is.blocked ? 'SHUT' : 'OPENED';
  } else if (low.delta === null || high.delta === null) movement = 'NOT_COMPARABLE';
  else if (low.delta === 0 && high.delta === 0) movement = 'UNCHANGED';
  else if (low.delta >= 0 && high.delta >= 0) movement = 'AMOUNT_UP';
  else if (low.delta <= 0 && high.delta <= 0) movement = 'AMOUNT_DOWN';
  else movement = 'AMOUNT_MIXED';
  return { as_is, without, route_changed, low, high, movement };
}

type Benefit = { readonly year_one: number | null; readonly cumulative: number | null };

const NO_BENEFIT: Benefit = Object.freeze({ year_one: null, cumulative: null });

/** One engine run. Null where the engine did not run — which is no reading at all, not a zero. */
function run(sector: SectorId, session: Session): EngineResult | null {
  try { return estimate(sector, session); } catch { return null; }
}

function benefitOf(result: EngineResult | null, session: Session, basis: BenefitBasis): Benefit {
  const s = session as unknown as Record<string, unknown>;
  if (result === null) return NO_BENEFIT;
  const qe = result.QE as unknown as readonly [number, number];
  const allowances = basis.allowances !== undefined
    ? basis.allowances
    : (Array.isArray(qe) && qe[0] === qe[1] && Number.isFinite(qe[0]) ? qe[0] : null);
  const triggers = Array.isArray(s['trigger']) ? (s['trigger'] as unknown[]) : [];
  const dom = triggers.includes('purchase') ? 'purchase' : (typeof triggers[0] === 'string' ? triggers[0] : null);
  const reliefs = (BENEFIT as { reliefsEstablished?: unknown }).reliefsEstablished as
    (s: Record<string, unknown>, dom: string | null) => unknown;
  const ctx = {
    main: basis.main ?? null,
    special: basis.special ?? null,
    period_start: basis.period_start ?? null,
    is_company: s['claimant_type'] === 'company',
    profits: basis.profits ?? null,
    first_year: reliefs(s, dom),
    /* PHASE 153b (Word question 226): what the works-VAT answer tells us about VAT on our fee — not known unless the
       same business, unchanged, answered "reclaimed in full" or "exempt". Counts for nothing while we are not VAT-registered. */
    client_vat: clientVatFromWorks(s),
  } as unknown as BenefitContext;
  const c = feeDisplay(allowances ?? null, basis.tax_rate ?? null, ctx).comparison;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { year_one: num(c.year_one_benefit), cumulative: num(c.cumulative_benefit) };
}

function compareFigure(as_is: number | null, without: number | null): FigureComparison {
  if (as_is === null || without === null) return { as_is, without, delta: null, movement: 'NOT_COMPARABLE' };
  const delta = as_is - without;
  return { as_is, without, delta, movement: delta > 0 ? 'MOVED_UP' : delta < 0 ? 'MOVED_DOWN' : 'UNCHANGED' };
}

/**
 * The estimate as the session stands, and with the allowance and profit facts
 * removed. Signed deltas for the year-one and cumulative benefit, and the cash
 * reading — route, block and amount — on both sides. One engine run per side.
 *
 * `remove` defaults to all three keys. The runner removes one fact at a time so
 * each fact's own effect is counted against that fact.
 */
export function compareWithAndWithout(
  sector: SectorId, session: Session,
  remove: readonly string[] = ALL_KEYS, basis: BenefitBasis = {},
): WithAndWithout {
  const without = { ...(session as unknown as Record<string, unknown>) };
  for (const k of remove) delete without[k];
  const ra = run(sector, session);
  const rb = run(sector, without as unknown as Session);
  const a = benefitOf(ra, session, basis);
  const b = benefitOf(rb, without as unknown as Session, basis);
  return {
    year_one_benefit: compareFigure(a.year_one, b.year_one),
    cumulative_benefit: compareFigure(a.cumulative, b.cumulative),
    cash: compareCash(cashOf(ra), cashOf(rb)),
  };
}

/* ================================================================== *
 * THE READER — ANSWERED, "I DON'T KNOW", OR NEVER ASKED, FROM THE RAW ROWS
 * ================================================================== */

export type FactState = 'ANSWERED' | 'DONT_KNOW' | 'NEVER_ASKED';

/**
 * The funnel's spellings of "I don't know".
 *
 * COPIED FROM `DONT_KNOW` in src/web/funnel-session.ts, which does not export
 * it. That file uses the set to MERGE an unknown with an absent answer before
 * the engine sees either; this file uses the same three strings to keep them
 * APART. If that list gains a spelling, this one has to gain it too.
 */
const DONT_KNOW_SPELLINGS: ReadonlySet<string> = new Set(['not sure', 'dont_know', 'unsure']);

/** The claim_facts keys that answer each fact. From FACTS in claim-facts.ts. */
const CLAIM_FACT_KEYS: Readonly<Record<FactName, readonly string[]>> = Object.freeze({
  sufficient_profit: ['SUFFICIENT_PROFIT'],
  aia_headroom: ['AIA_HEADROOM', 'AIA_HEADROOM_AMOUNT'],
});

/** The portal task ids for each fact: `cash_gate.<gate>`, as `missingFacts` in engaged.ts names them. */
const TASK_FACT_IDS: Readonly<Record<FactName, string>> = Object.freeze({
  sufficient_profit: 'cash_gate.profits',
  aia_headroom: 'cash_gate.aiaHeadroom',
});

/**
 * The funnel's own field for each fact. The profit follow-up is
 * `current_year_position`. THE SIX SCREENS DO NOT ASK ABOUT HEADROOM on any
 * path (see NOT MAPPED in funnel-session.ts), so it has no funnel field.
 */
const FUNNEL_FIELD: Readonly<Record<FactName, string | null>> = Object.freeze({
  sufficient_profit: 'current_year_position',
  aia_headroom: null,
});

type ClaimLink = { id: string; business_id: string; assessment_id: string | null };

/**
 * One fact on one claim, from every raw source.
 *
 * ANSWERED where ANY source holds an answer; otherwise DONT_KNOW where any
 * source holds an "I don't know"; otherwise NEVER_ASKED. A later answer settles
 * an earlier "I don't know", which is how the portal and the claim record
 * already read the same rows; nothing here upgrades an unknown to an answer.
 */
export function classifyFact(db: Db, claim: ClaimLink, fact: FactName): FactState {
  let answered = false;
  let dontKnow = false;

  // 1 · the claim record. The LATEST row per key is the answer (migration 015).
  for (const key of CLAIM_FACT_KEYS[fact]) {
    const row = db.get<{ answer: string }>(
      'SELECT answer FROM claim_facts WHERE claim_id = ? AND fact_key = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1',
      [claim.id, key],
    );
    if (row?.answer === 'VALUE') answered = true;
    else if (row?.answer === 'UNKNOWN') dontKnow = true;
  }

  // 2 · the portal. Only an ANSWERED task says anything; OPEN and WITHDRAWN are not answers.
  for (const t of db.all<{ answer_state: string | null }>(
    "SELECT answer_state FROM client_tasks WHERE business_id = ? AND fact_id = ? AND state = 'ANSWERED' " +
      'AND (claim_id IS NULL OR claim_id = ?)',
    [claim.business_id, TASK_FACT_IDS[fact], claim.id],
  )) {
    if (t.answer_state === 'ANSWERED') answered = true;
    else if (t.answer_state === 'DONT_KNOW') dontKnow = true;
  }

  // 3 · the funnel's stored answer, read raw — not through `known()`, which merges.
  const field = FUNNEL_FIELD[fact];
  if (field !== null && claim.assessment_id !== null) {
    const state = funnelStateFor(db, claim.assessment_id);
    const v = state?.[field];
    if (typeof v === 'string' && v.trim() !== '') {
      if (DONT_KNOW_SPELLINGS.has(v.trim())) dontKnow = true;
      else answered = true;
    }
  }

  return answered ? 'ANSWERED' : dontKnow ? 'DONT_KNOW' : 'NEVER_ASKED';
}

/* ================================================================== *
 * THE REPORT
 * ================================================================== */

export type FactCounts = {
  answered: number;
  dont_know: number;
  never_asked: number;
  /** Counted on the YEAR-ONE benefit, the figure a client is shown first. */
  moved_up: number;
  moved_down: number;
  unchanged: number;
  not_comparable: number;
  /** The same four counts on the cumulative benefit, so neither figure hides the other. */
  cumulative: { moved_up: number; moved_down: number; unchanged: number; not_comparable: number };
  /**
   * THE CASH READING, beside the benefit counts, because the benefit does not
   * read these answers and the cash does. Totals, and the same counts split by
   * how the fact stood — so "I don't know" is never folded into never asked.
   */
  cash: CashCounts & { by_state: { answered: CashCounts; dont_know: CashCounts; never_asked: CashCounts } };
};

export type CashCounts = {
  route_changed: number;
  shut: number;
  opened: number;
  amount_up: number;
  amount_down: number;
  amount_mixed: number;
  unchanged: number;
  not_comparable: number;
};

export type ComparisonReport = {
  readonly empty: boolean;
  readonly jobs: number;
  readonly by_fact: { readonly sufficient_profit: FactCounts; readonly aia_headroom: FactCounts };
};

export type ComparisonRun =
  | { readonly ran: false; readonly why: string }
  | { readonly ran: true; readonly report: ComparisonReport };

const zeroCash = (): CashCounts => ({
  route_changed: 0, shut: 0, opened: 0, amount_up: 0, amount_down: 0, amount_mixed: 0, unchanged: 0, not_comparable: 0,
});

const zero = (): FactCounts => ({
  answered: 0, dont_know: 0, never_asked: 0, moved_up: 0, moved_down: 0, unchanged: 0, not_comparable: 0,
  cumulative: { moved_up: 0, moved_down: 0, unchanged: 0, not_comparable: 0 },
  cash: { ...zeroCash(), by_state: { answered: zeroCash(), dont_know: zeroCash(), never_asked: zeroCash() } },
});

const MOVE_KEY: Readonly<Record<Movement, 'moved_up' | 'moved_down' | 'unchanged' | 'not_comparable'>> = Object.freeze({
  MOVED_UP: 'moved_up', MOVED_DOWN: 'moved_down', UNCHANGED: 'unchanged', NOT_COMPARABLE: 'not_comparable',
});

const CASH_KEY: Readonly<Record<CashMovement, keyof CashCounts>> = Object.freeze({
  ROUTE_CHANGED: 'route_changed', SHUT: 'shut', OPENED: 'opened', AMOUNT_UP: 'amount_up',
  AMOUNT_DOWN: 'amount_down', AMOUNT_MIXED: 'amount_mixed', UNCHANGED: 'unchanged', NOT_COMPARABLE: 'not_comparable',
});

const STATE_KEY: Readonly<Record<FactState, 'answered' | 'dont_know' | 'never_asked'>> = Object.freeze({
  ANSWERED: 'answered', DONT_KNOW: 'dont_know', NEVER_ASKED: 'never_asked',
});

function countCash(counts: FactCounts, state: FactState, movement: CashMovement): void {
  counts.cash[CASH_KEY[movement]]++;
  counts.cash.by_state[STATE_KEY[state]][CASH_KEY[movement]]++;
}

/**
 * Every claim, classified and compared. REFUSES while the switch is off.
 *
 * A claim with no assessment still has its facts classified — a "never asked"
 * is worth counting — and its comparison is NOT_COMPARABLE, because there is no
 * session to run the engine on.
 */
export function runComparison(
  db: Db, switches: ComparisonSwitches = ALLOWANCE_PROFIT_COMPARISON, basis: BenefitBasis = {},
): ComparisonRun {
  if (switches.enabled !== true) {
    return { ran: false, why: `switched off: waits on ${ALLOWANCE_PROFIT_COMPARISON.waits_on}` };
  }
  const claims = db.all<ClaimLink>('SELECT id, business_id, assessment_id FROM claims ORDER BY created_at, id');
  const by_fact = { sufficient_profit: zero(), aia_headroom: zero() };

  for (const claim of claims) {
    const a = claim.assessment_id === null
      ? undefined
      : db.get<{ sector: string }>('SELECT sector FROM assessments WHERE id = ?', [claim.assessment_id]);
    const session = a === undefined || claim.assessment_id === null
      ? null
      : sessionFromFunnel(a.sector as SectorId, funnelStateFor(db, claim.assessment_id)).session;

    for (const fact of ['sufficient_profit', 'aia_headroom'] as const) {
      const counts = by_fact[fact];
      const state = classifyFact(db, claim, fact);
      if (state === 'ANSWERED') counts.answered++;
      else if (state === 'DONT_KNOW') counts.dont_know++;
      else counts.never_asked++;

      if (session === null || a === undefined) {
        counts.not_comparable++;
        counts.cumulative.not_comparable++;
        countCash(counts, state, 'NOT_COMPARABLE');
        continue;
      }
      const cmp = compareWithAndWithout(a.sector as SectorId, session, FACT_KEYS[fact], basis);
      counts[MOVE_KEY[cmp.year_one_benefit.movement]]++;
      counts.cumulative[MOVE_KEY[cmp.cumulative_benefit.movement]]++;
      countCash(counts, state, cmp.cash.movement);
    }
  }

  return { ran: true, report: { empty: claims.length === 0, jobs: claims.length, by_fact } };
}
