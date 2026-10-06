/**
 * PHASE 156a, 5 October 2026 — THE CONTACT FORM'S CLOUDFLARE KEYS ON THE TEST WEBSITE.
 *
 * The security check itself was built on 29 September 2026 (src/connectors/turnstile.ts, test/turnstile.test.ts). On
 * the test website it could never work: api/index.mjs reads only the names in TEST_DEPLOY_KEYS from Vercel's
 * settings, and TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY were not among them. So keys added in Vercel would be
 * ignored and the page would keep Cloudflare's test key. These tests prove both names are read, that the page then
 * carries the configured site key, and that the transfer to Cloudflare is approved for testing (Sadique, 5 Oct 2026).
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

  test('with the secret read, the start-up line moves from "no key" to "checked with Cloudflare" (approved 5 Oct 2026)', async () => {
    const { configureTestDeploy } = await entry();
    const made = await made156a();
    try {
      await configureTestDeploy(made, { CAPREBATE_TEST_PASSWORD: 'an-invented-test-password-156a', TURNSTILE_SECRET_KEY: SECRET_ALWAYS_FAILS });
      const why = turnstileWhy(made.app.secrets);
      assert.match(why, /checked on the server/);
      assert.doesNotMatch(why, /no TURNSTILE_SECRET_KEY|not approved/);
    } finally { made.close(); }
  });

  test('the transfer to Cloudflare (a US company) is approved for testing as shipped (Sadique, 5 Oct 2026)', () => {
    assert.equal(CALL_POLICIES['CLOUDFLARE_TURNSTILE']?.international_transfer_approved, true);
  });
});

/* ================================================================== *
 * 156a B3 · A TEST LOOKUP OF EPC OR CQC COULD NEVER CALL. Both cover only part of the UK, and the command took the
 * nation from the ONS postcode table — which it never opened (no CAPREBATE_POSTCODE_DB, and none is installed on the
 * Mac or the test website). Every EPC and CQC test lookup ended "no call was made" (5 Oct 2026, the first after the
 * keys went into Vercel). Now the person running it may say the nation: --nation england. Still never assumed.
 * ================================================================== */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

function lookupWorld(): { env: Record<string, string>; lines: () => Record<string, unknown>[] } {
  const dir = mkdtempSync(join(tmpdir(), 'cb-156a-smoke-'));
  const keys = join(dir, 'empty-keys.env');
  writeFileSync(keys, '', { mode: 0o600 });
  const log = join(dir, 'test-lookups.jsonl');
  const env = { PATH: process.env.PATH ?? '', HOME: dir, CAPREBATE_SECRETS: keys, CAPREBATE_TEST_LOOKUP_LOG: log, CAPREBATE_LIVE_SMOKE: '1' };
  const lines = () => (existsSync(log) ? readFileSync(log, 'utf8') : '').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
  return { env, lines };
}
const WHO156 = ['--who', 'Invented Tester', '--why', 'Phase 156a: the key went into Vercel'];

async function runLookup(source: string, extra: string[]): Promise<{ code: number; said: string; calls: number }> {
  const L = await import('../src/connectors/test-lookups.ts');
  const { fixtureTransport } = await import('../src/connectors/http.ts');
  const { secretsFromValues, forgetRegisteredSecretsForTest } = await import('../src/secrets.ts');
  const w = lookupWorld();
  const said: string[] = [];
  const deps = { now: () => '2026-10-05T11:00:00.000Z', out: (l: string) => { said.push(l); }, err: (l: string) => { said.push(l); } };
  assert.equal(L.runSwitchedOnCommand([source, ...WHO156], w.env, deps), 0);
  const transport = fixtureTransport({});
  const code = await L.runSmokeCommand([source, ...WHO156, ...extra], w.env, {
    ...deps, sleep: async () => {}, transport,
    secrets: secretsFromValues({ EPC_API_TOKEN: 'epc-fixture-key-156a', CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key-156a' }),
  });
  forgetRegisteredSecretsForTest();
  return { code, said: said.join('\n'), calls: transport.seen.length };
}

describe('156a B3 · a test lookup of EPC or CQC can be told the nation', () => {
  test('without --nation and with no postcode table: no call is made, and the command says how to give the nation', async () => {
    for (const s of ['EPC', 'CQC']) {
      const r = await runLookup(s, []);
      assert.equal(r.code, 1, s);
      assert.equal(r.calls, 0, `${s} called without knowing the nation`);
      assert.match(r.said, /--nation england/, `${s}: the refusal does not say how to give the nation`);
    }
  });

  test('with --nation england (and, for CQC, --council) the service is asked (a 404 from it, "nothing held", is a PASS)', async () => {
    for (const s of ['EPC', 'CQC']) {
      const r = await runLookup(s, ['--nation', 'england', ...(s === 'CQC' ? ['--council', 'Westminster'] : [])]);
      assert.ok(r.calls >= 1, `${s} asked nobody: ${r.said}`);
      assert.equal(r.code, 0, `${s}: ${r.said}`);
    }
  });

  test('a nation that is not one of the four is refused before anything is logged or asked', async () => {
    const r = await runLookup('EPC', ['--nation', 'France']);
    assert.equal(r.code, 1);
    assert.equal(r.calls, 0);
    assert.match(r.said, /england, wales, scotland or northern_ireland/);
  });

  test('CQC with the nation but no council says how to give the council, and asks nobody', async () => {
    const r = await runLookup('CQC', ['--nation', 'england']);
    assert.equal(r.calls, 0);
    assert.match(r.said, /--council Westminster/);
  });

  test('CQC covers England only: --nation wales asks nobody', async () => {
    const r = await runLookup('CQC', ['--nation', 'wales', '--council', 'Cardiff']);
    assert.equal(r.calls, 0);
    assert.equal(r.code, 1);
  });
});

describe('156a B3 · a test lookup of the Ordnance Survey building outlines', () => {
  async function osLookup(extra: string[], keys: Record<string, string>): Promise<{ code: number; said: string; calls: number; urls: string[]; headers: Record<string, string>[] }> {
    const L = await import('../src/connectors/test-lookups.ts');
    const { fixtureTransport } = await import('../src/connectors/http.ts');
    const { secretsFromValues, forgetRegisteredSecretsForTest } = await import('../src/secrets.ts');
    const w = lookupWorld();
    const said: string[] = [];
    const deps = { now: () => '2026-10-05T11:00:00.000Z', out: (l: string) => { said.push(l); }, err: (l: string) => { said.push(l); } };
    assert.equal(L.runSwitchedOnCommand(['OS_FEATURES', ...WHO156], w.env, deps), 0);
    const square = [[[530100, 179940], [530140, 179940], [530140, 179970], [530100, 179970], [530100, 179940]]];
    const transport = fixtureTransport({ 'GET /features/v1/wfs': { status: 200, body: JSON.stringify({ type: 'FeatureCollection', features: [{ geometry: { type: 'Polygon', coordinates: square } }] }) } });
    const code = await L.runSmokeCommand(['OS_FEATURES', ...WHO156, ...extra], w.env, { ...deps, sleep: async () => {}, transport, secrets: secretsFromValues(keys) });
    forgetRegisteredSecretsForTest();
    return { code, said: said.join('\n'), calls: transport.seen.length, urls: transport.seen.map((x) => x.url), headers: transport.seen.map((x) => x.headers) };
  }

  test('it is a test lookup source, and with the key it asks once round the public point and passes', async () => {
    const r = await osLookup([], { OS_DATA_HUB_API_KEY: 'os-fixture-key-156a' });
    assert.equal(r.code, 0, r.said);
    assert.equal(r.calls, 1);
    assert.match(r.urls[0] ?? '', /bbox=530040%2C179876%2C530200%2C180036/, 'not the square round the public point');
    assert.ok(!(r.urls[0] ?? '').includes('os-fixture-key'), 'the key went into the address');
    assert.equal(r.headers[0]?.['key'], 'os-fixture-key-156a');
    assert.match(r.said, /sent 1 building outline/);
  });

  test('without the key it refuses before asking anyone', async () => {
    const r = await osLookup([], {});
    assert.equal(r.code, 1);
    assert.equal(r.calls, 0);
    assert.match(r.said, /no OS_DATA_HUB_API_KEY in the key file/);
  });

  test('a typed point, postcode or address is refused: only the public test point', async () => {
    for (const extra of [['--easting', '530000', '--northing', '180000'], ['--postcode', 'SW1A 2AS'], ['--address', '1 Any Street']]) {
      const r = await osLookup(extra, { OS_DATA_HUB_API_KEY: 'os-fixture-key-156a' });
      assert.equal(r.code, 1, extra.join(' '));
      assert.equal(r.calls, 0, extra.join(' '));
    }
  });
});
