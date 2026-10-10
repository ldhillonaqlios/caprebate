/**
 * PHASE 159j (item 1), 10 October 2026 — THE PACK'S SUMS, ITS GRANTS AND THE RETURN ENTRIES, AS SEEDED PROPERTY TESTS.
 *
 * The stress test of 9 October 2026 ran these by hand (04-phase-work/stress-2026-10-09/claim/h1-packsums.ts and
 * h4-returns.ts, in OneDrive). Here they draw from a fixed seed, so every run makes the same packs, and each returns
 * the properties that broke rather than printing them: test/phase159j.test.ts fails on any.
 *
 *   packs     random complete and incomplete packs: the pools add up to what qualifies, what qualifies is never more
 *             than the building's price, the share stays in 0-100%, and the total is exactly round(BP x q / R) worked
 *             out again here in BigInt (s.562), independent of the module.
 *   grants    random grants on random packs, both switch settings: the pools still add up and stay within [0, Q], and
 *             each grant's own row adds up to the total taken off (C23).
 *   returns   random pools through the return entries: on every row, brought forward less the allowance is carried
 *             forward, to the penny (C16).
 */
import { LIMITS, packSums, type PackInputs, type PackLine } from '../src/web/pack-sums.ts';
import { applyGrants, type PackGrant } from '../src/web/pack-grants.ts';
import { returnEntries, RETURN_YEARS, type ReturnEntry } from '../src/web/return-entries.ts';

/** xorshift32 from a fixed seed: the same draws every run. */
export function seeded(seed: number): { rnd: () => number; ri: (lo: number, hi: number) => number; pick: <T>(xs: readonly T[]) => T } {
  let s = seed >>> 0;
  const rnd = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
  const ri = (lo: number, hi: number): number => Math.floor(lo + rnd() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  return { rnd, ri, pick };
}

const v = (value: number | null) => ({ value, source: null });
export function line(id: string, qty: number | null, rate: number | null, qpct: number | null, pool: 'MP' | 'SR' | null, removed = false): PackLine {
  return { id, label: id, element_id: id, unit: 'no', pool, pool_source: null, qty_milli: v(qty), rate_pence: v(rate), qpct_bp: v(qpct), removed, removed_source: null };
}
export const inputs = (price: number | null, land: number | null, gia: number | null, rate: number | null): PackInputs =>
  ({ price_paid_pence: v(price), land_pence: v(land), gia_milli_m2: v(gia), building_rate_pence: v(rate) });

/** Round a x b / d half up, in BigInt — the reference the module is checked against. */
const rd = (a: bigint, b: bigint, d: bigint): bigint => (a * b * 2n + d) / (2n * d);

export type PackStress = { tried: number; complete: number; refused: number; failures: string[] };

export function runPackStress(n = 20_000, seed = 0x5eed1234): PackStress {
  const { rnd, ri, pick } = seeded(seed);
  const failures: string[] = [];
  let complete = 0, refused = 0;
  for (let t = 0; t < n; t++) {
    const price = ri(1, 2_000_000_00) * (rnd() < 0.05 ? 500 : 1);
    const land = rnd() < 0.05 ? price + ri(0, 1000) : ri(0, Math.max(0, price - 1));
    const gia = ri(1, 5_000_000);
    const brate = ri(0, 5_000_00);
    const lines: PackLine[] = [];
    for (let i = 0, nl = ri(0, 25); i < nl; i++) lines.push(line(`L${String(i)}`, ri(0, 2_000_000), ri(0, 3_000_00), ri(0, 10000), pick(['MP', 'SR'] as const), rnd() < 0.1));
    const p = Math.min(price, LIMITS.money_pence), l = Math.min(land, LIMITS.money_pence);
    const s = packSums(inputs(p, l, gia, brate), lines);
    const at = `pack ${String(t)} (price ${String(p)}, land ${String(l)}, GIA ${String(gia)}, rate ${String(brate)}, ${String(lines.length)} lines)`;
    if (!s.complete) { refused++; if (s.qualifying_pence !== null) failures.push(`${at}: an incomplete pack has a total`); continue; }
    complete++;
    const q = s.qualifying_pence, m = s.main_pool_pence, sp = s.special_pool_pence, bp = s.building_price_pence, share = s.share_bp;
    if (q === null || m === null || sp === null || bp === null || share === null) { failures.push(`${at}: a complete pack is missing a figure`); continue; }
    if (m + sp !== q) failures.push(`${at}: the pools do not add up (${String(m)} + ${String(sp)} != ${String(q)})`);
    if (m < 0 || sp < 0) failures.push(`${at}: a pool is negative`);
    if (q > bp) failures.push(`${at}: what qualifies (${String(q)}) is more than the building's price (${String(bp)})`);
    if (bp > p - l) failures.push(`${at}: the building's price is more than the price less the land`);
    if (share < 0 || share > 10000) failures.push(`${at}: the share is ${String(share)} basis points`);
    let qs = 0n;
    for (const x of lines) {
      if (x.removed) continue;
      const c = rd(BigInt(x.qty_milli.value ?? 0), BigInt(x.rate_pence.value ?? 0), 1000n);
      qs += rd(c, BigInt(x.qpct_bp.value ?? 0), 10000n);
    }
    const want = rd(BigInt(p - l), qs, rd(BigInt(gia), BigInt(brate), 1000n));
    if (BigInt(q) !== want) failures.push(`${at}: what qualifies is ${String(q)}, but round(BP x q / R) is ${String(want)}`);
  }
  return { tried: n, complete, refused, failures };
}

export type GrantStress = { runs: number; failures: string[] };

export function runGrantStress(n = 5_000, seed = 0x6a2a7e11): GrantStress {
  const { rnd, ri, pick } = seeded(seed);
  const failures: string[] = [];
  let runs = 0;
  for (let t = 0; t < n; t++) {
    const price = ri(100_000_00, 5_000_000_00), land = ri(0, Math.floor(price / 2));
    const lines: PackLine[] = Array.from({ length: ri(1, 8) }, (_, i) => line(`E${String(i)}`, ri(1_000, 200_000), ri(100_00, 2_000_00), ri(0, 10000), pick(['MP', 'SR'] as const)));
    const inp = inputs(price, land, 2_000_000, 3000_00);
    const s = packSums(inp, lines);
    if (!s.complete || s.qualifying_pence === null) continue;
    const grants: PackGrant[] = Array.from({ length: ri(1, 4) }, (_, i) => ({
      id: `g${String(i)}`, payer_class: pick(['nhs', 'local_authority', 'insurer', 'landlord_connected', 'UNKNOWN', 'charity']),
      amount_pence: ri(1, Math.floor(price * (rnd() < 0.1 ? 2 : 1) / 3)), element_ids: rnd() < 0.5 ? [] : [pick(lines).element_id ?? ''],
    }));
    for (const sw of [{ element_trace: false, connected_no_reduction: false }, { element_trace: true, connected_no_reduction: true, untraced_full: true }]) {
      runs++;
      const r = applyGrants(inp, lines, s, grants, sw);
      const at = `grant run ${String(t)} (${JSON.stringify(sw)})`;
      const q2 = r.sums.qualifying_pence, m2 = r.sums.main_pool_pence, s2 = r.sums.special_pool_pence;
      if (q2 === null || m2 === null || s2 === null) { failures.push(`${at}: no total after the grants`); continue; }
      if (m2 + s2 !== q2) failures.push(`${at}: the pools do not add up after the grants`);
      if (q2 > s.qualifying_pence || q2 < 0 || m2 < 0 || s2 < 0) failures.push(`${at}: what qualifies after the grants (${String(q2)}) is outside [0, ${String(s.qualifying_pence)}]`);
      const rows = r.effects.reduce((a, e) => a + (e.reduction_pence ?? 0), 0);
      if (rows !== (r.reduction_pence ?? 0)) failures.push(`${at}: the grants' own rows add up to ${String(rows)}, the total taken off is ${String(r.reduction_pence)}`);
    }
  }
  return { runs, failures };
}

export type ReturnStress = { rows: number; worst_pence: number; failures: string[] };

const snap = (mp: number, sr: number) => ({ version: 1, business: { name: 'Test Practice Ltd' }, sums: { main_pool_pence: mp, special_pool_pence: sr } }) as never;
const isAllowance = (e: ReturnEntry) => e.entry === 'Writing-down allowance' || e.entry === 'Small pool written off';

export function runReturnStress(n = 3_000, seed = 0x0dd5eed5): ReturnStress {
  const { ri, pick } = seeded(seed);
  const failures: string[] = [];
  let rows = 0, worst = 0;
  for (let t = 0; t < n; t++) {
    const mp = ri(0, 5_000_000_00), sr = ri(0, 5_000_000_00);
    const ctx = { period_start: pick(['2018-01-01', '2019-01-01', '2023-01-01', '2024-01-01', '2025-07-01', '2026-04-01']), is_company: pick([true, false]) };
    const es = returnEntries(snap(mp, sr), ctx);
    for (const pool of ['Main pool', 'Special rate pool'] as const) {
      let bf = pool === 'Main pool' ? mp : sr;
      for (let i = 1; i <= RETURN_YEARS; i++) {
        const w = es.find((e) => e.return_no === i && e.pool === pool && isAllowance(e))?.amount_pence;
        const cf = es.find((e) => e.return_no === i && e.pool === pool && e.entry === 'Balance carried forward')?.amount_pence;
        if (typeof w !== 'number' || typeof cf !== 'number') { failures.push(`pools £${String(mp / 100)} / £${String(sr / 100)}, ${JSON.stringify(ctx)}: return ${String(i)}'s ${pool} has no allowance or balance`); break; }
        rows++;
        const gap = Math.abs(bf - w - cf);
        worst = Math.max(worst, gap);
        if (gap !== 0) failures.push(`pools £${String(mp / 100)} / £${String(sr / 100)}, ${JSON.stringify(ctx)}: return ${String(i)}'s ${pool}: ${String(bf)} - ${String(w)} != ${String(cf)}`);
        if (w < 0 || cf < 0) failures.push(`return ${String(i)}'s ${pool} is negative`);
        bf = cf;
      }
    }
  }
  return { rows, worst_pence: worst, failures };
}
