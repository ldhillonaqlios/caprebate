/**
 * UI TIDY PHASE 9 — TASKS, 3 October 2026 (src/web/tasks-pages.ts).
 * A line of counts and solid boxes; the tasks first, late in a red label with its date under it, the company said once;
 * the longer lists folded, each with how many it holds. Counts are read from the same store at the same moment.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as T from '../src/web/tasks.ts';
import { dueCell } from '../src/web/tasks-pages.ts';
import { SITE_CSS } from '../src/web/assets.ts';

let H: Harness;
before(async () => { H = await startHarness('uit9'); });
after(() => H.close());

const work = (): T.MyWork => T.myWork(H.made.app.db, H.actor('sales'), H.made.app.now());
const kpis = (body: string): [string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-[a-z]+" href="([^"]*)"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '']);

describe('UI tidy phase 9: the top of Tasks', () => {
  test('a line of counts and four boxes, from the same tasks the table lists', async () => {
    const w = work();
    const body = (await H.get('sales', '/staff/tasks')).body;
    assert.match(body, new RegExp(`<h1>Tasks</h1><p class="lede">${w.tasks.length} open · ${w.overdue} late</p>`));
    const noStep = w.claims_without_next_action.length + w.unowned_claims_breaking.length;
    assert.deepEqual(kpis(body), [
      ['#my-tasks', 'Late', String(w.overdue)],
      ['#my-tasks', 'Due today', String(w.tasks.filter((t) => t.due.state === 'DUE_TODAY').length)],
      ['#my-tasks', 'No due date', String(w.tasks.filter((t) => t.due.state === 'NO_DUE_DATE').length)],
      ['/staff/next-actions', 'Claims with no next step', String(noStep)],
    ]);
  });

  test('the claims-with-no-next-step box only for a login that may open that list', async () => {
    const acc = (await H.get('accounting', '/staff/tasks')).body;
    assert.equal(kpis(acc).some((k) => k[1] === 'Claims with no next step'), (await H.get('accounting', '/staff/next-actions')).status === 200);
  });
});

describe('UI tidy phase 9: each task', () => {
  test('late: a red label, its date under it; no date: a grey label; on time: the words', () => {
    assert.equal(dueCell({ state: 'OVERDUE', overdue: true, label: '3 days overdue (29 Sep 2026)' } satisfies T.DueReading).html,
      '<span class="badge b-late">3 days overdue</span><br><span class="help">29 Sep 2026</span>');
    assert.equal(dueCell({ state: 'NO_DUE_DATE', overdue: false, label: T.NO_DUE_DATE } satisfies T.DueReading).html,
      '<span class="badge b-nodate">no due date — so it is not overdue, and it is not on time either</span>');
    assert.equal(dueCell({ state: 'NOT_YET_DUE', overdue: false, label: 'Due in 3 days (5 Oct 2026)' } satisfies T.DueReading).html, 'Due in 3 days (5 Oct 2026)');
  });

  test('every late task is red on its row, and a company already named in a claim is not named again', async () => {
    const w = work();
    const body = (await H.get('sales', '/staff/tasks')).body;
    for (const t of w.tasks) {
      const row = new RegExp(`<tr class="[^"]*">\\s*<td><a href="/staff/tasks/${t.id}">[\\s\\S]*?</tr>`).exec(body)?.[0] ?? '';
      assert.ok(row !== '', t.title);
      assert.equal(row.includes('class="badge b-late"'), t.due.overdue, t.title);
      const about = /<\/td>\s*<td>([\s\S]*?)<\/td>/.exec(row)?.[1] ?? '';
      for (const a of t.about) {
        const shown = about.includes(`>${a.label.replace(/&/g, '&amp;')}<`);
        const repeated = a.kind === 'organisation' && t.about.some((b) => b !== a && b.label.includes(a.label));
        assert.equal(shown, !repeated, `${t.title}: ${a.label}`);
      }
    }
  });

  test('the claim’s next action is a quiet label, not red words', async () => {
    const body = (await H.get('sales', '/staff/tasks')).body;
    assert.match(body, /<span class="badge b-info">the claim’s next action<\/span>/);
    assert.doesNotMatch(body, /<strong>the claim’s next action<\/strong>/);
    assert.match(SITE_CSS, /table tr\.overdue\{color:inherit\}/);
  });
});

describe('UI tidy phase 9: the longer lists, folded', () => {
  test('each folded list says how many it holds and still holds every one', async () => {
    const w = work();
    const body = (await H.get('sales', '/staff/tasks')).body;
    const fold = (title: string): string => new RegExp(`<details class="morelist"><summary>${title} <span class="count">(\\d+)</span></summary>([\\s\\S]*?)</details>`).exec(body)?.[0] ?? '';
    const noStep = fold('Claims with no next step, owner or date');
    assert.match(noStep, new RegExp(`<span class="count">${w.claims_without_next_action.length + w.unowned_claims_breaking.length}</span>`));
    for (const c of [...w.claims_without_next_action, ...w.unowned_claims_breaking]) assert.ok(noStep.includes(`/staff/claims/${c.id}`), c.claim_ref);
    const mine = fold('My claims, their next actions, and who is waiting');
    assert.match(mine, new RegExp(`<span class="count">${w.my_claims.length}</span>`));
    for (const c of w.my_claims) assert.ok(mine.includes(`/staff/claims/${c.id}`), c.claim_ref);
    assert.doesNotMatch(body, /<details class="morelist" open/);
  });

  test('a list with nothing in it is not drawn at all', async () => {
    const body = (await H.get('accounting', '/staff/tasks')).body;
    const w = T.myWork(H.made.app.db, H.actor('accounting'), H.made.app.now());
    assert.equal(body.includes('My claims, their next actions'), w.my_claims.length > 0);
  });
});
