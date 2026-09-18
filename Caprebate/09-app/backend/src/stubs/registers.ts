/**
 * STUB 3 of 3 — the register connectors.
 *
 * NOTHING FIRES. The engine makes zero network calls today and so does this:
 * the connectors do not exist, and this module is the named seam where they
 * will go. What IS real here is everything around them — the two gates, and
 * the name-exclusion check every record must pass before it is stored.
 *
 * THE TWO GATES ARE REAL AND ARE NOT OURS TO OPEN.
 *
 *   FREE sources are gated on a published privacy notice. CB_REGISTRY
 *   .precondition is `enabled:false` and its own `requires` string says why.
 *   Show that state; do not flip it; DO NOT BUILD A SECOND GATE. Turning it on
 *   is one boolean and it is the data protection decision, not a build step.
 *
 *   PAID sources are gated on a signed engagement asserted SERVER-SIDE, plus
 *   one operator click that then fires everything outstanding. The operator
 *   picks the moment, not the calls: there is deliberately no per-source
 *   confirmation.
 *
 * NOTHING REFUSES AND NOTHING THROWS when a gate is shut. A source that may not
 * be consulted is reported NOT_PERMITTED_YET and its facts stay unknown — which
 * is what N4 already requires of every unknown. A build in which a shut gate
 * makes an estimate fail, or a screen error, is built wrong.
 *
 * N2 — THE NAME EXCLUSION REGISTER — IS WIRED IN, NOT RESTATED.
 * caprebate-name-exclusion.ts is the rule. Every record passes through
 * `assertNoUnauthorisedName` at the INGESTION boundary, which is where that
 * module says the check belongs: a filter applied at report time would leave
 * the name sitting in storage in between.
 */

import type { Db } from '../db.ts';
import {
  assertNoUnauthorisedName,
  type IngestedRecord,
} from '../../../../04-phase-work/phase3/caprebate-name-exclusion.ts';

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
 * Store one register record. THE ONLY WAY register data enters the database.
 *
 * Throws NameExclusionError if the record would write a personal name outside
 * the two documented exceptions, or carries a field on neither the keep list
 * nor the exclude list — an uncatalogued field is refused, never assumed safe.
 */
export function ingestRegisterRecord(
  db: Db,
  ids: () => string,
  now: () => string,
  business_id: string,
  rec: IngestedRecord,
): string {
  assertNoUnauthorisedName(rec); // N2. Fails closed on an unknown source.

  const id = ids();
  db.run(
    'INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
    [id, business_id, rec.sourceId, rec.entityId, JSON.stringify(rec.fields), now()],
  );
  return id;
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
