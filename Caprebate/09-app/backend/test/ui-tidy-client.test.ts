/**
 * UI TIDY PHASE 7 — A CLIENT'S PAGE, PART 1, 3 October 2026 (src/web/client-page.ts, src/web/client-layout.ts).
 * The client's own header; each claim in a box of its own, headed in its stage's colour, named by its site, its next step
 * in a dark box; and the left-hand menu opening out to the client — its claims, then the page's parts.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as C from '../src/web/crm.ts';
import { dueReading } from '../src/web/localtime.ts';
import { propertyIn } from '../src/web/components.ts';
import { stageGroupOf } from '../src/web/look.ts';
import { SITE_CSS } from '../src/web/assets.ts';

let H: Harness;
let dun = '';
before(async () => {
  H = await startHarness('uit7');
  dun = H.made.app.db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")?.id ?? '';
});
after(() => H.close());

const org = (): C.OrganisationView => C.organisationView(H.made.app.db, H.actor('sales'), dun);
const boxes = (body: string): string[] => [...body.matchAll(/<article class="claimbox">[\s\S]*?<\/article>/g)].map((m) => m[0]);
const menu = (body: string): { title: string | null; items: { href: string; words: string; note: string | null; current: boolean }[] } => {
  const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
  return {
    title: /<p class="subtitle">([^<]*)<\/p>/.exec(nav)?.[1] ?? null,
    items: [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1] ?? '').matchAll(/<a href="([^"]+)"( aria-current="page")?>([^<]*)(?: <span class="subnote">([^<]*)<\/span>)?<\/a>/g)]
      .map((m) => ({ href: (m[1] ?? '').replace(/&amp;/g, '&'), words: m[3] ?? '', note: m[4] ?? null, current: m[2] !== undefined })),
  };
};

describe('UI tidy phase 7: the top of a client’s page', () => {
  test('the way back, the name, its status in colour, owner and who it waits on, and the actions beside them', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    assert.match(body, /<nav class="crumbs" aria-label="Where you are"><ol><li><a href="\/staff\/clients">Clients<\/a><\/li><li><span aria-current="page">Dunmarrow Medical Practice Limited<\/span><\/li><\/ol><\/nav>/);
    assert.match(body, /<header class="clienthead"><div class="clienthead-main"><h1>Dunmarrow Medical Practice Limited<\/h1>/);
    assert.match(body, /<p class="pills"><span class="badge b-ok">Active<\/span><span class="badge">Owner: [^<]+<\/span>/);
    assert.match(body, /<span class="badge[^"]*">Waiting on (us|the client|nobody)<\/span>/);
    assert.match(body, /<\/p><\/div>\s*<div class="cactions">/, 'the actions are not beside the name');
  });

  test('each claim in its own box: its stage’s colour, "Claim n of N", its site as the link, its number in grey, its next step and when', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    const o = org();
    const got = boxes(body);
    assert.equal(got.length, o.claims.length);
    assert.ok(o.claims.length >= 2, 'the seed’s Dunmarrow has two claims');
    o.claims.forEach((c, i) => {
      const box = got[i] ?? '';
      const g = stageGroupOf(c.stage_key);
      assert.match(box, new RegExp(`<p class="band g-${g?.key ?? 'none'}">Claim ${i + 1} of ${o.claims.length} · ${c.stage}</p>`), c.claim_ref);
      const site = propertyIn(o.trading_name, c.property) ?? '';
      assert.ok(box.includes(`<h2 class="claimbox-site"><a href="/staff/clients/${dun}/claims/${c.id}">${site}</a></h2>`), c.claim_ref);
      assert.ok(box.includes(`<p class="help"><span class="claimref">${c.claim_ref}</span>`), c.claim_ref);
      assert.doesNotMatch(box, new RegExp(`<a [^>]*>[^<]*${c.claim_ref}`), 'a claim number is the words of a link');
      assert.ok(box.includes(`<p class="nextbox-t">${(c.next_action ?? 'No next step yet — open the claim to set one').replace(/&/g, '&amp;')}</p>`), c.claim_ref);
      const late = c.next_action !== null && dueReading(c.next_action_due, H.made.app.now()).overdue;
      assert.equal(/class="badge b-late">\d+ days? late</.test(box), late, c.claim_ref);
      assert.match(box, new RegExp(`<a class="btn" href="/staff/clients/${dun}/claims/${c.id}">Open the claim</a>`));
    });
  });

  test('the claims are above the next step and the tabs, and are no longer a tab', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    assert.ok(body.indexOf('class="claimboxes"') < body.indexOf('<div class="ctop">'));
    assert.ok(body.indexOf('<div class="ctop">') < body.indexOf('<nav class="ctabs"'));
    assert.doesNotMatch(body, /href="#tab-claims"/);
  });
});

describe('UI tidy phase 7: the client’s own menu', () => {
  test('on the client’s page: its name, Overview marked, each claim by site and stage with its lateness, then the page’s parts', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    const o = org();
    const m = menu(body);
    assert.equal(m.title, o.trading_name);
    assert.deepEqual(m.items[0], { href: `/staff/clients/${dun}`, words: 'Overview', note: null, current: true });
    o.claims.forEach((c, i) => {
      const item = m.items[i + 1];
      const late = c.next_action !== null && dueReading(c.next_action_due, H.made.app.now()).overdue;
      assert.equal(item?.href, `/staff/clients/${dun}/claims/${c.id}`);
      assert.equal(item?.words, `${propertyIn(o.trading_name, c.property) ?? 'claim'} · ${c.stage}`);
      assert.equal(item?.note !== null && /^\d+ days? late$/.test(item?.note ?? ''), late);
      assert.equal(item?.current, false);
    });
    const tabs = [...body.matchAll(/<a href="#tab-([a-z]+)" class="ctab-link/g)].map((x) => x[1]);
    assert.deepEqual(m.items.slice(o.claims.length + 1).map((x) => x.href), tabs.map((t) => `/staff/clients/${dun}#tab-${t}`));
    for (const it of m.items) assert.doesNotMatch(it.words, /CR-\d{4}-\d{4}/, 'a claim number is a menu link’s words');
  });

  test('on a claim inside the client: that claim marked, not Overview', async () => {
    const c = org().claims[1];
    assert.ok(c !== undefined);
    const m = menu((await H.get('sales', `/staff/clients/${dun}/claims/${c.id}`)).body);
    assert.equal(m.title, 'Dunmarrow Medical Practice Limited');
    assert.deepEqual(m.items.filter((x) => x.current).map((x) => x.href), [`/staff/clients/${dun}/claims/${c.id}`]);
  });

  test('another page draws no client’s menu', async () => {
    assert.equal(menu((await H.get('sales', '/staff/clients')).body).title, null);
  });
});

describe('UI tidy phase 7: the stylesheet', () => {
  test('the boxes side by side, the next step dark with mint words over it, nothing under 12 px', () => {
    assert.match(SITE_CSS, /\.claimboxes\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(19rem,1fr\)\)/);
    assert.match(SITE_CSS, /\.nextbox\{background:var\(--ink\);color:var\(--white\)/);
    assert.match(SITE_CSS, /\.nextbox-h\{[^}]*color:var\(--mint\)/);
    const from = SITE_CSS.indexOf('UI TIDY PHASE 7');
    const block = SITE_CSS.slice(from, SITE_CSS.indexOf('\n/* ', from));
    for (const m of block.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `font-size ${m[1]}px`);
  });
});
