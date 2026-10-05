/**
 * PHASE 156c, 5 October 2026 — WHATSAPP BY MANUAL UPLOAD: A CHAT EXPORTED ON THE PHONE, ADDED TO THE CLIENT'S RECORD.
 *
 * Every export here is INVENTED. The iPhone layout copies, quirk for quirk, what a real export's 5 October test lines
 * showed (read with every word masked, used with consent; that file is never committed): CRLF between messages and a
 * bare LF inside one; a U+200E mark before a file line and before WhatsApp's own words; a document written as
 * "name • 1 page <attached: …>"; "You deleted this message." and "This message was deleted."; an edit marked
 * "<This message was edited>"; an empty message; a view-once notice whose wording contains "added".
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { parseChat } from '../src/connectors/whatsapp-export.ts';
import { safeEntryName, fileKind } from '../src/web/whatsapp-import.ts';
import { unreadWhatsApp } from '../src/web/messages.ts';
import { windowOpenUntil } from '../src/web/whatsapp.ts';

const L = '\u200e';
/** An iPhone export's text, invented, with every quirk the real one showed. */
function iphoneChat(extra: string[] = []): string {
  const rec = [
    `[05/10/2026, 08:35:16] Ada: Hi, is WhatsApp ok for quick questions?`,
    `[05/10/2026, 08:41:44] Lakhbir Invented: Yes of course`,
    `[05/10/2026, 13:36:34] Lakhbir Invented: Here is the list\nline two of the same message`,
    `[05/10/2026, 13:36:36] Ada:`,
    `${L}[05/10/2026, 13:36:43] Ada: ${L}<attached: 00000001-PHOTO-2026-10-05-13-36-43.jpg>`,
    `[05/10/2026, 13:36:48] Ada: ${L}You deleted this message.`,
    `${L}[05/10/2026, 13:37:04] Lakhbir Invented: Plant room.docx • ${L}1 page ${L}<attached: 00000002-Plant room.docx>`,
    `[05/10/2026, 13:38:01] Lakhbir Invented: The boiler is in the basement ${L}<This message was edited>`,
    `[05/10/2026, 13:39:17] Ada: ${L}This message was deleted.`,
    `[05/10/2026, 13:39:20] Ada: ${L}You received a view once message. For added privacy, you can only open it on your phone.`,
    `[05/10/2026, 13:39:25] Ada: I added the photos you asked for`,
    `${L}[05/10/2026, 13:40:00] Ada: ${L}<attached: 00000003-Ada Invented.vcf>`,
    ...extra,
  ];
  return `[01/10/2026, 09:00:00] Ada: ${L}Messages and calls are end-to-end encrypted. Only people in this chat can read them.\r\n` + rec.join('\r\n') + '\r\n';
}

/** A zip of the given files: deflated (the chat) or stored (the rest). Enough for the server's reader and a browser's. */
function zipOf(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const deflate = name.endsWith('.txt');
    const body = deflate ? deflateRawSync(data) : data;
    const n = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, body); centrals.push(ch, n); off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const DOCX = Buffer.from('PK\u0003\u0004 invented docx bytes');
const VCF = Buffer.from('BEGIN:VCARD\nFN:Ada Invented\nEND:VCARD');
const EXPORT = (chat = iphoneChat()) => zipOf({ '_chat.txt': Buffer.from(chat, 'utf8'), '00000001-PHOTO-2026-10-05-13-36-43.jpg': JPG, '00000002-Plant room.docx': DOCX, '00000003-Ada Invented.vcf': VCF });

describe('156c B1 · the reader: the iPhone layout, quirk for quirk', () => {
  const p = parseChat(iphoneChat());
  test('the layout, the two names, and WhatsApp\u2019s own notice skipped', () => {
    assert.equal(p.layout, 'iphone');
    assert.deepEqual(p.senders, ['Ada', 'Lakhbir Invented']);
    assert.equal(p.notices, 1);
  });
  test('an empty message is skipped; a message over two lines stays one message', () => {
    assert.equal(p.messages.some((m) => m.local === '05/10/2026 13:36:36'), false);
    assert.equal(p.messages.find((m) => m.local === '05/10/2026 13:36:34')?.text, 'Here is the list\nline two of the same message');
  });
  test('files: a photo, a document with its "• 1 page" caption, a contact card', () => {
    const files = p.messages.filter((m) => m.attachment !== null);
    assert.deepEqual(files.map((m) => m.attachment), ['00000001-PHOTO-2026-10-05-13-36-43.jpg', '00000002-Plant room.docx', '00000003-Ada Invented.vcf']);
    assert.equal(files[1]?.text, 'Plant room.docx • 1 page');
  });
  test('deleted (both wordings) kept as written; an edit marked and its tag removed', () => {
    assert.deepEqual(p.messages.filter((m) => m.deleted).map((m) => m.text), ['You deleted this message.', 'This message was deleted.']);
    const e = p.messages.find((m) => m.edited);
    assert.equal(e?.text, 'The boiler is in the basement');
  });
  test('a view-once notice is shown as one, and a person\u2019s words with "added" in them are kept (the 212 lost on 5 Oct)', () => {
    assert.ok(p.messages.some((m) => m.text.startsWith('A view-once message')));
    assert.ok(p.messages.some((m) => m.text === 'I added the photos you asked for'));
  });
  test('UK local time to the exact moment (summer time: 08:35 is 07:35 UTC); read day first, and since no day here is after the 12th, the check is warned', () => {
    assert.equal(p.messages[0]?.at, '2026-10-05T07:35:16.000Z');
    assert.equal(p.dates_could_be_month_first, true);
    assert.equal(parseChat('[13/10/2026, 10:00:00] Ada: hi').dates_could_be_month_first, false);
  });
});

describe('156c B1 · the reader: Android, and the edges', () => {
  test('Android: "date, time - Name: text", a file with a caption on the next line, <Media omitted>, a notice line, 12-hour time', () => {
    const p = parseChat([
      '05/10/2026, 13:36 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
      '05/10/2026, 13:36 - Ada: Morning',
      '05/10/2026, 13:37 - Lakhbir Invented: IMG-20261005-WA0003.jpg (file attached)',
      'The boiler plate',
      '05/10/2026, 13:38 - Ada: <Media omitted>',
      '05/10/2026, 1:39 pm - Ada: Thanks <This message was edited>',
    ].join('\n'));
    assert.equal(p.layout, 'android');
    assert.equal(p.notices, 1);
    assert.equal(p.messages.length, 4);
    assert.equal(p.messages[1]?.attachment, 'IMG-20261005-WA0003.jpg');
    assert.equal(p.messages[1]?.text, 'The boiler plate');
    assert.equal(p.messages[2]?.omitted, true);
    assert.equal(p.messages[3]?.edited, true);
    assert.equal(p.messages[3]?.at, '2026-10-05T12:39:00.000Z');
  });
  test('no day above the 12th: the dates could be month first, and the check says so', () => {
    assert.equal(parseChat('[05/09/2026, 10:00:00] Ada: hi\r\n[06/09/2026, 10:00:00] Lakhbir Invented: hi').dates_could_be_month_first, true);
  });
  test('the clock change: the hour that repeats gives the earlier moment; the hour that never happens moves on', () => {
    assert.equal(parseChat('[25/10/2026, 01:30:00] Ada: back').messages[0]?.at, '2026-10-25T00:30:00.000Z');
    assert.equal(parseChat('[29/03/2026, 01:30:00] Ada: forward').messages[0]?.at, '2026-03-29T01:30:00.000Z');
  });
  test('not a WhatsApp export: no messages', () => {
    assert.equal(parseChat('Dear Sir,\nPlease find attached.').messages.length, 0);
  });
  test('file names: no climbing out, no absolute path; the kinds we keep', () => {
    for (const bad of ['../x.jpg', 'a/../../x.jpg', '/etc/x', 'C:\\x.jpg', '']) assert.equal(safeEntryName(bad), false, bad);
    assert.equal(safeEntryName('00000001-PHOTO-2026-10-05-13-36-43.jpg'), true);
    assert.equal(fileKind('x.JPG')?.type, 'image');
    assert.equal(fileKind('x.vcf'), null);
    assert.equal(fileKind('x.opus')?.type, 'audio');
  });
});

/* ================================================================== *
 * THE FLOW, THROUGH THE WEBSITE.
 * ================================================================== */
const T = '2026-10-05T12:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let tick = Date.parse('2026-10-05T14:00:00.000Z');
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-156c-')), sealKey: randomBytes(32), now: () => new Date(tick++).toISOString() });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-156c', 'wa156c@example.invalid', 'wa156c@example.invalid', 'Sam Sales', 'SALES', hash, T, T]);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-156c', 'Export Dental Limited', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  db.run('INSERT INTO contacts (id, business_id, full_name, phone, email, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)',
    ['c-156c', 'b-156c', 'Ada Invented', '07700 900123', null, T]);
});
after(() => made.close());

let cookie = '';
async function req(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  return { status: r.status, body: await r.text(), location: r.headers.get('location'), csp: r.headers.get('content-security-policy') ?? '', type: r.headers.get('content-type') ?? '' };
}
const post = (path: string, f: Record<string, string>, headers: Record<string, string> = {}) =>
  req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(f).toString() });
function multipart(fields: Record<string, string>, files: Record<string, { name: string; bytes: Buffer }>): { body: Buffer; type: string } {
  const b = `----cb156c${randomBytes(6).toString('hex')}`; const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const [k, f] of Object.entries(files)) parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.bytes, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${b}` };
}
const upload = (fields: Record<string, string>, files: Record<string, { name: string; bytes: Buffer }>, path = '/staff/clients/b-156c/whatsapp/import', headers: Record<string, string> = {}) => {
  const m = multipart(fields, files);
  return req(path, { method: 'POST', headers: { 'content-type': m.type, ...headers }, body: m.body });
};
const salesActor = () => ({ id: 'u-156c', role: 'SALES' as const, business_id: null });
const rows = () => made.app.db.all<{ direction: string; kind: string; body: string; created_at: string; status: string }>(
  "SELECT direction, kind, body, created_at, status FROM whatsapp_messages WHERE business_id = 'b-156c' ORDER BY created_at, id");

describe('156c · the WhatsApp page, with the live connection off', () => {
  test('signed in', async () => { const r = await post('/login', { email: 'wa156c@example.invalid', password: PASSWORD }); assert.equal(r.status, 303); });
  test('B5: no reply box and no opening message; "reply on the phone"; the add-a-chat form; its script and a policy that allows only our own', async () => {
    const r = await req('/staff/clients/b-156c/whatsapp');
    assert.equal(r.status, 200);
    assert.doesNotMatch(r.body, /Send our opening message/);
    assert.doesNotMatch(r.body, /name="body"/);
    assert.match(r.body, /Reply to Ada on the WhatsApp phone/);
    assert.match(r.body, /Add a WhatsApp chat/);
    assert.match(r.body, /action="\/staff\/clients\/b-156c\/whatsapp\/import" enctype="multipart\/form-data"/);
    assert.match(r.body, /<script src="\/assets\/whatsapp-import\.js" defer><\/script>/);
    assert.match(r.csp, /script-src 'self'; connect-src 'self'/);
    assert.doesNotMatch(r.csp, /unsafe-inline/);
    const js = await req('/assets/whatsapp-import.js');
    assert.equal(js.status, 200);
    assert.doesNotMatch(js.body, /innerHTML/);
  });
});

describe('156c · upload, check, save', () => {
  let iid = '';
  test('B2: a small .zip comes through whole; nothing is added yet; the check page follows', async () => {
    const r = await upload({ contact_id: 'c-156c' }, { export: { name: 'WhatsApp Chat - Ada.zip', bytes: EXPORT() } });
    assert.equal(r.status, 303, r.body.slice(0, 400));
    iid = /\/import\/([0-9a-f-]{36})$/.exec(r.location ?? '')?.[1] ?? '';
    assert.notEqual(iid, '');
    assert.equal(rows().length, 0, 'saved before anyone checked it');
  });
  test('B3: the check — counts, names, our side guessed from the client\u2019s name, the contact who did not tick the box, the file we do not keep', async () => {
    const r = await req(`/staff/clients/b-156c/whatsapp/import/${iid}`);
    assert.equal(r.status, 200);
    assert.match(r.body, /Check the WhatsApp chat/);
    assert.match(r.body, /11 messages, 05\/10\/2026 08:35:16 to 05\/10\/2026 13:40:00/);
    assert.match(r.body, /Ada and Lakhbir Invented/);
    assert.match(r.body, /value="Lakhbir Invented" checked/);
    assert.match(r.body, /did not tick the WhatsApp box/);
    assert.match(r.body, /11 messages will be added/);
    assert.match(r.body, /1 file is of a kind we do not keep/);
    assert.match(r.body, /Check the dates/);
  });
  test('B4: saved — the right direction, the message\u2019s own time, files from the kept .zip (not the contact card)', async () => {
    const r = await post(`/staff/clients/b-156c/whatsapp/import/${iid}`, { us: 'Lakhbir Invented', from: '2026-10-05' });
    assert.equal(r.status, 303);
    assert.match(r.location ?? '', /\/whatsapp\?done=whatsapp-import-saved$/);
    const m = rows();
    assert.equal(m.length, 11);
    assert.deepEqual([m[0]?.direction, m[0]?.status, m[0]?.created_at], ['IN', 'RECEIVED', '2026-10-05T07:35:16.000Z']);
    assert.deepEqual([m[1]?.direction, m[1]?.status], ['OUT', 'SENT']);
    assert.ok(m.some((x) => x.body === 'The boiler is in the basement (edited)'));
    const media = made.app.db.all<{ filename: string; media_type: string }>('SELECT filename, media_type FROM whatsapp_media ORDER BY filename');
    assert.deepEqual(media, [{ filename: '00000001-PHOTO-2026-10-05-13-36-43.jpg', media_type: 'image' }, { filename: '00000002-Plant room.docx', media_type: 'document' }]);
  });
  test('the page shows them "From the phone", the photo can be opened, and our side is named "on the phone"', async () => {
    const r = await req('/staff/clients/b-156c/whatsapp');
    assert.match(r.body, /From the phone/);
    assert.match(r.body, /Lakhbir Invented \(on the phone\)/);
    assert.match(r.body, /Open the photo/);
    assert.match(r.body, /Chats added/);
  });
  test('history is not "new": no red dot, and WhatsApp\u2019s 24-hour window stays shut', () => {
    assert.equal(unreadWhatsApp(made.app.db, salesActor() as never, 'b-156c'), 0);
    assert.equal(windowOpenUntil(made.app.db, '447700900123', made.app.now()), null);
  });
  test('a newer copy of the same chat adds only what is new', async () => {
    const r = await upload({ contact_id: 'c-156c' }, { export: { name: 'again.zip', bytes: EXPORT(iphoneChat(['[05/10/2026, 15:00:00] Ada: One more thing'])) } });
    const id2 = /\/import\/([0-9a-f-]{36})$/.exec(r.location ?? '')?.[1] ?? '';
    const c = await req(`/staff/clients/b-156c/whatsapp/import/${id2}`);
    assert.match(c.body, /1 message will be added<\/strong>, and 11 are on the record already/);
    await post(`/staff/clients/b-156c/whatsapp/import/${id2}`, { us: 'Lakhbir Invented', from: '2026-10-05' });
    assert.equal(rows().length, 12);
  });
});

describe('156c · the big export: the browser sends the words, then each file', () => {
  test('the chat\u2019s text and the names; then the date kept; then only the waiting files, one at a time', async () => {
    const chat = iphoneChat().replace(/05\/10\/2026, 08:35:16/, '20/09/2026, 08:35:16');
    const names = ['_chat.txt', '00000001-PHOTO-2026-10-05-13-36-43.jpg', '00000002-Plant room.docx', '00000003-Ada Invented.vcf'].join('\n');
    // A second contact, so this chat is new to the record.
    made.app.db.run('INSERT INTO contacts (id, business_id, full_name, phone, email, contact_consent, marketing_optin, whatsapp_optin, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, 1, ?)',
      ['c-156c-2', 'b-156c', 'Ada Second', '07700 900456', null, T]);
    const r = await upload({ contact_id: 'c-156c-2', filename: 'WhatsApp Chat - Ada.zip' }, { chat: { name: 'chat.txt', bytes: Buffer.from(chat) }, names: { name: 'names.txt', bytes: Buffer.from(names) } });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    const iid = /\/import\/([0-9a-f-]{36})$/.exec(r.location ?? '')?.[1] ?? '';
    const c = await req(`/staff/clients/b-156c/whatsapp/import/${iid}?us=Lakhbir+Invented&from=2026-10-05`);
    assert.match(c.body, /10 messages will be added/, 'the 20 September message is before the date kept');
    const s = await post(`/staff/clients/b-156c/whatsapp/import/${iid}`, { us: 'Lakhbir Invented', from: '2026-10-05' });
    assert.match(s.location ?? '', /\/import\/[0-9a-f-]{36}\?done=saved$/);
    const page = await req(`/staff/clients/b-156c/whatsapp/import/${iid}`);
    assert.match(page.body, /Add the photos and files/);
    assert.match(page.body, /data-waiting="\/staff\/clients\/b-156c\/whatsapp\/import\/[0-9a-f-]{36}\/waiting"/);
    const w = await req(`/staff/clients/b-156c/whatsapp/import/${iid}/waiting`, { headers: { accept: 'application/json' } });
    assert.deepEqual(JSON.parse(w.body).waiting, ['00000001-PHOTO-2026-10-05-13-36-43.jpg', '00000002-Plant room.docx']);
    const ok = await upload({ name: '00000001-PHOTO-2026-10-05-13-36-43.jpg' }, { file: { name: '00000001-PHOTO-2026-10-05-13-36-43.jpg', bytes: JPG } }, `/staff/clients/b-156c/whatsapp/import/${iid}/file`, { accept: 'application/json' });
    assert.equal(ok.status, 200);
    assert.deepEqual(JSON.parse(ok.body), { ok: true, words: 'Added.' });
    const no = await upload({ name: 'something-else.jpg' }, { file: { name: 'something-else.jpg', bytes: JPG } }, `/staff/clients/b-156c/whatsapp/import/${iid}/file`, { accept: 'application/json' });
    assert.equal(no.status, 400);
    const card = await upload({ name: '00000003-Ada Invented.vcf' }, { file: { name: '00000003-Ada Invented.vcf', bytes: VCF } }, `/staff/clients/b-156c/whatsapp/import/${iid}/file`, { accept: 'application/json' });
    assert.equal(card.status, 400, 'a contact card is not a kind we keep');
    const w2 = await req(`/staff/clients/b-156c/whatsapp/import/${iid}/waiting`);
    assert.deepEqual(JSON.parse(w2.body).waiting, ['00000002-Plant room.docx']);
  });
});

describe('156c · refusals', () => {
  test('a group chat (three names) is refused, and nothing is kept', async () => {
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM whatsapp_imports')!.n;
    const r = await upload({ contact_id: 'c-156c' }, { export: { name: 'group.txt', bytes: Buffer.from(iphoneChat(['[05/10/2026, 16:00:00] Third Person: hello'])) } });
    assert.match(r.body, /Only one-to-one chats can be added for now/);
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM whatsapp_imports')!.n, before);
  });
  test('not a WhatsApp chat; a zip with no chat; a name that climbs out; a zip inside the zip', async () => {
    assert.match((await upload({ contact_id: 'c-156c' }, { export: { name: 'letter.txt', bytes: Buffer.from('Dear Sir,\nPlease find attached.') } })).body, /not a WhatsApp chat we can read/);
    assert.match((await upload({ contact_id: 'c-156c' }, { export: { name: 'x.zip', bytes: zipOf({ 'photo.jpg': JPG }) } })).body, /no WhatsApp chat in it/);
    assert.match((await upload({ contact_id: 'c-156c' }, { export: { name: 'x.zip', bytes: zipOf({ '_chat.txt': Buffer.from(iphoneChat()), '../evil.jpg': JPG }) } })).body, /a name we do not accept/);
    assert.match((await upload({ contact_id: 'c-156c' }, { export: { name: 'x.zip', bytes: zipOf({ '_chat.txt': Buffer.from(iphoneChat()), 'inner.zip': JPG }) } })).body, /another \.zip inside it/);
  });
  test('a contact of another company, or none, is refused', async () => {
    assert.match((await upload({ contact_id: 'nobody' }, { export: { name: 'x.txt', bytes: Buffer.from(iphoneChat()) } })).body, /Choose which of this company/);
  });
  test('cancel: nothing added, and it cannot then be saved', async () => {
    const before = rows().length;
    const r = await upload({ contact_id: 'c-156c' }, { export: { name: 'x.txt', bytes: Buffer.from(iphoneChat(['[05/10/2026, 17:00:00] Ada: Cancel me'])) } });
    const iid = /\/import\/([0-9a-f-]{36})$/.exec(r.location ?? '')?.[1] ?? '';
    const c = await post(`/staff/clients/b-156c/whatsapp/import/${iid}`, { cancel: '1' });
    assert.match(c.location ?? '', /done=whatsapp-import-cancelled/);
    assert.match((await post(`/staff/clients/b-156c/whatsapp/import/${iid}`, { us: 'Ada', from: '2026-10-05' })).body, /cancelled/);
    assert.equal(rows().length, before);
  });
});

/* ================================================================== *
 * THE PAGE'S SCRIPT, RUN IN A STAND-IN BROWSER (node:vm with Node's own Blob, File, FormData, DecompressionStream).
 * ================================================================== */
import { runInNewContext } from 'node:vm';
import { WHATSAPP_IMPORT_JS } from '../src/web/whatsapp-import-script.ts';

function fakePage(els: Record<string, Record<string, unknown>>, fetchImpl: (url: string, init?: RequestInit) => Promise<unknown>) {
  const handlers: Record<string, (ev: { preventDefault: () => void }) => void> = {};
  const done: { assigned?: string; reloaded?: boolean } = {};
  for (const [id, el] of Object.entries(els)) {
    el['addEventListener'] = (_: string, fn: (ev: { preventDefault: () => void }) => void) => { handlers[id] = fn; };
    el['getAttribute'] = (k: string) => (el['attrs'] as Record<string, string> | undefined)?.[k] ?? null;
  }
  const ctx = {
    document: { getElementById: (id: string) => els[id] ?? null, open() {}, write() {}, close() {} },
    location: { assign: (u: string) => { done.assigned = u; }, reload: () => { done.reloaded = true; } },
    fetch: fetchImpl, FormData, Blob, File, Response, TextDecoder, DataView, DecompressionStream, Promise, setTimeout: (f: () => void) => f(),
    Math, Error, JSON,
  };
  runInNewContext(WHATSAPP_IMPORT_JS, ctx);
  return { handlers, done };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('156c · the page’s script (a big export opened on the computer)', () => {
  // Over 3.5 MB, so the page opens it here; and its video over 4.4 MB, so that one file is left for adding by hand.
  const big = Buffer.alloc(4_700_000, 7);
  const zip = zipOf({ '_chat.txt': Buffer.from(iphoneChat(), 'utf8'), '00000001-PHOTO-2026-10-05-13-36-43.jpg': JPG, '00000002-Plant room.docx': DOCX, '00000009-VIDEO.mp4': big });
  const file = new File([new Uint8Array(zip)], 'WhatsApp Chat - Ada.zip');

  test('step 1: only the chat’s words and the list of names are sent, never the files', async () => {
    let sent: FormData | undefined;
    const { handlers, done } = fakePage(
      { 'wa-import': { action: '/staff/clients/b/whatsapp/import', querySelector: () => ({ value: 'c-1' }) }, 'wa-imp-file': { files: [file] }, 'wa-imp-note': {} },
      async (_u, init) => { sent = init?.body as FormData; return { redirected: true, url: '/staff/clients/b/whatsapp/import/x' }; });
    let prevented = false;
    handlers['wa-import']!({ preventDefault: () => { prevented = true; } });
    for (let i = 0; i < 40 && done.assigned === undefined; i++) await settle();
    assert.equal(prevented, true, 'a big .zip went up whole');
    assert.equal(done.assigned, '/staff/clients/b/whatsapp/import/x');
    assert.equal(sent?.get('contact_id'), 'c-1');
    assert.equal(await (sent?.get('chat') as Blob).text(), iphoneChat());
    assert.deepEqual((await (sent?.get('names') as Blob).text()).split('\n'), ['_chat.txt', '00000001-PHOTO-2026-10-05-13-36-43.jpg', '00000002-Plant room.docx', '00000009-VIDEO.mp4']);
    assert.equal(sent?.get('export'), null);
  });

  test('step 3: only the files the server is waiting for, one at a time; one over 4.4 MB is left for adding by hand', async () => {
    const posted: string[] = [];
    const { handlers, done } = fakePage(
      { 'wa-files': { attrs: { 'data-waiting': '/w', 'data-file': '/f' } }, 'wa-files-form': {}, 'wa-files-zip': { files: [file] }, 'wa-files-note': {} },
      async (u, init) => {
        if (u === '/w') return { json: async () => ({ waiting: ['00000001-PHOTO-2026-10-05-13-36-43.jpg', '00000009-VIDEO.mp4'] }) };
        const fd = init?.body as FormData;
        posted.push(String(fd.get('name')));
        assert.deepEqual(Buffer.from(await (fd.get('file') as Blob).arrayBuffer()), JPG);
        return { ok: true };
      });
    handlers['wa-files-form']!({ preventDefault: () => {} });
    for (let i = 0; i < 40 && done.reloaded !== true; i++) await settle();
    assert.deepEqual(posted, ['00000001-PHOTO-2026-10-05-13-36-43.jpg'], 'the document was not waiting, and the video is too big for one request');
    assert.equal(done.reloaded, true);
  });
});
