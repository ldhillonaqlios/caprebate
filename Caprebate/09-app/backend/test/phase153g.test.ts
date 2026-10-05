/**
 * PHASE 153g, 4 October 2026 — the survey pack's other ten chapters (5, 8, 11, 14, 16, 17, 18, 19, 20 and 22).
 *
 * Each chapter reads the pack, the claim, the registers we hold, or the surveyor's own words, and says "not on file",
 * "not written yet" or "not worked out yet" for anything missing (N4). The surveyor's words are kept with a reason under
 * their name, never edited. The approved version keeps the chapters, and the client's report shows them, page and PDF.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { packView, saveLine, savePackValue, setLineRemoved, type PackDeps } from '../src/web/survey-pack.ts';
import { savePackWords, WORD_FIELD_NAMES, WORD_FIELDS } from '../src/web/pack-words.ts';
import { packSheet, packSheets, SHEET_CHAPTERS } from '../src/web/pack-sheets.ts';
import { CHAPTERS, chaptersToRead } from '../src/web/pack-chapters.ts';
import { sheetChapter } from '../src/web/survey-pack-pages.ts';
import { snapshotOf } from '../src/web/pack-approve.ts';
import { legalView } from '../src/web/pack-legal.ts';
import { reportHtml, reportModel, reportPdf } from '../src/web/survey-report.ts';
import { raw } from '../src/web/html.ts';
import { actor } from './helpers.ts';

const T = '2026-10-04T12:00:00.000Z';
const SAM = actor('SURVEYING', 'u-g-sam');
const ADMIN = actor('ADMIN', 'u-g-admin');
let made: Awaited<ReturnType<typeof createApp>>;
let k = 0;
const deps = (): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `g153-${String(++k)}` });
const pageDeps = () => ({ app: made.app, newId: () => `g153p-${String(++k)}`, nav: () => raw(''), stamp: (x: string) => x, problem: () => 'handled' as const });
const seq = (job: string) => String(packView(deps(), SAM, job).seq);
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
const sheet = (job: string, n: number) => packSheet(made.app.db, packView(deps(), SAM, job), n)!;
const row = (job: string, n: number, label: string) => sheet(job, n).rows.find((r) => r.label === label);

function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  return [...s.matchAll(/<([0-9a-f]+)> Tj/g)].map((m) => Buffer.from(m[1] ?? '', 'hex').toString('latin1')).join('\n').replace(/\x92/g, '’');
}

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153g-')), now: () => T });
  const db = made.app.db;
  for (const [id, role, name] of [['u-g-sam', 'SURVEYING', 'Sam Surveyor'], ['u-g-admin', 'ADMIN', 'Ann Admin']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, 'x', T, T]);
  }
  for (const [b, sector] of [['b-gdn', 'dental'], ['b-gsl', 'supported_living']] as const) {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Invented ${b} Limited`, sector, 'SURVEY', T, 'COMPANY']);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [`p-${b}`, b, '7 Invented Way', 'ZZ9 9ZZ', T]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [`as-${b}`, b, sector, T, 100, 200, T]);
    db.run('INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [`c-${b}`, `CR-2026-16${b === 'b-gdn' ? '1' : '2'}9`, b, `p-${b}`, `as-${b}`, 'UNKNOWN', 'VALUATION', T, T]);
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      [`j-${b.slice(2)}`, b, `as-${b}`, 'u-g-sam', 'SEALED', null, T, `c-${b}`]);
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [`rr-t-${b}`, b, 'HMLR_TITLE', `ZZ${b}`, JSON.stringify({ title_number: 'ZZ123456', price_paid: 1000000 }), T, `p-${b}`]);
  }
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-e-gdn', 'b-gdn', 'EPC', 'RRN-INVENTED', JSON.stringify({ epc_total_floor_area_m2: 640, epc_construction_age_band: '1983-1990', epc_property_type: 'Health' }), T, 'p-b-gdn']);
  // The dental pack: two lines kept and set, every other taken out, so the sums can complete.
  const v0 = () => packView(deps(), SAM, 'j-gdn');
  for (const l of v0().lines) {
    if (l.element_id === 'LS-SR-001' || l.element_id === 'LS-DEN-015' || l.removed) continue;
    ok(setLineRemoved(deps(), SAM, 'j-gdn', { line: l.id, reason: 'Not in this building', seq: String(v0().seq) }, true));
  }
});
after(() => made.close());

describe('Phase 153g — the other ten chapters', () => {
  test('every chapter is now built, so all 22 are opened before approving', () => {
    assert.deepEqual(CHAPTERS.filter((c) => !c.built).map((c) => c.n), []);
    assert.deepEqual(chaptersToRead(), Array.from({ length: 22 }, (_, i) => i + 1));
    assert.deepEqual(packSheets(made.app.db, packView(deps(), SAM, 'j-gdn')).map((s) => s.n), [...SHEET_CHAPTERS]);
  });

  test('chapter 5 reads the title and the energy certificate; what nobody holds or wrote says so in words (N4)', () => {
    assert.equal(row('j-gdn', 5, 'Title number')?.value, 'ZZ123456');
    assert.equal(row('j-gdn', 5, 'Floor area on the energy certificate')?.value, '640 m²');
    assert.equal(row('j-gdn', 5, 'Age band on the energy certificate')?.value, '1983-1990');
    assert.deepEqual([row('j-gsl', 5, 'Floor area on the energy certificate')?.value, row('j-gsl', 5, 'Floor area on the energy certificate')?.missing], [null, 'not on file']);
    assert.deepEqual([row('j-gdn', 5, 'Construction type')?.value, row('j-gdn', 5, 'Construction type')?.missing], [null, 'not written yet']);
    assert.equal(row('j-gdn', 5, 'Floor plans held')?.missing, 'none held');
    assert.equal(sheet('j-gdn', 5).rows.some((r) => /estimated/.test(r.label)), false, 'no Homedata estimate unless one was fetched');
    assert.ok(sheet('j-gsl', 5).rows.some((r) => r.label === 'Shared areas, from the floor plans'), 'supported living shows its shared areas');
  });

  test('the surveyor’s words: a reason needed, kept under their name, cleared by an empty box, never edited; only the assigned surveyor writes', () => {
    const w = (words: string, reason = 'From the drawings') => savePackWords(deps(), SAM, 'j-gdn', { field: 'construction_type', words, reason, seq: seq('j-gdn') });
    assert.match(JSON.stringify(savePackWords(deps(), SAM, 'j-gdn', { field: 'construction_type', words: 'Steel frame', reason: ' ', seq: seq('j-gdn') })), /Say why/);
    assert.match(JSON.stringify(savePackWords(deps(), SAM, 'j-gdn', { field: 'not_a_field', words: 'x', reason: 'r', seq: seq('j-gdn') })), /not one of the pack’s questions/);
    ok(w('Steel frame, brick infill'));
    assert.deepEqual([row('j-gdn', 5, 'Construction type')?.value, row('j-gdn', 5, 'Construction type')?.by], ['Steel frame, brick infill', 'Sam Surveyor']);
    assert.match(JSON.stringify(w('Steel frame, brick infill')), /already what it says/);
    assert.match(JSON.stringify(savePackWords(deps(), SAM, 'j-gdn', { field: 'build_year', words: '', reason: 'r', seq: seq('j-gdn') })), /nothing to clear/);
    assert.match(JSON.stringify(savePackWords(deps(), SAM, 'j-gdn', { field: 'build_year', words: '1988', reason: 'r', seq: '0' })), /changed since you opened it/);
    assert.throws(() => savePackWords(deps(), ADMIN, 'j-gdn', { field: 'build_year', words: '1988', reason: 'r', seq: seq('j-gdn') }));
    assert.throws(() => made.app.db.run('UPDATE survey_pack_words SET words = ?', ['x']), /never edited/);
    assert.throws(() => made.app.db.run('DELETE FROM survey_pack_words'), /never deleted/);
    ok(w(''));
    assert.equal(row('j-gdn', 5, 'Construction type')?.value, null, 'cleared');
    ok(w('Steel frame, brick infill'));
    for (const f of WORD_FIELD_NAMES) assert.ok(SHEET_CHAPTERS.includes(WORD_FIELDS[f].chapter), f);
  });

  test('chapter 8 does not apply to a dental practice, and says why; for supported living, the shared areas and the method asked', () => {
    const dn = sheet('j-gdn', 8), sl = sheet('j-gsl', 8);
    assert.deepEqual([dn.applies, dn.rows.length, dn.words.length], [false, 0, 0]);
    assert.match(dn.not_applies_words ?? '', /Only for supported living and care homes/);
    assert.equal(sl.applies, true);
    assert.match(sl.rows.find((r) => r.label === 'Shared areas, from the floor plans')?.missing ?? '', /25% fallback/);
    assert.deepEqual(sl.words, ['dwelling_method', 'dwelling_segregation']);
  });

  test('chapter 14 works the percentages out only when every line is complete; chapter 17 the structure left over, and the 2018 date from chapter 5', () => {
    assert.deepEqual([row('j-gdn', 14, 'Special rate items (2)')?.value, row('j-gdn', 14, 'Special rate items (2)')?.missing], [null, 'not worked out yet']);
    ok(saveLine(deps(), SAM, 'j-gdn', { line: 'LS-SR-001', qty: '640', rate: '100', qpct: '100', pool: 'SR', reason: 'Measured', seq: seq('j-gdn') }));
    ok(saveLine(deps(), SAM, 'j-gdn', { line: 'LS-DEN-015', qty: '1', rate: '20000', qpct: '50', pool: 'SR', reason: 'Counted', seq: seq('j-gdn') }));
    ok(savePackValue(deps(), SAM, 'j-gdn', { field: 'land', value: '200000', reason: 'Local land sales', seq: seq('j-gdn') }));
    ok(savePackValue(deps(), SAM, 'j-gdn', { field: 'gia', value: '640', reason: 'Measured', seq: seq('j-gdn') }));
    ok(savePackValue(deps(), SAM, 'j-gdn', { field: 'building_rate', value: '1000', reason: 'BCIS, rebased', seq: seq('j-gdn') }));
    // 64,000 + 20,000 cost; 64,000 + 10,000 qualify: 74,000 / 84,000.
    assert.equal(row('j-gdn', 14, 'Special rate items (2)')?.value, '88.1%');
    assert.equal(row('j-gdn', 14, 'Main pool items (0)')?.value, null, 'no main pool item: nothing to work out');
    const left = row('j-gdn', 14, 'The building’s structure (what is left after the plant)')?.value;
    assert.ok(left !== null && left !== undefined && /^£/.test(left), String(left));
    assert.equal(row('j-gdn', 17, 'What is left after the plant and the land')?.value, left);
    assert.match(row('j-gdn', 17, 'Built or renovated after 29 October 2018')?.missing ?? '', /no year in chapter 5/);
    ok(savePackWords(deps(), SAM, 'j-gdn', { field: 'build_year', words: 'Built 1988, refitted 2021', reason: 'Deeds', seq: seq('j-gdn') }));
    assert.equal(row('j-gdn', 17, 'Built or renovated after 29 October 2018')?.value, 'Yes, from the latest year in chapter 5', 'the refit counts');
    ok(savePackWords(deps(), SAM, 'j-gdn', { field: 'build_year', words: 'Built 1988', reason: 'Deeds', seq: seq('j-gdn') }));
    assert.equal(row('j-gdn', 17, 'Built or renovated after 29 October 2018')?.value, 'No, from the latest year in chapter 5');
    ok(savePackWords(deps(), SAM, 'j-gdn', { field: 'build_year', words: 'Refitted in 2018', reason: 'Deeds', seq: seq('j-gdn') }));
    assert.match(row('j-gdn', 17, 'Built or renovated after 29 October 2018')?.missing ?? '', /2018 needs the exact date/, 'N4: 2018 itself is not known');
  });

  test('chapter 18 reads the claimant type; chapter 19 lists every judgement item with our default labelled; chapter 20 says when it does not apply (N4)', () => {
    assert.equal(row('j-gdn', 18, 'A company, for land remediation relief')?.value, 'Yes');
    const v = packView(deps(), SAM, 'j-gdn');
    const judged = v.lines.filter((l) => !l.removed && /JUDGEMENT|CONTESTED/.test(l.template?.status ?? '')).map((l) => l.label);
    assert.deepEqual(sheet('j-gdn', 19).items.map((i) => i.label), judged);
    assert.match(row('j-gdn', 19, 'This sector’s main question')?.value ?? '', /fixture or a chattel/);
    assert.match(row('j-gdn', 19, 'Range from approved packs')?.missing ?? '', /five are needed/);
    const r20 = sheet('j-gdn', 20);
    assert.deepEqual([r20.applies, r20.rows.length], [false, 0]);
    assert.match(r20.not_applies_words ?? '', /This job is of a kind not recorded/);
  });

  test('chapter 22 counts what was seen on site, and asks the four questions without drafting an answer', () => {
    const s = sheet('j-gdn', 22);
    assert.equal(s.rows.find((r) => r.label === 'Items seen on site')?.value, '0 of 2', 'no site visit recorded: nothing is seen on site');
    assert.deepEqual(s.words, ['narrative_description', 'narrative_condition', 'narrative_departures', 'narrative_opinion']);
    for (const f of s.words) assert.equal(s.rows.find((r) => r.label === WORD_FIELDS[f].label)?.value, null);
  });

  test('the page: each row says where it came from; the surveyor gets a form per question, Admin reads without one', () => {
    const v = packView(deps(), SAM, 'j-gdn');
    const page = String(sheetChapter(pageDeps(), v, 5));
    assert.match(page, /Title number<\/th><td>ZZ123456 <span class="pk-src pk-ev">Land Registry<\/span>/);
    assert.match(page, /Steel frame, brick infill <span class="pk-src pk-sv">Sam Surveyor<\/span>/);
    assert.equal((page.match(/action="\/staff\/survey\/j-gdn\/pack\/words"/g) ?? []).length, 3);
    const adminPage = String(sheetChapter(pageDeps(), packView(deps(), ADMIN, 'j-gdn'), 5));
    assert.equal(/\/pack\/words/.test(adminPage), false);
  });

  test('the approved version keeps the chapters, and the client’s report shows them on the page and in the PDF; a version from before shows none', () => {
    const v = packView(deps(), SAM, 'j-gdn');
    const lv = legalView(deps(), SAM, 'j-gdn');
    const snap = snapshotOf(v, lv, { version: 1, at: T, by: { id: 'u-g-sam', name: 'Sam Surveyor' }, details: { rics_number: '1234567', firm: null, at: T } }, { db: made.app.db });
    assert.deepEqual(snap.chapters.map((c) => c.n), [...SHEET_CHAPTERS]);
    const m = reportModel(snap, 'f'.repeat(64));
    const html = String(reportHtml(m, { pdf: null }));
    assert.match(html, /<span>06<\/span>The surveyor’s chapters/);
    assert.match(html, /Construction type<\/th><td>Steel frame, brick infill<\/td>/);
    assert.match(html, /Disposal value<\/th><td>not written yet<\/td>/);
    const pdf = pdfText(reportPdf(m).bytes);
    assert.match(pdf, /The surveyor’s chapters/);
    assert.match(pdf, /Construction type: Steel frame, brick infill/);
    assert.equal(reportPdf(m).unshown, 0, 'a character the PDF could not show');
    const { chapters: _gone, ...before } = snap;
    const old = reportModel(before as typeof snap, 'f'.repeat(64));
    assert.deepEqual(old.chapters, []);
    assert.equal(/The surveyor’s chapters/.test(String(reportHtml(old, { pdf: null }))), false);
  });
});
