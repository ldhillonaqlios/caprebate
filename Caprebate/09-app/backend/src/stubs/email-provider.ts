/**
 * EMAIL_SENDING — ACTUALLY SENDING AN EMAIL. BUILT, AND SWITCHED OFF. Phase 141, 21 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * Every email this build writes goes to the outbox (src/stubs/email.ts), and nothing leaves. Lakhbir wants staff to
 * free-type emails from contactus@caprebate.com. Sending them for real needs three things this build cannot decide:
 *
 *   1. an email provider chosen — a supplier, so Lakhbir's decision;
 *   2. that provider named as a processor in the privacy notice AND in clause 7 of the engagement letter — the Phase 115
 *      rule: nothing carries client data through a processor the client was not told about;
 *   3. the contactus@caprebate.com mailbox existing, with SPF, DKIM and DMARC set on caprebate.com — without them the
 *      mail is marked as spam or refused, and anyone could send mail that looks like ours.
 *
 * The provider is put to Lakhbir in CAPREBATE QUESTIONS under exactly this title:
 *   "Which email service should send our emails from contactus@caprebate.com?"
 * The mailbox and the DNS records are a board item for him in 01 · FOR LAKHBIR.
 *
 * OFF IS EXACTLY TODAY. With `enabled: false` every email is saved to the outbox with `send_requested = 0`, the screen
 * says "Saved — emails are not being sent yet", and `dispatchOutbox` below returns OFF without opening a connection.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON, AND WHAT IS SENT
 *
 * EVERY CONDITION FAILS CLOSED, and not known is not a yes (N4): each of the three facts is a boolean that must be
 * `true`, the provider must be named, and the provider's login must be present in the environment. Any one missing is
 * off. A row saved while sending was off is never sent later — `send_requested` is written once, when the row is.
 *
 * THE ADAPTER BUILT IS SMTP OVER TLS, because the recommendation is to send through the mailbox's own host — IONOS,
 * which the privacy notice already names as "our email" — so condition 2 needs no new processor and every reply lands
 * in the same mailbox. It is a small, dependency-free client (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT) over
 * `node:tls`, tested against a fake server in test/phase141.test.ts. If Lakhbir picks a service with its own web API
 * instead, that is a second `EmailProvider` beside this one; nothing else changes.
 *
 * THE RULES DO NOT MOVE WHEN IT IS ON. A do-not-contact company is asked again at the moment of sending, not only when
 * the email was saved. From and Reply-To come from the stored row, which was stamped from the one sender setting. An
 * attachment is sent only while its original is still kept; one that is gone stops the email, which is left unsent
 * with the reason.
 */

import { connect as tlsConnect } from 'node:tls';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import { isDoNotContact } from './email.ts';

export type EmailSending = {
  readonly enabled: boolean;
  /** The provider chosen, by the id of its adapter. Null until Lakhbir chooses. */
  readonly provider: 'SMTP' | null;
  /** The provider is named as a processor in the privacy notice. */
  readonly named_in_privacy_notice: boolean;
  /** The provider is named as a processor in clause 7 of the engagement letter. */
  readonly named_in_engagement_letter: boolean;
  /** contactus@caprebate.com exists, and SPF, DKIM and DMARC are set on caprebate.com. */
  readonly mailbox_and_dns_ready: boolean;
  readonly question: string;
};

/** The title of the question under Lakhbir in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const EMAIL_PROVIDER_QUESTION = 'Which email service should send our emails from contactus@caprebate.com?';

export const EMAIL_SENDING: EmailSending = Object.freeze({
  enabled: false,
  provider: null,
  named_in_privacy_notice: false,
  named_in_engagement_letter: false,
  mailbox_and_dns_ready: false,
  question: EMAIL_PROVIDER_QUESTION,
});

/** The provider's login, from the environment. Never in code, never in the database. */
export type SmtpLogin = { readonly host: string; readonly port: number; readonly user: string; readonly password: string };

export function smtpLoginFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpLogin | null {
  const host = (env.CAPREBATE_SMTP_HOST ?? '').trim();
  const user = (env.CAPREBATE_SMTP_USER ?? '').trim();
  const password = env.CAPREBATE_SMTP_PASSWORD ?? '';
  const port = Number((env.CAPREBATE_SMTP_PORT ?? '465').trim());
  if (host === '' || user === '' || password === '' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, password };
}

/** What is still missing before emails can be sent — each in plain words. Empty means sending is on. */
export function sendingMissing(cfg: EmailSending, login: SmtpLogin | null): string[] {
  const out: string[] = [];
  if (cfg.provider === null) out.push('Choose the email service that will send them.');
  if (cfg.named_in_privacy_notice !== true || cfg.named_in_engagement_letter !== true) {
    out.push('Name that service in the privacy notice and in the engagement letter.');
  }
  if (cfg.mailbox_and_dns_ready !== true) out.push('Set up the contactus@caprebate.com mailbox and its email security records.');
  if (cfg.provider !== null && login === null) out.push('Add the email service’s login to the server.');
  if (cfg.enabled !== true) out.push('Then switch sending on.');
  return out;
}

/** True only when every condition is met. */
export function sendingOn(cfg: EmailSending, login: SmtpLogin | null): boolean {
  return sendingMissing(cfg, login).length === 0;
}

/* ================================================================== *
 * THE MESSAGE — plain text, and a file or two
 * ================================================================== */

export type Attachment = { readonly filename: string; readonly content_type: string; readonly bytes: Uint8Array };

export type Envelope = {
  readonly from_header: string;
  readonly reply_to: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly attachments: readonly Attachment[];
  readonly date: Date;
};

/** The address inside "Name <address>", or the whole thing when there are no brackets. */
export function addressOf(header: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(header);
  return (m?.[1] ?? header).trim();
}

/** No header may carry a line break: that is how a header is smuggled into an email. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/** A header value with anything beyond plain ASCII, encoded so every mail program reads it (RFC 2047). */
function headerWords(s: string): string {
  const v = oneLine(s);
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`;
}

function base64Lines(bytes: Uint8Array): string {
  return (Buffer.from(bytes).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n');
}

/** The whole message, as SMTP's DATA carries it. Every body part is base64, so no line can begin with a dot. */
export function buildMessage(e: Envelope, messageId: string): string {
  const head = [
    `From: ${headerWords(e.from_header)}`,
    `Reply-To: ${headerWords(e.reply_to)}`,
    `To: ${oneLine(e.to)}`,
    `Subject: ${headerWords(e.subject)}`,
    `Date: ${e.date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
  ];
  const text = ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', base64Lines(Buffer.from(e.body, 'utf8'))];
  if (e.attachments.length === 0) return [...head, ...text].join('\r\n');
  const b = `cb-${randomBytes(12).toString('hex')}`;
  const parts = [
    ...head, `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, ...text,
    ...e.attachments.flatMap((a) => [
      `--${b}`,
      `Content-Type: ${oneLine(a.content_type)}; name="${oneLine(a.filename).replace(/"/g, '')}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${oneLine(a.filename).replace(/"/g, '')}"`,
      '', base64Lines(a.bytes),
    ]),
    `--${b}--`,
  ];
  return parts.join('\r\n');
}

/* ================================================================== *
 * THE PROVIDER — SMTP over TLS
 * ================================================================== */

export type Delivered = { readonly ok: true; readonly ref: string } | { readonly ok: false; readonly why: string };

export interface EmailProvider {
  readonly id: string;
  deliver(e: Envelope): Promise<Delivered>;
}

/** A connection to the mail server. Production opens TLS; a test hands in its own socket. */
export type Connector = (login: SmtpLogin) => Duplex;

const tlsConnector: Connector = (login) => tlsConnect({ host: login.host, port: login.port, servername: login.host });

/** Read SMTP replies one at a time: a reply ends on a line whose fourth character is a space. */
function replyReader(sock: Duplex): () => Promise<{ code: number; text: string }> {
  let buf = '';
  const waiting: ((line: string | null) => void)[] = [];
  const lines: string[] = [];
  let ended = false;
  sock.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let i: number;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const w = waiting.shift();
      if (w !== undefined) w(line); else lines.push(line);
    }
  });
  const end = (): void => { ended = true; while (waiting.length > 0) waiting.shift()?.(null); };
  sock.on('end', end);
  sock.on('close', end);
  sock.on('error', end);
  const nextLine = (): Promise<string | null> => {
    const l = lines.shift();
    if (l !== undefined) return Promise.resolve(l);
    if (ended) return Promise.resolve(null);
    return new Promise((r) => waiting.push(r));
  };
  return async () => {
    const text: string[] = [];
    for (;;) {
      const line = await nextLine();
      if (line === null) return { code: 0, text: text.join(' ') || 'the connection closed' };
      text.push(line.slice(4));
      if (line.length < 4 || line[3] === ' ') return { code: Number(line.slice(0, 3)) || 0, text: text.join(' ') };
    }
  };
}

export function smtpProvider(login: SmtpLogin, connect: Connector = tlsConnector, timeoutMs = 30_000): EmailProvider {
  return {
    id: 'SMTP',
    async deliver(e: Envelope): Promise<Delivered> {
      const from = addressOf(e.from_header);
      const to = addressOf(e.to);
      if (/[\r\n<>\s]/.test(from) || /[\r\n<>\s]/.test(to)) return { ok: false, why: 'An address is not a plain email address.' };
      const domain = from.split('@')[1] ?? 'localhost';
      const messageId = `${randomBytes(16).toString('hex')}@${domain}`;
      const sock = connect(login);
      const timer = setTimeout(() => sock.destroy(new Error('timed out')), timeoutMs);
      const read = replyReader(sock);
      const say = (line: string): void => { sock.write(`${line}\r\n`); };
      const step = async (line: string | null, want: number): Promise<string | null> => {
        if (line !== null) say(line);
        const r = await read();
        return Math.floor(r.code / 100) === Math.floor(want / 100) ? null : `${r.code} ${r.text}`;
      };
      try {
        const bad =
          (await step(null, 220)) ??
          (await step(`EHLO ${domain}`, 250)) ??
          (await step(`AUTH PLAIN ${Buffer.from(`\0${login.user}\0${login.password}`, 'utf8').toString('base64')}`, 235)) ??
          (await step(`MAIL FROM:<${from}>`, 250)) ??
          (await step(`RCPT TO:<${to}>`, 250)) ??
          (await step('DATA', 354)) ??
          (await step(`${buildMessage(e, messageId)}\r\n.`, 250));
        if (bad !== null) return { ok: false, why: `The mail server refused it: ${bad.slice(0, 200)}` };
        say('QUIT');
        return { ok: true, ref: messageId };
      } catch (err) {
        return { ok: false, why: `Could not reach the mail server: ${err instanceof Error ? err.message : String(err)}` };
      } finally {
        clearTimeout(timer);
        sock.end();
      }
    },
  };
}

/* ================================================================== *
 * SENDING WHAT IS WAITING
 * ================================================================== */

export type DispatchResult =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'RAN'; readonly sent: number; readonly failed: number; readonly refused: number };

type Waiting = {
  id: string; to_email: string; subject: string; body: string; business_id: string | null;
  from_header: string | null; reply_to: string | null;
};

/**
 * SEND EVERY EMAIL THAT WAS SAVED WHILE SENDING WAS ON AND HAS NOT GONE — or one of them, by id. OFF returns at once
 * and touches nothing. `open` returns an attachment's bytes, or null when its original is no longer kept.
 */
export async function dispatchOutbox(
  d: { db: Db; now: () => string },
  cfg: EmailSending, login: SmtpLogin | null, provider: EmailProvider | null,
  open: (document_id: string) => Promise<Attachment | null>,
  only?: string,
): Promise<DispatchResult> {
  if (!sendingOn(cfg, login) || provider === null) return { state: 'OFF', missing: sendingMissing(cfg, login) };
  const rows = only === undefined
    ? d.db.all<Waiting>('SELECT id, to_email, subject, body, business_id, from_header, reply_to FROM outbox WHERE sent_at IS NULL AND send_requested = 1 ORDER BY created_at')
    : d.db.all<Waiting>('SELECT id, to_email, subject, body, business_id, from_header, reply_to FROM outbox WHERE sent_at IS NULL AND send_requested = 1 AND id = ?', [only]);
  let sent = 0, failed = 0, refused = 0;
  for (const r of rows) {
    const fail = (why: string): void => { d.db.run('UPDATE outbox SET last_error = ? WHERE id = ?', [why, r.id]); };
    if (isDoNotContact(d.db, r.to_email, r.business_id)) { refused++; fail('This company is marked do not contact. It was not sent.'); continue; }
    if (r.from_header === null || r.reply_to === null) { failed++; fail('It has no sender recorded, so it was not sent.'); continue; }
    const files: Attachment[] = [];
    let missing = false;
    for (const a of d.db.all<{ document_id: string }>('SELECT document_id FROM outbox_attachments WHERE outbox_id = ?', [r.id])) {
      const f = await open(a.document_id);
      if (f === null) { missing = true; break; }
      files.push(f);
    }
    if (missing) { failed++; fail('A file it carries is no longer kept, so it was not sent.'); continue; }
    const out = await provider.deliver({
      from_header: r.from_header, reply_to: r.reply_to, to: r.to_email, subject: r.subject, body: r.body,
      attachments: files, date: new Date(d.now()),
    });
    if (out.ok) {
      d.db.run('UPDATE outbox SET sent_at = ?, transport = ?, provider_ref = ?, last_error = NULL WHERE id = ?', [d.now(), provider.id, out.ref, r.id]);
      sent++;
    } else {
      failed++;
      fail(out.why);
    }
  }
  return { state: 'RAN', sent, failed, refused };
}
