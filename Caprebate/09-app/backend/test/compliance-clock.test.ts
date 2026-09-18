/**
 * CRM 8 OF 10 — THE STATUTORY CLOCKS. The Rights-Request Register, Complaints
 * Log and s.164A pack's four worked computations (its 2.5.4), exactly as it
 * works them, and the traps it names (its 2.5.5).
 *
 * The pack's computations carry no year. These run them in 2027, a year with no
 * 29 February, so nothing in them leans on a leap day; the month-end cases below
 * name their year on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgementClock, ClockInputError, inclusiveDays, limbClock, monthsBeginningWith,
  type Limb, type LimbClockInput,
} from '../src/web/compliance-clock.ts';

const Y = '2027';
const d = (mmdd: string): string => `${Y}-${mmdd}`;

function input(limb: Limb, over: Partial<LimbClockInput> = {}): LimbClockInput {
  return {
    limb, receipt: d('03-03'),
    id_requested: null, id_received: null, fee_charged: null, fee_paid: null,
    clarification_requested: null, clarification_received: null,
    extension_notified: null, extension_ground: null, extension_reasons: null,
    responded: null, ...over,
  };
}

test('RR-W1 — the simple case: 3 March gives 2 April for the response AND for the extension notice', () => {
  const c = limbClock(input('ART_15'));
  assert.equal(c.relevant_time, d('03-03'));
  assert.equal(c.relevant_time_source, 'RECEIPT');
  assert.equal(c.days_not_counted, 0);
  assert.equal(c.applicable_period_end?.end, d('04-02'));
  assert.equal(c.extension_notice_deadline?.end, d('04-02'));
  assert.deepEqual(c.waiting_on, []);
  // the arithmetic is shown, not only the answer
  assert.ok(c.working.some((w) => w.includes('3 March 2027') && w.includes('2 April 2027')));
});

test('RR-W1 — an extension decided on 3 April is not an extension', () => {
  const c = limbClock(input('ART_15', { extension_notified: d('04-03'), extension_ground: 'COMPLEXITY', extension_reasons: 'The request covers several processing activities.' }));
  assert.equal(c.extension_valid, false);
  assert.match(c.extension_reading, /NOT AN EXTENSION/);
  assert.equal(c.applicable_period_end?.end, d('04-02'));
});

test('RR-W2 — identity moves the start: asked 5 March, answered 20 March, the month runs from 20 March to 19 April', () => {
  const c = limbClock(input('ART_15', { id_requested: d('03-05'), id_received: d('03-20') }));
  assert.equal(c.relevant_time, d('03-20'));
  assert.equal(c.relevant_time_source, 'IDENTITY');
  assert.equal(c.applicable_period_end?.end, d('04-19'));
  assert.equal(c.extension_notice_deadline?.end, d('04-19'));
});

test('RR-W3 — clarification pauses the run on Article 15, 10 to 24 March is 15 days, and BOTH deadlines move to 17 April', () => {
  assert.equal(inclusiveDays(d('03-10'), d('03-24')), 15);
  const c = limbClock(input('ART_15', { clarification_requested: d('03-10'), clarification_received: d('03-24') }));
  assert.equal(c.relevant_time, d('03-03'));
  assert.equal(c.days_not_counted, 15);
  assert.equal(c.applicable_period_end?.end, d('04-17'));
  assert.equal(c.extension_notice_deadline?.end, d('04-17'));
  // so an extension notified on 10 April is IN time — the controller who forgot 12A(5)(b)(ii) would think it late
  const ext = limbClock(input('ART_15', {
    clarification_requested: d('03-10'), clarification_received: d('03-24'),
    extension_notified: d('04-10'), extension_ground: 'NUMBER', extension_reasons: 'You have sent us four requests this month.',
  }));
  assert.equal(ext.extension_valid, true);
});

test('RR-W4 — one letter, three limbs: Art 15 ends 17 April, Art 21 and Art 17 end 2 April', () => {
  const clar = { clarification_requested: d('03-10'), clarification_received: d('03-24') };
  const access = limbClock(input('ART_15', clar));
  const objection = limbClock(input('ART_21'));
  const erasure = limbClock(input('ART_17'));
  assert.equal(access.applicable_period_end?.end, d('04-17'));
  assert.equal(access.days_not_counted, 15);
  for (const c of [objection, erasure]) {
    assert.equal(c.applicable_period_end?.end, d('04-02'));
    assert.equal(c.days_not_counted, 0);
    assert.equal(c.days_not_counted_reason, 'NOT APPLICABLE — Art 12A(5) applies to Art 15 requests only');
  }
  // working to the single later date would be fifteen days late on the objection
  const lateOnObjection = limbClock(input('ART_21', { responded: d('04-17') }));
  assert.equal(lateOnObjection.in_time, 'NO');
});

test('Trap 2 — a clarification cannot be recorded on any limb but Article 15', () => {
  for (const limb of ['ART_16', 'ART_17', 'ART_18', 'ART_21', 'ART_22A_22D'] as const) {
    assert.throws(() => limbClock(input(limb, { clarification_requested: d('03-10'), clarification_received: d('03-24') })), ClockInputError);
  }
});

test('only a request actually made moves the start: identity "received" with no request recorded is refused', () => {
  assert.throws(() => limbClock(input('ART_15', { id_received: d('03-20') })), ClockInputError);
  assert.throws(() => limbClock(input('ART_15', { fee_paid: d('03-20') })), ClockInputError);
});

test('N4 — a clock waiting on an answer has NO deadline, never a guessed one, whichever input it waits on', () => {
  const waitingId = limbClock(input('ART_15', { id_requested: d('03-05') }));
  assert.equal(waitingId.relevant_time, null);
  assert.equal(waitingId.applicable_period_end, null);
  assert.equal(waitingId.extension_notice_deadline, null);
  assert.equal(waitingId.waiting_on.length, 1);

  const waitingFee = limbClock(input('ART_15', { fee_charged: d('03-05') }));
  assert.equal(waitingFee.applicable_period_end, null);

  const paused = limbClock(input('ART_15', { clarification_requested: d('03-10') }));
  assert.equal(paused.days_not_counted, null, 'an open pause is not a zero-day pause');
  assert.equal(paused.applicable_period_end, null);
  assert.ok(paused.relevant_time !== null, 'the start is known even while the run is paused');
});

test('an extension is a notice with reasons on a closed ground — any one missing and it is not an extension', () => {
  const base = { extension_notified: d('03-20') };
  assert.equal(limbClock(input('ART_15', { ...base, extension_ground: null, extension_reasons: 'busy' })).extension_valid, false);
  assert.equal(limbClock(input('ART_15', { ...base, extension_ground: 'COMPLEXITY', extension_reasons: '   ' })).extension_valid, false);
  const ok = limbClock(input('ART_15', { ...base, extension_ground: 'COMPLEXITY', extension_reasons: 'Your request covers five years of records.' }));
  assert.equal(ok.extension_valid, true);
  assert.equal(ok.applicable_period_end?.end, d('06-02'), 'three months beginning with 3 March ends 2 June');
  assert.equal(ok.extension_notice_deadline?.end, d('04-02'), 'the notice deadline does not move with the extension');
});

test('"beginning with" — the conservative rule, and both readings recorded where they differ', () => {
  assert.deepEqual(monthsBeginningWith('2027-03-01', 1), { end: '2027-03-31', alternative_end: '2027-04-01' });
  assert.deepEqual(monthsBeginningWith('2027-01-28', 1), { end: '2027-02-27', alternative_end: '2027-02-28' });
  // no corresponding date: the last day of the shorter month
  assert.deepEqual(monthsBeginningWith('2027-01-29', 1), { end: '2027-02-28', alternative_end: null });
  assert.deepEqual(monthsBeginningWith('2027-01-31', 1), { end: '2027-02-28', alternative_end: null });
  assert.deepEqual(monthsBeginningWith('2028-01-30', 1), { end: '2028-02-29', alternative_end: null });
  assert.deepEqual(monthsBeginningWith('2027-03-31', 1), { end: '2027-04-30', alternative_end: null });
  // across a year end
  assert.deepEqual(monthsBeginningWith('2027-12-15', 1), { end: '2028-01-14', alternative_end: '2028-01-15' });
  assert.deepEqual(monthsBeginningWith('2027-11-30', 3), { end: '2028-02-29', alternative_end: null });
});

test('s.164A(3) — thirty calendar days beginning with receipt: 3 March is day 1, 1 April is day 30', () => {
  const c = acknowledgementClock(d('03-03'), null);
  assert.equal(c.acknowledgement_deadline, d('04-01'));
  assert.equal(c.ack_in_time, null);
  assert.equal(acknowledgementClock(d('03-03'), d('04-01')).ack_in_time, 'YES');
  assert.equal(acknowledgementClock(d('03-03'), d('04-02')).ack_in_time, 'NO');
});

test('dates the Article cannot have produced are refused, not computed', () => {
  assert.throws(() => limbClock(input('ART_15', { receipt: '2027-02-30' })), RangeError);
  assert.throws(() => limbClock(input('ART_15', { id_requested: d('03-01') })), ClockInputError);
  assert.throws(() => limbClock(input('ART_15', { id_requested: d('03-10'), id_received: d('03-09') })), ClockInputError);
});
