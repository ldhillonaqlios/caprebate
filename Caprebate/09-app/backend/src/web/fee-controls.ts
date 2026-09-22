/**
 * THE FEE CONTROLS — BUILT, SHIPPED OFF, ONE SWITCH EACH. CRM 7 of 10, 11 September 2026.
 *
 * Commercial decisions that are open may not be guessed into a screen. So each
 * is BUILT, carries ONE SWITCH, and SHIPS OFF — and test/finance-claim.test.ts
 * proves that off is exactly today's behaviour: the plain 3% of the allowances
 * identified, no warning, and nothing but our fee raised on a claim at the
 * invoice stage.
 *
 *   the fee above the client's first-year benefit   CAP, WARN or ADJUST_RATE
 *     “Do we cap the fee, warn about it, or adjust the percentage?” — Lakhbir's
 *   the break fee and the abort fee                 read from the engagement letter
 *     “What is the break fee, and is there ever an abort fee or a fixed fee?” — Lakhbir's
 *
 * PHASE 132e, 16 SEPTEMBER 2026 — THE FEE IS A FLAT 3%, AND TWO THINGS ARE NO LONGER SWITCHES.
 *   A MINIMUM FEE — RETIRED AS DECIDED: NONE. Lakhbir, answering "Is our fee now a
 *     flat 3% of the allowances identified — with no minimum and no bands?": "yes,
 *     flat fee of 3% of the allowances for 1 or more properties". The switched-off
 *     per-sector control that stood here is removed, and the decision is recorded
 *     in MINIMUM_FEE_DECISION below, so the retirement is on the record and not a
 *     silent deletion. A minimum JOB SIZE was already decided none (1 September 2026).
 *   A MULTI-SITE DISCOUNT — DISCRETIONARY, NEVER AUTOMATIC. The 5/10/15% table is
 *     gone. The engine's CB_FEE.MULTI_SITE_DISCOUNT holds the largest discount and
 *     who approves it as named nulls; computeFee never reads a discount, and one a
 *     person enters is recorded (src/web/fee-discounts.ts) and shown as awaiting
 *     those two decisions.
 *
 * CHANGING A SWITCH IS A LINE OF CODE, NOT A SETTING, as FEE_TRIGGER in
 * src/web/pipeline.ts and FEE_CLAWBACK in src/web/claim-record.ts are: each is a
 * pricing policy, and a pricing policy that an admin screen could flip on a
 * Tuesday afternoon would be decided by whoever found the screen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE LETTER'S BLANKS ARE BLANK ON EVERY SCREEN, LOUDLY
 *
 * The break fee, the abort fee and the payment terms are read from the .docx
 * itself through src/web/letter.ts, never typed here. While clause 5 reads
 * “£[X]” the break fee is BLANK, and the screen says so in capitals: a plausible
 * number in a prototype becomes a number in a contract. Turning the break-and-
 * abort switch on changes nothing while the letter is blank.
 *
 * NOTHING HERE DECIDES A TAX FACT. The cap and the rate adjustment need the
 * client's first-year benefit, and CB_BENEFIT only DETERMINES one on a recorded
 * marginal rate; on a bounded range neither control fires — it refuses, and says
 * which fact is missing, rather than picking a number out of the range.
 */

import { feeDisplay, feeRate, marginalRateRange, multiSiteDiscount, type EntityKey, type FeeComparison } from './engine.ts';
import { loadLetter, type Letter } from './letter.ts';
import { formatPence, toPence } from './shown-range.ts';

/* ================================================================== *
 * 1 · THE QUESTIONS, QUOTED BY TITLE
 * ================================================================== */

export const ABOVE_BENEFIT_QUESTION = 'Do we cap the fee, warn about it, or adjust the percentage?';
/** Quoted for the record: the question the retired minimum-fee control waited on, now answered (MINIMUM_FEE_DECISION). */
export const MINIMUM_FEE_QUESTION = 'Is the small end of the market worth serving at all?';
/** The question the flat 3% answered, by title. */
export const FLAT_FEE_QUESTION = 'Is our fee now a flat 3% of the allowances identified — with no minimum and no bands?';

/**
 * A MINIMUM FEE — DECIDED: NONE. Phase 132e, 16 September 2026. The switched-off control that stood here from CRM 7 of
 * 10 (one amount per sector, every one unset) is retired rather than left for somebody to switch on. The £5,000 and
 * £7,500 in the minimum-fee paper were a recommendation, never a decision, and are not a floor anywhere.
 */
export const MINIMUM_FEE_DECISION = Object.freeze({
  decided: 'NONE' as const,
  by: 'Lakhbir',
  answer: 'yes, flat fee of 3% of the allowances for 1 or more properties',
  question: FLAT_FEE_QUESTION,
  retired: 'the old minimum fee for each sector. It was never switched on, and was removed on 16 September 2026',
});
export const BREAK_FEE_QUESTION = 'What is the break fee, and is there ever an abort fee or a fixed fee?';
/** Added to CAPREBATE QUESTIONS under Lakhbir by CRM 7 of 10: clause 4's payment terms are blank. */
export const PAYMENT_TERMS_QUESTION = 'How long does a client have to pay our invoice?';

export const NO_MINIMUM_JOB_SIZE =
  'There is no minimum job size — Lakhbir decided so on 1 September 2026 — so there is no switch for one. ' +
  'There is no minimum fee either — decided on 15 September 2026 with the flat 3% fee.';

/* ================================================================== *
 * 2 · THE SWITCHES — ALL OFF
 * ================================================================== */

export type AboveBenefitMode = 'CAP' | 'WARN' | 'ADJUST_RATE';

export const ABOVE_BENEFIT_MODES: Readonly<Record<AboveBenefitMode, string>> = Object.freeze({
  CAP: 'cap the fee at the client’s first-year saving',
  WARN: 'raise the plain fee, with a warning written onto the invoice record',
  ADJUST_RATE: 'lower the percentage to the rate at which the fee no longer exceeds the first-year saving',
});

export type FeeControls = {
  readonly above_benefit: { readonly enabled: boolean; readonly mode: AboveBenefitMode | null };
  readonly break_and_abort: { readonly enabled: boolean };
};

/** AS SHIPPED. Every switch off and no mode chosen. There is no minimum fee — see MINIMUM_FEE_DECISION. */
export const FEE_CONTROLS: FeeControls = Object.freeze({
  above_benefit: Object.freeze({ enabled: false, mode: null }),
  break_and_abort: Object.freeze({ enabled: false }),
});

/* ================================================================== *
 * 3 · WHAT THE LETTER SAYS — READ FROM THE DOCUMENT
 * ================================================================== */

export type LetterTerm =
  | { readonly state: 'BLANK'; readonly clause: string; readonly reads: string; readonly label: string }
  | { readonly state: 'SET'; readonly clause: string; readonly pence: number; readonly label: string }
  | { readonly state: 'NIL'; readonly clause: string; readonly label: string }
  | { readonly state: 'NOT_READABLE'; readonly clause: string; readonly label: string };

export type PaymentTerms =
  | { readonly state: 'BLANK'; readonly reads: string; readonly label: string }
  | { readonly state: 'DAYS'; readonly days: number; readonly label: string }
  | { readonly state: 'NOT_READABLE'; readonly label: string };

export type LetterFees = {
  readonly break_fee: LetterTerm;
  readonly abort_fee: LetterTerm;
  readonly payment_terms: PaymentTerms;
};

type LetterSource = Pick<Letter, 'paragraphs' | 'openTerms'>;

const CLAUSE_RE = /^(\d{1,2})\.\s+(.+)$/;

/** Each clause's text, joined, and the same with every square-bracket group removed. */
function clauses(letter: LetterSource): Map<string, { text: string; settled: string }> {
  const out = new Map<string, { text: string; settled: string }>();
  let current = 'preamble';
  for (const p of letter.paragraphs) {
    const m = CLAUSE_RE.exec(p.text);
    if (m) current = m[1] ?? current;
    const prev = out.get(current)?.text ?? '';
    const text = prev === '' ? p.text : `${prev}\n${p.text}`;
    out.set(current, { text, settled: stripBrackets(text) });
  }
  return out;
}

function stripBrackets(s: string): string {
  let out = '';
  let depth = 0;
  for (const c of s) {
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out;
}

function poundsToPence(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? toPence(n) : null;
}

/**
 * THE BREAK FEE, THE ABORT FEE AND THE PAYMENT TERMS, AS THE LETTER HAS THEM.
 *
 * A term still in square brackets is BLANK, and `reads` is the bracket itself so
 * the screen can quote it. A settled term is read by pattern from the clause
 * with every remaining bracket removed — clause 4's own blank carries the example
 * “within 14 days of invoice”, and an example inside a blank is not a term.
 * Anything settled that does not match is NOT_READABLE: never a guess.
 */
export function letterFees(letter?: LetterSource): LetterFees {
  const src = letter ?? loadLetter();
  const byClause = clauses(src);
  const clause4 = byClause.get('4') ?? { text: '', settled: '' };
  const clause5 = byClause.get('5') ?? { text: '', settled: '' };
  const open4 = src.openTerms.filter((t) => /^clause 4 —/.test(t.clause));
  const open5 = src.openTerms.filter((t) => /^clause 5 —/.test(t.clause));

  const breakBlank = open5.find((t) => /£\s*\[/.test(t.text) || /\[X\]/.test(t.text));
  const breakFee: LetterTerm = breakBlank !== undefined || /£\s*\[/.test(clause5.text)
    ? { state: 'BLANK', clause: 'clause 5', reads: breakBlank?.text ?? '£[X]',
        label: `BLANK IN THE ENGAGEMENT LETTER — clause 5 reads “£${breakBlank?.text ?? '[X]'}”. No break fee exists until it is decided.` }
    : (() => {
      const pence = poundsToPence(/break fee of £\s?([\d,]+(?:\.\d{1,2})?)/i.exec(clause5.settled)?.[1]);
      return pence === null
        ? { state: 'NOT_READABLE' as const, clause: 'clause 5', label: 'clause 5 is not blank, and no amount could be read from it — nothing is assumed' }
        : { state: 'SET' as const, clause: 'clause 5', pence, label: `${formatPence(pence)}, as clause 5 states` };
    })();

  const abortBlank = open4.find((t) => /abort fee|no fee is payable/i.test(t.text));
  const abortFee: LetterTerm = abortBlank !== undefined
    ? { state: 'BLANK', clause: 'clause 4', reads: abortBlank.text,
        label: `BLANK IN THE ENGAGEMENT LETTER — clause 4 reads “${abortBlank.text}”. No abort fee exists until it is decided.` }
    : /no material claim is identified[^.]*?,\s*no fee is payable/i.test(clause4.settled)
      ? { state: 'NIL', clause: 'clause 4', label: 'nil — clause 4 says no fee is payable where no material claim is identified' }
      : (() => {
        const pence = poundsToPence(/abort fee of £\s?([\d,]+(?:\.\d{1,2})?)/i.exec(clause4.settled)?.[1]);
        return pence === null
          ? { state: 'NOT_READABLE' as const, clause: 'clause 4', label: 'clause 4 does not say what is payable where no material claim is found — nothing is assumed' }
          : { state: 'SET' as const, clause: 'clause 4', pence, label: `${formatPence(pence)}, as clause 4 states` };
      })();

  const termsBlank = open4.find((t) => /payment terms/i.test(t.text));
  const days = /within\s+(\d{1,3})\s+days\s+of\s+(?:the\s+date\s+of\s+)?(?:the\s+|our\s+)?invoice/i.exec(clause4.settled)?.[1];
  const paymentTerms: PaymentTerms = termsBlank !== undefined
    ? { state: 'BLANK', reads: termsBlank.text,
        label: `BLANK IN THE ENGAGEMENT LETTER — clause 4 reads “${termsBlank.text}”. So no due date is set on any invoice, and none is assumed.` }
    : days !== undefined && Number(days) > 0
      ? { state: 'DAYS', days: Number(days), label: `within ${Number(days)} days of the invoice, as clause 4 states` }
      : { state: 'NOT_READABLE', label: 'clause 4 does not state a number of days from the invoice, so no due date is set and none is assumed' };

  return { break_fee: breakFee, abort_fee: abortFee, payment_terms: paymentTerms };
}

/* ================================================================== *
 * 4 · THE FEE ON A CLAIM — PLAIN, THEN EACH CONTROL THAT IS ON
 * ================================================================== */

/** What the fee is computed from — all of it copied onto the invoice when it is raised. */
export type FeeFacts = {
  readonly claim_value_pence: number;
  readonly sector: string | null;
  readonly entity_type: EntityKey | null;
  readonly tax_rate: number | null;
  readonly pool_split_main_pence: number | null;
  readonly pool_split_special_pence: number | null;
  readonly period_start: string | null;
};

export type ControlReadings = {
  readonly above_benefit: string;
  readonly minimum_fee: string;
  readonly multi_site_discount: string;
  readonly break_and_abort: string;
};

export type RefusalCode = 'ENGINE_WITHHELD' | 'ABOVE_BENEFIT_UNDETERMINED';

/** The multi-site discount in words, from the engine's own object — and never "applied". */
export function discountReading(): string {
  const m = multiSiteDiscount();
  const largest = m.largest_discount === null ? 'NOT DECIDED' : `${m.largest_discount}`;
  const approver = m.approved_by === null ? 'NOT DECIDED' : m.approved_by;
  return `a choice, never taken off a fee by the system. No discount is taken off any fee here. The largest discount (${largest}) ` +
    `and who approves it (${approver}) are still asked: “${m.asked}”. A discount a person enters is recorded and shown as waiting on that decision`;
}

export type FeeOutcome =
  | {
      readonly ok: true; readonly fee_pence: number; readonly fee_rate: number; readonly plain_fee_pence: number;
      readonly basis: string; readonly warning: string | null; readonly readings: ControlReadings;
    }
  | { readonly ok: false; readonly code: RefusalCode; readonly why: string; readonly readings: ControlReadings };

/** Each control in words, as it stood when a fee was computed. Written onto the invoice's basis. */
export function controlReadings(controls: FeeControls = FEE_CONTROLS): ControlReadings {
  const ab = controls.above_benefit;
  return {
    above_benefit: ab.enabled && ab.mode !== null
      ? `on — ${ABOVE_BENEFIT_MODES[ab.mode]}`
      : `off — the fee is not changed by the client’s first-year saving (“${ABOVE_BENEFIT_QUESTION}” is open)`,
    minimum_fee: `none — decided: there is no minimum fee (“${FLAT_FEE_QUESTION}”, answered “${MINIMUM_FEE_DECISION.answer}”)`,
    multi_site_discount: discountReading(),
    break_and_abort: controls.break_and_abort.enabled
      ? 'on — a break fee or an abort fee is raised only as the letter states it'
      : `off — no break fee and no abort fee is raised (“${BREAK_FEE_QUESTION}” is open)`,
  };
}

type Reading = { readonly label: string; readonly rate: number; readonly comparison: FeeComparison };

/**
 * THE FIRST-YEAR COMPARISON, ON A RECORDED RATE OR AT BOTH ENDS OF THE BAND —
 * the same readings src/web/finance.ts shows, so the control and the screen can
 * never disagree about what the benefit is.
 */
function readingsFor(f: FeeFacts): Reading[] {
  const allowances = f.claim_value_pence / 100;
  const ctx = {
    main: f.pool_split_main_pence === null ? null : f.pool_split_main_pence / 100,
    special: f.pool_split_special_pence === null ? null : f.pool_split_special_pence / 100,
    period_start: f.period_start, is_company: f.entity_type === 'company', profits: null,
  };
  const rates: { label: string; rate: number }[] = f.tax_rate !== null
    ? [{ label: 'the recorded marginal rate', rate: f.tax_rate }]
    : f.entity_type !== null
      ? (([lo, hi]) => [{ label: 'the lowest marginal rate', rate: lo }, { label: 'the highest marginal rate', rate: hi }])(marginalRateRange(f.entity_type))
      : [];
  return rates.map((r) => ({ ...r, comparison: feeDisplay(allowances, r.rate, ctx).comparison }));
}

function agree(vs: readonly (boolean | null)[]): boolean | null {
  if (vs.length === 0) return null;
  if (vs.every((v) => v === true)) return true;
  if (vs.every((v) => v === false)) return false;
  return null;
}

/**
 * THE FEE. PLAIN FIRST — CB_FEE's own display, 3% of the allowances identified —
 * then the first-year control, if it is on. With every control off, as shipped,
 * this returns the plain fee and no warning, and nothing else about it moves.
 * THERE IS NO MINIMUM (decided none, Phase 132e) AND NO DISCOUNT IS EVER READ HERE:
 * a multi-site discount is discretionary and is never applied automatically.
 *
 * A REFUSAL IS NOT A NUMBER. Where a control that is on cannot be applied on the
 * facts held, nothing is raised and the reason names the missing fact — a cap
 * against a bounded range would be choosing a number out of that range, in
 * whichever direction suited us.
 */
export function computeFee(f: FeeFacts, controls: FeeControls = FEE_CONTROLS): FeeOutcome {
  const readings = controlReadings(controls);
  const plain = feeDisplay(f.claim_value_pence / 100, null, {});
  if (!plain.render || plain.amount === null) {
    return { ok: false, code: 'ENGINE_WITHHELD', why: plain.reason ?? 'we could not work out a fee for this figure', readings };
  }
  const rate = feeRate();
  const plainPence = Math.round(plain.amount * 100);
  let fee = plainPence;
  let feeRateUsed = rate;
  let lowered = false;
  let warning: string | null = null;
  const basis: string[] = [`${Math.round(rate * 1000) / 10}% of the allowances identified, ${formatPence(f.claim_value_pence)} — ${formatPence(plainPence)}`];

  const ab = controls.above_benefit;
  if (ab.enabled && ab.mode !== null) {
    const rs = readingsFor(f);
    const exceeds = agree(rs.map((r) => r.comparison.fee_exceeds_year_one_benefit));
    if (ab.mode === 'WARN') {
      warning = exceeds === true
        ? `Our fee of ${formatPence(plainPence)} is more than the tax this client would relieve in their first year, on every reading we can make.`
        : exceeds === null
          ? 'Whether our fee is more than this client’s first-year saving cannot be said on the facts we hold — it is not assumed either way.'
          : null;
      basis.push(`the first-year control is on and warns${warning === null ? ' — the fee does not exceed the first-year saving on any reading' : ''}`);
    } else {
      const single = rs.length === 1 ? rs[0] : undefined;
      const c = single?.comparison;
      if (c === undefined || !c.computed || !c.determined) {
        return {
          ok: false, code: 'ABOVE_BENEFIT_UNDETERMINED', readings,
          why: `The first-year check is on (${ABOVE_BENEFIT_MODES[ab.mode]}). It needs the client’s first-year saving as one figure. ` +
            'For that we need their tax rate, the split of the spend and the period. We only have a range, and we will not pick a figure from it. Nothing is raised.',
        };
      }
      if (c.fee_exceeds_year_one_benefit === true) {
        if (ab.mode === 'CAP' && c.year_one_benefit !== null) {
          fee = Math.round(c.year_one_benefit * 100);
          feeRateUsed = fee / f.claim_value_pence;
          basis.push(`capped at the client’s first-year saving, ${formatPence(fee)}`);
        } else if (ab.mode === 'ADJUST_RATE' && c.breakeven_fee_rate_year_one !== null) {
          feeRateUsed = Math.floor(c.breakeven_fee_rate_year_one * 10000) / 10000;
          fee = Math.floor(f.claim_value_pence * feeRateUsed);
          basis.push(`the rate lowered to ${(feeRateUsed * 100).toFixed(2)}%, at which the fee no longer exceeds the first-year saving — ${formatPence(fee)}`);
        }
        lowered = fee < plainPence;
      } else {
        basis.push('the first-year control is on, and the fee does not exceed the first-year saving');
      }
    }
  }

  return { ok: true, fee_pence: fee, fee_rate: Math.min(1, feeRateUsed), plain_fee_pence: plainPence, basis: basis.join('; '), warning, readings };
}

/* ================================================================== *
 * 5 · THE BREAK FEE AND THE ABORT FEE
 * ================================================================== */

export type LetterFeeKind = 'BREAK_FEE' | 'ABORT_FEE';

export type LetterFeeOutcome =
  | { readonly ok: true; readonly fee_pence: number; readonly basis: string }
  | { readonly ok: false; readonly code: 'SWITCH_OFF' | 'LETTER_BLANK' | 'NOT_READABLE' | 'NIL'; readonly why: string };

/** A break fee or an abort fee — only with its switch on, and only as the letter states it. */
export function letterFee(kind: LetterFeeKind, controls: FeeControls = FEE_CONTROLS, letter?: LetterSource): LetterFeeOutcome {
  const what = kind === 'BREAK_FEE' ? 'break fee' : 'abort fee';
  if (!controls.break_and_abort.enabled) {
    return { ok: false, code: 'SWITCH_OFF', why: `No ${what} is raised: break fees and abort fees are switched off, and “${BREAK_FEE_QUESTION}” is for Lakhbir to decide.` };
  }
  const term = kind === 'BREAK_FEE' ? letterFees(letter).break_fee : letterFees(letter).abort_fee;
  if (term.state === 'BLANK') return { ok: false, code: 'LETTER_BLANK', why: `No ${what} is raised. ${term.label}` };
  if (term.state === 'NOT_READABLE') return { ok: false, code: 'NOT_READABLE', why: `No ${what} is raised: ${term.label}.` };
  if (term.state === 'NIL') return { ok: false, code: 'NIL', why: `No ${what} is raised: ${term.label}.` };
  return { ok: true, fee_pence: term.pence, basis: `the ${what}, ${term.label}` };
}

/* ================================================================== *
 * 6 · FOR THE SCREEN
 * ================================================================== */

export type ControlsView = {
  readonly readings: ControlReadings;
  readonly letter: { readonly break_fee: string; readonly abort_fee: string; readonly payment_terms: string };
  readonly any_blank: boolean;
  readonly no_minimum_job_size: string;
};

export function controlsView(controls: FeeControls = FEE_CONTROLS, letter?: LetterSource): ControlsView {
  const lf = letterFees(letter);
  return {
    readings: controlReadings(controls),
    letter: { break_fee: lf.break_fee.label, abort_fee: lf.abort_fee.label, payment_terms: lf.payment_terms.label },
    any_blank: lf.break_fee.state === 'BLANK' || lf.abort_fee.state === 'BLANK' || lf.payment_terms.state === 'BLANK',
    no_minimum_job_size: NO_MINIMUM_JOB_SIZE,
  };
}
