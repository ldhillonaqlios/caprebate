/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CORE (Phase 161i1; 09-app/ARCHITECTURE.md rules 3
 * and 4). These statements were in core's page and logic files, which may not run SQL (rule 4). They read or write
 * tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
 * 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
 * event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from './db.ts';

// assessments
export function getAssessmentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
    'a.shown_low_pence, a.shown_high_pence ' +
    'FROM assessments a JOIN businesses b ON b.id = a.business_id WHERE a.id = ?', params);
}
export function listAssessmentsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
    'a.shown_low_pence, a.shown_high_pence ' +
    'FROM assessments a JOIN businesses b ON b.id = a.business_id ' +
    'ORDER BY a.submitted_at DESC, a.id DESC LIMIT ?', params);
}
export function listBookingChangesFromStartsAtToStartsAtByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.from_starts_at, c.to_starts_at, u.display_name AS changed_by_name, c.at, c.cancelled ' +
    'FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by ' +
    'WHERE c.booking_id = ? ORDER BY c.at ASC', params);
}
export function listSavedKeysNameSealedByRowidName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.name, k.sealed, k.set_at, u.display_name AS who FROM saved_keys k LEFT JOIN users u ON u.id = k.set_by ' +
    'WHERE k.rowid = (SELECT max(x.rowid) FROM saved_keys x WHERE x.name = k.name) ORDER BY k.name', params);
}

// users
export function listUsersIdDisplayNameByDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT u.id, u.display_name FROM users u JOIN working_times w ON w.user_id = u.id ' +
    'WHERE u.disabled_at IS NULL ORDER BY u.display_name ASC', params);
}

// search (src/core/search.ts): the fixed statements, moved with their notes
const ORGANISATIONS_ALL =
  'SELECT b.id, b.name, b.legal_name, b.sector FROM businesses b ' +
  "WHERE lower(b.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.legal_name, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(b.company_number, '')) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, b.id ASC LIMIT 25";

const PROSPECTS_ALL =
  'SELECT l.id, l.prospect_organisation FROM leads l ' +
  "WHERE l.business_id IS NULL AND lower(COALESCE(l.prospect_organisation, '')) LIKE ? ESCAPE '\\' " +
  'ORDER BY l.lead_date DESC, l.id ASC LIMIT 25';

/** The client's own contacts, and a prospect's — never a person at an introducing firm. */
const CONTACTS_ALL =
  'SELECT c.id, c.full_name, c.business_id, c.lead_id, b.name AS business_name FROM contacts c ' +
  'LEFT JOIN businesses b ON b.id = c.business_id WHERE c.introducer_id IS NULL ' +
  "AND (lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\') " +
  'ORDER BY c.full_name ASC, c.id ASC LIMIT 25';

const PROPERTIES_ALL =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  "WHERE lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\' ORDER BY p.label ASC, p.id ASC LIMIT 25";

const PROPERTIES_ASSIGNED =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  'WHERE EXISTS (SELECT 1 FROM surveyor_jobs j WHERE j.business_id = p.business_id AND j.surveyor_id = ?) ' +
  "AND (lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\') ORDER BY p.label ASC, p.id ASC LIMIT 25";

// A claim is found by its reference AND by its company's name, and is named by its company and property.
const CLAIMS_ALL =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  "WHERE lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

const CLAIMS_ASSIGNED =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  'WHERE EXISTS (SELECT 1 FROM surveyor_jobs j WHERE j.claim_id = c.id AND j.surveyor_id = ?) ' +
  "AND (lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\') ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

/**
 * An invoice by its number — CB-000123, 000123 or 123 — or by the start of it as it is printed: "CB-0", "CB-00012". Never
 * by an amount. The CRM follow-on added the prefix: a whole number was the only thing that found anything.
 */
const INVOICES_ALL =
  'SELECT n.seq, i.id, i.business_id, c.claim_ref, b.name AS business_name FROM invoice_numbers n ' +
  'JOIN invoices i ON i.id = n.invoice_id JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id ' +
  "WHERE n.kind = 'INVOICE' AND (n.seq = ? OR printf('%06d', n.seq) LIKE ?) ORDER BY n.seq ASC LIMIT 25";

const NOTES_ALL =
  'SELECT n.id, n.business_id, n.claim_id, n.property_id, substr(n.body, 1, 160) AS snippet, b.name AS business_name ' +
  'FROM internal_notes n JOIN businesses b ON b.id = n.business_id ' +
  "WHERE lower(n.body) LIKE ? ESCAPE '\\' ORDER BY n.created_at DESC, n.id ASC LIMIT 25";

export function searchOrganisations<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(ORGANISATIONS_ALL, params);
}
export function searchProspects<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROSPECTS_ALL, params);
}
export function searchContacts<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CONTACTS_ALL, params);
}
export function searchProperties<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_ALL, params);
}
export function searchPropertiesAssigned<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_ASSIGNED, params);
}
export function searchClaims<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_ALL, params);
}
export function searchClaimsAssigned<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_ASSIGNED, params);
}
export function searchInvoices<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(INVOICES_ALL, params);
}
export function searchNotes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTES_ALL, params);
}

/**
 * EVERY STATEMENT SEARCH CAN RUN, exported so test/search.test.ts can assert that none of them names the identity
 * store, a compliance register, a document's content or the estimate. The prose at the top of this file names those
 * tables on purpose, so the test reads these and not the source text.
 */
export const SEARCH_STATEMENTS: readonly string[] = Object.freeze([
  ORGANISATIONS_ALL, PROSPECTS_ALL, CONTACTS_ALL, PROPERTIES_ALL, PROPERTIES_ASSIGNED, CLAIMS_ALL, CLAIMS_ASSIGNED, INVOICES_ALL, NOTES_ALL,
]);
// bookings (src/core/backoffice.ts, the calendar): the statement, moved with its note
/*
 * LEFT JOINS, AND THAT IS PART OF THE GATED-EXIT REPAIR. This was an inner join
 * onto `businesses`, so a booking with no organisation — a call asked for at the
 * reasoned negative (migration 011) — would have been recorded and then vanished
 * from the calendar's queue, invisible to the people who have to make the call.
 */
const BOOKING_SELECT =
  'SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, ' +
  'k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, ' +
  'k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role ' +
  'FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id ' +
  'LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to ' +
  'LEFT JOIN users cu ON cu.id = k.cancelled_by ';
export function listBookingsScheduled<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(
    BOOKING_SELECT + 'WHERE k.starts_at IS NOT NULL AND k.starts_at >= ? AND k.starts_at < ? ' +
      'ORDER BY k.starts_at ASC',
    params,
  );
}
export function listBookingsWithNoTime<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(BOOKING_SELECT + 'WHERE k.starts_at IS NULL AND k.cancelled_at IS NULL ORDER BY k.created_at ASC');
}
export function listBookingsCancelled<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(BOOKING_SELECT + 'WHERE k.cancelled_at IS NOT NULL ORDER BY k.cancelled_at DESC LIMIT 100');
}
export function getBookingById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(BOOKING_SELECT + 'WHERE k.id = ?', params);
}
