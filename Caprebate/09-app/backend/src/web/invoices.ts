/**
 * FINANCE ON THE CLAIM — INVOICES, CREDIT NOTES AND MONEY RECEIVED.
 * CRM 7 of 10, 11 September 2026.
 *
 * The schema is migration 016; the fee is src/web/fee-controls.ts; the VAT and
 * its monitoring are src/web/vat.ts; the pages are src/web/finance-pages.ts. The
 * scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 13.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * AN INVOICE BELONGS TO A CLAIM, AND ITS AMOUNT IS NEVER TYPED
 *
 * Our fee is raised on a claim at the invoice stage, once the fee trigger is
 * reached — FEE_TRIGGER in src/web/pipeline.ts, read and never re-decided — and
 * inside the amendment window. Its figure is the tax adviser's signed-off figure;
 * its fee derives from that through CB_FEE and the fee controls; its VAT from the
 * recorded VAT position. A claim that has exited is refused, and a claim that left
 * OUTSIDE_AMENDMENT_WINDOW is refused every kind of invoice: that exit stops the
 * job before a fee is incurred (SOP 9).
 *
 * A NUMBER from one gapless series, never reused; an invoice cancelled before it
 * was sent keeps its number, recorded as cancelled. THE DUE DATE comes from the
 * letter's payment terms — blank today, so it is UNSET and says so, never thirty
 * days by default. A CREDIT NOTE is the only way a raised amount changes, and it
 * takes no typed amount either: in full, or clause 13's recalculation.
 *
 * RECORDED, NOT COLLECTED. Money received is a row a person writes after seeing
 * the bank: the day, the amount, bank transfer, who, and whether the client
 * confirmed our bank details on a channel other than email. The outstanding
 * balance, the payment state and OVERDUE are read from the rows, never stored.
 *
 * ACCOUNTING REACHES MONEY ONLY. Nothing here joins the answers, the register
 * data, the notes, the surveyor's workings or the estimate: the sign-off record is
 * read inside the server to copy one figure onto the invoice, as migration 006
 * decided for its five facts, and nothing of it is returned but that figure.
 */

import type { Db } from '../db.ts';
import type { AuditKind, AuditLog, Outcome } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localDate, localStamp } from './localtime.ts';
import { formatPence, toPence } from './shown-range.ts';
import { addDaysToDate, dueReading, taskObj, type DueReading } from './tasks.ts';
import { claimStage } from './stages.ts';
import { enteredAt, feeTriggerReached, liveFeeInvoiceCount, loadPipelineClaim, reportDeliveredOn, type FeeTrigger } from './pipeline.ts';
import { clawbackReading, invoiceWindowNeed, signOffSinceEntry } from './claim-record.ts';
import { claimantTypeForGate, claimObjFor } from './crm.ts';
import {
  computeFee, controlsView, letterFee, letterFees, FEE_CONTROLS, PAYMENT_TERMS_QUESTION,
  type ControlsView, type FeeControls,
} from './fee-controls.ts';
import {
  ensureVatTask, expectedFees, monthStart, settingsView, vatForInvoice, vatReading,
  type SettingsView, type VatReading,
} from './vat.ts';
import { assertFinanceSection, feeVersusBenefit, financeSectionObj, type FeeVersusBenefit } from './finance.ts';
import { feeList, onClause13Credit, onFeeInvoiced, type FeeView } from './introducers.ts';
import type { Letter } from './letter.ts';

export type InvoiceDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one, so the
 *  message is drawn beside that field rather than at the top of the form. A refusal about the invoice's own
 *  state — already sent, already cancelled, nothing owed — is about no one field and carries none. */
export type InvoiceResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
type Fields = Readonly<Record<string, string | null | undefined>>;
type LetterSource = Pick<Letter, 'paragraphs' | 'openTerms'>;

/** Everything a test — or the day a decision lands — may set in place of what ships. */
export type InvoiceOptions = {
  readonly controls?: FeeControls;
  readonly letter?: LetterSource;
  readonly feeTrigger?: FeeTrigger;
  readonly clawback?: { readonly enabled: boolean };
};

/* ================================================================== *
 * 1 · THE WORDS
 * ================================================================== */

type Vocab = Readonly<Record<string, string>>;

export const INVOICE_KINDS: Vocab = Object.freeze({
  FEE: 'our fee',
  BREAK_FEE: 'the break fee, clause 5',
  ABORT_FEE: 'the abort fee, clause 4',
});

export const CLAIM_INVOICE_STATES: Vocab = Object.freeze({
  RAISED: 'raised, not sent',
  SENT: 'sent',
  CANCELLED: 'cancelled before it was sent — its number is recorded as cancelled and never reused',
});

export const CREDIT_BASES: Vocab = Object.freeze({
  CREDIT_IN_FULL: 'credited in full',
  CLAUSE_13_REDUCTION: 'reduced under clause 13 — the fee recalculated on the corrected figure',
});

export const BANK_CONFIRMATIONS: Vocab = Object.freeze({
  OTHER_CHANNEL: 'the client confirmed our bank details on a channel other than email',
  NOT_CONFIRMED: 'NOT confirmed on a channel other than email',
  NOT_KNOWN: 'not known whether the client confirmed our bank details on a channel other than email',
});

/** Never asked — which reads exactly as not known does, and is neither a confirmation (N4). */
export const BANK_NEVER_ASKED = 'never asked whether the client confirmed our bank details on a channel other than email';

export const RECORDED_NOT_COLLECTED =
  'RECORDED, NOT COLLECTED. Nothing tells this system that a transfer arrived: a person who has seen the bank records it here. ' +
  'There is no card processor, no bank feed and no route that takes money.';

export const DUE_UNSET = 'UNSET';

export function formatInvoiceNumber(seq: number | null): string | null {
  return seq === null ? null : `CB-${String(seq).padStart(6, '0')}`;
}

function words(vocab: Vocab, key: string | null, fallback: string): string {
  return key !== null && Object.hasOwn(vocab, key) ? (vocab[key] ?? fallback) : fallback;
}

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

function isDate(s: string | null): s is string {
  if (s === null || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function record(d: InvoiceDeps, actor: Actor, kind: AuditKind, object_type: string, id: string, outcome: Outcome, detail: Record<string, unknown>): void {
  d.audit.append({ at: d.now(), kind, outcome, actor_id: actor.id, actor_role: actor.role, object_type, object_id: id, detail });
}

/* ================================================================== *
 * 2 · THE NUMBER SERIES
 * ================================================================== */

/**
 * THE NEXT NUMBER — ONE MORE THAN THE LAST, in the caller's transaction. The
 * table's trigger refuses anything else, so a second writer racing this one fails
 * rather than skipping or reusing a number.
 */
export function allocateNumber(
  db: Db, kind: 'INVOICE' | 'CREDIT_NOTE', invoice_id: string, credit_note_id: string | null, by: string, at: string,
): number {
  const next = db.get<{ n: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM invoice_numbers')?.n ?? 1;
  db.run(
    'INSERT INTO invoice_numbers (seq, kind, invoice_id, credit_note_id, state, issued_at, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [next, kind, invoice_id, credit_note_id, 'ISSUED', at, by]);
  return next;
}

/* ================================================================== *
 * 3 · THE MONEY — READ, NEVER STORED
 * ================================================================== */

export type MoneyState = 'CANCELLED' | 'NOTHING_RECEIVED' | 'PART_RECEIVED' | 'RECEIVED_IN_FULL' | 'CREDITED_IN_FULL' | 'MONEY_TO_RETURN';

export const MONEY_WORDS: Readonly<Record<MoneyState, string>> = Object.freeze({
  CANCELLED: 'cancelled — nothing is owed',
  NOTHING_RECEIVED: 'nothing received',
  PART_RECEIVED: 'part received',
  RECEIVED_IN_FULL: 'received in full',
  CREDITED_IN_FULL: 'credited in full — nothing is owed',
  MONEY_TO_RETURN: 'MORE HAS BEEN RECEIVED THAN IS NOW OWED — the difference is owed back to the client, and nothing here pays it',
});

export type InvoiceMoney = {
  readonly total_pence: number; readonly credited_pence: number; readonly received_pence: number; readonly outstanding_pence: number;
  readonly total: string; readonly credited: string; readonly received: string; readonly outstanding: string;
  readonly state: MoneyState; readonly label: string;
  readonly due: DueReading; readonly overdue: boolean;
  /** Money recorded without the client's confirmation on another channel — never asked and not known alike. */
  readonly unconfirmed_bank_details: number;
};

export function invoiceMoney(
  db: Db, i: { id: string; fee_pence: number; vat_pence: number; invoice_status: string; due_on: string | null }, nowIso: string,
): InvoiceMoney {
  const creditRow = db.get<{ a: number | null; v: number | null }>(
    'SELECT SUM(amount_pence) AS a, SUM(vat_pence) AS v FROM invoice_credit_notes WHERE invoice_id = ?', [i.id]);
  const credited = (creditRow?.a ?? 0) + (creditRow?.v ?? 0);
  const received = db.get<{ n: number | null }>(
    'SELECT SUM(amount_pence) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL', [i.id])?.n ?? 0;
  const unconfirmed = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL ' +
      "AND (bank_details_confirmed IS NULL OR bank_details_confirmed <> 'OTHER_CHANNEL')", [i.id])?.n ?? 0;
  const total = i.fee_pence + i.vat_pence;
  const owed = total - credited;
  const outstanding = i.invoice_status === 'CANCELLED' ? 0 : owed - received;
  const state: MoneyState = i.invoice_status === 'CANCELLED' ? 'CANCELLED'
    : outstanding < 0 ? 'MONEY_TO_RETURN'
      : owed <= 0 ? 'CREDITED_IN_FULL'
        : received === 0 ? 'NOTHING_RECEIVED'
          : outstanding === 0 ? 'RECEIVED_IN_FULL' : 'PART_RECEIVED';
  const open = state === 'NOTHING_RECEIVED' || state === 'PART_RECEIVED';
  const due = dueReading(i.due_on, nowIso, !open);
  return {
    total_pence: total, credited_pence: credited, received_pence: received, outstanding_pence: outstanding,
    total: formatPence(total), credited: formatPence(credited), received: formatPence(received), outstanding: formatPence(outstanding),
    state, label: MONEY_WORDS[state], due, overdue: due.overdue, unconfirmed_bank_details: unconfirmed,
  };
}

/* ================================================================== *
 * 4 · READING A CLAIM'S INVOICES
 * ================================================================== */

type InvoiceRow = {
  id: string; business_id: string; claim_id: string; kind: string; claim_value_pence: number | null; fee_pence: number;
  fee_rate: number | null; invoice_status: string; vat_position: string; vat_pence: number; invoice_date: string;
  due_on: string | null; due_basis: string; sent_on: string | null; fee_basis: string; fee_warning: string | null;
  cancelled_at: string | null; cancel_reason: string | null; created_at: string; entity_type: string | null;
  tax_rate: number | null; pool_split_main_pence: number | null; pool_split_special_pence: number | null; period_start: string | null;
  claim_ref: string; client_name: string; seq: number | null; number_state: string | null; raiser: string | null; canceller: string | null;
};

const INVOICE_SELECT =
  'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, ' +
  'i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, ' +
  'i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, ' +
  'c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller ' +
  'FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id ' +
  "LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = 'INVOICE' " +
  'LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by ';

function loadInvoice(db: Db, id: string): InvoiceRow {
  const r = db.get<InvoiceRow>(`${INVOICE_SELECT}WHERE i.id = ?`, [id]);
  // A missing row, an organisation's old invoice and a forbidden row look the same from outside.
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/** Whether `id` is a claim's invoice — for the page deciding which view to draw. Authorises nothing. */
export function isClaimInvoice(db: Db, id: string): boolean {
  return db.get<{ id: string }>('SELECT id FROM invoices WHERE id = ? AND claim_id IS NOT NULL', [id]) !== undefined;
}

export type CreditNoteView = {
  readonly id: string; readonly number: string | null; readonly basis: string; readonly amount: string; readonly vat: string;
  readonly issued_on: string; readonly reason: string; readonly recorded: string;
};

export type ReceivedView = {
  readonly id: string; readonly received_on: string; readonly amount: string; readonly method: string;
  readonly bank_details: string; readonly confirmed_off_email: boolean; readonly recorded: string; readonly voided: string | null;
};

export type ClaimInvoiceView = {
  readonly id: string;
  readonly number: string | null;
  readonly number_cancelled: boolean;
  readonly claim: { readonly id: string; readonly claim_ref: string };
  readonly client_name: string;
  readonly kind: { readonly key: string; readonly label: string };
  readonly state: { readonly key: string; readonly label: string };
  readonly invoice_date: string;
  readonly sent_on: string | null;
  readonly fee: string;
  readonly fee_pence: number;
  readonly fee_rate: string | null;
  readonly vat: string;
  readonly vat_position: string;
  /** The signed-off figure the fee was taken from — for our fee only. */
  readonly claim_figure: string | null;
  readonly fee_basis: string;
  readonly fee_warning: string | null;
  readonly due_on: string | null;
  readonly due_shown: string;
  readonly due_basis: string;
  readonly money: InvoiceMoney;
  readonly credit_notes: readonly CreditNoteView[];
  readonly received: readonly ReceivedView[];
  readonly raised: string;
  readonly cancelled: string | null;
  readonly comparison: FeeVersusBenefit | null;
  readonly may: {
    readonly send: boolean; readonly cancel: boolean; readonly credit: boolean; readonly record_received: boolean;
    readonly void_received: boolean;
  };
};

function viewOf(db: Db, actor: Actor, r: InvoiceRow, nowIso: string): ClaimInvoiceView {
  const obj = { type: 'invoice' as const, id: r.id, business_id: r.business_id };
  const money = invoiceMoney(db, r, nowIso);
  const credit_notes = db.all<{
    id: string; basis: string; amount_pence: number; vat_pence: number; issued_on: string; reason: string; recorded_at: string; who: string | null; seq: number | null;
  }>(
    'SELECT c.id, c.basis, c.amount_pence, c.vat_pence, c.issued_on, c.reason, c.recorded_at, u.display_name AS who, n.seq ' +
      'FROM invoice_credit_notes c LEFT JOIN users u ON u.id = c.recorded_by LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
      'WHERE c.invoice_id = ? ORDER BY c.recorded_at ASC, c.rowid ASC', [r.id],
  ).map((c) => ({
    id: c.id, number: formatInvoiceNumber(c.seq), basis: words(CREDIT_BASES, c.basis, c.basis), amount: formatPence(c.amount_pence),
    vat: formatPence(c.vat_pence), issued_on: c.issued_on, reason: c.reason, recorded: `${localStamp(c.recorded_at)} by ${c.who ?? 'a former user'}`,
  }));
  const received = db.all<{
    id: string; received_on: string; amount_pence: number; bank_details_confirmed: string | null; recorded_at: string; who: string | null;
    voided_at: string | null; void_reason: string | null; voider: string | null;
  }>(
    'SELECT p.id, p.received_on, p.amount_pence, p.bank_details_confirmed, p.recorded_at, u.display_name AS who, p.voided_at, ' +
      'p.void_reason, v.display_name AS voider FROM invoice_payments p LEFT JOIN users u ON u.id = p.recorded_by ' +
      'LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.received_on ASC, p.rowid ASC', [r.id],
  ).map((p) => ({
    id: p.id, received_on: p.received_on, amount: formatPence(p.amount_pence), method: 'bank transfer',
    bank_details: p.bank_details_confirmed === null ? BANK_NEVER_ASKED : words(BANK_CONFIRMATIONS, p.bank_details_confirmed, p.bank_details_confirmed),
    confirmed_off_email: p.bank_details_confirmed === 'OTHER_CHANNEL',
    recorded: `${localStamp(p.recorded_at)} by ${p.who ?? 'a former user'}`,
    voided: p.voided_at === null ? null : `voided ${localStamp(p.voided_at)} by ${p.voider ?? 'a former user'} — ${p.void_reason ?? ''}`,
  }));
  const live = r.invoice_status === 'RAISED' || r.invoice_status === 'SENT';
  return {
    id: r.id, number: formatInvoiceNumber(r.seq), number_cancelled: r.number_state === 'CANCELLED',
    claim: { id: r.claim_id, claim_ref: r.claim_ref }, client_name: r.client_name,
    kind: { key: r.kind, label: words(INVOICE_KINDS, r.kind, r.kind) },
    state: { key: r.invoice_status, label: words(CLAIM_INVOICE_STATES, r.invoice_status, r.invoice_status) },
    invoice_date: r.invoice_date, sent_on: r.sent_on,
    fee: formatPence(r.fee_pence), fee_pence: r.fee_pence,
    fee_rate: r.fee_rate === null ? null : `${(Math.round(r.fee_rate * 10000) / 100).toFixed(2)}%`,
    vat: formatPence(r.vat_pence), vat_position: r.vat_position,
    claim_figure: r.claim_value_pence === null ? null : formatPence(r.claim_value_pence),
    fee_basis: r.fee_basis, fee_warning: r.fee_warning,
    due_on: r.due_on, due_shown: r.due_on === null ? DUE_UNSET : r.due_on, due_basis: r.due_basis,
    money, credit_notes, received,
    raised: `${localStamp(r.created_at)} by ${r.raiser ?? 'a former user'}`,
    cancelled: r.cancelled_at === null ? null : `${localStamp(r.cancelled_at)} by ${r.canceller ?? 'a former user'} — ${r.cancel_reason ?? ''}`,
    comparison: r.kind === 'FEE' ? feeVersusBenefit(r) : null,
    may: {
      send: r.invoice_status === 'RAISED' && can(actor, 'invoice.write', obj),
      cancel: r.invoice_status === 'RAISED' && money.received_pence === 0 && credit_notes.length === 0 && can(actor, 'invoice.write', obj),
      credit: live && money.total_pence - money.credited_pence > 0 && can(actor, 'invoice.credit', obj),
      record_received: live && money.outstanding_pence > 0 && can(actor, 'invoice.record_received', obj),
      void_received: can(actor, 'invoice.record_received', obj),
    },
  };
}

/** One claim's invoice — authorised on the invoice and on the business, whose name it carries. */
export function claimInvoiceById(db: Db, actor: Actor, id: string, nowIso: string): ClaimInvoiceView {
  assertFinanceSection(actor);
  const r = loadInvoice(db, id);
  authorise(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id });
  authorise(actor, 'business.read', { type: 'business', id: r.business_id });
  return viewOf(db, actor, r, nowIso);
}

/** Every claim invoice this actor may read — or one claim's. */
export function claimInvoices(db: Db, actor: Actor, nowIso: string, opts: { claim_id?: string; limit?: number } = {}): ClaimInvoiceView[] {
  const rows = opts.claim_id === undefined
    ? db.all<InvoiceRow>(`${INVOICE_SELECT}ORDER BY i.invoice_date DESC, n.seq DESC LIMIT ?`, [opts.limit ?? 500])
    : db.all<InvoiceRow>(`${INVOICE_SELECT}WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC`, [opts.claim_id]);
  return rows
    .filter((r) => can(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id })
      && can(actor, 'business.read', { type: 'business', id: r.business_id }))
    .map((r) => viewOf(db, actor, r, nowIso));
}

export type ClaimMoneyLine = {
  readonly number: string | null;
  readonly kind: string;
  readonly invoice_status: string;
  readonly payment_status: string;
  readonly fee: string;
  readonly fee_pence: number | null;
  readonly vat_position: string;
  readonly outstanding: string;
  readonly due: string;
};

/** THE CLAIM PAGE'S MONEY — the claim's own invoices, for a reader on `invoice.read`. */
export function claimMoneyLines(db: Db, actor: Actor, claim_id: string, nowIso: string): ClaimMoneyLine[] {
  return claimInvoices(db, actor, nowIso, { claim_id }).map((v) => ({
    number: v.number, kind: v.kind.label, invoice_status: v.state.label, payment_status: v.money.label,
    fee: v.fee, fee_pence: v.fee_pence, vat_position: v.vat_position, outstanding: v.money.outstanding,
    due: v.due_on === null ? `${DUE_UNSET} — ${v.due_basis}` : v.money.due.label,
  }));
}

/* ================================================================== *
 * 5 · RAISING AN INVOICE
 * ================================================================== */

type ClaimRow = { id: string; business_id: string; claim_ref: string; stage: string | null; created_at: string; sector: string | null };

function loadClaim(db: Db, id: string): ClaimRow {
  const c = db.get<ClaimRow>(
    'SELECT c.id, c.business_id, c.claim_ref, c.stage, c.created_at, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?',
    [id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

function liveInvoicesOfKind(db: Db, claim_id: string, kind: string): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM invoices i WHERE i.claim_id = ? AND i.kind = ? AND i.invoice_status IN ('RAISED','SENT') " +
      'AND i.fee_pence > COALESCE((SELECT SUM(c.amount_pence) FROM invoice_credit_notes c WHERE c.invoice_id = i.id), 0)',
    [claim_id, kind])?.n ?? 0;
}

/**
 * RAISE AN INVOICE ON A CLAIM — ACCOUNTING OR ADMIN.
 *
 * EVERY REFUSAL SAYS WHY, AND IS AUDITED with its code: an attempt to invoice a
 * claim that has exited, or before the fee is earned, is evidence.
 */
export function raiseInvoice(d: InvoiceDeps, actor: Actor, claim_id: string, input: Fields, opts: InvoiceOptions = {}): InvoiceResult {
  const c = loadClaim(d.db, claim_id);
  authorise(actor, 'invoice.raise', { type: 'invoice', id: c.id, business_id: c.business_id });
  const kind = clean(input['kind']) ?? 'FEE';
  if (!Object.hasOwn(INVOICE_KINDS, kind)) return { ok: false, why: 'Choose what the invoice is for: our fee, the break fee or the abort fee.', field: 'kind' };
  const refuse = (code: string, why: string): InvoiceResult => {
    record(d, actor, 'INVOICE_RAISED', 'claim', c.id, 'REFUSED', { kind, reason_code: code });
    return { ok: false, why };
  };
  const at = d.now();
  const today = localDate(at);
  const controls = opts.controls ?? FEE_CONTROLS;
  const s = claimStage(c.stage);

  // SOP 9: "Claim outside the amendment window at any point up to this stage: job stops before the fee is incurred."
  if (s.key === 'OUTSIDE_AMENDMENT_WINDOW') {
    return refuse('OUTSIDE_AMENDMENT_WINDOW',
      'This claim left the procedure outside the amendment window, and that exit stops the job before a fee is incurred (SOP 9). No invoice of any kind is raised on it.');
  }

  let fee_pence: number;
  let fee_rate: number | null = null;
  let figure: number | null = null;
  let basis: string;
  let warning: string | null = null;
  let entity: 'company' | null = null;

  if (kind === 'FEE') {
    if (s.kind === 'EXIT') return refuse('CLAIM_EXITED', `This claim has left the procedure — ${s.label} — so our fee is not raised on it.`);
    if (s.key !== 'INVOICE') return refuse('NOT_AT_INVOICE', `Our fee is raised on a claim at the invoice stage, and this claim is at ${s.label}.`);
    const pc = loadPipelineClaim(d.db, c.id);
    const window = invoiceWindowNeed(d.db, pc, at);
    if (!window.met) return refuse('AMENDMENT_WINDOW', `${window.what} — not met: ${window.why}. The job stops before a fee is incurred.`);
    const trigger = feeTriggerReached(d.db, pc, opts.feeTrigger);
    if (!trigger.met) return refuse('FEE_TRIGGER_NOT_REACHED', `${trigger.what}: ${trigger.why}. Our fee is not raised before it is earned.`);
    if (liveFeeInvoiceCount(d.db, c.id) > 0) {
      return refuse('LIVE_INVOICE_EXISTS',
        'This claim already has a live fee invoice. A raised amount changes only by a credit note; another is raised only once that one is cancelled or credited in full.');
    }
    const signoff = signOffSinceEntry(d.db, pc);
    if (signoff === undefined) {
      return refuse('NO_SIGNED_FIGURE', 'No figure signed off by the tax adviser is on record for this claim, and our fee derives from it. Nothing is raised.');
    }
    figure = signoff.figure_pence;
    entity = claimantTypeForGate(d.db, c.business_id).value === 'COMPANY' ? 'company' : null;
    const f = computeFee({
      claim_value_pence: figure, sector: c.sector, entity_type: entity, tax_rate: null,
      pool_split_main_pence: null, pool_split_special_pence: null, period_start: null,
    }, controls);
    if (!f.ok) return refuse(f.code, f.why);
    fee_pence = f.fee_pence;
    fee_rate = f.fee_rate;
    warning = f.warning;
    basis = `${f.basis}. From the tax adviser’s signed-off figure, signed on ${signoff.signed_on}. ` +
      `The fee controls when it was raised: ${f.readings.above_benefit}; ${f.readings.minimum_fee}; ${f.readings.multi_site_discount}; ${f.readings.break_and_abort}.`;
  } else {
    const lf = letterFee(kind as 'BREAK_FEE' | 'ABORT_FEE', controls, opts.letter);
    if (!lf.ok) return refuse(lf.code, lf.why);
    const want = kind === 'BREAK_FEE' ? 'CLIENT_WITHDREW' : 'REASONED_NEGATIVE';
    if (s.key !== want) {
      return refuse('WRONG_STAGE', kind === 'BREAK_FEE'
        ? 'The break fee is raised on a claim the client withdrew from (clause 5), and this claim has not exited that way.'
        : 'The abort fee is raised on a claim that ended in a reasoned negative (clause 4), and this claim has not exited that way.');
    }
    if (liveInvoicesOfKind(d.db, c.id, kind) > 0) return refuse('LIVE_INVOICE_EXISTS', `This claim already has a live invoice for ${words(INVOICE_KINDS, kind, kind)}.`);
    fee_pence = lf.fee_pence;
    basis = `${lf.basis}. The fee controls when it was raised: ${Object.values(controlsView(controls, opts.letter).readings).join('; ')}.`;
  }

  const vat = vatForInvoice(d.db, fee_pence, today);
  if (!vat.ok) return refuse('VAT_POSITION_NOT_RECORDED', vat.why);
  const terms = letterFees(opts.letter).payment_terms;
  const due_on = terms.state === 'DAYS' ? addDaysToDate(today, terms.days) : null;
  const due_basis = terms.state === 'DAYS'
    ? `due ${terms.label}`
    : `${DUE_UNSET} — ${terms.label} “${PAYMENT_TERMS_QUESTION}” is Lakhbir’s.`;

  const id = d.newId();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
        'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, fee_basis, fee_warning, raised_by, created_at, entity_type) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, c.business_id, c.id, kind, figure, fee_pence, fee_rate, 'RAISED', 'UNPAID', vat.words, vat.setting_id, vat.vat_pence,
        today, due_on, due_basis, basis, warning, actor.id, at, entity]);
    const seq = allocateNumber(d.db, 'INVOICE', id, null, actor.id, at);
    // The kind, the number and whether a due date was set — never an amount.
    record(d, actor, 'INVOICE_RAISED', 'invoice', id, 'ALLOWED', {
      kind, number: formatInvoiceNumber(seq), claim_id: c.id, due: due_on === null ? DUE_UNSET : 'SET',
    });
    ensureVatTask(d.db, d.now, d.newId, vatReading(d.db, at, { controls }), actor.id);
  });
  // Phase 132e: reward model C accrues its percentage on the fee AS INVOICED — silent unless C is the setting.
  if (kind === 'FEE') onFeeInvoiced(d, actor, id);
  return { ok: true, id };
}

/* ================================================================== *
 * 6 · SENT, CANCELLED, CREDITED
 * ================================================================== */

export function markSent(d: InvoiceDeps, actor: Actor, id: string, input: Fields): InvoiceResult {
  const r = loadInvoice(d.db, id);
  authorise(actor, 'invoice.write', { type: 'invoice', id: r.id, business_id: r.business_id });
  if (r.invoice_status !== 'RAISED') {
    return { ok: false, why: r.invoice_status === 'SENT' ? 'This invoice is already recorded as sent.' : 'A cancelled invoice is not sent.' };
  }
  const today = localDate(d.now());
  const sent = clean(input['sent_on']) ?? today;
  if (!isDate(sent)) return { ok: false, why: 'Give the day it was sent, as a date.', field: 'sent_on' };
  if (sent < r.invoice_date) return { ok: false, why: 'An invoice is not sent before the day it was raised.', field: 'sent_on' };
  if (sent > today) return { ok: false, why: 'An invoice is recorded as sent once it has been — not on a day still to come.', field: 'sent_on' };
  d.db.tx(() => {
    d.db.run("UPDATE invoices SET invoice_status = 'SENT', sent_on = ? WHERE id = ?", [sent, r.id]);
    record(d, actor, 'INVOICE_SENT', 'invoice', r.id, 'ALLOWED', { number: formatInvoiceNumber(r.seq) });
  });
  return { ok: true, id: r.id };
}

/**
 * CANCEL AN INVOICE RAISED IN ERROR, BEFORE IT IS SENT. Its number stays in the
 * series, recorded as cancelled, and is never issued again. A sent invoice, or one
 * with money or a credit note against it, is credited instead.
 */
export function cancelInvoice(d: InvoiceDeps, actor: Actor, id: string, input: Fields): InvoiceResult {
  const r = loadInvoice(d.db, id);
  authorise(actor, 'invoice.write', { type: 'invoice', id: r.id, business_id: r.business_id });
  if (r.invoice_status === 'CANCELLED') return { ok: false, why: 'This invoice is already cancelled.' };
  if (r.invoice_status === 'SENT') return { ok: false, why: 'A sent invoice is not cancelled — it went to the client, so it is credited, with a credit note.' };
  const m = invoiceMoney(d.db, r, d.now());
  if (m.received_pence > 0 || m.credited_pence > 0) return { ok: false, why: 'Money or a credit note is recorded against this invoice, so it is credited rather than cancelled.' };
  const reason = clean(input['reason']);
  if (reason === null) return { ok: false, why: 'Say why the invoice is cancelled.', field: 'reason' };
  if (reason.length > 2000) return { ok: false, why: 'The reason is longer than we store — 2,000 characters is the limit.' };
  const at = d.now();
  d.db.tx(() => {
    d.db.run("UPDATE invoices SET invoice_status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?",
      [at, actor.id, reason, r.id]);
    d.db.run("UPDATE invoice_numbers SET state = 'CANCELLED', cancelled_at = ?, cancelled_by = ? WHERE invoice_id = ? AND kind = 'INVOICE'",
      [at, actor.id, r.id]);
    record(d, actor, 'INVOICE_CANCELLED', 'invoice', r.id, 'ALLOWED', { number: formatInvoiceNumber(r.seq) });
    ensureVatTask(d.db, d.now, d.newId, vatReading(d.db, at), actor.id);
  });
  return { ok: true, id: r.id };
}

function creditedSoFar(db: Db, invoice_id: string): { amount: number; vat: number } {
  const r = db.get<{ a: number | null; v: number | null }>(
    'SELECT SUM(amount_pence) AS a, SUM(vat_pence) AS v FROM invoice_credit_notes WHERE invoice_id = ?', [invoice_id]);
  return { amount: r?.a ?? 0, vat: r?.v ?? 0 };
}

function issueCredit(
  d: InvoiceDeps, actor: Actor, r: InvoiceRow, basis: 'CREDIT_IN_FULL' | 'CLAUSE_13_REDUCTION', amount: number, vat: number,
  corrected: number | null, reason: string,
): InvoiceResult {
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, corrected_claim_value_pence, issued_on, reason, recorded_by, recorded_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, r.id, basis, amount, vat, corrected, localDate(at), reason, actor.id, at]);
    const seq = allocateNumber(d.db, 'CREDIT_NOTE', r.id, id, actor.id, at);
    record(d, actor, 'CREDIT_NOTE_ISSUED', 'credit_note', id, 'ALLOWED', {
      basis, number: formatInvoiceNumber(seq), invoice_id: r.id,
    });
    ensureVatTask(d.db, d.now, d.newId, vatReading(d.db, at), actor.id);
  });
  // Phase 132e: a fee reduced under clause 13 reverses reward model C's percentage on it — a reversing entry, never a delete.
  if (basis === 'CLAUSE_13_REDUCTION') onClause13Credit(d, actor, id);
  return { ok: true, id };
}

/** CREDIT WHAT IS LEFT, IN FULL — with a reason, and no amount typed. */
export function creditInFull(d: InvoiceDeps, actor: Actor, id: string, input: Fields): InvoiceResult {
  const r = loadInvoice(d.db, id);
  authorise(actor, 'invoice.credit', { type: 'invoice', id: r.id, business_id: r.business_id });
  if (r.invoice_status === 'CANCELLED') return { ok: false, why: 'A cancelled invoice has nothing to credit.' };
  const so = creditedSoFar(d.db, r.id);
  const amount = r.fee_pence - so.amount;
  if (amount <= 0) return { ok: false, why: 'This invoice is already credited in full.' };
  const reason = clean(input['reason']);
  if (reason === null) return { ok: false, why: 'Say why the invoice is credited.', field: 'reason' };
  if (reason.length > 2000) return { ok: false, why: 'The reason is longer than we store — 2,000 characters is the limit.' };
  return issueCredit(d, actor, r, 'CREDIT_IN_FULL', amount, Math.max(0, r.vat_pence - so.vat), null, reason);
}

/**
 * CLAUSE 13 — THE FEE RECALCULATED ON THE CORRECTED FIGURE. CRM 6 of 10's
 * FEE_CLAWBACK is the switch and it is OFF; while it is off, or clause 13 is blank,
 * this refuses and is audited as that module audits it. On, it reads the reduced
 * figure from the claim's closed HMRC enquiry and credits the difference — the
 * calculation the letter says the client can perform.
 */
export function creditClause13(d: InvoiceDeps, actor: Actor, id: string, input: Fields, opts: InvoiceOptions = {}): InvoiceResult {
  const r = loadInvoice(d.db, id);
  authorise(actor, 'invoice.credit', { type: 'invoice', id: r.id, business_id: r.business_id });
  const reading = clawbackReading({ ...(opts.clawback === undefined ? {} : { gate: opts.clawback }), ...(opts.letter === undefined ? {} : { openTerms: opts.letter.openTerms }) });
  if (!reading.applies) {
    record(d, actor, 'FEE_CLAWBACK_NOT_APPLIED', 'invoice', r.id, 'REFUSED', { reason: reading.reason, blanks: reading.blanks.length });
    return { ok: false, why: `No clause 13 credit note is issued: ${reading.why}.` };
  }
  if (r.kind !== 'FEE' || r.invoice_status === 'CANCELLED') return { ok: false, why: 'Clause 13 reduces our fee on a raised invoice.' };
  const reduced = d.db.get<{ amended_figure_pence: number }>(
    'SELECT amended_figure_pence FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NOT NULL AND amended_figure_pence IS NOT NULL ' +
      'ORDER BY closed_on DESC, rowid DESC LIMIT 1', [r.claim_id]);
  if (reduced === undefined) return { ok: false, why: 'No reduced figure is recorded on this claim — clause 13 recalculates on the corrected figure, and there is none.' };
  const sector = d.db.get<{ sector: string | null }>('SELECT sector FROM businesses WHERE id = ?', [r.business_id])?.sector ?? null;
  let corrected = 0;
  if (reduced.amended_figure_pence > 0) {
    const f = computeFee({
      claim_value_pence: reduced.amended_figure_pence, sector, entity_type: null, tax_rate: null,
      pool_split_main_pence: null, pool_split_special_pence: null, period_start: null,
    }, opts.controls ?? FEE_CONTROLS);
    if (!f.ok) return { ok: false, why: f.why };
    corrected = f.fee_pence;
  }
  const so = creditedSoFar(d.db, r.id);
  const amount = r.fee_pence - corrected - so.amount;
  if (amount <= 0) return { ok: false, why: 'The fee on the corrected figure is not less than what this invoice still asks for, so there is nothing to credit.' };
  const vat = r.fee_pence === 0 ? 0 : Math.min(r.vat_pence - so.vat, Math.round((r.vat_pence * amount) / r.fee_pence));
  const reason = clean(input['reason']) ?? 'Clause 13: the fee recalculated on the corrected figure, and the difference credited.';
  return issueCredit(d, actor, r, 'CLAUSE_13_REDUCTION', amount, Math.max(0, vat), reduced.amended_figure_pence, reason);
}

/* ================================================================== *
 * 7 · MONEY RECEIVED — RECORDED, NOT COLLECTED
 * ================================================================== */

export function recordReceived(d: InvoiceDeps, actor: Actor, id: string, input: Fields): InvoiceResult {
  const r = loadInvoice(d.db, id);
  authorise(actor, 'invoice.record_received', { type: 'invoice', id: r.id, business_id: r.business_id });
  if (r.invoice_status === 'CANCELLED') return { ok: false, why: 'Nothing is owed on a cancelled invoice.' };
  const today = localDate(d.now());
  const on = clean(input['received_on']);
  if (!isDate(on)) return { ok: false, why: 'Give the day the money arrived, as a date.', field: 'received_on' };
  if (on > today) return { ok: false, why: 'Money is recorded once it has arrived — not on a day still to come.', field: 'received_on' };
  if (on < r.invoice_date) return { ok: false, why: 'Money against this invoice cannot have arrived before it was raised.', field: 'received_on' };
  const method = clean(input['method']) ?? 'BANK_TRANSFER';
  if (method !== 'BANK_TRANSFER') return { ok: false, why: 'Bank transfer is the only way we are paid. There is no card processor.', field: 'method' };
  const raw = clean(input['amount']);
  const pounds = raw === null ? Number.NaN : Number(raw.replace(/[£,\s]/g, ''));
  const pence = Number.isFinite(pounds) && pounds > 0 ? toPence(pounds) : null;
  if (pence === null || pence <= 0) return { ok: false, why: 'Give the amount that arrived, in pounds.', field: 'amount' };
  const m = invoiceMoney(d.db, r, d.now());
  if (pence > m.outstanding_pence) {
    return { ok: false, why: `That is more than this invoice still asks for (${m.outstanding}). Record what arrived against what is owed, and nothing more.` };
  }
  const confirmed = clean(input['bank_details_confirmed']);
  if (confirmed !== null && !Object.hasOwn(BANK_CONFIRMATIONS, confirmed)) {
    return { ok: false, why: 'Say whether the client confirmed our bank details on a channel other than email — yes, no, or not known — or leave it unanswered.' };
  }
  const pid = d.newId();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, bank_details_confirmed, recorded_by, recorded_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [pid, r.id, on, pence, 'BANK_TRANSFER', confirmed, actor.id, d.now()]);
    // Whether the details were confirmed — never the amount.
    record(d, actor, 'MONEY_RECEIVED_RECORDED', 'invoice_payment', pid, 'ALLOWED', {
      invoice_id: r.id, bank_details: confirmed ?? 'NEVER_ASKED',
    });
  });
  return { ok: true, id: pid };
}

/** A MISTAKEN RECORD, VOIDED ONCE WITH A REASON — never deleted and never edited. Returns the invoice's id. */
export function voidReceived(d: InvoiceDeps, actor: Actor, payment_id: string, input: Fields): InvoiceResult {
  const p = d.db.get<{ id: string; invoice_id: string; voided_at: string | null }>(
    'SELECT id, invoice_id, voided_at FROM invoice_payments WHERE id = ?', [payment_id]);
  if (p === undefined) throw new NotFoundAsRefusal();
  const r = loadInvoice(d.db, p.invoice_id);
  authorise(actor, 'invoice.record_received', { type: 'invoice', id: r.id, business_id: r.business_id });
  if (p.voided_at !== null) return { ok: false, why: 'This record is already voided.' };
  const reason = clean(input['reason']);
  if (reason === null) return { ok: false, why: 'Say why the record is voided.', field: 'reason' };
  if (reason.length > 2000) return { ok: false, why: 'The reason is longer than we store — 2,000 characters is the limit.' };
  d.db.tx(() => {
    d.db.run('UPDATE invoice_payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [d.now(), actor.id, reason, p.id]);
    record(d, actor, 'MONEY_RECEIVED_VOIDED', 'invoice_payment', p.id, 'ALLOWED', { invoice_id: r.id });
  });
  return { ok: true, id: r.id };
}

/* ================================================================== *
 * 8 · THE FINANCE DASHBOARD — ACCOUNTING AND ADMIN
 * ================================================================== */

export type DashboardMonth = {
  readonly month: string;
  readonly invoiced_pence: number; readonly credited_pence: number; readonly received_pence: number; readonly expected_pence: number;
  readonly invoiced: string; readonly credited: string; readonly received: string; readonly expected: string;
};

export type ExpectedClaim = {
  readonly claim_id: string; readonly claim_ref: string; readonly client_name: string; readonly entered_invoice_on: string;
  readonly expected: string; readonly expected_pence: number | null; readonly why: string | null;
  /**
   * Phase 132e: WHEN THE FEE IS EXPECTED — the date our report was delivered for filing, which is when the fee is
   * earned (FEE_TRIGGER). Null where no delivery is recorded: an unknown delivery has no date, and is never today.
   */
  readonly expected_on: string | null;
  readonly expected_on_reading: string;
  /** The due date an invoice raised on that delivery date would carry, where clause 4's payment terms state a number of days. */
  readonly due_if_invoiced_on_delivery: string | null;
  /** The task `rule-invoice-finance-task` raised when the claim entered INVOICE — read, never a second. */
  readonly finance_task: { readonly id: string; readonly title: string; readonly status: string; readonly due: DueReading } | null;
  readonly may_raise: boolean;
};

export type FinanceDashboard = {
  readonly months: readonly DashboardMonth[];
  readonly totals: {
    readonly invoiced: string; readonly credited: string; readonly received: string; readonly outstanding: string;
    readonly overdue: string; readonly overdue_count: number; readonly without_a_due_date: number;
  };
  readonly expected: { readonly claims: readonly ExpectedClaim[]; readonly total: string; readonly without_a_fee: number };
  readonly invoices: readonly ClaimInvoiceView[];
  readonly organisation_invoices_from_before: number;
  readonly vat: VatReading;
  readonly settings: SettingsView;
  readonly may_record_setting: boolean;
  readonly controls: ControlsView;
  /** Model B's fees to a firm — listed, never paid from here. */
  readonly introducer_fees: readonly FeeView[];
  readonly recorded_not_collected: string;
};

export const FINANCE_TASK_RULE = 'rule-invoice-finance-task';

export function financeDashboard(db: Db, actor: Actor, nowIso: string, opts: InvoiceOptions = {}): FinanceDashboard {
  assertFinanceSection(actor);
  const today = localDate(nowIso);
  const invoices = claimInvoices(db, actor, nowIso);
  const live = invoices.filter((v) => v.state.key !== 'CANCELLED');

  const expectedAll = expectedFees(db, { controls: opts.controls ?? FEE_CONTROLS })
    .filter((e) => can(actor, 'claim.read', claimObjFor(db, { id: e.claim_id, business_id: e.business_id })))
    .map((e): ExpectedClaim => {
      const c = db.get<{ created_at: string; name: string }>(
        'SELECT c.created_at, b.name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', [e.claim_id]);
      const entered = localDate(enteredAt(db, { id: e.claim_id, created_at: c?.created_at ?? nowIso }, 'INVOICE'));
      const t = db.get<{ id: string; title: string; status: string; due_on: string | null; owner_id: string | null; owner_role: string | null; business_id: string | null; claim_id: string | null }>(
        'SELECT t.id, t.title, t.status, t.due_on, t.owner_id, t.owner_role, t.business_id, t.claim_id FROM staff_tasks t ' +
          'JOIN automation_runs r ON r.id = t.automation_run_id WHERE t.claim_id = ? AND r.rule_id = ? ORDER BY t.created_at DESC LIMIT 1',
        [e.claim_id, FINANCE_TASK_RULE]);
      const task = t !== undefined && can(actor, 'staff_task.read', taskObj(db, t))
        ? { id: t.id, title: t.title, status: t.status, due: dueReading(t.due_on, nowIso, t.status === 'COMPLETED' || t.status === 'CANCELLED') }
        : null;
      const delivered = reportDeliveredOn(db, e.claim_id);
      const terms = letterFees(opts.letter).payment_terms;
      return {
        claim_id: e.claim_id, claim_ref: e.claim_ref, client_name: c?.name ?? '', entered_invoice_on: entered,
        expected: e.expected_pence === null ? `not known — ${e.why ?? 'no fee could be computed'}` : formatPence(e.expected_pence),
        expected_pence: e.expected_pence, why: e.why,
        expected_on: delivered?.on ?? null,
        expected_on_reading: delivered === null
          ? 'NO DATE — no delivery of our report for filing is recorded, so when the fee is earned is not known'
          : `earned on ${delivered.on}, when our report was delivered for filing`,
        due_if_invoiced_on_delivery: delivered !== null && terms.state === 'DAYS' ? addDaysToDate(delivered.on, terms.days) : null,
        finance_task: task,
        may_raise: can(actor, 'invoice.raise', { type: 'invoice', id: e.claim_id, business_id: e.business_id }),
      };
    });

  const credits = db.all<{ invoice_id: string; amount_pence: number; issued_on: string }>(
    'SELECT invoice_id, amount_pence, issued_on FROM invoice_credit_notes').filter((c) => invoices.some((v) => v.id === c.invoice_id));
  const payments = db.all<{ invoice_id: string; amount_pence: number; received_on: string }>(
    'SELECT invoice_id, amount_pence, received_on FROM invoice_payments WHERE voided_at IS NULL').filter((p) => invoices.some((v) => v.id === p.invoice_id));

  const months: DashboardMonth[] = Array.from({ length: 12 }, (_, i) => monthStart(today, i).slice(0, 7)).map((month) => {
    const invoiced = live.filter((v) => v.invoice_date.startsWith(month)).reduce((a, v) => a + v.fee_pence, 0);
    const credited = credits.filter((c) => c.issued_on.startsWith(month)).reduce((a, c) => a + c.amount_pence, 0);
    const received = payments.filter((p) => p.received_on.startsWith(month)).reduce((a, p) => a + p.amount_pence, 0);
    // Phase 132e: a fee is expected in the month our report was delivered for filing; with no delivery recorded it is in no month.
    const expected = expectedAll.filter((e) => e.expected_on !== null && e.expected_on.startsWith(month)).reduce((a, e) => a + (e.expected_pence ?? 0), 0);
    return {
      month, invoiced_pence: invoiced, credited_pence: credited, received_pence: received, expected_pence: expected,
      invoiced: formatPence(invoiced), credited: formatPence(credited), received: formatPence(received), expected: formatPence(expected),
    };
  });

  const open = live.filter((v) => v.money.state === 'NOTHING_RECEIVED' || v.money.state === 'PART_RECEIVED');
  const overdue = open.filter((v) => v.money.overdue);
  const sum = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0);
  const countedExpected = expectedAll.filter((e) => e.expected_pence !== null);

  return {
    months,
    totals: {
      invoiced: formatPence(sum(live.map((v) => v.fee_pence))),
      credited: formatPence(sum(credits.map((c) => c.amount_pence))),
      received: formatPence(sum(payments.map((p) => p.amount_pence))),
      outstanding: formatPence(sum(open.map((v) => v.money.outstanding_pence))),
      overdue: formatPence(sum(overdue.map((v) => v.money.outstanding_pence))),
      overdue_count: overdue.length,
      without_a_due_date: open.filter((v) => v.due_on === null).length,
    },
    expected: {
      claims: expectedAll,
      total: formatPence(sum(countedExpected.map((e) => e.expected_pence ?? 0))),
      without_a_fee: expectedAll.length - countedExpected.length,
    },
    invoices,
    organisation_invoices_from_before: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM invoices WHERE claim_id IS NULL')?.n ?? 0,
    vat: vatReading(db, nowIso, { controls: opts.controls ?? FEE_CONTROLS }),
    settings: settingsView(db, actor, today),
    may_record_setting: can(actor, 'finance_setting.write', financeSectionObj()),
    controls: controlsView(opts.controls ?? FEE_CONTROLS, opts.letter),
    introducer_fees: feeList(db, actor),
    recorded_not_collected: RECORDED_NOT_COLLECTED,
  };
}
