/**
 * THE CLIENT PORTAL — the five things behind the login.
 *
 * VIEW MODELS ONLY. Every one of these functions takes an ACTOR and returns
 * what that actor may see, and every one of them goes through `authorise`
 * before it reads. Not one of them consults a route name, a role check at the
 * top of a handler, or a hidden field.
 *
 * THE RULE THIS FILE EXISTS TO KEEP: A SCREEN THAT OMITS A FIELD IS
 * PRESENTATION; A STORE THAT REFUSES IT IS A CONTROL. So the refusal happens
 * here, on the object, and the renderer never sees data it should not draw.
 * That is what makes "another client's id in the URL returns a refusal rather
 * than a page" true by construction rather than by remembering.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { STUB_NOTICE } from '../stubs/email.ts';
import { bookingInviteFile } from './booking-invite.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { BOOKING } from './engine.ts';
import { booksATime } from './video-calls.ts';
import { localWhen } from './localtime.ts';
import { CLIENT_MOVE_NOTICE_MINUTES, SLOT_MINUTES, isBookable } from './schedule.ts';
import { claimStage, clientStageFor, progressFor, type Progress } from './stages.ts';
import { RECEIVED_ONLY_BY_UPLOAD, requestsFor, versionObj, type RequestView } from './documents.ts';

export type Business = {
  id: string; name: string; sector: string; stage: string;
  contact_email: string | null; contact_phone: string | null;
  /** Optional so existing fixtures stand. Read so the engagement letter can replace its specimen number. */
  company_number?: string | null;
};

/**
 * The business this actor is asking about, or a refusal.
 *
 * `business.read` for a CLIENT is `isOwnBusiness`, and the object it is asked
 * about is the one that was FETCHED — not the one in the URL. Authorising
 * against an id taken straight from the request would authorise a row nobody
 * had looked up.
 */
export function readBusiness(db: Db, actor: Actor, business_id: string): Business {
  const row = db.get<Business>(
    'SELECT id, name, sector, stage, contact_email, contact_phone, company_number FROM businesses WHERE id = ?',
    [business_id],
  );
  // A MISSING ROW AND A FORBIDDEN ROW MUST LOOK THE SAME FROM OUTSIDE. Telling
  // a caller "no such business" for one id and "not authorised" for another is
  // an enumeration oracle: it confirms which ids exist.
  if (row === undefined) {
    authorise(actor, 'business.read', { type: 'business', id: business_id });
    throw new NotFoundAsRefusal();
  }
  authorise(actor, 'business.read', { type: 'business', id: row.id });
  return row;
}

/** Thrown where the row is absent. Rendered identically to a refusal. */
export class NotFoundAsRefusal extends Error {
  readonly code = 'E_NOT_AUTHORISED';
  constructor() { super('not authorised'); this.name = 'NotFoundAsRefusal'; }
}

/* ------------------------------------------------- 0 · YOUR CLAIMS */

/**
 * PHASE 134 — ONE COMPANY, MANY CLAIMS, ONE PORTAL. A claim as its client sees it: which property, and how far it has
 * got in the portal's own six steps. NEVER the ten staff stages, a hold reason, an exit note, a value, a next action or
 * a person — a hold shows the step the claim returns to, and an exit says only that the claim is closed.
 *
 *   OPEN      at one of the steps; `progress` is that step's bar
 *   FINISHED  the procedure has closed it
 *   CLOSED    it left the procedure by an exit — the client is told by us, in words, why
 *   UNKNOWN   its stage is not one the portal knows; said so, never guessed (N4)
 */
export type PortalClaim = {
  readonly id: string;
  readonly ref: string;
  readonly property: string | null;
  readonly town: string | null;
  readonly state: 'OPEN' | 'FINISHED' | 'CLOSED' | 'UNKNOWN';
  readonly progress: Progress;
};

type PortalClaimRow = {
  id: string; claim_ref: string; business_id: string; stage: string | null; hold_return_stage: string | null;
  property: string | null; town: string | null;
};

const PORTAL_CLAIM_SELECT =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, p.label AS property, p.town FROM claims c ' +
  'LEFT JOIN properties p ON p.id = c.property_id ';

function portalClaim(r: PortalClaimRow): PortalClaim {
  const kind = claimStage(r.stage).kind;
  const base = { id: r.id, ref: r.claim_ref, property: r.property, town: r.town };
  if (kind === 'EXIT') return { ...base, state: 'CLOSED', progress: { known: false, steps: [] } };
  const key = clientStageFor(kind === 'ON_HOLD' ? r.hold_return_stage : r.stage);
  if (key === null) return { ...base, state: 'UNKNOWN', progress: { known: false, steps: [] } };
  return { ...base, state: kind === 'CLOSED' ? 'FINISHED' : 'OPEN', progress: progressFor(key) };
}

/** Every claim of this company, each asked of `claim.progress_read` — a CLIENT only ever their own company's. */
export function claims(db: Db, actor: Actor, business_id: string): PortalClaim[] {
  const b = readBusiness(db, actor, business_id);
  return db.all<PortalClaimRow>(`${PORTAL_CLAIM_SELECT}WHERE c.business_id = ? ORDER BY p.label IS NULL, p.label ASC, c.claim_ref ASC`, [b.id])
    .filter((r) => can(actor, 'claim.progress_read', { type: 'claim', id: r.id, business_id: r.business_id, assigned_surveyor_ids: [] }))
    .map(portalClaim);
}

/**
 * ONE CLAIM, OR NOTHING. A claim that is not this company's is looked for only among this company's own, so another
 * company's claim and a claim that does not exist come back the same — null, and the page answers 404 for both.
 */
export function claim(db: Db, actor: Actor, business_id: string, claim_id: string): PortalClaim | null {
  const b = readBusiness(db, actor, business_id);
  const r = db.get<PortalClaimRow>(`${PORTAL_CLAIM_SELECT}WHERE c.id = ? AND c.business_id = ?`, [claim_id, b.id]);
  if (r === undefined) return null;
  authorise(actor, 'claim.progress_read', { type: 'claim', id: r.id, business_id: r.business_id, assigned_surveyor_ids: [] });
  return portalClaim(r);
}

/* ------------------------------------------------------- 1 · PROGRESS */

export function progress(db: Db, actor: Actor, business_id: string): {
  business: Business; progress: Progress;
} {
  const business = readBusiness(db, actor, business_id);
  return { business, progress: progressFor(business.stage) };
}

/* ------------------------------------- 1b · THE RANGE THEY WERE SHOWN */

export type ShownRangeView = {
  readonly assessment_id: string;
  readonly submitted_at: string;
  readonly low_pence: number | null;
  readonly high_pence: number | null;
};

/**
 * The client's own copy of the figure they were given.
 *
 * IT IS THE SAME COLUMN PAIR THE BACK OFFICE READS, formatted by the same
 * function. Phase 105's brief: "If the staff view and the client view of the
 * same number ever differ, that is a defect, and a test should assert they do
 * not." A number the client can see and a number a staff member quotes on the
 * telephone have to be one number, and the only way to be sure of that is for
 * there to be one.
 *
 * `estimate.read` is the rule, and for a CLIENT it is `ownBusiness`. It is
 * asked here rather than assumed from the fact that they are signed in.
 */
export function shownRange(db: Db, actor: Actor, business_id: string): ShownRangeView | null {
  const b = readBusiness(db, actor, business_id);
  const row = db.get<ShownRangeView>(
    'SELECT id AS assessment_id, submitted_at, shown_low_pence AS low_pence, ' +
      'shown_high_pence AS high_pence FROM assessments WHERE business_id = ? ' +
      'ORDER BY submitted_at DESC LIMIT 1',
    [b.id],
  );
  if (row === undefined) return null;
  authorise(actor, 'estimate.read', { type: 'estimate', id: row.assessment_id, business_id: b.id });
  return row;
}

/* ---------------------------------------------- 2 · THE ENGAGEMENT LETTER */

export type EngagementView = {
  state: 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED';
  signed_at: string | null;
};

export function engagement(db: Db, actor: Actor, business_id: string): EngagementView | null {
  const b = readBusiness(db, actor, business_id);
  const row = db.get<{ id: string; letter_state: string; signed_at: string | null }>(
    'SELECT id, letter_state, signed_at FROM engagements WHERE business_id = ?', [b.id],
  );
  if (row === undefined) return null;
  authorise(actor, 'engagement.read', { type: 'engagement', id: row.id, business_id: b.id });
  return { state: row.letter_state as EngagementView['state'], signed_at: row.signed_at };
}

/**
 * SENT → VIEWED, recorded the first time the client opens it.
 *
 * It is a fact about the contract, not analytics: "when did they see it" is
 * the question a dispute turns on. It never moves a state backwards and it
 * never touches SIGNED.
 */
export function markViewed(db: Db, actor: Actor, business_id: string, now: () => string): void {
  const e = engagement(db, actor, business_id);
  if (e === null || e.state !== 'SENT') return;
  db.run('UPDATE engagements SET letter_state = ? WHERE business_id = ? AND letter_state = ?',
    ['VIEWED', business_id, 'SENT']);
  void now;
}

/* ------------------------------------------------------ 3 · THE APPOINTMENT */

export type BookingView = {
  id: string; channel: string; sms_variant: string | null; entry_point: string;
  starts_at: string | null; ends_at: string | null;
  /** Phase 132e: set once the call is cancelled. The row survives; null on every call still held. */
  cancelled_at: string | null;
};

/**
 * Read from THE SAME booking record the staff calendar reads (Phase 105).
 * One table, one model, no second copy — the phase brief is explicit that a
 * second booking model must not be written and CB_BOOKING is the first one.
 */
export function bookings(db: Db, actor: Actor, business_id: string): BookingView[] {
  const b = readBusiness(db, actor, business_id);
  const rows = db.all<BookingView>(
    'SELECT id, channel, sms_variant, entry_point, starts_at, ends_at, cancelled_at FROM bookings ' +
      'WHERE business_id = ? ORDER BY created_at DESC', [b.id],
  );
  for (const r of rows) {
    authorise(actor, 'booking.read', { type: 'booking', id: r.id, business_id: b.id });
  }
  return rows;
}

/* ----------------------------------------------------------- 4 · TASKS */

export type TaskView = {
  id: string; question: string; why: string; holds_up: string;
  state: string; answer_state: string | null; answer: string | null;
  answered_at: string | null; answered_by_role: string | null;
};

export function tasks(db: Db, actor: Actor, business_id: string): TaskView[] {
  const b = readBusiness(db, actor, business_id);
  // CRM 4 of 10: a document request is a question the client answers by
  // uploading, and the portal draws it beside the upload, not here.
  return db.all<TaskView>(
    'SELECT id, question, why, holds_up, state, answer_state, answer, answered_at, answered_by_role ' +
      "FROM client_tasks WHERE business_id = ? AND state <> ? AND kind = 'QUESTION' ORDER BY created_at ASC",
    [b.id, 'WITHDRAWN'],
  );
}

/** CRM 4 of 10. The client's own document requests, outstanding first. */
export function documentRequests(db: Db, actor: Actor, business_id: string, nowIso: string): RequestView[] {
  const b = readBusiness(db, actor, business_id);
  // A staff role that may read the organisation but not its requests sees the page without them.
  if (!can(actor, 'document_request.read', { type: 'document_request', id: b.id, business_id: b.id })) return [];
  return requestsFor(db, actor, { business_id: b.id }, nowIso);
}

/**
 * The client answers one.
 *
 * TWO THINGS THIS RECORDS THAT A SIMPLER VERSION WOULD LOSE.
 *
 * ONE — `answered_by_role = 'CLIENT'`. An answer typed by a staff member on the
 * client's behalf is a different fact from an answer the client gave, and a
 * claim file that cannot tell them apart cannot be defended. Phase 106 writes
 * 'STAFF' on the other side of the same column.
 *
 * TWO — "I don't know" IS AN ANSWER. It is stored as DONT_KNOW with a null
 * value, never as an empty string, because an empty string reads as unanswered
 * three months later. N4 again, on a screen this time.
 */
export function answerTask(
  db: Db, actor: Actor, business_id: string,
  args: { task_id: string; dont_know: boolean; answer: string },
  now: () => string,
): { ok: boolean; why?: string } {
  const b = readBusiness(db, actor, business_id);
  const row = db.get<{ id: string; business_id: string; state: string; kind: string }>(
    'SELECT id, business_id, state, kind FROM client_tasks WHERE id = ?', [args.task_id],
  );
  if (row === undefined || row.business_id !== b.id) return { ok: false, why: 'not found' };
  // The task belongs to the business; the answer is an answer ABOUT the
  // assessment, so that is the object the rule is asked about.
  authorise(actor, 'answer.read', { type: 'answer', id: row.id, business_id: b.id });
  // CRM 4 of 10: RECEIVED IS NOT A CLICK. The database refuses it too.
  if (row.kind === 'DOCUMENT') return { ok: false, why: RECEIVED_ONLY_BY_UPLOAD };
  if (row.state !== 'OPEN') return { ok: false, why: 'that question is already closed' };

  const text = args.answer.trim();
  if (!args.dont_know && text.length === 0) {
    return { ok: false, why: 'write an answer, or tick “I don’t know”' };
  }
  db.run(
    'UPDATE client_tasks SET state = ?, answer_state = ?, answer = ?, answered_at = ?, ' +
      'answered_by = ?, answered_by_role = ? WHERE id = ?',
    ['ANSWERED', args.dont_know ? 'DONT_KNOW' : 'ANSWERED', args.dont_know ? null : text,
     now(), actor.id, 'CLIENT', row.id],
  );
  return { ok: true };
}

/* --------------------------------------------------------- 5 · DOCUMENTS */

export type DocumentView = {
  id: string; filename: string; declared_type: string | null; doc_type: string | null;
  byte_size: number | null; sniffed_as: string | null; state: string;
  strip_recorded_at: string | null; quarantine_discharged_at: string | null;
  failure_code: string | null; created_at: string;
  /** CRM 4 of 10: what this upload is a version of, and its number. Null for an upload no policy matched. */
  logical_document_id: string | null; version_no: number | null; type_label: string | null; seq: number | null;
  /** PHASE 140: whether the original was kept (KEEP_ORIGINALS, off), and whether it has since been deleted. */
  original_kept_at: string | null; original_deleted_at: string | null;
};

const DOCUMENT_SELECT =
  'SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, ' +
  'd.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, ' +
  'd.original_kept_at, d.original_deleted_at, t.label AS type_label, l.seq FROM documents d LEFT JOIN document_types t ON t.code = d.type_code ' +
  'LEFT JOIN logical_documents l ON l.id = d.logical_document_id ';

export function documents(db: Db, actor: Actor, business_id: string): DocumentView[] {
  const b = readBusiness(db, actor, business_id);
  // CRM 4 of 10: every row is asked of `document.read` on its own document.
  return db.all<DocumentView & { business_id: string }>(
    `${DOCUMENT_SELECT}WHERE d.business_id = ? ORDER BY d.created_at DESC`, [b.id],
  ).filter((r) => { const o = versionObj(db, r.id); return o !== undefined && can(actor, 'document.read', o); });
}

/**
 * ONE document, and THE authorisation check requirement DB-W1 is about.
 *
 * DB-W1-T3: the entitlement is checked for THAT document, on THIS request. There
 * is no cached capability, no per-session grant and no "the list already
 * filtered it" assumption — the row is fetched and `authorise` is called on it
 * every single time, which is why this function exists separately from
 * `documents()` above rather than being a filter over it.
 */
export function document(db: Db, actor: Actor, doc_id: string): DocumentView {
  const row = db.get<DocumentView & { business_id: string }>(`${DOCUMENT_SELECT}WHERE d.id = ?`, [doc_id]);
  if (row === undefined) throw new NotFoundAsRefusal();
  // CRM 4 of 10: ASKED OF THE DOCUMENT, NOT OF ITS ORGANISATION. Until today
  // entitlement to the business was entitlement to its papers — which admitted
  // ACCOUNTING, who holds `business.read` for a client's name, to every lease.
  const o = versionObj(db, row.id);
  if (o === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'document.read', o);
  return row;
}

/**
 * PHASE 144a — THE STEP IN WORDS, where the portal cannot place a claim. It showed the stored step code in a code
 * box; a client reads a sentence instead, and never the code.
 */
export function stageInWords(key: string | null): string {
  if (key === null || key.trim() === '') return 'No step is recorded yet.';
  const r = claimStage(key);
  if (r.kind === 'EXIT') return 'Our records show the claim has stopped.';
  if (r.kind === 'ON_HOLD') return 'Our records show the claim is on hold.';
  if (r.kind === 'UNKNOWN') return 'Our records show a step we do not recognise.';
  return `Our records show the step “${r.label}”.`;
}

/* ============================================================================ *
 * 3b · THE CLIENT MOVES THEIR OWN CALL          Phase 113a, 9 September 2026
 *
 * WHY THIS EXISTS. Phase 105 built the picker at the funnel close and the staff
 * side of moving a booking. The portal showed a client their appointment and
 * gave them no way to change it, so the only route was to telephone us — which
 * is the one thing a portal exists to avoid. A client who cannot move a call
 * does not keep it; they miss it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IT IS BUILT ON WHAT WAS ALREADY THERE, AND THERE IS STILL ONE OF EVERYTHING
 *
 *   THE SLOTS come from `publicSlots` — moments, with the people taken out. A
 *   client must not learn whose diary it is, and the client's own funnel-close
 *   picker already uses that function, so the two cannot drift.
 *
 *   THE WRITE goes through `isBookable` at the moment of writing, which is the
 *   same re-check the staff path makes. The picker is a courtesy; the refusal
 *   is the control. A client who posts a time nobody offered is refused by the
 *   working times, not by the absence of a radio button.
 *
 *   THE RECORD is `booking_changes`, written exactly as a staff move writes it,
 *   with `changed_by` naming the client's own user. The staff booking page
 *   already renders that history and now shows the client's moves in it without
 *   a line of new code — which is the test that this is one mechanism and not
 *   two.
 *
 *   THE ROW is the same row. Nothing here creates a booking; `UPDATE bookings`
 *   is the whole of the mutation, and the staff calendar reads it back.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * TWO DECISIONS THIS JOB HAD TO MAKE — BOTH REVISED BY PHASE 132e
 *
 * Lakhbir, 16 September 2026, answering "How late may a client move their own
 * call, and may they cancel it outright?": "Give the client full control to
 * cancel at any time, and rebook at a time that suits them".
 *
 * 1 · HOW LATE MAY THEY MOVE IT — AT ANY TIME. Until Phase 132e a call inside
 *     two hours could not be moved, released or cancelled here. That refusal is
 *     gone for the call the client already holds. What stays is the rule for the
 *     NEW time a client picks: it must be at least two hours away
 *     (`CLIENT_MOVE_NOTICE_MINUTES` in schedule.ts), so whoever is calling knows
 *     about it. A call that has already passed may be moved to a new time too —
 *     a missed call is exactly the one somebody wants to rebook.
 *
 * 2 · MAY THEY CANCEL — YES, AT ANY TIME, AND THE TIMES COME FIRST. Phase 113a
 *     refused a self-service cancellation on the reasoning that it turns a lead
 *     cold. The decision now belongs to the client. The screen still offers new
 *     times first, then "ring me instead" (`releaseOwnBooking`), and only then
 *     `cancelOwnBooking`. A cancellation KEEPS THE ROW — its time, channel and
 *     entry point — marks it cancelled with who and when, frees the slot, writes
 *     a `booking_changes` row with `cancelled = 1` and an audit line, and moves
 *     NOTHING about the enquiry: no lead, claim or organisation status changes.
 *     The back office's calendar lists it as cancelled. A cancelled call is final
 *     on its row (migration 025).
 * ============================================================================ */

export class BookingMoveError extends Error {
  readonly code = 'E_BOOKING_MOVE';
}

export type MoveDeps = {
  db: Db;
  audit: AuditLog;
  email: EmailTransport;
  now: () => string;
  newId: () => string;
};

/**
 * The booking this client is allowed to act on, or a refusal.
 *
 * AUTHORISED ON THE OBJECT, NOT ON THE ROUTE. The row is fetched, then
 * `booking.move_own` is asked about THAT row — so an id belonging to another
 * business is refused by the rule, and a missing id is refused identically.
 */
function ownBooking(db: Db, actor: Actor, business_id: string, booking_id: string): {
  id: string; business_id: string; channel: string; starts_at: string | null;
  assigned_to: string | null; cancelled_at: string | null;
} {
  const b = readBusiness(db, actor, business_id);
  const row = db.get<{
    id: string; business_id: string; channel: string; starts_at: string | null;
    assigned_to: string | null; cancelled_at: string | null;
  }>(
    'SELECT id, business_id, channel, starts_at, assigned_to, cancelled_at FROM bookings WHERE id = ?',
    [booking_id],
  );
  if (row === undefined || row.business_id !== b.id) throw new NotFoundAsRefusal();
  authorise(actor, 'booking.move_own', { type: 'booking', id: row.id, business_id: b.id });
  return row;
}

/** Minutes from now until `iso`. Negative once it is behind us. */
function minutesUntil(nowIso: string, iso: string): number {
  return (Date.parse(iso) - Date.parse(nowIso)) / 60_000;
}

/**
 * IS THIS NEW TIME TOO SOON FOR THE CLIENT TO CHOOSE IT THEMSELVES? Phase 132e.
 *
 * It replaced `tooLateToMove`, which asked the same arithmetic of the call the
 * client ALREADY held — a refusal Lakhbir lifted on 16 September 2026. Only the
 * new time is asked now. Exported because the SCREEN draws only the times the
 * store would accept.
 */
export function tooSoonForNewTime(nowIso: string, startsAt: string): boolean {
  return minutesUntil(nowIso, startsAt) < CLIENT_MOVE_NOTICE_MINUTES;
}

/** The refusal a client reads for a new time inside the notice period. Exported because a refusal and a screen must agree. */
export const TOO_SOON_FOR_NEW_TIME =
  `Please choose a time at least ${CLIENT_MOVE_NOTICE_MINUTES / 60} hours from now, so ` +
  'that whoever is calling you knows about it. If you need us sooner than that, telephone us.';

/** The sentence for a call that is already cancelled. Nothing further can be done to that row. */
export const ALREADY_CANCELLED =
  'This call has been cancelled, so there is nothing to change. Your enquiry is still open — ' +
  'telephone us, or reply to any message from us, and we will arrange another call.';

/**
 * MOVE IT. The whole mutation, and it is one UPDATE and one history row.
 *
 * NOTHING THROWS ON AN ORDINARY REFUSAL. A time that has gone, a slot somebody
 * else took thirty seconds ago and a call that is now too close are all answers
 * a person reads, not exceptions — the only thing that throws here is a
 * genuine authorisation failure, which is not an ordinary outcome.
 */
export function moveOwnBooking(
  d: MoveDeps, actor: Actor, business_id: string,
  args: { booking_id: string; starts_at: string },
): { ok: true; starts_at: string } | { ok: false; why: string } {
  const before = ownBooking(d.db, actor, business_id, args.booking_id);
  const now = d.now();

  // CB_BOOKING decides which channels hold a moment, and it is asked rather
  // than second-guessed. A client who asked for an email has nothing to move.
  // 30 Sep 2026: a video call holds a time too; its Zoom meeting follows the move (the route reconciles it).
  if (!booksATime(before.channel)) {
    return { ok: false, why: 'Only a telephone or video call holds a specific time, so there is none to move.' };
  }
  if (before.cancelled_at !== null) return { ok: false, why: ALREADY_CANCELLED };
  // Phase 132e: THE CALL THEY HOLD MAY BE MOVED AT ANY TIME, however close or past.
  // THE NEW TIME MAY NOT BE INSIDE THE NOTICE PERIOD. Without this a rebooking
  // could land a call on somebody with no warning at all.
  const t = Date.parse(args.starts_at);
  if (Number.isFinite(t) && tooSoonForNewTime(now, args.starts_at)) {
    return { ok: false, why: TOO_SOON_FOR_NEW_TIME };
  }
  if (args.starts_at === before.starts_at) {
    return { ok: false, why: 'That is the time you already have.' };
  }

  /* THE RE-CHECK. `ignoreBooking` is this booking, so the slot it is vacating
     does not block the move — without it a client could never move to a time
     that overlaps their own call, which is most of the useful ones. */
  const check = isBookable(d.db, args.starts_at, { now, ignoreBooking: before.id });
  if (!check.ok) {
    return {
      ok: false,
      why: check.why === 'that time has been taken'
        ? 'Somebody took that time while this page was open. Please choose another.'
        : `That time cannot be booked: ${check.why}.`,
    };
  }

  const ends = new Date(Date.parse(args.starts_at) + SLOT_MINUTES * 60_000).toISOString();
  d.db.tx(() => {
    d.db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, assigned_to = ? WHERE id = ?',
      [args.starts_at, ends, check.user_id, before.id]);
    d.db.run(
      'INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
        'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), before.id, actor.id, before.starts_at, args.starts_at,
       before.assigned_to, check.user_id, now],
    );
  });

  notify(d, before.business_id, args.starts_at, 'moved',
    { booking_id: before.id, was_starts_at: before.starts_at, was_ends_at: before.starts_at === null ? null : new Date(Date.parse(before.starts_at) + SLOT_MINUTES * 60_000).toISOString() });
  d.audit.append({
    at: now, kind: 'BOOKING_MOVED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'booking', object_id: before.id,
    detail: { field: 'starts_at', moved: true, by: 'CLIENT' },
  });
  return { ok: true, starts_at: args.starts_at };
}

/**
 * GIVE THE TIME BACK, AND KEEP THE ENQUIRY. See decision 2 in the block above.
 *
 * THIS IS NOT A CANCELLATION AND MUST NOT BECOME ONE. The booking row survives,
 * the channel and the entry point survive, and the business is still ours to
 * ring. What goes is the moment — back into the pool, so somebody else can have
 * it — and the call reappears in the back office's "asked for a time and has
 * not got one" list, which is a place a person looks.
 */
export function releaseOwnBooking(
  d: MoveDeps, actor: Actor, business_id: string, args: { booking_id: string },
): { ok: true } | { ok: false; why: string } {
  const before = ownBooking(d.db, actor, business_id, args.booking_id);
  const now = d.now();
  if (before.cancelled_at !== null) return { ok: false, why: ALREADY_CANCELLED };
  if (before.starts_at === null) return { ok: false, why: 'There is no time held for this call.' };
  // Phase 132e: no notice period for giving a time back — at any time.

  d.db.tx(() => {
    d.db.run('UPDATE bookings SET starts_at = NULL, ends_at = NULL, assigned_to = NULL WHERE id = ?',
      [before.id]);
    d.db.run(
      'INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
        'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)',
      [d.newId(), before.id, actor.id, before.starts_at, before.assigned_to, now],
    );
  });

  notify(d, before.business_id, null, 'released',
    { booking_id: before.id, was_starts_at: before.starts_at, was_ends_at: before.starts_at === null ? null : new Date(Date.parse(before.starts_at) + SLOT_MINUTES * 60_000).toISOString() });
  d.audit.append({
    at: now, kind: 'BOOKING_MOVED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'booking', object_id: before.id,
    detail: { field: 'starts_at', moved: true, by: 'CLIENT', released: true },
  });
  return { ok: true };
}

/**
 * CANCEL THE CALL OUTRIGHT. Phase 132e, 16 September 2026 — decision 2 above.
 *
 * AT ANY TIME, whether the call is days away, minutes away, already passed, or
 * still waiting for a time. It is the last of the three things the screen offers,
 * after new times and "ring me instead".
 *
 * WHAT IT DOES: one UPDATE setting `cancelled_at` and `cancelled_by` on the SAME
 * row (the time stays on it, for the record, and no longer holds a slot — see
 * schedule.ts), one `booking_changes` row with `cancelled = 1`, one outbox line
 * (not sent) and one audit line. WHAT IT DOES NOT DO: delete anything, or touch
 * the lead, the claim or the organisation — the enquiry stays open.
 */
export function cancelOwnBooking(
  d: MoveDeps, actor: Actor, business_id: string, args: { booking_id: string },
): { ok: true } | { ok: false; why: string } {
  const before = ownBooking(d.db, actor, business_id, args.booking_id);
  const now = d.now();
  if (before.cancelled_at !== null) return { ok: false, why: ALREADY_CANCELLED };

  d.db.tx(() => {
    d.db.run('UPDATE bookings SET cancelled_at = ?, cancelled_by = ? WHERE id = ?',
      [now, actor.id, before.id]);
    d.db.run(
      'INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
        'from_assigned, to_assigned, at, cancelled) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 1)',
      [d.newId(), before.id, actor.id, before.starts_at, before.assigned_to, now],
    );
  });

  notify(d, before.business_id, null, 'cancelled',
    { booking_id: before.id, was_starts_at: before.starts_at, was_ends_at: before.starts_at === null ? null : new Date(Date.parse(before.starts_at) + SLOT_MINUTES * 60_000).toISOString() });
  d.audit.append({
    at: now, kind: 'BOOKING_CANCELLED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'booking', object_id: before.id,
    detail: { by: 'CLIENT', had_a_time: before.starts_at !== null },
  });
  return { ok: true };
}

/**
 * The outbox line. STUBBED, AND THE ROW SAYS SO — `sent_at` stays NULL and the
 * settings page shows the outbox, so "not sent" is something a person can look
 * at rather than a claim in a footer.
 *
 * IT IS WRITTEN THE SAME WAY THE STAFF PATH WRITES ITS INVITATION, deliberately:
 * when a real transport replaces the stub there is one place that sends a
 * booking message, not two that have to be kept in step.
 */
function notify(
  d: MoveDeps, business_id: string, startsAt: string | null, what: 'moved' | 'released' | 'cancelled',
  call?: { booking_id: string; was_starts_at: string | null; was_ends_at: string | null },
): void {
  const business = d.db.get<{ contact_email: string | null; name: string }>(
    'SELECT contact_email, name FROM businesses WHERE id = ?', [business_id],
  );
  const readable = startsAt === null ? null : localWhen(startsAt);
  /* PHASE 146f: THE INVITATION. Moved: a new REQUEST, the same UID, a higher SEQUENCE, so it replaces the old one in
     the client's calendar. Given back or cancelled: a CANCEL for the time they held. No time held, no invitation. */
  const invite = call === undefined ? null
    : what === 'moved' && startsAt !== null
      ? bookingInviteFile(d.db, d.now, { booking_id: call.booking_id, method: 'REQUEST', starts_at: startsAt,
        ends_at: new Date(Date.parse(startsAt) + SLOT_MINUTES * 60_000).toISOString(), to: business?.contact_email })
      : what !== 'moved' && call.was_starts_at !== null && call.was_ends_at !== null
        ? bookingInviteFile(d.db, d.now, { booking_id: call.booking_id, method: 'CANCEL', starts_at: call.was_starts_at,
          ends_at: call.was_ends_at, to: business?.contact_email })
        : null;
  d.email.send({
    to_email: business?.contact_email ?? 'no-address-recorded@example.invalid',
    subject: what === 'moved'
      ? `Your call with Cap Rebate has been moved — ${readable ?? ''}`
      : what === 'cancelled'
        ? 'Your call with Cap Rebate has been cancelled'
        : 'Your call with Cap Rebate — a new time is needed',
    body: (what === 'moved'
      ? `The client moved this call themselves, through the portal. It is now ${readable}, ` +
        `lasting ${SLOT_MINUTES} minutes.\n\n`
      : what === 'cancelled'
        ? 'The client cancelled this call themselves, through the portal. The enquiry is still ' +
          'open, and the cancelled call is listed in the back office calendar.\n\n'
        : 'The client released the time they held, through the portal, and asked us to arrange ' +
          'another. The enquiry is open and the call is now waiting for a time in the back ' +
          'office calendar.\n\n')
      + STUB_NOTICE,
    kind: 'CALENDAR_INVITE',
    // CRM 1 of 10: named, so a DO_NOT_CONTACT organisation is refused by id.
    business_id,
    ...(invite === null ? {} : { inline_files: [invite] }),
  });
}
