/**
 * THE MANAGEMENT DASHBOARD — EVERY TILE A QUERY, EVERY TILE ASKED OF can().
 * CRM 9 of 10, 12 September 2026.
 *
 * The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, section 15, and the decisions
 * this file takes are that table's Part E from E119. The page is
 * src/web/dashboard-pages.ts; the proof is test/dashboard.test.ts and
 * tools/payload-proof.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS STORED. There is no dashboard table, no cached total and no
 * column that holds a count: every figure is read from the records the earlier
 * CRM phases keep, on the request that draws it, and a test asserts the schema
 * holds nothing named for a dashboard. Where a reading already exists it is
 * CALLED, never rewritten: the money is `financeDashboard`, a firm's referrals are
 * `pipelineFigures`, overdue is `dueReading`, the variance is `varianceOf`, a
 * deliverable is `deliverableIssued`, and the compliance clocks are the three
 * registers' own lists.
 *
 * WHO SEES WHICH TILE IS THE RULE TABLE, NOT A ROLE CHECK. Each tile in `TILES`
 * names the actions its figures need and is drawn only where `can()` says yes to
 * every one of them; inside a tile every row is asked again. So ADMIN sees all of
 * it, SALES the pipeline, ACCOUNTING the money, and SURVEYING — which holds none of
 * the pipeline, money, figures or register actions — its own survey jobs and
 * nothing else. N1 is structural: no tile a surveyor can reach reads the estimate.
 *
 * UNKNOWN IS COUNTED APART, NEVER AS NOUGHT (N4). A claim with no sealed estimate,
 * a task with no due date, a completed claim with no sign-off record, a lead not
 * yet decided, a reconciliation whose quote gap cannot be read — each is a sentence
 * in the tile's `apart` list, and never a zero added into a sum or a ratio.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { EXITS, PROCEDURE_STAGES, anyStageLabel, claimStage, procedureIndex } from './stages.ts';
import { dueReading, isTerminalStage, nextActionBreakers } from './tasks.ts';
import { localDate } from './localtime.ts';
import { formatPence } from './shown-range.ts';
import { financeDashboard, type FinanceDashboard } from './invoices.ts';
import {
  DELIVERABLES, QUOTE_GAP_REVIEW_PCT, VARIANCE_CATEGORIES, deliverableIssued, latestSignOff, varianceOf,
} from './claim-record.ts';
import { pipelineFigures } from './introducers.ts';
import { reasonLabel } from './pipeline.ts';
import { rightsRegister, complaintsLog } from './compliance-rights.ts';
import { breachRegister } from './compliance-breach.ts';
import { claimObjFor, claimWords } from './crm.ts';
import { vocabLabel } from './vocabularies.ts';
import { SECTORS } from './leads.ts';

type Vocab = Readonly<Record<string, string>>;

/* ================================================================== *
 * 1 · THE SHAPE OF A TILE
 * ================================================================== */

export type TileGroup = 'PIPELINE' | 'MONEY' | 'RECONCILIATION' | 'WORK' | 'COMPLIANCE' | 'MY_JOBS';

export type TileKey =
  | 'open_pipeline_value' | 'average_claim_value' | 'won_and_completed' | 'claims_by_stage' | 'claims_by_owner'
  | 'claims_by_introducer' | 'leads_by_source' | 'days_to_completion' | 'expected_completion' | 'exits_and_lost'
  | 'estimated_fees' | 'money'
  | 'reconciliation_cases' | 'reconciliation_gaps' | 'deliverables'
  | 'overdue_tasks' | 'outstanding_client_requests'
  | 'compliance'
  | 'my_jobs';

/** One line of a tile: a label and what it reads, as words. `flag` marks something late or waiting. */
export type TileLine = { readonly label: string; readonly value: string; readonly href?: string; readonly flag?: boolean };

export type Tile = {
  readonly key: TileKey;
  readonly title: string;
  readonly group: TileGroup;
  /** The actions this tile's figures need. The tile is drawn only where every one of them says yes. */
  readonly asks: readonly string[];
  readonly lines: readonly TileLine[];
  /** What is not known, counted apart and said — never added in as nought. */
  readonly apart: readonly string[];
  /** How the tile is read, in one sentence a reader can check. */
  readonly basis: string;
  /** The CRM follow-on: whether the period chosen narrows this tile, or it counts what stands today whatever the period. */
  readonly period: 'APPLIED' | 'AS_AT_TODAY';
};

export type Dashboard = {
  readonly today: string;
  readonly tiles: readonly Tile[];
  readonly note: string;
  /** The CRM follow-on: the period the tiles were read over, from the fixed table, and anything asked for and not applied. */
  readonly period: Period;
  readonly said: readonly string[];
};

type Ctx = { readonly db: Db; readonly actor: Actor; readonly nowIso: string; readonly today: string; readonly period: Period; finance?: FinanceDashboard };

type Built = { readonly lines: readonly TileLine[]; readonly apart: readonly string[]; readonly basis: string };

type TileDef = {
  readonly key: TileKey;
  readonly title: string;
  readonly group: TileGroup;
  readonly asks: readonly { readonly action: string; readonly object: Obj }[];
  readonly build: (c: Ctx) => Built;
  /** Set on a tile whose figures are events in time, which a period narrows. Absent is a count of what stands today. */
  readonly period?: 'APPLIED';
};

/* ------------------------------------------------ the objects a tile is asked about */

const DASHBOARD_OBJ: Obj = { type: 'pipeline', id: 'dashboard' };
const PIPELINE_OBJ: Obj = { type: 'pipeline', id: 'dashboard' };
/** A claim no surveyor is assigned to. `claim.read_value` is ADMIN's and SALES's on every claim, and no one else's on any. */
const VALUE_OBJ: Obj = { type: 'claim', id: '__dashboard__', business_id: '__dashboard__', assigned_surveyor_ids: [] };
const FIGURES_OBJ: Obj = { type: 'claim_figures', id: '__dashboard__', business_id: '__dashboard__' };
const INVOICE_OBJ: Obj = { type: 'invoice', id: '__dashboard__', business_id: '__dashboard__' };
const LEAD_OBJ: Obj = { type: 'lead', id: '__dashboard__', business_id: null };
const INTRODUCER_OBJ: Obj = { type: 'introducer', id: '__dashboard__' };
const TASK_TEAM_OBJ: Obj = {
  type: 'staff_task', id: '__dashboard__', business_id: null, owner_id: null, owner_role: null, assigned_surveyor_ids: [],
};
const ORGANISATION_OBJ: Obj = { type: 'business', id: '__dashboard__' };
const REQUEST_OBJ: Obj = { type: 'document_request', id: '__dashboard__', business_id: '__dashboard__' };
const DELIVERABLE_OBJ: Obj = {
  type: 'deliverable', id: '__dashboard__', business_id: '__dashboard__', kind: '', state: '', figure_released: false,
};
const COMPLIANCE_OBJ: Obj = { type: 'compliance', id: 'dashboard' };
const SURVEY_OBJ: Obj = { type: 'surveyor_job', id: '__dashboard__', business_id: '__dashboard__', surveyor_id: null };

const ask = (action: string, object: Obj) => ({ action, object });

/* ================================================================== *
 * 2 · SMALL READINGS
 * ================================================================== */

function words(vocab: Vocab, v: string | null | undefined, none: string): string {
  return typeof v === 'string' && Object.hasOwn(vocab, v) ? (vocab[v] ?? v) : none;
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
}

/** A UK calendar date as a whole day number, so two dates subtract to whole days whatever the clocks did. */
function dayNumber(ukDate: string): number {
  return Math.round(Date.parse(`${ukDate}T12:00:00.000Z`) / 86_400_000);
}

/** Whole UK calendar days from one stored moment to another — the UK date, never a UTC difference. */
function ukDaysBetween(fromIso: string, toIso: string): number {
  const a = /^\d{4}-\d{2}-\d{2}$/.test(fromIso) ? fromIso : localDate(fromIso);
  const b = /^\d{4}-\d{2}-\d{2}$/.test(toIso) ? toIso : localDate(toIso);
  return dayNumber(b) - dayNumber(a);
}

function average(xs: readonly number[]): string {
  return (xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(1);
}

function pct(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The UK month and calendar quarter `today` falls in, as prefixes and words. */
function monthAndQuarter(today: string): { month: string; monthWords: string; quarter: readonly string[]; quarterWords: string } {
  const year = today.slice(0, 4);
  const m = Number(today.slice(5, 7));
  const first = Math.floor((m - 1) / 3) * 3 + 1;
  const months = [first, first + 1, first + 2].map((x) => `${year}-${String(x).padStart(2, '0')}`);
  return {
    month: today.slice(0, 7),
    monthWords: `${MONTH_NAMES[m - 1] ?? ''} ${year}`,
    quarter: months,
    quarterWords: `${MONTH_NAMES[first - 1] ?? ''} to ${MONTH_NAMES[first + 1] ?? ''} ${year}`,
  };
}

/* ================================================================== *
 * 2a · THE PERIOD — the CRM follow-on, rows 22.16 and 29.11
 *
 * THE DASHBOARD IS THE REPORTS SCREEN, and a report is the dashboard over a period. The period is a key in a FIXED TABLE —
 * this month, this quarter, a UK financial year, or any from-to range of UK dates — never SQL and never stored: the tiles
 * are the same queries, read on the request, narrowed to the dates. A value that is not on the table, or a range that is not
 * two UK dates in order, is dropped and said, and the tiles read with no period.
 *
 * A PERIOD NARROWS WHAT HAPPENED IN TIME — a claim completed, a lead taken, a stay in a stage finished, a claim expected to
 * complete, a claim exited, the money by month — and every such tile says the period applies. A tile that counts what
 * stands today (the open pipeline, the claims at each stage, the work waiting, the compliance clocks) says it is as at
 * today, whatever the period. A RECORD WITH NO DATE TO PLACE IT BY IS COUNTED APART, never inside or outside the period —
 * a lost lead, which carries no date it was lost (N4). A closed claim always carries its completion date: the claims table
 * holds one exactly when a claim is closed.
 * ================================================================== */

export type PeriodKey = 'NONE' | 'MONTH' | 'QUARTER' | 'FINANCIAL_YEAR' | 'RANGE';

export const PERIODS: Readonly<Record<PeriodKey, string>> = Object.freeze({
  NONE: 'No period — everything recorded, as at today',
  MONTH: 'This month',
  QUARTER: 'This quarter',
  FINANCIAL_YEAR: 'A UK financial year — 1 April to 31 March',
  RANGE: 'From one UK date to another',
});

export type Period = { readonly key: PeriodKey; readonly from: string | null; readonly to: string | null; readonly words: string };

export const NO_PERIOD: Period = Object.freeze({ key: 'NONE', from: null, to: null, words: 'no period' });

const PERIOD_APPLIED = 'The period chosen applies: only what happened inside it is counted, and anything with no date to place it by is counted apart.';
const PERIOD_AS_AT = 'As at today — a count of what stands now, which the period chosen does not change.';

function isUkDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function lastDay(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** A UK date inside the period, both ends included. No period admits every date; a date nobody recorded is in none. */
export function inPeriod(p: Period, ukDate: string | null): boolean {
  if (p.key === 'NONE') return true;
  return ukDate !== null && ukDate !== '' && p.from !== null && p.to !== null && ukDate >= p.from && ukDate <= p.to;
}

/** THE PERIOD A REQUEST ASKS FOR — `period`, and `fy` or `from` and `to` — read through the fixed table and nothing else. */
export function readPeriod(q: URLSearchParams, today: string): { period: Period; said: string[] } {
  const said: string[] = [];
  for (const k of new Set(q.keys())) if (!['period', 'fy', 'from', 'to'].includes(k)) said.push(`${k.slice(0, 40)}: not something the dashboard takes, so it was not applied`);
  const asked = (q.get('period') ?? '').trim();
  if (asked === '' || asked === 'NONE') return { period: NO_PERIOD, said };
  if (!Object.hasOwn(PERIODS, asked)) { said.push('Period: not one of the periods offered, so the tiles read with no period'); return { period: NO_PERIOD, said }; }
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (asked === 'MONTH') {
    const mq = monthAndQuarter(today);
    return { period: { key: 'MONTH', from: `${mq.month}-01`, to: lastDay(y, m), words: `this month, ${mq.monthWords}` }, said };
  }
  if (asked === 'QUARTER') {
    const mq = monthAndQuarter(today);
    const last = mq.quarter[2] ?? mq.month;
    return {
      period: { key: 'QUARTER', from: `${mq.quarter[0] ?? mq.month}-01`, to: lastDay(Number(last.slice(0, 4)), Number(last.slice(5, 7))), words: `this quarter, ${mq.quarterWords}` },
      said,
    };
  }
  if (asked === 'FINANCIAL_YEAR') {
    const fyRaw = (q.get('fy') ?? '').trim();
    const current = m >= 4 ? y : y - 1;
    let fy = current;
    if (fyRaw !== '') {
      if (/^\d{4}$/.test(fyRaw) && Number(fyRaw) >= 2000 && Number(fyRaw) <= 2100) fy = Number(fyRaw);
      else said.push(`Financial year: not a year from 2000 to 2100, so the financial year ${current} to ${current + 1} is read`);
    }
    return {
      period: { key: 'FINANCIAL_YEAR', from: `${fy}-04-01`, to: `${fy + 1}-03-31`, words: `the UK financial year 1 April ${fy} to 31 March ${fy + 1}` },
      said,
    };
  }
  const from = (q.get('from') ?? '').trim();
  const to = (q.get('to') ?? '').trim();
  if (!isUkDate(from) || !isUkDate(to)) { said.push('From and to: a range is two UK dates, as YYYY-MM-DD, so the tiles read with no period'); return { period: NO_PERIOD, said }; }
  if (from > to) { said.push('From and to: the range ends before it starts, so the tiles read with no period'); return { period: NO_PERIOD, said }; }
  return { period: { key: 'RANGE', from, to, words: `${from} to ${to}` }, said };
}

/** The query string that asks for a period again — for a link to the data a page was built from. */
export function periodQuery(p: Period): string {
  if (p.key === 'NONE') return '';
  if (p.key === 'RANGE') return new URLSearchParams({ period: 'RANGE', from: p.from ?? '', to: p.to ?? '' }).toString();
  if (p.key === 'FINANCIAL_YEAR') return new URLSearchParams({ period: 'FINANCIAL_YEAR', fy: (p.from ?? '').slice(0, 4) }).toString();
  return new URLSearchParams({ period: p.key }).toString();
}

type ClaimLine = {
  id: string; claim_ref: string; business_id: string; stage: string | null; hold_return_stage: string | null;
  owner_id: string | null; owner_name: string | null; assessment_id: string | null; expected_completion: string | null;
  completed_at: string | null; created_at: string; q: number | null;
};

/**
 * EVERY CLAIM THE READER MAY READ, with the sealed estimate's qualifying expenditure beside it. The estimate is
 * READ INTO A TILE ONLY WHERE `claim.read_value` SAYS YES FOR THAT CLAIM — `valueOf` below — so a tile built for a
 * role without it has nothing to leak even by accident.
 */
function readableClaims(c: Ctx): ClaimLine[] {
  return c.db.all<ClaimLine>(
    'SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, c.owner_id, u.display_name AS owner_name, ' +
      'c.assessment_id, c.expected_completion, c.completed_at, c.created_at, ' +
      '(SELECT e.qualifying_expenditure_pence FROM estimates e WHERE e.assessment_id = c.assessment_id ORDER BY e.rowid DESC LIMIT 1) AS q ' +
      'FROM claims c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.claim_ref ASC',
  ).filter((r) => can(c.actor, 'claim.read', claimObjFor(c.db, r)));
}

/** The estimate for one claim, or null where it is not readable or not sealed. Unreadable is never a zero. */
function valueOf(c: Ctx, r: ClaimLine): number | null {
  if (!can(c.actor, 'claim.read_value', claimObjFor(c.db, r))) return null;
  return r.q;
}

function isOpen(stage: string | null): boolean {
  const k = claimStage(stage).kind;
  return k === 'PROCEDURE' || k === 'ON_HOLD';
}

function finance(c: Ctx): FinanceDashboard {
  if (c.finance === undefined) c.finance = financeDashboard(c.db, c.actor, c.nowIso);
  return c.finance;
}

const NO_ESTIMATE = (n: number): string =>
  `${plural(n, 'open claim carries', 'open claims carry')} no sealed estimate — counted apart, and never added in as nought`;

/* ================================================================== *
 * 3 · THE TILES
 * ================================================================== */

function openPipelineValue(c: Ctx): Built {
  const all = readableClaims(c);
  const open = all.filter((r) => isOpen(r.stage));
  const unknownStage = all.filter((r) => claimStage(r.stage).kind === 'UNKNOWN').length;
  const known = open.map((r) => valueOf(c, r)).filter((v): v is number => v !== null);
  return {
    lines: [
      { label: 'Open claims — at one of the ten stages, or on hold', value: plural(open.length, 'claim', 'claims') },
      {
        label: 'Estimated claim value of the open pipeline',
        value: known.length === 0 ? 'not known — no open claim carries a sealed estimate'
          : `${formatPence(known.reduce((a, v) => a + v, 0))} over ${plural(known.length, 'claim', 'claims')}`,
      },
    ],
    apart: [
      ...(open.length - known.length > 0 ? [NO_ESTIMATE(open.length - known.length)] : []),
      ...(unknownStage > 0 ? [`${plural(unknownStage, 'claim has', 'claims have')} a stage nobody recognises — counted as neither open nor closed`] : []),
    ],
    basis: 'The sealed estimate’s qualifying expenditure — the indicative claim value the client was shown the range of — summed over every open claim, read afresh on every request.',
  };
}

function averageClaimValue(c: Ctx): Built {
  const open = readableClaims(c).filter((r) => isOpen(r.stage));
  const known = open.map((r) => valueOf(c, r)).filter((v): v is number => v !== null);
  return {
    lines: [{
      label: 'Average estimated claim value, open claims',
      value: known.length === 0 ? 'not known — no open claim carries a sealed estimate'
        : `${formatPence(Math.round(known.reduce((a, v) => a + v, 0) / known.length))} over ${plural(known.length, 'claim', 'claims')}`,
    }],
    apart: open.length - known.length > 0 ? [NO_ESTIMATE(open.length - known.length)] : [],
    basis: 'The mean of the sealed estimates’ qualifying expenditure over the open claims that carry one. A claim with no estimate is not in the divisor.',
  };
}

const DATA_GATHERING = procedureIndex('DATA_GATHERING');

function wonAndCompleted(c: Ctx): Built {
  const all = readableClaims(c);
  const won = all.filter((r) => {
    const s = claimStage(r.stage);
    if (s.kind === 'PROCEDURE') return procedureIndex(r.stage) >= DATA_GATHERING;
    if (s.kind === 'ON_HOLD') return procedureIndex(r.hold_return_stage) >= DATA_GATHERING;
    return false;
  });
  const wonKnown = won.map((r) => valueOf(c, r)).filter((v): v is number => v !== null);
  // THE CRM FOLLOW-ON: a period narrows the completed claims to those closed inside it. A closed claim always carries its
  // completion date — the claims table holds one exactly when it is closed — so none is left to place apart.
  const closed = all.filter((r) => r.stage === 'CLOSED');
  const completed = c.period.key === 'NONE' ? closed : closed.filter((r) => inPeriod(c.period, r.completed_at === null ? null : localDate(r.completed_at)));
  const signed = completed
    .filter((r) => can(c.actor, 'claim_figures.read', { type: 'claim_figures', id: r.id, business_id: r.business_id }))
    .map((r) => latestSignOff(c.db, r.id)?.figure_pence ?? null)
    .filter((v): v is number => v !== null);
  return {
    lines: [
      {
        label: 'Won — engaged, and still in the procedure',
        value: `${plural(won.length, 'claim', 'claims')}${wonKnown.length === 0 ? '' : ` · estimated ${formatPence(wonKnown.reduce((a, v) => a + v, 0))}`}`,
      },
      {
        label: c.period.key === 'NONE' ? 'Completed — closed' : `Completed — closed in ${c.period.words}`,
        value: `${plural(completed.length, 'claim', 'claims')}${signed.length === 0 ? '' : ` · ${formatPence(signed.reduce((a, v) => a + v, 0))} on the tax adviser’s signed figure`}`,
      },
      ...(signed.length === 0 ? [] : [{
        label: 'Average signed claim value, completed claims',
        value: `${formatPence(Math.round(signed.reduce((a, v) => a + v, 0) / signed.length))} over ${plural(signed.length, 'claim', 'claims')}`,
      }]),
    ],
    apart: [
      ...(won.length - wonKnown.length > 0 ? [`${plural(won.length - wonKnown.length, 'won claim carries', 'won claims carry')} no sealed estimate — counted apart`] : []),
      ...(completed.length - signed.length > 0 ? [`${plural(completed.length - signed.length, 'completed claim has', 'completed claims have')} no sign-off record to read a figure from — counted apart, never as nought`] : []),
    ],
    basis: 'Won is a claim past the engagement gate — at data gathering or later, or on hold from there — and not exited; its value is the sealed estimate. Completed is CLOSED; its value is the tax adviser’s signed figure, the only figure that is not an estimate.',
  };
}

function claimsByStage(c: Ctx): Built {
  const all = readableClaims(c);
  const mayValue = can(c.actor, 'claim.read_value', VALUE_OBJ);
  const line = (label: string, rows: readonly ClaimLine[], always: boolean): TileLine[] => {
    if (!always && rows.length === 0) return [];
    const known = mayValue ? rows.map((r) => valueOf(c, r)).filter((v): v is number => v !== null) : [];
    const value = mayValue && rows.length > 0
      ? ` · ${known.length === 0 ? 'no estimate' : `${formatPence(known.reduce((a, v) => a + v, 0))} estimated (${known.length} of ${rows.length})`}`
      : '';
    return [{ label, value: `${plural(rows.length, 'claim', 'claims')}${value}` }];
  };
  return {
    lines: [
      ...PROCEDURE_STAGES.flatMap((s) => line(s.label, all.filter((r) => r.stage === s.key), true)),
      ...line('On hold', all.filter((r) => r.stage === 'ON_HOLD'), true),
      ...line('Closed', all.filter((r) => r.stage === 'CLOSED'), true),
      ...EXITS.flatMap((e) => line(`Exit — ${e.label}`, all.filter((r) => r.stage === e.key), false)),
      ...line('Stage not recognised', all.filter((r) => claimStage(r.stage).kind === 'UNKNOWN'), false),
    ],
    apart: [],
    basis: mayValue
      ? 'A count of claims at each of the operating procedure’s stages, with the sealed estimates summed beside it; a stage with none says so rather than showing a nought value.'
      : 'A count of claims at each of the operating procedure’s stages.',
  };
}

function claimsByOwner(c: Ctx): Built {
  const by = new Map<string, { label: string; open: number; other: number }>();
  for (const r of readableClaims(c)) {
    const key = r.owner_id ?? '';
    const x = by.get(key) ?? { label: r.owner_id === null ? 'Nobody yet' : (r.owner_name ?? 'a former user'), open: 0, other: 0 };
    if (isOpen(r.stage)) x.open += 1; else x.other += 1;
    by.set(key, x);
  }
  return {
    lines: [...by.values()].sort((a, b) => b.open - a.open || a.label.localeCompare(b.label))
      .map((x) => ({ label: x.label, value: `${plural(x.open, 'open claim', 'open claims')} · ${x.other} closed or exited` })),
    apart: [],
    basis: 'Each claim counted once, under the person who owns it; a claim nobody owns is its own line.',
  };
}

function claimsByIntroducer(c: Ctx): Built {
  const firms = c.db.all<{ id: string; firm_name: string }>('SELECT id, firm_name FROM introducers ORDER BY firm_name ASC, id ASC LIMIT 500')
    .filter((f) => can(c.actor, 'introducer.read', { type: 'introducer', id: f.id }));
  const read = firms.map((f) => ({ f, p: pipelineFigures(c.db, f.id) }));
  const referred = read.filter((x) => x.p.leads_referred > 0);
  return {
    lines: referred.map((x) => ({
      label: x.f.firm_name,
      value: `${plural(x.p.leads_referred, 'lead', 'leads')} referred · ${x.p.claims_opened} opened · ${x.p.claims_won} won · ${x.p.reasoned_negatives} reasoned ${x.p.reasoned_negatives === 1 ? 'negative' : 'negatives'}`,
      href: `/staff/introducers/${x.f.id}`,
    })),
    apart: read.length - referred.length > 0 ? [`${plural(read.length - referred.length, 'firm has', 'firms have')} referred nothing yet`] : [],
    basis: 'Read by the same counts the introducer page shows for each firm — never a second count.',
  };
}

function leadsBySource(c: Ctx): Built {
  const rows = c.db.all<{ id: string; business_id: string | null; source: string; status: string; lead_date: string }>(
    'SELECT id, business_id, source, status, lead_date FROM leads ORDER BY source ASC',
  ).filter((r) => can(c.actor, 'lead.read', { type: 'lead', id: r.id, business_id: r.business_id }))
    // THE CRM FOLLOW-ON: a lead is counted in the period its lead date falls in, by the UK date.
    .filter((r) => inPeriod(c.period, localDate(r.lead_date)));
  const by = new Map<string, { total: number; converted: number; lost: number }>();
  for (const r of rows) {
    const x = by.get(r.source) ?? { total: 0, converted: 0, lost: 0 };
    x.total += 1;
    if (r.status === 'CONVERTED') x.converted += 1;
    if (r.status === 'LOST') x.lost += 1;
    by.set(r.source, x);
  }
  const undecided = rows.filter((r) => r.status !== 'CONVERTED' && r.status !== 'LOST').length;
  return {
    lines: [...by.entries()].sort((a, b) => b[1].total - a[1].total).map(([source, x]) => ({
      label: vocabLabel(c.db, 'LEAD_SOURCE', source, source),
      value: `${plural(x.total, 'lead', 'leads')} · ${x.converted} converted · ${x.lost} lost · conversion ${
        x.converted + x.lost === 0 ? 'not known — none decided yet' : `${pct(x.converted, x.converted + x.lost)} of those decided`}`,
    })),
    apart: undecided > 0 ? [`${plural(undecided, 'lead is', 'leads are')} still open — neither converted nor lost, and in no conversion rate`] : [],
    basis: 'Conversion is converted ÷ decided, where decided is converted or lost. A lead still being worked is not a failure, and is not in the divisor.',
  };
}

type Move = { claim_id: string; at: string; to_stage: string | null };

function daysToCompletion(c: Ctx): Built {
  const readable = new Set(readableClaims(c).map((r) => r.id));
  const closedAll = c.db.all<{ id: string; completed_at: string | null; lead_date: string | null }>(
    "SELECT c.id, c.completed_at, l.lead_date FROM claims c LEFT JOIN leads l ON l.claim_id = c.id WHERE c.stage = 'CLOSED'",
  ).filter((r) => readable.has(r.id));
  // THE CRM FOLLOW-ON: the claims closed inside the period, by the UK date of their completion.
  const completed = c.period.key === 'NONE' ? closedAll : closedAll.filter((r) => inPeriod(c.period, r.completed_at === null ? null : localDate(r.completed_at)));
  const spans = completed.filter((r) => r.completed_at !== null && r.lead_date !== null)
    .map((r) => ukDaysBetween(r.lead_date ?? '', r.completed_at ?? ''));

  /* THE BOTTLENECK VIEW. A stay in a stage runs from the move into it to the next move of any kind; the last
     stay is still running, and is counted apart as "there now". Read from `claim_stage_moves`, which is append-only. */
  const moves = c.db.all<Move>('SELECT claim_id, at, to_stage FROM claim_stage_moves ORDER BY claim_id ASC, at ASC, rowid ASC')
    .filter((m) => readable.has(m.claim_id));
  const finished = new Map<string, number[]>();
  const current = new Map<string, number[]>();
  for (let i = 0; i < moves.length; i += 1) {
    const m = moves[i];
    if (m === undefined || m.to_stage === null) continue;
    const next = moves[i + 1];
    const target = next !== undefined && next.claim_id === m.claim_id ? finished : current;
    const until = next !== undefined && next.claim_id === m.claim_id ? next.at : c.nowIso;
    // THE CRM FOLLOW-ON: a finished stay counts in the period it finished in. A stay still running is today's, whatever the period.
    if (target === finished && !inPeriod(c.period, localDate(until))) continue;
    const list = target.get(m.to_stage) ?? [];
    list.push(ukDaysBetween(m.at, until));
    target.set(m.to_stage, list);
  }
  const stageKeys = [...PROCEDURE_STAGES.map((s) => s.key as string), 'ON_HOLD'];
  const slowest = stageKeys.map((k) => ({ k, xs: finished.get(k) ?? [] })).filter((x) => x.xs.length > 0)
    .sort((a, b) => Number(average(b.xs)) - Number(average(a.xs)))[0];
  return {
    lines: [
      {
        label: 'Average days from lead to completion',
        value: spans.length === 0 ? 'not known — no completed claim has both a lead date and a completion date'
          : `${average(spans)} days over ${plural(spans.length, 'completed claim', 'completed claims')}`,
      },
      ...(slowest === undefined ? [] : [{ label: 'The slowest stage, by finished stays', value: `${anyStageLabel(slowest.k)} — ${average(slowest.xs)} days on average`, flag: true }]),
      ...stageKeys.map((k) => {
        const f = finished.get(k) ?? [];
        const n = current.get(k) ?? [];
        return {
          label: anyStageLabel(k),
          value: `${f.length === 0 ? 'no finished stay yet' : `${average(f)} days over ${plural(f.length, 'finished stay', 'finished stays')}`}${
            n.length === 0 ? '' : ` · ${plural(n.length, 'claim', 'claims')} there now, ${average(n)} days so far`}`,
        };
      }),
    ],
    apart: completed.length - spans.length > 0
      ? [`${plural(completed.length - spans.length, 'completed claim has', 'completed claims have')} no lead, so no lead date — counted apart, never as nought days`] : [],
    basis: 'Whole UK calendar days — the UK date, never a UTC difference. Lead to completion runs from the lead’s date to the day the claim closed; a stage’s stay runs from the move into it to the next move.',
  };
}

function expectedCompletion(c: Ctx): Built {
  const open = readableClaims(c).filter((r) => isOpen(r.stage));
  const mq = monthAndQuarter(c.today);
  const dated = open.filter((r) => r.expected_completion !== null);
  return {
    lines: [
      // THE CRM FOLLOW-ON: with no period, this month and this quarter as before; with one, the period instead.
      ...(c.period.key === 'NONE' ? [
        { label: `Expected to complete this month — ${mq.monthWords}`, value: plural(dated.filter((r) => (r.expected_completion ?? '').slice(0, 7) === mq.month).length, 'claim', 'claims') },
        { label: `Expected to complete this quarter — ${mq.quarterWords}`, value: plural(dated.filter((r) => mq.quarter.includes((r.expected_completion ?? '').slice(0, 7))).length, 'claim', 'claims') },
      ] : [
        { label: `Expected to complete in ${c.period.words}`, value: plural(dated.filter((r) => inPeriod(c.period, r.expected_completion)).length, 'claim', 'claims') },
      ]),
      ...dated.filter((r) => (r.expected_completion ?? '') < c.today).map((r) => ({
        label: claimWords(c.db, r.id), value: `expected ${r.expected_completion ?? ''}, and still open`, href: `/staff/claims/${r.id}`, flag: true,
      })),
    ],
    apart: open.length - dated.length > 0
      ? [`${plural(open.length - dated.length, 'open claim has', 'open claims have')} no expected completion date recorded — counted apart, never as this month`] : [],
    basis: 'The expected completion date a person recorded on each open claim, against today’s UK date. A calendar quarter.',
  };
}

function exitsAndLost(c: Ctx): Built {
  const all = readableClaims(c);
  // THE CRM FOLLOW-ON: a claim is counted in the period its exit was recorded in — the move that took it there.
  const exitAt = (id: string): string | null => c.db.get<{ at: string }>(
    "SELECT at FROM claim_stage_moves WHERE claim_id = ? AND kind = 'EXIT' ORDER BY at DESC, rowid DESC LIMIT 1", [id])?.at ?? null;
  const exited = all.filter((r) => claimStage(r.stage).kind === 'EXIT')
    .filter((r) => { if (c.period.key === 'NONE') return true; const at = exitAt(r.id); return at !== null && inPeriod(c.period, localDate(at)); });
  const reasonOf = (id: string): string => {
    const m = c.db.get<{ reason_code: string | null }>(
      "SELECT reason_code FROM claim_stage_moves WHERE claim_id = ? AND kind = 'EXIT' ORDER BY at DESC, rowid DESC LIMIT 1", [id]);
    return reasonLabel(c.db, 'CLAIM_EXIT', m?.reason_code ?? null) ?? 'no reason recorded';
  };
  const lostExits = EXITS.filter((e) => e.key !== 'REASONED_NEGATIVE').map((e) => {
    const rows = exited.filter((r) => r.stage === e.key);
    const reasons = new Map<string, number>();
    for (const r of rows) { const w = reasonOf(r.id); reasons.set(w, (reasons.get(w) ?? 0) + 1); }
    return { label: e.label, n: rows.length, reasons: [...reasons.entries()].map(([w, n]) => `${w} ${n}`).join(', ') };
  }).filter((x) => x.n > 0);
  const leads = c.db.all<{ id: string; business_id: string | null; lost_reason: string | null }>(
    "SELECT id, business_id, lost_reason FROM leads WHERE status = 'LOST'",
  ).filter((r) => can(c.actor, 'lead.read', { type: 'lead', id: r.id, business_id: r.business_id }));
  const leadReasons = new Map<string, number>();
  // A LOST LEAD CARRIES NO DATE IT WAS LOST, so with a period chosen none can be placed inside it: counted apart, never in.
  for (const l of c.period.key === 'NONE' ? leads : []) {
    const w = reasonLabel(c.db, 'LEAD_LOST', l.lost_reason) ?? 'no reason recorded';
    leadReasons.set(w, (leadReasons.get(w) ?? 0) + 1);
  }
  const negatives = exited.filter((r) => r.stage === 'REASONED_NEGATIVE').length;
  return {
    lines: [
      ...lostExits.map((x) => ({ label: `Claims — ${x.label}`, value: `${plural(x.n, 'claim', 'claims')} (${x.reasons})` })),
      ...[...leadReasons.entries()].map(([w, n]) => ({ label: `Leads lost — ${w}`, value: plural(n, 'lead', 'leads') })),
      { label: 'Reasoned negatives — counted apart from the lost', value: plural(negatives, 'claim', 'claims') },
    ],
    apart: c.period.key === 'NONE' || leads.length === 0 ? []
      : [`${plural(leads.length, 'lost lead carries', 'lost leads carry')} no date it was lost, so none is placed in ${c.period.words} — counted apart, never inside or outside it`],
    basis: 'Every claim at an exit, with the reason recorded on the move that took it there, and every lost lead with its listed reason. A reasoned negative is the procedure working — there was no claim to make — and it is never counted as a lost opportunity.',
  };
}

function estimatedFees(c: Ctx): Built {
  const f = finance(c);
  return {
    lines: [
      { label: 'Claims at the invoice stage with no fee invoice yet', value: plural(f.expected.claims.length, 'claim', 'claims') },
      { label: 'Their expected fees', value: f.expected.total },
    ],
    apart: [
      ...(f.expected.without_a_fee > 0 ? [`${plural(f.expected.without_a_fee, 'of them has', 'of them have')} no fee that can be read yet — counted apart, never as nought`] : []),
      'Before the invoice stage no fee is computed anywhere in this build, and this tile does not compute one: the fee derives from the tax adviser’s signed figure.',
    ],
    basis: 'The finance view’s own fees expected from claims at the invoice stage, read as that view reads them, and never recomputed here.',
  };
}

function money(c: Ctx): Built {
  const f = finance(c);
  const t = f.totals;
  // THE CRM FOLLOW-ON: with a period, the finance view's own months that fall in it — read as that view reads them, by
  // calendar month. A month the period only partly covers is shown whole, and said.
  const months = c.period.key === 'NONE' ? [] : f.months.filter((m) => `${m.month}-01` <= (c.period.to ?? '') && `${m.month}-31` >= (c.period.from ?? ''));
  const partial = months.filter((m) => `${m.month}-01` < (c.period.from ?? '') || lastDay(Number(m.month.slice(0, 4)), Number(m.month.slice(5, 7))) > (c.period.to ?? ''));
  return {
    lines: [
      { label: 'Invoiced — fees, before VAT, less credit notes', value: t.invoiced },
      { label: 'Paid — money recorded as received', value: t.received },
      { label: 'Outstanding — including VAT', value: t.outstanding },
      { label: 'Overdue', value: `${t.overdue} on ${plural(t.overdue_count, 'invoice', 'invoices')}`, flag: t.overdue_count > 0 },
      ...months.map((m) => ({ label: `In ${m.month}`, value: `invoiced ${m.invoiced} · credited ${m.credited} · received ${m.received}` })),
      ...(c.period.key !== 'NONE' && months.length === 0 ? [{ label: `In ${c.period.words}`, value: 'no month of the finance view falls in the period' }] : []),
    ],
    apart: [
      ...(t.without_a_due_date > 0
        ? [`${plural(t.without_a_due_date, 'open invoice has', 'open invoices have')} no due date — the letter’s payment terms are blank — and is counted neither overdue nor on time`] : []),
      ...(c.period.key !== 'NONE' ? ['The first four lines are the totals as at today; the months below them are the period’s, as the finance view reads money — by calendar month.'] : []),
      ...(partial.length > 0 ? [`${plural(partial.length, 'month is', 'months are')} only partly inside the period and ${partial.length === 1 ? 'is' : 'are'} shown whole — money is read by calendar month, never split by day`] : []),
    ],
    basis: 'The finance view’s own totals, read as that view reads them. Money is recorded, never collected.',
  };
}

type ReconRow = {
  claim_id: string; business_id: string; claim_ref: string; client_sector: string; b_value_pence: number | null;
  c_value_pence: number; d_value_pence: number | null; resolution_path: string | null; variance_category: string | null; status: string;
};

function reconRows(c: Ctx): ReconRow[] {
  return c.db.all<ReconRow>(
    'SELECT r.claim_id, cl.business_id, cl.claim_ref, r.client_sector, r.b_value_pence, r.c_value_pence, r.d_value_pence, ' +
      'r.resolution_path, r.variance_category, r.status FROM claim_reconciliations r JOIN claims cl ON cl.id = r.claim_id ORDER BY cl.claim_ref ASC',
  ).filter((r) => can(c.actor, 'claim_figures.read', { type: 'claim_figures', id: r.claim_id, business_id: r.business_id }));
}

function reconciliationCases(c: Ctx): Built {
  const rows = reconRows(c);
  const withdrawn = rows.filter((r) => r.resolution_path === 'WITHDRAWN_NO_CLAIM');
  const counted = rows.filter((r) => r.resolution_path !== 'WITHDRAWN_NO_CLAIM');
  const tally = (key: (r: ReconRow) => string): TileLine[] => {
    const by = new Map<string, number>();
    for (const r of counted) by.set(key(r), (by.get(key(r)) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => ({ label, value: plural(n, 'case', 'cases') }));
  };
  return {
    lines: [
      { label: 'Cases', value: plural(rows.length, 'case', 'cases') },
      { label: 'Open, with the outcome pending', value: plural(rows.filter((r) => r.status === 'OPEN_OUTCOME_PENDING').length, 'case', 'cases') },
      { label: 'Awaiting the variance tag', value: plural(rows.filter((r) => r.variance_category === null).length, 'case', 'cases'), flag: rows.some((r) => r.variance_category === null) },
      ...tally((r) => `By category — ${r.variance_category === null ? 'not yet tagged' : words(VARIANCE_CATEGORIES, r.variance_category, r.variance_category)}`),
      ...tally((r) => `By sector — ${words(SECTORS, r.client_sector, r.client_sector)}`),
    ],
    apart: withdrawn.length > 0 ? [`${plural(withdrawn.length, 'case was', 'cases were')} withdrawn with no claim — tracked here and kept out of every ratio, as the design says`] : [],
    basis: 'One row per case in `claim_reconciliations`, the reconciliation design’s section 3 schema, tallied as its section 5 aggregate.',
  };
}

function reconciliationGaps(c: Ctx): Built {
  const rows = reconRows(c).filter((r) => r.resolution_path !== 'WITHDRAWN_NO_CLAIM');
  const read = rows.map((r) => ({ r, v: varianceOf(r) }));
  const by = new Map<string, number[]>();
  let deliveryUnknown = 0;
  for (const x of read) {
    if (x.v.delivery_gap_pct === null) { deliveryUnknown += 1; continue; }
    const label = x.r.variance_category === null ? 'not yet tagged' : words(VARIANCE_CATEGORIES, x.r.variance_category, x.r.variance_category);
    by.set(label, [...(by.get(label) ?? []), x.v.delivery_gap_pct]);
  }
  const quoteKnown = read.filter((x) => x.v.quote_gap_pct !== null).length;
  return {
    lines: [
      ...[...by.entries()].map(([label, xs]) => ({
        label: `Delivery gap — ${label}`,
        value: `${average(xs)}% on average over ${plural(xs.length, 'case', 'cases')} (the outcome against the tax adviser’s figure)`,
      })),
      {
        label: 'Quote gap',
        value: rows.length === 0 ? 'no case yet' : `known on ${quoteKnown} of ${plural(rows.length, 'case', 'cases')}`,
        flag: quoteKnown < rows.length,
      },
    ],
    apart: [
      ...(quoteKnown < rows.length ? ['The quote gap is not known where the quote was the range shown and no single quoted figure is recorded (b_value_pence is NULL) — it is counted apart, never as nought, and each such case goes to the tax adviser’s review.'] : []),
      ...(deliveryUnknown > 0 ? [`${plural(deliveryUnknown, 'case has', 'cases have')} no outcome yet, so no delivery gap — counted apart`] : []),
    ],
    basis: `Worked out case by case from the reconciliation’s own figures, and never stored. The review threshold is ${QUOTE_GAP_REVIEW_PCT}% — a constant, not a setting.`,
  };
}

function deliverables(c: Ctx): Built {
  const atReports = c.db.all<{ id: string; claim_ref: string; business_id: string }>(
    "SELECT id, claim_ref, business_id FROM claims WHERE stage = 'REPORTS' ORDER BY claim_ref ASC",
  ).filter((r) => can(c.actor, 'claim.read', claimObjFor(c.db, r))
    && can(c.actor, 'deliverable.read', { type: 'deliverable', id: r.id, business_id: r.business_id, kind: 'CLIENT_REPORT', state: '', figure_released: false }));
  const kinds = ['CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK'] as const;
  const missing = atReports.map((r) => ({ r, not: kinds.filter((k) => !deliverableIssued(c.db, r.id, k)) })).filter((x) => x.not.length > 0);
  return {
    lines: [
      { label: 'Claims at the reports stage', value: plural(atReports.length, 'claim', 'claims') },
      ...missing.map((x) => ({
        label: claimWords(c.db, x.r.id), value: `not issued: ${x.not.map((k) => DELIVERABLES[k].label.toLowerCase()).join(' and ')}`,
        href: `/staff/claims/${x.r.id}`, flag: true,
      })),
    ],
    apart: [],
    basis: 'Read from the deliverables register itself for each claim at the reports stage — never a second count.',
  };
}

function overdueTasks(c: Ctx): Built {
  const rows = c.db.all<{ id: string; business_id: string | null; owner_id: string | null; owner_role: string | null; due_on: string | null; status: string }>(
    "SELECT id, business_id, owner_id, owner_role, due_on, status FROM staff_tasks WHERE status IN ('OPEN','IN_PROGRESS')",
  ).filter((t) => can(c.actor, 'staff_task.read', {
    type: 'staff_task', id: t.id, business_id: t.business_id, owner_id: t.owner_id, owner_role: t.owner_role, assigned_surveyor_ids: [],
  }));
  const states = rows.map((t) => dueReading(t.due_on, c.nowIso).state);
  const count = (s: string): number => states.filter((x) => x === s).length;
  const breakers = nextActionBreakers(c.db, c.actor, c.nowIso);
  return {
    lines: [
      { label: 'Overdue', value: plural(count('OVERDUE'), 'task', 'tasks'), flag: count('OVERDUE') > 0, href: '/staff/tasks?view=all' },
      { label: 'Due today', value: plural(count('DUE_TODAY'), 'task', 'tasks') },
      { label: 'Not yet due', value: plural(count('NOT_YET_DUE'), 'task', 'tasks') },
      { label: 'Open claims with no next action', value: plural(breakers.breaking.length, 'claim', 'claims'), flag: breakers.breaking.length > 0, href: '/staff/next-actions' },
    ],
    apart: count('NO_DUE_DATE') > 0 ? [`${plural(count('NO_DUE_DATE'), 'open task has', 'open tasks have')} no due date — counted apart, never as on time`] : [],
    basis: 'Every open task, overdue or not against today’s UK date — never a UTC comparison — and the claims the one-next-action list shows breaking the rule.',
  };
}

function outstandingClientRequests(c: Ctx): Built {
  const rows = c.db.all<{ id: string; business_id: string; kind: string; due_on: string | null; sent_to_portal_at: string | null }>(
    "SELECT id, business_id, kind, due_on, sent_to_portal_at FROM client_tasks WHERE state = 'OPEN' ORDER BY due_on IS NULL, due_on ASC",
  );
  const questions = rows.filter((r) => r.kind === 'QUESTION' && can(c.actor, 'organisation.read', { type: 'business', id: r.business_id }));
  const requests = rows.filter((r) => r.kind === 'DOCUMENT'
    && can(c.actor, 'document_request.read', { type: 'document_request', id: r.id, business_id: r.business_id }));
  const overdue = (xs: typeof rows): number => xs.filter((r) => dueReading(r.due_on, c.nowIso).overdue).length;
  const undated = questions.filter((r) => r.due_on === null).length + requests.filter((r) => r.due_on === null).length;
  const unsent = questions.filter((r) => r.sent_to_portal_at === null).length;
  return {
    lines: [
      { label: 'Questions waiting on a client', value: `${plural(questions.length, 'question', 'questions')} · ${overdue(questions)} overdue`, flag: overdue(questions) > 0 },
      { label: 'Documents asked for and not arrived', value: `${plural(requests.length, 'request', 'requests')} · ${overdue(requests)} overdue`, flag: overdue(requests) > 0 },
    ],
    apart: [
      ...(undated > 0 ? [`${plural(undated, 'of them has', 'of them have')} no due date — counted apart, never as on time`] : []),
      ...(unsent > 0 ? [`${plural(unsent, 'question has', 'questions have')} not been sent to the client’s portal yet — those wait on us, not on the client`] : []),
    ],
    basis: 'Every open question and every document request still waiting, overdue or not by the UK date.',
  };
}

function compliance(c: Ctx): Built {
  const rights = rightsRegister(c.db, c.actor).filter((r) => r.next_deadline !== 'closed')
    .sort((a, b) => (/^\d/.test(a.next_deadline) ? a.next_deadline : '9') < (/^\d/.test(b.next_deadline) ? b.next_deadline : '9') ? -1 : 1);
  const complaints = complaintsLog(c.db, c.actor).filter((x) => x.ack_in_time === 'not acknowledged yet' && x.status !== 'CLOSED');
  const breaches = breachRegister(c.db, c.actor, c.nowIso).filter((b) => b.status !== 'CLOSED');
  const inside = breaches.filter((b) => /\d+ hours left/.test(b.clock));
  const passed = breaches.filter((b) => /PASSED WITH NO DECISION RECORDED/.test(b.clock));
  const unclassified = breaches.filter((b) => /not yet given/.test(b.clock));
  return {
    lines: [
      ...rights.map((r) => ({
        label: `Rights request ${r.ref}`, value: `next deadline ${r.next_deadline}`, href: `/staff/compliance/rights/${r.id}`,
        flag: /^\d/.test(r.next_deadline) && r.next_deadline <= c.today,
      })),
      ...complaints.map((x) => ({ label: `Complaint ${x.ref}`, value: `awaiting acknowledgement — by ${x.ack_deadline}`, href: `/staff/compliance/complaints/${x.id}`, flag: x.ack_deadline <= c.today })),
      ...inside.map((b) => ({ label: `Breach ${b.ref}`, value: 'inside its 72 hours', href: `/staff/compliance/breaches/${b.id}`, flag: true })),
      ...passed.map((b) => ({ label: `Breach ${b.ref}`, value: 'the 72 hours have passed with no decision recorded', href: `/staff/compliance/breaches/${b.id}`, flag: true })),
      ...(rights.length + complaints.length + inside.length + passed.length === 0 ? [{ label: 'Nothing waiting', value: 'no open rights request, unacknowledged complaint or breach inside its clock' }] : []),
    ],
    apart: unclassified.length > 0
      ? [`${plural(unclassified.length, 'breach entry is', 'breach entries are')} not yet classified by the data protection officer — the 72 hours are shown on the entry as a conditional reading, never as running or not`] : [],
    basis: 'Read from the rights register, the complaints log and the breach register themselves — never a count of its own. The earliest deadline first.',
  };
}

function myJobs(c: Ctx): Built {
  const jobs = c.db.all<{ id: string; business_id: string; surveyor_id: string | null; state: string; claim_id: string | null; claim_ref: string | null; stage: string | null }>(
    'SELECT j.id, j.business_id, j.surveyor_id, j.state, cl.id AS claim_id, cl.claim_ref, cl.stage FROM surveyor_jobs j ' +
      'LEFT JOIN claims cl ON cl.id = j.claim_id WHERE j.surveyor_id = ? ORDER BY j.created_at ASC, j.id ASC',
    [c.actor.id],
  ).filter((j) => can(c.actor, 'surveyor_job.read', { type: 'surveyor_job', id: j.id, business_id: j.business_id, surveyor_id: j.surveyor_id }));
  return {
    lines: jobs.length === 0 ? [{ label: 'Survey jobs', value: 'No survey job is assigned to you.' }] : jobs.map((j) => ({
      label: j.claim_id === null ? 'a job not yet on a claim' : claimWords(c.db, j.claim_id),
      value: `${j.stage === null ? 'no stage' : anyStageLabel(j.stage)} · ${j.state === 'SEALED' ? 'waiting for your figures' : 'your figures are committed'}`,
      href: `/staff/survey/${j.id}`, flag: j.state === 'SEALED',
    })),
    apart: [],
    basis: 'The survey jobs assigned to you, each one you may open. No figure of ours is on this tile, for anyone.',
  };
}

/* ================================================================== *
 * 4 · THE TABLE — WHO SEES WHICH TILE IS DECIDED HERE, BY can()
 * ================================================================== */

export const TILES: readonly TileDef[] = Object.freeze([
  { key: 'open_pipeline_value', title: 'Open pipeline value', group: 'PIPELINE',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('claim.read_value', VALUE_OBJ)], build: openPipelineValue },
  { key: 'average_claim_value', title: 'Average claim value', group: 'PIPELINE',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('claim.read_value', VALUE_OBJ)], build: averageClaimValue },
  { key: 'won_and_completed', title: 'Won and completed claim value', group: 'PIPELINE', period: 'APPLIED',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('claim.read_value', VALUE_OBJ), ask('claim_figures.read', FIGURES_OBJ)], build: wonAndCompleted },
  { key: 'claims_by_stage', title: 'Claims by stage', group: 'PIPELINE', asks: [ask('pipeline.read', PIPELINE_OBJ)], build: claimsByStage },
  { key: 'claims_by_owner', title: 'Claims by owner', group: 'PIPELINE', asks: [ask('pipeline.read', PIPELINE_OBJ)], build: claimsByOwner },
  { key: 'claims_by_introducer', title: 'Claims by introducer', group: 'PIPELINE',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('introducer.read', INTRODUCER_OBJ)], build: claimsByIntroducer },
  { key: 'leads_by_source', title: 'Leads and conversion by source', group: 'PIPELINE', period: 'APPLIED', asks: [ask('lead.read', LEAD_OBJ)], build: leadsBySource },
  { key: 'days_to_completion', title: 'Days from lead to completion, and the bottleneck', group: 'PIPELINE', period: 'APPLIED',
    asks: [ask('pipeline.read', PIPELINE_OBJ)], build: daysToCompletion },
  { key: 'expected_completion', title: 'Expected to complete', group: 'PIPELINE', period: 'APPLIED', asks: [ask('pipeline.read', PIPELINE_OBJ)], build: expectedCompletion },
  { key: 'exits_and_lost', title: 'Exits and lost reasons', group: 'PIPELINE', period: 'APPLIED',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('lead.read', LEAD_OBJ)], build: exitsAndLost },
  { key: 'estimated_fees', title: 'Estimated fees in the pipeline', group: 'MONEY', asks: [ask('invoice.read', INVOICE_OBJ)], build: estimatedFees },
  { key: 'money', title: 'Invoiced, paid, outstanding and overdue', group: 'MONEY', period: 'APPLIED', asks: [ask('invoice.read', INVOICE_OBJ)], build: money },
  { key: 'reconciliation_cases', title: 'Estimate to outcome — the cases', group: 'RECONCILIATION',
    asks: [ask('claim_figures.read', FIGURES_OBJ)], build: reconciliationCases },
  { key: 'reconciliation_gaps', title: 'Estimate to outcome — the gaps', group: 'RECONCILIATION',
    asks: [ask('claim_figures.read', FIGURES_OBJ)], build: reconciliationGaps },
  { key: 'deliverables', title: 'Deliverables not issued', group: 'RECONCILIATION',
    asks: [ask('pipeline.read', PIPELINE_OBJ), ask('deliverable.read', DELIVERABLE_OBJ)], build: deliverables },
  { key: 'overdue_tasks', title: 'Overdue tasks', group: 'WORK',
    asks: [ask('staff_task.create', TASK_TEAM_OBJ), ask('pipeline.read', PIPELINE_OBJ)], build: overdueTasks },
  { key: 'outstanding_client_requests', title: 'Outstanding client questions and document requests', group: 'WORK',
    asks: [ask('organisation.read', ORGANISATION_OBJ), ask('document_request.read', REQUEST_OBJ)], build: outstandingClientRequests },
  { key: 'compliance', title: 'Compliance — the clocks that are running', group: 'COMPLIANCE',
    asks: [ask('compliance.read', COMPLIANCE_OBJ)], build: compliance },
  { key: 'my_jobs', title: 'My survey jobs', group: 'MY_JOBS', asks: [ask('surveyor_job.enter', SURVEY_OBJ)], build: myJobs },
] as TileDef[]);

export const GROUP_TITLES: Readonly<Record<TileGroup, string>> = Object.freeze({
  PIPELINE: 'The pipeline',
  MONEY: 'The money',
  RECONCILIATION: 'Estimate to outcome, and what is still to issue',
  WORK: 'Work waiting',
  COMPLIANCE: 'Compliance',
  MY_JOBS: 'My survey jobs',
});

export function assertDashboard(actor: Actor): void {
  authorise(actor, 'dashboard.enter', DASHBOARD_OBJ);
}

/** The tiles this actor may be drawn, by the rule table alone. Exported so a test can assert it per role. */
export function tilesFor(actor: Actor): readonly TileKey[] {
  return TILES.filter((t) => t.asks.every((a) => can(actor, a.action, a.object))).map((t) => t.key);
}

/**
 * THE DASHBOARD, READ NOW. `nowIso` is passed rather than read so a test can stand the reading on any UK day —
 * and overdue, this month and this quarter all follow that day, never the UTC one.
 */
export function dashboard(db: Db, actor: Actor, nowIso: string, period: Period = NO_PERIOD, said: readonly string[] = []): Dashboard {
  assertDashboard(actor);
  const ctx: Ctx = { db, actor, nowIso, today: localDate(nowIso), period };
  const allowed = new Set(tilesFor(actor));
  return {
    today: ctx.today,
    tiles: TILES.filter((t) => allowed.has(t.key)).map((t) => {
      const built = t.build(ctx);
      const applies = t.period === 'APPLIED';
      return {
        key: t.key, title: t.title, group: t.group, asks: t.asks.map((a) => a.action), ...built,
        basis: period.key === 'NONE' ? built.basis : `${built.basis} ${applies ? PERIOD_APPLIED : PERIOD_AS_AT}`,
        period: applies ? 'APPLIED' as const : 'AS_AT_TODAY' as const,
      };
    }),
    note: 'Every figure here is read from the records on this request; nothing on this page is stored, and a figure nobody can know yet is said, not shown as nought.',
    period, said,
  };
}

/** Unused-import guard for the terminal-stage reading the pipeline tiles share with the task lists. */
void isTerminalStage;
