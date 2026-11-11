/**
 * THE WEBSITE'S ENQUIRY FORM.
 *
 * The public website's "Request my estimate" form posts to `/enquiry`. Before this phase it posted nowhere: the page
 * said thank you and nothing was kept. Now the form is received here, every field is checked on the server whatever
 * the page's script already checked, and the enquiry waits in `website_enquiries` (migration 031) for Sales.
 *
 * Since Phase 161l2 this file is the form alone; Sales' side of it (the list, "Open as a lead", "Close") is the CRM's,
 * src/modules/crm/enquiries.ts, and the table is the client record's.
 *
 * AN ENQUIRY IS NOT A LEAD UNTIL SOMEBODY OPENS IT AS ONE. "Open as a lead" writes the lead through `createLead` —
 * the same intake a member of staff uses by hand, so the same authorisation, audit and first follow-up apply — and a
 * contact on that lead holding the person's name and how to reach them. "Close" records that nothing more is needed.
 *
 * NOTHING PERSONAL IN THE AUDIT. The lines carry the enquiry's id, the sector code and the decision; the row is the
 * record of what the person wrote.
 */

import type { Deps } from '../../core/index.ts';
import { rateLimit } from '../../core/index.ts';
import { hashToken } from '../../core/index.ts';
// The property types and the inbox the enquiry waits in are the CRM's (src/modules/crm/enquiries.ts); the table is the
// client record's (website_enquiries, src/modules/clients/data.ts).
import { PROPERTY_TYPES } from '../crm/index.ts';
import { insertWebsiteEnquiries } from '../clients/index.ts';
import { listUsersIdEmailByRoleDisabledAt } from '../../core/index.ts';
import { brandedEmail, type EmailContent, type EmailTransport } from '../../integrations/index.ts';
import { localStamp } from '../../shared/index.ts';

/** Per address, per rate window. Generous for a person, useless for a script. */
export const ENQUIRY_LIMIT = 5;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Received = { ok: true; id: string } | { ok: false; why: string };

function text(f: URLSearchParams, name: string, max: number): string | null | undefined {
  const v = (f.get(name) ?? '').trim();
  if (v === '') return null;
  return v.length > max ? undefined : v;
}

/* THE TWO EMAILS AN ENQUIRY SENDS (emails.py, Phase 161m2). */

/** enquiry-received: to the person who sent it. The form asks for no property name, so it says "your property". */
export function enquiryReceivedEmail(fullName: string): EmailContent {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return {
    subject: 'Thank you for your enquiry',
    preheader: 'We have your details and will be in touch within one working day.',
    heading: first === '' ? 'Thank you' : `Thank you, ${first}`,
    blocks: [
      'We have your enquiry about your property. One of our team will read it and reply within one working day.',
      { kind: 'heading', text: 'What happens next' },
      { kind: 'bullets', items: [
        'We look at what you have told us about the property and when it was bought or built.',
        'We email you to arrange a short call at a time that suits you.',
        'On the call we explain what you could claim and how we work. There is no charge for this.',
      ] },
      'You do not need to send anything yet. If you would like to add something, just reply to this email.',
    ],
    sign: 'The Cap Rebate team',
  };
}

/**
 * staff-new-enquiry: to Sales. ONLY the organisation, the sector, when it came and a link to the back office: never the
 * person's name, address, telephone or message. The form asks for no postcode, so there is no area row.
 */
export function staffNewEnquiryEmail(e: { firm: string | null; sector: string; received_at: string; backOfficeLink: string }): EmailContent {
  return {
    subject: `New enquiry: ${e.firm ?? e.sector}`,
    preheader: `${e.sector}. Reply within one working day.`,
    heading: 'A new enquiry has come in',
    blocks: [
      { kind: 'facts', rows: [['Organisation', e.firm ?? 'Not given'], ['Sector', e.sector], ['Received', localStamp(e.received_at)]] },
      'We have told them we will reply within one working day. The details are in the back office: we never put a client\'s details in an email.',
    ],
    button: { label: 'Open the enquiry', href: e.backOfficeLink },
    sign: 'Cap Rebate back office',
    staff: true,
  };
}

/** Receive the form. No actor: a visitor has no account. */
/**
 * `check` is what the contact form's security check found (src/integrations/connectors/turnstile.ts), recorded on the audit line:
 * 'passed', or 'not_checked' with why. A failed check never reaches here: the router refuses it first.
 */
/**
 * `notify` (Phase 161m2): the outbox and the site's address. Given, a kept enquiry sends two emails: a thank you to the
 * person, and a note to each active Sales login. Both go through the outbox, so do not contact and the sending switch
 * apply as to every email. Absent (a caller that only stores), nothing is sent.
 */
export function receiveEnquiry(auth: Deps, newId: () => string, f: URLSearchParams, check: 'passed' | 'not_checked:no_secret' | 'not_checked:transfer_not_approved' = 'not_checked:no_secret',
  notify?: { readonly email: EmailTransport; readonly origin?: string | undefined }): Received {
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
  /* NO TICK. The form's required "you may contact me" box is
     replaced by a statement and a link to the privacy notice: a person who sends an enquiry has asked to be answered, and
     a tick box would misdescribe the basis as consent. `contact_consent` stays 1 — it records that the person asked to be
     contacted about this enquiry, by sending it — and is never marketing consent. */
  if (!rateLimit(auth, 'enquiry:' + hashToken(email.toLowerCase()), ENQUIRY_LIMIT)) {
    auth.audit.append({ at: auth.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'website_enquiry' } });
    return { ok: false, why: 'We have already received several enquiries from this address. We will be in touch.' };
  }
  const id = newId();
  const at = auth.now();
  insertWebsiteEnquiries(auth.db, [id, at, name, firm, email, phone, ptype, message]);
  auth.audit.append({
    at, kind: 'WEBSITE_ENQUIRY_RECEIVED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
    object_type: 'website_enquiry', object_id: id, detail: { sector: PROPERTY_TYPES[ptype] ?? null, security_check: check },
  });
  if (notify !== undefined) {
    const site = (notify.origin ?? process.env['CAPREBATE_PUBLIC_ORIGIN'] ?? 'http://localhost:8103').trim().replace(/\/+$/, '');
    const thanks = brandedEmail(enquiryReceivedEmail(name), { publicOrigin: site });
    notify.email.send({ to_email: email, kind: 'NOTIFICATION', subject: thanks.subject, body: thanks.text, html: thanks.html });
    const staff = brandedEmail(staffNewEnquiryEmail({ firm, sector: ptype, received_at: at, backOfficeLink: `${site}/staff/enquiries` }), { publicOrigin: site });
    for (const u of listUsersIdEmailByRoleDisabledAt<{ id: string; email: string }>(auth.db)) {
      notify.email.send({ to_email: u.email, kind: 'NOTIFICATION', subject: staff.subject, body: staff.text, html: staff.html });
    }
  }
  return { ok: true, id };
}
