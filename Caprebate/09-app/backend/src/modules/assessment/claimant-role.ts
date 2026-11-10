/**
 * HOW THE CLIENT HOLDS THE BUILDING, AS THE ASSESSMENT HEARS IT (Phase 161l2, moved from src/modules/assessment/who-claims.ts
 * unchanged when that file moved up to the claims, src/modules/claims/who-claims.ts). The assessment writes the role on
 * each property it opens; the claims read it back and say whose claim it is.
 */

export type ClaimantRole = 'OWNER_OCCUPIER' | 'LANDLORD' | 'TENANT';

/** The assessment's answer to "who uses the building?", onto the property's claimant role. "Not sure" is not known. */
export const USE_TO_ROLE: Readonly<Record<string, ClaimantRole>> = Object.freeze({ own_use: 'OWNER_OCCUPIER', let_out: 'LANDLORD', rented: 'TENANT' });
