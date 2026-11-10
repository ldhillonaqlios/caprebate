/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CLAIMS (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUser, fillUsers } from '../../core/index.ts';
import { listOutboxIdSentAtLastErrorByIds } from '../../integrations/index.ts';

/*
 * Phase 161l1: what is left here reads tables of areas above the claims in the order: the CRM's (businesses, contacts,
 * client tasks and their checks, internal notes), the survey's, finance's fee discounts, the portal's client step
 * notices and admin's document types (for the next phase; the CRM is split separately). The users (the core), the
 * assessments, the outbox and the register records are below the claims: read through their front doors and put in
 * place, so each row is what the join gave; the statements on this module's own tables went to its data file.
 */

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

// document_field_vouches
