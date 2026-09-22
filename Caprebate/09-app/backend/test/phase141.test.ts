/**
 * PHASE 141 — FREE-TYPED EMAIL TO A CLIENT, FROM contactus@caprebate.com. "Back office and portal clean-up, 8 of 11."
 * 21 September 2026.
 *
 *   1 · an Email button on the client page, on a lead card and on a claim page; To is one of the company's contacts,
 *       never a typed address; subject and body typed freely; a template only fills the boxes; files from the company's
 *       folder, only where the client may see them and the original is kept
 *   2 · From and Reply-To "Cap Rebate <contactus@caprebate.com>" on EVERY email, held in one setting (email_sender)
 *   3 · every email on the company's timeline, tagged to its claim; a do-not-contact company refused
 *   4 · EMAIL_SENDING built and switched off: "Saved — emails are not being sent yet"; the SMTP adapter proved against a
 *       fake mail server; a row saved while off is never sent later; do-not-contact asked again at sending
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, connect as netConnect, type Server } from 'node:net';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { NotAuthorised, type Actor } from '../src/authz.ts';
import { currentSender, outboxTransport } from '../src/stubs/email.ts';
import {
  EMAIL_SENDING, EMAIL_PROVIDER_QUESTION, buildMessage, dispatchOutbox, sendingMissing, sendingOn, smtpProvider,
  type EmailSending, type SmtpLogin,
} from '../src/stubs/email-provider.ts';
import * as F from '../src/web/free-email.ts';
import { timelineFor } from '../src/web/timeline.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { receiveFile } from '../src/web/client-files-pages.ts';
import { KEEP_ORIGINALS_QUESTION } from '../src/web/originals.ts';
import { pdfOf } from './document-fixtures.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res>; post(path: string, fields: Record<string, string | string[]>): Promise<Res> };

function makeClient(base: string): Client {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, location: r.headers.get('location'), body: await r.text() };
  };
  return {
    get: (path) => req(path),
    post: (path, fields) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
      return req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: p.toString() });
    },
  };
}

type World = {
  made: Made; close(): void;
  signIn(who: string): Promise<Client>;
  as(role: string): Actor;
  biz: string; claims: string[]; contacts: { id: string; email: string; name: string }[];
  dnc: string; other: string; otherClaim: string; lead: string;
  deps(sending?: EmailSending, login?: SmtpLogin | null): F.EmailDeps;
};

async function boot(opts: { keep?: boolean } = {}): Promise<World> {
  const clock = { now: '2026-09-21T10:00:00.000Z' };
  const made = await createApp(':memory:', {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-141-')), now: () => clock.now,
    ...(opts.keep === true ? { keepOriginals: { enabled: true, retention_days: 30, question: KEEP_ORIGINALS_QUESTION } } : {}),
    sealKey: randomBytes(32),
  });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-141-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), clock.now, clock.now]);
  const biz = db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")?.id ?? '';
  const dnc = db.get<{ id: string }>("SELECT id FROM businesses WHERE client_status = 'DO_NOT_CONTACT'")?.id ?? '';
  const other = db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Elverton%'")?.id ?? '';
  const lead = db.get<{ id: string }>('SELECT id FROM leads WHERE business_id IS NULL LIMIT 1')?.id ?? '';
  assert.ok(biz !== '' && dnc !== '' && other !== '' && lead !== '');
  const byRole = (role: string): string => s.users.find((u) => u.role === role)?.id ?? (role === 'READ_ONLY' ? 'u-141-readonly' : '');
  return {
    made, close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
    as: (role) => ({ id: byRole(role), role, business_id: role === 'CLIENT' ? (db.get<{ business_id: string }>("SELECT business_id FROM users WHERE role = 'CLIENT'")?.business_id ?? null) : null, disabled: false }) as Actor,
    biz, dnc, other, lead,
    claims: db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref', [biz]).map((r) => r.id),
    otherClaim: db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? LIMIT 1', [other])?.id ?? '',
    contacts: db.all<{ id: string; email: string; full_name: string }>("SELECT id, email, full_name FROM contacts WHERE business_id = ? AND email <> '' ORDER BY full_name", [biz])
      .map((c) => ({ id: c.id, email: c.email, name: c.full_name })),
    deps: (sending, login) => ({
      db, audit: made.app.audit, now: made.app.now, newId: randomUUID,
      ...(sending === undefined ? {} : { sending }), ...(login === undefined ? {} : { login }),
    }),
  };
}

const ON: EmailSending = Object.freeze({
  enabled: true, provider: 'SMTP', named_in_privacy_notice: true, named_in_engagement_letter: true, mailbox_and_dns_ready: true,
  question: EMAIL_PROVIDER_QUESTION,
});
const LOGIN: SmtpLogin = Object.freeze({ host: '127.0.0.1', port: 1, user: 'contactus@caprebate.com', password: 'not-a-real-password' });

/** A fake mail server: records the conversation and the message, answers as a real one would. */
async function fakeSmtp(opts: { refuseRcpt?: boolean } = {}): Promise<{ server: Server; port: number; seen: { lines: string[]; data: string[] } }> {
  const seen = { lines: [] as string[], data: [] as string[] };
  const server = createServer((sock) => {
    let buf = '';
    let inData = false;
    let data: string[] = [];
    sock.write('220 fake.example ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') { inData = false; seen.data.push(data.join('\r\n')); data = []; sock.write('250 2.0.0 queued as FAKE1\r\n'); } else data.push(line);
          continue;
        }
        seen.lines.push(line);
        if (/^EHLO/i.test(line)) sock.write('250-fake.example\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH PLAIN/i.test(line)) sock.write('235 2.7.0 ok\r\n');
        else if (/^MAIL FROM/i.test(line)) sock.write('250 ok\r\n');
        else if (/^RCPT TO/i.test(line)) sock.write(opts.refuseRcpt === true ? '550 5.1.1 no such user\r\n' : '250 ok\r\n');
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

const plain = (port: number) => () => netConnect({ host: '127.0.0.1', port });
const noFiles = async (): Promise<null> => null;

/* ================================================================== */

describe('2 · one sender, on every email, held in one setting', () => {
  test('the first sender is Cap Rebate <contactus@caprebate.com>, From and Reply-To, and it is a row, not code', async () => {
    const w = await boot();
    try {
      const s = currentSender(w.made.app.db);
      assert.equal(s.from_header, 'Cap Rebate <contactus@caprebate.com>');
      assert.equal(s.reply_to, 'contactus@caprebate.com');
      assert.throws(() => w.made.app.db.run("UPDATE email_sender SET address = 'x@example.invalid'"), /never edited/);
      assert.throws(() => w.made.app.db.run('DELETE FROM email_sender'), /never deleted/);
    } finally { w.close(); }
  });

  test('EVERY email carries it — a free-typed one, a template merge, a notice — whatever wrote it', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      const c = w.contacts[0];
      assert.ok(c);
      const r = F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: c.id, subject: 'Hello', body: 'A note.' }, []);
      assert.ok(r.ok);
      outboxTransport(db, randomUUID, w.made.app.now).send({ to_email: 'staff@example.invalid', subject: 's', body: 'b', kind: 'NOTIFICATION' });
      const rows = db.all<{ from_header: string | null; reply_to: string | null }>('SELECT from_header, reply_to FROM outbox');
      assert.ok(rows.length >= 2);
      for (const x of rows) {
        assert.equal(x.from_header, 'Cap Rebate <contactus@caprebate.com>');
        assert.equal(x.reply_to, 'contactus@caprebate.com');
      }
    } finally { w.close(); }
  });

  test('Admin changes it on the admin settings screen; the next email uses the new one; Sales cannot change it', async () => {
    const w = await boot();
    try {
      const admin = await w.signIn('admin');
      const page = await admin.get('/staff/admin-settings');
      assert.match(page.body, /id="email-sender"/);
      assert.match(page.body, /Cap Rebate &lt;contactus@caprebate.com&gt;/);
      const r = await admin.post('/staff/admin-settings/email-sender', { display_name: 'Cap Rebate Team', address: 'hello@caprebate.com', reply_to: 'contactus@caprebate.com' });
      assert.equal(r.status, 303);
      assert.equal(currentSender(w.made.app.db).from_header, 'Cap Rebate Team <hello@caprebate.com>');
      assert.equal(w.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_sender')?.n, 2, 'the old sender was not kept');
      const sales = await w.signIn('sales');
      assert.equal((await sales.post('/staff/admin-settings/email-sender', { display_name: 'X', address: 'x@example.invalid' })).status, 403);
      assert.equal(currentSender(w.made.app.db).address, 'hello@caprebate.com');
      assert.throws(() => F.setSender(w.deps(), w.as('SALES'), { display_name: 'X', address: 'x@example.invalid' }), NotAuthorised);
      const bad = F.setSender(w.deps(), w.as('ADMIN'), { display_name: 'X', address: 'not an address' });
      assert.equal(bad.ok, false);
    } finally { w.close(); }
  });
});

describe('1 · the Email button and the form', () => {
  test('Sales and Admin see Email on the client page, a lead card and a claim page; the view-only login does not', async () => {
    const w = await boot();
    try {
      for (const who of ['sales', 'admin']) {
        const c = await w.signIn(who);
        const page = await c.get(`/staff/clients/${w.biz}`);
        assert.equal(page.status, 200);
        assert.ok(page.body.includes(`href="/staff/clients/${w.biz}/email"`), `${who}: no Email button on the client page`);
        const claim = await c.get(`/staff/clients/${w.biz}/claims/${w.claims[0] ?? ''}`);
        assert.ok(claim.body.includes(`/staff/clients/${w.biz}/email?claim=${w.claims[0] ?? ''}`), `${who}: no Email on the claim page`);
        const leads = await c.get('/staff/leads');
        assert.match(leads.body, /href="\/staff\/leads\/[A-Za-z0-9-]+\/email"/, `${who}: no Email on a lead card`);
        assert.doesNotMatch(leads.body, /Coming soon/, `${who}: the old disabled Email button is still there`);
      }
      const ro = await w.signIn('readonly');
      const page = await ro.get(`/staff/clients/${w.biz}`);
      assert.equal(page.status, 200);
      assert.ok(!page.body.includes('/email"'), 'the view-only login was offered Email');
    } finally { w.close(); }
  });

  test('the form: From is shown, To offers only the company’s contacts with an address, and it says emails are not being sent', async () => {
    const w = await boot();
    try {
      const c = await w.signIn('sales');
      const r = await c.get(`/staff/clients/${w.biz}/email`);
      assert.equal(r.status, 200);
      assert.match(r.body, /<h1>Email Dunmarrow/);
      assert.match(r.body, /Cap Rebate &lt;contactus@caprebate.com&gt;/);
      assert.match(r.body, /Emails are not being sent yet/);
      assert.match(r.body, /Save the email/);
      for (const x of w.contacts) assert.ok(r.body.includes(`value="${x.id}"`), 'a contact was not offered');
      assert.doesNotMatch(r.body, /name="to_email"|name="to"|type="email"/, 'there is a box to type an address into');
      // Nothing personal in an address the page links to or posts to.
      for (const m of r.body.matchAll(/(?:href|action)="([^"]+)"/g)) assert.ok(!(m[1] ?? '').includes('@'), `an address carries personal data: ${m[1] ?? ''}`);
    } finally { w.close(); }
  });

  test('saving: 303 back to the form, which says "Saved — emails are not being sent yet"; the row is unsent, tagged, and never requested', async () => {
    const w = await boot();
    try {
      const c = await w.signIn('sales');
      const to = w.contacts[0];
      assert.ok(to);
      const r = await c.post(`/staff/clients/${w.biz}/email`, { contact_id: to.id, claim_id: w.claims[1] ?? '', subject: 'Your survey date', body: 'Dear Sam,\nWe will visit on Tuesday.' });
      assert.equal(r.status, 303);
      assert.equal(r.location, `/staff/clients/${w.biz}/email?done=saved`);
      assert.ok(!(r.location ?? '').includes('@'));
      const back = await c.get(r.location ?? '');
      assert.match(back.body, /Saved — emails are not being sent yet\./);
      assert.match(back.body, /Your survey date/);
      assert.match(back.body, /Saved — not sent/);
      const row = w.made.app.db.get<{ kind: string; to_email: string; claim_id: string; sent_at: string | null; send_requested: number; written_by: string; contact_id: string; body: string }>(
        "SELECT kind, to_email, claim_id, sent_at, send_requested, written_by, contact_id, body FROM outbox WHERE kind = 'FREE_TYPED'");
      assert.ok(row);
      assert.equal(row.to_email, to.email);
      assert.equal(row.claim_id, w.claims[1]);
      assert.equal(row.sent_at, null);
      assert.equal(row.send_requested, 0);
      assert.equal(row.contact_id, to.id);
      assert.equal(row.body, 'Dear Sam,\nWe will visit on Tuesday.');
      const audit = w.made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'EMAIL_WRITTEN'");
      assert.ok(audit);
      assert.ok(!audit.detail.includes('survey date') && !audit.detail.includes('@'), 'the audit line carries what the email said');
    } finally { w.close(); }
  });

  test('To is never a typed address: another company’s contact, a made-up id and a contact with no address are all refused', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-141-other', ?, 'Other Person', 1, 0, ?, 'other@example.invalid')", [w.other, w.made.app.now()]);
      db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-141-noaddr', ?, 'No Address', 1, 0, ?, NULL)", [w.biz, w.made.app.now()]);
      const s = { kind: 'company' as const, id: w.biz };
      for (const contact_id of ['c-141-other', 'made-up', 'c-141-noaddr', '']) {
        const r = F.saveEmail(w.deps(), w.as('SALES'), s, { contact_id, subject: 'x', body: 'y', to_email: 'anyone@example.invalid' }, []);
        assert.equal(r.ok, false, contact_id);
      }
      const form = F.emailForm(w.deps(), w.as('SALES'), s);
      assert.ok(form.not_offered.some((n) => n.name === 'No Address'), 'a contact with no address is not said to be missing');
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'FREE_TYPED'")?.n, 0);
    } finally { w.close(); }
  });

  test('a refusal keeps what was typed; bank details, an invoice and another company’s claim are refused', async () => {
    const w = await boot();
    try {
      const c = await w.signIn('sales');
      const to = w.contacts[0]?.id ?? '';
      const r = await c.post(`/staff/clients/${w.biz}/email`, { contact_id: to, subject: 'Payment', body: 'Please pay to sort code 12-34-56 today.' });
      assert.equal(r.status, 400);
      assert.match(r.body, /Not saved\./);
      assert.match(r.body, /Please pay to sort code 12-34-56 today\./, 'the typed message was lost');
      for (const body of ['Your invoice is attached.', 'We are running due diligence on you.']) {
        assert.equal(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, subject: 'x', body }, []).ok, false, body);
      }
      assert.equal(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, claim_id: w.otherClaim, subject: 'x', body: 'y' }, []).ok, false);
      // And the database holds the claim rule for a caller that skips the store.
      assert.throws(() => w.made.app.db.run(
        "INSERT INTO outbox (id, created_at, to_email, subject, body, kind, business_id, claim_id) VALUES ('o-x', ?, 'a@example.invalid', 's', 'b', 'FREE_TYPED', ?, ?)",
        [w.made.app.now(), w.biz, w.otherClaim]), /own company/);
      assert.equal(w.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'FREE_TYPED'")?.n, 0);
    } finally { w.close(); }
  });

  test('"Start from a template" fills the subject and the message, merged for the claim chosen, and staff can still change them', async () => {
    const w = await boot();
    try {
      const c = await w.signIn('sales');
      const to = w.contacts[0];
      assert.ok(to);
      const r = await c.get(`/staff/clients/${w.biz}/email?template=template-next-step&contact=${to.id}&claim=${w.claims[0] ?? ''}`);
      assert.equal(r.status, 200);
      assert.match(r.body, /Start from a template/);
      const subject = /name="subject"[^>]*value="([^"]*)"/.exec(r.body)?.[1] ?? '';
      assert.ok(subject.length > 0, 'the subject was not filled');
      assert.doesNotMatch(r.body, /\{\{/, 'a merge field was left in the boxes');
      const body = /<textarea[^>]*name="body"[^>]*>([^<]*)<\/textarea>/.exec(r.body)?.[1] ?? '';
      assert.ok(body.includes(to.name.split(' ')[0] ?? '!'), 'the contact’s name was not merged');
    } finally { w.close(); }
  });

  test('who may: Admin and Sales; the view-only login, Accounting, the surveyor and the client are refused, and nothing is written', async () => {
    const w = await boot();
    try {
      for (const who of ['readonly', 'accounting', 'surveying', 'client']) {
        const c = await w.signIn(who);
        assert.notEqual((await c.get(`/staff/clients/${w.biz}/email`)).status, 200, who);
        const p = await c.post(`/staff/clients/${w.biz}/email`, { contact_id: w.contacts[0]?.id ?? '', subject: 'x', body: 'y' });
        assert.notEqual(p.location, `/staff/clients/${w.biz}/email?done=saved`, who);
      }
      for (const role of ['READ_ONLY', 'ACCOUNTING', 'SURVEYING']) {
        assert.throws(() => F.saveEmail(w.deps(), w.as(role), { kind: 'company', id: w.biz }, { contact_id: w.contacts[0]?.id ?? '', subject: 'x', body: 'y' }, []), role);
      }
      assert.equal(w.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'FREE_TYPED'")?.n, 0);
    } finally { w.close(); }
  });
});

describe('3 · on the timeline, and do not contact', () => {
  test('the email is on the company’s timeline with who wrote it and who it went to, tagged to its claim, staff-only while unsent', async () => {
    const w = await boot();
    try {
      const to = w.contacts[0];
      assert.ok(to);
      assert.ok(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to.id, claim_id: w.claims[0] ?? '', subject: 'Timeline check', body: 'x' }, []).ok);
      const t = timelineFor(w.made.app.db, w.as('SALES'), { kind: 'organisation', id: w.biz });
      const e = t.events.find((x) => x.category === 'OUTBOX' && x.what.includes('Timeline check'));
      assert.ok(e, 'the email is not on the timeline');
      assert.match(e.what, new RegExp(`^An email to ${to.name}: “Timeline check” — saved, not sent$`));
      assert.equal(e.audience, 'STAFF_ONLY');
      assert.notEqual(e.scope, 'the company', 'it is not tagged to its claim');
      assert.ok(e.who !== null, 'it does not say who wrote it');
      const onClaim = timelineFor(w.made.app.db, w.as('SALES'), { kind: 'claim', id: w.claims[0] ?? '' });
      assert.ok(onClaim.events.some((x) => x.what.includes('Timeline check') && x.scope === 'this claim'));
    } finally { w.close(); }
  });

  test('a do-not-contact company: the form says so and offers nothing, and a post is refused with nothing written', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-141-dnc', ?, 'Fen Person', 1, 0, ?, 'fen@example.invalid')", [w.dnc, w.made.app.now()]);
      const c = await w.signIn('sales');
      const page = await c.get(`/staff/clients/${w.dnc}/email`);
      assert.equal(page.status, 200);
      assert.match(page.body, /You cannot email this company/);
      assert.doesNotMatch(page.body, /name="subject"/);
      const r = await c.post(`/staff/clients/${w.dnc}/email`, { contact_id: 'c-141-dnc', subject: 'x', body: 'y' });
      assert.equal(r.status, 400);
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'FREE_TYPED'")?.n, 0);
    } finally { w.close(); }
  });

  test('from a lead with no company yet: only a person who agreed to be contacted is offered, and the email is on the lead’s timeline', async () => {
    const w = await boot();
    try {
      const db = w.made.app.db;
      db.run("INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-141-yes', NULL, ?, 'Asked Yes', 1, 0, ?, 'yes@example.invalid')", [w.lead, w.made.app.now()]);
      db.run("INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-141-no', NULL, ?, 'Asked No', 0, 0, ?, 'no@example.invalid')", [w.lead, w.made.app.now()]);
      const f = F.emailForm(w.deps(), w.as('SALES'), { kind: 'lead', id: w.lead });
      assert.deepEqual(f.contacts.map((c) => c.id), ['c-141-yes']);
      assert.ok(f.not_offered.some((n) => n.name === 'Asked No'));
      assert.equal(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'lead', id: w.lead }, { contact_id: 'c-141-no', subject: 'x', body: 'y' }, []).ok, false);
      const c = await w.signIn('sales');
      const r = await c.post(`/staff/leads/${w.lead}/email`, { contact_id: 'c-141-yes', subject: 'About your enquiry', body: 'Hello' });
      assert.equal(r.status, 303);
      const t = timelineFor(db, w.as('SALES'), { kind: 'lead', id: w.lead });
      assert.ok(t.events.some((e) => e.what.includes('About your enquiry')), 'the email is not on the lead’s timeline');
    } finally { w.close(); }
  });
});

describe('1 · files from the company’s folder', () => {
  test('KEEP_ORIGINALS off: nothing can be attached, and the form says why in plain words', async () => {
    const w = await boot();
    try {
      const f = F.emailForm(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz });
      assert.equal(f.attachable.length, 0);
      assert.equal(f.attach_words, 'You cannot attach a file yet. We delete each file once we have read it.');
    } finally { w.close(); }
  });

  test('originals kept: a file the client can see is offered and carried; one the client cannot see is refused', async () => {
    const w = await boot({ keep: true });
    try {
      const deps = { app: w.made.app, store: w.made.store, newId: randomUUID };
      const pdf = new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true }));
      const shown = await receiveFile(deps, w.as('SALES'), { business_id: w.biz, type_code: 'LEASE', logical_document_id: null, request_id: null, claim_id: null, shown_to_client: true }, pdf);
      const hidden = await receiveFile(deps, w.as('SALES'), { business_id: w.biz, type_code: 'LEASE', logical_document_id: null, request_id: null, claim_id: null, shown_to_client: false }, pdf);
      assert.ok(shown.ok && hidden.ok);
      const f = F.emailForm(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz });
      assert.deepEqual(f.attachable.map((a) => a.id), [shown.logical_document_id], 'the wrong files were offered');
      const to = w.contacts[0]?.id ?? '';
      assert.equal(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, subject: 'x', body: 'y' }, [hidden.logical_document_id]).ok, false);
      const r = F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, subject: 'Your lease', body: 'Attached.' }, [shown.logical_document_id]);
      assert.ok(r.ok);
      assert.equal(w.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox_attachments WHERE outbox_id = ?', [r.id])?.n, 1);
    } finally { w.close(); }
  });
});

describe('4 · EMAIL_SENDING — built, and off', () => {
  test('it ships off in all five ways, the case stamp reads it, and each missing thing is said in plain words', () => {
    assert.equal(EMAIL_SENDING.enabled, false);
    // PHASE 142b: Lakhbir chose IONOS on 22 September 2026, so the provider is set; sending stays off.
    assert.equal(EMAIL_SENDING.provider, 'SMTP');
    assert.equal(EMAIL_SENDING.named_in_privacy_notice, false);
    assert.equal(EMAIL_SENDING.named_in_engagement_letter, false);
    assert.equal(EMAIL_SENDING.mailbox_and_dns_ready, false);
    assert.equal(EMAIL_SENDING.question, 'Which email service should send our emails from contactus@caprebate.com?');
    assert.deepEqual(backendSwitchReadings().find((s) => s.switch === 'EMAIL_SENDING'), { switch: 'EMAIL_SENDING', on: false, home: 'src/stubs/email-provider.ts' });
    assert.equal(sendingOn(EMAIL_SENDING, LOGIN), false);
    assert.deepEqual(sendingMissing(EMAIL_SENDING, null), [
      'Name that service in the privacy notice and in the engagement letter.',
      'Set up the contactus@caprebate.com mailbox and its email security records.',
      'Add the email service’s login to the server.',
      'Then switch sending on.',
    ]);
  });

  test('every condition fails closed — one missing, or not known, is off (N4: absent and unsure alike)', () => {
    assert.equal(sendingOn(ON, LOGIN), true);
    assert.equal(sendingOn(ON, null), false, 'no login');
    for (const k of ['enabled', 'named_in_privacy_notice', 'named_in_engagement_letter', 'mailbox_and_dns_ready'] as const) {
      assert.equal(sendingOn({ ...ON, [k]: false }, LOGIN), false, `${k} false`);
      assert.equal(sendingOn({ ...ON, [k]: undefined } as unknown as EmailSending, LOGIN), false, `${k} absent`);
      assert.equal(sendingOn({ ...ON, [k]: 'yes' } as unknown as EmailSending, LOGIN), false, `${k} not a real true`);
    }
    assert.equal(sendingOn({ ...ON, provider: null }, LOGIN), false, 'no provider');
  });

  test('off: dispatching opens no connection and changes nothing', async () => {
    const w = await boot();
    try {
      assert.ok(F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: w.contacts[0]?.id ?? '', subject: 'x', body: 'y' }, []).ok);
      let called = 0;
      const r = await dispatchOutbox({ db: w.made.app.db, now: w.made.app.now }, EMAIL_SENDING, LOGIN,
        { id: 'SPY', deliver: async () => { called++; return { ok: true, ref: 'x' }; } }, noFiles);
      assert.equal(r.state, 'OFF');
      assert.equal(called, 0);
      assert.equal(w.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NOT NULL')?.n, 0);
    } finally { w.close(); }
  });

  test('on: the SMTP adapter sends it From and Reply-To Cap Rebate, to the contact, and the row says sent', async () => {
    const w = await boot();
    const smtp = await fakeSmtp();
    try {
      const to = w.contacts[0];
      assert.ok(to);
      const saved = F.saveEmail(w.deps(ON, LOGIN), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to.id, subject: 'Hello from us — £ and é', body: 'Line one\n.\nLine three' }, []);
      assert.ok(saved.ok && saved.requested);
      const r = await dispatchOutbox({ db: w.made.app.db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(smtp.port)), noFiles);
      assert.deepEqual(r, { state: 'RAN', sent: 1, failed: 0, refused: 0 });
      assert.ok(smtp.seen.lines.includes('MAIL FROM:<contactus@caprebate.com>'));
      assert.ok(smtp.seen.lines.includes(`RCPT TO:<${to.email}>`));
      assert.ok(smtp.seen.lines.some((l) => l.startsWith('AUTH PLAIN ')));
      const msg = smtp.seen.data[0] ?? '';
      assert.match(msg, /^From: Cap Rebate <contactus@caprebate.com>$/m);
      assert.match(msg, /^Reply-To: contactus@caprebate.com$/m);
      assert.match(msg, new RegExp(`^To: ${to.email}$`, 'm'));
      assert.match(msg, /^Subject: =\?UTF-8\?B\?/m, 'a subject beyond plain ASCII was not encoded');
      const row = w.made.app.db.get<{ sent_at: string | null; transport: string; provider_ref: string | null }>('SELECT sent_at, transport, provider_ref FROM outbox WHERE id = ?', [saved.id]);
      assert.ok(row?.sent_at !== null && row?.transport === 'SMTP' && row.provider_ref !== null);
      const t = timelineFor(w.made.app.db, w.as('SALES'), { kind: 'organisation', id: w.biz });
      assert.ok(t.events.some((e) => e.what.includes('Hello from us') && e.what.includes('— sent ')));
    } finally { smtp.server.close(); w.close(); }
  });

  test('a row saved while sending was off is never sent when it goes on; a refusal from the server leaves it unsent with the reason', async () => {
    const w = await boot();
    const refusing = await fakeSmtp({ refuseRcpt: true });
    try {
      const to = w.contacts[0]?.id ?? '';
      const off = F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, subject: 'old', body: 'x' }, []);
      const on = F.saveEmail(w.deps(ON, LOGIN), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: to, subject: 'new', body: 'x' }, []);
      assert.ok(off.ok && on.ok);
      const r = await dispatchOutbox({ db: w.made.app.db, now: w.made.app.now }, ON, LOGIN, smtpProvider(LOGIN, plain(refusing.port)), noFiles);
      assert.deepEqual(r, { state: 'RAN', sent: 0, failed: 1, refused: 0 }, 'the row saved while off was tried');
      const row = w.made.app.db.get<{ sent_at: string | null; last_error: string | null }>('SELECT sent_at, last_error FROM outbox WHERE id = ?', [on.id]);
      assert.equal(row?.sent_at, null);
      assert.match(row?.last_error ?? '', /refused it: 550/);
    } finally { refusing.server.close(); w.close(); }
  });

  test('do not contact is asked again at the moment of sending', async () => {
    const w = await boot();
    try {
      const saved = F.saveEmail(w.deps(ON, LOGIN), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: w.contacts[0]?.id ?? '', subject: 'x', body: 'y' }, []);
      assert.ok(saved.ok);
      w.made.app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [w.biz]);
      let called = 0;
      const r = await dispatchOutbox({ db: w.made.app.db, now: w.made.app.now }, ON, LOGIN,
        { id: 'SPY', deliver: async () => { called++; return { ok: true, ref: 'x' }; } }, noFiles);
      assert.deepEqual(r, { state: 'RAN', sent: 0, failed: 0, refused: 1 });
      assert.equal(called, 0);
    } finally { w.close(); }
  });

  test('what an email said is never edited, a sent email stays sent, and nothing is deleted from the outbox', async () => {
    const w = await boot();
    try {
      const saved = F.saveEmail(w.deps(), w.as('SALES'), { kind: 'company', id: w.biz }, { contact_id: w.contacts[0]?.id ?? '', subject: 'x', body: 'y' }, []);
      assert.ok(saved.ok);
      const db = w.made.app.db;
      assert.throws(() => db.run("UPDATE outbox SET subject = 'changed' WHERE id = ?", [saved.id]), /never edited/);
      assert.throws(() => db.run("UPDATE outbox SET to_email = 'x@example.invalid' WHERE id = ?", [saved.id]), /never edited/);
      db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [w.made.app.now(), saved.id]);
      assert.throws(() => db.run('UPDATE outbox SET sent_at = NULL WHERE id = ?', [saved.id]), /stays sent/);
      assert.throws(() => db.run('DELETE FROM outbox WHERE id = ?', [saved.id]), /never deleted/);
    } finally { w.close(); }
  });

  test('a message cannot carry a smuggled header, and its body is base64 so no line starts with a dot', () => {
    const m = buildMessage({
      from_header: 'Cap Rebate <contactus@caprebate.com>', reply_to: 'contactus@caprebate.com', to: 'a@example.invalid',
      subject: 'Hi\r\nBcc: evil@example.invalid', body: '.\n..', attachments: [], date: new Date('2026-09-21T10:00:00Z'),
    }, 'id@caprebate.com');
    assert.doesNotMatch(m, /^Bcc:/m);
    assert.match(m, /^Subject: Hi Bcc: evil@example.invalid$/m);
    assert.doesNotMatch(m.split('\r\n\r\n').slice(1).join('\n'), /^\./m);
  });
});
