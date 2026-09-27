/**
 * Caprebate — Source Register tests. Board item 12830181420.
 * Run:  node --test caprebate-source-register.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SourceRegister, ProvenanceStore, ProvenanceError,
  record, derive, unwrap, verify, evidenceTrail, attributionsFor,
  redistributionCheck, stalenessReport, serialise, rehydrate, worstGrade,
  SOURCES, LICENCES,
  type AnyCell, type Retrieval,
} from './caprebate-source-register.ts';

const NOW = '2026-08-26T12:00:00Z';
const reg = () => new SourceRegister({ clock: () => NOW });

const ret = (over: Partial<Retrieval> = {}): Retrieval => ({
  retrieved_at: '2026-08-20T09:00:00Z',
  method: 'API',
  locator: 'https://api.example/thing/1',
  ...over,
});

/* --- FM-1 / FM-2: no value without a registered source ------------- */

test('T1 an unregistered source id is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'MADE_UP', retrieval: ret(), value: 1 }),
    (e: ProvenanceError) => e.code === 'E_UNKNOWN_SOURCE',
  );
});

test('T2 a missing retrieved_at is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, {
      entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD',
      retrieval: { method: 'API', locator: 'x' } as unknown as Retrieval, value: 1,
    }),
    (e: ProvenanceError) => e.code === 'E_NO_RETRIEVED_AT',
  );
});

test('T3 a non-ISO retrieved_at is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret({ retrieved_at: '20 Aug 2026' }), value: 1 }),
    (e: ProvenanceError) => e.code === 'E_BAD_TIMESTAMP',
  );
});

test('T4 a future retrieved_at is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret({ retrieved_at: '2027-01-01T00:00:00Z' }), value: 1 }),
    (e: ProvenanceError) => e.code === 'E_FUTURE_TIMESTAMP',
  );
});

test('T5 a retrieval with no locator is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret({ locator: '' }), value: 1 }),
    (e: ProvenanceError) => e.code === 'E_NO_RETRIEVED_AT',
  );
});

/* --- FM-5: the name exclusion register, enforced ------------------- */

test('T6 an excluded personal-name field is refused (EPC assessor)', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'assessor_name', source_id: 'EPC', retrieval: ret(), value: 'A Person' }),
    (e: ProvenanceError) => e.code === 'E_FIELD_EXCLUDED',
  );
});

test('T7 a field simply absent from the KEEP list is refused (planning objector)', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'objector_comment_text', source_id: 'PLANNING', retrieval: ret(), value: 'text' }),
    (e: ProvenanceError) => ['E_FIELD_EXCLUDED', 'E_FIELD_NOT_PERMITTED'].includes(e.code),
  );
});

test('T8 no register source outside the two exceptions may write a personal name', () => {
  const r = reg();
  const offenders = r.sources()
    .filter((s) => ['API'].includes(s.default_prov))
    .filter((s) => s.personal_name_exceptions.length > 0)
    .map((s) => s.source_id);
  assert.deepEqual(offenders.sort(), ['CH_PSC', 'HMLR_TITLE']);
});

test('T9 EXCEPTION 1 — Companies House PSC name is permitted', () => {
  const r = reg();
  const c = record(r, { entity_id: 'J1', field_id: 'psc_name', source_id: 'CH_PSC', retrieval: ret(), value: 'A N Other' });
  assert.equal(unwrap(c), 'A N Other');
  assert.equal(c.prov.publisher, 'Companies House');
});

test('T10 EXCEPTION 2 — HMLR personal proprietor permitted, former proprietor is not', () => {
  const r = reg();
  assert.ok(record(r, { entity_id: 'J1', field_id: 'proprietor_name_personal', source_id: 'HMLR_TITLE', retrieval: ret(), value: 'A N Other' }));
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'former_proprietor_name', source_id: 'HMLR_TITLE', retrieval: ret(), value: 'B Other' }),
    (e: ProvenanceError) => e.code === 'E_FIELD_EXCLUDED',
  );
});

/* --- grade discipline ---------------------------------------------- */

test('T11 a source cannot mint a grade better than its ceiling', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM' }), value: 1400, grade: 'A' }),
    (e: ProvenanceError) => e.code === 'E_GRADE_EXCEEDS_SOURCE',
  );
});

test('T12 worstGrade picks the worst, not the average', () => {
  assert.equal(worstGrade(['A', 'B', 'D', 'A']), 'D');
  assert.equal(worstGrade(['A']), 'A');
});

test('T13 I-2 — a derived figure inherits the worst input grade, not A', () => {
  const r = reg();
  const price = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 1_000_000 });
  const pct = record<number>(r, { entity_id: 'J1', field_id: 'qualifying_pct', source_id: 'SURVEYOR', retrieval: ret({ method: 'SURVEY', locator: 'CAVR draft v1' }), value: 0.222 });
  const qe = derive<number>(r, {
    entity_id: 'J1', field_id: 'qualifying_expenditure', inputs: [price, pct],
    computation: 'price_paid * qualifying_pct',
    compute: (v) => (v[0] as number) * (v[1] as number),
  });
  assert.equal(qe.prov.grade, 'D');
  assert.equal(unwrap(qe), 222_000);
});

/* --- I-1: UNKNOWN is not null and never coalesces ------------------ */

test('T14 UNKNOWN carries no value and refuses to be unwrapped', () => {
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.grant' }), unknown: true });
  assert.equal(c.state, 'UNKNOWN');
  assert.equal(c.value, null);
  assert.throws(() => unwrap(c), (e: ProvenanceError) => e.code === 'E_STATE_VALUE_MISMATCH');
});

test('T15 a cell with neither value nor UNKNOWN is refused', () => {
  const r = reg();
  assert.throws(
    () => record(r, { entity_id: 'J1', field_id: 'gia_m2', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM' }) }),
    (e: ProvenanceError) => e.code === 'E_STATE_VALUE_MISMATCH',
  );
});

test('T16 UNKNOWN propagates through derive rather than defaulting to zero', () => {
  const r = reg();
  const price = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 1_000_000 });
  const grant = record<number>(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.grant' }), unknown: true });
  const net = derive<number>(r, {
    entity_id: 'J1', field_id: 'net_expenditure', inputs: [price, grant],
    computation: 'price_paid * (1 - grant_fraction)',
    compute: (v) => (v[0] as number) * (1 - (v[1] as number)),
  });
  assert.equal(net.state, 'UNKNOWN');
  assert.equal(net.value, null);
});

test('T17 "never asked" is the absence of a cell, distinct from UNKNOWN', () => {
  const r = reg();
  const store = new ProvenanceStore(r);
  assert.equal(store.get('J1', 'grant_fraction'), null);
  store.put(record(r, { entity_id: 'J1', field_id: 'grant_fraction', source_id: 'CLIENT_ANSWER', retrieval: ret({ method: 'FORM', locator: 'q.grant' }), unknown: true }) as AnyCell);
  assert.equal(store.get('J1', 'grant_fraction')!.state, 'UNKNOWN');
});

/* --- FM-4: derive with no inputs ----------------------------------- */

test('T18 a derived figure with no inputs is refused', () => {
  const r = reg();
  assert.throws(
    () => derive(r, { entity_id: 'J1', field_id: 'x', inputs: [], computation: 'magic', compute: () => 1 }),
    (e: ProvenanceError) => e.code === 'E_NO_INPUTS',
  );
});

/* --- FM-8: append-only --------------------------------------------- */

test('T19 a correction supersedes but does not destroy the earlier provenance', () => {
  const r = reg();
  const store = new ProvenanceStore(r);
  const v1 = record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'RRN-1' }), value: 1200 });
  const v2 = record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ retrieved_at: '2026-08-25T09:00:00Z', locator: 'RRN-1 relodged' }), value: 1215 });
  const r1 = store.put(v1 as AnyCell);
  const r2 = store.put(v2 as AnyCell);
  assert.equal(r1.version, 1);
  assert.equal(r2.version, 2);
  assert.equal(r2.superseded, r1.record_id);
  assert.equal(store.history('J1', 'epc_total_floor_area_m2').length, 2);
  assert.equal(unwrap(store.get<number>('J1', 'epc_total_floor_area_m2')!), 1215);
});

/* --- FM-10: provenance cannot be detached -------------------------- */

test('T20 a cell survives a serialise/rehydrate round trip', () => {
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 950_000 });
  const back = rehydrate<number>(r, serialise(c as AnyCell));
  assert.equal(unwrap(back), 950_000);
  assert.equal(back.prov.licence_id, 'HMLR_PPD');
});

test('T21 a tampered value is rejected on rehydrate', () => {
  const r = reg();
  const c = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 950_000 });
  const bad = serialise(c as AnyCell).replace('950000', '9500000');
  assert.throws(() => rehydrate(r, bad), (e: ProvenanceError) => e.code === 'E_INTEGRITY');
});

test('T22 a bare value cannot be put into the store', () => {
  const r = reg();
  const store = new ProvenanceStore(r);
  // @ts-expect-error a bare number is not a Cell — this is a compile error, and a runtime one too
  assert.throws(() => store.put(1200), (e: ProvenanceError) => e.code === 'E_NOT_A_CELL');
});

test('T23 verify() rejects a hand-built object wearing the right shape', () => {
  const r = reg();
  const forged = {
    record_id: 'x', entity_id: 'J1', field_id: 'price_paid', state: 'VALUE', value: 1,
    prov: { source_id: 'HMLR_PPD', publisher: 'HM Land Registry', licence_id: 'HMLR_PPD', prov: 'API', grade: 'A', retrieval: ret(), recorded_at: NOW, derived_from: [], computation: null, effective_retrieved_at: ret().retrieved_at },
    integrity: 'deadbeef',
  } as unknown as AnyCell;
  assert.throws(() => verify(r, forged), (e: ProvenanceError) => e.code === 'E_INTEGRITY');
});

/* --- retrieval API -------------------------------------------------- */

test('T24 the evidence trail answers "where did this number come from" recursively', () => {
  const r = reg();
  const store = new ProvenanceStore(r);
  const price = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret({ locator: 'PPD tx 12345' }), value: 1_000_000 });
  const area = record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ locator: 'RRN-1' }), value: 1200 });
  store.put(price as AnyCell);
  store.put(area as AnyCell);
  const ppsm = derive<number>(r, {
    entity_id: 'J1', field_id: 'price_per_m2', inputs: [price, area],
    computation: 'price_paid / epc_total_floor_area_m2',
    compute: (v) => (v[0] as number) / (v[1] as number),
  });
  store.put(ppsm as AnyCell);

  const trail = evidenceTrail(r, store, 'J1', 'price_per_m2')!;
  assert.equal(trail.prov, 'DR');
  assert.equal(trail.computation, 'price_paid / epc_total_floor_area_m2');
  assert.deepEqual(trail.inputs.map((n) => n.field_id).sort(), ['epc_total_floor_area_m2', 'price_paid']);
  assert.deepEqual(trail.inputs.map((n) => n.publisher).sort(), ['HM Land Registry', 'MHCLG']);
  assert.ok(trail.inputs.every((n) => n.retrieved_at === '2026-08-20T09:00:00Z'));
});

test('T25 a derived figure is as stale as its stalest input', () => {
  const r = reg();
  const old = record<number>(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret({ retrieved_at: '2026-01-05T09:00:00Z' }), value: 1_000_000 });
  const fresh = record<number>(r, { entity_id: 'J1', field_id: 'epc_total_floor_area_m2', source_id: 'EPC', retrieval: ret({ retrieved_at: '2026-08-25T09:00:00Z' }), value: 1200 });
  const d = derive<number>(r, {
    entity_id: 'J1', field_id: 'price_per_m2', inputs: [old, fresh],
    computation: 'a/b', compute: (v) => (v[0] as number) / (v[1] as number),
  });
  assert.equal(d.prov.effective_retrieved_at, '2026-01-05T09:00:00Z');
  // Cache window inherits too: HMLR_PPD 90d and EPC 365d -> strictest is 90d,
  // even though the derived cell's own licence (CAPREBATE_OWN) caps nothing.
  assert.equal(d.prov.effective_cache_max_age_days, 90);
  const stale = stalenessReport(r, [d as AnyCell], NOW);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].max_age_days, 90);
  assert.ok(stale[0].age_days > 200);
  // The fresh input on its own is inside its window.
  assert.equal(stalenessReport(r, [fresh as AnyCell], NOW).length, 0);
});

test('T26 attributions are collected verbatim, deduplicated and sorted', () => {
  const r = reg();
  const a = record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 1 });
  const b = record(r, { entity_id: 'J1', field_id: 'transaction_date', source_id: 'HMLR_PPD', retrieval: ret(), value: '2019-06-01' });
  const c = record(r, { entity_id: 'J1', field_id: 'company_number', source_id: 'CH_COMPANY', retrieval: ret(), value: '01234567' });
  const lines = attributionsFor(r, [a, b, c] as AnyCell[]);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l.includes('HM Land Registry')));
  assert.ok(lines.some((l) => l.includes('Open Government Licence')));
});

test('T27 a licence-restricted figure is caught before it reaches the client report', () => {
  const r = reg();
  const rate = record<number>(r, { entity_id: 'J1', field_id: 'bcis_rate_substructure', source_id: 'BCIS', retrieval: ret({ locator: 'BCIS elemental, rebased 2026Q2' }), value: 310 });
  const breaches = redistributionCheck(r, [rate as AnyCell], 'client_report');
  assert.equal(breaches.length, 1);
  assert.equal(breaches[0].licence_id, 'BCIS_COMMERCIAL');
  assert.equal(redistributionCheck(r, [rate as AnyCell], 'internal').length, 0);
});

test('T28 sources awaiting solicitor/DPO licence clearance are listed, not assumed clear', () => {
  const r = reg();
  const ids = r.awaitingLegalReview().map((s) => s.source_id).sort();
  // Phase 146m: HMLR_TITLE cleared — the solicitor said yes to the accountant's pack (relayed by Lakhbir, 27 Sep 2026).
  assert.deepEqual(ids, ['BCIS', 'CQC', 'HOMEDATA_ADDRESS']);
  const lic = LICENCES.find((l) => l.licence_id === 'HMLR_TITLE')!;
  assert.deepEqual([lic.redistribution.accountant_report, lic.redistribution.hmrc_pack, lic.redistribution.client_report], [true, true, false],
    'the answer opened the accountant pack, and nothing it was not asked about');
});

test('T29 every registered source resolves to a registered licence', () => {
  const r = reg();
  for (const s of r.sources()) assert.ok(r.licenceFor(s.source_id).licence_id);
});

test('T30 store.all returns the latest version of every field on a job', () => {
  const r = reg();
  const store = new ProvenanceStore(r);
  store.put(record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 1 }) as AnyCell);
  store.put(record(r, { entity_id: 'J1', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 2 }) as AnyCell);
  store.put(record(r, { entity_id: 'J2', field_id: 'price_paid', source_id: 'HMLR_PPD', retrieval: ret(), value: 3 }) as AnyCell);
  const j1 = store.all('J1');
  assert.equal(j1.length, 1);
  assert.equal(j1[0].value, 2);
});

/* --- T31–T34: ONS postcode source, added 8 September 2026 (board 12991298199)
       The source that produces LEG-E4's location_key. Nothing produced one
       until this landed. ------------------------------------------------- */

test('T31 the ONS postcode source is registered and can mint a grade A', () => {
  const src = SOURCES.find((s) => s.source_id === 'ONS_POSTCODE');
  assert.ok(src, 'ONS_POSTCODE must be registered — LEG-E4 has no location_key without it');
  assert.equal(src!.max_grade, 'A');
  assert.equal(src!.licence_id, 'ONS_POSTCODE_OGL');
  /* Null endpoint is load-bearing, not an omission: the engine makes no
     network call, the table is ingested out of band and read locally. */
  assert.equal(src!.endpoint, null);
  assert.deepEqual(src!.personal_name_exceptions, []);
});

test('T32 the ONS licence does NOT reuse the generic OGL attribution line', () => {
  /* ONS requires its own line plus Ordnance Survey's plus Royal Mail's,
     because the product is Gridlink-derived. Reusing the generic OGL_V3
     wording under-attributes, and under-attributing breaches the condition
     the licence is granted on. Same licence, different obligation. */
  const ons = LICENCES.find((l) => l.licence_id === 'ONS_POSTCODE_OGL');
  const ogl = LICENCES.find((l) => l.licence_id === 'OGL_V3');
  assert.ok(ons && ogl);
  assert.notEqual(ons!.attribution_text, ogl!.attribution_text);
  assert.equal(ons!.attribution_required, true);
  for (const must of ['OS data', 'Royal Mail', 'Office for National Statistics']) {
    assert.ok(ons!.attribution_text!.includes(must), `attribution must name ${must}`);
  }
});

test('T33 the cache window tracks the quarterly release, not the OGL default', () => {
  const ons = LICENCES.find((l) => l.licence_id === 'ONS_POSTCODE_OGL');
  const ogl = LICENCES.find((l) => l.licence_id === 'OGL_V3');
  /* 180 days can serve data two quarterly releases old. 120 keeps us at most
     one behind, with a month to notice. */
  assert.equal(ons!.cache_max_age_days, 120);
  assert.equal(ogl!.cache_max_age_days, 180);
});

test('T34 nothing about a person may be written from the ONS postcode source', () => {
  const src = SOURCES.find((s) => s.source_id === 'ONS_POSTCODE')!;
  /* The product contains no names at all, so the whitelist is four fields and
     the blacklist exists only as belt and braces. */
  assert.equal(src.permitted_fields.length, 4);
  assert.ok(src.permitted_fields.every((f) => f.startsWith('ons_')));
  assert.ok(!src.permitted_fields.includes('*'));
  assert.ok(src.excluded_fields.length > 0);
});

/* --- The address lookup (board item 13003875907, Phase 129) -------- */

test('T-HD1 the address lookup is registered, and an unpublished cache window is a refusal, not "no limit"', () => {
  const r = reg();
  const lic = LICENCES.find((l) => l.licence_id === 'HOMEDATA_TERMS')!;
  assert.equal(lic.cache_max_age_days, 0, 'null would assert "no limit", which the supplier never published');
  assert.equal(lic.legal_review_required, true);
  assert.match(lic.name, /NO LICENCE NAME PUBLISHED/);
  assert.match(lic.attribution_text ?? '', /^NOT PUBLISHED/);
  const cell = record(r, { entity_id: 'J1', field_id: 'uprn', source_id: 'HOMEDATA_ADDRESS', retrieval: ret(), value: '100023336956' }) as AnyCell;
  assert.equal(stalenessReport(r, [cell], NOW).length, 1, 'a held address is stale until re-fetched');
});

test('T-HD2 the address lookup may not be reproduced outward, and writes only its own three fields', () => {
  const r = reg();
  const cell = record(r, { entity_id: 'J1', field_id: 'postcode', source_id: 'HOMEDATA_ADDRESS', retrieval: ret(), value: 'NE1 4ST' }) as AnyCell;
  for (const ch of ['client_report', 'accountant_report', 'hmrc_pack'] as const) {
    assert.equal(redistributionCheck(r, [cell], ch).length, 1, `${ch} must breach: Terms section 4 prohibits redistribution without authorisation`);
  }
  assert.equal(redistributionCheck(r, [cell], 'internal').length, 0);
  assert.throws(() => record(r, { entity_id: 'J1', field_id: 'proprietor_name', source_id: 'HOMEDATA_ADDRESS', retrieval: ret(), value: 'x' }));
  assert.throws(() => record(r, { entity_id: 'J1', field_id: 'floor_area_m2', source_id: 'HOMEDATA_ADDRESS', retrieval: ret(), value: 1 }));
});

/* --- CIBSE plant lives (Phase 147, 24 September 2026) --------------- */

test('T-CB1 the CIBSE licence holds every unpublished term as a refusal, not a default', () => {
  const lic = LICENCES.find((l) => l.licence_id === 'CIBSE_KNOWLEDGE')!;
  assert.ok(lic, 'the CIBSE licence is registered');
  assert.equal(lic.cache_max_age_days, 0, 'null would assert "no limit", which CIBSE never published');
  assert.equal(lic.legal_review_required, true);
  assert.equal(lic.attribution_required, true);
  assert.match(lic.attribution_text ?? '', /^NOT PUBLISHED/);
  assert.match(lic.name, /sole use of the downloader/);
});

test('T-CB2 no channel is open, internal included: the only published grant is to one person', () => {
  const lic = LICENCES.find((l) => l.licence_id === 'CIBSE_KNOWLEDGE')!;
  for (const ch of ['client_report', 'accountant_report', 'hmrc_pack', 'internal'] as const) {
    assert.equal(lic.redistribution[ch], false, `${ch} is open without CIBSE's permission`);
  }
});

test('T-CB3 no source can mint a cell from CIBSE yet — the row is written with its loader', () => {
  assert.equal(SOURCES.some((s) => s.licence_id === 'CIBSE_KNOWLEDGE'), false,
    'a CIBSE source row would put an untiered, unswitched lookup on the research panel');
  const r = reg();
  assert.throws(() => record(r, { entity_id: 'J1', field_id: 'expected_life_years', source_id: 'CIBSE_PLANT_LIVES', retrieval: ret(), value: 20 }));
});

/* --- The planning endpoint (Phase 132, 14 September 2026) ---------- */

test('T-PL1 the PLANNING endpoint is PlanIt on its www host', () => {
  const src = SOURCES.find((s) => s.source_id === 'PLANNING')!;
  assert.ok(src, 'PLANNING is not registered');
  assert.ok((src.endpoint ?? '').startsWith('https://www.planit.org.uk/'), `PLANNING endpoint is ${String(src.endpoint)}`);
});

test('T-PL2 no endpoint anywhere in the register uses the bare planit.org.uk domain', () => {
  const bare = SOURCES.filter((s) => /\/\/planit\.org\.uk/.test(s.endpoint ?? ''));
  assert.deepEqual(bare.map((s) => s.source_id), []);
  // The file text too, so a commented or unregistered endpoint cannot hide it.
  const text = readFileSync(join(import.meta.dirname, 'caprebate-source-register.ts'), 'utf8');
  assert.equal(/\/\/planit\.org\.uk/.test(text), false, 'the bare planit.org.uk domain appears in the register file');
});

test('T-PL3 no text in the register contains partnerCode', () => {
  const text = readFileSync(join(import.meta.dirname, 'caprebate-source-register.ts'), 'utf8');
  assert.equal(/partnerCode/i.test(text), false, 'partnerCode appears in the register file');
  assert.equal(/partnerCode/i.test(JSON.stringify({ SOURCES, LICENCES })), false, 'partnerCode appears in the register data');
});

/* --- The care regulator's endpoint (Phase 132, 14 September 2026) --------
   TWO CQC HOSTS ARE REAL AND THEY ARE DIFFERENT APIS. api.cqc.org.uk/public/v1 is
   the older keyless Syndication API; api.service.cqc.org.uk is the one CQC's
   "Using CQC data" page now names, and the developer portal's own API list
   (api-portal.service.cqc.org.uk/developer/apis, read 14 September 2026) gives
   it the path public/v1 with "subscriptionRequired": true and the header
   Ocp-Apim-Subscription-Key. The register carries hosts, not paths, so the
   host is what is pinned here. The connector specification was corrected to
   the same host the same day. */

test('T-CQ1 the CQC endpoint is the current Syndication host, never the keyless legacy one', () => {
  const src = SOURCES.find((s) => s.source_id === 'CQC')!;
  assert.ok(src, 'CQC is not registered');
  assert.equal(src.endpoint, 'https://api.service.cqc.org.uk');
  const text = readFileSync(join(import.meta.dirname, 'caprebate-source-register.ts'), 'utf8');
  assert.equal(/\/\/api\.cqc\.org\.uk/.test(text), false, 'the legacy keyless CQC host appears in the register file');
});

/* --- BCIS, the cost source (Phase 151, 24 September 2026) ------------------
   Lakhbir chose BCIS over Spon's (Word answers 6 and 8). Its licence was read
   from BCIS Ltd's terms of sale, Annex One, and every term it does not publish
   is held as a refusal, as CIBSE's are. */

test('T-BC1 the BCIS licence holds every unpublished term as a refusal, not a default', () => {
  const lic = LICENCES.find((l) => l.licence_id === 'BCIS_COMMERCIAL')!;
  assert.ok(lic, 'the BCIS licence is registered');
  assert.equal(lic.legal_review_required, true);
  assert.equal(lic.attribution_required, true);
  assert.match(lic.attribution_text ?? '', /^NOT PUBLISHED/, 'BCIS publishes no credit wording');
  assert.match(lic.name, /Annex One/);
  assert.equal(lic.cache_max_age_days, 365, 'the published subscription term, not "no limit"');
});

test('T-BC2 only internal use is open, because only named licensed users are granted it', () => {
  const lic = LICENCES.find((l) => l.licence_id === 'BCIS_COMMERCIAL')!;
  for (const ch of ['client_report', 'accountant_report', 'hmrc_pack'] as const) {
    assert.equal(lic.redistribution[ch], false, `${ch} is open without a published BCIS grant`);
  }
  assert.equal(lic.redistribution.internal, true);
  assert.match(lic.notes, /question 218/);
});

test('T-BC3 BCIS stays a source with no endpoint: no API licence is published, so nothing is fetched', () => {
  const src = SOURCES.find((s) => s.source_id === 'BCIS')!;
  assert.equal(src.endpoint, null);
  assert.equal(src.licence_id, 'BCIS_COMMERCIAL');
});
