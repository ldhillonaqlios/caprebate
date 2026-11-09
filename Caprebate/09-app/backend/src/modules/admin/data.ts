/**
 * ADMIN'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: users' settings, roles, templates, connections and lists. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

// email_templates
export function getEmailTemplatesIdLabelById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates WHERE id = ?', params);
}
export function getEmailTemplatesIdLabelByIdActive<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates WHERE id = ? AND active = 1', params);
}
export function insertEmailTemplates(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listEmailTemplatesIdLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates ORDER BY label ASC', params);
}
export function listEmailTemplatesIdLabelByActive<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label FROM email_templates WHERE active = 1 ORDER BY label ASC', params);
}
export function updateEmailTemplatesLabelSubjectById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE email_templates SET label = ?, subject = ?, body = ?, active = ?, updated_at = ? WHERE id = ?', params);
}

// reason_lists
export function getReasonListsCountByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM reason_lists WHERE list = ? AND code = ?', params);
}
export function getReasonListsLabelActiveByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label, active FROM reason_lists WHERE list = ? AND code = ?', params);
}
export function getReasonListsNByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(ord) AS n FROM reason_lists WHERE list = ?', params);
}
export function insertReasonLists(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO reason_lists (list, code, label, ord, active, source) VALUES (?, ?, ?, ?, 1, ?)', params);
}
export function listReasonListsCodeLabelByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, ord, active, source FROM reason_lists WHERE list = ? ORDER BY ord ASC, code ASC', params);
}
export function updateReasonListsLabelActiveByListCode(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE reason_lists SET label = ?, active = ? WHERE list = ? AND code = ?', params);
}

// vocabularies
export function getVocabulariesActiveByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT active FROM vocabularies WHERE list = ? AND code = ?', params);
}
export function getVocabulariesCountByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM vocabularies WHERE list = ? AND code = ?', params);
}
export function getVocabulariesLabelActiveByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label, active, fixed FROM vocabularies WHERE list = ? AND code = ?', params);
}
export function getVocabulariesLabelByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM vocabularies WHERE list = ? AND code = ?', params);
}
export function getVocabulariesNByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(ord) AS n FROM vocabularies WHERE list = ?', params);
}
export function insertVocabularies(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO vocabularies (list, code, label, ord, active, fixed, source, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)', params);
}
export function listVocabulariesCodeLabelByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, ord, active, fixed, source FROM vocabularies WHERE list = ? ORDER BY ord ASC, code ASC', params);
}
export function updateVocabulariesLabelActiveByListCode(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE vocabularies SET label = ?, active = ?, updated_at = ? WHERE list = ? AND code = ?', params);
}

// Moved here from other areas' borrowed files: their statements are on this module's tables.
export function getDocumentTypesCodeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT code FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesCodeLabelByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesHandlerTypeActiveByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type, active FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesHandlerTypeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesLabelByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesLabelByCode2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(ord) AS m FROM document_types', params);
}
export function getDocumentTypesOrdByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT ord FROM document_types WHERE code = ?', params);
}
export function getEmailSenderA<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT address AS a FROM email_sender ORDER BY rowid DESC LIMIT 1', params);
}
export function getEmailSenderDisplayNameAddress<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT display_name, address, reply_to FROM email_sender ORDER BY rowid DESC LIMIT 1', params);
}
export function getEmailTemplatesLabelSubjectByIdActive<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label, subject, body FROM email_templates WHERE id = ? AND active = 1', params);
}
export function getReasonListsCodeLabelByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT code, label, active FROM reason_lists WHERE list = 'CLAIM_EXIT' AND code = ?", params);
}
export function getReasonListsLabelByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM reason_lists WHERE list = ? AND code = ?', params);
}
export function getSavedKeysCoalesceMaxRowidM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT coalesce(max(rowid), 0) AS m FROM saved_keys', params);
}
export function getSavedViewsIdListById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, list, name, params, shared, created_by, retired_at FROM saved_views WHERE id = ?', params);
}
export function getVocabulariesActivityTypeCountByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM vocabularies WHERE list = 'ACTIVITY_TYPE' AND code = ?", params);
}
export function insertDocumentTypes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) ' +
    'VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertEmailSender(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_sender (id, display_name, address, reply_to, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function insertSavedKeys(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO saved_keys (id, name, sealed, set_by, set_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function insertSavedViews(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO saved_views (id, list, name, params, shared, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listDocumentTypesCodeLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label FROM document_types', params);
}
export function listDocumentTypesCodeLabel2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at FROM document_types ORDER BY ord ASC, code ASC', params);
}
export function listDocumentTypesCodeLabelByActiveHandlerType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, handler_type FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}
export function listDocumentTypesCodeLabelByActiveHandlerType2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}
export function listReasonListsCodeLabelActiveByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, active FROM reason_lists WHERE list = ? ORDER BY ord ASC, code ASC', params);
}
export function listSavedViewsIdListByListRetiredAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, list, name, params, shared, created_by, retired_at FROM saved_views ' +
    'WHERE list = ? AND retired_at IS NULL AND (shared = 1 OR created_by = ?) ORDER BY shared DESC, name ASC, id ASC', params);
}
export function updateDocumentTypesLabelReadersByCode(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_types SET label = ?, readers = ?, carries_value = ?, retention_ref = ?, active = ?, updated_at = ? WHERE code = ?', params);
}
export function updateSavedViewsRetiredAtRetiredByById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE saved_views SET retired_at = ?, retired_by = ? WHERE id = ?', params);
}

// FOR THE CRM (Phase 161l1): the document types the given codes name, in place of the CRM's joins to document_types.
export function listDocumentTypesCodeReadersLabelByCodes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.code, t.readers, t.carries_value, t.label FROM document_types t WHERE t.code IN (SELECT value FROM json_each(?))', params);
}
