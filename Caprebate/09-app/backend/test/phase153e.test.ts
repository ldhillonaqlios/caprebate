/**
 * PHASE 153e, 4 October 2026 — the surveyor's workbench, built on our recommendation for the surveyor to check. The back
 * end's half. The cost model's (lines 7, 8, 10, 12) are in 04-phase-work/phase9/caprebate-cost-model.test.cjs (P153e-1
 * to -7); the blind test's (line 14) in 04-phase-work/phase3/caprebate-surveyor-crm.test.ts (D19, D19b); the engine's
 * supported-living switch (line 9) in the site harness, Suite AJ.
 *
 *   lines 1 to 3  questions 129 to 131 — the desk-first reading, the evidence level from the price paid, the coverage score
 *   line 4        question 133 — supported living's common parts from the floor plans, the 25% fallback labelled
 *   lines 5, 6    questions 134, 135 — ventilation and the seven items placed as test defaults; the client asked
 *   line 9        question 138 — ranges proposed from approved packs, supported living per trigger
 *   line 11       question 145 — the planning wording in every approved report
 *   line 13       question 148 — each space in a theatre suite counted
 *   line 15       question 150 — seen on site, or from documents
 *   line 16       question 203 — Homedata's floor-area estimate behind its switch, off; the five-home comparison
 *   line 17       (added by 153a) — chapter 15's VAT
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { packView, savePackValue, saveLine, setLineRemoved, savePackExtra, SHARED_FALLBACK_WORDS, type PackDeps } from '../src/web/survey-pack.ts';
import { coverageOf, deskFirstVerdict, deskFirstReading, DESK_FIRST_TEST, OPTIONAL_ITEMS, TIER_WORDS, type DeskFirstFacts } from '../src/web/desk-first.ts';
import { linesForSector, taxonomy, SUITE_ROWS, TEST_DEFAULT_WORDS } from '../src/web/pack-lines.ts';
import { checklistFor } from '../src/web/survey-checklist.ts';
import { roomsFor } from '../src/web/rooms.ts';
import { vatReading } from '../src/web/pack-vat.ts';
import { findingSeen, FINDING_LABELS } from '../src/web/finding-source.ts';
import { PLANNING_ASSUMPTION, REPORT_ASSUMPTIONS } from '../src/web/report-assumptions.ts';
import { homedataSlugs, dimensionsEstimate, compareEstimatedAreas, HOMEDATA_DIMENSIONS, ESTIMATED_AREA_LABEL, homedataCostPence } from '../src/connectors/homedata.ts';
import { proposeRanges, MIN_CLAIMS } from '../src/web/sector-ranges.ts';
import type { ChecklistView } from '../src/web/survey-evidence.ts';
import { actor } from './helpers.ts';

const T = '2026-10-04T09:00:00.000Z';
const SAM = actor('SURVEYING', 'u-e-sam');
let made: Awaited<ReturnType<typeof createApp>>;
let n = 0;
const ids = () => `e153-${(++n).toString().padStart(6, '0')}`;
const deps = (): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: ids });
const src = (f: string) => readFileSync(join(import.meta.dirname, '..', 'src', 'web', f), 'utf8');

/** Two jobs: j-gp (a GP purchase, the pack filled) and j-sl (supported living, nothing typed). */
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153e-')), now: () => T });
  const db = made.app.db;
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-e-sam', 'sam153e@example.invalid', 'sam153e@example.invalid', 'Sam Surveyor', 'SURVEYING', 'x', T, T]);
  for (const [b, sector, name] of [['b-gp', 'gp', 'Invented Surgery Limited'], ['b-sl', 'supported_living', 'Invented Homes Limited']] as const) {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, name, sector, 'SURVEY', T, 'COMPANY']);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [`p-${b}`, b, name, 'ZZ9 9ZZ', T]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [`as-${b}`, b, sector, T, 100, 200, T]);
    db.run('INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [`c-${b}`, `CR-2026-15${b === 'b-gp' ? '1' : '2'}9`, b, `p-${b}`, `as-${b}`, 'UNKNOWN', 'VALUATION', T, T]);
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      [`j-${b.slice(2)}`, b, `as-${b}`, 'u-e-sam', 'SEALED', null, T, `c-${b}`]);
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [`rr-epc-${b}`, b, 'EPC', `INVENTED-RRN-${b}`, JSON.stringify({ epc_total_floor_area_m2: 1000 }), T, `p-${b}`]);
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [`rr-title-${b}`, b, 'HMLR_TITLE', `ZZ${b}`, JSON.stringify({ title_number: `ZZ${b}`, price_paid: 1000000 }), T, `p-${b}`]);
  }
  // The GP pack made complete, as Phase 153a's test does: two lines kept, the rest taken out.
  const v0 = () => packView(deps(), SAM, 'j-gp');
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  for (const l of v0().lines) {
    if (l.element_id === 'LS-SR-001' || l.element_id === 'LS-MP-003' || l.removed) continue;
    ok(setLineRemoved(deps(), SAM, 'j-gp', { line: l.id, reason: 'Not in this building', seq: String(v0().seq) }, true));
  }
  ok(saveLine(deps(), SAM, 'j-gp', { line: 'LS-SR-001', qty: '1000', rate: '100', qpct: '100', pool: 'SR', reason: 'Measured', seq: String(v0().seq) }));
  ok(saveLine(deps(), SAM, 'j-gp', { line: 'LS-MP-003', qty: '1', rate: '50000', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(v0().seq) }));
  ok(savePackValue(deps(), SAM, 'j-gp', { field: 'land', value: '200000', reason: 'Local land sales', seq: String(v0().seq) }));
  ok(savePackValue(deps(), SAM, 'j-gp', { field: 'building_rate', value: '1000', reason: 'BCIS, rebased', seq: String(v0().seq) }));
});
after(() => made.close());

describe('lines 1 to 3 — questions 129 to 131: desk first, the evidence level, the coverage score', () => {
  const base: DeskFirstFacts = { sector: 'gp', price_pence: 20_000_000, not_a_purchase: true, documents_complete: true, election_unsettled: false, unknown_facts: [], coverage: null };

  test('desk-only only when the documents are all in and no warning sign fires; otherwise a site visit', () => {
    assert.equal(deskFirstVerdict(base).verdict, 'DESK_ONLY', 'a small GP fit-out with every document in');
    assert.equal(deskFirstVerdict({ ...base, documents_complete: false }).verdict, 'SITE_VISIT_NEEDED');
    assert.equal(deskFirstVerdict({ ...base, election_unsettled: true }).verdict, 'SITE_VISIT_NEEDED');
    assert.equal(deskFirstVerdict({ ...base, unknown_facts: ['grants exist'] }).verdict, 'SITE_VISIT_NEEDED');
    assert.equal(deskFirstVerdict({ ...base, sector: 'supported_living' }).verdict, 'SITE_VISIT_NEEDED', 'the homes/shared split');
  });

  test('N4: no price is the top value band, and that forces a visit', () => {
    const r = deskFirstVerdict({ ...base, price_pence: null });
    assert.equal(r.value_band, 4);
    assert.equal(r.verdict, 'SITE_VISIT_NEEDED');
  });

  test('the grid: a mid-sized purchase is a video job, and coverage under the pass mark turns it into a visit', () => {
    const mid = { ...base, price_pence: 50_000_000, not_a_purchase: false };
    const pass = { required: 10, covered: 9, percent: 90, pass_mark_percent: 80, passes: true, missing: [] };
    const fail = { ...pass, covered: 5, percent: 50, passes: false, missing: ['The boiler(s)'] };
    assert.equal(deskFirstVerdict({ ...mid, coverage: pass }).verdict, 'DESK_WITH_VIDEO');
    assert.equal(deskFirstVerdict({ ...mid, coverage: fail }).verdict, 'SITE_VISIT_NEEDED');
  });

  test('THE SURVEYOR SEES THE LEVEL ONLY: no price, no band, no score in what they are shown', () => {
    const r = deskFirstVerdict({ ...base, price_pence: 50_000_000, not_a_purchase: false });
    assert.ok(Object.values(TIER_WORDS).some((w) => r.level_words.startsWith(w)));
    assert.doesNotMatch(r.level_words, /£|\bV[1-4]\b|\bC[1-4]\b|score|band/i);
    assert.match(r.level_words, /test reading with placeholder limits/);
    assert.match(src('surveyor-pages.ts'), /How much evidence:<\/strong> \$\{r\.level_words\}/);
    assert.match(src('evidence-pages.ts'), /isSurveyor \? raw\(''\) : h`<details><summary>Why \(staff only/);
    assert.equal(DESK_FIRST_TEST.status, 'TEST_ONLY_PLACEHOLDERS');
  });

  test('the coverage score: required items in the script, photographed or marked not here; not safe is not covered; optional items do not count', () => {
    const items = checklistFor('gp').map((i) => ({ ...i, photos: [] as unknown[], mark: null as string | null, done: false }));
    const v = { items } as unknown as ChecklistView;
    const required = items.filter((i) => !OPTIONAL_ITEMS.includes(i.key)).length;
    assert.deepEqual([coverageOf(v).covered, coverageOf(v).required, coverageOf(v).passes], [0, required, false]);
    for (const i of items) { if (!OPTIONAL_ITEMS.includes(i.key)) i.photos.push({}); }
    const notSafe = items.find((i) => i.key === 'PLANT-BOILER')!;
    notSafe.photos = []; notSafe.mark = 'NOT_SAFE';
    const notHere = items.find((i) => i.key === 'OUT-PLANT')!;
    notHere.photos = []; notHere.mark = 'NOT_HERE';
    const c = coverageOf(v);
    assert.equal(c.covered, required - 1, '"not here" covers; "not safe" does not');
    assert.deepEqual(c.missing, ['The boiler(s)']);
    assert.equal(c.pass_mark_percent, 80);
  });

  test('on a real job: the reading works on the records, and the portal and chapter 2 show the score', () => {
    const r = deskFirstReading(made.app.db, 'j-gp');
    assert.ok(r);
    assert.equal(r?.value_band, 3, '£1,000,000 is the third placeholder band');
    assert.match(src('evidence-pages.ts'), /Covered: \$\{coverageWords\(videoCoverage\(db, j\.id\)\)\}/);
    assert.match(src('evidence-pages.ts'), /<strong>Anything you skipped<\/strong>/);
  });
});

describe('line 4 — question 133: supported living\'s common parts from the floor plans', () => {
  test('no floor plans: the flat 25% of the floor area, labelled as the fallback; measured: the surveyor\'s figure', () => {
    const before = packView(deps(), SAM, 'j-sl').lines.find((l) => l.element_id === 'LS-SL-001');
    assert.ok(before);
    assert.equal(before?.qty_milli.value, 250_000, '25% of 1,000 m²');
    assert.equal(before?.qty_milli.source?.text, SHARED_FALLBACK_WORDS);
    const seq = String(packView(deps(), SAM, 'j-sl').seq);
    assert.equal(savePackExtra(deps(), SAM, 'j-sl', { field: 'shared_area', value: '180', reason: 'Corridors, lounge and staff rooms on the floor plans', seq }).ok, true);
    const after = packView(deps(), SAM, 'j-sl').lines.find((l) => l.element_id === 'LS-SL-001');
    assert.equal(after?.qty_milli.value, 180_000);
    assert.match(after?.qty_milli.source?.text ?? '', /floor plans/);
  });
});

describe('lines 5, 6 and 13 — questions 134, 135 and 148: test-default placements, the client asked, each suite space counted', () => {
  const line = (sector: string, id: string) => linesForSector(sector).find((l) => l.element_id === id);
  test('ventilation by the typed rule: dental and GP treatment ventilation special rate; theatre and isolation flagged for the surveyor', () => {
    assert.equal(line('dental', 'LS-DEN-015')?.pool, 'SR');
    assert.equal(line('gp', 'LS-GP-008')?.pool, 'SR');
    for (const id of ['LS-PH-002', 'LS-PH-003']) {
      assert.equal(line('private_hospital', id)?.pool, null, `${id} must be the surveyor's call`);
      assert.equal(line('private_hospital', id)?.status, 'CONTESTED');
      assert.match(line('private_hospital', id)?.authority ?? '', /function, specification and purpose/);
    }
    assert.match(line('dental', 'LS-DEN-015')?.authority ?? '', new RegExp(TEST_DEFAULT_WORDS.replace(/[()]/g, '\\$&')));
  });
  test('the seven: emergency lighting and kitchen extract inside their systems; flooring stays with the building; drug storage and standby power their own plant', () => {
    assert.match(line('gp', 'LS-SR-001')?.authority ?? '', /emergency lighting/);
    assert.match(line('gp', 'LS-SR-004')?.authority ?? '', /kitchen extract/);
    assert.equal(line('gp', 'LS-MP-013')?.qpct_bp, 0);
    assert.ok(line('care_homes', 'TD-CH-DRUGS'));
    assert.ok(line('private_hospital', 'TD-PH-DRUGS'));
    assert.equal(line('private_hospital', 'TD-PH-STANDBY')?.pool, 'MP');
    assert.equal(linesForSector('gp').length, 37, 'the GP pack is unchanged in size');
    assert.equal(taxonomy().length, 103, 'the fixture list itself is unchanged');
  });
  test('the client is asked what a ventilation system is for and how it is specified', () => {
    assert.match(checklistFor('gp').find((i) => i.key === 'PLANT-AIR')?.what ?? '', /what it is for[\s\S]*HTM 03-01/);
  });
  test('a theatre suite: each space is a room, and each theatre row is counted from the spaces that carry it', () => {
    const ph = roomsFor('private_hospital')?.rooms.map((r) => r.room_id) ?? [];
    for (const r of ['PH-R2', 'PH-R2A', 'PH-R2B', 'PH-R2C', 'PH-R2D']) assert.ok(ph.includes(r), r);
    const pendants = line('private_hospital', 'LS-PH-005')?.qty_from;
    assert.deepEqual(pendants?.kind === 'ROOMS' ? pendants.rooms : null, ['PH-R2', 'PH-R2A', 'PH-R2C', 'PH-R2D']);
    const ucv = line('private_hospital', 'LS-PH-002')?.qty_from;
    assert.deepEqual(ucv?.kind === 'ROOMS' ? ucv.rooms : null, ['PH-R2'], 'ultra-clean ventilation stays with the theatre');
    assert.deepEqual(Object.keys(SUITE_ROWS).sort(), ['LS-PH-002', 'LS-PH-004', 'LS-PH-005', 'LS-PH-006']);
  });
});

describe('line 9 — question 138: ranges proposed from approved packs', () => {
  test('fewer than five approved claims: nothing proposed; five or more: the range they span, beside today\'s; a pack with no price left out', () => {
    const db = made.app.db;
    db.run("INSERT INTO businesses (id,name,sector,stage,created_at) VALUES ('b-r','Range Dental Limited','dental','SURVEY',?)", [T]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-b-r', 'b-r', 'dental', T, 100, 200, T]);
    const add = (i: number, price: number | null, q: number) => {
      db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [`j-r${i}`, 'b-r', 'as-b-r', 'u-e-sam', 'SEALED', null, T, null]);
      db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?,?,?,?,?)', [`pk-r${i}`, `j-r${i}`, null, T, 'u-e-sam']);
      db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [`ap-r${i}`, `pk-r${i}`, 1, 1, 0, JSON.stringify({ job: { id: `j-r${i}`, sector: 'dental' }, inputs: { price_paid_pence: { value: price } }, sums: { qualifying_pence: q } }), String(i).padStart(64, 'a'), 'u-e-sam', T]);
    };
    for (let i = 0; i < 4; i++) add(i, 100_000_00, (18 + i) * 1_000_00);
    let p = proposeRanges(db).proposals.find((x) => x.sector === 'dental');
    assert.equal(p?.proposed, null);
    assert.match(p?.words ?? '', /5 are needed/);
    add(4, 100_000_00, 26 * 1_000_00);
    add(5, null, 1);
    const r = proposeRanges(db);
    p = r.proposals.find((x) => x.sector === 'dental');
    assert.equal(MIN_CLAIMS, 5);
    assert.deepEqual(p?.proposed, [0.18, 0.26]);
    assert.deepEqual(p?.current, [0.15, 0.3]);
    assert.ok(r.left_out >= 1, 'the pack with no price is left out and counted');
  });
});

describe('line 11 — question 145: the planning wording', () => {
  test('it is in every version approved from now, and in the surveyor\'s template; a version approved before shows none', () => {
    assert.deepEqual([...REPORT_ASSUMPTIONS], [PLANNING_ASSUMPTION]);
    assert.match(PLANNING_ASSUMPTION, /^We assume the property’s current use is lawful\./);
    assert.match(src('pack-approve.ts'), /assumptions: \[\.\.\.REPORT_ASSUMPTIONS\]/);
    assert.match(src('survey-report.ts'), /assumptions \?\? \[\]/);
    const tpl = readFileSync(join(import.meta.dirname, '..', '..', '..', '04-phase-work', 'phase9', 'surveyor-valuation-report-template-v2.md'), 'utf8');
    assert.ok(tpl.includes(PLANNING_ASSUMPTION), 'the template and the report say the same words');
  });
});

describe('line 15 — question 150: seen on site, or from documents', () => {
  const sv = { kind: 'SURVEYOR' as const, text: 'Sam' };
  const dr = { kind: 'DRAFT' as const, text: 'list' };
  const l = (s: typeof sv | typeof dr) => ({ qty_milli: { value: 1, source: s }, rate_pence: { value: 1, source: dr }, qpct_bp: { value: 1, source: dr } });
  test('seen on site only on a site visit where the surveyor set the line; everything else from documents, photos named', () => {
    assert.equal(findingSeen('SITE_VISIT', l(sv), 0), FINDING_LABELS.SITE);
    assert.equal(findingSeen('SITE_VISIT', l(dr), 0), FINDING_LABELS.DOCUMENTS, 'a visit alone does not make our draft seen');
    assert.equal(findingSeen('LIVE_VIDEO', l(sv), 3), 'From documents and the client’s photos', 'a video is not a visit');
    assert.equal(findingSeen(null, l(sv), 0), FINDING_LABELS.DOCUMENTS, 'N4: no basis recorded is not seen on site');
  });
  test('the label is on the pack line and in the approved report', () => {
    assert.match(src('survey-pack-pages.ts'), /findingSeen\(basis, l, evidence\.get/);
    assert.match(src('pack-approve.ts'), /seen: findingSeen\(basis, l,/);
    assert.match(src('survey-report.ts'), /r\.seen === null \? '' : ` · \$\{r\.seen\}`/);
  });
});

describe('line 16 — question 203: Homedata\'s floor-area estimate', () => {
  test('off as shipped: the dimensions item is not asked for and the cost is unchanged; on, it is, for a penny', () => {
    assert.equal(HOMEDATA_DIMENSIONS.enabled, false);
    assert.ok(!homedataSlugs().includes('dimensions'));
    const on = homedataSlugs({ enabled: true, question: '' });
    assert.ok(on.includes('dimensions'));
    assert.equal(homedataCostPence(on) - homedataCostPence(homedataSlugs()), 1);
  });
  test('an estimate is always labelled as one; nothing readable is nothing (N4)', () => {
    assert.deepEqual(dimensionsEstimate({ floor_area_m2: 1234.56 }), { floor_area_m2: 1234.6, label: ESTIMATED_AREA_LABEL });
    assert.equal(dimensionsEstimate({ floor_area_m2: 0 }), null);
    assert.equal(dimensionsEstimate('big'), null);
    assert.equal(ESTIMATED_AREA_LABEL, 'estimated from the building’s shape');
  });
  test('the five-home comparison: each gap against the known area, and five are needed before it says anything', () => {
    const rows = [['A', 1000, 1080], ['B', 1200, 1150], ['C', 900, 990], ['D', 1500, 1500], ['E', 800, null]] as const;
    const c = compareEstimatedAreas(rows.map(([home, known_m2, estimated_m2]) => ({ home, known_m2, estimated_m2 })));
    assert.equal(c.compared, 4);
    assert.equal(c.enough, false, 'one home has no estimate, so four are compared');
    assert.equal(c.worst_gap_percent, 10);
    assert.deepEqual(c.rows.map((r) => r.gap_percent), [8, -4.2, 10, 0, null]);
  });
});

describe('line 17 — chapter 15\'s VAT', () => {
  const pos = (code: number | null) => ({ value: code, source: code === null ? null : { kind: 'SURVEYOR' as const, text: 'Sam' } });
  const amt = (p: number | null) => ({ value: p, source: p === null ? null : { kind: 'SURVEYOR' as const, text: 'Sam' } });
  test('only exempt counts; reclaimed counts nothing; partly exempt waits for the tax adviser; not known and not recorded count nothing (N4)', () => {
    assert.equal(vatReading(pos(1), amt(20_000_00)).counted_pence, 20_000_00);
    assert.equal(vatReading(pos(0), amt(20_000_00)).counted_pence, 0);
    assert.equal(vatReading(pos(2), amt(20_000_00)).counted_pence, 0);
    assert.match(vatReading(pos(2), amt(20_000_00)).words, /tax adviser/);
    assert.equal(vatReading(pos(3), amt(20_000_00)).counted_pence, 0);
    assert.equal(vatReading(pos(null), amt(20_000_00)).position, 'NOT_KNOWN');
    assert.equal(vatReading(pos(1), amt(null)).counted_pence, 0, 'exempt with no amount adds nothing');
  });
  test('in the pack: exempt VAT is added to the price before it is shared out, so the spend that qualifies rises; partly exempt changes nothing', () => {
    const before = packView(deps(), SAM, 'j-gp');
    assert.equal(before.vat.position, 'NOT_KNOWN');
    const q0 = before.sums.qualifying_pence;
    assert.ok(q0 !== null && q0 > 0, 'the GP pack is complete');
    const seq = () => String(packView(deps(), SAM, 'j-gp').seq);
    assert.equal(savePackExtra(deps(), SAM, 'j-gp', { field: 'vat', value: '200000', reason: 'VAT on the purchase', seq: seq() }).ok, true);
    assert.equal(packView(deps(), SAM, 'j-gp').sums.qualifying_pence, q0, 'an amount with no position adds nothing');
    assert.equal(savePackExtra(deps(), SAM, 'j-gp', { field: 'vat_position', value: 'PARTLY_EXEMPT', reason: 'Some NHS, some private', seq: seq() }).ok, true);
    assert.equal(packView(deps(), SAM, 'j-gp').sums.qualifying_pence, q0);
    assert.equal(savePackExtra(deps(), SAM, 'j-gp', { field: 'vat_position', value: 'EXEMPT', reason: 'Their VAT return reclaims none', seq: seq() }).ok, true);
    const v = packView(deps(), SAM, 'j-gp');
    assert.equal(v.vat.counted_pence, 200_000_00);
    assert.equal(v.inputs.price_paid_pence.value, 1_000_000_00, 'the price shown stays the price paid');
    assert.ok((v.sums.qualifying_pence ?? 0) > (q0 ?? 0), 'the spend that qualifies rises');
    assert.equal(savePackExtra(deps(), SAM, 'j-gp', { field: 'vat_position', value: 'MAYBE', reason: 'x', seq: seq() }).ok, false);
    assert.throws(() => made.app.db.run("INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at) SELECT 'x', id, 999, NULL, 'vat_position', 7, NULL, 'u-e-sam', 'x', ? FROM survey_packs LIMIT 1", [T]), /constraint/i);
  });
});
