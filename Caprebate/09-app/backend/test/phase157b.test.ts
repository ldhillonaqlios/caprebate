/**
 * PHASE 157b, 6 OCTOBER 2026 — THE RATE-CARD UPLIFTS AS A SWITCHED TEST DEFAULT (Word question 235).
 *
 * "Do the old extra charges stay: the add-on for complicated jobs and the £1,500 manual-handling charge?" is open.
 * Built the way Phase 153d built questions 33 and 34: the old card's figures as test defaults, marked "not agreed",
 * behind a switch that ships OFF, so Lakhbir can check what they would do before deciding. With the switch off no fee
 * anywhere moves. Every figure here is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEE_CONTROLS, RATE_CARD_UPLIFTS, UPLIFTS_QUESTION, computeFee, controlReadings, upliftPreview, upliftReading,
  type FeeControls, type FeeFacts,
} from '../src/web/fee-controls.ts';
import { backendSwitchReadings } from '../src/web/case-stamp.ts';

/** £100,000 of allowances: Word question 235's own example. */
const FACTS: FeeFacts = Object.freeze({
  claim_value_pence: 10_000_000, sector: 'dental', entity_type: 'company', tax_rate: null,
  pool_split_main_pence: null, pool_split_special_pence: null, period_start: null,
});
const ON: FeeControls = Object.freeze({ ...FEE_CONTROLS, uplifts: Object.freeze({ enabled: true }) });

describe('157b · the old extra charges, as a test default behind a switch', () => {
  test('SHIPPED OFF: the switch is off, the case stamp reads it, and the readings say the question is open', () => {
    assert.equal(FEE_CONTROLS.uplifts?.enabled, false);
    assert.ok(backendSwitchReadings().some((r) => r.switch === 'FEE_CONTROLS.uplifts' && r.on === false));
    assert.match(controlReadings().uplifts, /^off — no extra charge is added to the 3%/);
    assert.ok(controlReadings().uplifts.includes(UPLIFTS_QUESTION));
    assert.equal(UPLIFTS_QUESTION, 'Do the old extra charges stay: the add-on for complicated jobs and the £1,500 manual-handling charge?');
  });

  test('OFF CHANGES NOTHING: every factor and manual handling on the facts, and the fee is still the plain 3%', () => {
    const r = computeFee({ ...FACTS, uplift_factors: ['ENTITLEMENT_CHAIN', 'PRIOR_ELECTION', 'GRANT_FUNDING'], manual_handling: true });
    assert.ok(r.ok);
    assert.equal(r.fee_pence, 300_000);
    assert.equal(r.fee_pence, r.plain_fee_pence);
    assert.doesNotMatch(r.basis, /extra charge/);
  });

  test('the test defaults are the old card’s, each marked not agreed: +0.5 points a complication, at most +1.5, and £1,500', () => {
    assert.equal(RATE_CARD_UPLIFTS.mark, 'test default, not agreed');
    assert.equal(RATE_CARD_UPLIFTS.points_each, 0.5);
    assert.equal(RATE_CARD_UPLIFTS.points_cap, 1.5);
    assert.equal(RATE_CARD_UPLIFTS.manual_handling_pence, 150_000);
    assert.deepEqual(Object.keys(RATE_CARD_UPLIFTS.factors).sort(),
      ['DWELLING_ELEMENT', 'ENTITLEMENT_CHAIN', 'GRANT_FUNDING', 'NO_COMPLETION_STATEMENT', 'PRIOR_ELECTION']);
  });

  test('the reading: each factor once, capped at 1.5 points; an unknown factor is never counted; none applies says so', () => {
    assert.equal(upliftReading({ ...FACTS, uplift_factors: ['PRIOR_ELECTION'] }).complexity_pence, 50_000);
    assert.equal(upliftReading({ ...FACTS, uplift_factors: ['PRIOR_ELECTION', 'PRIOR_ELECTION'] }).points, 0.5);
    const all = upliftReading({ ...FACTS, uplift_factors: ['ENTITLEMENT_CHAIN', 'PRIOR_ELECTION', 'GRANT_FUNDING', 'DWELLING_ELEMENT', 'NO_COMPLETION_STATEMENT'] });
    assert.equal(all.points, 1.5);
    assert.equal(all.complexity_pence, 150_000);
    assert.equal(upliftReading({ ...FACTS, uplift_factors: ['NOT_A_FACTOR' as never] }).total_pence, 0);
    const none = upliftReading(FACTS);
    assert.equal(none.total_pence, 0);
    assert.equal(none.words, 'no extra charge applies on these facts');
    assert.match(upliftReading({ ...FACTS, manual_handling: true }).words, /£1,500.*test default, not agreed$/);
  });

  test('ON: Word question 235’s own example — £100,000 at 3% is £3,000, with the £1,500 charge £4,500; two complications £4,000', () => {
    const manual = computeFee({ ...FACTS, manual_handling: true }, ON);
    assert.ok(manual.ok);
    assert.equal(manual.plain_fee_pence, 300_000);
    assert.equal(manual.fee_pence, 450_000);
    assert.match(manual.basis, /with the old extra charges: £1,500 for manual handling/);
    assert.equal(manual.fee_rate, 0.045);
    const two = computeFee({ ...FACTS, uplift_factors: ['GRANT_FUNDING', 'DWELLING_ELEMENT'] }, ON);
    assert.ok(two.ok);
    assert.equal(two.fee_pence, 400_000);
    const none = computeFee(FACTS, ON);
    assert.ok(none.ok);
    assert.equal(none.fee_pence, 300_000);
    assert.match(none.basis, /the extra charges are on, and none applies on these facts/);
    assert.match(controlReadings(ON).uplifts, /^on, at test defaults not agreed/);
  });

  test('ON, with the first-year control capping the fee: the cap stands and nothing is added on top of it', () => {
    const capped: FeeControls = Object.freeze({ ...ON, above_benefit: Object.freeze({ enabled: true, mode: 'CAP' as const }) });
    const f: FeeFacts = { ...FACTS, tax_rate: 0.25, pool_split_main_pence: 0, pool_split_special_pence: 10_000_000, period_start: '2026-04-01', manual_handling: true };
    const r = computeFee(f, capped);
    assert.ok(r.ok);
    assert.equal(r.fee_pence, 150_000, 'capped at the first-year saving: £100,000 in the special rate pool, 6% writing-down, at 25%');
    assert.match(r.basis, /the extra charges are not added, because the first-year control lowered the fee/);
  });

  test('THE VIABILITY PREVIEW works whatever the switch says, and never changes a fee', () => {
    const p = upliftPreview({ ...FACTS, uplift_factors: ['ENTITLEMENT_CHAIN'], manual_handling: true });
    assert.ok(p !== null);
    assert.deepEqual([p.plain_fee_pence, p.with_uplifts_pence], [300_000, 300_000 + 50_000 + 150_000]);
    const r = computeFee({ ...FACTS, uplift_factors: ['ENTITLEMENT_CHAIN'], manual_handling: true });
    assert.ok(r.ok);
    assert.equal(r.fee_pence, 300_000);
  });
});
