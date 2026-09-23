/**
 * Caprebate — Name Exclusion Register tests. Board item 12818313893, subitem 12.
 * Run:  node --test caprebate-name-exclusion.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NAME_EXCLUSION_POLICY, NameExclusionError,
  classifyField, isPersonalNameField, assertNoUnauthorisedName, findPolicy,
  art14Owed, assertArt14Complete, art14DeadlineFor, art14PendingDpoDecision,
  Art14Error, ART14_NOT_SENT,
  type IngestedRecord, type Art14Record,
} from './caprebate-name-exclusion.ts';

/* --- the register loads and is internally consistent ---------------- */

test('R1 the eleven ORIGINAL register sources are still one per subitem 1-11, no gaps, no duplicates', () => {
  // Unchanged in substance. Phase 41 added CLIENT_DOC at subitem 13 (12 is
  // this test suite), so the assertion now names the register sources
  // explicitly rather than taking whatever is in the array. The original
  // guarantee — eleven register entries, contiguous, no duplicates — is
  // exactly what is still being asserted.
  //
  // PHASE 146d, 23 September 2026 adds HOMEDATA_ADDRESS at subitem 14 — the
  // paid address lookup, which had no entry at all and therefore could not
  // have written a field. The eleven original entries are untouched, so this
  // test keeps its shape and excludes the later additions by name rather than
  // widening its expected list, which is how it stays a test of the eleven.
  const later = ['CLIENT_DOC', 'HOMEDATA_ADDRESS'];
  const subitems = NAME_EXCLUSION_POLICY
    .filter((p) => !later.includes(p.sourceId))
    .map((p) => p.subitem)
    .sort((a, b) => a - b);
  assert.deepEqual(subitems, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('R1b CLIENT_DOC is still the only non-register source; the paid address lookup is a register source, added at subitem 14', () => {
  const clientDoc = NAME_EXCLUSION_POLICY.filter((p) => p.sourceId === 'CLIENT_DOC');
  assert.equal(clientDoc.length, 1);
  assert.equal(clientDoc[0].subitem, 13, 'subitem 12 is the test suite and is deliberately not reused');
  // Phase 146d: thirteen entries. HOMEDATA_ADDRESS IS a register — a paid one —
  // so CLIENT_DOC remains the one entry describing documents a client sends in.
  const homedata = NAME_EXCLUSION_POLICY.filter((p) => p.sourceId === 'HOMEDATA_ADDRESS');
  assert.equal(homedata.length, 1);
  assert.equal(homedata[0].subitem, 14);
  assert.equal(NAME_EXCLUSION_POLICY.length, 13);
  // Every subitem is still unique: a number is never reused.
  const numbers = NAME_EXCLUSION_POLICY.map((p) => p.subitem);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('R2 exactly two sources carry a documented exception — CH_PSC and HMLR_TITLE', () => {
  const withExceptions = NAME_EXCLUSION_POLICY.filter((p) => p.nameExceptions.length > 0).map((p) => p.sourceId).sort();
  assert.deepEqual(withExceptions, ['CH_PSC', 'HMLR_TITLE']);
});

test('R2b CLIENT_DOC adds NO third exception — no name is ever retained from a client document', () => {
  const clientDoc = NAME_EXCLUSION_POLICY.find((p) => p.sourceId === 'CLIENT_DOC');
  assert.ok(clientDoc);
  assert.deepEqual(clientDoc.nameExceptions, []);
});

test('R3 PLANNING and CLIENT_DOC are the highest-risk sources, and no others are', () => {
  // Phase 41 adds CLIENT_DOC at 'highest'. Phase 40 §4.5: an uploaded planning
  // PDF carries the same Class D data as the planning API and reaches fewer
  // controls on the way in, so classifying it below PLANNING would be false.
  const highest = NAME_EXCLUSION_POLICY.filter((p) => p.riskLevel === 'highest').map((p) => p.sourceId).sort();
  assert.deepEqual(highest, ['CLIENT_DOC', 'PLANNING']);
});

/* --- required case 1: a clean CQC record passes ---------------------- */

test('T1 a clean CQC record passes', () => {
  const rec: IngestedRecord = {
    sourceId: 'CQC',
    entityId: 'J1',
    fields: {
      registration_status: 'Registered',
      beds_registered: 40,
      service_types: ['Care home service with nursing'],
      registration_date: '2019-04-01',
    },
  };
  assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
});

/* --- required case 2: CQC record carrying a registered manager name fails */

test('T2 a CQC record carrying a registered manager name FAILS', () => {
  const rec: IngestedRecord = {
    sourceId: 'CQC',
    entityId: 'J1',
    fields: { registration_status: 'Registered', registered_manager_name: 'A N Other' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

/* --- required case 3: EPC record carrying an assessor name fails ----- */

test('T3 an EPC record carrying an assessor name FAILS', () => {
  const rec: IngestedRecord = {
    sourceId: 'EPC',
    entityId: 'J1',
    fields: { epc_total_floor_area_m2: 1200, assessor_name: 'A N Other' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

test('T3b an EPC record carrying only an assessor_id (no literal name) also FAILS', () => {
  // The awkward case: assessor_id is not a "name" field by label, but it
  // identifies one specific individual and must be treated the same way.
  const rec: IngestedRecord = {
    sourceId: 'EPC',
    entityId: 'J1',
    fields: { epc_total_floor_area_m2: 1200, assessor_id: 'ASR-00123' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
  assert.equal(isPersonalNameField('EPC', 'assessor_id'), true);
});

/* --- required case 4: CH PSC record with retained name passes (Exception 1) */

test('T4 a Companies House PSC record with a retained name PASSES — Exception 1', () => {
  const rec: IngestedRecord = {
    sourceId: 'CH_PSC',
    entityId: 'J1',
    fields: { psc_name: 'A N Other', psc_kind: 'individual-person-with-significant-control', company_number: '01234567' },
  };
  assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
  const c = classifyField('CH_PSC', 'psc_name');
  assert.equal(c.kind, 'name_retained_exception');
  assert.equal(c.kind === 'name_retained_exception' && c.exceptionId, 'EXCEPTION_1_PSC_COMMON_CONTROL');
});

/* --- required case 5: HMLR record with an individual proprietor passes (Exception 2) */

test('T5 an HMLR record with an individual proprietor name PASSES — Exception 2', () => {
  const rec: IngestedRecord = {
    sourceId: 'HMLR_TITLE',
    entityId: 'J1',
    fields: { title_number: 'ABC123', tenure: 'Freehold', proprietor_name_personal: 'A N Other' },
    proprietorType: 'individual',
  };
  assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
});

/* --- required case 6: HMLR record with a corporate proprietor where a
   name is written as if personal is correctly classified / fails -------- */

test('T6 an HMLR record with a corporate proprietor written to proprietor_name_personal FAILS', () => {
  // This is the exception applied to the wrong case, not the exception
  // failing to apply — E_EXCEPTION_MISAPPLIED, not E_NAME_FIELD_EXCLUDED,
  // because the field itself IS the excepted field; the discriminant is wrong.
  const rec: IngestedRecord = {
    sourceId: 'HMLR_TITLE',
    entityId: 'J1',
    fields: { title_number: 'ABC123', tenure: 'Freehold', proprietor_name_personal: 'Acme Care Homes Ltd' },
    proprietorType: 'company',
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_EXCEPTION_MISAPPLIED',
  );
});

test('T6b the same corporate proprietor, correctly recorded via proprietor_name_company, PASSES', () => {
  const rec: IngestedRecord = {
    sourceId: 'HMLR_TITLE',
    entityId: 'J1',
    fields: { title_number: 'ABC123', tenure: 'Freehold', proprietor_name_company: 'Acme Care Homes Ltd', proprietor_company_number: '07654321' },
    proprietorType: 'company',
  };
  assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
  // A company name is not classified as a personal-name field at all.
  assert.equal(isPersonalNameField('HMLR_TITLE', 'proprietor_name_company'), false);
});

test('T6c omitting proprietorType entirely on a personal-name write FAILS closed, not open', () => {
  const rec: IngestedRecord = {
    sourceId: 'HMLR_TITLE',
    entityId: 'J1',
    fields: { title_number: 'ABC123', proprietor_name_personal: 'A N Other' },
    // proprietorType deliberately omitted
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_EXCEPTION_MISAPPLIED',
  );
});

/* --- required case 7: a planning record carrying an objector name fails */

test('T7 a planning record carrying an objector name FAILS', () => {
  const rec: IngestedRecord = {
    sourceId: 'PLANNING',
    entityId: 'J1',
    fields: { planning_reference: 'APP/2026/001', planning_decision: 'Granted', objector_name: 'A N Other' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

test('T7b a planning record carrying free-text comment content FAILS wholesale, not filtered', () => {
  // comment_* is excluded outright because it is free text that may carry
  // a name anywhere within it — there is no reliable partial redaction.
  const rec: IngestedRecord = {
    sourceId: 'PLANNING',
    entityId: 'J1',
    fields: { planning_reference: 'APP/2026/001', comment_text: 'I, Jane Smith of 4 Oak Lane, object to...' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

/* --- required case 8: an unknown/unregistered source FAILS CLOSED ---- */

test('T8 a record from an unknown source FAILS CLOSED rather than passing by default', () => {
  const rec: IngestedRecord = {
    sourceId: 'SOME_NEW_REGISTER_NOBODY_ADDED_YET',
    entityId: 'J1',
    fields: { totally_harmless_looking_field: 42 },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_UNKNOWN_SOURCE',
  );
  assert.throws(() => findPolicy('SOME_NEW_REGISTER_NOBODY_ADDED_YET'), NameExclusionError);
});

test('T8b the Companies House officers endpoint is deliberately never registered — fails closed the same way', () => {
  // CH_OFFICERS is never added to NAME_EXCLUSION_POLICY, on purpose: the
  // preferred pattern is to never call the endpoint at all, not to call it
  // and filter the response. If a future change ever DID call it and tag
  // the result with this source id, ingestion refuses it, same as any
  // other uncatalogued source.
  const rec: IngestedRecord = {
    sourceId: 'CH_OFFICERS',
    entityId: 'J1',
    fields: { director_name: 'A N Other' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_UNKNOWN_SOURCE',
  );
});

/* --- a known source, an uncatalogued field: also fails closed -------- */

test('T9 a field never catalogued on a KNOWN source is refused as unclassified, not assumed safe', () => {
  const rec: IngestedRecord = {
    sourceId: 'CQC',
    entityId: 'J1',
    fields: { registration_status: 'Registered', some_field_added_next_sprint: 'x' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_UNCLASSIFIED_FIELD',
  );
});

/* --- the "company name that happens to be a person's name" awkward case */

test('T10 a Companies House company_name that reads as a person\'s name is NOT a personal-name field', () => {
  assert.equal(isPersonalNameField('CH_COMPANY', 'company_name'), false);
  const rec: IngestedRecord = {
    sourceId: 'CH_COMPANY',
    entityId: 'J1',
    fields: { company_number: '01234567', company_name: 'A N Other Consulting Ltd' },
  };
  assert.doesNotThrow(() => assertNoUnauthorisedName(rec));
});

/* --- Charity Commission and Ofsted/RSH, the two sources with no coded
   representation elsewhere in the phase3 source register --------------- */

test('T11 a Charity Commission record carrying a trustee name FAILS', () => {
  const rec: IngestedRecord = {
    sourceId: 'CHARITY_COMMISSION',
    entityId: 'J1',
    fields: { charity_number: '1112223', trustee_name: 'A N Other' },
  };
  assert.throws(
    () => assertNoUnauthorisedName(rec),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
});

test('T12 an Ofsted/RSH record carrying a registered person name FAILS, provider_status alone PASSES', () => {
  assert.throws(
    () => assertNoUnauthorisedName({
      sourceId: 'OFSTED_RSH', entityId: 'J1',
      fields: { provider_status: 'Registered', registered_person_name: 'A N Other' },
    }),
    (e: NameExclusionError) => e.code === 'E_NAME_FIELD_EXCLUDED',
  );
  assert.doesNotThrow(() => assertNoUnauthorisedName({
    sourceId: 'OFSTED_RSH', entityId: 'J1', fields: { provider_status: 'Registered' },
  }));
});

/* =====================================================================
   A1–A14 — THE ARTICLE 14 TRANSPARENCY RECORD (board item 12927936989)
   Built 8 September 2026, Phase 98.

   What these hold down is not "the four fields exist". It is that the four
   fields, filled in independently, cannot describe a world that does not
   exist — and that a record which owes a notice cannot quietly have none.
   ===================================================================== */

const a14 = (over: Partial<Art14Record> = {}): Art14Record => ({
  art14_notice_sent: '2026-09-01',
  art14_notice_route: 'DIRECT',
  art14_basis: 'NOTIFIED',
  art14_notice_version: 'T6 v1.0',
  recorded_by: 'S. Ali (DPO)',
  recorded_at: '2026-09-01',
  ...over,
});

const pscRec = (over: Partial<IngestedRecord> = {}): IngestedRecord => ({
  sourceId: 'CH_PSC',
  entityId: 'PSC-0001',
  fields: { psc_name: 'A Person', psc_kind: 'individual-person-with-significant-control' },
  ...over,
});

const hmlrRec = (over: Partial<IngestedRecord> = {}): IngestedRecord => ({
  sourceId: 'HMLR_TITLE',
  entityId: 'TITLE-0001',
  fields: { proprietor_name_personal: 'A Person', title_number: 'WA123456' },
  proprietorType: 'individual',
  ...over,
});

const a14Code = (fn: () => unknown): string => {
  try { fn(); return 'NO_THROW'; } catch (e) {
    return e instanceof Art14Error ? e.code : (e as Error).name;
  }
};

test('A1 the duty is DERIVED from the name policy, not declared by a flag', () => {
  /* A record cannot retain a name under an exception and separately claim it
     owes nobody a notice. Both exceptions owe one; a record carrying no
     excepted name does not. */
  assert.equal(art14Owed(pscRec()), true);
  assert.equal(art14Owed(hmlrRec()), true);
  assert.equal(art14Owed({
    sourceId: 'CH_PSC', entityId: 'PSC-0002',
    fields: { psc_kind: 'corporate-entity-person-with-significant-control' },
  }), false);
});

test('A2 a CORPORATE proprietor owes no Article 14 duty — no natural person is identified', () => {
  /* Exception 2 covers an individual proprietor only. Getting this wrong would
     generate transparency obligations to companies, which would then be
     "discharged" and would look like compliance. */
  assert.equal(art14Owed({
    sourceId: 'HMLR_TITLE', entityId: 'TITLE-0002',
    fields: { proprietor_name_company: 'Some Ltd', title_number: 'WA1' },
    proprietorType: 'company',
  }), false);
  assert.equal(art14Owed(hmlrRec({ proprietorType: 'company' })), false);
});

test('A3 an unknown source fails closed here too', () => {
  assert.throws(() => art14Owed({ sourceId: 'MADE_UP', entityId: 'X', fields: { a: 1 } }),
    (e: NameExclusionError) => e.code === 'E_UNKNOWN_SOURCE');
});

test('A4 a record that owes a notice and has NO transparency record is refused', () => {
  /* This is the gap the item was raised for. Before today an RP-E1 record could
     be held indefinitely with nothing recording whether the person was told. */
  assert.equal(a14Code(() => assertArt14Complete(pscRec())), 'E_ART14_RECORD_MISSING');
  assert.equal(a14Code(() => assertArt14Complete(hmlrRec())), 'E_ART14_RECORD_MISSING');
});

test('A5 a complete, coherent record passes — both the notified and the exempt shape', () => {
  assertArt14Complete(pscRec({ art14: a14() }));
  assertArt14Complete(hmlrRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_notice_version: null,
    art14_exemption_reason:
      'The title register gives this proprietor no address and no other contact ' +
      'route; the property is tenanted and the client holds no correspondence for them.',
  }) }));
});

test('A6 A BLANK IS NOT AN ANSWER — every required field, one at a time', () => {
  /* The rule the breach register applies at its section 2.5. NOT SENT with a
     reason is an answer; empty is not. Four fields that may be left empty are
     four boxes, not a record. */
  for (const patch of [
    { art14_notice_sent: '' },
    { art14_notice_sent: '   ' },
    { art14_notice_route: '' as never },
    { art14_basis: '' as never },
    { recorded_by: '' },
    { recorded_at: '' },
  ]) {
    assert.equal(
      a14Code(() => assertArt14Complete(pscRec({ art14: a14(patch) }))),
      'E_ART14_BLANK_NOT_AN_ANSWER',
      `a blank ${Object.keys(patch)[0]} must be refused`);
  }
});

test('A7 NOT_SENT is an explicit value and is NOT the same as blank', () => {
  /* The whole distinction the item asks for: "date, or explicitly NOT SENT". */
  assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_notice_version: null,
    art14_exemption_reason: 'No address on the public register and no other route known.',
  }) }));
  assert.equal(ART14_NOT_SENT, 'NOT_SENT');
});

test('A8 a date and a route must describe the same world', () => {
  /* Sent on a date but recorded as having no route; or no notice but a route
     that implies one. Each field is plausible alone. */
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: '2026-09-01', art14_notice_route: 'NOT_SENT_NO_ROUTE',
  }) }))), 'E_ART14_INCOHERENT');
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT, art14_notice_route: 'DIRECT',
  }) }))), 'E_ART14_INCOHERENT');
});

test('A9 NOTIFIED cannot be claimed when nothing was sent', () => {
  /* Article 14 is not met by intending to meet it. */
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'NOTIFIED',
    art14_notice_version: null,
  }) }))), 'E_ART14_INCOHERENT');
});

test('A10 the exemption cannot be relied on for somebody we actually reached', () => {
  /* 14(5)(e) is for people we cannot reach. Reaching them and then claiming it
     is the shape a half-completed form produces, and it is the single most
     likely way this record gets filled in wrongly. */
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_exemption_reason: 'no route',
  }) }))), 'E_ART14_INCOHERENT');
});

test('A11 the exemption without a per-person reason is refused', () => {
  /* Article 14(5) applies "to the extent that" — reliance is per person. And
     14(6) makes the NUMBER of data subjects relevant, which is exactly where a
     small controller is weakest. */
  assert.equal(a14Code(() => assertArt14Complete(hmlrRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_notice_version: null,
  }) }))), 'E_ART14_EXEMPTION_WITHOUT_REASON');
  assert.equal(a14Code(() => assertArt14Complete(hmlrRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_notice_version: null,
    art14_exemption_reason: '   ',
  }) }))), 'E_ART14_EXEMPTION_WITHOUT_REASON');
});

test('A12 a notice sent must name its version; one not sent must not', () => {
  /* Without the version a later amendment cannot be traced to the people who
     received the earlier wording. */
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_version: null,
  }) }))), 'E_ART14_VERSION_MISSING');
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: ART14_NOT_SENT,
    art14_notice_route: 'NOT_SENT_NO_ROUTE',
    art14_basis: 'EXEMPTION_RELIED_ON',
    art14_exemption_reason: 'No route on the register.',
    art14_notice_version: 'T6 v1.0',
  }) }))), 'E_ART14_INCOHERENT');
});

test('A13 a free-text near-miss in the date field is refused', () => {
  /* "sent last week" is how a field stops being queryable, and an unqueryable
     field cannot answer "which people are we relying on the exemption for". */
  assert.equal(a14Code(() => assertArt14Complete(pscRec({ art14: a14({
    art14_notice_sent: 'sent last week',
  }) }))), 'E_ART14_BLANK_NOT_AN_ANSWER');
});

test('A14 a transparency record against a record that owes none is refused', () => {
  /* A notice recorded against nobody is not evidence of compliance; it is a
     record that will later be cited as one. */
  assert.equal(a14Code(() => assertArt14Complete({
    sourceId: 'HMLR_TITLE', entityId: 'TITLE-0003',
    fields: { proprietor_name_company: 'Some Ltd', title_number: 'WA1' },
    proprietorType: 'company',
    art14: a14(),
  })), 'E_ART14_NOT_OWED');
});

test('A15 VIA_CLIENT is recordable but findable — it depends on an unanswered question', () => {
  /* Whether Article 14 may be discharged by asking our client to pass the
     notice to a person named on their own title is open with the DPO. The
     field is needed either way, which is why this was buildable now — but a
     record depending on an unanswered question must be findable when it is
     answered, or the answer arrives and nothing changes. */
  const viaClient = pscRec({ art14: a14({ art14_notice_route: 'VIA_CLIENT' }) });
  assertArt14Complete(viaClient);                       // recordable
  assert.equal(art14PendingDpoDecision(viaClient), true); // and findable
  assert.equal(art14PendingDpoDecision(pscRec({ art14: a14() })), false);
  assert.equal(art14PendingDpoDecision(pscRec()), false);
});

test('A16 the Article 14(3)(a) deadline is one month from obtaining, and it is computed', () => {
  assert.equal(art14DeadlineFor('2026-09-08'), '2026-10-08');
  assert.equal(art14DeadlineFor('2026-01-31'), '2026-03-03'); // month-end rolls, and is visible
  assert.equal(a14Code(() => art14DeadlineFor('')), 'E_ART14_BLANK_NOT_AN_ANSWER');
  assert.equal(a14Code(() => art14DeadlineFor('whenever')), 'E_ART14_BLANK_NOT_AN_ANSWER');
});

test('A17 ingestion is NOT gated on the transparency record, and that is deliberate', () => {
  /* Article 14(3)(a) gives a month from obtaining, so the notice cannot exist
     at the moment of ingestion. Requiring it there would make lawful ingestion
     impossible — the same split the uploaded-document population uses. */
  assertNoUnauthorisedName(pscRec());   // no art14 record, and it still ingests
  assertNoUnauthorisedName(hmlrRec());
  assert.equal(a14Code(() => assertArt14Complete(pscRec())), 'E_ART14_RECORD_MISSING');
});
