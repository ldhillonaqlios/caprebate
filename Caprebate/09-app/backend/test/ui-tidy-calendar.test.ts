/**
 * UI TIDY PHASE 13 — THE CALENDAR, 3 October 2026 (src/web/staff.ts calendarPage).
 * The page says which day or week it shows, with Earlier, Today, Later and the switch; four boxes count the calls held
 * and the three lists; the week is seven boxes, one a day; a call with nobody on it says so in amber and a cancelled
 * one in red; "Give it a time" only for a login that may arrange calls; the cancelled calls fold away with their count;
 * the sections are in the left-hand menu.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as B from '../src/web/backoffice.ts';
import { calendarCounts } from '../src/web/staff.ts';
import { localDate } from '../src/web/localtime.ts';

let H: Harness;
let held = '';
let gone = '';
before(async () => {
  H = await startHarness('uit13');
  const db = H.made.app.db;
  const waiting = db.all<{ id: string }>("SELECT id FROM bookings WHERE starts_at IS NULL AND cancelled_at IS NULL AND channel IN ('phone', 'video') ORDER BY created_at, id");
  assert.ok(waiting.length >= 3, 'the seed has calls waiting for a time');
  held = waiting[0]?.id ?? '';
  gone = waiting[1]?.id ?? '';
  // Monday 5 October 2026: one call at 09:00 UK time with nobody on it; Tuesday: one cancelled.
  db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, assigned_to = NULL WHERE id = ?', ['2026-10-05T08:00:00.000Z', '2026-10-05T09:00:00.000Z', held]);
  db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, cancelled_at = ?, cancelled_by = (SELECT id FROM users WHERE email = ?) WHERE id = ?',
    ['2026-10-06T13:00:00.000Z', '2026-10-06T14:00:00.000Z', '2026-10-02T10:00:00.000Z', 'sales@example.invalid', gone]);
});
after(() => H.close());

const view = (v: 'day' | 'week', date: string): B.CalendarView =>
  B.calendar(H.made.app.db, H.actor('sales'), { view: v, date: `${date}T12:00:00.000Z`, now: H.made.app.now() });
const kpis = (body: string): [string, string, string, string][] =>
  [...body.matchAll(/<a class="kpi k-([a-z]+)" href="([^"]*)"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '', m[3] ?? '', m[4] ?? '']);

describe('UI tidy phase 13: the top of the Calendar', () => {
  test('the day names itself, and Earlier, Today, Later and the switch go where they say', async () => {
    const body = (await H.get('sales', '/staff/calendar?view=day&date=2026-10-05')).body;
    assert.match(body, /<h1>Calendar<\/h1>\s*<p class="lede">Monday 5 Oct 2026<\/p>/);
    const today = localDate(H.made.app.now());
    const nav = /<p class="calnav">([\s\S]*?)<\/p>/.exec(body)?.[1] ?? '';
    assert.deepEqual([...nav.matchAll(/<a class="btn[^"]*" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]), [
      ['/staff/calendar?view=day&amp;date=2026-10-04', '← Earlier'], [`/staff/calendar?view=day&amp;date=${today}`, 'Today'],
      ['/staff/calendar?view=day&amp;date=2026-10-06', 'Later →'], ['/staff/calendar?view=week&amp;date=2026-10-05', 'Show the week'],
    ]);
  });

  test('four boxes count the calls held in the window and the three lists, from the same view', async () => {
    for (const [v, label] of [['day', 'Calls that day'], ['week', 'Calls that week']] as const) {
      const cal = view(v, '2026-10-05');
      const n = calendarCounts(cal);
      assert.equal(n.held, 1, 'the cancelled call is not counted as held');
      const body = (await H.get('sales', `/staff/calendar?view=${v}&date=2026-10-05`)).body;
      assert.deepEqual(kpis(body), [
        ['total', '#booked', label, String(n.held)],
        ['warn', '#waiting', 'Waiting for a time', String(n.awaiting)],
        ['plain', '#another-way', 'Asked another way', String(n.another_way)],
        ['plain', '#cancelled', 'Cancelled', String(n.cancelled)],
      ]);
    }
  });

  test('the counts: a cancelled call is not held; nothing waiting is not amber', () => {
    const row = (cancelled_at: string | null): B.BookingRow => ({ cancelled_at } as B.BookingRow);
    assert.deepEqual(calendarCounts({ days: [{ date: 'd', bookings: [row(null), row('x'), row(null)] }, { date: 'e', bookings: [row(null)] }], awaiting: [], capture_only: [row(null)], cancelled: [row('x'), row('y')] }),
      { held: 3, awaiting: 0, another_way: 1, cancelled: 2 });
  });
});

describe('UI tidy phase 13: the week and the day', () => {
  test('the week is seven boxes, Monday to Sunday, each with its calls or "Nothing booked"', async () => {
    const body = (await H.get('sales', '/staff/calendar?view=week&date=2026-10-07')).body;
    const grid = /<ol class="weekgrid">([\s\S]*?)<\/ol>/.exec(body)?.[1] ?? '';
    // PHASE 156a (5 Oct 2026): on a real day inside this week, that day's heading also carries the "Today" badge; the
    // pattern read only plain text, so this test failed every day from Mon 5 to Sun 11 Oct 2026 and passed otherwise.
    const days = [...grid.matchAll(/<li class="wday[^"]*">\s*<p class="wday-h">([^<]+?)(?: <span class="badge b-info">Today<\/span>)?<\/p>([\s\S]*?)<\/li>(?=<li class="wday|$)/g)];
    assert.deepEqual(days.map((d) => d[1]), ['Mon 5 Oct 2026', 'Tue 6 Oct 2026', 'Wed 7 Oct 2026', 'Thu 8 Oct 2026', 'Fri 9 Oct 2026', 'Sat 10 Oct 2026', 'Sun 11 Oct 2026']);
    const mon = days[0]?.[2] ?? '';
    assert.match(mon, new RegExp(`<a href="/staff/calendar/${held}"><strong>09:00</strong> [^<]+</a>\\s*<span class="wmeta">[^<]+</span><span class="wmeta"><span class="badge b-nobody">Nobody yet</span></span>`));
    assert.match(days[1]?.[2] ?? '', new RegExp(`href="/staff/calendar/${gone}"[\\s\\S]*<span class="badge b-late">Cancelled</span>`));
    for (const d of days.slice(2)) assert.match(d[2] ?? '', /^\s*<p class="wnone">Nothing booked<\/p>\s*$/, d[1] ?? '');
  });

  test('today’s box is marked, and only today’s', async () => {
    const today = localDate(H.made.app.now());
    const body = (await H.get('sales', `/staff/calendar?view=week&date=${today}`)).body;
    assert.equal((body.match(/<li class="wday today">/g) ?? []).length, 1);
    assert.equal((body.match(/<span class="badge b-info">Today<\/span>/g) ?? []).length, 1);
  });

  test('the day is one table: the time, nobody in amber, a stacked table on a phone, Open', async () => {
    const body = (await H.get('sales', '/staff/calendar?view=day&date=2026-10-05')).body;
    const table = /<h2 id="booked">The day<\/h2>\s*<table class="stack">[\s\S]*?<\/table>/.exec(body)?.[0] ?? '';
    assert.match(table, new RegExp(`<td><strong>09:00</strong></td>[\\s\\S]*<td data-label="Assigned to"><span class="badge b-nobody">Nobody yet</span></td>\\s*<td><a class="btn" href="/staff/calendar/${held}">Open</a></td>`));
    const empty = (await H.get('sales', '/staff/calendar?view=day&date=2026-10-08')).body;
    assert.match(empty, /<h2 id="booked">The day<\/h2>\s*<p class="help">Nothing booked\.<\/p>/);
  });
});

describe('UI tidy phase 13: the lists', () => {
  test('each waiting call says Give it a time to Sales, and Open to a login that cannot arrange calls', async () => {
    const waiting = view('day', '2026-10-05').awaiting;
    assert.ok(waiting.length > 0);
    const sales = (await H.get('sales', '/staff/calendar')).body;
    const ro = (await H.get('readonly', '/staff/calendar')).body;
    for (const b of waiting) {
      assert.ok(sales.includes(`<a class="btn btn-primary" href="/staff/calendar/${b.id}">Give it a time</a>`), b.id);
      assert.ok(ro.includes(`<a class="btn" href="/staff/calendar/${b.id}">Open</a>`), b.id);
    }
    assert.doesNotMatch(ro, /Give it a time/);
  });

  test('the cancelled calls fold away with how many, and still list each one', async () => {
    const cal = view('day', '2026-10-05');
    const body = (await H.get('sales', '/staff/calendar')).body;
    const fold = /<details class="morelist" id="cancelled"><summary>Cancelled calls <span class="count">(\d+)<\/span><\/summary>([\s\S]*?)<\/details>/.exec(body);
    assert.equal(fold?.[1], String(cal.cancelled.length));
    assert.ok(cal.cancelled.length > 0);
    for (const b of cal.cancelled) assert.ok(fold?.[2]?.includes(`href="/staff/calendar/${b.id}"`), b.id);
    assert.match(body, /<h2 id="waiting">Asked for a call, no time yet<\/h2>[\s\S]*id="cancelled"[\s\S]*<h2 id="another-way">/);
  });

  test('the left-hand menu: Day or Week marked, then the three lists with their counts', async () => {
    const n = calendarCounts(view('week', '2026-10-05'));
    const body = (await H.get('sales', '/staff/calendar?view=week&date=2026-10-07')).body;
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    const sub = [...(/<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1] ?? '').matchAll(/<a href="([^"]+)"( aria-current="page")?>([^<]+)(?: <span class="subnote">(\d+)<\/span>)?<\/a>/g)]
      .map((m) => [m[1], m[2] !== undefined, m[3], m[4] ?? '']);
    const at = '/staff/calendar?view=week&amp;date=2026-10-05';
    const c = (k: number): string => (k > 0 ? String(k) : '');
    assert.deepEqual(sub, [
      ['/staff/calendar?view=day&amp;date=2026-10-05', false, 'Day', ''], [at, true, 'Week', ''],
      [`${at}#waiting`, false, 'Waiting for a time', c(n.awaiting)], [`${at}#cancelled`, false, 'Cancelled', c(n.cancelled)],
      [`${at}#another-way`, false, 'Asked another way', c(n.another_way)],
    ]);
  });

  test('the closing note counts the staff with working times in plain words', async () => {
    const staff = B.assignableStaffIfPermitted(H.made.app.db, H.actor('sales')).length;
    const body = (await H.get('sales', '/staff/calendar')).body;
    assert.ok(staff > 1);
    assert.ok(body.includes(`${staff} members of staff have working times set.`));
    assert.doesNotMatch(body, /member\(s\)/);
  });
});
