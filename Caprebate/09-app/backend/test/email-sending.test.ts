/**
 * 30 SEPTEMBER 2026 — EMAIL SENDING SWITCHED ON FOR TESTING (src/stubs/email-provider.ts, src/server.ts).
 *
 * Lakhbir: "swithc on sending emails" — "again remeber this is all a test and not the final version". Every email a
 * request saves to be sent is tried once before the answer finishes. A fake mail server only: nothing leaves the Mac.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createTcp, connect as netConnect, type Server } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { isInventedAddress, withoutNotSentWords, NOT_SENT_WORDS } from '../src/stubs/email.ts';

const T = '2026-09-08T00:00:00.000Z';
const LOGIN_KEYS = { IONOS_SMTP_HOST: 'smtp.ionos.co.uk', IONOS_SMTP_PORT: '465', IONOS_SMTP_USER: 'contact@caprebate.co.uk', IONOS_SMTP_PASSWORD: 'not-a-real-password' };

async function fakeSmtp(): Promise<{ server: Server; port: number; seen: { lines: string[]; data: string[] } }> {
  const seen = { lines: [] as string[], data: [] as string[] };
  const server = createTcp((sock) => {
    let buf = ''; let inData = false; let data: string[] = [];
    sock.write('220 fake.example ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; seen.data.push(data.join('\r\n')); data = []; sock.write('250 2.0.0 queued as FAKE1\r\n'); } else data.push(line); continue; }
        seen.lines.push(line);
        if (/^EHLO/i.test(line)) sock.write('250-fake.example\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN/i.test(line)) sock.write('235 2.7.0 ok\r\n');
        else if (/^(MAIL FROM|RCPT TO)/i.test(line)) sock.write('250 ok\r\n');
        else if (/^DATA/i.test(line)) { inData = true; sock.write('354 go ahead\r\n'); }
        else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('502 no\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  return { server, port: typeof a === 'object' && a !== null ? a.port : 0, seen };
}

let made: Awaited<ReturnType<typeof createApp>>;
let smtp: Awaited<ReturnType<typeof fakeSmtp>>;
let base = '';
before(async () => {
  smtp = await fakeSmtp();
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-es-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash('a-very-long-development-password');
  made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-es-sales', 'es.sales@example.invalid', 'es.sales@example.invalid', 'Sales Person', 'SALES', hash, T, T]);
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    made.app.db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)', [`wt-es-${weekday}`, 'u-es-sales', weekday, 0, 24 * 60]);
  }
});
after(() => { made.close(); smtp.server.close(); });
beforeEach(() => { made.app.secrets = secretsFromValues(LOGIN_KEYS); made.app.smtpConnect = () => netConnect({ host: '127.0.0.1', port: smtp.port }); });

function client() {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text() };
  };
  const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  return { req, post };
}

/** One building, then a telephone call at a chosen time, to `phone`, with the email address the company is given. */
async function bookACall(name: string, email: string) {
  const c = client();
  await c.req('/assessment');
  await c.post('/assessment/buildings', { b0_sector: 'dental' });
  await c.post('/assessment/spend-on', { b0_trigger: 'fit_out' });
  await c.post('/assessment/amounts', { b0_spend: '500000', b0_date: '2023' });
  await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
  await c.post('/assessment/claims', { b0_prior: 'no' });
  await c.post('/assessment/works', { b0_works: 'no' });
  await c.post('/assessment/details', { b0_business: name, b0_entity: 'ltd', b0_line1: '3 Invented Row', b0_town: 'Leicester', b0_postcode: 'LE1 1AA' });
  const fig = (await c.req('/assessment/figure')).body;
  const day = /name="day" value="(\d{4}-\d\d-\d\d)" checked/.exec(fig)![1]!;
  const slot = new RegExp(`name="slot" value="(${day}T[^"]+)"`).exec(fig)?.[1] ?? [...fig.matchAll(/name="slot" value="([^"]+)"/g)].map((m) => m[1]!).find((x) => x !== '')!;
  const dayOf = new Date(slot).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  // A video call is reached by email, so the invitation goes to the address typed.
  return c.post('/assessment/close', { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', channel: 'video', email, day: dayOf, slot, contact_consent: 'on' });
}

describe('email sending, on for testing', () => {
  test('an email saved while answering is sent before the answer finishes: through the mail server, with no "not sent yet" in it', async () => {
    const before = smtp.seen.data.length;
    const sent = await bookACall('Sending Dental One Limited', 'ada.one@invented-client.co.uk');
    assert.equal(sent.status, 200, sent.body.slice(0, 300));
    assert.match(sent.body, /We are emailing you the calendar invitation now\./);
    const row = made.app.db.get<{ sent_at: string | null; last_error: string | null; body: string; transport: string }>(
      "SELECT sent_at, last_error, body, transport FROM outbox WHERE to_email = 'ada.one@invented-client.co.uk'");
    assert.ok(row !== undefined);
    assert.notEqual(row.sent_at, null, `not sent: ${row.last_error ?? ''}`);
    assert.equal(row.transport, 'SMTP');
    assert.equal(row.last_error, null);
    for (const w of NOT_SENT_WORDS) assert.ok(!row.body.includes(w), 'an email that went says it was not sent');
    assert.equal(smtp.seen.data.length, before + 1);
    assert.ok(smtp.seen.lines.includes('RCPT TO:<ada.one@invented-client.co.uk>'));
    // PHASE 160d: with no long dash the subject may be plain ASCII, so it is written as it is, not encoded.
    const lastMail = smtp.seen.data.at(-1) ?? '';
    const encoded = /^Subject: =\?UTF-8\?B\?([^?]+)\?=$/m.exec(lastMail)?.[1];
    const subject = encoded !== undefined ? Buffer.from(encoded, 'base64').toString('utf8') : /^Subject: (.*)$/m.exec(lastMail)?.[1] ?? '';
    assert.match(subject, /^Your video call with Cap Rebate: /);
  });

  test('an invented address (the seed\'s, the tests\') is never sent to, and the row says why', async () => {
    const before = smtp.seen.data.length;
    await bookACall('Sending Dental Two Limited', 'ada.two@example.com');
    const row = made.app.db.get<{ sent_at: string | null; last_error: string | null }>("SELECT sent_at, last_error FROM outbox WHERE to_email = 'ada.two@example.com'");
    assert.deepEqual({ ...row }, { sent_at: null, last_error: 'An invented address, so it was not sent.' });
    assert.equal(smtp.seen.data.length, before);
    for (const a of ['x@example.invalid', 'x@example.com', 'x@sub.example.org', 'x@shop.test', 'x@localhost']) assert.equal(isInventedAddress(a), true, a);
    for (const a of ['x@caprebate.co.uk', 'x@gmail.com', 'x@examples.com']) assert.equal(isInventedAddress(a), false, a);
  });

  test('with no mail login nothing is asked to be sent, nothing leaves, and the page says the invitation is not sent yet', async () => {
    made.app.secrets = secretsFromValues({});
    const before = smtp.seen.data.length;
    const sent = await bookACall('Sending Dental Three Limited', 'ada.three@invented-client.co.uk');
    assert.match(sent.body, /The calendar invitation has not been sent yet\./);
    const row = made.app.db.get<{ sent_at: string | null; send_requested: number; body: string }>("SELECT sent_at, send_requested, body FROM outbox WHERE to_email = 'ada.three@invented-client.co.uk'");
    assert.deepEqual({ sent_at: row?.sent_at, send_requested: row?.send_requested }, { sent_at: null, send_requested: 0 });
    assert.ok(row?.body.includes(NOT_SENT_WORDS[0]!), 'an email left unsent should still say so');
    assert.equal(smtp.seen.data.length, before);
  });

  test('the "not sent" sentences come out cleanly, and nothing else does', () => {
    assert.equal(withoutNotSentWords(`Hello.\n\n${NOT_SENT_WORDS[0]!}`), 'Hello.');
    assert.equal(withoutNotSentWords(`A.\n\n${NOT_SENT_WORDS[1]!}\n\nB.`), 'A.\n\nB.');
    assert.equal(withoutNotSentWords('Nothing to take out.'), 'Nothing to take out.');
  });
});
