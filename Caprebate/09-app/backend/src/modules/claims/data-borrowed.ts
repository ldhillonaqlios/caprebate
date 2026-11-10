/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CLAIMS (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUser, fillUsers } from '../../core/index.ts';
import { listAssessmentsBusinessIdSubmittedAtByBusinessIds } from '../assessment/index.ts';
import { listOutboxIdSentAtLastErrorByIds } from '../../integrations/index.ts';

/*
 * Phase 161l1: what is left here reads tables of areas above the claims in the order: the CRM's (businesses, contacts,
 * client tasks and their checks, internal notes), the survey's, finance's fee discounts, the portal's client step
 * notices and admin's document types (for the next phase; the CRM is split separately). The users (the core), the
 * assessments, the outbox and the register records are below the claims: read through their front doors and put in
 * place, so each row is what the join gave; the statements on this module's own tables went to its data file.
 */
/** (SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at, from the assessment. */
function submittedAt<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const ids = [...new Set(rows.map((r) => r.business_id).filter((x): x is string => typeof x === 'string'))];
  const at = new Map(ids.length === 0 ? [] : listAssessmentsBusinessIdSubmittedAtByBusinessIds<{ business_id: string; submitted_at: unknown }>(db, [JSON.stringify(ids)]).map((a) => [a.business_id, a.submitted_at]));
  return rows.map((r) => ({ ...r, submitted_at: at.get(String(r.business_id)) ?? null }) as Row as T);
}

// assessments
export function getAssessmentsBusinessIdNameByBusinessIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return submittedAt<T>(db, db.all('SELECT b.id AS business_id, b.name, b.sector, b.stage, NULL AS submitted_at ' +
    'FROM businesses b WHERE b.id = ? LIMIT 1', params))[0];
}
export function listAssessmentsBusinessIdNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return submittedAt<T>(db, db.all('SELECT b.id AS business_id, b.name, b.sector, b.stage, NULL AS submitted_at ' +
    'FROM businesses b ORDER BY b.created_at DESC, b.name ASC LIMIT ?', params));
}

// businesses
export function listBusinessesOByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT owner_id AS o FROM businesses WHERE id = ? UNION SELECT owner_id AS o FROM claims WHERE business_id = ?', params);
}

// client_tasks
export function listClientTasksQuestionAnswerByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>("SELECT t.question, t.answer, t.answer_state, t.answered_at, t.answered_by_role AS role, t.answered_by AS who, " +
    'k.checked_by AS checker, k.checked_at FROM client_tasks t ' +
    'LEFT JOIN client_task_checks k ON k.task_id = t.id ' +
    "WHERE t.business_id = ? AND t.state = 'ANSWERED' AND t.kind = 'QUESTION' AND (t.claim_id = ? OR t.claim_id IS NULL) " +
    "AND (t.answered_by_role = 'STAFF' OR k.outcome = 'ACCEPTED') ORDER BY t.answered_at DESC", params), { who: 'display_name', checker: 'display_name' });
}

// engagement_sign_links
export function getEngagementSignLinksIdEngagementIdByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, b.name AS business_name, ' +
    'b.company_number, k.user_id AS disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
    'JOIN businesses b ON b.id = e.business_id WHERE k.token_sha256 = ?', params), { disabled_at: 'disabled_at' });
}

// internal_notes
export function listInternalNotesIdBodyByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT n.id, n.body, n.created_at, n.author_id AS author_name ' +
    'FROM internal_notes n ' +
    'WHERE n.business_id = ? ORDER BY n.created_at DESC', params), { author_name: 'display_name' });
}

// pack_client_notices
export function getPackClientNoticesToldAtToldByNameByApprovalId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT n.told_at, n.told_by AS told_by_name FROM pack_client_notices n WHERE n.approval_id = ?', params), { told_by_name: 'display_name' });
}

// pack_signoff_requests
export function getPackSignoffRequestsIdApprovalIdByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.id, r.approval_id, r.expires_at, c.full_name AS name, b.name AS company, a.snapshot_json, a.fingerprint, x.outcome, x.answered_at, j.claim_id, j.business_id ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN contacts c ON c.id = r.contact_id ' +
    'JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN businesses b ON b.id = j.business_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', params);
}
export function listPackSignoffRequestsIdApprovalIdByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = fillUsers(db, db.all('SELECT r.id, r.approval_id, a.version, c.full_name AS contact_name, r.to_email, r.permission_note, r.sent_by AS sent_by_name, r.sent_at, r.expires_at, ' +
    'r.outbox_id AS sent_at_outbox, r.outbox_id AS send_error, x.id AS a_id, x.outcome, x.signer_name, x.signer_firm, x.signer_credential, x.reason, x.answered_at, ' +
    'k.signoff_id AS recorded_signoff ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN contacts c ON c.id = r.contact_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id LEFT JOIN pack_signoff_recorded k ON k.answer_id = x.id ' +
    'WHERE p.job_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', params), { sent_by_name: 'display_name' });
  // JOIN outbox: r.outbox_id is NOT NULL and refers to the outbox, so every row has its message.
  const ids = [...new Set(rows.map((r) => r.sent_at_outbox).filter((x): x is string => typeof x === 'string'))];
  const sent = new Map(ids.length === 0 ? [] : listOutboxIdSentAtLastErrorByIds<{ id: string; sent_at: unknown; last_error: unknown }>(db, [JSON.stringify(ids)]).map((o) => [o.id, o]));
  return rows.flatMap((r) => {
    const o = sent.get(String(r.sent_at_outbox));
    return o === undefined ? [] : [{ ...r, sent_at_outbox: o.sent_at, send_error: o.last_error } as Row as T];
  });
}

// research_runs
export function getSurveyPackApprovalsSnapshotJsonVersionByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.snapshot_json, a.version, a.approved_at, j.claim_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN claims c ON c.id = j.claim_id ' +
    'JOIN tax_adviser_signoffs s ON s.approval_id = a.id AND s.claim_id = j.claim_id ' +
    'WHERE (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) ' +
    "AND s.recorded_at >= COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = j.claim_id AND m.kind = 'REOPEN' " +
    "AND m.to_stage IN (SELECT value FROM json_each(?))), '') " +
    'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function listSurveyPackApprovalsFingerprintSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.fingerprint, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence') AND s.recorded_at >= ?) " +
    'ORDER BY a.approved_at DESC, a.version DESC', params);
}
export function listSurveyPackApprovalsIdVersionByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, a.approved_by AS approver_name, a.approved_at, a.snapshot_json, j.id AS job_id, j.claim_id ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.business_id = ? AND j.claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')) " +
    'ORDER BY a.approved_at DESC, a.version DESC', params), { approver_name: 'display_name' });
}
export function getSurveyPackLegalAnswersValueJsonAtByQuestionIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.value_json, a.at FROM survey_pack_legal_answers a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    "LEFT JOIN claims c ON c.id = j.claim_id WHERE a.question_id = 'G9d' AND (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) " +
    'ORDER BY a.at DESC, a.seq DESC LIMIT 1', params);
}

// surveyor_jobs
export function getSurveyorJobsIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT j.id, j.surveyor_id, j.surveyor_id AS who FROM surveyor_jobs j ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC LIMIT 1', params), { who: 'display_name' });
}
export function listSurveyorJobsSurveyorIdBySurveyorIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT j.surveyor_id FROM surveyor_jobs j WHERE j.surveyor_id IS NOT NULL AND j.claim_id IN (' +
    'SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
    'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL)', params);
}

// client_tasks
export function listClientTasksIdFactIdByBusinessIdKind2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT t.id, t.fact_id, t.question, t.why, t.holds_up, t.state, t.answer_state, t.answer, t.answered_at, t.answered_by_role, t.sent_to_portal_at, t.created_at, t.withdrawn_at, t.due_on, t.asked_by AS asked_by_name, t.answered_by AS answered_by_name, t.withdrawn_by AS withdrawn_by_name FROM client_tasks t WHERE t.business_id = ? AND t.kind = \'QUESTION\' ORDER BY t.created_at ASC', params), { asked_by_name: 'display_name', answered_by_name: 'display_name', withdrawn_by_name: 'display_name' });
}

// document_field_vouches
export function listDocumentFieldVouchesIdBusinessIdByRequestIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ct.asked_by AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? AND ct.claim_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC', params), { asked_by: 'display_name' });
}
export function listDocumentFieldVouchesIdBusinessIdByRequestIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ct.asked_by AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC', params), { asked_by: 'display_name' });
}
