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

import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';
import { authorise, type Actor } from '../authz.ts';
import { loadLetter } from './letter.ts';
import { engagement, readBusiness } from './portal.ts';
import { localWhen, ukDate } from './localtime.ts';
import { formatPence } from './shown-range.ts';
import { claimantTypeForGate } from './crm.ts';
import { buildPdf, flow, type PdfLine } from './pdf.ts';
import { stageIndex } from './stages.ts';

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
  /**
   * PHASE 157d: SIGNING FROM A LINK IN THE EMAIL, without a portal login. Off for real clients until the solicitor's
   * answer covers it (Word question, under the solicitor: SIGNING_LINK_QUESTION); on with ENGAGEMENT_SIGNING_TEST.
   */
  readonly links?: boolean;
};

/** PHASE 157d: the solicitor's question for signing from an emailed link. Quoted, not paraphrased. */
export const SIGNING_LINK_QUESTION =
  'May a client sign our engagement letter from a link in an email, without logging in to the portal?';

/** PHASE 157d: how long a signing link works, from the moment it is sent. A test default, not agreed. */
export const SIGN_LINK_DAYS = 7;

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
  links: true,
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
  /** PHASE 158b (F22): the letter still names the specimen company number, so it does not say which business is signing. */
  readonly party_unknown: boolean;
};

/** PHASE 158b (F22): what the letter says about this client beyond their name - from the records, never typed in. */
export type LetterFacts = {
  readonly claimant_type: string | null;
  /** Every property the business holds with us, by label: one engagement covers all of them. */
  readonly property: string | null;
  /** The day the letter was sent, as words; null before it is sent. */
  readonly date: string | null;
  /** The figure the client was shown at the assessment, as the portal says it ("up to £255,000"). */
  readonly range: string | null;
};

export function letterFacts(db: Db, business_id: string): LetterFacts {
  const props = db.all<{ label: string }>('SELECT label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [business_id])
    .map((p) => p.label.trim()).filter((l) => l !== '');
  const sent = db.get<{ sent_at: string | null }>('SELECT sent_at FROM engagements WHERE business_id = ?', [business_id])?.sent_at ?? null;
  const high = db.get<{ shown_high_pence: number | null }>(
    'SELECT shown_high_pence FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [business_id])?.shown_high_pence ?? null;
  return {
    // The client's own entity answer at the assessment, else what staff recorded on the organisation (crm.ts).
    claimant_type: claimantTypeForGate(db, business_id).value,
    property: props.length === 0 ? null : props.join('; '),
    date: sent === null ? null : ukDate(sent),
    range: high === null || !(high > 0) ? null : `up to ${formatPence(high)}`,
  };
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** The options loadLetter takes for this client: one place, so the letter shown, signed and listed is the same text. */
export function letterOptions(business: { name: string; company_number?: string | null }, path?: string, facts?: LetterFacts): Parameters<typeof loadLetter>[0] {
  return {
    clientName: business.name,
    ...(business.company_number === undefined || business.company_number === null ? {} : { companyNumber: business.company_number }),
    ...(path === undefined ? {} : { path }),
    ...(facts === undefined ? {} : {
      claimantType: facts.claimant_type, property: facts.property, date: facts.date,
      ...(facts.range === null ? {} : { range: facts.range }),
    }),
  };
}

export function shownLetter(business: { name: string; company_number?: string | null }, path?: string, facts?: LetterFacts): ShownLetter {
  const letter = loadLetter(letterOptions(business, path, facts));
  const text = letter.paragraphs.map((p) => p.text).join('\n');
  return {
    paragraphs: letter.paragraphs, text, sha256: sha256(text),
    open_terms: letter.openTerms.length, specimens: letter.specimens.length, business_name: business.name,
    test_copy: letter.test_copy,
    party_unknown: letter.specimens.some((x) => x.includes('company number')),
  };
}

/** What is still missing before a client can sign — each in plain words. Empty means signing is on for this letter. */
export function signingMissing(cfg: EngagementSigning, letter: Pick<ShownLetter, 'open_terms' | 'specimens'> & { readonly test_copy?: boolean; readonly party_unknown?: boolean }): string[] {
  const out: string[] = [];
  /* PHASE 158b (F22): a letter that still names the specimen company number does not say which business is signing.
     Refused in every mode, the test copy's included: the Friary House run signed a partnership in as "company number
     98604417". The client's kind of business (or a company's number) on their record clears it. */
  const party = 'We do not know yet which business is signing. Their company number, or what kind of business they are, is not on record.';
  /* 6 October 2026: signing on for testing signs the test copy and nothing else. The test copy's open terms carry test
     defaults (each marked "test default, not agreed"); they are what is being tested, so they do not refuse it here. */
  if (cfg.test_copy_only === true) {
    if (letter.test_copy !== true) out.push('Signing is switched on for testing only, and only the test copy of the letter can be signed there.');
    else if (letter.party_unknown === true) out.push(party);
    if (cfg.enabled !== true) out.push('Then signing must be switched on.');
    return out;
  }
  // Phase 153d: the test-only copy carries terms nobody has agreed. It is shown on the test website and never signed.
  if (letter.test_copy === true) out.push('This is the test copy of the letter. Its terms are not agreed, so it can never be signed.');
  if (cfg.solicitor_confirmed !== true) out.push('Our solicitor must confirm that typing your name is a good enough way to sign this letter.');
  if (letter.open_terms > 0 || letter.specimens > 0) out.push('Some terms in the letter are not settled yet, so it cannot be signed.');
  if (letter.party_unknown === true) out.push(party);
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
  readonly origin: 'PORTAL' | 'SEED' | 'EMAIL_LINK';
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
  readonly record_version?: 1 | 2 | 3;
  readonly signature_method?: 'DRAWN' | 'TYPED' | null;
  /** The drawn strokes as stored (JSON), or null for a typed signature. */
  readonly signature_ink?: string | null;
  readonly signer_email?: string | null;
  readonly letter_prepared_at?: string | null;
  readonly letter_sent_at?: string | null;
  readonly letter_viewed_at?: string | null;
  /** PHASE 157d (version 3): which signature on the letter this is (1 or 2), and the link it was signed through. */
  readonly signer_seq?: 1 | 2;
  readonly link_id?: string | null;
};

/** The record's own hash: every field, in this order, joined by a line feed. Changing any one changes it. */
export function recordHash(f: SignatureFields): string {
  const v1 = [
    'caprebate-engagement-signature-v1', f.id, f.engagement_id, f.business_id, f.origin, f.user_id ?? '', f.session_id ?? '',
    f.signer_name, f.signer_role, f.business_name, 'authority_confirmed', f.signed_at, f.ip, f.letter_sha256, f.pdf_sha256,
  ];
  if ((f.record_version ?? 1) === 1) return sha256(v1.join('\n'));
  /* PHASE 157c: version 2 also binds the signature itself (its method and every stroke) and the certificate's facts. */
  const v2 = [
    ...v1.slice(1), f.signature_method ?? '', f.signature_ink ?? '', f.signer_email ?? '',
    f.letter_prepared_at ?? '', f.letter_sent_at ?? '', f.letter_viewed_at ?? '',
  ];
  if (f.record_version === 2) return sha256(['caprebate-engagement-signature-v2', ...v2].join('\n'));
  /* PHASE 157d: version 3 also binds which signature on the letter it is, and the link it came through. */
  return sha256(['caprebate-engagement-signature-v3', ...v2, String(f.signer_seq ?? 1), f.link_id ?? ''].join('\n'));
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
export function signedPdf(
  letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256'>,
  /** PHASE 157d: the signatures already on this letter, first signer first. Version 3 shows them all. */
  earlier: readonly Omit<SignatureFields, 'pdf_sha256'>[] = [],
  /** PHASE 157d: how many signatures the letter needs, for the certificate. */
  needed = 1,
): Uint8Array {
  const body: PdfLine[] = letter.paragraphs.map((p) => (p.heading ? { text: p.text, bold: true, gap: 4 } : { text: p.text }));
  if ((f.record_version ?? 1) === 2) return buildPdf([...flow(body), ...flow(signaturePageV2(f)), ...flow(certificate(letter, f))], { title: `Engagement letter, signed by ${f.signer_name}` }).bytes;
  if (f.record_version === 3) {
    const all = [...earlier, f];
    return buildPdf([...flow(body), ...all.flatMap((x) => flow(signaturePageV2(x))), ...flow(certificateV3(letter, all, needed))],
      { title: `Engagement letter, signed by ${all.map((x) => x.signer_name).join(' and ')}` }).bytes;
  }
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

/**
 * PHASE 157d: the certificate of completion for one or two signers, each with how they signed — in the portal, signed
 * in as their login, or from the link emailed to their address, which is what that link proves.
 */
function certificateV3(letter: ShownLetter, all: readonly Omit<SignatureFields, 'pdf_sha256'>[], needed: number): PdfLine[] {
  const when = (t: string | null | undefined) => (t ? `${localWhen(t)} (${t} UTC)` : 'not recorded');
  const first = all[0] as Omit<SignatureFields, 'pdf_sha256'>;
  const last = all[all.length - 1] as Omit<SignatureFields, 'pdf_sha256'>;
  const complete = all.length >= needed;
  return [
    { text: 'Certificate of completion', bold: true, size: 14, gap: 10 },
    ...(letter.test_copy ? [{ text: 'TEST: signed on the test system, on the test copy of the letter. It is not a contract.', bold: true, gap: 8 }] : []),
    { text: `Document: Cap Rebate engagement letter for ${first.business_name}` },
    { text: complete
      ? `Signatures: ${String(all.length)} of ${String(needed)}. The letter is signed.`
      : `Signatures: ${String(all.length)} of ${String(needed)}. It is signed only when every signer named by us has signed.`, gap: 8 },
    { text: 'What happened', bold: true, gap: 4 },
    { text: `Letter prepared: ${when(last.letter_prepared_at)}` },
    { text: `Letter sent to the client: ${when(last.letter_sent_at)}` },
    { text: `Letter first opened by the client: ${when(last.letter_viewed_at)}`, gap: 8 },
    ...all.flatMap((x, i) => [
      { text: `Signer ${String(i + 1)}`, bold: true, gap: 4 },
      { text: `Name: ${x.signer_name}` },
      { text: `Role: ${x.signer_role}` },
      { text: `Signed: ${when(x.signed_at)}` },
      x.origin === 'EMAIL_LINK'
        ? { text: `Signed from the link we emailed to: ${x.signer_email ?? 'not recorded'}. The link worked once, for this letter only.` }
        : { text: `Signed in to the Cap Rebate portal as: ${x.signer_email ?? 'not recorded'}` },
      { text: `How they signed: ${x.signature_method === 'DRAWN' ? 'drew their signature' : 'adopted their typed name as their signature'}` },
      { text: `From the internet address: ${x.ip}` },
      { text: `Signature record: ${x.id}`, gap: 8 },
    ]),
    { text: 'The letter they saw', bold: true, gap: 4 },
    { text: 'The letter above is the exact text every signer saw when they signed. Its digital fingerprint is:', gap: 2 },
    { text: letter.sha256, size: 9, gap: 8 },
    { text: 'CAP REBATE LTD keeps each signature record.' },
    { text: 'A fingerprint of each record covers that signature and every time above. It is kept in our audit log, which cannot be changed.' },
  ];
}

type Deps = { db: Db; audit: AuditLog; email: EmailTransport; now: () => string; newId: () => string };

/**
 * PHASE 157d: WHO MUST SIGN. The client logins staff recorded (engagement_required_signers), first signer first; none
 * recorded means any one client login of the business signs, as before.
 */
export type RequiredSigner = { readonly user_id: string; readonly seq: 1 | 2; readonly name: string; readonly email: string };
export function requiredSigners(db: Db, engagement_id: string): RequiredSigner[] {
  return db.all<RequiredSigner>(
    'SELECT r.user_id, r.seq, u.display_name AS name, u.email FROM engagement_required_signers r JOIN users u ON u.id = r.user_id ' +
      'WHERE r.engagement_id = ? ORDER BY r.seq ASC', [engagement_id]);
}
/** How many signatures the letter needs: one, or the number staff named (at most two). */
export function signaturesNeeded(db: Db, engagement_id: string): number {
  return Math.max(1, requiredSigners(db, engagement_id).length);
}

type StoredSignature = SignatureFields & { letter_text: string; pdf: Uint8Array; record_sha256: string };
function storedSignatures(db: Db, engagement_id: string): StoredSignature[] {
  return db.all<StoredSignature>(
    'SELECT id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, signed_at, ip, ' +
      'letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version, signature_method, signature_ink, signer_email, ' +
      'letter_prepared_at, letter_sent_at, letter_viewed_at, signer_seq, link_id FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq ASC',
    [engagement_id]);
}

/**
 * Write one record, bind it into the audit chain, and move the letter to SIGNED once every signature it needs is on it.
 * One transaction; a signing link, where one was used, is marked used in the same transaction.
 */
function writeSignature(
  d: Pick<Deps, 'db' | 'audit'>, engagement_id: string, letter: ShownLetter, f: Omit<SignatureFields, 'pdf_sha256' | 'letter_sha256'>,
  actor: { id: string | null; role: string },
  more: { readonly earlier?: readonly Omit<SignatureFields, 'pdf_sha256'>[]; readonly needed?: number } = {},
): { record_sha256: string; pdf: Uint8Array; complete: boolean } {
  const base = { ...f, letter_sha256: letter.sha256 };
  const needed = more.needed ?? 1;
  const pdf = signedPdf(letter, base, more.earlier ?? [], needed);
  const full: SignatureFields = { ...base, pdf_sha256: sha256(pdf) };
  const record_sha256 = recordHash(full);
  const complete = (f.signer_seq ?? 1) >= needed;
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
        'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, ' +
        'record_version, signature_method, signature_ink, signer_email, letter_prepared_at, letter_sent_at, letter_viewed_at, signer_seq, link_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [full.id, engagement_id, full.business_id, full.origin, full.user_id, full.session_id, full.signer_name, full.signer_role, full.business_name,
        full.signed_at, full.ip, letter.text, full.letter_sha256, pdf, full.pdf_sha256, record_sha256,
        full.record_version ?? 1, full.signature_method ?? null, full.signature_ink ?? null, full.signer_email ?? null,
        full.letter_prepared_at ?? null, full.letter_sent_at ?? null, full.letter_viewed_at ?? null, full.signer_seq ?? 1, full.link_id ?? null]);
    if (full.link_id !== null && full.link_id !== undefined) {
      d.db.run('UPDATE engagement_sign_links SET used_at = ? WHERE id = ? AND used_at IS NULL', [full.signed_at, full.link_id]);
    }
    if (complete) {
      d.db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE id = ?", [full.signed_at, engagement_id]);
      // PHASE 158d (F43, the second Friary House run): the client signed and their portal still said "Step 1 of 6: Your
      // estimate" until staff moved the claim. Signing is the step: it raises the client to it, and never lowers one past it.
      const now = d.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [full.business_id])?.stage ?? '';
      if (stageIndex(now) < stageIndex('ENGAGEMENT_SIGNED')) {
        d.db.run('UPDATE businesses SET stage = ?, updated_at = ? WHERE id = ?', ['ENGAGEMENT_SIGNED', full.signed_at, full.business_id]);
      }
    }
    d.audit.append({
      at: full.signed_at, kind: 'ENGAGEMENT_SIGNED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'engagement', object_id: engagement_id,
      detail: { signature: full.id, record: record_sha256, letter: full.letter_sha256, pdf: full.pdf_sha256, session: full.session_id, origin: full.origin,
        seq: full.signer_seq ?? 1, needed, complete },
    });
  });
  return { record_sha256, pdf, complete };
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
  not_named: 'This letter is to be signed by the people we agreed with your business, and you are not one of them. Please ask them to sign, or ask us.',
  you_signed: 'You have signed this letter. We are waiting for the other signature.',
  link: 'This signing link does not work. It may have been used already, or be out of date. Ask us to send the letter again, or sign in to the portal.',
  links_off: 'Signing from a link in an email is not switched on yet. Please sign in to the portal to read and sign the letter.',
});

function fullName(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 200) return null;
  const words = t.split(' ').filter((w) => /\p{L}/u.test(w));
  return words.length >= 2 ? t : null;
}

/** Who is signing: a portal login with its session, or the login a signing link was emailed to. */
type Signer = {
  readonly user_id: string; readonly role: string; readonly origin: 'PORTAL' | 'EMAIL_LINK';
  readonly session_id: string | null; readonly link_id: string | null; readonly email: string | null;
};

/** The checks and the write every signature shares, whichever way it came. */
function signAs(
  d: Deps, who: Signer, b: { id: string; name: string; company_number?: string | null }, state: string, input: SignInput, ip: string,
  opts: { cfg?: EngagementSigning; letterPath?: string },
): { ok: true; signature_id: string; record_sha256: string; complete: boolean } | { ok: false; why: string } {
  if (state === 'SIGNED') return { ok: false, why: SIGN_WORDS.already };
  if (state === 'NOT_SENT') return { ok: false, why: SIGN_WORDS.not_sent };
  const letter = shownLetter(b, opts.letterPath, letterFacts(d.db, b.id));
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
  /* PHASE 157d: who must sign, and whether this login has. */
  const named = requiredSigners(d.db, eng.id);
  if (named.length > 0 && !named.some((n) => n.user_id === who.user_id)) return { ok: false, why: SIGN_WORDS.not_named };
  const earlier = storedSignatures(d.db, eng.id);
  if (earlier.some((x) => x.user_id === who.user_id)) return { ok: false, why: SIGN_WORDS.you_signed };
  const needed = Math.max(1, named.length);
  if (earlier.length >= needed) return { ok: false, why: SIGN_WORDS.already };
  const seq = (earlier.length + 1) as 1 | 2;

  const id = d.newId();
  const signed_at = d.now();
  const cleanIp = ip.replace(/[^0-9A-Fa-f.:]/g, '').slice(0, 64) || 'unknown';
  const signer_email = who.email ?? d.db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [who.user_id])?.email ?? null;
  const { record_sha256, pdf, complete } = writeSignature(d, eng.id, letter, {
    id, engagement_id: eng.id, business_id: b.id, origin: who.origin, user_id: who.user_id, session_id: who.session_id,
    signer_name: name, signer_role: role, business_name: b.name, signed_at, ip: cleanIp,
    record_version: 3, signature_method: method, signature_ink: ink, signer_email,
    letter_prepared_at: eng.created_at, letter_sent_at: eng.sent_at, letter_viewed_at: eng.viewed_at,
    signer_seq: seq, link_id: who.link_id,
  }, { id: who.user_id, role: who.role }, { earlier, needed });

  // Their copy, to the address that signed. Saved to the outbox; sent the day sending is on.
  if (signer_email !== null) {
    d.email.send({
      to_email: signer_email,
      subject: complete ? 'Your signed engagement letter' : 'You have signed our engagement letter',
      body: `Thank you. You signed our engagement letter for ${b.name} on ${localWhen(signed_at)}.\n\n` +
        (complete
          ? 'Your signed copy is attached. It ends with your signature and a certificate of completion, which shows when the letter was sent, opened and signed.\n\n'
          : 'It needs one more signature before it is signed. Your copy so far is attached; we will send the finished copy when it is signed.\n\n') +
        'Not sent yet. Sending email is not switched on. This message and your copy are saved with the emails waiting to send.',
      kind: 'SIGNED_LETTER',
      business_id: b.id,
      inline_files: [{ filename: complete ? 'engagement-letter-signed.pdf' : 'engagement-letter-signed-so-far.pdf', content_type: 'application/pdf', bytes: pdf }],
    });
  }
  return { ok: true, signature_id: id, record_sha256, complete };
}

/**
 * THE CLIENT SIGNS IN THE PORTAL. The client's own business only (readBusiness refuses any other), the switch on, the
 * letter complete, sent to them and not yet signed, a full name, a role, the tick, the fingerprint of the letter they
 * read — and, since Phase 157d, one of the people staff named, if they named any.
 */
export function signEngagement(
  d: Deps, actor: Actor, business_id: string, input: SignInput, ctx: SignContext,
  opts: { cfg?: EngagementSigning; letterPath?: string } = {},
): { ok: true; signature_id: string; record_sha256: string; complete: boolean } | { ok: false; why: string } {
  const b = readBusiness(d.db, actor, business_id);
  if (actor.role !== 'CLIENT' || actor.business_id !== b.id) return { ok: false, why: 'Only the client can sign their own engagement letter.' };
  const e = engagement(d.db, actor, b.id);
  if (e === null) return { ok: false, why: SIGN_WORDS.none };
  return signAs(d, { user_id: actor.id, role: actor.role, origin: 'PORTAL', session_id: ctx.session_id, link_id: null, email: null }, b, e.state, input, ctx.ip, opts);
}

/* ================================================================== *
 * PHASE 157d — SIGNING FROM A LINK IN THE EMAIL
 * ================================================================== */

export const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

/** A new link for one client login: the token goes in the email and nowhere else; only its SHA-256 is kept. */
export function createSignLink(
  d: Pick<Deps, 'db' | 'now' | 'newId'>, engagement_id: string, user: { id: string; email: string }, created_by: string | null,
): string {
  const token = randomBytes(32).toString('hex');
  const at = d.now();
  const expires = new Date(Date.parse(at) + SIGN_LINK_DAYS * 86_400_000).toISOString();
  d.db.run('INSERT INTO engagement_sign_links (id, engagement_id, user_id, token_sha256, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [d.newId(), engagement_id, user.id, sha256Hex(token), user.email, created_by, at, expires]);
  return token;
}

export type SignLink = {
  readonly id: string; readonly engagement_id: string; readonly user_id: string; readonly sent_to: string;
  readonly business_id: string; readonly business_name: string; readonly company_number: string | null; readonly letter_state: string;
};
/** The link behind a token, if it still works: known, not used, not out of date, its login still active. */
export function signLinkFor(db: Db, token: string, nowIso: string): SignLink | null {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const l = db.get<SignLink & { used_at: string | null; expires_at: string; disabled_at: string | null }>(
    'SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, b.name AS business_name, ' +
      'b.company_number, u.disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
      'JOIN businesses b ON b.id = e.business_id JOIN users u ON u.id = k.user_id WHERE k.token_sha256 = ?', [sha256Hex(token)]);
  if (l === undefined || l.used_at !== null || l.expires_at <= nowIso || l.disabled_at !== null) return null;
  return { id: l.id, engagement_id: l.engagement_id, user_id: l.user_id, sent_to: l.sent_to, business_id: l.business_id,
    business_name: l.business_name, company_number: l.company_number, letter_state: l.letter_state };
}

/**
 * SIGNING THROUGH THE LINK. Every check the portal makes, plus: the link works (once, in time) and links are switched
 * on. The certificate records the address the link was emailed to — which is what it proves — instead of a login.
 */
export function signByLink(
  d: Deps, token: string, input: SignInput, ip: string, opts: { cfg?: EngagementSigning; letterPath?: string } = {},
): { ok: true; signature_id: string; record_sha256: string; complete: boolean } | { ok: false; why: string } {
  if ((opts.cfg ?? ENGAGEMENT_SIGNING).links !== true) return { ok: false, why: SIGN_WORDS.links_off };
  const l = signLinkFor(d.db, token, d.now());
  if (l === null) return { ok: false, why: SIGN_WORDS.link };
  return signAs(d, { user_id: l.user_id, role: 'CLIENT', origin: 'EMAIL_LINK', session_id: null, link_id: l.id, email: l.sent_to },
    { id: l.business_id, name: l.business_name, company_number: l.company_number }, l.letter_state, input, ip, opts);
}

/**
 * PHASE 157d: STAFF RECORD WHO MUST SIGN — one or two of the business's client logins. Refused once anyone has signed,
 * because the letter's signatures are counted against it. An empty list goes back to "any one client login".
 */
export function setRequiredSigners(
  d: Pick<Deps, 'db' | 'audit' | 'now' | 'newId'>, actor: Actor, business_id: string, user_ids: readonly string[],
): { ok: true } | { ok: false; why: string } {
  authorise(actor, 'engagement.send', { type: 'engagement', id: business_id, business_id });
  const eng = d.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [business_id]);
  if (eng === undefined) return { ok: false, why: 'Prepare and send the letter first, then say who must sign it.' };
  const ids = [...new Set(user_ids.filter((x) => x.trim() !== ''))];
  if (ids.length > 2) return { ok: false, why: 'At most two people sign the letter.' };
  for (const id of ids) {
    const u = d.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE id = ? AND business_id = ? AND role = 'CLIENT' AND disabled_at IS NULL", [id, business_id])?.n ?? 0;
    if (u === 0) return { ok: false, why: 'Choose people who have a login for this client.' };
  }
  if ((d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures WHERE engagement_id = ?', [eng.id])?.n ?? 0) > 0) {
    return { ok: false, why: 'Somebody has already signed, so who must sign cannot change now.' };
  }
  const at = d.now();
  d.db.tx(() => {
    d.db.run('DELETE FROM engagement_required_signers WHERE engagement_id = ?', [eng.id]);
    ids.forEach((u, i) => d.db.run('INSERT INTO engagement_required_signers (id, engagement_id, user_id, seq, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)',
      [d.newId(), eng.id, u, i + 1, actor.id, at]));
    d.audit.append({ at, kind: 'ENGAGEMENT_SIGNERS_SET', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'engagement', object_id: eng.id, detail: { signers: ids.length } });
  });
  return { ok: true };
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
  writeSignature(d, eng.id, shownLetter(b, undefined, letterFacts(d.db, business_id)), {
    id, engagement_id: eng.id, business_id, origin: 'SEED', user_id: null, session_id: null,
    signer_name: 'Specimen Signer', signer_role: 'Director (demonstration data)', business_name: b.name, signed_at: at, ip: '192.0.2.1',
  }, { id: null, role: 'SYSTEM' });
  return id;
}

/* ================================================================== *
 * READING IT BACK — what assertSignedEngagement asks
 * ================================================================== */

export type SignatureCheck =
  | { readonly ok: true; readonly signature_id: string; readonly origin: 'PORTAL' | 'SEED' | 'EMAIL_LINK'; readonly signed_at: string }
  | { readonly ok: false; readonly why: string };

/**
 * THE RECORDS, CHECKED. Each present; its hash recomputed from its own fields; the letter text and the PDF matching their
 * fingerprints; and an ENGAGEMENT_SIGNED row in the audit chain carrying that hash. And, since Phase 157d, as many as the
 * letter needs. Any one wrong is "not signed". The latest signature is the one returned: its PDF carries them all.
 */
export function checkSignature(db: Db, engagement_id: string): SignatureCheck {
  const rows = storedSignatures(db, engagement_id);
  if (rows.length === 0) return { ok: false, why: 'the letter is marked signed, but there is no signature record for it' };
  for (const r of rows) {
    if (sha256(r.letter_text) !== r.letter_sha256 || sha256(new Uint8Array(r.pdf)) !== r.pdf_sha256 || recordHash(r) !== r.record_sha256) {
      return { ok: false, why: 'the signature record does not match its own fingerprint' };
    }
    const chained = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ENGAGEMENT_SIGNED' AND object_id = ? AND json_extract(detail, '$.record') = ?",
      [engagement_id, r.record_sha256])?.n ?? 0;
    if (chained === 0) return { ok: false, why: 'the signature record is not in the audit log' };
  }
  if (rows.length < signaturesNeeded(db, engagement_id)) return { ok: false, why: 'the letter is waiting for another signature' };
  const r = rows[rows.length - 1] as StoredSignature;
  return { ok: true, signature_id: r.id, origin: r.origin, signed_at: r.signed_at };
}
