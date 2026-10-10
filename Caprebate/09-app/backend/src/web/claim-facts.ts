/**
 * THE CLAIM'S CAPITAL ALLOWANCES FACTS — CRM 6 of 10, 11 September 2026.
 *
 * The schema is migration 015; the scope is 09-app/CAPREBATE-CRM-DISPOSITION.md
 * Part B2; the figures, the sign-off, the deliverables and aftercare are
 * src/web/claim-record.ts. The routes and pages are src/web/claim-record-pages.ts,
 * which draws what these return and decides nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR RULES, AND EVERY FUNCTION BELOW KEEPS ALL OF THEM
 *
 * 1 · DERIVED FIRST, CAPTURED ONLY WHERE NOTHING DERIVES IT. The claimant type is
 *     the organisation's; the jurisdiction is the property's postcode; the
 *     acquisition date is the property's; taxable profit is the client's own
 *     answer read through src/web/funnel-session.ts and its break-even switch;
 *     the amendment window is CB_CASH's; the election's notification clock is
 *     CB_ELECTION's. WHERE A FACT IS DERIVED, THE STORE REFUSES A RECORDED ONE.
 *
 * 2 · EVERY VALUE CARRIES ITS SOURCE, in the source register's pattern
 *     (04-phase-work/phase3/caprebate-source-register.ts): the register's own
 *     source id, its publisher and provenance code, whether it was derived, and
 *     exactly where it was read.
 *
 * 3 · N4. A fact recorded as not known and a fact nobody asked read the same —
 *     `known: false`, `value: null`, the same words — and neither opens a gate.
 *     Every gate reading below is asserted in test/claim-record.test.ts on the
 *     recorded UNKNOWN AND on the absent row.
 *
 * 4 · READERS. The panel is ADMIN's and SALES's (`claim_facts.read`). ACCOUNTING
 *     never reaches it. A SURVEYOR on an assigned job receives only the RELEASED
 *     inputs, assembled forwards by src/payload.ts from `releasedFactReader` —
 *     which can read nothing that is not on that list.
 */

import { registerCompany, yearEndFrom, dormantWarning, propertyTenure, ROLE_LABELS, type YearEndReading } from './who-claims.ts';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { SOURCES as REGISTER_SOURCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';
import { amendmentWindow, ctaSwitchReadings, electionNotifiedInTime, type EngineWindow, type SectorId } from './engine.ts';
import { packSwitchReadings } from './money-readings.ts';
import { TAXONOMY_SECTOR, taxonomy } from './pack-lines.ts';
import type { PackGrant } from './pack-grants.ts';
import {
  CLAIMANT_TYPES, OWNER_ROLE_TOKENS, WORKSTREAMS, claimObjFor, claimantTypeForGate, isCompanyOrRoleToken, propertyJurisdiction,
} from './crm.ts';
import { FUNNEL_SWITCHES, funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
import { localStamp, ukDate } from './localtime.ts';
import { formatPence, toPence } from './shown-range.ts';
import { VOIDING_REOPEN_STAGES } from './valuation-lock.ts';
import type { PostcodeStore } from './postcode-port.ts';

export type FactDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. A refusal
 *  about the record's own state — a grant already withdrawn, a position already taken — carries none. */
export type FactResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
export type Fields = Readonly<Record<string, string | null>>;
type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

/** THE ONE WORDING FOR A FACT THAT IS NOT KNOWN — recorded as not known, or never asked. */
export const NOT_KNOWN = 'not known';

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

/** The source register's ids a person can speak for when recording a fact. */
export const CAPTURE_SOURCES: Vocab = Object.freeze({
  CLIENT_ANSWER: 'The client told us',
  CLIENT_DOC: 'A document the client supplied',
  SURVEYOR: 'The surveyor',
  CTA: 'The chartered tax adviser',
});

export const YES_NO: Vocab = Object.freeze({ YES: 'Yes', NO: 'No' });

/** Rulebook F's payer classes, in its own words. A class, never a name. */
export const PAYER_CLASSES: Vocab = Object.freeze({
  nhs: 'The NHS (an NHS improvement grant or premises funding)', local_authority: 'A local authority', homes_england_gla: 'Homes England or the GLA',
  other_public: 'Another public body', landlord_unconnected: 'A landlord not connected to the client',
  landlord_connected: 'A landlord connected to the client', group_company: 'A company in the client’s group',
  charity: 'A charity', individual: 'A private person — not named here', insurer: 'An insurer', UNKNOWN: 'Not known',
});

export const AMOUNT_BASES: Vocab = Object.freeze({
  agreement: 'The funding agreement', client_estimate: 'The client’s estimate', inferred: 'Our own working-out', UNKNOWN: 'Not known',
});

export const TRACED: Vocab = Object.freeze({ YES: 'Matched to the items it paid for', NO: 'Not matched yet', UNKNOWN: 'Not known' });

type FactKind = 'date' | 'pence' | 'choice' | 'text';

type FactDef = { readonly label: string; readonly kind: FactKind; readonly choices?: Vocab };

/**
 * EVERY FACT THE CLAIM CAPTURES — the migration's trigger holds the same list.
 * A fact a better source derives is NOT here as a key at all (the claimant
 * type, the jurisdiction, the acquisition date, the window), except taxable
 * profit, which is captured only where the client's own answer did not settle it.
 */
export const FACTS: Readonly<Record<string, FactDef>> = Object.freeze({
  ACCOUNTING_PERIOD_START: { label: 'The accounting period the spend falls in — its first day', kind: 'date' },
  ACCOUNTING_PERIOD_END: { label: 'The accounting period the spend falls in — its last day', kind: 'date' },
  SUFFICIENT_PROFIT: {
    label: 'Enough taxable profit for the allowance to produce cash in that period', kind: 'choice',
    choices: Object.freeze({ YES: 'Yes — profitable enough', NO: 'No — around break-even, or a loss' }),
  },
  AIA_HEADROOM: {
    label: 'Annual Investment Allowance headroom left in that period', kind: 'choice',
    choices: Object.freeze({ AVAILABLE: 'Some is left', NONE: 'None is left — used elsewhere or across the group' }),
  },
  AIA_HEADROOM_AMOUNT: { label: 'How much Annual Investment Allowance headroom is left', kind: 'pence' },
  POOL_SPLIT_MAIN: { label: 'Main pool additions', kind: 'pence' },
  POOL_SPLIT_SPECIAL: { label: 'Special rate pool additions', kind: 'pence' },
  SBA_QUALIFYING_EXPENDITURE: { label: 'Structures and buildings allowance: the spend that counts', kind: 'pence' },
  ELECTION_EXISTS: { label: 'A s.198 or s.199 election affects the property', kind: 'choice', choices: YES_NO },
  ELECTION_SECTION: {
    label: 'The section it was made under', kind: 'choice',
    choices: Object.freeze({ S198: 's.198 — a sale, or a lease premium with no s.183 election', S199: 's.199 — a lease premium with a joint s.183 election' }),
  },
  ELECTION_NOTIFIED_ON: { label: 'The date it was notified to HMRC', kind: 'date' },
  ELECTION_VALUE: { label: 'The value it fixes — a nominal figure is valid', kind: 'pence' },
  ELECTION_ELEMENTS: { label: 'The fixtures it covers, element by element', kind: 'text' },
  ELECTION_TRIBUNAL_APPLIED_ON: { label: 'The date a tribunal application was made (s.187A(7)(a))', kind: 'date' },
  ELECTION_TRIBUNAL_STATUS: {
    label: 'Where that tribunal application stands', kind: 'choice',
    choices: Object.freeze({ UNDETERMINED: 'Lodged and not yet determined', DETERMINED: 'Determined' }),
  },
  GRANTS_EXIST: { label: 'Did anyone else pay for any of this work?', kind: 'choice', choices: YES_NO },
  ACQUISITION_COSTS: { label: 'Incidental acquisition costs — legal and other fees', kind: 'pence' },
  TRANSACTION_TAX: { label: 'Land transaction tax paid on the purchase', kind: 'pence' },
  BUYER_ALTERATIONS: { label: 'The buyer made their own alterations to install plant', kind: 'choice', choices: YES_NO },
  BUYER_ALTERATIONS_AMOUNT: { label: 'What the buyer’s own alterations cost', kind: 'pence' },
  SCOTTISH_TAXPAYER: { label: 'The claimant is a Scottish taxpayer — where they live, not where the property is', kind: 'choice', choices: YES_NO },
  /* Phase 132 — TMA 1970 s.12ABA(4)(b) and s.12AA(5B): a company partner puts the partnership return on the company
     filing date. Read by amendmentWindowReading for an LLP or a partnership only; migration 024 adds the key. */
  PARTNERSHIP_HAS_COMPANY_MEMBER: {
    label: 'A partner or LLP member is a company — which puts the partnership return on the company filing date', kind: 'choice', choices: YES_NO,
  },
  /* Phase 151 — whether the sale contract and the CPSE replies must arrive (Word answer 47, question 220). Migration
     045 adds the key. */
  BOUGHT_THE_BUILDING: { label: 'The client bought the building, rather than built or refitted it', kind: 'choice', choices: YES_NO },
  /* Phase 159d — "do you still own it": W2 (the window closed, the spend pooled in the first open period) needs it. YES
     only on evidence — the client's checked answer, or the title register — and never with a sale date on the
     property. Migration 106 adds the key. Read by src/web/claim-route.ts. */
  STILL_OWNED: { label: 'The client still owns the building today', kind: 'choice', choices: YES_NO },
  /* Phase 159e — the allowances on each event (src/web/allowances.ts). Migration 107 adds the three keys. N4: not recorded
     grants nothing. CASH_BASIS: on the cash basis there is no claim on fixtures for the period (OUR READING, Word
     question 260). BOUGHT_NEW_FROM_DEVELOPER: a building bought new and unused from its developer is not second-hand, so
     full expensing and the first-year allowances are open to it (OUR READING, Word question 258). SBA_STATEMENT_HELD: the
     seller's structures allowance statement is on file, so SBA_QUALIFYING_EXPENDITURE is the figure the buyer's
     allowance runs on (s.270IA). */
  CASH_BASIS: {
    label: 'How the accounts for the period are drawn up: the cash basis, or accruals', kind: 'choice',
    choices: Object.freeze({ CASH: 'The cash basis — no claim on fixtures for the period', ACCRUALS: 'Accruals — the usual basis' }),
  },
  BOUGHT_NEW_FROM_DEVELOPER: { label: 'The building was bought new and never used, from the developer who built it', kind: 'choice', choices: YES_NO },
  SBA_STATEMENT_HELD: { label: 'The seller’s structures and buildings allowance statement is on file', kind: 'choice', choices: YES_NO },
  /* PHASE 159i (item 2, migration 110): a VAT capital goods scheme adjustment on the building, in pounds. A fact and a note: the
     survey pack shows it beside the VAT that counts and does not change the figure; the tax adviser says how it reaches the claim. */
  VAT_CGS_ADJUSTMENT: { label: 'A VAT capital goods scheme adjustment on the building (a note, not counted)', kind: 'pence' },
  /* Phase 153a, 4 October 2026 (Phase 153b lines 12 and 13, with the same grant data). Migration 078 adds both keys.
     Read by src/web/grant-checks.ts, the gate out of valuation. */
  GRANT_PROVIDER_CHECKED: {
    label: 'The client has checked with whoever paid the grant that claiming will not make them pay it back', kind: 'choice', choices: YES_NO,
  },
  GRANT_SPLIT_ADVISER_VIEW: {
    label: 'The tax adviser has said how to split a grant with no breakdown. Only counts if the tax adviser told us',
    kind: 'choice', choices: YES_NO,
  },
});

/* ================================================================== *
 * 2 · THE SOURCE PATTERN
 * ================================================================== */

export type FactSource = {
  /** The source register's own id, where the source is one of its sources. */
  readonly source_id: string | null;
  readonly publisher: string;
  /** The register's provenance code — CA, CD, SV, CTA, API, DR — or null for a staff record on another page. */
  readonly prov: string | null;
  readonly derived: boolean;
  /** Exactly what was read: a table and row, a module and function, a page. */
  readonly locator: string;
  readonly recorded_at: string | null;
  readonly recorded_by: string | null;
};

export type FactReading = {
  readonly key: string;
  readonly label: string;
  /** True only on a value. A recorded UNKNOWN and silence are both false. */
  readonly known: boolean;
  readonly value: string | null;
  readonly display: string;
  /** Present where something was recorded or derived — a recorded UNKNOWN has one, silence has none. */
  readonly source: FactSource | null;
  /** False where a better source derives the fact, so the store refuses a recorded one. */
  readonly capturable: boolean;
};

function registerSource(id: string, derived: boolean, locator: string, at: string | null, by: string | null): FactSource {
  const s = REGISTER_SOURCES.find((x) => x.source_id === id);
  return {
    source_id: id, publisher: s?.publisher ?? id, prov: derived ? 'DR' : (s?.default_prov ?? null),
    derived, locator, recorded_at: at === null ? null : localStamp(at), recorded_by: by,
  };
}

function staffSource(locator: string): FactSource {
  return { source_id: null, publisher: 'Cap Rebate staff', prov: null, derived: false, locator, recorded_at: null, recorded_by: null };
}

function unknown(key: string, label: string, capturable: boolean, source: FactSource | null): FactReading {
  return { key, label, known: false, value: null, display: NOT_KNOWN, source, capturable };
}

/* ================================================================== *
 * 3 · THE CLAIM, AS THIS FILE READS IT
 * ================================================================== */

type ClaimRow = {
  id: string; business_id: string; property_id: string | null; assessment_id: string | null; workstream: string; stage: string | null;
};

export function loadFactClaim(db: Db, id: string): ClaimRow {
  const c = db.get<ClaimRow>('SELECT id, business_id, property_id, assessment_id, workstream, stage FROM claims WHERE id = ?', [id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

export function factsObj(db: Db, c: { id: string; business_id: string }): Extract<Obj, { type: 'claim_facts' }> {
  return { type: 'claim_facts', id: c.id, business_id: c.business_id, assigned_surveyor_ids: claimObjFor(db, c).assigned_surveyor_ids };
}

type FactRow = {
  id: string; fact_key: string; answer: string; value_text: string | null; value_pence: number | null; value_date: string | null;
  source_id: string; note: string | null; recorded_at: string; recorder: string | null;
};

/** The latest recorded answer per key — by time, then by insertion. */
export function latestFacts(db: Db, claim_id: string): Map<string, FactRow> {
  const rows = db.all<FactRow & { seq: number }>(
    'SELECT f.rowid AS seq, f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
      'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by WHERE f.claim_id = ? ' +
      'ORDER BY f.recorded_at ASC, f.rowid ASC',
    [claim_id]);
  const out = new Map<string, FactRow>();
  for (const r of rows) out.set(r.fact_key, r);
  return out;
}

function rowValue(r: FactRow): string | null {
  if (r.answer !== 'VALUE') return null;
  return r.value_date ?? r.value_text ?? (r.value_pence === null ? null : String(r.value_pence));
}

/** Phase 139: exported so the Approve box reads a recorded fact exactly as the facts panel does. */
export function captured(facts: Map<string, FactRow>, key: string): FactReading {
  const def = FACTS[key];
  const label = def?.label ?? key;
  const r = facts.get(key);
  if (r === undefined) return unknown(key, label, true, null);
  const src = registerSource(r.source_id, false, `record ${r.id}`, r.recorded_at, r.recorder ?? 'a former user');
  const value = rowValue(r);
  if (value === null) return unknown(key, label, true, src);
  const display = def?.kind === 'pence' && r.value_pence !== null ? formatPence(r.value_pence)
    : def?.kind === 'choice' && def.choices !== undefined ? (def.choices[value] ?? value) : value;
  return { key, label, known: true, value, display, source: src, capturable: true };
}

/* ================================================================== *
 * 4 · THE DERIVED FACTS
 * ================================================================== */

/** The organisation's claimant type, derived or recorded there. Never captured on the claim. */
export function claimantTypeReading(db: Db, business_id: string): FactReading {
  const t = claimantTypeForGate(db, business_id);
  const label = 'The claimant, for tax';
  if (t.value === null) return unknown('CLAIMANT_TYPE', label, false, null);
  const derived = t.source === 'the client’s own answer in the assessment';
  return {
    key: 'CLAIMANT_TYPE', label, known: true, value: t.value, display: CLAIMANT_TYPES[t.value] ?? t.value, capturable: false,
    source: derived ? registerSource('CLIENT_ANSWER', false, 'the client’s answer in the latest assessment', null, null)
      : staffSource('the organisation record'),
  };
}

export function jurisdictionReading(db: Db, property_id: string | null, store?: PostcodeStore | null): FactReading {
  const j = propertyJurisdiction(db, property_id, store);
  const label = 'Jurisdiction of the property';
  if (j.value === null) return unknown('JURISDICTION', label, false, null);
  return {
    key: 'JURISDICTION', label, known: true, value: j.value, display: j.label, capturable: false,
    source: j.derived ? registerSource('ONS_POSTCODE', true, 'the property’s postcode', null, null)
      : staffSource('the property record'),
  };
}

/**
 * PHASE 157c (the Friary House run, F14): what the client said at the assessment about this property's purchase - its
 * rough date ("06/2019") - found by the property's own address among the assessment's answers. Shown beside an unknown
 * acquisition date, never stored as it: the client gave a month and a rough figure, not a completion date (N4).
 */
export function clientSaidPurchaseDate(db: Db, property_id: string): string | null {
  const p = db.get<{ business_id: string; label: string }>('SELECT business_id, label FROM properties WHERE id = ?', [property_id]);
  if (p === undefined) return null;
  const a = db.get<{ id: string }>('SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [p.business_id]);
  if (a === undefined) return null;
  const at = db.get<{ question_id: string }>(
    "SELECT question_id FROM assessment_answers WHERE assessment_id = ? AND question_id LIKE 'Q2-%-address' AND state = 'ANSWERED' AND value = ?",
    [a.id, p.label]);
  const n = at === undefined ? null : /^Q2-(\d+)-address$/.exec(at.question_id)?.[1] ?? null;
  if (n === null) return null;
  const trigger = db.get<{ value: string | null }>("SELECT value FROM assessment_answers WHERE assessment_id = ? AND question_id = ? AND state = 'ANSWERED'", [a.id, `Q2-${n}-trigger`])?.value;
  if (trigger !== 'purchase') return null;
  return db.get<{ value: string | null }>("SELECT value FROM assessment_answers WHERE assessment_id = ? AND question_id = ? AND state = 'ANSWERED'", [a.id, `Q2-${n}-date`])?.value ?? null;
}

/**
 * PHASE 158b (the Friary House run, F28): whether the client said at the assessment that they bought this property -
 * its own "how did you come by this one?" answer, found by the property's address (or, with one building on both
 * sides, the only one). 'YES' for a purchase, 'NO' for a build, a refurbishment or a fit-out, null where it cannot be
 * told. Read where the claim's own fact BOUGHT_THE_BUILDING is not recorded; a fact staff record always wins.
 */
export function clientSaidBought(db: Db, property_id: string | null): 'YES' | 'NO' | null {
  if (property_id === null) return null;
  const p = db.get<{ business_id: string; label: string }>('SELECT business_id, label FROM properties WHERE id = ?', [property_id]);
  if (p === undefined) return null;
  const a = db.get<{ id: string }>('SELECT id FROM assessments WHERE business_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1', [p.business_id]);
  if (a === undefined) return null;
  const answers = db.all<{ question_id: string; value: string | null }>(
    "SELECT question_id, value FROM assessment_answers WHERE assessment_id = ? AND state = 'ANSWERED' AND (question_id LIKE 'Q2-%-address' OR question_id LIKE 'Q2-%-trigger')", [a.id]);
  const at = answers.find((x) => /^Q2-\d+-address$/.test(x.question_id) && x.value === p.label);
  const triggers = answers.filter((x) => /^Q2-\d+-trigger$/.test(x.question_id));
  const props = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM properties WHERE business_id = ?', [p.business_id])?.n ?? 0;
  const n = at !== undefined ? /^Q2-(\d+)-address$/.exec(at.question_id)?.[1] ?? null
    : triggers.length === 1 && props === 1 ? /^Q2-(\d+)-trigger$/.exec(triggers[0]?.question_id ?? '')?.[1] ?? null : null;
  if (n === null) return null;
  const t = triggers.find((x) => x.question_id === `Q2-${n}-trigger`)?.value ?? null;
  return t === 'purchase' ? 'YES' : t === 'new_build' || t === 'refurb' || t === 'fit_out' ? 'NO' : null;
}

/**
 * PHASE 158c (F37, the Friary House run): THE WINDOW, WARNED EARLY. The amendment window was first tested at Reports, so a
 * client who said "06/2019" at the assessment went through the letter, the paid research and the survey first. From
 * Engagement until Reports, where the client's own date (and nothing recorded yet settles it) puts the window out of reach
 * even on the most generous reading - the latest accounting period the spend could fall in, twelve months on, and the
 * later of the rules where the client's kind is not known - the claim page says so. It warns; it never stops a claim.
 */
const BEFORE_REPORTS: ReadonlySet<string> = new Set(['ENGAGEMENT', 'DATA_GATHERING', 'SURVEY', 'VALUATION', 'TAX_ADVISER_SIGNOFF']);

export function earlyWindowWarning(db: Db, c: { readonly stage: string | null; readonly business_id: string; readonly property_id: string | null }, todayIso: string): string | null {
  if (c.stage === null || !BEFORE_REPORTS.has(c.stage) || c.property_id === null) return null;
  const said = clientSaidPurchaseDate(db, c.property_id)?.trim() ?? null;
  if (said === null) return null;
  const my = /^(\d{1,2})\/(\d{4})$/.exec(said);
  const yo = /^(\d{4})$/.exec(said);
  const spend = my !== null ? new Date(Date.UTC(Number(my[2]), Number(my[1]), 0)) : yo !== null ? new Date(Date.UTC(Number(yo[1]), 11, 31)) : null;
  if (spend === null || Number.isNaN(spend.getTime())) return null;
  const end = new Date(Date.UTC(spend.getUTCFullYear() + 1, spend.getUTCMonth(), spend.getUTCDate())).toISOString().slice(0, 10);
  const t = claimantTypeForGate(db, c.business_id).value;
  const kinds: readonly ('company' | 'partnership' | 'self_assessment')[] = t === 'COMPANY' ? ['company']
    : t === 'PARTNERSHIP' || t === 'LLP' ? ['partnership'] : t === null || t === 'CHARITY' ? ['company', 'self_assessment']
    : t === 'CHARITY_COMPANY' ? ['company'] : ['self_assessment'];   // PHASE 159d (C24): a charitable trust is self assessment
  const windows = kinds.map((k) => amendmentWindow(end, k, todayIso, null));
  if (windows.some((w) => !w.known || w.in_time)) return null;
  const latest = windows.map((w) => (w.known ? w.deadline : '')).sort().at(-1) ?? '';
  /* PHASE 159d: a closed old return is not the end. While the client owns the building the spend goes into this year's
     pool (W2), written down over the years ahead, with no refund of past tax (src/web/claim-route.ts). */
  return `On the client’s own date (${said}) the return for that year has most likely closed. Even on the latest accounting period the spend could fall in, it closed on ${ukDate(latest)}. ` +
    'The old return is closed; the relief comes through this year’s pool instead, while the client still owns the building. It is written down over the years ahead, with no refund of past tax. ' +
    'Check the dates, and that they still own it, with the client before the paid research. This is a warning. At Reports each part of the claim is given its route on the recorded dates.';
}

export function acquisitionDateReading(db: Db, property_id: string | null): FactReading {
  const label = 'The acquisition date';
  if (property_id === null) return unknown('ACQUISITION_DATE', label, false, null);
  const p = db.get<{ acquisition_date: string | null }>('SELECT acquisition_date FROM properties WHERE id = ?', [property_id]);
  if (p?.acquisition_date === null || p?.acquisition_date === undefined) {
    // PHASE 158d (F45): with nothing on the property record, the surveyor's legal-check date or the client's checked answer.
    const given = acquisitionGiven(db, property_id);
    if (given !== null) {
      return { key: 'ACQUISITION_DATE', label, known: true, value: given.value, display: `${ukDate(given.value)} — from ${given.words}`, capturable: false,
        source: { source_id: null, publisher: given.publisher, prov: null, derived: false, locator: given.locator, recorded_at: given.at, recorded_by: null } };
    }
    const said = clientSaidPurchaseDate(db, property_id);
    const u = unknown('ACQUISITION_DATE', label, false, null);
    return said === null ? u : { ...u, display: `not known: at the assessment the client said they bought it around ${said}. Confirm the completion date and record it on the property.` };
  }
  return { key: 'ACQUISITION_DATE', label, known: true, value: p.acquisition_date, display: p.acquisition_date, capturable: false, source: staffSource('the property record') };
}

/**
 * TAXABLE PROFIT — the client's own answer first, through the funnel mapping and
 * ITS break-even switch, which this reads and never re-implements. Derived only
 * where the mapping actually set `sufficient_profit`; otherwise captured.
 */
export function sufficientProfitReading(db: Db, c: ClaimRow, facts: Map<string, FactRow>): FactReading {
  const def = FACTS['SUFFICIENT_PROFIT'];
  if (c.assessment_id !== null) {
    const a = db.get<{ sector: string }>('SELECT sector FROM assessments WHERE id = ?', [c.assessment_id]);
    if (a !== undefined) {
      const mapped = sessionFromFunnel(a.sector as SectorId, funnelStateFor(db, c.assessment_id));
      const v = (mapped.session as Record<string, unknown>)['sufficient_profit'];
      if (v === 'yes' || v === 'no') {
        const key = v === 'yes' ? 'YES' : 'NO';
        return {
          key: 'SUFFICIENT_PROFIT', label: def?.label ?? 'Taxable profit', known: true, value: key,
          display: def?.choices?.[key] ?? key, capturable: false,
          source: registerSource('CLIENT_ANSWER', false, 'the client’s answer about profit in the assessment', null, null),
        };
      }
    }
  }
  return captured(facts, 'SUFFICIENT_PROFIT');
}

/** The switch the profit reading runs through — read, and shown, never changed here. */
export function breakevenSwitch(): { readonly name: string; readonly on: boolean; readonly question: string } {
  return {
    name: 'breakeven_is_insufficient_profit', on: FUNNEL_SWITCHES.breakeven_is_insufficient_profit,
    question: 'Is "roughly break-even" enough profit for the relief to bite on?',
  };
}

/* ================================================================== *
 * 5 · THE GATE READINGS — asked by src/web/pipeline.ts on every move
 * ================================================================== */

export type WindowState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export type WindowReading = {
  readonly state: WindowState;
  readonly deadline: string | null;
  readonly why: string;
  readonly assumption: string | null;
};

const SELF_ASSESSMENT_CLAIMANTS: readonly string[] = ['LLP', 'PARTNERSHIP', 'SOLE_TRADER', 'INDIVIDUAL'];

/**
 * THE AMENDMENT WINDOW — DERIVED FROM THE ACQUISITION DATE AND THE ACCOUNTING
 * PERIOD, AND UNKNOWN WHENEVER EITHER IS.
 *
 * Also UNKNOWN where the claimant type is not known, or is a charity — the
 * engine's rule turns on a company against self assessment, and a charity could
 * be either — and where the acquisition date does not fall inside the recorded
 * period, because then the period recorded is not the period the spend is in.
 * The date itself is CB_CASH's. UNKNOWN OPENS NOTHING.
 */
export function amendmentWindowReading(db: Db, c: { business_id: string; property_id: string | null; id: string }, todayIso: string): WindowReading {
  const facts = latestFacts(db, c.id);
  const start = facts.get('ACCOUNTING_PERIOD_START');
  const end = facts.get('ACCOUNTING_PERIOD_END');
  let startV = start === undefined ? null : rowValue(start);
  let endV = end === undefined ? null : rowValue(end);
  const acq = acquisitionDateReading(db, c.property_id);
  // PHASE 158d (F45): say which date the window read when it is not the property record's, and fill the accounting
  // period from the client's checked year end where no period is recorded.
  const readFrom: string[] = [];
  const given = c.property_id === null ? null : acquisitionGiven(db, c.property_id);
  if (acq.known && given !== null && given.value === acq.value) readFrom.push(`the purchase date from ${given.words} (${ukDate(given.value)})`);
  if ((startV === null || endV === null) && acq.known && acq.value !== null) {
    const p = periodFromYearEnd(db, c.business_id, acq.value);
    if (p !== null) {
      startV = p.start; endV = p.end;
      const from = yearEndReading(db, c.business_id).from === 'REGISTER' ? 'Companies House’s year end for the company' : 'the client’s year end';
      readFrom.push(`the accounting period from ${from} (${ukDate(p.start)} to ${ukDate(p.end)})`);
    }
  }
  const said = readFrom.length === 0 ? '' : ` Read from ${readFrom.join(', and ')}.`;
  const claimant = claimantTypeForGate(db, c.business_id).value;
  const missing: string[] = [];
  if (!acq.known) missing.push('the acquisition date');
  if (startV === null || endV === null) missing.push('the accounting period');
  if (claimant === null) missing.push('the claimant type');
  if (missing.length > 0) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: `Not known yet — we still need ${missing.join(' and ')}. A window we cannot work out does not pass.` };
  }
  if ((acq.value ?? '') < (startV ?? '') || (acq.value ?? '') > (endV ?? '')) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'Not known — the acquisition date is outside the accounting period recorded. So that is not the period the spend falls in.' };
  }
  return windowForPeriod(db, c, endV ?? '', todayIso, said);
}

/**
 * PHASE 159d: THE WINDOW FOR ONE ACCOUNTING PERIOD, by its last day — the claimant's rule and the engine's date. Read by
 * the window above, by each piece of work's own period, and by the search for the first open period (W2;
 * src/web/claim-route.ts). C24: a charitable company files a company return, a charitable trust a trust return under
 * self assessment; a charity recorded without saying which is not known, and says so.
 */
export function windowForPeriod(db: Db, c: { business_id: string; id: string }, endV: string, todayIso: string, said = ''): WindowReading {
  const facts = latestFacts(db, c.id);
  const raw = claimantTypeForGate(db, c.business_id).value;
  if (raw === null) return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'Not known yet — we still need the claimant type. A window we cannot work out does not pass.' };
  if (raw === 'CHARITY') {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'Not known — record whether the charity is a charitable company (a company tax return) or a charitable trust (a trust tax return). The two have different deadlines.' };
  }
  const claimant = raw === 'CHARITY_COMPANY' ? 'COMPANY' : raw === 'CHARITABLE_TRUST' ? 'SOLE_TRADER' : raw;
  if (claimant !== 'COMPANY' && !SELF_ASSESSMENT_CLAIMANTS.includes(claimant)) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: `Not known — we have no window rule for a claimant recorded as ${raw.toLowerCase().replace(/_/g, ' ')}.` };
  }
  // PHASE 132 — a partnership or LLP reads whether a partner or member is a company. A row recorded as NOT KNOWN
  // and no row read the same: null, which the engine receives as no answer (N4).
  const partnership = claimant === 'LLP' || claimant === 'PARTNERSHIP';
  const memberRow = partnership ? facts.get('PARTNERSHIP_HAS_COMPANY_MEMBER') : undefined;
  const memberValue = memberRow === undefined ? null : rowValue(memberRow);
  const member = memberValue === 'YES' ? true : memberValue === 'NO' ? false : null;
  const w = amendmentWindow(endV ?? '', claimant === 'COMPANY' ? 'company' : partnership ? 'partnership' : 'self_assessment', todayIso, member);
  if (!w.known && w.ambiguous === true && w.deadlines !== undefined) {
    return {
      state: 'UNKNOWN', deadline: null, assumption: null,
      why: `Not known — we do not know if any partner or member is a company. If no partner is a company, the window is open until ${w.deadlines.individual}. If one is a company, it closed on ${w.deadlines.company} (TMA 1970 s.12AA(5B) and s.12ABA(4)(b)). A window we cannot work out does not pass.`,
    };
  }
  if (!w.known) return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'Not known — the period end could not be read as a date.' };
  return {
    state: w.in_time ? 'OPEN' : 'CLOSED', deadline: w.deadline,
    why: `${w.in_time ? `open until ${w.deadline}` : `closed on ${w.deadline}`}${said}`,
    assumption: raw === 'CHARITABLE_TRUST' ? 'A charitable trust files a trust tax return under self assessment, so the usual self assessment rule. Check the real filing date with the accountant.'
      : raw === 'CHARITY_COMPANY' ? 'A charitable company files a company tax return, so the usual company rule. Check the real filing date with the accountant.'
      : windowAssumption(claimant, w),
  };
}

/** The sentence beside a known window: which rule gave the date, and what it rests on. Phase 132. */
function windowAssumption(claimant: string | null, w: Extract<EngineWindow, { known: true }>): string {
  if (claimant === 'COMPANY') return 'The usual company rule: twelve months after the filing date. Check the real filing date with the accountant.';
  if (claimant !== 'LLP' && claimant !== 'PARTNERSHIP') {
    return 'The usual self assessment rule: twelve months after the 31 January filing date. Check the real filing date with the accountant.';
  }
  if (w.member === 'company' && w.company_date_later_not_applied === true) {
    return 'A partner or member is a company, as recorded. For this year end, the company date is later than the individual date (TMA 1970 s.12AA(5B)). It is not settled if one company partner moves the whole partnership onto it. So we use the earlier, individual date. Check with the accountant.';
  }
  if (w.member === 'company') {
    return 'A partner or member is a company, as recorded. So the return is due one year after the period end, and can be amended for twelve months after that (TMA 1970 s.12AA(5B) and s.12ABA(4)(b)). We do not assume a later date under s.12AA(5C). That applies where the notice to file came more than nine months after the period end. Check with the accountant.';
  }
  if (w.member === 'not_known') {
    return 'We have not recorded if any partner or member is a company. Here the window is the same on either date (TMA 1970 s.12AA(5B)), so it does not matter. Record the answer, and check with the accountant.';
  }
  return 'The usual self assessment rule. Every partner is an individual, as recorded. Check the real filing date with the accountant.';
}

/**
 * THE ELECTION, RESOLVED. The gate out of DATA_GATHERING reads this.
 *
 * RESOLVED ON A RECORDED "NO", OR on a recorded "YES" with its section, its
 * notification date, its value and the fixtures it covers — and a notification
 * the engine's own s.201(1) clock says was IN TIME. Not known, never asked, a
 * missing part, a clock that cannot be read and a late notice all leave it
 * UNRESOLVED, which is the procedure's stop condition.
 */
export function electionResolved(db: Db, c: { id: string; property_id: string | null }): { readonly met: boolean; readonly why: string; readonly in_time: boolean | null } {
  const facts = latestFacts(db, c.id);
  const exists = facts.get('ELECTION_EXISTS');
  const answer = exists === undefined ? null : rowValue(exists);
  if (answer === null) return { met: false, in_time: null, why: 'We do not know if an election affects the property. Not known does not pass.' };
  if (answer === 'NO') return { met: true, in_time: null, why: 'No election affects the property, as recorded.' };
  // s.201(1A): a tribunal application lodged in time and still UNDETERMINED disapplies the limit — only where BOTH its date
  // and that status are recorded. A status not known is not a pending application, and relieves nothing.
  const tribunalRow = facts.get('ELECTION_TRIBUNAL_APPLIED_ON');
  const statusRow = facts.get('ELECTION_TRIBUNAL_STATUS');
  const tribunalOn = tribunalRow === undefined ? null : rowValue(tribunalRow);
  const pending = tribunalOn !== null && statusRow !== undefined && rowValue(statusRow) === 'UNDETERMINED';
  const need = ['ELECTION_SECTION', 'ELECTION_VALUE', 'ELECTION_ELEMENTS', ...(pending ? [] : ['ELECTION_NOTIFIED_ON'])]
    .filter((k) => { const r = facts.get(k); return r === undefined || rowValue(r) === null; })
    .map((k) => (FACTS[k]?.label ?? k).toLowerCase());
  if (need.length > 0) return { met: false, in_time: null, why: `An election affects the property, and it is not settled. Not known yet: ${need.join('; ')}.` };
  const acq = acquisitionDateReading(db, c.property_id);
  const notifiedRow = facts.get('ELECTION_NOTIFIED_ON');
  const notified = notifiedRow === undefined ? null : rowValue(notifiedRow);
  const inTime = acq.known ? electionNotifiedInTime(acq.value ?? '', notified, pending ? { applied_on: tribunalOn ?? '' } : null) : null;
  if (inTime === null) return { met: false, in_time: null, why: 'We cannot check the notice against the two-year limit (s.201(1)). The acquisition date, or the notice date, is not known.' };
  if (!inTime) return { met: false, in_time: false, why: 'The election was notified after the two-year limit (s.201(1)), so it has no effect. The claim stops here — this is not a pass.' };
  return {
    met: true, in_time: true,
    why: pending
      ? 'An election affects the property. Its section, value and scope are recorded. A tribunal application made in time is not decided yet. So the two-year limit does not apply (s.201(1A)).'
      : 'An election affects the property. Its section, notice, value and scope are recorded, and it was notified in time.',
  };
}

type GrantRow = {
  id: string; kind: string; payer_class: string; amount_pence: number | null; amount_basis: string; traced: string;
  traced_elements: string | null; source_id: string; note: string | null; recorded_at: string; recorder: string | null;
  withdrawn_at: string | null; withdraw_reason: string | null;
  /** Phase 159i (migration 110): who received it, and the event on the building it paid for. */
  paid_to: string; event_id: string | null;
  /** Phase 153a: the fixture-list rows it paid for (migration 078), in the list's order. Empty: matched in words only, or not at all. */
  element_ids: readonly string[];
};

function grantRows(db: Db, claim_id: string, activeOnly: boolean): GrantRow[] {
  const rows = db.all<Omit<GrantRow, 'element_ids'>>(
    'SELECT g.id, g.kind, g.payer_class, g.amount_pence, g.amount_basis, g.traced, g.traced_elements, g.source_id, g.note, ' +
      'g.recorded_at, u.display_name AS recorder, g.withdrawn_at, g.withdraw_reason, g.paid_to, g.event_id FROM claim_grants g ' +
      'LEFT JOIN users u ON u.id = g.recorded_by WHERE g.claim_id = ? ORDER BY g.recorded_at ASC, g.rowid ASC',
    [claim_id]).filter((g) => !activeOnly || g.withdrawn_at === null);
  const links = db.all<{ grant_id: string; element_id: string }>(
    'SELECT e.grant_id, e.element_id FROM claim_grant_elements e JOIN claim_grants g ON g.id = e.grant_id WHERE g.claim_id = ?', [claim_id]);
  const order = new Map(taxonomy().map((r, i) => [r['element_id'] ?? '', i] as const));
  return rows.map((g) => ({
    ...g,
    element_ids: links.filter((l) => l.grant_id === g.id).map((l) => l.element_id)
      .sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.localeCompare(b)),
  }));
}

/** A fixture-list row's name, in a sentence, with its id; an id the list does not hold is shown as itself. */
export function elementName(element_id: string): string {
  const r = taxonomy().find((x) => x['element_id'] === element_id);
  if (r === undefined) return element_id;
  const n = (r['element_name'] ?? '').trim();
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} (${element_id})`;
}

/**
 * PHASE 153a — THE CLAIM'S GRANTS AS THE SURVEY PACK TAKES THEM (src/web/pack-grants.ts, chapter 15): every grant not
 * withdrawn, with its payer class, its amount and the fixture-list rows it paid for.
 */
export function packGrantsFor(db: Db, claim_id: string): (PackGrant & { readonly kind: string; readonly traced: string })[] {
  return grantRows(db, claim_id, true).map((g) => ({
    id: g.id, kind: g.kind, traced: g.traced, payer_class: g.payer_class, amount_pence: g.amount_pence, element_ids: g.element_ids,
    paid_to: g.paid_to === 'PAST_OWNER' ? 'PAST_OWNER' as const : 'CLIENT' as const, event_id: g.event_id,
  }));
}

/**
 * EVERY GRANT TRACED. The gate out of VALUATION reads this.
 *
 * MET ON A RECORDED "NO GRANT", with no grant left recorded against it; or on a
 * recorded "YES" with at least one grant, every one traced to its cost elements.
 * Not known, never asked, a "yes" with nothing recorded, and any grant not
 * traced or not known to be all leave it shut.
 */
export function grantsTraced(db: Db, claim_id: string): { readonly met: boolean; readonly why: string } {
  const facts = latestFacts(db, claim_id);
  const r = facts.get('GRANTS_EXIST');
  const answer = r === undefined ? null : rowValue(r);
  const active = grantRows(db, claim_id, true);
  if (answer === null) return { met: false, why: 'We do not know yet if anyone else paid for this work. Not sure or not known never passes.' };
  if (answer === 'NO') {
    return active.length === 0
      ? { met: true, why: 'Nobody else paid for this work, as recorded.' }
      : { met: false, why: `The answer is No, but ${active.length} ${active.length === 1 ? 'grant is' : 'grants are'} still listed. Remove ${active.length === 1 ? 'it' : 'them'}, or change the answer.` };
  }
  if (active.length === 0) return { met: false, why: 'The answer is Yes, but no grant is added yet. Add who paid.' };
  const untraced = active.filter((g) => g.traced !== 'YES').length;
  return untraced === 0
    ? { met: true, why: `Every grant (${active.length}) is matched to the items it paid for.` }
    : { met: false, why: `${untraced} of ${active.length} ${active.length === 1 ? 'grant is' : 'grants are'} not matched yet to the items paid for. A grant is never taken as a share of everything.` };
}

/* ================================================================== *
 * 6 · THE PANEL
 * ================================================================== */

export type GrantLine = {
  readonly id: string; readonly kind: string; readonly payer: string; readonly amount: string; readonly amount_basis: string;
  readonly traced: string; readonly traced_elements: string | null; readonly source: FactSource; readonly withdrawn: string | null;
  /* PHASE 143, 22 September 2026 — the same row's stored keys, so the grants section can total and word it. Read only;
     nothing here is written, and the surveyor's released list never reaches this type. */
  readonly payer_key: string; readonly amount_pence: number | null; readonly traced_key: string; readonly note: string | null;
  /** Phase 153a: the fixture-list rows it paid for, and their names. */
  readonly element_ids: readonly string[]; readonly element_names: readonly string[];
};

export type OwnerLine = {
  readonly id: string; readonly position: number; readonly owner: string; readonly acquired_on: string | null;
  readonly ceased_on: string | null; readonly claimed: string; readonly source: FactSource;
};

export type SwitchLine = { readonly name: string; readonly on: boolean; readonly says: string };

export type FactsPanel = {
  readonly claimant_type: FactReading;
  readonly scottish_taxpayer: FactReading;
  readonly jurisdiction: FactReading;
  readonly acquisition_date: FactReading;
  readonly accounting_period: { readonly start: FactReading; readonly end: FactReading };
  /** Phase 132, 15 September 2026 — recordable since 14 September and shown nowhere until now. */
  readonly partnership_company_member: FactReading;
  readonly amendment_window: WindowReading;
  /** PHASE 159g (L8): the claim's year end — the register's, else the client's — and whether the two differ. */
  readonly year_end: YearEndReading;
  /** PHASE 159g (L2, item 2, item 4): who claims — a dormant company flagged, how the client holds the building, its tenure. */
  readonly who_claims: { readonly dormant: string | null; readonly role: string; readonly tenure: string };
  readonly taxable_profit: {
    readonly sufficient_profit: FactReading;
    readonly breakeven_switch: { readonly name: string; readonly on: boolean; readonly question: string };
  };
  readonly allowance_headroom: { readonly position: FactReading; readonly amount: FactReading };
  readonly pool_split: { readonly main: FactReading; readonly special: FactReading };
  readonly structures_and_buildings: { readonly workstream: string; readonly qualifying_expenditure: FactReading };
  readonly election: {
    readonly exists: FactReading; readonly section: FactReading; readonly notified_on: FactReading;
    readonly value: FactReading; readonly elements: FactReading;
    readonly resolved: { readonly met: boolean; readonly why: string };
    readonly prior_owner_chain: readonly OwnerLine[];
  };
  readonly grants: {
    readonly exist: FactReading; readonly lines: readonly GrantLine[]; readonly traced: { readonly met: boolean; readonly why: string };
    /* Phase 153a: the two grant facts the valuation gate reads (src/web/grant-checks.ts), and the switch the pack reads. */
    readonly provider_checked: FactReading; readonly split_view: FactReading; readonly switch: SwitchLine;
  };
  readonly acquisition_costs: { readonly costs: FactReading; readonly transaction_tax: FactReading; readonly switch: SwitchLine };
  readonly buyer_alterations: { readonly made: FactReading; readonly amount: FactReading; readonly switch: SwitchLine };
  readonly may_record: boolean;
};

/** PHASE 159j (L14): read as the survey pack reads it (`packSwitchReadings`), and said in the words for that state. */
function switchLine(name: string, saysOff: string, saysOn: string): SwitchLine {
  const s = packSwitchReadings(ctaSwitchReadings()).find((x) => x.switch === name);
  return { name, on: s?.on === true, says: s?.on === true ? saysOn : saysOff };
}

function ownerRows(db: Db, claim_id: string): OwnerLine[] {
  return db.all<{ id: string; position: number; owner: string; acquired_on: string | null; ceased_on: string | null; claimed: string; source_id: string; recorded_at: string; recorder: string | null }>(
    'SELECT o.id, o.position, o.owner, o.acquired_on, o.ceased_on, o.claimed, o.source_id, o.recorded_at, u.display_name AS recorder ' +
      'FROM claim_owner_chain o LEFT JOIN users u ON u.id = o.recorded_by WHERE o.claim_id = ? AND o.withdrawn_at IS NULL ORDER BY o.position ASC',
    [claim_id]).map((o) => ({
    id: o.id, position: o.position, owner: OWNER_ROLE_TOKENS[o.owner] ?? o.owner, acquired_on: o.acquired_on, ceased_on: o.ceased_on,
    claimed: o.claimed === 'YES' ? 'claimed allowances' : o.claimed === 'NO' ? 'did not claim' : 'whether they claimed is not known',
    source: registerSource(o.source_id, false, `record ${o.id}`, o.recorded_at, o.recorder ?? 'a former user'),
  }));
}

/**
 * THE FACTS PANEL, FOR `claim_facts.read` — ADMIN AND SALES. Asked of the claim's
 * facts object; nobody else reaches this function's output.
 */
export function factsPanel(db: Db, actor: Actor, claim_id: string, todayIso: string, opts: { store?: PostcodeStore | null } = {}): FactsPanel {
  const c = loadFactClaim(db, claim_id);
  const obj = factsObj(db, c);
  authorise(actor, 'claim_facts.read', obj);
  const f = latestFacts(db, c.id);
  const grants = grantRows(db, c.id, false);
  return {
    claimant_type: claimantTypeReading(db, c.business_id),
    scottish_taxpayer: captured(f, 'SCOTTISH_TAXPAYER'),
    jurisdiction: jurisdictionReading(db, c.property_id, opts.store),
    acquisition_date: acquisitionDateReading(db, c.property_id),
    accounting_period: { start: captured(f, 'ACCOUNTING_PERIOD_START'), end: captured(f, 'ACCOUNTING_PERIOD_END') },
    partnership_company_member: captured(f, 'PARTNERSHIP_HAS_COMPANY_MEMBER'),
    amendment_window: amendmentWindowReading(db, c, todayIso),
    year_end: yearEndReading(db, c.business_id),
    who_claims: (() => {
      const t = propertyTenure(db, c.property_id);
      return { dormant: dormantWarning(db, c.business_id), role: t.role.role === null ? t.role.words : `${ROLE_LABELS[t.role.role]}. ${t.role.words}${t.role.source === null ? '' : ` (${t.role.source})`}`, tenure: t.words };
    })(),
    taxable_profit: { sufficient_profit: sufficientProfitReading(db, c, f), breakeven_switch: breakevenSwitch() },
    allowance_headroom: { position: captured(f, 'AIA_HEADROOM'), amount: captured(f, 'AIA_HEADROOM_AMOUNT') },
    pool_split: { main: captured(f, 'POOL_SPLIT_MAIN'), special: captured(f, 'POOL_SPLIT_SPECIAL') },
    structures_and_buildings: {
      workstream: WORKSTREAMS[c.workstream] ?? c.workstream,
      qualifying_expenditure: captured(f, 'SBA_QUALIFYING_EXPENDITURE'),
    },
    election: {
      exists: captured(f, 'ELECTION_EXISTS'), section: captured(f, 'ELECTION_SECTION'), notified_on: captured(f, 'ELECTION_NOTIFIED_ON'),
      value: captured(f, 'ELECTION_VALUE'), elements: captured(f, 'ELECTION_ELEMENTS'),
      resolved: (({ met, why }) => ({ met, why }))(electionResolved(db, c)),
      prior_owner_chain: ownerRows(db, c.id),
    },
    grants: {
      exist: captured(f, 'GRANTS_EXIST'),
      lines: grants.map((g) => ({
        id: g.id, kind: g.kind === 'GRANT' ? 'Grant' : 'Contribution', payer: PAYER_CLASSES[g.payer_class] ?? g.payer_class,
        amount: g.amount_pence === null ? NOT_KNOWN : formatPence(g.amount_pence), amount_basis: AMOUNT_BASES[g.amount_basis] ?? g.amount_basis,
        traced: TRACED[g.traced] ?? g.traced, traced_elements: g.traced_elements,
        source: registerSource(g.source_id, false, `record ${g.id}`, g.recorded_at, g.recorder ?? 'a former user'),
        withdrawn: g.withdrawn_at === null ? null : `withdrawn ${localStamp(g.withdrawn_at)} — ${g.withdraw_reason ?? ''}`,
        payer_key: g.payer_class, amount_pence: g.amount_pence, traced_key: g.traced, note: g.note,
        element_ids: g.element_ids, element_names: g.element_ids.map(elementName),
      })),
      traced: grantsTraced(db, c.id),
      provider_checked: captured(f, 'GRANT_PROVIDER_CHECKED'),
      split_view: captured(f, 'GRANT_SPLIT_ADVISER_VIEW'),
      switch: switchLine('grant_traced_to_elements',
        'Off. In the survey pack every grant comes off every item in equal share — a share of the price paid. Switched on, a grant matched to rows of our fixture list would come off only those items. First the tax adviser must answer this. "When a grant’s papers say which items it paid for, should it come off only those items?"',
        'On, on the test system. In the survey pack a grant matched to rows of our fixture list comes off only those items, and a grant not traced to items comes off in full. The tax adviser is asked whether this is viable.'),
    },
    acquisition_costs: {
      costs: captured(f, 'ACQUISITION_COSTS'), transaction_tax: captured(f, 'TRANSACTION_TAX'),
      switch: switchLine('transaction_tax_in_base',
        'Off. Land transaction tax recorded here is shown, but not added to the price we apportion. First the tax adviser must answer this. "When a building is bought, is the stamp duty part of the price we apportion?"',
        'On, on the test system. The stamp duty and the purchase fees recorded here are added to the price we apportion, and the land takes its share. The tax adviser is asked whether this is viable.'),
    },
    buyer_alterations: {
      made: captured(f, 'BUYER_ALTERATIONS'), amount: captured(f, 'BUYER_ALTERATIONS_AMOUNT'),
      switch: switchLine('s185_plus_own_s25',
        'Off. The buyer’s own alteration spend is shown, but not added on top of an agreed figure. First the tax adviser must answer this. "When someone buys a building, can they add their own alteration costs on top of an agreed figure?"',
        'On, on the test system. The buyer’s own alteration spend is added on top of an agreed figure. The tax adviser is asked whether this is viable.'),
    },
    may_record: can(actor, 'claim_facts.record', obj),
  };
}

/* ================================================================== *
 * 7 · THE RELEASED INPUTS — what src/payload.ts may ask for, and nothing else
 * ================================================================== */

/**
 * A READER THAT CAN ANSWER ONLY FOR THE RELEASED KEYS. It is handed to
 * `assembleReleasedFacts` in src/payload.ts, which walks the released list
 * forwards and asks this for each. There is no case here for a figure, an
 * amount, a window, a profit position or a pool: the reader cannot return one
 * because it has nowhere to read one from.
 */
export function releasedFactReader(db: Db, claim_id: string, opts: { store?: PostcodeStore | null } = {}): (key: string) => unknown {
  const c = loadFactClaim(db, claim_id);
  const f = latestFacts(db, c.id);
  const plain = (r: FactReading): { known: boolean; display: string } => ({ known: r.known, display: r.display });
  return (key: string): unknown => {
    switch (key) {
      case 'claimant_type': return plain(claimantTypeReading(db, c.business_id));
      case 'jurisdiction': return plain(jurisdictionReading(db, c.property_id, opts.store));
      case 'acquisition_date': return plain(acquisitionDateReading(db, c.property_id));
      case 'election_exists': return plain(captured(f, 'ELECTION_EXISTS'));
      case 'election_section': return plain(captured(f, 'ELECTION_SECTION'));
      case 'election_notified_on': return plain(captured(f, 'ELECTION_NOTIFIED_ON'));
      case 'election_elements': return plain(captured(f, 'ELECTION_ELEMENTS'));
      case 'prior_owner_chain': return ownerRows(db, c.id).map((o) => ({ position: o.position, owner: o.owner, claimed: o.claimed }));
      case 'grants_exist': return plain(captured(f, 'GRANTS_EXIST'));
      case 'grants_traced': return grantRows(db, c.id, true).map((g) => ({
        kind: g.kind === 'GRANT' ? 'Grant' : 'Contribution', traced: TRACED[g.traced] ?? g.traced, traced_elements: g.traced_elements,
      }));
      case 'buyer_alterations': return plain(captured(f, 'BUYER_ALTERATIONS'));
      default: return undefined;
    }
  };
}

/* ================================================================== *
 * 8 · RECORDING
 * ================================================================== */

function text(v: string | null | undefined, max: number, what: string): { ok: true; value: string | null } | { ok: false; why: string } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

export function dateValue(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && Number.isFinite(Date.parse(`${t}T12:00:00.000Z`)) ? t : null;
}

export function penceValue(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const cleaned = v.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const p = toPence(Number(cleaned));
  return p === null || p <= 0 ? null : p;
}

function factClaimFor(d: FactDeps, actor: Actor, claim_id: string): ClaimRow {
  const c = loadFactClaim(d.db, claim_id);
  authorise(actor, 'claim_facts.record', factsObj(d.db, c));
  return c;
}

/**
 * RECORD ONE FACT — A VALUE, OR "NOT KNOWN".
 *
 * NOT KNOWN IS OFFERED, so nobody is forced to guess to get past the form (N4):
 * an answer is required, and not known is an answer. It passes nothing.
 * A FACT A BETTER SOURCE DERIVES IS REFUSED, with the source named.
 */
export function recordFact(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const key = input['fact_key'] ?? null;
  if (key === null || !Object.hasOwn(FACTS, key)) {
    return { ok: false, field: 'fact_key', why: 'Choose a fact from the list. The claimant type is recorded on the organisation. The jurisdiction and acquisition date are on the property.' };
  }
  const def = FACTS[key] as FactDef;
  if (key === 'SUFFICIENT_PROFIT') {
    const derived = sufficientProfitReading(d.db, c, new Map());
    if (!derived.capturable) {
      return { ok: false, why: `Taxable profit is already known from ${derived.source?.locator ?? 'a better source'}, so it is not asked again.` };
    }
  }
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from — the client, their document, the surveyor or the tax adviser.' };
  const answer = input['answer'] ?? null;
  if (answer !== 'VALUE' && answer !== 'UNKNOWN') return { ok: false, field: 'answer', why: 'Give the fact, or record it as not known. Not known is an answer, but it passes no check.' };
  const note = text(input['note'], 2000, 'The note');
  if (!note.ok) return note;
  let vText: string | null = null, vPence: number | null = null, vDate: string | null = null;
  if (answer === 'VALUE') {
    const raw = input['value'] ?? null;
    if (def.kind === 'date') {
      vDate = dateValue(raw);
      if (vDate === null) return { ok: false, field: 'value', why: `${def.label}: write a date like 2026-03-31, or record it as not known.` };
    } else if (def.kind === 'pence') {
      vPence = penceValue(raw);
      if (vPence === null) return { ok: false, field: 'value', why: `${def.label}: write an amount in pounds, more than £0, or record it as not known. Not known is never saved as £0.` };
    } else if (def.kind === 'choice') {
      if (def.choices === undefined || !has(def.choices, raw)) return { ok: false, field: 'value', why: `${def.label}: choose one of the answers offered, or record it as not known.` };
      vText = raw;
    } else {
      const t = text(raw, 4000, def.label);
      if (!t.ok) return t;
      if (t.value === null) return { ok: false, field: 'value', why: `${def.label}: write it, or record it as not known.` };
      vText = t.value;
    }
  }
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, key, answer, vText, vPence, vDate, source, note.value, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_FACT_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { fact: key, answer, source, business: c.business_id },
  });
  return { ok: true, id };
}

/**
 * RULEBOOK F's PUBLIC BODIES among the payer classes — F-R8: the Crown, any government, any public or local authority.
 * Money from one of these reduces the claim on what it met, with no exception but insurance. Money from anyone else
 * may not (F-R9, F-R10), insurance money after damage does not (F-R7), and a payer not known is not treated as either.
 */
export const PUBLIC_PAYERS: readonly string[] = Object.freeze(['nhs', 'local_authority', 'homes_england_gla', 'other_public']);

/**
 * PHASE 143 — the step-by-step "Add a grant" pages draw nothing a login may not record. The same authorisation
 * recordGrant runs, asked before a step is drawn; the company's name is for the heading (the client is the company).
 */
export function grantFormClaim(db: Db, actor: Actor, claim_id: string): { readonly id: string; readonly business_id: string; readonly company: string; readonly sector: string | null } {
  const c = loadFactClaim(db, claim_id);
  authorise(actor, 'claim_facts.record', factsObj(db, c));
  const b = db.get<{ name: string; sector: string | null }>('SELECT name, sector FROM businesses WHERE id = ?', [c.business_id]);
  // Phase 153a: the sector, so the step that matches a grant offers that sector's rows of the fixture list.
  return { id: c.id, business_id: c.business_id, company: b?.name ?? 'This company', sector: b?.sector ?? null };
}

/**
 * PHASE 153a — the fixture-list rows a grant may be matched to on this claim: the sector's own and the rows every sector
 * shares, in the list's order, with their names. Every row, whatever its pool: a grant that paid only for items that
 * never qualify is matched to those, and then takes nothing off (Word question 79). A sector the list does not know
 * is offered the shared rows.
 */
export function grantElementChoices(sector: string | null): readonly { readonly id: string; readonly name: string; readonly pool: string }[] {
  const code = sector === null ? undefined : TAXONOMY_SECTOR[sector];
  return taxonomy().filter((r) => r['sector'] === 'ALL' || (code !== undefined && r['sector'] === code))
    .map((r) => ({ id: r['element_id'] ?? '', name: elementName(r['element_id'] ?? ''), pool: r['pool'] ?? '' }));
}

/**
 * PHASE 153a — the fixture-list rows a grant paid for, as posted: ids separated by commas, spaces or new lines. Every id
 * must be a row of 02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv; repeats are taken once; at most 60.
 */
export function parseElementIds(raw: string | null): { ok: true; value: string[] } | { ok: false; why: string } {
  const parts = (raw ?? '').split(/[\s,]+/).map((x) => x.trim()).filter((x) => x !== '');
  const unique = [...new Set(parts)];
  if (unique.length > 60) return { ok: false, why: 'Choose at most 60 items from our list.' };
  const known = new Set(taxonomy().map((r) => r['element_id'] ?? ''));
  const bad = unique.filter((x) => !known.has(x));
  if (bad.length > 0) return { ok: false, why: `${bad.length === 1 ? 'One item is' : `${String(bad.length)} items are`} not on our fixture list. Choose from the list.` };
  return { ok: true, value: unique };
}

/** RECORD A GRANT OR CONTRIBUTION. A payer class, never a name; traced only with the elements written. */
export function recordGrant(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const kind = input['kind'] ?? null;
  if (kind !== 'GRANT' && kind !== 'CONTRIBUTION') return { ok: false, field: 'kind', why: 'Say if it is a grant or another payment.' };
  const payer = input['payer_class'] ?? null;
  if (!has(PAYER_CLASSES, payer)) return { ok: false, field: 'payer_class', why: 'Choose who paid from the list — never a name. Not known is on the list.' };
  const basis = input['amount_basis'] ?? 'UNKNOWN';
  if (!has(AMOUNT_BASES, basis)) return { ok: false, field: 'amount_basis', why: 'Choose where the amount came from, or not known.' };
  const rawAmount = input['amount'] ?? null;
  const amount = rawAmount === null || rawAmount.trim() === '' ? null : penceValue(rawAmount);
  if (rawAmount !== null && rawAmount.trim() !== '' && amount === null) return { ok: false, field: 'amount', why: 'Write the amount in pounds, more than £0 — or leave it blank if it is not known.' };
  const traced = input['traced'] ?? null;
  if (!has(TRACED, traced)) return { ok: false, field: 'traced', why: 'Say if it is matched to the items it paid for — yes, no or not sure.' };
  const elements = text(input['traced_elements'], 4000, 'The list of items it paid for');
  if (!elements.ok) return elements;
  // PHASE 153a: the fixture-list rows it paid for (migration 078), each checked against the list itself. Matched to rows
  // only when it is marked matched; the words then default to the rows' names, so a reader never sees a bare code.
  const ids = parseElementIds(input['element_ids'] ?? null);
  if (!ids.ok) return { ok: false, field: 'element_ids', why: ids.why };
  if (ids.value.length > 0 && traced !== 'YES') return { ok: false, field: 'traced', why: 'You chose items from our list, so mark it matched — or clear the items.' };
  if (traced === 'YES' && elements.value === null && ids.value.length > 0) {
    const named = ids.value.map(elementName).join('; ');
    elements.value = named.length <= 4000 ? named : `${named.slice(0, 3997)}...`;
  }
  if (traced === 'YES' && elements.value === null) return { ok: false, field: 'traced_elements', why: 'To mark it matched, first write the items it paid for. Never take a share of everything.' };
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from.' };
  const note = text(input['note'], 2000, 'The note');
  if (!note.ok) return note;
  // PHASE 159i (items 1 and 4): who received it — the client, or an earlier owner — and which event on the building it paid for.
  const paidTo = (input['paid_to'] ?? '').trim() === '' ? 'CLIENT' : input['paid_to'];
  if (paidTo !== 'CLIENT' && paidTo !== 'PAST_OWNER') return { ok: false, field: 'paid_to', why: 'Say who received it: the client, or an earlier owner.' };
  const ev = (input['event_id'] ?? '').trim() === '' ? null : (input['event_id'] ?? '').trim();
  if (ev !== null) {
    const pid = d.db.get<{ p: string | null }>('SELECT property_id AS p FROM claims WHERE id = ?', [c.id])?.p ?? null;
    if (pid === null || d.db.get('SELECT id FROM property_events WHERE id = ? AND property_id = ?', [ev, pid]) === undefined) {
      return { ok: false, field: 'event_id', why: 'Choose the purchase or a piece of work on this claim’s building.' };
    }
    if (paidTo === 'PAST_OWNER') return { ok: false, field: 'event_id', why: 'A grant paid to an earlier owner did not pay for the client’s spend. Leave the event empty.' };
  }
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO claim_grants (id, claim_id, kind, payer_class, amount_pence, amount_basis, traced, traced_elements, source_id, note, recorded_by, recorded_at, paid_to, event_id) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, c.id, kind, payer, amount, basis, traced, elements.value, source, note.value, actor.id, at, paidTo, ev],
    );
    for (const e of ids.value) d.db.run('INSERT INTO claim_grant_elements (grant_id, element_id) VALUES (?, ?)', [id, e]);
    d.audit.append({
      at, kind: 'CLAIM_GRANT_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { grant: id, grant_kind: kind, traced, business: c.business_id, items: ids.value.length },
    });
  });
  return { ok: true, id };
}

export function withdrawGrant(d: FactDeps, actor: Actor, claim_id: string, grant_id: string, reasonIn: string | null): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const g = d.db.get<{ id: string; withdrawn_at: string | null }>('SELECT id, withdrawn_at FROM claim_grants WHERE id = ? AND claim_id = ?', [grant_id, c.id]);
  if (g === undefined) throw new NotFoundAsRefusal();
  if (g.withdrawn_at !== null) return { ok: false, why: 'That grant is already removed. Its record is kept.' };
  const reason = text(reasonIn, 1000, 'The reason');
  if (!reason.ok) return reason;
  if (reason.value === null) return { ok: false, field: 'reason', why: 'Say why you are removing the grant. Its record is kept.' };
  const at = d.now();
  d.db.run('UPDATE claim_grants SET withdrawn_by = ?, withdrawn_at = ?, withdraw_reason = ? WHERE id = ?', [actor.id, at, reason.value, g.id]);
  d.audit.append({
    at, kind: 'CLAIM_GRANT_WITHDRAWN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { grant: g.id, business: c.business_id },
  });
  return { ok: true, id: g.id };
}

/** RECORD AN OWNER IN THE CHAIN — a company name or a role token, never a person (N2). */
export function recordOwner(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const position = Number(input['position'] ?? '');
  if (!Number.isInteger(position) || position < 1 || position > 20) return { ok: false, field: 'position', why: 'Count back from our client: 1 is the seller, 2 is the owner before them.' };
  const owner = text(input['owner'], 300, 'The owner');
  if (!owner.ok) return owner;
  if (owner.value === null || !isCompanyOrRoleToken(owner.value)) {
    return {
      ok: false,
      why: 'Write a company name ending Limited, Ltd, LLP, plc or CIC. Or type a role, like INDIVIDUAL_NOT_RECORDED. ' +
        'Never write a person’s name here. We do not keep other people’s names in the claim.',
    };
  }
  const rawAcq = input['acquired_on'] ?? null;
  const rawCeased = input['ceased_on'] ?? null;
  const acquired = rawAcq === null || rawAcq.trim() === '' ? null : dateValue(rawAcq);
  const ceased = rawCeased === null || rawCeased.trim() === '' ? null : dateValue(rawCeased);
  if ((rawAcq !== null && rawAcq.trim() !== '' && acquired === null) || (rawCeased !== null && rawCeased.trim() !== '' && ceased === null)) {
    return { ok: false, why: 'Write dates like 2026-03-31. Leave one blank if it is not known.' };
  }
  const claimed = input['claimed'] ?? null;
  if (claimed !== 'YES' && claimed !== 'NO' && claimed !== 'UNKNOWN') return { ok: false, field: 'claimed', why: 'Say if that owner claimed allowances — yes, no or not known.' };
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from.' };
  const taken = d.db.get<{ id: string }>('SELECT id FROM claim_owner_chain WHERE claim_id = ? AND position = ? AND withdrawn_at IS NULL', [c.id, position]);
  if (taken !== undefined) return { ok: false, why: 'An owner is already recorded at that position. Withdraw it first. Its record is kept.' };
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_owner_chain (id, claim_id, position, owner, acquired_on, ceased_on, claimed, source_id, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, position, owner.value, acquired, ceased, claimed, source, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_OWNER_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { owner_row: id, position, claimed, business: c.business_id },
  });
  return { ok: true, id };
}

export function withdrawOwner(d: FactDeps, actor: Actor, claim_id: string, owner_id: string): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const o = d.db.get<{ id: string; withdrawn_at: string | null }>('SELECT id, withdrawn_at FROM claim_owner_chain WHERE id = ? AND claim_id = ?', [owner_id, c.id]);
  if (o === undefined) throw new NotFoundAsRefusal();
  if (o.withdrawn_at !== null) return { ok: false, why: 'That owner is already withdrawn. Its record is kept.' };
  const at = d.now();
  d.db.run('UPDATE claim_owner_chain SET withdrawn_by = ?, withdrawn_at = ? WHERE id = ?', [actor.id, at, o.id]);
  d.audit.append({
    at, kind: 'CLAIM_OWNER_WITHDRAWN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { owner_row: o.id, business: c.business_id },
  });
  return { ok: true, id: o.id };
}

/**
 * PHASE 158d: the client's own answer to one of our questions, once a member of staff has checked it — the newest
 * answered question for `fact_id` whose latest tick is APPROVED. "I don't know" is not an answer; an unchecked answer and
 * one whose tick was taken off are not read.
 */
export function approvedClientAnswer(db: Db, business_id: string, fact_id: string): { readonly answer: string; readonly at: string; readonly task_id: string } | null {
  for (const t of db.all<{ id: string; answer: string | null; answered_at: string | null }>(
    "SELECT id, answer, answered_at FROM client_tasks WHERE business_id = ? AND fact_id = ? AND state = 'ANSWERED' AND answer_state = 'ANSWERED' " +
      'ORDER BY answered_at DESC, rowid DESC', [business_id, fact_id])) {
    const tick = db.get<{ action: string }>('SELECT action FROM fact_approvals WHERE business_id = ? AND fact_ref = ? ORDER BY at DESC, rowid DESC LIMIT 1',
      [business_id, `ans.${t.id}`]);
    if (tick?.action === 'APPROVED' && t.answer !== null && t.answered_at !== null) return { answer: t.answer, at: t.answered_at, task_id: t.id };
  }
  return null;
}

/**
 * PHASE 158d (F44, the second Friary House run): "Data gathering complete — floor area sourced" passed with no floor area
 * recorded anywhere. A floor area is on record when one of these holds it: the property's energy certificate (a register
 * record of this property, or the business's only one where it names no property), Homedata's estimate for the address,
 * or the client's own answer to "how big is the building", checked, with a number in it.
 */
export function floorAreaOnRecord(db: Db, business_id: string, property_id: string | null): { readonly known: boolean; readonly why: string } {
  const rows = db.all<{ source_id: string; fields_json: string; property_id: string | null }>(
    "SELECT source_id, fields_json, property_id FROM register_records WHERE business_id = ? AND source_id IN ('EPC', 'HOMEDATA_ADDRESS') ORDER BY obtained_at DESC",
    [business_id]);
  const read = (j: string): Record<string, unknown> => { try { return JSON.parse(j) as Record<string, unknown>; } catch { return {}; } };
  const epcs = rows.filter((r) => r.source_id === 'EPC');
  const epc = epcs.find((r) => r.property_id !== null && r.property_id === property_id) ?? (epcs.length === 1 && epcs[0]?.property_id === null ? epcs[0] : undefined);
  const a = epc === undefined ? undefined : read(epc.fields_json)['epc_total_floor_area_m2'];
  if (typeof a === 'number' && a > 0) return { known: true, why: `${String(a)} m², on the energy certificate` };
  const hd = rows.find((r) => r.source_id === 'HOMEDATA_ADDRESS' && r.property_id !== null && r.property_id === property_id);
  const est = hd === undefined ? undefined : (read(hd.fields_json)['estimated_floor_area'] as { floor_area_m2?: unknown } | undefined)?.floor_area_m2;
  if (typeof est === 'number' && est > 0) return { known: true, why: `${String(est)} m², Homedata's estimate` };
  const said = approvedClientAnswer(db, business_id, 'floor_area_m2');
  if (said !== null && /\d/.test(said.answer)) return { known: true, why: `"${said.answer}", the client's own answer, checked` };
  return {
    known: false,
    why: 'No floor area is on record yet. It can come from the energy certificate or from Homedata\'s estimate. Or it can come ' +
      'from the client\'s answer to "how big is the building", once you have checked it. Ask the client, or look it up, first.',
  };
}

const MONTH_NUMBER: Readonly<Record<string, number>> = Object.freeze({
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
});
const monthOf = (word: string): number | undefined => MONTH_NUMBER[word.toLowerCase().slice(0, word.toLowerCase().startsWith('sept') ? 4 : 3)];
const iso = (y: number, m: number, d: number): string | null => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
    ? `${String(y)}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
};

/**
 * PHASE 158d (F45): a whole date in the words a client types — "2024-06-14", "14/06/2024", "14 June 2024", "June 14 2024".
 * A month alone ("June 2024", "06/2024") is not a date, and is not read as one.
 */
export function clientDate(text: string): string | null {
  const t = text.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(t);
  if (m) { const mo = monthOf(m[2] ?? ''); return mo === undefined ? null : iso(Number(m[3]), mo, Number(m[1])); }
  m = /^([A-Za-z]+) (\d{1,2}) (\d{4})$/.exec(t);
  if (m) { const mo = monthOf(m[1] ?? ''); return mo === undefined ? null : iso(Number(m[3]), mo, Number(m[2])); }
  return null;
}

/** PHASE 158d (F45): a year end in a client's words — "5 April", "April 5", "31/03" — as month and day, or null. */
export function clientYearEnd(text: string): { readonly month: number; readonly day: number } | null {
  const t = text.trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ');
  let m = /^(\d{1,2}) ([A-Za-z]+)$/.exec(t);
  let month: number | undefined; let day: number | undefined;
  if (m) { month = monthOf(m[2] ?? ''); day = Number(m[1]); }
  else if ((m = /^([A-Za-z]+) (\d{1,2})$/.exec(t))) { month = monthOf(m[1] ?? ''); day = Number(m[2]); }
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})$/.exec(t))) { month = Number(m[2]); day = Number(m[1]); }
  if (month === undefined || day === undefined || iso(2023, month, day) === null) return null;
  return { month, day };
}

/**
 * PHASE 158d (F45, the second Friary House run): the purchase date was asked in four places and the window read only the
 * one staff type on the property record. Where that is empty, this is the date someone else gave: the surveyor's answer
 * to the legal check's G9d on a pack for this property, or else the client's own answer to "the completion date",
 * checked by staff and a whole date. Never written over the property record; read, with where it came from.
 */
function acquisitionGiven(db: Db, property_id: string): { value: string; words: string; publisher: string; locator: string; at: string } | null {
  /* PHASE 159a (C3, L3): ONCE A VERSION IS SIGNED, ITS PURCHASE DATE IS THE ONE READ. The newest version a tax adviser's
     sign-off names, on a pack for this property, since the valuation was last reopened: its legal check's G9d as it was
     approved. A newer working answer in the pack is never read in its place. */
  const signed = db.get<{ snapshot_json: string; version: number; approved_at: string; claim_id: string }>(
    'SELECT a.snapshot_json, a.version, a.approved_at, j.claim_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
      'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN claims c ON c.id = j.claim_id ' +
      'JOIN tax_adviser_signoffs s ON s.approval_id = a.id AND s.claim_id = j.claim_id ' +
      'WHERE (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) ' +
      "AND s.recorded_at >= COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = j.claim_id AND m.kind = 'REOPEN' " +
      "AND m.to_stage IN (SELECT value FROM json_each(?))), '') " +
      'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', [property_id, property_id, JSON.stringify(VOIDING_REOPEN_STAGES)]);
  if (signed !== undefined) {
    let snap: { legal?: { answers?: { question_id: string; value: unknown }[] } } = {};
    try { snap = JSON.parse(signed.snapshot_json) as typeof snap; } catch { snap = {}; }
    const v = snap.legal?.answers?.find((x) => x.question_id === 'G9d')?.value;
    const d = typeof v === 'string' ? clientDate(v) : null;
    if (d !== null) {
      return { value: d, words: `the surveyor’s legal check, in the signed report (version ${String(signed.version)})`, publisher: 'The surveyor',
        locator: `the signed survey report, version ${String(signed.version)}, legal check question G9d`, at: signed.approved_at };
    }
  }
  const g = signed !== undefined ? undefined : db.get<{ value_json: string; at: string }>(
    'SELECT a.value_json, a.at FROM survey_pack_legal_answers a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
      "LEFT JOIN claims c ON c.id = j.claim_id WHERE a.question_id = 'G9d' AND (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) " +
      'ORDER BY a.at DESC, a.seq DESC LIMIT 1', [property_id, property_id]);
  if (g !== undefined) {
    let v: unknown = null;
    try { v = JSON.parse(g.value_json); } catch { v = null; }
    const d = typeof v === 'string' ? clientDate(v) : null;
    if (d !== null) return { value: d, words: 'the surveyor’s legal check', publisher: 'The surveyor', locator: 'the survey pack’s legal check, question G9d', at: g.at };
  }
  const biz = db.get<{ business_id: string }>('SELECT business_id FROM properties WHERE id = ?', [property_id])?.business_id;
  const said = biz === undefined ? null : approvedClientAnswer(db, biz, 'completion_date');
  const d = said === null ? null : clientDate(said.answer);
  return said !== null && d !== null
    ? { value: d, words: 'the client’s own answer, checked', publisher: 'The client', locator: 'their answer in the portal, checked by staff', at: said.at }
    : null;
}

/** PHASE 159e (C15, L4): is the claim's accounting period known — recorded in full, or the client's checked year end —
 *  so each part's period can be worked out? Read at approval: the year end is asked at data gathering and a version is
 *  not approved without it, because the return entries are made from the version and never ask for it afterwards. */
export function yearEndKnown(db: Db, c: { id: string; business_id: string }): boolean {
  if (yearEndReading(db, c.business_id).used !== null) return true;
  const f = latestFacts(db, c.id);
  const s = f.get('ACCOUNTING_PERIOD_START'), e = f.get('ACCOUNTING_PERIOD_END');
  return s !== undefined && e !== undefined && rowValue(s) !== null && rowValue(e) !== null;
}

/** PHASE 159g (L8): the claim's year end — Companies House's accounting reference date for a company that has one, else
 *  the client's checked answer — with the two compared (src/web/who-claims.ts yearEndFrom). */
export function yearEndReading(db: Db, business_id: string): YearEndReading {
  const said = approvedClientAnswer(db, business_id, 'year_end');
  return yearEndFrom(said === null ? null : clientYearEnd(said.answer), registerCompany(db, business_id));
}

/** PHASE 158d (F45): the accounting period the purchase falls in, from the claim's year end (Phase 159g: the register's,
 *  else the client's checked answer), or null. */
export function periodFromYearEnd(db: Db, business_id: string, acquired: string): { start: string; end: string } | null {
  const ye = yearEndReading(db, business_id).used;
  if (ye === null) return null;
  const y = Number(acquired.slice(0, 4));
  const thisYear = iso(y, ye.month, ye.day);
  if (thisYear === null) return null;
  const end = thisYear >= acquired ? thisYear : iso(y + 1, ye.month, ye.day);
  if (end === null) return null;
  const prevEnd = new Date(Date.UTC(Number(end.slice(0, 4)) - 1, ye.month - 1, ye.day));
  prevEnd.setUTCDate(prevEnd.getUTCDate() + 1);
  return { start: prevEnd.toISOString().slice(0, 10), end };
}
