/**
 * ENERGY CERTIFICATES — FLOOR AREA AND BUILDING TYPE FROM THE ENGLAND AND WALES REGISTER.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.EPC is false.
 *
 * Built against the "Get energy performance of buildings data" service's API documentation and its OpenAPI file
 * (read 23 September 2026; the addresses and date are in the source register's SUPPLIER_DOCS). Base
 * https://api.get-energy-performance-data.communities.gov.uk, a bearer token from the key file's EPC_API_TOKEN, and our
 * own limit half the published 6,000 requests in 5 minutes. The register covers "buildings in England and Wales"
 * only, so a property elsewhere, or one whose nation nobody recorded, is not asked about.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE LOOKUP (the S10 spec's energy certificate profile, A.8)
 *
 *   1. /api/non-domestic/search and /api/display/search on the typed postcode — and, for supported living only,
 *      /api/domestic/search too, because those buildings are often dwellings. One search per register, no widening to
 *      a neighbouring postcode. "No certificates found" is a 404, and it means no candidates, not an error.
 *   2. The candidates' four address lines are split by the same mapper as the typed address and scored
 *      (src/connectors/matching.ts). Certificates at the same address count as one, and the latest is the one fetched.
 *      Only one clear ACCEPT goes on; anything else leaves the questions asked.
 *   3. /api/certificate?certificate_number=… for the accepted one. A search result carries no floor area and no
 *      building type — only the certificate does.
 *
 * WHAT IS KEPT: the floor area, the building type (a non-domestic certificate's `property_type`, a domestic one's
 * `dwelling_type`), the date it was registered, and its number. NOT KEPT: any address line (the register's addresses
 * are under an Ordnance Survey and Royal Mail notice), the UPRN, the energy assessor (a person), and the domestic
 * construction age band and tenure, which the register gives as codes this build does not decode — an undecoded code
 * is not a fact, so those two questions stay asked.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type LookupResult, type StepRequest } from './registers.ts';
import { addressFromLines, matchAddress, MATCH_THRESHOLDS, postcodeKey, type Candidate, type MeasureHook } from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';

export type EpcQuery = {
  readonly property: TypedProperty | null; readonly nation: Nation | null; readonly sector: string | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
};

export type EpcRegister = 'non-domestic' | 'display' | 'domestic';

/** Which registers a lookup searches for a sector: domestic only for supported living. */
export function registersFor(sector: string | null): readonly EpcRegister[] {
  return sector === 'supported_living' ? ['non-domestic', 'display', 'domestic'] : ['non-domestic', 'display'];
}

type Hit = { readonly certificate_number: string; readonly registered: string; readonly register: EpcRegister };

const bearer = (s: OwnerSecrets | null): Record<string, string> => ({ authorization: `Bearer ${s?.get('EPC_API_TOKEN') ?? ''}` });

function json(body: string | null): Record<string, unknown> | null {
  if (body === null) return null;
  try {
    const v = JSON.parse(body) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** A floor area the certificate states as a positive number, or null. Never 0 for absent (N4). */
function area(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The permitted fields from one certificate's `data`. */
export function certificateFields(data: Record<string, unknown>, hit: Hit): Record<string, unknown> {
  const f: Record<string, unknown> = { epc_rrn: hit.certificate_number };
  const floor = hit.register === 'domestic' ? area(data['total_floor_area']) : area(obj(data['technical_information'])?.['floor_area']);
  if (floor !== null) f.epc_total_floor_area_m2 = floor;
  const type = hit.register === 'domestic' ? str(data['dwelling_type']) : str(data['property_type']);
  if (type !== null) f.epc_property_type = type;
  const registered = str(data['registration_date']) ?? hit.registered;
  if (/^\d{4}-\d{2}-\d{2}/.test(registered)) f.epc_lodgement_date = registered.slice(0, 10);
  return f;
}

export const epc = defineSteppedConnector<EpcQuery>({
  source_id: 'EPC', service_id: 'EPC', owner: 'EPC', needs: ['EPC_API_TOKEN'],
  first: (q, s) => ({ endpoint: '/api/non-domestic/search', query: { postcode: postcodeKey(q.property?.postcode), page_size: '100' }, headers: bearer(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    if (q.nation === null) return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in. These energy records are for England and Wales only' };
    if (jurisSource(q.nation, 'epc') !== 'EPC') return { kind: 'NOT_COVERED', why: 'the property is not in England or Wales. These energy records are for those two only' };
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };

    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => { const c = await step({ ...r, headers: bearer(secrets) }); calls.push(c); return c; };

    const candidates: Candidate<Hit>[] = [];
    for (const register of registersFor(q.sector)) {
      const c = await call({ endpoint: `/api/${register}/search`, query: { postcode: pc, page_size: '100' } });
      if (c.status === 404) continue; // "No certificates found": no candidates, not an error.
      if (c.outcome !== 'OK' || c.body === null) return { kind: 'CALL_FAILED', call: c, calls };
      const body = json(c.body);
      if (body === null || !Array.isArray(body['data'])) return { kind: 'UNREADABLE', call: c, calls };
      for (const row of body['data'] as unknown[]) {
        const r = obj(row);
        const number = str(r?.['certificateNumber']);
        if (r === null || number === null) continue;
        candidates.push({
          address: addressFromLines([str(r['addressLine1']), str(r['addressLine2']), str(r['addressLine3']), str(r['addressLine4'])], str(r['postcode']), str(r['postTown'])),
          payload: { certificate_number: number, registered: str(r['registrationDate']) ?? '', register },
        });
      }
    }
    const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
    const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.EPC, 'the energy certificate register',
      (a, b) => (b.registered > a.registered ? b : a));
    q.measure?.({ profile: 'EPC', register: registersFor(q.sector).join('+'), match: m, top_address: m.top?.candidate.address ?? null });
    if (m.status !== 'ACCEPT' || m.best === null) {
      return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls };
    }
    const hit = m.best.candidate.payload;
    const cert = await call({ endpoint: '/api/certificate', query: { certificate_number: hit.certificate_number } });
    if (cert.outcome !== 'OK' || cert.body === null) return { kind: 'CALL_FAILED', call: cert, calls };
    const data = obj(json(cert.body)?.['data']);
    if (data === null) return { kind: 'UNREADABLE', call: cert, calls };
    const fields = certificateFields(data, hit);
    const got = fields['epc_total_floor_area_m2'] === undefined ? ' It gives no floor area, so that question stays asked.' : '';
    return {
      kind: 'READ', calls,
      bundle: { records: [{ sourceId: 'EPC', entityId: hit.certificate_number, fields }], facts: fields },
      note: `looked up — ${m.why}, and we keep the certificate’s figures and where they came from.${got}`,
    };
  },
});
