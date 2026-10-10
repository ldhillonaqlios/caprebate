/**
 * SEVERAL EVENTS ON ONE BUILDING — PHASE 159c, 9 October 2026 (migration 105).
 *
 * The stress test of 9 October 2026 (E1; the Lockwood Surgery run, L5) and Lakhbir: "that's a design gap - this is
 * needed". A building is bought and then refitted, or built and then extended. Each is its own spend, with its own date,
 * its own band and its own route (CAA 2001 ss.11, 58), and on a bought-then-refitted surgery the works are often worth
 * more than the purchase.
 *
 * WHAT HAPPENED TO EACH BUILDING, IN ORDER. The first event is how the client came to have it; every later one is work
 * done since. The assessment writes them (`writeAssessmentEvents`, from CB_FUNNEL.eventsOf); a person may add one on the
 * claim (`addStaffEvent`). The lead, the claim and the property all read the same rows, by the property.
 *
 * EACH EVENT'S OWN FIGURE is the engine's band for that event on its own cost (`eventCeiling`, CB_BAND.rangeFor), until
 * the survey pack prices it: a purchase by section 562 from the price, any work by its own cost (the pack's cost-led
 * values, src/web/survey-pack.ts). EACH EVENT'S OWN DOCUMENTS are the ones that prove it (`DOCUMENTS_FOR`).
 *
 * N4: a cost not known is NULL and gets no figure; a date not known is NULL. Nothing is ever read as 0.
 */
import type { Db } from '../db.ts';
import { BAND } from './engine.ts';

export const EVENT_KINDS = ['PURCHASE', 'NEW_BUILD', 'EXTENSION', 'REFURBISHMENT', 'FIT_OUT', 'CONVERSION', 'REPAIRS', 'OTHER'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The funnel's type (CB_FUNNEL.EVENT_LABEL) to the kind kept on the record. */
export const KIND_OF: Readonly<Record<string, EventKind>> = Object.freeze({
  purchase: 'PURCHASE', new_build: 'NEW_BUILD', extension: 'EXTENSION', refurb: 'REFURBISHMENT', fit_out: 'FIT_OUT',
  conversion: 'CONVERSION', cosmetic: 'REPAIRS', other: 'OTHER',
});
/** And back, for the engine's band. */
export const FUNNEL_TYPE_OF: Readonly<Record<EventKind, string>> = Object.freeze({
  PURCHASE: 'purchase', NEW_BUILD: 'new_build', EXTENSION: 'extension', REFURBISHMENT: 'refurb', FIT_OUT: 'fit_out',
  CONVERSION: 'conversion', REPAIRS: 'cosmetic', OTHER: 'other',
});

export const KIND_WORDS: Readonly<Record<EventKind, string>> = Object.freeze({
  PURCHASE: 'The purchase', NEW_BUILD: 'The new build', EXTENSION: 'An extension', REFURBISHMENT: 'A refurbishment or refit',
  FIT_OUT: 'A fit-out', CONVERSION: 'A conversion', REPAIRS: 'Redecoration or repairs', OTHER: 'Other work',
});

export type PropertyEvent = {
  readonly id: string; readonly property_id: string; readonly business_id: string; readonly ord: number;
  readonly kind: EventKind; readonly event_date: string | null; readonly cost_pence: number | null;
  readonly vat: string | null; readonly source: 'ASSESSMENT' | 'STAFF'; readonly created_at: string;
  /** PHASE 159i (migration 110): the VAT on its cost the client could not reclaim, in pence; null: none recorded. */
  readonly vat_pence: number | null;
};

/** "06/2021" or "2021-06" as "2021-06"; "2021" as "2021"; anything else as null. */
export function eventDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  let m = /^(0?[1-9]|1[0-2])\/((?:19|20)\d{2})$/.exec(t);
  if (m !== null) return `${m[2] ?? ''}-${(m[1] ?? '').padStart(2, '0')}`;
  m = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(t);
  if (m !== null) return `${m[1] ?? ''}-${m[2] ?? ''}`;
  return /^(19|20)\d{2}$/.test(t) ? t : null;
}

/** "2021-06" as "June 2021"; "2021" as "2021"; null as "date not known". */
export function dateWords(d: string | null): string {
  if (d === null) return 'date not known';
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return m === null ? d : `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1] ?? ''}`;
}

/** PHASE 159j (item 5): an event named inside a sentence — "a refurbishment or refit (June 2025)". */
export function eventLabel(e: Pick<PropertyEvent, 'kind' | 'event_date'>): string {
  const w = KIND_WORDS[e.kind];
  return `${w.charAt(0).toLowerCase()}${w.slice(1)} (${dateWords(e.event_date)})`;
}

/** PHASE 159j (item 5): an event on one of this business's buildings, or null — the check before a document or a
 *  request names it. */
export function eventOfBusiness(db: Db, business_id: string, event_id: string): PropertyEvent | null {
  return db.get<PropertyEvent>(
    'SELECT id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, created_at, vat_pence FROM property_events WHERE id = ? AND business_id = ?',
    [event_id, business_id]) ?? null;
}

/** One building's events, first first. */
export function eventsOfProperty(db: Db, property_id: string | null): PropertyEvent[] {
  if (property_id === null) return [];
  return db.all<PropertyEvent>(
    'SELECT id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, created_at, vat_pence FROM property_events WHERE property_id = ? ORDER BY ord ASC',
    [property_id]);
}

/** Does the purchase method (section 562, from the price) apply? Yes where a purchase is recorded, and on a building with
 *  no events recorded at all — every claim from before Phase 159c, which was priced that way. */
export function purchaseApplies(events: readonly PropertyEvent[]): boolean {
  return events.length === 0 || events.some((e) => e.kind === 'PURCHASE');
}

/** The work on a building priced on its own cost: every event but the purchase. */
export function worksEvents(events: readonly PropertyEvent[]): PropertyEvent[] {
  return events.filter((e) => e.kind !== 'PURCHASE');
}

/** The events the assessment gathered for one building (CB_FUNNEL.eventsOf), written once, in order. */
export function writeAssessmentEvents(
  db: Db, newId: () => string,
  p: { property_id: string; business_id: string; assessment_id: string; at: string },
  events: readonly { type?: unknown; cost?: unknown; cost_unknown?: unknown; date?: unknown; date_unknown?: unknown }[],
): number {
  let ord = 0;
  for (const e of events) {
    const kind = typeof e.type === 'string' ? KIND_OF[e.type] : undefined;
    if (kind === undefined) continue;
    const cost = e.cost_unknown === true || typeof e.cost !== 'number' || !Number.isFinite(e.cost) || e.cost < 0 ? null : Math.round(e.cost * 100);
    const date = e.date_unknown === true ? null : eventDate(e.date);
    ord += 1;
    db.run('INSERT INTO property_events (id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, assessment_id, created_at, created_by) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'ASSESSMENT', ?, ?, NULL)",
      [newId(), p.property_id, p.business_id, ord, kind, date, cost, p.assessment_id, p.at]);
  }
  return ord;
}

export type AddEventResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };

/** A person adds an event to a building — work the assessment did not hear about. A second purchase is refused. */
export function addStaffEvent(
  db: Db, newId: () => string, at: string, by: string,
  p: { property_id: string; business_id: string },
  f: { kind: string; date: string; cost: string },
): AddEventResult {
  const kind = EVENT_KINDS.find((k) => k === f.kind);
  if (kind === undefined) return { ok: false, field: 'kind', why: 'Choose what kind of event it was.' };
  const events = eventsOfProperty(db, p.property_id);
  if (kind === 'PURCHASE' && events.some((e) => e.kind === 'PURCHASE')) return { ok: false, field: 'kind', why: 'This building already has its purchase. Add the work done since instead.' };
  const rawDate = f.date.trim();
  const date = rawDate === '' ? null : eventDate(rawDate);
  if (rawDate !== '' && date === null) return { ok: false, field: 'date', why: 'Give the date as month and year, like 06/2023, or just the year. Leave it empty if it is not known.' };
  const rawCost = f.cost.trim().replace(/^£\s*/, '').replace(/,/g, '');
  let cost: number | null = null;
  if (rawCost !== '') {
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(rawCost)) return { ok: false, field: 'cost', why: 'Type the cost in pounds, like 90000. Leave it empty if it is not known.' };
    cost = Math.round(Number(rawCost) * 100);
  }
  const id = newId();
  const ord = (events.reduce((a, e) => Math.max(a, e.ord), 0)) + 1;
  db.run('INSERT INTO property_events (id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, assessment_id, created_at, created_by) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'STAFF', NULL, ?, ?)",
    [id, p.property_id, p.business_id, ord, kind, date, cost, at, by]);
  return { ok: true, id };
}

/** The engine's "up to" for one event on its own cost, in pence, or why there is none. */
export function eventCeiling(sector: string | null, e: Pick<PropertyEvent, 'kind' | 'cost_pence'>): { high_pence: number | null; why: string | null } {
  if (e.kind === 'REPAIRS') return { high_pence: null, why: 'A repair comes off the profits in the year it is spent. It is a different claim from the allowances.' };
  if (e.kind === 'OTHER') return { high_pence: null, why: 'We need to know what kind of work this was.' };
  if (e.cost_pence === null) return { high_pence: null, why: 'The cost is not known yet.' };
  const r = (BAND as { rangeFor: (s: unknown, t: string, spend: number) => { high: number } | null }).rangeFor(sector, FUNNEL_TYPE_OF[e.kind], e.cost_pence / 100);
  return r === null ? { high_pence: null, why: 'We could not size this one from what is recorded.' } : { high_pence: Math.round(r.high * 100), why: null };
}

/** PHASE 159k: an event date ("2019-06" or "2019") known to be before the structures allowance began (29 October 2018). */
function beforeSba(d: string | null): boolean {
  if (d === null) return false;
  return d.length === 4 ? d < '2018' : d < '2018-10';
}

/** The documents that prove each kind of event. Every one is on the upload lists (it has a receipt policy). PHASE 159k:
 *  a purchase's include the seller's structures allowance statement, from 29 October 2018. */
export const DOCUMENTS_FOR: Readonly<Record<EventKind, readonly string[]>> = Object.freeze({
  PURCHASE: Object.freeze(['COMPLETION_STATEMENT', 'SALE_CONTRACT', 'CPSE_REPLIES', 'ACCOUNTS', 'SBA_ALLOWANCE_STATEMENT']),
  NEW_BUILD: Object.freeze(['CONTRACTOR_COST_BREAKDOWN', 'CONTRACTOR_INVOICE', 'PLANS', 'ACCOUNTS']),
  EXTENSION: Object.freeze(['CONTRACTOR_COST_BREAKDOWN', 'CONTRACTOR_INVOICE', 'PLANS', 'ACCOUNTS']),
  REFURBISHMENT: Object.freeze(['CONTRACTOR_COST_BREAKDOWN', 'CONTRACTOR_INVOICE', 'PLANS', 'ACCOUNTS']),
  FIT_OUT: Object.freeze(['CONTRACTOR_COST_BREAKDOWN', 'CONTRACTOR_INVOICE', 'PLANS', 'ACCOUNTS']),
  CONVERSION: Object.freeze(['CONTRACTOR_COST_BREAKDOWN', 'CONTRACTOR_INVOICE', 'PLANS', 'ACCOUNTS']),
  REPAIRS: Object.freeze(['CONTRACTOR_INVOICE', 'ACCOUNTS']),
  OTHER: Object.freeze(['CONTRACTOR_INVOICE', 'ACCOUNTS']),
});

export type EventOnClaim = PropertyEvent & {
  readonly words: string; readonly when: string;
  /** The engine's band for this event on its own cost, until a survey prices it. */
  readonly ceiling_pence: number | null; readonly ceiling_why: string | null;
  /** PHASE 159j (item 5): `held` counts the documents that name THIS event. On a building with one event, a document
   *  that names none is its, as before; with several, it is counted apart, as `untied`, until a person ties it. */
  readonly documents: readonly { readonly code: string; readonly label: string; readonly held: number; readonly untied: number }[];
};

/** Each event on a claim's building, with its own figure and its own documents. */
export function eventsOnClaim(db: Db, c: { property_id: string | null; business_id: string; sector: string | null }): EventOnClaim[] {
  const label = (code: string): string => db.get<{ label: string }>('SELECT label FROM document_types WHERE code = ?', [code])?.label ?? code;
  const own = (code: string, event_id: string): number => db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ? AND event_id = ?', [c.business_id, code, event_id])?.n ?? 0;
  const untied = (code: string): number => db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ? AND event_id IS NULL', [c.business_id, code])?.n ?? 0;
  const evs = eventsOfProperty(db, c.property_id);
  const one = evs.length === 1;
  return evs.map((e) => {
    const f = eventCeiling(c.sector, e);
    return { ...e, words: KIND_WORDS[e.kind], when: dateWords(e.event_date), ceiling_pence: f.high_pence, ceiling_why: f.why,
      // PHASE 159k: no structures allowance statement exists for a purchase known to be before 29 October 2018.
      documents: DOCUMENTS_FOR[e.kind].filter((code) => code !== 'SBA_ALLOWANCE_STATEMENT' || !beforeSba(e.event_date)).map((code) => {
        const loose = untied(code);
        return { code, label: label(code), held: own(code, e.id) + (one ? loose : 0), untied: one ? 0 : loose };
      }) };
  });
}

/** PHASE 159i (item 4): THE VAT ON ONE EVENT'S COST — its position (migration 105) and, where the client could not
 *  reclaim it, the amount (migration 110), added to that event's cost in the survey pack. Staff record it on the claim. */
export function setEventVat(db: Db, at: string, property_id: string, event_id: string, f: { position: string | null; amount_pence: number | null }):
  { ok: true } | { ok: false; why: string } {
  const e = db.get<{ id: string }>('SELECT id FROM property_events WHERE id = ? AND property_id = ?', [event_id, property_id]);
  if (e === undefined) return { ok: false, why: 'That is not an event on this claim’s building.' };
  const pos = f.position === null || f.position === '' ? null : f.position;
  if (pos !== null && pos !== 'INCLUDED_NOT_RECLAIMABLE' && pos !== 'EXCLUDED_OR_RECLAIMED' && pos !== 'NOT_KNOWN') return { ok: false, why: 'Choose what happened to the VAT.' };
  if (pos !== 'INCLUDED_NOT_RECLAIMABLE' && f.amount_pence !== null) return { ok: false, why: 'Give an amount only for VAT the client could not reclaim.' };
  if (f.amount_pence !== null && (!Number.isSafeInteger(f.amount_pence) || f.amount_pence <= 0)) return { ok: false, why: 'Give the VAT in pounds, more than £0.' };
  db.run('UPDATE property_events SET vat = ?, vat_pence = ? WHERE id = ?', [pos, f.amount_pence, event_id]);
  void at;
  return { ok: true };
}
