/**
 * THE REGISTER CONNECTORS — the shape every one is built to, the switch each one has, and the two gates.
 * Phase 146b, 22 September 2026, from src/stubs/registers.ts.
 *
 * WHAT MOVED HERE AND WHAT DID NOT. `gateStatus` and `planResearch` moved here unchanged, word for word, and
 * src/stubs/registers.ts re-exports them, so every caller and every existing test reads the same functions.
 * `ingestRegisterRecord` — THE ONE DOOR register data enters the database by — stays in src/stubs/registers.ts,
 * because test/seed.test.ts asserts that file is the only one under src/ that writes register_records, and the
 * phase's rule is that the existing register tests pass unchanged. Two files, one door: this file never writes to the
 * database; it fetches and shapes, and the caller stores through that door, where N2 is checked.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE CONNECTOR SHAPE — configured(), fetch(), toBundle()
 *
 *   configured(secrets)  READY, or NOT_CONFIGURED with the missing key NAMES, or SWITCHED_OFF. A state, never a throw.
 *   fetch(ctx, query)    one call through src/connectors/http.ts — the only way out — which writes the audit row.
 *   toBundle(body, q)    the answer as register records (for the one door) and facts, or null if it cannot be read.
 *
 * `runConnector` puts one through its paces in the only safe order: the gate decision first (made by
 * `stateUnderGates` in src/web/research.ts and passed in — NOT re-decided here, so there is no second gate), then the
 * source's own switch, then its keys, then the call, then the reading. Anything short of a clean reading is a source
 * that did not run or did not work, and its facts stay asked (N4). Nothing refuses and nothing throws.
 *
 * FIXTURE MODE. Every test builds its connector context with `fixtureTransport` (src/connectors/http.ts): recorded
 * answers shaped from the supplier's published documentation, so every suite passes with no key and no network.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SWITCHES — ONE PER SOURCE, EVERY ONE OFF
 *
 * `REGISTER_SWITCHES` sits beside the free gate (CB_REGISTRY.precondition, read by `registryGate()` in
 * src/web/engine.ts) and is NOT a second gate. The gates say whether we MAY consult a source for this client — a
 * published privacy notice, a signed engagement. A switch says whether the connector for it is turned on at all —
 * built, checked against the supplier, keys installed, and someone deciding it should run. A source runs only when
 * its gate is open AND its switch is on. With every switch off, "Run the research" contacts nobody, exactly as it
 * did before this phase, and the research panel says "not switched on" beside each lookup.
 *
 * THE TWO GATES ARE STILL REAL AND STILL NOT OURS TO OPEN (the words below are the stub's, kept):
 *
 *   FREE sources are gated on a published privacy notice. CB_REGISTRY.precondition is `enabled:false` and its own
 *   `requires` string says why. Show that state; do not flip it; DO NOT BUILD A SECOND GATE.
 *
 *   PAID sources are gated on a signed engagement asserted SERVER-SIDE, plus one operator click that then fires
 *   everything outstanding. The operator picks the moment, not the calls: there is deliberately no per-source
 *   confirmation.
 */

import type { IngestedRecord } from '../../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import type { OwnerSecrets, SecretOwner, SecretStore } from '../secrets.ts';
import { callOutside, type CallDeps, type CallRequest, type CallResult, type GateSnapshot } from './http.ts';
import { BOUNDARY_FETCHING_SWITCHED_ON } from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { onTestWebsite, type Env } from './place.ts';

export type Tier = 'FREE' | 'PAID';
export type SourceState = 'NOT_RUN' | 'FIRED' | 'FAILED' | 'NOT_PERMITTED_YET';

export type GateStatus = {
  readonly free_enabled: boolean;
  readonly free_requires: string;
  readonly paid_requires_signed_engagement: true;
};

/**
 * Read off CB_REGISTRY rather than restated. The engine package is the
 * authority on whether the free gate is open, and there is exactly one of it.
 */
export function gateStatus(registry: {
  precondition?: { enabled?: unknown; requires?: unknown };
}): GateStatus {
  const pre = registry.precondition ?? {};
  return {
    free_enabled: pre.enabled === true,
    free_requires: typeof pre.requires === 'string' ? pre.requires : '(not stated)',
    paid_requires_signed_engagement: true,
  };
}

/**
 * What a "Run the research" click would do — and today does not. Every source
 * outstanding is marked against its gate. NOTHING IS CALLED.
 */
export function planResearch(
  sources: readonly { source_id: string; tier: Tier; state: SourceState }[],
  gates: GateStatus,
  engagementSigned: boolean,
): { source_id: string; next_state: SourceState; reason: string }[] {
  return sources.map((s) => {
    if (s.state === 'FIRED') return { source_id: s.source_id, next_state: 'FIRED', reason: 'already fired' };
    if (s.tier === 'FREE' && !gates.free_enabled) {
      return {
        source_id: s.source_id, next_state: 'NOT_PERMITTED_YET',
        reason: 'free sources are gated on a published privacy notice: ' + gates.free_requires,
      };
    }
    if (s.tier === 'PAID' && !engagementSigned) {
      return {
        source_id: s.source_id, next_state: 'NOT_PERMITTED_YET',
        reason: 'paid sources are gated on a signed engagement, asserted server-side',
      };
    }
    // Permitted — and still not fired, because the connector does not exist.
    return {
      source_id: s.source_id, next_state: 'NOT_RUN',
      reason: 'permitted, but the connector is not built in this release',
    };
  });
}

export const STUB_NOTICE =
  'NOT CALLED — register connectors are stubbed in this build. No external source was contacted.';

/* ================================================================== *
 * THE SWITCHES
 * ================================================================== */

/**
 * ONE SWITCH PER SOURCE THE RESEARCH PANEL LISTS, EVERY ONE OFF. Keyed by the source register's id. A source with no
 * entry here is off (N4: not known is not a yes), and a test checks that every source the panel lists has one.
 * Turning one on is a one-word change and a decision: the connector built (Phases 146c and 146d), tried on public
 * test data, its keys in the key file, and — for any live lookup on a client — the data protection officer's answer
 * to "Can we make a few small, logged test lookups to check a data connector works?".
 */
export const REGISTER_SWITCHES: Readonly<Record<string, boolean>> = Object.freeze({
  CH_COMPANY: false,
  CH_PSC: false,
  CQC: false,
  /* PHASE 155 (line 1): BUILT — Care Inspectorate Wales's directory, imported on this server (src/connectors/register-files.ts). Still off. */
  CIW: false,
  /* PHASE 155 (line 2): NEW — the Care Inspectorate (Scotland), its datastore imported on this server the same way. Off. */
  CARE_INSPECTORATE: false,
  EPC: false,
  HMLR_PPD: false,
  /* PHASE 155 (line 3): NOT BUILT, AND NOT BUILDABLE AS THINGS STAND — the VOA's licence restricts its rating list to
     business rates purposes (the source register's VOA_RATING_LIST). The switch stays so a case stamp reads as before. */
  VOA: false,
  PLANNING: false,
  ONS_POSTCODE: false,
  HOMEDATA_ADDRESS: false,
  /* PHASE 146k: RETIRED. The title register is looked up by hand (src/web/title-by-hand.ts); its connector is in
     PAID_RETIRED, in no map a click reads, so this switch turns nothing on. It stays so a case stamp reads as before. */
  HMLR_TITLE: false,
  BCIS: false,
  /* PHASE 146d, item 18: the paid planning route, built beside PlanIt. It is not a row on the research panel — the
     register source it reads for is PLANNING — so it is a switch with no catalogue entry.
     PHASE 153b, 4 October 2026 (Word question 202, Lakhbir's): CHOSEN, on our recommendation — Homedata, by the
     property's own number, about 5p on the same click as the address lookup, after the engagement letter is signed;
     PlanIt kept built as the free fallback. See PLANNING_ROUTE below. STILL OFF until the Homedata account is open. */
  HOMEDATA_PLANNING: false,
  /* PHASE 150, 24 September 2026: the land boundary. NOT A SECOND SWITCH — it IS the boundary module's own
     BOUNDARY_FETCHING_SWITCHED_ON, read here so the research panel shows the same answer the fetcher obeys
     (src/connectors/inspire.ts). It is false. */
  HMLR_INSPIRE: BOUNDARY_FETCHING_SWITCHED_ON,
  /* Phase 151: the postcode check at the address question has its own switch, POSTCODE_CHECK, off. Never run by the button. */
  POSTCODES_IO: false,
});

/**
 * WHICH ROUTE IS CHOSEN WHERE A REGISTER SOURCE HAS TWO. PHASE 153b, 4 October 2026 — Word question 202 ("Should we pay
 * for planning history, or keep the free one that asks us to go slowly?"), Lakhbir's, built on our recommendation for
 * him to confirm. Planning history can come from PlanIt (free, one volunteer, about 300 searches a day, asks not to be
 * built on for a paid service) or from Homedata (paid, by the property's own number, so fewer wrong matches). Homedata
 * is the chosen route and PlanIt the built fallback. Choosing switches NOTHING on: HOMEDATA_PLANNING above stays false
 * until the Homedata account is open, and as a paid lookup it runs only after a signed engagement either way.
 */
export const PLANNING_ROUTE = Object.freeze({
  register_source: 'PLANNING',
  chosen: 'HOMEDATA_PLANNING',
  fallback: 'PLANNING',
  question: 202,
  chosen_on: '2026-10-04',
  words: 'Chosen route: Homedata planning. It finds the property by its own number, for about 5p, once the letter is ' +
    'signed. It is switched off until our Homedata account is open. PlanIt, the free route, stays built as a fallback.',
} as const);

/** Only `true` is on. An absent source, and anything else, is off. */
export function switchedOn(source_id: string, switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES): boolean {
  return switches[source_id] === true;
}

/**
 * 2 OCTOBER 2026 — THE FREE LOOKUPS, SWITCHED ON FOR THE TEST WEBSITE ONLY (the survey pack, stage 6).
 *
 * Lakhbir, asked which lookups to switch on for the test website: "All the free ones" — the energy certificate (EPC),
 * the Land Registry's price paid (HMLR_PPD), planning applications (PLANNING) and the care regulator (CQC). The paid
 * ones (Homedata, the land boundary) stay off, and so does every switch above: REGISTER_SWITCHES is unchanged.
 *
 * WHAT IT WAIVES, ON THE TEST WEBSITE AND NOWHERE ELSE: for these four sources only, the free-tier gate (a published
 * privacy notice, CB_REGISTRY.precondition, and with it CA7's match measurement) and the five conditions of the test
 * lookups (src/connectors/test-lookups.ts): they run for the test website's own clients, which are invented. It waives
 * nothing else: a lookup that needs the signed engagement (CA2) still waits for it, a client who chose to answer the
 * questions themselves is still not looked up, and each source still needs its key. As the postcode check's waiver
 * (src/connectors/postcode-check.ts): before real visitors, publish the notice, then take this waiver out.
 *
 * WHERE IT HOLDS: on the deployed test website (Vercel says so: src/connectors/place.ts), or a copy started with
 * CAPREBATE_LOOKUPS_HERE=1. A copy on a computer, and every test that does not say otherwise, sees the switches above.
 */
export const TEST_WEBSITE_LOOKUPS = Object.freeze({
  sources: Object.freeze(['CQC', 'EPC', 'HMLR_PPD', 'PLANNING']) as readonly string[],
  waiver_record: 'Lakhbir Dhillon, 2 October 2026, in the chat with Claude, asked which lookups to switch on for the test ' +
    'website: "All the free ones" (EPC, price paid, planning applications, CQC). The privacy notice is a draft and is not ' +
    'published. Test website only; real visitors are not affected.',
});

export const LOOKUPS_LOCAL_OPT_IN = 'CAPREBATE_LOOKUPS_HERE';

/** True where the waiver holds: the test website, or a copy started with CAPREBATE_LOOKUPS_HERE=1. */
export function lookupsWaivedHere(env: Env = process.env): boolean {
  return onTestWebsite(env) || (env[LOOKUPS_LOCAL_OPT_IN] ?? '').trim() === '1';
}

/** True when this source's free-tier gate is waived here. */
export function freeGateWaived(source_id: string, env: Env = process.env): boolean {
  return lookupsWaivedHere(env) && TEST_WEBSITE_LOOKUPS.sources.includes(source_id);
}

/** The switches for this copy: REGISTER_SWITCHES, with the waived sources on where the waiver holds. */
export function switchesHere(env: Env = process.env): Readonly<Record<string, boolean>> {
  if (!lookupsWaivedHere(env)) return REGISTER_SWITCHES;
  return Object.freeze({ ...REGISTER_SWITCHES, ...Object.fromEntries(TEST_WEBSITE_LOOKUPS.sources.map((id) => [id, true])) });
}

/* ================================================================== *
 * THE CONNECTOR SHAPE
 * ================================================================== */

export type Readiness = {
  readonly state: 'READY' | 'NOT_CONFIGURED' | 'SWITCHED_OFF';
  /** In plain words, naming keys by NAME only. */
  readonly why: string;
};

/** What a connector's reading hands back: records for the one door, and facts for the claim. */
export type Bundle = {
  readonly records: readonly IngestedRecord[];
  readonly facts: Readonly<Record<string, unknown>>;
};

export type ConnectorContext = {
  readonly deps: CallDeps;
  readonly actor_id: string | null;
  readonly actor_role?: string | null;
  readonly claim_id: string | null;
  readonly gate: GateSnapshot;
  /** This connector's own keys, and no other connector's. */
  readonly secrets: OwnerSecrets | null;
};

export interface RegisterConnector<Q> {
  readonly source_id: string;
  /** The row in src/connectors/sources.ts the call goes through. */
  readonly service_id: string;
  /** Whose keys it reads; null for a service that needs none. */
  readonly owner: SecretOwner | null;
  configured(secrets: SecretStore, switches?: Readonly<Record<string, boolean>>): Readiness;
  fetch(ctx: ConnectorContext, query: Q): Promise<CallResult>;
  /** Null when the answer cannot be read. Never a guessed or zero value for a fact the answer did not give. */
  toBundle(body: string, query: Q): Bundle | null;
  /**
   * PHASE 146c: THE WHOLE LOOKUP, which may be several calls — a search, then the one record that matched. A connector
   * that makes one call gets this from `fetch` and `toBundle`; a connector built with `defineSteppedConnector` writes
   * its own. `runConnector` calls this, and only after the gate, the switch and the key.
   */
  lookup(ctx: ConnectorContext, query: Q): Promise<LookupResult>;
}

/**
 * WHAT A LOOKUP CAME TO. Phase 146c. Five endings, and only READ keeps anything.
 *
 *   READ          the register answered and we could read it: records for the one door, facts for the claim.
 *                 A READ with no record is still a READ — Companies House holding no accounts that can be read by a
 *                 machine is an ordinary answer, not an error.
 *   CALL_FAILED   a call did not come back as an answer we could use (refused, over our limit, timed out, an error).
 *   UNREADABLE    it answered, but not in a form we could read.
 *   NOT_MATCHED   it answered, but nothing matched this client closely enough (src/connectors/matching.ts), or there
 *                 was nothing to search on. The fact stays asked. NO MATCH IS NOT A SOLE TRADER.
 *   NOT_COVERED   this register does not cover this property — a Scottish address for the energy certificates, a care
 *                 home for residential sale prices — so nothing was sent and the fact is asked.
 */
export type LookupResult =
  | { readonly kind: 'READ'; readonly bundle: Bundle; readonly calls: readonly CallResult[]; readonly note: string }
  | { readonly kind: 'CALL_FAILED'; readonly call: CallResult; readonly calls: readonly CallResult[] }
  | { readonly kind: 'UNREADABLE'; readonly call: CallResult; readonly calls: readonly CallResult[] }
  | { readonly kind: 'NOT_MATCHED'; readonly code: 'NO_MATCH' | 'MATCH_REVIEW' | 'INSUFFICIENT_INPUT'; readonly why: string; readonly calls: readonly CallResult[] }
  | { readonly kind: 'NOT_COVERED'; readonly why: string };

/**
 * One call a stepped connector makes: everything but what `callOutside` fills in from the context. `service_id` is
 * the connector's own unless it names one of the services the connector declared in `also` (Companies House's
 * Document API, beside its Public Data API); any other is refused before anything is sent.
 */
export type StepRequest = Omit<CallRequest, 'service_id' | 'actor_id' | 'actor_role' | 'claim_id' | 'gate'> & { readonly service_id?: string };

/**
 * A connector from its parts: which keys it needs, and how a query becomes one call. `configured()` and `fetch()`
 * are the same for every connector, so they are written once, here.
 */
export function defineConnector<Q>(spec: {
  readonly source_id: string;
  readonly service_id: string;
  readonly owner: SecretOwner | null;
  /** The key names it cannot work without. */
  readonly needs: readonly string[];
  readonly request: (query: Q, secrets: OwnerSecrets | null) => Omit<CallRequest, 'service_id' | 'actor_id' | 'actor_role' | 'claim_id' | 'gate'>;
  readonly toBundle: (body: string, query: Q) => Bundle | null;
}): RegisterConnector<Q> {
  const one = (ctx: ConnectorContext, query: Q): Promise<CallResult> => {
    const r = spec.request(query, ctx.secrets);
    return callOutside(ctx.deps, {
      ...r, service_id: spec.service_id,
      actor_id: ctx.actor_id, actor_role: ctx.actor_role ?? null, claim_id: ctx.claim_id, gate: ctx.gate,
    });
  };
  return {
    source_id: spec.source_id,
    service_id: spec.service_id,
    owner: spec.owner,
    configured(secrets, switches = REGISTER_SWITCHES) {
      if (!switchedOn(spec.source_id, switches)) return { state: 'SWITCHED_OFF', why: 'not switched on yet' };
      if (spec.owner === null || spec.needs.length === 0) return { state: 'READY', why: 'switched on; needs no key' };
      const mine = secrets.forOwner(spec.owner);
      const missing = spec.needs.filter((n) => !mine.has(n));
      return missing.length === 0
        ? { state: 'READY', why: 'switched on, and its key is in place' }
        : { state: 'NOT_CONFIGURED', why: `not set up yet: the key file has no ${missing.join(' or ')}` };
    },
    fetch: one,
    toBundle: spec.toBundle,
    async lookup(ctx, query) {
      const call = await one(ctx, query);
      if (call.outcome !== 'OK' || call.body === null) return { kind: 'CALL_FAILED', call, calls: [call] };
      const bundle = spec.toBundle(call.body, query);
      return bundle === null ? { kind: 'UNREADABLE', call, calls: [call] }
        : { kind: 'READ', bundle, calls: [call], note: 'looked up — we keep the answer and where it came from' };
    },
  };
}

/**
 * PHASE 146c: A CONNECTOR WHOSE LOOKUP IS SEVERAL CALLS — a search on the typed postcode or name, a match scored
 * against it, then the one record that matched. Every call still goes through `callOutside` (one audit row each), with
 * this connector's service, and nothing else can be named: `step` takes a path, never an address.
 *
 * `fetch` and `toBundle` are there for the shape's sake: `fetch` makes the lookup's FIRST call, and `toBundle` reads
 * nothing (a stepped connector reads its answers inside `lookup`, where it knows which call each one came from).
 */
export function defineSteppedConnector<Q>(spec: {
  readonly source_id: string;
  readonly service_id: string;
  readonly owner: SecretOwner | null;
  readonly needs: readonly string[];
  /** Other rows of src/connectors/sources.ts this connector may call, beside its own. */
  readonly also?: readonly string[];
  /** The first call, for `fetch`. */
  readonly first: (query: Q, secrets: OwnerSecrets | null) => StepRequest;
  readonly lookup: (step: (r: StepRequest) => Promise<CallResult>, query: Q, secrets: OwnerSecrets | null) => Promise<LookupResult>;
}): RegisterConnector<Q> {
  const one = defineConnector<Q>({
    source_id: spec.source_id, service_id: spec.service_id, owner: spec.owner, needs: spec.needs,
    request: (q, s) => { const { service_id: _ignored, ...r } = spec.first(q, s); return r; }, toBundle: () => null,
  });
  const allowed = new Set([spec.service_id, ...(spec.also ?? [])]);
  return {
    ...one,
    lookup(ctx, query) {
      const step = (r: StepRequest): Promise<CallResult> => {
        const { service_id, ...rest } = r;
        const service = service_id ?? spec.service_id;
        return callOutside(ctx.deps, {
          ...rest,
          // A service this connector did not declare is sent to a name that is in no list, so callOutside refuses it
          // and writes the refusal down like any other.
          service_id: allowed.has(service) ? service : 'NOT_DECLARED_BY_THIS_CONNECTOR',
          actor_id: ctx.actor_id, actor_role: ctx.actor_role ?? null, claim_id: ctx.claim_id, gate: ctx.gate,
        });
      };
      return spec.lookup(step, query, ctx.secrets);
    },
  };
}

export type ConnectorRun = {
  readonly source_id: string;
  readonly state: SourceState;
  readonly readiness: Readiness['state'] | 'GATE_SHUT';
  readonly detail: string;
  readonly bundle: Bundle | null;
  /** The last call made, or null when none was. */
  readonly call: CallResult | null;
  /** Phase 146c: why it FAILED, as a short code the panel keeps (a call's outcome, UNREADABLE, NO_MATCH …); null otherwise. */
  readonly failure_code?: string | null;
  /** Phase 146c: when the publisher's answer was read — set on FIRED only, from the clock, never invented. */
  readonly retrieved_at?: string | null;
  /**
   * PHASE 146d: WHAT THIS LOOKUP SPENT, in pence, added up from EVERY call it made — not only the last one. A
   * stepped lookup makes several calls and each one may or may not be charged, so the sum has to be taken where the
   * whole list is, which is here. Only a call that says it was charged counts: a refusal, a time-out or an error
   * adds nothing, because the suppliers' own terms are that they do not bill for those. A charge nobody reported is
   * null on the call and is left out rather than counted as free (N4 applied to money).
   */
  readonly cost_pence: number;
};

/**
 * RUN ONE CONNECTOR, SAFELY. `gateDecision` is what `stateUnderGates` said for this source, this client, this click;
 * anything but NOT_RUN there means the gate is shut and nothing is sent.
 */
/** What a list of calls cost, counting only the ones that say they were charged. */
export function spentOn(calls: readonly CallResult[]): number {
  return calls.reduce((n, c) => (c.charged && c.cost_pence !== null ? n + c.cost_pence : n), 0);
}

export async function runConnector<Q>(
  c: RegisterConnector<Q>, ctx: ConnectorContext, query: Q,
  gateDecision: { readonly state: SourceState; readonly detail: string },
  secrets: SecretStore, switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES,
): Promise<ConnectorRun> {
  const base = { source_id: c.source_id, bundle: null, call: null, cost_pence: 0 } as const;
  if (gateDecision.state !== 'NOT_RUN') {
    return { ...base, state: gateDecision.state, readiness: 'GATE_SHUT', detail: gateDecision.detail };
  }
  const ready = c.configured(secrets, switches);
  if (ready.state !== 'READY') {
    return { ...base, state: 'NOT_RUN', readiness: ready.state, detail: `allowed, but ${ready.why}, so nothing was contacted` };
  }
  try {
    const r = await c.lookup({ ...ctx, secrets: c.owner === null ? null : secrets.forOwner(c.owner) }, query);
    switch (r.kind) {
      case 'READ':
        return { source_id: c.source_id, state: 'FIRED', readiness: 'READY', detail: r.note, bundle: r.bundle,
          call: r.calls[r.calls.length - 1] ?? null, failure_code: null, retrieved_at: ctx.deps.now(), cost_pence: spentOn(r.calls) };
      case 'CALL_FAILED':
        return { source_id: c.source_id, state: 'FAILED', readiness: 'READY', detail: `the lookup did not work: ${r.call.why}`,
          bundle: null, call: r.call, failure_code: r.call.outcome, cost_pence: spentOn(r.calls) };
      case 'UNREADABLE':
        return { source_id: c.source_id, state: 'FAILED', readiness: 'READY', detail: 'the lookup answered, but not in a form we could read',
          bundle: null, call: r.call, failure_code: 'UNREADABLE', cost_pence: spentOn(r.calls) };
      case 'NOT_MATCHED':
        return { source_id: c.source_id, state: 'FAILED', readiness: 'READY',
          detail: `${r.why}. So the question stays asked. Check the name, number or address on the client's record and try again`,
          bundle: null, call: r.calls[r.calls.length - 1] ?? null, failure_code: r.code, cost_pence: spentOn(r.calls) };
      case 'NOT_COVERED':
        return { ...base, state: 'NOT_RUN', readiness: 'READY', detail: `${r.why}, so nothing was contacted and the question is asked` };
    }
  } catch {
    return { ...base, state: 'FAILED', readiness: 'READY', detail: 'the lookup did not work, and nothing was kept', failure_code: 'ERROR' };
  }
}
