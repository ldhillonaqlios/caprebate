/**
 * "FIND MY ADDRESS" — A POSTCODE TO THE ADDRESSES THERE, THROUGH HOMEDATA. Phase 156f, 6 October 2026.
 *
 * Lakhbir, 6 October 2026: "one address box on Homedata, with GoAddress removed - yes". Until then the box used
 * GoAddress (30 Sep 2026), whose answer carried no UPRN and listed one hospital five times under different spellings;
 * its free 100 lookups were used up and its paid plan was never taken. Homedata gives every address at a postcode with
 * its UPRN — Ordnance Survey's number for one addressable property — so the address the client picks is the exact key
 * the paid research step after signing starts from (src/connectors/homedata.ts checks it still belongs to the address
 * and postcode the client gave, and goes back to the postcode search when it does not). GoAddress is removed: its
 * connector, its key, its outside-call row, its tests and its Connections row (PHASE-HISTORY, Phase 156f).
 *
 * THE CALL: GET https://api.homedata.co.uk/address/postcode/{postcode}/ with "authorization: Api-Key <key>"
 * (HOMEDATA_API_KEY, never Bearer). 2 tokens = 2p. WHAT IS SENT: THE POSTCODE, AND NOTHING ELSE. The person picks their
 * address from the list, or says it is not there and types it; nothing is chosen for them. The answer, as the live
 * service gives it (read 6 Oct 2026): every address at the postcode with uprn, address, building_name,
 * building_number, sub_building, street and town. Anything unreadable is "not found", never a guess.
 *
 * WHAT IS NOT A BUILDING IS NOT SHOWN (`NOT_A_BUILDING`): a postcode's list holds advertising rights, moored vessels and
 * development sites beside the buildings (St Thomas' Hospital's postcode, 6 Oct 2026). "My address is not in the list"
 * is always offered.
 *
 * THE CAP — £1 A DAY (Lakhbir, 6 Oct 2026: "yes please"). The assessment is public, so a robot can press the box. At
 * most 50 postcode searches a calendar day, UK time (50 × 2p = £1), counted from the audit log's CONNECTOR_CALLED rows
 * for this service, and at most 5 for one visitor (one assessment). Past either, the box says to type the address and
 * nothing is sent. A postcode already searched in the same assessment is not searched again: narrowing the list is free.
 *
 * SWITCHED ON FOR TESTING under a recorded waiver (the privacy notice is unpublished and does not name Homedata yet).
 * Homedata holds its data in the UK, so no transfer approval is needed; naming it in the privacy notice is, for real
 * clients. Needs the key.
 */

import { callOutside, policyRefusal, type CallDeps } from './http.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';
import type { SecretStore } from '../secrets.ts';
import type { Db } from '../db.ts';
import { normalisePostcode } from './postcode-check.ts';
import { uprnOf } from './homedata.ts';
import { startOfLocalDayMs } from '../web/localtime.ts';

/** The row in src/connectors/sources.ts: Homedata's postcode search, at the assessment. */
export const ADDRESS_SERVICE = 'HOMEDATA_POSTCODE';

export type AddressLookupConfig = {
  readonly enabled: boolean;
  readonly named_in_privacy_notice: boolean;
  readonly papers_waived_for_testing?: boolean;
  readonly waiver_record?: string | null;
};

/**
 * PHASE 153c, 4 October 2026 — HOW LONG THE PICKED ADDRESS IS KEPT (Word question 37). Built on our recommendation, for
 * the officer to check: seven years with the claim file, in the test system. Homedata publishes no period, so this is
 * OUR TEST READING, awaiting its written answer; and nothing from it reaches a client, accountant or HMRC report (the
 * source register keeps those channels closed: HOMEDATA_TERMS).
 */
export const ADDRESS_KEEP_UNTIL = Object.freeze({
  days: 2557,
  reading: 'Seven years with the claim file. A test reading, not the supplier\'s figure.',
  reports_closed: true,
  awaiting: 'Homedata\'s written answer to our drafted email.',
} as const);

export const ADDRESS_LOOKUP: AddressLookupConfig = Object.freeze({
  enabled: true, named_in_privacy_notice: false,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon, 6 October 2026, in chat: "one address box on Homedata, with GoAddress removed - yes", ' +
    'and the £1 a day cap: "yes please". A test build. The privacy notice does not name Homedata yet.',
});

/**
 * THE CAP, ONE NAMED CONSTANT. 50 searches a UK calendar day at 2p each is £1 (Lakhbir, 6 Oct 2026); 5 for one visitor,
 * which is one assessment (a draft).
 */
export const ADDRESS_SEARCH_CAP = Object.freeze({ per_day: 50, per_visitor: 5, pence_each: 2 } as const);

/** The words the box shows past the cap. No call is made. */
export const CAPPED_WHY = 'We cannot look up more addresses just now. Please type your address below.';

/** What must be true before a postcode is sent, in words. Empty means it can be sent. Names only, never a value. */
export function addressLookupMissing(cfg: AddressLookupConfig, secrets: SecretStore, o?: Partial<CallPolicy>): string[] {
  const out: string[] = [];
  if (cfg.named_in_privacy_notice !== true && cfg.papers_waived_for_testing !== true) out.push('Name Homedata in the privacy notice.');
  if (cfg.enabled !== true) out.push('Then switch the address lookup on.');
  if ((secrets.forOwner('HOMEDATA_ADDRESS').get('HOMEDATA_API_KEY') ?? '').trim() === '') out.push('Put the Homedata key in the key file: HOMEDATA_API_KEY.');
  const base = CALL_POLICIES[ADDRESS_SERVICE];
  if (policyRefusal(base === undefined ? undefined : { ...base, ...o }) !== null) out.push('The outside-call row for Homedata\'s postcode search is missing or refused (sources.ts, HOMEDATA_POSTCODE).');
  return out;
}

/**
 * HOW MANY POSTCODE SEARCHES WENT OUT TODAY, UK TIME — from the audit log, the record every outside call writes, so the
 * cap cannot be fooled by a restart or by a second copy of the website on the same database. A call refused before it
 * left (our own limit, a refusal) is not counted: it was not sent and Homedata did not bill it.
 */
export function searchesToday(db: Db, nowIso: string): number {
  const start = new Date(startOfLocalDayMs(Date.parse(nowIso))).toISOString();
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'CONNECTOR_CALLED' AND at >= ? " +
      "AND json_extract(detail, '$.service') = ? AND outcome <> 'REFUSED'",
    [start, ADDRESS_SERVICE])?.n ?? 0;
}

/**
 * NOT A BUILDING — hidden from the list before it is shown. Each rule names what it hides and why; a test holds every
 * one against a real line from a postcode's answer and against a real building's line that must stay. Matched on the
 * address in capitals.
 */
export const NOT_A_BUILDING: readonly { readonly what: string; readonly re: RegExp }[] = Object.freeze([
  { what: 'advertising rights and hoardings ("ADSHEL ...", "ADVERTISING RIGHT ...")', re: /\bADSHEL\b|\bADVERTISING\s+(RIGHTS?|HOARDINGS?|SITES?|PANELS?|DISPLAYS?)\b|\bADVERTISING\s+RIGHT\b/ },
  /* Not every "Moorings": "12 The Moorings" is a street of houses. A vessel, a houseboat, or a line that starts with a
     berth or mooring is a boat. */
  { what: 'moored boats ("MOTOR VESSEL ...", "THE VESSEL ... MOORINGS", "BERTH 4")', re: /\bVESSEL\b|\bHOUSEBOAT\b|^(BERTH|MOORING|PONTOON)\b/ },
  { what: 'development sites ("... DEVELOPMENT SITE")', re: /\bDEVELOPMENT\s+SITE\b/ },
  { what: 'telephone masts and substations', re: /\bTELECOMMUNICATIONS?\s+(MAST|SITE|EQUIPMENT)\b|\b(ELECTRICITY\s+)?SUB[\s-]?STATION\b/ },
  { what: 'parking spaces and pitches on their own', re: /^(CAR\s+)?PARKING\s+(SPACE|BAY)\b|^(CAR\s+)?PARKING\s+SPACES?\s+\d|\bCAR\s+PARKING\s+SPACE\b/ },
  { what: 'land with no building ("LAND AT ...", "LAND ADJACENT TO ...")', re: /^LAND\s+(AT|ADJ(ACENT)?|ADJOINING|TO\s+THE|REAR\s+OF|NORTH|SOUTH|EAST|WEST)\b/ },
  { what: 'street records and other non-addresses', re: /\bSTREET\s+RECORD\b/ },
]);

/** Whether an address line is one of the things above. */
export function notABuilding(line: string): boolean {
  const u = line.toUpperCase().replace(/\s+/g, ' ').trim();
  return NOT_A_BUILDING.some((r) => r.re.test(u));
}

export type FoundAddress = {
  /** The UPRN. It is also what the list's choice sends back. */
  readonly id: string;
  readonly uprn: string;
  readonly line1: string;
  readonly town: string | null;
  readonly postcode: string;
  readonly label: string;
};
export type AddressLookup =
  | { readonly state: 'FOUND'; readonly addresses: readonly FoundAddress[]; readonly hidden: number; readonly searched: boolean }
  | { readonly state: 'NONE'; readonly why: string; readonly searched: boolean }
  | { readonly state: 'CAPPED'; readonly why: string; readonly searched: false }
  | { readonly state: 'NOT_LOOKED_UP'; readonly why: string; readonly searched: boolean };

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** Capitals to words: "10 DOWNING STREET" -> "10 Downing Street". Mixed case is left as the service wrote it. */
const title = (s: string): string => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s,'(/-])([a-z])/g, (_m, a: string, c: string) => `${a}${c.toUpperCase()}`) : s);

/** The rows of Homedata's answer, under any of the containers its answers use. */
function rowsOf(body: string): unknown[] {
  let j: unknown;
  try { j = JSON.parse(body); } catch { return []; }
  if (Array.isArray(j)) return j;
  const o = obj(j);
  for (const k of ['addresses', 'results', 'data', 'items']) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
}

/**
 * Read Homedata's answer into addresses, with what is not a building left out. Exported for the tests. The building
 * and street come from the parts (sub-building, building name, number and street); where the parts are missing, from
 * the one-line address with its town and postcode taken off.
 */
export function readAddresses(body: string, asked: string): { addresses: FoundAddress[]; hidden: number } {
  const out: FoundAddress[] = [];
  const seen = new Set<string>();
  let hidden = 0;
  for (const r of rowsOf(body)) {
    const o = obj(r);
    const uprn = uprnOf(o['uprn'] ?? o['UPRN']);
    if (uprn === null || seen.has(uprn)) continue;
    const town = str(o['town']) ?? str(o['post_town']);
    const pc = normalisePostcode(str(o['postcode']) ?? asked) ?? asked;
    const numberStreet = [str(o['building_number']), str(o['street']) ?? str(o['thoroughfare'])].filter((x): x is string => x !== null).join(' ');
    const parts = [str(o['sub_building']) ?? str(o['sub_building_name']), str(o['building_name']), numberStreet === '' ? null : numberStreet]
      .filter((x): x is string => x !== null);
    const single = str(o['address']);
    const fromSingle = single === null ? [] : single.split(',').map((x) => x.trim())
      .filter((x) => x !== '' && normalisePostcode(x) === null && (town === null || x.toUpperCase() !== town.toUpperCase()));
    const lines = parts.length > 0 ? parts : fromSingle;
    if (lines.length === 0) continue;
    const line1 = lines.map(title).join(', ');
    if (notABuilding(single ?? line1) || notABuilding(line1)) { hidden++; continue; }
    seen.add(uprn);
    const t = town === null ? null : title(town);
    out.push({ id: uprn, uprn, line1, town: t, postcode: pc, label: `${line1}${t === null ? '' : `, ${t}`}` });
  }
  return { addresses: out.slice(0, 300), hidden };
}

/**
 * The addresses at a postcode. At most one call; never throws. `used` is what the cap counts: today's searches (from the
 * audit log, `searchesToday`) and this visitor's. The caller adds one to the visitor's count when `searched` is true.
 */
export async function findAddresses(i: {
  readonly postcode: string; readonly deps: CallDeps; readonly secrets: SecretStore;
  readonly used: { readonly today: number; readonly visitor: number };
  /** TESTS ONLY. Absent, ADDRESS_LOOKUP governs. */
  readonly config?: AddressLookupConfig; readonly policy_override?: Partial<CallPolicy>;
}): Promise<AddressLookup> {
  const missing = addressLookupMissing(i.config ?? ADDRESS_LOOKUP, i.secrets, i.policy_override);
  if (missing.length > 0) return { state: 'NOT_LOOKED_UP', why: missing.join(' '), searched: false };
  const pc = normalisePostcode(i.postcode);
  if (pc === null) return { state: 'NOT_LOOKED_UP', why: 'That does not look like a UK postcode. Check it, or type your address.', searched: false };
  if (i.used.today >= ADDRESS_SEARCH_CAP.per_day || i.used.visitor >= ADDRESS_SEARCH_CAP.per_visitor) {
    return { state: 'CAPPED', why: CAPPED_WHY, searched: false };
  }
  const key = (i.secrets.forOwner('HOMEDATA_ADDRESS').get('HOMEDATA_API_KEY') ?? '').trim();
  const r = await callOutside({ ...i.deps, ...(i.policy_override === undefined ? {} : { policy_override: i.policy_override }) }, {
    service_id: ADDRESS_SERVICE, endpoint: '/address/postcode/{postcode}/', params: { postcode: pc },
    headers: { authorization: `Api-Key ${key}` }, actor_id: null, actor_role: null, claim_id: null,
    gate: { free_gate_open: false, engagement_signed: false, switched_on: true },
  });
  const searched = r.outcome !== 'REFUSED' && r.outcome !== 'RATE_LIMITED';
  if (r.status === 404) return { state: 'NONE', why: 'We could not find any addresses at that postcode. Check it, or type your address.', searched };
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_LOOKED_UP', why: 'We could not look up addresses just now. Please type your address.', searched };
  const found = readAddresses(r.body, pc);
  return found.addresses.length === 0
    ? { state: 'NONE', why: 'We could not find any buildings at that postcode. Check it, or type your address.', searched }
    : { state: 'FOUND', addresses: found.addresses, hidden: found.hidden, searched };
}
