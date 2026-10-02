/**
 * 1 OCTOBER 2026 — THE SURVEY PACK'S SUMS, STRESS-TESTED (src/web/pack-sums.ts).
 *
 * Lakhbir: "when you build this stress test it, this is one thing that cannot fail."
 *
 * Three kinds of test:
 *   1. WORKED EXAMPLES, done by hand in the comments, so a reader can check the method itself.
 *   2. AN INDEPENDENT ORACLE: the same sums written a second way (exact fractions, rounding by comparing the remainder),
 *      checked against the module on 20,000 made-up packs from a fixed seed — the same packs on every run.
 *   3. THE RULES THAT MUST HOLD WHATEVER THE NUMBERS: the pools add up to the penny; nothing missing gives a total;
 *      the order of the lines changes nothing; taking a line out never adds; a count of 0 is the same as taking it out;
 *      the extremes do not overflow; bad values are treated as missing, never as numbers; the parsers never throw.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITS, mulDivRound, packSums, parseMoney, parsePercent, parseQuantity, parseRate, percentWords, poundsWords, quantityWords,
  type PackInputs, type PackLine, type Pool, type Valued,
} from '../src/web/pack-sums.ts';

const ev = (value: number | null): Valued => ({ value, source: value === null ? null : { kind: 'EVIDENCE', text: 'test' } });

function line(id: string, qty: number | null, rate: number | null, qpct: number | null, pool: Pool | null, removed = false): PackLine {
  return {
    id, label: `Line ${id}`, element_id: null, unit: 'no', pool, pool_source: null,
    qty_milli: ev(qty), rate_pence: ev(rate), qpct_bp: ev(qpct), removed, removed_source: null,
  };
}

function inputs(price: number | null, land: number | null, gia: number | null, rate: number | null): PackInputs {
  return { price_paid_pence: ev(price), land_pence: ev(land), gia_milli_m2: ev(gia), building_rate_pence: ev(rate) };
}

/* ------------------------------------------------------------------ a seeded random source (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ the oracle: the same method, written a second way */
/** p/q rounded to the nearest whole number, a half up, by comparing twice the remainder with q. */
function roundFrac(p: bigint, q: bigint): bigint {
  const whole = p / q;
  const rem = p - whole * q;
  return rem * 2n >= q ? whole + 1n : whole;
}
function oracle(inp: PackInputs, lines: readonly PackLine[]) {
  const vals = [inp.price_paid_pence, inp.land_pence, inp.gia_milli_m2, inp.building_rate_pence];
  if (vals.some((v) => v.value === null)) return null;
  const live = lines.filter((l) => !l.removed);
  if (live.some((l) => l.qty_milli.value === null || l.rate_pence.value === null || l.qpct_bp.value === null || l.pool === null)) return null;
  let cost = 0n, qual = 0n, main = 0n;
  for (const l of live) {
    const c = roundFrac(BigInt(l.qty_milli.value!) * BigInt(l.rate_pence.value!), 1000n);
    const q = roundFrac(c * BigInt(l.qpct_bp.value!), 10000n);
    cost += c; qual += q; if (l.pool === 'MP') main += q;
  }
  const rebuild = roundFrac(BigInt(inp.gia_milli_m2.value!) * BigInt(inp.building_rate_pence.value!), 1000n);
  const price = BigInt(inp.price_paid_pence.value!), land = BigInt(inp.land_pence.value!);
  if (land >= price || rebuild === 0n || cost > rebuild) return null;
  const bp = price - land;
  const q = roundFrac(bp * qual, rebuild);
  const m = roundFrac(bp * main, rebuild);
  return { qualifying: Number(q), main: Number(m), special: Number(q - m), rebuild: Number(rebuild), building: Number(bp) };
}

/** A random pack that is usually complete and sometimes has a gap, a removed line or a problem. */
function randomPack(r: () => number) {
  const int = (max: number) => Math.floor(r() * (max + 1));
  const gia = 1000 * (50 + int(20000)) + int(999);
  const rate = 50000 + int(500000);                 // £500 to £5,500 a m²
  const rebuild = Math.round((gia * rate) / 1000);
  const price = 10_000_00 + int(50_000_000_00);      // £10,000 to £50m
  const land = r() < 0.03 ? price + int(1000) : int(Math.floor(price * 0.6));
  const n = int(30);
  const lines: PackLine[] = [];
  let budget = r() < 0.05 ? rebuild * 2 : rebuild;   // sometimes the elements are allowed to cost more than the building
  for (let i = 0; i < n; i++) {
    const qty = 1 + int(5000_000);
    const maxRate = Math.max(1, Math.floor((budget / Math.max(1, n)) * 1000 / qty));
    const lrate = Math.min(int(maxRate), LIMITS.rate_pence);
    const qpct = r() < 0.5 ? 10000 : int(10000);
    const pool: Pool | null = r() < 0.01 ? null : r() < 0.6 ? 'MP' : 'SR';
    const gap = r() < 0.01;
    lines.push(line(`l${i}`, gap ? null : qty, lrate, qpct, pool, r() < 0.1));
  }
  void budget;
  const missingInput = r() < 0.02;
  return { inp: inputs(price, missingInput ? null : land, gia, rate), lines };
}

describe('the pack’s sums', () => {
  test('a worked example, by hand', () => {
    // Price £1,050,000; land £50,000; so the building's price is £1,000,000.
    // Floor area 640 m² × £1,847.50 a m² = £1,182,400 to rebuild.
    // Electrics: 640 m² × £162 = £103,680, 75% qualifies = £77,760, special rate pool.
    // Lift: 1 × £38,000 = £38,000, 100% = £38,000, main pool.
    // Qualifying rebuild cost £115,760 of £1,182,400. Share 9.79%.
    // What qualifies = £1,000,000 × 115,760 ÷ 1,182,400 = £97,902.57 (97,902.5719…).
    // Main pool = £1,000,000 × 38,000 ÷ 1,182,400 = £32,138.02 (32,138.0243…). Special = £97,902.57 − £32,138.02 = £65,764.55.
    const s = packSums(inputs(105_000_000, 5_000_000, 640_000, 184_750), [
      line('e', 640_000, 16_200, 7500, 'SR'),
      line('l', 1000, 3_800_000, 10000, 'MP'),
    ]);
    assert.equal(s.complete, true);
    assert.equal(s.rebuild_pence, 118_240_000);
    assert.equal(s.building_price_pence, 100_000_000);
    assert.deepEqual(s.lines.map((x) => [x.cost_pence, x.qualifying_pence]), [[10_368_000, 7_776_000], [3_800_000, 3_800_000]]);
    assert.equal(s.qualifying_pence, 9_790_257);
    assert.equal(s.main_pool_pence, 3_213_802);
    assert.equal(s.special_pool_pence, 6_576_455);
    assert.equal(s.share_bp, 979);
    assert.equal(poundsWords(s.qualifying_pence), '£97,902.57');
    assert.equal(percentWords(s.share_bp), '9.79%');
  });

  test('half a penny rounds up; less than half rounds down', () => {
    assert.equal(mulDivRound(1n, 1n, 2n), 1n);
    assert.equal(mulDivRound(1n, 1n, 3n), 0n);
    assert.equal(mulDivRound(5n, 1n, 2n), 3n);
    assert.equal(mulDivRound(0n, 7n, 9n), 0n);
    assert.throws(() => mulDivRound(1n, 1n, 0n), RangeError);
    // A line: 0.5 m² × 1p = 0.5p → 1p; 0.499 m² × 1p = 0.499p → 0p.
    assert.equal(packSums(inputs(100, 0, 1000, 1), [line('a', 500, 1, 10000, 'MP')]).lines[0]?.cost_pence, 1);
    assert.equal(packSums(inputs(100, 0, 1000, 1), [line('a', 499, 1, 10000, 'MP')]).lines[0]?.cost_pence, 0);
  });

  test('20,000 made-up packs agree with the oracle to the penny, and the pools always add up', () => {
    const r = rng(20261001);
    let complete = 0;
    for (let i = 0; i < 20_000; i++) {
      const { inp, lines } = randomPack(r);
      const s = packSums(inp, lines);
      const o = oracle(inp, lines);
      if (o === null) {
        assert.equal(s.qualifying_pence, null, `pack ${i}: a total where the oracle has none`);
        assert.equal(s.complete, false);
        assert.ok(s.needed.length + s.problems.length > 0, `pack ${i}: no total and no reason`);
        continue;
      }
      complete++;
      assert.equal(s.complete, true, `pack ${i}: ${JSON.stringify(s.needed)} ${JSON.stringify(s.problems)}`);
      assert.equal(s.qualifying_pence, o.qualifying, `pack ${i}`);
      assert.equal(s.main_pool_pence, o.main, `pack ${i}`);
      assert.equal(s.rebuild_pence, o.rebuild, `pack ${i}`);
      assert.equal((s.main_pool_pence ?? 0) + (s.special_pool_pence ?? 0), s.qualifying_pence, `pack ${i}: the pools do not add up`);
      assert.ok((s.special_pool_pence ?? -1) >= 0 && (s.main_pool_pence ?? -1) >= 0, `pack ${i}: a negative pool`);
      assert.ok((s.qualifying_pence ?? 0) <= o.building, `pack ${i}: more qualifies than the building cost`);
      for (const v of [s.qualifying_pence, s.main_pool_pence, s.special_pool_pence, s.rebuild_pence, s.elements_cost_pence]) {
        assert.ok(v === null || Number.isSafeInteger(v), `pack ${i}: not a whole number of pence`);
      }
    }
    assert.ok(complete > 12_000, `only ${complete} complete packs were tried`);
  });

  test('the order of the lines changes nothing', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const { inp, lines } = randomPack(r);
      const shuffled = [...lines].sort(() => r() - 0.5);
      const a = packSums(inp, lines), b = packSums(inp, shuffled);
      assert.deepEqual([a.qualifying_pence, a.main_pool_pence, a.special_pool_pence, a.complete], [b.qualifying_pence, b.main_pool_pence, b.special_pool_pence, b.complete]);
    }
  });

  test('taking a line out never adds; a count of 0 is the same as taking it out; moving a line between pools keeps the total', () => {
    const r = rng(11);
    let tried = 0;
    for (let i = 0; i < 3000; i++) {
      const { inp, lines } = randomPack(r);
      const s = packSums(inp, lines);
      if (!s.complete || lines.length === 0) continue;
      const k = Math.floor(r() * lines.length);
      const target = lines[k]!;
      if (target.removed) continue;
      tried++;
      const out = packSums(inp, lines.map((l, j) => (j === k ? { ...l, removed: true } : l)));
      const zero = packSums(inp, lines.map((l, j) => (j === k ? { ...l, qty_milli: ev(0) } : l)));
      assert.ok((out.qualifying_pence ?? 0) <= (s.qualifying_pence ?? 0), `pack ${i}: taking a line out added`);
      assert.equal(out.qualifying_pence, zero.qualifying_pence, `pack ${i}: 0 is not the same as taken out`);
      const flipped = packSums(inp, lines.map((l, j) => (j === k ? { ...l, pool: (l.pool === 'MP' ? 'SR' : 'MP') as Pool } : l)));
      assert.equal(flipped.qualifying_pence, s.qualifying_pence, `pack ${i}: moving pools changed the total`);
    }
    assert.ok(tried > 1000);
  });

  test('any one value missing: no total, and the gap is named', () => {
    const base = () => ({
      inp: inputs(105_000_000, 5_000_000, 640_000, 184_750),
      lines: [line('e', 640_000, 16_200, 7500, 'SR'), line('l', 1000, 3_800_000, 10000, 'MP')],
    });
    assert.equal(packSums(base().inp, base().lines).complete, true);
    for (const k of ['price_paid_pence', 'land_pence', 'gia_milli_m2', 'building_rate_pence'] as const) {
      const b = base();
      const s = packSums({ ...b.inp, [k]: ev(null) }, b.lines);
      assert.equal(s.qualifying_pence, null, k);
      assert.equal(s.main_pool_pence, null, k);
      assert.ok(s.needed.some((n) => n.key === k), `${k} not named`);
    }
    const gaps: [string, (l: PackLine) => PackLine][] = [
      ['how much', (l) => ({ ...l, qty_milli: ev(null) })],
      ['the rate', (l) => ({ ...l, rate_pence: ev(null) })],
      ['the share that qualifies', (l) => ({ ...l, qpct_bp: ev(null) })],
      ['the pool', (l) => ({ ...l, pool: null })],
    ];
    for (const [words, f] of gaps) {
      const b = base();
      const s = packSums(b.inp, [f(b.lines[0]!), b.lines[1]!]);
      assert.equal(s.qualifying_pence, null, words);
      assert.match(s.needed[0]?.words ?? '', new RegExp(`Line e: ${words}\\.`));
    }
    // A missing value on a line taken out does not matter.
    const b = base();
    assert.equal(packSums(b.inp, [{ ...b.lines[0]!, qty_milli: ev(null), removed: true }, b.lines[1]!]).complete, true);
  });

  test('values that are not whole, non-negative numbers are missing, never numbers', () => {
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2, 10001]) {
      const s = packSums(inputs(105_000_000, 5_000_000, 640_000, 184_750), [line('x', 1000, 100, bad, 'MP')]);
      assert.equal(s.qualifying_pence, null, String(bad));
      assert.equal(s.complete, false, String(bad));
      const t = packSums(inputs(bad, 5_000_000, 640_000, 184_750), [line('x', 1000, 100, 10000, 'MP')]);
      assert.equal(t.qualifying_pence, null, `price ${bad}`);
    }
  });

  test('the problems: land at or above the price; elements costing more than the building; a building costing nothing', () => {
    const l = [line('a', 1000, 10_000, 10000, 'MP')];
    const p1 = packSums(inputs(1000, 1000, 1000, 100_000), l);
    assert.deepEqual(p1.problems.map((p) => p.code), ['LAND_NOT_BELOW_PRICE']);
    assert.equal(p1.qualifying_pence, null);
    const p2 = packSums(inputs(100_000, 0, 1000, 5_000), l); // rebuild £50, elements £100
    assert.deepEqual(p2.problems.map((p) => p.code), ['ELEMENTS_EXCEED_BUILDING']);
    assert.equal(p2.qualifying_pence, null);
    const p3 = packSums(inputs(100_000, 0, 0, 5_000), [line('a', 0, 10_000, 10000, 'MP')]);
    assert.deepEqual(p3.problems.map((p) => p.code), ['NO_REBUILD_COST']);
    assert.equal(p3.qualifying_pence, null);
    // Elements exactly equal to the building is allowed: everything qualifies, so the whole building's price does.
    const p4 = packSums(inputs(100_000, 20_000, 1000, 10_000), l);
    assert.equal(p4.qualifying_pence, 80_000);
  });

  test('the extremes do not overflow: £1bn, a million units, the largest rate', () => {
    // A million m² at £1m a m² = £100bn to rebuild; 200 lines of a million units at £500 = £100bn between them.
    const big = packSums(inputs(LIMITS.money_pence, 0, LIMITS.gia_milli_m2, LIMITS.rate_pence),
      Array.from({ length: 200 }, (_, i) => line(`b${i}`, LIMITS.qty_milli, 50_000, 10000, i % 2 === 0 ? 'MP' : 'SR')));
    assert.equal(big.complete, true);
    for (const v of [big.qualifying_pence, big.main_pool_pence, big.special_pool_pence, big.rebuild_pence]) assert.ok(Number.isSafeInteger(v));
    assert.equal((big.main_pool_pence ?? 0) + (big.special_pool_pence ?? 0), big.qualifying_pence);
    // Lines that together pass what the computer holds exactly: refused as too large, never rounded.
    const huge = packSums(inputs(LIMITS.money_pence, 0, LIMITS.gia_milli_m2, LIMITS.rate_pence),
      Array.from({ length: 100 }, (_, i) => line(`h${i}`, LIMITS.qty_milli, LIMITS.rate_pence, 10000, 'MP')));
    assert.deepEqual(huge.problems.map((p) => p.code), ['TOO_LARGE']);
    assert.equal(huge.qualifying_pence, null);
    assert.equal(huge.elements_cost_pence, null);
    // One value above its limit is missing, and named.
    const over = packSums(inputs(LIMITS.money_pence + 1, 0, 1000, 100), []);
    assert.equal(over.qualifying_pence, null);
    assert.ok(over.needed.some((n) => n.key === 'price_paid_pence'));
    // No lines at all: nothing qualifies, and that is an answer (0), not a gap.
    const none = packSums(inputs(100_000, 0, 1000, 100), []);
    assert.equal(none.qualifying_pence, 0);
    assert.equal(none.main_pool_pence, 0);
    assert.equal(none.special_pool_pence, 0);
  });
});

describe('reading what a person types', () => {
  test('money, quantities, rates and percentages: what is taken and what is refused', () => {
    assert.deepEqual(parseMoney('£1,050,000'), { ok: true, value: 105_000_000 });
    assert.deepEqual(parseMoney('1050000.5'), { ok: true, value: 105_000_050 });
    assert.deepEqual(parseMoney('0.07'), { ok: true, value: 7 });
    assert.deepEqual(parseMoney('1000000000'), { ok: true, value: 100_000_000_000 });
    for (const bad of ['', '-5', '1.234', 'abc', '1e6', '10000000001', '£', '1..2', '12 34x']) assert.equal(parseMoney(bad).ok, false, bad);
    assert.deepEqual(parseQuantity('640.5'), { ok: true, value: 640_500 });
    assert.deepEqual(parseQuantity('8'), { ok: true, value: 8000 });
    assert.deepEqual(parseQuantity('0.001'), { ok: true, value: 1 });
    for (const bad of ['', '-1', '1.2345', 'x', '1000001']) assert.equal(parseQuantity(bad).ok, false, bad);
    assert.deepEqual(parsePercent('75'), { ok: true, value: 7500 });
    assert.deepEqual(parsePercent('62.5%'), { ok: true, value: 6250 });
    assert.deepEqual(parsePercent('100'), { ok: true, value: 10000 });
    assert.deepEqual(parsePercent('0'), { ok: true, value: 0 });
    for (const bad of ['100.01', '101', '-1', '', '1.234', 'half']) assert.equal(parsePercent(bad).ok, false, bad);
    assert.deepEqual(parseRate('1,847.50'), { ok: true, value: 184_750 });
  });

  test('a fuzz of 50,000 random strings: no parser ever throws, and every number it gives is a whole, in-range number', () => {
    const r = rng(99);
    const chars = '0123456789.,£% -eE+xX \t';
    for (let i = 0; i < 50_000; i++) {
      const s = Array.from({ length: Math.floor(r() * 16) }, () => chars[Math.floor(r() * chars.length)]).join('');
      for (const [f, max] of [[parseMoney, LIMITS.money_pence], [parseQuantity, LIMITS.qty_milli], [parsePercent, LIMITS.qpct_bp], [parseRate, LIMITS.rate_pence]] as const) {
        const p = f(s);
        if (p.ok) assert.ok(Number.isSafeInteger(p.value) && p.value >= 0 && p.value <= max, `${f.name}(${JSON.stringify(s)}) = ${p.value}`);
      }
    }
  });

  test('a typed value read back and shown again is the same number', () => {
    const r = rng(5);
    for (let i = 0; i < 5000; i++) {
      const pence = Math.floor(r() * LIMITS.money_pence);
      const shown = poundsWords(pence);
      const back = parseMoney(shown);
      assert.ok(back.ok && back.value === pence, `${pence} → ${shown}`);
      const milli = Math.floor(r() * LIMITS.qty_milli);
      const q = parseQuantity(quantityWords(milli));
      assert.ok(q.ok && q.value === milli, `${milli} → ${quantityWords(milli)}`);
      const bp = Math.floor(r() * 10001);
      const pc = parsePercent(percentWords(bp));
      assert.ok(pc.ok && pc.value === bp, `${bp} → ${percentWords(bp)}`);
    }
  });
});
