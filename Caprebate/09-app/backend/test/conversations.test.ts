/**
 * 1 OCTOBER 2026 — EMAIL AND WHATSAPP AS CONVERSATIONS, AND THE RED DOT ON CHAT.
 *
 * Lakhbir: the To box filled in and changeable; "the right hand side should show the chain of emails allowing a user to
 * click on reply making them apart of the chain … if no current email chain (on the right) is selected then it fires as a
 * new email"; WhatsApp the same, the conversation on the right; "when we receive emails, there needs to be a red dot on
 * chat, signalling there is a notification for that client". Recorded mail and invented addresses only: nothing leaves.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import * as IE from '../src/web/inbound-email.ts';
import { INBOUND_EMAIL } from '../src/stubs/email-inbound.ts';
import { buildMessage, smtpProvider } from '../src/stubs/email-provider.ts';

const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let now = T;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-cv-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-cv-sales', 'cv.sales@example.invalid', 'cv.sales@example.invalid', 'Sam Sales', 'SALES', hash, T, T]);
  for (const [id, name] of [['b-cv-1', 'Chain Test Limited'], ['b-cv-2', 'Other Company Limited']] as const) {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,contact_email) VALUES (?,?,?,?,?,?)', [id, name, 'dental', 'ASSESSMENT_SUBMITTED', T, id === 'b-cv-1' ? 'main@chain-test.invented.co.uk' : null]);
  }
  db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-cv-ann', 'b-cv-1', 'Ann Other', 1, 0, ?, 'ann@chain-test.invented.co.uk', NULL)", [T]);
  db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-cv-main', 'b-cv-1', 'Main Person', 1, 0, ?, 'main@chain-test.invented.co.uk', '07700 900321')", [T]);
});
after(() => made.close());

let cookie = '';
async function req(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  return { status: r.status, body: await r.text(), location: r.headers.get('location') };
}
const post = (path: string, form: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
// 1 Oct 2026: "Chat" is now "Communication" (src/web/communication.ts).
const chatButton = (body: string): string => /<a class="cta chatbtn"[^>]*>Communication[\s\S]*?<\/a>/.exec(body)?.[0] ?? '';

/** A reply as a mail program writes it: answering one of our Message-IDs. */
const reply = (from: string, answers: string, words: string, mid: string) => new Uint8Array(Buffer.from([
  `From: Ann Other <${from}>`, 'To: Cap Rebate <contact@caprebate.co.uk>', 'Subject: Re: Your survey date',
  `Message-ID: <${mid}>`, `In-Reply-To: <${answers}>`, `References: <${answers}>`,
  'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', words].join('\r\n'), 'utf8'));

describe('email and WhatsApp as conversations', () => {
  before(async () => { await post('/login', { email: 'cv.sales@example.invalid', password: PASSWORD }); });

  test('To is filled in with the main contact; a new email starts a chain; their reply joins it, and Chat gets a red dot', async () => {
    const page = await req('/staff/clients/b-cv-1/email');
    assert.equal(page.status, 200);
    assert.match(page.body, /<input class="fi" id="em-to" name="to_email" type="email"[^>]* value="main@chain-test\.invented\.co\.uk">/, 'To is not the main contact');
    assert.match(page.body, /<h2 id="compose-h">New email<\/h2>/);
    assert.match(page.body, /No emails with Chain Test Limited yet/);
    const sent = await post('/staff/clients/b-cv-1/email', { to_email: 'ann@chain-test.invented.co.uk', subject: 'Your survey date', body: 'We visit on Tuesday.' });
    assert.equal(sent.status, 303);
    const first = made.app.db.get<{ id: string; thread_key: string | null; contact_id: string }>("SELECT id, thread_key, contact_id FROM outbox WHERE subject = 'Your survey date'")!;
    assert.equal(first.thread_key, null, 'a new email named a chain');
    assert.equal(first.contact_id, 'c-cv-ann');
    // It went out (as the sender would record it), and Ann answered it.
    made.app.db.run('UPDATE outbox SET sent_at = ?, provider_ref = ? WHERE id = ?', [T, 'ours-1@caprebate.co.uk', first.id]);
    assert.ok(!/newdot/.test(chatButton((await req('/staff/clients/b-cv-1')).body)), 'a red dot before anything came in');
    now = '2026-10-01T10:00:00.000Z';
    const deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    assert.equal(IE.ingest(deps, { uid: 1, raw: reply('ann@chain-test.invented.co.uk', 'ours-1@caprebate.co.uk', 'Tuesday is fine.', 'theirs-1@invented.co.uk') }), 'FILED');
    // The red dot: on Chat, on its tab, and on the Clients list — until someone reads it.
    const client = (await req('/staff/clients/b-cv-1')).body;
    assert.match(chatButton(client), /<span class="newdot" aria-label="1 new message"[^>]*>1<\/span>/);
    assert.match(client, /class="ctab-link ctl-chat[^"]*">Communication <span class="newdot"/);
    assert.match((await req('/staff/clients')).body, /href="\/staff\/clients\/b-cv-1\?chat=all#chat">Chain Test Limited<\/a> <span class="newdot"/);
    assert.doesNotMatch((await req('/staff/clients')).body, /href="\/staff\/clients\/b-cv-2[^"]*">Other Company Limited<\/a> <span class="newdot"/, 'the dot is on the wrong company');
    // The email page: one chain, our email then theirs, theirs marked new; Reply under it. Reading it clears the dot.
    const chains = (await req('/staff/clients/b-cv-1/email')).body;
    const chain = new RegExp(`<details class="echain" id="chain-${first.id}" open>[\\s\\S]*?</details>`).exec(chains)?.[0] ?? '';
    assert.ok(chain !== '', 'the chain is not drawn, open');
    assert.match(chain, /<span class="echain-subj">Your survey date<\/span> <span class="newdot" aria-label="1 new">New<\/span>/);
    assert.ok(chain.indexOf('We visit on Tuesday.') < chain.indexOf('Tuesday is fine.'), 'not oldest first');
    assert.match(chain, /<li class="msg mine">[\s\S]*Sam Sales, to ann@chain-test/);
    assert.match(chain, /<li class="msg is-new">[\s\S]*Ann Other \(ann@chain-test\.invented\.co\.uk\)/);
    assert.match(chain, new RegExp(`<a class="btn" href="/staff/clients/b-cv-1/email\\?thread=${first.id}#compose">Reply</a>`));
    assert.doesNotMatch(chatButton((await req('/staff/clients/b-cv-1')).body), /newdot/, 'reading the email page did not clear the dot');
  });

  test('Reply: the left becomes a reply in that chain — to whoever wrote last, "Re:", and naming what it answers; sent with In-Reply-To and References', async () => {
    const first = made.app.db.get<{ id: string }>("SELECT id FROM outbox WHERE subject = 'Your survey date'")!.id;
    const page = (await req(`/staff/clients/b-cv-1/email?thread=${first}`)).body;
    assert.match(page, /<h2 id="compose-h">Reply<\/h2>/);
    assert.match(page, new RegExp(`<input type="hidden" name="thread" value="${first}">`));
    assert.match(page, /value="ann@chain-test\.invented\.co\.uk">/);
    assert.match(page, /<input class="fi" id="em-subject" name="subject" required maxlength="300" value="Re: Your survey date">/);
    assert.match(page, /<details class="echain is-reply" id="chain-[^"]+" open>/);
    assert.match(page, /<a href="\/staff\/clients\/b-cv-1\/email">Write a new email instead<\/a>/);
    now = '2026-10-01T11:00:00.000Z';
    const r = await post('/staff/clients/b-cv-1/email', { to_email: 'ann@chain-test.invented.co.uk', thread: first, subject: 'Re: Your survey date', body: 'See you then.' });
    assert.equal(r.status, 303);
    const row = made.app.db.get<{ thread_key: string; in_reply_to: string; references_ids: string }>("SELECT thread_key, in_reply_to, references_ids FROM outbox WHERE body = 'See you then.'")!;
    assert.deepEqual({ ...row }, { thread_key: first, in_reply_to: 'theirs-1@invented.co.uk', references_ids: 'ours-1@caprebate.co.uk theirs-1@invented.co.uk' });
    // Still one chain, now three emails long; a reply to our reply joins it too.
    const after = (await req('/staff/clients/b-cv-1/email')).body;
    assert.equal((after.match(/<details class="echain/g) ?? []).length, 1);
    assert.match(after, /3 emails/);
    // The headers that keep it in one conversation in their mail program — and nothing smuggled through them.
    const msg = buildMessage({ from_header: 'Cap Rebate <contact@caprebate.co.uk>', reply_to: 'contact@caprebate.co.uk', to: 'ann@chain-test.invented.co.uk',
      subject: 'Re: Your survey date', body: 'x', attachments: [], date: new Date(T),
      in_reply_to: 'theirs-1@invented.co.uk', references: ['ours-1@caprebate.co.uk', 'bad\r\nBcc: x@y.co.uk', 'theirs-1@invented.co.uk'] }, 'm@caprebate.co.uk');
    assert.match(msg, /\r\nIn-Reply-To: <theirs-1@invented\.co\.uk>\r\n/);
    assert.match(msg, /\r\nReferences: <ours-1@caprebate\.co\.uk> <theirs-1@invented\.co\.uk>\r\n/);
    assert.doesNotMatch(msg, /Bcc/);
    assert.doesNotMatch(buildMessage({ from_header: 'a <a@b.co>', reply_to: 'a@b.co', to: 'c@d.co', subject: 's', body: 'x', attachments: [], date: new Date(T) }, 'm@b.co'), /In-Reply-To|References/, 'a new email names something it answers');
  });

  test('an invented address never reaches the real mail server, whichever page sent it', async () => {
    // The real connector, pointed at nothing: had it dialled, the reason would be a connection failure, not this.
    const p = smtpProvider({ host: '127.0.0.1', port: 1, user: 'contact@caprebate.co.uk', password: 'x' });
    for (const to of ['decisions@b4.example.invalid', 'someone@example.com', 'a@thing.test']) {
      const r = await p.deliver({ from_header: 'Cap Rebate <contact@caprebate.co.uk>', reply_to: 'contact@caprebate.co.uk', to, subject: 's', body: 'x', attachments: [], date: new Date(T) });
      assert.deepEqual({ ...r }, { ok: false, why: 'An invented address, so it was not sent.' }, to);
    }
  });

  test('a chain is only this company’s: another company’s, or a made-up one, is refused and nothing is written', async () => {
    const first = made.app.db.get<{ id: string }>("SELECT id FROM outbox WHERE subject = 'Your survey date'")!.id;
    const before = made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n;
    for (const [company, thread] of [['b-cv-2', first], ['b-cv-1', 'made-up']] as const) {
      const r = await post(`/staff/clients/${company}/email`, { to_email: 'ann@chain-test.invented.co.uk', thread, subject: 'x', body: 'y' });
      assert.equal(r.status, 400, `${company} ${thread}`);
      assert.match(r.body, /That conversation is not one of this company’s/);
    }
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM outbox')!.n, before);
  });

  test('WhatsApp: a message in puts the dot on Chat; its page has the conversation on the right and the box on the left, and reading it clears the dot', async () => {
    now = '2026-10-01T12:00:00.000Z';
    made.app.db.run("INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, 'b-cv-1', 'c-cv-main', 'IN', '447700900321', 'text', 'Can you call me?', 'wamid.cv1', 'RECEIVED', ?, ?)",
      [randomUUID(), now, now]);
    assert.match(chatButton((await req('/staff/clients/b-cv-1')).body), /aria-label="1 new message"/);
    const page = (await req('/staff/clients/b-cv-1/whatsapp')).body;
    // PHASE 156c (5 Oct 2026): with the live connection off the left holds "Add a WhatsApp chat", not a reply box.
    assert.match(page, /<section class="convo-write" id="compose"[\s\S]*<select class="fi" id="wa-imp-to" name="contact_id" required><option value="c-cv-main" selected>Main Person/);
    assert.match(page, /<section class="convo-chain"[\s\S]*<h2 id="wa-chain-h">With Main Person<\/h2>[\s\S]*Can you call me\?/);
    assert.doesNotMatch(chatButton((await req('/staff/clients/b-cv-1')).body), /newdot/, 'reading WhatsApp did not clear the dot');
  });

  test('"Everything" reads it all; a portal message alone brings the dot back; the Everything tab offers Email, WhatsApp and the portal', async () => {
    now = '2026-10-01T13:00:00.000Z';
    made.app.db.run("INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, 'b-cv-1', 'c-cv-main', 'IN', '447700900321', 'text', 'Hello again', 'wamid.cv2', 'RECEIVED', ?, ?)",
      [randomUUID(), now, now]);
    assert.match(chatButton((await req('/staff/clients/b-cv-1')).body), /newdot/);
    const all = (await req('/staff/clients/b-cv-1?chat=all')).body;
    assert.doesNotMatch(chatButton(all), /newdot/, 'Communication was open and the dot stayed');
    // Every way to write is in the one form there.
    // PHASE 156c (5 Oct 2026): with WhatsApp not connected live it is not a way to send here; the chat is added from the phone.
    assert.match(all, /<select class="fi" id="via" name="via"><option value="email" selected>Email<\/option><option value="portal">Portal message<\/option>/);
    assert.match(all, /<h3 id="wa-add-h">Add a WhatsApp chat<\/h3>/);
    now = '2026-10-01T14:00:00.000Z';
    made.app.db.run("INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, 'b-cv-1', NULL, 'FROM_CLIENT', 'EMAIL', NULL, 'c-cv-ann', 'One more thing', ?)", [randomUUID(), now]);
    assert.match(chatButton((await req('/staff/clients/b-cv-1')).body), /aria-label="1 new message"/);
  });
  test('a reply from the very address we wrote to (typed in To, not a contact) goes into the conversation; from any other address it waits to be sorted', async () => {
    now = '2026-10-01T15:00:00.000Z';
    const sent = await post('/staff/clients/b-cv-1/email', { to_email: 'Owner.Typed@Elsewhere.Invented.co.uk', subject: 'Typed address', body: 'Hello.' });
    assert.equal(sent.status, 303);
    const row = made.app.db.get<{ id: string; contact_id: string | null }>("SELECT id, contact_id FROM outbox WHERE subject = 'Typed address'")!;
    assert.equal(row.contact_id, null);
    made.app.db.run('UPDATE outbox SET sent_at = ?, provider_ref = ? WHERE id = ?', [now, 'ours-typed@caprebate.co.uk', row.id]);
    const deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    assert.equal(IE.ingest(deps, { uid: 40, raw: reply('owner.typed@elsewhere.invented.co.uk', 'ours-typed@caprebate.co.uk', 'Got it, thanks.', 'typed-reply@invented.co.uk') }), 'FILED');
    assert.equal(IE.ingest(deps, { uid: 41, raw: reply('somebody.else@invented.co.uk', 'ours-typed@caprebate.co.uk', 'Forwarded on.', 'other-reply@invented.co.uk') }), 'QUEUED');
    const page = (await req(`/staff/clients/b-cv-1/email?thread=${row.id}`)).body;
    assert.match(page, /Got it, thanks\./);
    assert.doesNotMatch(page, /Forwarded on\./);
  });

  test('a reply set aside before the rule existed is filed by it at the next read; one from another address stays; Everything shows emails to a typed address', async () => {
    const db = made.app.db;
    now = '2026-10-01T16:00:00.000Z';
    db.run("INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id, provider_ref, send_requested, written_by) VALUES ('o-cv-old', ?, 'Lee.Own@Icloud.Invented.co.uk', 'Before the rule', 'Hello there.', 'FREE_TYPED', ?, 'SMTP', 'b-cv-1', 'ours-old@caprebate.co.uk', 1, 'u-cv-sales')", [now, now]);
    // As the reader left them before today: answering our email, from an address that is not a contact — set aside.
    for (const [id, uid, from, words] of [['ie-old-1', '60', 'lee.own@icloud.invented.co.uk', 'Yes, that works.'], ['ie-old-2', '61', 'stranger@invented.co.uk', 'Who are you?']] as const) {
      db.run("INSERT INTO inbound_email (id, received_at, mailbox_uid, message_id, from_address, subject, text_body, matched_outbox_id, business_id, claim_id, contact_id, outcome, queue_reason, client_message_id) VALUES (?, ?, ?, ?, ?, 'Re: Before the rule', ?, 'o-cv-old', NULL, NULL, NULL, 'QUEUED', 'NOT_A_CONTACT', NULL)",
        [id, now, uid, `${id}@invented.co.uk`, from, words]);
    }
    const deps = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
    const r = await IE.readMailbox(deps, INBOUND_EMAIL, { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' },
      { since: async () => [], one: async () => null, highestUid: async () => 61 });
    assert.equal(r.state === 'RAN' && r.filed, 1);
    const filing = db.get<{ filed_by: string | null; rule: string | null; business_id: string }>("SELECT filed_by, rule, business_id FROM inbound_email_filings WHERE inbound_email_id = 'ie-old-1'");
    assert.deepEqual({ ...filing }, { filed_by: null, rule: 'ANSWERS_OUR_EMAIL', business_id: 'b-cv-1' });
    assert.equal(db.get("SELECT 1 AS x FROM inbound_email_filings WHERE inbound_email_id = 'ie-old-2'"), undefined, 'a reply from another address was filed');
    assert.throws(() => db.run("INSERT INTO inbound_email_filings (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, rule, filed_at) VALUES ('x', 'ie-old-2', 'b-cv-1', NULL, (SELECT id FROM client_messages LIMIT 1), NULL, NULL, ?)", [now]), /CHECK/, 'a filing with neither a person nor a rule');
    // Read again: filed once.
    await IE.readMailbox(deps, INBOUND_EMAIL, { host: 'imap.ionos.co.uk', port: 993, user: 'contact@caprebate.co.uk', password: 'x' }, { since: async () => [], one: async () => null, highestUid: async () => 61 });
    assert.equal(db.get<{ n: number }>("SELECT count(*) AS n FROM inbound_email_filings WHERE inbound_email_id = 'ie-old-1'")!.n, 1);
    // On the conversation, with our email; and Communication shows the email to the typed address and the reply.
    assert.match((await req('/staff/clients/b-cv-1/email?thread=o-cv-old')).body, /Hello there\.[\s\S]*Yes, that works\./);
    const all = (await req('/staff/clients/b-cv-1?chat=all')).body;
    assert.match(all, /Sam Sales, to Lee\.Own@Icloud\.Invented\.co\.uk[\s\S]*?Before the rule/);
    assert.match(all, /Yes, that works\./);
    assert.doesNotMatch(all, /Who are you\?/);
  });
});
