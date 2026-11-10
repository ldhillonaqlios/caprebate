/**
 * HOW MANY SURVEY JOBS COULD SEE A REGISTER RECORD, handed in to the port the claims own
 * (src/modules/claims/survey-jobs-seen.ts) as the survey's front door loads, so the claims' take-back counts them
 * without importing the survey. The statement is the survey's own (data.ts), unchanged.
 */
import { setSurveyorJobsSeenReader } from '../claims/index.ts';
import { getSurveyorJobsCountByBusinessIdState } from './data.ts';

setSurveyorJobsSeenReader((db, business_id, since) => getSurveyorJobsCountByBusinessIdState<{ n: number }>(db, [business_id, since])?.n ?? 0);
