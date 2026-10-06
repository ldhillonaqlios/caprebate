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
  /**
   * 6 October 2026 (Lakhbir): ON FOR TESTING. Under this setting the solicitor's answer is waived and the TEST COPY of
   * the letter may be signed — and nothing else: the real letter is refused, whatever else holds. Only
   * ENGAGEMENT_SIGNING_TEST sets it, and only the test website (api/index.mjs) or a local copy started with
   * CAPREBATE_SIGNING_TEST=1 uses that.
   */
  readonly test_copy_only?: boolean;
  readonly waiver_record?: string;
};

/** The question under the solicitor in the Word questions document. Quoted, not paraphrased. */
export const SIGNING_QUESTION =
  'Is a typed name, with a tick to say they may sign for the business, a good enough signature on our engagement letter?';

export const ENGAGEMENT_SIGNING: EngagementSigning = Object.freeze({
  enabled: false,
  solicitor_confirmed: false,
  question: SIGNING_QUESTION,
});

/**
 * SIGNING ON FOR TESTING — 6 October 2026. The test website (and a local copy started with CAPREBATE_SIGNING_TEST=1)
 * lets an invented client sign the TEST COPY of the letter end to end: the drawn signature, the record, the certificate
 * of completion and the signed copy. The real letter cannot be signed under it (`signingMissing`), and the switch real
 * clients would use, ENGAGEMENT_SIGNING above, stays off until the solicitor answers Word question 194.
 */
export const ENGAGEMENT_SIGNING_TEST: EngagementSigning = Object.freeze({
  enabled: true,
  solicitor_confirmed: false,
  question: SIGNING_QUESTION,
  test_copy_only: true,
  waiver_record: 'Lakhbir Dhillon, 6 October 2026, in the chat with Claude: "Signing itself is still switched off. switch this on for test purposes at the moment". The test copy of the letter only, invented clients only; the real letter keeps its blanks and ENGAGEMENT_SIGNING stays off.',
});

/** Which signing setting this copy runs under: the test one only where it was asked for. */
export function signingHere(test: boolean): EngagementSigning {
  return test ? ENGAGEMENT_SIGNING_TEST : ENGAGEMENT_SIGNING;
}

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
  /** Phase 153d: the test-only copy, with terms nobody has agreed. Never signed. */
  readonly test_copy: boolean;
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
    test_copy: letter.test_copy,
  };
}

/** What is still missing before a client can sign — each in plain words. Empty means signing is on for this letter. */
export function signingMissing(cfg: EngagementSigning, letter: Pick<ShownLetter, 'open_terms' | 'specimens'> & { readonly test_copy?: boolean }): string[] {
  const out: string[] = [];
  /* 6 October 2026: signing on for testing signs the test copy and nothing else. The test copy's open terms carry test
     defaults (each marked "test default, not agreed"); they are what is being tested, so they do not refuse it here. */
  if (cfg.test_copy_only === true) {
    if (letter.test_copy !== true) out.push('Signing is switched on for testing only, and only the test copy of the letter can be signed there.');
    if (cfg.enabled !== true) out.push('Then signing must be switched on.');
    return out;
  }
  // Phase 153d: the test-only copy carries terms nobody has agreed. It is shown on the test website and never signed.
  if (letter.test_copy === true) out.push('This is the test copy of the letter. Its terms are not agreed, so it can never be signed.');
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
  /** PHASE 157c: absent or 1, the record as Phase 146f made it; 2, with the signature and the certificate's times. */
  readonly record_version?: 1 | 2;
  readonly signature_method?: 'DRAWN' | 'TYPED' | null;
  /** The drawn strokes as stored (JSON), or null for a typed signature. */
  readonly signature_ink?: string | null;
  readonly signer_email?: string | null;
  readonly letter_prepared_at?: string | null;
  readonly letter_sent_at?: string | null;
  readonly letter_viewed_at?: string | null;
};

/** The record's own hash: every field, in this order, joined by a line feed. Changing any one changes it. */
export function recordHash(f: SignatureFields): string {
  const v1 = [
    'caprebate-engagement-signature-v1', f.id, f.engagement_id, f.business_id, f.origin, f.user_id ?? '', f.session_id ?? '',
    f.signer_name, f.signer_role, f.business_name, 'authority_confirmed', f.signed_at, f.ip, f.letter_sha256, f.pdf_sha256,
  ];
  if ((f.record_version ?? 1) === 1) return sha256(v1.join('\n'));
  /* PHASE 157c: version 2 also binds the signature itself (its method and every stroke) and the certificate's facts. */
  return sha256([
    'caprebate-engagement-signature-v2', ...v1.slice(1), f.signature_method ?? '', f.signature_ink ?? '', f.signer_email ?? '',
    f.letter_prepared_at ?? '', f.letter_sent_at ?? '', f.letter_viewed_at ?? '',
  ].join('\n'));
}

/* ================================================================== *
 * PHASE 157c — THE DRAWN SIGNATURE
 * ================================================================== */

/** The strokes the signing pad sends (src/web/signature-pad-script.ts): numbers 0 to 1000, within these limits. */
export const INK_LIMITS = Object.freeze({ max_strokes: 60, max_points: 3000, min_points: 8, min_span: 60 });

/**
 * Read the pad's strokes, or say why they are not a signature. A mark too small or too short to be anybody's signature
 * (fewer than eight points, or under 6% of the box across) is refused, so an accidental tap is never signed.
 */
export function parseInk(raw: string): { ok: true; strokes: readonly (readonly [number, number])[][]; json: string } | { ok: false; why: string } {
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return { ok: false, why: 'empty' }; }
  if (!Array.isArray(v) || v.length === 0 || v.length > INK_LIMITS.max_strokes) return { ok: false, why: 'empty' };
  const strokes: [number, number][][] = [];
  let points = 0, minX = 1000, maxX = 0;
  for (const st of v) {
    if (!Array.isArray(st) || st.length === 0) return { ok: false, why: 'empty' };
    const out: [number, number][] = [];
    for (const pt of st) {
      if (!Array.isArray(pt) || pt.length !== 2 || !Number.isInteger(pt[0]) || !Number.isInteger(pt[1])) return { ok: false, why: 'empty' };
      const x = pt[0] as number, y = pt[1] as number;
      if (x < 0 || x > 1000 || y < 0 || y > 1000) return { ok: false, why: 'empty' };
      out.push([x, y]); points++; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    strokes.push(out);
  }
  if (points > INK_LIMITS.max_points) return { ok: false, why: 'empty' };
  if (points < INK_LIMITS.min_points || maxX - minX < INK_LIMITS.min_span) return { ok: false, why: 'small' };
  return { ok: true, strokes, json: JSON.stringify(strokes) };
}

/** The signed PDF: the letter as shown, then a signature page (version 2: then a certificate of completion). */
export function signedPdf(letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256'>): Uint8Array {
  const body: PdfLine[] = letter.paragraphs.map((p) => (p.heading ? { text: p.text, bold: true, gap: 4 } : { text: p.text }));
  if ((f.record_version ?? 1) === 2) return buildPdf([...flow(body), ...flow(signaturePageV2(f)), ...flow(certificate(letter, f))], { title: `Engagement letter, signed by ${f.signer_name}` }).bytes;
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

/** PHASE 157c: the signature page, with the drawn signature (or the typed name, where they chose it). */
function signaturePageV2(f: Omit<SignatureFields, 'pdf_sha256'>): PdfLine[] {
  const ink = f.signature_method === 'DRAWN' && f.signature_ink ? parseInk(f.signature_ink) : null;
  return [
    { text: 'Signature page', bold: true, size: 14, gap: 10 },
    ...(ink !== null && ink.ok
      ? [{ text: 'Signature, drawn by the signer:', gap: 2 }, { text: '', ink: { strokes: ink.strokes, width: 240, height: 80 }, gap: 2 }]
      : [{ text: 'Signature, typed by the signer and adopted as their signature:', gap: 2 }, { text: f.signer_name, bold: true, size: 16, gap: 6 }]),
    { text: `Signed online by: ${f.signer_name}` },
    { text: `Their role: ${f.signer_role}` },
    { text: `For: ${f.business_name}. They confirmed they may sign for it.` },
    { text: `Signed: ${localWhen(f.signed_at)} (${f.signed_at} UTC)`, gap: 8 },
    { text: 'The certificate of completion on the next page records how this letter was sent, opened and signed.' },
  ];
}

/** PHASE 157c: the certificate of completion - every step of the letter, with its time, and the fingerprints. */
function certificate(letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256'>): PdfLine[] {
  const when = (t: string | null | undefined) => (t ? `${localWhen(t)} (${t} UTC)` : 'not recorded');
  return [
    { text: 'Certificate of completion', bold: true, size: 14, gap: 10 },
    ...(letter.test_copy ? [{ text: 'TEST: signed on the test system, on the test copy of the letter. It is not a contract.', bold: true, gap: 8 }] : []),
    { text: `Document: Cap Rebate engagement letter for ${f.business_name}` },
    { text: `Signature record: ${f.id}`, gap: 8 },
    { text: 'What happened', bold: true, gap: 4 },
    { text: `Letter prepared: ${when(f.letter_prepared_at)}` },
    { text: `Letter sent to the client: ${when(f.letter_sent_at)}` },
    { text: `Letter first opened by the client: ${when(f.letter_viewed_at)}` },
    { text: `Letter signed: ${when(f.signed_at)}`, gap: 8 },
    { text: 'Who signed', bold: true, gap: 4 },
    { text: `Name: ${f.signer_name}` },
    { text: `Role: ${f.signer_role}` },
    { text: `Signed in as: ${f.signer_email ?? 'not recorded'}` },
    { text: `How they signed: ${f.signature_method === 'DRAWN' ? 'drew their signature' : 'adopted their typed name as their signature'}` },
    { text: `From the internet address: ${f.ip}` },
    { text: `Session: ${f.session_id ?? 'none (demonstration data)'}`, gap: 8 },
    { text: 'The letter they saw', bold: true, gap: 4 },
    { text: 'The letter above is the exact text they saw when they signed. Its digital fingerprint is:', gap: 2 },
    { text: letter.sha256, size: 9, gap: 8 },
    { text: 'It was signed in the Cap Rebate portal. CAP REBATE LTD keeps the signature record.' },
    { text: 'A fingerprint of that record covers this signature and every time above. It is kept in our audit log, which cannot be changed.' },
  ];
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
        'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, ' +
        'record_version, signature_method, signature_ink, signer_email, letter_prepared_at, letter_sent_at, letter_viewed_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [full.id, engagement_id, full.business_id, full.origin, full.user_id, full.session_id, full.signer_name, full.signer_role, full.business_name,
        full.signed_at, full.ip, letter.text, full.letter_sha256, pdf, full.pdf_sha256, record_sha256,
        full.record_version ?? 1, full.signature_method ?? null, full.signature_ink ?? null, full.signer_email ?? null,
        full.letter_prepared_at ?? null, full.letter_sent_at ?? null, full.letter_viewed_at ?? null]);
    d.db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE id = ?", [full.signed_at, engagement_id]);
    d.audit.append({
      at: full.signed_at, kind: 'ENGAGEMENT_SIGNED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'engagement', object_id: engagement_id,
      detail: { signature: full.id, record: record_sha256, letter: full.letter_sha256, pdf: full.pdf_sha256, session: full.session_id, origin: full.origin },
    });
  });
  return { record_sha256, pdf };
}

export type SignInput = {
  readonly full_name: string; readonly role: string; readonly authorised: boolean; readonly letter_sha256: string;
  /** PHASE 157c: the signing pad's strokes (JSON), or empty. */
  readonly signature_strokes?: string;
  /** PHASE 157c: the client chose their typed name as their signature (when they cannot, or would rather not, draw). */
  readonly typed_as_signature?: boolean;
};
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
  signature: 'Draw your signature in the box, or tick "Use my typed name as my signature".',
  small: 'That mark is too small to be a signature. Clear the box and draw your signature again.',
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
  /* PHASE 157c: a signature, drawn or adopted. A drawing wins over the tick; neither is refused, never assumed. */
  const strokes = (input.signature_strokes ?? '').trim();
  let method: 'DRAWN' | 'TYPED'; let ink: string | null = null;
  if (strokes !== '') {
    const parsed = parseInk(strokes);
    if (!parsed.ok) return { ok: false, why: parsed.why === 'small' ? SIGN_WORDS.small : SIGN_WORDS.signature };
    method = 'DRAWN'; ink = parsed.json;
  } else if (input.typed_as_signature === true) {
    method = 'TYPED';
  } else {
    return { ok: false, why: SIGN_WORDS.signature };
  }

  const eng = d.db.get<{ id: string; created_at: string; sent_at: string | null; viewed_at: string | null }>(
    'SELECT id, created_at, sent_at, viewed_at FROM engagements WHERE business_id = ?', [b.id]);
  if (eng === undefined) return { ok: false, why: SIGN_WORDS.none };
  const id = d.newId();
  const signed_at = d.now();
  const ip = ctx.ip.replace(/[^0-9A-Fa-f.:]/g, '').slice(0, 64) || 'unknown';
  const signer_email = d.db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [actor.id])?.email ?? null;
  const { record_sha256, pdf } = writeSignature(d, eng.id, letter, {
    id, engagement_id: eng.id, business_id: b.id, origin: 'PORTAL', user_id: actor.id, session_id: ctx.session_id,
    signer_name: name, signer_role: role, business_name: b.name, signed_at, ip,
    record_version: 2, signature_method: method, signature_ink: ink, signer_email,
    letter_prepared_at: eng.created_at, letter_sent_at: eng.sent_at, letter_viewed_at: eng.viewed_at,
  }, { id: actor.id, role: actor.role });

  // Their copy, to the address of the login that signed. Saved to the outbox; sent the day sending is on.
  const to = d.db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [actor.id])?.email;
  if (to !== undefined) {
    d.email.send({
      to_email: to,
      subject: 'Your signed engagement letter',
      body: `Thank you. You signed our engagement letter for ${b.name} on ${localWhen(signed_at)}.\n\n` +
        'Your signed copy is attached. It ends with your signature and a certificate of completion, which shows when the letter was sent, opened and signed.\n\n' +
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
      'letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version, signature_method, signature_ink, signer_email, ' +
      'letter_prepared_at, letter_sent_at, letter_viewed_at FROM engagement_signatures WHERE engagement_id = ?', [engagement_id]);
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
