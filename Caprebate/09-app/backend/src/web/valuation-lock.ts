/**
 * ONE VERSION AFTER SIGN-OFF. PHASE 159a, 9 October 2026, from the stress test of that day (C3, C5, and L3 in the
 * Lockwood Surgery run).
 *
 * What went wrong: a surveyor could approve a new version of the survey pack, and answer the legal check again, after
 * the tax adviser had signed off and the claim had moved on to Reports, or after the claim had stopped. The client's
 * report, their acceptance and the defence pack stayed on the signed version, while the amendment-window gate read the
 * newer version's purchase date. So the claim closed on a report whose purchase date was not the one the gate checked.
 *
 * THE RULE NOW:
 *   · LOCKED. Once a claim is past the tax adviser's sign-off (Reports, Invoice, Defence pack, Closed), or has stopped
 *     at an exit, its valuation is fixed: no pack approval and no legal-check answer is taken (src/web/pack-approve.ts,
 *     src/web/pack-legal.ts). A claim on hold is judged by the stage it returns to.
 *   · REOPENED, ON PURPOSE. The only way to change the figures then is "Reopen the valuation": an admin moves the claim
 *     back to Valuation, with a reason (the claim's own REOPEN move, src/web/pipeline.ts). A reopen to any stage up to
 *     and including the tax adviser's sign-off SETS ASIDE what was released on the old figures, and the claim page says
 *     each one: the tax adviser's sign-off, the client report and the accountant's pack as issued (marked superseded),
 *     the client's acceptance of that report, and any defence pack. Nothing is deleted: every record stays, and the
 *     readers below look only at what came after the reopen.
 *
 * `voidLine` is the moment of the latest such reopen. A sign-off, an acceptance or an issued deliverable from before it
 * no longer counts.
 */
import type { Db } from '../db.ts';
import { PROCEDURE_KEYS, anyStageLabel, claimStage } from './stages.ts';

/** Stages at or after which the figures are fixed, in the procedure's order. */
const SIGNOFF_INDEX = PROCEDURE_KEYS.indexOf('TAX_ADVISER_SIGNOFF');

/** A reopen to one of these stages sets aside what was released: it is at or before the tax adviser's sign-off. */
export const VOIDING_REOPEN_STAGES: readonly string[] = Object.freeze(PROCEDURE_KEYS.slice(0, SIGNOFF_INDEX + 1));

/** The words for what a reopen sets aside, in one place, for the button and the record. */
export const REOPEN_VOIDS_WORDS =
  'Reopening the valuation moves the claim back to Valuation. It sets aside the sign-off, the reports, the client’s acceptance ' +
  'and any defence pack. Nothing is deleted. Each is done again on the new figures.';

/** The moment of the latest reopen that set aside what was released, or null. */
export function voidLine(db: Db, claim_id: string): string | null {
  return db.get<{ at: string | null }>(
    "SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ? AND kind = 'REOPEN' AND to_stage IN (SELECT value FROM json_each(?))",
    [claim_id, JSON.stringify(VOIDING_REOPEN_STAGES)])?.at ?? null;
}

/** The later of two moments, either of which may be missing. */
export function laterOf(a: string, b: string | null): string {
  return b !== null && b > a ? b : a;
}

export type ValuationLock = { readonly locked: false } | { readonly locked: true; readonly why: string; readonly stage: string };

/** Whether a claim's valuation is fixed, and why, in words a surveyor reads on the pack. A job with no claim is not. */
export function valuationLock(db: Db, claim_id: string | null): ValuationLock {
  if (claim_id === null) return { locked: false };
  const c = db.get<{ stage: string | null; hold_return_stage: string | null }>('SELECT stage, hold_return_stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return { locked: false };
  const s = claimStage(c.stage);
  if (s.kind === 'EXIT') {
    return { locked: true, stage: s.key, why: `This claim has stopped (${s.label}). Its figures cannot change. An admin may reopen the claim, with a reason.` };
  }
  if (s.kind === 'CLOSED') {
    return { locked: true, stage: s.key, why: 'This claim is closed. Its figures cannot change. An admin may reopen the valuation, with a reason.' };
  }
  const at = s.kind === 'PROCEDURE' ? s.key : s.kind === 'ON_HOLD' ? c.hold_return_stage : null;
  const i = at === null ? -1 : PROCEDURE_KEYS.indexOf(at as (typeof PROCEDURE_KEYS)[number]);
  if (i > SIGNOFF_INDEX) {
    return { locked: true, stage: at ?? '',
      why: `The tax adviser has signed off and the claim is at ${anyStageLabel(at)}. The signed figures are fixed. To change them, an admin reopens the valuation, with a reason.` };
  }
  return { locked: false };
}

export type SetAside = { readonly deliverables_superseded: number; readonly signoffs: number; readonly acceptances: number; readonly defence_packs: number };

/**
 * IN THE REOPEN'S OWN TRANSACTION: mark the client report and the accountant's pack as issued SUPERSEDED (their rows
 * stay), and count what else the reopen sets aside, for the audit row and the claim page. An issued defence pack never
 * changes (migration 015), so it is set aside by the readers, which look only past `voidLine`.
 */
export function setAsideOnReopen(db: Db, claim_id: string, at: string, actor_id: string): SetAside {
  const count = (sql: string) => db.get<{ n: number }>(sql, [claim_id])?.n ?? 0;
  const signoffs = count('SELECT COUNT(*) AS n FROM tax_adviser_signoffs WHERE claim_id = ?');
  const acceptances = count('SELECT COUNT(*) AS n FROM client_report_acceptances WHERE claim_id = ?');
  const defence_packs = count("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = 'DEFENCE_PACK' AND state = 'ISSUED'");
  const deliverables_superseded = count("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind IN ('CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK') AND state = 'ISSUED'");
  db.run("UPDATE claim_deliverables SET state = 'SUPERSEDED', updated_by = ?, updated_at = ? WHERE claim_id = ? AND kind IN ('CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK') AND state = 'ISSUED'",
    [actor_id, at, claim_id]);
  return { deliverables_superseded, signoffs, acceptances, defence_packs };
}

/** What the latest valuation reopen set aside, for the claim page: when, who, why. */
export function lastReopen(db: Db, claim_id: string): { readonly at: string; readonly who: string | null; readonly reason: string | null; readonly to: string } | null {
  return db.get<{ at: string; who: string | null; reason: string | null; to: string }>(
    'SELECT m.at, u.display_name AS who, m.reason_text AS reason, m.to_stage AS "to" FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id ' +
      "WHERE m.claim_id = ? AND m.kind = 'REOPEN' AND m.to_stage IN (SELECT value FROM json_each(?)) ORDER BY m.at DESC, m.rowid DESC LIMIT 1",
    [claim_id, JSON.stringify(VOIDING_REOPEN_STAGES)]) ?? null;
}

/** The newest approved version of a survey pack on a job on this claim: the one a sign-off must name. */
export function latestApprovalOnClaim(db: Db, claim_id: string): { readonly id: string; readonly version: number } | null {
  return db.get<{ id: string; version: number }>(
    'SELECT a.id, a.version FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', [claim_id]) ?? null;
}
