/**
 * THE PER-DISCLOSURE LOG — BUILT, AND SWITCHED OFF. Phase 129, 12 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS
 *
 * UK GDPR Article 19 is owed to "each recipient to whom the personal data have been disclosed", and Article 15(1)(c) asks
 * an access response to name them. That is a fact PER CLIENT, not per firm, and the document "Who we pass client personal
 * data on to" (06-commercial-and-governance/Caprebate-Recipients-of-Client-Personal-Data-v1.md) says in its section 4 that
 * a static list of categories cannot discharge it: something has to record the disclosure when it happens. This is that
 * something — one row per disclosure: when, to whom, which data, on what lawful basis, and by whom.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE VOCABULARY IS THE DOCUMENT'S, WORD FOR WORD
 *
 * R1 to R4 are its recipients and P1 to P7 its processors, each with the occasion and the route its tables give. R5 — the
 * registers — is refused by name: a source is not a recipient, and merging the two lists is the mistake the document
 * exists to prevent. The lawful bases are the governance policies' section D2 — contract, legitimate interests, a legal
 * obligation, and consent only where a policy says so — plus, for a processor, its Article 28 instruction.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OFF, NOTHING IS WRITTEN AND NOTHING IS SAID — AND "NOT KEPT" IS NEVER "NONE" (N4)
 *
 * `DISCLOSURE_LOG` ships `enabled: false`. While it is off, recording is refused before anything is written, and the
 * reading for a client says the log is not kept, never that nobody received their data. Switched on, it must carry the
 * date it came into force, and even then an empty log says "none recorded since that date", because before it the log
 * cannot say. What it waits on is written in `waits_on`.
 *
 * NO PERSON'S NAME IS WRITTEN HERE, and the audit line carries codes and counts only.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor, type Obj } from '../authz.ts';
import { localStamp } from './localtime.ts';

export type DisclosureDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Fields = Readonly<Record<string, string | null>>;
export type DisclosureResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string };

export type Recipient =
  | 'R1_SURVEYOR' | 'R2_TAX_ADVISER' | 'R3_CLIENT_ACCOUNTANT' | 'R4_HMRC'
  | 'P1_MICROSOFT' | 'P2_MONDAY' | 'P3_IONOS' | 'P4_OBJECT_STORE' | 'P5_WORDPRESS_HOST' | 'P6_EXTRACTION_MODEL' | 'P7_ADDRESS_LOOKUP';
export type Occasion = 'VALUATION_INSTRUCTION' | 'REVIEW_OR_SIGNOFF' | 'CLIENT_INSTRUCTION' | 'REFERRAL_CHANNEL' | 'FILING' | 'PROCESSOR_HOLDING';
export type Route = 'EMAIL' | 'PORTAL' | 'VIA_CLIENT_OR_AGENT' | 'PROCESSOR_SYSTEM';
export type LawfulBasis = 'CONTRACT' | 'LEGITIMATE_INTERESTS' | 'LEGAL_OBLIGATION' | 'CONSENT' | 'PROCESSOR_ON_INSTRUCTION';
export type DataCategory =
  | 'CONTACT_DETAILS' | 'PROPERTY_ADDRESS' | 'UPLOADED_DOCUMENTS' | 'ENTITLEMENT_CHAIN_NAMES'
  | 'CLAIM_COMPUTATION' | 'CLAIM_OUTCOME_FIGURES' | 'FILED_CLAIM_CONTENTS';

/** The document whose recipient list this log uses. Its title, not a paraphrase. */
export const RECIPIENTS_DOCUMENT = 'Who we pass client personal data on to';

export type DisclosureLogSwitch = {
  readonly enabled: boolean;
  /** The UK date the log came into force. Required once it is on; before it, the log cannot say. */
  readonly in_force_from: string | null;
  readonly waits_on: string;
};

export const DISCLOSURE_LOG: DisclosureLogSwitch = Object.freeze({
  enabled: false,
  in_force_from: null,
  waits_on:
    'the solicitor and the data protection officer to sign off our list of who gets client data. ' +
    'That list says who this log records. It also waits for the first real disclosure: no surveyor or tax adviser is engaged yet, and no claim is filed',
});

type RecipientEntry = {
  readonly label: string;
  readonly kind: 'RECIPIENT' | 'PROCESSOR';
  readonly occasions: readonly Occasion[];
  readonly routes: readonly Route[];
};

const PROCESSOR = { kind: 'PROCESSOR' as const, occasions: Object.freeze(['PROCESSOR_HOLDING'] as Occasion[]), routes: Object.freeze(['PROCESSOR_SYSTEM'] as Route[]) };

/** Sections 1 and 2 of the recipients document. The labels are its own. */
export const RECIPIENTS: Readonly<Record<Recipient, RecipientEntry>> = Object.freeze({
  R1_SURVEYOR: { label: 'R1 — External surveyor', kind: 'RECIPIENT', occasions: ['VALUATION_INSTRUCTION'], routes: ['EMAIL', 'PORTAL'] },
  R2_TAX_ADVISER: { label: 'R2 — Chartered tax adviser (CTA)', kind: 'RECIPIENT', occasions: ['REVIEW_OR_SIGNOFF'], routes: ['EMAIL'] },
  R3_CLIENT_ACCOUNTANT: { label: 'R3 — The client’s own accountant', kind: 'RECIPIENT', occasions: ['CLIENT_INSTRUCTION', 'REFERRAL_CHANNEL'], routes: ['EMAIL'] },
  R4_HMRC: { label: 'R4 — HM Revenue and Customs', kind: 'RECIPIENT', occasions: ['FILING'], routes: ['VIA_CLIENT_OR_AGENT'] },
  P1_MICROSOFT: { label: 'P1 — Microsoft (OneDrive / M365)', ...PROCESSOR },
  P2_MONDAY: { label: 'P2 — monday.com', ...PROCESSOR },
  P3_IONOS: { label: 'P3 — IONOS', ...PROCESSOR },
  P4_OBJECT_STORE: { label: 'P4 — The object store (Block E)', ...PROCESSOR },
  P5_WORDPRESS_HOST: { label: 'P5 — The WordPress host', ...PROCESSOR },
  P6_EXTRACTION_MODEL: { label: 'P6 — The document-extraction model provider', ...PROCESSOR },
  P7_ADDRESS_LOOKUP: { label: 'P7 — Address lookup (Homedata)', ...PROCESSOR },
});

/** R5. Named so the refusal can say what they are. */
export const SOURCES_NOT_RECIPIENTS: Readonly<Record<string, string>> = Object.freeze({
  R5_COMPANIES_HOUSE: 'Companies House',
  R5_HM_LAND_REGISTRY: 'HM Land Registry',
  R5_SECTOR_REGULATOR: 'a sector regulator',
});

export const SOURCE_NOT_RECIPIENT =
  'R5 — Companies House, HM Land Registry and the sector regulators are places we read from. ' +
  'We send them nothing, so there is nothing to record here.';

export const OCCASIONS: Readonly<Record<Occasion, string>> = Object.freeze({
  VALUATION_INSTRUCTION: 'On instruction for a valuation',
  REVIEW_OR_SIGNOFF: 'On review or sign-off',
  CLIENT_INSTRUCTION: 'On the client’s instruction',
  REFERRAL_CHANNEL: 'In the referral channel',
  FILING: 'On filing',
  PROCESSOR_HOLDING: 'Held on our instruction',
});

export const ROUTES: Readonly<Record<Route, string>> = Object.freeze({
  EMAIL: 'Email',
  PORTAL: 'Portal',
  VIA_CLIENT_OR_AGENT: 'Via the client or their agent',
  PROCESSOR_SYSTEM: 'In the processor’s own system',
});

export const LAWFUL_BASES: Readonly<Record<LawfulBasis, string>> = Object.freeze({
  CONTRACT: 'Contract — needed to perform the engagement (governance policies, D2)',
  LEGITIMATE_INTERESTS: 'Legitimate interests (governance policies, D2)',
  LEGAL_OBLIGATION: 'A legal obligation (governance policies, D2)',
  CONSENT: 'Consent — only where a policy says so (governance policies, D2 and D3)',
  PROCESSOR_ON_INSTRUCTION: 'A processor acting on our instruction under Article 28 terms',
});

export const DATA_CATEGORIES: Readonly<Record<DataCategory, string>> = Object.freeze({
  CONTACT_DETAILS: 'Client and contact details',
  PROPERTY_ADDRESS: 'The property address',
  UPLOADED_DOCUMENTS: 'Uploaded documents relevant to the work',
  ENTITLEMENT_CHAIN_NAMES: 'A name in the entitlement chain, where it bears on entitlement',
  CLAIM_COMPUTATION: 'The claim computation and the entitlement chain',
  CLAIM_OUTCOME_FIGURES: 'The claim outcome and the figures a return needs',
  FILED_CLAIM_CONTENTS: 'Whatever a filed claim contains',
});

export const DISCLOSURE_LOG_OFF =
  'This log is switched off, so no disclosure is recorded. It is switched on once what it waits for is settled.';

const LOG_OBJ: Obj = { type: 'compliance', id: '__disclosure_log__' };

function has<T extends string>(v: Readonly<Record<T, unknown>>, k: string | null | undefined): k is T {
  return k !== null && k !== undefined && Object.hasOwn(v, k);
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?Z$/;

/**
 * RECORD ONE DISCLOSURE. Refused, with nothing written, while the log is off. On, every field is checked against the
 * recipients document's own vocabulary before one row and one audit line are written in one transaction.
 */
export function recordDisclosure(d: DisclosureDeps, actor: Actor, input: Fields, s: DisclosureLogSwitch = DISCLOSURE_LOG): DisclosureResult {
  authorise(actor, 'disclosure.record', LOG_OBJ);
  if (!s.enabled) return { ok: false, why: DISCLOSURE_LOG_OFF };
  if (s.in_force_from === null) return { ok: false, why: 'the log is switched on with no date it came into force, so it records nothing until it has one.' };

  const business_id = (input['business_id'] ?? '').trim();
  if (d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [business_id]) === undefined) {
    return { ok: false, why: 'say whose data it was: an organisation on record.' };
  }
  const claimIn = (input['claim_id'] ?? '').trim();
  const claim_id = claimIn === '' ? null : claimIn;
  if (claim_id !== null && d.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim_id])?.business_id !== business_id) {
    return { ok: false, why: 'the claim named is not this organisation’s.' };
  }

  const recipientIn = (input['recipient'] ?? '').trim();
  if (recipientIn.startsWith('R5') || Object.hasOwn(SOURCES_NOT_RECIPIENTS, recipientIn)) return { ok: false, why: SOURCE_NOT_RECIPIENT };
  if (!has(RECIPIENTS, recipientIn)) return { ok: false, why: `choose the recipient from “${RECIPIENTS_DOCUMENT}”: R1 to R4, or a processor P1 to P7.` };
  const recipient: Recipient = recipientIn;
  const entry = RECIPIENTS[recipient];

  const contactIn = (input['recipient_contact_id'] ?? '').trim();
  const userIn = (input['recipient_user_id'] ?? '').trim();
  const recipient_contact_id = contactIn === '' ? null : contactIn;
  const recipient_user_id = userIn === '' ? null : userIn;
  if (recipient_contact_id !== null && recipient_user_id !== null) return { ok: false, why: 'name the recipient once: a contact or a surveyor’s login, not both.' };
  if (entry.kind === 'PROCESSOR' && (recipient_contact_id !== null || recipient_user_id !== null)) {
    return { ok: false, why: 'a processor is named by its code alone; it has no contact or login here.' };
  }
  if (recipient_contact_id !== null
    && d.db.get<{ business_id: string | null }>('SELECT business_id FROM contacts WHERE id = ?', [recipient_contact_id])?.business_id !== business_id) {
    return { ok: false, why: 'the contact named is not one of this organisation’s.' };
  }
  if (recipient_user_id !== null
    && (recipient !== 'R1_SURVEYOR' || d.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [recipient_user_id])?.role !== 'SURVEYING')) {
    return { ok: false, why: 'only the surveyor is named by a login, and the login must be a surveyor’s.' };
  }

  const cats = [...new Set((input['data_categories'] ?? '').split(',').map((x) => x.trim()).filter((x) => x.length > 0))];
  if (cats.length === 0) return { ok: false, why: 'say which data was disclosed: at least one category.' };
  const badCat = cats.find((c) => !has(DATA_CATEGORIES, c));
  if (badCat !== undefined) return { ok: false, why: `“${badCat}” is not a category on the list.` };

  const occasion = (input['occasion'] ?? '').trim();
  if (!has(OCCASIONS, occasion) || !entry.occasions.includes(occasion)) {
    return { ok: false, why: `${entry.label} receives data ${entry.occasions.map((o) => OCCASIONS[o].toLowerCase()).join(' or ')}, as the recipients document says.` };
  }
  const route = (input['route'] ?? '').trim();
  if (!has(ROUTES, route) || !entry.routes.includes(route)) {
    return { ok: false, why: `${entry.label} is reached ${entry.routes.map((r) => ROUTES[r].toLowerCase()).join(' or ')}, as the recipients document says.` };
  }
  const basis = (input['lawful_basis'] ?? '').trim();
  if (!has(LAWFUL_BASES, basis)) return { ok: false, why: 'choose the lawful basis from the list.' };
  if ((entry.kind === 'PROCESSOR') !== (basis === 'PROCESSOR_ON_INSTRUCTION')) {
    return { ok: false, why: entry.kind === 'PROCESSOR'
      ? 'a processor holds data on our instruction under Article 28 terms; that is the only basis its row can carry.'
      : 'a recipient that is not our processor needs a lawful basis of its own. Choose one from the list — not the processor one.' };
  }

  const disclosed_at = (input['disclosed_at'] ?? '').trim();
  const at = d.now();
  if (!ISO_INSTANT.test(disclosed_at) || Number.isNaN(Date.parse(disclosed_at))) return { ok: false, why: 'say when it was disclosed, as a moment in time.' };
  if (Date.parse(disclosed_at) > Date.parse(at)) return { ok: false, why: 'a disclosure is recorded once it has happened, never ahead of it.' };

  const correctsIn = (input['corrects_id'] ?? '').trim();
  const corrects_id = correctsIn === '' ? null : correctsIn;
  if (corrects_id !== null
    && d.db.get<{ business_id: string }>('SELECT business_id FROM disclosure_log WHERE id = ?', [corrects_id])?.business_id !== business_id) {
    return { ok: false, why: 'a correction must point to an earlier disclosure for this same organisation.' };
  }

  const id = d.newId();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO disclosure_log (id, business_id, claim_id, recipient, recipient_contact_id, recipient_user_id, data_categories, occasion, route, ' +
        'lawful_basis, disclosed_at, recorded_by, recorded_at, corrects_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, business_id, claim_id, recipient, recipient_contact_id, recipient_user_id, JSON.stringify(cats), occasion, route, basis,
        disclosed_at, actor.id, at, corrects_id]);
    d.audit.append({
      at, kind: 'DISCLOSURE_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'disclosure', object_id: id,
      detail: { business_id, recipient, categories: cats.length, occasion, route, basis, corrects: corrects_id },
    });
  });
  return { ok: true, id };
}

export type DisclosureRow = {
  readonly id: string;
  readonly recipient: { readonly code: string; readonly label: string };
  readonly categories: readonly string[];
  readonly occasion: string;
  readonly route: string;
  readonly basis: string;
  readonly disclosed: string;
  readonly recorded_by: string;
  readonly corrects: string | null;
};

export type DisclosureReading = { readonly state: 'NOT_KEPT' | 'KEPT'; readonly label: string; readonly rows: readonly DisclosureRow[] };

export const NOT_KEPT_LABEL =
  'NOT KEPT — this log is switched off. So we cannot say who has received this client’s data. ' +
  'That is not “none”: it is not known.';

/**
 * WHO HAS RECEIVED ONE CLIENT'S DATA — the reading Article 15(1)(c) and Article 19 need. Off, it is NOT KEPT and lists
 * nothing, whatever the table holds. On, it lists every row, and an empty list says since when.
 */
export function disclosuresFor(db: Db, actor: Actor, business_id: string, s: DisclosureLogSwitch = DISCLOSURE_LOG): DisclosureReading {
  authorise(actor, 'disclosure.read', LOG_OBJ);
  if (!s.enabled || s.in_force_from === null) return { state: 'NOT_KEPT', label: NOT_KEPT_LABEL, rows: [] };
  const rows = db.all<{
    id: string; recipient: string; data_categories: string; occasion: string; route: string; lawful_basis: string;
    disclosed_at: string; corrects_id: string | null; recorder: string;
  }>(
    'SELECT d.id, d.recipient, d.data_categories, d.occasion, d.route, d.lawful_basis, d.disclosed_at, d.corrects_id, u.display_name AS recorder ' +
      'FROM disclosure_log d JOIN users u ON u.id = d.recorded_by WHERE d.business_id = ? ORDER BY d.disclosed_at ASC, d.recorded_at ASC',
    [business_id]).map((r) => ({
    id: r.id,
    recipient: { code: r.recipient, label: has(RECIPIENTS, r.recipient) ? RECIPIENTS[r.recipient].label : r.recipient },
    categories: (JSON.parse(r.data_categories) as string[]).map((c) => (has(DATA_CATEGORIES, c) ? DATA_CATEGORIES[c] : c)),
    occasion: has(OCCASIONS, r.occasion) ? OCCASIONS[r.occasion] : r.occasion,
    route: has(ROUTES, r.route) ? ROUTES[r.route] : r.route,
    basis: has(LAWFUL_BASES, r.lawful_basis) ? LAWFUL_BASES[r.lawful_basis] : r.lawful_basis,
    disclosed: localStamp(r.disclosed_at),
    recorded_by: r.recorder,
    corrects: r.corrects_id,
  }));
  const since = `since the log came into force on ${s.in_force_from}`;
  return rows.length === 0
    ? { state: 'KEPT', label: `No disclosure of this client’s data is recorded ${since}. Before that date we cannot say. That is not “none”: it is not known.`, rows }
    : { state: 'KEPT', label: `${rows.length} ${rows.length === 1 ? 'disclosure' : 'disclosures'} of this client’s data recorded ${since}.`, rows };
}
