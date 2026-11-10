/**
 * THE CLIENT'S BUSINESS AND ITS ENGAGEMENT LETTER, AS A LOGIN MAY READ THEM: `readBusiness` (the business this actor is
 * asking about, or a refusal that looks the same as a missing row) and `engagement` (the letter's state). Moved here
 * from the portal (src/modules/portal/portal.ts) by Phase 161l2 (10 November 2026), unchanged: the claims' signing
 * (signing.ts) asks both, and they read only the client record (through its door) and the claims' own engagements. The
 * portal reads them through the claims' door and names them as before, so `portalModule.readBusiness` and its
 * NotFoundAsRefusal are these.
 */
import type { Db } from '../../core/index.ts';
import { authorise, type Actor } from '../../core/index.ts';
import { getBusinessesIdNameById3 } from '../clients/index.ts';
import { getEngagementsIdLetterStateByBusinessId3 } from './data.ts';

export type Business = {
  id: string; name: string; sector: string; stage: string;
  contact_email: string | null; contact_phone: string | null;
  /** Optional so existing fixtures stand. Read so the engagement letter can replace its specimen number. */
  company_number?: string | null;
};

/**
 * The business this actor is asking about, or a refusal.
 *
 * `business.read` for a CLIENT is `isOwnBusiness`, and the object it is asked
 * about is the one that was FETCHED — not the one in the URL. Authorising
 * against an id taken straight from the request would authorise a row nobody
 * had looked up.
 */
export function readBusiness(db: Db, actor: Actor, business_id: string): Business {
  const row = getBusinessesIdNameById3<Business>(db, [business_id]);
  // A MISSING ROW AND A FORBIDDEN ROW MUST LOOK THE SAME FROM OUTSIDE. Telling
  // a caller "no such business" for one id and "not authorised" for another is
  // an enumeration oracle: it confirms which ids exist.
  if (row === undefined) {
    authorise(actor, 'business.read', { type: 'business', id: business_id });
    throw new NotFoundAsRefusal();
  }
  authorise(actor, 'business.read', { type: 'business', id: row.id });
  return row;
}

/** Thrown where the row is absent. Rendered identically to a refusal. */
export class NotFoundAsRefusal extends Error {
  readonly code = 'E_NOT_AUTHORISED';
  constructor() { super('not authorised'); this.name = 'NotFoundAsRefusal'; }
}

export type EngagementView = {
  state: 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED';
  signed_at: string | null;
};

export function engagement(db: Db, actor: Actor, business_id: string): EngagementView | null {
  const b = readBusiness(db, actor, business_id);
  const row = getEngagementsIdLetterStateByBusinessId3<{ id: string; letter_state: string; signed_at: string | null }>(db, [b.id]);
  if (row === undefined) return null;
  authorise(actor, 'engagement.read', { type: 'engagement', id: row.id, business_id: b.id });
  return { state: row.letter_state as EngagementView['state'], signed_at: row.signed_at };
}

/** Named so on the claims' door, beside the core's NotFoundAsRefusal that engaged.ts names there. */
export { NotFoundAsRefusal as ClientNotFoundAsRefusal };
