/**
 * ENQUIRY_RETENTION — THE CLEAN-UP JOB FOR CLOSED WEBSITE ENQUIRIES. BUILT, AND SWITCHED OFF. Phase 153c, 4 October 2026.
 *
 * Word question 222, Sadique's: "How long do we keep a closed website enquiry before it is deleted?" Built on our
 * recommendation for him to check: twelve months after it was closed. A deletion cannot be undone, so — like the
 * message clean-up before it was answered — the job ships OFF and deletes nothing until the officer approves the period
 * and that approval is recorded; then a scheduled run of `node src/cli.ts sweep-enquiries` applies it.
 *
 * TWO KINDS OF ENQUIRY, NAMED:
 *   1. THE CONTACT FORM (/enquiry, `website_enquiries`, migration 031). One closed by staff (status CLOSED, its
 *      `handled_at` the day it was closed) is due twelve months after that day. This job writes the deletion log entry
 *      FIRST, then deletes the row, in one transaction — one entry per enquiry, naming its kind and id, never a word of
 *      it and never the person. An enquiry that became a lead (status LEAD) is a lead now, and is not this job's.
 *  *   2. THE FOUR-STAGE FUNNEL (`leads` with an `enquiry_id`, migration 061). A funnel enquiry is a CRM lead, tied to its
 *      organisation, its contacts and any booking. PHASE 157 (the sweep, 6 October 2026) BUILT ITS DELETION PATH, under
 *      the same switch and the same period: a lead LOST more than the period ago (its `updated_at`, the day it was
 *      marked lost) is deleted with the funnel's own rows that hang off it — `leadDeletionPlan` says exactly which.
 *        WHAT GOES: the lead; its contacts and what they answered about consent; its bookings, their changes and video
 *        meetings; the emails written to it; its staff tasks, automation runs and enquiry checks. And, ONLY when every
 *        lead of its organisation is a lost funnel enquiry past the period, the organisation too: its properties,
 *        assessment and answers, sealed estimate, research rows and the draft that made it.
 *        WHAT STAYS: anything with a reason of its own — a claim, an engagement or signature, an invoice, a complaint,
 *        a rights request, a breach entry, a document, a client message, an identity or due-diligence check, an
 *        introducer's record, a call log — and if any such row hangs off the lead or its organisation, NOTHING is
 *        deleted and the job says which table held it. The audit log keeps its rows (ids only, never a word). One
 *        deletion log entry per lead (FUNNEL_LEAD) and per organisation (FUNNEL_BUSINESS), written FIRST, in the same
 *        transaction: migration 093's triggers admit a delete only for rows those entries name.
 * A LIVE LEGAL HOLD STOPS IT (record kind WEBSITE_ENQUIRY, by its id; LEAD and COMPANY for a funnel enquiry). N4: an
 * enquiry with no closing day is never due.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { liveHeldIds } from './compliance.ts';
import { addMonths } from './message-retention.ts';
import { BACKUP_CYCLE, knownBackupCycleDays } from './upload-handler-port.ts';
import { FUNNEL_DELETABLE_TABLES, type FunnelEdge } from './funnel-deletable.ts';
import { FUNNEL_DELETE_SQL, FUNNEL_EDGES } from './funnel-edges.ts';

export type EnquiryRetention = {
  readonly enabled: boolean;
  /** Months after the enquiry was closed. Null: off. */
  readonly closed_months: number | null;
  readonly approved_by: string | null;
  readonly review_ref: string | null;
  readonly question: string;
};

export const ENQUIRY_RETENTION_QUESTION = 'How long do we keep a closed website enquiry before it is deleted?';
export const ENQUIRY_RETENTION_RULE = 'ENQ-RETENTION';

/** OFF, with our recommended twelve months written in, waiting for the officer's approval and its record. */
export const ENQUIRY_RETENTION: EnquiryRetention = Object.freeze({
  enabled: false,
  closed_months: 12,
  approved_by: null,
  review_ref: null,
  question: ENQUIRY_RETENTION_QUESTION,
});

const textOrNull = (s: string | null): string | null => (s !== null && s.trim().length >= 2 ? s.trim() : null);

export function enquiryRetentionMissing(cfg: EnquiryRetention): string[] {
  const out: string[] = [];
  if (!(cfg.closed_months !== null && Number.isInteger(cfg.closed_months) && cfg.closed_months >= 1)) out.push('Set how long a closed enquiry is kept. The data protection officer decides.');
  if (textOrNull(cfg.approved_by) === null || textOrNull(cfg.review_ref) === null) out.push('Record who approved it, and where.');
  if (cfg.enabled !== true) out.push('Then switch the clean-up on.');
  return out;
}

export type DueEnquiry = { readonly id: string; readonly closed_on: string; readonly due_on: string };

/** The contact-form enquiries whose time is up. Empty while the job is off in any of its ways. */
export function enquiriesDue(db: Db, cfg: EnquiryRetention, nowIso: string): DueEnquiry[] {
  if (enquiryRetentionMissing(cfg).length > 0 || cfg.closed_months === null) return [];
  const today = nowIso.slice(0, 10);
  const held = liveHeldIds(db, 'WEBSITE_ENQUIRY');
  return db.all<{ id: string; handled_at: string | null }>("SELECT id, handled_at FROM website_enquiries WHERE status = 'CLOSED'")
    .filter((r) => typeof r.handled_at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.handled_at) && !held.has(r.id))
    .map((r) => { const closed_on = (r.handled_at as string).slice(0, 10); return { id: r.id, closed_on, due_on: addMonths(closed_on, cfg.closed_months as number) }; })
    .filter((r) => r.due_on < today);
}

/** The funnel leads lost more than the period ago. Phase 157: `sweepEnquiries` now deletes those `leadDeletionPlan` allows. */
export function funnelLeadsDue(db: Db, cfg: EnquiryRetention, nowIso: string): number {
  if (cfg.closed_months === null) return 0;
  const today = nowIso.slice(0, 10);
  return db.all<{ updated_at: string }>("SELECT updated_at FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'")
    .filter((r) => addMonths(r.updated_at.slice(0, 10), cfg.closed_months as number) < today).length;
}

export type EnquirySweep =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | {
    readonly state: 'DONE'; readonly deleted: number;
    /** Phase 157: funnel leads deleted, with the funnel's own rows that hung off them. */
    readonly funnel_leads_deleted: number;
    /** Funnel leads past the period and NOT deleted, each with the reason (a claim, a hold …). */
    readonly funnel_leads_kept: readonly { readonly lead_id: string; readonly why: string }[];
    readonly funnel_leads_due_not_deleted: number;
  };

/* ================================================================== *
 * PHASE 157 — THE DELETION PATH FOR A LOST FUNNEL ENQUIRY
 * ================================================================== */

/** THE FUNNEL'S OWN TABLES (src/web/funnel-deletable.ts): the only tables a funnel lead's deletion may reach. */
export const FUNNEL_DELETABLE: ReadonlySet<string> = new Set(FUNNEL_DELETABLE_TABLES);

type RowRef = { readonly table: string; readonly rowid: number };

/** The edges, by the table they leave from. */
const EDGES_FROM: ReadonlyMap<string, readonly FunnelEdge[]> = (() => {
  const m = new Map<string, FunnelEdge[]>();
  for (const e of FUNNEL_EDGES) m.set(e.parent, [...(m.get(e.parent) ?? []), e]);
  return m;
})();

export type LeadDeletionPlan =
  | { readonly delete: true; readonly lead_ids: readonly string[]; readonly business_ids: readonly string[]; readonly rows: readonly RowRef[]; readonly tables: Readonly<Record<string, number>> }
  | { readonly delete: false; readonly why: string };

/**
 * WHAT DELETING THIS FUNNEL LEAD WOULD TAKE WITH IT, OR WHY IT MUST STAY. Reads only. The organisation goes too only
 * when every lead of it is a lost funnel enquiry past the period (`due`). Every row that hangs off what goes is found
 * through the database's own foreign keys, written out as literal statements (src/web/funnel-edges.ts, generated from
 * the schema; a test fails when the schema gains one the file lacks): if it is not one of the funnel's own
 * (FUNNEL_DELETABLE), its row keeps the lot.
 */
export function leadDeletionPlan(db: Db, lead_id: string, due: (lead_id: string) => boolean): LeadDeletionPlan {
  const lead = db.get<{ id: string; business_id: string | null; status: string; enquiry_id: string | null }>(
    'SELECT id, business_id, status, enquiry_id FROM leads WHERE id = ?', [lead_id]);
  if (lead === undefined) return { delete: false, why: 'no such lead' };
  if (lead.enquiry_id === null || lead.status !== 'LOST') return { delete: false, why: 'not a lost funnel enquiry' };
  if (!due(lead.id)) return { delete: false, why: 'its period is not over' };
  if (liveHeldIds(db, 'LEAD').has(lead.id)) return { delete: false, why: 'a legal hold is on the lead' };
  const business = lead.business_id;
  let wholeBusiness = false;
  if (business !== null) {
    if (liveHeldIds(db, 'COMPANY').has(business)) return { delete: false, why: 'a legal hold is on the organisation' };
    const others = db.all<{ id: string; status: string; enquiry_id: string | null }>('SELECT id, status, enquiry_id FROM leads WHERE business_id = ?', [business]);
    wholeBusiness = others.every((o) => o.status === 'LOST' && o.enquiry_id !== null && due(o.id) && !liveHeldIds(db, 'LEAD').has(o.id));
    /* A portal login is tied to its organisation by `users.business_id`, which carries no foreign key, so the walk
       below would not see it. A client who made a login keeps their organisation: that is theirs to close. */
    if (wholeBusiness && db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE business_id = ?', [business])!.n > 0) {
      return { delete: false, why: 'the client made a portal login for the organisation' };
    }
  }
  const seen = new Map<string, RowRef>();
  const order: RowRef[] = [];
  const queue: RowRef[] = [];
  const add = (table: string, rowid: number): void => {
    const key = `${table}#${rowid}`;
    if (seen.has(key)) return;
    const r = { table, rowid };
    seen.set(key, r); order.push(r); queue.push(r);
  };
  const leadRow = db.get<{ rowid: number }>('SELECT rowid FROM leads WHERE id = ?', [lead.id])!;
  add('leads', leadRow.rowid);
  if (wholeBusiness && business !== null) add('businesses', db.get<{ rowid: number }>('SELECT rowid FROM businesses WHERE id = ?', [business])!.rowid);
  while (queue.length > 0) {
    const r = queue.shift()!;
    for (const e of EDGES_FROM.get(r.table) ?? []) {
      const values = db.get<Record<string, string | number | null>>(e.parent_sql, [r.rowid]);
      if (values === undefined || e.parent_cols.some((c) => values[c] === null || values[c] === undefined)) continue;
      for (const hit of db.all<{ rowid: number }>(e.child_sql, e.parent_cols.map((c) => values[c] as string | number))) {
        if (!FUNNEL_DELETABLE.has(e.child)) {
          return { delete: false, why: `a row of ${e.child} hangs off it, and that has a reason of its own to stay` };
        }
        add(e.child, hit.rowid);
      }
    }
  }
  const lead_ids = order.filter((r) => r.table === 'leads').map((r) => db.get<{ id: string }>('SELECT id FROM leads WHERE rowid = ?', [r.rowid])!.id);
  const business_ids = order.filter((r) => r.table === 'businesses').map((r) => db.get<{ id: string }>('SELECT id FROM businesses WHERE rowid = ?', [r.rowid])!.id);
  if (lead_ids.some((id) => id !== lead.id && !due(id))) return { delete: false, why: 'another lead of the organisation is not due' };
  const tables: Record<string, number> = {};
  for (const r of order) tables[r.table] = (tables[r.table] ?? 0) + 1;
  return { delete: true, lead_ids, business_ids, rows: order, tables };
}

export function sweepEnquiries(
  d: { db: Db; audit: AuditLog; now: () => string; newId: () => string }, cfg: EnquiryRetention = ENQUIRY_RETENTION,
  actor: { id: string; role: string } | null = null,
): EnquirySweep {
  const missing = enquiryRetentionMissing(cfg);
  if (missing.length > 0) return { state: 'OFF', missing };
  const at = d.now();
  const due = enquiriesDue(d.db, cfg, at);
  const cycle = knownBackupCycleDays(BACKUP_CYCLE);
  const logEntry = (record_kind: string, record_id: string, category: string, due_on: string | null): void => {
    d.db.run(
      'INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
        'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)',
      [`DEL-ENQ-${d.newId()}`, record_kind, record_id, category, ENQUIRY_RETENTION_RULE, due_on,
        textOrNull(cfg.approved_by) ?? '', textOrNull(cfg.review_ref) ?? '', actor?.id ?? 'the enquiry clean-up job', at, '["database"]',
        cycle === null || cycle > 0 ? 1 : 0, cycle,
        cycle === null || cycle === 0 ? null : new Date(new Date(at).getTime() + cycle * 86_400_000).toISOString()]);
  };
  /* PHASE 157: the funnel leads past the period, each deleted with its own rows, or kept with the reason. */
  const today = at.slice(0, 10);
  const lostOn = new Map(d.db.all<{ id: string; updated_at: string }>("SELECT id, updated_at FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'")
    .map((r) => [r.id, r.updated_at.slice(0, 10)] as const));
  const isDue = (id: string): boolean => { const on = lostOn.get(id); return on !== undefined && addMonths(on, cfg.closed_months as number) < today; };
  const kept: { lead_id: string; why: string }[] = [];
  const goneLeads = new Set<string>();
  const funnelDeleted: string[] = [];
  d.db.tx(() => {
    for (const r of due) {
      d.db.run(
        'INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
          'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)',
        [`DEL-ENQ-${d.newId()}`, 'WEBSITE_ENQUIRY', r.id, 'A closed website enquiry', ENQUIRY_RETENTION_RULE, r.due_on,
          textOrNull(cfg.approved_by) ?? '', textOrNull(cfg.review_ref) ?? '', actor?.id ?? 'the enquiry clean-up job', at, '["database"]',
          cycle === null || cycle > 0 ? 1 : 0, cycle,
          cycle === null || cycle === 0 ? null : new Date(new Date(at).getTime() + cycle * 86_400_000).toISOString()]);
      d.db.run('DELETE FROM website_enquiries WHERE id = ?', [r.id]);
    }
    for (const id of [...lostOn.keys()].filter(isDue).sort()) {
      if (goneLeads.has(id)) continue;
      const plan = leadDeletionPlan(d.db, id, isDue);
      if (!plan.delete) { kept.push({ lead_id: id, why: plan.why }); continue; }
      // The entries first: migration 093's triggers admit a delete only for what they name.
      for (const l of plan.lead_ids) logEntry('FUNNEL_LEAD', l, 'A lost website enquiry (the four-stage funnel)', addMonths(lostOn.get(l) ?? today, cfg.closed_months as number));
      for (const b of plan.business_ids) logEntry('FUNNEL_BUSINESS', b, 'The organisation a lost website enquiry made', null);
      // Every row at once, the funnel's own only; the foreign keys are checked when the transaction ends.
      d.db.run('PRAGMA defer_foreign_keys = ON');
      for (const r of [...plan.rows].reverse()) d.db.run(FUNNEL_DELETE_SQL[r.table] as string, [r.rowid]);
      for (const l of plan.lead_ids) { goneLeads.add(l); funnelDeleted.push(l); }
    }
  });
  if (due.length > 0 || funnelDeleted.length > 0) {
    d.audit.append({ at, kind: 'RETENTION_LIST_READ', outcome: 'ALLOWED', actor_id: actor?.id ?? null, actor_role: actor?.role ?? null,
      object_type: 'website_enquiry', object_id: 'ENQ-RETENTION', detail: { deleted: due.map((r) => r.id), funnel_leads_deleted: funnelDeleted } });
  }
  return { state: 'DONE', deleted: due.length, funnel_leads_deleted: funnelDeleted.length, funnel_leads_kept: kept,
    funnel_leads_due_not_deleted: kept.length };
}
