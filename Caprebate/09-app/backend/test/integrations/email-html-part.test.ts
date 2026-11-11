/**
 * PHASE 161m2, 11 NOVEMBER 2026: AN EMAIL CAN CARRY ITS BRANDED HTML VERSION.
 *
 * The outbox keeps it (`outbox.html_body`, migration 123); the message sent is multipart/alternative, text first and
 * HTML last, inside multipart/mixed when it carries files (src/integrations/email/email-provider.ts, buildMessage). A
 * plain-text email is exactly what it was: the two messages in test/fixtures/phase161m2/ were written by buildMessage
 * before this phase, and it must still write them byte for byte. A fake provider only: nothing is sent.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { NOT_SENT_WORDS, outboxTransport, withoutNotSentWordsHtml } from '../../src/integrations/email/email.ts';
import { EMAIL_SENDING, blankSentSecrets, buildMessage, dispatchOutbox, type EmailProvider, type Envelope } from '../../src/integrations/email/email-provider.ts';
import { brandedEmail, renderEmailHtml, type EmailContent } from '../../src/integrations/index.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'phase161m2');
const T = '2026-11-11T10:00:00Z';

/* The same inputs the fixtures were written from (before this phase). */
const BASE = {
  from_header: 'Cap Rebate <contact@caprebate.co.uk>', reply_to: 'contact@caprebate.co.uk', to: 'ann@example.invalid',
  subject: 'Your call with Cap Rebate on Tuesday 3 November', body: 'Hello Ann,\n\nSmith & Co <b> ✓ £1,000.\n\nKind regards,\nThe Cap Rebate team',
  date: new Date(T), in_reply_to: 'abc@caprebate.co.uk', references: ['abc@caprebate.co.uk'],
};
const ICS = { filename: 'call.ics', content_type: 'text/calendar; method=REQUEST; charset=utf-8', bytes: new TextEncoder().encode('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n') };

type Part = { headers: Record<string, string>; body: string };

/** One MIME entity: its headers (lower-case names) and what follows the blank line. */
function entity(s: string): Part {
  const k = s.indexOf('\r\n\r\n');
  const headers: Record<string, string> = {};
  for (const line of s.slice(0, k).split('\r\n')) {
    const c = line.indexOf(':');
    headers[line.slice(0, c).toLowerCase()] = line.slice(c + 1).trim();
  }
  return { headers, body: s.slice(k + 4) };
}

/** A multipart body split on its boundary, checking the closing delimiter and that nothing follows it. */
function parts(p: Part): Part[] {
  const m = /^multipart\/[a-z]+; boundary="([^"]+)"$/.exec(p.headers['content-type'] ?? '');
  assert.ok(m !== null, `a multipart Content-Type with a boundary: ${p.headers['content-type'] ?? ''}`);
  const b = m[1] ?? '';
  assert.ok(p.body.startsWith(`--${b}\r\n`), 'opens with the boundary');
  assert.ok(p.body.endsWith(`\r\n--${b}--`), 'closes with the boundary');
  const inner = p.body.slice(`--${b}\r\n`.length, p.body.length - `\r\n--${b}--`.length);
  return inner.split(`\r\n--${b}\r\n`).map(entity);
}

const decoded = (p: Part): string => {
  assert.equal(p.headers['content-transfer-encoding'], 'base64');
  for (const line of p.body.split('\r\n')) assert.ok(line.length <= 76 && /^[A-Za-z0-9+/=]*$/.test(line), 'base64 in lines of 76');
  return Buffer.from(p.body.replace(/\r\n/g, ''), 'base64').toString('utf8');
};

const CONTENT: EmailContent = {
  subject: 'Your call is booked', preheader: 'We will ring you on Tuesday.', heading: 'Your call is booked',
  blocks: [{ kind: 'facts', rows: [['When', 'Tuesday 3 November, 10am'], ['Company', 'Smith & Co <b>']] }, 'See you then.'],
  button: { label: 'Manage your call', href: 'https://caprebate.co.uk/portal' }, sign: 'The Cap Rebate team',
};

describe('Phase 161m2: the message', () => {
  test('a plain-text email is byte for byte what it was before', () => {
    assert.equal(buildMessage({ ...BASE, attachments: [] }, 'fixed-id@caprebate.co.uk'), readFileSync(join(FIXTURES, 'buildmessage-text-only.eml'), 'utf8'));
    assert.equal(buildMessage({ ...BASE, html: null, attachments: [] }, 'fixed-id@caprebate.co.uk'), readFileSync(join(FIXTURES, 'buildmessage-text-only.eml'), 'utf8'));
    assert.equal(buildMessage({ ...BASE, attachments: [ICS] }, 'fixed-id@caprebate.co.uk').replace(/cb-[0-9a-f]{24}/g, 'cb-BOUNDARY'),
      readFileSync(join(FIXTURES, 'buildmessage-with-attachment.eml'), 'utf8'));
  });

  test('with HTML: multipart/alternative, the text first and the HTML last, the same headers as before', () => {
    const html = renderEmailHtml(CONTENT);
    const msg = buildMessage({ ...BASE, html, attachments: [] }, 'fixed-id@caprebate.co.uk');
    const top = entity(msg);
    assert.equal(top.headers['mime-version'], '1.0');
    assert.equal(top.headers['message-id'], '<fixed-id@caprebate.co.uk>');
    assert.equal(top.headers['in-reply-to'], '<abc@caprebate.co.uk>');
    assert.match(top.headers['content-type'] ?? '', /^multipart\/alternative; /);
    const [text, htmlPart, ...rest] = parts(top);
    assert.equal(rest.length, 0);
    assert.equal(text?.headers['content-type'], 'text/plain; charset=utf-8');
    assert.equal(htmlPart?.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(decoded(text as Part), BASE.body);
    assert.equal(decoded(htmlPart as Part), html);
    assert.doesNotMatch(msg.split('\r\n\r\n').slice(1).join('\n'), /^\./m, 'no line starts with a dot');
  });

  test('with HTML and a file: multipart/mixed holding the alternative, then the file', () => {
    const html = renderEmailHtml(CONTENT);
    const top = entity(buildMessage({ ...BASE, html, attachments: [ICS] }, 'fixed-id@caprebate.co.uk'));
    assert.match(top.headers['content-type'] ?? '', /^multipart\/mixed; /);
    const [alt, file, ...rest] = parts(top);
    assert.equal(rest.length, 0);
    assert.match(alt?.headers['content-type'] ?? '', /^multipart\/alternative; /);
    const [text, htmlPart] = parts(alt as Part);
    assert.equal(decoded(text as Part), BASE.body);
    assert.equal(decoded(htmlPart as Part), html);
    assert.equal(file?.headers['content-type'], 'text/calendar; method=REQUEST; charset=utf-8; name="call.ics"');
    assert.equal(file?.headers['content-disposition'], 'attachment; filename="call.ics"');
    assert.equal(decoded(file as Part), 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
  });
});

type Made = Awaited<ReturnType<typeof createApp>>;
let made: Made;
let n = 0;
const ids = (): string => `id-161m2-${(++n).toString()}`;
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161m2-')) });
  await seed(made.app.db, made.app.hasher, made.app.now);
});
after(() => made.close());

type Row = { body: string; html_body: string | null; subject: string };
const row = (id: string | null): Row | undefined => made.app.db.get<Row>('SELECT body, html_body, subject FROM outbox WHERE id = ?', [id]);

describe('Phase 161m2: the outbox keeps the HTML version', () => {
  test('a branded email is kept with both versions; a text-only one has none', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const e = brandedEmail(CONTENT, { publicOrigin: 'https://caprebate.co.uk' });
    const r = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    assert.equal(r.refused, null);
    assert.equal(row(r.id)?.body, e.text);
    assert.equal(row(r.id)?.html_body, e.html);
    const plain = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: 's', body: 'b' });
    assert.equal(row(plain.id)?.html_body, null);
    const empty = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: 's', body: 'b', html: '' });
    assert.equal(row(empty.id)?.html_body, null, 'an empty HTML version is none');
  });

  test('a do-not-contact company is still refused, HTML or not, and nothing is written', () => {
    const dnc = made.app.db.get<{ id: string }>("SELECT id FROM businesses WHERE client_status = 'DO_NOT_CONTACT'")?.id;
    assert.ok(dnc !== undefined, 'the seed has a do-not-contact company');
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n;
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const e = brandedEmail(CONTENT);
    assert.deepEqual(t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', business_id: dnc, subject: e.subject, body: e.text, html: e.html }),
      { id: null, delivered: false, refused: 'DO_NOT_CONTACT' });
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox')?.n, before);
  });

  test('a long dash becomes plain punctuation in both versions; a staff member\'s own email keeps theirs', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const c = { ...CONTENT, blocks: ['Tax return — a document we need'] };
    const e = brandedEmail(c);
    const r = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    assert.match(row(r.id)?.body ?? '', /Tax return: a document we need/);
    assert.match(row(r.id)?.html_body ?? '', /Tax return: a document we need/);
    assert.doesNotMatch(row(r.id)?.html_body ?? '', /—/);
    const own = t.send({ to_email: 'someone@example.com', kind: 'FREE_TYPED', subject: 's', body: 'Great — see you', html: '<p>Great — see you</p>' });
    assert.equal(row(own.id)?.html_body, '<p>Great — see you</p>');
  });

  test('"Not sent yet" leaves both versions of an email that is really going', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now, () => true);
    const w = NOT_SENT_WORDS[0] ?? '';
    const c = { ...CONTENT, blocks: ['Your call is on Tuesday.', w] };
    const e = brandedEmail(c);
    const r = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    assert.ok(!(row(r.id)?.body ?? '').includes(w));
    assert.ok(!(row(r.id)?.html_body ?? '').includes(w));
    assert.match(row(r.id)?.html_body ?? '', /Your call is on Tuesday\.<\/p><\/table>|Your call is on Tuesday\.<\/p>\n/);
    assert.equal(withoutNotSentWordsHtml(`<p style="x">${w}</p><p>kept</p>`), '<p>kept</p>', 'its paragraph goes with it');
    assert.equal(withoutNotSentWordsHtml(`<td>Hello. ${w}</td>`), '<td>Hello. </td>');
    // While sending is off the words stay, as they always have.
    const off = outboxTransport(made.app.db, ids, made.app.now).send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    assert.ok((row(off.id)?.html_body ?? '').includes(w));
  });

  test('the HTML version is never edited, except that a sent sign-in code\'s goes with its words', () => {
    const t = outboxTransport(made.app.db, ids, made.app.now);
    const e = brandedEmail({ ...CONTENT, blocks: [{ kind: 'code', text: '123456' }] });
    const note = t.send({ to_email: 'someone@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    const code = t.send({ to_email: 'someone@example.com', kind: 'SIGN_IN_CODE', subject: e.subject, body: e.text, html: e.html });
    const db = made.app.db;
    assert.throws(() => db.run("UPDATE outbox SET html_body = 'changed' WHERE id = ?", [note.id]), /never edited/);
    assert.throws(() => db.run('UPDATE outbox SET html_body = NULL WHERE id = ?', [code.id]), /never edited/, 'not sent yet: it is the only copy');
    assert.equal(blankSentSecrets(db, code.id ?? ''), false, 'nothing happens before it is sent');
    db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [made.app.now(), code.id]);
    db.run('UPDATE outbox SET sent_at = ? WHERE id = ?', [made.app.now(), note.id]);
    assert.throws(() => db.run('UPDATE outbox SET html_body = NULL WHERE id = ?', [note.id]), /never edited/, 'not one of the four kinds');
    assert.throws(() => db.run("UPDATE outbox SET html_body = 'x' WHERE id = ?", [code.id]), /never edited/, 'only ever removed');
    assert.equal(blankSentSecrets(db, code.id ?? ''), true);
    assert.equal(row(code.id)?.html_body, null);
    assert.doesNotMatch(row(code.id)?.body ?? '', /123456/);
    assert.ok((row(note.id)?.html_body ?? '').includes('123456'), 'any other email keeps its words');
  });

  test('sending hands the provider both versions; a text-only email goes without HTML', async () => {
    const seen: Envelope[] = [];
    const provider: EmailProvider = { id: 'FAKE', deliver: async (env) => { seen.push(env); return { ok: true, ref: `ref-${seen.length.toString()}@caprebate.co.uk` }; } };
    const t = outboxTransport(made.app.db, ids, made.app.now, () => true);
    const e = brandedEmail(CONTENT);
    const a = t.send({ to_email: 'html@example.com', kind: 'NOTIFICATION', subject: e.subject, body: e.text, html: e.html });
    const b = t.send({ to_email: 'plain@example.com', kind: 'NOTIFICATION', subject: 'Plain', body: 'Just words.' });
    const login = { host: 'smtp.ionos.co.uk', port: 465, user: 'contact@caprebate.co.uk', password: 'not-a-real-password' };
    const open = async (): Promise<null> => null;
    const ra = await dispatchOutbox({ db: made.app.db, now: made.app.now }, EMAIL_SENDING, login, provider, open, a.id ?? '');
    const rb = await dispatchOutbox({ db: made.app.db, now: made.app.now }, EMAIL_SENDING, login, provider, open, b.id ?? '');
    assert.deepEqual([ra.state, rb.state], ['RAN', 'RAN']);
    assert.equal(seen.length, 2);
    assert.equal(seen[0]?.html, e.html);
    assert.equal(seen[0]?.body, e.text.trimEnd(), 'the text as before: an email that is going loses its last line break (withoutNotSentWords)');
    assert.equal(seen[1]?.html, null);
    assert.match(buildMessage(seen[1] as Envelope, 'x@caprebate.co.uk'), /\r\nContent-Type: text\/plain; charset=utf-8\r\n/);
    assert.doesNotMatch(buildMessage(seen[1] as Envelope, 'x@caprebate.co.uk'), /multipart/);
  });
});

describe('Phase 161m2: the logo is served', () => {
  test('GET /email/cap-rebate-logo.png: a public, cacheable PNG, with no sign-in', async () => {
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const a = made.server.address();
    const res = await fetch(`http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}/email/cap-rebate-logo.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control') ?? '', /^public, max-age=\d+$/);
    const png = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [68, 68]);
  });
});
