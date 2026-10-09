/**
 * PHASE 159b, 9 October 2026 — THE ASSESSMENT FIGURE AND THE ENGINE'S INPUTS MADE SOUND (the back end's half).
 *
 * The engine's half is Suite AN in the site harness (03-app/caprebate-regression.cjs). This file proves what the back
 * end does with it: the four-stage funnel reads an amount as a person types it (E9), refuses a future date (E12),
 * offers the extension as its own answer (E11), passes the client's own claim and the seller's claim to the engine (E5,
 * E6), shows the engine's own words where it will not size a building, never "up to £0", says a loss still has relief
 * (E19), and no longer promises the figure only moves down (item 8). And estimate(), called directly as the engaged page
 * and the profit comparison call it, applies the reasoned negatives (E7).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as F4 from '../src/web/funnel4.ts';
import { sessionFromFunnel } from '../src/web/funnel-session.ts';
import { estimate, newSession, BAND } from '../src/web/engine.ts';
import { CLIENT_RANGE_BASIS, CLIENT_RANGE_BASIS_AFTER_RESEARCH } from '../src/web/router.ts';

type S = Record<string, unknown>;
const form = (o: Record<string, string>) => new URLSearchParams(o);

/** One building walked through the screens that matter, as the router applies them. */
function walk(b: { sector?: string; trigger?: string; spend?: string; date?: string; tax?: string; profit?: string; prior?: string; seller?: string }): { s: S; errors: string[] } {
  const s: S = {};
  F4.markFunnel4(s);
  const errors: string[] = [];
  errors.push(...F4.applyF4(s, 'buildings', form({ b0_sector: b.sector ?? 'gp' })).errors);
  errors.push(...F4.applyF4(s, 'spend-on', form({ b0_trigger: b.trigger ?? 'purchase' })).errors);
  errors.push(...F4.applyF4(s, 'amounts', form({ b0_spend: b.spend ?? '650000', ...(b.date === undefined ? { b0_date_unknown: 'on' } : { b0_date: b.date }) })).errors);
  errors.push(...F4.applyF4(s, 'tax', form({ b0_tax: b.tax ?? 'yes', b0_profit: b.profit ?? 'profitable' })).errors);
  errors.push(...F4.applyF4(s, 'claims', form({ b0_prior: b.prior ?? 'no', ...(b.seller === undefined ? {} : { b0_seller: b.seller }) })).errors);
  return { s, errors };
}

describe('E9 — an amount as a person types it', () => {
  test('"650k", "1.5m", "£1,250,000" and "£1.25 million" are read as meant; "-50000", "1e6", "1,5", "1.000.000" and "0.4" are refused with a reason', () => {
    assert.deepEqual(['650k', '1.5m', '£1,250,000', '£1.25 million', '650000', '650,000'].map((v) => F4.parseMoney(v).value),
      [650000, 1500000, 1250000, 1250000, 650000, 650000]);
    for (const v of ['-50000', '1e6', '1,5', '1.000.000', '0.4', 'about a million']) {
      const r = F4.parseMoney(v);
      assert.equal(r.value, null, v);
      assert.notEqual(r.why, null, `no reason given for ${v}`);
    }
  });
  test('the amounts screen says why, rather than reading "-50000" as 50000', () => {
    const { s, errors } = walk({ spend: '-50000', date: '03/2025' });
    assert.equal(F4.buildings(s)[0]?.['spend'], null);
    assert.ok(errors.some((e) => /without a minus sign/.test(e)), errors.join(' | '));
  });
});

describe('E12 — a date that has not happened yet is refused', () => {
  test('12/2099 is refused on the amounts screen; 03/2025 is taken', () => {
    assert.ok(walk({ date: '12/2099' }).errors.some((e) => /in the future/.test(e)));
    assert.equal(walk({ date: '03/2025', seller: 'yes' }).errors.length, 0);
  });
});

describe('E11 — an extension is its own answer, on the new-build band', () => {
  test('the spend-on screen offers it, and it is sized on the new-build band', () => {
    assert.equal(F4.SPEND_ON['extension'], 'We extended it (added new space)');
    assert.equal(F4.SPEND_ON['refurb'], 'We refurbished it');
    const { s } = walk({ trigger: 'extension', date: '2021' });
    assert.equal(F4.figureF4(s).high, Math.round(650000 * (BAND.BANDS as Record<string, { new_build: number[] }>).gp!.new_build[1]!));
  });
});

describe('E5, E6 — the answers that cut the figure reach it', () => {
  test('the client’s own fixtures claim: no figure, the engine’s words, and never "up to £0" on the page', () => {
    const { s } = walk({ prior: 'yes', date: '03/2025' });
    const f = F4.figureF4(s);
    assert.equal(f.high, 0);
    assert.match(f.parts[0]?.left_out ?? '', /already been claimed on/);
    const page = String(F4.figureBody(s, { available: false, say: '' }, undefined, []));
    assert.doesNotMatch(page, /£0</);
    assert.match(page, /We cannot give you a figure yet/);
  });
  test('a 2025 purchase where the seller did not claim: no figure, with why; before April 2014 the figure stands', () => {
    assert.match(F4.figureF4(walk({ seller: 'no', date: '03/2025' }).s).parts[0]?.left_out ?? '', /seller did not claim/);
    assert.ok(F4.figureF4(walk({ seller: 'no', date: '03/2013' }).s).high > 0);
    assert.ok(F4.figureF4(walk({ seller: 'dont_know', date: '03/2025' }).s).high > 0);
  });
  test('both reach the engine’s session for a funnel-4 purchase; "not sure" and "don’t know" set nothing (N4)', () => {
    const a = sessionFromFunnel('gp', walk({ prior: 'yes', seller: 'no', date: '03/2025' }).s);
    assert.equal((a.session as S)['prior_claim_self'], true);
    assert.equal((a.session as S)['prior_owner_claimed'], 'no');
    const b = sessionFromFunnel('gp', walk({ prior: 'not sure', seller: 'dont_know', date: '03/2025' }).s);
    assert.equal('prior_claim_self' in (b.session as S), false);
    assert.equal('prior_owner_claimed' in (b.session as S), false);
  });
});

describe('E7 — estimate() called directly applies the reasoned negatives', () => {
  const run = (extra: S) => estimate('gp', Object.assign(newSession('gp'), { trigger: ['purchase'], base_amount: 650000 }, extra) as never);
  test('no UK tax: no saving, a referral; the client’s own fixtures claim: no spend and no saving', () => {
    const t = run({ is_taxpayer: 'no' });
    assert.deepEqual([t.TS[1], t.outcome], [0, 'referral']);
    const c = run({ prior_claim_self: true });
    assert.deepEqual([c.QE[1], c.TS[1], c.outcome], [0, 0, 'referral']);
    assert.ok((run({}).TS[1] ?? 0) > 0, 'the control: a taxpayer with no earlier claim has a saving');
  });
});

describe('E19 and item 8 — the figure’s own words', () => {
  test('a loss-making building is told the relief may come as a loss; a profitable one is not', () => {
    assert.ok(F4.figureF4(walk({ profit: 'loss', date: '03/2025' }).s).assumptions.some((a) => /It makes a loss/.test(a)));
    assert.ok(!F4.figureF4(walk({ profit: 'profitable', date: '03/2025' }).s).assumptions.some((a) => /It makes a loss/.test(a)));
  });
  test('"move it down, not up" is gone; the words say checking can move it down and later work can add to it', () => {
    for (const w of [CLIENT_RANGE_BASIS, CLIENT_RANGE_BASIS_AFTER_RESEARCH, String(F4.figureBody(walk({ date: '03/2025' }).s, { available: false, say: '' }, undefined, []))]) {
      assert.doesNotMatch(w, /down, not up/);
      assert.match(w, /can add to it/);
    }
  });
});
