/**
 * PHASE 151e, line 1, 25 September 2026 — WHY EVERY PAGE OF THE TEST WEBSITE FAILED, AND THE TEST THAT KEEPS IT FIXED.
 *
 * Every page of caprebate-test.vercel.app answered "500 FUNCTION_INVOCATION_FAILED". Reproduced by running
 * api/index.mjs on a clean checkout with only the repository root's dependencies installed — which is all Vercel
 * installs (vercel.json: `npm install --omit=dev` at the root): the first request threw ERR_MODULE_NOT_FOUND, "Cannot
 * find package '@anthropic-ai/sdk' imported from src/connectors/claude.ts". Phase 146e (22 September 2026) added the
 * Claude API library to THIS package's package.json and not to the root's, so the test website has failed on every
 * request since that deploy — on the Mac it worked, because this folder has its own node_modules.
 *
 * The fix is in the root: the library in its package.json, and vercel.json's function carrying the installed
 * packages. What this file proves: every outside package the back end, the engine and the two module folders import
 * is a dependency of the ROOT package.json, at the version this package has installed; and every root dependency is
 * inside what vercel.json tells the function to carry.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));     // 09-app/backend/ (the path has spaces: never .pathname)
const REPO = join(HERE, '..', '..', '..');                      // Development/ — the repository root
const read = (p: string) => readFileSync(p, 'utf8');

/** Every file under a folder, skipping node_modules and backups. */
function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.includes('.bak')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|mjs|cjs|js)$/.test(e) && !/\.test\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** The outside packages a file imports: `from 'x'` and `import('x')`, never node: and never a relative path. */
function packagesImported(text: string): string[] {
  // only a real package name counts: the engine's generated code writes import lines as text ("from '" + src.id + "'")
  const names = [...text.matchAll(/(?:from\s+|import\(\s*)'([^'./][^']*)'/g)].map((m) => m[1]!)
    .filter((n) => !n.startsWith('node:') && /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w./-]*)?$/.test(n));
  return names.map((n) => (n.startsWith('@') ? n.split('/').slice(0, 2).join('/') : n.split('/')[0]!));
}

describe('151e · the test website installs everything the application imports', () => {
  test('every outside package imported by the application is a dependency of the repository ROOT, which is all Vercel installs', () => {
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies?: Record<string, string> };
    const rootDeps = root.dependencies ?? {};
    const dirs = [join(HERE, 'src'), join(REPO, 'api'), join(REPO, 'Caprebate/09-app/engine/src'),
      join(REPO, 'Caprebate/04-phase-work/phase3'), join(REPO, 'Caprebate/04-phase-work/phase9')];
    const imported = new Set<string>();
    for (const d of dirs) for (const f of files(d)) for (const n of packagesImported(read(f))) imported.add(n);
    assert.ok(imported.has('@node-rs/argon2'), 'the scan found no outside package at all - the scan, not the code, is broken');
    const missing = [...imported].filter((n) => rootDeps[n] === undefined).sort();
    assert.deepEqual(missing, [], `imported by the application but not in the root package.json, so the test website cannot start: ${missing.join(', ')}`);
  });

  test('the root pins each of those packages at the version this back end has installed and tests with', () => {
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies: Record<string, string> };
    const mine = JSON.parse(read(join(HERE, 'package.json'))) as { dependencies: Record<string, string> };
    for (const name of Object.keys(mine.dependencies)) {
      assert.ok(root.dependencies[name] !== undefined, `${name} is this package's dependency and not the root's`);
      const installed = (JSON.parse(read(join(HERE, 'node_modules', name, 'package.json'))) as { version: string }).version;
      assert.equal(root.dependencies[name], installed, `${name}: the root pins ${root.dependencies[name]}, the back end runs ${installed}`);
    }
  });

  test('vercel.json tells the function to carry every root dependency', () => {
    const v = JSON.parse(read(join(REPO, 'vercel.json'))) as { functions: Record<string, { includeFiles: string }> };
    const include = v.functions['api/index.mjs']?.includeFiles ?? '';
    const root = JSON.parse(read(join(REPO, 'package.json'))) as { dependencies: Record<string, string> };
    for (const name of Object.keys(root.dependencies)) {
      const carried = /(^|[{,])node_modules\/\*\*([},]|$)/.test(include) || include.includes(`node_modules/${name}/**`)
        || (name.startsWith('@') && include.includes(`node_modules/${name.split('/')[0]}/**`));
      assert.ok(carried, `${name} is installed but not carried by the function (includeFiles: ${include})`);
    }
  });
});

/* ================================================================== *
 * LINES 2 AND 3, 25 September 2026 — Lakhbir answered Word question 229 "yes": the test website stops showing our
 * files. And Didit on the test website: its keys read from the website's own settings, but ONLY behind a password
 * of its own, because the seed's password is in a file anyone could download.
 * ================================================================== */
import { randomBytes as rb151e } from 'node:crypto';
import { mkdtempSync as mkd151e } from 'node:fs';
import { tmpdir as tmp151e } from 'node:os';
import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { secretsFromEnvironment } from '../src/secrets.ts';
import { IDENTITY_CHECK, identityCheckMissing } from '../src/connectors/identity-check.ts';

type Configure = (made: Awaited<ReturnType<typeof createApp>>, env: Record<string, string | undefined>) =>
  Promise<{ readonly password_changed: boolean; readonly keys_loaded: readonly string[]; readonly why: string }>;
async function entry(): Promise<{ configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[] }> {
  const url = new URL('../../../../api/index.mjs', import.meta.url).href;
  return (await import(url)) as { configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[] };
}
const DIDIT_ENV = { DIDIT_API_KEY: 'test-didit-key-not-real-151e', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151e', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151e00000001' };
async function made151e() {
  const made = await createApp(':memory:', { documentRoot: mkd151e(join(tmp151e(), 'cb-151e-')), now: () => '2026-09-25T10:00:00.000Z', sealKey: rb151e(32) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  return made;
}
const hashes = (made: Awaited<ReturnType<typeof createApp>>) => made.app.db.all<{ email: string; password_hash: string }>('SELECT email, password_hash FROM users');

describe('151e line 2 · the test website shows no file of ours (Word question 229, answered yes)', () => {
  test('vercel.json serves nothing from the repository: its output folder is public/, which holds robots.txt alone, closed to crawlers', () => {
    const v = JSON.parse(read(join(REPO, 'vercel.json'))) as { outputDirectory: string };
    assert.equal(v.outputDirectory, 'public', 'with "." every committed file is served to anyone');
    assert.deepEqual(readdirSync(join(REPO, 'public')).filter((f) => f !== '.DS_Store'), ['robots.txt']);
    assert.match(read(join(REPO, 'public', 'robots.txt')), /^User-agent: \*\nDisallow: \/\n?$/);
    assert.match(read(join(REPO, '.gitignore')), /^!\/public\/robots\.txt$/m);
  });
});

describe('151e line 3 · Didit on the test website: keys from its settings, and only behind a password of its own', () => {
  test('secretsFromEnvironment reads the names it is given and nothing else, and ignores an empty one', () => {
    const s = secretsFromEnvironment({ ...DIDIT_ENV, HOMEDATA_API_KEY: 'x', DIDIT_WORKFLOW_ID: '' }, ['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);
    const mine = s.forOwner('DIDIT_IDV');
    assert.equal(mine.has('DIDIT_API_KEY'), true);
    assert.equal(mine.has('DIDIT_WORKFLOW_ID'), false, 'an empty value is not a key');
    assert.equal(s.forOwner('HOMEDATA_ADDRESS').has('HOMEDATA_API_KEY'), false, 'a name it was not given was read');
    assert.ok(!String(s).includes(DIDIT_ENV.DIDIT_API_KEY), 'the store printed a key');
  });

  test('with no password of its own, the Didit keys are NOT loaded even when they are in the settings, and the seed password stands', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made151e();
    try {
      const before = hashes(made);
      const r = await configureTestDeploy(made, { ...DIDIT_ENV });
      assert.equal(r.password_changed, false);
      assert.deepEqual(r.keys_loaded, []);
      assert.match(r.why, /password/);
      assert.deepEqual(hashes(made), before);
      assert.notDeepEqual(identityCheckMissing(IDENTITY_CHECK, made.app.secrets), [], 'real keys behind the public password');
    } finally { made.close(); }
  });

  test('a password shorter than twelve characters is refused the same way: nothing changes, no key is loaded', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made151e();
    try {
      const r = await configureTestDeploy(made, { ...DIDIT_ENV, CAPREBATE_TEST_PASSWORD: 'short' });
      assert.equal(r.password_changed, false);
      assert.deepEqual(r.keys_loaded, []);
    } finally { made.close(); }
  });

  test('with its own password: every login moves to it, the seed password stops working, and the three Didit keys — only those — are read', async () => {
    const { configureTestDeploy, TEST_DEPLOY_KEYS } = await entry();
    const made = await made151e();
    try {
      const pw = 'an-invented-test-password-151e';
      const r = await configureTestDeploy(made, { ...DIDIT_ENV, HOMEDATA_API_KEY: 'must-not-load', CAPREBATE_TEST_PASSWORD: pw });
      assert.equal(r.password_changed, true);
      assert.deepEqual([...r.keys_loaded].sort(), ['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);
      // PHASE 151k added the fourth: the key that seals the authenticator app secret (src/mfa-seal.ts).
      assert.deepEqual([...TEST_DEPLOY_KEYS].sort(), ['CAPREBATE_MFA_KEY', 'COMPANIES_HOUSE_API_KEY', 'DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID', 'IONOS_SMTP_HOST', 'IONOS_SMTP_PASSWORD', 'IONOS_SMTP_PORT', 'IONOS_SMTP_USER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_OPENING_TEMPLATE', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_TEMPLATE_LANGUAGE', 'WHATSAPP_VERIFY_TOKEN', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_HOST_EMAIL', 'ZOOM_SDK_CLIENT_ID', 'ZOOM_SDK_CLIENT_SECRET']);
      for (const u of hashes(made)) {
        assert.equal(await made.app.hasher.verify(u.password_hash, pw), true, `${u.email} did not move to the test password`);
        assert.equal(await made.app.hasher.verify(u.password_hash, SEED_PASSWORD), false, `${u.email} still takes the public seed password`);
      }
      assert.deepEqual(identityCheckMissing(IDENTITY_CHECK, made.app.secrets), []);
      assert.equal(made.app.secrets.forOwner('HOMEDATA_ADDRESS').has('HOMEDATA_API_KEY'), false);
    } finally { made.close(); }
  });
});
