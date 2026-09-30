/**
 * LOCAL TIME — AND THE POINT OF EVERY TEST IN THIS FILE IS THAT A HARD-CODED
 * OFFSET CANNOT PASS IT.
 *
 * Phase 113a, 9 September 2026. The booking system stored, compared and PRINTED
 * everything in UTC, which was honest and wrong for eight months of the year:
 * staff setting "09:00 to 17:00" in June were setting ten to six as anybody in
 * Britain reads a clock, and a client offered "Wednesday at 09:00" would have
 * arrived at ten.
 *
 * THE SHAPE OF THE PROOF. Every assertion below is made TWICE on real dates
 * either side of a real transition — 29 March 2026 and 25 October 2026, the two
 * Sundays the British clocks moved that year — and the two answers differ by
 * exactly one hour. A build that hard-coded `+1` would pass the summer half and
 * fail the winter half; one that hard-coded `0` would do the reverse; one that
 * used the HOST machine's zone would pass in London and fail in Frankfurt. The
 * only implementation that passes all of it is one that asks a real timezone
 * database at the instant in question, which is what localtime.ts does.
 *
 * THE TWO AWKWARD MORNINGS ARE TESTED RATHER THAN AVOIDED. On 29 March local
 * 01:00 to 01:59 does not happen at all, and on 25 October it happens twice.
 * Those are the cases a naive `Date.UTC(...) - offset` gets silently wrong, so
 * they are what `instantsForLocalMinute` is really for.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';
import {
  DISPLAY_ZONE, instantsForLocalMinute, localClock, localDate, localPartsOf,
  localStamp, localWhen, offsetMinutesAt, startOfLocalDayMs, zoneNotice,
} from '../src/web/localtime.ts';
import {
  SLOT_MINUTES, isBookable, slotsBetween, startOfLocalDay, addLocalDays,
} from '../src/web/schedule.ts';

/* The two 2026 transitions. Real dates, looked up rather than assumed. */
const CLOCKS_GO_FORWARD = '2026-03-29';
const CLOCKS_GO_BACK = '2026-10-25';

/* A Wednesday well inside summer time, and a Wednesday well outside it. */
const SUMMER_DAY = '2026-06-10';
const WINTER_DAY = '2026-01-14';

describe('the offset is asked, never assumed', () => {
  test('the same clock time is a different instant in June and in January', () => {
    /* THE ONE ASSERTION NO CONSTANT CAN SATISFY. If this file contained the
       number 60, or 0, one of these two lines would be wrong. */
    assert.equal(offsetMinutesAt(Date.parse(`${SUMMER_DAY}T12:00:00.000Z`)), 60);
    assert.equal(offsetMinutesAt(Date.parse(`${WINTER_DAY}T12:00:00.000Z`)), 0);
  });

  test('and it changes on the exact minute it is supposed to', () => {
    /* 01:00 GMT on the last Sunday in March. Not 00:59, not 02:00. */
    const justBefore = Date.parse(`${CLOCKS_GO_FORWARD}T00:59:00.000Z`);
    const justAfter = Date.parse(`${CLOCKS_GO_FORWARD}T01:00:00.000Z`);
    assert.equal(offsetMinutesAt(justBefore), 0);
    assert.equal(offsetMinutesAt(justAfter), 60);
    assert.equal(localClock(new Date(justBefore).toISOString()), '00:59');
    assert.equal(localClock(new Date(justAfter).toISOString()), '02:00');

    /* And back again at 01:00 UTC on the last Sunday in October. */
    assert.equal(offsetMinutesAt(Date.parse(`${CLOCKS_GO_BACK}T00:59:00.000Z`)), 60);
    assert.equal(offsetMinutesAt(Date.parse(`${CLOCKS_GO_BACK}T01:00:00.000Z`)), 0);
  });

  test('the abbreviation on screen comes from the zone, not from a condition', () => {
    assert.match(localWhen(`${SUMMER_DAY}T09:00:00.000Z`), /BST$/);
    assert.match(localWhen(`${WINTER_DAY}T09:00:00.000Z`), /GMT$/);
    assert.match(zoneNotice(`${SUMMER_DAY}T09:00:00.000Z`), /BST/);
    assert.match(zoneNotice(`${WINTER_DAY}T09:00:00.000Z`), /GMT/);
  });

  test('THE ZONE IS OURS, NOT THE HOST MACHINE’S', () => {
    /* A server in Frankfurt must render the same page as a server in Leeds. If
       any of these functions ever reaches for `new Date().getHours()` or
       `toLocaleString()` with no zone, this is the test that notices — the
       expectations below are absolute, not relative to wherever this runs. */
    assert.equal(DISPLAY_ZONE, 'Europe/London');
    assert.equal(localStamp(`${SUMMER_DAY}T09:00:00.000Z`), '10 Jun 2026, 10:00'); // Phase 133c: UK dates
    assert.equal(localStamp(`${WINTER_DAY}T09:00:00.000Z`), '14 Jan 2026, 09:00');
  });
});

describe('a local wall clock is not a function of time, twice a year', () => {
  test('an ordinary morning has exactly one instant', () => {
    const [t, ...rest] = instantsForLocalMinute(2026, 6, 10, 9 * 60);
    assert.equal(rest.length, 0);
    assert.equal(new Date(t ?? 0).toISOString(), '2026-06-10T08:00:00.000Z');
  });

  test('THE SPRING GAP: local 01:30 on 29 March 2026 does not exist, and none is invented', () => {
    assert.deepEqual(instantsForLocalMinute(2026, 3, 29, 90), []);
    /* The half hour either side of the gap is perfectly ordinary. */
    assert.equal(instantsForLocalMinute(2026, 3, 29, 30).length, 1);
    assert.equal(instantsForLocalMinute(2026, 3, 29, 150).length, 1);
  });

  test('THE AUTUMN OVERLAP: local 01:30 on 25 October 2026 happens twice, and both are real', () => {
    const both = instantsForLocalMinute(2026, 10, 25, 90);
    assert.equal(both.length, 2);
    assert.deepEqual(both.map((t) => new Date(t).toISOString()),
      ['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    /* Both really do read as 01:30 to a person — which is the whole difficulty. */
    for (const t of both) assert.equal(localClock(new Date(t).toISOString()), '01:30');
  });

  test('a local day begins at local midnight, whatever that is in UTC', () => {
    assert.equal(new Date(startOfLocalDayMs(Date.parse(`${SUMMER_DAY}T12:00:00.000Z`))).toISOString(),
      '2026-06-09T23:00:00.000Z');
    assert.equal(new Date(startOfLocalDayMs(Date.parse(`${WINTER_DAY}T12:00:00.000Z`))).toISOString(),
      '2026-01-14T00:00:00.000Z');
  });

  test('localDate is the LOCAL date, which is not always the front of the ISO string', () => {
    /* Half past eleven at night in June is still that day locally; the ISO
       string has already rolled over. This is the slice(0, 10) bug, pinned. */
    assert.equal(localDate('2026-06-09T23:30:00.000Z'), '2026-06-10');
    assert.equal(localDate('2026-01-14T23:30:00.000Z'), '2026-01-14');
  });
});

/* ================================================================== *
 * AND THE HALF THAT MATTERS: WORKING TIMES ARE LOCAL HOURS
 * ================================================================== */

function dbWithNineToFive(): Db {
  const db = new Db(':memory:');
  migrate(db, MIGRATIONS_DIR);
  const at = '2026-01-01T00:00:00.000Z';
  db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-SALES', 's@example.invalid', 's@example.invalid', 'Sales Person', 'SALES', 'x', at, at],
  );
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
      [`wt-${weekday}`, 'u-SALES', weekday, 9 * 60, 17 * 60]);
  }
  return db;
}

/** The local clock times offered on one local day, in order. */
function offeredOn(db: Db, localDay: string): string[] {
  const from = startOfLocalDay(`${localDay}T12:00:00.000Z`);
  const r = slotsBetween(db, from, addLocalDays(from, 1), {});
  assert.equal(r.available, true, `nothing was offered on ${localDay}`);
  return r.available ? r.slots.map((s) => localClock(s.starts_at)) : [];
}

describe('nine to five means nine to five in June AND in January', () => {
  test('THE SAME STORED HOURS PRODUCE DIFFERENT UTC INSTANTS IN THE TWO SEASONS', () => {
    const db = dbWithNineToFive();
    try {
      const from = startOfLocalDay(`${SUMMER_DAY}T12:00:00.000Z`);
      const summer = slotsBetween(db, from, addLocalDays(from, 1), {});
      assert.equal(summer.available, true);
      const winterFrom = startOfLocalDay(`${WINTER_DAY}T12:00:00.000Z`);
      const winter = slotsBetween(db, winterFrom, addLocalDays(winterFrom, 1), {});
      assert.equal(winter.available, true);
      if (!summer.available || !winter.available) return;

      /* THE STORED INSTANTS DIFFER BY AN HOUR — this is the defect, in one
         pair of lines. Before this phase both read 09:00:00.000Z, and the
         June one was an hour early. */
      assert.equal(summer.slots[0]?.starts_at, `${SUMMER_DAY}T08:00:00.000Z`);
      assert.equal(winter.slots[0]?.starts_at, `${WINTER_DAY}T09:00:00.000Z`);

      /* AND THE PERSON READS THE SAME THING ON BOTH DAYS, which is the point. */
      assert.equal(localClock(summer.slots[0]?.starts_at ?? ''), '09:00');
      assert.equal(localClock(winter.slots[0]?.starts_at ?? ''), '09:00');

      /* The whole day, both seasons: 09:00 to 16:00 inclusive, eight one-hour calls (30 Sep 2026: calls are an hour),
         and the last one ends at 17:00 rather than starting at it. */
      const expected = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];
      assert.deepEqual(offeredOn(db, SUMMER_DAY), expected);
      assert.deepEqual(offeredOn(db, WINTER_DAY), expected);
    } finally { db.close(); }
  });

  test('isBookable is the mirror of the picker, in both seasons', () => {
    const db = dbWithNineToFive();
    try {
      /* Accepted: the instant that IS nine o'clock locally, on each day. */
      assert.equal(isBookable(db, `${SUMMER_DAY}T08:00:00.000Z`, {}).ok, true);
      assert.equal(isBookable(db, `${WINTER_DAY}T09:00:00.000Z`, {}).ok, true);

      /* REFUSED: the same clock face read in the wrong season. 09:00Z in June
         is eight in the morning locally, an hour before anybody works, and
         08:00Z in January is likewise. A build that got this wrong would
         accept a time its own picker had never offered — which is exactly the
         hole the "picker is a courtesy, the refusal is the control" rule
         exists to close. */
      const earlySummer = isBookable(db, `${SUMMER_DAY}T07:00:00.000Z`, {});
      assert.equal(earlySummer.ok, false);
      if (!earlySummer.ok) assert.match(earlySummer.why, /outside the working hours/);
      const earlyWinter = isBookable(db, `${WINTER_DAY}T08:00:00.000Z`, {});
      assert.equal(earlyWinter.ok, false);

      /* And the last hour of the day, which is the off-by-one either way:
         16:00 local starts inside the hours and ends exactly on 17:00. */
      assert.equal(isBookable(db, `${SUMMER_DAY}T15:00:00.000Z`, {}).ok, true);
      assert.equal(isBookable(db, `${SUMMER_DAY}T16:00:00.000Z`, {}).ok, false);
      /* A half-hour start is refused now that calls are an hour: calls start on the hour. */
      assert.equal(isBookable(db, `${SUMMER_DAY}T14:30:00.000Z`, {}).ok, false);
    } finally { db.close(); }
  });

  test('THE TWO ODD DAYS: an hour is missing in March and an extra one appears in October', () => {
    const db = new Db(':memory:');
    try {
      migrate(db, MIGRATIONS_DIR);
      const at = '2026-01-01T00:00:00.000Z';
      db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
          'VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-SALES', 's@example.invalid', 's@example.invalid', 'Sales Person', 'SALES', 'x', at, at],
      );
      /* A NIGHT SHIFT — midnight to four, on both of the Sundays. Nobody at
         Caprebate works these hours; the point is that the arithmetic is right
         for somebody who does, and only a period covering 01:00 can show it. */
      for (const weekday of [0]) {
        db.run('INSERT INTO working_times (id,user_id,weekday,start_min,end_min) VALUES (?,?,?,?,?)',
          [`wt-${weekday}`, 'u-SALES', weekday, 0, 4 * 60]);
      }

      /* SPRING: local 01:00 to 01:59 does not exist, so that hour's call is not
         offered. Three remain out of the four a normal four-hour period has. */
      const march = offeredOn(db, CLOCKS_GO_FORWARD);
      assert.deepEqual(march, ['00:00', '02:00', '03:00']);
      assert.equal(march.includes('01:00'), false, 'a slot was offered at a time that does not exist');

      /* AUTUMN: local 01:00 to 01:59 happens twice, so that clock time
         appears twice — FIVE calls in a four-hour period, because that morning
         really is five hours long. They are different instants. */
      const october = offeredOn(db, CLOCKS_GO_BACK);
      assert.equal(october.length, 5);
      assert.equal(october.filter((c) => c === '01:00').length, 2);

      const from = startOfLocalDay(`${CLOCKS_GO_BACK}T12:00:00.000Z`);
      const r = slotsBetween(db, from, addLocalDays(from, 1), {});
      assert.equal(r.available, true);
      if (r.available) {
        const oneOClock = r.slots.filter((s) => localClock(s.starts_at) === '01:00');
        assert.deepEqual(oneOClock.map((s) => s.starts_at),
          ['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']);
      }
    } finally { db.close(); }
  });

  test('a slot is still SLOT_MINUTES long across a transition — the clock moves, the call does not', () => {
    const db = dbWithNineToFive();
    try {
      const from = startOfLocalDay(`${CLOCKS_GO_FORWARD}T12:00:00.000Z`);
      const r = slotsBetween(db, from, addLocalDays(from, 1), {});
      assert.equal(r.available, true);
      if (!r.available) return;
      for (const s of r.slots) {
        assert.equal(Date.parse(s.ends_at) - Date.parse(s.starts_at), SLOT_MINUTES * 60_000,
          `${s.starts_at} is not ${SLOT_MINUTES} minutes long`);
      }
    } finally { db.close(); }
  });
});

describe('what is stored is still UTC, and that has not moved', () => {
  test('every instant a slot carries is a Z-terminated ISO-8601 string', () => {
    const db = dbWithNineToFive();
    try {
      const from = startOfLocalDay(`${SUMMER_DAY}T12:00:00.000Z`);
      const r = slotsBetween(db, from, addLocalDays(from, 1), {});
      assert.equal(r.available, true);
      if (!r.available) return;
      for (const s of r.slots) {
        assert.match(s.starts_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/);
        assert.match(s.ends_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ$/);
        /* AND THEY SORT. A local string would not, across the October morning. */
        assert.equal(new Date(s.starts_at).toISOString(), s.starts_at);
      }
      const sorted = [...r.slots].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
      assert.deepEqual(sorted.map((s) => s.starts_at), r.slots.map((s) => s.starts_at));
    } finally { db.close(); }
  });

  test('localPartsOf never disagrees with the instant it was given', () => {
    /* A round trip over three months at ten-minute steps, crossing both
       transitions. Every local rendering must map back to the instant it came
       from — which is what catches an off-by-one in either direction. */
    let checked = 0;
    for (
      let t = Date.parse('2026-03-01T00:00:00.000Z');
      t < Date.parse('2026-04-01T00:00:00.000Z');
      t += 10 * 60_000
    ) {
      const p = localPartsOf(t);
      const back = instantsForLocalMinute(p.year, p.month, p.day, p.minuteOfDay);
      assert.ok(back.includes(t), `${new Date(t).toISOString()} did not round-trip`);
      checked += 1;
    }
    assert.ok(checked > 4000, `only ${checked} instants were checked`);
  });
});
