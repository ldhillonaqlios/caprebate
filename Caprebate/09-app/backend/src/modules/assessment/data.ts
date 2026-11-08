/**
 * THE ASSESSMENT' DATA FILE (09-app/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the eligibility check and its saved answers. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

// assessment_answers
export function getAssessmentAnswersQuestionIdByAssessmentIdQuestionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT question_id FROM assessment_answers WHERE assessment_id = ? AND question_id LIKE 'Q2-%-address' AND state = 'ANSWERED' AND value = ?", params);
}
export function getAssessmentAnswersValueByAssessmentIdQuestionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT value FROM assessment_answers WHERE assessment_id = ? AND question_id = ? AND state = 'ANSWERED'", params);
}
export function getAssessmentAnswersValueByBusinessIdQuestionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT x.value FROM assessment_answers x JOIN assessments a ON a.id = x.assessment_id WHERE a.business_id = ? AND x.question_id = 'Q3' AND x.state = 'ANSWERED' ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1", params);
}
export function insertAssessmentAnswers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listAssessmentAnswersOrdQuestionIdByAssessmentId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ord, question_id, question_text, state, value FROM assessment_answers ' +
    'WHERE assessment_id = ? ORDER BY ord ASC', params);
}
export function listAssessmentAnswersQuestionIdQuestionTextByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT question_id, question_text, state, value FROM assessment_answers WHERE assessment_id = ? ORDER BY ord ASC', params);
}
export function listAssessmentAnswersQuestionIdQuestionTextByAssessmentIdSta<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT question_id, question_text, state FROM assessment_answers ' +
    "WHERE assessment_id = ? AND state <> 'ANSWERED' ORDER BY ord ASC", params);
}
export function listAssessmentAnswersQuestionIdValueByAssessmentIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT question_id, value FROM assessment_answers WHERE assessment_id = ? AND state = 'ANSWERED' AND (question_id LIKE 'Q2-%-address' OR question_id LIKE 'Q2-%-trigger')", params);
}
export function listAssessmentAnswersStateValueByAssessmentIdQuestionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT state, value FROM assessment_answers WHERE assessment_id = ? AND question_id LIKE 'Q2-%-entity'", params);
}
export function listAssessmentAnswersValueByAssessmentIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT value FROM assessment_answers WHERE assessment_id = ? AND state = 'ANSWERED' AND (question_id GLOB 'Q2-[0-9]*-spend' OR question_id GLOB 'Q3-[0-9]*-w[0-9]*-spend')", params);
}

// assessment_drafts
export function getAssessmentDraftsStateJsonBySubmittedAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state_json FROM assessment_drafts WHERE submitted_assessment_id = ?', params);
}
export function getAssessmentDraftsStateJsonScreenByToken<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state_json, screen, submitted_assessment_id, closed_lead_id FROM assessment_drafts WHERE token = ?', params);
}
export function insertAssessmentDrafts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function updateAssessmentDraftsClosedLeadIdUpdatedAtByToken(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE assessment_drafts SET closed_lead_id = ?, updated_at = ? WHERE token = ?', params);
}
export function updateAssessmentDraftsStateJsonScreenByToken(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE assessment_drafts SET state_json = ?, screen = ?, updated_at = ? WHERE token = ?', params);
}
export function updateAssessmentDraftsSubmittedAssessmentIdByToken(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE assessment_drafts SET submitted_assessment_id = ? WHERE token = ?', params);
}

// assessments
export function getAssessmentsAssessmentIdSubmittedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id AS assessment_id, submitted_at, shown_low_pence AS low_pence, ' +
    'shown_high_pence AS high_pence FROM assessments WHERE business_id = ? ' +
    'ORDER BY submitted_at DESC LIMIT 1', params);
}
export function getAssessmentsAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(submitted_at) AS at FROM assessments WHERE business_id = ?', params);
}
export function getAssessmentsCompanyNumberCompanyStatusByBusinessIdCompanyN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT company_number, company_status, company_accounts_type FROM assessments WHERE business_id = ? AND company_number IS NOT NULL ORDER BY submitted_at DESC, id DESC LIMIT 1', params);
}
export function getAssessmentsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM assessments WHERE business_id = ? LIMIT 1', params);
}
export function getAssessmentsIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', params);
}
export function getAssessmentsIdSectorByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, sector, submitted_at, shown_low_pence, shown_high_pence FROM assessments ' +
    'WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', params);
}
export function getAssessmentsLowHighById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT shown_low_pence AS low, shown_high_pence AS high FROM assessments WHERE id = ?', params);
}
export function getAssessmentsSectorById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sector FROM assessments WHERE id = ?', params);
}
export function getAssessmentsShownHighPenceByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT shown_high_pence FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', params);
}
export function getAssessmentsShownHighPenceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT shown_high_pence FROM assessments WHERE id = ?', params);
}
export function getAssessmentsShownLowPenceShownHighPenceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT shown_low_pence, shown_high_pence FROM assessments WHERE id = ?', params);
}
export function getAssessmentsSubmittedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT submitted_at FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC LIMIT 1', params);
}
export function insertAssessments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at, company_number, company_status, company_accounts_type) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertAssessments2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// consent_answers
export function insertConsentAnswers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO consent_answers (id, contact_id, kind, decision, wording_version, route, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listConsentAnswersIdKindByContactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, kind, decision FROM consent_answers WHERE contact_id = ?', params);
}
export function listConsentAnswersRecordedAtKindByContactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT recorded_at, kind, decision, wording_version, route FROM consent_answers WHERE contact_id = ? ORDER BY rowid', params);
}

// estimates
export function getEstimatesBasisByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT basis FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesCountByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesCountByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM estimates WHERE business_id = ?', params);
}
export function getEstimatesEstimateHashByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT estimate_hash FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesIdByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
    'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesQualifyingExpenditurePenceQualifyingPctByAssessm2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, bare_land_pence, multiplier, ' +
    'indicative_lifetime_saving_pence, sealed_at, estimate_hash FROM estimates WHERE assessment_id = ?', params);
}
export function getEstimatesQualifyingExpenditurePenceSealedAtByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT qualifying_expenditure_pence, sealed_at, estimate_hash FROM estimates WHERE assessment_id = ?', params);
}
export function insertEstimates(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, ' +
    'pool_split_special_pence, bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash, basis) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertEstimates2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, ' +
    'pool_split_main_pence, pool_split_special_pence, bare_land_pence, multiplier, ' +
    'indicative_lifetime_saving_pence, sealed_at, estimate_hash) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// lookups_declined
export function getLookupsDeclinedBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM lookups_declined WHERE business_id = ?', params);
}
export function insertLookupsDeclined(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO lookups_declined (business_id, declined_at, how) VALUES (?, ?, 'ASSESSMENT')", params);
}
