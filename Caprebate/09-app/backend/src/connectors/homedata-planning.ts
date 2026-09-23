/**
 * PLANNING BY UPRN, FROM THE PAID SUPPLIER — BUILT, SWITCHED OFF, AND NOT CHOSEN.
 * Phase 146d, 23 September 2026. Switched off: REGISTER_SWITCHES.HOMEDATA_PLANNING is false.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHY IT IS NOT TURNED ON
 *
 * Planning is the one lookup in this system that is matched on ADDRESS TEXT rather than on an identifier, and it is
 * matched against the messiest addresses of any source we call — a planning register's address lines are typed by
 * hand at 400-odd local authorities. Homedata sells the same applications keyed BY UPRN, and its `planning_history`
 * slug returns all six of the fields the register permits: reference, status, decision date, submitted date,
 * description and the UPRN itself. Keyed on the identifier, planning comes out of the address-matching path
 * altogether.
 *
 * WHAT IT WOULD REPLACE IS WEAK ON BOTH LEGS, and that is on the record rather than an impression:
 *   · PlanIt asks for one request a minute and about 300 a day, and its owner writes that it "would not be wise to
 *     base any commercial services on the API".
 *   · planning.data.gov.uk says of its own planning application dataset that it "is incomplete and is not yet ready
 *     for use".
 *
 * AND YET IT STAYS OFF, AND PLANIT STAYS THE SOURCE OF RECORD. Moving planning here moves it from the FREE tier to
 * the PAID tier, and the two tiers are not a billing detail: a free lookup fires once the client has been told what
 * we do, a paid one only after an engagement letter is signed. So planning would stop firing before signature, and
 * the free estimate — the thing a prospective client sees before they have signed anything — would lose planning
 * entirely. WHETHER THAT TRADE IS WORTH MAKING IS NOT A BUILD DECISION AND IS NOT THIS PHASE'S TO TAKE. It is
 * written up for Lakhbir, with a recommendation, and this connector sits beside PlanIt in the paid map waiting for
 * the answer. Turning it on is one word in REGISTER_SWITCHES.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SLUG, NOT THE SEARCH — AND THAT IS A NAME-LEAK DECISION AS WELL AS A KEYING ONE
 *
 * The supplier sells planning twice. `/planning/search/?postcode=` (5 tokens) searches by postcode and its own
 * documentation says it returns "application status, type, decision dates, and CASE OFFICER DETAILS" — a named
 * council employee who is not our client, has no connection to the claim, and whom the register's whitelist never
 * contemplated. `?with=planning_history` is keyed by UPRN and is documented as the property's own applications.
 * We ask for the slug. The excluded-field list bars `officer_*` and `case_officer_*` either way (that is what the
 * one door checks), but the narrower call is the one that never brings a name into this process to begin with.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type Bundle, type LookupResult } from './registers.ts';
import { jurisSource, type Nation } from './nations.ts';

export type HomedataPlanningQuery = {
  readonly nation: Nation | null;
  /** From the paid address lookup on this same click. No UPRN, no lookup — this route has no other key. */
  readonly uprn: string | null;
};

/** The slug and its published weight, in tokens (= pence). */
export const PLANNING_HISTORY_SLUG = 'planning_history';
export const PLANNING_HISTORY_TOKENS = 5;

/** How many applications at the property we keep, most recent first. The same figure the free route keeps. */
export const MAX_KEPT = 20;

const apiKey = (s: OwnerSecrets | null): Record<string, string> => ({ authorization: `Api-Key ${s?.get('HOMEDATA_API_KEY') ?? ''}` });
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const day = (v: unknown): string | null => { const s = str(v); return s !== null && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };

/**
 * ONE APPLICATION, AS THE WHITELIST NAMES ITS FIELDS. Read key by key, so a field the supplier adds later — an
 * officer, an applicant, a comment — cannot arrive by being in the answer. Nothing is copied wholesale.
 */
export function applicationFields(r: Record<string, unknown>, uprn: string): Record<string, unknown> | null {
  const reference = str(r['reference'] ?? r['planning_reference'] ?? r['application_reference']);
  if (reference === null) return null;
  const f: Record<string, unknown> = { planning_reference: reference, planning_uprn: uprn };
  const decision = str(r['status'] ?? r['decision'] ?? r['planning_decision']);
  if (decision !== null) f.planning_decision = decision;
  const decided = day(r['decision_date'] ?? r['decided_date']);
  if (decided !== null) f.planning_decision_date = decided;
  const received = day(r['submitted_date'] ?? r['received_date'] ?? r['start_date']);
  if (received !== null) f.planning_received_date = received;
  const description = str(r['description']);
  if (description !== null) f.planning_description = description;
  return f;
}

export const homedataPlanning = defineSteppedConnector<HomedataPlanningQuery>({
  source_id: 'HOMEDATA_PLANNING', service_id: 'HOMEDATA_PLANNING', owner: 'HOMEDATA_ADDRESS', needs: ['HOMEDATA_API_KEY'],
  first: (q, s) => ({ endpoint: '/property/{uprn}/', params: { uprn: q.uprn ?? '' }, query: { with: PLANNING_HISTORY_SLUG }, headers: apiKey(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    if (q.nation === null) {
      return { kind: 'NOT_COVERED', why: 'we do not know which part of the UK the property is in, and these planning sources cover England and Wales' };
    }
    if (jurisSource(q.nation, 'planning') !== 'PLANNING') {
      return { kind: 'NOT_COVERED', why: 'these planning sources cover England and Wales, and the property is elsewhere' };
    }
    if (q.uprn === null) {
      return {
        kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', calls: [],
        why: 'this route is keyed on the property’s identifier and the paid address lookup did not supply one',
      };
    }
    const c = await step({
      endpoint: '/property/{uprn}/', params: { uprn: q.uprn }, query: { with: PLANNING_HISTORY_SLUG }, headers: apiKey(secrets),
    });
    const calls: CallResult[] = [c];
    if (c.outcome !== 'OK' || c.body === null) return { kind: 'CALL_FAILED', call: c, calls };
    let list: unknown[] | null = null;
    try {
      const j = obj(JSON.parse(c.body));
      const held = j?.[PLANNING_HISTORY_SLUG];
      const inner = obj(held);
      list = Array.isArray(held) ? held : Array.isArray(inner?.['applications']) ? inner['applications'] as unknown[] : null;
    } catch { list = null; }
    if (list === null) return { kind: 'UNREADABLE', call: c, calls };

    const records = list
      .flatMap((r) => { const o = obj(r); const f = o === null ? null : applicationFields(o, q.uprn as string); return f === null ? [] : [f]; })
      .sort((a, b) => String(b['planning_received_date'] ?? '').localeCompare(String(a['planning_received_date'] ?? '')))
      .slice(0, MAX_KEPT)
      .map((f) => ({ sourceId: 'PLANNING', entityId: String(f['planning_reference']), fields: f }));

    const bundle: Bundle = { records, facts: { planning_applications: records.length } };
    return {
      kind: 'READ', bundle, calls,
      note: `looked up the property’s own planning history by its identifier, and we keep ${records.length} ` +
        `planning ${records.length === 1 ? 'application' : 'applications'} and where they came from`,
    };
  },
});
