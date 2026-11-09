/**
 * THE PUBLIC SITE'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the enquiries and the site notices. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

// enquiry_checks
export function insertEnquiryChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertEnquiryChecks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) ' +
    'VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)', params);
}

// website_enquiries
export function deleteWebsiteEnquiriesById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM website_enquiries WHERE id = ?', params);
}
export function getWebsiteEnquiriesCountByStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM website_enquiries WHERE status = 'NEW'", params);
}
export function getWebsiteEnquiriesIdCreatedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, created_at, full_name, firm, email, phone, property_type, message, status, lead_id FROM website_enquiries WHERE id = ?', params);
}
export function insertWebsiteEnquiries(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO website_enquiries (id, created_at, full_name, firm, email, phone, property_type, message, contact_consent, status) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'NEW')", params);
}
export function listWebsiteEnquiriesIdCreatedAtByStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, created_at, full_name, firm, email, phone, property_type, message, status, lead_id FROM website_enquiries ' +
    "WHERE status = 'NEW' ORDER BY created_at DESC", params);
}
export function listWebsiteEnquiriesIdHandledAtByStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, handled_at FROM website_enquiries WHERE status = 'CLOSED'", params);
}
export function updateWebsiteEnquiriesStatusHandledByByIdStatus(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE website_enquiries SET status = 'CLOSED', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'NEW'", params);
}
export function updateWebsiteEnquiriesStatusLeadIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE website_enquiries SET status = 'LEAD', lead_id = ?, handled_by = ?, handled_at = ? WHERE id = ?", params);
}
