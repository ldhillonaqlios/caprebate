/**
 * PREPARE AND SEND THE ENGAGEMENT LETTER, AND THE SIGNED COPY.
 *
 * The Friary House run (04-phase-work/sim-2026-10-06, finding F21) found that nothing in the application prepared or
 * sent an engagement letter: only the seed wrote one. So a new client's portal said "No engagement letter has been
 * prepared yet" for ever, and the claim's own next action, "Prepare and send the engagement letter", could not be done.
 *
 * SENDING (Sales and Admin, `engagement.send`): the letter is raised for the client if it has none, marked SENT with the
 * moment and who sent it, and every client login of the business is emailed the link to read and sign it in the portal
 * (through the outbox: sent the day email sending is on). Sending again re-sends the email; the first sent moment stays.
 * Refused, in plain words, when the letter is already signed, or when the client has no login to read it with.
 *
 * THE SIGNED COPY: the signed PDF the signature record holds (src/modules/claims/signing.ts), checked against its fingerprint
 * before it is handed to anybody, for the client in the portal and for Sales and Admin on the client page.
 *
 * Nothing here opens signing: ENGAGEMENT_SIGNING decides that (on since 11 Nov 2026; its signing links stay off).
 */
import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import type { EmailTransport } from '../../integrations/index.ts';
import { brandedEmail, type EmailContent } from '../../integrations/index.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { getAuditLogCountByKindObjectIdOnce } from '../../core/index.ts';
import { localWhen, ukDate, workingDaysSince } from '../../shared/index.ts';
import { checkSignature, createSignLink, requiredSigners, ENGAGEMENT_SIGNING, SIGN_LINK_DAYS, type EngagementSigning } from './signing.ts';
import { getUsersCountByBusinessIdRole, listUsersIdEmailByBusinessIdRole } from '../../core/index.ts';
import { listEngagementsIdBusinessIdSentAtUnsigned } from './data.ts';
import { getEngagementSignaturesPdfSignedAtByEngagementId, getEngagementsIdByBusinessId, getEngagementsIdLetterStateByBusinessId, getEngagementsIdLetterStateByBusinessId2, insertEngagements, listEngagementSignaturesUserIdNameByEngagementId, updateEngagementsLetterStateSentAtByBusinessIdLetterState } from './data.ts';
import { getBusinessesIdNameById } from '../clients/index.ts';

export type SendDeps = {
  db: Db; audit: AuditLog; email: EmailTransport; now: () => string; newId: () => string; origin?: string;
  /** The signing setting this copy runs under. Signing links are made only where it says `links`. */
  signing?: EngagementSigning;
};

export const SEND_WORDS = Object.freeze({
  signed: 'This client has already signed the letter. There is nothing to send.',
  no_login: 'This client has no login yet, so they could not read the letter. Ask them to make one. The thank-you page after the assessment offers it.',
  none: 'There is no such client.',
});

export type LetterState = {
  readonly state: 'NONE' | 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED';
  readonly prepared_at: string | null;
  readonly sent_at: string | null;
  readonly sent_by: string | null;
  readonly viewed_at: string | null;
  readonly signed_at: string | null;
  /** A signed copy can be handed out: the letter is signed and its record checks out. */
  readonly copy: boolean;
  readonly logins: number;
  /** Who must sign (staff's choice; empty is any one login), and who has. */
  readonly named: readonly { readonly user_id: string; readonly name: string }[];
  readonly signed_by: readonly { readonly user_id: string | null; readonly name: string; readonly signed_at: string; readonly by_link: boolean }[];
};

export function letterState(db: Db, business_id: string): LetterState {
  const e = getEngagementsIdLetterStateByBusinessId<{ id: string; letter_state: string; created_at: string; sent_at: string | null; sent_by: string | null; viewed_at: string | null; signed_at: string | null }>(db, [business_id]);
  const logins = getUsersCountByBusinessIdRole<{ n: number }>(db, [business_id])?.n ?? 0;
  if (e === undefined) return { state: 'NONE', prepared_at: null, sent_at: null, sent_by: null, viewed_at: null, signed_at: null, copy: false, logins, named: [], signed_by: [] };
  const state = e.letter_state as LetterState['state'];
  const signed_by = listEngagementSignaturesUserIdNameByEngagementId<{ user_id: string | null; name: string; signed_at: string; origin: string }>(db, [e.id])
    .map((x) => ({ user_id: x.user_id, name: x.name, signed_at: x.signed_at, by_link: x.origin === 'EMAIL_LINK' }));
  return {
    state, prepared_at: e.created_at, sent_at: e.sent_at, sent_by: e.sent_by, viewed_at: e.viewed_at, signed_at: e.signed_at,
    copy: state === 'SIGNED' && checkSignature(db, e.id).ok, logins,
    named: requiredSigners(db, e.id).map((n) => ({ user_id: n.user_id, name: n.name })), signed_by,
  };
}

/** Raise the letter if need be, mark it sent, and email every client login of the business the link to it. */
export function sendEngagementLetter(d: SendDeps, actor: Actor, business_id: string): { ok: true; resent: boolean; emailed: number } | { ok: false; why: string } {
  const b = getBusinessesIdNameById<{ id: string; name: string }>(d.db, [business_id]);
  if (b === undefined) return { ok: false, why: SEND_WORDS.none };
  authorise(actor, 'engagement.send', { type: 'engagement', id: business_id, business_id });
  const now = letterState(d.db, business_id);
  if (now.state === 'SIGNED') return { ok: false, why: SEND_WORDS.signed };
  const logins = listUsersIdEmailByBusinessIdRole<{ id: string; email: string }>(d.db, [business_id]);
  if (logins.length === 0) return { ok: false, why: SEND_WORDS.no_login };
  const at = d.now();
  const resent = now.state === 'SENT' || now.state === 'VIEWED';
  d.db.tx(() => {
    if (now.state === 'NONE') {
      insertEngagements(d.db, [d.newId(), business_id, at, at, actor.id]);
    } else if (now.state === 'NOT_SENT') {
      updateEngagementsLetterStateSentAtByBusinessIdLetterState(d.db, [at, actor.id, business_id]);
    }
    d.audit.append({
      at, kind: 'ENGAGEMENT_LETTER_SENT', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'business', object_id: business_id, detail: { resent, logins: logins.length },
    });
  });
  const link = `${d.origin ?? ''}/portal/letter`;
  /* Where signing links are on, each login is also sent its own single-use link that opens the letter for
     signing without signing in. Where staff named who must sign, only they are sent one. */
  const cfg = d.signing ?? ENGAGEMENT_SIGNING;
  const eng = getEngagementsIdByBusinessId<{ id: string }>(d.db, [business_id]);
  const named = eng === undefined ? [] : requiredSigners(d.db, eng.id).map((n) => n.user_id);
  for (const u of logins) {
    const signLink = cfg.links === true && eng !== undefined && (named.length === 0 || named.includes(u.id))
      ? `${d.origin ?? ''}/sign/${createSignLink(d, eng.id, u, actor.id)}` : null;
    const e = brandedEmail(letterReadyEmail(b.name, link, signLink), { publicOrigin: d.origin ?? null });
    d.email.send({ to_email: u.email, subject: e.subject, body: e.text, html: e.html, kind: 'NOTIFICATION', business_id });
  }
  return { ok: true, resent, emailed: logins.length };
}

/**
 * THE LETTER-READY EMAIL (Phase 161m2, emails.py "letter-ready", the approved words). Its button opens the letter: the
 * login's own signing link where signing links are on (single use, SIGN_LINK_DAYS), otherwise the letter in the portal.
 * With a signing link, one sentence more says it is theirs alone and when it stops working, and where else to read it.
 */
export function letterReadyEmail(organisation: string, letterLink: string, signLink: string | null): EmailContent {
  return {
    subject: 'Your engagement letter from Cap Rebate',
    preheader: 'Please read and sign it in your portal.',
    heading: 'Your engagement letter is ready',
    blocks: [
      `Our engagement letter for ${organisation} is ready for you to read and sign.`,
      'It sets out what we will do, our fee and what we need from you. In short:',
      { kind: 'bullets', items: [
        'our fee is 3% of the capital allowances identified;',
        'it is invoiced only when we deliver our report, and nothing is charged up front;',
        // Split in two from emails.py's one sentence, for the plain-words check (grade 9)
        'the letter lets us request the documents we need on your behalf, such as purchase and lease papers. We can ask your advisers and others for them.',
      ] },
      `Only a director, partner, member or owner of ${organisation} should sign it. Signing takes about two minutes: you type your name and confirm you may sign for the business.`,
      ...(signLink === null ? [] : [`The button below is just for you. It works once, for ${String(SIGN_LINK_DAYS)} days. You can also read and sign the letter in your portal: ${letterLink}`]),
      'If anything is unclear, reply to this email before you sign.',
    ],
    button: { label: 'Read and sign the letter', href: signLink ?? letterLink },
    sign: 'The Cap Rebate team',
  };
}

/** THE LETTER-REMINDER EMAIL (emails.py "letter-reminder", the approved words). */
export function letterReminderEmail(organisation: string, sentDate: string, letterLink: string): EmailContent {
  return {
    subject: 'Your engagement letter is waiting for you',
    preheader: 'When you are ready, you can read and sign it in your portal.',
    heading: 'Your engagement letter is waiting for you',
    blocks: [
      `We sent our engagement letter for ${organisation} on ${sentDate}. It has not been signed yet.`,
      'There is no rush. When you are ready, you can read and sign it in your portal. If you have a question first, or would rather not go ahead, just reply and let us know.',
    ],
    button: { label: 'Read the letter', href: letterLink },
    sign: 'The Cap Rebate team',
  };
}

/** The reminder goes this many working days (England and Wales: weekdays, not bank holidays) after the letter was sent. */
export const LETTER_REMINDER_WORKING_DAYS = 5;

/**
 * THE ONE REMINDER ABOUT AN UNSIGNED LETTER (Phase 161m2), for a timer. Every letter sent (or opened) and not signed,
 * whose first sending was LETTER_REMINDER_WORKING_DAYS or more working days before `now`, and that has never been
 * reminded: every client login of the business is emailed once, and an ENGAGEMENT_LETTER_REMINDED row records it, so it
 * is never sent twice, whatever the outbox did (a do-not-contact client is refused there, as every email is). A letter
 * with no client login is left: it could not have been sent. Returns how many letters were reminded and emails queued.
 */
export function letterRemindersDue(
  app: { readonly db: Db; readonly audit: AuditLog; readonly email: EmailTransport }, now: string, origin: string | null = process.env.CAPREBATE_PUBLIC_ORIGIN ?? null,
): { reminded: number; queued: number } {
  const base = (origin ?? '').replace(/\/+$/, '');
  let reminded = 0, queued = 0;
  for (const r of listEngagementsIdBusinessIdSentAtUnsigned<{ id: string; business_id: string; sent_at: string }>(app.db)) {
    if (workingDaysSince(r.sent_at, now) < LETTER_REMINDER_WORKING_DAYS) continue;
    if ((getAuditLogCountByKindObjectIdOnce<{ n: number }>(app.db, ['ENGAGEMENT_LETTER_REMINDED', r.id])?.n ?? 0) > 0) continue;
    const b = getBusinessesIdNameById<{ id: string; name: string }>(app.db, [r.business_id]);
    const logins = listUsersIdEmailByBusinessIdRole<{ id: string; email: string }>(app.db, [r.business_id]);
    if (b === undefined || logins.length === 0) continue;
    const e = brandedEmail(letterReminderEmail(b.name, ukDate(r.sent_at), `${base}/portal/letter`), { publicOrigin: origin });
    let n = 0;
    for (const u of logins) {
      if (app.email.send({ to_email: u.email, subject: e.subject, body: e.text, html: e.html, kind: 'NOTIFICATION', business_id: b.id }).refused === null) n++;
    }
    app.audit.append({
      at: now, kind: 'ENGAGEMENT_LETTER_REMINDED', outcome: n > 0 ? 'ALLOWED' : 'REFUSED', actor_id: null, actor_role: null,
      object_type: 'engagement', object_id: r.id, detail: { business: b.id, logins: logins.length, queued: n },
    });
    reminded++; queued += n;
  }
  return { reminded, queued };
}

/** The signed copy, for a login that may read the letter: the PDF, checked against its fingerprint first. */
export function signedCopy(db: Db, actor: Actor, business_id: string): { pdf: Uint8Array; filename: string } | null {
  if (!can(actor, 'engagement.read', { type: 'engagement', id: business_id, business_id })) return null;
  const e = getEngagementsIdLetterStateByBusinessId2<{ id: string; letter_state: string }>(db, [business_id]);
  if (e === undefined || e.letter_state !== 'SIGNED' || !checkSignature(db, e.id).ok) return null;
  // The latest signature's PDF carries every signature on the letter.
  const r = getEngagementSignaturesPdfSignedAtByEngagementId<{ pdf: Uint8Array; signed_at: string }>(db, [e.id]);
  if (r === undefined) return null;
  return { pdf: new Uint8Array(r.pdf), filename: `engagement-letter-signed-${r.signed_at.slice(0, 10)}.pdf` };
}

/** The letter's steps in words, for the client page and the portal. */
export function letterSteps(s: LetterState): string[] {
  const w = (t: string | null) => (t === null ? null : localWhen(t));
  return [
    s.prepared_at === null ? 'Not prepared yet.' : `Prepared ${w(s.prepared_at) as string}.`,
    ...(s.sent_at === null ? [] : [`Sent ${w(s.sent_at) as string}${s.sent_by === null ? '' : `, by ${s.sent_by}`}.`]),
    ...(s.viewed_at === null ? [] : [`First opened by the client ${w(s.viewed_at) as string}.`]),
    ...(s.named.length === 0 ? [] : [`To be signed by ${s.named.map((n) => n.name).join(' and ')}.`]),
    ...s.signed_by.map((x) => `Signed by ${x.name} ${w(x.signed_at) as string}${x.by_link ? ', from the emailed link' : ''}.`),
    ...(s.state !== 'SIGNED' && s.signed_by.length > 0 ? ['Waiting for the other signature.'] : []),
  ];
}
