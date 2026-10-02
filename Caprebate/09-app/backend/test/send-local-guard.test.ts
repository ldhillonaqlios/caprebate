/**
 * 2 OCTOBER 2026 — ONLY THE TEST WEBSITE SENDS WHATSAPP MESSAGES AND IONOS EMAILS, as Zoom (src/connectors/place.ts).
 *
 * Lakhbir, asked whether WhatsApp and IONOS sending should get Zoom's guard: "yes for now". A copy on a computer that
 * reads the real key file would otherwise message and email real people. Now it sends only on the deployed test
 * website, or when started with CAPREBATE_LOCAL_WHATSAPP=1 / CAPREBATE_LOCAL_EMAIL=1. A refusal says why in words. A
 * test's recorded answers, or its own mail server, reach nobody, so they are never refused.
 *
 * Nothing here reaches Meta or IONOS: the keys are invented, and no real connection is opened.
 */
import { describe, test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect as netConnect } from 'node:net';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { onTestWebsite, placeRefusal } from '../src/connectors/place.ts';
import { onTestWebsite as zoomOnTestWebsite } from '../src/connectors/zoom.ts';
import { sendWhatsAppText, whatsappMissing, whatsappPlaceRefusal, WHATSAPP_LOCAL_OPT_IN } from '../src/connectors/whatsapp.ts';
import { EMAIL_LOCAL_OPT_IN, EMAIL_SENDING, emailPlaceRefusal, mailWhere, sendingMissing, sendingOn, smtpLoginFromKeyFile, smtpProvider } from '../src/stubs/email-provider.ts';
import { serviceOn } from '../src/web/saved-keys.ts';

const T = '2026-10-02T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const TEST_WEBSITE = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'caprebate-test.vercel.app' };
const WA_KEYS = {
  WHATSAPP_ACCESS_TOKEN: 'invented-token', WHATSAPP_PHONE_NUMBER_ID: '123456789012345', WHATSAPP_APP_SECRET: 'invented-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'invented-verify-word', WHATSAPP_OPENING_TEMPLATE: 'cap_rebate_opening',
};
const APPROVED = { international_transfer_approved: true } as const;
const MAIL_KEYS = { IONOS_SMTP_HOST: 'smtp.ionos.co.uk', IONOS_SMTP_PORT: '465', IONOS_SMTP_USER: 'contact@caprebate.co.uk', IONOS_SMTP_PASSWORD: 'not-a-real-password' };
const WA_WORDS = 'This copy is not the test website, so it does not use WhatsApp. A message from here would reach a real person from our WhatsApp number. To try WhatsApp here on purpose, start it with CAPREBATE_LOCAL_WHATSAPP=1.';
const MAIL_WORDS = 'This copy is not the test website, so it does not use email sending. An email from here would reach a real person from contact@caprebate.co.uk. To try email sending here on purpose, start it with CAPREBATE_LOCAL_EMAIL=1.';

describe('the one rule, shared', () => {
  test('the test website is Vercel’s live or preview deploy; anything else is a copy; only "1" opts in; a connection that reaches nobody is never refused', () => {
    assert.equal(zoomOnTestWebsite, onTestWebsite, 'Zoom asks the same rule');
    const ask = (live: boolean, env: Record<string, string>) => placeRefusal({ live, env, optIn: 'X_OPT', service: 'S', harm: 'H.' });
    assert.equal(ask(true, TEST_WEBSITE), null);
    assert.equal(ask(true, { ...TEST_WEBSITE, VERCEL_ENV: 'preview' }), null);
    assert.equal(ask(true, { ...TEST_WEBSITE, VERCEL_ENV: 'development' }), 'This copy is not the test website, so it does not use S. H. To try S here on purpose, start it with X_OPT=1.');
    assert.notEqual(ask(true, { VERCEL: '1', VERCEL_ENV: 'production' }), null, 'no address: not the test website');
    assert.equal(ask(true, { X_OPT: '1' }), null);
    for (const v of ['yes', 'true', '0', '', ' ']) assert.notEqual(ask(true, { X_OPT: v }), null, `"${v}" opened it`);
    assert.equal(ask(false, {}), null);
  });
});

describe('WhatsApp', () => {
  test('a copy is refused in words; the test website and the opt-in are not; recorded answers never are', () => {
    assert.equal(WHATSAPP_LOCAL_OPT_IN, 'CAPREBATE_LOCAL_WHATSAPP');
    assert.equal(whatsappPlaceRefusal(liveTransport, {}), WA_WORDS);
    assert.equal(whatsappPlaceRefusal(liveTransport, TEST_WEBSITE), null);
    assert.equal(whatsappPlaceRefusal(liveTransport, { CAPREBATE_LOCAL_WHATSAPP: '1' }), null);
    assert.equal(whatsappPlaceRefusal(liveTransport, { CAPREBATE_LOCAL_ZOOM: '1' }), WA_WORDS, 'Zoom’s setting does not open WhatsApp');
    assert.equal(whatsappPlaceRefusal(fixtureTransport({}), {}), null);
    const keys = secretsFromValues(WA_KEYS);
    assert.deepEqual(whatsappMissing(keys, APPROVED, { outside: liveTransport, env: {} }), [WA_WORDS]);
    assert.deepEqual(whatsappMissing(keys, APPROVED, { outside: liveTransport, env: TEST_WEBSITE }), []);
    assert.deepEqual(whatsappMissing(keys, APPROVED), [], 'asked for the keys and the transfer alone');
  });

  test('a copy sends nothing: the message never reaches the line that calls out, and the reason is the words', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-slg-wa-')) });
    try {
      const calls = () => made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'CONNECTOR_CALLED'")!.n;
      const before = calls();
      const d = { audit: made.app.audit, now: made.app.now, transport: liveTransport, secrets: secretsFromValues(WA_KEYS), policy_override: APPROVED, env: {} };
      const r = await sendWhatsAppText(d, '447700900123', 'Hello');
      assert.deepEqual(r, { state: 'NOT_SENT', why: WA_WORDS });
      assert.equal(calls(), before, 'the call was attempted');
      // The Admin keys card says it too.
      made.app.secrets = secretsFromValues(WA_KEYS);
      made.app.whatsappPolicy = APPROVED;
      made.app.outside = liveTransport;
      const card = serviceOn(made.app, 'WHATSAPP');
      assert.equal(card.on, false);
      assert.ok(card.why.includes(WA_WORDS), card.why);
    } finally { made.close(); }
  });
});

describe('IONOS email', () => {
  const login = smtpLoginFromKeyFile(secretsFromValues(MAIL_KEYS));

  test('a copy is refused in words; the test website and the opt-in are not; a test’s own mail server never is', () => {
    assert.equal(EMAIL_LOCAL_OPT_IN, 'CAPREBATE_LOCAL_EMAIL');
    assert.notEqual(login, null);
    assert.equal(emailPlaceRefusal({ live: true, env: {} }), MAIL_WORDS);
    assert.equal(emailPlaceRefusal({ live: true, env: TEST_WEBSITE }), null);
    assert.equal(emailPlaceRefusal({ live: true, env: { CAPREBATE_LOCAL_EMAIL: '1' } }), null);
    assert.equal(emailPlaceRefusal({ live: true, env: { CAPREBATE_LOCAL_WHATSAPP: '1' } }), MAIL_WORDS);
    assert.equal(emailPlaceRefusal({ live: false, env: {} }), null);
    assert.deepEqual(sendingMissing(EMAIL_SENDING, login, { live: true, env: {} }), [MAIL_WORDS]);
    assert.equal(sendingOn(EMAIL_SENDING, login, { live: true, env: TEST_WEBSITE }), true);
    assert.equal(sendingOn(EMAIL_SENDING, login, { live: false, env: {} }), true);
    assert.equal(sendingOn(EMAIL_SENDING, login), true, 'asked without where: the switch and the login alone');
    // An app is live unless it was handed its own mail server.
    assert.deepEqual(mailWhere({}), { live: true });
    assert.deepEqual(mailWhere({ smtpConnect: () => netConnect({ host: '127.0.0.1', port: 9 }) }), { live: false });
  });

  test('the real connection is never opened from a copy: delivery is refused before it, with the words', async () => {
    const opened: string[] = [];
    const p = smtpProvider(login!, undefined, 1000, (c) => { opened.push(c.service); });
    const r = await p.deliver({ from_header: 'Cap Rebate <contact@caprebate.co.uk>', to: 'someone@caprebate.co.uk', subject: 'x', body: 'x' } as Parameters<typeof p.deliver>[0]);
    assert.deepEqual(r, { ok: false, why: MAIL_WORDS });
    assert.deepEqual(opened, [], 'a connection was recorded');
  });

  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let cookie = '';
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-slg-em-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const a = made.server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
    const db = made.app.db;
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-slg-sales', 'slg.sales@example.invalid', 'slg.sales@example.invalid', 'Sales Person', 'SALES', await made.app.hasher.hash(PASSWORD), T, T]);
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-slg', 'Guarded Practice Limited', 'gp', 'SURVEY', T]);
    const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: 'slg.sales@example.invalid', password: PASSWORD }).toString() });
    cookie = r.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
  });
  after(() => made.close());

  test('a copy with the real login saves emails but asks for none to be sent, and the Write an email page says why', async () => {
    made.app.secrets = secretsFromValues(MAIL_KEYS);
    delete made.app.smtpConnect;
    const local = made.app.email.send({ to_email: 'person@caprebate.co.uk', subject: 'A', body: 'B', kind: 'NOTIFICATION' });
    assert.equal(made.app.db.get<{ s: number }>('SELECT send_requested AS s FROM outbox WHERE id = ?', [local.id])!.s, 0);
    const page = await (await fetch(`${base}/staff/clients/b-slg/email`, { headers: { cookie } })).text();
    assert.ok(page.includes('Before emails can go out'), page.slice(0, 500));
    assert.ok(page.includes(MAIL_WORDS), 'the page does not say why');
    assert.ok(page.includes('It will not be sent yet.'));
    // The same app handed its own mail server (as the tests are) asks for it to be sent.
    made.app.smtpConnect = () => netConnect({ host: '127.0.0.1', port: 9 });
    const ok = made.app.email.send({ to_email: 'person@caprebate.co.uk', subject: 'A', body: 'B', kind: 'NOTIFICATION' });
    assert.equal(made.app.db.get<{ s: number }>('SELECT send_requested AS s FROM outbox WHERE id = ?', [ok.id])!.s, 1);
    delete made.app.smtpConnect;
  });
});
