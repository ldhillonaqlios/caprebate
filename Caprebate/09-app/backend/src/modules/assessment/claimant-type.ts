/**
 * THE CLAIMANT TYPE THE CLIENT GAVE US, AS A GATE READS IT (Phase 161l1, moved from src/modules/crm/crm.ts unchanged):
 * derived from the funnel's entity answer where it settles it, else as recorded on the organisation, else null. Read by
 * the claims, the survey and the finance gates, and by the CRM's organisation page.
 */
import type { Db } from '../../core/index.ts';
import { getBusinessesClaimantTypeById } from '../clients/index.ts';
import { getAssessmentsIdByBusinessId2, listAssessmentAnswersStateValueByAssessmentIdQuestionId } from './data.ts';

type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

/** The funnel's own entity keys onto the claimant list — CB_FUNNEL.ENTITY_LABEL. */
const FUNNEL_ENTITY: Vocab = Object.freeze({
  ltd: 'COMPANY', llp: 'LLP', partnership: 'PARTNERSHIP', sole_trader: 'SOLE_TRADER',
});

/**
 * THE CLAIMANT TYPE AS A GATE READS IT — CRM 6 of 10. The same derivation as the
 * organisation page, asked by the server of the records on this request and
 * served to nobody: the amendment window turns on it. Derived where the client's
 * own answer settles it, else as recorded on the organisation, else null.
 * UNKNOWN recorded and never recorded both come back null.
 */
export function claimantTypeForGate(db: Db, business_id: string): { value: string | null; source: string | null } {
  const latest = getAssessmentsIdByBusinessId2<{ id: string }>(db, [business_id]);
  const derived = latest === undefined ? null : claimantFromAnswers(db, latest.id);
  if (derived !== null) return { value: derived, source: 'the client’s own answer in the assessment' };
  const b = getBusinessesClaimantTypeById<{ claimant_type: string | null }>(db, [business_id]);
  const recorded = b?.claimant_type ?? null;
  return recorded === null || recorded === 'UNKNOWN' ? { value: null, source: null } : { value: recorded, source: 'recorded on the organisation by staff' };
}

export function claimantFromAnswers(db: Db, assessment_id: string): string | null {
  const latest = { id: assessment_id };
  const rows = listAssessmentAnswersStateValueByAssessmentIdQuestionId<{ state: string; value: string | null }>(db, [latest.id]);
  if (rows.length === 0) return null;
  const mapped = rows.map((r) => (r.state === 'ANSWERED' && has(FUNNEL_ENTITY, r.value) ? FUNNEL_ENTITY[r.value] : undefined));
  const first = mapped[0];
  if (first === undefined || mapped.some((m) => m !== first)) return null;
  return first;
}
