/**
 * EMAIL TEMPLATES, MERGED INTO THE OUTBOX. CRM 3 of 10, 11 September 2026.
 *
 * The table is migration 012's `email_templates`; the pages are
 * src/web/tasks-pages.ts. ADMIN writes a template; ADMIN and SALES merge one for
 * a claim's contact and queue it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SIX MERGE FIELDS, AND NO OTHERS
 *
 *   {{contact_name}}      the contact chosen — the client's own contact, not a third party
 *   {{organisation}}      the organisation's name
 *   {{property_address}}  the claim's property's recorded address lines and postcode
 *   {{claim_reference}}   the claim's reference
 *   {{next_action}}       the claim's current next action
 *   {{due_date}}          that next action's due date
 *
 * A template naming anything else is refused by the store: a merge field nobody
 * fills in is a gap waiting to be sent.
 *
 * EVERY MERGED VALUE IS ESCAPED, and a subject line loses its line breaks. A
 * MISSING VALUE IS A VISIBLE GAP — "[property address not recorded]" — and never
 * an empty string, because "Dear ," is what a person sends when a gap is silent.
 * A claim with no property and a property with no address read identically: the
 * address was not recorded (N4).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE OUTBOX ONLY, AND NEVER BANK DETAILS OR AN INVOICE
 *
 * A merge is queued through `outboxTransport`, built here from the database and
 * not the application's transport, with the organisation named — so a
 * DO_NOT_CONTACT organisation is refused by the transport and by the outbox's
 * trigger. A template carrying bank details or an invoice is refused by this
 * store — by keyword, and by the shape of a sort code, an account number and an
 * IBAN — and by the table's own trigger. The invoice email waits on the
 * invoice-fraud procedure (Developer Spec §5.1 item 6).
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { outboxTransport } from '../stubs/email.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { escapeHtml } from './html.ts';
import { localStamp, ukDate } from './localtime.ts';
import { claimObjFor, type Fields } from './crm.ts';

export type TemplateDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export const MERGE_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  contact_name: 'contact name',
  organisation: 'organisation',
  property_address: 'property address',
  claim_reference: 'claim reference',
  next_action: 'next action',
  due_date: 'due date',
});

/** The visible gap for a value nobody recorded. Never an empty string. */
export function gapFor(field: string): string {
  return `[${MERGE_FIELDS[field] ?? field} not recorded]`;
}

const REFUSED: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/invoice/i, 'an invoice'],
  [/remittance/i, 'a remittance'],
  [/sort[\s-]*code/i, 'a sort code'],
  [/account\s*(number|no\b)/i, 'an account number'],
  [/\biban\b/i, 'an IBAN'],
  [/bank\s*(details?|account)/i, 'bank details'],
  [/\b\d{2}[\s-]\d{2}[\s-]\d{2}\b/, 'something shaped like a sort code'],
  [/\b\d{8}\b/, 'something shaped like an account number'],
  [/\b[A-Z]{2}\d{2}\s?[A-Z]{4}\s?\d{4}/i, 'something shaped like an IBAN'],
  // CRM 7 of 10: what an invoice email or a chasing email would carry under another word. Migration 016 widens the
  // table's trigger pair to the same words; the shapes above stay first, so a sort code is still named as one.
  [/remit/i, 'a remittance'],
  [/payment\s*details?/i, 'payment details'],
  [/bank\s*transfer/i, 'a bank transfer'],
  [/\bpay(?:ment)?\s+(?:to|into)\b/i, 'where to pay'],
  [/amount\s+(?:due|outstanding)/i, 'an amount due'],
  [/fee\s+note/i, 'a fee note'],
  [/statement\s+of\s+account/i, 'a statement of account'],
  // CRM 8 of 10: NO TIPPING OFF. Nothing a client or an accountant reads may say that anybody suspects anything, or
  // that a due diligence check is being run on them. Migration 017 widens the table's trigger pair to the same words.
  [/money\s+laundering/i, 'a reference to money laundering'],
  [/suspicio/i, 'a suspicion'],
  [/national\s+crime\s+agency/i, 'a reference to the National Crime Agency'],
  [/nominated\s+officer/i, 'a reference to the nominated officer'],
  [/due\s+diligence/i, 'a reference to due diligence'],
  [/tipping[\s-]+off/i, 'a reference to tipping off'],
] as const);

/** The shapes and words of a bank detail — the first nine refusals above. The breach register never records one. */
const BANK_DETAIL_REFUSALS = REFUSED.slice(2, 9);

/** WHAT BANK DETAIL A TEXT CARRIES, OR NULL. src/web/compliance.ts asks it of every breach entry's prose. */
export function carriesBankDetails(text: string): string | null {
  for (const [pattern, what] of BANK_DETAIL_REFUSALS) if (pattern.test(text)) return what;
  return null;
}

/** WHAT A TEXT WOULD TIP SOMEBODY OFF WITH, OR NULL — asked of every letter the compliance registers queue. */
export function tipsOff(text: string): string | null {
  for (const [pattern, what] of REFUSED.slice(-6)) if (pattern.test(text)) return what;
  return null;
}

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/**
 * WHY A TEMPLATE IS REFUSED, OR NULL. Asked when a template is written AND again
 * when it is merged — a row that reached the table some other way is refused at
 * the merge as well.
 */
export function templateRefusal(t: { label: string; subject: string; body: string }): string | null {
  const all = `${t.label}\n${t.subject}\n${t.body}`;
  for (const [pattern, what] of REFUSED) {
    if (pattern.test(all)) {
      return `A template may not carry ${what}. Bank details are never sent from a template, and the invoice email waits on the ` +
        'invoice-fraud procedure.';
    }
  }
  for (const m of all.matchAll(PLACEHOLDER)) {
    const name = (m[1] ?? '').trim();
    if (!Object.hasOwn(MERGE_FIELDS, name)) {
      return `“{{${name}}}” is not a merge field. The merge fields are ${Object.keys(MERGE_FIELDS).map((k) => `{{${k}}}`).join(', ')}.`;
    }
  }
  const leftover = all.replace(PLACEHOLDER, '');
  if (leftover.includes('{{') || leftover.includes('}}')) return 'A merge field is opened or closed without its pair: write it as {{field_name}}.';
  return null;
}

type TemplateRow = { id: string; label: string; subject: string; body: string; active: number; created_at: string; updated_at: string };

export type TemplateView = {
  readonly id: string; readonly label: string; readonly subject: string; readonly body: string;
  readonly active: boolean; readonly updated: string;
};

export type TemplatesPage = {
  readonly templates: readonly TemplateView[];
  readonly merge_fields: Readonly<Record<string, string>>;
  readonly may_write: boolean;
};

const SECTION = { type: 'email_template' as const, id: '__templates__' };

export function templatesPage(db: Db, actor: Actor): TemplatesPage {
  authorise(actor, 'email_template.read', SECTION);
  return {
    templates: db.all<TemplateRow>('SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates ORDER BY label ASC')
      .map((t) => ({ id: t.id, label: t.label, subject: t.subject, body: t.body, active: t.active === 1, updated: localStamp(t.updated_at) })),
    merge_fields: MERGE_FIELDS,
    may_write: can(actor, 'email_template.write', SECTION),
  };
}

/** The active templates, for a claim's email form. */
export function activeTemplates(db: Db, actor: Actor): { id: string; label: string }[] {
  if (!can(actor, 'email_template.read', SECTION)) return [];
  return db.all<{ id: string; label: string }>('SELECT id, label FROM email_templates WHERE active = 1 ORDER BY label ASC');
}

type Values = { label: string; subject: string; body: string; active: number };

/** PHASE 133e (D4, continued): a refusal names the posted field it is about, where it is about one. */
function values(input: Fields, stored: Values): { ok: true; value: Values } | { ok: false; why: string; field?: string } {
  const pick = (k: 'label' | 'subject' | 'body'): string => (Object.hasOwn(input, k) ? (input[k] ?? '') : stored[k]).trim();
  const v: Values = {
    label: pick('label'), subject: pick('subject'), body: pick('body'),
    active: Object.hasOwn(input, 'active') ? (input['active'] === 'no' ? 0 : 1) : stored.active,
  };
  if (v.label === '' || v.subject === '' || v.body === '') {
    return { ok: false, why: 'A template has a label, a subject and a body.', field: v.label === '' ? 'label' : v.subject === '' ? 'subject' : 'body' };
  }
  if (v.label.length > 200 || v.subject.length > 300 || v.body.length > 20000) {
    return { ok: false, why: 'That template is longer than we store: 200 characters of label, 300 of subject, 20,000 of body.',
      field: v.label.length > 200 ? 'label' : v.subject.length > 300 ? 'subject' : 'body' };
  }
  const refusal = templateRefusal(v);
  return refusal === null ? { ok: true, value: v } : { ok: false, why: refusal };
}

export function createTemplate(d: TemplateDeps, actor: Actor, input: Fields): { ok: true; id: string } | { ok: false; why: string; field?: string } {
  authorise(actor, 'email_template.write', SECTION);
  const v = values(input, { label: '', subject: '', body: '', active: 1 });
  if (!v.ok) return v;
  const id = d.newId();
  const at = d.now();
  d.db.run('INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, v.value.label, v.value.subject, v.value.body, v.value.active, at, at]);
  d.audit.append({
    at, kind: 'EMAIL_TEMPLATE_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'email_template', object_id: id, detail: { template: id },
  });
  return { ok: true, id };
}

/** CHANGE A TEMPLATE, OR RETIRE IT. Never deleted. */
export function updateTemplate(d: TemplateDeps, actor: Actor, id: string, input: Fields): { ok: true; id: string } | { ok: false; why: string; field?: string } {
  authorise(actor, 'email_template.write', { type: 'email_template', id });
  const t = d.db.get<TemplateRow>('SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates WHERE id = ?', [id]);
  if (t === undefined) throw new NotFoundAsRefusal();
  const v = values(input, { label: t.label, subject: t.subject, body: t.body, active: t.active });
  if (!v.ok) return v;
  const changed = (['label', 'subject', 'body', 'active'] as const).filter((k) => v.value[k] !== t[k]);
  if (changed.length === 0) return { ok: true, id };
  d.db.run('UPDATE email_templates SET label = ?, subject = ?, body = ?, active = ?, updated_at = ? WHERE id = ?',
    [v.value.label, v.value.subject, v.value.body, v.value.active, d.now(), id]);
  d.audit.append({
    at: d.now(), kind: 'EMAIL_TEMPLATE_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'email_template', object_id: id, detail: { template: id, fields: changed },
  });
  return { ok: true, id };
}

/* ================================================================== *
 * THE MERGE
 * ================================================================== */

export type MergeValues = Readonly<Record<string, string | null>>;

/** What each merge field holds for this claim and this contact — null where nothing is recorded. */
export function mergeValues(db: Db, claim_id: string, contact_id: string | null): MergeValues {
  const c = db.get<{ claim_ref: string; business_name: string; property_id: string | null }>(
    'SELECT c.claim_ref, b.name AS business_name, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?',
    [claim_id]);
  const p = c?.property_id === null || c?.property_id === undefined ? undefined
    : db.get<{ address_line_1: string | null; address_line_2: string | null; town: string | null; postcode: string | null }>(
      'SELECT address_line_1, address_line_2, town, postcode FROM properties WHERE id = ?', [c.property_id]);
  const address = p === undefined ? ''
    : [p.address_line_1, p.address_line_2, p.town, p.postcode].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  const contact = contact_id === null ? undefined
    : db.get<{ full_name: string }>('SELECT full_name FROM contacts WHERE id = ?', [contact_id]);
  const next = db.get<{ title: string; due_on: string | null }>(
    "SELECT title, due_on FROM staff_tasks WHERE claim_id = ? AND is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS')", [claim_id]);
  const blank = (v: string | null | undefined): string | null => (v === null || v === undefined || v.trim() === '' ? null : v.trim());
  return {
    contact_name: blank(contact?.full_name),
    organisation: blank(c?.business_name),
    property_address: blank(address),
    claim_reference: blank(c?.claim_ref),
    next_action: blank(next?.title),
    // PHASE 133c: the date a client reads in a message is a UK date, "31 Dec 2026". The stored value stays ISO.
    due_date: blank(next?.due_on === null || next?.due_on === undefined ? null : ukDate(next.due_on)),
  };
}

/**
 * PHASE 134 — AN EMAIL'S SUBJECT LEADS WITH THE COMPANY. Lakhbir, 18 September 2026: the client is the company, and a
 * person reads the company's name first. A merged subject that does not already start with it gets it in front:
 * "Elverton Private Hospital Limited — Documents we still need". Where the company has no name recorded, nothing is
 * invented — the subject is left as merged.
 */
export function companyFirst(subject: string, organisation: string | null): string {
  if (organisation === null) return subject;
  const name = escapeHtml(organisation).replace(/[\r\n]+/g, ' ');
  return subject.startsWith(name) ? subject : `${name} — ${subject}`;
}

/** Merge a text. Escaped values; a visible gap for a missing one; no line break in a subject. */
export function mergeText(text: string, v: MergeValues, subjectLine: boolean): { text: string; gaps: string[] } {
  const gaps: string[] = [];
  const out = text.replace(PLACEHOLDER, (_m, raw: string) => {
    const name = raw.trim();
    const value = v[name] ?? null;
    if (value === null) {
      gaps.push(name);
      return gapFor(name);
    }
    const escaped = escapeHtml(value);
    return subjectLine ? escaped.replace(/[\r\n]+/g, ' ') : escaped;
  });
  return { text: out, gaps };
}

export type QueueResult =
  | { readonly ok: true; readonly id: string; readonly gaps: readonly string[] }
  /** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
  | { readonly ok: false; readonly why: string; readonly field?: string };

/**
 * MERGE A TEMPLATE FOR ONE OF THE CLAIM'S ORGANISATION'S CONTACTS, AND QUEUE IT —
 * to the outbox, unsent, with the organisation named so DO_NOT_CONTACT refuses it.
 */
export function queueTemplate(d: TemplateDeps, actor: Actor, claim_id: string, input: Fields): QueueResult {
  const c = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'claim.read', claimObjFor(d.db, c));
  authorise(actor, 'email.queue', { type: 'email', id: c.id, business_id: c.business_id });
  const t = d.db.get<TemplateRow>(
    'SELECT id, label, subject, body, active, created_at, updated_at FROM email_templates WHERE id = ? AND active = 1',
    [(input['template_id'] ?? '').trim()]);
  if (t === undefined) return { ok: false, why: 'Choose one of the templates offered.', field: 'template_id' };
  const refusal = templateRefusal(t);
  if (refusal !== null) return { ok: false, why: refusal };
  const ct = d.db.get<{ id: string; business_id: string | null; email: string | null }>(
    'SELECT id, business_id, email FROM contacts WHERE id = ?', [(input['contact_id'] ?? '').trim()]);
  if (ct === undefined || ct.business_id !== c.business_id) return { ok: false, why: 'Choose one of this organisation’s own contacts.', field: 'contact_id' };
  authorise(actor, 'contact.read', { type: 'contact', id: ct.id, business_id: ct.business_id });
  if (ct.email === null || ct.email.trim() === '') {
    return { ok: false, why: 'That contact has no email address recorded, so there is nothing to address this to. Record their address first.', field: 'contact_id' };
  }
  const v = mergeValues(d.db, c.id, ct.id);
  const subject = mergeText(t.subject, v, true);
  const body = mergeText(t.body, v, false);
  const gaps = [...new Set([...subject.gaps, ...body.gaps])];
  const sent = outboxTransport(d.db, d.newId, d.now).send({
    to_email: ct.email, subject: companyFirst(subject.text, v.organisation ?? null), body: body.text, kind: 'TEMPLATE', business_id: c.business_id,
  });
  if (sent.id === null) {
    return { ok: false, why: 'This organisation is marked do not contact. Nothing was queued — the outbox refuses it.' };
  }
  d.audit.append({
    at: d.now(), kind: 'EMAIL_QUEUED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'outbox', object_id: sent.id,
    detail: { template: t.id, claim: c.id, contact: ct.id, business: c.business_id, gaps: gaps.length },
  });
  return { ok: true, id: sent.id, gaps };
}

/**
 * PHASE 133a — THE GATE OF THE EMAIL TEMPLATES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function templatesGate(actor: Actor): void {
  authorise(actor, 'email_template.read', SECTION);
}
