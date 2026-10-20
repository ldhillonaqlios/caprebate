/**
 * LEADS — NOT A SECOND INTAKE. CRM 2 of 10, 10 September 2026.
 *
 * A filled assessment, a funnel-close booking, a gated exit and a referral are
 * already leads. This file ties them together: what made each one a lead, where
 * it came from, who owns it, what happens next, and — once the enquiry gate is
 * passed — its conversion into a claim WITHOUT RE-KEYING anything the assessment
 * captured. The schema is migration 010; the routes are src/web/pipeline-pages.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONVERTING A LEAD NOW OPENS THE CLAIM (disposition Part E, row E3)
 *
 * CRM 1 of 10 opened a claim inside the funnel's `submit()`. That put every
 * prospect straight into the procedure's second stage with the ENQUIRY GATE
 * never asked — a skipped gate, on every claim, by construction. So `submit()`
 * now opens a LEAD, and the claim is opened here, when a person has recorded the
 * enquiry checks and the lead is QUALIFIED. The claim_ref series is unchanged:
 * the reference is simply taken at conversion instead of at submission.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO LEAD SCORE (disposition rows 7.8 and 25.10, REJECTED)
 *
 * A score built on the estimate routes unknowns into a number that ranks leads —
 * N4 — and automated scoring is the CRM documents' own Phase 2. A lead has a
 * PRIORITY a person sets, and nothing that is computed from the estimate.
 *
 * A LEAD CARRIES NO PERSON. The client's own contact is a `contacts` row on the
 * organisation, where the funnel close already writes it (N2) — or, for a call
 * asked for at the reasoned negative, a `contacts` row that BELONGS TO THE LEAD
 * until the lead has an organisation, and moves to it on conversion (migration
 * 011, disposition row E22). Still one table a person lives in; never a column here.
 */

import { dateWords, KIND_WORDS, type EventKind } from './property-events.ts';
import type { Db } from '../db.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal, answerLabel, contactFor, contactForLead } from './backoffice.ts';
import { FUNNEL } from './engine.ts';
import { formatShownRange } from './shown-range.ts';
import { localStamp } from './localtime.ts';
import {
  PRIORITIES, SOURCES, insertClaim, ownerChoices, type CrmDeps, type Fields, type WriteResult,
} from './crm.ts';
import {
  CHECK_ANSWERS, ENQUIRY_CHECKS, enquiryEvidence, enquiryGate, raiseBusinessStage, reasonLabel, reasonList,
  recordOpened, type CheckKey, type EnquiryReading,
} from './pipeline.ts';
import { fireAutomation } from './automation.ts';
import { createTask, insertTask, setNextAction, setTaskStatus } from './tasks.ts';
import { mayTake, vocabLabel } from './vocabularies.ts';
import {
  PROSPECT_EVENTS, REFERRAL_SOURCES, introducerChoices, introducerExists, leadReferral, onLeadConverted, type LeadReferral,
} from './introducers.ts';

type Vocab = Readonly<Record<string, string>>;

export const LEAD_STATUSES: Vocab = Object.freeze({
  NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', NURTURE: 'Nurture', CONVERTED: 'Converted', LOST: 'Lost',
});

/** What made it a lead — the thing that already existed. */
export const LEAD_ORIGINS: Vocab = Object.freeze({
  ASSESSMENT: 'A filled assessment',
  BOOKING: 'A call asked for at the end of the assessment',
  GATED_EXIT: 'A call asked for after the assessment said no',
  REFERRAL: 'A referral',
  STAFF: 'Recorded by staff',
});

export const SECTORS: Vocab = Object.freeze({
  care_homes: 'Care homes', dental: 'Dental', supported_living: 'Supported living', gp: 'GP', private_hospital: 'Private hospital',
});

/** The statuses a person sets by hand. CONVERTED is not one: converting opens the claim. */
const SETTABLE = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURE', 'LOST'] as const;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

/** PHASE 133d (D4): `field` is the posted name a refusal is about, where it is about one. */
type Check<T> = { ok: true; value: T } | { ok: false; why: string; field?: string };

function textField(v: string | null | undefined, max: number, what: string): Check<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function dateField(v: string | null | undefined, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))) {
    return { ok: false, why: `${what} must be a date, like 2026-03-31.` };
  }
  return { ok: true, value: t };
}

function take<T>(input: Fields, key: string, stored: T, check: (v: string | null) => Check<T>): Check<T> {
  if (!Object.hasOwn(input, key)) return { ok: true, value: stored };
  // PHASE 133d (D4): a refusal names the field it is about, so the form can draw it beside that field.
  const r = check(input[key] ?? null);
  return r.ok ? r : { ...r, field: r.field ?? key };
}

/* ================================================================== *
 * 1 · THE LEAD ROW, AND ITS OBJECT
 * ================================================================== */

type LeadDbRow = {
  id: string; business_id: string | null; assessment_id: string | null; booking_id: string | null; claim_id: string | null;
  origin: string; source: string; introducer_id: string | null; prospect_organisation: string | null;
  prospect_sector: string | null; lead_date: string; owner_id: string | null; priority: string | null;
  next_action: string | null; next_action_due: string | null; status: string; lost_reason: string | null;
  lost_note: string | null; converted_at: string | null; created_at: string; updated_at: string;
  business_name: string | null; business_sector: string | null; owner_name: string | null; claim_ref: string | null;
  prospect_postcode: string | null; prospect_event: string | null; prospect_event_year: number | null;
};

const LEAD_SELECT =
  'SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, ' +
  'l.prospect_postcode, l.prospect_event, l.prospect_event_year, ' +
  'l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, ' +
  // CRM 9 of 10: a lead's next action is its earliest open task — migration 018 retired the free text.
  "(SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, ' +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, ' +
  'l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, ' +
  'b.sector AS business_sector, u.display_name AS owner_name, c.claim_ref AS claim_ref ' +
  'FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id ' +
  'LEFT JOIN claims c ON c.id = l.claim_id ';

const SECTION = '__lead_section__';

export function assertLeadSection(actor: Actor): void {
  authorise(actor, 'lead.read', { type: 'lead', id: SECTION, business_id: null });
}

function leadObj(r: { id: string; business_id: string | null }): Extract<Obj, { type: 'lead' }> {
  return { type: 'lead', id: r.id, business_id: r.business_id };
}

function loadLead(db: Db, id: string): LeadDbRow {
  const r = db.get<LeadDbRow>(`${LEAD_SELECT}WHERE l.id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/**
 * THE RANGE THE CLIENT WAS SHOWN, ONLY WHERE `estimate.read` SAYS YES — built
 * forwards, as every value in this build is, and never for SURVEYING (N1).
 */
function shownRangeFor(db: Db, actor: Actor, r: { business_id: string | null; assessment_id: string | null }): string | undefined {
  if (r.business_id === null || r.assessment_id === null) return undefined;
  if (!can(actor, 'estimate.read', { type: 'estimate', id: r.assessment_id, business_id: r.business_id })) return undefined;
  const a = db.get<{ low: number | null; high: number | null }>(
    'SELECT shown_low_pence AS low, shown_high_pence AS high FROM assessments WHERE id = ?', [r.assessment_id]);
  return a === undefined ? undefined : formatShownRange({ low_pence: a.low, high_pence: a.high });
}

/* ================================================================== *
 * 2 · THE LIST
 * ================================================================== */

export type LeadRow = {
  readonly id: string;
  readonly organisation: string;
  readonly organisation_recorded: boolean;
  readonly source: string;
  readonly origin: string;
  readonly lead_date: string;
  readonly owner: string | null;
  readonly status: { readonly key: string; readonly label: string };
  readonly next_action: string | null;
  readonly next_action_due: string | null;
  readonly claim: { readonly id: string; readonly claim_ref: string } | null;
  readonly shown_range?: string;
  /**
   * THE CRM FOLLOW-ON: why there is no range, where there is none — a lead with no assessment has no range to show, which is
   * not the same thing as a range this role may not read, and the list said the second for both.
   */
  readonly range_note?: string;
};

export const NO_RANGE_NO_ASSESSMENT = 'no range — no assessment was filled in for this lead';
export const RANGE_NOT_SHOWN = 'not shown to this role';

export function leadList(db: Db, actor: Actor, limit = 200): LeadRow[] {
  assertLeadSection(actor);
  return db.all<LeadDbRow>(`${LEAD_SELECT}ORDER BY l.lead_date DESC, l.id ASC LIMIT ?`, [limit])
    .filter((r) => can(actor, 'lead.read', leadObj(r)))
    .map((r) => {
      const range = shownRangeFor(db, actor, r);
      return {
        id: r.id,
        organisation: r.business_name ?? r.prospect_organisation ?? 'no organisation recorded',
        organisation_recorded: r.business_id !== null,
        source: vocabLabel(db, 'LEAD_SOURCE', r.source, r.source),
        origin: words(LEAD_ORIGINS, r.origin, r.origin),
        lead_date: localStamp(r.lead_date),
        owner: r.owner_name,
        status: { key: r.status, label: words(LEAD_STATUSES, r.status, r.status) },
        next_action: r.next_action, next_action_due: r.next_action_due,
        claim: r.claim_id === null || r.claim_ref === null ? null : { id: r.claim_id, claim_ref: r.claim_ref },
        ...(range === undefined
          ? { range_note: r.business_id === null || r.assessment_id === null ? NO_RANGE_NO_ASSESSMENT : RANGE_NOT_SHOWN }
          : { shown_range: range }),
      };
    });
}

/* ================================================================== *
 * 3 · ONE LEAD
 * ================================================================== */

export type LeadView = {
  readonly id: string;
  readonly organisation: { readonly id: string | null; readonly name: string; readonly linkable: boolean };
  readonly sector: string;
  readonly origin: { readonly key: string; readonly label: string };
  readonly source: { readonly key: string; readonly label: string };
  /**
   * CRM 5 of 10: the firm that referred it, the client's answer on sharing progress
   * with that firm and every notice that fell due — or null, for a lead no firm referred.
   */
  readonly introducer: LeadReferral | null;
  /** The property basics a referral brought — only on a lead with no organisation yet, and only what was given (N4). */
  readonly property_basics?: { readonly postcode: string | null; readonly event: string | null; readonly year: number | null };
  readonly lead_date: string;
  readonly owner: { readonly id: string; readonly name: string } | null;
  readonly priority: { readonly key: string | null; readonly label: string };
  readonly next_action: string | null;
  readonly next_action_due: string | null;
  readonly status: { readonly key: string; readonly label: string };
  readonly lost: { readonly reason: string | null; readonly note: string | null } | null;
  readonly converted: { readonly at: string; readonly claim_id: string; readonly claim_ref: string } | null;
  /**
   * 30 Sep 2026: the other leads the same assessment made — buildings owned by different businesses, one organisation
   * and one lead each (migration 061, `enquiry_id`). Empty for a lead that is the only one of its enquiry.
   */
  readonly same_enquiry: readonly { readonly lead_id: string; readonly name: string }[];
  readonly contact_channel: string | null;
  /**
   * WHO ASKED — only for a lead with no organisation yet, whose contact belongs to
   * the lead (migration 011, row E22), and only where `contact.read` says yes.
   * Every other lead's person is a contact on its organisation's page and is not
   * repeated here: one place a person lives.
   */
  readonly person?: { readonly name: string; readonly role: string | null; readonly reach: string | null };
  /** 7.5 — the client's own spend answers, with the question, never parsed into a value. */
  readonly initial_property_value: readonly { readonly question: string; readonly answer: string }[];
  /** PHASE 159c: each building's events from the assessment — the purchase, then each piece of work — in order. Read under
   *  the same rule as the answers. */
  readonly events: readonly { readonly property: string; readonly what: string; readonly when: string; readonly cost: string }[];
  /** 7.6 — the range they were shown and the sealed estimate, for `estimate.read` alone. */
  readonly opportunity_value?: {
    readonly shown_range: string;
    readonly estimate: Readonly<Record<string, number>> | null;
  };
  readonly enquiry: EnquiryReading & { readonly evidence: Readonly<Record<CheckKey, readonly string[]>> };
  readonly may_write: boolean;
  readonly may_convert: boolean;
  readonly edit?: {
    readonly owners: readonly { readonly id: string; readonly name: string }[];
    readonly lost_reasons: readonly { readonly code: string; readonly label: string }[];
    readonly properties: readonly { readonly id: string; readonly label: string }[];
    readonly organisations: readonly { readonly id: string; readonly name: string }[];
    /** CRM 5 of 10: the firms a lead may be attributed to. */
    readonly introducers: readonly { readonly id: string; readonly name: string }[];
    readonly check_answers: Vocab;
    readonly checks: Vocab;
  };
};

export function leadView(db: Db, actor: Actor, id: string): LeadView {
  assertLeadSection(actor);
  const r = loadLead(db, id);
  authorise(actor, 'lead.read', leadObj(r));

  const answers = r.assessment_id === null || r.business_id === null
    || !can(actor, 'answer.read', { type: 'answer', id: r.assessment_id, business_id: r.business_id })
    ? []
    : db.all<{ question_id: string; question_text: string; state: string; value: string | null }>(
      'SELECT question_id, question_text, state, value FROM assessment_answers WHERE assessment_id = ? ORDER BY ord ASC',
      [r.assessment_id]);
  const spend = answers.filter((a) => /^Q2-\d+-spend$/.test(a.question_id) || /^Q3-\d+-works-spend$/.test(a.question_id) || /^Q3-\d+-w\d+-spend$/.test(a.question_id))   // PHASE 159c: each piece of work
    .map((a) => ({ question: a.question_text, answer: answerLabel(a.state, a.value) }));

  const range = shownRangeFor(db, actor, r);
  const estimate = range === undefined || r.assessment_id === null ? null
    : db.get<Record<string, number>>(
      'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
        'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates WHERE assessment_id = ?',
      [r.assessment_id]) ?? null;

  const mayWrite = can(actor, 'lead.write', leadObj(r)) && r.status !== 'CONVERTED';
  const mayConvert = can(actor, 'lead.convert', leadObj(r)) && r.status === 'QUALIFIED';
  const contact = r.business_id === null ? contactForLead(db, r.id) : contactFor(db, r.business_id);
  /* WHO ASKED, for a lead with no organisation: its contact belongs to the lead
     (migration 011, row E22). A lead on an organisation shows no person here —
     its contacts are on the organisation's page, one place a person lives. */
  const who = r.business_id === null
    ? db.get<{ id: string; full_name: string; job_role: string | null; job_role_other: string | null; email: string | null; phone: string | null }>(
      'SELECT id, full_name, job_role, job_role_other, email, phone FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
      [r.id])
    : undefined;
  const person = who === undefined || !can(actor, 'contact.read', { type: 'contact', id: who.id, business_id: null })
    ? undefined
    : {
      name: who.full_name,
      role: (FUNNEL.ROLES as readonly (readonly [string, string])[]).find(([v]) => v === who.job_role)?.[1]
        ?? who.job_role_other ?? who.job_role,
      reach: who.phone ?? who.email,
    };

  const enquiry = db.get<{ enquiry_id: string | null }>('SELECT enquiry_id FROM leads WHERE id = ?', [r.id])?.enquiry_id ?? null;
  const same_enquiry = enquiry === null ? [] : db.all<{ lead_id: string; name: string }>(
    'SELECT l.id AS lead_id, COALESCE(b.name, l.prospect_organisation) AS name FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
      'WHERE l.enquiry_id = ? AND l.id <> ? ORDER BY l.created_at, l.id', [enquiry, r.id]);
  return {
    same_enquiry,
    id: r.id,
    organisation: {
      id: r.business_id,
      name: r.business_name ?? r.prospect_organisation ?? 'no organisation recorded',
      linkable: r.business_id !== null && can(actor, 'organisation.read', { type: 'business', id: r.business_id }),
    },
    sector: words(SECTORS, r.business_sector ?? r.prospect_sector, 'not recorded'),
    origin: { key: r.origin, label: words(LEAD_ORIGINS, r.origin, r.origin) },
    source: { key: r.source, label: vocabLabel(db, 'LEAD_SOURCE', r.source, r.source) },
    introducer: leadReferral(db, actor, { id: r.id, business_id: r.business_id, introducer_id: r.introducer_id }),
    ...(r.business_id !== null || (r.prospect_postcode === null && r.prospect_event === null && r.prospect_event_year === null) ? {} : {
      property_basics: {
        postcode: r.prospect_postcode,
        event: r.prospect_event === null ? null : words(PROSPECT_EVENTS, r.prospect_event, r.prospect_event),
        year: r.prospect_event_year,
      },
    }),
    lead_date: localStamp(r.lead_date),
    owner: r.owner_id === null ? null : { id: r.owner_id, name: r.owner_name ?? 'a former user' },
    priority: { key: r.priority, label: vocabLabel(db, 'PRIORITY', r.priority, 'not set') },
    next_action: r.next_action, next_action_due: r.next_action_due,
    status: { key: r.status, label: words(LEAD_STATUSES, r.status, r.status) },
    lost: r.lost_reason === null ? null : { reason: reasonLabel(db, 'LEAD_LOST', r.lost_reason), note: r.lost_note },
    converted: r.converted_at === null || r.claim_id === null
      ? null : { at: localStamp(r.converted_at), claim_id: r.claim_id, claim_ref: r.claim_ref ?? r.claim_id },
    // A lead on an organisation reads as it always has. A lead with no organisation
    // and no booking — a referral — shows nothing rather than a sentence about nobody.
    contact_channel: r.business_id !== null || contact.channel !== null ? contact.label : null,
    ...(person === undefined ? {} : { person }),
    initial_property_value: spend,
    events: answers.length === 0 || r.assessment_id === null ? [] : db.all<{ label: string; kind: EventKind; event_date: string | null; cost_pence: number | null }>(
      'SELECT p.label, e.kind, e.event_date, e.cost_pence FROM property_events e JOIN properties p ON p.id = e.property_id ' +
        'WHERE e.assessment_id = ? ORDER BY p.created_at ASC, p.id ASC, e.ord ASC', [r.assessment_id])
      .map((e) => ({ property: e.label, what: KIND_WORDS[e.kind], when: dateWords(e.event_date), cost: e.cost_pence === null ? 'cost not known' : `£${(e.cost_pence / 100).toLocaleString('en-GB')}` })),
    ...(range === undefined ? {} : { opportunity_value: { shown_range: range, estimate } }),
    enquiry: { ...enquiryGate(db, { lead_id: r.id }), evidence: enquiryEvidence(db, actor, r.business_id, r.prospect_sector) },
    may_write: mayWrite,
    may_convert: mayConvert,
    ...(mayWrite || mayConvert ? {
      edit: {
        owners: ownerChoices(db),
        lost_reasons: reasonList(db, 'LEAD_LOST'),
        properties: r.business_id === null ? [] : db.all<{ id: string; label: string }>(
          'SELECT id, label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [r.business_id]),
        organisations: r.business_id !== null ? [] : db.all<{ id: string; name: string }>(
          'SELECT id, name FROM businesses ORDER BY name ASC LIMIT 500')
          .filter((b) => can(actor, 'organisation.read', { type: 'business', id: b.id })),
        introducers: introducerChoices(db, actor),
        check_answers: CHECK_ANSWERS,
        checks: ENQUIRY_CHECKS,
      },
    } : {}),
  };
}

/* ================================================================== *
 * 4 · WRITES
 * ================================================================== */

function audit(d: CrmDeps, actor: Actor, kind: 'LEAD_CREATED' | 'LEAD_UPDATED' | 'LEAD_CONVERTED', id: string, detail: Record<string, unknown>): void {
  d.audit.append({
    at: d.now(), kind, outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'lead', object_id: id, detail,
  });
}

/**
 * RECORD A LEAD BY HAND — a referral, an event, an outbound call, or a second
 * property for an existing client. On an organisation that exists, or as the
 * NAME AND SECTOR of one that does not yet. Never a person.
 */
export function createLead(d: CrmDeps, actor: Actor, input: Fields): WriteResult {
  const business_id = textField(input['business_id'], 64, 'The organisation');
  if (!business_id.ok) return business_id;
  authorise(actor, 'lead.write', { type: 'lead', id: SECTION, business_id: business_id.value });
  if (business_id.value !== null) {
    const b = d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [business_id.value]);
    if (b === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'organisation.read', { type: 'business', id: b.id });
  }
  const org = textField(input['prospect_organisation'], 300, 'The organisation’s name');
  const sector = textField(input['prospect_sector'], 40, 'The sector');
  const source = textField(input['source'], 40, 'The source');
  const due = dateField(input['next_action_due'], 'The due date');
  const next = textField(input['next_action'], 300, 'The next action');
  for (const [c, field] of [[org, 'prospect_organisation'], [sector, 'prospect_sector'], [source, 'source'], [due, 'next_action_due'], [next, 'next_action']] as const) {
    if (!c.ok) return { ...c, field };
  }
  if (!org.ok || !sector.ok || !source.ok || !due.ok || !next.ok) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (business_id.value === null && org.value === null) {
    return { ok: false, why: 'Name the organisation this lead is about, or choose one that is already recorded.', field: 'prospect_organisation' };
  }
  if (sector.value !== null && !has(SECTORS, sector.value)) return { ok: false, why: 'The sector is not one of the five we serve.', field: 'prospect_sector' };
  if (source.value === null || !mayTake(d.db, 'LEAD_SOURCE', source.value)) return { ok: false, why: 'Choose where the lead came from.', field: 'source' };

  const id = d.newId();
  const at = d.now();
  const origin = ['REFERRAL', 'ACCOUNTANT', 'ADVISER'].includes(source.value) ? 'REFERRAL' : 'STAFF';
  // CRM 9 of 10: THE NEXT ACTION TYPED AT INTAKE IS A TASK ON THE LEAD, owned by the person recording it, written in the
  // same transaction as the lead so neither is ever recorded without the other — never a column (migration 018).
  const taskId = d.db.tx(() => {
  d.db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
      'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
      'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      'VALUES (?, ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, ?, ?)',
    [id, business_id.value, origin, source.value, business_id.value === null ? org.value : null,
      business_id.value === null ? sector.value : null, at, actor.id, 'NEW', at, at],
  );
  return next.value === null ? null : insertTask(d.db, d.now, d.newId, {
    title: next.value, description: null, owner_id: actor.id, owner_role: null, due_on: due.value, priority: null, activity_type: 'TASK',
    business_id: business_id.value, property_id: null, claim_id: null, lead_id: id, contact_id: null, fact_id: null, recurrence: null,
    recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: actor.id,
  });
  });
  audit(d, actor, 'LEAD_CREATED', id, { business: business_id.value, source: source.value, origin, route: 'staff' });
  if (taskId !== null) {
    d.audit.append({
      at: d.now(), kind: 'STAFF_TASK_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'staff_task',
      object_id: taskId, detail: { task: taskId, business: business_id.value, claim: null, lead: id, activity: 'TASK', route: 'lead intake' },
    });
  }
  // CRM 3 of 10: lead created → an owner and a first follow-up (the seeded rule).
  fireAutomation(d, actor, { trigger: 'LEAD_CREATED', lead_id: id });
  return { ok: true, id };
}

/**
 * CHANGE A LEAD. Only the fields the form carried are touched.
 *
 * QUALIFIED IS THE ENQUIRY GATE, ASKED AGAIN AT THE WRITE: every check a recorded
 * YES, and UNKNOWN or silence refused. LOST carries a listed reason. CONVERTED
 * is never set here — converting opens the claim — and a converted lead is a
 * record, not a thing to edit: its work continues on the claim.
 */
export function updateLead(d: CrmDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const r = loadLead(d.db, id);
  authorise(actor, 'lead.write', leadObj(r));
  if (r.status === 'CONVERTED') {
    return { ok: false, why: 'This lead has converted. It is kept as the record of where the claim came from; work the claim.' };
  }
  const owners = ownerChoices(d.db);
  const owner = take(input, 'owner_id', r.owner_id, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : owners.some((p) => p.id === v) ? { ok: true, value: v } : { ok: false, why: 'The owner must be one of the people offered.' });
  const priority = take(input, 'priority', r.priority, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : mayTake(d.db, 'PRIORITY', v, r.priority) ? { ok: true, value: v } : { ok: false, why: 'The priority is not one of the choices offered.' });
  // CRM 9 of 10: the lead's next action is a task now, as the claim's is (migration 018, row E33).
  if (Object.hasOwn(input, 'next_action') || Object.hasOwn(input, 'next_action_due')) {
    return { ok: false, why: 'A lead’s next action is a task now — add one under Tasks on this lead, with an owner and a due date.' };
  }
  const source = take(input, 'source', r.source as string | null, (v): Check<string | null> =>
    typeof v === 'string' && mayTake(d.db, 'LEAD_SOURCE', v, r.source) ? { ok: true, value: v } : { ok: false, why: 'Choose where the lead came from.' });
  const status = take(input, 'status', r.status as string | null, (v): Check<string | null> =>
    typeof v === 'string' && (SETTABLE as readonly string[]).includes(v) ? { ok: true, value: v }
      : v === 'CONVERTED' ? { ok: false, why: 'To convert a lead, use Convert. It opens the claim and checks the enquiry again.' }
        : { ok: false, why: 'The status is not one of the choices offered.' });
  const lostReason = take(input, 'lost_reason', r.lost_reason, (v) => textField(v, 60, 'The lost reason'));
  const lostNote = take(input, 'lost_note', r.lost_note, (v) => textField(v, 2000, 'The note'));
  const org = take(input, 'prospect_organisation', r.prospect_organisation, (v) => textField(v, 300, 'The organisation’s name'));
  const sector = take(input, 'prospect_sector', r.prospect_sector, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : has(SECTORS, v) ? { ok: true, value: v } : { ok: false, why: 'The sector is not one of the five we serve.' });
  // CRM 5 of 10: the firm that referred it — one that exists, offered to a reader of introducers.
  const introducer = take(input, 'introducer_id', r.introducer_id, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : introducerExists(d.db, v) && introducerChoices(d.db, actor).some((x) => x.id === v) ? { ok: true, value: v }
        : { ok: false, why: 'The introducer must be one of the firms offered.' });
  for (const c of [owner, priority, source, status, lostReason, lostNote, org, sector, introducer]) if (!c.ok) return c;
  if (!owner.ok || !priority.ok || !source.ok || !status.ok || !lostReason.ok || !lostNote.ok
    || !org.ok || !sector.ok || !introducer.ok) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (source.value === null || status.value === null) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (introducer.value !== null && !REFERRAL_SOURCES.includes(source.value)) {
    return {
      ok: false,
      why: 'A lead a firm referred came from an accountant, an adviser or a referral. Change the source with it, or clear the introducer.',
    };
  }
  if (r.business_id === null && org.value === null) {
    return { ok: false, why: 'A lead with no organisation recorded keeps the organisation’s name.' };
  }

  if (status.value === 'QUALIFIED' && r.status !== 'QUALIFIED') {
    const gate = enquiryGate(d.db, { lead_id: r.id });
    if (!gate.open) {
      return {
        ok: false,
        why: `A lead is qualified when every enquiry check is a recorded yes: ${gate.checks.filter((c) => !c.passes)
          .map((c) => `${c.label} — ${c.reading}`).join('; ')}.`,
      };
    }
  }
  if (status.value === 'LOST') {
    const listed = lostReason.value === null ? undefined
      : reasonList(d.db, 'LEAD_LOST').find((x) => x.code === lostReason.value);
    if (listed === undefined) return { ok: false, why: 'A lost lead carries its reason: choose one from the list.' };
    if (listed.code === 'OTHER' && lostNote.value === null) return { ok: false, why: '“Another reason” needs the reason written in the note.' };
  }

  const before = {
    owner_id: r.owner_id, priority: r.priority,
    source: r.source, status: r.status, lost_reason: r.lost_reason, lost_note: r.lost_note,
    prospect_organisation: r.prospect_organisation, prospect_sector: r.prospect_sector,
    introducer_id: r.introducer_id,
  };
  const after = {
    owner_id: owner.value, priority: priority.value,
    source: source.value, status: status.value,
    lost_reason: status.value === 'LOST' ? lostReason.value : r.lost_reason,
    lost_note: status.value === 'LOST' ? lostNote.value : r.lost_note,
    prospect_organisation: r.business_id === null ? org.value : null,
    prospect_sector: r.business_id === null ? sector.value : null,
    introducer_id: introducer.value,
  };
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => before[k] !== after[k]);
  if (changed.length === 0) return { ok: true, id: r.id };
  d.db.run(
    'UPDATE leads SET owner_id = ?, priority = ?, source = ?, status = ?, ' +
      'lost_reason = ?, lost_note = ?, prospect_organisation = ?, prospect_sector = ?, introducer_id = ?, updated_at = ? WHERE id = ?',
    [after.owner_id, after.priority, after.source, after.status,
      after.lost_reason, after.lost_note, after.prospect_organisation, after.prospect_sector, after.introducer_id, d.now(), r.id],
  );
  audit(d, actor, 'LEAD_UPDATED', r.id, {
    business: r.business_id, fields: changed, ...(changed.includes('status') ? { status: after.status } : {}),
  });
  if (changed.includes('owner_id') && after.owner_id !== null) {
    fireAutomation(d, actor, { trigger: 'OWNER_CHANGED', lead_id: r.id });
  }
  return { ok: true, id: r.id };
}

/**
 * LOG A CALL ON A LEAD — PHASE 137, the leads page's "Log a call" button. A call is a task of the kind Call, owned by the
 * person who made it and completed as it is written, so it is on the lead's timeline like every other piece of work. A
 * call where somebody answered is what "contacted" means, so a NEW lead becomes CONTACTED with it — through updateLead,
 * the same write and the same audit line as choosing it by hand. A call nobody answered leaves the status alone.
 */
export function logLeadCall(d: CrmDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const r = loadLead(d.db, id);
  authorise(actor, 'lead.write', leadObj(r));
  if (r.status === 'CONVERTED') {
    return { ok: false, why: 'This lead is already a client. Log the call on their claim instead.' };
  }
  const spoke = input['spoke'];
  if (spoke !== 'yes' && spoke !== 'no') return { ok: false, why: 'Say whether you spoke to them.', field: 'spoke' };
  const note = textField(input['note'] ?? null, 2000, 'What was said');
  if (!note.ok) return note;
  const made = createTask(d, actor, {
    lead_id: r.id, owner_id: actor.id, activity_type: 'CALL', description: note.value,
    title: spoke === 'yes' ? 'Call: spoke to them' : 'Call: no answer',
  });
  if (!made.ok) return made;
  const closed = setTaskStatus(d, actor, made.id, 'COMPLETED', null);
  if (!closed.ok) return closed;
  if (spoke === 'yes' && r.status === 'NEW') {
    const moved = updateLead(d, actor, r.id, { status: 'CONTACTED' });
    if (!moved.ok) return moved;
  }
  return { ok: true, id: r.id };
}

/**
 * CONVERT A QUALIFIED LEAD — IT OPENS THE CLAIM.
 *
 * THE GATE IS ASKED AGAIN HERE, AT THE WRITE, whatever the lead's status says.
 *
 * NOTHING IS RE-KEYED. The organisation is the one the assessment created, or —
 * for a referral that arrived before its organisation existed — an organisation
 * a person chooses to link, which the assessment created in its turn. The claim
 * goes on the organisation's first property unless a person names another of its
 * own, carries the lead's assessment, and takes its workstream as migration 009
 * does: plant and machinery where a sealed estimate exists, not yet known where
 * none does. Its owner is the lead's owner. It opens at ASSESSMENT, because the
 * enquiry gate has just been passed on the lead.
 */
export function convertLead(d: CrmDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const r = loadLead(d.db, id);
  authorise(actor, 'lead.convert', leadObj(r));
  if (r.status !== 'QUALIFIED') {
    return { ok: false, why: `Only a qualified lead converts, and this one is ${words(LEAD_STATUSES, r.status, r.status).toLowerCase()}.` };
  }
  const gate = enquiryGate(d.db, { lead_id: r.id });
  if (!gate.open) {
    return {
      ok: false,
      why: `The enquiry checks are not all a yes yet: ${gate.checks.filter((c) => !c.passes).map((c) => `${c.label} — ${c.reading}`).join('; ')}.`,
    };
  }

  const linkTo = textField(input['business_id'], 64, 'The organisation');
  if (!linkTo.ok) return linkTo;
  const business_id = r.business_id ?? linkTo.value;
  if (business_id === null) {
    return {
      ok: false,
      why: 'This lead has no organisation yet. The organisation is created by the assessment — send them the assessment, ' +
        'then link this lead to the organisation it creates.',
    };
  }
  const b = d.db.get<{ id: string; source: string | null }>('SELECT id, source FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'organisation.read', { type: 'business', id: b.id });
  authorise(actor, 'claim.create', { type: 'claim', id: r.id, business_id: b.id, assigned_surveyor_ids: [] });

  /* THE ASSESSMENT. The lead's own; or, for a lead just linked, the organisation's
     latest — unless another lead already holds it, in which case that lead is the
     one to convert, or it has converted already and this is a second claim. */
  let assessment_id = r.assessment_id;
  if (assessment_id === null) {
    const latest = d.db.get<{ id: string; lead_id: string | null; lead_status: string | null }>(
      'SELECT a.id, l.id AS lead_id, l.status AS lead_status FROM assessments a LEFT JOIN leads l ON l.assessment_id = a.id ' +
        'WHERE a.business_id = ? ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1',
      [b.id]);
    if (latest !== undefined && latest.lead_id !== null && latest.lead_id !== r.id && latest.lead_status !== 'CONVERTED') {
      return {
        ok: false,
        why: 'That organisation’s assessment is already a lead of its own. Convert that one, and mark this one lost as a duplicate.',
      };
    }
    if (latest !== undefined && latest.lead_id === null) assessment_id = latest.id;
  }

  const properties = d.db.all<{ id: string }>(
    'SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [b.id]);
  const asked = textField(input['property_id'], 64, 'The property');
  if (!asked.ok) return asked;
  if (asked.value !== null && !properties.some((p) => p.id === asked.value)) {
    return { ok: false, why: 'A claim’s property must be one of its own organisation’s properties.' };
  }
  const property_id = asked.value ?? properties[0]?.id ?? null;
  const sealed = assessment_id === null ? 0
    : d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM estimates WHERE assessment_id = ?', [assessment_id])?.n ?? 0;
  const workstream = sealed > 0 ? 'PLANT_AND_MACHINERY' : 'UNKNOWN';

  const at = d.now();
  const made = d.db.tx(() => {
    const claim = insertClaim(d.db, d.now, d.newId, {
      business_id: b.id, property_id, assessment_id, workstream, stage: 'ASSESSMENT',
      owner_id: r.owner_id, surveyor_id: null,
    });
    recordOpened(d, actor, claim.id, 'ASSESSMENT', 'opened by converting a lead that passed its enquiry checks');
    /* A LEAD THAT ARRIVED WITH NO ORGANISATION — a call asked for at the reasoned
       negative — holds its person and its call on the lead (migration 011, row
       E22). They move to the organisation now: the same rows, nothing re-keyed,
       and the lead takes its booking as a funnel-close lead does. */
    if (r.business_id === null) {
      d.db.run('UPDATE contacts SET business_id = ?, updated_at = ? WHERE lead_id = ? AND business_id IS NULL', [b.id, at, r.id]);
      d.db.run('UPDATE bookings SET business_id = ? WHERE lead_id = ? AND business_id IS NULL', [b.id, r.id]);
    }
    const booking_id = r.booking_id ?? d.db.get<{ id: string }>(
      'SELECT id FROM bookings WHERE lead_id = ? AND business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
      [r.id, b.id])?.id ?? null;
    d.db.run(
      'UPDATE leads SET status = ?, converted_at = ?, claim_id = ?, business_id = ?, assessment_id = ?, booking_id = ?, ' +
        'prospect_organisation = NULL, prospect_sector = NULL, prospect_postcode = NULL, prospect_event = NULL, ' +
        'prospect_event_year = NULL, updated_at = ? WHERE id = ?',
      ['CONVERTED', at, claim.id, b.id, assessment_id, booking_id, at, r.id],
    );
    // DERIVED: the organisation's source is where its first converted lead came from.
    if (b.source === null) d.db.run('UPDATE businesses SET source = ?, updated_at = ? WHERE id = ?', [r.source, at, b.id]);
    raiseBusinessStage(d.db, b.id, at);
    return claim;
  });
  d.audit.append({
    at, kind: 'CLAIM_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: made.id,
    detail: { business: b.id, property: property_id, workstream, route: 'lead_conversion', lead: r.id },
  });
  audit(d, actor, 'LEAD_CONVERTED', r.id, { business: b.id, claim: made.id });
  // CRM 5 of 10: a referred lead's claim opens at ASSESSMENT — the indicative range issued — which is a notice to the firm, under the opt-in.
  onLeadConverted(d, actor, r.id, made.id);
  // CRM 3 of 10: the claim comes into being at ASSESSMENT, which is a stage entered.
  fireAutomation(d, actor, { trigger: 'STAGE_ENTERED', claim_id: made.id, stage: 'ASSESSMENT' });
  /* PHASE 157c (the Friary House run, F9): THE LEAD'S FOLLOW-UP BECOMES THE CLAIM'S NEXT ACTION. A converted claim had
     none, so its first move was refused ("This claim has no next action") while the page said "Ready". The lead's
     earliest open task, with a due date, is carried over as the claim's next action: its own owner, else the lead's
     owner. With no due date, or nobody to own it, nothing is invented and the claim asks for one, as before. */
  const follow = d.db.get<{ title: string; owner_id: string | null; due_on: string | null; activity_type: string | null }>(
    "SELECT title, owner_id, due_on, activity_type FROM staff_tasks WHERE lead_id = ? AND status IN ('OPEN','IN_PROGRESS') AND due_on IS NOT NULL ORDER BY due_on ASC, created_at ASC, id ASC LIMIT 1",
    [r.id]);
  const followOwner = follow?.owner_id ?? r.owner_id;
  if (follow !== undefined && follow.due_on !== null && followOwner !== null) {
    try {
      setNextAction(d, actor, made.id, { title: follow.title, owner_id: followOwner, due_on: follow.due_on, activity_type: follow.activity_type ?? 'TASK' });
    } catch { /* a login that may convert but not write the claim leaves it to be set, as before */ }
  }
  return { ok: true, id: made.id };
}

/* ================================================================== *
 * 5 · THE FUNNEL, THE BOOKING, AND THE SEED
 * ================================================================== */

/**
 * THE FUNNEL'S LEAD — written inside `submit()`'s transaction. A lead, NEW,
 * from the website, carrying the organisation and the assessment the submission
 * just created. No claim: that waits for the enquiry gate.
 */
export function openLeadForSubmission(
  db: Db, newId: () => string, v: { business_id: string; assessment_id: string; at: string },
): string {
  const id = newId();
  db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
      'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
      'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      "VALUES (?, ?, ?, NULL, NULL, 'ASSESSMENT', 'WEBSITE', NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, 'NEW', " +
      'NULL, NULL, NULL, ?, ?)',
    [id, v.business_id, v.assessment_id, v.at, v.at, v.at],
  );
  return id;
}

/**
 * THE GATED EXIT'S LEAD — the gated-exit repair, 11 September 2026.
 *
 * A prospect stopped at Q1b who asks for a call. NEW, from the website, origin
 * GATED_EXIT, and with NO ORGANISATION: they reached the reasoned negative before
 * the property question, so there is no sector to give one, and inventing one
 * would put a fact in the record nobody gave us. The table's CHECK asks for the
 * organisation's name instead — the business name the prospect typed, or
 * "Unnamed business", exactly as `submit()` names an organisation nobody named.
 *
 * THE PERSON AND THE CHANNEL ARE NOT HERE (row E21). They are a contact and a
 * booking that BELONG TO THIS LEAD until it is linked to an organisation (row
 * E22, migration 011), and `convertLead` moves them — the same rows — when it is.
 */
export function openLeadForGatedExit(
  db: Db, newId: () => string, v: { prospect_organisation: string; at: string },
): string {
  const id = newId();
  db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
      'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
      'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      "VALUES (?, NULL, NULL, NULL, NULL, 'GATED_EXIT', 'WEBSITE', NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, 'NEW', " +
      'NULL, NULL, NULL, ?, ?)',
    [id, v.prospect_organisation, v.at, v.at, v.at],
  );
  return id;
}

/** The funnel close's booking, tied to the lead it belongs to. */
export function linkBookingToLead(db: Db, business_id: string, booking_id: string, at: string): void {
  db.run('UPDATE leads SET booking_id = ?, updated_at = ? WHERE business_id = ? AND booking_id IS NULL',
    [booking_id, at, business_id]);
}

/**
 * MIGRATION 010's LEAD BACKFILL, FOR ONE ORGANISATION — the same derivation,
 * column by column, so an organisation seeded after the migration ran looks
 * exactly like one the migration found. Read the comment above that INSERT.
 */
export function backfillLeadFor(db: Db, newId: () => string, business_id: string): string {
  const id = newId();
  db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
      'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
      'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      'SELECT ?, b.id, a.id, k.id, cl.id, ' +
      "CASE WHEN a.id IS NOT NULL THEN 'ASSESSMENT' WHEN k.entry_point = 'gated_exit' THEN 'GATED_EXIT' " +
      "WHEN k.id IS NOT NULL THEN 'BOOKING' ELSE 'STAFF' END, " +
      "COALESCE(b.source, CASE WHEN a.id IS NOT NULL THEN 'WEBSITE' ELSE 'OTHER' END), NULL, NULL, NULL, " +
      'COALESCE((SELECT MIN(x.submitted_at) FROM assessments x WHERE x.business_id = b.id), k.created_at, b.created_at), ' +
      "b.owner_id, NULL, NULL, NULL, CASE WHEN cl.id IS NOT NULL THEN 'CONVERTED' ELSE 'NEW' END, NULL, NULL, " +
      'cl.created_at, b.created_at, b.created_at ' +
      'FROM businesses b ' +
      'LEFT JOIN assessments a ON a.id = (SELECT x.id FROM assessments x WHERE x.business_id = b.id ' +
      'ORDER BY x.submitted_at DESC, x.id DESC LIMIT 1) ' +
      'LEFT JOIN bookings k ON k.id = (SELECT y.id FROM bookings y WHERE y.business_id = b.id ' +
      'ORDER BY y.created_at ASC, y.id ASC LIMIT 1) ' +
      'LEFT JOIN claims cl ON cl.id = COALESCE(' +
      '(SELECT z.id FROM claims z WHERE z.business_id = b.id AND z.assessment_id = a.id ORDER BY z.created_at, z.id LIMIT 1), ' +
      '(SELECT z.id FROM claims z WHERE z.business_id = b.id ORDER BY z.created_at, z.id LIMIT 1)) ' +
      'WHERE b.id = ?',
    [id, business_id],
  );
  return id;
}
