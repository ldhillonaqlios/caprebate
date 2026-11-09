/**
 * WHO MAY ENTER THE CRM BACKBONE'S SECTIONS — organisations, properties, claims and the pipeline board.
 *
 * The gates are kept apart from the rules in src/modules/crm/crm.ts so a change to who may open a section is made in
 * one small file. Every view and write in crm.ts still authorises on its own object as well; these gates only decide
 * whether a login may enter the section at all.
 */
import { authorise, type Actor } from '../../core/index.ts';

/* ================================================================== *
 * THE SECTION GATES
 * ================================================================== */

const SECTION = '__crm_section__';

/** Organisations: ADMIN and SALES. A sentinel business, refused to everyone else by the table. */
export function assertOrganisationSection(actor: Actor): void {
  authorise(actor, 'organisation.read', { type: 'business', id: SECTION });
}

/** Properties: its own action, because SURVEYING reaches a property through a job. */
export function assertPropertySection(actor: Actor): void {
  authorise(actor, 'property.enter', { type: 'property', id: SECTION, business_id: SECTION, assigned_surveyor_ids: [] });
}

/** Claims: its own action, for the same reason, and ACCOUNTING is on it. */
export function assertClaimSection(actor: Actor): void {
  authorise(actor, 'claim.enter', { type: 'claim', id: SECTION, business_id: SECTION, assigned_surveyor_ids: [] });
}

/**
 * THE GATE OF THE PIPELINE BOARD, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function pipelineBoardGate(actor: Actor): void {
  authorise(actor, 'pipeline.read', { type: 'pipeline', id: '__pipeline__' });
}
