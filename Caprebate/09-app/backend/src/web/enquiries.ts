/**
 * THE WEBSITE'S ENQUIRY FORM — PHASE 133j, 18 September 2026.
 *
 * The public website's "Request my estimate" form posts to `/enquiry`. Before this phase it posted nowhere: the page
 * said thank you and nothing was kept. Now the form is received here, every field is checked on the server whatever
 * the page's script already checked, and the enquiry waits in `website_enquiries` (migration 031) for Sales.
 *
 * AN ENQUIRY IS NOT A LEAD UNTIL SOMEBODY OPENS IT AS ONE. "Open as a lead" writes the lead through `createLead` —
 * the same intake a member of staff uses by hand, so the same authorisation, audit and first follow-up apply — and a
 * contact on that lead holding the person's name and how to reach them. "Close" records that nothing more is needed.
 *
 * NOTHING PERSONAL IN THE AUDIT. The lines carry the enquiry's id, the sector code and the decision; the row is the
 * record of what the person wrote.
 */

import type { Deps } from '../auth.ts';
import { rateLimit } from '../auth.ts';
import { authorise, type Actor } from '../authz.ts';
import { hashToken } from '../users.ts';
import type { CrmDeps } from './crm.ts';
import { createLead } from './leads.ts';

/** The site's property types, as the form offers them, and the sector each is in the leads' own list. */
export const PROPERTY_TYPES: Readonly<Record<string, string | null>> = Object.freeze({
  'Care home': 'care_homes',
  'Dental practice': 'dental',
  'GP / primary care': 'gp',
  'Private hospital / clinic': 'private_hospital',
  'Supported living': 'supported_living',
  'Other healthcare property': null,
});

/** Per address, per rate window. Generous for a person, useless for a script. */
export const ENQUIRY_LIMIT = 5;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type EnquiryRow = {
  id: string; created_at: string; full_name: string; firm: string | null; email: string; phone: string | null;
  property_type: string; message: string | null; status: 'NEW' | 'LEAD' | 'CLOSED'; lead_id: string | null;
};

type Received = { ok: true; id: string } | { ok: false; why: string };

function text(f: URLSearchParams, name: string, max: number): string | null | undefined {
  const v = (f.get(name) ?? '').trim();
  if (v === '') return null;
  return v.length > max ? undefined : v;
}

/** Receive the form. No actor: a visitor has no account. */
export function receiveEnquiry(auth: Deps, newId: () => string, f: URLSearchParams): Received {
  const name = text(f, 'name', 200);
  const firm = text(f, 'firm', 300);
  const email = text(f, 'email', 254);
  const phone = text(f, 'phone', 40);
  const message = text(f, 'message', 2000);
  const ptype = (f.get('ptype') ?? '').trim();
  if (name === null || name === undefined) return { ok: false, why: 'We need your name.' };
  if (email === null || email === undefined || !EMAIL.test(email)) return { ok: false, why: 'We need an email address we can reply to.' };
  if (!Object.prototype.hasOwnProperty.call(PROPERTY_TYPES, ptype)) return { ok: false, why: 'Choose the type of property.' };
  if (firm === undefined || phone === undefined || message === undefined) return { ok: false, why: 'One of the answers is longer than the form allows.' };
  if (f.get('consent') !== 'on') return { ok: false, why: 'We need your permission to contact you about this enquiry. It is not marketing consent.' };
  if (!rateLimit(auth, 'enquiry:' + hashToken(email.toLowerCase()), ENQUIRY_LIMIT)) {
    auth.audit.append({ at: auth.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'website_enquiry' } });
    return { ok: false, why: 'We have already received several enquiries from this address. We will be in touch.' };
  }
  const id = newId();
  const at = auth.now();
  auth.db.run(
    'INSERT INTO website_enquiries (id, created_at, full_name, firm, email, phone, property_type, message, contact_consent, status) ' +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'NEW')",
    [id, at, name, firm, email, phone, ptype, message],
  );
  auth.audit.append({
    at, kind: 'WEBSITE_ENQUIRY_RECEIVED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
    object_type: 'website_enquiry', object_id: id, detail: { sector: PROPERTY_TYPES[ptype] ?? null },
  });
  return { ok: true, id };
}

/** THE SECTION IS SALES' — the people who work leads. It holds names and addresses, so read-only logins do not see it. */
function mayHandle(actor: Actor): void {
  authorise(actor, 'lead.write', { type: 'lead', id: '__website_enquiries__', business_id: null });
}

export function openEnquiries(d: CrmDeps, actor: Actor): EnquiryRow[] {
  mayHandle(actor);
  return d.db.all<EnquiryRow>(
    'SELECT id, created_at, full_name, firm, email, phone, property_type, message, status, lead_id FROM website_enquiries ' +
      "WHERE status = 'NEW' ORDER BY created_at DESC",
  );
}

export function openEnquiryCount(d: CrmDeps, actor: Actor): number {
  mayHandle(actor);
  return d.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM website_enquiries WHERE status = 'NEW'")?.n ?? 0;
}

/** Open an enquiry as a lead, with a contact holding the person. Refused once it has been handled. */
export function enquiryToLead(d: CrmDeps, actor: Actor, id: string): { ok: true; lead_id: string } | { ok: false; why: string } {
  mayHandle(actor);
  const e = d.db.get<EnquiryRow>(
    'SELECT id, created_at, full_name, firm, email, phone, property_type, message, status, lead_id FROM website_enquiries WHERE id = ?', [id]);
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
    d.db.run(
      'INSERT INTO contacts (id, business_id, lead_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, email, phone, created_at) ' +
        'VALUES (?, NULL, ?, ?, NULL, NULL, 1, 0, ?, ?, ?)',
      [d.newId(), made.id, e.full_name, e.email, e.phone, at],
    );
    d.db.run("UPDATE website_enquiries SET status = 'LEAD', lead_id = ?, handled_by = ?, handled_at = ? WHERE id = ?",
      [made.id, actor.id, at, id]);
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
  const r = d.db.run("UPDATE website_enquiries SET status = 'CLOSED', handled_by = ?, handled_at = ? WHERE id = ? AND status = 'NEW'",
    [actor.id, at, id]);
  if (r.changes === 0) return { ok: false, why: 'That enquiry has already been dealt with.' };
  d.audit.append({
    at, kind: 'WEBSITE_ENQUIRY_HANDLED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'website_enquiry', object_id: id, detail: { decision: 'CLOSED' },
  });
  return { ok: true };
}
