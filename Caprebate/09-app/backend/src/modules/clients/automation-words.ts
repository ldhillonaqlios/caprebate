/**
 * THE AUTOMATION RULES' WORDS AND THEIR GATE (Phase 161l1, carved from src/modules/crm/automation.ts unchanged): what
 * may start a rule, what a rule may do, what no rule may do and why, whom it assigns and attaches to, why a run did not
 * run, and the gate of the rules' section. Read by the CRM's runner and screens, and by the admin's configuration.
 */
import { authorise, type Actor } from '../../core/index.ts';

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

export const RULES_SECTION = { type: 'automation_rule' as const, id: '__rules__' };

/**
 * THE GATE OF THE AUTOMATION RULES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function automationGate(actor: Actor): void {
  authorise(actor, 'automation_rule.read', RULES_SECTION);
}

export type RuleDbRow = {
  id: string; label: string; trigger_event: string; trigger_stage: string | null; trigger_activity: string | null;
  effect: string; task_title: string | null; task_description: string | null; task_activity_type: string | null;
  task_priority: string | null; due_in_days: number | null; assign_to: string | null; assign_role: string | null;
  attach_to: string; active: number; ord: number; source: string; created_at: string; updated_at: string;
  request_type: string | null;
};
