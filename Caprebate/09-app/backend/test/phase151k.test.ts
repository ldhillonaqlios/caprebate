/**
 * PHASE 151k, 28 September 2026 — SIGN-IN HARDENING: THE JSON API'S STEPS, THE APP SECRET AT REST, CODES AND LINKS
 * OUT OF THE OUTBOX, AND THE SCREENSHOT TOOL PAST THE SECOND STEP.
 *
 * Every test runs on the default application - the second step on, as it ships. Invented people, a fixed clock, no
 * network beyond the test's own server on 127.0.0.1. The modules this phase changed are imported whole (`* as`), so
 * that this file also runs against the code as it was before the phase and fails there on its assertions, not on an
 * import - that is how each test here was proved red.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { codeAt, stepAt } from '../src/totp.ts';
import { forgetRegisteredSecretsForTest, loadSecrets, secretsFromValues, emptySecrets, SECRET_KEYS } from '../src/secrets.ts';
import { outboxTransport } from '../src/stubs/email.ts';
import * as SI from '../src/web/sign-in.ts';
import * as EP from '../src/stubs/email-provider.ts';
import type { EmailSending, SmtpLogin } from '../src/stubs/email-provider.ts';

const NOW = '2026-09-28T10:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');

/** A module this phase added, or undefined where it does not exist yet (the pre-change run). */
async function maybe<T>(rel: string): Promise<T | undefined> {
  try { return (await import(new URL(rel, import.meta.url).href)) as T; } catch { return undefined; }
}
type MfaModule = typeof import('../src/mfa-seal.ts');
type ToolModule = typeof import('../tools/demo-sign-in.ts');

type Json = { status: number; body: Record<string, unknown>; cookies: Map<string, string> };

async function world() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151k-')), now: () => NOW });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const setKey = (key: Buffer | string | null): void => {
    forgetRegisteredSecretsForTest();
    made.app.secrets = key === null ? emptySecrets() : secretsFromValues({ CAPREBATE_MFA_KEY: typeof key === 'string' ? key : key.toString('base64') });
  };
  /** A JSON call to the API, with a cookie jar of its own if given one. */
  const api = async (path: string, body: Record<string, unknown>, jar?: Map<string, string>): Promise<Json> => {
    const cookie = jar === undefined ? '' : [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(base + path, { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/json', ...(cookie === '' ? {} : { cookie }) }, body: JSON.stringify(body) });
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
  const whoami = async (session: string | undefined) =>
    (await fetch(`${base}/api/whoami`, { headers: session === undefined ? {} : { cookie: `cb_session=${session}` } })).status;
  const user = (email: string) => db.get<{ id: string; mfa_method: string | null; mfa_secret: string | null; mfa_last_step: number | null }>(
    'SELECT id, mfa_method, mfa_secret, mfa_last_step FROM users WHERE email_canonical = ?', [email]);
  const lastCode = () => /code is (\d{6})/.exec(db.get<{ body: string }>(
    "SELECT body FROM outbox WHERE subject = 'Your Cap Rebate sign-in code' ORDER BY rowid DESC LIMIT 1")?.body ?? '')?.[1] ?? '';
  const appCode = (key: string, ahead = 0) => codeAt(key.replace(/\s/g, ''), stepAt(NOW_MS) + ahead);
  /** Sign a staff login in through the API with an app. Returns the key and the session. */
  async function apiWithApp(email: string): Promise<{ key: string; session: string }> {
    const first = await api('/api/login', { email, password: SEED_PASSWORD });
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const token = String(first.body.step_token);
    const chosen = await api('/api/login/step/method', { step_token: token, method: 'APP' });
    const key = String(chosen.body.app_key ?? '');
    const done = await api('/api/login/step/code', { step_token: token, code: appCode(key) });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    return { key, session: done.cookies.get('cb_session') ?? '' };
  }
  return { made, db, base, api, whoami, user, lastCode, appCode, apiWithApp, setKey,
    close: () => { forgetRegisteredSecretsForTest(); made.server.close(); made.close(); } };
}

/* ================================================================== 1. the JSON API's steps */

describe('151k · 1 · the JSON API walks the steps, on the same functions as the website', () => {
  test('the password answers 202 with the step and a step token, and never a session', async () => {
    const w = await world();
    try {
      const r = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.status, 202);
      assert.equal(r.body.step, 'SETUP');
      assert.equal(r.body.needs, 'CHOOSE_METHOD');
      assert.match(String(r.body.step_token), /^[0-9a-f]{64}$/);
      assert.equal(r.cookies.has('cb_session'), false, 'a session on the password alone');
      assert.equal(r.cookies.size, 0, 'a cookie was set: the API carries the step token in the body');
      assert.equal(await w.whoami(undefined), 401);
      // only the token's hash is kept
      assert.ok(!JSON.stringify(w.db.all('SELECT * FROM sign_in_steps')).includes(String(r.body.step_token)));
    } finally { w.close(); }
  });

  test('an authenticator app: the key and the QR address once, a wrong code refused, the right one a session', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'accounting@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const chosen = await w.api('/api/login/step/method', { step_token: token, method: 'APP' });
      assert.equal(chosen.status, 202);
      assert.equal(chosen.body.needs, 'ADD_APP');
      const key = String(chosen.body.app_key ?? '');
      assert.match(key, /^[A-Z2-7 ]{32,}$/);
      assert.match(String(chosen.body.otpauth_uri), /^otpauth:\/\/totp\//);
      const wrong = await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) === '000000' ? '111111' : '000000' });
      assert.equal(wrong.status, 400);
      assert.equal(wrong.body.error, SI.WRONG_CODE);
      assert.equal(wrong.cookies.has('cb_session'), false);
      const right = await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) });
      assert.equal(right.status, 200);
      assert.equal((right.body.user as { email?: string }).email, 'accounting@example.invalid');
      const session = right.cookies.get('cb_session');
      assert.ok(session !== undefined && session !== '');
      assert.equal(await w.whoami(session), 200);
      assert.equal(w.user('accounting@example.invalid')?.mfa_method, 'APP');
      // the step is finished: its token does nothing now
      assert.equal((await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key, 1) })).status, 401);
    } finally { w.close(); }
  });

  test('the next sign-in asks for the app code, and a code is taken once', async () => {
    const w = await world();
    try {
      const { key } = await w.apiWithApp('sales@example.invalid');
      const again = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(again.status, 202);
      assert.equal(again.body.step, 'VERIFY');
      assert.equal(again.body.method, 'APP');
      assert.equal(again.body.app_key, null, 'the key was shown again after it was set up');
      const token = String(again.body.step_token);
      assert.equal((await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) })).status, 400, 'a used code was taken again');
      assert.equal((await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key, 1) })).status, 200);
    } finally { w.close(); }
  });

  test('an emailed code: sent at the method, resent on asking, and it signs in', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'surveying@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const chosen = await w.api('/api/login/step/method', { step_token: token, method: 'EMAIL' });
      assert.equal(chosen.status, 202);
      assert.equal(chosen.body.needs, 'GIVE_CODE');
      assert.equal(chosen.body.sent_to, 's•••@example.invalid');
      const resent = await w.api('/api/login/step/resend', { step_token: token });
      assert.equal(resent.status, 202);
      assert.equal(resent.body.note, 'We have sent you a new code.');
      const done = await w.api('/api/login/step/code', { step_token: token, code: w.lastCode() });
      assert.equal(done.status, 200);
      assert.equal(w.user('surveying@example.invalid')?.mfa_method, 'EMAIL');
    } finally { w.close(); }
  });

  test(`${SI.MAX_WRONG_CODES} wrong codes end the sign-in, and the right code after that is refused`, async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'admin@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const key = String((await w.api('/api/login/step/method', { step_token: token, method: 'APP' })).body.app_key);
      const bad = w.appCode(key) === '999999' ? '888888' : '999999';
      for (let i = 0; i < SI.MAX_WRONG_CODES; i++) assert.equal((await w.api('/api/login/step/code', { step_token: token, code: bad })).status, 400);
      const gone = await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) });
      assert.equal(gone.status, 401);
      assert.ok(gone.body.error === SI.TOO_MANY_CODES || gone.body.error === SI.STEP_GONE);
      assert.equal(gone.cookies.has('cb_session'), false);
    } finally { w.close(); }
  });

  test('after 15 minutes the step is gone, and a made-up token opens nothing', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      assert.equal((await w.api('/api/login/step', { step_token: token })).status, 202, 'the step could not be read back');
      w.db.run("UPDATE sign_in_steps SET expires_at = '2026-09-28T09:59:59.000Z'");
      const late = await w.api('/api/login/step/method', { step_token: token, method: 'APP' });
      assert.equal(late.status, 401);
      assert.equal(late.body.error, SI.STEP_GONE);
      assert.equal((await w.api('/api/login/step', { step_token: 'f'.repeat(64) })).status, 401);
      assert.equal((await w.api('/api/login/step/code', {})).status, 401);
    } finally { w.close(); }
  });

  test('a temporary password: the API replaces it, then sets up the second step', async () => {
    const w = await world();
    try {
      const temp = 'Invented-Temporary-151k';
      w.db.run('UPDATE users SET password_hash = ?, password_temporary_until = ? WHERE email_canonical = ?',
        [await w.made.app.hasher.hash(temp), '2026-10-01T00:00:00.000Z', 'accounting@example.invalid']);
      const first = await w.api('/api/login', { email: 'accounting@example.invalid', password: temp });
      assert.equal(first.status, 202);
      assert.equal(first.body.needs, 'CHOOSE_PASSWORD');
      const token = String(first.body.step_token);
      const same = await w.api('/api/login/step/new-password', { step_token: token, password: temp, again: temp });
      assert.equal(same.status, 400);
      const chosen = await w.api('/api/login/step/new-password', { step_token: token, password: 'accounting-invented-151k', again: 'accounting-invented-151k' });
      assert.equal(chosen.status, 202);
      assert.equal(chosen.body.needs, 'CHOOSE_METHOD', 'staff went on without a second step');
      assert.equal(chosen.cookies.has('cb_session'), false);
    } finally { w.close(); }
  });

  test('a client with no second step still gets a session from the password, as before', async () => {
    const w = await world();
    try {
      const r = await w.api('/api/login', { email: 'client@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.status, 200);
      assert.equal(await w.whoami(r.cookies.get('cb_session')), 200);
    } finally { w.close(); }
  });

  test('ONE implementation: a step begun on the API is finished on the website, because they are the same rows', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const key = String((await w.api('/api/login/step/method', { step_token: token, method: 'APP' })).body.app_key);
      const r = await fetch(`${w.base}/login/step/code`, { method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `cb_step=${token}` },
        body: new URLSearchParams({ code: w.appCode(key) }).toString() });
      // PHASE 151m: setting the step up answers the recovery codes page, whose one link goes to /staff
      assert.equal(r.status, 200);
      assert.match(await r.text(), /Your recovery codes[\s\S]*href="\/staff">I have saved them/);
      // and server.ts calls the step functions of src/web/sign-in.ts, and verifies no code of its own
      const src = readFileSync(join(import.meta.dirname, '..', 'src', 'server.ts'), 'utf8');
      assert.match(src, /SI\.submitCode\(/);
      assert.doesNotMatch(src, /verifyCode|codeAt|code_hash/);
    } finally { w.close(); }
  });

  test('the website\'s own steps are unchanged: a password is still the step page', async () => {
    const w = await world();
    try {
      const r = await fetch(`${w.base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'sales@example.invalid', password: SEED_PASSWORD }).toString() });
      assert.equal(r.status, 303);
      assert.equal(r.headers.get('location'), '/login/step');
    } finally { w.close(); }
  });
});

/* ================================================================== 2. the app secret at rest */

describe('151k · 2 · the authenticator app\'s secret is sealed where a key is set', () => {
  test('the key is read the way every key is read: CAPREBATE_MFA_KEY, owned by the sign-in, refused inside the repository', async () => {
    const k = SECRET_KEYS.find((s) => s.name === 'CAPREBATE_MFA_KEY');
    assert.ok(k !== undefined, 'CAPREBATE_MFA_KEY is not one of the keys');
    assert.equal(k.owner, 'SIGN_IN');
    assert.equal(k.secret, true);
    const mfa = await maybe<MfaModule>('../src/mfa-seal.ts');
    assert.ok(mfa !== undefined, 'src/mfa-seal.ts does not exist');
    // a key file INSIDE the repository is not read, so no key comes from it
    const root = mkdtempSync(join(tmpdir(), 'cb-151k-repo-'));
    mkdirSync(join(root, '.git'));
    const inside = join(root, 'keys.env');
    writeFileSync(inside, `CAPREBATE_MFA_KEY=${randomBytes(32).toString('base64')}\n`);
    const store = loadSecrets({ env: { CAPREBATE_SECRETS: inside }, repoRoot: root });
    assert.equal(store.state, 'REFUSED_INSIDE_REPOSITORY');
    assert.equal(mfa.mfaKeyFrom(store).state, 'NONE');
    forgetRegisteredSecretsForTest();
  });

  test('with a key: the secret is sealed while it is set up and after, never as text, and it still signs in', async () => {
    const w = await world();
    try {
      w.setKey(randomBytes(32));
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const key = String((await w.api('/api/login/step/method', { step_token: token, method: 'APP' })).body.app_key).replace(/\s/g, '');
      const pending = w.db.get<{ p: string }>('SELECT pending_secret AS p FROM sign_in_steps WHERE pending_secret IS NOT NULL')!.p;
      assert.match(pending, /^cbmfa1:/, 'the secret being set up is kept as text');
      assert.ok(!pending.includes(key));
      assert.equal((await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key) })).status, 200);
      const stored = w.user('sales@example.invalid')!.mfa_secret!;
      assert.match(stored, /^cbmfa1:/, 'users.mfa_secret is kept as text');
      assert.ok(!JSON.stringify(w.db.all('SELECT * FROM users')).includes(key), 'the secret is in the users table as text');
      assert.ok(!JSON.stringify(w.db.all('SELECT detail FROM audit_log')).includes(key));
      const again = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal((await w.api('/api/login/step/code', { step_token: String(again.body.step_token), code: w.appCode(key, 1) })).status, 200);
    } finally { w.close(); }
  });

  test('with no key it stays as today: the secret is kept as text and works', async () => {
    const w = await world();
    try {
      const { key } = await w.apiWithApp('sales@example.invalid');
      assert.equal(w.user('sales@example.invalid')!.mfa_secret, key.replace(/\s/g, ''));
    } finally { w.close(); }
  });

  test('a secret kept as text before the key was set still works, and is sealed the next time it signs in', async () => {
    const w = await world();
    try {
      const { key } = await w.apiWithApp('sales@example.invalid');
      w.setKey(randomBytes(32));
      const again = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal((await w.api('/api/login/step/code', { step_token: String(again.body.step_token), code: w.appCode(key, 1) })).status, 200);
      assert.match(w.user('sales@example.invalid')!.mfa_secret!, /^cbmfa1:/, 'the text secret was not sealed on use');
    } finally { w.close(); }
  });

  test('a sealed secret without its key, or with another key, refuses in words and does not count as a wrong code', async () => {
    const w = await world();
    try {
      w.setKey(randomBytes(32));
      const { key } = await w.apiWithApp('sales@example.invalid');
      const mfa = (await maybe<MfaModule>('../src/mfa-seal.ts'))!;
      for (const k of [null, randomBytes(32)]) {
        w.setKey(k);
        const again = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
        const token = String(again.body.step_token);
        const r = await w.api('/api/login/step/code', { step_token: token, code: w.appCode(key, 1) });
        assert.equal(r.status, 400);
        assert.equal(r.body.error, mfa.MFA_KEY_MISSING);
        assert.equal(r.cookies.has('cb_session'), false);
        assert.equal(w.db.get<{ n: number }>('SELECT attempts AS n FROM sign_in_steps WHERE finished_at IS NULL ORDER BY rowid DESC LIMIT 1')?.n, 0);
      }
    } finally { w.close(); }
  });

  test('a key that is set and not right: an app cannot be set up, and it says so', async () => {
    const w = await world();
    try {
      w.setKey('not-a-32-byte-key-at-all');
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      const r = await w.api('/api/login/step/method', { step_token: token, method: 'APP' });
      const mfa = (await maybe<MfaModule>('../src/mfa-seal.ts'))!;
      assert.equal(r.status, 400);
      assert.equal(r.body.error, mfa.MFA_KEY_BAD);
      assert.equal(w.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sign_in_steps WHERE pending_secret IS NOT NULL')?.n, 0);
      // an emailed code still works
      assert.equal((await w.api('/api/login/step/method', { step_token: token, method: 'EMAIL' })).status, 202);
    } finally { w.close(); }
  });

  test('a sealed secret is bound to its person: copied onto another login it does not open', async () => {
    const mfa = await maybe<MfaModule>('../src/mfa-seal.ts');
    assert.ok(mfa !== undefined, 'src/mfa-seal.ts does not exist');
    const k = { state: 'KEY' as const, key: randomBytes(32) };
    const sealed = mfa.sealSecret(k, 'person-a', 'JBSWY3DPEHPK3PXP');
    assert.ok(sealed.ok);
    assert.deepEqual(mfa.openSecret(k, 'person-a', sealed.stored), { ok: true, secret: 'JBSWY3DPEHPK3PXP' });
    assert.equal(mfa.openSecret(k, 'person-b', sealed.stored).ok, false);
    assert.deepEqual(mfa.openSecret({ state: 'NONE' }, 'person-a', 'JBSWY3DPEHPK3PXP'), { ok: true, secret: 'JBSWY3DPEHPK3PXP' });
  });

  test('seal-app-secrets seals every text secret once, and leaves a sealed one alone', async () => {
    const w = await world();
    try {
      await w.apiWithApp('sales@example.invalid');
      await w.apiWithApp('admin@example.invalid');
      const mfa = (await maybe<MfaModule>('../src/mfa-seal.ts'))!;
      const k = { state: 'KEY' as const, key: randomBytes(32) };
      assert.deepEqual(mfa.sealTextSecrets(w.db, { state: 'NONE' }), { state: 'NONE', sealed: 0 });
      assert.deepEqual(mfa.sealTextSecrets(w.db, k), { state: 'KEY', sealed: 2 });
      const before = w.user('sales@example.invalid')!.mfa_secret;
      assert.deepEqual(mfa.sealTextSecrets(w.db, k), { state: 'KEY', sealed: 0 });
      assert.equal(w.user('sales@example.invalid')!.mfa_secret, before);
    } finally { w.close(); }
  });
});

/* ================================================================== 3. codes and links out of the outbox */

const ON: EmailSending = Object.freeze({
  enabled: true, provider: 'SMTP', named_in_privacy_notice: true, named_in_engagement_letter: true, mailbox_and_dns_ready: true,
  question: EP.EMAIL_PROVIDER_QUESTION,
});
const LOGIN: SmtpLogin = Object.freeze({ host: '127.0.0.1', port: 1, user: 'contact@caprebate.co.uk', password: 'not-a-real-password' });
const noFiles = async (): Promise<null> => null;

describe('151k · 3 · once really sent, a sign-in code or a reset link is taken out of the outbox', () => {
  test('a sign-in code is an email of its own kind', async () => {
    const w = await world();
    try {
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      await w.api('/api/login/step/method', { step_token: String(first.body.step_token), method: 'EMAIL' });
      assert.equal(w.db.get<{ kind: string }>("SELECT kind FROM outbox WHERE subject = 'Your Cap Rebate sign-in code'")?.kind, 'SIGN_IN_CODE');
    } finally { w.close(); }
  });

  test('sent: the code\'s and the link\'s words become one fixed sentence; who, when, the subject and the kind stay; other emails keep theirs', async () => {
    const w = await world();
    try {
      let n = 0;
      const on = outboxTransport(w.db, () => `k-${++n}`, () => NOW, () => true);
      const send = (kind: 'SIGN_IN_CODE' | 'PASSWORD_RESET' | 'NOTIFICATION', body: string) =>
        on.send({ to_email: 'sales@example.invalid', subject: `A ${kind} email`, body, kind }).id!;
      const code = send('SIGN_IN_CODE', 'Your Cap Rebate sign-in code is 123456.');
      const link = send('PASSWORD_RESET', 'Open http://localhost/login/reset?token=abcdef0123456789');
      const other = send('NOTIFICATION', 'A task is due.');
      const r = await EP.dispatchOutbox({ db: w.db, now: () => NOW }, ON, LOGIN, { id: 'SPY', deliver: async () => ({ ok: true, ref: 'x' }) }, noFiles);
      assert.equal(r.state, 'RAN');
      const row = (id: string) => w.db.get<{ body: string; to_email: string; subject: string; kind: string; created_at: string; sent_at: string | null }>(
        'SELECT body, to_email, subject, kind, created_at, sent_at FROM outbox WHERE id = ?', [id])!;
      for (const [id, kind] of [[code, 'SIGN_IN_CODE'], [link, 'PASSWORD_RESET']] as const) {
        const x = row(id);
        assert.equal(x.body, EP.SENT_SECRET_BODY, `${kind} kept its words after it was sent`);
        assert.equal(x.to_email, 'sales@example.invalid');
        assert.equal(x.subject, `A ${kind} email`);
        assert.equal(x.kind, kind);
        assert.equal(x.created_at, NOW);
        assert.equal(x.sent_at, NOW);
      }
      assert.equal(row(other).body, 'A task is due.');
    } finally { w.close(); }
  });

  test('while sending is off nothing is taken out: the only copy stays (the test website prints it to its log)', async () => {
    const w = await world();
    try {
      const off = outboxTransport(w.db, () => 'k-off', () => NOW);
      off.send({ to_email: 'sales@example.invalid', subject: 'code', body: 'Your Cap Rebate sign-in code is 654321.', kind: 'SIGN_IN_CODE' });
      const r = await EP.dispatchOutbox({ db: w.db, now: () => NOW }, EP.EMAIL_SENDING, LOGIN, { id: 'SPY', deliver: async () => ({ ok: true, ref: 'x' }) }, noFiles);
      assert.equal(r.state, 'OFF');
      assert.equal(w.db.get<{ body: string }>("SELECT body FROM outbox WHERE id = 'k-off'")?.body, 'Your Cap Rebate sign-in code is 654321.');
    } finally { w.close(); }
  });

  test('the outbox\'s never-edited rule lets through exactly that edit and no other', async () => {
    const w = await world();
    try {
      let n = 0;
      const on = outboxTransport(w.db, () => `t-${++n}`, () => NOW, () => true);
      const code = on.send({ to_email: 'sales@example.invalid', subject: 's', body: 'code 111111', kind: 'SIGN_IN_CODE' }).id!;
      const note = on.send({ to_email: 'sales@example.invalid', subject: 's', body: 'hello', kind: 'NOTIFICATION' }).id!;
      const refused = (sql: string, args: unknown[]) => assert.throws(() => w.db.run(sql, args as never[]), /never edited/);
      const sentence = String(EP.SENT_SECRET_BODY ?? 'This email held a sign-in code or a password reset link. It was sent, and then its words were removed so the code or link is not kept.');
      refused('UPDATE outbox SET body = ? WHERE id = ?', [sentence, code]); // not sent yet
      w.db.run('UPDATE outbox SET sent_at = ? WHERE id IN (?, ?)', [NOW, code, note]);
      refused('UPDATE outbox SET body = ? WHERE id = ?', ['anything else', code]);
      refused('UPDATE outbox SET body = ? WHERE id = ?', [sentence, note]); // not one of the two kinds
      refused('UPDATE outbox SET to_email = ? WHERE id = ?', ['someone@example.invalid', code]);
      w.db.run('UPDATE outbox SET body = ? WHERE id = ?', [sentence, code]);
      assert.equal(w.db.get<{ body: string }>('SELECT body FROM outbox WHERE id = ?', [code])?.body, sentence);
      // and the migration carries the same sentence as the code
      const mig = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).map((f) => readFileSync(join(MIGRATIONS, f), 'utf8')).join('\n');
      assert.ok(mig.includes(sentence));
    } finally { w.close(); }
  });
});

/* ================================================================== 4. the screenshot tool */

describe('151k · 4 · the screenshot tool signs the demo\'s invented logins in, past the second step', () => {
  test('the old way - a password posted to /login - reaches no staff screen now: it is the step page', async () => {
    const w = await world();
    try {
      const r = await fetch(`${w.base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'admin@example.invalid', password: SEED_PASSWORD }).toString() });
      assert.ok(!r.headers.getSetCookie().some((c) => c.startsWith('cb_session=')));
    } finally { w.close(); }
  });

  test('a staff login: it sets up an app, and its session opens the back office; a second sign-in in the same run uses the key it holds', async () => {
    const tool = await maybe<ToolModule>('../tools/demo-sign-in.ts');
    assert.ok(tool !== undefined, 'tools/demo-sign-in.ts does not exist');
    const w = await world();
    try {
      const keys = new Map<string, string>();
      const r = await tool.demoSignIn(w.base, 'admin@example.invalid', SEED_PASSWORD, { appKeys: keys, nowMs: () => NOW_MS });
      assert.ok(r.ok, r.ok ? '' : r.why);
      assert.equal(r.how, 'set up an authenticator app');
      const session = r.cookies.find((c) => c.name === 'cb_session')?.value;
      const page = await fetch(`${w.base}/staff`, { redirect: 'manual', headers: { cookie: `cb_session=${session}` } });
      assert.equal(page.status, 200);
      const again = await tool.demoSignIn(w.base, 'admin@example.invalid', SEED_PASSWORD, { appKeys: keys, nowMs: () => NOW_MS });
      assert.ok(again.ok);
      assert.equal(again.how, 'authenticator app');
      const client = await tool.demoSignIn(w.base, 'client@example.invalid', SEED_PASSWORD, { nowMs: () => NOW_MS });
      assert.ok(client.ok);
      assert.equal(client.how, 'password alone');
    } finally { w.close(); }
  });

  test('an emailed code is read from what the demo prints to its console', async () => {
    const tool = await maybe<ToolModule>('../tools/demo-sign-in.ts');
    assert.ok(tool !== undefined, 'tools/demo-sign-in.ts does not exist');
    const w = await world();
    try {
      // sales set up an emailed code earlier, on the website
      const first = await w.api('/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      const token = String(first.body.step_token);
      await w.api('/api/login/step/method', { step_token: token, method: 'EMAIL' });
      await w.api('/api/login/step/code', { step_token: token, code: w.lastCode() });
      // the demo's console, as tools/demo-server.ts prints the outbox
      const log = () => w.db.all<{ to_email: string; subject: string; body: string }>('SELECT to_email, subject, body FROM outbox ORDER BY rowid')
        .map((m) => `\n--- outbox (not sent) to ${m.to_email}: ${m.subject}\n${m.body}\n---`).join('\n');
      const r = await tool.demoSignIn(w.base, 'sales@example.invalid', SEED_PASSWORD, { readDemoLog: log, nowMs: () => NOW_MS, waitMs: 500 });
      assert.ok(r.ok, r.ok ? '' : r.why);
      assert.equal(r.how, 'emailed code, read from the demo console');
      const without = await tool.demoSignIn(w.base, 'sales@example.invalid', SEED_PASSWORD, { nowMs: () => NOW_MS });
      assert.equal(without.ok, false);
      assert.match(without.ok ? '' : without.why, /CB_DEMO_LOG/);
    } finally { w.close(); }
  });

  test('it says plainly which login it cannot reach: an app set up before this run', async () => {
    const tool = await maybe<ToolModule>('../tools/demo-sign-in.ts');
    assert.ok(tool !== undefined, 'tools/demo-sign-in.ts does not exist');
    const w = await world();
    try {
      await w.apiWithApp('sales@example.invalid');
      const r = await tool.demoSignIn(w.base, 'sales@example.invalid', SEED_PASSWORD, { nowMs: () => NOW_MS });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /set up before this run.*Restart the demo/);
    } finally { w.close(); }
  });

  test('never a real person\'s account: only @example.invalid, and only a website on this machine', async () => {
    const tool = await maybe<ToolModule>('../tools/demo-sign-in.ts');
    assert.ok(tool !== undefined, 'tools/demo-sign-in.ts does not exist');
    const a = await tool.demoSignIn('http://localhost:1', 'lakhbir@caprebate.co.uk', 'x');
    assert.equal(a.ok, false);
    assert.match(a.ok ? '' : a.why, /not one of the demo's invented logins/);
    const b = await tool.demoSignIn('https://caprebate-test.vercel.app', 'admin@example.invalid', 'x');
    assert.equal(b.ok, false);
    assert.match(b.ok ? '' : b.why, /not on this machine/);
  });
});
