/**
 * HM LAND REGISTRY PRICE PAID DATA — WHAT A PROPERTY SOLD FOR, AND WHEN. EVERY SECTOR SINCE PHASE 159g.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.HMLR_PPD is false (on for the test website only).
 *
 * Built against HM Land Registry's published guidance and its linked-data documentation (read 23 September 2026; the
 * addresses and date are in the source register's SUPPLIER_DOCS). No key: the linked-data API at
 * https://landregistry.data.gov.uk, `/data/ppi/transaction-record.json?propertyAddress.postcode=…`.
 *
 * PHASE 159g, 10 October 2026 — ASKED FOR EVERY SECTOR (the Lockwood run, L11). Until now this lookup was made for
 * supported living only, on the reading that a surgery, a care home or a dental practice is commercial and never in
 * the dataset. That was wrong for Lockwood Surgery: HM Land Registry holds 3 Meltham Road, sold 3 June 2020 for
 * £540,000, leasehold, type "Other", category B. Category B is "additional price paid" — sales to companies, buy-to-lets,
 * repossessions, transfers — and a healthcare building that was once a house, or was bought by a company, can be in
 * it. So it is asked for every sector, by postcode and the building's number and street, and the sale's category is
 * kept (`ppd_category`, A or B). A category B sale, or one of type "Other", is a LEAD for the surveyor to confirm and
 * never the price (src/web/who-claims.ts isPricePaidLead; the desk-first reading skips it). A property outside England
 * and Wales, or whose nation nobody has recorded, is still not asked about.
 *
 * THE LOOKUP: every sale at the typed postcode, their addresses split and scored against the typed one; sales at the
 * same address count as one, and the latest is the one kept — the most recent sale is the likeliest to be our
 * client's purchase, and a person confirms it.
 *
 * THE ATTRIBUTION IS PRESCRIBED AND GOES WITH THE FIGURE, WORD FOR WORD, wherever it is shown:
 *   "Contains HM Land Registry data © Crown copyright and database right 2021. This data is licensed under the Open
 *    Government Licence v3.0."
 * It is the HMLR_PPD licence's `attribution_text` in the source register, and `PRICE_PAID_ATTRIBUTION` below reads it
 * from there. Every screen that shows a price paid carries it (test/phase146c.test.ts checks each one).
 */

import type { CallResult } from './http.ts';
import { defineSteppedConnector, type LookupResult } from './registers.ts';
import {
  addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey,
  type Candidate, type MeasureHook, type PickQuery,
} from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';
import { LICENCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';

export type PricePaidQuery = {
  readonly property: TypedProperty | null; readonly nation: Nation | null; readonly sector: string | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
} & PickQuery;

/** HM Land Registry's prescribed words, read from the licence register. Never retyped. */
export const PRICE_PAID_ATTRIBUTION: string = LICENCES.find((l) => l.licence_id === 'HMLR_PPD')?.attribution_text ?? '';

type Sale = {
  readonly id: string;
  readonly price: number;
  readonly date: string;
  readonly tenure: string | null;
  readonly type: string | null;
  readonly new_build: boolean | null;
  /** PHASE 159g: A, a standard sale at full market value; B, "additional price paid". Null when it is not stated. */
  readonly category: 'A' | 'B' | null;
};

/** The sale's category from its linked-data term: "standard…" is A, "additional…" is B; anything else is not known. */
export function categoryOf(v: unknown): 'A' | 'B' | null {
  const l = (label(v) ?? '').toLowerCase();
  if (l.startsWith('standard')) return 'A';
  if (l.startsWith('additional')) return 'B';
  return null;
}

const MONTHS: Readonly<Record<string, string>> = Object.freeze({
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
});

/** "Thu, 19 Sep 2013", as the linked-data API writes it, to 2013-09-19. Anything else is not a date. */
export function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(v);
  const month = m ? MONTHS[m[2] ?? ''] : undefined;
  return m && month ? `${m[3]}-${month}-${(m[1] ?? '').padStart(2, '0')}` : null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** A linked-data term's English label ("Leasehold"), or the last part of its address when it has none. */
function label(v: unknown): string | null {
  const o = obj(v);
  if (o === null) return null;
  const pref = Array.isArray(o['prefLabel']) ? obj(o['prefLabel'][0]) : null;
  const text = str(pref?.['_value']);
  if (text !== null) return text;
  const about = str(o['_about']);
  return about === null ? null : about.slice(about.lastIndexOf('/') + 1);
}

export function saleOf(item: Record<string, unknown>): Sale | null {
  const id = str(item['transactionId']);
  const price = item['pricePaid'];
  const date = isoDate(item['transactionDate']);
  if (id === null || typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || date === null) return null;
  const tenure = label(item['estateType'])?.toLowerCase() ?? null;
  return {
    id, price, date,
    tenure: tenure === 'freehold' || tenure === 'leasehold' ? tenure : null,
    type: label(item['propertyType']),
    new_build: typeof item['newBuild'] === 'boolean' ? item['newBuild'] : null,
    category: categoryOf(item['transactionCategory']),
  };
}

export function saleFields(s: Sale): Record<string, unknown> {
  const f: Record<string, unknown> = { price_paid: s.price, transaction_date: s.date };
  if (s.tenure !== null) f.tenure = s.tenure;
  if (s.type !== null) f.property_type_ppd = s.type;
  if (s.new_build !== null) f.new_build_flag = s.new_build;
  if (s.category !== null) f.ppd_category = s.category;
  return f;
}

export const pricePaid = defineSteppedConnector<PricePaidQuery>({
  source_id: 'HMLR_PPD', service_id: 'HMLR_PPD', owner: null, needs: [],
  first: (q) => ({ endpoint: '/data/ppi/transaction-record.json', query: { 'propertyAddress.postcode': postcodeKey(q.property?.postcode), _pageSize: '200' } }),
  async lookup(step, q): Promise<LookupResult> {
    if (q.nation === null) return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in, and sale prices are published for England and Wales only' };
    if (jurisSource(q.nation, 'price_paid') !== 'HMLR_PPD') return { kind: 'NOT_COVERED', why: 'sale prices are published for England and Wales only' };
    // PHASE 159g (L11): no sector is left out. A category B or "Other" sale is kept as a lead, never the price.
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };

    const c = await step({ endpoint: '/data/ppi/transaction-record.json', query: { 'propertyAddress.postcode': pc, _pageSize: '200' } });
    const calls: CallResult[] = [c];
    if (c.outcome !== 'OK' || c.body === null) return { kind: 'CALL_FAILED', call: c, calls };
    let items: unknown[] | null = null;
    try { const j = obj(JSON.parse(c.body)); const r = obj(j?.['result']); items = Array.isArray(r?.['items']) ? r['items'] as unknown[] : null; } catch { items = null; }
    if (items === null) return { kind: 'UNREADABLE', call: c, calls };

    const candidates: Candidate<Sale>[] = items.flatMap((it) => {
      const o = obj(it);
      const sale = o === null ? null : saleOf(o);
      const a = obj(o?.['propertyAddress']);
      if (sale === null || a === null) return [];
      return [{ address: addressFromLines([str(a['saon']), str(a['paon']), str(a['street'])], str(a['postcode']), str(a['town'])), payload: sale }];
    });
    const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
    const m = matchAddress(typed, candidates, MATCH_THRESHOLDS.HMLR_PPD, 'HM Land Registry’s sale prices',
      (a, b) => (b.date > a.date ? b : a));
    q.measure?.({ profile: 'HMLR_PPD', match: m, top_address: m.top?.candidate.address ?? null });
    /* PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the transaction id
       — HM Land Registry's own key for one sale. Outside that band this does nothing. */
    const pick = applyPick(m, q, {
      profile: 'HMLR_PPD', register: 'HM Land Registry’s sale prices', keyOf: (sale) => sale.id,
    });
    if (pick.kind === 'GONE') return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
    const took = pick.kind === 'CHOSEN' ? pick.best : m.best;
    const how = pick.kind === 'CHOSEN' ? pickedNote(pick.best.score, 'HM Land Registry’s sale prices') : m.why;
    if (took === null || (pick.kind !== 'CHOSEN' && m.status !== 'ACCEPT')) {
      return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls };
    }
    const sale = took.candidate.payload;
    const fields = saleFields(sale);
    return {
      kind: 'READ', calls,
      bundle: { records: [{ sourceId: 'HMLR_PPD', entityId: sale.id, fields }], facts: { ...fields, attribution: PRICE_PAID_ATTRIBUTION } },
      note: `looked up — ${how}, and we keep the latest sale at that address and where it came from.${sale.category === 'B' || (sale.type ?? '').toLowerCase() === 'other' || sale.category === null
        ? ' It is a lead for the surveyor to confirm, not the price: ' + (sale.category === 'B' ? 'a category B sale may be to a company, a buy-to-let or a transfer.' : sale.category === null ? 'its category is not stated.' : 'its type is “Other”.') : ''} ${PRICE_PAID_ATTRIBUTION}`,
    };
  },
});
