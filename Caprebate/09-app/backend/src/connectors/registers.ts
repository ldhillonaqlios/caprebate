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
  CIW: false,
  EPC: false,
  HMLR_PPD: false,
  VOA: false,
  PLANNING: false,
  ONS_POSTCODE: false,
  HOMEDATA_ADDRESS: false,
  HMLR_TITLE: false,
  BCIS: false,
});

/** Only `true` is on. An absent source, and anything else, is off. */
export function switchedOn(source_id: string, switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES): boolean {
  return switches[source_id] === true;
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
}

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
    fetch(ctx, query) {
      const r = spec.request(query, ctx.secrets);
      return callOutside(ctx.deps, {
        ...r, service_id: spec.service_id,
        actor_id: ctx.actor_id, actor_role: ctx.actor_role ?? null, claim_id: ctx.claim_id, gate: ctx.gate,
      });
    },
    toBundle: spec.toBundle,
  };
}

export type ConnectorRun = {
  readonly source_id: string;
  readonly state: SourceState;
  readonly readiness: Readiness['state'] | 'GATE_SHUT';
  readonly detail: string;
  readonly bundle: Bundle | null;
  readonly call: CallResult | null;
};

/**
 * RUN ONE CONNECTOR, SAFELY. `gateDecision` is what `stateUnderGates` said for this source, this client, this click;
 * anything but NOT_RUN there means the gate is shut and nothing is sent.
 */
export async function runConnector<Q>(
  c: RegisterConnector<Q>, ctx: ConnectorContext, query: Q,
  gateDecision: { readonly state: SourceState; readonly detail: string },
  secrets: SecretStore, switches: Readonly<Record<string, boolean>> = REGISTER_SWITCHES,
): Promise<ConnectorRun> {
  const base = { source_id: c.source_id, bundle: null, call: null } as const;
  if (gateDecision.state !== 'NOT_RUN') {
    return { ...base, state: gateDecision.state, readiness: 'GATE_SHUT', detail: gateDecision.detail };
  }
  const ready = c.configured(secrets, switches);
  if (ready.state !== 'READY') {
    return { ...base, state: 'NOT_RUN', readiness: ready.state, detail: `allowed, but ${ready.why}, so nothing was contacted` };
  }
  try {
    const call = await c.fetch({ ...ctx, secrets: c.owner === null ? null : secrets.forOwner(c.owner) }, query);
    if (call.outcome !== 'OK' || call.body === null) {
      return { source_id: c.source_id, state: 'FAILED', readiness: 'READY', detail: `the lookup did not work: ${call.why}`, bundle: null, call };
    }
    const bundle = c.toBundle(call.body, query);
    if (bundle === null) {
      return { source_id: c.source_id, state: 'FAILED', readiness: 'READY', detail: 'the lookup answered, but not in a form we could read', bundle: null, call };
    }
    return { source_id: c.source_id, state: 'FIRED', readiness: 'READY', detail: 'looked up — we keep the answer and where it came from', bundle, call };
  } catch {
    return { ...base, state: 'FAILED', readiness: 'READY', detail: 'the lookup did not work, and nothing was kept' };
  }
}
