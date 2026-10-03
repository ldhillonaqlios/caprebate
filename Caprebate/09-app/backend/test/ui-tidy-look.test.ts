/**
 * UI TIDY PHASE 1 — THE SHARED LOOK (src/web/look.ts and its rules in src/web/assets.ts), 2 October 2026.
 * The stage colours, the solid number boxes, the group bar, the black table heading and the striped rows.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_CSS, BRAND_TOKENS, TEXT_PAIRINGS } from '../src/web/assets.ts';
import { PROCEDURE_KEYS, EXIT_KEYS } from '../src/web/stages.ts';
import { STAGE_GROUPS, stageGroupOf, stageBadge, groupBand, kpiRow, groupBar, lateBadge, noDateBadge, nobodyBadge, type KpiTone } from '../src/web/look.ts';

const GROUPS = ['win', 'gather', 'survey', 'sign', 'paid'] as const;

describe('UI tidy phase 1: the stage groups', () => {
  test('every step of the procedure, and Closed, is in exactly one group, in the order a claim passes through them', () => {
    for (const key of [...PROCEDURE_KEYS, 'CLOSED']) {
      const holding = STAGE_GROUPS.filter((g) => g.stages.includes(key));
      assert.equal(holding.length, 1, `${key} is in ${holding.length} groups`);
    }
    assert.deepEqual(STAGE_GROUPS.map((g) => g.key), [...GROUPS]);
    assert.equal(STAGE_GROUPS.flatMap((g) => g.stages).length, PROCEDURE_KEYS.length + 1, 'a group holds a stage that is not a step');
  });

  test('on hold and the ways a claim ends have no group, and are drawn in the plain label', () => {
    for (const key of [...EXIT_KEYS, 'ON_HOLD', null, undefined, 'NOT_A_STAGE']) assert.equal(stageGroupOf(key), null, String(key));
    assert.equal(stageBadge('ON_HOLD', 'On hold').html, '<span class="badge">On hold</span>');
  });

  test('a stage label carries its group and the stage’s own name, and a page’s own wording is escaped', () => {
    assert.equal(stageBadge('SURVEY').html, '<span class="badge g-survey">Survey</span>');
    assert.equal(stageBadge('ENQUIRY').html, '<span class="badge g-win">Enquiry</span>');
    assert.equal(stageBadge('DATA_GATHERING').html, '<span class="badge g-gather">Data gathering</span>');
    assert.equal(stageBadge('DEFENCE_PACK').html, '<span class="badge g-sign">Defence pack</span>');
    assert.equal(stageBadge('CLOSED').html, '<span class="badge g-paid">Closed</span>');
    assert.equal(stageBadge('INVOICE', '<b>x</b>').html, '<span class="badge g-paid">&lt;b&gt;x&lt;/b&gt;</span>');
    assert.equal(groupBand(stageGroupOf('VALUATION'), 'Surveying · 3').html, '<p class="band g-survey">Surveying · 3</p>');
    assert.equal(groupBand(null, 'On hold').html, '<p class="band g-none">On hold</p>');
  });

  test('late, no date and nobody yet each have their own label', () => {
    assert.equal(lateBadge('3 days late').html, '<span class="badge b-late">3 days late</span>');
    assert.equal(noDateBadge('No date').html, '<span class="badge b-nodate">No date</span>');
    assert.equal(nobodyBadge('Nobody yet').html, '<span class="badge b-nobody">Nobody yet</span>');
  });
});

describe('UI tidy phase 1: the number boxes and the group bar', () => {
  test('a box with an address is a link to its list; one without is not; words are escaped; none draws nothing', () => {
    const out = kpiRow([
      { label: 'Next step late', value: '7', tone: 'late', href: '/staff/pipeline?late=1' },
      { label: 'In <progress>', value: '9', tone: 'total' },
    ]).html;
    assert.match(out, /^<ul class="kpis">/);
    assert.match(out, /<li><a class="kpi k-late" href="\/staff\/pipeline\?late=1"><span class="kpi-label">Next step late<\/span><span class="kpi-value">7<\/span><\/a><\/li>/);
    assert.match(out, /<li class="kpi k-total"><span class="kpi-label">In &lt;progress&gt;<\/span><span class="kpi-value">9<\/span><\/li>/);
    assert.equal(kpiRow([]).html, '');
  });

  test('every tone has its own solid colour rule', () => {
    const tones: KpiTone[] = ['total', 'late', 'warn', 'money', 'plain', ...GROUPS];
    for (const t of tones) {
      const cls = kpiRow([{ label: 'x', value: '1', tone: t }]).html.match(/class="kpi (k-[a-z]+)"/)?.[1];
      assert.equal(cls, `k-${t}`, `${t} is drawn as ${String(cls)}`);
      assert.match(SITE_CSS, new RegExp(`\\.kpi\\.${cls}\\{background:`), `no colour for ${cls}`);
    }
  });

  test('the bar gives each group a share of ten, leaves empty groups out and names them, and draws nothing for none', () => {
    const { bar, empty } = groupBar({ win: 4, gather: 1, survey: 3, paid: 1 });
    assert.match(bar.html, /^<div class="groupbar" role="img" aria-label="Winning it 4, Gathering 1, Surveying 3, Getting paid 1">/);
    assert.match(bar.html, /<span class="g-win gw-4">Winning it · 4<\/span>/);
    assert.match(bar.html, /<span class="g-gather gw-1">Gathering · 1<\/span>/);
    assert.match(bar.html, /<span class="g-survey gw-3">Surveying · 3<\/span>/);
    assert.doesNotMatch(bar.html, /g-sign/);
    assert.deepEqual(empty, ['Signing off']);
    assert.match(groupBar({ win: 1, paid: 1000 }).bar.html, /g-win gw-1".*g-paid gw-10"/, 'a share is never 0 or more than 10');
    assert.deepEqual(groupBar({}), { bar: groupBar({}).bar, empty: STAGE_GROUPS.map((g) => g.name) });
    assert.equal(groupBar({}).bar.html, '');
  });
});

describe('UI tidy phase 1: the stylesheet', () => {
  test('each group has a solid colour, a tint and the text on its tint, and every pairing is in the contrast list', () => {
    for (const g of GROUPS) {
      for (const suffix of ['', '-bg', '-ink']) assert.match(BRAND_TOKENS[`g-${g}${suffix}`] ?? '', /^#[0-9a-f]{6}$/i, `g-${g}${suffix}`);
      const has = (fg: string, bg: string): boolean => TEXT_PAIRINGS.some(([a, b]) => a === fg && b === bg);
      assert.ok(has(`g-${g}-ink`, `g-${g}-bg`), `g-${g}-ink on its tint is not checked`);
      assert.ok(has('white', `g-${g}`), `white on g-${g} is not checked`);
    }
    for (const [fg, bg] of [['white', 'warn'], ['white', 'ok'], ['white', 'stop'], ['mint', 'ink'], ['ink', 'nodate'], ['ink', 'zebra']]) {
      assert.ok(TEXT_PAIRINGS.some(([a, b]) => a === fg && b === bg), `${fg} on ${bg} is not checked`);
    }
  });

  test('every class look.ts draws has a rule', () => {
    for (const g of GROUPS) {
      assert.match(SITE_CSS, new RegExp(`\\.badge\\.g-${g}\\{background:var\\(--g-${g}-bg\\);color:var\\(--g-${g}-ink\\)`));
      assert.match(SITE_CSS, new RegExp(`\\.band\\.g-${g}\\{background:var\\(--g-${g}\\)\\}`));
      assert.match(SITE_CSS, new RegExp(`\\.groupbar \\.g-${g}\\{background:var\\(--g-${g}\\)\\}`));
    }
    assert.match(SITE_CSS, /\.band\.g-none\{background:var\(--ink\)\}/);
    for (let n = 1; n <= 10; n++) assert.match(SITE_CSS, new RegExp(`\\.groupbar \\.gw-${n}\\{flex-grow:${n}\\}`));
    assert.match(SITE_CSS, /\.badge\.b-late\{background:var\(--stop\);color:var\(--white\)/);
    assert.match(SITE_CSS, /\.badge\.b-nodate\{background:var\(--nodate\);color:var\(--ink\)/);
    assert.match(SITE_CSS, /\.badge\.b-nobody\{background:var\(--warnbg\);color:var\(--warn\)/);
    assert.match(SITE_CSS, /\.kpi\.k-total \.kpi-value\{color:var\(--mint\)\}/);
  });

  test('a table heading is black with white words in the back office and the portal only, never on the public pages', () => {
    assert.match(SITE_CSS, /body\.app thead th\{background:var\(--ink\);color:var\(--white\)/);
    assert.match(SITE_CSS, /body\.app thead th a\{color:var\(--white\)\}/);
    assert.doesNotMatch(SITE_CSS, /(^|\})\s*thead th\{background:var\(--ink\)/, 'the black heading is not limited to body.app');
  });

  test('rows are striped, but a row that has its own colour (a "does not know" answer, a pack line being edited) keeps it', () => {
    assert.match(SITE_CSS, /body\.app tbody tr:nth-child\(even\):not\(\[class\]\) td\{background:var\(--zebra\)\}/);
    assert.match(SITE_CSS, /body\.app tbody tr:not\(\[class\]\):hover td\{background:var\(--mist\)\}/);
  });

  test('no text in the shared look is smaller than 12 px', () => {
    const block = SITE_CSS.slice(SITE_CSS.indexOf('UI TIDY PHASE 1 — THE SHARED LOOK'));
    const end = block.indexOf('THE PUBLIC PAGES IN THE HOME PAGE');
    for (const m of block.slice(0, end).matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `font-size ${m[1]}px`);
  });
});
