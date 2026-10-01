/**
 * INBOUND_EMAIL — READING REPLIES TO contact@caprebate.co.uk. BUILT, AND SWITCHED OFF. Phase 142, 22 September 2026.
 *
 * Phase 141 wrote the design into the Developer Spec (B48, "Where replies to contact@ will land"); this builds it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * There is no mailbox to read. contact@caprebate.co.uk has to exist first, with its email security records — a board item
 * for Lakhbir, "Create the contact@caprebate.co.uk mailbox and check its email security records" — and which service
 * hosts it is the same question Phase 141 put to him: "Which email service should send our emails from
 * contact@caprebate.co.uk?". The recommendation there is IONOS, the host the privacy notice already names, so this reader
 * speaks IMAP, which IONOS offers. OFF IS EXACTLY TODAY: `readMailbox` returns OFF without opening a connection.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON, AND WHAT IT DOES
 *
 * READ-ONLY. It opens the inbox with EXAMINE, which cannot change a message, and fetches with BODY.PEEK, which does not
 * even mark one read. It never deletes, moves or flags anything: the mailbox stays exactly as the mail program sees it.
 * It remembers the last message number it read in (`inbound_email.mailbox_uid`) and reads only newer ones.
 *
 * WHAT IS KEPT: who it is from, the subject, and THE TEXT PART ONLY. No HTML is kept. A file in the email is counted (its
 * type and size, never its name) and left in the mailbox until a member of staff says what it is — then that one file is
 * read from the mailbox again and goes through the upload path every file takes (src/web/inbound-email.ts).
 *
 * The filing rule lives in src/web/inbound-email.ts: matched by the Message-ID we sent, from one of the company's
 * contacts, or else to a staff queue. Never by the sender's address alone.
 *
 * A small, dependency-free IMAP client over `node:tls`, tested against a fake server in test/phase142.test.ts, in the
 * same way Phase 141's SMTP client is.
 */

import { connect as tlsConnect } from 'node:tls';
import type { Duplex } from 'node:stream';
import { processSecrets, type SecretStore } from '../secrets.ts';
import { EMAIL_PROVIDER_QUESTION, mailLogin, type ConnectionRecorder } from './email-provider.ts';

export type InboundEmail = {
  readonly enabled: boolean;
  /** The mailbox's protocol, by the id of its reader. Null until the provider is chosen. */
  readonly provider: 'IMAP' | null;
  /** contact@caprebate.co.uk exists, and SPF, DKIM and DMARC are set on caprebate.co.uk. */
  readonly mailbox_ready: boolean;
  readonly question: string;
};

/** PHASE 142b: Lakhbir chose IONOS on 22 September 2026, so the mailbox is read over IMAP. Still off: the mailbox is not ready. */
/*
 * SWITCHED ON FOR TESTING, 30 September 2026 (Lakhbir: the IONOS_IMAP_* login added, "lets work on this" — reading
 * clients' email replies into their conversation). Read-only (EXAMINE, BODY.PEEK): nothing in the mailbox is changed or
 * deleted. The first read starts from the inbox as it stands (migration 064), so mail already there is never brought in.
 * The privacy notice is a draft: it is to name this before real clients.
 */
export const INBOUND_EMAIL: InboundEmail = Object.freeze({
  enabled: true,
  provider: 'IMAP',
  /* True since 24 September 2026: contact@ exists and Sadique Maskeen reads it (Word questions 216 and 217, closed).
     Reading replies stays OFF until its IMAP login is in the key file and the switch is turned on. */
  mailbox_ready: true,
  question: EMAIL_PROVIDER_QUESTION,
});

/** The mailbox login, from the key file. Never in code, never in the database, never in the environment. */
export type ImapLogin = { readonly host: string; readonly port: number; readonly user: string; readonly password: string };

/**
 * PHASE 146f: the key file's IONOS_IMAP_* names, read only through `loadSecrets().forOwner('IONOS_MAILBOX')`. Port 993
 * by default. A host that is not an IONOS server is refused as if there were no login (IONOS_HOST).
 */
export function imapLoginFromKeyFile(store: SecretStore = processSecrets()): ImapLogin | null {
  const mine = store.forOwner('IONOS_MAILBOX');
  return mailLogin((n) => mine.get(n), 'IONOS_IMAP', 993);
}

/** What is still missing before replies can be read in — each in plain words. Empty means it is on. */
export function readingMissing(cfg: InboundEmail, login: ImapLogin | null): string[] {
  const out: string[] = [];
  if (cfg.provider === null) out.push('Choose the email service that holds the contact@caprebate.co.uk mailbox.');
  if (cfg.mailbox_ready !== true) out.push('Say who reads contact@caprebate.co.uk, and send one test email from it.');
  if (cfg.provider !== null && login === null) out.push('Add the mailbox’s login to the server.');
  if (cfg.enabled !== true) out.push('Then switch reading replies on.');
  return out;
}

export function readingOn(cfg: InboundEmail, login: ImapLogin | null): boolean {
  return readingMissing(cfg, login).length === 0;
}

/* ================================================================== *
 * READING AN EMAIL — the headers we match on, the text part, and the files counted
 * ================================================================== */

export type EmailFile = { readonly content_type: string; readonly bytes: Uint8Array };

export type ParsedEmail = {
  readonly message_id: string | null;
  /** Every Message-ID named in In-Reply-To and References, without the angle brackets. */
  readonly answers: readonly string[];
  readonly from_address: string;
  readonly subject: string;
  readonly text: string;
  readonly files: readonly EmailFile[];
};

const MAX_TEXT = 20000;

function splitHead(raw: string): { head: string; body: string } {
  const i = raw.search(/\r?\n\r?\n/);
  if (i < 0) return { head: raw, body: '' };
  const m = /\r?\n\r?\n/.exec(raw.slice(i));
  return { head: raw.slice(0, i), body: raw.slice(i + (m?.[0].length ?? 2)) };
}

/** Headers, unfolded, names lower-cased. A repeated header keeps its first value. */
function headers(head: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const c = line.indexOf(':');
    if (c <= 0) continue;
    const k = line.slice(0, c).trim().toLowerCase();
    if (!out.has(k)) out.set(k, line.slice(c + 1).trim());
  }
  return out;
}

/** A header's parameter — boundary, charset — quoted or not. */
function param(value: string, name: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(value);
  return m === null ? null : (m[1] ?? m[2] ?? null);
}

function decodeBody(body: string, encoding: string): Buffer {
  const e = encoding.trim().toLowerCase();
  if (e === 'base64') return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  if (e === 'quoted-printable') {
    const bytes: number[] = [];
    const s = body.replace(/=\r?\n/g, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i] ?? '';
      if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(s.charCodeAt(i) & 0xff);
    }
    return Buffer.from(bytes);
  }
  return Buffer.from(body, 'latin1');
}

function asText(bytes: Buffer, charset: string | null): string {
  const c = (charset ?? 'utf-8').toLowerCase();
  try { return new TextDecoder(c === 'us-ascii' ? 'utf-8' : c).decode(bytes); } catch { return bytes.toString('utf8'); }
}

/** An encoded header word (RFC 2047), base64 or Q, as a person reads it. */
function headerText(v: string): string {
  return v.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64')
      : decodeBody(data.replace(/_/g, ' '), 'quoted-printable');
    return asText(bytes, cs);
  }).replace(/\s+/g, ' ').trim();
}

function ids(v: string | undefined): string[] {
  return [...(v ?? '').matchAll(/<([^<>\s]+)>/g)].map((m) => m[1] ?? '').filter((x) => x !== '');
}

/**
 * READ ONE EMAIL. The first text/plain part is the message; every part that is a file is counted and kept in memory only
 * for as long as the caller needs it. HTML is never kept. Nested parts are followed to a depth of five.
 */
export function parseEmail(raw: Uint8Array): ParsedEmail {
  const all = Buffer.from(raw).toString('latin1');
  const top = splitHead(all);
  const h0 = headers(top.head);
  let text: string | null = null;
  const files: EmailFile[] = [];
  const walk = (head: Map<string, string>, body: string, depth: number): void => {
    const type = head.get('content-type') ?? 'text/plain';
    const kind = type.split(';')[0]?.trim().toLowerCase() ?? 'text/plain';
    const disposition = (head.get('content-disposition') ?? '').toLowerCase();
    if (kind.startsWith('multipart/') && depth < 5) {
      const b = param(type, 'boundary');
      if (b === null) return;
      for (const piece of body.split(`--${b}`).slice(1)) {
        if (piece.startsWith('--')) break;
        const p = splitHead(piece.replace(/^\r?\n/, ''));
        walk(headers(p.head), p.body, depth + 1);
      }
      return;
    }
    const bytes = decodeBody(body, head.get('content-transfer-encoding') ?? '7bit');
    if (kind === 'text/plain' && !disposition.startsWith('attachment') && text === null) {
      text = asText(bytes, param(type, 'charset'));
    } else if (disposition.startsWith('attachment') || !kind.startsWith('text/')) {
      files.push({ content_type: kind.slice(0, 120), bytes: new Uint8Array(bytes) });
    }
  };
  walk(h0, top.body, 0);
  const from = h0.get('from') ?? '';
  const addr = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] ?? /([^\s<>"]+@[^\s<>"]+)/.exec(from)?.[1] ?? '';
  return {
    message_id: ids(h0.get('message-id'))[0] ?? null,
    answers: [...new Set([...ids(h0.get('in-reply-to')), ...ids(h0.get('references'))])],
    from_address: addr.toLowerCase().slice(0, 254),
    subject: headerText(h0.get('subject') ?? '').slice(0, 998),
    text: ((text as string | null) ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT),
    files,
  };
}

/* ================================================================== *
 * A DELIVERY REPORT — PHASE 146f
 * ================================================================== */

/**
 * A BOUNCE THAT ARRIVES LATER. When a server accepts an email and then cannot deliver it, it sends a delivery report
 * back to contact@ (RFC 3464: multipart/report, report-type=delivery-status). It is not a reply, and it is never
 * filed on a company's chat. What is read: whether delivery FAILED (a HARD bounce, status 5.x.x) or is DELAYED (SOFT,
 * 4.x.x), and the Message-ID of the email of ours it is about — from the returned headers inside the report, never
 * from the report's own headers. Nothing else in it is kept.
 */
export type BounceReport = { readonly kind: 'HARD' | 'SOFT'; readonly status: string; readonly original_message_id: string | null };

export function parseBounceReport(raw: Uint8Array): BounceReport | null {
  const all = Buffer.from(raw).toString('latin1');
  const top = splitHead(all);
  const type = headers(top.head).get('content-type') ?? '';
  if (!/^multipart\/report\b/i.test(type) || !/report-type\s*=\s*"?delivery-status"?/i.test(type)) return null;
  const body = top.body.replace(/\r?\n[ \t]+/g, ' ');
  const action = /^Action:\s*(failed|delayed)\b/im.exec(body)?.[1]?.toLowerCase();
  if (action === undefined) return null;
  const status = /^Status:\s*([245]\.\d{1,3}\.\d{1,3})\b/im.exec(body)?.[1] ?? (action === 'failed' ? '5.0.0' : '4.0.0');
  const kind = action === 'failed' && status.startsWith('5') ? 'HARD' : 'SOFT';
  const mid = /^Message-ID:\s*<([^<>\s]+)>/im.exec(body)?.[1] ?? null;
  return { kind, status, original_message_id: mid };
}

/* ================================================================== *
 * THE MAILBOX — IMAP, read-only
 * ================================================================== */

export type RawEmail = { readonly uid: number; readonly raw: Uint8Array };

export interface Mailbox {
  /** Every message with a number above `after`, oldest first. Read-only. */
  since(after: number): Promise<RawEmail[]>;
  /** One message by its number, or null if it is no longer there. Read-only. */
  one(uid: number): Promise<RawEmail | null>;
  /** 30 Sep 2026: the inbox's highest message number (0 when empty), without reading any message. Read-only. */
  highestUid?(): Promise<number>;
  /** 1 Oct 2026: the numbers of the messages that answer an email whose Message-ID ends "@domain" — replies to ours,
   *  whenever they arrived. A read-only search of one header; nothing is fetched. */
  answering?(domain: string): Promise<number[]>;
}

/** A connection to the mail server. Production opens TLS; a test hands in its own socket. */
export type ImapConnector = (login: ImapLogin) => Duplex;

const tlsImap: ImapConnector = (login) => tlsConnect({ host: login.host, port: login.port, servername: login.host });

/** An IMAP string, quoted, with no line break — a login cannot smuggle a second command. */
function quoted(s: string): string {
  return `"${s.replace(/[\r\n]/g, '').replace(/(["\\])/g, '\\$1')}"`;
}

/**
 * ONE CONVERSATION WITH THE SERVER. Reads tagged replies, and the literals ({n} then n bytes) a FETCH returns.
 */
class ImapSession {
  #sock: Duplex;
  #buf = Buffer.alloc(0);
  #wake: (() => void) | null = null;
  #ended = false;
  #tag = 0;

  constructor(sock: Duplex) {
    this.#sock = sock;
    sock.on('data', (c: Buffer) => { this.#buf = Buffer.concat([this.#buf, c]); this.#wake?.(); });
    const end = (): void => { this.#ended = true; this.#wake?.(); };
    sock.on('end', end); sock.on('close', end); sock.on('error', end);
  }

  async #more(): Promise<boolean> {
    if (this.#ended) return false;
    await new Promise<void>((r) => { this.#wake = r; });
    this.#wake = null;
    return true;
  }

  /** One line, without its CRLF; null if the connection ended. */
  async line(): Promise<string | null> {
    for (;;) {
      const i = this.#buf.indexOf('\r\n');
      if (i >= 0) { const l = this.#buf.subarray(0, i).toString('latin1'); this.#buf = this.#buf.subarray(i + 2); return l; }
      if (!(await this.#more())) return null;
    }
  }

  async bytes(n: number): Promise<Buffer | null> {
    while (this.#buf.length < n) if (!(await this.#more())) return null;
    const b = this.#buf.subarray(0, n);
    this.#buf = this.#buf.subarray(n);
    return Buffer.from(b);
  }

  /** Send a command; collect untagged lines, and literals, until its tagged reply. */
  async run(command: string): Promise<{ ok: boolean; lines: string[]; literals: { uid: number; bytes: Buffer }[] }> {
    const tag = `c${++this.#tag}`;
    this.#sock.write(`${tag} ${command}\r\n`);
    const lines: string[] = [];
    const literals: { uid: number; bytes: Buffer }[] = [];
    for (;;) {
      const l = await this.line();
      if (l === null) return { ok: false, lines, literals };
      if (l.startsWith(`${tag} `)) return { ok: /^\S+ OK\b/i.test(l), lines, literals };
      const lit = /\{(\d+)\}$/.exec(l);
      if (lit !== null) {
        const b = await this.bytes(Number(lit[1]));
        if (b === null) return { ok: false, lines, literals };
        literals.push({ uid: Number(/UID (\d+)/i.exec(l)?.[1] ?? NaN), bytes: b });
      }
      lines.push(l);
    }
  }

  end(): void { this.#sock.end(); }
}

/** THE READ-ONLY IMAP MAILBOX. Each call opens, reads and closes: nothing is held open between runs. */
export function imapMailbox(
  login: ImapLogin, connect: ImapConnector = tlsImap, timeoutMs = 30_000, record?: ConnectionRecorder,
): Mailbox {
  const session = async <T>(work: (s: ImapSession) => Promise<T>): Promise<T> => {
    const started = Date.now();
    const sock = connect(login);
    const timer = setTimeout(() => sock.destroy(new Error('timed out')), timeoutMs);
    const s = new ImapSession(sock);
    // PHASE 146f: one audit row per connection — the outcome and how many messages came back, never the login.
    let outcome: 'OK' | 'REFUSED' | 'FAILED' = 'FAILED';
    let messages = 0;
    try {
      const hello = await s.line();
      if (hello === null || !/^\* (OK|PREAUTH)\b/i.test(hello)) throw new Error('the mail server did not say hello');
      if (!(await s.run(`LOGIN ${quoted(login.user)} ${quoted(login.password)}`)).ok) throw new Error('the mailbox refused the login');
      // EXAMINE, NOT SELECT: the inbox is opened read-only, so nothing in it can change.
      if (!(await s.run('EXAMINE INBOX')).ok) throw new Error('the inbox could not be opened');
      const out = await work(s);
      await s.run('LOGOUT');
      outcome = 'OK';
      messages = Array.isArray(out) ? out.length : out === null ? 0 : 1;
      return out;
    } catch (err) {
      if (err instanceof Error && /refused the login|could not be opened|could not be searched/.test(err.message)) outcome = 'REFUSED';
      throw err;
    } finally {
      clearTimeout(timer);
      s.end();
      record?.({ service: 'IONOS_IMAP', purpose: 'READ', outcome, reply_code: null, messages, took_ms: Date.now() - started });
    }
  };
  const fetchUids = async (s: ImapSession, uids: number[]): Promise<RawEmail[]> => {
    const out: RawEmail[] = [];
    for (const uid of uids) {
      // BODY.PEEK: reading it does not even mark it read.
      const r = await s.run(`UID FETCH ${uid} (UID BODY.PEEK[])`);
      const got = r.literals[0];
      if (r.ok && got !== undefined) out.push({ uid: Number.isFinite(got.uid) ? got.uid : uid, raw: new Uint8Array(got.bytes) });
    }
    return out;
  };
  return {
    since: (after) => session(async (s) => {
      const r = await s.run(`UID SEARCH UID ${after + 1}:*`);
      if (!r.ok) throw new Error('the inbox could not be searched');
      // "n:*" always includes the newest message, even one at or below n — so the list is filtered here.
      const uids = r.lines.filter((l) => /^\* SEARCH\b/i.test(l)).flatMap((l) => l.replace(/^\* SEARCH/i, '').trim().split(/\s+/))
        .map(Number).filter((n) => Number.isInteger(n) && n > after).sort((a, b) => a - b);
      return fetchUids(s, uids);
    }),
    one: (uid) => session(async (s) => (await fetchUids(s, [uid]))[0] ?? null),
    answering: (domain) => session(async (s) => {
      if (!/^[a-z0-9.-]+$/i.test(domain)) return [];
      const r = await s.run(`UID SEARCH HEADER IN-REPLY-TO "@${domain}"`);
      if (!r.ok) throw new Error('the inbox could not be searched');
      return r.lines.filter((l) => /^\* SEARCH\b/i.test(l)).flatMap((l) => l.replace(/^\* SEARCH/i, '').trim().split(/\s+/))
        .map(Number).filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
    }),
    highestUid: () => session(async (s) => {
      const r = await s.run('UID SEARCH ALL');
      if (!r.ok) throw new Error('the inbox could not be searched');
      const uids = r.lines.filter((l) => /^\* SEARCH\b/i.test(l)).flatMap((l) => l.replace(/^\* SEARCH/i, '').trim().split(/\s+/)).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      return uids.length === 0 ? 0 : Math.max(...uids);
    }),
  };
}
