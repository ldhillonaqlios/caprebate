/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE ASSESSMENT (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// surveyor_jobs
export function getSurveyorJobsBusinessIdClaimIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.business_id, j.claim_id, b.sector FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id WHERE j.id = ?', params);
}
