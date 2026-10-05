/**
 * "FIND MY ADDRESS" — A POSTCODE TO A LIST OF ADDRESSES, THROUGH GOADDRESS. 30 September 2026.
 *
 * Lakhbir: "for address look up for the client rather than typeing this would be better https://goaddress.io". Phase
 * 151 found no free postcode-to-address list a paid service may use, so the funnel had a postcode CHECK only
 * (Postcodes.io: the council area, not the addresses). GoAddress sells the list: 100 lookups free, then from £6.30 a month
 * for 200 a day (goaddress.io, read 30 Sep 2026).
 *
 * THE CALL (goaddress.io/docs.html, read 30 Sep 2026): GET https://portal.goaddress.io/api/address/{postcode}, with
 * "Authorization: Bearer <token>" (GOADDRESS_API_KEY in the key file). The answer lists the addresses at the postcode.
 * READ AS IT REALLY ANSWERS — the first live lookup, 30 Sep 2026 (LE10 1DA, 99 addresses): each address is in
 * `new_address_res` with `raw_address` (the building and street, "1, Castle Inn Court 107-113, Castle Street"),
 * `post_town`, `postcode` ("LE101DA") and the county and country; `new_address_res2` repeats it as line_1 (the address)
 * with line_2 to line_4 the COUNTY, the POSTCODE and the COUNTRY — so only line_1 is an address line. `results[].label`
 * is still read if neither list comes back. Anything unreadable is "not found", never a guess.
 *
 * WHAT IS SENT: THE POSTCODE, AND NOTHING ELSE. The person picks their address from the list, or says it is not there
 * and types it; nothing is chosen for them.
 *
 * SWITCHED ON FOR TESTING under a recorded waiver (the privacy notice is unpublished and does not name GoAddress yet),
 * and the transfer approved for testing by the data protection officer (sources.ts, GOADDRESS). Needs the key.
 */

import { callOutside, policyRefusal, type CallDeps } from './http.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';
import type { SecretStore } from '../secrets.ts';
import { normalisePostcode } from './postcode-check.ts';

export const ADDRESS_SERVICE = 'GOADDRESS';

export type AddressLookupConfig = {
  readonly enabled: boolean;
  readonly named_in_privacy_notice: boolean;
  readonly papers_waived_for_testing?: boolean;
  readonly waiver_record?: string | null;
};

/**
 * PHASE 153c, 4 October 2026 — HOW LONG THE PICKED ADDRESS IS KEPT (Word question 37). Built on our recommendation, for
 * the officer to check: seven years with the claim file, in the test system. Neither GoAddress nor Homedata publishes a
 * period, so this is OUR TEST READING, awaiting their written answers; and nothing from either reaches a client,
 * accountant or HMRC report (the source register keeps those channels closed: HOMEDATA_TERMS).
 */
export const ADDRESS_KEEP_UNTIL = Object.freeze({
  days: 2557,
  reading: 'Seven years with the claim file. A test reading, not the supplier\'s figure.',
  reports_closed: true,
  awaiting: 'Homedata\'s written answer to our drafted email, and the same question to GoAddress.',
} as const);

export const ADDRESS_LOOKUP: AddressLookupConfig = Object.freeze({
  enabled: true, named_in_privacy_notice: false,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon, 30 September 2026, in chat: "for address look up for the client rather than typeing this would be better" (GoAddress), and "sadique approves". A test build. The privacy notice does not name GoAddress yet.',
});

/** What must be true before a postcode is sent, in words. Empty means it can be sent. Names only, never a value. */
export function addressLookupMissing(cfg: AddressLookupConfig, secrets: SecretStore, o?: Partial<CallPolicy>): string[] {
  const out: string[] = [];
  if (cfg.named_in_privacy_notice !== true && cfg.papers_waived_for_testing !== true) out.push('Name GoAddress in the privacy notice.');
  if (cfg.enabled !== true) out.push('Then switch the address lookup on.');
  if ((secrets.forOwner('GOADDRESS').get('GOADDRESS_API_KEY') ?? '').trim() === '') out.push('Put the GoAddress key in the key file: GOADDRESS_API_KEY.');
  const base = CALL_POLICIES[ADDRESS_SERVICE];
  if (policyRefusal(base === undefined ? undefined : { ...base, ...o }) !== null) out.push('The data protection officer approves sending postcodes to GoAddress (sources.ts, GOADDRESS).');
  return out;
}

export type FoundAddress = { readonly id: string; readonly line1: string; readonly town: string | null; readonly postcode: string; readonly label: string };
export type AddressLookup =
  | { readonly state: 'FOUND'; readonly addresses: readonly FoundAddress[] }
  | { readonly state: 'NONE'; readonly why: string }
  | { readonly state: 'NOT_LOOKED_UP'; readonly why: string };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' ? v as Record<string, unknown> : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const title = (s: string): string => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);

/** Read GoAddress's answer into addresses. Exported for the tests. */
export function readAddresses(body: string, asked: string): FoundAddress[] {
  let j: Record<string, unknown>;
  try { j = obj(JSON.parse(body)); } catch { return []; }
  const lines = new Map<string, string[]>();
  for (const r of arr(j['new_address_res2'])) {
    const o = obj(r); const id = str(String(o['addressid'] ?? ''));
    if (id === null) continue;
    lines.set(id, ['line_1', 'line_2', 'line_3', 'line_4'].map((k) => str(o[k])).filter((x): x is string => x !== null));
  }
  const detail = new Map<string, Record<string, unknown>>();
  for (const r of arr(j['new_address_res'])) { const o = obj(r); const id = str(String(o['addressid'] ?? '')); if (id !== null) detail.set(id, o); }
  const out: FoundAddress[] = [];
  const ids = lines.size > 0 ? [...lines.keys()] : [...detail.keys()];
  for (const id of ids) {
    const d = detail.get(id) ?? {};
    // The building and street: `raw_address`, else line_1 (never line_2 to line_4: county, postcode, country), else parts.
    const first = str(d['raw_address']) ?? (lines.get(id) ?? [])[0] ?? null;
    const ls = first !== null ? [first]
      : [str(d['organisation']), str(d['building_name']), [str(d['flat']), str(d['house_no']) ?? str(d['houseNo']), str(d['street'])].filter(Boolean).join(' ') || null].filter((x): x is string => x !== null);
    const town = str(d['post_town']) ?? str(d['town']) ?? str(d['city']);
    const pc = normalisePostcode(str(d['postcode']) ?? asked) ?? asked;
    if (ls.length === 0) continue;
    const line1 = ls.map(title).join(', ');
    out.push({ id, line1, town: town === null ? null : title(town), postcode: pc, label: `${line1}${town === null ? '' : `, ${title(town)}`}` });
  }
  if (out.length === 0) {
    // Only the short list came back: its labels, as the service wrote them.
    for (const r of arr(j['results'])) {
      const o = obj(r); const id = str(String(o['addressid'] ?? '')); const label = str(o['label']) ?? str(o['address']);
      if (id === null || label === null) continue;
      const parts = label.split(',').map((x) => x.trim()).filter((x) => x !== '' && normalisePostcode(x) === null);
      const town = parts.length > 1 ? parts[parts.length - 1]! : null;
      const line1 = (town === null ? parts : parts.slice(0, -1)).map(title).join(', ');
      if (line1 === '') continue;
      out.push({ id, line1, town: town === null ? null : title(town), postcode: normalisePostcode(str(o['postcode']) ?? asked) ?? asked, label: `${line1}${town === null ? '' : `, ${title(town)}`}` });
    }
  }
  return out.slice(0, 200);
}

/** The addresses at a postcode. At most one call; never throws. */
export async function findAddresses(i: {
  readonly postcode: string; readonly deps: CallDeps; readonly secrets: SecretStore;
  /** TESTS ONLY. Absent, ADDRESS_LOOKUP governs. */
  readonly config?: AddressLookupConfig; readonly policy_override?: Partial<CallPolicy>;
}): Promise<AddressLookup> {
  const missing = addressLookupMissing(i.config ?? ADDRESS_LOOKUP, i.secrets, i.policy_override);
  if (missing.length > 0) return { state: 'NOT_LOOKED_UP', why: missing.join(' ') };
  const pc = normalisePostcode(i.postcode);
  if (pc === null) return { state: 'NOT_LOOKED_UP', why: 'That does not look like a UK postcode. Check it, or type your address.' };
  const key = (i.secrets.forOwner('GOADDRESS').get('GOADDRESS_API_KEY') ?? '').trim();
  const r = await callOutside({ ...i.deps, ...(i.policy_override === undefined ? {} : { policy_override: i.policy_override }) }, {
    service_id: ADDRESS_SERVICE, endpoint: '/api/address/{postcode}', params: { postcode: pc.replace(' ', '') },
    headers: { authorization: `Bearer ${key}` }, actor_id: null, actor_role: null, claim_id: null,
    gate: { free_gate_open: false, engagement_signed: false, switched_on: true },
  });
  if (r.status === 404) return { state: 'NONE', why: 'We could not find any addresses at that postcode. Check it, or type your address.' };
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_LOOKED_UP', why: 'We could not look up addresses just now. Please type your address.' };
  const found = readAddresses(r.body, pc);
  return found.length === 0 ? { state: 'NONE', why: 'We could not find any addresses at that postcode. Check it, or type your address.' } : { state: 'FOUND', addresses: found };
}
