/**
 * WHAT A FREE LOOKUP IS ASKED ABOUT, AND WHICH PART OF THE UK A PROPERTY IS IN. Phase 146c, 23 September 2026.
 *
 * Its own small file so each connector can read it without importing src/connectors/free-registers.ts, which imports
 * every connector: one direction only, and no cycle to trip over.
 */

import type { Db } from '../db.ts';
import type { Bundle } from './registers.ts';
import { CB } from '../web/engine.ts';

export type Nation = 'england' | 'wales' | 'scotland' | 'northern_ireland';

/** The typed property: what the client or staff entered. Never a paid UPRN — none exists before signature. */
export type TypedProperty = {
  readonly id: string;
  readonly address_line_1: string | null;
  readonly address_line_2: string | null;
  readonly town: string | null;
  readonly postcode: string | null;
  /** As recorded; null when nobody has said. Never assumed to be England. */
  readonly jurisdiction: Nation | null;
};

export type ResearchSubject = {
  readonly business_id: string;
  /** The name to search Companies House on: the legal name where we hold one, else the name we know them by. */
  readonly name: string;
  readonly company_number: string | null;
  readonly sector: string | null;
  /** The client's first property — their main site. Null when none is recorded. */
  readonly property: TypedProperty | null;
};

const NATIONS: readonly Nation[] = ['england', 'wales', 'scotland', 'northern_ireland'];

export function researchSubject(db: Db, business_id: string): ResearchSubject {
  const b = db.get<{ name: string; legal_name: string | null; company_number: string | null; sector: string | null }>(
    'SELECT name, legal_name, company_number, sector FROM businesses WHERE id = ?', [business_id]);
  const p = db.get<{ id: string; address_line_1: string | null; address_line_2: string | null; town: string | null; postcode: string | null; jurisdiction: string | null }>(
    'SELECT id, address_line_1, address_line_2, town, postcode, jurisdiction FROM properties WHERE business_id = ? ' +
      'ORDER BY created_at ASC, id ASC LIMIT 1', [business_id]);
  const legal = b?.legal_name?.trim() ?? '';
  const number = b?.company_number?.trim() ?? '';
  return {
    business_id,
    name: legal !== '' ? legal : (b?.name ?? ''),
    company_number: number !== '' ? number : null,
    sector: b?.sector ?? null,
    property: p === undefined ? null : {
      id: p.id, address_line_1: p.address_line_1, address_line_2: p.address_line_2, town: p.town, postcode: p.postcode,
      jurisdiction: (NATIONS as readonly string[]).includes(p.jurisdiction ?? '') ? p.jurisdiction as Nation : null,
    },
  };
}

/**
 * WHICH PART OF THE UK THE PROPERTY IS IN — as recorded, or else as the ONS table says for its postcode, if that lookup
 * ran first on this click. Null when neither says. NEVER ASSUMED TO BE ENGLAND: a register that covers England and
 * Wales only is not asked about a property whose nation nobody knows.
 */
export function nationOf(subject: ResearchSubject, earlier: ReadonlyMap<string, Bundle>): Nation | null {
  if (subject.property?.jurisdiction) return subject.property.jurisdiction;
  const code = earlier.get('ONS_POSTCODE')?.facts['ons_country_code'];
  if (typeof code !== 'string') return null;
  return code.startsWith('E') ? 'england' : code.startsWith('W') ? 'wales' : code.startsWith('S') ? 'scotland'
    : code.startsWith('N') ? 'northern_ireland' : null;
}

/** CB_JURIS's register for this nation, read from the engine and never restated: "EPC", "CQC", "HMLR_PPD", or another. */
export function jurisSource(nation: Nation | null, key: 'epc' | 'price_paid' | 'regulator_social' | 'regulator_health' | 'planning'): string | null {
  if (nation === null) return null;
  const j = CB.CB_JURIS as unknown as { sources?: (n: string) => Record<string, unknown> | null };
  const row = typeof j?.sources === 'function' ? j.sources(nation === 'northern_ireland' ? 'ni' : nation) : null;
  const v = row?.[key];
  return typeof v === 'string' ? v : null;
}

