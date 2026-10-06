/**
 * PREPARE AND SEND THE ENGAGEMENT LETTER, AND THE SIGNED COPY — PHASE 157c, 6 October 2026.
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
 * THE SIGNED COPY: the signed PDF the signature record holds (src/web/signing.ts), checked against its fingerprint
 * before it is handed to anybody, for the client in the portal and for Sales and Admin on the client page.
 *
 * Nothing here opens signing: ENGAGEMENT_SIGNING decides that, and is off.
 */
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { localWhen } from './localtime.ts';
import { checkSignature, createSignLink, requiredSigners, ENGAGEMENT_SIGNING, SIGN_LINK_DAYS, type EngagementSigning } from './signing.ts';

export type SendDeps = {
  db: Db; audit: AuditLog; email: EmailTransport; now: () => string; newId: () => string; origin?: string;
  /** PHASE 157d: the signing setting this copy runs under. Signing links are made only where it says `links`. */
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
  /** PHASE 157d: who must sign (staff's choice; empty is any one login), and who has. */
  readonly named: readonly { readonly user_id: string; readonly name: string }[];
  readonly signed_by: readonly { readonly user_id: string | null; readonly name: string; readonly signed_at: string; readonly by_link: boolean }[];
};

export function letterState(db: Db, business_id: string): LetterState {
  const e = db.get<{ id: string; letter_state: string; created_at: string; sent_at: string | null; sent_by: string | null; viewed_at: string | null; signed_at: string | null }>(
    'SELECT e.id, e.letter_state, e.created_at, e.sent_at, u.display_name AS sent_by, e.viewed_at, e.signed_at FROM engagements e LEFT JOIN users u ON u.id = e.sent_by WHERE e.business_id = ?',
    [business_id]);
  const logins = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL", [business_id])?.n ?? 0;
  if (e === undefined) return { state: 'NONE', prepared_at: null, sent_at: null, sent_by: null, viewed_at: null, signed_at: null, copy: false, logins, named: [], signed_by: [] };
  const state = e.letter_state as LetterState['state'];
  const signed_by = db.all<{ user_id: string | null; name: string; signed_at: string; origin: string }>(
    'SELECT user_id, signer_name AS name, signed_at, origin FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq ASC', [e.id])
    .map((x) => ({ user_id: x.user_id, name: x.name, signed_at: x.signed_at, by_link: x.origin === 'EMAIL_LINK' }));
  return {
    state, prepared_at: e.created_at, sent_at: e.sent_at, sent_by: e.sent_by, viewed_at: e.viewed_at, signed_at: e.signed_at,
    copy: state === 'SIGNED' && checkSignature(db, e.id).ok, logins,
    named: requiredSigners(db, e.id).map((n) => ({ user_id: n.user_id, name: n.name })), signed_by,
  };
}

/** Raise the letter if need be, mark it sent, and email every client login of the business the link to it. */
export function sendEngagementLetter(d: SendDeps, actor: Actor, business_id: string): { ok: true; resent: boolean; emailed: number } | { ok: false; why: string } {
  const b = d.db.get<{ id: string; name: string }>('SELECT id, name FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) return { ok: false, why: SEND_WORDS.none };
  authorise(actor, 'engagement.send', { type: 'engagement', id: business_id, business_id });
  const now = letterState(d.db, business_id);
  if (now.state === 'SIGNED') return { ok: false, why: SEND_WORDS.signed };
  const logins = d.db.all<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL ORDER BY created_at ASC, id ASC", [business_id]);
  if (logins.length === 0) return { ok: false, why: SEND_WORDS.no_login };
  const at = d.now();
  const resent = now.state === 'SENT' || now.state === 'VIEWED';
  d.db.tx(() => {
    if (now.state === 'NONE') {
      d.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at, sent_at, sent_by) VALUES (?, ?, 'SENT', NULL, ?, ?, ?)",
        [d.newId(), business_id, at, at, actor.id]);
    } else if (now.state === 'NOT_SENT') {
      d.db.run("UPDATE engagements SET letter_state = 'SENT', sent_at = ?, sent_by = ? WHERE business_id = ? AND letter_state = 'NOT_SENT'", [at, actor.id, business_id]);
    }
    d.audit.append({
      at, kind: 'ENGAGEMENT_LETTER_SENT', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'business', object_id: business_id, detail: { resent, logins: logins.length },
    });
  });
  const link = `${d.origin ?? ''}/portal/letter`;
  /* PHASE 157d: where signing links are on, each login is also sent its own single-use link that opens the letter for
     signing without signing in. Where staff named who must sign, only they are sent one. */
  const cfg = d.signing ?? ENGAGEMENT_SIGNING;
  const eng = d.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [business_id]);
  const named = eng === undefined ? [] : requiredSigners(d.db, eng.id).map((n) => n.user_id);
  for (const u of logins) {
    const signLink = cfg.links === true && eng !== undefined && (named.length === 0 || named.includes(u.id))
      ? `${d.origin ?? ''}/sign/${createSignLink(d, eng.id, u, actor.id)}` : null;
    d.email.send({
      to_email: u.email,
      subject: 'Your engagement letter from Cap Rebate',
      body: `Our engagement letter for ${b.name} is ready for you to read${resent ? ' (we are sending the link again)' : ''}.\n\n` +
        (signLink === null ? '' : `Read and sign it here, without signing in: ${signLink}\nThis link is for you only. It works once, for ${String(SIGN_LINK_DAYS)} days.\n\n`) +
        `Or read it, and sign it when you are ready, in your portal: ${link}\nYou will be asked to sign in.\n\n` +
        'It says what we will do, what it costs and what we need from you. Nothing is charged by signing it.',
      kind: 'NOTIFICATION',
      business_id,
    });
  }
  return { ok: true, resent, emailed: logins.length };
}

/** The signed copy, for a login that may read the letter: the PDF, checked against its fingerprint first. */
export function signedCopy(db: Db, actor: Actor, business_id: string): { pdf: Uint8Array; filename: string } | null {
  if (!can(actor, 'engagement.read', { type: 'engagement', id: business_id, business_id })) return null;
  const e = db.get<{ id: string; letter_state: string }>('SELECT id, letter_state FROM engagements WHERE business_id = ?', [business_id]);
  if (e === undefined || e.letter_state !== 'SIGNED' || !checkSignature(db, e.id).ok) return null;
  // PHASE 157d: the latest signature's PDF carries every signature on the letter.
  const r = db.get<{ pdf: Uint8Array; signed_at: string }>('SELECT pdf, signed_at FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq DESC LIMIT 1', [e.id]);
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
