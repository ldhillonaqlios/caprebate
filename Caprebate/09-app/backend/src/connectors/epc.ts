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
 * ───────────────────────────────────────────────────────────────────────────
 * A UPRN IS AN EXACT KEY, AND A POSTCODE IS NOT (Phase 146d, item 9)
 *
 * Steps 1 and 2 above exist because a postcode search returns every certificate in the postcode and we then have to
 * work out which one is our client's, by splitting addresses and scoring them at thresholds nobody has measured.
 * That is the weakest link in this lookup and it is the reason its grade is capped.
 *
 * The energy certificate service also searches BY UPRN — its own documentation lists `uprn` beside `postcode` and
 * `address` as a search parameter. A UPRN is Ordnance Survey's identifier for one addressable property, so a search
 * on it returns that property's certificates and nobody else's. WHERE WE HAVE ONE, IT IS TREATED AS AN EXACT KEY:
 * no scoring, no threshold, no REVIEW — exactly as a company number already is for Companies House, where a number
 * on the client's record means no name search is made at all. The address is still read, because the certificate is
 * still fetched by its number, but the CHOICE of certificate is no longer a guess.
 *
 * WHERE A UPRN SEARCH FINDS NOTHING, THE LOOKUP DOES NOT FALL BACK TO THE POSTCODE. A UPRN that returns no
 * certificate means this property has none — that is an answer, and a good one. Widening to the postcode after it
 * would be choosing a weaker key because the stronger one told us something we did not want to hear, which is how a
 * neighbour's certificate ends up in a client's claim file.
 *
 * WHAT IS KEPT: the floor area, the building type (a non-domestic certificate's `property_type`, a domestic one's
 * `dwelling_type`), the date it was registered, its number, and — since Phase 146h — the construction age band and
 * the tenure of a DOMESTIC certificate, DECODED. NOT KEPT: any address line (the register's addresses are under an
 * Ordnance Survey and Royal Mail notice), the UPRN and the energy assessor (a person).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE DOMESTIC CERTIFICATE'S CODES (Phase 146h, item 2, 23 September 2026)
 *
 * A domestic certificate does not spell out its construction age band or its tenure. It gives each as a CODE: the age
 * band as a letter on each of the certificate's building parts (`sap_building_parts[].construction_age_band`, "M"),
 * the tenure as a number at the top level (`tenure`, 1). A letter is not a fact and a number is not a fact, and until
 * this phase both were simply dropped.
 *
 * THE REGISTER PUBLISHES THE KEY TO THEM, and it is read rather than copied. Its own documentation (read 23 September
 * 2026, in SUPPLIER_DOCS) gives two endpoints:
 *
 *   GET /api/codes                                     the codes it can decode — {"data":["built_form","construction_age_band"]}
 *   GET /api/codes/info?code=&key=&schemaVersion=      what one key means   — {"data":[{"key":"NR","values":[{"value":"Detached",
 *                                                                              "schemaVersion":"RdSAP-Schema-17.0","assessmentType":"RdSAP"}]}]}
 *
 * `code` is required; `key` and `schemaVersion` are optional and both are sent, because the same letter means
 * different things under different schemas — the certificate's own `schema_type` ("RdSAP-Schema-21.0.1") is the
 * version, and sending it is what makes the answer this certificate's rather than some other certificate's.
 *
 * A CODE WE COULD NOT DECODE IS NOT KEPT, IN ANY FORM. Not the letter, not a guess, not a nearest match from another
 * schema version. If /api/codes does not list the code, or /api/codes/info does not answer, or it answers with
 * nothing for this key, the field is left out and the question stays asked (N4). That is a whole step weaker than it
 * sounds like it should be and it is the point: "M" in a claim file is worse than no answer, because it looks like one.
 *
 * NEITHER CALL IS EVER MADE FOR A NON-DOMESTIC OR DISPLAY CERTIFICATE. Those spell their fields out, carry neither
 * code, and a lookup that asked anyway would be spending a call on a question it does not have.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A PERSON'S PICK (Phase 146h, item 1)
 *
 * A REVIEW-band match still keeps nothing here. What changed is that the ranked list can be handed to the back office
 * — after a signed engagement only — and a person can choose one certificate or none (src/web/match-review.ts). The
 * choice arrives as `chosen`, a certificate NUMBER, and the lookup then reads that certificate exactly as an ACCEPT
 * would. It names a record and not a position in a list, so a list that came back in a different order cannot move
 * the choice onto another building.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type LookupResult, type StepRequest } from './registers.ts';
import {
  addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey,
  type Candidate, type MeasureHook, type PickQuery,
} from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';

export type EpcQuery = {
  readonly property: TypedProperty | null; readonly nation: Nation | null; readonly sector: string | null;
  /**
   * PHASE 146d, ITEM 9 — THE PAID LOOKUP'S UPRN, WHERE IT RAN FIRST ON THIS CLICK AND MATCHED. Null otherwise, and
   * null is the ordinary case: the paid address lookup is switched off and, even switched on, fires only after a
   * signed engagement. A UPRN turns this lookup's weakest step into its strongest — see `bySearchKey` below.
   */
  readonly uprn?: string | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
} & PickQuery;

export type EpcRegister = 'non-domestic' | 'display' | 'domestic';

/** Which registers a lookup searches for a sector: domestic only for supported living. */
export function registersFor(sector: string | null): readonly EpcRegister[] {
  return sector === 'supported_living' ? ['non-domestic', 'display', 'domestic'] : ['non-domestic', 'display'];
}

type Hit = {
  readonly certificate_number: string;
  readonly registered: string;
  readonly register: EpcRegister;
  /** The search result's `schemaType`, which the codes lookup is asked for. The certificate's own wins where it states one. */
  readonly schema: string | null;
};

/** A UPRN as a search key, or null. Digits only; anything else is not one and is not sent. */
export function searchByUprn(uprn: string | null | undefined): string | null {
  return typeof uprn === 'string' && /^\d{1,14}$/.test(uprn) ? uprn : null;
}

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

/* ================================================================== *
 * THE DOMESTIC CERTIFICATE'S CODES — /api/codes and /api/codes/info
 * ================================================================== */

/** The two coded fields this lookup decodes, and the register field each one becomes. The register's own code names. */
export const EPC_CODED_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  construction_age_band: 'epc_construction_age_band',
  tenure: 'epc_tenure',
});

/**
 * THE RAW CODE A DOMESTIC CERTIFICATE CARRIES, as the string the register would decode, or null.
 *
 * The age band is per BUILDING PART, and a certificate can have more than one — a house with a room in the roof
 * carries the main part's band and the roof's. The MAIN PART'S is the building's age band, so the first part's band
 * is the one read, and a certificate whose first part states none states none. Reading the oldest, or the newest, or
 * the commonest would be this file deciding what a building's age is, which is the register's job and not ours.
 *
 * The tenure is a single value at the top of the certificate. Both are written as numbers on some schemas and letters
 * on others, so both are read as their own text.
 */
export function rawCode(data: Record<string, unknown>, code: string): string | null {
  const one = (v: unknown): string | null =>
    typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  if (code === 'tenure') return one(data['tenure']);
  if (code === 'construction_age_band') {
    const parts = data['sap_building_parts'];
    if (!Array.isArray(parts)) return null;
    const first = obj(parts[0]);
    return first === null ? null : one(first['construction_age_band']);
  }
  return null;
}

/** The code names /api/codes says it can decode. Null when the answer could not be read — which decodes nothing. */
export function codesOffered(body: string | null): readonly string[] | null {
  const d = json(body)?.['data'];
  return Array.isArray(d) ? d.filter((x): x is string => typeof x === 'string') : null;
}

/**
 * WHAT ONE KEY MEANS, out of /api/codes/info, for this certificate's schema version.
 *
 * The answer is a list of keys, each with a list of values, each value carrying the schema version it belongs to. We
 * asked for one key and one version, so we take the value that says it is for that version. A value for ANOTHER
 * version is not used: the same letter means different things under different schemas, and taking a near one would
 * be putting a different building's age band on this certificate. An answer with no value for our version decodes
 * nothing, and the field is left out.
 */
export function decodeValue(body: string | null, key: string, schemaVersion: string | null): string | null {
  const d = json(body)?.['data'];
  if (!Array.isArray(d)) return null;
  for (const row of d) {
    const r = obj(row);
    if (r === null || str(r['key']) !== key) continue;
    const values = r['values'];
    if (!Array.isArray(values)) continue;
    for (const v of values) {
      const o = obj(v);
      const value = str(o?.['value']);
      if (value === null) continue;
      if (schemaVersion === null || str(o?.['schemaVersion']) === schemaVersion) return value;
    }
  }
  return null;
}

/** The permitted fields from one certificate's `data`. The two coded ones are added later, and only when decoded. */
export function certificateFields(data: Record<string, unknown>, hit: Hit): Record<string, unknown> {
  const f: Record<string, unknown> = { epc_rrn: hit.certificate_number };
  const floor = hit.register === 'domestic' ? area(data['total_floor_area']) : area(obj(data['technical_information'])?.['floor_area']);
  if (floor !== null) f.epc_total_floor_area_m2 = floor;
  /* A dwelling type is a plain string on most schemas and `{value, language}` on some (RdSAP-Schema-19.0 is one).
     Both are read; anything else leaves the building-type question asked rather than storing an object. */
  const dwelling = str(data['dwelling_type']) ?? str(obj(data['dwelling_type'])?.['value']);
  const type = hit.register === 'domestic' ? dwelling : str(data['property_type']);
  if (type !== null) f.epc_property_type = type;
  const registered = str(data['registration_date']) ?? hit.registered;
  if (/^\d{4}-\d{2}-\d{2}/.test(registered)) f.epc_lodgement_date = registered.slice(0, 10);
  return f;
}

/** The certificate's own schema version, which /api/codes/info is asked for. Null when it states none. */
export function schemaVersionOf(data: Record<string, unknown>, hit: { readonly schema: string | null }): string | null {
  return str(data['schema_type']) ?? hit.schema;
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

    const exact = searchByUprn(q.uprn);
    const candidates: Candidate<Hit>[] = [];
    for (const register of registersFor(q.sector)) {
      const c = await call({
        endpoint: `/api/${register}/search`,
        query: exact === null ? { postcode: pc, page_size: '100' } : { uprn: exact, page_size: '100' },
      });
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
          payload: { certificate_number: number, registered: str(r['registrationDate']) ?? '', register, schema: str(r['schemaType']) },
        });
      }
    }
    /* THE EXACT KEY SHORT-CIRCUITS THE SCORING. Everything the search returned is this property's, because the
       property is what we searched on, so the only thing left to choose is WHICH of its certificates — the latest,
       as it always is. No threshold is consulted and the measurement hook is not fed a score it did not produce. */
    let hit: Hit;
    let how: string;
    if (exact !== null) {
      if (candidates.length === 0) {
        return {
          kind: 'NOT_MATCHED', code: 'NO_MATCH', calls,
          why: 'the energy certificate register holds no certificate for this property. We looked it up by the ' +
            'property\u2019s own number. So this is about this property. It is not a near miss',
        };
      }
      hit = candidates.map((c) => c.payload).reduce((a, b) => (b.registered > a.registered ? b : a));
      how = 'we looked it up by the property\u2019s own number, which is an exact match';
    } else {
      const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
      const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.EPC, 'the energy certificate register',
        (a, b) => (b.registered > a.registered ? b : a));
      q.measure?.({ profile: 'EPC', register: registersFor(q.sector).join('+'), match: m, top_address: m.top?.candidate.address ?? null });
      /* PHASE 146h: the REVIEW band's list goes to the back office, or a person's choice comes back in it. Outside
         that band this does nothing at all, and the four lines below are what they were. */
      const pick = applyPick(m, q, {
        profile: 'EPC', register: registersFor(q.sector).join('+'),
        keyOf: (h) => h.certificate_number, registerOf: (h) => h.register,
      });
      if (pick.kind === 'GONE') return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
      if (pick.kind === 'CHOSEN') {
        hit = pick.best.candidate.payload;
        how = pickedNote(pick.best.score, 'the energy certificate register');
      } else if (m.status !== 'ACCEPT' || m.best === null) {
        return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls };
      } else {
        hit = m.best.candidate.payload;
        how = m.why;
      }
    }
    const cert = await call({ endpoint: '/api/certificate', query: { certificate_number: hit.certificate_number } });
    if (cert.outcome !== 'OK' || cert.body === null) return { kind: 'CALL_FAILED', call: cert, calls };
    const data = obj(json(cert.body)?.['data']);
    if (data === null) return { kind: 'UNREADABLE', call: cert, calls };
    const fields = certificateFields(data, hit);

    /* PHASE 146h, ITEM 2 — THE TWO CODED FIELDS, DECODED THROUGH THE REGISTER'S OWN CODE LISTS, or left out.
       Domestic certificates only: nothing else carries either code, so nothing else spends a call asking. */
    let decoded = '';
    const wanted = hit.register === 'domestic'
      ? Object.keys(EPC_CODED_FIELDS).filter((code) => rawCode(data, code) !== null)
      : [];
    if (wanted.length > 0) {
      const schema = schemaVersionOf(data, hit);
      const list = await call({ endpoint: '/api/codes' });
      const offered = list.outcome === 'OK' ? codesOffered(list.body) : null;
      const undecoded: string[] = [];
      for (const code of wanted) {
        const key = rawCode(data, code) as string;
        if (offered === null || !offered.includes(code)) { undecoded.push(code); continue; }
        const info = await call({
          endpoint: '/api/codes/info',
          query: { code, key, ...(schema === null ? {} : { schemaVersion: schema }) },
        });
        const value = info.outcome === 'OK' ? decodeValue(info.body, key, schema) : null;
        if (value === null) { undecoded.push(code); continue; }
        fields[EPC_CODED_FIELDS[code] as string] = value;
      }
      const words = (c: string) => (c === 'tenure' ? 'how the property is held' : 'when the building was built');
      if (undecoded.length > 0) {
        decoded = ` The certificate gives ${undecoded.map(words).join(' and ')} as a code we could not look up, ` +
          `so ${undecoded.length === 1 ? 'that question stays' : 'those questions stay'} asked.`;
      }
    }

    const got = fields['epc_total_floor_area_m2'] === undefined ? ' It gives no floor area, so that question stays asked.' : '';
    return {
      kind: 'READ', calls,
      bundle: { records: [{ sourceId: 'EPC', entityId: hit.certificate_number, fields }], facts: fields },
      note: `looked up — ${how}, and we keep the certificate’s figures and where they came from.${got}${decoded}`,
    };
  },
});
