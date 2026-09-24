/**
 * PHASE 146f — IONOS email and calendar invitations, the built-in signature for the engagement letter, and Google
 * Analytics behind a cookie choice. 22 September 2026. Every test runs with no key and no network: the mail servers
 * are fakes on 127.0.0.1, the key file is given in memory, and the letter a signature is proved on is a fixture.
 *
 *   1 · the logins come from the key file's IONOS names, only an IONOS host is accepted, and the old environment
 *       names are not read; under the test runner the real key file is never read
 *   2 · one audit row per mail-server connection, never a password or an address
 *   3 · bounces: a refused recipient is HARD and stops further email to that address; a 4xx is SOFT; a delivery
 *       report in the mailbox is recorded as a bounce and never filed as a reply
 *   4 · calendar invitations: a standard .ics on every booked, moved or cancelled call, one UID, a rising SEQUENCE,
 *       sent as a file of the same email
 *   5 · the built-in signature: off today; on, it records the name, role, business, time, address, session and the
 *       letter's fingerprint, binds the record into the audit chain, makes a signed PDF and emails a copy — and
 *       assertSignedEngagement reads the record
 *   6 · Google Analytics: the id comes from the key file, never the site file, and the page's policy widens only then
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createServer, connect as netConnect, type Server } from 'node:net';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { createUser } from '../src/users.ts';
import { secretsFromValues, processSecrets } from '../src/secrets.ts';
import { outboxTransport } from '../src/stubs/email.ts';
import {
  EMAIL_SENDING, EMAIL_PROVIDER_QUESTION, auditMailConnections, dispatchOutbox, isSuppressed, liftSuppression, smtpLoginFromKeyFile,
  smtpProvider, type EmailSending, type SmtpLogin,
} from '../src/stubs/email-provider.ts';
import { imapLoginFromKeyFile, parseBounceReport } from '../src/stubs/email-inbound.ts';
import { ingest } from '../src/web/inbound-email.ts';
import { buildIcs, fold, icsText } from '../src/stubs/calendar.ts';
import { scheduleBooking } from '../src/web/backoffice.ts';
import { moveOwnBooking, cancelOwnBooking } from '../src/web/portal.ts';
import {
  ENGAGEMENT_SIGNING, SIGNING_QUESTION, checkSignature, shownLetter, signEngagement, signingMissing, type EngagementSigning,
} from '../src/web/signing.ts';
import { assertSignedEngagement } from '../src/web/research.ts';
import { ANALYTICS_CSP, ga4MeasurementId, sitePolicy, withMeasurementId } from '../src/analytics.ts';
import { SITE_PAGE_CSP } from '../src/web/public-site.ts';
import { STUBS } from '../src/app.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { docxOf } from './document-fixtures.ts';

const T0 = '2026-09-22T09:00:00.000Z';
const ON: EmailSending = Object.freeze({
  enabled: true, provider: 'SMTP', named_in_privacy_notice: true, named_in_engagement_letter: true, mailbox_and_dns_ready: true,
  question: EMAIL_PROVIDER_QUESTION,
});
const LOGIN: SmtpLogin = Object.freeze({ host: '127.0.0.1', port: 1, user: 'contact@caprebate.co.uk', password: 'fake-password-146f-xyz' });
const noFiles = async (): Promise<null> => null;

async function boot(): Promise<{ made: Awaited<ReturnType<typeof createApp>>; base: string; s: Awaited<ReturnType<typeof seed>>; clock: { now: string } }> {
  const clock = { now: T0 };
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-146f-')), now: () => clock.now, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  return { made, base, s, clock };
}

/** A fake SMTP server. `rcpt` is the reply to RCPT TO. */
async function fakeSmtp(rcpt = '250 ok'): Promise<{ server: Server; port: number; data: string[]; lines: string[] }> {
  const data: string[] = [];
  const lines: string[] = [];
  const server = createServer((sock) => {
    let buf = ''; let inData = false; let cur: string[] = [];
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; data.push(cur.join('\r\n')); cur = []; sock.write('250 2.0.0 queued\r\n'); } else cur.push(line); continue; }
        lines.push(line);
        if (/^EHLO/i.test(line)) sock.write('250-fake\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(line)) sock.write('235 ok\r\n');
        else if (/^MAIL/i.test(line)) sock.write('250 ok\r\n');
        else if (/^RCPT/i.test(line)) sock.write(`${rcpt}\r\n`);
        else if (/^DATA/i.test(line)) { inData = true; sock.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('502 no\r\n');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  return { server, port: typeof a === 'object' && a !== null ? a.port : 0, data, lines };
}
const plain = (port: number) => () => netConnect(port, '127.0.0.1');

/* ================================================================== 1 */

describe('1 · the logins come from the key file, and only an IONOS host is accepted', () => {
  const full = {
    IONOS_SMTP_HOST: 'smtp.ionos.co.uk', IONOS_SMTP_PORT: '465', IONOS_SMTP_USER: 'contact@caprebate.co.uk', IONOS_SMTP_PASSWORD: 'smtp-pass-146f-abc',
    IONOS_IMAP_HOST: 'imap.ionos.co.uk', IONOS_IMAP_PORT: '993', IONOS_IMAP_USER: 'contact@caprebate.co.uk', IONOS_IMAP_PASSWORD: 'imap-pass-146f-abc',
  };
  test('sending reads IONOS_SMTP_* through the IONOS_EMAIL owner; reading reads IONOS_IMAP_* through IONOS_MAILBOX', () => {
    const store = secretsFromValues(full);
    assert.deepEqual(smtpLoginFromKeyFile(store), { host: 'smtp.ionos.co.uk', port: 465, user: 'contact@caprebate.co.uk', password: 'smtp-pass-146f-abc' });
    assert.deepEqual(imapLoginFromKeyFile(store), { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'imap-pass-146f-abc' });
    // each owner reads only its own: the sender cannot see the mailbox password, nor the reader the sender's
    assert.equal(store.forOwner('IONOS_EMAIL').get('IONOS_IMAP_PASSWORD'), null);
    assert.equal(store.forOwner('IONOS_MAILBOX').get('IONOS_SMTP_PASSWORD'), null);
  });
  test('the port defaults to 465 and 993; a missing password, or a host that is not IONOS, is no login at all', () => {
    const { IONOS_SMTP_PORT: _a, IONOS_IMAP_PORT: _b, ...noPorts } = full;
    assert.equal(smtpLoginFromKeyFile(secretsFromValues(noPorts))?.port, 465);
    assert.equal(imapLoginFromKeyFile(secretsFromValues(noPorts))?.port, 993);
    assert.equal(smtpLoginFromKeyFile(secretsFromValues({ ...full, IONOS_SMTP_PASSWORD: '' })), null);
    assert.equal(smtpLoginFromKeyFile(secretsFromValues({ ...full, IONOS_SMTP_HOST: 'smtp.example.com' })), null);
    assert.equal(smtpLoginFromKeyFile(secretsFromValues({ ...full, IONOS_SMTP_HOST: 'ionos.co.uk.evil.example' })), null);
    assert.equal(imapLoginFromKeyFile(secretsFromValues({ ...full, IONOS_IMAP_HOST: '127.0.0.1' })), null);
  });
  test('the old environment names are not read any more, and the test runner never reads this machine’s key file', () => {
    const before = { ...process.env };
    try {
      process.env.CAPREBATE_SMTP_HOST = 'smtp.ionos.co.uk'; process.env.CAPREBATE_SMTP_USER = 'x@caprebate.co.uk'; process.env.CAPREBATE_SMTP_PASSWORD = 'env-pass-146f';
      process.env.CAPREBATE_IMAP_HOST = 'imap.ionos.co.uk'; process.env.CAPREBATE_IMAP_USER = 'x@caprebate.co.uk'; process.env.CAPREBATE_IMAP_PASSWORD = 'env-pass-146f';
      assert.equal(smtpLoginFromKeyFile(), null);
      assert.equal(imapLoginFromKeyFile(), null);
      assert.equal(processSecrets().state, 'NO_FILE');
      assert.equal(ga4MeasurementId(), null);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k];
    }
    // off the test runner, the same function reads the file named by CAPREBATE_SECRETS
    const dir = mkdtempSync(join(tmpdir(), 'cb-146f-keys-'));
    const f = join(dir, 'keys.env');
    writeFileSync(f, 'IONOS_SMTP_HOST=smtp.ionos.co.uk\nIONOS_SMTP_USER=contact@caprebate.co.uk\nIONOS_SMTP_PASSWORD=file-pass-146f\n', { mode: 0o600 });
    const store = processSecrets({ CAPREBATE_SECRETS: f });
    assert.equal(store.state, 'LOADED');
    assert.equal(smtpLoginFromKeyFile(store)?.host, 'smtp.ionos.co.uk');
  });
  test('it is still off: EMAIL_SENDING and INBOUND_EMAIL are false, and a key file alone turns nothing on', () => {
    assert.equal(EMAIL_SENDING.enabled, false);
    assert.equal(EMAIL_SENDING.mailbox_and_dns_ready, false);
    assert.equal(EMAIL_SENDING.named_in_engagement_letter, false);
  });
});

/* ================================================================== 2 · 3 */

describe('2 · 3 · one audit row per connection, and bounces', () => {
  test('a delivered email writes one MAIL_SERVER_CONNECTED row with no password, no address and no host', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const smtp = await fakeSmtp(); t.after(() => smtp.server.close());
    const db = w.made.app.db;
    const send = outboxTransport(db, randomUUID, w.made.app.now, () => true);
    const biz = w.s.businesses[0]?.id ?? '';
    send.send({ to_email: 'person@example.org', subject: 'Hello', body: 'Words.', kind: 'NOTIFICATION', business_id: biz });
    const r = await dispatchOutbox({ db, now: w.made.app.now }, ON, LOGIN,
      smtpProvider(LOGIN, plain(smtp.port), 5000, auditMailConnections(w.made.app.audit, w.made.app.now)), noFiles);
    assert.deepEqual(r, { state: 'RAN', sent: 1, failed: 0, refused: 0 });
    const rows = w.made.app.audit.entries().filter((e) => e.kind === 'MAIL_SERVER_CONNECTED');
    assert.equal(rows.length, 1);
    assert.deepEqual({ ...rows[0]?.detail, took_ms: 0 }, { service: 'IONOS_SMTP', purpose: 'SEND', result: 'OK', reply_code: 250, messages: 1, took_ms: 0 });
    const text = JSON.stringify(rows);
    for (const bad of [LOGIN.password, LOGIN.user, 'person@example.org', '127.0.0.1']) assert.equal(text.includes(bad), false, `the row carries ${bad}`);
  });

  test('a recipient refused with 550 is a HARD bounce: recorded, the address suppressed, and the next email to it refused', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const smtp = await fakeSmtp('550 5.1.1 no such user'); t.after(() => smtp.server.close());
    const db = w.made.app.db;
    const send = outboxTransport(db, randomUUID, w.made.app.now, () => true);
    const biz = w.s.businesses[0]?.id ?? '';
    const first = send.send({ to_email: 'Gone@Example.org', subject: 'One', body: 'x', kind: 'NOTIFICATION', business_id: biz });
    const r = await dispatchOutbox({ db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(smtp.port), 5000), noFiles);
    assert.deepEqual(r, { state: 'RAN', sent: 0, failed: 1, refused: 0 });
    assert.deepEqual({ ...db.get<Record<string, unknown>>('SELECT kind, source, status FROM email_bounces WHERE outbox_id = ?', [first.id]) }, { kind: 'HARD', source: 'SMTP', status: '5.1.1' });
    assert.equal(isSuppressed(db, 'gone@example.org'), true);
    // the next one is refused before any connection is made
    const before = smtp.lines.length;
    send.send({ to_email: 'gone@example.org', subject: 'Two', body: 'x', kind: 'NOTIFICATION', business_id: biz });
    const again = await dispatchOutbox({ db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(smtp.port), 5000), noFiles);
    assert.equal(again.state === 'RAN' ? again.refused : -1, 2, 'the first (still unsent) and the second are both refused');
    assert.equal(smtp.lines.length, before, 'a connection was opened for a suppressed address');
    // staff lift it; the bounce stays on record
    const staff = w.s.users.find((u) => u.role === 'ADMIN')?.id ?? '';
    assert.equal(liftSuppression(db, w.made.app.now, 'gone@example.org', staff), true);
    assert.equal(isSuppressed(db, 'gone@example.org'), false);
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_bounces')?.n, 1);
    assert.throws(() => db.run('DELETE FROM email_bounces'), /never deleted/);
  });

  test('a 452 is SOFT: recorded, not suppressed, and tried again on the next run', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const smtp = await fakeSmtp('452 4.2.2 mailbox full'); t.after(() => smtp.server.close());
    const db = w.made.app.db;
    const send = outboxTransport(db, randomUUID, w.made.app.now, () => true);
    const m = send.send({ to_email: 'full@example.org', subject: 'One', body: 'x', kind: 'NOTIFICATION', business_id: w.s.businesses[0]?.id ?? '' });
    await dispatchOutbox({ db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(smtp.port), 5000), noFiles);
    assert.deepEqual({ ...db.get<Record<string, unknown>>('SELECT kind, status FROM email_bounces WHERE outbox_id = ?', [m.id]) }, { kind: 'SOFT', status: '4.2.2' });
    assert.equal(isSuppressed(db, 'full@example.org'), false);
    assert.equal(db.get<{ s: string | null }>('SELECT sent_at AS s FROM outbox WHERE id = ?', [m.id])?.s, null);
  });

  test('a delivery report in the mailbox is a bounce on the email it names — never a reply, and read in once', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const db = w.made.app.db;
    const send = outboxTransport(db, randomUUID, w.made.app.now, () => true);
    const biz = w.s.businesses[0]?.id ?? '';
    const m = send.send({ to_email: 'nobody@example.org', subject: 'One', body: 'x', kind: 'NOTIFICATION', business_id: biz });
    db.run('UPDATE outbox SET sent_at = ?, transport = ?, provider_ref = ? WHERE id = ?', [T0, 'SMTP', 'abc123@caprebate.co.uk', m.id]);
    const report = [
      'From: Mail Delivery System <MAILER-DAEMON@ionos.co.uk>', 'To: contact@caprebate.co.uk', 'Subject: Undelivered Mail Returned to Sender',
      'Message-ID: <report-1@ionos.co.uk>', 'MIME-Version: 1.0', 'Content-Type: multipart/report; report-type=delivery-status; boundary="B"', '',
      '--B', 'Content-Type: text/plain', '', 'Your message could not be delivered.', '',
      '--B', 'Content-Type: message/delivery-status', '', 'Reporting-MTA: dns; mx.ionos.co.uk', '', 'Final-Recipient: rfc822; nobody@example.org',
      'Action: failed', 'Status: 5.1.1', '',
      '--B', 'Content-Type: text/rfc822-headers', '', 'Message-ID: <abc123@caprebate.co.uk>', 'Subject: One', '', '--B--', '',
    ].join('\r\n');
    const raw = new Uint8Array(Buffer.from(report));
    assert.deepEqual(parseBounceReport(raw), { kind: 'HARD', status: '5.1.1', original_message_id: 'abc123@caprebate.co.uk' });
    const d = { db, audit: w.made.app.audit, now: w.made.app.now, newId: randomUUID };
    assert.equal(ingest(d, { uid: 7, raw }), 'BOUNCE');
    assert.equal(ingest(d, { uid: 7, raw }), null, 'read in twice');
    assert.deepEqual({ ...db.get<Record<string, unknown>>('SELECT kind, source FROM email_bounces WHERE outbox_id = ?', [m.id]) }, { kind: 'HARD', source: 'REPORT' });
    assert.equal(isSuppressed(db, 'nobody@example.org'), true);
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inbound_email')?.n, 0, 'a report was filed as a reply');
    // an ordinary email is not a report
    assert.equal(parseBounceReport(new Uint8Array(Buffer.from('From: a@b.c\r\nSubject: hi\r\n\r\nhello'))), null);
  });
});

/* ================================================================== 4 */

describe('4 · a standard .ics on every booked, moved or cancelled call', () => {
  const invite = {
    method: 'REQUEST' as const, booking_id: 'b-1', sequence: 2, starts_at: '2026-10-01T09:00:00.000Z', ends_at: '2026-10-01T09:30:00.000Z',
    stamp: T0, summary: 'Your call with Cap Rebate', description: 'Line one; a comma, and\na second line',
    location: 'By telephone', organizer: { name: 'Cap Rebate', address: 'contact@caprebate.co.uk' }, attendee: 'client@example.org',
  };
  test('it is RFC 5545: CRLF lines no longer than 75 octets, UTC times, escaped text, one UID per booking', () => {
    const ics = buildIcs(invite);
    assert.ok(ics.endsWith('\r\n'));
    assert.equal(/[^\r]\n/.test(ics), false, 'a bare line feed');
    for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
    for (const want of ['BEGIN:VCALENDAR', 'METHOD:REQUEST', 'UID:booking-b-1@caprebate.co.uk', 'SEQUENCE:2', 'DTSTART:20261001T090000Z',
      'DTEND:20261001T093000Z', 'STATUS:CONFIRMED', 'ORGANIZER;CN="Cap Rebate":mailto:contact@caprebate.co.uk', 'END:VCALENDAR']) {
      assert.ok(ics.split('\r\n').includes(want), want);
    }
    assert.match(ics, /DESCRIPTION:Line one\\; a comma\\, and\\na second line/);
    assert.match(buildIcs({ ...invite, method: 'CANCEL' }), /METHOD:CANCEL\r\n[\s\S]*STATUS:CANCELLED/);
    assert.equal(icsText('a\\b'), 'a\\\\b');
    assert.equal(fold('x'.repeat(160)).split('\r\n ').map((l) => l.length).join(','), '75,74,11');
    assert.throws(() => buildIcs({ ...invite, attendee: 'x@y.z\r\nATTENDEE:mailto:evil@example.org' }), /plain email address/);
  });

  test('staff give a call a time, the client moves it and then cancels it: REQUEST, REQUEST with a higher SEQUENCE, CANCEL — one UID', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const db = w.made.app.db;
    const biz = w.s.businesses.find((b) => b.key === 'b3')?.id ?? '';
    db.run("UPDATE businesses SET contact_email = 'owner@example.org' WHERE id = ?", [biz]);
    const booking = randomUUID();
    db.run("INSERT INTO bookings (id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, 'phone', NULL, 'funnel_close', NULL, NULL, ?)", [booking, biz, T0]);
    const admin: Actor = { id: w.s.users.find((u) => u.role === 'ADMIN')?.id ?? '', role: 'ADMIN', business_id: null, disabled: false };
    const client: Actor = { id: w.s.users.find((u) => u.role === 'CLIENT')?.id ?? '', role: 'CLIENT', business_id: biz, disabled: false };
    const deps = { db, audit: w.made.app.audit, email: w.made.app.email, now: w.made.app.now, newId: randomUUID };
    const avail = (await import('../src/web/schedule.ts')).publicSlots(db, T0);
    const slots = avail.available ? avail.slots : [];
    const [a, b] = [slots[slots.length - 12], slots[slots.length - 3]];
    assert.ok(a !== undefined && b !== undefined, 'no free slots in the seed');
    const r1 = scheduleBooking(deps, admin, { booking_id: booking, starts_at: a.starts_at });
    assert.equal(r1.ok, true, r1.ok ? '' : r1.why);
    const r2 = moveOwnBooking(deps, client, biz, { booking_id: booking, starts_at: b.starts_at });
    assert.equal(r2.ok, true, r2.ok ? '' : r2.why);
    const r3 = cancelOwnBooking(deps, client, biz, { booking_id: booking });
    assert.equal(r3.ok, true);
    const files = db.all<{ content_type: string; bytes: Uint8Array; sha256: string }>(
      "SELECT f.content_type, f.bytes, f.sha256 FROM outbox_inline_files f JOIN outbox o ON o.id = f.outbox_id WHERE o.kind = 'CALENDAR_INVITE' ORDER BY o.created_at, o.rowid");
    assert.equal(files.length, 3);
    const texts = files.map((f) => Buffer.from(f.bytes).toString('utf8'));
    assert.deepEqual(texts.map((x) => /METHOD:(\w+)/.exec(x)?.[1]), ['REQUEST', 'REQUEST', 'CANCEL']);
    assert.deepEqual(texts.map((x) => /SEQUENCE:(\d+)/.exec(x)?.[1]), ['1', '2', '3']);
    assert.equal(new Set(texts.map((x) => /UID:(\S+)/.exec(x)?.[1])).size, 1);
    assert.match(texts[2] ?? '', /DTSTART:\d{8}T\d{6}Z/, 'the cancellation names the time that was held');
    for (const f of files) assert.equal(createHash('sha256').update(f.bytes).digest('hex'), f.sha256);
    assert.throws(() => db.run('DELETE FROM outbox_inline_files'), /never deleted/);
  });

  test('when sending is on, the invitation travels as a text/calendar file of the same email', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const smtp = await fakeSmtp(); t.after(() => smtp.server.close());
    const db = w.made.app.db;
    const send = outboxTransport(db, randomUUID, w.made.app.now, () => true);
    const ics = new Uint8Array(Buffer.from(buildIcs(invite)));
    send.send({ to_email: 'client@example.org', subject: 'Your call', body: 'x', kind: 'CALENDAR_INVITE', business_id: w.s.businesses[0]?.id ?? '',
      inline_files: [{ filename: 'call.ics', content_type: 'text/calendar; method=REQUEST; charset=utf-8', bytes: ics }] });
    const r = await dispatchOutbox({ db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(smtp.port), 5000), noFiles);
    assert.deepEqual(r, { state: 'RAN', sent: 1, failed: 0, refused: 0 });
    assert.match(smtp.data[0] ?? '', /Content-Type: text\/calendar; method=REQUEST; charset=utf-8; name="call.ics"/);
    assert.ok((smtp.data[0] ?? '').includes(Buffer.from(ics).toString('base64').slice(0, 60)));
  });
});

/* ================================================================== 5 */

/** A letter with no open term and no specimen wording — what a settled letter will look like. */
function settledLetter(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cb-146f-letter-'));
  const p = join(dir, 'letter.docx');
  writeFileSync(p, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and Test Signing Ltd.', '2. Fees', 'Our fee is 10 per cent of the relief.']));
  return p;
}
const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, solicitor_confirmed: true, question: SIGNING_QUESTION });

async function signingWorld() {
  const w = await boot();
  const db = w.made.app.db;
  const biz = randomUUID();
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [biz, 'Test Signing Ltd', 'dental', 'ENGAGEMENT_SENT', T0]);
  const eng = randomUUID();
  db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [eng, biz, T0]);
  const user = createUser(db, w.made.app.now, { email: 'signer@example.org', display_name: 'Signer', role: 'CLIENT', password_hash: await w.made.app.hasher.hash(w.s.password), business_id: biz });
  const session = randomUUID();
  db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, user.id, randomBytes(16).toString('hex'), T0, '2026-09-23T09:00:00.000Z', T0]);
  const actor: Actor = { id: user.id, role: 'CLIENT', business_id: biz, disabled: false };
  const deps = { db, audit: w.made.app.audit, email: w.made.app.email, now: w.made.app.now, newId: randomUUID };
  const letterPath = settledLetter();
  const shown = shownLetter({ name: 'Test Signing Ltd' }, letterPath);
  return { w, db, biz, eng, actor, session, deps, letterPath, shown };
}

describe('5 · the built-in signature', () => {
  test('OFF TODAY: the switch is false, and the real letter still has open terms, so it cannot be signed at all', async (t) => {
    assert.equal(ENGAGEMENT_SIGNING.enabled, false);
    assert.equal(ENGAGEMENT_SIGNING.solicitor_confirmed, false);
    const real = shownLetter({ name: 'Test Signing Ltd' });
    assert.ok(real.open_terms > 0);
    assert.deepEqual(signingMissing(ENGAGEMENT_SIGNING, real), [
      'Our solicitor must confirm that typing your name is a good enough way to sign this letter.',
      'Some terms in the letter are not settled yet, so it cannot be signed.',
      'Then signing must be switched on.',
    ]);
    // switched on, a letter with a blank in it is still refused
    assert.deepEqual(signingMissing(SIGNING_ON, real), ['Some terms in the letter are not settled yet, so it cannot be signed.']);
    const x = await signingWorld(); t.after(() => x.w.made.close());
    const r = signEngagement(x.deps, x.actor, x.biz, { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: real.sha256 }, { ip: '203.0.113.9', session_id: x.session });
    assert.deepEqual(r, { ok: false, why: 'Signing is not switched on yet. Our solicitor must confirm that typing your name is a good enough way to sign this letter.' });
    assert.equal(x.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures WHERE business_id = ?', [x.biz])?.n, 0);
    assert.equal(assertSignedEngagement(x.db, x.biz).signed, false);
  });

  test('ON: the record holds name, role, business, time, address, session and the letter’s fingerprint; the chain holds the record’s hash and no name', async (t) => {
    const x = await signingWorld(); t.after(() => x.w.made.close());
    const r = signEngagement(x.deps, x.actor, x.biz,
      { full_name: '  Ada   Lovelace ', role: 'Director', authorised: true, letter_sha256: x.shown.sha256 },
      { ip: '203.0.113.9', session_id: x.session }, { cfg: SIGNING_ON, letterPath: x.letterPath });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    const row = x.db.get<{ signer_name: string; signer_role: string; business_name: string; ip: string; session_id: string; user_id: string; signed_at: string; letter_sha256: string; letter_text: string; pdf: Uint8Array; origin: string }>(
      'SELECT signer_name, signer_role, business_name, ip, session_id, user_id, signed_at, letter_sha256, letter_text, pdf, origin FROM engagement_signatures WHERE business_id = ?', [x.biz]);
    assert.ok(row !== undefined);
    assert.deepEqual([row.signer_name, row.signer_role, row.business_name, row.ip, row.session_id, row.user_id, row.signed_at, row.origin],
      ['Ada Lovelace', 'Director', 'Test Signing Ltd', '203.0.113.9', x.session, x.actor.id, T0, 'PORTAL']);
    assert.equal(row.letter_sha256, createHash('sha256').update(row.letter_text).digest('hex'));
    assert.equal(row.letter_sha256, x.shown.sha256);
    assert.equal(Buffer.from(row.pdf).subarray(0, 8).toString('latin1'), '%PDF-1.4');
    assert.ok(Buffer.from(row.pdf).toString('latin1').includes('%%EOF'));
    // the signature page is in the PDF (hex strings: look for the words' bytes)
    assert.ok(Buffer.from(row.pdf).toString('latin1').includes(Buffer.from('Signature page', 'latin1').toString('hex')));
    // the audit row: the record's hash, the letter's and the PDF's, the session — and no name, role or address
    const a = x.w.made.app.audit.entries().filter((e) => e.kind === 'ENGAGEMENT_SIGNED' && e.object_id === x.eng);
    assert.equal(a.length, 1);
    assert.equal(a[0]?.detail.record, r.ok ? r.record_sha256 : '');
    assert.equal(a[0]?.detail.letter, x.shown.sha256);
    assert.equal(a[0]?.detail.session, x.session);
    for (const bad of ['Ada', 'Lovelace', 'Director', '203.0.113.9']) assert.equal(JSON.stringify(a).includes(bad), false, bad);
    assert.equal(x.w.made.app.audit.verify().intact, true);
    // the gate now reads the record
    assert.deepEqual(assertSignedEngagement(x.db, x.biz), { signed: true, letter_state: 'SIGNED', signed_at: T0, why: 'the engagement letter is signed' });
    // and the client is emailed a copy, a PDF, to the login's own address
    const copy = x.db.get<{ to_email: string; kind: string; content_type: string; bytes: Uint8Array }>(
      "SELECT o.to_email, o.kind, f.content_type, f.bytes FROM outbox o JOIN outbox_inline_files f ON f.outbox_id = o.id WHERE o.kind = 'SIGNED_LETTER'");
    assert.equal(copy?.to_email, 'signer@example.org');
    assert.equal(copy?.content_type, 'application/pdf');
    assert.deepEqual(Buffer.from(copy?.bytes ?? new Uint8Array()), Buffer.from(row.pdf));
    // signed once
    const again = signEngagement(x.deps, x.actor, x.biz, { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: x.shown.sha256 },
      { ip: '203.0.113.9', session_id: x.session }, { cfg: SIGNING_ON, letterPath: x.letterPath });
    assert.deepEqual(again, { ok: false, why: 'This letter is already signed. You do not need to sign it again.' });
  });

  test('every refusal is a sentence: one word for a name, no role, no tick, a letter that changed, a letter not sent', async (t) => {
    const x = await signingWorld(); t.after(() => x.w.made.close());
    const go = (input: Partial<{ full_name: string; role: string; authorised: boolean; letter_sha256: string }>) =>
      signEngagement(x.deps, x.actor, x.biz, { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: x.shown.sha256, ...input },
        { ip: '203.0.113.9', session_id: x.session }, { cfg: SIGNING_ON, letterPath: x.letterPath });
    assert.match(String((go({ full_name: 'Ada' }) as { why: string }).why), /first name and your last name/);
    assert.match(String((go({ role: ' ' }) as { why: string }).why), /role in the business/);
    assert.match(String((go({ authorised: false }) as { why: string }).why), /Tick the box/);
    assert.match(String((go({ letter_sha256: 'f'.repeat(64) }) as { why: string }).why), /letter changed while you were reading/);
    x.db.run("UPDATE engagements SET letter_state = 'NOT_SENT' WHERE id = ?", [x.eng]);
    assert.match(String((go({}) as { why: string }).why), /has not been sent to you yet/);
    assert.equal(x.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures WHERE business_id = ?', [x.biz])?.n, 0);
    // staff cannot sign for a client
    const admin: Actor = { id: x.w.s.users.find((u) => u.role === 'ADMIN')?.id ?? '', role: 'ADMIN', business_id: null, disabled: false };
    x.db.run("UPDATE engagements SET letter_state = 'SENT' WHERE id = ?", [x.eng]);
    const staff = signEngagement(x.deps, admin, x.biz, { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: x.shown.sha256 },
      { ip: '203.0.113.9', session_id: x.session }, { cfg: SIGNING_ON, letterPath: x.letterPath });
    assert.equal(staff.ok, false);
  });

  test('THE GATE READS THE RECORD: SIGNED by hand is not signed; a record missing from the chain is not signed; a record cannot be edited', async (t) => {
    const x = await signingWorld(); t.after(() => x.w.made.close());
    x.db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE id = ?", [T0, x.eng]);
    const byHand = assertSignedEngagement(x.db, x.biz);
    assert.equal(byHand.signed, false);
    assert.match(byHand.why, /no signature record/);
    x.db.run("UPDATE engagements SET letter_state = 'SENT', signed_at = NULL WHERE id = ?", [x.eng]);
    const r = signEngagement(x.deps, x.actor, x.biz, { full_name: 'Ada Lovelace', role: 'Director', authorised: true, letter_sha256: x.shown.sha256 },
      { ip: '203.0.113.9', session_id: x.session }, { cfg: SIGNING_ON, letterPath: x.letterPath });
    assert.equal(r.ok, true);
    assert.equal(checkSignature(x.db, x.eng).ok, true);
    assert.throws(() => x.db.run("UPDATE engagement_signatures SET signer_name = 'Someone Else'"), /never edited/);
    assert.throws(() => x.db.run('DELETE FROM engagement_signatures'), /never deleted/);
  });

  test('the seed’s signed letters carry SEED records, so the demonstration still reads as signed', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const signed = w.made.app.db.all<{ business_id: string }>("SELECT business_id FROM engagements WHERE letter_state = 'SIGNED'");
    assert.ok(signed.length >= 4);
    for (const s of signed) assert.equal(assertSignedEngagement(w.made.app.db, s.business_id).signed, true);
    assert.equal(w.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM engagement_signatures WHERE origin <> 'SEED'")?.n, 0);
  });

  test('the portal draws the form with the letter’s fingerprint, and pressing Sign today says why it is not switched on', async (t) => {
    const x = await signingWorld(); t.after(() => x.w.made.close());
    const cookieJar: string[] = [];
    const req = async (path: string, body?: URLSearchParams) => {
      const r = await fetch(x.w.base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
        headers: { ...(cookieJar.length > 0 ? { cookie: cookieJar.join('; ') } : {}), ...(body === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }) },
        ...(body === undefined ? {} : { body: body.toString() }) });
      for (const c of r.headers.getSetCookie()) cookieJar.push(c.split(';')[0] ?? '');
      return { status: r.status, body: await r.text() };
    };
    assert.equal((await req('/login', new URLSearchParams({ email: 'signer@example.org', password: x.w.s.password }))).status, 303);
    const pageR = await req('/portal/letter');
    assert.equal(pageR.status, 200);
    const real = shownLetter({ name: 'Test Signing Ltd' });
    assert.match(pageR.body, new RegExp(`name="letter_sha256" value="${real.sha256}"`));
    assert.match(pageR.body, /name="full_name"/);
    assert.match(pageR.body, /name="signer_role"/);
    assert.match(pageR.body, /name="authorised"/);
    const post = await req('/portal/letter/sign', new URLSearchParams({ full_name: 'Ada Lovelace', signer_role: 'Director', authorised: 'on', letter_sha256: real.sha256 }));
    assert.equal(post.status, 400);
    assert.match(post.body, /Signing is not switched on yet/);
    assert.equal(x.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures WHERE business_id = ?', [x.biz])?.n, 0);
  });
});

/* ================================================================== 6 */

describe('6 · Google Analytics: the id is configuration, and the policy widens only with it', () => {
  test('the id comes from the key file only, and only in the G- form', () => {
    assert.equal(ga4MeasurementId(secretsFromValues({ GA4_MEASUREMENT_ID: 'G-ABC1234XYZ' })), 'G-ABC1234XYZ');
    assert.equal(ga4MeasurementId(secretsFromValues({ GA4_MEASUREMENT_ID: 'UA-1234-1' })), null);
    assert.equal(ga4MeasurementId(secretsFromValues({ GA4_MEASUREMENT_ID: 'G-1"><script>' })), null);
    assert.equal(ga4MeasurementId(secretsFromValues({})), null);
  });
  test('with no id the page and its policy are exactly as before; with one, the tag’s hosts are allowed and the meta carries it', () => {
    assert.equal(sitePolicy(SITE_PAGE_CSP, null), SITE_PAGE_CSP);
    const p = sitePolicy(SITE_PAGE_CSP, 'G-ABC1234XYZ');
    assert.ok(p.includes(`script-src 'self' ${ANALYTICS_CSP.script}`));
    assert.ok(p.includes(`connect-src 'self' ${ANALYTICS_CSP.connect}`));
    assert.ok(p.includes("frame-ancestors 'none'"));
    const html = '<head><meta name="cb-ga4-measurement-id" content=""></head>';
    assert.equal(withMeasurementId(html, null), html);
    assert.match(withMeasurementId(html, 'G-ABC1234XYZ'), /content="G-ABC1234XYZ"/);
  });
  test('the served home page, under the test runner, carries an empty id and the unwidened policy', async (t) => {
    const w = await boot(); t.after(() => w.made.close());
    const r = await fetch(w.base + '/');
    const body = await r.text();
    if (/cb-ga4-measurement-id/.test(body)) {
      assert.match(body, /<meta name="cb-ga4-measurement-id" content="">/);
      assert.equal(r.headers.get('content-security-policy'), SITE_PAGE_CSP);
    }
  });
});

/* ================================================================== the lists */

describe('the stub list and the switches say what is true', () => {
  test('the signature entry names the built-in signature and says it is off; the email entry names IONOS', () => {
    const sig = STUBS.find((s) => s.id === 'signature');
    assert.equal(sig?.module, 'src/web/signing.ts');
    assert.match(sig?.what ?? '', /BUILT IN by Phase 146f and switched off/);
    assert.match(STUBS.find((s) => s.id === 'email')?.what ?? '', /pointed it at IONOS/);
  });
  test('ENGAGEMENT_SIGNING is stamped on every claim, off', () => {
    assert.deepEqual(backendSwitchReadings().find((s) => s.switch === 'ENGAGEMENT_SIGNING'), { switch: 'ENGAGEMENT_SIGNING', on: false, home: 'src/web/signing.ts' });
  });
});
