/**
 * PHASE 151j, 28 September 2026 — SIGN-IN: FORGOT PASSWORD, TEMPORARY PASSWORDS, AND A SECOND STEP.
 *
 * Lakhbir, 28 September 2026: a "Forgotten your password?" link that emails a reset link; the super user creates an
 * account with a temporary password, and at the first sign-in the person chooses their own and sets up a second step;
 * the second step is a code by email or an authenticator app (no text messages); every staff login must use one, a
 * client may; the super user assigns the role.
 *
 * EVERY TEST HERE RUNS ON THE DEFAULT APPLICATION - the second step on, as it ships. Invented people, a fixed clock,
 * no network: an emailed code is read from the outbox, where the email transport puts it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { login, SECOND_STEP_NEEDED, TEMPORARY_PASSWORD_EXPIRED } from '../src/auth.ts';
import { base32Decode, base32Encode, codeAt, hotp, stepAt, verifyCode } from '../src/totp.ts';
import { MAX_WRONG_CODES, STEP_GONE, TOO_MANY_CODES, WRONG_CODE } from '../src/web/sign-in.ts';

const NOW = '2026-09-28T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);

/* ================================================================== the authenticator code itself */

describe('151j · the authenticator code is RFC 6238, proved on the RFC’s own test vectors', () => {
  const secret = new TextEncoder().encode('12345678901234567890');
  test('HOTP/TOTP SHA-1 at the RFC’s times, eight digits', () => {
    for (const [time, want] of [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037']] as const) {
      assert.equal(hotp(secret, Math.floor(time / 30), 8), want, `at ${time}`);
    }
  });
  test('base32 both ways, and the six-digit code an app shows', () => {
    const b32 = base32Encode(secret);
    assert.equal(b32, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.deepEqual([...base32Decode(b32)], [...secret]);
    assert.equal(codeAt(b32, Math.floor(59 / 30)), '287082');
  });
  test('a code is good for the step before, now and after - and never for a step at or before the last one used', () => {
    const b32 = base32Encode(secret);
    const now = stepAt(NOW_MS);
    assert.equal(verifyCode(b32, codeAt(b32, now), NOW_MS, null), now);
    assert.equal(verifyCode(b32, codeAt(b32, now - 1), NOW_MS, null), now - 1);
    assert.equal(verifyCode(b32, codeAt(b32, now + 2), NOW_MS, null), null, 'a code a minute ahead');
    assert.equal(verifyCode(b32, codeAt(b32, now), NOW_MS, now), null, 'the same code twice');
    assert.equal(verifyCode(b32, '12345', NOW_MS, null), null);
  });
});

/* ================================================================== a running application, as it ships */

type Res = { status: number; body: string; location: string | null };
async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151j-')), now: () => NOW, sealKey: randomBytes(32) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  /** A browser: a cookie jar that keeps each cookie by name and drops one the server clears. */
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
  const user = (email: string) => db.get<{ id: string; mfa_method: string | null; mfa_secret: string | null; password_temporary_until: string | null }>(
    'SELECT id, mfa_method, mfa_secret, password_temporary_until FROM users WHERE email_canonical = ?', [email]);
  const pendingSecret = () => db.get<{ pending_secret: string }>("SELECT pending_secret FROM sign_in_steps WHERE finished_at IS NULL AND pending_secret IS NOT NULL ORDER BY rowid DESC LIMIT 1")!.pending_secret;
  const lastEmail = (subject: string) => db.get<{ to_email: string; body: string }>('SELECT to_email, body FROM outbox WHERE subject = ? ORDER BY rowid DESC LIMIT 1', [subject]);
  const emailedCode = () => /code is (\d{6})/.exec(lastEmail('Your Cap Rebate sign-in code')?.body ?? '')?.[1] ?? '';
  const appCode = (secret: string, ahead = 0) => codeAt(secret, stepAt(NOW_MS) + ahead);
  /** A staff login with no second step yet: sign in, choose the app, prove it. Returns the browser and the secret. */
  async function staffWithApp(email: string, password = SEED_PASSWORD) {
    const b = browser();
    assert.equal((await b.post('/login', { email, password })).location, '/login/step');
    await b.post('/login/step/method', { method: 'APP' });
    const secret = pendingSecret();
    const done = await b.post('/login/step/code', { code: appCode(secret) });
    assert.equal(done.status, 303, done.body.slice(0, 300));
    return { b, secret };
  }
  return { made, db, browser, user, pendingSecret, lastEmail, emailedCode, appCode, staffWithApp, base, close: () => { made.server.close(); made.close(); } };
}

describe('151j · every staff login gives a second step; a password alone opens nothing', () => {
  test('a right password is not a session: it is the step page, and the back office still refuses', async () => {
    const w = await world();
    try {
      const b = w.browser();
      const r = await b.post('/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.status, 303);
      assert.equal(r.location, '/login/step');
      assert.ok(!b.jar.has('cb_session'), 'a session was issued on the password alone');
      assert.notEqual((await b.req('/staff')).status, 200, 'the back office opened on the password alone');
      const step = await b.req('/login/step');
      assert.match(step.body, /Set up your second step/);
      assert.match(step.body, /value="APP"/);
      assert.match(step.body, /value="EMAIL"/);
      assert.doesNotMatch(step.body, /value="SMS"/, 'text messages were decided against');
    } finally { w.close(); }
  });

  test('the authenticator app: a QR code and a key, a wrong code refused, the right one signs in and is remembered', async () => {
    const w = await world();
    try {
      const b = w.browser();
      await b.post('/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const page = await b.post('/login/step/method', { method: 'APP' });
      assert.match(page.body, /<svg[^>]*viewBox/, 'no QR code');
      const secret = w.pendingSecret();
      assert.ok(page.body.includes(secret.slice(0, 4)), 'the key to type is not shown');
      const wrong = await b.post('/login/step/code', { code: '000000' === w.appCode(secret) ? '111111' : '000000' });
      assert.equal(wrong.status, 400);
      assert.ok(wrong.body.includes(WRONG_CODE));
      const right = await b.post('/login/step/code', { code: w.appCode(secret) });
      assert.equal(right.status, 303);
      assert.equal(right.location, '/staff');
      assert.ok(b.jar.has('cb_session') && !b.jar.has('cb_step'));
      assert.equal((await b.req('/staff')).status, 200);
      const u = w.user('sales@example.invalid')!;
      assert.equal(u.mfa_method, 'APP');
      assert.equal(u.mfa_secret, secret);
      const audit = w.db.all<{ kind: string; detail: string }>("SELECT kind, detail FROM audit_log WHERE kind IN ('TWO_FACTOR_SET_UP', 'LOGIN_SUCCEEDED') ORDER BY seq");
      assert.deepEqual(audit.map((x) => x.kind), ['TWO_FACTOR_SET_UP', 'LOGIN_SUCCEEDED']);
      assert.ok(!JSON.stringify(audit).includes(secret), 'the secret reached the audit log');
    } finally { w.close(); }
  });

  test('the next sign-in asks for the app code; the same code cannot be used twice', async () => {
    const w = await world();
    try {
      const { secret } = await w.staffWithApp('accounting@example.invalid');
      const b = w.browser();
      await b.post('/login', { email: 'accounting@example.invalid', password: SEED_PASSWORD });
      assert.match((await b.req('/login/step')).body, /authenticator app/);
      const reused = await b.post('/login/step/code', { code: w.appCode(secret) });
      assert.equal(reused.status, 400, 'a code already used was accepted');
      const next = await b.post('/login/step/code', { code: w.appCode(secret, 1) });
      assert.equal(next.status, 303);
      assert.equal(next.location, '/staff');
    } finally { w.close(); }
  });

  test('a code by email: sent to their own address, kept only as a hash, and it signs in', async () => {
    const w = await world();
    try {
      const b = w.browser();
      await b.post('/login', { email: 'surveying@example.invalid', password: SEED_PASSWORD });
      const sent = await b.post('/login/step/method', { method: 'EMAIL' });
      assert.match(sent.body, /We sent a six-number code/);
      const mail = w.lastEmail('Your Cap Rebate sign-in code');
      assert.equal(mail?.to_email, 'surveying@example.invalid');
      const code = w.emailedCode();
      assert.match(code, /^\d{6}$/);
      assert.ok(!JSON.stringify(w.db.all('SELECT * FROM sign_in_steps')).includes(code), 'the code is stored in clear');
      assert.ok(!JSON.stringify(w.db.all('SELECT detail FROM audit_log')).includes(code), 'the code reached the audit log');
      const ok = await b.post('/login/step/code', { code });
      assert.equal(ok.status, 303);
      assert.equal(w.user('surveying@example.invalid')?.mfa_method, 'EMAIL');
      // and next time a fresh code is emailed at the password
      const b2 = w.browser();
      await b2.post('/login', { email: 'surveying@example.invalid', password: SEED_PASSWORD });
      const code2 = w.emailedCode();
      assert.notEqual(code2, '');
      assert.equal((await b2.post('/login/step/code', { code: code2 })).status, 303);
    } finally { w.close(); }
  });

  test(`${MAX_WRONG_CODES} wrong codes end the sign-in: the right code after that is refused`, async () => {
    const w = await world();
    try {
      const b = w.browser();
      await b.post('/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      await b.post('/login/step/method', { method: 'APP' });
      const secret = w.pendingSecret();
      const bad = w.appCode(secret) === '999999' ? '888888' : '999999';
      for (let i = 0; i < MAX_WRONG_CODES; i++) assert.equal((await b.post('/login/step/code', { code: bad })).status, 400);
      const gone = await b.post('/login/step/code', { code: w.appCode(secret) });
      assert.equal(gone.status, 401);
      assert.ok(gone.body.includes(TOO_MANY_CODES) || gone.body.includes(STEP_GONE));
      assert.ok(!b.jar.has('cb_session'));
      assert.equal(w.user('sales@example.invalid')?.mfa_method, null);
    } finally { w.close(); }
  });

  test('the JSON API cannot be used to go round the second step', async () => {
    const w = await world();
    try {
      const r = await fetch(`${w.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.invalid', password: SEED_PASSWORD }) });
      // PHASE 151k: the API now walks the same steps (test/phase151k.test.ts) - the password answers 202 with the step
      // still to do. What this test guards is unchanged: no session on a password alone.
      assert.equal(r.status, 202);
      assert.equal((await r.json() as { step: string }).step, 'SETUP');
      assert.equal(r.headers.getSetCookie().length, 0, 'the API issued a session on a password alone');
      // and login() itself, which walks no step, still refuses
      const e = await login(w.made.app.deps, 'admin@example.invalid', SEED_PASSWORD).catch((x: unknown) => x);
      assert.equal((e as { message?: string }).message, SECOND_STEP_NEEDED);
    } finally { w.close(); }
  });

  test('a step that has timed out, or a made-up step cookie, goes back to sign in', async () => {
    const w = await world();
    try {
      const b = w.browser();
      b.jar.set('cb_step', 'f'.repeat(64));
      const r = await b.req('/login/step');
      assert.ok(r.body.includes(STEP_GONE));
    } finally { w.close(); }
  });
});

describe('151j · a client may choose a second step; staff cannot turn theirs off', () => {
  test('the client signs in with a password alone, sets up a step from the portal, is then asked for it, and may turn it off', async () => {
    const w = await world();
    try {
      const b = w.browser();
      const first = await b.post('/login', { email: 'client@example.invalid', password: SEED_PASSWORD });
      assert.equal(first.location, '/portal', 'a client with no second step was stopped');
      const mine = await b.req('/portal/two-factor');
      assert.match(mine.body, /nothing yet/);
      assert.equal((await b.post('/portal/two-factor/change', {})).location, '/login/step');
      await b.post('/login/step/method', { method: 'APP' });
      const secret = w.pendingSecret();
      const done = await b.post('/login/step/code', { code: w.appCode(secret) });
      assert.equal(done.location, '/portal/two-factor?done=set');
      const again = w.browser();
      assert.equal((await again.post('/login', { email: 'client@example.invalid', password: SEED_PASSWORD })).location, '/login/step');
      assert.equal((await again.post('/login/step/code', { code: w.appCode(secret, 1) })).location, '/portal');
      assert.equal((await b.post('/portal/two-factor/off', {})).location, '/portal/two-factor?done=off');
      assert.equal(w.user('client@example.invalid')?.mfa_method, null);
    } finally { w.close(); }
  });

  test('staff cannot turn theirs off', async () => {
    const w = await world();
    try {
      const { b } = await w.staffWithApp('sales@example.invalid');
      const r = await b.post('/staff/two-factor/off', {});
      assert.equal(r.status, 400);
      assert.match(r.body, /cannot be turned off|not turn it off/);
      assert.equal(w.user('sales@example.invalid')?.mfa_method, 'APP');
    } finally { w.close(); }
  });
});

describe('151j · the super user creates accounts with a temporary password, assigns the role, and can reset either step', () => {
  test('create: a temporary password shown once, seven days, never stored in clear; the person must choose their own and set up a step', async () => {
    const w = await world();
    try {
      const { b: admin } = await w.staffWithApp('admin@example.invalid');
      const made = await admin.post('/staff/users/create', { email: 'new.starter@example.invalid', display_name: 'New Starter', role: 'ACCOUNTING' });
      assert.equal(made.status, 200, made.body.slice(0, 300));
      const temp = /id="temporary-password">([^<]+)</.exec(made.body)?.[1] ?? '';
      assert.match(temp, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
      assert.match(made.body, /ACCOUNTING/);
      const u = w.user('new.starter@example.invalid')!;
      assert.equal(u.password_temporary_until, '2026-10-05T10:00:00.000Z');
      assert.ok(!JSON.stringify(w.db.all('SELECT * FROM users')).includes(temp), 'the temporary password is stored in clear');
      assert.ok(!JSON.stringify(w.db.all('SELECT detail FROM audit_log')).includes(temp), 'the temporary password reached the audit log');
      assert.equal(w.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [u.id])?.role, 'ACCOUNTING');

      const p = w.browser();
      assert.equal((await p.post('/login', { email: 'new.starter@example.invalid', password: temp })).location, '/login/step');
      assert.match((await p.req('/login/step')).body, /Choose your own password/);
      assert.match((await p.post('/login/step/password', { password: temp, again: temp })).body, /not the temporary one/);
      assert.match((await p.post('/login/step/password', { password: 'my-own-invented-password', again: 'something-else-entirely' })).body, /not the same/);
      const chosen = await p.post('/login/step/password', { password: 'my-own-invented-password', again: 'my-own-invented-password' });
      assert.match(chosen.body, /Set up your second step/, 'staff went on without a second step');
      await p.post('/login/step/method', { method: 'APP' });
      assert.equal((await p.post('/login/step/code', { code: w.appCode(w.pendingSecret()) })).location, '/staff');
      assert.equal(w.user('new.starter@example.invalid')?.password_temporary_until, null);
      // the temporary password no longer works
      assert.equal((await w.browser().post('/login', { email: 'new.starter@example.invalid', password: temp })).status, 401);
    } finally { w.close(); }
  });

  test('a temporary password past its seven days is refused, and says so', async () => {
    const w = await world();
    try {
      const { b: admin } = await w.staffWithApp('admin@example.invalid');
      const made = await admin.post('/staff/users/create', { email: 'late.starter@example.invalid', display_name: 'Late Starter', role: 'SALES' });
      const temp = /id="temporary-password">([^<]+)</.exec(made.body)?.[1] ?? '';
      w.db.run("UPDATE users SET password_temporary_until = '2026-09-28T09:59:59.000Z' WHERE email_canonical = 'late.starter@example.invalid'");
      const r = await w.browser().post('/login', { email: 'late.starter@example.invalid', password: temp });
      assert.equal(r.status, 401);
      assert.ok(r.body.includes(TEMPORARY_PASSWORD_EXPIRED));
    } finally { w.close(); }
  });

  test('a new temporary password ends their sessions and replaces their password; resetting the second step makes them set it up again', async () => {
    const w = await world();
    try {
      const { b: admin } = await w.staffWithApp('admin@example.invalid');
      const { b: sales } = await w.staffWithApp('sales@example.invalid');
      const id = w.user('sales@example.invalid')!.id;
      const issued = await admin.post(`/staff/users/${id}/temporary-password`, {});
      const temp = /id="temporary-password">([^<]+)</.exec(issued.body)?.[1] ?? '';
      assert.notEqual(temp, '');
      assert.notEqual((await sales.req('/staff')).status, 200, 'their session survived');
      assert.equal((await w.browser().post('/login', { email: 'sales@example.invalid', password: SEED_PASSWORD })).status, 401, 'the old password still works');
      assert.equal((await admin.post(`/staff/users/${id}/reset-two-factor`, {})).status, 303);
      assert.equal(w.user('sales@example.invalid')?.mfa_method, null);
      const p = w.browser();
      await p.post('/login', { email: 'sales@example.invalid', password: temp });
      await p.post('/login/step/password', { password: 'sales-own-invented-pw', again: 'sales-own-invented-pw' });
      assert.match((await p.req('/login/step')).body, /Set up your second step/);
    } finally { w.close(); }
  });

  test('only the super user: Sales cannot give a temporary password or reset a step', async () => {
    const w = await world();
    try {
      const { b: sales } = await w.staffWithApp('sales@example.invalid');
      const admin = w.user('admin@example.invalid')!.id;
      assert.equal((await sales.post(`/staff/users/${admin}/temporary-password`, {})).status, 403);
      assert.equal((await sales.post(`/staff/users/${admin}/reset-two-factor`, {})).status, 403);
    } finally { w.close(); }
  });

  test('the users page offers both, and no longer asks the super user to type a password', async () => {
    const w = await world();
    try {
      const { b: admin } = await w.staffWithApp('admin@example.invalid');
      const page = await admin.req('/staff/users');
      assert.match(page.body, /New temporary password/);
      assert.match(page.body, /Reset second step/);
      assert.doesNotMatch(page.body, /name="password"/);
    } finally { w.close(); }
  });
});

describe('151j · a forgotten password: an emailed link, the same answer for any address, used once', () => {
  test('the sign-in page links to it; a known and an unknown address get the same words; only the known one is emailed', async () => {
    const w = await world();
    try {
      const b = w.browser();
      assert.match((await b.req('/login')).body, /href="\/login\/forgot"/);
      const known = await b.post('/login/forgot', { email: 'sales@example.invalid' });
      const unknown = await b.post('/login/forgot', { email: 'nobody.here@example.invalid' });
      assert.equal(known.status, 200);
      assert.equal(unknown.status, 200);
      const said = (x: string) => /<p class="ok">([^<]*)<\/p>/.exec(x)?.[1];
      assert.equal(said(known.body), said(unknown.body), 'the page tells an address with a login from one without');
      assert.equal(w.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'PASSWORD_RESET'")?.n, 1);
      assert.equal(w.lastEmail('Reset your Cap Rebate password')?.to_email, 'sales@example.invalid');
    } finally { w.close(); }
  });

  test('the link sets a new password once; the old one stops; the second step is still asked; the link cannot be used again', async () => {
    const w = await world();
    try {
      await w.staffWithApp('sales@example.invalid');
      const b = w.browser();
      await b.post('/login/forgot', { email: 'sales@example.invalid' });
      const link = /\/login\/reset\?token=([0-9a-f]+)/.exec(w.lastEmail('Reset your Cap Rebate password')?.body ?? '')?.[1] ?? '';
      assert.notEqual(link, '');
      assert.match((await b.req(`/login/reset?token=${link}`)).body, /Choose a new password/);
      assert.equal((await b.post('/login/reset', { token: link, password: 'a-new-invented-password', again: 'different-invented-pw' })).status, 400);
      const done = await b.post('/login/reset', { token: link, password: 'a-new-invented-password', again: 'a-new-invented-password' });
      assert.equal(done.status, 200);
      assert.match(done.body, /Your password has been changed/);
      assert.equal((await w.browser().post('/login', { email: 'sales@example.invalid', password: SEED_PASSWORD })).status, 401);
      const again = await w.browser().post('/login', { email: 'sales@example.invalid', password: 'a-new-invented-password' });
      assert.equal(again.location, '/login/step', 'a reset skipped the second step');
      assert.equal((await b.post('/login/reset', { token: link, password: 'another-invented-pw', again: 'another-invented-pw' })).status, 400, 'the link worked twice');
    } finally { w.close(); }
  });

  test('a reset replaces a temporary password too', async () => {
    const w = await world();
    try {
      w.db.run("UPDATE users SET password_temporary_until = '2026-10-01T00:00:00.000Z' WHERE email_canonical = 'accounting@example.invalid'");
      const b = w.browser();
      await b.post('/login/forgot', { email: 'accounting@example.invalid' });
      const link = /token=([0-9a-f]+)/.exec(w.lastEmail('Reset your Cap Rebate password')?.body ?? '')?.[1] ?? '';
      await b.post('/login/reset', { token: link, password: 'accounting-own-pw-1', again: 'accounting-own-pw-1' });
      assert.equal(w.user('accounting@example.invalid')?.password_temporary_until, null);
    } finally { w.close(); }
  });
});

describe('151j · the test website keeps a password a person chose', () => {
  test('configureTestDeploy moves only the logins still on the public seed password', async () => {
    const w = await world();
    try {
      w.db.run('UPDATE users SET password_hash = ? WHERE email_canonical = ?', [await w.made.app.hasher.hash('my-own-invented-password'), 'sales@example.invalid']);
      const { configureTestDeploy } = (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as {
        configureTestDeploy: (m: unknown, env: Record<string, string>) => Promise<unknown> };
      await configureTestDeploy(w.made, { CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-151j' });
      const hash = (e: string) => w.db.get<{ h: string }>('SELECT password_hash AS h FROM users WHERE email_canonical = ?', [e])!.h;
      assert.equal(await w.made.app.hasher.verify(hash('sales@example.invalid'), 'my-own-invented-password'), true, 'a chosen password was overwritten');
      assert.equal(await w.made.app.hasher.verify(hash('admin@example.invalid'), 'an-invented-test-password-151j'), true);
    } finally { w.close(); }
  });
});
