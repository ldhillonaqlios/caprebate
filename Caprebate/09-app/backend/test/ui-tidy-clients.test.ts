/**
 * UI TIDY PHASE 6 — THE CLIENTS LIST, 2 October 2026 (src/web/client-list.ts).
 * A line of counts and solid boxes, each a filter; search; the status in its colour; each claim beside its company by
 * site and number, its stage in its colour. Counts and claims are read from the same stores at the same moment.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import { clientList } from '../src/web/client-list.ts';
import * as C from '../src/web/crm.ts';
import { siteOf, stageGroupOf } from '../src/web/look.ts';

let H: Harness;
before(async () => { H = await startHarness('uit6'); });
after(() => H.close());

const names = (body: string): string[] => [...body.matchAll(/class="rowname" href="[^"]+">([^<]+)</g)].map((m) => m[1] ?? '');
const rowOf = (body: string, name: string): string => new RegExp(`<tr>\\s*<td data-label="Company"><a class="rowname" href="[^"]+">${name}</a>[\\s\\S]*?</tr>`).exec(body)?.[0] ?? '';
const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-[a-z]+" href="([^"]*)"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);

describe('UI tidy phase 6: the top of the Clients list', () => {
  test('the line and the boxes count from the list itself, and each box is its filter', async () => {
    const list = clientList(H.made.app.db, H.actor('sales'), 'waiting', H.made.app.now());
    const us = list.rows.filter((r) => r.waiting?.who === 'US').length;
    const them = list.rows.filter((r) => r.waiting?.who === 'CLIENT').length;
    const dnc = list.rows.filter((r) => r.do_not_contact).length;
    const body = (await H.get('sales', '/staff/clients')).body;
    assert.match(body, new RegExp(`<h1>Clients</h1><p class="lede">${list.rows.length} companies · ${us} waiting on us · ${them} waiting on the client</p>`));
    assert.deepEqual(kpis(body), [
      ['/staff/clients?show=us', 'Waiting on us', String(us)], ['/staff/clients?show=client', 'Waiting on the client', String(them)],
      ['/staff/clients?show=dnc', 'Asked not to be contacted', String(dnc)], ['/staff/clients', 'Every company', String(list.rows.length)],
    ]);
  });

  test('each filter shows exactly its companies; an unknown one shows all; the current one is marked', async () => {
    const list = clientList(H.made.app.db, H.actor('sales'), 'waiting', H.made.app.now());
    const cases: [string, (r: (typeof list.rows)[number]) => boolean][] = [
      ['us', (r) => r.waiting?.who === 'US'], ['client', (r) => r.waiting?.who === 'CLIENT'], ['dnc', (r) => r.do_not_contact], ['', () => true], ['nonsense', () => true],
    ];
    for (const [show, keep] of cases) {
      const body = (await H.get('sales', `/staff/clients${show === '' ? '' : `?show=${show}`}`)).body;
      const want = list.rows.filter(keep).map((r) => r.name);
      if (want.length === 0) assert.match(body, /No client matches/, show);
      else assert.deepEqual(names(body), want, show);
      const marked = show === 'nonsense' ? '' : show;
      assert.match(body, new RegExp(`<a href="/staff/clients${marked === '' ? '' : `\\?show=${marked}`}" aria-current="page">`), show);
    }
  });

  test('the search finds a company by its name, a claim number or a site; keeps the filter and the order; is escaped', async () => {
    assert.deepEqual(names((await H.get('sales', '/staff/clients?q=dunmarrow')).body), ['Dunmarrow Medical Practice Limited']);
    assert.deepEqual(names((await H.get('sales', '/staff/clients?q=CR-2026-0009')).body), ['Dunmarrow Medical Practice Limited']);
    assert.deepEqual(names((await H.get('sales', '/staff/clients?q=annexe')).body), ['Elverton Private Hospital Limited']);
    const kept = (await H.get('sales', '/staff/clients?q=d&show=us&sort=name')).body;
    assert.match(kept, /<input type="hidden" name="show" value="us"><input type="hidden" name="sort" value="name">/);
    assert.match(kept, /<a href="\/staff\/clients\?q=d&amp;show=client&amp;sort=name">Waiting on the client<\/a>/);
    const odd = (await H.get('sales', '/staff/clients?q=%3Cb%3E')).body;
    assert.match(odd, /value="&lt;b&gt;"/);
    assert.match(odd, /No client matches\. <a href="\/staff\/clients">Show every client<\/a>/);
  });
});

describe('UI tidy phase 6: each row', () => {
  test('the status in its colour: Active green, Prospect outlined, Do not contact red', async () => {
    const body = (await H.get('sales', '/staff/clients')).body;
    assert.match(rowOf(body, 'Corvale Supported Living Limited'), /<span class="badge b-ok">Active<\/span>/);
    assert.match(rowOf(body, 'Aldergate Care Group Limited'), /<span class="badge b-info">Prospect<\/span>/);
    assert.match(rowOf(body, 'Fenmoor Nursing Homes Limited'), /<span class="badge b-late">Do not contact<\/span>/);
  });

  test('every claim beside its own company, by site and number, its stage in its colour — two of one company apart', async () => {
    const body = (await H.get('sales', '/staff/clients')).body;
    const b = C.pipelineBoard(H.made.app.db, H.actor('sales'), H.made.app.now());
    const cards = [...b.columns.flatMap((c) => c.cards), ...b.on_hold, ...b.exited.flatMap((e) => e.cards), ...b.unrecognised];
    for (const c of cards) {
      const row = rowOf(body, c.client);
      const g = stageGroupOf(c.stage_key);
      assert.ok(row.includes(`<a href="/staff/clients/${c.business_id}/claims/${c.id}">${siteOf(c.client, c.property)}</a> <span class="help">${c.claim_ref}</span>`), c.claim_ref);
      if (g !== null) assert.ok(row.includes(`<span class="badge g-${g.key}">${c.stage_label}</span> <a href="/staff/clients/${c.business_id}/claims/${c.id}">`), c.claim_ref);
    }
    const dun = rowOf(body, 'Dunmarrow Medical Practice Limited');
    assert.ok(dun.indexOf('>main site<') >= 0 && dun.indexOf('>branch surgery<') > dun.indexOf('>main site<'));
  });

  test('Read only: no waiting boxes or filters, still each claim; Accounting keeps its own billing list', async () => {
    const ro = (await H.get('readonly', '/staff/clients')).body;
    assert.deepEqual(kpis(ro).map((k) => k[1]), ['Asked not to be contacted', 'Every company']);
    assert.doesNotMatch(ro, />Waiting on us</);
    assert.match(ro, /class="claimsat"/);
    const acc = await H.get('accounting', '/staff/clients');
    assert.equal(acc.status, 200);
    assert.doesNotMatch(acc.body, /Find a client/);
  });
});
