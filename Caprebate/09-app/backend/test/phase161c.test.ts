/**
 * PHASE 161c, 4 November 2026 — THE STATUS PAGE SAYS ONLY "OK", AND THE KEY FILE IS LOCKED DOWN ON THE LIVE SERVER.
 *
 * The ITRoadway technical audit (2 Nov 2026), section 4, rows 2 and 4. What these tests hold:
 *   - GET /api/health answers exactly {"ok":true} while the database answers, and 503 {"ok":false} when it does not;
 *   - the list of what is built and switched off is at /staff/connections/switches.json, for Admin only, and the
 *     Connections page links it;
 *   - the key file in systemd's credentials folder ($CREDENTIALS_DIRECTORY/caprebate-secrets) is read first;
 *   - a key file with mode 644, or one another user owns, stops a start with CAPREBATE_PRODUCTION=1 and is only a
 *     warning without it - checked on the function and on a real start of src/core/server.ts;
 *   - no key is printed by any of it.
 * Every key value here is invented and every file is in a temporary folder outside the repository.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createApp } from '../src/core/server.ts';
import { seed } from '../src/core/seed.ts';
import { STUBS } from '../src/core/app.ts';
import {
  CREDENTIAL_NAME, credentialsFile, forgetRegisteredSecretsForTest, isProduction, keyFileLooseness, keyFileStartCheck,
  loadSecrets, secretsPath,
} from '../src/core/secrets.ts';

const BACKEND = join(import.meta.dirname, '..');
/** Invented, long enough to be registered for redaction, and easy to search for in any output. */
const FAKE_TOKEN = 'invented-epc-token-161c-NOT-A-REAL-KEY-0001';

function keyFile(mode: number, dir = mkdtempSync(join(tmpdir(), 'cb-161c-')), name = 'keys.env'): string {
  const f = join(dir, name);
  writeFileSync(f, `# invented, for a test\nEPC_API_TOKEN=${FAKE_TOKEN}\n`);
  chmodSync(f, mode);
  return f;
}

async function start() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161c-docs-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  return { made, base };
}

/* ================================================================== the status page */

test('161c: /api/health answers exactly {"ok":true}, and nothing about what is built or switched on', async () => {
  const { made, base } = await start();
  try {
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.equal(body, '{"ok":true}');
    for (const s of STUBS) assert.ok(!body.includes(s.module), `the status page names ${s.module}`);
    assert.match(r.headers.get('content-type') ?? '', /application\/json/);
  } finally { made.close(); }
});

test('161c: /api/health still asks the database, and answers 503 {"ok":false} when it cannot be reached', async () => {
  const { made, base } = await start();
  try {
    made.app.db.close();
    const r = await fetch(`${base}/api/health`);
    assert.equal(r.status, 503);
    assert.equal(await r.text(), '{"ok":false}');
  } finally { made.server.close(); }
});

/* ================================================================== the switch list, for Admin only */

test('161c: the switch list needs Admin - signed out, Sales and a client get none of it; Admin gets all of it', async () => {
  const { made, base } = await start();
  try {
    const s = await seed(made.app.db, made.app.hasher, made.app.now);
    const cookieOf = async (who: string): Promise<string> => {
      const r = await fetch(`${base}/login`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
      });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return r.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').join('; ');
    };
    const get = async (cookie: string) => {
      const r = await fetch(`${base}/staff/connections/switches.json`, { redirect: 'manual', headers: { cookie } });
      return { status: r.status, body: await r.text() };
    };
    const leaks = (body: string) => STUBS.some((x) => body.includes(x.module));

    const out = await get('');
    assert.notEqual(out.status, 200, 'signed out');
    assert.equal(leaks(out.body), false);
    for (const who of ['sales', 'client']) {
      const r = await get(await cookieOf(who));
      assert.notEqual(r.status, 200, who);
      assert.equal(leaks(r.body), false, `${who} saw the switch list`);
    }
    const sales = await get(await cookieOf('sales'));
    assert.equal(sales.status, 403);

    const adminCookie = await cookieOf('admin');
    const admin = await get(adminCookie);
    assert.equal(admin.status, 200);
    assert.deepEqual(JSON.parse(admin.body), JSON.parse(JSON.stringify({ stubs: STUBS })));

    const page = await fetch(`${base}/staff/connections`, { headers: { cookie: adminCookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /href="\/staff\/connections\/switches\.json"/, 'the Connections page links it');
  } finally { made.close(); }
});

/* ================================================================== the credentials folder */

test('161c: systemd’s credentials folder is read first, ahead of CAPREBATE_SECRETS and the home-folder file', () => {
  forgetRegisteredSecretsForTest();
  const creds = mkdtempSync(join(tmpdir(), 'cb-161c-creds-'));
  const inCreds = keyFile(0o400, creds, CREDENTIAL_NAME);
  const other = mkdtempSync(join(tmpdir(), 'cb-161c-other-'));
  const elsewhere = join(other, 'keys.env');
  writeFileSync(elsewhere, 'EPC_API_TOKEN=the-other-file-161c-invented-value\n');
  chmodSync(elsewhere, 0o600);

  const env = { CREDENTIALS_DIRECTORY: creds, CAPREBATE_SECRETS: elsewhere };
  assert.equal(credentialsFile(env), inCreds);
  assert.equal(secretsPath(env), inCreds);
  const store = loadSecrets({ env });
  assert.equal(store.state, 'LOADED');
  assert.equal(store.forOwner('EPC').get('EPC_API_TOKEN'), FAKE_TOKEN);
  assert.match(store.why, /systemd’s credentials folder/);

  // Named but empty, or not named, or not an absolute folder: the key file is found as before.
  assert.equal(secretsPath({ CREDENTIALS_DIRECTORY: other, CAPREBATE_SECRETS: elsewhere }), elsewhere);
  assert.equal(secretsPath({ CAPREBATE_SECRETS: elsewhere }), elsewhere);
  assert.equal(secretsPath({ CREDENTIALS_DIRECTORY: 'relative/folder', CAPREBATE_SECRETS: elsewhere }), elsewhere);
  assert.equal(loadSecrets({ env: { CAPREBATE_SECRETS: elsewhere } }).forOwner('EPC').get('EPC_API_TOKEN'), 'the-other-file-161c-invented-value');
  forgetRegisteredSecretsForTest();
});

/* ================================================================== the start-up check */

test('161c: the production setting is CAPREBATE_PRODUCTION=1 and nothing else', () => {
  assert.equal(isProduction({ CAPREBATE_PRODUCTION: '1' }), true);
  assert.equal(isProduction({ CAPREBATE_PRODUCTION: ' 1 ' }), true);
  for (const v of [undefined, '', '0', 'true', 'yes']) assert.equal(isProduction({ CAPREBATE_PRODUCTION: v }), false, String(v));
});

test('161c: a key file with mode 644 stops a production start, and is only a warning elsewhere', () => {
  const f = keyFile(0o644);
  const live = keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' } });
  assert.equal(live.stop, true);
  const said = live.lines.join('\n');
  assert.match(said, /NOT STARTED/);
  assert.ok(said.includes(f), 'it names the file');
  assert.match(said, /644/);
  assert.match(said, /chmod 600/);
  assert.ok(!said.includes(FAKE_TOKEN), 'no key in the words');

  const here = keyFileStartCheck({ env: { CAPREBATE_SECRETS: f } });
  assert.equal(here.stop, false);
  assert.match(here.lines.join('\n'), /^Warning: the key file /);

  chmodSync(f, 0o600);
  assert.deepEqual(keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' } }), { stop: false, lines: [] });
  chmodSync(f, 0o400);
  assert.equal(keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' } }).stop, false, '400 is fine');
  for (const mode of [0o640, 0o604, 0o660, 0o666, 0o700]) {
    chmodSync(f, mode);
    assert.equal(keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' } }).stop, true, mode.toString(8));
  }
});

test('161c: a key file owned by another user stops a production start, and is only a warning elsewhere', () => {
  const f = keyFile(0o600);
  const statOf = () => ({ mode: 0o100600, uid: 0 });
  const live = keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' }, statOf, uid: 1001 });
  assert.equal(live.stop, true);
  assert.match(live.lines.join('\n'), /belongs to another user \(user 0\), not the user this app runs as \(user 1001\)/);
  assert.equal(keyFileStartCheck({ env: { CAPREBATE_SECRETS: f }, statOf, uid: 1001 }).stop, false);
  assert.equal(keyFileStartCheck({ env: { CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' }, statOf, uid: 0 }).stop, false);
  assert.deepEqual(keyFileLooseness({ mode: 0o100644, uid: 5 }, 6).length, 2, 'both faults are said');
});

test('161c: no key file is not this check’s business, and the credentials folder’s copy is systemd’s to guard', () => {
  const none = join(mkdtempSync(join(tmpdir(), 'cb-161c-none-')), 'absent.env');
  assert.deepEqual(keyFileStartCheck({ env: { CAPREBATE_SECRETS: none, CAPREBATE_PRODUCTION: '1' } }), { stop: false, lines: [] });
  // systemd grants the read with an access list on a file root owns, which shows as a wider mode and another owner.
  const creds = mkdtempSync(join(tmpdir(), 'cb-161c-creds-'));
  keyFile(0o440, creds, CREDENTIAL_NAME);
  assert.deepEqual(keyFileStartCheck({ env: { CREDENTIALS_DIRECTORY: creds, CAPREBATE_PRODUCTION: '1' }, uid: 99999 }), { stop: false, lines: [] });
});

/* ================================================================== a real start */

function runServer(env: Record<string, string>, stopWhen: RegExp | null): Promise<{ code: number | null; out: string }> {
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'NODE_TEST_CONTEXT' && !k.startsWith('CAPREBATE_') && k !== 'CREDENTIALS_DIRECTORY') childEnv[k] = v;
  Object.assign(childEnv, { PORT: '0', CAPREBATE_DB: ':memory:', CAPREBATE_DOCS: mkdtempSync(join(tmpdir(), 'cb-161c-run-')) }, env);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/core/server.ts'], { cwd: BACKEND, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`the server did not finish or start in time:\n${out}`)); }, 60_000);
    const seen = (b: Buffer) => {
      out += b.toString('utf8');
      if (stopWhen !== null && stopWhen.test(out)) child.kill('SIGTERM');
    };
    child.stdout.on('data', seen);
    child.stderr.on('data', seen);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

test('161c: a real production start with a 644 key file stops, names the file, and prints no key', async () => {
  const f = keyFile(0o644);
  const r = await runServer({ CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' }, null);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(f), r.out);
  assert.match(r.out, /NOT STARTED/);
  assert.doesNotMatch(r.out, /caprebate back end on/, 'it must not listen');
  assert.ok(!r.out.includes(FAKE_TOKEN), 'a key was printed');
});

test('161c: the same file elsewhere is a warning, and the server starts; locked down, nothing is said', async () => {
  const f = keyFile(0o644);
  const r = await runServer({ CAPREBATE_SECRETS: f }, /caprebate back end on/);
  assert.match(r.out, /Warning: the key file /);
  assert.match(r.out, /caprebate back end on/);
  assert.ok(!r.out.includes(FAKE_TOKEN), 'a key was printed');

  chmodSync(f, 0o600);
  const ok = await runServer({ CAPREBATE_SECRETS: f, CAPREBATE_PRODUCTION: '1' }, /caprebate back end on/);
  assert.match(ok.out, /caprebate back end on/);
  // Only the check's own words: the next start-up line may mention "the key file" too, if it arrives before the stop.
  assert.doesNotMatch(ok.out, /is not locked down|NOT STARTED|Warning: the key file/);
});
