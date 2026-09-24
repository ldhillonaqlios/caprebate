/**
 * can(actor, action, object) — the single authorisation function.
 *
 * EVERY REQUEST GOES THROUGH IT, and it takes THE SPECIFIC OBJECT, not just a
 * type. "May this user read THIS assessment" is the question. "May sales read
 * assessments" is not, and answering the second one is how a back office ends
 * up serving one client's papers to another.
 *
 * A SCREEN THAT OMITS A FIELD IS PRESENTATION. A STORE THAT REFUSES IT IS A
 * CONTROL. That difference is the entire point of this phase, and it is why
 * nothing here consults a UI, a route name, or a hidden form field.
 *
 * DENY BY DEFAULT, AND IT IS STRUCTURAL RATHER THAN PROMISED. `can` cannot
 * return true without finding a rule: no rule for the action, no rule for the
 * role, or a predicate returning false all end at the same `return false`.
 * A new route with no rule fails closed. There is a test that registers
 * nothing and asserts the refusal, so this cannot rot into a comment.
 */

import { DPO_ROLE, type AppRole } from './roles.ts';
import { customRoleOf, type BorrowableRole } from './custom-roles.ts';

export type Actor = {
  readonly id: string;
  readonly role: AppRole;
  /** Set for CLIENT only: the one business they may reach. */
  readonly business_id: string | null;
  readonly disabled: boolean;
};

/**
 * The object being acted on. `business_id` is what almost every rule turns on,
 * so it is required on every object type that has one — a rule cannot silently
 * skip the ownership check because the field happened to be absent.
 */
export type Obj =
  | { readonly type: 'user'; readonly id: string; readonly role: AppRole }
  /** Phase 151: a role the super admin made, or 'new' before it exists. */
  | { readonly type: 'role'; readonly id: string }
  | { readonly type: 'business'; readonly id: string }
  | { readonly type: 'assessment'; readonly id: string; readonly business_id: string }
  | { readonly type: 'answer'; readonly id: string; readonly business_id: string }
  | { readonly type: 'estimate'; readonly id: string; readonly business_id: string }
  | { readonly type: 'invoice'; readonly id: string; readonly business_id: string }
  | { readonly type: 'internal_note'; readonly id: string; readonly business_id: string }
  | { readonly type: 'register_record'; readonly id: string; readonly business_id: string }
  | { readonly type: 'research'; readonly id: string; readonly business_id: string }
  /** Phase 139: what staff have checked for a company and told its client — the approvals and the steps. */
  | { readonly type: 'client_steps'; readonly id: string; readonly business_id: string }
  /**
   * A booking's organisation is null only while it belongs to a lead that has
   * none yet — a call asked for at the reasoned negative (migration 011). A
   * CLIENT's `ownBusiness` is then false, which is right: nobody's portal holds it.
   */
  | { readonly type: 'booking'; readonly id: string; readonly business_id: string | null }
  | { readonly type: 'engagement'; readonly id: string; readonly business_id: string }
  | {
      readonly type: 'surveyor_job';
      readonly id: string;
      readonly business_id: string;
      /** The surveyor this job is assigned to. null means unassigned. */
      readonly surveyor_id: string | null;
    }
  | { readonly type: 'audit'; readonly id: string }
  | { readonly type: 'working_time'; readonly id: string; readonly user_id: string }
  /**
   * CRM 1 of 10. The client's own contacts, a property, and the claim record.
   *
   * `assigned_surveyor_ids` IS HOW A SURVEYOR REACHES A PROPERTY OR A CLAIM, AND
   * THE ONLY WAY. It is the set of surveyors holding a survey job that covers the
   * object — for a property, a job on its organisation; for a claim, a job on
   * that claim's own assessment — computed by src/web/crm.ts from
   * `surveyor_jobs`, exactly as `surveyor_id` above is read from the job row.
   * `claims.surveyor_id` is deliberately NOT consulted: naming a surveyor on a
   * claim is a record, not an access grant. An empty list reaches nobody.
   */
  | { readonly type: 'contact'; readonly id: string; readonly business_id: string | null }
  | {
      readonly type: 'property';
      readonly id: string;
      readonly business_id: string;
      readonly assigned_surveyor_ids: readonly string[];
    }
  | {
      readonly type: 'claim';
      readonly id: string;
      readonly business_id: string;
      readonly assigned_surveyor_ids: readonly string[];
    }
  /**
   * CRM 2 of 10. A lead, whose organisation may not exist yet — a referral is a
   * lead before anybody has created the organisation it is about — and the
   * pipeline board, which is a view over claims and has no organisation at all.
   */
  | { readonly type: 'lead'; readonly id: string; readonly business_id: string | null }
  | { readonly type: 'pipeline'; readonly id: string }
  /**
   * CRM 3 of 10. A staff task, the activity timeline, an automation rule, an
   * email template, and a merged email queued to the outbox.
   *
   * A TASK CARRIES ITS OWNER AND THE TEAM IT WAITS WITH. `owner_role` is set only
   * while nobody has taken the task. `assigned_surveyor_ids` is the task's claim's,
   * read off the survey jobs exactly as a claim's is, so a surveyor reaches their
   * own task on an assigned job and nothing else.
   *
   * A TIMELINE'S `assigned_surveyor_ids` is the claim's for a claim's timeline and
   * EMPTY for every other — an organisation's, a property's or a lead's timeline
   * reaches beyond any one survey job, and an empty list reaches nobody.
   */
  | {
      readonly type: 'staff_task';
      readonly id: string;
      readonly business_id: string | null;
      readonly owner_id: string | null;
      readonly owner_role: string | null;
      readonly assigned_surveyor_ids: readonly string[];
    }
  | {
      readonly type: 'timeline';
      readonly id: string;
      readonly business_id: string | null;
      readonly assigned_surveyor_ids: readonly string[];
    }
  | { readonly type: 'automation_rule'; readonly id: string }
  | { readonly type: 'email_template'; readonly id: string }
  | { readonly type: 'email'; readonly id: string; readonly business_id: string }
  /**
   * CRM 4 of 10. A document — the logical document, whose uploads are its
   * versions — a document type, and a document request.
   *
   * A DOCUMENT CARRIES WHAT ITS READING TURNS ON, READ OFF ITS TYPE AND ITS
   * CLAIMS BY src/web/documents.ts: who its type admits (`readers`), whether the
   * type can hold a claim value, a tax benefit or a fee (`carries_value`, N1),
   * whether the organisation's engagement letter is signed, and the surveyors
   * holding a job on a claim the document is linked to — or, for a document
   * linked to no claim, on its organisation, as a surveyor's evidence always was.
   */
  | {
      readonly type: 'document';
      readonly id: string;
      readonly business_id: string;
      readonly readers: string;
      readonly carries_value: boolean;
      readonly letter_signed: boolean;
      readonly assigned_surveyor_ids: readonly string[];
      /** CRM 6 of 10: an issued client report whose figure is released — see `clientDocument`. Absent is not true. */
      readonly released_to_client?: boolean;
      /**
       * PHASE 140: whether the client may see this file at all — theirs if they sent it, ours only once staff say so. Read by
       * src/web/documents.ts (`shownToClient`). Absent is not true: a client is refused a document that does not say.
       */
      readonly shown_to_client?: boolean;
    }
  | { readonly type: 'document_type'; readonly id: string }
  | { readonly type: 'document_request'; readonly id: string; readonly business_id: string }
  /**
   * CRM 5 of 10. An introducing firm; the client's opt-in to share progress with
   * it, whose organisation is null while the client is a lead with none; the one
   * reward setting; and a model-B fee, which is on a claim and so on its
   * organisation. None of them has a person in it, and none of them leads to a login.
   */
  | { readonly type: 'introducer'; readonly id: string }
  | { readonly type: 'share_consent'; readonly id: string; readonly business_id: string | null }
  | { readonly type: 'introducer_reward'; readonly id: string }
  | { readonly type: 'introducer_fee'; readonly id: string; readonly business_id: string }
  /**
   * CRM 6 of 10. The claim's capital allowances facts — which a surveyor on an
   * assigned job reaches only as the RELEASED inputs, through src/payload.ts, and
   * so the object carries the job's reach — the claim's figures, sign-off and
   * reconciliation, a deliverable, and an HMRC enquiry.
   *
   * A DELIVERABLE CARRIES WHAT ITS CLIENT RELEASE TURNS ON, read by
   * src/web/claim-record.ts: its kind, its state, and whether the claim's figure
   * is released — the tax adviser's sign-off record exists.
   */
  | {
      readonly type: 'claim_facts';
      readonly id: string;
      readonly business_id: string;
      readonly assigned_surveyor_ids: readonly string[];
    }
  | { readonly type: 'claim_figures'; readonly id: string; readonly business_id: string }
  | {
      readonly type: 'deliverable';
      readonly id: string;
      readonly business_id: string;
      readonly kind: string;
      readonly state: string;
      readonly figure_released: boolean;
    }
  | { readonly type: 'hmrc_enquiry'; readonly id: string; readonly business_id: string }
  /**
   * CRM 8 of 10. A compliance register or an entry in one — due diligence, a
   * rights request, a complaint, a breach, a hold, a consent history, the
   * retention list — and, separately, a person in S2, the identity store. The
   * identity store is its own object so that no rule on a register can reach it.
   */
  | { readonly type: 'compliance'; readonly id: string }
  | { readonly type: 'identity_person'; readonly id: string }
  /**
   * CRM 9 of 10. A saved view of a list: whose it is, and whether it is shared. A person keeps their own; a
   * shared view is set, and retired, by ADMIN (migration 018 holds both by trigger as well).
   */
  | { readonly type: 'saved_view'; readonly id: string; readonly owner_id: string; readonly shared: boolean }
  /** CRM 9 of 10. The admin settings screen: the configurable lists and the reasons. Nothing on it reaches a rule. */
  | { readonly type: 'configuration'; readonly id: string }
  /**
   * PHASE 142. A message on a company's "With the client" thread — the portal's Messages — and a reply that reached
   * contact@caprebate.co.uk. The "Team only" thread is the company's internal notes and stays `internal_note`: a
   * DIFFERENT object type in a DIFFERENT table, so no rule written for one can reach the other.
   */
  | { readonly type: 'client_message'; readonly id: string; readonly business_id: string; readonly assigned_surveyor_ids?: readonly string[] }
  | { readonly type: 'inbound_email'; readonly id: string };

export type ObjType = Obj['type'];

/** Narrow a rule to one object type without a cast at the call site. */
type Rule<T extends ObjType> = (actor: Actor, object: Extract<Obj, { type: T }>) => boolean;

/* ------------------------------------------------------------------ *
 * The predicates the rules are built from. Named, so a rule table reads
 * as sentences and a reviewer can check it without tracing logic.
 * ------------------------------------------------------------------ */

const always = (): boolean => true;

/** The actor's own business. Only ever true for a CLIENT, who alone has one. */
const ownBusiness = (a: Actor, o: { business_id: string | null }): boolean =>
  a.business_id !== null && a.business_id === o.business_id;

/**
 * The same test for the BUSINESS object itself, whose own id IS the business
 * id — it has no `business_id` field.
 *
 * This needs saying because the first version of this table used `ownBusiness`
 * here and it silently returned false for every client: `o.business_id` was
 * undefined, `undefined === <id>` is false, and a rule that refuses everything
 * looks exactly like a rule that is working. The role test caught it. A
 * predicate reading a field the object does not have is the failure mode to
 * watch for whenever a new object type joins the union above.
 */
const isOwnBusiness = (a: Actor, o: { id: string }): boolean =>
  a.business_id !== null && a.business_id === o.id;

/** The surveyor this job is assigned to. An UNASSIGNED job is nobody's. */
const assignedSurveyor = (a: Actor, o: { surveyor_id: string | null }): boolean =>
  o.surveyor_id !== null && o.surveyor_id === a.id;

const self = (a: Actor, o: { id: string }): boolean => a.id === o.id;

/** A user's own working times. Feeds the booking system, so it is not cosmetic. */
const ownWorkingTime = (a: Actor, o: { user_id: string }): boolean => a.id === o.user_id;

/**
 * A surveyor holding a survey job that covers this property or claim. CRM 1 of
 * 10. The same shape as `assignedSurveyor`: an object with nobody assigned is
 * nobody's, and the list is read off the job rows, never off the claim.
 */
const throughAssignedJob = (a: Actor, o: { assigned_surveyor_ids: readonly string[] }): boolean =>
  // FAILS CLOSED on an object that does not carry the list — the failure mode
  // the note on `isOwnBusiness` warns about, where a predicate reading a field
  // the object lacks must refuse and never throw.
  Array.isArray(o.assigned_surveyor_ids) && o.assigned_surveyor_ids.includes(a.id);

/**
 * A task the actor owns, or one waiting with the actor's own team while nobody
 * has taken it. CRM 3 of 10. FAILS CLOSED on an object without the two fields:
 * `undefined` is neither the actor's id nor null.
 */
const ownOrPooledTask = (a: Actor, o: { owner_id: string | null; owner_role: string | null }): boolean =>
  (o.owner_id !== null && o.owner_id !== undefined && o.owner_id === a.id)
  || (o.owner_id === null && o.owner_role !== null && o.owner_role !== undefined && o.owner_role === a.role);

/** The same, AND on a claim an assigned survey job reaches. A surveyor's task is nothing outside that job. */
const ownTaskOnAssignedJob = (
  a: Actor, o: { owner_id: string | null; owner_role: string | null; assigned_surveyor_ids: readonly string[] },
): boolean => ownOrPooledTask(a, o) && throughAssignedJob(a, o);

/**
 * WHO READS WHICH DOCUMENT. CRM 4 of 10. Every one FAILS CLOSED on an object
 * without the fields: `undefined` is none of the reader classes, and
 * `carries_value === false` is false for an object that does not say.
 */
type DocumentFacts = {
  readers: string; carries_value: boolean; letter_signed: boolean; assigned_surveyor_ids: readonly string[];
  /**
   * CRM 6 of 10. True only for a capital allowances report that is an ISSUED
   * client report on a claim whose tax adviser's sign-off record exists — read by
   * src/web/documents.ts. Absent on every other document, and absent is not true.
   */
  released_to_client?: boolean;
  /** PHASE 140: see the `document` object. Absent is not true. */
  shown_to_client?: boolean;
};

/** Sales works the claim: its evidence, its team's papers and the letter. Not the fee invoice — `invoice.read` is not Sales's. */
const salesDocument = (_a: Actor, o: DocumentFacts): boolean =>
  o.readers === 'CLAIM_EVIDENCE' || o.readers === 'CLAIM_TEAM' || o.readers === 'ENGAGEMENT_LETTER';

/** "ACCOUNTING reads invoices and the signed letter only." */
const accountingDocument = (_a: Actor, o: DocumentFacts): boolean =>
  o.readers === 'FINANCE' || (o.readers === 'ENGAGEMENT_LETTER' && o.letter_signed === true);

/** "SURVEYING reads the documents of an assigned job only and never the letter's fee terms." N1 twice: the class, and the value. */
const surveyorDocument = (a: Actor, o: DocumentFacts): boolean =>
  o.readers === 'CLAIM_EVIDENCE' && o.carries_value === false && throughAssignedJob(a, o);

/**
 * The client, on their own organisation's documents — but not a document that can
 * state a claim value before the tax adviser has signed it off. Their own letter
 * and their own invoice, which carry the fee they agreed, they read.
 */
const clientDocument = (a: Actor, o: DocumentFacts & { business_id: string }): boolean =>
  ownBusiness(a, o) && (
    // PHASE 140: and never a file staff have not chosen to show them. A file the client sent is shown to them by rule.
    (o.shown_to_client === true && (o.carries_value === false || o.readers === 'FINANCE' || o.readers === 'ENGAGEMENT_LETTER'))
    // CRM 6 of 10: the issued client report, once the tax adviser's sign-off record exists, and nothing else. The release IS
    // the decision to show it, so it is not asked a second time.
    || o.released_to_client === true);

/**
 * WHAT A CLIENT LEARNS FROM THE DELIVERABLES REGISTER. CRM 6 of 10. Only an
 * ISSUED deliverable of their own claim, and only three kinds: the reasoned
 * negative — how a claim that exits is told to the client, never as a stage the
 * portal invents — the s.203 notification, whose duty runs against the client,
 * and the client report once its figure is released. Never the accountant's
 * computation pack or the defence pack. FAILS CLOSED on an object without the
 * fields: `undefined` is none of the kinds, and is not `true`.
 */
/** A saved view the actor made. CRM 9 of 10. FAILS CLOSED on an object without `owner_id`. */
const ownView = (a: Actor, o: { owner_id: string }): boolean =>
  typeof o.owner_id === 'string' && o.owner_id === a.id;

const clientDeliverable = (
  a: Actor, o: { business_id: string; kind: string; state: string; figure_released: boolean },
): boolean =>
  ownBusiness(a, o) && o.state === 'ISSUED'
  && (o.kind === 'REASONED_NEGATIVE' || o.kind === 'S203_NOTIFICATION'
    || (o.kind === 'CLIENT_REPORT' && o.figure_released === true));

/* ------------------------------------------------------------------ *
 * THE RULE TABLE.
 *
 * Read it as: for this ACTION, these ROLES may act, subject to this test on
 * the specific object. A role absent from an action's row cannot perform it.
 * An action absent from the table cannot be performed by anyone.
 *
 * The three restrictions worth stating out loud, because they are decisions
 * and not oversights:
 *
 *   ACCOUNTING sees invoices and the business they belong to. It does NOT
 *   appear on assessment.*, answer.*, register_record.*, internal_note.* or
 *   surveyor_job.*. That was settled on 6 September 2026 and it is enforced
 *   twice — here, and in the shape of the finance tables, which carry no join
 *   to any of them.
 *
 *   SURVEYING appears on surveyor_job and on the assessment INPUTS it needs to
 *   do the work. It does NOT appear on estimate.read at all. The quarantine in
 *   caprebate-anchor-quarantine.ts is the authority on WHEN that changes, and
 *   payload.ts asks it rather than this table.
 *
 *   CLIENT appears only with ownBusiness, on their own record.
 * ------------------------------------------------------------------ */

/**
 * THE FIVE ROLES' TABLE. READ_ONLY is excluded from its type on purpose (Phase 132e):
 * the view-only role is decided by `READ_ONLY_RULES` below, one explicit yes or no per
 * action, and never by a key here — so it cannot be given an action by being added to a row.
 */
type RuleTable = {
  readonly [A in string]: Partial<Record<Exclude<AppRole, 'READ_ONLY'>, Rule<ObjType>>>;
};

const RULES: RuleTable = {
  /* --- user administration. ADMIN alone, and that is the whole of it. --- */
  'user.create': { ADMIN: always },
  'user.update': { ADMIN: always },
  'user.disable': { ADMIN: always },
  'user.assign_role': { ADMIN: always },
  'user.list': { ADMIN: always },
  /* Phase 151: making and changing roles (src/custom-roles.ts). The super admin's alone, and never grantable. */
  'role.manage': { ADMIN: always },

  /* --- every user may read and edit THEMSELVES, and nobody else. --- */
  'user.read_self': {
    ADMIN: self as Rule<ObjType>, SALES: self as Rule<ObjType>,
    ACCOUNTING: self as Rule<ObjType>, SURVEYING: self as Rule<ObjType>,
    CLIENT: self as Rule<ObjType>,
  },
  'user.change_own_password': {
    ADMIN: self as Rule<ObjType>, SALES: self as Rule<ObjType>,
    ACCOUNTING: self as Rule<ObjType>, SURVEYING: self as Rule<ObjType>,
    CLIENT: self as Rule<ObjType>,
  },
  /**
   * Display name, username and profile photo. SELF ONLY, INCLUDING FOR ADMIN.
   *
   * The super user can create a user, change their role and disable them —
   * every one of which is on the list above. It cannot edit somebody's name or
   * put a photograph on their account, because that is impersonation with a
   * paper trail that reads as the person themselves. Admin power over an
   * account is not the same thing as admin power INSIDE it, and the two are
   * separated here rather than in a screen.
   */
  'user.change_own_profile': {
    ADMIN: self as Rule<ObjType>, SALES: self as Rule<ObjType>,
    ACCOUNTING: self as Rule<ObjType>, SURVEYING: self as Rule<ObjType>,
    CLIENT: self as Rule<ObjType>,
  },
  'user.set_photo': {
    ADMIN: self as Rule<ObjType>, SALES: self as Rule<ObjType>,
    ACCOUNTING: self as Rule<ObjType>, SURVEYING: self as Rule<ObjType>,
    CLIENT: self as Rule<ObjType>,
  },
  'working_time.write': {
    ADMIN: always,
    SALES: ownWorkingTime as Rule<ObjType>,
    ACCOUNTING: ownWorkingTime as Rule<ObjType>,
    SURVEYING: ownWorkingTime as Rule<ObjType>,
  },
  /**
   * Reading working times. WIDER THAN WRITING THEM, and deliberately so.
   *
   * ADMIN and SALES read everybody's, because the calendar cannot offer a slot
   * without knowing whose hours it falls in and cannot assign a call without
   * knowing who is free. ACCOUNTING and SURVEYING read only their own — they
   * have their own hours to set and no business with anyone else's diary.
   * CLIENT reads none at all: the client's own picker is served by
   * `publicSlots`, which returns moments with the people taken out and asks
   * this table without ever asking this rule, because a visitor with no account
   * is not an actor.
   */
  'working_time.read': {
    ADMIN: always,
    SALES: always,
    ACCOUNTING: ownWorkingTime as Rule<ObjType>,
    SURVEYING: ownWorkingTime as Rule<ObjType>,
  },

  /**
   * MAY YOU OPEN THE BACK OFFICE AT ALL.
   *
   * The one place this application comes close to a role question, and it is
   * here in the table rather than at the top of a handler for exactly that
   * reason. It gates the back office's own landing page and decides where a
   * successful sign-in lands — nothing more: every section behind it authorises
   * its own objects, and a role that passes this and fails those sees a list of
   * sections it cannot open rather than a page it should not have.
   *
   * ACCOUNTING HAS SOMETHING TO OPEN SINCE 9 SEPTEMBER 2026. This comment read
   * "has nothing to open yet. Its view is Phase 107" until Phase 108; Phase 107
   * built /staff/finance the same week, so the note outlived its own fact. The
   * row is unchanged and was always right — what changed is only that the
   * landing page now leads somewhere.
   */
  'backoffice.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },

  /* --- the pipeline --- */
  'business.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // the client NAME, for an invoice. Nothing else follows from it.
    CLIENT: isOwnBusiness as Rule<ObjType>,
  },
  'assessment.read': {
    ADMIN: always, SALES: always,
    SURVEYING: always, // an INPUT the survey needs; the estimate is a separate object
    CLIENT: ownBusiness as Rule<ObjType>,
  },
  'answer.read': {
    ADMIN: always, SALES: always, SURVEYING: always,
    CLIENT: ownBusiness as Rule<ObjType>,
  },
  'estimate.read': {
    ADMIN: always, SALES: always,
    CLIENT: ownBusiness as Rule<ObjType>,
    // SURVEYING is deliberately absent. See payload.ts and N1.
  },
  'booking.read': {
    ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>,
  },
  'booking.write': { ADMIN: always, SALES: always },
  /**
   * A CLIENT MOVES THEIR OWN CALL. Phase 113a, 9 September 2026, and it is a
   * DECISION rather than a gap being filled — so it is written here as its own
   * row with its own reasoning, which is the whole reason it did not become
   * `CLIENT: ownBusiness` bolted onto `booking.write` above.
   *
   * WHY NOT LOOSEN `booking.write`. That action means "own and arrange a client
   * call": it decides whose diary a booking may be put into, it is what
   * `bookableUserIds` asks of every staff member to build the diary, and it is
   * the gate on the whole back-office calendar section through the sentinel
   * object. A CLIENT on that row would have appeared in the answer to "who
   * could take this call", which is absurd, and would have passed the section
   * gate, which is a leak. THE ACTIONS ARE GENUINELY DIFFERENT and one of them
   * did not exist until a client needed it.
   *
   * WHAT IT ADMITS, EXACTLY: the CLIENT role alone, on `ownBusiness`, on their
   * own booking object. No staff role is on it — a staff member moving a call
   * is `booking.write`, on the row above, and neither route is the other's back
   * door. Nothing else about a booking changes: reading it is still
   * `booking.read`, and the write path re-checks `isBookable` at the moment of
   * writing exactly as the staff path does.
   */
  'booking.move_own': { CLIENT: ownBusiness as Rule<ObjType> },
  'engagement.read': {
    ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>,
  },
  'research.run': { ADMIN: always, SALES: always },
  'research.read': { ADMIN: always, SALES: always },
  'register_record.read': { ADMIN: always, SALES: always, SURVEYING: always },
  /*
   * PHASE 139 — CHECKED AND APPROVED, AND TELLING THE CLIENT. Ticking a fact as checked, and pressing "Tell the client" on
   * a step, are ADMIN's and SALES's — the people who work the client. TAKING A STEP BACK, after the client has been told,
   * is ADMIN's alone. The client reads what it was told, on its own company, and nothing else: the view model
   * (src/web/approvals.ts, `clientSteps`) carries a step's words and a date, never a fact, a value or a reason.
   */
  'fact.approve': { ADMIN: always, SALES: always },
  'client_step.tell': { ADMIN: always, SALES: always },
  'client_step.take_back': { ADMIN: always },
  'client_step.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  'internal_note.read': { ADMIN: always, SALES: always },
  'internal_note.write': { ADMIN: always, SALES: always },
  /*
   * PHASE 142 — THE THREAD WITH THE CLIENT. Admin and Sales, who work the client, and the client on its own company. The
   * TEAM thread is `internal_note.*` above, and the client is on neither of its rows. THE SURVEYOR READS THE THREAD
   * WITH THE CLIENT, AND NOTHING MORE: Lakhbir answered "Should the surveyor see a client's chat?" on 22 September 2026 —
   * "With the client" only. A surveyor reads it on a company where they hold an assigned survey job (`throughAssignedJob`,
   * failing closed on an object without the list), never writes on it, and is on no row of the TEAM thread. Accounting is not on them either: its view is invoices, settled 6 September 2026.
   * A REPLY BY EMAIL waits for Admin or Sales, who read the queue and file what the mailbox reader could not.
   */
  'client_message.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType>, SURVEYING: throughAssignedJob as Rule<ObjType> },
  'client_message.write': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  'inbound_email.read': { ADMIN: always, SALES: always },
  'inbound_email.file': { ADMIN: always, SALES: always },

  /* --- Caprebate's own finance --- */
  'invoice.read': { ADMIN: always, ACCOUNTING: always },
  'invoice.write': { ADMIN: always, ACCOUNTING: always },
  /*
   * CRM 7 of 10 — FINANCE ON THE CLAIM. EVERY ROW BELOW IS NEW AND EVERY ROLE NOT
   * NAMED IS REFUSED — test/finance-claim.test.ts asserts it per role, per action.
   *
   * RAISING, CREDITING AND RECORDING MONEY RECEIVED ARE ACCOUNTING'S AND ADMIN'S,
   * as the invoice is. None of them takes money: `record_received` records what a
   * person saw arrive, and test/finance.test.ts still refuses any action named for
   * taking a payment. A FINANCE SETTING — the VAT position, the threshold, the
   * margin — IS ADMIN'S ALONE: the monitoring is a director's check, and the person
   * whose invoices it monitors does not move its line.
   */
  'invoice.raise': { ADMIN: always, ACCOUNTING: always },
  'invoice.credit': { ADMIN: always, ACCOUNTING: always },
  'invoice.record_received': { ADMIN: always, ACCOUNTING: always },
  'finance_setting.write': { ADMIN: always },

  /* --- the surveyor's workspace, and nothing else --- */
  /**
   * MAY YOU OPEN THE SURVEY SECTION AT ALL — the same kind of question
   * `backoffice.enter` asks, and it needs its own row for a reason that only
   * shows up on this section.
   *
   * Every other collection gate in this application is a SENTINEL OBJECT: a
   * business belonging to nobody, refused to CLIENT because every rule that
   * lets a client through is `ownBusiness`. That works because the roles the
   * gate admits are on `always`. It does not work here: SURVEYING reaches
   * `surveyor_job.read` through `assignedSurveyor`, which is a test on the
   * SPECIFIC job, and a sentinel job would have to carry the requester's own
   * id in `surveyor_id` to pass it — a sentinel built to satisfy the rule
   * being asked, which proves nothing and reads as a trick.
   *
   * So the section is its own action. ACCOUNTING is absent, as it is from
   * every row below.
   */
  'surveyor_job.enter': { ADMIN: always, SALES: always, SURVEYING: always },
  'surveyor_job.read': {
    ADMIN: always, SALES: always,
    SURVEYING: assignedSurveyor as Rule<ObjType>,
  },
  'surveyor_job.commit': { SURVEYING: assignedSurveyor as Rule<ObjType> },
  'surveyor_job.assign': { ADMIN: always, SALES: always },

  /* --- the CRM backbone. CRM 1 of 10, 10 September 2026 ---------------------
   *
   * EVERY ROW BELOW IS NEW, AND EVERY ROLE NOT NAMED ON A ROW IS REFUSED IT —
   * test/crm.test.ts asserts the refusal for each one, per action, rather than
   * trusting that an absent key means what it should.
   *
   * THE ORGANISATION IS THE `business` OBJECT. It is the same row, extended;
   * a second object type for it would be a second place to authorise one thing.
   * `business.read` above is untouched — it is still the client NAME, for an
   * invoice, and it is what ACCOUNTING holds. `organisation.read` is the whole
   * record, and ACCOUNTING is not on it.
   *
   * CONTACTS ARE ADMIN AND SALES ONLY. They carry people's names, routes and
   * internal notes, and nothing about the survey or the money needs them.
   *
   * PROPERTIES AND CLAIMS ARE REACHABLE BY SURVEYING ONLY `throughAssignedJob`.
   * The section gates `property.enter` and `claim.enter` are their own actions
   * for the reason `surveyor_job.enter` is: a sentinel object cannot satisfy a
   * test on the specific object without being built to pass it.
   *
   * N1 — `claim.read_value` IS ADMIN AND SALES AND NOBODY ELSE. The claim value,
   * the tax benefit and every sealed estimate field hang off it. A claim page
   * built for any other role is built forwards without them, and the payload
   * proof searches the response for all seven.
   *
   * ACCOUNTING READS A CLAIM AS CLIENT, REFERENCE AND MONEY. `claim.read`
   * admits it; src/web/crm.ts builds its view from those three and the money
   * comes through `invoice.read`, which it already holds. No join to the
   * answers, the register data, the notes, the workings or the estimate.
   *
   * CLIENT IS ON NONE OF THEM. The portal is unchanged by this phase.
   * ------------------------------------------------------------------------ */
  'organisation.read': { ADMIN: always, SALES: always },
  'organisation.write': { ADMIN: always, SALES: always },
  'contact.read': { ADMIN: always, SALES: always },
  'contact.write': { ADMIN: always, SALES: always },
  'property.enter': { ADMIN: always, SALES: always, SURVEYING: always },
  'property.read': {
    ADMIN: always, SALES: always,
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'property.write': { ADMIN: always, SALES: always },
  'claim.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
  'claim.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // client, reference and money — see the block above
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'claim.read_value': { ADMIN: always, SALES: always },
  'claim.create': { ADMIN: always, SALES: always },
  'claim.write': { ADMIN: always, SALES: always },
  /*
   * PHASE 134 — A CLIENT SEES THEIR OWN COMPANY'S CLAIMS: each one's property and how far it has got, in the portal's six
   * client words (src/web/portal.ts). `ownBusiness` on the claim itself, asked of every claim on every request. Nothing
   * else about a claim reaches a client through it: not the ten staff stages, a hold reason, an exit note, a value, a
   * next action or a person. ADMIN and SALES may look at a client's portal, as they may today.
   */
  'claim.progress_read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },

  /* --- leads and the pipeline. CRM 2 of 10, 10 September 2026 --------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * pipeline.test.ts asserts the refusal for each one, per action.
   *
   * LEADS ARE ADMIN AND SALES. A lead is a prospect being worked, with the
   * estimate the client was shown beside it; nothing about it is money or
   * survey work, so ACCOUNTING and SURVEYING are on none of these rows.
   *
   * `claim.move` IS A MOVE THROUGH A GATE, and the gate is asked on the server
   * at every write — src/web/pipeline.ts. Holding this action lets a person ASK
   * for a move; it never lets them past a gate that is shut. `claim.reopen`,
   * the one move backwards, is ADMIN alone and needs a reason.
   *
   * THE BOARD IS ADMIN AND SALES. A card's value is still asked per card of
   * `claim.read_value`, so a role added here later would get no value on a
   * card without being added there too.
   * ------------------------------------------------------------------------ */
  'lead.read': { ADMIN: always, SALES: always },
  'lead.write': { ADMIN: always, SALES: always },
  'lead.convert': { ADMIN: always, SALES: always },
  'pipeline.read': { ADMIN: always, SALES: always },
  'claim.move': { ADMIN: always, SALES: always },
  'claim.reopen': { ADMIN: always },

  /* --- tasks, the timeline, automation and templates. CRM 3 of 10 ----------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * tasks.test.ts asserts the refusal for each one, per action.
   *
   * A TASK IS READ AND WORKED BY WHOEVER IT BELONGS TO. ADMIN and SALES read and
   * change every task. ACCOUNTING reads and progresses its own tasks and the ones
   * waiting with Accounting — the finance task the invoice stage raises — and
   * nothing about them is a join to the answers, the register data, the notes,
   * the workings or the estimate. SURVEYING does the same, and only on a claim an
   * assigned survey job reaches. Creating a task, and changing or cancelling one,
   * is ADMIN and SALES.
   *
   * THE TIMELINE ADMITS ACCOUNTING AND IS BUILT FORWARDS FOR IT. `timeline.read`
   * lets ACCOUNTING open a claim's timeline — it is already on `claim.read` — and
   * src/web/timeline.ts builds that timeline from `invoice.read` alone, so it
   * holds financial events and nothing else. SURVEYING reaches only the timeline
   * of a claim an assigned job is on, built from that job's reach.
   *
   * AN AUTOMATION RULE AND A TEMPLATE ARE ADMIN'S TO CHANGE. SALES reads both and
   * queues a merged email; nobody else is on any of these rows.
   * ------------------------------------------------------------------------ */
  'staff_task.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: ownOrPooledTask as Rule<ObjType>,
    SURVEYING: ownTaskOnAssignedJob as Rule<ObjType>,
  },
  'staff_task.create': { ADMIN: always, SALES: always },
  'staff_task.write': { ADMIN: always, SALES: always },
  'staff_task.progress': {
    ADMIN: always, SALES: always,
    ACCOUNTING: ownOrPooledTask as Rule<ObjType>,
    SURVEYING: ownTaskOnAssignedJob as Rule<ObjType>,
  },
  'timeline.read': {
    ADMIN: always, SALES: always,
    ACCOUNTING: always, // financial events only — see the block above
    SURVEYING: throughAssignedJob as Rule<ObjType>,
  },
  'automation_rule.read': { ADMIN: always, SALES: always },
  'automation_rule.write': { ADMIN: always },
  'email_template.read': { ADMIN: always, SALES: always },
  'email_template.write': { ADMIN: always },
  'email.queue': { ADMIN: always, SALES: always },

  /* --- documents on the claim. CRM 4 of 10, 11 September 2026 ---------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * documents.test.ts asserts the refusal for each one, per action, and
   * `document.read` per role PER READER CLASS.
   *
   * `document.read` IS ASKED OF THE DOCUMENT ITSELF, never of its organisation:
   * `business.read` admits ACCOUNTING to every client's name, and a document
   * authorised that way would have admitted it to every client's lease.
   *
   * `document.read_original` IS THE FILE, AND IT IS NARROWER. The Dashboard Data
   * Specification's access table gives the surveyor and the accountant NO access
   * to the raw document store, and names no Sales row. Under the fail-closed
   * settings there is no original to serve in any case; the route still asks.
   *
   * TYPES ARE ADMIN'S TO CHANGE, AND A REQUEST IS ADMIN'S OR SALES'S TO RAISE.
   * The client reads their own requests in the portal and answers one only by
   * uploading — there is no action for answering, because there is no click that
   * receives a document.
   * ------------------------------------------------------------------------ */
  'document.read': {
    ADMIN: always,
    SALES: salesDocument as Rule<ObjType>,
    ACCOUNTING: accountingDocument as Rule<ObjType>,
    SURVEYING: surveyorDocument as Rule<ObjType>,
    CLIENT: clientDocument as Rule<ObjType>,
  },
  'document.read_original': { ADMIN: always, CLIENT: clientDocument as Rule<ObjType> },
  'document.upload': { ADMIN: always, SALES: always, CLIENT: isOwnBusiness as Rule<ObjType> },
  'document.link': { ADMIN: always, SALES: always },
  /** PHASE 140: whether the client can see a file — the two roles that upload one. Never the client, never a surveyor. */
  'document.show_to_client': { ADMIN: always, SALES: always },
  /**
   * PHASE 146i: saying whether a name on a document belongs to an organisation rather than to somebody. Two
   * CLIENT_DOC fields are kept on that footing alone and it cannot be inferred from the document, so it is a
   * person's answer. THE TWO ROLES THAT WORK THE CLIENT AND NOBODY ELSE — not a surveyor, not Accounting, and
   * never the client, who would be vouching for their own document.
   */
  'document.vouch': { ADMIN: always, SALES: always },
  'document_type.read': { ADMIN: always, SALES: always },
  'document_type.write': { ADMIN: always },
  'document_request.read': { ADMIN: always, SALES: always, CLIENT: ownBusiness as Rule<ObjType> },
  'document_request.create': { ADMIN: always, SALES: always },
  'document_request.withdraw': { ADMIN: always, SALES: always },

  /* --- introducers and the referral channel. CRM 5 of 10, 11 September 2026 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * introducers.test.ts asserts the refusal for each one, per action.
   *
   * AN INTRODUCER IS A FIRM AND NEVER A USER. No row here, and no row anywhere,
   * gives a firm or a person at it a way in: CLIENT and SURVEYING are on none.
   *
   * THE FIRM IS ADMIN'S AND SALES'S TO READ AND KEEP. `introducer.read_value` —
   * the estimated claim value of what it referred — is ADMIN and SALES, as
   * `claim.read_value` is. `introducer.read_money` — the fees invoiced and paid
   * from those claims — is ADMIN and ACCOUNTING, as `invoice.read` is, and
   * ACCOUNTING opens a firm with that alone: src/web/introducers.ts builds its
   * view forwards from the money, with no join to the answers, the register data,
   * the notes, the workings or the estimate.
   *
   * THE CLIENT'S OPT-IN is recorded by ADMIN or SALES, who ask the client.
   *
   * THE REWARD SETTING IS ADMIN'S TO SWITCH, and the switch still refuses while
   * clause 1 of the letter is blank. A model-B fee's disclosure is recorded by the
   * people who talk to the client, ADMIN and SALES; that it was settled with the
   * firm, by the people who keep the money, ADMIN and ACCOUNTING. NOTHING HERE
   * TAKES MONEY: `record_settled` records that Caprebate paid a firm, and
   * test/finance.test.ts still refuses any action named for taking a payment.
   *
   * CONTACT WITH A FIRM IS A STAFF TASK (row E48), so logging or planning it also
   * asks `staff_task.create`, which is ADMIN's and SALES's already.
   * ------------------------------------------------------------------------ */
  'introducer.enter': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer.read': { ADMIN: always, SALES: always },
  'introducer.read_value': { ADMIN: always, SALES: always },
  'introducer.read_money': { ADMIN: always, ACCOUNTING: always },
  'introducer.write': { ADMIN: always, SALES: always },
  'share_consent.read': { ADMIN: always, SALES: always },
  'share_consent.record': { ADMIN: always, SALES: always },
  'introducer_reward.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_reward.switch': { ADMIN: always },
  'introducer_fee.read': { ADMIN: always, SALES: always, ACCOUNTING: always },
  'introducer_fee.disclose': { ADMIN: always, SALES: always },
  'introducer_fee.record_settled': { ADMIN: always, ACCOUNTING: always },

  /* --- the claim's facts, figures, sign-off, deliverables and aftercare. CRM 6 of 10 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * claim-record.test.ts asserts the refusal for each one, per action.
   *
   * THE FACTS ARE ADMIN'S AND SALES'S. ACCOUNTING IS ON NONE OF THESE ROWS: a
   * fact about the tax position, an election or a grant is not money.
   * `claim_facts.read_released` IS THE SURVEYOR'S, on an assigned job only, and
   * it reaches the RELEASED inputs alone — src/payload.ts assembles them forwards
   * from a list that holds no figure, amount, window or profit position.
   *
   * THE FIGURES ARE ADMIN'S AND SALES'S, as `claim.read_value` is (N1): the
   * indicative estimate, the researched estimate's state, the surveyor's
   * committed figure, the tax adviser's figure and the reconciliation. Recording
   * the sign-off record, the reconciliation, a deliverable and an enquiry is
   * ADMIN's and SALES's — the people who hold the claim's papers.
   *
   * A DELIVERABLE IS READ BY THE CLIENT ONLY THROUGH `clientDeliverable` above.
   * ------------------------------------------------------------------------ */
  'claim_facts.read': { ADMIN: always, SALES: always },
  'claim_facts.read_released': { SURVEYING: throughAssignedJob as Rule<ObjType> },
  'claim_facts.record': { ADMIN: always, SALES: always },
  'claim_figures.read': { ADMIN: always, SALES: always },
  'tax_signoff.record': { ADMIN: always, SALES: always },
  'reconciliation.record': { ADMIN: always, SALES: always },
  'deliverable.read': { ADMIN: always, SALES: always, CLIENT: clientDeliverable as Rule<ObjType> },
  'deliverable.record': { ADMIN: always, SALES: always },
  'hmrc_enquiry.record': { ADMIN: always, SALES: always },
  /* Phase 132e: recording the client's own written filing confirmation, where the client has no accountant — the
     people who hold the claim's papers, as a deliverable is. Nobody else; test/phase132e.test.ts asserts it per role. */
  'client_filing.record': { ADMIN: always, SALES: always },
  /* Phase 132e: a multi-site discount is proposed by the people who agree terms with a client, and read by them and by
     finance. It is a record and is never applied: see src/web/fee-discounts.ts. */
  'fee_discount.record': { ADMIN: always, SALES: always },
  'fee_discount.read': { ADMIN: always, SALES: always, ACCOUNTING: always },

  /* --- the compliance registers. CRM 8 of 10, 12 September 2026 ---------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * compliance.test.ts asserts the refusal for each one, per action.
   *
   * NONE OF THIS IS FOR SALES, ACCOUNTING OR SURVEYING, and ADMIN holds it TODAY
   * ONLY because nobody else can. There is no data protection officer role and
   * ADMIN is a super user, not an officer: whether compliance needs a role of its
   * own is Lakhbir's question, "Do we need a compliance role separate from Admin?",
   * and a sixth role is not ENABLED here. Phase 129 DEFINED one and switched it off —
   * `DPO_RULES` and `canAsDpo` below — and while `DPO_ROLE_SWITCH` is off it reaches nothing.
   *
   * THE IDENTITY STORE IS NARROWER THAN EVERYTHING ELSE. `compliance.read` does not
   * reach it and nothing inherits it: a person in S2 is read only through
   * `compliance.identity_read`, by person_ref or by a logged name search, and
   * every read is audited (Dashboard Data Specification, section 7).
   *
   * THE CLIENT'S OWN ROUTE TO THE SHARE-PROGRESS OPT-IN is the one row here for a
   * CLIENT, on their own organisation — withdrawing always, giving only while its
   * switch is on.
   * ------------------------------------------------------------------------ */
  'compliance.read': { ADMIN: always },
  'compliance.write': { ADMIN: always },
  'compliance.identity_read': { ADMIN: always },
  'compliance.identity_write': { ADMIN: always },
  'share_consent.client_record': { CLIENT: ownBusiness as Rule<ObjType> },

  /* --- the per-disclosure log. Phase 129, 12 September 2026 -------------------
   *
   * BOTH ROWS ARE NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/phase129.test.ts
   * asserts the refusal for each one, per action. The log is switched off
   * (`DISCLOSURE_LOG` in src/web/disclosure-log.ts), so today these rows admit a
   * person to a refusal that says so, and nothing more.
   *
   * RECORDING a disclosure is ADMIN's and SALES's — the people who send a
   * client's papers to a surveyor, a tax adviser or the client's accountant.
   * READING who has received a client's data is a compliance register, ADMIN's
   * alone, as the rights-request register is.
   * ------------------------------------------------------------------------ */
  'disclosure.read': { ADMIN: always },
  'disclosure.record': { ADMIN: always, SALES: always },

  /* --- the defence pack generator. Phase 132, 14 September 2026 ---------------
   *
   * NEW, AND EVERY ROLE NOT NAMED IS REFUSED — test/phase132-records.test.ts asserts
   * the refusal for each one. The generator is switched off (`DEFENCE_PACK_GENERATOR`
   * in src/web/defence-pack.ts), so today this row admits a person to a refusal that
   * says so. Switched on it builds a manifest from the claim's sealed records and
   * issues nothing: ADMIN and SALES, who hold the claim's figures and its papers, as
   * `claim_figures.read` and `deliverable.record` are. No route asks it yet.
   * ------------------------------------------------------------------------ */
  'defence_pack.generate': { ADMIN: always, SALES: always },

  /* --- dashboards, search, saved views, export and admin settings. CRM 9 of 10, 12 September 2026 ---
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/dashboard.test.ts
   * asserts the refusal for each one, per action.
   *
   * `dashboard.enter` OPENS THE MANAGEMENT DASHBOARD AND NOTHING INSIDE IT. Every tile
   * asks the actions its own figures already need — `pipeline.read`, `claim.read_value`,
   * `invoice.read`, `claim_figures.read`, `compliance.read` and the rest — so a role that
   * enters sees only the tiles those rows admit, and SURVEYING, which holds none of them,
   * sees its own survey jobs and nothing else. A tile is never a second rule.
   * ------------------------------------------------------------------------ */
  'dashboard.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
  /*
   * EXPORT IS THE LIST THE READER ALREADY READS, AS CSV — and SURVEYING is not on it. A surveyor's lists are the
   * working line of their own jobs, and nothing about survey work needs a spreadsheet of them; a file leaves the
   * application, where no rule follows it. What each exporter's file holds is their own row shape (src/web/lists.ts).
   */
  'list.export': { ADMIN: always, SALES: always, ACCOUNTING: always },
  /* A SAVED VIEW is a person's own; a SHARED one is ADMIN's to set and to retire. */
  'saved_view.write': {
    ADMIN: ownView as Rule<ObjType>, SALES: ownView as Rule<ObjType>,
    ACCOUNTING: ownView as Rule<ObjType>, SURVEYING: ownView as Rule<ObjType>,
  },
  'saved_view.share': { ADMIN: always },
  /*
   * THE ADMIN SETTINGS SCREEN. SALES READS IT, as it reads the automation rules, the templates and the document types
   * it folds in; ADMIN alone changes a list or a reason. What no setting may change — a gate, a switch, a role — is
   * refused by the store (src/web/configuration.ts), and no action here reaches one.
   */
  'configuration.read': { ADMIN: always, SALES: always },
  'configuration.write': { ADMIN: always },
  /*
   * MERGING A FIRM — the public referral form's new firm onto the one already recorded. ADMIN alone: it moves who
   * referred what, and migration 019's trigger admits a person's move between firms only inside the merge.
   */
  'introducer.merge': { ADMIN: always },

  /* --- the CRM follow-on, 12 September 2026 ------------------------------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/follow-on.test.ts
   * asserts the refusal for each one, per action.
   *
   * THE CLAIM TEAM. Reading the team is the actions its parts already need — `contact.read` for the organisation's
   * accountant and adviser, `claim_figures.read` for the tax adviser's sign-off record — so a surveyor is drawn the
   * owner and the surveyor it already reads and nothing else. LINKING A CONTACT TO A CLAIM, and ending the link, is
   * ADMIN's and SALES's, the people who keep the organisation's contacts. A contact is never a user.
   *
   * THE DOCUMENT CENTRE is a list over every document, and every row on it is still asked of `document.read` on the
   * document itself — so a role that enters sees only the documents that rule admits, and a surveyor the claim evidence
   * of its own jobs. CLIENT is not on it: the portal is the client's list.
   */
  'claim_team.write': { ADMIN: always, SALES: always },
  'document_centre.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },

  /* --- the audit log is readable by the super user alone ---
   * The CRM follow-on built the page that asks it: /staff/audit, kinds, ids and outcomes and never a value. */
  'audit.read': { ADMIN: always },
};

export type Action = keyof typeof RULES & string;

/** Every action the table knows. Used by the deny-by-default test and by /whoami. */
export const REGISTERED_ACTIONS: readonly string[] = Object.freeze(Object.keys(RULES));


/* ------------------------------------------------------------------ *
 * THE READ-ONLY ROLE — AN EXPLICIT YES OR NO ON EVERY ACTION.
 * Phase 132e, 16 September 2026.
 *
 * Lakhbir: "One main log in for admin/manager/owner, and another log for view
 * only". ADMIN is the main login. READ_ONLY is the view-only one, and it is
 * assigned to nobody (no seed user).
 *
 * WHY A TABLE OF ITS OWN, AND NOT A COLUMN IN `RULES`. A role absent from a row
 * of `RULES` is refused, which is right — but it is refused SILENTLY, and a
 * future row that forgot this role would be decided by forgetting. Here every
 * registered action carries a decision and a reason, and test/authz.test.ts
 * loops over `REGISTERED_ACTIONS`: an action with no entry below fails that
 * test, and every entry that says no is asserted refused.
 *
 * THE PRINCIPLE, DECIDED CONSERVATIVELY:
 *   1. IT WRITES NOTHING. Every action that creates, changes, moves, records,
 *      switches, queues, uploads or assigns is a no. The one exception is
 *      changing its OWN password, which changes no business record and which
 *      every login must be able to do.
 *   2. IT NEVER SEES WHAT IS SEALED. The sealed estimate (`estimate.read`), the
 *      claim value (`claim.read_value`), the claim's figures
 *      (`claim_figures.read`), the facts that feed them (`claim_facts.*`), the
 *      value an introducer referred and the survey workspace — whose payload is
 *      released to any role the quarantine does not name — are all no. So are
 *      the fee and money (`invoice.read`, `introducer.read_money`,
 *      `introducer_fee.read`): our fee is a flat percentage of the allowances
 *      identified, so a fee IS the claim value, divided.
 *   3. IT NEVER READS THE REGISTERS ABOUT PEOPLE OR ABOUT US. The compliance
 *      registers, the identity store, the disclosure log and the audit log are no.
 *   4. IT EXPORTS NOTHING. `list.export` is no: a file leaves the application,
 *      and no rule follows it.
 *   5. WHAT IT READS, IT READS AS SALES WOULD, WITHOUT THE VALUE — the
 *      organisation, its contacts one at a time, properties, claims, leads, the
 *      pipeline, bookings, tasks, the timeline, documents that carry no value,
 *      the deliverables register and the settings screens. Every page is built
 *      forwards from the actions it asks, so a page READ_ONLY opens is drawn
 *      without the parts a "no" below withholds.
 * ------------------------------------------------------------------ */

export type ReadOnlyDecision = { readonly allow: Rule<ObjType> | null; readonly why: string };

const NO = (why: string): ReadOnlyDecision => Object.freeze({ allow: null, why });
const YES = (why: string, rule: Rule<ObjType> = always): ReadOnlyDecision => Object.freeze({ allow: rule, why });

/** Documents that carry no claim value, fee or tax benefit, in the two claim classes. Never FINANCE or the letter. */
const readOnlyDocument = (_a: Actor, o: DocumentFacts): boolean =>
  (o.readers === 'CLAIM_EVIDENCE' || o.readers === 'CLAIM_TEAM') && o.carries_value === false;

const WRITES = 'a write — the view-only login changes nothing';

export const READ_ONLY_RULES: Readonly<Record<string, ReadOnlyDecision>> = Object.freeze({
  'user.create': NO(WRITES),
  'user.update': NO(WRITES),
  'user.disable': NO(WRITES),
  'user.assign_role': NO(WRITES),
  'role.manage': NO(WRITES),
  'user.list': NO('the staff list is other people\'s accounts; user administration is ADMIN\'s'),
  'user.read_self': YES('its own account, as every login reads', self as Rule<ObjType>),
  'user.change_own_password': YES('its own password only — a login must be able to rotate it; no business record changes', self as Rule<ObjType>),
  'user.change_own_profile': NO(WRITES),
  'user.set_photo': NO(WRITES),
  'working_time.write': NO(WRITES),
  'working_time.read': NO('it holds no diary and takes no call; the calendar shows free slots without anybody\'s hours'),
  'backoffice.enter': YES('the view-only login is a back-office login'),
  'business.read': YES('the client\'s name, as every staff role reads'),
  'assessment.read': YES('the answers given — an input the surveyor also reads; the estimate is a separate object'),
  'answer.read': YES('the answers given, as the surveyor also reads'),
  'estimate.read': NO('the sealed estimate (N1) — hidden from everyone it is hidden from today'),
  'booking.read': YES('the calendar and a booking, to see who is being called when'),
  'booking.write': NO(WRITES),
  'booking.move_own': NO('the client\'s own action; also a write'),
  'engagement.read': YES('whether the letter is sent, viewed or signed — a state, with no fee in it'),
  'research.run': NO('a write, and it could fire paid calls'),
  'research.read': NO('paid register research can carry the purchase price, an anchor; decided conservatively'),
  'register_record.read': YES('the free register records, as the surveyor reads'),
  'fact.approve': NO(WRITES),
  'client_step.tell': NO(WRITES),
  'client_step.take_back': NO(WRITES),
  'client_step.read': NO('the client\'s own view of what we told them; the checks behind it carry register values, decided conservatively'),
  'internal_note.read': NO('free text staff write for each other can carry a figure or a remark about a person; decided conservatively'),
  'internal_note.write': NO(WRITES),
  'client_message.read': NO('what a client writes to us can carry a figure or a remark about a person; decided conservatively, as the team thread is'),
  'client_message.write': NO(WRITES),
  'inbound_email.read': NO('an email a client sent us, before it is filed; decided conservatively, as the team thread is'),
  'inbound_email.file': NO(WRITES),
  'invoice.read': NO('our fee is a percentage of the allowances identified, so a fee reveals the claim value'),
  'invoice.write': NO(WRITES),
  'invoice.raise': NO(WRITES),
  'invoice.credit': NO(WRITES),
  'invoice.record_received': NO(WRITES),
  'finance_setting.write': NO(WRITES),
  'surveyor_job.enter': NO('the survey workspace\'s payload releases the sealed estimate to any role the quarantine does not name'),
  'surveyor_job.read': NO('the survey workspace\'s payload releases the sealed estimate to any role the quarantine does not name'),
  'surveyor_job.commit': NO(WRITES),
  'surveyor_job.assign': NO(WRITES),
  'organisation.read': YES('the organisation record'),
  'organisation.write': NO(WRITES),
  'contact.read': YES('a contact, one at a time on screen; there is no export (list.export is no)'),
  'contact.write': NO(WRITES),
  'property.enter': YES('the properties section'),
  'property.read': YES('a property record'),
  'property.write': NO(WRITES),
  'claim.enter': YES('the claims section'),
  'claim.read': YES('a claim without its value — the value is claim.read_value, which is no'),
  'claim.read_value': NO('the claim value, tax benefit and sealed estimate fields (N1)'),
  'claim.create': NO(WRITES),
  'claim.write': NO(WRITES),
  'claim.progress_read': NO('the client portal’s own view of a company’s claims; a view-only login reads a claim through claim.read'),
  'lead.read': YES('a lead, without the range shown — that is estimate.read, which is no'),
  'lead.write': NO(WRITES),
  'lead.convert': NO(WRITES),
  'pipeline.read': YES('the board; each card\'s value is asked of claim.read_value, which is no'),
  'claim.move': NO(WRITES),
  'claim.reopen': NO(WRITES),
  'staff_task.read': YES('every task, to see what is outstanding'),
  'staff_task.create': NO(WRITES),
  'staff_task.write': NO(WRITES),
  'staff_task.progress': NO(WRITES),
  'timeline.read': YES('the activity timeline, built from the reads this table admits'),
  'automation_rule.read': YES('the automation rules, as a setting'),
  'automation_rule.write': NO(WRITES),
  'email_template.read': YES('the templates, as a setting'),
  'email_template.write': NO(WRITES),
  'email.queue': NO('a write, and it would contact a client'),
  'document.read': YES('claim evidence and claim-team papers that carry no value — never the letter or finance papers', readOnlyDocument as Rule<ObjType>),
  'document.read_original': NO('the raw document store is ADMIN\'s and the client\'s own'),
  'document.upload': NO(WRITES),
  'document.link': NO(WRITES),
  'document.show_to_client': NO(WRITES),
  'document.vouch': NO(WRITES),
  'document_type.read': YES('the document types, as a setting'),
  'document_type.write': NO(WRITES),
  'document_request.read': YES('what has been asked of a client'),
  'document_request.create': NO(WRITES),
  'document_request.withdraw': NO(WRITES),
  'introducer.enter': YES('the introducers section'),
  'introducer.read': YES('an introducing firm'),
  'introducer.read_value': NO('the estimated value of what a firm referred (N1)'),
  'introducer.read_money': NO('fees invoiced and paid — money'),
  'introducer.write': NO(WRITES),
  'share_consent.read': YES('whether a client agreed to share progress with a firm'),
  'share_consent.record': NO(WRITES),
  'introducer_reward.read': YES('the reward setting and its state, as a setting'),
  'introducer_reward.switch': NO(WRITES),
  'introducer_fee.read': NO('a fee paid to a firm — money'),
  'introducer_fee.disclose': NO(WRITES),
  'introducer_fee.record_settled': NO(WRITES),
  'claim_facts.read': NO('the claim\'s tax facts include amounts that feed the claim value; decided conservatively'),
  'claim_facts.read_released': NO('the surveyor\'s route, on an assigned job only'),
  'claim_facts.record': NO(WRITES),
  'claim_figures.read': NO('the claim\'s figures (N1)'),
  'tax_signoff.record': NO(WRITES),
  'reconciliation.record': NO(WRITES),
  'deliverable.read': YES('the deliverables register — kinds, versions and dates; a report\'s figure is a document that carries value, which is no'),
  'deliverable.record': NO(WRITES),
  'hmrc_enquiry.record': NO(WRITES),
  'client_filing.record': NO(WRITES),
  'fee_discount.record': NO(WRITES),
  'fee_discount.read': NO('a discount is a share of our fee, and the fee reveals the claim value'),
  'compliance.read': NO('the compliance registers are about people exercising their rights; ADMIN\'s alone'),
  'compliance.write': NO(WRITES),
  'compliance.identity_read': NO('the identity store (S2) — never'),
  'compliance.identity_write': NO(WRITES),
  'share_consent.client_record': NO('the client\'s own action; also a write'),
  'disclosure.read': NO('who received a client\'s data is a compliance register; ADMIN\'s alone'),
  'disclosure.record': NO(WRITES),
  'defence_pack.generate': NO('builds from the sealed records, including the figures'),
  'dashboard.enter': YES('the dashboard; each tile asks its own rules, so value and money tiles are not drawn'),
  'list.export': NO('a bulk export of personal data leaves the application, where no rule follows it'),
  'saved_view.write': NO(WRITES),
  'saved_view.share': NO(WRITES),
  'configuration.read': YES('the admin settings screen, read'),
  'configuration.write': NO(WRITES),
  'introducer.merge': NO(WRITES),
  'claim_team.write': NO(WRITES),
  'document_centre.enter': YES('the document centre; every row is still asked of document.read'),
  'audit.read': NO('the audit log is the super user\'s alone'),
});

/**
 * The view-only decision. An action with no entry is refused (and test/authz.test.ts fails on it). A "no" is
 * refused. A "yes" still asks its test of the specific object. A disabled user is refused before this is reached.
 */
export function canAsReadOnly(actor: Actor, action: string, object: Obj): boolean {
  if (actor.role !== 'READ_ONLY' || actor.disabled) return false;
  if (!Object.prototype.hasOwnProperty.call(READ_ONLY_RULES, action)) return false;
  const decision = READ_ONLY_RULES[action];
  if (decision === undefined || decision.allow === null) return false;
  return decision.allow(actor, object as Extract<Obj, { type: ObjType }>) === true;
}

/* ------------------------------------------------------------------ *
 * A DATA PROTECTION OFFICER ROLE — DEFINED, SCOPED, AND SWITCHED OFF.
 * Phase 129, 12 September 2026.
 *
 * WHAT IS BUILT. The rows a DPO would hold: the compliance registers, S2, the
 * per-disclosure log's reading, the back office's front door and their own
 * account — and NOTHING ELSE. Not the audit log, not users and roles, not the
 * admin settings, not a claim, a document, a lead or the money. So a DPO could
 * keep the registers without being able to add a salesperson or read the whole
 * audit log, which is what the question sets out.
 *
 * WHY IT IS OFF. Whether there is a sixth role at all is Lakhbir's question —
 * "Do we need a compliance role separate from Admin?" — and the five-role model
 * is a decision (src/roles.ts). So `DPO_ROLE_SWITCH` ships `enabled: false`, the
 * role is not in APP_ROLES, the roles table has no row for it, and `can()` below
 * refuses a DPO actor every action, exactly as it did before this block existed.
 * The table is not consulted for any of the five roles.
 * ------------------------------------------------------------------ */

export type DpoRoleSwitch = { readonly enabled: boolean; readonly question: string };

export const DPO_ROLE_SWITCH: DpoRoleSwitch = Object.freeze({
  enabled: false,
  question: 'Do we need a compliance role separate from Admin?',
});

const DPO_RULES: Readonly<Record<string, Rule<ObjType>>> = Object.freeze({
  'backoffice.enter': always,
  'user.read_self': self as Rule<ObjType>,
  'user.change_own_password': self as Rule<ObjType>,
  'user.change_own_profile': self as Rule<ObjType>,
  'compliance.read': always,
  'compliance.write': always,
  'compliance.identity_read': always,
  'compliance.identity_write': always,
  'disclosure.read': always,
});

/** The actions a DPO would hold, and only those. Every one is a registered action. */
export const DPO_SCOPE: readonly string[] = Object.freeze(Object.keys(DPO_RULES));

/**
 * The DPO's decision. OFF, false for everything. ON, the action must be in
 * `DPO_RULES` and its test must pass on the specific object — deny by default,
 * as `can` is. A disabled DPO, like a disabled admin, can do nothing.
 */
export function canAsDpo(
  actor: { readonly id: string; readonly role: string; readonly business_id: string | null; readonly disabled: boolean },
  action: string, object: Obj, sw: DpoRoleSwitch = DPO_ROLE_SWITCH,
): boolean {
  if (!sw.enabled || actor.disabled || actor.role !== DPO_ROLE) return false;
  if (!Object.prototype.hasOwnProperty.call(DPO_RULES, action)) return false;
  const rule = DPO_RULES[action];
  if (rule === undefined) return false;
  return rule(actor as unknown as Actor, object as Extract<Obj, { type: ObjType }>) === true;
}

/**
 * The decision. Returns a boolean and nothing else — no throw, no partial
 * result, no "allowed but filtered". Callers that need to refuse loudly use
 * `authorise` below, which is this plus an exception and an audit line.
 *
 * A DISABLED USER CAN DO NOTHING. Checked first, so a disabled admin is
 * refused before any rule gets the chance to say yes.
 */
export function can(actor: Actor, action: string, object: Obj): boolean {
  if (actor.disabled) return false;

  // Phase 129: a DPO actor is decided by its own switched-off table and by nothing below. Off, that is a refusal.
  if ((actor.role as string) === DPO_ROLE) return canAsDpo(actor, action, object);
  // Phase 132e: the view-only role is decided by its own explicit table and by nothing below.
  if (actor.role === 'READ_ONLY') return canAsReadOnly(actor, action, object);
  // Phase 151: a role the super admin made borrows each rule from a built-in staff role, and is decided by it here.
  const made = customRoleOf(actor.role as string);
  if (made !== undefined) return canAsCustomRole(actor, action, object, made.grants);

  const forAction = Object.prototype.hasOwnProperty.call(RULES, action)
    ? RULES[action as Action]
    : undefined;
  if (forAction === undefined) return false; // unregistered action — fails closed

  const rule = forAction[actor.role];
  if (rule === undefined) return false; // role not listed for this action

  return rule(actor, object as Extract<Obj, { type: ObjType }>) === true;
}

/**
 * PHASE 151: WHETHER A BUILT-IN STAFF ROLE HOLDS AN ACTION. The one fact about this table the role editor needs, so
 * that a made role can only borrow a rule that exists (src/custom-roles.ts, roleRefusal).
 */
export function builtInHolds(action: string, role: BorrowableRole): boolean {
  if (!Object.prototype.hasOwnProperty.call(RULES, action)) return false;
  return RULES[action as Action]?.[role] !== undefined;
}

/**
 * A made role's decision: the action must be granted, and the borrowed role's own test must pass on THIS object —
 * deny by default, as `can` is. A grant naming a rule the table no longer has is a refusal, not a pass.
 */
function canAsCustomRole(actor: Actor, action: string, object: Obj, grants: readonly { readonly action: string; readonly as_role: BorrowableRole }[]): boolean {
  const g = grants.find((x) => x.action === action);
  if (g === undefined || !Object.prototype.hasOwnProperty.call(RULES, action)) return false;
  const rule = RULES[action as Action]?.[g.as_role];
  if (rule === undefined) return false;
  return rule(actor, object as Extract<Obj, { type: ObjType }>) === true;
}

export class NotAuthorised extends Error {
  readonly code = 'E_NOT_AUTHORISED';
  constructor(action: string, objType: string) {
    // Deliberately vague to the caller: naming the object would confirm it
    // exists, which is an enumeration oracle. The audit line carries the detail.
    super(`not authorised to ${action} on ${objType}`);
    this.name = 'NotAuthorised';
  }
}

/** can(), plus the refusal. Use this on a request path so nothing forgets to check. */
export function authorise(actor: Actor, action: string, object: Obj): void {
  if (!can(actor, action, object)) throw new NotAuthorised(action, object.type);
}
