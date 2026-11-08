/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE INTEGRATIONS (Phase 161i1, 8 Nov 2026; 09-app/ARCHITECTURE.md rules 3
 * and 4). These statements were in integrations's page and logic files, which may not run SQL (rule 4). They read or write
 * tables a business area owns, so they still go against rule 3 (each counted against the table's owner), and Phase
 * 161l (the tangle undone) moves each one to its owner's data file, reached through that owner's front door or an
 * event. Nothing new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../core/index.ts';

// businesses
export function getBusinessesCountByClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM businesses WHERE client_status = 'DO_NOT_CONTACT' AND lower(contact_email) = lower(?)", params);
}
export function getBusinessesCountByIdClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM businesses WHERE id = ? AND client_status = 'DO_NOT_CONTACT'", params);
}
export function getBusinessesNameLegalNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name, legal_name, company_number, sector FROM businesses WHERE id = ?', params);
}
export function listBusinessesNameLegalName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT name, legal_name, company_number FROM businesses', params);
}

// contacts
export function getContactsCountByClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM contacts c JOIN businesses b ON b.id = c.business_id ' +
    "WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(?)", params);
}

// email_sender
export function getEmailSenderDisplayNameAddress<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT display_name, address, reply_to FROM email_sender ORDER BY rowid DESC LIMIT 1', params);
}

// leads
export function listLeadsProspectOrganisationProspectPostcode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT prospect_organisation, prospect_postcode FROM leads', params);
}

// properties
export function getPropertiesIdAddressLine1ByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, address_line_1, address_line_2, town, postcode, jurisdiction, uprn FROM properties WHERE business_id = ? ' +
    'ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getPropertiesIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE id = ? AND business_id = ?', params);
}
export function listPropertiesPostcode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT postcode FROM properties', params);
}

// site_area_inputs
export function listSiteAreaInputsEastingNorthingByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT easting, northing FROM site_area_inputs WHERE kind = 'POINT'", params);
}
export function listSiteAreaInputsLadCodeByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT lad_code FROM site_area_inputs WHERE kind = 'NEIGHBOUR_COUNCIL'", params);
}

// users
export function getUsersCountByClientStatusEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users u JOIN businesses b ON b.id = u.business_id ' +
    "WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(?)", params);
}
