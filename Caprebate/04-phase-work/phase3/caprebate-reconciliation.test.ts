/**
 * Caprebate — Reconciliation Engine tests. Board item 12830181808.
 * Run:  node --test caprebate-reconciliation.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SourceRegister, ProvenanceStore, record,
  type AnyCell, type Retrieval,
} from './caprebate-source-register.ts';
import {
  reconcile, reconcileField, cluster, agree, areIndependent, independenceOf,
  settleConflict, claimsFromStore, gatherClaims, reconcileFromStore, __resetIds,
  type FieldSpec,
} from './caprebate-reconciliation.ts';

const NOW = '2026-08-26T12:00:00Z';
const reg = () => new SourceRegister({ clock: () => NOW });
const clock = () => NOW;

const ret = (over: Partial<Retrieval> = {}): Retrieval => ({
  retrieved_at: '2026-08-20T09:00:00Z',
  method: 'API',
  locator: 'test-locator',
  ...over,
});

/** Gross internal area: the master input per the Report Pack spec §2. */
const GIA: FieldSpec = {
  field_id: 'gia_m2',
  // Three publishers, three field names, one quantity.
  claims_from: ['gia_m2', 'epc_total_floor_area_m2', 'voa_total_area_m2'],
  kind: 'numeric',
  gate: false,
  tolerance: { relative: 0.02, absolute: 5 }, // rounding and measurement precision only
  question: 'What is the gross internal area?',
  asked_of: 'CLIENT',
  escalate_to: 'SURVEYOR',
  unit: 'm2',
};

const GRANT: FieldSpec = {
  field_id: 'grant_fraction',
  kind: 'numeric',
  gate: true,
  tolerance: { absolute: 0.0001 },
  question: 'Was any part of the expenditure met by a grant or third-party contribution?',
  asked_of: 'CLIENT',
  escalate_to: 'CTA',
};

const BEDS: FieldSpec = {
  field_id: 'beds_registered',
  kind: 'numeric',
  gate: false,
  tolerance: { absolute: 0 },
  question: 'How many registered beds does the home have?',
  asked_of: 'CLIENT',
  escalate_to: 'SURVEYOR',
};

const epc = (r: SourceRegister, v: number, at = '2026-08-20T09:00:00Z') =>
  record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ retrieved_at: at, locator: 'RRN-1' }), value: v }) as AnyCell;

/* ------------------------------------------------------------------ */

test('R1 agree() honours both the absolute and the relative bound', () => {
  assert.equal(agree(GIA, 1200, 1203), true);   // within 5 m2
  assert.equal(agree(GIA, 1200, 1220), true);   // within 2%
  assert.equal(agree(GIA, 1200, 1340), false);  // 11.7% apart
});

test('R2 clustering is complete-linkage, so 1200/1250/1300 does not chain into one group', () => {
  const r = reg();
  const claims = [epc(r, 1200), epc(r, 1250), epc(r, 1300)];
  const groups = cluster({ ...GIA, tolerance: { relative: 0.05 } }, claims);
  assert.ok(groups.length > 1, 'single-linkage chaining would have produced one group');
});

test('R3 the worked example: EPC 1200, OS 1340, client "about 1400" — all three held, none picked', () => {
  __resetIds();
  const r = reg();
  const claims: AnyCell[] = [
    record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'EPC RRN-1' }), value: 1200 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret({ locator: 'VOA BA-ref 9911' }), value: 1340 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.gia' }), value: 1400 }) as AnyCell,
  ];
  const res = reconcileField(GIA, 'J1', claims, { clock });

  assert.equal(res.value, null, 'the engine must not pick');
  assert.equal(res.confidence.basis, 'CONTESTED');
  assert.ok(res.conflict);
  assert.equal(res.conflict!.claims.length, 3, 'every claim is recorded, including the losers');
  assert.equal(res.conflict!.positions.length, 3);
  assert.equal(res.conflict!.status, 'OPEN');
  assert.equal(res.conflict!.spread_absolute, 200);
  assert.ok(Math.abs(res.conflict!.spread_relative! - 0.1667) < 0.001);
  assert.equal(res.captures.length, 1);
  assert.equal(res.captures[0].reason, 'CONTESTED');
  assert.equal(res.captures[0].options.length, 3);
  assert.match(res.captures[0].question, /1200 m2 \(MHCLG\) vs 1340 m2 \(Valuation Office Agency\) vs 1400 m2 \(Client\)/);
});

test('R4 immaterial disagreement resolves on best evidence and does NOT flood the capture list', () => {
  __resetIds();
  const r = reg();
  const claims: AnyCell[] = [
    record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret(), value: 1200 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret(), value: 1202 }) as AnyCell,
  ];
  const res = reconcileField(GIA, 'J1', claims, { clock });
  assert.equal(res.value, 1200);
  assert.equal(res.conflict, null);
  assert.equal(res.captures.length, 0);
  assert.equal(res.confidence.basis, 'CORROBORATED');
  assert.deepEqual(res.confidence.corroborating_sources, ['VOA']);
});

test('R5 a null routes to capture and is never guessed', () => {
  __resetIds();
  const res = reconcileField(GIA, 'J1', [], { clock });
  assert.equal(res.value, null);
  assert.equal(res.confidence.basis, 'ABSENT');
  assert.equal(res.confidence.grade, null);
  assert.equal(res.captures.length, 1);
  assert.equal(res.captures[0].reason, 'ABSENT');
  assert.equal(res.captures[0].asked_of, 'CLIENT');
});

test('R6 a gate field with no claim blocks sign-off', () => {
  __resetIds();
  const res = reconcileField(GRANT, 'J1', [], { clock });
  assert.equal(res.confidence.blocks_signoff, true);
  assert.equal(res.captures[0].priority, 1);
});

test('R7 UNKNOWN escalates rather than re-asking the person who already said they do not know', () => {
  __resetIds();
  const r = reg();
  const c = record<number>(r, {
    entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER',
    retrieval: ret({ method: 'FORM', locator: 'q.grant' }), unknown: true,
  }) as AnyCell;
  const res = reconcileField(GRANT, 'J1', [c], { clock });
  assert.equal(res.value, null);
  assert.equal(res.confidence.basis, 'UNKNOWN');
  assert.equal(res.captures[0].reason, 'UNKNOWN');
  assert.equal(res.captures[0].asked_of, 'CTA', 'escalated, not returned to the client');
  assert.match(res.captures[0].question, /Do not re-ask/);
});

test('R8 UNKNOWN never routes to the favourable branch (I-1) — no value, no gate_ready', () => {
  __resetIds();
  const r = reg();
  const c = record<number>(r, {
    entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER',
    retrieval: ret({ method: 'FORM', locator: 'q.grant' }), unknown: true,
  }) as AnyCell;
  const res = reconcileField(GRANT, 'J1', [c], { clock });
  assert.notEqual(res.value, 0, 'the old grant_fraction || 0 defect');
  assert.equal(res.confidence.gate_ready, false);
  assert.equal(res.confidence.blocks_signoff, true);
});

test('R9 the client saying the same thing twice is not corroboration', () => {
  __resetIds();
  const r = reg();
  const a = record<number>(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.gia' }), value: 1400 }) as AnyCell;
  const b = record<number>(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_DOC', retrieval: ret({ method: 'UPLOAD', locator: 'lease.pdf p3' }), value: 1400 }) as AnyCell;
  assert.equal(areIndependent(a, b), false);
  const res = reconcileField(GIA, 'J1', [a, b], { clock });
  assert.equal(res.confidence.basis, 'SINGLE_SOURCE');
  assert.deepEqual(res.confidence.corroborating_sources, []);
});

test('R10 two rows from the same register publisher are one publisher', () => {
  const r = reg();
  const a = record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 1 }) as AnyCell;
  const b = record(r, { entity_id: 'J1', field_id: 'title_number', source_id: 'HMLR_TITLE', retrieval: ret(), value: 'X' }) as AnyCell;
  assert.equal(areIndependent(a, b), false, 'both are HM Land Registry');
  assert.equal(independenceOf('EPC'), 'REGISTER');
  assert.equal(independenceOf('SURVEYOR'), 'OURS');
});

test('R11 I-17 — a C-grade claim alone may not drive a gate', () => {
  __resetIds();
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.grant' }), value: 0.3 }) as AnyCell;
  const res = reconcileField(GRANT, 'J1', [c], { clock });
  assert.equal(res.value, 0.3, 'the value is held');
  assert.equal(res.confidence.grade, 'C');
  assert.equal(res.confidence.gate_ready, false);
  assert.equal(res.confidence.blocks_signoff, true);
  assert.equal(res.captures[0].reason, 'UNCORROBORATED_GATE');
  assert.match(res.captures[0].question, /independent A- or B-grade source/);
});

test('R12 a C corroborated by an A becomes gate-ready, and the schema grade is not rewritten', () => {
  __resetIds();
  const r = reg();
  const client = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.beds' }), value: 48 }) as AnyCell;
  const cqc = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret({ locator: 'CQC loc 1-234' }), value: 48 }) as AnyCell;
  const res = reconcileField({ ...BEDS, gate: true }, 'J1', [client, cqc], { clock });
  assert.equal(res.value, 48);
  assert.equal(res.confidence.grade, 'A', 'best evidence is the CQC row, still graded A');
  assert.equal(res.confidence.basis, 'CORROBORATED');
  assert.equal(res.confidence.gate_ready, true);
  assert.equal(res.confidence.blocks_signoff, false);
  assert.equal(res.captures.length, 0);
});

test('R13 a D-grade surveyor field asks for confirmation and blocks until it comes (I-3)', () => {
  __resetIds();
  const r = reg();
  const sv = record<number>(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'SURVEYOR', retrieval: ret({ method: 'SURVEY', locator: 'site visit 2026-08-19' }), value: 1287.5 }) as AnyCell;
  const res = reconcileField(GIA, 'J1', [sv], { clock });
  assert.equal(res.value, 1287.5);
  assert.equal(res.confidence.grade, 'D');
  assert.equal(res.confidence.blocks_signoff, true);
  assert.equal(res.captures[0].reason, 'JUDGEMENT_REQUIRED');
  assert.equal(res.captures[0].asked_of, 'SURVEYOR');
  assert.match(res.captures[0].question, /may draft and may never finalise/);
});

test('R14 an E-grade CTA field routes to the CTA, not the surveyor', () => {
  __resetIds();
  const r = reg();
  const cta = record<string>(r, { entity_id: 'J1', field_id: 'ch_sba_s270cf_personal_care_tested', source_id: 'CTA', retrieval: ret({ method: 'MANUAL', locator: 'CTA note 2026-08-21' }), value: 'TESTED_AVAILABLE' }) as AnyCell;
  const spec: FieldSpec = { ...GRANT, field_id: 'ch_sba_s270cf_personal_care_tested', kind: 'enum', tolerance: {}, question: 'Has s.270CF been tested?' };
  const res = reconcileField(spec, 'J1', [cta], { clock });
  assert.equal(res.confidence.grade, 'E');
  assert.equal(res.captures[0].asked_of, 'CTA');
  assert.match(res.captures[0].question, /CTA filing-position judgement/);
});

test('R15 the engine never settles a conflict itself; settling requires a human and a note', () => {
  __resetIds();
  const r = reg();
  const claims: AnyCell[] = [
    record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret(), value: 1200 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret(), value: 1340 }) as AnyCell,
  ];
  const res = reconcileField(GIA, 'J1', claims, { clock });
  const c = res.conflict!;
  assert.throws(
    () => settleConflict(c, { value: 1340, settled_by: 'SURVEYOR', note: '  ', settled_at: NOW }),
    /E_NO_NOTE/,
  );
  const settled = settleConflict(c, {
    value: 1287.5, settled_by: 'SURVEYOR', settled_at: NOW,
    note: 'Measured on site 19 Aug 2026. EPC understates (excludes plant room); VOA overstates (includes canopy).',
  });
  assert.equal(settled.status, 'RESOLVED_BY_HUMAN');
  assert.equal(settled.resolution!.value, 1287.5);
  assert.equal(c.status, 'OPEN', 'the original register entry is not mutated');
});

test('R16 severity is HIGH for any contested gate field regardless of spread', () => {
  __resetIds();
  const r = reg();
  const claims: AnyCell[] = [
    record<number>(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q' }), value: 0.30 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_DOC', retrieval: ret({ method: 'UPLOAD', locator: 'offer.pdf' }), value: 0.32 }) as AnyCell,
  ];
  const res = reconcileField(GRANT, 'J1', claims, { clock });
  assert.equal(res.conflict!.severity, 'HIGH');
});

test('R17 a stale field raises a re-fetch task aimed at the system, not a question for a person', () => {
  __resetIds();
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret({ retrieved_at: '2026-01-01T00:00:00Z', locator: 'CQC loc 1-234' }), value: 48 }) as AnyCell;
  const res = reconcileField(BEDS, 'J1', [c], { clock, staleFieldIds: ['beds_registered'] });
  assert.equal(res.value, 48);
  const stale = res.captures.find((x) => x.reason === 'STALE')!;
  assert.equal(stale.asked_of, 'SYSTEM');
  assert.match(stale.question, /Re-fetch/);
});

test('R18 the job report aggregates the register, the capture list and the blockers', () => {
  __resetIds();
  const r = reg();
  const claims = {
    gia_m2: [
      record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret(), value: 1200 }) as AnyCell,
      record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret(), value: 1340 }) as AnyCell,
    ],
    beds_registered: [
      record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret(), value: 48 }) as AnyCell,
    ],
    // grant_fraction deliberately absent
  };
  const rep = reconcile([GIA, BEDS, GRANT], 'J1', claims, { clock });

  assert.equal(rep.conflict_register.length, 1);
  assert.equal(rep.conflict_register[0].field_id, 'gia_m2');
  assert.equal(rep.capture_list.length, 2);
  assert.deepEqual(rep.capture_list.map((c) => c.field_id).sort(), ['gia_m2', 'grant_fraction']);
  assert.equal(rep.signoff_blocked, true);
  assert.deepEqual(rep.blockers.map((b) => b.field_id), ['grant_fraction']);
  assert.equal(rep.blockers[0].reason, 'not captured');
  // beds settled cleanly on a single A-grade register source
  const beds = rep.resolutions.find((x) => x.field_id === 'beds_registered')!;
  assert.equal(beds.value, 48);
  assert.equal(beds.confidence.basis, 'SINGLE_SOURCE');
  assert.equal(beds.confidence.blocks_signoff, false);
});

test('R19 the capture list is ordered by priority, blocking questions first', () => {
  __resetIds();
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret(), value: 48 }) as AnyCell;
  const rep = reconcile([BEDS, GRANT], 'J1', { beds_registered: [c] }, { clock, staleFieldIds: ['beds_registered'] });
  assert.equal(rep.capture_list[0].priority, 1);
  assert.equal(rep.capture_list[0].field_id, 'grant_fraction');
  assert.equal(rep.capture_list[rep.capture_list.length - 1].reason, 'STALE');
});

test('R20 claims come straight out of the provenance store, so every claim carries its provenance', () => {
  __resetIds();
  const r = reg();
  const store = new ProvenanceStore(r);
  store.put(record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'RRN-1' }), value: 1200 }) as AnyCell);
  store.put(record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ retrieved_at: '2026-08-25T09:00:00Z', locator: 'RRN-1 relodged' }), value: 1340 }) as AnyCell);
  const claims = claimsFromStore(store, 'J1', 'epc_total_floor_area_m2');
  assert.equal(claims.length, 2, 'the superseded version is still a claim');
  const res = reconcileField({ ...GIA, field_id: 'epc_total_floor_area_m2' }, 'J1', claims, { clock });
  assert.equal(res.value, null);
  assert.equal(res.conflict!.claims.every((c) => c.publisher === 'MHCLG' && c.retrieved_at.length > 0), true);
  assert.deepEqual(res.conflict!.claims.map((c) => c.locator).sort(), ['RRN-1', 'RRN-1 relodged']);
});

test('R21 the chosen value is best-evidence, not most-recent', () => {
  __resetIds();
  const r = reg();
  const client = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CLIENT_ANSWER', retrieval: ret({ retrieved_at: '2026-08-25T09:00:00Z', method: 'FORM', locator: 'q.beds' }), value: 48 }) as AnyCell;
  const cqc = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret({ retrieved_at: '2026-08-01T09:00:00Z', locator: 'CQC loc' }), value: 48 }) as AnyCell;
  const res = reconcileField(BEDS, 'J1', [client, cqc], { clock });
  assert.equal(res.chosen!.prov.source_id, 'CQC');
  assert.equal(res.confidence.grade, 'A');
});

test('R22 an exact-match field treats any difference as material', () => {
  __resetIds();
  const r = reg();
  const a = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CQC', retrieval: ret(), value: 48 }) as AnyCell;
  const b = record<number>(r, { entity_id: 'J1', field_id: 'beds_registered', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q' }), value: 49 }) as AnyCell;
  const res = reconcileField(BEDS, 'J1', [a, b], { clock });
  assert.equal(res.value, null);
  assert.equal(res.conflict!.spread_absolute, 1);
});

test('R23 every capture request names a real question, not a field id', () => {
  __resetIds();
  const rep = reconcile([GIA, GRANT, BEDS], 'J1', {}, { clock });
  assert.equal(rep.capture_list.length, 3);
  for (const c of rep.capture_list) {
    assert.ok(c.question.length > 20, `question too terse: ${c.question}`);
    assert.match(c.question, /\?/);
  }
});

test('R24 a contested field records the positions with their sources so a human chooses between evidence', () => {
  __resetIds();
  const r = reg();
  const claims: AnyCell[] = [
    record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret(), value: 1200 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'second lodgement' }), value: 1201 }) as AnyCell,
    record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret(), value: 1340 }) as AnyCell,
  ];
  const res = reconcileField(GIA, 'J1', claims, { clock });
  assert.equal(res.conflict!.positions.length, 2, 'the two EPC lodgements agree with each other');
  const epcPos = res.conflict!.positions.find((p) => p.sources.length === 2)!;
  assert.deepEqual(epcPos.sources, ['EPC', 'EPC']);
  assert.equal(res.captures[0].options.length, 2);
  assert.equal(res.captures[0].options.every((o) => o.retrieved_at.length > 0 && o.publisher.length > 0), true);
});

test('R26 gatherClaims collects one quantity across the three names its publishers use', () => {
  __resetIds();
  const r = reg();
  const store = new ProvenanceStore(r);
  // Each source may only write under its OWN field name — the source register
  // whitelist refuses anything else. So the reconciler must gather across names.
  store.put(record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'RRN-1' }), value: 1200 }) as AnyCell);
  store.put(record<number>(r, { entity_id: 'J1', field_id: 'voa_total_area_m2', source_id: 'VOA', retrieval: ret({ locator: 'BA 9911' }), value: 1340 }) as AnyCell);
  store.put(record<number>(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.gia' }), value: 1400 }) as AnyCell);

  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'EPC', retrieval: ret(), value: 1200 }),
    /E_FIELD_NOT_PERMITTED/,
    'the EPC cannot write under the canonical name — this is why claims_from exists',
  );

  const claims = gatherClaims(store, 'J1', GIA);
  assert.equal(claims.length, 3);
  const rep = reconcileFromStore([GIA], 'J1', store, { clock });
  assert.equal(rep.conflict_register.length, 1);
  assert.equal(rep.conflict_register[0].claims.length, 3);
  assert.deepEqual(
    rep.conflict_register[0].claims.map((c) => c.publisher).sort(),
    ['Client', 'MHCLG', 'Valuation Office Agency'],
  );
  assert.equal(rep.resolutions[0].value, null);
});

test('R25 a date field uses a day tolerance', () => {
  __resetIds();
  const spec: FieldSpec = {
    field_id: 'transaction_date', kind: 'date', gate: false, tolerance: { days: 3 },
    question: 'On what date did completion take place?', asked_of: 'CLIENT', escalate_to: 'SURVEYOR',
  };
  assert.equal(agree(spec, '2019-06-01', '2019-06-03'), true);
  assert.equal(agree(spec, '2019-06-01', '2019-06-30'), false);
});
