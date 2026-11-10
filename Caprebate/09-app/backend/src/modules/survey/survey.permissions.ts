/**
 * WHO MAY ENTER THE SURVEY'S SECTION: the section gate.
 *
 * Kept apart from the rules in src/modules/survey/surveyor.ts so a change to who may open a section is made in one small file (Phase 161l2,
 * the same split as src/modules/crm/crm.permissions.ts). Every view and write still authorises on its own object as well;
 * it only decides whether a login may enter the section at all. Moved here unchanged.
 */
import { authorise, type Actor } from '../../core/index.ts';

/**
 * THE SECTION GATE. `surveyor_job.enter` — its own action rather than a
 * sentinel object, and authz.ts says at length why this one collection cannot
 * use the sentinel the other three use.
 *
 * The object's `surveyor_id` is null because no rule for this action reads it:
 * all three admitted roles are unconditional. A sentinel carrying the
 * requester's own id would be a fixture built to pass the test being asked.
 */
const SURVEY_SECTION = '__surveyor_jobs__';

export function assertSurveySection(actor: Actor): void {
  authorise(actor, 'surveyor_job.enter', {
    type: 'surveyor_job', id: SURVEY_SECTION, business_id: SURVEY_SECTION, surveyor_id: null,
  });
}
