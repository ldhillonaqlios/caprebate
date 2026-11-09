/**
 * THE CLIENT PORTAL'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the client portal's own records. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

// accountant_confirm_answers
export function insertAccountantConfirmAnswers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO accountant_confirm_answers (id, request_id, outcome, signer_name, signer_firm, filed_on, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// accountant_confirm_requests
export function getAccountantConfirmRequestsClaimIdSentByById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT claim_id, sent_by FROM accountant_confirm_requests WHERE id = ?', params);
}
export function insertAccountantConfirmRequests(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO accountant_confirm_requests (id, claim_id, kind, contact_id, to_email, token_sha256, outbox_id, sent_by, sent_at, expires_at, period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// client_filing_confirmations
export function getClientFilingConfirmationsByClaimIdRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM client_filing_confirmations WHERE claim_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', params);
}
export function insertClientFilingConfirmations(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, no_accountant_or_adviser, will_file_amendment, ' +
    'last_day_acknowledged, last_day_stated, remains_responsible, written_evidence, recorded_by, recorded_at) ' +
    "VALUES (?, ?, ?, 'CLIENT', ?, ?, ?, ?, ?, ?, ?, ?)", params);
}

// client_report_acceptances
export function getClientReportAcceptancesAcceptedAtByApprovalIdUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT accepted_at FROM client_report_acceptances WHERE approval_id = ? AND user_id = ?', params);
}
export function getClientReportAcceptancesAcceptedAtFingerprintByClaimIdFing<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT accepted_at, fingerprint FROM client_report_acceptances WHERE claim_id = ? AND fingerprint = ? AND accepted_at >= ? ORDER BY accepted_at LIMIT 1', params);
}
export function insertClientReportAcceptances(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_report_acceptances (id, claim_id, approval_id, fingerprint, user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// client_step_notices
export function insertClientStepNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClientStepNotices2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)', params);
}
export function listClientStepNoticesClaimIdStepByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT claim_id, step, action, at FROM client_step_notices WHERE business_id = ? ORDER BY at ASC, rowid ASC', params);
}
export function listClientStepNoticesCOALESCEClaimIdKByBusinessIdStep<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT COALESCE(claim_id, '') AS k, action, at FROM client_step_notices WHERE business_id = ? AND step = ? ORDER BY at ASC, rowid ASC", params);
}

// client_report_acceptances
export function getClientReportAcceptancesCountByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM client_report_acceptances WHERE claim_id = ?', params);
}

// Moved here from the lower layers' borrowed files: their statements are on this module's tables.
export function getClientSignupsIdBusinessIdByOfferHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, offer_expires_at, email_canonical, display_name, password_hash, verify_expires_at, verified_at ' +
    'FROM client_signups WHERE offer_hash = ?', params);
}
export function getClientSignupsIdBusinessIdByVerifyHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, offer_expires_at, email_canonical, display_name, password_hash, verify_expires_at, verified_at ' +
    'FROM client_signups WHERE verify_hash = ?', params);
}
export function getClientSignupsTermsAgreedAtTermsVersionsById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT terms_agreed_at, terms_versions FROM client_signups WHERE id = ?', params);
}
export function getClientSignupsVerifyExpiresAtVerifiedAtByVerifyHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT verify_expires_at, verified_at FROM client_signups WHERE verify_hash = ?', params);
}
export function insertClientSignups(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_signups (id, business_id, assessment_id, offer_hash, created_at, offer_expires_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function updateClientSignupsEmailCanonicalDisplayNameByIdVerifiedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE client_signups SET email_canonical = ?, display_name = ?, password_hash = ?, verify_hash = ?, verify_expires_at = ?, requested_at = ?, ' +
    'terms_agreed_at = ?, terms_versions = ? WHERE id = ? AND verified_at IS NULL', params);
}
export function updateClientSignupsVerifiedAtUserIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE client_signups SET verified_at = ?, user_id = ?, password_hash = NULL WHERE id = ?', params);
}
