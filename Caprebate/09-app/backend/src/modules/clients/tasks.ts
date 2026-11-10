/**
 * THE CLIENT RECORD'S TASKS: WRITING ONE, AND READING WHEN ONE IS DUE (Phase 161l1, carved from
 * src/modules/crm/tasks.ts unchanged). The activity lists, the date arithmetic, the due reading, the task as `can()` is
 * asked about it, and the row written. Read by the CRM's task screens and by the modules below it that raise a task.
 */
import type { Db, Obj } from '../../core/index.ts';
import { surveyorsOnClaim } from '../../core/index.ts';
import { localDate, ukDate, dueWords } from '../../shared/index.ts';
import { insertStaffTasks } from './data.ts';

type Vocab = Readonly<Record<string, string>>;

/** The full specification's 10.4, in its own words. */
export const ACTIVITY_TYPES: Vocab = Object.freeze({
  CALL: 'Call', EMAIL: 'Email', MEETING: 'Meeting', NOTE: 'Note', TASK: 'Task', SURVEY: 'Survey',
  DOCUMENT_REQUEST: 'Document request', REVIEW: 'Review', OTHER: 'Other',
});

/**
 * CRM 5 of 10: reward model A's three kinds of reciprocity. On the activity list
 * (migration 014 replaced the trigger pair) but NOT in `ACTIVITY_TYPES`, because
 * the database allows them only on a task on an introducing firm, and only while
 * model A is the setting — src/modules/crm/introducers.ts is the one place that writes one.
 */
export const RECIPROCITY_ACTIVITY_TYPES: Vocab = Object.freeze({
  CPD_SESSION: 'A CPD session for the practice',
  CO_BRANDED_ONE_PAGER: 'A co-branded one-pager for the firm’s client newsletter',
  PRIORITY_TURNAROUND: 'Priority turnaround on a referred case',
});

/** The teams a task may wait with while nobody has taken it. Never CLIENT. */
export const POOL_ROLES: Vocab = Object.freeze({
  ADMIN: 'Admin', SALES: 'Sales', ACCOUNTING: 'Accounting', SURVEYING: 'Surveying',
});

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

export type DueState = 'OVERDUE' | 'DUE_TODAY' | 'NOT_YET_DUE' | 'NO_DUE_DATE' | 'CLOSED';

export type DueReading = { readonly state: DueState; readonly overdue: boolean; readonly label: string };

/** THE WORDS for a task, a question or a request with no due date — one sentence, everywhere (N4). */
export const NO_DUE_DATE = 'no due date — so it is not overdue, and it is not on time either';

export function dueReading(due_on: string | null, nowIso: string, closed = false): DueReading {
  // THE WORDS ARE THE ONE UK-DATE HELPER'S — "3 days overdue (14 Sep 2026)", "Due today (17 Sep 2026)", "Due in
  // 3 days". The STATES are unchanged, and still decided here, on the UK date.
  if (closed) {
    return { state: 'CLOSED', overdue: false, label: due_on === null ? 'Closed. It had no due date.' : `Closed. It was due ${ukDate(due_on)}.` };
  }
  if (due_on === null) return { state: 'NO_DUE_DATE', overdue: false, label: NO_DUE_DATE };
  const today = localDate(nowIso);
  if (due_on < today) return { state: 'OVERDUE', overdue: true, label: dueWords(due_on, nowIso) };
  if (due_on === today) return { state: 'DUE_TODAY', overdue: false, label: dueWords(due_on, nowIso) };
  return { state: 'NOT_YET_DUE', overdue: false, label: dueWords(due_on, nowIso) };
}

/** The task as `can()` is asked about it. */
export function taskObj(
  db: Db, r: { id: string; business_id: string | null; owner_id: string | null; owner_role: string | null; claim_id: string | null },
): Extract<Obj, { type: 'staff_task' }> {
  const assigned = r.claim_id !== null && r.business_id !== null
    ? surveyorsOnClaim(db, r.claim_id)
    : [];
  return {
    type: 'staff_task', id: r.id, business_id: r.business_id, owner_id: r.owner_id, owner_role: r.owner_role,
    assigned_surveyor_ids: assigned,
  };
}

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
 * THE ROW, WRITTEN. No authorisation and no validation: every caller has done
 * both — the store functions below, the automation runner, the seed, and the
 * introducer's contact log. The database's own CHECKs and triggers still refuse a
 * task about nothing, a property of another organisation, a second next action,
 * a word not on a list, and a task on a firm that is about anything else too.
 */
export function insertTask(db: Db, now: () => string, newId: () => string, t: TaskInsert): string {
  const id = newId();
  const at = now();
  insertStaffTasks(db, [id, t.title, t.description, t.owner_id, t.owner_id === null ? t.owner_role : null, t.due_on, t.priority, 'OPEN',
      t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence,
      t.recurred_from_id, t.is_next_action ? 1 : 0, t.origin, t.automation_run_id, t.created_by, at, at, t.introducer_id ?? null,
      t.company_subject ?? null]);
  return id;
}
