/**
 * THE ONS POSTCODE TABLE — A PROPERTY'S COUNCIL AREA (ITS BILLING AUTHORITY) AND WHICH PART OF THE UK IT IS IN.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.ONS_POSTCODE is false.
 *
 * NO CALL OUTSIDE. The ONS Postcode Directory is a free quarterly download (August 2026 is the current release,
 * checked 23 September 2026; the address is in the source register's SUPPLIER_DOCS) that the developer loads into a
 * table on this server (Phase 110: src/web/postcode.ts, CAPREBATE_POSTCODE_DB). This connector reads that table through
 * `resolveProperty`, the one reader, and re-implements nothing: NORTHERN IRELAND IS REFUSED there (a BT postcode needs a
 * separate commercial licence from Land and Property Services), a postcode we do not serve is refused there, and a
 * terminated postcode is refused there. With no table set up, the lookup is not made and says so.
 *
 * It runs FIRST on a click, because its answer — which part of the UK the postcode is in, and the council area's name
 * — is what the energy certificate, sale price and planning lookups need when nobody recorded the nation, and what the
 * care regulator's search needs at all (it cannot be searched by postcode).
 *
 * NOTHING IS STORED IN register_records. The name exclusion register has no entry for this source, and the one door
 * refuses a source it does not know; the council area is recomputed from the table whenever a screen needs it
 * (src/web/postcode.ts). The research panel keeps the council area's name in its words.
 */

import { defineSteppedConnector, type LookupResult } from './registers.ts';
import { resolveProperty } from '../web/postcode.ts';
import type { PostcodeStore } from '../web/postcode-port.ts';

export type PostcodeQuery = { readonly postcode: string | null; readonly store: PostcodeStore | null };

export const onsPostcode = defineSteppedConnector<PostcodeQuery>({
  source_id: 'ONS_POSTCODE', service_id: 'ONS_POSTCODE', owner: null, needs: [],
  // Never used: this lookup makes no call. A call to this name is refused by src/connectors/http.ts, which lists no
  // such service.
  first: () => ({ endpoint: '/none' }),
  async lookup(_step, q): Promise<LookupResult> {
    if (q.store === null) return { kind: 'NOT_COVERED', why: 'the ONS postcode table is not set up here yet' };
    if (q.postcode === null || q.postcode.trim() === '') {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode recorded for the property', calls: [] };
    }
    const r = resolveProperty(q.postcode, { store: q.store });
    if (r.authority === null) {
      // The resolver's own refusals are written for a developer. The panel gets plain words, keyed on which it was.
      if (/northern ireland/i.test(r.why)) return { kind: 'NOT_COVERED', why: 'the postcode is in Northern Ireland, which our postcode table may not be used for' };
      if (/OUTSIDE THE PART OF THE UK/.test(r.why)) return { kind: 'NOT_COVERED', why: 'the postcode is in a part of the UK we do not cover yet' };
      if (/terminated/i.test(r.why)) return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'the postcode is no longer in use, so the council area must be checked by a person', calls: [] };
      if (/shape|length|required/i.test(r.why)) return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'the postcode on the record is not one we can read', calls: [] };
      return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'the postcode is not in the ONS postcode table', calls: [] };
    }
    const a = r.authority;
    const facts = { ons_lad_code: a.lad_code, ons_lad_name: a.lad_name, ons_country_code: a.country_code, ...(a.terminated_on === null ? {} : { ons_postcode_terminated_on: a.terminated_on }) };
    return {
      kind: 'READ', calls: [], bundle: { records: [], facts },
      note: `looked up in the ONS postcode table on this server${a.release === null ? '' : ` (release ${a.release})`} — the council area is ${a.lad_name}. Nothing was sent outside`,
    };
  },
});
