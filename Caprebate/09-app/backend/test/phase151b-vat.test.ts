/**
 * PHASE 151b, 25 September 2026 — VAT IN THE £1,000 NO-CLAIM TEST, AS THE FINANCE VIEW READS IT.
 *
 * DECIDED: Word question 61, Lakhbir Dhillon, closed 24 September 2026 — "The relief is calculated over the 5 years –
 * and must include VAT". Closed as: measure the relief over five years, and include VAT where the client cannot
 * reclaim it. The rule is the engine's (CB_FEE.NO_CLAIM_VAT, in "Caprebate site.html"); src/web/finance.ts reads it
 * for the tax adviser. These tests prove, through FIN.feeVersusBenefit:
 *
 *   1. NOT REGISTERED (as shipped) — no VAT exists to count; every client VAT position gives today's answer;
 *   2. REGISTERED, CLIENT CANNOT RECLAIM — VAT is counted, and the worked example crosses the £1,000 line
 *      (£30,000 special-rate allowances, a company at 25%: £1,995.72 five-year relief; £900 fee leaves £1,095.72, at
 *      or above; £900 + £180 VAT leaves £915.72, below);
 *   3. REGISTERED, CLIENT CAN RECLAIM — the fee alone;
 *   4. REGISTERED, POSITION NOT KNOWN — "not sure" AND absent (and null) are UNDETERMINED, identical, never "do not
 *      claim" and never a pass (N4);
 *   5. the sentence for the tax adviser says how VAT is treated, and is still marked awaiting review.
 *
 * REGISTRATION IS SWITCHED ON ONLY INSIDE withVat(), which puts the shipped values back in `finally` — the
 * mutate-and-restore the site harness uses. Nothing here writes a file or a database.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/web/engine.ts';
import * as FIN from '../src/web/finance.ts';

type VatSetting = { we_are_vat_registered?: unknown; vat_rate?: unknown };

function withVat<T>(registered: boolean, rate: unknown, fn: () => T): T {
  const v = (E.FEE as { NO_CLAIM_VAT?: VatSetting }).NO_CLAIM_VAT;
  assert.ok(v && typeof v === 'object', 'the engine carries no CB_FEE.NO_CLAIM_VAT');
  const keep = { we_are_vat_registered: v.we_are_vat_registered, vat_rate: v.vat_rate };
  try {
    v.we_are_vat_registered = registered; v.vat_rate = rate;
    return fn();
  } finally {
    v.we_are_vat_registered = keep.we_are_vat_registered; v.vat_rate = keep.vat_rate;
  }
}

const r2 = (n: number | null | undefined): number | null | undefined => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

/** £30,000 of special-rate allowances, a company, its recorded rate 25%. */
const base: FIN.ComparisonFacts = {
  claim_value_pence: 3_000_000, entity_type: 'company', tax_rate: 0.25,
  pool_split_main_pence: 0, pool_split_special_pence: 3_000_000, period_start: '2026-04-01',
};
/** £20,000 of the same — a case that fires without VAT. */
const small: FIN.ComparisonFacts = { ...base, claim_value_pence: 2_000_000, pool_split_special_pence: 2_000_000 };

function reading(facts: FIN.ComparisonFacts, clientVat?: unknown, omit = false): FIN.NoClaimReading {
  const f = omit ? { ...facts } : { ...facts, client_vat: clientVat };
  return FIN.feeVersusBenefit(f as FIN.ComparisonFacts).recommendation_threshold;
}
const one = (r: FIN.NoClaimReading) => r.readings[0]?.threshold;

const UNKNOWN: [string, unknown, boolean][] = [
  ['"not sure"', 'not sure', false], ['absent (no key)', undefined, true], ['undefined', undefined, false], ['null', null, false],
];

describe('Phase 151b — not VAT-registered, as shipped: unchanged from today', () => {
  test('the engine setting is read: not registered, the rate 20% as data, marked for the tax adviser', () => {
    const s = E.noClaimThreshold().vat;
    assert.equal(s.we_are_vat_registered, false);
    assert.equal(s.vat_rate, 0.2);
    assert.equal(s.awaiting_tax_adviser_review, true);
  });

  test('every client VAT position gives the same answer: £30,000 at or above, the £900 fee alone, £1,095.72 left', () => {
    for (const x of ['cannot_reclaim', 'can_reclaim', 'not sure', undefined, null]) {
      const r = reading(base, x);
      assert.equal(r.outcome, 'AT_OR_ABOVE_THRESHOLD', String(x));
      assert.equal(one(r)?.fee_counted, 900, String(x));
      assert.equal(r2(one(r)?.relief_after_fee), 1095.72, String(x));
      assert.equal(one(r)?.vat.treatment, 'NOT_REGISTERED_NO_VAT', String(x));
      assert.equal(r.vat.we_are_vat_registered, false);
      assert.match(r.vat.in_words, /^We are not VAT-registered, so there is no VAT on our fee and none is counted/);
    }
  });

  test('£20,000 still fires on the fee alone, and the engine message does not mention VAT', () => {
    const r = reading(small, 'cannot_reclaim');
    assert.equal(r.outcome, 'BELOW_THRESHOLD');
    assert.equal(one(r)?.fee_counted, 600);
    assert.doesNotMatch(one(r)?.message ?? '', /VAT/);
  });
});

describe('Phase 151b — registered, and the client cannot reclaim VAT: VAT is counted', () => {
  test('the worked example crosses the line: £900 + £180 VAT = £1,080 counted, £915.72 left, BELOW £1,000', () => {
    const before = reading(base, 'cannot_reclaim');
    const after = withVat(true, 0.2, () => reading(base, 'cannot_reclaim'));
    assert.equal(before.outcome, 'AT_OR_ABOVE_THRESHOLD');
    assert.equal(after.outcome, 'BELOW_THRESHOLD');
    assert.equal(after.fires, true);
    const t = one(after);
    assert.equal(t?.fee, 900);
    assert.equal(t?.vat.vat, 180);
    assert.equal(t?.fee_counted, 1080);
    assert.equal(r2(t?.relief), 1995.72);
    assert.equal(r2(t?.relief_after_fee), 915.72);
    assert.equal(after.vat.treatment, 'COUNTED_CLIENT_CANNOT_RECLAIM');
    assert.match(after.vat.in_words, /cannot reclaim VAT, so our fee plus VAT at 20% is counted/);
    assert.equal(after.refuses_work, false);
  });
});

describe('Phase 151b — registered, and the client can reclaim VAT: not counted', () => {
  test('£30,000 counts the £900 fee alone and stays at or above', () => {
    const r = withVat(true, 0.2, () => reading(base, 'can_reclaim'));
    assert.equal(r.outcome, 'AT_OR_ABOVE_THRESHOLD');
    assert.equal(one(r)?.fee_counted, 900);
    assert.equal(one(r)?.vat.vat, 0);
    assert.equal(r.vat.treatment, 'NOT_COUNTED_CLIENT_CAN_RECLAIM');
    assert.match(r.vat.in_words, /can reclaim VAT, so our fee is counted without VAT/);
  });
});

describe('Phase 151b — registered, the client’s VAT position not known: UNDETERMINED, never “do not claim” (N4)', () => {
  test('"not sure", absent, undefined and null: UNDETERMINED on a case that would fire and on one that would pass', () => {
    for (const facts of [small, base]) {
      for (const [label, x, omit] of UNKNOWN) {
        const r = withVat(true, 0.2, () => reading(facts, x, omit));
        assert.equal(r.outcome, 'UNDETERMINED', label);
        assert.equal(r.fires, false, label);
        assert.equal(one(r)?.fee_counted, null, label);
        assert.equal(one(r)?.relief_after_fee, null, label);
        assert.equal(one(r)?.message, null, label);
        assert.equal(one(r)?.vat.client_vat_position, 'not_known', label);
        assert.match(r.why ?? '', /do not know whether you can reclaim the VAT on our fee/, label);
        assert.equal(r.vat.treatment, 'UNDETERMINED', label);
        assert.match(r.vat.in_words, /We do not know if the client can reclaim VAT on our fee\. So the test is not determined, and it does not tell the client not to claim/, label);
      }
    }
  });

  test('"not sure" and absent give identical readings, field by field', () => {
    for (const facts of [small, base]) {
      const notSure = withVat(true, 0.2, () => JSON.stringify(reading(facts, 'not sure')));
      const absent = withVat(true, 0.2, () => JSON.stringify(reading(facts, undefined, true)));
      assert.equal(notSure, absent);
    }
  });

  test('a registered flag with no usable rate is not a rate of nil: UNDETERMINED, even for a client who cannot reclaim', () => {
    for (const rate of [null, 'not sure', undefined]) {
      const r = withVat(true, rate, () => reading(base, 'cannot_reclaim'));
      assert.equal(r.outcome, 'UNDETERMINED', String(rate));
      assert.equal(r.vat.vat_rate, null, String(rate));
      assert.match(r.vat.in_words, /no VAT rate is set/, String(rate));
    }
  });

  test('the shipped setting is back after every switch-on above', () => {
    assert.equal(E.noClaimThreshold().vat.we_are_vat_registered, false);
    assert.equal(E.noClaimThreshold().vat.vat_rate, 0.2);
  });
});

describe('Phase 151b — the sentence for the tax adviser says how VAT is treated', () => {
  test('NO_CLAIM_FOR_TAX_ADVISER states the VAT rule, keeps the five-year reading, and is still awaiting review', () => {
    const s = FIN.NO_CLAIM_FOR_TAX_ADVISER;
    assert.match(s, /^FOR THE TAX ADVISER — AWAITING REVIEW/);
    assert.match(s, /five-year relief less our fee/);
    assert.match(s, /VAT on our fee is counted only when we are VAT-registered and the client cannot reclaim it/);
    assert.match(s, /a client who can reclaim it is measured on the fee alone/);
    assert.match(s, /where we do not know whether the client can reclaim it, the test is not determined and never tells the client not to claim/);
    const r = reading(base);
    assert.equal(r.for_the_tax_adviser, s);
    assert.equal(r.vat.awaiting_tax_adviser_review, true);
  });

  test('with no entity type (no reading at all) the VAT words still say what the setting is', () => {
    const r = reading({ ...base, entity_type: null, tax_rate: null });
    assert.equal(r.outcome, 'UNDETERMINED');
    assert.equal(r.vat.treatment, null);
    assert.match(r.vat.in_words, /^We are not VAT-registered/);
  });
});
