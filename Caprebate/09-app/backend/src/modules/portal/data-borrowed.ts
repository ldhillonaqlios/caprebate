/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CLIENT PORTAL (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// accountant_confirm_requests
export function getAccountantConfirmRequestsIdKindByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.id, r.kind, r.expires_at, r.period_end, k.full_name AS name, b.name AS company, c.claim_ref, x.outcome, x.answered_at ' +
    'FROM accountant_confirm_requests r JOIN contacts k ON k.id = r.contact_id JOIN claims c ON c.id = r.claim_id JOIN businesses b ON b.id = c.business_id ' +
    'LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', params);
}
export function listAccountantConfirmRequestsIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.id, r.kind, k.full_name AS contact_name, r.to_email, u.display_name AS sent_by_name, r.sent_at, r.expires_at, r.period_end, ' +
    'x.outcome, x.signer_name, x.signer_firm, x.filed_on, x.reason, x.answered_at FROM accountant_confirm_requests r ' +
    'JOIN contacts k ON k.id = r.contact_id JOIN users u ON u.id = r.sent_by LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id ' +
    'WHERE r.claim_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', params);
}

// claims
export function getClaimsIdBusinessIdById8<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.business_id, c.stage, c.claim_ref, b.name AS company FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', params);
}

// documents
export function getDocumentsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, t.label AS type_label, l.seq FROM documents d LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.id = ?', params);
}
export function listDocumentsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, t.label AS type_label, l.seq FROM documents d LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.business_id = ? ORDER BY d.created_at DESC', params);
}
