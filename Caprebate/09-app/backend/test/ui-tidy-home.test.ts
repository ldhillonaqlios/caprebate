/**
 * UI TIDY PHASE 4 — HOME IN TWO COLUMNS, 2 October 2026 (src/web/staff-dashboard.ts, src/web/home.ts).
 * One line saying what is late; solid number boxes; the work on the left and the pipeline and calendar on the right;
 * the pipeline as five coloured bars. Every part that was on Home is still there for the same logins.
 * Counts are read from the same store at the same moment, never written in, so the test does not depend on the date.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness, type Login } from './ui-tidy-harness.ts';
import { todayItems } from '../src/web/home.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { localDate } from '../src/web/localtime.ts';

let H: Harness;
before(async () => { H = await startHarness('uit4'); });
after(() => H.close());

const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/class="kpi (k-[a-z]+)"(?: href="[^"]*")?><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);
const lateCount = (who: Login): number => todayItems(H.actor(who), H.made.app, H.made.app.now()).filter((t) => t.late === true).length;
const DAYS = '(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MONTHS = '(January|February|March|April|May|June|July|August|September|October|November|December)';
const cols = (body: string): { main: string; side: string } => {
  const at = body.indexOf('<div class="home-cols">');
  const side = body.indexOf('<div class="home-side">');
  return { main: body.slice(at, side), side: body.slice(side, body.indexOf('</main>')) };
};

describe('UI tidy phase 4: the top of Home', () => {
  test('one heading, then the day in words and how many jobs are late, the same number the first box shows', async () => {
    for (const who of ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const) {
      const body = (await H.get(who, '/staff')).body;
      assert.equal((body.match(/<h1>Home<\/h1>/g) ?? []).length, 1, who);
      const n = lateCount(who);
      const words = n === 0 ? 'Nothing is late\\.' : n === 1 ? '1 job is late: start at the top\\.' : `${n} jobs are late: start at the top\\.`;
      assert.match(body, new RegExp(`<p class="lede">${DAYS} \\d{1,2} ${MONTHS}\\. ${words}</p>`), who);
      const first = kpis(body)[0];
      assert.deepEqual(first, [n > 0 ? 'k-late' : 'k-plain', n === 1 ? 'Job late' : 'Jobs late', String(n)], who);
    }
  });

  test('each view’s boxes, in order, and every one links to what it counts', async () => {
    assert.deepEqual(kpis((await H.get('sales', '/staff')).body).map((k) => k[1]).map((l) => l.replace(/s\b/g, '')),
      ['Jobs late', 'New leads', 'New messages', 'Calls today', 'Claims in progress'].map((l) => l.replace(/s\b/g, '')));
    assert.deepEqual(kpis((await H.get('accounting', '/staff')).body).map((k) => k[1].replace(/s\b/g, '')).slice(1),
      ['Not yet paid', 'Invoices late', 'Claims ready for our fee', 'Calls today'].map((l) => l.replace(/s\b/g, '')));
    assert.deepEqual(kpis((await H.get('surveying', '/staff')).body).map((k) => k[1].replace(/s\b/g, '')).slice(1),
      ['Jobs waiting for your figures', 'Survey jobs', 'Calls today'].map((l) => l.replace(/s\b/g, '')));
    assert.deepEqual(kpis((await H.get('admin', '/staff?view=admin')).body).map((k) => k[1].replace(/, of \d+ staff$/, '')), ['Working now', 'Signed in today']);
    for (const who of ['sales', 'accounting', 'surveying'] as const) {
      const body = (await H.get(who, '/staff')).body;
      const boxes = body.slice(body.indexOf('<ul class="kpis">'), body.indexOf('</ul>', body.indexOf('<ul class="kpis">')));
      assert.equal((boxes.match(/<li><a class="kpi /g) ?? []).length, (boxes.match(/class="kpi /g) ?? []).length, `${who}: a box without a link`);
    }
  });

  test('Record a lead is offered only to a login that may record one', async () => {
    for (const who of ['sales', 'admin'] as const) assert.match((await H.get(who, '/staff')).body, /<a class="btn btn-primary" href="\/staff\/leads\?record=1#record-lead">Record a lead<\/a>/, who);
    for (const who of ['readonly', 'accounting', 'surveying'] as const) assert.doesNotMatch((await H.get(who, '/staff')).body, /record-lead/, who);
  });
});

describe('UI tidy phase 4: two columns, and nothing taken away', () => {
  test('Sales: Do these first, today’s calls and emails, new leads and messages, leads’ next steps on the left; the pipeline and the calendar on the right', async () => {
    const body = (await H.get('sales', '/staff')).body;
    const { main, side } = cols(body);
    const order = (html: string, ids: string[]): number[] => ids.map((id) => html.indexOf(id));
    const left = order(main, ['id="row-today"', 'id="today-activities"', 'id="row-new-leads"', 'id="new-messages"', 'id="row-next-actions"']);
    assert.ok(left.every((i) => i >= 0), `left: ${String(left)}`);
    assert.deepEqual(left, [...left].sort((a, b) => a - b));
    assert.match(main, /<div class="home-pair"><section class="homerow" aria-labelledby="row-new-leads">[\s\S]*?id="new-messages"/);
    assert.match(main, /<h2 id="row-today">Do these first<\/h2>/);
    assert.match(main, /href="\/staff\/next-actions"/, 'the claims with no next step are still reached from Home');
    const right = order(side, ['id="row-pipeline"', 'id="calendar"']);
    assert.ok(right[0] !== undefined && right[0] >= 0 && right[1] !== undefined && right[0] < right[1], `right: ${String(right)}`);
    assert.match(side, /Block off time/);
    assert.match(side, /href="\/staff\/reports"/);
  });

  test('Accounting and the Surveyor: the work on the left, money or survey jobs and the calendar on the right', async () => {
    const acc = cols((await H.get('accounting', '/staff')).body);
    assert.ok(acc.main.includes('id="row-today"') && acc.main.includes('id="today-activities"'));
    assert.ok(acc.side.includes('id="row-money"') && acc.side.includes('id="calendar"'));
    const sur = cols((await H.get('surveying', '/staff')).body);
    assert.ok(sur.main.includes('id="row-today"') && sur.main.includes('id="today-activities"'));
    assert.ok(sur.side.includes('id="row-jobs"') && sur.side.includes('id="calendar"'));
  });

  test('Do these first lists the late ones first, every late one red', async () => {
    const body = (await H.get('sales', '/staff')).body;
    const row = /<section class="homerow" aria-labelledby="row-today">([\s\S]*?)<\/section>/.exec(body)?.[1] ?? '';
    const lates = [...row.matchAll(/<li class="tile hometile( late)?/g)].map((m) => m[1] !== undefined);
    assert.deepEqual(lates, [...lates].sort((a, b) => Number(b) - Number(a)));
    assert.equal(lates.filter(Boolean).length, Math.min(lateCount('sales'), 12));
  });
});

describe('UI tidy phase 4: the stylesheet', () => {
  test('two columns on a wide screen, one under 1100 px; the bars’ widths in tenths; late in a red label; nothing under 12 px', () => {
    assert.match(SITE_CSS, /\.home-cols\{display:grid;grid-template-columns:minmax\(0,2fr\) minmax\(0,1fr\)/);
    assert.match(SITE_CSS, /@media \(max-width:1100px\)\{\.home-cols\{grid-template-columns:minmax\(0,1fr\)\}\}/);
    for (let n = 0; n <= 10; n++) assert.match(SITE_CSS, new RegExp(`\\.gbar-fill\\.gw-${n}\\{width:${n === 0 ? '0' : `${n * 10}%`}\\}`));
    for (const g of ['win', 'gather', 'survey', 'sign', 'paid']) assert.match(SITE_CSS, new RegExp(`\\.gbar-fill\\.g-${g}\\{background:var\\(--g-${g}\\)\\}`));
    assert.match(SITE_CSS, /\.home-cols \.hometile\.late \.tileline\.when\{[^}]*background:var\(--stop\);color:var\(--white\)/);
    const from = SITE_CSS.indexOf('UI TIDY PHASE 4 — HOME IN TWO COLUMNS');
    const block = SITE_CSS.slice(from, SITE_CSS.indexOf('\n/* ', from));
    for (const m of block.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `font-size ${m[1]}px`);
  });
});

describe('UI tidy phase 4: a day with nothing late, and one late item among today’s', () => {
  test('nothing late: the line says so and the first box is plain; a late client message still comes first', async () => {
    const now = H.made.app.now();
    const today = localDate(now); // the UK day, so the test holds just after midnight too
    H.made.app.db.run("UPDATE staff_tasks SET due_on = ? WHERE status IN ('OPEN','IN_PROGRESS')", [today]);
    const acc = todayItems(H.actor('accounting'), H.made.app, now);
    assert.ok(acc.length > 0 && acc.every((t) => t.late !== true), 'Accounting should have jobs due today and none late');
    const body = (await H.get('accounting', '/staff')).body;
    assert.match(body, /<p class="lede">[^<]*\. Nothing is late\.<\/p>/);
    assert.deepEqual(kpis(body)[0], ['k-plain', 'Jobs late', '0']);
    // A client has waited a week for a reply: late, so it leads the list though it is drawn after the tasks.
    const b = H.made.app.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY name LIMIT 1');
    assert.ok(b !== undefined);
    H.made.app.db.run("INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES ('m-uit4', ?, NULL, 'FROM_CLIENT', 'EMAIL', NULL, NULL, 'Any news?', ?)",
      [b.id, new Date(Date.parse(now) - 9 * 864e5).toISOString()]);
    const sales = (await H.get('sales', '/staff')).body;
    const row = /<section class="homerow" aria-labelledby="row-today">([\s\S]*?)<\/section>/.exec(sales)?.[1] ?? '';
    assert.match(row, /^<h2 id="row-today">Do these first<\/h2><ul class="tiles hometiles"><li class="tile hometile late">/);
    assert.equal(kpis(sales)[0]?.[2], String(lateCount('sales')));
  });
});
