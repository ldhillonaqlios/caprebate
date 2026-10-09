/**
 * THE BRIDGE TO @caprebate/engine.
 *
 * ONE IMPORT, IN ONE FILE. The phase brief says the application calls the
 * engine PACKAGE rather than an inlined copy, and the cheapest way to keep that
 * true is to make it structurally difficult to do anything else: everything
 * that needs a band, a gate, a question or an estimate imports from here, and
 * `grep -rn "engine/src/index.ts" src/` returns exactly one line.
 *
 * WHAT THIS FILE MAY NOT DO, and it is the whole discipline:
 *   · it may not re-implement a rule the engine already has;
 *   · it may not cache or "correct" an engine answer;
 *   · it may not set a fact the client did not give. An absent answer stays
 *     absent all the way into the estimate, because that is non-negotiable N4
 *     and the engine is written to rely on it.
 *
 * WHY THE PATH IS RELATIVE. The two packages are siblings in 09-app/ and
 * neither is published. A workspace link would be tidier and is a packaging
 * decision for the developer, not a reason to copy the engine.
 */

import { createRequire } from 'node:module';
import { localDate } from './localtime.ts';
import * as ENGINE from '../../../engine/src/index.ts';

export const {
  SECTORS, SECTOR_IDS, CB, newSession, getSector, estimate, questions,
} = ENGINE;

export type SectorId = ENGINE.SectorId;
export type Session = ENGINE.Session;
export type EngineResult = ENGINE.EngineResult;

/** The shared CB_ modules the public half uses, named so a reader can see the set. */
export const FUNNEL = CB.CB_FUNNEL;
export const FRONTDOOR = CB.CB_FRONTDOOR;
export const BAND = CB.CB_BAND;
export const BOOKING = CB.CB_BOOKING;
export const REGISTRY = CB.CB_REGISTRY;

/**
 * THE FREE-REGISTER GATE, READ RATHER THAN ASSUMED.
 *
 * `CB_REGISTRY.precondition.enabled` is false and its own `requires` text says
 * why: a published privacy notice reachable from the address question. The
 * public half must SHOW that it is shut, not work around it — so this is
 * exported for a screen to render, and there is no code anywhere in this
 * package that can turn it on.
 */
export function registryGate(): { readonly enabled: boolean; readonly requires: string } {
  const p = (REGISTRY as { precondition?: { enabled?: unknown; requires?: unknown } }).precondition;
  return {
    enabled: p?.enabled === true,
    requires: typeof p?.requires === 'string' ? p.requires : 'unstated',
  };
}

/* ================================================================== *
 * THE FEE, WHAT THE CLIENT ACTUALLY GETS BACK, AND THE TWO SWITCHES
 *
 * CB_FEE, CB_BENEFIT and CB_FEEGUARD reach TypeScript as `OpaqueModule`,
 * which is `{ readonly [member: string]: unknown }` — a shape with no members
 * a caller can use without narrowing. The narrowing belongs HERE, in the one
 * bridge file, for the same reason every other engine call does: a `as` cast
 * at each call site is four places for the shape to be described differently.
 *
 * NOTHING BELOW COMPUTES ANYTHING. Each function narrows a type and calls the
 * module. The 3% rate (5% until Phase 132e, 16 September 2026), the basis, the disclosure, the benefit schedule, the
 * three-valued comparison and both switch positions are the engine's, and
 * this file may not "correct" any of them.
 * ================================================================== */

export const FEE = CB.CB_FEE;
export const FEEGUARD = CB.CB_FEEGUARD;
export const BENEFIT = CB.CB_BENEFIT;
export const RATES = CB.CB_RATES;

/** The engine's own three entity keys. CB_RATES.rangeFor is keyed on them. */
export type EntityKey = 'company' | 'uninc_ruk' | 'uninc_scot';

/**
 * What CB_BENEFIT.compare returns. Transcribed from the module, and every
 * field that can be absent is typed `| null` rather than optional, because the
 * module returns the whole shape on every call INCLUDING its refusal path —
 * deliberately, so that "a field that is sometimes absent altogether is a
 * field no caller will build against".
 */
export type FeeComparison = {
  readonly computed: boolean;
  readonly why: string | null;
  /** True where the model has one scenario. False where it is a bounded range. */
  readonly determined: boolean;
  readonly fee: number | null;
  readonly allowances: number | null;
  readonly horizon_years: number | null;
  readonly year_one_benefit: number | null;
  readonly cumulative_benefit: number | null;
  readonly year_one_benefit_range: readonly [number, number] | null;
  readonly cumulative_benefit_range: readonly [number, number] | null;
  /**
   * THREE-VALUED ON PURPOSE. true where the fee exceeds the year-one benefit
   * on EVERY scenario in the range, false where it exceeds it on none, and
   * null where the range straddles — because on a case that turns on a fact
   * nobody has established, true and false are both assertions we have not
   * earned. A caller that treats null as false is wrong.
   */
  readonly fee_exceeds_year_one_benefit: boolean | null;
  readonly fee_exceeds_cumulative_benefit: boolean | null;
  /** The rate at which the fee stops exceeding the year-one benefit on these facts. */
  readonly breakeven_fee_rate_year_one: number | null;
  readonly breakeven_fee_rate_year_one_range: readonly [number, number] | null;
  readonly unknowns: readonly string[];
  readonly assumptions: readonly string[];
  /**
   * PHASE 153b (Word question 59) — present ONLY where CB_FEEGUARD.fee_comparison_counts_vat is on AND we are
   * VAT-registered: how VAT on our fee was treated, and the fee the verdicts were taken on. Absent today.
   */
  readonly fee_vat?: NoClaimVatReading;
  readonly fee_counted?: number | null;
};

export type FeeDisplay = {
  readonly render: boolean;
  readonly amount: number | null;
  readonly reason: string | null;
  readonly disclosure: string;
  readonly comparison: FeeComparison;
  readonly warning: string | null;
  readonly capped: boolean;
  readonly uncapped_amount: number | null;
  /** Phase 113d, read by the back end from Phase 132f: the engagement gate, assessed on every call. */
  readonly gate: GateDecision;
  /** Phase 132e, read by the back end from Phase 132f: the £1,000 no-claim threshold. */
  readonly recommendation_threshold: RecommendationThreshold;
};

/** CB_GATE.assess's answer, as the site's own declaration types it. */
export type GateDecision = ReturnType<typeof CB.CB_GATE.assess>;

/**
 * CB_FEE.recommendationThreshold's answer — Phase 132e. Transcribed from the module; every field is present on
 * every path. It refuses no work, withholds no quote and moves no figure, and it is AWAITING THE TAX ADVISER'S
 * REVIEW (its own metadata says so).
 */
export type RecommendationThreshold = {
  readonly outcome: 'BELOW_THRESHOLD' | 'AT_OR_ABOVE_THRESHOLD' | 'UNDETERMINED';
  readonly determined: boolean;
  readonly fires: boolean;
  readonly why: string | null;
  readonly threshold: number;
  readonly relief: number | null;
  readonly relief_basis: string;
  readonly horizon_years: number | null;
  readonly fee: number | null;
  /** Phase 151b — what the test took off the relief: the fee, plus VAT only where VAT is counted. Null where not known. */
  readonly fee_counted: number | null;
  /** Phase 151b — how VAT on our fee was treated in this reading, and why. */
  readonly vat: NoClaimVatReading;
  readonly relief_after_fee: number | null;
  readonly message: string | null;
  readonly refuses_work: false;
  readonly withholds_quote: false;
  readonly moves_figure: false;
  readonly client_chooses: true;
  readonly awaiting_tax_adviser_review: boolean;
};

/**
 * PHASE 151b, 25 September 2026 — VAT IN THE NO-CLAIM TEST (Word question 61, Lakhbir, closed 24 September 2026:
 * "The relief is calculated over the 5 years – and must include VAT"). Transcribed from CB_FEE's `vat` report.
 * VAT is on OUR fee and exists only once we are VAT-registered; it is counted only where the client cannot reclaim
 * it; a client whose position is not known ("not sure" and absent alike) is UNDETERMINED, never told not to claim.
 */
export type NoClaimVatReading = {
  readonly we_are_vat_registered: boolean;
  readonly vat_rate: number | null;
  readonly client_vat_position: 'can_reclaim' | 'cannot_reclaim' | 'not_known';
  readonly treatment: 'NOT_REGISTERED_NO_VAT' | 'COUNTED_CLIENT_CANNOT_RECLAIM' | 'NOT_COUNTED_CLIENT_CAN_RECLAIM' | 'UNDETERMINED';
  readonly known: boolean;
  readonly vat: number | null;
  readonly why: string | null;
  readonly awaiting_tax_adviser_review: boolean;
};

/** Whatever the caller knows about how the allowances will actually relieve. All optional. */
export type BenefitContext = {
  main?: number | null;
  special?: number | null;
  period_start?: string | null;
  is_company?: boolean;
  profits?: number | null;
  /**
   * PHASE 151b — the client's VAT position ON OUR FEE: 'can_reclaim' or 'cannot_reclaim'. Anything else, absent
   * included, is not known, and the engine treats them all alike (N4). Data the caller passes, not a question.
   */
  client_vat?: string | null;
};

/**
 * CB_FEE.display — the fee, the standing disclosure, and the comparison.
 *
 * The comparison comes back on EVERY call including the refusal path, and both
 * CB_FEEGUARD switches are off, so `amount` is 3% of the allowances identified
 * and nothing here changes it.
 */
export function feeDisplay(
  allowances: number | null, taxRate: number | null, ctx: BenefitContext = {},
): FeeDisplay {
  const fn = (FEE as { display?: unknown }).display as
    (a: number | null, t: number | null, c: BenefitContext) => FeeDisplay;
  return fn(allowances, taxRate, ctx);
}

/* ================================================================== *
 * THE ENGAGEMENT GATE, WITH ITS COSTING INJECTED — PHASE 132f, 16 September 2026
 *
 * Phase 132e switched CB_GATE_CONFIG on (120 jobs this year), and nothing handed it costs: `costing` ships null, so
 * every assessment came back UNDETERMINED naming "costing" and the gate stopped nothing. The engine says the costing
 * is "injected by whatever runs it", and that the only calculator is
 * 04-phase-work/phase9/caprebate-job-economics.cjs `costingForGate`. This is the back end injecting it.
 *
 * SCOPED, NOT PERMANENT. The costing is set on CB_GATE_CONFIG for one synchronous call and put back in `finally`,
 * the mutate-and-restore Suite T of the site harness uses. A permanent injection would change every `feeDisplay`
 * call in this package that ever passes a sector, silently; this way the gate runs where it is asked for by name.
 *
 * NOTHING HERE COMPUTES A COST OR A THRESHOLD. The loaded cost is phase9's, the margin, the volume, the scenario,
 * the comparison and the outcome words are CB_GATE's. The one thing this file adds is a vocabulary join: the engine
 * calls the sector `care_homes` and phase9 calls it `care_home`. Without the join a care home would never be
 * costed (UNDETERMINED for ever — safe, and a gate that stops nothing, which is the defect being fixed).
 * Supported living has NO cost row in phase9, so it stays UNDETERMINED naming `sector` — never a pass, never a
 * refusal. If the phase9 module cannot be loaded the costing is absent and every answer is UNDETERMINED.
 * ================================================================== */

export const GATE_CONFIG = CB.CB_GATE_CONFIG;
export const GATE = CB.CB_GATE;

type GateCosting = (sector: string, scenario: string, jobsPerYear: number) =>
  { known: boolean; loaded?: number | null; parameter?: string | null; overhead_is_placeholder?: boolean };

/** Engine sector ids that phase9 spells differently. A join, not a rule. */
export const ECONOMICS_SECTOR_OF: Readonly<Record<string, string>> = Object.freeze({ care_homes: 'care_home' });

const JOB_ECONOMICS_COSTING: GateCosting | null = (() => {
  try {
    const m = createRequire(import.meta.url)('../../../../04-phase-work/phase9/caprebate-job-economics.cjs') as { costingForGate?: unknown };
    const f = m.costingForGate;
    if (typeof f !== 'function') return null;
    const costing = f as GateCosting;
    return (sector: string, scenario: string, jobs: number) => costing(ECONOMICS_SECTOR_OF[sector] ?? sector, scenario, jobs);
  } catch {
    return null;
  }
})();

/** Whether phase9's costing loaded. False means every gate reading is UNDETERMINED, which is honest. */
export function gateCostingLoaded(): boolean {
  return JOB_ECONOMICS_COSTING !== null;
}

/**
 * The placeholder caveat, ON EVERY ANSWER — determined or not. The engine's own requires: string says "STILL AN
 * ESTIMATE" and that every answer the gate gives says so; the loaded cost rests on the overhead placeholder and on
 * estimated, not quoted, surveyor and tax adviser fees.
 */
export const GATE_PLACEHOLDER_CAVEAT =
  'An estimate, not a measured cost. Our overheads in it are a guess for now. ' +
  'The surveyor and tax adviser fees are estimates, not quotes. It assumes the number of jobs Lakhbir gave ' +
  'for this year. If we do fewer jobs than that, some jobs that lose money will pass.';

export type FeeGateReading = GateDecision & { readonly placeholder_caveat: string; readonly costing_loaded: boolean };

/** For a test, or a what-if: stand-ins for the config the gate reads. Absent keys leave the shipped value. */
export type GateOverrides = { readonly jobs_per_year?: unknown; readonly enabled?: unknown };

function withGateCosting<T>(over: GateOverrides, fn: () => T): T {
  const cfg = GATE_CONFIG as unknown as Record<string, unknown>;
  const keep = { costing: cfg['costing'], jobs_per_year: cfg['jobs_per_year'], enabled: cfg['enabled'] };
  cfg['costing'] = JOB_ECONOMICS_COSTING;
  if (Object.hasOwn(over, 'jobs_per_year')) cfg['jobs_per_year'] = over.jobs_per_year;
  if (Object.hasOwn(over, 'enabled')) cfg['enabled'] = over.enabled;
  try {
    return fn();
  } finally {
    cfg['costing'] = keep.costing; cfg['jobs_per_year'] = keep.jobs_per_year; cfg['enabled'] = keep.enabled;
  }
}

/**
 * CB_GATE.assess on the fee that would actually go out, with phase9's costing injected. `fee` in POUNDS.
 * A fee that is not a positive number ("not sure" and absent alike), an unknown sector, supported living and an
 * unusable volume all come back UNDETERMINED, by the engine's own lines. Never throws.
 */
export function feeGate(fee: unknown, sector: unknown, over: GateOverrides = {}): FeeGateReading {
  const g = withGateCosting(over, () => GATE.assess({ fee, sector }));
  return { ...g, placeholder_caveat: GATE_PLACEHOLDER_CAVEAT, costing_loaded: gateCostingLoaded() };
}

/**
 * CB_FEE.display with the sector and the costing — the engine's whole quote: `render` false and `reason` the
 * engine's "we will come back to you with a price" where the gate withholds it, the gate, and the no-claim threshold.
 */
export function feeQuote(
  allowances: number | null, taxRate: number | null, ctx: BenefitContext & { sector?: unknown }, over: GateOverrides = {},
): FeeDisplay & { readonly placeholder_caveat: string } {
  const fn = (FEE as { display?: unknown }).display as
    (a: number | null, t: number | null, c: BenefitContext & { sector?: unknown }) => FeeDisplay;
  return { ...withGateCosting(over, () => fn(allowances, taxRate, ctx)), placeholder_caveat: GATE_PLACEHOLDER_CAVEAT };
}

/**
 * CB_FEE.NO_CLAIM_THRESHOLD's line, read. NaN where the engine does not carry it — never a default.
 *
 * PHASE 151b — and CB_FEE.NO_CLAIM_VAT, read the same way: registered only where the engine says `true` (an absent
 * setting is not a registration), the rate only where it is a positive number (null otherwise, never 0). Read, not
 * decided: whether VAT is counted for a given client is the engine's, on each reading.
 */
export function noClaimThreshold(): {
  readonly relief_after_fee_below: number; readonly awaiting_tax_adviser_review: boolean;
  readonly vat: { readonly we_are_vat_registered: boolean; readonly vat_rate: number | null; readonly awaiting_tax_adviser_review: boolean };
} {
  const t = (FEE as { NO_CLAIM_THRESHOLD?: { relief_after_fee_below?: unknown; awaiting_tax_adviser_review?: unknown } }).NO_CLAIM_THRESHOLD;
  const v = (FEE as { NO_CLAIM_VAT?: { we_are_vat_registered?: unknown; vat_rate?: unknown; awaiting_tax_adviser_review?: unknown } }).NO_CLAIM_VAT;
  return {
    relief_after_fee_below: typeof t?.relief_after_fee_below === 'number' ? t.relief_after_fee_below : Number.NaN,
    awaiting_tax_adviser_review: t?.awaiting_tax_adviser_review !== false,
    vat: {
      we_are_vat_registered: v?.we_are_vat_registered === true,
      vat_rate: typeof v?.vat_rate === 'number' && Number.isFinite(v.vat_rate) && v.vat_rate > 0 ? v.vat_rate : null,
      awaiting_tax_adviser_review: v?.awaiting_tax_adviser_review !== false,
    },
  };
}

/**
 * PHASE 153b (Word question 226) — what a session's works-VAT answer tells us about the client's VAT on OUR fee:
 * 'can_reclaim' or 'cannot_reclaim' only for the same business with nothing changed, and null (not known) otherwise.
 * The engine's rule (CB_FEE.clientVatFromWorks), narrowed here; null where the engine does not carry it.
 */
export function clientVatFromWorks(session: unknown): 'can_reclaim' | 'cannot_reclaim' | null {
  const f = (FEE as { clientVatFromWorks?: unknown }).clientVatFromWorks;
  if (typeof f !== 'function') return null;
  const v = (f as (s: unknown) => unknown)(session);
  return v === 'can_reclaim' || v === 'cannot_reclaim' ? v : null;
}

/** The two switches, read rather than assumed. Both ship off. */
export function feeGuard(): { readonly cap: boolean; readonly warn: boolean } {
  const g = FEEGUARD as { fee_cap_at_year_one_benefit?: unknown; fee_warn_when_exceeds_benefit?: unknown };
  return {
    cap: g.fee_cap_at_year_one_benefit === true,
    warn: g.fee_warn_when_exceeds_benefit === true,
  };
}

/* ================================================================== *
 * CRM 6 of 10 — THE CLAIM'S FACTS, READ OFF THE ENGINE
 *
 * Three readings the facts panel needs, each a narrowing of a module that
 * already decides it. NOTHING HERE COMPUTES A DATE OR A RULE: the amendment
 * window is CB_CASH's, the election's notification clock is CB_ELECTION's, and
 * the switch positions are CB_CTA's own booleans.
 * ================================================================== */

export const CASH = CB.CB_CASH;
export const ELECTION = CB.CB_ELECTION;
export const CTA = CB.CB_CTA;

/**
 * The engine's claimant readings for the window: a company, anyone filing self assessment, or — Phase 132,
 * 14 September 2026 — a partnership or LLP, whose date turns on whether a partner or member is a company.
 */
export type WindowClaimant = 'company' | 'self_assessment' | 'partnership';

/**
 * A window the engine could not settle is `known: false`. It is `ambiguous` — with both dates — only where the
 * one fact missing is whether a partner is a company, and today is inside one date and past the other. A known
 * partnership window says which reading it used: `member` 'company' (a company partner, recorded) or 'not_known'
 * (not recorded, but open on both dates or closed on both); `company_date_later_not_applied` where a recorded
 * company partner's date would run later and CB_CTA.window_company_member_date is off.
 */
export type EngineWindow =
  | { readonly known: false; readonly ambiguous?: true; readonly deadlines?: { readonly individual: string; readonly company: string } }
  | {
    readonly known: true; readonly deadline: string; readonly in_time: boolean;
    readonly member?: 'company' | 'not_known'; readonly company_date_later_not_applied?: true;
  };

/**
 * CB_CASH.deriveAmendmentWindow — the engine's own rule of thumb: a company
 * ~24 months after the period end, self assessment twelve months after the
 * 31 January filing date, and a partnership with a company partner on the
 * company date where that is earlier (TMA 1970 s.12ABA(4)(b), s.12AA(5B)).
 * `today` is passed, never read from the clock here, so a request and a test
 * ask the same question. `companyMember` is read only for a partnership, and
 * null — not recorded, or recorded as not known — is passed as no answer at
 * all, because that is what the engine is written to receive (N4).
 */
export function amendmentWindow(periodEnd: string, claimant: WindowClaimant, todayIso: string, companyMember: boolean | null = null): EngineWindow {
  const fn = (CASH as { deriveAmendmentWindow?: unknown }).deriveAmendmentWindow as
    (s: Record<string, unknown>, today: Date) => {
      known: boolean; ambiguous?: boolean; deadline?: Date; inTime?: boolean; member?: string; memberDate?: string;
      deadlines?: { individual?: unknown; company?: unknown };
    };
  const s: Record<string, unknown> = {
    accounting_period_end: periodEnd,
    claimant_type: claimant === 'company' ? 'company' : claimant === 'partnership' ? 'partnership' : 'individual',
  };
  if (claimant === 'partnership' && companyMember !== null) s['partnership_has_company_member'] = companyMember;
  /* PHASE 159a (C2): THE LAST DAY IS A WHOLE UK DAY. The engine compares the moment it is handed with the deadline's
     midnight, so at 09:00 on the last day it read the window as closed. Handed the start of today's UK date, its
     comparison is a comparison of UK dates: open all of the last day, closed from the next one. */
  const r = fn(s, new Date(`${localDate(todayIso)}T00:00:00.000Z`));
  if (r.known !== true || !(r.deadline instanceof Date) || typeof r.inTime !== 'boolean') {
    const d = r.deadlines;
    if (r.ambiguous === true && d !== undefined && d.individual instanceof Date && d.company instanceof Date) {
      return { known: false, ambiguous: true, deadlines: { individual: d.individual.toISOString().slice(0, 10), company: d.company.toISOString().slice(0, 10) } };
    }
    return { known: false };
  }
  const deadline = r.deadline.toISOString().slice(0, 10);
  if (r.member === 'company' && r.memberDate === 'individual_company_later') {
    return { known: true, deadline, in_time: r.inTime, member: 'company', company_date_later_not_applied: true };
  }
  if (r.member === 'company' || r.member === 'not_known') return { known: true, deadline, in_time: r.inTime, member: r.member };
  return { known: true, deadline, in_time: r.inTime };
}

/**
 * CB_ELECTION.notifiedInTime — s.201(1): notice within two years of the
 * acquisition. true, false, or null where either date is missing. The tribunal
 * route (s.201(1A)) is the engine's too: a tribunal application lodged inside
 * the period and still UNDETERMINED disapplies the limit. It is passed only where
 * both its date and that status were recorded — a status not known is not passed,
 * so it cannot relieve anything.
 */
export function electionNotifiedInTime(
  acquisitionDate: string, notifiedOn: string | null, tribunal: { readonly applied_on: string } | null = null,
): boolean | null {
  const fn = (ELECTION as { notifiedInTime?: unknown }).notifiedInTime as (s: Record<string, unknown>) => boolean | null;
  const r = fn({
    acquisition_date: acquisitionDate, election_notified_date: notifiedOn ?? undefined,
    ...(tribunal === null ? {} : { tribunal_application_date: tribunal.applied_on, tribunal_status: 'undetermined' }),
  });
  return r === true || r === false ? r : null;
}

/** Every CB_CTA switch and its position, read rather than assumed. The count is derived here, never quoted. */
export function ctaSwitchReadings(): readonly { readonly switch: string; readonly on: boolean }[] {
  const t = CTA as unknown as Record<string, unknown>;
  return Object.keys(t).filter((k) => typeof t[k] === 'boolean').map((k) => ({ switch: k, on: t[k] === true }));
}

/**
 * CB_FEE.RATE — 3% of the allowances identified. Phase 132e, 16 September 2026: Lakhbir, "yes, flat fee of 3% of the
 * allowances for 1 or more properties", no bands and no minimum. It was 5% (Q55, 3 September 2026). Read, never typed.
 */
export function feeRate(): number {
  const r = (FEE as { RATE?: unknown }).RATE;
  return typeof r === 'number' ? r : Number.NaN;
}

export type MultiSiteDiscount = {
  readonly discretionary: boolean;
  readonly fixed_tiers: null;
  /** NOT DECIDED — a named null until Lakhbir answers. */
  readonly largest_discount: number | null;
  /** NOT DECIDED — a named null until Lakhbir answers. */
  readonly approved_by: string | null;
  readonly asked: string;
  readonly applied_automatically: false;
};

/**
 * CB_FEE.MULTI_SITE_DISCOUNT — Phase 132e. "A further multi-site discount can be applied depending on
 * site/opportunities": discretionary, no fixed tiers, never applied automatically, and the largest discount and who
 * approves it are asked, not invented. Narrowed here and nowhere else; a missing object reads as undecided.
 */
export function multiSiteDiscount(): MultiSiteDiscount {
  const m = (FEE as { MULTI_SITE_DISCOUNT?: unknown }).MULTI_SITE_DISCOUNT as Partial<MultiSiteDiscount> | undefined;
  return {
    discretionary: m?.discretionary === true,
    fixed_tiers: null,
    largest_discount: typeof m?.largest_discount === 'number' ? m.largest_discount : null,
    approved_by: typeof m?.approved_by === 'string' ? m.approved_by : null,
    asked: typeof m?.asked === 'string' ? m.asked : 'the largest discount and who approves it',
    applied_automatically: false,
  };
}

/**
 * CB_RATES.MARGINAL_RATE for an entity type — a [low, high] RANGE, not a rate.
 *
 * THE ENGINE DOES NOT HOLD ONE MARGINAL RATE FOR A CLIENT and it is right not
 * to: a company pays 19% under £50,000, 25% over £250,000 and an effective
 * 26.5% between, and which applies depends on profits and associated
 * companies. So anything that needs "the rate" gets both ends and reports
 * both, rather than picking one.
 */
export function marginalRateRange(entity: EntityKey): readonly [number, number] {
  const fn = (RATES as { rangeFor?: unknown }).rangeFor as (k: string) => [number, number];
  const r = fn(entity);
  return [r[0], r[1]];
}
