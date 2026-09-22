/**
 * THE BUILT-IN SIGNATURE FOR THE ENGAGEMENT LETTER — BUILT, AND SWITCHED OFF. Phase 146f, 22 September 2026.
 *
 * Lakhbir decided on 22 September 2026 that the letter is signed inside the application, not through a bought
 * service. It replaces the stub provider in src/stubs/signature.ts for the engagement letter. The surveyor's "commit
 * figures" is a different thing and is untouched.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THE CLIENT DOES
 *
 * Reads the letter in the portal, types their full name, types their role in the business, ticks that they are
 * authorised to sign for it, and presses Sign. That is all. Nothing is drawn and nothing is uploaded.
 *
 * WHAT IS RECORDED — engagement_signatures (migration 040), one row, never edited:
 *   the name and role typed, the business as it was named on the letter, the moment, the IP address the request came
 *   from, the session's id (never its token), the login, the EXACT letter text shown and its SHA-256, and a signed PDF
 *   (the letter, then a signature page) with its SHA-256. A SHA-256 over all of it, in a fixed order, is the record's
 *   own hash, and it goes into the audit chain as an ENGAGEMENT_SIGNED row. The chain is tamper-evident, so the record
 *   cannot be changed afterwards without the chain showing it.
 *
 * WHY THE NAME IS NOT IN THE AUDIT ROW ITSELF. src/audit.ts refuses any name, email or address in a log line, and that
 * is a data protection officer's determination, not a choice. The row carries the record's hash, which binds the
 * name, role, business, time, address and session exactly as well — change any of them and the hash no longer matches.
 *
 * THE LETTER THEY SIGN IS THE LETTER THEY SAW. The page carries the SHA-256 of the text it drew; the Sign press sends
 * it back; the server draws the letter again and compares. If the letter file changed in between, nothing is signed
 * and the client is asked to read it again.
 *
 * AND THEY GET A COPY. The signed PDF is emailed to the address of the login that signed, through the outbox — sent
 * the day EMAIL_SENDING is on, saved until then.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF — ENGAGEMENT_SIGNING
 *
 *   1. Our solicitor has not yet confirmed that a typed name, with a tick for authority, is a good enough signature for
 *      this letter. It is asked in the Word questions document under the solicitor, under SIGNING_QUESTION's title.
 *   2. The letter still has terms in square brackets (clauses 4, 5, 7 and 13) and specimen wording. A letter with a
 *      blank in it is not signed, whatever the switch says: that refusal is here, not on the page.
 *   3. Then someone switches it on.
 *
 * NOTHING HERE THROWS ON AN ORDINARY REFUSAL. Off, already signed, not sent yet, a blank name, no tick, a changed
 * letter: each is a sentence the client reads.
 */

import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';
import type { Actor } from '../authz.ts';
import { loadLetter } from './letter.ts';
import { engagement, readBusiness } from './portal.ts';
import { localWhen } from './localtime.ts';
import { buildPdf, flow, type PdfLine } from './pdf.ts';

export type EngagementSigning = {
  readonly enabled: boolean;
  /** Our solicitor has confirmed that a typed name and a tick for authority suit this letter. */
  readonly solicitor_confirmed: boolean;
  readonly question: string;
};

/** The question under the solicitor in the Word questions document. Quoted, not paraphrased. */
export const SIGNING_QUESTION =
  'Is a typed name, with a tick to say they may sign for the business, a good enough signature on our engagement letter?';

export const ENGAGEMENT_SIGNING: EngagementSigning = Object.freeze({
  enabled: false,
  solicitor_confirmed: false,
  question: SIGNING_QUESTION,
});

/* ================================================================== *
 * THE LETTER AS SHOWN
 * ================================================================== */

export type ShownLetter = {
  readonly paragraphs: readonly { readonly text: string; readonly heading: boolean }[];
  /** The exact text drawn, one paragraph a line. What is hashed and what is kept. */
  readonly text: string;
  readonly sha256: string;
  readonly open_terms: number;
  readonly specimens: number;
  readonly business_name: string;
};

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function shownLetter(business: { name: string; company_number?: string | null }, path?: string): ShownLetter {
  const letter = loadLetter({
    clientName: business.name,
    ...(business.company_number === undefined || business.company_number === null ? {} : { companyNumber: business.company_number }),
    ...(path === undefined ? {} : { path }),
  });
  const text = letter.paragraphs.map((p) => p.text).join('\n');
  return {
    paragraphs: letter.paragraphs, text, sha256: sha256(text),
    open_terms: letter.openTerms.length, specimens: letter.specimens.length, business_name: business.name,
  };
}

/** What is still missing before a client can sign — each in plain words. Empty means signing is on for this letter. */
export function signingMissing(cfg: EngagementSigning, letter: Pick<ShownLetter, 'open_terms' | 'specimens'>): string[] {
  const out: string[] = [];
  if (cfg.solicitor_confirmed !== true) out.push('Our solicitor must confirm that typing your name is a good enough way to sign this letter.');
  if (letter.open_terms > 0 || letter.specimens > 0) out.push('Some terms in the letter are not settled yet, so it cannot be signed.');
  if (cfg.enabled !== true) out.push('Then signing must be switched on.');
  return out;
}

/* ================================================================== *
 * THE RECORD
 * ================================================================== */

export type SignatureFields = {
  readonly id: string;
  readonly engagement_id: string;
  readonly business_id: string;
  readonly origin: 'PORTAL' | 'SEED';
  readonly user_id: string | null;
  readonly session_id: string | null;
  readonly signer_name: string;
  readonly signer_role: string;
  readonly business_name: string;
  readonly signed_at: string;
  readonly ip: string;
  readonly letter_sha256: string;
  readonly pdf_sha256: string;
};

/** The record's own hash: every field, in this order, joined by a line feed. Changing any one changes it. */
export function recordHash(f: SignatureFields): string {
  return sha256([
    'caprebate-engagement-signature-v1', f.id, f.engagement_id, f.business_id, f.origin, f.user_id ?? '', f.session_id ?? '',
    f.signer_name, f.signer_role, f.business_name, 'authority_confirmed', f.signed_at, f.ip, f.letter_sha256, f.pdf_sha256,
  ].join('\n'));
}

/** The signed PDF: the letter as shown, then a signature page. */
export function signedPdf(letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256'>): Uint8Array {
  const body: PdfLine[] = letter.paragraphs.map((p) => (p.heading ? { text: p.text, bold: true, gap: 4 } : { text: p.text }));
  const page: PdfLine[] = [
    { text: 'Signature page', bold: true, size: 14, gap: 10 },
    { text: `Signed online by: ${f.signer_name}` },
    { text: `Their role: ${f.signer_role}` },
    { text: `For: ${f.business_name}. They confirmed they may sign for it.` },
    { text: `Signed: ${localWhen(f.signed_at)} (${f.signed_at} UTC)` },
    { text: `From the internet address: ${f.ip}` },
    { text: `Signature record: ${f.id}` },
    { text: `Session: ${f.session_id ?? 'none (demonstration data)'}` },
    { text: 'The letter above is the exact text they saw when they signed. Its digital fingerprint is:', gap: 2 },
    { text: f.letter_sha256, size: 9 },
    { text: 'It was signed in the Cap Rebate portal. CAP REBATE LTD keeps the signature record. A fingerprint of it is in our audit log, which cannot be changed.' },
  ];
  return buildPdf([...flow(body), ...flow(page)], { title: `Engagement letter, signed by ${f.signer_name}` }).bytes;
}

type Deps = { db: Db; audit: AuditLog; email: EmailTransport; now: () => string; newId: () => string };

/** Write one record, move the letter to SIGNED, and bind the record into the audit chain. One transaction. */
function writeSignature(
  d: Pick<Deps, 'db' | 'audit'>, engagement_id: string, letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256' | 'letter_sha256'>,
  actor: { id: string | null; role: string },
): { record_sha256: string; pdf: Uint8Array } {
  const base = { ...f, letter_sha256: letter.sha256 };
  const pdf = signedPdf(letter, base);
  const full: SignatureFields = { ...base, pdf_sha256: sha256(pdf) };
  const record_sha256 = recordHash(full);
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
        'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)',
      [full.id, engagement_id, full.business_id, full.origin, full.user_id, full.session_id, full.signer_name, full.signer_role, full.business_name,
        full.signed_at, full.ip, letter.text, full.letter_sha256, pdf, full.pdf_sha256, record_sha256]);
    d.db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE id = ?", [full.signed_at, engagement_id]);
    d.audit.append({
      at: full.signed_at, kind: 'ENGAGEMENT_SIGNED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'engagement', object_id: engagement_id,
      detail: { signature: full.id, record: record_sha256, letter: full.letter_sha256, pdf: full.pdf_sha256, session: full.session_id, origin: full.origin },
    });
  });
  return { record_sha256, pdf };
}

export type SignInput = { readonly full_name: string; readonly role: string; readonly authorised: boolean; readonly letter_sha256: string };
export type SignContext = { readonly ip: string; readonly session_id: string };

/** Plain words for every refusal. */
export const SIGN_WORDS = Object.freeze({
  already: 'This letter is already signed. You do not need to sign it again.',
  not_sent: 'This letter has not been sent to you yet, so it cannot be signed.',
  none: 'There is no engagement letter for your business yet.',
  name: 'Type your full name, as you would sign it: your first name and your last name.',
  role: 'Type your role in the business, for example Director or Partner.',
  authorised: 'Tick the box to confirm you may sign this letter for the business.',
  changed: 'The letter changed while you were reading it. Please read it again, then sign.',
});

function fullName(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 200) return null;
  const words = t.split(' ').filter((w) => /\p{L}/u.test(w));
  return words.length >= 2 ? t : null;
}

/**
 * THE CLIENT SIGNS. The client's own business only (readBusiness refuses any other), the switch on, the letter complete,
 * sent to them and not yet signed, a full name, a role, the tick, and the fingerprint of the letter they read.
 */
export function signEngagement(
  d: Deps, actor: Actor, business_id: string, input: SignInput, ctx: SignContext,
  opts: { cfg?: EngagementSigning; letterPath?: string } = {},
): { ok: true; signature_id: string; record_sha256: string } | { ok: false; why: string } {
  const b = readBusiness(d.db, actor, business_id);
  if (actor.role !== 'CLIENT' || actor.business_id !== b.id) return { ok: false, why: 'Only the client can sign their own engagement letter.' };
  const e = engagement(d.db, actor, b.id);
  if (e === null) return { ok: false, why: SIGN_WORDS.none };
  if (e.state === 'SIGNED') return { ok: false, why: SIGN_WORDS.already };
  if (e.state === 'NOT_SENT') return { ok: false, why: SIGN_WORDS.not_sent };
  const letter = shownLetter(b, opts.letterPath);
  const missing = signingMissing(opts.cfg ?? ENGAGEMENT_SIGNING, letter);
  if (missing.length > 0) return { ok: false, why: `Signing is not switched on yet. ${missing[0]}` };
  const name = fullName(input.full_name);
  if (name === null) return { ok: false, why: SIGN_WORDS.name };
  const role = input.role.replace(/\s+/g, ' ').trim();
  if (role.length < 2 || role.length > 120) return { ok: false, why: SIGN_WORDS.role };
  if (input.authorised !== true) return { ok: false, why: SIGN_WORDS.authorised };
  if (input.letter_sha256 !== letter.sha256) return { ok: false, why: SIGN_WORDS.changed };

  const eng = d.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [b.id]);
  if (eng === undefined) return { ok: false, why: SIGN_WORDS.none };
  const id = d.newId();
  const signed_at = d.now();
  const ip = ctx.ip.replace(/[^0-9A-Fa-f.:]/g, '').slice(0, 64) || 'unknown';
  const { record_sha256, pdf } = writeSignature(d, eng.id, letter, {
    id, engagement_id: eng.id, business_id: b.id, origin: 'PORTAL', user_id: actor.id, session_id: ctx.session_id,
    signer_name: name, signer_role: role, business_name: b.name, signed_at, ip,
  }, { id: actor.id, role: actor.role });

  // Their copy, to the address of the login that signed. Saved to the outbox; sent the day sending is on.
  const to = d.db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [actor.id])?.email;
  if (to !== undefined) {
    d.email.send({
      to_email: to,
      subject: 'Your signed engagement letter',
      body: `Thank you. You signed our engagement letter for ${b.name} on ${localWhen(signed_at)}.\n\n` +
        'Your signed copy is attached. It ends with a signature page that shows what was recorded.\n\n' +
        'Not sent yet. Sending email is not switched on. This message and your copy are saved with the emails waiting to send.',
      kind: 'SIGNED_LETTER',
      business_id: b.id,
      inline_files: [{ filename: 'engagement-letter-signed.pdf', content_type: 'application/pdf', bytes: pdf }],
    });
  }
  return { ok: true, signature_id: id, record_sha256 };
}

/**
 * DEMONSTRATION DATA ONLY: a signature record for an engagement the seed or a test marks signed, so that
 * assertSignedEngagement — which now reads the record — finds one. origin = 'SEED'; no login and no session.
 */
export function seedSignatureRecord(
  d: Pick<Deps, 'db' | 'audit' | 'now' | 'newId'>, business_id: string, signed_at?: string,
): string {
  const b = d.db.get<{ name: string; company_number: string | null }>('SELECT name, company_number FROM businesses WHERE id = ?', [business_id]);
  const eng = d.db.get<{ id: string; signed_at: string | null }>('SELECT id, signed_at FROM engagements WHERE business_id = ?', [business_id]);
  if (b === undefined || eng === undefined) throw new Error('seedSignatureRecord: no such business or engagement');
  const at = signed_at ?? eng.signed_at ?? d.now();
  const id = d.newId();
  writeSignature(d, eng.id, shownLetter(b), {
    id, engagement_id: eng.id, business_id, origin: 'SEED', user_id: null, session_id: null,
    signer_name: 'Specimen Signer', signer_role: 'Director (demonstration data)', business_name: b.name, signed_at: at, ip: '192.0.2.1',
  }, { id: null, role: 'SYSTEM' });
  return id;
}

/* ================================================================== *
 * READING IT BACK — what assertSignedEngagement asks
 * ================================================================== */

export type SignatureCheck =
  | { readonly ok: true; readonly signature_id: string; readonly origin: 'PORTAL' | 'SEED'; readonly signed_at: string }
  | { readonly ok: false; readonly why: string };

/**
 * THE RECORD, CHECKED. Present; its hash recomputed from its own fields; the letter text and the PDF matching their
 * fingerprints; and an ENGAGEMENT_SIGNED row in the audit chain carrying that hash. Any one wrong is "not signed".
 */
export function checkSignature(db: Db, engagement_id: string): SignatureCheck {
  const r = db.get<SignatureFields & { letter_text: string; pdf: Uint8Array; record_sha256: string }>(
    'SELECT id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, signed_at, ip, ' +
      'letter_text, letter_sha256, pdf, pdf_sha256, record_sha256 FROM engagement_signatures WHERE engagement_id = ?', [engagement_id]);
  if (r === undefined) return { ok: false, why: 'the letter is marked signed, but there is no signature record for it' };
  if (sha256(r.letter_text) !== r.letter_sha256 || sha256(new Uint8Array(r.pdf)) !== r.pdf_sha256 || recordHash(r) !== r.record_sha256) {
    return { ok: false, why: 'the signature record does not match its own fingerprint' };
  }
  const chained = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ENGAGEMENT_SIGNED' AND object_id = ? AND json_extract(detail, '$.record') = ?",
    [engagement_id, r.record_sha256])?.n ?? 0;
  if (chained === 0) return { ok: false, why: 'the signature record is not in the audit log' };
  return { ok: true, signature_id: r.id, origin: r.origin, signed_at: r.signed_at };
}
