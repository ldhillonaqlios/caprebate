/**
 * FREE-TYPED EMAIL TO A CLIENT, FROM contact@caprebate.co.uk — THE STORE. Phase 141, 21 September 2026.
 * "Back office and portal clean-up, 8 of 11."
 *
 * Lakhbir, 18 September 2026: "When on a client page there needs to be the ability to free-type emails, which should
 * come from contact@caprebate.co.uk."
 *
 * The pages are src/web/free-email-pages.ts. The sending switch and the mail adapter are src/stubs/email-provider.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT THIS HOLDS, AND IT IS ASKED ON THE SERVER EVERY TIME
 *
 *   TO IS FILLED IN WITH THE COMPANY'S MAIN CONTACT, AND STAFF MAY TYPE OVER IT (1 October 2026 — Lakhbir: "the To:
 *   field needs to be auto populated with the emails address, however it needs to allow users to overide the email if
 *   needed"; until then it was a list of contacts only). An address that is one of the company's contacts is recorded as
 *   that contact; any other is recorded with no contact, and a reply from it waits under "Email replies to sort" (the
 *   mailbox reader files only replies from the company's contacts). A lead's own contact who did not agree to be
 *   contacted cannot be written to, typed or not. A do-not-contact address is refused, as always.
 *   A REPLY JOINS ITS CHAIN (src/web/email-chains.ts): `thread` names one of this company's chains; the email carries the
 *   chain's key and the Message-IDs it answers.
 *   THE SUBJECT AND THE BODY ARE TYPED FREELY. A template is only a place to start: it fills the two boxes and staff
 *   edit them. The same refusals as a template: no bank details, no invoice, nothing that tips somebody off.
 *   A CLAIM, IF ONE IS PICKED, IS ONE OF THE COMPANY'S OWN — asked here, and held again by a trigger (migration 036).
 *   A FILE, IF ONE IS ATTACHED, IS ONE OF THE COMPANY'S FILES THE CLIENT MAY ALREADY SEE, WHOSE ORIGINAL IS STILL KEPT.
 *   Sending a file is showing it, so a file staff have not let the client see cannot be sent; and a file whose original
 *   was deleted once read has nothing to send. With KEEP_ORIGINALS off, which it is, no file can be attached, and the
 *   page says so.
 *   "DO NOT CONTACT" IS REFUSED, as it always has been — by this store before anything is written, by the transport, and
 *   by the outbox's trigger.
 *   FROM AND REPLY-TO are the one sender setting (src/stubs/email.ts `currentSender`), stamped on every row.
 *   EVERY EMAIL IS ON THE COMPANY'S TIMELINE (src/web/timeline.ts reads the outbox), tagged to the claim if one was
 *   picked; a lead's is on the lead's.
 *
 * WHO: `email.queue` — Admin and Sales. The view-only login, Accounting, the surveyor and the client are refused.
 * The audit line names ids only — never the subject, the body or an address.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { currentSender, outboxTransport, type Sender } from '../stubs/email.ts';
import { EMAIL_SENDING, sendingMissing, sendingOn, type EmailSending, type MailWhere, type SmtpLogin } from '../stubs/email-provider.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import * as C from './crm.ts';
import * as D from './documents.ts';
import { assertLeadSection } from './leads.ts';
import { activeTemplates, freeTextRefusal, mergePlain, mergeValues, templateRefusal } from './templates.ts';
import { propertyIn } from './components.ts';
import { localStamp } from './localtime.ts';
import { KEEP_ORIGINALS } from './originals.ts';
import { emailChains, reSubject, STATE_WORDS, type EmailChain } from './email-chains.ts';

export type EmailDeps = {
  db: Db; audit: AuditLog; now: () => string; newId: () => string;
  /** The sending switch and the provider's login. Tests pass their own; the application passes EMAIL_SENDING. */
  sending?: EmailSending; login?: SmtpLogin | null;
  /** 2 Oct 2026: where the app runs (src/connectors/place.ts). The application passes it; absent, not asked. */
  where?: MailWhere;
};

export type EmailSubject = { readonly kind: 'company'; readonly id: string } | { readonly kind: 'lead'; readonly id: string };

export type ContactChoice = { readonly id: string; readonly name: string; readonly email: string };

export type EmailForm = {
  readonly subject: EmailSubject;
  /** The company's name — or, for a lead with no company record yet, the name it was recorded under. */
  readonly company: string;
  readonly business_id: string | null;
  readonly back: string;
  readonly action: string;
  readonly sender: Sender;
  readonly sending: { readonly on: boolean; readonly missing: readonly string[] };
  readonly do_not_contact: boolean;
  readonly contacts: readonly ContactChoice[];
  /** Contacts who cannot be emailed yet, and why — so nobody wonders where they went. */
  readonly not_offered: readonly { readonly name: string; readonly why: string }[];
  readonly claims: readonly { readonly id: string; readonly name: string; readonly ref: string }[];
  readonly templates: readonly { readonly id: string; readonly label: string }[];
  readonly attachable: readonly { readonly id: string; readonly name: string }[];
  /** Why nothing can be attached, where nothing can. */
  readonly attach_words: string | null;
  readonly sent: readonly SentRow[];
  /** 1 Oct 2026: every chain of emails with them, newest first; and the one being replied to, if any. */
  readonly chains: readonly EmailChain[];
  readonly replying: EmailChain | null;
  readonly prefill: {
    readonly contact_id: string; readonly claim_id: string; readonly subject: string; readonly body: string; readonly template_id: string;
    /** The address in the To box: the chain's, the contact asked for, or the main contact's. */
    readonly to: string;
  };
};

export type SentRow = {
  readonly when: string; readonly to: string; readonly subject: string; readonly state: string; readonly about: string | null;
  readonly files: number;
};

export const MAX_ATTACHMENTS = 5;

const DNC_WHY = 'This company asked us not to contact them. Nothing was saved.';

type Base = {
  company: string; business_id: string | null; lead_id: string | null;
  claims: { id: string; name: string; ref: string }[];
  contacts: ContactChoice[]; not_offered: { name: string; why: string }[];
  do_not_contact: boolean; back: string; action: string;
  attachable: { id: string; name: string; document_id: string }[]; attach_words: string | null;
  /** Addresses that may not be written to even when typed: a lead's contact who did not agree to be contacted. */
  barred: string[];
  /** The address the company gave us as its own, if any — the main contact's, when it is one of theirs. */
  main_email: string | null;
};

function claimsOf(org: C.OrganisationView): Base['claims'] {
  return org.claims.map((c) => ({ id: c.id, name: propertyIn(org.trading_name, c.property) ?? c.property ?? 'Claim', ref: c.claim_ref }));
}

/** THE COMPANY'S CONTACTS, each asked of `contact.read` by the store that reads them. */
function companyContacts(db: Db, actor: Actor, business_id: string): { contacts: ContactChoice[]; not_offered: Base['not_offered'] } {
  const contacts: ContactChoice[] = [];
  const not_offered: Base['not_offered'] = [];
  for (const c of C.contactsFor(db, actor, business_id)) {
    const email = (c.email ?? '').trim();
    if (email === '') not_offered.push({ name: c.full_name, why: 'no email address recorded — add it on their contact' });
    else contacts.push({ id: c.id, name: c.full_name, email });
  }
  return { contacts, not_offered };
}

/** FILES THAT CAN BE SENT: the client may see them, and the original is still kept. */
function attachableFiles(d: { db: Db; now: () => string }, actor: Actor, org: C.OrganisationView): { list: Base['attachable']; words: string | null } {
  const folder = D.clientFolder({ db: d.db, now: d.now }, actor, org);
  const list: Base['attachable'] = [];
  for (const f of folder.files) {
    if (!f.original.kept || !f.shown_to_client) continue;
    const version = D.keptVersionOf(d.db, f.id, d.now());
    if (version !== null) list.push({ id: f.id, name: f.name, document_id: version });
  }
  if (list.length > 0) return { list, words: null };
  if (!KEEP_ORIGINALS.enabled && !folder.files.some((f) => f.original.kept)) {
    return { list, words: 'You cannot attach a file yet. We delete each file once we have read it.' };
  }
  return { list, words: 'No file can be sent. Only a file the client can already see can be attached — let them see it in Files first.' };
}

function companyBase(d: EmailDeps, actor: Actor, business_id: string): Base {
  const org = C.organisationView(d.db, actor, business_id);
  authorise(actor, 'email.queue', { type: 'email', id: org.id, business_id: org.id });
  const people = companyContacts(d.db, actor, org.id);
  const files = attachableFiles(d, actor, org);
  const main = d.db.get<{ e: string | null }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [org.id])?.e ?? null;
  return {
    company: org.trading_name, business_id: org.id, lead_id: null, claims: claimsOf(org), ...people, barred: [],
    main_email: main === null || main.trim() === '' ? null : main.trim(),
    do_not_contact: org.client_status.do_not_contact,
    back: `/staff/clients/${org.id}`, action: `/staff/clients/${org.id}/email`,
    attachable: files.list, attach_words: files.words,
  };
}

function leadBase(d: EmailDeps, actor: Actor, lead_id: string): Base {
  assertLeadSection(actor);
  const l = d.db.get<{ id: string; business_id: string | null; organisation_name: string | null }>(
    'SELECT l.id, l.business_id, b.name AS organisation_name FROM leads l LEFT JOIN businesses b ON b.id = l.business_id WHERE l.id = ?',
    [lead_id]);
  if (l === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'lead.read', { type: 'lead', id: l.id, business_id: l.business_id });
  authorise(actor, 'email.queue', { type: 'email', id: l.id, business_id: l.business_id ?? '' });
  const back = `/staff/leads#lead-${l.id}`;
  const action = `/staff/leads/${l.id}/email`;
  if (l.business_id !== null) {
    const b = companyBase(d, actor, l.business_id);
    return { ...b, lead_id: l.id, back, action };
  }
  // A lead with no company record yet: the person who asked is the lead's own contact (migration 011).
  const contacts: ContactChoice[] = [];
  const not_offered: Base['not_offered'] = [];
  const barred: string[] = [];
  const rows = d.db.all<{ id: string; full_name: string; email: string | null; contact_consent: number }>(
    'SELECT id, full_name, email, contact_consent FROM contacts WHERE lead_id = ? AND business_id IS NULL ORDER BY full_name ASC, id ASC', [l.id]);
  for (const c of rows) {
    if (!can(actor, 'contact.read', { type: 'contact', id: c.id, business_id: null })) continue;
    const email = (c.email ?? '').trim();
    if (c.contact_consent !== 1) {
      not_offered.push({ name: c.full_name, why: 'they did not agree to be contacted' });
      if (email !== '') barred.push(email.toLowerCase());
    }
    else if (email === '') not_offered.push({ name: c.full_name, why: 'no email address recorded' });
    else contacts.push({ id: c.id, name: c.full_name, email });
  }
  const dnc = contacts.some((c) => isDoNotContactAddress(d.db, c.email));
  return {
    company: l.organisation_name ?? rows[0]?.full_name ?? 'This lead', business_id: null, lead_id: l.id, claims: [],
    contacts, not_offered, barred, main_email: null, do_not_contact: dnc, back, action,
    attachable: [], attach_words: 'A lead has no files yet. You can attach files once they are a client.',
  };
}

function isDoNotContactAddress(db: Db, email: string): boolean {
  return (db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM contacts c JOIN businesses b ON b.id = c.business_id WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(?)",
    [email])?.n ?? 0) > 0;
}

function baseFor(d: EmailDeps, actor: Actor, s: EmailSubject): Base {
  return s.kind === 'company' ? companyBase(d, actor, s.id) : leadBase(d, actor, s.id);
}


function sentRows(db: Db, b: Base): SentRow[] {
  type Row = { created_at: string; to_email: string; subject: string; sent_at: string | null; send_requested: number; last_error: string | null; claim_id: string | null; id: string };
  const rows = b.business_id !== null
    ? db.all<Row>("SELECT id, created_at, to_email, subject, sent_at, send_requested, last_error, claim_id FROM outbox WHERE business_id = ? AND kind IN ('FREE_TYPED','TEMPLATE') ORDER BY created_at DESC LIMIT 20", [b.business_id])
    : db.all<Row>("SELECT id, created_at, to_email, subject, sent_at, send_requested, last_error, claim_id FROM outbox WHERE lead_id = ? AND kind IN ('FREE_TYPED','TEMPLATE') ORDER BY created_at DESC LIMIT 20", [b.lead_id]);
  return rows.map((r) => {
    const claim = r.claim_id === null ? undefined : b.claims.find((c) => c.id === r.claim_id);
    const files = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox_attachments WHERE outbox_id = ?', [r.id])?.n ?? 0;
    return {
      when: localStamp(r.created_at), to: r.to_email, subject: r.subject,
      state: STATE_WORDS(r.sent_at, r.send_requested, r.last_error),
      about: claim === undefined ? null : `${claim.name} (${claim.ref})`, files,
    };
  });
}

/**
 * THE EMAIL FORM, for one company or one lead. `ask` carries what the page was opened with: a claim to tag, and a
 * template and contact to start from. Each is used only where it is one this form offers.
 */
export function emailForm(d: EmailDeps, actor: Actor, s: EmailSubject, ask: Readonly<Record<string, string | null>> = {}): EmailForm {
  const b = baseFor(d, actor, s);
  const cfg = d.sending ?? EMAIL_SENDING;
  const login = d.login ?? null;
  const templates = activeTemplates(d.db, actor);
  const chains = emailChains(d.db, actor, { business_id: b.business_id, lead_id: b.lead_id }, d.now());
  const replying = chains.find((c) => c.key === ask['thread']) ?? null;
  const asked = ask['claim'] ?? (replying?.claim_id ?? null);
  const claim_id = b.claims.some((c) => c.id === asked) ? (asked ?? '') : '';
  const contact_id = b.contacts.some((c) => c.id === ask['contact']) ? (ask['contact'] ?? '') : (b.contacts.length === 1 ? (b.contacts[0]?.id ?? '') : '');
  // The To box: a chain's correspondent; the contact asked for; the company's main address where it is a contact's;
  // else the first contact. What was typed before a refusal wins over all of them.
  const main = b.contacts.find((c) => c.email.toLowerCase() === (b.main_email ?? '').toLowerCase());
  const to = ask['to'] ?? replying?.reply_to ?? b.contacts.find((c) => c.id === contact_id)?.email ?? main?.email ?? b.contacts[0]?.email ?? b.main_email ?? '';
  let subject = replying === null ? '' : reSubject(replying.subject), body = '', template_id = '';
  const t = templates.find((x) => x.id === ask['template']);
  if (t !== undefined) {
    const row = d.db.get<{ label: string; subject: string; body: string }>('SELECT label, subject, body FROM email_templates WHERE id = ? AND active = 1', [t.id]);
    if (row !== undefined && templateRefusal(row) === null) {
      const v = claim_id !== '' ? mergeValues(d.db, claim_id, contact_id === '' ? null : contact_id)
        : {
          contact_name: b.contacts.find((c) => c.id === contact_id)?.name ?? null, organisation: b.company,
          property_address: null, claim_reference: null, next_action: null, due_date: null,
        };
      subject = mergePlain(row.subject, v, true);
      body = mergePlain(row.body, v, false);
      template_id = t.id;
    }
  }
  return {
    subject: s, company: b.company, business_id: b.business_id, back: b.back, action: b.action,
    sender: currentSender(d.db),
    sending: { on: sendingOn(cfg, login, d.where), missing: sendingMissing(cfg, login, d.where) },
    do_not_contact: b.do_not_contact, contacts: b.contacts, not_offered: b.not_offered, claims: b.claims, templates,
    attachable: b.attachable.map((a) => ({ id: a.id, name: a.name })), attach_words: b.attach_words,
    sent: sentRows(d.db, b), chains, replying,
    prefill: { contact_id, claim_id, subject, body, template_id, to },
  };
}

export type SaveResult =
  | { readonly ok: true; readonly id: string; readonly requested: boolean; readonly back: string; readonly action: string; readonly chain: string }
  | { readonly ok: false; readonly why: string; readonly field?: string };

/**
 * SAVE A FREE-TYPED EMAIL — to the outbox, from the one sender, and sent only if sending is on. `attach` is the ids of
 * the company's files to carry. Everything is asked again here, whatever the form offered.
 */
export function saveEmail(d: EmailDeps, actor: Actor, s: EmailSubject, input: Readonly<Record<string, string | null>>, attach: readonly string[]): SaveResult {
  const b = baseFor(d, actor, s);
  if (b.do_not_contact) return { ok: false, why: DNC_WHY };
  // TO: what was typed in the To box; or, from a caller with no box, one of the contacts by id.
  const typed = (input['to_email'] ?? '').trim();
  let contact: ContactChoice | undefined;
  let to: string;
  if (typed !== '') {
    if (!ADDRESS.test(typed) || typed.length > 254) return { ok: false, why: 'That is not an email address. Check the To box.', field: 'to_email' };
    if (b.barred.includes(typed.toLowerCase())) return { ok: false, why: 'They did not agree to be contacted, so we cannot email them.', field: 'to_email' };
    contact = b.contacts.find((c) => c.email.toLowerCase() === typed.toLowerCase());
    to = contact?.email ?? typed;
  } else {
    contact = b.contacts.find((c) => c.id === (input['contact_id'] ?? '').trim());
    if (contact === undefined) return { ok: false, why: 'Say who it is to: type an email address in the To box.', field: 'to_email' };
    to = contact.email;
  }
  // A REPLY: one of this company's own chains, whatever the form said.
  const thread = (input['thread'] ?? '').trim();
  const chain = thread === '' ? null : emailChains(d.db, actor, { business_id: b.business_id, lead_id: b.lead_id }, d.now()).find((c) => c.key === thread) ?? null;
  if (thread !== '' && chain === null) return { ok: false, why: 'That conversation is not one of this company’s. Start a new email instead.', field: 'thread' };
  const claim = (input['claim_id'] ?? '').trim();
  if (claim !== '' && !b.claims.some((c) => c.id === claim)) return { ok: false, why: 'Choose one of this company’s claims.', field: 'claim_id' };
  const subject = (input['subject'] ?? '').replace(/[\r\n]+/g, ' ').trim();
  const body = (input['body'] ?? '').replace(/\r\n/g, '\n').trim();
  if (subject === '') return { ok: false, why: 'Write a subject.', field: 'subject' };
  if (body === '') return { ok: false, why: 'Write the email.', field: 'body' };
  if (subject.length > 300) return { ok: false, why: 'Keep the subject under 300 characters.', field: 'subject' };
  if (body.length > 20000) return { ok: false, why: 'That email is too long. Keep it under 20,000 characters.', field: 'body' };
  const refusal = freeTextRefusal(subject, body);
  if (refusal !== null) return { ok: false, why: refusal, field: 'body' };
  const wanted = [...new Set(attach.map((x) => x.trim()).filter((x) => x !== ''))];
  if (wanted.length > MAX_ATTACHMENTS) return { ok: false, why: `Attach ${MAX_ATTACHMENTS} files at most.`, field: 'attach' };
  const files = wanted.map((id) => b.attachable.find((a) => a.id === id));
  if (files.some((f) => f === undefined)) return { ok: false, why: 'Choose files from this company’s Files that the client can see.', field: 'attach' };

  const cfg = d.sending ?? EMAIL_SENDING;
  const on = sendingOn(cfg, d.login ?? null, d.where);
  const out = outboxTransport(d.db, d.newId, d.now, () => on).send({
    to_email: to, subject, body, kind: 'FREE_TYPED', business_id: b.business_id,
    claim_id: claim === '' ? null : claim, lead_id: b.lead_id, contact_id: contact?.id ?? null, written_by: actor.id,
    thread_key: chain?.key ?? null, in_reply_to: chain?.in_reply_to ?? null, references: chain?.references ?? [],
    attachments: files.flatMap((f) => (f === undefined ? [] : [{ logical_document_id: f.id, document_id: f.document_id }])),
  });
  if (out.id === null) return { ok: false, why: DNC_WHY };
  d.audit.append({
    at: d.now(), kind: 'EMAIL_WRITTEN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'outbox', object_id: out.id,
    detail: {
      business: b.business_id, lead: b.lead_id, claim: claim === '' ? null : claim, contact: contact?.id ?? null,
      to_contact: contact !== undefined, reply: chain !== null, files: files.length, send_requested: on,
    },
  });
  return { ok: true, id: out.id, requested: on, back: b.back, action: b.action, chain: chain?.key ?? out.id };
}

/* ================================================================== *
 * THE ONE SENDER SETTING — Admin, on the admin settings screen
 * ================================================================== */

const ADDRESS = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/;

export function senderSetting(db: Db, actor: Actor): { sender: Sender; may_write: boolean } {
  authorise(actor, 'configuration.read', { type: 'configuration', id: 'settings' });
  return { sender: currentSender(db), may_write: can(actor, 'configuration.write', { type: 'configuration', id: 'settings' }) };
}

/** CHANGE WHO EMAILS COME FROM. A new row; the old one stays, as the record of what earlier emails were sent under. */
export function setSender(d: EmailDeps, actor: Actor, input: Readonly<Record<string, string | null>>): { ok: true } | { ok: false; why: string; field?: string } {
  authorise(actor, 'configuration.write', { type: 'configuration', id: 'settings' });
  const name = (input['display_name'] ?? '').replace(/[\r\n<>"]+/g, ' ').trim();
  const address = (input['address'] ?? '').trim().toLowerCase();
  const reply = ((input['reply_to'] ?? '').trim() || address).toLowerCase();
  if (name === '' || name.length > 80) return { ok: false, why: 'Give the name people see, up to 80 characters.', field: 'display_name' };
  if (!ADDRESS.test(address) || address.length > 254) return { ok: false, why: 'That is not an email address.', field: 'address' };
  if (!ADDRESS.test(reply) || reply.length > 254) return { ok: false, why: 'The reply address is not an email address.', field: 'reply_to' };
  const now = currentSender(d.db);
  if (now.display_name === name && now.address === address && now.reply_to === reply) return { ok: true };
  const id = d.newId();
  d.db.run('INSERT INTO email_sender (id, display_name, address, reply_to, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, address, reply, actor.id, d.now()]);
  d.audit.append({
    at: d.now(), kind: 'EMAIL_SENDER_SET', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'configuration', object_id: 'email_sender', detail: { row: id },
  });
  return { ok: true };
}
