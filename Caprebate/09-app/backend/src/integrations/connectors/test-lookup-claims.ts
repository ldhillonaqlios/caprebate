/**
 * WHAT THE TEST LOOKUPS ASK THE CLAIMS (Phase 161l2): every property's postcode, every point and council a person
 * entered for a property (so a test value that is somebody's is refused: src/integrations/connectors/test-lookups.ts,
 * clientMatchIn and boundaryClientMatchIn), and one read of the invented page by the claims' document reader (the
 * pipeline's strip and guard, then src/modules/claims/document-reader-claude.ts).
 *
 * A PORT THIS FILE OWNS: the claims hand their reads in as their front door loads
 * (src/modules/claims/test-lookup-claims.ts), so the outside services import nothing of a business module and the test
 * lookups load through the outside services' door. The statements are the claims' own, unchanged. Asked before it is
 * handed in, it refuses rather than guess (the client checks then refuse too: not knowing is not a pass). Declared with
 * `var`, so a hand-in that comes while this file is still loading is kept.
 */
import type { Db } from '../../core/index.ts';
import type { CallResult } from './http.ts';
import type { ClaudeContext, ReadState } from './claude.ts';

/** A section of a document, as the claims' pipeline takes it (its kind is checked there, against the document type). */
export type TestSegment = { readonly kind: string; readonly heading: string; readonly text: string; readonly page: number };

/** What the test lookup says of a reading: the state, why, which model answered, and the call. */
export type TestPageRead = { readonly state: ReadState; readonly why: string; readonly model: string | null; readonly call: CallResult | null };

export type TestLookupClaims = {
  readonly propertyPostcodes: (db: Db) => { postcode: string | null }[];
  readonly siteAreaPoints: (db: Db) => { easting: number | null; northing: number | null }[];
  readonly siteAreaCouncils: (db: Db) => { lad_code: string | null }[];
  readonly readTestPage: (ctx: ClaudeContext, doc_id: string, doc_type: string, page: readonly TestSegment[]) => Promise<TestPageRead>;
};
var claims: TestLookupClaims | undefined;
export function setTestLookupClaimsReader(c: TestLookupClaims): void { claims = c; }

/** The claims' reads for the test lookups. Refuses before the hand-in. */
export function testLookupClaims(): TestLookupClaims {
  if (claims === undefined) throw new Error('The claims are not set up. They set this up when they load, so nothing was compared or read.');
  return claims;
}
