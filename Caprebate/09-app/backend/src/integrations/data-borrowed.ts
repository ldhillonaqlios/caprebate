/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE INTEGRATIONS (Phase 161i1; 09-app/ARCHITECTURE.md rules 3
 * and 4). These statements were in integrations's page and logic files, which may not run SQL (rule 4). They read or write
 * tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
 * 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
 * event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../core/index.ts';

// email_sender
export function getEmailSenderDisplayNameAddress<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT display_name, address, reply_to FROM email_sender ORDER BY rowid DESC LIMIT 1', params);
}

// users
export function getUsersCountByClientStatusEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users u JOIN businesses b ON b.id = u.business_id ' +
    "WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(?)", params);
}
