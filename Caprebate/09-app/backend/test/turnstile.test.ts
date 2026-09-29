/**
 * 29 SEPTEMBER 2026 — THE CONTACT FORM'S SECURITY CHECK, ON THE SERVER (src/connectors/turnstile.ts).
 *
 * The home page runs Cloudflare Turnstile in the browser; this proves the server now asks Cloudflare whether the
 * answer is real before an enquiry is kept, and refuses it when not. Recorded answers only: nothing here reaches
 * Cloudflare. The keys are Cloudflare's published TEST keys (1x…AA passes, 2x…AA fails on the real service), so the
 * values are public; the answers are recorded in the shape Cloudflare documents
 * (developers.cloudflare.com/turnstile/get-started/server-side-validation, read 29 Sep 2026).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues, SECRET_KEYS } from '../src/secrets.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import {
  checkTurnstile, turnstileSiteKey, turnstileWhy, withSiteKey, refusalWords,
  TURNSTILE_ENDPOINT, TURNSTILE_TEST_SITE_KEY,
} from '../src/connectors/turnstile.ts';

const TEST_SECRET_PASSES = '1x0000000000000000000000000000000AA';
const TEST_SECRET_FAILS = '2x0000000000000000000000000000000AA';
const LIVE_SHAPED_SITE_KEY = '0x4AAAAAAAInventedSiteKey01';
const ANSWER = 'XXXX.DUMMY.TOKEN.XXXX';
const APPROVED = { international_transfer_approved: true } as const;
const OK: Fixture = { status: 200, body: JSON.stringify({ success: true, 'error-codes': [], challenge_ts: '2026-09-29T10:00:00.000Z', hostname: 'caprebate-test.vercel.app' }), headers: { 'content-type': 'application/json' } };
const NO: Fixture = { status: 200, body: JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), headers: { 'content-type': 'application/json' } };
const DOWN: Fixture = { status: 503, body: 'unavailable' };
const KEY = `POST ${TURNSTILE_ENDPOINT}`;

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-turnstile-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
});
after(() => made.close());

const deps = (secrets: Record<string, string>, fixtures: Record<string, Fixture>, approved = true) => {
  const t = fixtureTransport(fixtures);
  return { t, d: { audit: made.app.audit, now: made.app.now, transport: t, secrets: secretsFromValues(secrets), ...(approved ? { policy_override: APPROVED } : {}) } };
};

describe('the check itself', () => {
  test('no secret key: nothing is checked and nothing is sent', async () => {
    const { t, d } = deps({}, { [KEY]: OK });
    assert.deepEqual(await checkTurnstile(d, ANSWER, '203.0.113.9'), { state: 'NOT_CHECKED', reason: 'no_secret' });
    assert.equal(t.seen.length, 0);
  });

  test('a key, but Cloudflare (US) is not approved: nothing is sent, and that is the row as shipped', async () => {
    assert.equal(CALL_POLICIES.CLOUDFLARE_TURNSTILE?.region, 'US');
    assert.equal(CALL_POLICIES.CLOUDFLARE_TURNSTILE?.international_transfer_approved, false);
    const { t, d } = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK }, false);
    assert.deepEqual(await checkTurnstile(d, ANSWER, null), { state: 'NOT_CHECKED', reason: 'transfer_not_approved' });
    assert.equal(t.seen.length, 0);
  });

  test('approved: a real answer passes, sent once to Cloudflare’s address with the secret, the answer and the visitor’s address', async () => {
    const { t, d } = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK });
    assert.deepEqual(await checkTurnstile(d, ANSWER, '203.0.113.9'), { state: 'PASSED' });
    assert.equal(t.seen.length, 1);
    assert.equal(t.seen[0]?.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(t.seen[0]?.method, 'POST');
    const sent = new URLSearchParams(t.seen[0]?.body ?? '');
    assert.deepEqual([sent.get('secret'), sent.get('response'), sent.get('remoteip')], [TEST_SECRET_PASSES, ANSWER, '203.0.113.9']);
  });

  test('an answer Cloudflare rejects fails, with its error code and nothing else', async () => {
    const { d } = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_FAILS }, { [KEY]: NO });
    assert.deepEqual(await checkTurnstile(d, ANSWER, null), { state: 'FAILED', reason: 'rejected', codes: ['invalid-input-response'] });
  });

  test('no answer fails without a call; no reply from Cloudflare fails after ONE try (an answer is good once)', async () => {
    const a = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK });
    assert.deepEqual(await checkTurnstile(a.d, '   ', null), { state: 'FAILED', reason: 'no_answer', codes: [] });
    assert.deepEqual(await checkTurnstile(a.d, 'x'.repeat(2049), null), { state: 'FAILED', reason: 'no_answer', codes: [] });
    assert.equal(a.t.seen.length, 0);
    const b = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: DOWN });
    assert.deepEqual(await checkTurnstile(b.d, ANSWER, null), { state: 'FAILED', reason: 'no_reply', codes: [] });
    assert.equal(b.t.seen.length, 1);
    assert.equal(CALL_POLICIES.CLOUDFLARE_TURNSTILE?.max_attempts, 1);
  });

  test('no record keeps the secret or the answer: the call’s audit row carries neither', async () => {
    const { d } = deps({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK });
    await checkTurnstile(d, ANSWER, '203.0.113.9');
    const rows = made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED'");
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(r.detail.includes(TEST_SECRET_PASSES), false, 'the secret is in an audit row');
      assert.equal(r.detail.includes(ANSWER), false, 'the answer is in an audit row');
      assert.equal(r.detail.includes('203.0.113.9'), false, 'the visitor’s address is in an audit row');
    }
  });
});

describe('the keys, and what the log says', () => {
  test('both names are known, owned by the check, and listed with no value in secrets.example.env', () => {
    const mine = SECRET_KEYS.filter((k) => k.owner === 'CLOUDFLARE_TURNSTILE').map((k) => [k.name, k.secret]);
    assert.deepEqual(mine, [['TURNSTILE_SITE_KEY', false], ['TURNSTILE_SECRET_KEY', true]]);
    const example = readFileSync(join(import.meta.dirname, '..', 'secrets.example.env'), 'utf8');
    assert.match(example, /^TURNSTILE_SITE_KEY=$/m);
    assert.match(example, /^TURNSTILE_SECRET_KEY=$/m);
  });

  test('the start-up line says which of the three states holds, and never prints a key', () => {
    const none = turnstileWhy(secretsFromValues({}));
    const waiting = turnstileWhy(secretsFromValues({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }));
    const on = turnstileWhy(secretsFromValues({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES, TURNSTILE_SITE_KEY: LIVE_SHAPED_SITE_KEY }), APPROVED);
    const noSite = turnstileWhy(secretsFromValues({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }), APPROVED);
    assert.match(none, /not checked on the server: no TURNSTILE_SECRET_KEY/);
    assert.match(waiting, /not checked on the server: Cloudflare is outside the UK and EU and sending to it is not approved yet/);
    assert.match(on, /is checked on the server with Cloudflare/);
    assert.match(noSite, /no TURNSTILE_SITE_KEY is set/);
    for (const line of [none, waiting, on, noSite]) {
      assert.equal(line.includes(TEST_SECRET_PASSES) || line.includes(LIVE_SHAPED_SITE_KEY), false);
    }
  });

  test('the site key comes from the key file, only in Cloudflare’s shape; the page’s test key is replaced by it', () => {
    assert.equal(turnstileSiteKey(secretsFromValues({ TURNSTILE_SITE_KEY: LIVE_SHAPED_SITE_KEY })), LIVE_SHAPED_SITE_KEY);
    assert.equal(turnstileSiteKey(secretsFromValues({ TURNSTILE_SITE_KEY: "0x4AAA';alert(1);//" })), null);
    assert.equal(turnstileSiteKey(secretsFromValues({})), null);
    const js = `var SITEKEY='${TURNSTILE_TEST_SITE_KEY}';`;
    assert.equal(withSiteKey(js, LIVE_SHAPED_SITE_KEY), `var SITEKEY='${LIVE_SHAPED_SITE_KEY}';`);
    assert.equal(withSiteKey(js, null), js);
  });

  test('the refusal is in plain words and names no code', () => {
    for (const reason of ['no_answer', 'rejected', 'no_reply'] as const) {
      const w = refusalWords({ state: 'FAILED', reason, codes: ['invalid-input-response'] });
      assert.match(w, /your enquiry was not sent/);
      assert.equal(w.includes('invalid-input-response'), false);
    }
  });
});

describe('the enquiry form, end to end', () => {
  const form = (extra: Record<string, string> = {}) => new URLSearchParams({
    name: 'Checked Person', firm: '', email: `checked.${Math.random().toString(36).slice(2, 8)}@example.invalid`, phone: '',
    ptype: 'Care home', message: '', ...extra,
  });
  const post = (body: URLSearchParams) => fetch(`${base}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  const kept = (email: string | null) => made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM website_enquiries WHERE email = ?', [email])?.n ?? 0;
  const lastReceived = () => JSON.parse(made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'WEBSITE_ENQUIRY_RECEIVED' ORDER BY seq DESC LIMIT 1")?.detail ?? '{}') as Record<string, unknown>;
  const lastRefused = () => JSON.parse(made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'WEBSITE_ENQUIRY_REFUSED' ORDER BY seq DESC LIMIT 1")?.detail ?? '{}') as Record<string, unknown>;
  const configure = (secrets: Record<string, string>, fixtures: Record<string, Fixture>, approved: boolean) => {
    const t = fixtureTransport(fixtures);
    made.app.secrets = secretsFromValues(secrets);
    made.app.outside = t;
    if (approved) made.app.turnstilePolicy = APPROVED; else delete made.app.turnstilePolicy;
    return t;
  };

  test('no secret key: kept as before, and the audit line says it was not checked', async () => {
    configure({}, { [KEY]: OK }, true);
    const f = form();
    assert.equal((await post(f)).status, 200);
    assert.equal(kept(f.get('email')), 1);
    assert.equal(lastReceived()['security_check'], 'not_checked:no_secret');
  });

  test('a key but no approval: kept, nothing sent, and the audit line says why', async () => {
    const t = configure({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK }, false);
    const f = form({ 'cf-turnstile-response': ANSWER });
    assert.equal((await post(f)).status, 200);
    assert.equal(kept(f.get('email')), 1);
    assert.equal(t.seen.length, 0);
    assert.equal(lastReceived()['security_check'], 'not_checked:transfer_not_approved');
  });

  test('checked and passed: kept, and the audit line says passed', async () => {
    configure({ TURNSTILE_SECRET_KEY: TEST_SECRET_PASSES }, { [KEY]: OK }, true);
    const f = form({ 'cf-turnstile-response': ANSWER });
    const r = await post(f);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Thank you — that is with us\./);
    assert.equal(kept(f.get('email')), 1);
    assert.equal(lastReceived()['security_check'], 'passed');
  });

  for (const [what, fixtures, answer, reason] of [
    ['rejected by Cloudflare', { [KEY]: NO }, ANSWER, 'rejected'],
    ['sent with no answer (a script that never loaded the page)', { [KEY]: OK }, null, 'no_answer'],
    ['met with no reply from Cloudflare', { [KEY]: DOWN }, ANSWER, 'no_reply'],
  ] as const) {
    test(`${what}: refused with a 400 in plain words, nothing kept, and the refusal audited`, async () => {
      configure({ TURNSTILE_SECRET_KEY: reason === 'rejected' ? TEST_SECRET_FAILS : TEST_SECRET_PASSES }, fixtures, true);
      const f = form(answer === null ? {} : { 'cf-turnstile-response': answer });
      const r = await post(f);
      assert.equal(r.status, 400);
      const body = await r.text();
      assert.match(body, /<h1>Your enquiry was not sent<\/h1>/);
      assert.match(body, /your enquiry was not sent/);
      assert.equal(kept(f.get('email')), 0, 'the enquiry was kept');
      const line = lastRefused();
      assert.deepEqual([line['why'], line['reason']], ['security_check', reason]);
      assert.equal(JSON.stringify(line).includes('example.invalid'), false, 'the refusal names the person');
    });
  }

  test('the home page’s script carries the configured site key, and Cloudflare’s test key without one', async () => {
    configure({ TURNSTILE_SITE_KEY: LIVE_SHAPED_SITE_KEY }, {}, false);
    assert.match(await (await fetch(`${base}/assets/home.js`)).text(), new RegExp(`var SITEKEY='${LIVE_SHAPED_SITE_KEY}';`));
    configure({}, {}, false);
    assert.match(await (await fetch(`${base}/assets/home.js`)).text(), new RegExp(`var SITEKEY='${TURNSTILE_TEST_SITE_KEY}';`));
  });
});
