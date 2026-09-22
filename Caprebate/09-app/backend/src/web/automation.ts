/**
 * AUTOMATION RULES — A TRIGGER, AN EFFECT, AND WHAT NO RULE MAY EVER DO.
 * CRM 3 of 10, 11 September 2026.
 *
 * The rules are migration 012's `automation_rules`, which ADMIN edits; what each
 * one did is `automation_runs`; the page is src/web/tasks-pages.ts. CRM 9 of 10
 * builds the settings screen around this store (disposition row 14.10).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FULL SPECIFICATION'S LIST, RE-KEYED ONTO THE PROCEDURE
 *
 * The rules migration 012 seeds are section 14 of the full specification with
 * each trigger moved onto something this build actually records. "Moves to
 * Qualified" is a claim entering DATA_GATHERING, which only the signed letter
 * opens; "Survey Completed" is a claim entering VALUATION, which only the
 * surveyor's commitment opens; "Claim Completed" is the INVOICE stage. The
 * information-request tasks are generated from `missingFacts` — the business
 * page's DERIVED missing list — one per fact nobody has yet asked for, and never
 * from a list typed into a rule.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT NO RULE MAY DO, AND WHAT HOLDS EACH ONE
 *
 *   open either register gate        no effect can. This file imports neither the engine, the research
 *                                    button, the register stub nor the signature stub.
 *   move a claim past a gate         no effect can. Nothing here moves a claim or records a confirmation.
 *   flip a tax adviser's switch      no effect can. The switches are the engine's constants.
 *   fire a register call             no effect can, for the reason in the first line.
 *   send anywhere but the outbox     the one transport here is `outboxTransport`, built in this file from
 *                                    the database — NOT the application's transport, so a real mailer
 *                                    swapped in later still carries nothing a rule writes.
 *   write to a DO_NOT_CONTACT org    every rule on one records NOT_RUN, before its effect; the outbox and
 *                                    its trigger refuse the notice again behind that.
 *   create an invoice email          no effect writes to a client at all. A notice goes to a member of
 *                                    staff, and a template carrying an invoice is refused by its store.
 *
 * Each is also a NAMED refusal in `FORBIDDEN_EFFECTS`, refused by the rule store
 * with its reason and by the table's CHECK, and each has a test in
 * test/automation.test.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A RULE THAT DOES NOT RUN SAYS SO
 *
 * Every active rule matching an event writes one run: RAN, or NOT_RUN with its
 * reason. A GATED_EXIT lead has no organisation, and a rule whose effect needs
 * one records NEEDS_ORGANISATION — the lead is never skipped silently. A rule
 * that fails writes NOT_RUN ERROR and does not undo the event it followed: the
 * stage move, the conversion or the completion has already committed, and the
 * person who made it is not shown a failure that was not theirs.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { outboxTransport, STUB_NOTICE } from '../stubs/email.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localDate, localStamp } from './localtime.ts';
import { EXIT_KEYS, PROCEDURE_KEYS, anyStageLabel } from './stages.ts';
import { missingFacts } from './engaged.ts';
import { POOL_ROLES, addDaysToDate, insertTask } from './tasks.ts';
import { claimWords, type Fields } from './crm.ts';
import { mayTake, vocabLabel } from './vocabularies.ts';
import { createDocumentRequest, NO_RECEIPT_POLICY } from './documents.ts';

export type AutomationDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
export type RuleResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

type Vocab = Readonly<Record<string, string>>;

export const TRIGGERS: Vocab = Object.freeze({
  LEAD_CREATED: 'A lead is created',
  STAGE_ENTERED: 'A claim enters a stage',
  DOCUMENT_REQUESTED: 'A document is requested',
  TASK_COMPLETED: 'A task is completed',
  OWNER_CHANGED: 'An owner changes — of a claim, a lead or a task',
});

export const EFFECTS: Vocab = Object.freeze({
  CREATE_TASK: 'A task, from the rule’s template',
  FOLLOW_UP: 'A follow-up date — a follow-up task, due in the days the rule gives',
  NOTIFY_OWNER: 'A notice to the owner, added to the emails waiting to send',
  INFORMATION_REQUEST_TASKS: 'Tasks to ask for information — one for each missing fact nobody has asked for yet',
  // CRM 9 of 10: raised through createDocumentRequest, the store a person uses, and never a second insert.
  REQUEST_DOCUMENT: 'A document request to the client — of a type something can receive, saying why and what it holds up',
});

/**
 * WHAT NO RULE MAY DO — each refused BY NAME, with the reason, so an ADMIN who
 * asks for one is told why rather than finding it missing from a list.
 */
export const FORBIDDEN_EFFECTS: Vocab = Object.freeze({
  OPEN_FREE_GATE: 'No rule can turn on free lookups. They start when our privacy notice is published.',
  OPEN_PAID_GATE: 'No rule can turn on paid lookups. They need a signed engagement letter and a person to click.',
  SIGN_ENGAGEMENT: 'No rule can record a signature. Only the client signs the engagement letter.',
  MOVE_CLAIM: 'No rule can move a claim. A person moves it, and each step is checked first.',
  RECORD_CONFIRMATION: 'No rule can record a confirmation that a step checks. That would let a claim skip the check.',
  FLIP_CTA_SWITCH: 'No rule can change a tax adviser’s switch. Each stays off until a chartered tax adviser answers.',
  FIRE_REGISTER_CALL: 'No rule can look up a register. A person chooses when to do it.',
  RUN_RESEARCH: 'No rule can run the research. A person chooses when to do it.',
  SEND_EMAIL: 'No rule can send a message itself. It can only add a notice to the emails waiting to send.',
  SEND_SMS: 'No rule can send a message itself.',
  WEBHOOK: 'No rule can send a message itself.',
  WRITE_TO_DO_NOT_CONTACT: 'No rule can write to an organisation marked do not contact.',
  INVOICE_EMAIL: 'No rule can make an invoice email. That waits on our invoice-fraud procedure.',
  // CRM 7 of 10: the two an invoice email would arrive as by another name.
  INVOICE_REMINDER: 'No rule can chase an invoice or a payment. A reminder is an invoice email too. It waits on our invoice-fraud procedure.',
  SEND_BANK_DETAILS: 'No rule can send or change our bank details. The client checks them with us another way than email. We never change them because an email asked.',
});

/**
 * THE INVOICE-FRAUD PROCEDURE — WHERE IT STANDS. CRM 7 of 10, 11 September 2026.
 *
 * The invoice email is not built, and every refusal of it above and in
 * src/web/templates.ts holds while this says `in_force: false`. The procedure did
 * not exist in the operating procedure's export; CRM 7 of 10 drafted it into SOP 9
 * as a FLAGGED DRAFT ADDITION and entered its sign-off in the register for the
 * solicitor, the data protection officer and the developer. test/finance-claim.test.ts
 * reads the export and fails if this says in force while the export says draft.
 *
 * TURNING IT ON IS NOT THIS FLAG. When the procedure is signed off, building the
 * invoice email is a piece of work — its template, its channel and its checks —
 * and the refusals are lifted in that work, deliberately, not by a boolean.
 */
export const INVOICE_FRAUD_PROCEDURE: { readonly in_force: boolean; readonly where: string; readonly signoff: string } = Object.freeze({
  in_force: false,
  where: 'Section 9 of our operating procedures. It is marked as a DRAFT ADDITION, written on 11 September 2026',
  signoff: 'the solicitor, the DPO and the developer still have to sign it off',
});

export const ASSIGN: Vocab = Object.freeze({
  SUBJECT_OWNER: 'The owner of what the event is about — or the team named, where it has none',
  ROLE: 'The team named, until somebody takes it',
});

export const ATTACH: Vocab = Object.freeze({
  SUBJECT: 'What the event is about — the claim, the lead, or the task’s own subject',
  ORGANISATION: 'The organisation — so the rule needs one',
});

export const RUN_REASONS: Vocab = Object.freeze({
  DO_NOT_CONTACT: 'the organisation is marked do not contact, and no rule writes to it',
  NEEDS_ORGANISATION: 'this rule needs an organisation and there is none yet — it did not run, and this line is the record that it did not',
  NOBODY_TO_OWN_IT: 'there is nobody to own the task: what the event is about has no owner, and the rule names no team',
  NO_OWNER: 'nobody owns what the event is about, so there is nobody to tell',
  OWNER_MADE_THE_CHANGE: 'the owner made the change themselves, so there is nobody else to tell',
  OWNER_IS_NOT_STAFF: 'the owner is not a member of staff, and a rule only ever writes to staff',
  NO_ONE_TO_READ_THE_MISSING_LIST: 'nobody who can see the missing list caused the event, so the list could not be worked out',
  NOTHING_MISSING: 'everything on the missing list has already been asked for',
  EFFECT_NOT_ALLOWED: 'the rule names an effect no rule may have',
  NO_ONE_TO_RAISE_THE_REQUEST: 'nobody who may raise a document request caused the event, so no request was raised',
  REQUEST_REFUSED: 'the document request was refused — the type is retired, or nothing can receive it — so nothing was raised',
  ERROR: 'the rule failed and wrote nothing; the event it followed stands',
});

const STAGE_KEYS: readonly string[] = Object.freeze([...PROCEDURE_KEYS, 'CLOSED', ...EXIT_KEYS, 'ON_HOLD']);

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

type Check<T> = { ok: true; value: T } | { ok: false; why: string; field?: string };

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/* ================================================================== *
 * 1 · THE RULES
 * ================================================================== */

type RuleDbRow = {
  id: string; label: string; trigger_event: string; trigger_stage: string | null; trigger_activity: string | null;
  effect: string; task_title: string | null; task_description: string | null; task_activity_type: string | null;
  task_priority: string | null; due_in_days: number | null; assign_to: string | null; assign_role: string | null;
  attach_to: string; active: number; ord: number; source: string; created_at: string; updated_at: string;
  request_type: string | null;
};

const RULE_SELECT =
  'SELECT id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, ' +
  'task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, source, ' +
  'created_at, updated_at, request_type FROM automation_rules ';

export type RuleView = {
  readonly id: string;
  readonly label: string;
  readonly trigger: { readonly key: string; readonly label: string; readonly stage: string | null; readonly activity: string | null };
  readonly effect: { readonly key: string; readonly label: string };
  readonly task: {
    readonly title: string | null; readonly description: string | null; readonly activity: string | null;
    readonly priority: string | null; readonly due_in_days: number | null;
  } | null;
  readonly assign: { readonly to: string | null; readonly role: string | null; readonly label: string };
  readonly attach_to: { readonly key: string; readonly label: string };
  readonly active: boolean;
  readonly source: string;
  readonly updated: string;
  /** CRM 9 of 10: the document type a REQUEST_DOCUMENT rule asks the client for. */
  readonly request_type: string | null;
};

/**
 * PHASE 144: WHERE EACH SEEDED RULE CAME FROM, IN PLAIN WORDS. Migration 012 stored each seeded rule's `source` in the
 * words of the design notes ("It fires for…", "the DERIVED missing list", "the engagement gate"). A migration already
 * run is never edited, so the screen shows these words for the nine seeded rules instead; the stored text is unchanged,
 * and a rule an Admin adds shows its own.
 */
const SEEDED_RULE_WHY: Readonly<Record<string, string>> = Object.freeze({
  'rule-lead-first-follow-up': 'Our specification, 14.1. A new lead gets an owner and a first follow-up. If the lead has no owner, it waits with Sales until someone takes it. This works for a lead with no company too.',
  'rule-engaged-information-requests': 'Our specification, 14.2. A claim reaches data gathering only once the letter is signed. Then we ask for each fact nobody has asked for yet, one task each, from the list on the client page.',
  'rule-survey-brief': 'Our specification, 14.3 and 14.4. When data gathering is done, the survey starts, and this is the next task. No visit is booked here: the survey starts at a desk.',
  'rule-committed-valuation': 'Our specification, 14.5. A claim leaves the survey step only when the surveyor commits, so this task starts then.',
  'rule-committed-reports': 'Our specification, 14.5. The report task that goes with the one above.',
  'rule-reports-follow-up': 'Our specification, 14.6. When the client starts reading the report, we set a date to follow up.',
  'rule-invoice-finance-task': 'Our specification, 14.7. At the invoice step, Accounting gets a task. It is never an invoice email.',
  'rule-stage-notify-owner': 'Our specification, 14.9. When a claim moves on, its owner is told by email. It goes only to their own work address, and never about a company marked do not contact.',
  'rule-owner-notify': 'Our specification, 14.9. When the owner changes, the new owner is told by email.',
});

function ruleView(db: Db, r: RuleDbRow): RuleView {
  const when = r.trigger_event === 'STAGE_ENTERED'
    ? `${words(TRIGGERS, r.trigger_event, r.trigger_event)}: ${r.trigger_stage === null ? 'any stage' : anyStageLabel(r.trigger_stage)}`
    : r.trigger_event === 'TASK_COMPLETED'
      ? `${words(TRIGGERS, r.trigger_event, r.trigger_event)}: ${r.trigger_activity === null ? 'any activity' : vocabLabel(db, 'ACTIVITY_TYPE', r.trigger_activity, r.trigger_activity)}`
      : words(TRIGGERS, r.trigger_event, r.trigger_event);
  return {
    id: r.id, label: r.label,
    trigger: { key: r.trigger_event, label: when, stage: r.trigger_stage, activity: r.trigger_activity },
    effect: { key: r.effect, label: words(EFFECTS, r.effect, r.effect) },
    task: r.effect === 'NOTIFY_OWNER' ? null : {
      title: r.task_title, description: r.task_description, activity: r.task_activity_type,
      priority: r.task_priority, due_in_days: r.due_in_days,
    },
    assign: {
      to: r.assign_to, role: r.assign_role,
      label: r.effect === 'NOTIFY_OWNER' ? 'the owner'
        : r.assign_to === 'ROLE' ? `waits with ${words(POOL_ROLES, r.assign_role, 'no team')}`
          : `the owner, or ${r.assign_role === null ? 'nobody' : words(POOL_ROLES, r.assign_role, r.assign_role)} where there is none`,
    },
    attach_to: { key: r.attach_to, label: words(ATTACH, r.attach_to, r.attach_to) },
    active: r.active === 1,
    source: SEEDED_RULE_WHY[r.id] ?? r.source,
    updated: localStamp(r.updated_at),
    request_type: r.request_type,
  };
}

export type RunView = {
  readonly at: string;
  readonly rule: string;
  readonly trigger: string;
  readonly ran: boolean;
  readonly reason: string | null;
  readonly tasks_created: number;
  readonly outbox: boolean;
  readonly about: string;
};

export type RulesPage = {
  readonly rules: readonly RuleView[];
  readonly runs: readonly RunView[];
  readonly may_write: boolean;
  readonly forbidden: readonly { readonly key: string; readonly why: string }[];
  /** CRM 9 of 10: the document types a REQUEST_DOCUMENT rule may ask for — active, and something can receive them. */
  readonly request_types: Readonly<Record<string, string>>;
};

const RULES_SECTION = { type: 'automation_rule' as const, id: '__rules__' };

export function rulesPage(db: Db, actor: Actor): RulesPage {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
  return {
    rules: db.all<RuleDbRow>(`${RULE_SELECT}ORDER BY ord ASC, id ASC`).map((r) => ruleView(db, r)),
    runs: recentRuns(db, actor),
    may_write: can(actor, 'automation_rule.write', RULES_SECTION),
    forbidden: Object.entries(FORBIDDEN_EFFECTS).map(([key, why]) => ({ key, why })),
    request_types: Object.fromEntries(db.all<{ code: string; label: string }>(
      'SELECT code, label FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC').map((t) => [t.code, t.label])),
  };
}

export function recentRuns(db: Db, actor: Actor, limit = 100): RunView[] {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
  return db.all<{
    at: string; trigger_event: string; outcome: string; reason: string | null; tasks_created: number; outbox_id: string | null;
    claim_id: string | null; lead_id: string | null; task_id: string | null; label: string;
  }>(
    'SELECT r.at, r.trigger_event, r.outcome, r.reason, r.tasks_created, r.outbox_id, c.id AS claim_id, r.lead_id, r.task_id, ' +
      'ar.label FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id LEFT JOIN claims c ON c.id = r.claim_id ' +
      'ORDER BY r.at DESC, r.rowid DESC LIMIT ?',
    [limit],
  ).map((r) => ({
    at: localStamp(r.at), rule: r.label, trigger: words(TRIGGERS, r.trigger_event, r.trigger_event),
    ran: r.outcome === 'RAN', reason: r.reason === null ? null : words(RUN_REASONS, r.reason, r.reason),
    tasks_created: r.tasks_created, outbox: r.outbox_id !== null,
    about: r.claim_id !== null ? claimWords(db, r.claim_id) : r.lead_id !== null ? 'a lead' : r.task_id !== null ? 'a task' : 'a company',
  }));
}

type RuleValues = {
  label: string; trigger_event: string; trigger_stage: string | null; trigger_activity: string | null; effect: string;
  task_title: string | null; task_description: string | null; task_activity_type: string | null; task_priority: string | null;
  due_in_days: number | null; assign_to: string | null; assign_role: string | null; attach_to: string; active: number;
  request_type: string | null;
};

/**
 * EVERY FIELD, CHECKED AGAINST ITS LIST. The rule form posts every field, so this
 * reads them all rather than touching only the ones carried.
 */
function ruleValues(db: Db, input: Fields, stored: RuleDbRow | null = null): Check<RuleValues> {
  const label = clean(input['label']);
  if (label === null) return { ok: false, why: 'Give the rule a label a person can read.', field: 'label' };
  if (label.length > 200) return { ok: false, why: 'The label is longer than we store — 200 characters is the limit.', field: 'label' };
  const trigger = clean(input['trigger_event']);
  if (!has(TRIGGERS, trigger)) return { ok: false, why: 'Choose one of the triggers: a lead created, a stage entered, a document requested, a task completed, or an owner changed.', field: 'trigger_event' };
  const effect = clean(input['effect']);
  if (effect !== null && has(FORBIDDEN_EFFECTS, effect)) return { ok: false, why: FORBIDDEN_EFFECTS[effect] ?? 'No rule may do that.', field: 'effect' };
  if (!has(EFFECTS, effect)) {
    return {
      ok: false,
      why: 'A rule cannot do that. It can make a task, set a follow-up, send a notice to the owner, ask for information, or ask the client for a document.',
    };
  }
  const stage = clean(input['trigger_stage']);
  if (stage !== null && trigger !== 'STAGE_ENTERED') return { ok: false, why: 'Only a “stage entered” rule listens for a stage.', field: 'trigger_stage' };
  if (stage !== null && !STAGE_KEYS.includes(stage)) return { ok: false, why: 'The stage is not one of the operating procedure’s.', field: 'trigger_stage' };
  const activity = clean(input['trigger_activity']);
  if (activity !== null && trigger !== 'TASK_COMPLETED') return { ok: false, why: 'Only a “task completed” rule listens for an activity.', field: 'trigger_activity' };
  if (activity !== null && activity !== stored?.trigger_activity
    && db.get<{ n: number }>("SELECT COUNT(*) AS n FROM vocabularies WHERE list = 'ACTIVITY_TYPE' AND code = ?", [activity])?.n === 0) {
    return { ok: false, why: 'The activity is not one on the list.', field: 'trigger_activity' };
  }
  const attach = clean(input['attach_to']) ?? 'SUBJECT';
  if (!has(ATTACH, attach)) return { ok: false, why: 'Choose what the rule’s task is attached to.', field: 'attach_to' };
  const active = clean(input['active']) === 'no' ? 0 : 1;

  if (effect === 'NOTIFY_OWNER') {
    if (attach !== 'SUBJECT') return { ok: false, why: 'A notice goes to the owner of what the event is about.', field: 'attach_to' };
    return {
      ok: true,
      value: {
        label, trigger_event: trigger, trigger_stage: stage, trigger_activity: activity, effect, task_title: null,
        task_description: null, task_activity_type: null, task_priority: null, due_in_days: null, assign_to: null,
        assign_role: null, attach_to: attach, active, request_type: null,
      },
    };
  }
  // CRM 9 of 10: A RULE THAT ASKS THE CLIENT FOR A DOCUMENT. Of a type something can receive, saying why and what it holds
  // up — the client reads both — due the rule's days after the event; never raised by a document request, or it would ask for ever.
  if (effect === 'REQUEST_DOCUMENT') {
    if (trigger === 'DOCUMENT_REQUESTED') return { ok: false, why: 'A rule a document request raises may not raise one itself — it would ask again for ever.', field: 'effect' };
    if (attach !== 'SUBJECT') return { ok: false, why: 'A document request is raised on what the event is about.', field: 'attach_to' };
    const type = clean(input['request_type']);
    if (type === null) return { ok: false, why: 'Choose the document the rule asks the client for.', field: 'request_type' };
    const t = db.get<{ handler_type: string | null; active: number }>('SELECT handler_type, active FROM document_types WHERE code = ?', [type]);
    if (t === undefined || t.active !== 1) return { ok: false, why: 'That document type is not an active one.', field: 'request_type' };
    if (t.handler_type === null) return { ok: false, why: `A rule may ask only for a document something could receive. ${NO_RECEIPT_POLICY}`, field: 'request_type' };
    const why = clean(input['task_title']);
    const holds = clean(input['task_description']);
    if (why === null || holds === null) return { ok: false, why: 'A request says why the document is needed and what it holds up — the client reads both.', field: 'task_title' };
    if (why.length > 300 || holds.length > 4000) return { ok: false, why: 'The reason or what it holds up is longer than we store.', field: 'task_title' };
    const reqDays = Number(clean(input['due_in_days']) ?? Number.NaN);
    if (!Number.isInteger(reqDays) || reqDays < 0 || reqDays > 365) return { ok: false, why: 'Say how many days after the event the document is due — a whole number from 0 to 365.', field: 'due_in_days' };
    return {
      ok: true,
      value: {
        label, trigger_event: trigger, trigger_stage: stage, trigger_activity: activity, effect, task_title: why, task_description: holds,
        task_activity_type: null, task_priority: null, due_in_days: reqDays, assign_to: null, assign_role: null, attach_to: attach, active,
        request_type: type,
      },
    };
  }
  const title = clean(input['task_title']);
  if (title !== null && title.length > 300) return { ok: false, why: 'The task is longer than we store — 300 characters is the limit.', field: 'task_title' };
  if (title === null && effect !== 'INFORMATION_REQUEST_TASKS') return { ok: false, why: 'Say what the task the rule creates is.', field: 'task_title' };
  const description = clean(input['task_description']);
  if (description !== null && description.length > 4000) return { ok: false, why: 'The description is longer than we store.', field: 'task_description' };
  const taskActivity = clean(input['task_activity_type']);
  if (taskActivity === null || !mayTake(db, 'ACTIVITY_TYPE', taskActivity, stored?.task_activity_type ?? null)) return { ok: false, why: 'Choose the activity the task is — “other” is a choice.', field: 'task_activity_type' };
  const priority = clean(input['task_priority']);
  if (priority !== null && !mayTake(db, 'PRIORITY', priority, stored?.task_priority ?? null)) return { ok: false, why: 'The priority is not one of the choices offered.' };
  const daysRaw = clean(input['due_in_days']);
  const days = daysRaw === null ? Number.NaN : Number(daysRaw);
  if (!Number.isInteger(days) || days < 0 || days > 365) return { ok: false, why: 'Say how many days after the event the task is due — a whole number from 0 to 365.' };
  const assign = clean(input['assign_to']);
  if (!has(ASSIGN, assign)) return { ok: false, why: 'Say who the task goes to.' };
  const role = clean(input['assign_role']);
  if (role !== null && !has(POOL_ROLES, role)) return { ok: false, why: 'The team must be one of the four staff teams.' };
  if (assign === 'ROLE' && role === null) return { ok: false, why: 'Name the team the task waits with.' };
  return {
    ok: true,
    value: {
      label, trigger_event: trigger, trigger_stage: stage, trigger_activity: activity, effect, task_title: title,
      task_description: description, task_activity_type: taskActivity, task_priority: priority, due_in_days: days,
      assign_to: assign, assign_role: role, attach_to: attach, active, request_type: null,
    },
  };
}

export function createRule(d: AutomationDeps, actor: Actor, input: Fields): RuleResult {
  authorise(actor, 'automation_rule.write', RULES_SECTION);
  const v = ruleValues(d.db, input);
  if (!v.ok) return v;
  const id = d.newId();
  const at = d.now();
  const ord = (d.db.get<{ n: number | null }>('SELECT MAX(ord) AS n FROM automation_rules')?.n ?? 0) + 10;
  d.db.run(
    'INSERT INTO automation_rules (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, ' +
      'task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, ' +
      'source, created_at, updated_at, request_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, v.value.label, v.value.trigger_event, v.value.trigger_stage, v.value.trigger_activity, v.value.effect,
      v.value.task_title, v.value.task_description, v.value.task_activity_type, v.value.task_priority, v.value.due_in_days,
      v.value.assign_to, v.value.assign_role, v.value.attach_to, v.value.active, ord, 'Added by an admin', at, at, v.value.request_type],
  );
  d.audit.append({
    at, kind: 'AUTOMATION_RULE_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'automation_rule', object_id: id, detail: { rule: id, trigger: v.value.trigger_event, effect: v.value.effect },
  });
  return { ok: true, id };
}

/** CHANGE A RULE, OR RETIRE IT. A rule is never deleted: its runs still name it. */
export function updateRule(d: AutomationDeps, actor: Actor, id: string, input: Fields): RuleResult {
  authorise(actor, 'automation_rule.write', { type: 'automation_rule', id });
  const r = d.db.get<RuleDbRow>(`${RULE_SELECT}WHERE id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  const v = ruleValues(d.db, input, r);
  if (!v.ok) return v;
  const before: Record<string, unknown> = { ...r };
  const changed = (Object.keys(v.value) as (keyof RuleValues)[]).filter((k) => before[k] !== v.value[k]);
  if (changed.length === 0) return { ok: true, id };
  d.db.run(
    'UPDATE automation_rules SET label = ?, trigger_event = ?, trigger_stage = ?, trigger_activity = ?, effect = ?, ' +
      'task_title = ?, task_description = ?, task_activity_type = ?, task_priority = ?, due_in_days = ?, assign_to = ?, ' +
      'assign_role = ?, attach_to = ?, active = ?, request_type = ?, updated_at = ? WHERE id = ?',
    [v.value.label, v.value.trigger_event, v.value.trigger_stage, v.value.trigger_activity, v.value.effect,
      v.value.task_title, v.value.task_description, v.value.task_activity_type, v.value.task_priority, v.value.due_in_days,
      v.value.assign_to, v.value.assign_role, v.value.attach_to, v.value.active, v.value.request_type, d.now(), id],
  );
  d.audit.append({
    at: d.now(), kind: 'AUTOMATION_RULE_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'automation_rule', object_id: id, detail: { rule: id, fields: changed },
  });
  return { ok: true, id };
}

/* ================================================================== *
 * 2 · EVENTS, AND RUNNING THE RULES THAT MATCH
 * ================================================================== */

export type AutomationEvent =
  | { readonly trigger: 'LEAD_CREATED'; readonly lead_id: string }
  | { readonly trigger: 'STAGE_ENTERED'; readonly claim_id: string; readonly stage: string }
  | { readonly trigger: 'TASK_COMPLETED'; readonly task_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly claim_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly lead_id: string }
  | { readonly trigger: 'OWNER_CHANGED'; readonly task_id: string }
  /** No source raises this yet: CRM 4 of 10 builds document requests and calls it. */
  | { readonly trigger: 'DOCUMENT_REQUESTED'; readonly business_id: string; readonly claim_id: string | null };

type Subject = {
  readonly kind: 'claim' | 'lead' | 'task' | 'organisation';
  readonly claim_id: string | null;
  readonly lead_id: string | null;
  readonly task_id: string | null;
  readonly business_id: string | null;
  readonly property_id: string | null;
  readonly owner_id: string | null;
  readonly activity: string | null;
  /** The claim's reference where there is one — never a person's or an organisation's name. */
  readonly reference: string;
};

function claimSubject(db: Db, claim_id: string): Subject | null {
  const c = db.get<{ id: string; claim_ref: string; business_id: string; property_id: string | null; owner_id: string | null }>(
    'SELECT id, claim_ref, business_id, property_id, owner_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return null;
  return {
    kind: 'claim', claim_id: c.id, lead_id: null, task_id: null, business_id: c.business_id, property_id: c.property_id,
    owner_id: c.owner_id, activity: null, reference: c.claim_ref,
  };
}

function subjectOf(db: Db, e: AutomationEvent): Subject | null {
  if (e.trigger === 'DOCUMENT_REQUESTED') {
    if (e.claim_id !== null) return claimSubject(db, e.claim_id);
    const b = db.get<{ id: string; owner_id: string | null }>('SELECT id, owner_id FROM businesses WHERE id = ?', [e.business_id]);
    if (b === undefined) return null;
    return {
      kind: 'organisation', claim_id: null, lead_id: null, task_id: null, business_id: b.id, property_id: null,
      owner_id: b.owner_id, activity: null, reference: 'the organisation',
    };
  }
  if ('task_id' in e) {
    const t = db.get<{
      id: string; business_id: string | null; property_id: string | null; claim_id: string | null; lead_id: string | null;
      owner_id: string | null; activity_type: string; claim_ref: string | null;
    }>(
      'SELECT t.id, t.business_id, t.property_id, t.claim_id, t.lead_id, t.owner_id, t.activity_type, c.claim_ref ' +
        'FROM staff_tasks t LEFT JOIN claims c ON c.id = t.claim_id WHERE t.id = ?',
      [e.task_id]);
    if (t === undefined) return null;
    return {
      kind: 'task', claim_id: t.claim_id, lead_id: t.lead_id, task_id: t.id, business_id: t.business_id,
      property_id: t.property_id, owner_id: t.owner_id, activity: t.activity_type, reference: t.claim_ref ?? 'a task',
    };
  }
  if ('lead_id' in e) {
    const l = db.get<{ id: string; business_id: string | null; owner_id: string | null }>(
      'SELECT id, business_id, owner_id FROM leads WHERE id = ?', [e.lead_id]);
    if (l === undefined) return null;
    return {
      kind: 'lead', claim_id: null, lead_id: l.id, task_id: null, business_id: l.business_id, property_id: null,
      owner_id: l.owner_id, activity: null, reference: 'a lead',
    };
  }
  return claimSubject(db, e.claim_id);
}

function matches(r: RuleDbRow, e: AutomationEvent, s: Subject): boolean {
  if (r.trigger_event === 'STAGE_ENTERED') return r.trigger_stage === null || (e.trigger === 'STAGE_ENTERED' && r.trigger_stage === e.stage);
  if (r.trigger_event === 'TASK_COMPLETED') return r.trigger_activity === null || r.trigger_activity === s.activity;
  return true;
}

export type RunOutcome = {
  readonly rule_id: string;
  readonly run_id: string;
  readonly outcome: 'RAN' | 'NOT_RUN';
  readonly reason: string | null;
  readonly tasks_created: number;
  readonly outbox_id: string | null;
};

type Result = { outcome: 'RAN' | 'NOT_RUN'; reason: string | null; tasks: number; outbox_id: string | null };

function writeRun(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject, o: Result): string {
  const id = d.newId();
  d.db.run(
    'INSERT INTO automation_runs (id, rule_id, at, trigger_event, stage, claim_id, lead_id, task_id, business_id, actor_id, ' +
      'outcome, reason, tasks_created, outbox_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, rule.id, d.now(), e.trigger, e.trigger === 'STAGE_ENTERED' ? e.stage : null, s.claim_id, s.lead_id, s.task_id,
      s.business_id, actor?.id ?? null, o.outcome, o.reason, o.tasks, o.outbox_id],
  );
  return id;
}

function finish(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject, run_id: string, o: Result): RunOutcome {
  d.audit.append({
    at: d.now(), kind: 'AUTOMATION_RAN', outcome: o.outcome === 'RAN' ? 'ALLOWED' : 'REFUSED',
    actor_id: actor?.id ?? null, actor_role: actor?.role ?? null, object_type: 'automation_rule', object_id: rule.id,
    detail: {
      run: run_id, result: o.outcome, reason: o.reason, trigger: e.trigger, claim: s.claim_id, lead: s.lead_id,
      task: s.task_id, tasks: o.tasks, outbox: o.outbox_id,
    },
  });
  return { rule_id: rule.id, run_id, outcome: o.outcome, reason: o.reason, tasks_created: o.tasks, outbox_id: o.outbox_id };
}

function notRun(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject, reason: string): RunOutcome {
  const o: Result = { outcome: 'NOT_RUN', reason, tasks: 0, outbox_id: null };
  const run = d.db.tx(() => writeRun(d, actor, rule, e, s, o));
  return finish(d, actor, rule, e, s, run, o);
}

function isDoNotContactOrganisation(db: Db, business_id: string): boolean {
  return db.get<{ client_status: string }>('SELECT client_status FROM businesses WHERE id = ?', [business_id])?.client_status === 'DO_NOT_CONTACT';
}

function activeStaff(db: Db, user_id: string): boolean {
  const u = db.get<{ role: string; disabled_at: string | null }>('SELECT role, disabled_at FROM users WHERE id = ?', [user_id]);
  // Phase 132e: a READ_ONLY login owns no work — it may not progress a task — so it is not an owner either.
  return u !== undefined && u.disabled_at === null && u.role !== 'CLIENT' && u.role !== 'READ_ONLY';
}

function ownerFor(db: Db, rule: RuleDbRow, s: Subject): { owner_id: string | null; owner_role: string | null } | null {
  if (rule.assign_to === 'SUBJECT_OWNER' && s.owner_id !== null && activeStaff(db, s.owner_id)) {
    return { owner_id: s.owner_id, owner_role: null };
  }
  if (rule.assign_role !== null) return { owner_id: null, owner_role: rule.assign_role };
  return null;
}

function attachment(rule: RuleDbRow, s: Subject): { business_id: string | null; property_id: string | null; claim_id: string | null; lead_id: string | null } {
  if (rule.attach_to === 'ORGANISATION') return { business_id: s.business_id, property_id: null, claim_id: null, lead_id: null };
  return { business_id: s.business_id, property_id: s.kind === 'task' ? s.property_id : null, claim_id: s.claim_id, lead_id: s.lead_id };
}

function taskEffect(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject): RunOutcome {
  const owner = ownerFor(d.db, rule, s);
  if (owner === null) return notRun(d, actor, rule, e, s, 'NOBODY_TO_OWN_IT');
  const due = addDaysToDate(localDate(d.now()), rule.due_in_days ?? 0);
  const o: Result = { outcome: 'RAN', reason: null, tasks: 1, outbox_id: null };
  const run = d.db.tx(() => {
    const id = writeRun(d, actor, rule, e, s, o);
    insertTask(d.db, d.now, d.newId, {
      title: rule.task_title ?? rule.label, description: rule.task_description, ...owner, due_on: due,
      priority: rule.task_priority, activity_type: rule.task_activity_type ?? 'TASK', ...attachment(rule, s),
      contact_id: null, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: false,
      origin: 'AUTOMATION', automation_run_id: id, created_by: null,
    });
    return id;
  });
  return finish(d, actor, rule, e, s, run, o);
}

/**
 * THE INFORMATION REQUESTS — DERIVED, NEVER A HAND LIST. `missingFacts` is the
 * business page's panel 3: what the engine, the answers and the cash gates say
 * is still missing, where a DONT_KNOW answer and a question never answered are
 * the same missing fact (N4). One task per fact that has neither a client
 * question nor an open task already asking for it, bound to the fact by its id.
 */
function informationRequests(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject): RunOutcome {
  const business = s.business_id;
  if (business === null) return notRun(d, actor, rule, e, s, 'NEEDS_ORGANISATION');
  if (actor === null || !can(actor, 'assessment.read', { type: 'assessment', id: business, business_id: business })) {
    return notRun(d, actor, rule, e, s, 'NO_ONE_TO_READ_THE_MISSING_LIST');
  }
  const owner = ownerFor(d.db, rule, s);
  if (owner === null) return notRun(d, actor, rule, e, s, 'NOBODY_TO_OWN_IT');
  const asked = new Set(d.db.all<{ fact_id: string }>(
    "SELECT fact_id FROM staff_tasks WHERE business_id = ? AND fact_id IS NOT NULL AND status IN ('OPEN','IN_PROGRESS')",
    [business]).map((r) => r.fact_id));
  const facts = missingFacts(d.db, actor, business).filter((m) => !m.has_task && !asked.has(m.fact_id));
  const due = addDaysToDate(localDate(d.now()), rule.due_in_days ?? 0);
  const o: Result = { outcome: 'RAN', reason: facts.length === 0 ? 'NOTHING_MISSING' : null, tasks: facts.length, outbox_id: null };
  const run = d.db.tx(() => {
    const id = writeRun(d, actor, rule, e, s, o);
    for (const m of facts) {
      insertTask(d.db, d.now, d.newId, {
        title: `Ask for: ${m.question}`.slice(0, 300), description: m.why, ...owner, due_on: due,
        priority: rule.task_priority, activity_type: rule.task_activity_type ?? 'DOCUMENT_REQUEST', ...attachment(rule, s),
        contact_id: null, fact_id: m.fact_id, recurrence: null, recurred_from_id: null, is_next_action: false,
        origin: 'AUTOMATION', automation_run_id: id, created_by: null,
      });
    }
    return id;
  });
  return finish(d, actor, rule, e, s, run, o);
}

/**
 * PHASE 134 — A STAFF NOTICE'S SUBJECT, AND THE COMPANY'S NAME IN IT. BUILT AND SWITCHED OFF.
 *
 * Lakhbir, 18 September 2026: every email subject leads with the company name. A notice to a member of staff was built
 * (CRM 3 of 10) to carry the claim's reference and never an organisation's name, so that a client's name does not travel
 * in an email subject through a mail provider nobody has chosen yet. Which of the two holds is Lakhbir's to decide —
 * CAPREBATE QUESTIONS, "Should an email to our own staff name the client company in its subject line?". Until then:
 *   OFF  the subject says what happened and ends with the reference: "A claim is now at Survey (CR-2026-0004)".
 *   ON   the subject leads with the company: "Dunmarrow Medical Practice Limited — a claim is now at Survey (CR-2026-0004)".
 * Turning it on is this one line. test/phase134.test.ts proves both readings.
 */
export const NOTICE_SUBJECT_LEADS_WITH_COMPANY = false;

/** The two readings of the switch, as one pure function: the company in front, or the words as they are. */
export function noticeSubject(what: string, company: string | null): string {
  return company === null ? what : `${company} — ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
}

function noticeWords(rule: RuleDbRow, e: AutomationEvent, s: Subject, company: string | null = null): { subject: string; body: string } {
  const tail = s.claim_id === null || s.reference === 'a task' ? '' : ` (${s.reference})`;
  const on = s.claim_id === null ? '' : ' on a claim';
  let what: string;
  switch (e.trigger) {
    case 'STAGE_ENTERED': what = `A claim is now at ${anyStageLabel(e.stage)}${tail}`; break;
    case 'OWNER_CHANGED':
      what = s.kind === 'claim' ? `You now own a claim${tail}` : s.kind === 'lead' ? 'A lead is now yours' : `A task is now yours${on}${tail}`;
      break;
    case 'LEAD_CREATED': what = 'A new lead is yours'; break;
    case 'TASK_COMPLETED': what = `A task${on} was completed${tail}`; break;
    default: what = `A document was requested${on}${tail}`;
  }
  const subject = noticeSubject(what, company);
  const href = s.claim_id !== null ? `/staff/claims/${s.claim_id}`
    : s.lead_id !== null ? `/staff/leads/${s.lead_id}`
      : s.task_id !== null ? `/staff/tasks/${s.task_id}` : '/staff';
  return {
    subject,
    body: `${subject}.\n\nOpen it in the back office: ${href}\n\nAdded to the emails waiting to send by the rule “${rule.label}”. ${STUB_NOTICE}`,
  };
}

/**
 * A NOTICE TO THE OWNER — to a member of staff, through `outboxTransport` built
 * here and nowhere else. The transport refuses a DO_NOT_CONTACT organisation
 * too, and a refusal there is recorded as one.
 */
function notifyOwner(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject): RunOutcome {
  if (s.owner_id === null) return notRun(d, actor, rule, e, s, 'NO_OWNER');
  if (actor !== null && actor.id === s.owner_id) return notRun(d, actor, rule, e, s, 'OWNER_MADE_THE_CHANGE');
  const u = d.db.get<{ email: string; role: string; disabled_at: string | null }>(
    'SELECT email, role, disabled_at FROM users WHERE id = ?', [s.owner_id]);
  if (u === undefined || u.disabled_at !== null) return notRun(d, actor, rule, e, s, 'NO_OWNER');
  if (u.role === 'CLIENT') return notRun(d, actor, rule, e, s, 'OWNER_IS_NOT_STAFF');
  const company = !NOTICE_SUBJECT_LEADS_WITH_COMPANY || s.business_id === null ? null
    : d.db.get<{ name: string }>('SELECT name FROM businesses WHERE id = ?', [s.business_id])?.name ?? null;
  const w = noticeWords(rule, e, s, company);
  const transport = outboxTransport(d.db, d.newId, d.now);
  const done = d.db.tx(() => {
    const sent = transport.send({ to_email: u.email, subject: w.subject, body: w.body, kind: 'NOTIFICATION', business_id: s.business_id });
    if (sent.id === null) return null;
    const o: Result = { outcome: 'RAN', reason: null, tasks: 0, outbox_id: sent.id };
    return { run: writeRun(d, actor, rule, e, s, o), o };
  });
  if (done === null) return notRun(d, actor, rule, e, s, 'DO_NOT_CONTACT');
  return finish(d, actor, rule, e, s, done.run, done.o);
}

/**
 * CRM 9 of 10: A DOCUMENT REQUEST, RAISED THROUGH `createDocumentRequest` — the store a person uses, which checks the
 * type, writes the request and tells the automation — and never a second insert. Asked as the person whose event it
 * was: a request is theirs to raise, or it is not raised, and the run says which.
 */
function requestDocument(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject): RunOutcome {
  const business = s.business_id;
  if (business === null) return notRun(d, actor, rule, e, s, 'NEEDS_ORGANISATION');
  if (actor === null || !can(actor, 'document_request.create', { type: 'document_request', id: business, business_id: business })) {
    return notRun(d, actor, rule, e, s, 'NO_ONE_TO_RAISE_THE_REQUEST');
  }
  const r = createDocumentRequest({ db: d.db, audit: d.audit, now: d.now, newId: d.newId }, actor, {
    business_id: business, claim_id: s.claim_id, type_code: rule.request_type, why: rule.task_title, holds_up: rule.task_description,
    due_on: addDaysToDate(localDate(d.now()), rule.due_in_days ?? 0),
  });
  if (!r.ok) return notRun(d, actor, rule, e, s, 'REQUEST_REFUSED');
  const o: Result = { outcome: 'RAN', reason: null, tasks: 0, outbox_id: null };
  const run = d.db.tx(() => writeRun(d, actor, rule, e, s, o));
  return finish(d, actor, rule, e, s, run, o);
}

function runRule(d: AutomationDeps, actor: Actor | null, rule: RuleDbRow, e: AutomationEvent, s: Subject): RunOutcome {
  if (!has(EFFECTS, rule.effect)) return notRun(d, actor, rule, e, s, 'EFFECT_NOT_ALLOWED');
  if (s.business_id !== null && isDoNotContactOrganisation(d.db, s.business_id)) return notRun(d, actor, rule, e, s, 'DO_NOT_CONTACT');
  if ((rule.effect === 'INFORMATION_REQUEST_TASKS' || rule.effect === 'REQUEST_DOCUMENT' || rule.attach_to === 'ORGANISATION') && s.business_id === null) {
    return notRun(d, actor, rule, e, s, 'NEEDS_ORGANISATION');
  }
  if (rule.effect === 'NOTIFY_OWNER') return notifyOwner(d, actor, rule, e, s);
  if (rule.effect === 'INFORMATION_REQUEST_TASKS') return informationRequests(d, actor, rule, e, s);
  if (rule.effect === 'REQUEST_DOCUMENT') return requestDocument(d, actor, rule, e, s);
  return taskEffect(d, actor, rule, e, s);
}

/**
 * RUN EVERY ACTIVE RULE THIS EVENT MATCHES. Called AFTER the event has committed,
 * never inside its transaction — by the stage move, the lead's creation and its
 * conversion, a change of owner, and a task's completion. Returns what each rule
 * did; every one of them is also a row in `automation_runs`.
 */
export function fireAutomation(d: AutomationDeps, actor: Actor | null, event: AutomationEvent): RunOutcome[] {
  const s = subjectOf(d.db, event);
  if (s === null) return [];
  const rules = d.db.all<RuleDbRow>(`${RULE_SELECT}WHERE active = 1 AND trigger_event = ? ORDER BY ord ASC, id ASC`, [event.trigger])
    .filter((r) => matches(r, event, s));
  const out: RunOutcome[] = [];
  for (const rule of rules) {
    try {
      out.push(runRule(d, actor, rule, event, s));
    } catch {
      // Everything the rule wrote was in a transaction that has rolled back.
      out.push(notRun(d, actor, rule, event, s, 'ERROR'));
    }
  }
  return out;
}

/**
 * PHASE 133a — THE GATE OF THE AUTOMATION RULES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function automationGate(actor: Actor): void {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
}
