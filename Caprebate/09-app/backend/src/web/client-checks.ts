/**
 * PHASE 160j — WHAT THE CLIENT SENT, CHECKED, 20 October 2026. Lakhbir, of the claim page mock-up he approved: whatever
 * the client sends waits for staff to check it, then is accepted or asked for again with a reason.
 *
 * A client's answer in their portal (portal.ts answerTask) and a file uploaded against a request (documents.ts
 * receiveByUpload) both end as an ANSWERED client_tasks row with answered_by_role CLIENT. One that has no row in
 * client_task_checks (migration 119) is waiting. Accepting records who and when. Asking again needs a reason, and opens a
 * new question (sendTaskToPortal) or document request (createDocumentRequest) carrying it, so the client sees it in their
 * portal. Each check is kept for good (the table refuses an edit or a deletion) and written to the audit log. What staff
 * recorded themselves needs no check: they are the check.
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { claimObjFor, loadClaimRow } from './crm.ts';
import { sendTaskToPortal } from './engaged.ts';
import { createDocumentRequest } from './documents.ts';

export type CheckDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

/** How long the client has to answer a question asked again, in days. */
export const ASK_AGAIN_DAYS = 14;

export type ToCheck = {
  readonly task_id: string;
  readonly kind: 'QUESTION' | 'DOCUMENT';
  readonly question: string;
  /** What they said, "They do not know", or that the file is the answer. */
  readonly sent: string;
  readonly document_id: string | null;
  readonly logical_document_id: string | null;
  readonly by: string;
  readonly at: string;
};

/** What the client sent on this claim, or the whole company, that nobody has checked yet. Oldest first. */
export function waitingForCheck(db: Db, business_id: string, claim_id: string): ToCheck[] {
  return db.all<{
    id: string; kind: string; question: string; answer: string | null; answer_state: string; received_document_id: string | null;
    logical: string | null; who: string | null; answered_at: string;
  }>(
    'SELECT t.id, t.kind, t.question, t.answer, t.answer_state, t.received_document_id, d.logical_document_id AS logical, ' +
      'u.display_name AS who, t.answered_at FROM client_tasks t LEFT JOIN client_task_checks k ON k.task_id = t.id ' +
      'LEFT JOIN users u ON u.id = t.answered_by LEFT JOIN documents d ON d.id = t.received_document_id ' +
      "WHERE t.business_id = ? AND (t.claim_id = ? OR t.claim_id IS NULL) AND t.state = 'ANSWERED' AND t.answered_by_role = 'CLIENT' " +
      'AND k.id IS NULL ORDER BY t.answered_at ASC, t.rowid ASC',
    [business_id, claim_id],
  ).map((t) => ({
    task_id: t.id, kind: t.kind === 'DOCUMENT' ? 'DOCUMENT' : 'QUESTION', question: t.question,
    sent: t.kind === 'DOCUMENT' ? 'A file, uploaded in their portal' : t.answer_state === 'DONT_KNOW' ? 'They do not know' : (t.answer ?? ''),
    document_id: t.received_document_id, logical_document_id: t.logical, by: t.who ?? 'the client', at: t.answered_at,
  }));
}

export type CheckReading = { readonly outcome: 'ACCEPTED' | 'ASKED_AGAIN'; readonly by: string; readonly at: string; readonly reason: string | null };

/** The check on one thing the client sent, if it has one. */
export function checkOf(db: Db, task_id: string): CheckReading | null {
  const r = db.get<{ outcome: string; who: string | null; checked_at: string; reason: string | null }>(
    'SELECT k.outcome, u.display_name AS who, k.checked_at, k.reason FROM client_task_checks k LEFT JOIN users u ON u.id = k.checked_by WHERE k.task_id = ?',
    [task_id]);
  return r === undefined ? null : { outcome: r.outcome === 'ASKED_AGAIN' ? 'ASKED_AGAIN' : 'ACCEPTED', by: r.who ?? 'a former user', at: r.checked_at, reason: r.reason };
}

type Result = { ok: true } | { ok: false; why: string; field?: string };

/** The task, if it is something this claim's client sent and nobody has checked. */
function waitingTask(d: CheckDeps, actor: Actor, claim_id: string, task_id: string):
  { biz: string; task: { id: string; kind: string; question: string; why: string; holds_up: string; fact_id: string | null; requested_type: string | null; event_id: string | null } } | { why: string } {
  const row = loadClaimRow(d.db, claim_id);
  authorise(actor, 'claim.write', claimObjFor(d.db, row));
  const t = d.db.get<{ id: string; kind: string; question: string; why: string; holds_up: string; fact_id: string | null; requested_type: string | null; event_id: string | null; state: string; role: string | null; claim_id: string | null; business_id: string }>(
    'SELECT id, kind, question, why, holds_up, fact_id, requested_type, event_id, state, answered_by_role AS role, claim_id, business_id FROM client_tasks WHERE id = ?', [task_id]);
  if (t === undefined || t.business_id !== row.business_id || (t.claim_id !== null && t.claim_id !== claim_id)) return { why: 'That is not something this client sent on this claim.' };
  if (t.state !== 'ANSWERED' || t.role !== 'CLIENT') return { why: 'Only what the client sent is checked here.' };
  if (d.db.get<{ id: string }>('SELECT id FROM client_task_checks WHERE task_id = ?', [task_id]) !== undefined) return { why: 'Someone has already checked this.' };
  return { biz: row.business_id, task: t };
}

/** Accept what the client sent: who and when, kept for good, and in the audit log. */
export function acceptSent(d: CheckDeps, actor: Actor, claim_id: string, task_id: string): Result {
  const w = waitingTask(d, actor, claim_id, task_id);
  if ('why' in w) return { ok: false, why: w.why };
  const at = d.now();
  d.db.tx(() => {
    d.db.run("INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, 'ACCEPTED', NULL, NULL, ?, ?)",
      [d.newId(), task_id, actor.id, at]);
    d.audit.append({ at, kind: 'CLIENT_SENT_ACCEPTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'client_task', object_id: task_id, detail: { business: w.biz, claim: claim_id } });
  });
  return { ok: true };
}

/** Ask again, with the reason: a new question or document request in the client's portal, the check kept, audited. */
export function askAgain(d: CheckDeps, actor: Actor, claim_id: string, task_id: string, reasonIn: string | null): Result {
  const reason = (reasonIn ?? '').trim();
  if (reason.length === 0) return { ok: false, why: 'Say what is wrong, so the client knows what to send.', field: 'reason' };
  if (reason.length > 1000) return { ok: false, why: 'Keep the reason under 1,000 characters.', field: 'reason' };
  const w = waitingTask(d, actor, claim_id, task_id);
  if ('why' in w) return { ok: false, why: w.why };
  const t = w.task;
  const due = new Date(Date.parse(d.now()) + ASK_AGAIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const at = d.now();
  let refused: string | null = null;
  d.db.tx(() => {
    const again = t.kind === 'DOCUMENT'
      ? createDocumentRequest(d, actor, { business_id: w.biz, claim_id, event_id: t.event_id, type_code: t.requested_type, why: reason, holds_up: t.holds_up, due_on: due })
      : sendTaskToPortal(d, actor, w.biz, { fact_id: t.fact_id, question: t.question, why: reason, holds_up: t.holds_up, due_on: due, claim_id });
    if (!again.ok) { refused = again.why; return; }
    const againId = 'id' in again ? again.id : again.task_id;
    d.db.run("INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, 'ASKED_AGAIN', ?, ?, ?, ?)",
      [d.newId(), task_id, reason, againId, actor.id, at]);
    d.audit.append({ at, kind: 'CLIENT_SENT_ASKED_AGAIN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'client_task', object_id: task_id, detail: { business: w.biz, claim: claim_id, again: againId } });
  });
  return refused === null ? { ok: true } : { ok: false, why: refused };
}
