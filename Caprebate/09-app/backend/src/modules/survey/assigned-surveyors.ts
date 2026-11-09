/**
 * WHO HOLDS A SURVEY JOB ON A CLAIM OR A CLIENT, handed in to the port the core owns (src/core/assigned-surveyors.ts)
 * as the survey's front door loads, so the modules below the survey build their objects for `can()` without importing
 * it. The statements are the survey's own (data.ts), unchanged.
 */
import { setAssignedSurveyorsReader } from '../../core/index.ts';
import { listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3, listSurveyorJobsSurveyorIdByClaimIdSurveyorId2 } from './data.ts';

setAssignedSurveyorsReader({
  onClaim: (db, claim_id) => listSurveyorJobsSurveyorIdByClaimIdSurveyorId2<{ surveyor_id: string }>(db, [claim_id]).map((r) => r.surveyor_id),
  onBusiness: (db, business_id) => listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3<{ surveyor_id: string }>(db, [business_id]).map((r) => r.surveyor_id),
});
