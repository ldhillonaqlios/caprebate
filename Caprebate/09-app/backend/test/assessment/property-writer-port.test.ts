/**
 * THE PORT THE ASSESSMENT OWNS FOR KEEPING EACH BUILDING (Phase 161l2, src/modules/assessment/property-writer.ts).
 * The assessment's submit keeps each building as a property, with its events, in the claims' tables; the claims sit
 * above the assessment, so they hand their writes in as their front door loads. This proves the three things a port
 * must: asked before the claims load, it refuses loudly; once they load, it is filled with the claims' own writes;
 * and a write that fails undoes the whole submission, so nothing is kept half way.
 *
 * The first test runs before anything loads the claims: every import here is made inside a test, in order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('161l2: asked before the claims load, the port refuses rather than keep nothing', async () => {
  const P = await import('../../src/modules/assessment/property-writer.ts');
  assert.throws(() => P.assessedPropertyWriter(), /Keeping the buildings is not set up\. The claims set it up when they load/);
});

test('161l2: once the claims load, the port holds their own writes, and a submission keeps each building through it', async () => {
  const P = await import('../../src/modules/assessment/property-writer.ts');
  const { testApp } = await import('../helpers.ts');
  const F4 = await import('../../src/modules/assessment/funnel4.ts');
  const AS = await import('../../src/modules/assessment/assessment.ts');
  const PE = await import('../../src/modules/claims/property-events.ts');
  const app = await testApp();
  const w = P.assessedPropertyWriter();
  assert.equal(w.writeEvents, PE.writeAssessmentEvents, 'the events are written by the claims\' own function');

  const s: Record<string, unknown> = {};
  F4.markFunnel4(s);
  const form = (o: Record<string, string>) => new URLSearchParams(o);
  F4.applyF4(s, 'buildings', form({ b0_sector: 'gp' }));
  F4.applyF4(s, 'spend-on', form({ b0_trigger: 'purchase' }));
  F4.applyF4(s, 'amounts', form({ b0_spend: '650000', b0_date: '03/2025' }));
  F4.applyF4(s, 'tax', form({ b0_tax: 'yes', b0_profit: 'profitable' }));
  F4.applyF4(s, 'claims', form({ b0_prior: 'no', b0_seller: 'dont_know' }));
  F4.applyF4(s, 'works', form({ b0_works: 'no' }));
  F4.applyF4(s, 'details', form({ b0_business: 'Port Test Surgery', b0_entity: 'partnership', b0_line1: '1 Test Road', b0_town: 'Testtown', b0_postcode: 'ZZ9 9ZZ' }));
  (s['contact'] as Record<string, unknown>)['full_name'] = 'Test Person';
  const draft = (token: string) => ({ token, state: structuredClone(s) as never, screen: 'Q1' as never });

  // Kept: the property with every column the old statement wrote, and its purchase.
  const out = AS.submit(app.db, draft('tok-port-1'), app.now, randomUUID);
  const props = app.db.all<Record<string, unknown>>('SELECT business_id, label, postcode, address_line_1, town, uprn, created_at, updated_at, ' +
    'claimant_role, claimant_role_source, council_area, council_area_source FROM properties WHERE business_id = ?', [out.business_id]);
  assert.equal(props.length, 1);
  assert.equal(props[0]!['address_line_1'], '1 Test Road');
  assert.equal(props[0]!['town'], 'Testtown');
  assert.equal(props[0]!['created_at'], props[0]!['updated_at']);
  const evs = app.db.all<{ kind: string }>('SELECT kind FROM property_events WHERE assessment_id = ? ORDER BY ord', [out.assessment_id]);
  assert.deepEqual(evs.map((e) => e.kind), ['PURCHASE']);

  // Undone: a write that fails takes the whole submission with it, organisation, assessment and lead.
  const COUNTS = ['SELECT COUNT(*) AS n FROM businesses', 'SELECT COUNT(*) AS n FROM assessments', 'SELECT COUNT(*) AS n FROM properties', 'SELECT COUNT(*) AS n FROM leads'];
  const before = (sql: string) => app.db.get<{ n: number }>(sql)!.n;
  const counts = COUNTS.map(before);
  P.setAssessedPropertyWriter({ ...w, writeEvents: () => { throw new Error('a failing write'); } });
  try {
    assert.throws(() => AS.submit(app.db, draft('tok-port-2'), app.now, randomUUID), /a failing write/);
  } finally {
    P.setAssessedPropertyWriter(w);
  }
  assert.deepEqual(COUNTS.map(before), counts, 'nothing of the failed submission was kept');
  app.close();
});
