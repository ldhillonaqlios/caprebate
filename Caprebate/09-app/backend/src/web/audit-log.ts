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
  /** PHASE 160i: who, by name, and what happened in plain words. */
  readonly who: string | null; readonly what: string;
};

export type AuditLogView = {
  readonly chain: { readonly intact: boolean; readonly broken_at: number | null; readonly entries: number; readonly says: string };
  readonly lines: readonly AuditLine[];
  readonly kinds: readonly string[];
  readonly applied: { readonly kind: string | null; readonly outcome: string | null; readonly client: { readonly id: string; readonly name: string } | null };
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
  if (askedKind !== '' && kind === null) said.push('Kind: not a kind in this log, so it was not used');
  const askedOutcome = (q.get('outcome') ?? '').trim();
  const outcome = askedOutcome === '' ? null : Object.hasOwn(AUDIT_OUTCOMES, askedOutcome) ? askedOutcome : null;
  if (askedOutcome !== '' && outcome === null) said.push('Outcome: not allowed, refused or error, so it was not used');
  // PHASE 160i: one client's entries, from the claim page's "Open the audit log for this client".
  const askedClient = (q.get('client') ?? '').trim();
  const clientRow = askedClient === '' ? undefined : d.db.get<{ id: string; name: string }>('SELECT id, name FROM businesses WHERE id = ?', [askedClient]);
  const client = clientRow === undefined ? null : { id: clientRow.id, name: clientRow.name };
  if (askedClient !== '' && client === null) said.push('Client: not a client in this system, so it was not used');
  for (const k of new Set(q.keys())) if (k !== 'kind' && k !== 'outcome' && k !== 'client') said.push(`${k.slice(0, 40)}: not a filter on this page, so it was not used`);

  const entries = d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM audit_log')?.n ?? 0;
  const v = d.audit.verify();
  const lines = d.db.all<{
    seq: number; at: string; kind: string; actor_role: string | null; actor_id: string | null; object_type: string | null; object_id: string | null; outcome: string;
    who: string | null;
  }>(
    client === null
      ? 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
        'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) ORDER BY a.seq DESC LIMIT ?'
      : 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
        'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) AND ' +
        '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
        'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
        "OR json_extract(a.detail, '$.business') = ? " +
        "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) " +
        'ORDER BY a.seq DESC LIMIT ?',
    [kind, kind, outcome, outcome, ...(client === null ? [] : clientAuditParams(client.id)), AUDIT_PAGE_SIZE],
  ).map((r) => ({ ...r, at: localStamp(r.at), what: kindWords(r.kind) }));

  d.audit.append({
    at: d.now(), kind: 'AUDIT_LOG_READ', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'audit', object_id: 'audit_log',
    detail: { filters: [...(kind === null ? [] : ['kind']), ...(outcome === null ? [] : ['outcome']), ...(client === null ? [] : ['client'])], rows: lines.length, intact: v.intact },
  });

  return {
    chain: {
      intact: v.intact, broken_at: v.broken_at, entries,
      says: v.intact
        ? `Audit log checked — nothing changed. All ${entries.toLocaleString('en-GB')} records were checked, each against the one before it.`
        : `Audit log problem — a record was changed or removed. Tell the Admin now. The problem starts at record ${v.broken_at ?? '?'}.`,
    },
    lines, kinds, applied: { kind, outcome, client }, said,
    never: 'The details of each line are never shown or read here. You see the kind, the ids and the outcome.',
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

/**
 * PHASE 160i — WHAT AN ENTRY'S KIND MEANS, in plain words, for the one-client view. A kind without its own words is said
 * from its name ("CLAIM_FACT_RECORDED" reads "Claim fact recorded"), never left as a code.
 */
const KIND_WORDS: Readonly<Record<string, string>> = Object.freeze({
  CLAIM_CREATED: 'Opened the claim', CLAIM_UPDATED: 'Changed the claim', CLAIM_MOVED: 'Moved the claim to another stage',
  CLAIM_FACT_RECORDED: 'Recorded a fact on the claim', ORGANISATION_UPDATED: 'Changed the client’s details',
  CONTACT_CREATED: 'Added a contact', CONTACT_UPDATED: 'Changed a contact', PROPERTY_CREATED: 'Added a property',
  PROPERTY_UPDATED: 'Changed a property', EMAIL_QUEUED: 'Sent an email', ENGAGEMENT_SIGNED: 'The engagement letter was signed',
  DOCUMENT_UPLOADED: 'Uploaded a document', DOCUMENT_REQUESTED: 'Asked the client for a document', RESEARCH_RUN: 'Ran the lookups',
  AUDIT_LOG_READ: 'Read the audit log',
});

export function kindWords(kind: string): string {
  const w = KIND_WORDS[kind];
  if (w !== undefined) return w;
  const s = kind.toLowerCase().replace(/_/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** PHASE 160i — the audit log's entries about one client: the company, its claims and properties, or naming them. */
export const clientAuditParams = (business_id: string): string[] => [business_id, business_id, business_id, business_id, business_id];

export function clientAuditCount(db: Db, business_id: string): number {
  return db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM audit_log a WHERE ' +
      '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
      'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
      "OR json_extract(a.detail, '$.business') = ? " +
      "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) ", clientAuditParams(business_id))?.n ?? 0;
}

