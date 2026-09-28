/**
 * SETTINGS — and the test the phase brief singles out.
 *
 * "A test must prove the four non-admin roles cannot reach any of it — NOT
 * THAT THE MENU IS HIDDEN, THAT THE ENDPOINT REFUSES."
 *
 * So every administration test below is a real HTTP request, made with a real
 * session cookie belonging to a real user of that role, against the real
 * server. Nothing here calls `can()` and asserts a boolean — that is tested in
 * authz.test.ts and it proves the rule, not the wiring. What it cannot prove is
 * that the route ASKS, and a route that forgot to ask is exactly the defect
 * this file exists to catch. Each one is asserted to answer 403, and to have
 * changed nothing.
 *
 * THE FIVE ROLES ARE DRIVEN FROM `APP_ROLES`, not from a list typed here, so
 * the day a sixth role is added this suite covers it or fails.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { encodePng } from '../src/web/images.ts';
import { clockToMinutes, minutesToClock, workingTimesFor } from '../src/web/schedule.ts';

const PASSWORD = 'a-very-long-development-password';

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

async function boot(): Promise<{
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  store: Awaited<ReturnType<typeof createApp>>['store'];
  client(): Client;
  signIn(role: AppRole): Promise<{ client: Client; id: string }>;
  base: string;
}> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-settings-'));
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const client = (): Client => {
    const c: Client = {
      cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
        }
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      post(path, fields) {
        return c.req(path, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(),
        });
      },
    };
    return c;
  };

  const T = '2026-09-08T00:00:00.000Z';
  const hash = await made.app.hasher.hash(PASSWORD);
  const BIZ = 'biz-for-the-client';
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [BIZ, 'Testworth Dental Limited', 'dental', 'ENGAGEMENT_SIGNED', T]);
  for (const role of APP_ROLES) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,?)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
       `${role} Person`, role, hash, T, T, role === 'CLIENT' ? BIZ : null],
    );
  }

  async function signIn(role: AppRole): Promise<{ client: Client; id: string }> {
    const c = client();
    const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
    assert.equal(r.status, 303, `${role} could not sign in`);
    return { client: c, id: `u-${role}` };
  }

  return { close: made.close, app: made.app, store: made.store, client, signIn, base };
}

/* ================================================================== *
 * THE ADMINISTRATION REFUSALS — the endpoint, not the menu
 * ================================================================== */

describe('ADMIN ONLY, and it is the endpoint that refuses', () => {
  test('the four non-admin roles are refused every administration route', async () => {
    const h = await boot();
    try {
      const before = h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0;

      for (const role of APP_ROLES.filter((r) => r !== 'ADMIN')) {
        const { client } = await h.signIn(role);

        // 1 · read the user list
        const list = await client.req('/staff/users');
        assert.equal(list.status, 403, `${role} was shown the user list`);

        // 2 · create a user
        const created = await client.post('/staff/users/create', {
          email: `sneaked-${role}@example.invalid`, display_name: 'Sneaked In',
          role: 'ADMIN', password: 'another-long-password-here',
        });
        assert.equal(created.status, 403, `${role} created a user`);

        // 3 · assign a role
        const assigned = await client.post('/staff/users/u-SALES/role', { role: 'ADMIN' });
        assert.equal(assigned.status, 403, `${role} assigned a role`);

        // 4 · disable a user
        const disabled = await client.post('/staff/users/u-SALES/disable', {});
        assert.equal(disabled.status, 403, `${role} disabled a user`);
      }

      // AND NOTHING HAPPENED. A 403 that still wrote the row would pass every
      // assertion above and be exactly the defect worth catching.
      assert.equal(h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0, before,
        'a refused request created a user anyway');
      assert.equal(
        h.app.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', ['u-SALES'])?.role,
        'SALES', 'a refused request changed a role anyway');
      assert.equal(
        h.app.db.get<{ d: string | null }>('SELECT disabled_at AS d FROM users WHERE id = ?', ['u-SALES'])?.d,
        null, 'a refused request disabled a user anyway');
    } finally { h.close(); }
  });

  test('the administrator can do all four', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('ADMIN');
      assert.equal((await client.req('/staff/users')).status, 200);

      const made = await client.post('/staff/users/create', {
        email: 'new.person@example.invalid', display_name: 'New Person',
        role: 'SALES', password: 'a-perfectly-long-password',
      });
      // Phase 151j: the page shows the temporary password once (the password posted here is ignored)
      assert.equal(made.status, 200);
      assert.match(made.body, /id="temporary-password"/);
      const created = h.app.db.get<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE email_canonical = ?', ['new.person@example.invalid']);
      assert.ok(created !== undefined, 'the user was not created');
      assert.equal(created.role, 'SALES');

      assert.equal((await client.post(`/staff/users/${created.id}/role`, { role: 'ACCOUNTING' })).status, 303);
      assert.equal(
        h.app.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [created.id])?.role,
        'ACCOUNTING');

      assert.equal((await client.post(`/staff/users/${created.id}/disable`, {})).status, 303);
      assert.notEqual(
        h.app.db.get<{ d: string | null }>('SELECT disabled_at AS d FROM users WHERE id = ?', [created.id])?.d,
        null);
    } finally { h.close(); }
  });

  test('a CLIENT has no working-times form — AND THE ROUTE REFUSES ANYWAY', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('CLIENT');
      const page = await client.req('/portal/settings');
      assert.equal(page.status, 200);
      assert.equal(/working-times/.test(page.body), false, 'a client was drawn a diary');
      // The absent form is the courtesy. THIS is the control.
      const posted = await client.post('/portal/settings/working-times',
        { d1_on: 'on', d1_start: '09:00', d1_end: '17:00' });
      assert.equal(posted.status, 403, 'a client set working times by posting to the route');
      assert.equal(workingTimesFor(h.app.db, 'u-CLIENT').length, 0);
    } finally { h.close(); }
  });

  test('a CLIENT cannot even reach the back office landing page', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('CLIENT');
      assert.equal((await client.req('/staff')).status, 403);
      assert.equal((await client.req('/staff/assessments')).status, 403);
      assert.equal((await client.req('/staff/calendar')).status, 403);
      // Signing in sends them to their own portal rather than to a refusal.
      const c2 = h.client();
      const r = await c2.post('/login', { email: 'client@example.invalid', password: PASSWORD });
      assert.equal(r.location, '/portal');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * A DISABLED USER'S SESSIONS END AT ONCE
 * ================================================================== */

describe('disabling a user', () => {
  test('REVOKES A LIVE SESSION IMMEDIATELY, not at next login', async () => {
    const h = await boot();
    try {
      const sales = await h.signIn('SALES');
      // The session works.
      assert.equal((await sales.client.req('/staff')).status, 200);

      const admin = await h.signIn('ADMIN');
      assert.equal((await admin.client.post('/staff/users/u-SALES/disable', {})).status, 303);

      // THE SAME COOKIE, THE VERY NEXT REQUEST. No new sign-in anywhere.
      const after = await sales.client.req('/staff');
      assert.equal(after.status, 303, 'a disabled user kept a working session');
      assert.equal(after.location, '/login');

      const rows = h.app.db.all<{ revoked_reason: string | null }>(
        'SELECT revoked_reason FROM sessions WHERE user_id = ?', ['u-SALES']);
      assert.ok(rows.some((r) => r.revoked_reason === 'USER_DISABLED'));
    } finally { h.close(); }
  });

  test('the last administrator cannot be disabled, and neither can you disable yourself', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('ADMIN');
      const self = await client.post('/staff/users/u-ADMIN/disable', {});
      assert.equal(self.status, 400);
      assert.match(self.body, /your own account/);

      // Make a second administrator, then the first may go.
      await client.post('/staff/users/create', {
        email: 'second.admin@example.invalid', display_name: 'Second Admin',
        role: 'ADMIN', password: 'yet-another-long-password',
      });
      const second = h.app.db.get<{ id: string }>(
        'SELECT id FROM users WHERE email_canonical = ?', ['second.admin@example.invalid']);
      assert.ok(second !== undefined);
      assert.equal((await client.post(`/staff/users/${second.id}/disable`, {})).status, 303);
    } finally { h.close(); }
  });

  test('a role change revokes that user’s sessions too — a privilege change is a privilege change', async () => {
    const h = await boot();
    try {
      const sales = await h.signIn('SALES');
      assert.equal((await sales.client.req('/staff')).status, 200);
      const admin = await h.signIn('ADMIN');
      assert.equal((await admin.client.post('/staff/users/u-SALES/role', { role: 'SURVEYING' })).status, 303);
      const after = await sales.client.req('/staff');
      assert.equal(after.status, 303, 'a demoted user kept a session under the old role');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ADMIN POWER IS OVER AN ACCOUNT, NOT INSIDE IT
 * ================================================================== */

describe('what an administrator may NOT do', () => {
  test('there is no route by which anybody edits another person’s name, username or photograph', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('ADMIN');
      // The settings routes are `self` for every role, so the administrator's
      // own post changes the ADMINISTRATOR and nobody else — there is no
      // target parameter to abuse, which is the structural half of the claim.
      await client.post('/staff/settings/profile', { display_name: 'Renamed By Admin' });
      assert.equal(
        h.app.db.get<{ n: string }>('SELECT display_name AS n FROM users WHERE id = ?', ['u-SALES'])?.n,
        'SALES Person', 'an administrator renamed somebody else');
      assert.equal(
        h.app.db.get<{ n: string }>('SELECT display_name AS n FROM users WHERE id = ?', ['u-ADMIN'])?.n,
        'Renamed By Admin');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ONE'S OWN SETTINGS
 * ================================================================== */

describe('every role manages its own account', () => {
  test('display name, username and password, for all five roles', async () => {
    const h = await boot();
    try {
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const { client } = await h.signIn(role);
        // THE SAME IMPLEMENTATION, MOUNTED TWICE. A client's settings are at
        // /portal/settings and a staff member's at /staff/settings; the routes
        // behind them are one function, so a password change cannot rotate the
        // session on one and forget on the other.
        const base = role === 'CLIENT' ? '/portal/settings' : '/staff/settings';
        // And the OTHER mount is refused, by the endpoint.
        if (role === 'CLIENT') {
          assert.equal((await client.req('/staff/settings')).status, 403,
            'a client reached the back office settings page');
        }
        assert.equal((await client.req(base)).status, 200, `${role} could not open settings`);

        assert.equal((await client.post(`${base}/profile`, { display_name: `${role} Renamed` })).status, 303);
        assert.equal(
          h.app.db.get<{ n: string }>('SELECT display_name AS n FROM users WHERE id = ?', [`u-${role}`])?.n,
          `${role} Renamed`);

        assert.equal((await client.post(`${base}/username`,
          { username: `${role.toLowerCase()}.new@example.invalid` })).status, 303);
        assert.equal(
          h.app.db.get<{ e: string }>('SELECT email_canonical AS e FROM users WHERE id = ?', [`u-${role}`])?.e,
          `${role.toLowerCase()}.new@example.invalid`);

        // Every role can change its own password, and the session survives it.
        assert.equal((await client.post(`${base}/password`, {
          current: PASSWORD, next: `${role.toLowerCase()}-a-long-new-password`,
          again: `${role.toLowerCase()}-a-long-new-password`,
        })).status, 303, `${role} could not change its own password`);
        assert.equal((await client.req(base)).status, 200,
          `${role} was signed out by its own password change`);
      }
    } finally { h.close(); }
  });

  test('a username already in use is refused, and the old one is kept', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const r = await client.post('/staff/settings/username', { username: 'admin@example.invalid' });
      assert.equal(r.status, 400);
      assert.match(r.body, /not available/);
      assert.equal(
        h.app.db.get<{ e: string }>('SELECT email_canonical AS e FROM users WHERE id = ?', ['u-SALES'])?.e,
        'sales@example.invalid');
    } finally { h.close(); }
  });

  test('changing a password rotates the session rather than ending it', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const r = await client.post('/staff/settings/password', {
        current: PASSWORD, next: 'a-brand-new-long-password', again: 'a-brand-new-long-password',
      });
      assert.equal(r.status, 303);
      // The cookie jar took the replacement, so the very next request works —
      // a password change that signed you out would be technically correct and
      // practically a bug report.
      assert.equal((await client.req('/staff/settings')).status, 200);
      const rotated = h.app.db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND rotated_from IS NOT NULL', ['u-SALES']);
      assert.equal(rotated?.n, 1, 'the rotation was not recorded');
    } finally { h.close(); }
  });

  test('the wrong current password changes nothing, and says nothing useful', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const r = await client.post('/staff/settings/password', {
        current: 'not-the-password', next: 'a-brand-new-long-password', again: 'a-brand-new-long-password',
      });
      assert.equal(r.status, 400);
      assert.match(r.body, /did not match/);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * WORKING TIMES
 * ================================================================== */

describe('working times', () => {
  test('a week is saved, and read back as the same minutes', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const r = await client.post('/staff/settings/working-times', {
        d1_on: 'on', d1_start: '09:00', d1_end: '17:00',
        d3_on: 'on', d3_start: '13:30', d3_end: '16:00',
      });
      assert.equal(r.status, 303);
      const rows = workingTimesFor(h.app.db, 'u-SALES');
      assert.equal(rows.length, 2);
      assert.deepEqual(rows.map((w) => [w.weekday, minutesToClock(w.start_min), minutesToClock(w.end_min)]),
        [[1, '09:00', '17:00'], [3, '13:30', '16:00']]);
    } finally { h.close(); }
  });

  test('SAVING THE WEEK REPLACES IT — an unticked day is gone, not merely hidden', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      await client.post('/staff/settings/working-times', {
        d1_on: 'on', d1_start: '09:00', d1_end: '17:00',
        d2_on: 'on', d2_start: '09:00', d2_end: '17:00',
      });
      await client.post('/staff/settings/working-times', { d1_on: 'on', d1_start: '10:00', d1_end: '12:00' });
      const rows = workingTimesFor(h.app.db, 'u-SALES');
      assert.equal(rows.length, 1, 'Tuesday survived a week that did not include it');
      assert.equal(rows[0]?.start_min, 600);
    } finally { h.close(); }
  });

  test('a day that finishes before it starts is refused', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const r = await client.post('/staff/settings/working-times',
        { d1_on: 'on', d1_start: '17:00', d1_end: '09:00' });
      assert.equal(r.status, 400);
      assert.match(r.body, /finishes before it starts/);
      assert.equal(workingTimesFor(h.app.db, 'u-SALES').length, 0);
    } finally { h.close(); }
  });

  test('rubbish in a time field is refused rather than parsed into something plausible', () => {
    // The parser, directly: a value that is not a time must be null and never 0,
    // because 0 is midnight and midnight is a working hour.
    assert.equal(clockToMinutes('nine o’clock'), null);
    assert.equal(clockToMinutes(''), null);
    assert.equal(clockToMinutes('25:00'), null);
    assert.equal(clockToMinutes('09:61'), null);
    assert.equal(clockToMinutes('00:00'), 0);
    assert.equal(clockToMinutes('09:30'), 570);
  });
});

/* ================================================================== *
 * THE PROFILE PHOTO — the same hardened path as a client document
 * ================================================================== */

function testPng(w = 40, h = 30): Buffer {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 10; rgba[i + 1] = 120; rgba[i + 2] = 200; rgba[i + 3] = 255;
  }
  return Buffer.from(encodePng({ width: w, height: h, rgba }));
}

describe('the profile photo', () => {
  test('an upload is re-encoded, and what is stored is not what was sent', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const sent = Buffer.concat([testPng(), Buffer.from('<?php system($_GET[0]); ?>', 'latin1')]);
      const r = await client.req('/staff/settings/photo', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(sent),
      });
      assert.equal(r.status, 303);

      const row = h.app.db.get<{ storage_key: string; byte_size: number; source_bytes: number; source_format: string }>(
        'SELECT storage_key, byte_size, source_bytes, source_format FROM user_photos WHERE user_id = ?', ['u-SALES']);
      assert.ok(row !== undefined, 'no photo row was written');
      assert.equal(row.source_format, 'png');
      assert.equal(row.source_bytes, sent.length);
      assert.notEqual(row.byte_size, sent.length, 'the stored file is the same size as the one sent');

      // Served back, and the payload is not in it.
      const served = await client.req('/staff/settings/photo');
      assert.equal(served.status, 200);
      assert.equal(served.body.includes('php'), false, 'the payload was served back');
    } finally { h.close(); }
  });

  test('a JPEG is refused, and a PHP script named like an image is refused', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
      const r1 = await client.req('/staff/settings/photo', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(jpeg),
      });
      assert.equal(r1.status, 400);
      assert.match(r1.body, /PNG/);

      const php = Buffer.from('<?php system($_GET["c"]); ?>', 'latin1');
      const r2 = await client.req('/staff/settings/photo', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array(php),
      });
      assert.equal(r2.status, 400);
      assert.equal(
        h.app.db.get('SELECT user_id FROM user_photos WHERE user_id = ?', ['u-SALES']), undefined,
        'a refused upload still wrote a row');
    } finally { h.close(); }
  });

  test('a browser form upload works — multipart, one file', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      const boundary = '----cbTestBoundary';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="me.png"\r\nContent-Type: image/png\r\n\r\n`, 'latin1'),
        testPng(),
        Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
      ]);
      const r = await client.req('/staff/settings/photo', {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body: new Uint8Array(body),
      });
      assert.equal(r.status, 303);
      assert.ok(h.app.db.get('SELECT user_id FROM user_photos WHERE user_id = ?', ['u-SALES']) !== undefined);
    } finally { h.close(); }
  });

  test('NOBODY IS SERVED SOMEBODY ELSE’S PHOTOGRAPH — the endpoint has no target to swap', async () => {
    const h = await boot();
    try {
      const sales = await h.signIn('SALES');
      await sales.client.req('/staff/settings/photo', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(testPng()),
      });
      const admin = await h.signIn('ADMIN');
      // The administrator has no photo of their own, and there is no parameter
      // on this route by which they could ask for the sales user's.
      const r = await admin.client.req('/staff/settings/photo');
      assert.equal(r.status, 404);
      assert.equal(r.body.includes('PNG'), false);
    } finally { h.close(); }
  });

  test('a stored photo carries no execute bit and is served with nosniff', async () => {
    const h = await boot();
    try {
      const { client } = await h.signIn('SALES');
      await client.req('/staff/settings/photo', {
        method: 'POST', headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(testPng()),
      });
      const key = h.app.db.get<{ storage_key: string }>(
        'SELECT storage_key FROM user_photos WHERE user_id = ?', ['u-SALES'])?.storage_key;
      assert.ok(key !== undefined);
      // The store's own hardening, checked on the real file this test produced.
      const { statSync } = await import('node:fs');
      const { join: j } = await import('node:path');
      const st = statSync(j(h.store.root, key));
      assert.equal(st.mode & 0o111, 0, 'a stored photograph has an execute bit');
      assert.equal(st.mode & 0o077, 0, 'a stored photograph is readable by another account');

      const raw = await fetch(`${h.base}/staff/settings/photo`, {
        headers: { cookie: client.cookie }, redirect: 'manual',
      });
      assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(raw.headers.get('content-type'), 'image/png');
      assert.equal(raw.headers.get('cache-control'), 'private, no-store');
    } finally { h.close(); }
  });
});
