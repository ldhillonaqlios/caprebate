/**
 * PHASE 153a, 4 OCTOBER 2026 — A GRANT MATCHED TO THE FIXTURE LIST, THE SURVEY PACK'S CHAPTER 15, AND TWO MORE GRANT
 * CHECKS AT VALUATION. (F-15's remainder; Phase 153b lines 12 and 13, done with it.)
 *
 * Proven here, on a real claim and a real survey job:
 *   · the claim record keeps the fixture-list rows a grant paid for (migration 078): every id checked against the list,
 *     rows only on a grant marked matched, the words filled from the rows' names, the rows never edited or deleted;
 *   · the survey pack takes the claim's grants off its sums — every total, the report's figures, the approval record —
 *     in equal share as it ships, and off the matched items only with the switch on; a withdrawn grant is gone; an
 *     amount not known gives no total; a job on no claim reads no grant;
 *   · chapter 15 is built and must be opened before approval, and says what each grant does;
 *   · the gate out of valuation: no grant split in equal share without its papers or the tax adviser's view (counted
 *     only from the tax adviser), and the client's check with whoever paid — both met with no grant; N4 on each.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import * as F from '../src/web/claim-facts.ts';
import { packView, savePackValue, saveLine, setLineRemoved, type PackDeps } from '../src/web/survey-pack.ts';
import { CHAPTERS, chaptersToRead } from '../src/web/pack-chapters.ts';
import { grantProviderNeed, grantSplitNeed, shippedGrantSwitches, GRANT_PAPERS_TYPE } from '../src/web/grant-checks.ts';
import { snapshotOf } from '../src/web/pack-approve.ts';
import { reportModel } from '../src/web/survey-report.ts';
import { legalView } from '../src/web/pack-legal.ts';
import { plainNeed } from '../src/web/next-step.ts';
import { actor } from './helpers.ts';

const T = '2026-10-04T09:00:00.000Z';
const SAM = actor('SURVEYING', 'u-g-sam');
const SALES = actor('SALES', 'u-g-sales');
const ADMIN = actor('ADMIN', 'u-g-admin');
let made: Awaited<ReturnType<typeof createApp>>;
let n = 0;
const ids = () => `g153a-${(++n).toString().padStart(6, '0')}`;
const deps = (extra: Partial<PackDeps> = {}): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: ids, ...extra });
const ON: PackDeps['grantSwitches'] = { element_trace: true, connected_no_reduction: false };

/** Claims: c-1 (job j-1, the pack), c-2 (the gate), and job j-3 on no claim. */
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153a-')), now: () => T });
  const db = made.app.db;
  for (const [id, role, name] of [['u-g-sam', 'SURVEYING', 'Sam Surveyor'], ['u-g-sales', 'SALES', 'Sid Sales'], ['u-g-admin', 'ADMIN', 'Ada Admin']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, 'x', T, T]);
  }
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-g', 'Grant Practice Limited', 'gp', 'SURVEY', T, 'COMPANY']);
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-g', 'b-g', 'Grant Practice', 'ZZ9 9ZZ', T]);
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-g', 'b-g', 'gp', T, 100, 200, T]);
  for (const [c, ref] of [['c-1', 'CR-2026-1531'], ['c-2', 'CR-2026-1532']] as const) {
    db.run('INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [c, ref, 'b-g', 'p-g', 'as-g', 'UNKNOWN', 'VALUATION', T, T]);
  }
  for (const [job, claim] of [['j-1', 'c-1'], ['j-3', null]] as const) {
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      [job, 'b-g', 'as-g', 'u-g-sam', 'SEALED', null, T, claim]);
  }
  // The evidence: a floor area of 1,000 m² and a price of £1,000,000.
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-epc-g', 'b-g', 'EPC', 'INVENTED-RRN-g', JSON.stringify({ epc_total_floor_area_m2: 1000 }), T, 'p-g']);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-title-g', 'b-g', 'HMLR_TITLE', 'ZZg', JSON.stringify({ title_number: 'ZZg', price_paid: 1000000 }), T, 'p-g']);
  for (const job of ['j-1', 'j-3']) fill(job);
});
after(() => made.close());

/**
 * The pack made complete: the electrics (LS-SR-001, 1,000 m² × £100, all qualifying, special rate) and the fire alarm
 * (LS-MP-003, 1 × £50,000, all qualifying, main pool) kept; everything else taken out; land £200,000; rate £1,000 a m².
 * The building £800,000; rebuild £1,000,000; £150,000 of it qualifies, so £120,000: main £40,000, special £80,000.
 */
function fill(job: string): void {
  const v0 = () => packView(deps(), SAM, job);
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  for (const l of v0().lines) {
    if (l.element_id === 'LS-SR-001' || l.element_id === 'LS-MP-003' || l.removed) continue;
    ok(setLineRemoved(deps(), SAM, job, { line: l.id, reason: 'Not in this building', seq: String(v0().seq) }, true));
  }
  ok(saveLine(deps(), SAM, job, { line: 'LS-SR-001', qty: '1000', rate: '100', qpct: '100', pool: 'SR', reason: 'Measured', seq: String(v0().seq) }));
  ok(saveLine(deps(), SAM, job, { line: 'LS-MP-003', qty: '1', rate: '50000', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(v0().seq) }));
  ok(savePackValue(deps(), SAM, job, { field: 'land', value: '200000', reason: 'Local land sales', seq: String(v0().seq) }));
  ok(savePackValue(deps(), SAM, job, { field: 'building_rate', value: '1000', reason: 'BCIS, rebased', seq: String(v0().seq) }));
}

const record = (claim: string, fields: F.Fields) => F.recordGrant(deps(), SALES, claim, fields);
const NHS = (extra: F.Fields = {}): F.Fields => ({ kind: 'GRANT', payer_class: 'nhs', amount: '40000', amount_basis: 'agreement', traced: 'YES', traced_elements: 'the new rooms', source_id: 'CLIENT_DOC', ...extra });
const figures = (v: ReturnType<typeof packView>) => [v.sums.qualifying_pence, v.sums.main_pool_pence, v.sums.special_pool_pence];

describe('the claim record keeps the fixture-list rows a grant paid for', () => {
  test('every id is checked against the list; rows only on a grant marked matched; words filled from the rows', () => {
    const bad = record('c-2', NHS({ element_ids: 'LS-MP-003, NOT-A-ROW-001' }));
    assert.equal(bad.ok, false);
    assert.equal(bad.ok ? '' : bad.field, 'element_ids');
    const unmatched = record('c-2', NHS({ traced: 'NO', element_ids: 'LS-MP-003' }));
    assert.equal(unmatched.ok ? '' : unmatched.field, 'traced');
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claim_grants')?.n;
    const g = record('c-2', NHS({ traced_elements: '', element_ids: 'LS-MP-003 LS-MP-003,LS-SR-001' }));
    assert.equal(g.ok, true, JSON.stringify(g));
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claim_grants')?.n, (before ?? 0) + 1);
    const id = g.ok ? g.id : '';
    assert.deepEqual(made.app.db.all<{ e: string }>('SELECT element_id AS e FROM claim_grant_elements WHERE grant_id = ? ORDER BY e', [id]).map((r) => r.e), ['LS-MP-003', 'LS-SR-001']);
    const words = made.app.db.get<{ t: string }>('SELECT traced_elements AS t FROM claim_grants WHERE id = ?', [id])?.t ?? '';
    assert.match(words, /Fire alarm and detection system \(LS-MP-003\)/);
    const panel = F.factsPanel(made.app.db, SALES, 'c-2', T);
    const line = panel.grants.lines.find((l) => l.id === id);
    assert.deepEqual(line?.element_ids, ['LS-SR-001', 'LS-MP-003'], 'in the fixture list’s order');
    assert.equal(line?.element_names.length, 2);
    F.withdrawGrant(deps(), SALES, 'c-2', id, 'recorded for the test only');
  });
  test('a grant’s rows are never edited or deleted; a row not on the list is refused by the database too', () => {
    const g = record('c-2', NHS({ element_ids: 'LS-MP-003' }));
    const id = g.ok ? g.id : '';
    assert.throws(() => made.app.db.run("UPDATE claim_grant_elements SET element_id = 'LS-SR-001' WHERE grant_id = ?", [id]), /never changed/);
    assert.throws(() => made.app.db.run('DELETE FROM claim_grant_elements WHERE grant_id = ?', [id]), /never deleted/);
    assert.throws(() => made.app.db.run("INSERT INTO claim_grant_elements (grant_id, element_id) VALUES (?, 'x; drop')", [id]), /CHECK/);
    F.withdrawGrant(deps(), SALES, 'c-2', id, 'recorded for the test only');
  });
  test('the step that matches a grant offers the sector’s rows and the shared ones, whatever their pool', () => {
    const gp = F.grantElementChoices('gp').map((e) => e.id);
    assert.ok(gp.includes('LS-MP-003') && gp.includes('LS-GP-001'));
    assert.ok(!gp.some((x) => /^LS-(DEN|CH|SL|PH)-/.test(x)), 'another sector’s rows were offered');
    const none = F.grantElementChoices(null).map((e) => e.id);
    assert.ok(none.includes('LS-MP-003') && !none.some((x) => /^LS-(GP|DEN|CH|SL|PH)-/.test(x)));
  });
});

describe('the survey pack takes the claim’s grants off — chapter 15', () => {
  test('with no grant on the claim the pack is exactly what it was: £120,000', () => {
    const v = packView(deps(), SAM, 'j-1');
    assert.deepEqual(figures(v), [120_000_00, 40_000_00, 80_000_00]);
    assert.equal(v.grants.list.length, 0);
    assert.equal(v.grants.reading.reduction_pence, 0);
  });
  test('switch OFF, as it ships: £40,000 of NHS money matched to the fire alarm still comes off in equal share — 4%: £115,200', () => {
    const g = record('c-1', NHS({ element_ids: 'LS-MP-003' }));
    assert.equal(g.ok, true);
    assert.equal(shippedGrantSwitches().element_trace, false);
    const v = packView(deps(), SAM, 'j-1');
    assert.deepEqual(figures(v), [115_200_00, 38_400_00, 76_800_00]);
    assert.deepEqual([v.grants.reading.before.qualifying_pence, v.grants.reading.reduction_pence], [120_000_00, 4_800_00]);
    assert.equal(v.grants.reading.effects[0]?.route, 'EQUAL_SHARE');
  });
  test('switch ON: the same grant comes off the fire alarm alone — all £40,000 of it, from the main pool: £80,000', () => {
    const v = packView(deps({ grantSwitches: ON }), SAM, 'j-1');
    assert.deepEqual(figures(v), [80_000_00, 0, 80_000_00]);
    assert.deepEqual(v.grants.reading.effects[0]?.line_ids, ['LS-MP-003']);
  });
  test('switch ON, N4: a grant matched only in words is untraced, so it keeps the equal share', () => {
    const id = packView(deps(), SAM, 'j-1').grants.list[0]?.id ?? '';
    F.withdrawGrant(deps(), SALES, 'c-1', id, 'recorded again, in words only');
    assert.equal(record('c-1', NHS({ traced_elements: 'the fire alarm' })).ok, true, 'matched in words only');
    assert.deepEqual(figures(packView(deps({ grantSwitches: ON }), SAM, 'j-1')), [115_200_00, 38_400_00, 76_800_00]);
  });
  test('a withdrawn grant is gone; an amount not known gives no total, and says where to put it right', () => {
    for (const g of packView(deps(), SAM, 'j-1').grants.list) F.withdrawGrant(deps(), SALES, 'c-1', g.id, 'cleared for the next case');
    assert.deepEqual(figures(packView(deps(), SAM, 'j-1')), [120_000_00, 40_000_00, 80_000_00]);
    assert.equal(record('c-1', NHS({ amount: '', amount_basis: 'UNKNOWN' })).ok, true);
    const v = packView(deps(), SAM, 'j-1');
    assert.deepEqual([...figures(v), v.sums.complete], [null, null, null, false]);
    assert.deepEqual(v.sums.needed.map((x) => x.where), ['GRANT']);
    for (const g of v.grants.list) F.withdrawGrant(deps(), SALES, 'c-1', g.id, 'cleared for the next case');
  });
  test('insurance money after damage is shown, and not taken off', () => {
    assert.equal(record('c-1', NHS({ payer_class: 'insurer', kind: 'CONTRIBUTION' })).ok, true);
    const v = packView(deps(), SAM, 'j-1');
    assert.deepEqual(figures(v), [120_000_00, 40_000_00, 80_000_00]);
    assert.equal(v.grants.reading.effects[0]?.route, 'NOT_TAKEN_OFF');
    for (const g of v.grants.list) F.withdrawGrant(deps(), SALES, 'c-1', g.id, 'cleared for the next case');
  });
  test('a survey job on no claim reads no grant', () => {
    const v = packView(deps(), SAM, 'j-3');
    assert.deepEqual([v.grants.claim_id, v.grants.list.length, v.sums.qualifying_pence], [null, 0, 120_000_00]);
  });
  test('the approval record and the report carry the figure after grants, and say what came off', () => {
    assert.equal(record('c-1', NHS()).ok, true);
    const v = packView(deps(), SAM, 'j-1');
    const snap = snapshotOf(v, legalView(deps(), SAM, 'j-1'), { version: 1, at: T, by: { id: 'u-g-sam', name: 'Sam Surveyor' }, details: { rics_number: '1234567', firm: null, at: T } }, { db: made.app.db });
    assert.deepEqual([snap.sums.qualifying_pence, snap.grants.before_qualifying_pence, snap.grants.reduction_pence], [115_200_00, 120_000_00, 4_800_00]);
    const m = reportModel(snap, 'f'.repeat(64));
    assert.ok(m.flow.some((f) => f.label === 'Less grants' && f.value === '– £4,800'));
    assert.match(m.sum_words.join(' '), /£4,800 comes off, in equal share across every item: £115,200 qualifies\./);
    for (const g of v.grants.list) F.withdrawGrant(deps(), SALES, 'c-1', g.id, 'cleared for the next case');
  });
  test('chapter 15 is built, and must be opened before approval', () => {
    assert.equal(CHAPTERS.find((c) => c.n === 15)?.built, true);
    assert.ok(chaptersToRead().includes(15));
  });
});

describe('the gate out of valuation: two more grant checks (N4 on each)', () => {
  const papers = (claim: string) => {
    const db = made.app.db;
    db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [`ld-${claim}`, 'b-g', GRANT_PAPERS_TYPE, 1, 'u-g-sales', T]);
    db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, strip_recorded_at, quarantine_discharged_at, created_at, logical_document_id, version_no, type_code) ' +
      "VALUES (?, ?, ?, ?, 'STORED', ?, ?, ?, ?, 1, ?)", [`d-${claim}`, 'b-g', 'u-g-sales', 'grant.pdf', T, T, T, `ld-${claim}`, GRANT_PAPERS_TYPE]);
    db.run('INSERT INTO document_links (id, logical_document_id, claim_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)', [`k-${claim}`, `ld-${claim}`, claim, 'u-g-sales', T]);
  };
  const fact = (key: string, value: string | null, source = 'CLIENT_ANSWER') => {
    const r = F.recordFact(deps(), ADMIN, 'c-2', { fact_key: key, answer: value === null ? 'UNKNOWN' : 'VALUE', value, source_id: source, note: null });
    assert.equal(r.ok, true, JSON.stringify(r));
  };
  test('with no grant on the claim, both are met: nothing to split, nobody to check with', () => {
    for (const g of F.packGrantsFor(made.app.db, 'c-2')) F.withdrawGrant(deps(), SALES, 'c-2', g.id, 'cleared');
    assert.deepEqual([grantSplitNeed(made.app.db, { id: 'c-2' }).met, grantProviderNeed(made.app.db, { id: 'c-2' }).met], [true, true]);
  });
  test('the client’s check with whoever paid: absent, not known and No all refuse; Yes passes; insurance needs none', () => {
    assert.equal(record('c-2', NHS({ payer_class: 'insurer', kind: 'CONTRIBUTION' })).ok, true);
    assert.equal(grantProviderNeed(made.app.db, { id: 'c-2' }).met, true, 'insurance money asked for a check with the payer');
    assert.equal(record('c-2', NHS()).ok, true);
    assert.equal(grantProviderNeed(made.app.db, { id: 'c-2' }).met, false, 'ABSENT passed');
    fact('GRANT_PROVIDER_CHECKED', null);
    assert.equal(grantProviderNeed(made.app.db, { id: 'c-2' }).met, false, 'UNKNOWN passed');
    fact('GRANT_PROVIDER_CHECKED', 'NO');
    assert.equal(grantProviderNeed(made.app.db, { id: 'c-2' }).met, false, 'NO passed');
    fact('GRANT_PROVIDER_CHECKED', 'YES');
    assert.equal(grantProviderNeed(made.app.db, { id: 'c-2' }).met, true);
  });
  test('the split, while every grant is in equal share: absent, not known, No, and a Yes not from the tax adviser all refuse', () => {
    const met = () => grantSplitNeed(made.app.db, { id: 'c-2' }).met;
    assert.equal(met(), false, 'ABSENT passed');
    fact('GRANT_SPLIT_ADVISER_VIEW', null, 'CTA');
    assert.equal(met(), false, 'UNKNOWN passed');
    fact('GRANT_SPLIT_ADVISER_VIEW', 'NO', 'CTA');
    assert.equal(met(), false, 'NO passed');
    fact('GRANT_SPLIT_ADVISER_VIEW', 'YES', 'CLIENT_ANSWER');
    assert.equal(met(), false, 'a view not from the tax adviser passed');
    assert.match(grantSplitNeed(made.app.db, { id: 'c-2' }).why, /not from the tax adviser/);
    fact('GRANT_SPLIT_ADVISER_VIEW', 'YES', 'CTA');
    assert.equal(met(), true);
  });
  test('the grant papers received on the claim meet it without the adviser’s view', () => {
    fact('GRANT_SPLIT_ADVISER_VIEW', 'NO', 'CTA');
    assert.equal(grantSplitNeed(made.app.db, { id: 'c-2' }).met, false);
    papers('c-2');
    assert.equal(grantSplitNeed(made.app.db, { id: 'c-2' }).met, true);
  });
  test('switch ON, a grant matched to rows is not in equal share, so it needs neither; one matched in words still does', () => {
    const c3 = 'c-1';
    for (const g of F.packGrantsFor(made.app.db, c3)) F.withdrawGrant(deps(), SALES, c3, g.id, 'cleared');
    assert.equal(record(c3, NHS({ element_ids: 'LS-MP-003' })).ok, true);
    assert.equal(grantSplitNeed(made.app.db, { id: c3 }, { element_trace: true, connected_no_reduction: false }).met, true);
    assert.equal(grantSplitNeed(made.app.db, { id: c3 }).met, false, 'off, as it ships, a matched grant is still in equal share');
    assert.equal(record(c3, NHS({ traced_elements: 'the heating' })).ok, true);
    assert.equal(grantSplitNeed(made.app.db, { id: c3 }, { element_trace: true, connected_no_reduction: false }).met, false);
  });
  test('each need has a plain reading and a fix on the claim page', () => {
    for (const w of [grantSplitNeed(made.app.db, { id: 'c-1' }).what, grantProviderNeed(made.app.db, { id: 'c-1' }).what]) {
      assert.equal(plainNeed(w).fix?.href, '#claim-grants');
    }
  });
});
