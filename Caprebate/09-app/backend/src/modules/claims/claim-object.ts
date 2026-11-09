/**
 * THE CLAIM AS `can()` IS ASKED ABOUT IT (Phase 161l1, moved from src/modules/crm/crm.ts unchanged): its id, its client
 * and the surveyors who reach it through a survey job on it, through the core's port (src/core/assigned-surveyors.ts),
 * which the survey fills.
 */
import type { Db, Obj } from '../../core/index.ts';
import { surveyorsOnClaim } from '../../core/index.ts';

/**
 * WHO REACHES A CLAIM THROUGH A SURVEY JOB: the surveyors assigned to a job ON
 * THIS CLAIM. CRM 2 of 10 gave `surveyor_jobs` a `claim_id` (migration 010,
 * disposition Part E, row E5) and this reads it — no longer the claim's
 * assessment, so two claims sharing an organisation's assessment cannot share a
 * surveyor by accident. A claim with no job on it is reachable by no surveyor,
 * and its page says so. `claims.surveyor_id` is not read here.
 */
function claimSurveyors(db: Db, claim_id: string): string[] {
  return surveyorsOnClaim(db, claim_id);
}

/** The claim as `can()` is asked about it. Exported for src/modules/crm/pipeline.ts, which moves it. */
export function claimObjFor(db: Db, r: { id: string; business_id: string }): Extract<Obj, { type: 'claim' }> {
  return { type: 'claim', id: r.id, business_id: r.business_id, assigned_surveyor_ids: claimSurveyors(db, r.id) };
}
