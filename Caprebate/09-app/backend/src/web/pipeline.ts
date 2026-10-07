/**
 * THE CLAIM PIPELINE — THE OPERATING PROCEDURE'S TEN STAGES, THEIR GATES AND
 * THEIR EXITS. CRM 2 of 10, 10 September 2026.
 *
 * The stages' words are src/web/stages.ts; the schema is migration 010; the
 * scope is 09-app/CAPREBATE-CRM-DISPOSITION.md. The routes and pages are
 * src/web/pipeline-pages.ts, which draws what this returns and decides nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EVERY GATE IS HERE, ON THE SERVER, AND IS ASKED AGAIN AT EVERY WRITE
 *
 * A move is a request. `moveClaim` loads the claim, authorises the person, reads
 * the gate out of the stage the claim is in — from the records, on this request
 * — and only then writes. Nothing a browser sent opens a gate: dragging a card
 * on the board and posting the claim page's form reach the same function, and a
 * test posts a move past every gate and asserts the refusal.
 *
 *   ENQUIRY          the enquiry checks, each YES — UNKNOWN and never-asked do not pass
 *   ASSESSMENT       an assessment on record for the organisation
 *   ENGAGEMENT       `assertSignedEngagement` in src/web/research.ts — reused, never a second one
 *   DATA_GATHERING   a recorded confirmation, since the claim entered the stage
 *   SURVEY           a `surveyor_commitments` row on a survey job on THIS claim
 *   VALUATION        a recorded confirmation
 *   TAX_ADVISER_SIGNOFF  `claims.tax_adviser_signoff_at`, NULL until CRM 6 of 10 — SHUT
 *   REPORTS          the sign-off again, and both confirmations the procedure names
 *   INVOICE          the fee trigger, read at its most cautious reading, and an invoice raised
 *   DEFENCE_PACK     a recorded confirmation, and the claim closes
 *
 * FORWARD ONE STAGE AT A TIME, OR TO AN EXIT. A move that would skip a stage is
 * refused even when every gate on the way happens to be open: each gate is a
 * separate act and the history must show each one. ADMIN alone may move a claim
 * backwards — REOPEN — and must say why.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIS FILE AND src/web/crm.ts IMPORT EACH OTHER, and it is safe: neither calls
 * the other at load. crm.ts owns the claim — its object, its reach and its page —
 * and this file owns how it moves.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal, answerLabel } from './backoffice.ts';
import { assertSignedEngagement } from './research.ts';
import { localStamp } from './localtime.ts';
import { claimObjFor, priorClaimFor } from './crm.ts';
import { MANDATORY_DOCUMENTS, mandatoryDocumentNeeds, type MandatoryDocuments } from './mandatory-documents.ts';
import {
  isTerminalStage, nextActionRefusal, validNextAction, writeNextAction, type NextActionInput, type NextActionWrite,
} from './tasks.ts';
import { fireAutomation } from './automation.ts';
import { onClaimStageEntered } from './introducers.ts';
import { cddGateNeed } from './compliance.ts';
import { amendmentWindowReading, electionResolved, grantsTraced } from './claim-facts.ts';
import { grantProviderNeed, grantSplitNeed } from './grant-checks.ts';
import { deliverableIssuedNeed, invoiceWindowNeed, reportsWindowNeed, signOffRecordNeed } from './claim-record.ts';
import { clientConfirmationNeed, filingRoute } from './client-filing.ts';
import {
  EXITS, PROCEDURE_KEYS, PROCEDURE_STAGES, anyStageLabel, claimStage, clientStageFor, exitStage,
  nextProcedureKey, procedureIndex, procedureStage, stage as clientStage, stageIndex,
  type ExitKey, type ProcedureKey, type StageKey,
} from './stages.ts';
import { portalStepLine } from './portal-steps.ts';

export type PipelineDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133d (D4): `field` is the posted name a refusal is about, where it is about one; a gate's refusal has none. */
export type Result = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

type Vocab = Readonly<Record<string, string>>;

function has<T extends string>(vocab: Readonly<Record<T, unknown>>, v: string | null | undefined): v is T {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function text(v: string | null | undefined, max: number, what: string): { ok: true; value: string | null } | { ok: false; why: string } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function stageLabel(key: ProcedureKey | 'CLOSED'): string {
  return key === 'CLOSED' ? 'Closed' : (procedureStage(key)?.label ?? key);
}

/* ================================================================== *
 * 1 · THE FEE TRIGGER — AN OPEN DECISION, READ AT ITS MOST CAUTIOUS
 * ================================================================== */

/** The title of the question under Lakhbir in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const FEE_TRIGGER_QUESTION =
  'When is our fee earned — when the client accepts the report, when their accountant files the amended return, or when HMRC processes the relief?';

export type FeeTrigger = 'REPORT_DELIVERED_FOR_FILING' | 'CLIENT_ACCEPTED_REPORT' | 'AMENDED_RETURN_FILED' | 'HMRC_PROCESSED_RELIEF';

export const FEE_TRIGGERS: Readonly<Record<FeeTrigger, string>> = Object.freeze({
  REPORT_DELIVERED_FOR_FILING: 'when our report is delivered for filing, to the client or to their accountant',
  CLIENT_ACCEPTED_REPORT: 'when the client accepts the report',
  AMENDED_RETURN_FILED: 'when the client’s accountant files the amended return',
  HMRC_PROCESSED_RELIEF: 'when HMRC processes the relief',
});

/**
 * WHAT MOVES A CLAIM PAST INVOICE — DECIDED ON 15 SEPTEMBER 2026, BUILT BY PHASE 132e.
 *
 * Until Phase 132e the procedure left it open and it shipped at the most
 * cautious of three readings, HMRC processing the relief. Lakhbir's answer to
 * "When is our fee earned ...?": due when we complete the report and either
 * submit it for the client or send it to them to submit; we will not get
 * confirmation, so delivery is deemed the trigger. So the reading is
 * REPORT_DELIVERED_FOR_FILING, and it is READ FROM THE DELIVERABLES REGISTER, not
 * clicked: the claim's client report or computation pack ISSUED, on its issue
 * date. Nothing issued — or an issue with no date, which the table refuses —
 * leaves it not reached (N4). The other three readings stay built, and a test
 * runs the gate under each.
 *
 * WHAT THIS DOES NOT SAY: that Caprebate files the return or signs the filing
 * position. Clause 1 of the letter says it does not; "submit it for the client"
 * against clause 1 is on the solicitor's register.
 */
export const FEE_TRIGGER: {
  readonly reading: FeeTrigger; readonly decided: boolean; readonly why: string; readonly question: string;
} = Object.freeze({
  reading: 'REPORT_DELIVERED_FOR_FILING',
  decided: true,
  why: 'Lakhbir decided: our fee is due when we finish the report and send it for filing, to the client or their accountant. Sending it counts, because nobody will confirm the filing.',
  question: FEE_TRIGGER_QUESTION,
});

/**
 * WHEN OUR REPORT WAS DELIVERED FOR FILING — the earliest issue date of the claim's CLIENT_REPORT or
 * ACCOUNTANT_COMPUTATION_PACK that stands ISSUED in the deliverables register, or null where neither is (N4: an
 * unknown delivery is null, never today). Read by the fee trigger and by the finance view's expected-fee date.
 */
export function reportDeliveredOn(db: Db, claim_id: string): { readonly on: string; readonly kind: string } | null {
  const r = db.get<{ issued_on: string; kind: string }>(
    "SELECT issued_on, kind FROM claim_deliverables WHERE claim_id = ? AND state = 'ISSUED' AND issued_on IS NOT NULL " +
      "AND kind IN ('CLIENT_REPORT','ACCOUNTANT_COMPUTATION_PACK') ORDER BY issued_on ASC, kind ASC LIMIT 1", [claim_id]);
  return r === undefined ? null : { on: r.issued_on, kind: r.kind };
}

/**
 * `today` is the instant a gate reads the amendment window against — CRM 6 of 10.
 * A move passes its own clock, so a request and a test ask the same question; a
 * reader that passes nothing reads the real clock.
 */
export type GateOptions = {
  readonly feeTrigger?: FeeTrigger; readonly today?: string;
  /** The CRM follow-on: the mandatory documents switch, shipped off. A test passes it on; a request never does. */
  readonly mandatoryDocuments?: MandatoryDocuments;
};

/* ================================================================== *
 * 2 · THE MILESTONES A PERSON CONFIRMS
 * ================================================================== */

export type MilestoneKey =
  | 'DATA_GATHERING_COMPLETE' | 'VALUATION_SIGNED' | 'CLIENT_ACCEPTED_REPORT' | 'ACCOUNTANT_CONFIRMED_RETURN'
  | 'AMENDED_RETURN_FILED' | 'HMRC_PROCESSED_RELIEF' | 'DEFENCE_PACK_COMPLETE';

/**
 * EACH IS CONFIRMED WHILE THE CLAIM IS AT ITS OWN STAGE, and a gate reads only a
 * confirmation made since the claim last entered that stage. The words are the
 * procedure's gate or step for that stage. CRM 6 of 10 derives the facts behind
 * the first two and the reports; until then a named person confirms them.
 *
 * THE SURVEYOR'S COMMITMENT AND THE TAX ADVISER'S SIGN-OFF ARE NOT ON THIS LIST
 * AND CANNOT BE. Each is a record no click can stand in for.
 */
export const MILESTONES: Readonly<Record<MilestoneKey, {
  readonly stage: ProcedureKey; readonly label: string;
  /** CRM 6 of 10: set where a fact now derives what this confirmed. A retired confirmation is refused and read by no gate. */
  readonly retired?: string;
}>> = Object.freeze({
  DATA_GATHERING_COMPLETE: {
    stage: 'DATA_GATHERING',
    // CRM 6 of 10: the election is a fact on the facts panel now, and the gate reads it; this confirms what nothing derives.
    // PHASE 158b (F24): "no unresolved VOA licence block" left out - the rating list was scrapped on 4 Oct 2026, so no source needs one.
    label: 'Data gathering complete — floor area sourced',
  },
  VALUATION_SIGNED: {
    stage: 'VALUATION',
    // CRM 6 of 10: every grant traced is a fact on the facts panel now, and the gate reads it; this confirms what nothing derives.
    label: 'Valuation signed by the surveyor — every rate sourced',
    /* PHASE 158c (F34, F35, the Friary House run): Sales could tick "signed by the surveyor" - the surveyor could not -
       while the survey pack had no approved version. The gate reads the surveyor's own approval of the pack now. */
    retired: 'The surveyor’s own approval of the survey pack now counts. This tick is no longer used.',
  },
  CLIENT_ACCEPTED_REPORT: { stage: 'REPORTS', label: 'The client accepted the report' },
  ACCOUNTANT_CONFIRMED_RETURN: {
    stage: 'REPORTS', label: 'The client’s accountant confirmed the claim fits the return and the amendment window',
  },
  AMENDED_RETURN_FILED: { stage: 'INVOICE', label: 'The amended return has been filed' },
  HMRC_PROCESSED_RELIEF: { stage: 'INVOICE', label: 'HMRC has processed the relief' },
  DEFENCE_PACK_COMPLETE: {
    stage: 'DEFENCE_PACK', label: 'The defence pack is complete against the checklist of records kept at each stage',
    retired: 'The defence pack now counts as done when we issue it from the reports list. This tick is no longer used.',
  },
});

/**
 * PHASE 158c (F35): THE SURVEYOR'S VALUATION IS THE SURVEYOR'S APPROVAL OF THE PACK (src/web/pack-approve.ts) - a version
 * approved on a survey job on THIS claim. Approving needs every value, the legal check settled, every chapter opened,
 * the inspection basis and a RICS number, so no tick can stand in for it.
 */
export function packApprovedNeed(db: Db, c: { readonly id: string }): Need {
  const a = db.get<{ version: number; approved_at: string; name: string | null }>(
    'SELECT a.version, a.approved_at, u.display_name AS name FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
      'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN users u ON u.id = a.approved_by WHERE j.claim_id = ? ' +
      'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', [c.id]);
  return {
    what: 'The surveyor approved and signed the survey pack',
    met: a !== undefined,
    why: a === undefined
      ? 'the surveyor has not approved the survey pack on this claim. Only the surveyor’s approval counts.'
      : `version ${String(a.version)} approved by ${a.name ?? 'a former user'} ${localStamp(a.approved_at)}`,
  };
}

/* ================================================================== *
 * 3 · THE ENQUIRY GATE
 * ================================================================== */

export type CheckKey = 'UK_HEALTHCARE_PROPERTY' | 'TRADING_CLIENT' | 'OWNER_OR_AUTHORISED' | 'NO_CLAIM_CONFLICT';

/**
 * FROM SOP 1, WITH STANDING RULE 13(a). The brief named three; SOP 1 has a
 * fourth — "the enquirer is the owner, or acting with the owner's authority",
 * a stop condition in its own right — so there are four, and the disposition
 * table records why.
 *
 * TRADING, NOT OWNER-OCCUPIED. The map's gate says "owner-occupied or recently
 * acquired"; rule 13(a) settles that commercial means the CLIENT, not the
 * building, so the check is that the client trades — and supported living is in.
 */
export const ENQUIRY_CHECKS: Readonly<Record<CheckKey, string>> = Object.freeze({
  UK_HEALTHCARE_PROPERTY: 'The property is healthcare property in the UK — England and Wales at launch, Scotland second, Northern Ireland third',
  TRADING_CLIENT: 'The client is a trading business — commercial means the client, not the building, so supported living is in',
  OWNER_OR_AUTHORISED: 'The enquirer is the owner, or acts for the owner with their consent',
  NO_CLAIM_CONFLICT: 'There is no existing claim conflict',
});

export const CHECK_ANSWERS: Vocab = Object.freeze({ YES: 'Yes', NO: 'No', UNKNOWN: 'Not known' });

/** THE ONE READING OF A CHECK THAT IS NOT A YES OR A NO — for a recorded UNKNOWN and for silence alike. */
export const CHECK_NOT_KNOWN = 'not known — and a check that is not known does not pass';

export type CheckReading = {
  readonly key: CheckKey;
  readonly label: string;
  /** YES or NO where one was recorded. NULL for UNKNOWN AND for never asked — the same value. */
  readonly answer: 'YES' | 'NO' | null;
  readonly passes: boolean;
  readonly reading: string;
  /** Who last recorded something, and what — present for a recorded UNKNOWN, absent for silence. */
  readonly recorded: { readonly by: string; readonly at: string; readonly answer_given: string; readonly note: string | null } | null;
};

export type EnquiryReading = {
  readonly open: boolean;
  readonly checks: readonly CheckReading[];
};

export type EnquirySubject = { readonly lead_id: string } | { readonly claim_id: string };

type CheckDbRow = {
  seq: number; check_key: string; answer: string; note: string | null; recorded_at: string; recorder: string | null;
};

const CHECK_SELECT =
  'SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, u.display_name AS recorder ' +
  'FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by ';

/**
 * THE ENQUIRY GATE, READ. For a claim, its own checks and its lead's together —
 * a claim converted from a lead passed the gate on the lead, and a claim a person
 * opened without one records its own. The latest answer per check wins.
 *
 * OPEN ONLY WHEN EVERY CHECK IS A RECORDED YES.
 */
export function enquiryGate(db: Db, subject: EnquirySubject): EnquiryReading {
  const rows: CheckDbRow[] = [];
  if ('lead_id' in subject) {
    rows.push(...db.all<CheckDbRow>(`${CHECK_SELECT}WHERE e.lead_id = ?`, [subject.lead_id]));
  } else {
    rows.push(...db.all<CheckDbRow>(`${CHECK_SELECT}WHERE e.claim_id = ?`, [subject.claim_id]));
    const lead = db.get<{ id: string }>('SELECT id FROM leads WHERE claim_id = ?', [subject.claim_id]);
    if (lead !== undefined) rows.push(...db.all<CheckDbRow>(`${CHECK_SELECT}WHERE e.lead_id = ?`, [lead.id]));
  }
  const latest = new Map<string, CheckDbRow>();
  for (const r of rows) {
    const cur = latest.get(r.check_key);
    if (cur === undefined || r.recorded_at > cur.recorded_at || (r.recorded_at === cur.recorded_at && r.seq > cur.seq)) {
      latest.set(r.check_key, r);
    }
  }
  const checks = (Object.keys(ENQUIRY_CHECKS) as CheckKey[]).map((key) => checkReading(key, latest.get(key)));
  return { open: checks.every((c) => c.passes), checks };
}

function checkReading(key: CheckKey, r: CheckDbRow | undefined): CheckReading {
  const answer = r?.answer === 'YES' || r?.answer === 'NO' ? r.answer : null;
  return {
    key, label: ENQUIRY_CHECKS[key], answer,
    passes: answer === 'YES',
    reading: answer === 'YES' ? 'Yes' : answer === 'NO' ? 'No' : CHECK_NOT_KNOWN,
    recorded: r === undefined ? null : {
      by: r.recorder ?? 'a former user', at: localStamp(r.recorded_at), answer_given: r.answer, note: r.note,
    },
  };
}

/**
 * WHAT THE BUILD ALREADY HOLDS THAT BEARS ON EACH CHECK — SHOWN, NOT DECIDED.
 *
 * DERIVE, DO NOT RE-KEY, and here is why a derived answer does not simply fill
 * the check in: none of these is the same fact as the check. A healthcare sector
 * is not a UK property; paying tax is not trading (a property investment company
 * pays tax and is not a client under 13(a)); "how did you come by this one" is
 * not authority to act; and a client's own "no prior claim" is not the same as no
 * conflict. So the evidence sits beside the question, with its source, and a
 * person answers it — which is SOP 1's own owner doing SOP 1's own step.
 */
export function enquiryEvidence(
  db: Db, actor: Actor, business_id: string | null, prospect_sector: string | null,
): Readonly<Record<CheckKey, readonly string[]>> {
  const out: Record<CheckKey, string[]> = {
    UK_HEALTHCARE_PROPERTY: [], TRADING_CLIENT: [], OWNER_OR_AUTHORISED: [], NO_CLAIM_CONFLICT: [],
  };
  if (business_id === null) {
    if (prospect_sector !== null) out.UK_HEALTHCARE_PROPERTY.push(`Sector: ${prospect_sector.replace(/_/g, ' ')} — as recorded on the lead`);
    return out;
  }
  const b = db.get<{ sector: string }>('SELECT sector FROM businesses WHERE id = ?', [business_id]);
  if (b !== undefined) out.UK_HEALTHCARE_PROPERTY.push(`Sector: ${b.sector.replace(/_/g, ' ')} — from the assessment`);
  const latest = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [business_id]);
  if (latest !== undefined && can(actor, 'answer.read', { type: 'answer', id: latest.id, business_id })) {
    const answers = db.all<{ question_id: string; question_text: string; state: string; value: string | null }>(
      'SELECT question_id, question_text, state, value FROM assessment_answers WHERE assessment_id = ? ORDER BY ord ASC',
      [latest.id]);
    for (const a of answers) {
      const line = `${a.question_text} — ${answerLabel(a.state, a.value)} (the client’s own answer)`;
      if (a.question_id === 'Q1b' || a.question_id === 'Q1b-profit') out.TRADING_CLIENT.push(line);
      if (/^Q2-\d+-(address|sector)$/.test(a.question_id)) out.UK_HEALTHCARE_PROPERTY.push(line);
      if (/^Q2-\d+-trigger$/.test(a.question_id) || /^Q2-\d+-entity$/.test(a.question_id)) out.OWNER_OR_AUTHORISED.push(line);
      if (a.question_id === 'Q1' || a.question_id === 'Q1a') out.NO_CLAIM_CONFLICT.push(line);
    }
  }
  for (const p of db.all<{ business_id: string; label: string; existing_ca_claimed: string | null }>(
    'SELECT business_id, label, existing_ca_claimed FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [business_id])) {
    // The CRM follow-on: derived from the client's own answer where it settles it, and said where it came from.
    out.NO_CLAIM_CONFLICT.push(`${p.label}: allowances claimed before? ${priorClaimFor(db, p).label}`);
  }
  const open = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM claims WHERE business_id = ? AND stage IS NOT NULL AND stage NOT IN " +
      "('CLOSED','DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE'," +
      "'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST')",
    [business_id])?.n ?? 0;
  out.NO_CLAIM_CONFLICT.push(`Open claims for this organisation already in our own pipeline: ${open}`);
  return out;
}

/* ================================================================== *
 * 4 · THE CLAIM, AS A GATE READS IT
 * ================================================================== */

export type PipelineClaim = {
  id: string; business_id: string; assessment_id: string | null; stage: string | null;
  hold_return_stage: string | null; hold_reason: string | null;
  /** RETIRED BY CRM 6 of 10 and read by no gate: the database refuses any write to it. The sign-off is a record. */
  tax_adviser_signoff_at: string | null;
  created_at: string;
  /** CRM 6 of 10: the amendment window reads the property's acquisition date. */
  property_id: string | null;
};

export function loadPipelineClaim(db: Db, id: string): PipelineClaim {
  const c = db.get<PipelineClaim>(
    'SELECT id, business_id, assessment_id, stage, hold_return_stage, hold_reason, tax_adviser_signoff_at, created_at, property_id ' +
      'FROM claims WHERE id = ?',
    [id]);
  // A missing row and a forbidden row look the same from outside.
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

/**
 * WHEN THE CLAIM LAST ENTERED A STAGE — by moving into it, being opened in it,
 * being converted into it, or being reopened at it. A RESUME is not an entry:
 * a hold is a pause, and what was confirmed before it still stands.
 */
export function enteredAt(db: Db, c: { id: string; created_at: string }, stageKey: string): string {
  const r = db.get<{ at: string | null }>(
    "SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ? AND to_stage = ? AND kind IN ('FORWARD','REOPEN','OPENED','CONVERTED')",
    [c.id, stageKey]);
  return r?.at ?? c.created_at;
}

function milestoneSince(db: Db, claim_id: string, m: MilestoneKey, since: string): { at: string } | undefined {
  return db.get<{ at: string }>(
    'SELECT recorded_at AS at FROM claim_milestones WHERE claim_id = ? AND milestone = ? AND recorded_at >= ? ' +
      'ORDER BY recorded_at DESC LIMIT 1',
    [claim_id, m, since]);
}

export type Need = { readonly what: string; readonly met: boolean; readonly why: string };

export type GateReading = {
  readonly from: ProcedureKey;
  readonly label: string;
  /** The procedure's own words for this gate. */
  readonly procedure_gate: string;
  /** The procedure's own words for who is responsible for this stage. */
  readonly owner: string;
  readonly open: boolean;
  readonly needs: readonly Need[];
};

function confirmation(db: Db, c: PipelineClaim, m: MilestoneKey): Need {
  const since = enteredAt(db, c, MILESTONES[m].stage);
  const hit = milestoneSince(db, c.id, m, since);
  return {
    what: MILESTONES[m].label,
    met: hit !== undefined,
    why: hit === undefined
      ? 'not confirmed since the claim entered this stage'
      : `confirmed ${localStamp(hit.at)}`,
  };
}

/**
 * THE FEE TRIGGER, READ — CRM 7 of 10. The gate out of INVOICE asks it, and so
 * does raising our fee in src/web/invoices.ts: one reading of FEE_TRIGGER, in one
 * place, never re-decided by the finance view.
 */
export function feeTriggerReached(db: Db, c: PipelineClaim, trigger: FeeTrigger = FEE_TRIGGER.reading): Need {
  if (trigger === 'REPORT_DELIVERED_FOR_FILING') {
    const d = reportDeliveredOn(db, c.id);
    return {
      what: `The fee trigger is reached — ${FEE_TRIGGERS[trigger]}`,
      met: d !== null,
      why: d === null
        ? 'no client report or computation pack is shown as issued yet. So sending it for filing is not known — and not known is not reached'
        : `${d.kind === 'CLIENT_REPORT' ? 'the client report' : 'the computation pack'} was issued on ${d.on}`,
    };
  }
  const t = confirmation(db, c, trigger);
  return {
    what: `The fee trigger is reached — ${FEE_TRIGGERS[trigger]}${trigger === FEE_TRIGGER.reading && !FEE_TRIGGER.decided ? ' (the most cautious reading, while the fee trigger is undecided)' : ''}`,
    met: t.met, why: t.why,
  };
}

/**
 * THE CLAIM'S OWN LIVE FEE INVOICES — CRM 7 of 10. Raised or sent, and not
 * credited in full. An organisation's invoice, another claim's, a cancelled one
 * and one credited in full are none of them this claim's fee.
 */
export function liveFeeInvoiceCount(db: Db, claim_id: string): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM invoices i WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status IN ('RAISED','SENT') " +
      'AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)',
    [claim_id])?.n ?? 0;
}

/**
 * THE SIGN-OFF GATE — IT READS THE SIGN-OFF RECORD. CRM 6 of 10.
 *
 * Until CRM 6 of 10 this read `claims.tax_adviser_signoff_at`, a column nothing
 * wrote, so the gate shipped shut. It now reads `tax_adviser_signoffs` — a record
 * of who, when, the scope, the switch readings confirmed, a method note and the
 * figure, made since the claim last entered TAX_ADVISER_SIGNOFF — and the column
 * is retired: migration 015 refuses any write to it. There is still no
 * confirmation, action or setting that stands in for the record.
 */
export function signOffNeed(db: Db, c: { id: string; created_at: string }): Need {
  return signOffRecordNeed(db, c);
}

/**
 * NO CLAIMABLE FIGURE REACHES THE CLIENT BEFORE TAX_ADVISER_SIGNOFF.
 *
 * The procedure's words, as a function any client-facing reader must ask before
 * it shows a figure as claimable. The portal shows the indicative range, labelled
 * indicative; the deliverables register lists a client report to its client only
 * once this says yes (`clientDeliverable` in src/authz.ts), and a document of it
 * the same (`clientDocument`).
 */
export function claimableFigureReleased(db: Db, c: { id: string; created_at: string }): { released: boolean; why: string } {
  const n = signOffNeed(db, c);
  return { released: n.met, why: n.met ? 'the tax adviser has signed off' : n.why };
}

/** THE GATE OUT OF A STAGE, READ FROM THE RECORDS ON THIS REQUEST. */
export function gateOut(db: Db, c: PipelineClaim, from: ProcedureKey, opts: GateOptions = {}): GateReading {
  const p = procedureStage(from);
  const needs: Need[] = [];
  switch (from) {
    case 'ENQUIRY': {
      for (const ch of enquiryGate(db, { claim_id: c.id }).checks) needs.push({ what: ch.label, met: ch.passes, why: ch.reading });
      break;
    }
    case 'ASSESSMENT': {
      const a = db.get<{ submitted_at: string }>(
        'SELECT submitted_at FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC LIMIT 1', [c.business_id]);
      needs.push({
        what: 'An assessment is on record for the organisation',
        met: a !== undefined,
        why: a === undefined ? 'no assessment has been submitted for this organisation' : `submitted ${localStamp(a.submitted_at)}`,
      });
      break;
    }
    case 'ENGAGEMENT': {
      // THE ONE ENGAGEMENT GATE. Server-side, against the record, on this request.
      const e = assertSignedEngagement(db, c.business_id);
      needs.push({ what: 'A signed engagement letter', met: e.signed, why: e.why });
      // CRM 8 of 10: CUSTOMER DUE DILIGENCE, ONLY WHILE AML_IN_SCOPE IS ON. Off — as it ships, and as a setting nobody
      // recorded — nothing is asked here that was not asked before, and the gate is exactly today's.
      const cdd = cddGateNeed(db, c.business_id, opts.today ?? new Date().toISOString());
      if (cdd !== null) needs.push(cdd);
      break;
    }
    case 'DATA_GATHERING': {
      // CRM 6 of 10: the election is a fact now, read from the facts panel; the floor area and the VOA licence stay a confirmation.
      const e = electionResolved(db, c);
      needs.push({ what: 'No unresolved s.198 or s.199 election', met: e.met, why: e.why }, confirmation(db, c, 'DATA_GATHERING_COMPLETE'));
      // THE CRM FOLLOW-ON: the Stage 2 documents that must have arrived — NONE WHILE THE SWITCH IS OFF, as it ships, so
      // off is exactly the gate above. The question it waits on is MANDATORY_DOCUMENTS_QUESTION.
      needs.push(...mandatoryDocumentNeeds(db, c, opts.mandatoryDocuments ?? MANDATORY_DOCUMENTS));
      break;
    }
    case 'SURVEY': {
      const k = db.get<{ committed_at: string }>(
        'SELECT sc.committed_at FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
          'WHERE j.claim_id = ? ORDER BY sc.committed_at ASC LIMIT 1',
        [c.id]);
      needs.push({
        what: 'The surveyor’s commitment is recorded, on a survey job on this claim',
        met: k !== undefined,
        why: k === undefined
          ? 'no surveyor has committed figures on a survey job on this claim'
          : `committed ${localStamp(k.committed_at)}`,
      });
      break;
    }
    case 'VALUATION': {
      // CRM 6 of 10: every grant traced is a fact now; every rate sourced stays the surveyor's confirmation.
      const g = grantsTraced(db, c.id);
      needs.push({ what: 'Every grant or contribution traced to the items it paid for', met: g.met, why: g.why });
      // PHASE 153a (Phase 153b lines 12 and 13): no grant split in equal share without its papers or the tax adviser's
      // view; the client has checked with whoever paid. Both met where no grant is left on the claim.
      needs.push(grantSplitNeed(db, c), grantProviderNeed(db, c), packApprovedNeed(db, c));
      break;
    }
    case 'TAX_ADVISER_SIGNOFF':
      needs.push(signOffNeed(db, c));
      break;
    case 'REPORTS':
      // "No tax adviser sign-off (carried forward from SOP 7): no report is drafted stating a figure to the client."
      // (SOP 8's words since Phase 132, 14 September 2026; they said "No CTA sign-off" — clause 1: any tax adviser signs off.)
      // CRM 6 of 10: the reports are issued (the deliverables register), and the amendment window is open — UNKNOWN does not pass.
      // PHASE 132e: WHO CONFIRMS THE CLAIM FITS THE RETURN. Where the client has no accountant or tax adviser — a
      // recorded yes from the client, and no such contact on the organisation — the client's own written confirmation
      // (src/web/client-filing.ts) stands where the accountant's does, and is never recorded as the accountant's. The
      // computation pack is still issued: whoever files needs the computation. Otherwise, exactly as before.
      {
        const today = opts.today ?? new Date().toISOString();
        const since = enteredAt(db, c, 'REPORTS');
        const route = filingRoute(db, c, since);
        needs.push(
          signOffNeed(db, c),
          deliverableIssuedNeed(db, c.id, 'CLIENT_REPORT'), confirmation(db, c, 'CLIENT_ACCEPTED_REPORT'),
          deliverableIssuedNeed(db, c.id, 'ACCOUNTANT_COMPUTATION_PACK'),
          route.route === 'CLIENT'
            ? clientConfirmationNeed(db, c, since, amendmentWindowReading(db, c, today).deadline)
            : confirmation(db, c, 'ACCOUNTANT_CONFIRMED_RETURN'),
          reportsWindowNeed(db, c, today),
        );
      }
      break;
    case 'INVOICE': {
      // CRM 6 of 10: the claim went in inside the amendment window — UNKNOWN does not pass.
      needs.push(invoiceWindowNeed(db, c, opts.today ?? new Date().toISOString()));
      needs.push(feeTriggerReached(db, c, opts.feeTrigger ?? FEE_TRIGGER.reading));
      // CRM 7 of 10: THE CLAIM'S OWN INVOICE. Until invoices sat on the claim this read any invoice raised for the
      // organisation, so one claim's invoice opened every claim of the same client.
      const live = liveFeeInvoiceCount(db, c.id);
      needs.push({
        what: 'Our fee invoice is raised on this claim',
        met: live > 0,
        why: live > 0 ? 'a fee invoice is raised on this claim and is not credited in full' : 'no live fee invoice is raised on this claim',
      });
      break;
    }
    case 'DEFENCE_PACK':
      // CRM 6 of 10: the pack complete is the deliverables register's issued defence pack, immutable with its hash.
      // The confirmation that stood in for it is retired (MILESTONES below): nothing is left for a click to stand in for.
      needs.push(deliverableIssuedNeed(db, c.id, 'DEFENCE_PACK'));
      break;
  }
  return {
    from, label: p?.label ?? from, procedure_gate: p?.gate ?? '', owner: p?.owner ?? '',
    open: needs.length > 0 && needs.every((n) => n.met),
    needs,
  };
}

/* ================================================================== *
 * 5 · MOVES
 * ================================================================== */

export type MoveKind = 'FORWARD' | 'EXIT' | 'HOLD' | 'RESUME' | 'REOPEN';

export const MOVE_WORDS: Vocab = Object.freeze({
  FORWARD: 'Moved on', EXIT: 'Exited', HOLD: 'Put on hold', RESUME: 'Resumed', REOPEN: 'Reopened',
  OPENED: 'Opened', CONVERTED: 'Moved over to the new steps',
});

export type MoveRequest = {
  readonly kind: string;
  readonly to?: string | null;
  readonly reason_code?: string | null;
  /** The reason for a hold or a reopen, or the note on any other move. */
  readonly reason?: string | null;
  /**
   * CRM 3 of 10 — THE CLAIM'S NEXT ACTION, carried on the move where the person
   * names one, and written in the move's own transaction. Without one, a move to
   * anything but CLOSED or an exit needs the claim to keep its current next
   * action, with an owner and a due date, and is refused otherwise.
   */
  readonly next_action?: NextActionInput | null;
};

export type MoveResult =
  | { readonly ok: true; readonly id: string; readonly from: string | null; readonly to: string }
  | { readonly ok: false; readonly why: string; readonly field?: string };

type ReasonRow = { code: string; label: string; active: number };

export function reasonList(db: Db, list: 'LEAD_LOST' | 'CLAIM_EXIT', activeOnly = true): { code: string; label: string }[] {
  return db.all<ReasonRow>('SELECT code, label, active FROM reason_lists WHERE list = ? ORDER BY ord ASC, code ASC', [list])
    .filter((r) => !activeOnly || r.active === 1)
    .map((r) => ({ code: r.code, label: r.label }));
}

export function reasonLabel(db: Db, list: 'LEAD_LOST' | 'CLAIM_EXIT', code: string | null): string | null {
  if (code === null) return null;
  return db.get<{ label: string }>('SELECT label FROM reason_lists WHERE list = ? AND code = ?', [list, code])?.label ?? code;
}

/** THE FURTHEST OF THE TEN, OR CLOSED, THIS CLAIM HAS EVER BEEN AT — from its history and its present. */
export function furthestReached(db: Db, c: PipelineClaim): number {
  let best = Math.max(procedureIndex(c.stage), procedureIndex(c.hold_return_stage));
  for (const m of db.all<{ from_stage: string | null; to_stage: string | null }>(
    'SELECT from_stage, to_stage FROM claim_stage_moves WHERE claim_id = ?', [c.id])) {
    best = Math.max(best, procedureIndex(m.from_stage), procedureIndex(m.to_stage));
  }
  return best;
}

/**
 * THE ORGANISATION'S STORED STAGE, RAISED — NEVER LOWERED.
 *
 * `businesses.stage` stays the engaged-client list's sort key and the portal's
 * source. A move raises it to the client label the organisation's most advanced
 * open claim evidences (stages.ts), and never lowers it: an exit, a hold or a
 * reopen does not move a client's progress backwards, and no migration rewrites
 * a stored stage. Returns the key it was raised to, or null.
 */
export function raiseBusinessStage(db: Db, business_id: string, at: string): StageKey | null {
  const b = db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) return null;
  let best: StageKey | null = null;
  for (const c of db.all<{ stage: string | null; hold_return_stage: string | null }>(
    'SELECT stage, hold_return_stage FROM claims WHERE business_id = ?', [business_id])) {
    const k = clientStageFor(c.stage === 'ON_HOLD' ? c.hold_return_stage : c.stage);
    if (k !== null && (best === null || stageIndex(k) > stageIndex(best))) best = k;
  }
  if (best === null || stageIndex(b.stage) >= stageIndex(best)) return null;
  db.run('UPDATE businesses SET stage = ?, updated_at = ? WHERE id = ?', [best, at, business_id]);
  return best;
}

/**
 * PHASE 158b (F30, the Friary House run): no claim stage maps to the client's step 3, "We research your property", so a
 * client went from step 2 to step 4 while we researched. A research run that got an answer from at least one register,
 * on a client whose letter is signed, raises the client's step to it. Raise only, as raiseBusinessStage: a business
 * already past it stays where it is, and one whose letter is not signed is never shown a step it has not reached.
 */
export function raiseToResearch(db: Db, business_id: string, at: string, run: { readonly signed: boolean; readonly fired: number }): boolean {
  if (!run.signed || run.fired === 0) return false;
  const b = db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined || stageIndex(b.stage) >= stageIndex('RESEARCH_PART_RUN')) return false;
  db.run('UPDATE businesses SET stage = ?, updated_at = ? WHERE id = ?', ['RESEARCH_PART_RUN', at, business_id]);
  return true;
}

/**
 * THE MOVE A CLAIM MAKES WHEN IT COMES INTO BEING — so its age on the board and
 * its days in a stage are read from one place. Call inside the transaction that
 * inserted the claim.
 */
export function recordOpened(
  d: { readonly db: Db; readonly now: () => string; readonly newId: () => string },
  actor: Actor | null, claim_id: string, stageKey: string, why: string,
): void {
  d.db.run(
    'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
      'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)',
    [d.newId(), claim_id, d.now(), actor?.id ?? null, actor?.role ?? null, 'OPENED', stageKey, why],
  );
}

function refuse(d: PipelineDeps, actor: Actor, c: PipelineClaim, kind: string, to: string | null, why: string, field?: string): MoveResult {
  d.audit.append({
    at: d.now(), kind: 'CLAIM_STAGE_MOVED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id,
    detail: { kind, from: c.stage, to, business: c.business_id },
  });
  return field === undefined ? { ok: false, why } : { ok: false, why, field };
}

type Apply = {
  kind: MoveKind; to: string; reason_code: string | null; reason_text: string | null;
  hold_return_stage: string | null; hold_reason: string | null;
};

function apply(d: PipelineDeps, actor: Actor, c: PipelineClaim, m: Apply, next: NextActionWrite | null = null): MoveResult {
  const at = d.now();
  const id = d.newId();
  const { raised, nextTask } = d.db.tx(() => {
    d.db.run(
      'UPDATE claims SET stage = ?, hold_return_stage = ?, hold_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      [m.to, m.hold_return_stage, m.hold_reason, m.to === 'CLOSED' ? at : null, at, c.id],
    );
    d.db.run(
      'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, c.id, at, actor.id, actor.role, m.kind, c.stage, m.to, m.reason_code, m.reason_text],
    );
    const task = next === null ? null : writeNextAction(d.db, d.now, d.newId, actor, c, next);
    return { raised: raiseBusinessStage(d.db, c.business_id, at), nextTask: task };
  });
  // WHO, FROM, TO AND THE REASON'S CODE. The reason's text is in the move row this names.
  d.audit.append({
    at, kind: 'CLAIM_STAGE_MOVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id,
    detail: {
      move: id, kind: m.kind, from: c.stage, to: m.to, reason: m.reason_code, business: c.business_id,
      ...(raised === null ? {} : { business_stage_raised_to: raised }),
    },
  });
  if (nextTask !== null) {
    d.audit.append({
      at, kind: 'NEXT_ACTION_SET', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'staff_task', object_id: nextTask,
      detail: { task: nextTask, business: c.business_id, claim: c.id, route: 'stage_move' },
    });
  }
  // CRM 3 of 10. A RESUME returns from a pause and is not an entry (`enteredAt`), so it fires nothing.
  if (m.kind !== 'RESUME') fireAutomation(d, actor, { trigger: 'STAGE_ENTERED', claim_id: c.id, stage: m.to });
  /* CRM 5 of 10. A referred claim entering a stage the referral paper names is a notice to the firm — queued only
     under the client's opt-in — and a referred claim closing under reward model B accrues the firm's fee. After the
     commit, as the automation is: neither can undo a move a gate allowed. */
  if (m.kind !== 'RESUME') onClaimStageEntered(d, actor, c.id, m.to);
  return { ok: true, id, from: c.stage, to: m.to };
}

/**
 * CRM 3 of 10 — ONE NEXT ACTION. Asked after every other check on a move, so a
 * gate's refusal is still the gate's. A next action carried on the request is
 * checked and written with the move; without one, the claim must keep its own.
 * A move to CLOSED or to an exit needs none.
 */
function nextActionFor(
  d: PipelineDeps, c: PipelineClaim, req: MoveRequest, to: string,
): { ok: true; write: NextActionWrite | null } | { ok: false; why: string; field?: string } {
  if (isTerminalStage(to)) return { ok: true, write: null };
  const na = req.next_action;
  if (na !== undefined && na !== null && (na.title !== null || na.owner_id !== null || na.due_on !== null)) {
    const v = validNextAction(d.db, na);
    // The move form names its next-action fields differently from the task form's.
    const onMove: Record<string, string> = { title: 'next_action_title', owner_id: 'next_action_owner', due_on: 'next_action_due' };
    return v.ok ? { ok: true, write: v.value } : { ok: false, why: v.why, field: onMove[v.field ?? ''] ?? 'next_action_title' };
  }
  const refusal = nextActionRefusal(d.db, c.id, to);
  return refusal === null ? { ok: true, write: null } : { ok: false, why: refusal };
}

/**
 * MOVE A CLAIM. The one write path for a claim's stage.
 *
 * FORWARD  exactly the next stage, and only through the gate out of this one
 * EXIT     to an exit the procedure draws from this stage, with a listed reason
 * HOLD     from any of the ten, with a reason; it returns to where it was
 * RESUME   back to the stage it was held at, and nowhere else
 * REOPEN   ADMIN alone, with a reason: to an earlier stage, or back into the
 *          procedure from an exit, a close or an unrecognised stage — never past
 *          where the claim has already been
 */
export function moveClaim(d: PipelineDeps, actor: Actor, claim_id: string, req: MoveRequest, opts: GateOptions = {}): MoveResult {
  const c = loadPipelineClaim(d.db, claim_id);
  const kind = req.kind;
  if (kind !== 'FORWARD' && kind !== 'EXIT' && kind !== 'HOLD' && kind !== 'RESUME' && kind !== 'REOPEN') {
    return { ok: false, why: 'That is not a move a claim makes.' };
  }
  authorise(actor, kind === 'REOPEN' ? 'claim.reopen' : 'claim.move', claimObjFor(d.db, c));
  const s = claimStage(c.stage);
  const to = req.to ?? null;
  const note = text(req.reason, 2000, 'The reason');
  if (!note.ok) return refuse(d, actor, c, kind, to, note.why, 'reason');

  if (kind === 'FORWARD') {
    if (s.kind !== 'PROCEDURE') {
      return refuse(d, actor, c, kind, to,
        s.kind === 'CLOSED' ? 'A closed claim does not move on. An admin may reopen it, with a reason.'
          : s.kind === 'EXIT' ? `This claim has stopped — ${s.label} — and keeps its record. An admin may reopen it, with a reason.`
            : s.kind === 'ON_HOLD' ? 'This claim is on hold. Resume it at the stage it was held at first.'
              : 'This claim has no step set. An admin may reopen it at the enquiry, with a reason.');
    }
    const next = nextProcedureKey(s.key);
    if (to !== next) {
      return refuse(d, actor, c, kind, to,
        `A claim moves one step at a time, and each step is checked. From ${s.label} the next step is ${stageLabel(next)}.`);
    }
    // CRM 6 of 10: the gate reads the amendment window on the move's own clock.
    const g = gateOut(d.db, c, s.key, { ...opts, today: opts.today ?? d.now() });
    if (!g.open) {
      return refuse(d, actor, c, kind, to,
        `Not ready to move on from ${g.label} yet. Still needed: ${g.needs.filter((n) => !n.met).map((n) => `${n.what} — ${n.why}`).join('; ')}.`);
    }
    const na = nextActionFor(d, c, req, next);
    if (!na.ok) return refuse(d, actor, c, kind, to, na.why, na.field);
    return apply(d, actor, c, {
      kind, to: next, reason_code: null, reason_text: note.value, hold_return_stage: null, hold_reason: c.hold_reason,
    }, na.write);
  }

  if (kind === 'EXIT') {
    const exit = exitStage(to);
    if (exit === undefined) return refuse(d, actor, c, kind, to, 'Choose one of the ways a claim can close.', 'to');
    const at: ProcedureKey | null = s.kind === 'PROCEDURE' ? s.key
      : s.kind === 'ON_HOLD' && procedureStage(c.hold_return_stage) !== undefined ? (c.hold_return_stage as ProcedureKey) : null;
    if (at === null) {
      return refuse(d, actor, c, kind, to,
        s.kind === 'CLOSED' ? 'A closed claim has finished; it does not exit.'
          : s.kind === 'EXIT' ? 'This claim has already stopped, and keeps that record.'
            : 'This claim has no step set, so it cannot be closed from here. An admin may reopen it first.');
    }
    if (exit.from !== 'ANY_OPEN' && !exit.from.includes(at)) {
      return refuse(d, actor, c, kind, to,
        `${exit.label} can only be used from ${exit.from.map((k) => stageLabel(k)).join(', ')}, and this claim is at ${stageLabel(at)}.`);
    }
    const reason = d.db.get<ReasonRow>(
      "SELECT code, label, active FROM reason_lists WHERE list = 'CLAIM_EXIT' AND code = ?", [req.reason_code ?? '']);
    if (reason === undefined || reason.active !== 1) {
      return refuse(d, actor, c, kind, to, 'Choose a reason from the list.', 'reason_code');
    }
    if (reason.code === 'OTHER' && note.value === null) {
      return refuse(d, actor, c, kind, to, '“Another reason” needs the reason written in the note.', 'reason');
    }
    return apply(d, actor, c, {
      kind, to: exit.key, reason_code: reason.code, reason_text: note.value, hold_return_stage: null, hold_reason: c.hold_reason,
    });
  }

  if (kind === 'HOLD') {
    if (s.kind !== 'PROCEDURE') {
      return refuse(d, actor, c, kind, to, 'Only a claim at one of the ten steps can be put on hold.');
    }
    const reason = text(req.reason, 1000, 'The hold reason');
    if (!reason.ok) return refuse(d, actor, c, kind, to, reason.why, 'reason');
    if (reason.value === null) return refuse(d, actor, c, kind, to, 'A hold carries its reason — say why the claim is on hold.', 'reason');
    const na = nextActionFor(d, c, req, 'ON_HOLD');
    if (!na.ok) return refuse(d, actor, c, kind, to, na.why, na.field);
    return apply(d, actor, c, {
      kind, to: 'ON_HOLD', reason_code: null, reason_text: reason.value, hold_return_stage: s.key, hold_reason: reason.value,
    }, na.write);
  }

  if (kind === 'RESUME') {
    if (s.kind !== 'ON_HOLD' || procedureStage(c.hold_return_stage) === undefined) {
      return refuse(d, actor, c, kind, to, 'Only a claim on hold can be resumed.');
    }
    const back = c.hold_return_stage as ProcedureKey;
    if (to !== null && to !== back) {
      return refuse(d, actor, c, kind, to, `A claim on hold resumes at the stage it left — ${stageLabel(back)} — and nowhere else.`);
    }
    const na = nextActionFor(d, c, req, back);
    if (!na.ok) return refuse(d, actor, c, kind, to, na.why, na.field);
    return apply(d, actor, c, {
      kind, to: back, reason_code: null, reason_text: note.value, hold_return_stage: null, hold_reason: null,
    }, na.write);
  }

  // REOPEN — ADMIN alone (authorised above), always with a reason.
  if (note.value === null) return refuse(d, actor, c, kind, to, 'Say why the claim is going back.', 'reason');
  const target = procedureStage(to);
  if (target === undefined) return refuse(d, actor, c, kind, to, 'A claim reopens at one of the ten steps.');
  const ti = PROCEDURE_KEYS.indexOf(target.key);
  const allowed = reopenTargets(d.db, c).includes(target.key);
  if (!allowed) {
    return refuse(d, actor, c, kind, to,
      s.kind === 'UNKNOWN'
        ? 'A claim with no step set reopens at the enquiry. Each step is checked again from there.'
        : s.kind === 'PROCEDURE' || s.kind === 'ON_HOLD'
          ? 'A reopen moves a claim back. To move it on, go one step at a time, with each step checked.'
          : `A claim reopens no later than the furthest stage it reached; ${stageLabel(target.key)} is further.`);
  }
  void ti;
  const na = nextActionFor(d, c, req, target.key);
  if (!na.ok) return refuse(d, actor, c, kind, to, na.why, na.field);
  return apply(d, actor, c, {
    kind, to: target.key, reason_code: null, reason_text: note.value, hold_return_stage: null, hold_reason: null,
  }, na.write);
}

/** Where an admin may reopen this claim. */
export function reopenTargets(db: Db, c: PipelineClaim): ProcedureKey[] {
  const s = claimStage(c.stage);
  if (s.kind === 'UNKNOWN') return ['ENQUIRY'];
  if (s.kind === 'PROCEDURE') return PROCEDURE_KEYS.slice(0, PROCEDURE_KEYS.indexOf(s.key));
  if (s.kind === 'ON_HOLD') {
    const i = procedureIndex(c.hold_return_stage);
    return i < 0 ? ['ENQUIRY'] : PROCEDURE_KEYS.slice(0, i);
  }
  // CLOSED or an exit: back into the procedure, no further than the claim has been.
  const reached = Math.min(furthestReached(db, c), PROCEDURE_KEYS.length - 1);
  return reached < 0 ? ['ENQUIRY'] : PROCEDURE_KEYS.slice(0, reached + 1);
}

/** The exits the procedure draws from where this claim stands. */
export function exitsFrom(c: { stage: string | null; hold_return_stage: string | null }): ExitKey[] {
  const s = claimStage(c.stage);
  const at = s.kind === 'PROCEDURE' ? s.key
    : s.kind === 'ON_HOLD' && procedureStage(c.hold_return_stage) !== undefined ? (c.hold_return_stage as ProcedureKey) : null;
  if (at === null) return [];
  return EXITS.filter((e) => e.from === 'ANY_OPEN' || e.from.includes(at)).map((e) => e.key);
}

/* ================================================================== *
 * 6 · RECORDING A MILESTONE, AND AN ENQUIRY CHECK
 * ================================================================== */

export function recordMilestone(
  d: PipelineDeps, actor: Actor, claim_id: string, milestone: string | null, noteIn: string | null,
): Result {
  const c = loadPipelineClaim(d.db, claim_id);
  authorise(actor, 'claim.move', claimObjFor(d.db, c));
  if (!has(MILESTONES, milestone)) {
    return {
      ok: false,
      why: 'That tick is not used here. The surveyor’s figures and the tax adviser’s sign-off ' +
        'are records of their own. No tick stands in for either.',
    };
  }
  const m = MILESTONES[milestone];
  if (m.retired !== undefined) return { ok: false, why: m.retired };
  if (c.stage !== m.stage) {
    return {
      ok: false,
      why: `“${m.label}” is confirmed while the claim is at ${stageLabel(m.stage)}; this claim is at ${claimStage(c.stage).label}.`,
    };
  }
  const note = text(noteIn, 2000, 'The note');
  if (!note.ok) return note;
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_milestones (id, claim_id, milestone, stage_at, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, milestone, m.stage, note.value, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_MILESTONE_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { milestone, stage: m.stage, business: c.business_id },
  });
  return { ok: true, id };
}

/**
 * RECORD ONE ENQUIRY CHECK — YES, NO OR UNKNOWN, WITH WHO RECORDED IT.
 *
 * UNKNOWN IS OFFERED, so nobody is forced to guess to get past the form (N4):
 * an answer is required, and "not known" is an answer. It does not pass.
 */
export function recordEnquiryCheck(
  d: PipelineDeps, actor: Actor, subject: EnquirySubject,
  input: { check_key: string | null; answer: string | null; note: string | null },
): Result {
  let target: { lead_id: string | null; claim_id: string | null; business: string | null };
  if ('lead_id' in subject) {
    const l = d.db.get<{ id: string; business_id: string | null; status: string }>(
      'SELECT id, business_id, status FROM leads WHERE id = ?', [subject.lead_id]);
    if (l === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'lead.write', { type: 'lead', id: l.id, business_id: l.business_id });
    if (l.status === 'CONVERTED') {
      return { ok: false, why: 'This lead has converted, and its enquiry was settled when it did. Record a check on its claim.' };
    }
    if (l.status === 'LOST') return { ok: false, why: 'This lead is lost. Bring it back first, then record the check.' };
    target = { lead_id: l.id, claim_id: null, business: l.business_id };
  } else {
    const c = loadPipelineClaim(d.db, subject.claim_id);
    authorise(actor, 'claim.move', claimObjFor(d.db, c));
    if (c.stage !== 'ENQUIRY') {
      return { ok: false, why: 'The enquiry checks are recorded while a claim is at the enquiry.' };
    }
    target = { lead_id: null, claim_id: c.id, business: c.business_id };
  }
  if (!has(ENQUIRY_CHECKS, input.check_key)) return { ok: false, why: 'Choose one of the enquiry checks.', field: 'check_key' };
  if (!has(CHECK_ANSWERS, input.answer)) {
    return { ok: false, why: 'Answer yes, no, or not known — not known is an answer, and it does not pass.', field: 'answer' };
  }
  const note = text(input.note, 2000, 'The note');
  if (!note.ok) return { ...note, field: 'note' };
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, target.lead_id, target.claim_id, input.check_key, input.answer, note.value, actor.id, at],
    );
    if (target.lead_id !== null) d.db.run('UPDATE leads SET updated_at = ? WHERE id = ?', [at, target.lead_id]);
  });
  d.audit.append({
    at, kind: 'ENQUIRY_CHECK_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: target.lead_id !== null ? 'lead' : 'claim', object_id: target.lead_id ?? target.claim_id,
    detail: { check: input.check_key, answer: input.answer, business: target.business },
  });
  return { ok: true, id };
}

/* ================================================================== *
 * 7 · THE CLAIM PAGE'S PIPELINE PANEL
 * ================================================================== */

export type Step = { readonly key: string; readonly label: string; readonly state: 'done' | 'current' | 'exited' | 'todo' };

export type HistoryLine = {
  readonly at: string; readonly what: string; readonly from: string; readonly to: string;
  readonly who: string; readonly reason: string | null; readonly note: string | null;
};

export type PipelinePanel = {
  readonly stage: { readonly key: string | null; readonly kind: string; readonly label: string };
  /** The procedure's ten and CLOSED, each done, current, exited or to do. Empty where the stage is not recognised. */
  readonly steps: readonly Step[];
  /** Everything below is for the roles that work the pipeline, and absent for anybody else. */
  readonly hold?: { readonly reason: string | null; readonly returns_to: string };
  readonly portal?: {
    readonly shows: string; readonly this_claim_evidences: string | null;
    /** PHASE 158b (F27): the client steps, so a page can draw the line under the request's own name switch. */
    readonly shows_key: StageKey | null; readonly evidences_key: StageKey | null;
  };
  readonly gate?: GateReading;
  readonly enquiry?: EnquiryReading & { readonly evidence: Readonly<Record<CheckKey, readonly string[]>> };
  readonly confirmations?: readonly { readonly key: MilestoneKey; readonly label: string; readonly recorded: string | null }[];
  readonly fee_trigger?: { readonly reading: string; readonly decided: boolean; readonly question: string };
  readonly claimable_figure?: { readonly released: boolean; readonly why: string };
  readonly history?: readonly HistoryLine[];
  readonly moves?: {
    readonly forward: { readonly to: string; readonly label: string; readonly open: boolean } | null;
    readonly exits: readonly { readonly key: string; readonly label: string }[];
    readonly exit_reasons: readonly { readonly code: string; readonly label: string }[];
    readonly may_hold: boolean;
    readonly resume: { readonly to: string; readonly label: string } | null;
    readonly reopen: readonly { readonly key: string; readonly label: string }[];
    readonly may_record: boolean;
  };
};

function stepsFor(db: Db, c: PipelineClaim): Step[] {
  const s = claimStage(c.stage);
  if (s.kind === 'UNKNOWN') return [];
  const keys: readonly (ProcedureKey | 'CLOSED')[] = [...PROCEDURE_KEYS, 'CLOSED'];
  const at = s.kind === 'PROCEDURE' ? procedureIndex(s.key)
    : s.kind === 'ON_HOLD' ? procedureIndex(c.hold_return_stage)
      : s.kind === 'CLOSED' ? keys.length : Math.min(furthestReached(db, c), PROCEDURE_KEYS.length - 1);
  return keys.map((k, n) => ({
    key: k, label: stageLabel(k),
    state: s.kind === 'CLOSED' ? 'done'
      : n < at ? 'done'
        : n === at ? (s.kind === 'EXIT' ? 'exited' : 'current')
          : 'todo',
  }));
}

/**
 * BUILT FORWARDS, AS THE CLAIM VIEW IS. Every reader of the claim gets its stage
 * and its steps — a stage is not an estimate, and a surveyor on an assigned job
 * should know where the claim is. The gate, the history, the reasons, the
 * confirmations and the moves are added only for `pipeline.read`: a hold reason
 * or an exit note is staff prose, and staff prose is not built into a SURVEYING
 * response. ACCOUNTING never reaches this — its claim view is client, reference
 * and money.
 */
export function pipelinePanel(db: Db, actor: Actor, c: PipelineClaim, opts: GateOptions = {}): PipelinePanel {
  const s = claimStage(c.stage);
  const base = { stage: { key: s.key, kind: s.kind, label: s.label }, steps: stepsFor(db, c) };
  if (!can(actor, 'pipeline.read', { type: 'pipeline', id: c.id })) return base;

  const business = db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [c.business_id]);
  const effective = s.kind === 'ON_HOLD' ? c.hold_return_stage : c.stage;
  const evidences = clientStageFor(effective);
  const history = db.all<{
    at: string; kind: string; from_stage: string | null; to_stage: string | null; reason_code: string | null;
    reason_text: string | null; who: string | null;
  }>(
    'SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
      'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at DESC, m.rowid DESC',
    [c.id],
  ).map((m) => ({
    at: localStamp(m.at), what: MOVE_WORDS[m.kind] ?? m.kind,
    from: anyStageLabel(m.from_stage), to: anyStageLabel(m.to_stage),
    who: m.who ?? (m.kind === 'CONVERTED' || m.kind === 'OPENED' ? 'the system' : 'a former user'),
    reason: reasonLabel(db, 'CLAIM_EXIT', m.reason_code), note: m.reason_text,
  }));

  const here = s.kind === 'PROCEDURE' ? s.key : null;
  const confirmations = here === null ? [] : (Object.keys(MILESTONES) as MilestoneKey[])
    .filter((k) => MILESTONES[k].stage === here && MILESTONES[k].retired === undefined)
    .map((k) => {
      const hit = milestoneSince(db, c.id, k, enteredAt(db, c, here));
      return { key: k, label: MILESTONES[k].label, recorded: hit === undefined ? null : localStamp(hit.at) };
    });

  const mayMove = can(actor, 'claim.move', claimObjFor(db, c));
  const mayReopen = can(actor, 'claim.reopen', claimObjFor(db, c));
  const gate = here === null ? undefined : gateOut(db, c, here, opts);
  const next = here === null ? null : nextProcedureKey(here);

  return {
    ...base,
    ...(s.kind === 'ON_HOLD' ? { hold: { reason: c.hold_reason, returns_to: anyStageLabel(c.hold_return_stage) } } : {}),
    portal: {
      /* PHASE 158b (F27): the portal's own line, numbered, in the shipped step names (NAME_SWITCHES.portalSteps is on).
         The claim page redraws it from the keys under the request's own switch (crm-pages.ts); this module does not
         import navigation.ts, which reads the settings tiles as it loads (an import loop broke phase156e). */
      shows: clientStage(business?.stage ?? '') === undefined ? 'a step the client’s page does not show'
        : portalStepLine(business?.stage as StageKey, true),
      this_claim_evidences: evidences === null ? null
        : clientStage(evidences) === undefined ? evidences : portalStepLine(evidences as StageKey, true),
      shows_key: clientStage(business?.stage ?? '') === undefined ? null : business?.stage as StageKey,
      evidences_key: evidences === null || clientStage(evidences) === undefined ? null : evidences as StageKey,
    },
    ...(gate === undefined ? {} : { gate }),
    ...(here === 'ENQUIRY'
      ? { enquiry: { ...enquiryGate(db, { claim_id: c.id }), evidence: enquiryEvidence(db, actor, c.business_id, null) } }
      : {}),
    confirmations,
    fee_trigger: { reading: FEE_TRIGGERS[FEE_TRIGGER.reading], decided: FEE_TRIGGER.decided, question: FEE_TRIGGER.question },
    claimable_figure: claimableFigureReleased(db, c),
    history,
    ...(mayMove || mayReopen ? {
      moves: {
        forward: !mayMove || next === null || gate === undefined ? null : { to: next, label: stageLabel(next), open: gate.open },
        exits: mayMove ? exitsFrom(c).map((k) => ({ key: k, label: exitStage(k)?.label ?? k })) : [],
        exit_reasons: mayMove ? reasonList(db, 'CLAIM_EXIT') : [],
        may_hold: mayMove && s.kind === 'PROCEDURE',
        resume: mayMove && s.kind === 'ON_HOLD' && procedureStage(c.hold_return_stage) !== undefined
          ? { to: c.hold_return_stage ?? '', label: anyStageLabel(c.hold_return_stage) } : null,
        reopen: mayReopen ? reopenTargets(db, c).map((k) => ({ key: k, label: stageLabel(k) })) : [],
        may_record: mayMove,
      },
    } : {}),
  };
}

/** For a screen that lists every stage — the board's columns, in order. */
export const BOARD_COLUMNS: readonly {
  readonly key: ProcedureKey | 'CLOSED'; readonly label: string; readonly gate: string; readonly owner: string;
}[] = Object.freeze([
  ...PROCEDURE_STAGES.map((p) => ({ key: p.key, label: p.label, gate: p.gate, owner: p.owner })),
  { key: 'CLOSED' as const, label: 'Closed', gate: '', owner: '' },
]);
