/**
 * THE AUDIT LOG, READ BY THE SUPER USER — the CRM follow-on, 12 September 2026.
 *
 * Developer Spec section 1 said Admin reads the audit log. `audit.read` was registered for ADMIN and nothing asked it, and
 * `AuditLog.verify()` was called by the tests alone. This is the page that asks it, and `npm run verify-audit`
 * (src/cli.ts) is the command that verifies the chain without the server.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * KINDS, IDS AND OUTCOMES — NEVER A VALUE
 *
 * The statement below does not select `detail`. What a line says happened is its kind; who did it is a role and an id;
 * what it was about is an object type and an id; and whether it was allowed is its outcome. The detail is screened on the
 * way in and carries no personal data — but it can carry codes and counts that mean something only beside the row they
 * name, and a page that printed it would be the first screen in the application to show a log line's contents to a person.
 * It is not read at all.
 *
 * THE CHAIN IS VERIFIED ON EVERY READ, and the page says whether it is intact — recomputed from the rows, the way the
 * command does it, not taken from the object that wrote them.
 *
 * READING IT IS ITSELF A LINE: AUDIT_LOG_READ, naming the filter keys and the row count.
 *
 * FILTERS ARE KEYS IN A FIXED TABLE, NEVER SQL. A kind is one of the kinds present in the log; an outcome is one of the
 * three; anything else is dropped and said.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { localStamp } from './localtime.ts';

export type AuditLogDeps = { db: Db; audit: AuditLog; now: () => string };

export const AUDIT_OUTCOMES: Readonly<Record<string, string>> = Object.freeze({
  ALLOWED: 'Allowed', REFUSED: 'Refused', ERROR: 'Error',
});

export const AUDIT_PAGE_SIZE = 200;

export type AuditLine = {
  readonly seq: number; readonly at: string; readonly kind: string; readonly actor_role: string | null; readonly actor_id: string | null;
  readonly object_type: string | null; readonly object_id: string | null; readonly outcome: string;
};

export type AuditLogView = {
  readonly chain: { readonly intact: boolean; readonly broken_at: number | null; readonly entries: number; readonly says: string };
  readonly lines: readonly AuditLine[];
  readonly kinds: readonly string[];
  readonly applied: { readonly kind: string | null; readonly outcome: string | null };
  readonly said: readonly string[];
  readonly never: string;
  readonly command: string;
};

export function auditLogView(d: AuditLogDeps, actor: Actor, q: URLSearchParams): AuditLogView {
  authorise(actor, 'audit.read', { type: 'audit', id: 'audit_log' });
  const said: string[] = [];
  const kinds = d.db.all<{ kind: string }>('SELECT DISTINCT kind FROM audit_log ORDER BY kind ASC').map((r) => r.kind);
  const askedKind = (q.get('kind') ?? '').trim();
  const kind = askedKind === '' ? null : kinds.includes(askedKind) ? askedKind : null;
  if (askedKind !== '' && kind === null) said.push('Kind: not a kind this log holds, so it was not applied');
  const askedOutcome = (q.get('outcome') ?? '').trim();
  const outcome = askedOutcome === '' ? null : Object.hasOwn(AUDIT_OUTCOMES, askedOutcome) ? askedOutcome : null;
  if (askedOutcome !== '' && outcome === null) said.push('Outcome: not allowed, refused or error, so it was not applied');
  for (const k of new Set(q.keys())) if (k !== 'kind' && k !== 'outcome') said.push(`${k.slice(0, 40)}: not a filter this page offers, so it was not applied`);

  const entries = d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')?.n ?? 0;
  const v = d.audit.verify();
  const lines = d.db.all<{
    seq: number; at: string; kind: string; actor_role: string | null; actor_id: string | null; object_type: string | null; object_id: string | null; outcome: string;
  }>(
    'SELECT seq, at, kind, actor_role, actor_id, object_type, object_id, outcome FROM audit_log ' +
      'WHERE (? IS NULL OR kind = ?) AND (? IS NULL OR outcome = ?) ORDER BY seq DESC LIMIT ?',
    [kind, kind, outcome, outcome, AUDIT_PAGE_SIZE],
  ).map((r) => ({ ...r, at: localStamp(r.at) }));

  d.audit.append({
    at: d.now(), kind: 'AUDIT_LOG_READ', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'audit', object_id: 'audit_log',
    detail: { filters: [...(kind === null ? [] : ['kind']), ...(outcome === null ? [] : ['outcome'])], rows: lines.length, intact: v.intact },
  });

  return {
    chain: {
      intact: v.intact, broken_at: v.broken_at, entries,
      says: v.intact
        ? `Intact: all ${entries.toLocaleString('en-GB')} entries recomputed from the genesis, each linked to the one before it.`
        : `BROKEN at entry ${v.broken_at ?? '?'}: that entry’s hash, or its link to the one before it, does not recompute. Something outside the application has changed the log.`,
    },
    lines, kinds, applied: { kind, outcome }, said,
    never: 'What a line says in detail is never shown here, and is not read to draw this page: a kind, the ids and the outcome are the record.',
    command: 'npm run verify-audit',
  };
}

/**
 * PHASE 133a — THE GATE OF THE AUDIT LOG, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function auditLogGate(actor: Actor): void {
  authorise(actor, 'audit.read', { type: 'audit', id: 'audit_log' });
}
