/**
 * THE STAGE VOCABULARY — one list, and it is not a new one.
 *
 * The client portal has to say where a claim is "in their words". Two
 * vocabularies already existed when this phase started and neither was a list
 * a screen could read:
 *
 *   · `businesses.stage` (migration 002, Phase 103) carries MACHINE KEYS —
 *     ASSESSMENT_SUBMITTED, RESEARCH_PART_RUN, ENGAGEMENT_SIGNED, AT_SURVEY,
 *     INVOICED, PAID. Phase 106 sorts the engaged-client list on them.
 *
 *   · `caprebate-business-flow-v2.html` carries the CLIENT-FACING WORDING as
 *     eleven step titles across two named parts — "The funnel" and "Building
 *     the defensible figure". Those are the words a person wrote for a person.
 *
 * SO THIS FILE MAPS; IT DOES NOT INVENT. Every `label` below is the business
 * flow's own `title`, transcribed rather than improved, and every `key` is a
 * value migration 002 already stores. Writing a third set of words here — even
 * better ones — is exactly what the phase brief forbids, because the client
 * would then read one thing, the staff list would sort on another, and the
 * document that defined the process would agree with neither.
 *
 * THE BUSINESS FLOW IS ARCHIVED BY THIS PHASE. Its content did not vanish; the
 * eleven titles are here, and that is the only place a screen reads them from.
 */

export type StageKey =
  | 'ASSESSMENT_SUBMITTED'
  | 'RESEARCH_PART_RUN'
  | 'ENGAGEMENT_SIGNED'
  | 'AT_SURVEY'
  | 'INVOICED'
  | 'PAID';

export type Stage = {
  /** The stored value in `businesses.stage`. */
  readonly key: StageKey;
  /** The business flow's step number, so the two can be checked against each other. */
  readonly step: number;
  /** Which of the flow's two parts this sits in. */
  readonly part: 'The funnel' | 'Building the defensible figure';
  /** VERBATIM from caprebate-business-flow-v2.html. Do not reword. */
  readonly label: string;
  /**
   * What the client should understand is happening, in the second person.
   * Written for this phase because the flow document is written for us rather
   * than for them — and marked as such so nobody mistakes it for a transcript.
   */
  readonly toTheClient: string;
};

/**
 * The six stages a business can actually be in, in order.
 *
 * WHY SIX AND NOT ELEVEN. The flow has eleven steps; `businesses.stage` has six
 * values. The missing five are not lost — steps 1 to 3 all resolve to
 * ASSESSMENT_SUBMITTED (a client who has submitted has passed all three), and
 * steps 9 to 11 sit inside INVOICED and PAID. THE PORTAL SHOWS THE SIX IT CAN
 * EVIDENCE. A progress bar with eleven ticks, five of which no column can
 * substantiate, is a decoration.
 */
export const STAGES: readonly Stage[] = Object.freeze([
  {
    key: 'ASSESSMENT_SUBMITTED', step: 2, part: 'The funnel',
    label: 'The engine runs → a narrowed estimate',
    toTheClient:
      'You have answered the qualifying questions and we have given you an indicative range. ' +
      'It is a ceiling built from what you told us, and nothing has been looked up yet.',
  },
  {
    key: 'ENGAGEMENT_SIGNED', step: 4, part: 'The funnel',
    label: 'Engagement — letter, data & AI consent, fee basis',
    toTheClient:
      'The engagement letter is signed. That is what lets us start looking things up on your behalf.',
  },
  {
    key: 'RESEARCH_PART_RUN', step: 5, part: 'The funnel',
    label: 'The research automation begins → a researched estimate',
    toTheClient:
      'We are pulling what the public records hold about the property and re-running the figure on real ' +
      'data. Most of what was a question becomes a confirmation.',
  },
  {
    key: 'AT_SURVEY', step: 8, part: 'Building the defensible figure',
    label: 'Chartered sign-off',
    toTheClient:
      'A chartered surveyor is valuing the property and a chartered tax adviser reviews the filing ' +
      'position. This is the step that turns an estimate into a figure that stands up.',
  },
  {
    key: 'INVOICED', step: 10, part: 'Building the defensible figure',
    label: 'Filing & recovery',
    toTheClient: 'The claim is with your accountant for filing, and our fee has been invoiced.',
  },
  {
    key: 'PAID', step: 11, part: 'Building the defensible figure',
    label: 'Aftercare & learning',
    toTheClient: 'Everything is filed and settled. We keep the file so the position can be defended.',
  },
]);

/**
 * THE ORDER STAGES HAPPEN IN, which is NOT the order 002 lists them and not
 * alphabetical either. Engagement is signed BEFORE the research runs — that is
 * the whole shape of the two-tier gate: free calls fire on permission, paid
 * calls only after a signed engagement. A progress bar that put research before
 * engagement would draw the gate the wrong way round.
 */
const ORDER: readonly StageKey[] = Object.freeze(STAGES.map((s) => s.key));

export function stageIndex(key: string): number {
  return ORDER.indexOf(key as StageKey);
}

/** The stage record, or undefined for a value this vocabulary does not know. */
export function stage(key: string): Stage | undefined {
  return STAGES.find((s) => s.key === key);
}

/**
 * Progress, for a screen.
 *
 * AN UNKNOWN STAGE IS NOT STAGE ZERO. A business whose stored stage is not in
 * this list returns `known: false` and the portal says so, rather than drawing
 * an empty bar that reads as "nothing has happened yet". That is N4 applied to
 * a progress indicator: absent must not become a favourable-looking default,
 * and "we do not know where this is" is the honest render.
 */
export type Progress = {
  readonly known: boolean;
  readonly current?: Stage;
  readonly steps: readonly { readonly stage: Stage; readonly state: 'done' | 'current' | 'todo' }[];
};

export function progressFor(storedStage: string): Progress {
  const i = stageIndex(storedStage);
  if (i < 0) return { known: false, steps: [] };
  const current = STAGES[i];
  if (current === undefined) return { known: false, steps: [] };
  return {
    known: true,
    current,
    steps: STAGES.map((s, n) => ({
      stage: s,
      state: n < i ? 'done' : n === i ? 'current' : 'todo',
    })),
  };
}

/* ================================================================== *
 * THE OPERATING PROCEDURE'S STAGES — THE CLAIM'S VOCABULARY.
 * CRM 2 of 10, 10 September 2026.
 * ================================================================== */

/**
 * THE SAME RULE, A SECOND VOCABULARY: MAP, DO NOT INVENT.
 *
 * A claim's stage is the standard operating procedure's — ten stages from
 * enquiry to defence pack, a gate at every one and a reasoned way out —
 * transcribed from 08-monday-doc-exports/12552682457__Item-2-Standard-
 * Operating-Procedures-enquiry-to-defence-pack.md. `label` is the words of that
 * stage's SOP heading before its parenthesis; `gate` is the process map's own
 * GATE line; the exit words are the map's own EXIT lines. test/pipeline.test.ts
 * reads the export and checks every one of them is in it.
 *
 * Where a board reference sat inside a transcribed line it is left out and the
 * gap is marked `…` — a screen a person reads carries no board ids.
 *
 * THE SIX CLIENT-FACING KEYS ABOVE ARE UNCHANGED, AND THE PORTAL STILL READS
 * ONLY THOSE. Each procedure stage below names the one client stage its ENTRY
 * EVIDENCES — the furthest label that is true of every claim that has reached
 * it, and never a label claiming a fact the stage does not establish. Where
 * that understates how far a claim has got, it understates: "Chartered sign-off"
 * shown while the report is being accepted is behind the truth, and "Filing &
 * recovery — our fee has been invoiced" shown before an invoice exists would be
 * ahead of it. RESEARCH_PART_RUN and PAID are never a target: the first is
 * evidenced by the research record and the second by a payment, not by a stage.
 *
 * The CRM documents' own stage names — Information Requested, Survey Booked,
 * Client Review, Claim Ready and the rest — are NOT here. They are sub-states or
 * tasks inside these stages, and the mapping is in the disposition table,
 * section 9.
 */
export const PROCEDURE_KEYS = [
  'ENQUIRY', 'ASSESSMENT', 'ENGAGEMENT', 'DATA_GATHERING', 'SURVEY', 'VALUATION',
  'TAX_ADVISER_SIGNOFF', 'REPORTS', 'INVOICE', 'DEFENCE_PACK',
] as const;
export type ProcedureKey = (typeof PROCEDURE_KEYS)[number];

export const EXIT_KEYS = [
  'DECLINED_AT_ENQUIRY', 'CLIENT_DID_NOT_PROCEED', 'CLIENT_DECLINED_TO_SIGN', 'REASONED_NEGATIVE',
  'CLIENT_WITHDREW', 'OUTSIDE_AMENDMENT_WINDOW', 'CANCELLED', 'LOST',
] as const;
export type ExitKey = (typeof EXIT_KEYS)[number];

export type ClaimStageKey = ProcedureKey | 'CLOSED' | ExitKey | 'ON_HOLD';

export type ProcedureStage = {
  readonly key: ProcedureKey;
  /** The SOP's own number, 1 to 10. */
  readonly sop: number;
  /** VERBATIM: the SOP heading's words before its parenthesis. */
  readonly label: string;
  /** VERBATIM: the process map's GATE line, whitespace collapsed; `…` marks an omitted board reference. */
  readonly gate: string;
  /**
   * VERBATIM: the SOP's "Owner:" line — who is responsible for the stage
   * (disposition row 29.4). `…` marks an omitted name or board reference. CRM 3
   * of 10 makes it the owner of the stage's next action.
   */
  readonly owner: string;
  /** The procedure's own exit from this stage, where the map draws one. */
  readonly exit: ExitKey | null;
  /** The client-facing stage this stage's entry evidences. */
  readonly client: StageKey;
};

export const PROCEDURE_STAGES: readonly ProcedureStage[] = Object.freeze([
  { key: 'ENQUIRY', sop: 1, label: 'Enquiry', owner: 'Cap Rebate principal … or analyst',
    gate: 'does the enquiry fit Cap Rebate\'s scope (a trading business with healthcare property in the UK — England and Wales at launch, Scotland second, Northern Ireland third — the owner or acting with the owner\'s authority, no existing claim conflict)?',
    exit: 'DECLINED_AT_ENQUIRY', client: 'ASSESSMENT_SUBMITTED' },
  { key: 'ASSESSMENT', sop: 2, label: 'Assessment',
    owner: 'Client (completes the assessment and sees the indicative figure as soon as it is finished); Cap Rebate staff (triage the filled assessment afterwards, in the back office).',
    gate: 'is there a plausible indicative recovery, and does the client want to proceed to a paid engagement?',
    exit: 'CLIENT_DID_NOT_PROCEED', client: 'ASSESSMENT_SUBMITTED' },
  { key: 'ENGAGEMENT', sop: 3, label: 'Engagement', owner: 'Cap Rebate principal.',
    gate: 'signed engagement letter on file. NOTHING below this line runs without it …',
    exit: 'CLIENT_DECLINED_TO_SIGN', client: 'ASSESSMENT_SUBMITTED' },
  { key: 'DATA_GATHERING', sop: 4, label: 'Data gathering',
    owner: 'Cap Rebate analyst, with input from the client and the client\'s accountant.',
    gate: 'floor area sourced; no unresolved nominal/unscoped s.198 election; no unresolved VOA licence block for any source that requires it.',
    exit: 'REASONED_NEGATIVE', client: 'ENGAGEMENT_SIGNED' },
  { key: 'SURVEY', sop: 5, label: 'Survey',
    owner: 'Chartered surveyor (RICS) — not yet appointed; until appointment, this stage cannot run live.',
    gate: 'surveyor\'s independent figure recorded BEFORE client estimate is released (anchor quarantine); measured record complete.',
    exit: 'REASONED_NEGATIVE', client: 'AT_SURVEY' },
  { key: 'VALUATION', sop: 6, label: 'Valuation',
    owner: 'Cap Rebate analyst, working under the surveyor\'s measured record; chartered surveyor reviews and signs the valuation.',
    gate: 'every rate sourced against the Rates Rulebook; every grant/contribution traced to specific cost elements.',
    exit: 'REASONED_NEGATIVE', client: 'AT_SURVEY' },
  { key: 'TAX_ADVISER_SIGNOFF', sop: 7, label: 'Tax adviser sign-off',
    owner: 'A tax adviser — the client\'s own accountant or tax adviser, or Cap Rebate\'s own chartered tax adviser (not yet appointed; engaged on a one-off paid-review basis … not a retainer). Until one of them signs off, this stage cannot pass.',
    gate: 'Tax adviser sign-off obtained. No figure is shown to the client as claimable before this gate clears.',
    exit: 'REASONED_NEGATIVE', client: 'AT_SURVEY' },
  { key: 'REPORTS', sop: 8, label: 'Client report and accountant report',
    owner: 'Cap Rebate principal (client report); Cap Rebate analyst, liaising with client\'s accountant (accountant report).',
    gate: 'client accepts the report; accountant confirms the claim fits the return and the amendment window.',
    exit: 'CLIENT_WITHDREW', client: 'AT_SURVEY' },
  { key: 'INVOICE', sop: 9, label: 'Invoice', owner: 'Cap Rebate principal.',
    gate: 'fee trigger point reached … and claim within the amendment window.',
    exit: 'OUTSIDE_AMENDMENT_WINDOW', client: 'AT_SURVEY' },
  { key: 'DEFENCE_PACK', sop: 10, label: 'Defence pack',
    owner: 'Cap Rebate analyst; generation is automatic at claim close, per the existing rule.',
    // The map draws no gate after the last stage; SOP 10's own step 3 is what closes it.
    gate: 'Confirm the pack is complete against the checklist of records kept at each SOP above; flag any gap to the principal rather than silently generating an incomplete pack.',
    exit: null, client: 'INVOICED' },
]);

/** After DEFENCE_PACK. SOP 10's trigger: "Claim closed". */
export const CLOSED_STAGE = Object.freeze({ key: 'CLOSED' as const, label: 'Closed', client: 'INVOICED' as StageKey });

export type ExitStage = {
  readonly key: ExitKey;
  /** VERBATIM from the process map's EXIT line, or from the CRM specification where the map has none. */
  readonly label: string;
  readonly source: string;
  /** The stages this exit is taken from. ANY_OPEN: any procedure stage not yet closed, or on hold. */
  readonly from: readonly ProcedureKey[] | 'ANY_OPEN';
};

/**
 * EXITS KEEP THE RECORD. A claim that exits keeps its row, its reference and its
 * history; its stage becomes the exit, and nothing is deleted.
 *
 * WHERE EACH IS TAKEN FROM IS THE MAP'S, with one addition the procedure makes
 * in words rather than in the drawing: SOP 8's stop conditions treat a window
 * problem found at the reports as a reasoned negative "at this late stage", so
 * REASONED_NEGATIVE is reachable from REPORTS too. OUTSIDE_AMENDMENT_WINDOW is
 * reachable from any stage, because it stops the job before a fee is incurred
 * wherever it is found. CANCELLED and LOST are the CRM specification's own
 * states (9.19, 9.20) and are reachable from any open stage.
 */
export const EXITS: readonly ExitStage[] = Object.freeze([
  { key: 'DECLINED_AT_ENQUIRY', label: 'Declined at enquiry', source: 'the procedure, SOP 1', from: ['ENQUIRY'] },
  { key: 'CLIENT_DID_NOT_PROCEED', label: 'Client does not proceed', source: 'the procedure, SOP 2', from: ['ASSESSMENT'] },
  { key: 'CLIENT_DECLINED_TO_SIGN', label: 'Client declines to sign', source: 'the procedure, SOP 3', from: ['ENGAGEMENT'] },
  { key: 'REASONED_NEGATIVE', label: 'Reasoned negative report', source: 'the procedure, SOPs 4 to 8',
    from: ['DATA_GATHERING', 'SURVEY', 'VALUATION', 'TAX_ADVISER_SIGNOFF', 'REPORTS'] },
  { key: 'CLIENT_WITHDREW', label: 'Client withdrawal', source: 'the procedure, SOP 8', from: ['REPORTS'] },
  { key: 'OUTSIDE_AMENDMENT_WINDOW', label: 'Claim outside amendment window — job stops before fee is incurred',
    source: 'the procedure, SOP 9', from: 'ANY_OPEN' },
  { key: 'CANCELLED', label: 'Cancelled', source: 'the full CRM specification, 9.19', from: 'ANY_OPEN' },
  { key: 'LOST', label: 'Lost', source: 'the full CRM specification, 9.20', from: 'ANY_OPEN' },
]);

/** The CRM specification's 9.18: a hold, carrying its reason and the stage it returns to. */
export const ON_HOLD_STAGE = Object.freeze({ key: 'ON_HOLD' as const, label: 'On hold' });

/**
 * THE OLD SIX KEYS, AS THE PROCEDURE STAGE EACH NAMES — before migration 010
 * places a converted claim no later than its records evidence. The migration's
 * CASE and `backfillClaimFor` in src/web/crm.ts both follow this table.
 */
export const LEGACY_STAGE_TO_PROCEDURE: Readonly<Record<StageKey, ProcedureKey>> = Object.freeze({
  ASSESSMENT_SUBMITTED: 'ASSESSMENT',
  ENGAGEMENT_SIGNED: 'DATA_GATHERING',
  RESEARCH_PART_RUN: 'DATA_GATHERING',
  AT_SURVEY: 'SURVEY',
  INVOICED: 'INVOICE',
  PAID: 'DEFENCE_PACK',
});

/** 0 to 9 for the ten, 10 for CLOSED, and -1 for anything else. */
export function procedureIndex(key: string | null): number {
  if (key === 'CLOSED') return PROCEDURE_KEYS.length;
  return key === null ? -1 : (PROCEDURE_KEYS as readonly string[]).indexOf(key);
}

export function procedureStage(key: string | null): ProcedureStage | undefined {
  return PROCEDURE_STAGES.find((s) => s.key === key);
}

export function exitStage(key: string | null): ExitStage | undefined {
  return EXITS.find((s) => s.key === key);
}

export type ClaimStageReading =
  | { readonly kind: 'PROCEDURE'; readonly key: ProcedureKey; readonly label: string }
  | { readonly kind: 'CLOSED'; readonly key: 'CLOSED'; readonly label: string }
  | { readonly kind: 'EXIT'; readonly key: ExitKey; readonly label: string }
  | { readonly kind: 'ON_HOLD'; readonly key: 'ON_HOLD'; readonly label: string }
  | { readonly kind: 'UNKNOWN'; readonly key: null; readonly label: string };

/**
 * A CLAIM'S STORED STAGE, READ. An unrecognised or NULL stage is UNKNOWN, and
 * says so — it is never the enquiry, which would be a favourable-looking default
 * for a claim nobody has placed (N4).
 */
export function claimStage(key: string | null): ClaimStageReading {
  const p = procedureStage(key);
  if (p !== undefined) return { kind: 'PROCEDURE', key: p.key, label: p.label };
  if (key === 'CLOSED') return { kind: 'CLOSED', key: 'CLOSED', label: CLOSED_STAGE.label };
  const e = exitStage(key);
  if (e !== undefined) return { kind: 'EXIT', key: e.key, label: e.label };
  if (key === 'ON_HOLD') return { kind: 'ON_HOLD', key: 'ON_HOLD', label: ON_HOLD_STAGE.label };
  return { kind: 'UNKNOWN', key: null, label: 'stage not recognised — nobody has placed this claim in the procedure' };
}

/** The client-facing key a procedure stage, or CLOSED, evidences. Null for an exit, a hold or an unknown. */
export function clientStageFor(key: string | null): StageKey | null {
  if (key === 'CLOSED') return CLOSED_STAGE.client;
  return procedureStage(key)?.client ?? null;
}

/** The stage after this one: the next of the ten, or CLOSED after the defence pack. */
export function nextProcedureKey(key: ProcedureKey): ProcedureKey | 'CLOSED' {
  const i = PROCEDURE_KEYS.indexOf(key);
  return PROCEDURE_KEYS[i + 1] ?? 'CLOSED';
}

/** A label for any key a claim or a move may carry, old or new, or an honest marker. */
export function anyStageLabel(key: string | null): string {
  if (key === null) return 'no stage';
  const r = claimStage(key);
  if (r.kind !== 'UNKNOWN') return r.label;
  const legacy = stage(key);
  return legacy === undefined ? `an unrecognised stage (${key})` : `${legacy.label} (the six-key vocabulary)`;
}
