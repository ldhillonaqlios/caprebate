/**
 * PHASE 157a, 6 October 2026 — THE COST MODEL IN THE SURVEY PACK (src/web/pack-cost-model.ts; migration 095).
 *
 * The cost model's four test-system pieces from Phase 153e, read for one pack and shown to the surveyor: the index dates
 * and factor in chapter 11, preliminaries by job size and the insurance check in chapter 14, and the phase3 module's
 * £/m² review flag in chapter 22. Each is a test placeholder: it changes no figure, every cost-model gate stays off in
 * the shipped model, and none of it reaches the approved version or the client's report. The index reads the real BCIS
 * table where one is imported, the placeholder only in the test system, and otherwise nothing (N4: never a guess).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { packView, savePackExtra, savePackValue, setLineRemoved, parsePackDate, type PackDeps } from '../src/web/survey-pack.ts';
import { packSheet } from '../src/web/pack-sheets.ts';
import { sheetChapter } from '../src/web/survey-pack-pages.ts';
import { snapshotOf } from '../src/web/pack-approve.ts';
import { legalView } from '../src/web/pack-legal.ts';
import { reportHtml, reportModel } from '../src/web/survey-report.ts';
import { costModelTestSystem, indexReading, insuranceReading, prelimsReading, rateFlagReading, COST_MODEL_TEST_OPT_IN } from '../src/web/pack-cost-model.ts';
import { BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 } from '../../../04-phase-work/phase3/caprebate-surveyor-crm.ts';
import { raw } from '../src/web/html.ts';
import { actor } from './helpers.ts';

const CM = createRequire(import.meta.url)('../../../04-phase-work/phase9/caprebate-cost-model.cjs') as {
  CB_P9_GATES: Record<string, boolean>; CB_BCIS_INDEX: { loaded: boolean };
};

const T = '2026-10-06T12:00:00.000Z';
const SAM = actor('SURVEYING', 'u-a-sam');
const ADMIN = actor('ADMIN', 'u-a-admin');
const TMP = mkdtempSync(join(tmpdir(), 'cb-157a-'));
/** No BCIS file, not the test website, no opt-in: the shipped position. */
const PLAIN = Object.freeze({ CAPREBATE_BCIS_INDEX_FILE: join(TMP, 'no-such-index.json') });
/** The test system, by the opt-in, with no BCIS file. */
const TEST = Object.freeze({ ...PLAIN, [COST_MODEL_TEST_OPT_IN]: '1' });
let made: Awaited<ReturnType<typeof createApp>>;
let k = 0;
const deps = (): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `a157-${String(++k)}` });
const pageDeps = () => ({ app: made.app, newId: () => `a157p-${String(++k)}`, nav: () => raw(''), stamp: (x: string) => x, problem: () => 'handled' as const });
const view = (job = 'j-den') => packView(deps(), SAM, job);
const seq = (job = 'j-den') => String(view(job).seq);
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
const extra = (field: string, value: string, job = 'j-den') => savePackExtra(deps(), SAM, job, { field, value, reason: 'From the documents', seq: seq(job) });
const rowOf = (n: number, label: string, env: Record<string, string> = PLAIN, job = 'j-den') => packSheet(made.app.db, view(job), n, env)?.rows.find((r) => r.label === label);

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157a-docs-')), now: () => T });
  const db = made.app.db;
  for (const [id, role, name] of [['u-a-sam', 'SURVEYING', 'Sam Surveyor'], ['u-a-admin', 'ADMIN', 'Ann Admin']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, 'x', T, T]);
  }
  // The pack under test (dental), and seven others for the £/m² comparison: five dental, one GP, and the pack's own.
  const jobs: [string, string][] = [['den', 'dental'], ['d1', 'dental'], ['d2', 'dental'], ['d3', 'dental'], ['d4', 'dental'], ['d5', 'dental'], ['gp1', 'gp']];
  for (const [j, sector] of jobs) {
    const b = `b-${j}`;
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Invented ${j} Limited`, sector, 'SURVEY', T, 'COMPANY']);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)',
      [`p-${j}`, b, '7 Invented Way', 'ZZ9 9ZZ', T, j === 'den' ? '2020-06-15' : null]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [`as-${j}`, b, sector, T, 100, 200, T]);
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      [`j-${j}`, b, `as-${j}`, 'u-a-sam', 'SEALED', null, T, null]);
  }
  // The dental pack: one line kept, every other taken out; a floor area and a whole-building rate, so the rebuild cost is
  // 640 m² at £2,000 = £1,280,000.
  for (const l of view().lines) {
    if (l.element_id === 'LS-SR-001' || l.removed) continue;
    ok(setLineRemoved(deps(), SAM, 'j-den', { line: l.id, reason: 'Not in this building', seq: seq() }, true));
  }
  ok(savePackValue(deps(), SAM, 'j-den', { field: 'gia', value: '640', reason: 'Measured', seq: seq() }));
  ok(savePackValue(deps(), SAM, 'j-den', { field: 'building_rate', value: '2000', reason: 'BCIS, dental', seq: seq(), rate_basis: 'BCIS', rate_ref: 'Dental surgeries, mean', rate_priced_at: '2026-09-01' }));
});
after(() => made.close());

describe('Phase 157a — the five values the pack now keeps (migration 095)', () => {
  test('a date is kept as YYYYMMDD; a date that does not exist, or outside 1900 to 2100, is refused', () => {
    assert.deepEqual(parsePackDate('2026-01-15'), { ok: true, value: 20260115 });
    for (const bad of ['2026-02-30', '15/01/2026', '1899-12-31', '2101-01-01', '']) assert.equal(parsePackDate(bad).ok, false, bad);
  });

  test('each is the surveyor’s, with a reason; nothing to clear and the same value again are refused', () => {
    assert.equal(extra('valuation_date', '').ok, false, 'nothing recorded yet');
    ok(extra('valuation_date', '2026-01-15'));
    assert.equal(view().cost.valuation_date.value, 20260115);
    assert.equal(view().cost.valuation_date.source?.by_name, 'Sam Surveyor');
    assert.equal(extra('valuation_date', '2026-01-15').ok, false, 'already the value');
    assert.equal(extra('insurance', '0').ok, false, 'an insurance figure of nothing');
    assert.equal(extra('insurance_includes', '8').ok, false);
    assert.equal(extra('rebuild_includes', 'all').ok, false);
    assert.equal(savePackExtra(deps(), SAM, 'j-den', { field: 'valuation_date', value: '2026-01-16', reason: '', seq: seq() }).ok, false, 'no reason');
  });

  test('the table itself refuses a bad date or a bad answer, whatever the code does', () => {
    const pack = made.app.db.get<{ id: string }>("SELECT id FROM survey_packs WHERE job_id = 'j-den'")?.id ?? '';
    const put = (field: string, value: number) => () => made.app.db.run(
      'INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [`x-${field}-${String(value)}`, pack, 9000 + value % 1000, null, field, value, null, 'u-a-sam', 'x', T]);
    assert.throws(put('valuation_date', 1234), /CHECK/);
    assert.throws(put('insurance_includes', 8), /CHECK/);
    assert.throws(put('no_such_field', 1), /CHECK/);
  });

  test('every cost-model gate is still off in the shipped model, and its BCIS table is still an empty stub', () => {
    assert.equal(CM.CB_P9_GATES['leg_e2_prelims_banded_by_job_size'], false);
    assert.equal(CM.CB_P9_GATES['leg_e2_oncosts_by_price_source'], false);
    assert.equal(CM.CB_BCIS_INDEX.loaded, false);
  });
});

describe('chapter 11 — the index dates (Word question 147)', () => {
  test('the test system is the test website or the opt-in, never this copy as it stands', () => {
    assert.equal(costModelTestSystem(PLAIN), false);
    assert.equal(costModelTestSystem(TEST), true);
    assert.equal(costModelTestSystem({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' }), true);
  });

  test('outside the test system, with no BCIS index imported: not worked out, and why — never the placeholder', () => {
    const r = indexReading(made.app.db, view(), PLAIN);
    assert.equal(r.factor, null);
    assert.equal(r.kind, null);
    assert.match(r.words, /^Not worked out: no BCIS index has been imported/);
  });

  test('in the test system: the placeholder table, named as invented, and the factor from purchase to valuation date', () => {
    const r = indexReading(made.app.db, view(), TEST);
    assert.equal(r.kind, 'PLACEHOLDER');
    assert.equal(r.purchase, '2020-06-15');
    assert.equal(r.valuation, '2026-01-15');
    // The placeholder's points: 315 from January 2020, 396 from January 2026.
    assert.deepEqual([r.at_purchase, r.at_valuation, r.factor], [315, 396, Math.round((315 / 396) * 10000) / 10000]);
    assert.match(r.words, /a test index with made-up figures, not BCIS, used on the test site only/);
    assert.equal(rowOf(11, 'Purchase date', TEST)?.value, '2020-06-15');
    assert.equal(rowOf(11, 'Valuation date (the date the rebuild cost is priced at)', TEST)?.value, '2026-01-15');
  });

  test('a BCIS table that has been imported is used before the placeholder, in the test system too', () => {
    const file = join(TMP, 'bcis.json');
    writeFileSync(file, JSON.stringify({ loaded: true, source: 'BCIS invented test file', licence: 'test', verified_at: T,
      points: [['2020-01', 100], ['2026-01', 125]] }));
    const r = indexReading(made.app.db, view(), { ...TEST, CAPREBATE_BCIS_INDEX_FILE: file });
    assert.equal(r.kind, 'BCIS');
    assert.equal(r.factor, 0.8);
    assert.match(r.words, /from the BCIS index \(BCIS invented test file\)/);
  });

  test('N4: no valuation date, no purchase date, or a date outside the table is not worked out, and says which', () => {
    assert.match(indexReading(made.app.db, view('j-d1'), TEST).words, /purchase date is not on the property record/);
    const noDate = { ...view(), cost: { ...view().cost, valuation_date: { value: null, source: null } } };
    assert.match(indexReading(made.app.db, noDate, TEST).words, /give the valuation date/);
    const early = { ...view(), cost: { ...view().cost, valuation_date: { value: 20100101, source: null } } };
    assert.match(indexReading(made.app.db, early, TEST).words, /never extrapolated/);
  });
});

describe('chapter 14 — preliminaries and the insurance check (Word questions 136 and 137)', () => {
  test('preliminaries: the shipped flat 18% always; the job-size band only in the test system, for this job’s rebuild cost', () => {
    assert.equal(view().sums.rebuild_pence, 128_000_000);
    const plain = prelimsReading(view(), PLAIN);
    assert.deepEqual([plain.shipped_rate, plain.band_rate], [0.18, null]);
    assert.match(plain.words, /shown in the test system only/);
    const t = prelimsReading(view(), TEST);
    assert.equal(t.band_rate, 0.12, '£1.28m falls in the £1m to £5m placeholder band');
    assert.match(t.words, /a job of £1,280,000 would use 12%/);
  });

  test('no insurance figure: nothing to check, and the chapter asks for it', () => {
    assert.equal(insuranceReading(view(), TEST).verdict, null);
    assert.equal(rowOf(14, 'Insurance rebuild figure', TEST)?.value, null);
  });

  test('N4: with the figure but no date, or no answer on what a figure includes, it is NOT COMPARABLE — never a pass', () => {
    ok(extra('insurance', '1300000'));
    const noDate = insuranceReading(view(), TEST);
    assert.equal(noDate.verdict, 'NOT_COMPARABLE');
    assert.match(noDate.words, /date of the insurance figure is not given/);
    ok(extra('insurance_date', '2026-01-15'));
    const noIncludes = insuranceReading(view(), TEST);
    assert.equal(noIncludes.verdict, 'NOT_COMPARABLE');
    assert.match(noIncludes.words, /whether demolition is included is not known/);
  });

  test('like for like, the same date: within 10% supports our figure; further apart does not', () => {
    ok(extra('insurance_includes', '0'));
    ok(extra('rebuild_includes', '0'));
    const near = insuranceReading(view(), TEST);
    assert.equal(near.verdict, 'SUPPORTS');
    assert.match(near.words, /^Supports our figure: within 10%/);
    ok(extra('insurance', '1600000'));
    assert.equal(insuranceReading(view(), TEST).verdict, 'DOES_NOT_SUPPORT');
  });

  test('a figure that includes fees where ours does not is adjusted first (the model’s flat 15%), and the step is shown', () => {
    ok(extra('insurance', '1480000'));
    ok(extra('insurance_includes', '2'));
    const r = insuranceReading(view(), TEST);
    assert.equal(r.verdict, 'SUPPORTS', '£1.28m plus 15% is £1.472m, against £1.48m');
    assert.match(r.words, /fees added to our figure/);
  });

  test('N4: two dates that are both unknown are never read as the same date', () => {
    const v = view();
    const none = { value: null, source: null };
    const r = insuranceReading({ ...v, cost: { ...v.cost, valuation_date: none, insurance_date: none } }, TEST);
    assert.equal(r.verdict, 'NOT_COMPARABLE');
    assert.match(r.words, /the valuation date is not given/);
  });

  test('different dates: brought together by the index in the test system; outside it, with no index, not comparable', () => {
    ok(extra('insurance_date', '2025-01-15'));
    const t = insuranceReading(view(), TEST);
    assert.match(t.words, /insurance figure brought from 2025-01-15 to 2026-01-15/);
    const p = insuranceReading(view(), PLAIN);
    assert.equal(p.verdict, 'NOT_COMPARABLE');
    assert.match(p.words, /no BCIS index has been imported/);
  });
});

// PHASE 159f (C20): every rate is compared at one day, so each version and this pack carry their pricing day.
describe('chapter 22 — the £/m² review flag (Word question 149)', () => {
  const approve = (job: string, rate: number, sector: string) => {
    const db = made.app.db;
    db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?,?,?,?,?)', [`pk-${job}`, `j-${job}`, `p-${job}`, T, 'u-a-sam']);
    db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [`ap-${job}`, `pk-${job}`, 1, 1, 0, JSON.stringify({ job: { id: `j-${job}`, sector }, inputs: { building_rate_pence: { value: rate } }, pricing: { priced_at: '2026-09-01' } }), 'a'.repeat(64), 'u-a-sam', T]);
  };

  test('the limit is the phase3 module’s own, 10%', () => assert.equal(BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2, 0.10));

  test('fewer than five approved packs in the sector: no comparison, and it says how many are needed', () => {
    approve('d1', 190_000, 'dental');
    approve('d2', 200_000, 'dental');
    approve('gp1', 400_000, 'gp');
    const r = rateFlagReading(made.app.db, view());
    assert.equal(r.verdict, null);
    assert.equal(r.packs, 2, 'the GP pack is another sector');
    assert.match(r.words, /5 are needed/);
  });

  test('five: within 10% of the middle rate is within the test limit; further is flagged for review, never a fail', () => {
    approve('d3', 210_000, 'dental');
    approve('d4', 170_000, 'dental');
    approve('d5', 230_000, 'dental');
    const within = rateFlagReading(made.app.db, view());
    assert.deepEqual([within.packs, within.median_pence, within.verdict], [5, 200_000, 'WITHIN_TEST_LIMIT']);
    ok(savePackValue(deps(), SAM, 'j-den', { field: 'building_rate', value: '2300', reason: 'A dearer specification', seq: seq(), rate_basis: 'BCIS', rate_ref: 'Dental surgeries, mean', rate_priced_at: '2026-09-01' }));
    const far = rateFlagReading(made.app.db, view());
    assert.equal(far.verdict, 'FLAG_FOR_REVIEW');
    assert.match(far.words, /15% apart\. More than 10% \(a test limit, for the surveyor to confirm: Word question 149\), so it is flagged for your review\. It is not a fail\./);
    assert.match(rowOf(22, 'Whole-building rate against approved packs')?.value ?? '', /flagged for your review/);
  });
});

describe('what reaches the version, the report and the page', () => {
  test('the readings are the surveyor’s to see: none of them is in the approved version or the client’s report', () => {
    const v = view();
    const snap = snapshotOf(v, legalView(deps(), SAM, 'j-den'), { version: 1, at: T, by: { id: 'u-a-sam', name: 'Sam Surveyor' }, details: { rics_number: '1234567', firm: null, at: T } }, { db: made.app.db });
    const labels = snap.chapters.flatMap((c) => c.rows.map((r) => r.label));
    for (const l of ['Purchase date', 'Index factor, purchase date to valuation date', 'Site costs (preliminaries) by job size',
      'Insurance figure against our rebuild cost', 'Whole-building rate against approved packs', 'Past-claim limits']) {
      assert.equal(labels.includes(l), false, l);
    }
    assert.equal(labels.includes('Comparables relied on'), true, 'the surveyor’s own words still are');
    const html = String(reportHtml(reportModel(snap, 'f'.repeat(64)), { pdf: null }));
    const hit = /.{0,60}(made-up figures|Insurance figure against|Site costs \(preliminaries\)|Whole-building rate against|Index factor|Past-claim limits).{0,60}/.exec(html);
    assert.equal(hit, null, hit?.[0] ?? '');
  });

  test('chapter 11 gives the surveyor the valuation date box and chapter 14 the insurance boxes; Admin reads, without them', () => {
    const p11 = String(sheetChapter(pageDeps(), view(), 11));
    assert.match(p11, /name="field" value="valuation_date"/);
    assert.match(p11, /type="date" id="c-valuation_date-v" name="value" value="2026-01-15"/);
    const p14 = String(sheetChapter(pageDeps(), view(), 14));
    for (const f of ['insurance', 'insurance_date', 'insurance_includes', 'rebuild_includes']) assert.match(p14, new RegExp(`name="field" value="${f}"`), f);
    assert.match(p14, /test placeholders for you to check/);
    const admin = String(sheetChapter(pageDeps(), packView(deps(), ADMIN, 'j-den'), 14));
    assert.equal(/value="insurance"/.test(admin), false);
    assert.match(admin, /test placeholders for you to check/);
  });
});
