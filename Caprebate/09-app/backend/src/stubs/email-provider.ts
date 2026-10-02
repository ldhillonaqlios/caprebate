/**
 * EMAIL_SENDING — ACTUALLY SENDING AN EMAIL. BUILT, AND SWITCHED OFF. Phase 141, 21 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * Every email this build writes goes to the outbox (src/stubs/email.ts), and nothing leaves. Lakhbir wants staff to
 * free-type emails from contact@caprebate.co.uk. Sending them for real needs three things this build cannot decide:
 *
 *   1. an email provider chosen — a supplier, so Lakhbir's decision;
 *   2. that provider named as a processor in the privacy notice AND in clause 7 of the engagement letter — the Phase 115
 *      rule: nothing carries client data through a processor the client was not told about;
 *   3. the contact@caprebate.co.uk mailbox existing, with SPF, DKIM and DMARC set on caprebate.co.uk — without them the
 *      mail is marked as spam or refused, and anyone could send mail that looks like ours.
 *
 * PHASE 151, 24 September 2026: the provider question (Word question 186) is answered and closed - IONOS - and the
 * mailbox exists: contact@caprebate.co.uk, on IONOS, with SPF, DKIM (s1-ionos, s2-ionos) and DMARC (p=none, so reports
 * only) published on caprebate.co.uk, read by DNS that day. What is left before sending is who reads the mailbox (Word
 * question 216) and one test email (Word question 217), whose title is quoted exactly here:
 *   "May we send you one test email from contact@caprebate.co.uk before email sending is switched on?"
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
 * PHASE 146f, 22 SEPTEMBER 2026 — POINTED AT IONOS, AND STILL OFF.
 *
 *   · THE LOGIN COMES FROM THE KEY FILE (src/secrets.ts), never the environment: IONOS_SMTP_HOST, _PORT, _USER and
 *     _PASSWORD, read only through `loadSecrets().forOwner('IONOS_EMAIL')`. A host that is not an IONOS server is
 *     refused as if there were no login, so a key file cannot quietly point our mail somewhere else.
 *   · EACH CONNECTION WRITES ONE AUDIT ROW, MAIL_SERVER_CONNECTED: the service, what it was for, the outcome, the
 *     server's reply code, how long it took. Never the password, never an address, never the server's words.
 *     SMTP is not fetch, so it stays outside src/connectors/http.ts, as that file's own rule allows.
 *   · BOUNCES. A refusal while sending is read by its code: 5xx is permanent (HARD) and 4xx is for now (SOFT, tried
 *     again on the next run). A HARD bounce is written to email_bounces and the address to email_suppressions, and
 *     nothing more is sent to it until a member of staff lifts it. A delivery report that arrives later is read by
 *     the mailbox reader (src/web/inbound-email.ts) and recorded the same way — never filed as a reply.
 *   · CALENDAR INVITES AND THE SIGNED LETTER travel as outbox_inline_files, attached like any other file.
 *   · STILL OFF. The mailbox and its SPF, DKIM and DMARC records, and IONOS named in the privacy notice and in
 *     clause 7 of the engagement letter, are not yet true. The invoice and bank-detail refusals in
 *     src/web/free-email.ts are untouched.
 *
 * THE RULES DO NOT MOVE WHEN IT IS ON. A do-not-contact company is asked again at the moment of sending, not only when
 * the email was saved. From and Reply-To come from the stored row, which was stamped from the one sender setting. An
 * attachment is sent only while its original is still kept; one that is gone stops the email, which is left unsent
 * with the reason.
 *
 * 2 OCT 2026 — ONLY THE TEST WEBSITE SENDS (Lakhbir: "yes for now"), as Zoom and WhatsApp: a copy on a computer, reading
 * the real key file, would email real people from contact@caprebate.co.uk. Sending is on only on the deployed test
 * website, or when the copy was started with CAPREBATE_LOCAL_EMAIL=1 (src/connectors/place.ts). Every screen that asks
 * whether sending is on passes where it runs (`MailWhere`), so it says so in words; and the provider itself refuses to
 * deliver over a real connection from anywhere else. A test's own mail server reaches nobody, so it is never refused.
 * Signing in to check the login (`check`) sends nothing and is left alone.
 */

import { connect as tlsConnect } from 'node:tls';
import { connect as netConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { processSecrets, type SecretStore } from '../secrets.ts';
import { isDoNotContact, isInventedAddress } from './email.ts';
import { placeRefusal, type Env } from '../connectors/place.ts';

export type EmailSending = {
  readonly enabled: boolean;
  /** The provider chosen, by the id of its adapter. Null until Lakhbir chooses. */
  readonly provider: 'SMTP' | null;
  /** The provider is named as a processor in the privacy notice. */
  readonly named_in_privacy_notice: boolean;
  /** The provider is named as a processor in clause 7 of the engagement letter. */
  readonly named_in_engagement_letter: boolean;
  /** contact@caprebate.co.uk exists and SPF, DKIM and DMARC are set (both true, Phase 151), AND somebody reads it and a test
   *  email has arrived (Word questions 216 and 217). False until all four are. */
  readonly mailbox_and_dns_ready: boolean;
  readonly question: string;
  /**
   * TESTING ONLY, as the identity check's (Phase 151h): a person's decision to send before the privacy notice and the
   * engagement letter name IONOS. It never makes either `named_in_*` true. Absent is false.
   */
  readonly papers_waived_for_testing?: boolean;
  readonly waiver_record?: string | null;
};

/** The title of the open question under Lakhbir in the Word questions document (217). Quoted, not paraphrased. The provider
 *  question it replaced (186) was answered - IONOS - and closed on 24 September 2026. */
export const EMAIL_PROVIDER_QUESTION = 'May we send you one test email from contact@caprebate.co.uk before email sending is switched on?';

/**
 * PHASE 142b: Lakhbir answered the question on 22 September 2026 — IONOS, from the contact@caprebate.co.uk mailbox — so the
 * provider is SMTP through IONOS's own host. Still off: the mailbox and its email security records, and IONOS named in
 * clause 7 of the engagement letter, are not yet true. IONOS is already "our email" in the privacy notice, but that
 * notice is a draft nobody has approved, so `named_in_privacy_notice` stays false until it is published.
 */
/*
 * SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: "swithc on sending emails", and "again remeber this is all a test
 * and not the final version - the idea is we build what we can and then ask for approval"). Under a recorded waiver:
 * the privacy notice and clause 7 are still drafts that do not name IONOS, so both `named_in_*` stay FALSE. Sending
 * also needs the IONOS login: in the key file locally, and on the test website its settings (behind the test password).
 * An invented address (@example.invalid, example.com) is never sent to (src/stubs/email.ts, isInventedAddress).
 */
export const EMAIL_SENDING: EmailSending = Object.freeze({
  enabled: true,
  provider: 'SMTP',
  named_in_privacy_notice: false,
  named_in_engagement_letter: false,
  /* TRUE SINCE 24 SEPTEMBER 2026 (the afternoon): the mailbox exists, its SPF, DKIM and DMARC records are published,
     Sadique Maskeen reads it (Word question 216, closed), and the one test email (Word question 217, closed) was sent
     by smtpProvider to Lakhbir and arrived. It landed in junk at first: a new domain, and whether IONOS signs with DKIM
     is still to be checked in its control panel. Sending stays OFF: the privacy notice and the engagement letter must
     name IONOS first, and then the switch. */
  mailbox_and_dns_ready: true,
  question: EMAIL_PROVIDER_QUESTION,
  papers_waived_for_testing: true,
  waiver_record: 'Lakhbir Dhillon, 30 September 2026, in chat: "swithc on sending emails". This is a test build. The privacy notice and engagement letter do not name IONOS yet.',
});

/** The provider's login, from the key file. Never in code, never in the database, never in the environment. */
export type SmtpLogin = { readonly host: string; readonly port: number; readonly user: string; readonly password: string };

/**
 * AN IONOS MAIL SERVER, by its published names (smtp.ionos.co.uk, imap.ionos.co.uk and the same under .com, .de and
 * the other IONOS domains). Anything else in the key file is refused as if there were no login.
 */
export const IONOS_HOST = /^(?:[a-z0-9-]+\.)*ionos\.(?:co\.uk|com|de|fr|es|it|mx|ca|at)$/;

/** A host, port, user and password read from one owner's keys. Null when any is missing or the host is not IONOS. */
export function mailLogin(
  get: (name: string) => string | null, prefix: 'IONOS_SMTP' | 'IONOS_IMAP', defaultPort: number,
): SmtpLogin | null {
  const host = (get(`${prefix}_HOST`) ?? '').trim().toLowerCase();
  const user = (get(`${prefix}_USER`) ?? '').trim();
  const password = get(`${prefix}_PASSWORD`) ?? '';
  const portText = (get(`${prefix}_PORT`) ?? '').trim();
  const port = portText === '' ? defaultPort : Number(portText);
  if (host === '' || user === '' || password === '' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!IONOS_HOST.test(host)) return null;
  return { host, port, user, password };
}

/** PHASE 146f: the sending login, from the key file's IONOS_SMTP_* names. Port 465 (TLS from the start) by default. */
export function smtpLoginFromKeyFile(store: SecretStore = processSecrets()): SmtpLogin | null {
  const mine = store.forOwner('IONOS_EMAIL');
  return mailLogin((n) => mine.get(n), 'IONOS_SMTP', 465);
}

/* ================================================================== *
 * ONE AUDIT ROW PER CONNECTION
 * ================================================================== */

/** What one conversation with a mail server did. Never a password, an address, a host or the server's words. */
export type MailConnection = {
  readonly service: 'IONOS_SMTP' | 'IONOS_IMAP';
  readonly purpose: 'SEND' | 'READ';
  readonly outcome: 'OK' | 'REFUSED' | 'FAILED';
  /** The server's three-digit reply code where there was one (SMTP), else null. */
  readonly reply_code: number | null;
  readonly messages: number;
  readonly took_ms: number;
};

export type ConnectionRecorder = (c: MailConnection) => void;

/** The recorder the application uses: one MAIL_SERVER_CONNECTED row in the audit chain for each connection. */
export function auditMailConnections(audit: AuditLog, now: () => string): ConnectionRecorder {
  return (c) => {
    audit.append({
      at: now(), kind: 'MAIL_SERVER_CONNECTED', outcome: c.outcome === 'OK' ? 'ALLOWED' : c.outcome === 'REFUSED' ? 'REFUSED' : 'ERROR',
      actor_id: null, actor_role: 'SYSTEM', object_type: 'mail_server', object_id: c.service,
      detail: { service: c.service, purpose: c.purpose, result: c.outcome, reply_code: c.reply_code, messages: c.messages, took_ms: c.took_ms },
    });
  };
}

/** 2 Oct 2026: the setting that lets a copy that is not the test website send email. Off unless exactly "1". */
export const EMAIL_LOCAL_OPT_IN = 'CAPREBATE_LOCAL_EMAIL';

/**
 * Where the app runs: whether its mail connection is the real one (no `smtpConnect` handed in — a test hands in its
 * own server), and its settings (the process's, unless a test gives some).
 */
export type MailWhere = { readonly live: boolean; readonly env?: Env };

/** Where an app runs, for `sendingOn`: live unless it was handed its own mail server. */
export function mailWhere(app: { readonly smtpConnect?: Connector | undefined }): MailWhere {
  return { live: app.smtpConnect === undefined };
}

/** 2 Oct 2026: why THIS copy may not send email, in words, or null when it may. */
export function emailPlaceRefusal(where: MailWhere): string | null {
  return placeRefusal({ live: where.live, ...(where.env === undefined ? {} : { env: where.env }), optIn: EMAIL_LOCAL_OPT_IN, service: 'email sending',
    harm: 'An email from here would reach a real person from contact@caprebate.co.uk.' });
}

/**
 * What is still missing before emails can be sent — each in plain words. Empty means sending is on. With `where`
 * (every screen and sender in src/ passes it), whether this copy may send at all is said too.
 */
export function sendingMissing(cfg: EmailSending, login: SmtpLogin | null, where?: MailWhere): string[] {
  const out: string[] = [];
  if (cfg.provider === null) out.push('Choose the email service that will send them.');
  if ((cfg.named_in_privacy_notice !== true || cfg.named_in_engagement_letter !== true) && cfg.papers_waived_for_testing !== true) {
    out.push('Name that service in the privacy notice and in the engagement letter.');
  }
  if (cfg.mailbox_and_dns_ready !== true) out.push('Say who reads contact@caprebate.co.uk, and send one test email from it.');
  if (cfg.provider !== null && login === null) out.push('Add the email service’s login to the server.');
  if (cfg.enabled !== true) out.push('Then switch sending on.');
  const place = where === undefined ? null : emailPlaceRefusal(where);
  if (place !== null) out.push(place);
  return out;
}

/** True only when every condition is met. */
export function sendingOn(cfg: EmailSending, login: SmtpLogin | null, where?: MailWhere): boolean {
  return sendingMissing(cfg, login, where).length === 0;
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
  /** 1 Oct 2026: a reply's In-Reply-To and References — Message-IDs without the angle brackets. */
  readonly in_reply_to?: string | null;
  readonly references?: readonly string[];
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

/** A Message-ID as a reply names it: one plain id with an @, no brackets, spaces or line breaks. */
const MESSAGE_ID = /^[^<>\s@]{1,200}@[^<>\s@]{1,200}$/;

/** The whole message, as SMTP's DATA carries it. Every body part is base64, so no line can begin with a dot. */
export function buildMessage(e: Envelope, messageId: string): string {
  const head = [
    `From: ${headerWords(e.from_header)}`,
    `Reply-To: ${headerWords(e.reply_to)}`,
    `To: ${oneLine(e.to)}`,
    `Subject: ${headerWords(e.subject)}`,
    `Date: ${e.date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${messageId}>`,
    // A reply names what it answers, so the client's mail program keeps the chain together (only a plain id goes).
    ...(e.in_reply_to !== undefined && e.in_reply_to !== null && MESSAGE_ID.test(e.in_reply_to) ? [`In-Reply-To: <${e.in_reply_to}>`] : []),
    ...((e.references ?? []).filter((r) => MESSAGE_ID.test(r)).length === 0 ? []
      : [`References: ${(e.references ?? []).filter((r) => MESSAGE_ID.test(r)).slice(-20).map((r) => `<${r}>`).join(' ')}`]),
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

/**
 * `bounce` is set only when the server refused the recipient or the message: HARD for a 5xx reply (permanent), SOFT
 * for a 4xx (try again later). A failure to connect at all is neither — it says nothing about the address.
 */
export type Delivered =
  | { readonly ok: true; readonly ref: string }
  | { readonly ok: false; readonly why: string; readonly bounce?: { readonly kind: 'HARD' | 'SOFT'; readonly status: string } };

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
  let reason = '';
  const end = (): void => { ended = true; while (waiting.length > 0) waiting.shift()?.(null); };
  sock.on('end', end);
  sock.on('close', end);
  // 1 Oct 2026: say WHY it closed — "wrong version number" is how a secure connection to the wrong port shows itself.
  sock.on('error', (e: Error) => { reason = e.message.replace(/\s+/g, ' ').slice(0, 120); end(); });
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
      if (line === null) return { code: 0, text: text.join(' ') || (reason === '' ? 'the connection closed' : `the connection closed (${reason})`) };
      text.push(line.slice(4));
      if (line.length < 4 || line[3] === ' ') return { code: Number(line.slice(0, 3)) || 0, text: text.join(' ') };
    }
  };
}

/**
 * 1 OCT 2026 — PORT 587 SPEAKS PLAIN FIRST. IONOS takes mail on 465, secure from the first byte, and on 587, where the
 * conversation starts in plain text and becomes secure with STARTTLS before anything private is said. Until today the
 * adapter opened every port as 465, so a key file saying 587 met a server that hung up before its greeting ("0 the
 * connection closed"). Now 465 is secure from the start, and any other port says EHLO, STARTTLS, and only then — on the
 * secure connection — EHLO again and the login. A server that will not go secure is refused: the password is never sent
 * in plain text. A test's own connector is used as it is.
 */
type Opened = { sock: Duplex; read: () => Promise<{ code: number; text: string }>; say: (line: string) => void };

async function openSession(login: SmtpLogin, connect: Connector, domain: string): Promise<{ ok: true; s: Opened; ehlo: { code: number; text: string } } | { ok: false; at: string; r: { code: number; text: string }; s: Opened }> {
  const plain = connect === tlsConnector && login.port !== 465;
  const first = plain ? netConnect({ host: login.host, port: login.port }) : connect(login);
  let s: Opened = { sock: first, read: replyReader(first), say: (line) => { first.write(`${line}\r\n`); } };
  const hello = await s.read();
  if (hello.code !== 220) return { ok: false, at: 'greeting', r: hello, s };
  s.say(`EHLO ${domain}`);
  let ehlo = await s.read();
  if (Math.floor(ehlo.code / 100) !== 2) return { ok: false, at: 'EHLO', r: ehlo, s };
  if (plain) {
    s.say('STARTTLS');
    const go = await s.read();
    if (go.code !== 220) return { ok: false, at: 'STARTTLS', r: go.code === 0 ? go : { code: go.code, text: `it would not make the connection secure: ${go.text}` }, s };
    const secure = tlsConnect({ socket: first as never, servername: login.host });
    s = { sock: secure, read: replyReader(secure), say: (line) => { secure.write(`${line}\r\n`); } };
    s.say(`EHLO ${domain}`);
    ehlo = await s.read();
    if (Math.floor(ehlo.code / 100) !== 2) return { ok: false, at: 'EHLO', r: ehlo, s };
  }
  return { ok: true, s, ehlo };
}

export function smtpProvider(
  login: SmtpLogin, connect: Connector = tlsConnector, timeoutMs = 30_000, record?: ConnectionRecorder,
): EmailProvider & { check(): Promise<{ ok: true } | { ok: false; why: string }> } {
  return {
    id: 'SMTP',
    /** 1 Oct 2026: sign in and out again, sending nothing — "does our login work?". */
    async check() {
      const domain = addressOf(login.user).split('@')[1] ?? 'localhost';
      let opened: Opened | null = null;
      const timer = setTimeout(() => opened?.sock.destroy(new Error('timed out')), timeoutMs);
      try {
        const o = await openSession(login, connect, domain);
        opened = o.s;
        if (!o.ok) return { ok: false, why: `The mail server refused it at ${o.at}: ${`${o.r.code} ${o.r.text}`.slice(0, 200)}` };
        o.s.say(`AUTH PLAIN ${Buffer.from(`\0${login.user}\0${login.password}`, 'utf8').toString('base64')}`);
        const auth = await o.s.read();
        o.s.say('QUIT');
        return auth.code === 235 ? { ok: true } : { ok: false, why: `The mail server did not accept our login: ${`${auth.code} ${auth.text}`.slice(0, 200)}` };
      } catch (err) {
        return { ok: false, why: `Could not reach the mail server: ${err instanceof Error ? err.message : String(err)}` };
      } finally {
        clearTimeout(timer);
        opened?.sock.end();
      }
    },
    async deliver(e: Envelope): Promise<Delivered> {
      const from = addressOf(e.from_header);
      const to = addressOf(e.to);
      if (/[\r\n<>\s]/.test(from) || /[\r\n<>\s]/.test(to)) return { ok: false, why: 'An address is not a plain email address.' };
      // 1 Oct 2026: an invented address (example.invalid, example.com …) never reaches the real mail server, whichever
      // page or command sent it. Found when a local copy, sending on, tried one from the Write an email page.
      if (connect === tlsConnector && isInventedAddress(to)) return { ok: false, why: 'An invented address, so it was not sent.' };
      // 2 Oct 2026: never a real delivery from a copy that is not the test website (unless started to on purpose).
      const place = connect === tlsConnector ? emailPlaceRefusal({ live: true }) : null;
      if (place !== null) return { ok: false, why: place };
      const domain = from.split('@')[1] ?? 'localhost';
      const messageId = `${randomBytes(16).toString('hex')}@${domain}`;
      const started = Date.now();
      let lastCode: number | null = null;
      const done = (outcome: MailConnection['outcome'], messages: number): void => {
        record?.({ service: 'IONOS_SMTP', purpose: 'SEND', outcome, reply_code: lastCode, messages, took_ms: Date.now() - started });
      };
      let opened: Opened | null = null;
      const timer = setTimeout(() => opened?.sock.destroy(new Error('timed out')), timeoutMs);
      /** Null when the reply is the one wanted; else the code and the words, and whether it was the recipient's step. */
      const step = async (line: string | null, want: number): Promise<{ code: number; text: string } | null> => {
        if (opened === null) return { code: 0, text: 'the connection closed' };
        if (line !== null) opened.say(line);
        const r = await opened.read();
        if (r.code !== 0) lastCode = r.code;
        return Math.floor(r.code / 100) === Math.floor(want / 100) ? null : r;
      };
      try {
        const o = await openSession(login, connect, domain);
        opened = o.s;
        if (!o.ok) {
          if (o.r.code !== 0) lastCode = o.r.code;
          done(o.r.code === 0 ? 'FAILED' : 'REFUSED', 0);
          return { ok: false, why: `The mail server refused it: ${`${o.r.code} ${o.r.text}`.slice(0, 200)}` };
        }
        const steps: [string | null, number, boolean][] = [
          [`AUTH PLAIN ${Buffer.from(`\0${login.user}\0${login.password}`, 'utf8').toString('base64')}`, 235, false],
          [`MAIL FROM:<${from}>`, 250, false],
          [`RCPT TO:<${to}>`, 250, true],
          ['DATA', 354, false],
          [`${buildMessage(e, messageId)}\r\n.`, 250, true],
        ];
        for (const [line, want, aboutTheMessage] of steps) {
          const bad = await step(line, want);
          if (bad === null) continue;
          done(bad.code === 0 ? 'FAILED' : 'REFUSED', 0);
          const why = `The mail server refused it: ${`${bad.code} ${bad.text}`.slice(0, 200)}`;
          // Only a refusal of the recipient or the message is a bounce. A refused login is our problem, not the address's.
          if (aboutTheMessage && bad.code >= 400 && bad.code < 600) {
            const enhanced = /\b([245]\.\d{1,3}\.\d{1,3})\b/.exec(bad.text)?.[1];
            return { ok: false, why, bounce: { kind: bad.code >= 500 ? 'HARD' : 'SOFT', status: enhanced ?? String(bad.code) } };
          }
          return { ok: false, why };
        }
        opened.say('QUIT');
        done('OK', 1);
        return { ok: true, ref: messageId };
      } catch (err) {
        done('FAILED', 0);
        return { ok: false, why: `Could not reach the mail server: ${err instanceof Error ? err.message : String(err)}` };
      } finally {
        clearTimeout(timer);
        opened?.sock.end();
      }
    },
  };
}

/* ================================================================== *
 * BOUNCES AND THE ADDRESSES THAT BOUNCED
 * ================================================================== */

/** True when this address bounced HARD and nobody has lifted it since. Asked at the moment of sending. */
export function isSuppressed(db: Db, address: string): boolean {
  const last = db.get<{ state: string }>(
    'SELECT state FROM email_suppressions WHERE address_canonical = ? ORDER BY at DESC, rowid DESC LIMIT 1',
    [addressOf(address).trim().toLowerCase()]);
  return last?.state === 'BOUNCED';
}

/** Write a bounce; a HARD one also suppresses the address it was sent to. Returns the bounce's id. */
export function recordBounce(
  db: Db, now: () => string, outbox_id: string,
  b: { readonly kind: 'HARD' | 'SOFT'; readonly status: string; readonly source: 'SMTP' | 'REPORT' },
): string {
  const id = randomUUID();
  const at = now();
  const status = /^[0-9.]{3,12}$/.test(b.status) ? b.status : b.kind === 'HARD' ? '5.0.0' : '4.0.0';
  db.run('INSERT INTO email_bounces (id, outbox_id, kind, source, status, at) VALUES (?, ?, ?, ?, ?, ?)', [id, outbox_id, b.kind, b.source, status, at]);
  if (b.kind === 'HARD') {
    const to = db.get<{ to_email: string }>('SELECT to_email FROM outbox WHERE id = ?', [outbox_id])?.to_email;
    const canonical = to === undefined ? '' : addressOf(to).trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+$/.test(canonical) && !isSuppressed(db, canonical)) {
      db.run('INSERT INTO email_suppressions (id, address_canonical, state, bounce_id, set_by, at) VALUES (?, ?, ?, ?, NULL, ?)',
        [randomUUID(), canonical, 'BOUNCED', id, at]);
    }
  }
  return id;
}

/** A member of staff says the address works again. A new row; the bounce stays on record. */
export function liftSuppression(db: Db, now: () => string, address: string, by_user_id: string): boolean {
  const canonical = addressOf(address).trim().toLowerCase();
  if (!isSuppressed(db, canonical)) return false;
  db.run('INSERT INTO email_suppressions (id, address_canonical, state, bounce_id, set_by, at) VALUES (?, ?, ?, NULL, ?, ?)',
    [randomUUID(), canonical, 'LIFTED', by_user_id, now()]);
  return true;
}

/** The calendar invitations and signed letters an email carries, in order. */
export function inlineFilesOf(db: Db, outbox_id: string): Attachment[] {
  return db.all<{ filename: string; content_type: string; bytes: Uint8Array }>(
    'SELECT filename, content_type, bytes FROM outbox_inline_files WHERE outbox_id = ? ORDER BY part_no', [outbox_id])
    .map((f) => ({ filename: f.filename, content_type: f.content_type, bytes: new Uint8Array(f.bytes) }));
}

/* ================================================================== *
 * SENDING WHAT IS WAITING
 * ================================================================== */

export type DispatchResult =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'RAN'; readonly sent: number; readonly failed: number; readonly refused: number };

type Waiting = {
  id: string; to_email: string; subject: string; body: string; business_id: string | null;
  from_header: string | null; reply_to: string | null; in_reply_to: string | null; references_ids: string | null;
};

/**
 * PHASE 151k — A SIGN-IN CODE OR A RESET LINK IS NOT KEPT ONCE IT HAS GONE. Until it is sent its body is the email; once
 * it has really been sent (this file, `dispatchOutbox`, which only runs while EMAIL_SENDING is on) the code or the link
 * in it would otherwise sit in `outbox.body` for good, readable by anybody who can read the database. So the body of a
 * SENT email of these kinds is replaced by this one sentence, and who it went to, when, the subject and the kind stay.
 * Migration 058 lets exactly this edit through the outbox's never-edited rule and no other.
 * WHILE SENDING IS OFF NOTHING HERE RUNS: a row saved then is never sent, and on the test website it is the only way to
 * read a sign-in code or a reset link (api/index.mjs prints the outbox to the function log). The Developer Spec says so.
 */
/* Phase 152 (the sweep, 28 September 2026): ACCOUNT_VERIFY too. The email that confirms a new client login carries a
   link that works once and for 24 hours (src/web/signup.ts), the same sort of secret; only its hash is kept in
   client_signups, so the link still works after its words leave the outbox. The sentence now names all three.
   Migration 060 lets this sentence through for the three kinds; a row 058 blanked keeps 058's sentence for good. */
/* 2 Oct 2026: REPORT_FOR_SIGNOFF too — the accountant's one-use sign-off link (src/web/report-signoff.ts); migration 073. */
export const SENT_SECRET_KINDS: readonly string[] = Object.freeze(['SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY', 'REPORT_FOR_SIGNOFF']);
export const SENT_SECRET_BODY = 'This email held a sign-in code or a one-use link. It was sent, and then its words were removed so the code or link is not kept.';

export function blankSentSecrets(db: Db, outbox_id: string): boolean {
  const r = db.run(
    "UPDATE outbox SET body = ? WHERE id = ? AND sent_at IS NOT NULL AND kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY', 'REPORT_FOR_SIGNOFF') AND body <> ?",
    [SENT_SECRET_BODY, outbox_id, SENT_SECRET_BODY]);
  return r.changes > 0;
}

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
    ? d.db.all<Waiting>('SELECT id, to_email, subject, body, business_id, from_header, reply_to, in_reply_to, references_ids FROM outbox WHERE sent_at IS NULL AND send_requested = 1 ORDER BY created_at')
    : d.db.all<Waiting>('SELECT id, to_email, subject, body, business_id, from_header, reply_to, in_reply_to, references_ids FROM outbox WHERE sent_at IS NULL AND send_requested = 1 AND id = ?', [only]);
  let sent = 0, failed = 0, refused = 0;
  for (const r of rows) {
    const fail = (why: string): void => { d.db.run('UPDATE outbox SET last_error = ? WHERE id = ?', [why, r.id]); };
    if (isDoNotContact(d.db, r.to_email, r.business_id)) { refused++; fail('This company is marked do not contact. It was not sent.'); continue; }
    if (isSuppressed(d.db, r.to_email)) { refused++; fail('An earlier email to this address bounced, so it was not sent.'); continue; }
    if (r.from_header === null || r.reply_to === null) { failed++; fail('It has no sender recorded, so it was not sent.'); continue; }
    const files: Attachment[] = [];
    let missing = false;
    for (const a of d.db.all<{ document_id: string }>('SELECT document_id FROM outbox_attachments WHERE outbox_id = ?', [r.id])) {
      const f = await open(a.document_id);
      if (f === null) { missing = true; break; }
      files.push(f);
    }
    if (missing) { failed++; fail('A file it carries is no longer kept, so it was not sent.'); continue; }
    files.push(...inlineFilesOf(d.db, r.id));
    const out = await provider.deliver({
      from_header: r.from_header, reply_to: r.reply_to, to: r.to_email, subject: r.subject, body: r.body,
      attachments: files, date: new Date(d.now()),
      in_reply_to: r.in_reply_to, references: r.references_ids === null ? [] : r.references_ids.split(' '),
    });
    if (out.ok) {
      d.db.run('UPDATE outbox SET sent_at = ?, transport = ?, provider_ref = ?, last_error = NULL WHERE id = ?', [d.now(), provider.id, out.ref, r.id]);
      blankSentSecrets(d.db, r.id);
      sent++;
    } else {
      failed++;
      fail(out.why);
      if (out.bounce !== undefined) recordBounce(d.db, d.now, r.id, { ...out.bounce, source: 'SMTP' });
    }
  }
  return { state: 'RAN', sent, failed, refused };
}
