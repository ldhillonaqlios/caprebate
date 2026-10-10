/**
 * EACH EVENT'S ROUTE — PHASE 159d, 9 October 2026.
 *
 * The stress test of 9 October 2026 (C1) and the Lockwood run (L9): the amendment-window gate turned away claims the law
 * allows. A company that bought in 2019, still owns the building and never claimed cannot amend its 2019 return — but
 * the spend is not lost: it goes into the pool of the FIRST period whose return is still open, and is written down from
 * there for as long as the client owns the building (CAA 2001 s.58(3)-(4); Rulebook A v2 sections 3, 4 and 4b).
 * Lakhbir, 9 October 2026: "but then remember refurbishment and also tax allowances" — so the route is decided PER EVENT
 * on the building (Phase 159c's property_events), not once per claim:
 *
 *   W1  the amendment window for the event's own period is open: amend that return (first-year allowances possible,
 *       and a refund);
 *   W2  that window is closed, but the client still owns the building: the spend goes into the first open period's pool,
 *       writing-down allowances only;
 *   W3  the building is not owned, or the purchase fails the legal check (s.187A): no claim for that event.
 *
 * WHETHER A CLAIM IS ALIVE COMES FROM THE LEGAL CHECK AND OWNERSHIP, NOT FROM THE WINDOW. The window only chooses W1 or
 * W2. N4 throughout: a window not known, or a closed window with ownership not known, is no route (NOT_KNOWN) and passes
 * no gate. A repair is not a capital allowance and takes no route.
 *
 * OUR READING, put to the tax adviser (Word question 253): that a closed window with the building still owned is W2,
 * read from the client's checked year end for the first open period; and the evidence that counts for ownership.
 */
import type { Db } from '../db.ts';
import { acquisitionDateReading, amendmentWindowReading, latestFacts, periodFromYearEnd, windowForPeriod, type WindowReading } from './claim-facts.ts';
import { dateWords, eventsOfProperty, KIND_WORDS, type EventKind, type PropertyEvent } from './property-events.ts';
import { legalVerdictForClaim } from './pack-legal.ts';
import { localDate } from './localtime.ts';

export type Route = 'W1' | 'W2' | 'W3' | 'NOT_KNOWN';

export const ROUTE_WORDS: Readonly<Record<Route, string>> = Object.freeze({
  W1: 'The return for the year of the spend can still be amended: it goes in that return, and can bring a refund.',
  W2: 'The return for the year of the spend is closed, but you still own the building: it goes into this year’s pool, and is written down over the years ahead.',
  W3: 'Not claimed: you no longer own the building, or the purchase does not pass the second-hand fixtures rules.',
  NOT_KNOWN: 'Not settled yet: we still need a date or a fact before we can say how this part goes in.',
});

export type Owned = { readonly value: 'YES' | 'NO' | null; readonly why: string };

export type EventRoute = {
  readonly event_id: string | null;
  readonly kind: EventKind;
  readonly label: string;
  readonly route: Route;
  /** The window for the event's own period. */
  readonly window: WindowReading;
  /** W2: the first period whose return is still open, and when that window closes. */
  readonly first_open: { readonly start: string; readonly end: string; readonly deadline: string } | null;
  /** The deadline the return this route names can be filed by (W1: the event's own window; W2: the first open one). */
  readonly deadline: string | null;
  readonly why: string;
  /** For the client: which way this part goes in, in plain words. */
  readonly words: string;
};

/** Whether the client still owns the building — YES only on evidence, never with a sale date on the property. */
export function stillOwned(db: Db, c: { id: string; business_id: string; property_id: string | null }): Owned {
  if (c.property_id === null) return { value: null, why: 'no property is recorded on this claim' };
  const p = db.get<{ disposal_date: string | null }>('SELECT disposal_date FROM properties WHERE id = ?', [c.property_id]);
  if (p?.disposal_date !== null && p?.disposal_date !== undefined) return { value: 'NO', why: `the property record has a sale date, ${p.disposal_date}` };
  const f = latestFacts(db, c.id).get('STILL_OWNED');
  if (f !== undefined && f.answer === 'VALUE' && (f.value_text === 'YES' || f.value_text === 'NO')) {
    return { value: f.value_text, why: f.value_text === 'YES' ? 'the client still owns it, as recorded on the claim with its source' : 'the client no longer owns it, as recorded on the claim' };
  }
  // The current title register naming the client's company is evidence too.
  const co = db.get<{ company_number: string | null }>('SELECT company_number FROM businesses WHERE id = ?', [c.business_id])?.company_number ?? null;
  if (co !== null) {
    const t = db.get<{ fields_json: string }>(
      "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC LIMIT 1",
      [c.business_id, c.property_id]);
    let n: unknown = null;
    try { n = t === undefined ? null : (JSON.parse(t.fields_json) as Record<string, unknown>)['proprietor_company_number']; } catch { n = null; }
    if (typeof n === 'string' && n.trim().toUpperCase() === co.trim().toUpperCase()) return { value: 'YES', why: 'the current title register names the client’s company as the owner' };
  }
  return { value: null, why: 'whether the client still owns the building is not recorded' };
}

/** "2025" or "2025-06" as its first and last day. */
function span(d: string): { first: string; last: string } | null {
  if (/^\d{4}$/.test(d)) return { first: `${d}-01-01`, last: `${d}-12-31` };
  const m = /^(\d{4})-(\d{2})$/.exec(d);
  if (m === null) return null;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).toISOString().slice(0, 10);
  return { first: `${d}-01`, last };
}

/** The accounting period a piece of work falls in: from the client's checked year end, or the period recorded on the
 *  claim — only where the whole of its date (a month, or a year) falls inside one period. */
function periodOfWork(db: Db, c: { id: string; business_id: string }, date: string | null): { start: string; end: string } | { why: string } {
  if (date === null) return { why: 'the date of this work is not known' };
  const sp = span(date);
  if (sp === null) return { why: 'the date of this work could not be read' };
  const a = periodFromYearEnd(db, c.business_id, sp.first), b = periodFromYearEnd(db, c.business_id, sp.last);
  if (a !== null && b !== null) {
    return a.end === b.end ? a : { why: `the work is dated ${dateWords(date)}, which could fall in either of two accounting periods. Record the exact date` };
  }
  const f = latestFacts(db, c.id);
  const s = f.get('ACCOUNTING_PERIOD_START'), e = f.get('ACCOUNTING_PERIOD_END');
  const sv = s?.answer === 'VALUE' ? (s.value_date ?? s.value_text) : null, ev = e?.answer === 'VALUE' ? (e.value_date ?? e.value_text) : null;
  if (sv !== null && ev !== null && sp.first >= sv && sp.last <= ev) return { start: sv, end: ev };
  return { why: 'the accounting period this work falls in is not known. Record the client’s year end' };
}

/** The first period, from this one on, whose return can still be amended (or is not yet due). */
function firstOpen(db: Db, c: { id: string; business_id: string }, from: { start: string; end: string }, todayIso: string): { start: string; end: string; deadline: string } | null {
  let p = from;
  for (let i = 0; i < 40; i++) {
    const w = windowForPeriod(db, c, p.end, todayIso);
    if (w.state === 'UNKNOWN') return null;
    if (w.state === 'OPEN' && w.deadline !== null) return { ...p, deadline: w.deadline };
    const y = Number(p.end.slice(0, 4)) + 1, md = p.end.slice(5);
    const lastDay = new Date(Date.UTC(y, Number(md.slice(0, 2)), 0)).getUTCDate();
    const end = `${String(y)}-${md.slice(0, 2)}-${String(Math.min(Number(md.slice(3)), lastDay)).padStart(2, '0')}`;
    const start = new Date(Date.UTC(Number(p.end.slice(0, 4)), Number(md.slice(0, 2)) - 1, Number(md.slice(3)) + 1)).toISOString().slice(0, 10);
    p = { start, end };
  }
  return null;
}

/** The period the PURCHASE falls in — the recorded one, else from the client's year end — for the W2 search. */
function purchasePeriod(db: Db, c: { id: string; business_id: string; property_id: string | null }): { start: string; end: string } | null {
  const f = latestFacts(db, c.id);
  const s = f.get('ACCOUNTING_PERIOD_START'), e = f.get('ACCOUNTING_PERIOD_END');
  const sv = s?.answer === 'VALUE' ? (s.value_date ?? s.value_text) : null, ev = e?.answer === 'VALUE' ? (e.value_date ?? e.value_text) : null;
  if (sv !== null && ev !== null) return { start: sv, end: ev };
  const acq = acquisitionDateReading(db, c.property_id);
  return acq.known && acq.value !== null ? periodFromYearEnd(db, c.business_id, acq.value) : null;
}

/** Each event on the claim's building with its route. A claim with no events recorded takes one route, the purchase's. */
export function claimRoutes(db: Db, c: { id: string; business_id: string; property_id: string | null }, todayIso: string): EventRoute[] {
  const owned = stillOwned(db, c);
  const legal = legalVerdictForClaim(db, c.id, todayIso);
  const events: (PropertyEvent | null)[] = eventsOfProperty(db, c.property_id).filter((e) => e.kind !== 'REPAIRS');
  const list = events.length === 0 ? [null] : events;
  return list.map((e): EventRoute => {
    const kind: EventKind = e === null ? 'PURCHASE' : e.kind;
    const label = e === null ? 'The claim' : `${KIND_WORDS[kind]}, ${dateWords(e.event_date)}`;
    const isPurchase = kind === 'PURCHASE';
    let window: WindowReading;
    let period: { start: string; end: string } | null = null;
    if (isPurchase || e === null) {
      window = amendmentWindowReading(db, c, todayIso);
      period = window.state === 'UNKNOWN' ? null : purchasePeriod(db, c);
    } else {
      const p = periodOfWork(db, c, e.event_date);
      if ('why' in p) window = { state: 'UNKNOWN', deadline: null, assumption: null, why: `Not known — ${p.why}.` };
      else { period = p; window = windowForPeriod(db, c, p.end, todayIso, ` The work falls in the period ${p.start} to ${p.end}.`); }
    }
    const make = (route: Route, why: string, first_open: EventRoute['first_open'] = null): EventRoute => ({
      event_id: e?.id ?? null, kind, label, route, window, first_open,
      deadline: route === 'W1' ? window.deadline : route === 'W2' ? first_open?.deadline ?? null : null, why,
      words: route === 'W2' && first_open !== null
        ? `${ROUTE_WORDS.W2} The first year still open ends on ${first_open.end}.` : ROUTE_WORDS[route],
    });
    // W3: the purchase fails the legal check (item 8 of Phase 159d), or the building is no longer owned.
    if (isPurchase && legal !== null && legal.level === 'RED') return make('W3', `the purchase fails the legal check: ${legal.headline}`);
    if (owned.value === 'NO') return make('W3', `${owned.why}, so there is no claim for this`);
    if (window.state === 'OPEN') return make('W1', `the window for its own period is ${window.why}`);
    if (window.state === 'UNKNOWN') return make('NOT_KNOWN', window.why);
    if (owned.value !== 'YES') return make('NOT_KNOWN', `the window for its own period ${window.why}, and ${owned.why}. Through the pool it needs the building still owned`);
    const fo = period === null ? null : firstOpen(db, c, period, todayIso);
    if (fo === null) return make('NOT_KNOWN', `the window for its own period ${window.why}; the client still owns it, but the first open period cannot be worked out yet. Record the client’s year end`);
    return make('W2', `the window for its own period ${window.why}, and ${owned.why}: it goes into the pool of the period ${fo.start} to ${fo.end}, whose return can be amended until ${fo.deadline}`, fo);
  });
}

/** True when every part of the claim takes a known route and at least one is claimed (W1 or W2). */
export function claimAlive(routes: readonly EventRoute[]): { alive: boolean; settled: boolean } {
  return { alive: routes.some((r) => r.route === 'W1' || r.route === 'W2'), settled: routes.every((r) => r.route !== 'NOT_KNOWN') };
}

/** One line per route, for a gate's "why". */
export function routesWhy(routes: readonly EventRoute[]): string {
  return routes.map((r) => `${r.label}: ${r.route === 'NOT_KNOWN' ? 'no route yet' : r.route} — ${r.why}`).join('; ');
}

/**
 * PHASE 159d (C9): A "CLEAR, WITH A DEADLINE" LEGAL RESULT IS READ AGAIN. The pack can be approved while there is still
 * time to fix the value (URGENT, with a deadline); nothing read it again, so a claim went on after the deadline passed
 * with nothing fixing the value. At the tax adviser's sign-off and at Reports: where the approved version was URGENT and
 * its deadline has passed (UK date), the legal check is read again on today's answers; unless it is now clear (an
 * election or a tribunal application recorded in time), the claim on the fixtures stops here.
 */
export function legalDeadlineNeed(db: Db, c: { id: string }, todayIso: string): { what: string; met: boolean; why: string } {
  const what = 'A legal check that was clear only until a deadline is still clear';
  const a = db.get<{ snapshot_json: string }>(
    'SELECT a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', [c.id]);
  let v: { level?: string; deadline?: string | null } | undefined;
  try { v = a === undefined ? undefined : (JSON.parse(a.snapshot_json) as { legal?: { verdict?: { level?: string; deadline?: string | null } } }).legal?.verdict; } catch { v = undefined; }
  if (v?.level !== 'URGENT' || typeof v.deadline !== 'string') return { what, met: true, why: 'the approved legal check carries no deadline' };
  const today = localDate(todayIso);
  if (today <= v.deadline) return { what, met: true, why: `the value must be fixed by ${v.deadline}; that date has not passed` };
  const now = legalVerdictForClaim(db, c.id, todayIso);
  if (now !== null && now.level === 'GREEN') return { what, met: true, why: `the deadline of ${v.deadline} has passed, and the legal check is now clear: ${now.headline}` };
  return { what, met: false, why: `the value had to be fixed by ${v.deadline}. That date has passed with nothing on record fixing it, so the claim on the fixtures stops (s.187A). If an election was made in time, record it. If not, reopen the valuation` };
}
