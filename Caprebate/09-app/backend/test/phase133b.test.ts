/**
 * PHASE 133b — THE FIVE LONG SCREENS ON THE NEW LAYOUT. 17 September 2026.
 *
 * Phase 133a moved the record pages onto highlights, tabs and a right-hand panel, and left five screens in the new shell
 * but still one long column. This file proves each of the five is now on the layout, for a login that opens it:
 *
 *   THE BUSINESS PAGE     (Sales)       five tabs, one per numbered panel, every panel on the page; highlights; side panel.
 *   THE SURVEY JOB        (Surveying)   six tabs, one per numbered section; "Your figures" is the quick action before a
 *                                        commitment; the highlights say withheld and carry no figure.
 *   FINANCE               (Accounting)  six tabs holding all eight numbered sections, each section with its id; the home
 *                                        cards link to those ids.
 *   ADMIN SETTINGS        (Admin)       a left-hand section list, one section per list, per set of reasons and per summary.
 *   DOCUMENT TYPES        (Admin)       a left-hand section list by who may read a type; every type still on the page.
 *
 * AND ON EVERY ONE: every tab or section link lands on a panel that is on the page, no id is used twice (a tab id that
 * collided with a form field's id would open the wrong panel), and nothing needs a script.
 *
 * WRITTEN AGAINST HTTP ONLY, AND IMPORTING NOTHING THE PHASE ADDED, so the same file runs against the pre-change copy
 * (the .bak-phase133b files) to prove it can fail. The record of that run is in 04-phase-work/phase133b/proof-record.md.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };
type Client = { get(path: string): Promise<Res> };
type Login = 'admin' | 'sales' | 'accounting' | 'surveying';

let made: Made;
const clients = new Map<Login, Client>();

before(async () => {
  made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-133b-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  for (const who of ['admin', 'sales', 'accounting', 'surveying'] as const) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in`);
    const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    clients.set(who, { async get(path) { const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } }); return { status: x.status, body: await x.text() }; } });
  }
});

after(async () => { await new Promise<void>((r) => made.server.close(() => r())); });

function as(who: Login): Client {
  const c = clients.get(who);
  assert.ok(c, `no client for ${who}`);
  return c;
}

/** The anchors a tab strip or section list links to, in order. */
function tabLinks(body: string): string[] {
  const m = /<ul class="rtabs[^"]*">([\s\S]*?)<\/ul>/.exec(body);
  assert.ok(m !== null, 'the page has no tab strip and no section list');
  return [...(m[1] ?? '').matchAll(/<a href="#([^"]+)"/g)].map((x) => x[1] ?? '');
}

/** Every tab lands on a panel on the page; no id is used twice; nothing waits on a script. */
function sound(path: string, body: string, expected?: readonly string[]): string[] {
  const tabs = tabLinks(body);
  if (expected !== undefined) assert.deepEqual(tabs, expected, `${path}: the tabs are not the ones expected`);
  // PHASE 138: a panel is named by aria-label after its id, so the id is followed by a space or the tag's end.
  for (const t of tabs) assert.match(body, new RegExp(`<section class="tabpanel[^"]*" id="${t}"[ >]`), `${path}: the #${t} tab has no panel on the page`);
  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1] ?? '');
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual([...new Set(twice)], [], `${path}: an id is used more than once`);
  assert.equal(/<script|\sstyle=|\son[a-z]+=/i.test(body), false, `${path}: carries a script, a style attribute or a handler`);
  return tabs;
}

/** The text of one panel, from its opening tag to the next panel or the end of the tab set. */
function panel(body: string, id: string): string {
  const start = body.search(new RegExp(`<section class="tabpanel[^"]*" id="${id}"[ >]`));
  assert.ok(start >= 0, `no panel #${id}`);
  const next = body.indexOf('<section class="tabpanel', start + 1);
  return body.slice(start, next < 0 ? undefined : next);
}

describe('the five long screens are on the record layout', () => {
  // PHASE 134: THE ONE CLIENT PAGE. The business page's four working panels are four of its tabs; its notes are beside the
  // company's one timeline; the organisation's contacts, properties, documents and details are the rest.
  test('the one client page: the company’s timeline first, the four working panels, then the organisation’s record — with highlights and a side panel', async () => {
    const b = made.app.db.get<{ business_id: string }>("SELECT business_id FROM surveyor_jobs WHERE state = 'SEALED' LIMIT 1");
    assert.ok(b);
    const path = `/staff/clients/${b.business_id}`;
    const r = await as('sales').get(path);
    assert.equal(r.status, 200);
    // PHASE 138: no tabs — coloured sections that open and close, in this order, each a <details> with its old anchor. The
    // four working panels are inside them, under the section's heading; "Waiting on" is a highlight, and its card is gone.
    const secs = [...r.body.matchAll(/<details class="sec sec-[a-z]+" id="([^"]+)"/g)].map((m) => m[1]);
    // PHASE 139: "Check and tell the client" follows the claims.
    assert.deepEqual(secs, ['claims', 'checks', 'questions', 'activity', 'details', 'contacts', 'properties', 'sources', 'answers', 'documents']);
    for (const inner of ['tasks', 'missing', 'company-notes']) assert.match(r.body, new RegExp(`id="${inner}"`), `#${inner} is not on the page`);
    const ids = [...r.body.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1] ?? '');
    assert.deepEqual([...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))], [], 'an id is used more than once');
    assert.equal(/<script|\sstyle=|\son[a-z]+=/i.test(r.body), false, 'carries a script, a style attribute or a handler');
    assert.match(r.body, /<header class="highlights">/, 'no highlights panel');
    assert.match(r.body, /<aside class="side"/, 'no right-hand panel');
    assert.match(r.body, /<dt>Waiting on<\/dt>/, '"Waiting on" is not a highlight');
    assert.match(r.body, /Internal notes — never shown to the client/);
    assert.equal(/<div class="card-h"><h2>Waiting on<\/h2>/.test(r.body), false, 'the "Waiting on" card is still drawn');
    assert.equal(/[0-9] · (Questions|Sources|What is still missing|Tasks)/.test(r.body), false, 'a numbered heading is still drawn');
  });

  test('the surveyor’s job workspace: six tabs, one per numbered section; Your figures is the quick action; no figure in the highlights', async () => {
    const job = made.app.db.get<{ id: string }>("SELECT id FROM surveyor_jobs WHERE state = 'SEALED' LIMIT 1");
    assert.ok(job);
    const path = `/staff/survey/${job.id}`;
    const r = await as('surveying').get(path);
    assert.equal(r.status, 200);
    sound(path, r.body, ['property', 'rooms', 'rates', 'evidence', 'figures', 'record']);
    const n = ['property', 'rooms', 'rates', 'evidence', 'figures', 'record'];
    // PHASE 138: numbered headings are plain words.
    ['The property', 'The room schedule', 'The rates', 'The evidence', 'Your figures', 'The record'].forEach((heading, i) =>
      assert.ok(panel(r.body, n[i] ?? '').includes(`<h2>${heading}`), `section "${heading}" is not in the #${n[i]} tab`));
    const side = /<aside class="side"[\s\S]*?<\/aside>/.exec(r.body)?.[0] ?? '';
    assert.match(side, /<a href="#figures">Commit your figures<\/a>/, 'Your figures is not the quick action');
    assert.match(side, /<div class="pnum">Our estimate<\/div>/, 'the estimate\'s state is not beside the tabs');
    const hl = /<header class="highlights">[\s\S]*?<\/header>/.exec(r.body)?.[0] ?? '';
    assert.match(hl, /<dt>Our estimate<\/dt><dd>withheld<\/dd>/, 'the highlights do not say the estimate is withheld');
    assert.equal(/£/.test(hl), false, 'the highlights carry a figure');
  });

  test('finance: six tabs hold all eight numbered sections, each with its id, and Accounting’s home cards link to them', async () => {
    const r = await as('accounting').get('/staff/finance');
    assert.equal(r.status, 200);
    sound('/staff/finance', r.body, ['money', 'vat', 'invoices', 'fees', 'settings', 'earlier']);
    const where: [string, string, string][] = [
      // PHASE 138: numbered headings are plain words.
      ['money', 'money-by-month', 'The money, by month'], ['vat', 'vat-monitoring', 'VAT monitoring'],
      ['invoices', 'to-invoice', 'Claims at the invoice stage'], ['invoices', 'claim-invoices', 'The claims’ invoices'],
      ['fees', 'fee-controls', 'The fee controls'], ['settings', 'finance-settings', 'The finance settings'],
      ['fees', 'introducer-fees', 'Fees to introducing firms'], ['earlier', 'earlier-invoices', 'Organisations’ invoices'],
    ];
    for (const [tab, id, heading] of where) {
      assert.ok(panel(r.body, tab).includes(`<h2 id="${id}">${heading}`), `section "${heading}" has no id ${id} in the #${tab} tab`);
    }
    const home = await as('accounting').get('/staff');
    for (const id of ['to-invoice', 'claim-invoices', 'vat-monitoring']) {
      assert.ok(home.body.includes(`href="/staff/finance#${id}"`), `no home card links to finance #${id}`);
    }
  });

  test('admin settings: a left-hand section list, one section for each list, each set of reasons and each summary', async () => {
    const r = await as('admin').get('/staff/admin-settings');
    assert.equal(r.status, 200);
    assert.match(r.body, /<nav class="seclist" aria-label="[^"]+"><ul class="rtabs vtabs">/, 'no left-hand section list');
    const tabs = sound('/staff/admin-settings', r.body);
    const view = JSON.parse((await as('admin').get('/staff/admin-settings/view.json')).body) as { lists: unknown[]; reasons: unknown[] };
    // PHASE 141: seven, not six — "Who emails come from" is a section of its own, before what a setting may not change.
    assert.equal(tabs.length, view.lists.length + view.reasons.length + 7, 'a list, a set of reasons or a summary has no section');
    assert.ok(tabs.includes('email-sender'), 'who emails come from has no section');
    assert.equal(tabs.at(-1), 'may-not-change', 'what a setting may not change is not the last section');
  });

  test('document types: a left-hand section list by who may read a type, and every type still on the page', async () => {
    const r = await as('admin').get('/staff/document-types');
    assert.equal(r.status, 200);
    assert.match(r.body, /<nav class="seclist" aria-label="[^"]+"><ul class="rtabs vtabs">/, 'no left-hand section list');
    const tabs = sound('/staff/document-types', r.body);
    assert.equal(tabs.at(-1), 'add-type', 'adding a type is not the last section');
    const types = made.app.db.all<{ code: string; readers: string }>('SELECT code, readers FROM document_types');
    assert.ok(types.length > 0);
    for (const t of types) {
      const id = `readers-${t.readers.toLowerCase().replace(/_/g, '-')}`;
      assert.ok(panel(r.body, id).includes(`action="/staff/document-types/${t.code}"`), `${t.code} is not in the #${id} section`);
    }
  });
});
