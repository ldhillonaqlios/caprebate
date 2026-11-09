/**
 * ADMIN'S DATA FILE (09-app/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: users' settings, roles, templates, connections and lists. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

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
