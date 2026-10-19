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
import { plainDashText } from '../src/web/plain-dashes.ts';

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
      assert.ok(box.includes(`<h2 class="claimbox-site"><a href="/staff/clients/${dun}/claims/${c.id}">${plainDashText(site)}</a></h2>`), c.claim_ref);
      assert.ok(box.includes(`<p class="help"><span class="claimref">${c.claim_ref}</span>`), c.claim_ref);
      assert.doesNotMatch(box, new RegExp(`<a [^>]*>[^<]*${c.claim_ref}`), 'a claim number is the words of a link');
      assert.ok(box.includes(`<p class="nextbox-t">${plainDashText((c.next_action ?? 'No next step yet: open the claim to set one').replace(/&/g, '&amp;'))}</p>`), c.claim_ref);
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

describe('UI tidy phase 8: a client’s page opens on one line per part', () => {
  const parts = (body: string): { tab: string; name: string; count: number | null; status: string; tone: string; what: string }[] =>
    [...(/<ul class="cparts"[^>]*>([\s\S]*?)<\/ul>/.exec(body)?.[1] ?? '').matchAll(
      /<a class="cpart" href="#tab-([a-z]+)"><span class="cpart-name">([^<]+)(?:<span class="newdot"[^>]*>[^<]*<\/span>)?(?: <span class="cpart-count">(\d+)<\/span>)?<\/span><span class="badge( b-[a-z]+)?">([^<]+)<\/span><span class="cpart-what">([^<]*)<\/span><\/a>/g)]
      .map((m) => ({ tab: m[1] ?? '', name: (m[2] ?? '').trim(), count: m[3] === undefined ? null : Number(m[3]), tone: (m[4] ?? '').trim(), status: m[5] ?? '', what: m[6] ?? '' }));

  test('a plain visit opens no part: one line per part, in the tabs’ order, each opening its part', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    const tabs = [...body.matchAll(/<a href="#tab-([a-z]+)" class="ctab-link ctl-[a-z]+( is-default)?">([^<]+)/g)];
    assert.deepEqual(tabs.filter((t) => t[2] !== undefined), [], 'a part is open');
    const p = parts(body);
    assert.deepEqual(p.map((x) => x.tab), tabs.map((t) => t[1]));
    assert.deepEqual(p.map((x) => x.name), tabs.map((t) => (t[3] ?? '').trim()));
    for (const x of p) {
      const tone: Record<string, string> = { 'Waiting for the client': 'b-warn', 'Working on it': 'b-info', Done: 'b-ok', 'Not started': '' };
      assert.equal(x.tone, tone[x.status], `${x.tab}: ${x.status} drawn ${x.tone}`);
      assert.ok(x.what.length > 0, `${x.tab} says nothing about what is happening`);
    }
  });

  test('each line shows its part’s most pressing state and the sum of its sections’ counts', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    const order = ['Waiting for the client', 'Working on it', 'Not started', 'Done'];
    for (const x of parts(body)) {
      const start = body.indexOf(`id="tab-${x.tab}"`);
      const next = body.indexOf('<div class="ctab ct-', start + 1);
      const panel = body.slice(start, next < 0 ? body.indexOf('</div></div>', start) : next);
      const states = [...panel.matchAll(/<\/h2>\s*<span class="badge[^"]*">(Not started|Working on it|Waiting for the client|Done)<\/span><\/summary>/g)].map((m) => m[1] ?? '');
      assert.ok(states.length > 0, `${x.tab}: no section states read`);
      assert.equal(x.status, order.find((o) => states.includes(o)), x.tab);
      const sum = [...panel.matchAll(/<h2>[^<]*? <span class="count">(\d+)<\/span><\/h2>/g)].reduce((n, m) => n + Number(m[1]), 0);
      assert.equal(x.count ?? 0, sum, `${x.tab}: the line counts ${String(x.count)}, its sections ${String(sum)}`);
      // Its words are the "working on" line of the first section in that most pressing state.
      const pairs = [...panel.matchAll(/<span class="badge[^"]*">(Not started|Working on it|Waiting for the client|Done)<\/span><\/summary>\s*<div class="secbody">\s*<dl class="three">\s*<dt>Working on<\/dt><dd>([^<]*)<\/dd>/g)];
      assert.equal(x.what, pairs.find((m) => m[1] === x.status)?.[2], `${x.tab}: the line’s words`);
    }
  });

  test('after a change, the part it was made in opens, as before, and the lines are not drawn', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}?done=contact`)).body;
    assert.match(body, /class="ctab-link ctl-people is-default"/);
    assert.doesNotMatch(body, /class="cparts"/);
    assert.match((await H.get('sales', `/staff/clients/${dun}?chat=all`)).body, /class="ctab-link ctl-chat is-default"/);
  });

  test('every part, opened, offers the way back to them all; from 900 px the row of tabs gives way to the menu', async () => {
    const body = (await H.get('sales', `/staff/clients/${dun}`)).body;
    const panels = [...body.matchAll(/<div class="ctab ct-[a-z]+" id="tab-[a-z]+"><p class="ctab-back"><a href="\/staff\/clients\/[^"]+">Every part of this client<\/a><\/p>/g)];
    assert.equal(panels.length, parts(body).length);
    assert.match(SITE_CSS, /\.ctabwrap:has\(\.ctab-panels :target\) \.cparts\{display:none\}/);
    assert.match(SITE_CSS, /@media \(min-width:900px\)\{body\.app \.ctabs\{display:none\}\}/);
  });
});
