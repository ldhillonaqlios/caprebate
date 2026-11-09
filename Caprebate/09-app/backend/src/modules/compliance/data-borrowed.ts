/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM COMPLIANCE (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// aml_officers
export function listAmlOfficersIdOffice<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.office, u.display_name AS who, o.appointed_on, o.ended_on, o.source FROM aml_officers o JOIN users u ON u.id = o.user_id ORDER BY o.appointed_on DESC', params);
}

// audit_log
export function getAuditLogCountByObjectId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM audit_log a WHERE ' +
    '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
    'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
    "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
    "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) ", params);
}

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

// disclosure_log
export function listDisclosureLogIdRecipientByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.recipient, d.data_categories, d.occasion, d.route, d.lawful_basis, d.disclosed_at, d.corrects_id, u.display_name AS recorder ' +
    'FROM disclosure_log d JOIN users u ON u.id = d.recorded_by WHERE d.business_id = ? ORDER BY d.disclosed_at ASC, d.recorded_at ASC', params);
}

// identity_checks
export function listIdentityChecksIdContactByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.business_id = ? ORDER BY i.sent_at DESC', params);
}
export function listIdentityChecksIdContactByCddCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.cdd_check_id = ? ORDER BY i.sent_at DESC', params);
}

// identity_persons
export function getIdentityPersonsPersonRefNameByPersonRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT p.person_ref, p.name, p.role, p.contact_route, p.contact_route_kind, p.doc_id, p.notice_template, p.notice_route, p.notice_sent_on, p.notice_published_too, ' +
    'p.exemption_article, p.exemption_reason, d.type_code AS doc_type, d.created_at AS doc_created, d.retention_ref ' +
    'FROM identity_persons p JOIN documents d ON d.id = p.source_record_ref WHERE p.person_ref = ?', params);
}

// rights_requests
export function getRightsRequestsRefReceivedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.request_ref AS ref, r.received_at, c.business_id FROM rights_requests r LEFT JOIN contacts c ON c.id = r.contact_id WHERE r.id = ?', params);
}

// audit_log + users (+ claims and properties for one client): the audit log page's lines, with or without a client filter;
// the caller chose between the two statements, and the choice moved here with the text.
export function listAuditLogLines<T extends Row = Row>(db: Db, byClient: boolean, params: readonly Param[] = []): T[] {
  return db.all<T>(
    !byClient
      ? 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
        'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) ORDER BY a.seq DESC LIMIT ?'
      : 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
        'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) AND ' +
        '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
        'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
        "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
        "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) " +
        'ORDER BY a.seq DESC LIMIT ?',
    params,
  );
}

// The retention list's record kinds (compliance-identity.ts RECORD_KINDS): each kind's count, and the rows with the moment
// its clock starts where the determination gives one this build records. Most are other areas' tables; text unchanged.
const RECORD_KIND_STATEMENTS: Readonly<Record<string, { count: string; clockRows: string | null }>> = Object.freeze({
  RIGHTS_REQUESTS: { count: 'SELECT COUNT(*) AS n FROM rights_requests', clockRows: null },
  COMPLAINTS: { count: 'SELECT COUNT(*) AS n FROM complaints', clockRows: 'SELECT id, outcome_notified_at AS starts FROM complaints' },
  BREACH_INCIDENTS: { count: 'SELECT COUNT(*) AS n FROM breach_incidents', clockRows: 'SELECT id, closed_at AS starts FROM breach_incidents' },
  IDENTITY_PERSON: { count: 'SELECT COUNT(*) AS n FROM identity_persons', clockRows: null },
  IDENTITY_SEARCH_LOG: { count: 'SELECT COUNT(*) AS n FROM identity_search_log', clockRows: null },
  DOCUMENT_VERSIONS: { count: 'SELECT COUNT(*) AS n FROM documents WHERE logical_document_id IS NOT NULL', clockRows: null },
  LOGICAL_DOCUMENTS: { count: 'SELECT COUNT(*) AS n FROM logical_documents', clockRows: null },
  DOCUMENT_LINKS: { count: 'SELECT COUNT(*) AS n FROM document_links', clockRows: null },
  DELETION_LOG: { count: 'SELECT COUNT(*) AS n FROM deletion_log', clockRows: null },
  REGISTER_RECORDS: { count: 'SELECT COUNT(*) AS n FROM register_records', clockRows: null },
  LEADS_NEVER_CONVERTED: { count: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'", clockRows: null },
  LEAD_PEOPLE: { count: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL', clockRows: null },
  STAFF_TASKS: { count: 'SELECT COUNT(*) AS n FROM staff_tasks', clockRows: null },
  LEAD_FOLLOW_UP_TASKS: { count: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'", clockRows: null },
  AUTOMATION_RUNS: { count: 'SELECT COUNT(*) AS n FROM automation_runs', clockRows: null },
  OUTBOX_QUEUED: { count: "SELECT COUNT(*) AS n FROM outbox WHERE kind IN ('NOTIFICATION','TEMPLATE','COMPLIANCE_LETTER')", clockRows: null },
  INTRODUCERS: { count: 'SELECT COUNT(*) AS n FROM introducers', clockRows: null },
  INTRODUCER_PEOPLE: { count: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL', clockRows: null },
  SHARE_CONSENTS: { count: 'SELECT COUNT(*) AS n FROM introducer_share_consents', clockRows: null },
  INTRODUCER_NOTICES: { count: 'SELECT COUNT(*) AS n FROM introducer_notices', clockRows: null },
  CONSENT_ANSWERS: { count: 'SELECT COUNT(*) AS n FROM consent_answers', clockRows: null },
  CLIENT_MESSAGE: { count: 'SELECT COUNT(*) AS n FROM client_messages', clockRows: null },
  TEAM_MESSAGE: { count: 'SELECT COUNT(*) AS n FROM internal_notes', clockRows: null },
  CDD_RECORDS: { count: 'SELECT COUNT(*) AS n FROM cdd_checks', clockRows: null },
});
export function countRecordKind<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T | undefined {
  const s = RECORD_KIND_STATEMENTS[kind];
  return s === undefined ? undefined : db.get<T>(s.count, params);
}
export function recordKindHasClock(kind: string): boolean {
  return (RECORD_KIND_STATEMENTS[kind]?.clockRows ?? null) !== null;
}
export function listRecordKindClockRows<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T[] {
  const sql = RECORD_KIND_STATEMENTS[kind]?.clockRows ?? null;
  return sql === null ? [] : db.all<T>(sql, params);
}
