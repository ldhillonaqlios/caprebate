/**
 * THE LEADS THE WEBSITE OPENS (Phase 161l1, carved from src/modules/crm/leads.ts unchanged): the funnel's lead, the
 * gated exit's lead, and the booking tied to its lead. Written by the assessment inside its own transactions; the CRM's
 * lead screens are above it.
 */
import type { Db } from '../../core/index.ts';
import { insertLeads, insertLeads4, updateLeadsBookingIdUpdatedAtByBusinessIdBookingId } from './data.ts';

/**
 * THE FUNNEL'S LEAD — written inside `submit()`'s transaction. A lead, NEW,
 * from the website, carrying the organisation and the assessment the submission
 * just created. No claim: that waits for the enquiry gate.
 */
export function openLeadForSubmission(
  db: Db, newId: () => string, v: { business_id: string; assessment_id: string; at: string },
): string {
  const id = newId();
  insertLeads(db, [id, v.business_id, v.assessment_id, v.at, v.at, v.at]);
  return id;
}

/**
 * THE GATED EXIT'S LEAD — the gated-exit repair.
 *
 * A prospect stopped at Q1b who asks for a call. NEW, from the website, origin
 * GATED_EXIT, and with NO ORGANISATION: they reached the reasoned negative before
 * the property question, so there is no sector to give one, and inventing one
 * would put a fact in the record nobody gave us. The table's CHECK asks for the
 * organisation's name instead — the business name the prospect typed, or
 * "Unnamed business", exactly as `submit()` names an organisation nobody named.
 *
 * THE PERSON AND THE CHANNEL ARE NOT HERE (row E21). They are a contact and a
 * booking that BELONG TO THIS LEAD until it is linked to an organisation (row
 * E22, migration 011), and `convertLead` moves them — the same rows — when it is.
 */
export function openLeadForGatedExit(
  db: Db, newId: () => string, v: { prospect_organisation: string; at: string },
): string {
  const id = newId();
  insertLeads4(db, [id, v.prospect_organisation, v.at, v.at, v.at]);
  return id;
}

/** The funnel close's booking, tied to the lead it belongs to. */
export function linkBookingToLead(db: Db, business_id: string, booking_id: string, at: string): void {
  updateLeadsBookingIdUpdatedAtByBusinessIdBookingId(db, [booking_id, at, business_id]);
}
