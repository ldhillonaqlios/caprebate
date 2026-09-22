/**
 * MANDATORY DOCUMENTS AT A STAGE — BUILT, AND SWITCHED OFF. The CRM follow-on, 12 September 2026.
 *
 * The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, row 29.5, and Part R. The gate that reads it is the gate out of
 * DATA_GATHERING in src/web/pipeline.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT IS OFF
 *
 * Which of the Stage 2 upload list's ten documents must have arrived before a claim leaves data gathering is a business
 * decision, and nobody has made it. The list itself marks several as conditional — "where any spend was grant-funded" —
 * and says nothing about the rest. So the table below is OUR RECOMMENDATION, built so the answer is a one-line change,
 * and the switch ships off. The question is Lakhbir's, in CAPREBATE QUESTIONS, under exactly this title:
 *   "Which of the Stage 2 documents are mandatory, and at which stage?"
 *
 * OFF IS EXACTLY TODAY. With `enabled: false`, `mandatoryDocumentNeeds` returns no need at all, so the gate out of
 * DATA_GATHERING reads what it read before this file existed — test/follow-on.test.ts compares the two.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ON, A NEED PER DOCUMENT, AND A CONDITION IS READ, NEVER ASKED
 *
 *   ALWAYS         a received document of the type, on this claim or its property
 *   GRANT_FUNDED   the claim's own fact GRANTS_EXIST, recorded on the facts panel
 *   ELECTION_MADE  the claim's own fact ELECTION_EXISTS, recorded on the facts panel
 *   LEASEHOLD      the property's tenure, recorded on the property
 *
 * A condition whose fact is NOT KNOWN — recorded as not known, or never recorded — does not pass and does not excuse the
 * document: the need is unmet, and it says which fact to establish (N4). Nothing here puts a question to anybody.
 *
 * RECEIVED MEANS THE UPLOAD HANDLER RECEIVED IT: a version with its receipt strip recorded, its quarantine discharged and
 * no refusal, of a document linked to the claim or to its property — the documents the claim's own panel lists. A
 * request, a click or a document on the organisation linked to nothing is not a received document of the claim.
 */

import type { Db } from '../db.ts';
import type { Need } from './pipeline.ts';
import { latestFacts } from './claim-facts.ts';

export type DocumentCondition = 'ALWAYS' | 'GRANT_FUNDED' | 'ELECTION_MADE' | 'LEASEHOLD';

export type MandatoryDocuments = {
  readonly enabled: boolean;
  readonly stage: 'DATA_GATHERING';
  readonly question: string;
  readonly requires: readonly { readonly type_code: string; readonly condition: DocumentCondition }[];
};

/** The title of the question under Lakhbir in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const MANDATORY_DOCUMENTS_QUESTION = 'Which of the Stage 2 documents are mandatory, and at which stage?';

/**
 * THE RECOMMENDATION, SHIPPED OFF. Four of the ten: the one the list says every client holds, and the three whose condition
 * is a fact this build already holds. The other six — O&M manuals, the asbestos register, the pre-contract enquiry replies,
 * the contractor's cost breakdown, the insurance reinstatement valuation and the Building Regulations certificate — are
 * asked for and never made a condition of the gate, because their conditions (a refurbishment, a building older than
 * 2000, a purchase, invoices existing) are facts nothing records yet. The question puts all ten.
 */
export const MANDATORY_DOCUMENTS: MandatoryDocuments = Object.freeze({
  enabled: false,
  stage: 'DATA_GATHERING',
  question: MANDATORY_DOCUMENTS_QUESTION,
  requires: Object.freeze([
    Object.freeze({ type_code: 'FIRE_RISK_ASSESSMENT', condition: 'ALWAYS' as const }),
    Object.freeze({ type_code: 'GRANT_FUNDING_AGREEMENT', condition: 'GRANT_FUNDED' as const }),
    Object.freeze({ type_code: 'SALE_CONTRACT', condition: 'ELECTION_MADE' as const }),
    Object.freeze({ type_code: 'LEASE', condition: 'LEASEHOLD' as const }),
  ]),
});

export const CONDITION_WORDS: Readonly<Record<DocumentCondition, string>> = Object.freeze({
  ALWAYS: 'on every claim',
  GRANT_FUNDED: 'where any spend was grant-funded — the claim’s own fact',
  ELECTION_MADE: 'where a s.198 or s.199 election affects the property — the claim’s own fact',
  LEASEHOLD: 'where the property is leasehold — the property’s tenure',
});

type Applies = { readonly applies: true } | { readonly applies: false; readonly known: boolean; readonly why: string };

function choiceFact(db: Db, claim_id: string, key: string): string | null {
  const r = latestFacts(db, claim_id).get(key);
  return r === undefined || r.answer !== 'VALUE' ? null : r.value_text;
}

function applies(db: Db, c: { id: string; property_id: string | null }, condition: DocumentCondition): Applies {
  if (condition === 'ALWAYS') return { applies: true };
  if (condition === 'GRANT_FUNDED' || condition === 'ELECTION_MADE') {
    const key = condition === 'GRANT_FUNDED' ? 'GRANTS_EXIST' : 'ELECTION_EXISTS';
    const v = choiceFact(db, c.id, key);
    if (v === 'YES') return { applies: true };
    if (v === 'NO') return { applies: false, known: true, why: condition === 'GRANT_FUNDED' ? 'no spend was grant-funded, as recorded' : 'no election affects the property, as recorded' };
    return {
      applies: false, known: false,
      why: condition === 'GRANT_FUNDED'
        ? 'whether any spend was grant-funded is not known — record it on the facts panel; not known does not pass'
        : 'whether an election affects the property is not known — record it on the facts panel; not known does not pass',
    };
  }
  const tenure = c.property_id === null ? null
    : db.get<{ tenure: string | null }>('SELECT tenure FROM properties WHERE id = ?', [c.property_id])?.tenure ?? null;
  if (tenure === 'LEASEHOLD') return { applies: true };
  if (tenure === 'FREEHOLD') return { applies: false, known: true, why: 'the property is freehold, as recorded' };
  return { applies: false, known: false, why: 'the property’s tenure is not known — record it on the property; not known does not pass' };
}

function receivedOnClaim(db: Db, c: { id: string }, type_code: string): { at: string } | undefined {
  const r = db.get<{ at: string | null }>(
    'SELECT MAX(d.created_at) AS at FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id ' +
      'WHERE l.type_code = ? AND d.strip_recorded_at IS NOT NULL AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL ' +
      'AND l.id IN (SELECT k.logical_document_id FROM document_links k LEFT JOIN claims x ON x.property_id = k.property_id ' +
      'WHERE k.unlinked_at IS NULL AND (k.claim_id = ? OR x.id = ?))',
    [type_code, c.id, c.id]);
  return r === undefined || r.at === null ? undefined : { at: r.at };
}

/**
 * THE NEEDS THE GATE OUT OF DATA_GATHERING ADDS — NONE WHILE THE SWITCH IS OFF. Read from the records on the request,
 * like every other need; asked again at every move.
 */
export function mandatoryDocumentNeeds(
  db: Db, c: { id: string; property_id: string | null }, m: MandatoryDocuments = MANDATORY_DOCUMENTS,
): Need[] {
  if (!m.enabled) return [];
  return m.requires.map((req) => {
    const label = db.get<{ label: string }>('SELECT label FROM document_types WHERE code = ?', [req.type_code])?.label ?? req.type_code;
    const what = `${label} is received — ${CONDITION_WORDS[req.condition]}`;
    const a = applies(db, c, req.condition);
    if (!a.applies) return { what, met: a.known, why: a.why };
    const got = receivedOnClaim(db, c, req.type_code);
    return got === undefined
      ? { what, met: false, why: `no ${label.toLowerCase()} has been received on this claim or its property — a request is not a receipt` }
      : { what, met: true, why: 'received — we read it, then deleted the file' };
  });
}
