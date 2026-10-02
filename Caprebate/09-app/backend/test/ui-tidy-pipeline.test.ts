/**
 * UI TIDY PHASE 3 — THE PIPELINE AS ONE TABLE, 2 October 2026 (src/web/pipeline-pages.ts, pipelineTable).
 * Every claim the board shows is one row, grouped by stage with its colour; the boxes count from the same data; the
 * filters and the search narrow it; each row keeps its Move button; the board of columns is still one click away.
 * Counts are read from the store at the same moment, never written in, so the test does not depend on the date.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as C from '../src/web/crm.ts';
import { dueReading } from '../src/web/localtime.ts';
import { stageGroupOf, STAGE_GROUPS } from '../src/web/look.ts';
import { siteOf } from '../src/web/pipeline-pages.ts';

let H: Harness;
before(async () => { H = await startHarness('uit3'); });
after(() => H.close());

const rowsOf = (body: string): string[] => [...body.matchAll(/<tr><td data-label="Business and site">[\s\S]*?<\/tr>/g)].map((m) => m[0]);
const refOf = (row: string): string => /· (CR-\d{4}-\d{4})<\/span>/.exec(row)?.[1] ?? '';
const kpi = (body: string, label: string): string | null =>
  new RegExp(`<span class="kpi-label">${label}</span><span class="kpi-value">([^<]*)</span>`).exec(body)?.[1] ?? null;

function board(): { cards: C.BoardCard[]; inProgress: C.BoardCard[]; now: string } {
  const now = H.made.app.now();
  const b = C.pipelineBoard(H.made.app.db, H.actor('admin'), now);
  const inProgress = b.columns.flatMap((c) => c.cards);
  return { cards: [...inProgress, ...b.on_hold, ...b.exited.flatMap((e) => e.cards), ...b.unrecognised], inProgress, now };
}
const isLate = (c: C.BoardCard, now: string): boolean => dueReading(c.next_action_due, now).overdue;

describe('UI tidy phase 3: the pipeline as one table', () => {
  test('every claim the board shows is exactly one row, under its own group’s coloured band, in the groups’ order', async () => {
    const r = await H.get('admin', '/staff/pipeline');
    assert.equal(r.status, 200);
    const { cards } = board();
    const refs = rowsOf(r.body).map(refOf);
    assert.deepEqual([...refs].sort(), cards.map((c) => c.claim_ref).sort());
    const bands = [...r.body.matchAll(/<tr class="bandrow"><th scope="colgroup" colspan="\d"><p class="band g-([a-z]+)">([^<]*)<\/p>/g)].map((m) => [m[1], m[2]]);
    const used = STAGE_GROUPS.filter((g) => cards.some((c) => stageGroupOf(c.stage_key)?.key === g.key));
    assert.deepEqual(bands.map((b) => b[0]), used.map((g) => g.key));
    for (const g of used) {
      const n = cards.filter((c) => stageGroupOf(c.stage_key)?.key === g.key).length;
      assert.ok(bands.some(([k, text]) => k === g.key && (text ?? '').startsWith(`${g.name} · `) && (text ?? '').endsWith(` · ${n} ${n === 1 ? 'claim' : 'claims'}`)), g.name);
    }
    // Each row sits under its own group's band.
    for (const m of r.body.matchAll(/<tbody><tr class="bandrow">[\s\S]*?class="band g-([a-z]+)"[\s\S]*?<\/tbody>/g)) {
      for (const row of rowsOf(m[0])) {
        const c = cards.find((x) => x.claim_ref === refOf(row));
        assert.equal(stageGroupOf(c?.stage_key)?.key, m[1], refOf(row));
      }
    }
  });

  test('a row names the business, then the site and claim number, its stage in its colour, its next step and when, its owner', async () => {
    const r = await H.get('admin', '/staff/pipeline');
    const { cards, now } = board();
    for (const row of rowsOf(r.body)) {
      const c = cards.find((x) => x.claim_ref === refOf(row));
      assert.ok(c !== undefined);
      assert.ok(row.includes(`<a class="rowlink" href="/staff/claims/${c.id}">`), c.claim_ref);
      assert.ok(row.includes(`${siteOf(c.client, c.property).replace(/&/g, '&amp;')} · ${c.claim_ref}`), c.claim_ref);
      const g = stageGroupOf(c.stage_key);
      if (g !== null) assert.match(row, new RegExp(`<span class="badge g-${g.key}">`), c.claim_ref);
      if (c.owner === null) assert.match(row, /<span class="badge b-nobody">Nobody yet<\/span>/, c.claim_ref);
      if (c.next_action !== null && isLate(c, now)) assert.match(row, /<span class="badge b-late">\d+ days? late<\/span>/, c.claim_ref);
      if (c.next_action !== null && c.next_action_due === null) assert.match(row, /<span class="badge b-nodate">No date<\/span>/, c.claim_ref);
      if (c.next_action === null) assert.match(row, /No next step yet/, c.claim_ref);
      if (c.next !== undefined) {
        assert.ok(row.includes(`<input type="hidden" name="to" value="${c.next.key}">`), c.claim_ref);
        assert.match(row, /<input type="hidden" name="back" value="board"><button type="submit" class="btn-quiet">Move to /);
      }
    }
  });

  test('a late next step is red on its row, read straight from the claim’s next-step task', async () => {
    const now = H.made.app.now();
    // Whatever today is, one claim's next step is made three days late, so there is always one to read.
    const one = H.made.app.db.get<{ id: string }>("SELECT id FROM staff_tasks WHERE claim_id IS NOT NULL AND is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS') ORDER BY id LIMIT 1");
    assert.ok(one !== undefined);
    H.made.app.db.run('UPDATE staff_tasks SET due_on = ? WHERE id = ?', [new Date(Date.parse(now) - 3 * 864e5).toISOString().slice(0, 10), one.id]);
    const r = await H.get('admin', '/staff/pipeline');
    const tasks = H.made.app.db.all<{ claim_ref: string; due_on: string | null }>(
      "SELECT c.claim_ref, t.due_on FROM claims c JOIN staff_tasks t ON t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')");
    const late = tasks.filter((t) => dueReading(t.due_on, now).overdue);
    assert.ok(late.length > 0, 'the seed has no late next step to read');
    for (const row of rowsOf(r.body)) {
      const t = tasks.find((x) => x.claim_ref === refOf(row));
      assert.equal(/class="badge b-late"/.test(row), t !== undefined && dueReading(t.due_on, now).overdue, refOf(row));
    }
  });

  test('within a group the latest next step comes first', async () => {
    const r = await H.get('admin', '/staff/pipeline');
    const { cards, now } = board();
    const days = (ref: string): number => {
      const c = cards.find((x) => x.claim_ref === ref);
      const d = dueReading(c?.next_action_due ?? null, now);
      return d.overdue ? Number(/^(\d+)/.exec(d.words)?.[1]) : -1;
    };
    for (const m of r.body.matchAll(/<tbody>[\s\S]*?<\/tbody>/g)) {
      const lateness = rowsOf(m[0]).map((row) => days(refOf(row))).filter((n) => n >= 0);
      assert.deepEqual(lateness, [...lateness].sort((a, b) => b - a));
    }
  });

  test('the boxes count from the same data, and two of them open their filter', async () => {
    const r = await H.get('admin', '/staff/pipeline');
    const { inProgress, now } = board();
    assert.equal(kpi(r.body, 'In progress'), String(inProgress.length));
    assert.equal(kpi(r.body, 'Next step late'), String(inProgress.filter((c) => isLate(c, now)).length));
    assert.equal(kpi(r.body, 'Nobody owns it'), String(inProgress.filter((c) => c.owner_id === null).length));
    assert.match(r.body, /<a class="kpi k-late" href="\/staff\/pipeline\?show=late">/);
    assert.match(r.body, /<a class="kpi k-warn" href="\/staff\/pipeline\?show=nobody">/);
    assert.match(r.body, /<div class="groupbar" role="img"/);
  });
});

describe('UI tidy phase 3: finding a claim', () => {
  test('Late, Mine and Nobody owns it each show exactly their claims, and the current one is marked', async () => {
    const { cards, now } = board();
    const me = H.actor('admin').id;
    const cases: [string, (c: C.BoardCard) => boolean][] = [
      ['late', (c) => isLate(c, now)], ['mine', (c) => c.owner_id === me], ['nobody', (c) => c.owner_id === null], ['', () => true], ['nonsense', () => true],
    ];
    for (const [show, keep] of cases) {
      const r = await H.get('admin', `/staff/pipeline${show === '' ? '' : `?show=${show}`}`);
      const want = cards.filter(keep).map((c) => c.claim_ref).sort();
      const got = rowsOf(r.body).map(refOf).sort();
      if (want.length === 0) assert.match(r.body, /No claim matches/);
      else assert.deepEqual(got, want, show);
      const marked = show === 'nonsense' ? '' : show;
      assert.match(r.body, new RegExp(`<a href="/staff/pipeline${marked === '' ? '' : `\\?show=${marked}`}" aria-current="page">`), show);
    }
  });

  test('the search finds by business, site or claim number, keeps the filter, and is escaped', async () => {
    const { cards } = board();
    const one = cards[cards.length - 1];
    assert.ok(one !== undefined);
    assert.deepEqual(rowsOf((await H.get('admin', `/staff/pipeline?q=${one.claim_ref.toLowerCase()}`)).body).map(refOf), [one.claim_ref]);
    const word = one.client.split(' ')[0] ?? '';
    assert.deepEqual(rowsOf((await H.get('admin', `/staff/pipeline?q=${encodeURIComponent(word)}`)).body).map(refOf).sort(),
      cards.filter((c) => c.client.includes(word) || (c.property ?? '').includes(word)).map((c) => c.claim_ref).sort());
    const late = await H.get('admin', `/staff/pipeline?q=${encodeURIComponent(word)}&show=late`);
    assert.match(late.body, /<input type="hidden" name="show" value="late">/);
    assert.match(late.body, new RegExp(`<a href="/staff/pipeline\\?q=${encodeURIComponent(word)}&amp;show=mine">Mine</a>`));
    const odd = await H.get('admin', '/staff/pipeline?q=%3Cb%3Ex%22');
    assert.match(odd.body, /value="&lt;b&gt;x&quot;"/);
    assert.match(odd.body, /No claim matches\. <a href="\/staff\/pipeline">Show every claim<\/a>/);
  });

  test('the site drops the company’s name, which the row already shows', () => {
    assert.equal(siteOf('Dunmarrow Medical Practice Limited', 'Dunmarrow Medical Practice Limited — branch surgery'), 'branch surgery');
    assert.equal(siteOf('A Ltd', 'Somewhere else'), 'Somewhere else');
    assert.equal(siteOf('A Ltd', null), 'no property recorded');
  });
});

describe('UI tidy phase 3: nothing was taken away', () => {
  test('the board of columns is one click away, with its Move buttons, and each view returns to itself after a move', async () => {
    const list = await H.get('sales', '/staff/pipeline');
    assert.match(list.body, /<a class="btn" href="\/staff\/pipeline\?layout=board">Show as a board<\/a>/);
    const cols = await H.get('sales', '/staff/pipeline?layout=board');
    assert.match(cols.body, /<ol class="board"/);
    assert.match(cols.body, /<input type="hidden" name="back" value="columns">/);
    assert.match(cols.body, /<a class="btn" href="\/staff\/pipeline">Show as a list<\/a>/);
    // A move that is allowed returns to the view it was pressed on; one that is refused offers a way back to the list.
    const { cards } = board();
    const movable = cards.filter((x) => x.next !== undefined);
    const outcomes: string[] = [];
    for (const c of movable) {
      if (c.next === undefined) continue;
      const r = await H.post('sales', `/staff/claims/${c.id}/stage`, { kind: 'FORWARD', to: c.next.key, back: 'columns' });
      if (r.status === 303) { assert.equal(r.location, '/staff/pipeline?layout=board&done=moved'); outcomes.push('moved'); break; }
      assert.equal(r.status, 400, c.claim_ref);
      outcomes.push('refused');
    }
    assert.ok(outcomes.includes('moved'), 'no claim on the seed could move, so the return address was never read');
    // A refused move says why and goes back to the view it was pressed on: the board for `columns`, the table for `board`.
    const stuck = board().cards.find((x) => x.next !== undefined);
    assert.ok(stuck?.next !== undefined);
    const onCols = await H.post('sales', `/staff/claims/${stuck.id}/stage`, { kind: 'FORWARD', to: 'CLOSED', back: 'columns' });
    assert.equal(onCols.status, 400);
    assert.match(onCols.body, /<a href="\/staff\/pipeline\?layout=board">Go back<\/a>/);
    const onList = await H.post('sales', `/staff/claims/${stuck.id}/stage`, { kind: 'FORWARD', to: 'CLOSED', back: 'board' });
    assert.equal(onList.status, 400);
    assert.match(onList.body, /<a href="\/staff\/pipeline">Go back<\/a>/);
  });

  test('Record a lead is offered only to a login that may record one', async () => {
    assert.match((await H.get('sales', '/staff/pipeline')).body, /<a class="btn btn-primary" href="\/staff\/leads\?record=1#record-lead">Record a lead<\/a>/);
    assert.match((await H.get('admin', '/staff/pipeline')).body, /href="\/staff\/leads\?record=1#record-lead"/);
    const ro = await H.get('readonly', '/staff/pipeline');
    assert.equal(ro.status, 200);
    assert.doesNotMatch(ro.body, /record-lead/);
  });

  test('the range shows only where the login may read it, and the page is refused where the board is', async () => {
    const admin = await H.get('admin', '/staff/pipeline');
    assert.match(admin.body, /<th scope="col">Range shown<\/th>/);
    const ro = await H.get('readonly', '/staff/pipeline');
    const roBoard = C.pipelineBoard(H.made.app.db, H.actor('readonly'), H.made.app.now());
    const roSees = roBoard.columns.flatMap((c) => c.cards).some((c) => c.value !== undefined);
    assert.equal(/Range shown/.test(ro.body), roSees);
    for (const who of ['accounting', 'surveying'] as const) assert.equal((await H.get(who, '/staff/pipeline')).status, 403, who);
  });
});
