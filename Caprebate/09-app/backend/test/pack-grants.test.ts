/**
 * PHASE 153a, 4 OCTOBER 2026 — THE SURVEY PACK'S GRANTS, BOTH WAYS (src/web/pack-grants.ts). F-15's remainder.
 *
 * The switch CB_CTA.grant_traced_to_elements ships OFF. Off, every grant comes off in equal share (the grant_fraction
 * route); on, a grant matched to rows of the fixture list comes off only those rows. Both are tested here, by passing the
 * switch in; the one that ships is asserted off at the end, read from the engine itself.
 *
 * THE WORKED PACK, done by hand so a reader can check the method:
 *   price paid £1,000,000, bare land £200,000, so the building is £800,000.
 *   1,000 m² at £1,000 a m², so the whole building costs £1,000,000 to rebuild.
 *     A  LS-SR-001 the electrics     1,000 m² × £100   = £100,000, 100% qualifies = £100,000, special rate pool
 *     B  LS-MP-003 the fire alarm    1 × £50,000       =  £50,000, 100% qualifies =  £50,000, main pool
 *     C  LS-MP-001 the washbasins   10 × £5,000        =  £50,000,  50% qualifies =  £25,000, main pool
 *   qualifying rebuild cost £175,000 of £1,000,000, so £800,000 × 17.5% = £140,000 qualifies:
 *   main pool £800,000 × 7.5% = £60,000, special rate pool £80,000.
 *   On the building's price, B's spend is £40,000 (all of it qualifies) and C's is £40,000 (£20,000 qualifies).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { packSums, type PackInputs, type PackLine, type Pool, type Valued } from '../src/web/pack-sums.ts';
import { applyGrants, grantRoute, PAYER_CLASS_KEYS, type GrantSwitches, type PackGrant } from '../src/web/pack-grants.ts';
import { CTA } from '../src/web/engine.ts';

const ev = (value: number | null): Valued => ({ value, source: value === null ? null : { kind: 'EVIDENCE', text: 'test' } });
const L = (id: string, element_id: string | null, qty: number | null, rate: number | null, qpct: number | null, pool: Pool | null, removed = false): PackLine => ({
  id, label: `Line ${id}`, element_id, unit: 'no', pool, pool_source: null,
  qty_milli: ev(qty), rate_pence: ev(rate), qpct_bp: ev(qpct), removed, removed_source: null,
});
const inputs = (price: number | null, land: number | null, gia: number | null, rate: number | null): PackInputs =>
  ({ price_paid_pence: ev(price), land_pence: ev(land), gia_milli_m2: ev(gia), building_rate_pence: ev(rate) });

const gbp = (pounds: number) => pounds * 100;
const IN = inputs(gbp(1_000_000), gbp(200_000), 1_000_000, gbp(1_000));
const PACK: readonly PackLine[] = [
  L('A', 'LS-SR-001', 1_000_000, gbp(100), 10000, 'SR'),
  L('B', 'LS-MP-003', 1000, gbp(50_000), 10000, 'MP'),
  L('C', 'LS-MP-001', 10_000, gbp(5_000), 5000, 'MP'),
];
const OFF: GrantSwitches = { element_trace: false, connected_no_reduction: false };
const ON: GrantSwitches = { element_trace: true, connected_no_reduction: false };
const G = (id: string, payer_class: string, pounds: number | null, element_ids: readonly string[] = []): PackGrant =>
  ({ id, payer_class, amount_pence: pounds === null ? null : gbp(pounds), element_ids });

function run(grants: readonly PackGrant[], sw: GrantSwitches, lines: readonly PackLine[] = PACK, inp: PackInputs = IN) {
  return applyGrants(inp, lines, packSums(inp, lines), grants, sw);
}
const pools = (r: ReturnType<typeof run>) => [r.sums.qualifying_pence, r.sums.main_pool_pence, r.sums.special_pool_pence];

describe('the worked pack, before any grant', () => {
  test('£140,000 qualifies: £60,000 main pool, £80,000 special rate pool', () => {
    const s = packSums(IN, PACK);
    assert.deepEqual([s.qualifying_pence, s.main_pool_pence, s.special_pool_pence, s.complete], [gbp(140_000), gbp(60_000), gbp(80_000), true]);
  });
  test('with no grant the sums come back unchanged — the same object', () => {
    const s = packSums(IN, PACK);
    const r = applyGrants(IN, PACK, s, [], ON);
    assert.equal(r.sums, s);
    assert.equal(r.reduction_pence, 0);
  });
});

describe('SWITCH OFF, as it ships — every grant in equal share, the grant_fraction route', () => {
  test('£40,000 of NHS money on a £1,000,000 price takes 4% off every item: £134,400 = £57,600 + £76,800', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000)], OFF)), [gbp(134_400), gbp(57_600), gbp(76_800)]);
  });
  test('matching it to the fire alarm changes nothing while the switch is off', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000, ['LS-MP-003'])], OFF)), pools(run([G('g1', 'nhs', 40_000)], OFF)));
    assert.equal(run([G('g1', 'nhs', 40_000, ['LS-MP-003'])], OFF).effects[0]?.route, 'EQUAL_SHARE');
  });
  test('a grant as large as the price takes everything; never below nothing', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 1_500_000)], OFF)), [0, 0, 0]);
  });
});

describe('SWITCH ON — a grant matched to rows of the fixture list comes off only those rows', () => {
  test('£40,000 matched to the fire alarm meets all of its £40,000: £100,000 qualifies, all of it off the main pool', () => {
    const r = run([G('g1', 'nhs', 40_000, ['LS-MP-003'])], ON);
    assert.deepEqual(pools(r), [gbp(100_000), gbp(20_000), gbp(80_000)]);
    assert.deepEqual([r.effects[0]?.route, r.effects[0]?.line_ids, r.effects[0]?.reduction_pence, r.reduction_pence], ['ITEMS', ['B'], gbp(40_000), gbp(40_000)]);
  });
  test('matched to the washbasins, half of which qualify, it takes off only that half: £120,000', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000, ['LS-MP-001'])], ON)), [gbp(120_000), gbp(40_000), gbp(80_000)]);
  });
  test('matched to both, it is shared by their rebuild cost: £20,000 each, so £20,000 + £10,000 off — £110,000', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000, ['LS-MP-003', 'LS-MP-001'])], ON)), [gbp(110_000), gbp(30_000), gbp(80_000)]);
  });
  test('more than an item cost takes all of its qualifying part and no more, however many grants met it', () => {
    assert.deepEqual(pools(run([G('g1', 'nhs', 30_000, ['LS-MP-003']), G('g2', 'local_authority', 30_000, ['LS-MP-003'])], ON)), [gbp(100_000), gbp(20_000), gbp(80_000)]);
  });
  test('Word question 79: a grant that paid only for items that never qualify takes nothing off', () => {
    const r = run([G('g1', 'homes_england_gla', 40_000, ['SL-X-001'])], ON);
    assert.deepEqual(pools(r), [gbp(140_000), gbp(60_000), gbp(80_000)]);
    assert.match(r.effects[0]?.words ?? '', /takes nothing off/);
  });
  test('a line the surveyor took out is not counted, so a grant matched only to it takes nothing off', () => {
    const lines = [PACK[0]!, PACK[1]!, L('C', 'LS-MP-001', 10_000, gbp(5_000), 5000, 'MP', true)];
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000, ['LS-MP-001'])], ON, lines)), pools(run([], ON, lines)));
  });
  test('N4: a grant matched only in words, or not at all, keeps the equal share — never taken as paying for nothing', () => {
    const r = run([G('g1', 'nhs', 40_000)], ON);
    assert.deepEqual(pools(r), [gbp(134_400), gbp(57_600), gbp(76_800)]);
    assert.equal(r.effects[0]?.route, 'EQUAL_SHARE');
  });
  test('matched grants come off first, line by line; an equal-share grant then takes its share of what is left', () => {
    // £100,000 after the fire alarm; then 4% of that: £96,000; main £20,000 × 96% = £19,200.
    assert.deepEqual(pools(run([G('g1', 'nhs', 40_000, ['LS-MP-003']), G('g2', 'nhs', 40_000)], ON)), [gbp(96_000), gbp(19_200), gbp(76_800)]);
  });
});

describe('WHO PAID — Rulebook F, F4 and F5', () => {
  for (const sw of [OFF, ON]) {
    const way = sw.element_trace ? 'on' : 'off';
    test(`switch ${way}: insurance money after damage is not taken off (F-R7)`, () => {
      const r = run([G('g1', 'insurer', 40_000, ['LS-MP-003'])], sw);
      assert.deepEqual(pools(r), [gbp(140_000), gbp(60_000), gbp(80_000)]);
      assert.equal(r.effects[0]?.route, 'NOT_TAKEN_OFF');
    });
    test(`switch ${way}: a payer not known is taken off, never relieved (N4)`, () => {
      assert.ok((run([G('g1', 'UNKNOWN', 40_000)], sw).sums.qualifying_pence ?? 0) < gbp(140_000));
    });
    test(`switch ${way}: a payer class not on the closed list is read as not known — taken off`, () => {
      assert.deepEqual(pools(run([G('g1', 'my auntie', 40_000)], sw)), pools(run([G('g1', 'UNKNOWN', 40_000)], sw)));
    });
    test(`switch ${way}: a connected landlord's money comes off unless the connected-contributor switch is on (F-R10)`, () => {
      assert.ok((run([G('g1', 'landlord_connected', 40_000)], sw).sums.qualifying_pence ?? 0) < gbp(140_000));
      assert.equal(run([G('g1', 'group_company', 40_000)], { ...sw, connected_no_reduction: true }).sums.qualifying_pence, gbp(140_000));
      assert.ok((run([G('g1', 'landlord_unconnected', 40_000)], { ...sw, connected_no_reduction: true }).sums.qualifying_pence ?? 0) < gbp(140_000));
    });
  }
  test('the closed list is Rulebook F’s, the same eleven the database holds', () => {
    assert.deepEqual([...PAYER_CLASS_KEYS].sort(), ['UNKNOWN', 'charity', 'group_company', 'homes_england_gla', 'individual', 'insurer',
      'landlord_connected', 'landlord_unconnected', 'local_authority', 'nhs', 'other_public']);
  });
});

describe('N4 — what is not known gives no total', () => {
  for (const sw of [OFF, ON]) {
    const way = sw.element_trace ? 'on' : 'off';
    test(`switch ${way}: a grant whose amount is not known gives no total, and is named in what is still needed`, () => {
      const r = run([G('g1', 'nhs', null, ['LS-MP-003'])], sw);
      assert.deepEqual([...pools(r), r.sums.share_bp, r.sums.complete, r.reduction_pence], [null, null, null, null, false, null]);
      assert.deepEqual(r.sums.needed.map((n) => [n.where, n.line_id]), [['GRANT', 'g1']]);
      assert.deepEqual(r.before.qualifying_pence, gbp(140_000));
    });
    test(`switch ${way}: an insurer's grant with no amount asks for nothing — it is not taken off at all`, () => {
      assert.equal(run([G('g1', 'insurer', null)], sw).sums.complete, true);
    });
    test(`switch ${way}: a pack with no total before grants has none after them, and keeps what it needed`, () => {
      const inp = inputs(gbp(1_000_000), null, 1_000_000, gbp(1_000));
      const r = run([G('g1', 'nhs', 40_000)], sw, PACK, inp);
      assert.equal(r.sums.qualifying_pence, null);
      assert.ok(r.sums.needed.some((n) => n.where === 'INPUT' && n.key === 'land_pence'));
    });
  }
  test('the route is chosen from what is known: no rows is untraced, on either reading', () => {
    assert.equal(grantRoute(G('g', 'nhs', 1), ON).route, 'EQUAL_SHARE');
    assert.equal(grantRoute(G('g', 'nhs', 1, ['LS-MP-003']), ON).route, 'ITEMS');
    assert.equal(grantRoute(G('g', 'nhs', 1, ['LS-MP-003']), OFF).route, 'EQUAL_SHARE');
  });
});

/* ------------------------------------------------------------------ the rules that hold whatever the numbers */
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

describe('5,000 made-up packs and grants, from a fixed seed', () => {
  const r = rng(153);
  const n = (max: number) => Math.floor(r() * max);
  const IDS = ['LS-SR-001', 'LS-SR-003', 'LS-MP-001', 'LS-MP-003', 'LS-MP-006', 'GP-MP-001', 'SL-X-001'];
  const cases = Array.from({ length: 5000 }, () => {
    const price = 1 + n(gbp(5_000_000));
    const inp = inputs(price, n(price), 1 + n(5_000_000), 1 + n(gbp(4_000)));
    const lines = Array.from({ length: 1 + n(6) }, (_, i) => L(`l${String(i)}`, IDS[n(IDS.length)] ?? null, n(2_000_000), n(gbp(2_000)), n(10001), r() < 0.5 ? 'MP' : 'SR', r() < 0.1));
    const grants = Array.from({ length: n(4) }, (_, i) => G(`g${String(i)}`, PAYER_CLASS_KEYS[n(PAYER_CLASS_KEYS.length)] ?? 'UNKNOWN', 1 + n(1_500_000),
      r() < 0.5 ? [] : [IDS[n(IDS.length)] ?? 'LS-SR-001']));
    return { inp, lines, grants };
  });
  test('the pools add up to the penny, nothing is negative, and grants never add to a claim', () => {
    let totals = 0;
    for (const c of cases) for (const sw of [OFF, ON]) {
      const x = run(c.grants, sw, c.lines, c.inp);
      if (x.sums.qualifying_pence === null) continue;
      totals += 1;
      const [q, m, s] = pools(x) as [number, number, number];
      assert.equal(m + s, q);
      assert.ok(m >= 0 && s >= 0 && q >= 0);
      assert.ok(q <= (x.before.qualifying_pence ?? -1));
      assert.ok(m <= (x.before.main_pool_pence ?? -1) || x.before.main_pool_pence === null);
      assert.equal(x.reduction_pence, (x.before.qualifying_pence ?? 0) - q);
    }
    assert.ok(totals > 3000, `only ${String(totals)} cases had a total`);
  });
  test('switch on with nothing matched to rows is exactly switch off', () => {
    for (const c of cases) {
      const bare = c.grants.map((g) => ({ ...g, element_ids: [] }));
      assert.deepEqual(pools(run(bare, ON, c.lines, c.inp)), pools(run(bare, OFF, c.lines, c.inp)));
    }
  });
  test('switch off, what a grant is matched to never matters', () => {
    for (const c of cases) {
      const bare = c.grants.map((g) => ({ ...g, element_ids: [] }));
      assert.deepEqual(pools(run(c.grants, OFF, c.lines, c.inp)), pools(run(bare, OFF, c.lines, c.inp)));
    }
  });
});

describe('the switch as it ships', () => {
  test('CB_CTA.grant_traced_to_elements exists and is OFF — read from the engine, never assumed', () => {
    assert.equal((CTA as unknown as Record<string, unknown>)['grant_traced_to_elements'], false);
  });
});
