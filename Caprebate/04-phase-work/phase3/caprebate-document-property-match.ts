/**
 * Caprebate — Document/Property Match
 * Board item 12902224596. Phase 3, item 7. Wraps caprebate-document-pipeline.ts
 * (12830166311).
 *
 * The defect this closes: every extraction spec in the pipeline writes claims
 * against the job's entity, but the entity association comes from the upload
 * context — which slot on which job the file arrived in — and is never checked
 * against what the document itself says. A care home operator running several
 * homes uploads "the fire risk assessment" and gets the first one they find.
 * The result is a clean, high-confidence extraction of correct data about the
 * wrong building. Thresholds don't catch it (they measure extraction
 * confidence, not relevance). Reconciliation doesn't catch it (a single
 * confident claim raises no conflict). It can even falsely corroborate.
 *
 * ============================================================================
 * THREE OUTCOMES
 *
 *   MATCH      proceed normally.
 *   MISMATCH   the document contributes NO claims. Not discarded — routed to
 *              review, because a group-wide FRA covering six homes is a
 *              legitimate mismatch and that is a human call, not ours.
 *   NOT_STATED the document identifies no property at all. This must NOT be
 *              collapsed into MATCH, for the same reason UNKNOWN is never
 *              coalesced with a value elsewhere in this codebase.
 *
 * THE CONSTRAINT THAT SHAPES THIS
 *
 * NOT_STATED will be common, and commonest on the most valuable document
 * type — an O&M plant schedule frequently carries only a project reference,
 * no address. So this is NOT a hard ingestion gate: a NOT_STATED document
 * still produces claims. What it loses is the right to corroborate. A claim
 * from a NOT_STATED document is marked on its retrieval (property_match, see
 * caprebate-source-register.ts) and caprebate-reconciliation.ts's
 * areIndependent() refuses to count it as the second, independent voice that
 * turns SINGLE_SOURCE into CORROBORATED. Same principle as a surveyor's own
 * pre-fill not counting as independent evidence of their own estimate —
 * unverified provenance doesn't corroborate, wherever it shows up.
 *
 * KNOWN LIMITATION, FLAGGED AND NOT SOLVED HERE
 *
 * Where a document names several properties and the subject is among them,
 * MATCH is correct only if the extraction that follows is then scoped to the
 * right section — a group FRA listing six homes will otherwise contribute
 * another home's plant to THIS claim. matchProperty() flags this
 * (portfolio_scoping_risk) rather than resolving it.
 * ============================================================================
 */

import type { DocType, Segment, ModelFn, EgressEntry, ExtractionResult, ClaimSpec, ReviewTask } from './caprebate-document-pipeline.ts';
import { extract, toClaims, THRESHOLD_BY_CONSEQUENCE } from './caprebate-document-pipeline.ts';

/* ------------------------------------------------------------------ *
 * 1. Outcome and inputs
 * ------------------------------------------------------------------ */

export type PropertyMatchOutcome = 'MATCH' | 'MISMATCH' | 'NOT_STATED';

/** GATE consequence, same table every other field threshold is drawn from — never a private number. */
export const GATE_THRESHOLD = THRESHOLD_BY_CONSEQUENCE.GATE;

/**
 * The job's subject property, as independently evidenced — the Land Registry
 * title address, plus any known alternative names for the site (a care home
 * commonly trades under a name that isn't its postal address).
 */
export type SubjectProperty = {
  job_id: string;
  address_lines: readonly string[];
  postcode: string | null;
  uprn: string | null;
  primary_name: string | null;
  alternative_names: readonly string[];
};

/**
 * One property identification found IN a document — "as the document itself
 * states it": an address block, a UPRN, a site or building name. A single
 * document may yield several of these (a group-wide schedule); an O&M manual
 * naming no property at all yields zero.
 */
export type PropertyMention = {
  raw_text: string;
  address_lines: readonly string[];
  postcode: string | null;
  uprn: string | null;
  site_name: string | null;
  /** The extractor's own confidence that this text identifies a property, 0..1. */
  confidence: number;
  quote_ref: string;
  page: number;
};

export type PropertyMatchResult = {
  doc_id: string;
  outcome: PropertyMatchOutcome;
  /** The mention(s) judged to be the subject property. Empty unless MATCH. */
  matched_mentions: readonly PropertyMention[];
  /** Every OTHER property named in the document — the evidence a human reviews. */
  other_properties: readonly PropertyMention[];
  /** See module header: MATCH on a multi-property document is not yet section-scoped. */
  portfolio_scoping_risk: boolean;
  /** Best confidence among matched_mentions, or null when there is none. */
  best_confidence: number | null;
  /** True when a MATCH was found but below the GATE threshold — confirm, don't trust blind. */
  low_confidence: boolean;
  reason: string;
};

/* ------------------------------------------------------------------ *
 * 2. Normalisation — a check that fails on "Rd" vs "Road" gets switched off
 *    within a week, so formatting variance must not read as a mismatch.
 * ------------------------------------------------------------------ */

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  RD: 'ROAD', ST: 'STREET', STR: 'STREET', AVE: 'AVENUE', AV: 'AVENUE', LN: 'LANE',
  CL: 'CLOSE', DR: 'DRIVE', DRV: 'DRIVE', PK: 'PARK', SQ: 'SQUARE', PL: 'PLACE',
  CT: 'COURT', CRES: 'CRESCENT', GDNS: 'GARDENS', GDN: 'GARDEN', GRN: 'GREEN',
  HSE: 'HOUSE', HTS: 'HEIGHTS', TER: 'TERRACE', TERR: 'TERRACE', MT: 'MOUNT',
  WK: 'WALK', GR: 'GROVE', GRV: 'GROVE', HL: 'HILL', PDE: 'PARADE', MEWS: 'MEWS',
  BLDG: 'BUILDING', BLDGS: 'BUILDINGS',
};

/** Words too generic to establish identity on their own — "Care House" tells you nothing. */
const GENERIC_ADDRESS_WORDS = new Set([
  'THE', 'AND', 'CARE', 'HOME', 'HOUSE', 'LODGE', 'COURT', 'MANOR', 'GROUP', 'LTD', 'LIMITED',
]);

function normaliseWords(text: string): string {
  return text
    .toUpperCase()
    .replace(/['.,]/g, '')
    .replace(/&/g, ' AND ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ADDRESS_ABBREVIATIONS[w] ?? w)
    .join(' ');
}

function normalisePostcode(pc: string | null): string | null {
  if (!pc) return null;
  const p = pc.toUpperCase().replace(/\s+/g, '');
  return p.length ? p : null;
}

function significantTokens(lines: readonly string[]): Set<string> {
  return new Set(
    normaliseWords(lines.join(' '))
      .split(' ')
      .filter((w) => w.length > 2 && !GENERIC_ADDRESS_WORDS.has(w)),
  );
}

/* ------------------------------------------------------------------ *
 * 3. The decision — per mention, then per document
 * ------------------------------------------------------------------ */

function subjectNames(subject: SubjectProperty): readonly string[] {
  return [subject.primary_name, ...subject.alternative_names]
    .filter((n): n is string => !!n && n.trim().length > 0)
    .map(normaliseWords);
}

/**
 * Whether one mention IS the subject property. UPRN, where both sides have
 * it, is decisive either way — it is a unique identifier, not a fuzzy signal.
 * A known alternative name is decisive on its own, because a site legitimately
 * trades under a name its own address block will never contain. Failing
 * those, a stated postcode that differs from the subject's is treated as real
 * evidence of a different building even where some address words coincide —
 * two homes on the same road are exactly the case this check exists for.
 */
function mentionMatchesSubject(mention: PropertyMention, subject: SubjectProperty): boolean {
  if (mention.uprn && subject.uprn) {
    return mention.uprn.trim() === subject.uprn.trim();
  }

  const nameHit = !!mention.site_name && subjectNames(subject).includes(normaliseWords(mention.site_name));

  const mPostcode = normalisePostcode(mention.postcode);
  const sPostcode = normalisePostcode(subject.postcode);
  if (mPostcode && sPostcode) {
    return mPostcode === sPostcode || nameHit;
  }

  if (nameHit) return true;

  const sTokens = significantTokens(subject.address_lines);
  const mTokens = [...significantTokens(mention.address_lines)];
  if (mTokens.length === 0) return false;
  const shared = mTokens.filter((w) => sTokens.has(w));
  // Require agreement on (almost) everything significant the mention states,
  // not just some — "2 Chapel Lane" must not match "14 Chapel Lane" because
  // both share the token CHAPEL LANE.
  return shared.length === mTokens.length && shared.length >= 1;
}

export function matchProperty(
  doc_id: string,
  subject: SubjectProperty,
  mentions: readonly PropertyMention[],
): PropertyMatchResult {
  if (mentions.length === 0) {
    return {
      doc_id, outcome: 'NOT_STATED', matched_mentions: [], other_properties: [],
      portfolio_scoping_risk: false, best_confidence: null, low_confidence: false,
      reason: 'the document states no property identifier — no address line, postcode, UPRN or site name found',
    };
  }

  const matched = mentions.filter((m) => mentionMatchesSubject(m, subject));
  const others = mentions.filter((m) => !matched.includes(m));

  if (matched.length === 0) {
    return {
      doc_id, outcome: 'MISMATCH', matched_mentions: [], other_properties: mentions,
      portfolio_scoping_risk: false, best_confidence: null, low_confidence: false,
      reason:
        `the document identifies ${mentions.length === 1 ? 'a property' : mentions.length + ' properties'} ` +
        `— ${mentions.map((m) => m.raw_text).join('; ')} — none matching this job's subject property`,
    };
  }

  const best_confidence = Math.max(...matched.map((m) => m.confidence));
  const portfolio_scoping_risk = others.length > 0;
  return {
    doc_id, outcome: 'MATCH', matched_mentions: matched, other_properties: others,
    portfolio_scoping_risk, best_confidence, low_confidence: best_confidence < GATE_THRESHOLD,
    reason: portfolio_scoping_risk
      ? `the subject property is named among ${mentions.length} properties in this document — ` +
        'section-scoping of the extraction to the subject is not verified by this check (known limitation)'
      : 'the document identifies the subject property',
  };
}

/* ------------------------------------------------------------------ *
 * 4. Review — MISMATCH is a human call, never a silent discard
 * ------------------------------------------------------------------ */

export function propertyReviewTask(m: PropertyMatchResult, doc_type: DocType): ReviewTask | null {
  if (m.outcome === 'MISMATCH') {
    const first = m.other_properties[0];
    return {
      doc_id: m.doc_id,
      field_id: 'document_property_match',
      value: m.other_properties.map((p) => p.raw_text),
      confidence: 0,
      threshold: GATE_THRESHOLD,
      page: first ? first.page : 0,
      quote_ref: first ? first.quote_ref : '(no locator)',
      asked_of: 'CTA',
      question:
        `This ${doc_type} (document ${m.doc_id}) identifies ${m.other_properties.length === 1 ? 'a property' : 'properties'} ` +
        `— ${m.other_properties.map((p) => p.raw_text).join('; ')} — that does not match this job's subject property. ` +
        'Confirm whether it legitimately covers this property under a different description (for example a group-wide ' +
        'document) or was uploaded to the wrong job. No claims have been written from it pending your answer.',
    };
  }
  if (m.outcome === 'MATCH' && m.low_confidence) {
    const best = m.matched_mentions[0];
    return {
      doc_id: m.doc_id,
      field_id: 'document_property_match',
      value: best ? best.raw_text : null,
      confidence: m.best_confidence ?? 0,
      threshold: GATE_THRESHOLD,
      page: best ? best.page : 0,
      quote_ref: best ? best.quote_ref : '(no locator)',
      asked_of: 'CTA',
      question:
        `This ${doc_type} (document ${m.doc_id}) was read as matching the subject property at only ` +
        `${Math.round((m.best_confidence ?? 0) * 100)}% confidence, below the ${Math.round(GATE_THRESHOLD * 100)}% ` +
        'threshold for a gate field. Confirm the property identification before the claims are relied on.',
    };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 5. Wiring into the pipeline — every DocType, one call site
 * ------------------------------------------------------------------ */

export type PropertyGatedResult = {
  doc_id: string;
  doc_type: DocType;
  property_match: PropertyMatchResult;
  /** Null on MISMATCH: the model is never called, so there is nothing to extract. */
  extraction: ExtractionResult | null;
  /** [] on MISMATCH. Every claim otherwise carries property_match on its retrieval. */
  claims: ClaimSpec[];
  review: ReviewTask[];
};

/** Stamps the outcome onto a claim's retrieval, without disturbing anything else about it. */
export function stampPropertyMatch(claim: ClaimSpec, outcome: PropertyMatchOutcome): ClaimSpec {
  return { ...claim, retrieval: { ...claim.retrieval, property_match: outcome } };
}

/**
 * The single cross-cutting call site. Runs the match BEFORE extraction, not
 * beside it: a MISMATCH document is never sent to the model at all, so the
 * wrong-property content never becomes a claim that then has to be filtered
 * out downstream. MATCH and NOT_STATED both proceed to extract() unchanged;
 * NOT_STATED's only consequence is the stamp that keeps it from corroborating.
 */
export function extractWithPropertyGate(
  entity_id: string,
  doc_id: string,
  doc_type: DocType,
  subject: SubjectProperty,
  mentions: readonly PropertyMention[],
  segments: readonly Segment[],
  model: ModelFn,
  ctx: { at: string; egress: EgressEntry[] },
  retrieved_at: string,
): PropertyGatedResult {
  const property_match = matchProperty(doc_id, subject, mentions);
  const gateReview = propertyReviewTask(property_match, doc_type);

  if (property_match.outcome === 'MISMATCH') {
    return {
      doc_id, doc_type, property_match, extraction: null, claims: [],
      review: gateReview ? [gateReview] : [],
    };
  }

  const extraction = extract(doc_id, doc_type, segments, model, ctx);
  const claims = toClaims(entity_id, extraction, retrieved_at).map((c) => stampPropertyMatch(c, property_match.outcome));
  const review = gateReview ? [gateReview, ...extraction.review] : extraction.review;

  return { doc_id, doc_type, property_match, extraction, claims, review };
}
