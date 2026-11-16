/**
 * PHASE 151e, line 1, 25 September 2026 — WHY EVERY PAGE OF THE TEST WEBSITE FAILED, AND THE TEST THAT KEEPS IT FIXED.
 *
 * Every page of caprebate-test.vercel.app answered "500 FUNCTION_INVOCATION_FAILED". Reproduced by running
 * api/index.mjs on a clean checkout with only the repository root's dependencies installed — which is all Vercel
 * installs (vercel.json: `npm install --omit=dev` at the root): the first request threw ERR_MODULE_NOT_FOUND, "Cannot
 * find package '@anthropic-ai/sdk' imported from src/integrations/connectors/claude.ts". Phase 146e (22 September 2026) added the
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

const HERE = fileURLToPath(new URL('../..', import.meta.url));     // 09-app/backend/ (the path has spaces: never .pathname)
const REPO = join(HERE, '..', '..', '..');                      // Development/ — the repository root
const read = (p: string) => readFileSync(p, 'utf8');
/* PHASE 161h: vercel.json became vercel.ts (both projects build from it); vercelConfig({}) is the old file, exactly. */
const VERCEL_CONFIG: unknown = ((await import(new URL('../../../../../vercel.ts', import.meta.url).href)) as { vercelConfig: (e: Record<string, string>) => unknown }).vercelConfig({});

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
    const v = VERCEL_CONFIG as { functions: Record<string, { includeFiles: string }> };
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
import { createApp } from '../../src/app/server.ts';
import { seed, SEED_PASSWORD } from '../../src/app/seed.ts';
import { secretsFromEnvironment } from '../../src/core/secrets.ts';
import { IDENTITY_CHECK, identityCheckMissing } from '../../src/integrations/connectors/identity-check.ts';

type Configure = (made: Awaited<ReturnType<typeof createApp>>, env: Record<string, string | undefined>) =>
  Promise<{ readonly seed_logins_locked: number; readonly keys_loaded: readonly string[]; readonly refused_set: readonly string[]; readonly why: string }>;
async function entry(): Promise<{ configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[]; TEST_WEBSITE_REFUSED_KEYS: readonly string[] }> {
  const url = new URL('../../../../../api/index.mjs', import.meta.url).href;
  return (await import(url)) as { configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[]; TEST_WEBSITE_REFUSED_KEYS: readonly string[] };
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
    const v = VERCEL_CONFIG as { outputDirectory: string };
    assert.equal(v.outputDirectory, 'public', 'with "." every committed file is served to anyone');
    assert.deepEqual(readdirSync(join(REPO, 'public')).filter((f) => f !== '.DS_Store'), ['robots.txt']);
    assert.match(read(join(REPO, 'public', 'robots.txt')), /^User-agent: \*\nDisallow: \/\n?$/);
    assert.match(read(join(REPO, '.gitignore')), /^!\/public\/robots\.txt$/m);
  });
});

describe('151e line 3, and 161n1a · the test website\'s keys: from its settings, and never one that reaches a real person', () => {
  test('secretsFromEnvironment reads the names it is given and nothing else, and ignores an empty one', () => {
    const s = secretsFromEnvironment({ ...DIDIT_ENV, ANTHROPIC_API_KEY: 'x', DIDIT_WORKFLOW_ID: '' }, ['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);
    const mine = s.forOwner('DIDIT_IDV');
    assert.equal(mine.has('DIDIT_API_KEY'), true);
    assert.equal(mine.has('DIDIT_WORKFLOW_ID'), false, 'an empty value is not a key');
    assert.equal(s.forOwner('CLAUDE_DOCUMENTS').has('ANTHROPIC_API_KEY'), false, 'a name it was not given was read');
    assert.ok(!String(s).includes(DIDIT_ENV.DIDIT_API_KEY), 'the store printed a key');
  });

  /* PHASE 161n1a, 16 Nov 2026 (ITRoadway's second review, H-01 and M-07): until then the test password unlocked real keys
     (Didit, email, WhatsApp, Zoom, Homedata, the timer). Now no setting unlocks them: the test website reads none. */
  test('with every real-service key in the settings, the test website reads none of them, and names each one to delete', async () => {
    const { configureTestDeploy, TEST_DEPLOY_KEYS, TEST_WEBSITE_REFUSED_KEYS } = await entry();
    const made = await made151e();
    try {
      const all: Record<string, string> = { ANTHROPIC_API_KEY: 'must-not-load', CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-161n1a' };
      for (const k of [...TEST_DEPLOY_KEYS, ...TEST_WEBSITE_REFUSED_KEYS]) all[k] ??= `invented-value-161n1a-${k.toLowerCase()}`;
      Object.assign(all, DIDIT_ENV, { CAPREBATE_MFA_KEY: rb151e(32).toString('base64') });
      const r = await configureTestDeploy(made, all);
      assert.deepEqual([...r.keys_loaded].sort(), [...TEST_DEPLOY_KEYS].sort());
      assert.deepEqual([...r.refused_set].sort(), [...TEST_WEBSITE_REFUSED_KEYS].sort());
      for (const k of TEST_WEBSITE_REFUSED_KEYS) {
        assert.ok(!made.app.secrets.names().includes(k), `${k} was read on the test website`);
        assert.ok(!r.why.includes(all[k] ?? '\u0000'), `${k}'s value reached the log line`);
      }
      assert.notDeepEqual(identityCheckMissing(IDENTITY_CHECK, made.app.secrets), [], 'Didit\'s keys were read');
      const { smtpLoginFromKeyFile, imapLoginFromKeyFile } = await import('../../src/integrations/index.ts');
      assert.equal(smtpLoginFromKeyFile(made.app.secrets), null, 'the sending login was read: email would go out');
      assert.equal(imapLoginFromKeyFile(made.app.secrets), null, 'the mailbox login was read');
      assert.equal(made.app.secrets.forOwner('CLAUDE_DOCUMENTS').has('ANTHROPIC_API_KEY'), false);
    } finally { made.close(); }
  });

  test('the keys it does read reach no real person, and the two lists never overlap', async () => {
    const { TEST_DEPLOY_KEYS, TEST_WEBSITE_REFUSED_KEYS } = await entry();
    assert.deepEqual([...TEST_DEPLOY_KEYS].sort(), ['CAPREBATE_MFA_KEY', 'COMPANIES_HOUSE_API_KEY', 'CQC_SUBSCRIPTION_KEY', 'EPC_API_TOKEN', 'OS_DATA_HUB_API_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY']);
    assert.deepEqual(TEST_DEPLOY_KEYS.filter((k) => TEST_WEBSITE_REFUSED_KEYS.includes(k)), []);
    for (const prefix of ['IONOS_', 'DIDIT_', 'WHATSAPP_', 'ZOOM_', 'HOMEDATA_', 'REPLY_TIMER']) {
      assert.ok(!TEST_DEPLOY_KEYS.some((k) => k.startsWith(prefix)), `a ${prefix} key is read on the test website`);
      assert.ok(TEST_WEBSITE_REFUSED_KEYS.some((k) => k.startsWith(prefix)), `no ${prefix} key is named for deletion`);
    }
  });

  test('the test password is read no more: it moves no login, and the seed password still opens nothing', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made151e();
    try {
      const before = hashes(made);
      const r = await configureTestDeploy(made, { CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-161n1a' });
      assert.deepEqual(hashes(made), before, 'a password changed');
      assert.ok(r.seed_logins_locked >= 5);
      assert.ok(r.refused_set.includes('CAPREBATE_TEST_PASSWORD'));
      const open = made.app.db.all<{ email: string }>('SELECT email FROM users WHERE disabled_at IS NULL');
      assert.deepEqual(open, [], 'an invented login can still sign in');
      void SEED_PASSWORD;
    } finally { made.close(); }
  });
});
