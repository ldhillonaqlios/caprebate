/**
 * STAFF TASKS, AND ONE NEXT ACTION PER CLAIM. CRM 3 of 10, 11 September 2026.
 *
 * The schema is migration 012; the routes and pages are src/web/tasks-pages.ts;
 * the scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 10 and Part E from
 * row E23.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A JOB A COLLEAGUE DOES IS NOT A QUESTION THE CLIENT ANSWERS
 *
 * `client_tasks` (migration 003) holds what we ask the client, why, what it holds
 * up, and how its answer came to be held. `staff_tasks` holds work: an owner, a
 * due date and a status. Neither table points at the other, and nothing in this
 * file writes to `client_tasks`.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE NEXT ACTION, WITH AN OWNER AND A DUE DATE
 *
 * Every claim that has not closed or left the procedure has exactly one current
 * next action: an open task flagged on the claim, naming a person and a date.
 * The database refuses a second — a partial unique index. `nextActionRefusal`
 * refuses a stage move that would leave a claim without one, and `moveClaim` in
 * src/web/pipeline.ts asks it after the gate. `nextActionBreakers` lists every
 * claim breaking the rule, because a claim can be opened, or have its next
 * action completed, with none — a state to show, not a row to refuse.
 *
 * WHO IS WAITING IS NOT DECIDED HERE. The engaged-client list already answers it
 * — `whoIsWaiting` in src/web/engaged.ts, where both sides waiting reads as ours
 * — and `waitingOn` beside it is how this file asks. There is no second ladder.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OVERDUE IS A QUESTION ABOUT TODAY'S UK DATE
 *
 * A due date is a calendar date (row E26). "Overdue" is `due_on` before
 * `localDate(now)`, and src/web/localtime.ts stays the only file naming a zone.
 * A task with no due date is NOT overdue and NOT on time: it has no due date,
 * and every screen says so in those words (N4).
 */

import type { Db } from '../db.ts';
import type { AuditKind, AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localDate, localStamp, ukDate, dueWords } from './localtime.ts';
import { claimNaming, claimObjFor, claimWords, PRIORITIES, type Fields } from './crm.ts';
import { anyStageLabel, claimStage } from './stages.ts';
import { waitingOn, type WaitingOn } from './engaged.ts';
import { fireAutomation } from './automation.ts';
import { mayTake, vocabLabel } from './vocabularies.ts';

export type TaskDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type TaskResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

type Vocab = Readonly<Record<string, string>>;

export const TASK_STATUSES: Vocab = Object.freeze({
  OPEN: 'Open', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
});

/** The full specification's 10.4, in its own words. */
export const ACTIVITY_TYPES: Vocab = Object.freeze({
  CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Note', TASK: 'Task', SURVEY: 'Survey',
  DOCUMENT_REQUEST: 'Document request', REVIEW: 'Review', OTHER: 'Other',
});

/**
 * CRM 5 of 10: reward model A's three kinds of reciprocity. On the activity list
 * (migration 014 replaced the trigger pair) but NOT in `ACTIVITY_TYPES`, because
 * the database allows them only on a task on an introducing firm, and only while
 * model A is the setting — src/web/introducers.ts is the one place that writes one.
 */
export const RECIPROCITY_ACTIVITY_TYPES: Vocab = Object.freeze({
  CPD_SESSION: 'A CPD session for the practice',
  CO_BRANDED_ONE_PAGER: 'A co-branded one-pager for the firm’s client newsletter',
  PRIORITY_TURNAROUND: 'Priority turnaround on a referred case',
});

export const RECURRENCES: Vocab = Object.freeze({
  WEEKLY: 'Every week', FORTNIGHTLY: 'Every fortnight', MONTHLY: 'Every month', QUARTERLY: 'Every quarter',
});

export const TASK_ORIGINS: Vocab = Object.freeze({
  STAFF: 'created by staff',
  AUTOMATION: 'created by an automation rule',
  RECURRENCE: 'the next of a recurring task',
  MIGRATION: 'carried over when the next action and the follow-up became tasks',
  VAT_MONITOR: 'raised by the VAT monitoring in the finance view',
});

/** CRM 7 of 10: what a task about Caprebate itself is about. Migration 016's CHECK is the list. */
export const COMPANY_SUBJECTS: Vocab = Object.freeze({
  VAT_THRESHOLD: 'Our own VAT — when we must register',
});

/** The teams a task may wait with while nobody has taken it. Never CLIENT. */
export const POOL_ROLES: Vocab = Object.freeze({
  ADMIN: 'Admin', SALES: 'Sales', ACCOUNTING: 'Accounting', SURVEYING: 'Surveying',
});

const OPEN_STATES: readonly string[] = ['OPEN', 'IN_PROGRESS'];

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

/** PHASE 133d (D4): `field` is the posted name a refusal is about, where it is about one. */
type Check<T> = { ok: true; value: T } | { ok: false; why: string; field?: string };

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function textField(v: string | null | undefined, max: number, what: string): Check<string | null> {
  const t = clean(v);
  if (t === null) return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function dateField(v: string | null | undefined, what: string): Check<string | null> {
  const t = clean(v);
  if (t === null) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))) {
    return { ok: false, why: `${what} must be a date like 2026-03-31.` };
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
 * 1 · CALENDAR ARITHMETIC — ON DATES, NOT INSTANTS
 *
 * A due date is a day in the business's calendar with no time and no zone, so
 * adding a week to it is arithmetic on three integers. `Date.UTC` is used only
 * as a calendar that knows how long each month is: no instant is formed from a
 * person's clock, none is compared with one, and none is stored.
 * ================================================================== */

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map((x) => Number(x));
  return [y ?? 1970, m ?? 1, d ?? 1];
}

export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A month on, keeping the day where the month has it: 31 January plus a month is 28 or 29 February. */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export function nextDueOn(from: string, recurrence: string): string {
  if (recurrence === 'WEEKLY') return addDaysToDate(from, 7);
  if (recurrence === 'FORTNIGHTLY') return addDaysToDate(from, 14);
  if (recurrence === 'MONTHLY') return addMonthsToDate(from, 1);
  return addMonthsToDate(from, 3);
}

/* ================================================================== *
 * 2 · DUE, OVERDUE, AND NO DUE DATE AT ALL
 * ================================================================== */

export type DueState = 'OVERDUE' | 'DUE_TODAY' | 'NOT_YET_DUE' | 'NO_DUE_DATE' | 'CLOSED';
export type DueReading = { readonly state: DueState; readonly overdue: boolean; readonly label: string };

/** THE WORDS for a task, a question or a request with no due date — one sentence, everywhere (N4). */
export const NO_DUE_DATE = 'no due date — so it is not overdue, and it is not on time either';

export function dueReading(due_on: string | null, nowIso: string, closed = false): DueReading {
  // PHASE 133c: THE WORDS ARE THE ONE UK-DATE HELPER'S — "3 days overdue (14 Sep 2026)", "Due today (17 Sep 2026)", "Due in
  // 3 days (20 Sep 2026)". The STATES are unchanged, and still decided here, on the UK date.
  if (closed) {
    return { state: 'CLOSED', overdue: false, label: due_on === null ? 'Closed. It had no due date.' : `Closed. It was due ${ukDate(due_on)}.` };
  }
  if (due_on === null) return { state: 'NO_DUE_DATE', overdue: false, label: NO_DUE_DATE };
  const today = localDate(nowIso);
  if (due_on < today) return { state: 'OVERDUE', overdue: true, label: dueWords(due_on, nowIso) };
  if (due_on === today) return { state: 'DUE_TODAY', overdue: false, label: dueWords(due_on, nowIso) };
  return { state: 'NOT_YET_DUE', overdue: false, label: dueWords(due_on, nowIso) };
}

/** A claim that has closed or left the procedure keeps no next action. On hold is not either. */
export function isTerminalStage(stage: string | null): boolean {
  const k = claimStage(stage).kind;
  return k === 'CLOSED' || k === 'EXIT';
}

/* ================================================================== *
 * 3 · THE TASK ROW, ITS OBJECT AND ITS VIEW
 * ================================================================== */

type TaskDbRow = {
  id: string; title: string; description: string | null; owner_id: string | null; owner_role: string | null;
  due_on: string | null; priority: string | null; status: string; activity_type: string;
  business_id: string | null; property_id: string | null; claim_id: string | null; lead_id: string | null;
  contact_id: string | null; fact_id: string | null; recurrence: string | null; recurred_from_id: string | null;
  is_next_action: number; origin: string; automation_run_id: string | null; created_by: string | null;
  created_at: string; updated_at: string; started_at: string | null; completed_at: string | null;
  completed_by: string | null; cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string | null;
  owner_name: string | null; created_by_name: string | null; completed_by_name: string | null;
  cancelled_by_name: string | null; claim_ref: string | null; business_name: string | null; lead_label: string | null;
  contact_label: string | null; property_label: string | null; rule_label: string | null;
  introducer_id: string | null; introducer_label: string | null;
  company_subject: string | null;
};

const TASK_SELECT =
  'SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, ' +
  't.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, ' +
  't.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, ' +
  't.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, ' +
  'o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ' +
  'ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, ' +
  'COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ' +
  'ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label ' +
  'FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by ' +
  'LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by ' +
  'LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id ' +
  'LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id ' +
  'LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id ' +
  'LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id ';

function loadTask(db: Db, id: string): TaskDbRow {
  const r = db.get<TaskDbRow>(`${TASK_SELECT}WHERE t.id = ?`, [id]);
  // A missing row and a forbidden row look the same from outside.
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/** The task as `can()` is asked about it. */
export function taskObj(
  db: Db, r: { id: string; business_id: string | null; owner_id: string | null; owner_role: string | null; claim_id: string | null },
): Extract<Obj, { type: 'staff_task' }> {
  const assigned = r.claim_id !== null && r.business_id !== null
    ? claimObjFor(db, { id: r.claim_id, business_id: r.business_id }).assigned_surveyor_ids
    : [];
  return {
    type: 'staff_task', id: r.id, business_id: r.business_id, owner_id: r.owner_id, owner_role: r.owner_role,
    assigned_surveyor_ids: assigned,
  };
}

const SECTION = '__task_section__';

function sectionObj(): Extract<Obj, { type: 'staff_task' }> {
  return { type: 'staff_task', id: SECTION, business_id: null, owner_id: null, owner_role: null, assigned_surveyor_ids: [] };
}

/** Whether this reader may add tasks — for a page deciding whether to draw the form. The store asks again. */
export function mayCreateTask(actor: Actor): boolean {
  return can(actor, 'staff_task.create', sectionObj());
}

export type TaskAbout = {
  readonly kind: 'claim' | 'organisation' | 'property' | 'lead' | 'contact' | 'introducer' | 'company';
  readonly id: string;
  readonly label: string;
  readonly href: string | null;
};

export type TaskView = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: { readonly key: string; readonly label: string };
  readonly activity: { readonly key: string; readonly label: string };
  readonly priority: { readonly key: string | null; readonly label: string };
  readonly owner: { readonly id: string | null; readonly label: string };
  readonly due_on: string | null;
  readonly due: DueReading;
  readonly recurrence: { readonly key: string | null; readonly label: string };
  readonly is_next_action: boolean;
  readonly origin: string;
  /** What the task is about — each named only where the reader may open it. */
  readonly about: readonly TaskAbout[];
  readonly created: string;
  readonly closed: string | null;
  readonly may_progress: boolean;
  readonly may_write: boolean;
};

function ownerLabel(r: { owner_id: string | null; owner_name: string | null; owner_role: string | null }): string {
  if (r.owner_id !== null) return r.owner_name ?? 'a former user';
  if (r.owner_role !== null) return `waiting with ${words(POOL_ROLES, r.owner_role, r.owner_role)} — nobody has taken it`;
  return 'nobody';
}

/**
 * BUILT FORWARDS. Each thing the task is about is added only where the reader may
 * open it: a contact's name for `contact.read`, a lead for `lead.read`. ACCOUNTING
 * reading its own finance task sees the claim's reference and the client's name,
 * which it already holds, and no contact.
 */
function viewOf(db: Db, actor: Actor, r: TaskDbRow, nowIso: string): TaskView {
  const obj = taskObj(db, r);
  const closed = r.status === 'COMPLETED' || r.status === 'CANCELLED';
  const about: TaskAbout[] = [];
  if (r.claim_id !== null && r.business_id !== null
    && can(actor, 'claim.read', claimObjFor(db, { id: r.claim_id, business_id: r.business_id }))) {
    // PHASE 134: a claim is named by its property, never by its reference — the company follows as its own line.
    const n = claimNaming(db, r.claim_id);
    about.push({ kind: 'claim', id: r.claim_id, label: n === null || n.property === null ? 'the claim' : `the claim on ${n.property}`, href: `/staff/claims/${r.claim_id}` });
  }
  if (r.business_id !== null) {
    if (can(actor, 'organisation.read', { type: 'business', id: r.business_id })) {
      about.push({ kind: 'organisation', id: r.business_id, label: r.business_name ?? r.business_id, href: `/staff/clients/${r.business_id}` });
    } else if (can(actor, 'business.read', { type: 'business', id: r.business_id })) {
      about.push({ kind: 'organisation', id: r.business_id, label: r.business_name ?? r.business_id, href: null });
    }
  }
  if (r.property_id !== null && r.business_id !== null
    && can(actor, 'property.read', { type: 'property', id: r.property_id, business_id: r.business_id, assigned_surveyor_ids: [] })) {
    about.push({ kind: 'property', id: r.property_id, label: r.property_label ?? r.property_id, href: `/staff/properties/${r.property_id}` });
  }
  // CRM 7 of 10: a task about Caprebate itself — the VAT threshold — worked from the finance view.
  if (r.company_subject !== null) {
    about.push({
      kind: 'company', id: r.company_subject, label: words(COMPANY_SUBJECTS, r.company_subject, r.company_subject),
      href: can(actor, 'invoice.read', { type: 'invoice', id: '__finance__', business_id: '__finance__' }) ? '/staff/finance' : null,
    });
  }
  if (r.lead_id !== null) {
    const lead = db.get<{ business_id: string | null }>('SELECT business_id FROM leads WHERE id = ?', [r.lead_id]);
    if (lead !== undefined && can(actor, 'lead.read', { type: 'lead', id: r.lead_id, business_id: lead.business_id })) {
      about.push({ kind: 'lead', id: r.lead_id, label: r.lead_label ?? 'a lead', href: `/staff/leads/${r.lead_id}` });
    }
  }
  // CRM 5 of 10: a task on an introducing firm — contact with the firm, logged or planned (row E48).
  if (r.introducer_id !== null && can(actor, 'introducer.read', { type: 'introducer', id: r.introducer_id })) {
    about.push({ kind: 'introducer', id: r.introducer_id, label: r.introducer_label ?? 'an introducer', href: `/staff/introducers/${r.introducer_id}` });
  }
  if (r.contact_id !== null && can(actor, 'contact.read', { type: 'contact', id: r.contact_id, business_id: r.business_id })) {
    about.push({ kind: 'contact', id: r.contact_id, label: r.contact_label ?? 'a contact', href: null });
  }
  const origin = `${words(TASK_ORIGINS, r.origin, r.origin)}${r.rule_label === null ? '' : ` — “${r.rule_label}”`}`;
  return {
    id: r.id, title: r.title, description: r.description,
    status: { key: r.status, label: words(TASK_STATUSES, r.status, r.status) },
    activity: { key: r.activity_type, label: RECIPROCITY_ACTIVITY_TYPES[r.activity_type] ?? vocabLabel(db, 'ACTIVITY_TYPE', r.activity_type, r.activity_type) },
    priority: { key: r.priority, label: vocabLabel(db, 'PRIORITY', r.priority, 'not set') },
    owner: { id: r.owner_id, label: ownerLabel(r) },
    due_on: r.due_on,
    due: dueReading(r.due_on, nowIso, closed),
    recurrence: { key: r.recurrence, label: words(RECURRENCES, r.recurrence, 'does not repeat') },
    is_next_action: r.is_next_action === 1 && !closed,
    origin,
    about,
    created: `${localStamp(r.created_at)}${r.created_by_name === null ? '' : ` by ${r.created_by_name}`}`,
    closed: r.status === 'COMPLETED' && r.completed_at !== null
      ? `completed ${localStamp(r.completed_at)} by ${r.completed_by_name ?? 'a former user'}`
      : r.status === 'CANCELLED' && r.cancelled_at !== null
        ? `cancelled ${localStamp(r.cancelled_at)} by ${r.cancelled_by_name ?? 'a former user'} — ${r.cancel_reason ?? ''}`
        : null,
    may_progress: !closed && can(actor, 'staff_task.progress', obj),
    may_write: !closed && can(actor, 'staff_task.write', obj),
  };
}

/** Who may own a task: any active member of staff. A client never owns one. */
export function taskOwnerChoices(db: Db): { id: string; name: string; role: string }[] {
  return db.all<{ id: string; display_name: string; role: string }>(
    "SELECT id, display_name, role FROM users WHERE role IN ('ADMIN','SALES','ACCOUNTING','SURVEYING') " +
      'AND disabled_at IS NULL ORDER BY display_name ASC',
  ).map((u) => ({ id: u.id, name: u.display_name, role: u.role }));
}

/* ================================================================== *
 * 4 · WRITING A TASK
 * ================================================================== */

export type TaskInsert = {
  readonly title: string;
  readonly description: string | null;
  readonly owner_id: string | null;
  readonly owner_role: string | null;
  readonly due_on: string | null;
  readonly priority: string | null;
  readonly activity_type: string;
  readonly business_id: string | null;
  readonly property_id: string | null;
  readonly claim_id: string | null;
  readonly lead_id: string | null;
  readonly contact_id: string | null;
  readonly fact_id: string | null;
  readonly recurrence: string | null;
  readonly recurred_from_id: string | null;
  readonly is_next_action: boolean;
  readonly origin: 'STAFF' | 'AUTOMATION' | 'RECURRENCE' | 'MIGRATION' | 'VAT_MONITOR';
  readonly automation_run_id: string | null;
  readonly created_by: string | null;
  /** CRM 5 of 10: an introducing firm — and then no organisation, property, claim or lead (migration 014). */
  readonly introducer_id?: string | null;
  /** CRM 7 of 10: Caprebate itself — the VAT threshold — and then nothing else, from the VAT monitoring alone (migration 016). */
  readonly company_subject?: string | null;
};

/**
 * PHASE 154a1 (line 7), 4 October 2026 — A DOUBLE CLICK MAKES ONE TASK. The 3 October sweep posted the same task twice
 * at once and got two. The same person adding the same task - every field the form sets, about the same things - within
 * DOUBLE_CLICK_MS of the first is taken as the same click: the task already made is the answer, and nothing is written
 * or audited twice. A different person, a different field, or a later click is a new task. Read inside the write's own
 * transaction, so two posts at once cannot both miss each other.
 */
export const DOUBLE_CLICK_MS = 10_000;
function sameTaskJustMade(
  d: TaskDeps, actor: Actor,
  s: { business_id: string | null; property_id: string | null; claim_id: string | null; lead_id: string | null; contact_id: string | null },
  v: { title: string | null; description: string | null; owner_id: string | null; owner_role: string | null; due_on: string | null;
    priority: string | null; activity_type: string | null; recurrence: string | null },
  asNext: boolean,
): string | null {
  const since = new Date(Date.parse(d.now()) - DOUBLE_CLICK_MS).toISOString();
  return d.db.get<{ id: string }>(
    "SELECT id FROM staff_tasks WHERE created_by = ? AND origin = 'STAFF' AND status = 'OPEN' AND created_at >= ? AND title = ? " +
      'AND description IS ? AND owner_id IS ? AND owner_role IS ? AND due_on IS ? AND priority IS ? AND activity_type IS ? ' +
      'AND recurrence IS ? AND is_next_action = ? AND business_id IS ? AND property_id IS ? AND claim_id IS ? AND lead_id IS ? ' +
      'AND contact_id IS ? ORDER BY created_at DESC, id LIMIT 1',
    [actor.id, since, v.title ?? '', v.description, v.owner_id, v.owner_id === null ? v.owner_role : null, v.due_on, v.priority,
      v.activity_type ?? 'TASK', v.recurrence, asNext ? 1 : 0, s.business_id, s.property_id, s.claim_id, s.lead_id, s.contact_id],
  )?.id ?? null;
}

/**
 * THE ROW, WRITTEN. No authorisation and no validation: every caller has done
 * both — the store functions below, the automation runner, the seed, and the
 * introducer's contact log. The database's own CHECKs and triggers still refuse a
 * task about nothing, a property of another organisation, a second next action,
 * a word not on a list, and a task on a firm that is about anything else too.
 */
export function insertTask(db: Db, now: () => string, newId: () => string, t: TaskInsert): string {
  const id = newId();
  const at = now();
  db.run(
    'INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type, ' +
      'business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, ' +
      'origin, automation_run_id, created_by, created_at, updated_at, introducer_id, company_subject) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, t.title, t.description, t.owner_id, t.owner_id === null ? t.owner_role : null, t.due_on, t.priority, 'OPEN',
      t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence,
      t.recurred_from_id, t.is_next_action ? 1 : 0, t.origin, t.automation_run_id, t.created_by, at, at, t.introducer_id ?? null,
      t.company_subject ?? null],
  );
  return id;
}

function audit(d: TaskDeps, actor: Actor, kind: AuditKind, object_type: string, id: string, detail: Record<string, unknown>): void {
  d.audit.append({
    at: d.now(), kind, outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type, object_id: id, detail,
  });
}

type Subject = {
  business_id: string | null; property_id: string | null; claim_id: string | null; lead_id: string | null;
  contact_id: string | null; claim_stage: string | null;
};

/**
 * WHAT A TASK IS ABOUT, AND THE READER MAY READ EACH OF IT. A claim and a
 * property name their organisation, so it is taken from them and never from the
 * form; a contact must be one of the organisation's or the lead's.
 */
function resolveSubject(db: Db, actor: Actor, input: Fields): Check<Subject> {
  const out: Subject = { business_id: null, property_id: null, claim_id: null, lead_id: null, contact_id: null, claim_stage: null };
  const claimId = clean(input['claim_id']);
  const propertyId = clean(input['property_id']);
  const businessId = clean(input['business_id']);
  const leadId = clean(input['lead_id']);
  const contactId = clean(input['contact_id']);

  if (claimId !== null) {
    const c = db.get<{ id: string; business_id: string; stage: string | null }>('SELECT id, business_id, stage FROM claims WHERE id = ?', [claimId]);
    if (c === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'claim.read', claimObjFor(db, c));
    out.claim_id = c.id; out.business_id = c.business_id; out.claim_stage = c.stage;
  }
  if (propertyId !== null) {
    const p = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM properties WHERE id = ?', [propertyId]);
    if (p === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'property.read', { type: 'property', id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] });
    if (out.business_id !== null && out.business_id !== p.business_id) {
      return { ok: false, why: 'The property must be one of the claim’s own organisation’s properties.' };
    }
    out.property_id = p.id; out.business_id = p.business_id;
  }
  if (businessId !== null) {
    const b = db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [businessId]);
    if (b === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'organisation.read', { type: 'business', id: b.id });
    if (out.business_id !== null && out.business_id !== b.id) {
      return { ok: false, why: 'A task is about one organisation: the claim or property named belongs to another.' };
    }
    out.business_id = b.id;
  }
  if (leadId !== null) {
    const l = db.get<{ id: string; business_id: string | null }>('SELECT id, business_id FROM leads WHERE id = ?', [leadId]);
    if (l === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'lead.read', { type: 'lead', id: l.id, business_id: l.business_id });
    if (out.business_id !== null && l.business_id !== null && l.business_id !== out.business_id) {
      return { ok: false, why: 'The lead belongs to another organisation.' };
    }
    out.lead_id = l.id;
  }
  if (contactId !== null) {
    const ct = db.get<{ id: string; business_id: string | null; lead_id: string | null }>(
      'SELECT id, business_id, lead_id FROM contacts WHERE id = ?', [contactId]);
    if (ct === undefined) throw new NotFoundAsRefusal();
    authorise(actor, 'contact.read', { type: 'contact', id: ct.id, business_id: ct.business_id });
    if (out.business_id === null && out.lead_id === null) {
      out.business_id = ct.business_id;
      out.lead_id = ct.business_id === null ? ct.lead_id : null;
    } else if (!((out.business_id !== null && ct.business_id === out.business_id) || (out.lead_id !== null && ct.lead_id === out.lead_id))) {
      return { ok: false, why: 'The contact must be one of this organisation’s or this lead’s own.' };
    }
    out.contact_id = ct.id;
  }
  if (out.business_id === null && out.lead_id === null) {
    return { ok: false, why: 'A task is about something: a claim, a property, an organisation or a lead.' };
  }
  return { ok: true, value: out };
}

type TaskValues = {
  title: string | null; description: string | null; owner_id: string | null; owner_role: string | null;
  due_on: string | null; priority: string | null; activity_type: string | null; recurrence: string | null;
};

const BLANK: TaskValues = {
  title: null, description: null, owner_id: null, owner_role: null, due_on: null, priority: null,
  activity_type: null, recurrence: null,
};

function taskValues(db: Db, input: Fields, stored: TaskValues): Check<TaskValues> {
  const owners = taskOwnerChoices(db);
  const title = take(input, 'title', stored.title, (v) => textField(v, 300, 'The task'));
  const description = take(input, 'description', stored.description, (v) => textField(v, 4000, 'The description'));
  const owner = take(input, 'owner_id', stored.owner_id, (v): Check<string | null> =>
    clean(v) === null ? { ok: true, value: null }
      : owners.some((o) => o.id === v) ? { ok: true, value: v } : { ok: false, why: 'The owner must be one of the people offered.' });
  const pool = take(input, 'owner_role', stored.owner_role, (v): Check<string | null> =>
    clean(v) === null ? { ok: true, value: null }
      : has(POOL_ROLES, v) ? { ok: true, value: v } : { ok: false, why: 'The team must be one of the four staff teams.' });
  const due = take(input, 'due_on', stored.due_on, (v) => dateField(v, 'The due date'));
  const priority = take(input, 'priority', stored.priority, (v): Check<string | null> =>
    clean(v) === null ? { ok: true, value: null }
      : mayTake(db, 'PRIORITY', v ?? '', stored.priority) ? { ok: true, value: v } : { ok: false, why: 'The priority is not one of the choices offered.' });
  // CRM 5 of 10: a task on a firm may carry one of reward model A's kinds, which is not on this list; left as it is, it stays.
  const activity = take(input, 'activity_type', stored.activity_type, (v): Check<string | null> =>
    v !== null && mayTake(db, 'ACTIVITY_TYPE', v, stored.activity_type) ? { ok: true, value: v }
      : { ok: false, why: 'Choose what kind of activity this is — “other” is a choice.' });
  const recurrence = take(input, 'recurrence', stored.recurrence, (v): Check<string | null> =>
    clean(v) === null ? { ok: true, value: null }
      : has(RECURRENCES, v) ? { ok: true, value: v } : { ok: false, why: 'The recurrence is not one of the choices offered.' });
  for (const c of [title, description, owner, pool, due, priority, activity, recurrence]) if (!c.ok) return c;
  if (!title.ok || !description.ok || !owner.ok || !pool.ok || !due.ok || !priority.ok || !activity.ok || !recurrence.ok) {
    return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  }
  if (title.value === null) return { ok: false, why: 'Say what the task is.', field: 'title' };
  if (activity.value === null) return { ok: false, why: 'Choose what kind of activity this is — “other” is a choice.', field: 'activity_type' };
  return {
    ok: true,
    value: {
      title: title.value, description: description.value, owner_id: owner.value,
      // A task somebody owns is not also waiting with a team.
      owner_role: owner.value === null ? pool.value : null,
      due_on: due.value, priority: priority.value, activity_type: activity.value, recurrence: recurrence.value,
    },
  };
}

/** Clear the claim's current next-action flag, inside the caller's transaction. */
function clearNextAction(db: Db, claim_id: string, at: string): void {
  db.run(
    "UPDATE staff_tasks SET is_next_action = 0, updated_at = ? WHERE claim_id = ? AND is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS')",
    [at, claim_id],
  );
}

/**
 * CREATE A TASK — about a claim, a property, an organisation or a lead, and
 * owned by a person or waiting with a team. `as_next_action` makes it the
 * claim's next action, which needs an owner and a due date, and replaces the
 * one before it in the same transaction.
 */
export function createTask(d: TaskDeps, actor: Actor, input: Fields): TaskResult {
  authorise(actor, 'staff_task.create', sectionObj());
  const subject = resolveSubject(d.db, actor, input);
  if (!subject.ok) return subject;
  const v = taskValues(d.db, input, BLANK);
  if (!v.ok) return v;
  const s = subject.value;
  const asNext = input['as_next_action'] === 'yes';
  if (v.value.owner_id === null && v.value.owner_role === null) {
    return { ok: false, why: 'Say who owns this task, or which team it waits with until somebody takes it.', field: 'owner_id' };
  }
  if (asNext) {
    if (s.claim_id === null || s.business_id === null) return { ok: false, why: 'Only a claim has a next action.' };
    authorise(actor, 'claim.write', claimObjFor(d.db, { id: s.claim_id, business_id: s.business_id }));
    if (isTerminalStage(s.claim_stage)) return { ok: false, why: 'This claim has closed or left the procedure, and keeps no next action.' };
    if (v.value.owner_id === null) return { ok: false, why: 'A claim’s next action has an owner: choose the person who will do it.', field: 'owner_id' };
    if (v.value.due_on === null) return { ok: false, why: 'A claim’s next action has a due date.', field: 'due_on' };
  }
  const made = d.db.tx(() => {
    const again = sameTaskJustMade(d, actor, s, v.value, asNext);
    if (again !== null) return { id: again, again: true };
    if (asNext && s.claim_id !== null) clearNextAction(d.db, s.claim_id, d.now());
    return { again: false, id: insertTask(d.db, d.now, d.newId, {
      title: v.value.title ?? '', description: v.value.description, owner_id: v.value.owner_id, owner_role: v.value.owner_role,
      due_on: v.value.due_on, priority: v.value.priority, activity_type: v.value.activity_type ?? 'TASK',
      business_id: s.business_id, property_id: s.property_id, claim_id: s.claim_id, lead_id: s.lead_id,
      contact_id: s.contact_id, fact_id: null, recurrence: v.value.recurrence, recurred_from_id: null,
      is_next_action: asNext, origin: 'STAFF', automation_run_id: null, created_by: actor.id,
    }) };
  });
  const id = made.id;
  if (made.again) return { ok: true, id };
  audit(d, actor, asNext ? 'NEXT_ACTION_SET' : 'STAFF_TASK_CREATED', 'staff_task', id, {
    task: id, business: s.business_id, claim: s.claim_id, lead: s.lead_id, activity: v.value.activity_type, route: 'staff',
  });
  return { ok: true, id };
}

/** CHANGE A TASK. Only the fields the form carried are touched; a closed task keeps its record. */
export function updateTask(d: TaskDeps, actor: Actor, id: string, input: Fields): TaskResult {
  const r = loadTask(d.db, id);
  authorise(actor, 'staff_task.write', taskObj(d.db, r));
  if (r.status === 'COMPLETED' || r.status === 'CANCELLED') {
    return { ok: false, why: 'A completed or cancelled task keeps its record. Create a new task instead.' };
  }
  const stored: TaskValues = {
    title: r.title, description: r.description, owner_id: r.owner_id, owner_role: r.owner_role, due_on: r.due_on,
    priority: r.priority, activity_type: r.activity_type, recurrence: r.recurrence,
  };
  const v = taskValues(d.db, input, stored);
  if (!v.ok) return v;
  if (r.is_next_action === 1 && (v.value.owner_id === null || v.value.due_on === null)) {
    return {
      ok: false,
      why: 'This task is its claim’s next action, which keeps an owner and a due date. Set another next action first, then change this one.',
    };
  }
  if (v.value.owner_id === null && v.value.owner_role === null) {
    return { ok: false, why: 'Say who owns this task, or which team it waits with until somebody takes it.', field: 'owner_id' };
  }
  const changed = (Object.keys(v.value) as (keyof TaskValues)[]).filter((k) => stored[k] !== v.value[k]);
  if (changed.length === 0) return { ok: true, id: r.id };
  d.db.run(
    'UPDATE staff_tasks SET title = ?, description = ?, owner_id = ?, owner_role = ?, due_on = ?, priority = ?, ' +
      'activity_type = ?, recurrence = ?, updated_at = ? WHERE id = ?',
    [v.value.title, v.value.description, v.value.owner_id, v.value.owner_role, v.value.due_on, v.value.priority,
      v.value.activity_type, v.value.recurrence, d.now(), r.id],
  );
  audit(d, actor, 'STAFF_TASK_UPDATED', 'staff_task', r.id, {
    task: r.id, business: r.business_id, claim: r.claim_id, lead: r.lead_id, fields: changed,
  });
  if (changed.includes('owner_id') && v.value.owner_id !== null) {
    fireAutomation(d, actor, { trigger: 'OWNER_CHANGED', task_id: r.id });
  }
  return { ok: true, id: r.id };
}

/**
 * MOVE A TASK ON: start it, put it back, complete it, or cancel it with a reason.
 *
 * COMPLETING A RECURRING TASK CREATES ITS NEXT, ONCE, IN THE SAME TRANSACTION —
 * due one interval after the one it replaces, or after today where it had no
 * date. Nothing else creates a recurrence and nothing waits on a clock. Where
 * the completed task was its claim's next action and the claim is still open,
 * the successor carries the flag on; otherwise the claim has no next action and
 * the breakers list says so.
 */
export function setTaskStatus(d: TaskDeps, actor: Actor, id: string, to: string | null, reasonIn: string | null): TaskResult {
  const r = loadTask(d.db, id);
  const obj = taskObj(d.db, r);
  if (!has(TASK_STATUSES, to)) return { ok: false, why: 'That is not a status a task has.' };
  if (r.status === 'COMPLETED' || r.status === 'CANCELLED') {
    return { ok: false, why: 'A completed or cancelled task keeps its record: its status does not change again.' };
  }
  if (to === 'CANCELLED') authorise(actor, 'staff_task.write', obj);
  else authorise(actor, 'staff_task.progress', obj);
  if (to === r.status) return { ok: true, id: r.id };

  const at = d.now();
  let successor: string | null = null;
  if (to === 'CANCELLED') {
    const reason = textField(reasonIn, 1000, 'The reason');
    if (!reason.ok) return reason;
    if (reason.value === null) return { ok: false, why: 'A task is cancelled with its reason, because it is never deleted.' };
    d.db.run(
      "UPDATE staff_tasks SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?",
      [at, actor.id, reason.value, at, r.id],
    );
  } else if (to === 'IN_PROGRESS') {
    d.db.run("UPDATE staff_tasks SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?", [at, at, r.id]);
  } else if (to === 'OPEN') {
    d.db.run("UPDATE staff_tasks SET status = 'OPEN', updated_at = ? WHERE id = ?", [at, r.id]);
  } else {
    successor = d.db.tx(() => {
      d.db.run("UPDATE staff_tasks SET status = 'COMPLETED', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?",
        [at, actor.id, at, r.id]);
      if (r.recurrence === null) return null;
      const claim = r.claim_id === null ? undefined
        : d.db.get<{ stage: string | null }>('SELECT stage FROM claims WHERE id = ?', [r.claim_id]);
      const carries = r.is_next_action === 1 && claim !== undefined && !isTerminalStage(claim.stage);
      return insertTask(d.db, d.now, d.newId, {
        title: r.title, description: r.description, owner_id: r.owner_id, owner_role: r.owner_role,
        due_on: nextDueOn(r.due_on ?? localDate(at), r.recurrence), priority: r.priority, activity_type: r.activity_type,
        business_id: r.business_id, property_id: r.property_id, claim_id: r.claim_id, lead_id: r.lead_id,
        contact_id: r.contact_id, fact_id: r.fact_id, recurrence: r.recurrence, recurred_from_id: r.id,
        is_next_action: carries, origin: 'RECURRENCE', automation_run_id: null, created_by: actor.id,
        introducer_id: r.introducer_id,
      });
    });
  }
  audit(d, actor, 'STAFF_TASK_STATUS_CHANGED', 'staff_task', r.id, {
    task: r.id, from: r.status, to, business: r.business_id, claim: r.claim_id, lead: r.lead_id,
    ...(successor === null ? {} : { successor }),
  });
  if (to === 'COMPLETED') fireAutomation(d, actor, { trigger: 'TASK_COMPLETED', task_id: r.id });
  return { ok: true, id: successor ?? r.id };
}

/* ================================================================== *
 * 5 · ONE NEXT ACTION
 * ================================================================== */

export type NextActionReading = {
  /** False for a claim that has closed or left the procedure: it keeps no next action. */
  readonly required: boolean;
  readonly task: {
    readonly id: string; readonly title: string; readonly owner_id: string | null; readonly owner: string;
    readonly due_on: string | null; readonly due: DueReading;
  } | null;
  /** Why the claim breaks the rule, or null where it keeps it. */
  readonly breaks: 'NONE' | 'NO_OWNER' | 'NO_DUE_DATE' | null;
  readonly sentence: string;
};

export function nextActionReading(db: Db, claim: { id: string; stage: string | null }, nowIso: string): NextActionReading {
  if (isTerminalStage(claim.stage)) {
    return { required: false, task: null, breaks: null, sentence: 'This claim has closed or left the procedure, and keeps no next action.' };
  }
  const t = db.get<{ id: string; title: string; owner_id: string | null; owner_role: string | null; owner_name: string | null; due_on: string | null }>(
    'SELECT t.id, t.title, t.owner_id, t.owner_role, u.display_name AS owner_name, t.due_on FROM staff_tasks t ' +
      "LEFT JOIN users u ON u.id = t.owner_id WHERE t.claim_id = ? AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')",
    [claim.id],
  );
  if (t === undefined) {
    return {
      required: true, task: null, breaks: 'NONE',
      sentence: 'This claim has no next action. Every open claim has exactly one, with an owner and a due date.',
    };
  }
  const task = { id: t.id, title: t.title, owner_id: t.owner_id, owner: ownerLabel(t), due_on: t.due_on, due: dueReading(t.due_on, nowIso) };
  if (t.owner_id === null) {
    return { required: true, task, breaks: 'NO_OWNER', sentence: `The next action — “${t.title}” — has nobody named as its owner.` };
  }
  if (t.due_on === null) {
    return { required: true, task, breaks: 'NO_DUE_DATE', sentence: `The next action — “${t.title}” — has no due date.` };
  }
  return { required: true, task, breaks: null, sentence: `${t.title} — ${task.owner}, ${task.due.label}` };
}

/**
 * THE REFUSAL `moveClaim` ASKS FOR, after the gate: null where the move may go,
 * and the sentence where it would leave the claim without one current next
 * action with an owner and a due date. A move to CLOSED or to an exit needs
 * none — a claim that has finished keeps no next action.
 */
export function nextActionRefusal(db: Db, claim_id: string, to: string): string | null {
  if (isTerminalStage(to)) return null;
  const c = db.get<{ id: string; stage: string | null }>('SELECT id, stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return null;
  // The claim is not yet at `to`; its next action is asked about as it stands.
  const r = nextActionReading(db, { id: c.id, stage: null }, '1970-01-01T00:00:00.000Z');
  if (r.breaks === null) return null;
  return `A claim moving to ${anyStageLabel(to)} needs one next step, with an owner and a due date. ` +
    `This one has not: ${r.sentence} Set the claim’s next step first.`;
}

/**
 * SET THE CLAIM'S NEXT ACTION — a new task, or an open task already on the claim
 * promoted. Either way it names a person and a date, and the one before it stops
 * being the next action in the same transaction; it stays a task.
 */
export function setNextAction(d: TaskDeps, actor: Actor, claim_id: string, input: Fields): TaskResult {
  const c = d.db.get<{ id: string; business_id: string; stage: string | null }>(
    'SELECT id, business_id, stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'claim.write', claimObjFor(d.db, c));
  if (isTerminalStage(c.stage)) {
    return { ok: false, why: 'This claim has closed or left the procedure, and keeps no next action.' };
  }
  const at = d.now();
  const promote = clean(input['task_id']);
  if (promote !== null) {
    const t = loadTask(d.db, promote);
    if (t.claim_id !== c.id) return { ok: false, why: 'That task is not on this claim.' };
    if (!OPEN_STATES.includes(t.status)) return { ok: false, why: 'A completed or cancelled task cannot be the next action.' };
    if (t.owner_id === null || t.due_on === null) {
      return { ok: false, why: 'A claim’s next action has an owner and a due date — give that task both first.' };
    }
    d.db.tx(() => {
      clearNextAction(d.db, c.id, at);
      d.db.run('UPDATE staff_tasks SET is_next_action = 1, updated_at = ? WHERE id = ?', [at, t.id]);
    });
    audit(d, actor, 'NEXT_ACTION_SET', 'staff_task', t.id, { task: t.id, business: c.business_id, claim: c.id, route: 'promoted' });
    return { ok: true, id: t.id };
  }
  const v = taskValues(d.db, { activity_type: 'TASK', ...input }, BLANK);
  if (!v.ok) return v;
  if (v.value.owner_id === null) return { ok: false, why: 'A claim’s next action has an owner: choose the person who will do it.', field: 'owner_id' };
  if (v.value.due_on === null) return { ok: false, why: 'A claim’s next action has a due date.', field: 'due_on' };
  const id = d.db.tx(() => {
    clearNextAction(d.db, c.id, at);
    return insertTask(d.db, d.now, d.newId, {
      title: v.value.title ?? '', description: v.value.description, owner_id: v.value.owner_id, owner_role: null,
      due_on: v.value.due_on, priority: v.value.priority, activity_type: v.value.activity_type ?? 'TASK',
      business_id: c.business_id, property_id: null, claim_id: c.id, lead_id: null, contact_id: null, fact_id: null,
      recurrence: v.value.recurrence, recurred_from_id: null, is_next_action: true, origin: 'STAFF',
      automation_run_id: null, created_by: actor.id,
    });
  });
  audit(d, actor, 'NEXT_ACTION_SET', 'staff_task', id, { task: id, business: c.business_id, claim: c.id, route: 'new' });
  return { ok: true, id };
}

export type NextActionInput = { readonly title: string | null; readonly owner_id: string | null; readonly due_on: string | null };
export type NextActionWrite = { readonly title: string; readonly owner_id: string; readonly due_on: string };

/** A next action carried on a stage move — checked exactly as `setNextAction` checks one. */
export function validNextAction(db: Db, input: NextActionInput): { ok: true; value: NextActionWrite } | { ok: false; why: string; field?: string } {
  const v = taskValues(db, { title: input.title, owner_id: input.owner_id, due_on: input.due_on, activity_type: 'TASK' }, BLANK);
  if (!v.ok) return v;
  if (v.value.title === null) return { ok: false, why: 'Say what the claim’s next action is.', field: 'title' };
  if (v.value.owner_id === null) return { ok: false, why: 'A claim’s next action has an owner: choose the person who will do it.', field: 'owner_id' };
  if (v.value.due_on === null) return { ok: false, why: 'A claim’s next action has a due date.', field: 'due_on' };
  return { ok: true, value: { title: v.value.title, owner_id: v.value.owner_id, due_on: v.value.due_on } };
}

/** Write it INSIDE the caller's transaction: the flag moves to the new task, and the one before stays a task. */
export function writeNextAction(
  db: Db, now: () => string, newId: () => string, actor: Actor, claim: { id: string; business_id: string }, w: NextActionWrite,
): string {
  clearNextAction(db, claim.id, now());
  return insertTask(db, now, newId, {
    title: w.title, description: null, owner_id: w.owner_id, owner_role: null, due_on: w.due_on, priority: null,
    activity_type: 'TASK', business_id: claim.business_id, property_id: null, claim_id: claim.id, lead_id: null,
    contact_id: null, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF',
    automation_run_id: null, created_by: actor.id,
  });
}

export type BreakerRow = {
  readonly id: string;
  readonly claim_ref: string;
  readonly client: string;
  readonly stage: string;
  readonly owner: string | null;
  readonly reading: NextActionReading;
  /** The engaged-client list's own answer — both waiting reads as ours. For a reader of organisations. */
  readonly waiting?: { readonly who: WaitingOn; readonly why: string };
};

export type Breakers = { readonly breaking: readonly BreakerRow[]; readonly overdue: readonly BreakerRow[]; readonly checked: number };

/**
 * EVERY OPEN CLAIM BREAKING THE RULE — no next action, or one with no owner or
 * no due date — and, apart, every claim whose next action is overdue. Authorised
 * row by row. `pipeline.read` gates the list: it is a view of the pipeline.
 */
export function nextActionBreakers(db: Db, actor: Actor, nowIso: string): Breakers {
  authorise(actor, 'pipeline.read', { type: 'pipeline', id: '__next_actions__' });
  const rows = db.all<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string; owner_name: string | null }>(
    'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, u.display_name AS owner_name ' +
      'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.claim_ref ASC',
  ).filter((r) => can(actor, 'claim.read', claimObjFor(db, r)) && !isTerminalStage(r.stage));
  const waiting = new Map<string, { who: WaitingOn; why: string } | null>();
  const breaking: BreakerRow[] = [];
  const overdue: BreakerRow[] = [];
  for (const r of rows) {
    const reading = nextActionReading(db, r, nowIso);
    if (reading.breaks === null && !(reading.task?.due.overdue ?? false)) continue;
    if (!waiting.has(r.business_id)) waiting.set(r.business_id, waitingOn(db, actor, r.business_id));
    const w = waiting.get(r.business_id) ?? null;
    const row: BreakerRow = {
      id: r.id, claim_ref: r.claim_ref, client: r.business_name, stage: claimStage(r.stage).label, owner: r.owner_name,
      reading, ...(w === null ? {} : { waiting: w }),
    };
    if (reading.breaks !== null) breaking.push(row); else overdue.push(row);
  }
  return { breaking, overdue, checked: rows.length };
}

/* ================================================================== *
 * 6 · THE CLAIM'S TASK PANEL, MY TASKS, AND ONE TASK
 * ================================================================== */

export type ClaimTaskPanel = {
  readonly next_action: NextActionReading;
  readonly waiting?: { readonly who: WaitingOn; readonly why: string };
  readonly tasks: readonly TaskView[];
  /** Open client questions past their due date — for a reader of organisations. */
  readonly overdue_client_questions?: readonly { readonly question: string; readonly due_on: string; readonly sent: boolean }[];
  readonly may_set_next_action: boolean;
  readonly may_add_task: boolean;
  readonly owner_choices?: readonly { readonly id: string; readonly name: string; readonly role: string }[];
};

/**
 * WHAT THE CLAIM PAGE SHOWS ABOUT WORK. The caller has authorised `claim.read`.
 * Every task is filtered through `staff_task.read`, so a surveyor's panel holds
 * their own tasks on the claim and nothing else.
 */
export function claimTaskPanel(db: Db, actor: Actor, claim: { id: string; business_id: string; stage: string | null }, nowIso: string): ClaimTaskPanel {
  const tasks = db.all<TaskDbRow>(
    `${TASK_SELECT}WHERE t.claim_id = ? ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, ` +
      't.due_on IS NULL, t.due_on ASC, t.created_at DESC',
    [claim.id],
  ).filter((r) => can(actor, 'staff_task.read', taskObj(db, r))).map((r) => viewOf(db, actor, r, nowIso));
  const staff = can(actor, 'organisation.read', { type: 'business', id: claim.business_id });
  const w = staff ? waitingOn(db, actor, claim.business_id) : null;
  // CRM 4 of 10: document requests are the documents panel's, flagged OVERDUE there by the same reading.
  const questions = staff
    ? db.all<{ question: string; due_on: string; sent_to_portal_at: string | null }>(
      "SELECT question, due_on, sent_to_portal_at FROM client_tasks WHERE business_id = ? AND state = 'OPEN' AND kind = 'QUESTION' " +
        'AND due_on IS NOT NULL AND due_on < ? ORDER BY due_on ASC',
      [claim.business_id, localDate(nowIso)],
    ).map((q) => ({ question: q.question, due_on: q.due_on, sent: q.sent_to_portal_at !== null }))
    : null;
  const mayAdd = can(actor, 'staff_task.create', sectionObj());
  const maySet = can(actor, 'claim.write', claimObjFor(db, claim)) && !isTerminalStage(claim.stage);
  return {
    next_action: nextActionReading(db, claim, nowIso),
    ...(w === null ? {} : { waiting: w }),
    tasks,
    ...(questions === null ? {} : { overdue_client_questions: questions }),
    may_set_next_action: maySet,
    may_add_task: mayAdd,
    ...(mayAdd || maySet ? { owner_choices: taskOwnerChoices(db) } : {}),
  };
}

export type MyWork = {
  readonly tasks: readonly TaskView[];
  readonly overdue: number;
  /** Questions I put to a client that are past their due date — for a reader of organisations. */
  readonly client_questions_overdue: readonly { readonly question: string; readonly due_on: string; readonly business_id: string; readonly client: string }[];
  /**
   * CRM 4 of 10. Documents I asked a client for that have not arrived — every one,
   * each with its due reading, so an overdue one is flagged by the UK date and one
   * with no due date says so.
   */
  readonly document_requests_outstanding: readonly {
    readonly id: string; readonly type_label: string; readonly due: DueReading; readonly business_id: string; readonly client: string;
    readonly claim: { readonly id: string; readonly claim_ref: string; readonly name: string } | null;
  }[];
  /** Claims I own that break the one-next-action rule. */
  readonly claims_without_next_action: readonly { readonly id: string; readonly claim_ref: string; readonly name: string; readonly sentence: string }[];
  /**
   * THE CRM FOLLOW-ON. Open claims NOBODY owns that break the rule — on no owner's list, so they are on the landing page of
   * the people who hand work out: `pipeline.read`, ADMIN and SALES. Empty for everyone else.
   */
  readonly unowned_claims_breaking: readonly { readonly id: string; readonly claim_ref: string; readonly name: string; readonly client: string; readonly sentence: string }[];
  /**
   * CRM 9 of 10. EVERY question I put to a client that is still open — not only the overdue ones — each with its due
   * reading, so one past its date is OVERDUE by the UK date and one with none says so; and whether it has reached the
   * client's portal, because one that has not waits on us.
   */
  readonly questions_waiting: readonly {
    readonly question: string; readonly due: DueReading; readonly business_id: string; readonly client: string; readonly sent: boolean;
  }[];
  /**
   * CRM 9 of 10. The open claims I own, each with its next action — read from its task, as the claim page reads it —
   * and who is waiting, by `waitingOn`, the engaged-client list's own rule and never a second ladder. `waiting` is null
   * for a reader that list would not admit.
   */
  readonly my_claims: readonly {
    readonly id: string; readonly claim_ref: string; readonly name: string; readonly stage: string; readonly next_action: string; readonly overdue: boolean;
    readonly waiting: { readonly who: WaitingOn; readonly why: string } | null;
  }[];
};

/**
 * MY TASKS — FOR EVERY STAFF ROLE. What I own, and what waits with my team while
 * nobody has taken it; overdue first. The caller has asked `backoffice.enter`.
 */
export function myWork(db: Db, actor: Actor, nowIso: string): MyWork {
  const tasks = db.all<TaskDbRow>(
    `${TASK_SELECT}WHERE t.status IN ('OPEN','IN_PROGRESS') AND (t.owner_id = ? OR (t.owner_id IS NULL AND t.owner_role = ?)) ` +
      'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC',
    [actor.id, actor.role],
  ).filter((r) => can(actor, 'staff_task.read', taskObj(db, r))).map((r) => viewOf(db, actor, r, nowIso));
  const ordered = [...tasks.filter((t) => t.due.overdue), ...tasks.filter((t) => !t.due.overdue)];
  const questions = db.all<{ question: string; due_on: string; business_id: string; business_name: string }>(
    'SELECT ct.question, ct.due_on, ct.business_id, b.name AS business_name FROM client_tasks ct ' +
      "JOIN businesses b ON b.id = ct.business_id WHERE ct.asked_by = ? AND ct.state = 'OPEN' AND ct.kind = 'QUESTION' " +
      'AND ct.due_on IS NOT NULL AND ct.due_on < ? ORDER BY ct.due_on ASC',
    [actor.id, localDate(nowIso)],
  ).filter((q) => can(actor, 'organisation.read', { type: 'business', id: q.business_id }))
    .map((q) => ({ question: q.question, due_on: q.due_on, business_id: q.business_id, client: q.business_name }));
  const requests = db.all<{
    id: string; type_label: string; due_on: string | null; business_id: string; business_name: string; claim_id: string | null; claim_ref: string | null;
  }>(
    'SELECT ct.id, t.label AS type_label, ct.due_on, ct.business_id, b.name AS business_name, ct.claim_id, c.claim_ref FROM client_tasks ct ' +
      'JOIN document_types t ON t.code = ct.requested_type JOIN businesses b ON b.id = ct.business_id LEFT JOIN claims c ON c.id = ct.claim_id ' +
      "WHERE ct.asked_by = ? AND ct.kind = 'DOCUMENT' AND ct.state = 'OPEN' ORDER BY ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC",
    [actor.id],
  ).filter((q) => can(actor, 'document_request.read', { type: 'document_request', id: q.id, business_id: q.business_id }))
    .map((q) => ({
      id: q.id, type_label: q.type_label, due: dueReading(q.due_on, nowIso), business_id: q.business_id, client: q.business_name,
      claim: q.claim_id === null || q.claim_ref === null ? null : { id: q.claim_id, claim_ref: q.claim_ref, name: claimWords(db, q.claim_id) },
    }));
  const owned = db.all<{ id: string; claim_ref: string; business_id: string; stage: string | null }>(
    'SELECT id, claim_ref, business_id, stage FROM claims WHERE owner_id = ? ORDER BY claim_ref ASC', [actor.id],
  ).filter((c) => !isTerminalStage(c.stage) && can(actor, 'claim.read', claimObjFor(db, c)))
    .map((c) => ({ c, reading: nextActionReading(db, c, nowIso) }));
  const mine = owned.filter((x) => x.reading.breaks !== null)
    .map((x) => ({ id: x.c.id, claim_ref: x.c.claim_ref, name: claimWords(db, x.c.id), sentence: x.reading.sentence }));
  // THE CRM FOLLOW-ON: nobody's claims breaking the rule, for the people who give a claim its owner. Each asked of `claim.read`.
  const unowned = can(actor, 'pipeline.read', { type: 'pipeline', id: '__my_work__' })
    ? db.all<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string }>(
      'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name FROM claims c JOIN businesses b ON b.id = c.business_id ' +
        'WHERE c.owner_id IS NULL ORDER BY c.claim_ref ASC',
    ).filter((c) => !isTerminalStage(c.stage) && can(actor, 'claim.read', claimObjFor(db, c)))
      .map((c) => ({ c, reading: nextActionReading(db, c, nowIso) }))
      .filter((x) => x.reading.breaks !== null)
      .map((x) => ({ id: x.c.id, claim_ref: x.c.claim_ref, name: claimWords(db, x.c.id), client: x.c.business_name, sentence: x.reading.sentence }))
    : [];
  // CRM 9 of 10: every open question I asked, overdue first, then by due date, never-dated last.
  const waitingQuestions = db.all<{ question: string; due_on: string | null; business_id: string; business_name: string; sent_to_portal_at: string | null }>(
    'SELECT ct.question, ct.due_on, ct.business_id, b.name AS business_name, ct.sent_to_portal_at FROM client_tasks ct ' +
      "JOIN businesses b ON b.id = ct.business_id WHERE ct.asked_by = ? AND ct.state = 'OPEN' AND ct.kind = 'QUESTION' " +
      'ORDER BY ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC',
    [actor.id],
  ).filter((q) => can(actor, 'organisation.read', { type: 'business', id: q.business_id }))
    .map((q) => ({ question: q.question, due: dueReading(q.due_on, nowIso), business_id: q.business_id, client: q.business_name, sent: q.sent_to_portal_at !== null }));
  const myClaims = owned.map((x) => ({
    id: x.c.id, claim_ref: x.c.claim_ref, name: claimWords(db, x.c.id), stage: anyStageLabel(x.c.stage),
    next_action: x.reading.task === null ? x.reading.sentence : `${x.reading.task.title} — ${x.reading.task.due.label}`,
    overdue: x.reading.task?.due.overdue ?? false,
    waiting: can(actor, 'organisation.read', { type: 'business', id: x.c.business_id }) ? waitingOn(db, actor, x.c.business_id) : null,
  }));
  return {
    tasks: ordered,
    overdue: ordered.filter((t) => t.due.overdue).length,
    client_questions_overdue: questions,
    document_requests_outstanding: requests,
    claims_without_next_action: mine,
    unowned_claims_breaking: unowned,
    questions_waiting: [...waitingQuestions.filter((q) => q.due.overdue), ...waitingQuestions.filter((q) => !q.due.overdue)],
    my_claims: myClaims,
  };
}

/** Every open task the reader may read — the whole team's list, for those who hand work out. */
export function openTasks(db: Db, actor: Actor, nowIso: string, limit = 500): TaskView[] {
  authorise(actor, 'staff_task.create', sectionObj());
  return db.all<TaskDbRow>(
    `${TASK_SELECT}WHERE t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC LIMIT ?`,
    [limit],
  ).filter((r) => can(actor, 'staff_task.read', taskObj(db, r))).map((r) => viewOf(db, actor, r, nowIso));
}

/**
 * PHASE 136 — EVERY OPEN TASK DUE TODAY OR LATE THAT THE READER MAY READ, for Home's "Today and overdue" row. No section
 * gate beyond the back office: each row is asked `staff_task.read`, so a login sees exactly the tasks it could open.
 */
export function tasksDueByToday(db: Db, actor: Actor, nowIso: string, limit = 200): TaskView[] {
  return db.all<TaskDbRow>(
    `${TASK_SELECT}WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.due_on IS NOT NULL AND t.due_on <= ? ORDER BY t.due_on ASC, t.created_at ASC LIMIT ?`,
    [localDate(nowIso), limit],
  ).filter((r) => can(actor, 'staff_task.read', taskObj(db, r))).map((r) => viewOf(db, actor, r, nowIso));
}

export type TaskPage = {
  readonly task: TaskView;
  readonly owner_choices?: readonly { readonly id: string; readonly name: string; readonly role: string }[];
};

export function taskPage(db: Db, actor: Actor, id: string, nowIso: string): TaskPage {
  const r = loadTask(db, id);
  authorise(actor, 'staff_task.read', taskObj(db, r));
  const task = viewOf(db, actor, r, nowIso);
  return { task, ...(task.may_write ? { owner_choices: taskOwnerChoices(db) } : {}) };
}

/** The open follow-ups naming a contact, earliest first — what `next_follow_up_at` became (row 5.12). */
export function followUpsFor(db: Db, contact_id: string): { due_on: string | null; count: number } {
  const r = db.get<{ due_on: string | null; n: number }>(
    "SELECT MIN(due_on) AS due_on, COUNT(*) AS n FROM staff_tasks WHERE contact_id = ? AND status IN ('OPEN','IN_PROGRESS')",
    [contact_id],
  );
  return { due_on: r?.due_on ?? null, count: r?.n ?? 0 };
}

/**
 * PHASE 133a — THE GATE OF THE ONE-NEXT-ACTION LIST, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function nextActionsGate(actor: Actor): void {
  authorise(actor, 'pipeline.read', { type: 'pipeline', id: '__next_actions__' });
}
