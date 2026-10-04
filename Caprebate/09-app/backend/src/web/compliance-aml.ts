/**
 * CUSTOMER DUE DILIGENCE — BUILT, AND OFF. CRM 8 of 10, 12 September 2026.
 *
 * Built to the AML/KYC Position Paper (08-monday-doc-exports/12830178449),
 * sections 5 and 6. The setting that switches it on is AML_IN_SCOPE in
 * src/web/compliance.ts, and it ships false: whether supervision is required is
 * with the accountant and a solicitor.
 *
 * OFF, NOTHING HERE BLOCKS A CLAIM — the register can still be kept. ON, a claim
 * cannot leave ENGAGEMENT without a finished check (src/web/pipeline.ts asks
 * `cddGateNeed`).
 *
 * WHAT THE PAPER DOES NOT SAY IS NOT TYPED HERE. It names five claimant types, no
 * risk-rating scale, no ownership threshold and evidence documents for
 * individuals only. So a type outside the five is OTHER with a note, a risk
 * rating is words or nothing, and a beneficial owner's basis is what the evidence
 * shows.
 *
 * PSC DATA DOES NOT SILENTLY STAND FOR BENEFICIAL OWNERSHIP. Caprebate pulls
 * Companies House persons-with-significant-control data for the allowance
 * common-control test. An owner identified from that pull needs a separate, dated
 * decision on THIS check that cross-references the pull — the database refuses
 * the owner without it, and the pull on its own never records anybody.
 *
 * NO TIPPING OFF. Nothing here reaches a client or an accountant: every read and
 * write is `compliance.read` or `compliance.write`, which no CLIENT holds.
 */

import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import {
  assertComplianceRead, assertComplianceWrite, dateField, has, NotFoundAsRefusal, record, requiredText, textField,
  TWO_PERSON_LIMITATION, settingReading, ukDay, vocabField, words,
  type Check, type ComplianceDeps, type Fields, type SettingReading, type Vocab, type WriteResult,
} from './compliance.ts';
import { identityPassed } from './identity-checks.ts';

/* ================================================================== *
 * 1 · THE VOCABULARIES — the paper's own, section 5
 * ================================================================== */

export type ClaimantGuide = { readonly label: string; readonly identify: string; readonly verify: string; readonly owners: string; readonly authority: string };

export const CLAIMANT_GUIDE: Readonly<Record<string, ClaimantGuide>> = Object.freeze({
  LIMITED_COMPANY: {
    label: 'Limited company operator',
    identify: 'The company and the people instructing us. Note its Companies House number, registered office and what it does.',
    verify: 'Against the Companies House register.',
    owners: 'Find out who the beneficial owners are, and take reasonable measures to check this. If an owner is itself a company or other body, understand the structure.',
    authority: 'The person instructing us must have the right to act for the company — a director.',
  },
  GP_PARTNERSHIP: {
    label: 'Partnership of GPs',
    identify: 'The partnership, and each partner with a controlling interest.',
    verify: 'Standard identity checks on the partners signing the engagement letter; the partnership’s registration where applicable.',
    owners: 'The partners with a controlling interest.',
    authority: 'An authorised partner.',
  },
  SOLE_TRADER: {
    label: 'Sole-trader dentist',
    identify: 'The individual — there is no separate entity.',
    verify: 'A standard ID check: a passport or driving licence, and proof of address.',
    owners: 'Not applicable — the individual is the customer.',
    authority: 'The proprietor.',
  },
  CHARITY: {
    label: 'Charity',
    identify: 'The charity, and the trustees or authorised officer who instruct us. Note its Charity Commission number and registered details.',
    verify: 'Against the Charity Commission register.',
    owners: 'Find out who the beneficial owners are, and take reasonable measures to check this.',
    authority: 'A trustee or authorised officer.',
  },
  INDIVIDUAL_OWNER: {
    label: 'Property held personally by an individual',
    identify: 'The individual, as for a sole trader.',
    verify: 'A standard ID check. A Land Registry check that they own the property is good practice. It is not a money-laundering rule.',
    owners: 'Not applicable — the individual is the customer.',
    authority: 'The paper does not say.',
  },
  /* PHASE 153d, 4 October 2026 (Word question 45): three more kinds, TEST DEFAULTS, NOT AGREED — for the solicitor. */
  ORDINARY_PARTNERSHIP: {
    label: 'Ordinary partnership (not GPs) — test default',
    identify: 'The partnership, and each partner who owns more than 25% or controls it.',
    verify: 'Standard identity checks on the partners signing the engagement letter.',
    owners: 'Each partner who owns more than 25% of the partnership or controls it.',
    authority: 'An authorised partner.',
  },
  LLP: {
    label: 'Limited liability partnership (LLP) — test default',
    identify: 'The LLP and the members instructing us. Note its Companies House number and registered office.',
    verify: 'Against the Companies House register.',
    owners: 'Each member who owns more than 25% or controls the LLP. Take reasonable measures to check this.',
    authority: 'A designated member.',
  },
  TRUST: {
    label: 'Trust — test default',
    identify: 'The trust, its trustees, and who benefits from it.',
    verify: 'The trust deed, and standard identity checks on the trustees instructing us.',
    owners: 'The settlor, the trustees, any beneficiary entitled to more than 25%, and anyone who controls the trust.',
    authority: 'A trustee.',
  },
  OTHER: {
    label: 'Another kind of claimant — the paper does not cover it',
    identify: 'Not in the paper. Record what was identified and why, and put the type to the solicitor.',
    verify: 'Not in the paper.', owners: 'Not in the paper.', authority: 'Not in the paper.',
  },
});

export const CLAIMANT_TYPES: Vocab = Object.freeze(
  Object.fromEntries(Object.entries(CLAIMANT_GUIDE).map(([k, g]) => [k, g.label])));

export const AUTHORITY_BASES: Vocab = Object.freeze({
  DIRECTOR: 'A director', PARTNER: 'An authorised partner', PROPRIETOR: 'The proprietor',
  TRUSTEE_OR_AUTHORISED_OFFICER: 'A trustee or authorised officer', LEGAL_OWNER_IN_PERSON: 'The legal owner, in person', OTHER: 'Other — say in the evidence',
  DESIGNATED_MEMBER: 'A designated member of an LLP',
});
export const BENEFICIAL_OWNERSHIP: Vocab = Object.freeze({
  RECORDED: 'Beneficial owners are recorded on this check', NOT_APPLICABLE_INDIVIDUAL: 'Not applicable — the customer is an individual',
});
export const ENTITY_STATUSES: Vocab = Object.freeze({ ACTIVE: 'Active — in no insolvency process or strike-off', NOT_ACTIVE: 'Not active', NOT_APPLICABLE: 'Not applicable — an individual' });
export const SANCTIONS_RESULTS: Vocab = Object.freeze({ NO_MATCH: 'No match on the UK sanctions list', POSSIBLE_MATCH: 'A possible match' });
export const OWNER_SOURCES: Vocab = Object.freeze({ EVIDENCE_DOCUMENT: 'An evidence document', PSC_PULL: 'The Companies House PSC pull, relied on by a dated decision' });
export const PSC_DECISIONS: Vocab = Object.freeze({
  RELIED_ON_FOR_BENEFICIAL_OWNERSHIP: 'Relied on for beneficial ownership', NOT_RELIED_ON: 'Not relied on for beneficial ownership',
});
export const OFFICES: Vocab = Object.freeze({ NOMINATED_OFFICER: 'Nominated officer', COMPLIANCE_OFFICER: 'Compliance officer' });

/**
 * PHASE 153d, 4 October 2026 — THE CHECK'S TEST DEFAULTS (Word question 45, the director's, for the solicitor). Built on
 * our recommendation so the test system runs end to end: a low, medium or high risk level; anyone owning more than 25%
 * treated as an owner to check; and ordinary partnerships, LLPs and trusts as kinds of claimant. NOT AGREED: the
 * solicitor checks each. The check is still switched off with AML_IN_SCOPE, and the level is never required to finish.
 */
export const RISK_LEVELS: Vocab = Object.freeze({ LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' });
export const AML_TEST_DEFAULTS = Object.freeze({
  status: 'TEST_DEFAULT_NOT_AGREED' as const,
  risk_levels: Object.keys(RISK_LEVELS),
  ownership_threshold_percent: 25,
  added_claimant_types: ['ORDINARY_PARTNERSHIP', 'LLP', 'TRUST'],
  awaiting: 'the solicitor (Word question 45)',
});

export const RISK_RATING_NOTE =
  'Test default, not agreed: rate the risk low, medium or high. Treat anyone who owns more than 25% as an owner to check. The solicitor checks both.';

/** Said wherever the pull is shown. */
export const PSC_SEPARATION =
  'We pull the Companies House list of people with significant control (PSC). We use it for the common-control test. ' +
  'It does NOT stand for beneficial ownership. To use an owner from it, record a separate, dated decision on the check.';

function refused(e: unknown): string {
  const m = (e as Error).message ?? String(e);
  return m.replace(/^E_[A-Z_]+: /, '').replace(/^.*constraint failed: /, 'a required field is missing or out of range: ');
}

function check<T>(c: Check<T>): T {
  if (!c.ok) throw new Refusal(c.why);
  return c.value;
}

class Refusal extends Error {}

function guarded(fn: () => WriteResult): WriteResult {
  try { return fn(); } catch (e) {
    if (e instanceof Refusal) return { ok: false, why: e.message };
    if (e instanceof NotFoundAsRefusal) throw e;
    if (e instanceof Error && /SQLITE|constraint|RAISE|E_[A-Z_]+|append-only|refus|kept|must|needs|never/i.test(e.message)) {
      return { ok: false, why: `Not recorded: ${refused(e)}` };
    }
    throw e;
  }
}

/* ================================================================== *
 * 2 · THE OFFICERS AND THE FIRM-WIDE RISK ASSESSMENT
 * ================================================================== */

export function recordOfficer(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const office = input['office'] ?? null;
    if (!has(OFFICES, office)) return { ok: false, why: 'Choose the office.' };
    const user_id = (input['user_id'] ?? '').trim();
    if (d.db.get<{ id: string }>("SELECT id FROM users WHERE id = ? AND role <> 'CLIENT' AND disabled_at IS NULL", [user_id]) === undefined) {
      return { ok: false, why: 'The officer is a member of staff with a working login.' };
    }
    const on = check(dateField(input['appointed_on'], 'The date of appointment'));
    if (on === null) return { ok: false, why: 'Give the date of appointment.' };
    const source = check(requiredText(input['source'], 1000, 'Where the appointment is named in writing'));
    const id = d.newId();
    d.db.run('INSERT INTO aml_officers (id, office, user_id, appointed_on, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, office, user_id, on, source, actor.id, d.now()]);
    record(d, actor, 'AML_OFFICER_RECORDED', 'ALLOWED', 'aml_officer', id, { office, user: user_id, change: 'APPOINTED' });
    return { ok: true, id };
  });
}

export function endOfficer(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const row = d.db.get<{ appointed_on: string; ended_on: string | null }>('SELECT appointed_on, ended_on FROM aml_officers WHERE id = ?', [id]);
    if (row === undefined) throw new NotFoundAsRefusal();
    if (row.ended_on !== null) return { ok: false, why: 'This appointment has ended already.' };
    const on = check(dateField(input['ended_on'], 'The date it ended'));
    if (on === null || on < row.appointed_on) return { ok: false, why: 'Give the date it ended, on or after the appointment.' };
    d.db.run('UPDATE aml_officers SET ended_on = ? WHERE id = ?', [on, id]);
    record(d, actor, 'AML_OFFICER_RECORDED', 'ALLOWED', 'aml_officer', id, { change: 'ENDED' });
    return { ok: true, id };
  });
}

export function recordRiskAssessment(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const on = check(dateField(input['assessed_on'], 'The date of the assessment'));
    if (on === null) return { ok: false, why: 'A firm-wide risk assessment is a dated document: give its date.' };
    const ref = check(requiredText(input['document_ref'], 500, 'Where the document is'));
    const covers = check(requiredText(input['covers'], 2000, 'What it covers'));
    const named = input['contingent_fee_named'] === 'YES' ? 1 : input['contingent_fee_named'] === 'NO' ? 0 : null;
    if (named === null) return { ok: false, why: 'Say whether it names the contingent fee as a risk factor — the paper requires it to.' };
    const id = d.newId();
    d.db.run('INSERT INTO aml_firm_risk_assessments (id, assessed_on, document_ref, covers, contingent_fee_named, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, on, ref, covers, named, actor.id, d.now()]);
    record(d, actor, 'AML_RISK_ASSESSMENT_RECORDED', 'ALLOWED', 'aml_risk_assessment', id, { assessed_on: on, contingent_fee_named: named === 1 });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * 3 · A CHECK
 * ================================================================== */

type CheckRow = {
  id: string; business_id: string; claim_id: string | null; claimant_type: string; claimant_type_note: string | null;
  identified: string | null; verification_method: string | null; register_ref: string | null; evidence_document_id: string | null;
  beneficial_ownership: string | null; authority_basis: string | null; authority_contact_id: string | null; authority_evidence: string | null;
  entity_status: string | null; sanctions_screen: string | null; sanctions_screened_on: string | null;
  risk_rating: string | null; risk_level: string | null; risk_rating_basis: string | null; checked_on: string | null; checked_by: string | null;
  state: string; completed_at: string | null; withdrawn_reason: string | null; created_at: string; updated_at: string;
};

const CHECK_SELECT =
  'SELECT id, business_id, claim_id, claimant_type, claimant_type_note, identified, verification_method, register_ref, evidence_document_id, ' +
  'beneficial_ownership, authority_basis, authority_contact_id, authority_evidence, entity_status, sanctions_screen, sanctions_screened_on, ' +
  'risk_rating, risk_level, risk_rating_basis, checked_on, checked_by, state, completed_at, withdrawn_reason, created_at, updated_at FROM cdd_checks ';

function loadCheck(db: Db, id: string): CheckRow {
  const r = db.get<CheckRow>(`${CHECK_SELECT}WHERE id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

export function openCheck(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const business_id = (input['business_id'] ?? '').trim();
    if (d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [business_id]) === undefined) return { ok: false, why: 'Choose the organisation.' };
    const claim_id = (input['claim_id'] ?? '').trim() || null;
    if (claim_id !== null && d.db.get<{ id: string }>('SELECT id FROM claims WHERE id = ? AND business_id = ?', [claim_id, business_id]) === undefined) {
      return { ok: false, why: 'That claim is not one of this organisation’s.' };
    }
    const type = input['claimant_type'] ?? null;
    if (!has(CLAIMANT_TYPES, type)) return { ok: false, why: 'Choose the kind of claimant, as the position paper lists them.' };
    const note = check(textField(input['claimant_type_note'], 1000, 'What kind of claimant it is'));
    if (type === 'OTHER' && note === null) return { ok: false, why: 'Say what kind of claimant this is — the paper does not cover it.' };
    const id = d.newId();
    const at = d.now();
    d.db.run(
      'INSERT INTO cdd_checks (id, business_id, claim_id, claimant_type, claimant_type_note, state, created_by, created_at, updated_at) ' +
        "VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)",
      [id, business_id, claim_id, type, note, actor.id, at, at]);
    record(d, actor, 'CDD_CHECK_CREATED', 'ALLOWED', 'cdd_check', id, { business: business_id, claim: claim_id, claimant_type: type });
    return { ok: true, id };
  });
}

const CHECK_FIELDS = ['identified', 'verification_method', 'register_ref', 'evidence_document_id', 'beneficial_ownership', 'authority_basis',
  'authority_contact_id', 'authority_evidence', 'entity_status', 'sanctions_screen', 'sanctions_screened_on', 'risk_rating',
  'risk_level', 'risk_rating_basis', 'checked_on'] as const;

export function updateCheck(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadCheck(d.db, id);
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'A finished or withdrawn check is kept as it was. Open a new check instead.' };
    const take = <K extends (typeof CHECK_FIELDS)[number]>(k: K, fn: (v: string | null) => Check<string | null>): string | null =>
      Object.hasOwn(input, k) ? check(fn(input[k] ?? null)) : c[k];
    const next = {
      identified: take('identified', (v) => textField(v, 2000, 'What was identified')),
      verification_method: take('verification_method', (v) => textField(v, 2000, 'How it was verified')),
      register_ref: take('register_ref', (v) => textField(v, 40, 'The register number')),
      evidence_document_id: take('evidence_document_id', (v) => textField(v, 100, 'The evidence document')),
      beneficial_ownership: take('beneficial_ownership', (v) => vocabField(v, BENEFICIAL_OWNERSHIP, 'Beneficial ownership')),
      authority_basis: take('authority_basis', (v) => vocabField(v, AUTHORITY_BASES, 'The authority to bind')),
      authority_contact_id: take('authority_contact_id', (v) => textField(v, 100, 'The person with authority')),
      authority_evidence: take('authority_evidence', (v) => textField(v, 2000, 'The evidence of authority')),
      entity_status: take('entity_status', (v) => vocabField(v, ENTITY_STATUSES, 'The entity’s status')),
      sanctions_screen: take('sanctions_screen', (v) => vocabField(v, SANCTIONS_RESULTS, 'The sanctions screen')),
      sanctions_screened_on: take('sanctions_screened_on', (v) => dateField(v, 'The date of the sanctions screen')),
      risk_rating: take('risk_rating', (v) => textField(v, 200, 'The risk rating')),
      risk_level: take('risk_level', (v) => vocabField(v, RISK_LEVELS, 'The risk level')),
      risk_rating_basis: take('risk_rating_basis', (v) => textField(v, 2000, 'Why that rating')),
      checked_on: take('checked_on', (v) => dateField(v, 'The date of the check')),
    };
    if (next.evidence_document_id !== null
      && d.db.get<{ id: string }>('SELECT id FROM documents WHERE id = ? AND business_id = ?', [next.evidence_document_id, c.business_id]) === undefined) {
      return { ok: false, why: 'The evidence document must be a document on the same organisation.' };
    }
    if (next.authority_contact_id !== null
      && d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ? AND business_id = ?', [next.authority_contact_id, c.business_id]) === undefined) {
      return { ok: false, why: 'The person with authority must be a contact of this organisation.' };
    }
    if (next.sanctions_screen !== null && next.sanctions_screened_on === null) return { ok: false, why: 'Give the date of the sanctions screen.' };
    const changed = CHECK_FIELDS.filter((k) => next[k] !== c[k]);
    d.db.run(
      'UPDATE cdd_checks SET identified = ?, verification_method = ?, register_ref = ?, evidence_document_id = ?, beneficial_ownership = ?, ' +
        'authority_basis = ?, authority_contact_id = ?, authority_evidence = ?, entity_status = ?, sanctions_screen = ?, sanctions_screened_on = ?, ' +
        'risk_rating = ?, risk_level = ?, risk_rating_basis = ?, checked_on = ?, checked_by = ?, updated_at = ? WHERE id = ?',
      [next.identified, next.verification_method, next.register_ref, next.evidence_document_id, next.beneficial_ownership, next.authority_basis,
        next.authority_contact_id, next.authority_evidence, next.entity_status, next.sanctions_screen, next.sanctions_screened_on,
        next.risk_rating, next.risk_level, next.risk_rating_basis, next.checked_on, next.checked_on === null ? null : actor.id, d.now(), id]);
    record(d, actor, 'CDD_CHECK_UPDATED', 'ALLOWED', 'cdd_check', id, { fields: changed });
    return { ok: true, id };
  });
}

/* ------------------------------------------------ the PSC pull, and the decision on it */

export type PscPullReading = {
  readonly source_row_id: string | null;
  readonly state: string;
  readonly retrieved_at: string | null;
  readonly reading: string;
};

export function pscPullReading(db: Db, business_id: string): PscPullReading {
  const r = db.get<{ id: string; state: string; retrieved_at: string | null; fired_at: string | null }>(
    "SELECT id, state, retrieved_at, fired_at FROM research_sources WHERE business_id = ? AND source_id = 'CH_PSC'", [business_id]);
  if (r === undefined) {
    return { source_row_id: null, state: 'NOT_RUN', retrieved_at: null, reading: `No PSC pull is recorded for this organisation. ${PSC_SEPARATION}` };
  }
  const at = r.retrieved_at ?? r.fired_at;
  return {
    source_row_id: r.id, state: r.state, retrieved_at: at,
    reading: `The PSC source is ${r.state.toLowerCase().replace(/_/g, ' ')}${at === null ? '' : `, retrieved ${ukDay(at)}`}. ${PSC_SEPARATION}`,
  };
}

export function recordPscDecision(d: ComplianceDeps, actor: Actor, check_id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadCheck(d.db, check_id);
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'A decision is recorded on an open check.' };
    const pull = pscPullReading(d.db, c.business_id);
    if (pull.source_row_id === null) return { ok: false, why: 'There is no PSC pull for this organisation to decide about.' };
    const decision = input['decision'] ?? null;
    if (!has(PSC_DECISIONS, decision)) return { ok: false, why: 'Say whether the pull is relied on for beneficial ownership.' };
    const reasoning = check(requiredText(input['reasoning'], 4000, 'Why'));
    const on = check(dateField(input['decided_on'], 'The date of the decision'));
    if (on === null) return { ok: false, why: 'The decision is dated.' };
    const id = d.newId();
    d.db.run(
      'INSERT INTO cdd_psc_decisions (id, check_id, research_source_id, pull_retrieved_at, decision, reasoning, decided_on, decided_by, recorded_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, check_id, pull.source_row_id, pull.retrieved_at, decision, reasoning, on, actor.id, d.now()]);
    record(d, actor, 'CDD_PSC_DECISION_RECORDED', 'ALLOWED', 'cdd_psc_decision', id, { check: check_id, decision, decided_on: on });
    return { ok: true, id };
  });
}

export function recordOwner(d: ComplianceDeps, actor: Actor, check_id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadCheck(d.db, check_id);
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'An owner is recorded on an open check.' };
    const contact_id = (input['contact_id'] ?? '').trim();
    if (d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ? AND business_id = ?', [contact_id, c.business_id]) === undefined) {
      return { ok: false, why: 'A beneficial owner must be a contact of this organisation. Add them as a contact first, so we hold one record of them.' };
    }
    const basis = check(requiredText(input['basis_of_control'], 1000, 'The ownership or control, as the evidence shows it'));
    const from = input['identified_from'] ?? null;
    if (!has(OWNER_SOURCES, from)) return { ok: false, why: 'Say where the owner was identified from.' };
    const doc = check(textField(input['evidence_document_id'], 100, 'The evidence document'));
    let decision: string | null = null;
    if (from === 'EVIDENCE_DOCUMENT') {
      if (doc === null || d.db.get<{ id: string }>('SELECT id FROM documents WHERE id = ? AND business_id = ?', [doc, c.business_id]) === undefined) {
        return { ok: false, why: 'Name the evidence document, on this organisation.' };
      }
    } else {
      const relied = d.db.get<{ id: string }>(
        "SELECT id FROM cdd_psc_decisions WHERE check_id = ? AND decision = 'RELIED_ON_FOR_BENEFICIAL_OWNERSHIP' ORDER BY rowid DESC LIMIT 1", [check_id]);
      if (relied === undefined) {
        record(d, actor, 'CDD_OWNER_RECORDED', 'REFUSED', 'cdd_check', check_id, { reason: 'E_PSC_NOT_BENEFICIAL_OWNERSHIP' });
        return { ok: false, why: `The PSC pull has not been relied on for beneficial ownership on this check. ${PSC_SEPARATION}` };
      }
      decision = relied.id;
    }
    const verified = check(textField(input['verified_how'], 2000, 'How the owner was verified'));
    const id = d.newId();
    d.db.run(
      'INSERT INTO cdd_beneficial_owners (id, check_id, contact_id, basis_of_control, identified_from, evidence_document_id, psc_decision_id, verified_how, recorded_by, recorded_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, check_id, contact_id, basis, from, from === 'EVIDENCE_DOCUMENT' ? doc : null, decision, verified, actor.id, d.now()]);
    record(d, actor, 'CDD_OWNER_RECORDED', 'ALLOWED', 'cdd_owner', id, { check: check_id, contact: contact_id, identified_from: from });
    return { ok: true, id };
  });
}

/** What a check still lacks before it can finish, in words. Empty when it can. */
export function missingForCompletion(db: Db, c: CheckRow): string[] {
  const out: string[] = [];
  if (c.identified === null) out.push('what was identified');
  // PHASE 151b: a PASS from the online identity check is evidence of how identity was verified (it also fills the field).
  if (c.verification_method === null && !identityPassed(db, c.id)) out.push('how it was verified');
  if (c.evidence_document_id === null && c.register_ref === null) out.push('the evidence document or the register number');
  if (c.beneficial_ownership === null) out.push('the beneficial ownership position');
  if (c.beneficial_ownership === 'RECORDED'
    && (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM cdd_beneficial_owners WHERE check_id = ?', [c.id])?.n ?? 0) === 0) {
    out.push('at least one beneficial owner');
  }
  if (c.authority_basis === null) out.push('the authority to bind');
  if (c.authority_evidence === null) out.push('the evidence of that authority');
  if (c.checked_on === null) out.push('the date of the check');
  return out;
}

export function completeCheck(d: ComplianceDeps, actor: Actor, id: string): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadCheck(d.db, id);
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'This check is not open.' };
    const missing = missingForCompletion(d.db, c);
    if (missing.length > 0) return { ok: false, why: `Not finished — it still needs ${missing.join(', ')}.` };
    const at = d.now();
    d.db.run("UPDATE cdd_checks SET state = 'COMPLETE', completed_at = ?, updated_at = ? WHERE id = ?", [at, at, id]);
    record(d, actor, 'CDD_CHECK_COMPLETED', 'ALLOWED', 'cdd_check', id, { business: c.business_id });
    return { ok: true, id };
  });
}

export function withdrawCheck(d: ComplianceDeps, actor: Actor, id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const c = loadCheck(d.db, id);
    if (c.state !== 'IN_PROGRESS') return { ok: false, why: 'Only an open check is withdrawn.' };
    const reason = check(requiredText(input['withdrawn_reason'], 2000, 'Why it is withdrawn'));
    d.db.run("UPDATE cdd_checks SET state = 'WITHDRAWN', withdrawn_reason = ?, updated_at = ? WHERE id = ?", [reason, d.now(), id]);
    record(d, actor, 'CDD_CHECK_WITHDRAWN', 'ALLOWED', 'cdd_check', id, {});
    return { ok: true, id };
  });
}

export function addMonitoringNote(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    const business_id = (input['business_id'] ?? '').trim();
    if (d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [business_id]) === undefined) return { ok: false, why: 'Choose the organisation.' };
    const check_id = check(textField(input['check_id'], 100, 'The check'));
    if (check_id !== null && d.db.get<{ id: string }>('SELECT id FROM cdd_checks WHERE id = ? AND business_id = ?', [check_id, business_id]) === undefined) {
      return { ok: false, why: 'That check is not one of this organisation’s.' };
    }
    const on = check(dateField(input['noted_on'], 'The date'));
    if (on === null) return { ok: false, why: 'Date the note.' };
    const note = check(requiredText(input['note'], 4000, 'The note'));
    const id = d.newId();
    d.db.run('INSERT INTO cdd_monitoring_notes (id, business_id, check_id, noted_on, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, business_id, check_id, on, note, actor.id, d.now()]);
    record(d, actor, 'CDD_MONITORING_NOTED', 'ALLOWED', 'cdd_monitoring_note', id, { business: business_id, check: check_id });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * 4 · THE VIEWS
 * ================================================================== */

export type AmlView = {
  readonly in_scope: SettingReading;
  readonly in_force: boolean;
  readonly effect: string;
  readonly limitation: string;
  readonly officers: { id: string; office: string; who: string; appointed_on: string; ended_on: string | null; source: string }[];
  readonly risk_assessment: { assessed_on: string; document_ref: string; covers: string; contingent_fee_named: boolean; review_due: string } | null;
  readonly risk_assessment_reading: string;
  readonly checks: { id: string; business_id: string; organisation: string; claimant_type: string; state: string; completed_at: string | null }[];
  readonly psc_separation: string;
  readonly risk_rating_note: string;
};

function plusYear(day: string): string {
  const y = Number(day.slice(0, 4)) + 1;
  const md = day.slice(5);
  return md === '02-29' ? `${y}-02-28` : `${y}-${md}`;
}

export function amlView(db: Db, actor: Actor, today: string): AmlView {
  assertComplianceRead(actor);
  const scope = settingReading(db, 'AML_IN_SCOPE', today);
  const inForce = scope.value === 'true';
  const ra = db.get<{ assessed_on: string; document_ref: string; covers: string; contingent_fee_named: number }>(
    'SELECT assessed_on, document_ref, covers, contingent_fee_named FROM aml_firm_risk_assessments ORDER BY assessed_on DESC, rowid DESC LIMIT 1');
  return {
    in_scope: scope, in_force: inForce,
    effect: inForce
      ? 'ON — a claim cannot pass the engagement step until its organisation has a finished check.'
      : 'OFF — nothing here blocks a claim. The register can still be kept. Whether it must be is with the accountant and a solicitor.',
    limitation: TWO_PERSON_LIMITATION,
    officers: db.all<{ id: string; office: string; who: string; appointed_on: string; ended_on: string | null; source: string }>(
      'SELECT o.id, o.office, u.display_name AS who, o.appointed_on, o.ended_on, o.source FROM aml_officers o JOIN users u ON u.id = o.user_id ORDER BY o.appointed_on DESC')
      .map((o) => ({ ...o, office: words(OFFICES, o.office, o.office) })),
    risk_assessment: ra === undefined ? null
      : { assessed_on: ra.assessed_on, document_ref: ra.document_ref, covers: ra.covers, contingent_fee_named: ra.contingent_fee_named === 1, review_due: plusYear(ra.assessed_on) },
    risk_assessment_reading: ra === undefined
      ? 'No firm-wide risk assessment is recorded. The paper wants one — a few pages, naming the contingent fee — reviewed at least annually.'
      : `Dated ${ra.assessed_on}; the paper wants it reviewed at least annually, so by ${plusYear(ra.assessed_on)}${plusYear(ra.assessed_on) < ukDay(today) ? ' — OVERDUE' : ''}.`,
    checks: db.all<{ id: string; business_id: string; organisation: string; claimant_type: string; state: string; completed_at: string | null }>(
      'SELECT k.id, k.business_id, b.name AS organisation, k.claimant_type, k.state, k.completed_at FROM cdd_checks k JOIN businesses b ON b.id = k.business_id ' +
        'ORDER BY k.created_at DESC LIMIT 500')
      .map((k) => ({ ...k, claimant_type: words(CLAIMANT_TYPES, k.claimant_type, k.claimant_type) })),
    psc_separation: PSC_SEPARATION,
    risk_rating_note: RISK_RATING_NOTE,
  };
}

export type CheckView = {
  readonly check: CheckRow & { organisation: string; claimant_label: string };
  readonly guide: ClaimantGuide;
  readonly owners: { id: string; contact_id: string; contact: string; basis_of_control: string; identified_from: string; psc_decision_id: string | null; verified_how: string | null }[];
  readonly psc_pull: PscPullReading;
  readonly psc_decisions: { id: string; decision: string; reasoning: string; decided_on: string; pull_retrieved_at: string | null }[];
  readonly notes: { noted_on: string; note: string }[];
  readonly missing: string[];
  readonly contacts: { id: string; full_name: string }[];
  readonly documents: { id: string; label: string }[];
  readonly limitation: string;
};

export function checkView(db: Db, actor: Actor, id: string): CheckView {
  assertComplianceRead(actor);
  const c = loadCheck(db, id);
  const org = db.get<{ name: string }>('SELECT name FROM businesses WHERE id = ?', [c.business_id])?.name ?? '';
  return {
    check: { ...c, organisation: org, claimant_label: words(CLAIMANT_TYPES, c.claimant_type, c.claimant_type) },
    guide: CLAIMANT_GUIDE[c.claimant_type] ?? (CLAIMANT_GUIDE['OTHER'] as ClaimantGuide),
    owners: db.all<{ id: string; contact_id: string; contact: string; basis_of_control: string; identified_from: string; psc_decision_id: string | null; verified_how: string | null }>(
      'SELECT o.id, o.contact_id, c.full_name AS contact, o.basis_of_control, o.identified_from, o.psc_decision_id, o.verified_how ' +
        'FROM cdd_beneficial_owners o JOIN contacts c ON c.id = o.contact_id WHERE o.check_id = ? ORDER BY o.recorded_at', [id]),
    psc_pull: pscPullReading(db, c.business_id),
    psc_decisions: db.all<{ id: string; decision: string; reasoning: string; decided_on: string; pull_retrieved_at: string | null }>(
      'SELECT id, decision, reasoning, decided_on, pull_retrieved_at FROM cdd_psc_decisions WHERE check_id = ? ORDER BY rowid', [id]),
    notes: db.all<{ noted_on: string; note: string }>('SELECT noted_on, note FROM cdd_monitoring_notes WHERE business_id = ? ORDER BY noted_on DESC', [c.business_id]),
    missing: c.state === 'IN_PROGRESS' ? missingForCompletion(db, c) : [],
    contacts: db.all<{ id: string; full_name: string }>('SELECT id, full_name FROM contacts WHERE business_id = ? ORDER BY full_name', [c.business_id]),
    documents: db.all<{ id: string; label: string }>(
      "SELECT d.id, COALESCE(d.type_code, 'document') || ' v' || COALESCE(d.version_no, 1) AS label FROM documents d WHERE d.business_id = ? ORDER BY d.created_at DESC",
      [c.business_id]),
    limitation: TWO_PERSON_LIMITATION,
  };
}
