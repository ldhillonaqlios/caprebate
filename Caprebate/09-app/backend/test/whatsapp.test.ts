/**
 * 30 SEPTEMBER 2026 — WHATSAPP WITH EACH CLIENT, AND "EVERYTHING" ON THE CLIENT PAGE (src/web/whatsapp.ts).
 *
 * Lakhbir: "the ability to use whats app directly using our back end portal the idea is each client when we view back
 * end has full communication via email or whats app". Recorded answers only; invented keys; the transfer approved only
 * through the test hook (app.whatsappPolicy). As shipped it is not approved, and nothing is sent.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { waNumber, whatsappMissing } from '../src/connectors/whatsapp.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';

const T = '2026-09-08T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const KEYS = {
  WHATSAPP_ACCESS_TOKEN: 'invented-token', WHATSAPP_PHONE_NUMBER_ID: '123456789012345', WHATSAPP_APP_SECRET: 'invented-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'invented-verify-word', WHATSAPP_OPENING_TEMPLATE: 'cap_rebate_opening',
};
const SEND = 'POST /v25.0/123456789012345/messages';
const ACCEPTED = (id: string): Fixture => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: 'x', wa_id: 'x' }], messages: [{ id }] }) });

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
/**
 * PHASE 154a1 (line 12), 4 October 2026 — A CLOCK THAT ALWAYS MOVES ON. "Communication puts ... in one list, in order"
 * failed about one run in three (13 in 30 on the old code): the portal message and the email it posts straight after
 * were often written in the same millisecond, and Communication breaks a tie on the row's random id - a coin toss. This
 * clock is the real time, but never the same instant twice, so every row has its own moment and the order is the order
 * they were written in.
 */
let lastTick = 0;
const steadyNow = (): string => { lastTick = Math.max(Date.now(), lastTick + 1); return new Date(lastTick).toISOString(); };
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-wa-')), now: steadyNow });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-wa-sales', 'wa.sales@example.invalid', 'wa.sales@example.invalid', 'Sam Sales', 'SALES', hash, T, T]);
  for (const [id, name] of [['b-wa-1', 'WhatsApp Dental Limited'], ['b-wa-2', 'Second Company Limited'], ['b-wa-3', 'Third Company Limited'], ['b-wa-dnc', 'Do Not Contact Limited']] as const) {
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [id, name, 'dental', 'ASSESSMENT_SUBMITTED', T]);
  }
  db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = 'b-wa-dnc'");
  db.run("UPDATE businesses SET contact_email = 'ada@invented-dental.co.uk' WHERE id = 'b-wa-1'");
  const contact = (id: string, biz: string, name: string, phone: string, email: string | null) =>
    db.run('INSERT INTO contacts (id, business_id, full_name, phone, email, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)', [id, biz, name, phone, email, T]);
  contact('c-wa-ada', 'b-wa-1', 'Ada Invented', '07700 900123', 'ada@invented-dental.co.uk');
  contact('c-wa-no-phone', 'b-wa-1', 'Bea Invented', '', null);
  contact('c-wa-shared-1', 'b-wa-2', 'Cy Shared', '+44 7700 900555', null);
  contact('c-wa-shared-2', 'b-wa-3', 'Cy Shared', '07700 900555', null);
  contact('c-wa-dnc', 'b-wa-dnc', 'Di Nocontact', '07700 900777', null);
});
after(() => made.close());
beforeEach(() => { made.app.outside = liveTransport; made.app.secrets = secretsFromValues({}); delete made.app.whatsappPolicy; });

function on(fixtures: Record<string, Fixture | readonly Fixture[]> = {}) {
  const t = fixtureTransport(fixtures);
  made.app.outside = t;
  made.app.secrets = secretsFromValues(KEYS);
  made.app.whatsappPolicy = { international_transfer_approved: true };
  return t;
}

function client() {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  return { req, post };
}
/** One signed-in Sales session for the file (the sign-in limits a burst of logins, as it should). */
let salesSession: ReturnType<typeof client> | undefined;
async function sales() { if (salesSession === undefined) { salesSession = client(); await salesSession.post('/login', { email: 'wa.sales@example.invalid', password: PASSWORD }); } return salesSession; }

/** What Meta posts: one message from `from`, signed with `secret`. */
function inbound(from: string, id: string, text: string, secret = KEYS.WHATSAPP_APP_SECRET, at = Math.floor(Date.parse(made.app.now()) / 1000)) {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'waba', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: '123456789012345' }, contacts: [{ profile: { name: 'Ada' }, wa_id: from }],
    messages: [{ from, id, timestamp: String(at), type: 'text', text: { body: text } }] } }] }] });
  return { body, sig: `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` };
}
const hook = (b: { body: string; sig: string | null }) => fetch(`${base}/hooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', ...(b.sig === null ? {} : { 'x-hub-signature-256': b.sig }) }, body: b.body });
const allRows = () => made.app.db.all<Record<string, unknown>>('SELECT * FROM whatsapp_messages ORDER BY created_at, rowid');
const byWa = (wa: string) => made.app.db.all<Record<string, unknown>>('SELECT * FROM whatsapp_messages WHERE wa_id = ?', [wa]);
const outFor = (biz: string) => made.app.db.all<Record<string, unknown>>("SELECT * FROM whatsapp_messages WHERE business_id = ? AND direction = 'OUT'", [biz]);

describe('WhatsApp', () => {
  test('numbers are read as WhatsApp writes them', () => {
    assert.equal(waNumber('07700 900123'), '447700900123');
    assert.equal(waNumber('+44 (0)7700 900123'), '447700900123');
    assert.equal(waNumber('0044 7700-900123'), '447700900123');
    assert.equal(waNumber('+1 (415) 555-0100'), '14155550100');
    assert.equal(waNumber('call me'), null);
    assert.equal(waNumber(''), null);
  });

  test('the transfer is approved (Sadique, 30 Sep 2026, for testing); without the keys nothing is sent, the page says which, and an attempt is kept as not sent', async () => {
    assert.equal(CALL_POLICIES['WHATSAPP_CLOUD']?.international_transfer_approved, true);
    assert.equal(CALL_POLICIES['WHATSAPP_CLOUD']?.max_attempts, 1, 'a message is not safe to send twice');
    assert.deepEqual(whatsappMissing(secretsFromValues(KEYS)), []);
    assert.deepEqual(whatsappMissing(secretsFromValues(KEYS), { international_transfer_approved: false }), ['Meta keeps WhatsApp messages outside the UK: the data protection officer approves the transfer (sources.ts, WHATSAPP_CLOUD).']);
    const t = fixtureTransport({ [SEND]: ACCEPTED('wamid.never') });
    made.app.outside = t;
    made.app.secrets = secretsFromValues({});
    const s = await sales();
    const all = (await s.req('/staff/clients/b-wa-1?chat=all')).body;
    // 1 Oct 2026: Communication — WhatsApp was one of the ways to write in its one form. PHASE 156c (5 Oct 2026): while it is
    // not connected live it is not offered there; the company's conversation has "Add a WhatsApp chat" instead.
    assert.doesNotMatch(all, /<option value="whatsapp">WhatsApp<\/option>/);
    assert.match(all, /<h3 id="wa-add-h">Add a WhatsApp chat<\/h3>/);
    // 1 Oct 2026: WhatsApp has its own page — the conversation on the right, the message on the left.
    const page = (await s.req('/staff/clients/b-wa-1/whatsapp')).body;
    assert.match(page, /<section class="convo-write" id="compose"[\s\S]*<section class="convo-chain"/);
    // PHASE 156c (5 Oct 2026, Lakhbir: manual upload): with the live connection off there is no reply box here at all —
    // staff reply on the WhatsApp phone and add the chat (test/phase156c.test.ts). The sending code below is unchanged.
    assert.doesNotMatch(page, /id="wa-to"/);
    assert.match(page, /Reply to Ada on the WhatsApp phone/);
    const waForm = page.slice(page.indexOf('<select class="fi" id="wa-imp-to"'), page.indexOf('</select>', page.indexOf('id="wa-imp-to"')));
    assert.match(waForm, /value="c-wa-ada"/);
    assert.doesNotMatch(waForm, /value="c-wa-no-phone"/, 'a contact with no number was offered');
    const r = await s.post('/staff/clients/b-wa-1/whatsapp', { contact_id: 'c-wa-ada', opening: '1' });
    assert.equal(r.status, 400);
    assert.equal(t.seen.length, 0, 'something went to Meta');
    const kept = outFor('b-wa-1');
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!['status'], 'NOT_SENT');
  });

  test('outside the 24 hours only our opening message goes: the template, the first name, the number — and free words are refused before any call', async () => {
    const t = on({ [SEND]: ACCEPTED('wamid.opening1') });
    const s = await sales();
    const words = await s.post('/staff/clients/b-wa-1/whatsapp', { contact_id: 'c-wa-ada', body: 'Hello Ada', send: '1' });
    assert.equal(words.status, 400);
    assert.match(words.body, /more than 24 hours since Ada last wrote to us on WhatsApp/);
    assert.equal(t.seen.length, 0);
    const r = await s.post('/staff/clients/b-wa-1/whatsapp', { contact_id: 'c-wa-ada', opening: '1' });
    assert.equal(r.location, '/staff/clients/b-wa-1/whatsapp?contact=c-wa-ada&done=whatsapp-opening');
    assert.equal(t.seen.length, 1);
    assert.equal(t.seen[0]!.headers['authorization'], 'Bearer invented-token');
    const sent = JSON.parse(t.seen[0]!.body ?? '{}');
    assert.deepEqual(sent, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '447700900123', type: 'template',
      template: { name: 'cap_rebate_opening', language: { code: 'en_GB' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }] } });
    const row = byWa('wamid.opening1')[0]!;
    assert.equal(row['status'], 'SENT');
    assert.equal(row['kind'], 'opening');
    // The audit line names ids and the outcome — never the number or the words.
    const audit = made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind LIKE 'WHATSAPP_%'");
    for (const a of audit) assert.doesNotMatch(a.detail, /7700|Hello Ada/);
  });

  test('Meta\'s check of our address, and a body believed only under its signature', async () => {
    on();
    const good = await fetch(`${base}/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=invented-verify-word&hub.challenge=12345`);
    assert.equal(good.status, 200);
    assert.equal(await good.text(), '12345');
    assert.equal((await fetch(`${base}/hooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`)).status, 403);
    const before = allRows().length;
    const unsigned = inbound('447700900123', 'wamid.x1', 'Forged');
    assert.equal((await hook({ body: unsigned.body, sig: null })).status, 401);
    assert.equal((await hook({ body: unsigned.body, sig: inbound('447700900123', 'wamid.x1', 'Forged', 'another-secret').sig })).status, 401);
    assert.equal(allRows().length, before, 'an unsigned body was kept');
    assert.ok(made.app.db.get("SELECT 1 AS x FROM audit_log WHERE kind = 'WHATSAPP_REFUSED'"));
  });

  test('a reply from a contact\'s number is filed under the company, once; then the window is open and words go; statuses only move forward', async () => {
    const t = on({ [SEND]: ACCEPTED('wamid.text1') });
    const m = inbound('447700900123', 'wamid.in1', 'Yes please, call me tomorrow');
    const received = () => made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'WHATSAPP_RECEIVED'")!.n;
    const before = received();
    assert.equal((await hook(m)).status, 200);
    assert.equal((await hook(m)).status, 200, 'the same delivery twice');
    assert.equal(received(), before + 1, 'a message delivered twice was recorded twice');
    const got = byWa('wamid.in1');
    assert.equal(got.length, 1, 'kept twice');
    assert.equal(got[0]!['business_id'], 'b-wa-1');
    assert.equal(got[0]!['contact_id'], 'c-wa-ada');
    const s = await sales();
    const page = (await s.req('/staff/clients/b-wa-1?chat=all')).body;
    assert.match(page, /<span class="ch ch-whatsapp">WhatsApp<\/span> <span class="who">Ada Invented<\/span>/);
    assert.match(page, /Yes please, call me tomorrow/);
    const wa = (await s.req('/staff/clients/b-wa-1/whatsapp')).body;
    assert.match(wa, /<span class="via">WhatsApp<\/span> <strong>Ada Invented<\/strong> · [^<]*<\/p>\s*<p class="msgbody">Yes please, call me tomorrow/);
    assert.match(wa, /Ada Invented — 07700 900123 — you can write freely until /);
    const r = await s.post('/staff/clients/b-wa-1/whatsapp', { contact_id: 'c-wa-ada', body: 'Great — we will ring at 10:00.', send: '1' });
    assert.equal(r.location, '/staff/clients/b-wa-1/whatsapp?contact=c-wa-ada&done=whatsapp');
    assert.deepEqual(JSON.parse(t.seen.at(-1)!.body ?? '{}'), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '447700900123', type: 'text', text: { preview_url: false, body: 'Great — we will ring at 10:00.' } });
    const status = (st: string) => { const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.text1', status: st, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '447700900123' }] } }] }] });
      return hook({ body, sig: `sha256=${createHmac('sha256', KEYS.WHATSAPP_APP_SECRET).update(body).digest('hex')}` }); };
    await status('read');
    await status('delivered');
    assert.equal(byWa('wamid.text1')[0]!['status'], 'READ', 'a status went backwards');
    assert.match((await s.req('/staff/clients/b-wa-1?chat=all')).body, /Great — we will ring at 10:00\.<\/p>/);
  });

  test('a number no single company has waits to be filed by a person; filed once; nobody guesses', async () => {
    on();
    await hook(inbound('447700900999', 'wamid.unknown1', 'Who is this?'));
    await hook(inbound('447700900555', 'wamid.shared1', 'Two companies know me'));
    assert.equal(byWa('wamid.unknown1')[0]!['business_id'], null);
    assert.equal(byWa('wamid.shared1')[0]!['business_id'], null, 'filed by guesswork between two companies');
    const s = await sales();
    assert.match((await s.req('/staff/clients/b-wa-1?chat=all')).body, /WhatsApp messages from a number we do not know yet/);
    const q = (await s.req('/staff/whatsapp')).body;
    assert.match(q, /\+447700900999/);
    const id = byWa('wamid.unknown1')[0]!['id'] as string;
    assert.equal((await s.post(`/staff/whatsapp/${id}/file`, { business_id: 'b-wa-2' })).location, '/staff/whatsapp?done=filed');
    assert.equal(byWa('wamid.unknown1')[0]!['business_id'], 'b-wa-2');
    assert.equal((await s.post(`/staff/whatsapp/${id}/file`, { business_id: 'b-wa-3' })).status, 400, 'filed twice');
    assert.throws(() => made.app.db.run("UPDATE whatsapp_messages SET body = 'changed' WHERE id = ?", [id]), /never edited/);
  });

  test('Communication puts the portal, the emails we sent them and WhatsApp in one list, in order — and never a sign-in code or a colleague\'s alert', async () => {
    on();
    const s = await sales();
    await s.post('/staff/clients/b-wa-1/messages', { body: 'A portal message from us.' });
    made.app.email.send({ to_email: 'ada@invented-dental.co.uk', subject: 'Your survey date', body: 'The surveyor comes on Monday.', kind: 'FREE_TYPED', business_id: 'b-wa-1' });
    made.app.email.send({ to_email: 'ada@invented-dental.co.uk', subject: 'Your code', body: 'Code 123456', kind: 'SIGN_IN_CODE', business_id: 'b-wa-1' });
    made.app.email.send({ to_email: 'wa.sales@example.invalid', subject: 'A new message', body: 'For staff.', kind: 'NOTIFICATION', business_id: 'b-wa-1' });
    const page = (await s.req('/staff/clients/b-wa-1?chat=all')).body;
    // 1 Oct 2026: Communication's one conversation, newest at the bottom (drawn newest first in a column-reverse list).
    const list = /<ol class="flow">[\s\S]*?<\/ol>/.exec(page)?.[0] ?? '';
    const at = (w: string) => list.indexOf(w);
    assert.ok(at('Yes please, call me tomorrow') >= 0 && at('A portal message from us.') >= 0 && at('The surveyor comes on Monday.') >= 0, 'missing');
    assert.ok(at('The surveyor comes on Monday.') <= at('A portal message from us.') && at('A portal message from us.') < at('Yes please, call me tomorrow'), 'not in order');
    assert.match(list, /<span class="ch ch-portal">Portal<\/span>/);
    assert.match(list, /<span class="ch ch-email">Email<\/span> <span class="who">Cap Rebate, to ada@invented-dental\.co\.uk<\/span>/);
    assert.match(list, /<p class="subj">Your survey date<\/p>/);
    assert.doesNotMatch(list, /Code 123456|For staff\./);
  });

  test('a company marked do not contact is never written to on WhatsApp', async () => {
    const t = on({ [SEND]: ACCEPTED('wamid.never2') });
    const s = await sales();
    const got = await s.req('/staff/clients/b-wa-dnc?chat=all');
    const page = got.body;
    assert.match(page, /You cannot write to this company/);
    const r = await s.post('/staff/clients/b-wa-dnc/whatsapp', { contact_id: 'c-wa-dnc', opening: '1' });
    assert.equal(r.status, 400);
    assert.match(r.body, /asked us not to contact them/);
    assert.equal(t.seen.length, 0);
  });
});
