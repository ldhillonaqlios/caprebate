/**
 * PHASE 156a, 5 October 2026 — THE CONTACT FORM'S CLOUDFLARE KEYS ON THE TEST WEBSITE.
 *
 * The security check itself was built on 29 September 2026 (src/connectors/turnstile.ts, test/turnstile.test.ts). On
 * the test website it could never work: api/index.mjs reads only the names in TEST_DEPLOY_KEYS from Vercel's
 * settings, and TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY were not among them. So keys added in Vercel would be
 * ignored and the page would keep Cloudflare's test key. These tests prove both names are read, that the page then
 * carries the configured site key, and that the transfer to Cloudflare stays NOT approved (Sadique's decision).
 * The keys used are Cloudflare's published test keys, never real ones.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { turnstileSiteKey, turnstileWhy, withSiteKey, TURNSTILE_TEST_SITE_KEY } from '../src/connectors/turnstile.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';

/** Cloudflare's published test keys: a site key that forces an interactive check, and a secret that always fails. */
const SITE_FORCES_CHALLENGE = '3x00000000000000000000FF';
const SECRET_ALWAYS_FAILS = '2x0000000000000000000000000000000AA';

type Configure = (made: Awaited<ReturnType<typeof createApp>>, env: Record<string, string | undefined>) =>
  Promise<{ readonly password_changed: boolean; readonly keys_loaded: readonly string[]; readonly why: string }>;
async function entry(): Promise<{ configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[] }> {
  const url = new URL('../../../../api/index.mjs', import.meta.url).href;
  return (await import(url)) as { configureTestDeploy: Configure; TEST_DEPLOY_KEYS: readonly string[] };
}
async function made156a() {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-156a-')), now: () => '2026-10-05T10:00:00.000Z', sealKey: randomBytes(32) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  return made;
}
const PAGE_JS = `var SITEKEY='${TURNSTILE_TEST_SITE_KEY}';`;

describe('156a B2 · the Cloudflare keys reach the test website', () => {
  test('both Turnstile names are among the keys the test website reads from Vercel', async () => {
    const { TEST_DEPLOY_KEYS } = await entry();
    assert.ok(TEST_DEPLOY_KEYS.includes('TURNSTILE_SITE_KEY'), 'TURNSTILE_SITE_KEY is not read on the test website');
    assert.ok(TEST_DEPLOY_KEYS.includes('TURNSTILE_SECRET_KEY'), 'TURNSTILE_SECRET_KEY is not read on the test website');
  });

  test('with its password and both keys set, the keys are read and the page carries the configured site key', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made156a();
    try {
      const r = await configureTestDeploy(made, { CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-156a',
        TURNSTILE_SITE_KEY: SITE_FORCES_CHALLENGE, TURNSTILE_SECRET_KEY: SECRET_ALWAYS_FAILS });
      assert.deepEqual([...r.keys_loaded].sort(), ['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY']);
      assert.equal(turnstileSiteKey(made.app.secrets), SITE_FORCES_CHALLENGE);
      assert.equal(withSiteKey(PAGE_JS, turnstileSiteKey(made.app.secrets)), `var SITEKEY='${SITE_FORCES_CHALLENGE}';`);
      assert.ok(!r.why.includes(SECRET_ALWAYS_FAILS), 'the log line printed a key');
    } finally { made.close(); }
  });

  test('with the secret read, the start-up line moves from "no key" to "not approved": nothing is sent until Sadique says yes', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made156a();
    try {
      await configureTestDeploy(made, { CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-156a', TURNSTILE_SECRET_KEY: SECRET_ALWAYS_FAILS });
      const why = turnstileWhy(made.app.secrets);
      assert.match(why, /not approved/);
      assert.doesNotMatch(why, /no TURNSTILE_SECRET_KEY/);
    } finally { made.close(); }
  });

  test('the transfer to Cloudflare (a US company) is still NOT approved as shipped', () => {
    assert.equal(CALL_POLICIES['CLOUDFLARE_TURNSTILE']?.international_transfer_approved, false);
  });
});
