/**
 * MESSAGE_RETENTION — THE CLEAN-UP JOB FOR BOTH CHAT THREADS. BUILT, AND SWITCHED OFF. Phase 142a, 22 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * Every client has a Chat with two threads (Phase 142): "With the client" (`client_messages`) and "Team only"
 * (`internal_notes`). Both are free text, so both hold personal data, and no rule in the retention schedule names either.
 * How long each is kept is the data protection officer's decision, put in CAPREBATE QUESTIONS under exactly this title:
 *   "How long do we keep client messages and the team chat?"
 * A message deleted early cannot be brought back, so nothing deletes one until that is answered.
 *
 * OFF IS EXACTLY TODAY. With the shipped setting below, `messagesDue` returns nothing and `sweepMessages` deletes
 * nothing, writes nothing and returns OFF with what is missing, in plain words.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON — THE QUESTION'S RECOMMENDATION, AS TWO NUMBERS
 *
 *   A COMPANY WITH A CLAIM. Both threads follow the claim file. Each claim's file clock starts on the LATER of its
 *     accounting period end and the client report's first issue — RET-7's trigger, read by `claimFileDays`, the same
 *     reader the document clock uses. The company's messages go `with_claim_years` after the LATEST of those, so no
 *     message outlives, or dies before, the file it belongs to. IF ANY CLAIM'S DATE IS NOT KNOWN, NOTHING ON THAT COMPANY
 *     IS DUE: not known is never a pass (N4). A message written after that date is kept `without_claim_months` from its
 *     own day, and is not due at all while that period is not set.
 *   A COMPANY WITH NO CLAIM. Everything on it goes `without_claim_months` after its LAST message, on either thread —
 *     the same as an enquiry that never became a client.
 *   AN EMAILED REPLY NOBODY FILED (037's queue) has no company, and goes `without_claim_months` after it arrived.
 *
 * A LIVE LEGAL HOLD STOPS IT. A hold on the company (record kind COMPANY) keeps every message on it; a hold on one message
 * (CLIENT_MESSAGE, TEAM_MESSAGE or INBOUND_EMAIL, by its id) keeps that one.
 *
 * FOUR THINGS MUST ALL BE TRUE, OR IT IS OFF — each fails closed:
 *   1. `enabled` is true;
 *   2. at least one period is set, in whole years or whole months — a period left null is that rule off;
 *   3. `approved_by` names who approved the periods, and 4. `review_ref` where — both go into every deletion log entry.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE ONLY PATH THAT CAN DELETE A MESSAGE
 *
 * Migration 038 lets a message (and the rows hanging off it) be deleted ONLY where the deletion log already holds an entry
 * for that very record under the rule MSG-RETENTION. This job writes that entry first, then deletes, in one transaction —
 * one entry per record, naming its kind and id, never a word of it, never a person. Nothing else in src/ deletes from
 * either thread; test/phase142a.test.ts greps for it.
 *
 * A FILE SENT WITH A MESSAGE IS NOT DELETED HERE. It is a document, it keeps its own document rules, and it stays in the
 * company's Files — only the row saying which message brought it goes, with the message.
 *
 * AUDITED WITH IDS AND COUNTS, NEVER THE WORDS: one MESSAGES_DELETED entry per run, naming every id it removed.
 *
 * Run by `node src/cli.ts sweep-messages`. A scheduled run of that one line is all the hosting needs to add.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { claimFileDays } from './documents.ts';
import { liveHeldIds } from './compliance.ts';
import { BACKUP_CYCLE, RET7, knownBackupCycleDays } from './upload-handler-port.ts';

export type MessageRetention = {
  readonly enabled: boolean;
  /** Years after the claim file's clock starts, on a company with a claim. Null: that rule is off. */
  readonly with_claim_years: number | null;
  /** Months after the last message, on a company with no claim (and after a newer message's own day). Null: that rule is off. */
  readonly without_claim_months: number | null;
  /** Who approved the periods — the data protection officer. Written into every deletion log entry. */
  readonly approved_by: string | null;
  /** Where that approval is recorded. Written into every deletion log entry. */
  readonly review_ref: string | null;
  readonly question: string;
};

/** The title of the question for the data protection officer in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const MESSAGE_RETENTION_QUESTION = 'How long do we keep client messages and the team chat?';

export const MESSAGE_RETENTION: MessageRetention = Object.freeze({
  enabled: false,
  with_claim_years: null,
  without_claim_months: null,
  approved_by: null,
  review_ref: null,
  question: MESSAGE_RETENTION_QUESTION,
});

/** What the question recommends: the claim file's own period, and twelve months. Stated, never switched on here. */
export const MESSAGE_RETENTION_RECOMMENDED = Object.freeze({ with_claim_years: RET7.period_years, without_claim_months: 12 });

/** The rule every deletion log entry this job writes carries — and the only one migration 038 admits. */
export const MSG_RETENTION_RULE = 'MSG-RETENTION';

const wholeOrNull = (n: number | null): number | null => (n !== null && Number.isInteger(n) && n >= 1 ? n : null);
const textOrNull = (s: string | null): string | null => (s !== null && s.trim().length >= 2 ? s.trim() : null);

/** What is still missing before messages are cleaned up — each in plain words. Empty means it is on. */
export function retentionMissing(cfg: MessageRetention): string[] {
  const out: string[] = [];
  if (wholeOrNull(cfg.with_claim_years) === null && wholeOrNull(cfg.without_claim_months) === null) {
    out.push('Set how long messages are kept. The data protection officer decides.');
  }
  if (textOrNull(cfg.approved_by) === null || textOrNull(cfg.review_ref) === null) out.push('Record who approved it, and where.');
  if (cfg.enabled !== true) out.push('Then switch the clean-up on.');
  return out;
}

export type DueRecord = {
  readonly kind: 'CLIENT_MESSAGE' | 'TEAM_MESSAGE' | 'INBOUND_EMAIL';
  readonly id: string;
  readonly business_id: string | null;
  readonly rule: 'WITH_CLAIM' | 'WITHOUT_CLAIM' | 'UNFILED_EMAIL';
  /** The day its period ran out, YYYY-MM-DD. It is due the day after. */
  readonly due_on: string;
};

/** A day plus whole months, in the calendar: 31 January plus one month is 28 (or 29) February. */
export function addMonths(day: string, months: number): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1 + months;
  const d = Number(day.slice(8, 10));
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

type Msg = { id: string; created_at: string; kind: 'CLIENT_MESSAGE' | 'TEAM_MESSAGE' };

function messagesOf(db: Db, business_id: string): Msg[] {
  const c = db.all<{ id: string; created_at: string }>('SELECT id, created_at FROM client_messages WHERE business_id = ?', [business_id])
    .map((r): Msg => ({ ...r, kind: 'CLIENT_MESSAGE' }));
  const t = db.all<{ id: string; created_at: string }>('SELECT id, created_at FROM internal_notes WHERE business_id = ?', [business_id])
    .map((r): Msg => ({ ...r, kind: 'TEAM_MESSAGE' }));
  return [...c, ...t];
}

/**
 * WHEN A COMPANY'S CLAIM FILES CLOSE, or null where that is not known. The latest claim governs; a claim whose clock
 * has not started — its period end or its report not known — makes the whole company not known.
 */
function claimFilesStart(db: Db, business_id: string): { has_claims: boolean; start: string | null } {
  const claims = db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [business_id]);
  if (claims.length === 0) return { has_claims: false, start: null };
  let latest = '';
  for (const c of claims) {
    const f = claimFileDays(db, c.id);
    if (f.period_end === null || f.report_first === null) return { has_claims: true, start: null };
    const later = f.period_end > f.report_first ? f.period_end : f.report_first;
    if (later > latest) latest = later;
  }
  return { has_claims: true, start: latest };
}

/**
 * EVERY RECORD PAST ITS PERIOD TODAY, as the setting reads — and nothing at all while it is off. Pure reading: nothing
 * here writes. `nowIso` is passed, never read from the clock, so a test can stand on any day.
 */
export function messagesDue(db: Db, cfg: MessageRetention, nowIso: string): DueRecord[] {
  if (retentionMissing(cfg).length > 0) return [];
  const years = wholeOrNull(cfg.with_claim_years);
  const months = wholeOrNull(cfg.without_claim_months);
  const today = nowIso.slice(0, 10);
  const heldCompanies = liveHeldIds(db, 'COMPANY');
  const held = {
    CLIENT_MESSAGE: liveHeldIds(db, 'CLIENT_MESSAGE'), TEAM_MESSAGE: liveHeldIds(db, 'TEAM_MESSAGE'), INBOUND_EMAIL: liveHeldIds(db, 'INBOUND_EMAIL'),
  };
  const out: DueRecord[] = [];
  const companies = db.all<{ business_id: string }>(
    'SELECT business_id FROM client_messages UNION SELECT business_id FROM internal_notes ORDER BY business_id');
  for (const { business_id } of companies) {
    if (heldCompanies.has(business_id)) continue;
    const msgs = messagesOf(db, business_id);
    const files = claimFilesStart(db, business_id);
    if (files.has_claims) {
      if (years === null || files.start === null) continue;
      const closes = addMonths(files.start, years * 12);
      for (const m of msgs) {
        const day = m.created_at.slice(0, 10);
        const due_on = day <= closes ? closes : months === null ? null : addMonths(day, months);
        if (due_on !== null && due_on < today && !held[m.kind].has(m.id)) {
          out.push({ kind: m.kind, id: m.id, business_id, rule: 'WITH_CLAIM', due_on });
        }
      }
    } else {
      if (months === null || msgs.length === 0) continue;
      const last = msgs.reduce((a, m) => (m.created_at > a ? m.created_at : a), '').slice(0, 10);
      const due_on = addMonths(last, months);
      if (due_on >= today) continue;
      for (const m of msgs) if (!held[m.kind].has(m.id)) out.push({ kind: m.kind, id: m.id, business_id, rule: 'WITHOUT_CLAIM', due_on });
    }
  }
  if (months !== null) {
    for (const e of db.all<{ id: string; received_at: string }>(
      "SELECT id, received_at FROM inbound_email WHERE outcome = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = inbound_email.id)")) {
      const due_on = addMonths(e.received_at.slice(0, 10), months);
      if (due_on < today && !held.INBOUND_EMAIL.has(e.id)) out.push({ kind: 'INBOUND_EMAIL', id: e.id, business_id: null, rule: 'UNFILED_EMAIL', due_on });
    }
  }
  return out;
}

export type SweepResult =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'RAN'; readonly client_messages: number; readonly team_messages: number; readonly emails: number };

export type RetentionDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

const CATEGORY: Readonly<Record<DueRecord['kind'], string>> = Object.freeze({
  CLIENT_MESSAGE: 'a message on the thread with the client',
  TEAM_MESSAGE: 'a message on the team-only thread',
  INBOUND_EMAIL: 'an emailed reply to contactus@',
});

/**
 * DELETE EVERY MESSAGE PAST ITS PERIOD. Off, it returns at once and touches nothing. On, for each record: the deletion
 * log entry first, then the rows — all in one transaction, so a deletion that fails leaves no entry claiming it happened.
 */
export function sweepMessages(d: RetentionDeps, cfg: MessageRetention = MESSAGE_RETENTION, actor: { id: string; role: string } | null = null): SweepResult {
  const missing = retentionMissing(cfg);
  if (missing.length > 0) return { state: 'OFF', missing };
  const at = d.now();
  const due = messagesDue(d.db, cfg, at);
  const cycle = knownBackupCycleDays(BACKUP_CYCLE);
  const approved_by = textOrNull(cfg.approved_by) ?? '';
  const review_ref = textOrNull(cfg.review_ref) ?? '';
  const executed_by = actor?.id ?? 'the message clean-up job';
  const removed = { CLIENT_MESSAGE: [] as string[], TEAM_MESSAGE: [] as string[], INBOUND_EMAIL: [] as string[] };

  const logEntry = (kind: DueRecord['kind'], id: string, due_on: string): void => {
    d.db.run(
      'INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
        'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)',
      [`DEL-MSG-${d.newId()}`, kind, id, CATEGORY[kind], MSG_RETENTION_RULE, due_on, approved_by, review_ref, executed_by, at, '["database"]',
        // A backup cycle nobody stated is pending, with no expiry: not known never reads as "no copies" (migration 022).
        cycle === null || cycle > 0 ? 1 : 0, cycle,
        cycle === null || cycle === 0 ? null : new Date(new Date(at).getTime() + cycle * 86_400_000).toISOString()]);
  };
  const deleteEmail = (id: string, due_on: string): void => {
    logEntry('INBOUND_EMAIL', id, due_on);
    d.db.run('DELETE FROM inbound_email_file_saves WHERE inbound_email_file_id IN (SELECT id FROM inbound_email_files WHERE inbound_email_id = ?)', [id]);
    d.db.run('DELETE FROM inbound_email_files WHERE inbound_email_id = ?', [id]);
    d.db.run('DELETE FROM inbound_email_filings WHERE inbound_email_id = ?', [id]);
    d.db.run('DELETE FROM inbound_email WHERE id = ?', [id]);
    removed.INBOUND_EMAIL.push(id);
  };

  d.db.tx(() => {
    for (const r of due) {
      if (r.kind === 'INBOUND_EMAIL') { deleteEmail(r.id, r.due_on); continue; }
      if (r.kind === 'TEAM_MESSAGE') {
        logEntry('TEAM_MESSAGE', r.id, r.due_on);
        d.db.run('DELETE FROM internal_notes WHERE id = ?', [r.id]);
        removed.TEAM_MESSAGE.push(r.id);
        continue;
      }
      logEntry('CLIENT_MESSAGE', r.id, r.due_on);
      // An emailed reply holds the same words as the message it became, so it goes with it.
      for (const e of d.db.all<{ id: string }>(
        'SELECT id FROM inbound_email WHERE client_message_id = ? UNION SELECT inbound_email_id AS id FROM inbound_email_filings WHERE client_message_id = ?',
        [r.id, r.id])) deleteEmail(e.id, r.due_on);
      // The file stays a document in the company's Files. Only the row saying which message brought it goes.
      d.db.run('DELETE FROM client_message_files WHERE message_id = ?', [r.id]);
      d.db.run('DELETE FROM client_messages WHERE id = ?', [r.id]);
      removed.CLIENT_MESSAGE.push(r.id);
    }
  });

  d.audit.append({
    at, kind: 'MESSAGES_DELETED', outcome: 'ALLOWED', actor_id: actor?.id ?? null, actor_role: actor?.role ?? null,
    object_type: 'message_retention', object_id: at,
    detail: {
      rule: MSG_RETENTION_RULE, review: review_ref,
      counts: { client_messages: removed.CLIENT_MESSAGE.length, team_messages: removed.TEAM_MESSAGE.length, replies: removed.INBOUND_EMAIL.length },
      client_messages: removed.CLIENT_MESSAGE, team_messages: removed.TEAM_MESSAGE, replies: removed.INBOUND_EMAIL,
      companies: [...new Set(due.map((r) => r.business_id).filter((x): x is string => x !== null))],
    },
  });
  return { state: 'RAN', client_messages: removed.CLIENT_MESSAGE.length, team_messages: removed.TEAM_MESSAGE.length, emails: removed.INBOUND_EMAIL.length };
}
