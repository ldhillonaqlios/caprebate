/**
 * THE CRM BACKBONE — ORGANISATIONS, CONTACTS, PROPERTIES AND THE CLAIM RECORD.
 * CRM 1 of 10, 10 September 2026.
 *
 * VIEW MODELS AND WRITES. The routes and the rendering are src/web/crm-pages.ts,
 * which draws what these return and decides nothing. The scope — every field
 * and why it is shaped the way it is — is 09-app/CAPREBATE-CRM-DISPOSITION.md,
 * and the schema is migration 009.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR RULES RUN THROUGH EVERY FUNCTION BELOW
 *
 * 1 · AUTHORISED ON THE SPECIFIC OBJECT, ON EVERY READ AND EVERY WRITE. A list
 *     is filtered row by row through `can()`, never by a WHERE clause that
 *     happens to agree with the rule table today.
 *
 * 2 · N1 — BUILT FORWARDS. A claim view for a role that may not read the value
 *     is assembled without it; nothing is read and then stripped. The claim
 *     value, the tax benefit and every sealed estimate field arrive only through
 *     `claim.read_value`, which is ADMIN and SALES and nobody else, and
 *     tools/payload-proof.ts searches the served object for all seven.
 *
 * 3 · N4 — UNKNOWN AND NEVER-ASKED BEHAVE IDENTICALLY. A column nobody recorded
 *     is NULL; where its vocabulary also carries UNKNOWN the two produce the
 *     same reading, the same words on the screen, and neither passes anything.
 *     `priorClaimRuledOut` is the one reading of the prior-claim field a later
 *     gate may use, and it is true on a recorded NO and on nothing else.
 *
 * 4 · DERIVE, DO NOT RE-KEY. The legal name and company number come from a
 *     Companies House register record where one is held; the claimant type from
 *     the funnel's own entity answer; the jurisdiction from the postcode through
 *     src/web/postcode.ts. WHERE A FACT IS DERIVED, THE STORE REFUSES A RECORDED
 *     ONE — "never asked twice" is a rule here, not a form that hides a field.
 */

import type { Db } from '../db.ts';
import type { AuditLog, AuditKind } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal, answerLabel } from './backoffice.ts';
import {
  EXITS, LEGACY_STAGE_TO_PROCEDURE, anyStageLabel, claimStage, nextProcedureKey, procedureIndex, stage as stageOf,
  type ProcedureKey,
} from './stages.ts';
import { assertSignedEngagement } from './research.ts';
import {
  BOARD_COLUMNS, FEE_TRIGGER, FEE_TRIGGERS, liveFeeInvoiceCount, loadPipelineClaim, pipelinePanel, recordOpened, type PipelinePanel,
} from './pipeline.ts';
import { postcodeStore, POSTCODE_GATE } from './postcode.ts';
import { resolveServedAuthority, type PostcodeStore } from './postcode-port.ts';
import { formatPence, formatShownRange, toPence } from './shown-range.ts';
import { localStamp } from './localtime.ts';
import { claimMoneyLines, type ClaimMoneyLine } from './invoices.ts';
import { claimTaskPanel, followUpsFor, type ClaimTaskPanel } from './tasks.ts';
import { lastContactFor, timelineIfPermitted, type Timeline } from './timeline.ts';
import { fireAutomation } from './automation.ts';
import { claimDocumentsPanel, type ClaimDocumentsPanel, organisationDocumentsPanel, propertyDocumentsPanel, type PlaceDocumentsPanel } from './documents.ts';
import { factsObj, factsPanel, releasedFactReader, type FactsPanel } from './claim-facts.ts';
import {
  aftercarePanel, deliverablesPanel, figuresPanel, raiseDisposalTask,
  type AftercarePanel, type DeliverablesPanel, type FiguresPanel,
} from './claim-record.ts';
import { assembleReleasedFacts, type ReleasedFacts } from '../payload.ts';
import { vocabChoice, vocabLabel } from './vocabularies.ts';
import { funnelStateFor } from './funnel-session.ts';
import { expectedFeeFor } from './vat.ts';
import { latestSignOff } from './claim-record.ts';
import { LEAD_ORIGINS } from './leads.ts';
import { discountsFor, type FeeDiscountView } from './fee-discounts.ts';

export { NotFoundAsRefusal };

export type CrmDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type WriteResult = { ok: true; id: string } | { ok: false; why: string; field?: string };
/** A form's fields as posted: absent keys are untouched, `null` clears. */
export type Fields = Readonly<Record<string, string | null>>;

type Vocab = Readonly<Record<string, string>>;

/* ================================================================== *
 * 1 · THE VOCABULARIES — each one's source is in the disposition table
 * ================================================================== */

/** Tax Implication Summary variants and the AML/KYC Position Paper §5. */
export const CLAIMANT_TYPES: Vocab = Object.freeze({
  COMPANY: 'Limited company',
  LLP: 'Limited liability partnership',
  PARTNERSHIP: 'Partnership',
  SOLE_TRADER: 'Sole trader',
  INDIVIDUAL: 'An individual holding the property personally',
  CHARITY: 'Charity',
  // PHASE 159d (C24): which kind of charity decides which tax return it files, and so its deadline.
  CHARITY_COMPANY: 'Charitable company (files a company tax return)',
  CHARITABLE_TRUST: 'Charitable trust (files a trust tax return)',
  UNKNOWN: 'Not known',
});

export const CLIENT_STATUSES: Vocab = Object.freeze({
  PROSPECT: 'Prospect',
  ACTIVE: 'Active',
  DORMANT: 'Dormant',
  FORMER: 'Former client',
  DO_NOT_CONTACT: 'Do not contact',
});

/** The lead-source list CRM 2 of 10 adopts. */
export const SOURCES: Vocab = Object.freeze({
  WEBSITE: 'Website', REFERRAL: 'Referral', ACCOUNTANT: 'Accountant', ADVISER: 'Adviser',
  OUTBOUND: 'Outbound', EVENT: 'Event', EXISTING_CLIENT: 'Existing client', OTHER: 'Other',
});

export const CONTACT_TYPES: Vocab = Object.freeze({
  DECISION_MAKER: 'Decision maker', FINANCE: 'Finance', ACCOUNTANT: 'Accountant',
  ADVISER: 'Adviser', INTRODUCER: 'Introducer', OTHER: 'Other',
});

export const TENURES: Vocab = Object.freeze({ FREEHOLD: 'Freehold', LEASEHOLD: 'Leasehold', UNKNOWN: 'Not known' });

export const PRIOR_CLAIM: Vocab = Object.freeze({ YES: 'Yes', NO: 'No', UNKNOWN: 'Not known' });

export const JURISDICTIONS: Vocab = Object.freeze({
  england: 'England', wales: 'Wales', scotland: 'Scotland', northern_ireland: 'Northern Ireland',
});

/** The rulebooks' reliefs: Registers A and D; Register I §4 and F; Register H. */
export const WORKSTREAMS: Vocab = Object.freeze({
  PLANT_AND_MACHINERY: 'Plant and machinery',
  STRUCTURES_AND_BUILDINGS: 'Structures and buildings',
  LAND_REMEDIATION: 'Land remediation',
  UNKNOWN: 'Not yet known',
});

/** Validated here rather than by a CHECK, so CRM 9 of 10 can make it configurable. */
export const PRIORITIES: Vocab = Object.freeze({ LOW: 'Low', NORMAL: 'Normal', HIGH: 'High' });

/**
 * THE ROLES A PREVIOUS OWNER OR AN OCCUPIER MAY BE RECORDED AS, where it is not
 * a company. N2: a person is never named on a property. Where the previous owner
 * WAS a person, that fact is recorded as INDIVIDUAL_NOT_RECORDED and nothing
 * more — their identity, if it is ever needed, belongs in the identity store.
 */
export const OWNER_ROLE_TOKENS: Vocab = Object.freeze({
  INDIVIDUAL_NOT_RECORDED: 'An individual — not named here',
  DEVELOPER: 'A developer',
  LOCAL_AUTHORITY: 'A local authority',
  NHS_BODY: 'An NHS body',
  HOUSING_ASSOCIATION: 'A housing association',
  CHARITY: 'A charity',
  PUBLIC_BODY: 'Another public body',
  UNKNOWN: 'Not known',
});

/** The funnel's own entity keys onto the claimant list — CB_FUNNEL.ENTITY_LABEL. */
const FUNNEL_ENTITY: Vocab = Object.freeze({
  ltd: 'COMPANY', llp: 'LLP', partnership: 'PARTNERSHIP', sole_trader: 'SOLE_TRADER',
});

const NATION_TO_JURISDICTION: Vocab = Object.freeze({
  england: 'england', wales: 'wales', scotland: 'scotland', ni: 'northern_ireland',
});

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

export const NOT_RECORDED = 'not recorded';

/* ================================================================== *
 * 2 · N4 AND N2, AS FUNCTIONS A TEST CAN CALL
 * ================================================================== */

export type Reading = { readonly known: boolean; readonly value: string | null; readonly label: string };

/**
 * THE PRIOR-CLAIM POSITION OF A PROPERTY.
 *
 * NULL AND UNKNOWN ARE THE SAME READING, to the character. A client who was
 * never asked and a client who said they did not know have told us the same
 * thing about the building — nothing — and a screen that drew the two
 * differently would invite somebody to treat the blank one as "no".
 */
export function priorClaimPosition(v: string | null): Reading {
  if (v === 'YES' || v === 'NO') return { known: true, value: v, label: PRIOR_CLAIM[v] ?? v };
  return {
    known: false, value: null,
    label: 'not known — nobody has established whether allowances were claimed on this property before',
  };
}

/**
 * THE ONLY READING A GATE MAY USE. A prior claim restricts what can be claimed
 * now, so "there was none" is the favourable answer — and it is true on a
 * recorded NO and on NOTHING ELSE. Never-asked is not a pass; UNKNOWN is not a
 * pass. test/crm.test.ts asserts both, and asserts that NO alone passes.
 */
export function priorClaimRuledOut(v: string | null): boolean {
  return priorClaimPosition(v).value === 'NO';
}

/** A prior-claim reading with where it came from. `derived` means the store refuses a recorded one. */
export type PriorClaimFact = Reading & { readonly derived: boolean; readonly source: string | null };

export const PRIOR_CLAIM_SOURCE = 'the client’s own answer in the assessment';

/**
 * THE PRIOR-CLAIM POSITION, DERIVED WHERE THE FUNNEL'S OWN ANSWER SETTLES IT — the CRM follow-on, row 28.3.
 *
 * READ AGAINST src/web/funnel-session.ts's NOT MAPPED LIST, AND IT MAPS ONE ANSWER ONLY. The funnel's Q1 asks, in the
 * site's own words, "Have you already made a capital allowances claim on the fixtures in this building — the plant,
 * wiring, heating and similar?", and its help text excludes equipment the client could take with them and ordinary
 * repairs. A "yes" to that states the fact this field records — allowances were claimed on the building before — so it is
 * derived as YES, and the store then refuses a recorded answer, as the jurisdiction's is. It is also the cautious
 * direction: YES rules nothing out and relieves nobody.
 *
 * NOTHING ELSE IS MAPPED, AND NOTHING EVER DERIVES "NO":
 *   · Q1 "no" is the client's own claim alone, and this field is about the building, whoever owned it.
 *   · Q1a asks "Do you know whether a previous owner ever claimed on them?" — its yes and its no answer whether the client
 *     KNOWS, and the NOT MAPPED list already leaves it unmapped on the engine side.
 *   · "not sure" and a question never asked set nothing, through the same draft the engine session reads, so they read
 *     identically and neither rules a prior claim out (N4).
 *   · ONE PROPERTY ONLY. Q1 is asked once, before the properties; with several, which building it was about is not
 *     stated — the decision funnel-session.ts takes for Q2 — so nothing is derived. And the property must be the one the
 *     funnel wrote, by the label `submit()` gave it.
 *   · THE DRAFT, NOT THE ANSWER ROWS: `assessment_answers.question_id` is not one vocabulary (the seed's Q1 is another
 *     question), so a seeded or imported assessment derives nothing.
 */
export function derivedPriorClaim(db: Db, p: { business_id: string; label: string }): { value: 'YES'; source: string } | null {
  const latest = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [p.business_id]);
  if (latest === undefined) return null;
  const state = funnelStateFor(db, latest.id);
  if (state === undefined) return null;
  const properties = Array.isArray(state['properties']) ? (state['properties'] as Record<string, unknown>[]) : [];
  if (properties.length !== 1) return null;
  const address = properties[0]?.['address'];
  const label = typeof address === 'string' ? address : 'Unnamed property';
  if (label !== p.label) return null;
  return state['own_prior_claim'] === 'yes' ? { value: 'YES', source: PRIOR_CLAIM_SOURCE } : null;
}

/** THE READING A PAGE AND A GATE USE — derived where the client's answer settles it, else as staff recorded it. */
export function priorClaimFor(db: Db, p: { business_id: string; label: string; existing_ca_claimed: string | null }): PriorClaimFact {
  const d = derivedPriorClaim(db, p);
  if (d !== null) return { known: true, value: d.value, label: `${PRIOR_CLAIM[d.value] ?? d.value} — ${d.source}`, derived: true, source: d.source };
  const r = priorClaimPosition(p.existing_ca_claimed);
  return { ...r, derived: false, source: r.known ? 'recorded by staff' : null };
}

/** The one reading a gate may use, on the property itself: true on a recorded NO and nothing else — a derived answer is never NO. */
export function priorClaimRuledOutFor(db: Db, p: { business_id: string; label: string; existing_ca_claimed: string | null }): boolean {
  return priorClaimFor(db, p).value === 'NO';
}

export function tenureReading(v: string | null): Reading {
  if (v === 'FREEHOLD' || v === 'LEASEHOLD') return { known: true, value: v, label: TENURES[v] ?? v };
  return { known: false, value: null, label: 'not known' };
}

export function decisionMakerReading(v: number | null): Reading {
  if (v === 1) return { known: true, value: 'yes', label: 'Yes' };
  if (v === 0) return { known: true, value: 'no', label: 'No' };
  return { known: false, value: null, label: 'not recorded' };
}

/**
 * A COMPANY DESIGNATION AT THE END OF A NAME. A registered company is required
 * to carry one (Limited, LLP, plc, CIC, and their Welsh forms); a person's name
 * does not. That is the whole test and it is deliberately a refusal rather than
 * a guess: a value that is neither a designated company name nor a role token
 * is refused, so the store cannot be talked into holding a person's name.
 */
const COMPANY_DESIGNATION =
  /(?:^|\s)(?:limited|ltd\.?|llp|l\.l\.p\.|plc|p\.l\.c\.|cic|c\.i\.c\.|community interest company|cyfyngedig|cyf\.?|ccc|c\.c\.c\.|unlimited|nhs foundation trust|nhs trust|council)$/i;

export function isCompanyOrRoleToken(raw: string): boolean {
  const v = raw.trim();
  if (v === '') return false;
  if (Object.hasOwn(OWNER_ROLE_TOKENS, v)) return true;
  return v.length >= 4 && COMPANY_DESIGNATION.test(v);
}

/* ================================================================== *
 * 3 · SMALL VALIDATORS — each returns a sentence, never throws
 * ================================================================== */

/** PHASE 133d (D4): `field` is the posted name a refusal is about, where it is about one. */
type Check<T> = { ok: true; value: T } | { ok: false; why: string; field?: string };

function textField(v: string | null, max: number, what: string): Check<string | null> {
  if (v === null) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function dateField(v: string | null, what: string): Check<string | null> {
  if (v === null || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))) {
    return { ok: false, why: `${what} must be a date, like 2026-03-31.` };
  }
  return { ok: true, value: t };
}

function vocabField(v: string | null, vocab: Vocab, what: string): Check<string | null> {
  if (v === null || v.trim() === '') return { ok: true, value: null };
  return has(vocab, v.trim()) ? { ok: true, value: v.trim() } : { ok: false, why: `${what} is not one of the choices offered.` };
}

/** Pounds, as a person types them, to integer pence — once, through `toPence`. */
function priceField(v: string | null, what: string): Check<number | null> {
  if (v === null || v.trim() === '') return { ok: true, value: null };
  const cleaned = v.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, why: `${what} must be an amount in pounds.` };
  const pence = toPence(Number(cleaned));
  // A price of nothing is not a price. Zero is refused rather than stored (N4).
  if (pence === null || pence <= 0) return { ok: false, why: `${what} must be more than nothing — leave it blank if it is not known.` };
  return { ok: true, value: pence };
}

function emailField(v: string | null): Check<string | null> {
  const t = textField(v, 254, 'An email address');
  if (!t.ok || t.value === null) return t;
  return /^[^\s@]+@[^\s@]+$/.test(t.value) ? t : { ok: false, why: 'That does not look like an email address.' };
}

function websiteField(v: string | null): Check<string | null> {
  const t = textField(v, 200, 'A website');
  if (!t.ok || t.value === null) return t;
  // A website is shown as text, never as a link, and must look like one.
  return /^https?:\/\/[^\s]+$/i.test(t.value) ? t : { ok: false, why: 'A website starts with https:// or http://.' };
}

/** Takes the posted value where the form carried the field, the stored one where it did not. */
function take<T>(input: Fields, key: string, stored: T, check: (v: string | null) => Check<T>): Check<T> {
  if (!Object.hasOwn(input, key)) return { ok: true, value: stored };
  // PHASE 133d (D4): a refusal names the field it is about, so the form can draw it beside that field.
  const r = check(input[key] ?? null);
  return r.ok ? r : { ...r, field: r.field ?? key };
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => before[k] !== after[k]);
}

function record(
  d: CrmDeps, actor: Actor, kind: AuditKind, object_type: string, object_id: string,
  detail: Record<string, unknown>,
): void {
  d.audit.append({
    at: d.now(), kind, outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type, object_id, detail,
  });
}

function stamp(iso: string | null): string | null {
  return iso === null ? null : localStamp(iso);
}

type Person = { readonly id: string; readonly name: string };

/** Who may own an organisation or a claim: an active ADMIN or SALES user. */
export function ownerChoices(db: Db): Person[] {
  return db.all<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM users WHERE role IN ('ADMIN','SALES') AND disabled_at IS NULL " +
      'ORDER BY display_name ASC',
  ).map((r) => ({ id: r.id, name: r.display_name }));
}

/** Who may be named as a claim's surveyor: an active SURVEYING user. */
export function surveyorChoices(db: Db): Person[] {
  return db.all<{ id: string; display_name: string }>(
    "SELECT id, display_name FROM users WHERE role = 'SURVEYING' AND disabled_at IS NULL " +
      'ORDER BY display_name ASC',
  ).map((r) => ({ id: r.id, name: r.display_name }));
}

function personField(v: string | null, choices: readonly Person[], what: string): Check<string | null> {
  if (v === null || v.trim() === '') return { ok: true, value: null };
  return choices.some((p) => p.id === v) ? { ok: true, value: v } : { ok: false, why: `${what} must be one of the people offered.` };
}

/* ================================================================== *
 * 4 · THE SECTION GATES
 * ================================================================== */

const SECTION = '__crm_section__';

/** Organisations: ADMIN and SALES. A sentinel business, refused to everyone else by the table. */
export function assertOrganisationSection(actor: Actor): void {
  authorise(actor, 'organisation.read', { type: 'business', id: SECTION });
}

/** Properties: its own action, because SURVEYING reaches a property through a job. */
export function assertPropertySection(actor: Actor): void {
  authorise(actor, 'property.enter', { type: 'property', id: SECTION, business_id: SECTION, assigned_surveyor_ids: [] });
}

/** Claims: its own action, for the same reason, and ACCOUNTING is on it. */
export function assertClaimSection(actor: Actor): void {
  authorise(actor, 'claim.enter', { type: 'claim', id: SECTION, business_id: SECTION, assigned_surveyor_ids: [] });
}

/* ================================================================== *
 * 5 · DERIVED FACTS
 * ================================================================== */

/** A fact with where it came from. `derived` means the store will not take a recorded one. */
export type Fact = {
  readonly value: string | null;
  readonly display: string;
  readonly source: string | null;
  readonly derived: boolean;
};

function fact(recorded: string | null, derived: { value: string; source: string } | null, vocab?: Vocab): Fact {
  const show = (v: string): string => (vocab === undefined ? v : words(vocab, v, v));
  if (derived !== null) return { value: derived.value, display: show(derived.value), source: derived.source, derived: true };
  if (recorded !== null) return { value: recorded, display: show(recorded), source: 'recorded by staff', derived: false };
  return { value: null, display: NOT_RECORDED, source: null, derived: false };
}

/** The Companies House register record, where one is held and this actor may read register data. */
function companiesHouse(db: Db, actor: Actor, business_id: string): { name: string | null; number: string | null } | null {
  if (!can(actor, 'register_record.read', { type: 'register_record', id: business_id, business_id })) return null;
  const r = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY' " +
      'ORDER BY obtained_at DESC LIMIT 1',
    [business_id],
  );
  if (r === undefined) return null;
  try {
    const f = JSON.parse(r.fields_json) as Record<string, unknown>;
    const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    return { name: s(f['company_name']), number: s(f['company_number']) };
  } catch {
    return null;
  }
}

/**
 * THE CLAIMANT TYPE THE CLIENT GAVE US, from the funnel's entity answer.
 *
 * DERIVED ONLY WHERE IT IS UNAMBIGUOUS: every property on the latest assessment
 * was ANSWERED, with a key on the list, and they agree. "Not sure", a skipped
 * screen, or two properties held two ways derive nothing — and then, and only
 * then, staff may record it.
 */
function claimantFromAssessment(db: Db, actor: Actor, business_id: string): string | null {
  const latest = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [business_id],
  );
  if (latest === undefined) return null;
  if (!can(actor, 'answer.read', { type: 'answer', id: latest.id, business_id })) return null;
  return claimantFromAnswers(db, latest.id);
}

/**
 * THE CLAIMANT TYPE AS A GATE READS IT — CRM 6 of 10. The same derivation as the
 * organisation page, asked by the server of the records on this request and
 * served to nobody: the amendment window turns on it. Derived where the client's
 * own answer settles it, else as recorded on the organisation, else null.
 * UNKNOWN recorded and never recorded both come back null.
 */
export function claimantTypeForGate(db: Db, business_id: string): { value: string | null; source: string | null } {
  const latest = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [business_id],
  );
  const derived = latest === undefined ? null : claimantFromAnswers(db, latest.id);
  if (derived !== null) return { value: derived, source: 'the client’s own answer in the assessment' };
  const b = db.get<{ claimant_type: string | null }>('SELECT claimant_type FROM businesses WHERE id = ?', [business_id]);
  const recorded = b?.claimant_type ?? null;
  return recorded === null || recorded === 'UNKNOWN' ? { value: null, source: null } : { value: recorded, source: 'recorded on the organisation by staff' };
}

/** A property's jurisdiction and where it came from — CRM 6 of 10, for the facts panel. The same reading the property page shows. */
export function propertyJurisdiction(
  db: Db, property_id: string | null, store?: PostcodeStore | null,
): { value: string | null; label: string; derived: boolean; why: string } {
  if (property_id === null) return { value: null, label: 'not known — no property is recorded on this claim', derived: false, why: 'no property' };
  const p = db.get<{ postcode: string | null; jurisdiction: string | null }>('SELECT postcode, jurisdiction FROM properties WHERE id = ?', [property_id]);
  if (p === undefined) return { value: null, label: 'not known', derived: false, why: 'no property' };
  return jurisdictionOf(p, store);
}

function claimantFromAnswers(db: Db, assessment_id: string): string | null {
  const latest = { id: assessment_id };
  const rows = db.all<{ state: string; value: string | null }>(
    "SELECT state, value FROM assessment_answers WHERE assessment_id = ? AND question_id LIKE 'Q2-%-entity'",
    [latest.id],
  );
  if (rows.length === 0) return null;
  const mapped = rows.map((r) => (r.state === 'ANSWERED' && has(FUNNEL_ENTITY, r.value) ? FUNNEL_ENTITY[r.value] : undefined));
  const first = mapped[0];
  if (first === undefined || mapped.some((m) => m !== first)) return null;
  return first;
}

export type JurisdictionReading = { readonly value: string | null; readonly derived: boolean; readonly why: string };

/**
 * A POSTCODE'S NATION, THROUGH THE EXISTING RESOLVER — or a reason.
 *
 * No served set is passed, on purpose: the nation of a Scottish postcode is a
 * fact whether or not we serve Scotland, and refusing to know it would leave a
 * property's jurisdiction blank precisely where it matters most. The served-
 * jurisdiction refusal belongs to the funnel, which already has it.
 */
export function derivedJurisdiction(postcode: string | null, store: PostcodeStore | null = postcodeStore()): JurisdictionReading {
  if (postcode === null || postcode.trim() === '') return { value: null, derived: false, why: 'no postcode is recorded' };
  if (store === null) {
    return { value: null, derived: false, why: 'the postcode lookup is not switched on yet, so we cannot tell the nation from the postcode' };
  }
  if (POSTCODE_GATE.gated) return { value: null, derived: false, why: 'this lookup waits until our privacy notice is published' };
  try {
    const { nation } = resolveServedAuthority(postcode, { store });
    const j = NATION_TO_JURISDICTION[nation];
    return j === undefined ? { value: null, derived: false, why: 'we could not tell the nation from the postcode' } : { value: j, derived: true, why: '' };
  } catch (e) {
    return { value: null, derived: false, why: (e as Error).message };
  }
}

/* ================================================================== *
 * 6 · CLAIM REFERENCES AND CLAIM ROWS — no authorisation here; callers do it
 * ================================================================== */

/**
 * THE NEXT REFERENCE IN A YEAR'S SERIES — CR-2026-0001 — AND IT IS NEVER GIVEN
 * TWICE. The series row only ever moves forward (a trigger refuses anything
 * else), a claim cannot be deleted, and its reference cannot be changed. Call
 * inside the transaction that inserts the claim.
 */
export function nextClaimRef(db: Db, atIso: string): string {
  const year = Number(atIso.slice(0, 4));
  const r = db.get<{ last_n: number }>(
    'INSERT INTO claim_ref_series (year, last_n) VALUES (?, 1) ' +
      'ON CONFLICT(year) DO UPDATE SET last_n = last_n + 1 RETURNING last_n',
    [year],
  );
  if (r === undefined) throw new Error('the claim reference series did not advance');
  return `CR-${String(year)}-${String(r.last_n).padStart(4, '0')}`;
}

export type ClaimInsert = {
  business_id: string;
  property_id: string | null;
  assessment_id: string | null;
  workstream: string;
  stage: string | null;
  owner_id: string | null;
  surveyor_id: string | null;
};

/** Writes one claim. A converted lead (`convertLead`), the seed and `openClaim` are the three callers. */
export function insertClaim(db: Db, now: () => string, newId: () => string, c: ClaimInsert): { id: string; claim_ref: string } {
  const at = now();
  const claim_ref = nextClaimRef(db, at);
  const id = newId();
  db.run(
    'INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, ' +
      'owner_id, surveyor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage,
      c.owner_id, c.surveyor_id, at, at],
  );
  return { id, claim_ref };
}

/**
 * MIGRATION 009's BACKFILL, FOR ONE BUSINESS — the same derivation, column by
 * column, so a business seeded after the migration ran looks exactly like one
 * the migration found. Read the comment above that INSERT for why each is so.
 */
export function backfillClaimFor(db: Db, now: () => string, newId: () => string, business_id: string): { id: string; claim_ref: string } {
  const b = db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) throw new Error('backfillClaimFor: no such business');
  const property = db.get<{ id: string }>(
    'SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [business_id]);
  const assessment = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [business_id]);
  const sealed = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM estimates WHERE business_id = ?', [business_id]);
  const job = db.get<{ surveyor_id: string }>(
    'SELECT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL ' +
      'ORDER BY created_at DESC LIMIT 1', [business_id]);
  // CRM 2 of 10: the business's six-key stage, as the procedure stage it names,
  // placed no later than its records evidence — migration 010's conversion.
  const legacy = stageOf(b.stage)?.key ?? null;
  const placed = legacy === null
    ? null : placeLegacyStage(db, business_id, assessment?.id ?? null, LEGACY_STAGE_TO_PROCEDURE[legacy]);
  const made = insertClaim(db, now, newId, {
    business_id,
    property_id: property?.id ?? null,
    assessment_id: assessment?.id ?? null,
    workstream: (sealed?.n ?? 0) > 0 ? 'PLANT_AND_MACHINERY' : 'UNKNOWN',
    stage: placed,
    owner_id: null,
    surveyor_id: job?.surveyor_id ?? null,
  });
  if (assessment !== undefined) {
    db.run('UPDATE surveyor_jobs SET claim_id = ? WHERE business_id = ? AND assessment_id = ? AND claim_id IS NULL',
      [made.id, business_id, assessment.id]);
  }
  if (placed !== null) {
    db.run(
      'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
        "VALUES (?, ?, ?, NULL, NULL, 'CONVERTED', ?, ?, NULL, ?)",
      [newId(), made.id, now(), legacy, placed,
        'moved over from the old stage list, at the step its records show'],
    );
  }
  return made;
}

/**
 * MIGRATION 010's PLACEMENT, FOR ONE CLAIM. The procedure stage an old key
 * names, moved EARLIER to the last stage its records can evidence — and only
 * ever earlier. It opens nothing, and it asks the same records the gates ask:
 * `assertSignedEngagement` for the engagement, a commitment for the survey, and
 * the sign-off, which no claim has yet.
 */
export function placeLegacyStage(
  db: Db, business_id: string, assessment_id: string | null, named: ProcedureKey,
): ProcedureKey {
  const beyond = (k: ProcedureKey): boolean => procedureIndex(named) > procedureIndex(k);
  if (beyond('ENGAGEMENT') && !assertSignedEngagement(db, business_id).signed) return 'ENGAGEMENT';
  if (beyond('SURVEY')) {
    const committed = assessment_id !== null && db.get<{ n: number }>(
      'SELECT 1 AS n FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id WHERE j.assessment_id = ? LIMIT 1',
      [assessment_id]) !== undefined;
    if (!committed) return 'SURVEY';
  }
  if (beyond('TAX_ADVISER_SIGNOFF')) return 'TAX_ADVISER_SIGNOFF';
  return named;
}

/* ================================================================== *
 * 7 · THE CLAIM — objects, value, summary
 * ================================================================== */

export type ClaimDbRow = {
  id: string; claim_ref: string; business_id: string; property_id: string | null; assessment_id: string | null;
  workstream: string; stage: string | null; owner_id: string | null; surveyor_id: string | null;
  priority: string | null; next_action: string | null; next_action_due: string | null;
  hold_reason: string | null; lost_reason: string | null; expected_completion: string | null;
  created_at: string; updated_at: string;
  hold_return_stage: string | null; tax_adviser_signoff_at: string | null;
  business_name: string; owner_name: string | null; surveyor_name: string | null; property_label: string | null;
  /** Phase 134: a claim is named by its company and its property, and a tile shows the property's town. */
  property_town: string | null;
};

const CLAIM_SELECT =
  'SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, ' +
  'c.owner_id, c.surveyor_id, c.priority, ' +
  // CRM 3 of 10: a claim's next action is its flagged open staff task (migration 012). The retired columns are never read.
  "(SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, " +
  'c.hold_reason, c.lost_reason, ' +
  'c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, ' +
  'b.name AS business_name, ' +
  'o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id ' +
  'LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id ' +
  'LEFT JOIN properties p ON p.id = c.property_id ';

/**
 * WHO REACHES A CLAIM THROUGH A SURVEY JOB: the surveyors assigned to a job ON
 * THIS CLAIM. CRM 2 of 10 gave `surveyor_jobs` a `claim_id` (migration 010,
 * disposition Part E, row E5) and this reads it — no longer the claim's
 * assessment, so two claims sharing an organisation's assessment cannot share a
 * surveyor by accident. A claim with no job on it is reachable by no surveyor,
 * and its page says so. `claims.surveyor_id` is not read here.
 */
function claimSurveyors(db: Db, claim_id: string): string[] {
  return db.all<{ surveyor_id: string }>(
    'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL',
    [claim_id],
  ).map((r) => r.surveyor_id);
}

/** The claim as `can()` is asked about it. Exported for src/web/pipeline.ts, which moves it. */
export function claimObjFor(db: Db, r: { id: string; business_id: string }): Extract<Obj, { type: 'claim' }> {
  return { type: 'claim', id: r.id, business_id: r.business_id, assigned_surveyor_ids: claimSurveyors(db, r.id) };
}

/** The seven sealed fields, named exactly as `estimates` names them. */
export type SealedEstimate = {
  readonly qualifying_expenditure_pence: number;
  readonly qualifying_pct: number;
  readonly pool_split_main_pence: number;
  readonly pool_split_special_pence: number;
  readonly bare_land_pence: number;
  readonly multiplier: number;
  readonly indicative_lifetime_saving_pence: number;
};

export type ClaimValue =
  | {
      readonly established: true;
      readonly shown_range: string;
      readonly qualifying_expenditure: string;
      readonly indicative_lifetime_saving: string;
      readonly estimate: SealedEstimate;
    }
  | { readonly established: false; readonly why: string };

/**
 * THE CLAIM VALUE — READ ONLY AFTER `claim.read_value` HAS SAID YES. Every
 * caller checks first and does not call this otherwise; that is what "built
 * forwards" means in practice, and the payload proof is the evidence.
 */
function claimValue(db: Db, assessment_id: string | null): ClaimValue {
  if (assessment_id === null) {
    return { established: false, why: 'this claim carries no assessment, so there is no indicative estimate for it yet' };
  }
  const e = db.get<SealedEstimate>(
    'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
      'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates WHERE assessment_id = ?',
    [assessment_id],
  );
  if (e === undefined) return { established: false, why: 'no estimate has been locked for this claim’s assessment' };
  const a = db.get<{ shown_low_pence: number | null; shown_high_pence: number | null }>(
    'SELECT shown_low_pence, shown_high_pence FROM assessments WHERE id = ?', [assessment_id]);
  return {
    established: true,
    shown_range: formatShownRange({ low_pence: a?.shown_low_pence ?? null, high_pence: a?.shown_high_pence ?? null }),
    qualifying_expenditure: formatPence(e.qualifying_expenditure_pence),
    indicative_lifetime_saving: formatPence(e.indicative_lifetime_saving_pence),
    estimate: {
      qualifying_expenditure_pence: e.qualifying_expenditure_pence,
      qualifying_pct: e.qualifying_pct,
      pool_split_main_pence: e.pool_split_main_pence,
      pool_split_special_pence: e.pool_split_special_pence,
      bare_land_pence: e.bare_land_pence,
      multiplier: e.multiplier,
      indicative_lifetime_saving_pence: e.indicative_lifetime_saving_pence,
    },
  };
}

/** The claim's stage in the procedure's words — CRM 2 of 10. Unrecognised says so (N4). */
function stageReading(key: string | null): { readonly key: string | null; readonly label: string } {
  const s = claimStage(key);
  return { key: s.key, label: s.label };
}

/** A claim as a line on an organisation or a property page. */
export type ClaimSummary = {
  readonly id: string;
  readonly claim_ref: string;
  /** Phase 134: the company the claim belongs to, and its property — a claim is named by these, never by its reference. */
  readonly business_id: string;
  readonly property: string | null;
  readonly town: string | null;
  readonly workstream: string;
  readonly stage: string;
  /** UI tidy phase 7: the stored stage, for its colour. */
  readonly stage_key: string | null;
  readonly next_action: string | null;
  readonly next_action_due: string | null;
  readonly value?: ClaimValue;
};

function summaryOf(db: Db, actor: Actor, r: ClaimDbRow): ClaimSummary {
  const base = {
    id: r.id, claim_ref: r.claim_ref, business_id: r.business_id, property: r.property_label, town: r.property_town,
    workstream: words(WORKSTREAMS, r.workstream, r.workstream),
    stage: stageReading(r.stage).label, stage_key: r.stage,
    next_action: r.next_action, next_action_due: r.next_action_due,
  };
  return can(actor, 'claim.read_value', claimObjFor(db,r)) ? { ...base, value: claimValue(db, r.assessment_id) } : base;
}

/* ================================================================== *
 * 8 · ORGANISATIONS
 * ================================================================== */

type BusinessDbRow = {
  id: string; name: string; sector: string; stage: string; created_at: string;
  legal_name: string | null; company_number: string | null; claimant_type: string | null;
  registered_address: string | null; trading_address: string | null; website: string | null;
  client_status: string; source: string | null; owner_id: string | null; updated_at: string | null;
  owner_name: string | null;
};

const BUSINESS_SELECT =
  'SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, ' +
  'b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, ' +
  'u.display_name AS owner_name FROM businesses b LEFT JOIN users u ON u.id = b.owner_id ';

function organisationFacts(db: Db, actor: Actor, b: BusinessDbRow): { legal_name: Fact; company_number: Fact; claimant_type: Fact } {
  const ch = companiesHouse(db, actor, b.id);
  const claimant = claimantFromAssessment(db, actor, b.id);
  return {
    legal_name: fact(b.legal_name, ch?.name ? { value: ch.name, source: 'the Companies House register record' } : null),
    company_number: fact(b.company_number, ch?.number ? { value: ch.number, source: 'the Companies House register record' } : null),
    claimant_type: fact(b.claimant_type,
      claimant === null ? null : { value: claimant, source: 'the client’s own answer in the assessment' }, CLAIMANT_TYPES),
  };
}

export type OrganisationRow = {
  readonly id: string;
  readonly trading_name: string;
  readonly legal_name: string;
  readonly sector: string;
  readonly claimant_type: string;
  readonly client_status: string;
  readonly do_not_contact: boolean;
  readonly owner: string | null;
  readonly properties: number;
  readonly claims: number;
};

export function organisationList(db: Db, actor: Actor, limit = 200): OrganisationRow[] {
  assertOrganisationSection(actor);
  return db.all<BusinessDbRow>(`${BUSINESS_SELECT}ORDER BY b.name ASC LIMIT ?`, [limit])
    .filter((b) => can(actor, 'organisation.read', { type: 'business', id: b.id }))
    .map((b) => {
      const f = organisationFacts(db, actor, b);
      return {
        id: b.id, trading_name: b.name, legal_name: f.legal_name.display, sector: b.sector,
        claimant_type: f.claimant_type.value === null ? 'not known' : f.claimant_type.display,
        client_status: words(CLIENT_STATUSES, b.client_status, b.client_status),
        do_not_contact: b.client_status === 'DO_NOT_CONTACT',
        owner: b.owner_name,
        properties: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM properties WHERE business_id = ?', [b.id])?.n ?? 0,
        claims: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', [b.id])?.n ?? 0,
      };
    });
}

export type ContactView = {
  readonly id: string;
  readonly full_name: string;
  readonly job_title: string | null;
  readonly contact_type: Reading;
  readonly is_decision_maker: Reading;
  readonly email: string | null;
  readonly phone: string | null;
  /**
   * CRM 3 of 10 — DERIVED FROM THE TIMELINE (row 5.11), by `lastContactFor` in
   * src/web/timeline.ts. Null, with the words "no contact recorded", where
   * nothing shows one — a cancelled call and silence read the same.
   */
  readonly last_contact_at: string | null;
  readonly last_contact: string;
  /** CRM 3 of 10 — the earliest open follow-up task naming the contact (row 5.12). The retired column is never read. */
  readonly next_follow_up_at: string | null;
  readonly follow_ups_open: number;
  readonly notes: string | null;
  readonly consent: { readonly contact: boolean; readonly marketing: boolean };
};

export type PropertyRow = {
  readonly id: string;
  readonly label: string;
  readonly postcode: string | null;
  readonly business_id: string;
  readonly business_name: string;
  readonly jurisdiction: string;
  readonly claims: number;
};

export type OrganisationView = {
  readonly id: string;
  readonly trading_name: string;
  readonly sector: string;
  readonly legal_name: Fact;
  readonly company_number: Fact;
  readonly claimant_type: Fact;
  readonly registered_address: string | null;
  readonly trading_address: string | null;
  readonly website: string | null;
  readonly client_status: { readonly value: string; readonly label: string; readonly do_not_contact: boolean };
  readonly source: { readonly value: string | null; readonly label: string };
  readonly owner: Person | null;
  readonly updated: string | null;
  readonly contacts: readonly ContactView[] | null;
  readonly properties: readonly PropertyRow[];
  readonly claims: readonly ClaimSummary[];
  /** CRM 9 of 10: every document of the organisation the reader may read, each asked of `document.read`. */
  readonly documents: PlaceDocumentsPanel;
  /**
   * THE CRM FOLLOW-ON, row 4.12: the firms that referred this organisation, READ THROUGH ITS LEADS — the join the claims
   * list already makes. Never a column on the organisation and never typed. Each firm is asked of `introducer.read`;
   * absent for a reader who may read no firm.
   */
  readonly referred_by?: readonly { readonly id: string; readonly firm_name: string; readonly leads: number; readonly href: string }[];
  readonly may_write: boolean;
  readonly owner_choices: readonly Person[];
};

function loadBusiness(db: Db, id: string): BusinessDbRow {
  const b = db.get<BusinessDbRow>(`${BUSINESS_SELECT}WHERE b.id = ?`, [id]);
  // A missing row and a forbidden row look the same from outside.
  if (b === undefined) throw new NotFoundAsRefusal();
  return b;
}

export function organisationView(db: Db, actor: Actor, id: string): OrganisationView {
  assertOrganisationSection(actor);
  const b = loadBusiness(db, id);
  authorise(actor, 'organisation.read', { type: 'business', id: b.id });
  const f = organisationFacts(db, actor, b);
  const mayWrite = can(actor, 'organisation.write', { type: 'business', id: b.id });
  const contactObj = { type: 'contact' as const, id: b.id, business_id: b.id };
  return {
    id: b.id, trading_name: b.name, sector: b.sector,
    legal_name: f.legal_name, company_number: f.company_number, claimant_type: f.claimant_type,
    registered_address: b.registered_address, trading_address: b.trading_address, website: b.website,
    client_status: {
      value: b.client_status, label: words(CLIENT_STATUSES, b.client_status, b.client_status),
      do_not_contact: b.client_status === 'DO_NOT_CONTACT',
    },
    source: { value: b.source, label: vocabLabel(db, 'LEAD_SOURCE', b.source, NOT_RECORDED) },
    owner: b.owner_id === null ? null : { id: b.owner_id, name: b.owner_name ?? 'a former user' },
    updated: stamp(b.updated_at),
    contacts: can(actor, 'contact.read', contactObj) ? contactsFor(db, actor, b.id) : null,
    properties: propertyRowsFor(db, actor, b.id),
    claims: db.all<ClaimDbRow>(`${CLAIM_SELECT}WHERE c.business_id = ? ORDER BY c.claim_ref ASC`, [b.id])
      .filter((r) => can(actor, 'claim.read', claimObjFor(db,r)))
      .map((r) => summaryOf(db, actor, r)),
    documents: organisationDocumentsPanel(db, actor, b.id),
    ...referredBy(db, actor, b.id),
    may_write: mayWrite,
    owner_choices: mayWrite ? ownerChoices(db) : [],
  };
}

/** The firms whose referrals became this organisation's leads, each asked of `introducer.read`. Derived, never recorded. */
function referredBy(db: Db, actor: Actor, business_id: string): { referred_by?: NonNullable<OrganisationView['referred_by']> } {
  if (!can(actor, 'introducer.read', { type: 'introducer', id: '__organisation__' })) return {};
  const firms = db.all<{ id: string; firm_name: string; n: number }>(
    'SELECT i.id, i.firm_name, COUNT(l.id) AS n FROM leads l JOIN introducers i ON i.id = l.introducer_id ' +
      'WHERE l.business_id = ? GROUP BY i.id, i.firm_name ORDER BY i.firm_name ASC, i.id ASC',
    [business_id],
  ).filter((f) => can(actor, 'introducer.read', { type: 'introducer', id: f.id }))
    .map((f) => ({ id: f.id, firm_name: f.firm_name, leads: f.n, href: `/staff/introducers/${f.id}` }));
  return { referred_by: firms };
}

/**
 * CHANGE AN ORGANISATION. Only the fields the form carried are touched.
 *
 * A DERIVED FACT IS NOT TAKEN FROM A FORM. Where a Companies House record gives
 * the legal name or the number, or the client's own answer gives the claimant
 * type, a recorded value is refused with the reason — the question has been
 * answered, by a better source, and asking it again is how two answers come to
 * disagree.
 */
export function updateOrganisation(d: CrmDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const b = loadBusiness(d.db, id);
  authorise(actor, 'organisation.write', { type: 'business', id: b.id });
  const f = organisationFacts(d.db, actor, b);
  for (const [key, fct, what] of [
    ['legal_name', f.legal_name, 'The legal name'],
    ['company_number', f.company_number, 'The company number'],
    ['claimant_type', f.claimant_type, 'The claimant type'],
  ] as const) {
    const posted = input[key];
    if (fct.derived && posted !== undefined && posted !== null && posted.trim() !== '') {
      return { ok: false, why: `${what} is already known from ${fct.source ?? 'a better source'}, so it is not asked again.`, field: key };
    }
  }

  const legal = take(input, 'legal_name', b.legal_name, (v) => textField(v, 300, 'The legal name'));
  const number = take(input, 'company_number', b.company_number, (v) => textField(v, 20, 'The company number'));
  const claimant = take(input, 'claimant_type', b.claimant_type, (v) => vocabField(v, CLAIMANT_TYPES, 'The claimant type'));
  const reg = take(input, 'registered_address', b.registered_address, (v) => textField(v, 500, 'The registered address'));
  const trading = take(input, 'trading_address', b.trading_address, (v) => textField(v, 500, 'The trading address'));
  const web = take(input, 'website', b.website, websiteField);
  const status = take(input, 'client_status', b.client_status as string | null, (v) => vocabField(v, CLIENT_STATUSES, 'The client status'));
  // CRM 9 of 10: the lead-source list is configurable, and read from the table the trigger reads.
  const source = take(input, 'source', b.source, (v) => vocabChoice(d.db, 'LEAD_SOURCE', v, b.source, 'The source'));
  const owner = take(input, 'owner_id', b.owner_id, (v) => personField(v, ownerChoices(d.db), 'The owner'));
  for (const c of [legal, number, claimant, reg, trading, web, status, source, owner]) if (!c.ok) return c;
  if (!legal.ok || !number.ok || !claimant.ok || !reg.ok || !trading.ok || !web.ok || !status.ok || !source.ok || !owner.ok) {
    return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  }
  if (status.value === null) return { ok: false, why: 'Choose a client status — it cannot be blank.', field: 'client_status' };

  const before = {
    legal_name: b.legal_name, company_number: b.company_number, claimant_type: b.claimant_type,
    registered_address: b.registered_address, trading_address: b.trading_address, website: b.website,
    client_status: b.client_status, source: b.source, owner_id: b.owner_id,
  };
  const after = {
    legal_name: legal.value, company_number: number.value, claimant_type: claimant.value,
    registered_address: reg.value, trading_address: trading.value, website: web.value,
    client_status: status.value, source: source.value, owner_id: owner.value,
  };
  const changed = changedKeys(before, after);
  if (changed.length === 0) return { ok: true, id: b.id };
  d.db.run(
    'UPDATE businesses SET legal_name = ?, company_number = ?, claimant_type = ?, registered_address = ?, ' +
      'trading_address = ?, website = ?, client_status = ?, source = ?, owner_id = ?, updated_at = ? WHERE id = ?',
    [after.legal_name, after.company_number, after.claimant_type, after.registered_address, after.trading_address,
      after.website, after.client_status, after.source, after.owner_id, d.now(), b.id],
  );
  // WHICH fields changed, never what they now say. The status itself is a
  // control, not personal data, so it is named when it moves.
  record(d, actor, 'ORGANISATION_UPDATED', 'business', b.id, {
    fields: changed, ...(changed.includes('client_status') ? { client_status: after.client_status } : {}),
  });
  return { ok: true, id: b.id };
}

/* ================================================================== *
 * 9 · CONTACTS — the client's own, never a user
 * ================================================================== */

type ContactDbRow = {
  id: string; business_id: string; full_name: string; job_role: string | null; job_role_other: string | null;
  contact_consent: number; marketing_optin: number; contact_type: string | null; is_decision_maker: number | null;
  email: string | null; phone: string | null; last_contact_at: string | null; next_follow_up_at: string | null;
  notes: string | null;
};

const CONTACT_SELECT =
  'SELECT id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, contact_type, ' +
  'is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes FROM contacts ';

function lastAndNext(db: Db, r: ContactDbRow): {
  last_contact_at: string | null; last_contact: string; next_follow_up_at: string | null; follow_ups_open: number;
} {
  const last = lastContactFor(db, { id: r.id, email: r.email, last_contact_at: r.last_contact_at });
  const next = followUpsFor(db, r.id);
  return { last_contact_at: last.at, last_contact: last.label, next_follow_up_at: next.due_on, follow_ups_open: next.count };
}

function contactView(db: Db, r: ContactDbRow): ContactView {
  return {
    id: r.id, full_name: r.full_name,
    job_title: r.job_role_other ?? (r.job_role === null ? null : r.job_role.replace(/_/g, ' ')),
    contact_type: has(CONTACT_TYPES, r.contact_type)
      ? { known: true, value: r.contact_type, label: CONTACT_TYPES[r.contact_type] ?? r.contact_type }
      : { known: false, value: null, label: 'not recorded' },
    is_decision_maker: decisionMakerReading(r.is_decision_maker),
    email: r.email, phone: r.phone,
    ...lastAndNext(db, r),
    notes: r.notes,
    consent: { contact: r.contact_consent === 1, marketing: r.marketing_optin === 1 },
  };
}

export function contactsFor(db: Db, actor: Actor, business_id: string): ContactView[] {
  authorise(actor, 'contact.read', { type: 'contact', id: business_id, business_id });
  return db.all<ContactDbRow>(`${CONTACT_SELECT}WHERE business_id = ? ORDER BY full_name ASC, id ASC`, [business_id])
    .map((r) => contactView(db, r));
}

type ContactValues = {
  full_name: string; job_role_other: string | null; contact_type: string | null; is_decision_maker: number | null;
  email: string | null; phone: string | null;
  notes: string | null;
};

function contactValues(input: Fields, stored: ContactValues): Check<ContactValues> {
  // CRM 3 of 10 (rows 5.11 and 5.12): neither is typed in any more, and the database refuses both.
  if (Object.hasOwn(input, 'last_contact_at') || Object.hasOwn(input, 'next_follow_up_at')) {
    return {
      ok: false,
      why: 'The last contact comes from the timeline. A follow-up is a task that names the contact. Neither is typed in here.',
    };
  }
  const name = take(input, 'full_name', stored.full_name as string | null, (v) => textField(v, 200, 'A name'));
  const title = take(input, 'job_title', stored.job_role_other, (v) => textField(v, 200, 'A job title'));
  const type = take(input, 'contact_type', stored.contact_type, (v) => vocabField(v, CONTACT_TYPES, 'The contact type'));
  const dm = take(input, 'is_decision_maker', stored.is_decision_maker, (v): Check<number | null> =>
    v === 'yes' ? { ok: true, value: 1 } : v === 'no' ? { ok: true, value: 0 }
      : v === null || v === '' ? { ok: true, value: null } : { ok: false, why: 'Decision maker is yes, no, or not recorded.' });
  const email = take(input, 'email', stored.email, emailField);
  const phone = take(input, 'phone', stored.phone, (v) => textField(v, 40, 'A telephone number'));
  const notes = take(input, 'notes', stored.notes, (v) => textField(v, 8000, 'The notes'));
  for (const c of [name, title, type, dm, email, phone, notes]) if (!c.ok) return c;
  if (!name.ok || !title.ok || !type.ok || !dm.ok || !email.ok || !phone.ok || !notes.ok) {
    return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  }
  // PHASE 154a1 (line 2): a NEW contact starts from a stored name of '', so a post with no full_name field at all kept
  // that '' and passed a check for null alone - the 3 October sweep added a nameless contact that way. Blank is no name.
  if (name.value === null || name.value.trim() === '') return { ok: false, why: 'A contact is a person, and needs a name.', field: 'full_name' };
  return {
    ok: true,
    value: {
      full_name: name.value, job_role_other: title.value, contact_type: type.value, is_decision_maker: dm.value,
      email: email.value, phone: phone.value,
      notes: notes.value,
    },
  };
}

/**
 * PHASE 151e (line 6), 28 September 2026 — CONTACT DETAILS ARE NOT OPTIONAL. Lakhbir: "we must get contact details, it
 * is a non negotiable". A client must have at least one contact with an email address or a telephone number:
 *   - a client saved from the website cannot be saved without one (the funnel's close, src/web/router.ts);
 *   - a change here that would leave a client with no contact we can reach is refused (`updateContact`);
 *   - a client that has none is flagged on its page until it does (src/web/client-page.ts); and
 *   - an identity check goes only to a contact who has one (src/web/identity-checks.ts).
 * A contact added here may still lack both: the rule is about the client, and the flag stays until one has them.
 */
export const NO_WAY_TO_REACH_WORDS = 'We must have a way to reach this client: a contact with an email address or a telephone number.';
export const LAST_WAY_TO_REACH_WORDS =
  'This is the only way we have to reach this client. Keep an email address or a telephone number, or add another contact who has one first.';

/** Whether a contact has an email address or a telephone number. Blank is not a value. */
export function isReachable(c: { readonly email: string | null; readonly phone: string | null }): boolean {
  return (c.email ?? '').trim() !== '' || (c.phone ?? '').trim() !== '';
}

/** How many of a client's contacts we can reach, leaving out one contact when asked (the one being changed). */
export function reachableContacts(db: CrmDeps['db'], business_id: string, leaving_out: string | null = null): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM contacts WHERE business_id = ? AND id IS NOT ? AND (TRIM(COALESCE(email, '')) <> '' OR TRIM(COALESCE(phone, '')) <> '')",
    [business_id, leaving_out])?.n ?? 0;
}

/**
 * ADD A CONTACT TO AN ORGANISATION.
 *
 * NO CONSENT IS INVENTED. A contact typed in by staff did not tick the funnel
 * close's per-channel consent, so both consent columns are recorded as not
 * given — the cautious reading, and the true one. A client's accountant added
 * here is a contact and nothing more: there is no route from this row to a login.
 */
export function addContact(d: CrmDeps, actor: Actor, business_id: string, input: Fields): WriteResult {
  const b = loadBusiness(d.db, business_id);
  authorise(actor, 'contact.write', { type: 'contact', id: b.id, business_id: b.id });
  const v = contactValues(input, {
    full_name: '', job_role_other: null, contact_type: null, is_decision_maker: null, email: null, phone: null,
    notes: null,
  });
  if (!v.ok) return v;
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO contacts (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, ' +
      'created_at, contact_type, is_decision_maker, email, phone, notes, updated_at) ' +
      'VALUES (?, ?, ?, NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)',
    [id, b.id, v.value.full_name, v.value.job_role_other, at, v.value.contact_type, v.value.is_decision_maker,
      v.value.email, v.value.phone, v.value.notes, at],
  );
  record(d, actor, 'CONTACT_CREATED', 'contact', id, { business: b.id, contact_type: v.value.contact_type });
  return { ok: true, id };
}

export function updateContact(d: CrmDeps, actor: Actor, contact_id: string, input: Fields): WriteResult {
  const r = d.db.get<ContactDbRow>(`${CONTACT_SELECT}WHERE id = ?`, [contact_id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'contact.write', { type: 'contact', id: r.id, business_id: r.business_id });
  const stored: ContactValues = {
    full_name: r.full_name, job_role_other: r.job_role_other, contact_type: r.contact_type,
    is_decision_maker: r.is_decision_maker, email: r.email, phone: r.phone, notes: r.notes,
  };
  const v = contactValues(input, stored);
  if (!v.ok) return v;
  const changed = changedKeys(stored, v.value);
  if (changed.length === 0) return { ok: true, id: r.id };
  // PHASE 151e (line 6): never the change that leaves a client with no contact we can reach
  if (r.business_id !== null && isReachable(stored) && !isReachable(v.value) && reachableContacts(d.db, r.business_id, r.id) === 0) {
    return { ok: false, why: LAST_WAY_TO_REACH_WORDS, field: 'email' };
  }
  d.db.run(
    'UPDATE contacts SET full_name = ?, job_role_other = ?, contact_type = ?, is_decision_maker = ?, email = ?, ' +
      'phone = ?, notes = ?, updated_at = ? WHERE id = ?',
    [v.value.full_name, v.value.job_role_other, v.value.contact_type, v.value.is_decision_maker, v.value.email,
      v.value.phone, v.value.notes, d.now(), r.id],
  );
  record(d, actor, 'CONTACT_UPDATED', 'contact', r.id, { business: r.business_id, fields: changed });
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 10 · PROPERTIES
 * ================================================================== */

type PropertyDbRow = {
  id: string; business_id: string; label: string; postcode: string | null; created_at: string;
  address_line_1: string | null; address_line_2: string | null; town: string | null; jurisdiction: string | null;
  property_type: string | null; property_use: string | null; tenure: string | null; occupier: string | null;
  acquisition_date: string | null; acquisition_price_pence: number | null; completion_date: string | null;
  disposal_date: string | null; previous_owner: string | null; construction_notes: string | null;
  existing_ca_claimed: string | null; prior_claim_notes: string | null; updated_at: string | null;
  sale_in_prospect: string | null;
  business_name: string;
};

const PROPERTY_SELECT =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, ' +
  'p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, ' +
  'p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, ' +
  'p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, b.name AS business_name ' +
  'FROM properties p JOIN businesses b ON b.id = p.business_id ';

/**
 * WHO REACHES A PROPERTY THROUGH A SURVEY JOB: the surveyors assigned to a job
 * on the property's organisation. A survey job is keyed to an assessment, which
 * is the organisation's, and the surveyor's payload already carries every one
 * of that organisation's properties — so this is the same reach, not a wider one.
 */
function propertySurveyors(db: Db, business_id: string): string[] {
  return db.all<{ surveyor_id: string }>(
    'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL',
    [business_id],
  ).map((r) => r.surveyor_id);
}

function propertyObj(db: Db, r: { id: string; business_id: string }): Extract<Obj, { type: 'property' }> {
  return { type: 'property', id: r.id, business_id: r.business_id, assigned_surveyor_ids: propertySurveyors(db, r.business_id) };
}

function jurisdictionOf(r: { postcode: string | null; jurisdiction: string | null }, store?: PostcodeStore | null): {
  value: string | null; label: string; derived: boolean; why: string;
} {
  const d = store === undefined ? derivedJurisdiction(r.postcode) : derivedJurisdiction(r.postcode, store);
  if (d.derived && d.value !== null) {
    return { value: d.value, label: `${words(JURISDICTIONS, d.value, d.value)} — worked out from the postcode`, derived: true, why: '' };
  }
  if (r.jurisdiction !== null) {
    return { value: r.jurisdiction, label: `${words(JURISDICTIONS, r.jurisdiction, r.jurisdiction)} — recorded by staff`, derived: false, why: d.why };
  }
  return { value: null, label: 'not known', derived: false, why: d.why };
}

function propertyRowsFor(db: Db, actor: Actor, business_id: string): PropertyRow[] {
  return db.all<PropertyDbRow>(`${PROPERTY_SELECT}WHERE p.business_id = ? ORDER BY p.created_at ASC, p.id ASC`, [business_id])
    .filter((r) => can(actor, 'property.read', propertyObj(db, r)))
    .map((r) => propertyRow(db, actor, r));
}

function propertyRow(db: Db, actor: Actor, r: PropertyDbRow): PropertyRow {
  const claims = db.all<{ id: string; business_id: string; assessment_id: string | null }>(
    'SELECT id, business_id, assessment_id FROM claims WHERE property_id = ?', [r.id],
  ).filter((c) => can(actor, 'claim.read', claimObjFor(db,c))).length;
  return {
    id: r.id, label: r.label, postcode: r.postcode, business_id: r.business_id, business_name: r.business_name,
    jurisdiction: jurisdictionOf(r).label, claims,
  };
}

export function propertyList(db: Db, actor: Actor, limit = 200): PropertyRow[] {
  assertPropertySection(actor);
  return db.all<PropertyDbRow>(`${PROPERTY_SELECT}ORDER BY b.name ASC, p.label ASC LIMIT ?`, [limit])
    .filter((r) => can(actor, 'property.read', propertyObj(db, r)))
    .map((r) => propertyRow(db, actor, r));
}

/** A question the client answered in the assessment, in their own words, with its source. */
export type AssessmentLine = { readonly question: string; readonly answer: string };

/**
 * WHAT THE CLIENT TOLD US ABOUT THIS PROPERTY — SHOWN, NOT MAPPED.
 *
 * The funnel captures a date as a month or a year and a spend as a round
 * figure, and src/web/funnel-session.ts records why neither is parsed into an
 * engine fact. The same discipline applies here: the answer is shown beside the
 * property's own field with its source, and nothing is copied into the field.
 * A property is matched to its funnel answers by the address the funnel wrote
 * as its label; a property added by staff has none, and shows none.
 */
function fromTheAssessment(db: Db, actor: Actor, r: PropertyDbRow): AssessmentLine[] {
  const latest = db.get<{ id: string }>(
    'SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [r.business_id]);
  if (latest === undefined) return [];
  if (!can(actor, 'answer.read', { type: 'answer', id: latest.id, business_id: r.business_id })) return [];
  const rows = db.all<{ question_id: string; question_text: string; state: string; value: string | null }>(
    'SELECT question_id, question_text, state, value FROM assessment_answers WHERE assessment_id = ? ORDER BY ord ASC',
    [latest.id],
  );
  const address = rows.find((a) => /^Q2-\d+-address$/.test(a.question_id) && a.value === r.label);
  const n = address === undefined ? null : /^Q2-(\d+)-address$/.exec(address.question_id)?.[1] ?? null;
  const wanted = (id: string): boolean =>
    id === 'Q1' || id === 'Q1a'
    || (n !== null && (id.startsWith(`Q2-${n}-`) || id.startsWith(`Q3-${n}-`)) && id !== `Q2-${n}-address`);
  return rows.filter((a) => wanted(a.question_id))
    .map((a) => ({ question: a.question_text, answer: answerLabel(a.state, a.value) }));
}

export type PropertyView = {
  readonly id: string;
  readonly label: string;
  readonly business: { readonly id: string; readonly name: string; readonly linkable: boolean };
  readonly address_line_1: string | null;
  readonly address_line_2: string | null;
  readonly town: string | null;
  readonly postcode: string | null;
  readonly jurisdiction: { readonly value: string | null; readonly label: string; readonly derived: boolean; readonly why: string };
  readonly property_type: string | null;
  /** CRM 9 of 10: the type's label from its list — or the text as written, for a type recorded before the list existed. */
  readonly property_type_label: string;
  readonly property_use: string | null;
  readonly tenure: Reading;
  readonly occupier: string | null;
  readonly acquisition_date: string | null;
  readonly acquisition_price: string;
  readonly acquisition_price_pence: number | null;
  readonly completion_date: string | null;
  readonly disposal_date: string | null;
  readonly previous_owner: string | null;
  readonly construction_notes: string | null;
  /** The CRM follow-on: derived from the client's own answer where it settles it — see `derivedPriorClaim`. */
  readonly existing_ca_claimed: PriorClaimFact;
  readonly prior_claim_notes: string | null;
  /** CRM 6 of 10: a sale that is coming. YES raises a task pointing at the Disposal Note; NULL reads as UNKNOWN does. */
  readonly sale_in_prospect: Reading;
  readonly from_the_assessment: readonly AssessmentLine[];
  readonly claims: readonly ClaimSummary[];
  /** CRM 9 of 10: the documents linked to this property the reader may read — for a surveyor, only what `document.read` admits. */
  readonly documents: PlaceDocumentsPanel;
  readonly may_write: boolean;
  readonly may_open_claim: boolean;
};

function ownerWords(v: string | null): string | null {
  return v === null ? null : words(OWNER_ROLE_TOKENS, v, v);
}

function loadProperty(db: Db, id: string): PropertyDbRow {
  const r = db.get<PropertyDbRow>(`${PROPERTY_SELECT}WHERE p.id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

export function propertyView(db: Db, actor: Actor, id: string, opts: { store?: PostcodeStore | null } = {}): PropertyView {
  assertPropertySection(actor);
  const r = loadProperty(db, id);
  const obj = propertyObj(db, r);
  authorise(actor, 'property.read', obj);
  const claimCreate = { type: 'claim' as const, id: r.id, business_id: r.business_id, assigned_surveyor_ids: [] };
  return {
    id: r.id, label: r.label,
    business: { id: r.business_id, name: r.business_name, linkable: can(actor, 'organisation.read', { type: 'business', id: r.business_id }) },
    address_line_1: r.address_line_1, address_line_2: r.address_line_2, town: r.town, postcode: r.postcode,
    jurisdiction: jurisdictionOf(r, opts.store),
    property_type: r.property_type, property_type_label: vocabLabel(db, 'PROPERTY_TYPE', r.property_type, NOT_RECORDED), property_use: r.property_use,
    tenure: tenureReading(r.tenure),
    occupier: ownerWords(r.occupier),
    acquisition_date: r.acquisition_date,
    acquisition_price: r.acquisition_price_pence === null ? NOT_RECORDED : formatPence(r.acquisition_price_pence),
    acquisition_price_pence: r.acquisition_price_pence,
    completion_date: r.completion_date, disposal_date: r.disposal_date,
    previous_owner: ownerWords(r.previous_owner),
    construction_notes: r.construction_notes,
    existing_ca_claimed: priorClaimFor(db, r),
    prior_claim_notes: r.prior_claim_notes,
    sale_in_prospect: r.sale_in_prospect === 'YES' ? { known: true, value: 'YES', label: 'Yes — a sale is coming' }
      : r.sale_in_prospect === 'NO' ? { known: true, value: 'NO', label: 'No' } : { known: false, value: null, label: 'not known' },
    from_the_assessment: fromTheAssessment(db, actor, r),
    claims: db.all<ClaimDbRow>(`${CLAIM_SELECT}WHERE c.property_id = ? ORDER BY c.claim_ref ASC`, [r.id])
      .filter((c) => can(actor, 'claim.read', claimObjFor(db,c)))
      .map((c) => summaryOf(db, actor, c)),
    documents: propertyDocumentsPanel(db, actor, { id: r.id, business_id: r.business_id }),
    may_write: can(actor, 'property.write', obj),
    may_open_claim: can(actor, 'claim.create', claimCreate),
  };
}

export function addProperty(d: CrmDeps, actor: Actor, business_id: string, input: Fields): WriteResult {
  const b = loadBusiness(d.db, business_id);
  authorise(actor, 'property.write', { type: 'property', id: b.id, business_id: b.id, assigned_surveyor_ids: [] });
  const label = textField(input['label'] ?? null, 300, 'The property’s name');
  const postcode = textField(input['postcode'] ?? null, 10, 'A postcode');
  if (!label.ok) return { ...label, field: 'label' };
  if (!postcode.ok) return { ...postcode, field: 'postcode' };
  if (label.value === null) return { ok: false, why: 'Give the property a name a person would recognise — the site or the building.', field: 'label' };
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO properties (id, business_id, label, postcode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, b.id, label.value, postcode.value === null ? null : postcode.value.toUpperCase(), at, at],
  );
  record(d, actor, 'PROPERTY_CREATED', 'property', id, { business: b.id });
  return { ok: true, id };
}

type PropertyValues = {
  label: string; postcode: string | null; address_line_1: string | null; address_line_2: string | null; town: string | null;
  jurisdiction: string | null; property_type: string | null; property_use: string | null; tenure: string | null;
  occupier: string | null; acquisition_date: string | null; acquisition_price_pence: number | null;
  completion_date: string | null; disposal_date: string | null; previous_owner: string | null;
  construction_notes: string | null; existing_ca_claimed: string | null; prior_claim_notes: string | null;
  /** CRM 6 of 10. Read and stored beside the others, and compared on its own: a change to it alone is still a change. */
  sale_in_prospect?: string | null;
};

function companyOrToken(what: string) {
  return (v: string | null): Check<string | null> => {
    const t = textField(v, 300, what);
    if (!t.ok || t.value === null) return t;
    return isCompanyOrRoleToken(t.value)
      ? t
      : {
          ok: false,
          why: `${what} must be a company name. It ends Limited, Ltd, LLP, plc or CIC. ` +
            'Or type a role such as INDIVIDUAL_NOT_RECORDED. Never type a person’s name here.',
        };
  };
}

/**
 * CHANGE A PROPERTY.
 *
 * THE JURISDICTION IS NEVER ASKED TWICE. Where the postcode derives a nation, a
 * recorded one is refused; and where a postcode change makes the nation
 * derivable, the recorded one is cleared, because the derived one now governs
 * and a second, stale answer would sit beside it.
 */
export function updateProperty(
  d: CrmDeps, actor: Actor, id: string, input: Fields, opts: { store?: PostcodeStore | null } = {},
): WriteResult {
  const r = loadProperty(d.db, id);
  authorise(actor, 'property.write', propertyObj(d.db, r));
  const stored: PropertyValues = {
    label: r.label, postcode: r.postcode, address_line_1: r.address_line_1, address_line_2: r.address_line_2,
    town: r.town, jurisdiction: r.jurisdiction, property_type: r.property_type, property_use: r.property_use,
    tenure: r.tenure, occupier: r.occupier, acquisition_date: r.acquisition_date,
    acquisition_price_pence: r.acquisition_price_pence, completion_date: r.completion_date,
    disposal_date: r.disposal_date, previous_owner: r.previous_owner, construction_notes: r.construction_notes,
    existing_ca_claimed: r.existing_ca_claimed, prior_claim_notes: r.prior_claim_notes, sale_in_prospect: r.sale_in_prospect,
  };
  // CRM 6 of 10: a sale that is coming — yes, no or not known. It sits outside the list below and is written on its own.
  const sale = take(input, 'sale_in_prospect', stored.sale_in_prospect, (v) => vocabField(v, PRIOR_CLAIM, 'Whether a sale is in prospect'));
  if (!sale.ok) return sale;
  const label = take(input, 'label', stored.label as string | null, (v) => textField(v, 300, 'The property’s name'));
  const postcode = take(input, 'postcode', stored.postcode, (v) => {
    const t = textField(v, 10, 'A postcode');
    return t.ok && t.value !== null ? { ok: true, value: t.value.toUpperCase() } : t;
  });
  const a1 = take(input, 'address_line_1', stored.address_line_1, (v) => textField(v, 200, 'An address line'));
  const a2 = take(input, 'address_line_2', stored.address_line_2, (v) => textField(v, 200, 'An address line'));
  const town = take(input, 'town', stored.town, (v) => textField(v, 100, 'The town'));
  const jur = take(input, 'jurisdiction', stored.jurisdiction, (v) => vocabField(v, JURISDICTIONS, 'The jurisdiction'));
  // CRM 9 of 10: a property's type is a value on its configurable list; a free-text type recorded before the list is kept as written.
  const ptype = take(input, 'property_type', stored.property_type, (v) => vocabChoice(d.db, 'PROPERTY_TYPE', v, stored.property_type, 'The property type'));
  const puse = take(input, 'property_use', stored.property_use, (v) => textField(v, 100, 'The property use'));
  const tenure = take(input, 'tenure', stored.tenure, (v) => vocabField(v, TENURES, 'The tenure'));
  const occupier = take(input, 'occupier', stored.occupier, companyOrToken('The occupier'));
  const acqDate = take(input, 'acquisition_date', stored.acquisition_date, (v) => dateField(v, 'The acquisition date'));
  const price = take(input, 'acquisition_price', stored.acquisition_price_pence, (v) => priceField(v, 'The acquisition price'));
  const compDate = take(input, 'completion_date', stored.completion_date, (v) => dateField(v, 'The completion date'));
  const dispDate = take(input, 'disposal_date', stored.disposal_date, (v) => dateField(v, 'The disposal date'));
  const prevOwner = take(input, 'previous_owner', stored.previous_owner, companyOrToken('The previous owner'));
  const construction = take(input, 'construction_notes', stored.construction_notes, (v) => textField(v, 8000, 'The construction notes'));
  const prior = take(input, 'existing_ca_claimed', stored.existing_ca_claimed, (v) => vocabField(v, PRIOR_CLAIM, 'Whether allowances were claimed before'));
  const priorNotes = take(input, 'prior_claim_notes', stored.prior_claim_notes, (v) => textField(v, 8000, 'The prior claim notes'));
  const all = [label, postcode, a1, a2, town, jur, ptype, puse, tenure, occupier, acqDate, price, compDate, dispDate,
    prevOwner, construction, prior, priorNotes];
  for (const c of all) if (!c.ok) return c;
  if (!label.ok || !postcode.ok || !a1.ok || !a2.ok || !town.ok || !jur.ok || !ptype.ok || !puse.ok || !tenure.ok
    || !occupier.ok || !acqDate.ok || !price.ok || !compDate.ok || !dispDate.ok || !prevOwner.ok || !construction.ok
    || !prior.ok || !priorNotes.ok) {
    return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  }
  if (label.value === null) return { ok: false, why: 'A property needs a name a person would recognise.' };

  const derived = opts.store === undefined ? derivedJurisdiction(postcode.value) : derivedJurisdiction(postcode.value, opts.store);
  let jurisdiction = jur.value;
  if (derived.derived) {
    const posted = input['jurisdiction'];
    if (posted !== undefined && posted !== null && posted.trim() !== '') {
      return { ok: false, why: 'The jurisdiction is already known from the postcode, so it is not asked again.' };
    }
    jurisdiction = null;
  }
  // THE CRM FOLLOW-ON: the prior-claim position is never asked twice either. Where the client's own answer settles it, a
  // recorded one is refused, and a stored one is cleared — the derived one governs, as the jurisdiction's does.
  let priorClaim = prior.value;
  const priorDerived = derivedPriorClaim(d.db, { business_id: r.business_id, label: label.value });
  if (priorDerived !== null) {
    const posted = input['existing_ca_claimed'];
    if (posted !== undefined && posted !== null && posted.trim() !== '') {
      return {
        ok: false,
        why: `Whether allowances were claimed on this property before is already known from ${priorDerived.source}, so it is not asked again. ` +
          'Anything a review finds about that earlier claim belongs in the prior claim information.',
      };
    }
    priorClaim = null;
  }

  const after: PropertyValues = {
    label: label.value, postcode: postcode.value, address_line_1: a1.value, address_line_2: a2.value, town: town.value,
    jurisdiction, property_type: ptype.value, property_use: puse.value, tenure: tenure.value,
    occupier: occupier.value, acquisition_date: acqDate.value, acquisition_price_pence: price.value,
    completion_date: compDate.value, disposal_date: dispDate.value, previous_owner: prevOwner.value,
    construction_notes: construction.value, existing_ca_claimed: priorClaim, prior_claim_notes: priorNotes.value,
  };
  const saleChanged = sale.value !== stored.sale_in_prospect && Object.hasOwn(input, 'sale_in_prospect');
  const changed = [...changedKeys(stored, after), ...(saleChanged ? ['sale_in_prospect'] : [])];
  if (changed.length === 0) return { ok: true, id: r.id };
  if (saleChanged) d.db.run('UPDATE properties SET sale_in_prospect = ?, updated_at = ? WHERE id = ?', [sale.value ?? null, d.now(), r.id]);
  /* CRM 6 of 10: a disposal date newly set, or a sale newly in prospect, raises the task pointing at the Disposal Note —
     after the write, and once per property while one is open. Never asked and not known raise nothing. */
  const disposalSet = changed.includes('disposal_date') && after.disposal_date !== null;
  const saleComing = saleChanged && sale.value === 'YES';
  d.db.run(
    'UPDATE properties SET label = ?, postcode = ?, address_line_1 = ?, address_line_2 = ?, town = ?, jurisdiction = ?, ' +
      'property_type = ?, property_use = ?, tenure = ?, occupier = ?, acquisition_date = ?, acquisition_price_pence = ?, ' +
      'completion_date = ?, disposal_date = ?, previous_owner = ?, construction_notes = ?, existing_ca_claimed = ?, ' +
      'prior_claim_notes = ?, updated_at = ? WHERE id = ?',
    [after.label, after.postcode, after.address_line_1, after.address_line_2, after.town, after.jurisdiction,
      after.property_type, after.property_use, after.tenure, after.occupier, after.acquisition_date,
      after.acquisition_price_pence, after.completion_date, after.disposal_date, after.previous_owner,
      after.construction_notes, after.existing_ca_claimed, after.prior_claim_notes, d.now(), r.id],
  );
  record(d, actor, 'PROPERTY_UPDATED', 'property', r.id, { business: r.business_id, fields: changed });
  if (disposalSet || saleComing) {
    raiseDisposalTask(d, actor, { id: r.id, business_id: r.business_id }, disposalSet ? 'DISPOSAL_DATE' : 'SALE_IN_PROSPECT');
  }
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 11 · CLAIMS
 * ================================================================== */

export type ClaimRow = {
  readonly id: string;
  readonly claim_ref: string;
  readonly business_id: string;
  readonly client: string;
  readonly property?: string | null;
  readonly stage?: string;
  readonly workstream?: string;
  readonly owner?: string | null;
  readonly next_action?: string | null;
  readonly shown_range?: string;
};

/**
 * EVERY CLAIM THIS ACTOR MAY READ, EACH LINE BUILT FOR THE ROLE READING IT.
 * ACCOUNTING gets client and reference. SURVEYING gets the working line and no
 * value. ADMIN and SALES get the value as the client was shown it.
 */
export function claimList(db: Db, actor: Actor, limit = 200): ClaimRow[] {
  assertClaimSection(actor);
  return db.all<ClaimDbRow>(`${CLAIM_SELECT}ORDER BY c.claim_ref DESC LIMIT ?`, [limit])
    .filter((r) => can(actor, 'claim.read', claimObjFor(db,r)))
    .map((r) => {
      const base = { id: r.id, claim_ref: r.claim_ref, business_id: r.business_id, client: r.business_name };
      if (actor.role === 'ACCOUNTING') return base;
      const working = {
        ...base, property: r.property_label, stage: stageReading(r.stage).label,
        workstream: words(WORKSTREAMS, r.workstream, r.workstream), owner: r.owner_name, next_action: r.next_action,
      };
      if (!can(actor, 'claim.read_value', claimObjFor(db,r))) return working;
      const v = claimValue(db, r.assessment_id);
      return { ...working, shown_range: v.established ? v.shown_range : 'no estimate yet' };
    });
}

/** CRM 7 of 10: a line of the claim's own invoices — src/web/invoices.ts builds it. */
export type MoneyLine = ClaimMoneyLine;

export type ClaimView = {
  readonly id: string;
  readonly claim_ref: string;
  readonly client: { readonly business_id: string; readonly name: string; readonly linkable: boolean };
  readonly header?: {
    readonly property: { readonly id: string; readonly label: string; readonly postcode: string | null; readonly town: string | null; readonly linkable: boolean } | null;
    readonly stage: { readonly key: string | null; readonly label: string };
    readonly owner: string | null;
    readonly next_action: string | null;
    readonly next_action_due: string | null;
  };
  readonly overview?: {
    readonly workstream: { readonly value: string; readonly label: string };
    readonly priority: { readonly value: string | null; readonly label: string };
    readonly surveyor: string | null;
    readonly surveyor_reach: string;
    readonly hold_reason: string | null;
    readonly lost_reason: string | null;
    readonly expected_completion: string | null;
    readonly acquisition_date: string | null;
    readonly acquisition_price: string;
    readonly tenure: Reading;
    readonly jurisdiction: string;
    readonly existing_ca_claimed: Reading;
  };
  /** CRM 2 of 10. The stage and its steps for every reader but ACCOUNTING; the rest for `pipeline.read`. */
  readonly pipeline?: PipelinePanel;
  /** CRM 3 of 10. The next action, who is waiting, overdue questions, and the tasks this reader may see. Not ACCOUNTING's. */
  readonly tasks?: ClaimTaskPanel;
  /** CRM 3 of 10. The activity timeline, built for the reader — financial events only, for ACCOUNTING. */
  readonly timeline?: Timeline;
  /** CRM 4 of 10: the claim's documents and requests, every document asked of `document.read` for this reader. */
  readonly documents: ClaimDocumentsPanel;
  /** CRM 6 of 10: the whole facts panel for `claim_facts.read`; the released inputs alone for a surveyor on an assigned job. */
  readonly facts?: FactsPanel | ReleasedFacts;
  /** CRM 6 of 10: the four figures, the sign-off record and the reconciliation — `claim_figures.read` alone. */
  readonly figures?: FiguresPanel;
  /** CRM 6 of 10: the deliverables register. */
  readonly deliverables?: DeliverablesPanel;
  /** CRM 6 of 10: HMRC enquiries, clause 13 and the Disposal Note. */
  readonly aftercare?: AftercarePanel;
  readonly value?: ClaimValue;
  readonly money?: readonly MoneyLine[];
  readonly contacts?: readonly { readonly name: string; readonly type: string; readonly decision_maker: string }[];
  /** The CRM follow-on, rows 8.5 and 8.6: the lead this claim came from, its source and its introducer — `lead.read`, `introducer.read`. */
  readonly origin?: ClaimOrigin;
  /** The CRM follow-on, rows 8.4 and 23.7: the claim team, each part built for what the reader may read. */
  readonly team?: ClaimTeam;
  /** The CRM follow-on, row 23.8: the fee the finance view expects, before any fee invoice exists — `invoice.read` alone. */
  readonly estimated_fee?: EstimatedFee;
  /** Phase 132e: multi-site discounts proposed on this claim's fee — recorded, never applied — for `fee_discount.read`. */
  readonly fee_discounts?: readonly FeeDiscountView[];
  readonly may_write: boolean;
  readonly edit?: {
    readonly owners: readonly Person[];
    readonly surveyors: readonly Person[];
    readonly properties: readonly { readonly id: string; readonly label: string }[];
    readonly current: {
      readonly owner_id: string | null; readonly surveyor_id: string | null; readonly priority: string | null;
      readonly workstream: string; readonly property_id: string | null; readonly next_action: string | null;
      readonly next_action_due: string | null; readonly hold_reason: string | null; readonly lost_reason: string | null;
      readonly expected_completion: string | null;
    };
  };
};

function loadClaim(db: Db, id: string): ClaimDbRow {
  const r = db.get<ClaimDbRow>(`${CLAIM_SELECT}WHERE c.id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/**
 * PHASE 134 — A CLAIM'S NAME FOR A PERSON: its company, its property, and its reference for the small grey label.
 * No authorisation: the caller has already asked `claim.read` of the claim it is naming.
 */
export function claimNaming(db: Db, claim_id: string): { readonly business_id: string; readonly company: string; readonly property: string | null; readonly ref: string } | null {
  const r = db.get<{ business_id: string; company: string; property: string | null; ref: string }>(
    'SELECT c.business_id, b.name AS company, p.label AS property, c.claim_ref AS ref FROM claims c JOIN businesses b ON b.id = c.business_id ' +
      'LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?', [claim_id]);
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

/**
 * THE CLAIM PAGE'S OBJECT — the header and the overview panel — AND IT IS WHAT
 * `view.json` SERVES. One object for the page and the wire, as the surveyor's
 * payload is, so the proof is about the screen and not about a copy of it.
 *
 * BUILT FORWARDS, ROLE BY ROLE, FROM WHAT `can()` ALLOWS:
 *   everyone admitted   the reference and the client's name
 *   not ACCOUNTING      the header and the overview
 *   claim.read_value    the value — ADMIN and SALES
 *   invoice.read        the money — ADMIN and ACCOUNTING
 *   contact.read        the organisation's contacts — ADMIN and SALES
 * ACCOUNTING's object therefore holds client, reference and money and nothing
 * else, and SURVEYING's holds no estimate-derived figure at all.
 */
export function claimView(db: Db, actor: Actor, id: string, opts: { store?: PostcodeStore | null; now?: string } = {}): ClaimView {
  assertClaimSection(actor);
  const r = loadClaim(db, id);
  const obj = claimObjFor(db,r);
  authorise(actor, 'claim.read', obj);

  const base = {
    id: r.id, claim_ref: r.claim_ref,
    client: { business_id: r.business_id, name: r.business_name, linkable: can(actor, 'organisation.read', { type: 'business', id: r.business_id }) },
  };

  // CRM 7 of 10: THE CLAIM'S OWN INVOICES, each authorised on `invoice.read` — never the organisation's.
  const money: MoneyLine[] = claimMoneyLines(db, actor, r.id, opts.now ?? new Date().toISOString());
  const withMoney = can(actor, 'invoice.read', { type: 'invoice', id: r.business_id, business_id: r.business_id })
    ? { money } : {};

  // CRM 4 of 10: the documents panel, built for this reader — ACCOUNTING's holds the fee invoice and the signed letter and nothing else.
  const documents = claimDocumentsPanel(db, actor, r, opts.now ?? new Date().toISOString());
  if (actor.role === 'ACCOUNTING') {
    // CRM 3 of 10: its timeline too — built from `invoice.read` alone, so financial events and nothing else.
    const timeline = timelineIfPermitted(db, actor, { kind: 'claim', id: r.id });
    // The CRM follow-on: the fee the finance view expects is money, and ACCOUNTING holds `invoice.read`. Nothing else joins.
    return { ...base, ...withMoney, ...estimatedFee(db, actor, r), ...feeDiscountsOn(db, actor, r.id), documents, ...(timeline === undefined ? {} : { timeline }), may_write: false };
  }

  const p = r.property_id === null ? undefined : db.get<PropertyDbRow>(`${PROPERTY_SELECT}WHERE p.id = ?`, [r.property_id]);
  const assigned = obj.assigned_surveyor_ids.length;
  const header = {
    property: p === undefined ? null : {
      id: p.id, label: p.label, postcode: p.postcode, town: p.town, linkable: can(actor, 'property.read', propertyObj(db, p)),
    },
    stage: stageReading(r.stage),
    owner: r.owner_name,
    next_action: r.next_action,
    next_action_due: r.next_action_due,
  };
  const overview = {
    workstream: { value: r.workstream, label: words(WORKSTREAMS, r.workstream, r.workstream) },
    priority: { value: r.priority, label: vocabLabel(db, 'PRIORITY', r.priority, 'not set') },
    surveyor: r.surveyor_name,
    surveyor_reach: assigned === 0
      ? 'no surveyor can open this claim yet — they need a survey job on it, and none is set up'
      : 'the surveyor on this claim’s survey job can open it',
    hold_reason: r.hold_reason, lost_reason: r.lost_reason, expected_completion: r.expected_completion,
    acquisition_date: p?.acquisition_date ?? null,
    acquisition_price: p === undefined || p.acquisition_price_pence === null ? NOT_RECORDED : formatPence(p.acquisition_price_pence),
    tenure: tenureReading(p?.tenure ?? null),
    jurisdiction: p === undefined ? 'no property is recorded on this claim' : jurisdictionOf(p, opts.store).label,
    existing_ca_claimed: p === undefined ? { ...priorClaimPosition(null), derived: false, source: null } : priorClaimFor(db, p),
  };

  const withValue = can(actor, 'claim.read_value', obj) ? { value: claimValue(db, r.assessment_id) } : {};
  const contactObj = { type: 'contact' as const, id: r.business_id, business_id: r.business_id };
  const withContacts = can(actor, 'contact.read', contactObj)
    ? { contacts: contactsFor(db, actor, r.business_id).map((c) => ({ name: c.full_name, type: c.contact_type.label, decision_maker: c.is_decision_maker.label })) }
    : {};
  const mayWrite = can(actor, 'claim.write', obj);
  const withEdit = mayWrite
    ? {
        edit: {
          owners: ownerChoices(db),
          surveyors: surveyorChoices(db),
          properties: db.all<{ id: string; label: string }>(
            'SELECT id, label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', [r.business_id]),
          current: {
            owner_id: r.owner_id, surveyor_id: r.surveyor_id, priority: r.priority, workstream: r.workstream,
            property_id: r.property_id, next_action: r.next_action, next_action_due: r.next_action_due,
            hold_reason: r.hold_reason, lost_reason: r.lost_reason, expected_completion: r.expected_completion,
          },
        },
      }
    : {};

  const today = opts.now ?? new Date().toISOString();
  const pipeline = pipelinePanel(db, actor, loadPipelineClaim(db, r.id), { today });
  // CRM 3 of 10: the work on the claim and its timeline, each built for this reader.
  const tasks = claimTaskPanel(db, actor, r, today);
  const timeline = timelineIfPermitted(db, actor, { kind: 'claim', id: r.id });
  /* CRM 6 of 10: the facts, the figures, the deliverables and aftercare — each built forwards for this reader. ADMIN and
     SALES get the whole facts panel; a surveyor on an assigned job gets the RELEASED inputs, assembled by src/payload.ts
     from a list with no figure on it; the figures are `claim_figures.read` alone. ACCOUNTING returned above. */
  const fObj = factsObj(db, r);
  const facts: FactsPanel | ReleasedFacts | null = can(actor, 'claim_facts.read', fObj)
    ? factsPanel(db, actor, r.id, today, opts.store === undefined ? {} : { store: opts.store })
    : assembleReleasedFacts(actor, fObj, releasedFactReader(db, r.id, opts.store === undefined ? {} : { store: opts.store }));
  const figures: FiguresPanel | null = can(actor, 'claim_figures.read', { type: 'claim_figures', id: r.id, business_id: r.business_id })
    ? figuresPanel(db, actor, r.id, today) : null;
  const deliverables: DeliverablesPanel | null = can(actor, 'deliverable.read', {
    type: 'deliverable', id: r.id, business_id: r.business_id, kind: 'REGISTER', state: 'REGISTER', figure_released: false,
  }) ? deliverablesPanel(db, actor, r.id) : null;
  const aftercare: AftercarePanel | null = can(actor, 'claim_facts.read', fObj) ? aftercarePanel(db, actor, r.id) : null;
  return {
    ...base, header, overview, pipeline, tasks, documents, ...(timeline === undefined ? {} : { timeline }),
    ...(facts === null ? {} : { facts }), ...(figures === null ? {} : { figures }),
    ...(deliverables === null ? {} : { deliverables }), ...(aftercare === null ? {} : { aftercare }),
    ...withValue, ...withMoney, ...estimatedFee(db, actor, r), ...feeDiscountsOn(db, actor, r.id), ...withContacts, ...claimOrigin(db, actor, r),
    team: claimTeam(db, actor, r, obj), may_write: mayWrite, ...withEdit,
  };
}

/**
 * OPEN A CLAIM ON A PROPERTY — a second relief on a building, or a first claim
 * on a property added by staff.
 *
 * IT CARRIES NO ASSESSMENT. The indicative estimate is the organisation's and
 * belongs to the claim its converted lead opened; putting it on a second claim
 * would count it twice on every future dashboard.
 *
 * IT OPENS AT THE ENQUIRY (CRM 2 of 10). A claim a person opens walks every gate
 * from the first, and its enquiry checks are recorded on the claim itself.
 */
export function openClaim(d: CrmDeps, actor: Actor, property_id: string, input: Fields): WriteResult {
  const p = loadProperty(d.db, property_id);
  authorise(actor, 'claim.create', { type: 'claim', id: p.id, business_id: p.business_id, assigned_surveyor_ids: [] });
  const ws = vocabField(input['workstream'] ?? null, WORKSTREAMS, 'The workstream');
  if (!ws.ok) return ws;
  if (ws.value === null) return { ok: false, why: 'Choose the workstream — not yet known is a choice.' };
  const made = d.db.tx(() => {
    const m = insertClaim(d.db, d.now, d.newId, {
      business_id: p.business_id, property_id: p.id, assessment_id: null, workstream: ws.value ?? 'UNKNOWN',
      stage: 'ENQUIRY', owner_id: null, surveyor_id: null,
    });
    recordOpened(d, actor, m.id, 'ENQUIRY', 'opened by staff on a property; its enquiry checks are recorded on the claim');
    return m;
  });
  record(d, actor, 'CLAIM_CREATED', 'claim', made.id, { business: p.business_id, property: p.id, workstream: ws.value, route: 'staff' });
  // CRM 3 of 10: opening the claim at the enquiry is a stage entered.
  fireAutomation(d, actor, { trigger: 'STAGE_ENTERED', claim_id: made.id, stage: 'ENQUIRY' });
  return { ok: true, id: made.id };
}

/**
 * CHANGE A CLAIM'S HEADER AND OVERVIEW. THE STAGE IS NOT HERE: CRM 2 of 10 owns
 * it, and moves it through gates. The reference and the organisation cannot be
 * changed by anything — the database refuses both.
 */
export function updateClaim(d: CrmDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const r = loadClaim(d.db, id);
  authorise(actor, 'claim.write', claimObjFor(d.db, r));
  // CRM 3 of 10: the next action is a task now, with an owner and a due date, set in its own panel (migration 012).
  if (Object.hasOwn(input, 'next_action') || Object.hasOwn(input, 'next_action_due')) {
    return {
      ok: false,
      why: 'A claim’s next action is a task now, with an owner and a due date. Set it in the claim’s next action panel.',
    };
  }
  const stored = {
    owner_id: r.owner_id, surveyor_id: r.surveyor_id, priority: r.priority, workstream: r.workstream as string | null,
    property_id: r.property_id,
    hold_reason: r.hold_reason, lost_reason: r.lost_reason, expected_completion: r.expected_completion,
  };
  const properties = d.db.all<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [r.business_id]);
  const owner = take(input, 'owner_id', stored.owner_id, (v) => personField(v, ownerChoices(d.db), 'The claim owner'));
  const surveyor = take(input, 'surveyor_id', stored.surveyor_id, (v) => personField(v, surveyorChoices(d.db), 'The surveyor'));
  const priority = take(input, 'priority', stored.priority, (v) => vocabChoice(d.db, 'PRIORITY', v, stored.priority, 'The priority'));
  const workstream = take(input, 'workstream', stored.workstream, (v) => vocabField(v, WORKSTREAMS, 'The workstream'));
  const property = take(input, 'property_id', stored.property_id, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : properties.some((x) => x.id === v) ? { ok: true, value: v }
        : { ok: false, why: 'A claim’s property must be one of its own organisation’s properties.' });
  const hold = take(input, 'hold_reason', stored.hold_reason, (v) => textField(v, 1000, 'The hold reason'));
  const lost = take(input, 'lost_reason', stored.lost_reason, (v) => textField(v, 1000, 'The lost reason'));
  const expected = take(input, 'expected_completion', stored.expected_completion, (v) => dateField(v, 'The expected completion'));
  for (const c of [owner, surveyor, priority, workstream, property, hold, lost, expected]) if (!c.ok) return c;
  if (!owner.ok || !surveyor.ok || !priority.ok || !workstream.ok || !property.ok || !hold.ok
    || !lost.ok || !expected.ok) {
    return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  }
  if (workstream.value === null) return { ok: false, why: 'Choose the workstream — not yet known is a choice.', field: 'workstream' };
  // CRM 2 of 10: ON_HOLD carries its reason, and the database refuses one without it.
  if (r.stage === 'ON_HOLD' && hold.value === null) {
    return { ok: false, why: 'A claim on hold carries its hold reason. Change the reason, or resume the claim — it cannot be cleared.' };
  }
  const after = {
    owner_id: owner.value, surveyor_id: surveyor.value, priority: priority.value, workstream: workstream.value,
    property_id: property.value, hold_reason: hold.value,
    lost_reason: lost.value, expected_completion: expected.value,
  };
  const changed = changedKeys(stored, after);
  if (changed.length === 0) return { ok: true, id: r.id };
  d.db.run(
    'UPDATE claims SET owner_id = ?, surveyor_id = ?, priority = ?, workstream = ?, property_id = ?, ' +
      'hold_reason = ?, lost_reason = ?, expected_completion = ?, updated_at = ? WHERE id = ?',
    [after.owner_id, after.surveyor_id, after.priority, after.workstream, after.property_id,
      after.hold_reason, after.lost_reason, after.expected_completion, d.now(), r.id],
  );
  record(d, actor, 'CLAIM_UPDATED', 'claim', r.id, { business: r.business_id, fields: changed });
  // CRM 3 of 10: owner changed → notify (the seeded rule).
  if (changed.includes('owner_id') && after.owner_id !== null) fireAutomation(d, actor, { trigger: 'OWNER_CHANGED', claim_id: r.id });
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 11a · WHERE THE CLAIM CAME FROM, ITS TEAM, AND THE FEE EXPECTED — the CRM follow-on
 * ================================================================== */

export type ClaimOrigin = {
  /** The lead this claim was converted from, or null for a claim a person opened on a property. */
  readonly lead: { readonly id: string; readonly href: string; readonly origin: string } | null;
  /** The lead's source; for a claim with no lead, the organisation's — the same reading the claims list's source filter makes. */
  readonly source: { readonly value: string | null; readonly label: string; readonly from: string };
  /** The firm that referred the lead — present only for `introducer.read`; null where no firm did. */
  readonly introducer?: { readonly id: string; readonly firm_name: string; readonly href: string } | null;
};

/**
 * ROWS 8.5 AND 8.6 — READ THROUGH THE LEAD, NEVER A COLUMN ON THE CLAIM. The join is the one `CLAIMS_WORKING` in
 * src/web/lists.ts makes (`leads.claim_id`, then `introducers`), and a claim with no lead reads its organisation's source,
 * exactly as that list's source filter does. `lead.read` builds the block; `introducer.read` adds the firm. SURVEYING and
 * ACCOUNTING hold neither, so their claim view carries no origin at all.
 */
export function claimOrigin(db: Db, actor: Actor, r: { id: string; business_id: string }): { origin?: ClaimOrigin } {
  if (!can(actor, 'lead.read', { type: 'lead', id: '__claim_origin__', business_id: r.business_id })) return {};
  const l = db.get<{ id: string; business_id: string | null; origin: string; source: string; introducer_id: string | null; firm_name: string | null }>(
    'SELECT l.id, l.business_id, l.origin, l.source, l.introducer_id, i.firm_name FROM leads l ' +
      'LEFT JOIN introducers i ON i.id = l.introducer_id WHERE l.claim_id = ?',
    [r.id]);
  const lead = l !== undefined && can(actor, 'lead.read', { type: 'lead', id: l.id, business_id: l.business_id }) ? l : undefined;
  const orgSource = db.get<{ source: string | null }>('SELECT source FROM businesses WHERE id = ?', [r.business_id])?.source ?? null;
  const value = lead?.source ?? orgSource;
  const source = {
    value,
    label: vocabLabel(db, 'LEAD_SOURCE', value, NOT_RECORDED),
    from: lead !== undefined ? 'the lead this claim was converted from'
      : value === null ? 'nothing — no lead, and the organisation records no source'
        : 'the organisation — this claim was opened by staff, not converted from a lead',
  };
  const mayFirm = can(actor, 'introducer.read', { type: 'introducer', id: lead?.introducer_id ?? '__claim_origin__' });
  return {
    origin: {
      lead: lead === undefined ? null : { id: lead.id, href: `/staff/leads/${lead.id}`, origin: LEAD_ORIGINS[lead.origin] ?? lead.origin },
      source,
      ...(mayFirm
        ? { introducer: lead?.introducer_id === null || lead?.introducer_id === undefined ? null
          : { id: lead.introducer_id, firm_name: lead.firm_name ?? 'a firm', href: `/staff/introducers/${lead.introducer_id}` } }
        : {}),
    },
  };
}

export type TeamContact = {
  readonly link_id: string; readonly contact_id: string; readonly name: string; readonly type: string;
  readonly since: string; readonly linked_by: string;
};

export type ClaimTeam = {
  readonly owner: string | null;
  readonly surveyor: string | null;
  readonly surveyor_reach: string;
  /** The organisation's accountant and adviser linked to THIS claim — `contact.read` alone. */
  readonly contacts?: readonly TeamContact[];
  /** The organisation's accountants and advisers not yet linked — `claim_team.write` alone. */
  readonly candidates?: readonly { readonly id: string; readonly name: string; readonly type: string }[];
  /** The tax adviser AS THEIR SIGN-OFF RECORD — its firm or role, credential and date, never a person. `claim_figures.read` alone. */
  readonly tax_adviser?:
    | { readonly state: 'NOT_RECORDED'; readonly reading: string }
    | { readonly state: 'RECORDED'; readonly adviser: string; readonly credential: string; readonly signed_on: string; readonly recorded: string; readonly reading: string };
  readonly may_link: boolean;
};

const TEAM_TYPES = ['ACCOUNTANT', 'ADVISER'] as const;

/**
 * ROWS 8.4 AND 23.7 — THE CLAIM TEAM, BUILT FORWARDS FOR THE READER.
 *
 *   everyone admitted      the owner and the surveyor, which the header and overview already carry
 *   contact.read           the organisation's accountant and adviser linked to this claim (migration 020)
 *   claim_team.write       the ones not yet linked, to link
 *   claim_figures.read     the tax adviser, as the sign-off record — never a person's name
 *
 * A surveyor reads the first line and nothing else. ACCOUNTING never reaches it: its claim view returns before.
 */
export function claimTeam(db: Db, actor: Actor, r: ClaimDbRow, obj: Extract<Obj, { type: 'claim' }>): ClaimTeam {
  const contactObj = { type: 'contact' as const, id: r.business_id, business_id: r.business_id };
  const mayLink = can(actor, 'claim_team.write', obj);
  const typeWords = (t: string | null): string => words(CONTACT_TYPES, t, 'not recorded');
  const contacts = can(actor, 'contact.read', contactObj)
    ? db.all<{ id: string; contact_id: string; linked_at: string; full_name: string; contact_type: string | null; linked_by: string | null }>(
      'SELECT k.id, k.contact_id, k.linked_at, ct.full_name, ct.contact_type, u.display_name AS linked_by FROM claim_contacts k ' +
        'JOIN contacts ct ON ct.id = k.contact_id LEFT JOIN users u ON u.id = k.linked_by ' +
        'WHERE k.claim_id = ? AND k.unlinked_at IS NULL ORDER BY ct.full_name ASC, k.id ASC',
      [r.id],
    ).map((k) => ({
      link_id: k.id, contact_id: k.contact_id, name: k.full_name, type: typeWords(k.contact_type),
      since: localStamp(k.linked_at), linked_by: k.linked_by ?? 'a former user',
    }))
    : undefined;
  const linked = new Set((contacts ?? []).map((c) => c.contact_id));
  const candidates = mayLink && contacts !== undefined
    ? db.all<{ id: string; full_name: string; contact_type: string | null }>(
      "SELECT id, full_name, contact_type FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT','ADVISER') " +
        'ORDER BY full_name ASC, id ASC',
      [r.business_id],
    ).filter((c) => !linked.has(c.id)).map((c) => ({ id: c.id, name: c.full_name, type: typeWords(c.contact_type) }))
    : undefined;
  let taxAdviser: ClaimTeam['tax_adviser'];
  if (can(actor, 'claim_figures.read', { type: 'claim_figures', id: r.id, business_id: r.business_id })) {
    const s = latestSignOff(db, r.id);
    taxAdviser = s === undefined
      ? { state: 'NOT_RECORDED', reading: 'no sign-off yet — the tax adviser shows here once their sign-off is recorded' }
      : {
        state: 'RECORDED', adviser: s.adviser, credential: s.credential, signed_on: s.signed_on, recorded: localStamp(s.recorded_at),
        reading: `the sign-off record: ${s.adviser}, ${s.credential}, signed on ${s.signed_on}`,
      };
  }
  return {
    owner: r.owner_name, surveyor: r.surveyor_name,
    surveyor_reach: obj.assigned_surveyor_ids.length === 0
      ? 'no surveyor can open this claim yet — they need a survey job on it, and none is set up'
      : 'the surveyor on this claim’s survey job can open it',
    ...(contacts === undefined ? {} : { contacts }),
    ...(candidates === undefined ? {} : { candidates }),
    ...(taxAdviser === undefined ? {} : { tax_adviser: taxAdviser }),
    may_link: mayLink,
  };
}

/** LINK AN ACCOUNTANT OR AN ADVISER OF THE CLAIM'S OWN ORGANISATION TO THE CLAIM. The contact stays a contact. */
export function linkClaimContact(d: CrmDeps, actor: Actor, claim_id: string, contact_id: string | null): WriteResult {
  const r = loadClaim(d.db, claim_id);
  authorise(actor, 'claim_team.write', claimObjFor(d.db, r));
  const c = d.db.get<{ id: string; business_id: string | null; contact_type: string | null }>(
    'SELECT id, business_id, contact_type FROM contacts WHERE id = ?', [contact_id ?? '']);
  if (c === undefined || c.business_id !== r.business_id) {
    return { ok: false, why: 'Choose one of this organisation’s own contacts — a claim’s team is drawn from the client’s contacts.' };
  }
  if (!TEAM_TYPES.includes(c.contact_type as typeof TEAM_TYPES[number])) {
    return { ok: false, why: 'Only an accountant or adviser contact can join a claim’s team. If that is who they are, change the contact’s type first.' };
  }
  if (d.db.get<{ id: string }>('SELECT id FROM claim_contacts WHERE claim_id = ? AND contact_id = ? AND unlinked_at IS NULL', [r.id, c.id]) !== undefined) {
    return { ok: false, why: 'That contact is already on this claim’s team.' };
  }
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO claim_contacts (id, claim_id, contact_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)', [id, r.id, c.id, actor.id, at]);
    record(d, actor, 'CLAIM_TEAM_LINKED', 'claim', r.id, { link: id, contact: c.id, business: r.business_id });
  });
  return { ok: true, id };
}

/** END A CLAIM TEAM LINK, WITH WHO AND WHEN. That the contact was on the team stays on the record. */
export function unlinkClaimContact(d: CrmDeps, actor: Actor, link_id: string): WriteResult & { claim_id?: string } {
  const k = d.db.get<{ id: string; claim_id: string; contact_id: string; unlinked_at: string | null }>(
    'SELECT id, claim_id, contact_id, unlinked_at FROM claim_contacts WHERE id = ?', [link_id]);
  if (k === undefined) throw new NotFoundAsRefusal();
  const r = loadClaim(d.db, k.claim_id);
  authorise(actor, 'claim_team.write', claimObjFor(d.db, r));
  if (k.unlinked_at !== null) return { ok: false, why: 'That contact has already been taken off this claim’s team.' };
  d.db.tx(() => {
    d.db.run('UPDATE claim_contacts SET unlinked_at = ?, unlinked_by = ? WHERE id = ? AND unlinked_at IS NULL', [d.now(), actor.id, k.id]);
    record(d, actor, 'CLAIM_TEAM_UNLINKED', 'claim', r.id, { link: k.id, contact: k.contact_id, business: r.business_id });
  });
  return { ok: true, id: k.id, claim_id: r.id };
}

export type EstimatedFee = {
  /** False wherever the figure the fee needs is not known — never a nought (N4). */
  readonly known: boolean;
  readonly amount: string | null;
  readonly reading: string;
  /** Whether the finance view's expected fees count it today — they count claims at the invoice stage. */
  readonly counted_by_finance: boolean;
  readonly basis: string;
  /**
   * PHASE 132f — THE ENGAGEMENT GATE, read off `expectedFeeFor` (engine.ts `feeGate`, phase9's costing injected).
   * `outcome` FIRE routes this fee to the engine's own words, "we will come back to you with a price": nothing is
   * quoted automatically, and the figures stay for the person pricing it by hand. UNDETERMINED — an unknown fee, an
   * unknown sector, supported living — is neither. The placeholder caveat is carried on every reading.
   */
  readonly gate: {
    readonly outcome: 'PASS' | 'FIRE' | 'UNDETERMINED';
    readonly routes_to: string | null;
    readonly quote_withheld: boolean;
    readonly reading: string;
    readonly placeholder_caveat: string;
  };
};

/**
 * ROW 23.8 — THE FEE THE FINANCE VIEW EXPECTS, ON THE CLAIM, BEFORE ANY FEE INVOICE EXISTS. Read through `expectedFeeFor`
 * in src/web/vat.ts — the one computation `expectedFees` makes — never typed, and there is no agreed-fee field (row 8.14).
 * `invoice.read` alone: ADMIN and ACCOUNTING. Never SALES, never SURVEYING — tools/payload-proof.ts holds both. Once a
 * live fee invoice is raised the claim's money lines carry the fee, and this is not drawn.
 */
function estimatedFee(db: Db, actor: Actor, r: { id: string; claim_ref: string; business_id: string; stage: string | null }): { estimated_fee?: EstimatedFee } {
  if (!can(actor, 'invoice.read', { type: 'invoice', id: r.business_id, business_id: r.business_id })) return {};
  if (liveFeeInvoiceCount(db, r.id) > 0) return {};
  const sector = db.get<{ sector: string | null }>('SELECT sector FROM businesses WHERE id = ?', [r.business_id])?.sector ?? null;
  const e = expectedFeeFor(db, { id: r.id, claim_ref: r.claim_ref, business_id: r.business_id, sector });
  const counted = r.stage === 'INVOICE';
  const basis = 'Our fee is worked out from the tax adviser’s signed-off figure, using our fee rules. Nobody types it in. It is not agreed anywhere else.';
  const g = e.gate;
  const gbp = (n: number | null): string => (n === null ? 'not known' : formatPence(Math.round(n * 100)));
  const gate = {
    outcome: g.outcome, routes_to: g.routes_to, quote_withheld: g.withholds_quote, placeholder_caveat: g.placeholder_caveat,
    reading: g.outcome === 'FIRE'
      ? `${(g.routes_to ?? '').toUpperCase()} — this fee is below our cost plus our margin (${gbp(g.threshold)}, short by ${gbp(g.shortfall)}). So no price is sent out: a person prices the job`
      : g.outcome === 'PASS'
        ? `this fee covers our cost plus our margin (${gbp(g.threshold)})`
        : `we cannot check this fee yet — ${g.missing.join(', ')} not known. It has not passed and has not failed`,
  };
  return {
    estimated_fee: e.expected_pence === null
      ? { known: false, amount: null, reading: `UNKNOWN — ${e.why ?? 'the figure it needs is not known'}`, counted_by_finance: counted, basis, gate }
      : {
        known: true, amount: formatPence(e.expected_pence),
        reading: counted ? 'counted in the finance view’s fees expected from claims at the invoice stage'
          : 'not yet counted by the finance view, which counts a claim once it reaches the invoice stage',
        counted_by_finance: counted, basis, gate,
      },
  };
}

/* ================================================================== *
 * 12 · THE PIPELINE BOARD — CRM 2 of 10
 * ================================================================== */

export type BoardCard = {
  readonly id: string;
  readonly claim_ref: string;
  readonly client: string;
  readonly property: string | null;
  readonly owner: string | null;
  readonly next_action: string | null;
  /** Whole days since the claim's last move, or since it was opened. */
  readonly age_days: number;
  readonly stage_label: string;
  /** UI tidy phase 3: the stored stage, the owner's id and the next action's due day, for the Pipeline table. */
  readonly stage_key: string | null;
  /** UI tidy phase 6: the company, so the Clients list can show each claim beside it. */
  readonly business_id: string;
  readonly owner_id: string | null;
  readonly next_action_due: string | null;
  readonly hold?: { readonly reason: string | null; readonly returns_to: string };
  /** The next stage, for a person who may ask to move it. The server asks the gate again. */
  readonly next?: { readonly key: string; readonly label: string };
  /** The range the client was shown — ONLY where `claim.read_value` says yes. */
  readonly value?: string;
};

export type Board = {
  readonly columns: readonly {
    readonly key: string; readonly label: string; readonly gate: string; readonly owner: string; readonly cards: readonly BoardCard[];
  }[];
  readonly on_hold: readonly BoardCard[];
  readonly exited: readonly { readonly key: string; readonly label: string; readonly cards: readonly BoardCard[] }[];
  readonly unrecognised: readonly BoardCard[];
  readonly fee_trigger: string;
};

/**
 * ONE CARD, BUILT FORWARDS FOR THE ACTOR. The value is added only where
 * `claim.read_value` says yes — the board is ADMIN and SALES today, and a card
 * for anybody else would carry no value without anything here changing.
 */
export function boardCard(db: Db, actor: Actor, r: ClaimDbRow, nowIso: string): BoardCard {
  const obj = claimObjFor(db, r);
  const last = db.get<{ at: string | null }>('SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ?', [r.id])?.at ?? r.created_at;
  const age = Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(last)) / 86_400_000));
  const s = claimStage(r.stage);
  const next = s.kind === 'PROCEDURE' && can(actor, 'claim.move', obj) ? nextProcedureKey(s.key) : null;
  const value = can(actor, 'claim.read_value', obj) ? claimValue(db, r.assessment_id) : null;
  return {
    id: r.id, claim_ref: r.claim_ref, client: r.business_name, property: r.property_label, owner: r.owner_name,
    next_action: r.next_action, age_days: age, stage_label: s.label,
    stage_key: r.stage, owner_id: r.owner_id, next_action_due: r.next_action_due, business_id: r.business_id,
    ...(s.kind === 'ON_HOLD' ? { hold: { reason: r.hold_reason, returns_to: anyStageLabel(r.hold_return_stage) } } : {}),
    ...(next === null ? {} : { next: { key: next, label: next === 'CLOSED' ? 'Closed' : anyStageLabel(next) } }),
    ...(value === null ? {} : { value: value.established ? value.shown_range : 'no estimate yet' }),
  };
}

/**
 * THE BOARD: A COLUMN PER STAGE, A LANE FOR ON_HOLD, AND THE EXITS BELOW —
 * because exits keep the record. Every claim the actor may read, authorised row
 * by row. Moving a card is a POST to the same move the claim page makes, and the
 * server asks the gate again.
 */
export function pipelineBoard(db: Db, actor: Actor, nowIso: string, limit = 500): Board {
  authorise(actor, 'pipeline.read', { type: 'pipeline', id: '__pipeline__' });
  const cards = db.all<ClaimDbRow>(`${CLAIM_SELECT}ORDER BY c.claim_ref ASC LIMIT ?`, [limit])
    .filter((r) => can(actor, 'claim.read', claimObjFor(db, r)))
    .map((r) => ({ r, card: boardCard(db, actor, r, nowIso) }));
  const at = (key: string): BoardCard[] => cards.filter((x) => x.r.stage === key).map((x) => x.card);
  return {
    columns: BOARD_COLUMNS.map((col) => ({ key: col.key, label: col.label, gate: col.gate, owner: col.owner, cards: at(col.key) })),
    on_hold: at('ON_HOLD'),
    exited: EXITS.map((e) => ({ key: e.key, label: e.label, cards: at(e.key) })),
    unrecognised: cards.filter((x) => claimStage(x.r.stage).kind === 'UNKNOWN').map((x) => x.card),
    fee_trigger: FEE_TRIGGERS[FEE_TRIGGER.reading],
  };
}

/** Phase 132e: the multi-site discounts proposed on a claim's fee, for a reader of `fee_discount.read` — absent otherwise. */
function feeDiscountsOn(db: Db, actor: Actor, claim_id: string): { fee_discounts?: readonly FeeDiscountView[] } {
  const c = db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined || !can(actor, 'fee_discount.read', { type: 'claim', id: claim_id, business_id: c.business_id, assigned_surveyor_ids: [] })) return {};
  return { fee_discounts: discountsFor(db, actor, claim_id) };
}

/**
 * PHASE 133a — THE GATE OF THE PIPELINE BOARD, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function pipelineBoardGate(actor: Actor): void {
  authorise(actor, 'pipeline.read', { type: 'pipeline', id: '__pipeline__' });
}
