/**
 * WHO REACHES A CLAIM OR A CLIENT THROUGH A SURVEY JOB (Phase 161l1): the surveyors assigned to a survey job on it,
 * which is what `can()` is given as an object's `assigned_surveyor_ids` (src/core/authz.ts, throughAssignedJob).
 *
 * The jobs are the survey module's table (surveyor_jobs), and the modules below the survey (the client record, the
 * claims) build those objects too. So this is A PORT THE CORE OWNS: the survey hands its two reads in as its front door
 * loads (src/modules/survey/assigned-surveyors.ts), the statements its own, unchanged, and every module asks here. Asked
 * before it is handed in, it refuses rather than guess (an empty list would quietly shut a surveyor out). Asked only
 * while code runs, never while files load. Declared with `var`, so a hand-in that comes while this file is still
 * loading is kept.
 */
import type { Db } from './db.ts';

export type AssignedSurveyorsReader = {
  /** The surveyors with a job on this claim. */
  readonly onClaim: (db: Db, claim_id: string) => string[];
  /** The surveyors with a job on any of this client's claims or assessments. */
  readonly onBusiness: (db: Db, business_id: string) => string[];
};
var reader: AssignedSurveyorsReader | undefined;
export function setAssignedSurveyorsReader(r: AssignedSurveyorsReader): void { reader = r; }

function asked(): AssignedSurveyorsReader {
  if (reader === undefined) throw new Error('Who holds a survey job is not set up. The survey sets it up when it loads, so nothing was decided.');
  return reader;
}

/** The surveyors assigned to a survey job on this claim. */
export function surveyorsOnClaim(db: Db, claim_id: string): string[] { return asked().onClaim(db, claim_id); }

/** The surveyors assigned to a survey job on this client. */
export function surveyorsOnBusiness(db: Db, business_id: string): string[] { return asked().onBusiness(db, business_id); }
