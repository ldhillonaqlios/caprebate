/**
 * THE CLIENT'S OWN FILING CONFIRMATION, WHERE THERE IS NO ACCOUNTANT.
 *                                                  Phase 132e, 16 September 2026
 *
 * Lakhbir, answering "Where a client has no accountant or tax adviser, who
 * confirms the claim fits their return ...?": "The client".
 *
 * THE REPORTS GATE (src/web/pipeline.ts) asks `filingRoute` which of two routes a
 * claim is on, and then asks that route's need:
 *
 *   ACCOUNTANT — as it always was: the accountant's confirmation milestone. Taken
 *     whenever the organisation has a contact typed ACCOUNTANT or ADVISER, and
 *     whenever the client has not confirmed, as a recorded YES, that they have
 *     none. "Not sure" and absent choose this route identically (N4): an unknown
 *     never relieves the gate.
 *   CLIENT — only where the client has confirmed in writing that they have no
 *     accountant or tax adviser AND no such contact is on the organisation. The
 *     gate then needs the client's own written confirmation of the three things
 *     below, every one a recorded YES, with the last day to amend they confirmed
 *     equal to the amendment window's deadline as the application reads it now.
 *     Any of the three NO, UNSURE or absent, or the dates differing, or the window
 *     not known: shut.
 *
 * NEVER AN ACCOUNTANT'S. The record is its own table (migration 027) whose party
 * can only be CLIENT, and nothing here writes or reads the accountant's
 * milestone. The operating procedures' stages 8 and 9 are edited by another
 * workstream; this is the application's half.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { localStamp } from './localtime.ts';

export type Answer = 'YES' | 'NO' | 'UNSURE';
const ANSWERS: readonly string[] = ['YES', 'NO', 'UNSURE'];

/**
 * THE WORDS THE CLIENT CONFIRMS. The last-day sentence is marked: it is AWAITING
 * THE TAX ADVISER'S WORDING, and the draft below is ours, not theirs.
 */
export const CLIENT_FILING_WORDS = Object.freeze({
  no_accountant_or_adviser: { text: 'I have no accountant or tax adviser acting for me on this return.', awaiting: null },
  will_file_amendment: { text: 'I will file the amendment to my tax return myself.', awaiting: null },
  last_day_acknowledged: {
    text: 'Cap Rebate has told me that the last day to amend my return for this claim is {date}.',
    awaiting: 'the tax adviser’s wording — this sentence is a draft and is not to be sent to a client until they have given it',
  },
  remains_responsible: { text: 'I remain responsible for the filing position I take on my return.', awaiting: null },
});

export type ClientFilingRow = {
  id: string; claim_id: string; business_id: string; confirmed_by_party: 'CLIENT';
  no_accountant_or_adviser: string | null; will_file_amendment: string | null;
  last_day_acknowledged: string | null; last_day_stated: string | null; remains_responsible: string | null;
  written_evidence: string; recorded_by: string; recorded_at: string;
};

export type Need = { readonly what: string; readonly met: boolean; readonly why: string };

/** The latest confirmation recorded for this claim at or after `since` — the instant the claim last entered REPORTS. */
export function latestConfirmation(db: Db, claim_id: string, since: string): ClientFilingRow | undefined {
  return db.get<ClientFilingRow>(
    'SELECT * FROM client_filing_confirmations WHERE claim_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1',
    [claim_id, since]);
}

/** Whether the organisation has an accountant or adviser on record as a contact. */
export function adviserOnRecord(db: Db, business_id: string): boolean {
  return db.get<{ id: string }>(
    "SELECT id FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT','ADVISER') LIMIT 1", [business_id]) !== undefined;
}

export type FilingRoute = { readonly route: 'ACCOUNTANT' | 'CLIENT'; readonly why: string };

export function filingRoute(db: Db, c: { id: string; business_id: string }, since: string): FilingRoute {
  if (adviserOnRecord(db, c.business_id)) {
    return { route: 'ACCOUNTANT', why: 'the organisation has an accountant or adviser on record, so the accountant confirms' };
  }
  const k = latestConfirmation(db, c.id, since);
  if (k?.no_accountant_or_adviser === 'YES') {
    return { route: 'CLIENT', why: 'the client has confirmed in writing that they have no accountant or tax adviser' };
  }
  return {
    route: 'ACCOUNTANT',
    why: 'the client has not confirmed, as a yes, that they have no accountant or tax adviser — so the accountant confirms',
  };
}

/**
 * THE CLIENT ROUTE'S NEED. `deadline` is the amendment window's deadline as the
 * application reads it now, or null where the window is not known.
 */
export function clientConfirmationNeed(db: Db, c: { id: string }, since: string, deadline: string | null): Need {
  const what = 'The client confirmed in writing that they will file the amendment, the last day to amend as we state it, ' +
    'and that they remain responsible for the filing position — the client’s own confirmation, not an accountant’s';
  const k = latestConfirmation(db, c.id, since);
  if (k === undefined) return { what, met: false, why: 'no client filing confirmation is recorded since the claim entered this stage' };
  const missing: string[] = [];
  if (k.will_file_amendment !== 'YES') missing.push('that they will file the amendment');
  if (k.last_day_acknowledged !== 'YES' || k.last_day_stated === null) missing.push('the last day to amend');
  if (k.remains_responsible !== 'YES') missing.push('that they remain responsible for the filing position');
  if (missing.length > 0) {
    return { what, met: false, why: `not confirmed as a yes — ${missing.join('; ')} (no, not sure and not given all leave this shut)` };
  }
  if (deadline === null) {
    return { what, met: false, why: 'the amendment window is not known, so the last day the client confirmed cannot be checked against it' };
  }
  if (k.last_day_stated !== deadline) {
    return { what, met: false, why: `the client confirmed ${k.last_day_stated} as the last day to amend, but the window we state now ends ${deadline}` };
  }
  return { what, met: true, why: `confirmed by the client in writing, recorded ${localStamp(k.recorded_at)}; last day ${deadline}` };
}

export type ClientFilingDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Fields = Readonly<Record<string, string | null | undefined>>;

function answer(v: string | null | undefined): Answer | null | 'BAD' {
  if (v === null || v === undefined || v.trim() === '') return null;
  return ANSWERS.includes(v.trim()) ? v.trim() as Answer : 'BAD';
}

/**
 * RECORD WHAT THE CLIENT CONFIRMED, from their written confirmation. ADMIN and
 * SALES (`client_filing.record`). Nothing throws for an answer that is merely
 * not given: absent is stored as absent, and the gate reads it as not a yes.
 */
export function recordClientFilingConfirmation(
  d: ClientFilingDeps, actor: Actor, claim_id: string, input: Fields,
): { ok: true; id: string } | { ok: false; why: string } {
  const c = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) {
    authorise(actor, 'client_filing.record', { type: 'claim', id: claim_id, business_id: '', assigned_surveyor_ids: [] });
    return { ok: false, why: 'not found' };
  }
  authorise(actor, 'client_filing.record', { type: 'claim', id: c.id, business_id: c.business_id, assigned_surveyor_ids: [] });
  const fields = ['no_accountant_or_adviser', 'will_file_amendment', 'last_day_acknowledged', 'remains_responsible'] as const;
  const values: Record<string, Answer | null> = {};
  for (const f of fields) {
    const a = answer(input[f]);
    if (a === 'BAD') return { ok: false, why: 'Each answer is yes, no or not sure — or left blank where the client did not say.' };
    values[f] = a;
  }
  const lastDay = (input['last_day_stated'] ?? '').trim();
  if (lastDay !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(lastDay)) return { ok: false, why: 'The last day to amend is a date, as YYYY-MM-DD.' };
  const evidence = (input['written_evidence'] ?? '').trim();
  if (evidence.length < 2 || evidence.length > 1000) {
    return { ok: false, why: 'Say where the client’s written confirmation is — a signed form, or a dated email.' };
  }
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, no_accountant_or_adviser, will_file_amendment, ' +
      'last_day_acknowledged, last_day_stated, remains_responsible, written_evidence, recorded_by, recorded_at) ' +
      "VALUES (?, ?, ?, 'CLIENT', ?, ?, ?, ?, ?, ?, ?, ?)",
    [id, c.id, c.business_id, values['no_accountant_or_adviser'] ?? null, values['will_file_amendment'] ?? null,
     values['last_day_acknowledged'] ?? null, lastDay === '' ? null : lastDay, values['remains_responsible'] ?? null,
     evidence, actor.id, at]);
  d.audit.append({
    at, kind: 'CLIENT_FILING_CONFIRMED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id,
    // Which answers were a yes — never the evidence text or the date.
    detail: { business: c.business_id, yes: fields.filter((f) => values[f] === 'YES') },
  });
  return { ok: true, id };
}
