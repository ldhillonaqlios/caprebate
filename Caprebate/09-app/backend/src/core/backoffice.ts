/**
 * THE BACK OFFICE'S GATES: may you enter it, may you open a section, and a missing row read as a refusal. The two
 * sections that were here (filled assessments and the calendar) are the CRM's: src/modules/crm/assessments-and-calendar.ts.
 *
 * VIEW MODELS. The renderer in src/core/staff.ts draws what these return and
 * decides nothing; every authorisation is here, on the specific object, exactly
 * as src/modules/portal/portal.ts does it for the client half.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * N1 REACHES THIS FILE, AND IT IS THE REASON `range` IS OPTIONAL
 *
 * `estimate.read` lists ADMIN, SALES and a CLIENT on their own record. SURVEYING
 * IS DELIBERATELY ABSENT from it — the anchor quarantine, and the one rule this
 * project treats as load-bearing. A surveyor may read the assessment: the
 * client's answers are the INPUTS and withholding them would degrade the work
 * without protecting anything. Our NUMBER is what anchors.
 *
 * SO THE RANGE IS NOT READ WHEN IT MAY NOT BE SHOWN, rather than read and then
 * hidden. `assessmentRow` builds the object forwards from what the actor is
 * entitled to and adds `range` only where `can()` says yes, which is the same
 * discipline src/payload.ts applies to the surveyor payload and for the same
 * reason: build-then-strip is one forgotten key away from leaking, and a new
 * field must be absent by default. A test looks for the figure three ways — by
 * field, by value at any depth, and in the serialised text.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * "I DON'T KNOW" AND "SKIPPED" ARE ANSWERS
 *
 * Both are rows in `assessment_answers` with a STATE, and both are rendered as
 * what they are. The brief: "a skipped question is a fact about the claim, not
 * a blank" and "'I don't know' is a first-class answer throughout this system
 * and must display as one, never as an empty cell". So `answerLabel` returns a
 * sentence for all three states and there is no code path that produces ''.
 */

import { authorise, can, type Actor } from './authz.ts';

export class BackOfficeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackOfficeError';
    this.code = code;
  }
}

/** A missing row and a forbidden row look the same from outside. */
export class NotFoundAsRefusal extends Error {
  readonly code = 'E_NOT_AUTHORISED';
  constructor() { super('not authorised'); this.name = 'NotFoundAsRefusal'; }
}

/**
 * THE COLLECTION GATE — "may you use this section at all", asked as an object
 * question rather than a role question.
 *
 * A per-object rule answers "may you read THIS assessment". It does not answer
 * "may you open the back office's list of every assessment", and those are
 * genuinely different: a CLIENT passes the first on their own record and must
 * fail the second. The lazy way to express that is `if (actor.role === 'CLIENT')`
 * at the top of a handler, which is the role check this application does not
 * have anywhere and is not about to acquire here.
 *
 * So the section is a SENTINEL OBJECT belonging to no business. Every rule that
 * lets a CLIENT through is `ownBusiness`, and no client's business is this, so
 * they are refused by the same table that lets ADMIN and SALES through
 * unconditionally — no new concept, no second mechanism, nothing to keep in
 * step. ACCOUNTING is refused from both sections for the same reason it is
 * refused everywhere else: it is not on those rows.
 */
const STAFF_SECTION = '__staff_section__';

export function assertSection(actor: Actor, action: 'assessment.read' | 'booking.read' | 'booking.write'): void {
  authorise(actor, action, action === 'assessment.read'
    ? { type: 'assessment', id: STAFF_SECTION, business_id: STAFF_SECTION }
    : { type: 'booking', id: STAFF_SECTION, business_id: STAFF_SECTION });
}

/** The back office's front door. See `backoffice.enter` in the rule table. */
export function mayEnterBackOffice(actor: Actor): boolean {
  return can(actor, 'backoffice.enter', { type: 'business', id: STAFF_SECTION });
}

export function assertBackOffice(actor: Actor): void {
  authorise(actor, 'backoffice.enter', { type: 'business', id: STAFF_SECTION });
}

/**
 * The three states in words.
 *
 * The wording is chosen to be readable ALOUD, because the next thing a staff
 * member does with this screen is telephone the client — and "they were not
 * asked this" and "they told us they do not know" lead to two completely
 * different conversations, which a blank cell would collapse into one.
 */
export function answerLabel(state: string, value: string | null): string {
  if (state === 'DONT_KNOW') return 'I don’t know — the client said so';
  if (state === 'SKIPPED') return 'Not answered — this question was skipped';
  return value ?? 'Answered, but no value was recorded';
}

/** Whether this reader may give a call a time or move it — asked of the table, so the screen draws the control only then. */
export function mayArrangeCalls(actor: Actor): boolean {
  return can(actor, 'booking.write', { type: 'booking', id: STAFF_SECTION, business_id: STAFF_SECTION });
}
