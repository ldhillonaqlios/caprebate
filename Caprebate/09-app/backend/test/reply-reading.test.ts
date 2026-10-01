/**
 * 30 SEPTEMBER 2026 — READING EMAIL REPLIES, SWITCHED ON FOR TESTING (src/web/inbound-email.ts, migration 064).
 *
 * The contact@ inbox already held 23 messages when reading was switched on. The first read only notes where the inbox
 * stands; every read after takes only what arrived since. The test website runs nothing on a timer, so replies are read
 * when staff look (at most every two minutes) or when they press "Check for new email replies". A fake mail server and
 * recorded inboxes only: nothing here reaches IONOS.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect as netConnect, type Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { INBOUND_EMAIL, imapMailbox, type Mailbox, type RawEmail } from '../src/stubs/email-inbound.ts';
import * as IE from '../src/web/inbound-email.ts';

const T = '2026-09-30T12:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const IMAP_KEYS = { IONOS_IMAP_HOST: 'imap.ionos.co.uk', IONOS_IMAP_PORT: '993', IONOS_IMAP_USER: 'contact@caprebate.co.uk', IONOS_IMAP_PASSWORD: 'not-a-real-password' };

const mail = (from: string, text: string): Uint8Array => new Uint8Array(Buffer.from([
  `From: A Person <${from}>`, 'To: Cap Rebate <contact@caprebate.co.uk>', 'Subject: Hello',
  `Message-ID: <${randomUUID()}@example.invalid>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', text].join('\r\n'), 'utf8'));

/** A recorded inbox: the messages it holds, and every call it was asked. */
function inbox(mails: Map<number, Uint8Array>) {
  const calls: string[] = [];
  const box: Mailbox = {
    since: async (after) => { calls.push(`since ${after}`); return [...mails.entries()].filter(([u]) => u > after).sort((a, b) => a[0] - b[0]).map(([uid, raw]): RawEmail => ({ uid, raw })); },
    one: async (uid) => { calls.push(`one ${uid}`); const raw = mails.get(uid); return raw === undefined ? null : { uid, raw }; },
    highestUid: async () => { calls.push('highest'); return mails.size === 0 ? 0 : Math.max(...mails.keys()); },
  };
  return { box, calls, mails };
}

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let now = T;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-rr-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-rr-sales', 'rr.sales@example.invalid', 'rr.sales@example.invalid', 'Sam Sales', 'SALES', hash, T, T]);
  made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-rr', 'Reply Test Limited', 'dental', 'ASSESSMENT_SUBMITTED', T]);
});
after(() => made.close());

let session: { req: (p: string, init?: RequestInit) => Promise<{ status: number; body: string; location: string | null }> } | undefined;
async function sales() {
  if (session !== undefined) return session;
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'rr.sales@example.invalid', password: PASSWORD }).toString() });
  session = { req };
  return session;
}

describe('reading email replies, on for testing', () => {
  test('switched on for testing; the first read only notes where the inbox stands and reads nothing already there', async () => {
    assert.equal(INBOUND_EMAIL.enabled, true);
    const i = inbox(new Map([[1, mail('old.one@invented.co.uk', 'An old email.')], [23, mail('old.two@invented.co.uk', 'Another old one.')]]));
    const deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    const login = { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' };
    const first = await IE.readMailbox(deps, INBOUND_EMAIL, login, i.box);
    assert.deepEqual(first, { state: 'RAN', read: 0, filed: 0, queued: 0, do_not_contact: 0, bounces: 0, started: true });
    assert.deepEqual(i.calls, ['highest'], 'a message already in the inbox was read');
    assert.equal(made.app.db.get<{ uid: number }>('SELECT uid FROM mailbox_watermark')?.uid, 23);
    // New mail arrives: only it is read, and nothing from before.
    i.mails.set(24, mail('new.person@invented.co.uk', 'Is this the right address?'));
    const second = await IE.readMailbox(deps, INBOUND_EMAIL, login, i.box);
    assert.equal(second.state === 'RAN' && second.read, 1);
    assert.equal(second.state === 'RAN' && second.queued, 1);
    assert.deepEqual(i.calls.slice(1), ['since 23']);
    const kept = made.app.db.all<{ from_address: string }>('SELECT from_address FROM inbound_email');
    assert.deepEqual(kept.map((k) => k.from_address), ['new.person@invented.co.uk']);
    assert.equal(made.app.db.get<{ uid: number }>('SELECT uid FROM mailbox_watermark')?.uid, 24);
    assert.throws(() => made.app.db.run('UPDATE mailbox_watermark SET uid = 5'), /only moves forward/);
  });

  test('the real inbox command: the highest number is asked with a read-only search, and nothing is fetched', async () => {
    const commands: string[] = [];
    const server: Server = createServer((sock) => {
      let buf = '';
      sock.write('* OK fake IMAP ready\r\n');
      sock.on('data', (c: Buffer) => {
        buf += c.toString('latin1');
        let k: number;
        while ((k = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, k); buf = buf.slice(k + 2); commands.push(line);
          const [tag, ...rest] = line.split(' '); const cmd = rest.join(' ');
          if (/^LOGIN /i.test(cmd)) sock.write(`${tag} OK logged in\r\n`);
          else if (/^EXAMINE INBOX$/i.test(cmd)) sock.write(`* 3 EXISTS\r\n${tag} OK [READ-ONLY] done\r\n`);
          else if (/^UID SEARCH ALL$/i.test(cmd)) sock.write(`* SEARCH 7 21 23\r\n${tag} OK done\r\n`);
          else if (/^LOGOUT$/i.test(cmd)) { sock.write(`* BYE\r\n${tag} OK bye\r\n`); sock.end(); } else sock.write(`${tag} BAD not in this fake\r\n`);
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const a = server.address();
    const port = typeof a === 'object' && a !== null ? a.port : 0;
    try {
      const box = imapMailbox({ host: '127.0.0.1', port, user: 'contact@caprebate.co.uk', password: 'x' }, () => netConnect(port, '127.0.0.1'));
      assert.equal(await box.highestUid!(), 23);
      assert.ok(commands.some((c) => /EXAMINE INBOX/.test(c)), 'the inbox was not opened read-only');
      assert.ok(!commands.some((c) => /SELECT|FETCH|STORE|EXPUNGE/i.test(c)), 'more than a read-only search was sent');
    } finally { server.close(); }
  });

  test('staff looking reads new replies (at most every two minutes); "Check for new email replies" reads at once', async () => {
    const i = inbox(new Map([[25, mail('looked@invented.co.uk', 'Read when staff looked.')]]));
    made.app.mailbox = i.box;
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    try {
      const s = await sales();
      now = '2026-09-30T13:00:00.000Z';
      const page = await s.req('/staff/replies');
      assert.equal(page.status, 200);
      assert.match(page.body, /Read when staff looked\./);
      assert.match(page.body, /Check for new email replies/);
      const before = i.calls.length;
      i.mails.set(26, mail('later@invented.co.uk', 'Arrived a minute later.'));
      now = '2026-09-30T13:01:00.000Z';
      assert.doesNotMatch((await s.req('/staff/clients/b-rr?chat=all')).body, /Arrived a minute later/);
      assert.equal(i.calls.length, before, 'the inbox was read again within two minutes');
      const checked = await s.req('/staff/replies/check', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ back: '/staff/clients/b-rr?chat=all' }).toString() });
      assert.equal(checked.location, '/staff/clients/b-rr?chat=all&done=checked#chat');
      assert.match((await s.req('/staff/replies')).body, /Arrived a minute later\./);
      // Somewhere outside the back office is never where it sends a person back to.
      const away = await s.req('/staff/replies/check', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ back: 'https://elsewhere.example/' }).toString() });
      assert.equal(away.location, '/staff/replies?done=checked#chat');
    } finally { delete made.app.mailbox; made.app.secrets = secretsFromValues({}); }
  });

  test('a reply to one of OUR emails is taken in even when it arrived before the reader started; nothing else from before is', async () => {
    const db = made.app.db;
    db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email) VALUES ('c-rr-1', 'b-rr', 'Rae Reply', 1, 0, ?, 'rae@reply-test.invented.co.uk')", [T]);
    db.run("INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id, provider_ref, send_requested) VALUES ('o-rr-1', ?, 'rae@reply-test.invented.co.uk', 'Your survey', 'Hello', 'FREE_TYPED', ?, 'SMTP', 'b-rr', 'aaaabbbbccccddddeeeeffff00001111@caprebate.co.uk', 1)", [T, T]);
    const answering = (n: number, to: string) => new Uint8Array(Buffer.from([
      'From: Rae Reply <rae@reply-test.invented.co.uk>', 'To: contact@caprebate.co.uk', 'Subject: Re: Your survey',
      `Message-ID: <early-${n}@invented.co.uk>`, `In-Reply-To: <${to}>`, 'Content-Type: text/plain; charset=utf-8', '', `Early reply ${n}.`].join('\r\n'), 'utf8'));
    // Below the mark: 10 answers our email; 11 answers somebody else's at our domain; 12 is ordinary old mail.
    const mails = new Map<number, Uint8Array>([[10, answering(10, 'aaaabbbbccccddddeeeeffff00001111@caprebate.co.uk')], [11, answering(11, 'not-ours@caprebate.co.uk')], [12, mail('old@invented.co.uk', 'Old mail.')]]);
    const asked: string[] = [];
    const box = {
      since: async () => [], one: async (uid: number) => { asked.push(`one ${uid}`); const raw = mails.get(uid); return raw === undefined ? null : { uid, raw }; },
      highestUid: async () => 26,
      answering: async (domain: string) => { asked.push(`answering ${domain}`); return [10, 11]; },
    };
    const deps = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    const r = await IE.readMailbox(deps, INBOUND_EMAIL, { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' }, box);
    assert.equal(r.state === 'RAN' && r.filed, 1);
    assert.deepEqual(asked, ['answering caprebate.co.uk', 'one 10', 'one 11'], 'old mail that answers nothing of ours was fetched');
    const kept = db.all<{ mailbox_uid: string; outcome: string }>("SELECT mailbox_uid, outcome FROM inbound_email WHERE mailbox_uid IN ('10','11','12')");
    assert.deepEqual(kept.map((k) => ({ ...k })), [{ mailbox_uid: '10', outcome: 'FILED' }]);
    assert.ok(db.get("SELECT 1 AS x FROM client_messages WHERE body = 'Early reply 10.' AND business_id = 'b-rr'"), 'not on the conversation');
    // Read again: taken in once only.
    await IE.readMailbox(deps, INBOUND_EMAIL, { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' }, box);
    assert.equal(db.get<{ n: number }>("SELECT count(*) AS n FROM inbound_email WHERE mailbox_uid = '10'")!.n, 1);
    // A server that cannot search that header does not stop the ordinary read.
    const deaf = { ...box, answering: async () => { throw new Error('the inbox could not be searched'); } };
    assert.equal((await IE.readMailbox(deps, INBOUND_EMAIL, { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' }, deaf)).state, 'RAN');
  });

  test('the Email page reads the inbox first and says what the last check found; a read that fails says why', async () => {
    const s = await sales();
    made.app.secrets = secretsFromValues(IMAP_KEYS);
    made.app.mailbox = { since: async () => { throw new Error('the mailbox refused the login'); }, one: async () => null, highestUid: async () => 26 };
    try {
      now = '2026-09-30T16:00:00.000Z';
      const page = (await s.req('/staff/clients/b-rr/email')).body;
      assert.match(page, /<form method="post" action="\/staff\/replies\/check" class="inline"><input type="hidden" name="back" value="\/staff\/clients\/b-rr\/email">/);
      assert.match(page, /<span class="echeck-bad">Last checked [^<]*: Could not read the inbox: the mailbox refused the login<\/span>/);
      assert.match((await s.req('/staff/replies')).body, /Last checked [^<]*: Could not read the inbox: the mailbox refused the login/);
      made.app.mailbox = { since: async () => [], one: async () => null, highestUid: async () => 26 };
      assert.equal((await s.req('/staff/replies/check', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ back: '/staff/clients/b-rr/email' }).toString() })).location,
        '/staff/clients/b-rr/email?done=checked#chat');
      assert.match((await s.req('/staff/clients/b-rr/email?done=checked')).body, /Checked for new email replies\.[\s\S]*Last checked [^<]*: No new email\./);
      // A plain visit to the client's page reads too — not only its Everything tab.
      let reads = 0;
      made.app.mailbox = { since: async () => { reads++; return []; }, one: async () => null, highestUid: async () => 26 };
      now = '2026-09-30T16:05:00.000Z';
      assert.equal((await s.req('/staff/clients/b-rr')).status, 200);
      assert.equal(reads, 1, 'opening the client page did not read the inbox');
    } finally { delete made.app.mailbox; made.app.secrets = secretsFromValues({}); }
  });

  test('"How email reading stands": the mark, each email received and what became of it, each sent and whether a reply can be matched', async () => {
    const s = await sales();
    const page = (await s.req('/staff/replies')).body;
    const panel = /<details class="readstate" id="how-reading-stands">[\s\S]*?<\/details>/.exec(page)?.[0] ?? '';
    assert.match(panel, /Read up to message \d+ of the inbox/);
    assert.match(panel, /<td data-label="Inbox no\.">10<\/td>[\s\S]*?<td data-label="What happened">Filed — on Reply Test Limited, when it came in<\/td>\s*<td data-label="Answers our email\?">Yes \(sent from Reply Test Limited\)<\/td>/);
    assert.match(panel, /<td data-label="Inbox no\.">24<\/td>[\s\S]*?Waiting to sort: [^<]+<\/td>\s*<td data-label="Answers our email\?">No<\/td>/);
    assert.match(panel, /<td data-label="To">rae@reply-test\.invented\.co\.uk<\/td><td data-label="Company">Reply Test Limited<\/td><td data-label="Subject">Your survey<\/td>\s*<td data-label="Sent\?">Sent [^<]+<\/td><td data-label="Reply can be matched\?">Yes<\/td>/);
    assert.doesNotMatch(panel, /Early reply 10/, 'an email\u2019s words are in the panel');
  });

  test('the reply timer: an outside timer wakes the site to read replies, with its word in a header; without it nothing is read', async () => {
    const word = 'a'.repeat(40);
    const hook = (auth?: string) => fetch(`${base}/hooks/read-replies`, { method: 'POST', headers: auth === undefined ? {} : { authorization: auth } });
    let reads = 0;
    made.app.mailbox = { since: async () => { reads++; return []; }, one: async () => null, highestUid: async () => 26 };
    made.app.secrets = secretsFromValues({ ...IMAP_KEYS });
    try {
      // No word set: refused, whatever is sent.
      const none = await hook(`Bearer ${word}`);
      assert.equal(none.status, 403);
      assert.equal(await none.text(), 'refused: no word is set on the website (REPLY_TIMER_TOKEN, 32 characters or more)');
      made.app.secrets = secretsFromValues({ ...IMAP_KEYS, REPLY_TIMER_TOKEN: 'too-short' });
      assert.equal((await hook('Bearer too-short')).status, 403, 'a short word was accepted');
      made.app.secrets = secretsFromValues({ ...IMAP_KEYS, REPLY_TIMER_TOKEN: word });
      for (const bad of [undefined, `Bearer ${'b'.repeat(40)}`, `Bearer ${word}x`, `Basic ${word}`]) assert.equal((await hook(bad)).status, 403, String(bad));
      // The refusal says why, never the word.
      assert.equal(await (await hook()).text(), 'refused: no word was sent: add the header Authorization: Bearer <the word>');
      assert.equal(await (await hook(`Bearer ${'b'.repeat(40)}`)).text(), 'refused: the word sent does not match the one set on the website');
      assert.equal(reads, 0, 'the inbox was read without the word');
      now = '2026-09-30T17:00:00.000Z';
      const ok = await hook(`Bearer ${word}`);
      assert.equal(ok.status, 200);
      assert.equal(await ok.text(), 'read 0, filed 0, to sort 0');
      assert.equal(reads, 1);
      // Called again at once: not read again within two minutes.
      assert.equal(await (await hook(`Bearer ${word}`)).text(), 'read in the last two minutes');
      assert.equal(reads, 1);
      // GET works too (some timers only send GET), the word alone (no "Bearer ") is taken, and the answer never carries an email's words.
      now = '2026-09-30T17:05:00.000Z';
      const got = await fetch(`${base}/hooks/read-replies`, { headers: { authorization: word } });
      assert.match(await got.text(), /^read \d+, filed \d+, to sort \d+$/);
    } finally { delete made.app.mailbox; made.app.secrets = secretsFromValues({}); }
  });
});
