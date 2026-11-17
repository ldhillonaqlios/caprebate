/**
 * PHASE 161n1b, 17 NOVEMBER 2026 — SIGN-IN AND SESSIONS, FROM ITRoadway'S SECOND CODE REVIEW (12 Nov 2026).
 *
 *   1  M-02  nobody can lock another person out: the limit is the email AND the address together; a right password
 *            with a second step to give goes on to it; many tries at one login email every Admin and refuse nothing
 *   2  M-06  a password change signs out every session, and Settings has "Sign out of all other devices"
 *   3  L-02  the session cookie is SameSite=Lax, in the code and on the wire, and no GET changes data
 *   4  L-03  a session left idle ends (30 minutes staff, 2 hours a client), and the login page says why
 *   5  L-04  a new reset link voids the older ones, and two completions of one link give one success
 *   6  L-05  X-Forwarded-For is read only from a listed proxy, right-most untrusted entry; Vercel unchanged
 *   7  L-12  the authenticator key changes with no outage: the old key opens, the new one reseals, set-ups included
 *   8  L-15  upload links on the live website have their own key, and the live start refuses without it
 *
 * Every person, address and key here is invented. A fixed clock, no network.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { buildApp } from '../../src/app/build-app.ts';
import { createApp } from '../../src/app/server.ts';
import { seed, SEED_PASSWORD } from '../../src/app/seed.ts';
import {
  AuthError, GENERIC_AUTH_FAILURE, IDLE_CLIENT_MS, IDLE_STAFF_MS, LOGIN_EMAIL_ALERT, LOGIN_LIMIT, LOGIN_SOURCE_LIMIT, SIGN_IN_BURST_SUBJECT,
  authenticate, changeOwnPassword, completePasswordReset, endedIdle, login, requestPasswordReset, signOutOtherSessions,
  verifyPassword, type SessionCookie,
} from '../../src/core/auth.ts';
import { clientIp, setCookie } from '../../src/core/http.ts';
import { MFA_KEY_MISSING, mfaKeyFrom, openSecret, resealSecrets, sealSecret } from '../../src/core/mfa-seal.ts';
import { SECRET_KEYS, secretsFromValues } from '../../src/core/secrets.ts';
import { beginSignIn, submitCode } from '../../src/core/sign-in.ts';
import { MAX_WRONG_CODES } from '../../src/core/sign-in.ts';
import { codeAt, newSecret, stepAt } from '../../src/core/totp.ts';
import { createUser } from '../../src/core/users.ts';
import { LIVE_REQUIRED, liveStartCheck, startLiveWebsite } from '../../src/app/live-website.ts';
import { idleWords } from '../../src/app/router.ts';
import { fakeHasher } from '../helpers.ts';

const NOW = '2026-11-17T10:00:00.000Z';
const PW = 'a-long-invented-password-161n1b';
const B64 = () => randomBytes(32).toString('base64');

/** A clock the test moves. */
function clock(start = NOW) {
  let t = Date.parse(start);
  return { now: () => new Date(t).toISOString(), add: (ms: number) => { t += ms; } };
}

/** An application on the default policy (STAFF: the second step on), with a fake hasher and a moving clock. */
async function app(c = clock()) {
  const a = await buildApp({ hasher: fakeHasher(), now: c.now });
  const make = (email: string, role: 'ADMIN' | 'SALES' | 'CLIENT') =>
    createUser(a.db, a.now, { email, display_name: email.split('@')[0] ?? 'x', role, password_hash: `fake$${PW}` });
  const giveApp = (user_id: string, secret = newSecret()) => {
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [secret, user_id]);
    return secret;
  };
  return { a, c, make, giveApp };
}

/** A client login needs its business: the seed's own client, signing in with the seed's password. */
async function seededClient(a: Awaited<ReturnType<typeof buildApp>>): Promise<{ email: string; password: string; id: string }> {
  const s = await seed(a.db, a.hasher, a.now);
  const email = 'client@example.invalid';
  const id = a.db.get<{ id: string }>('SELECT id FROM users WHERE email_canonical = ?', [email])?.id ?? '';
  return { email, password: s.password ?? SEED_PASSWORD, id };
}

const failed = (e: unknown, code?: string) => e instanceof AuthError && e.message === GENERIC_AUTH_FAILURE && (code === undefined || e.code === code);

/* ================================================================== 1. M-02 */

describe('161n1b · 1 · M-02: nobody can lock another person out of their login', () => {
  test('10 wrong tries from address A, then the right password from address B signs in', async () => {
    const { a, make, giveApp } = await app();
    const u = make('sales.person@invented.test', 'SALES');
    giveApp(u.id);
    for (let i = 0; i < 10; i++) {
      await assert.rejects(verifyPassword(a.deps, u.email, 'a wrong guess', '198.51.100.7'), (e) => failed(e));
    }
    const ok = await verifyPassword(a.deps, u.email, PW, '203.0.113.20');
    assert.equal(ok.id, u.id);
    const r = await beginSignIn(a, u.email, PW, '203.0.113.20');
    assert.equal(r.kind, 'STEP', 'and it goes on to the second step, as ever');
  });

  test('from address A past the limit, a right password with a second step goes on to that step, and its five wrong codes still end it', async () => {
    const { a, make, giveApp } = await app();
    const u = make('admin.one@invented.test', 'ADMIN');
    const secret = giveApp(u.id);
    for (let i = 0; i < LOGIN_LIMIT + 3; i++) await assert.rejects(verifyPassword(a.deps, u.email, 'wrong', '198.51.100.7'));
    const r = await beginSignIn(a, u.email, PW, '198.51.100.7');
    assert.equal(r.kind, 'STEP', 'a right password and a second step to give are not held back');
    if (r.kind !== 'STEP') return;
    const right = codeAt(secret, stepAt(Date.parse(a.now())));
    const wrong = right === '000000' ? '111111' : '000000';
    let last = submitCode(a, r.token, wrong);
    for (let i = 1; i < MAX_WRONG_CODES; i++) last = submitCode(a, r.token, wrong);
    assert.equal(last.kind, 'ERROR');
    assert.equal(submitCode(a, r.token, wrong).kind, 'GONE', 'the second step still stops guessing');
    assert.equal(submitCode(a, r.token, right).kind, 'GONE', 'and the right code is no use once it has ended');
    const rows = a.db.all<{ outcome: string; detail: string }>("SELECT outcome, detail FROM audit_log WHERE kind = 'RATE_LIMITED'");
    assert.ok(rows.some((x) => x.outcome === 'ALLOWED' && x.detail.includes('second_step')), 'the pass to the second step is in the audit log');
  });

  test('an address past its own limit (many logins tried) is refused at once, unread, and slows only itself', async () => {
    const { a, make, giveApp } = await app();
    const u = make('sprayed@invented.test', 'ADMIN');
    giveApp(u.id);
    let checks = 0;
    const real = a.deps.hasher.verify.bind(a.deps.hasher);
    a.deps.hasher.verify = async (h: string, p: string) => { checks++; return real(h, p); };
    for (let i = 0; i < LOGIN_SOURCE_LIMIT; i++) await assert.rejects(verifyPassword(a.deps, `spray${String(i)}@invented.test`, 'Summer2026!', '198.51.100.9'));
    const before = checks;
    for (let i = 0; i < 20; i++) await assert.rejects(verifyPassword(a.deps, u.email, i === 19 ? PW : 'x', '198.51.100.9'), (e) => failed(e, 'E_RATE_LIMITED'));
    assert.equal(checks, before, 'past it, no password is checked: one address cannot make the server do the work');
    assert.equal((await verifyPassword(a.deps, u.email, PW, '203.0.113.20')).id, u.id, 'the person, from anywhere else, signs in');
  });

  test('past the limit, an account with no second step stays held back, even with the right password', async () => {
    const { a } = await app();
    const u = await seededClient(a);
    for (let i = 0; i < LOGIN_LIMIT; i++) await assert.rejects(verifyPassword(a.deps, u.email, 'wrong', '198.51.100.7'));
    await assert.rejects(verifyPassword(a.deps, u.email, u.password, '198.51.100.7'), (e) => failed(e, 'E_RATE_LIMITED'));
    assert.equal((await verifyPassword(a.deps, u.email, u.password, '203.0.113.20')).id, u.id, 'from anywhere else it signs in');
  });

  test('with the second step switched off (the older test files), past the limit a right password is held back too', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'old.tests@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [newSecret(), u.id]);
    for (let i = 0; i < LOGIN_LIMIT; i++) await assert.rejects(login(a.deps, u.email, 'wrong'));
    await assert.rejects(login(a.deps, u.email, PW), (e) => failed(e, 'E_RATE_LIMITED'));
  });

  test(`more than ${String(LOGIN_EMAIL_ALERT)} tries at one login in an hour: an audit row and an email to every Admin, once, and nothing refused`, async () => {
    const { a, make } = await app();
    const u = make('target@invented.test', 'SALES');
    make('boss.one@invented.test', 'ADMIN');
    make('boss.two@invented.test', 'ADMIN');
    for (let i = 0; i < LOGIN_EMAIL_ALERT + 10; i++) {
      // Each from its own address, so no address limit is reached: a spread-out attack.
      await assert.rejects(verifyPassword(a.deps, u.email, 'wrong', `198.51.100.${String(i % 250)}`), (e) => failed(e, 'E_AUTH_FAILED'));
    }
    assert.equal((await verifyPassword(a.deps, u.email, PW, '203.0.113.20')).id, u.id, 'the person still signs in');
    const burst = a.db.all<{ detail: string; actor_id: string | null }>("SELECT detail, actor_id FROM audit_log WHERE kind = 'SIGN_IN_BURST'");
    assert.equal(burst.length, 1, 'one row, at the crossing');
    assert.equal(burst[0]?.actor_id, u.id);
    assert.ok(!(burst[0]?.detail ?? '').includes('target@'), 'no email address in the audit log');
    const mails = a.db.all<{ to_email: string; body: string }>('SELECT to_email, body FROM outbox WHERE subject = ? ORDER BY to_email', [SIGN_IN_BURST_SUBJECT]);
    assert.deepEqual(mails.map((m) => m.to_email), ['boss.one@invented.test', 'boss.two@invented.test']);
    assert.match(mails[0]?.body ?? '', /target@invented\.test/);
    assert.ok(!/—/.test(mails[0]?.body ?? ''), 'no long dash in the email');
  });

  test('an address with no account is counted and written down, and no Admin is emailed about it', async () => {
    const { a, make } = await app();
    make('boss@invented.test', 'ADMIN');
    for (let i = 0; i < LOGIN_EMAIL_ALERT + 2; i++) await assert.rejects(verifyPassword(a.deps, 'nobody@invented.test', 'x', `198.51.100.${String(i)}`));
    assert.equal(a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'SIGN_IN_BURST'")?.n, 1);
    assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE subject = ?', [SIGN_IN_BURST_SUBJECT])?.n, 0);
  });

  test('the limit keys hold no email and no address as text', async () => {
    const { a, make } = await app();
    const u = make('keys@invented.test', 'SALES');
    await assert.rejects(verifyPassword(a.deps, u.email, 'wrong', '198.51.100.7'));
    for (const r of a.db.all<{ bucket: string }>('SELECT bucket FROM rate_limit_hits')) {
      assert.ok(!r.bucket.includes('@') && !r.bucket.includes('198.51'), r.bucket);
    }
  });
});

/* ================================================================== 2. M-06 */

describe('161n1b · 2 · M-06: a password change signs out every session; "Sign out of all other devices"', () => {
  test('two sessions; the password changed in one; the other is refused, and this one carries on with a fresh session', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'two.devices@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const phone = await login(a.deps, u.email, PW);
    const laptop = await login(a.deps, u.email, PW);
    const fresh = await changeOwnPassword(a.deps, u, laptop.session_id, PW, 'another-long-invented-password');
    assert.equal(authenticate(a.deps, phone.cookie.value), undefined, 'the other device is signed out');
    assert.equal(authenticate(a.deps, laptop.cookie.value), undefined, 'the old cookie here is spent too');
    assert.equal(authenticate(a.deps, fresh.cookie.value)?.user.id, u.id, 'and this browser has a fresh session');
    const reasons = a.db.all<{ revoked_reason: string }>('SELECT revoked_reason FROM sessions WHERE user_id = ? AND revoked_at IS NOT NULL', [u.id]).map((r) => r.revoked_reason);
    assert.deepEqual(reasons, ['PASSWORD_CHANGED', 'PASSWORD_CHANGED']);
    assert.equal(a.db.get<{ rotated_from: string }>('SELECT rotated_from FROM sessions WHERE id = ?', [fresh.session_id])?.rotated_from, laptop.session_id);
  });

  test('a wrong current password changes nothing and ends nothing', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'wrong.current@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const s1 = await login(a.deps, u.email, PW);
    const s2 = await login(a.deps, u.email, PW);
    await assert.rejects(changeOwnPassword(a.deps, u, s1.session_id, 'not it', 'another-long-invented-password'));
    assert.ok(authenticate(a.deps, s1.cookie.value) !== undefined && authenticate(a.deps, s2.cookie.value) !== undefined);
  });

  test('signOutOtherSessions ends every session but the one in hand', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const c = await seededClient(a);
    const [s1, s2, s3] = [await login(a.deps, c.email, c.password), await login(a.deps, c.email, c.password), await login(a.deps, c.email, c.password)];
    const u = s1.user;
    assert.equal(signOutOtherSessions(a.deps, u, s2.session_id), 2);
    assert.equal(authenticate(a.deps, s1.cookie.value), undefined);
    assert.equal(authenticate(a.deps, s3.cookie.value), undefined);
    assert.equal(authenticate(a.deps, s2.cookie.value)?.user.id, u.id);
  });

  test('over the website, staff and portal: the button is on Settings, and pressing it signs the other browser out', async () => {
    const b = await boot();
    try {
      for (const [who, base] of [['admin', '/staff/settings'], ['client', '/portal/settings']] as const) {
        const one = await b.signIn(who);
        const two = await b.signIn(who);
        const page = await one.req(base);
        assert.equal(page.status, 200);
        assert.match(page.body, new RegExp(`<form method="post" action="${base}/sign-out-others">`), `${who}: the button`);
        assert.match(page.body, /Sign out of all other devices/);
        assert.match(page.body, /Changing your password signs you out on every other device\./);
        const pressed = await one.req(`${base}/sign-out-others`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
        assert.equal(pressed.status, 303);
        assert.equal(pressed.headers.get('location'), `${base}?saved=others`);
        assert.equal((await two.req(base)).status, 303, `${who}: the other browser is signed out`);
        const after = await one.req(`${base}?saved=others`);
        assert.equal(after.status, 200, `${who}: this one is not`);
        assert.match(after.body, /You are signed out everywhere else\./);
      }
    } finally { b.close(); }
  });

  test('over the website: a password changed in one browser signs the other out', async () => {
    const b = await boot();
    try {
      const one = await b.signIn('sales');
      const two = await b.signIn('sales');
      const r = await one.req('/staff/settings/password', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ current: b.password, next: 'a-brand-new-invented-password', again: 'a-brand-new-invented-password' }).toString() });
      assert.equal(r.status, 303, r.body.slice(0, 200));
      assert.equal((await one.req('/staff/settings')).status, 200, 'this browser stays signed in, on its new cookie');
      assert.equal((await two.req('/staff/settings')).status, 303, 'the other is sent to sign in');
    } finally { b.close(); }
  });
});

/* ================================================================== 3. L-02 */

describe('161n1b · 3 · L-02: the session cookie is SameSite=Lax, said the same everywhere, and no GET changes data', () => {
  test('the type, the cookie a login returns, and the header written all say Lax', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'lax@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const r = await login(a.deps, u.email, PW);
    const lax: SessionCookie['sameSite'] = 'Lax';
    assert.equal(r.cookie.sameSite, lax);
    const headers: Record<string, unknown> = {};
    setCookie({ getHeader: (n: string) => headers[n], setHeader: (n: string, v: unknown) => { headers[n] = v; } } as never, 'cb_session', 'x', 60);
    assert.match(String((headers['set-cookie'] as string[])[0]), /; SameSite=Lax;/);
    const auth = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'core', 'auth.ts'), 'utf8');
    assert.ok(!/sameSite: 'Strict'/.test(auth), 'nothing in auth.ts promises Strict any more');
  });

  test('a crawl of every page Admin and a client can reach by GET changes no record (only the session, the audit log and the counters move)', async () => {
    const b = await boot();
    try {
      /* What a GET may write: the session's "last seen" (once a minute), the two append-only logs (a document or an
         estimate opened is written down: the audit log, and the survey's quarantine log, anchor_log), the
         sign-in counters, and the time the mailbox was last looked at for replies (mailbox_reads, one row of times:
         opening the inbox fetches new replies, which nobody's click changes). Nothing else. */
      const MAY_MOVE = new Set(['sessions', 'audit_log', 'anchor_log', 'rate_limit_hits', 'mailbox_reads']);
      /* Every write the database is asked for during the crawl, by the table it names: every statement that changes a
         row goes through Db.run (or, with RETURNING, get and all), so watching those three sees them all. A write that
         changed no row is not counted. */
      // The statement's first word, then (after OR IGNORE and the like, and INTO or FROM) the table it names.
      const TARGET = /^\s*([A-Za-z]+)(?:\s+OR\s+[A-Za-z]+)?\s+(?:INTO\s+|FROM\s+)?"?([A-Za-z_][\w]*)/i;
      const VERBS = new Set(['insert', 'update', 'delete', 'replace']);
      const written: { table: string; sql: string }[] = [];
      let watching = false;
      let seenAny = false;
      const db = b.db as unknown as Record<'run' | 'get' | 'all', (sql: string, p?: readonly unknown[]) => unknown>;
      for (const m of ['run', 'get', 'all'] as const) {
        const real = db[m].bind(b.db);
        db[m] = (sql: string, p?: readonly unknown[]) => {
          const out = real(sql, p);
          const t = watching ? TARGET.exec(sql) : null;
          const isWrite = t !== null && VERBS.has((t[1] ?? '').toLowerCase()) && (m === 'run' || /\bRETURNING\b/i.test(sql));
          const changed = m !== 'run' || ((out as { changes: number }).changes > 0);
          if (isWrite && changed) { written.push({ table: t[2] ?? '', sql: sql.slice(0, 120) }); seenAny = true; }
          return out;
        };
      }
      let pages = 0;
      for (const [who, start] of [['admin', '/staff'], ['client', '/portal']] as const) {
        const c = await b.signIn(who);
        written.length = 0;
        watching = true;
        const seen = new Set<string>(); const queue: string[] = [start];
        while (queue.length > 0 && seen.size < 400) {
          const p = queue.shift() ?? ''; if (seen.has(p)) continue; seen.add(p);
          const r = await c.req(p);
          pages++;
          if (!(r.headers.get('content-type') ?? '').startsWith('text/html')) continue;
          for (const m of r.body.matchAll(/href="(\/(?:staff|portal)[^"#]*)"/g)) {
            const h = (m[1] ?? '').replace(/&amp;/g, '&');
            if (!seen.has(h) && !/logout/.test(h)) queue.push(h);
          }
        }
        watching = false;
        const wrong = written.filter((w) => !MAY_MOVE.has(w.table));
        assert.deepEqual(wrong, [], `${who}: a GET changed a record`);
      }
      assert.ok(seenAny, 'the watch saw the logs written, so it was watching');
      assert.ok(pages > 50, `the crawl reached ${String(pages)} pages`);
    } finally { b.close(); }
  });
});

/* ================================================================== 4. L-03 */

describe('161n1b · 4 · L-03: a session left idle ends, and the login page says why', () => {
  test(`staff: still in at ${String(IDLE_STAFF_MS / 60000 - 1)} minutes idle, out at ${String(IDLE_STAFF_MS / 60000)}; ended for good with reason IDLE`, async () => {
    const c = clock();
    const a = await buildApp({ hasher: fakeHasher(), now: c.now, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'idle.staff@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const s = await login(a.deps, u.email, PW);
    c.add(IDLE_STAFF_MS - 60_000);
    assert.ok(authenticate(a.deps, s.cookie.value) !== undefined, 'in use, so "last seen" moves on');
    c.add(IDLE_STAFF_MS - 60_000);
    assert.ok(authenticate(a.deps, s.cookie.value) !== undefined, 'busy for nearly an hour: still in');
    c.add(IDLE_STAFF_MS);
    assert.equal(authenticate(a.deps, s.cookie.value), undefined);
    c.add(-IDLE_STAFF_MS);
    assert.equal(authenticate(a.deps, s.cookie.value), undefined, 'ended, not paused');
    assert.equal(a.db.get<{ revoked_reason: string }>('SELECT revoked_reason FROM sessions WHERE id = ?', [s.session_id])?.revoked_reason, 'IDLE');
    assert.deepEqual(endedIdle(a.deps, s.cookie.value), { role: 'SALES' });
  });

  test('a client: still in at 1 hour 59 minutes idle, out at 2 hours', async () => {
    const c = clock();
    const a = await buildApp({ hasher: fakeHasher(), now: c.now, twoFactor: 'off' });
    const u = await seededClient(a);
    const s = await login(a.deps, u.email, u.password);
    c.add(IDLE_CLIENT_MS - 60_000);
    assert.ok(authenticate(a.deps, s.cookie.value) !== undefined);
    c.add(IDLE_CLIENT_MS);
    assert.equal(authenticate(a.deps, s.cookie.value), undefined);
    assert.deepEqual(endedIdle(a.deps, s.cookie.value), { role: 'CLIENT' });
  });

  test('the 8 hours from sign-in still end a busy session; a session signed out is not called idle', async () => {
    const c = clock();
    const a = await buildApp({ hasher: fakeHasher(), now: c.now, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'busy@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const s = await login(a.deps, u.email, PW);
    for (let i = 0; i < 16; i++) { c.add(29 * 60_000); authenticate(a.deps, s.cookie.value); }
    c.add(30 * 60_000);
    assert.equal(authenticate(a.deps, s.cookie.value), undefined);
    assert.equal(endedIdle(a.deps, s.cookie.value), undefined, 'expired, not idle');
  });

  test('over the website: an idle browser is sent to the login page, which says how long, once', async () => {
    const c = clock();
    const b = await boot(c.now);
    try {
      for (const [who, home, words] of [['admin', '/staff', /after 30 minutes without activity/], ['client', '/portal', /after 2 hours without activity/]] as const) {
        const br = await b.signIn(who);
        c.add(who === 'admin' ? IDLE_STAFF_MS : IDLE_CLIENT_MS);
        const r = await br.req(home);
        assert.equal(r.status, 303);
        assert.equal(r.headers.get('location'), `/login?ended=${who === 'admin' ? 'idle-staff' : 'idle-client'}`);
        const page = await br.req(r.headers.get('location') ?? '');
        assert.equal(page.status, 200);
        assert.match(page.body, words);
        assert.equal((await br.req(home)).headers.get('location'), '/login', 'the cookie was cleared, so it is said once');
      }
    } finally { b.close(); }
  });

  test('the words, and nothing for anything else', () => {
    assert.equal(idleWords('idle-staff'), 'You were signed out after 30 minutes without activity. Sign in again to carry on.');
    assert.equal(idleWords('idle-client'), 'You were signed out after 2 hours without activity. Sign in again to carry on.');
    assert.equal(idleWords('<script>'), undefined);
    assert.equal(idleWords(null), undefined);
  });
});

/* ================================================================== 5. L-04 */

describe('161n1b · 5 · L-04: only the newest reset link works, and one link works once even when sent twice at once', () => {
  test('a second reset email voids the first link', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'reset@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const first = requestPasswordReset(a.deps, u.email).plaintextToken ?? '';
    const second = requestPasswordReset(a.deps, u.email).plaintextToken ?? '';
    await assert.rejects(completePasswordReset(a.deps, first, 'a-new-invented-password-1'), (e) => e instanceof AuthError && e.code === 'E_BAD_TOKEN');
    await completePasswordReset(a.deps, second, 'a-new-invented-password-2');
    assert.equal((await login(a.deps, u.email, 'a-new-invented-password-2')).user.id, u.id);
  });

  test('two completions of one link at the same moment: one succeeds, one is refused', async () => {
    const a = await buildApp({ hasher: fakeHasher(), now: () => NOW, twoFactor: 'off' });
    const u = createUser(a.db, a.now, { email: 'race@invented.test', display_name: 'x', role: 'SALES', password_hash: `fake$${PW}` });
    const t = requestPasswordReset(a.deps, u.email).plaintextToken ?? '';
    const results = await Promise.allSettled([
      completePasswordReset(a.deps, t, 'the-first-invented-password'),
      completePasswordReset(a.deps, t, 'the-second-invented-password'),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(refused.reason instanceof AuthError && refused.reason.code === 'E_BAD_TOKEN');
    assert.equal((await login(a.deps, u.email, 'the-first-invented-password')).user.id, u.id, 'the winner’s password, and only it');
    await assert.rejects(login(a.deps, u.email, 'the-second-invented-password'));
  });
});

/* ================================================================== 6. L-05 */

describe('161n1b · 6 · L-05: the visitor’s address behind a proxy', () => {
  const req = (fwd: string | undefined, socket: string) =>
    ({ headers: fwd === undefined ? {} : { 'x-forwarded-for': fwd }, socket: { remoteAddress: socket } }) as unknown as IncomingMessage;
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const was: Record<string, string | undefined> = {};
    for (const k of Object.keys(vars)) { was[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
    try { fn(); } finally { for (const k of Object.keys(was)) { if (was[k] === undefined) delete process.env[k]; else process.env[k] = was[k]; } }
  };

  test('from a listed proxy, the right-most address that is not a proxy; a typed entry on the left cannot win', () => {
    withEnv({ CAPREBATE_TRUSTED_PROXIES: '10.0.0.0/8, 127.0.0.1', CAPREBATE_TRUST_PROXY: undefined }, () => {
      assert.equal(clientIp(req('6.6.6.6, 203.0.113.9', '127.0.0.1')), '203.0.113.9', 'the proxy added the real one on the right');
      assert.equal(clientIp(req('6.6.6.6, 203.0.113.9, 10.1.2.3', '127.0.0.1')), '203.0.113.9', 'a second listed proxy is passed over');
      assert.equal(clientIp(req('203.0.113.9', '::ffff:127.0.0.1')), '203.0.113.9', 'an IPv4 socket written as IPv6');
      assert.equal(clientIp(req('10.1.1.1, 10.2.2.2', '10.0.0.5')), '10.1.1.1', 'every entry a proxy: the left-most');
      assert.equal(clientIp(req(undefined, '127.0.0.1')), '127.0.0.1', 'no header: the proxy itself');
    });
  });

  test('from anywhere not listed, the header is ignored, even with CAPREBATE_TRUST_PROXY=1 beside the list', () => {
    withEnv({ CAPREBATE_TRUSTED_PROXIES: '10.0.0.0/8', CAPREBATE_TRUST_PROXY: '1' }, () => {
      assert.equal(clientIp(req('203.0.113.9', '198.51.100.4')), '198.51.100.4');
    });
  });

  test('Vercel unchanged: with CAPREBATE_TRUST_PROXY=1 and no list, the first entry (Vercel overwrites the header); neither, the socket', () => {
    withEnv({ CAPREBATE_TRUSTED_PROXIES: undefined, CAPREBATE_TRUST_PROXY: '1' }, () => {
      assert.equal(clientIp(req('203.0.113.9, 10.0.0.1', '10.0.0.1')), '203.0.113.9');
    });
    withEnv({ CAPREBATE_TRUSTED_PROXIES: undefined, CAPREBATE_TRUST_PROXY: undefined }, () => {
      assert.equal(clientIp(req('203.0.113.9', '10.0.0.1')), '10.0.0.1');
    });
    withEnv({ CAPREBATE_TRUSTED_PROXIES: ' , not-an-address', CAPREBATE_TRUST_PROXY: undefined }, () => {
      assert.equal(clientIp(req('203.0.113.9', '10.0.0.1')), '10.0.0.1', 'a list of nothing usable trusts nobody');
    });
  });

  test('the runbook says how', () => {
    const rb = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'LIVE-RUNBOOK.md'), 'utf8');
    assert.match(rb, /CAPREBATE_TRUSTED_PROXIES/);
    assert.match(rb, /127\.0\.0\.1/);
  });
});

/* ================================================================== 7. L-12 */

describe('161n1b · 7 · L-12: changing the authenticator key with no outage', () => {
  const store = (key: string, old?: string) => secretsFromValues({ CAPREBATE_MFA_KEY: key, ...(old === undefined ? {} : { CAPREBATE_MFA_KEY_OLD: old }) });

  test('with the old key beside the new one, a secret sealed with the old key opens, and is marked to be sealed again', () => {
    const oldKey = B64(); const newKey = B64();
    const sealed = sealSecret(mfaKeyFrom(store(oldKey)), 'u-1', 'JBSWY3DPEHPK3PXP');
    assert.ok(sealed.ok);
    if (!sealed.ok) return;
    assert.deepEqual(openSecret(mfaKeyFrom(store(newKey)), 'u-1', sealed.stored), { ok: false, why: MFA_KEY_MISSING }, 'the new key alone: the outage the review found');
    assert.deepEqual(openSecret(mfaKeyFrom(store(newKey, oldKey)), 'u-1', sealed.stored), { ok: true, secret: 'JBSWY3DPEHPK3PXP', old: true });
    const fresh = sealSecret(mfaKeyFrom(store(newKey, oldKey)), 'u-1', 'JBSWY3DPEHPK3PXP');
    assert.ok(fresh.ok && openSecret(mfaKeyFrom(store(newKey)), 'u-1', fresh.stored).ok, 'new secrets are sealed with the new key');
    assert.deepEqual(openSecret(mfaKeyFrom(store(newKey, 'not-a-key')), 'u-1', sealed.stored), { ok: false, why: MFA_KEY_MISSING }, 'a bad old key opens nothing');
  });

  test('a sign-in during the change works, and moves that person’s secret to the new key', async () => {
    const c = clock();
    const { a, make } = await app(c);
    const oldKey = B64(); const newKey = B64();
    const u = make('during.change@invented.test', 'ADMIN');
    const secret = newSecret();
    const sealed = sealSecret(mfaKeyFrom(store(oldKey)), u.id, secret);
    assert.ok(sealed.ok);
    if (!sealed.ok) return;
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [sealed.stored, u.id]);
    a.secrets = store(newKey, oldKey);
    const r = await beginSignIn(a, u.email, PW, '203.0.113.20');
    assert.equal(r.kind, 'STEP');
    if (r.kind !== 'STEP') return;
    assert.equal(submitCode(a, r.token, codeAt(secret, stepAt(Date.parse(a.now())))).kind, 'SESSION', 'no outage');
    const now = a.db.get<{ mfa_secret: string }>('SELECT mfa_secret FROM users WHERE id = ?', [u.id])?.mfa_secret ?? '';
    assert.notEqual(now, sealed.stored);
    assert.deepEqual(openSecret(mfaKeyFrom(store(newKey)), u.id, now), { ok: true, secret }, 'it opens with the new key alone now');
  });

  test('the reseal command moves every secret, set-ups in progress included, and leaves one already moved', async () => {
    const { a, make } = await app();
    const oldK = mfaKeyFrom(store(B64())); const newK = mfaKeyFrom(store(B64()));
    const [x, y, z] = [make('x@invented.test', 'SALES'), make('y@invented.test', 'SALES'), make('z@invented.test', 'SALES')];
    const put = (id: string, k: typeof oldK, s: string) => { const v = sealSecret(k, id, s); assert.ok(v.ok); return v.ok ? v.stored : ''; };
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [put(x.id, oldK, 'AAAAAAAAAAAAAAAA'), x.id]);
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [put(y.id, newK, 'BBBBBBBBBBBBBBBB'), y.id]);
    // z is part-way through setting up an app: the secret is on the sign-in step, not the login.
    const r = await beginSignIn(a, z.email, PW);
    assert.equal(r.kind, 'STEP');
    a.db.run("UPDATE sign_in_steps SET pending_method = 'APP', pending_secret = ? WHERE user_id = ?", [put(z.id, oldK, 'CCCCCCCCCCCCCCCC'), z.id]);
    const yBefore = a.db.get<{ mfa_secret: string }>('SELECT mfa_secret FROM users WHERE id = ?', [y.id])?.mfa_secret;
    const res = resealSecrets(a.db, oldK, newK);
    assert.deepEqual(res, { ok: true, resealed: 2, would_not_open: 0 });
    const onlyNew = mfaKeyFrom(store(newK.state === 'KEY' ? newK.key.toString('base64') : ''));
    const xs = a.db.get<{ mfa_secret: string }>('SELECT mfa_secret FROM users WHERE id = ?', [x.id])?.mfa_secret ?? '';
    const zs = a.db.get<{ pending_secret: string }>('SELECT pending_secret FROM sign_in_steps WHERE user_id = ?', [z.id])?.pending_secret ?? '';
    assert.deepEqual(openSecret(onlyNew, x.id, xs), { ok: true, secret: 'AAAAAAAAAAAAAAAA' });
    assert.deepEqual(openSecret(onlyNew, z.id, zs), { ok: true, secret: 'CCCCCCCCCCCCCCCC' }, 'the set-up in progress was moved too');
    assert.equal(a.db.get<{ mfa_secret: string }>('SELECT mfa_secret FROM users WHERE id = ?', [y.id])?.mfa_secret, yBefore, 'one already moved is left');
  });

  test('a secret neither key opens stops the whole command, and nothing changes', async () => {
    const { a, make } = await app();
    const oldK = mfaKeyFrom(store(B64())); const newK = mfaKeyFrom(store(B64())); const other = mfaKeyFrom(store(B64()));
    const [x, y] = [make('p@invented.test', 'SALES'), make('q@invented.test', 'SALES')];
    const v1 = sealSecret(oldK, x.id, 'AAAAAAAAAAAAAAAA'); const v2 = sealSecret(other, y.id, 'BBBBBBBBBBBBBBBB');
    assert.ok(v1.ok && v2.ok);
    if (!v1.ok || !v2.ok) return;
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [v1.stored, x.id]);
    a.db.run("UPDATE users SET mfa_method = 'APP', mfa_secret = ? WHERE id = ?", [v2.stored, y.id]);
    assert.deepEqual(resealSecrets(a.db, oldK, newK), { ok: false, resealed: 0, would_not_open: 1 });
    assert.equal(a.db.get<{ mfa_secret: string }>('SELECT mfa_secret FROM users WHERE id = ?', [x.id])?.mfa_secret, v1.stored);
  });

  test('the old key is a listed key of the sign-in’s own, in the example key file and the runbook', () => {
    assert.ok(SECRET_KEYS.some((k) => k.name === 'CAPREBATE_MFA_KEY_OLD' && k.owner === 'SIGN_IN' && k.secret));
    assert.match(readFileSync(join(import.meta.dirname, '..', '..', 'secrets.example.env'), 'utf8'), /^CAPREBATE_MFA_KEY_OLD=$/m);
    const rb = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'LIVE-RUNBOOK.md'), 'utf8');
    assert.match(rb, /CAPREBATE_MFA_KEY_OLD/);
    assert.ok(!/between the two steps the website cannot check app codes/.test(rb), 'the outage warning is gone');
  });

  test('the live start refuses an old key that is not a key', () => {
    const env = liveEnv({ CAPREBATE_MFA_KEY_OLD: 'c2hvcnQ=' });
    const r = liveStartCheck(env);
    assert.equal(r.stop, true);
    assert.ok(r.lines.some((l) => l.includes('CAPREBATE_MFA_KEY_OLD')));
  });
});

/* ================================================================== 8. L-15 */

describe('161n1b · 8 · L-15: upload links on the live website have their own key', () => {
  test('the live start refuses a missing CAPREBATE_UPLOAD_LINK_KEY, and one that is not 32 bytes, by name', () => {
    assert.ok(LIVE_REQUIRED.some((r) => r.names.includes('CAPREBATE_UPLOAD_LINK_KEY')));
    const { CAPREBATE_UPLOAD_LINK_KEY: _drop, ...without } = liveEnv();
    void _drop;
    const missing = liveStartCheck(without);
    assert.equal(missing.stop, true);
    assert.ok(missing.lines.some((l) => /CAPREBATE_UPLOAD_LINK_KEY is not set/.test(l)), missing.lines.join('\n'));
    const short = liveStartCheck(liveEnv({ CAPREBATE_UPLOAD_LINK_KEY: 'c2hvcnQ=' }));
    assert.ok(short.stop && short.lines.some((l) => /CAPREBATE_UPLOAD_LINK_KEY is not 32 bytes/.test(l)));
    assert.equal(liveStartCheck(liveEnv()).stop, false, 'with it, the start goes on');
  });

  test('the live website signs upload links with that key, not with anything from the database token', async () => {
    const key = randomBytes(32);
    let given: Buffer | undefined;
    const r = await startLiveWebsite(liveEnv({ CAPREBATE_UPLOAD_LINK_KEY: key.toString('base64') }), {
      blobClient: async () => ({}),
      legal: () => false,
      createApp: async (_location, opts) => {
        given = (opts['sharedDocuments'] as { linkSecret: Buffer }).linkSecret;
        throw new Error('stop here');
      },
    });
    assert.equal(r.started, false);
    assert.ok(given !== undefined && given.equals(key), 'the key itself');
    const src = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app', 'live-website.ts'), 'utf8');
    assert.ok(!/uploadLinkSecret\(/.test(src), 'live-website.ts no longer works it out from the database token');
  });

  test('a listed key, in the example key file, the developer’s pack line and KEYS-AND-SWITCHES.md', () => {
    assert.ok(SECRET_KEYS.some((k) => k.name === 'CAPREBATE_UPLOAD_LINK_KEY' && k.secret));
    assert.match(readFileSync(join(import.meta.dirname, '..', '..', 'secrets.example.env'), 'utf8'), /^CAPREBATE_UPLOAD_LINK_KEY=$/m);
    const keys = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', '00-START-HERE', 'hub', 'KEYS-AND-SWITCHES.md'), 'utf8');
    assert.match(keys, /CAPREBATE_UPLOAD_LINK_KEY/);
    const rb = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'LIVE-RUNBOOK.md'), 'utf8');
    assert.match(rb, /CAPREBATE_UPLOAD_LINK_KEY/);
  });
});

/* ================================================================== the helpers */

/** The settings of a complete live project (invented values). */
function liveEnv(more: Record<string, string> = {}): Record<string, string> {
  return {
    CAPREBATE_PRODUCTION: '1', CAPREBATE_DB_URL: '/tmp/invented-161n1b.db', CAPREBATE_DB_TOKEN: 'invented-database-token-161n1b',
    CAPREBATE_BLOB_TOKEN: 'invented-blob-token-161n1b', CAPREBATE_MFA_KEY: B64(), CRON_SECRET: 'x'.repeat(40),
    CAPREBATE_BACKUP_KEY: B64(), CAPREBATE_PUBLIC_ORIGIN: 'https://caprebate.co.uk', CAPREBATE_UPLOAD_LINK_KEY: B64(), ...more,
  };
}

type Res = { status: number; body: string; headers: Headers };

/** The website, seeded with the invented logins, signing in with a password alone (twoFactor 'off'). */
async function boot(now: () => string = () => NOW) {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1b-')), now, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  async function signIn(who: string) {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').filter((x) => !/=$/.test(x)).join('; ');
      return { status: r.status, body: await r.text(), headers: r.headers };
    };
    const r = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString() });
    assert.equal(r.status, 303, `${who} could not sign in`);
    return { req };
  }
  return { db: made.app.db, signIn, password: s.password ?? SEED_PASSWORD, close: () => made.close() };
}
