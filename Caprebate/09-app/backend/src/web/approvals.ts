/**
 * CHECKED AND APPROVED, AND TELLING THE CLIENT — PHASE 139, 21 September 2026. "Clean-up 6 of 11."
 *
 * Lakhbir, 18 September 2026: "When viewing the client's portfolio there needs to be where the information has come from
 * (API) with a secondary approve box. When a user clicks approve this then pushes the details to say Cap Rebate has
 * completed this to the client - the idea is that we can then manage the flow to the customer."
 *
 * THREE THINGS, IN THIS ORDER, AND STAFF DRIVE EVERY ONE OF THEM:
 *
 *   1 · EVERY FACT SAYS WHERE IT CAME FROM. A register record's field, a client's answer, a recorded claim fact, a survey
 *       job, a tax adviser's sign-off and an issued report each become one line: what it is, a source chip ("Companies
 *       House", "EPC register", "You told us", "Surveyor"), the date it arrived, and a tick box "Checked and approved".
 *       Ticking is recorded (migration 034, `fact_approvals`) and audited with who and when. Taking a tick off asks why.
 *
 *   2 · FACTS GROUP INTO THE CLIENT'S STEPS (`STEPS`). A step is complete only when it has at least one fact, every fact
 *       in it is ticked, and nothing it needs is still missing. An empty step is not complete: nothing checked is not the
 *       same as everything checked (N4). The steps sit ON TOP OF the ten-stage procedure and never move it — the mapping
 *       is a table in the Developer Spec.
 *
 *   3 · A COMPLETE STEP IS TOLD TO THE CLIENT ONLY WHEN SOMEONE PRESSES "Tell the client". Never automatically. The portal
 *       then says "Cap Rebate has checked your company details" with the date (`clientSteps`). Only Admin can take a
 *       step back, with a reason; the portal then says "Being re-checked", and never the reason.
 *
 * WHAT THE CLIENT'S VIEW CAN NEVER CARRY. `clientSteps` reads `client_step_notices` and nothing else: a step's key, its
 * claim and a date. It has no path to a fact, a value, a register record, a figure, an estimate, a reason or a name, so
 * none of them can reach the portal from here — test/phase139.test.ts proves it on the wire.
 *
 * THE PAID-RESEARCH RULE STANDS. Approval is on the RESULTS, never on the calls: "Run the research" still runs every call
 * it may, in one press, with no per-call confirmation (src/web/research.ts). Nothing here calls a register. The
 * connectors are still stubs, so the facts a register gives are the seeded records in `register_records`.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { claimName } from './components.ts';
import { missingFacts, sectionOfFact } from './engaged.ts';
import { registerAttribution } from './research.ts';
import { FACTS, captured, factsPanel, latestFacts, recordFact, type FactReading } from './claim-facts.ts';
import type { ProcedureKey } from './stages.ts';

export type ApprovalDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Result = { readonly ok: true } | { readonly ok: false; readonly why: string; readonly field?: string };

/* ================================================================== *
 * 1 · THE STEPS
 * ================================================================== */

export type StepKey = 'COMPANY' | 'PROPERTY' | 'TAX' | 'SURVEY_BOOKED' | 'SURVEY_DONE' | 'TAX_ADVISER' | 'REPORT';

export type StepDef = {
  readonly key: StepKey;
  /** What staff read. */
  readonly label: string;
  /** What the client reads once told. */
  readonly told: string;
  /** What the client reads while Admin has it back. */
  readonly rechecking: string;
  /** The stages of the ten-stage procedure this step sits on. It never moves them. */
  readonly procedure: readonly ProcedureKey[];
};

/** In the order a claim goes through them. The company step is the company's; the other six belong to each claim. */
export const STEPS: readonly StepDef[] = Object.freeze([
  { key: 'COMPANY', label: 'Company details checked', told: 'Cap Rebate has checked your company details',
    rechecking: 'Your company details are being re-checked', procedure: ['DATA_GATHERING'] },
  { key: 'PROPERTY', label: 'Property details checked', told: 'Cap Rebate has checked your property details',
    rechecking: 'Your property details are being re-checked', procedure: ['DATA_GATHERING'] },
  { key: 'TAX', label: 'Tax details checked', told: 'Cap Rebate has checked your tax details',
    rechecking: 'Your tax details are being re-checked', procedure: ['DATA_GATHERING'] },
  { key: 'SURVEY_BOOKED', label: 'Survey booked', told: 'Cap Rebate has booked your survey',
    rechecking: 'Your survey booking is being re-checked', procedure: ['SURVEY'] },
  { key: 'SURVEY_DONE', label: 'Survey done', told: 'Your survey is done',
    rechecking: 'Your survey is being re-checked', procedure: ['SURVEY', 'VALUATION'] },
  { key: 'TAX_ADVISER', label: 'Figures checked by a tax adviser', told: 'A tax adviser has checked the figures',
    rechecking: 'The tax adviser’s check is being re-checked', procedure: ['TAX_ADVISER_SIGNOFF'] },
  { key: 'REPORT', label: 'Report ready', told: 'Your report is ready',
    rechecking: 'Your report is being re-checked', procedure: ['REPORTS'] },
]);

export function stepDef(key: string): StepDef | undefined {
  return STEPS.find((s) => s.key === key);
}

const CLAIM_STEPS: readonly StepKey[] = ['PROPERTY', 'TAX', 'SURVEY_BOOKED', 'SURVEY_DONE', 'TAX_ADVISER', 'REPORT'];

/* ================================================================== *
 * 2 · WHERE A FACT CAME FROM, IN WORDS
 * ================================================================== */

/** A register's name on its chip. A register not here is "A public register" — named, never hidden. */
export const REGISTER_CHIPS: Readonly<Record<string, string>> = Object.freeze({
  CH_COMPANY: 'Companies House', CH_PSC: 'Companies House',
  EPC: 'EPC register', HMLR_PPD: 'HM Land Registry', HMLR_TITLE: 'HM Land Registry',
  CQC: 'Care regulator', CIW: 'Care regulator', CARE_INSPECTORATE: 'Care regulator', VOA: 'Valuation office', PLANNING: 'Planning register',
  ONS_POSTCODE: 'Postcode register', HOMEDATA_ADDRESS: 'Address lookup',
});

/** The registers that describe the company. Every other register describes a property. */
const COMPANY_REGISTERS: readonly string[] = ['CH_COMPANY', 'CH_PSC'];

/** Where a recorded claim fact came from, on its chip. */
const CAPTURE_CHIPS: Readonly<Record<string, string>> = Object.freeze({
  CLIENT_ANSWER: 'You told us', CLIENT_DOC: 'Your document', SURVEYOR: 'Surveyor', CTA: 'Tax adviser',
});

/** A register field's name in words. A field not here is spelt out from its own name. */
const FIELD_WORDS: Readonly<Record<string, string>> = Object.freeze({
  company_number: 'Company number', company_status: 'Company status', company_name: 'Company name',
  sic_codes: 'What the company does (SIC code)', accounts_year_end: 'Accounts year end', incorporation_date: 'Date the company started',
  registration_status: 'Registration', beds_registered: 'Beds registered', regulated_activities: 'What it is registered to do',
  service_types: 'Type of service', registration_date: 'Date registered', cqc_location_id: 'Care regulator location number',
  cqc_provider_id: 'Care regulator provider number', epc_total_floor_area_m2: 'Floor area (square metres)',
  epc_property_type: 'Type of building', epc_construction_age_band: 'When it was built', epc_tenure: 'Who occupies it',
  epc_lodgement_date: 'Date of the energy certificate', epc_rrn: 'Energy certificate number',
});

function fieldWords(field: string): string {
  const known = FIELD_WORDS[field];
  if (known !== undefined) return known;
  const w = field.replace(/^(epc|cqc|ch|hmlr|voa)_/, '').replace(/_m2$/, ' (square metres)').replace(/_/g, ' ');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/* ================================================================== *
 * 3 · THE VIEW
 * ================================================================== */

/** A claim fact the client answered, offered as the fact itself: approving it records the fact (Phase 138's carry). */
export type AnswerAsFact = {
  readonly key: string;
  readonly kind: 'date' | 'pence' | 'choice' | 'text';
  readonly choices: readonly { readonly value: string; readonly label: string }[];
  /** The client's words, put in the box for staff to check. Never a guess: a choice is chosen only on an exact match. */
  readonly prefill: string;
};

export type CheckFact = {
  /** Built from the row the fact came from, so a new value is a new ref and starts unticked. */
  readonly ref: string;
  readonly step: StepKey | null;
  readonly claim_id: string | null;
  readonly label: string;
  /** Staff only. Never handed to anything the portal draws. */
  readonly value: string;
  readonly chip: string;
  /** Phase 146c: the words the register's licence says must go with its data, verbatim (HM Land Registry's sale prices). */
  readonly attribution?: string | null;
  /** When it arrived — the record's own time. Null only where nothing recorded one. */
  readonly arrived: string | null;
  readonly approved: { readonly by: string; readonly at: string } | null;
  /** The reason the last tick was taken off, while it is off. */
  readonly untick: { readonly by: string; readonly at: string; readonly reason: string } | null;
  /** False where there is nothing to check: "not known" is never ticked as checked (N4). */
  readonly approvable: boolean;
  readonly why_not: string | null;
  readonly as_fact?: AnswerAsFact;
};

export type StepState = 'NOTHING_YET' | 'CHECKING' | 'READY_TO_TELL' | 'TOLD' | 'RECHECKING';

export type StepView = {
  readonly key: StepKey;
  readonly label: string;
  readonly claim_id: string | null;
  readonly facts: readonly CheckFact[];
  /** How many facts this step needs that are still missing. A step with any missing is not complete. */
  readonly missing: number;
  readonly complete: boolean;
  readonly state: StepState;
  readonly told: { readonly at: string; readonly by: string } | null;
  readonly taken_back: { readonly at: string; readonly by: string; readonly reason: string } | null;
  readonly may_tell: boolean;
  readonly may_take_back: boolean;
};

export type ChecksPanel = {
  readonly business_id: string;
  readonly company: StepView;
  readonly claims: readonly { readonly id: string; readonly name: string; readonly ref: string; readonly steps: readonly StepView[] }[];
  /** Facts that belong to a claim's step but cannot be tied to one claim. Shown, and they complete nothing. */
  readonly unmatched: readonly CheckFact[];
  readonly may_approve: boolean;
};

function stepsObj(business_id: string): { type: 'client_steps'; id: string; business_id: string } {
  return { type: 'client_steps', id: business_id, business_id };
}

type ApprovalRow = { fact_ref: string; action: string; reason: string | null; at: string; who: string | null };

function approvalsFor(db: Db, business_id: string): Map<string, ApprovalRow> {
  const out = new Map<string, ApprovalRow>();
  for (const r of db.all<ApprovalRow>(
    'SELECT a.fact_ref, a.action, a.reason, a.at, u.display_name AS who FROM fact_approvals a ' +
      'LEFT JOIN users u ON u.id = a.actor_id WHERE a.business_id = ? ORDER BY a.at ASC, a.rowid ASC',
    [business_id])) out.set(r.fact_ref, r);
  return out;
}

type StepEventRow = { claim_id: string | null; step: string; action: string; reason: string | null; at: string; who: string | null };

function stepEventsFor(db: Db, business_id: string): Map<string, { last: StepEventRow; told: StepEventRow | null }> {
  const out = new Map<string, { last: StepEventRow; told: StepEventRow | null }>();
  for (const r of db.all<StepEventRow>(
    'SELECT e.claim_id, e.step, e.action, e.reason, e.at, u.display_name AS who FROM client_step_notices e ' +
      'LEFT JOIN users u ON u.id = e.actor_id WHERE e.business_id = ? ORDER BY e.at ASC, e.rowid ASC',
    [business_id])) {
    const k = `${r.claim_id ?? ''}:${r.step}`;
    const was = out.get(k);
    out.set(k, { last: r, told: r.action === 'TOLD' ? r : (was?.told ?? null) });
  }
  return out;
}

type ClaimRow = { id: string; claim_ref: string; property_id: string | null; label: string | null };

function claimsOf(db: Db, business_id: string): ClaimRow[] {
  return db.all<ClaimRow>(
    'SELECT c.id, c.claim_ref, c.property_id, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id ' +
      'WHERE c.business_id = ? ORDER BY c.created_at ASC, c.claim_ref ASC', [business_id]);
}

/** Every fact of a company, before its tick is read. Built from the rows themselves, never typed per fact. */
type RawFact = Omit<CheckFact, 'approved' | 'untick' | 'approvable' | 'why_not'> & { readonly known: boolean; readonly why_unknown?: string };

function registerFacts(db: Db, business_id: string, claims: readonly ClaimRow[]): RawFact[] {
  const out: RawFact[] = [];
  for (const r of db.all<{ id: string; source_id: string; entity_id: string; fields_json: string; obtained_at: string; property_id: string | null }>(
    'SELECT id, source_id, entity_id, fields_json, obtained_at, property_id FROM register_records WHERE business_id = ? ORDER BY obtained_at ASC, id ASC',
    [business_id])) {
    let fields: Record<string, unknown>;
    try { fields = JSON.parse(r.fields_json) as Record<string, unknown>; } catch { continue; }
    const company = COMPANY_REGISTERS.includes(r.source_id);
    // A property's record belongs to the claim on that property; with no property recorded, to the company's one claim
    // if it has only one; otherwise to no claim — shown, and completing nothing.
    const onProperty = r.property_id === null ? [] : claims.filter((c) => c.property_id === r.property_id);
    const claim = company ? null : onProperty.length === 1 ? onProperty[0] ?? null
      : r.property_id === null && claims.length === 1 ? claims[0] ?? null : null;
    for (const [field, v] of Object.entries(fields)) {
      const known = v !== null && v !== undefined && String(v).trim() !== '';
      out.push({
        ref: `reg.${r.id}.${field}`, step: company ? 'COMPANY' : claim === null ? null : 'PROPERTY', claim_id: claim?.id ?? null,
        label: fieldWords(field), value: known ? String(v) : 'not known',
        // PHASE 146k: a record a person typed from the official copy says so, so nobody ticks it as if a lookup made it.
        chip: `${REGISTER_CHIPS[r.source_id] ?? 'A public register'}${r.entity_id.startsWith('by-hand:') ? ', entered by hand' : ''}`,
        attribution: registerAttribution(r.source_id), arrived: r.obtained_at, known,
      });
    }
  }
  return out;
}

type TaskRow = {
  id: string; fact_id: string | null; claim_id: string | null; question: string; answer_state: string | null;
  answer: string | null; answered_at: string | null;
};

/**
 * THE CLIENT'S OWN ANSWERS — a question put to them and answered in the portal. An answer staff typed after a call is
 * staff's record, not "You told us", and is left out. A claim fact's answer (`claim_fact.<key>`) is offered as the fact:
 * once ticked, the recorded fact stands in for it, so the answer is not listed twice.
 */
function answerFacts(db: Db, business_id: string, claims: readonly ClaimRow[]): RawFact[] {
  const out: RawFact[] = [];
  for (const t of db.all<TaskRow>(
    "SELECT id, fact_id, claim_id, question, answer_state, answer, answered_at FROM client_tasks " +
      "WHERE business_id = ? AND kind = 'QUESTION' AND state = 'ANSWERED' AND answered_by_role = 'CLIENT' ORDER BY answered_at ASC, id ASC",
    [business_id])) {
    const fact = t.fact_id ?? '';
    const claimFact = fact.startsWith('claim_fact.') ? fact.slice('claim_fact.'.length) : null;
    const section = claimFact !== null ? 'facts' : fact.startsWith('property.') ? 'property' : sectionOfFact(fact);
    const step: StepKey = section === 'company' ? 'COMPANY' : section === 'property' ? 'PROPERTY' : 'TAX';
    const claim = step === 'COMPANY' ? null
      : t.claim_id !== null ? (claims.find((c) => c.id === t.claim_id) ?? null) : claims.length === 1 ? claims[0] ?? null : null;
    const known = t.answer_state === 'ANSWERED' && t.answer !== null && t.answer.trim() !== '';
    const def = claimFact === null ? undefined : FACTS[claimFact];
    const base: RawFact = {
      ref: `ans.${t.id}`, step: step === 'COMPANY' || claim !== null ? step : null, claim_id: claim?.id ?? null,
      label: def?.label ?? t.question, value: known ? (t.answer ?? '') : 'I don’t know', chip: 'You told us',
      arrived: t.answered_at, known, ...(known ? {} : { why_unknown: 'The client does not know. Find it out another way before this is checked.' }),
    };
    if (claimFact !== null && def !== undefined && claim !== null) {
      const choices = def.choices === undefined ? [] : Object.entries(def.choices).map(([value, label]) => ({ value, label }));
      const said = (t.answer ?? '').trim();
      const prefill = def.kind === 'choice'
        ? (choices.find((c) => c.value.toLowerCase() === said.toLowerCase() || c.label.toLowerCase() === said.toLowerCase())?.value ?? '')
        : said;
      out.push({ ...base, as_fact: { key: claimFact, kind: def.kind, choices, prefill } });
    } else {
      out.push(base);
    }
  }
  return out;
}

/** The claim's recorded tax facts, latest per fact. A fact recorded "not known" is shown and cannot be ticked. */
function claimFactFacts(db: Db, claim: ClaimRow): RawFact[] {
  const f = latestFacts(db, claim.id);
  const out: RawFact[] = [];
  for (const [key, row] of f) {
    const r: FactReading = captured(f, key);
    out.push({
      ref: `cf.${row.id}`, step: 'TAX', claim_id: claim.id, label: r.label, value: r.display,
      chip: CAPTURE_CHIPS[row.source_id] ?? 'Cap Rebate', arrived: row.recorded_at, known: r.known,
      ...(r.known ? {} : { why_unknown: 'Recorded as not known. Find it out before this is checked.' }),
    });
  }
  return out;
}

/** The survey, the tax adviser and the report: each is one fact, and it is the record itself. No figure is carried. */
function milestoneFacts(db: Db, claim: ClaimRow): RawFact[] {
  const out: RawFact[] = [];
  for (const j of db.all<{ id: string; surveyor_id: string | null; created_at: string; committed_at: string | null; commitment: string | null }>(
    'SELECT j.id, j.surveyor_id, j.created_at, sc.committed_at, sc.id AS commitment FROM surveyor_jobs j ' +
      'LEFT JOIN surveyor_commitments sc ON sc.job_id = j.id WHERE j.claim_id = ? ORDER BY j.created_at ASC',
    [claim.id])) {
    if (j.surveyor_id !== null) {
      out.push({ ref: `job.${j.id}`, step: 'SURVEY_BOOKED', claim_id: claim.id, label: 'A surveyor has the job',
        value: 'Assigned to our surveyor', chip: 'Surveyor', arrived: j.created_at, known: true });
    }
    if (j.commitment !== null) {
      out.push({ ref: `survey.${j.commitment}`, step: 'SURVEY_DONE', claim_id: claim.id, label: 'The surveyor sent their figures',
        value: 'Sent — see Figures on the claim', chip: 'Surveyor', arrived: j.committed_at, known: true });
    }
  }
  for (const s of db.all<{ id: string; signed_on: string; recorded_at: string }>(
    'SELECT id, signed_on, recorded_at FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at ASC', [claim.id])) {
    out.push({ ref: `signoff.${s.id}`, step: 'TAX_ADVISER', claim_id: claim.id, label: 'The tax adviser signed the figures off',
      value: `Signed on ${s.signed_on}`, chip: 'Tax adviser', arrived: s.recorded_at, known: true });
  }
  for (const r of db.all<{ id: string; version: number; issued_on: string | null; updated_at: string }>(
    "SELECT id, version, issued_on, updated_at FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' AND state = 'ISSUED' " +
      'ORDER BY version ASC', [claim.id])) {
    out.push({ ref: `report.${r.id}`, step: 'REPORT', claim_id: claim.id, label: 'The client report was issued',
      value: `Version ${r.version}${r.issued_on === null ? '' : `, issued ${r.issued_on}`}`, chip: 'Cap Rebate', arrived: r.updated_at, known: true });
  }
  return out;
}

function withTicks(raw: readonly RawFact[], approvals: ReadonlyMap<string, ApprovalRow>): CheckFact[] {
  return raw.map(({ known, why_unknown, ...f }) => {
    const a = approvals.get(f.ref);
    return {
      ...f,
      approved: a !== undefined && a.action === 'APPROVED' ? { by: a.who ?? 'a former user', at: a.at } : null,
      untick: a !== undefined && a.action === 'UNAPPROVED' ? { by: a.who ?? 'a former user', at: a.at, reason: a.reason ?? '' } : null,
      approvable: known,
      why_not: known ? null : (why_unknown ?? 'Not known yet.'),
    };
  });
}

function stepView(
  actor: Actor, business_id: string, key: StepKey, claim_id: string | null, facts: readonly CheckFact[], missing: number,
  events: ReadonlyMap<string, { last: StepEventRow; told: StepEventRow | null }>,
): StepView {
  const def = stepDef(key) as StepDef;
  const complete = facts.length > 0 && missing === 0 && facts.every((f) => f.approved !== null);
  const ev = events.get(`${claim_id ?? ''}:${key}`);
  const told = ev?.last.action === 'TOLD' ? ev.last : null;
  const back = ev?.last.action === 'TAKEN_BACK' ? ev.last : null;
  const state: StepState = told !== null ? 'TOLD' : back !== null && !complete ? 'RECHECKING'
    : complete ? 'READY_TO_TELL' : facts.length === 0 ? (back !== null ? 'RECHECKING' : 'NOTHING_YET') : back !== null ? 'RECHECKING' : 'CHECKING';
  const obj = stepsObj(business_id);
  return {
    key, label: def.label, claim_id, facts, missing, complete, state,
    told: told === null ? null : { at: told.at, by: told.who ?? 'a former user' },
    taken_back: back === null ? null : { at: back.at, by: back.who ?? 'a former user', reason: back.reason ?? '' },
    may_tell: complete && told === null && can(actor, 'client_step.tell', obj),
    may_take_back: told !== null && can(actor, 'client_step.take_back', obj),
  };
}

/**
 * THE PANEL, FOR THE PEOPLE WHO CHECK — ADMIN AND SALES (`fact.approve`). A login refused it reads nothing, and the
 * pages do not draw the section at all. Asked of the company object on this request.
 */
export function checksPanel(db: Db, actor: Actor, business_id: string, todayIso: string): ChecksPanel {
  const b = db.get<{ id: string; name: string }>('SELECT id, name FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'fact.approve', stepsObj(b.id));
  const claims = claimsOf(db, b.id);
  const missing = missingFacts(db, actor, b.id);
  const approvals = approvalsFor(db, b.id);
  const events = stepEventsFor(db, b.id);

  const rawAll: RawFact[] = [...registerFacts(db, b.id, claims), ...answerFacts(db, b.id, claims)];
  for (const c of claims) rawAll.push(...claimFactFacts(db, c), ...milestoneFacts(db, c));
  // A claim fact's answer, once ticked, is the recorded fact from then on — listed once, as the fact.
  const all = withTicks(rawAll, approvals).filter((f) => !(f.as_fact !== undefined && f.approved !== null));

  const missingCompany = missing.filter((m) => m.section === 'company').length;
  const missingProperty = missing.filter((m) => m.section === 'property').length;
  const company = stepView(actor, b.id, 'COMPANY', null, all.filter((f) => f.step === 'COMPANY'), missingCompany, events);

  return {
    business_id: b.id,
    company,
    claims: claims.map((c) => {
      const fp = factsPanel(db, actor, c.id, todayIso);
      const askable: FactReading[] = [fp.claimant_type, fp.acquisition_date, fp.accounting_period.start, fp.accounting_period.end,
        fp.taxable_profit.sufficient_profit, fp.allowance_headroom.position, fp.election.exists, fp.grants.exist,
        fp.acquisition_costs.costs, fp.buyer_alterations.made];
      const need: Partial<Record<StepKey, number>> = {
        // A property fact still missing for the company holds every claim's property step: it is not known which it is about.
        PROPERTY: missingProperty,
        TAX: askable.filter((r) => !r.known).length,
      };
      return {
        id: c.id, name: claimName(b.name, c.label), ref: c.claim_ref,
        steps: CLAIM_STEPS.map((k) => stepView(actor, b.id, k, c.id, all.filter((f) => f.claim_id === c.id && f.step === k), need[k] ?? 0, events)),
      };
    }),
    unmatched: all.filter((f) => f.step === null),
    may_approve: true,
  };
}

/** The same panel, or null for a login that does not check facts. For the pages, which draw nothing for null. */
export function checksPanelIfPermitted(db: Db, actor: Actor, business_id: string, todayIso: string): ChecksPanel | null {
  return can(actor, 'fact.approve', stepsObj(business_id)) ? checksPanel(db, actor, business_id, todayIso) : null;
}

function allFacts(p: ChecksPanel): CheckFact[] {
  return [...p.company.facts, ...p.claims.flatMap((c) => c.steps.flatMap((s) => s.facts)), ...p.unmatched];
}

/* ================================================================== *
 * 4 · THE FOUR ACTIONS
 * ================================================================== */

function reasonText(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t.slice(0, 2000);
}

/**
 * TICK A FACT AS CHECKED. The fact is looked up in the panel built on this request — a ref that is not one of this
 * company's facts is refused, whatever the form said. A fact that is not known cannot be ticked. A claim fact the
 * client answered is RECORDED as the claim's fact by the tick, through `recordFact` and its own checks, with the
 * value staff confirmed; the new fact is ticked in the same transaction.
 */
export function approveFact(
  d: ApprovalDeps, actor: Actor, business_id: string, input: { ref: string; value?: string | null },
): Result {
  const p = checksPanel(d.db, actor, business_id, d.now().slice(0, 10));
  const f = allFacts(p).find((x) => x.ref === input.ref);
  if (f === undefined) return { ok: false, why: 'That is not one of this company’s facts. Open the page again and try once more.' };
  if (f.approved !== null) return { ok: false, why: 'That is already checked and approved.' };
  if (!f.approvable) return { ok: false, why: f.why_not ?? 'There is nothing to check yet.' };
  const at = d.now();
  try {
    return d.db.tx((): Result => {
    const tick = (ref: string): void => {
      d.db.run('INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, NULL, ?, ?)',
        [d.newId(), business_id, ref, 'APPROVED', actor.id, at]);
      d.audit.append({
        at, kind: 'FACT_APPROVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'business', object_id: business_id, detail: { fact: ref, step: f.step ?? '(none)', claim: f.claim_id ?? '(none)' },
      });
    };
    if (f.as_fact !== undefined && f.claim_id !== null) {
      const value = (input.value ?? '').trim();
      const r = recordFact(d, actor, f.claim_id, {
        fact_key: f.as_fact.key, source_id: 'CLIENT_ANSWER', answer: 'VALUE', value,
        note: `From the client’s answer in their portal (${(f.arrived ?? at).slice(0, 10)}), checked by staff.`,
      });
      if (!r.ok) throw new Refused(r.why);
      tick(f.ref);
      tick(`cf.${r.id}`);
      return { ok: true };
    }
    tick(f.ref);
    return { ok: true };
    });
  } catch (e) {
    // The fact was refused by its own checks: nothing was written, the tick included.
    if (e instanceof Refused) return { ok: false, why: e.message, field: 'value' };
    throw e;
  }
}

class Refused extends Error {}

/** TAKE A TICK OFF, WITH A REASON. The reason is ours; it is never shown to the client. */
export function unapproveFact(
  d: ApprovalDeps, actor: Actor, business_id: string, input: { ref: string; reason?: string | null },
): Result {
  const p = checksPanel(d.db, actor, business_id, d.now().slice(0, 10));
  const f = allFacts(p).find((x) => x.ref === input.ref);
  if (f === undefined || f.approved === null) return { ok: false, why: 'That fact is not ticked, so there is nothing to take off.' };
  const reason = reasonText(input.reason);
  if (reason === null) return { ok: false, field: 'reason', why: 'Say why you are taking the tick off.' };
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, f.ref, 'UNAPPROVED', reason, actor.id, at]);
    d.audit.append({
      at, kind: 'FACT_UNAPPROVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'business', object_id: business_id, detail: { fact: f.ref, step: f.step ?? '(none)', claim: f.claim_id ?? '(none)' },
    });
  });
  return { ok: true };
}

function findStep(p: ChecksPanel, step: string, claim_id: string | null): StepView | undefined {
  if (step === 'COMPANY') return claim_id === null ? p.company : undefined;
  return p.claims.find((c) => c.id === claim_id)?.steps.find((s) => s.key === step);
}

/** "TELL THE CLIENT". Only on a complete step not already told, and only when someone presses it. */
export function tellClient(
  d: ApprovalDeps, actor: Actor, business_id: string, input: { step: string; claim_id?: string | null },
): Result {
  authorise(actor, 'client_step.tell', stepsObj(business_id));
  const p = checksPanel(d.db, actor, business_id, d.now().slice(0, 10));
  const claim_id = input.claim_id ?? null;
  const s = findStep(p, input.step, claim_id);
  if (s === undefined) return { ok: false, why: 'That is not one of this company’s steps.' };
  if (s.state === 'TOLD') return { ok: false, why: 'The client has already been told.' };
  if (!s.complete) {
    return { ok: false, why: s.facts.length === 0 ? 'There is nothing in this step to check yet.'
      : s.missing > 0 ? `${s.missing} fact${s.missing === 1 ? ' is' : 's are'} still missing. Get ${s.missing === 1 ? 'it' : 'them'} first.`
        : 'Tick every fact in this step first.' };
  }
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)',
      [d.newId(), business_id, claim_id, s.key, 'TOLD', actor.id, at]);
    d.audit.append({
      at, kind: 'CLIENT_STEP_TOLD', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'business', object_id: business_id, detail: { step: s.key, claim: claim_id ?? '(none)' },
    });
  });
  return { ok: true };
}

/** TAKE A STEP BACK — ADMIN ONLY, WITH A REASON. The portal then says "being re-checked", never the reason. */
export function takeStepBack(
  d: ApprovalDeps, actor: Actor, business_id: string, input: { step: string; claim_id?: string | null; reason?: string | null },
): Result {
  authorise(actor, 'client_step.take_back', stepsObj(business_id));
  const p = checksPanel(d.db, actor, business_id, d.now().slice(0, 10));
  const claim_id = input.claim_id ?? null;
  const s = findStep(p, input.step, claim_id);
  if (s === undefined) return { ok: false, why: 'That is not one of this company’s steps.' };
  if (s.state !== 'TOLD') return { ok: false, why: 'The client has not been told this step, so there is nothing to take back.' };
  const reason = reasonText(input.reason);
  if (reason === null) return { ok: false, field: 'reason', why: 'Say why you are taking this step back.' };
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), business_id, claim_id, s.key, 'TAKEN_BACK', reason, actor.id, at]);
    d.audit.append({
      at, kind: 'CLIENT_STEP_TAKEN_BACK', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'business', object_id: business_id, detail: { step: s.key, claim: claim_id ?? '(none)' },
    });
  });
  return { ok: true };
}

/* ================================================================== *
 * 5 · WHAT THE CLIENT READS
 * ================================================================== */

export type ClientStep = {
  readonly claim_id: string | null;
  readonly key: StepKey;
  readonly state: 'DONE' | 'RECHECKING';
  readonly words: string;
  /** YYYY-MM-DD — the day it was told, or the day it was taken back. */
  readonly on: string;
};

/**
 * THE CLIENT'S VIEW. Read from `client_step_notices` alone — a step's key, its claim and a date. A step never told is
 * not listed. A step told and then taken back says "being re-checked" rather than vanishing. The reason, the name of
 * whoever pressed the button and every fact behind the step stay here: this function never reads them.
 */
export function clientSteps(db: Db, actor: Actor, business_id: string): ClientStep[] {
  authorise(actor, 'client_step.read', stepsObj(business_id));
  const last = new Map<string, { claim_id: string | null; step: string; action: string; at: string }>();
  for (const r of db.all<{ claim_id: string | null; step: string; action: string; at: string }>(
    'SELECT claim_id, step, action, at FROM client_step_notices WHERE business_id = ? ORDER BY at ASC, rowid ASC', [business_id])) {
    last.set(`${r.claim_id ?? ''}:${r.step}`, r);
  }
  const order = (k: string): number => STEPS.findIndex((s) => s.key === k);
  return [...last.values()]
    .map((r) => {
      const def = stepDef(r.step) as StepDef;
      const done = r.action === 'TOLD';
      return { claim_id: r.claim_id, key: def.key, state: done ? 'DONE' as const : 'RECHECKING' as const,
        words: done ? def.told : def.rechecking, on: r.at.slice(0, 10) };
    })
    .sort((a, b) => order(a.key) - order(b.key));
}
