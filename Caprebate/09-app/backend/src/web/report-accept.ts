/**
 * THE CLIENT ACCEPTS THE SURVEY REPORT — Phase 158c, 7 October 2026.
 *
 * The Friary House run (04-phase-work/sim-2026-10-06, finding F39): the portal said "We issued your client report" and
 * gave the client nothing to open or accept, and the Reports gate passed on "The client accepted the report", a tick a
 * member of staff made for them. Now the client reads the version released to them (report-signoff.ts
 * `releasedVersion`: approved by the surveyor, its figure signed off by a tax adviser) at /portal/report, and accepts it
 * there: who, when, and that version's fingerprint, kept for ever (migration 101). The gate reads an acceptance of the
 * ISSUED client report's own fingerprint (src/web/pipeline.ts `clientAcceptedNeed`), so a later version must be
 * accepted again.
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { releasedVersion } from './report-signoff.ts';

export type AcceptDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export const ACCEPT_WORDS = {
  none: 'Your survey report is not ready yet. It appears here once your surveyor has approved it and a tax adviser has signed off its figures.',
  again: 'You have already accepted this version of the report.',
  button: 'I accept this report',
} as const;

/** This login's acceptance of the version now released to the business, or null. */
export function myAcceptance(db: Db, actor: Actor, business_id: string): { accepted_at: string } | null {
  const r = releasedVersion(db, business_id);
  if (r === null) return null;
  return db.get<{ accepted_at: string }>(
    'SELECT accepted_at FROM client_report_acceptances WHERE approval_id = ? AND user_id = ?', [r.row.id, actor.id]) ?? null;
}

/** Accept the version released to the business, as a client login of it. */
export function acceptReport(d: AcceptDeps, actor: Actor, business_id: string): { ok: true; id: string } | { ok: false; why: string } {
  authorise(actor, 'client_report.accept', { type: 'engagement', id: business_id, business_id });
  const r = releasedVersion(d.db, business_id);
  if (r === null) return { ok: false, why: ACCEPT_WORDS.none };
  if (myAcceptance(d.db, actor, business_id) !== null) return { ok: false, why: ACCEPT_WORDS.again };
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO client_report_acceptances (id, claim_id, approval_id, fingerprint, user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, r.row.claim_id, r.row.id, r.row.fingerprint, actor.id, at]);
    d.audit.append({
      at, kind: 'CLIENT_REPORT_ACCEPTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: r.row.claim_id, detail: { approval: r.row.id, version: r.row.version },
    });
  });
  return { ok: true, id };
}
