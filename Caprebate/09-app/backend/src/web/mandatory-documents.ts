/**
 * MANDATORY DOCUMENTS AT A STAGE — BUILT, AND SWITCHED ON IN PHASE 151b. The CRM follow-on, 12 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SWITCHED ON, 25 SEPTEMBER 2026 (Phase 151b)
 *
 * Lakhbir's four documents (Word answer 47) must now arrive before a claim leaves DATA_GATHERING. Everything the switch
 * waited on is settled. Word question 220 is closed: yes, the sale contract and the CPSE replies are asked only when the
 * client bought the building, as built. Word question 223 was answered yes by the data protection officer on
 * 24 September 2026: clients may upload tax returns and tax computations, and until the officer says what must be
 * removed, the figures and the company details are kept and individuals' names, addresses and tax references removed.
 * The one thing still missing was buildable, and Phase 151b built it: a receipt policy for each tax document in the
 * upload handler, bound by migration 049. So each of the four can now be received, and a claim is never held at the
 * gate by a document nobody can upload — test/phase151b-documents.test.ts proves that for each of the four.
 *
 * What did NOT change: a fact not known and a fact never recorded still excuse nothing (N4). Whether the client bought
 * the building must be recorded as YES or NO before the sale contract and the CPSE replies are excused.
 *
 * The rest of this header is as it was written while the switch was off, and says why it was built that way.
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

export type DocumentCondition = 'ALWAYS' | 'GRANT_FUNDED' | 'ELECTION_MADE' | 'LEASEHOLD' | 'BOUGHT';

export type MandatoryDocuments = {
  readonly enabled: boolean;
  readonly stage: 'DATA_GATHERING';
  readonly question: string;
  readonly requires: readonly { readonly type_code: string; readonly condition: DocumentCondition }[];
};

/**
 * PHASE 151, 24 September 2026: the question this switch waited on was answered — Word answer 47, "the sale contract,
 * the CPSE replies, the tax returns and the tax computations" — and closed. It now waits on the two follow-ups, quoted
 * by their titles: 220 below, and 223 in MANDATORY_DOCUMENTS_ALSO_WAITS_ON.
 */
export const MANDATORY_DOCUMENTS_QUESTION = 'May we accept tax returns and tax computations as uploads, and what must be removed from them?';
/* 24 September 2026: question 220 was answered yes (the sale contract and CPSE only when the client bought the building,
   as built) and closed; the data protection officer said yes to the uploads under 223, which stays open for what must be
   removed. WHAT STILL KEEPS THIS OFF is buildable: neither tax document has a receipt policy in the upload handler, so
   neither can be received, and switching this on now would stop every claim at the gate (Phase 151b). */
/* 25 September 2026, Phase 151b: built — a receipt policy for each tax document, bound by migration 049 — so the switch is
   on and waits on nothing. Question 223 stays open only for what must be removed; until the officer answers that, the
   rule quoted in the header above applies, and changing it is a change to the receipt policies, not to this switch. */
export const MANDATORY_DOCUMENTS_ALSO_WAITS_ON = 'nothing now: the receipt policy for the tax return and the tax computation in the upload handler was built in Phase 151b';

/**
 * LAKHBIR'S LIST (Word answer 47, Phase 151), SWITCHED ON IN PHASE 151b. Four documents: the sale contract and the CPSE
 * replies ONLY WHEN THE CLIENT BOUGHT THE BUILDING — the claim's own fact BOUGHT_THE_BUILDING (migration 045), because a
 * client who built or refitted has neither (Word question 220, closed yes) — and the tax return and the tax computation
 * on every claim. It shipped off in Phase 151 because neither tax document could be received; Phase 151b gave each a
 * receipt policy (migration 049), so it is on. Until Phase 151 the list was our own recommendation: the fire risk
 * assessment always, the grant funding agreement where grant-funded, the sale contract where an election was made, and
 * the lease where leasehold (caprebate's .bak-phase151 copy keeps it).
 */
export const MANDATORY_DOCUMENTS: MandatoryDocuments = Object.freeze({
  enabled: true,
  stage: 'DATA_GATHERING',
  question: MANDATORY_DOCUMENTS_QUESTION,
  requires: Object.freeze([
    Object.freeze({ type_code: 'SALE_CONTRACT', condition: 'BOUGHT' as const }),
    Object.freeze({ type_code: 'CPSE_REPLIES', condition: 'BOUGHT' as const }),
    Object.freeze({ type_code: 'TAX_RETURN', condition: 'ALWAYS' as const }),
    Object.freeze({ type_code: 'TAX_COMPUTATION', condition: 'ALWAYS' as const }),
  ]),
});

export const CONDITION_WORDS: Readonly<Record<DocumentCondition, string>> = Object.freeze({
  ALWAYS: 'on every claim',
  GRANT_FUNDED: 'where any spend was grant-funded — the claim’s own fact',
  ELECTION_MADE: 'where a s.198 or s.199 election affects the property — the claim’s own fact',
  LEASEHOLD: 'where the property is leasehold — the property’s tenure',
  BOUGHT: 'where the client bought the building — the claim’s own fact',
});

type Applies = { readonly applies: true } | { readonly applies: false; readonly known: boolean; readonly why: string };

function choiceFact(db: Db, claim_id: string, key: string): string | null {
  const r = latestFacts(db, claim_id).get(key);
  return r === undefined || r.answer !== 'VALUE' ? null : r.value_text;
}

function applies(db: Db, c: { id: string; property_id: string | null }, condition: DocumentCondition): Applies {
  if (condition === 'ALWAYS') return { applies: true };
  if (condition === 'GRANT_FUNDED' || condition === 'ELECTION_MADE' || condition === 'BOUGHT') {
    const key = condition === 'GRANT_FUNDED' ? 'GRANTS_EXIST' : condition === 'ELECTION_MADE' ? 'ELECTION_EXISTS' : 'BOUGHT_THE_BUILDING';
    const v = choiceFact(db, c.id, key);
    if (v === 'YES') return { applies: true };
    if (v === 'NO') {
      return {
        applies: false, known: true,
        why: condition === 'GRANT_FUNDED' ? 'no spend was grant-funded, as recorded'
          : condition === 'ELECTION_MADE' ? 'no election affects the property, as recorded'
          : 'the client did not buy the building, as recorded',
      };
    }
    return {
      applies: false, known: false,
      why: condition === 'GRANT_FUNDED'
        ? 'whether any spend was grant-funded is not known — record it on the facts panel; not known does not pass'
        : condition === 'ELECTION_MADE'
          ? 'whether an election affects the property is not known — record it on the facts panel; not known does not pass'
          : 'whether the client bought the building is not known — record it on the facts panel; not known does not pass',
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
