/**
 * PHASE 142 — CHAT ON EVERY CLIENT: A TEAM-ONLY THREAD AND A THREAD WITH THE CLIENT. "Back office and portal clean-up,
 * 9 of 11." 22 September 2026.
 *
 *   1 · two tabs on the client page, "Team only" (the internal notes, as a conversation) and "With the client"; a message
 *       may be tagged to a claim; the notes are the team thread's messages, with their dates and authors
 *   2 · the portal's Messages: the client reads and writes, and sends a file — which goes through the upload path, lands in
 *       Files under "From the client", and links back to its message
 *   3 · THE TEAM THREAD IS UNREACHABLE FROM THE PORTAL: a client asking for a team message by id gets 404, and no portal
 *       response body carries a team message's words — searched on the wire, as tools/payload-proof.ts searches
 *   4 · unread numbers on the tabs and in the portal; a client waiting over one working day on Home's Today and overdue
 *   5 · every message audited, never with its words; nothing edited, nothing deleted; the surveyor sees neither thread
 *   6 · INBOUND_EMAIL built and off: a reply matched by our Message-ID and a contact's address is filed; anything else is
 *       queued; a do-not-contact company's reply is recorded and nothing is sent; the IMAP reader proved read-only
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, connect as netConnect, type Server } from 'node:net';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { can, type Actor } from '../src/authz.ts';
import * as M from '../src/web/messages.ts';
import * as IE from '../src/web/inbound-email.ts';
import { INBOUND_EMAIL, imapMailbox, parseEmail, readingMissing, type InboundEmail, type Mailbox } from '../src/stubs/email-inbound.ts';
import { addNote } from '../src/web/engaged.ts';
import { timelineFor } from '../src/web/timeline.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';
import { pdfOf } from './document-fixtures.ts';
import { shownToClient } from '../src/web/documents.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = {
  get(path: string): Promise<Res>;
  post(path: string, fields: Record<string, string>): Promise<Res>;
  upload(path: string, fields: Record<string, string>, file: Uint8Array | null): Promise<Res>;
};

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
    post: (path, fields) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
    upload(path, fields, file) {
      const b = `----cb142${randomBytes(8).toString('hex')}`;
      const parts: Buffer[] = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
      // A browser sends the file box even when it is empty: a part with no name and no bytes.
      parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file === null ? '' : 'jones-lease.pdf'}"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'));
      if (file !== null) parts.push(Buffer.from(file));
      parts.push(Buffer.from('\r\n'), Buffer.from(`--${b}--\r\n`));
      return req(path, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body: Buffer.concat(parts) });
    },
  };
}

const PDF = (): Uint8Array => new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true }));

type World = {
  made: Made; close(): void; clock: { now: string };
  signIn(who: string): Promise<Client>;
  as(role: string): Actor;
  client: Actor; corvale: string; dunmarrow: string; dunClaim: string;
  contacts: { id: string; email: string }[];
  deps(): M.MessageDeps;
};

async function boot(): Promise<World> {
  const clock = { now: '2026-09-21T10:00:00.000Z' };
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-142-')), now: () => clock.now, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-142-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), clock.now, clock.now]);
  const byRole = (role: string): string => s.users.find((u) => u.role === role)?.id ?? (role === 'READ_ONLY' ? 'u-142-readonly' : '');
  const clientRow = db.get<{ id: string; business_id: string }>("SELECT id, business_id FROM users WHERE role = 'CLIENT'");
  assert.ok(clientRow);
  const dunmarrow = db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")?.id ?? '';
  return {
    made, close: made.close, clock,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
    as: (role) => ({ id: byRole(role), role, business_id: role === 'CLIENT' ? clientRow.business_id : null, disabled: false }) as Actor,
    client: { id: clientRow.id, role: 'CLIENT', business_id: clientRow.business_id, disabled: false } as Actor,
    corvale: clientRow.business_id, dunmarrow,
    dunClaim: db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY claim_ref LIMIT 1', [dunmarrow])?.id ?? '',
    contacts: db.all<{ id: string; email: string }>("SELECT id, email FROM contacts WHERE business_id = ? AND email <> '' ORDER BY full_name", [dunmarrow]),
    deps: () => ({ db, audit: made.app.audit, now: made.app.now, newId: randomUUID }),
  };
}

/* ================================================================== *
 * 1 · THE TWO THREADS, AND WHO REACHES THEM
 * ================================================================== */

describe('two threads per company, and the rule table', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('the client thread is Admin, Sales and the client on its own company — never the surveyor, Accounting or view-only', () => {
    const own = { type: 'client_message' as const, id: w.corvale, business_id: w.corvale };
    const other = { type: 'client_message' as const, id: w.dunmarrow, business_id: w.dunmarrow };
    for (const action of ['client_message.read', 'client_message.write']) {
      assert.equal(can(w.as('ADMIN'), action, own), true, action);
      assert.equal(can(w.as('SALES'), action, own), true, action);
      assert.equal(can(w.client, action, own), true, action);
      assert.equal(can(w.client, action, other), false, `${action}: a client reached another company's thread`);
      for (const role of ['SURVEYING', 'ACCOUNTING', 'READ_ONLY']) assert.equal(can(w.as(role), action, own), false, `${role} ${action}`);
    }
    // The team thread is the internal notes: the client and the surveyor are on neither row.
    const note = { type: 'internal_note' as const, id: w.corvale, business_id: w.corvale };
    for (const a of [w.client, w.as('SURVEYING'), w.as('ACCOUNTING'), w.as('READ_ONLY')]) assert.equal(can(a, 'internal_note.read', note), false, a.role);
    for (const a of [w.client, w.as('SURVEYING'), w.as('READ_ONLY')]) assert.equal(can(a, 'inbound_email.read', { type: 'inbound_email', id: 'q' }), false, a.role);
  });

  test('"Team only" is the notes: an existing note is a message on it, with its date and author, and nothing is copied', async () => {
    const d = w.deps();
    const sales = w.as('SALES');
    const n = addNote(d, sales, w.dunmarrow, 'Phase 142 existing note — ask about the lift', { claim_id: w.dunClaim });
    assert.ok(n.ok);
    const t = M.teamThread(w.made.app.db, w.as('ADMIN'), w.dunmarrow);
    const m = t.messages.find((x) => x.body === 'Phase 142 existing note — ask about the lift');
    assert.ok(m, 'the note is not on the team thread');
    assert.equal(m.when !== '', true);
    assert.notEqual(m.who, 'You');
    assert.match(m.about ?? '', /\(CR-\d{4}-\d{4}\)$/, 'the claim it was tagged to is not said');
    // One store: there is no second copy of the note anywhere.
    assert.equal(w.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_messages WHERE body LIKE 'Phase 142 existing note%'")?.n, 0);
    const sp = await w.signIn('sales');
    const page = await sp.get(`/staff/clients/${w.dunmarrow}?chat=team`);
    assert.equal(page.status, 200);
    assert.match(page.body, /<ul class="chattabs"[^>]*>[\s\S]*Team only[\s\S]*With the client/);
    assert.match(page.body, /Only your team sees this\. The client never does\./);
    assert.match(page.body, /Phase 142 existing note — ask about the lift/);
  });

  test('a message is never edited and never deleted; nor is a team message', () => {
    const d = w.deps();
    const r = M.postClientMessage(d, w.as('SALES'), w.dunmarrow, { body: 'Phase 142 fixed words', claim_id: null });
    assert.ok(r.ok);
    const db = w.made.app.db;
    assert.throws(() => db.run('UPDATE client_messages SET body = ? WHERE id = ?', ['changed', r.id]), /never edited/);
    assert.throws(() => db.run('DELETE FROM client_messages WHERE id = ?', [r.id]), /never deleted/);
    assert.throws(() => db.run("UPDATE internal_notes SET body = 'changed'"), /never edited/);
    assert.throws(() => db.run('DELETE FROM internal_notes'), /never deleted/);
  });

  test('a claim of another company is refused; a do-not-contact company cannot be written to by staff', () => {
    const d = w.deps();
    const otherClaim = w.made.app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id <> ? LIMIT 1', [w.dunmarrow])?.id ?? '';
    const r = M.postClientMessage(d, w.as('SALES'), w.dunmarrow, { body: 'wrong claim', claim_id: otherClaim });
    assert.deepEqual(r, { ok: false, why: 'Choose one of this company’s claims.' });
    const dnc = w.made.app.db.get<{ id: string }>("SELECT id FROM businesses WHERE client_status = 'DO_NOT_CONTACT'")?.id;
    if (dnc !== undefined) {
      const x = M.postClientMessage(d, w.as('SALES'), dnc, { body: 'hello', claim_id: null });
      assert.equal(x.ok, false);
    }
  });

  test('every message is audited, and the line never carries the words', () => {
    const d = w.deps();
    const r = M.postClientMessage(d, w.as('ADMIN'), w.dunmarrow, { body: 'Phase 142 AUDIT-WORDS-XYZ', claim_id: w.dunClaim });
    assert.ok(r.ok);
    const line = w.made.app.db.get<{ kind: string; detail: string }>("SELECT kind, detail FROM audit_log WHERE object_id = ? AND kind = 'CLIENT_MESSAGE_WRITTEN'", [r.id]);
    assert.ok(line, 'no audit line');
    assert.equal(line.detail.includes('AUDIT-WORDS-XYZ'), false);
    assert.match(line.detail, /"direction":"TO_CLIENT"/);
  });
});

/* ================================================================== *
 * 2 + 3 · THE PORTAL, AND THE WIRE PROOF
 * ================================================================== */

describe('the portal: Messages, a file that lands in Files, and a team thread it cannot reach', () => {
  let w: World;
  let client: Client;
  let sales: Client;
  const SECRET = `TEAM-ONLY-${randomBytes(6).toString('hex')}`;
  let noteId = '';
  before(async () => {
    w = await boot();
    client = await w.signIn('client');
    sales = await w.signIn('sales');
    const n = addNote(w.deps(), w.as('SALES'), w.corvale, `${SECRET} — do not tell the client we think the lease is weak`);
    assert.ok(n.ok);
    noteId = n.id;
  });
  after(() => w.close());

  test('the client writes in Messages with no file; staff read it on "With the client" and answer; the client reads the answer', async () => {
    const page = await client.get('/portal/messages');
    assert.equal(page.status, 200);
    assert.match(page.body, /<h1>Messages<\/h1>/);
    assert.match(page.body, /enctype="multipart\/form-data"/);
    // The browser sends the empty file box: that is a message with no file, not a refusal.
    const sent = await client.upload('/portal/messages', { body: 'Hello, when will you visit?', claim_id: '', type_code: '' }, null);
    assert.equal(sent.status, 303, sent.body);
    assert.match(sent.location ?? '', /done=sent/);
    // Staff: the tab carries 1 unread, and the section opens on the client's tab because something is new.
    const before = await sales.get(`/staff/clients/${w.corvale}`);
    assert.match(before.body, /With the client <span class="unread" aria-label="1 not read">1<\/span>/);
    assert.match(before.body, /Hello, when will you visit\?/);
    const opened = await sales.get(`/staff/clients/${w.corvale}?chat=client`);
    assert.equal(opened.status, 200);
    const again = await sales.get(`/staff/clients/${w.corvale}?chat=client`);
    assert.equal(/With the client <span class="unread"/.test(again.body), false, 'opening the tab did not mark it read');
    w.clock.now = '2026-09-21T10:05:00.000Z';
    const reply = await sales.post(`/staff/clients/${w.corvale}/messages`, { body: 'Next Tuesday at ten.', claim_id: '' });
    assert.equal(reply.status, 303);
    // The portal's Messages tab shows 1 unread until the client opens it.
    const home = await client.get('/portal');
    assert.match(home.body, /Messages <span class="tabcount" aria-label="1 not read">1<\/span>/);
    const thread = await client.get('/portal/messages');
    assert.match(thread.body, /Next Tuesday at ten\./);
    assert.match(thread.body, /at Cap Rebate/);
    const home2 = await client.get('/portal');
    assert.equal(/Messages <span class="tabcount"/.test(home2.body), false);
  });

  test('a file sent with a message goes through the upload path, lands in Files under "From the client", and links back', async () => {
    const r = await client.upload('/portal/messages', { body: 'Here is our lease.', claim_id: '', type_code: 'LEASE' }, PDF());
    assert.equal(r.status, 303, r.body);
    assert.match(r.location ?? '', /done=file/);
    const db = w.made.app.db;
    const link = db.get<{ logical_document_id: string; message_id: string }>(
      "SELECT f.logical_document_id, f.message_id FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE m.body = 'Here is our lease.'");
    assert.ok(link, 'the file is not linked to its message');
    // Through the receipt contract: the handler read it and discharged the quarantined copy.
    const v = db.get<{ strip_recorded_at: string | null; quarantine_discharged_at: string | null }>(
      'SELECT strip_recorded_at, quarantine_discharged_at FROM documents WHERE logical_document_id = ?', [link.logical_document_id]);
    assert.ok(v?.strip_recorded_at !== null && v?.quarantine_discharged_at !== null, 'the file did not go through the upload handler');
    const files = await sales.get(`/staff/clients/${w.corvale}/files?folder=client`);
    assert.equal(files.status, 200);
    assert.match(files.body, /Lease, and any licence for alterations 1/);
    assert.match(files.body, new RegExp(`See the message it came with`));
    assert.match(files.body, new RegExp(`msg-${link.message_id}`));
    // The client sees their own file on the message, and the file's own page.
    const thread = await client.get('/portal/messages');
    assert.match(thread.body, /<ul class="msgfiles"><li><a href="\/portal\/documents\/[A-Za-z0-9-]+">Lease, and any licence for alterations 1<\/a>/);
    // A file with no "what is it?" is refused before anything is received.
    const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents')?.n ?? 0;
    const bad = await client.upload('/portal/messages', { body: 'Another file', claim_id: '', type_code: '' }, PDF());
    assert.equal(bad.status, 400);
    assert.match(bad.body, /Choose what the file is\./);
    assert.match(bad.body, /Another file/, 'what they typed was lost');
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents')?.n, count, 'a refused message left a file behind');
  });

  test('a client asking for a team message by id gets 404 — the same as another company’s message and an id that does not exist', async () => {
    const theirs = M.postClientMessage(w.deps(), w.as('SALES'), w.dunmarrow, { body: 'Dunmarrow only', claim_id: null });
    assert.ok(theirs.ok);
    const mine = w.made.app.db.get<{ id: string }>('SELECT id FROM client_messages WHERE business_id = ? LIMIT 1', [w.corvale])?.id ?? '';
    assert.equal((await client.get(`/portal/messages/${mine}`)).status, 200);
    for (const id of [noteId, theirs.id, randomUUID()]) {
      const r = await client.get(`/portal/messages/${id}`);
      assert.equal(r.status, 404, id);
      assert.equal(r.body.includes(SECRET), false);
      assert.equal(r.body.includes('Dunmarrow only'), false);
    }
    // And ?business= naming another company is refused outright, as everywhere in the portal.
    assert.notEqual((await client.get(`/portal/messages?business=${w.dunmarrow}`)).status, 200);
  });

  test('ON THE WIRE: no portal response body ever carries a team message’s words', async () => {
    const db = w.made.app.db;
    const claimIds = db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ?', [w.corvale]).map((r) => r.id);
    const docIds = db.all<{ id: string }>('SELECT id FROM documents WHERE business_id = ?', [w.corvale]).map((r) => r.id);
    const paths = [
      '/portal', '/portal/messages', '/portal/help', '/portal/settings', '/portal/letter',
      ...claimIds.map((id) => `/portal/claims/${id}`), ...docIds.map((id) => `/portal/documents/${id}`),
      `/portal/messages/${noteId}`,
      // The staff pages a curious client might type: refused, and the refusal carries nothing either.
      `/staff/clients/${w.corvale}`, `/staff/clients/${w.corvale}?chat=team`, `/staff/clients/${w.corvale}/files`, '/staff/replies', '/staff',
    ];
    let searched = 0;
    for (const p of paths) {
      const r = await client.get(p);
      searched++;
      assert.equal(r.body.includes(SECRET), false, `${p} (${r.status}) carried a team message's words`);
      assert.equal(r.body.includes('the lease is weak'), false, `${p} carried a team message's words`);
    }
    // A write the client cannot make does not echo it either.
    const w1 = await client.post(`/staff/clients/${w.corvale}/notes`, { body: 'client trying to write a note' });
    assert.notEqual(w1.status, 303);
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM internal_notes WHERE body = 'client trying to write a note'")?.n, 0);
    assert.ok(searched >= 10);
    // The same words ARE on the staff page — so the search above could have found them.
    const staff = await sales.get(`/staff/clients/${w.corvale}?chat=team`);
    assert.equal(staff.body.includes(SECRET), true, 'the control is empty: the words are not on the staff page either');
  });

  test('the surveyor, Accounting and the view-only login see neither thread on the client page', async () => {
    for (const who of ['surveying', 'accounting', 'readonly']) {
      const c = await w.signIn(who);
      const r = await c.get(`/staff/clients/${w.corvale}?chat=client`);
      assert.equal(r.body.includes('Hello, when will you visit?'), false, who);
      assert.equal(r.body.includes(SECRET), false, who);
      assert.equal(/class="chattabs"/.test(r.body), false, `${who} was drawn the chat`);
    }
  });

  test('every message is on the company’s timeline, and the timeline never carries its words', () => {
    const t = timelineFor(w.made.app.db, w.as('SALES'), { kind: 'organisation', id: w.corvale });
    const msgs = t.events.filter((e) => e.category === 'MESSAGE');
    assert.ok(msgs.some((e) => e.what === 'The client sent a message in their portal'));
    assert.ok(msgs.some((e) => e.what === 'The client sent a message in their portal — with 1 file'));
    assert.ok(msgs.some((e) => e.what === 'We sent the client a message in their portal'));
    assert.equal(JSON.stringify(t.events).includes('Next Tuesday'), false);
    assert.equal(JSON.stringify(t.events).includes(SECRET), false);
  });
});

/* ================================================================== *
 * 4 · A CLIENT WAITING FOR A REPLY, ON HOME
 * ================================================================== */

describe('Home: a client message waiting more than one working day', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('red on the Today and overdue row after one working day; gone once we answer', async () => {
    w.clock.now = '2026-09-18T15:00:00.000Z'; // a Friday
    const r = M.postClientMessage(w.deps(), w.client, w.corvale, { body: 'Are you there?', claim_id: null });
    assert.ok(r.ok);
    // Signed in afresh at each moment: a session does not last across the days the clock is moved.
    w.clock.now = '2026-09-21T09:00:00.000Z'; // Monday: one working day — not late
    assert.equal(/A message waiting for a reply/.test((await (await w.signIn('sales')).get('/staff')).body), false);
    w.clock.now = '2026-09-22T09:00:00.000Z'; // Tuesday: two — late
    const sales = await w.signIn('sales');
    const home = await sales.get('/staff');
    assert.equal(home.status, 200);
    assert.match(home.body, /Corvale Supported Living Limited[\s\S]{0,400}A message waiting for a reply[\s\S]{0,200}Waiting 2 working days/);
    const waiting = M.clientMessagesWaiting(w.made.app.db, w.as('SALES'), w.clock.now);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0]?.late, true);
    // Neither the surveyor nor Accounting is told: they cannot read the thread.
    assert.equal(M.clientMessagesWaiting(w.made.app.db, w.as('SURVEYING'), w.clock.now).length, 0);
    assert.equal(M.clientMessagesWaiting(w.made.app.db, w.as('ACCOUNTING'), w.clock.now).length, 0);
    assert.ok(M.postClientMessage(w.deps(), w.as('SALES'), w.corvale, { body: 'Yes — sorry.', claim_id: null }).ok);
    assert.equal(/A message waiting for a reply/.test((await sales.get('/staff')).body), false);
  });
});

/* ================================================================== *
 * 6 · REPLIES TO contact@caprebate.co.uk
 * ================================================================== */

function rawEmail(o: { from: string; inReplyTo?: string; text: string; file?: Uint8Array; id?: string }): Uint8Array {
  const b = 'cb-test-boundary';
  const head = [`From: A Person <${o.from}>`, 'To: Cap Rebate <contact@caprebate.co.uk>', 'Subject: =?UTF-8?B?UmU6IFlvdXIgY2xhaW0=?=',
    `Message-ID: <${o.id ?? randomUUID()}@example.invalid>`, ...(o.inReplyTo === undefined ? [] : [`In-Reply-To: <${o.inReplyTo}>`, `References: <${o.inReplyTo}>`]),
    'MIME-Version: 1.0'];
  if (o.file === undefined) return new Uint8Array(Buffer.from([...head, 'Content-Type: text/plain; charset=utf-8', '', o.text].join('\r\n'), 'utf8'));
  return new Uint8Array(Buffer.from([...head, `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`,
    'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '', o.text.replace(/=/g, '=3D'), `--${b}`,
    'Content-Type: text/html; charset=utf-8', '', '<p>HTML-NEVER-KEPT</p>', `--${b}`,
    'Content-Type: application/pdf; name="smith.pdf"', 'Content-Transfer-Encoding: base64', 'Content-Disposition: attachment; filename="smith.pdf"', '',
    (Buffer.from(o.file).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n'), `--${b}--`, ''].join('\r\n'), 'utf8'));
}

/** An email we sent: in the outbox, sent, with the Message-ID the provider gave it. */
function sentEmail(w: World, business_id: string, contact: { id: string; email: string }, claim_id: string | null): string {
  const ref = `${randomBytes(8).toString('hex')}@caprebate.co.uk`;
  w.made.app.db.run(
    'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, transport, business_id, contact_id, claim_id, from_header, reply_to, send_requested, sent_at, provider_ref) ' +
      "VALUES (?, ?, ?, 'About your claim', 'Hello', 'FREE_EMAIL', 'SMTP', ?, ?, ?, 'Cap Rebate <contact@caprebate.co.uk>', 'contact@caprebate.co.uk', 1, ?, ?)",
    [randomUUID(), w.clock.now, contact.email, business_id, contact.id, claim_id, w.clock.now, ref]);
  return ref;
}

/** A fake mailbox server: IMAP as a real one answers it, recording every command. */
async function fakeImap(mails: Map<number, Uint8Array>): Promise<{ server: Server; port: number; commands: string[] }> {
  const commands: string[] = [];
  const server = createServer((sock) => {
    let buf = '';
    sock.write('* OK fake IMAP ready\r\n');
    sock.on('data', (c: Buffer) => {
      buf += c.toString('latin1');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        commands.push(line);
        const [tag, ...rest] = line.split(' ');
        const cmd = rest.join(' ');
        if (/^LOGIN /i.test(cmd)) sock.write(`${tag} OK logged in\r\n`);
        else if (/^EXAMINE INBOX$/i.test(cmd)) sock.write(`* ${mails.size} EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`);
        else if (/^UID SEARCH UID (\d+):\*$/i.test(cmd)) {
          const from = Number(/UID (\d+):/.exec(cmd)?.[1]);
          const found = [...mails.keys()].filter((u) => u >= from);
          // A real server always includes the newest message in "n:*", even when it is below n.
          const newest = Math.max(...mails.keys());
          sock.write(`* SEARCH ${[...new Set([...found, newest])].join(' ')}\r\n${tag} OK done\r\n`);
        } else if (/^UID FETCH (\d+) \(UID BODY\.PEEK\[\]\)$/i.test(cmd)) {
          const uid = Number(/FETCH (\d+)/.exec(cmd)?.[1]);
          const m = mails.get(uid);
          if (m !== undefined) {
            sock.write(`* 1 FETCH (UID ${uid} BODY[] {${m.length}}\r\n`);
            sock.write(Buffer.from(m));
            sock.write(`)\r\n`);
          }
          sock.write(`${tag} OK done\r\n`);
        } else if (/^LOGOUT$/i.test(cmd)) { sock.write(`* BYE\r\n${tag} OK bye\r\n`); sock.end(); } else sock.write(`${tag} BAD not in this fake\r\n`);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  return { server, port: typeof a === 'object' && a !== null ? a.port : 0, commands };
}

const ON: InboundEmail = Object.freeze({ enabled: true, provider: 'IMAP', mailbox_ready: true, question: INBOUND_EMAIL.question });
const LOGIN = Object.freeze({ host: '127.0.0.1', port: 1, user: 'contact@caprebate.co.uk', password: 'not "a" real\\password' });

describe('replies to contact@caprebate.co.uk', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('INBOUND_EMAIL is built and off: reading does nothing, opens no connection, and says what is missing', async () => {
    assert.equal(INBOUND_EMAIL.enabled, false);
    // PHASE 142b: IONOS chosen on 22 September 2026, so the mailbox is read over IMAP; reading stays off.
    assert.equal(INBOUND_EMAIL.provider, 'IMAP');
    assert.ok(backendSwitchReadings().some((s) => s.switch === 'INBOUND_EMAIL' && s.on === false && s.home === 'src/stubs/email-inbound.ts'));
    let touched = false;
    const spy: Mailbox = { since: async () => { touched = true; return []; }, one: async () => { touched = true; return null; } };
    const r = await IE.readMailbox(w.deps(), INBOUND_EMAIL, LOGIN, spy);
    assert.equal(r.state, 'OFF');
    assert.equal(touched, false, 'the mailbox was opened while reading was off');
    assert.deepEqual(readingMissing(INBOUND_EMAIL, null).filter((x) => !/login/i.test(x)), [
      'Then switch reading replies on.',
    ]);
  });

  test('the text part only: HTML is never kept, a file is counted, a header word is decoded', () => {
    const p = parseEmail(rawEmail({ from: 'X@Example.Invalid', inReplyTo: 'abc@caprebate.co.uk', text: 'Thanks = great', file: PDF() }));
    assert.equal(p.text, 'Thanks = great');
    assert.equal(p.subject, 'Re: Your claim');
    assert.equal(p.from_address, 'x@example.invalid');
    assert.deepEqual(p.answers, ['abc@caprebate.co.uk']);
    assert.equal(p.files.length, 1);
    assert.equal(p.files[0]?.content_type, 'application/pdf');
    assert.equal(JSON.stringify(p).includes('HTML-NEVER-KEPT'), false);
  });

  test('THE IMAP READER IS READ-ONLY: EXAMINE, BODY.PEEK, and never SELECT, STORE, COPY, MOVE or EXPUNGE', async () => {
    const mails = new Map([[5, rawEmail({ from: 'a@example.invalid', text: 'five' })], [7, rawEmail({ from: 'b@example.invalid', text: 'seven' })]]);
    const f = await fakeImap(mails);
    try {
      const box = imapMailbox(LOGIN, () => netConnect(f.port, '127.0.0.1'));
      const got = await box.since(5);
      assert.deepEqual(got.map((m) => m.uid), [7]);
      assert.equal(parseEmail(got[0]?.raw ?? new Uint8Array()).text, 'seven');
      // "n:*" returns the newest even when nothing is newer: the reader filters it out.
      assert.deepEqual((await box.since(7)).map((m) => m.uid), []);
      assert.equal(parseEmail((await box.one(5))?.raw ?? new Uint8Array()).text, 'five');
      const all = f.commands.join('\n');
      assert.match(all, /EXAMINE INBOX/);
      assert.match(all, /BODY\.PEEK\[\]/);
      assert.equal(/\b(SELECT|STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE)\b/i.test(all.replace(/LOGIN .*/g, '')), false, all);
      // The login is quoted: a quote or a backslash in the password cannot end the string early.
      assert.ok(f.commands.some((c) => c.endsWith('LOGIN "contact@caprebate.co.uk" "not \\"a\\" real\\\\password"')));
    } finally {
      f.server.close();
    }
  });

  test('a reply to our email from one of the company’s contacts is filed on its chat, tagged to our claim, and on the timeline', async () => {
    const contact = w.contacts[0];
    assert.ok(contact);
    const ref = sentEmail(w, w.dunmarrow, contact, w.dunClaim);
    const mails = new Map([[1, rawEmail({ from: contact.email.toUpperCase(), inReplyTo: ref, text: 'Tuesday suits us.' })]]);
    const f = await fakeImap(mails);
    try {
      const r = await IE.readMailbox(w.deps(), ON, LOGIN, imapMailbox(LOGIN, () => netConnect(f.port, '127.0.0.1')));
      assert.deepEqual(r, { state: 'RAN', read: 1, filed: 1, queued: 0, do_not_contact: 0, bounces: 0 });
      // Read again: nothing new, nothing doubled.
      const again = await IE.readMailbox(w.deps(), ON, LOGIN, imapMailbox(LOGIN, () => netConnect(f.port, '127.0.0.1')));
      assert.deepEqual(again, { state: 'RAN', read: 0, filed: 0, queued: 0, do_not_contact: 0, bounces: 0 });
    } finally {
      f.server.close();
    }
    const t = M.clientThread(w.made.app.db, w.as('SALES'), w.dunmarrow);
    const m = t.messages.find((x) => x.body === 'Tuesday suits us.');
    assert.ok(m, 'the reply is not on the chat');
    assert.equal(m.by_email, true);
    assert.equal(m.from_client, true);
    assert.match(m.who, /, by email$/);
    assert.match(m.about ?? '', /\(CR-\d{4}-\d{4}\)$/, 'not tagged to the claim our email was about');
    const tl = timelineFor(w.made.app.db, w.as('SALES'), { kind: 'organisation', id: w.dunmarrow });
    assert.ok(tl.events.some((e) => e.category === 'MESSAGE' && /^A reply from .+, by email$/.test(e.what)));
    const line = w.made.app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'INBOUND_EMAIL_RECEIVED' ORDER BY seq DESC LIMIT 1");
    assert.equal(line?.detail.includes('Tuesday'), false);
    assert.equal(line?.detail.includes('@'), false);
  });

  test('NEVER BY ADDRESS ALONE: a contact writing fresh, or a stranger answering our email, waits in the queue', () => {
    const contact = w.contacts[0];
    assert.ok(contact);
    const d = w.deps();
    assert.equal(IE.ingest(d, { uid: 101, raw: rawEmail({ from: contact.email, text: 'A new question, not a reply.' }) }), 'QUEUED');
    const ref = sentEmail(w, w.dunmarrow, contact, null);
    assert.equal(IE.ingest(d, { uid: 102, raw: rawEmail({ from: 'stranger@example.invalid', inReplyTo: ref, text: 'I am not a contact.' }) }), 'QUEUED');
    const q = IE.replyQueue(w.made.app.db, w.as('SALES'));
    assert.deepEqual(q.map((x) => x.why), ['It is not a reply to an email we sent.',
      'It answers one of our emails, but from an address that is not one of that company’s contacts.']);
    assert.equal(w.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_messages WHERE body IN ('A new question, not a reply.', 'I am not a contact.')")?.n, 0);
    assert.throws(() => IE.replyQueue(w.made.app.db, w.client));
    assert.throws(() => IE.replyQueue(w.made.app.db, w.as('SURVEYING')));
  });

  test('staff file a queued reply under a company, by hand; it cannot be filed twice', async () => {
    const q = IE.replyQueue(w.made.app.db, w.as('SALES'));
    const first = q[0];
    assert.ok(first);
    const sales = await w.signIn('sales');
    const page = await sales.get('/staff/replies');
    assert.equal(page.status, 200);
    assert.match(page.body, /Email replies to sort/);
    assert.match(page.body, /We are not reading replies yet\./);
    const r = await sales.post(`/staff/replies/${first.id}/file`, { business_id: w.dunmarrow });
    assert.equal(r.status, 303);
    assert.ok(M.clientThread(w.made.app.db, w.as('SALES'), w.dunmarrow).messages.some((m) => m.body === 'A new question, not a reply.'));
    assert.equal(IE.replyQueue(w.made.app.db, w.as('SALES')).length, q.length - 1);
    assert.throws(() => IE.fileQueued(w.deps(), w.as('SALES'), first.id, w.dunmarrow));
  });

  test('a file in an emailed reply is saved to Files once staff say what it is — through the upload path, from the client', async () => {
    const contact = w.contacts[0];
    assert.ok(contact);
    const ref = sentEmail(w, w.dunmarrow, contact, w.dunClaim);
    const raw = rawEmail({ from: contact.email, inReplyTo: ref, text: 'Lease attached.', file: PDF() });
    assert.equal(IE.ingest(w.deps(), { uid: 201, raw }), 'FILED');
    const msg = w.made.app.db.get<{ id: string }>("SELECT id FROM client_messages WHERE body = 'Lease attached.'")?.id ?? '';
    const files = IE.unsavedFiles(w.made.app.db, w.as('SALES'), msg);
    assert.equal(files.length, 1);
    assert.match(files[0]?.label ?? '', /^File 1 — a PDF, \d+ (bytes|KB)$/);
    assert.deepEqual(IE.unsavedFiles(w.made.app.db, w.client, msg), [], 'the client was offered staff’s save form');
    // No name of the file is kept anywhere.
    assert.equal(JSON.stringify(w.made.app.db.all('SELECT * FROM inbound_email_files')).includes('smith'), false);
    const box: Mailbox = { since: async () => [], one: async (uid) => (uid === 201 ? { uid, raw } : null) };
    const r = await IE.saveEmailedFile({ app: w.made.app, store: w.made.store, newId: randomUUID }, w.as('SALES'), files[0]?.id ?? '', 'LEASE', box);
    assert.ok(r.ok, JSON.stringify(r));
    const link = w.made.app.db.get<{ logical_document_id: string }>('SELECT logical_document_id FROM client_message_files WHERE message_id = ?', [msg]);
    assert.ok(link);
    // The latest word on who may see it is the answer, as src/web/documents.ts reads it.
    assert.equal(shownToClient(w.made.app.db, link.logical_document_id), true, 'the client cannot see the file they sent');
    assert.deepEqual(IE.unsavedFiles(w.made.app.db, w.as('SALES'), msg), []);
    const sales = await w.signIn('sales');
    const folder = await sales.get(`/staff/clients/${w.dunmarrow}/files?folder=client`);
    assert.match(folder.body, /See the message it came with/);
    const twice = await IE.saveEmailedFile({ app: w.made.app, store: w.made.store, newId: randomUUID }, w.as('SALES'), files[0]?.id ?? '', 'LEASE', box);
    assert.deepEqual(twice, { ok: false, why: 'That file is already saved.' });
  });
});

describe('a do-not-contact company’s reply', () => {
  let w: World;
  before(async () => { w = await boot(); });
  after(() => w.close());

  test('is recorded on its chat, flagged, and nothing is sent back to anybody', () => {
    const contact = w.contacts[0];
    assert.ok(contact);
    const ref = sentEmail(w, w.dunmarrow, contact, null);
    const db = w.made.app.db;
    db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [w.dunmarrow]);
    const outboxBefore = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n;
    assert.equal(IE.ingest(w.deps(), { uid: 1, raw: rawEmail({ from: contact.email, inReplyTo: ref, text: 'Please stop.' }) }), 'DO_NOT_CONTACT');
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n, outboxBefore, 'something was queued to be sent back');
    assert.ok(M.clientThread(db, w.as('SALES'), w.dunmarrow).messages.some((m) => m.body === 'Please stop.'));
    assert.equal(M.postClientMessage(w.deps(), w.as('SALES'), w.dunmarrow, { body: 'Sorry to hear that', claim_id: null }).ok, false);
  });
});
