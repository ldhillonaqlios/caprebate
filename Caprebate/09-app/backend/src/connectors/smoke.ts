/**
 * THE LIVE SMOKE TEST — DOES THIS ACCOUNT, THIS KEY AND THIS ADDRESS ACTUALLY WORK? Phase 146g, 23 September 2026.
 *
 * WHY IT EXISTS. The handover page in the Developer Spec gives every outside service a row, and one column of that
 * row is "the live smoke test that proves it". Before this file there was no such thing: every suite runs on
 * recorded answers with no key and no network (Phase 146b's rule 3), which proves the code and proves nothing at all
 * about an account somebody has just opened. A developer who has just been issued a Companies House key needs one
 * command that says yes or no.
 *
 * WHAT IT IS NOT. It is NOT the application running. It does not open a gate, it does not touch the database, it
 * does not read a client, and it changes no switch that ships: `REGISTER_SWITCHES` stays exactly as it is, and this
 * turns ONE source on for ONE call, in a map of its own, in a command a person typed.
 *
 * PUBLIC TEST DATA ONLY, AND THAT IS THE RULE THIS FILE EXISTS INSIDE. "Can we make a few small, logged test lookups
 * to check a data connector works?" was answered by Lakhbir on 25 September 2026: yes, on five conditions (Word
 * question 170). The defaults below are Caprebate's own company number and a public address that belongs to nobody
 * we act for. SINCE PHASE 151g THE COMMAND ENFORCES THE FIVE CONDITIONS rather than printing a warning: who and why,
 * a log outside the repository, three lookups per switch-on, never a client's values, never a demonstration. That is
 * src/connectors/test-lookups.ts; this file still makes the one call and says whether it was taken.
 *
 * WHAT A PASS MEANS, EXACTLY. That the service accepted our call: the address in src/connectors/sources.ts is right,
 * the key is in the key file and the account is live. IT DOES NOT MEAN THE REGISTER HOLDS ANYTHING for the value you
 * passed — "nothing matched" is a PASS, because the account plainly works. The two are reported separately and are
 * never added together.
 *
 * IT WRITES THE SAME AUDIT ROW AS ANY OTHER CALL, because it goes through `callOutside` like everything else. It
 * needs an audit log to write to, and the command gives it one in a database of its own, in memory, which is thrown
 * away with the answer. What lasts is the test lookup log's one line (src/connectors/test-lookups.ts).
 */

import type { AuditLog } from '../audit.ts';
import type { SecretStore } from '../secrets.ts';
import { RateLimiter, type CallResult, type Transport } from './http.ts';
import { runConnector, REGISTER_SWITCHES, type Bundle, type ConnectorContext } from './registers.ts';
import { FREE_CONNECTORS } from './free-registers.ts';
import { PAID_CONNECTORS, PAID_NOT_CHOSEN } from './paid-registers.ts';
import type { Nation, ResearchSubject } from './nations.ts';
import type { PostcodeStore } from '../web/postcode-port.ts';

/** Every source a smoke test can be run for, free first. A source with no connector is not on the list. */
export const SMOKE_SOURCES: Readonly<Record<string, 'free' | 'paid' | 'not chosen'>> = Object.freeze({
  ...Object.fromEntries(Object.keys(FREE_CONNECTORS).map((k) => [k, 'free' as const])),
  ...Object.fromEntries(Object.keys(PAID_CONNECTORS).map((k) => [k, 'paid' as const])),
  ...Object.fromEntries(Object.keys(PAID_NOT_CHOSEN).map((k) => [k, 'not chosen' as const])),
});

/**
 * THE PUBLIC VALUES A SMOKE TEST ASKS ABOUT, and every one of them is a matter of public record that belongs to
 * nobody this business acts for.
 *
 *   · the company is CAP REBATE LTD, 17307313 — our own, confirmed on 18 September 2026;
 *   · the address is 70 Whitehall, London SW1A 2AS — the Cabinet Office, and about as public as a building gets.
 *
 * `--postcode`, `--company-number` and `--company-name` replace them. A CLIENT'S VALUE IS NEVER PASSED, and since
 * Phase 151g the command refuses one: held in CAPREBATE_DB, or, with no database, anything but these without
 * --not-a-client.
 */
export const SMOKE_DEFAULTS = Object.freeze({
  company_number: '17307313',
  company_name: 'CAP REBATE LTD',
  address_line_1: '70 Whitehall',
  town: 'London',
  postcode: 'SW1A 2AS',
});

export type SmokeValues = {
  company_number: string;
  company_name: string;
  address_line_1: string;
  town: string;
  postcode: string;
  /** PHASE 156a: the part of the UK, when the person running the test says it (--nation). Otherwise the ONS table. */
  nation?: Nation | null;
  /** PHASE 156a: the council area, when the person running the test says it (--council). CQC searches by council. */
  council?: string | null;
};

/** A subject built from typed values and from no database at all. `business_id` and the property's id are not real. */
export function smokeSubject(v: SmokeValues): ResearchSubject {
  return {
    business_id: '(a smoke test — no client)',
    name: v.company_name,
    company_number: v.company_number === '' ? null : v.company_number,
    sector: 'care_homes',
    property: {
      id: '(a smoke test — no property)',
      address_line_1: v.address_line_1 === '' ? null : v.address_line_1,
      address_line_2: null,
      town: v.town === '' ? null : v.town,
      postcode: v.postcode === '' ? null : v.postcode,
      // Left unsaid unless the person running the test says it (--nation, Phase 156a): the ONS lookup is what says which
      // part of the UK a postcode is in, and a smoke test that ASSUMED England would hide the mistake it is meant to
      // catch. Without the ONS table (none is installed on the Mac or the test website), EPC and CQC never called.
      jurisdiction: v.nation ?? null,
    },
  };
}

export type SmokeResult = {
  readonly source_id: string;
  readonly tier: 'free' | 'paid' | 'not chosen';
  /** Whether the SERVICE accepted our call. Nothing to do with whether it held a record. */
  readonly accepted: boolean;
  /** In plain words. Never a key, and never a value from the query. */
  readonly why: string;
  /** What the lookup came to: READ, NOT_MATCHED, CALL_FAILED, UNREADABLE, NOT_COVERED, or why it did not run. */
  readonly outcome: string;
  /** The last call's own outcome and status, where a call was made. */
  readonly call: { readonly outcome: string; readonly status: number | null; readonly attempts: number } | null;
  /** What it cost, in pence, from the supplier's own answer. Null where nobody said. */
  readonly cost_pence: number | null;
};

/**
 * WHETHER THE SERVICE TOOK OUR CALL, which is the only thing a smoke test is asking.
 *
 *   ACCEPTED   it answered — 200, or a 404 meaning it holds nothing, or a 400 meaning our query was wrong. The
 *              address is right, the key is right and the account is live. A 402 counts too: Homedata answering
 *              "your balance is empty" is an account that works and needs topping up, and the reason says so.
 *   NOT        401 or 403 (the key or the account), or nothing came back at all — refused before it left, timed
 *              out, or the connection broke. None of those proves an account works.
 *
 * A LOOKUP THAT NEVER MADE A CALL IS NOT A PASS, whatever it says. "Not switched on", "no key", "this register does
 * not cover that address" and "nothing to search on" all mean nobody was asked.
 */
function acceptedBy(call: CallResult | null): boolean {
  if (call === null || call.status === null) return false;
  if (call.outcome === 'TIMEOUT' || call.outcome === 'NETWORK' || call.outcome === 'REFUSED') return false;
  return call.status !== 401 && call.status !== 403;
}

export type SmokeDeps = {
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** The ONS postcode table, for the one lookup that reads it from disk rather than over the network. */
  readonly postcodeStore?: PostcodeStore | null;
  readonly sleep?: (ms: number) => Promise<void>;
};

/**
 * ONE SOURCE, ONE LOOKUP, LIVE. The source's switch is turned on IN A MAP OF ITS OWN — `REGISTER_SWITCHES` is not
 * touched and nothing else is on — and both gates are reported shut, because a smoke test opens neither and the
 * audit row must say so.
 */
export async function smokeOne(source_id: string, values: SmokeValues, d: SmokeDeps): Promise<SmokeResult> {
  const tier = SMOKE_SOURCES[source_id];
  if (tier === undefined) {
    return { source_id, tier: 'free', accepted: false, outcome: 'NO_CONNECTOR', cost_pence: null, call: null,
      why: `there is no connector for ${source_id}, so there is nothing to try` };
  }
  const built = (FREE_CONNECTORS[source_id] ?? PAID_CONNECTORS[source_id] ?? PAID_NOT_CHOSEN[source_id])!;
  const switches = { ...Object.fromEntries(Object.keys(REGISTER_SWITCHES).map((k) => [k, false])), [source_id]: true };
  const ctx: ConnectorContext = {
    deps: { audit: d.audit, now: d.now, transport: d.transport, limiter: new RateLimiter(),
      ...(d.sleep === undefined ? {} : { sleep: d.sleep }) },
    actor_id: null, actor_role: null, claim_id: null,
    // Neither gate is open, and a smoke test does not open one. The row says exactly that.
    gate: { free_gate_open: false, engagement_signed: false, switched_on: true },
    secrets: null,
  };
  // PHASE 156a: a council area the person typed stands where the ONS table's answer would (CQC searches by council).
  const earlier = new Map<string, Bundle>();
  if (values.council != null && values.council.trim() !== '') earlier.set('ONS_POSTCODE', { records: [], facts: { ons_lad_name: values.council.trim() } });
  const query = built.query(smokeSubject(values), earlier, d.postcodeStore ?? null);
  const run = await runConnector(built.connector, ctx, query, { state: 'NOT_RUN', detail: '' }, d.secrets, switches);
  const call: CallResult | null = run.call;
  const accepted = run.state === 'FIRED' || acceptedBy(call);
  return {
    source_id, tier, accepted, why: run.detail,
    outcome: run.state === 'FIRED' ? 'READ' : run.state === 'NOT_RUN' ? `NOT_RUN (${run.readiness})` : (run.failure_code ?? 'FAILED'),
    call: call === null ? null : { outcome: call.outcome, status: call.status, attempts: call.attempts },
    cost_pence: run.cost_pence === 0 && tier === 'free' ? 0 : (call?.cost_pence ?? null),
  };
}
