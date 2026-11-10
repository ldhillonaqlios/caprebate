/**
 * THE CLIENT PORTAL'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the client portal's own records. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUsers } from '../../core/index.ts';
import { listDocumentTypesCodeLabel } from '../admin/index.ts';
import { getDocumentsIdBusinessIdTypeCodeById, listClaimsIdBusinessIdStageClaimRefByIds, listDocumentsIdBusinessIdTypeCodeByBusinessId } from '../claims/index.ts';
import { listBusinessesIdNameSectorByIds, listContactsIdFullNameByIds } from '../clients/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

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

// Phase 161l1: these joined the claims' (claims, documents), the CRM's (contacts, businesses), admin's (document types)
// and the core's (users) tables, all below the portal. Each reads the portal's own rows with the id where the joined
// column stood, asks the owner through its front door, and puts the column in its place. A row an inner JOIN would
// have dropped (no such contact, claim or organisation) is dropped here too.
type Ided = { id: string };
function byIds<R extends Ided>(read: (db: Db, params: readonly Param[]) => R[], db: Db, ids: readonly unknown[]): Map<string, R> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  return new Map(want.length === 0 ? [] : read(db, [JSON.stringify(want)]).map((r) => [r.id, r]));
}
type ClaimCols = Ided & { business_id: string; stage: unknown; claim_ref: unknown };
type ContactCols = Ided & { full_name: unknown };
type BusinessCols = Ided & { name: unknown };
const claimsRead = (db: Db, p: readonly Param[]): ClaimCols[] => listClaimsIdBusinessIdStageClaimRefByIds<ClaimCols>(db, p);
const contactsRead = (db: Db, p: readonly Param[]): ContactCols[] => listContactsIdFullNameByIds<ContactCols>(db, p);
const businessesRead = (db: Db, p: readonly Param[]): BusinessCols[] => listBusinessesIdNameSectorByIds<BusinessCols>(db, p);

export function getAccountantConfirmRequestsIdKindByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const r = db.get('SELECT r.id, r.kind, r.expires_at, r.period_end, r.contact_id AS name, r.claim_id AS company, r.claim_id AS claim_ref, x.outcome, x.answered_at ' +
    'FROM accountant_confirm_requests r LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', params);
  if (r === undefined) return undefined;
  const k = byIds(contactsRead, db, [r.name]).get(String(r.name));
  const c = byIds(claimsRead, db, [r.claim_ref]).get(String(r.claim_ref));
  const b = c === undefined ? undefined : byIds(businessesRead, db, [c.business_id]).get(c.business_id);
  return k === undefined || c === undefined || b === undefined ? undefined : ({ ...r, name: k.full_name, company: b.name, claim_ref: c.claim_ref } as Row as T);
}
export function listAccountantConfirmRequestsIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = fillUsers(db, db.all('SELECT r.id, r.kind, r.contact_id AS contact_name, r.to_email, r.sent_by AS sent_by_name, r.sent_at, r.expires_at, r.period_end, ' +
    'x.outcome, x.signer_name, x.signer_firm, x.filed_on, x.reason, x.answered_at FROM accountant_confirm_requests r ' +
    'LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id ' +
    'WHERE r.claim_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', params), { sent_by_name: 'display_name' });
  const contacts = byIds(contactsRead, db, rows.map((r) => r.contact_name));
  return rows.flatMap((r) => {
    const k = contacts.get(String(r.contact_name));
    return k === undefined ? [] : [{ ...r, contact_name: k.full_name } as Row as T];
  });
}
export function getClaimsIdBusinessIdById8<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = byIds(claimsRead, db, [params[0]]).get(String(params[0]));
  const b = c === undefined ? undefined : byIds(businessesRead, db, [c.business_id]).get(c.business_id);
  return c === undefined || b === undefined ? undefined : ({ id: c.id, business_id: c.business_id, stage: c.stage, claim_ref: c.claim_ref, company: b.name } as Row as T);
}
/** type_label: the document type's label (LEFT JOIN document_types ON code = type_code), from admin's list. */
function typeLabels<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const label = new Map(rows.length === 0 ? [] : listDocumentTypesCodeLabel<{ code: string; label: unknown }>(db).map((t) => [t.code, t.label]));
  return rows.map((r) => ({ ...r, type_label: typeof r.type_label === 'string' ? label.get(r.type_label) ?? null : null }) as Row as T);
}
export function getDocumentsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const d = getDocumentsIdBusinessIdTypeCodeById(db, params);
  return d === undefined ? undefined : typeLabels<T>(db, [d])[0];
}
export function listDocumentsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return typeLabels<T>(db, listDocumentsIdBusinessIdTypeCodeByBusinessId(db, params));
}
