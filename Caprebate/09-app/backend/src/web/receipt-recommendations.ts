/**
 * THE RECOMMENDED RECEIPT STRIP FOR EACH OF THE FOURTEEN DOCUMENT TYPES THAT HAVE NONE — RECORDED, NOT APPROVED, AND BINDING
 * NOTHING. Phase 129, 12 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * CRM 4 of 10 recorded fourteen document types from the CRM specification's list with no receipt policy (migration 013;
 * 09-app/CAPREBATE-CRM-DISPOSITION.md row E34). Choosing a strip is the data protection officer's decision, asked in
 * CAPREBATE QUESTIONS under exactly this title:
 *   "Which receipt strip should each new document type carry before anyone may upload one?"
 * Whatever can be built before the person answers is built and switched off, so the officer approves or amends a
 * recommendation rather than filling a blank page. This file is that recommendation, one line of reason per type.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO_RECEIPT_POLICY IS UNCHANGED, AND THIS FILE CANNOT CHANGE IT
 *
 * Whether a type can be received is `stripReading(handler_type)` in src/web/documents.ts, read off
 * `document_types.handler_type`, and that is NULL for all fourteen. Nothing here writes it and nothing in documents.ts
 * reads this file. So `approved: true` would still receive nothing: an approved recommendation becomes a policy only
 * when a migration binds it — see the header of migration 021 for what that takes. The test holds both halves.
 *
 * The copy the database keeps is `receipt_strip_recommendations` in migration 021, and a test holds the two identical.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PHASE 151b, 25 SEPTEMBER 2026: THE TAX COMPUTATION IS BOUND, AND ITS ROW STAYS
 *
 * Word question 223. The data protection officer said yes to tax returns and tax computations as uploads on
 * 24 September 2026, and until they say what must be removed, the figures and the company details are kept and the
 * individuals removed — this file's own recommendation for the tax computation, in substance. Migration 049 binds it to
 * a receipt policy of its own name, so it can now be received. Its row below is NOT deleted and NOT changed: it is the
 * record of what the officer was asked, the table in migration 021 is never edited, and the two must stay identical.
 * What changes is how it reads: a type that now has its own receipt policy reads BOUND, with the policy's own words,
 * whatever the recommendation says. Nine of the fourteen are still unbound: Phase 157d (migration 099) bound the completion statement, accounts, contractor's invoices and plans, on these recommendations.
 */

import type { Db } from '../db.ts';
import { authorise, type Actor, type Obj } from '../authz.ts';
import { stripReading, NO_RECEIPT_POLICY, type StripReading } from './documents.ts';

export type RecommendedStrip = 'KEEP_WHOLE' | 'STRIP_INDIVIDUALS_KEEP_FIGURES' | 'REFUSE_AS_UPLOAD';

/** The title of the question for the data protection officer in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const RECEIPT_STRIP_QUESTION = 'Which receipt strip should each new document type carry before anyone may upload one?';

export const STRIP_WORDS: Readonly<Record<RecommendedStrip, string>> = Object.freeze({
  KEEP_WHOLE: 'Keep it whole — nothing removed',
  STRIP_INDIVIDUALS_KEEP_FIGURES: 'Remove the individuals and keep the figures',
  REFUSE_AS_UPLOAD: 'Do not accept it as an upload',
});

export type ReceiptRecommendation = {
  readonly type_code: string;
  readonly strip: RecommendedStrip;
  /** The existing receipt policy the strip is modelled on. Set only for STRIP_INDIVIDUALS_KEEP_FIGURES. */
  readonly modelled_on: string | null;
  readonly reason: string;
};

export type ReceiptRecommendations = {
  /** Whether the data protection officer has approved the table. SHIPS false. Approval alone receives nothing. */
  readonly approved: boolean;
  readonly drafted_on: string;
  readonly question: string;
  readonly types: readonly ReceiptRecommendation[];
};

function r(type_code: string, strip: RecommendedStrip, modelled_on: string | null, reason: string): ReceiptRecommendation {
  return Object.freeze({ type_code, strip, modelled_on, reason });
}

/**
 * THE RECOMMENDATION. Five we produce kept whole; six financial and drawn documents with the individuals removed and the
 * figures kept, each modelled on the existing policy nearest to it; three not accepted as uploads.
 */
export const RECEIPT_RECOMMENDATIONS: ReceiptRecommendations = Object.freeze({
  approved: false,
  drafted_on: '2026-09-12',
  question: RECEIPT_STRIP_QUESTION,
  types: Object.freeze([
    r('ENGAGEMENT_LETTER', 'KEEP_WHOLE', null,
      'We write it and the client signs it: everyone it names is the client’s own signatory or ours, and the signed copy is the evidence the engagement exists.'),
    r('INVOICE', 'KEEP_WHOLE', null,
      'We issue it: it names our client and us, the bank details on it are our own company’s, and the finance record must match the document exactly.'),
    r('SURVEY_REPORT', 'KEEP_WHOLE', null,
      'Our surveyor writes it for this claim to a template that names nobody outside it; a report naming a resident or a member of staff is a defect corrected in the report, not a reason to strip every report.'),
    r('CA_REPORT', 'KEEP_WHOLE', null,
      'Our issued report, written to name nobody the claim does not need; a party in the entitlement chain appears in it only as the conveyancing question allows, so the control is in the writing.'),
    r('CLAIM_DOCUMENTATION', 'KEEP_WHOLE', null,
      'Only what we produce for the claim; an election signed by the other party to a purchase is not this type but the sale contract’s election schedule, received under that document’s own policy.'),
    r('COMPLETION_STATEMENT', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
      'The price, its apportionment, the stamp duty and the dates are what the claim needs; the fee earners, any individual party and the bank details for completion money are not.'),
    r('VALUATION', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'INSURANCE_REINSTATEMENT',
      'The figures and the basis of value are the cross-check the claim uses; the valuer’s name and registration sit in the certification block, which is not kept, as for the reinstatement valuation.'),
    r('ACCOUNTS', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
      'The balance sheet and the fixed-asset and tax notes say whether the company can use the allowances; the directors, the preparer and anyone in a related-party note are not needed for that.'),
    r('TAX_COMPUTATION', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'LEASE',
      'The pool figures and the profit position are the claim’s inputs; the preparer’s name, and an individual taxpayer’s tax reference or National Insurance number, are not.'),
    r('CONTRACTOR_INVOICE', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'CONTRACTOR_COST_BREAKDOWN',
      'Line items, amounts and dates are actual cost, which beats any apportionment; a sole-trader contractor’s name, a signatory and anybody’s bank details are not needed for it.'),
    r('PLANS', 'STRIP_INDIVIDUALS_KEEP_FIGURES', 'OM_MANUAL',
      'Room labels and schedules locate the plant; the title block’s drawn-by, checked-by and client names are not needed. Only the text layer passes the strip, so the picture itself is kept only if the raw-file rule keeps the file.'),
    r('SURVEY_PHOTOS', 'REFUSE_AS_UPLOAD', null,
      'A photograph has no parts to keep or remove, and one of a care home corridor may show a resident; survey photographs stay in the surveyor’s own record.'),
    r('CORRESPONDENCE', 'REFUSE_AS_UPLOAD', null,
      'Every receipt policy already removes correspondence as content we have no lawful basis to keep, so a letter under the same rule keeps nothing; its substance goes in a note on the claim.'),
    r('OTHER', 'REFUSE_AS_UPLOAD', null,
      'Nobody can say what it holds, so no strip can be written for it; the uploader chooses the type the document actually is, or it is not taken.'),
  ]),
});

export type RecommendationReading = {
  readonly type_code: string;
  /** What the type can do TODAY — always documents.ts's own reading, never this file's. */
  readonly strip_now: StripReading;
  readonly recommended: { readonly strip: RecommendedStrip; readonly words: string; readonly modelled_on: string | null; readonly reason: string } | null;
  /** BOUND (Phase 151b): the type has a receipt policy of its own now, and the recommendation is only the record. */
  readonly state: 'RECOMMENDED_NOT_APPROVED' | 'APPROVED_NOT_BOUND' | 'BOUND' | 'NO_RECOMMENDATION';
  readonly label: string;
};

const TYPES_OBJ: Obj = { type: 'document_type', id: '__document_types__' };

/**
 * ONE TYPE: what it can do now, and what is recommended for it. Read by the same people who read the document types.
 * A type that is not one of the fourteen — or not a type at all — has no recommendation and says so; it is never given one.
 */
export function recommendationReading(db: Db, actor: Actor, type_code: string, rec: ReceiptRecommendations = RECEIPT_RECOMMENDATIONS): RecommendationReading {
  authorise(actor, 'document_type.read', TYPES_OBJ);
  const t = db.get<{ handler_type: string | null }>('SELECT handler_type FROM document_types WHERE code = ?', [type_code]);
  const strip_now = stripReading(t === undefined ? null : t.handler_type);
  const found = rec.types.find((x) => x.type_code === type_code);
  if (found === undefined) {
    return { type_code, strip_now, recommended: null, state: 'NO_RECOMMENDATION', label: 'No recommendation is recorded for this type.' };
  }
  const recommended = { strip: found.strip, words: STRIP_WORDS[found.strip], modelled_on: found.modelled_on, reason: found.reason };
  /* PHASE 151b. A migration has bound this type to a receipt policy, so what we suggested is history, and the reading
     says what happens now. Approved or not makes no difference to a type that can already be received. */
  if (strip_now.receivable) {
    return {
      type_code, strip_now, recommended, state: 'BOUND',
      label: `Switched on. ${strip_now.label} We keep our earlier suggestion as a record of what the data protection officer was asked.`,
    };
  }
  const still = strip_now.receivable ? '' : ` Until we switch it on: ${NO_RECEIPT_POLICY}`;
  return rec.approved
    ? { type_code, strip_now, recommended, state: 'APPROVED_NOT_BOUND', label: `Approved by the data protection officer, but not switched on yet.${still}` }
    : {
        type_code, strip_now, recommended, state: 'RECOMMENDED_NOT_APPROVED',
        label: `Suggested by us — not yet approved by the data protection officer.${still}`,
      };
}
