/**
 * WHO MAY BE SENT AN IDENTITY CHECK: A DIRECTOR OR AN OWNER OF THE CLIENT, AS WE ALREADY KNOW THEM. Phase 161m1.
 *
 * THE DECISION. Lakhbir, 11 Nov 2026: "mention didit and ensure the person who is performing the ID check is the
 * director or owner, admin can bypass". Clause 18 of the engagement letter says the same of the person who signs: a
 * director, partner, member or owner of the client, or someone we agree to in writing (the Admin's reasoned bypass,
 * in identity-checks.ts `sendIdentityCheck`).
 *
 * WHAT COUNTS, READ FROM WHAT THIS SYSTEM ALREADY HOLDS. Nothing is looked up here and nothing is kept.
 *   A DIRECTOR  Companies House lists them as a current director or a designated member: the signatory check
 *               (signatory_checks, Word answer 156) last said YES for the person who signed our letter, and the
 *               contact's name is the signer's; or an open or finished due diligence check names them as the person
 *               with authority, as a director or a designated member; or their role on the client record is the
 *               assessment's "Owner / director".
 *   AN OWNER    Companies House lists them as a current person with significant control (the CH_PSC pull kept in
 *               register_records: a person, not a company, with no date they ceased); or a due diligence check records
 *               them as a beneficial owner, or names them as having authority as a partner, the proprietor or the legal
 *               owner in person; or their role on the client record is "Owner / director", "Partner or LLP member" or
 *               "Sole trader".
 *   A TRUSTEE   a due diligence check names them as having authority as a trustee or authorised officer; or their
 *               role on the client record is "Trustee".
 * A withdrawn due diligence check counts for nothing.
 *
 * BY THE KIND OF CLIENT (businesses.claimant_type), WHO_MAY_BE_CHECKED:
 *   a company: a limited company, an LLP or a charitable company          a director or an owner
 *   NOT A COMPANY: a sole trader, a partnership or an individual          an owner or a partner NAMED ON THE CLIENT
 *       RECORD: a role on their contact details or a due diligence check. Companies House lists no directors or owners
 *       for them, so its readings are not counted.
 *   a charity or a charitable trust                                      a director, an owner or a trustee
 *   the kind not recorded                                                a director, an owner or a trustee
 *
 * NAMES are compared by the signatory check's own rule (`sameName`, src/integrations/connectors/signatory-check.ts):
 * the surname and the first forename in full, middle names optional, titles dropped. No second matcher. And the name
 * typed "as on their ID", which is the name Didit looks for on the document, must be the same name as the contact's:
 * otherwise the check would be done by someone else under a director's contact.
 */

import type { Db } from '../../core/index.ts';
import { sameName } from '../../integrations/index.ts';
import { getBusinessesClaimantTypeById, getContactsIdBusinessIdById4 } from '../clients/index.ts';
import { listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId } from '../../integrations/index.ts';
import { getEngagementSignaturesEngagementIdSignerNameByBusinessId, getSignatoryChecksResultReasonByBusinessIdSource } from '../claims/index.ts';
import { getCddBeneficialOwnersCountByBusinessIdContactId, listCddChecksAuthorityBasisByBusinessIdAuthorityContactId } from './data.ts';

export type WhoRole = 'DIRECTOR' | 'OWNER' | 'TRUSTEE';
export type ClientKind = 'COMPANY' | 'NOT_A_COMPANY' | 'CHARITY_OR_TRUST' | 'NOT_RECORDED';
/** Where a role was shown. A code, never a name: it may go on the audit chain. */
export type WhoEvidence = 'COMPANIES_HOUSE_DIRECTOR' | 'COMPANIES_HOUSE_PSC' | 'DUE_DILIGENCE_AUTHORITY' | 'DUE_DILIGENCE_OWNER' | 'CLIENT_RECORD_ROLE';

/** THE RULE, as data: for each kind of client, which roles may be sent a check. Pinned in the rules register. */
export const WHO_MAY_BE_CHECKED: Readonly<Record<ClientKind, Readonly<Record<WhoRole, boolean>>>> = Object.freeze({
  COMPANY: Object.freeze({ DIRECTOR: true, OWNER: true, TRUSTEE: false }),
  NOT_A_COMPANY: Object.freeze({ DIRECTOR: false, OWNER: true, TRUSTEE: false }),
  CHARITY_OR_TRUST: Object.freeze({ DIRECTOR: true, OWNER: true, TRUSTEE: true }),
  NOT_RECORDED: Object.freeze({ DIRECTOR: true, OWNER: true, TRUSTEE: true }),
});
/** Only an Admin may send a check to someone else, once, with a reason. Pinned with the rule. */
export const IDENTITY_WHO_RULE = Object.freeze({ who: WHO_MAY_BE_CHECKED, admin_may_bypass_with_a_reason: true });

const COMPANY_KINDS: readonly string[] = ['COMPANY', 'LLP', 'CHARITY_COMPANY'];
const NOT_A_COMPANY_KINDS: readonly string[] = ['SOLE_TRADER', 'PARTNERSHIP', 'INDIVIDUAL'];
const CHARITY_OR_TRUST_KINDS: readonly string[] = ['CHARITY', 'CHARITABLE_TRUST'];

export function clientKindOf(claimant_type: string | null | undefined): ClientKind {
  const t = claimant_type ?? '';
  if (COMPANY_KINDS.includes(t)) return 'COMPANY';
  if (NOT_A_COMPANY_KINDS.includes(t)) return 'NOT_A_COMPANY';
  if (CHARITY_OR_TRUST_KINDS.includes(t)) return 'CHARITY_OR_TRUST';
  return 'NOT_RECORDED';
}

/** The assessment's roles (CB_FUNNEL.ROLES) that the client record holds as a role here. */
const ROLE_FROM_CLIENT_RECORD: Readonly<Record<string, readonly WhoRole[]>> = Object.freeze({
  owner_director: ['DIRECTOR', 'OWNER'], partner_llp: ['OWNER'], sole_trader: ['OWNER'], trustee: ['TRUSTEE'],
});
/** A due diligence check's "authority to bind" (compliance-aml.ts AUTHORITY_BASES) as a role here. OTHER is none. */
const ROLE_FROM_AUTHORITY: Readonly<Record<string, WhoRole>> = Object.freeze({
  DIRECTOR: 'DIRECTOR', DESIGNATED_MEMBER: 'DIRECTOR', PARTNER: 'OWNER', PROPRIETOR: 'OWNER', LEGAL_OWNER_IN_PERSON: 'OWNER',
  TRUSTEE_OR_AUTHORISED_OFFICER: 'TRUSTEE',
});
/** The signatory check's answers that mean Companies House lists the signer as a current director. */
const DIRECTOR_REASONS: readonly string[] = ['CURRENT_DIRECTOR', 'DESIGNATED_MEMBER'];

type Found = { readonly role: WhoRole; readonly from: WhoEvidence };

/** Everything we hold that shows this contact in a role, for this organisation. Names compared in memory, kept nowhere. */
export function rolesWeHold(db: Db, business_id: string, contact: { readonly id: string; readonly full_name: string; readonly job_role: string | null }): Found[] {
  const out: Found[] = [];
  for (const role of ROLE_FROM_CLIENT_RECORD[contact.job_role ?? ''] ?? []) out.push({ role, from: 'CLIENT_RECORD_ROLE' });
  for (const r of listCddChecksAuthorityBasisByBusinessIdAuthorityContactId<{ authority_basis: string }>(db, [business_id, contact.id])) {
    const role = ROLE_FROM_AUTHORITY[r.authority_basis];
    if (role !== undefined) out.push({ role, from: 'DUE_DILIGENCE_AUTHORITY' });
  }
  if ((getCddBeneficialOwnersCountByBusinessIdContactId<{ n: number }>(db, [business_id, contact.id])?.n ?? 0) > 0) out.push({ role: 'OWNER', from: 'DUE_DILIGENCE_OWNER' });
  const ch = getSignatoryChecksResultReasonByBusinessIdSource<{ result: string; reason: string }>(db, [business_id, 'COMPANIES_HOUSE']);
  if (ch !== undefined && ch.result === 'YES' && DIRECTOR_REASONS.includes(ch.reason)) {
    const signer = getEngagementSignaturesEngagementIdSignerNameByBusinessId<{ signer_name: string | null }>(db, [business_id]);
    if (signer !== undefined && sameName(contact.full_name, signer.signer_name)) out.push({ role: 'DIRECTOR', from: 'COMPANIES_HOUSE_DIRECTOR' });
  }
  for (const r of listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId<{ fields_json: string }>(db, [business_id, 'CH_PSC'])) {
    const f = readFields(r.fields_json);
    const kind = typeof f['psc_kind'] === 'string' ? f['psc_kind'] : '';
    // A person, not a company or other legal person; and still a person with significant control.
    if (!kind.startsWith('individual') || (f['psc_ceased_on'] !== undefined && f['psc_ceased_on'] !== null)) continue;
    if (sameName(contact.full_name, typeof f['psc_name'] === 'string' ? f['psc_name'] : null)) { out.push({ role: 'OWNER', from: 'COMPANIES_HOUSE_PSC' }); break; }
  }
  return out;
}

function readFields(json: string): Record<string, unknown> {
  try { const v: unknown = JSON.parse(json); return v !== null && typeof v === 'object' ? v as Record<string, unknown> : {}; } catch { return {}; }
}

/** Companies House names no directors or owners for a client that is not a company: its readings do not count there. */
function counts(kind: ClientKind, f: Found): boolean {
  if (!WHO_MAY_BE_CHECKED[kind][f.role]) return false;
  return kind !== 'NOT_A_COMPANY' || (f.from !== 'COMPANIES_HOUSE_DIRECTOR' && f.from !== 'COMPANIES_HOUSE_PSC');
}

/* ------------------------------------------------------------------ the words */

const ROLE_WORDS: Readonly<Record<WhoRole, string>> = Object.freeze({ DIRECTOR: 'a director', OWNER: 'an owner', TRUSTEE: 'a trustee' });

/** What the rule asks for this kind of client, as the person sending a check reads it. */
export function whoMayBeCheckedWords(kind: ClientKind): string {
  switch (kind) {
    case 'COMPANY': return 'We send an identity check only to a director or an owner of this client.';
    case 'NOT_A_COMPANY': return 'This client is not a company. We send an identity check only to its owner or a partner, named on our client record.';
    case 'CHARITY_OR_TRUST': return 'We send an identity check only to a director, an owner or a trustee of this client.';
    case 'NOT_RECORDED': return 'We send an identity check only to a director, an owner or a trustee of this client.';
  }
}

/** How to go on, when the person chosen is not one of them (the bypass is said by the sender, who knows who asks). */
export function howToGoOnWords(kind: ClientKind): string {
  return kind === 'NOT_A_COMPANY'
    ? 'Are they its owner or a partner? Then record it on its due diligence check first. Name them as the person with authority, or add them as an owner.'
    : 'Are they one? Then record it on its due diligence check first. Name them as the person with authority, or add them as an owner.';
}

export const TYPED_NAME_WORDS =
  'The name you typed is not the name we hold for this person. Type their first and last name as they are on their ID. ' +
  'If we hold their name wrongly, correct it in their contact details first.';

/* ------------------------------------------------------------------ the answer */

export type WhoAnswer =
  | { readonly ok: true; readonly kind: ClientKind; readonly role: WhoRole; readonly from: readonly WhoEvidence[] }
  | { readonly ok: false; readonly kind: ClientKind; readonly code: 'NOT_DIRECTOR_OR_OWNER' | 'NAME_NOT_THEIRS' | 'NOT_A_CONTACT'; readonly why: string };

/**
 * May this contact be sent an identity check, in these names? The rule in the header, in one place, for the send and
 * for the panel. `typed` null asks only about the person (the panel); given, the names must be the contact's too.
 */
export function mayBeChecked(db: Db, business_id: string, contact_id: string, typed: { readonly first_name: string; readonly last_name: string } | null): WhoAnswer {
  const kind = clientKindOf(getBusinessesClaimantTypeById<{ claimant_type: string | null }>(db, [business_id])?.claimant_type);
  const c = getContactsIdBusinessIdById4<{ id: string; business_id: string | null; full_name: string; job_role: string | null }>(db, [contact_id]);
  if (c === undefined || c.business_id !== business_id) {
    return { ok: false, kind, code: 'NOT_A_CONTACT', why: 'Choose the person to be checked. They must be a contact of this organisation.' };
  }
  const found = rolesWeHold(db, business_id, c).filter((f) => counts(kind, f));
  if (found.length === 0) {
    return { ok: false, kind, code: 'NOT_DIRECTOR_OR_OWNER', why: `${whoMayBeCheckedWords(kind)} We do not hold ${c.full_name} as one. ${howToGoOnWords(kind)}` };
  }
  if (typed !== null && !sameName(`${typed.last_name.trim()}, ${typed.first_name.trim()}`, c.full_name)) {
    return { ok: false, kind, code: 'NAME_NOT_THEIRS', why: TYPED_NAME_WORDS };
  }
  const role = (['DIRECTOR', 'OWNER', 'TRUSTEE'] as const).find((r) => found.some((f) => f.role === r)) as WhoRole;
  return { ok: true, kind, role, from: [...new Set(found.map((f) => f.from))] };
}

/** "a director", "an owner" or "a trustee", for the panel. */
export function roleWords(role: WhoRole): string { return ROLE_WORDS[role]; }
