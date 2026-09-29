/**
 * 29 SEPTEMBER 2026 — NO SECOND STEP FOR THE INVENTED LOGINS ON THE TEST WEBSITE, AND WHY A STEP IS LOST.
 *
 * Lakhbir: "check the 2FA and stop it for the @example.invalid emails - every time I go to click 2FA via authenticator
 * app the session times out." Two things, each proved here:
 *   1. the test website (api/index.mjs) sets STAFF_EXCEPT_INVENTED: a login at the reserved domain example.invalid asks
 *      for no second step; every other staff login still must give one; the default is unchanged;
 *   2. the time-out: a sign-in step lives in the database, so on a database kept in memory a step begun on one copy is
 *      not there when the next page reaches another copy. Reproduced with two copies; the page now says so.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { isInventedLogin } from '../src/auth.ts';
import { STEP_LOST_ON_MEMORY } from '../src/web/router.ts';

type Made = Awaited<ReturnType<typeof createApp>>;

async function boot(twoFactor?: 'staff' | 'off' | 'staff-except-invented'): Promise<{ made: Made; base: string }> {
  const made = await createApp(':memory:', {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-invented-')),
    ...(twoFactor === undefined ? {} : { twoFactor }),
  });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  return { made, base: `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}` };
}

function browser() {
  let cookie = '';
  const keep = (r: Response): Response => {
    for (const c of r.headers.getSetCookie()) {
      const kv = c.split(';')[0] ?? ''; const k = kv.split('=')[0];
      cookie = cookie.split('; ').filter((x) => x !== '' && !x.startsWith(`${k}=`)).concat(kv.endsWith('=') ? [] : [kv]).join('; ');
    }
    return r;
  };
  return {
    get: async (base: string, p: string) => keep(await fetch(base + p, { redirect: 'manual', headers: { cookie } })),
    post: async (base: string, p: string, f: Record<string, string>) => keep(await fetch(base + p, {
      method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(f).toString(),
    })),
  };
}

async function addStaff(made: Made, email: string): Promise<void> {
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    [`u-real-${email}`, email, email.toLowerCase(), 'A Real Person', 'SALES', await made.app.hasher.hash(SEED_PASSWORD), t, t]);
}

describe('the invented logins on the test website', () => {
  test('the reserved domain is matched on the whole domain, in any case, and nothing else', () => {
    assert.equal(isInventedLogin('sales@example.invalid'), true);
    assert.equal(isInventedLogin('  Admin@EXAMPLE.INVALID '), true);
    assert.equal(isInventedLogin('someone@example.invalid.evil.com'), false);
    assert.equal(isInventedLogin('someone@notexample.invalid'), false);
    assert.equal(isInventedLogin('lakhbir@caprebate.co.uk'), false);
    assert.equal(isInventedLogin('example.invalid'), false);
  });

  test('under the test website setting, an invented staff login signs straight in, with no second step', async () => {
    const { made, base } = await boot('staff-except-invented');
    try {
      const b = browser();
      const r = await b.post(base, '/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.status, 303);
      assert.notEqual(r.headers.get('location'), '/login/step', 'an invented login was sent to a second step');
      assert.match(r.headers.getSetCookie().join(' '), /cb_session=[^;]+/);
    } finally { made.close(); }
  });

  test('an invented login that already set up an app still signs straight in', async () => {
    const { made, base } = await boot('staff-except-invented');
    try {
      made.app.db.run("UPDATE users SET mfa_method = 'APP' WHERE email = 'admin@example.invalid'");
      const r = await browser().post(base, '/login', { email: 'admin@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.status, 303);
      assert.notEqual(r.headers.get('location'), '/login/step');
    } finally { made.close(); }
  });

  test('every other staff login still must give a second step on the test website', async () => {
    const { made, base } = await boot('staff-except-invented');
    try {
      await addStaff(made, 'someone@caprebate.co.uk');
      const r = await browser().post(base, '/login', { email: 'someone@caprebate.co.uk', password: SEED_PASSWORD });
      assert.equal(r.status, 303);
      assert.equal(r.headers.get('location'), '/login/step');
    } finally { made.close(); }
  });

  test('the default is unchanged: an invented staff login still gives a second step', async () => {
    const { made, base } = await boot();
    try {
      const r = await browser().post(base, '/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.headers.get('location'), '/login/step');
    } finally { made.close(); }
  });

  test('the test website sets it, and nothing in src/ does', async () => {
    const { TEST_WEBSITE_TWO_FACTOR } = (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as { TEST_WEBSITE_TWO_FACTOR: string };
    assert.equal(TEST_WEBSITE_TWO_FACTOR, 'staff-except-invented');
    const { readFileSync } = await import('node:fs');
    const api = readFileSync(new URL('../../../../api/index.mjs', import.meta.url), 'utf8');
    assert.match(api, /twoFactor: TEST_WEBSITE_TWO_FACTOR/);
    const { readdirSync } = await import('node:fs');
    const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.ts') ? [readFileSync(new URL(e.name, dir), 'utf8')] : []);
    const setters = walk(new URL('../src/', import.meta.url)).filter((t) => /twoFactor:\s*'staff-except-invented'/.test(t));
    assert.equal(setters.length, 0, 'a file under src/ sets the invented-login exemption');
  });
});

describe('why the authenticator step reads "timed out" at once', () => {
  test('two copies on memory lose the step between pages, and the page now says why', async () => {
    const A = await boot(); const B = await boot();
    try {
      await addStaff(A.made, 'someone@caprebate.co.uk'); await addStaff(B.made, 'someone@caprebate.co.uk');
      const b = browser();
      await b.post(A.base, '/login', { email: 'someone@caprebate.co.uk', password: SEED_PASSWORD });
      assert.equal((await b.get(A.base, '/login/step')).status, 200);
      const lost = await b.post(B.base, '/login/step/method', { method: 'APP' });
      const text = await lost.text();
      assert.equal(lost.status, 401);
      assert.match(text, /timed out/);
      assert.match(text, /id="step-lost-why"/);
      assert.ok(text.includes(STEP_LOST_ON_MEMORY.slice(0, 60)));
    } finally { A.made.close(); B.made.close(); }
  });

  test('on one copy the same click reaches the app set-up page', async () => {
    const A = await boot();
    try {
      await addStaff(A.made, 'someone@caprebate.co.uk');
      const b = browser();
      await b.post(A.base, '/login', { email: 'someone@caprebate.co.uk', password: SEED_PASSWORD });
      await b.get(A.base, '/login/step');
      const r = await b.post(A.base, '/login/step/method', { method: 'APP' });
      assert.equal(r.status, 200);
      assert.doesNotMatch(await r.text(), /timed out/);
    } finally { A.made.close(); }
  });
});
