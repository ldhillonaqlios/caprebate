/**
 * VAT MONITORING — THE ROLLING TWELVE MONTHS, THE THIRTY-DAY TEST, THE DATED
 * THRESHOLD, AND A TASK INSIDE THE MARGIN. CRM 7 of 10, 11 September 2026.
 *
 * The procedure is 08-monday-doc-exports/12552682452, the VAT threshold
 * monitoring procedure. Its decision is made — wait until the threshold, do not
 * register voluntarily — and this file is the mechanism that notices when it
 * bites. IT NEVER CHANGES AN INVOICE: it reads them.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE TWO TESTS, AS GOV.UK STATES THEM (procedure, section 2)
 *
 *   THE BACKWARD LOOK   taxable turnover for the last 12 months over the threshold.
 *                       Read here as the twelve calendar months ending with this
 *                       one, to today — the current month and the eleven before
 *                       it — from each claim invoice's tax point as section 4.1
 *                       states it: the invoice date, or the client report's
 *                       delivery if earlier — net of the credit notes issued in the same
 *                       window. The procedure's section 4.1 describes the column
 *                       as "the previous 12 complete months plus the current month
 *                       to date", which is thirteen months; GOV.UK's "last 12
 *                       months" is followed, the disposition table's row E83
 *                       records the difference, and the export now carries a
 *                       dated correction.
 *   THE FORWARD LOOK    turnover in the next 30 days alone over the threshold.
 *                       Read here as the fees expected from claims at the invoice
 *                       stage not yet invoiced — the forward register of section
 *                       4.2, derived rather than kept by hand. Nothing records when
 *                       each will be invoiced (the fee trigger is undecided), so
 *                       every one is counted as if it could fall inside the thirty
 *                       days: the cautious reading, and it says so.
 *   ONE LARGE FEE       section 5, check 3: any single expected fee at or over the
 *                       trigger is named, the day it is found.
 *
 * THE THRESHOLD, THE MARGIN AND THE TRIGGER ARE DATED SETTINGS WITH THEIR SOURCE
 * (`finance_settings`, migration 016). A setting nobody recorded is not known —
 * the reading says it cannot say, and raises no task on a guess (N4).
 *
 * AN INVOICE THAT CANNOT BE DATED IS COUNTED APART. An organisation's invoice from
 * before CRM 7 of 10 has no invoice date, so it cannot be placed in a window: the
 * reading names how many there are, and never counts them as nought.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE TASK
 *
 * Inside the margin, over the threshold, or one large expected fee: a staff task,
 * written through `insertTask` in src/web/tasks.ts, waiting with ACCOUNTING,
 * about Caprebate itself (`company_subject` VAT_THRESHOLD), due on the last day of
 * the month — the procedure's monthly check — and flagged overdue by `dueReading`
 * like every task. At most one is open at a time: a second check finds it and
 * writes nothing. The task carries no figure; the finance view carries the reading.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, type Actor } from '../authz.ts';
import { localDate, localStamp } from './localtime.ts';
import { formatPence, toPence } from './shown-range.ts';
import { insertTask } from './tasks.ts';
import { latestSignOff } from './claim-record.ts';
import { computeFee, FEE_CONTROLS, type FeeControls } from './fee-controls.ts';
import { feeGate, type FeeGateReading } from './engine.ts';
import { assertFinanceSection, financeSectionObj } from './finance.ts';

type Vocab = Readonly<Record<string, string>>;

export type VatDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type SettingResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string };

/* ================================================================== *
 * 1 · THE SETTINGS — DATED, SOURCED, APPEND-ONLY
 * ================================================================== */

export const SETTINGS: Vocab = Object.freeze({
  VAT_POSITION: 'Cap Rebate’s VAT position',
  VAT_RATE: 'The VAT rate charged, while registered',
  VAT_REGISTRATION_THRESHOLD_PENCE: 'The VAT registration threshold',
  VAT_WARNING_FRACTION: 'Where the warning starts, as a share of the threshold',
  VAT_SINGLE_ENGAGEMENT_TRIGGER_PENCE: 'A single expected fee large enough to check on its own',
});

export const VAT_POSITIONS: Vocab = Object.freeze({
  NOT_REGISTERED: 'not VAT registered',
  REGISTERED: 'VAT registered',
});

type SettingRow = {
  id: string; setting: string; value: string; effective_from: string; source: string; recorded_at: string; recorder: string | null;
};

const SETTING_SELECT =
  'SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, u.display_name AS recorder ' +
  'FROM finance_settings s LEFT JOIN users u ON u.id = s.recorded_by ';

/** The value in effect on `today`: the latest row whose date has arrived. None is not known. */
export function currentSetting(db: Db, setting: string, today: string): SettingRow | undefined {
  return db.get<SettingRow>(
    `${SETTING_SELECT}WHERE s.setting = ? AND s.effective_from <= ? ORDER BY s.effective_from DESC, s.recorded_at DESC, s.rowid DESC LIMIT 1`,
    [setting, today]);
}

function shown(setting: string, value: string): string {
  if (setting === 'VAT_POSITION') return VAT_POSITIONS[value] ?? value;
  if (setting === 'VAT_RATE' || setting === 'VAT_WARNING_FRACTION') return `${Math.round(Number(value) * 10000) / 100}%`;
  return formatPence(Number(value));
}

export type SettingView = {
  readonly key: string; readonly label: string; readonly value: string; readonly effective_from: string;
  readonly source: string; readonly recorded: string;
};

function viewOf(r: SettingRow): SettingView {
  return {
    key: r.setting, label: SETTINGS[r.setting] ?? r.setting, value: shown(r.setting, r.value), effective_from: r.effective_from,
    source: r.source, recorded: r.recorder === null ? `written from its source by migration 016, ${localStamp(r.recorded_at)}` : `${localStamp(r.recorded_at)} by ${r.recorder}`,
  };
}

export type SettingsView = {
  readonly current: readonly { readonly key: string; readonly label: string; readonly setting: SettingView | null }[];
  readonly history: readonly SettingView[];
};

export function settingsView(db: Db, actor: Actor, today: string): SettingsView {
  assertFinanceSection(actor);
  return {
    current: Object.keys(SETTINGS).map((key) => {
      const r = currentSetting(db, key, today);
      return { key, label: SETTINGS[key] ?? key, setting: r === undefined ? null : viewOf(r) };
    }),
    history: db.all<SettingRow>(`${SETTING_SELECT}ORDER BY s.setting ASC, s.effective_from DESC, s.rowid DESC`).map(viewOf),
  };
}

function isDate(s: string | null): s is string {
  if (s === null || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function clean(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * A NEW VALUE IS A NEW ROW, WITH ITS DATE AND ITS SOURCE — ADMIN's. Nothing is
 * changed in place, and the row an invoice was raised under stays readable.
 */
export function recordSetting(d: VatDeps, actor: Actor, input: Readonly<Record<string, string | null | undefined>>): SettingResult {
  authorise(actor, 'finance_setting.write', financeSectionObj());
  const setting = clean(input['setting']);
  if (setting === null || !Object.hasOwn(SETTINGS, setting)) return { ok: false, why: 'Choose one of the finance settings.' };
  const raw = clean(input['value']);
  if (raw === null) return { ok: false, why: 'Give the value.' };
  let value: string;
  if (setting === 'VAT_POSITION') {
    if (!Object.hasOwn(VAT_POSITIONS, raw)) return { ok: false, why: 'The VAT position is registered or not registered.' };
    value = raw;
  } else if (setting === 'VAT_RATE' || setting === 'VAT_WARNING_FRACTION') {
    const n = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n >= 1) return { ok: false, why: 'Give a share between nought and one — 0.75, or 75%.' };
    value = String(Math.round(n * 10000) / 10000);
  } else {
    const pounds = Number(raw.replace(/[£,\s]/g, ''));
    const pence = Number.isFinite(pounds) && pounds > 0 ? toPence(pounds) : null;
    if (pence === null || pence <= 0) return { ok: false, why: 'Give the amount in pounds.' };
    value = String(pence);
  }
  const effective = clean(input['effective_from']);
  if (!isDate(effective)) return { ok: false, why: 'Give the date the value takes effect, as a date.' };
  const source = clean(input['source']);
  if (source === null || source.length < 2) return { ok: false, why: 'Say where the value comes from — a document, a page and the day it was read.' };
  if (source.length > 1000) return { ok: false, why: 'The source is longer than we store — 1,000 characters is the limit.' };
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO finance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, setting, value, effective, source, actor.id, at]);
    // The setting's key, never its value or its source.
    d.audit.append({
      at, kind: 'FINANCE_SETTING_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'finance_setting', object_id: id, detail: { setting, effective_from: effective },
    });
  });
  return { ok: true, id };
}

/* ================================================================== *
 * 2 · THE VAT ON AN INVOICE — FROM THE RECORDED POSITION, NEVER ASSUMED
 * ================================================================== */

export type VatForInvoice =
  | { readonly ok: true; readonly setting_id: string; readonly vat_pence: number; readonly words: string }
  | { readonly ok: false; readonly why: string };

export function vatForInvoice(db: Db, fee_pence: number, today: string): VatForInvoice {
  const position = currentSetting(db, 'VAT_POSITION', today);
  if (position === undefined) {
    return { ok: false, why: 'No VAT position is recorded. An invoice’s VAT is read from the recorded position and never assumed, so nothing is raised until one is.' };
  }
  if (position.value === 'NOT_REGISTERED') {
    return {
      ok: true, setting_id: position.id, vat_pence: 0,
      words: `Cap Rebate is not VAT registered; no VAT is charged on this fee — the recorded VAT position in effect from ${position.effective_from}`,
    };
  }
  const rate = currentSetting(db, 'VAT_RATE', today);
  if (rate === undefined) {
    return { ok: false, why: 'The recorded VAT position is registered, and no VAT rate is recorded. Nothing is raised until one is.' };
  }
  const r = Number(rate.value);
  return {
    ok: true, setting_id: position.id, vat_pence: Math.round(fee_pence * r),
    words: `VAT at ${Math.round(r * 10000) / 100}% — the recorded VAT position in effect from ${position.effective_from}, and the rate in effect from ${rate.effective_from}`,
  };
}

/* ================================================================== *
 * 3 · THE READING
 * ================================================================== */

export type Band = 'BELOW' | 'INSIDE_MARGIN' | 'OVER' | 'CANNOT_SAY';

export const BAND_WORDS: Readonly<Record<Band, string>> = Object.freeze({
  BELOW: 'below the warning margin',
  INSIDE_MARGIN: 'INSIDE THE WARNING MARGIN',
  OVER: 'AT OR OVER THE REGISTRATION THRESHOLD',
  CANNOT_SAY: 'cannot say — a setting it needs is not recorded',
});

export type ExpectedFee = {
  readonly claim_id: string; readonly claim_ref: string; readonly business_id: string;
  readonly expected_pence: number | null; readonly why: string | null;
  /**
   * PHASE 132f — THE ENGAGEMENT GATE ON THIS FEE, with phase9's costing injected (engine.ts `feeGate`). A READING,
   * NOT A WITHHOLDING: this fee is earned on a signed-off figure, and the VAT forward look counts what will be
   * invoiced, so `expected_pence` is never moved by it. Where it fires, `routes_to` is the engine's "we will come
   * back to you with a price". An unknown fee or sector, and supported living, are UNDETERMINED. The placeholder
   * caveat is on every reading.
   */
  readonly gate: FeeGateReading;
};

/**
 * THE FEES EXPECTED FROM CLAIMS AT THE INVOICE STAGE THAT HAVE NO LIVE FEE INVOICE
 * YET — each computed as the invoice would be, from the tax adviser's signed-off
 * figure, under the fee controls as they stand. A claim whose fee cannot be
 * computed is listed with the reason and counted apart, never as nought.
 */
export function expectedFees(db: Db, opts: { controls?: FeeControls } = {}): ExpectedFee[] {
  return db.all<{ id: string; claim_ref: string; business_id: string; sector: string | null }>(
    'SELECT c.id, c.claim_ref, c.business_id, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id ' +
      "WHERE c.stage = 'INVOICE' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.claim_id = c.id AND i.kind = 'FEE' " +
      "AND i.invoice_status IN ('RAISED','SENT') AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)) " +
      'ORDER BY c.claim_ref ASC',
  ).map((c) => expectedFeeFor(db, c, opts));
}

/**
 * ONE CLAIM'S EXPECTED FEE — the computation `expectedFees` makes for every claim at the invoice stage, for one claim.
 * The CRM follow-on reads it onto the claim page for a reader holding `invoice.read`, before any fee invoice exists, so
 * the page and the finance view cannot come to disagree. Where the signed-off figure it needs is not recorded, or the
 * fee controls refuse, the fee is NOT KNOWN — `expected_pence` null, with the reason — and never nought (N4).
 * No authorisation here: the caller asks.
 */
export function expectedFeeFor(
  db: Db, c: { id: string; claim_ref: string; business_id: string; sector: string | null }, opts: { controls?: FeeControls } = {},
): ExpectedFee {
  const s = latestSignOff(db, c.id);
  if (s === undefined) {
    return { claim_id: c.id, claim_ref: c.claim_ref, business_id: c.business_id, expected_pence: null, why: 'no signed-off figure is recorded on the claim', gate: feeGate(null, c.sector) };
  }
  const fee = computeFee({
    claim_value_pence: s.figure_pence, sector: c.sector, entity_type: null, tax_rate: null,
    pool_split_main_pence: null, pool_split_special_pence: null, period_start: null,
  }, opts.controls ?? FEE_CONTROLS);
  return fee.ok
    ? { claim_id: c.id, claim_ref: c.claim_ref, business_id: c.business_id, expected_pence: fee.fee_pence, why: null, gate: feeGate(fee.fee_pence / 100, c.sector) }
    : { claim_id: c.id, claim_ref: c.claim_ref, business_id: c.business_id, expected_pence: null, why: fee.why, gate: feeGate(null, c.sector) };
}

export type VatReading = {
  readonly today: string;
  readonly threshold: { readonly pence: number; readonly shown: string; readonly effective_from: string; readonly source: string } | null;
  readonly warning_from: { readonly fraction: number; readonly shown: string; readonly source: string } | null;
  readonly trigger: { readonly pence: number; readonly shown: string; readonly source: string } | null;
  readonly rolling: {
    readonly from: string; readonly to: string;
    readonly invoiced_pence: number; readonly credited_pence: number; readonly turnover_pence: number;
    readonly turnover: string; readonly band: Band; readonly undated_invoices: number; readonly basis: string;
  };
  readonly forward: {
    readonly expected_pence: number; readonly expected: string; readonly claims_counted: number;
    readonly claims_without_a_fee: number; readonly band: Band; readonly basis: string;
  };
  readonly single_engagements: readonly { readonly claim_ref: string; readonly expected: string }[];
  readonly needs_task: boolean;
  readonly warning: string | null;
  readonly never_changes_an_invoice: string;
};

/** The first day of the month `back` months before `today`'s. */
export function monthStart(today: string, back: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 - back;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

/** The last day of `today`'s month — the procedure's monthly check. */
export function lastDayOfMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function band(amount: number, threshold: number | null, fraction: number | null): Band {
  if (threshold === null) return 'CANNOT_SAY';
  if (amount >= threshold) return 'OVER';
  if (fraction === null) return 'CANNOT_SAY';
  return amount >= Math.ceil(threshold * fraction) ? 'INSIDE_MARGIN' : 'BELOW';
}

export const NEVER_CHANGES_AN_INVOICE =
  'This reading never changes an invoice. It reads the invoices, the credit notes and the claims at the invoice stage, and a person acts on it.';

export function vatReading(db: Db, nowIso: string, opts: { controls?: FeeControls } = {}): VatReading {
  const today = localDate(nowIso);
  const t = currentSetting(db, 'VAT_REGISTRATION_THRESHOLD_PENCE', today);
  const f = currentSetting(db, 'VAT_WARNING_FRACTION', today);
  const g = currentSetting(db, 'VAT_SINGLE_ENGAGEMENT_TRIGGER_PENCE', today);
  const threshold = t === undefined ? null : Number(t.value);
  const fraction = f === undefined ? null : Number(f.value);
  const trigger = g === undefined ? null : Number(g.value);

  const from = monthStart(today, 11);
  // THE TAX POINT, AS THE PROCEDURE'S REGISTER STATES IT (section 4.1): the invoice date, or the client report's
  // delivery if earlier — read from the deliverables register's first issued client report, for our fee only.
  const invoiced = db.get<{ n: number | null }>(
    "SELECT SUM(i.fee_pence) AS n FROM invoices i WHERE i.claim_id IS NOT NULL AND i.invoice_status IN ('RAISED','SENT') " +
      "AND MIN(i.invoice_date, CASE WHEN i.kind = 'FEE' THEN COALESCE((SELECT MIN(d.issued_on) FROM claim_deliverables d " +
      "WHERE d.claim_id = i.claim_id AND d.kind = 'CLIENT_REPORT' AND d.issued_on IS NOT NULL), i.invoice_date) ELSE i.invoice_date END) " +
      'BETWEEN ? AND ?',
    [from, today])?.n ?? 0;
  const credited = db.get<{ n: number | null }>(
    'SELECT SUM(amount_pence) AS n FROM invoice_credit_notes WHERE issued_on >= ? AND issued_on <= ?', [from, today])?.n ?? 0;
  const undated = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM invoices WHERE claim_id IS NULL AND invoice_status IN ('RAISED','SENT')")?.n ?? 0;
  const turnover = invoiced - credited;
  const rollingBand = band(turnover, threshold, fraction);

  const expected = expectedFees(db, opts);
  const counted = expected.filter((e) => e.expected_pence !== null);
  const expectedPence = counted.reduce((a, e) => a + (e.expected_pence ?? 0), 0);
  const forwardBand = band(expectedPence, threshold, fraction);
  const single = trigger === null ? [] : counted.filter((e) => (e.expected_pence ?? 0) >= trigger)
    .map((e) => ({ claim_ref: e.claim_ref, expected: formatPence(e.expected_pence) }));

  const alarming = (b: Band): boolean => b === 'INSIDE_MARGIN' || b === 'OVER';
  const needs = alarming(rollingBand) || alarming(forwardBand) || single.length > 0;
  const parts: string[] = [];
  if (alarming(rollingBand)) parts.push(`Invoiced turnover over the rolling twelve months is ${formatPence(turnover)} — ${BAND_WORDS[rollingBand]}.`);
  if (alarming(forwardBand)) parts.push(`The fees expected from claims at the invoice stage come to ${formatPence(expectedPence)} — ${BAND_WORDS[forwardBand]} on the thirty-day test.`);
  if (single.length > 0) parts.push(`${single.length} single expected fee${single.length === 1 ? ' is' : 's are'} at or over ${formatPence(trigger)}: ${single.map((s) => `${s.claim_ref} (${s.expected})`).join(', ')}.`);
  if (parts.length > 0) parts.push('Run the monthly check in the VAT threshold monitoring procedure, section 5, and decide — this reading changes nothing by itself.');

  return {
    today,
    threshold: t === undefined || threshold === null ? null : { pence: threshold, shown: formatPence(threshold), effective_from: t.effective_from, source: t.source },
    warning_from: f === undefined || fraction === null ? null : { fraction, shown: `${Math.round(fraction * 1000) / 10}% of the threshold`, source: f.source },
    trigger: g === undefined || trigger === null ? null : { pence: trigger, shown: formatPence(trigger), source: g.source },
    rolling: {
      from, to: today, invoiced_pence: invoiced, credited_pence: credited, turnover_pence: turnover, turnover: formatPence(turnover),
      band: rollingBand, undated_invoices: undated,
      basis: `claim invoices whose tax point — the invoice date, or the client report’s delivery if earlier — falls ${from} to ${today}, less the credit notes issued in the same months` +
        (undated > 0 ? `; ${undated} organisation invoice${undated === 1 ? '' : 's'} from before invoices sat on the claim carr${undated === 1 ? 'ies' : 'y'} no date and ${undated === 1 ? 'is' : 'are'} counted apart, never as nought` : ''),
    },
    forward: {
      expected_pence: expectedPence, expected: formatPence(expectedPence), claims_counted: counted.length,
      claims_without_a_fee: expected.length - counted.length, band: forwardBand,
      basis: 'the fees expected from claims at the invoice stage with no live fee invoice — nothing records when each will be invoiced, so every one is counted as if it could fall inside the next thirty days' +
        (expected.length > counted.length ? `; ${expected.length - counted.length} whose fee cannot be computed ${expected.length - counted.length === 1 ? 'is' : 'are'} counted apart, never as nought` : ''),
    },
    single_engagements: single,
    needs_task: needs,
    warning: parts.length === 0 ? null : parts.join(' '),
    never_changes_an_invoice: NEVER_CHANGES_AN_INVOICE,
  };
}

/* ================================================================== *
 * 4 · THE TASK — ONE AT A TIME, THROUGH insertTask, WAITING WITH ACCOUNTING
 * ================================================================== */

export const VAT_TASK_TITLE = 'VAT threshold: the monitoring reading is inside the warning margin — run the VAT check in the finance view';

export const VAT_TASK_DESCRIPTION =
  'Raised by the VAT monitoring in the finance view, which carries the reading. Work the VAT threshold monitoring procedure, section 5 and section 6, ' +
  'and record what was decided. No invoice has been changed.';

export type VatTaskState = 'NOT_NEEDED' | 'ALREADY_OPEN' | 'CREATED';

/**
 * RAISE THE TASK WHERE THE READING NEEDS ONE, AND NEVER A SECOND. The caller holds
 * the transaction and has asked `can()`. `created_by` is the person whose action
 * ran the check, or null where none did.
 */
export function ensureVatTask(
  db: Db, now: () => string, newId: () => string, reading: VatReading, created_by: string | null,
): { readonly state: VatTaskState; readonly id: string | null } {
  if (!reading.needs_task) return { state: 'NOT_NEEDED', id: null };
  const open = db.get<{ id: string }>(
    "SELECT id FROM staff_tasks WHERE company_subject = 'VAT_THRESHOLD' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1");
  if (open !== undefined) return { state: 'ALREADY_OPEN', id: open.id };
  const id = insertTask(db, now, newId, {
    title: VAT_TASK_TITLE, description: VAT_TASK_DESCRIPTION, owner_id: null, owner_role: 'ACCOUNTING',
    due_on: lastDayOfMonth(reading.today), priority: 'HIGH', activity_type: 'REVIEW',
    business_id: null, property_id: null, claim_id: null, lead_id: null, contact_id: null, fact_id: null,
    recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'VAT_MONITOR', automation_run_id: null,
    created_by, company_subject: 'VAT_THRESHOLD',
  });
  return { state: 'CREATED', id };
}

/** THE CHECK, RUN BY A PERSON — ACCOUNTING OR ADMIN, from the finance view. */
export function runVatCheck(
  d: VatDeps, actor: Actor, opts: { controls?: FeeControls } = {},
): { readonly reading: VatReading; readonly task: { readonly state: VatTaskState; readonly id: string | null } } {
  authorise(actor, 'invoice.write', financeSectionObj());
  const at = d.now();
  const reading = vatReading(d.db, at, opts);
  const task = d.db.tx(() => {
    const t = ensureVatTask(d.db, d.now, d.newId, reading, actor.id);
    d.audit.append({
      at, kind: 'VAT_CHECK_RUN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'vat_monitoring', object_id: t.id ?? 'no-task',
      // The bands and what happened to the task — never a figure.
      detail: { rolling: reading.rolling.band, forward: reading.forward.band, single: reading.single_engagements.length, task: t.state },
    });
    return t;
  });
  return { reading, task };
}
