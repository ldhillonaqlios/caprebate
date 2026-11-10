/**
 * THE WEBSITE'S ENQUIRIES, AS SALES WORKS THEM: the list waiting, opening one as a lead, closing one.
 *
 * Moved here from src/modules/public-site/enquiries.ts (Phase 161l2), which keeps the form that takes an enquiry in:
 * the list is drawn by the CRM's leads page (src/modules/crm/pipeline-pages.ts) and Home (src/modules/crm/home.ts),
 * and the CRM sits below the public site. The table, website_enquiries, is the client record's (src/modules/clients/
 * data.ts): an enquiry opened as a lead becomes one, and the lead keeps the enquiry's id. Nothing here changed but
 * where it lives.
 *
 * AN ENQUIRY IS NOT A LEAD UNTIL SOMEBODY OPENS IT AS ONE. "Open as a lead" writes the lead through `createLead` —
 * the same intake a member of staff uses by hand, so the same authorisation, audit and first follow-up apply — and a
 * contact on that lead holding the person's name and how to reach them. "Close" records that nothing more is needed.
 *
 * NOTHING PERSONAL IN THE AUDIT. The lines carry the enquiry's id, the sector code and the decision; the row is the
 * record of what the person wrote.
 */
import { authorise, type Actor } from '../../core/index.ts';
import type { CrmDeps } from './crm.ts';
import { createLead } from './leads.ts';
import { getWebsiteEnquiriesCountByStatus, getWebsiteEnquiriesIdCreatedAtById, insertContacts3, listWebsiteEnquiriesIdCreatedAtByStatus, updateWebsiteEnquiriesStatusHandledByByIdStatus, updateWebsiteEnquiriesStatusLeadIdById } from '../clients/index.ts';

/** The site's property types, as the form offers them, and the sector each is in the leads' own list. */
export const PROPERTY_TYPES: Readonly<Record<string, string | null>> = Object.freeze({
  'Care home': 'care_homes',
  'Dental practice': 'dental',
  'GP / primary care': 'gp',
  'Private hospital / clinic': 'private_hospital',
  'Supported living': 'supported_living',
  'Other healthcare property': null,
});

export type EnquiryRow = {
  id: string; created_at: string; full_name: string; firm: string | null; email: string; phone: string | null;
  property_type: string; message: string | null; status: 'NEW' | 'LEAD' | 'CLOSED'; lead_id: string | null;
};

/** THE SECTION IS SALES' — the people who work leads. It holds names and addresses, so read-only logins do not see it. */
function mayHandle(actor: Actor): void {
  authorise(actor, 'lead.write', { type: 'lead', id: '__website_enquiries__', business_id: null });
}

export function openEnquiries(d: CrmDeps, actor: Actor): EnquiryRow[] {
  mayHandle(actor);
  return listWebsiteEnquiriesIdCreatedAtByStatus<EnquiryRow>(d.db);
}

export function openEnquiryCount(d: CrmDeps, actor: Actor): number {
  mayHandle(actor);
  return getWebsiteEnquiriesCountByStatus<{ n: number }>(d.db)?.n ?? 0;
}

/** Open an enquiry as a lead, with a contact holding the person. Refused once it has been handled. */
export function enquiryToLead(d: CrmDeps, actor: Actor, id: string): { ok: true; lead_id: string } | { ok: false; why: string } {
  mayHandle(actor);
  const e = getWebsiteEnquiriesIdCreatedAtById<EnquiryRow>(d.db, [id]);
  if (e === undefined || e.status !== 'NEW') return { ok: false, why: 'That enquiry has already been dealt with.' };
  const made = createLead(d, actor, {
    business_id: null,
    prospect_organisation: e.firm ?? e.full_name,
    prospect_sector: PROPERTY_TYPES[e.property_type] ?? null,
    source: 'WEBSITE',
    next_action: 'Reply to the website enquiry',
  });
  if (!made.ok) return { ok: false, why: made.why };
  const at = d.now();
  d.db.tx(() => {
    insertContacts3(d.db, [d.newId(), made.id, e.full_name, e.email, e.phone, at]);
    updateWebsiteEnquiriesStatusLeadIdById(d.db, [made.id, actor.id, at, id]);
  });
  d.audit.append({
    at, kind: 'WEBSITE_ENQUIRY_HANDLED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'website_enquiry', object_id: id, detail: { decision: 'LEAD', lead: made.id },
  });
  return { ok: true, lead_id: made.id };
}

export function closeEnquiry(d: CrmDeps, actor: Actor, id: string): { ok: true } | { ok: false; why: string } {
  mayHandle(actor);
  const at = d.now();
  const r = updateWebsiteEnquiriesStatusHandledByByIdStatus(d.db, [actor.id, at, id]);
  if (r.changes === 0) return { ok: false, why: 'That enquiry has already been dealt with.' };
  d.audit.append({
    at, kind: 'WEBSITE_ENQUIRY_HANDLED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'website_enquiry', object_id: id, detail: { decision: 'CLOSED' },
  });
  return { ok: true };
}
