// caprebate-clock-shift.mjs — move the process clock, for proving a test does
// or does not depend on the wall clock. Added by the Phase 130 sweep,
// 13 September 2026, after "a taken slot is not offered twice" failed on a
// Sunday afternoon and passed on every other day.
//
//   CB_FAKE_NOW="2026-09-13T15:45:00.000Z" \
//     node --import "<abs path>/03-app/caprebate-clock-shift.mjs" --test test/staff.test.ts
//
// Date.now() and new Date() start at CB_FAKE_NOW and tick from there; a Date
// built from an explicit value is untouched. It changes nothing on disk and
// nothing in the code under test. QUOTE THE PATH - it contains spaces.
// A run that proves a fix must also show the PRE-CHANGE file going red under
// the same clock, or it proves nothing.
const target = Date.parse(process.env.CB_FAKE_NOW ?? '');
if (!Number.isFinite(target)) {
  throw new Error('caprebate-clock-shift: set CB_FAKE_NOW to an ISO 8601 instant');
}
const RealDate = Date;
const offset = target - RealDate.now();
class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }
  static now() { return RealDate.now() + offset; }
}
globalThis.Date = ShiftedDate;
