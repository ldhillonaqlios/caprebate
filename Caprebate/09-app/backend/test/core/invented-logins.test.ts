/**
 * 29 SEPTEMBER 2026, AND 16 NOVEMBER 2026 (PHASE 161n1a) — THE INVENTED LOGINS ON THE TEST WEBSITE, AND WHY A STEP IS LOST.
 *
 * From 29 Sep 2026 the test website let a login at the reserved domain example.invalid skip the second step
 * (STAFF_EXCEPT_INVENTED). ITRoadway's second review (H-01) found that, with one shared password, it gave Admin to anyone
 * who learned the password. Phase 161n1a, proved here:
 *   1. the test website's policy is STAFF: an invented staff login is asked for the second step there too, and the
 *      exemption is gone from the code;
 *   2. on the test website the invented logins cannot sign in at all (configureTestDeploy locks them);
 *   3. (unchanged) a sign-in step lives in the database, so on memory a step begun on one copy is not there on the next.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../../src/app/server.ts';
import { seed, SEED_PASSWORD } from '../../src/app/seed.ts';
import { isInventedLogin } from '../../src/core/auth.ts';
import { STEP_LOST_ON_MEMORY } from '../../src/app/router.ts';

type Made = Awaited<ReturnType<typeof createApp>>;

async function boot(twoFactor?: 'staff' | 'off'): Promise<{ made: Made; base: string }> {
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

  test('under the test website setting, an invented staff login is asked for the second step', async () => {
    const { TEST_WEBSITE_TWO_FACTOR } = (await import(new URL('../../../../../api/index.mjs', import.meta.url).href)) as { TEST_WEBSITE_TWO_FACTOR: 'staff' };
    const { made, base } = await boot(TEST_WEBSITE_TWO_FACTOR);
    try {
      for (const email of ['sales@example.invalid', 'admin@example.invalid']) {
        const r = await browser().post(base, '/login', { email, password: SEED_PASSWORD });
        assert.equal(r.status, 303);
        assert.equal(r.headers.get('location'), '/login/step', `${email} skipped the second step`);
        assert.doesNotMatch(r.headers.getSetCookie().join(' '), /cb_session=[^;]+/);
      }
    } finally { made.close(); }
  });

  test('an invented login that already set up an app is asked for its code', async () => {
    const { made, base } = await boot('staff');
    try {
      made.app.db.run("UPDATE users SET mfa_method = 'APP' WHERE email = 'admin@example.invalid'");
      const r = await browser().post(base, '/login', { email: 'admin@example.invalid', password: SEED_PASSWORD });
      assert.equal(r.headers.get('location'), '/login/step');
    } finally { made.close(); }
  });

  test('every other staff login still must give a second step', async () => {
    const { made, base } = await boot('staff');
    try {
      await addStaff(made, 'someone@caprebate.co.uk');
      const r = await browser().post(base, '/login', { email: 'someone@caprebate.co.uk', password: SEED_PASSWORD });
      assert.equal(r.status, 303);
      assert.equal(r.headers.get('location'), '/login/step');
    } finally { made.close(); }
  });

  test('on the test website a seed login cannot sign in at all: configureTestDeploy locks every invented login', async () => {
    const { made, base } = await boot('staff');
    try {
      await addStaff(made, 'tester@caprebate.co.uk');
      const { configureTestDeploy } = (await import(new URL('../../../../../api/index.mjs', import.meta.url).href)) as {
        configureTestDeploy: (m: unknown, env: Record<string, string>) => Promise<{ seed_logins_locked: number; why: string }> };
      const r = await configureTestDeploy(made, {});
      assert.ok(r.seed_logins_locked >= 5, `only ${r.seed_logins_locked} locked`);
      for (const email of ['admin@example.invalid', 'sales@example.invalid', 'client@example.invalid']) {
        const page = await browser().post(base, '/login', { email, password: SEED_PASSWORD });
        assert.notEqual(page.headers.get('location'), '/login/step', `${email} reached the second step`);
        assert.doesNotMatch(page.headers.getSetCookie().join(' '), /cb_session=[^;]+/);
        const api = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SEED_PASSWORD }) });
        assert.equal(api.status, 401, `${email} was let past the password`);
      }
      // A real tester's own login is untouched (Admin made it in Admin > Users) and gives its second step.
      const own = await browser().post(base, '/login', { email: 'tester@caprebate.co.uk', password: SEED_PASSWORD });
      assert.equal(own.headers.get('location'), '/login/step');
      // A second start locks nothing new, and says so in the audit log only once.
      assert.equal((await configureTestDeploy(made, {})).seed_logins_locked, 0);
      assert.equal(Number(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'SEED_LOGINS_LOCKED'")?.n), 1);
    } finally { made.close(); }
  });

  test('the test website sets STAFF, and the exemption is gone from the code', async () => {
    const { TEST_WEBSITE_TWO_FACTOR } = (await import(new URL('../../../../../api/index.mjs', import.meta.url).href)) as { TEST_WEBSITE_TWO_FACTOR: string };
    assert.equal(TEST_WEBSITE_TWO_FACTOR, 'staff');
    const { readFileSync } = await import('node:fs');
    const api = readFileSync(new URL('../../../../../api/index.mjs', import.meta.url), 'utf8');
    assert.match(api, /twoFactor: TEST_WEBSITE_TWO_FACTOR/);
    assert.doesNotMatch(api, /'staff-except-invented'/);
    const { readdirSync } = await import('node:fs');
    const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : e.name.endsWith('.ts') ? [readFileSync(new URL(e.name, dir), 'utf8')] : []);
    const left = walk(new URL('../../src/', import.meta.url)).filter((t) => /'staff-except-invented'|'STAFF_EXCEPT_INVENTED'/.test(t));
    assert.equal(left.length, 0, 'a file under src/ still carries the invented-login exemption');
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
