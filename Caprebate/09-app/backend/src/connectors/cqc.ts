/**
 * THE CARE QUALITY COMMISSION — A PROPERTY'S REGISTERED LOCATION, AND ITS PROVIDER. ENGLAND ONLY.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.CQC is false.
 *
 * Built against CQC's developer portal (api-portal.service.cqc.org.uk, its published API definition read 23 September
 * 2026; the address and date are in the source register's SUPPLIER_DOCS). Base https://api.service.cqc.org.uk/public/v1.
 * Every call carries the key in the `Ocp-Apim-Subscription-Key` header — never a keyless call, never the old portal's
 * partner code — read only through the key file's CQC_SUBSCRIPTION_KEY.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE CURRENT API CANNOT BE SEARCHED BY POSTCODE, AND THIS FILE IS BUILT AROUND THAT
 *
 * The published `/locations` filters are care home, clinical commissioning group, service type, constituency, LOCAL
 * AUTHORITY, inspection directorate and category, rating, region, regulated activity and report type — no postcode.
 * Each item in the list carries only `locationId`, `locationName` and `postalCode`. So a lookup is:
 *
 *   1. /locations?localAuthority=<the council area>, page by page — the council area comes from the ONS postcode
 *      table, which runs first on the same click. No table, no council area: the lookup is not made, and says why.
 *   2. Only the locations whose `postalCode` is the typed postcode are kept (the S10 spec's blocking key). Their
 *      names are never read.
 *   3. /locations/{locationId} for each of those few, and their address lines scored against the typed address.
 *      Only one clear ACCEPT is taken.
 *   4. /providers/{providerId} for the accepted location — read for its Companies House number, which is compared
 *      with ours and never kept.
 *
 * WHAT IS KEPT: the location and provider ids, the registration status and date, the registered beds, the regulated
 * activities, the service types and the specialisms — the fields the source register permits and the name exclusion
 * register keeps. NEVER a location's or provider's name (a sole trader's is their own), a registered manager or a
 * nominated individual.
 *
 * NOT ENGLAND, NOT ASKED. Wales is Care Inspectorate Wales's and Scotland the Care Inspectorate's; neither has a
 * connector in this build, and the research panel says so (`NOT_BUILT` in src/connectors/free-registers.ts).
 *
 * THE NAMED PEOPLE — READ IN MEMORY, NEVER KEPT. Phase 151b, 25 September 2026. Word question 156, for the data
 * protection officer: "May we briefly check two public register names without saving them?" Answer, closed
 * 24 September 2026: "Yes – best to check who signs and if they have authority". `cqcNamedPeople` below reads a
 * location's registered manager and a provider's nominated individual for ONE question, asked by
 * src/connectors/signatory-check.ts: is the person who signed our engagement letter one of them? It keeps only YES or
 * NO and a reason code — its bundle has no records, so nothing reaches the one door. It is CQC's own switch that turns
 * it on, so it is off with the lookup above. The lookup above still never reads either name.
 *
 * THE CACHE WINDOW: 30 DAYS IN THE TEST SYSTEM (Phase 153c, 4 October 2026, Word question 201). CQC's licence entry
 * (CQC_SYNDICATION in the source register) held 0 days until the solicitor answered how current CQC data must be when we
 * use it; it now holds 30, on our recommendation, with "Source: Care Quality Commission, Open Government Licence" shown
 * beside each fact, until the terms that come with the key say otherwise.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type LookupResult, type StepRequest } from './registers.ts';
import {
  addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey,
  type Candidate, type MeasureHook, type PickQuery,
} from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';
import type { SignerTest } from './signatory-check.ts';

export type CqcQuery = {
  readonly property: TypedProperty | null;
  readonly nation: Nation | null;
  readonly sector: string | null;
  /** The council area's NAME, from the ONS postcode table on this click; null when that did not run. */
  readonly council: string | null;
  /** Our company number for the client, to compare with the provider's. Never sent. */
  readonly company_number: string | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
} & PickQuery;

/** How many pages of a council area's locations we read at most, and how many to a page. */
export const CQC_PAGE_SIZE = 1000;
export const CQC_MAX_PAGES = 10;
/** How many locations at one postcode we fetch to score. More than this at one postcode is a person's to sort out. */
export const CQC_MAX_CANDIDATES = 10;

const key = (s: OwnerSecrets | null): Record<string, string> => ({ 'Ocp-Apim-Subscription-Key': s?.get('CQC_SUBSCRIPTION_KEY') ?? '' });

function json(body: string | null): Record<string, unknown> | null {
  if (body === null) return null;
  try {
    const v = JSON.parse(body) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const names = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const n = v.flatMap((x) => (x !== null && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' ? [(x as { name: string }).name] : []));
  return n.length === 0 ? null : n.join(', ');
};

/** The permitted fields from one location. The location's name is never read. */
export function locationFields(l: Record<string, unknown>): Record<string, unknown> | null {
  const id = str(l['locationId']);
  if (id === null) return null;
  const f: Record<string, unknown> = { cqc_location_id: id };
  const provider = str(l['providerId']);
  if (provider !== null) f.cqc_provider_id = provider;
  const status = str(l['registrationStatus']);
  if (status !== null) f.registration_status = status;
  const date = str(l['registrationDate']);
  if (date !== null) f.registration_date = date;
  // Beds only when the register states a whole number. Absent stays absent — never 0 (N4).
  if (typeof l['numberOfBeds'] === 'number' && Number.isInteger(l['numberOfBeds']) && l['numberOfBeds'] >= 0) f.beds_registered = l['numberOfBeds'];
  const activities = names(l['regulatedActivities']);
  if (activities !== null) f.regulated_activities = activities;
  const services = names(l['gacServiceTypes']);
  if (services !== null) f.service_types = services;
  const specialisms = names(l['specialisms']);
  if (specialisms !== null) f.specialisms = specialisms;
  return f;
}

export const cqc = defineSteppedConnector<CqcQuery>({
  source_id: 'CQC', service_id: 'CQC', owner: 'CQC', needs: ['CQC_SUBSCRIPTION_KEY'],
  first: (q, s) => ({ endpoint: '/public/v1/locations', query: { localAuthority: q.council ?? '', perPage: String(CQC_PAGE_SIZE), page: '1' }, headers: key(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const regulated = jurisSource(q.nation, 'regulator_social') === 'CQC' || jurisSource(q.nation, 'regulator_health') === 'CQC';
    if (q.nation === null) return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in, and the care regulator covers England only' };
    if (!regulated) return { kind: 'NOT_COVERED', why: 'the property is not in England, and the Care Quality Commission covers England only' };
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };
    }
    if (q.council === null) {
      return {
        kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT',
        why: 'the care regulator can only be searched by council area, not by postcode. Our postcode table gives the council area, and it is not set up here yet',
        calls: [],
      };
    }
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => { const c = await step({ ...r, headers: key(secrets) }); calls.push(c); return c; };

    // 1 and 2: the council area's locations, kept only where the postcode is the typed one.
    const atPostcode: string[] = [];
    for (let page = 1; page <= CQC_MAX_PAGES; page++) {
      const c = await call({ endpoint: '/public/v1/locations', query: { localAuthority: q.council, perPage: String(CQC_PAGE_SIZE), page: String(page) } });
      if (c.outcome !== 'OK' || c.body === null) return { kind: 'CALL_FAILED', call: c, calls };
      const body = json(c.body);
      if (body === null || !Array.isArray(body['locations'])) return { kind: 'UNREADABLE', call: c, calls };
      for (const l of body['locations'] as unknown[]) {
        const o = l !== null && typeof l === 'object' ? l as Record<string, unknown> : {};
        const id = str(o['locationId']);
        if (id !== null && postcodeKey(str(o['postalCode'])) === pc) atPostcode.push(id);
      }
      const total = typeof body['totalPages'] === 'number' ? body['totalPages'] : page;
      if (page >= total) break;
      if (page === CQC_MAX_PAGES) {
        return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: `the council area lists more than ${CQC_MAX_PAGES * CQC_PAGE_SIZE} care locations, more than we read in one go, so a person must look this one up`, calls };
      }
    }
    if (atPostcode.length === 0) return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'the care regulator lists no location at this postcode', calls };
    if (atPostcode.length > CQC_MAX_CANDIDATES) {
      return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: `the care regulator lists ${atPostcode.length} places at this postcode. That is too many for us to pick one, so a person must choose`, calls };
    }

    // 3: each location at the postcode, scored on its address lines.
    const candidates: Candidate<Record<string, unknown>>[] = [];
    for (const id of atPostcode) {
      const c = await call({ endpoint: '/public/v1/locations/{location_id}', params: { location_id: id } });
      if (c.outcome !== 'OK' || c.body === null) return { kind: 'CALL_FAILED', call: c, calls };
      const l = json(c.body);
      if (l === null) return { kind: 'UNREADABLE', call: c, calls };
      candidates.push({
        address: addressFromLines([str(l['postalAddressLine1']), str(l['postalAddressLine2'])], str(l['postalCode']), str(l['postalAddressTownCity'])),
        payload: l,
      });
    }
    const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
    const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.CQC, 'the care regulator');
    q.measure?.({ profile: 'CQC', match: m, top_address: m.top?.candidate.address ?? null });
    /* PHASE 146h: a REVIEW's ranked list goes to the back office, or a person's choice comes back in it, keyed on
       the location id — the key this lookup reads a registration BY. Outside the REVIEW band this does nothing. */
    const pick = applyPick(m, q, {
      profile: 'CQC', register: 'the care regulator',
      keyOf: (l) => String(l['locationId'] ?? ''),
    });
    if (pick.kind === 'GONE') return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
    const took = pick.kind === 'CHOSEN' ? pick.best : m.best;
    const how = pick.kind === 'CHOSEN' ? pickedNote(pick.best.score, 'the care regulator') : m.why;
    if (took === null || (pick.kind !== 'CHOSEN' && m.status !== 'ACCEPT')) {
      return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls };
    }
    const fields = locationFields(took.candidate.payload);
    if (fields === null) return { kind: 'UNREADABLE', call: calls[calls.length - 1] as CallResult, calls };

    // 4: the provider, for its Companies House number — compared, never kept.
    let providerNote = '';
    const providerId = str(fields['cqc_provider_id']);
    if (providerId !== null) {
      const p = await call({ endpoint: '/public/v1/providers/{provider_id}', params: { provider_id: providerId } });
      const pj = p.outcome === 'OK' ? json(p.body) : null;
      const theirs = str(pj?.['companiesHouseNumber'])?.trim().toUpperCase() ?? null;
      const ours = q.company_number?.trim().toUpperCase() ?? null;
      providerNote = pj === null ? ' We could not read the provider this time.'
        : theirs !== null && ours !== null && theirs.padStart(8, '0') !== ours.padStart(8, '0')
          ? ' The regulator says another company runs it. A person should check.'
          : '';
    }
    return {
      kind: 'READ', calls,
      bundle: { records: [{ sourceId: 'CQC', entityId: String(fields['cqc_location_id']), fields }], facts: fields },
      note: `looked up — ${how}, and we keep the registration and where it came from.${providerNote}`,
    };
  },
});

/* ------------------------------------------------------------------ the named people, read in memory only (Phase 151b) */

export type CqcPeopleQuery = {
  readonly location_id: string | null;
  readonly provider_id: string | null;
  /** Word answer 156: the one question asked of each named person. The name goes no further than this call. */
  readonly isSigner: SignerTest;
};

type Person = { personGivenName?: unknown; personFamilyName?: unknown; personRoles?: unknown };

const hasRole = (p: Person, role: string): boolean =>
  Array.isArray(p.personRoles) && p.personRoles.some((r) => typeof r === 'string' && r.trim().toLowerCase() === role);

/** Every person the answer names in `role`, as the test is asked about them. An entry with no role is not in it (N4). */
function named(activities: unknown, role: 'registered manager' | 'nominated individual'): Person[] {
  if (!Array.isArray(activities)) return [];
  const out: Person[] = [];
  for (const a of activities) {
    if (a === null || typeof a !== 'object') continue;
    const ra = a as { contacts?: unknown; nominatedIndividual?: unknown };
    if (Array.isArray(ra.contacts)) {
      for (const c of ra.contacts) if (c !== null && typeof c === 'object' && hasRole(c as Person, role)) out.push(c as Person);
    }
    // The provider's regulated activities carry the nominated individual in a field of its own, with no role list.
    if (role === 'nominated individual' && ra.nominatedIndividual !== null && typeof ra.nominatedIndividual === 'object') out.push(ra.nominatedIndividual as Person);
  }
  return out;
}

const signerIn = (people: Person[], test: SignerTest): boolean =>
  people.some((p) => test({ whole: null, surname: str(p.personFamilyName), forenames: str(p.personGivenName) }));

export const cqcNamedPeople = defineSteppedConnector<CqcPeopleQuery>({
  source_id: 'CQC', service_id: 'CQC', owner: 'CQC', needs: ['CQC_SUBSCRIPTION_KEY'],
  first: (q, s) => (q.location_id !== null
    ? { endpoint: '/public/v1/locations/{location_id}', params: { location_id: q.location_id }, headers: key(s) }
    : { endpoint: '/public/v1/providers/{provider_id}', params: { provider_id: q.provider_id ?? '' }, headers: key(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const location = str(q.location_id);
    let provider = str(q.provider_id);
    if (location === null && provider === null) {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'we hold no care regulator registration for this client', calls: [] };
    }
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => { const c = await step({ ...r, headers: key(secrets) }); calls.push(c); return c; };
    // An answer we can read, or the ending the lookup stops on.
    const read = (c: CallResult): { readonly end: LookupResult } | { readonly body: Record<string, unknown> } => {
      if (c.outcome !== 'OK' || c.body === null) {
        return c.status === 404
          ? { end: { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'the care regulator holds no record under the number we hold', calls } }
          : { end: { kind: 'CALL_FAILED', call: c, calls } };
      }
      const body = json(c.body);
      return body === null ? { end: { kind: 'UNREADABLE', call: c, calls } } : { body };
    };
    const yes = (reason: 'REGISTERED_MANAGER' | 'NOMINATED_INDIVIDUAL'): LookupResult => ({
      kind: 'READ', calls, bundle: { records: [], facts: { signatory_result: 'YES', signatory_reason: reason } },
      note: 'looked up — we kept only yes or no, and no name',
    });

    if (location !== null) {
      const l = read(await call({ endpoint: '/public/v1/locations/{location_id}', params: { location_id: location } }));
      if ('end' in l) return l.end;
      if (signerIn(named(l.body['regulatedActivities'], 'registered manager'), q.isSigner)) return yes('REGISTERED_MANAGER');
      provider = provider ?? str(l.body['providerId']);
    }
    if (provider !== null) {
      const p = read(await call({ endpoint: '/public/v1/providers/{provider_id}', params: { provider_id: provider } }));
      if ('end' in p) return p.end;
      const people = [...named(p.body['regulatedActivities'], 'nominated individual'), ...named([{ contacts: p.body['contacts'] }], 'nominated individual')];
      if (signerIn(people, q.isSigner)) return yes('NOMINATED_INDIVIDUAL');
    }
    return {
      kind: 'READ', calls, bundle: { records: [], facts: { signatory_result: 'NO', signatory_reason: 'NOT_LISTED' } },
      note: 'looked up — we kept only yes or no, and no name',
    };
  },
});
