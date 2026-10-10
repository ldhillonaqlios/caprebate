/**
 * THE RETURN ENTRIES, YEAR BY YEAR, AS A SPREADSHEET BESIDE THE REPORT. PHASE 153b, 4 October 2026.
 *
 * Word question 121, "In what format would you like us to send our results?", for the accountant. Lakhbir: "Any
 * format". Our recommendation, built for the accountant to check: the signed PDF report (built on 2 October,
 * src/web/survey-report.ts) and BESIDE IT a small spreadsheet of what goes on each year's tax return, so nobody
 * retypes figures. Change it if the accountant names a format their software imports.
 *
 * ONE ROW PER ENTRY. The first return adds the qualifying spend to each pool; then, for five returns, the writing-down
 * allowance on each pool and the balance carried forward. The figures come from the approved version alone (its two
 * pools, after grants), and the rates and the year-by-year arithmetic are the engine's (CB_BENEFIT.schedule over
 * CB_RATES) — nothing is restated here.
 *
 * WHAT IT DOES NOT KNOW IT LEAVES BLANK AND SAYS WHY (N4). The main-pool rate turns on the accounting period (18%, or
 * 14% for periods from April 2026, with the straddle rule) and on whether the client is a company. Where the claim's
 * accounting period is not recorded, or the claimant type is not known and the two readings differ, the main-pool
 * rows carry no figure and their "How it is worked out" cell says what is missing. The special-rate pool's 6% is the
 * same for everyone and always given. No first-year allowance or annual investment allowance is assumed: the
 * client's accountant chooses those, and the last row says so.
 *
 * MADE AGAIN EVERY TIME, LIKE THE PDF — from the same facts once it has been sent. PHASE 159a (C29): the first time a
 * version's spreadsheet leaves us (emailed for sign-off, or its sign-off recorded) the claim's accounting period and
 * claimant type are kept with the version (`freezeReturnContext`, table return_entry_contexts), and every later copy of
 * that version is made from them (`returnContextFor`). Before then it reads the claim as it stands. Every cell is quoted
 * where it must be, and a cell that a spreadsheet would read as a formula is made plain text.
 */
import type { Db } from '../db.ts';
import type { Snapshot } from './pack-approve.ts';
import { acquisitionDateReading, latestFacts } from './claim-facts.ts';
import { claimantTypeForGate } from './crm.ts';
import { allowancesFor, isCompanyType, rateWords, RETURN_YEARS, type AllowanceFacts, type PartResult, type PoolName } from './allowances.ts';
import { cashBasis, purchasePeriod } from './claim-route.ts';

export { RETURN_YEARS };

export type ReturnContext = {
  /** The claim's accounting period the spend falls in, where recorded (claim facts ACCOUNTING_PERIOD_START / _END). */
  readonly period_start: string | null;
  /** True for a company, false for self assessment, null where the claimant type is not known. */
  readonly is_company: boolean | null;
  /** PHASE 159e: the facts the allowances turn on (src/web/allowances.ts). Absent on a version sent before, which reads
   *  as it did: no first-year relief is counted on a fact nobody recorded (N4). */
  readonly facts?: AllowanceFacts | null;
};

export type ReturnEntry = {
  readonly return_no: number;
  readonly period: string;
  readonly pool: 'Main pool' | 'Special rate pool' | 'Structures and buildings allowance' | 'All';
  readonly entry: string;
  /** In pence. Null where it cannot be worked out on what is known. */
  readonly amount_pence: number | null;
  readonly how: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The entries for each return, from an approved version and what the claim records about its period and claimant.
 *  PHASE 159e: worked out part by part by src/web/allowances.ts — each part in its own period (W1) or the first open
 *  one (W2), with its own first-year relief, the structures allowance and the dated rates. Where a part takes no
 *  first-year relief its row reads exactly as before ("Spend that counts, added to the pool"). */
export function returnEntries(s: Snapshot, ctx: ReturnContext): ReturnEntry[] {
  const a = allowancesFor(s, ctx);
  const out: ReturnEntry[] = [];
  const suffix = (what: string | null) => (what === null ? '' : `: ${what}`);
  const fromReport = (pool: PoolName, what: string | null) => what === null
    ? `From the approved survey report: the ${pool === 'Main pool' ? 'main pool' : 'special rate pool'}, after any grant.`
    : `From the approved survey report: the ${pool === 'Main pool' ? 'main pool' : 'special rate pool'} of ${what}${what === 'the purchase' ? ', after any grant' : ', on its own cost'}.`;
  const routeNote = (p: PartResult) => p.route === 'W2' ? ' Its own year’s return is closed (W2), so it goes into this year’s pool: writing-down allowances only.' : '';
  for (const per of a.periods) {
    const i = per.index;
    const period = per.label;
    const entering = a.parts.filter((p) => p.claimed && p.entry_index === i);
    const fromLast = a.parts.filter((p) => p.claimed && p.entry_index === i - 1);
    for (const pool of ['Main pool', 'Special rate pool'] as const) {
      const key = pool === 'Main pool' ? 'main' : 'special';
      for (const p of entering) {
        const amount = pool === 'Main pool' ? p.main_pence : p.special_pence;
        const rs = p.reliefs.filter((r) => r.pool === pool);
        if (rs.length === 0) {
          out.push({ return_no: i + 1, period, pool, entry: `Spend that counts, added to the pool${suffix(p.what)}`, amount_pence: amount,
            how: `${fromReport(pool, p.what)}${routeNote(p)}` });
          continue;
        }
        out.push({ return_no: i + 1, period, pool, entry: `Spend that counts${suffix(p.what)}`, amount_pence: amount, how: fromReport(pool, p.what) });
        for (const r of rs) out.push({ return_no: i + 1, period, pool, entry: `${r.name}${suffix(p.what)}`, amount_pence: r.pence, how: r.how });
        if (p.to_pool_now[key] > 0) {
          out.push({ return_no: i + 1, period, pool, entry: `Left after the first-year relief, added to the pool${suffix(p.what)}`, amount_pence: p.to_pool_now[key],
            how: 'What the annual investment allowance did not cover. It is written down from this year.' });
        }
      }
      for (const p of fromLast) {
        if (p.to_pool_next[key] > 0) {
          out.push({ return_no: i + 1, period, pool, entry: `Added to the pool from last year’s first-year allowance${suffix(p.what)}`, amount_pence: p.to_pool_next[key],
            how: 'The part the first-year allowance did not cover goes into the pool the year after.' });
        }
      }
    }
    for (const pool of ['Main pool', 'Special rate pool'] as const) {
      const x = per.pools[pool];
      const missing = pool === 'Main pool' ? `Not worked out. ${a.main_missing}` : 'Not worked out.';
      out.push({ return_no: i + 1, period, pool, entry: x.small ? 'Small pool written off' : 'Writing-down allowance', amount_pence: x.wda,
        how: x.wda === null || x.rate === null ? missing : x.small ? 'The balance is £1,000 or less, so all of it is claimed this year (s.56A).' : `${rateWords(x.rate)} of the balance on the pool.` });
    }
    for (const pool of ['Main pool', 'Special rate pool'] as const) {
      const x = per.pools[pool];
      out.push({ return_no: i + 1, period, pool, entry: 'Balance carried forward', amount_pence: x.cf,
        how: x.cf === null ? `Not worked out. ${pool === 'Main pool' ? a.main_missing : ''}`.trim() : 'The balance less the writing-down allowance.' });
    }
    for (const p of a.parts) {
      const v = p.sba.by_return[i];
      if (p.sba.applies === true && i >= p.entry_index && v !== 0) {
        out.push({ return_no: i + 1, period, pool: 'Structures and buildings allowance', entry: `Structures and buildings allowance${suffix(p.what)}`,
          amount_pence: v ?? null, how: v === null || v === undefined ? 'Not worked out: the accounting period or the rate is not known.' : p.sba.why });
      } else if (p.sba.applies === null && p.claimed && i === p.entry_index) {
        out.push({ return_no: i + 1, period, pool: 'Structures and buildings allowance', entry: `Structures and buildings allowance${suffix(p.what)}`,
          amount_pence: null, how: `Not worked out. ${p.sba.why}` });
      }
    }
    if (a.parts.some((p) => p.reliefs.length > 0 || p.sba.applies !== false)) {
      out.push({ return_no: i + 1, period, pool: 'All', entry: 'All the allowances in this return', amount_pence: per.total_pence,
        how: per.total_pence === null ? 'Not worked out: one of the figures above is not known.' : 'Add up the first-year relief, the two writing-down allowances and the structures allowance.' });
    }
  }
  return out;
}

/** One CSV cell: quoted where it must be, and never read by a spreadsheet as a formula. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The spreadsheet: a header, one row per entry, and two notes. Lines end CRLF, as RFC 4180 says. */
export function returnEntriesCsv(s: Snapshot, ctx: ReturnContext, fingerprint: string): string {
  const rows: string[][] = [['Return', 'Accounting period', 'Pool', 'Entry', 'Amount (£)', 'How it is worked out']];
  for (const e of returnEntries(s, ctx)) {
    rows.push([String(e.return_no), e.period, e.pool, e.entry,
      e.amount_pence === null ? '' : (e.amount_pence / 100).toFixed(2), e.how]);
  }
  rows.push(['', '', '', 'Note', '', 'Each part goes into the year its route names: its own year where that return can still be amended, or the first year still open. First-year relief is shown where the facts on the claim allow it. The accountant may choose less, for example to keep the annual investment allowance for other spend. Then these rows change.']);
  rows.push(['', '', '', 'Made from', '', `${s.business.name}, approved survey report version ${String(s.version)}, fingerprint ${fingerprint}`]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** What the claim records that the rows need: its accounting period's first day, whether the claimant is a company, and
 *  (PHASE 159e) the facts the allowances turn on. C15, L4 — ONE PERIOD SOURCE: the period is the one the amendment window
 *  reads (src/web/claim-route.ts purchasePeriod): as recorded, or from the client's checked year end. */
export function returnContext(db: Db, claim_id: string | null, business_id: string): ReturnContext {
  const t = claimantTypeForGate(db, business_id).value;
  const is_company = isCompanyType(t);
  if (claim_id === null) return { period_start: null, is_company, facts: { ...NO_FACTS_ON, claimant: t } };
  const c = db.get<{ property_id: string | null }>('SELECT property_id FROM claims WHERE id = ?', [claim_id]);
  const property_id = c?.property_id ?? null;
  const p = purchasePeriod(db, { id: claim_id, business_id, property_id });
  const facts = latestFacts(db, claim_id);
  const choice = (k: string): string | null => { const f = facts.get(k); return f !== undefined && f.answer === 'VALUE' ? f.value_text : null; };
  const pence = (k: string): number | null => { const f = facts.get(k); return f !== undefined && f.answer === 'VALUE' && typeof f.value_pence === 'number' ? f.value_pence : null; };
  const head = choice('AIA_HEADROOM');
  const amount = pence('AIA_HEADROOM_AMOUNT');
  const member = choice('PARTNERSHIP_HAS_COMPANY_MEMBER');
  const cash = cashBasis(db, { id: claim_id, business_id }).recorded;
  const acq = acquisitionDateReading(db, property_id);
  const sector = db.get<{ sector: string | null }>('SELECT sector FROM businesses WHERE id = ?', [business_id])?.sector ?? null;
  return {
    period_start: p?.start ?? null, is_company,
    facts: {
      claimant: t,
      company_member: member === 'YES' ? true : member === 'NO' ? false : null,
      cash_basis: cash,
      aia_headroom_pence: head === 'NONE' ? 0 : amount,
      new_from_developer: choice('BOUGHT_NEW_FROM_DEVELOPER') === 'YES' ? true : choice('BOUGHT_NEW_FROM_DEVELOPER') === 'NO' ? false : null,
      sba_statement: choice('SBA_STATEMENT_HELD') === 'YES' ? true : choice('SBA_STATEMENT_HELD') === 'NO' ? false : null,
      sba_purchase_pence: pence('SBA_QUALIFYING_EXPENDITURE'),
      purchase_date: acq.known && typeof acq.value === 'string' && ISO.test(acq.value) ? acq.value : null,
      residential: sector === null ? null : sector === 'supported_living',
    },
  };
}

const NO_FACTS_ON: AllowanceFacts = Object.freeze({
  claimant: null, company_member: null, cash_basis: null, aia_headroom_pence: null, new_from_developer: null,
  sba_statement: null, sba_purchase_pence: null, purchase_date: null, residential: null,
});

export const csvName = (company: string, version: number) =>
  `${company.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'client'}-return-entries-v${String(version)}.csv`;

/** PHASE 159a (C29): the facts a version's spreadsheet was first sent on, or null if it has not been sent. */
export function frozenReturnContext(db: Db, approval_id: string): ReturnContext | null {
  const r = db.get<{ period_start: string | null; is_company: number | null; facts_json: string | null }>(
    'SELECT period_start, is_company, facts_json FROM return_entry_contexts WHERE approval_id = ?', [approval_id]);
  if (r === undefined) return null;
  let facts: AllowanceFacts | null = null;
  try { facts = r.facts_json === null ? null : (JSON.parse(r.facts_json) as AllowanceFacts); } catch { facts = null; }
  return { period_start: r.period_start, is_company: r.is_company === null ? null : r.is_company === 1, facts };
}

/** Keep the facts a version's spreadsheet is sent on — once. A later call for the same version changes nothing. */
export function freezeReturnContext(db: Db, approval_id: string, ctx: ReturnContext, by: 'SENT_FOR_SIGNOFF' | 'SIGNOFF_RECORDED', at: string): ReturnContext {
  const start = ctx.period_start !== null && ISO.test(ctx.period_start) ? ctx.period_start : null;
  db.run('INSERT OR IGNORE INTO return_entry_contexts (approval_id, period_start, is_company, frozen_by, frozen_at, facts_json) VALUES (?, ?, ?, ?, ?, ?)',
    [approval_id, start, ctx.is_company === null ? null : ctx.is_company ? 1 : 0, by, at, ctx.facts === undefined || ctx.facts === null ? null : JSON.stringify(ctx.facts)]);
  return frozenReturnContext(db, approval_id) ?? ctx;
}

/** The facts a version's spreadsheet is made from: as first sent, or, before it has been sent, the claim as it stands. */
export function returnContextFor(db: Db, approval_id: string, claim_id: string | null, business_id: string): ReturnContext {
  return frozenReturnContext(db, approval_id) ?? returnContext(db, claim_id, business_id);
}

/** PHASE 159e: the facts a version's figures are made from, found from the version alone (the report and the portal
 *  have the approval, not the claim): as first sent, or the claim as it stands. */
export function contextForApproval(db: Db, approval_id: string): ReturnContext {
  const j = db.get<{ claim_id: string | null; business_id: string }>(
    'SELECT j.claim_id, j.business_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id WHERE a.id = ?', [approval_id]);
  return j === undefined ? { period_start: null, is_company: null, facts: null } : returnContextFor(db, approval_id, j.claim_id, j.business_id);
}
