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

// client_step_notices
export function listClientStepNoticesClaimIdStepByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.claim_id, e.step, e.action, e.reason, e.at, e.actor_id AS who FROM client_step_notices e ' +
    'WHERE e.business_id = ? ORDER BY e.at ASC, e.rowid ASC', params), { who: 'display_name' });
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

// fact_approvals
export function listFeeDiscountsIdDiscountBpByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT f.id, f.discount_bp, f.reason, f.recorded_at, f.recorded_by AS who FROM fee_discounts f ' +
    'WHERE f.claim_id = ? ORDER BY f.recorded_at DESC, f.rowid DESC', params), { who: 'display_name' });
}

// internal_notes
export function listInternalNotesIdBodyByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT n.id, n.body, n.created_at, n.author_id AS author_name ' +
    'FROM internal_notes n ' +
    'WHERE n.business_id = ? ORDER BY n.created_at DESC', params), { author_name: 'display_name' });
}

// logical_documents
export function listLogicalDocumentsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
    't.retention_ref AS type_retention, l.created_by AS created_role, l.created_by AS created_name FROM logical_documents l ' +
    'JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ? ' +
    'ORDER BY l.created_at DESC, l.seq DESC', params), { created_role: 'role', created_name: 'display_name' });
}

// logical_documents
export function getLogicalDocumentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?', params);
}
export function listLogicalDocumentsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code ORDER BY l.created_at DESC, l.id ASC LIMIT 2000', params);
}
export function listLogicalDocumentsIdBusinessIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ?', params);
}
export function listLogicalDocumentsIdBusinessIdByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ? ORDER BY t.ord ASC, l.seq ASC', params);
}
export function listLogicalDocumentsIdBusinessIdByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id IN (SELECT k.logical_document_id FROM document_links k LEFT JOIN claims c ON c.property_id = k.property_id WHERE k.unlinked_at IS NULL AND (k.claim_id = ? OR c.id = ?)) ORDER BY t.ord ASC, l.seq ASC', params);
}
export function listLogicalDocumentsIdBusinessIdByIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id IN (SELECT k.logical_document_id FROM document_links k WHERE k.unlinked_at IS NULL AND k.property_id = ?) ORDER BY t.ord ASC, l.seq ASC', params);
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
