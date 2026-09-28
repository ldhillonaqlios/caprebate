/**
 * PHASE 151m, 28 September 2026 — RECOVERY CODES: TEN ONE-USE CODES, SO A PERSON WHO LOSES THEIR PHONE CAN STILL SIGN IN.
 *
 * Lakhbir, 28 September 2026 (Word question 232, closed): yes to recovery codes.
 *
 * Every test runs on the default application - the second step on, as it ships. Invented people, a fixed clock, no
 * network beyond the test's own server on 127.0.0.1. The modules this phase changed are imported whole (`* as`), and
 * the one it added is imported only if it is there, so this file also runs against the code as it was before the
 * phase and fails there on its assertions, not on an import - that is how each test here was proved red.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { codeAt, stepAt } from '../src/totp.ts';
import * as SI from '../src/web/sign-in.ts';
import * as EP from '../src/stubs/email-provider.ts';

const NOW = '2026-09-28T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const CODE = /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/;
const WRONG_RECOVERY = 'That recovery code is not right, or it has been used. Try again.';

type Res = { status: number; body: string; location: string | null };
type Json = { status: number; body: Record<string, unknown>; cookies: Map<string, string> };

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151m-')), now: () => NOW });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const browser = () => {
    const jar = new Map<string, string>();
    const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const headers = { ...(init.headers as Record<string, string> | undefined), ...(cookie === '' ? {} : { cookie }) };
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      for (const c of r.headers.getSetCookie()) {
        const [pair = ''] = c.split(';');
        const i = pair.indexOf('=');
        const k = pair.slice(0, i), v = pair.slice(i + 1);
        if (v === '' || /Max-Age=0/.test(c)) jar.delete(k); else jar.set(k, v);
      }
      return { status: r.status, body: await r.text(), location: r.headers.get('location') };
    };
    const post = (path: string, fields: Record<string, string>) =>
      req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    return { req, post, jar };
  };
  const api = async (path: string, body: Record<string, unknown>, session?: string): Promise<Json> => {
    const r = await fetch(base + path, { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json', ...(session === undefined ? {} : { cookie: `cb_session=${session}` }) }, body: JSON.stringify(body) });
    const cookies = new Map<string, string>();
    for (const c of r.headers.getSetCookie()) {
      const [pair = ''] = c.split(';');
      const i = pair.indexOf('=');
      cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    let parsed: Record<string, unknown> = {};
    try { parsed = (await r.json()) as Record<string, unknown>; } catch { /* not JSON */ }
    return { status: r.status, body: parsed, cookies };
  };
  const userId = (email: string) => db.get<{ id: string }>('SELECT id FROM users WHERE email_canonical = ?', [email])!.id;
  const rows = (email: string): number => {
    try { return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ?', [userId(email)])?.n ?? 0; } catch { return -1; }
  };
  const pendingSecret = () => db.get<{ pending_secret: string }>(
    'SELECT pending_secret FROM sign_in_steps WHERE finished_at IS NULL AND pending_secret IS NOT NULL ORDER BY rowid DESC LIMIT 1')!.pending_secret;
  const appCode = (secret: string, ahead = 0) => codeAt(secret, stepAt(NOW_MS) + ahead);
  /** The codes on a page, in order. */
  const codesOn = (html: string): string[] => [...html.matchAll(/<li><code>([^<]+)<\/code><\/li>/g)].map((m) => m[1] ?? '');
  /** Every place a code could have been written down: the database's tables that hold anything a person sent or was sent. */
  const everywhere = (): string => {
    const t = (sql: string) => { try { return JSON.stringify(db.all(sql)); } catch { return ''; } };
    return [t('SELECT * FROM recovery_codes'), t('SELECT * FROM users'), t('SELECT * FROM sign_in_steps'),
      t('SELECT kind, detail FROM audit_log'), t('SELECT * FROM outbox')].join('\n');
  };
  /** A staff login with no second step yet: set up an app on the website. Returns the browser, the secret, and the page. */
  async function setUpApp(email: string, password = SEED_PASSWORD) {
    const b = browser();
    assert.equal((await b.post('/login', { email, password })).location, '/login/step');
    await b.post('/login/step/method', { method: 'APP' });
    const secret = pendingSecret();
    const done = await b.post('/login/step/code', { code: appCode(secret) });
    return { b, secret, done, codes: codesOn(done.body) };
  }
  /** Start a sign-in at the VERIFY step. */
  async function atVerify(email: string) {
    const b = browser();
    assert.equal((await b.post('/login', { email, password: SEED_PASSWORD })).location, '/login/step');
    return b;
  }
  return { made, db, base, browser, api, userId, rows, pendingSecret, appCode, codesOn, everywhere, setUpApp, atVerify,
    close: () => { made.server.close(); made.close(); } };
}

/* ================================================================== 1. the codes, and showing them once */

describe('151m · 1 · ten codes, shown once, kept only as hashes', () => {
  test('setting up a second step shows ten codes once, each about 50 bits in two readable groups, and never again', async () => {
    const w = await world();
    try {
      const { b, done, codes } = await w.setUpApp('sales@example.invalid');
      assert.equal(done.status, 200, 'the page after setting up is not the recovery codes page');
      assert.match(done.body, /Your recovery codes/);
      assert.match(done.body, /will not be shown again/);
      assert.match(done.body, /Each code works once/);
      assert.match(done.body, /Save them or print them/);
      assert.equal(codes.length, 10);
      for (const c of codes) assert.match(c, CODE, `${c} is not two groups of five from the readable set`);
      assert.equal(new Set(codes).size, 10, 'two codes the same');
      // 32 characters, ten of them: 50 bits
      assert.equal(10 * Math.log2(32), 50);
      // the session was issued with the page, and the page's one link goes on to the back office
      assert.ok(b.jar.has('cb_session') && !b.jar.has('cb_step'));
      assert.match(done.body, /href="\/staff">I have saved them/);
      // never shown again: not on "Your second step", not on the step page (it is finished)
      const mine = await b.req('/staff/two-factor');
      assert.match(mine.body, /You have 10 recovery codes left/);
      for (const c of codes) assert.ok(!mine.body.includes(c), 'a code was shown again');
      assert.ok(!(await b.req('/login/step')).body.includes(codes[0]!));
    } finally { w.close(); }
  });

  test('stored only as hashes bound to the person: no code as text in any table, the log or the outbox', async () => {
    const w = await world();
    try {
      const { codes } = await w.setUpApp('accounting@example.invalid');
      assert.equal(w.rows('accounting@example.invalid'), 10);
      const all = w.everywhere();
      for (const c of codes) {
        assert.ok(!all.includes(c), `${c} is kept as text`);
        assert.ok(!all.includes(c.replace('-', '')), `${c} is kept as text without its dash`);
        assert.ok(!all.includes(createHash('sha256').update(c.replace('-', '')).digest('hex')), 'a plain unsalted hash');
      }
      const r = w.db.all<{ user_id: string; code_hash: string; made_at: string; used_at: string | null }>(
        'SELECT user_id, code_hash, made_at, used_at FROM recovery_codes');
      assert.ok(r.every((x) => x.user_id === w.userId('accounting@example.invalid') && x.made_at === NOW && x.used_at === null));
      assert.ok(r.every((x) => /^[0-9a-f]{64}$/.test(x.code_hash)));
      const made = w.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'RECOVERY_CODES_MADE'");
      assert.equal(made.length, 1);
      assert.deepEqual(JSON.parse(made[0]!.detail), { because: 'SECOND_STEP_SET_UP', made: 10, unused_thrown_away: 0 });
    } finally { w.close(); }
  });
});

/* ================================================================== 2. using one */

describe('151m · 2 · a recovery code in place of the app or email code', () => {
  test('the step page offers it; one code signs in once and never twice; it is typed any case, with or without the dash', async () => {
    const w = await world();
    try {
      const { codes } = await w.setUpApp('sales@example.invalid');
      const b = await w.atVerify('sales@example.invalid');
      const step = await b.req('/login/step');
      assert.match(step.body, /Lost your phone\? Use one of your recovery codes/);
      assert.match(step.body, /href="\/login\/step\?use=recovery">Use a recovery code instead/);
      const form = await b.req('/login/step?use=recovery');
      assert.match(form.body, /action="\/login\/step\/recovery"/);
      const ok = await b.post('/login/step/recovery', { code: codes[0]! });
      assert.equal(ok.status, 303);
      assert.equal(ok.location, '/staff');
      assert.ok(b.jar.has('cb_session'));
      assert.equal((await b.req('/staff')).status, 200);
      // the same code again: refused
      const b2 = await w.atVerify('sales@example.invalid');
      const again = await b2.post('/login/step/recovery', { code: codes[0]! });
      assert.equal(again.status, 400);
      assert.ok(again.body.includes(WRONG_RECOVERY));
      assert.ok(!b2.jar.has('cb_session'));
      // another code, typed in small letters with a space for the dash
      const sloppy = codes[1]!.toLowerCase().replace('-', ' ');
      assert.equal((await b2.post('/login/step/recovery', { code: sloppy })).location, '/staff');
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NOT NULL')?.n, 2);
    } finally { w.close(); }
  });

  test('a person with email codes can use one too', async () => {
    const w = await world();
    try {
      const b = w.browser();
      await b.post('/login', { email: 'surveying@example.invalid', password: SEED_PASSWORD });
      await b.post('/login/step/method', { method: 'EMAIL' });
      const code = /code is (\d{6})/.exec(w.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'SIGN_IN_CODE' ORDER BY rowid DESC LIMIT 1")?.body ?? '')?.[1] ?? '';
      const codes = w.codesOn((await b.post('/login/step/code', { code })).body);
      assert.equal(codes.length, 10);
      const v = await w.atVerify('surveying@example.invalid');
      assert.match((await v.req('/login/step')).body, /Cannot get to your email\? Use one of your recovery codes/);
      assert.equal((await v.post('/login/step/recovery', { code: codes[3]! })).location, '/staff');
    } finally { w.close(); }
  });

  test('a wrong recovery code counts toward the same 5 wrong codes', async () => {
    const w = await world();
    try {
      const { secret, codes } = await w.setUpApp('admin@example.invalid');
      const b = await w.atVerify('admin@example.invalid');
      const bad = w.appCode(secret, 1) === '999999' ? '888888' : '999999';
      for (let i = 0; i < SI.MAX_WRONG_CODES - 1; i++) assert.equal((await b.post('/login/step/code', { code: bad })).status, 400);
      assert.equal((await b.post('/login/step/recovery', { code: 'AAAAA-AAAAA' })).status, 400, 'the fifth wrong code');
      const gone = await b.post('/login/step/recovery', { code: codes[0]! });
      assert.equal(gone.status, 401, 'a sixth try was taken');
      assert.ok(gone.body.includes(SI.TOO_MANY_CODES));
      assert.ok(!b.jar.has('cb_session'));
      // and five wrong recovery codes stop the right app code too
      const b2 = await w.atVerify('admin@example.invalid');
      for (let i = 0; i < SI.MAX_WRONG_CODES; i++) assert.equal((await b2.post('/login/step/recovery', { code: 'not-a-code' })).status, 400);
      assert.equal((await b2.post('/login/step/code', { code: w.appCode(secret, 1) })).status, 401);
      // the right code was not spent by the refused try
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL')?.n, 10);
    } finally { w.close(); }
  });

  test('the email and the audit row say how many are left, and carry no code; the email is not a kind the outbox empties', async () => {
    const w = await world();
    try {
      const { codes } = await w.setUpApp('sales@example.invalid');
      const b = await w.atVerify('sales@example.invalid');
      await b.post('/login/step/recovery', { code: codes[4]! });
      const used = w.db.all<{ detail: string; actor_id: string }>("SELECT detail, actor_id FROM audit_log WHERE kind = 'RECOVERY_CODE_USED'");
      assert.equal(used.length, 1);
      assert.deepEqual(JSON.parse(used[0]!.detail), { left: 9 });
      assert.equal(used[0]!.actor_id, w.userId('sales@example.invalid'));
      const mail = w.db.get<{ to_email: string; kind: string; subject: string; body: string }>(
        "SELECT to_email, kind, subject, body FROM outbox WHERE kind = 'RECOVERY_CODE_USED'");
      assert.ok(mail !== undefined, 'no email about the used code');
      assert.equal(mail.to_email, 'sales@example.invalid');
      assert.match(mail.body, /You have 9 codes left/);
      const all = w.everywhere();
      for (const c of codes) assert.ok(!all.includes(c) && !all.includes(c.replace('-', '')), `${c} was written down`);
      assert.ok(!EP.SENT_SECRET_KINDS.includes('RECOVERY_CODE_USED'), 'an email with no code in it is emptied');
      const login = w.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'LOGIN_SUCCEEDED' ORDER BY seq DESC LIMIT 1");
      assert.deepEqual(JSON.parse(login!.detail), { second_factor: 'RECOVERY_CODE' });
    } finally { w.close(); }
  });

  test('with 2 or fewer left, the page after sign-in says so and offers new ones', async () => {
    const w = await world();
    try {
      const { codes } = await w.setUpApp('sales@example.invalid');
      // seven gone already (the rows are written in the order the codes were shown, so the last three are left);
      // one more used leaves two
      w.db.run('DELETE FROM recovery_codes WHERE rowid IN (SELECT rowid FROM recovery_codes ORDER BY rowid LIMIT 7)');
      const probe = await w.atVerify('sales@example.invalid');
      const used = await probe.post('/login/step/recovery', { code: codes[7]! });
      assert.equal(used.location, '/staff/two-factor', 'with two left, the page after sign-in is not "Your second step"');
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recovery_codes WHERE used_at IS NULL')?.n, 2);
      const b = await w.atVerify('sales@example.invalid');
      const r = await b.post('/login/step/code', { code: w.appCode((await w.db.get<{ s: string }>("SELECT mfa_secret AS s FROM users WHERE email_canonical = 'sales@example.invalid'"))!.s, 1) });
      assert.equal(r.location, '/staff/two-factor', 'the page after sign-in is not "Your second step"');
      const page = await b.req('/staff/two-factor');
      assert.match(page.body, /You have 2 recovery codes left\. Make new ones now/);
      assert.match(page.body, /Make new recovery codes/);
      assert.match(w.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'RECOVERY_CODE_USED' ORDER BY rowid DESC LIMIT 1")!.body,
        /You have 2 codes left\. Make new ones soon/);
    } finally { w.close(); }
  });

  test('a recovery code does not set a second step up, and is not taken on the six-digit code form', async () => {
    const w = await world();
    try {
      const { codes } = await w.setUpApp('sales@example.invalid');
      const b = await w.atVerify('sales@example.invalid');
      assert.equal((await b.post('/login/step/code', { code: codes[0]! })).status, 400);
      // a person setting a step up for the first time has no codes, and the recovery route does nothing there
      const n = w.browser();
      await n.post('/login', { email: 'admin@example.invalid', password: SEED_PASSWORD });
      const r = await n.post('/login/step/recovery', { code: codes[1]! });
      assert.ok(!n.jar.has('cb_session'));
      assert.match(r.body, /Set up your second step/);
    } finally { w.close(); }
  });
});

/* ================================================================== 3. new codes, and what clears them */

describe('151m · 3 · making new codes voids the old; three things clear them, and a temporary password does not', () => {
  test('"Make new recovery codes" shows ten new ones once and every old one stops working', async () => {
    const w = await world();
    try {
      const { b, codes: old } = await w.setUpApp('sales@example.invalid');
      const mine = await b.req('/staff/two-factor');
      assert.match(mine.body, /action="\/staff\/two-factor\/recovery-codes"/);
      const fresh = await b.post('/staff/two-factor/recovery-codes', {});
      assert.equal(fresh.status, 200);
      const codes = w.codesOn(fresh.body);
      assert.equal(codes.length, 10);
      assert.ok(codes.every((c) => !old.includes(c)));
      assert.equal(w.rows('sales@example.invalid'), 10);
      const made = w.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'RECOVERY_CODES_MADE' ORDER BY seq");
      assert.deepEqual(JSON.parse(made.at(-1)!.detail), { because: 'ASKED_FOR_NEW', made: 10, unused_thrown_away: 10 });
      const v = await w.atVerify('sales@example.invalid');
      assert.equal((await v.post('/login/step/recovery', { code: old[0]! })).status, 400, 'an old code still works');
      assert.equal((await v.post('/login/step/recovery', { code: codes[0]! })).location, '/staff');
    } finally { w.close(); }
  });

  test('the super user\'s "Reset second step" clears them; a new temporary password does not', async () => {
    const w = await world();
    try {
      const { b: admin } = await w.setUpApp('admin@example.invalid');
      await w.setUpApp('sales@example.invalid');
      const id = w.userId('sales@example.invalid');
      assert.equal((await admin.post(`/staff/users/${id}/temporary-password`, {})).status, 200);
      assert.equal(w.rows('sales@example.invalid'), 10, 'a new temporary password took the recovery codes');
      assert.equal((await admin.post(`/staff/users/${id}/reset-two-factor`, {})).status, 303);
      assert.equal(w.rows('sales@example.invalid'), 0, 'the reset left the recovery codes');
      const d = w.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'TWO_FACTOR_REMOVED' ORDER BY seq DESC LIMIT 1");
      assert.deepEqual(JSON.parse(d!.detail), { by: 'administrator', recovery_codes_cleared: 10 });
    } finally { w.close(); }
  });

  test('setting a new second step up clears the old codes and makes ten new ones', async () => {
    const w = await world();
    try {
      const { b, codes: old } = await w.setUpApp('accounting@example.invalid');
      assert.equal((await b.post('/staff/two-factor/change', {})).location, '/login/step');
      await b.post('/login/step/method', { method: 'APP' });
      const done = await b.post('/login/step/code', { code: w.appCode(w.pendingSecret()) });
      assert.equal(done.status, 200);
      const codes = w.codesOn(done.body);
      assert.equal(codes.length, 10);
      assert.match(done.body, /href="\/staff\/two-factor\?done=set">I have saved them/);
      assert.equal(w.rows('accounting@example.invalid'), 10);
      const v = await w.atVerify('accounting@example.invalid');
      assert.equal((await v.post('/login/step/recovery', { code: old[0]! })).status, 400, 'a code from the old step still works');
      assert.equal((await v.post('/login/step/recovery', { code: codes[0]! })).location, '/staff');
    } finally { w.close(); }
  });

  test('a client too: codes when they set a step up, a code signs them in, and turning the step off clears them', async () => {
    const w = await world();
    try {
      const b = w.browser();
      assert.equal((await b.post('/login', { email: 'client@example.invalid', password: SEED_PASSWORD })).location, '/portal');
      assert.doesNotMatch((await b.req('/portal/two-factor')).body, /Make new recovery codes/, 'new codes offered with no second step');
      await b.post('/portal/two-factor/change', {});
      await b.post('/login/step/method', { method: 'APP' });
      const done = await b.post('/login/step/code', { code: w.appCode(w.pendingSecret()) });
      assert.equal(done.status, 200);
      assert.match(done.body, /href="\/portal\/two-factor\?done=set">I have saved them/);
      const codes = w.codesOn(done.body);
      assert.equal(codes.length, 10);
      const v = await w.atVerify('client@example.invalid');
      assert.match((await v.req('/login/step')).body, /contact us and we will reset your second step/);
      assert.equal((await v.post('/login/step/recovery', { code: codes[9]! })).location, '/portal');
      const fresh = await b.post('/portal/two-factor/recovery-codes', {});
      assert.equal(w.codesOn(fresh.body).length, 10);
      assert.equal((await b.post('/portal/two-factor/off', {})).location, '/portal/two-factor?done=off');
      assert.equal(w.rows('client@example.invalid'), 0, 'turning the step off left the recovery codes');
      const d = w.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'TWO_FACTOR_REMOVED' ORDER BY seq DESC LIMIT 1");
      assert.deepEqual(JSON.parse(d!.detail), { by: 'self', recovery_codes_cleared: 10 });
      // and with no step, no new codes
      assert.equal((await b.post('/portal/two-factor/recovery-codes', {})).status, 400);
      assert.equal(w.rows('client@example.invalid'), 0);
    } finally { w.close(); }
  });
});

/* ================================================================== 4. the JSON API */

describe('151m · 4 · the JSON API walks the same path, on the same functions', () => {
  test('the setting-up answer carries ten codes once; /api/login/step/recovery takes one once; new ones on /api/account/recovery-codes', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const key = String((await w.api('/api/login/step/method', { step_token: token, method: 'APP' })).body.app_key).replace(/\s/g, '');
      const set = await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) });
      assert.equal(set.status, 200);
      const codes = set.body.recovery_codes as string[] | undefined;
      assert.ok(Array.isArray(codes) && codes.length === 10, 'the answer does not carry the codes');
      for (const c of codes) assert.match(c, CODE);
      const session = set.cookies.get('cb_session')!;

      const again = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(again.body.step, 'VERIFY');
      assert.equal(again.body.recovery_code, true);
      assert.equal(again.body.recovery_codes, undefined, 'codes shown again');
      const t2 = String(again.body.step_token);
      const used = await w.api('/api/login/step/recovery', { step_token: t2, code: codes[0] });
      assert.equal(used.status, 200);
      assert.equal(used.body.recovery_codes_left, 9);
      assert.equal(used.body.recovery_codes, undefined);
      assert.ok(used.cookies.get('cb_session'));

      const t3 = String((await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD })).body.step_token);
      const twice = await w.api('/api/login/step/recovery', { step_token: t3, code: codes[0] });
      assert.equal(twice.status, 400);
      assert.equal(twice.body.error, WRONG_RECOVERY);
      // a code from the API signs in on the website: the same rows
      const b = await w.atVerify('sales@example.invalid');
      assert.equal((await b.post('/login/step/recovery', { code: codes[1]! })).location, '/staff');

      const fresh = await w.api('/api/account/recovery-codes', {}, session);
      assert.equal(fresh.status, 200);
      const next = fresh.body.recovery_codes as string[];
      assert.equal(next.length, 10);
      const t4 = String((await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD })).body.step_token);
      assert.equal((await w.api('/api/login/step/recovery', { step_token: t4, code: codes[2] })).status, 400, 'an old code still works');
      assert.equal((await w.api('/api/login/step/recovery', { step_token: t4, code: next[0] })).status, 200);
      assert.equal((await w.api('/api/account/recovery-codes', {})).status, 401, 'new codes without a session');
      // one implementation: server.ts calls the functions of src/web/sign-in.ts and hashes nothing itself
      const src = readFileSync(join(import.meta.dirname, '..', 'src', 'server.ts'), 'utf8');
      assert.match(src, /SI\.submitRecoveryCode\(/);
      assert.match(src, /SI\.makeNewRecoveryCodes\(/);
      assert.doesNotMatch(src, /scrypt|recovery_codes WHERE/);
    } finally { w.close(); }
  });

  test('a wrong recovery code on the API counts toward the same 5', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'accounting@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const key = String((await w.api('/api/login/step/method', { step_token: token, method: 'APP' })).body.app_key).replace(/\s/g, '');
      const codes = (await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) })).body.recovery_codes as string[];
      const t = String((await w.api('/api/login', { email: 'accounting@example.invalid', password: SEED_PASSWORD })).body.step_token);
      for (let i = 0; i < SI.MAX_WRONG_CODES; i++) assert.equal((await w.api('/api/login/step/recovery', { step_token: t, code: 'BBBBB-BBBBB' })).status, 400);
      assert.equal((await w.api('/api/login/step/recovery', { step_token: t, code: codes![0] })).status, 401);
    } finally { w.close(); }
  });
});

/* ================================================================== 5. the words */

describe('151m · 5 · the words: the step page, Help and the guide name recovery codes', () => {
  test('Help and the guide say what they are, where to keep them, and what to do when they run out', () => {
    const help = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'help-content.ts'), 'utf8');
    const guide = readFileSync(join(import.meta.dirname, '..', '..', 'CAPREBATE-ADMIN-AND-USER-GUIDE.md'), 'utf8');
    for (const [name, text] of [['Help', help], ['the guide', guide]] as const) {
      assert.match(text, /recovery code/i, `${name} does not mention recovery codes`);
      assert.match(text, /Make new recovery codes/, `${name} does not say how to get new ones`);
      assert.match(text, /works once/i, `${name} does not say each works once`);
    }
  });
});
