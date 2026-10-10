/**
 * Caprebate — CLIENT_DOC Ingestion Minimisation Control, tests.
 * Board item 12928074627. Phase 41.
 *
 * Run:  node --test caprebate-client-doc-ingestion.test.ts
 *
 * Numbering:
 *   C*  the receipt policy and its derivation from the field sets
 *   A14-D4* condition A14-D4 — the planning fix, which is separable and urgent
 *   W*  the name exclusion register wired into the upload path
 *   P*  the party legal-form test, including the three cases the register
 *       population never needed (Phase 40 §4.1). P10 is the mirror of the
 *       register's own T10
 *   H*  the human-capture rule (condition A14-D3)
 *   T*  the per-upload transparency record (conditions A14-D1, A14-D2, A14-D5)
 *   R*  the raw-file retention and deletion mechanism
 *   S*  the storage fact
 *
 * Added by Phase 44 (board items 12928214881 and 12928215019), 30 Aug 2026:
 *   B*  the ingestion boundary — where the file actually is when the strip runs
 *   X*  the withdrawn retention rule, and the condition A14-D4 constraint that
 *       follows from the boundary
 *
 * Added by Phase 65 (Q56 answered), 2 Sep 2026:
 *   Y*  the answer — Reading B — and the RET-7 clock it needs. P* was already
 *       taken by the party legal-form tests, hence Y
 *
 * Added by Phase 132, 14 Sep 2026:
 *   Z*  the host's backup cycle as a named blank on every deletion, no restore
 *       without the DPO's approval, and RET-3's clock — which a cycle not known
 *       and a cycle never set both leave with no date (N4)
 *
 * Added by Phase 151b, 25 Sep 2026:
 *   Y7 (rewritten) and Y9-Y12  Word answer 173 — where two retention periods
 *       apply, the LATER keep-until date governs
 *   C10-C14  the tax return and the tax computation, received under receipt
 *       policies of their own (Word question 223, answered yes by the data
 *       protection officer on 24 September 2026)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOC_SPECS, HUMAN_CAPTURE_SPECS, HUMAN_READ_ONLY_TYPES, NEVER_TO_MODEL,
  segment, classifyHeading, sanitise,
  type DocType, type Segment,
} from './caprebate-document-pipeline.ts';
import { NameExclusionError } from './caprebate-name-exclusion.ts';
import {
  CLIENT_DOC_RECEIPT_POLICY, NEVER_RETAINED_ON_RECEIPT, ALWAYS_NATURAL_PERSON_ROLES,
  VERBATIM_FIELDS, FAIL_CLOSED_SETTINGS, STORAGE_POSITION,
  ClientDocIngestionError,
  receiptPolicyFor, applyReceiptPolicy, assertClaimsWritable,
  classifyPartyReference, roleIsAlwaysNaturalPerson,
  assertHumanCaptureClean,
  openTransparencyRecord, routeGroupFor, assertTransparencyRecordComplete,
  deletionDueAt, sweepForDeletion, recordDeletion, assertNoOverdueUndeleted,
  type IdentifiedPerson, type RawFileRecord, type IngestionSettings,
  // Phase 44 — the ingestion boundary
  INGESTION_BOUNDARY, BOUNDARY_POSITION, RECEIPT_CONTRACT, CONDITION_D4_STATUS,
  QUARANTINE_TTL_MINUTES,
  assertQuarantineKey, quarantineDischargeDueAt, sweepQuarantine,
  recordQuarantineDischarge, assertQuarantineDischarged,
  type QuarantineObject,
  // Phase 44 — the withdrawn retention rule
  WITHDRAWN_RETENTION_RULES, REDACTION_PRODUCER_CONTRACT,
  assertRetentionRuleImplementable, rawFileRecordFromReceipt,
  type RawFileRetentionRule,
  // Phase 65 — the answer and its clock
  Q56_ANSWER, RET7, ret7DueAt,
  // Phase 132 — the backup cycle, the restore guard and RET-3
  BACKUP_CYCLE, assertRestoreApproved, ret3DueAt, knownBackupCycleDays,
  type BackupCycle,
} from './caprebate-client-doc-ingestion.ts';

const ALL_TYPES: readonly DocType[] = [
  'PLANNING', 'FIRE_RISK_ASSESSMENT', 'OM_MANUAL', 'ASBESTOS_REGISTER',
  'INSURANCE_REINSTATEMENT', 'LEASE', 'CONTRACTOR_COST_BREAKDOWN',
  'BUILDING_REGS_COMPLETION', 'GRANT_FUNDING_AGREEMENT',
  'CPSE_REPLIES', 'SALE_CONTRACT',
  // Phase 146l: the Land Registry official copy, read by a person.
  'TITLE_REGISTER',
  // Phase 151b, Word question 223
  'TAX_RETURN', 'TAX_COMPUTATION',
  // Phase 157d, the Friary House run (F16)
  'COMPLETION_STATEMENT', 'ACCOUNTS', 'CONTRACTOR_INVOICE', 'PLANS',
  // Phase 159k, the seller's structures allowance statement
  'SBA_ALLOWANCE_STATEMENT',
];

const seg = (kind: Segment['kind'], heading: string, page = 1, text = 'body'): Segment =>
  ({ kind, heading, text, page });

/* ================================================================== *
 * C — the receipt policy, derived from the field sets
 * ================================================================== */

test('C1 every document type has a receipt policy, and there are exactly thirteen (eleven until Phase 151b)', () => {
  assert.equal(CLIENT_DOC_RECEIPT_POLICY.length, 19); // fourteen since Phase 146l: the Land Registry official copy; eighteen since Phase 157d; nineteen since Phase 159k (the seller's SBA statement)
  for (const t of ALL_TYPES) assert.ok(receiptPolicyFor(t), `no policy for ${t}`);
});

test('C2 the retained segments for the nine model types ARE the spec\'s permitted segments — derived, not restated', () => {
  // The point of the phase: work it from the field sets, not from a general
  // idea of what is sensitive. If a spec changes its permitted segments, the
  // receipt policy changes with it and this test proves it did.
  for (const spec of DOC_SPECS) {
    const policy = receiptPolicyFor(spec.doc_type);
    assert.equal(policy.mode, 'SPEC_DERIVED', `${spec.doc_type} should be spec-derived`);
    assert.deepEqual(
      [...policy.retained_segments].sort(),
      [...spec.permitted_segments].sort(),
      `${spec.doc_type}: retained segments have drifted from the extraction spec`,
    );
  }
});

test('C3 no retained segment is on NEVER_TO_MODEL — the receipt strip is at least as tight as the model boundary', () => {
  for (const p of CLIENT_DOC_RECEIPT_POLICY) {
    for (const k of p.retained_segments) {
      assert.ok(!NEVER_TO_MODEL.includes(k), `${p.doc_type} retains ${k}, which is on NEVER_TO_MODEL`);
    }
  }
});

test('C4 a LEASE loses its parties clause, execution block and witnesses, and keeps everything the spec needs', () => {
  const r = applyReceiptPolicy('LEASE-1', 'LEASE', [
    seg('DEMISE_AND_TERM', 'THE PREMISES'),
    seg('COVENANTS', 'TENANT COVENANTS', 2),
    seg('APPLICANT_DETAILS', 'THE PARTIES', 1),
    seg('SIGNATORIES', 'EXECUTED AS A DEED', 9),
    seg('UNCLASSIFIED', 'SIGNED by the said witness', 9),
  ]);
  assert.deepEqual(r.retained.map((s) => s.kind), ['DEMISE_AND_TERM', 'COVENANTS']);
  assert.deepEqual(
    r.removed.map((s) => [s.kind, s.reason]),
    [['APPLICANT_DETAILS', 'NO_FIELD_NEEDS_IT'], ['SIGNATORIES', 'NO_FIELD_NEEDS_IT'], ['UNCLASSIFIED', 'UNCLASSIFIED_FAILS_CLOSED']],
  );
});

test('C5 the removal log records kind, heading, page and reason — and never the text', () => {
  const r = applyReceiptPolicy('L2', 'LEASE', [seg('SIGNATORIES', 'EXECUTED', 9, 'signed by Mr John Smith of 4 Acacia Ave')]);
  assert.equal(r.removed.length, 1);
  assert.ok(!('text' in r.removed[0]), 'a removal log carrying the text would recreate the exposure it records');
  assert.equal(JSON.stringify(r.removed).includes('Acacia'), false);
});

test('C6 an unknown document type is refused outright rather than stored unhandled', () => {
  assert.throws(
    () => receiptPolicyFor('SOMETHING_NEW' as DocType),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_NO_RECEIPT_POLICY',
  );
});

test('C7 NO FIELD IN ANY OF THE ELEVEN SPECIFICATIONS IS A PERSON\'S NAME — asserted, not asserted-in-prose', () => {
  // The load-bearing fact of the whole phase. Checked mechanically so that a
  // spec growing a name field breaks this test rather than quietly widening
  // the population.
  const nameish = /(^|_)(name|names|signatory|signed_by|witness|assessor|surveyor|valuer|objector|applicant|agent|contact|officer|person)(_|$)/;
  const allowed = new Set(['grant_funder_name', 'brc_issuing_body']); // organisations, and both carry a discriminant
  const fields = [
    ...DOC_SPECS.flatMap((s) => s.fields.map((f) => f.field_id)),
    ...HUMAN_CAPTURE_SPECS.flatMap((s) => s.fields.map((f) => f.field_id)),
  ];
  for (const f of fields) {
    if (allowed.has(f)) continue;
    assert.ok(!nameish.test(f), `field '${f}' looks like a person-name field — Phase 40 §5.4 no longer holds`);
  }
  // 57 on the model path across the eleven DOC_SPECS, 9 on the human path
  // across the two HUMAN_CAPTURE_SPECS. Pinned so that a spec gaining a field
  // fails here and forces the field-by-field check to be re-run by a person,
  // rather than the regex above being trusted to have thought of everything.
  // Phase 151b re-ran it for the thirteen tax fields (44 + 13): six on the
  // return, seven on the computation — dates, sums of money, lists of sums by
  // pool, and one company number. None is a name or a tax reference.
  // Phase 157d re-ran it for the sixteen fields of its four types (57 + 16 = 73): a completion date, a price and its
  // parts, stamp duty; a period end, a profit, fixed-asset additions and costs, allowances claimed; invoice lines and
  // totals, VAT and a date; room labels, an area and a drawing date. None is a name, an address or a reference to anyone.
  // Phase 159k re-ran it for the three fields of the seller's structures allowance statement (73 + 3 = 76): the date of
  // the earliest construction contract, the date of first use and the qualifying expenditure. None is a name or an address.
  assert.equal(DOC_SPECS.reduce((a, s) => a + s.fields.length, 0), 76);
  // Phase 146l re-ran it for the seven official-copy fields (9 + 7 = 16 on the human path): a title number, a tenure,
  // a price, its date, a company number and two counts. None is a name, an address or a personal reference.
  assert.equal(HUMAN_CAPTURE_SPECS.reduce((a, s) => a + s.fields.length, 0), 16);
  assert.equal(fields.length, 92, 'the field count changed — re-run the field-by-field check before touching this number');
});

/*
 * PHASE 151b: THE THIRTEEN TAX FIELDS ARE NOT ON THE REGISTER'S KEEP LIST YET.
 * The CLIENT_DOC entry in caprebate-name-exclusion.ts enumerates every spec
 * field literally, so that a new field must EARN its way on. That file is not
 * part of Phase 151b's change, so the tax fields are not on it, and a claim
 * carrying one is refused as unclassified — the register doing its job, not a
 * bypass. Nothing reaches that point today: reading a document by model is
 * switched off in the back end, and receiving a tax return does not need it.
 * C8 holds every other field; C8b holds the refusal, so the day the register
 * lists them C8b fails and this exception list must be emptied.
 */
/* PHASE 151b, later the same day: the register now lists the thirteen tax fields (caprebate-name-exclusion.ts, the
   CLIENT_DOC entry), so nothing waits on it any more. The set is kept, as the list C8b reads. */
const TAX_FIELDS = new Set(
  DOC_SPECS.filter((s) => s.doc_type === 'TAX_RETURN' || s.doc_type === 'TAX_COMPUTATION')
    .flatMap((s) => s.fields.map((f) => f.field_id)),
);

test('C8 every spec field is on the CLIENT_DOC keep list, so no live field fails closed in production — the tax fields included', () => {
  const fields = [
    ...DOC_SPECS.flatMap((s) => s.fields.map((f) => f.field_id)),
    ...HUMAN_CAPTURE_SPECS.flatMap((s) => s.fields.map((f) => f.field_id)),
  ];
  assert.equal(fields.length, 92);
  // grant_funder_name and brc_issuing_body need their discriminants; supply both.
  assert.doesNotThrow(() =>
    assertClaimsWritable(
      fields.map((field_id) => ({ field_id, source_id: 'CLIENT_DOC' })),
      { funder_is_body: true, issuing_body_is_organisation: true },
    ),
  );
});

test('C8b the thirteen tax fields are on the register by name — and none is a name or a tax reference', () => {
  assert.equal(TAX_FIELDS.size, 13);
  for (const field_id of TAX_FIELDS) {
    assert.doesNotThrow(() => assertClaimsWritable([{ field_id, source_id: 'CLIENT_DOC' }]), field_id);
    assert.doesNotMatch(field_id, /name|utr|tax_ref|nino|national_insurance|address/i, `${field_id} looks like a person's detail`);
  }
  // THE NEGATIVE CONTROL: a tax field the register does NOT list is still refused — the register is not bypassed.
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'taxret_taxpayer_name', source_id: 'CLIENT_DOC' }]),
    (e: unknown) => e instanceof NameExclusionError,
  );
});

test('C9 the two HUMAN_READ_ONLY types are the only ones in whole-document mode, and they say why', () => {
  const whole = CLIENT_DOC_RECEIPT_POLICY.filter((p) => p.mode === 'WHOLE_DOCUMENT_PENDING_HUMAN_READ');
  assert.deepEqual(whole.map((p) => p.doc_type).sort(), [...HUMAN_READ_ONLY_TYPES].sort());
  for (const p of whole) {
    assert.match(p.why, /HONEST WEAKNESS|same honest weakness/i, 'the weaker mode must be named as weaker in the policy itself');
  }
});

/* ================================================================== *
 * C10-C14 — THE TAX RETURN AND THE TAX COMPUTATION (Phase 151b)
 *
 * Word question 223. The data protection officer, 24 September 2026: clients
 * may upload both; until the officer says what must be removed, keep the
 * figures and the company details and remove individuals' names, addresses
 * and tax references. Every fixture below is INVENTED — the names, the
 * numbers and the references. QQ is the prefix HMRC never issues.
 * ================================================================== */

/** A company's corporation tax return, CT600-shaped. */
const CT600_PAGES = [
  { page: 1, lines: [
    'COMPANY INFORMATION',
    'Company name Brightwater Invented Care Limited',
    'Company registration number 09876543',
    'Company tax reference 1234567890',
    'RETURN PERIOD',
    'From 1 April 2025 to 31 March 2026',
    'UTR:',
    'Reference 9999999999, not labelled as the company’s own',
  ] },
  { page: 2, lines: [
    'PROFITS BEFORE OTHER DEDUCTIONS AND RELIEFS',
    'Trading profits 412,300',
    'CAPITAL ALLOWANCES AND BALANCING CHARGES',
    'Annual investment allowance 180,000',
    'Main pool writing-down allowance 21,400',
  ] },
  { page: 3, lines: [
    'DECLARATION',
    'I declare that the information I have given on this return is correct and complete.',
    'Name Jane Inventedperson   Status Director',
    'AGENT DETAILS',
    'Invented & Co, Chartered Accountants, contact Peter Madeupname, 7 Fictional Street',
  ] },
];

/** A sole trader's self assessment return: the taxpayer IS a person. */
const SOLE_TRADER_PAGES = [
  { page: 1, lines: [
    'YOUR PERSONAL DETAILS',
    'Name Samuel Inventedname',
    'Address 12 Madeup Road, Nowhereton, ZZ1 1ZZ',
    'National Insurance number QQ 12 34 56 C',
    'Unique Taxpayer Reference 5555566666',
    'BUSINESS DETAILS',
    'Business name Samuel Inventedname Dental Practice',
    'Business address 3 Fictional Parade, ZZ2 2ZZ',
  ] },
  { page: 2, lines: [
    'CAPITAL ALLOWANCES',
    'Annual investment allowance 64,000',
    'Special rate pool writing-down allowance 3,100',
    'CALCULATING YOUR TAXABLE PROFIT OR LOSS',
    'Net business profit for tax purposes 88,200 for the year to 5 April 2026',
  ] },
  { page: 3, lines: [
    'SIGNATURE AND DATE',
    'Signed S Inventedname, 30 January 2027',
    'DECLARATION',
    'I declare that the information I have given is correct and complete.',
  ] },
];

/** An accountant's tax computation, with a person named INSIDE a kept section. */
const COMPUTATION_PAGES = [
  { page: 1, lines: [
    'TAX COMPUTATION FOR THE YEAR ENDED 31 MARCH 2026',
    'Adjusted trading profit 412,300',
    'PREPARED BY INVENTED ACCOUNTANTS LLP',
    'Reviewed by Priya Madeupname ACA',
  ] },
  { page: 2, lines: [
    'MAIN POOL',
    'Balance brought forward 96,000; additions 40,000; carried forward 114,080',
    'SPECIAL RATE POOL',
    'Balance brought forward 30,000; carried forward 28,200',
    'SINGLE ASSET POOL',
    'Director’s car (Mr Inventedname) 18,000 — private use 25 per cent',
  ] },
];

const PEOPLE = /Inventedperson|Madeupname|Inventedname|Madeup Road|Fictional|QQ 12 34 56 C|5555566666|9999999999/;
const retainedText = (r: { retained: Segment[] }) => JSON.stringify(r.retained.map((x) => [x.heading, x.text]));

test('C10 the two tax types are SPEC_DERIVED, keep exactly their spec\'s three segments, and keep none of the segments about people', () => {
  for (const t of ['TAX_RETURN', 'TAX_COMPUTATION'] as const) {
    const p = receiptPolicyFor(t);
    assert.equal(p.mode, 'SPEC_DERIVED');
    assert.deepEqual([...p.retained_segments].sort(), ['CAPITAL_ALLOWANCES_COMPUTATION', 'TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION']);
    for (const k of ['TAXPAYER_PERSONAL_DETAILS', 'DECLARATION', 'SIGNATORIES', 'AGENT_DETAILS', 'UNCLASSIFIED'] as const) {
      assert.equal(p.retained_segments.includes(k), false, `${t} keeps ${k}`);
      assert.ok(NEVER_TO_MODEL.includes(k), `${k} is not on NEVER_TO_MODEL`);
    }
  }
});

test('C11 A COMPANY\'S RETURN: the company details, the profits and the allowances are kept; the declaration, the agent and an unlabelled reference go', () => {
  const r = applyReceiptPolicy('CT-1', 'TAX_RETURN', segment(CT600_PAGES));
  assert.deepEqual(r.retained.map((x) => x.kind),
    ['TAX_ENTITY_DETAILS', 'TAX_ENTITY_DETAILS', 'TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION']);
  assert.deepEqual(r.removed.map((x) => [x.kind, x.reason]), [
    ['UNCLASSIFIED', 'UNCLASSIFIED_FAILS_CLOSED'],
    ['DECLARATION', 'NO_FIELD_NEEDS_IT'],
    ['AGENT_DETAILS', 'NO_FIELD_NEEDS_IT'],
  ]);
  const kept = retainedText(r);
  // The company's own details, its own tax reference included — the legal-form test (C14).
  assert.match(kept, /Brightwater Invented Care Limited/);
  assert.match(kept, /09876543/);
  assert.match(kept, /Company tax reference 1234567890/);
  assert.match(kept, /412,300/);
  assert.match(kept, /180,000/);
  // Nobody: not the director who signed, not the agent, not the reference that could be anyone's.
  assert.doesNotMatch(kept, PEOPLE);
  assert.equal(r.removed.some((x) => 'text' in x), false);
});

test('C12 A SOLE TRADER\'S RETURN — THE HARD CASE: the figures survive; the name, the business name, both addresses, the National Insurance number and the tax reference do not', () => {
  const r = applyReceiptPolicy('SA-1', 'TAX_RETURN', segment(SOLE_TRADER_PAGES));
  assert.deepEqual(r.retained.map((x) => x.kind), ['CAPITAL_ALLOWANCES_COMPUTATION', 'TAX_PROFIT_COMPUTATION']);
  assert.deepEqual(r.removed.map((x) => x.kind),
    ['TAXPAYER_PERSONAL_DETAILS', 'TAXPAYER_PERSONAL_DETAILS', 'SIGNATORIES', 'DECLARATION']);
  const kept = retainedText(r);
  assert.match(kept, /64,000/);
  assert.match(kept, /88,200/);
  assert.doesNotMatch(kept, PEOPLE);
  assert.doesNotMatch(kept, /Samuel|Dental Practice|ZZ1|ZZ2/);
  // And the policy says so in plain terms, where a person triaging it will read it.
  assert.match(receiptPolicyFor('TAX_RETURN').why, /SOLE TRADER/);
  assert.match(receiptPolicyFor('TAX_RETURN').why, /What survives is the period, the profit and the allowances/);
});

test('C13 A TAX COMPUTATION: the preparer goes and the pools stay — and a name written INSIDE a kept pool is kept, which the policy admits and the model boundary refuses', () => {
  const r = applyReceiptPolicy('TC-1', 'TAX_COMPUTATION', segment(COMPUTATION_PAGES));
  assert.deepEqual(r.retained.map((x) => x.kind), ['TAX_PROFIT_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION',
    'CAPITAL_ALLOWANCES_COMPUTATION', 'CAPITAL_ALLOWANCES_COMPUTATION']);
  assert.deepEqual(r.removed.map((x) => [x.kind, x.reason]), [['SIGNATORIES', 'NO_FIELD_NEEDS_IT']]);
  const kept = retainedText(r);
  assert.match(kept, /carried forward 114,080/);
  assert.doesNotMatch(kept, /Priya|Invented Accountants/);
  // THE HONEST WEAKNESS, asserted rather than hidden: the director's car line is in a kept section.
  assert.match(kept, /Mr Inventedname/);
  assert.match(receiptPolicyFor('TAX_COMPUTATION').why, /HONEST WEAKNESS/);
  // ...and the model boundary drops that one section, and only that one.
  const s = sanitise('TC-1', 'TAX_COMPUTATION', r.retained);
  assert.equal(JSON.stringify(s.payload).includes('Inventedname'), false);
  assert.deepEqual(s.dropped.map((d) => d.heading), ['SINGLE ASSET POOL']);
  assert.equal(s.payload.segments.length, 3);
});

test('C14 THE COMPANY\'S OWN TAX REFERENCE IS A COMPANY DETAIL: the legal-form test says a company is not a person and a sole trader is', () => {
  // The decision rests on the register's test, applied unchanged (section 2).
  assert.equal(classifyPartyReference({ form: 'BODY_CORPORATE', individuals_named_on_document: 0 }).firm_name_is_personal_data, false);
  assert.equal(classifyPartyReference({ form: 'LLP', individuals_named_on_document: 0 }).firm_name_is_personal_data, false);
  assert.equal(classifyPartyReference({ form: 'SOLE_TRADER', individuals_named_on_document: 0 }).firm_name_is_personal_data, true);
  assert.equal(classifyPartyReference({ form: 'UNKNOWN', individuals_named_on_document: 0 }).firm_name_is_personal_data, true);
  // Only a heading that NAMES THE COMPANY keeps a reference; one that cannot say whose it is goes.
  assert.equal(classifyHeading('Company tax reference:'), 'TAX_ENTITY_DETAILS');
  assert.equal(classifyHeading('Tax reference:'), 'UNCLASSIFIED');
  assert.equal(classifyHeading('UTR:'), 'UNCLASSIFIED');
  assert.equal(classifyHeading('National Insurance number:'), 'TAXPAYER_PERSONAL_DETAILS');
  // And no field extracts a tax reference of anybody's.
  for (const t of ['TAX_RETURN', 'TAX_COMPUTATION'] as const) {
    for (const f of DOC_SPECS.find((x) => x.doc_type === t)!.fields) {
      assert.doesNotMatch(f.field_id, /utr|tax_ref|reference|insurance|nino|name/, `${f.field_id} extracts an identifier`);
    }
  }
});

/* ================================================================== *
 * A14-D4 — the planning fix. Separable and urgent.
 * ================================================================== */

test('D4a REPRESENTATIONS, CONSULTEE_RESPONSES and CORRESPONDENCE are removed from an uploaded planning document ON RECEIPT', () => {
  const r = applyReceiptPolicy('PLAN-1', 'PLANNING', [
    seg('DECISION', 'DECISION NOTICE'),
    seg('REPRESENTATIONS', 'REPRESENTATIONS RECEIVED', 4),
    seg('CONSULTEE_RESPONSES', 'CONSULTEE RESPONSES', 5),
    seg('CORRESPONDENCE', 'CORRESPONDENCE', 6),
    seg('CONDITIONS', 'CONDITIONS', 2),
  ]);
  assert.deepEqual(r.retained.map((s) => s.kind), ['DECISION', 'CONDITIONS']);
  assert.deepEqual(
    r.removed.map((s) => s.reason),
    ['NO_LAWFUL_BASIS', 'NO_LAWFUL_BASIS', 'NO_LAWFUL_BASIS'],
    'these three are removed for absence of a lawful basis, NOT merely because no field needs them',
  );
});

test('D4b the three no-basis kinds are removed from EVERY document type, including the human-read ones', () => {
  // The gap this closes: WHOLE_DOCUMENT_PENDING_HUMAN_READ retains everything
  // else, so if the absolute rule were applied inside the mode branch instead
  // of before it, CPSE_REPLIES and SALE_CONTRACT would keep Class D content.
  for (const t of ALL_TYPES) {
    const r = applyReceiptPolicy('X', t, NEVER_RETAINED_ON_RECEIPT.map((k) => seg(k, `H-${k}`)));
    assert.deepEqual(r.retained, [], `${t} retained a no-lawful-basis segment`);
    assert.equal(r.removed.length, 3);
    assert.ok(r.removed.every((x) => x.reason === 'NO_LAWFUL_BASIS'));
  }
});

test('D4c the removal is on receipt, not merely from the model payload — the whole point of the phase', () => {
  // sanitise() drops these OUT OF A PAYLOAD built from a document still held.
  // applyReceiptPolicy drops them OUT OF THE DOCUMENT. Assert the difference
  // is real: what comes back as `retained` is what gets written, and the
  // representations are not in it.
  const r = applyReceiptPolicy('PLAN-2', 'PLANNING', [seg('REPRESENTATIONS', 'OBJECTIONS', 3, 'Mrs A Neighbour of 12 The Street objects')]);
  assert.equal(r.retained.length, 0);
  assert.equal(JSON.stringify(r.retained).includes('Neighbour'), false);
  assert.equal(JSON.stringify(r.removed).includes('Neighbour'), false, 'not even the removal log may carry it');
});

test('D4d a planning objector reaching the transparency record is refused — there is no basis for a notice to describe', () => {
  const rec = openTransparencyRecord('PLAN-3', 'PLANNING', '2026-09-01T09:00:00.000Z');
  rec.people.push({
    person_ref: 'PLAN-3/objector-1',
    role: 'PLANNING_OBJECTOR_OR_CONSULTEE',
    route_group: 'R_B',
    address_on_document: false,
    exemption: { article: '14(5)(e)', reason: 'no address', recorded_by: 'S', recorded_at: '2026-09-02T09:00:00.000Z' },
  });
  assert.throws(
    () => assertTransparencyRecordComplete(rec),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_TRANSPARENCY_NO_BASIS_ROLE',
  );
});

/* ================================================================== *
 * W — assertNoUnauthorisedName wired into the upload path
 * ================================================================== */

test('W1 CLIENT_DOC claims now reach the register\'s assertion at all — before Phase 41 the call threw E_UNKNOWN_SOURCE', () => {
  assert.doesNotThrow(() => assertClaimsWritable([{ field_id: 'lease_term_years', source_id: 'CLIENT_DOC' }]));
});

test('W2 an unauthorised name field on the upload path FAILS CLOSED, exactly as it does for a register', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'witness_name', source_id: 'CLIENT_DOC' }]),
    (e: unknown) => e instanceof NameExclusionError && e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

test('W3 an UNCATALOGUED field on the upload path is refused as unclassified, not assumed safe', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'lease_something_nobody_catalogued', source_id: 'CLIENT_DOC' }]),
    (e: unknown) => e instanceof NameExclusionError && e.code === 'E_UNCLASSIFIED_FIELD',
  );
});

test('W4 an uncatalogued SOURCE still fails closed through the same path', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'lease_term_years', source_id: 'CLIENT_SCAN' }]),
    (e: unknown) => e instanceof NameExclusionError && e.code === 'E_UNKNOWN_SOURCE',
  );
});

test('W5 the Class D field shapes are refused on the upload path — LIA-C10 governed the API, this governs the upload', () => {
  for (const field_id of ['objector_name', 'neighbour_address', 'consultee_name', 'comment_text', 'representation_body']) {
    assert.throws(
      () => assertClaimsWritable([{ field_id, source_id: 'CLIENT_DOC' }]),
      (e: unknown) => e instanceof NameExclusionError,
      `${field_id} was not refused`,
    );
  }
});

test('W6 grant_funder_name is refused without the funder_is_body discriminant — the spec note is now a control', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'grant_funder_name', source_id: 'CLIENT_DOC' }]),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_CONDITIONAL_FIELD_UNDISCRIMINATED',
  );
  assert.doesNotThrow(() =>
    assertClaimsWritable([{ field_id: 'grant_funder_name', source_id: 'CLIENT_DOC' }], { funder_is_body: true }));
});

test('W7 brc_issuing_body is refused without its discriminant — an approved inspector may be an individual [VERIFY]', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'brc_issuing_body', source_id: 'CLIENT_DOC' }], { funder_is_body: true }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_CONDITIONAL_FIELD_UNDISCRIMINATED',
  );
});

test('W8 omitting a discriminant fails CLOSED, not open — the same shape as the register\'s T6c', () => {
  assert.throws(
    () => assertClaimsWritable([{ field_id: 'grant_funder_name', source_id: 'CLIENT_DOC' }], { funder_is_body: undefined }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_CONDITIONAL_FIELD_UNDISCRIMINATED',
  );
});

/* ================================================================== *
 * P — the legal-form test, and the three cases the register never needed
 * ================================================================== */

test('P10 MIRROR OF T10 — a company whose name reads as a person\'s is NOT personal data', () => {
  const c = classifyPartyReference({ form: 'BODY_CORPORATE', individuals_named_on_document: 0 });
  assert.equal(c.firm_name_is_personal_data, false);
  assert.equal(c.data_subject_count, 0);
});

test('P10b …and the counterpart holds unchanged: a sole trader\'s trading name IS a person\'s name', () => {
  const c = classifyPartyReference({ form: 'SOLE_TRADER', individuals_named_on_document: 0 });
  assert.equal(c.firm_name_is_personal_data, true);
  assert.equal(c.data_subject_count, 1);
});

test('P11 NEW CASE 1 — an English partnership is not a legal person: three named partners are three data subjects', () => {
  // Partnership Act 1890 s.4(2) confers separate legal personality on a firm
  // IN SCOTLAND ONLY. Read in the current revised text on legislation.gov.uk,
  // 29 August 2026.
  const c = classifyPartyReference({ form: 'PARTNERSHIP_ENGLAND_WALES_NI', individuals_named_on_document: 3 });
  assert.equal(c.firm_name_is_personal_data, true);
  assert.equal(c.data_subject_count, 3);
  assert.match(c.reason, /s\.4\(2\).*SCOTLAND ONLY/);
});

test('P11b …and a Scottish firm is the opposite: s.4(2) makes the firm a legal person', () => {
  const c = classifyPartyReference({ form: 'PARTNERSHIP_SCOTLAND', individuals_named_on_document: 0 });
  assert.equal(c.firm_name_is_personal_data, false);
  assert.equal(c.data_subject_count, 0);
});

test('P11c …an LLP is a body corporate and s.4 does not touch it', () => {
  const c = classifyPartyReference({ form: 'LLP', individuals_named_on_document: 0 });
  assert.equal(c.firm_name_is_personal_data, false);
});

test('P11d an English firm named with fewer individuals than it can have still counts at least two', () => {
  const c = classifyPartyReference({ form: 'PARTNERSHIP_ENGLAND_WALES_NI', individuals_named_on_document: 0 });
  assert.equal(c.data_subject_count, 2, 'rounding down to zero would understate the population');
});

test('P12 NEW CASE 2 — a person signing "for and on behalf of" a company is still a natural person', () => {
  assert.ok(roleIsAlwaysNaturalPerson('INDIVIDUAL_SIGNATORY'));
  // And the entity they sign for is unaffected: the company is still not a
  // data subject. Both propositions are true at once, which is the point.
  const company = classifyPartyReference({ form: 'BODY_CORPORATE', individuals_named_on_document: 1 });
  assert.equal(company.firm_name_is_personal_data, false);
  assert.equal(company.data_subject_count, 1, 'the signatory is the one data subject on a corporate party');
});

test('P13 NEW CASE 3 — an attesting witness is a natural person, always. A company cannot witness a signature', () => {
  assert.ok(roleIsAlwaysNaturalPerson('ATTESTING_WITNESS'));
  assert.deepEqual([...ALWAYS_NATURAL_PERSON_ROLES].sort(),
    ['ATTESTING_WITNESS', 'INDIVIDUAL_SIGNATORY', 'PROFESSIONAL_CERTIFIER']);
});

test('P14 a rule about "party names" reaches none of the three — which is why they are a separate predicate', () => {
  for (const role of ALWAYS_NATURAL_PERSON_ROLES) {
    assert.notEqual(role, 'TRANSACTION_PARTY');
  }
});

test('P15 an unestablished legal form is treated as a natural person — fail closed', () => {
  const c = classifyPartyReference({ form: 'UNKNOWN', individuals_named_on_document: 0 });
  assert.equal(c.firm_name_is_personal_data, true);
  assert.equal(c.data_subject_count, 1);
});

test('P16 every triage role listed against a document type is a role the module knows about', () => {
  for (const p of CLIENT_DOC_RECEIPT_POLICY) {
    assert.ok(p.roles_to_triage.length > 0, `${p.doc_type} lists nobody to triage`);
  }
  const lease = receiptPolicyFor('LEASE');
  assert.ok(lease.roles_to_triage.some((r) => r.role === 'ATTESTING_WITNESS' && r.frequency === 'always'));
  assert.ok(lease.roles_to_triage.some((r) => r.role === 'GUARANTOR'));
});

/* ================================================================== *
 * H — the human-capture rule (condition A14-D3)
 * ================================================================== */

test('H1 a verbatim field with no attestation is REFUSED — not accepted and flagged', () => {
  assert.throws(
    () => assertHumanCaptureClean({
      field_id: 'cpse_ca_reply_text',
      value: 'Not so far as the Seller is aware.',
      names_replaced_with_role_tokens: false,
      substitutions: 0,
    }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_CAPTURE_NOT_ATTESTED',
  );
});

test('H2 the attested, role-tokenised version passes AND the evidential wording survives intact', () => {
  const value = 'Not so far as [SELLER] is aware, save as disclosed to [OCCUPIER].';
  assert.doesNotThrow(() => assertHumanCaptureClean({
    field_id: 'cpse_ca_reply_text', value,
    names_replaced_with_role_tokens: true, substitutions: 2,
  }));
  assert.match(value, /Not so far as .* is aware/, 'the qualification the DPIA §6 relies on is preserved');
});

test('H3 a name that the reviewer missed is caught by the backstop', () => {
  assert.throws(
    () => assertHumanCaptureClean({
      field_id: 'cpse_ca_reply_text',
      value: 'The works were carried out by Mr Alan Webb in 2014.',
      names_replaced_with_role_tokens: true, substitutions: 0,
    }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_CAPTURE_NAME_PRESENT',
  );
});

test('H4 THE BACKSTOP IS A BACKSTOP — a bare name in running prose passes it, exactly as pipeline P26 records', () => {
  // Stated as a test rather than as a comment, because a control whose limits
  // are only described in prose gets remembered as having no limits.
  assert.doesNotThrow(() => assertHumanCaptureClean({
    field_id: 'cpse_ca_reply_text',
    value: 'The boundary was moved when Alan Webb owned the adjoining land.',
    names_replaced_with_role_tokens: true, substitutions: 0,
  }), 'this SHOULD pass — the attestation is the control, the pattern is only the net');
});

test('H5 a non-verbatim field needs no attestation, and a non-string value is not pattern-checked', () => {
  assert.doesNotThrow(() => assertHumanCaptureClean({
    field_id: 'contract_consideration_pence', value: 125_000_00,
    names_replaced_with_role_tokens: false, substitutions: 0,
  }));
});

test('H6 the verbatim list covers the human path AND the model path', () => {
  // grant_purpose_description is captured verbatim on the MODEL path, so the
  // rule cannot be scoped to HUMAN_READ_ONLY types only.
  assert.ok(VERBATIM_FIELDS.includes('grant_purpose_description'));
  assert.ok(VERBATIM_FIELDS.includes('cpse_ca_reply_text'));
  assert.ok(VERBATIM_FIELDS.includes('contract_schedule_index'));
});

/* ================================================================== *
 * T — the per-upload transparency record (A14-D1, A14-D2, A14-D5)
 * ================================================================== */

const witness = (over: Partial<IdentifiedPerson> = {}): IdentifiedPerson => ({
  person_ref: 'LEASE-9/witness-1',
  role: 'ATTESTING_WITNESS',
  route_group: 'R_A',
  address_on_document: true,
  ...over,
});

test('T1 route group follows the document: an address on its face means R_A', () => {
  assert.equal(routeGroupFor(true), 'R_A');
  assert.equal(routeGroupFor(false), 'R_B');
});

test('T2 an R_A person with no notice is REFUSED — the exemption is not available to them', () => {
  const rec = openTransparencyRecord('LEASE-9', 'LEASE', '2026-09-01T09:00:00.000Z');
  rec.people.push(witness());
  assert.throws(
    () => assertTransparencyRecordComplete(rec),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_TRANSPARENCY_PERSON_UNRESOLVED',
  );
});

test('T3 an R_A person cannot be resolved by claiming the exemption instead of writing to them', () => {
  const rec = openTransparencyRecord('LEASE-9', 'LEASE', '2026-09-01T09:00:00.000Z');
  rec.people.push(witness({
    exemption: { article: '14(5)(e)', reason: 'tracing would be burdensome', recorded_by: 'S', recorded_at: '2026-09-02T09:00:00.000Z' },
  }));
  assert.throws(
    () => assertTransparencyRecordComplete(rec),
    (e: unknown) => e instanceof ClientDocIngestionError && /route group R_A/.test(e.message),
  );
});

test('T4 an R_A person with a recorded notice and route passes', () => {
  const rec = openTransparencyRecord('LEASE-9', 'LEASE', '2026-09-01T09:00:00.000Z');
  rec.people.push(witness({ notice: { template: 'BTC-T7', route: 'DIRECT_POST', sent_at: '2026-09-10T09:00:00.000Z' } }));
  assert.doesNotThrow(() => assertTransparencyRecordComplete(rec));
});

test('T5 an R_B person with NO recorded reason is refused — the chapeau makes it a per-person assertion', () => {
  const rec = openTransparencyRecord('CPSE-4', 'CPSE_REPLIES', '2026-09-01T09:00:00.000Z');
  rec.people.push({
    person_ref: 'CPSE-4/prose-person-1', role: 'PERSON_NAMED_IN_PROSE',
    route_group: 'R_B', address_on_document: false,
  });
  assert.throws(
    () => assertTransparencyRecordComplete(rec),
    (e: unknown) => e instanceof ClientDocIngestionError && /TO THE EXTENT THAT/.test(e.message),
  );
});

test('T5b an empty reason is not a reason', () => {
  const rec = openTransparencyRecord('CPSE-4', 'CPSE_REPLIES', '2026-09-01T09:00:00.000Z');
  rec.people.push({
    person_ref: 'CPSE-4/prose-person-1', role: 'PERSON_NAMED_IN_PROSE',
    route_group: 'R_B', address_on_document: false,
    exemption: { article: '14(5)(e)', reason: '   ', recorded_by: 'S', recorded_at: '2026-09-02T09:00:00.000Z' },
  });
  assert.throws(() => assertTransparencyRecordComplete(rec), ClientDocIngestionError);
});

test('T6 an R_B person with a per-person, per-document reason passes', () => {
  const rec = openTransparencyRecord('CPSE-4', 'CPSE_REPLIES', '2026-09-01T09:00:00.000Z');
  rec.people.push({
    person_ref: 'CPSE-4/prose-person-1', role: 'PERSON_NAMED_IN_PROSE',
    route_group: 'R_B', address_on_document: false,
    exemption: {
      article: '14(5)(e)',
      reason: 'named only in reply 15 to a 2011 enquiry set; no address anywhere in the document; the firm that gave the replies has since merged',
      recorded_by: 'Sadique Maskeen (DPO)', recorded_at: '2026-09-02T09:00:00.000Z',
    },
  });
  assert.doesNotThrow(() => assertTransparencyRecordComplete(rec));
});

// Name restated 1 Sep 2026 (Phase 60). The assertion is unchanged: it was and is
// that a name-shaped person_ref is refused. What changed is why — the name index
// is now built deliberately, and person_ref stays opaque because it is the join.
test('T7 person_ref stays opaque — it is the join, and a name here would propagate into the claim record', () => {
  const rec = openTransparencyRecord('LEASE-9', 'LEASE', '2026-09-01T09:00:00.000Z');
  rec.people.push(witness({
    person_ref: 'John Smith',
    notice: { template: 'BTC-T7', route: 'DIRECT_POST', sent_at: '2026-09-10T09:00:00.000Z' },
  }));
  assert.throws(
    () => assertTransparencyRecordComplete(rec),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_TRANSPARENCY_REF_IS_NAME',
  );
});

test('T8 a record with nobody in it passes — a lease between two companies witnessed by nobody is possible', () => {
  const rec = openTransparencyRecord('LEASE-10', 'LEASE', '2026-09-01T09:00:00.000Z');
  assert.doesNotThrow(() => assertTransparencyRecordComplete(rec));
});

/* ================================================================== *
 * R — raw-file retention and the deletion mechanism
 * ================================================================== */

const rawFile = (over: Partial<RawFileRecord> = {}): RawFileRecord => ({
  doc_id: 'LEASE-9', doc_type: 'LEASE', received_at: '2026-09-01T09:00:00.000Z', ...over,
});

test('R1 the fail-closed default is the SHORTEST clock — for a retention rule, fail closed means delete sooner', () => {
  assert.equal(FAIL_CLOSED_SETTINGS.raw_file_retention, 'DELETE_ON_EXTRACTION_COMPLETE');
  assert.equal(FAIL_CLOSED_SETTINGS.grace_days_after_extraction, 0);
  assert.equal(FAIL_CLOSED_SETTINGS.accepts_loss_of_source_reread, false,
    'Q34\'s cost line is recorded as unaccepted until somebody accepts it');
});

test('R2 deletion falls due when extraction completes, under the default rule', () => {
  const due = deletionDueAt(rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }), FAIL_CLOSED_SETTINGS);
  assert.equal(due, '2026-09-05T09:00:00.000Z');
});

test('R3 a grace period is honoured where one is configured', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, grace_days_after_extraction: 7 };
  const due = deletionDueAt(rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }), s);
  assert.equal(due, '2026-09-12T09:00:00.000Z');
});

test('R4 A FILE WITH NO COMPUTABLE DELETION DATE IS SURFACED, NOT IGNORED — this is how "forever" gets built', () => {
  const sweep = sweepForDeletion([rawFile()], '2026-10-01T09:00:00.000Z', FAIL_CLOSED_SETTINGS);
  assert.equal(sweep.undeletable.length, 1);
  assert.throws(
    () => assertNoOverdueUndeleted([rawFile()], '2026-10-01T09:00:00.000Z', FAIL_CLOSED_SETTINGS),
    (e: unknown) => e instanceof ClientDocIngestionError && /NO COMPUTABLE DELETION/.test(e.message),
  );
});

test('R5 an overdue, still-held raw file BREAKS SOMETHING — the only version of a retention rule that means anything', () => {
  const recs = [rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' })];
  assert.throws(
    () => assertNoOverdueUndeleted(recs, '2026-10-01T09:00:00.000Z', FAIL_CLOSED_SETTINGS),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_RETENTION_OVERDUE',
  );
});

test('R6 once deleted with evidence, the same file is clean', () => {
  const deleted = recordDeletion(
    rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }),
    '2026-09-05T10:00:00.000Z',
    { deleted_by: 'ingestion-worker', method: 'S3 DeleteObject + version purge', redacted_copy_retained: false },
  );
  assert.doesNotThrow(() => assertNoOverdueUndeleted([deleted], '2026-10-01T09:00:00.000Z', FAIL_CLOSED_SETTINGS));
});

test('R7 a deletion with no evidence is refused — it cannot be told apart from no deletion at all', () => {
  assert.throws(
    () => recordDeletion(rawFile(), '2026-09-05T10:00:00.000Z', { deleted_by: '', method: '', redacted_copy_retained: false }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_DELETION_UNEVIDENCED',
  );
});

test('R8 the mechanism works whichever way Q34 lands — the long clock is supported and is still enforced', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  const kept = rawFile({ defence_period_ends_at: '2032-01-31T00:00:00.000Z' });
  assert.doesNotThrow(() => assertNoOverdueUndeleted([kept], '2026-10-01T09:00:00.000Z', s));
  // …and it still bites once the long clock expires. A longer rule is not an absent rule.
  assert.throws(() => assertNoOverdueUndeleted([kept], '2032-02-01T00:00:00.000Z', s), ClientDocIngestionError);
});

test('R9 under the long clock, a file whose defence-pack date was never supplied is STILL surfaced', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  assert.throws(
    () => assertNoOverdueUndeleted([rawFile()], '2026-10-01T09:00:00.000Z', s),
    (e: unknown) => e instanceof ClientDocIngestionError && /NO COMPUTABLE DELETION/.test(e.message),
  );
});

/* ================================================================== *
 * S — the storage fact, recorded so it cannot be re-derived wrongly
 * ================================================================== */

test('S1 the storage position is recorded as established, and records what is NOT built', () => {
  assert.equal(STORAGE_POSITION.raw_file_retained_by_design, true);
  assert.equal(STORAGE_POSITION.upload_path_implemented, false);
  assert.equal(STORAGE_POSITION.deletion_mechanism_exists, false);
  assert.equal(STORAGE_POSITION.retention_period_decided, false);
});

/* ================================================================== *
 * B — THE INGESTION BOUNDARY (Phase 44, board item 12928214881)
 *
 * The defect these guard against is not a bug, it is a sentence: three
 * successive phases wrote down a guarantee stronger than the architecture
 * delivers. So several of these assert on the module's own prose, which is
 * unusual and is deliberate — the prose IS the deliverable a developer reads.
 * ================================================================== */

const qObj = (over: Partial<QuarantineObject> = {}): QuarantineObject => ({
  doc_id: 'PLAN-1',
  key: 'quarantine/PLAN-1.pdf',
  written_at: '2026-09-01T09:00:00.000Z',
  ...over,
});

test('B1 the boundary is recorded as a FAIL-CLOSED DEFAULT, not a decision — Q40 is unanswered', () => {
  assert.equal(INGESTION_BOUNDARY.model, 'QUARANTINE_PREFIX');
  assert.equal(INGESTION_BOUNDARY.is_a_decision, false,
    'if a human ever chooses this, that field is the thing to change');
  assert.match(INGESTION_BOUNDARY.decision_ref, /Q40/);
  assert.equal(INGESTION_BOUNDARY.implemented, false,
    'same standing as everything else in this module — specified, not built');
});

test('B2 the architecture of record and the model built against it DIFFER, and the module says which is which', () => {
  assert.equal(INGESTION_BOUNDARY.brief_says, 'DIRECT_TO_DURABLE');
  assert.notEqual(INGESTION_BOUNDARY.model, INGESTION_BOUNDARY.brief_says,
    'the whole finding is that the brief and the control disagree; hiding that is how it was missed');
  assert.match(INGESTION_BOUNDARY.brief_source, /Developer-Brief/);
});

test('B3 a pre-signed key outside the quarantine prefix is REFUSED — one string compare carries the model', () => {
  assert.throws(
    () => assertQuarantineKey('documents/PLAN-1.pdf'),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_UPLOAD_KEY_NOT_QUARANTINED',
  );
  assert.throws(() => assertQuarantineKey(''), ClientDocIngestionError);
  // The near-miss that would defeat it silently: a durable key that merely mentions quarantine.
  assert.throws(() => assertQuarantineKey('documents/quarantine/PLAN-1.pdf'), ClientDocIngestionError);
});

test('B4 a key under the quarantine prefix is accepted', () => {
  assert.doesNotThrow(() => assertQuarantineKey('quarantine/PLAN-1.pdf'));
});

test('B5 the discharge clock ALWAYS computes — it starts at the write, not at extraction', () => {
  // Contrast with deletionDueAt, which returns null when extraction never completed.
  // A quarantine object cannot become undeletable by something failing to happen.
  assert.equal(quarantineDischargeDueAt(qObj()), '2026-09-01T10:00:00.000Z');
  assert.equal(QUARANTINE_TTL_MINUTES, 60);
});

test('B6 an undischarged quarantine object past its TTL BREAKS SOMETHING — the quiet failure', () => {
  const sweep = sweepQuarantine([qObj()], '2026-09-01T11:00:00.000Z');
  assert.equal(sweep.overdue.length, 1);
  assert.equal(sweep.live.length, 0);
  assert.throws(
    () => assertQuarantineDischarged([qObj()], '2026-09-01T11:00:00.000Z'),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_QUARANTINE_UNDISCHARGED',
  );
  // Inside the TTL it is live, not overdue — the control is a bound, not a ban.
  assert.doesNotThrow(() => assertQuarantineDischarged([qObj()], '2026-09-01T09:30:00.000Z'));
});

test('B7 a discharged object with evidence is clean, however long ago it was written', () => {
  const discharged = recordQuarantineDischarge(
    qObj({ strip_completed_at: '2026-09-01T09:05:00.000Z', durable_written_at: '2026-09-01T09:06:00.000Z' }),
    '2026-09-01T09:07:00.000Z',
    { deleted_by: 'ingestion-worker', method: 'S3 DeleteObject + version purge' },
  );
  assert.doesNotThrow(() => assertQuarantineDischarged([discharged], '2027-01-01T00:00:00.000Z'));
});

test('B8 a discharge with no evidence is refused — same rule as section 7, same reason', () => {
  assert.throws(
    () => recordQuarantineDischarge(qObj(), '2026-09-01T09:07:00.000Z', { deleted_by: '', method: '' }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_DELETION_UNEVIDENCED',
  );
});

test('B9 promoting to the durable prefix BEFORE the strip is refused — the ordering IS the control', () => {
  const o = qObj({ strip_completed_at: '2026-09-01T09:05:00.000Z', durable_written_at: '2026-09-01T09:01:00.000Z' });
  assert.equal(sweepQuarantine([o], '2026-09-01T09:10:00.000Z').out_of_order.length, 1);
  assert.throws(
    () => assertQuarantineDischarged([o], '2026-09-01T09:10:00.000Z'),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_DURABLE_WRITE_BEFORE_STRIP',
  );
});

test('B10 promoting with NO strip recorded at all is refused too — absence is not permission', () => {
  const o = qObj({ durable_written_at: '2026-09-01T09:01:00.000Z' });
  assert.throws(
    () => assertQuarantineDischarged([o], '2026-09-01T09:10:00.000Z'),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_DURABLE_WRITE_BEFORE_STRIP',
  );
});

test('B11 the out-of-order refusal outranks the TTL one — a wrong-order promotion is the worse fact', () => {
  const o = qObj({ durable_written_at: '2026-09-01T09:01:00.000Z' });
  assert.throws(
    () => assertQuarantineDischarged([o], '2026-09-05T09:00:00.000Z'),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_DURABLE_WRITE_BEFORE_STRIP',
  );
});

test('B12 RECEIPT_CONTRACT states the quarantine write AND its deletion — one place, the real order', () => {
  const joined = RECEIPT_CONTRACT.join('\n');
  assert.match(joined, /quarantine/i);
  assert.match(joined, /assertQuarantineKey/);
  assert.match(joined, /recordQuarantineDischarge/);
  assert.match(joined, /REAL WRITE TO REAL STORAGE/,
    'the contract must not describe the quarantine write as though it were not a write');
  // The corrected step must not repeat the claim that the file itself is altered.
  const strip = RECEIPT_CONTRACT.find((s) => s.includes('applyReceiptPolicy'));
  assert.ok(strip && /EXTRACTED TEXT/.test(strip) && /does not alter/.test(strip));
});

test('B13 BOUNDARY_POSITION covers all three models and only ONE makes the Phase 41 sentence true', () => {
  assert.equal(BOUNDARY_POSITION.length, 3);
  const never = BOUNDARY_POSITION.filter((b) => b.unredacted_file_reaches_storage === 'never');
  assert.equal(never.length, 1);
  assert.equal(never[0].model, 'SERVER_MEDIATED_UPLOAD');
  // Both pre-signed models put the file in storage first. That is the finding.
  for (const m of ['DIRECT_TO_DURABLE', 'QUARANTINE_PREFIX']) {
    const row = BOUNDARY_POSITION.find((b) => b.model === m);
    assert.equal(row?.unredacted_file_reaches_storage, 'before the strip');
  }
  // …and the one Caprebate builds against is the only one of those two that bounds it.
  assert.match(BOUNDARY_POSITION.find((b) => b.model === 'QUARANTINE_PREFIX')!.bounded_by, /TTL/);
});

test('B14 condition A14-D4 is re-recorded as PARTLY MET, with both halves named', () => {
  assert.equal(CONDITION_D4_STATUS.verdict, 'PARTLY_MET');
  assert.match(CONDITION_D4_STATUS.met_for, /extracted text/);
  assert.match(CONDITION_D4_STATUS.not_met_for, /file/);
  assert.ok(CONDITION_D4_STATUS.what_would_make_it_met.length >= 2);
  assert.equal(CONDITION_D4_STATUS.constrains_q34, true);
});

test('B15 NO SURVIVING SENTENCE claims the strip removes content from the FILE or precedes the FIRST write', () => {
  // This is the regression that matters most: the defect was prose, three times
  // running, and prose has no type system. Read the module and refuse the two
  // exact overstatements — outside the passages that quote them to correct them.
  const src = readFileSync(new URL('./caprebate-client-doc-ingestion.ts', import.meta.url), 'utf8');

  // The module must be able to QUOTE the old wording in order to correct it,
  // and it does so in three places. Double quotation marks are the marker that
  // separates a quotation from an assertion — the module uses single quotes for
  // its own strings throughout — so mask every double-quoted span and test what
  // is left. The mask preserves newlines so line numbers still point somewhere.
  const unquoted = src.replace(/"(?:[^"\\]|\\.)*"/gs, (m) => m.replace(/[^\n]/g, '·'));
  assert.ok(unquoted.split('\n').length === src.split('\n').length, 'the mask must not move any line');

  const OVERSTATEMENTS = [
    /before anything is written to durable storage/i,
    /before the first write/i,
    /is never written anywhere/i,
    /out of the document/i,
  ];
  const offences = unquoted
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => OVERSTATEMENTS.some((re) => re.test(line)));

  assert.deepEqual(
    offences.map((o) => o.n), [],
    `overstated guarantee ASSERTED (not quoted) at line(s): ${offences.map((o) => `${o.n}: ${o.line.trim()}`).join(' | ')}`,
  );

  // …and prove the test is not passing because the strings are gone entirely:
  // each one must still appear somewhere, inside quotation marks, being corrected.
  for (const re of OVERSTATEMENTS) {
    assert.match(src, re, 'the correction should quote the old wording, not silently delete it');
  }
});

/* ================================================================== *
 * X — THE RETENTION OPTION WITH NO PRODUCER (Phase 44, item 12928215019)
 * ================================================================== */

test('X1 RETAIN_REDACTED_DELETE_ORIGINAL is refused at RUNTIME, not merely removed from the type', () => {
  // Settings arrive from configuration. A union type is not a runtime guard,
  // and the withdrawn string is exactly what a config file written last week
  // would carry.
  const s = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_REDACTED_DELETE_ORIGINAL' } as unknown as IngestionSettings;
  assert.throws(
    () => deletionDueAt(rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }), s),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_RETENTION_RULE_WITHDRAWN',
  );
  // It REFUSES rather than silently substituting the default: a silent
  // substitution would give the right clock by hiding the reason for it.
  assert.throws(() => assertRetentionRuleImplementable('RETAIN_REDACTED_DELETE_ORIGINAL'), ClientDocIngestionError);
  assert.doesNotThrow(() => assertRetentionRuleImplementable('DELETE_ON_EXTRACTION_COMPLETE'));
  assert.doesNotThrow(() => assertRetentionRuleImplementable('RETAIN_FOR_DEFENCE_PERIOD'));
});

test('X2 the withdrawal records why it went and what brings it back — not just that it went', () => {
  assert.equal(WITHDRAWN_RETENTION_RULES.length, 1);
  const w = WITHDRAWN_RETENTION_RULES[0];
  assert.equal(w.rule, 'RETAIN_REDACTED_DELETE_ORIGINAL');
  assert.equal(w.board_item, '12928215019');
  assert.match(w.reason, /nothing in the codebase can produce/i);
  assert.match(w.reinstate_when, /REDACTION_PRODUCER_CONTRACT/);
});

test('X3 the producer contract requires DESTRUCTION and covers the raster path — a black box is the classic leak', () => {
  const joined = REDACTION_PRODUCER_CONTRACT.join('\n');
  assert.match(joined, /DESTROYS/);
  assert.match(joined, /rectangle|selectable/i);
  assert.match(joined, /scan|raster|OCR/i,
    'most client uploads are scans; redacting only the text layer is the same failure inverted');
  assert.match(joined, /redacted_copy_retained from that assertion, never from a caller/);
});

test('X4 a deletion asserting a redacted copy survives is REFUSED — the flag cannot be true today', () => {
  assert.throws(
    () => recordDeletion(
      rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }),
      '2026-09-05T10:00:00.000Z',
      { deleted_by: 'ingestion-worker', method: 'S3 DeleteObject', redacted_copy_retained: true },
    ),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_REDACTED_COPY_UNPRODUCIBLE',
  );
});

test('X5 no_basis_content_in_original is DERIVED from the receipt, never asserted by a caller', () => {
  const planning = applyReceiptPolicy('PLAN-1', 'PLANNING', [
    seg('DECISION', 'Decision'),
    seg('REPRESENTATIONS', 'Representations received', 4),
  ]);
  const rec = rawFileRecordFromReceipt(planning, '2026-09-01T09:00:00.000Z');
  assert.equal(rec.no_basis_content_in_original, true);
  assert.equal(rec.doc_id, 'PLAN-1');

  const clean = applyReceiptPolicy('PLAN-2', 'PLANNING', [seg('DECISION', 'Decision')]);
  assert.equal(rawFileRecordFromReceipt(clean, '2026-09-01T09:00:00.000Z').no_basis_content_in_original, false);
});

test('X6 a document that lost NO_LAWFUL_BASIS content CANNOT use the defence-period clock — A14-D4 removes it', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  const rec = rawFile({
    doc_type: 'PLANNING',
    no_basis_content_in_original: true,
    extraction_completed_at: '2026-09-05T09:00:00.000Z',
    defence_period_ends_at: '2032-01-31T00:00:00.000Z',
  });
  // The long clock is not merely discouraged — it does not apply.
  assert.equal(deletionDueAt(rec, s), '2026-09-05T09:00:00.000Z');
  assert.throws(
    () => assertNoOverdueUndeleted([rec], '2026-10-01T09:00:00.000Z', s),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_RETENTION_OVERDUE',
  );
});

test('X7 the fallback is SOONER, which is what fail-closed means for a retention rule', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  const base = { extraction_completed_at: '2026-09-05T09:00:00.000Z', defence_period_ends_at: '2032-01-31T00:00:00.000Z' };
  const constrained = new Date(deletionDueAt(rawFile({ ...base, no_basis_content_in_original: true }), s)!).getTime();
  const unconstrained = new Date(deletionDueAt(rawFile(base), s)!).getTime();
  assert.ok(constrained < unconstrained, 'the constraint must delete sooner, never later');
});

test('X8 the constraint is NARROW — a document with no no-basis content keeps the long clock', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  const rec = rawFile({ no_basis_content_in_original: false, defence_period_ends_at: '2032-01-31T00:00:00.000Z' });
  assert.equal(deletionDueAt(rec, s), '2032-01-31T00:00:00.000Z');
  assert.doesNotThrow(() => assertNoOverdueUndeleted([rec], '2026-10-01T09:00:00.000Z', s));
});

test('X9 a constrained record whose extraction never completed is still SURFACED, not silently kept', () => {
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  const rec = rawFile({ no_basis_content_in_original: true, defence_period_ends_at: '2032-01-31T00:00:00.000Z' });
  assert.equal(deletionDueAt(rec, s), null);
  assert.throws(
    () => assertNoOverdueUndeleted([rec], '2026-10-01T09:00:00.000Z', s),
    (e: unknown) => e instanceof ClientDocIngestionError && /NO COMPUTABLE DELETION/.test(e.message),
  );
});

test('X10 exactly two retention rules remain selectable, and the default is still the shorter one', () => {
  const selectable: RawFileRetentionRule[] = ['DELETE_ON_EXTRACTION_COMPLETE', 'RETAIN_FOR_DEFENCE_PERIOD'];
  for (const r of selectable) assert.doesNotThrow(() => assertRetentionRuleImplementable(r));
  assert.equal(FAIL_CLOSED_SETTINGS.raw_file_retention, 'DELETE_ON_EXTRACTION_COMPLETE');
  assert.ok(!(selectable as string[]).includes(WITHDRAWN_RETENTION_RULES[0].rule));
});

/* ================================================================== *
 * Y — THE ANSWER, AND THE CLOCK IT NEEDS (Phase 65, item 12878920167)
 *
 * Q56 was answered Reading B on 2 September 2026: do not delete the client
 * document. These tests hold the three things that answer does NOT do on its
 * own — reinstate the withdrawn rule, produce a deletion date, or reach every
 * document.
 * ================================================================== */

test('Y1 the answer selects an implementable rule and does NOT reinstate the withdrawn one', () => {
  assert.equal(Q56_ANSWER.reading, 'B');
  // Phase 133i, 18 Sep 2026: Lakhbir answered it; he is not the controller.
  assert.doesNotMatch(Q56_ANSWER.answered_by, /controller|director|principal/i);
  assert.equal(Q56_ANSWER.selects_rule, 'RETAIN_FOR_DEFENCE_PERIOD');
  assert.equal(Q56_ANSWER.reinstates, null);
  // The rule it selects is one of the two that survived Phase 44...
  assert.doesNotThrow(() => assertRetentionRuleImplementable(Q56_ANSWER.selects_rule));
  // ...and the withdrawn one is still refused, at runtime, unchanged.
  assert.throws(
    () => assertRetentionRuleImplementable(WITHDRAWN_RETENTION_RULES[0].rule),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_RETENTION_RULE_WITHDRAWN',
  );
});

test('Y2 the answer ALONE gives no deletion date — keep-it with no clock is indefinite retention, surfaced', () => {
  // The failure mode a one-line configuration change would have shipped: the
  // rule is selected, nothing supplies defence_period_ends_at, RET-7 is not
  // approved, and the file has no computable date at all.
  const s: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: Q56_ANSWER.selects_rule };
  const rec = rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' });
  assert.equal(deletionDueAt(rec, s), null);
  assert.equal(sweepForDeletion([rec], '2026-10-01T09:00:00.000Z', s).undeletable.length, 1);
  assert.throws(
    () => assertNoOverdueUndeleted([rec], '2026-10-01T09:00:00.000Z', s),
    (e: unknown) => e instanceof ClientDocIngestionError && /NO COMPUTABLE DELETION/.test(e.message),
  );
});

test('Y3 RET-7 approved, both limbs known: six years from the LATER limb, not from whichever was supplied first', () => {
  const s: IngestionSettings = {
    ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true,
  };
  // Report delivered AFTER the accounting period ends — limb (b) governs.
  const later = rawFile({ claim_period_end: '2026-03-31T00:00:00.000Z', report_delivered_at: '2026-09-01T00:00:00.000Z' });
  assert.equal(deletionDueAt(later, s), '2032-09-01T00:00:00.000Z');
  // ...and the other way round, which is the ordinary case for a late claim.
  const earlier = rawFile({ claim_period_end: '2027-03-31T00:00:00.000Z', report_delivered_at: '2026-09-01T00:00:00.000Z' });
  assert.equal(deletionDueAt(earlier, s), '2033-03-31T00:00:00.000Z');
});

test('Y4 one limb is not half a rule — RET-7 refuses rather than computing from what it has', () => {
  assert.equal(ret7DueAt(rawFile({ claim_period_end: '2026-03-31T00:00:00.000Z' })), null);
  assert.equal(ret7DueAt(rawFile({ report_delivered_at: '2026-09-01T00:00:00.000Z' })), null);
  assert.equal(ret7DueAt(rawFile()), null);
});

test('Y5 DERIVED IS NOT APPROVED — an unapproved RET-7 computes nothing, however complete the record', () => {
  assert.equal(RET7.approved, false, 'RET-7 belongs to the DPO and the appointment is not in force');
  // Phase 133i, 18 Sep 2026: the approver is the officer, Sadique Maskeen.
  assert.match(RET7.approver, /^Sadique Maskeen, Data Protection Officer/);
  assert.equal(FAIL_CLOSED_SETTINGS.ret7_approved, false);
  const rec = rawFile({ claim_period_end: '2026-03-31T00:00:00.000Z', report_delivered_at: '2026-09-01T00:00:00.000Z' });
  const unapproved: IngestionSettings = { ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD' };
  // The arithmetic is available...
  assert.equal(ret7DueAt(rec), '2032-09-01T00:00:00.000Z');
  // ...and is deliberately not used, because nobody has signed it.
  assert.equal(deletionDueAt(rec, unapproved), null);
});

test('Y6 the answer does NOT reach every document — A14-D4 still deletes the no-basis class on the short clock', () => {
  // The stated exception. Reading B says keep it; condition A14-D4 says this one
  // cannot be kept, and A14-D4 wins because it is a lawful-basis condition.
  const s: IngestionSettings = {
    ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true,
  };
  const rec = rawFile({
    no_basis_content_in_original: true,
    extraction_completed_at: '2026-09-05T09:00:00.000Z',
    claim_period_end: '2026-03-31T00:00:00.000Z', report_delivered_at: '2026-09-01T00:00:00.000Z',
  });
  assert.equal(deletionDueAt(rec, s), '2026-09-05T09:00:00.000Z');
  assert.match(Q56_ANSWER.exception, /NO_LAWFUL_BASIS/);
  assert.match(CONDITION_D4_STATUS.q56_closes_first_route, /only/);
});

test('Y7 WORD ANSWER 173 — where two clocks are known the LATER governs: the file is kept until both periods have ended', () => {
  // Until 24 September 2026 this test held the opposite (the earlier date won).
  // Word answer 173: "use the later of the two keep-until dates".
  const s: IngestionSettings = {
    ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true,
  };
  const limbs = { claim_period_end: '2026-03-31T00:00:00.000Z', report_delivered_at: '2026-09-01T00:00:00.000Z' };
  // RET-7 says 2032-09-01. A defence pack that ends sooner does NOT cut the file short...
  assert.equal(
    deletionDueAt(rawFile({ ...limbs, defence_period_ends_at: '2030-01-31T00:00:00.000Z' }), s),
    '2032-09-01T00:00:00.000Z',
  );
  // ...and a defence pack running longer DOES keep the file past RET-7.
  assert.equal(
    deletionDueAt(rawFile({ ...limbs, defence_period_ends_at: '2040-01-31T00:00:00.000Z' }), s),
    '2040-01-31T00:00:00.000Z',
  );
});

test('Y8 RET-7 records its instruments AND what it excluded, so the DPO can put the exclusions back', () => {
  assert.equal(RET7.period_years, 6);
  assert.match(RET7.trigger, /later of/);
  assert.ok(RET7.instruments.some((i) => /Sch 18 para 46\(2\)/.test(i)));
  assert.ok(RET7.instruments.some((i) => /TMA 1970 s\.36\(1\)/.test(i)));
  // The six years rests entirely on these two being excluded. If they are not
  // excluded the answer is twenty years, so they are recorded, not implied.
  assert.ok(RET7.excluded.some((e) => /20-year/.test(e)));
  assert.ok(RET7.excluded.some((e) => /14B/.test(e)));
  assert.ok(RET7.excluded.every((e) => /legal hold/i.test(e)));
});

/* ------------------------------------------------------------------ *
 * Y9-Y12 — WORD ANSWER 173 (closed 24 September 2026), Phase 151b.
 * Both clocks known: the later, whichever order they come in. One known:
 * that one. Neither: no date, surfaced. And the A14-D4 fallback, which is
 * not two retention periods, is untouched.
 * ------------------------------------------------------------------ */

const LONG: IngestionSettings = {
  ...FAIL_CLOSED_SETTINGS, raw_file_retention: 'RETAIN_FOR_DEFENCE_PERIOD', ret7_approved: true,
};
/* Invented dates. RET-7 from these limbs is 2031-06-30 (six years from the later limb, the report). */
const Y_LIMBS = { claim_period_end: '2024-12-31T00:00:00.000Z', report_delivered_at: '2025-06-30T00:00:00.000Z' };

test('Y9 BOTH KNOWN, EACH ORDER — the later of the two keep-until dates, whether it is the defence pack\'s or RET-7\'s', () => {
  assert.equal(ret7DueAt(rawFile(Y_LIMBS)), '2031-06-30T00:00:00.000Z');
  // The defence pack ends first: RET-7 governs.
  assert.equal(deletionDueAt(rawFile({ ...Y_LIMBS, defence_period_ends_at: '2029-04-05T00:00:00.000Z' }), LONG),
    '2031-06-30T00:00:00.000Z');
  // RET-7 ends first: the defence pack governs.
  assert.equal(deletionDueAt(rawFile({ ...Y_LIMBS, defence_period_ends_at: '2033-11-15T00:00:00.000Z' }), LONG),
    '2033-11-15T00:00:00.000Z');
  // The same day: that day.
  assert.equal(deletionDueAt(rawFile({ ...Y_LIMBS, defence_period_ends_at: '2031-06-30T00:00:00.000Z' }), LONG),
    '2031-06-30T00:00:00.000Z');
  // And the file is not overdue on a day between the two dates.
  const between = rawFile({ ...Y_LIMBS, defence_period_ends_at: '2029-04-05T00:00:00.000Z' });
  assert.doesNotThrow(() => assertNoOverdueUndeleted([between], '2030-01-01T00:00:00.000Z', LONG),
    'a file still inside one of its two periods is not overdue');
});

test('Y10 ONE KNOWN — that one governs, and an unapproved RET-7 is not known, so it lengthens nothing (N4)', () => {
  // Only the defence pack's date.
  assert.equal(deletionDueAt(rawFile({ defence_period_ends_at: '2029-04-05T00:00:00.000Z' }), LONG), '2029-04-05T00:00:00.000Z');
  // Only RET-7 (one limb missing means RET-7 is not known either).
  assert.equal(deletionDueAt(rawFile(Y_LIMBS), LONG), '2031-06-30T00:00:00.000Z');
  assert.equal(deletionDueAt(rawFile({ claim_period_end: Y_LIMBS.claim_period_end, defence_period_ends_at: '2029-04-05T00:00:00.000Z' }), LONG),
    '2029-04-05T00:00:00.000Z');
  // RET-7 NOT APPROVED: its later date is not used. Not approved and not supplied behave alike.
  const unapproved: IngestionSettings = { ...LONG, ret7_approved: false };
  assert.equal(deletionDueAt(rawFile({ ...Y_LIMBS, defence_period_ends_at: '2029-04-05T00:00:00.000Z' }), unapproved),
    '2029-04-05T00:00:00.000Z');
  assert.equal(deletionDueAt(rawFile({ defence_period_ends_at: '2029-04-05T00:00:00.000Z' }), unapproved), '2029-04-05T00:00:00.000Z');
});

test('Y11 NEITHER KNOWN — no date at all, and the file is surfaced, never kept forever in silence', () => {
  const rec = rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' });
  assert.equal(deletionDueAt(rec, LONG), null);
  assert.equal(deletionDueAt(rawFile({ claim_period_end: Y_LIMBS.claim_period_end }), LONG), null);
  assert.equal(sweepForDeletion([rec], '2026-10-01T09:00:00.000Z', LONG).undeletable.length, 1);
  assert.throws(
    () => assertNoOverdueUndeleted([rec], '2026-10-01T09:00:00.000Z', LONG),
    (e: unknown) => e instanceof ClientDocIngestionError && /NO COMPUTABLE DELETION/.test(e.message),
  );
});

test('Y12 answer 173 does not reach the A14-D4 fallback — a file that lost no-basis content still goes on the extraction clock', () => {
  const rec = rawFile({
    ...Y_LIMBS, no_basis_content_in_original: true,
    extraction_completed_at: '2026-09-05T09:00:00.000Z', defence_period_ends_at: '2033-11-15T00:00:00.000Z',
  });
  assert.equal(deletionDueAt(rec, LONG), '2026-09-05T09:00:00.000Z');
  // And the default rule is untouched: the extraction clock, whatever else is known.
  assert.equal(deletionDueAt(rawFile({ ...Y_LIMBS, extraction_completed_at: '2026-09-05T09:00:00.000Z',
    defence_period_ends_at: '2033-11-15T00:00:00.000Z' }), FAIL_CLOSED_SETTINGS), '2026-09-05T09:00:00.000Z');
});

/* ================================================================== *
 * Z — THE HOST'S BACKUP CYCLE, A NAMED BLANK (Phase 132, 14 September 2026)
 *
 * Retention Procedure 4.1 point 4: a record leaves backups only when the cycle
 * expires, the cycle must be stated, and nothing deleted is restored without
 * the DPO's approval. The cycle is NOT SET. These tests hold that every
 * deletion says so, that nothing restores past the guard, and that RET-3 — six
 * years from deletion complete everywhere — has no date while it is unknown.
 * ================================================================== */

const DELETED = '2026-09-05T10:00:00.000Z';
const EVIDENCE = { deleted_by: 'ingestion-worker', method: 'S3 DeleteObject + version purge', redacted_copy_retained: false } as const;

test('Z1 EVERY DELETION CARRIES THE BACKUP CYCLE — and while it is NOT SET the evidence says backups are pending, with no cycle and no expiry', () => {
  assert.equal(BACKUP_CYCLE.days, null);
  assert.equal(BACKUP_CYCLE.state, 'NOT_SET');
  assert.equal(BACKUP_CYCLE.owner, 'the data protection officer with the developer');
  assert.equal(BACKUP_CYCLE.question, 'Can the client-document folders be excluded from the nightly whole-site backup?');
  assert.equal(BACKUP_CYCLE.source, 'Retention Procedure 4.1 point 4');
  const out = recordDeletion(rawFile({ extraction_completed_at: '2026-09-05T09:00:00.000Z' }), DELETED, { ...EVIDENCE });
  assert.deepEqual(out.deletion_evidence, {
    ...EVIDENCE, backups_pending: true, backup_cycle_days: null, backup_copies_expire_at: null,
  });
});

test('Z2 A CALLER CANNOT ASSERT THE BACKUPS AWAY — a backup position the cycle does not support is refused; restating the cycle’s own is taken', () => {
  const refuse = (over: Partial<NonNullable<RawFileRecord['deletion_evidence']>>) => assert.throws(
    () => recordDeletion(rawFile(), DELETED, { ...EVIDENCE, ...over }),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_BACKUP_CYCLE_ASSERTED',
  );
  refuse({ backups_pending: false });
  refuse({ backup_cycle_days: 0 });
  refuse({ backup_cycle_days: 30 });
  refuse({ backup_copies_expire_at: DELETED });
  // The negative control: the same call, stating what the cycle says, is recorded.
  assert.doesNotThrow(() => recordDeletion(rawFile(), DELETED, {
    ...EVIDENCE, backups_pending: true, backup_cycle_days: null, backup_copies_expire_at: null,
  }));
  // With a cycle SET, the cycle's own figures are the only ones a caller may restate.
  const set: BackupCycle = { ...BACKUP_CYCLE, state: 'SET', days: 30 };
  assert.throws(
    () => recordDeletion(rawFile(), DELETED, { ...EVIDENCE, backups_pending: false }, set),
    (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_BACKUP_CYCLE_ASSERTED',
  );
});

test('Z3 NO RESTORE WITHOUT THE DPO’S APPROVAL — a deleted record refuses no approval and a half-given one; an approval with who and its reference passes', () => {
  const deleted = recordDeletion(rawFile(), DELETED, { ...EVIDENCE });
  const refused = (e: unknown) => e instanceof ClientDocIngestionError && e.code === 'E_RESTORE_UNAPPROVED';
  assert.throws(() => assertRestoreApproved(deleted, null), refused);
  assert.throws(() => assertRestoreApproved(deleted, { approved_by: '', approval_ref: 'DPO-2026-014' }), refused);
  assert.throws(() => assertRestoreApproved(deleted, { approved_by: 'the data protection officer', approval_ref: '  ' }), refused);
  assert.doesNotThrow(() => assertRestoreApproved(deleted, { approved_by: 'the data protection officer', approval_ref: 'DPO-2026-014' }));
  assert.doesNotThrow(() => assertRestoreApproved(rawFile(), null), 'a record never deleted has nothing to restore');
});

test('Z4 N4 — A CYCLE RECORDED AS NOT KNOWN AND A CYCLE NEVER SET GIVE IDENTICAL EVIDENCE AND NO RET-3 DATE; only a cycle that is SET computes one', () => {
  const unknown: BackupCycle = { ...BACKUP_CYCLE, state: 'UNKNOWN', days: null };
  const neverSet: BackupCycle = BACKUP_CYCLE;
  const setWithNoNumber: BackupCycle = { ...BACKUP_CYCLE, state: 'SET', days: null };
  const numberNotSet: BackupCycle = { ...BACKUP_CYCLE, state: 'UNKNOWN', days: 30 };
  const fromUnknown = recordDeletion(rawFile(), DELETED, { ...EVIDENCE }, unknown).deletion_evidence;
  const fromNeverSet = recordDeletion(rawFile(), DELETED, { ...EVIDENCE }, neverSet).deletion_evidence;
  assert.deepEqual(fromUnknown, fromNeverSet, 'a cycle recorded as not known and one never set must not differ');
  assert.deepEqual(recordDeletion(rawFile(), DELETED, { ...EVIDENCE }, setWithNoNumber).deletion_evidence, fromNeverSet);
  assert.deepEqual(recordDeletion(rawFile(), DELETED, { ...EVIDENCE }, numberNotSet).deletion_evidence, fromNeverSet,
    'a number is read only from a cycle whose state is SET');
  for (const cycle of [unknown, neverSet, setWithNoNumber, numberNotSet]) assert.equal(knownBackupCycleDays(cycle), null);
  // Assert BOTH: neither becomes zero, neither becomes "no backups", neither starts RET-3.
  for (const ev of [fromUnknown, fromNeverSet]) {
    assert.equal(ev?.backups_pending, true);
    assert.equal(ev?.backup_cycle_days, null);
    assert.equal(ev?.backup_copies_expire_at, null);
    assert.equal(ret3DueAt({ verified_at: '2026-09-06T09:00:00.000Z', backups_pending: ev?.backups_pending ?? false,
      backup_cycle_days: ev?.backup_cycle_days ?? null, backup_copies_expire_at: ev?.backup_copies_expire_at ?? null }), null);
  }
  // The negative control, and the Retention Determinations' own worked example (12.4): deleted and verified on
  // 3 February 2028 with backups pending; a 30-day cycle ends the last copy on 4 March 2028, and RET-3 runs to 4 March 2034.
  const thirty: BackupCycle = { ...BACKUP_CYCLE, state: 'SET', days: 30 };
  const worked = recordDeletion(rawFile(), '2028-02-03T00:00:00.000Z', { ...EVIDENCE }, thirty).deletion_evidence;
  assert.deepEqual(worked, { ...EVIDENCE, backups_pending: true, backup_cycle_days: 30, backup_copies_expire_at: '2028-03-04T00:00:00.000Z' });
  assert.equal(ret3DueAt({ verified_at: '2028-02-03T00:00:00.000Z', backups_pending: true, backup_cycle_days: 30,
    backup_copies_expire_at: worked?.backup_copies_expire_at ?? null }), '2034-03-04T00:00:00.000Z');
  // A deletion not yet verified is not complete anywhere, whatever the cycle.
  assert.equal(ret3DueAt({ verified_at: null, backups_pending: true, backup_cycle_days: 30, backup_copies_expire_at: '2028-03-04T00:00:00.000Z' }), null);
});

test('Z5 a cycle SET at zero days — the folders excluded — is the one position that says no copy survives, and RET-3 runs from verification', () => {
  const excluded: BackupCycle = { ...BACKUP_CYCLE, state: 'SET', days: 0 };
  const ev = recordDeletion(rawFile(), DELETED, { ...EVIDENCE }, excluded).deletion_evidence;
  assert.deepEqual(ev, { ...EVIDENCE, backups_pending: false, backup_cycle_days: 0, backup_copies_expire_at: null });
  assert.equal(ret3DueAt({ verified_at: '2026-09-06T09:00:00.000Z', backups_pending: false, backup_cycle_days: 0, backup_copies_expire_at: null }),
    '2032-09-06T09:00:00.000Z');
});

/* ================================================================== *
 * PHASE 146l — THE OFFICIAL COPY OF THE LAND REGISTRY TITLE REGISTER
 * ================================================================== */

test('L1 the official copy is read by a person, never a model; its capture has no name in it; its receipt policy says why it is weaker', () => {
  assert.equal(HUMAN_READ_ONLY_TYPES.includes('TITLE_REGISTER'), true);
  assert.equal(DOC_SPECS.some((s) => s.doc_type === 'TITLE_REGISTER'), false, 'the official copy has a model-facing spec');
  const cap = HUMAN_CAPTURE_SPECS.find((s) => s.doc_type === 'TITLE_REGISTER');
  assert.deepEqual(cap?.fields.map((f) => f.field_id), [
    'oc_title_number', 'oc_tenure', 'oc_price_paid_pence', 'oc_price_paid_date', 'oc_restriction_count',
    'oc_proprietor_company_number', 'oc_prior_owner_count',
  ]);
  for (const f of cap?.fields ?? []) assert.doesNotMatch(f.field_id, /name|address|personal/, f.field_id);
  // every one is writable under CLIENT_DOC, and a personal owner's name offered anyway is refused by the register
  assert.doesNotThrow(() => assertClaimsWritable((cap?.fields ?? []).map((f) => ({ field_id: f.field_id, source_id: 'CLIENT_DOC' }))));
  assert.throws(() => assertClaimsWritable([{ field_id: 'oc_proprietor_name_personal', source_id: 'CLIENT_DOC' }]),
    (e: unknown) => e instanceof NameExclusionError);
  const policy = receiptPolicyFor('TITLE_REGISTER');
  assert.equal(policy.mode, 'WHOLE_DOCUMENT_PENDING_HUMAN_READ');
  assert.deepEqual(policy.roles_to_triage.map((r) => r.role), ['TRANSACTION_PARTY', 'PERSON_NAMED_IN_PROSE']);
  assert.match(policy.why, /honest weakness/i);
});
