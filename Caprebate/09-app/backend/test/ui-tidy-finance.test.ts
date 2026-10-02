/**
 * UI TIDY PHASE 12 — FINANCE, 3 October 2026 (src/web/finance-pages.ts).
 * Four boxes count the money; one line names every claim ready to invoice; invoices open first; the sections are in the
 * left-hand menu with their counts; each claim's number sits under its company; a late invoice is a red label. The
 * right-hand panel, which said the top's buttons again and pushed the invoices table sideways, is gone.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as I from '../src/web/invoices.ts';
import * as F from '../src/web/finance.ts';
import { financeMenu, lateBoxLabel, readyLine, invoiceDue } from '../src/web/finance-pages.ts';

let H: Harness;
before(async () => { H = await startHarness('uit12'); });
after(() => H.close());

const view = (): I.FinanceDashboard => I.financeDashboard(H.made.app.db, H.actor('accounting'), H.made.app.now());
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const kpis = (body: string): [string, string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-([a-z]+)" href="([^"]*)"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '', m[4] ?? '']);

describe('UI tidy phase 12: the top of Finance', () => {
  test('four boxes count the money from the same view the tables use; Late is red only when an invoice is late', async () => {
    const v = view();
    const body = (await H.get('accounting', '/staff/finance')).body;
    const n = v.totals.overdue_count;
    assert.ok(n > 0, 'the seed has a late invoice');
    assert.deepEqual(kpis(body), [
      ['total', '#claim-invoices', 'Invoiced', v.totals.invoiced],
      ['money', '#claim-invoices', 'Received', v.totals.received],
      ['warn', '#claim-invoices', 'Still owed', v.totals.outstanding],
      ['late', '#claim-invoices', `Late, on ${n} invoice${n === 1 ? '' : 's'}`, v.totals.overdue],
    ]);
  });

  test('one line names every claim ready to invoice, with Raise our fee for a login that may raise it', async () => {
    const v = view();
    assert.ok(v.expected.claims.length > 0, 'the seed has a claim at the invoice stage');
    const line = (body: string): string => /<p class="readyline">([\s\S]*?)<\/p>/.exec(body)?.[1] ?? '';
    const acc = line((await H.get('accounting', '/staff/finance')).body);
    assert.equal(acc.startsWith('<strong>Ready to invoice:</strong> '), true);
    for (const c of v.expected.claims) assert.ok(acc.includes(`${esc(c.client_name)} <span class="claimref">${c.claim_ref}</span>`), c.claim_ref);
    assert.equal(acc.includes('<a class="btn btn-primary" href="#to-invoice">Raise our fee</a>'), v.expected.claims.some((c) => c.may_raise));
    const ro = (await H.get('readonly', '/staff/finance'));
    if (ro.status === 200) assert.doesNotMatch(line(ro.body), /Raise our fee/);
  });

  test('the top’s buttons, and no right-hand panel saying them again', async () => {
    const body = (await H.get('accounting', '/staff/finance')).body;
    assert.match(body, /<div class="pagehead"><div><h1>Finance<\/h1>/);
    assert.match(body, /<a class="btn" href="#vat-check">Run the VAT check<\/a><\/p><\/div>/);
    assert.doesNotMatch(body, /<aside class="side"/);
    assert.doesNotMatch(body, /Quick actions/);
  });
});

describe('UI tidy phase 12: the sections', () => {
  test('invoices open first; the tabs and the left-hand menu list the same six sections, with their counts', async () => {
    const v = view();
    const s = F.summary(H.made.app.db, H.actor('accounting'));
    const body = (await H.get('accounting', '/staff/finance')).body;
    const rtabs = /<ul class="rtabs">([\s\S]*?)<\/ul>/.exec(body)?.[1] ?? '';
    const tabs = [...rtabs.matchAll(/<li><a href="#([a-z]+)">/g)].map((m) => m[1]);
    assert.deepEqual(tabs, ['invoices', 'money', 'vat', 'fees', 'settings', 'earlier']);
    assert.match(rtabs, /<a href="#settings">Finance settings</);
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    const sub = [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1] ?? '').matchAll(/<a href="([^"]+)">([^<]+)(?: <span class="subnote">(\d+)<\/span>)?<\/a>/g)]
      .map((m) => [m[1], m[2], m[3] ?? '']);
    assert.deepEqual(sub, [
      ['/staff/finance#invoices', 'Invoices', String(v.invoices.length)], ['/staff/finance#money', 'Money by month', ''],
      ['/staff/finance#vat', 'VAT', ''], ['/staff/finance#fees', 'Fee controls and firms', ''],
      ['/staff/finance#settings', 'Finance settings', ''], ['/staff/finance#earlier', 'Earlier invoices', s.rows.length > 0 ? String(s.rows.length) : ''],
    ]);
  });

  test('every invoice: its claim number under its company, no Reference column; late red, no due date grey', async () => {
    const v = view();
    const body = (await H.get('accounting', '/staff/finance')).body;
    const table = /<h2 id="claim-invoices">[\s\S]*?<\/table>/.exec(body)?.[0] ?? '';
    assert.doesNotMatch(table, /<th>Reference<\/th>/);
    for (const i of v.invoices) {
      const row = new RegExp(`<tr><td>[^<]*<br><span class="claimref">${i.claim.claim_ref}</span></td><td><a href="/staff/finance/${i.id}">[\\s\\S]*?</tr>`).exec(table)?.[0] ?? '';
      assert.ok(row.startsWith(`<tr><td>${esc(i.client_name)}<br>`), i.id);
      const due = /<td>((?:(?!<td>)[\s\S])*)<\/td><\/tr>$/.exec(row)?.[1] ?? '';
      if (i.due_on === null) assert.equal(due, '<span class="badge b-nodate">No due date set yet</span>', i.id);
      else if (i.money.overdue) assert.equal(due, `<span class="badge b-late">${esc(i.money.due.label)}</span>`, i.id);
      else assert.equal(due, esc(i.money.due.label), i.id);
    }
    assert.ok(v.invoices.some((i) => i.money.overdue), 'the seed has a late invoice to show red');
  });

  test('the claims waiting to be invoiced: the number under the company, no Reference column', async () => {
    const v = view();
    const body = (await H.get('accounting', '/staff/finance')).body;
    const table = /<h2 id="to-invoice">[\s\S]*?<\/table>/.exec(body)?.[0] ?? '';
    assert.doesNotMatch(table, /<th>Reference<\/th>/);
    for (const c of v.expected.claims) assert.ok(table.includes(`<tr><td>${esc(c.client_name)}<br><span class="claimref">${c.claim_ref}</span></td>`), c.claim_ref);
  });
});

describe('UI tidy phase 12: the pieces, on cases the seed does not hold', () => {
  test('the red box says “1 invoice” or “n invoices”', () => {
    assert.equal(lateBoxLabel(1), 'Late, on 1 invoice');
    assert.equal(lateBoxLabel(0), 'Late, on 0 invoices');
    assert.equal(lateBoxLabel(3), 'Late, on 3 invoices');
  });

  test('the ready line names every claim; Raise our fee only when one may be raised; nothing when none waits', () => {
    const two = [{ client_name: 'A & Co', claim_ref: 'CR-1', may_raise: false }, { client_name: 'B Ltd', claim_ref: 'CR-2', may_raise: true }];
    assert.equal(readyLine(two).html, '<p class="readyline"><strong>Ready to invoice:</strong> A &amp; Co <span class="claimref">CR-1</span>, B Ltd <span class="claimref">CR-2</span> <a class="btn btn-primary" href="#to-invoice">Raise our fee</a></p>');
    assert.doesNotMatch(readyLine(two.map((c) => ({ ...c, may_raise: false }))).html, /Raise our fee/);
    assert.equal(readyLine([]).html, '');
  });

  test('the menu counts invoices and earlier invoices only when there are some', () => {
    const notes = (a: number, b: number): (string | undefined)[] => financeMenu(a, b).map((i) => i.note);
    assert.deepEqual(notes(0, 0), [undefined, undefined, undefined, undefined, undefined, undefined]);
    assert.deepEqual(notes(3, 5), ['3', undefined, undefined, undefined, undefined, '5']);
  });

  test('the Due cell: no due date grey, late red, on time plain words', () => {
    const due = (due_on: string | null, overdue: boolean): string => invoiceDue({ due_on, money: { overdue, due: { label: 'Due 1 Oct <2026>' } } }).html;
    assert.equal(due(null, true), '<span class="badge b-nodate">No due date set yet</span>');
    assert.equal(due('2026-10-01', true), '<span class="badge b-late">Due 1 Oct &lt;2026&gt;</span>');
    assert.equal(due('2026-10-01', false), 'Due 1 Oct &lt;2026&gt;');
  });
});
