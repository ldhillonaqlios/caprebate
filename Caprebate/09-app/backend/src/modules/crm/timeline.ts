/**
 * THE ACTIVITY TIMELINE — A READ OVER WHAT IS ALREADY RECORDED, AND NOT A SECOND
 * LOG. CRM 3 of 10.
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

import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor, type Obj } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { localStamp, localWhen } from '../../shared/index.ts';
import { claimObjFor } from './crm.ts';
import { anyStageLabel } from '../../shared/index.ts';
import { ENQUIRY_CHECKS, MILESTONES, MOVE_WORDS, reasonLabel } from './pipeline.ts';
import { INVOICE_WORDS, PAYMENT_WORDS } from '../finance/index.ts';
import { CREDIT_BASES, INVOICE_KINDS, formatInvoiceNumber } from '../finance/index.ts';
import { RECIPROCITY_ACTIVITY_TYPES, TASK_ORIGINS, taskObj } from './tasks.ts';
import { vocabLabel } from '../admin/index.ts';
import { RUN_REASONS } from './automation.ts';
import { documentObj, versionObj } from '../claims/index.ts';
import { getOutboxAtBySentAt2 } from '../../integrations/index.ts';
import { listAuditLogAtKindByOutcomeKind, listAuditLogAtKindByOutcomeKind2, listAuditLogAtKindByOutcomeKind3, listAuditLogAtKindByOutcomeKind4, listAuditLogAtWhoByKindObjectId } from '../../core/index.ts';
import { getBusinessesIdById, getLeadsIdBusinessIdById, getStaffTasksAtByContactIdStatus, listBookingsIdBusinessIdByBusinessIdLeadId, listBookingsIdBusinessIdByLeadIdId, listContactsIdCreatedAtByLeadId, listLeadsIdByBusinessId, listLeadsIdByClaimId } from './data.ts';
import { listBookingChangesAtFromStartsAtByBookingId, listEnquiryChecksRecordedAtCheckKeyByClaimId, listEnquiryChecksRecordedAtCheckKeyByLeadId } from './data-borrowed.ts';
import { listInvoicesCreatedAtInvoiceStatusByBusinessIdClaimId } from '../finance/index.ts';
import { listSurveyorJobsIdBusinessIdByClaimId, listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3 } from '../survey/index.ts';
import { getEngagementsLetterStateSignedAtByBusinessId2, getPropertiesIdBusinessIdById, listClaimStageMovesAtKindByClaimId, listDocumentEventsAtContractStepByDocId } from '../claims/index.ts';
import { getClaimsIdClaimRefById4, listClaimsIdClaimRefByBusinessId4, listClaimsIdClaimRefByPropertyId } from './data-borrowed.ts';
import { listClientMessageFilesCreatedAtDirectionByMessageIdJO, listClientMessageFilesCreatedAtDirectionByMessageIdJO2, listInternalNotesCreatedAtBodyByBusinessId, listInternalNotesCreatedAtBodyByBusinessIdClaimId, listInternalNotesCreatedAtBodyByPropertyIdClaimId, listStaffTasksIdTitleByBusinessIdLeadId, listStaffTasksIdTitleByClaimId, listStaffTasksIdTitleByLeadId, listStaffTasksIdTitleByPropertyIdClaimId } from './data-borrowed.ts';
import { listAutomationRunsAtOutcomeByBusinessIdClaimId, listAutomationRunsAtOutcomeByClaimId, listAutomationRunsAtOutcomeByLeadId } from './data.ts';
import type { Param, Row } from '../../core/index.ts';
import { listAuditLogAtDetailActorIdByInvoiceUpdatedObjectIds, namesByIds } from '../../core/index.ts';
import { listResearchRunsAtKindActorIdByBusinessId } from '../../integrations/index.ts';
import { listClaimMilestonesRecordedAtMilestoneRecordedByByClaimId, listClaimStageMovesAtKindActorIdByClaimIdOldest } from '../claims/index.ts';
import { listInvoiceCreditNotesRecordedAtBasisRecordedByByInvoiceId, listInvoicePaymentsRecordedAtVoidedAtRecordedByByInvoiceId, listInvoicesIdByBusinessIdWithoutClaim, listInvoicesIdKindRaisedByByClaimId } from '../finance/index.ts';
import { listSurveyorCommitmentsCommittedAtJobIdSurveyorIdByClaimId } from '../survey/index.ts';
import { idsOf } from './data.ts';
import { listOutboxCreatedAtKindClaimIdByBusinessId, listOutboxCreatedAtKindClaimIdByLeadIdBusinessId } from '../../integrations/index.ts';
import { listClaimsIdClaimRefStageByIds } from '../claims/index.ts';
import { byId, listContactsIdFullNameByIds, lookUp } from './data.ts';
import { listDocumentTypesCodeReadersLabelByCodes } from '../admin/index.ts';
import { listDocumentLinksLogicalDocumentIdTypeCodeByBusinessId, listDocumentsIdDeclaredTypeTypeCodeByBusinessId, listDocumentsIdLogicalDocumentIdVersionNoByIds } from '../claims/index.ts';
import { listClientTasksQuestionCreatedAtAskedByByBusinessId } from './data.ts';

export type TimelineSubject = { readonly kind: 'organisation' | 'property' | 'claim' | 'lead'; readonly id: string };

export type Audience = 'CLIENT_SEES' | 'STAFF_ONLY';

export type Category =
  | 'BOOKING' | 'CLIENT_QUESTION' | 'DOCUMENT' | 'ENGAGEMENT' | 'RESEARCH' | 'STAGE' | 'CONFIRMATION' | 'ENQUIRY'
  | 'TASK' | 'SURVEY' | 'FINANCE' | 'OUTBOX' | 'RECORD' | 'AUTOMATION' | 'CONTACT'
  /** A message on the thread with the client. Never a team message — those are the notes, kept apart. */
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
  /** `property_label` names the claim for a person; the reference is only its grey label. */
  readonly claims: readonly { readonly id: string; readonly claim_ref: string; readonly business_id: string; readonly property_label: string | null }[];
  readonly leads: readonly string[];
};

/**
 * A CLAIM IN THE TIMELINE IS NAMED BY ITS PROPERTY. The words a person reads are "Outpatient annexe", and the
 * reference follows as ` · CR-2026-0007` so two claims on one property still read apart; `timelineBlock` draws that tail
 * as a small grey label (src/modules/crm/tasks-pages.ts). A claim with no property is "a claim with no property".
 */
export function claimScopeWords(property_label: string | null, claim_ref: string): string {
  return `${property_label === null || property_label.trim() === '' ? 'a claim with no property' : property_label} · ${claim_ref}`;
}

function resolve(db: Db, actor: Actor, subject: TimelineSubject): { scope: Scope; obj: Extract<Obj, { type: 'timeline' }> } {
  if (subject.kind === 'claim') {
    const c = getClaimsIdClaimRefById4<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(db, [subject.id]);
    if (c === undefined) throw new NotFoundAsRefusal();
    const co = claimObjFor(db, c);
    authorise(actor, 'claim.read', co);
    return {
      scope: { business_id: c.business_id, claims: [c], leads: listLeadsIdByClaimId<{ id: string }>(db, [c.id]).map((r) => r.id) },
      obj: { type: 'timeline', id: c.id, business_id: c.business_id, assigned_surveyor_ids: co.assigned_surveyor_ids },
    };
  }
  if (subject.kind === 'organisation') {
    const b = getBusinessesIdById<{ id: string }>(db, [subject.id]);
    if (b === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'organisation.read', { type: 'business', id: b.id });
    return {
      scope: {
        business_id: b.id,
        claims: listClaimsIdClaimRefByBusinessId4<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(db, [b.id]),
        leads: listLeadsIdByBusinessId<{ id: string }>(db, [b.id]).map((r) => r.id),
      },
      obj: { type: 'timeline', id: b.id, business_id: b.id, assigned_surveyor_ids: [] },
    };
  }
  if (subject.kind === 'property') {
    const p = getPropertiesIdBusinessIdById<{ id: string; business_id: string }>(db, [subject.id]);
    if (p === undefined) throw new NotFoundAsRefusal();
    const surveyors = listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3<{ surveyor_id: string }>(db, [p.business_id]).map((r) => r.surveyor_id);
    authorise(actor, 'property.read', { type: 'property', id: p.id, business_id: p.business_id, assigned_surveyor_ids: surveyors });
    return {
      scope: {
        business_id: p.business_id,
        claims: listClaimsIdClaimRefByPropertyId<{ id: string; claim_ref: string; business_id: string; property_label: string | null }>(db, [p.id]),
        leads: [],
      },
      // A property's timeline reaches beyond any one survey job: an empty list reaches no surveyor.
      obj: { type: 'timeline', id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] },
    };
  }
  const l = getLeadsIdBusinessIdById<{ id: string; business_id: string | null }>(db, [subject.id]);
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
    for (const j of listSurveyorJobsIdBusinessIdByClaimId<{ id: string; business_id: string; surveyor_id: string | null }>(db, [c.id])) {
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
      for (const r of listContactsIdCreatedAtByLeadId<{ id: string; created_at: string }>(db, [subject.id])) {
        if (!can(actor, 'contact.read', { type: 'contact', id: r.id, business_id: null })) continue;
        add({ at: r.created_at, category: 'CONTACT', audience: 'STAFF_ONLY', who: null, scope: leadScope,
          what: 'The person who asked was recorded, with the channel they chose and their consent for it' });
      }
    }
  }
  if (research && biz !== null) {
    for (const r of listResearchRunsAtKindByBusinessId<{ at: string; kind: string; considered: number; fired: number; not_permitted: number; failed: number; who: string | null }>(db, [biz])) {
      add({ at: r.at, category: 'RESEARCH', audience: 'STAFF_ONLY', who: r.who, scope: orgScope,
        what: `${r.kind === 'RETRY' ? 'A failed source was retried' : 'The research was run'}: ${r.considered} sources in all, ${r.fired} looked up, ${r.not_permitted} waiting for a go-ahead, ${r.failed} failed` });
    }
  }
  // THE THREAD WITH THE CLIENT, one line per message — who wrote, and which claim — never the words, which are
  // on the Chat tab. Only for a login that may read that thread.
  if (orgLevel && biz !== null && can(actor, 'client_message.read', { type: 'client_message', id: biz, business_id: biz })) {
    clientMessages(db, subject, biz, add, orgScope, claimScope);
  }
  if (finance && biz !== null) invoices(db, subject.kind, scope.claims, biz, add, orgScope, claimScope);

  for (const c of scope.claims) {
    if (pipelineFull) {
      for (const m of listClaimStageMovesAtKindByClaimId3<{ at: string; kind: string; from_stage: string | null; to_stage: string | null; reason_code: string | null; reason_text: string | null; who: string | null }>(db, [c.id])) {
        const reason = reasonLabel(db, 'CLAIM_EXIT', m.reason_code);
        add({ at: m.at, category: 'STAGE', audience: 'STAFF_ONLY', who: m.who, scope: claimScope(c.claim_ref),
          what: `${w(MOVE_WORDS, m.kind, m.kind)}: ${anyStageLabel(m.from_stage)} → ${anyStageLabel(m.to_stage)}${reason === null ? '' : ` — ${reason}`}${m.reason_text === null ? '' : ` — “${m.reason_text}”`}` });
      }
      for (const m of listClaimMilestonesRecordedAtMilestoneByClaimId<{ recorded_at: string; milestone: string; who: string | null }>(db, [c.id])) {
        const label = Object.hasOwn(MILESTONES, m.milestone) ? MILESTONES[m.milestone as keyof typeof MILESTONES].label : m.milestone;
        add({ at: m.recorded_at, category: 'CONFIRMATION', audience: 'STAFF_ONLY', who: m.who, scope: claimScope(c.claim_ref), what: `Confirmed: ${label}` });
      }
      enquiry(db, 'claim_id', c.id, add, claimScope(c.claim_ref));
    } else if (surveyReach && jobs.some((j) => j.claim_id === c.id)) {
      for (const m of listClaimStageMovesAtKindByClaimId<{ at: string; kind: string; to_stage: string | null }>(db, [c.id])) {
        add({ at: m.at, category: 'STAGE', audience: 'STAFF_ONLY', who: null, scope: claimScope(c.claim_ref),
          what: `${w(MOVE_WORDS, m.kind, m.kind)}: now at ${anyStageLabel(m.to_stage)}` });
      }
    }
    for (const k of listSurveyorCommitmentsCommittedAtJobIdByClaimId<{ committed_at: string; job_id: string; who: string | null }>(db, [c.id])) {
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
    ? listBookingsIdBusinessIdByLeadIdId<{ id: string; business_id: string | null; lead_id: string | null; channel: string; entry_point: string; created_at: string }>(db, [subject.id, subject.id])
    : subject.kind === 'property' || biz === null ? []
      : listBookingsIdBusinessIdByBusinessIdLeadId<{ id: string; business_id: string | null; lead_id: string | null; channel: string; entry_point: string; created_at: string }>(db, [biz, biz]);
  for (const k of rows) {
    if (!can(actor, 'booking.read', { type: 'booking', id: k.id, business_id: k.business_id })) continue;
    const scope = subject.kind === 'lead' ? leadScope : orgScope;
    add({ at: k.created_at, category: 'BOOKING', audience: 'CLIENT_SEES', who: null, scope,
      what: `The client asked for ${w(CHANNEL_WORDS, k.channel, k.channel)} — asked at ${k.entry_point.replace(/_/g, ' ')}` });
    for (const ch of listBookingChangesAtFromStartsAtByBookingId<{ at: string; from_starts_at: string | null; to_starts_at: string | null; who: string | null; cancelled: number }>(db, [k.id])) {
      add({ at: ch.at, category: 'BOOKING', audience: 'CLIENT_SEES', who: ch.who, scope,
        what: ch.cancelled === 1 ? 'The call was cancelled'
          : ch.to_starts_at === null ? 'The call was released back to us with no time'
          : ch.from_starts_at === null ? `The call was given a time: ${localWhen(ch.to_starts_at)}`
            : `The call was moved to ${localWhen(ch.to_starts_at)}` });
    }
  }
}

function clientQuestions(db: Db, biz: string, add: Add, scope: string, subject: TimelineSubject, claimScope: (ref: string) => string): void {
  for (const q of listClientTasksQuestionCreatedAtByBusinessId<{
    question: string; created_at: string; sent_to_portal_at: string | null; answered_at: string | null; answer_state: string | null;
    answered_by_role: string | null; withdrawn_at: string | null; due_on: string | null; asked_by: string | null; answered_by: string | null;
    withdrawn_by: string | null; kind: string; type_label: string | null; claim_id: string | null; claim_ref: string | null;
    received_version: number | null; received_seq: number | null;
  }>(db, [biz])) {
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
  for (const doc of listDocumentsIdDeclaredTypeByBusinessId<{
    id: string; declared_type: string | null; doc_type: string | null; state: string; created_at: string;
    type_label: string | null; seq: number | null; version_no: number | null;
  }>(db, [biz])) {
    // CRM 4 of 10: A DOCUMENT IS ON THE TIMELINE ONLY FOR A READER OF THAT DOCUMENT —
    // Sales does not learn from here that a fee invoice exists.
    const o = versionObj(db, doc.id);
    if (o === undefined || !can(actor, 'document.read', o)) continue;
    const type = doc.type_label !== null && doc.seq !== null
      ? `${doc.type_label} ${doc.seq}, version ${doc.version_no ?? ''}`
      : (doc.doc_type ?? doc.declared_type ?? 'type not given').replace(/_/g, ' ');
    add({ at: doc.created_at, category: 'DOCUMENT', audience: 'CLIENT_SEES', who: null, scope, what: `A document was uploaded — ${type}` });
    for (const e of listDocumentEventsAtContractStepByDocId<{ at: string; contract_step: number; action: string; outcome: string }>(db, [doc.id])) {
      add({ at: e.at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: null, scope,
        what: `Upload step ${e.contract_step} for the ${type}: ${e.action.replace(/_/g, ' ')} — ${e.outcome}` });
    }
  }
}

/** CRM 4 of 10 — a document linked to a claim or a property, and the link ended. Read off `document_links`. */
function documentLinks(db: Db, actor: Actor, subject: TimelineSubject, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  for (const k of listDocumentLinksLogicalDocumentIdBusinessIdByBusinessId<{
    logical_document_id: string; business_id: string; readers: string; carries_value: number; label: string; seq: number;
    claim_id: string | null; claim_ref: string | null; property_label: string | null; linked_at: string; unlinked_at: string | null;
    linked_by: string | null; unlinked_by: string | null;
  }>(db, [biz])) {
    if (!can(actor, 'document.read', documentObj(db, { id: k.logical_document_id, business_id: k.business_id, readers: k.readers, carries_value: k.carries_value }))) continue;
    const target = k.claim_id !== null ? (subject.kind === 'claim' && subject.id === k.claim_id ? 'this claim' : (k.claim_ref === null ? 'a claim' : `the claim on ${claimScope(k.claim_ref)}`)) : `the property ${k.property_label ?? ''}`.trim();
    add({ at: k.linked_at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: k.linked_by, scope, what: `${k.label} ${k.seq} was linked to ${target}` });
    if (k.unlinked_at !== null) {
      add({ at: k.unlinked_at, category: 'DOCUMENT', audience: 'STAFF_ONLY', who: k.unlinked_by, scope, what: `${k.label} ${k.seq} was unlinked from ${target}` });
    }
  }
}

function engagement(db: Db, biz: string, add: Add, scope: string): void {
  const e = getEngagementsLetterStateSignedAtByBusinessId2<{ letter_state: string; signed_at: string | null; created_at: string }>(db, [biz]);
  if (e === undefined) return;
  add({ at: e.created_at, category: 'ENGAGEMENT', audience: 'STAFF_ONLY', who: null, scope, what: 'The engagement letter was raised' });
  if (e.signed_at !== null) add({ at: e.signed_at, category: 'ENGAGEMENT', audience: 'CLIENT_SEES', who: null, scope, what: 'The engagement letter was signed' });
}

/**
 * EVERY EMAIL IS ON THE COMPANY'S TIMELINE, tagged to its claim where one was picked, with who wrote it and
 * who it went to. A lead's emails are on the lead's timeline (`leadOutbox`). An email that was not sent says so.
 */
type OutboxRow = { created_at: string; kind: string; subject: string; sent_at: string | null; claim_ref: string | null; who: string | null; to_name: string | null };

function outboxWhat(o: OutboxRow): string {
  return `${w(OUTBOX_WORDS, o.kind, 'A message')}${o.to_name === null ? '' : ` to ${o.to_name}`}: “${o.subject}” — ${
    o.sent_at === null ? 'saved, not sent' : `sent ${localStamp(o.sent_at)}`}`;
}

function outbox(db: Db, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  for (const o of listOutboxCreatedAtKindByBusinessId<OutboxRow>(db, [biz])) {
    add({ at: o.created_at, category: 'OUTBOX', audience: o.sent_at === null ? 'STAFF_ONLY' : 'CLIENT_SEES', who: o.who,
      scope: o.claim_ref === null ? scope : claimScope(o.claim_ref), what: outboxWhat(o) });
  }
}

/**
 * EVERY MESSAGE ON THE THREAD WITH THE CLIENT IS ON THE COMPANY'S TIMELINE, tagged to its claim where it was.
 * A reply that came by email reads "A reply from <contact>", as the Developer Spec's B48 set it.
 */
function clientMessages(db: Db, subject: TimelineSubject, biz: string, add: Add, scope: string, claimScope: (ref: string) => string): void {
  type Row = { created_at: string; direction: string; source: string; who: string | null; contact: string | null; claim_ref: string | null; files: number };
    const rows = subject.kind === 'claim'
    ? listClientMessageFilesCreatedAtDirectionByMessageIdJO<Row>(db, [biz, subject.id])
    : listClientMessageFilesCreatedAtDirectionByMessageIdJO2<Row>(db, [biz]);
  for (const m of rows) {
    const files = m.files === 0 ? '' : ` — with ${m.files} ${m.files === 1 ? 'file' : 'files'}`;
    const what = m.source === 'EMAIL' ? `A reply from ${m.contact ?? 'the client'}, by email${files}`
      : m.direction === 'FROM_CLIENT' ? `The client sent a message in their portal${files}` : 'We sent the client a message in their portal';
    add({ at: m.created_at, category: 'MESSAGE', audience: 'CLIENT_SEES', who: m.source === 'EMAIL' ? m.contact : m.who,
      scope: m.claim_ref === null ? scope : claimScope(m.claim_ref), what });
  }
}

function leadOutbox(db: Db, lead_id: string, add: Add, scope: string): void {
  for (const o of listOutboxCreatedAtKindByLeadIdBusinessId<OutboxRow>(db, [lead_id])) {
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
    for (const i of listInvoicesIdKindByClaimId<{ id: string; kind: string; created_at: string; cancelled_at: string | null; seq: number | null; raiser: string | null; canceller: string | null }>(db, [c.id])) {
      const number = formatInvoiceNumber(i.seq) ?? 'an unnumbered invoice';
      add({ at: i.created_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: i.raiser, scope,
        what: `Invoice ${number} was raised — ${w(INVOICE_KINDS, i.kind, i.kind)}` });
      if (i.cancelled_at !== null) {
        add({ at: i.cancelled_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: i.canceller, scope,
          what: `Invoice ${number} was cancelled before it was sent, and its number recorded as cancelled` });
      }
      for (const a of listAuditLogAtWhoByKindObjectId<{ at: string; who: string | null }>(db, [i.id])) {
        add({ at: a.at, category: 'FINANCE', audience: 'STAFF_ONLY', who: a.who, scope, what: `Invoice ${number} was recorded as sent` });
      }
      for (const n of listInvoiceCreditNotesRecordedAtBasisByInvoiceId<{ recorded_at: string; basis: string; seq: number | null; who: string | null }>(db, [i.id])) {
        add({ at: n.recorded_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: n.who, scope,
          what: `Credit note ${formatInvoiceNumber(n.seq) ?? ''} was issued against invoice ${number} — ${w(CREDIT_BASES, n.basis, n.basis)}` });
      }
      for (const p of listInvoicePaymentsRecordedAtVoidedAtByInvoiceId<{ recorded_at: string; voided_at: string | null; who: string | null; voider: string | null }>(db, [i.id])) {
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
  for (const i of listInvoicesCreatedAtInvoiceStatusByBusinessIdClaimId<{ created_at: string; invoice_status: string; payment_status: string }>(db, [biz])) {
    add({ at: i.created_at, category: 'FINANCE', audience: 'STAFF_ONLY', who: null, scope,
      what: `An invoice record was opened — ${w(inv, i.invoice_status, i.invoice_status)}, ${w(pay, i.payment_status, i.payment_status)}` });
  }
  for (const a of listAuditLogAtDetailByKindBusinessId<{ at: string; detail: string; who: string | null }>(db, [biz])) {
    const d = JSON.parse(a.detail) as Record<string, unknown>;
    add({ at: a.at, category: 'FINANCE', audience: 'STAFF_ONLY', who: a.who, scope,
      what: `The invoice was marked ${w(inv, String(d['invoice_status'] ?? ''), 'a state not recorded')}, ${w(pay, String(d['payment_status'] ?? ''), 'a payment state not recorded')}` });
  }
}

function enquiry(db: Db, column: 'claim_id' | 'lead_id', id: string, add: Add, scope: string): void {
  const rows = column === 'claim_id'
    ? listEnquiryChecksRecordedAtCheckKeyByClaimId<{ recorded_at: string; check_key: string; answer: string; who: string | null }>(db, [id])
    : listEnquiryChecksRecordedAtCheckKeyByLeadId<{ recorded_at: string; check_key: string; answer: string; who: string | null }>(db, [id]);
  for (const e of rows) {
    add({ at: e.recorded_at, category: 'ENQUIRY', audience: 'STAFF_ONLY', who: e.who, scope,
      what: `Enquiry check: ${w(ENQUIRY_CHECKS, e.check_key, e.check_key)} — ${e.answer === 'UNKNOWN' ? 'not known, which does not pass' : e.answer.toLowerCase()}` });
  }
}

function records(db: Db, subject: TimelineSubject, biz: string | null, add: Add, orgScope: string): void {
  type Row = { at: string; kind: string; object_type: string | null; detail: string; who: string | null };
  const rows: Row[] = subject.kind === 'organisation' && biz !== null
    ? listAuditLogAtKindByOutcomeKind3<Row>(db, [biz, biz])
    : subject.kind === 'claim'
      ? listAuditLogAtKindByOutcomeKind<Row>(db, [subject.id, subject.id])
      : subject.kind === 'property'
        ? listAuditLogAtKindByOutcomeKind4<Row>(db, [subject.id])
        : listAuditLogAtKindByOutcomeKind2<Row>(db, [subject.id]);
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
    const rows: Row[] = [];
  for (const c of scope.claims) rows.push(...listAutomationRunsAtOutcomeByClaimId<Row>(db, [c.id]));
  for (const l of scope.leads) rows.push(...listAutomationRunsAtOutcomeByLeadId<Row>(db, [l]));
  if (subject.kind === 'organisation') {
    rows.push(...listAutomationRunsAtOutcomeByBusinessIdClaimId<Row>(db, [subject.id]));
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
    const rows = subject.kind === 'organisation'
    ? listStaffTasksIdTitleByBusinessIdLeadId<Row>(db, [subject.id, subject.id])
    : subject.kind === 'claim'
      ? listStaffTasksIdTitleByClaimId<Row>(db, [subject.id])
      : subject.kind === 'property'
        ? listStaffTasksIdTitleByPropertyIdClaimId<Row>(db, [subject.id, subject.id])
        : listStaffTasksIdTitleByLeadId<Row>(db, [subject.id]);
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
    const rows = subject.kind === 'claim'
    ? listInternalNotesCreatedAtBodyByBusinessIdClaimId<Row>(db, [biz, subject.id])
    : subject.kind === 'property'
      ? listInternalNotesCreatedAtBodyByPropertyIdClaimId<Row>(db, [subject.id, subject.id])
      : listInternalNotesCreatedAtBodyByBusinessId<Row>(db, [biz]);
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
  const task = getStaffTasksAtByContactIdStatus<{ at: string | null }>(db, [c.id])?.at ?? null;
  const sent = c.email === null ? null : getOutboxAtBySentAt2<{ at: string | null }>(db, [c.email])?.at ?? null;
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

// THE CRM'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1): its own rows and the other area's, read
// through that area's front door and put together here as the old join did (test/crm/borrowed-split.test.ts).
export function listResearchRunsAtKindByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listResearchRunsAtKindActorIdByBusinessId<Row & { actor_id: unknown }>(db, params);
  const name = namesByIds(db, rows.map((r) => r.actor_id));
  return rows.map(({ actor_id, ...r }) => ({ ...r, who: name(actor_id) })) as unknown as T[];
}
export function listClaimMilestonesRecordedAtMilestoneByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listClaimMilestonesRecordedAtMilestoneRecordedByByClaimId<Row & { recorded_by: unknown }>(db, params);
  const name = namesByIds(db, rows.map((r) => r.recorded_by));
  return rows.map(({ recorded_by, ...r }) => ({ ...r, who: name(recorded_by) })) as unknown as T[];
}
export function listClaimStageMovesAtKindByClaimId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listClaimStageMovesAtKindActorIdByClaimIdOldest<Row & { actor_id: unknown }>(db, params);
  const name = namesByIds(db, rows.map((r) => r.actor_id));
  return rows.map(({ actor_id, ...r }) => ({ ...r, who: name(actor_id) })) as unknown as T[];
}
export function listInvoiceCreditNotesRecordedAtBasisByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listInvoiceCreditNotesRecordedAtBasisRecordedByByInvoiceId<Row & { recorded_by: unknown }>(db, params);
  const name = namesByIds(db, rows.map((r) => r.recorded_by));
  return rows.map(({ recorded_by, ...r }) => ({ ...r, who: name(recorded_by) })) as unknown as T[];
}
export function listInvoicePaymentsRecordedAtVoidedAtByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listInvoicePaymentsRecordedAtVoidedAtRecordedByByInvoiceId<Row & { recorded_by: unknown; voided_by: unknown }>(db, params);
  const name = namesByIds(db, rows.flatMap((r) => [r.recorded_by, r.voided_by]));
  return rows.map(({ recorded_by, voided_by, ...r }) => ({ ...r, who: name(recorded_by), voider: name(voided_by) })) as unknown as T[];
}
export function listInvoicesIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listInvoicesIdKindRaisedByByClaimId<Row & { raised_by: unknown; cancelled_by: unknown }>(db, params);
  const name = namesByIds(db, rows.flatMap((r) => [r.raised_by, r.cancelled_by]));
  return rows.map(({ raised_by, cancelled_by, ...r }) => ({ ...r, raiser: name(raised_by), canceller: name(cancelled_by) })) as unknown as T[];
}
export function listAuditLogAtDetailByKindBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  // The changes to the company's own invoices (no claim): the invoices from finance, their changes from the audit log.
  const invoices = listInvoicesIdByBusinessIdWithoutClaim<{ id: unknown }>(db, params);
  if (invoices.length === 0) return [];
  const rows = listAuditLogAtDetailActorIdByInvoiceUpdatedObjectIds<Row & { actor_id: unknown }>(db, [idsOf(invoices.map((i) => i.id))]);
  const name = namesByIds(db, rows.map((r) => r.actor_id));
  return rows.map(({ actor_id, ...r }) => ({ ...r, who: name(actor_id) })) as unknown as T[];
}
export function listSurveyorCommitmentsCommittedAtJobIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listSurveyorCommitmentsCommittedAtJobIdSurveyorIdByClaimId<Row & { surveyor_id: unknown }>(db, params);
  const name = namesByIds(db, rows.map((r) => r.surveyor_id));
  return rows.map(({ surveyor_id, ...r }) => ({ ...r, who: name(surveyor_id) })) as unknown as T[];
}

// THE CRM'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1): its own rows and the other area's, read
// through that area's front door and put together here as the old join did (test/crm/borrowed-split.test.ts).
export function listOutboxCreatedAtKindByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return outboxLines(db, listOutboxCreatedAtKindClaimIdByBusinessId(db, params)) as unknown as T[];
}
export function listOutboxCreatedAtKindByLeadIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return outboxLines(db, listOutboxCreatedAtKindClaimIdByLeadIdBusinessId(db, params)) as unknown as T[];
}
/** The timeline's lines for emails sent: the claim's reference, the writer's name and the person it went to, each null when not there. */
function outboxLines(db: Db, rows: readonly { created_at: unknown; kind: unknown; subject: unknown; sent_at: unknown; claim_id: unknown; written_by: unknown; contact_id: unknown }[]): Row[] {
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(rows.map((r) => r.claim_id))]));
  const contacts = byId(listContactsIdFullNameByIds<{ id: string; full_name: unknown }>(db, [idsOf(rows.map((r) => r.contact_id))]));
  const name = namesByIds(db, rows.map((r) => r.written_by));
  return rows.map((o) => ({ created_at: o.created_at, kind: o.kind, subject: o.subject, sent_at: o.sent_at, claim_ref: lookUp(claims, o.claim_id)?.claim_ref ?? null,
    who: name(o.written_by), to_name: lookUp(contacts, o.contact_id)?.full_name ?? null }));
}

// THE CRM'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1): its own rows and the other area's, read
// through that area's front door and put together here as the old join did (test/crm/borrowed-split.test.ts).
export function listClientTasksQuestionCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const tasks = listClientTasksQuestionCreatedAtAskedByByBusinessId<Row & { asked_by: unknown; answered_by: unknown; withdrawn_by: unknown; requested_type: unknown; claim_id: unknown; received_document_id: unknown }>(db, params);
  const name = namesByIds(db, tasks.flatMap((t) => [t.asked_by, t.answered_by, t.withdrawn_by]));
  const types = new Map(listDocumentTypesCodeReadersLabelByCodes<{ code: string; label: unknown }>(db, [idsOf(tasks.map((t) => t.requested_type))]).map((d) => [d.code, d]));
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(tasks.map((t) => t.claim_id))]));
  const documents = byId(listDocumentsIdLogicalDocumentIdVersionNoByIds<{ id: string; version_no: unknown; seq: unknown }>(db, [idsOf(tasks.map((t) => t.received_document_id))]));
  return tasks.map((t) => {
    const d = lookUp(documents, t.received_document_id);
    return { question: t.question, created_at: t.created_at, sent_to_portal_at: t.sent_to_portal_at, answered_at: t.answered_at, answer_state: t.answer_state,
      answered_by_role: t.answered_by_role, withdrawn_at: t.withdrawn_at, due_on: t.due_on, asked_by: name(t.asked_by), answered_by: name(t.answered_by),
      withdrawn_by: name(t.withdrawn_by), kind: t.kind, type_label: lookUp(types, t.requested_type)?.label ?? null, claim_id: t.claim_id,
      claim_ref: lookUp(claims, t.claim_id)?.claim_ref ?? null, received_version: d?.version_no ?? null, received_seq: d?.seq ?? null };
  }) as unknown as T[];
}
export function listDocumentLinksLogicalDocumentIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const links = listDocumentLinksLogicalDocumentIdTypeCodeByBusinessId<Row & { type_code: unknown; linked_by: unknown; unlinked_by: unknown }>(db, params);
  const types = new Map(listDocumentTypesCodeReadersLabelByCodes<{ code: string; readers: unknown; carries_value: unknown; label: unknown }>(db, [idsOf(links.map((k) => k.type_code))]).map((d) => [d.code, d]));
  const name = namesByIds(db, links.flatMap((k) => [k.linked_by, k.unlinked_by]));
  const rows: Row[] = [];
  for (const k of links) {
    const t = lookUp(types, k.type_code);
    if (t === undefined) continue; // JOIN document_types
    rows.push({ logical_document_id: k.logical_document_id, business_id: k.business_id, readers: t.readers, carries_value: t.carries_value, label: t.label, seq: k.seq,
      claim_id: k.claim_id, claim_ref: k.claim_ref, property_label: k.property_label, linked_at: k.linked_at, unlinked_at: k.unlinked_at,
      linked_by: name(k.linked_by), unlinked_by: name(k.unlinked_by) });
  }
  return rows as unknown as T[];
}
export function listDocumentsIdDeclaredTypeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const documents = listDocumentsIdDeclaredTypeTypeCodeByBusinessId<{ id: unknown; declared_type: unknown; doc_type: unknown; state: unknown; created_at: unknown; type_code: unknown; seq: unknown; version_no: unknown }>(db, params);
  const types = new Map(listDocumentTypesCodeReadersLabelByCodes<{ code: string; label: unknown }>(db, [idsOf(documents.map((d) => d.type_code))]).map((t) => [t.code, t]));
  return documents.map((d) => ({ id: d.id, declared_type: d.declared_type, doc_type: d.doc_type, state: d.state, created_at: d.created_at,
    type_label: lookUp(types, d.type_code)?.label ?? null, seq: d.seq, version_no: d.version_no })) as unknown as T[];
}
