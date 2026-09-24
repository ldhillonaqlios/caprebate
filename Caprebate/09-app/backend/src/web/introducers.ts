/**
 * INTRODUCERS AND THE ACCOUNTANT REFERRAL CHANNEL. CRM 5 of 10, 11 September 2026.
 *
 * The schema is migration 014; the routes are src/web/introducers-pages.ts and,
 * for the public referral form, src/web/router.ts. The mechanics are the
 * Accountant Referral Network paper, section 5 — 08-monday-doc-exports/
 * 12552691718__Accountant-Referral-Network.md — and every decision below that is
 * not obvious is a row of Part E of 09-app/CAPREBATE-CRM-DISPOSITION.md.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AN INTRODUCER IS A FIRM, AND NEVER A USER
 *
 * The firm is the row. The people at it are `contacts` of type INTRODUCER on the
 * firm — the one table a person lives in — and nothing here creates a login,
 * reads one, or leads to one. The client's own accountant, where the client has
 * one, is a different row about a different relationship: a contact on the
 * client, typed ACCOUNTANT.
 *
 * CONTACT WITH A FIRM IS A STAFF TASK ON THE FIRM (row E48). A call, an email or
 * a meeting that happened is a completed task; the next contact is an open one
 * with an owner and a due date; model A's reciprocity is logged the same way.
 * The last contact and the next are read from those tasks, as a client
 * contact's are — there is no second activity table.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROGRESS REACHES THE FIRM ONLY ON THE CLIENT'S SAY-SO (paper, section 5a)
 *
 * The client is the data subject. A stage notice — referred, indicative range
 * issued, engaged, report delivered, fee settled, and a reasoned negative — is
 * written to the outbox ONLY while the client's opt-in to share progress with
 * THAT firm is given. Never asked, declined and withdrawn read identically and
 * share nothing (N4). Every notice that falls due is kept, queued or not, with
 * the reason; the database refuses a queued one whose opt-in is not the client's
 * current answer. There is no other route by which anything about a claim is
 * addressed to an introducer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE REWARD MODEL IS BUILT BOTH WAYS AND SHIPS OFF (paper, section 5b)
 *
 * A: no cash; firm-level reciprocity logged as tasks on the firm. B: a fixed,
 * disclosed fee per successful claim, paid to the firm, never payable before the
 * disclosure is recorded. The one setting refuses to leave OFF while clause 1 of
 * the engagement letter is blank — read from the .docx the way the portal reads
 * its blanks — and whether anything is paid is Lakhbir's question.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTHING ON THE DASHBOARD IS STORED
 *
 * Leads referred, claims opened, claims won, reasoned negatives, the estimated
 * value (ADMIN and SALES) and the fees invoiced and paid (ADMIN and ACCOUNTING)
 * are read by query every time. An unknown value is counted as unknown and never
 * as nought.
 */

import type { Db } from '../db.ts';
import type { AuditLog, AuditKind, Outcome } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { outboxTransport } from '../stubs/email.ts';
import { loadLetter, type OpenTerm } from './letter.ts';
import { localDate, localStamp } from './localtime.ts';
import { formatPence, toPence } from './shown-range.ts';
import { PROCEDURE_KEYS, anyStageLabel } from './stages.ts';
import { fireAutomation } from './automation.ts';
import { ownerChoices } from './crm.ts';
import { SECTORS } from './leads.ts';
import { ACTIVITY_TYPES, RECIPROCITY_ACTIVITY_TYPES, dueReading, insertTask } from './tasks.ts';
import { vocabChoice, vocabLabel, vocabulary } from './vocabularies.ts';

export type IntroducerDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Fields = Readonly<Record<string, string | null>>;
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
export type WriteResult = { ok: true; id: string } | { ok: false; why: string; field?: string };
type Vocab = Readonly<Record<string, string>>;
type Check<T> = { ok: true; value: T } | { ok: false; why: string; field?: string };

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

export const INTRODUCER_TYPES: Vocab = Object.freeze({
  ACCOUNTANT_FIRM: 'Accountancy firm', TAX_ADVISER: 'Tax adviser', AGENT: 'Agent', SOLICITOR: 'Solicitor', OTHER: 'Other',
});

/** THE SOURCE A REFERRAL CARRIES, DERIVED FROM THE FIRM'S TYPE — never asked again. A firm whose type is not recorded refers as REFERRAL. */
export const SOURCE_FOR_TYPE: Readonly<Record<string, string>> = Object.freeze({
  ACCOUNTANT_FIRM: 'ACCOUNTANT', TAX_ADVISER: 'ADVISER', AGENT: 'REFERRAL', SOLICITOR: 'REFERRAL', OTHER: 'REFERRAL',
});

/** A lead with an introducer carries one of these, and the database refuses any other (migration 014). */
export const REFERRAL_SOURCES: readonly string[] = Object.freeze(['ACCOUNTANT', 'ADVISER', 'REFERRAL']);

/** The paper's "qualifying event", section 5 step 1. */
export const PROSPECT_EVENTS: Vocab = Object.freeze({
  PURCHASE: 'A property purchase', BUILD: 'A new build', FIT_OUT: 'Fit-out spend', REFURBISHMENT: 'A refurbishment',
  ABOUT_TO_SELL: 'About to sell',
});

/** The kinds of contact with a firm — the task list's own words (CRM 3 of 10), not a second list. */
export function contactKinds(): Vocab {
  return { CALL: ACTIVITY_TYPES['CALL'] ?? 'Call', EMAIL: ACTIVITY_TYPES['EMAIL'] ?? 'Email',
    MEETING: ACTIVITY_TYPES['MEETING'] ?? 'Meeting', NOTE: ACTIVITY_TYPES['NOTE'] ?? 'Note', OTHER: ACTIVITY_TYPES['OTHER'] ?? 'Other' };
}

/** What counts as contact for the last-contact reading: a conversation, or model A's reciprocity. */
const CONTACT_THAT_COUNTS = ['CALL', 'EMAIL', 'MEETING', 'CPD_SESSION', 'CO_BRANDED_ONE_PAGER', 'PRIORITY_TURNAROUND'] as const;

export const REWARD_MODELS: Vocab = Object.freeze({
  OFF: 'Off — nothing is offered to an introducer',
  A_RECIPROCITY: 'A — no cash. We give the firm something back: a CPD session, a joint one-pager, or faster work',
  B_DISCLOSED_FEE: 'B — a fixed, disclosed fee per successful claim, paid to the firm',
  // Phase 132e: Lakhbir's answer. Built and switched off; refused while clause 1 of the letter is blank, as A and B are.
  C_PERCENT_OF_INVOICED_FEE: 'C — a share of the fee we actually invoice, paid to a registered accountancy firm that referred the claim. Taken back if clause 13 cuts the fee',
});

/**
 * MODEL C'S PERCENTAGE — Lakhbir's answer to "Is anything paid to the accountant?", read in Phase 132c on
 * 15 September 2026: an accountant registered as an introducer may be offered 10% of our fee. It is the only
 * percentage C takes, so it is a constant with its source rather than a number anybody types. 1000 basis points.
 * WHAT IT IS COMPUTED ON: our fee as invoiced, net of VAT — never the quoted or estimated fee.
 * THE CLIENT-DISCLOSURE POINT is the solicitor's (FOR THE SOLICITOR, THE DPO AND THE DEVELOPER): whether and how a
 * percentage paid to the client's own accountant must be disclosed to the client, and when. Nothing here is payable.
 */
export const REFERRAL_PERCENTAGE = Object.freeze({
  percent_bp: 1000,
  source: 'Lakhbir’s answer to “Is anything paid to the accountant?”. An accountant registered as an introducer may be offered 10% of our fee',
});

export const REWARD_QUESTION = 'Is anything paid to the accountant?';

export const FEE_STATES: Vocab = Object.freeze({ ACCRUED: 'Accrued', PAID: 'Paid to the firm' });

export const SHARE_DECISIONS: Vocab = Object.freeze({
  GIVEN: 'Yes — share progress with this firm',
  DECLINED: 'No — do not share progress with this firm',
  WITHDRAWN: 'Withdrawn — stop sharing progress with this firm',
});

/**
 * THE WORDS THE CLIENT IS ASKED, BY VERSION. A version's words are never edited:
 * new words are a new version, added here and to the CHECK in a migration, so
 * every recorded answer still names what it answered. `{firm}` is the firm's name.
 * NOT YET APPROVED — the data protection officer's question is in CAPREBATE
 * QUESTIONS, section five, and the paper's own flag in section 5a says the same.
 */
export const SHARE_WORDING: Readonly<Record<string, string>> = Object.freeze({
  'SHARE-PROGRESS-1':
    'May we tell {firm} how your claim is progressing? We would tell them when the referral reaches us, when your ' +
    'indicative range is issued, when you engage us, when your report is delivered, when our invoice stage is ' +
    'complete, and — if the answer is that there is no claim — that there is none, and why. We would not send them ' +
    'figures, your documents or anything about the people in your business. You can change your mind at any time.',
});
export const CURRENT_SHARE_WORDING = 'SHARE-PROGRESS-1';

export type NoticeKey = 'REFERRED' | 'RANGE_ISSUED' | 'ENGAGED' | 'REPORT_DELIVERED' | 'FEE_SETTLED' | 'REASONED_NEGATIVE';

/**
 * THE PAPER'S STAGE CHANGES, MAPPED ONTO THE PROCEDURE (disposition row E50).
 * `stage` is the stage whose ENTRY is the event. `says` is what the firm is told,
 * in words the gate into that stage can support — so the invoice stage's notice
 * does not say a fee was paid, because nothing in the procedure records payment.
 */
export const NOTICES: Readonly<Record<NoticeKey, { readonly label: string; readonly stage: string; readonly says: string }>> = Object.freeze({
  REFERRED: { label: 'Referred', stage: 'ENQUIRY', says: 'The referral has reached us and the enquiry is with us.' },
  RANGE_ISSUED: {
    label: 'Indicative range issued', stage: 'ASSESSMENT',
    says: 'The client has an indicative range from the assessment. It is a pre-diligence ceiling, not a claim.',
  },
  ENGAGED: { label: 'Engaged', stage: 'DATA_GATHERING', says: 'The client has signed the engagement letter, and the work has started.' },
  REPORT_DELIVERED: {
    label: 'Report delivered', stage: 'INVOICE',
    says: 'The client has accepted the report, and the claim has been confirmed as fitting the return.',
  },
  FEE_SETTLED: {
    label: 'Fee settled — the invoice stage is complete', stage: 'DEFENCE_PACK',
    says: 'Our invoice stage is complete and the claim has moved on to its defence pack. This says nothing about whether any invoice has been paid.',
  },
  REASONED_NEGATIVE: {
    label: 'Reasoned negative', stage: 'REASONED_NEGATIVE',
    says: 'There is no claim to make, and the client keeps a written report saying why.',
  },
});

export const NOTICE_REASONS: Vocab = Object.freeze({
  NO_OPT_IN: 'not sent — the client has not agreed to share progress with this firm',
  NO_ADDRESS: 'not sent — nobody at the firm is named to get notices, or they have no email address',
  DO_NOT_CONTACT: 'not sent — the client is marked do not contact',
});

/**
 * THE PUBLIC REFERRAL FORM SHIPS OFF. It collects another firm's client's
 * details, so it waits on a published privacy notice that says so. This is its
 * own switch — the free register gate is `CB_REGISTRY.precondition` and governs
 * register lookups, not this — and turning it on is one line, not ours to turn.
 */
export const REFERRAL_FORM: { readonly enabled: boolean; readonly requires: string } = Object.freeze({
  enabled: false,
  requires: 'a published privacy notice, linked from the referral form. It tells a referred client what their firm sent us, ' +
    'why we may keep it, and how to object',
});

export function referralFormOpen(gate: { readonly enabled: boolean } = REFERRAL_FORM): boolean {
  return gate.enabled === true;
}

/* ================================================================== *
 * 2 · SMALL THINGS
 * ================================================================== */

const SECTION = '__introducer_section__';
const REWARD_OBJECT = { type: 'introducer_reward' as const, id: 'the-setting' };
const TASK_SECTION = {
  type: 'staff_task' as const, id: '__task_section__', business_id: null, owner_id: null, owner_role: null, assigned_surveyor_ids: [],
};

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return has(vocab, v) ? (vocab[v] ?? v) : none;
}

function textField(v: string | null | undefined, max: number, what: string): Check<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

function dateField(v: string | null | undefined, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const t = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(`${t}T12:00:00.000Z`))) {
    return { ok: false, why: `${what} must be a date like 2026-03-31.` };
  }
  return { ok: true, value: t };
}

function emailField(v: string | null | undefined): Check<string | null> {
  const t = textField(v, 254, 'An email address');
  if (!t.ok || t.value === null) return t;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(t.value) ? t : { ok: false, why: 'That is not an email address.' };
}

function vocabField(v: string | null | undefined, vocab: Vocab, what: string): Check<string | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  return has(vocab, v) ? { ok: true, value: v } : { ok: false, why: `${what} is not one of the choices offered.` };
}

function take<T>(input: Fields, key: string, stored: T, check: (v: string | null) => Check<T>): Check<T> {
  if (!Object.hasOwn(input, key)) return { ok: true, value: stored };
  const r = check(input[key] ?? null);
  // PHASE 133e (D4, continued): a refusal names the field it is about, so the form can draw it beside that field.
  return r.ok ? r : { ...r, field: r.field ?? key };
}

/** A UK postcode, whole or its outward half — normalised to capitals with one space. */
function postcodeField(v: string | null | undefined): Check<string | null> {
  const t = textField(v, 10, 'The postcode');
  if (!t.ok || t.value === null) return t;
  const s = t.value.toUpperCase().replace(/\s+/g, '');
  const whole = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/.exec(s);
  if (whole) return { ok: true, value: `${whole[1]} ${whole[2]}` };
  if (/^[A-Z]{1,2}\d[A-Z\d]?$/.test(s)) return { ok: true, value: s };
  return { ok: false, why: 'The postcode is not a UK postcode, or the first half of one.' };
}

function yearField(v: string | null | undefined, nowIso: string): Check<number | null> {
  if (v === null || v === undefined || v.trim() === '') return { ok: true, value: null };
  const n = Number(v.trim());
  const latest = Number(localDate(nowIso).slice(0, 4)) + 5;
  if (!Number.isInteger(n) || n < 1950 || n > latest) return { ok: false, why: `The year must be a year between 1950 and ${latest}.` };
  return { ok: true, value: n };
}

function record(
  d: IntroducerDeps, actor: Actor | null, kind: AuditKind, outcome: Outcome, object_type: string, object_id: string,
  detail: Record<string, unknown>,
): void {
  d.audit.append({
    at: d.now(), kind, outcome, actor_id: actor?.id ?? null, actor_role: actor?.role ?? null, object_type, object_id, detail,
  });
}

function introducerObj(id: string): { type: 'introducer'; id: string } {
  return { type: 'introducer', id };
}

export function assertIntroducerSection(actor: Actor): void {
  authorise(actor, 'introducer.enter', introducerObj(SECTION));
}

/* ================================================================== *
 * 3 · THE FIRM
 * ================================================================== */

type IntroducerDbRow = {
  id: string; firm_name: string; introducer_type: string | null; owner_id: string | null;
  relationship_started_on: string | null; notice_contact_id: string | null;
  notes: string | null; created_via: string; created_at: string; updated_at: string; owner_name: string | null;
  merged_into_id: string | null; merged_into_name: string | null; merged_at: string | null;
};

const INTRODUCER_SELECT =
  'SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, ' +
  'i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, u.display_name AS owner_name, ' +
  'i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at ' +
  'FROM introducers i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN introducers m ON m.id = i.merged_into_id ';

function loadIntroducer(db: Db, id: string): IntroducerDbRow {
  const r = db.get<IntroducerDbRow>(`${INTRODUCER_SELECT}WHERE i.id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

export function introducerExists(db: Db, id: string): boolean {
  return db.get<{ id: string }>('SELECT id FROM introducers WHERE id = ?', [id]) !== undefined;
}

/** The firms a lead may be attributed to — for a reader of introducers only. */
export function introducerChoices(db: Db, actor: Actor): { id: string; name: string }[] {
  if (!can(actor, 'introducer.read', introducerObj(SECTION))) return [];
  return db.all<{ id: string; name: string }>('SELECT id, firm_name AS name FROM introducers ORDER BY firm_name ASC, id ASC LIMIT 500');
}

/* ------------------------------------------------ the figures, derived */

export type PipelineFigures = {
  readonly leads_referred: number;
  readonly claims_opened: number;
  readonly claims_won: number;
  readonly reasoned_negatives: number;
};

/** Exported for CRM 9 of 10's claims-by-introducer tile, which reads these queries and never a second count. */
export function pipelineFigures(db: Db, id: string): PipelineFigures {
  const r = db.get<{ referred: number; opened: number; won: number; negatives: number }>(
    'SELECT (SELECT COUNT(*) FROM leads WHERE introducer_id = ?) AS referred, ' +
      '(SELECT COUNT(*) FROM leads WHERE introducer_id = ? AND claim_id IS NOT NULL) AS opened, ' +
      "(SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'CLOSED') AS won, " +
      "(SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'REASONED_NEGATIVE') AS negatives",
    [id, id, id, id]);
  return {
    leads_referred: r?.referred ?? 0, claims_opened: r?.opened ?? 0, claims_won: r?.won ?? 0, reasoned_negatives: r?.negatives ?? 0,
  };
}

export type ValueReading = {
  readonly estimated_allowances: string;
  readonly claims_with_estimate: number;
  readonly claims_without_estimate: number;
  readonly basis: string;
};

const EXITS_SQL = ['DECLINED_AT_ENQUIRY', 'CLIENT_DID_NOT_PROCEED', 'CLIENT_DECLINED_TO_SIGN', 'REASONED_NEGATIVE',
  'CLIENT_WITHDREW', 'OUTSIDE_AMENDMENT_WINDOW', 'CANCELLED', 'LOST'];

/**
 * THE ESTIMATED CLAIM VALUE — ADMIN AND SALES. The sealed estimate's qualifying
 * expenditure, summed over the referred claims that have not exited. A claim with
 * no sealed estimate is COUNTED AS HAVING NONE, and never added in as nought.
 */
function valueReading(db: Db, id: string): ValueReading {
  const rows = db.all<{ stage: string | null; q: number | null }>(
    'SELECT c.stage AS stage, (SELECT e.qualifying_expenditure_pence FROM estimates e WHERE e.assessment_id = c.assessment_id ' +
      'ORDER BY e.rowid DESC LIMIT 1) AS q FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ?',
    [id]);
  const live = rows.filter((r) => r.stage === null || !EXITS_SQL.includes(r.stage));
  const known = live.filter((r) => r.q !== null);
  const sum = known.reduce((a, r) => a + (r.q ?? 0), 0);
  return {
    estimated_allowances: known.length === 0 ? 'not known — no referred claim has a locked estimate' : formatPence(sum),
    claims_with_estimate: known.length,
    claims_without_estimate: live.length - known.length,
    basis: 'the spend that counts in each locked estimate, for referred claims that are still going. ' +
      'A claim with no estimate is counted apart, never as £0',
  };
}

export type MoneyReading = {
  readonly fees_invoiced: string;
  readonly fees_paid: string;
  readonly invoices_counted: number;
  readonly invoices_without_a_fee: number;
  readonly basis: string;
};

/**
 * THE FEES INVOICED AND THE MONEY RECEIVED FROM THOSE CLAIMS — ADMIN AND
 * ACCOUNTING. CRM 7 of 10: THE REFERRED CLAIMS' OWN INVOICES, raised or sent, less
 * their credit notes; and the money recorded as received against them — recorded,
 * never collected. Read from the finance tables alone, which carry no join to the
 * answers, the register data, the notes or the estimate. Another claim of the same
 * organisation is not the firm's referral, and is not counted.
 */
function moneyReading(db: Db, id: string): MoneyReading {
  const rows = db.all<{ id: string; fee: number | null }>(
    'SELECT i.id, i.fee_pence AS fee FROM invoices i WHERE i.claim_id IN ' +
      "(SELECT l.claim_id FROM leads l WHERE l.introducer_id = ? AND l.claim_id IS NOT NULL) AND i.invoice_status IN ('RAISED','SENT')",
    [id]);
  const withFee = rows.filter((r) => r.fee !== null);
  const credited = rows.reduce((a, r) => a + (db.get<{ n: number | null }>(
    'SELECT SUM(amount_pence) AS n FROM invoice_credit_notes WHERE invoice_id = ?', [r.id])?.n ?? 0), 0);
  const received = rows.reduce((a, r) => a + (db.get<{ n: number | null }>(
    'SELECT SUM(amount_pence) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL', [r.id])?.n ?? 0), 0);
  return {
    fees_invoiced: rows.length === 0 ? formatPence(0)
      : withFee.length === 0 ? 'not known — no fee is recorded on those invoices'
        : formatPence(withFee.reduce((a, r) => a + (r.fee ?? 0), 0) - credited),
    fees_paid: formatPence(received),
    invoices_counted: rows.length,
    invoices_without_a_fee: rows.length - withFee.length,
    basis: 'the referred claims’ own invoices, raised or sent, less their credit notes, and the money recorded as received ' +
      'against them. We record money; we never collect it. A claim’s invoice always has its fee. One without would be counted apart, never as £0',
  };
}

/** THE LAST CONTACT — the latest completed call, email, meeting or reciprocity task on the firm. Never typed. */
function lastContact(db: Db, id: string): { readonly at: string | null; readonly label: string } {
  const t = db.get<{ completed_at: string; activity_type: string }>(
    "SELECT completed_at, activity_type FROM staff_tasks WHERE introducer_id = ? AND status = 'COMPLETED' " +
      "AND activity_type IN ('CALL','EMAIL','MEETING','CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND') " +
      'ORDER BY completed_at DESC, rowid DESC LIMIT 1', [id]);
  void CONTACT_THAT_COUNTS;
  if (t === undefined) return { at: null, label: 'none recorded — no call, email, meeting or reciprocity with this firm is logged' };
  const kind = RECIPROCITY_ACTIVITY_TYPES[t.activity_type] ?? vocabLabel(db, 'ACTIVITY_TYPE', t.activity_type, t.activity_type);
  return { at: t.completed_at, label: `${localStamp(t.completed_at)} — ${kind.toLowerCase()}` };
}

/** THE NEXT CONTACT — the earliest open task on the firm, overdue by the UK date. */
function nextContact(db: Db, id: string, nowIso: string): { readonly label: string; readonly overdue: boolean; readonly open: number } {
  const t = db.get<{ due_on: string | null; title: string; n: number }>(
    "SELECT due_on, title, (SELECT COUNT(*) FROM staff_tasks x WHERE x.introducer_id = ? AND x.status IN ('OPEN','IN_PROGRESS')) AS n " +
      "FROM staff_tasks WHERE introducer_id = ? AND status IN ('OPEN','IN_PROGRESS') ORDER BY due_on IS NULL, due_on ASC, created_at ASC LIMIT 1",
    [id, id]);
  if (t === undefined) return { label: 'not planned — no open task on the firm', overdue: false, open: 0 };
  const due = dueReading(t.due_on, nowIso);
  return { label: `${t.due_on ?? 'no due date'} — ${t.title}${due.overdue ? ' — overdue' : ''}`, overdue: due.overdue, open: t.n };
}

/* ------------------------------------------------ the list */

export type IntroducerRow = {
  readonly id: string;
  readonly firm_name: string;
  readonly details?: {
    readonly type: string; readonly owner: string | null; readonly last_contact: string;
    readonly next_contact: { readonly label: string; readonly overdue: boolean }; readonly from_public_form: boolean;
  };
  readonly pipeline?: PipelineFigures;
  readonly money?: MoneyReading;
};

export function introducerList(db: Db, actor: Actor, nowIso: string, limit = 500): IntroducerRow[] {
  assertIntroducerSection(actor);
  return db.all<IntroducerDbRow>(`${INTRODUCER_SELECT}ORDER BY i.firm_name ASC, i.id ASC LIMIT ?`, [limit])
    .filter((r) => can(actor, 'introducer.read', introducerObj(r.id)) || can(actor, 'introducer.read_money', introducerObj(r.id)))
    .map((r) => {
      const full = can(actor, 'introducer.read', introducerObj(r.id));
      const money = can(actor, 'introducer.read_money', introducerObj(r.id));
      return {
        id: r.id, firm_name: r.firm_name,
        ...(full ? {
          details: {
            type: vocabLabel(db, 'INTRODUCER_TYPE', r.introducer_type, 'not recorded'), owner: r.owner_name,
            last_contact: lastContact(db, r.id).label, next_contact: nextContact(db, r.id, nowIso),
            from_public_form: r.created_via === 'PUBLIC_FORM',
          },
          pipeline: pipelineFigures(db, r.id),
        } : {}),
        ...(money ? { money: moneyReading(db, r.id) } : {}),
      };
    });
}

/* ------------------------------------------------ one firm */

export type IntroducerContactView = {
  readonly id: string; readonly full_name: string; readonly job_title: string | null;
  readonly email: string | null; readonly phone: string | null; readonly notes: string | null;
  readonly receives_notices: boolean;
};

/** A staff task on the firm: contact logged, or contact planned. Opened, progressed and cancelled on the task's own page. */
export type ContactLine = {
  readonly task_id: string; readonly what: string; readonly kind: string; readonly reciprocity: boolean;
  readonly with: string | null; readonly note: string | null; readonly owner: string | null;
  readonly state: string; readonly open: boolean; readonly overdue: boolean;
};

export type ReferralRow = {
  readonly lead_id: string; readonly organisation: string; readonly lead_date: string; readonly status: string;
  readonly claim: { readonly id: string; readonly claim_ref: string; readonly stage: string } | null;
  readonly share?: string;
};

export type IntroducerView = {
  readonly id: string;
  readonly firm_name: string;
  /** CRM 9 of 10: the firm this one was merged onto, and when — or null. A merged firm keeps its record. */
  readonly merged_into?: { readonly id: string; readonly name: string; readonly at: string } | null;
  /** CRM 9 of 10: for ADMIN, on a firm still recorded — the firms it may be merged onto. */
  readonly merge?: { readonly choices: readonly { readonly id: string; readonly name: string }[] };
  readonly details?: {
    readonly type: { readonly key: string | null; readonly label: string };
    readonly owner: { readonly id: string; readonly name: string } | null;
    readonly relationship_started_on: string | null;
    readonly last_contact: { readonly at: string | null; readonly label: string };
    readonly next_contact: { readonly label: string; readonly overdue: boolean; readonly open: number };
    readonly notes: string | null;
    readonly from_public_form: boolean;
  };
  readonly contacts?: readonly IntroducerContactView[];
  readonly contact_log?: readonly ContactLine[];
  readonly referrals?: readonly ReferralRow[];
  readonly pipeline?: PipelineFigures;
  readonly value?: ValueReading;
  readonly money?: MoneyReading;
  readonly fees?: readonly FeeView[];
  readonly reward: { readonly model: { readonly key: string; readonly label: string } };
  readonly may_write: boolean;
  readonly edit?: {
    readonly owners: readonly { readonly id: string; readonly name: string }[];
    readonly types: Vocab;
    readonly kinds: Vocab;
    readonly sectors: Vocab;
    readonly events: Vocab;
  };
};

function contactLog(db: Db, actor: Actor, id: string, nowIso: string): ContactLine[] {
  return db.all<{
    id: string; title: string; description: string | null; activity_type: string; status: string; due_on: string | null;
    completed_at: string | null; cancelled_at: string | null; owner_id: string | null; owner_role: string | null;
    owner: string | null; completer: string | null; person: string | null;
  }>(
    'SELECT t.id, t.title, t.description, t.activity_type, t.status, t.due_on, t.completed_at, t.cancelled_at, t.owner_id, ' +
      't.owner_role, o.display_name AS owner, cu.display_name AS completer, c.full_name AS person FROM staff_tasks t ' +
      'LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cu ON cu.id = t.completed_by LEFT JOIN contacts c ON c.id = t.contact_id ' +
      "WHERE t.introducer_id = ? ORDER BY t.status IN ('COMPLETED','CANCELLED'), t.due_on IS NULL, t.due_on ASC, " +
      't.completed_at DESC, t.created_at DESC', [id])
    .filter((t) => can(actor, 'staff_task.read', {
      type: 'staff_task', id: t.id, business_id: null, owner_id: t.owner_id, owner_role: t.owner_role, assigned_surveyor_ids: [],
    }))
    .map((t) => {
      const open = t.status === 'OPEN' || t.status === 'IN_PROGRESS';
      const due = dueReading(t.due_on, nowIso, !open);
      return {
        task_id: t.id, what: t.title, kind: RECIPROCITY_ACTIVITY_TYPES[t.activity_type] ?? vocabLabel(db, 'ACTIVITY_TYPE', t.activity_type, t.activity_type),
        reciprocity: has(RECIPROCITY_ACTIVITY_TYPES, t.activity_type), with: t.person, note: t.description, owner: t.owner,
        state: t.status === 'COMPLETED' && t.completed_at !== null ? `done ${localStamp(t.completed_at)}${t.completer === null ? '' : ` by ${t.completer}`}`
          : t.status === 'CANCELLED' ? 'cancelled' : `planned — ${due.label}`,
        open, overdue: open && due.overdue,
      };
    });
}

export function introducerView(db: Db, actor: Actor, id: string, nowIso: string): IntroducerView {
  assertIntroducerSection(actor);
  const r = loadIntroducer(db, id);
  const full = can(actor, 'introducer.read', introducerObj(r.id));
  if (!full) authorise(actor, 'introducer.read_money', introducerObj(r.id));
  const setting = rewardSetting(db);
  const mayWrite = can(actor, 'introducer.write', introducerObj(r.id)) && can(actor, 'staff_task.create', TASK_SECTION);

  const contacts = full ? db.all<{ id: string; full_name: string; job_role_other: string | null; email: string | null; phone: string | null; notes: string | null }>(
    'SELECT id, full_name, job_role_other, email, phone, notes FROM contacts WHERE introducer_id = ? ORDER BY full_name ASC, id ASC', [r.id])
    .filter((c) => can(actor, 'contact.read', { type: 'contact', id: c.id, business_id: null }))
    .map((c) => ({
      id: c.id, full_name: c.full_name, job_title: c.job_role_other, email: c.email, phone: c.phone, notes: c.notes,
      receives_notices: c.id === r.notice_contact_id,
    })) : undefined;

  const referrals = full ? db.all<{ id: string; business_id: string | null; organisation: string; lead_date: string; status: string; claim_id: string | null; claim_ref: string | null; stage: string | null }>(
    'SELECT l.id, l.business_id, COALESCE(b.name, l.prospect_organisation) AS organisation, l.lead_date, l.status, l.claim_id, ' +
      'c.claim_ref, c.stage FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN claims c ON c.id = l.claim_id ' +
      'WHERE l.introducer_id = ? ORDER BY l.lead_date DESC, l.id ASC', [r.id])
    .filter((l) => can(actor, 'lead.read', { type: 'lead', id: l.id, business_id: l.business_id }))
    .map((l) => {
      const share = can(actor, 'share_consent.read', { type: 'share_consent', id: l.id, business_id: l.business_id })
        ? shareReading(db, { id: l.id, business_id: l.business_id, introducer_id: r.id }).label : undefined;
      return {
        lead_id: l.id, organisation: l.organisation, lead_date: localStamp(l.lead_date), status: l.status,
        claim: l.claim_id === null || l.claim_ref === null ? null : { id: l.claim_id, claim_ref: l.claim_ref, stage: anyStageLabel(l.stage) },
        ...(share === undefined ? {} : { share }),
      };
    }) : undefined;

  const mayValue = can(actor, 'introducer.read_value', introducerObj(r.id));
  const mayMoney = can(actor, 'introducer.read_money', introducerObj(r.id));
  const mayFees = can(actor, 'introducer_fee.read', { type: 'introducer_fee', id: SECTION, business_id: SECTION });

  return {
    id: r.id,
    firm_name: r.firm_name,
    ...(full ? {
      details: {
        type: { key: r.introducer_type, label: vocabLabel(db, 'INTRODUCER_TYPE', r.introducer_type, 'not recorded') },
        owner: r.owner_id === null ? null : { id: r.owner_id, name: r.owner_name ?? 'a former user' },
        relationship_started_on: r.relationship_started_on,
        last_contact: lastContact(db, r.id),
        next_contact: nextContact(db, r.id, nowIso),
        notes: r.notes,
        from_public_form: r.created_via === 'PUBLIC_FORM',
      },
      pipeline: pipelineFigures(db, r.id),
      contact_log: contactLog(db, actor, r.id, nowIso),
    } : {}),
    ...(contacts === undefined ? {} : { contacts }),
    ...(referrals === undefined ? {} : { referrals }),
    ...(mayValue ? { value: valueReading(db, r.id) } : {}),
    ...(mayMoney ? { money: moneyReading(db, r.id) } : {}),
    ...(mayFees ? { fees: feeList(db, actor, r.id) } : {}),
    reward: { model: { key: setting.model, label: words(REWARD_MODELS, setting.model, setting.model) } },
    // CRM 9 of 10: a firm merged onto another says so — to a reader of the firm, not in ACCOUNTING's money-only view —
    // and ADMIN is offered the merge for a firm still recorded.
    ...(full ? { merged_into: r.merged_into_id === null ? null : { id: r.merged_into_id, name: r.merged_into_name ?? 'a firm', at: localStamp(r.merged_at ?? r.updated_at) } } : {}),
    ...(r.merged_into_id === null && can(actor, 'introducer.merge', introducerObj(r.id)) ? {
      merge: { choices: db.all<{ id: string; name: string }>(
        'SELECT id, firm_name AS name FROM introducers WHERE id <> ? AND merged_into_id IS NULL ORDER BY firm_name ASC, id ASC LIMIT 500', [r.id]) },
    } : {}),
    may_write: mayWrite,
    ...(mayWrite ? {
      edit: {
        owners: ownerChoices(db),
        types: vocabulary(db, 'INTRODUCER_TYPE', r.introducer_type),
        kinds: setting.model === 'A_RECIPROCITY' ? { ...contactKinds(), ...RECIPROCITY_ACTIVITY_TYPES } : contactKinds(),
        sectors: SECTORS,
        events: PROSPECT_EVENTS,
      },
    } : {}),
  };
}

/* ------------------------------------------------ writes on the firm */

type FirmValues = {
  firm_name: string; introducer_type: string | null; owner_id: string | null; relationship_started_on: string | null;
  notes: string | null; notice_contact_id: string | null;
};

function firmValues(db: Db, input: Fields, stored: FirmValues, firmId: string | null): Check<FirmValues> {
  const owners = ownerChoices(db);
  const name = take(input, 'firm_name', stored.firm_name as string | null, (v) => textField(v, 300, 'The firm’s name'));
  const type = take(input, 'introducer_type', stored.introducer_type, (v) => vocabChoice(db, 'INTRODUCER_TYPE', v, stored.introducer_type, 'The kind of firm'));
  const owner = take(input, 'owner_id', stored.owner_id, (v): Check<string | null> =>
    v === null || v === '' ? { ok: true, value: null }
      : owners.some((p) => p.id === v) ? { ok: true, value: v } : { ok: false, why: 'The relationship owner must be one of the people offered.' });
  const started = take(input, 'relationship_started_on', stored.relationship_started_on, (v) => dateField(v, 'The date the relationship started'));
  const notes = take(input, 'notes', stored.notes, (v) => textField(v, 8000, 'The notes'));
  const notice = take(input, 'notice_contact_id', stored.notice_contact_id, (v): Check<string | null> => {
    if (v === null || v === '') return { ok: true, value: null };
    if (firmId === null) return { ok: false, why: 'Name who receives notices once the firm has people recorded.' };
    return db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ? AND introducer_id = ?', [v, firmId]) === undefined
      ? { ok: false, why: 'The person who receives notices must be one of this firm’s own people.' } : { ok: true, value: v };
  });
  for (const c of [name, type, owner, started, notes, notice]) if (!c.ok) return c;
  if (!name.ok || !type.ok || !owner.ok || !started.ok || !notes.ok || !notice.ok) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (name.value === null) return { ok: false, why: 'An introducer is a firm, and needs its name.', field: 'firm_name' };
  return {
    ok: true,
    value: {
      firm_name: name.value, introducer_type: type.value, owner_id: owner.value, relationship_started_on: started.value,
      notes: notes.value, notice_contact_id: notice.value,
    },
  };
}

/**
 * MERGE A FIRM ONTO ONE ALREADY RECORDED — CRM 9 of 10, 12 September 2026.
 *
 * The public referral form, once it is on, makes a new firm row for every referral and never matches one already
 * recorded (`created_via` PUBLIC_FORM). This moves that firm's LEADS, PEOPLE and OPEN TASKS onto the firm it really
 * is, in one transaction, under one `introducer_merges` row — which is the only thing migration 019's
 * `contacts_introducer_fixed` admits: a person's move from exactly that firm to exactly that one while the merge is
 * open. ADMIN alone. The merged firm is kept, marked merged, and says onto which.
 *
 * WHAT IT DOES NOT MOVE, AND SAYS SO:
 *   a completed or cancelled task — a closed task keeps its record (staff_tasks_closed_is_final), so it stays on the
 *     merged firm, whose page still shows it;
 *   a client's answer on sharing progress, and every notice — those rows are never edited (migration 017). A client
 *     who said yes to the duplicate firm has not said yes to the recorded one, so no notice goes to it until the
 *     client is asked again: the safe reading, and the one N4 asks for;
 *   a fee — money is never moved by a merge. A firm with a fee recorded against it is refused.
 */
export function mergeIntroducer(d: IntroducerDeps, actor: Actor, from_id: string, input: Fields): WriteResult {
  authorise(actor, 'introducer.merge', introducerObj(from_id));
  const from = loadIntroducer(d.db, from_id);
  const intoId = (input['into_id'] ?? '').trim();
  const into = d.db.get<{ id: string; merged_into_id: string | null }>('SELECT id, merged_into_id FROM introducers WHERE id = ?', [intoId]);
  if (into === undefined) return { ok: false, why: 'Choose the firm this one really is, from the firms recorded.' };
  if (into.id === from.id) return { ok: false, why: 'A firm is not merged onto itself.' };
  if (from.merged_into_id !== null) return { ok: false, why: 'This firm has already been merged onto another.' };
  if (into.merged_into_id !== null) return { ok: false, why: 'That firm was itself merged away. Choose the firm it was merged onto.' };
  const reason = (input['reason'] ?? '').trim();
  if (reason.length < 2 || reason.length > 1000) return { ok: false, why: 'Say why these are the same firm — up to 1,000 characters.' };
  if ((d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducer_fees WHERE introducer_id = ?', [from.id])?.n ?? 0) > 0) {
    return { ok: false, why: 'This firm has a fee recorded against it. Money is never moved by a merge: settle or record it on the firm it was accrued to first.' };
  }
  const id = d.newId();
  const at = d.now();
  const moved = d.db.tx(() => {
    d.db.run('INSERT INTO introducer_merges (id, from_id, into_id, reason, merged_by, started_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, from.id, into.id, reason, actor.id, at]);
    const people = d.db.run('UPDATE contacts SET introducer_id = ?, updated_at = ? WHERE introducer_id = ?', [into.id, at, from.id]).changes;
    const leads = d.db.run('UPDATE leads SET introducer_id = ?, updated_at = ? WHERE introducer_id = ?', [into.id, at, from.id]).changes;
    const tasks = d.db.run("UPDATE staff_tasks SET introducer_id = ?, updated_at = ? WHERE introducer_id = ? AND status IN ('OPEN','IN_PROGRESS')",
      [into.id, at, from.id]).changes;
    const closed = d.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM staff_tasks WHERE introducer_id = ?', [from.id])?.n ?? 0;
    d.db.run('UPDATE introducers SET merged_into_id = ?, merged_at = ?, merged_by = ?, notice_contact_id = NULL, updated_at = ? WHERE id = ?',
      [into.id, at, actor.id, at, from.id]);
    d.db.run('UPDATE introducer_merges SET completed_at = ?, leads_moved = ?, people_moved = ?, tasks_moved = ? WHERE id = ?',
      [at, leads, people, tasks, id]);
    return { people, leads, tasks, closed };
  });
  record(d, actor, 'INTRODUCER_MERGED', 'ALLOWED', 'introducer', from.id, {
    merge: id, from: from.id, into: into.id, leads: moved.leads, people: moved.people, tasks: moved.tasks, closed_tasks_kept: moved.closed,
  });
  return { ok: true, id: into.id };
}

export function createIntroducer(d: IntroducerDeps, actor: Actor, input: Fields): WriteResult {
  authorise(actor, 'introducer.write', introducerObj(SECTION));
  const v = firmValues(d.db, input, {
    firm_name: '', introducer_type: null, owner_id: null, relationship_started_on: null, notes: null, notice_contact_id: null,
  }, null);
  if (!v.ok) return v;
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO introducers (id, firm_name, introducer_type, owner_id, relationship_started_on, ' +
      "notice_contact_id, notes, created_via, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 'STAFF', ?, ?)",
    [id, v.value.firm_name, v.value.introducer_type, v.value.owner_id, v.value.relationship_started_on, v.value.notes, at, at]);
  // WHICH route and kind, never what the notes say: a note can hold a name, and this log cannot be deleted.
  record(d, actor, 'INTRODUCER_CREATED', 'ALLOWED', 'introducer', id, { created_via: 'STAFF', introducer_type: v.value.introducer_type });
  return { ok: true, id };
}

export function updateIntroducer(d: IntroducerDeps, actor: Actor, id: string, input: Fields): WriteResult {
  const r = loadIntroducer(d.db, id);
  authorise(actor, 'introducer.write', introducerObj(r.id));
  const stored: FirmValues = {
    firm_name: r.firm_name, introducer_type: r.introducer_type, owner_id: r.owner_id,
    relationship_started_on: r.relationship_started_on, notes: r.notes, notice_contact_id: r.notice_contact_id,
  };
  const v = firmValues(d.db, input, stored, r.id);
  if (!v.ok) return v;
  const changed = (Object.keys(stored) as (keyof FirmValues)[]).filter((k) => stored[k] !== v.value[k]);
  if (changed.length === 0) return { ok: true, id: r.id };
  d.db.run(
    'UPDATE introducers SET firm_name = ?, introducer_type = ?, owner_id = ?, relationship_started_on = ?, ' +
      'notes = ?, notice_contact_id = ?, updated_at = ? WHERE id = ?',
    [v.value.firm_name, v.value.introducer_type, v.value.owner_id, v.value.relationship_started_on,
      v.value.notes, v.value.notice_contact_id, d.now(), r.id]);
  record(d, actor, 'INTRODUCER_UPDATED', 'ALLOWED', 'introducer', r.id, { fields: changed });
  return { ok: true, id: r.id };
}

/* ------------------------------------------------ the people at the firm */

type PersonValues = { full_name: string; job_role_other: string | null; email: string | null; phone: string | null; notes: string | null };

function personValues(input: Fields, stored: PersonValues): Check<PersonValues> {
  if (Object.hasOwn(input, 'contact_type')) {
    return { ok: false, why: 'A person at an introducer is always an introducer contact; that is not something to change.' };
  }
  const name = take(input, 'full_name', stored.full_name as string | null, (v) => textField(v, 200, 'A name'));
  const title = take(input, 'job_title', stored.job_role_other, (v) => textField(v, 200, 'A job title'));
  const email = take(input, 'email', stored.email, emailField);
  const phone = take(input, 'phone', stored.phone, (v) => textField(v, 40, 'A telephone number'));
  const notes = take(input, 'notes', stored.notes, (v) => textField(v, 8000, 'The notes'));
  for (const c of [name, title, email, phone, notes]) if (!c.ok) return c;
  if (!name.ok || !title.ok || !email.ok || !phone.ok || !notes.ok) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (name.value === null) return { ok: false, why: 'A contact is a person, and needs a name.', field: 'full_name' };
  return { ok: true, value: { full_name: name.value, job_role_other: title.value, email: email.value, phone: phone.value, notes: notes.value } };
}

/** Inside a caller's transaction. NO CONSENT IS INVENTED: a person typed in has ticked nothing. */
function insertPerson(d: IntroducerDeps, introducer_id: string, v: PersonValues, at: string): string {
  const id = d.newId();
  d.db.run(
    'INSERT INTO contacts (id, business_id, lead_id, introducer_id, full_name, job_role, job_role_other, contact_consent, ' +
      "marketing_optin, created_at, contact_type, email, phone, notes, updated_at) VALUES (?, NULL, NULL, ?, ?, NULL, ?, 0, 0, ?, 'INTRODUCER', ?, ?, ?, ?)",
    [id, introducer_id, v.full_name, v.job_role_other, at, v.email, v.phone, v.notes, at]);
  // THE FIRST PERSON WITH AN ADDRESS RECEIVES NOTICES, until somebody names another (row E49).
  if (v.email !== null) {
    d.db.run('UPDATE introducers SET notice_contact_id = ?, updated_at = ? WHERE id = ? AND notice_contact_id IS NULL', [id, at, introducer_id]);
  }
  return id;
}

export function addIntroducerContact(d: IntroducerDeps, actor: Actor, introducer_id: string, input: Fields): WriteResult {
  const r = loadIntroducer(d.db, introducer_id);
  authorise(actor, 'introducer.write', introducerObj(r.id));
  authorise(actor, 'contact.write', { type: 'contact', id: r.id, business_id: null });
  const v = personValues(input, { full_name: '', job_role_other: null, email: null, phone: null, notes: null });
  if (!v.ok) return v;
  const id = d.db.tx(() => insertPerson(d, r.id, v.value, d.now()));
  record(d, actor, 'CONTACT_CREATED', 'ALLOWED', 'contact', id, { business: null, introducer: r.id, contact_type: 'INTRODUCER' });
  return { ok: true, id };
}

export function updateIntroducerContact(d: IntroducerDeps, actor: Actor, introducer_id: string, contact_id: string, input: Fields): WriteResult {
  const r = loadIntroducer(d.db, introducer_id);
  const c = d.db.get<{ id: string; full_name: string; job_role_other: string | null; email: string | null; phone: string | null; notes: string | null }>(
    'SELECT id, full_name, job_role_other, email, phone, notes FROM contacts WHERE id = ? AND introducer_id = ?', [contact_id, r.id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'introducer.write', introducerObj(r.id));
  authorise(actor, 'contact.write', { type: 'contact', id: c.id, business_id: null });
  const stored: PersonValues = { full_name: c.full_name, job_role_other: c.job_role_other, email: c.email, phone: c.phone, notes: c.notes };
  const v = personValues(input, stored);
  if (!v.ok) return v;
  const changed = (Object.keys(stored) as (keyof PersonValues)[]).filter((k) => stored[k] !== v.value[k]);
  if (changed.length === 0) return { ok: true, id: c.id };
  d.db.run('UPDATE contacts SET full_name = ?, job_role_other = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?',
    [v.value.full_name, v.value.job_role_other, v.value.email, v.value.phone, v.value.notes, d.now(), c.id]);
  record(d, actor, 'CONTACT_UPDATED', 'ALLOWED', 'contact', c.id, { business: null, introducer: r.id, fields: changed });
  return { ok: true, id: c.id };
}

/* ------------------------------------------------ contact with the firm — staff tasks (row E48) */

type ContactTask = { kind: string; title: string; note: string | null; contact_id: string | null };

function contactTaskValues(d: IntroducerDeps, firmId: string, input: Fields): Check<ContactTask> {
  const kind = input['kind'] ?? null;
  if (!has({ ...contactKinds(), ...RECIPROCITY_ACTIVITY_TYPES }, kind)) {
    return { ok: false, why: 'Say what kind of contact it is — a call, an email, a meeting, a note or something else.' };
  }
  if (has(RECIPROCITY_ACTIVITY_TYPES, kind) && rewardSetting(d.db).model !== 'A_RECIPROCITY') {
    return {
      ok: false,
      why: `You can only log what we give back to a firm while reward model A is on. The reward model is ${words(REWARD_MODELS, rewardSetting(d.db).model, 'off').toLowerCase()}. ` +
        `Whether a firm is offered anything is the question “${REWARD_QUESTION}”.`,
    };
  }
  const title = textField(input['title'], 300, 'What it is');
  if (!title.ok) return title;
  if (title.value === null) return { ok: false, why: 'Say what the contact was, or is to be, in a few words.', field: 'title' };
  const note = textField(input['note'], 4000, 'The note');
  if (!note.ok) return note;
  const contact = textField(input['contact_id'], 64, 'The person');
  if (!contact.ok) return contact;
  if (contact.value !== null
    && d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ? AND introducer_id = ?', [contact.value, firmId]) === undefined) {
    return { ok: false, why: 'The person must be one of this firm’s own people.' };
  }
  return { ok: true, value: { kind, title: title.value, note: note.value, contact_id: contact.value } };
}

/** LOG CONTACT THAT HAPPENED — a staff task on the firm, created and completed by the person logging it. */
export function logContact(d: IntroducerDeps, actor: Actor, introducer_id: string, input: Fields): WriteResult {
  const r = loadIntroducer(d.db, introducer_id);
  authorise(actor, 'introducer.write', introducerObj(r.id));
  authorise(actor, 'staff_task.create', TASK_SECTION);
  const v = contactTaskValues(d, r.id, input);
  if (!v.ok) return v;
  const at = d.now();
  const id = d.db.tx(() => {
    const task = insertTask(d.db, d.now, d.newId, {
      title: v.value.title, description: v.value.note, owner_id: actor.id, owner_role: null, due_on: null, priority: null,
      activity_type: v.value.kind, business_id: null, property_id: null, claim_id: null, lead_id: null, introducer_id: r.id,
      contact_id: v.value.contact_id, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: false,
      origin: 'STAFF', automation_run_id: null, created_by: actor.id,
    });
    d.db.run("UPDATE staff_tasks SET status = 'COMPLETED', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?", [at, actor.id, at, task]);
    return task;
  });
  record(d, actor, 'STAFF_TASK_CREATED', 'ALLOWED', 'staff_task', id, { task: id, introducer: r.id, activity: v.value.kind, route: 'introducer_contact_logged' });
  record(d, actor, 'STAFF_TASK_STATUS_CHANGED', 'ALLOWED', 'staff_task', id, { task: id, from: 'OPEN', to: 'COMPLETED', introducer: r.id });
  return { ok: true, id };
}

/** PLAN THE NEXT CONTACT — an open staff task on the firm, with an owner and a due date. It is completed on its own page. */
export function planContact(d: IntroducerDeps, actor: Actor, introducer_id: string, input: Fields): WriteResult {
  const r = loadIntroducer(d.db, introducer_id);
  authorise(actor, 'introducer.write', introducerObj(r.id));
  authorise(actor, 'staff_task.create', TASK_SECTION);
  const v = contactTaskValues(d, r.id, input);
  if (!v.ok) return v;
  const due = dateField(input['due_on'], 'The due date');
  if (!due.ok) return due;
  if (due.value === null) return { ok: false, why: 'A planned contact has a date — the next contact is read from it.', field: 'due_on' };
  const owner = textField(input['owner_id'], 64, 'The owner');
  if (!owner.ok) return owner;
  if (owner.value === null || !ownerChoices(d.db).some((p) => p.id === owner.value)) {
    return { ok: false, why: 'A planned contact has an owner: choose the person who will make it.' };
  }
  const id = insertTask(d.db, d.now, d.newId, {
    title: v.value.title, description: v.value.note, owner_id: owner.value, owner_role: null, due_on: due.value, priority: null,
    activity_type: v.value.kind, business_id: null, property_id: null, claim_id: null, lead_id: null, introducer_id: r.id,
    contact_id: v.value.contact_id, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: false,
    origin: 'STAFF', automation_run_id: null, created_by: actor.id,
  });
  record(d, actor, 'STAFF_TASK_CREATED', 'ALLOWED', 'staff_task', id, { task: id, introducer: r.id, activity: v.value.kind, route: 'introducer_contact_planned' });
  return { ok: true, id };
}

/* ================================================================== *
 * 4 · A REFERRAL COMING IN
 * ================================================================== */

export type IntakeRoute = 'STAFF' | 'PUBLIC_FORM';

/**
 * A REFERRAL BECOMES A LEAD — source derived from the firm, the introducer set,
 * origin REFERRAL, and the shape CRM 2 of 10 left: the client business's NAME AND
 * SECTOR on a lead with no organisation, and NO PERSON on it. The person who
 * referred is a contact of type INTRODUCER on the firm. The property basics sit
 * beside the name, and the assessment creates the organisation and its property
 * when the client does it — conversion waits for that link, as it always has.
 *
 * STAFF: an existing firm and person, or a new firm and a new person.
 * PUBLIC_FORM: always a new firm row (`created_via` PUBLIC_FORM) and a new person,
 * never matched to a firm already recorded — a public form cannot be trusted to
 * attach itself to a real practice. Staff attribute the lead to the right firm
 * afterwards. There is no actor; the route is off until the notice is published.
 */
export function intakeReferral(d: IntroducerDeps, actor: Actor | null, input: Fields, route: IntakeRoute): WriteResult {
  if (route === 'STAFF') {
    if (actor === null) throw new NotFoundAsRefusal();
    authorise(actor, 'lead.write', { type: 'lead', id: '__lead_section__', business_id: null });
    authorise(actor, 'introducer.write', introducerObj(SECTION));
  }
  const at = d.now();
  const client = textField(input['prospect_organisation'], 300, 'The client business’s name');
  const sector = vocabField(input['prospect_sector'], SECTORS, 'The sector');
  const postcode = postcodeField(input['prospect_postcode']);
  const event = vocabField(input['prospect_event'], PROSPECT_EVENTS, 'What happened at the property');
  const year = yearField(input['prospect_event_year'], at);
  for (const c of [client, sector, postcode, event]) if (!c.ok) return c;
  if (!year.ok) return year;
  if (!client.ok || !sector.ok || !postcode.ok || !event.ok) return { ok: false, why: 'That was not saved, because one of the values is not one this form accepts. Check each field and send it again.' };
  if (client.value === null) return { ok: false, why: 'Name the client’s business — a referral is about an organisation.', field: 'prospect_organisation' };

  /* THE FIRM */
  const existingFirm = route === 'STAFF' ? textField(input['introducer_id'], 64, 'The introducer') : { ok: true as const, value: null };
  if (!existingFirm.ok) return existingFirm;
  let firm: { id: string; type: string | null } | null = null;
  let newFirm: FirmValues | null = null;
  if (existingFirm.value !== null) {
    const r = d.db.get<{ id: string; introducer_type: string | null }>('SELECT id, introducer_type FROM introducers WHERE id = ?', [existingFirm.value]);
    if (r === undefined) return { ok: false, why: 'Choose one of the introducers offered, or name a new firm.' };
    firm = { id: r.id, type: r.introducer_type };
  } else {
    const v = firmValues(d.db, {
      firm_name: input['firm_name'] ?? null,
      ...(route === 'STAFF' ? { introducer_type: input['introducer_type'] ?? null } : {}),
    }, {
      firm_name: '', introducer_type: route === 'PUBLIC_FORM' ? 'ACCOUNTANT_FIRM' : null, owner_id: null,
      relationship_started_on: null, notes: null, notice_contact_id: null,
    }, null);
    if (!v.ok) return v.why === 'An introducer is a firm, and needs its name.' ? { ok: false, why: 'Name the practice that is referring, or choose one already recorded.' } : v;
    newFirm = v.value;
  }

  /* THE PERSON AT THE FIRM */
  const existingPerson = route === 'STAFF' ? textField(input['contact_id'], 64, 'The person') : { ok: true as const, value: null };
  if (!existingPerson.ok) return existingPerson;
  if (existingPerson.value !== null && (firm === null
    || d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ? AND introducer_id = ?', [existingPerson.value, firm.id]) === undefined)) {
    return { ok: false, why: 'The person referring must be one of that firm’s own people.' };
  }
  const named = [input['contact_name'], input['contact_email'], input['contact_phone']].some((x) => x !== null && x !== undefined && x.trim() !== '');
  let person: PersonValues | null = null;
  if (existingPerson.value === null && (named || route === 'PUBLIC_FORM')) {
    const v = personValues({
      full_name: input['contact_name'] ?? null, email: input['contact_email'] ?? null, phone: input['contact_phone'] ?? null,
    }, { full_name: '', job_role_other: null, email: null, phone: null, notes: null });
    if (!v.ok) return v.why === 'A contact is a person, and needs a name.' ? { ok: false, why: 'Name the person at the practice who is referring.' } : v;
    if (route === 'PUBLIC_FORM' && v.value.email === null) return { ok: false, why: 'Give an email address, so we can reply to the referral.' };
    person = v.value;
  }
  if (route === 'PUBLIC_FORM' && input['attest'] !== 'on') {
    return { ok: false, why: 'Confirm that your client has agreed to you passing their business’s details to us.' };
  }

  const made = d.db.tx(() => {
    let firmId: string;
    let firmType: string | null;
    if (firm !== null) { firmId = firm.id; firmType = firm.type; } else {
      const v = newFirm as FirmValues;
      firmId = d.newId();
      firmType = v.introducer_type;
      d.db.run(
        'INSERT INTO introducers (id, firm_name, introducer_type, owner_id, relationship_started_on, ' +
          'notice_contact_id, notes, created_via, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)',
        [firmId, v.firm_name, v.introducer_type, route === 'STAFF' && actor !== null ? actor.id : null, route, at, at]);
    }
    const personId = person === null ? null : insertPerson(d, firmId, person, at);
    const source = firmType === null ? 'REFERRAL' : (SOURCE_FOR_TYPE[firmType] ?? 'REFERRAL');
    const leadId = d.newId();
    d.db.run(
      'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
        'prospect_organisation, prospect_sector, prospect_postcode, prospect_event, prospect_event_year, lead_date, owner_id, ' +
        'priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) ' +
        "VALUES (?, NULL, NULL, NULL, NULL, 'REFERRAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'NEW', NULL, NULL, NULL, ?, ?)",
      [leadId, source, firmId, client.value, sector.value, postcode.value, event.value, year.value, at,
        route === 'STAFF' && actor !== null ? actor.id : null, at, at]);
    return { firmId, personId, leadId, source };
  });

  const via = route === 'STAFF' ? 'referral_intake' : 'public_referral_form';
  if (firm === null) record(d, actor, 'INTRODUCER_CREATED', 'ALLOWED', 'introducer', made.firmId, { created_via: route, route: via });
  if (made.personId !== null) {
    record(d, actor, 'CONTACT_CREATED', 'ALLOWED', 'contact', made.personId, { business: null, introducer: made.firmId, contact_type: 'INTRODUCER' });
  }
  record(d, actor, 'LEAD_CREATED', 'ALLOWED', 'lead', made.leadId, {
    business: null, origin: 'REFERRAL', source: made.source, introducer: made.firmId, route: via,
    ...(route === 'PUBLIC_FORM' ? { client_agreement_confirmed: true } : {}),
  });
  // The referral is the first stage change the paper names. Nobody has asked the client yet, so it is kept, not queued.
  evaluateNotice(d, actor, made.leadId, 'REFERRED', null);
  fireAutomation(d, actor, { trigger: 'LEAD_CREATED', lead_id: made.leadId });
  return { ok: true, id: made.leadId };
}

/* ================================================================== *
 * 5 · SHARING PROGRESS — THE OPT-IN, AND THE NOTICES IT ALLOWS
 * ================================================================== */

type LeadForReferral = { id: string; business_id: string | null; introducer_id: string | null };

export type ShareReading = {
  readonly state: 'GIVEN' | 'DECLINED' | 'WITHDRAWN' | 'NEVER_ASKED';
  readonly shares: boolean;
  readonly label: string;
  readonly consent_id: string | null;
  readonly wording_version: string | null;
  readonly recorded: string | null;
};

/**
 * THE CLIENT'S CURRENT ANSWER FOR THIS FIRM — the latest row, by insertion order,
 * on the lead or on the organisation or on any of the organisation's leads. The
 * trigger on `introducer_notices` reads it the same way. NEVER ASKED SHARES
 * NOTHING, exactly as a no does.
 */
export function shareReading(db: Db, lead: LeadForReferral): ShareReading {
  const none: ShareReading = {
    state: 'NEVER_ASKED', shares: false, label: 'never asked — and nothing is shared until the client says yes',
    consent_id: null, wording_version: null, recorded: null,
  };
  if (lead.introducer_id === null) return none;
  const s = db.get<{ id: string; decision: string; wording_version: string; recorded_at: string; who: string | null }>(
    'SELECT s.id, s.decision, s.wording_version, s.recorded_at, u.display_name AS who FROM introducer_share_consents s ' +
      'LEFT JOIN users u ON u.id = s.recorded_by WHERE s.introducer_id = ? AND (s.lead_id = ? OR s.business_id = ? ' +
      'OR s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?)) ORDER BY s.rowid DESC LIMIT 1',
    [lead.introducer_id, lead.id, lead.business_id, lead.business_id]);
  if (s === undefined) return none;
  const state = s.decision === 'GIVEN' || s.decision === 'DECLINED' || s.decision === 'WITHDRAWN' ? s.decision : 'NEVER_ASKED';
  const when = `${localStamp(s.recorded_at)}${s.who === null ? '' : `, recorded by ${s.who}`}, wording ${s.wording_version}`;
  return {
    state, shares: state === 'GIVEN', consent_id: s.id, wording_version: s.wording_version, recorded: when,
    label: state === 'GIVEN' ? `yes — progress is shared with the firm (${when})`
      : state === 'DECLINED' ? `no — nothing is shared (${when})`
        : state === 'WITHDRAWN' ? `withdrawn — nothing more is shared (${when})` : none.label,
  };
}

function wordingFor(version: string, firm: string): string {
  return (SHARE_WORDING[version] ?? '').split('{firm}').join(firm);
}

export function recordShareConsent(d: IntroducerDeps, actor: Actor, lead_id: string, input: Fields): WriteResult {
  const lead = d.db.get<LeadForReferral>('SELECT id, business_id, introducer_id FROM leads WHERE id = ?', [lead_id]);
  if (lead === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'share_consent.record', { type: 'share_consent', id: lead.id, business_id: lead.business_id });
  if (lead.introducer_id === null) {
    return { ok: false, why: 'No introducer referred this lead, so there is no firm to share progress with.' };
  }
  const decision = input['decision'] ?? null;
  if (!has(SHARE_DECISIONS, decision)) {
    return { ok: false, why: 'Record what the client said — yes, no, or that they have withdrawn. Nothing is assumed.' };
  }
  if (input['wording_version'] !== CURRENT_SHARE_WORDING) {
    return { ok: false, why: 'The words the client was asked have changed since this page was drawn. Read them again, then record the answer.' };
  }
  const id = d.newId();
  d.db.run(
    'INSERT INTO introducer_share_consents (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, 'STAFF_RECORDED', ?, ?)",
    [id, lead.introducer_id, lead.business_id, lead.business_id === null ? lead.id : null, decision, CURRENT_SHARE_WORDING, actor.id, d.now()]);
  record(d, actor, 'SHARE_CONSENT_RECORDED', 'ALLOWED', 'share_consent', id, {
    decision, wording_version: CURRENT_SHARE_WORDING, introducer: lead.introducer_id, lead: lead.id, business: lead.business_id,
  });
  // A YES SHARES FROM NOW: the firm is told where the claim stands, once, and every later stage as it comes.
  if (decision === 'GIVEN') catchUp(d, actor, lead.id);
  return { ok: true, id };
}

/* ------------------------------------------------ the client's own route — CRM 8 of 10 */

/**
 * THE CLIENT GIVES OR WITHDRAWS THE OPT-IN IN THEIR OWN PORTAL, writing the same
 * table under the route CLIENT_PORTAL (migration 017). One consent history, not two.
 *
 * WITHDRAWING IS ALWAYS OPEN: stopping a notice can never be the wrong words. It is
 * offered only while the answer is yes, so a client who was never asked stays no
 * row — and shares nothing.
 *
 * GIVING FROM THE PORTAL IS BUILT AND SHIPS OFF. The words a referred client must be
 * told are not agreed; until they are, a yes is still recorded by staff, who ask.
 */
/* PHASE 151, 24 September 2026: ANSWERED AND ON. Lakhbir, Word answer 168 (closed that day): ask the client's
   permission before updating the firm that referred them, with a request from the client's own portal. So giving from
   the portal is switched on; a staff-recorded yes still works beside it, and nothing is shared without a yes. */
export const CLIENT_SHARE_GIVE: { readonly enabled: boolean; readonly requires: string } = Object.freeze({
  enabled: true,
  requires: 'Answered: the client says yes or no in their own portal first.',
});

export type ClientShareChoice = {
  readonly introducer_id: string;
  readonly firm_name: string;
  readonly state: ShareReading['state'];
  readonly says: string;
  readonly can_give: boolean;
  readonly can_withdraw: boolean;
  readonly words: string;
  readonly wording_version: string;
};

export function clientShareChoices(
  db: Db, actor: Actor, business_id: string, gate: { readonly enabled: boolean } = CLIENT_SHARE_GIVE,
): ClientShareChoice[] {
  authorise(actor, 'share_consent.client_record', { type: 'share_consent', id: business_id, business_id });
  const seen = new Set<string>();
  const out: ClientShareChoice[] = [];
  for (const f of db.all<{ lead_id: string; introducer_id: string; firm_name: string }>(
    'SELECT l.id AS lead_id, l.introducer_id, i.firm_name FROM leads l JOIN introducers i ON i.id = l.introducer_id ' +
      'WHERE l.business_id = ? ORDER BY l.rowid', [business_id])) {
    if (seen.has(f.introducer_id)) continue;
    seen.add(f.introducer_id);
    const r = shareReading(db, { id: f.lead_id, business_id, introducer_id: f.introducer_id });
    out.push({
      introducer_id: f.introducer_id, firm_name: f.firm_name, state: r.state,
      says: r.shares ? `Yes — we tell ${f.firm_name} how your claim is progressing.` : `No — we tell ${f.firm_name} nothing about your claim.`,
      can_give: gate.enabled === true && !r.shares, can_withdraw: r.shares,
      words: wordingFor(CURRENT_SHARE_WORDING, f.firm_name), wording_version: CURRENT_SHARE_WORDING,
    });
  }
  return out;
}

export function recordShareConsentByClient(
  d: IntroducerDeps, actor: Actor, business_id: string, input: Fields, gate: { readonly enabled: boolean } = CLIENT_SHARE_GIVE,
): WriteResult {
  authorise(actor, 'share_consent.client_record', { type: 'share_consent', id: business_id, business_id });
  const introducer_id = input['introducer_id'] ?? null;
  const lead = introducer_id === null ? undefined : d.db.get<LeadForReferral>(
    'SELECT id, business_id, introducer_id FROM leads WHERE business_id = ? AND introducer_id = ? ORDER BY rowid LIMIT 1', [business_id, introducer_id]);
  if (lead === undefined || lead.introducer_id === null) return { ok: false, why: 'That firm did not refer you, so there is nothing to share with it.' };
  const decision = input['decision'] ?? null;
  if (decision !== 'GIVEN' && decision !== 'WITHDRAWN') return { ok: false, why: 'Choose whether to share your claim’s progress with the firm, or to stop.' };
  const now = shareReading(d.db, lead);
  if (decision === 'WITHDRAWN' && !now.shares) return { ok: false, why: 'Nothing is being shared with that firm, so there is nothing to stop.' };
  if (decision === 'GIVEN' && gate.enabled !== true) {
    record(d, actor, 'SHARE_CONSENT_RECORDED', 'REFUSED', 'share_consent', lead.id, { decision, route: 'CLIENT_PORTAL', reason: 'SWITCHED_OFF' });
    return { ok: false, why: 'You cannot turn this on from your portal yet. If you would like us to keep the firm informed, tell us and we will ask you properly.' };
  }
  if (decision === 'GIVEN' && now.shares) return { ok: false, why: 'You have already said yes.' };
  if (input['wording_version'] !== CURRENT_SHARE_WORDING) {
    return { ok: false, why: 'The words on this page have changed since you opened it. Read them again, then choose.' };
  }
  const id = d.newId();
  d.db.run(
    'INSERT INTO introducer_share_consents (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) ' +
      "VALUES (?, ?, ?, NULL, ?, ?, 'CLIENT_PORTAL', ?, ?)",
    [id, lead.introducer_id, business_id, decision, CURRENT_SHARE_WORDING, actor.id, d.now()]);
  record(d, actor, 'SHARE_CONSENT_RECORDED', 'ALLOWED', 'share_consent', id, {
    decision, wording_version: CURRENT_SHARE_WORDING, introducer: lead.introducer_id, lead: lead.id, business: business_id, route: 'CLIENT_PORTAL',
  });
  if (decision === 'GIVEN') catchUp(d, actor, lead.id);
  return { ok: true, id };
}

/** Where a lead's claim stands, as the one notice that describes it — for the first notice after a yes. */
function standing(db: Db, lead_id: string): NoticeKey | null {
  const l = db.get<{ claim_id: string | null }>('SELECT claim_id FROM leads WHERE id = ?', [lead_id]);
  if (l === undefined) return null;
  if (l.claim_id === null) return 'REFERRED';
  const c = db.get<{ stage: string | null; hold_return_stage: string | null }>('SELECT stage, hold_return_stage FROM claims WHERE id = ?', [l.claim_id]);
  if (c === undefined) return null;
  if (c.stage === 'REASONED_NEGATIVE') return 'REASONED_NEGATIVE';
  if (c.stage === 'CLOSED') return 'FEE_SETTLED';
  const procedure = PROCEDURE_KEYS as readonly string[];
  const current = c.stage === 'ON_HOLD' ? c.hold_return_stage : c.stage;
  // Any other exit, or a stage nobody recognises: nothing the paper names describes it, so nothing is said.
  if (current === null || !procedure.includes(current)) return null;
  const moves = db.all<{ to_stage: string | null }>('SELECT to_stage FROM claim_stage_moves WHERE claim_id = ?', [l.claim_id]);
  const furthest = Math.max(procedure.indexOf(current), ...moves.map((m) => procedure.indexOf(m.to_stage ?? '')));
  if (furthest >= procedure.indexOf('DEFENCE_PACK')) return 'FEE_SETTLED';
  if (furthest >= procedure.indexOf('INVOICE')) return 'REPORT_DELIVERED';
  if (furthest >= procedure.indexOf('DATA_GATHERING')) return 'ENGAGED';
  return rangeShown(db, lead_id) ? 'RANGE_ISSUED' : 'REFERRED';
}

function catchUp(d: IntroducerDeps, actor: Actor | null, lead_id: string): void {
  const n = standing(d.db, lead_id);
  if (n === null) return;
  const claim = d.db.get<{ claim_id: string | null }>('SELECT claim_id FROM leads WHERE id = ?', [lead_id])?.claim_id ?? null;
  evaluateNotice(d, actor, lead_id, n, claim);
}

function rangeShown(db: Db, lead_id: string): boolean {
  return db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM leads l JOIN assessments a ON a.id = l.assessment_id ' +
      'WHERE l.id = ? AND (a.shown_low_pence IS NOT NULL OR a.shown_high_pence IS NOT NULL)', [lead_id])?.n === 1;
}

/** The stage whose entry is a notice's event, and nothing else is. */
export function noticeForStage(stage: string): NoticeKey | null {
  for (const [key, n] of Object.entries(NOTICES) as [NoticeKey, (typeof NOTICES)[NoticeKey]][]) if (n.stage === stage) return key;
  return null;
}

/**
 * A NOTICE FALLS DUE. It is kept either way: QUEUED to the outbox under the
 * client's current yes, or NOT_QUEUED with the reason. A notice already queued for
 * this lead is not queued twice, whatever re-enters its stage.
 *
 * WHAT THE FIRM IS SENT: the client business's name, the stage in the procedure's
 * words, and — for a reasoned negative — the listed reason's label and never the
 * note, which is staff prose that can hold a name. No figure, no document, no
 * person.
 */
export function evaluateNotice(
  d: IntroducerDeps, actor: Actor | null, lead_id: string, notice: NoticeKey, claim_id: string | null,
): 'QUEUED' | 'NO_OPT_IN' | 'NO_ADDRESS' | 'DO_NOT_CONTACT' | 'ALREADY_QUEUED' | 'NOT_REFERRED' {
  const lead = d.db.get<LeadForReferral & { organisation: string; firm_name: string | null; to_email: string | null }>(
    "SELECT l.id, l.business_id, l.introducer_id, COALESCE(b.name, l.prospect_organisation, 'the client') AS organisation, " +
      'i.firm_name, c.email AS to_email FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
      'LEFT JOIN introducers i ON i.id = l.introducer_id LEFT JOIN contacts c ON c.id = i.notice_contact_id WHERE l.id = ?',
    [lead_id]);
  if (lead === undefined || lead.introducer_id === null || lead.firm_name === null) return 'NOT_REFERRED';
  const introducer_id = lead.introducer_id;
  if (d.db.get<{ id: string }>("SELECT id FROM introducer_notices WHERE lead_id = ? AND notice = ? AND outcome = 'QUEUED'", [lead.id, notice]) !== undefined) {
    return 'ALREADY_QUEUED';
  }
  const share = shareReading(d.db, lead);
  const at = d.now();
  const keep = (outcome: 'QUEUED' | 'NOT_QUEUED', reason: string | null, consent: string | null, outbox: string | null): string => {
    const id = d.newId();
    d.db.run(
      'INSERT INTO introducer_notices (id, introducer_id, lead_id, claim_id, notice, outcome, reason, consent_id, outbox_id, at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, introducer_id, lead.id, claim_id, notice, outcome, reason, consent, outbox, at]);
    return id;
  };

  let result: 'QUEUED' | 'NO_OPT_IN' | 'NO_ADDRESS' | 'DO_NOT_CONTACT';
  let noticeId: string;
  if (!share.shares || share.consent_id === null) {
    result = 'NO_OPT_IN';
    noticeId = keep('NOT_QUEUED', 'NO_OPT_IN', null, null);
  } else if (lead.to_email === null || lead.to_email.trim() === '') {
    result = 'NO_ADDRESS';
    noticeId = keep('NOT_QUEUED', 'NO_ADDRESS', null, null);
  } else {
    const consent = share.consent_id;
    const to = lead.to_email;
    const reason = notice !== 'REASONED_NEGATIVE' || claim_id === null ? null : d.db.get<{ label: string }>(
      "SELECT r.label FROM claim_stage_moves m JOIN reason_lists r ON r.list = 'CLAIM_EXIT' AND r.code = m.reason_code " +
        "WHERE m.claim_id = ? AND m.to_stage = 'REASONED_NEGATIVE' ORDER BY m.at DESC, m.rowid DESC LIMIT 1", [claim_id])?.label ?? null;
    const n = NOTICES[notice];
    const body = [
      `To ${lead.firm_name},`,
      '',
      `${lead.organisation}: ${n.label}.`,
      n.says,
      ...(reason === null ? [] : [`The reason: ${reason}.`]),
      '',
      `You are receiving this because ${lead.organisation} asked us to share the progress of their claim with ${lead.firm_name}. ` +
        'They can withdraw that at any time, and then nothing more is sent.',
      '',
      'Cap Rebate',
    ].join('\n');
    const sent = d.db.tx(() => {
      const s = outboxTransport(d.db, d.newId, d.now).send({
        to_email: to, subject: `Cap Rebate — ${lead.organisation}: ${n.label}`, body, kind: 'NOTIFICATION', business_id: lead.business_id,
      });
      if (s.refused !== null || s.id === null) return { result: 'DO_NOT_CONTACT' as const, id: keep('NOT_QUEUED', 'DO_NOT_CONTACT', null, null) };
      return { result: 'QUEUED' as const, id: keep('QUEUED', null, consent, s.id) };
    });
    result = sent.result;
    noticeId = sent.id;
  }
  record(d, actor, 'INTRODUCER_NOTICE', result === 'QUEUED' ? 'ALLOWED' : 'REFUSED', 'introducer_notice', noticeId, {
    notice, outcome: result === 'QUEUED' ? 'QUEUED' : 'NOT_QUEUED', ...(result === 'QUEUED' ? {} : { reason: result }),
    introducer: introducer_id, lead: lead.id, claim: claim_id, business: lead.business_id,
  });
  return result;
}

/* ------------------------------------------------ the hooks the pipeline calls */

/** A claim entered a stage (src/web/pipeline.ts, after the move has committed). */
export function onClaimStageEntered(d: IntroducerDeps, actor: Actor | null, claim_id: string, stage: string): void {
  const lead = d.db.get<{ id: string }>('SELECT id FROM leads WHERE claim_id = ? AND introducer_id IS NOT NULL', [claim_id]);
  if (lead === undefined) return;
  const n = noticeForStage(stage);
  if (n !== null && !(n === 'RANGE_ISSUED' && !rangeShown(d.db, lead.id))) evaluateNotice(d, actor, lead.id, n, claim_id);
  if (stage === 'CLOSED') accrueFee(d, actor, claim_id);
}

/** A referred lead converted, and its claim opened at ASSESSMENT (src/web/leads.ts, after it committed). */
export function onLeadConverted(d: IntroducerDeps, actor: Actor | null, lead_id: string, claim_id: string): void {
  const lead = d.db.get<{ introducer_id: string | null }>('SELECT introducer_id FROM leads WHERE id = ?', [lead_id]);
  if (lead === undefined || lead.introducer_id === null) return;
  if (rangeShown(d.db, lead_id)) evaluateNotice(d, actor, lead_id, 'RANGE_ISSUED', claim_id);
}

/* ------------------------------------------------ what a lead page shows */

export type NoticeLine = { readonly at: string; readonly notice: string; readonly outcome: string };

export type LeadReferral = {
  readonly introducer: { readonly id: string; readonly name: string; readonly linkable: boolean };
  readonly share?: ShareReading & {
    readonly may_record: boolean;
    readonly current_wording: { readonly version: string; readonly words: string };
    readonly decisions: Vocab;
  };
  readonly notices?: readonly NoticeLine[];
};

export function leadReferral(db: Db, actor: Actor, lead: LeadForReferral): LeadReferral | null {
  if (lead.introducer_id === null) return null;
  const firm = db.get<{ firm_name: string }>('SELECT firm_name FROM introducers WHERE id = ?', [lead.introducer_id]);
  if (firm === undefined) return null;
  const obj = { type: 'share_consent' as const, id: lead.id, business_id: lead.business_id };
  const mayRead = can(actor, 'share_consent.read', obj);
  const labels: Vocab = Object.fromEntries(Object.entries(NOTICES).map(([k, n]) => [k, n.label]));
  return {
    introducer: { id: lead.introducer_id, name: firm.firm_name, linkable: can(actor, 'introducer.read', introducerObj(lead.introducer_id)) },
    ...(mayRead ? {
      share: {
        ...shareReading(db, lead),
        may_record: can(actor, 'share_consent.record', obj),
        current_wording: { version: CURRENT_SHARE_WORDING, words: wordingFor(CURRENT_SHARE_WORDING, firm.firm_name) },
        decisions: SHARE_DECISIONS,
      },
      notices: db.all<{ at: string; notice: string; outcome: string; reason: string | null }>(
        'SELECT at, notice, outcome, reason FROM introducer_notices WHERE lead_id = ? ORDER BY rowid ASC', [lead.id])
        .map((n) => ({
          at: localStamp(n.at),
          notice: words(labels, n.notice, n.notice),
          outcome: n.outcome === 'QUEUED' ? 'waiting to send — NOT SENT, email is not switched on yet' : words(NOTICE_REASONS, n.reason, 'not sent'),
        })),
    } : {}),
  };
}

/* ================================================================== *
 * 6 · THE REWARD MODEL
 * ================================================================== */

type SettingRow = { model: string; fee_pence: number | null; percent_bp: number | null; changed_at: string | null; who: string | null };

export function rewardSetting(db: Db): SettingRow {
  return db.get<SettingRow>(
    'SELECT s.model, s.fee_pence, s.percent_bp, s.changed_at, u.display_name AS who FROM introducer_reward_setting s ' +
      'LEFT JOIN users u ON u.id = s.changed_by WHERE s.id = 1') ?? { model: 'OFF', fee_pence: null, percent_bp: null, changed_at: null, who: null };
}

/**
 * CLAUSE 1'S BLANKS, READ FROM THE LETTER ITSELF. `unresolvedTerms` finds the
 * square-bracket placeholders in the .docx, tagged with their clause, so this
 * reads "blank" exactly as the portal does and changes the day the letter does.
 *
 * WHAT CLAUSE 1'S BLANK IS, READ ON 11 SEPTEMBER 2026, AND IT IS NOT A REFERRAL
 * FEE: the fee for Caprebate's own chartered tax adviser, introduced to sign the
 * filing position for a client who has no adviser (row E51). The switch reads it
 * as the phase asked; the question under Lakhbir says what it does and does not settle.
 */
export function clauseOneBlanks(openTerms?: readonly OpenTerm[]): readonly OpenTerm[] {
  const terms = openTerms ?? loadLetter().openTerms;
  return terms.filter((t) => /^clause 1 —/.test(t.clause));
}

export type RewardView = {
  readonly model: { readonly key: string; readonly label: string };
  readonly fee: string | null;
  readonly changed: string | null;
  readonly clause_one_blanks: readonly string[];
  readonly question: string;
  readonly may_switch: boolean;
  readonly models: Vocab;
  readonly fees?: readonly FeeView[];
  /** Phase 132e: model C's ledger — accruals and reversing entries — for a reader of `introducer_fee.read`. */
  readonly percentage_entries?: readonly PercentageEntryView[];
};

export function rewardView(db: Db, actor: Actor, opts: { openTerms?: readonly OpenTerm[] } = {}): RewardView {
  authorise(actor, 'introducer_reward.read', REWARD_OBJECT);
  const s = rewardSetting(db);
  const mayFees = can(actor, 'introducer_fee.read', { type: 'introducer_fee', id: SECTION, business_id: SECTION });
  return {
    model: { key: s.model, label: words(REWARD_MODELS, s.model, s.model) },
    fee: s.fee_pence === null ? null : formatPence(s.fee_pence),
    changed: s.changed_at === null ? null : `${localStamp(s.changed_at)}${s.who === null ? '' : ` by ${s.who}`}`,
    clause_one_blanks: clauseOneBlanks(opts.openTerms).map((t) => t.text),
    question: REWARD_QUESTION,
    may_switch: can(actor, 'introducer_reward.switch', REWARD_OBJECT),
    models: REWARD_MODELS,
    ...(mayFees ? { fees: feeList(db, actor), percentage_entries: percentageLedger(db, actor) } : {}),
  };
}

/**
 * THE SWITCH. OFF is always allowed. A AND B ARE REFUSED WHILE CLAUSE 1 OF THE
 * ENGAGEMENT LETTER IS BLANK — and the refusal is audited, because an attempt to
 * pay an introducer before the letter says so is evidence. B needs its fixed fee.
 */
export function setRewardModel(
  d: IntroducerDeps, actor: Actor, input: Fields, opts: { openTerms?: readonly OpenTerm[] } = {},
): WriteResult {
  authorise(actor, 'introducer_reward.switch', REWARD_OBJECT);
  const model = input['model'] ?? null;
  if (!has(REWARD_MODELS, model)) return { ok: false, why: 'Choose off, model A, model B or model C.' };
  const before = rewardSetting(d.db);
  if (model !== 'OFF') {
    const blanks = clauseOneBlanks(opts.openTerms);
    if (blanks.length > 0) {
      record(d, actor, 'INTRODUCER_REWARD_SWITCHED', 'REFUSED', 'introducer_reward', 'the-setting', {
        from: before.model, to: model, reason: 'CLAUSE_1_BLANK', blanks: blanks.length,
      });
      return {
        ok: false,
        why: `Introducer fees stay off while clause 1 of the engagement letter is blank. It still reads ${blanks.map((t) => t.text).join(' ')} ` +
          `Lakhbir decides whether we pay an introducer: “${REWARD_QUESTION}”.`,
      };
    }
  }
  let fee: number | null = null;
  if (model === 'B_DISCLOSED_FEE') {
    const raw = (input['fee_pounds'] ?? '').replace(/[£,\s]/g, '');
    const pounds = raw === '' ? Number.NaN : Number(raw);
    fee = Number.isFinite(pounds) && pounds > 0 ? toPence(pounds) : null;
    if (fee === null || fee <= 0) return { ok: false, why: 'Model B is a fixed fee: give the amount paid to the firm per successful claim, in pounds.' };
  }
  // Model C takes its percentage from REFERRAL_PERCENTAGE — the decided 10% — and nothing typed.
  const percent = model === 'C_PERCENT_OF_INVOICED_FEE' ? REFERRAL_PERCENTAGE.percent_bp : null;
  d.db.run('UPDATE introducer_reward_setting SET model = ?, fee_pence = ?, percent_bp = ?, changed_by = ?, changed_at = ? WHERE id = 1',
    [model, fee, percent, actor.id, d.now()]);
  // The amount is on the row and not in the log — as an invoice's is.
  record(d, actor, 'INTRODUCER_REWARD_SWITCHED', 'ALLOWED', 'introducer_reward', 'the-setting', { from: before.model, to: model });
  return { ok: true, id: 'the-setting' };
}

/* ------------------------------------------------ model B's fees */

export type FeeView = {
  readonly id: string;
  readonly firm: { readonly id: string; readonly name: string };
  readonly claim: { readonly id: string; readonly claim_ref: string };
  readonly amount: string;
  readonly disclosure: { readonly given: boolean; readonly recorded: string | null };
  readonly state: { readonly key: string; readonly label: string };
  readonly payable: boolean;
  readonly paid: string | null;
  readonly may_disclose: boolean;
  readonly may_record_settled: boolean;
};

type FeeDbRow = {
  id: string; introducer_id: string; firm_name: string; claim_id: string; claim_ref: string; business_id: string; amount_pence: number;
  disclosure_given_at: string | null; discloser: string | null; state: string; paid_at: string | null; payer: string | null;
};

const FEE_SELECT =
  'SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, ' +
  'du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f ' +
  'JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id ' +
  'LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by ';

function feeObj(r: { id: string; business_id: string }): { type: 'introducer_fee'; id: string; business_id: string } {
  return { type: 'introducer_fee', id: r.id, business_id: r.business_id };
}

export function feeList(db: Db, actor: Actor, introducer_id?: string): FeeView[] {
  const rows = introducer_id === undefined
    ? db.all<FeeDbRow>(`${FEE_SELECT}ORDER BY f.created_at DESC, f.id ASC`)
    : db.all<FeeDbRow>(`${FEE_SELECT}WHERE f.introducer_id = ? ORDER BY f.created_at DESC, f.id ASC`, [introducer_id]);
  return rows.filter((r) => can(actor, 'introducer_fee.read', feeObj(r))).map((r) => ({
    id: r.id,
    firm: { id: r.introducer_id, name: r.firm_name },
    claim: { id: r.claim_id, claim_ref: r.claim_ref },
    amount: formatPence(r.amount_pence),
    disclosure: {
      given: r.disclosure_given_at !== null,
      recorded: r.disclosure_given_at === null ? null : `${localStamp(r.disclosure_given_at)}${r.discloser === null ? '' : ` by ${r.discloser}`}`,
    },
    state: { key: r.state, label: words(FEE_STATES, r.state, r.state) },
    // NOTHING IS PAYABLE BEFORE THE DISCLOSURE IS GIVEN.
    payable: r.state === 'ACCRUED' && r.disclosure_given_at !== null,
    paid: r.paid_at === null ? null : `${localStamp(r.paid_at)}${r.payer === null ? '' : ` by ${r.payer}`}`,
    may_disclose: r.disclosure_given_at === null && can(actor, 'introducer_fee.disclose', feeObj(r)),
    may_record_settled: r.state === 'ACCRUED' && r.disclosure_given_at !== null && can(actor, 'introducer_fee.record_settled', feeObj(r)),
  }));
}

/** A referred claim closed — the paper's "successful claim" — while model B is the setting. */
function accrueFee(d: IntroducerDeps, actor: Actor | null, claim_id: string): void {
  const s = rewardSetting(d.db);
  if (s.model !== 'B_DISCLOSED_FEE' || s.fee_pence === null) return;
  const l = d.db.get<{ introducer_id: string; business_id: string }>(
    'SELECT l.introducer_id, c.business_id FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.claim_id = ? AND l.introducer_id IS NOT NULL',
    [claim_id]);
  if (l === undefined) return;
  if (d.db.get<{ id: string }>('SELECT id FROM introducer_fees WHERE claim_id = ?', [claim_id]) !== undefined) return;
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO introducer_fees (id, introducer_id, claim_id, business_id, amount_pence, disclosure_given_at, disclosure_recorded_by, ' +
      "state, paid_at, paid_recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'ACCRUED', NULL, NULL, ?, ?)",
    [id, l.introducer_id, claim_id, l.business_id, s.fee_pence, at, at]);
  record(d, actor, 'INTRODUCER_FEE_ACCRUED', 'ALLOWED', 'introducer_fee', id, { introducer: l.introducer_id, claim: claim_id, business: l.business_id });
}

function loadFee(db: Db, id: string): FeeDbRow {
  const r = db.get<FeeDbRow>(`${FEE_SELECT}WHERE f.id = ?`, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

export function recordFeeDisclosure(d: IntroducerDeps, actor: Actor, fee_id: string): WriteResult {
  const r = loadFee(d.db, fee_id);
  authorise(actor, 'introducer_fee.disclose', feeObj(r));
  if (r.disclosure_given_at !== null) return { ok: false, why: 'The disclosure is already recorded, and it stays recorded.' };
  const at = d.now();
  d.db.run('UPDATE introducer_fees SET disclosure_given_at = ?, disclosure_recorded_by = ?, updated_at = ? WHERE id = ?', [at, actor.id, at, r.id]);
  record(d, actor, 'INTRODUCER_FEE_DISCLOSED', 'ALLOWED', 'introducer_fee', r.id, { introducer: r.introducer_id, claim: r.claim_id, business: r.business_id });
  return { ok: true, id: r.id };
}

/**
 * RECORD THAT THE FEE WAS PAID TO THE FIRM. Nothing is collected here: this is
 * Caprebate's own payment out, recorded. REFUSED — and audited — until the
 * disclosure to the client is recorded as given.
 */
export function recordFeeSettled(d: IntroducerDeps, actor: Actor, fee_id: string): WriteResult {
  const r = loadFee(d.db, fee_id);
  authorise(actor, 'introducer_fee.record_settled', feeObj(r));
  if (r.state === 'PAID') return { ok: false, why: 'This fee is already recorded as paid to the firm, and that is final.' };
  if (r.disclosure_given_at === null) {
    record(d, actor, 'INTRODUCER_FEE_PAID', 'REFUSED', 'introducer_fee', r.id, {
      introducer: r.introducer_id, claim: r.claim_id, business: r.business_id, reason: 'NO_DISCLOSURE',
    });
    return { ok: false, why: 'Nothing can be paid to an introducer until we record that the client was told about the fee.' };
  }
  const at = d.now();
  d.db.run("UPDATE introducer_fees SET state = 'PAID', paid_at = ?, paid_recorded_by = ?, updated_at = ? WHERE id = ?", [at, actor.id, at, r.id]);
  record(d, actor, 'INTRODUCER_FEE_PAID', 'ALLOWED', 'introducer_fee', r.id, { introducer: r.introducer_id, claim: r.claim_id, business: r.business_id });
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 7 · MODEL C — A PERCENTAGE OF OUR FEE ACTUALLY INVOICED   Phase 132e
 *
 * Switched off, as the setting ships. Two hooks, both called by src/web/invoices.ts
 * after its own write has committed, and both silent when there is nothing to do:
 *   onFeeInvoiced         our fee invoice raised on a referred claim, while C is
 *                         the setting and the referring firm is a registered
 *                         accountancy firm: an ACCRUAL of the percentage of the fee
 *                         as invoiced (net of VAT).
 *   onClause13Credit      a clause 13 credit note on an invoice that carries an
 *                         accrual: a REVERSAL of the same percentage of the amount
 *                         credited — whatever the setting is now, because the
 *                         accrual exists — never more than is left, and never a
 *                         delete or an edit of the accrual (migration 028).
 * ================================================================== */

export type PercentageEntryView = {
  readonly id: string;
  readonly firm: { readonly id: string; readonly name: string };
  readonly claim: { readonly id: string; readonly claim_ref: string };
  readonly kind: 'ACCRUAL' | 'REVERSAL';
  readonly basis: string;
  readonly percent: string;
  readonly amount: string;
  readonly amount_pence: number;
  readonly recorded: string;
};

function percentOf(basis_pence: number, bp: number): number {
  return Math.round((basis_pence * bp) / 10000);
}

export function onFeeInvoiced(d: IntroducerDeps, actor: Actor | null, invoice_id: string): void {
  const s = rewardSetting(d.db);
  if (s.model !== 'C_PERCENT_OF_INVOICED_FEE' || s.percent_bp === null) return;
  const v = d.db.get<{ id: string; claim_id: string | null; business_id: string; kind: string; fee_pence: number }>(
    'SELECT id, claim_id, business_id, kind, fee_pence FROM invoices WHERE id = ?', [invoice_id]);
  if (v === undefined || v.claim_id === null || v.kind !== 'FEE' || v.fee_pence <= 0) return;
  const l = d.db.get<{ introducer_id: string }>(
    "SELECT l.introducer_id FROM leads l JOIN introducers i ON i.id = l.introducer_id WHERE l.claim_id = ? AND i.introducer_type = 'ACCOUNTANT_FIRM'",
    [v.claim_id]);
  if (l === undefined) return;
  if (d.db.get<{ id: string }>("SELECT id FROM introducer_percentage_entries WHERE invoice_id = ? AND entry_kind = 'ACCRUAL'", [v.id]) !== undefined) return;
  const amount = percentOf(v.fee_pence, s.percent_bp);
  if (amount <= 0) return;
  const id = d.newId();
  d.db.run(
    'INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, credit_note_id, entry_kind, basis_pence, percent_bp, amount_pence, recorded_by, created_at) ' +
      "VALUES (?, ?, ?, ?, ?, NULL, 'ACCRUAL', ?, ?, ?, ?, ?)",
    [id, l.introducer_id, v.claim_id, v.business_id, v.id, v.fee_pence, s.percent_bp, amount, actor?.id ?? null, d.now()]);
  // Ids only — the amount is on the row, as an invoice's is.
  record(d, actor, 'INTRODUCER_PERCENTAGE_ACCRUED', 'ALLOWED', 'introducer_fee', id, { introducer: l.introducer_id, claim: v.claim_id, invoice: v.id });
}

export function onClause13Credit(d: IntroducerDeps, actor: Actor | null, credit_note_id: string): void {
  const n = d.db.get<{ id: string; invoice_id: string; basis: string; amount_pence: number }>(
    'SELECT id, invoice_id, basis, amount_pence FROM invoice_credit_notes WHERE id = ?', [credit_note_id]);
  if (n === undefined || n.basis !== 'CLAUSE_13_REDUCTION') return;
  const a = d.db.get<{ introducer_id: string; claim_id: string; business_id: string; percent_bp: number }>(
    "SELECT introducer_id, claim_id, business_id, percent_bp FROM introducer_percentage_entries WHERE invoice_id = ? AND entry_kind = 'ACCRUAL'",
    [n.invoice_id]);
  if (a === undefined) return;
  const left = d.db.get<{ t: number }>('SELECT SUM(amount_pence) AS t FROM introducer_percentage_entries WHERE invoice_id = ?', [n.invoice_id])?.t ?? 0;
  const amount = Math.min(percentOf(n.amount_pence, a.percent_bp), left);
  if (amount <= 0) return;
  const id = d.newId();
  d.db.run(
    'INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, credit_note_id, entry_kind, basis_pence, percent_bp, amount_pence, recorded_by, created_at) ' +
      "VALUES (?, ?, ?, ?, ?, ?, 'REVERSAL', ?, ?, ?, ?, ?)",
    [id, a.introducer_id, a.claim_id, a.business_id, n.invoice_id, n.id, n.amount_pence, a.percent_bp, -amount, actor?.id ?? null, d.now()]);
  record(d, actor, 'INTRODUCER_PERCENTAGE_REVERSED', 'ALLOWED', 'introducer_fee', id, { introducer: a.introducer_id, claim: a.claim_id, invoice: n.invoice_id, credit_note: n.id });
}

/** The ledger, newest first, each entry asked of `introducer_fee.read` on its own organisation. */
export function percentageLedger(db: Db, actor: Actor, introducer_id?: string): PercentageEntryView[] {
  const sql = 'SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, c.claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, ' +
    'e.amount_pence, e.created_at FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id ' +
    'JOIN claims c ON c.id = e.claim_id ';
  type Row = { id: string; introducer_id: string; firm_name: string; claim_id: string; claim_ref: string; business_id: string;
    entry_kind: 'ACCRUAL' | 'REVERSAL'; basis_pence: number; percent_bp: number; amount_pence: number; created_at: string };
  const rows = introducer_id === undefined
    ? db.all<Row>(`${sql}ORDER BY e.created_at DESC, e.rowid DESC`)
    : db.all<Row>(`${sql}WHERE e.introducer_id = ? ORDER BY e.created_at DESC, e.rowid DESC`, [introducer_id]);
  return rows.filter((r) => can(actor, 'introducer_fee.read', { type: 'introducer_fee', id: r.id, business_id: r.business_id })).map((r) => ({
    id: r.id, firm: { id: r.introducer_id, name: r.firm_name }, claim: { id: r.claim_id, claim_ref: r.claim_ref },
    kind: r.entry_kind, basis: formatPence(r.basis_pence), percent: `${r.percent_bp / 100}%`,
    amount: r.amount_pence < 0 ? `−${formatPence(-r.amount_pence)}` : formatPence(r.amount_pence),
    amount_pence: r.amount_pence, recorded: localStamp(r.created_at),
  }));
}

/**
 * PHASE 133a — THE GATE OF THE REWARD MODEL, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function rewardModelGate(actor: Actor): void {
  authorise(actor, 'introducer_reward.read', REWARD_OBJECT);
}
