/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM ADMIN (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { listClaimsIdBusinessIdStageClaimRefByIds } from '../claims/index.ts';

/*
 * Phase 161l1: what is left here reads the CRM's businesses, which sit above admin in the order (for the CRM's own
 * split). The claim itself is read through the claims' front door; the users and the register imports went to their
 * owners (the core's fillUsers; the outside services' data file).
 */

// claims
export function getClaimsClaimRefBusinessNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = listClaimsIdBusinessIdStageClaimRefByIds<{ business_id: string; claim_ref: unknown; property_id: unknown }>(db, [JSON.stringify([params[0]])])[0];
  if (c === undefined) return undefined;
  const b = db.get<{ name: unknown }>('SELECT b.name FROM businesses b WHERE b.id = ?', [c.business_id]);
  return b === undefined ? undefined : ({ claim_ref: c.claim_ref, business_name: b.name, property_id: c.property_id } as Row as T);
}
