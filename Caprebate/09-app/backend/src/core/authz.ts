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
  /** A role the super admin made, or 'new' before it exists. */
  | { readonly type: 'role'; readonly id: string }
  | { readonly type: 'business'; readonly id: string }
  | { readonly type: 'assessment'; readonly id: string; readonly business_id: string }
  | { readonly type: 'answer'; readonly id: string; readonly business_id: string }
  | { readonly type: 'estimate'; readonly id: string; readonly business_id: string }
  | { readonly type: 'invoice'; readonly id: string; readonly business_id: string }
  | { readonly type: 'internal_note'; readonly id: string; readonly business_id: string }
  | { readonly type: 'register_record'; readonly id: string; readonly business_id: string }
  | { readonly type: 'research'; readonly id: string; readonly business_id: string }
  /** What staff have checked for a company and told its client — the approvals and the steps. */
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
   * that claim's own assessment — computed by src/modules/crm/crm.ts from
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
   * CLAIMS BY src/modules/claims/documents.ts: who its type admits (`readers`), whether the
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
       * Whether the client may see this file at all — theirs if they sent it, ours only once staff say so. Read by
       * src/modules/claims/documents.ts (`shownToClient`). Absent is not true: a client is refused a document that does not say.
       */
      readonly shown_to_client?: boolean;
      /** The client's owners — read by `document.read_original` for Sales. Absent is nobody. */
      readonly owner_ids?: readonly string[];
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
   * src/modules/claims/claim-record.ts: its kind, its state, and whether the claim's figure
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
   * A message on a company's "With the client" thread — the portal's Messages — and a reply that reached
   * contact@caprebate.co.uk. The "Team only" thread is the company's internal notes and stays `internal_note`: a
   * DIFFERENT object type in a DIFFERENT table, so no rule written for one can reach the other.
   */
  | { readonly type: 'client_message'; readonly id: string; readonly business_id: string; readonly assigned_surveyor_ids?: readonly string[] }
  | { readonly type: 'inbound_email'; readonly id: string };

export type ObjType = Obj['type'];

/** Narrow a rule to one object type without a cast at the call site. */
export type Rule<T extends ObjType> = (actor: Actor, object: Extract<Obj, { type: T }>) => boolean;

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
export type DocumentFacts = {
  readers: string; carries_value: boolean; letter_signed: boolean; assigned_surveyor_ids: readonly string[];
  /**
   * CRM 6 of 10. True only for a capital allowances report that is an ISSUED
   * client report on a claim whose tax adviser's sign-off record exists — read by
   * src/modules/claims/documents.ts. Absent on every other document, and absent is not true.
   */
  released_to_client?: boolean;
  /** See the `document` object. Absent is not true. */
  shown_to_client?: boolean;
  /**
   * The staff who own this client — the organisation's owner and the
   * owner of each of its claims. Read only by `document.read_original` for Sales. Absent is nobody (N4).
   */
  owner_ids?: readonly string[];
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
    // And never a file staff have not chosen to show them. A file the client sent is shown to them by rule.
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
 *   surveyor_job.*. That was settled and it is enforced
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
 * THE FIVE ROLES' TABLE. READ_ONLY is excluded from its type on purpose:
 * the view-only role is decided by `READ_ONLY_RULES` below, one explicit yes or no per
 * action, and never by a key here — so it cannot be given an action by being added to a row.
 */
export type RuleTable = {
  readonly [A in string]: Partial<Record<Exclude<AppRole, 'READ_ONLY'>, Rule<ObjType>>>;
};

/** One action's row: the five roles' tests, as in RuleTable. */
type RuleRow = RuleTable[string];

/**
 * THE TABLE, PUT TOGETHER. Each module declares its own actions in its actions.ts and hands them to registerActions
 * when it loads (its front door loads it first); the core's own are below. authorise() and can() read this one table,
 * as they always did. An action is declared by one area only: a second area naming it is refused at start.
 */
const RULES: Record<string, RuleRow> = {};
const OWNER = new Map<string, string>();
const REGISTERED: string[] = [];

/** Put a module's actions into the table (src/modules/<area>/actions.ts). Returns the table it was given. */
export function registerActions<T extends RuleTable>(area: string, table: T): T {
  for (const [action, row] of Object.entries(table)) {
    const had = OWNER.get(action);
    if (had !== undefined && had !== area) throw new Error(`the action ${action} is declared by ${had} and by ${area}: one module owns each action`);
    if (had === undefined) REGISTERED.push(action);
    OWNER.set(action, area);
    RULES[action] = row;
  }
  return table;
}

/** Which area declared an action, or undefined if none has. */
export function actionOwner(action: string): string | undefined {
  return OWNER.get(action);
}

/* THE CORE'S OWN ACTIONS. Every other action is declared by its module (src/modules/<area>/actions.ts) and put
   in this table when the module loads (registerActions below). */
const CORE_ACTIONS: RuleTable = {
  /* --- user administration. ADMIN alone, and that is the whole of it. --- */
  'user.create': { ADMIN: always },
  'user.update': { ADMIN: always },
  'user.disable': { ADMIN: always },
  'user.assign_role': { ADMIN: always },
  'user.list': { ADMIN: always },
  /* Making and changing roles (src/core/custom-roles.ts). The super admin's alone, and never grantable. */
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
   * "has nothing to open yet. Its view is Phase 107"; that view,
   * /staff/finance, was built the same week, so the note outlived its own fact. The
   * row is unchanged and was always right — what changed is only that the
   * landing page now leads somewhere.
   */
  'backoffice.enter': { ADMIN: always, SALES: always, ACCOUNTING: always, SURVEYING: always },
};

registerActions('core', CORE_ACTIONS);

export type Action = string;

/** Every action the table knows. Used by the deny-by-default test and by /whoami. */
export const REGISTERED_ACTIONS: readonly string[] = REGISTERED;

/** The tests the rules are built from, for the modules' own tables (their actions.ts). */
export const PREDICATES = Object.freeze({
  always, ownBusiness, isOwnBusiness, assignedSurveyor, self, ownWorkingTime, throughAssignedJob, ownOrPooledTask,
  ownTaskOnAssignedJob, salesDocument, accountingDocument, surveyorDocument, clientDocument, ownView, clientDeliverable,
});



/* ------------------------------------------------------------------ *
 * THE READ-ONLY ROLE — AN EXPLICIT YES OR NO ON EVERY ACTION.
 *
 *
 * the owner: "One main log in for admin/manager/owner, and another log for view
 * only". ADMIN is the main login. READ_ONLY is the view-only one, and it is
 * assigned to nobody (no seed user).
 *
 * WHY A TABLE OF ITS OWN, AND NOT A COLUMN IN `RULES`. A role absent from a row
 * of `RULES` is refused, which is right — but it is refused SILENTLY, and a
 * future row that forgot this role would be decided by forgetting. Here every
 * registered action carries a decision and a reason, and test/core/permissions.test.ts
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
  'client_report.accept': NO('the client\'s own action; also a write'),
  'engagement.read': YES('whether the letter is sent, viewed or signed — a state, with no fee in it'),
  'engagement.send': NO(WRITES),
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
  'client_billing.read': NO('money, and who to chase for it — Accounting’s'),
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
  'compliance.breach_names': NO('the restricted breach names list — the officer and the named deputy only'),
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
 * The view-only decision. An action with no entry is refused (and test/core/permissions.test.ts fails on it). A "no" is
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
 *
 *
 * WHAT IS BUILT. The rows a DPO would hold: the compliance registers, S2, the
 * per-disclosure log's reading, the back office's front door and their own
 * account — and NOTHING ELSE. Not the audit log, not users and roles, not the
 * admin settings, not a claim, a document, a lead or the money. So a DPO could
 * keep the registers without being able to add a salesperson or read the whole
 * audit log, which is what the question sets out.
 *
 * WHY IT IS OFF. Whether there is a sixth role at all is the owner's question —
 * "Do we need a compliance role separate from Admin?" — and the five-role model
 * is a decision (src/core/roles.ts). So `DPO_ROLE_SWITCH` ships `enabled: false`, the
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
  'compliance.breach_names': always,
  'disclosure.read': always,
  // The officer may open a kept original.
  'document.read_original': always,
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

  // A DPO actor is decided by its own switched-off table and by nothing below. Off, that is a refusal.
  if ((actor.role as string) === DPO_ROLE) return canAsDpo(actor, action, object);
  // The view-only role is decided by its own explicit table and by nothing below.
  if (actor.role === 'READ_ONLY') return canAsReadOnly(actor, action, object);
  // A role the super admin made borrows each rule from a built-in staff role, and is decided by it here.
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
 * WHETHER A BUILT-IN STAFF ROLE HOLDS AN ACTION. The one fact about this table the role editor needs, so
 * that a made role can only borrow a rule that exists (src/core/custom-roles.ts, roleRefusal).
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
