/**
 * Caprebate — Document/Property Match tests. Board item 12902224596.
 * Run:  node --test caprebate-document-property-match.test.ts
 *
 * The four scenarios named on the item are T1-T4. The rest cover the seams
 * this item touches in caprebate-source-register.ts and
 * caprebate-reconciliation.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceRegister, record, type AnyCell, type Retrieval } from './caprebate-source-register.ts';
import { areIndependent, reconcileField, __resetIds, type FieldSpec } from './caprebate-reconciliation.ts';
import type { ModelFn, RawExtraction, ModelPayload, EgressEntry, Segment } from './caprebate-document-pipeline.ts';
import {
  matchProperty, propertyReviewTask, extractWithPropertyGate, stampPropertyMatch, GATE_THRESHOLD,
  type SubjectProperty, type PropertyMention,
} from './caprebate-document-property-match.ts';

const AT = '2026-08-27T09:00:00Z';

/** The job's subject property — as it would come off the Land Registry title. */
const SUBJECT: SubjectProperty = {
  job_id: 'J1',
  address_lines: ['Sunnyside Care Home', '14 Chapel Road', 'Anytown'],
  postcode: 'SW1A 1AA',
  uprn: '100023336956',
  primary_name: 'Sunnyside Care Home',
  alternative_names: ['Sunnyside House'],
};

const mention = (over: Partial<PropertyMention>): PropertyMention => ({
  raw_text: 'stub', address_lines: [], postcode: null, uprn: null, site_name: null,
  confidence: 0.97, quote_ref: 'p1', page: 1, ...over,
});

/** Records every payload it is given; returns whatever `returns` says. */
function spyModel(returns: RawExtraction = []) {
  const seen: ModelPayload[] = [];
  const fn: ModelFn = (p) => { seen.push(p); return returns; };
  return { fn, seen, calls: () => seen.length };
}

/* ------------------------------------------------------------------ *
 * T1 — an FRA for a different property in the same client's group
 * ------------------------------------------------------------------ */

test('T1 an FRA for a different property in the group → MISMATCH, no claims, a review task, model never called', () => {
  const OTHER_HOME = mention({
    raw_text: 'Oakwood Care Home, 2 Birch Grove, Anytown, NE1 4ST',
    address_lines: ['Oakwood Care Home', '2 Birch Grove', 'Anytown'],
    postcode: 'NE1 4ST', uprn: '100023339112', site_name: 'Oakwood Care Home',
  });

  const pm = matchProperty('fra-oakwood', SUBJECT, [OTHER_HOME]);
  assert.equal(pm.outcome, 'MISMATCH');
  assert.deepEqual(pm.matched_mentions, []);
  assert.equal(pm.other_properties.length, 1);

  const m = spyModel([{ field_id: 'fra_fire_door_count', value: 12, confidence: 0.99, page: 3, quote_ref: 'p3' }]);
  const egress: EgressEntry[] = [];
  const gated = extractWithPropertyGate(
    'J1', 'fra-oakwood', 'FIRE_RISK_ASSESSMENT', SUBJECT, [OTHER_HOME],
    [{ kind: 'FINDINGS', heading: 'FINDINGS', text: 'irrelevant here', page: 1 }],
    m.fn, { at: AT, egress }, AT,
  );

  assert.equal(gated.property_match.outcome, 'MISMATCH');
  assert.equal(m.calls(), 0, 'a mismatched document must never reach the model');
  assert.equal(gated.extraction, null);
  assert.deepEqual(gated.claims, [], 'a mismatched document contributes no claims');
  assert.equal(gated.review.length, 1, 'the mismatch routes to review — it is a human call, not a discard');
  assert.equal(gated.review[0].asked_of, 'ANALYST');
  assert.ok(gated.review[0].question.includes('Oakwood'), 'the review names the property actually found');
});

/* ------------------------------------------------------------------ *
 * T2 — an O&M schedule with no address
 * ------------------------------------------------------------------ */

test('T2 an O&M schedule with no address → NOT_STATED, claims are written but marked', () => {
  const raw: RawExtraction = [
    { field_id: 'om_plant_items', value: [{ description: 'AHU-1' }], confidence: 0.92, page: 4, quote_ref: 'p4' },
    { field_id: 'om_commissioning_date', value: '2019-03-01', confidence: 0.9, page: 1, quote_ref: 'p1' },
    { field_id: 'om_system_types', value: ['HVAC'], confidence: 0.93, page: 2, quote_ref: 'p2' },
  ];
  const m = spyModel(raw);
  const egress: EgressEntry[] = [];
  const gated = extractWithPropertyGate(
    'J1', 'om-1', 'OM_MANUAL', SUBJECT, [], // no mentions at all — the richest doc type, no address
    [{ kind: 'PLANT_SCHEDULE', heading: 'PLANT SCHEDULE', text: 'AHU-1, chiller, boiler', page: 1 }],
    m.fn, { at: AT, egress }, AT,
  );

  assert.equal(gated.property_match.outcome, 'NOT_STATED');
  assert.equal(m.calls(), 1, 'NOT_STATED is not a hard ingestion gate — extraction still runs');
  assert.equal(gated.claims.length, 3, 'the claims ARE written');
  for (const c of gated.claims) {
    assert.equal(c.retrieval.property_match, 'NOT_STATED', 'every claim from this document is marked');
  }
  assert.equal(gated.review.length, 0, 'NOT_STATED is not itself a review task — only MISMATCH is');
});

test('T2b a NOT_STATED claim cannot corroborate another claim on the same field', () => {
  const reg = new SourceRegister({ clock: () => AT });
  const ret = (over: Partial<Retrieval> = {}): Retrieval => ({
    retrieved_at: AT, method: 'UPLOAD', locator: 'om-1.pdf p4', ...over,
  });

  const clientDocNotStated = record<number>(reg, {
    entity_id: 'J1', field_id: 'test_numeric_field', source_id: 'CLIENT_DOC',
    retrieval: ret({ property_match: 'NOT_STATED' }), value: 500, grade: 'B',
  }) as AnyCell;
  const engineClaim = record<number>(reg, {
    entity_id: 'J1', field_id: 'test_numeric_field', source_id: 'ENGINE',
    retrieval: { retrieved_at: AT, method: 'COMPUTED', locator: 'derived' }, value: 500,
  }) as AnyCell;

  // Sanity: without the NOT_STATED marker, a CLIENT_DOC claim and an ENGINE
  // claim ARE independent (different independence classes) — this is the
  // baseline behaviour the fix must not disturb for a MATCHED document.
  const clientDocMatched = record<number>(reg, {
    entity_id: 'J1', field_id: 'test_numeric_field', source_id: 'CLIENT_DOC',
    retrieval: ret({ property_match: 'MATCH', locator: 'other-doc.pdf p1' }), value: 500, grade: 'B',
  }) as AnyCell;
  assert.equal(areIndependent(clientDocMatched, engineClaim), true, 'a MATCHED claim corroborates normally');

  // The fix: the NOT_STATED claim may not.
  assert.equal(areIndependent(clientDocNotStated, engineClaim), false);

  __resetIds();
  const FIELD: FieldSpec = {
    field_id: 'test_numeric_field', kind: 'numeric', gate: false,
    tolerance: { absolute: 0 }, question: 'q', asked_of: 'CLIENT', escalate_to: 'SURVEYOR',
  };
  const res = reconcileField(FIELD, 'J1', [clientDocNotStated, engineClaim], { clock: () => AT });
  assert.equal(res.confidence.basis, 'SINGLE_SOURCE', 'agreement with a NOT_STATED claim is not corroboration');
  assert.deepEqual(res.confidence.corroborating_sources, []);
});

/* ------------------------------------------------------------------ *
 * T3 — a group FRA naming the subject among six
 * ------------------------------------------------------------------ */

test('T3 a group FRA naming the subject among six → MATCH, and the scoping sub-problem is flagged', () => {
  const others = ['Oakwood', 'Birchwood', 'Elmhurst', 'Cedarview', 'Willowbank'].map((name, i) =>
    mention({
      raw_text: `${name} Care Home`, address_lines: [`${name} Care Home`, `${i + 1} Group Way`],
      postcode: `NE${i}Z 1AA`, site_name: `${name} Care Home`,
    }),
  );
  const subjectMention = mention({
    raw_text: 'Sunnyside Care Home, 14 Chapel Road, Anytown, SW1A 1AA',
    address_lines: ['Sunnyside Care Home', '14 Chapel Road', 'Anytown'],
    postcode: 'SW1A 1AA', site_name: 'Sunnyside Care Home',
  });

  const pm = matchProperty('group-fra-1', SUBJECT, [...others, subjectMention]);
  assert.equal(pm.outcome, 'MATCH');
  assert.equal(pm.matched_mentions.length, 1);
  assert.equal(pm.other_properties.length, 5);
  assert.equal(pm.portfolio_scoping_risk, true, 'a multi-property MATCH must flag the scoping sub-problem');

  const review = propertyReviewTask(pm, 'FIRE_RISK_ASSESSMENT');
  assert.equal(review, null, 'a MATCH at full confidence raises no review task on its own');
});

/* ------------------------------------------------------------------ *
 * T4 — the subject property, with formatting variance
 * ------------------------------------------------------------------ */

test('T4 the subject property with abbreviations and a missing postcode → MATCH', () => {
  const variant = mention({
    raw_text: '14 Chapel Rd, Anytown', address_lines: ['14 Chapel Rd', 'Anytown'],
    postcode: null, uprn: null, site_name: null,
  });
  const pm = matchProperty('fra-subject-variant', SUBJECT, [variant]);
  assert.equal(pm.outcome, 'MATCH', 'Rd vs Road and a missing postcode must not read as a mismatch');
  assert.equal(pm.matched_mentions.length, 1);
  assert.equal(pm.portfolio_scoping_risk, false);
});

test('T4b a known alternative site name matches even with a wholly different address style', () => {
  const variant = mention({
    raw_text: 'Sunnyside House (formerly The Grange)', address_lines: [],
    postcode: null, uprn: null, site_name: 'Sunnyside House',
  });
  assert.equal(matchProperty('doc-x', SUBJECT, [variant]).outcome, 'MATCH');
});

/* ------------------------------------------------------------------ *
 * T5 — Phase 14 (item 12902240772): the gate applies to the two new
 * document types exactly as it does to every other, with no special-casing.
 * extractWithPropertyGate() is doc-type agnostic, so this is really a
 * regression guard against someone later exempting a new type by accident.
 * ------------------------------------------------------------------ */

test('T5 the property gate applies to a Phase 14 document type exactly as it does to every other', () => {
  const otherHome = mention({
    raw_text: 'Oakwood Care Home, 2 Birch Grove, Anytown, NE1 4ST',
    address_lines: ['Oakwood Care Home', '2 Birch Grove', 'Anytown'],
    postcode: 'NE1 4ST', uprn: '100023339112', site_name: 'Oakwood Care Home',
  });
  const m = spyModel([{ field_id: 'brc_completion_date', value: '2022-01-01', confidence: 0.9, page: 1, quote_ref: 'p1' }]);
  const egress: EgressEntry[] = [];
  const gated = extractWithPropertyGate(
    'J1', 'brc-oakwood', 'BUILDING_REGS_COMPLETION', SUBJECT, [otherHome],
    [{ kind: 'CERTIFICATE_BODY', heading: 'CERTIFICATE', text: 'irrelevant here', page: 1 }],
    m.fn, { at: AT, egress }, AT,
  );
  assert.equal(gated.property_match.outcome, 'MISMATCH');
  assert.equal(m.calls(), 0, 'a building regs certificate for another property is never sent to the model either');
  assert.deepEqual(gated.claims, [], 'and it contributes no claims, same as any other mismatched type');
  assert.equal(gated.review.length, 1);
  assert.equal(gated.review[0].asked_of, 'ANALYST');
});

/* ------------------------------------------------------------------ *
 * Supporting behaviour
 * ------------------------------------------------------------------ */

test('a document with an address for neither the subject nor any named alternative, sharing only generic words, is MISMATCH not MATCH', () => {
  // "Care Home" / "Court" are generic; sharing only those must not manufacture a match.
  const decoy = mention({
    raw_text: 'Meadowfield Care Home, Meadow Court', address_lines: ['Meadowfield Care Home', 'Meadow Court'],
    postcode: 'B1 1AA', site_name: 'Meadowfield Care Home',
  });
  assert.equal(matchProperty('doc-y', SUBJECT, [decoy]).outcome, 'MISMATCH');
});

test('a differing URPN is decisive even where the address text overlaps heavily', () => {
  const wrongUprn = mention({
    raw_text: '14 Chapel Road, Anytown, SW1A 1AA', address_lines: ['14 Chapel Road', 'Anytown'],
    postcode: 'SW1A 1AA', uprn: '999999999999',
  });
  assert.equal(matchProperty('doc-z', SUBJECT, [wrongUprn]).outcome, 'MISMATCH');
});

test('a MATCH below the GATE threshold (0.95) raises its own review task, unlike a confident MATCH', () => {
  const lowConf = mention({
    raw_text: '14 Chapel Road, Anytown, SW1A 1AA', address_lines: ['14 Chapel Road', 'Anytown'],
    postcode: 'SW1A 1AA', confidence: 0.6,
  });
  const pm = matchProperty('doc-lowconf', SUBJECT, [lowConf]);
  assert.equal(pm.outcome, 'MATCH');
  assert.equal(pm.low_confidence, true);
  assert.equal(pm.best_confidence, 0.6);
  const review = propertyReviewTask(pm, 'FIRE_RISK_ASSESSMENT');
  assert.ok(review);
  assert.equal(review!.asked_of, 'ANALYST');
  assert.ok(review!.question.includes(String(GATE_THRESHOLD * 100).slice(0, 2)));
});

test('stampPropertyMatch only touches retrieval.property_match, nothing else on the claim', () => {
  const claim = {
    entity_id: 'J1', field_id: 'om_plant_items', source_id: 'CLIENT_DOC' as const, value: [1], grade: 'B' as const,
    retrieval: { retrieved_at: AT, method: 'UPLOAD' as const, locator: 'om-1.pdf p4', extract_ref: 'p4', extraction_confidence: 0.9 },
  };
  const stamped = stampPropertyMatch(claim, 'MATCH');
  assert.equal(stamped.retrieval.property_match, 'MATCH');
  assert.equal(stamped.retrieval.locator, claim.retrieval.locator);
  assert.equal(stamped.value, claim.value);
});
