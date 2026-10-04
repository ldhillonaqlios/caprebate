/**
 * 2 OCTOBER 2026 — THE SURVEY PACK'S APPROVAL (src/web/pack-approve.ts, chapter 23 of the pack).
 *
 * Lakhbir: "whole pack needs to be read through then approve button ungreys like someone reading and accepting T&C";
 * "when the surveyor signs it should be a single CTA approve click"; "this is one thing that cannot fail".
 *
 * Proven here:
 *   · the button is grey, and each thing still missing is said in words, until every one of them is in: a property,
 *     complete sums, a legal check that allows it, every built chapter opened, a RICS number, a locked estimate;
 *   · only the assigned surveyor's opening of a chapter counts; a legal answer someone else gives afterwards sends
 *     them back to chapter 7;
 *   · one click approves: version 1 is kept with its fingerprint (SHA-256 of exactly what is kept), and the figures go
 *     to the job through the existing commitment, so the claim reads them as before;
 *   · a second click, a page drawn before a change, and two clicks at once each give one version and no more;
 *   · a change and a new click give version 2, through the existing amendment; version 1 stays as it was approved;
 *   · an approved version can never be edited or deleted, and a copy altered in the database is shown as altered;
 *   · who may approve: the assigned surveyor only. Admin and Sales may look; nobody else may.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { choosePackProperty, packView, savePackValue, saveLine, setLineRemoved } from '../src/web/survey-pack.ts';
import { answerLegal, legalView } from '../src/web/pack-legal.ts';
import { approvePack, approvedVersion, canonical, fingerprintOf, readiness, saveDetails, DECLARATION } from '../src/web/pack-approve.ts';
import { chaptersToRead } from '../src/web/pack-chapters.ts';
import { setBasis } from '../src/web/survey-evidence.ts';
import { actor } from './helpers.ts';

const T = '2026-10-02T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-ap-1';
const JOB_NO_ESTIMATE = 'job-ap-2';
/** A company with two sites, so the surveyor must say which one. */
const JOB_TWO = 'job-ap-3';
const SAM = actor('SURVEYING', 'u-ap-sam');

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-ap-')), now: () => T });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, role, name] of [['u-ap-sam', 'SURVEYING', 'Sam Surveyor'], ['u-ap-ola', 'SURVEYING', 'Ola Other'], ['u-ap-admin', 'ADMIN', 'Ada Admin'],
    ['u-ap-sales', 'SALES', 'Sid Sales'], ['u-ap-ro', 'READ_ONLY', 'Rita Reader'], ['u-ap-acc', 'ACCOUNTING', 'Al Accounts']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T, T]);
  }
  for (const [b, job, estimate] of [['b-ap-1', JOB, true], ['b-ap-2', JOB_NO_ESTIMATE, false], ['b-ap-3', JOB_TWO, true]] as const) {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Approve Practice ${b} Limited`, 'gp', 'SURVEY', T, 'COMPANY']);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [`p-${b}`, b, 'Approve Practice', 'ZZ9 9ZZ', T]);
    if (job === JOB_TWO) db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [`p-${b}-x`, b, 'Approve Practice — the branch', 'ZZ9 9ZY', T]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [`as-${b}`, b, 'gp', T, 100, 200, T]);
    if (estimate) {
      db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [`e-${b}`, `as-${b}`, b, 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T, 'test-not-a-real-hash']);
    }
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at) VALUES (?,?,?,?,?,?,?)', [job, b, `as-${b}`, 'u-ap-sam', 'SEALED', null, T]);
    // The evidence: an energy certificate (640.5 m²) and the title register's price (£1,050,000).
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [`rr-epc-${b}`, b, 'EPC', `INVENTED-RRN-${b}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, `p-${b}`]);
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [`rr-title-${b}`, b, 'HMLR_TITLE', `ZZ${b}`, JSON.stringify({ title_number: `ZZ${b}`, price_paid: 1050000 }), T, `p-${b}`]);
  }
  for (const w of ['u-ap-sam', 'u-ap-ola', 'u-ap-admin', 'u-ap-sales', 'u-ap-ro', 'u-ap-acc']) {
    await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() });
  }
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  return { status: r.status, body: await r.text(), location: r.headers.get('location') };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `ap-${(++n).toString().padStart(6, '0')}` });
const view = (job = JOB) => packView(deps(), actor('ADMIN'), job);
const lview = (job = JOB) => legalView(deps(), actor('ADMIN'), job);
const ready = (job = JOB) => readiness(deps(), SAM, job, packView(deps(), SAM, job), legalView(deps(), SAM, job));
const P = (job = JOB) => `/staff/survey/${job}/pack`;
const keys = (job = JOB) => ready(job).blockers.map((b) => b.key);
const approveForm = (job = JOB) => ({ seq: String(view(job).seq), legal_seq: String(lview(job).seq), ch: '23' });

/** The sums made complete, as a surveyor would: two lines kept and priced, the rest taken out, the land and rate typed. */
function fill(job = JOB): void {
  const keep = view(job).lines.slice(0, 2).map((l) => l.id);
  for (const l of view(job).lines) {
    if (keep.includes(l.id) || l.removed) continue;
    const r = setLineRemoved(deps(), SAM, job, { line: l.id, reason: 'Not in this building', seq: String(view(job).seq) }, true);
    assert.equal(r.ok, true, JSON.stringify(r));
  }
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  ok(saveLine(deps(), SAM, job, { line: keep[0]!, qty: '10', rate: '2000', qpct: '100', pool: 'SR', reason: 'Counted on the walkthrough', seq: String(view(job).seq) }));
  ok(saveLine(deps(), SAM, job, { line: keep[1]!, qty: '100', rate: '300', qpct: '50', pool: 'MP', reason: 'Counted on the walkthrough', seq: String(view(job).seq) }));
  ok(savePackValue(deps(), SAM, job, { field: 'land', value: '150000', reason: 'The land registry and local sales', seq: String(view(job).seq) }));
  ok(savePackValue(deps(), SAM, job, { field: 'building_rate', value: '1500', reason: 'BCIS, GP surgeries, rebased', seq: String(view(job).seq) }));
  // 2 Oct 2026 (stage 5): how the surveyor inspected, in chapter 2.
  ok(setBasis(deps(), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
}
/** The legal check made clear: a building built new is not a purchase. */
function clearLegal(job = JOB): void {
  for (const [q, v] of [['G8', ['new_build']], ['G9d', ['2023-05-01']]] as const) {
    const r = answerLegal(deps(), SAM, job, { question: q, values: v, source: 'The client’s building contract', seq: String(lview(job).seq) });
    assert.equal(r.ok, true, JSON.stringify(r));
  }
}
async function readAll(who = 'u-ap-sam', job = JOB): Promise<void> {
  for (const c of chaptersToRead()) assert.equal((await req(who, `${P(job)}?ch=${String(c)}`)).status, 200);
}

describe('the fingerprint', () => {
  test('the same report always gives the same text, whatever order its keys were made in, and so the same fingerprint', () => {
    const a = canonical({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null }, e: undefined });
    const b = canonical({ e: undefined, a: { c: null, d: [3, { y: 2, z: 1 }] }, b: 1 });
    assert.equal(a, '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1,"e":null}');
    assert.equal(a, b);
    assert.equal(fingerprintOf(a), createHash('sha256').update(a, 'utf8').digest('hex'));
    assert.match(fingerprintOf(a), /^[0-9a-f]{64}$/);
    // Any change at all, even a penny, changes the fingerprint.
    assert.notEqual(fingerprintOf(canonical({ pence: 100 })), fingerprintOf(canonical({ pence: 101 })));
    assert.notEqual(fingerprintOf(canonical([1, 2])), fingerprintOf(canonical([2, 1])), 'the order of a list is part of the report');
  });
});

describe('the approval of the survey pack', () => {
  test('at first the button is grey, and everything still missing is said in words with a link to put it right', async () => {
    const page = (await req('u-ap-sam', `${P()}?ch=23`)).body;
    assert.match(page, /<h1>23 · Sign<\/h1>/);
    assert.match(page, /<button class="cta" type="submit" disabled>Approve and sign this report<\/button>/);
    assert.match(page, /The button turns on when every line above is ticked\./);
    assert.deepEqual(keys(), ['sums', 'legal', 'read', 'basis', 'details']);
    assert.match(page, /✗ \d+ values are still needed\. There is no total until then\. <a href="\/staff\/survey\/job-ap-1\/pack\?ch=4">Put it right<\/a>/);
    assert.match(page, /✗ Open every chapter first\. Still to open: 1 · Report and property; 2 · Your inspection; 3 · Purpose and basis; 4 · Summary; 6 · Room schedule; 7 · The legal check; 9 · Price, land and floor area; 10 · Rebuild cost and split; 12 · Fixtures, item by item; 13 · Pools; 15 · Grants and VAT; 21 · Limits\./); // PHASE 153f: six more chapters built
    assert.match(page, /✗ Add your RICS number below\./);
    assert.match(page, /✓ The job has its locked estimate\./);
    for (const s of DECLARATION) assert.ok(page.includes(s.replace(/’/g, '’')), s);
    assert.match(page, /<span class="pk-lv pk-lv-amber">5 things first<\/span>/, 'the side card counts what is left');
    // A job with no locked estimate says so, and says who to tell; a company with two sites must be told which.
    assert.ok(keys(JOB_NO_ESTIMATE).includes('estimate'));
    assert.equal(keys(JOB_TWO)[0], 'property');
    // A click that gets past the grey button (an old page, a hand-made form) is refused with the first thing missing.
    const r = await post('u-ap-sam', `${P()}/approve`, approveForm());
    assert.equal(r.status, 400);
    assert.match(r.body, /values are still needed/);
  });

  test('the RICS number: 4 to 10 digits, given once, a change kept beside the old one; only the assigned surveyor gives it', async () => {
    assert.match((await post('u-ap-sam', `${P()}/details`, { rics_number: '12a45', firm: '', ch: '23' })).body, /4 to 10 digits/);
    assert.match((await post('u-ap-sam', `${P()}/details`, { rics_number: '123', firm: '', ch: '23' })).body, /4 to 10 digits/);
    assert.match((await post('u-ap-sam', `${P()}/details`, { rics_number: '12345678901', firm: '', ch: '23' })).body, /4 to 10 digits/);
    for (const who of ['u-ap-ola', 'u-ap-admin', 'u-ap-sales', 'u-ap-acc', 'u-ap-ro']) {
      const r = await post(who, `${P()}/details`, { rics_number: '7654321', firm: '', ch: '23' });
      assert.ok(r.status === 403 || r.status === 404, `${who}: ${r.status}`);
    }
    const ok = await post('u-ap-sam', `${P()}/details`, { rics_number: '1234 567', firm: '  Sam   Surveyors LLP ', ch: '23' });
    assert.equal(ok.status, 303);
    assert.equal(ready().details?.rics_number, '1234567');
    assert.equal(ready().details?.firm, 'Sam Surveyors LLP');
    assert.match((await post('u-ap-sam', `${P()}/details`, { rics_number: '1234567', firm: 'Sam Surveyors LLP', ch: '23' })).body, /already your details/);
    assert.equal(keys().includes('details'), false);
    assert.throws(() => made.app.db.run("UPDATE surveyor_details SET rics_number = '9999'"), /never edited/);
    assert.throws(() => made.app.db.run('DELETE FROM surveyor_details'), /never deleted/);
    assert.throws(() => made.app.db.run('INSERT INTO surveyor_details (id,user_id,rics_number,firm,at) VALUES (?,?,?,?,?)', ['x', 'u-ap-sam', '12ab', null, T]));
  });

  test('only the assigned surveyor’s opening of a chapter counts; an answer someone else gives sends them back to chapter 7', async () => {
    await readAll('u-ap-admin');
    await readAll('u-ap-sales');
    assert.deepEqual(ready().unread, chaptersToRead(), 'Admin’s and Sales’s reading counted for the surveyor');
    assert.equal(made.app.db.get<{ c: number }>("SELECT COUNT(*) AS c FROM survey_pack_reads WHERE user_id <> 'u-ap-sam'")!.c, 0, 'someone else’s opening was written down');
    await readAll('u-ap-sam');
    assert.deepEqual(ready().unread, []);
    assert.match((await req('u-ap-sam', `${P()}?ch=23`)).body, /4 · Summary <span class="pk-tick" title="Opened">✓<\/span>/);
    // Sales answers a legal question: the surveyor must open chapter 7 again. Their own answers do not send them back.
    const r = answerLegal(deps(), actor('SALES', 'u-ap-sales'), JOB, { question: 'G8', values: ['purchase'], source: 'The client, by phone', seq: String(lview().seq) });
    assert.equal(r.ok, true);
    assert.deepEqual(ready().unread, [7]);
    await req('u-ap-sam', `${P()}?ch=7`);
    assert.deepEqual(ready().unread, []);
    clearLegal();
    assert.deepEqual(ready().unread, [], 'the surveyor’s own answers sent them back');
    // A chapter number out of range, or not built, is never recorded.
    await req('u-ap-sam', `${P()}?ch=99`);
    await req('u-ap-sam', `${P()}?ch=5`);
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM survey_pack_reads WHERE chapter NOT IN (SELECT value FROM json_each(?))', [JSON.stringify([...chaptersToRead(), 23])])!.c, 0); // PHASE 153f: the built chapters, read from the list
    assert.throws(() => made.app.db.run('UPDATE survey_pack_reads SET legal_seq = 0'), /never edited/);
  });

  test('the sums complete and the legal check clear: the button turns on, and nothing is approved before the click', async () => {
    fill();
    assert.equal(view().sums.complete, true, JSON.stringify(view().sums.needed.slice(0, 3)));
    assert.equal(lview().verdict.level, 'GREEN');
    // A change since the surveyor last read the pack does not send them back, but opening every chapter is still needed.
    assert.deepEqual(keys(), []);
    const page = (await req('u-ap-sam', `${P()}?ch=23`)).body;
    assert.match(page, /<button class="cta" type="submit">Approve and sign this report<\/button>/);
    assert.match(page, /<span class="pk-lv pk-lv-green">Ready to approve<\/span>/);
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM survey_pack_approvals')!.c, 0);
    // Admin sees the same page, with no button, and it is never ready for them: only the assigned surveyor approves.
    assert.equal(readiness(deps(), actor('ADMIN', 'u-ap-admin'), JOB, view(), lview()).ready, false);
    const admin = (await req('u-ap-admin', `${P()}?ch=23`)).body;
    assert.doesNotMatch(admin, /Approve and sign this report/);
    assert.match(admin, /Only the assigned surveyor, Sam Surveyor, approves this pack\./);
  });

  test('who may approve: not Admin, Sales, another surveyor, Accounting or view-only', async () => {
    for (const who of ['u-ap-admin', 'u-ap-sales', 'u-ap-ola', 'u-ap-acc', 'u-ap-ro']) {
      const r = await post(who, `${P()}/approve`, approveForm());
      assert.ok(r.status === 403 || r.status === 404, `${who}: ${r.status}`);
    }
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM survey_pack_approvals')!.c, 0);
  });

  test('one click: version 1, fingerprinted, and the figures committed to the job as the workspace commits them', async () => {
    const s = view().sums;
    const r = await post('u-ap-sam', `${P()}/approve`, approveForm());
    assert.equal(r.status, 303, r.body.slice(0, 400));
    assert.equal(r.location, `${P()}?ch=23&done=approved&v=1`);
    const kept = made.app.db.get<{ version: number; snapshot_json: string; fingerprint: string; approved_by: string }>('SELECT version, snapshot_json, fingerprint, approved_by FROM survey_pack_approvals')!;
    assert.equal(kept.version, 1);
    assert.equal(kept.approved_by, 'u-ap-sam');
    assert.equal(kept.fingerprint, createHash('sha256').update(kept.snapshot_json, 'utf8').digest('hex'));
    assert.equal(canonical(JSON.parse(kept.snapshot_json)), kept.snapshot_json, 'the kept text is in its fixed order');
    const snap = JSON.parse(kept.snapshot_json) as { surveyor: { name: string; rics_number: string }; sums: { qualifying_pence: number }; lines: unknown[]; declaration: string[]; changes: { by_name: string }[] };
    assert.equal(snap.changes.length, view().changes.length, 'the surveyor’s changes are part of what is approved');
    assert.ok(snap.changes.length > 10 && snap.changes.every((c) => c.by_name === 'Sam Surveyor'));
    assert.deepEqual([snap.surveyor.name, snap.surveyor.rics_number], ['Sam Surveyor', '1234567']);
    assert.equal(snap.sums.qualifying_pence, s.qualifying_pence);
    assert.deepEqual(snap.declaration, [...DECLARATION]);
    // Every figure keeps its stamp in the kept copy: the surveyor's own name on the numbers they typed.
    const line0 = (JSON.parse(kept.snapshot_json) as { lines: { removed: boolean; rate_pence: { value: number; source: { kind: string; by_name: string; reason: string } } }[] }).lines.find((l) => !l.removed)!;
    assert.deepEqual([line0.rate_pence.value, line0.rate_pence.source.kind, line0.rate_pence.source.by_name, line0.rate_pence.source.reason], [200_000, 'SURVEYOR', 'Sam Surveyor', 'Counted on the walkthrough']);
    // The figures went to the job: the commitment the claim reads, and the estimate released.
    const c = made.app.db.get<{ a: number; b: number; c: number; pct: number; note: string }>('SELECT a_qualifying_plant_pence AS a, b_building_pence AS b, c_bare_land_pence AS c, qualifying_pct AS pct, method_note AS note FROM surveyor_commitments WHERE job_id = ?', [JOB])!;
    assert.deepEqual([c.a, c.b, c.c], [s.qualifying_pence, s.building_price_pence, 15_000_000]);
    assert.equal(c.pct, (s.share_bp as number) / 10_000);
    assert.match(c.note, new RegExp(`Survey pack version 1, fingerprint ${kept.fingerprint}`));
    assert.equal(made.app.db.get<{ state: string }>('SELECT state FROM surveyor_jobs WHERE id = ?', [JOB])!.state, 'COMMITTED_AND_RELEASED');
    const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'SURVEY_PACK_APPROVED'")!;
    assert.deepEqual(JSON.parse(audit.detail), { version: 1, fingerprint: kept.fingerprint });
    // The page says it is approved, and the button is grey again: this state is approved.
    const page = (await req('u-ap-sam', `${P()}?ch=23`)).body;
    assert.match(page, /This version is approved: version 1<\/strong>, by Sam Surveyor/);
    assert.match(page, /<button class="cta" type="submit" disabled>/);
    assert.match(page, /<span class="pk-lv pk-lv-green">Approved · version 1<\/span>/);
  });

  test('a second click, or a page drawn before a change, approves nothing more', async () => {
    const again = await post('u-ap-sam', `${P()}/approve`, approveForm());
    assert.equal(again.status, 400);
    assert.match(again.body, /This version is approved: version 1/);
    const old = approveForm();
    assert.equal(saveLine(deps(), SAM, JOB, { line: view().lines[0]!.id, qty: '11', rate: '2000', qpct: '100', pool: 'SR', reason: 'One more on a second look', seq: String(view().seq) }).ok, true);
    const stale = await post('u-ap-sam', `${P()}/approve`, old);
    assert.equal(stale.location, `${P()}?ch=23&stale=1`);
    // A legal answer given since the page was drawn makes it out of date too, even with the pack itself unchanged.
    const before = approveForm();
    assert.equal(answerLegal(deps(), SAM, JOB, { question: 'G9d', values: ['2023-05-02'], source: 'The practical completion certificate', seq: before.legal_seq }).ok, true);
    assert.equal((await post('u-ap-sam', `${P()}/approve`, before)).location, `${P()}?ch=23&stale=1`);
    await req('u-ap-sam', `${P()}?ch=7`);
    for (const bad of [{ seq: 'x', legal_seq: '1' }, { seq: '1', legal_seq: '' }, { seq: '-1', legal_seq: '1' }]) {
      assert.equal(approvePack(deps(), SAM, JOB, bad).ok, false, JSON.stringify(bad));
    }
    assert.equal(made.app.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM survey_pack_approvals')!.c, 1);
  });

  test('a change, then one click: version 2 through the amendment; version 1 stays exactly as it was approved', async () => {
    const before = made.app.db.get<{ snapshot_json: string; fingerprint: string }>('SELECT snapshot_json, fingerprint FROM survey_pack_approvals WHERE version = 1')!;
    const r = await post('u-ap-sam', `${P()}/approve`, approveForm());
    assert.equal(r.location, `${P()}?ch=23&done=approved&v=2`, r.body.slice(0, 300));
    const after = made.app.db.get<{ snapshot_json: string; fingerprint: string }>('SELECT snapshot_json, fingerprint FROM survey_pack_approvals WHERE version = 1')!;
    assert.deepEqual({ ...after }, { ...before });
    const v2 = approvedVersion(deps(), SAM, JOB, 2)!;
    assert.equal(v2.fingerprint_holds, true);
    assert.notEqual(v2.row.fingerprint, before.fingerprint);
    const amended = made.app.db.get<{ detail_json: string }>("SELECT detail_json FROM anchor_log WHERE job_id = ? AND kind = 'POST_RELEASE_AMENDMENT' ORDER BY seq DESC LIMIT 1", [JOB])!;
    const to = (JSON.parse(amended.detail_json) as { to: { A_qualifying_plant_pence: number }; reason: string });
    assert.equal(to.to.A_qualifying_plant_pence, view().sums.qualifying_pence);
    assert.equal(to.reason, 'Survey pack version 2 approved.');
    // The version page shows it as kept, with the stamp and the fingerprint.
    const page = (await req('u-ap-admin', `${P()}/version/2`)).body;
    assert.match(page, /<h1>Version 2, as approved<\/h1>/);
    assert.match(page, /The fingerprint holds\./);
    assert.match(page, /Approved by <strong>Sam Surveyor<\/strong>, RICS number 1234567, Sam Surveyors LLP/);
    assert.ok(page.includes(v2.row.fingerprint));
    assert.match((await req('u-ap-admin', `${P()}/version/9`)).body, /This pack has no approved version with that number\./);
    for (const who of ['u-ap-ola', 'u-ap-acc', 'u-ap-ro']) {
      const x = await req(who, `${P()}/version/1`);
      assert.ok(x.status === 403 || x.status === 404, `${who} read an approved version (${x.status})`);
    }
  });

  test('an approved version is never edited or deleted; a copy altered underneath is shown as altered', async () => {
    const db = made.app.db;
    assert.throws(() => db.run("UPDATE survey_pack_approvals SET fingerprint = ?", ['0'.repeat(64)]), /never edited/);
    assert.throws(() => db.run('DELETE FROM survey_pack_approvals'), /never deleted/);
    const pack = db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [JOB])!.id;
    const ins = (id: string, version: number, ps: number, json: string, fp: string) => db.run(
      'INSERT INTO survey_pack_approvals (id,pack_id,version,pack_seq,legal_seq,snapshot_json,fingerprint,approved_by,approved_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, pack, version, ps, 0, json, fp, 'u-ap-sam', T]);
    assert.throws(() => ins('x1', 1, 9001, '{}', fingerprintOf('{}')), 'a second version 1');
    assert.throws(() => ins('x2', 50, 9002, 'not json', fingerprintOf('not json')), 'a snapshot that is not JSON');
    assert.throws(() => ins('x3', 51, 9003, '{}', 'ABC'), 'a fingerprint that is not SHA-256 hex');
    // Someone gets round the triggers (they cannot through the app): the page says the copy is not what was approved.
    db.run('DROP TRIGGER survey_pack_approvals_never_edited');
    db.run("UPDATE survey_pack_approvals SET snapshot_json = json_set(snapshot_json, '$.sums.qualifying_pence', 1) WHERE version = 1");
    assert.equal(approvedVersion(deps(), SAM, JOB, 1)!.fingerprint_holds, false);
    assert.match((await req('u-ap-sam', `${P()}/version/1`)).body, /The fingerprint does not match\.<\/strong> This copy is not what was approved\./);
  });

  test('two clicks at once give one version, and a refused commitment keeps nothing', async () => {
    // A fresh job, filled and read, then approved twice from the same page at the same moment.
    const db = made.app.db;
    db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ['e-b-ap-2', 'as-b-ap-2', 'b-ap-2', 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T, 'test-not-a-real-hash']);
    fill(JOB_NO_ESTIMATE); clearLegal(JOB_NO_ESTIMATE); await readAll('u-ap-sam', JOB_NO_ESTIMATE);
    assert.deepEqual(keys(JOB_NO_ESTIMATE), []);
    const form = approveForm(JOB_NO_ESTIMATE);
    const all = await Promise.all(Array.from({ length: 8 }, () => post('u-ap-sam', `${P(JOB_NO_ESTIMATE)}/approve`, form)));
    assert.equal(all.filter((x) => x.status === 303).length, 1, all.map((x) => x.status).join(','));
    assert.equal(db.get<{ c: number }>("SELECT COUNT(*) AS c FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id WHERE p.job_id = ?", [JOB_NO_ESTIMATE])!.c, 1);
    assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM surveyor_commitments WHERE job_id = ?', [JOB_NO_ESTIMATE])!.c, 1);
    // The job is put back underneath to "not yet committed", so the commitment fails on the one already kept: the
    // approval fails with it, and nothing is kept — not the version, not a second commitment, not an audit line.
    assert.equal(saveLine(deps(), SAM, JOB_NO_ESTIMATE, { line: view(JOB_NO_ESTIMATE).lines[0]!.id, qty: '12', rate: '2000', qpct: '100', pool: 'SR', reason: 'A third look', seq: String(view(JOB_NO_ESTIMATE).seq) }).ok, true);
    db.run("UPDATE surveyor_jobs SET state = 'SEALED' WHERE id = ?", [JOB_NO_ESTIMATE]);
    const audits = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM audit_log')!.c;
    assert.throws(() => approvePack(deps(), SAM, JOB_NO_ESTIMATE, { seq: String(view(JOB_NO_ESTIMATE).seq), legal_seq: String(lview(JOB_NO_ESTIMATE).seq) }), /UNIQUE constraint failed: surveyor_commitments/);
    assert.equal(db.get<{ c: number }>("SELECT COUNT(*) AS c FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id WHERE p.job_id = ?", [JOB_NO_ESTIMATE])!.c, 1);
    assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM surveyor_commitments WHERE job_id = ?', [JOB_NO_ESTIMATE])!.c, 1);
    assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM audit_log')!.c, audits, 'a refused approval wrote to the audit log');
  });

  test('a commitment the job refuses refuses the approval too, and nothing is kept', async () => {
    // Two sites: the surveyor says which one, then fills, clears and reads the pack.
    assert.equal(choosePackProperty(deps(), SAM, JOB_TWO, 'p-b-ap-3').ok, true);
    assert.equal(keys(JOB_TWO).includes('property'), false);
    fill(JOB_TWO); clearLegal(JOB_TWO); await readAll('u-ap-sam', JOB_TWO);
    assert.deepEqual(keys(JOB_TWO), []);
    // The job says its figures were committed, but nothing was: an amendment of nothing is refused, and so is approval.
    const db = made.app.db;
    db.run("UPDATE surveyor_jobs SET state = 'COMMITTED_AND_RELEASED' WHERE id = ?", [JOB_TWO]);
    const audits = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM audit_log')!.c;
    const r = await post('u-ap-sam', `${P(JOB_TWO)}/approve`, approveForm(JOB_TWO));
    assert.equal(r.status, 400);
    assert.match(r.body, /The figures could not be committed/);
    assert.equal(db.get<{ c: number }>("SELECT COUNT(*) AS c FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id WHERE p.job_id = ?", [JOB_TWO])!.c, 0);
    assert.equal(db.get<{ c: number }>('SELECT COUNT(*) AS c FROM audit_log')!.c, audits);
  });
});
