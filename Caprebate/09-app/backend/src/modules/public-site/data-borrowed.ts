/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE PUBLIC SITE (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// complaint_forms
export function getComplaintFormsIdReceivedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, complaint_verbatim, remedy_sought, rights, logged_complaint_id FROM complaint_forms WHERE id = ?', params);
}
export function insertComplaintForms(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO complaint_forms (id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, about, complaint_verbatim, remedy_sought, rights) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listComplaintFormsIdReceivedAtByLoggedComplaintId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, received_at, name, reply_to, complaint_verbatim FROM complaint_forms WHERE logged_complaint_id IS NULL ORDER BY received_at', params);
}
export function updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE complaint_forms SET logged_complaint_id = ?, logged_at = ?, logged_by = ? WHERE id = ? AND logged_complaint_id IS NULL', params);
}

// deletion_log
export function insertDeletionLog2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
    'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)', params);
}
