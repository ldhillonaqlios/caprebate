/**
 * THE ALLOWANCES ON EACH EVENT — PHASE 159e, 10 October 2026.
 *
 * The stress test of 9 October 2026 (C13, C15, C17, C18; the Lockwood run, L4): the return entries showed writing-down
 * allowances only, every spend in one period, the special rate pool at 6% in every year, no small-pools write-off and no
 * structures allowance. A recent refit can take 100% in year one. Lakhbir's target, 9 October 2026: "the highest figure
 * we can defend". So each PART of a claim — the purchase, and each piece of work since (Phase 159c) — is worked out on
 * its own, from the approved version alone:
 *
 *   ITS PERIOD (items 4, 7, 8). The route Phase 159d gave it, frozen with the version: W1 goes into the period its own
 *   date falls in; W2 into the first period whose return is still open; W3 is not claimed. Those are the periods the
 *   amendment window read, from the client's checked year end — one period source, so the window and the spreadsheet
 *   cannot disagree (C15).
 *
 *   ITS FIRST-YEAR RELIEF (item 1), ON W1 ONLY — W2 is writing-down allowances only, and an unknown route grants nothing
 *   (N4). The annual investment allowance (s.38A, £1,000,000 a period, shared across a group or related businesses)
 *   where this period's headroom is RECORDED — not for a partnership with a company partner (s.38A(3)), and not where
 *   that is not known; it goes on the special rate pool first (Rulebook I section 2, CA23084). Then, on NEW AND UNUSED
 *   plant only: a company's full expensing on the main pool and 50% first-year allowance on the special rate pool, spent
 *   from 1 April 2023 (CA23174AA); the 40% allowance on the main pool spent from 1 January 2026 (s.45U) for anyone who
 *   does not have full expensing. Work the client paid for is new plant (OUR READING); a purchase is second-hand, unless
 *   the building was bought new and never used from its developer (OUR READING; BOUGHT_NEW_FROM_DEVELOPER). The
 *   super-deduction (2021 to 2023) needs a contract signed after 3 March 2021, which nothing records, so it is named and
 *   not taken. A RE-DERIVED PREMISE (standing instruction step 8): the phase prompt said a second-hand purchase takes
 *   writing-down allowances only. The annual investment allowance is not limited to new plant (Rulebook I section 2:
 *   "virtually all plant and machinery qualifying expenditure"), so a W1 purchase takes it where headroom is recorded;
 *   only full expensing and the first-year allowances are barred to it. Put to the tax adviser (Word question 257).
 *
 *   THE STRUCTURES AND BUILDINGS ALLOWANCE (item 2). Work: the part of the work that is neither plant nor repair (the
 *   final account less the plant and the repair part), on work dated wholly from November 2018 — its date standing for
 *   its contract date, which must be from 29 October 2018 (OUR READING) — from the month after the work, at the engine's
 *   dated rate (2% before April 2020, 3% after). A purchase from 29 October 2018: from the seller's allowance statement
 *   (s.270IA; SBA_STATEMENT_HELD and SBA_QUALIFYING_EXPENDITURE), from the purchase date. None on a dwelling — supported
 *   living homes (s.270CF); care homes, surgeries and hospitals are not residential use (s.270CF(3)). W2: from the
 *   first open period; the years before are lost, not carried. Word question 259.
 *
 *   THE POOLS (item 3). The writing-down rates are the engine's dated table (CB_RATES: 8% special rate before April
 *   2019, 20% main before April 2012, 14% from April 2026, blended across a change), and a pool of £1,000 or less is
 *   written off in full (s.56A). Worked in whole pence: every row adds up.
 *
 * NOTHING HERE STATES A RATE. Every rate and date comes from the engine (Rulebook I rule 7.1).
 */
import { BENEFIT, RATES } from './engine.ts';
import type { Snapshot } from './pack-approve.ts';

export const RETURN_YEARS = 5;
/** The longest run of returns a version can show — a guard, not a rule. */
const MAX_RETURNS = 40;

/** What the claim records that the allowances turn on, as it stood when the spreadsheet was sent (Phase 159a, C29). */
export type AllowanceFacts = {
  /** The claimant type as recorded (COMPANY, SOLE_TRADER, ...), or null. */
  readonly claimant: string | null;
  /** A partnership or LLP with a company partner or member; null where not known or not a partnership. */
  readonly company_member: boolean | null;
  readonly cash_basis: 'CASH' | 'ACCRUALS' | null;
  /** This period's annual investment allowance headroom as recorded, in pence; 0 where recorded as none; null not known. */
  readonly aia_headroom_pence: number | null;
  readonly new_from_developer: boolean | null;
  readonly sba_statement: boolean | null;
  readonly sba_purchase_pence: number | null;
  /** The purchase's day, where known. */
  readonly purchase_date: string | null;
  /** True for a building of homes (supported living), false otherwise; null where the sector is not known. */
  readonly residential: boolean | null;
};

export const NO_FACTS: AllowanceFacts = Object.freeze({
  claimant: null, company_member: null, cash_basis: null, aia_headroom_pence: null, new_from_developer: null,
  sba_statement: null, sba_purchase_pence: null, purchase_date: null, residential: null,
});

export type Period = { readonly start: string; readonly end: string };
export type PoolName = 'Main pool' | 'Special rate pool';
export type Relief = { readonly name: string; readonly pool: PoolName; readonly pence: number; readonly how: string };

export type PartResult = {
  /** "the purchase", "A refurbishment or refit, 2025", or null for a claim with no events (one part, no label). */
  readonly what: string | null;
  readonly kind: string;
  readonly route: string | null;
  readonly route_words: string | null;
  readonly claimed: boolean;
  /** Why it is not claimed, where it is not. */
  readonly not_claimed_why: string | null;
  /** The period it goes into, or null where that is not known. */
  readonly entry: Period | null;
  readonly entry_index: number;
  readonly main_pence: number | null;
  readonly special_pence: number | null;
  readonly reliefs: readonly Relief[];
  /** Why no (more) first-year relief, in plain words. */
  readonly no_relief_why: readonly string[];
  readonly to_pool_now: { readonly main: number; readonly special: number };
  readonly to_pool_next: { readonly main: number; readonly special: number };
  readonly sba: { readonly base_pence: number | null; readonly from: string | null; readonly applies: boolean | null; readonly why: string; readonly by_return: readonly (number | null)[] };
};

export type PeriodResult = {
  readonly index: number;
  readonly period: Period | null;
  readonly label: string;
  readonly first_year_pence: number;
  readonly pools: Readonly<Record<PoolName, { readonly brought_in: number | null; readonly wda: number | null; readonly rate: number | null; readonly small: boolean; readonly cf: number | null }>>;
  readonly sba_pence: number | null;
  /** Every allowance in this return: first-year reliefs, both writing-down allowances and the structures allowance. */
  readonly total_pence: number | null;
};

export type Allowances = {
  readonly parts: readonly PartResult[];
  readonly periods: readonly PeriodResult[];
  /** Why the main pool's figures are missing, where they are. */
  readonly main_missing: string;
};

type RoutesIn = { label?: string; route?: string; words?: string; event_id?: string | null; kind?: string; event_date?: string | null;
  period?: Period | null; first_open?: (Period & { deadline?: string }) | null }[];
type EventsIn = { purchase_applies: boolean; purchase_w3?: boolean;
  purchase: { main_pool_pence: number | null; special_pool_pence: number | null } | null;
  works: { event_id?: string; kind?: string; event_date?: string | null; label: string; inputs?: Record<string, number | null>;
    qualifying_pence?: number | null; main_pool_pence: number | null; special_pool_pence: number | null; repairs_pence?: number | null }[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const R = RATES as {
  hybridMainRate: (s: string, e: string, co: boolean) => number | null;
  specialRate: (s: string, e: string, co: boolean) => number | null;
  sbaRate: (s: string, e: string, co: boolean) => number | null;
  WDA: { special: number };
  FIRST_YEAR: { aia_limit: number; full_expensing: number; fya_special: number; fya_new: number };
  FE_FROM: string; FYA_NEW_FROM: string; SMALL_POOL_LIMIT: number;
  SBA: { from: string }; SUPER_DEDUCTION: { from: string; to: string; contract_from: string };
};
const B = BENEFIT as { endOf: (s: string) => string | null; nextStart: (s: string) => string | null };

export const pounds = (p: number): string => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: p % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const pct = (r: number) => `${String(Math.round(r * 10000) / 100)}%`;

/** "2025-06" or "2025" as its first and last day; a day as itself. */
function span(d: string | null): Period | null {
  if (d === null) return null;
  if (ISO.test(d)) return { start: d, end: d };
  if (/^\d{4}$/.test(d)) return { start: `${d}-01-01`, end: `${d}-12-31` };
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  if (m === null) return null;
  return { start: `${d}-01`, end: new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10) };
}
const dayAfter = (iso: string): string => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const days = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Does a claimant type file a company return? null where not known. */
export function isCompanyType(t: string | null): boolean | null {
  return t === 'COMPANY' || t === 'CHARITY_COMPANY' ? true
    : t !== null && ['LLP', 'PARTNERSHIP', 'SOLE_TRADER', 'INDIVIDUAL', 'CHARITABLE_TRUST'].includes(t) ? false : null;
}

/** The periods the returns run over: from the earliest part's period, each the twelve months after the last. */
function periodsFrom(first: Period | null, count: number): (Period | null)[] {
  const out: (Period | null)[] = [];
  let p = first;
  for (let i = 0; i < count; i++) {
    out.push(p);
    if (p === null) continue;
    const s = dayAfter(p.end);
    const e = B.endOf(s);
    p = e === null ? null : { start: s, end: e };
  }
  return out;
}

/** The allowances for one approved version. `period_start` and `is_company` are the claim's, as the return entries read
 *  them (one source: src/web/claim-route.ts purchasePeriod); `facts` as they stood when it was sent. */
export function allowancesFor(s: Snapshot, ctx: { period_start: string | null; is_company: boolean | null; facts?: AllowanceFacts | null }): Allowances {
  const facts = ctx.facts ?? NO_FACTS;
  const isCo = ctx.is_company;
  const routes = ((s as { routes?: RoutesIn }).routes ?? []) as RoutesIn;
  const ev = (s as { events?: EventsIn }).events;
  const sector = (s as { job?: { sector?: string | null } }).job?.sector ?? null;
  const residential = facts.residential ?? (sector === null ? null : sector === 'supported_living');

  // 1 · THE PARTS, each with its route as frozen at approval.
  type Raw = { what: string | null; kind: string; event_id: string | null; date: string | null; main: number | null; special: number | null;
    sba_base: number | null; sba_inputs_known: boolean };
  const raws: Raw[] = [];
  const purchaseRoute = routes.find((r) => r.kind === 'PURCHASE' || r.event_id === null || r.event_id === undefined) ?? routes[0];
  if (ev === undefined) {
    raws.push({ what: null, kind: 'PURCHASE', event_id: null, date: purchaseRoute?.event_date ?? facts.purchase_date,
      main: s.sums.main_pool_pence ?? 0, special: s.sums.special_pool_pence ?? 0, sba_base: null, sba_inputs_known: true });
  } else {
    if (ev.purchase_applies && ev.purchase !== null) {
      raws.push({ what: 'the purchase', kind: 'PURCHASE', event_id: null, date: purchaseRoute?.event_date ?? facts.purchase_date,
        main: ev.purchase.main_pool_pence, special: ev.purchase.special_pool_pence, sba_base: null, sba_inputs_known: true });
    }
    for (const w of ev.works) {
      const total = w.inputs?.['works_total'] ?? null;
      const known = typeof total === 'number' && typeof w.qualifying_pence === 'number' && typeof w.repairs_pence === 'number';
      raws.push({ what: w.label, kind: w.kind ?? 'OTHER', event_id: w.event_id ?? null, date: w.event_date ?? null,
        main: w.main_pool_pence, special: w.special_pool_pence,
        sba_base: known ? Math.max(0, (total as number) - (w.qualifying_pence as number) - (w.repairs_pence as number)) : null, sba_inputs_known: known });
    }
  }
  const routeOf = (r: Raw) => r.kind === 'PURCHASE' ? purchaseRoute : routes.find((x) => x.event_id !== undefined && x.event_id !== null && x.event_id === r.event_id);

  // 2 · EACH PART'S PERIOD: W1 its own, W2 the first open one.
  const entries = raws.map((r) => {
    const rt = routeOf(r);
    const route = rt?.route ?? null;
    const own = rt?.period !== undefined && rt.period !== null && ISO.test(rt.period.start) && ISO.test(rt.period.end) ? rt.period : null;
    const fo = rt?.first_open !== undefined && rt.first_open !== null ? { start: rt.first_open.start, end: rt.first_open.end } : null;
    const entry = route === 'W2' ? fo : own;
    return { rt, route, entry };
  });
  const known = entries.map((e) => e.entry).filter((p): p is Period => p !== null).sort((a, b) => a.start.localeCompare(b.start));
  const legacyStart = ctx.period_start !== null && ISO.test(ctx.period_start) ? ctx.period_start : null;
  const first: Period | null = known[0] ?? (legacyStart === null ? null : (() => { const e = B.endOf(legacyStart); return e === null ? null : { start: legacyStart, end: e }; })());
  const indexOf = (p: Period | null): number => {
    if (p === null || first === null) return 0;
    const ps = periodsFrom(first, MAX_RETURNS);
    const i = ps.findIndex((x) => x !== null && x.start <= p.start && p.start <= x.end);
    return i < 0 ? 0 : i;
  };
  const lastIndex = Math.max(0, ...entries.map((e) => indexOf(e.entry)));
  const count = Math.min(MAX_RETURNS, Math.max(RETURN_YEARS, lastIndex + 2));
  const periods = periodsFrom(first, count);

  // 3 · FIRST-YEAR RELIEF, PART BY PART, sharing each period's annual investment allowance.
  const aiaLeft = new Map<number, number>();
  const aiaCap = R.FIRST_YEAR.aia_limit * 100;
  const parts: PartResult[] = raws.map((r, k) => {
    const { route, entry, rt } = entries[k]!;
    const idx = entry === null ? 0 : indexOf(entry);
    const main = r.main, special = r.special;
    const reliefs: Relief[] = [];
    const why: string[] = [];
    let mNow = main ?? 0, sNow = special ?? 0, mNext = 0, sNext = 0;
    const cash = facts.cash_basis === 'CASH' && isCo !== true;
    const claimed = route !== 'W3' && !cash;
    const notClaimedWhy = !claimed ? (cash ? 'The accounts are on the cash basis: no claim on fixtures for the period.' : (rt?.words ?? 'Not claimed.')) : null;
    const date = span(r.date);
    const newPlant = r.kind !== 'PURCHASE' || facts.new_from_developer === true;
    if (claimed) {
      if (route !== 'W1') {
        why.push(route === 'W2' ? 'Its own year’s return is closed, so it goes into the first open year’s pool: writing-down allowances only.'
          : 'How it goes in is not settled, so no first-year relief is counted.');
      } else {
        // The annual investment allowance: recorded headroom, a known claimant, and not a partnership with a company partner.
        const partnership = facts.claimant === 'LLP' || facts.claimant === 'PARTNERSHIP';
        if (isCo === null) why.push('We do not know if the client is a company, so no first-year relief is counted.');
        else if (partnership && facts.company_member !== false) {
          why.push(facts.company_member === true ? 'With a company as a partner, there is no annual investment allowance (s.38A(3)).'
            : 'We do not know if any partner is a company. With a company as a partner, there is no annual investment allowance. So none is counted.');
        } else if (date !== null && date.start < '2019-01-01') {
          why.push('The annual investment allowance limit before 2019 is not worked out here, so none is counted.');
        } else if (facts.aia_headroom_pence === null) {
          why.push(`The annual investment allowance is not counted: record how much of this year’s ${pounds(aiaCap)} is left. It is shared across a group or related businesses.`);
        } else {
          let left = aiaLeft.has(idx) ? aiaLeft.get(idx)! : Math.min(facts.aia_headroom_pence, aiaCap);
          if (left <= 0) why.push('No annual investment allowance is left this year, as recorded.');
          const take = (pool: PoolName, have: number): number => {
            const t = Math.min(left, have);
            if (t > 0) {
              left -= t;
              reliefs.push({ name: 'Annual investment allowance', pool, pence: t,
                how: `100% of ${pounds(t)}, from this year’s limit of ${pounds(aiaCap)} (${pounds(Math.min(facts.aia_headroom_pence ?? 0, aiaCap))} recorded as left, shared across a group or related businesses). Set against the special rate pool first.` });
            }
            return t;
          };
          sNow -= take('Special rate pool', sNow);
          // A company's new main pool plant from April 2023 has full expensing, so the shared headroom is not spent on it.
          const feCovers = isCo === true && newPlant && date !== null && date.start >= R.FE_FROM;
          if (!feCovers) mNow -= take('Main pool', mNow);
          aiaLeft.set(idx, left);
        }
        // New and unused plant: full expensing and the first-year allowances.
        if (isCo !== null) {
          if (!newPlant) why.push('A purchase is second-hand. So full expensing and the first-year allowances do not apply. Only a building bought new and never used from its developer is different.');
          else if (date === null) why.push('The date of the spend is not known, so full expensing and the first-year allowances are not counted.');
          else if (isCo && date.start >= R.FE_FROM) {
            if (mNow > 0) { reliefs.push({ name: 'Full expensing', pool: 'Main pool', pence: mNow, how: `100% of ${pounds(mNow)} of new main pool plant: a company, spent from 1 April 2023.` }); mNow = 0; }
            if (sNow > 0) {
              const half = Math.round(sNow * R.FIRST_YEAR.fya_special);
              reliefs.push({ name: 'First-year allowance at 50%', pool: 'Special rate pool', pence: half, how: `50% of ${pounds(sNow)} of new special rate plant: a company, spent from 1 April 2023. The rest goes into the pool next year.` });
              sNext = sNow - half; sNow = 0;
            }
          } else if (date.start >= R.FYA_NEW_FROM) {
            if (mNow > 0) {
              const forty = Math.round(mNow * R.FIRST_YEAR.fya_new);
              reliefs.push({ name: 'First-year allowance at 40%', pool: 'Main pool', pence: forty, how: `40% of ${pounds(mNow)} of new main pool plant, spent from 1 January 2026 (s.45U). The rest goes into the pool next year.` });
              mNext = mNow - forty; mNow = 0;
            }
          } else if (isCo && date.start >= R.SUPER_DEDUCTION.from && date.end <= R.SUPER_DEDUCTION.to) {
            why.push('The super-deduction (130%) needs a contract signed after 3 March 2021. That is not recorded, so writing-down allowances are shown.');
          } else {
            why.push(isCo ? 'Full expensing starts with spend from 1 April 2023, so this spend gets writing-down allowances.'
              : 'Full expensing is for companies only, and the 40% allowance starts with spend from 1 January 2026.');
          }
        }
      }
    }
    const sba = sbaOf(r, route, claimed, idx, entry, facts, residential, isCo, periods);
    return {
      what: r.what, kind: r.kind, route, route_words: rt?.words ?? null, claimed, not_claimed_why: notClaimedWhy,
      entry: entry ?? (idx === 0 ? periods[0] ?? null : null), entry_index: idx, main_pence: main, special_pence: special,
      reliefs: claimed ? reliefs : [], no_relief_why: why,
      to_pool_now: claimed ? { main: mNow, special: sNow } : { main: 0, special: 0 },
      to_pool_next: claimed ? { main: mNext, special: sNext } : { main: 0, special: 0 },
      sba,
    };
  });

  // 4 · THE POOLS, period by period, under each reading of the claimant where it is not known.
  const readings = isCo === null ? [true, false] : [isCo];
  const rateAt = (pool: PoolName, i: number): number => {
    const p = periods[i] ?? null;
    const rs = readings.map((co) => p === null ? (pool === 'Special rate pool' ? R.WDA.special : Number.NaN)
      : (pool === 'Main pool' ? R.hybridMainRate(p.start, p.end, co) : R.specialRate(p.start, p.end, co)) ?? Number.NaN);
    const r0 = rs[0] ?? Number.NaN;
    return rs.every((r) => Number.isFinite(r) && Math.abs(r - r0) < 1e-9) ? r0 : Number.NaN;
  };
  const claimedParts = parts.filter((p) => p.claimed);
  const run = (pool: PoolName) => {
    const key = pool === 'Main pool' ? 'main' : 'special';
    let bal = 0, broken = false;
    return periods.map((_p, i) => {
      const inNow = claimedParts.filter((p) => p.entry_index === i).reduce((a, p) => a + p.to_pool_now[key], 0);
      const inNext = claimedParts.filter((p) => p.entry_index === i - 1).reduce((a, p) => a + p.to_pool_next[key], 0);
      const brought = inNow + inNext;
      const rate = rateAt(pool, i);
      if (broken || !Number.isFinite(rate)) { broken = true; return { brought_in: brought, wda: null, rate: null, small: false, cf: null }; }
      const pool_ = bal + brought;
      const small = pool_ > 0 && pool_ <= R.SMALL_POOL_LIMIT * 100;
      const wda = small ? pool_ : Math.round(pool_ * rate);
      bal = pool_ - wda;
      return { brought_in: brought, wda, rate, small, cf: bal };
    });
  };
  const mainRun = run('Main pool'), specialRun = run('Special rate pool');
  const out: PeriodResult[] = periods.map((p, i) => {
    const fy = claimedParts.filter((x) => x.entry_index === i).reduce((a, x) => a + x.reliefs.reduce((b, r) => b + r.pence, 0), 0);
    const sbas = parts.map((x) => x.sba.by_return[i] ?? 0);
    const sbaUnknown = parts.some((x) => x.sba.by_return[i] === null);
    const sba = sbaUnknown ? null : sbas.reduce((a, b) => a + (b ?? 0), 0);
    const m = mainRun[i]!, sp = specialRun[i]!;
    const total = m.wda === null || sp.wda === null || sba === null ? null : fy + m.wda + sp.wda + sba;
    return {
      index: i, period: p,
      label: p !== null ? `${p.start} to ${p.end}` : i === 0 ? 'the accounting period the spend falls in (not recorded yet)' : `the accounting period ${String(i)} after that`,
      first_year_pence: fy, pools: { 'Main pool': m, 'Special rate pool': sp }, sba_pence: sba, total_pence: total,
    };
  });
  const main_missing = first === null ? 'The accounting period is not on the claim yet. The main pool rate depends on it.'
    : 'We do not know if the client is a company. A company and a person get a different rate here.';
  return { parts, periods: out, main_missing };
}

/** The structures and buildings allowance on one part, return by return. */
function sbaOf(r: { kind: string; date: string | null; sba_base: number | null; sba_inputs_known: boolean }, route: string | null, claimed: boolean,
  idx: number, entry: Period | null, facts: AllowanceFacts, residential: boolean | null, isCo: boolean | null, periods: readonly (Period | null)[]):
  PartResult['sba'] {
  const none = (applies: boolean | null, why: string, base: number | null = null, from: string | null = null) =>
    ({ base_pence: base, from, applies, why, by_return: periods.map(() => (applies === null ? null : 0)) as (number | null)[] });
  if (!claimed) return none(false, 'Not claimed.');
  if (residential === true) return none(false, 'Homes are a dwelling, so there is no structures and buildings allowance on them (s.270CF).');
  const d = span(r.date);
  let base: number | null;
  let from: string | null;
  if (r.kind === 'PURCHASE') {
    if (d === null) return none(null, 'The purchase date is not known, so the structures allowance is not worked out.');
    if (d.start < R.SBA.from) return none(false, 'Bought before 29 October 2018: no structures allowance comes with it.');
    if (facts.sba_statement === false) return none(false, 'The seller has no allowance statement, as recorded: no structures allowance comes with the purchase. One is only due on building work under a contract from 29 October 2018.');
    if (facts.sba_statement !== true || facts.sba_purchase_pence === null) {
      return none(null, 'Bought after 29 October 2018: the seller’s allowance statement (s.270IA) gives the figure. Ask for it and record it.');
    }
    base = facts.sba_purchase_pence; from = d.start;
  } else {
    if (!r.sba_inputs_known || r.sba_base === null) return none(null, 'The parts of the work are not all known, so the structures allowance is not worked out.');
    if (d === null) return none(null, 'The date of the work is not known, so the structures allowance is not worked out.');
    if (d.start < '2018-11-01') return none(false, 'Work before November 2018: its contract is before 29 October 2018, so there is no structures allowance.');
    if (r.sba_base === 0) return none(false, 'All of the work is plant or repair, so nothing is left for the structures allowance.');
    base = r.sba_base; from = dayAfter(d.end);  // from the month after the work: when it can first be used
  }
  // W2: the years before the first open one are lost. NOT_KNOWN: placed, but nothing is granted on a route not settled.
  if (route !== 'W1' && route !== 'W2' && route !== null) return none(null, 'How this part goes in is not settled, so the structures allowance is not counted yet.', base, from);
  const readings = isCo === null ? [true, false] : [isCo];
  const by = periods.map((p, i) => {
    if (i < idx) return 0;
    if (p === null) return null;
    const a = from !== null && from > p.start ? from : (i === idx && entry !== null && entry.start > p.start ? entry.start : p.start);
    if (a > p.end) return 0;
    const rs = readings.map((co) => R.sbaRate(a, p.end, co));
    const r0 = rs[0];
    if (rs.some((x) => x === null || r0 === null || r0 === undefined || Math.abs((x as number) - (r0 as number)) > 1e-9)) return null;
    return Math.round((base as number) * (r0 as number) * days(a, p.end) / days(p.start, p.end));
  });
  return { base_pence: base, from, applies: true,
    why: r.kind === 'PURCHASE'
      ? `From the seller’s allowance statement: ${pounds(base)}, from the purchase date, at 3% a year (2% before April 2020).`
      : `The building work that is not plant or repair: ${pounds(base)}, from the month after the work, at 3% a year (2% before April 2020). Its contract must be from 29 October 2018.`,
    by_return: by };
}

/** Plain words for a rate, for the "how" cells. */
export const rateWords = pct;

/** PHASE 159e (item 6): the allowances in words, for the report — per part, its route, its year, each allowance in that
 *  year and what it adds to the pool; and per year, every allowance and the pools carried on. Amounts not known say so. */
export type AllowanceWords = {
  readonly parts: readonly { readonly part: string; readonly route: string; readonly year: string; readonly reliefs: string; readonly to_pool: string; readonly sba: string }[];
  readonly years: readonly { readonly year: string; readonly first_year: string; readonly main: string; readonly special: string; readonly sba: string; readonly total: string; readonly main_cf: string; readonly special_cf: string }[];
};

const money = (p: number | null | undefined): string => (p === null || p === undefined ? 'not known yet' : pounds(p));
const ukDay = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const yearWords = (p: Period | null, fallback: string): string => (p === null ? fallback : `${ukDay(p.start)} to ${ukDay(p.end)}`);

export function allowanceWords(a: Allowances): AllowanceWords {
  const parts = a.parts.map((p) => {
    const name = p.what === null ? 'Your claim' : p.what.charAt(0).toUpperCase() + p.what.slice(1);
    if (!p.claimed) return { part: name, route: p.not_claimed_why ?? 'Not claimed.', year: '—', reliefs: '—', to_pool: '—', sba: '—' };
    const route = p.route === 'W1' ? 'Its own year’s return can still be amended.' : p.route === 'W2' ? 'Its own year’s return is closed: it goes into the first year still open.' : 'Not settled yet.';
    const reliefs = p.reliefs.length === 0 ? `None. ${p.no_relief_why[0] ?? ''}`.trim()
      : `${p.reliefs.map((r) => `${r.name} ${pounds(r.pence)}`).join('; ')}.${p.no_relief_why.length > 0 ? ` ${p.no_relief_why[0] ?? ''}` : ''}`;
    const now = p.to_pool_now.main + p.to_pool_now.special, next = p.to_pool_next.main + p.to_pool_next.special;
    const to_pool = `${pounds(now)} this year${next > 0 ? `, and ${pounds(next)} the year after` : ''}`;
    const firstSba = p.sba.by_return.find((x, i) => i >= p.entry_index && x !== 0);
    const sba = p.sba.applies === true ? `${money(firstSba ?? null)} in its first year. ${p.sba.why}` : p.sba.why;
    return { part: name, route, year: yearWords(p.entry, 'Not known yet: the year end is not recorded.'), reliefs, to_pool, sba };
  });
  const years = a.periods.map((y) => ({
    year: yearWords(y.period, y.label), first_year: pounds(y.first_year_pence),
    main: y.pools['Main pool'].small ? `${money(y.pools['Main pool'].wda)} (small pool written off)` : money(y.pools['Main pool'].wda),
    special: y.pools['Special rate pool'].small ? `${money(y.pools['Special rate pool'].wda)} (small pool written off)` : money(y.pools['Special rate pool'].wda),
    sba: money(y.sba_pence), total: money(y.total_pence), main_cf: money(y.pools['Main pool'].cf), special_cf: money(y.pools['Special rate pool'].cf),
  }));
  return { parts, years };
}
