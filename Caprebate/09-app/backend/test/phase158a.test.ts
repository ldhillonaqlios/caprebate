/**
 * PHASE 158a — 7 October 2026. What the Friary House run found past the engagement letter, where it was small enough
 * to fix in the same phase. The run itself, and every finding (F22 onwards), is in
 * 04-phase-work/sim-2026-10-06/Friary-House-simulation-findings.md (OneDrive).
 *
 *   F25  Homedata's planning answer for a property with no applications was recorded as "not in a form we could
 *        read", after a charged call. A count of 0 is an answer: no applications. An answer with no planning
 *        history at all says nothing either way, so the question stays asked, in plain words.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RateLimiter, type Transport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { PAID_CONNECTORS } from '../src/connectors/paid-registers.ts';
import * as C from '../src/connectors/registers.ts';
import { testApp } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REAL = readFileSync(join(HERE, 'fixtures', 'phase156f', 'homedata-planning-10-downing-street.json'), 'utf8');
const KEYS = secretsFromValues({ HOMEDATA_API_KEY: 'invented-homedata-key' });
const UPRN = '100023336956';

/** One answer for Homedata's property path, whatever the query. */
const answering = (body: string): Transport => async () =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });

async function planningFor(body: string): Promise<C.LookupResult> {
  const app = await testApp();
  try {
    const ctx = {
      deps: { audit: app.audit, now: app.now, transport: answering(body), limiter: new RateLimiter() }, actor_id: null, claim_id: null,
      gate: { free_gate_open: false, engagement_signed: true, switched_on: true }, secrets: KEYS.forOwner('HOMEDATA_ADDRESS'),
    } as C.ConnectorContext;
    return await PAID_CONNECTORS['HOMEDATA_PLANNING']!.connector.lookup(ctx, { nation: 'england', uprn: UPRN });
  } finally {
    app.close();
  }
}

describe('F25 — Homedata planning: an answer with no applications is read, not called unreadable', () => {
  test('a count of 0 and no list: read, no applications kept, and the note says there are none', async () => {
    const r = await planningFor(JSON.stringify({ uprn: UPRN, planning_history: { count: 0 } }));
    assert.equal(r.kind, 'READ');
    if (r.kind === 'READ') {
      assert.equal(r.bundle.records.length, 0);
      assert.deepEqual(r.bundle.facts, { planning_applications: 0 });
      assert.match(r.note ?? '', /holds no planning applications for this property/);
    }
  });

  test('a count of 0 and an empty list is the same answer', async () => {
    const r = await planningFor(JSON.stringify({ uprn: UPRN, planning_history: { count: 0, applications: [] } }));
    assert.equal(r.kind, 'READ');
    if (r.kind === 'READ') assert.match(r.note ?? '', /holds no planning applications for this property/);
  });

  test('no planning history in the answer at all (null, or not there): not matched, the question stays asked', async () => {
    for (const body of [{ uprn: UPRN, planning_history: null }, { uprn: UPRN }]) {
      const r = await planningFor(JSON.stringify(body));
      assert.equal(r.kind, 'NOT_MATCHED', JSON.stringify(body));
      if (r.kind === 'NOT_MATCHED') {
        assert.equal(r.code, 'NO_MATCH');
        assert.match(r.why, /sent no planning history for this property/);
        assert.equal(r.calls.length, 1);
      }
    }
  });

  test('CONTROLS: an answer we truly cannot read is still unreadable; the real answer still gives six applications', async () => {
    for (const body of ['not json', JSON.stringify({ uprn: UPRN, planning_history: 'six' }), JSON.stringify({ uprn: UPRN, planning_history: { count: 3 } })]) {
      assert.equal((await planningFor(body)).kind, 'UNREADABLE', body);
    }
    const real = await planningFor(REAL);
    assert.equal(real.kind, 'READ');
    if (real.kind === 'READ') assert.equal(real.bundle.records.length, 6);
  });
});
