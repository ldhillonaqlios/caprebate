/**
 * 2 OCTOBER 2026 — THE SURVEY PACK'S LEGAL CHECK (src/web/pack-legal.ts, chapter 7 of the pack).
 *
 * Lakhbir agreed (1 Oct 2026) that the legal check comes before the survey: a building bought from an owner who could
 * claim can leave the buyer nothing on the fixtures unless the value was fixed in time (CAA 2001 s.187A, s.198).
 *
 * Proven here:
 *   · the questions are the engine's own, picked by the facts they set, and the same set in every sector;
 *   · the verdict on each kind of purchase is the engine's — a building, not a purchase (clear); shares (clear); a
 *     history where nobody could claim (clear); bought within two years with nothing fixed (clear, with the deadline);
 *     bought years ago with nothing fixed (not settled: a specialist); a complete election in time (clear, capped at its
 *     value); a late election (fails); a nominal election over every fixture (fails); "not sure" (not settled);
 *   · approval is allowed only on clear, and never above a cap;
 *   · each answer is stamped with who gave it and where it came from, kept for ever, and only the flow's own questions
 *     can be answered; an out-of-date page is refused; an earlier answer changed leaves later ones kept and unused;
 *   · who may answer: the assigned surveyor, Sales and Admin; not another surveyor, Accounting or view-only.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { assessLegal, legalAllows, legalQuestions, legalView, parseAnswer } from '../src/web/pack-legal.ts';
import { SECTOR_IDS } from '../src/web/engine.ts';
import { actor } from './helpers.ts';

const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const NOW = T;
const ask = (answers: Record<string, unknown>, claimant = 'company') => assessLegal('gp', new Map(Object.entries(answers)), NOW, claimant);
// PHASE 159h (C8): how the property was taken on is asked on every purchase of the property now.
const PURCHASE = (date: string) => ({ G8: ['purchase'], G8a: 'property', G9d: date, G14s: 'sale' });
/** Bought from a tax-paying business, directly, no election, no tribunal. */
const FROM_TAXPAYER = (date: string) => ({ ...PURCHASE(date), G11: 'yes', G12: 'taxpaying', G14: 'no', G14po: 'sold_market', G14pod: date, G14iv: 'no', G14t: 'none', G15: 'no' });
/** A complete s.198 election, notified within six months, over every fixture. */
const ELECTION = (date: string, notified: string, value: number, scope = 'all_fixtures') => ({
  ...PURCHASE(date), G11: 'yes', G12: 'taxpaying', G14: 'held', G14sx: 's.198', G14d: date, G14n: notified, G14po: 'sold_market', G14pod: date,
  G14iv: 'no', G14t: 'none', G14rs: 'split', G14rsv: Math.floor(value / 3), G14sc: scope, G14mp: 'no',
  G14c: ['amount', 'plant', 'land', 'interest', 'utrs', 'both'], G14v: value, G15: 'no', G14fvr: 'no',
});

describe('the legal check’s questions and verdicts', () => {
  test('the questions are the engine’s own, chosen by the facts they set — the same set in every sector, its letter aside', () => {
    const gp = legalQuestions('gp').map((q) => q.id);
    assert.equal(gp[0], 'G8');
    for (const id of ['G8a', 'G9d', 'G11', 'G12', 'G12b', 'G14', 'G14d', 'G14n', 'G14po', 'G14pod', 'G14iv', 'G14dvs', 'G14t', 'G14c', 'G14v']) assert.ok(gp.includes(id), id);
    assert.equal(gp.includes('G51legal'), false, 'legal fees are not a legal-check question');
    assert.equal(gp.includes('G12a'), false, 'a grant to the previous owner is not a legal-check question');
    const suffixes = (s: string) => legalQuestions(s).map((q) => q.id.slice(1)).filter((x) => x !== '8a');
    for (const s of SECTOR_IDS) assert.deepEqual(suffixes(s), suffixes('gp'), s);
    assert.deepEqual(legalQuestions('nowhere'), []);
  });

  test('nothing answered: not settled, and the first questions are named', () => {
    const r = ask({});
    assert.equal(r.verdict.level, 'AMBER');
    assert.deepEqual(r.unanswered.map((q) => q.id), ['G8', 'G9d']);
    assert.equal(legalAllows(r.verdict, 100).ok, false);
  });

  test('not a purchase, or shares bought: clear; a building bought where nobody could ever claim: clear', () => {
    assert.equal(ask({ G8: ['new_build'], G9d: '2023-05-01' }).verdict.level, 'GREEN');
    assert.match(ask({ G8: ['fitout'], G9d: '2023-05-01' }).verdict.headline, /about buying a building/);
    assert.equal(ask({ ...PURCHASE('2023-05-01'), G8a: 'shares' }).verdict.level, 'GREEN');
    assert.equal(ask({ ...PURCHASE('2023-05-01'), G8a: 'unsure' }).verdict.level, 'AMBER');
    const dev = ask({ ...PURCHASE('2019-06-01'), G11: 'no', G12: 'developer', G12b: 'no', G15: 'no' });
    assert.equal(dev.verdict.level, 'GREEN', JSON.stringify(dev.verdict));
    assert.ok(dev.verdict.why.some((w) => /nobody in the ownership history was ever able to claim/.test(w)));
    assert.equal(dev.unanswered.length, 0, 'the election was asked where nobody could ever claim');
  });

  test('bought within two years with nothing fixed: clear with the deadline; bought years ago: not settled, a specialist must look', () => {
    const live = ask({ ...FROM_TAXPAYER('2025-06-01'), G14fvr: 'no' });
    assert.equal(live.verdict.level, 'URGENT', JSON.stringify(live.verdict));
    // PHASE 159d (C10): two years beginning with 1 June 2025 end on 31 May 2027, the day before the anniversary.
    assert.equal(live.verdict.deadline, '2027-05-31');
    assert.match(live.verdict.headline, /by 2027-05-31/);
    assert.equal(legalAllows(live.verdict, 5_000_000).ok, true);
    // PHASE 159d (C27): bought years ago STRAIGHT from the owner who claimed, nothing fixed, no tribunal: it fails. (With an
    // owner in between the closed window is still not settled: the site harness's A-1 checks.)
    const old = ask({ ...FROM_TAXPAYER('2019-06-01'), G14fvr: 'yes' });
    assert.equal(old.verdict.level, 'RED');
    assert.match(old.verdict.headline, /claim on the fixtures fails/);
    assert.equal(legalAllows(old.verdict, 1).ok, false);
  });

  test('a complete election in time: clear, capped at its value — and approval is refused above the cap', () => {
    const r = ask(ELECTION('2024-03-01', '2024-09-01', 60_000));
    assert.equal(r.verdict.level, 'GREEN', JSON.stringify(r.verdict));
    assert.equal(r.verdict.cap_pence, 6_000_000);
    assert.equal(legalAllows(r.verdict, 6_000_000).ok, true);
    assert.equal(legalAllows(r.verdict, 6_000_001).ok, false);
    assert.match(legalAllows(r.verdict, 9_000_000).why, /above the value the section 198 election fixes/);
    // An election over listed items only caps those items: no cap on the whole.
    const listed = ask(ELECTION('2024-03-01', '2024-09-01', 60_000, 'listed_items'));
    assert.equal(listed.verdict.level, 'GREEN');
    assert.equal(listed.verdict.cap_pence, null);
    // An election whose reach is unclear: not settled.
    assert.equal(ask(ELECTION('2024-03-01', '2024-09-01', 60_000, 'unclear')).verdict.level, 'AMBER');
  });

  test('an election notified late, or at a nominal value over every fixture: the claim on the fixtures fails', () => {
    const late = ask(ELECTION('2019-03-01', '2022-09-01', 60_000));
    assert.equal(late.verdict.level, 'RED', JSON.stringify(late.verdict));
    assert.ok(late.verdict.why.some((w) => /more than two years after the acquisition/.test(w)));
    const nominal = ask(ELECTION('2024-03-01', '2024-09-01', 1));
    assert.equal(nominal.verdict.level, 'RED', JSON.stringify(nominal.verdict));
    assert.equal(legalAllows(nominal.verdict, 0).ok, false);
  });

  test('“not sure” is an answer, and it is never a pass', () => {
    const r = ask({ ...PURCHASE('2024-03-01'), G11: 'unsure', G12: 'unsure' });
    assert.notEqual(r.verdict.level, 'GREEN');
    assert.notEqual(r.verdict.level, 'URGENT');
    const e = ask({ ...FROM_TAXPAYER('2024-03-01'), G14: 'unsure', G14fvr: 'unsure' });
    assert.notEqual(e.verdict.level, 'GREEN');
  });

  test('what may be typed: an option of the question, a real date, an amount, a percentage', () => {
    const q = legalQuestions('gp');
    const single = q.find((x) => x.id === 'G11')!;
    assert.deepEqual(parseAnswer(single, ['yes']), { ok: true, value: 'yes' });
    assert.equal(parseAnswer(single, ['maybe']).ok, false);
    const multi = q.find((x) => x.id === 'G14c')!;
    assert.deepEqual(parseAnswer(multi, ['amount', 'plant', 'amount']), { ok: true, value: ['amount', 'plant'] });
    assert.equal(parseAnswer(multi, ['amount', 'nope']).ok, false);
    assert.deepEqual(parseAnswer(multi, []), { ok: true, value: [] });
    const date = q.find((x) => x.id === 'G9d')!;
    assert.deepEqual(parseAnswer(date, ['2024-02-29']), { ok: true, value: '2024-02-29' });
    for (const bad of ['2023-02-29', '2024-13-01', '01/02/2024', '', '1800-01-01']) assert.equal(parseAnswer(date, [bad]).ok, false, bad);
    const money = q.find((x) => x.id === 'G14v')!;
    assert.deepEqual(parseAnswer(money, ['£60,000']), { ok: true, value: 60000 });
    assert.equal(parseAnswer(money, ['-1']).ok, false);
  });
});

/* ------------------------------------------------------------------ through the pages */

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
const JOB = 'job-lg-1';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-lg-')), now: () => T });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, role, name] of [['u-lg-sam', 'SURVEYING', 'Sam Surveyor'], ['u-lg-ola', 'SURVEYING', 'Ola Other'], ['u-lg-admin', 'ADMIN', 'Ada Admin'],
    ['u-lg-sales', 'SALES', 'Sid Sales'], ['u-lg-ro', 'READ_ONLY', 'Rita Reader'], ['u-lg-acc', 'ACCOUNTING', 'Al Accounts']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T, T]);
  }
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-lg', 'Legal Practice Limited', 'gp', 'SURVEY', T, 'COMPANY']);
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-lg', 'b-lg', 'Legal Practice', 'ZZ9 9ZZ', T]);
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-lg', 'b-lg', 'gp', T, 100, 200, T]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at) VALUES (?,?,?,?,?,?,?)', [JOB, 'b-lg', 'as-lg', 'u-lg-sam', 'SEALED', null, T]);
  for (const w of ['u-lg-sam', 'u-lg-ola', 'u-lg-admin', 'u-lg-sales', 'u-lg-ro', 'u-lg-acc']) {
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
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `lg-${(++n).toString().padStart(6, '0')}` });
const lv = () => legalView(deps(), actor('ADMIN'), JOB);
const P = `/staff/survey/${JOB}/pack`;
async function answer(who: string, question: string, values: string[], source = 'The CPSE replies, section 32', seq = String(lv().seq)) {
  const body = new URLSearchParams({ question, source, seq, ch: '7' });
  for (const v of values) body.append('answer', v);
  return req(who, `${P}/legal`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
}

describe('the legal check, through the pack’s pages', () => {
  test('the chapter shows the verdict, the questions the answers lead to, and every answer’s stamp and source', async () => {
    const page = (await req('u-lg-sam', `${P}?ch=7`)).body;
    assert.match(page, /<h1>7 · The legal check<\/h1>/);
    assert.match(page, /Not settled yet\.<\/strong> 2 questions still to answer\. Not known is never a pass\./);
    assert.match(page, /This stops approval\.<\/strong><\/p>/, 'the reason is said twice');
    assert.match(page, /<input type="checkbox" name="answer" value="purchase">/);
    assert.match(page, /<span class="pk-lv pk-lv-amber">Not settled yet<\/span>/, 'the totals side does not show the legal check');
    // A single-choice question starts on "Choose…", never on an answer nobody gave, and "Choose…" cannot be saved.
    assert.equal((await answer('u-lg-sam', 'G8', ['purchase'])).status, 303);
    const g8a = (await req('u-lg-sam', `${P}?ch=7`)).body;
    assert.match(g8a, /<select class="fi" name="answer" id="lq-G8a"><option value="" selected>Choose…<\/option>/);
    assert.match((await answer('u-lg-sam', 'G8a', [''], 'x')).body, /Choose one of the answers/);
    // Answer whatever the flow asks next, as a person would, from what the papers say.
    const papers: Record<string, string[]> = {
      G8: ['purchase'], G8a: ['property'], G9d: ['2025-06-01'], G11: ['yes'], G12: ['taxpaying'], G14: ['no'], G14s: ['sale'],
      G14po: ['sold_market'], G14pod: ['2025-06-01'], G14t: ['none'], G15: ['no'], G14fvr: ['no'],
    };
    for (let i = 0; i < 30 && lv().unanswered.length > 0; i++) {
      const q = lv().unanswered[0]!.id;
      assert.ok(papers[q] !== undefined, `the flow asked ${q}, which the papers do not answer`);
      if (q === 'G14po') {
        // An optional question has its form open too, while it is not answered.
        assert.match((await req('u-lg-sam', `${P}?ch=7`)).body, /<li id="lq-row-G14pod" class="pk-q pk-q-open">\s*<p class="pk-q-ask"><strong>[^<]+<\/strong> <span class="help">\(you do not have to\)<\/span><\/p>\s*<p class="help">[^<]+<\/p>\s*<form method="post"/);
      }
      const r = await answer('u-lg-sam', q, papers[q]!);
      assert.equal(r.status, 303, `${q}: ${r.body.slice(0, 300)}`);
    }
    if (lv().answers.get('G14pod') === undefined) assert.equal((await answer('u-lg-sam', 'G14pod', ['2025-06-01'])).status, 303);
    const v = lv();
    assert.equal(v.verdict.level, 'URGENT', JSON.stringify(v.verdict));
    const after = (await req('u-lg-sam', `${P}?ch=7`)).body;
    assert.match(after, /There is still time to fix the value — by 31 May 2027\./);
    assert.match(after, /This does not stop approval\./);

    assert.match(after, /Bought an existing surgery <span class="pk-src pk-sv">Sam Surveyor · [^<]+<\/span> <span class="help">From: The CPSE replies, section 32<\/span>/);
    const row = made.app.db.get<{ by_user: string; source_note: string; value_json: string }>("SELECT by_user, source_note, value_json FROM survey_pack_legal_answers WHERE question_id = 'G9d'")!;
    assert.deepEqual({ ...row }, { by_user: 'u-lg-sam', source_note: 'The CPSE replies, section 32', value_json: '"2025-06-01"' });
  });

  test('a source is required; a question the flow does not ask, or an answer not on its list, is refused; an unchanged answer changes nothing', async () => {
    const s = String(lv().seq);
    assert.match((await answer('u-lg-sam', 'G11', ['no'], '  ', s)).body, /Say where this answer came from/);
    assert.match((await answer('u-lg-sam', 'G12b', ['yes'], 'x', s)).body, /not asked on the answers so far/);
    assert.match((await answer('u-lg-sam', 'G11', ['maybe'], 'x', s)).body, /Choose one of the answers/);
    assert.match((await answer('u-lg-sam', 'G9d', ['2025-02-30'], 'x', s)).body, /Give a real date/);
    assert.match((await answer('u-lg-sam', 'G11', ['yes'], 'x', s)).body, /That is already the answer/);
    assert.equal(String(lv().seq), s, 'a refused answer was written');
  });

  test('an answer from an out-of-date page is refused, and the page says so', async () => {
    const old = String(lv().seq);
    assert.equal((await answer('u-lg-sales', 'G14fvr', ['unsure'], 'The client, by phone', old)).status, 303);
    const stale = await answer('u-lg-sam', 'G14fvr', ['no'], 'x', old);
    assert.equal(stale.location, `${P}?ch=7&stale=1`);
    assert.equal(lv().answers.get('G14fvr')?.value, 'unsure');
    assert.equal(lv().answers.get('G14fvr')?.by_name, 'Sid Sales', 'Sales may answer');
    assert.equal((await answer('u-lg-admin', 'G14fvr', ['no'], 'The completion statement')).status, 303, 'Admin may answer');
  });

  test('who may answer: not another surveyor, Accounting or view-only; and every answer is kept for ever', async () => {
    for (const who of ['u-lg-ola', 'u-lg-acc', 'u-lg-ro']) {
      const r = await answer(who, 'G14fvr', ['yes'], 'x');
      assert.ok(r.status === 403 || r.status === 404, `${who}: ${r.status}`);
    }
    assert.equal(lv().answers.get('G14fvr')?.value, 'no');
    assert.throws(() => made.app.db.run("UPDATE survey_pack_legal_answers SET source_note = 'x'"), /never edited/);
    assert.throws(() => made.app.db.run('DELETE FROM survey_pack_legal_answers'), /never deleted/);
    const pack = made.app.db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [JOB])!.id;
    assert.throws(() => made.app.db.run('INSERT INTO survey_pack_legal_answers (id,pack_id,seq,question_id,value_json,by_user,source_note,at) VALUES (?,?,?,?,?,?,?,?)',
      ['x1', pack, 999, 'G11', 'not json', 'u-lg-sam', 'x', T]), 'a value that is not JSON');
    assert.throws(() => made.app.db.run('INSERT INTO survey_pack_legal_answers (id,pack_id,seq,question_id,value_json,by_user,source_note,at) VALUES (?,?,?,?,?,?,?,?)',
      ['x2', pack, 998, 'G11', '"yes"', 'u-lg-sam', ' ', T]), 'an answer with no source');
  });

  test('an earlier answer changed: the later answers it no longer leads to are kept, and not used', async () => {
    assert.equal((await answer('u-lg-sam', 'G8', ['new_build'], 'The client: it was built new in 2025')).status, 303);
    const v = lv();
    assert.equal(v.verdict.level, 'GREEN', 'a new building is not a purchase');
    assert.ok(v.not_asked_now.some((a) => a.question_id === 'G14'), 'the election answer was dropped rather than kept');
    assert.equal(v.asked.some((q) => q.id === 'G14'), false);
    const page = (await req('u-lg-sam', `${P}?ch=7`)).body;
    assert.match(page, /Answers no longer asked \(\d+\)/);
    // Back to the purchase: the kept answers count again.
    assert.equal((await answer('u-lg-sam', 'G8', ['purchase'], 'The title register: bought in 2025')).status, 303);
    assert.equal(lv().verdict.level, 'URGENT');
  });
});
