/**
 * A PROPERTY'S JURISDICTION AND WHERE IT CAME FROM (Phase 161l1, moved from src/modules/crm/crm.ts unchanged): worked
 * out from the postcode through the outside services' resolver, else as recorded by staff, else not known. Read by the
 * claim's facts panel and by the CRM's property pages.
 */
import { postcodeStore, POSTCODE_GATE } from '../../integrations/index.ts';
import { resolveServedAuthority, type PostcodeStore } from '../../integrations/index.ts';
import type { Db } from '../../core/index.ts';
import { JURISDICTIONS } from '../clients/index.ts';
import { getPropertiesPostcodeJurisdictionById } from './data.ts';

type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

const NATION_TO_JURISDICTION: Vocab = Object.freeze({
  england: 'england', wales: 'wales', scotland: 'scotland', ni: 'northern_ireland',
});

/** A property's jurisdiction and where it came from — CRM 6 of 10, for the facts panel. The same reading the property page shows. */
export function propertyJurisdiction(
  db: Db, property_id: string | null, store?: PostcodeStore | null,
): { value: string | null; label: string; derived: boolean; why: string } {
  if (property_id === null) return { value: null, label: 'not known — no property is recorded on this claim', derived: false, why: 'no property' };
  const p = getPropertiesPostcodeJurisdictionById<{ postcode: string | null; jurisdiction: string | null }>(db, [property_id]);
  if (p === undefined) return { value: null, label: 'not known', derived: false, why: 'no property' };
  return jurisdictionOf(p, store);
}

export type JurisdictionReading = { readonly value: string | null; readonly derived: boolean; readonly why: string };

/**
 * A POSTCODE'S NATION, THROUGH THE EXISTING RESOLVER — or a reason.
 *
 * No served set is passed, on purpose: the nation of a Scottish postcode is a
 * fact whether or not we serve Scotland, and refusing to know it would leave a
 * property's jurisdiction blank precisely where it matters most. The served-
 * jurisdiction refusal belongs to the funnel, which already has it.
 */
export function derivedJurisdiction(postcode: string | null, store: PostcodeStore | null = postcodeStore()): JurisdictionReading {
  if (postcode === null || postcode.trim() === '') return { value: null, derived: false, why: 'no postcode is recorded' };
  if (store === null) {
    return { value: null, derived: false, why: 'the postcode lookup is not switched on yet, so we cannot tell the nation from the postcode' };
  }
  if (POSTCODE_GATE.gated) return { value: null, derived: false, why: 'this lookup waits until our privacy notice is published' };
  try {
    const { nation } = resolveServedAuthority(postcode, { store });
    const j = NATION_TO_JURISDICTION[nation];
    return j === undefined ? { value: null, derived: false, why: 'we could not tell the nation from the postcode' } : { value: j, derived: true, why: '' };
  } catch (e) {
    return { value: null, derived: false, why: (e as Error).message };
  }
}

export function jurisdictionOf(r: { postcode: string | null; jurisdiction: string | null }, store?: PostcodeStore | null): {
  value: string | null; label: string; derived: boolean; why: string;
} {
  const d = store === undefined ? derivedJurisdiction(r.postcode) : derivedJurisdiction(r.postcode, store);
  if (d.derived && d.value !== null) {
    return { value: d.value, label: `${words(JURISDICTIONS, d.value, d.value)} — worked out from the postcode`, derived: true, why: '' };
  }
  if (r.jurisdiction !== null) {
    return { value: r.jurisdiction, label: `${words(JURISDICTIONS, r.jurisdiction, r.jurisdiction)} — recorded by staff`, derived: false, why: d.why };
  }
  return { value: null, label: 'not known', derived: false, why: d.why };
}
