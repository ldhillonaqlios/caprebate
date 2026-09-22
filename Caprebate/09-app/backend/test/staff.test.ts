/**
 * SECTION 1 (FILLED ASSESSMENTS) AND SECTION 2 (THE CALENDAR).
 *
 * FOUR OF THESE TESTS ARE THE PHASE BRIEF'S OWN, WORD FOR WORD:
 *
 *   "If the staff view and the client view of the same number ever differ, that
 *    is a defect, and a test should assert they do not."
 *   "Bookable slots come from working times — ONE source, not two."
 *   "A booking made in the client's journey appears here without anybody
 *    re-entering it … Prove it: move one, and show both views change."
 *   "If nobody is available, say so honestly rather than showing an empty grid."
 *
 * Each is driven END TO END OVER HTTP: a real funnel, a real submission, a real
 * sign-in, real pages. Comparing two calls to the same formatter would prove
 * that the formatter is deterministic and nothing about whether both screens
 * call it, which is the only way the numbers could ever have drifted.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { BOOKING } from '../src/web/engine.ts';
import {
  SLOT_MINUTES, distinctMoments, isBookable, publicSlots, slotsBetween,
  startOfLocalDay, startOfLocalWeek, addLocalDays,
} from '../src/web/schedule.ts';
import { localClock, localDate, localPartsOf, localWhen } from '../src/web/localtime.ts';
import { formatPence, formatShownRange, toPence } from '../src/web/shown-range.ts';
import { answerLabel } from '../src/web/backoffice.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';

type Client = {
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

type Harness = {
  close(): void;
  app: Awaited<ReturnType<typeof createApp>>['app'];
  client(): Client;
  signIn(role: AppRole): Promise<Client>;
  /** Runs the whole six-screen funnel and closes it. Returns what the client saw. */
  runFunnel(opts?: { channel?: string; slot?: string | null }): Promise<{
    c: Client; figureBody: string; closeBody: string; submittedBody: string;
  }>;
};

async function boot(opts: { workingTimes?: boolean } = {}): Promise<Harness> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-staff-'));
  const made = await createApp(':memory:', { documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const client = (): Client => {
    const c: Client = {
      cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
        }
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      post(path, fields) {
        return c.req(path, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(),
        });
      },
    };
    return c;
  };

  const hash = await made.app.hasher.hash(PASSWORD);
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`,
       `${role} Person`, role, hash, T, T],
    );
  }
  if (opts.workingTimes !== false) {
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      made.app.db.run(
        'INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
        [`wt-${weekday}`, 'u-SALES', weekday, 9 * 60, 17 * 60],
      );
    }
  }

  async function signIn(role: AppRole): Promise<Client> {
    const c = client();
    const r = await c.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
    assert.equal(r.status, 303, `${role} could not sign in`);
    return c;
  }

  async function runFunnel(o: { channel?: string; slot?: string | null } = {}): Promise<{
    c: Client; figureBody: string; closeBody: string; submittedBody: string;
  }> {
    const c = client();
    await c.req('/assessment');
    await c.post('/assessment/Q1', { own_prior_claim: 'no' });
    await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
    await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
    await c.post('/assessment/Q1c', { trigger_default: 'purchase' });
    /* ONE QUESTION IS DELIBERATELY LEFT BLANK — the legal entity. It was ASKED
       and not answered, which is what SKIPPED means, and it is the state the
       staff screens have to render as a fact rather than as an empty cell.
       NOTE THE DISTINCTION THIS FIXTURE ALSO ESTABLISHES: the works follow-ups
       below are never asked at all (works = 'no' closes that branch), and they
       produce NO ROW — not a SKIPPED row. "Nobody asked" and "asked, not
       answered" are different facts about a claim and the schema keeps them
       apart. Only the second is a skip. */
    await c.post('/assessment/Q2', {
      p0_address: 'Meadowcroft House, ZZ9 9ZZ', p0_sector: 'care_homes',
      p0_trigger: 'purchase', p0_spend: '2400000', p0_date: '06/2021',
    });
    await c.post('/assessment/Q3', { p0_works: 'no' });
    const figure = await c.req('/assessment/figure');
    const close = await c.req('/assessment/close');

    let slot = o.slot;
    if (slot === undefined) {
      const m = /name="slot" value="([^"]+)"/.exec(close.body);
      slot = m?.[1] ?? '';
    }
    const submitted = await c.post('/assessment/close', {
      full_name: 'A Person', business_name: 'Meadowcroft Care Limited',
      job_role: 'owner', channel: o.channel ?? 'phone', contact_value: '01632 960111',
      contact_consent: 'on', ...(slot === null || slot === '' ? {} : { slot }),
    });
    assert.equal(submitted.status, 200, 'the funnel did not close');
    return { c, figureBody: figure.body, closeBody: close.body, submittedBody: submitted.body };
  }

  return { close: made.close, app: made.app, client, signIn, runFunnel };
}

/** Every "£1,234" in a page. */
function pounds(body: string): string[] {
  return [...body.matchAll(/£[\d,]+/g)].map((m) => m[0]);
}

/* ================================================================== *
 * SECTION 1 — FILLED ASSESSMENTS
 * ================================================================== */

describe('the filled assessments list', () => {
  test('an assessment submitted through the funnel appears, newest first, with everything the brief asks for', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      assert.equal(list.status, 200);
      assert.match(list.body, /Meadowcroft Care Limited/, 'the business is not shown');
      assert.match(list.body, /care homes/, 'the sector is not shown');
      assert.match(list.body, /Meadowcroft House/, 'the property is not shown');
      assert.match(list.body, /Telephone — they asked for a call/, 'the contact method is not shown');
      // THE YEAR IS NOT WRITTEN DOWN. This read /2026-/ until CRM 9 of 10, and would have failed on every run from
      // 1 January 2027: the funnel runs on the real clock. Found by running the suite with the clock moved to
      // 2026-12-31T23:59:50Z, where this test and the next both failed.
      assert.match(list.body, /class="when">\d{1,2} [A-Z][a-z]{2} \d{4}, \d\d:\d\d</, 'the submission time is not shown');
    } finally { h.close(); }
  });

  test('NEWEST FIRST, and it is the order the rows come back in', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      // THE IDS IN THE ORDER THE PAGE PUT THEM, against the order the database
      // says they were submitted. Scraping the rendered timestamps would only
      // compare to the minute — two submissions in the same minute would tie
      // and the test would pass on a page that had reversed them.
      const onPage = [...list.body.matchAll(/\/staff\/assessments\/([A-Za-z0-9-]+)/g)].map((m) => m[1]);
      const newestFirst = h.app.db
        .all<{ id: string }>('SELECT id FROM assessments ORDER BY submitted_at DESC, id DESC')
        .map((r) => r.id);
      assert.equal(onPage.length, 2);
      assert.deepEqual(onPage, newestFirst, 'the list is not in newest-first order');
      // And the reader can actually read the date.
      assert.match(list.body, /class="when">\d{1,2} [A-Z][a-z]{2} \d{4}, \d\d:\d\d</,
        'the submission time is rendered as a raw ISO string');
    } finally { h.close(); }
  });

  test('EVERY question is shown in the order asked — including the skipped ones', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      const id = /\/staff\/assessments\/([A-Za-z0-9-]+)/.exec(list.body)?.[1];
      assert.ok(id !== undefined);
      const page = await staff.req(`/staff/assessments/${id}`);
      assert.equal(page.status, 200);

      const rows = h.app.db.all<{ ord: number; state: string }>(
        'SELECT ord, state FROM assessment_answers WHERE assessment_id = ? ORDER BY ord', [id]);
      assert.ok(rows.length >= 8, 'the funnel recorded suspiciously few answers');
      // Every ordinal, in order, on the page.
      // The ORDINAL COLUMN, anchored to its row — a bare /<td>(\d+)<\/td>/ also
      // matched the spend the client typed, which is an answer and not a number
      // in the first column.
      const shown = [...page.body.matchAll(/<tr class="[a-z_]+">\s*<td>(\d+)<\/td>/g)]
        .map((m) => Number(m[1]));
      assert.deepEqual(shown, rows.map((r) => r.ord + 1), 'the questions are not all there, in order');
    } finally { h.close(); }
  });

  test('“I DON’T KNOW” AND “SKIPPED” DISPLAY AS ANSWERS, never as an empty cell', async () => {
    const h = await boot();
    try {
      // Q1a is answered "don't know"; the works questions are never reached.
      await h.runFunnel();
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      const id = /\/staff\/assessments\/([A-Za-z0-9-]+)/.exec(list.body)?.[1] ?? '';
      const page = await staff.req(`/staff/assessments/${id}`);

      assert.match(page.body, /I don’t know — the client said so/);
      assert.match(page.body, /Not answered — this question was skipped/);
      // And the three states are counted on the page, so a reader can see at a
      // glance how much of this claim is actually known.
      assert.match(page.body, /answered “I don’t know”/);
      // AND NOT ONE EMPTY CELL IN THE ANSWER COLUMN. That is the actual claim,
      // and it is checked on the rendered table rather than on the labels.
      assert.equal(/<td><\/td>/.test(page.body), false, 'an answer rendered as an empty cell');

      // The label function itself never produces ''. Belt: the render is above.
      for (const [state, value] of [['ANSWERED', 'yes'], ['DONT_KNOW', null], ['SKIPPED', null]] as const) {
        assert.notEqual(answerLabel(state, value).trim(), '');
      }
      assert.match(answerLabel('ANSWERED', null), /no value was recorded/,
        'an ANSWERED row with no value would have rendered blank');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE NUMBER — the brief's own defect test
 * ================================================================== */

describe('the range shown', () => {
  test('THE STAFF VIEW AND THE CLIENT VIEW OF THE SAME NUMBER DO NOT DIFFER', async () => {
    const h = await boot();
    try {
      const run = await h.runFunnel();

      // 1 · what the CLIENT was shown, scraped off their own figure screen.
      const shownToClient = pounds(run.figureBody);
      assert.ok(shownToClient.length > 0, 'the client was shown no figure at all');
      const ceiling = shownToClient[0] ?? '';

      // 2 · the same client, in their own portal, after submitting.
      const portalSignIn = h.app.db.get<{ id: string }>('SELECT id FROM businesses LIMIT 1');
      assert.ok(portalSignIn !== undefined);
      assert.match(run.submittedBody, new RegExp(ceiling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'the thank-you page quoted a different figure from the one they were shown');

      // 3 · what a STAFF MEMBER reads.
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      assert.match(list.body, new RegExp(ceiling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `the staff list shows a different figure. Client saw ${ceiling}; staff page has ${pounds(list.body).join(', ')}`);

      const id = /\/staff\/assessments\/([A-Za-z0-9-]+)/.exec(list.body)?.[1] ?? '';
      const detail = await staff.req(`/staff/assessments/${id}`);
      assert.match(detail.body, new RegExp(ceiling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        'the staff detail page shows a different figure');
    } finally { h.close(); }
  });

  test('the conversion happens ONCE — double rounding is what this guards', () => {
    // £1,234.4999 is the case that used to differ: rounding the float gives
    // 1234 and rounding the pence gives 1235. One conversion, one answer.
    const pence = toPence(1234.4999);
    assert.equal(pence, 123450);
    assert.equal(formatPence(pence), '£1,235');
    // The client's screen and the staff screen both render THIS, from THIS.
    assert.equal(formatShownRange({ low_pence: null, high_pence: pence }), 'up to £1,235');
  });

  test('an absent figure is an em dash and a sentence — never £0', () => {
    assert.equal(formatPence(null), '—');
    assert.equal(formatShownRange({ low_pence: null, high_pence: null }), 'no figure was shown');
    assert.equal(formatShownRange({ low_pence: 1, high_pence: null }).includes('£0'), false);
  });
});

/* ================================================================== *
 * N1 — THE ANCHOR QUARANTINE REACHES THESE SCREENS
 * ================================================================== */

describe('N1 on the staff assessment screens', () => {
  test('SURVEYING is not shown our estimate — not hidden, ABSENT FROM THE PAGE', async () => {
    const h = await boot();
    try {
      const run = await h.runFunnel();
      const ceiling = pounds(run.figureBody)[0] ?? '';
      assert.notEqual(ceiling, '');

      const surveyor = await h.signIn('SURVEYING');
      const list = await surveyor.req('/staff/assessments');
      assert.equal(list.status, 200, 'a surveyor may read the assessment INPUTS');
      assert.match(list.body, /Meadowcroft Care Limited/, 'the inputs were withheld too');

      // Looked for THREE ways, as payload.test.ts looks for it: by the rendered
      // figure, by the raw pence at any depth of the response text, and by the
      // digits alone in case a formatter changed.
      assert.equal(list.body.includes(ceiling), false, 'the estimate was rendered to a surveyor');
      const pence = h.app.db.get<{ p: number | null }>(
        'SELECT shown_high_pence AS p FROM assessments LIMIT 1')?.p;
      assert.ok(pence !== null && pence !== undefined);
      assert.equal(list.body.includes(String(pence)), false, 'the raw pence reached a surveyor');
      assert.equal(list.body.includes(String(Math.round(pence / 100))), false,
        'the figure in whole pounds reached a surveyor');
      assert.match(list.body, /withheld/, 'the withholding is not even declared');

      const id = /\/staff\/assessments\/([A-Za-z0-9-]+)/.exec(list.body)?.[1] ?? '';
      const detail = await surveyor.req(`/staff/assessments/${id}`);
      assert.equal(detail.body.includes(ceiling), false, 'the estimate reached the detail page');
      assert.match(detail.body, /I don’t know — the client said so/,
        'the inputs a survey needs were withheld along with the estimate');
    } finally { h.close(); }
  });

  test('ACCOUNTING reaches neither section — it is not on those rows', async () => {
    const h = await boot();
    try {
      await h.runFunnel();
      const acct = await h.signIn('ACCOUNTING');
      assert.equal((await acct.req('/staff')).status, 200, 'accounting has a landing page');
      assert.equal((await acct.req('/staff/assessments')).status, 403);
      assert.equal((await acct.req('/staff/calendar')).status, 403);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * SECTION 2 — THE CALENDAR
 * ================================================================== */

describe('the calendar', () => {
  test('day and week views both render, and both name their window', async () => {
    const h = await boot();
    try {
      const staff = await h.signIn('SALES');
      const day = await staff.req('/staff/calendar?view=day&date=2026-09-09');
      assert.equal(day.status, 200);
      assert.match(day.body, /Day · 9 Sep 2026/); // Phase 133c: UK dates
      const week = await staff.req('/staff/calendar?view=week&date=2026-09-09');
      assert.equal(week.status, 200);
      // The 9th is a Wednesday, so its week runs from Monday the 7th.
      assert.match(week.body, /Week · 7 Sep 2026/, 'the week does not start on a Monday');
      assert.match(week.body, /to 13 Sep 2026/, 'the week does not end on a Sunday');
      assert.match(week.body, /Monday 7 Sep 2026/);
      assert.match(week.body, /Sunday 13 Sep 2026/);
    } finally { h.close(); }
  });

  test('ONE SOURCE: a slot outside working hours is not offered AND is refused if posted', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ slot: null });
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      const bookingId = /\/staff\/calendar\/([A-Za-z0-9-]+)"/.exec(cal.body)?.[1];
      assert.ok(bookingId !== undefined, 'the funnel booking did not reach the calendar');

      const page = await staff.req(`/staff/calendar/${bookingId}`);
      const offered = [...page.body.matchAll(/name="starts_at" value="([^"]+)"/g)].map((m) => m[1] ?? '');
      assert.ok(offered.length > 0, 'no slots were offered');
      /* Every offered slot falls inside 09:00-17:00, which is the only working
         period this harness set — AND IT IS CHECKED IN LOCAL MINUTES, which is
         the unit `working_times` is in since Phase 113a. Checking it in UTC
         hours passed all summer only because the two happened to agree in
         winter; in September it would demand slots an hour before anybody
         works. */
      for (const s of offered) {
        const mins = localPartsOf(Date.parse(s)).minuteOfDay;
        assert.ok(mins >= 540 && mins + SLOT_MINUTES <= 1020, `${s} is outside working hours`);
      }

      // AND THE WRITE PATH REFUSES ONE THAT WAS NEVER OFFERED. This is the half
      // that matters: the picker is a courtesy, the refusal is the control.
      //
      // THE TIME IS COMPUTED, NOT WRITTEN DOWN. This line read
      // '2026-09-09T03:00:00.000Z' until 9 September 2026, when it started
      // failing — not because anything broke, but because the application uses
      // the real clock and that moment had become the PAST. The refusal was
      // still working; it was refusing for the wrong reason, and the assertion
      // on the message is what caught it. A test that passes only while the
      // calendar agrees with it is a test with an expiry date, and this one had
      // reached its. Tomorrow at 03:00 UTC is always in the future and is always
      // outside a 09:00-17:00 working day, so it tests what it means to test on
      // every day it is ever run.
      const outside = `${localDate(new Date(Date.now() + 86_400_000).toISOString())}T03:00:00.000Z`;
      assert.equal(offered.includes(outside), false);
      const posted = await staff.post(`/staff/calendar/${bookingId}/schedule`,
        { starts_at: outside, assigned_to: '' });
      assert.equal(posted.status, 400);
      assert.match(posted.body, /outside the working hours/);
      assert.equal(
        h.app.db.get<{ s: string | null }>('SELECT starts_at AS s FROM bookings WHERE id = ?', [bookingId])?.s,
        null, 'a refused time was written anyway');
    } finally { h.close(); }
  });

  test('WITH NOBODY AVAILABLE IT SAYS SO, and does not draw an empty grid', async () => {
    const h = await boot({ workingTimes: false });
    try {
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      assert.equal(cal.status, 200);
      assert.match(cal.body, /No slots to offer/);
      assert.match(cal.body, /Nobody has set their working times/);
      // AND THE THREE STATES ARE TOLD APART rather than collapsed into one
      // empty array. "Nobody has set any hours", "there are hours but the
      // window is full" and "there is no staff at all" lead to three different
      // actions, and a screen that cannot distinguish them says none of them.
      const avail = publicSlots(h.app.db, T);
      assert.equal(avail.available, false);
      if (!avail.available) assert.equal(avail.reason, 'NO_WORKING_TIMES');
    } finally { h.close(); }
  });

  test('“ALREADY PASSED” IS NOT “ALREADY TAKEN” — and this one was found by looking', async () => {
    const h = await boot();
    try {
      /* THE DEFECT THIS PINS. The calendar was opened at six in the evening and
         said "every slot in this window is already taken" for a day on which
         nothing at all was booked. The hours had simply gone by. A staff member
         reading that would go hunting for bookings that do not exist, and the
         brief asks for honesty here in terms. Two states, told apart by asking
         the same question with and without the "not in the past" floor. */
      const day = '2026-09-09T00:00:00.000Z';            // a Wednesday
      const evening = '2026-09-09T18:30:00.000Z';        // after 17:00
      const morning = '2026-09-09T08:00:00.000Z';        // before 09:00

      const passed = slotsBetween(h.app.db, day, addLocalDays(day, 1), { now: evening });
      assert.equal(passed.available, false);
      if (!passed.available) {
        assert.equal(passed.reason, 'WINDOW_PASSED');
        assert.match(passed.say, /already passed/);
        assert.equal(/taken/.test(passed.say), false, 'it still claims the slots were booked');
      }

      // Before the day starts, the very same window is available.
      const ahead = slotsBetween(h.app.db, day, addLocalDays(day, 1), { now: morning });
      assert.equal(ahead.available, true);

      // And FULLY_BOOKED is still reachable, so the new state has not swallowed
      // it: fill the day with a booking that covers the whole of it.
      const biz = 'b-full';
      h.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
        [biz, 'Full Day Limited', 'gp', 'PAID', T]);
      h.app.db.run(
        'INSERT INTO bookings (id,business_id,assigned_to,channel,entry_point,starts_at,ends_at,created_at) ' +
          'VALUES (?,?,NULL,?,?,?,?,?)',
        /* THE WHOLE LOCAL DAY, not 09:00Z to 17:00Z. In September the working
           day 09:00-17:00 LOCAL is 08:00Z to 16:00Z, so the old fixture left the
           first two slots free and FULLY_BOOKED became reachable only by
           accident of the season. Covering the day end to end says what this
           test means whatever the month. */
        ['bk-full', biz, 'phone', 'funnel_close', '2026-09-08T23:00:00.000Z', '2026-09-09T23:00:00.000Z', T]);
      const full = slotsBetween(h.app.db, day, addLocalDays(day, 1), { now: morning });
      assert.equal(full.available, false);
      if (!full.available) assert.equal(full.reason, 'FULLY_BOOKED');
    } finally { h.close(); }
  });

  test('the public picker says so too, WITHOUT saying why — that is our business', async () => {
    const h = await boot({ workingTimes: false });
    try {
      const c = h.client();
      await c.req('/assessment');
      await c.post('/assessment/Q1', { own_prior_claim: 'no' });
      await c.post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
      await c.post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
      await c.post('/assessment/Q1c', { trigger_default: 'purchase' });
      await c.post('/assessment/Q2', {
        p0_address: 'Somewhere', p0_sector: 'dental', p0_entity_type: 'ltd',
        p0_trigger: 'purchase', p0_spend: '900000', p0_date: '01/2020',
      });
      await c.post('/assessment/Q3', { p0_works: 'no' });
      const close = await c.req('/assessment/close');
      assert.match(close.body, /We have no times to offer at the moment/);
      assert.equal(/working times/i.test(close.body), false,
        'the public page explained our internal staffing state');
    } finally { h.close(); }
  });

  test('A DIARY IS OFFERED ONLY WHERE THAT PERSON COULD OWN THE CALL', async () => {
    const h = await boot({ workingTimes: false });
    try {
      // Hours for the finance user and nobody else. They may set them —
      // `working_time.write` allows it — and they are not on `booking.write`,
      // so no slot of theirs is offerable.
      for (const weekday of [1, 2, 3, 4, 5]) {
        h.app.db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
          [`wt-acc-${weekday}`, 'u-ACCOUNTING', weekday, 9 * 60, 17 * 60]);
      }
      const only = slotsBetween(h.app.db, '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z',
        { now: '2026-09-09T00:00:00.000Z' });
      assert.equal(only.available, false,
        'the finance user’s diary was offered for a client call');

      // Give SALES the same hours and the same window fills up.
      for (const weekday of [1, 2, 3, 4, 5]) {
        h.app.db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
          [`wt-sales-${weekday}`, 'u-SALES', weekday, 9 * 60, 17 * 60]);
      }
      const withSales = slotsBetween(h.app.db, '2026-09-09T00:00:00.000Z', '2026-09-10T00:00:00.000Z',
        { now: '2026-09-09T00:00:00.000Z' });
      assert.equal(withSales.available, true);
      if (withSales.available) {
        // AND EVERY ONE OF THEM IS THEIRS. Not one belongs to the finance user.
        assert.ok(withSales.slots.every((sl) => sl.user_id === 'u-SALES'),
          'a slot was attributed to somebody who cannot own a call');
      }
    } finally { h.close(); }
  });

  test('A MOMENT IS OFFERED ONCE, however many diaries are free at it', async () => {
    const h = await boot();
    try {
      // Give the administrator the same hours as sales, so two bookable diaries
      // cover every moment. The picker must still show each moment once.
      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        h.app.db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
          [`wt-admin-${weekday}`, 'u-ADMIN', weekday, 9 * 60, 17 * 60]);
      }
      await h.runFunnel({ slot: null });
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      const id = /\/staff\/calendar\/([A-Za-z0-9-]+)"/.exec(cal.body)?.[1] ?? '';
      const page = await staff.req(`/staff/calendar/${id}`);
      const offered = [...page.body.matchAll(/name="starts_at" value="([^"]+)"/g)].map((m) => m[1] ?? '');
      assert.ok(offered.length > 0);
      assert.equal(new Set(offered).size, offered.length,
        `a moment was offered more than once: ${offered.join(', ')}`);

      // The per-diary list underneath it really does carry duplicates — which
      // is what the assign control needs, and is why the collapse is a separate
      // function rather than a change to the query.
      const raw0 = slotsBetween(h.app.db, startOfLocalDay(T), addLocalDays(startOfLocalDay(T), 3), {});
      assert.equal(raw0.available, true);
      if (raw0.available) {
        assert.ok(raw0.slots.length > distinctMoments(raw0.slots).length,
          'the fixture no longer has two diaries covering the same moment');
      }
    } finally { h.close(); }
  });

  test('a taken slot is not offered twice', async () => {
    const h = await boot();
    try {
      const first = await h.runFunnel();
      const held = h.app.db.get<{ s: string | null }>(
        'SELECT starts_at AS s FROM bookings WHERE starts_at IS NOT NULL LIMIT 1')?.s;
      assert.ok(held !== null && held !== undefined, 'the first client did not book a slot');
      void first;

      // THE WEEK IS NAMED, NOT LEFT TO THE CLOCK. Unnamed, this asked for the current week, and from
      // the start of that week's last slot (16:30 on a Sunday) until midnight there is no future slot
      // left in it, so the assertion failed on a correct page. Found by the Phase 130 sweep at 15:43 UTC
      // on Sunday 13 September 2026, and reproduced by moving the clock: red at that moment, green on a
      // Wednesday, a Saturday afternoon and a Sunday morning. The week after the held slot's own is
      // wholly in the future and holds no booking, whatever day the suite runs on.
      const staff = await h.signIn('SALES');
      const nextWeek = addLocalDays(startOfLocalWeek(held), 7);
      const cal = await staff.req(`/staff/calendar?view=week&date=${localDate(nextWeek)}`);
      assert.match(cal.body, /free 30-minute slots/);

      const again = isBookable(h.app.db, held, {});
      assert.equal(again.ok, false, 'a booked slot is still bookable');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE DEMONSTRATION THE BRIEF ASKS FOR
 * ================================================================== */

describe('one booking, two views', () => {
  test('IT ARRIVES FROM THE CLIENT’S JOURNEY WITH NOBODY RE-ENTERING IT', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ slot: null });
      // No staff member has touched anything. The row is the funnel's.
      const rows = h.app.db.all<{ id: string; entry_point: string; channel: string }>(
        'SELECT id, entry_point, channel FROM bookings');
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.entry_point, 'funnel_close');
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      assert.match(cal.body, /Asked for a call, no time yet/);
      assert.match(cal.body, /Meadowcroft Care Limited/);
    } finally { h.close(); }
  });

  test('MOVE ONE, AND BOTH VIEWS CHANGE — it is one record, not two', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ slot: null });

      // Give the client a login onto their own business, so their portal can be read.
      const biz = h.app.db.get<{ id: string }>('SELECT id FROM businesses LIMIT 1')?.id;
      assert.ok(biz !== undefined);
      const hash = await h.app.hasher.hash(PASSWORD);
      h.app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-CLIENT', 'client@example.invalid', 'client@example.invalid', 'Client Person',
         'CLIENT', hash, T, T, biz],
      );
      const clientC = h.client();
      assert.equal((await clientC.post('/login', { email: 'client@example.invalid', password: PASSWORD })).status, 303);

      const before = await clientC.req('/portal');
      assert.match(before.body, /No set time/, 'the client already had a time');

      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      const bookingId = /\/staff\/calendar\/([A-Za-z0-9-]+)"/.exec(cal.body)?.[1] ?? '';
      const page = await staff.req(`/staff/calendar/${bookingId}`);
      const offered = [...page.body.matchAll(/name="starts_at" value="([^"]+)"/g)].map((m) => m[1] ?? '');
      const firstSlot = offered[0] ?? '';
      const laterSlot = offered[4] ?? '';
      assert.notEqual(firstSlot, '');
      assert.notEqual(laterSlot, '');

      /* ---- 1 · schedule it ---- */
      assert.equal((await staff.post(`/staff/calendar/${bookingId}/schedule`,
        { starts_at: firstSlot, assigned_to: '' })).status, 303);

      /* THE DATE IN A QUERY STRING IS A LOCAL DATE (Phase 113a), so it is
         derived with the same function the screens use rather than sliced off
         the front of a UTC instant — which is the same date for four months of
         the year and the day before for the other eight. */
      const staffAfter1 = await staff.req(`/staff/calendar?view=day&date=${localDate(firstSlot)}`);
      assert.match(staffAfter1.body, /Meadowcroft Care Limited/);
      const clientAfter1 = await clientC.req('/portal');
      assert.ok(clientAfter1.body.includes(localWhen(firstSlot)), // Phase 133c: UK dates
        'the client’s portal did not show the appointment the back office made');
      assert.equal(/No set time/.test(clientAfter1.body), false);

      /* ---- 2 · MOVE it ---- */
      assert.equal((await staff.post(`/staff/calendar/${bookingId}/schedule`,
        { starts_at: laterSlot, assigned_to: '' })).status, 303);

      const clientAfter2 = await clientC.req('/portal');
      assert.ok(clientAfter2.body.includes(localWhen(laterSlot)),
        'the client’s portal did not follow the move');
      /* NARROWED TO THE APPOINTMENT TABLE IN PHASE 113a, and the reason is a
         real change rather than a convenience. The portal now also carries the
         client's own "change this time" picker, and the time the booking has
         just LEFT is free again — so it correctly appears in that list of
         alternatives. Asserting over the whole page would now be asserting that
         a freed slot is not offered back, which is the opposite of right. What
         must not still say the old time is the row that says when the call is. */
      const appointment = clientAfter2.body.slice(
        clientAfter2.body.indexOf('Your appointment'),
        clientAfter2.body.indexOf('Change or cancel this call')); // Phase 132e renamed the control
      assert.notEqual(appointment, '', 'the appointment section was not found on the page');
      assert.equal(appointment.includes(`at ${localClock(firstSlot)}`), false,
        'the client’s portal still shows the old time — that is two records, not one');

      /* ---- 3 · ONE ROW, and the move is on the record ---- */
      assert.equal(h.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookings')?.n, 1,
        'moving a booking created a second one');
      const history = h.app.db.all<{ from_starts_at: string | null; to_starts_at: string | null }>(
        'SELECT from_starts_at, to_starts_at FROM booking_changes ORDER BY at');
      assert.equal(history.length, 2);
      assert.equal(history[0]?.from_starts_at, null, 'scheduling should be a move from nothing');
      assert.equal(history[0]?.to_starts_at, firstSlot);
      assert.equal(history[1]?.from_starts_at, firstSlot);
      assert.equal(history[1]?.to_starts_at, laterSlot);
    } finally { h.close(); }
  });

  test('the client can pick their own moment in the funnel, and it is the same record', async () => {
    const h = await boot();
    try {
      const run = await h.runFunnel();
      assert.match(run.closeBody, /If you chose the telephone, when suits you\?/);
      assert.match(run.submittedBody, /We have held/);
      const row = h.app.db.get<{ starts_at: string | null; assigned_to: string | null; entry_point: string }>(
        'SELECT starts_at, assigned_to, entry_point FROM bookings');
      assert.notEqual(row?.starts_at, null, 'the client picked a slot and it was not held');
      assert.equal(row?.assigned_to, 'u-SALES', 'nobody was made responsible for the call');

      const staff = await h.signIn('SALES');
      const day = await staff.req(`/staff/calendar?view=day&date=${localDate(row?.starts_at ?? '')}`);
      assert.match(day.body, /Meadowcroft Care Limited/, 'the client’s own booking is not on the calendar');
    } finally { h.close(); }
  });

  test('A CHANNEL THAT DOES NOT BOOK A MOMENT CANNOT BE GIVEN ONE', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ channel: 'email', slot: null });
      assert.equal(BOOKING.booksASlot('email'), false, 'CB_BOOKING changed under this test');
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      assert.match(cal.body, /Asked to hear from us another way, not by a call/);
      const id = h.app.db.get<{ id: string }>('SELECT id FROM bookings')?.id ?? '';
      const r = await staff.post(`/staff/calendar/${id}/schedule`,
        { starts_at: '2026-09-09T10:00:00.000Z', assigned_to: '' });
      assert.equal(r.status, 400);
      assert.match(r.body, /does not get a time\. Only a phone call can be given one\./);
    } finally { h.close(); }
  });

  test('scheduling writes a calendar invitation to the outbox, and it is NOT SENT', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ slot: null });
      const staff = await h.signIn('SALES');
      const cal = await staff.req('/staff/calendar');
      const id = /\/staff\/calendar\/([A-Za-z0-9-]+)"/.exec(cal.body)?.[1] ?? '';
      const page = await staff.req(`/staff/calendar/${id}`);
      const slot = /name="starts_at" value="([^"]+)"/.exec(page.body)?.[1] ?? '';
      await staff.post(`/staff/calendar/${id}/schedule`, { starts_at: slot, assigned_to: '' });

      const msg = h.app.db.get<{ kind: string; sent_at: string | null; transport: string }>(
        'SELECT kind, sent_at, transport FROM outbox ORDER BY created_at DESC LIMIT 1');
      assert.equal(msg?.kind, 'CALENDAR_INVITE');
      assert.equal(msg?.sent_at, null, 'the stub reported something as sent');
      assert.equal(msg?.transport, 'STUB');

      // And the screen says so, rather than the comment saying so.
      const settings = await staff.req('/staff/settings');
      assert.match(settings.body, /<td>Saved — not sent yet<\/td>/);
      assert.match(settings.body, /<td>Calendar invite<\/td>/);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE VOCABULARY THAT WAS RETIRED
 * ================================================================== */

describe('one contact vocabulary, not two', () => {
  /**
   * REWRITTEN IN PHASE 113a, AND THE ASSERTION GOT STRONGER RATHER THAN WEAKER.
   *
   * It used to prove that migration 004's two triggers refused any value in
   * `businesses.preferred_contact`. Migration 007 REMOVED the column, so there
   * is nothing left for a trigger to guard: the write is now refused by the
   * schema, with a better error than the trigger's own message, and the triggers
   * are gone with the table they hung off.
   *
   * SO WHAT IS TESTED NOW IS THE ABSENCE ITSELF, AND WHAT THE REBUILD HAD TO NOT
   * BREAK — which is the part worth a test. Thirteen tables carry a foreign key
   * into `businesses`; the rebuild dropped and recreated it under
   * `foreign_keys = OFF`, and a rebuild that quietly orphaned one of those would
   * look exactly like a rebuild that worked.
   */
  test('`businesses.preferred_contact` IS GONE, and the rebuild that removed it left nothing broken', async () => {
    const h = await boot();
    try {
      await h.runFunnel();

      /* 1 · THE COLUMN IS NOT THERE. Asked of the live schema, not of a
             migration file — the file is what we intended, this is what ran. */
      const cols = h.app.db.all<{ name: string }>("SELECT name FROM pragma_table_info('businesses')")
        .map((r) => r.name);
      assert.equal(cols.includes('preferred_contact'), false, 'the column survived the rebuild');
      /* CHANGED BY CRM 1 of 10, 10 September 2026, and on purpose. This list was
         the seven columns 007 left, exactly. Migration 009 EXTENDS the table —
         the one thing that phase had to do to it — so the seven are now followed
         by precisely the ten 009 adds, and nothing else. A column either
         migration did not intend still fails this line. (`trading_name` is a
         generated column over `name` and table_info does not list one.) */
      assert.deepEqual(cols,
        ['id', 'name', 'sector', 'stage', 'contact_email', 'contact_phone', 'created_at',
          'legal_name', 'company_number', 'claimant_type', 'registered_address', 'trading_address', 'website',
          'client_status', 'source', 'owner_id', 'updated_at'],
        'the table changed by more than 007 removed and 009 added');

      /* 2 · AND WRITING TO IT FAILS AT THE SCHEMA, not at a trigger. */
      assert.throws(
        () => h.app.db.run('UPDATE businesses SET preferred_contact = ?', ['telephone']),
        /preferred_contact/,
        'the removed column still accepts a value',
      );

      /* 3 · THE TWO RETIREMENT TRIGGERS WENT WITH IT, deliberately: a trigger
             naming a column that does not exist is a fossil, not a control.
             CRM 1 of 10 put six triggers back on the table — the vocabulary
             pairs for claimant type, client status and source, which are
             triggers so that a later phase can change a list without the
             rebuild this migration needed. So what is asserted now is the
             point of the original line: the six are exactly those, and not one
             of them names the removed column. */
      const triggers = h.app.db.all<{ name: string; sql: string }>(
        "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'businesses' ORDER BY name");
      assert.deepEqual(triggers.map((t) => t.name), [
        'businesses_claimant_type_insert', 'businesses_claimant_type_update',
        'businesses_client_status_insert', 'businesses_client_status_update',
        'businesses_source_insert', 'businesses_source_update',
      ]);
      for (const t of triggers) {
        assert.equal(/preferred_contact/.test(t.sql), false, `${t.name} is a fossil naming the removed column`);
      }

      /* 4 · NOTHING WAS ORPHANED. This is the risk the rebuild carried and the
             reason migration 004 declined to take it. */
      assert.deepEqual(h.app.db.all('PRAGMA foreign_key_check'), []);
      assert.equal(h.app.db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys, 1,
        'foreign keys were left switched off after the rebuild');

      /* 5 · AND THEY STILL ENFORCE. A pragma reporting no violations proves
             nothing about a database that has stopped checking, so a child row
             pointing at no business must still be refused. */
      assert.throws(
        () => h.app.db.run(
          'INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)',
          ['p-orphan', 'b-does-not-exist', 'Nowhere', T]),
        /FOREIGN KEY/i,
        'the rebuild left referential integrity off',
      );

      /* 6 · THE ROWS SURVIVED IT. The funnel's business is still there, with
             its assessment, its property and its booking still attached. */
      const biz = h.app.db.get<{ id: string; name: string }>('SELECT id, name FROM businesses LIMIT 1');
      assert.equal(biz?.name, 'Meadowcroft Care Limited');
      const id = biz?.id ?? '';
      /* THE THREE STATEMENTS ARE WRITTEN OUT rather than built from a table
         name: `npm run lint:sql` refuses SQL assembled from a variable, and it
         is right to — this is a test, and the rule does not have exceptions for
         tests. */
      const counts: [string, number][] = [
        ['properties', h.app.db.get<{ c: number }>(
          'SELECT COUNT(*) AS c FROM properties WHERE business_id = ?', [id])?.c ?? 0],
        ['assessments', h.app.db.get<{ c: number }>(
          'SELECT COUNT(*) AS c FROM assessments WHERE business_id = ?', [id])?.c ?? 0],
        ['bookings', h.app.db.get<{ c: number }>(
          'SELECT COUNT(*) AS c FROM bookings WHERE business_id = ?', [id])?.c ?? 0],
      ];
      for (const [table, c] of counts) {
        assert.ok(c > 0, `${table} lost its link to the business`);
      }
    } finally { h.close(); }
  });

  test('the channel a screen shows is CB_BOOKING’s, on the booking row', async () => {
    const h = await boot();
    try {
      await h.runFunnel({ channel: 'email', slot: null });
      const staff = await h.signIn('SALES');
      const list = await staff.req('/staff/assessments');
      assert.match(list.body, /Email/);
      assert.equal(/virtual/i.test(list.body), false, 'a removed channel reached a screen');
      // CB_BOOKING is asked, not second-guessed.
      assert.deepEqual(BOOKING.CHANNELS.map((c) => c.id), ['phone', 'sms_whatsapp', 'email']);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE WINDOW ARITHMETIC, which is easy to get wrong and quiet about it
 * ================================================================== */

describe('the calendar window', () => {
  /* THESE THREE ASSERT LOCAL DAYS, and that is the change Phase 113a made.
     They used to assert UTC midnights, which is the same thing for four months
     of the year and an hour out for the other eight — so a calendar drawn from
     one put the first hour of every summer day in the previous column. The
     expectations below are written as LOCAL dates, derived with the same
     function the screens use. */

  test('a week starts on Monday, whichever day you ask for', () => {
    for (const [asked, expected] of [
      ['2026-09-08T12:00:00.000Z', '2026-09-07'], // Tuesday      -> Monday
      ['2026-09-13T21:00:00.000Z', '2026-09-07'], // Sunday night -> the Monday before
      ['2026-09-07T00:00:00.000Z', '2026-09-07'], // Monday       -> itself
      ['2026-01-14T12:00:00.000Z', '2026-01-12'], // and in WINTER, where the
      ['2026-01-11T23:30:00.000Z', '2026-01-05'], // offset is zero, not one
    ] as const) {
      assert.equal(localDate(startOfLocalWeek(asked)), expected, `week of ${asked}`);
    }
  });

  test('a day window is exactly one day — and one LOCAL day, which is not always 24 hours', () => {
    /* IN BRITISH SUMMER TIME a local day begins at 23:00Z the evening before. */
    const summer = startOfLocalDay('2026-09-09T13:45:00.000Z');
    assert.equal(summer, '2026-09-08T23:00:00.000Z');
    assert.equal(localDate(summer), '2026-09-09');
    assert.equal(addLocalDays(summer, 1), '2026-09-09T23:00:00.000Z');

    /* OUTSIDE IT a local day begins at 00:00Z, and the SAME code produces a
       different answer without being told which season it is. A hard-coded
       offset cannot satisfy both of these lines. */
    const winter = startOfLocalDay('2026-01-14T13:45:00.000Z');
    assert.equal(winter, '2026-01-14T00:00:00.000Z');
    assert.equal(addLocalDays(winter, 1), '2026-01-15T00:00:00.000Z');

    /* THE TWO DAYS THAT ARE NOT 24 HOURS LONG. 29 March 2026 is 23 hours and
       25 October 2026 is 25, and adding a fixed 86,400,000 would land in the
       middle of the next day on both. */
    const springForward = startOfLocalDay('2026-03-29T12:00:00.000Z');
    assert.equal(localDate(addLocalDays(springForward, 1)), '2026-03-30');
    assert.equal(
      Date.parse(addLocalDays(springForward, 1)) - Date.parse(springForward),
      23 * 60 * 60 * 1000, 'the spring-forward day was not 23 hours long');

    const fallBack = startOfLocalDay('2026-10-25T12:00:00.000Z');
    assert.equal(localDate(addLocalDays(fallBack, 1)), '2026-10-26');
    assert.equal(
      Date.parse(addLocalDays(fallBack, 1)) - Date.parse(fallBack),
      25 * 60 * 60 * 1000, 'the autumn day was not 25 hours long');
  });
});
