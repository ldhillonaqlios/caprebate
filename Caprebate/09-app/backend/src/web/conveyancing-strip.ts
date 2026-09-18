/**
 * COMPANY NAMES KEPT, INDIVIDUALS STRIPPED, ON THE TWO CONVEYANCING UPLOADS — BUILT, AND SWITCHED OFF. Phase 129,
 * 12 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IT DECIDES, AND WHAT IT DOES NOT
 *
 * The pre-contract enquiry replies (CPSE_REPLIES) and the sale contract (SALE_CONTRACT) are read by a person, not by the
 * model: the ingestion module's receipt policy for both is WHOLE_DOCUMENT_PENDING_HUMAN_READ, and its human-capture rule
 * says every name the reviewer keys in is replaced by a role token — [SELLER], [WITNESS], [FEE EARNER]. So today NOTHING
 * of the parties clause reaches a structured record except role tokens, companies included, and the one fact these
 * documents exist to supply — who sold to whom — is not captured at all.
 *
 * This file decides what of the PARTIES a person has read off one of those two documents may be written onward. It does
 * not change the receipt policy, what is kept of the uploaded text, or the quarantine — those are the ingestion module's
 * and the upload handler's, in 04-phase-work/phase3, and untouched. No screen calls it yet: nothing in this build captures
 * a human read of a parties clause. It is the mechanism, ready for the answer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OFF IS EXACTLY TODAY
 *
 * With `enabled: false`, `captureParties` returns `todaysCapture` — every party as its role token, no name and no number —
 * and a test compares the two, serialised, byte for byte. The question it waits on is the data protection officer's, in
 * CAPREBATE QUESTIONS under exactly this title:
 *   "May company names stay on conveyancing uploads if we strip the individuals?"
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON, A COMPANY PARTY KEEPS ITS NAME AND ITS REGISTERED NUMBER, AND NOTHING ELSE CHANGES
 *
 * A party keeps its name only when ALL of these hold, and is its role token otherwise:
 *   · it is a party to the transaction — a witness, a signatory, a fee earner or a guarantor is not;
 *   · its legal form is KNOWN to be a company or an LLP — the name exclusion register's test is legal form, not whether
 *     the string looks like a name (`classifyPartyReference` in the ingestion module, applied unchanged);
 *   · the capture backstop's person-name patterns do not match it — a company name that reads as a person's is stripped,
 *     not kept, and the data protection officer can say otherwise.
 * A registered number is kept only in Companies House's own shape; anything else is dropped and said.
 *
 * N4: A LEGAL FORM NOT KNOWN AND ONE NEVER RECORDED READ IDENTICALLY, AND NEITHER KEEPS A NAME. A sole trader, an English
 * or Northern Irish partnership, a Scottish partnership and a public body are stripped too: the question asks about
 * company names, and the switch keeps exactly that.
 *
 * WHAT THE SWITCH DOES NOT BUILD: the question's own recommendation that an INDIVIDUAL who is the party — "Dr A Patel" as
 * freehold proprietor — be kept as a party to our client's transaction. That is a wider permission than the switch, and it
 * waits on the officer's answer rather than being guessed here.
 */

import {
  ALWAYS_NATURAL_PERSON_ROLES, CAPTURE_NAME_PATTERNS, ROLE_TOKENS, classifyPartyReference,
  type PartyLegalForm, type PersonRole,
} from './upload-handler-port.ts';

/** The title of the question for the data protection officer in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const CONVEYANCING_STRIP_QUESTION = 'May company names stay on conveyancing uploads if we strip the individuals?';

export type ConveyancingStrip = {
  readonly enabled: boolean;
  readonly question: string;
  /** The two human-read document types. Any other type is refused, on and off alike. */
  readonly applies_to: readonly string[];
  /** The legal forms whose name and number are kept while on. */
  readonly kept_forms: readonly PartyLegalForm[];
};

export const CONVEYANCING_STRIP: ConveyancingStrip = Object.freeze({
  enabled: false,
  question: CONVEYANCING_STRIP_QUESTION,
  applies_to: Object.freeze(['CPSE_REPLIES', 'SALE_CONTRACT']),
  kept_forms: Object.freeze(['BODY_CORPORATE', 'LLP'] as PartyLegalForm[]),
});

export type PartySide = 'SELLER' | 'BUYER' | 'LANDLORD' | 'TENANT';

/** One party as the reviewer read it off the document. The name is never written onward unless the switch keeps it. */
export type PartyOnDocument = {
  readonly role: PersonRole;
  /** For a party to the transaction: which side. Absent reads as a named individual's token. */
  readonly side?: PartySide | null;
  /** The legal form, where the reviewer established it. Absent and UNKNOWN read identically (N4). */
  readonly form?: PartyLegalForm | null;
  readonly name: string;
  readonly company_number?: string | null;
};

export type CapturedParty = {
  readonly role_token: string;
  readonly company: string | null;
  readonly company_number: string | null;
  readonly why: string;
};

export type CaptureResult = { readonly ok: true; readonly parties: readonly CapturedParty[] } | { readonly ok: false; readonly why: string };

export const TODAY_WHY = 'replaced by its role token — the human-capture rule as it stands: no name from a conveyancing upload is captured';

function roleToken(p: PartyOnDocument): string {
  if (p.role === 'TRANSACTION_PARTY') return p.side === undefined || p.side === null ? '[NAMED INDIVIDUAL]' : `[${p.side}]`;
  if (p.role === 'ATTESTING_WITNESS') return '[WITNESS]';
  if (p.role === 'INDIVIDUAL_SIGNATORY') return '[SIGNATORY]';
  if (p.role === 'PROFESSIONAL_CERTIFIER') return '[FEE EARNER]';
  if (p.role === 'GUARANTOR') return '[GUARANTOR]';
  return '[NAMED INDIVIDUAL]';
}

/** Companies House's shape: eight digits, or two letters and six digits (SC, NI, OC and the rest). */
export function companyNumber(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = v.replace(/\s+/g, '').toUpperCase();
  return /^(?:\d{8}|[A-Z]{2}\d{6})$/.test(s) ? s : null;
}

/** TODAY. Every party as its role token; no name, no number. */
export function todaysCapture(parties: readonly PartyOnDocument[]): CapturedParty[] {
  return parties.map((p) => ({ role_token: roleToken(p), company: null, company_number: null, why: TODAY_WHY }));
}

function stripped(p: PartyOnDocument, why: string): CapturedParty {
  return { role_token: roleToken(p), company: null, company_number: null, why };
}

function onRead(p: PartyOnDocument, s: ConveyancingStrip): CapturedParty {
  if (p.role !== 'TRANSACTION_PARTY' || ALWAYS_NATURAL_PERSON_ROLES.includes(p.role)) {
    return stripped(p, 'stripped: only a party to the transaction keeps a company name — a witness, a signatory, a fee earner or a guarantor is a person, or not needed');
  }
  const form: PartyLegalForm = p.form === undefined || p.form === null ? 'UNKNOWN' : p.form;
  const c = classifyPartyReference({ form, individuals_named_on_document: 0 });
  if (!s.kept_forms.includes(form)) {
    return stripped(p, form === 'UNKNOWN'
      ? 'stripped: the legal form is not known — not known and never recorded read alike, and neither keeps a name (N4)'
      : `stripped: ${form.replace(/_/g, ' ').toLowerCase()} is not a company or an LLP — ${c.reason}`);
  }
  if (c.firm_name_is_personal_data) return stripped(p, `stripped: ${c.reason}`);
  const name = p.name.trim();
  if (name.length === 0) return stripped(p, 'stripped: no name was read');
  if (CAPTURE_NAME_PATTERNS.some((re) => re.test(name))) {
    return stripped(p, 'stripped: the name reads as a person’s to the capture backstop, so it is not kept — the data protection officer can say otherwise');
  }
  const number = companyNumber(p.company_number);
  const numberWhy = p.company_number === undefined || p.company_number === null || p.company_number.trim() === ''
    ? '' : number === null ? '; the registered number is not in Companies House’s shape and is dropped' : '';
  return { role_token: roleToken(p), company: name, company_number: number, why: `kept: ${c.reason}${numberWhy}` };
}

/**
 * THE CAPTURE OF A CONVEYANCING UPLOAD'S PARTIES. Off: exactly `todaysCapture`. On: a company or LLP party to the
 * transaction keeps its name and registered number; everyone else is their role token. Any other document type is
 * refused, on and off alike.
 */
export function captureParties(doc_type: string, parties: readonly PartyOnDocument[], s: ConveyancingStrip = CONVEYANCING_STRIP): CaptureResult {
  if (!s.applies_to.includes(doc_type)) {
    return { ok: false, why: `only ${s.applies_to.join(' and ')} have a parties clause read by a person; this is ${doc_type}` };
  }
  if (!s.enabled) return { ok: true, parties: todaysCapture(parties) };
  return { ok: true, parties: parties.map((p) => onRead(p, s)) };
}

/** Every token this file can produce is one the ingestion module declares. The test asserts it. */
export const TOKENS_USED: readonly string[] = Object.freeze(['[SELLER]', '[BUYER]', '[LANDLORD]', '[TENANT]', '[WITNESS]', '[SIGNATORY]',
  '[FEE EARNER]', '[GUARANTOR]', '[NAMED INDIVIDUAL]'].filter((t) => ROLE_TOKENS.includes(t)));
