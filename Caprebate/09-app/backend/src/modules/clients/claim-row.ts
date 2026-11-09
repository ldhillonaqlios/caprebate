/**
 * A CLAIM AS THE CLIENT RECORD NAMES IT (Phase 161l1, carved from src/modules/crm/crm.ts unchanged): the claim row a
 * board card and a task are built from, and a claim's name for a person (its company and its property). No
 * authorisation here: every caller has asked `claim.read` of the claim first. The statements are the client record's
 * borrowed reads (data-borrowed.ts), unchanged.
 */
import type { Db } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { getClaimsBusinessIdCompanyById, getStaffTasksIdClaimRefByClaimIdIsNextAction } from './data-borrowed.ts';

export type ClaimDbRow = {
  id: string; claim_ref: string; business_id: string; property_id: string | null; assessment_id: string | null;
  workstream: string; stage: string | null; owner_id: string | null; surveyor_id: string | null;
  priority: string | null; next_action: string | null; next_action_due: string | null;
  hold_reason: string | null; lost_reason: string | null; expected_completion: string | null;
  created_at: string; updated_at: string;
  hold_return_stage: string | null; tax_adviser_signoff_at: string | null;
  business_name: string; owner_name: string | null; surveyor_name: string | null; property_label: string | null;
  /** A claim is named by its company and its property, and a tile shows the property's town. */
  property_town: string | null;
};

function loadClaim(db: Db, id: string): ClaimDbRow {
  const r = getStaffTasksIdClaimRefByClaimIdIsNextAction<ClaimDbRow>(db, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/**
 * A CLAIM'S NAME FOR A PERSON: its company, its property, and its reference for the small grey label.
 * No authorisation: the caller has already asked `claim.read` of the claim it is naming.
 */
export function claimNaming(db: Db, claim_id: string): { readonly business_id: string; readonly company: string; readonly property: string | null; readonly ref: string } | null {
  const r = getClaimsBusinessIdCompanyById<{ business_id: string; company: string; property: string | null; ref: string }>(db, [claim_id]);
  return r ?? null;
}

/** "Company — Property": the words of a link to a claim. Never the reference, which is a label beside it. */
export function claimWords(db: Db, claim_id: string): string {
  const n = claimNaming(db, claim_id);
  if (n === null) return 'a claim';
  if (n.property === null || n.property.trim() === '') return `${n.company} — claim`;
  return n.property.startsWith(n.company) ? n.property : `${n.company} — ${n.property}`;
}

/** The claim row a board card is built from. No authorisation: the caller asks. */
export function loadClaimRow(db: Db, id: string): ClaimDbRow {
  return loadClaim(db, id);
}
