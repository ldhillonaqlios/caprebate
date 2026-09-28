/**
 * Authentication. Every rule in auth.ts has an assertion here, and the ones
 * that matter most are the negatives: what is REFUSED, and what never leaves.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  login, logout, authenticate, rotateSession, changeOwnPassword,
  requestPasswordReset, completePasswordReset, revokeAllSessions,
  AuthError, GENERIC_AUTH_FAILURE, LOGIN_LIMIT,
} from '../src/auth.ts';
import { createUser, disableUser, findById } from '../src/users.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { testApp, fakeHasher, scalars, keys } from './helpers.ts';
import { defaultHasher } from '../src/password.ts';

const PW = 'a-long-enough-password';

async function appWithUser() {
  const app = await testApp();
  const u = createUser(app.db, app.now, {
    email: 'Someone@Example.invalid', display_name: 'Test User',
    role: 'SALES', password_hash: await app.hasher.hash(PW),
  });
  return { app, u };
}

describe('login', () => {
  test('succeeds, and the returned user carries no password field of any kind', async () => {
    const { app, u } = await appWithUser();
    const r = await login(app.deps, u.email, PW);
    assert.equal(r.user.id, u.id);
    for (const k of keys(r.user)) {
      assert.equal(/pass|secret|hash|token/i.test(k), false, `login returned a field named '${k}'`);
    }
    app.close();
  });

  test('is case-insensitive on the address, so one account cannot become two', async () => {
    const { app } = await appWithUser();
    const r = await login(app.deps, 'SOMEONE@EXAMPLE.INVALID', PW);
    assert.ok(r.user.id);
    app.close();
  });

  test('gives the SAME generic message for a wrong password and an unknown address', async () => {
    const { app, u } = await appWithUser();
    const a = await login(app.deps, u.email, 'wrong-password-here').catch((e: unknown) => e);
    const b = await login(app.deps, 'nobody@example.invalid', PW).catch((e: unknown) => e);
    assert.ok(a instanceof AuthError && b instanceof AuthError);
    assert.equal(a.message, GENERIC_AUTH_FAILURE);
    assert.equal(b.message, GENERIC_AUTH_FAILURE,
      'an unknown address answered differently — that is an account-enumeration oracle');
    app.close();
  });

  test('refuses a disabled user, with the same generic message', async () => {
    const { app, u } = await appWithUser();
    disableUser(app.db, app.now, u.id);
    const e = await login(app.deps, u.email, PW).catch((x: unknown) => x);
    assert.ok(e instanceof AuthError);
    assert.equal(e.message, GENERIC_AUTH_FAILURE);
    app.close();
  });

  test('is rate-limited', async () => {
    const { app, u } = await appWithUser();
    for (let i = 0; i < LOGIN_LIMIT; i++) {
      await login(app.deps, u.email, 'wrong').catch(() => undefined);
    }
    const e = await login(app.deps, u.email, PW).catch((x: unknown) => x);
    assert.ok(e instanceof AuthError);
    assert.equal(e.code, 'E_RATE_LIMITED', 'the correct password succeeded after the limit was reached');
    app.close();
  });

  test('the cookie is httpOnly, secure and sameSite', async () => {
    const { app, u } = await appWithUser();
    const r = await login(app.deps, u.email, PW);
    assert.equal(r.cookie.httpOnly, true);
    assert.equal(r.cookie.secure, true);
    assert.equal(r.cookie.sameSite, 'Strict');
    app.close();
  });
});

describe('sessions are revocable SERVER-SIDE, which is the point of having them', () => {
  test('logout ends the session immediately', async () => {
    const { app, u } = await appWithUser();
    const r = await login(app.deps, u.email, PW);
    assert.ok(authenticate(app.deps, r.cookie.value));
    logout(app.deps, r.session_id, r.user);
    assert.equal(authenticate(app.deps, r.cookie.value), undefined);
    app.close();
  });

  test('DISABLING A USER REVOKES THEIR LIVE SESSIONS AT ONCE, not at next login', async () => {
    const { app, u } = await appWithUser();
    const r = await login(app.deps, u.email, PW);
    assert.ok(authenticate(app.deps, r.cookie.value));
    disableUser(app.db, app.now, u.id);
    assert.equal(authenticate(app.deps, r.cookie.value), undefined,
      'a disabled user kept a working session — revocation is not real');
    app.close();
  });

  test('rotation on privilege change: the old token stops working and the new one works', async () => {
    const { app, u } = await appWithUser();
    const first = await login(app.deps, u.email, PW);
    const second = rotateSession(app.deps, first.session_id, u.id);
    assert.equal(authenticate(app.deps, first.cookie.value), undefined);
    assert.ok(authenticate(app.deps, second.cookie.value));
    // and the rotation is recorded, not merely asserted in a comment
    const row = app.db.get<{ rotated_from: string | null }>(
      'SELECT rotated_from FROM sessions WHERE id = ?', [second.session_id],
    );
    assert.equal(row?.rotated_from, first.session_id);
    app.close();
  });

  test('changing a password rotates the session and revokes the old one', async () => {
    const { app, u } = await appWithUser();
    const first = await login(app.deps, u.email, PW);
    const next = await changeOwnPassword(app.deps, first.user, first.session_id, PW, 'another-long-password');
    assert.equal(authenticate(app.deps, first.cookie.value), undefined);
    assert.ok(authenticate(app.deps, next.cookie.value));
    app.close();
  });

  test('revokeAllSessions ends every one of them', async () => {
    const { app, u } = await appWithUser();
    const a = await login(app.deps, u.email, PW);
    const b = await login(app.deps, u.email, PW);
    revokeAllSessions(app.deps, u.id, 'TEST');
    assert.equal(authenticate(app.deps, a.cookie.value), undefined);
    assert.equal(authenticate(app.deps, b.cookie.value), undefined);
    app.close();
  });
});

describe('password reset', () => {
  test('reports the same thing for a known and an unknown address', async () => {
    const { app, u } = await appWithUser();
    const known = requestPasswordReset(app.deps, u.email);
    const unknown = requestPasswordReset(app.deps, 'nobody@example.invalid');
    assert.equal(known.accepted, true);
    assert.equal(unknown.accepted, true);
    assert.equal(unknown.plaintextToken, undefined);
    app.close();
  });

  test('the token is SINGLE USE', async () => {
    const { app, u } = await appWithUser();
    const r = requestPasswordReset(app.deps, u.email);
    assert.ok(r.plaintextToken);
    await completePasswordReset(app.deps, r.plaintextToken, 'brand-new-password-1');
    const again = await completePasswordReset(app.deps, r.plaintextToken, 'brand-new-password-2')
      .catch((e: unknown) => e);
    assert.ok(again instanceof AuthError);
    assert.equal(again.code, 'E_BAD_TOKEN');
    app.close();
  });

  test('only the HASH is stored — the plaintext token is not in the database', async () => {
    const { app, u } = await appWithUser();
    const r = requestPasswordReset(app.deps, u.email);
    assert.ok(r.plaintextToken);
    const rows = app.db.all('SELECT * FROM password_reset_tokens');
    for (const v of scalars(rows)) {
      assert.notEqual(v, r.plaintextToken, 'the reset token is stored in clear');
    }
    app.close();
  });

  test('consuming a reset revokes every live session', async () => {
    const { app, u } = await appWithUser();
    const live = await login(app.deps, u.email, PW);
    const r = requestPasswordReset(app.deps, u.email);
    assert.ok(r.plaintextToken);
    await completePasswordReset(app.deps, r.plaintextToken, 'yet-another-password');
    assert.equal(authenticate(app.deps, live.cookie.value), undefined);
    app.close();
  });

  test('an expired token is refused', async () => {
    let t = Date.UTC(2026, 8, 8, 12, 0, 0);
    const app = await (await import('../src/app.ts')).buildApp({ twoFactor: 'off',
      hasher: fakeHasher(), now: () => new Date(t).toISOString(),
    });
    const u = createUser(app.db, app.now, {
      email: 'x@example.invalid', display_name: 'X', role: 'SALES',
      password_hash: await app.hasher.hash(PW),
    });
    const r = requestPasswordReset(app.deps, u.email);
    assert.ok(r.plaintextToken);
    t += 31 * 60 * 1000; // past the 30-minute life
    const e = await completePasswordReset(app.deps, r.plaintextToken, 'late-password-here').catch((x: unknown) => x);
    assert.ok(e instanceof AuthError);
    app.close();
  });
});

describe('A PASSWORD NEVER APPEARS IN A RESPONSE OR A LOG', () => {
  test('not in any response object, and not in any audit row', async () => {
    const app = await testApp(); // the fake hasher stores `fake$<plaintext>` ON PURPOSE
    const r = await seed(app.db, app.hasher, app.now);
    const marker = SEED_PASSWORD;

    // Exercise everything that produces a response or writes a log line.
    const li = await login(app.deps, 'admin@example.invalid', marker);
    await login(app.deps, 'admin@example.invalid', 'wrong-password-x').catch(() => undefined);
    const reset = requestPasswordReset(app.deps, 'sales@example.invalid');
    logout(app.deps, li.session_id, li.user);

    const responses: unknown[] = [li.user, li.cookie, reset.user, r.users, findById(app.db, li.user.id)];
    for (const v of scalars(responses)) {
      assert.equal(String(v).includes(marker), false, `a response carried the password: ${String(v)}`);
    }

    const audit = app.audit.entries();
    for (const v of scalars(audit)) {
      assert.equal(String(v).includes(marker), false, `an audit row carried the password: ${String(v)}`);
    }
    // and no audit row carries a hash either, which is the same mistake one step on
    for (const v of scalars(audit)) {
      assert.equal(String(v).startsWith('fake$'), false, 'an audit row carried a password hash');
    }
    app.close();
  });

  test('THE MARKER TEST CAN FAIL — the fake hasher really does embed the plaintext', async () => {
    // Without this, the assertion above would pass just as happily against a
    // hasher whose output never contained the password in the first place.
    const h = fakeHasher();
    const stored = await h.hash(SEED_PASSWORD);
    assert.equal(stored.includes(SEED_PASSWORD), true,
      'the fixture cannot detect a leak, so the leak tests above prove nothing');
  });

  test('the stored hash of the REAL hasher is argon2id and does not contain the password', async () => {
    const h = await defaultHasher();
    const stored = await h.hash(PW);
    assert.equal(stored.startsWith('$argon2id$'), true);
    assert.equal(stored.includes(PW), false);
    assert.equal(await h.verify(stored, PW), true);
    assert.equal(await h.verify(stored, 'not-the-password'), false);
    assert.equal(h.needsRehash(stored), false);
    assert.equal(h.needsRehash('$argon2id$v=19$m=1024,t=1,p=1$aaa$bbb'), true,
      'a weakly-parameterised hash was not flagged for rehash');
  });
});
