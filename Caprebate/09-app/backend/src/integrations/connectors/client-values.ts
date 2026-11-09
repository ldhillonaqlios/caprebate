/**
 * WHAT THE TEST LOOKUPS ASK THE CLIENT RECORD (Phase 161l1): every organisation's name, legal name and company number,
 * and every lead's organisation and postcode, so a test value that is somebody's is refused
 * (src/integrations/connectors/test-lookups.ts, clientMatchIn). A PORT THIS FILE OWNS: the client record
 * (src/modules/clients/client-values.ts) hands its two reads in as its front door loads, so the outside services import
 * nothing of a business module. The statements are the client record's own, unchanged. Asked before it is handed in,
 * it refuses rather than guess, and the test lookup then refuses too. Declared with `var`, so a hand-in that comes while
 * this file is still loading is kept.
 */
import type { Db } from '../../core/index.ts';

export type ClientValues = {
  readonly businesses: { name: string | null; legal_name: string | null; company_number: string | null }[];
  readonly leads: { prospect_organisation: string | null; prospect_postcode: string | null }[];
};
var clientValuesOf: ((db: Db) => ClientValues) | undefined;
export function setClientValuesReader(read: (db: Db) => ClientValues): void { clientValuesOf = read; }

/** Every organisation's and every lead's values, as the test lookups compare them. Refuses before the hand-in. */
export function clientValues(db: Db): ClientValues {
  if (clientValuesOf === undefined) throw new Error('The client record is not set up. It sets this up when it loads, so nothing was compared.');
  return clientValuesOf(db);
}
