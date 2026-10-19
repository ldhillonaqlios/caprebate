/**
 * THE ACCOUNTING VIEW — routes and rendering. Block F, part four; extended by
 * CRM 7 of 10, 11 September 2026, with finance on the claim.
 *
 * Same shape as `handleEngaged` and `handleSurveyor`: 'not-mine' for anything
 * it does not own. The three rules from router.ts apply unchanged.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/finance.ts (an organisation's invoices
 * from before), src/web/invoices.ts (a claim's), src/web/vat.ts and
 * src/web/fee-controls.ts do every authorisation and every derivation; this
 * draws what they return. In particular the fee-versus-benefit comparison is
 * rendered exactly as the engine computed it, including its three-valued answer;
 * a due date nobody set is drawn as UNSET; and a blank in the engagement letter is
 * drawn as BLANK, in capitals.
 *
 * NO AMOUNT OF AN INVOICE IS A FIELD ON ANY FORM HERE. The one amount a person
 * types is the money that arrived, which is a record of what they saw.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { claimRef, recordTabs } from './components.ts';
import { kpiRow, lateBadge, noDateBadge } from './look.ts';
import { setSubMenu } from './navigation.ts';
import * as F from './finance.ts';
import * as I from './invoices.ts';
import * as V from './vat.ts';
import { piecesPage } from './upload-pieces.ts';

export type WebResult = 'handled' | 'not-mine';

export type FinanceDeps = {
  app: App;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

function html(res: ServerResponse, status: number, body: string): void {
  // PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.
  const pp = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, pp.headers);
  res.end(pp.body);
}

function json(res: ServerResponse, body: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

const SAVED: Readonly<Record<string, string>> = Object.freeze({
  status: 'Recorded.',
  raised: 'The invoice is raised, with the next number in the series.',
  sent: 'Recorded as sent.',
  cancel: 'Cancelled. Its number stays in the series, recorded as cancelled.',
  'credit-in-full': 'The credit note is issued, with the next number in the series.',
  'credit-clause-13': 'The clause 13 credit note is issued, with the next number in the series.',
  received: 'Recorded as received. Nothing was collected: this is a record of what arrived.',
  voided: 'The record of money received is voided, and kept.',
  vat: 'The VAT check has run. It changed no invoice.',
  setting: 'The finance setting is recorded, with its date and its source.',
});

export async function handleFinance(
  d: FinanceDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const deps: F.FinanceDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now };
  const ideps: I.InvoiceDeps = { ...deps, newId: randomUUID };
  const saved = url.searchParams.get('saved') ?? undefined;

  if (path === '/staff/finance' && method === 'GET') {
    const dashboard = I.financeDashboard(d.app.db, actor, d.app.now());
    html(res, 200, listPage(d, actor, F.summary(d.app.db, actor), dashboard, saved));
    return 'handled';
  }

  if (path === '/staff/finance/view.json' && method === 'GET') {
    json(res, I.financeDashboard(d.app.db, actor, d.app.now()));
    return 'handled';
  }

  if (path === '/staff/finance/vat-check' && method === 'POST') {
    V.runVatCheck(ideps, actor);
    redirect(res, '/staff/finance?saved=vat#vat');
    return 'handled';
  }

  if (path === '/staff/finance/settings' && method === 'POST') {
    const f = await form(req);
    const r = V.recordSetting(ideps, actor, Object.fromEntries(f.entries()));
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, '/staff/finance');
    redirect(res, '/staff/finance?saved=setting#settings');
    return 'handled';
  }

  const raise = /^\/staff\/finance\/claims\/([A-Za-z0-9-]+)\/raise$/.exec(path);
  if (raise && method === 'POST') {
    const f = await form(req);
    const r = I.raiseInvoice(ideps, actor, raise[1] ?? '', Object.fromEntries(f.entries()));
    if (!r.ok) return d.problem(res, actor, 'Not raised', r.why, '/staff/finance', r.field);
    redirect(res, `/staff/finance/${r.id}?saved=raised`);
    return 'handled';
  }

  const voided = /^\/staff\/finance\/received\/([A-Za-z0-9-]+)\/void$/.exec(path);
  if (voided && method === 'POST') {
    const f = await form(req);
    const r = I.voidReceived(ideps, actor, voided[1] ?? '', Object.fromEntries(f.entries()));
    if (!r.ok) return d.problem(res, actor, 'Not voided', r.why, '/staff/finance', r.field);
    redirect(res, `/staff/finance/${r.id}?saved=voided`);
    return 'handled';
  }

  const one = /^\/staff\/finance\/([A-Za-z0-9-]+)$/.exec(path);
  if (one && method === 'GET') {
    F.assertFinanceSection(actor);
    const id = one[1] ?? '';
    html(res, 200, I.isClaimInvoice(d.app.db, id)
      ? claimInvoicePage(d, actor, I.claimInvoiceById(d.app.db, actor, id, d.app.now()), saved)
      : invoicePage(d, actor, F.invoiceById(d.app.db, actor, id)));
    return 'handled';
  }

  const act = /^\/staff\/finance\/([A-Za-z0-9-]+)\/(sent|cancel|credit-in-full|credit-clause-13|received)$/.exec(path);
  if (act && method === 'POST') {
    const id = act[1] ?? '';
    const fields = Object.fromEntries((await form(req)).entries());
    const r = act[2] === 'sent' ? I.markSent(ideps, actor, id, fields)
      : act[2] === 'cancel' ? I.cancelInvoice(ideps, actor, id, fields)
        : act[2] === 'credit-in-full' ? I.creditInFull(ideps, actor, id, fields)
          : act[2] === 'credit-clause-13' ? I.creditClause13(ideps, actor, id, fields)
            : I.recordReceived(ideps, actor, id, fields);
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `/staff/finance/${id}`, r.field);
    redirect(res, `/staff/finance/${id}?saved=${act[2] ?? 'status'}`);
    return 'handled';
  }

  const set = /^\/staff\/finance\/([A-Za-z0-9-]+)\/status$/.exec(path);
  if (set && method === 'POST') {
    const id = set[1] ?? '';
    const f = await form(req);
    const r = F.setStatuses(deps, actor, id, {
      invoice_status: f.get('invoice_status') ?? '',
      payment_status: f.get('payment_status') ?? '',
    });
    if (!r.ok) return d.problem(res, actor, 'Not recorded', r.why, `/staff/finance/${id}`, r.field);
    redirect(res, `/staff/finance/${id}?saved=status`);
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * THE LIST — the dashboard, the VAT reading, the claims awaiting an
 * invoice, the claims' invoices, the controls, the settings, the fees to
 * firms, and an organisation's invoices from before
 * ------------------------------------------------------------------ */

/**
 * THE THREE-VALUED ANSWER, IN WORDS.
 *
 * `null` IS NOT "no" AND IS NOT A BLANK. It is the engine declining to assert
 * something it has not established — the fee falls inside a range of possible
 * benefits, so on this client's facts it might exceed the year-one benefit and
 * might not. Saying "no" there would be the screen answering a question the
 * model refused.
 */
function verdictCell(v: boolean | null): Safe {
  if (v === true) return h`<strong>yes</strong>`;
  if (v === false) return h`no`;
  return h`<span class="help">cannot say</span>`;
}

function vatBlock(v: V.VatReading): Safe {
  return h`
    ${v.warning === null ? raw('') : h`<div class="gate"><strong>VAT WARNING.</strong> ${v.warning}</div>`}
    <table><tbody>
      <tr><th>The threshold</th><td>${v.threshold === null ? h`<strong>Not set</strong> — the monitoring cannot say` : h`${v.threshold.shown}, in effect from ${v.threshold.effective_from} — ${v.threshold.source}`}</td></tr>
      <tr><th>The warning starts at</th><td>${v.warning_from === null ? h`<strong>Not set</strong>` : h`${v.warning_from.shown} — ${v.warning_from.source}`}</td></tr>
      <tr><th>The rolling twelve months</th><td>${v.rolling.turnover}: ${V.BAND_WORDS[v.rolling.band]}. <span class="help">${v.rolling.basis}.</span></td></tr>
      <tr><th>The thirty-day test</th><td>${v.forward.expected}: ${V.BAND_WORDS[v.forward.band]}. <span class="help">${v.forward.basis}.</span></td></tr>
      <tr><th>One large fee</th><td>${v.trigger === null ? h`<strong>Not set</strong>` : v.single_engagements.length === 0
        ? h`none at or over ${v.trigger.shown}` : h`${v.single_engagements.map((s) => h`${s.expected} ${claimRef(s.claim_ref)} `)}`}</td></tr>
    </tbody></table>
    <p class="help">${v.never_changes_an_invoice}</p>`;
}

function controlsBlock(c: I.FinanceDashboard['controls']): Safe {
  return h`
    <table><tbody>
      <tr><th>Our fee above the client’s first-year saving</th><td>${c.readings.above_benefit}</td></tr>
      <tr><th>A minimum fee</th><td>${c.readings.minimum_fee}</td></tr>
      <tr><th>A multi-site discount</th><td>${c.readings.multi_site_discount}</td></tr>
      <tr><th>The break fee and the abort fee</th><td>${c.readings.break_and_abort}</td></tr>
      <tr><th>A minimum job size</th><td>${c.no_minimum_job_size}</td></tr>
    </tbody></table>
    <h3>What the engagement letter says</h3>
    <table><tbody>
      <tr><th>The break fee (clause 5)</th><td><strong>${c.letter.break_fee}</strong></td></tr>
      <tr><th>The abort fee (clause 4)</th><td><strong>${c.letter.abort_fee}</strong></td></tr>
      <tr><th>The payment terms (clause 4)</th><td><strong>${c.letter.payment_terms}</strong></td></tr>
    </tbody></table>
    ${c.any_blank
      ? h`<div class="gate"><strong>A term in the engagement letter is BLANK. We show it blank on purpose.</strong> A made-up number here could end up in a contract.</div>`
      : raw('')}`;
}

function settingsBlock(v: I.FinanceDashboard): Safe {
  return h`
    <table><thead><tr><th>Setting</th><th>In effect</th><th>From</th><th>Source</th></tr></thead>
      <tbody>${v.settings.current.map((s) => h`<tr><td>${s.label}</td>
        <td>${s.setting === null ? h`<strong>Not set</strong>` : s.setting.value}</td>
        <td>${s.setting?.effective_from ?? ''}</td><td>${s.setting?.source ?? ''}</td></tr>`)}</tbody></table>
    ${v.may_record_setting ? h`
      <form method="post" action="/staff/finance/settings">
        <p class="help">A new value is a new row, with the day it takes effect and where it came from. Nothing is changed in place.</p>
        <p><label for="setting">Setting</label>
          <select id="setting" name="setting">${Object.entries(V.SETTINGS).map(([k, label]) => h`<option value="${k}">${label}</option>`)}</select></p>
        <p><label for="value">Value — pounds, a share such as 0.75, or REGISTERED / NOT_REGISTERED</label><input id="value" name="value"></p>
        <p><label for="effective_from">Takes effect</label><input id="effective_from" name="effective_from" type="date"></p>
        <p><label for="source">Source</label><input id="source" name="source"></p>
        <p><button type="submit">Record the setting</button></p>
      </form>` : raw('')}`;
}

/** UI TIDY PHASE 12: Finance's sections in the left-hand menu, with how many invoices each list holds. */
export function financeMenu(invoices: number, earlier: number): { href: string; label: string; note?: string }[] {
  return [
    { href: '/staff/finance#invoices', label: 'Invoices', ...(invoices > 0 ? { note: String(invoices) } : {}) },
    { href: '/staff/finance#money', label: 'Money by month' },
    { href: '/staff/finance#vat', label: 'VAT' },
    { href: '/staff/finance#fees', label: 'Fee controls and firms' },
    { href: '/staff/finance#settings', label: 'Finance settings' },
    { href: '/staff/finance#earlier', label: 'Earlier invoices', ...(earlier > 0 ? { note: String(earlier) } : {}) },
  ];
}

/** UI TIDY PHASE 12: the red box's label, "Late, on 1 invoice" or "Late, on 2 invoices". */
export function lateBoxLabel(n: number): string {
  return `Late, on ${String(n)} invoice${n === 1 ? '' : 's'}`;
}

/** UI TIDY PHASE 12: one line naming every claim ready to invoice, and Raise our fee where the login may raise one. */
export function readyLine(claims: readonly Pick<I.FinanceDashboard['expected']['claims'][number], 'client_name' | 'claim_ref' | 'may_raise'>[]): Safe {
  if (claims.length === 0) return raw('');
  return h`<p class="readyline"><strong>Ready to invoice:</strong> ${claims.map((c, i) => h`${i === 0 ? raw('') : raw(', ')}${c.client_name} ${claimRef(c.claim_ref)}`)}${
    claims.some((c) => c.may_raise) ? h` <a class="btn btn-primary" href="#to-invoice">Raise our fee</a>` : raw('')}</p>`;
}

/** UI TIDY PHASE 12: an invoice's Due cell. Late is a red label; no due date a grey one; on time the words. */
export function invoiceDue(i: { due_on: string | null; money: { overdue: boolean; due: { label: string } } }): Safe {
  if (i.due_on === null) return noDateBadge('No due date set yet');
  return i.money.overdue ? lateBadge(i.money.due.label) : h`${i.money.due.label}`;
}

/**
 * PHASE 133b — FINANCE ON TABS. The eight numbered sections keep their numbers and their words, and each heading now has
 * an id, so a link can land on one (Accounting's home cards do). They are grouped into six tabs, by the job a person comes
 * to do: the money; VAT; invoices (what is waiting to be invoiced, and what is invoiced); the fee controls and the fees
 * to firms; the settings; and the organisations' invoices from before. Every section is on the page, drawn from the same
 * two views as before, whichever tab is showing. The three closing notes sit with the section they are about.
 *
 * UI TIDY PHASE 12 (3 October 2026): the right-hand panel is gone. Its three links were said again at the top (Raise our
 * fee, Run the VAT check) and in the left-hand menu (Finance settings), and it pushed the invoices table sideways on a
 * laptop. Four boxes count the money; a line names every claim ready to invoice; invoices open first; each claim's
 * number sits under its company instead of in a column of its own; a late invoice is a red label.
 */
function listPage(
  d: FinanceDeps, actor: Actor, s: F.FinanceSummary, v: I.FinanceDashboard, saved: string | undefined,
): string {
  const pct = Math.round(s.fee_rate * 1000) / 10;
  // UI TIDY PHASE 12: Finance's sections in the left-hand menu, opening out under Finance; on a laptop they replace the
  // row of tabs (`financepage`), and on a phone the tabs stay.
  setSubMenu({ items: financeMenu(v.invoices.length, s.rows.length) });
  return page({
    title: 'Finance', nav: d.nav(actor), wide: true,
    body: h`<div class="financepage">
      ${saved === undefined ? raw('') : h`<div class="gate">${SAVED[saved] ?? 'Recorded.'}</div>`}
      <div class="pagehead"><div><h1>Finance</h1>
        <p class="lede">Cap Rebate’s own fees, and whether each is invoiced and paid. Not the client’s tax affairs, and not their accountant’s papers.</p></div>
        <p>${v.expected.claims.some((c) => c.may_raise) ? h`<a class="btn btn-primary" href="#to-invoice">Raise our fee</a> ` : raw('')}<a class="btn" href="#vat-check">Run the VAT check</a></p></div>
      ${kpiRow([
        { label: 'Invoiced', value: v.totals.invoiced, tone: 'total', href: '#claim-invoices' },
        { label: 'Received', value: v.totals.received, tone: 'money', href: '#claim-invoices' },
        { label: 'Still owed', value: v.totals.outstanding, tone: 'warn', href: '#claim-invoices' },
        { label: lateBoxLabel(v.totals.overdue_count), value: v.totals.overdue, tone: v.totals.overdue_count > 0 ? 'late' : 'plain', href: '#claim-invoices' },
      ])}
      ${readyLine(v.expected.claims)}
      <p class="help">${v.recorded_not_collected}</p>

      ${recordTabs([
        { id: 'invoices', label: 'Invoices', count: v.invoices.length, body: h`
      <h2 id="to-invoice">Claims at the invoice stage with no invoice raised</h2>
      ${v.expected.claims.length === 0 ? h`<p class="help">No claim is waiting at the invoice stage.</p>` : h`
        <p class="help">Expected ${v.expected.total}${v.expected.without_a_fee > 0 ? h`; ${v.expected.without_a_fee} whose fee cannot be computed, counted apart` : raw('')}.
          Each claim’s finance task was made when it reached the invoice stage. We never make a second one.</p>
        <table><thead><tr><th>Company</th><th>At the invoice stage since</th><th>Expected fee</th><th>Earned on</th><th>Finance task</th><th></th></tr></thead>
          <tbody>${v.expected.claims.map((c) => h`<tr><td>${c.client_name}<br>${claimRef(c.claim_ref)}</td><td>${c.entered_invoice_on}</td><td>${c.expected}</td>
            <td>${c.expected_on === null ? h`<strong>NO DATE</strong><br><span class="help">${c.expected_on_reading}</span>` : h`${c.expected_on}${c.due_if_invoiced_on_delivery === null ? raw('') : h`<br><span class="help">due ${c.due_if_invoiced_on_delivery} if invoiced that day</span>`}`}</td>
            <td>${c.finance_task === null ? h`<span class="help">none recorded</span>` : h`${c.finance_task.title} — ${c.finance_task.due.label}`}</td>
            <td>${c.may_raise ? h`<form method="post" action="/staff/finance/claims/${c.claim_id}/raise"><input type="hidden" name="kind" value="FEE">
              <button type="submit">Raise our fee</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}

      <h2 id="claim-invoices">The claims’ invoices</h2>
      ${v.invoices.length === 0 ? h`<p class="help">No invoice is raised on any claim.</p>` : h`
        <table><thead><tr><th>Company</th><th>Number</th><th>For</th><th>Date</th><th>Amount</th><th>VAT</th><th>Invoice</th><th>Money</th><th>Outstanding</th><th>Due</th></tr></thead>
          <tbody>${v.invoices.map((i) => h`<tr><td>${i.client_name}<br>${claimRef(i.claim.claim_ref)}</td><td><a href="/staff/finance/${i.id}">${i.number ?? 'unnumbered'}</a></td>
            <td>${i.kind.label}</td><td>${i.invoice_date}</td><td>${i.fee}</td><td>${i.vat}</td><td>${i.state.label}</td>
            <td>${i.money.label}</td><td>${i.money.outstanding}</td>
            <td>${invoiceDue(i)}</td></tr>`)}</tbody></table>`}

` },
        { id: 'money', label: 'Money', body: h`
      <h2 id="money-by-month">The money, by month</h2>
      <p class="help">Invoiced ${v.totals.invoiced}; credit notes ${v.totals.credited}; received ${v.totals.received};
        outstanding ${v.totals.outstanding}; overdue ${v.totals.overdue} on ${v.totals.overdue_count} invoice${v.totals.overdue_count === 1 ? '' : 's'}.
        ${v.totals.without_a_due_date} open invoice${v.totals.without_a_due_date === 1 ? ' has' : 's have'} no due date — not overdue, and not on time either.</p>
      <table><thead><tr><th>Month</th><th>Invoiced</th><th>Credit notes</th><th>Received</th><th>Fees expected from claims at the invoice stage</th></tr></thead>
        <tbody>${v.months.map((m) => h`<tr><td>${m.month}</td><td>${m.invoiced}</td><td>${m.credited}</td><td>${m.received}</td><td>${m.expected}</td></tr>`)}</tbody></table>

      <div class="gate">${s.no_payments_note}</div>` },
        { id: 'vat', label: 'VAT', body: h`
      <h2 id="vat-monitoring">VAT monitoring</h2>
      ${vatBlock(v.vat)}
      <form method="post" action="/staff/finance/vat-check" id="vat-check"><p><button type="submit">Run the VAT check</button></p></form>

      <div class="gate">${s.vat_note}</div>` },
        { id: 'fees', label: 'Fee controls and firms', body: h`
      <h2 id="fee-controls">The fee controls, and what the engagement letter says</h2>
      ${controlsBlock(v.controls)}

      <h2 id="introducer-fees">Fees to introducing firms</h2>
      <p class="help">Model B’s fees — recorded, never paid from this view. Nothing here takes or sends money.</p>
      ${v.introducer_fees.length === 0 ? h`<p class="help">No fee to a firm is recorded. The reward model is switched off.</p>` : h`
        <table><thead><tr><th>Firm</th><th>Claim</th><th>Amount</th><th>Disclosed</th><th>State</th></tr></thead>
          <tbody>${v.introducer_fees.map((f) => h`<tr><td>${f.firm.name}</td><td>${claimRef(f.claim.claim_ref)}</td><td>${f.amount}</td>
            <td>${f.disclosure.given ? f.disclosure.recorded ?? 'yes' : 'not yet'}</td><td>${f.state.label}</td></tr>`)}</tbody></table>`}

` },
        { id: 'settings', label: 'Finance settings', body: h`
      <h2 id="finance-settings">The finance settings</h2>
      ${settingsBlock(v)}

` },
        { id: 'earlier', label: 'Earlier invoices', count: s.rows.length, body: h`
      <h2 id="earlier-invoices">Older invoices, from before invoices were linked to a claim</h2>
      <p class="help">${s.rows.length} client${s.rows.length === 1 ? '' : 's'}.
        ${s.raised} invoiced, ${s.paid} paid in full, ${s.outstanding} outstanding. Their states were typed in by hand. None is moved onto a claim,
        because we never recorded which claim each was for.</p>
      ${s.rows.length === 0
        ? h`<p class="help">There are none.</p>`
        : h`<table><thead><tr>
            <th>Client</th><th>Claim value</th><th>Our fee</th><th>Invoice</th><th>Payment</th>
            <th>Fee exceeds their first-year saving</th></tr></thead>
          <tbody>${s.rows.map((r) => h`<tr>
            <td><a href="/staff/finance/${r.invoice_id}">${r.client_name}</a></td>
            <td>${r.claim_value}</td>
            <td>${r.fee}</td>
            <td>${r.invoice_label}</td>
            <td>${r.payment_label}</td>
            <td>${verdictCell(r.comparison.exceeds_year_one)}</td>
          </tr>`)}</tbody></table>`}

      <div class="gate"><strong>Our fee is ${pct}% of the allowances identified, not ${pct}% of the
        tax the client saves.</strong> On ${s.fee_exceeds_year_one} of these
        ${s.rows.length} clients it is more than the tax they would actually relieve in their first
        year${s.fee_undetermined > 0
          ? h`, and on ${s.fee_undetermined} we cannot tell either way from what we know`
          : raw('')}. The allowances are not lost — they carry on relieving tax in later years —
        but the fee falls due now. Open an invoice to see the sums.</div>

` },
      ])}</div>`,
  });
}

/* ------------------------------------------------------------------ *
 * THE COMPARISON — shared by both invoice pages
 * ------------------------------------------------------------------ */

function money(v: number | null): Safe {
  return v === null ? h`<span class="help">not established</span>` : h`£${v.toFixed(2)}`;
}

function pctOf(v: number | null): Safe {
  return v === null
    ? h`<span class="help">not established</span>`
    : h`${(Math.round(v * 10000) / 100).toFixed(2)}%`;
}

/**
 * PHASE 132f — the engine's no-claim threshold, beside the fee against the benefit. Marked for the tax adviser,
 * printing the figures, refusing nothing. UNDETERMINED says why and draws no verdict.
 */
function noClaimBlock(r: F.NoClaimReading): Safe {
  return h`<div class="gate"><strong>${r.for_the_tax_adviser}</strong>
    ${r.outcome === 'UNDETERMINED'
      ? h`<p>The no-claim threshold (relief after our fee below ${money(r.threshold)}) is <strong>not determined</strong>:
          ${r.why ?? 'no reason given'}.</p>`
      : h`<p>${r.outcome === 'BELOW_THRESHOLD'
          ? h`<strong>Below the no-claim threshold on every reading</strong> — we would not normally recommend making this claim; the client still chooses.`
          : h`At or above the no-claim threshold on every reading.`}</p>`}
    ${r.readings.length === 0 ? raw('') : h`<table><thead><tr><th>Computed at</th><th>Relief over the horizon</th><th>Our fee</th><th>Relief after our fee</th><th>Against ${money(r.threshold)}</th></tr></thead>
      <tbody>${r.readings.map((x) => h`<tr><td>${x.label}</td><td>${money(x.threshold.relief)}</td><td>${money(x.threshold.fee)}</td>
        <td>${money(x.threshold.relief_after_fee)}</td><td>${x.threshold.outcome === 'BELOW_THRESHOLD' ? 'below' : x.threshold.outcome === 'AT_OR_ABOVE_THRESHOLD' ? 'at or above' : 'not determined'}</td></tr>`)}</tbody></table>`}
  </div>`;
}

function comparisonBlock(c: F.FeeVersusBenefit, fee: string): Safe {
  return h`
      <h2>What the client actually gets back, against what we charge</h2>
      ${c.computed
        ? h`
          <p>Our fee is <strong>${fee}</strong>. Against the tax they would relieve:</p>
          <table><thead><tr>
            <th>Computed at</th><th>Rate</th><th>First-year saving</th><th>Over five years</th>
            <th>Fee exceeds the first year</th><th>Fee rate that would not</th></tr></thead>
            <tbody>${c.readings.map((x) => h`<tr>
              <td>${x.label}</td>
              <td>${pctOf(x.rate)}</td>
              <td>${x.comparison.determined
                ? money(x.comparison.year_one_benefit)
                : h`${money(x.comparison.year_one_benefit_range?.[0] ?? null)} to
                    ${money(x.comparison.year_one_benefit_range?.[1] ?? null)}`}</td>
              <td>${x.comparison.determined
                ? money(x.comparison.cumulative_benefit)
                : h`${money(x.comparison.cumulative_benefit_range?.[0] ?? null)} to
                    ${money(x.comparison.cumulative_benefit_range?.[1] ?? null)}`}</td>
              <td>${verdictCell(x.comparison.fee_exceeds_year_one_benefit)}</td>
              <td>${x.comparison.breakeven_fee_rate_year_one === null
                ? h`${pctOf(x.comparison.breakeven_fee_rate_year_one_range?.[0] ?? null)} to
                    ${pctOf(x.comparison.breakeven_fee_rate_year_one_range?.[1] ?? null)}`
                : pctOf(x.comparison.breakeven_fee_rate_year_one)}</td>
            </tr>`)}</tbody></table>

          <p><strong>Taking every reading together: ${c.exceeds_year_one === true
            ? h`our fee is more than their first-year saving on all of them.`
            : c.exceeds_year_one === false
              ? h`our fee is less than their first-year saving on all of them.`
              : h`the readings do not agree, so there is no answer to give — and that
                  disagreement is the finding.`}</strong></p>

          ${c.unknowns.length > 0
            ? h`<h3>What we do not know — shown as a range, not a guess</h3>
               <ul>${c.unknowns.map((u) => h`<li>${u}</li>`)}</ul>`
            : raw('')}
          ${c.assumptions.length > 0
            ? h`<h3>What we assumed</h3>
               <ul>${c.assumptions.map((a) => h`<li>${a}</li>`)}</ul>`
            : raw('')}`
        : h`<p class="help">The comparison cannot be computed for this client:
            ${c.why ?? 'no reason given'}.</p>
           <p class="help">That is a missing fact, not £0. We have not assumed anything
             to fill it.</p>`}

      ${noClaimBlock(c.recommendation_threshold)}

      <div class="gate"><strong>What we tell every client, whatever this client’s figures show:</strong> ${c.disclosure}</div>

      ${feeSwitchesBox(c.switches, c.amount_untouched)}`;
}

/**
 * PHASE 144a — THE FEE-CAP BOX READS THE TWO SWITCHES. It said "both are off" in fixed words whatever the switches
 * said; now each sentence is chosen by the switch it describes, so the words cannot disagree with the brackets.
 */
export function feeSwitchesBox(s: { readonly cap: boolean; readonly warn: boolean }, untouched: boolean): Safe {
  const state = s.cap && s.warn ? h`<strong>both are on</strong>`
    : s.cap ? h`<strong>the cap is on and the warning is off</strong>`
    : s.warn ? h`<strong>the warning is on and the cap is off</strong>`
    : h`<strong>both are off</strong>`;
  const head = untouched ? h`<strong>The fee above is not changed by any of this.</strong>`
    : h`<strong>The fee above is not the plain rate. A fee switch has changed it.</strong>`;
  const fee = untouched ? h`We show the comparison, but the fee is the plain rate, and this screen does not change it.`
    : h`We show the comparison. This screen does not change the fee itself.`;
  return h`<div class="gate">${head}
        We could cap the fee at the client’s first-year saving, or add a warning for this client.
        Each can be switched on, and ${state}
        (cap: ${s.cap ? 'on' : 'off'}; warning: ${s.warn ? 'on' : 'off'}).
        ${fee} Turning either on or off is a business decision for Lakhbir, not this screen.</div>`;
}

/* ------------------------------------------------------------------ *
 * A CLAIM'S INVOICE
 * ------------------------------------------------------------------ */

function claimInvoicePage(d: FinanceDeps, actor: Actor, v: I.ClaimInvoiceView, saved: string | undefined): string {
  return page({
    title: `${v.client_name} — invoice ${v.number ?? 'unnumbered'}`, nav: d.nav(actor), wide: true,
    body: h`
      <p class="eyebrow">Invoice ${v.number ?? 'unnumbered'}${v.number_cancelled ? h` <span class="help">(number recorded as cancelled)</span>` : raw('')}</p>
      <h1>${v.client_name}</h1>
      <p class="help">Raised ${v.raised}. ${claimRef(v.claim.claim_ref)}</p>
      ${saved === undefined ? raw('') : h`<div class="gate">${SAVED[saved] ?? 'Recorded.'}</div>`}

      <div class="pblock">
        <div class="pnum">The invoice</div>
        <table><tbody>
          <tr><th>For</th><td>${v.kind.label}</td></tr>
          <tr><th>Invoice date</th><td>${v.invoice_date}</td></tr>
          ${v.claim_figure === null ? raw('') : h`<tr><th>Claim value</th><td>${v.claim_figure}</td></tr>`}
          <tr><th>Amount</th><td><strong>${v.fee}</strong>${v.fee_rate === null ? raw('') : h` — ${v.fee_rate}`}</td></tr>
          <tr><th>VAT</th><td>${v.vat} — ${v.vat_position}</td></tr>
          <tr><th>State</th><td>${v.state.label}${v.sent_on === null ? raw('') : h`, on ${v.sent_on}`}</td></tr>
          <tr><th>Due</th><td>${v.due_on === null ? h`<strong>No due date set yet</strong> — ${v.due_basis.replace(/^UNSET — /, '')}` : h`${v.due_on} — ${v.money.due.label}`}</td></tr>
          <tr><th>How the amount was reached</th><td>${v.fee_basis}</td></tr>
          ${v.cancelled === null ? raw('') : h`<tr><th>Cancelled</th><td>${v.cancelled}</td></tr>`}
        </tbody></table>
      </div>
      ${v.fee_warning === null ? raw('') : h`<div class="gate"><strong>Warning written onto this invoice:</strong> ${v.fee_warning}</div>`}

      <div class="pblock">
        <div class="pnum">The money — from the records, never typed in</div>
        <table><tbody>
          <tr><th>Invoiced, with VAT</th><td>${v.money.total}</td></tr>
          <tr><th>Credit notes</th><td>${v.money.credited}</td></tr>
          <tr><th>Received</th><td>${v.money.received}</td></tr>
          <tr><th>Outstanding</th><td><strong>${v.money.outstanding}</strong> — ${v.money.label}</td></tr>
        </tbody></table>
      </div>
      ${v.money.unconfirmed_bank_details > 0
        ? h`<div class="gate"><strong>${v.money.unconfirmed_bank_details} record${v.money.unconfirmed_bank_details === 1 ? '' : 's'} of money received
            ha${v.money.unconfirmed_bank_details === 1 ? 's' : 've'} no note that the client checked our bank details another way than email.</strong>
            Never asked and not known count the same: neither means they checked.</div>`
        : raw('')}
      <div class="gate">${I.RECORDED_NOT_COLLECTED}</div>

      <h2>Credit notes</h2>
      ${v.credit_notes.length === 0 ? h`<p class="help">None.</p>` : h`<table><thead><tr><th>Number</th><th>Basis</th><th>Amount</th><th>VAT</th><th>Issued</th><th>Why</th><th>Recorded</th></tr></thead>
        <tbody>${v.credit_notes.map((c) => h`<tr><td>${c.number ?? ''}</td><td>${c.basis}</td><td>${c.amount}</td><td>${c.vat}</td><td>${c.issued_on}</td><td>${c.reason}</td><td>${c.recorded}</td></tr>`)}</tbody></table>`}

      <h2>Money recorded as received</h2>
      ${v.received.length === 0 ? h`<p class="help">None.</p>` : h`<table><thead><tr><th>Arrived</th><th>Amount</th><th>How</th><th>Our bank details</th><th>Recorded</th><th></th></tr></thead>
        <tbody>${v.received.map((p) => h`<tr><td>${p.received_on}</td><td>${p.amount}</td><td>${p.method}</td>
          <td>${p.confirmed_off_email ? p.bank_details : h`<strong>${p.bank_details}</strong>`}</td><td>${p.recorded}${p.voided === null ? raw('') : h` — ${p.voided}`}</td>
          <td>${p.voided === null && v.may.void_received
            ? h`<form method="post" action="/staff/finance/received/${p.id}/void"><input name="reason" placeholder="why it is voided" aria-label="Why it is voided">
                <button type="submit">Void</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}

      ${v.may.record_received ? h`
        <h2>Record money received</h2>
        <form method="post" action="/staff/finance/${v.id}/received">
          <p><label for="received_on">The day it arrived</label><input id="received_on" name="received_on" type="date"></p>
          <p><label for="amount">The amount that arrived, in pounds</label><input id="amount" name="amount"></p>
          <p>How: bank transfer — the only way we are paid.</p>
          <p><label for="bank">Did the client check our bank details another way than email?</label>
            <select id="bank" name="bank_details_confirmed">
              <option value="">not asked</option>
              ${Object.entries(I.BANK_CONFIRMATIONS).map(([k, label]) => h`<option value="${k}">${label}</option>`)}
            </select></p>
          <p><button type="submit">Record what arrived</button></p>
        </form>` : raw('')}

      ${v.may.send ? h`
        <h2>Record that it was sent</h2>
        <form method="post" action="/staff/finance/${v.id}/sent">
          <p><label for="sent_on">Sent on</label><input id="sent_on" name="sent_on" type="date"></p>
          <p class="help">Sent by hand, by post or as the client asked. This system does not email invoices. That waits on our invoice-fraud procedure.</p>
          <p><button type="submit">Record as sent</button></p>
        </form>` : raw('')}

      ${v.may.cancel ? h`
        <h2>Cancel — raised in error, and not sent</h2>
        <form method="post" action="/staff/finance/${v.id}/cancel">
          <p><label for="cancel_reason">Why</label><input id="cancel_reason" name="reason"></p>
          <p><button type="submit">Cancel the invoice</button></p>
        </form>` : raw('')}

      ${v.may.credit ? h`
        <h2>Credit notes — the only way a raised amount changes</h2>
        <form method="post" action="/staff/finance/${v.id}/credit-in-full">
          <p><label for="credit_reason">Why it is credited in full</label><input id="credit_reason" name="reason"></p>
          <p><button type="submit">Credit what is left in full</button></p>
        </form>
        ${v.kind.key === 'FEE' ? h`<form method="post" action="/staff/finance/${v.id}/credit-clause-13">
          <p class="help">Clause 13 recalculates the fee on a reduced figure. It is switched off, and the clause is blank in the letter.</p>
          <p><button type="submit">Apply clause 13</button></p>
        </form>` : raw('')}` : raw('')}

      ${v.comparison === null ? raw('') : comparisonBlock(v.comparison, v.fee)}

      <p><a href="/staff/finance">Back to finance</a></p>`,
  });
}

/* ------------------------------------------------------------------ *
 * AN ORGANISATION'S INVOICE FROM BEFORE
 * ------------------------------------------------------------------ */

const INVOICE_STATES: readonly F.InvoiceStatus[] = ['NOT_RAISED', 'RAISED', 'SENT', 'CREDITED'];
const PAYMENT_STATES: readonly F.PaymentStatus[] = ['UNPAID', 'PART_PAID', 'PAID', 'WRITTEN_OFF'];

function invoicePage(d: FinanceDeps, actor: Actor, r: F.FinanceRow): string {
  return page({
    title: r.client_name, nav: d.nav(actor), wide: true,
    body: h`
      <h1>${r.client_name}</h1>
      <p class="help">Invoice opened ${d.stamp(r.created_at)} — an older invoice, from before invoices were linked to a claim.</p>

      <div class="pblock">
        <div class="pnum">The money</div>
        <table><tbody>
          <tr><th>Claim value</th><td>${r.claim_value}</td></tr>
          <tr><th>Our fee</th><td><strong>${r.fee}</strong></td></tr>
          <tr><th>Invoice</th><td>${r.invoice_label}</td></tr>
          <tr><th>Payment</th><td>${r.payment_label}</td></tr>
          <tr><th>VAT</th><td>${r.vat_position}</td></tr>
        </tbody></table>
      </div>

      ${comparisonBlock(r.comparison, r.fee)}

      <h2>Record what happened</h2>
      <form method="post" action="/staff/finance/${r.invoice_id}/status">
        <p><label for="inv">Invoice</label>
          <select id="inv" name="invoice_status">
            ${INVOICE_STATES.map((s) => h`<option value="${s}"
              ${s === r.invoice_status ? raw('selected') : raw('')}>${F.INVOICE_WORDS[s]}</option>`)}
          </select></p>
        <p><label for="pay">Payment</label>
          <select id="pay" name="payment_status">
            ${PAYMENT_STATES.map((s) => h`<option value="${s}"
              ${s === r.payment_status ? raw('selected') : raw('')}>${F.PAYMENT_WORDS[s]}</option>`)}
          </select></p>
        <p><button type="submit">Record</button></p>
      </form>
      <div class="gate">${F.NO_PAYMENTS_NOTE}</div>

      <p><a href="/staff/finance">Back to the list</a></p>`,
  });
}
