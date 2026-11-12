/**
 * STUB 1 of 3 — outbound email.
 *
 * THE TOKEN MECHANICS ARE REAL; ONLY THE TRANSPORT IS NOT. A message is written
 * to the `outbox` table and shown on screen, clearly labelled as not sent.
 *
 * Replacing it is a swap, not a search: implement `EmailTransport` and pass it
 * to the application. Nothing else in the codebase mentions email delivery.
 */

import { createHash } from 'node:crypto';
import type { Db } from '../../core/index.ts';
import { plainDashLines, plainDashes } from '../../shared/index.ts';
import { insertOutbox, insertOutboxAttachments, insertOutboxInlineFiles } from '../data.ts';

/**
 * CALENDAR_INVITE IS THE SECOND STUBBED TRANSPORT AND IT IS NOT A SECOND STUB.
 *
 * The booking work's brief names two things as stubbed: outbound email AND calendar
 * invitations, and says both write to this table. An invitation is an email
 * with an attachment, so it goes down the same path rather than acquiring an
 * interface of its own — one thing to replace, and one row shape a screen can
 * label "not sent" without asking which kind it was.
 *
 * WHAT IS NOT REAL, PRECISELY: no message leaves the building and no iCalendar
 * object is generated. `sent_at` stays NULL on every row, which is how a screen
 * knows rather than how it guesses.
 */
export type OutboundMessage = {
  to_email: string;
  subject: string;
  body: string;
  /**
   * THE BRANDED HTML VERSION (Phase 161m2, src/integrations/email/email-layout.ts, brandedEmail), sent beside `body`
   * as multipart/alternative. Absent or null: a plain-text email, exactly as before.
   */
  html?: string | null;
  /**
   * TEMPLATE — CRM 3 of 10: a staff member's merge of an email template, queued
   * here like everything else. It is not a notice and it is not an invitation,
   * and a screen reading the outbox should be able to say which it was.
   */
  /**
   * COMPLIANCE_LETTER — CRM 8 of 10: a letter the compliance registers draft for a
   * rights request or a complaint. It reaches the outbox and nowhere else.
   */
  /** ACCOUNT_VERIFY: the link that confirms a client's own sign-up. It carries a single-use token. */
  /** FREE_TYPED: an email a member of staff typed themselves, to one of the company's contacts. */
  /** SIGNED_LETTER: the client's own copy of the engagement letter they signed, as a PDF. */
  /** SIGN_IN_CODE: a six-digit sign-in code (src/core/sign-in.ts). With PASSWORD_RESET, its words are taken
   *  out of the outbox once it has really been sent (src/integrations/email/email-provider.ts, blankSentSecrets). */
  /** REPORT_FOR_SIGNOFF —: the client's survey report sent to their accountant, the PDF attached, with a
   *  private link that works once (src/modules/survey/report-signoff.ts). Its words leave the outbox once sent, like a sign-in code's. */
  /** RECOVERY_CODE_USED: a recovery code was used to sign in, and how many are left. It carries NO code, so
   *  it is not one of the kinds blankSentSecrets empties: its words stay, as every other email's do. */
  kind: 'PASSWORD_RESET' | 'WELCOME' | 'NOTIFICATION' | 'CALENDAR_INVITE' | 'TEMPLATE' | 'COMPLIANCE_LETTER' | 'ACCOUNT_VERIFY' | 'FREE_TYPED' | 'SIGNED_LETTER' | 'SIGN_IN_CODE' | 'RECOVERY_CODE_USED' | 'REPORT_FOR_SIGNOFF';
  /**
   * The organisation the message is about, where there is one. CRM 1 of 10.
   * Optional because a staff password reset is about nobody's organisation —
   * but a message that IS about one must name it, because that is what the
   * DO_NOT_CONTACT refusal reads first.
   */
  business_id?: string | null;
  /**
   * What a free-typed email also records: the claim it is about (one of the company's own — a trigger holds
   * it), the lead it was written from, the contact it went to, who wrote it, and the company's files it carries.
   */
  claim_id?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  written_by?: string | null;
  attachments?: readonly { readonly logical_document_id: string; readonly document_id: string }[];
  /**
   * A REPLY JOINS ITS CHAIN (migration 065): the chain's key, and the Message-IDs it answers (without the
   * angle brackets), sent as In-Reply-To and References. A new email has none.
   */
  thread_key?: string | null;
  in_reply_to?: string | null;
  references?: readonly string[];
  /**
   * A file made for this email that is not one of the company's documents: the calendar invitation
   * (.ics, src/integrations/email/calendar.ts) or the signed engagement letter (.pdf). Stored with the email, sent with it.
   */
  inline_files?: readonly InlineFile[];
};

export type InlineFile = {
  readonly filename: string;
  /** The return-entries spreadsheet beside a survey report's PDF. */
  readonly content_type: 'text/calendar; method=REQUEST; charset=utf-8' | 'text/calendar; method=CANCEL; charset=utf-8' | 'application/pdf' | 'text/csv; charset=utf-8';
  readonly bytes: Uint8Array;
};

/**
 * `refused` IS NULL FOR A MESSAGE THAT WAS QUEUED, AND NAMES THE REASON FOR ONE
 * THAT WAS NOT. A refused message has no id, because no row was written.
 */
export type SendResult = { id: string | null; delivered: boolean; refused: null | 'DO_NOT_CONTACT' };

export type EmailTransport = {
  readonly id: string;
  readonly delivers: boolean;
  send(m: OutboundMessage): SendResult;
};

/**
 * DO_NOT_CONTACT IS A CONTROL, NOT A LABEL. CRM 1 of 10.
 *
 * AN ORGANISATION MARKED DO_NOT_CONTACT RECEIVES NOTHING THROUGH THIS BUILD —
 * not a calendar invitation, not a notification, not a password reset for a
 * client login that belongs to it. The check is asked of the message's
 * organisation and of the address itself, because a caller that forgot to say
 * which organisation it was writing to must still be refused.
 *
 * THE SAME FOUR TESTS ARE A TRIGGER ON THE OUTBOX (migration 009), in the same
 * order, for the caller that writes a row without coming through here. This
 * function refuses first so that nothing throws on an ordinary path: a booking
 * moved for a do-not-contact client still moves, and the invitation is simply
 * not queued. A REFUSAL IS NOT AN ERROR, AND IT IS NOT A SILENT SUCCESS EITHER —
 * the caller is told `refused`.
 */
export function isDoNotContact(db: Db, to_email: string, business_id: string | null | undefined): boolean {
  if (doNotContactCheck === undefined) throw new Error('The do-not-contact check is not set up. The CRM sets it up when it loads, so no email was written.');
  return doNotContactCheck(db, to_email, business_id);
}

/*
 * WHAT THIS FILE ASKS THE MODULES ABOVE IT: TWO PORTS IT OWNS. Whether an organisation, an address, a
 * contact or a client login is marked DO_NOT_CONTACT is the CRM's to say (its tables: the four tests above, in the
 * same order, in src/modules/clients/do-not-contact.ts); who every email comes from is the admin's setting
 * (src/modules/admin/email-sender.ts). Each module hands its answer in when its front door loads, so the outside
 * services import nothing of a business module. Asked before it is handed in, each refuses rather than guess: no
 * email is written. Declared with `var`, so a hand-in that comes while this file is still loading (a loop through a
 * front door) is kept, not refused.
 */
export type DoNotContactCheck = (db: Db, to_email: string, business_id: string | null | undefined) => boolean;
export type SenderRow = { readonly display_name: string; readonly address: string; readonly reply_to: string };
var doNotContactCheck: DoNotContactCheck | undefined;
var senderRow: ((db: Db) => SenderRow | undefined) | undefined;
export function setDoNotContactCheck(check: DoNotContactCheck): void { doNotContactCheck = check; }
export function setSenderReader(read: (db: Db) => SenderRow | undefined): void { senderRow = read; }

/**
 * WHO EVERY EMAIL COMES FROM, AS ONE SETTING. The latest row of `email_sender` (migration 036), which Admin
 * changes on the admin settings screen. Migration 036 writes the first: "Cap Rebate", contact@caprebate.co.uk. No
 * address is written in code; a database with no row at all is refused rather than given a default.
 */
export type Sender = { readonly display_name: string; readonly address: string; readonly reply_to: string; readonly from_header: string };

export function currentSender(db: Db): Sender {
  /* THE NEWEST ROW WINS, BY WHEN IT WAS WRITTEN, NOT BY THE DATE IT CARRIES. A change is a new row and the
     table is never edited, so the last row written is the last decision. Ordering on set_at let a migration's dated row
     (044, 24 September 2026) outrank a change an administrator made later on a server whose clock read earlier. */
  if (senderRow === undefined) throw new Error('The email sender is not set up. The admin settings set it up when they load, so no email was written.');
  const r = senderRow(db);
  if (r === undefined) throw new Error('no sender is set for email: migration 036 writes one');
  return { ...r, from_header: `${r.display_name} <${r.address}>` };
}

/**
 * THE OUTBOX. `sending` says whether sending is on at the moment a row is written (src/integrations/email/email-provider.ts); a row
 * written while it is off is saved with `send_requested = 0` and is never sent later. It is off, so today every row is.
 */
export function outboxTransport(
  db: Db, ids: () => string, now: () => string, sending: () => boolean = () => false,
): EmailTransport {
  return {
    id: 'STUB',
    delivers: false,
    send(m: OutboundMessage): SendResult {
      if (isDoNotContact(db, m.to_email, m.business_id)) {
        return { id: null, delivered: false, refused: 'DO_NOT_CONTACT' };
      }
      const id = ids();
      const from = currentSender(db);
      const requested = sending() ? 1 : 0;
      // An email that really goes does not tell its reader it has not been sent.
      if (requested === 1) m = { ...m, body: withoutNotSentWords(m.body) };
      // The HTML version too (Phase 161m2): the same sentences, as the layout drew them.
      if (requested === 1 && typeof m.html === 'string') m = { ...m, html: withoutNotSentWordsHtml(m.html) };
      // No long dash in the words we send (src/shared/plain-dashes.ts, line by line), in the
      // subject or the body. Not in an email a member of staff typed themselves (FREE_TYPED): those are their words, as a
      // text box on a screen is left alone. The attached files (the signed letter, a report, a calendar file) are not
      // touched here.
      if (m.kind !== 'FREE_TYPED') m = { ...m, subject: plainDashLines(m.subject), body: plainDashLines(m.body) };
      // The HTML version reads the same as the text: its words between the tags, by the screens' own rule.
      if (m.kind !== 'FREE_TYPED' && typeof m.html === 'string') m = { ...m, html: plainDashes(m.html) };
      const html = typeof m.html === 'string' && m.html !== '' ? m.html : null;
      insertOutbox(db, [id, now(), m.to_email, m.subject, m.body, m.kind, 'STUB', m.business_id ?? null, from.from_header, from.reply_to,
          m.claim_id ?? null, m.lead_id ?? null, m.contact_id ?? null, m.written_by ?? null, requested,
          m.thread_key ?? null, m.in_reply_to ?? null, (m.references ?? []).length === 0 ? null : (m.references ?? []).join(' '), html]);
      for (const a of m.attachments ?? []) {
        insertOutboxAttachments(db, [ids(), id, a.logical_document_id, a.document_id]);
      }
      (m.inline_files ?? []).forEach((f, i) => {
        insertOutboxInlineFiles(db, [ids(), id, i + 1, f.filename, f.content_type, f.bytes, createHash('sha256').update(f.bytes).digest('hex')]);
      });
      // sent_at stays NULL. Nothing left the building, and the row says so.
      return { id, delivered: false, refused: null };
    },
  };
}

/**
 * THE SENTENCES THAT SAY AN EMAIL WAS NOT SENT, written into bodies while sending was off. Taken out of an
 * email that is going, so nobody receives "Not sent yet".
 */
export const NOT_SENT_WORDS: readonly string[] = Object.freeze([
  'Not sent yet. Emails and calendar invites are not switched on yet. This message and its invite are saved with the emails waiting to send.',
  'Not sent yet — sending email is not switched on. It is saved in the emails waiting to send.',
]);

export function withoutNotSentWords(body: string): string {
  let out = body;
  for (const w of NOT_SENT_WORDS) out = out.split(w).join('');
  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

/**
 * THE SAME SENTENCES OUT OF AN HTML VERSION. A sentence that is a paragraph of its own goes with its paragraph, so
 * no empty box is left; anywhere else, the sentence alone.
 */
export function withoutNotSentWordsHtml(html: string): string {
  const words = NOT_SENT_WORDS.map((w) => w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  let out = html.replace(/<p\b[^>]*>([^<]*)<\/p>/g, (p: string, inner: string) => (words.includes(inner.trim()) ? '' : p));
  for (const e of words) out = out.split(e).join('');
  return out;
}

/** An address nobody can receive at — the reserved test names (RFC 2606 and 6761). */
export function isInventedAddress(address: string): boolean {
  const d = (address.split('@').pop() ?? '').trim().toLowerCase().replace(/\.$/, '');
  return /(^|\.)(invalid|test|example|localhost)$/.test(d) || /(^|\.)example\.(com|net|org)$/.test(d);
}

/** The label a screen must show beside anything this transport produced. */
export const STUB_NOTICE =
  'Not sent yet — sending email is not switched on. It is saved in the emails waiting to send.';

/** What a person reads after saving an email while sending is off. the owner's words. */
export const SAVED_NOT_SENT = 'Saved — emails are not being sent yet.';
