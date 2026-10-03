/**
 * UI TIDY PHASE 18 — THE CLAIM PAGE, 3 October 2026 (src/web/crm-pages.ts claimPage, src/web/components.ts sectionOpens,
 * src/web/navigation.ts addUnderCurrent). Lakhbir added this phase: the claim page was about 10,700 px because every
 * section "working on it" opened by itself. Now only the stage opens (and the checks after a step was worked in); every
 * other section is a one-line summary with its status until a change just made, or the person's own choice, opens it.
 * The sections are listed under the claim in the left-hand menu, and the header shows the stage in its colour.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import { claimHref, sectionOpens } from '../src/web/components.ts';
import { stageGroupOf } from '../src/web/look.ts';
import { SECTION_STATUS_NOTE } from '../src/web/crm-pages.ts';

let H: Harness;
let claim = { id: '', business_id: '', stage: '' };
before(async () => {
  H = await startHarness('uit18');
  claim = H.made.app.db.get<{ id: string; business_id: string; stage: string }>(
    "SELECT c.id, c.business_id, c.stage FROM claims c WHERE c.claim_ref = 'CR-2026-0004'") ?? claim;
  assert.notEqual(claim.id, '', 'the seed has Dunmarrow’s main site claim — not the last of its two, so its sections must sit under it, not at the end');
});
after(() => H.close());

type Sec = { id: string; key: string; open: boolean; status: string };
const secs = (body: string): Sec[] => [...body.matchAll(/<details class="sec sec-[a-z]+" id="([^"]+)" data-section="([^"]+)"( open)?>[\s\S]*?<span class="badge[^"]*">([^<]+)<\/span><\/summary>/g)]
  .map((m) => ({ id: m[1] ?? '', key: m[2] ?? '', open: m[3] !== undefined, status: m[4] ?? '' }));
const page = async (q = ''): Promise<string> => (await H.get('sales', `${claimHref(claim.business_id, claim.id)}${q}`)).body;

describe('UI tidy phase 18: which sections open', () => {
  test('a change just made opens; then the person’s choice; then, where a list is given, only the sections on it open by status', () => {
    const none = new Map<string, boolean>();
    assert.equal(sectionOpens({ key: 'a', status: 'WORKING' }, none), true, 'without a list, working opens as before');
    assert.equal(sectionOpens({ key: 'a', status: 'WORKING' }, none, ['b']), false);
    assert.equal(sectionOpens({ key: 'b', status: 'WORKING' }, none, ['b']), true);
    assert.equal(sectionOpens({ key: 'b', status: 'DONE' }, none, ['b']), false);
    assert.equal(sectionOpens({ key: 'a', status: 'DONE', open_now: true }, none, []), true);
    assert.equal(sectionOpens({ key: 'a', status: 'DONE' }, new Map([['a', true]]), []), true);
    assert.equal(sectionOpens({ key: 'b', status: 'WORKING' }, new Map([['b', false]]), ['b']), false);
  });

  test('the claim page opens only its stage; every other section is still on the page, closed, with its status', async () => {
    const all = secs(await page());
    assert.ok(all.length >= 8, 'the claim’s sections are all drawn');
    assert.deepEqual(all.filter((s) => s.open).map((s) => s.key), ['claim.stage']);
    assert.ok(all.some((s) => !s.open && s.status === 'Working on it'), 'a section working on it now starts closed');
  });

  test('a change just made opens its section; a person who keeps one open sees it open', async () => {
    assert.ok(secs(await page('?done=grants')).find((s) => s.key === 'claim.grants')?.open, 'the section just changed is closed');
    const kept = await H.post('sales', '/staff/me/sections', { section: 'claim.facts', open: 'yes', back: claimHref(claim.business_id, claim.id), anchor: 'claim-facts' });
    assert.equal(kept.status, 303);
    assert.deepEqual(secs(await page()).filter((s) => s.open).map((s) => s.key).sort(), ['claim.facts', 'claim.stage']);
    await H.post('sales', '/staff/me/sections', { section: 'claim.facts', open: 'auto', back: claimHref(claim.business_id, claim.id), anchor: 'claim-facts' });
  });
});

describe('UI tidy phase 18: the menu and the header', () => {
  test('the claim’s sections sit under it in the client’s menu, in order, each to do or waiting where it is', async () => {
    const body = await page();
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    const lis = [...nav.matchAll(/<li( class="subsub")?><a href="([^"]+)"( aria-current="page")?>([^<]+?)(?: <span class="subnote">([^<]+)<\/span>)?<\/a><\/li>/g)]
      .map((m) => ({ sub: m[1] !== undefined, href: m[2] ?? '', current: m[3] !== undefined, label: m[4] ?? '', note: m[5] ?? '' }));
    const at = lis.findIndex((l) => l.current);
    assert.ok(at >= 0 && lis[at]?.href === claimHref(claim.business_id, claim.id), 'this claim is marked in its client’s menu');
    const under = lis.slice(at + 1).filter((l, i, a) => a.slice(0, i + 1).every((x) => x.sub));
    const all = secs(body);
    assert.deepEqual(under.map((l) => l.href), all.map((s) => `#${s.id}`));
    for (const [i, s] of all.entries()) {
      assert.equal(under[i]?.note, s.status === 'Working on it' ? 'to do' : s.status === 'Waiting for the client' ? 'waiting' : '', s.key);
    }
    assert.ok(lis.slice(0, at).every((l) => !l.sub), 'nothing above the claim is indented');
    assert.ok(lis.slice(at + 1 + under.length).some((l) => !l.sub && l.href.includes('/claims/')), 'the client’s other claim follows this claim’s sections');
    assert.deepEqual(SECTION_STATUS_NOTE, { WORKING: 'to do', WAITING: 'waiting' });
  });

  test('the header shows the stage in its group’s colour', async () => {
    const body = await page();
    const g = stageGroupOf(claim.stage);
    assert.ok(g !== null);
    assert.match(body, new RegExp(`<div><dt>Stage</dt><dd><span class="badge g-${g.key}">[^<]+</span></dd></div>`));
    assert.match(body, /<div><dt>Owner<\/dt><dd>(?:<span class="badge b-nobody">Nobody yet<\/span>|[^<]+)<\/dd><\/div>/);
  });
});
