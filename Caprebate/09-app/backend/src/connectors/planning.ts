/**
 * PLANNING APPLICATIONS AT THE PROPERTY — planning.data.gov.uk, then PlanIt. ENGLAND AND WALES.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.PLANNING is false.
 *
 * THE HIGHEST-RISK SOURCE IN THE REGISTER (the name exclusion register, PLANNING's note): a planning record can carry
 * applicants, agents, objectors and neighbours, none of whom is our client. So only five fields are ever read — the
 * reference, the decision, the decision date, the date received and the description — and nothing that names a
 * person is read at all, matched or not (the S10 spec, A.6).
 *
 * TWO SERVICES, IN THIS ORDER, both read 23 September 2026 (the addresses and date are in SUPPLIER_DOCS):
 *
 *   1. planning.data.gov.uk — the government's planning data platform, no key: `/entity.json?dataset=planning-
 *      application&q=<postcode>`. ITS OWN DATASET PAGE SAYS it "is incomplete and is not yet ready for use", and local
 *      planning authorities are not yet required to publish to it. So an empty answer there is common and means only
 *      that it has nothing; the lookup goes on.
 *   2. PlanIt (https://www.planit.org.uk/api — never the bare planit.org.uk), a volunteer-run aggregator, no key:
 *      `/api/applics/json?pcode=<postcode>&krad=…`. ITS OWNER ASKS for one request a minute, about 300 a day, and "an
 *      identifier string, including your email, in the User-Agent field" — requests without one are blocked. Our own
 *      limit is exactly that (src/connectors/sources.ts), and `PLANIT_USER_AGENT` below is the identifier. The owner
 *      also writes that "it would not be wise to base any commercial services on the API"; that is recorded in
 *      SUPPLIER_DOCS for whoever decides whether this switch is ever turned on.
 *
 * MATCHING: each application's address is split and scored against the typed address; applications at the same
 * address count as one candidate, and on a clear ACCEPT every application at that address is kept (the most recent
 * `PLANNING_MAX_KEPT`). Anything short of ACCEPT keeps nothing.
 */

import type { CallResult } from './http.ts';
import { defineSteppedConnector, type LookupResult, type StepRequest } from './registers.ts';
import {
  addressFromLines, matchAddress, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, postcodeKey,
  type Candidate, type MatchResult, type MeasureHook, type PickQuery, type Scored,
} from './matching.ts';
import { jurisSource, type Nation, type TypedProperty } from './nations.ts';

export type PlanningQuery = {
  readonly property: TypedProperty | null; readonly nation: Nation | null;
  /** The 200-property measurement only (tools/match-measure.ts). Never set by the research flow. */
  readonly measure?: MeasureHook;
} & PickQuery;

/** The identifier PlanIt's owner asks for: who we are and how to reach us. Our business mailbox, never a person's. */
export const PLANIT_USER_AGENT = 'CapRebate register lookups (contact@caprebate.co.uk)';
/** The circle PlanIt searches around the postcode's centre, in kilometres. Candidates at another postcode are dropped. */
export const PLANIT_RADIUS_KM = '0.2';
/** How many applications at a matched address we keep, the most recent first. */
export const PLANNING_MAX_KEPT = 20;

type Application = {
  readonly reference: string;
  readonly decision: string | null;
  readonly decided: string | null;
  readonly received: string | null;
  readonly description: string | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const day = (v: unknown): string | null => { const s = str(v); return s !== null && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

function parse(body: string | null, key: string): unknown[] | null {
  if (body === null) return null;
  try { const j = obj(JSON.parse(body)); return Array.isArray(j?.[key]) ? j[key] as unknown[] : null; } catch { return null; }
}

/**
 * A planning.data.gov.uk entity. Its `address-text` is read to match on and is never kept. The search was made ON the
 * typed postcode, so an address that states none is taken to be at it — the platform did the blocking (S10 A.2 step 2).
 */
function fromPlanningData(e: Record<string, unknown>, searched: string): Candidate<Application[]> | null {
  const reference = str(e['reference']);
  const address = str(e['address-text']);
  if (reference === null || address === null) return null;
  const pc = /([A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\s*$/i.exec(address)?.[1] ?? searched;
  return {
    address: addressFromLines([address.replace(/,?\s*[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}\s*$/i, '')], pc, null),
    payload: [{ reference, decision: str(e['planning-decision']), decided: day(e['decision-date']), received: day(e['start-date']), description: str(e['description']) }],
  };
}

/** A PlanIt record. Its `name` is PlanIt's national id for the application — not a person's name. */
function fromPlanIt(r: Record<string, unknown>): Candidate<Application[]> | null {
  const reference = str(r['reference']) ?? str(r['uid']) ?? str(r['name']);
  const address = str(r['address']);
  if (reference === null || address === null) return null;
  return {
    address: addressFromLines([address], str(r['postcode']), null),
    payload: [{ reference, decision: str(r['app_state']), decided: day(r['decided_date']), received: day(r['start_date']), description: str(r['description']) }],
  };
}

export function applicationFields(a: Application): Record<string, unknown> {
  const f: Record<string, unknown> = { planning_reference: a.reference };
  if (a.decision !== null) f.planning_decision = a.decision;
  if (a.decided !== null) f.planning_decision_date = a.decided;
  if (a.received !== null) f.planning_received_date = a.received;
  if (a.description !== null) f.planning_description = a.description;
  return f;
}

/**
 * PHASE 146h: `took` is the candidate we are keeping and `why` says how we came by it — an ACCEPT's own words, or a
 * person's pick. It used to take the whole match and read `m.best`, which could only ever be an ACCEPT.
 */
function kept(took: Scored<Application[]>, why: string, where: string, calls: CallResult[]): LookupResult {
  const apps = [...took.candidate.payload]
    .sort((a, b) => (b.received ?? '').localeCompare(a.received ?? ''))
    .slice(0, PLANNING_MAX_KEPT);
  const records = apps.map((a) => ({ sourceId: 'PLANNING', entityId: a.reference, fields: applicationFields(a) }));
  return {
    kind: 'READ', calls, bundle: { records, facts: { planning_applications: records.length } },
    note: `looked up on ${where} — ${why}, and we keep ${records.length} planning ${records.length === 1 ? 'application' : 'applications'} and where they came from`,
  };
}

/**
 * A CANDIDATE'S KEY ON EITHER PLANNING SERVICE: the reference of the FIRST application at that address, because
 * applications at one address are merged into one candidate. It is stable for one request, which is what a pick
 * needs, and it is a reference the register itself published rather than a position in a list.
 */
const planningKey = (apps: Application[]): string => apps[0]?.reference ?? '';

/**
 * PHASE 146h: THE TWO SERVICES ARE ASKED IN ORDER AND A PICK BELONGS TO ONE OF THEM. A choice made from
 * planning.data.gov.uk's list must not be looked for in PlanIt's, so the pick is applied per service and a key that
 * is not in THIS service's list is simply not a choice here — the next service is asked as it always was. Only when
 * a choice was made and neither service holds it does the lookup report that it has gone.
 */
function pickOn(
  m: MatchResult<Application[]>, q: PlanningQuery, where: string, calls: CallResult[],
): LookupResult | null {
  const pick = applyPick(m, q, { profile: 'PLANNING', register: where, keyOf: planningKey });
  if (pick.kind === 'CHOSEN') return kept(pick.best, pickedNote(pick.best.score, where), where, calls);
  if (m.status === 'ACCEPT' && m.best !== null) return kept(m.best, m.why, where, calls);
  return null;
}

export const planning = defineSteppedConnector<PlanningQuery>({
  source_id: 'PLANNING', service_id: 'PLANNING', owner: null, needs: [],
  also: ['PLANNING_DATA'],
  first: (q) => ({ endpoint: '/api/applics/json', query: { pcode: postcodeKey(q.property?.postcode), krad: PLANIT_RADIUS_KM, pg_sz: '300' }, headers: { 'user-agent': PLANIT_USER_AGENT } }),
  async lookup(step, q): Promise<LookupResult> {
    if (q.nation === null) return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in, and these planning sources cover England and Wales' };
    if (jurisSource(q.nation, 'planning') !== 'PLANNING') return { kind: 'NOT_COVERED', why: 'these planning sources cover England and Wales, and the property is elsewhere' };
    const pc = postcodeKey(q.property?.postcode);
    if (q.property === null || pc === '') return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'there is no postcode we can read for the property', calls: [] };
    const typed = addressFromLines([q.property.address_line_1, q.property.address_line_2], q.property.postcode, q.property.town);
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => { const c = await step(r); calls.push(c); return c; };
    const merge = (a: Application[], b: Application[]): Application[] => [...a, ...b];

    // 1 · planning.data.gov.uk. A failure here is not the end: PlanIt is asked next.
    const pd = await call({ service_id: 'PLANNING_DATA', endpoint: '/entity.json', query: { dataset: 'planning-application', q: pc, limit: '500' } });
    const pdRows = pd.outcome === 'OK' ? parse(pd.body, 'entities') : null;
    if (pdRows !== null) {
      const cands = pdRows.flatMap((e) => { const o = obj(e); const c = o === null ? null : fromPlanningData(o, pc); return c === null ? [] : [c]; });
      const m = matchAddress(typed, cands, MATCH_THRESHOLDS.PLANNING, 'planning.data.gov.uk', merge);
      q.measure?.({ profile: 'PLANNING', register: 'planning.data.gov.uk', match: m, top_address: m.top?.candidate.address ?? null });
      const done = pickOn(m, q, 'planning.data.gov.uk', calls);
      if (done !== null) return done;
    }

    // 2 · PlanIt, within its owner's one request a minute.
    const pi = await call({
      endpoint: '/api/applics/json', query: { pcode: pc, krad: PLANIT_RADIUS_KM, pg_sz: '300' },
      headers: { 'user-agent': PLANIT_USER_AGENT },
    });
    if (pi.outcome !== 'OK' || pi.body === null) return { kind: 'CALL_FAILED', call: pi, calls };
    const piRows = parse(pi.body, 'records');
    if (piRows === null) return { kind: 'UNREADABLE', call: pi, calls };
    const cands = piRows.flatMap((r) => { const o = obj(r); const c = o === null ? null : fromPlanIt(o); return c === null ? [] : [c]; });
    const m = matchAddress(typed, cands, MATCH_THRESHOLDS.PLANNING, 'PlanIt', merge);
    q.measure?.({ profile: 'PLANNING', register: 'PlanIt', match: m, top_address: m.top?.candidate.address ?? null });
    const done = pickOn(m, q, 'PlanIt', calls);
    if (done !== null) return done;
    /* A choice was made and neither service's list still holds it. Nothing is kept, and the words say to look again
       rather than leaving it reading like a plain no-match. */
    const chose = typeof q.chosen === 'string' && q.chosen.trim() !== '';
    if (chose) return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
    return { kind: 'NOT_MATCHED', code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH', why: m.why, calls };
  },
});
