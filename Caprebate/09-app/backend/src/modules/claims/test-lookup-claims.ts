/**
 * WHAT THE TEST LOOKUPS ASK THE CLAIMS, handed in to the port the outside services own
 * (src/integrations/connectors/test-lookup-claims.ts) as the claims' front door loads: every property's postcode, every
 * point and council a person entered for a property, and one read of an invented page by the document reader (the
 * pipeline's strip and guard first, exactly as a client's document). The statements are the claims' own (data.ts),
 * unchanged.
 */
import { setTestLookupClaimsReader } from '../../integrations/index.ts';
import { listPropertiesPostcode, listSiteAreaInputsEastingNorthingByKind, listSiteAreaInputsLadCodeByKind } from './data.ts';
import { sanitise, type DocType, type Segment } from './documents/document-pipeline.ts';
import { readPayloadWithClaude } from './document-reader-claude.ts';

setTestLookupClaimsReader({
  propertyPostcodes: (db) => listPropertiesPostcode<{ postcode: string | null }>(db),
  siteAreaPoints: (db) => listSiteAreaInputsEastingNorthingByKind<{ easting: number | null; northing: number | null }>(db),
  siteAreaCouncils: (db) => listSiteAreaInputsLadCodeByKind<{ lad_code: string | null }>(db),
  readTestPage: async (ctx, doc_id, doc_type, page) => {
    const { payload } = sanitise(doc_id, doc_type as DocType, page as readonly Segment[]);
    return (await readPayloadWithClaude(ctx, payload)).read;
  },
});
