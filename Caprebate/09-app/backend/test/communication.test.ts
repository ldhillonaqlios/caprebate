/**
 * 1 OCTOBER 2026 — CHAT BECOMES COMMUNICATION (src/web/communication.ts; mock-up approved by Lakhbir).
 *
 * One form on the left — Send by: Email, WhatsApp, Portal message, Team only, Zoom call, Log a call — and the whole
 * conversation on the right, each box a link that makes the left a reply to it, the address or number filled in;
 * filters, a search, the red dot. Invented people and addresses; nothing leaves (no Zoom, WhatsApp or mail keys).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

// Thursday 1 October 2026, 10:00 in the UK.
const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let now = T;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-cm-')), now: () => now });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  for (const [id, role, name] of [['u-cm-sales', 'SALES', 'Sam Sales'], ['u-cm-ro', 'READ_ONLY', 'Rita Reader'], ['u-cm-admin', 'ADMIN', 'Ada Admin']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T, T]);
  }
  db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, 5, 540, 1020)', [randomUUID(), 'u-cm-sales']); // Fridays 9 to 5
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,contact_email) VALUES (?,?,?,?,?,?)', ['b-cm', 'Comms Test Limited', 'dental', 'ASSESSMENT_SUBMITTED', T, 'office@comms-test.invented.co.uk']);
  db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-cm-pat', 'b-cm', 'Pat Owner', 1, 0, ?, 'pat@comms-test.invented.co.uk', '07700 900777')", [T]);
  db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-cm-lee', 'b-cm', 'Lee Office', 1, 0, ?, 'office@comms-test.invented.co.uk', NULL)", [T]);
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  return { status: r.status, body: await r.text(), location: r.headers.get('location') };
}
const send = (who: string, form: Record<string, string>) => req(who, '/staff/clients/b-cm/communicate', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const flow = (body: string): string => /<ol class="flow">[\s\S]*?<\/ol>/.exec(body)?.[0] ?? '';
const selectedVia = (body: string): string => /<select class="fi" id="via" name="via">[\s\S]*?<option value="([a-z]+)" selected>/.exec(body)?.[1] ?? 'none';

describe('Communication', () => {
  before(async () => { for (const w of ['u-cm-sales', 'u-cm-ro', 'u-cm-admin']) await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() }); });

  test('"Chat" is now "Communication": the button and the tab; one form with every way to write, email first, To filled in', async () => {
    const page = (await req('u-cm-sales', '/staff/clients/b-cm?chat=all')).body;
    assert.match(page, /<a class="cta chatbtn" href="\/staff\/clients\/b-cm\?chat=all#chat">Communication/);
    assert.match(page, /class="ctab-link ctl-chat[^"]*">Communication/);
    assert.doesNotMatch(page, />Chat</, 'the word Chat is still on the page');
    const ways = [...page.matchAll(/<select class="fi" id="via" name="via">([\s\S]*?)<\/select>/g)][0]?.[1] ?? '';
    assert.deepEqual([...ways.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]), ['email', 'whatsapp', 'portal', 'team', 'zoom', 'call']);
    assert.equal(selectedVia(page), 'email');
    assert.match(page, /<input class="fi" id="cm-to" name="to_email" type="email"[^>]* value="office@comms-test\.invented\.co\.uk">/);
    assert.match(page, /<p class="empty">Nothing with them yet\. Write the first on the left\.<\/p>/);
  });

  test('each way of writing goes through the one form, and lands in the one conversation', async () => {
    const back = (r: { location: string | null }) => r.location ?? '';
    assert.equal(back(await send('u-cm-sales', { via: 'portal', body: 'Your letter is ready to sign.', go: 'send' })), '/staff/clients/b-cm?chat=all&done=sent-portal#chat');
    assert.equal(back(await send('u-cm-sales', { via: 'team', body: 'Ask for the 2019 drawings too.', go: 'send' })), '/staff/clients/b-cm?chat=all&done=sent-team#chat');
    now = '2026-10-01T09:05:00.000Z';
    assert.equal(back(await send('u-cm-sales', { via: 'email', to_email: 'pat@comms-test.invented.co.uk', subject: 'Your survey', body: 'We visit on Friday.', go: 'send' })), '/staff/clients/b-cm?chat=all&done=saved-email#chat');
    now = '2026-10-01T09:10:00.000Z';
    assert.equal(back(await send('u-cm-sales', { via: 'call', call_contact_id: 'c-cm-pat', outcome: 'SPOKE', notes: 'Plans coming next week.', next_title: 'Chase the floor plans', next_on: '2026-10-07', go: 'call' })), '/staff/clients/b-cm?chat=all&done=logged-call#chat');
    const call = made.app.db.get<{ outcome: string; task_id: string | null; contact_id: string }>('SELECT outcome, task_id, contact_id FROM call_logs')!;
    assert.equal(call.outcome, 'SPOKE');
    assert.equal(call.contact_id, 'c-cm-pat');
    assert.equal(made.app.db.get<{ title: string; due_on: string }>('SELECT title, due_on FROM staff_tasks WHERE id = ?', [call.task_id])!.due_on, '2026-10-07', 'the next step was not a task');
    const f = flow((await req('u-cm-sales', '/staff/clients/b-cm?chat=all')).body);
    for (const [kind, words] of [['portal', 'Your letter is ready to sign.'], ['team', 'Ask for the 2019 drawings too.'], ['email', 'We visit on Friday.'], ['call', 'Plans coming next week.']] as const) {
      assert.match(f, new RegExp(`<a class="it it-${kind}[^"]*" href="[^"]+">[\\s\\S]*?${words.replace(/[.()]/g, '\\$&')}`), kind);
    }
    // Newest at the bottom: the list is drawn newest first in a column-reverse list.
    assert.ok(f.indexOf('Plans coming next week.') < f.indexOf('Your letter is ready to sign.'), 'not newest first in the page');
  });

  test('a box is a reply: clicking it chooses the way it came, and fills in the address, the subject, or the number', async () => {
    const db = made.app.db;
    // Pat answers our email (as if sent), and writes on WhatsApp.
    const ours = db.get<{ id: string }>("SELECT id FROM outbox WHERE subject = 'Your survey'")!.id;
    db.run('UPDATE outbox SET sent_at = ?, provider_ref = ? WHERE id = ?', [now, 'ours-cm@caprebate.co.uk', ours]);
    const { ingest } = await import('../src/web/inbound-email.ts');
    now = '2026-10-01T09:20:00.000Z';
    const raw = (from: string, words: string) => new Uint8Array(Buffer.from([`From: Pat Owner <${from}>`, 'To: contact@caprebate.co.uk', 'Subject: Re: Your survey',
      `Message-ID: <${randomUUID()}@invented.co.uk>`, 'In-Reply-To: <ours-cm@caprebate.co.uk>', 'Content-Type: text/plain; charset=utf-8', '', words].join('\r\n'), 'utf8'));
    assert.equal(ingest({ db, audit: made.app.audit, now: made.app.now, newId: randomUUID }, { uid: 1, raw: raw('pat@comms-test.invented.co.uk', 'Friday is fine.') }), 'FILED');
    db.run("INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, 'b-cm', 'c-cm-pat', 'IN', '447700900777', 'text', 'Can you call me?', 'wamid.cm1', 'RECEIVED', ?, ?)", [randomUUID(), now, now]);
    const page = (await req('u-cm-sales', '/staff/clients/b-cm?chat=all')).body;
    const f = flow(page);
    const emailHref = /<a class="it it-email" href="([^"]+)">[\s\S]*?Friday is fine\./.exec(f)?.[1]?.replace(/&amp;/g, '&') ?? '';
    assert.equal(emailHref, `/staff/clients/b-cm?chat=all&via=email&thread=${ours}#compose`);
    const waHref = /<a class="it it-whatsapp" href="([^"]+)">[\s\S]*?Can you call me\?/.exec(f)?.[1]?.replace(/&amp;/g, '&') ?? '';
    assert.equal(waHref, '/staff/clients/b-cm?chat=all&via=whatsapp&contact=c-cm-pat#compose');
    // Clicked: the email reply, filled in from it.
    const em = (await req('u-cm-sales', emailHref)).body;
    assert.equal(selectedVia(em), 'email');
    assert.match(em, /<div class="replying"><span>Replying to the email “Your survey”<\/span>/);
    assert.match(em, /id="cm-to" name="to_email" type="email"[^>]* value="pat@comms-test\.invented\.co\.uk">/);
    assert.match(em, /id="cm-subject" name="subject" maxlength="300" value="Re: Your survey">/);
    assert.match(em, new RegExp(`<input type="hidden" name="thread" value="${ours}">`));
    // Clicked: WhatsApp, the person and their number chosen.
    const wa = (await req('u-cm-sales', waHref)).body;
    assert.equal(selectedVia(wa), 'whatsapp');
    assert.match(wa, /<option value="c-cm-pat" selected>Pat Owner — 07700 900777<\/option>/);
    // Sent as a reply: in the same conversation, answering what Pat sent.
    await send('u-cm-sales', { via: 'email', thread: ours, to_email: 'pat@comms-test.invented.co.uk', subject: 'Re: Your survey', body: 'See you then.', go: 'send' });
    assert.equal(db.get<{ thread_key: string }>("SELECT thread_key FROM outbox WHERE body = 'See you then.'")!.thread_key, ours);
  });

  test('a refusal draws the form again, filled in, and says why', async () => {
    const r = await send('u-cm-sales', { via: 'whatsapp', wa_contact_id: 'c-cm-pat', body: 'A long reply I typed carefully.', go: 'send' });
    assert.equal(r.status, 400);
    assert.match(r.body, /<p class="err" role="alert"><strong>Not sent\.<\/strong> [^<]+ What you typed is still here\.<\/p>/);
    assert.equal(selectedVia(r.body), 'whatsapp');
    assert.match(r.body, /<textarea class="fi" id="cm-body" name="body" rows="7" maxlength="20000">A long reply I typed carefully\.<\/textarea>/);
    assert.equal((await send('u-cm-sales', { via: 'nonsense', body: 'x' })).status, 400);
  });

  test('filters and search: one kind at a time, the words found marked, and "Show everything"', async () => {
    const team = flow((await req('u-cm-sales', '/staff/clients/b-cm?chat=all&show=team')).body);
    assert.match(team, /Ask for the 2019 drawings too\./);
    assert.doesNotMatch(team, /Friday is fine|Your letter/);
    const found = (await req('u-cm-sales', '/staff/clients/b-cm?chat=all&q=friday')).body;
    assert.match(found, /<p class="found">2 found for “friday” · <a href="\/staff\/clients\/b-cm\?chat=all#chat">Show everything<\/a><\/p>/);
    assert.match(flow(found), /<mark>Friday<\/mark> is fine\./);
    assert.match(flow(found), /We visit on <mark>Friday<\/mark>\./);
    assert.doesNotMatch(flow(found), /drawings/);
    assert.match(found, /<input class="fi" id="cm-q" name="q" type="search" maxlength="100" value="friday"/);
    const xss = (await req('u-cm-sales', `/staff/clients/b-cm?chat=all&q=${encodeURIComponent('<script>x')}`)).body;
    assert.doesNotMatch(xss, /<script>x/);
  });

  test('the red dot and "New since you last looked": what came in is marked, and opening Communication reads it', async () => {
    now = '2026-10-01T10:00:00.000Z';
    made.app.db.run("INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, 'b-cm', 'c-cm-pat', 'IN', '447700900777', 'text', 'One more thing', 'wamid.cm2', 'RECEIVED', ?, ?)", [randomUUID(), now, now]);
    const plain = (await req('u-cm-admin', '/staff/clients/b-cm')).body;
    assert.match(plain, /chatbtn[^>]*>Communication <span class="newdot"/);
    const opened = (await req('u-cm-admin', '/staff/clients/b-cm?chat=all')).body;
    assert.match(flow(opened), /One more thing[\s\S]*<li class="newline"><span>New since you last looked<\/span><\/li>/, 'the new line is not above the new message');
    assert.match(flow(opened), /<span class="new-pill">New<\/span>[^]{0,300}?One more thing/, 'the WhatsApp message is not marked New');
    assert.doesNotMatch((await req('u-cm-admin', '/staff/clients/b-cm')).body, /chatbtn[^>]*>Communication <span class="newdot"/, 'opening Communication did not read it');
  });

  test('Zoom: book a free hour from your own diary (the invite goes to the person chosen, and shows), or start one now', async () => {
    now = '2026-10-01T10:30:00.000Z';
    const page = (await req('u-cm-sales', '/staff/clients/b-cm?chat=all&via=zoom')).body;
    assert.equal(selectedVia(page), 'zoom');
    const slot = /<select class="fi" id="cm-slot" name="slot"><optgroup label="[^"]+"><option value="([^"]+)"/.exec(page)?.[1] ?? '';
    assert.equal(slot, '2026-10-02T08:00:00.000Z', 'Friday 09:00 was not the first free hour');
    const r = await send('u-cm-sales', { via: 'zoom', zoom_to: 'pat@comms-test.invented.co.uk', slot, go: 'zoom-book' });
    // 1 Oct 2026: no Zoom keys here, so no meeting is made and the banner says so (it said the join link was on its way).
    assert.equal(r.location, '/staff/clients/b-cm?chat=all&done=booked-no-zoom#chat');
    const b = made.app.db.get<{ id: string; entry_point: string; assigned_to: string; starts_at: string }>("SELECT id, entry_point, assigned_to, starts_at FROM bookings WHERE business_id = 'b-cm'")!;
    assert.deepEqual({ ...b, id: 'x' }, { id: 'x', entry_point: 'staff', assigned_to: 'u-cm-sales', starts_at: slot });
    assert.equal(made.app.db.get<{ to_email: string }>("SELECT to_email FROM outbox WHERE kind = 'CALENDAR_INVITE'")!.to_email, 'pat@comms-test.invented.co.uk');
    const f = flow((await req('u-cm-sales', '/staff/clients/b-cm?chat=all')).body);
    assert.match(f, /<a class="it it-zoom ours"[^>]*>[\s\S]*?Zoom call booked with Sam Sales[\s\S]*?Friday 2 Oct 2026, 09:00–10:00/);
    assert.match(f, /<a class="it it-email ours"[^>]*>[\s\S]*?Your video call with Cap Rebate/, 'the invite email is not in the conversation');
    // The same hour cannot be booked twice.
    assert.equal((await send('u-cm-sales', { via: 'zoom', zoom_to: 'pat@comms-test.invented.co.uk', slot, go: 'zoom-book' })).status, 400);
    // Not to anyone: only one of their contacts with an address.
    assert.equal((await send('u-cm-sales', { via: 'zoom', zoom_to: 'someone@elsewhere.invented.co.uk', go: 'zoom-now' })).status, 400);
    // Now: the call is made at once and the host's page opens.
    const go = await send('u-cm-sales', { via: 'zoom', zoom_to: 'pat@comms-test.invented.co.uk', go: 'zoom-now' });
    assert.match(go.location ?? '', /^\/staff\/calendar\/[A-Za-z0-9-]+\/video$/);
    // When the host first opens a call that has its meeting, it is marked started, and the conversation says so.
    const id = (go.location ?? '').split('/')[3] ?? '';
    made.app.db.run("INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, client_token, created_at) VALUES (?, ?, 'zoom', '123456789', 'https://zoom.us/j/123456789', ?, ?)", [randomUUID(), id, 'a'.repeat(64), now]);
    await req('u-cm-sales', `/staff/calendar/${id}/video`);
    const opened = made.app.db.get<{ host_opened_by: string | null }>('SELECT host_opened_by FROM video_meetings WHERE booking_id = ?', [id])!;
    assert.equal(opened.host_opened_by, 'u-cm-sales');
    assert.match(flow((await req('u-cm-sales', '/staff/clients/b-cm?chat=all')).body), /Zoom call started by Sam Sales/);
  });

  test('the view-only login may not read a client\u2019s messages (as before): no Communication, no form, and a post is refused', async () => {
    const page = (await req('u-cm-ro', '/staff/clients/b-cm?chat=all')).body;
    assert.equal(flow(page), '');
    assert.doesNotMatch(page, /chatbtn|action="\/staff\/clients\/b-cm\/communicate"/);
    assert.notEqual((await send('u-cm-ro', { via: 'portal', body: 'x', go: 'send' })).location, '/staff/clients/b-cm?chat=all&done=sent-portal#chat');
    // Not even a call log: every way of writing is asked of the login first.
    const calls = made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM call_logs')!.n;
    assert.equal((await send('u-cm-ro', { via: 'call', call_contact_id: 'c-cm-pat', outcome: 'SPOKE', notes: 'x', go: 'call' })).status, 400);
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM call_logs')!.n, calls, 'the view-only login logged a call');
  });
});
