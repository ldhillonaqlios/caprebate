/**
 * THE PAID ADDRESS LOOKUP — HOMEDATA. UPRN, ADDRESS, POSTCODE AND COORDINATES, AFTER A SIGNED ENGAGEMENT.
 * Phase 146d, 23 September 2026. Switched off: REGISTER_SWITCHES.HOMEDATA_ADDRESS is false.
 *
 * WHAT IT IS FOR, AND WHAT IT IS NOT FOR. Every free register is matched on a typed address, and a typed address is
 * the weakest key in this system (src/connectors/matching.ts, at thresholds nobody has measured). A UPRN is the
 * strong one: Ordnance Survey's own identifier for a single addressable property. So this lookup's job is to turn the
 * address somebody typed into a UPRN, and that UPRN then UPGRADES the free registers' fuzzy match — for the energy
 * certificates it becomes an exact key, as a company number already is for Companies House (item 9). It is not a
 * source of facts about the building: its whitelist is four fields wide and holds no floor area, no valuation and no
 * name.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE TWO CALLS, AND WHY THEY ARE THOSE TWO
 *
 *   1. GET /address/postcode/{postcode}/            2 tokens   every address at the typed postcode, each with a UPRN
 *   2. GET /property/{uprn}/?with=address,lr_title  6 tokens   the matched one's address fields and coordinates (5),
 *                                                              plus the one-penny title pre-check (1)
 *
 * SLUGS, NEVER TIERS — and there is a test that says so. The supplier also sells the same UPRN as /property/{uprn}/
 * base/, /core/ and /complete/ at 10, 25 and 50 tokens. WE NEVER CALL THOSE, and the reason is not the price. Core
 * returns crime and demographics and Complete adds deprivation; the source register excludes exactly those under
 * `occupier_*` and `resident_*`, so their answers would have to be stripped before they could be kept. A call whose
 * answer must be stripped is worse than a call that is narrow: the data still arrived, still sat in this process, and
 * still has to be got rid of correctly every single time. `?with=` asks for the named slugs and nothing else, and it
 * costs the sum of their published weights — the same 5 tokens for the address, and no crime figures.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE ONE-PENNY PRE-CHECK, AND WHY IT IS NOT A REPLACEMENT FOR THE £7 TITLE (item 15)
 *
 * `lr_title` costs 1 token — one penny — and says whether a registered title exists, what its number is and whether it
 * is freehold or leasehold. So the click can find out, for a penny, whether there is a title to buy at all and
 * whether it is the kind we want, before it spends £7 and a Business Gateway round trip on a property that has no
 * registered title or is plainly not the client's.
 *
 * IT CANNOT STAND IN FOR THE TITLE REGISTER, AND NOBODY SHOULD LATER OPTIMISE THE £7 AWAY ON THE STRENGTH OF IT:
 *
 *   · HOMEDATA CARRIES NO COMMERCIAL PRICE PAID. Its sold prices are HM Land Registry's PRICE PAID DATA, and that
 *     dataset is residential sales only — it excludes commercial property entirely. Four of our five sectors are
 *     commercial. Buying the title register is the ONLY way to a price paid for them, and that is the whole reason
 *     the £7 call exists.
 *   · IT CARRIES NO PERSONAL PROPRIETOR. Its fuller title product (`lr_title_full`, 10 tokens) is corporate and
 *     overseas ownership only, so a property held personally — which is exactly the case name exception 2 was written
 *     for — has no proprietor there at all.
 *
 * THE PRE-CHECK IS NEVER STORED. What it returns goes into the run's `facts`, which chain to the next lookup on the
 * same click and are not written to the database; only `records` go through the one door. Storing it under
 * HOMEDATA_ADDRESS would break that source's whitelist, and storing it under HMLR_TITLE would say HM Land Registry
 * told us something a reseller told us. Neither is true, so neither is written.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SHAPES ARE READ FROM THE SUPPLIER'S PROSE, AND THAT IS SAID PLAINLY
 *
 * This phase was told to build from fixtures captured in the supplier's own playground rather than from the prose of
 * its documentation. THE PLAYGROUND TURNED OUT TO NEED AN ACCOUNT: https://homedata.co.uk/developer/playground
 * redirects to a log-in page, and its own live-demo page says "Create an account to run them against your own key"
 * (both read 23 September 2026). Its OpenAPI document IS public — https://api.homedata.co.uk/schema/yaml/, 155 paths
 * — and every path, parameter and weight below is taken from it and from the endpoint reference. BUT THAT DOCUMENT
 * PUBLISHES NO RESPONSE SCHEMAS: every one of its responses reads "200: No response body". So the field NAMES below
 * come from the endpoint reference's prose, the fixtures are shaped from that, and the readers are deliberately
 * tolerant — they accept the answer under any of the containers the prose uses and keep a field only when it is
 * there. A field the answer does not give is not invented and not zeroed; the question stays asked (N4).
 * THE FIRST LIVE CALL MUST CONFIRM THE SHAPE, and that is written down in the source register's findings too.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type Bundle, type LookupResult, type StepRequest } from './registers.ts';
import {
  addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey,
  type Candidate, type MeasureHook, type PickQuery,
} from './matching.ts';
import type { TypedProperty } from './nations.ts';

export type HomedataQuery = {
  readonly property: TypedProperty | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
} & PickQuery;

/**
 * THE SLUGS THIS CONNECTOR MAY ASK FOR, AND NO OTHERS.
 *
 * `address` (5 tokens) is what we are buying. `lr_title` (1) is the pre-check above. Every other slug the supplier
 * sells — risks, council_tax, construction, dimensions, solar, broadband — is either not a fact this system uses or
 * belongs to a register we already consult for nothing, and none of them is added without a decision.
 */
export const HOMEDATA_SLUGS: readonly string[] = Object.freeze(['address', 'lr_title']);

/**
 * THE TIER PATHS, NAMED SO A TEST CAN PROVE WE NEVER ASK FOR ONE. `address` is on this list as well as being a slug we
 * do use: /property/{uprn}/address/ and ?with=address return the same fields for the same 5 tokens, and the rule is
 * slugs never tiers, so the slug is the one we send. The rule is then a single shape a test can check, rather than
 * three banned names and one allowed exception nobody will remember.
 */
export const HOMEDATA_TIER_PATHS: readonly string[] = Object.freeze(['address', 'base', 'core', 'complete']);

/** The published weight of each slug, in tokens. 100 tokens = £1, so a token is a penny. Read 23 September 2026. */
export const HOMEDATA_SLUG_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  address: 5, lr_title: 1, lr_title_full: 10, dimensions: 1, construction: 1, risks: 7,
  planning_history: 5, title_boundary: 5, council_tax: 3,
});

/** The published weight of each path this connector calls. */
export const HOMEDATA_PATH_TOKENS: Readonly<Record<string, number>> = Object.freeze({
  '/address/postcode/{postcode}/': 2, '/address/find/': 2, '/property/{uprn}/': 1,
});

/** What one lookup costs in pence before it is made: the postcode search, then the slug chain. */
export function homedataCostPence(slugs: readonly string[] = HOMEDATA_SLUGS): number {
  const chain = slugs.reduce((n, s) => n + (HOMEDATA_SLUG_TOKENS[s] ?? 0), 0);
  return (HOMEDATA_PATH_TOKENS['/address/postcode/{postcode}/'] ?? 0) + chain;
}

/**
 * The supplier's own header, and it is NOT `Bearer`. Its authentication page, read 23 September 2026: "Use Api-Key
 * prefix, not Bearer". The key is never put in the query string, which that page also asks us not to do, and which
 * would in any case put it where an audit row records parameter names.
 */
const apiKey = (s: OwnerSecrets | null): Record<string, string> => ({ authorization: `Api-Key ${s?.get('HOMEDATA_API_KEY') ?? ''}` });

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** A number the answer states, or null. Never 0 for absent, and never a string coerced silently to 0. */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A UPRN as the supplier gives it — a number or a string of digits. Kept as a string; it is an identifier, not a sum. */
export function uprnOf(v: unknown): string | null {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : str(v);
  return s !== null && /^\d{1,14}$/.test(s) ? s : null;
}

/** The first array the answer holds under any of the containers the supplier's prose uses. */
function rows(body: string | null, keys: readonly string[]): unknown[] | null {
  if (body === null) return null;
  let j: unknown;
  try { j = JSON.parse(body); } catch { return null; }
  if (Array.isArray(j)) return j;
  const o = obj(j);
  if (o === null) return null;
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[];
  return null;
}

/**
 * ONE ADDRESS FROM THE POSTCODE SEARCH. The address LINES are read to match on and are NOT kept: what we keep is the
 * single joined `address_line` the whitelist names, and only for the one that matched.
 */
export function candidateOf(r: Record<string, unknown>, searched: string): Candidate<string> | null {
  const uprn = uprnOf(r['uprn'] ?? r['UPRN'] ?? r['uprn_id']);
  if (uprn === null) return null;
  const single = str(r['address'] ?? r['address_line'] ?? r['full_address'] ?? r['formatted_address']);
  const lines = [str(r['sub_building_name']), str(r['building_name']), str(r['building_number']), str(r['thoroughfare']) ?? str(r['street'])]
    .filter((x): x is string => x !== null);
  const parts = lines.length > 0 ? lines : single === null ? [] : [single.replace(/,?\s*[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\s*$/i, '')];
  return {
    address: addressFromLines(parts, str(r['postcode']) ?? searched, str(r['post_town']) ?? str(r['town'])),
    payload: uprn,
  };
}

/** The four fields the whitelist permits, from the `address` slug. A field the answer does not give is left out. */
export function addressFields(a: Record<string, unknown>, uprn: string, fallbackPostcode: string): Record<string, unknown> {
  const f: Record<string, unknown> = { uprn };
  const line = str(a['address_line'] ?? a['address'] ?? a['full_address'] ?? a['formatted_address']);
  if (line !== null) f.address_line = line;
  const pc = postcodeKey(str(a['postcode']) ?? fallbackPostcode);
  if (pc !== '') f.postcode = pc;
  /* ITEM 13: THE COORDINATES, AND THEY ARE NOT A NICETY. The spatial screen (the "is it the same building" check)
     is geometry-keyed, its own spec says the coordinates come from this lookup, and NOTHING ELSE IN THE REGISTER
     SUPPLIES A COORDINATE AT ALL — so until this whitelist carried them, that screen could not be fed by anything.
     A coordinate is a point on the ground, not a person: it identifies a building, which is what the whole register
     is about. */
  const lat = num(a['latitude'] ?? a['lat']);
  const lon = num(a['longitude'] ?? a['lng'] ?? a['lon']);
  if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { f.latitude = lat; f.longitude = lon; }
  return f;
}

/**
 * THE PRE-CHECK'S ANSWER — whether a registered title exists and what kind. Facts for this click only; never stored.
 * `lr_title` carries no proprietor, so nothing here can be a person.
 */
export type TitlePreCheck = {
  readonly has_title: boolean;
  readonly title_number: string | null;
  readonly tenure: 'freehold' | 'leasehold' | null;
  readonly restrictions: number | null;
};

export function preCheckOf(v: unknown): TitlePreCheck {
  const t = obj(v);
  if (t === null) return { has_title: false, title_number: null, tenure: null, restrictions: null };
  const number = str(t['title_number'] ?? t['titleNumber'] ?? t['number']);
  const raw = str(t['tenure'])?.toLowerCase() ?? null;
  const list = t['restrictions'];
  return {
    has_title: number !== null,
    title_number: number,
    tenure: raw === 'freehold' || raw === 'leasehold' ? raw : null,
    restrictions: Array.isArray(list) ? list.length : num(t['restriction_count']),
  };
}

/** A path with a tier segment on it. Exported for the test that this connector never sends one. */
export function isTierPath(path: string): boolean {
  return HOMEDATA_TIER_PATHS.some((t) => new RegExp(`/property/[^/]+/${t}/?$`).test(path));
}

export const homedataAddress = defineSteppedConnector<HomedataQuery>({
  source_id: 'HOMEDATA_ADDRESS', service_id: 'HOMEDATA_ADDRESS', owner: 'HOMEDATA_ADDRESS', needs: ['HOMEDATA_API_KEY'],
  first: (q, s) => ({ endpoint: '/address/postcode/{postcode}/', params: { postcode: postcodeKey(q.property?.postcode) }, headers: apiKey(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };
    }
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => {
      /* The tier guard sits on the way out, not only in a test: a path with a tier on it is never sent, whoever
         later edits the two calls below. */
      if (isTierPath(r.endpoint)) {
        throw new Error('a tier path was asked for; this connector asks for named slugs only');
      }
      const c = await step({ ...r, headers: { ...apiKey(secrets), ...r.headers } });
      calls.push(c);
      return c;
    };

    // 1 · every address at the typed postcode, 2 tokens. The postcode goes in the PATH, so no key and no address
    //     ever reaches the query string, whose parameter names an audit row records.
    const search = await call({ endpoint: '/address/postcode/{postcode}/', params: { postcode: pc } });
    if (search.outcome !== 'OK' || search.body === null) return { kind: 'CALL_FAILED', call: search, calls };
    const list = rows(search.body, ['addresses', 'results', 'data', 'items']);
    if (list === null) return { kind: 'UNREADABLE', call: search, calls };

    const candidates = list.flatMap((r) => { const o = obj(r); const c = o === null ? null : candidateOf(o, pc); return c === null ? [] : [c]; });
    const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
    const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.EPC, 'the paid address lookup');
    q.measure?.({ profile: 'EPC', register: 'homedata', match: m, top_address: m.top?.candidate.address ?? null });
    /* PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the UPRN — the key
       the detail call is made BY. This lookup is paid and already waits on a signed engagement, which is the same
       gate the pick waits on, so nothing here widens when the pick may be offered. */
    const pick = applyPick(m, q, { profile: 'EPC', register: 'the paid address lookup', keyOf: (u) => u });
    if (pick.kind === 'GONE') return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
    const took = pick.kind === 'CHOSEN' ? pick.best : m.best;
    const how = pick.kind === 'CHOSEN' ? pickedNote(pick.best.score, 'the paid address lookup') : m.why;
    if (took === null || (pick.kind !== 'CHOSEN' && m.status !== 'ACCEPT')) {
      return {
        kind: 'NOT_MATCHED',
        code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH',
        why: m.why, calls,
      };
    }
    const uprn = took.candidate.payload;

    // 2 · the matched property's address fields and coordinates, and the penny title pre-check. Named slugs, summed
    //     weights, no tier.
    const detail = await call({
      endpoint: '/property/{uprn}/', params: { uprn }, query: { with: HOMEDATA_SLUGS.join(',') },
    });
    if (detail.outcome !== 'OK' || detail.body === null) return { kind: 'CALL_FAILED', call: detail, calls };
    let parsed: Record<string, unknown> | null = null;
    try { parsed = obj(JSON.parse(detail.body)); } catch { parsed = null; }
    if (parsed === null) return { kind: 'UNREADABLE', call: detail, calls };
    const addressPart = obj(parsed['address']) ?? parsed;
    const fields = addressFields(addressPart, uprn, pc);
    const pre = preCheckOf(parsed['lr_title']);

    const bundle: Bundle = {
      records: [{ sourceId: 'HOMEDATA_ADDRESS', entityId: uprn, fields }],
      /* `uprn` is repeated in the facts on purpose: the facts are what the next lookup on this click reads, and the
         energy certificate lookup takes the UPRN from here to turn its fuzzy postcode match into an exact key. */
      facts: { ...fields, title_pre_check: pre },
    };
    const coords = fields['latitude'] === undefined ? ' It gives no coordinates, so the spatial screen stays unfed.' : '';
    const title = pre.has_title
      ? ` A registered title exists${pre.tenure === null ? '' : ` and it is ${pre.tenure}`}, so the title register is worth buying.`
      : ' It found no registered title, so buying one would spend £7 on nothing.';
    return {
      kind: 'READ', bundle, calls,
      note: `looked up — ${how}, and we keep the property's identifier, its address and where it came from.${coords}${title}`,
    };
  },
});
