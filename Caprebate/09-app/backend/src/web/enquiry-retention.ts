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
 *   2. THE FOUR-STAGE FUNNEL (`leads` with an `enquiry_id`, migration 061). A funnel enquiry is a CRM lead, tied to its
 *      organisation, its contacts and any booking, so deleting one is a lead's deletion, which has no path yet. This job
 *      only COUNTS the funnel leads lost more than twelve months ago, and says so; it deletes none of them. The deletion
 *      path is a later phase's (the sweep, Phase 157).
 * A LIVE LEGAL HOLD STOPS IT (record kind WEBSITE_ENQUIRY, by its id). N4: an enquiry with no closing day is never due.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { liveHeldIds } from './compliance.ts';
import { addMonths } from './message-retention.ts';
import { BACKUP_CYCLE, knownBackupCycleDays } from './upload-handler-port.ts';

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

/** The funnel leads lost more than the period ago: counted, never deleted here. */
export function funnelLeadsDue(db: Db, cfg: EnquiryRetention, nowIso: string): number {
  if (cfg.closed_months === null) return 0;
  const today = nowIso.slice(0, 10);
  return db.all<{ updated_at: string }>("SELECT updated_at FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'")
    .filter((r) => addMonths(r.updated_at.slice(0, 10), cfg.closed_months as number) < today).length;
}

export type EnquirySweep =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'DONE'; readonly deleted: number; readonly funnel_leads_due_not_deleted: number };

export function sweepEnquiries(
  d: { db: Db; audit: AuditLog; now: () => string; newId: () => string }, cfg: EnquiryRetention = ENQUIRY_RETENTION,
  actor: { id: string; role: string } | null = null,
): EnquirySweep {
  const missing = enquiryRetentionMissing(cfg);
  if (missing.length > 0) return { state: 'OFF', missing };
  const at = d.now();
  const due = enquiriesDue(d.db, cfg, at);
  const cycle = knownBackupCycleDays(BACKUP_CYCLE);
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
  });
  if (due.length > 0) {
    d.audit.append({ at, kind: 'RETENTION_LIST_READ', outcome: 'ALLOWED', actor_id: actor?.id ?? null, actor_role: actor?.role ?? null,
      object_type: 'website_enquiry', object_id: 'ENQ-RETENTION', detail: { deleted: due.map((r) => r.id) } });
  }
  return { state: 'DONE', deleted: due.length, funnel_leads_due_not_deleted: funnelLeadsDue(d.db, cfg, at) };
}
