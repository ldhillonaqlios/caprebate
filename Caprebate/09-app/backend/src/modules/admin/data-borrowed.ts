/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM ADMIN (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// claims
export function getClaimsClaimRefBusinessNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.claim_ref, b.name AS business_name, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', params);
}

// register_file_imports
export function getRegisterFileImportsImportedAtRowsKeptBySourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(`SELECT i.imported_at, i.rows_kept, i.rows_skipped, u.display_name AS who FROM register_file_imports i LEFT JOIN users u ON u.id = i.by_user
    WHERE i.source_id = ? ORDER BY i.imported_at DESC, i.rowid DESC LIMIT 1`, params);
}
export function listSavedKeysNameSealedByRowidName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.name, k.sealed, k.set_at, u.display_name AS who FROM saved_keys k LEFT JOIN users u ON u.id = k.set_by ' +
    'WHERE k.rowid = (SELECT max(x.rowid) FROM saved_keys x WHERE x.name = k.name) ORDER BY k.name', params);
}
