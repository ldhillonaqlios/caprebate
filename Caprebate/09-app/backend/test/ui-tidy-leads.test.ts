/**
 * UI TIDY PHASE 5 — LEADS, 2 October 2026 (src/web/pipeline-pages.ts leadsHead, src/web/lead-cards.ts leadSectionCounts).
 * One heading with one line of counts and one main button; the sections' counts as solid boxes, each a link; every switch
 * on one row; the "Record a lead by hand" form folded until it is asked for, and still recording a lead.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import { RECORD_LEAD_HREF } from '../src/web/pipeline-pages.ts';
import { SITE_CSS } from '../src/web/assets.ts';

let H: Harness;
before(async () => { H = await startHarness('uit5'); });
after(() => H.close());

const sectionCount = (body: string, key: string): number =>
  Number(new RegExp(`<h2 id="leads-h-${key}"><span>[^<]*</span> <span class="lc-count">(\\d+)</span>`).exec(body)?.[1] ?? 'NaN');
const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-[a-z]+" href="([^"]*)"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);

describe('UI tidy phase 5: the top of Leads', () => {
  test('one line of counts and four boxes, each the count its section shows and a link to it', async () => {
    const body = (await H.get('sales', '/staff/leads')).body;
    const n = { new: sectionCount(body, 'new'), going: sectionCount(body, 'going'), later: sectionCount(body, 'later'), closed: sectionCount(body, 'closed') };
    for (const v of Object.values(n)) assert.ok(Number.isFinite(v));
    assert.match(body, new RegExp(`<h1>Leads</h1><p class="lede">${n.new} new · ${n.going} in progress · ${n.later} for later · ${n.closed} closed</p>`));
    assert.deepEqual(kpis(body), [
      ['#leads-new', 'New, not called yet', String(n.new)], ['#leads-going', 'In progress', String(n.going)],
      ['#leads-later', 'Saved for later', String(n.later)], ['#leads-closed', 'Closed', String(n.closed)],
    ]);
  });

  test('Record a lead is the one main button, for a login that may record one; it opens the folded form', async () => {
    assert.equal(RECORD_LEAD_HREF, '/staff/leads?record=1#record-lead');
    for (const who of ['sales', 'admin'] as const) {
      assert.match((await H.get(who, '/staff/leads')).body, /<p><a class="btn btn-primary" href="\/staff\/leads\?record=1#record-lead">Record a lead<\/a><\/p>/, who);
    }
    assert.doesNotMatch((await H.get('readonly', '/staff/leads')).body, /btn-primary" href="\/staff\/leads\?record=1/);
    const closed = (await H.get('sales', '/staff/leads')).body;
    assert.match(closed, /<details class="pblock recordlead" id="record-lead"><summary class="pnum">Record a lead by hand<\/summary>/);
    const open = (await H.get('sales', '/staff/leads?record=1')).body;
    assert.match(open, /<details class="pblock recordlead" id="record-lead" open><summary class="pnum">Record a lead by hand<\/summary>/);
    assert.doesNotMatch(open, /Filter — on|record: not a filter/, 'opening the form is not a filter, and is not reported as one');
    assert.match((await H.get('sales', '/staff/leads?layout=list&record=1')).body, /id="record-lead" open>/);
  });

  test('every switch is on one row: the two lists, the two layouts, website enquiries, Filter', async () => {
    const body = (await H.get('sales', '/staff/leads')).body;
    const row = /<div class="leadtools">([\s\S]*?)<\/details><\/div>/.exec(body)?.[1] ?? '';
    const at = (s: string): number => row.indexOf(s);
    const order = [at('>All leads<'), at('>Filled assessments<'), at('>Cards<'), at('>List view<'), at('Website enquiries</a>:'), at('<details class="filterbox"')];
    assert.ok(order.every((i) => i >= 0), String(order));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal((body.match(/<nav class="viewbar"/g) ?? []).length, 2, 'a switch row outside the one row');
  });

  test('the list view keeps its table and has no boxes', async () => {
    const body = (await H.get('sales', '/staff/leads?layout=list')).body;
    assert.match(body, /<table class="stack">/);
    assert.doesNotMatch(body, /class="kpis"|class="lede"/);
  });
});

describe('UI tidy phase 5: nothing taken away', () => {
  test('the folded form still records a lead', async () => {
    const r = await H.post('sales', '/staff/leads', { prospect_organisation: 'Tidy Test Clinic Limited', source: 'REFERRAL' });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    assert.match(r.location ?? '', /^\/staff\/leads\/[A-Za-z0-9-]+\?done=created$/);
    const body = (await H.get('sales', '/staff/leads')).body;
    assert.match(body, /Tidy Test Clinic Limited/);
  });

  test('the stylesheet: the folded form’s heading on one line, a closed Filter beside the switches', () => {
    assert.match(SITE_CSS, /\.recordlead>summary\.pnum\{display:block;cursor:pointer;list-style:none/);
    assert.match(SITE_CSS, /\.leadtools \.filterbox:not\(\[open\]\)\{flex:0 0 auto\}/);
    assert.match(SITE_CSS, /\.recordlead\[open\]>summary::before\{content:"– "\}/);
  });
});
