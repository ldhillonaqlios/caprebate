/**
 * HOW MANY SURVEY JOBS COULD SEE A REGISTER RECORD (Phase 161l2): the survey jobs of a client that are sealed, or were
 * committed at or after a time. The take-back (src/modules/claims/take-back.ts) asks it, to tell a person that a
 * surveyor's job saw an entry being taken out.
 *
 * The jobs are the survey module's table (surveyor_jobs), and the survey sits above the claims. So this is A PORT THE
 * CLAIMS OWN: the survey hands its read in as its front door loads (src/modules/survey/survey-jobs-seen.ts), the
 * statement its own, unchanged. Asked before it is handed in, it refuses rather than guess (a quiet nought would hide
 * a job from the person taking the entry out). Asked only while code runs, never while files load. Declared with
 * `var`, so a hand-in that comes while this file is still loading is kept.
 */
import type { Db } from '../../core/index.ts';

/** The number of the client's survey jobs that are sealed, or were committed at or after `since`. */
export type SurveyorJobsSeenReader = (db: Db, business_id: string, since: string) => number;
var reader: SurveyorJobsSeenReader | undefined;
export function setSurveyorJobsSeenReader(r: SurveyorJobsSeenReader): void { reader = r; }

export function surveyorJobsSeenSince(db: Db, business_id: string, since: string): number {
  if (reader === undefined) throw new Error('How many survey jobs saw an entry is not set up. The survey sets it up when it loads, so nothing was counted.');
  return reader(db, business_id, since);
}
