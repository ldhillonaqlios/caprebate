/**
 * Caprebate — Reconciliation Assertion (the hard gate)
 * Board item 12830173668. Phase 3, item 3.
 *
 * The s.562 apportionment splits the purchase consideration into three parts:
 *   A  qualifying plant and machinery
 *   B  non-qualifying building
 *   C  bare land
 *
 * A + B + C must equal the consideration actually paid. If it does not, the
 * system BLOCKS signature. Not warns. Not flags. Blocks.
 *
 * Three assertions, all blocking:
 *   AS-1  A + B + C  ==  apportionment base        (the apportionment is exhaustive)
 *   AS-2  apportionment base  ==  consideration + itemised adjustments
 *   AS-3  where a valid s.198 election exists, A == the election figure  (I-15)
 *
 * All money is INTEGER PENCE. There is no floating-point currency anywhere in
 * this module, because a gate that fails on 0.30000000000000004 is a gate
 * people learn to distrust.
 */

import type { Cell, Grade } from './caprebate-source-register.ts';

/* ------------------------------------------------------------------ *
 * 1. Money
 * ------------------------------------------------------------------ */

/** Integer pence. Never a float. */
export type Pence = number;

export function assertIntegerPence(n: unknown, label: string): asserts n is Pence {
  if (typeof n !== 'number' || !Number.isSafeInteger(n)) {
    throw new AssertionInputError('E_NOT_PENCE', `${label} must be an integer number of pence, got ${String(n)}`);
  }
}

export function formatGBP(p: Pence): string {
  const neg = p < 0;
  const abs = Math.abs(p);
  const pounds = Math.floor(abs / 100).toLocaleString('en-GB');
  const pence = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}£${pounds}.${pence}`;
}

export class AssertionInputError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'AssertionInputError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ *
 * 2. Evidence
 * ------------------------------------------------------------------ */

export type Evidence = {
  publisher: string;
  locator: string;
  retrieved_at: string;
  grade: Grade;
};

export type Component = {
  /** 'A' | 'B' | 'C', or an adjustment label. */
  label: string;
  amount: Pence;
  evidence: Evidence;
};

/** Adapter from an item-1 provenance cell holding a pence value. */
export function componentFromCell(label: string, cell: Cell<number>): Component {
  if (cell.state !== 'VALUE') {
    throw new AssertionInputError(
      'E_UNKNOWN_COMPONENT',
      `${label} is ${cell.state} — an apportionment component may not be UNKNOWN. Route it to capture`,
    );
  }
  assertIntegerPence(cell.value, label);
  return {
    label,
    amount: cell.value as Pence,
    evidence: {
      publisher: cell.prov.publisher,
      locator: cell.prov.retrieval.locator,
      retrieved_at: cell.prov.retrieval.retrieved_at,
      grade: cell.prov.grade,
    },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Adjustments — how the consideration becomes the apportionment base
 *
 * GC-03 in the Report Pack: purchase £317,000, apportioned base £332,850.
 * The base is NOT the price paid, and the difference must be itemised rather
 * than assumed. There is deliberately NO catch-all adjustment kind: a
 * general "apportionment adjustment" line is exactly how an unexplained
 * residual gets buried, and burying it is the failure this item prevents.
 * ------------------------------------------------------------------ */

export type AdjustmentKind =
  | 'ACQUISITION_LEGAL_FEES'      // + capitalised legal costs of acquisition
  | 'ACQUISITION_AGENT_FEES'      // + capitalised agent / surveyor fees
  | 'SDLT_CAPITALISED'            // + stamp duty land tax, where capitalised
  | 'VAT_IRRECOVERABLE_ADDED'     // + VAT that cannot be recovered
  | 'VAT_RECOVERABLE_EXCLUDED'    // - VAT that can be recovered
  | 'CHATTELS_EXCLUDED'           // - moveable chattels: not part of the property apportionment
  | 'GOODWILL_EXCLUDED'           // - goodwill on a going-concern purchase
  | 'STOCK_EXCLUDED'              // - stock and consumables
  | 'APPORTIONED_OUTGOINGS';      // +/- completion-statement apportionments (rates, rent)

/** Kinds whose tax treatment is a CTA question, not an engineering one. */
export const CTA_FLAGGED_KINDS: readonly AdjustmentKind[] = [
  'SDLT_CAPITALISED',
  'VAT_IRRECOVERABLE_ADDED',
  'VAT_RECOVERABLE_EXCLUDED',
  'ACQUISITION_LEGAL_FEES',
  'ACQUISITION_AGENT_FEES',
];

export type Adjustment = {
  kind: AdjustmentKind;
  /** Signed. Positive adds to the base, negative removes from it. */
  amount: Pence;
  narrative: string;
  evidence: Evidence;
};

/* ------------------------------------------------------------------ *
 * 4. The apportionment
 * ------------------------------------------------------------------ */

export type S198Election = {
  /** Only a valid, evidenced election engages AS-3. I-15: an asserted election is not an election. */
  validity: 'VALID_EVIDENCED' | 'ASSERTED_UNEVIDENCED' | 'NONE';
  /** The fixtures figure the election fixes, in pence. Null unless VALID_EVIDENCED. */
  fixtures_amount: Pence | null;
  evidence: Evidence | null;
};

export type Apportionment = {
  job_id: string;
  /** The consideration actually paid, as evidenced. */
  consideration: Component;
  /** How the consideration becomes the base. May be empty, in which case base == consideration. */
  adjustments: readonly Adjustment[];
  /** The base the surveyor apportioned. */
  base: Component;
  A_qualifying_plant: Component;
  B_building_non_qualifying: Component;
  C_bare_land: Component;
  s198: S198Election;
};

/* ------------------------------------------------------------------ *
 * 5. Tolerance
 *
 * THE TOLERANCE IS ZERO.
 *
 * "Rounding only" is implemented as "rounding is allocated, not tolerated".
 * The stored figures are integer pence, so a correct apportionment sums
 * exactly. Presentation rounding to whole pounds is a separate, later step,
 * and the residual it creates is explicitly allocated and printed — it never
 * becomes slack in the gate.
 * ------------------------------------------------------------------ */

export const GATE_TOLERANCE_PENCE = 0;

/**
 * The only tolerance that exists anywhere, and it applies to the PRINTED table
 * rather than the gate: three components each rounded to the nearest pound can
 * drift at most 150 pence from their exact sum. The residual is allocated to
 * the largest component so the printed table foots. See §8.
 */
export const PRESENTATION_MAX_RESIDUAL_PENCE = 150;

/* ------------------------------------------------------------------ *
 * 6. The assertions
 * ------------------------------------------------------------------ */

export type AssertionId = 'AS-1' | 'AS-2' | 'AS-3';

export type AssertionFailure = {
  id: AssertionId;
  title: string;
  /** Signed: positive means the parts exceed the whole. */
  discrepancy: Pence;
  direction: 'OVER_APPORTIONED' | 'UNDER_APPORTIONED';
  /** Rendered for the surveyor. Not a validation string. */
  statement: string;
  lines: { label: string; amount: Pence; source: string }[];
  likely_causes: string[];
};

export type AssertionResult = {
  job_id: string;
  passed: boolean;
  failures: AssertionFailure[];
  checked_at: string;
};

const src = (e: Evidence) => `${e.publisher} — ${e.locator} (retrieved ${e.retrieved_at}, grade ${e.grade})`;

function baseFromConsideration(a: Apportionment): Pence {
  return a.consideration.amount + a.adjustments.reduce((s, x) => s + x.amount, 0);
}

/** AS-1: the apportionment must be exhaustive. Nothing falls between the three parts. */
function checkAS1(a: Apportionment): AssertionFailure | null {
  const parts = a.A_qualifying_plant.amount + a.B_building_non_qualifying.amount + a.C_bare_land.amount;
  const diff = parts - a.base.amount;
  if (Math.abs(diff) <= GATE_TOLERANCE_PENCE) return null;
  return {
    id: 'AS-1',
    title: 'The apportionment does not sum to the base',
    discrepancy: diff,
    direction: diff > 0 ? 'OVER_APPORTIONED' : 'UNDER_APPORTIONED',
    statement:
      `A + B + C comes to ${formatGBP(parts)}. The apportionment base is ${formatGBP(a.base.amount)}. ` +
      `The apportionment is ${diff > 0 ? 'over' : 'under'} by ${formatGBP(Math.abs(diff))}. ` +
      'Signature is blocked until the three parts sum exactly to the base.',
    lines: [
      { label: 'A — qualifying plant and machinery', amount: a.A_qualifying_plant.amount, source: src(a.A_qualifying_plant.evidence) },
      { label: 'B — non-qualifying building', amount: a.B_building_non_qualifying.amount, source: src(a.B_building_non_qualifying.evidence) },
      { label: 'C — bare land', amount: a.C_bare_land.amount, source: src(a.C_bare_land.evidence) },
      { label: 'Apportionment base', amount: a.base.amount, source: src(a.base.evidence) },
    ],
    likely_causes: [
      'The s.562 multiplier was applied to two components but not the third.',
      'The bare-site value (C) was taken on a different basis or date from the rebuild costs used for A and B.',
      'One component is still holding a draft figure from before the reviewer pass.',
      'An element was moved between A and B without the counterpart adjustment.',
      'A component was rounded to pounds before being stored, instead of at presentation.',
    ],
  };
}

/** AS-2: the base must reconcile back to the consideration through itemised adjustments. */
function checkAS2(a: Apportionment): AssertionFailure | null {
  const derived = baseFromConsideration(a);
  const diff = a.base.amount - derived;
  if (Math.abs(diff) <= GATE_TOLERANCE_PENCE) return null;
  return {
    id: 'AS-2',
    title: 'The apportionment base does not reconcile to the consideration',
    discrepancy: diff,
    direction: diff > 0 ? 'OVER_APPORTIONED' : 'UNDER_APPORTIONED',
    statement:
      `The consideration is ${formatGBP(a.consideration.amount)}. With the ${a.adjustments.length} itemised ` +
      `adjustment${a.adjustments.length === 1 ? '' : 's'} this gives ${formatGBP(derived)}, but the base being ` +
      `apportioned is ${formatGBP(a.base.amount)} — a difference of ${formatGBP(Math.abs(diff))}. ` +
      'Every pound of the difference between the price paid and the base must be a named, evidenced ' +
      'adjustment. Signature is blocked.',
    lines: [
      { label: 'Consideration paid', amount: a.consideration.amount, source: src(a.consideration.evidence) },
      ...a.adjustments.map((x) => ({ label: `${x.kind} — ${x.narrative}`, amount: x.amount, source: src(x.evidence) })),
      { label: 'Apportionment base as stated', amount: a.base.amount, source: src(a.base.evidence) },
    ],
    likely_causes: [
      'Acquisition costs were included in the base but not itemised as an adjustment.',
      'Moveable chattels are inside the consideration and have not been deducted.',
      'VAT is included on one side and excluded on the other.',
      'Goodwill or stock on a going-concern purchase has not been separated out.',
      'The completion-statement apportionments (rates, rent) were netted into the price.',
    ],
  };
}

/** AS-3: a valid s.198 election fixes A. I-15 — an asserted election is not an election. */
function checkAS3(a: Apportionment): AssertionFailure | null {
  if (a.s198.validity !== 'VALID_EVIDENCED') return null;
  if (a.s198.fixtures_amount === null) {
    throw new AssertionInputError('E_ELECTION_NO_FIGURE', 'a VALID_EVIDENCED s.198 election must carry a figure');
  }
  const diff = a.A_qualifying_plant.amount - a.s198.fixtures_amount;
  if (diff === 0) return null;
  return {
    id: 'AS-3',
    title: 'A does not match the s.198 election',
    discrepancy: diff,
    direction: diff > 0 ? 'OVER_APPORTIONED' : 'UNDER_APPORTIONED',
    statement:
      `A is computed at ${formatGBP(a.A_qualifying_plant.amount)}, but a valid s.198 election fixes the ` +
      `fixtures figure at ${formatGBP(a.s198.fixtures_amount)}. Where a valid election exists it governs: ` +
      'the pool split comes off the election. Signature is blocked until A equals the election figure and ' +
      'B or C absorbs the difference.',
    lines: [
      { label: 'A — as computed', amount: a.A_qualifying_plant.amount, source: src(a.A_qualifying_plant.evidence) },
      { label: 'A — as fixed by the s.198 election', amount: a.s198.fixtures_amount, source: a.s198.evidence ? src(a.s198.evidence) : 'no evidence recorded' },
    ],
    likely_causes: [
      'The election was found after the build-up was completed and the build-up was not revisited.',
      'The election figure was read as the whole fixtures pool where it in fact covers only part.',
      'A s.200(4) reduction has rewritten an earlier election downwards — check the s.203 notification position.',
    ],
  };
}

export function assertReconciliation(a: Apportionment, now: string): AssertionResult {
  for (const c of [a.consideration, a.base, a.A_qualifying_plant, a.B_building_non_qualifying, a.C_bare_land]) {
    assertIntegerPence(c.amount, c.label);
  }
  for (const adj of a.adjustments) assertIntegerPence(adj.amount, adj.kind);

  const failures = [checkAS1(a), checkAS2(a), checkAS3(a)].filter((f): f is AssertionFailure => f !== null);
  return { job_id: a.job_id, passed: failures.length === 0, failures, checked_at: now };
}

/* ------------------------------------------------------------------ *
 * 7. The gate — the assertion lives INSIDE the signature, not beside it
 * ------------------------------------------------------------------ */

declare const SIG_BRAND: unique symbol;

/**
 * A signature can only be minted by signCAVR(), which runs the assertion first.
 * There is no code path from an apportionment to a signature that skips the
 * check — the same structural device as the provenance Cell in item 12830181420.
 */
export type SignedCAVR = {
  readonly [SIG_BRAND]: 'caprebate.signature.v1';
  readonly job_id: string;
  readonly signed_by: string;
  readonly rics_number: string;
  readonly signed_at: string;
  readonly assertion: AssertionResult;
  readonly apportionment: Apportionment;
};

export class SignatureBlocked extends Error {
  code = 'E_SIGNATURE_BLOCKED';
  result: AssertionResult;
  constructor(result: AssertionResult) {
    super(
      `[E_SIGNATURE_BLOCKED] ${result.failures.length} reconciliation assertion` +
        `${result.failures.length === 1 ? '' : 's'} failed on job ${result.job_id}: ` +
        result.failures.map((f) => f.id).join(', '),
    );
    this.name = 'SignatureBlocked';
    this.result = result;
  }
}

export type BlockEvent = {
  job_id: string;
  blocked_at: string;
  attempted_by: string;
  failures: { id: AssertionId; discrepancy: Pence }[];
};

export type SignInput = {
  apportionment: Apportionment;
  signed_by: string;
  rics_number: string;
  now: string;
  /** Every blocked attempt is recorded. The record is the evidence the gate held. */
  onBlocked?: (e: BlockEvent) => void;
};

export function signCAVR(input: SignInput): SignedCAVR {
  const result = assertReconciliation(input.apportionment, input.now);
  if (!result.passed) {
    input.onBlocked?.({
      job_id: input.apportionment.job_id,
      blocked_at: input.now,
      attempted_by: input.signed_by,
      failures: result.failures.map((f) => ({ id: f.id, discrepancy: f.discrepancy })),
    });
    throw new SignatureBlocked(result);
  }
  return {
    job_id: input.apportionment.job_id,
    signed_by: input.signed_by,
    rics_number: input.rics_number,
    signed_at: input.now,
    assertion: result,
    apportionment: input.apportionment,
  } as unknown as SignedCAVR;
}

/* ------------------------------------------------------------------ *
 * 8. Presentation rounding — allocated, not tolerated
 * ------------------------------------------------------------------ */

export type RoundedPresentation = {
  A_pounds: number;
  B_pounds: number;
  C_pounds: number;
  base_pounds: number;
  /** Where the pennies went. Printed on the face of the CAVR. */
  residual_pence: Pence;
  residual_allocated_to: 'A' | 'B' | 'C';
  footnote: string;
};

/**
 * Rounds the three parts to whole pounds for the printed table, then allocates
 * the rounding residual to the largest component so the printed table foots
 * exactly. The residual is stated, never absorbed silently.
 */
export function presentRounded(a: Apportionment): RoundedPresentation {
  const basePounds = Math.round(a.base.amount / 100);
  const raw = {
    A: Math.round(a.A_qualifying_plant.amount / 100),
    B: Math.round(a.B_building_non_qualifying.amount / 100),
    C: Math.round(a.C_bare_land.amount / 100),
  };
  const residualPounds = basePounds - (raw.A + raw.B + raw.C);
  const residualPence = residualPounds * 100;

  if (Math.abs(residualPence) > PRESENTATION_MAX_RESIDUAL_PENCE) {
    throw new AssertionInputError(
      'E_RESIDUAL_TOO_LARGE',
      `presentation residual ${formatGBP(residualPence)} exceeds the maximum possible from rounding three ` +
        `components (${formatGBP(PRESENTATION_MAX_RESIDUAL_PENCE)}). This is not a rounding difference — ` +
        'run the assertion.',
    );
  }

  const largest = (['A', 'B', 'C'] as const).reduce((m, k) => (raw[k] > raw[m] ? k : m), 'A' as 'A' | 'B' | 'C');
  const out = { ...raw, [largest]: raw[largest] + residualPounds } as Record<'A' | 'B' | 'C', number>;

  return {
    A_pounds: out.A,
    B_pounds: out.B,
    C_pounds: out.C,
    base_pounds: basePounds,
    residual_pence: residualPence,
    residual_allocated_to: largest,
    footnote:
      residualPounds === 0
        ? 'Components are stated to the nearest pound and sum exactly to the apportionment base.'
        : `Components are stated to the nearest pound. A rounding difference of ${formatGBP(Math.abs(residualPence))} ` +
          `has been allocated to component ${largest} so that the table sums to the apportionment base.`,
  };
}

/* ------------------------------------------------------------------ *
 * 9. What the surveyor sees
 * ------------------------------------------------------------------ */

export function explainFailure(result: AssertionResult): string {
  if (result.passed) return `Reconciliation passed. A + B + C equals the apportionment base exactly.`;

  const out: string[] = [];
  out.push('SIGNATURE BLOCKED');
  out.push('');
  out.push(
    `The apportionment for job ${result.job_id} does not reconcile. A chartered surveyor's signature ` +
      'cannot be applied to an apportionment that does not add up, so this is a block rather than a warning. ' +
      'There is no override.',
  );

  for (const f of result.failures) {
    out.push('');
    out.push(`--- ${f.id}: ${f.title} ---`);
    out.push('');
    out.push(f.statement);
    out.push('');
    for (const l of f.lines) {
      out.push(`  ${l.label.padEnd(46)} ${formatGBP(l.amount).padStart(16)}`);
      out.push(`  ${''.padEnd(46)} ${l.source}`);
    }
    out.push('');
    out.push(`  Discrepancy: ${formatGBP(f.discrepancy)} (${f.direction.replace('_', '-').toLowerCase()})`);
    out.push('');
    out.push('  Most likely causes, in the order worth checking:');
    f.likely_causes.forEach((c, i) => out.push(`    ${i + 1}. ${c}`));
  }

  out.push('');
  out.push(
    'To clear this, change the figures — do not absorb the difference. The residual belongs wherever it ' +
      'arose, in the build-up, the land value or the adjustment schedule.',
  );
  return out.join('\n');
}

/* ------------------------------------------------------------------ *
 * 10. Where the check runs
 * ------------------------------------------------------------------ */

export type FlowStage = 'DRAFT_RECOMPUTE' | 'PRE_REVIEWER' | 'PRE_SIGNATURE' | 'REPORT_RENDER' | 'RELEASE_CHECK';

export type StagePolicy = { stage: FlowStage; blocking: boolean; note: string };

/**
 * The check runs five times. Only PRE_SIGNATURE and beyond are blocking; the
 * earlier runs are feedback while the surveyor is still working, because a
 * half-built apportionment obviously does not sum yet and blocking there would
 * teach people that the block is noise.
 */
export const STAGE_POLICY: readonly StagePolicy[] = [
  { stage: 'DRAFT_RECOMPUTE', blocking: false, note: 'Live feedback while the build-up is being edited. Advisory.' },
  { stage: 'PRE_REVIEWER', blocking: false, note: 'Advisory. The reviewer pass changes figures by design — in the calibration case it moved qualifying from 20.0% to 22.2%.' },
  { stage: 'PRE_SIGNATURE', blocking: true, note: 'HARD GATE. Inside signCAVR(); there is no path to a signature that skips it.' },
  { stage: 'REPORT_RENDER', blocking: true, note: 'HARD GATE. Re-run against the signed figures — a failure here means something changed after signature.' },
  { stage: 'RELEASE_CHECK', blocking: true, note: 'HARD GATE. Report Pack §6 release checks, alongside the s.203 section check.' },
];

export function isBlockingAt(stage: FlowStage): boolean {
  const p = STAGE_POLICY.find((x) => x.stage === stage);
  if (!p) throw new AssertionInputError('E_UNKNOWN_STAGE', `unknown flow stage '${stage}'`);
  return p.blocking;
}

/* ------------------------------------------------------------------ *
 * 11. Override
 *
 * There is none. Not a configurable one set to false — none. The recommendation
 * and its reasoning are in the spec sheet; this constant exists so that a future
 * reader looking for the override finds the reason instead of adding one.
 * ------------------------------------------------------------------ */

export const OVERRIDE_AVAILABLE = false as const;

export const OVERRIDE_RATIONALE =
  'A + B + C = base is arithmetic, not judgement. No correct apportionment fails it, so every failure is a ' +
  'defect in our figures. An override would be used — under deadline pressure on a £4 discrepancy — and the ' +
  'same control is then available for a £40,000 one, which the mechanism cannot distinguish. The signature is ' +
  'the product: a chartered surveyor stating that an apportionment is correct over a known arithmetic failure ' +
  'is a false professional statement, with PI cover and RICS registration behind it. And an override log is ' +
  'disclosable — "the system flagged that it did not add up and someone clicked past it" is the worst possible ' +
  'document to produce in an enquiry. The legitimate escape is not an override: it is to change the figures.';
