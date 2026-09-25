/**
 * TAKING SOMETHING BACK OUT OF THE CLAIM FILE — what two take-backs share. Phase 146j, 25 September 2026.
 *
 * Two decisions a person makes put register data into a client's file: choosing one entry from a close-match list
 * (src/web/match-review.ts, Phase 146h) and saying that a name on a client document belongs to an organisation
 * (src/web/document-reading.ts, Phase 146i). Both can now be taken back, in the shape Phase 139 uses for a fact
 * somebody ticked — a separate act that ASKS WHY and keeps the reason. Before either removes anything it has to answer
 * the same two questions, and they are answered HERE so the two cannot drift apart:
 *
 *   1 · HAS A PERSON ALREADY CHECKED AND APPROVED IT? A fact from a register record is named `reg.<record id>.<field>`
 *       on the checks panel (src/web/approvals.ts), and its state is its latest row in `fact_approvals`. Where that is
 *       APPROVED, somebody has put their name to the value, and it does not vanish from under them: the take-back is
 *       refused and says so, and the tick comes off first, by its own act, with its own reason.
 *
 *   2 · WHAT WAS WORKED OUT FROM IT WHILE IT STOOD? Most readers of a register record read it LIVE — the checks panel,
 *       the missing-facts list, the surveyor's payload, the company name on the CRM page, the register bundle derive()
 *       reads — and those change the moment the record does, which is what should happen: the questions it answered
 *       are asked again (N4). But some things were KEPT on the strength of it, and removing the record does not
 *       un-keep them. This is not the take-back's to undo silently, so it lists them, as kinds and counts, and the
 *       list is kept with the take-back and shown to the person who took it back.
 *
 * NOTHING HERE WRITES. It reads and it says. Removing is `removeRegisterRecord` and `removeRegisterField` in
 * src/stubs/registers.ts — the one door in is the one door out.
 */

import type { Db } from '../db.ts';
import { screenDetail } from '../audit.ts';

/* ================================================================== *
 * 1 · WHO HAS ALREADY APPROVED IT
 * ================================================================== */

/**
 * The fields of one register record whose latest tick is APPROVED — every field, or only `field` where it is given.
 * A tick that was taken off is not an approval; a tick nobody gave is not one either.
 */
export function approvedFieldsOf(db: Db, business_id: string, record_id: string, field?: string): string[] {
  const prefix = `reg.${record_id}.`;
  const latest = new Map<string, string>();
  for (const r of db.all<{ fact_ref: string; action: string }>(
    'SELECT fact_ref, action FROM fact_approvals WHERE business_id = ? AND substr(fact_ref, 1, ?) = ? ORDER BY at ASC, rowid ASC',
    [business_id, prefix.length, prefix],
  )) latest.set(r.fact_ref.slice(prefix.length), r.action);
  return [...latest].filter(([f, a]) => a === 'APPROVED' && (field === undefined || f === field)).map(([f]) => f).sort();
}

/* ================================================================== *
 * 2 · WHAT A PERSON MUST LOOK AT AGAIN
 * ================================================================== */

export type LookAgainKind =
  | 'SITE_AREA' | 'SIGNATORY_CHECK' | 'CLIENT_TOLD' | 'REPORT_ISSUED' | 'SURVEYOR_JOB' | 'GRANT_RECORDED';

export type LookAgain = {
  readonly kind: LookAgainKind;
  /** How many. Never a value, a name or an address. */
  readonly count: number;
  /** What to look at, in words a person acts on. */
  readonly words: string;
};

/** The record as it stood — what the list is worked out from. */
export type RecordAsItStood = {
  readonly id: string;
  readonly source_id: string;
  readonly obtained_at: string;
  readonly property_id: string | null;
};

/** The registers whose facts sit on the COMPANY step of the checks panel. The same list approvals.ts draws from. */
const COMPANY_REGISTERS: readonly string[] = ['CH_COMPANY', 'CH_PSC'];

/** Where the site area from HM Land Registry's land boundary is kept (src/connectors/site-area.ts, SITE_AREA_SOURCE_ID). */
const SITE_AREA_SOURCE = 'HMLR_INSPIRE';

/** The register a signatory check reads its company number or care registration from, by the check's own name. */
const SIGNATORY_READS: Readonly<Record<string, string>> = Object.freeze({ CH_COMPANY: 'COMPANIES_HOUSE', CQC: 'CQC' });

/**
 * EVERYTHING KEPT ON THE STRENGTH OF THIS RECORD WHILE IT STOOD, worked out from the rows themselves and never
 * assumed. `field` narrows it to one field of the record, where only that field is being taken out.
 *
 * Each line is a thing that was written at or after the record arrived by something that READ it, and that removing
 * the record does not change:
 *   · SITE_AREA — src/connectors/site-area.ts reads the property's point from Homedata's address record
 *     (`homedataPointOf`) and keeps the site area it works out from it, as a record of its own.
 *   · SIGNATORY_CHECK — `runSignatoryCheck` (src/web/research.ts) reads the company number from Companies House's
 *     record and the care registration from the care regulator's, and keeps YES or NO. It does not ask again once it
 *     has one, so the check stands until a person looks at it.
 *   · CLIENT_TOLD — a step on the client's portal told as done since the record arrived, and not taken back. The
 *     record's facts sat on that step; the client may have been told "checked" on the strength of this one.
 *   · REPORT_ISSUED — a report or pack issued since. Issued is issued: it is not re-cut here.
 *   · SURVEYOR_JOB — the surveyor's payload carries register records (src/web/surveyor.ts). An open job saw it; a job
 *     committed since may have used it.
 *   · GRANT_RECORDED — only for the name of whoever paid a grant: a grant recorded from a client document since.
 */
export function lookAgainAfter(db: Db, business_id: string, rec: RecordAsItStood, field?: string): LookAgain[] {
  const out: LookAgain[] = [];
  const since = rec.obtained_at;
  const add = (kind: LookAgainKind, count: number, words: string): void => { if (count > 0) out.push({ kind, count, words }); };

  if (rec.source_id === 'HOMEDATA_ADDRESS' && field === undefined) {
    const n = db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM register_records WHERE business_id = ? AND source_id = ? AND obtained_at >= ?' +
        (rec.property_id === null ? '' : ' AND entity_id = ?'),
      rec.property_id === null ? [business_id, SITE_AREA_SOURCE, since] : [business_id, SITE_AREA_SOURCE, since, `property:${rec.property_id}`],
    )?.n ?? 0;
    add('SITE_AREA', n, 'A site area was worked out from this building’s point while it stood, and it is still held. ' +
      'Check it on the property page: if the point came from the wrong building, so did the site area.');
  }

  const signatory = SIGNATORY_READS[rec.source_id];
  if (signatory !== undefined && field === undefined) {
    const n = db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM signatory_checks WHERE business_id = ? AND source = ? AND checked_at >= ?',
      [business_id, signatory, since])?.n ?? 0;
    add('SIGNATORY_CHECK', n, `The check of who signed was made against ${signatory === 'CQC' ? 'the care regulator' : 'Companies House'} ` +
      'using this entry. Look at that result again: it may have been made against the wrong one.');
  }

  const step = COMPANY_REGISTERS.includes(rec.source_id) ? 'COMPANY' : 'PROPERTY';
  const told = db.all<{ k: string; action: string; at: string }>(
    "SELECT COALESCE(claim_id, '') AS k, action, at FROM client_step_notices WHERE business_id = ? AND step = ? ORDER BY at ASC, rowid ASC",
    [business_id, step]);
  const last = new Map<string, { action: string; at: string }>();
  for (const r of told) last.set(r.k, r);
  add('CLIENT_TOLD', [...last.values()].filter((r) => r.action === 'TOLD' && r.at >= since).length,
    `The client was told their ${step === 'COMPANY' ? 'company' : 'property'} details were checked after this arrived. ` +
      'If that rested on this entry, take the step back on the checks panel.');

  const issued = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM claim_deliverables cd JOIN claims c ON c.id = cd.claim_id WHERE c.business_id = ? " +
      "AND cd.state IN ('ISSUED','SUPERSEDED') AND cd.issued_on >= ?",
    [business_id, since.slice(0, 10)])?.n ?? 0;
  add('REPORT_ISSUED', issued, 'A report or pack for this client was issued while it stood. Check whether it used this entry.');

  if (field === undefined) {
    const jobs = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM surveyor_jobs WHERE business_id = ? AND (state = 'SEALED' OR committed_at >= ?)",
      [business_id, since])?.n ?? 0;
    add('SURVEYOR_JOB', jobs, 'A surveyor’s job for this client could see this entry. Tell the surveyor it has been taken out.');
  }

  if (field === 'grant_funder_name') {
    const n = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM claim_grants g JOIN claims c ON c.id = g.claim_id WHERE c.business_id = ? " +
        "AND g.source_id = 'CLIENT_DOC' AND g.recorded_at >= ? AND g.withdrawn_at IS NULL",
      [business_id, since])?.n ?? 0;
    add('GRANT_RECORDED', n, 'A grant was recorded from a client document after this arrived. Check that who paid it is still right.');
  }
  return out;
}

/**
 * THE SAME LIST, SHORT, READ BACK FROM WHAT WAS KEPT — for a screen drawn later, when the rows that made the list may
 * have moved on. One phrase per kind; a kind this build does not know is drawn as itself rather than dropped.
 */
export const LOOK_AGAIN_SHORT: Readonly<Record<LookAgainKind, string>> = Object.freeze({
  SITE_AREA: 'the site area worked out from it',
  SIGNATORY_CHECK: 'the check of who signed',
  CLIENT_TOLD: 'a step the client was told was done',
  REPORT_ISSUED: 'a report issued while it stood',
  SURVEYOR_JOB: 'the surveyor’s job',
  GRANT_RECORDED: 'a grant recorded since',
});

export function lookAgainShort(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]') as { kind?: unknown }[];
    return Array.isArray(v) ? v.map((x) => LOOK_AGAIN_SHORT[x.kind as LookAgainKind] ?? String(x.kind)) : [];
  } catch { return []; }
}

/** What the take-back keeps and the audit line carries: kinds and counts, never the words, a value or a name. */
export function lookAgainJson(list: readonly LookAgain[]): string {
  return JSON.stringify(list.map((l) => ({ kind: l.kind, count: l.count })));
}

/** One sentence for the screen: nothing, or how many things to look at again. The lines themselves follow it. */
export function lookAgainSummary(list: readonly LookAgain[]): string {
  if (list.length === 0) return 'Nothing was worked out from it while it stood, so there is nothing else to look at again.';
  return list.length === 1
    ? 'One thing was worked out from it while it stood and is still kept. Look at it again:'
    : `${list.length} things were worked out from it while it stood and are still kept. Look at each of them again:`;
}

/* ================================================================== *
 * 3 · THE REASON
 * ================================================================== */

/**
 * WHY, IN THE PERSON'S OWN WORDS — or why not. Required, trimmed, at most 2000 characters, as Phase 139's reason is.
 * It goes on the audit chain as well as on the row, so it must pass the chain's screen: an email address or a
 * supplier key is refused here, before anything is written, with words that say what to leave out.
 */
export function takeBackReason(v: string | null | undefined): { ok: true; reason: string } | { ok: false; why: string } {
  const t = (v ?? '').trim().slice(0, 2000);
  if (t === '') return { ok: false, why: 'Say why you are taking it back. The reason is kept with it.' };
  try { screenDetail({ reason: t }); } catch {
    return { ok: false, why: 'Leave email addresses and codes out of the reason. Say what was wrong in your own words.' };
  }
  return { ok: true, reason: t };
}
