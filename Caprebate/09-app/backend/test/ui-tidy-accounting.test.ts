/**
 * UI TIDY PHASE 17 — ACCOUNTING'S AND THE SURVEYOR'S OWN PAGES, 3 October 2026 (src/web/crm-pages.ts claimsPage,
 * src/web/billing.ts listPage). Accounting's Claims list drew four columns of dashes — Property, Stage, Next action and
 * Owner are not Accounting's to read — so a column no row may show is left out and the page says so. Accounting's
 * Clients list shows an overdue invoice as a red label. The homes (phase 4) and the phone check needed no change.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import { claimColumns } from '../src/web/crm-pages.ts';

let H: Harness;
before(async () => { H = await startHarness('uit17'); });
after(() => H.close());

const heads = (body: string): string[] =>
  [...(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(body)?.[1] ?? '').matchAll(/<th>([\s\S]*?)<\/th>/g)]
    .map((m) => (m[1] ?? '').replace(/<span class="sorted">[^<]*<\/span>/, '').replace(/<[^>]+>/g, '').trim());

describe('UI tidy phase 17: the Claims list shows only what a login may read', () => {
  test('a column is kept when any row may show it; a dash stays on the rows that may not', () => {
    assert.deepEqual(claimColumns([{}, {}] as never), { property: false, stage: false, next_action: false, owner: false });
    assert.deepEqual(claimColumns([{ property: null, stage: null }, { owner: 'A', next_action: null }] as never),
      { property: true, stage: false, next_action: true, owner: true });
    assert.deepEqual(claimColumns([{ stage: 'Survey' }] as never), { property: false, stage: true, next_action: false, owner: false });
  });

  test('Accounting: Company and Reference, no column of dashes, and a line saying why', async () => {
    const body = (await H.get('accounting', '/staff/claims')).body;
    assert.deepEqual(heads(body), ['Company', 'Reference']);
    assert.match(body, /<p class="help">Only the columns your role may read are shown\.<\/p>/);
    assert.doesNotMatch(body, /<td[^>]*><span class="help">—<\/span><\/td>/);
  });

  test('Sales: all six columns as before, and no such line', async () => {
    const body = (await H.get('sales', '/staff/claims')).body;
    assert.deepEqual(heads(body), ['Company', 'Property', 'Stage', 'Next action', 'Owner', 'Reference']);
    assert.doesNotMatch(body, /Only the columns your role may read/);
  });
});

describe('UI tidy phase 17: Accounting’s Clients list', () => {
  test('an overdue invoice is a red label with its count; none says none', async () => {
    const body = (await H.get('accounting', '/staff/clients')).body;
    const rows = [...body.matchAll(/<tr><td><a href="\/staff\/clients\/[^"]+">([^<]+)<\/a><\/td>(?:<td>[^<]*<\/td>){3}\s*<td>([\s\S]*?)<\/td>/g)].map((m) => [m[1], m[2]]);
    assert.ok(rows.length > 0);
    assert.ok(rows.some(([, o]) => /^<span class="badge b-late">\d+ late<\/span>$/.test(o ?? '')), 'the seed has an overdue invoice');
    for (const [, o] of rows) assert.match(o ?? '', /^(none|<span class="badge b-late">\d+ late<\/span>)$/);
    assert.doesNotMatch(body, /<td><strong>\d+<\/strong><\/td>/);
  });
});
