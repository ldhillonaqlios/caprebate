/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM COMPLIANCE (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// cdd_beneficial_owners
export function listCddBeneficialOwnersIdContactIdByCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.contact_id, c.full_name AS contact, o.basis_of_control, o.identified_from, o.psc_decision_id, o.verified_how ' +
    'FROM cdd_beneficial_owners o JOIN contacts c ON c.id = o.contact_id WHERE o.check_id = ? ORDER BY o.recorded_at', params);
}

// cdd_checks
export function listCddChecksIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.business_id, b.name AS organisation, k.claimant_type, k.state, k.completed_at FROM cdd_checks k JOIN businesses b ON b.id = k.business_id ' +
    'ORDER BY k.created_at DESC LIMIT 500', params);
}

// identity_checks + contacts: who sent each is the core's (identity-checks.ts asks the core's front door)
export function listIdentityChecksIdContactByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, i.sent_by FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id WHERE i.business_id = ? ORDER BY i.sent_at DESC', params);
}
export function listIdentityChecksIdContactByCddCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, i.sent_by FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id WHERE i.cdd_check_id = ? ORDER BY i.sent_at DESC', params);
}

// rights_requests
export function getRightsRequestsRefReceivedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.request_ref AS ref, r.received_at, c.business_id FROM rights_requests r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.id = ?', params);
}

// The retention list's record kinds on the CRM's tables (compliance-identity.ts RECORD_KINDS): each kind's count, text
// unchanged. The other kinds' counts are their owners' (compliance-identity.ts says whose); a kind not here reads nothing.
const RECORD_KIND_STATEMENTS: Readonly<Record<string, string>> = Object.freeze({
  LEADS_NEVER_CONVERTED: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'",
  LEAD_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL',
  STAFF_TASKS: 'SELECT COUNT(*) AS n FROM staff_tasks',
  LEAD_FOLLOW_UP_TASKS: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'",
  AUTOMATION_RUNS: 'SELECT COUNT(*) AS n FROM automation_runs',
  INTRODUCERS: 'SELECT COUNT(*) AS n FROM introducers',
  INTRODUCER_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL',
  SHARE_CONSENTS: 'SELECT COUNT(*) AS n FROM introducer_share_consents',
  INTRODUCER_NOTICES: 'SELECT COUNT(*) AS n FROM introducer_notices',
  CLIENT_MESSAGE: 'SELECT COUNT(*) AS n FROM client_messages',
  TEAM_MESSAGE: 'SELECT COUNT(*) AS n FROM internal_notes',
});
export function countCrmRecordKind<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T | undefined {
  const sql = RECORD_KIND_STATEMENTS[kind];
  return sql === undefined ? undefined : db.get<T>(sql, params);
}
