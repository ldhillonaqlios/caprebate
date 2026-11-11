/**
 * SIGNING ON FOR TESTING — 6 October 2026. Lakhbir: "Signing itself is still switched off. switch this on for test
 * purposes at the moment". The test website, and a local copy started with CAPREBATE_SIGNING_TEST=1, let an invented
 * client sign the TEST COPY of the engagement letter end to end. The real letter can never be signed under it.
 * ENGAGEMENT_SIGNING, the switch real clients use, is ON since 11 November 2026 (Lakhbir: "Yes, confirmed" to a typed
 * name with a tick, then "Approved, switch on"; no solicitor): a real letter with no open term, no specimen and a known
 * party signs end to end, and the test copy is still refused under it. Everything here is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../../src/app/server.ts';
import {
  ENGAGEMENT_SIGNING, ENGAGEMENT_SIGNING_TEST, checkSignature, shownLetter, signEngagement, signingHere, signingMissing,
  letterFacts,
} from '../../src/modules/claims/signing.ts';
import { TEST_LETTER_PATH } from '../../src/modules/claims/letter.ts';
import { sendEngagementLetter } from '../../src/modules/claims/engagement-send.ts';
import { docxOf } from '../document-fixtures.ts';
import { actor, testApp } from '../helpers.ts';

/** PHASE 158b (F22): an invented partnership, so the letter says who is signing (a specimen company number is refused). */
const PARTNER = { claimant_type: 'PARTNERSHIP', property: null, date: null, range: null } as const;

const T0 = '2026-10-06T09:00:00.000Z';
const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex');

async function world() {
  const a = await testApp();
  a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-SALES','sales@example.invalid','sales@example.invalid','Sales Person','SALES','x',?,?,NULL)", [T0, T0]);
  const biz = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,claimant_type) VALUES (?,?,?,?,?,?,?)', [biz, 'Invented Signing Surgery', 'gp', 'ENGAGEMENT', T0, 'WEBSITE', 'PARTNERSHIP']);
  a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-cl','ivy@example.invalid','ivy@example.invalid','Ivy','CLIENT','x',?,?,?)", [T0, T0, biz]);
  const session = randomUUID();
  a.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, 'u-cl', randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
  const deps = { db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID };
  sendEngagementLetter(deps, actor('SALES', 'u-SALES'), biz);
  const sign = (cfg: typeof ENGAGEMENT_SIGNING, letterPath: string) => signEngagement(deps, actor('CLIENT', 'u-cl', biz), biz,
    { full_name: 'Ivy Inventedperson', role: 'Partner', authorised: true, letter_sha256: shownLetter({ name: 'Invented Signing Surgery' }, letterPath, letterFacts(a.db, biz)).sha256, typed_as_signature: true },
    { ip: '203.0.113.9', session_id: session }, { cfg, letterPath });
  return { a, biz, sign };
}

describe('signing on for testing: the test copy only', () => {
  test('the switch for real clients ships ON since 11 Nov 2026 (links off); the test setting is on, for the test copy only, with Lakhbir’s words', () => {
    assert.equal(ENGAGEMENT_SIGNING.enabled, true);
    assert.equal(ENGAGEMENT_SIGNING.signature_confirmed, true);
    assert.equal(ENGAGEMENT_SIGNING.test_copy_only, undefined);
    assert.equal(ENGAGEMENT_SIGNING.links, undefined, 'signing from an emailed link is a separate question (Word question 246)');
    assert.equal(ENGAGEMENT_SIGNING_TEST.signature_confirmed, false);
    assert.equal(ENGAGEMENT_SIGNING_TEST.enabled, true);
    assert.equal(ENGAGEMENT_SIGNING_TEST.test_copy_only, true);
    assert.match(ENGAGEMENT_SIGNING_TEST.waiver_record ?? '', /6 October 2026.*"Signing itself is still switched off\. switch this on for test purposes at the moment"/);
    assert.match(ENGAGEMENT_SIGNING_TEST.waiver_record ?? '', /Since 11 November 2026 the real letter has no blanks and ENGAGEMENT_SIGNING is on/);
    assert.equal(signingHere(false), ENGAGEMENT_SIGNING);
    assert.equal(signingHere(true), ENGAGEMENT_SIGNING_TEST);
  });

  test('the test copy signs under the test setting, and is still refused under the real one', () => {
    const copy = shownLetter({ name: 'X' }, TEST_LETTER_PATH, PARTNER);
    assert.equal(copy.test_copy, true);
    assert.deepEqual(signingMissing(ENGAGEMENT_SIGNING_TEST, copy), []);
    assert.match(signingMissing(ENGAGEMENT_SIGNING, copy)[0] ?? '', /test copy of the letter.*can never be signed/);
  });

  test('THE REAL LETTER CAN NEVER BE SIGNED UNDER THE TEST SETTING — not even one with every term settled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-signtest-'));
    const settled = join(dir, 'letter.docx');
    writeFileSync(settled, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and X.', '2. Fees', 'Our fee is 10 per cent.']));
    for (const l of [shownLetter({ name: 'X' }, undefined, PARTNER), shownLetter({ name: 'X' }, settled)]) {
      assert.equal(l.test_copy, false);
      assert.deepEqual(signingMissing(ENGAGEMENT_SIGNING_TEST, l), ['Signing is switched on for testing only, and only the test copy of the letter can be signed there.']);
    }
  });

  test('an invented client signs the test copy end to end: the record checks out and the certificate says TEST, not a contract', async () => {
    const w = await world();
    try {
      const r = w.sign(ENGAGEMENT_SIGNING_TEST, TEST_LETTER_PATH);
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const row = w.a.db.get<{ engagement_id: string; pdf: Uint8Array }>('SELECT engagement_id, pdf FROM engagement_signatures')!;
      assert.equal(checkSignature(w.a.db, row.engagement_id).ok, true);
      const pdf = Buffer.from(row.pdf).toString('latin1');
      assert.ok(pdf.includes(hexOf('TEST: signed on the test system, on the test copy of the letter. It is not a contract.')));
      assert.ok(pdf.includes(hexOf('Certificate of completion')));
    } finally { w.a.close(); }
  });

  test('under the real switch (on since 11 Nov 2026) the same client is still refused the test copy, and nothing is written', async () => {
    const w = await world();
    try {
      assert.equal(ENGAGEMENT_SIGNING.enabled, true);
      const r = w.sign(ENGAGEMENT_SIGNING, TEST_LETTER_PATH);
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /test copy of the letter.*can never be signed/);
      assert.equal(w.a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures')?.n, 0);
    } finally { w.a.close(); }
  });

  test('THE REAL SWITCH, AS SHIPPED: a real letter with no open term, no specimen and a known party is signed end to end by the client login, ticked as authorised', async () => {
    const w = await world();
    try {
      // The range the client was shown at the assessment, so the letter carries no specimen figure.
      w.a.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(), w.biz, 'gp', T0, 10_000_00, 255_000_00, T0]);
      const letter = shownLetter({ name: 'Invented Signing Surgery' }, undefined, letterFacts(w.a.db, w.biz));
      assert.equal(letter.test_copy, false);
      assert.equal(letter.open_terms, 0);
      assert.equal(letter.specimens, 0);
      assert.equal(letter.party_unknown, false);
      assert.deepEqual(signingMissing(ENGAGEMENT_SIGNING, letter), [], 'the real switch still refuses a complete real letter');
      // Every other check still holds under it: no tick, no signature.
      const d = { db: w.a.db, audit: w.a.audit, email: w.a.email, now: w.a.now, newId: randomUUID };
      const base = { full_name: 'Ivy Inventedperson', role: 'Partner', letter_sha256: letter.sha256, typed_as_signature: true };
      const sid = w.a.db.get<{ id: string }>("SELECT id FROM sessions WHERE user_id = 'u-cl'")!.id;
      const noTick = signEngagement(d, actor('CLIENT', 'u-cl', w.biz), w.biz, { ...base, authorised: false }, { ip: '203.0.113.9', session_id: sid });
      assert.equal(noTick.ok, false);
      assert.match(noTick.ok ? '' : noTick.why, /Tick the box/);
      // No cfg handed in: ENGAGEMENT_SIGNING as shipped, and the real letter.
      const r = signEngagement(d, actor('CLIENT', 'u-cl', w.biz), w.biz, { ...base, authorised: true }, { ip: '203.0.113.9', session_id: sid });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      assert.equal(r.ok && r.complete, true);
      const row = w.a.db.get<{ engagement_id: string; pdf: Uint8Array; origin: string }>('SELECT engagement_id, pdf, origin FROM engagement_signatures')!;
      assert.equal(row.origin, 'PORTAL');
      assert.equal(checkSignature(w.a.db, row.engagement_id).ok, true);
      assert.equal(w.a.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'SIGNED');
      const pdf = Buffer.from(row.pdf).toString('latin1');
      assert.ok(pdf.includes(hexOf('Certificate of completion')));
      assert.ok(!pdf.includes(hexOf('TEST: signed on the test system')), 'the real letter was marked as a test');
    } finally { w.a.close(); }
  });

  async function portal(opts: { testLetter?: boolean; testSigning?: boolean }) {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-signtest-web-')), ...opts });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    const hash = await made.app.hasher.hash('Invented-Pass-sign');
    const biz = randomUUID();
    made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,claimant_type) VALUES (?,?,?,?,?,?,?)', [biz, 'Invented Signing Surgery', 'gp', 'ENGAGEMENT', T0, 'WEBSITE', 'PARTNERSHIP']);
    made.app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-cl','ivy@example.invalid','ivy@example.invalid','Ivy','CLIENT',?,?,?,?)", [hash, T0, T0, biz]);
    made.app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [randomUUID(), biz, T0]);
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
      for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
      return { status: r.status, body: await r.text(), csp: r.headers.get('content-security-policy') ?? '', location: r.headers.get('location') };
    };
    const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    assert.equal((await post('/login', { email: 'ivy@example.invalid', password: 'Invented-Pass-sign' })).status, 303);
    return { made, req, post };
  }

  test('THE TEST WEBSITE’S WAY (testLetter and testSigning): the pad and its script are on the page, and signing works', async () => {
    const p = await portal({ testLetter: true, testSigning: true });
    try {
      const page = await p.req('/portal/letter');
      assert.match(page.body, /data-sig-pad/);
      assert.match(page.body, /<script src="\/assets\/signature-pad\.js" defer><\/script>/);
      assert.match(page.csp, /script-src 'self'/);
      assert.doesNotMatch(page.body, /Signing is not switched on yet/);
      // PHASE 158b (F23) showed the test copy's open terms blank. PHASE 161m1: it has none left, so there is no "not
      // settled" box at all, and its own line under the title says what it is.
      assert.doesNotMatch(page.body, /left blank on purpose/);
      assert.doesNotMatch(page.body, /We will not issue the letter until they are/);
      assert.match(page.body, /TEST COPY: for the test system only\. This copy is never sent to a client\./);
      const sha = /name="letter_sha256" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
      const signed = await p.post('/portal/letter/sign', { full_name: 'Ivy Inventedperson', signer_role: 'Partner', authorised: 'on', letter_sha256: sha, typed_as_signature: 'on' });
      assert.ok(signed.status === 200 || signed.status === 303, `the sign post answered ${String(signed.status)}: ${signed.body.slice(0, 300)}`);
      assert.equal(p.made.app.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'SIGNED');
      const copy = await p.req('/portal/letter/signed.pdf');
      assert.equal(copy.status, 200);
    } finally { p.made.close(); }
  });

  test('the test letter alone (testLetter without testSigning) still cannot be signed, and its page carries no script', async () => {
    const p = await portal({ testLetter: true });
    try {
      const page = await p.req('/portal/letter');
      assert.doesNotMatch(page.body, /<script|data-sig-pad/);
      const sha = /name="letter_sha256" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
      const signed = await p.post('/portal/letter/sign', { full_name: 'Ivy Inventedperson', signer_role: 'Partner', authorised: 'on', letter_sha256: sha, typed_as_signature: 'on' });
      assert.equal(signed.status, 400);
      assert.notEqual(p.made.app.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'SIGNED');
    } finally { p.made.close(); }
  });

  test('THE REAL WEBSITE’S WAY (no test options): with the client’s range on record the pad is drawn, and the client login signs the real letter', async () => {
    const p = await portal({});
    try {
      const biz = p.made.app.db.get<{ id: string }>('SELECT id FROM businesses')!.id;
      p.made.app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
        [randomUUID(), biz, 'gp', T0, 10_000_00, 255_000_00, T0]);
      const page = await p.req('/portal/letter');
      assert.match(page.body, /data-sig-pad/);
      assert.doesNotMatch(page.body, /TEST COPY/);
      assert.doesNotMatch(page.body, /cannot be signed yet|not switched on yet/);
      const sha = /name="letter_sha256" value="([0-9a-f]{64})"/.exec(page.body)?.[1] ?? '';
      const signed = await p.post('/portal/letter/sign', { full_name: 'Ivy Inventedperson', signer_role: 'Partner', authorised: 'on', letter_sha256: sha, typed_as_signature: 'on' });
      assert.ok(signed.status === 200 || signed.status === 303, `the sign post answered ${String(signed.status)}: ${signed.body.slice(0, 300)}`);
      assert.equal(p.made.app.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'SIGNED');
    } finally { p.made.close(); }
  });

  test('testSigning without the test letter changes nothing: the real letter is shown and cannot be signed', async () => {
    const p = await portal({ testSigning: true });
    try {
      const page = await p.req('/portal/letter');
      assert.doesNotMatch(page.body, /<script|data-sig-pad/);
      assert.doesNotMatch(page.body, /TEST COPY/);
    } finally { p.made.close(); }
  });

  test('only the test website’s file and the local start-up switch ask for it', () => {
    const api = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', '..', 'api', 'index.mjs'), 'utf8');
    assert.match(api, /^\s*testSigning: true,$/m);
    const server = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app', 'server.ts'), 'utf8');
    assert.match(server, /process\.env\.CAPREBATE_SIGNING_TEST/);
    assert.match(server, /opts\.testLetter === true && opts\.testSigning === true \? \{ signing: ENGAGEMENT_SIGNING_TEST \}/);
  });
});
