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
import type { Db } from '../db.ts';

/**
 * CALENDAR_INVITE IS THE SECOND STUBBED TRANSPORT AND IT IS NOT A SECOND STUB.
 *
 * Phase 105's brief names two things as stubbed: outbound email AND calendar
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
   * TEMPLATE — CRM 3 of 10: a staff member's merge of an email template, queued
   * here like everything else. It is not a notice and it is not an invitation,
   * and a screen reading the outbox should be able to say which it was.
   */
  /**
   * COMPLIANCE_LETTER — CRM 8 of 10: a letter the compliance registers draft for a
   * rights request or a complaint. It reaches the outbox and nowhere else.
   */
  /** ACCOUNT_VERIFY — Phase 133j: the link that confirms a client's own sign-up. It carries a single-use token. */
  /** FREE_TYPED — Phase 141: an email a member of staff typed themselves, to one of the company's contacts. */
  /** SIGNED_LETTER — Phase 146f: the client's own copy of the engagement letter they signed, as a PDF. */
  kind: 'PASSWORD_RESET' | 'WELCOME' | 'NOTIFICATION' | 'CALENDAR_INVITE' | 'TEMPLATE' | 'COMPLIANCE_LETTER' | 'ACCOUNT_VERIFY' | 'FREE_TYPED' | 'SIGNED_LETTER';
  /**
   * The organisation the message is about, where there is one. CRM 1 of 10.
   * Optional because a staff password reset is about nobody's organisation —
   * but a message that IS about one must name it, because that is what the
   * DO_NOT_CONTACT refusal reads first.
   */
  business_id?: string | null;
  /**
   * PHASE 141 — what a free-typed email also records: the claim it is about (one of the company's own — a trigger holds
   * it), the lead it was written from, the contact it went to, who wrote it, and the company's files it carries.
   */
  claim_id?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  written_by?: string | null;
  attachments?: readonly { readonly logical_document_id: string; readonly document_id: string }[];
  /**
   * PHASE 146f — a file made for this email that is not one of the company's documents: the calendar invitation
   * (.ics, src/stubs/calendar.ts) or the signed engagement letter (.pdf). Stored with the email, sent with it.
   */
  inline_files?: readonly InlineFile[];
};

export type InlineFile = {
  readonly filename: string;
  readonly content_type: 'text/calendar; method=REQUEST; charset=utf-8' | 'text/calendar; method=CANCEL; charset=utf-8' | 'application/pdf';
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
 * DO_NOT_CONTACT IS A CONTROL, NOT A LABEL. CRM 1 of 10, 10 September 2026.
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
  if (business_id !== null && business_id !== undefined) {
    const b = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM businesses WHERE id = ? AND client_status = 'DO_NOT_CONTACT'", [business_id],
    );
    if ((b?.n ?? 0) > 0) return true;
  }
  const byChannel = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM businesses WHERE client_status = 'DO_NOT_CONTACT' AND lower(contact_email) = lower(?)",
    [to_email],
  );
  if ((byChannel?.n ?? 0) > 0) return true;
  const byContact = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM contacts c JOIN businesses b ON b.id = c.business_id ' +
      "WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(?)",
    [to_email],
  );
  if ((byContact?.n ?? 0) > 0) return true;
  const byLogin = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM users u JOIN businesses b ON b.id = u.business_id ' +
      "WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(?)",
    [to_email],
  );
  return (byLogin?.n ?? 0) > 0;
}

/**
 * PHASE 141 — WHO EVERY EMAIL COMES FROM, AS ONE SETTING. The latest row of `email_sender` (migration 036), which Admin
 * changes on the admin settings screen. Migration 036 writes the first: "Cap Rebate", contact@caprebate.co.uk. No
 * address is written in code; a database with no row at all is refused rather than given a default.
 */
export type Sender = { readonly display_name: string; readonly address: string; readonly reply_to: string; readonly from_header: string };

export function currentSender(db: Db): Sender {
  /* PHASE 151: THE NEWEST ROW WINS, BY WHEN IT WAS WRITTEN, NOT BY THE DATE IT CARRIES. A change is a new row and the
     table is never edited, so the last row written is the last decision. Ordering on set_at let a migration's dated row
     (044, 24 September 2026) outrank a change an administrator made later on a server whose clock read earlier. */
  const r = db.get<{ display_name: string; address: string; reply_to: string }>(
    'SELECT display_name, address, reply_to FROM email_sender ORDER BY rowid DESC LIMIT 1');
  if (r === undefined) throw new Error('no sender is set for email: migration 036 writes one');
  return { ...r, from_header: `${r.display_name} <${r.address}>` };
}

/**
 * THE OUTBOX. `sending` says whether sending is on at the moment a row is written (src/stubs/email-provider.ts); a row
 * written while it is off is saved with `send_requested = 0` and is never sent later. It is off, so today every row is.
 */
export function outboxTransport(db: Db, ids: () => string, now: () => string, sending: () => boolean = () => false): EmailTransport {
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
      db.run(
        'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id, from_header, reply_to, ' +
          'claim_id, lead_id, contact_id, written_by, send_requested) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, now(), m.to_email, m.subject, m.body, m.kind, 'STUB', m.business_id ?? null, from.from_header, from.reply_to,
          m.claim_id ?? null, m.lead_id ?? null, m.contact_id ?? null, m.written_by ?? null, requested],
      );
      for (const a of m.attachments ?? []) {
        db.run('INSERT INTO outbox_attachments (id, outbox_id, logical_document_id, document_id) VALUES (?, ?, ?, ?)',
          [ids(), id, a.logical_document_id, a.document_id]);
      }
      (m.inline_files ?? []).forEach((f, i) => {
        db.run('INSERT INTO outbox_inline_files (id, outbox_id, part_no, filename, content_type, bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [ids(), id, i + 1, f.filename, f.content_type, f.bytes, createHash('sha256').update(f.bytes).digest('hex')]);
      });
      // sent_at stays NULL. Nothing left the building, and the row says so.
      return { id, delivered: false, refused: null };
    },
  };
}

/** The label a screen must show beside anything this transport produced. */
export const STUB_NOTICE =
  'Not sent yet — sending email is not switched on. It is saved in the emails waiting to send.';

/** PHASE 141 — what a person reads after saving an email while sending is off. Lakhbir's words. */
export const SAVED_NOT_SENT = 'Saved — emails are not being sent yet.';
