/**
 * PHASE 161n1a, 16 NOVEMBER 2026 — THE TEST WEBSITE LOCKED DOWN (ITRoadway's second review: H-01, M-07, L-06).
 *
 * The other halves are proved beside the code they changed: the second step for every staff login and the locked seed
 * logins in test/core/invented-logins.test.ts; the keys the test website never reads in test/core/test-website-start.test.ts.
 * Here:
 *   1. the outbox page (/staff/dev-outbox): Admin only, only where the start asked for it, never on the live website;
 *      and no code or link is written to a log, by the demo or the test website;
 *   2. the first Admin login, made from the command line, its temporary password shown once;
 *   3. the command that lists the real people in the test database, and empties it only on --delete --yes.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp, DEV_OUTBOX_REFUSED } from '../../src/app/server.ts';
import { seed, SEED_PASSWORD } from '../../src/app/seed.ts';
import { codeAt, stepAt } from '../../src/core/totp.ts';
import { makeFirstAdmin, FirstAdminError } from '../../src/core/index.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
const BACKEND = join(import.meta.dirname, '..', '..');
const API = new URL('../../../../../api/index.mjs', import.meta.url).href;

async function boot(opts: { devOutbox?: boolean } = {}): Promise<{ made: Made; base: string }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')), ...opts });
  await seed(made.app.db, made.app.hasher, made.app.now);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  return { made, base: `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}` };
}

async function post(base: string, path: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown>; session: string }> {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const session = /cb_session=([^;]+)/.exec(r.headers.getSetCookie().join('; '))?.[1] ?? '';
  let parsed: Record<string, unknown> = {};
  try { parsed = (await r.json()) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: r.status, body: parsed, session };
}

/** Sign a login in with an authenticator app set up on the spot. Its session. */
async function signIn(base: string, email: string, password = SEED_PASSWORD): Promise<string> {
  const first = await post(base, '/api/login', { email, password });
  assert.equal(first.status, 202, JSON.stringify(first.body));
  const token = String(first.body.step_token);
  const chosen = await post(base, '/api/login/step/method', { step_token: token, method: 'APP' });
  const key = String(chosen.body.app_key ?? '').replace(/\s/g, '');
  const done = await post(base, '/api/login/step/code', { step_token: token, code: codeAt(key, stepAt(Date.now())) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return done.session;
}

const page = (base: string, session: string) => fetch(`${base}/staff/dev-outbox`, { redirect: 'manual', headers: { cookie: `cb_session=${session}` } });

describe('161n1a · 1 · the outbox page: Admin only, the demo and the test website only', () => {
  test('Admin reads the saved emails there, a sign-in code and a reset link included', async () => {
    const { made, base } = await boot({ devOutbox: true });
    try {
      const admin = await signIn(base, 'admin@example.invalid');
      // a sales login asks for an emailed code, and someone asks for a password reset
      const first = await post(base, '/api/login', { email: 'sales@example.invalid', password: SEED_PASSWORD });
      await post(base, '/api/login/step/method', { step_token: String(first.body.step_token), method: 'EMAIL' });
      await fetch(`${base}/login/forgot`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=accounting%40example.invalid' });
      const r = await page(base, admin);
      assert.equal(r.status, 200);
      const html = await r.text();
      assert.match(html, /Emails saved, not sent/);
      const code = /^(\d{6})$/m.exec(made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'SIGN_IN_CODE' ORDER BY rowid DESC LIMIT 1")?.body ?? '')?.[1];
      assert.ok(code !== undefined && html.includes(code), 'the sign-in code is not on the page');
      assert.match(html, /To sales@example\.invalid/);
      assert.match(html, /<a href="[^"]*\/login\/reset\?token=[0-9a-f]+"/, 'the reset link is not on the page as a link');
    } finally { made.server.close(); made.close(); }
  });

  test('every other role is refused, and a visitor with no session is sent to sign in', async () => {
    const { made, base } = await boot({ devOutbox: true });
    try {
      for (const email of ['sales@example.invalid', 'accounting@example.invalid', 'surveying@example.invalid']) {
        const s = await signIn(base, email);
        const r = await page(base, s);
        assert.equal(r.status, 403, `${email} opened the outbox page`);
        assert.doesNotMatch(await r.text(), /Emails saved, not sent/);
      }
      const nobody = await fetch(`${base}/staff/dev-outbox`, { redirect: 'manual' });
      assert.notEqual(nobody.status, 200);
      assert.doesNotMatch(await nobody.text(), /Emails saved, not sent/);
    } finally { made.server.close(); made.close(); }
  });

  test('the view-only role is refused by the rules too', async () => {
    const { READ_ONLY_RULES } = await import('../../src/core/authz.ts');
    assert.equal(READ_ONLY_RULES['dev_outbox.read']?.allow, null);
  });

  test('without the option the address does not exist, even for Admin', async () => {
    const { made, base } = await boot();
    try {
      const admin = await signIn(base, 'admin@example.invalid');
      const r = await page(base, admin);
      assert.equal(r.status, 404);
    } finally { made.server.close(); made.close(); }
  });

  test('the live start refuses it: with CAPREBATE_PRODUCTION=1 a start that asks for the page does not start', async () => {
    const was = process.env.CAPREBATE_PRODUCTION;
    process.env.CAPREBATE_PRODUCTION = '1';
    try {
      await assert.rejects(createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')), devOutbox: true }), (e: Error) => e.message === DEV_OUTBOX_REFUSED);
    } finally {
      if (was === undefined) delete process.env.CAPREBATE_PRODUCTION; else process.env.CAPREBATE_PRODUCTION = was;
    }
    // and the live website's own start never asks for it
    const live = readFileSync(join(BACKEND, 'src', 'app', 'live-website.ts'), 'utf8');
    assert.doesNotMatch(live, /devOutbox:/);
  });

  test('the demo and the test website ask for it, and nothing in src/ does', async () => {
    assert.match(readFileSync(join(BACKEND, 'tools', 'demo-server.ts'), 'utf8'), /devOutbox: true/);
    assert.match(readFileSync(new URL(API), 'utf8'), /devOutbox: true/);
    const { readdirSync } = await import('node:fs');
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [readFileSync(join(dir, e.name), 'utf8')] : []);
    assert.equal(walk(join(BACKEND, 'src')).filter((t) => /devOutbox:\s*true/.test(t)).length, 0);
  });

  test('no code or link is written to a log: the demo says only the kind, and the test website counts kinds', async () => {
    const demo = readFileSync(join(BACKEND, 'tools', 'demo-server.ts'), 'utf8');
    const loop = demo.slice(demo.indexOf('const shown = new Set'), demo.indexOf('made.server.listen'));
    assert.match(loop, /demoOutboxLine\(m\.kind\)/);
    assert.doesNotMatch(loop, /m\.body|m\.to_email|m\.subject/, 'the demo prints an email again');
    assert.match(demo, /`email of kind \$\{/);
    const { outboxLogLine } = (await import(API)) as { outboxLogLine: (rows: { kind: string; sent: boolean }[]) => string | null };
    const line = outboxLogLine([{ kind: 'SIGN_IN_CODE', sent: false }, { kind: 'SIGNUP_CONFIRM', sent: false }]) ?? '';
    assert.match(line, /SIGN_IN_CODE 1/);
    assert.doesNotMatch(line, /\d{6}|https?:|@/);
  });
});

describe('161n1a · 2 · the first Admin login, from the command line', () => {
  async function bare() {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')) });
    await seed(made.app.db, made.app.hasher, made.app.now);
    const { lockSeedLogins } = (await import(API)) as { lockSeedLogins: (db: unknown, now: () => string) => number };
    lockSeedLogins(made.app.db, made.app.now);
    return made;
  }

  test('it makes an Admin with a temporary password, shown once and kept only as a hash, and writes it to the audit log', async () => {
    const made = await bare();
    try {
      const r = await makeFirstAdmin(made.app, { email: 'owner@caprebate-invented.co.uk', display_name: 'An Invented Owner' });
      assert.equal(r.made, true);
      assert.equal(r.user.role, 'ADMIN');
      const row = made.app.db.get<{ password_hash: string; password_temporary_until: string | null }>('SELECT password_hash, password_temporary_until FROM users WHERE id = ?', [r.user.id]);
      assert.equal(row?.password_temporary_until, r.until);
      assert.ok(!String(row?.password_hash).includes(r.password));
      assert.equal(await made.app.hasher.verify(String(row?.password_hash), r.password), true);
      const audit = made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'USER_CREATED' AND object_id = ?", [r.user.id]);
      assert.match(String(audit?.detail), /first-admin command/);
      assert.ok(!String(audit?.detail).includes(r.password), 'the password reached the audit log');
    } finally { made.close(); }
  });

  test('it refuses an invented address, a second Admin, and an existing login without --again', async () => {
    const made = await bare();
    try {
      await assert.rejects(makeFirstAdmin(made.app, { email: 'admin2@example.invalid', display_name: 'Nobody' }), FirstAdminError);
      await makeFirstAdmin(made.app, { email: 'owner@caprebate-invented.co.uk', display_name: 'An Invented Owner' });
      await assert.rejects(makeFirstAdmin(made.app, { email: 'other@caprebate-invented.co.uk', display_name: 'Another Person' }), /already exists/);
      await assert.rejects(makeFirstAdmin(made.app, { email: 'owner@caprebate-invented.co.uk', display_name: 'An Invented Owner' }), /--again/);
      const again = await makeFirstAdmin(made.app, { email: 'owner@caprebate-invented.co.uk', display_name: 'x', again: true });
      assert.equal(again.made, false);
    } finally { made.close(); }
  });

  test('the new Admin signs in with it, chooses a password, and is then asked for the second step', async () => {
    const { made, base } = await boot();
    try {
      const { lockSeedLogins } = (await import(API)) as { lockSeedLogins: (db: unknown, now: () => string) => number };
      lockSeedLogins(made.app.db, made.app.now);
      const r = await makeFirstAdmin(made.app, { email: 'owner@caprebate-invented.co.uk', display_name: 'An Invented Owner' });
      const first = await post(base, '/api/login', { email: 'owner@caprebate-invented.co.uk', password: r.password });
      assert.equal(first.status, 202);
      assert.equal(first.body.needs, 'CHOOSE_PASSWORD');
    } finally { made.server.close(); made.close(); }
  });
});

describe('161n1a · 3 · the real people in the test database: listed, then deleted only on --delete --yes', () => {
  type Tool = typeof import('../../tools/test-website-people.ts');
  async function fileDb(): Promise<string> {
    const file = join(mkdtempSync(join(tmpdir(), 'cb-161n1a-db-')), 'test.db');
    const made = await createApp(file, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')) });
    const { seedOnce } = (await import(API)) as { seedOnce: (m: unknown, s: unknown) => Promise<unknown> };
    await seedOnce(made, seed);
    // what the test website gathered from real people before Phase 161n1a (all invented here, at addresses that look real)
    const t = made.app.now();
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-real-1', 'someone@gmail-invented.co.uk', 'someone@gmail-invented.co.uk', 'A Person', 'SALES', 'x', t, t]);
    made.app.db.run("INSERT INTO outbox (id, created_at, to_email, subject, body, kind) VALUES ('o-real-1', ?, 'someone@gmail-invented.co.uk', 'Hello', 'Hello', 'NOTIFICATION')", [t]);
    made.close();
    return file;
  }

  test('it lists counts only, changes nothing, and refuses a database without the invented seed and the live website', async () => {
    const tool = (await import('../../tools/test-website-people.ts')) as Tool;
    const file = await fileDb();
    const r = await tool.run(['--file', file], {});
    assert.equal(r.code, 0, r.lines.join('\n'));
    const text = r.lines.join('\n');
    assert.match(text, /\s1 {2}logins at a real address/);
    assert.match(text, /\s1 {2}emails to a real address in the outbox/);
    assert.doesNotMatch(text, /someone@|A Person/, 'a name or an address was printed');
    assert.match(text, /Nothing was changed/);
    assert.equal((await tool.run(['--file', file, '--delete'], {})).code, 1, 'it deleted without --yes');
    assert.equal((await tool.run(['--file', file], { CAPREBATE_PRODUCTION: '1' })).code, 1);
    const empty = join(mkdtempSync(join(tmpdir(), 'cb-161n1a-db-')), 'other.db');
    const other = await createApp(empty, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')) });
    other.close();
    const refused = await tool.run(['--file', empty, '--delete', '--yes'], {});
    assert.equal(refused.code, 1);
    assert.match(refused.lines.join('\n'), /not the test database/);
  });

  test('--delete --yes empties it, builds it again from the invented seed with its logins locked, and writes the deletion to the audit log', async () => {
    const tool = (await import('../../tools/test-website-people.ts')) as Tool;
    const file = await fileDb();
    const removed: string[] = [];
    const blobClient = async () => ({
      async list() { return { objects: [{ pathname: 'caprebate-documents/a' }, { pathname: 'caprebate-documents/b' }], cursor: null }; },
      async remove(p: string) { removed.push(p); },
    });
    const r = await tool.run(['--file', file, '--delete', '--yes'], { CAPREBATE_BLOB_TOKEN: 'invented-blob-token-161n1a' }, { blobClient });
    assert.equal(r.code, 0, r.lines.join('\n'));
    assert.deepEqual(removed, ['caprebate-documents/a', 'caprebate-documents/b']);
    const made = await createApp(file, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1a-')) });
    try {
      const db = made.app.db;
      assert.equal(db.get("SELECT id FROM users WHERE id = 'u-real-1'"), undefined, 'the real login is still there');
      assert.equal(db.get("SELECT id FROM outbox WHERE id = 'o-real-1'"), undefined);
      assert.ok(db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") !== undefined, 'the invented seed was not built again');
      assert.deepEqual(db.all('SELECT email FROM users WHERE disabled_at IS NULL'), [], 'an invented login can sign in');
      const entry = db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'TEST_DATABASE_CLEARED'");
      assert.ok(entry !== undefined, 'the deletion is not in the audit log');
      assert.match(entry.detail, /M-07/);
      assert.match(entry.detail, /"files_deleted":2/);
      assert.equal(made.app.audit.verify().intact, true);
    } finally { made.close(); }
  });
});
