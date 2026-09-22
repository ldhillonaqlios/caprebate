/**
 * THE ACTIVITY TIMELINE — A READ OVER WHAT IS ALREADY RECORDED, AND NOT A SECOND
 * LOG. CRM 3 of 10, 11 September 2026.
 *
 * For an organisation, a property, a claim and a lead, the timeline is assembled
 * on this request from the tables that already hold each event:
 *
 *   bookings, booking_changes          a call asked for, given a time, moved
 *   client_tasks                       a question drafted, put to the client, answered, withdrawn
 *   documents, document_events         an upload, and each step of its receipt
 *   engagements                        the letter raised and signed
 *   research_runs                      the research button
 *   claim_stage_moves, claim_milestones, enquiry_checks
 *   staff_tasks                        created, started, completed, cancelled
 *   surveyor_commitments               the surveyor committed — never the figures
 *   invoices, and the audit log's INVOICE_UPDATED lines
 *   outbox                             what was queued, and that it was not sent
 *   automation_runs                    what each rule did, or why it did not
 *   the audit log's record changes     who changed an organisation, a contact, a property, a claim or a lead
 *   internal_notes                     KEPT APART — see below
 *
 * THERE IS NO TIMELINE TABLE. A second event log would be a copy of each of
 * those that could disagree with it, and a test reads sqlite_master to hold that
 * none exists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INTERNAL NOTES ARE SEPARATE IN STRUCTURE, NOT ONLY ON SCREEN
 *
 * `events` never holds a note. Notes are `internal_notes`, a separate array,
 * present only where `internal_note.read` says yes, and drawn in their own panel.
 * Every event also says whether it is something the client sees — a question in
 * their portal, their own call, their upload — or staff-only.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * BUILT FORWARDS, ROLE BY ROLE
 *
 *   ADMIN, SALES   everything their rules reach
 *   ACCOUNTING     a claim's timeline, of FINANCIAL events only — the invoices and their states; `invoice.read`
 *                  is the one capability it holds here, and nothing else is ever assembled for it
 *   SURVEYING      a claim's timeline, only through an assigned survey job: the stage (labels, no reasons),
 *                  their own tasks on it, and their own commitment. No other timeline admits them.
 *   CLIENT         none
 *
 * AND A LEAD IS READ BY ITS OWN ID. A call asked for at the reasoned negative is
 * a lead with no organisation, and its contact and booking belong to the lead
 * (migration 011, row E22). A read keyed only on the organisation would drop
 * them without a sound, so the lead's timeline reads `lead_id`, and an
 * organisation's reads its leads' rows as well as its own.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localStamp, localWhen } from './localtime.ts';
import { claimObjFor } from './crm.ts';
import { anyStageLabel } from './stages.ts';
import { ENQUIRY_CHECKS, MILESTONES, MOVE_WORDS, reasonLabel } from './pipeline.ts';
import { INVOICE_WORDS, PAYMENT_WORDS } from './finance.ts';
import { CREDIT_BASES, INVOICE_KINDS, formatInvoiceNumber } from './invoices.ts';
import { RECIPROCITY_ACTIVITY_TYPES, TASK_ORIGINS, taskObj } from './tasks.ts';
import { vocabLabel } from './vocabularies.ts';
import { RUN_REASONS } from './automation.ts';
import { documentObj, versionObj } from './documents.ts';

export type TimelineSubject = { readonly kind: 'organisation' | 'property' | 'claim' | 'lead'; readonly id: string };

export type Audience = 'CLIENT_SEES' | 'STAFF_ONLY';

export type Category =
  | 'BOOKING' | 'CLIENT_QUESTION' | 'DOCUMENT' | 'ENGAGEMENT' | 'RESEARCH' | 'STAGE' | 'CONFIRMATION' | 'ENQUIRY'
  | 'TASK' | 'SURVEY' | 'FINANCE' | 'OUTBOX' | 'RECORD' | 'AUTOMATION' | 'CONTACT'
  /** PHASE 142: a message on the thread with the client. Never a team message — those are the notes, kept apart. */
  | 'MESSAGE';

export type TimelineEvent = {
  /** Stored UTC, for sorting and for the wire. */
  readonly at: string;
  /** UK time, for a person. */
  readonly when: string;
  readonly category: Category;
  readonly audience: Audience;
  readonly what: string;
  readonly who: string | null;
  /** Which part of the subject it belongs to — this claim, the organisation, a lead. */
  readonly scope: string;
};

export type TimelineNote = {
  readonly at: string;
  readonly when: string;
  readonly body: string;
  readonly who: string | null;
  readonly about: string;
};

export type Timeline = {
  readonly subject: TimelineSubject;
  readonly events: readonly TimelineEvent[];
  /** Present only for `internal_note.read`. Never inside `events`. */
  readonly internal_notes?: readonly TimelineNote[];
  /** Present where the reader's timeline is built from less than everything, saying what it is built from. */
  readonly limited_to?: string;
  readonly read_not_log: string;
};

export const READ_NOT_LOG =
  'Made fresh each time you open it, from what we already hold. That is bookings, questions, documents, research, ' +
  'step moves, tasks, invoices, emails and the audit log. There is no second log behind it.';

export const FINANCE_ONLY = 'Financial events only — the invoices and their states. Accounting reaches money and nothing else.';
export const SURVEY_ONLY =
  'Only what your assigned survey job reaches: the claim’s stage, your own tasks on it, and the commitment of your figures.';

const RECORD_WORDS: Readonly<Record<string, string>> = Object.freeze({
  ORGANISATION_UPDATED: 'The organisation’s record was changed',
  CONTACT_CREATED: 'A contact was added',
  CONTACT_UPDATED: 'A contact was changed',
  PROPERTY_CREATED: 'A property was recorded',
  PROPERTY_UPDATED: 'The property’s record was changed',
  CLAIM_CREATED: 'The claim was opened',
  CLAIM_UPDATED: 'The claim’s record was changed',
  LEAD_CREATED: 'The lead was recorded',
  LEAD_UPDATED: 'The lead was changed',
  LEAD_CONVERTED: 'The lead converted, and its claim opened',
  EMAIL_QUEUED: 'An email was made from a template and is waiting to send — not sent yet',
});

const CHANNEL_WORDS: Readonly<Record<string, string>> = Object.freeze({
  phone: 'a telephone call', sms_whatsapp: 'a text or WhatsApp message', email: 'an email',
});

const OUTBOX_WORDS: Readonly<Record<string, string>> = Object.freeze({
  CALENDAR_INVITE: 'A calendar invitation', NOTIFICATION: 'A notice to staff', TEMPLATE: 'An email from a template',
  PASSWORD_RESET: 'A password reset', WELCOME: 'A welcome message', FREE_TYPED: 'An email', SIGNED_LETTER: 'The signed engagement letter',
});

function w(map: Readonly<Record<string, string>>, k: string | null | undefined, none: string): string {
  return k !== null && k !== undefined && Object.hasOwn(map, k) ? (map[k] ?? none) : none;
}

function fieldWords(detail: Record<string, unknown>): string {
  const f = detail['fields'];
  if (!Array.isArray(f) || f.length === 0) return '';
  return ` — ${f.map((x) => String(x).replace(/_id$/, '').replace(/_/g, ' ')).join(', ')}`;
}

type Scope = {
  readonly business_id: string | null;
  /** Phase 134: `property_label` names the claim for a person; the reference is only its grey label. */
  readonly claims: readonly { readonly id: string; readonly claim_ref: string; readonly business_id: string; readonly property_label: string | null }[];
  readonly leads: readonly string[];
};

// Phase 134: a property recorded as "Company — main site" is named "main site" here, where the company is the frame.
const CLAIM_SCOPE_SELECT = "SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || ' — %' THEN substr(p.label, length(b.name) + 4) " +
  'ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ';

/**
 * PHASE 134 — A CLAIM IN THE TIMELINE IS NAMED BY ITS PROPERTY. The words a person reads are "Outpatient annexe", and the
 * reference follows as ` · CR-2026-0007` so two claims on one property still read apart; `timelineBlock` draws that tail
 * as a small grey label (src/web/tasks-pages.ts). A claim with no property is "a claim with no property".
 */
export function claimScopeWords(property_label: string | null, claim_ref: string): string {
  return `${property_label === null || property_label.trim() === '' ? 'a claim with no property' : property_label} · ${claim_ref}`;
}

function resolve(db: Db, actor: Actor, subject: TimelineSubject): { scope: Scope; obj: Extract<Obj, { type: 'timeline' }> } {
  if (subject.kind === 'claim') {
    const c = db.get<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(`${CLAIM_SCOPE_SELECT}WHERE c.id = ?`, [subject.id]);
    if (c === undefined) throw new NotFoundAsRefusal();
    const co = claimObjFor(db, c);
    authorise(actor, 'claim.read', co);
    return {
      scope: { business_id: c.business_id, claims: [c], leads: db.all<{ id: string }>('SELECT id FROM leads WHERE claim_id = ?', [c.id]).map((r) => r.id) },
      obj: { type: 'timeline', id: c.id, business_id: c.business_id, assigned_surveyor_ids: co.assigned_surveyor_ids },
    };
  }
  if (subject.kind === 'organisation') {
    const b = db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [subject.id]);
    if (b === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'organisation.read', { type: 'business', id: b.id });
    return {
      scope: {
        business_id: b.id,
        claims: db.all<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(`${CLAIM_SCOPE_SELECT}WHERE c.business_id = ? ORDER BY c.claim_ref`, [b.id]),
        leads: db.all<{ id: string }>('SELECT id FROM leads WHERE business_id = ?', [b.id]).map((r) => r.id),
      },
      obj: { type: 'timeline', id: b.id, business_id: b.id, assigned_surveyor_ids: [] },
    };
  }
  if (subject.kind === 'property') {
    const p = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM properties WHERE id = ?', [subject.id]);
    if (p === undefined) throw new NotFoundAsRefusal();
    const surveyors = db.all<{ surveyor_id: string }>(
      'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', [p.business_id]).map((r) => r.surveyor_id);
    authorise(actor, 'property.read', { type: 'property', id: p.id, business_id: p.business_id, assigned_surveyor_ids: surveyors });
    return {
      scope: {
        business_id: p.business_id,
        claims: db.all<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(`${CLAIM_SCOPE_SELECT}WHERE c.property_id = ? ORDER BY c.claim_ref`, [p.id]),
        leads: [],
      },
      // A property's timeline reaches beyond any one survey job: an empty list reaches no surveyor.
      obj: { type: 'timeline', id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] },
    };
  }
  const l = db.get<{ id: string; business_id: string | null }>('SELECT id, business_id FROM leads WHERE id = ?', [subject.id]);
  if (l === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'lead.read', { type: 'lead', id: l.id, business_id: l.business_id });
  return {
    // A LEAD'S TIMELINE IS THE LEAD'S OWN. The organisation's events are on the organisation's.
    scope: { business_id: null, claims: [], leads: [l.id] },
    obj: { type: 'timeline', id: l.id, business_id: l.business_id, assigned_surveyor_ids: [] },
  };
}

/**
 * THE TIMELINE. Authorised on the subject and on `timeline.read`, then built from
 * the capabilities the reader holds, each asked of `can()` — no role is named.
 */
export function timelineFor(db: Db, actor: Actor, subject: TimelineSubject): Timeline {
  const { scope, obj } = resolve(db, actor, subject);
  authorise(actor, 'timeline.read', obj);
  const biz = scope.business_id;
  const staff = subject.kind === 'lead'
    ? can(actor, 'lead.read', { type: 'lead', id: subject.id, business_id: obj.business_id })
      && can(actor, 'pipeline.read', { type: 'pipeline', id: subject.id })
    : biz !== null && can(actor, 'organisation.read', { type: 'business', id: biz });
  const orgLevel = subject.kind === 'organisation' || subject.kind === 'claim';
  const finance = orgLevel && biz !== null && can(actor, 'invoice.read', { type: 'invoice', id: biz, business_id: biz });
  const notes = subject.kind !== 'lead' && biz !== null && can(actor, 'internal_note.read', { type: 'internal_note', id: biz, business_id: biz });
  const research = orgLevel && biz !== null && can(actor, 'research.read', { type: 'research', id: biz, business_id: biz });
  const pipelineFull = can(actor, 'pipeline.read', { type: 'pipeline', id: subject.id });
  const jobs: { id: string; claim_id: string }[] = [];
  for (const c of scope.claims) {
    for (const j of db.all<{ id: string; business_id: string; surveyor_id: string | null }>(
      'SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE claim_id = ?', [c.id])) {
      if (can(actor, 'surveyor_job.read', { type: 'surveyor_job', id: j.id, business_id: j.business_id, surveyor_id: j.surveyor_id })) {
        jobs.push({ id: j.id, claim_id: c.id });
      }
    }
  }
  const surveyReach = !staff && jobs.length > 0;

  const events: TimelineEvent[] = [];
  const add = (e: Omit<TimelineEvent, 'when'>): void => { events.push({ ...e, when: localStamp(e.at) }); };
  const scopeWords = new Map(scope.claims.map((c) => [c.claim_ref, claimScopeWords(c.property_label, c.claim_ref)]));
  const claimScope = (ref: string): string => (subject.kind === 'claim' ? 'this claim' : scopeWords.get(ref) ?? ref);
  const leadScope = subject.kind === 'lead' ? 'this lead' : subject.kind === 'claim' ? 'the lead it came from' : 'a lead';
  const orgScope = 'the company';

  if (staff) {
    bookings(db, actor, subject, biz, add, orgScope, leadScope);
    if (orgLevel && biz !== null) {
      clientQuestions(db, biz, add, orgScope, subject, claimScope);
      documents(db, actor, biz, add, orgScope);
      documentLinks(db, actor, subject, biz, add, orgScope, claimScope);
      engagement(db, biz, add, orgScope);
      outbox(db, biz, add, orgScope, claimScope);
    }
    records(db, subject, biz, add, orgScope);
    automation(db, subject, scope, add, claimScope, leadScope);
    if (subject.kind === 'lead') {
      leadOutbox(db, subject.id, add, leadScope);
      for (const r of db.all<{ id: string; created_at: string }>('SELECT id, created_at FROM contacts WHERE lead_id = ?', [subject.id])) {
        if (!can(actor, 'contact.read', { type: 'contact', id: r.id, business_id: null })) continue;
        add({ at: r.created_at, category: 'CONTACT', audience: 'STAFF_ONLY', who: null, scope: leadScope,
          what: 'The person who asked was recorded, with the channel they chose and their consent for it' });
      }
    }
  }
  if (research && biz !== null) {
    for (const r of db.all<{ at: string; kind: string; considered: number; fired: number; not_permitted: number; failed: number; who: string | null }>(
      'SELECT r.at, r.kind, r.considered, r.fired, r.not_permitted, r.failed, u.display_name AS who FROM research_runs r ' +
        'LEFT JOIN users u ON u.id = r.actor_id WHERE r.business_id = ? ORDER BY r.at', [biz])) {
      add({ at: r.at, category: 'RESEARCH', audience: 'STAFF_ONLY', who: r.who, scope: orgScope,
        what: `${r.kind === 'RETRY' ? 'A failed source was retried' : 'The research was run'}: ${r.considered} sources in all, ${r.fired} looked up, ${r.not_permitted} waiting for a go-ahead, ${r.failed} failed` });
    }
  }
  // PHASE 142: THE THREAD WITH THE CLIENT, one line per message — who wrote, and which claim — never the words, which are
  // on the Chat tab. Only for a login that may read that thread.
  if (orgLevel && biz !== null && can(actor, 'client_message.read', { type: 'client_message', id: biz, business_id: biz })) {
    clientMessages(db, subject, biz, add, orgScope, claimScope);
  }
  if (finance && biz !== null) invoices(db, subject.kind, scope.claims, biz, add, orgScope, claimScope);

  for (const c of scope.claims) {
    if (pipelineFull) {
      for (const m of db.all<{ at: string; kind: string; from_stage: string | null; to_stage: string | null; reason_code: string | null; reason_text: string | null; who: string | null }>(
        'SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
          'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at, m.rowid', [c.id])) {
        const reason = reasonLabel(db, 'CLAIM_EXIT', m.reason_code);
        add({ at: m.at, category: 'STAGE', audience: 'STAFF_ONLY', who: m.who, scope: claimScope(c.claim_ref),
          what: `${w(MOVE_WORDS, m.kind, m.kind)}: ${anyStageLabel(m.from_stage)} → ${anyStageLabel(m.to_stage)}${reason === null ? '' : ` — ${reason}`}${m.reason_text === null ? '' : ` — “${m.reason_text}”`}` });
      }
      for (const m of db.all<{ recorded_at: string; milestone: string; who: string | null }>(
        'SELECT cm.recorded_at, cm.milestone, u.display_name AS who FROM claim_milestones cm LEFT JOIN users u ON u.id = cm.recorded_by ' +
          'WHERE cm.claim_id = ? ORDER BY cm.recorded_at', [c.id])) {
        const label = Object.hasOwn(MILESTONES, m.milestone) ? MILESTONES[m.milestone as keyof typeof MILESTONES].label : m.milestone;
        add({ at: m.recorded_at, category: 'CONFIRMATION', audience: 'STAFF_ONLY', who: m.who, scope: claimScope(c.claim_ref), what: `Confirmed: ${label}` });
      }
      enquiry(db, 'claim_id', c.id, add, claimScope(c.claim_ref));
    } else if (surveyReach && jobs.some((j) => j.claim_id === c.id)) {
      for (const m of db.all<{ at: string; kind: string; to_stage: string | null }>(
        'SELECT at, kind, to_stage FROM claim_stage_moves WHERE claim_id = ? ORDER BY at, rowid', [c.id])) {
        add({ at: m.at, category: 'STAGE', audience: 'STAFF_ONLY', who: null, scope: claimScope(c.claim_ref),
          what: `${w(MOVE_WORDS, m.kind, m.kind)}: now at ${anyStageLabel(m.to_stage)}` });
      }
    }
    for (const k of db.all<{ committed_at: string; job_id: string; who: string | null }>(
      'SELECT sc.committed_at, sc.job_id, u.display_name AS who FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
        'LEFT JOIN users u ON u.id = sc.surveyor_id WHERE j.claim_id = ? ORDER BY sc.committed_at', [c.id])) {
      if (!staff && !jobs.some((j) => j.id === k.job_id)) continue;
      add({ at: k.committed_at, category: 'SURVEY', audience: 'STAFF_ONLY', who: k.who, scope: claimScope(c.claim_ref),
        what: 'The surveyor committed their own figures, and our estimate was released to them' });
    }
  }
  if (pipelineFull) for (const l of scope.leads) enquiry(db, 'lead_id', l, add, leadScope);
  if (staff || surveyReach) tasks(db, actor, subject, scope, add, claimScope, leadScope, orgScope);

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    subject,
    events,
    ...(notes && biz !== null ? { internal_notes: notesOf(db, subject, biz) } : {}),
    ...(staff ? {} : { limited_to: finance ? FINANCE_ONLY : SURVEY_ONLY }),
    read_not_log: READ_NOT_LOG,
  };
}

/**
 * THE TIMELINE WHERE THE READER MAY HAVE ONE, AND UNDEFINED WHERE NOT — for a page
 * that has already authorised its subject and is deciding whether to draw the
 * panel. The subject's own read is asked again; `timeline.read` is asked of
 * `can()` rather than thrown, because a surveyor on a property page is allowed the
 * page and not its timeline.
 */
export function timelineIfPermitted(db: Db, actor: Actor, subject: TimelineSubject): Timeline | undefined {
  const { obj } = resolve(db, actor, subject);
  return can(actor, 'timeline.read', obj) ? timelineFor(db, actor, subject) : undefined;
}

type Add = (e: Omit<TimelineEvent, 'when'>) => void;

function bookings(db: Db, actor: Actor, subject: TimelineSubject, biz: string | null, add: Add, orgScope: string, leadScope: string): void {
  const rows = subject.kind === 'lead'
    ? db.all<{ id: string; business_id: string | null; lead_id: string | null; channel: string; entry_point: string; created_at: string }>(
      'SELECT k.id, k.business_id, k.lead_id, k.channel, k.entry_point, k.created_at FROM bookings k ' +
        'WHERE k.lead_id = ? OR k.id = (SELECT l.booking_id FROM leads l WHERE l.id = ?) ORDER BY k.created_at', [subject.id, subject.id])
    : subject.kind === 'property' || biz === null ? []
      : db.all<{ id: string; business_id: string | null; lead_id: string | null; channel: string; entry_point: string; created_at: string }>(
        'SELECT k.id, k.business_id, k.lead_id, k.channel, k.entry_point, k.created_at FROM bookings k ' +
          'WHERE k.business_id = ? OR k.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY k.created_at', [biz, biz]);
  for (const k of rows) {
    if (!can(actor, 'booking.read', { type: 'booking', id: k.id, business_id: k.business_id })) continue;
    const scope = subject.kind === 'lead' ? leadScope : orgScope;
    add({ at: k.created_at, category: 'BOOKING', audience: 'CLIENT_SEES', who: null, scope,
      what: `The client asked for ${w(CHANNEL_WORDS, k.channel, k.channel)} — asked at ${k.entry_point.replace(/_/g, ' ')}` });
    for (const ch of db.all<{ at: string; from_starts_at: string | null; to_starts_at: string | null; who: string | null; cancelled: number }>(
      'SELECT c.at, c.from_starts_at, c.to_starts_at, u.display_name AS who, c.cancelled FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by ' +
        'WHERE c.booking_id = ? ORDER BY c.at', [k.id])) {
      add({ at: ch.at, category: 'BOOKING', audience: 'CLIENT_SEES', who: ch.who, scope,
        what: ch.cancelled === 1 ? 'The call was cancelled'
          : ch.to_starts_at === null ? 'The call was released back to us with no time'
          : ch.from_starts_at === null ? `The call was given a time: ${localWhen(ch.to_starts_at)}`
            : `The call was moved to ${localWhen(ch.to_starts_at)}` });
    }
  }
}

function clientQuestions(db: Db, biz: string, add: Add, scope: string, subject: TimelineSubject, claimScope: (ref: string) => string): void {
  for (const q of db.all<{
    question: string; created_at: string; sent_to_portal_at: string | null; answered_at: string | null; answer_state: string | null;
    answered_by_role: string | null; withdrawn_at: string | null; due_on: string | null; asked_by: string | null; answered_by: string | null;
    withdrawn_by: string | null; kind: string; type_label: string | null; claim_id: string | null; claim_ref: string | null;
    received_version: number | null; received_seq: number | null;
  }>(
    'SELECT ct.question, ct.created_at, ct.sent_to_portal_at, ct.answered_at, ct.answer_state, ct.answered_by_role, ct.withdrawn_at, ' +
      'ct.due_on, ab.display_name AS asked_by, an.display_name AS answered_by, wb.display_name AS withdrawn_by, ct.kind, ' +
      't.label AS type_label, ct.claim_id, c.claim_ref, d.version_no AS received_version, l.seq AS received_seq FROM client_tasks ct ' +
      'LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN users an ON an.id = ct.answered_by LEFT JOIN users wb ON wb.id = ct.withdrawn_by ' +
      'LEFT JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id ' +
      'LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
      'WHERE ct.business_id = ? ORDER BY ct.created_at', [biz])) {
    const due = q.due_on === null ? '' : `, due ${q.due_on}`;
    /* CRM 4 of 10 — A DOCUMENT REQUEST, drawn from the same row as a question and
       in its own words: requested, received by an upload, or withdrawn. */
    if (q.kind === 'DOCUMENT') {
      const label = q.type_label ?? 'a document';
      const where = subject.kind === 'claim' && q.claim_id === subject.id ? 'this claim' : q.claim_ref === null ? scope : claimScope(q.claim_ref);
      add({ at: q.created_at, category: 'DOCUMENT', audience: 'CLIENT_SEES', who: q.asked_by, scope: where,
        what: `A document was requested from the client: ${label}${due}` });
      if (q.answered_at !== null) {
        add({ at: q.answered_at, category: 'DOCUMENT', audience: 'CLIENT_SEES', who: null, scope: where,
          what: `The requested ${label} was received by an upload${q.received_seq === null ? '' : ` — ${label} ${q.received_seq}, version ${q.received_version ?? ''}`}` });
      }
      if (q.withdrawn_at !== null) {
        add({ at: q.withdrawn_at, category: 'DOCUMENT', audience: 'CLIENT_SEES', who: q.withdrawn_by, scope: where,
          what: `The request for ${label} was withdrawn` });
      }
      continue;
    }
    if (q.sent_to_portal_at === null || q.sent_to_portal_at !== q.created_at) {
      add({ at: q.created_at, category: 'CLIENT_QUESTION', audience: 'STAFF_ONLY', who: q.asked_by, scope, what: `A question was drafted: “${q.question}”${due}` });
    }
    if (q.sent_to_portal_at !== null) {
      add({ at: q.sent_to_portal_at, category: 'CLIENT_QUESTION', audience: 'CLIENT_SEES', who: q.asked_by, scope, what: `A question was put to the client: “${q.question}”${due}` });
    }
    if (q.answered_at !== null) {
      const dk = q.answer_state === 'DONT_KNOW';
      add({
        at: q.answered_at, category: 'CLIENT_QUESTION', audience: q.answered_by_role === 'CLIENT' ? 'CLIENT_SEES' : 'STAFF_ONLY',
        who: q.answered_by_role === 'CLIENT' ? null : q.answered_by, scope,
        what: q.answered_by_role === 'CLIENT'
          ? `The client ${dk ? 'said they do not know — which is an answer —' : 'answered'} “${q.question}”`
          : `An answer to “${q.question}” was recorded by staff on the client’s behalf${dk ? ': they do not know, which is an answer' : ''}`,
      });
    }
    if (q.withdrawn_at !== null) {
      add({ at: q.withdrawn_at, category: 'CLIENT_QUESTION', audience: q.sent_to_portal_at === null ? 'STAFF_ONLY' : 'CLIENT_SEES',
        who: q.withdrawn_by, scope, what: `A question asked in error was withdrawn: “${q.question}” — the fact is outstanding again` });
    }
  }
}

function documents(db: Db, actor: Actor, biz: string, add: Add, scope: string): void {
  for (const doc of db.all<{
    id: string; declared_type: string | null; doc_type: string | null; state: string; created_at: string;
    type_label: string | null; seq: number | null; version_no: number | null;
  }>(
    'SELECT d.id, d.declared_type, d.doc_type, d.state, d.created_at, t.label AS type_label, l.seq, d.version_no FROM documents d ' +
      'LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
      'WHERE d.business_id = ? ORDER BY d.created_at', [biz])) {
    // CRM 4 of 10: A DOCUMENT IS ON THE TIMELINE ONLY FOR A READER OF THAT DOCUMENT —
    // Sales does not learn from here that a fee invoice exists.
    const o = versionObj(db, doc.id);
    if (o === undefined || !can(actor, 'document.read', o)) continue;
    const type = doc.type_label !== null && doc.seq !== null
      ? `${doc.type_label} ${doc.seq}, version ${doc.version_no ?? ''}`
      : (doc.doc_type ?? doc.declared_type ?? 'type not given').replace(/_/g, ' ');
    add({ at: doc.created_at, category: 'DOCUMENT', audience: 'CLIENT_SEES', who: null, scope, what: `A document was uploaded — ${type}` });
    for (const e of db.all<{ at: string; contract_step: number; action: string; outcome: string }>(
      'SELECT at, contract_step, action, outcome FROM document_events WHERE doc_id = ? ORDER BY contract_step, at', [doc.id])) {
      add({ at: e.at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: null, scope,
        what: `Upload step ${e.contract_step} for the ${type}: ${e.action.replace(/_/g, ' ')} — ${e.outcome}` });
    }
  }
}

/** CRM 4 of 10 — a document linked to a claim or a property, and the link ended. Read off `document_links`. */
function documentLinks(db: Db, actor: Actor, subject: TimelineSubject, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  for (const k of db.all<{
    logical_document_id: string; business_id: string; readers: string; carries_value: number; label: string; seq: number;
    claim_id: string | null; claim_ref: string | null; property_label: string | null; linked_at: string; unlinked_at: string | null;
    linked_by: string | null; unlinked_by: string | null;
  }>(
    'SELECT k.logical_document_id, l.business_id, t.readers, t.carries_value, t.label, l.seq, k.claim_id, c.claim_ref, p.label AS property_label, ' +
      'k.linked_at, k.unlinked_at, lb.display_name AS linked_by, ub.display_name AS unlinked_by FROM document_links k ' +
      'JOIN logical_documents l ON l.id = k.logical_document_id JOIN document_types t ON t.code = l.type_code ' +
      'LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = k.property_id ' +
      'LEFT JOIN users lb ON lb.id = k.linked_by LEFT JOIN users ub ON ub.id = k.unlinked_by WHERE l.business_id = ? ORDER BY k.linked_at', [biz])) {
    if (!can(actor, 'document.read', documentObj(db, { id: k.logical_document_id, business_id: k.business_id, readers: k.readers, carries_value: k.carries_value }))) continue;
    const target = k.claim_id !== null ? (subject.kind === 'claim' && subject.id === k.claim_id ? 'this claim' : (k.claim_ref === null ? 'a claim' : `the claim on ${claimScope(k.claim_ref)}`)) : `the property ${k.property_label ?? ''}`.trim();
    add({ at: k.linked_at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: k.linked_by, scope, what: `${k.label} ${k.seq} was linked to ${target}` });
    if (k.unlinked_at !== null) {
      add({ at: k.unlinked_at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: k.unlinked_by, scope, what: `${k.label} ${k.seq} was unlinked from ${target}` });
    }
  }
}

function engagement(db: Db, biz: string, add: Add, scope: string): void {
  const e = db.get<{ letter_state: string; signed_at: string | null; created_at: string }>(
    'SELECT letter_state, signed_at, created_at FROM engagements WHERE business_id = ?', [biz]);
  if (e === undefined) return;
  add({ at: e.created_at, category: 'ENGAGEMENT', audience: 'STAFF_ONLY', who: null, scope, what: 'The engagement letter was raised' });
  if (e.signed_at !== null) add({ at: e.signed_at, category: 'ENGAGEMENT', audience: 'CLIENT_SEES', who: null, scope, what: 'The engagement letter was signed' });
}

/**
 * PHASE 141 — EVERY EMAIL IS ON THE COMPANY'S TIMELINE, tagged to its claim where one was picked, with who wrote it and
 * who it went to. A lead's emails are on the lead's timeline (`leadOutbox`). An email that was not sent says so.
 */
type OutboxRow = { created_at: string; kind: string; subject: string; sent_at: string | null; claim_ref: string | null; who: string | null; to_name: string | null };
const OUTBOX_SELECT = 'SELECT o.created_at, o.kind, o.subject, o.sent_at, c.claim_ref, u.display_name AS who, ct.full_name AS to_name FROM outbox o ' +
  'LEFT JOIN claims c ON c.id = o.claim_id LEFT JOIN users u ON u.id = o.written_by LEFT JOIN contacts ct ON ct.id = o.contact_id ';

function outboxWhat(o: OutboxRow): string {
  return `${w(OUTBOX_WORDS, o.kind, 'A message')}${o.to_name === null ? '' : ` to ${o.to_name}`}: “${o.subject}” — ${
    o.sent_at === null ? 'saved, not sent' : `sent ${localStamp(o.sent_at)}`}`;
}

function outbox(db: Db, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  for (const o of db.all<OutboxRow>(`${OUTBOX_SELECT}WHERE o.business_id = ? ORDER BY o.created_at`, [biz])) {
    add({ at: o.created_at, category: 'OUTBOX', audience: o.sent_at === null ? 'STAFF_ONLY' : 'CLIENT_SEES', who: o.who,
      scope: o.claim_ref === null ? scope : claimScope(o.claim_ref), what: outboxWhat(o) });
  }
}

/**
 * PHASE 142 — EVERY MESSAGE ON THE THREAD WITH THE CLIENT IS ON THE COMPANY'S TIMELINE, tagged to its claim where it was.
 * A reply that came by email reads "A reply from <contact>", as the Developer Spec's B48 set it.
 */
function clientMessages(db: Db, subject: TimelineSubject, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  type Row = { created_at: string; direction: string; source: string; who: string | null; contact: string | null; claim_ref: string | null; files: number };
  const select = 'SELECT m.created_at, m.direction, m.source, u.display_name AS who, ct.full_name AS contact, c.claim_ref, ' +
    '(SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m ' +
    'LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id ';
  const rows = subject.kind === 'claim'
    ? db.all<Row>(`${select}WHERE m.business_id = ? AND (m.claim_id = ? OR m.claim_id IS NULL) ORDER BY m.created_at`, [biz, subject.id])
    : db.all<Row>(`${select}WHERE m.business_id = ? ORDER BY m.created_at`, [biz]);
  for (const m of rows) {
    const files = m.files === 0 ? '' : ` — with ${m.files} ${m.files === 1 ? 'file' : 'files'}`;
    const what = m.source === 'EMAIL' ? `A reply from ${m.contact ?? 'the client'}, by email${files}`
      : m.direction === 'FROM_CLIENT' ? `The client sent a message in their portal${files}` : 'We sent the client a message in their portal';
    add({ at: m.created_at, category: 'MESSAGE', audience: 'CLIENT_SEES', who: m.source === 'EMAIL' ? m.contact : m.who,
      scope: m.claim_ref === null ? scope : claimScope(m.claim_ref), what });
  }
}

function leadOutbox(db: Db, lead_id: string, add: Add, scope: string): void {
  for (const o of db.all<OutboxRow>(`${OUTBOX_SELECT}WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at`, [lead_id])) {
    add({ at: o.created_at, category: 'OUTBOX', audience: o.sent_at === null ? 'STAFF_ONLY' : 'CLIENT_SEES', who: o.who, scope, what: outboxWhat(o) });
  }
}

/**
 * THE FINANCIAL EVENTS. CRM 7 of 10: A CLAIM'S OWN INVOICES — raised, sent,
 * cancelled, credited, money recorded and voided — each from the row that records
 * it, and never an amount. An organisation's timeline also carries its invoices
 * from before invoices sat on the claim; a claim's timeline carries its own alone.
 */
function invoices(
  db: Db, kind: string, claims: readonly { id: string; claim_ref: string }[], biz: string, add: Add, orgScope: string,
  claimScope: (ref: string) => string,
): void {
  for (const c of claims) {
    const scope = claimScope(c.claim_ref);
    for (const i of db.all<{ id: string; kind: string; created_at: string; cancelled_at: string | null; seq: number | null; raiser: string | null; canceller: string | null }>(
      'SELECT i.id, i.kind, i.created_at, i.cancelled_at, n.seq, u.display_name AS raiser, x.display_name AS canceller FROM invoices i ' +
        "LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = 'INVOICE' LEFT JOIN users u ON u.id = i.raised_by " +
        'LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.created_at', [c.id])) {
      const number = formatInvoiceNumber(i.seq) ?? 'an unnumbered invoice';
      add({ at: i.created_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: i.raiser, scope,
        what: `Invoice ${number} was raised — ${w(INVOICE_KINDS, i.kind, i.kind)}` });
      if (i.cancelled_at !== null) {
        add({ at: i.cancelled_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: i.canceller, scope,
          what: `Invoice ${number} was cancelled before it was sent, and its number recorded as cancelled` });
      }
      for (const a of db.all<{ at: string; who: string | null }>(
        "SELECT a.at, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.kind = 'INVOICE_SENT' AND a.object_id = ? ORDER BY a.seq",
        [i.id])) {
        add({ at: a.at, category: 'FINANCE', audience: 'STAFF_ONLY', who: a.who, scope, what: `Invoice ${number} was recorded as sent` });
      }
      for (const n of db.all<{ recorded_at: string; basis: string; seq: number | null; who: string | null }>(
        'SELECT c.recorded_at, c.basis, n.seq, u.display_name AS who FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
          'LEFT JOIN users u ON u.id = c.recorded_by WHERE c.invoice_id = ? ORDER BY c.recorded_at', [i.id])) {
        add({ at: n.recorded_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: n.who, scope,
          what: `Credit note ${formatInvoiceNumber(n.seq) ?? ''} was issued against invoice ${number} — ${w(CREDIT_BASES, n.basis, n.basis)}` });
      }
      for (const p of db.all<{ recorded_at: string; voided_at: string | null; who: string | null; voider: string | null }>(
        'SELECT p.recorded_at, p.voided_at, u.display_name AS who, v.display_name AS voider FROM invoice_payments p ' +
          'LEFT JOIN users u ON u.id = p.recorded_by LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.recorded_at', [i.id])) {
        add({ at: p.recorded_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: p.who, scope,
          what: `Money was recorded as received against invoice ${number} — recorded, not collected` });
        if (p.voided_at !== null) {
          add({ at: p.voided_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: p.voider, scope,
            what: `A record of money received against invoice ${number} was voided` });
        }
      }
    }
  }
  if (kind !== 'organisation') return;
  const scope = orgScope;
  const inv = INVOICE_WORDS as Readonly<Record<string, string>>;
  const pay = PAYMENT_WORDS as Readonly<Record<string, string>>;
  for (const i of db.all<{ created_at: string; invoice_status: string; payment_status: string }>(
    'SELECT created_at, invoice_status, payment_status FROM invoices WHERE business_id = ? AND claim_id IS NULL ORDER BY created_at', [biz])) {
    add({ at: i.created_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: null, scope,
      what: `An invoice record was opened — ${w(inv, i.invoice_status, i.invoice_status)}, ${w(pay, i.payment_status, i.payment_status)}` });
  }
  for (const a of db.all<{ at: string; detail: string; who: string | null }>(
    'SELECT a.at, a.detail, u.display_name AS who FROM audit_log a JOIN invoices i ON i.id = a.object_id ' +
      "LEFT JOIN users u ON u.id = a.actor_id WHERE a.kind = 'INVOICE_UPDATED' AND i.business_id = ? AND i.claim_id IS NULL ORDER BY a.seq", [biz])) {
    const d = JSON.parse(a.detail) as Record<string, unknown>;
    add({ at: a.at, category: 'FINANCE', audience: 'STAFF_ONLY', who: a.who, scope,
      what: `The invoice was marked ${w(inv, String(d['invoice_status'] ?? ''), 'a state not recorded')}, ${w(pay, String(d['payment_status'] ?? ''), 'a payment state not recorded')}` });
  }
}

function enquiry(db: Db, column: 'claim_id' | 'lead_id', id: string, add: Add, scope: string): void {
  const rows = column === 'claim_id'
    ? db.all<{ recorded_at: string; check_key: string; answer: string; who: string | null }>(
      'SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ? ORDER BY e.recorded_at', [id])
    : db.all<{ recorded_at: string; check_key: string; answer: string; who: string | null }>(
      'SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ? ORDER BY e.recorded_at', [id]);
  for (const e of rows) {
    add({ at: e.recorded_at, category: 'ENQUIRY', audience: 'STAFF_ONLY', who: e.who, scope,
      what: `Enquiry check: ${w(ENQUIRY_CHECKS, e.check_key, e.check_key)} — ${e.answer === 'UNKNOWN' ? 'not known, which does not pass' : e.answer.toLowerCase()}` });
  }
}

function records(db: Db, subject: TimelineSubject, biz: string | null, add: Add, orgScope: string): void {
  type Row = { at: string; kind: string; object_type: string | null; detail: string; who: string | null };
  const rows: Row[] = subject.kind === 'organisation' && biz !== null
    ? db.all<Row>(
      'SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
        "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('ORGANISATION_UPDATED','CONTACT_CREATED','CONTACT_UPDATED','PROPERTY_CREATED'," +
        "'PROPERTY_UPDATED','CLAIM_CREATED','CLAIM_UPDATED','LEAD_CREATED','LEAD_UPDATED','LEAD_CONVERTED','EMAIL_QUEUED') " +
        "AND (a.object_id = ? OR json_extract(a.detail, '$.business') = ?) ORDER BY a.seq", [biz, biz])
    : subject.kind === 'claim'
      ? db.all<Row>(
        'SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
          "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('CLAIM_CREATED','CLAIM_UPDATED','EMAIL_QUEUED') " +
          "AND ((a.object_type = 'claim' AND a.object_id = ?) OR json_extract(a.detail, '$.claim') = ?) ORDER BY a.seq", [subject.id, subject.id])
      : subject.kind === 'property'
        ? db.all<Row>(
          'SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
            "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('PROPERTY_CREATED','PROPERTY_UPDATED') AND a.object_id = ? ORDER BY a.seq", [subject.id])
        : db.all<Row>(
          'SELECT a.at, a.kind, a.object_type, a.detail, u.display_name AS who FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ' +
            "WHERE a.outcome = 'ALLOWED' AND a.kind IN ('LEAD_CREATED','LEAD_UPDATED','LEAD_CONVERTED') AND a.object_id = ? ORDER BY a.seq", [subject.id]);
  for (const r of rows) {
    const detail = JSON.parse(r.detail) as Record<string, unknown>;
    add({ at: r.at, category: 'RECORD', audience: 'STAFF_ONLY', who: r.who ?? (r.kind === 'LEAD_CREATED' ? 'the website' : null),
      scope: subject.kind === 'organisation' ? orgScope : `this ${subject.kind}`,
      what: `${w(RECORD_WORDS, r.kind, r.kind)}${fieldWords(detail)}` });
  }
}

function automation(
  db: Db, subject: TimelineSubject, scope: Scope, add: Add, claimScope: (ref: string) => string, leadScope: string,
): void {
  type Row = { at: string; outcome: string; reason: string | null; tasks_created: number; outbox_id: string | null; label: string; claim_id: string | null; lead_id: string | null };
  const select = 'SELECT r.at, r.outcome, r.reason, r.tasks_created, r.outbox_id, ar.label, r.claim_id, r.lead_id FROM automation_runs r ' +
    'JOIN automation_rules ar ON ar.id = r.rule_id ';
  const rows: Row[] = [];
  for (const c of scope.claims) rows.push(...db.all<Row>(`${select}WHERE r.claim_id = ? ORDER BY r.at`, [c.id]));
  for (const l of scope.leads) rows.push(...db.all<Row>(`${select}WHERE r.lead_id = ? ORDER BY r.at`, [l]));
  if (subject.kind === 'organisation') {
    rows.push(...db.all<Row>(`${select}WHERE r.business_id = ? AND r.claim_id IS NULL AND r.lead_id IS NULL ORDER BY r.at`, [subject.id]));
  }
  const refs = new Map(scope.claims.map((c) => [c.id, c.claim_ref]));
  for (const r of rows) {
    const did = r.outcome === 'RAN'
      ? `ran${r.tasks_created > 0 ? ` — ${r.tasks_created} task${r.tasks_created === 1 ? '' : 's'} created` : ''}${r.outbox_id === null ? '' : ' — a notice waiting to send, not sent yet'}`
      : 'did not run';
    add({ at: r.at, category: 'AUTOMATION', audience: 'STAFF_ONLY', who: 'an automation rule',
      scope: r.claim_id !== null ? claimScope(refs.get(r.claim_id) ?? 'a claim') : r.lead_id !== null ? leadScope : 'the company',
      what: `The rule “${r.label}” ${did}${r.reason === null ? '' : ` — ${w(RUN_REASONS, r.reason, r.reason)}`}` });
  }
}

function tasks(
  db: Db, actor: Actor, subject: TimelineSubject, scope: Scope, add: Add,
  claimScope: (ref: string) => string, leadScope: string, orgScope: string,
): void {
  type Row = {
    id: string; title: string; activity_type: string; origin: string; status: string; owner_id: string | null; owner_role: string | null;
    business_id: string | null; claim_id: string | null; lead_id: string | null; created_at: string; started_at: string | null;
    completed_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
    created_by: string | null; completed_by: string | null; cancelled_by: string | null;
  };
  const select = 'SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, ' +
    't.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, ' +
    'co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by ' +
    'LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by ';
  const rows = subject.kind === 'organisation'
    ? db.all<Row>(`${select}WHERE t.business_id = ? OR t.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY t.created_at`, [subject.id, subject.id])
    : subject.kind === 'claim'
      ? db.all<Row>(`${select}WHERE t.claim_id = ? ORDER BY t.created_at`, [subject.id])
      : subject.kind === 'property'
        ? db.all<Row>(`${select}WHERE t.property_id = ? OR t.claim_id IN (SELECT c.id FROM claims c WHERE c.property_id = ?) ORDER BY t.created_at`, [subject.id, subject.id])
        : db.all<Row>(`${select}WHERE t.lead_id = ? ORDER BY t.created_at`, [subject.id]);
  const refs = new Map(scope.claims.map((c) => [c.id, c.claim_ref]));
  for (const t of rows) {
    if (!can(actor, 'staff_task.read', taskObj(db, t))) continue;
    const where = t.claim_id !== null ? claimScope(refs.get(t.claim_id) ?? 'a claim') : t.lead_id !== null && t.business_id === null ? leadScope : orgScope;
    const kind = (RECIPROCITY_ACTIVITY_TYPES[t.activity_type] ?? vocabLabel(db, 'ACTIVITY_TYPE', t.activity_type, t.activity_type)).toLowerCase();
    add({ at: t.created_at, category: 'TASK', audience: 'STAFF_ONLY', who: t.created_by ?? (t.origin === 'AUTOMATION' ? 'an automation rule' : null),
      scope: where, what: `A task was created — “${t.title}”, a ${kind}, ${w(TASK_ORIGINS, t.origin, t.origin)}` });
    if (t.started_at !== null) add({ at: t.started_at, category: 'TASK', audience: 'STAFF_ONLY', who: null, scope: where, what: `Work started on “${t.title}”` });
    if (t.completed_at !== null) add({ at: t.completed_at, category: 'TASK', audience: 'STAFF_ONLY', who: t.completed_by, scope: where, what: `Task completed — “${t.title}”` });
    if (t.cancelled_at !== null) add({ at: t.cancelled_at, category: 'TASK', audience: 'STAFF_ONLY', who: t.cancelled_by, scope: where, what: `Task cancelled — “${t.title}”: ${t.cancel_reason ?? ''}` });
  }
}

function notesOf(db: Db, subject: TimelineSubject, biz: string): TimelineNote[] {
  type Row = { created_at: string; body: string; who: string | null; claim_ref: string | null; claim_property: string | null; property_label: string | null };
  const select = 'SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, ' +
    "CASE WHEN cp.label LIKE nb.name || ' — %' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, " +
    'p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id ' +
    'LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id ' +
    'LEFT JOIN properties p ON p.id = n.property_id ';
  const rows = subject.kind === 'claim'
    ? db.all<Row>(`${select}WHERE n.business_id = ? AND (n.claim_id = ? OR (n.claim_id IS NULL AND n.property_id IS NULL)) ORDER BY n.created_at DESC`, [biz, subject.id])
    : subject.kind === 'property'
      ? db.all<Row>(`${select}WHERE n.property_id = ? OR n.claim_id IN (SELECT x.id FROM claims x WHERE x.property_id = ?) ORDER BY n.created_at DESC`, [subject.id, subject.id])
      : db.all<Row>(`${select}WHERE n.business_id = ? ORDER BY n.created_at DESC`, [biz]);
  return rows.map((n) => ({
    at: n.created_at, when: localStamp(n.created_at), body: n.body, who: n.who,
    about: n.claim_ref !== null ? claimScopeWords(n.claim_property, n.claim_ref) : n.property_label !== null ? n.property_label : 'the company in general',
  }));
}

/* ================================================================== *
 * A CONTACT'S LAST CONTACT — DERIVED FROM THE TIMELINE (row 5.11)
 * ================================================================== */

export type LastContact = { readonly at: string | null; readonly label: string; readonly source: string | null };

/** THE ONE READING for a contact nobody has a record of contacting — never "0 days", never a date (N4). */
export const NO_CONTACT_RECORDED = 'no contact recorded — nothing on the timeline shows one';

/**
 * The latest of: a COMPLETED call, email or meeting task naming the contact; a
 * message the outbox actually SENT to the contact's address; and a date staff
 * recorded by hand before this was derived, kept as the one thing the timeline
 * cannot re-derive. A cancelled call, a queued-but-unsent email and nothing at
 * all read identically: no contact recorded.
 */
export function lastContactFor(db: Db, c: { id: string; email: string | null; last_contact_at: string | null }): LastContact {
  const task = db.get<{ at: string | null }>(
    "SELECT MAX(completed_at) AS at FROM staff_tasks WHERE contact_id = ? AND status = 'COMPLETED' AND activity_type IN ('CALL','EMAIL','MEETING')",
    [c.id])?.at ?? null;
  const sent = c.email === null ? null : db.get<{ at: string | null }>(
    'SELECT MAX(sent_at) AS at FROM outbox WHERE sent_at IS NOT NULL AND lower(to_email) = lower(?)', [c.email])?.at ?? null;
  const candidates = [
    { at: task, source: 'a completed call, email or meeting task' },
    { at: sent, source: 'an email we sent' },
    { at: c.last_contact_at, source: 'recorded by staff before we worked it out from the timeline' },
  ].filter((x): x is { at: string; source: string } => x.at !== null);
  if (candidates.length === 0) return { at: null, label: NO_CONTACT_RECORDED, source: null };
  const latest = candidates.reduce((a, b) => (b.at > a.at ? b : a));
  const shown = /^\d{4}-\d{2}-\d{2}$/.test(latest.at) ? latest.at : localStamp(latest.at);
  return { at: latest.at, label: `${shown} — ${latest.source}`, source: latest.source };
}
