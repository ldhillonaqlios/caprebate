/**
 * THE ACCOUNTING VIEW — Caprebate's own finance. Block F, part three.
 *
 * SETTLED 6 SEPTEMBER 2026, AND THE FIRST SENTENCE IS THE WHOLE DESIGN: this
 * is CAPREBATE'S finance, not the client's accountant. The client's accountant
 * is a different actor, has no login at all, and receives the computation pack
 * offline — the Developer Brief's actor table still says so and it is still
 * true.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS ROLE SEES, AND IT IS A CLOSED LIST
 *
 *   the client's name · the claim value · the fee · invoice raised or not ·
 *   payment received or not · the VAT position
 *
 * WHAT IT DOES NOT SEE, AND EACH IS REFUSED BY A RULE WITH A TEST AGAINST IT:
 *
 *   the questions and answers   — not on assessment.read or answer.read
 *   the register data           — not on register_record.read
 *   the internal notes          — not on internal_note.read
 *   the surveyor's workings     — not on surveyor_job.read or .enter
 *   our estimate                — not on estimate.read
 *
 * ENFORCED TWICE, AND THE SECOND TIME IS THE ONE THAT LASTS. `can()` refuses
 * each of those, and the `invoices` table carries no join to any of them, so a
 * finance screen that wanted one would have to go and get it from somewhere
 * this file cannot reach. Migration 006 says at length why the five facts the
 * fee comparison needs were COPIED ONTO THE INVOICE rather than joined at
 * display time: the alternative was this file reading `assessment_answers` and
 * `estimates`, which is exactly the reach the shape restriction exists to
 * prevent.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FEE VERSUS WHAT THE CLIENT ACTUALLY GETS BACK
 *
 * CB_FEE computes the fee, CB_BENEFIT models the relief, and the comparison
 * between them is returned on EVERY call whether or not a switch is on. It is
 * shown here because this is the role that most needs it and the only one that
 * sees the fee at all.
 *
 * BOTH CB_FEEGUARD SWITCHES ARE OFF AND THIS FILE DOES NOT TOUCH THEM. The
 * rendered amount is 3% of the allowances identified, as it ships (5% until Phase 132e). Displaying
 * the comparison changes no figure — capping the fee at the year-one benefit
 * is Q90(a) and attaching a case-specific warning is Q90(b), and both are
 * decisions for Lakhbir rather than for a screen.
 *
 * AND THE ARITHMETIC IS STILL UNCOMFORTABLE, ON PURPOSE — BUT IT MOVED WITH THE FEE.
 * At 5% a company's year-one relief fell short of the fee at any rate and any
 * pool split (18% × 26.5% is 4.77%). At 3% (Phase 132e, 16 September 2026) it
 * depends on the split: on the main pool, 18% × 26.5% = 4.77% and 14% × 26.5% =
 * 3.71% both exceed 3%, and on the special-rate pool 6% × 26.5% = 1.59% does
 * not. So this view shows the comparison the engine returns, and says nothing of
 * its own about which way it falls.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import type { AuditLog } from '../audit.ts';
import {
  feeDisplay, feeGuard, feeRate, marginalRateRange, noClaimThreshold,
  type EntityKey, type FeeComparison, type NoClaimVatReading, type RecommendationThreshold,
} from './engine.ts';
import { formatPence } from './shown-range.ts';
import { NotFoundAsRefusal } from './backoffice.ts';

export { NotFoundAsRefusal };

/**
 * THE SECTION GATE — the sentinel-object idiom, which works here.
 *
 * `invoice.read` is ADMIN and ACCOUNTING, both unconditional, and every rule
 * that lets a CLIENT through anywhere in the table is `ownBusiness`. No
 * client's business is this sentinel, so a client is refused by the same table
 * that admits the two finance roles — no new concept and nothing to keep in
 * step. (The surveyor section could not use this; authz.ts explains why.)
 */
const FINANCE_SECTION = '__finance__';

export function assertFinanceSection(actor: Actor): void {
  authorise(actor, 'invoice.read', financeSectionObj());
}

/** The section's sentinel object, for the section-wide actions — a VAT check, a finance setting. CRM 7 of 10. */
export function financeSectionObj(): { readonly type: 'invoice'; readonly id: string; readonly business_id: string } {
  return { type: 'invoice', id: FINANCE_SECTION, business_id: FINANCE_SECTION };
}

/* ================================================================== *
 * THE ROW
 * ================================================================== */

export type InvoiceStatus = 'NOT_RAISED' | 'RAISED' | 'SENT' | 'CREDITED';
export type PaymentStatus = 'UNPAID' | 'PART_PAID' | 'PAID' | 'WRITTEN_OFF';

export const INVOICE_WORDS: Readonly<Record<InvoiceStatus, string>> = Object.freeze({
  NOT_RAISED: 'not raised',
  RAISED: 'raised, not sent',
  SENT: 'sent',
  CREDITED: 'credited',
});

export const PAYMENT_WORDS: Readonly<Record<PaymentStatus, string>> = Object.freeze({
  UNPAID: 'nothing received',
  PART_PAID: 'part received',
  PAID: 'received in full',
  WRITTEN_OFF: 'written off',
});

export type FinanceRow = {
  readonly invoice_id: string;
  readonly business_id: string;
  /** The client NAME, and it is the whole of what follows from `business.read` for this role. */
  readonly client_name: string;
  readonly claim_value_pence: number | null;
  readonly fee_pence: number | null;
  readonly claim_value: string;
  readonly fee: string;
  readonly invoice_status: InvoiceStatus;
  readonly invoice_label: string;
  readonly payment_status: PaymentStatus;
  readonly payment_label: string;
  readonly vat_position: string;
  readonly created_at: string;
  /** The comparison. `computed:false` where a fact it needs is absent, with the reason. */
  readonly comparison: FeeVersusBenefit;
};

/**
 * THE COMPARISON, AT BOTH ENDS OF THE ENGINE'S OWN MARGINAL BAND.
 *
 * THE ENGINE DOES NOT HOLD ONE MARGINAL RATE FOR A CLIENT and is right not to
 * — a company pays 19% under £50,000, 25% over £250,000 and an effective 26.5%
 * between, and which applies turns on profits and associated companies that
 * nobody here has asked for. Picking one would be this screen deciding a tax
 * fact.
 *
 * So the comparison is run TWICE, at the low end and the high end of
 * `CB_RATES.MARGINAL_RATE` for the entity type, and both answers are reported.
 * Where they agree the answer is unambiguous on this client's facts whatever
 * their profits turn out to be. Where they disagree, that disagreement is the
 * finding — and it is a far more useful thing to put in front of somebody than
 * a single number computed at a rate nobody chose.
 *
 * A STORED `tax_rate` OVERRIDES BOTH. Where somebody has recorded the actual
 * marginal rate on the invoice, that is a fact and the range is not needed.
 */
export type FeeVersusBenefit = {
  readonly computed: boolean;
  readonly why: string | null;
  /** The rate each reading was computed at. */
  readonly readings: readonly {
    readonly label: string;
    readonly rate: number;
    readonly comparison: FeeComparison;
  }[];
  /**
   * THREE-VALUED, AND IT IS THE MODULE'S OWN THREE VALUES CARRIED UP.
   * true where the fee exceeds the year-one benefit on every reading and every
   * scenario within it; false where it exceeds none; null where they disagree
   * or a range straddles. A caller that reads null as false is wrong.
   */
  readonly exceeds_year_one: boolean | null;
  readonly exceeds_cumulative: boolean | null;
  /** The rate at which the fee stops exceeding the year-one benefit, per reading. */
  readonly breakeven_year_one: readonly (number | null)[];
  readonly unknowns: readonly string[];
  readonly assumptions: readonly string[];
  /** The standing disclosure, verbatim. Never reworded and never conditioned. */
  readonly disclosure: string;
  /** Both CB_FEEGUARD switches, read rather than assumed. */
  readonly switches: { readonly cap: boolean; readonly warn: boolean };
  /** True where the rendered fee is the plain 3% — which is how both switches ship. */
  readonly amount_untouched: boolean;
  /** PHASE 132f — the engine's £1,000 no-claim threshold (CB_FEE.recommendationThreshold), for the tax adviser. */
  readonly recommendation_threshold: NoClaimReading;
};

/**
 * THE NO-CLAIM THRESHOLD, WHERE THE FEE IS SHOWN AGAINST THE BENEFIT — Phase 132f, reading Phase 132e's engine output.
 *
 * CB_FEE.display returns `recommendation_threshold` on every call: the five-year relief (CB_BENEFIT's cumulative
 * benefit) less our fee, against £1,000 (NO_CLAIM_THRESHOLD, Lakhbir, read 15 September 2026). It REFUSES NOTHING,
 * withholds nothing and moves no figure: the figures are printed, the client chooses, and the reading is marked for
 * the tax adviser, whose review of it is outstanding (its own `awaiting_tax_adviser_review`).
 *
 * ONE READING PER RATE, COMBINED AS THE COMPARISON IS. It is BELOW_THRESHOLD only where every reading is determined
 * and fires; AT_OR_ABOVE_THRESHOLD only where every reading is determined and none fires; otherwise UNDETERMINED.
 * No reading at all — no entity type, so no rate — is UNDETERMINED. An unknown relief is never nil relief, so an
 * unknown never tells anyone not to claim (N4).
 *
 * PHASE 151b, 25 September 2026 — VAT. Word question 61, Lakhbir, closed 24 September 2026: "The relief is
 * calculated over the 5 years – and must include VAT". The five years was already the measure (CB_BENEFIT's horizon)
 * and is unchanged. The VAT rule is the ENGINE'S (CB_FEE.NO_CLAIM_VAT), and this file only says what it did:
 *   · we are not VAT-registered (today) — there is no VAT on our fee, and the test is exactly what it was;
 *   · registered, and the client cannot reclaim VAT — the fee plus VAT is what comes off the relief;
 *   · registered, and the client can reclaim it — the fee alone;
 *   · registered, and the client's position not known — UNDETERMINED, never "do not claim".
 * NO INVOICE RECORDS THE CLIENT'S VAT POSITION ON OUR FEE, so nothing here passes one, and while we are not registered
 * that changes nothing. `ComparisonFacts.client_vat` is there for a caller that does know it.
 */
export type NoClaimReading = {
  readonly outcome: RecommendationThreshold['outcome'];
  readonly fires: boolean;
  readonly threshold: number;
  readonly readings: readonly { readonly label: string; readonly rate: number; readonly threshold: RecommendationThreshold }[];
  readonly why: string | null;
  readonly for_the_tax_adviser: string;
  /** Phase 151b — how VAT on our fee was treated in this test, read off the engine, in words for the finance view. */
  readonly vat: NoClaimVatWords;
  readonly refuses_work: false;
};

export type NoClaimVatWords = {
  readonly we_are_vat_registered: boolean;
  readonly vat_rate: number | null;
  /** The engine's treatment on the readings, where they agree; null where there is no reading or they differ. */
  readonly treatment: NoClaimVatReading['treatment'] | null;
  readonly in_words: string;
  readonly awaiting_tax_adviser_review: boolean;
};

/* The sentence the tax adviser reviews. Phase 151b added the VAT sentence (question 61); the rest is Phase 132f's. */
export const NO_CLAIM_FOR_TAX_ADVISER =
  'FOR THE TAX ADVISER — AWAITING REVIEW. We take “tax relief after our fee” to mean the five-year relief less ' +
  'our fee. VAT on our fee is counted only when we are VAT-registered and the client cannot reclaim it; a client ' +
  'who can reclaim it is measured on the fee alone; and where we do not know whether the client can reclaim it, the ' +
  'test is not determined and never tells the client not to claim. This stops no work and changes no figure. We ' +
  'show the figures, and the client chooses.';

function vatWords(readings: readonly { threshold: RecommendationThreshold }[]): NoClaimVatWords {
  const s = noClaimThreshold().vat;
  const ts = [...new Set(readings.map((r) => r.threshold.vat?.treatment ?? null))];
  const treatment = ts.length === 1 ? ts[0] ?? null : null;
  const pct = s.vat_rate === null ? null : `${Math.round(s.vat_rate * 10000) / 100}%`;
  const in_words = !s.we_are_vat_registered
    ? 'We are not VAT-registered, so there is no VAT on our fee and none is counted in this test.'
    : treatment === 'COUNTED_CLIENT_CANNOT_RECLAIM'
      ? `We are VAT-registered and the client cannot reclaim VAT, so our fee plus VAT at ${pct} is counted in this test.`
      : treatment === 'NOT_COUNTED_CLIENT_CAN_RECLAIM'
        ? 'We are VAT-registered and the client can reclaim VAT, so our fee is counted without VAT.'
        : pct === null
          ? 'We are VAT-registered but no VAT rate is set, so the test is not determined.'
          : 'We are VAT-registered. We do not know if the client can reclaim VAT on our fee. So the test is not ' +
            'determined, and it does not tell the client not to claim.';
  return {
    we_are_vat_registered: s.we_are_vat_registered, vat_rate: s.vat_rate, treatment, in_words,
    awaiting_tax_adviser_review: s.awaiting_tax_adviser_review,
  };
}

function noClaim(readings: readonly { label: string; rate: number; threshold: RecommendationThreshold }[], whyNone?: string | null): NoClaimReading {
  const line = noClaimThreshold().relief_after_fee_below;
  const all = readings.length > 0 && readings.every((r) => r.threshold.determined);
  const outcome: RecommendationThreshold['outcome'] = !all ? 'UNDETERMINED'
    : readings.every((r) => r.threshold.fires) ? 'BELOW_THRESHOLD'
      : readings.every((r) => !r.threshold.fires) ? 'AT_OR_ABOVE_THRESHOLD' : 'UNDETERMINED';
  return {
    outcome, fires: outcome === 'BELOW_THRESHOLD', threshold: line, readings,
    why: outcome !== 'UNDETERMINED' ? null
      : readings.length === 0 ? (whyNone ?? 'no marginal rate can be read for this client, so the relief is not known and is never treated as nil')
        : readings.find((r) => !r.threshold.determined)?.threshold.why ?? 'the readings at the two ends of the rate band do not agree',
    for_the_tax_adviser: NO_CLAIM_FOR_TAX_ADVISER,
    vat: vatWords(readings),
    refuses_work: false,
  };
}

type InvoiceDbRow = {
  id: string; business_id: string; claim_value_pence: number | null; fee_pence: number | null;
  invoice_status: string; payment_status: string; vat_position: string; created_at: string;
  entity_type: string | null; tax_rate: number | null;
  pool_split_main_pence: number | null; pool_split_special_pence: number | null;
  period_start: string | null; name: string;
};

const INVOICE_SELECT =
  'SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, ' +
  'i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, ' +
  'i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name ' +
  'FROM invoices i JOIN businesses b ON b.id = i.business_id ';

/**
 * Pounds from pence, for the engine.
 *
 * THE ENGINE WORKS IN POUNDS AND THIS APPLICATION STORES PENCE, and that is
 * the one conversion in this file. CB_FEE's 3% and CB_BENEFIT's schedules are
 * written against the figures a person would type; the database keeps integer
 * pence because a currency held as a float eventually loses a penny. Both are
 * right and the boundary between them is here rather than at four call sites.
 */
function pounds(p: number | null): number | null {
  return p === null ? null : p / 100;
}

/** The facts the comparison reads — every one copied onto the invoice when it was raised (migration 006). */
export type ComparisonFacts = {
  readonly claim_value_pence: number | null; readonly entity_type: string | null; readonly tax_rate: number | null;
  readonly pool_split_main_pence: number | null; readonly pool_split_special_pence: number | null; readonly period_start: string | null;
  /**
   * PHASE 151b — the client's VAT position ON OUR FEE ('can_reclaim' / 'cannot_reclaim'), where a caller knows it.
   * No invoice records it, so it is normally absent, and absent is "not known" — which counts for nothing while we are
   * not VAT-registered, and is UNDETERMINED (never "do not claim") once we are.
   */
  readonly client_vat?: string | null;
};

/**
 * THE COMPARISON — exported by CRM 7 of 10 so a claim's invoice reads it exactly
 * as an organisation's old invoice does, from the facts on the invoice alone.
 */
export function feeVersusBenefit(r: ComparisonFacts): FeeVersusBenefit {
  return compare(r);
}

function compare(r: ComparisonFacts): FeeVersusBenefit {
  const guard = feeGuard();
  const allowances = pounds(r.claim_value_pence);
  const ctx = {
    main: pounds(r.pool_split_main_pence),
    special: pounds(r.pool_split_special_pence),
    period_start: r.period_start,
    is_company: r.entity_type === 'company',
    profits: null,
    client_vat: r.client_vat ?? null,
  };

  /* The rates to run at. A recorded one is a fact; otherwise both ends. */
  let rates: { label: string; rate: number }[];
  if (r.tax_rate !== null) {
    rates = [{ label: 'the recorded marginal rate', rate: r.tax_rate }];
  } else if (r.entity_type !== null) {
    const [lo, hi] = marginalRateRange(r.entity_type as EntityKey);
    rates = [
      { label: `lowest marginal rate for a ${entityWords(r.entity_type)}`, rate: lo },
      { label: `highest marginal rate for a ${entityWords(r.entity_type)}`, rate: hi },
    ];
  } else {
    rates = [];
  }

  const first = feeDisplay(allowances, rates[0]?.rate ?? null, ctx);

  if (rates.length === 0 || allowances === null) {
    return {
      computed: false,
      why: rates.length === 0
        ? 'we do not know yet if the client is a company or a partnership. ' +
          'Their tax rate depends on it, so we cannot work this out'
        : first.comparison.why,
      readings: [], exceeds_year_one: null, exceeds_cumulative: null, breakeven_year_one: [],
      unknowns: first.comparison.unknowns.map(inWords), assumptions: first.comparison.assumptions.map(inWords),
      disclosure: first.disclosure, switches: guard,
      amount_untouched: !first.capped,
      recommendation_threshold: noClaim([], rates.length === 0 ? null : first.recommendation_threshold.why),
    };
  }

  const displays = rates.map((x) => ({ x, d: feeDisplay(allowances, x.rate, ctx) }));
  const readings = displays.map(({ x, d }) => ({
    label: x.label, rate: x.rate,
    comparison: d.comparison,
  }));

  return {
    computed: readings.every((x) => x.comparison.computed),
    why: readings.find((x) => !x.comparison.computed)?.comparison.why ?? null,
    readings,
    exceeds_year_one: agree(readings.map((x) => x.comparison.fee_exceeds_year_one_benefit)),
    exceeds_cumulative: agree(readings.map((x) => x.comparison.fee_exceeds_cumulative_benefit)),
    breakeven_year_one: readings.map((x) => x.comparison.breakeven_fee_rate_year_one),
    unknowns: dedupe(readings.flatMap((x) => x.comparison.unknowns)).map(inWords),
    assumptions: dedupe(readings.flatMap((x) => x.comparison.assumptions)).map(inWords),
    disclosure: first.disclosure,
    switches: guard,
    amount_untouched: !first.capped,
    recommendation_threshold: noClaim(displays.map(({ x, d }) => ({ label: x.label, rate: x.rate, threshold: d.recommendation_threshold }))),
  };
}

/**
 * Two three-valued answers combined, and NULL IS THE ONLY HONEST DISAGREEMENT.
 *
 * true only where every reading says true; false only where every reading says
 * false; null wherever any reading is itself null or the readings differ. A
 * combiner that took the worse of the two, or the first, would be asserting
 * something neither reading supports.
 */
function agree(vs: readonly (boolean | null)[]): boolean | null {
  if (vs.length === 0) return null;
  if (vs.every((v) => v === true)) return true;
  if (vs.every((v) => v === false)) return false;
  return null;
}

/**
 * THE ENGINE'S SENTENCES, IN WORDS — the CRM follow-on. A comparison's unknowns and assumptions are the engine's own
 * sentences, and a few name the engine's modules — "the same refusal CB_POOL makes". A person reading the finance view is
 * not reading the code, so a module's name becomes what it is; the rest of the sentence is the engine's, untouched.
 */
const ENGINE_NAMES: readonly (readonly [RegExp, string])[] = [
  [/\bthe same refusal CB_POOL makes\b/g, 'the same reason we cannot split the pool'],
  [/\s*\(CB_CTA\.[A-Za-z0-9_]+\)/g, ' (waiting on the tax adviser)'],
  [/\bCB_[A-Z]+(?:\.[A-Za-z0-9_]+)?\b/g, 'our own rule'],
];

export function inWords(s: string): string {
  return ENGINE_NAMES.reduce((t, [re, w]) => t.replace(re, w), s);
}

function dedupe(xs: readonly string[]): string[] {
  return [...new Set(xs)];
}

function entityWords(entity: string): string {
  return entity === 'company' ? 'company'
    : entity === 'uninc_scot' ? 'Scottish unincorporated business'
      : 'unincorporated business';
}

function toRow(r: InvoiceDbRow): FinanceRow {
  return {
    invoice_id: r.id,
    business_id: r.business_id,
    client_name: r.name,
    claim_value_pence: r.claim_value_pence,
    fee_pence: r.fee_pence,
    claim_value: r.claim_value_pence === null ? 'not established' : formatPence(r.claim_value_pence),
    fee: r.fee_pence === null ? 'not computed' : formatPence(r.fee_pence),
    invoice_status: r.invoice_status as InvoiceStatus,
    invoice_label: INVOICE_WORDS[r.invoice_status as InvoiceStatus] ?? r.invoice_status,
    payment_status: r.payment_status as PaymentStatus,
    payment_label: PAYMENT_WORDS[r.payment_status as PaymentStatus] ?? r.payment_status,
    vat_position: r.vat_position,
    created_at: r.created_at,
    comparison: compare(r),
  };
}

/**
 * Every invoice this actor may read.
 *
 * AUTHORISED ONE ROW AT A TIME, and on the business as well as the invoice.
 * The client name is on the row, and entitlement to a name is `business.read`
 * — which ACCOUNTING holds for exactly this reason and for nothing else that
 * follows from it.
 */
export function invoices(db: Db, actor: Actor, limit = 200): FinanceRow[] {
  assertFinanceSection(actor);
  // CRM 7 of 10: AN ORGANISATION'S INVOICES FROM BEFORE INVOICES SAT ON THE CLAIM. A claim's invoice is src/web/invoices.ts's.
  return db.all<InvoiceDbRow>(`${INVOICE_SELECT}WHERE i.claim_id IS NULL ORDER BY i.created_at DESC, b.name ASC LIMIT ?`, [limit])
    .filter((r) =>
      can(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id })
      && can(actor, 'business.read', { type: 'business', id: r.business_id }))
    .map(toRow);
}

export function invoiceById(db: Db, actor: Actor, id: string): FinanceRow {
  const r = db.get<InvoiceDbRow>(`${INVOICE_SELECT}WHERE i.id = ? AND i.claim_id IS NULL`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id });
  authorise(actor, 'business.read', { type: 'business', id: r.business_id });
  return toRow(r);
}

/* ================================================================== *
 * WHAT THIS ROLE MAY CHANGE
 * ================================================================== */

export type FinanceDeps = { db: Db; audit: AuditLog; now: () => string };

/** PHASE 133e (D4, continued): `field` names the posted field a refusal is about, where it is about one. */
export type UpdateResult = { ok: true } | { ok: false; why: string; field?: string };

/**
 * Record that an invoice was raised or sent, or that money arrived.
 *
 * RECORDED, NOT COLLECTED. There is no card processor in this build, by
 * decision, and this function is the whole of what "payment" means here: a
 * person who has seen the bank tells the system what they saw. Nothing
 * initiates a payment, nothing reconciles one, and there is no route that
 * could.
 *
 * THE AMOUNTS ARE NOT WRITABLE HERE. The claim value is the engine's and the
 * fee is CB_FEE's 3% of it; a finance screen that could type over either would
 * be a second place the fee is decided. Changing them is a different action
 * with a different owner and it is not built.
 */
export function setStatuses(
  d: FinanceDeps, actor: Actor, invoice_id: string,
  input: { invoice_status: string; payment_status: string },
): UpdateResult {
  const r = d.db.get<{ id: string; business_id: string; claim_id: string | null }>(
    'SELECT id, business_id, claim_id FROM invoices WHERE id = ?', [invoice_id],
  );
  if (r === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'invoice.write', { type: 'invoice', id: r.id, business_id: r.business_id });
  // CRM 7 of 10: a claim's invoice is never typed into a state. It is raised, sent or cancelled, and what it is owed is read.
  if (r.claim_id !== null) {
    return {
      ok: false,
      why: 'You cannot type a claim invoice’s state. It shows what happened: raised, sent, cancelled, credited or paid.',
    };
  }

  if (!Object.prototype.hasOwnProperty.call(INVOICE_WORDS, input.invoice_status)) {
    return { ok: false, why: 'That is not an invoice state this system has.', field: 'invoice_status' };
  }
  if (!Object.prototype.hasOwnProperty.call(PAYMENT_WORDS, input.payment_status)) {
    return { ok: false, why: 'That is not a payment state this system has.', field: 'payment_status' };
  }
  if (input.invoice_status === 'NOT_RAISED' && input.payment_status !== 'UNPAID') {
    return {
      ok: false,
      why: 'Money cannot have arrived against an invoice that was never raised. Raise it first, ' +
        'or record what actually happened.',
      field: 'payment_status',
    };
  }

  d.db.run('UPDATE invoices SET invoice_status = ?, payment_status = ? WHERE id = ?',
    [input.invoice_status, input.payment_status, invoice_id]);

  d.audit.append({
    at: d.now(), kind: 'INVOICE_UPDATED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'invoice', object_id: invoice_id, outcome: 'ALLOWED',
    // The states, never the amounts. See the AuditKind comment in audit.ts.
    detail: { invoice_status: input.invoice_status, payment_status: input.payment_status },
  });
  return { ok: true };
}

/* ================================================================== *
 * THE HEADLINE
 * ================================================================== */

export type FinanceSummary = {
  readonly rows: readonly FinanceRow[];
  readonly raised: number;
  readonly paid: number;
  readonly outstanding: number;
  /** How many rows the comparison says our fee exceeds the year-one benefit on. */
  readonly fee_exceeds_year_one: number;
  /** How many it could not answer either way. Reported, never folded into the others. */
  readonly fee_undetermined: number;
  readonly fee_rate: number;
  readonly vat_note: string;
  readonly no_payments_note: string;
};

/**
 * VAT IS RECORDED, NOT DERIVED. Caprebate is not VAT registered — confirmed in
 * Phase 74, and the engagement letter says so — and the position is a column
 * on every invoice rather than a constant in this file, because the day that
 * changes it changes for new invoices and not for old ones.
 */
export const VAT_NOTE =
  'Cap Rebate is not VAT registered, so no VAT is charged on these fees and none is shown. The ' +
  'position is recorded on each invoice rather than assumed here, and the engagement letter ' +
  'states it to the client.';

export const NO_PAYMENTS_NOTE =
  'NO PAYMENT IS TAKEN ANYWHERE IN THIS SYSTEM. There is no card processor and no bank ' +
  'integration, by decision. What these screens hold is a record of what somebody saw: an ' +
  'invoice raised, an invoice sent, money received. Nothing here moves money.';

export function summary(db: Db, actor: Actor): FinanceSummary {
  const rows = invoices(db, actor);
  return {
    rows,
    raised: rows.filter((r) => r.invoice_status === 'RAISED' || r.invoice_status === 'SENT').length,
    paid: rows.filter((r) => r.payment_status === 'PAID').length,
    outstanding: rows.filter((r) =>
      (r.invoice_status === 'RAISED' || r.invoice_status === 'SENT')
      && r.payment_status !== 'PAID' && r.payment_status !== 'WRITTEN_OFF').length,
    fee_exceeds_year_one: rows.filter((r) => r.comparison.exceeds_year_one === true).length,
    fee_undetermined: rows.filter((r) => r.comparison.exceeds_year_one === null).length,
    fee_rate: feeRate(),
    vat_note: VAT_NOTE,
    no_payments_note: NO_PAYMENTS_NOTE,
  };
}
