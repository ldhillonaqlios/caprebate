/**
 * Caprebate — AI Document Pipeline tests. Board item 12830166311.
 * Run:  node --test caprebate-document-pipeline.test.ts
 *
 * The central tests are P4-P9: a spy model records EVERYTHING it is handed, and
 * the objector's name and address must not appear anywhere in it.
 *
 * Phase 151b, 25 September 2026: TX1-TX6 — the tax return and the tax
 * computation (Word question 223). P21 now counts eleven specs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceRegister, record, type AnyCell } from './caprebate-source-register.ts';
import {
  segment, classifyHeading, sanitise, callModel, extract, toClaims, specFor, findCandidates,
  captureHumanRead,
  NEVER_TO_MODEL, DOC_SPECS, THRESHOLD_BY_CONSEQUENCE, PERSON_NAME_PATTERNS, PipelineError,
  HUMAN_READ_ONLY_TYPES, HUMAN_CAPTURE_SPECS, PERSON_REVIEW_BY_DOC_TYPE,
  type Segment, type ModelFn, type EgressEntry, type RawExtraction, type ModelPayload,
  type FinderSpec, type FinderCandidate, type HumanCaptureInput,
} from './caprebate-document-pipeline.ts';

const AT = '2026-08-26T12:00:00Z';

/** A real officer report shape: the useful part, then the part that must never leave. */
const PLANNING_PAGES = [
  {
    page: 1,
    lines: [
      'DESCRIPTION OF DEVELOPMENT',
      'Erection of a two-storey extension to provide 12 additional bedrooms,',
      'with associated plant enclosure and extract ventilation.',
      'DECISION',
      'Planning permission GRANTED subject to conditions.',
      'Reference: 24/01234/FUL. Decision dated 14 March 2024.',
      'CONDITIONS',
      '3. The extract ventilation plant shall be acoustically enclosed.',
    ],
  },
  {
    page: 2,
    lines: [
      'REPRESENTATIONS RECEIVED',
      'Mr Alan Brookfield of 14 Chapel Lane objects on grounds of noise from the',
      'proposed plant enclosure and overlooking to his rear garden.',
      'Mrs Priya Raman of 16 Chapel Lane supports the application.',
      'CONSULTEE RESPONSES',
      'Environmental Health: no objection subject to condition 3.',
      'CORRESPONDENCE',
      'Email from the agent dated 2 February 2024 clarifying the plant specification.',
    ],
  },
];

/** Records every payload it is given, so the tests can search what actually left. */
function spyModel(returns: RawExtraction = []) {
  const seen: ModelPayload[] = [];
  const fn: ModelFn = (p) => {
    seen.push(p);
    return returns;
  };
  return { fn, seen, asText: () => JSON.stringify(seen) };
}

/* ------------------------------------------------------------------ */

test('P1 forbidden segment kinds are declared, and UNCLASSIFIED is among them', () => {
  assert.ok(NEVER_TO_MODEL.includes('REPRESENTATIONS'));
  assert.ok(NEVER_TO_MODEL.includes('CONSULTEE_RESPONSES'));
  assert.ok(NEVER_TO_MODEL.includes('CORRESPONDENCE'));
  assert.ok(NEVER_TO_MODEL.includes('APPLICANT_DETAILS'));
  assert.ok(NEVER_TO_MODEL.includes('AGENT_DETAILS'));
  assert.ok(NEVER_TO_MODEL.includes('UNCLASSIFIED'), 'unclassified must fail closed');
});

test('P2 headings classify, and a mixed heading resolves to the FORBIDDEN kind', () => {
  assert.equal(classifyHeading('REPRESENTATIONS RECEIVED'), 'REPRESENTATIONS');
  assert.equal(classifyHeading('DECISION'), 'DECISION');
  assert.equal(classifyHeading('DESCRIPTION OF DEVELOPMENT'), 'PROPOSAL_DESCRIPTION');
  // Order is the control: forbidden patterns are tested before permitted ones.
  // WHICH forbidden kind wins is an implementation detail and not worth pinning —
  // what matters is that a heading mixing forbidden and permitted words never
  // resolves to the permitted one.
  for (const h of [
    'Consultation responses and proposal comments',
    'Representations on the proposed development',
    'Correspondence regarding conditions',
  ]) {
    assert.ok(NEVER_TO_MODEL.includes(classifyHeading(h)), `'${h}' must classify as forbidden, got ${classifyHeading(h)}`);
  }
  assert.equal(classifyHeading('Something nobody anticipated'), 'UNCLASSIFIED');
});

test('P3 the planning permitted-segment list is three items and contains nothing free-text about people', () => {
  const s = specFor('PLANNING');
  assert.deepEqual([...s.permitted_segments].sort(), ['CONDITIONS', 'DECISION', 'PROPOSAL_DESCRIPTION']);
  assert.equal(s.permitted_segments.some((k) => NEVER_TO_MODEL.includes(k)), false);
});

/* --- the rule --------------------------------------------------------- */

test('P4 THE RULE: the objector name and address never reach the model', () => {
  const segs = segment(PLANNING_PAGES);
  const m = spyModel();
  const egress: EgressEntry[] = [];
  extract('doc-1', 'PLANNING', segs, m.fn, { at: AT, egress });

  const sent = m.asText();
  assert.equal(m.seen.length, 1, 'the model was called once');
  assert.equal(sent.includes('Brookfield'), false, 'objector surname');
  assert.equal(sent.includes('Alan'), false, 'objector forename');
  assert.equal(sent.includes('Chapel Lane'), false, 'objector address');
  assert.equal(sent.includes('Raman'), false, 'supporter surname');
  assert.equal(sent.includes('Priya'), false);
  assert.equal(sent.includes('objects'), false, 'no representation text at all');
  assert.equal(sent.includes('Environmental Health'), false, 'consultee response');
  assert.equal(sent.includes('Email from the agent'), false, 'correspondence');
});

test('P5 the useful planning content DOES reach the model', () => {
  const m = spyModel();
  const egress: EgressEntry[] = [];
  extract('doc-1', 'PLANNING', segment(PLANNING_PAGES), m.fn, { at: AT, egress });
  const sent = m.asText();
  assert.ok(sent.includes('two-storey extension'));
  assert.ok(sent.includes('extract ventilation'));
  assert.ok(sent.includes('acoustically enclosed'));
  assert.ok(sent.includes('GRANTED'));
});

test('P6 forbidden segments are DROPPED, not redacted — they are not properties of the payload', () => {
  const { payload, dropped } = sanitise('doc-1', 'PLANNING', segment(PLANNING_PAGES));
  assert.equal(payload.segments.some((s) => NEVER_TO_MODEL.includes(s.kind)), false);
  const kinds = dropped.map((d) => d.kind);
  assert.ok(kinds.includes('REPRESENTATIONS'));
  assert.ok(kinds.includes('CONSULTEE_RESPONSES'));
  assert.ok(kinds.includes('CORRESPONDENCE'));
  // The payload object itself does not carry the text anywhere.
  assert.equal(JSON.stringify(payload).includes('Brookfield'), false);
});

test('P7 the drop record names the kind and page but NOT the text it dropped', () => {
  const { dropped } = sanitise('doc-1', 'PLANNING', segment(PLANNING_PAGES));
  const rep = dropped.find((d) => d.kind === 'REPRESENTATIONS')!;
  assert.equal(rep.page, 2);
  assert.ok(rep.reason.length > 0);
  assert.equal(JSON.stringify(dropped).includes('Brookfield'), false, 'the audit record must not become the leak');
});

test('P8 a forbidden segment forced past sanitise is still refused at the model boundary', () => {
  const { payload } = sanitise('doc-1', 'PLANNING', segment(PLANNING_PAGES));
  const forged = {
    ...payload,
    segments: [...payload.segments, { kind: 'REPRESENTATIONS' as const, heading: 'REPRESENTATIONS', text: 'objection', page: 2 }],
  } as unknown as ModelPayload;
  const m = spyModel();
  assert.throws(
    () => callModel(m.fn, forged, { at: AT, dropped: [], egress: [] }),
    (e: PipelineError) => e.code === 'E_FORBIDDEN_SEGMENT',
  );
  assert.equal(m.seen.length, 0, 'the model was never called');
});

test('P9 a person name inside a PERMITTED segment drops the whole segment', () => {
  const segs: Segment[] = [
    { kind: 'PROPOSAL_DESCRIPTION', heading: 'PROPOSAL', text: 'Erection of a dwelling for Mr Smith at the rear.', page: 1 },
    { kind: 'DECISION', heading: 'DECISION', text: 'Permission granted 14 March 2024.', page: 1 },
  ];
  const { payload, dropped } = sanitise('doc-2', 'PLANNING', segs);
  assert.equal(payload.segments.length, 1);
  assert.equal(payload.segments[0].kind, 'DECISION');
  assert.match(dropped[0].reason, /person-name pattern/);
  assert.equal(JSON.stringify(payload).includes('Smith'), false);
});

test('P10 an unclassified segment is dropped even though nobody knows what it was', () => {
  const segs: Segment[] = [{ kind: 'UNCLASSIFIED', heading: '(no heading)', text: 'anything at all', page: 1 }];
  const { payload, dropped } = sanitise('doc-3', 'PLANNING', segs);
  assert.equal(payload.segments.length, 0);
  assert.equal(dropped.length, 1);
});

test('P11 a payload cannot be constructed by hand — sanitise is the only producer', () => {
  const m = spyModel();
  // @ts-expect-error a bare object is not a ModelPayload
  assert.throws(() => callModel(m.fn, { doc_id: 'x', doc_type: 'PLANNING', segments: [{ kind: 'REPRESENTATIONS', heading: '', text: 'Mr Alan Brookfield', page: 1 }] }, { at: AT, dropped: [], egress: [] }));
  assert.equal(m.seen.length, 0);
});

/* --- egress record ----------------------------------------------------- */

test('P12 every model call records what was sent and what was withheld', () => {
  const egress: EgressEntry[] = [];
  const m = spyModel();
  extract('doc-1', 'PLANNING', segment(PLANNING_PAGES), m.fn, { at: AT, egress });
  assert.equal(egress.length, 1);
  const e = egress[0];
  assert.equal(e.doc_type, 'PLANNING');
  assert.equal(e.at, AT);
  assert.equal(e.payload_hash.length, 64);
  assert.ok(e.segments_sent.length >= 1);
  assert.ok(e.segments_dropped.some((d) => d.kind === 'REPRESENTATIONS'));
  assert.equal(JSON.stringify(egress).includes('Brookfield'), false, 'nor does the egress log leak');
});

/* --- thresholds and grading -------------------------------------------- */

test('P13 thresholds are set by consequence, closing schema gap G-3', () => {
  assert.equal(THRESHOLD_BY_CONSEQUENCE.APPORTIONMENT, 0.95);
  assert.equal(THRESHOLD_BY_CONSEQUENCE.GATE, 0.95);
  assert.equal(THRESHOLD_BY_CONSEQUENCE.TAXONOMY, 0.85);
  assert.equal(THRESHOLD_BY_CONSEQUENCE.NARRATIVE, 0.70);
  // every field in every spec carries a threshold matching its consequence
  for (const s of DOC_SPECS) {
    for (const f of s.fields) assert.equal(f.threshold, THRESHOLD_BY_CONSEQUENCE[f.consequence]);
  }
});

test('P14 above threshold the field stands at grade B; below it drops to C', () => {
  const raw: RawExtraction = [
    { field_id: 'reinstatement_declared_value_pence', value: 42_000_000, confidence: 0.97, page: 3, quote_ref: 'p3 "Declared value"' },
    { field_id: 'reinstatement_gia_m2', value: 1287.5, confidence: 0.80, page: 3, quote_ref: 'p3 "GIA"' },
  ];
  const segs: Segment[] = [{ kind: 'VALUATION', heading: 'REINSTATEMENT VALUATION', text: 'Declared value...', page: 3 }];
  const r = extract('doc-4', 'INSURANCE_REINSTATEMENT', segs, spyModel(raw).fn, { at: AT, egress: [] });

  const high = r.fields.find((x) => x.field_id === 'reinstatement_declared_value_pence')!;
  const low = r.fields.find((x) => x.field_id === 'reinstatement_gia_m2')!;
  assert.equal(high.grade, 'B');
  assert.equal(high.needs_human_review, false);
  assert.equal(low.grade, 'C');
  assert.equal(low.needs_human_review, true);
});

test('P15 a below-threshold field raises a review task naming the page and the quote', () => {
  const raw: RawExtraction = [
    { field_id: 'landlord_contribution_amount_pence', value: 4_500_000, confidence: 0.61, page: 12, quote_ref: 'p12 cl.4.3' },
  ];
  const segs: Segment[] = [{ kind: 'COVENANTS', heading: 'COVENANTS', text: 'Landlord contribution...', page: 12 }];
  const r = extract('doc-5', 'LEASE', segs, spyModel(raw).fn, { at: AT, egress: [] });
  assert.equal(r.review.length, 1);
  const t = r.review[0];
  assert.equal(t.asked_of, 'SURVEYOR', 'an apportionment field goes to the surveyor');
  assert.match(t.question, /61% confidence/);
  assert.match(t.question, /95% threshold/);
  assert.match(t.question, /p12 cl\.4\.3/);
});

test('P16 review routing follows consequence: GATE to an analyst, TAXONOMY to an analyst', () => {
  const gate: RawExtraction = [{ field_id: 'lease_repairing_basis', value: 'FRI', confidence: 0.5, page: 2, quote_ref: 'p2' }];
  const rg = extract('d', 'LEASE', [{ kind: 'COVENANTS', heading: 'COVENANTS', text: 'x', page: 2 }], spyModel(gate).fn, { at: AT, egress: [] });
  assert.equal(rg.review[0].asked_of, 'ANALYST');

  const tax: RawExtraction = [{ field_id: 'fra_alarm_system_category', value: 'L1', confidence: 0.5, page: 4, quote_ref: 'p4' }];
  const rt = extract('d', 'FIRE_RISK_ASSESSMENT', [{ kind: 'FINDINGS', heading: 'FINDINGS', text: 'x', page: 4 }], spyModel(tax).fn, { at: AT, egress: [] });
  assert.equal(rt.review[0].asked_of, 'ANALYST');
});

/* Phase 146, 22 Sep 2026. Caprebate has no tax adviser who could take a per-document
   review task: under clause 1 of the engagement letter the filing position is signed by
   the client's own accountant or adviser, or the client, and our own chartered tax
   adviser route is bracketed and unavailable; the one tax adviser we plan to engage is a
   one-off rules review that is given no client data. Until this date every GATE field
   was routed to 'CTA'. This test fails on that routing: run against the .bak-phase146
   copy of the pipeline it goes red on the first GATE field it reaches. */
test('P16b no review task raised from a client document is asked of a tax adviser — every GATE field, both routes', () => {
  let gateFields = 0;
  for (const spec of DOC_SPECS) {
    for (const fs of spec.fields.filter((x) => x.consequence === 'GATE')) {
      gateFields++;
      const segs: Segment[] = [{ kind: fs.from[0]!, heading: fs.from[0]!, text: 'x', page: 3 }];
      // Below threshold: the low-confidence route.
      const low = extract('d', spec.doc_type, segs,
        spyModel([{ field_id: fs.field_id, value: 'v', confidence: 0.5, page: 3, quote_ref: 'p3' }]).fn,
        { at: AT, egress: [] }, { [spec.doc_type]: false });
      assert.equal(low.review.length, 1, `${spec.doc_type}.${fs.field_id} below threshold raises one task`);
      assert.notEqual(low.review[0]!.asked_of, 'CTA', `${spec.doc_type}.${fs.field_id}: no per-case tax adviser exists under clause 1`);
      assert.equal(low.review[0]!.asked_of, 'ANALYST', `${spec.doc_type}.${fs.field_id}: confirming what the document says is ours`);
      // At or above threshold, with person review on for the type: the person-review route.
      const high = extract('d', spec.doc_type, segs,
        spyModel([{ field_id: fs.field_id, value: 'v', confidence: 0.99, page: 3, quote_ref: 'p3' }]).fn,
        { at: AT, egress: [] }, { [spec.doc_type]: true });
      assert.equal(high.review.length, 1, `${spec.doc_type}.${fs.field_id} under person review raises one task`);
      assert.equal(high.review[0]!.asked_of, 'ANALYST', `${spec.doc_type}.${fs.field_id}: person review goes to an analyst`);
    }
  }
  assert.ok(gateFields > 0, 'the specs carry GATE fields, so this test is not vacuous');
});

test('P17 a field the model did not find is NOT_FOUND, never guessed', () => {
  const segs: Segment[] = [{ kind: 'PLANT_SCHEDULE', heading: 'PLANT SCHEDULE', text: 'x', page: 1 }];
  const r = extract('doc-6', 'OM_MANUAL', segs, spyModel([]).fn, { at: AT, egress: [] });
  assert.equal(r.fields.length, 0);
  assert.deepEqual(r.not_found.sort(), ['om_commissioning_date', 'om_plant_items', 'om_system_types']);
});

test('P18 an extraction with no locator in the source document is refused', () => {
  const raw = [{ field_id: 'cost_prelims_pct', value: 18, confidence: 0.99, page: 2, quote_ref: '' }] as RawExtraction;
  assert.throws(
    () => extract('doc-7', 'CONTRACTOR_COST_BREAKDOWN',
      [{ kind: 'PRELIMS_AND_FEES', heading: 'PRELIMS', text: 'x', page: 2 }], spyModel(raw).fn, { at: AT, egress: [] }),
    (e: PipelineError) => e.code === 'E_NO_QUOTE_REF',
  );
});

test('P19 an out-of-range confidence is refused rather than clamped', () => {
  const raw = [{ field_id: 'cost_prelims_pct', value: 18, confidence: 1.4, page: 2, quote_ref: 'p2' }] as RawExtraction;
  assert.throws(
    () => extract('doc-8', 'CONTRACTOR_COST_BREAKDOWN',
      [{ kind: 'PRELIMS_AND_FEES', heading: 'PRELIMS', text: 'x', page: 2 }], spyModel(raw).fn, { at: AT, egress: [] }),
    (e: PipelineError) => e.code === 'E_BAD_CONFIDENCE',
  );
});

test('P20 an extracted VALUE that looks like a person is refused on the way out', () => {
  const raw = [{ field_id: 'planning_description', value: 'Extension for Mr Alan Brookfield', confidence: 0.99, page: 1, quote_ref: 'p1' }] as RawExtraction;
  assert.throws(
    () => extract('doc-9', 'PLANNING',
      [{ kind: 'PROPOSAL_DESCRIPTION', heading: 'PROPOSAL', text: 'Extension', page: 1 }], spyModel(raw).fn, { at: AT, egress: [] }),
    (e: PipelineError) => e.code === 'E_PERSON_NAME',
  );
});

/* --- per document type ------------------------------------------------- */

test('P21 all eleven document types have a spec, a why, and at least three fields (nine until Phase 151b added the two tax documents)', () => {
  const types = DOC_SPECS.map((d) => d.doc_type).sort();
  assert.deepEqual(types, [
    'ACCOUNTS', 'ASBESTOS_REGISTER', 'BUILDING_REGS_COMPLETION', 'COMPLETION_STATEMENT', 'CONTRACTOR_COST_BREAKDOWN',
    'CONTRACTOR_INVOICE', 'FIRE_RISK_ASSESSMENT', 'GRANT_FUNDING_AGREEMENT', 'INSURANCE_REINSTATEMENT', 'LEASE', 'OM_MANUAL',
    'PLANNING', 'PLANS', 'SBA_ALLOWANCE_STATEMENT', 'TAX_COMPUTATION', 'TAX_RETURN',
  ]); // Phase 157d added the four the Friary House run found nothing could receive (F16); Phase 159k the seller's SBA statement
  for (const d of DOC_SPECS) {
    assert.ok(d.fields.length >= 3, `${d.doc_type} has too few fields`);
    assert.ok(d.why.length > 30, `${d.doc_type} does not say why it matters`);
    assert.equal(d.permitted_segments.some((k) => NEVER_TO_MODEL.includes(k)), false, `${d.doc_type} permits a forbidden segment`);
  }
});

test('P22 the lease carries the landlord contribution as a NUMBER (I-4)', () => {
  const lease = specFor('LEASE');
  const c = lease.fields.find((x) => x.field_id === 'landlord_contribution_amount_pence')!;
  assert.equal(c.consequence, 'APPORTIONMENT');
  assert.match(c.note!, /NUMBER that is deducted, not a flag/);
});

test('P23 the reinstatement valuation is an independent claim on rebuild cost', () => {
  const spec = specFor('INSURANCE_REINSTATEMENT');
  assert.ok(spec.fields.every((x) => x.consequence === 'APPORTIONMENT'));
  assert.match(spec.why, /independent cross-check/);
});

/* --- handoff ------------------------------------------------------------ */

test('P24 extraction produces CLAIMS, and they are storable provenance cells', () => {
  const raw: RawExtraction = [
    { field_id: 'reinstatement_declared_value_pence', value: 42_000_000, confidence: 0.97, page: 3, quote_ref: 'p3 "Declared value"' },
  ];
  const segs: Segment[] = [{ kind: 'VALUATION', heading: 'VALUATION', text: 'x', page: 3 }];
  const r = extract('doc-10', 'INSURANCE_REINSTATEMENT', segs, spyModel(raw).fn, { at: AT, egress: [] });
  const claims = toClaims('J1', r, AT);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].source_id, 'CLIENT_DOC');
  assert.equal(claims[0].grade, 'B');
  assert.equal(claims[0].retrieval.extraction_confidence, 0.97);
  assert.match(claims[0].retrieval.locator, /INSURANCE_REINSTATEMENT:doc-10 p3/);

  // And it really does go into the source register from item 12830181420.
  const reg = new SourceRegister({ clock: () => AT });
  const cell = record(reg, {
    entity_id: claims[0].entity_id, field_id: claims[0].field_id, source_id: claims[0].source_id,
    retrieval: claims[0].retrieval, value: claims[0].value, grade: claims[0].grade,
  }) as AnyCell;
  assert.equal(cell.prov.prov, 'CD');
  assert.equal(cell.prov.grade, 'B');
  assert.equal(cell.prov.retrieval.extraction_confidence, 0.97);
});

test('P25 a below-threshold claim enters the register at grade C, so it cannot drive a gate alone (I-17)', () => {
  const raw: RawExtraction = [{ field_id: 'lease_term_years', value: 25, confidence: 0.7, page: 1, quote_ref: 'p1' }];
  const r = extract('doc-11', 'LEASE', [{ kind: 'DEMISE_AND_TERM', heading: 'TERM', text: 'x', page: 1 }], spyModel(raw).fn, { at: AT, egress: [] });
  const claim = toClaims('J1', r, AT)[0];
  assert.equal(claim.grade, 'C');
  const reg = new SourceRegister({ clock: () => AT });
  const cell = record(reg, {
    entity_id: 'J1', field_id: claim.field_id, source_id: 'CLIENT_DOC',
    retrieval: claim.retrieval, value: claim.value, grade: 'C',
  }) as AnyCell;
  assert.equal(cell.prov.grade, 'C');
});

test('P26 the name patterns catch the shapes that actually appear in these documents', () => {
  const hits = [
    'Mr Alan Brookfield of 14 Chapel Lane objects',
    'Name: Priya Raman',
    'Signed: John Smith',
    'on behalf of Alan Brookfield',
    'Yours faithfully',
    'Prepared by: assessor details follow',
  ];
  for (const h of hits.slice(0, 5)) {
    assert.ok(PERSON_NAME_PATTERNS.some((p) => p.test(h)), `missed: ${h}`);
  }
  // Honest about the limit: a bare name in running text is NOT caught by pattern.
  assert.equal(PERSON_NAME_PATTERNS.some((p) => p.test('Alan Brookfield objects to the plant')), false);
  // Which is why it is dropped at the SEGMENT level instead.
  assert.equal(classifyHeading('REPRESENTATIONS RECEIVED'), 'REPRESENTATIONS');
});

/* ------------------------------------------------------------------------ *
 * Phase 14 (item 12902240772) — the two ungated document types that close
 * the Stage 2 upload screen's scoping-inheritance gap. CPSE_REPLIES and
 * SALE_CONTRACT are designed in the same spec doc but remain gated on the
 * pipeline DPIA's party-identity question; FinderSpec exists for SALE_CONTRACT
 * and is tested here at the mechanism level (F1-F2) because the doc type
 * itself is not built.
 * ------------------------------------------------------------------------ */

test('P27 BUILDING_REGS_COMPLETION and GRANT_FUNDING_AGREEMENT close the scoping-inheritance gap', () => {
  const brc = specFor('BUILDING_REGS_COMPLETION');
  assert.deepEqual([...brc.permitted_segments], ['CERTIFICATE_BODY']);
  assert.deepEqual(brc.fields.map((x) => x.field_id).sort(), [
    'brc_certificate_reference', 'brc_completion_date', 'brc_issuing_body', 'brc_works_description',
  ]);
  assert.equal(brc.permitted_segments.some((k) => NEVER_TO_MODEL.includes(k)), false);

  const gfa = specFor('GRANT_FUNDING_AGREEMENT');
  assert.deepEqual([...gfa.permitted_segments].sort(), ['FUNDING_SCHEDULE', 'FUNDING_TERMS']);
  assert.deepEqual(gfa.fields.map((x) => x.field_id).sort(), [
    'grant_agreement_date', 'grant_amount_pence', 'grant_conditions',
    'grant_funder_name', 'grant_itemised_schedule', 'grant_purpose_description',
  ]);
  assert.equal(gfa.permitted_segments.some((k) => NEVER_TO_MODEL.includes(k)), false);
});

test('P28 new headings classify to the new segment kinds, not UNCLASSIFIED', () => {
  assert.equal(classifyHeading('BUILDING REGULATIONS COMPLETION CERTIFICATE'), 'CERTIFICATE_BODY');
  assert.equal(classifyHeading('FUNDING TERMS'), 'FUNDING_TERMS');
  assert.equal(classifyHeading('ITEMISED SCHEDULE'), 'FUNDING_SCHEDULE');
});

test('P29 approved inspector: the issuing body is captured as such, not defaulted to a local authority', () => {
  const raw: RawExtraction = [
    { field_id: 'brc_issuing_body', value: 'Approved Inspector: Stroma Building Control', confidence: 0.9, page: 1, quote_ref: 'p1 "Approved Inspector"' },
    { field_id: 'brc_completion_date', value: '2022-06-14', confidence: 0.9, page: 1, quote_ref: 'p1 "Completion date"' },
  ];
  const segs: Segment[] = [{ kind: 'CERTIFICATE_BODY', heading: 'BUILDING REGULATIONS COMPLETION CERTIFICATE', text: 'x', page: 1 }];
  const r = extract('doc-brc-1', 'BUILDING_REGS_COMPLETION', segs, spyModel(raw).fn, { at: AT, egress: [] });
  const issuer = r.fields.find((x) => x.field_id === 'brc_issuing_body')!;
  assert.match(String(issuer.value), /Approved Inspector/);
});

test('P30 grant tracing not attempted: an itemised schedule is returned verbatim and no allocation is computed', () => {
  const raw: RawExtraction = [
    { field_id: 'grant_funder_name', value: 'Rural Regeneration Fund', confidence: 0.9, page: 1, quote_ref: 'p1' },
    { field_id: 'grant_amount_pence', value: 5_000_000, confidence: 0.97, page: 1, quote_ref: 'p1 "the sum of"' },
    { field_id: 'grant_agreement_date', value: '2023-04-01', confidence: 0.96, page: 1, quote_ref: 'p1' },
    { field_id: 'grant_purpose_description', value: 'towards the cost of the new boiler and associated pipework', confidence: 0.96, page: 2, quote_ref: 'p2 cl.3' },
    { field_id: 'grant_itemised_schedule', value: ['Boiler replacement', 'Pipework'], confidence: 0.95, page: 3, quote_ref: 'p3 sch.1' },
    { field_id: 'grant_conditions', value: 'clawback if the boiler is removed within 5 years', confidence: 0.9, page: 4, quote_ref: 'p4' },
  ];
  const segs: Segment[] = [
    { kind: 'FUNDING_TERMS', heading: 'FUNDING TERMS', text: 'x', page: 1 },
    { kind: 'FUNDING_SCHEDULE', heading: 'ITEMISED SCHEDULE', text: 'x', page: 3 },
  ];
  const r = extract('doc-gfa-1', 'GRANT_FUNDING_AGREEMENT', segs, spyModel(raw).fn, { at: AT, egress: [] });

  const schedule = r.fields.find((x) => x.field_id === 'grant_itemised_schedule')!;
  assert.deepEqual(schedule.value, ['Boiler replacement', 'Pipework'], 'the schedule is returned as given, not summed or allocated');
  assert.equal(r.fields.some((x) => /deduction|alloc/i.test(x.field_id)), false, 'no derived deduction field exists to compute');
});

test('P31 GRANT_FUNDING_AGREEMENT emits no conclusion of any kind — the spec has no field for one, and a volunteered one is dropped', () => {
  const gfa = specFor('GRANT_FUNDING_AGREEMENT');
  assert.equal(gfa.fields.some((x) => /deduction|alloc|traced|payable_for/i.test(x.field_id)), false);

  // Even a model that tries to assert a conclusion cannot get it into the
  // result: extract() only reads fields named in the spec.
  const raw = [
    { field_id: 'grant_amount_pence', value: 5_000_000, confidence: 0.97, page: 1, quote_ref: 'p1' },
    { field_id: 'grant_traced_deduction_pence', value: 5_000_000, confidence: 0.99, page: 1, quote_ref: 'p1' },
  ] as RawExtraction;
  const r = extract('doc-gfa-2', 'GRANT_FUNDING_AGREEMENT',
    [{ kind: 'FUNDING_TERMS', heading: 'FUNDING TERMS', text: 'x', page: 1 }], spyModel(raw).fn, { at: AT, egress: [] });
  assert.equal(r.fields.some((x) => x.field_id === 'grant_traced_deduction_pence'), false,
    'a conclusion the model volunteers is not a requested field and never surfaces');
});

test('P32 the controls hold on both new document types: SIGNATORIES, CORRESPONDENCE and UNCLASSIFIED never reach the model', () => {
  const cases: [DocSpecType: 'BUILDING_REGS_COMPLETION' | 'GRANT_FUNDING_AGREEMENT', seg: Segment][] = [
    ['BUILDING_REGS_COMPLETION', { kind: 'CERTIFICATE_BODY', heading: 'CERTIFICATE', text: 'x', page: 1 }],
    ['GRANT_FUNDING_AGREEMENT', { kind: 'FUNDING_TERMS', heading: 'FUNDING TERMS', text: 'x', page: 1 }],
  ];
  for (const [docType, permittedSeg] of cases) {
    const segs: Segment[] = [
      permittedSeg,
      { kind: 'SIGNATORIES', heading: 'Signed', text: 'Signed: J Smith', page: 9 },
      { kind: 'CORRESPONDENCE', heading: 'Correspondence', text: 'Email exchange', page: 9 },
      { kind: 'UNCLASSIFIED', heading: '(no heading)', text: 'anything', page: 9 },
    ];
    const m = spyModel();
    extract('doc-controls', docType, segs, m.fn, { at: AT, egress: [] });
    const sentKinds = m.seen[0].segments.map((s) => s.kind);
    assert.equal(sentKinds.includes('SIGNATORIES'), false, docType);
    assert.equal(sentKinds.includes('CORRESPONDENCE'), false, docType);
    assert.equal(sentKinds.includes('UNCLASSIFIED'), false, docType);
  }
});

/* --- FinderSpec (item 12902240772 §6, §10) — mechanism-level, since SALE_CONTRACT itself is gated --- */

test('F1 a FinderSpec candidate never enters the source register: no grade, no threshold that means anything', () => {
  const spec: FinderSpec = {
    finder_id: 'test_finder',
    from: ['PLANT_SCHEDULE'],
    asked_of: 'CTA',
    question: (c) => `Look at ${c.quote_ref}`,
  };
  const candidates: FinderCandidate[] = [{ value: 'schedule 6, clause 4', page: 40, quote_ref: 'p40 sch.6 cl.4' }];
  const tasks = findCandidates(spec, 'doc-fc', candidates);
  assert.equal(tasks.length, 1);
  const t = tasks[0];
  assert.equal(t.confidence, 0);
  assert.equal(t.threshold, 0);
  assert.equal(t.asked_of, 'CTA');
  assert.equal('grade' in t, false, 'a candidate is not a value and has no grade');
  assert.ok(t.question.includes('p40 sch.6 cl.4'));
});

test('F2 the decoy: a schedule headed "Fixtures and Fittings" is FLAGGED, not suppressed, alongside a real election candidate', () => {
  // The finder function itself (SALE_CONTRACT, not built) is what decides to
  // over-flag; this locks in that findCandidates() performs no filtering of
  // its own on top of that, so a later "tidy-up" cannot quietly reintroduce
  // suppression at the pipeline layer.
  const spec: FinderSpec = {
    finder_id: 'election_candidate_finder',
    from: ['PLANT_SCHEDULE'],
    asked_of: 'CTA',
    question: (c) => `Confirm whether ${c.quote_ref} fixes the value of fixtures.`,
  };
  const decoy: FinderCandidate = { value: 'Schedule 4: Fixtures and Fittings (inventory)', page: 55, quote_ref: 'p55 sch.4' };
  const realElection: FinderCandidate = { value: 'Schedule 6: agreement fixing the value of fixtures', page: 60, quote_ref: 'p60 sch.6' };

  const tasks = findCandidates(spec, 'doc-decoy', [decoy, realElection]);
  assert.equal(tasks.length, 2, 'over-flagging is the specification: neither candidate is suppressed');
  assert.ok(tasks.some((t) => String(t.value).includes('Fixtures and Fittings')), 'the decoy schedule is flagged, not silently dropped');
  assert.ok(tasks.some((t) => String(t.value).includes('Schedule 6')));
});

/* ------------------------------------------------------------------------ *
 * Phase 21 (item 12902240772 §5-§9) — CPSE_REPLIES and SALE_CONTRACT stay
 * gated (Gate A: DPIA; Gate B: party identity), so §9's seven test cases are
 * split across two mechanisms: F1/F2 above test the FinderSpec mechanism
 * directly (schedule 6, the decoy), and P29-P31 above already cover the
 * approved-inspector and grant-tracing cases for the two ungated types. H1-H3
 * below close the remaining three: the "no election" case, "no conclusions
 * emitted" extended to the two gated types, and "controls hold on all four
 * new types" extended past P32's two. H4-H5 test captureHumanRead() itself —
 * the §8 interim mechanism that stops an upload of either type sitting
 * unprocessed while its gate is shut.
 * ------------------------------------------------------------------------ */

test('H1 no election: zero candidates, and contract_schedule_index is still captured in full', () => {
  const spec: FinderSpec = {
    finder_id: 'election_candidate_finder',
    from: ['PLANT_SCHEDULE'],
    asked_of: 'CTA',
    question: (c) => `Confirm whether ${c.quote_ref} fixes the value of fixtures.`,
  };
  // No schedule in this contract reads as an election — the finder is given
  // no candidates at all.
  const tasks = findCandidates(spec, 'doc-no-election', []);
  assert.equal(tasks.length, 0);

  // The finder returning nothing must not suppress the schedule index — a
  // silent empty list is indistinguishable from "no schedules exist" unless
  // the index is captured unconditionally, on its own path.
  const inputs: HumanCaptureInput[] = [
    { field_id: 'contract_date', value: '2024-03-01', page: 1, quote_ref: 'p1' },
    { field_id: 'contract_consideration_pence', value: 45_000_000, page: 1, quote_ref: 'p1' },
    {
      field_id: 'contract_schedule_index', page: 40, quote_ref: 'p40 index',
      value: ['Schedule 1: Title', 'Schedule 2: VAT election', 'Schedule 3: Completion arrangements'],
    },
  ];
  const r = captureHumanRead('doc-no-election', 'SALE_CONTRACT', inputs, 'A Reviewer', AT);
  const idx = r.fields.find((x) => x.field_id === 'contract_schedule_index')!;
  assert.deepEqual(idx.value, ['Schedule 1: Title', 'Schedule 2: VAT election', 'Schedule 3: Completion arrangements'],
    'the index is returned in full even though the finder flagged nothing');
  assert.equal(r.not_found.length, 0);
});

test('H2 no conclusions emitted: CPSE_REPLIES has no seller_pooled field, SALE_CONTRACT has no election_present or elected_amount', () => {
  const cpse = HUMAN_CAPTURE_SPECS.find((s) => s.doc_type === 'CPSE_REPLIES')!;
  assert.equal(cpse.fields.some((x) => /seller_pooled|entitlement/i.test(x.field_id)), false);

  const contract = HUMAN_CAPTURE_SPECS.find((s) => s.doc_type === 'SALE_CONTRACT')!;
  assert.equal(contract.fields.some((x) => /election_present|elected_amount/i.test(x.field_id)), false);

  // A conclusion volunteered on the input side does not surface either:
  // captureHumanRead only reads field_ids named in the spec, same discipline
  // as extract().
  const inputs: HumanCaptureInput[] = [
    { field_id: 'cpse_ca_reply_text', value: 'Not so far as the Seller is aware.', page: 12, quote_ref: 'p12 enq.32.3' },
    { field_id: 'seller_pooled', value: true, page: 12, quote_ref: 'p12 enq.32.3' },
  ];
  const r = captureHumanRead('doc-cpse-1', 'CPSE_REPLIES', inputs, 'A Reviewer', AT);
  assert.equal(r.fields.some((x) => x.field_id === 'seller_pooled'), false);
});

test('H3 the controls hold on all four new types: CPSE_REPLIES and SALE_CONTRACT can never reach a model at all', () => {
  for (const t of HUMAN_READ_ONLY_TYPES) {
    assert.throws(() => specFor(t), /E_HUMAN_READ_ONLY/, t);
    assert.equal(DOC_SPECS.some((d) => d.doc_type === t), false, `${t} must have no model-facing DocSpec`);
    assert.throws(
      () => extract('doc-x', t, [{ kind: 'UNCLASSIFIED', heading: 'x', text: 'x', page: 1 }], () => [], { at: AT, egress: [] }),
      /E_HUMAN_READ_ONLY/,
      t,
    );
  }
});

test('H4 captureHumanRead produces the same field/grade shape extract() does, and records who captured it and when', () => {
  const inputs: HumanCaptureInput[] = [
    { field_id: 'brc_certificate_reference', value: 'irrelevant field, ignored', page: 1, quote_ref: 'x' }, // not in the CPSE spec
    { field_id: 'cpse_form_edition', value: 'CPSE.1 version 3.8', page: 1, quote_ref: 'p1' },
    { field_id: 'cpse_ca_enquiry_numbers', value: ['32.3'], page: 12, quote_ref: 'p12' },
  ];
  const r = captureHumanRead('doc-cpse-2', 'CPSE_REPLIES', inputs, 'A Reviewer', AT);

  assert.equal(r.captured_by, 'A Reviewer');
  assert.equal(r.captured_at, AT);
  assert.equal(r.fields.some((x) => x.field_id === 'brc_certificate_reference'), false, 'only field_ids in the CPSE spec are read');
  assert.ok(r.not_found.includes('cpse_ca_question_text'), 'unsupplied fields are NOT_FOUND, never guessed');

  const edition = r.fields.find((x) => x.field_id === 'cpse_form_edition')!;
  assert.equal(edition.grade, 'B');
  assert.equal(edition.confidence, 1);
  assert.equal(edition.needs_human_review, false, 'already read by a human by construction');
  assert.equal(edition.threshold, THRESHOLD_BY_CONSEQUENCE.NARRATIVE);
});

test('H5 captureHumanRead refuses a document type that is not HUMAN_READ_ONLY', () => {
  assert.throws(() => captureHumanRead('doc-x', 'PLANNING', [], 'A Reviewer', AT), /E_NOT_HUMAN_READ_ONLY/);
});

/* --- M: mandatory person review, per document type ---------------------- *
 * Phase 132, 14 September 2026. PERSON_REVIEW_BY_DOC_TYPE shipped all false.
 * Phase 146e, 22 September 2026: FIRE_RISK_ASSESSMENT is on (residents' health
 * details); the other eight are off. M1 and M2 hold that.
 * ------------------------------------------------------------------------- */

const FRA_SEGS: Segment[] = [{ kind: 'FINDINGS', heading: 'FINDINGS', text: 'x', page: 4 }];
const FRA_RAW: RawExtraction = [
  { field_id: 'fra_alarm_system_category', value: 'L1', confidence: 0.97, page: 4, quote_ref: 'p4 "Category"' },
  { field_id: 'fra_emergency_lighting', value: 'present', confidence: 0.5, page: 4, quote_ref: 'p4 "Lighting"' },
];

test('M1 the person-review table is keyed by exactly the DOC_SPECS types, frozen, and ON FOR FIRE RISK ASSESSMENTS ALONE', () => {
  assert.deepEqual(Object.keys(PERSON_REVIEW_BY_DOC_TYPE).sort(), DOC_SPECS.map((s) => s.doc_type).sort());
  const on = Object.entries(PERSON_REVIEW_BY_DOC_TYPE).filter(([, v]) => v !== false).map(([k]) => k);
  assert.deepEqual(on, ['FIRE_RISK_ASSESSMENT'], 'person review is on for a type other than fire risk assessments, or off for them');
  assert.equal(PERSON_REVIEW_BY_DOC_TYPE.FIRE_RISK_ASSESSMENT, true);
  assert.equal(Object.isFrozen(PERSON_REVIEW_BY_DOC_TYPE), true);
  for (const t of HUMAN_READ_ONLY_TYPES) assert.equal(t in PERSON_REVIEW_BY_DOC_TYPE, false, `${t} never reaches extract()`);
});

test('M2 off for a type: an above-threshold field has no review; and a call with no table is a call with the shipped one', () => {
  const byDefault = extract('doc-m2', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] });
  const explicit = extract('doc-m2', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] }, PERSON_REVIEW_BY_DOC_TYPE);
  assert.equal(JSON.stringify(byDefault), JSON.stringify(explicit));
  assert.equal(byDefault.fields.find((x) => x.field_id === 'fra_alarm_system_category')!.needs_human_review, true,
    'as shipped, a confident fire risk assessment field stood with no person checking it');
  const offTable = { ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: false };
  const off = extract('doc-m2', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] }, offTable);
  const high = off.fields.find((x) => x.field_id === 'fra_alarm_system_category')!;
  assert.equal(high.needs_human_review, false);
  assert.equal(off.review.some((t) => t.field_id === 'fra_alarm_system_category'), false);
  assert.equal(off.review.length, 1, 'only the below-threshold field is reviewed');
});

test('M3 on for FIRE_RISK_ASSESSMENT: the above-threshold field gets a review, grade unchanged; the below-threshold field still has exactly one task', () => {
  const off = extract('doc-m3', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] },
    { ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: false });
  const on = extract('doc-m3', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] },
    { ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: true });

  const highOn = on.fields.find((x) => x.field_id === 'fra_alarm_system_category')!;
  const highOff = off.fields.find((x) => x.field_id === 'fra_alarm_system_category')!;
  assert.equal(highOn.needs_human_review, true);
  assert.equal(highOn.grade, 'B');
  assert.equal(highOn.grade, highOff.grade);
  const highTasks = on.review.filter((t) => t.field_id === 'fra_alarm_system_category');
  assert.equal(highTasks.length, 1);
  assert.equal(highTasks[0]!.asked_of, 'ANALYST', 'the existing routing by consequence');
  assert.match(highTasks[0]!.question, /Person review is required/);
  assert.doesNotMatch(highTasks[0]!.question, /below the/);

  const lowTasks = on.review.filter((t) => t.field_id === 'fra_emergency_lighting');
  assert.equal(lowTasks.length, 1, 'a below-threshold field was given a second task');
  assert.match(lowTasks[0]!.question, /below the 85% threshold/);
  assert.deepEqual(on.fields.map((x) => x.grade), off.fields.map((x) => x.grade), 'the switch moved a grade');
});

test('M4 one type on leaves every other type exactly as it was', () => {
  const leaseRaw: RawExtraction = [{ field_id: 'lease_repairing_basis', value: 'FRI', confidence: 0.99, page: 2, quote_ref: 'p2' }];
  const leaseSegs: Segment[] = [{ kind: 'COVENANTS', heading: 'COVENANTS', text: 'x', page: 2 }];
  const plain = extract('d', 'LEASE', leaseSegs, spyModel(leaseRaw).fn, { at: AT, egress: [] });
  const withFra = extract('d', 'LEASE', leaseSegs, spyModel(leaseRaw).fn, { at: AT, egress: [] },
    { ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: true });
  assert.equal(JSON.stringify(withFra), JSON.stringify(plain));
  assert.equal(withFra.review.length, 0);
});

test('M5 human-read-only types are still refused, even with every type switched on', () => {
  const everything: Record<string, boolean> = Object.fromEntries(
    [...DOC_SPECS.map((s) => s.doc_type), ...HUMAN_READ_ONLY_TYPES].map((t) => [t, true]));
  for (const t of HUMAN_READ_ONLY_TYPES) {
    const spy = spyModel([]);
    assert.throws(() => extract('d', t, [{ kind: 'FINDINGS', heading: 'FINDINGS', text: 'x', page: 1 }], spy.fn, { at: AT, egress: [] }, everything));
    assert.equal(spy.seen.length, 0, `${t} reached the model`);
  }
});

test('M6 fail closed: a type missing from a passed table reads as REVIEW REQUIRED — an absent key and an undefined value alike', () => {
  const { FIRE_RISK_ASSESSMENT: _dropped, ...missing } = PERSON_REVIEW_BY_DOC_TYPE;
  const undef = { ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: undefined as unknown as boolean };
  const run = (table: Partial<Record<string, boolean>>) =>
    extract('doc-m6', 'FIRE_RISK_ASSESSMENT', FRA_SEGS, spyModel(FRA_RAW).fn, { at: AT, egress: [] }, table);
  const on = run({ ...PERSON_REVIEW_BY_DOC_TYPE, FIRE_RISK_ASSESSMENT: true });
  const absent = run(missing);
  const undefinedValue = run(undef);
  assert.equal(JSON.stringify(absent), JSON.stringify(on), 'an absent row switched review off');
  assert.equal(JSON.stringify(undefinedValue), JSON.stringify(absent), 'absent and undefined behaved differently');
  assert.equal(absent.fields.find((x) => x.field_id === 'fra_alarm_system_category')!.needs_human_review, true);
});

/* --- TX: the tax return and the tax computation (Phase 151b) ------------ *
 * Word question 223, answered yes by the data protection officer on 24
 * September 2026: keep the figures and the company details, remove the
 * individuals. Every name, number and reference below is INVENTED.
 * ------------------------------------------------------------------------- */

test('TX1 a person\'s details and the declaration are NEVER sent to a model — nine kinds on NEVER_TO_MODEL now, not seven', () => {
  assert.ok(NEVER_TO_MODEL.includes('TAXPAYER_PERSONAL_DETAILS'));
  assert.ok(NEVER_TO_MODEL.includes('DECLARATION'));
  assert.equal(NEVER_TO_MODEL.length, 9);
  for (const t of ['TAX_RETURN', 'TAX_COMPUTATION'] as const) {
    assert.deepEqual([...specFor(t).permitted_segments].sort(),
      ['CAPITAL_ALLOWANCES_COMPUTATION', 'TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION']);
  }
});

test('TX2 the heading rules: a person\'s details and the declaration win over a figure in the same heading, and nothing the earlier eleven types used changes kind', () => {
  const cases: [string, string][] = [
    ['YOUR PERSONAL DETAILS', 'TAXPAYER_PERSONAL_DETAILS'],
    ['BUSINESS DETAILS', 'TAXPAYER_PERSONAL_DETAILS'],
    ['National Insurance number:', 'TAXPAYER_PERSONAL_DETAILS'],
    ["DIRECTORS' DETAILS", 'TAXPAYER_PERSONAL_DETAILS'],
    ['Your name and address — capital allowances claimed', 'TAXPAYER_PERSONAL_DETAILS'],
    ['DECLARATION', 'DECLARATION'],
    ['Declaration: profits and capital allowances', 'DECLARATION'],
    ['PREPARED BY INVENTED ACCOUNTANTS LLP', 'SIGNATORIES'],
    ['TAX AGENT', 'AGENT_DETAILS'],
    ['COMPANY INFORMATION', 'TAX_ENTITY_DETAILS'],
    ['Company tax reference:', 'TAX_ENTITY_DETAILS'],
    ['RETURN PERIOD', 'TAX_ENTITY_DETAILS'],
    ['Tax reference:', 'UNCLASSIFIED'],
    ['TAX COMPUTATION FOR THE YEAR ENDED 31 MARCH 2026', 'TAX_PROFIT_COMPUTATION'],
    ['CALCULATING YOUR TAXABLE PROFIT OR LOSS', 'TAX_PROFIT_COMPUTATION'],
    ['CAPITAL ALLOWANCES AND BALANCING CHARGES', 'CAPITAL_ALLOWANCES_COMPUTATION'],
    ['SPECIAL RATE POOL', 'CAPITAL_ALLOWANCES_COMPUTATION'],
    ['ANNUAL INVESTMENT ALLOWANCE', 'CAPITAL_ALLOWANCES_COMPUTATION'],
  ];
  for (const [h, k] of cases) assert.equal(classifyHeading(h), k, h);
  // Headings the earlier types rely on keep their kind: the tax rules come LAST.
  const unchanged: [string, string][] = [
    ['Declared value', 'VALUATION'], ['Particulars', 'DEMISE_AND_TERM'], ['Plant schedule', 'PLANT_SCHEDULE'],
    ['Cost breakdown', 'COST_SCHEDULE'], ['Grant funding agreement', 'FUNDING_TERMS'], ['DESCRIPTION OF DEVELOPMENT', 'PROPOSAL_DESCRIPTION'],
  ];
  for (const [h, k] of unchanged) assert.equal(classifyHeading(h), k, h);
});

test('TX3 no tax field is a name or a tax reference, and none routes to a surveyor — a surveyor may not read either document', () => {
  for (const t of ['TAX_RETURN', 'TAX_COMPUTATION'] as const) {
    const spec = specFor(t);
    assert.ok(spec.fields.length >= 3);
    for (const f of spec.fields) {
      assert.doesNotMatch(f.field_id, /name|utr|reference|insurance|nino|signatory|agent|person/, f.field_id);
      assert.notEqual(f.consequence, 'APPORTIONMENT', `${f.field_id} would send a review task to a surveyor`);
    }
  }
  const ids = (t: 'TAX_RETURN' | 'TAX_COMPUTATION') => specFor(t).fields.map((f) => f.field_id);
  // What a claim needs, and each is there.
  for (const id of ['taxret_period_end', 'taxret_taxable_profit_pence', 'taxret_capital_allowances_by_pool', 'taxret_aia_claimed_pence'])
    assert.ok(ids('TAX_RETURN').includes(id), id);
  for (const id of ['taxcomp_period_end', 'taxcomp_main_pool_balance_pence', 'taxcomp_special_rate_pool_balance_pence', 'taxcomp_aia_claimed_pence', 'taxcomp_taxable_profit_pence'])
    assert.ok(ids('TAX_COMPUTATION').includes(id), id);
});

test('TX4 SPY MODEL, a company\'s return: the figures reach the model; the director who signed, the agent and the declaration do not', () => {
  const pages = [
    { page: 1, lines: ['COMPANY INFORMATION', 'Company registration number 09876543', 'RETURN PERIOD', 'From 1 April 2025 to 31 March 2026'] },
    { page: 2, lines: ['CAPITAL ALLOWANCES AND BALANCING CHARGES', 'Annual investment allowance 180,000'] },
    { page: 3, lines: ['DECLARATION', 'Name Jane Inventedperson, Director', 'AGENT DETAILS', 'Peter Madeupname of Invented & Co'] },
  ];
  const spy = spyModel([
    { field_id: 'taxret_aia_claimed_pence', value: 18000000, confidence: 0.98, page: 2, quote_ref: 'p2 "Annual investment allowance"' },
    { field_id: 'taxret_company_number', value: '09876543', confidence: 0.99, page: 1, quote_ref: 'p1 "Company registration number"' },
  ]);
  const r = extract('ct-tx4', 'TAX_RETURN', segment(pages), spy.fn, { at: AT, egress: [] });
  const sent = spy.asText();
  assert.match(sent, /180,000/);
  assert.doesNotMatch(sent, /Inventedperson|Madeupname|Invented & Co/);
  assert.deepEqual(r.dropped.map((d) => d.kind).sort(), ['AGENT_DETAILS', 'DECLARATION']);
  assert.deepEqual(r.fields.map((f) => f.field_id).sort(), ['taxret_aia_claimed_pence', 'taxret_company_number']);
  assert.equal(r.fields.every((f) => f.grade === 'B'), true);
  assert.ok(r.not_found.includes('taxret_taxable_profit_pence'), 'what the return did not give is not found, never guessed');
});

test('TX5 SPY MODEL, a sole trader\'s return: only the figures leave the building', () => {
  const pages = [
    { page: 1, lines: ['YOUR PERSONAL DETAILS', 'Name Samuel Inventedname', 'National Insurance number QQ 12 34 56 C', 'BUSINESS DETAILS', 'Business name Samuel Inventedname Dental'] },
    { page: 2, lines: ['CAPITAL ALLOWANCES', 'Annual investment allowance 64,000', 'CALCULATING YOUR TAXABLE PROFIT OR LOSS', 'Net profit 88,200'] },
  ];
  const spy = spyModel([]);
  extract('sa-tx5', 'TAX_RETURN', segment(pages), spy.fn, { at: AT, egress: [] });
  const sent = spy.asText();
  assert.match(sent, /64,000/);
  assert.match(sent, /88,200/);
  assert.doesNotMatch(sent, /Samuel|Inventedname|QQ 12 34 56 C|Dental/);
});

test('TX6 the tax types are model types, not human-read-only, and person review is OFF for both until somebody decides otherwise', () => {
  for (const t of ['TAX_RETURN', 'TAX_COMPUTATION'] as const) {
    assert.equal(HUMAN_READ_ONLY_TYPES.includes(t), false);
    assert.equal(PERSON_REVIEW_BY_DOC_TYPE[t], false);
  }
});
