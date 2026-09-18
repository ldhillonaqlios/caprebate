/**
 * The audit log. Append-only and tamper-evident are CLAIMS, so each is tested
 * by trying to break it — including from outside the application, which is the
 * only attempt that matters.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AuditError, screenDetail, _canonical } from '../src/audit.ts';
import { AnchorLog, GENESIS, verifyChain } from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import { testApp, scalars } from './helpers.ts';

describe('append-only is ENFORCED, not documented', () => {
  test('UPDATE on the audit log is refused by the database itself', async () => {
    const app = await testApp();
    app.audit.append({ at: app.now(), kind: 'LOGIN_SUCCEEDED', outcome: 'ALLOWED', detail: {} });
    assert.throws(
      () => app.db.run('UPDATE audit_log SET outcome = ? WHERE seq = ?', ['REFUSED', 1]),
      /append-only/,
    );
    app.close();
  });

  test('DELETE on the audit log is refused by the database itself', async () => {
    const app = await testApp();
    app.audit.append({ at: app.now(), kind: 'LOGOUT', outcome: 'ALLOWED', detail: {} });
    assert.throws(() => app.db.run('DELETE FROM audit_log WHERE seq = ?', [1]), /append-only/);
    app.close();
  });
});

describe('tamper-evidence', () => {
  test('an intact chain verifies', async () => {
    const app = await testApp();
    for (let i = 0; i < 5; i++) {
      app.audit.append({ at: app.now(), kind: 'LOGIN_SUCCEEDED', outcome: 'ALLOWED', detail: { i } });
    }
    assert.deepEqual(app.audit.verify(), { intact: true, broken_at: null });
    app.close();
  });

  test('VERIFY CAN FAIL — a row edited around the triggers is detected', async () => {
    const app = await testApp();
    for (let i = 0; i < 3; i++) {
      app.audit.append({ at: app.now(), kind: 'LOGIN_SUCCEEDED', outcome: 'ALLOWED', detail: { i } });
    }
    assert.equal(app.audit.verify().intact, true);

    // Drop the triggers and rewrite history — exactly what somebody with the
    // database file would do. The chain is what notices.
    app.db.execDdl('DROP TRIGGER audit_log_no_update');
    app.db.run('UPDATE audit_log SET outcome = ? WHERE seq = ?', ['REFUSED', 2]);

    const v = app.audit.verify();
    assert.equal(v.intact, false, 'an edited row went undetected — the chain proves nothing');
    assert.equal(v.broken_at, 2);
    app.close();
  });

  test('a REMOVED row is detected too, not only an edited one', async () => {
    const app = await testApp();
    for (let i = 0; i < 4; i++) {
      app.audit.append({ at: app.now(), kind: 'LOGOUT', outcome: 'ALLOWED', detail: { i } });
    }
    app.db.execDdl('DROP TRIGGER audit_log_no_delete');
    app.db.run('DELETE FROM audit_log WHERE seq = ?', [2]);
    assert.equal(app.audit.verify().intact, false);
    app.close();
  });
});

describe('the two logs use the same scheme — agreed on a hash, not just alike', () => {
  test('the canonicalisation and chaining match caprebate-anchor-quarantine.ts', () => {
    // Same genesis.
    assert.equal(GENESIS, '0'.repeat(64));

    // Same canonical form: keys sorted, undefined and null both 'null'.
    assert.equal(_canonical({ b: 1, a: 'x' }), '{"a":"x","b":1}');
    assert.equal(_canonical({ a: undefined }), '{"a":null}');

    // And the chain arithmetic is the same operation: build one entry the way
    // AnchorLog does and confirm the hash is sha256 over the canonical body.
    const log = new AnchorLog();
    const e = log.append({ kind: 'QUARANTINE_CREATED', job_id: 'j', actor: 'u', at: 'T', detail: {} });
    const expect = createHash('sha256')
      .update(_canonical({ seq: 1, kind: 'QUARANTINE_CREATED', job_id: 'j', actor: 'u', at: 'T', detail: {}, prev_hash: GENESIS }))
      .digest('hex');
    assert.equal(e.hash, expect);
    assert.equal(verifyChain(log.entries()).intact, true);
  });
});

describe('NO PERSONAL DATA IN LOG LINES — refused, not redacted', () => {
  test('a key that looks like personal data or a secret is refused', () => {
    for (const key of ['email', 'user_email', 'display_name', 'password', 'session_token', 'postcode', 'phone']) {
      assert.throws(() => screenDetail({ [key]: 'x' }), AuditError, `'${key}' was accepted into a log line`);
    }
  });

  test('a value that looks like an email address is refused whatever the key is called', () => {
    assert.throws(() => screenDetail({ who: 'someone@example.invalid' }), AuditError);
  });

  test('identifiers, roles, counts and outcomes are accepted', () => {
    assert.doesNotThrow(() => screenDetail({ user_id: 'u-1', role: 'SALES', count: 3, reason: 'credentials_or_state' }));
  });

  test('the refusal is enforced at append time, not only in the helper', async () => {
    const app = await testApp();
    assert.throws(
      () => app.audit.append({ at: app.now(), kind: 'LOGIN_FAILED', outcome: 'REFUSED', detail: { email: 'a@b.invalid' } }),
      AuditError,
    );
    app.close();
  });

  test('a real login writes no email address into the log', async () => {
    const { seed } = await import('../src/seed.ts');
    const { login } = await import('../src/auth.ts');
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    await login(app.deps, 'sales@example.invalid', r.password);
    for (const v of scalars(app.audit.entries())) {
      assert.equal(String(v).includes('@'), false, `an audit row carried an address: ${String(v)}`);
    }
    app.close();
  });
});
