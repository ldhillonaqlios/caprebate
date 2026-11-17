/**
 * PHASE 161n1c, 17 NOVEMBER 2026 — UPLOADS AND PUBLIC FORMS, FROM ITRoadway'S SECOND CODE REVIEW (12 Nov 2026).
 *
 *   1  M-01  the zip reader is capped: a zip made to unpack to hundreds of megabytes is refused fast and small
 *   2  M-08  the five-minute timer clears the documents' holding place of anything past its hour
 *   3  M-03  macros in Word or Excel files, and scripts in PDFs, are refused in plain words; the scanner's hook, off
 *   4  M-04  the public forms are limited from one network address; the hidden field; the thank-you email cap;
 *            the security check required on the live website
 *   5  L-10  money and irreversible actions, and the export, need a single-use token; the export is a POST
 *
 * The review's zip is not committed: it is built here, in memory. Every person, business and file here is invented.
 */
/* This file signs in with a password only, so it builds the application with twoFactor: 'off'. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

import { createApp } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { runTimerJob } from '../../src/app/timers.ts';
import { ZIP_ENTRY_MAX_BYTES, ZipEntryTooLarge, readZipEntryFromBuffer } from '../../src/shared/zip.ts';
import { startImport, IMPORT_MAX_TEXT } from '../../src/modules/crm/whatsapp-import.ts';
import { ACTIVE_CONTENT_REFUSED, activeContent } from '../../src/modules/claims/documents/upload-handler.ts';
import { sweepHoldingPlace } from '../../src/modules/claims/uploads.ts';
import { SCAN_REFUSED, UPLOAD_SCANNING, uploadScannerFor, type UploadScanner } from '../../src/integrations/connectors/upload-scanner.ts';
import { CONNECTIONS } from '../../src/modules/admin/connections.ts';
import { ASSESSMENT_SOURCE_LIMIT, ENQUIRY_SOURCE_LIMIT, FROM_ONE_PLACE, SIGNUP_SOURCE_LIMIT } from '../../src/core/auth.ts';
import { ENQUIRY_THANKS_PER_HOUR, receiveEnquiry } from '../../src/modules/public-site/enquiries.ts';
import { CHECK_REQUIRED } from '../../src/modules/public-site/routes.ts';
import { isSensitive } from '../../src/core/form-token.ts';

const NOW = '2026-11-17T10:00:00.000Z';

/* ------------------------------------------------------------------ a zip, made here */

/** One entry, deflated (or stored), with the sizes its headers declare: by default the true ones. */
function zipOf(name: string, data: Buffer, opts: { declared?: number; store?: boolean } = {}): Buffer {
  const body = opts.store === true ? data : deflateRawSync(data);
  const method = opts.store === true ? 0 : 8;
  const declared = opts.declared ?? data.length;
  const n = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
  local.writeUInt32LE(body.length, 18); local.writeUInt32LE(declared, 22); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
  central.writeUInt32LE(body.length, 20); central.writeUInt32LE(declared, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + n.length + body.length;
  const cd = Buffer.concat([central, n]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, n, body, cd, end]);
}

/** Several entries. */
function zipOfMany(entries: readonly { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const body = deflateRawSync(e.data); const n = Buffer.from(e.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(e.data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, body); centrals.push(central, n);
    offset += local.length + n.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const CONTENT_TYPES = (main: string) => Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="${main}"/></Types>`);
const DOCX_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const DOCM_MAIN = 'application/vnd.ms-word.document.macroEnabled.main+xml';
const pdf = (body: string) => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog ${body} >> endobj\n%%EOF\n`, 'latin1');

/* ================================================================== 1. M-01 */

describe('161n1c · 1 · M-01: the zip reader is capped', () => {
  test('a zip like the review\'s (a few hundred KB that unpacks to 300 MB) is refused at once, without unpacking it', () => {
    const bomb = zipOf('WhatsApp Chat.txt', Buffer.alloc(300 * 1024 * 1024));
    assert.ok(bomb.length < 400 * 1024, `the zip is ${String(bomb.length)} bytes`);
    const before = process.memoryUsage().arrayBuffers;
    const t = Date.now();
    assert.throws(() => readZipEntryFromBuffer(bomb, ['WhatsApp Chat.txt']), ZipEntryTooLarge);
    assert.ok(Date.now() - t < 500, 'refused fast');
    assert.ok(process.memoryUsage().arrayBuffers - before < 5 * 1024 * 1024, 'and small: nothing was unpacked');
  });

  test('a zip whose header lies about its size is stopped by the cap on the unpacking itself', () => {
    const liar = zipOf('chat.txt', Buffer.alloc(40 * 1024 * 1024), { declared: 1000 });
    assert.throws(() => readZipEntryFromBuffer(liar, ['chat.txt'], 1024 * 1024), (e) => e instanceof ZipEntryTooLarge && /more than the 1048576 bytes/.test(e.message));
    const stored = zipOf('chat.txt', Buffer.alloc(2 * 1024 * 1024, 0x61), { store: true });
    assert.throws(() => readZipEntryFromBuffer(stored, ['chat.txt'], 1024 * 1024), ZipEntryTooLarge, 'a stored entry too');
  });

  test('an ordinary entry still reads; the default cap is 25 MB; a ratio over 100 is refused', () => {
    const ok = zipOf('chat.txt', Buffer.from('[17/11/2026, 10:00:00] Pat: Hello\n'.repeat(200)));
    assert.match(readZipEntryFromBuffer(ok, ['chat.txt']).toString('utf8'), /Pat: Hello/);
    assert.equal(ZIP_ENTRY_MAX_BYTES, 25 * 1024 * 1024);
    assert.throws(() => readZipEntryFromBuffer(zipOf('x.txt', Buffer.alloc(2 * 1024 * 1024)), ['x.txt']), /more than 100 times its size/);
  });

  test('the WhatsApp import refuses such a chat in words, before any of it is kept', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1c-')), now: () => NOW, sealKey: randomBytes(32) });
    try {
      const db = made.app.db;
      db.run('INSERT INTO businesses (id,name,sector,stage,created_at,contact_email) VALUES (?,?,?,?,?,?)', ['b-wa', 'Chat Test Limited', 'dental', 'ASSESSMENT_SUBMITTED', NOW, 'office@chat-test.invented.co.uk']);
      db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-wa-pat', 'b-wa', 'Pat Owner', 1, 0, ?, 'pat@chat-test.invented.co.uk', '07700 900777')", [NOW]);
      const r = await startImport(made.app, made.store, { id: 'u-x', role: 'ADMIN', business_id: null, disabled: false }, 'b-wa',
        { contact_id: 'c-wa-pat', filename: 'WhatsApp Chat - Pat.zip', whole: zipOf('WhatsApp Chat - Pat.txt', Buffer.alloc(IMPORT_MAX_TEXT + 1024 * 1024, 0x61), { declared: 100 }), chat: null } as never);
      assert.deepEqual(r, { ok: false, why: 'That chat is too long to add here.' });
    } finally { made.close(); }
  });
});

/* ================================================================== 2. M-08 */

describe('161n1c · 2 · M-08: the holding place is swept by the five-minute timer', () => {
  test('an upload left there 61 minutes is deleted, written down, and the run is flagged; one of 59 minutes stays', async () => {
    let now = Date.now();
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1c-q-')), now: () => new Date(now).toISOString(), sealKey: randomBytes(32) });
    try {
      await made.store.putClientBytes('quarantine/doc-left-behind', new Uint8Array(Buffer.from('%PDF-1.4 invented\n%%EOF\n')));
      now += 59 * 60_000;
      const early = await runTimerJob({ app: made.app, store: made.store }, 'every-five-minutes', {});
      assert.match(early.line, /holding place cleared: 0/);
      assert.ok((await made.store.listObjects()).some((o) => o.key === 'quarantine/doc-left-behind'), 'not yet');
      now += 2 * 60_000;
      const r = await runTimerJob({ app: made.app, store: made.store }, 'every-five-minutes', {});
      assert.match(r.line, /holding place cleared: 1/);
      assert.equal(r.ok, false, 'one found means an upload went wrong, so the run is flagged');
      assert.ok(!(await made.store.listObjects()).some((o) => o.key.startsWith('quarantine/')), 'gone');
      const row = made.app.db.get<{ object_id: string; detail: string }>("SELECT object_id, detail FROM audit_log WHERE kind = 'QUARANTINE_SWEPT'");
      assert.equal(row?.object_id, 'doc-left-behind');
      assert.match(row?.detail ?? '', /"held_minutes":6[01]/);
      const again = await runTimerJob({ app: made.app, store: made.store }, 'every-five-minutes', {});
      assert.match(again.line, /holding place cleared: 0/);
    } finally { made.close(); }
  });

  test('only the holding place: a kept document elsewhere in the store is never touched', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1c-k-')), now: () => new Date(Date.now() + 5 * 60 * 60_000).toISOString(), sealKey: randomBytes(32) });
    try {
      await made.store.putText('documents/kept-doc.retained.json', '{}');
      const r = await sweepHoldingPlace({ store: made.store, now: made.app.now, audit: made.app.audit }, 'test');
      assert.deepEqual(r, { found: 0, cleared: 0, left: 0 });
      assert.ok((await made.store.listObjects()).some((o) => o.key === 'documents/kept-doc.retained.json'));
    } finally { made.close(); }
  });
});

/* ================================================================== 3. M-03 */

describe('161n1c · 3 · M-03: macros and scripts are refused; the scanner\'s hook is there and off', () => {
  test('what is found, and what is not', () => {
    const docx = zipOfMany([{ name: '[Content_Types].xml', data: CONTENT_TYPES(DOCX_MAIN) }, { name: 'word/document.xml', data: Buffer.from('<w:document/>') }]);
    assert.equal(activeContent(docx), null, 'an ordinary Word file');
    assert.equal(activeContent(zipOfMany([{ name: '[Content_Types].xml', data: CONTENT_TYPES(DOCX_MAIN) }, { name: 'word/vbaProject.bin', data: Buffer.from('VBA') }])), 'MACRO');
    assert.equal(activeContent(zipOfMany([{ name: '[Content_Types].xml', data: CONTENT_TYPES(DOCM_MAIN) }])), 'MACRO', 'a macro-enabled type named');
    assert.equal(activeContent(zipOfMany([{ name: 'xl/macrosheets/sheet1.xml', data: Buffer.from('<x/>') }])), 'MACRO', 'an Excel 4.0 macro sheet');
    assert.equal(activeContent(pdf('/Pages 2 0 R')), null, 'an ordinary PDF');
    assert.equal(activeContent(pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>')), 'PDF_SCRIPT');
    assert.equal(activeContent(pdf('/OpenAction << /S /J#61vaScript >>')), 'PDF_SCRIPT', 'a name written with #xx escapes');
    assert.equal(activeContent(pdf('/OpenAction << /S /Launch /F (cmd.exe) >>')), 'PDF_SCRIPT');
    assert.equal(activeContent(pdf('/Names << /EmbeddedFiles 3 0 R >>')), 'PDF_SCRIPT');
    assert.equal(activeContent(pdf('/BaseFont /JSans-Bold')), null, 'a font whose name starts JS is not a script');
    assert.equal(activeContent(new Uint8Array(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))), null, 'a picture');
  });

  test('a client\'s macro Word file and scripted PDF are refused with a plain message, nothing is stored, and the audit says which', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      const before = b.docs();
      for (const [file, name, words, what] of [
        [zipOfMany([{ name: '[Content_Types].xml', data: CONTENT_TYPES(DOCX_MAIN) }, { name: 'word/vbaProject.bin', data: Buffer.from('VBA') }]), 'lease.docm', ACTIVE_CONTENT_REFUSED.MACRO, 'MACRO'],
        [pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), 'lease.pdf', ACTIVE_CONTENT_REFUSED.PDF_SCRIPT, 'PDF_SCRIPT'],
      ] as const) {
        const r = await c.upload(file, name);
        assert.notEqual(r.status, 303, `${what}: it was taken`);
        assert.ok(r.body.includes(words.slice(0, 40)), `${what}: ${r.body.slice(0, 300)}`);
        assert.ok(b.refusals().includes(what), `${what}: the audit row`);
      }
      assert.ok(!(await b.made.store.listObjects()).some((o) => o.key.startsWith('quarantine/')), 'nothing was stored');
      assert.equal(b.docs() - before <= 2, true);
      const ok = await c.upload(pdf('/Pages 2 0 R'), 'lease.pdf');
      assert.equal(ok.status, 303, `an ordinary PDF is still taken: ${ok.body.slice(0, 200)}`);
    } finally { b.close(); }
  });

  test('a scanner, when given, is asked before anything is stored: FOUND and FAILED refuse, CLEAN goes on', async () => {
    const b = await boot();
    try {
      const c = await b.signIn('client');
      let verdict: 'CLEAN' | 'FOUND' | 'FAILED' = 'FOUND';
      let calls = 0;
      const fake: UploadScanner = { service: 'invented scanner', scan: async () => { calls++; return { result: verdict }; } };
      b.made.app.scanner = fake;
      const found = await c.upload(pdf('/Pages 2 0 R'), 'one.pdf');
      assert.ok(found.body.includes(SCAN_REFUSED.FOUND.slice(0, 40)), found.body.slice(0, 200));
      verdict = 'FAILED';
      const failed = await c.upload(pdf('/Pages 2 0 R'), 'two.pdf');
      assert.ok(failed.body.includes(SCAN_REFUSED.FAILED.slice(0, 40)));
      assert.ok(!(await b.made.store.listObjects()).some((o) => o.key.startsWith('quarantine/')), 'nothing was stored');
      verdict = 'CLEAN';
      assert.equal((await c.upload(pdf('/Pages 2 0 R'), 'three.pdf')).status, 303);
      assert.equal(calls, 3);
      assert.ok(b.refusals().includes('VIRUS_FOUND') && b.refusals().includes('SCAN_FAILED'));
    } finally { b.close(); }
  });

  test('as shipped the switch is off with no service named, so there is no scanner; switched on with none wired, every file is refused', async () => {
    assert.equal(UPLOAD_SCANNING.enabled, false);
    assert.equal(UPLOAD_SCANNING.service, null);
    assert.equal(uploadScannerFor(undefined), null);
    const unwired = uploadScannerFor(undefined, { enabled: true });
    assert.ok(unwired !== null);
    assert.deepEqual(await unwired.scan(new Uint8Array(1)), { result: 'FAILED' });
    const row = CONNECTIONS.find((x) => x.id === 'UPLOAD_SCANNER');
    assert.ok(row !== undefined, 'a row on the Connections page');
    assert.match(row.waits, /developer/);
  });
});

/* ================================================================== 4. M-04 */

describe('161n1c · 4 · M-04: the public forms cannot be flooded', () => {
  const enquiry = (i: number, more: Record<string, string> = {}) => new URLSearchParams({ name: `Person ${String(i)}`, firm: '', email: `person${String(i)}@example.invalid`, phone: '', ptype: 'Care home', message: '', ...more }).toString();
  const post = (base: string, path: string, body: string, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body });

  test(`the enquiry form: ${String(ENQUIRY_SOURCE_LIMIT)} from one address, then refused in words, whatever email it gives`, async () => {
    const b = await boot();
    try {
      for (let i = 0; i < ENQUIRY_SOURCE_LIMIT; i++) assert.equal((await post(b.base, '/enquiry', enquiry(i))).status, 200);
      const n = b.enquiries();
      const r = await post(b.base, '/enquiry', enquiry(99));
      assert.equal(r.status, 429);
      assert.ok((await r.text()).includes(FROM_ONE_PLACE.slice(0, 40)));
      assert.equal(b.enquiries(), n, 'nothing kept');
    } finally { b.close(); }
  });

  test('the hidden field filled: answered as if sent, kept nowhere, and written down', async () => {
    const b = await boot();
    try {
      const n = b.enquiries();
      const r = await post(b.base, '/enquiry', enquiry(1, { website: 'http://spam.invalid' }));
      assert.equal(r.status, 200);
      assert.match(await r.text(), /Thank you/);
      assert.equal(b.enquiries(), n);
      assert.ok(b.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'WEBSITE_ENQUIRY_REFUSED'").some((x) => x.detail.includes('hidden_field_filled')));
    } finally { b.close(); }
  });

  test(`at most ${String(ENQUIRY_THANKS_PER_HOUR)} thank-you emails an hour; past it the enquiry is still kept and staff still told`, async () => {
    const b = await boot();
    try {
      const thanks = () => b.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE to_email LIKE 'person%@example.invalid'")?.n ?? 0;
      for (let i = 0; i < ENQUIRY_THANKS_PER_HOUR + 5; i++) {
        const r = receiveEnquiry(b.made.app.deps, () => `e-${String(i)}`, new URLSearchParams(enquiry(i)), 'passed', { email: b.made.app.email });
        assert.equal(r.ok, true);
      }
      assert.equal(thanks(), ENQUIRY_THANKS_PER_HOUR);
      assert.ok(b.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'RATE_LIMITED'").some((x) => x.detail.includes('enquiry_thank_you_email')));
    } finally { b.close(); }
  });

  test('on the live website an enquiry the security check could not check is refused, never kept as before', async () => {
    const b = await boot();
    const was = process.env.CAPREBATE_PRODUCTION;
    try {
      const n = b.enquiries();
      process.env.CAPREBATE_PRODUCTION = '1';
      const r = await post(b.base, '/enquiry', enquiry(1));
      process.env.CAPREBATE_PRODUCTION = was;
      if (was === undefined) delete process.env.CAPREBATE_PRODUCTION;
      assert.equal(r.status, 503);
      assert.ok((await r.text()).includes(CHECK_REQUIRED.slice(0, 40)));
      assert.equal(b.enquiries(), n);
      assert.equal((await post(b.base, '/enquiry', enquiry(2))).status, 200, 'off the live website, as before');
    } finally {
      if (was === undefined) delete process.env.CAPREBATE_PRODUCTION; else process.env.CAPREBATE_PRODUCTION = was;
      b.close();
    }
  });

  test(`the assessment's submit and a client's sign-up: ${String(ASSESSMENT_SOURCE_LIMIT)} and ${String(SIGNUP_SOURCE_LIMIT)} from one address, then refused in words`, async () => {
    const b = await boot();
    try {
      const start = await fetch(`${b.base}/assessment`, { redirect: 'manual' });
      const cookie = (start.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
      for (let i = 0; i < ASSESSMENT_SOURCE_LIMIT; i++) assert.notEqual((await post(b.base, '/assessment/close', '', { cookie })).status, 429);
      const a = await post(b.base, '/assessment/close', '', { cookie });
      assert.equal(a.status, 429);
      assert.ok((await a.text()).includes(FROM_ONE_PLACE.slice(0, 40)));
      for (let i = 0; i < SIGNUP_SOURCE_LIMIT; i++) assert.notEqual((await post(b.base, '/account/create', 'offer=nothing')).status, 429);
      const s = await post(b.base, '/account/create', 'offer=nothing');
      assert.equal(s.status, 429);
      assert.ok((await s.text()).includes(FROM_ONE_PLACE.slice(0, 40)));
    } finally { b.close(); }
  });
});

/* ================================================================== 5. L-10 */

describe('161n1c · 5 · L-10: money, what cannot be undone, and the export need a single-use token', () => {
  test('each route the review lists is sensitive', () => {
    for (const p of ['/staff/finance/claims/c-1/break-fee', '/staff/introducer-fees/f-1/settled', '/staff/introducer-fees/f-1/disclosure',
      '/staff/introducers/i-1/merge', '/staff/introducers/i-1/terms-signed', '/staff/clients/b-1/engagement/send', '/portal/letter/sign',
      '/staff/claims/export.csv', '/staff/leads/export.csv']) {
      assert.ok(isSensitive(p), p);
    }
  });

  test('the export is a POST from a button: a GET is refused, and the list page carries the form', async () => {
    const b = await boot();
    try {
      const admin = await b.signIn('admin');
      assert.equal((await admin.req('/staff/claims/export.csv')).status, 405);
      const list = await admin.req('/staff/claims');
      assert.match(list.body, /<form method="post" action="\/staff\/claims\/export\.csv" class="inline"><input type="hidden" name="params"/);
      const csv = await admin.req('/staff/claims/export.csv', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'params=' });
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
    } finally { b.close(); }
  });
});

/* ================================================================== the helpers */

type Res = { status: number; body: string; headers: Headers };

async function boot() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161n1c-b-')), now: () => NOW, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  async function signIn(who: string) {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      return { status: r.status, body: await r.text(), headers: r.headers };
    };
    const r = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString() });
    assert.equal(r.status, 303, `${who} could not sign in`);
    /** The portal's own form: a file sent whole, as a lease. */
    const upload = (bytes: Uint8Array, name: string) => {
      const fd = new FormData();
      fd.append('type_code', 'LEASE');
      fd.append('file', new Blob([bytes]), name);
      return req('/portal/documents', { method: 'POST', body: fd });
    };
    return { req, upload };
  }
  return {
    made, base, signIn, db: made.app.db, close: () => made.close(),
    docs: () => made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents')?.n ?? 0,
    enquiries: () => made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM website_enquiries')?.n ?? 0,
    refusals: () => made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'UPLOAD_REFUSED_ACTIVE_CONTENT'").map((x) => x.detail).join(' '),
  };
}
