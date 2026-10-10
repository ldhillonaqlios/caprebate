/**
 * PHASE 159j (item 1), 10 October 2026 — THE ESTIMATE ENGINE'S STRESS TEST, KEPT IN THE SUITE.
 *
 * This is the harness the stress test of 9 October 2026 ran by hand (04-phase-work/stress-2026-10-09/engine/harness.ts,
 * in OneDrive), moved here so it runs on every check. It drives the four-stage funnel through its real screen parser and
 * the engine itself over fixed grids (every sector x trigger x spend x date; every answer at a fixed spend; the engine's
 * triggers x bases x facts) and 3,000 multi-building funnels drawn from a fixed seed, so the same run is made every time.
 * Each broken property is a violation CLASS with a count and its smallest reproducer; test/phase159j.test.ts fails on any
 * class that is not one of the readings kept on purpose (each named there with the Word question that asks about it).
 * Every "Phase 159x" note below is the harness's own: each marks where a later phase moved an expectation, and why.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- the engine is untyped JavaScript; this walks it as it is */
import * as ENGINE from '../../engine/src/index.ts';
import * as FUNNEL4 from '../src/web/funnel4.ts';
import * as SESSION from '../src/web/funnel-session.ts';
import * as SR from '../src/web/shown-range.ts';

// Walked as untyped, as the harness walked them: the grids feed every string a person could type, typed or not.
const E: any = ENGINE, F4: any = FUNNEL4, FS: any = SESSION;

export type EngineViolation = { id: string; prop: string; cls: string; count: number; input: unknown; actual: unknown; expected: string; size: number };
export type EngineStress = { runs: { gridA1: number; gridA2: number; gridA3_multi: number; gridB_engine: number }; checks: number; violations: EngineViolation[]; lockwood: Record<string, unknown> };

export function runEngineStress(): EngineStress {

  const CB: any = E.CB;
  const FUNNEL: any = CB.CB_FUNNEL;
  const SECTORS = ['care_homes', 'dental', 'gp', 'supported_living', 'private_hospital'] as const;
  const F_TRIGGERS = ['purchase', 'new_build', 'refurb', 'fit_out'] as const;

  /* ------------------------------------------------------------------ violation book-keeping */
  type V = EngineViolation;
  const book = new Map<string, V>();
  let checks = 0;
  function violate(prop: string, cls: string, input: unknown, actual: unknown, expected: string, size = 0): void {
    const k = prop + '::' + cls;
    const v = book.get(k);
    if (v === undefined) book.set(k, { id: '', prop, cls, count: 1, input, actual, expected, size });
    else {
      v.count++;
      if (size < v.size) { v.input = input; v.actual = actual; v.size = size; }   // keep the smallest reproducer
    }
  }
  const bad = (n: unknown): boolean => typeof n !== 'number' || !Number.isFinite(n) || n < 0;

  /* lowOf — TRANSCRIBED from backend/src/web/assessment.ts:357 (not exported). Sum of breakdown[].low, in pence. */
  function lowOf(figure: { breakdown?: { low?: number }[] }): number | null {
    const rows = figure.breakdown ?? []; let total = 0; let any = false;
    for (const r of rows) if (typeof r.low === 'number') { total += r.low; any = true; }
    return any ? Math.round(total * 100) : null;
  }

  /* ------------------------------------------------------------------ driving the funnel through its real screen parser */
  type BAns = {
    sector: string; trigger: string; spend: string | null; date: string | null;
    tax: string; profit?: string | undefined; prior: string; seller?: string | undefined;
    works: 'yes' | 'no'; works_type?: string | undefined; works_spend?: string | null | undefined; works_year?: string | null | undefined;
    entity: string; business?: string | undefined;
  };
  function funnelState(bsAns: BAns[]): { s: any; errors: string[] } {
    const s: any = {};
    F4.markFunnel4(s);
    const errors: string[] = [];
    // add buildings
    for (let i = 1; i < bsAns.length; i++) F4.applyF4(s, 'buildings', new URLSearchParams({ add: '1' }));
    const p = (f: (i: number, b: BAns) => [string, string][]) => new URLSearchParams(bsAns.flatMap((b, i) => f(i, b)));
    const run = (id: string, f: URLSearchParams) => { errors.push(...F4.applyF4(s, id, f).errors); };
    run('buildings', p((i, b) => [[`b${i}_sector`, b.sector]]));
    run('spend-on', p((i, b) => [[`b${i}_trigger`, b.trigger]]));
    run('amounts', p((i, b) => [
      ...(b.spend === null ? [[`b${i}_spend_unknown`, 'on']] as [string, string][] : [[`b${i}_spend`, b.spend]] as [string, string][]),
      ...(b.date === null ? [[`b${i}_date_unknown`, 'on']] as [string, string][] : [[`b${i}_date`, b.date]] as [string, string][]),
    ]));
    run('tax', p((i, b) => [[`b${i}_tax`, b.tax], ...(b.profit ? [[`b${i}_profit`, b.profit]] as [string, string][] : [])]));
    run('claims', p((i, b) => [[`b${i}_prior`, b.prior], ...(b.seller ? [[`b${i}_seller`, b.seller]] as [string, string][] : [])]));
    run('works', p((i, b) => b.works === 'no' ? [[`b${i}_works`, 'no']] : [
      [`b${i}_works`, 'yes'], [`b${i}_works_type`, b.works_type ?? 'full'],
      ...(b.works_spend == null ? [[`b${i}_works_spend_unknown`, 'on']] as [string, string][] : [[`b${i}_works_spend`, b.works_spend]] as [string, string][]),
      ...(b.works_year == null ? [[`b${i}_works_year_unknown`, 'on']] as [string, string][] : [[`b${i}_works_year`, b.works_year]] as [string, string][]),
    ]));
    run('details', p((i, b) => [[`b${i}_business`, b.business ?? 'Test Practice Ltd'], [`b${i}_entity`, b.entity], [`b${i}_line1`, `${i + 1} High Street`], [`b${i}_town`, 'Leeds'], [`b${i}_postcode`, 'LS1 4AP']]));
    return { s, errors };
  }

  /** Everything the system computes from one funnel: what the client sees, what is stored, what staff see, what the engine says. */
  function evaluate(s: any) {
    const client = F4.figureF4(s);                         // the reveal "up to £X" (funnel4.ts:368)
    let storedHigh = 0, storedLow: number | null = null, anyStored = false;
    for (const g of F4.byBusiness(s)) {                   // submitEnquiry (funnel4.ts:678) -> submit (assessment.ts:276)
      const gs = F4.stateForBusiness(s, g);
      const gb = F4.buildings(gs);
      if (gb.every((b: any) => b.is_uk_taxpayer === 'no')) continue;
      // Phase 159c: submitEnquiry now blanks a no-tax building's work since too, each event's cost (funnel4.ts).
      const counted = { ...gs, properties: gb.map((b: any) => b.is_uk_taxpayer === 'no' ? { ...b, spend: null, spend_unknown: true,
        events: FUNNEL.eventsOf(b).map((e: any) => ({ ...e, cost: null, cost_unknown: true })) } : b) };
      const fig = FUNNEL.figure(counted);
      if (typeof fig.total === 'number') { storedHigh += Math.round(fig.total * 100); anyStored = true; }
      // Phase 159c (line 8): submit() stores no low end — the client was shown "up to £X" only (assessment.ts).
      void lowOf(fig);
    }
    const staff = SR.formatShownRange({ low_pence: storedLow, high_pence: anyStored ? storedHigh : null });
    let engine: any = null;
    const bs = F4.buildings(s);
    if (bs.length === 1 && typeof bs[0].sector === 'string') {
      const m = FS.sessionFromFunnel(bs[0].sector, s);
      try { const r = E.estimate(bs[0].sector, m.session); engine = { QE: r.QE, TS: r.TS, outcome: r.outcome, flags: r.flags.length, set: m.set }; }
      catch (e) { engine = { threw: String(e) }; }
    }
    return { client, storedHigh: anyStored ? storedHigh : null, storedLow, staff, engine };
  }

  const base: BAns = { sector: 'gp', trigger: 'purchase', spend: '650000', date: '03/2025', tax: 'yes', profit: 'profitable', prior: 'no', seller: 'dont_know', works: 'no', entity: 'ltd' };
  const mk = (o: Partial<BAns>): BAns => {
    const b = { ...base, ...o };
    if (b.trigger !== 'purchase') delete b.seller; else if (b.seller === undefined) b.seller = 'dont_know';
    if (b.tax !== 'yes') delete b.profit;
    return b;
  };
  const one = (o: Partial<BAns>) => { const { s, errors } = funnelState([mk(o)]); return { s, errors, ...evaluate(s) }; };

  /* ================================================================== 4. LOCKWOOD */
  const lockwoodAns = mk({ sector: 'gp', trigger: 'purchase', spend: '650000', date: '03/2025', works: 'yes', works_type: 'full', works_spend: '90000', works_year: '2025', tax: 'yes', profit: 'profitable', prior: 'no', seller: 'dont_know', entity: 'ltd' });
  const L = one(lockwoodAns);
  const Lnow = one({ ...lockwoodAns, works: 'no' });
  const band = CB.CB_BAND.bandFor('gp', 'purchase');
  const lockwood = {
    input: lockwoodAns, errors: L.errors,
    client_high: L.client.high, client_low_not_shown: L.client.low,
    stored_high_pence: L.storedHigh, stored_low_pence: L.storedLow, staff_sees: L.staff,
    engine_QE: L.engine?.QE, engine_TS: L.engine?.TS, engine_outcome: L.engine?.outcome, engine_facts_set: L.engine?.set,
    band, arithmetic: `650,000 x ${band[1]} = ${Math.round(650000 * band[1])}`,
    same_without_works: Lnow.client.high,
    works_fields_on_building: Object.fromEntries(['works', 'works_type', 'works_spend', 'works_year'].map((k) => [k, L.s.properties[0][k]])),
    what_the_works_alone_would_be_at_gp_refurb_band: CB.CB_BAND.rangeFor('gp', 'refurb', 90000),
  };

  /* ================================================================== GRID A1: sector x trigger x spend x date */
  const SPENDS = ['0', '1', '2', '5', '10000', '100000', '250000', '650000', '1000000', '5000000', '10000000', '50000000',
    '-50000', 'NaN', 'Infinity', '1e6', '650k', '1.5m', '£1,250,000', '650 000', '1.000.000', '0.4', '9'.repeat(308)];
  const DATES = ['1990', '03/2008', '04/2008', '2008', '03/2012', '04/2012', '03/2014', '04/2014', '09/2018', '10/2018',
    '03/2023', '04/2023', '2025', '03/2025', '12/2026', '2027', '12/2027', '13/2025', '03/25', '2025-03', null];
  const SPEND_NUM: Record<string, number> = {};
  let a1 = 0;
  const parseAnomalies: Record<string, unknown> = {};
  const dateAccept: Record<string, boolean> = {};
  for (const sector of SECTORS) for (const trigger of F_TRIGGERS) {
    let prevHigh = -1; let prevSpend = -1;
    for (const spend of SPENDS) for (const date of DATES) {
      const r = one({ sector, trigger, spend, date });
      a1++; checks += 6;
      const b0 = r.s.properties[0];
      if (date !== null) dateAccept[date] = !r.errors.some((e: string) => /date as month|roughly when|in the future/i.test(e));
      if (sector === 'gp' && trigger === 'purchase' && date === '03/2025') parseAnomalies[spend.length > 30 ? '9 x308' : spend] = b0.spend;
      const hi = r.client.high, lo = r.client.low;
      // Phase 159b: a building the funnel refers (its own reason, no figure) is withheld on the page, never "up to £0".
      const referred = hi === 0 || r.client.parts.some((p: any) => p.high === null && typeof p.left_out === 'string' && /^No figure for this one yet/.test(p.left_out));
      if (b0.spend !== null && b0.spend !== undefined) SPEND_NUM[spend] = b0.spend;
      // (a)
      if (bad(hi) || bad(lo)) violate('a', 'non-finite/negative figure', { sector, trigger, spend, date }, { hi, lo }, 'finite, >= 0');
      // (c)
      if (typeof b0.spend === 'number' && hi > b0.spend) violate('c', 'ceiling > spend', { sector, trigger, spend }, { spend: b0.spend, hi }, 'ceiling <= spend', b0.spend);
      if (hi < lo) violate('c', 'low > high', { sector, trigger, spend }, { hi, lo }, 'low <= high');
      if (typeof b0.spend === 'number' && b0.spend > 0 && hi === 0 && /£0</.test(String(F4.figureBody(r.s, { available: false, say: '' }, undefined, []))))
        violate('j', 'positive spend rounds to an "up to £0" ceiling that is shown, not withheld', { sector, trigger, spend }, { spend: b0.spend, hi, reveal: String(F4.revealAmount(hi)).match(/<span class="vh">([^<]*)/)?.[1] }, 'no figure, or a minimum, rather than "£0" (shown-range.ts says £0 reads as entitled to nothing)', b0.spend);
      // (j) rounding: exact decimal vs float
      if (typeof b0.spend === 'number' && b0.spend < 1e15) {
        const bnd = CB.CB_BAND.bandFor(sector, trigger);
        // Phase 159b (E2): supported living is sized on its common parts, a quarter.
        const exactHi = Math.round(Number((BigInt(Math.round(b0.spend * 100)) * BigInt(Math.round(bnd[1] * 100))) ) / 10000 * (sector === 'supported_living' ? 0.25 : 1));
        if (!referred && Number.isFinite(exactHi) && b0.spend < 1e15 && Math.abs(exactHi - hi) >= 1) violate('j', 'float rounding differs from exact decimal (half-pound boundary)', { sector, trigger, spend: b0.spend }, { shown: hi, exact: exactHi, float: b0.spend * bnd[1] }, 'Math.round(spend x band) on exact decimals', b0.spend);
      }
      // (h) date does not move the figure
      // (i) client vs stored vs engine
      if (r.storedHigh !== null && hi !== null && Math.round(hi * 100) !== r.storedHigh) violate('i', 'client high != stored high', { sector, trigger, spend }, { hi, stored: r.storedHigh }, 'equal');
      if (r.storedLow !== null && hi > 0 && !r.staff.startsWith('up to')) violate('i', 'stored/staff range has a low end the client was never shown', { sector, trigger, spend: b0.spend }, { client_saw: `up to £${hi.toLocaleString('en-GB')}`, staff_sees: r.staff }, 'staff screen shows what the client saw ("up to £X"), as the portal now does (router.ts:2115)', typeof b0.spend === 'number' ? Math.abs(b0.spend - 650000) : 1e99);
      if (r.engine && !r.engine.threw && typeof b0.spend === 'number' && b0.spend > 0 && !referred) {
        const [eLo, eHi] = r.engine.QE;
        if (Math.abs(eHi - hi) > 1) violate('i', `funnel ceiling != engine QE high (${sector}/${trigger})`, { sector, trigger, spend: b0.spend }, { funnel_high: hi, engine_QE: [Math.round(eLo), Math.round(eHi)], ratio: +(hi / eHi).toFixed(3) }, 'same ceiling from the same facts', Math.abs(b0.spend - 650000));
        // Phase 159c: only a STORED low can sit above the engine's; the funnel's band low is no longer stored or shown.
        if (r.storedLow !== null && lo > eLo + 1) violate('i', `funnel/stored low > engine QE low (${sector}/${trigger})`, { sector, trigger, spend: b0.spend }, { stored_low: lo, engine_QE_lo: Math.round(eLo), engine_flags: r.engine.flags }, 'stored low <= engine low (engine says nil at the bottom)', Math.abs(b0.spend - 650000));
      }
      if (r.engine?.threw) violate('a', 'engine threw', { sector, trigger, spend }, r.engine.threw, 'no throw');
      // (b) monotone in spend (within numeric spends in ascending order is not guaranteed by SPENDS order; check pairwise later)
      void prevHigh; void prevSpend;
    }
  }

  /* (b) monotonicity in spend: a fine sweep */
  for (const sector of SECTORS) for (const trigger of F_TRIGGERS) {
    let prev = -Infinity; let prevSp = 0;
    for (let k = 0; k <= 400; k++) {
      const sp = k < 100 ? k : Math.round(Math.pow(10, 2 + (k - 100) / 300 * 6));
      const r = FUNNEL.figure({ properties: [{ ...FUNNEL.blankProperty(), sector, trigger, spend: sp }] });
      const hi = typeof r.total === 'number' ? r.total : 0; checks++;
      if (hi < prev) violate('b', 'ceiling falls as spend rises', { sector, trigger, from: prevSp, to: sp }, { from: prev, to: hi }, 'non-decreasing');
      prev = hi; prevSp = sp;
    }
  }

  /* ================================================================== GRID A2: the answers, at a fixed spend */
  const TAXES: [string, string | undefined][] = [['yes', 'profitable'], ['yes', 'loss'], ['yes', 'breakeven'], ['yes', 'unsure'], ['no', undefined], ['not sure', undefined]];
  const PRIORS = ['yes', 'no', 'not sure'];
  const SELLERS = ['yes', 'no', 'dont_know'];
  const WORKS: Partial<BAns>[] = [
    { works: 'no' },
    { works: 'yes', works_type: 'full', works_spend: '90000', works_year: '2025' },
    { works: 'yes', works_type: 'cosmetic', works_spend: '90000', works_year: '2025' },
    { works: 'yes', works_type: 'extension', works_spend: '500000', works_year: '2019' },
    { works: 'yes', works_type: 'other', works_spend: null, works_year: null },
    { works: 'yes', works_type: 'full', works_spend: '5000000', works_year: '2007' },
  ];
  const ENTITIES = ['ltd', 'llp', 'partnership', 'sole_trader', 'unsure'];
  let a2 = 0;
  const answerEffect: Record<string, Set<number>> = {};
  const note = (k: string, v: number | null) => { (answerEffect[k] ??= new Set()).add(v ?? -1); };
  for (const sector of SECTORS) for (const trigger of F_TRIGGERS) {
    const ref = one({ sector, trigger });
    const refHi = ref.client.high;
    for (const [tax, profit] of TAXES) for (const prior of PRIORS) for (const seller of (trigger === 'purchase' ? SELLERS : [undefined])) for (const w of WORKS) for (const entity of ENTITIES) {
      const ans: Partial<BAns> = { sector, trigger, tax, profit, prior, seller, entity, ...w };
      const r = one(ans); a2++; checks += 8;
      const hi = r.client.high;
      if (bad(hi) || bad(r.client.low)) violate('a', 'non-finite/negative figure (answers grid)', ans, r.client, 'finite >= 0');
      if (r.errors.length) violate('a', 'screen refused a complete answer set', ans, r.errors, 'no errors');
      note(`${sector}/${trigger}/tax=${tax}/${profit ?? '-'}`, hi);
      note(`${sector}/${trigger}/prior=${prior}`, hi);
      if (seller) note(`${sector}/${trigger}/seller=${seller}`, hi);
      note(`${sector}/${trigger}/works=${w.works}/${w.works_type ?? '-'}/${w.works_spend ?? '-'}`, hi);
      note(`${sector}/${trigger}/entity=${entity}`, hi);
      // (d) kills / reductions
      if (tax === 'no' && hi !== 0) violate('d', 'no UK tax: building still counted', ans, hi, 'left out (0)');
      // Phase 159b (E19): the ceiling is unchanged on purpose; the words now say the relief may come as a loss.
      if (tax === 'yes' && profit === 'loss' && hi === refHi && w.works === 'no' && prior === 'no' && entity === 'ltd' && (seller ?? 'dont_know') === 'dont_know'
        && !r.client.assumptions.some((a: string) => /It makes a loss/.test(a)))
        violate('d', 'loss-making: ceiling unchanged (QE is not reduced by a loss; the timing of relief is) - QUESTION only', ans, hi, 'OUR READING: QE unchanged is right; but the client is not told relief may only come as a loss carried forward/back', 650000);
      if (prior === 'yes' && hi === refHi && w.works === 'no' && tax === 'yes' && profit === 'profitable' && entity === 'ltd' && (seller ?? 'dont_know') === 'dont_know')
        violate('d', '"already claimed on these fixtures: yes" leaves the ceiling untouched', ans, { hi, same_as_no: refHi }, 'OUR READING — tax adviser to confirm: the client\'s own earlier fixtures claim means no second claim on the same pound (CB_FRONTDOOR says so itself); the figure should be withheld or nil on the fixtures element', 650000);
      if (trigger === 'purchase' && seller === 'yes' && hi === refHi && w.works === 'no' && prior === 'no' && tax === 'yes' && profit === 'profitable' && entity === 'ltd')
        violate('d', 'seller claimed (pooled) and no s.198 election/date captured: ceiling unchanged', ans, { hi }, 'OUR READING — tax adviser to confirm: s.187A fixed-value requirement; without an election (or tribunal) inside 2 years of a post-April-2014 purchase the fixtures are nil, and with one they are capped at the elected value (often £1-£2). Purchase is 03/2025, so the 2-year window is open: a ceiling is defensible, but the low end cannot be the band low', 650000);
      if (trigger === 'purchase' && seller === 'no' && hi === refHi && w.works === 'no' && prior === 'no' && tax === 'yes' && profit === 'profitable' && entity === 'ltd')
        violate('d', 'post-2014 purchase, seller did not claim (did not pool): ceiling and stored low unchanged', ans, { hi, stored_low_pence: r.storedLow, engine_QE: r.engine?.QE }, 'OUR READING — tax adviser to confirm: if the seller was able to claim and never pooled, s.187A(4) makes the fixtures nil (the engine itself says so, CB_S187A.poolingAssess). A ceiling can stand (seller may have been non-entitled), the low cannot be 50% of the ceiling', 650000);
      if (w.works === 'yes' && w.works_type === 'cosmetic' && w.works_spend === '90000') {
        const plain = one({ ...ans, works: 'no' }).client.high;
        if (hi !== plain) violate('d', 'cosmetic works changed the figure', ans, { hi, plain }, 'cosmetic (repair) adds nothing');
      }
      // (e)/(f) works should raise, and must at least change
      // Phase 159c: works known to be before April 2008 are an adviser's to size (Phase 159b's E12 rule), so they add nothing
      // here on purpose; and a building whose own answers withhold its figure (the client's own claim) keeps it withheld.
      if (w.works === 'yes' && w.works_type !== 'cosmetic' && typeof w.works_spend === 'string' && !(typeof w.works_year === 'string' && w.works_year < '2008') && prior !== 'yes') {
        const plain = one({ ...ans, works: 'no' }).client.high;
        if (hi <= plain && tax !== 'no')
          violate('f', `works answer ignored (${w.works_type}, £${w.works_spend}, ${w.works_year})`, ans, { with_works: hi, without: plain }, 'OUR READING — tax adviser to confirm: capital works after acquisition are the owner\'s own qualifying spend (separate from s.187A) and should raise the ceiling, e.g. by the refurb band', Number(w.works_spend));
      }
      // engine: works / seller / dates never reach the session
      if (r.engine && !r.engine.threw && w.works === 'yes' && r.engine.set.some((k: string) => /works|renovation/.test(k)))
        violate('f', 'engine session carries works', ans, r.engine.set, '-');
    }
  }

  /* (e) structural: new build vs purchase, per sector */
  const bands: Record<string, Record<string, [number, number]>> = CB.CB_BAND.BANDS;
  for (const sec of SECTORS) {
    const p = bands[sec]!['purchase']!, n = bands[sec]!['new_build']!;
    checks++;
    if (n[1] < p[1]) violate('e', `${sec}: new-build ceiling ${n[1] * 100}% is not above the purchase ceiling ${p[1] * 100}%`, { sector: sec }, { purchase: p, new_build: n }, 'OUR READING: build cost excludes land and includes all M&E, so a new build should yield at least as high a share as a purchase price (which includes land and the structure)', 0);
  }

  /* ================================================================== GRID A3: multiple buildings (1-5, mixed) */
  let seed = 20261009;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  let a3 = 0;
  for (let n = 0; n < 3000; n++) {
    const k = 1 + Math.floor(rnd() * 5);
    const bsAns: BAns[] = [];
    for (let i = 0; i < k; i++) {
      const [tax, profit] = pick(TAXES);
      bsAns.push(mk({ sector: pick(SECTORS), trigger: pick(F_TRIGGERS), spend: pick(['10000', '250000', '650000', '1000000', '5000000', '50000000']), date: pick(DATES.filter((d) => d !== '13/2025' && d !== '03/25' && d !== '2025-03')),
        tax, profit, prior: pick(PRIORS), seller: pick(SELLERS), entity: pick(ENTITIES), business: pick(['Alpha Ltd', 'Beta LLP', 'Gamma Ltd']), ...pick(WORKS) }));
    }
    const full = funnelState(bsAns); const ev = evaluate(full.s); a3++; checks += 4;
    if (bad(ev.client.high)) violate('a', 'multi-building non-finite', bsAns, ev.client.high, 'finite');
    // prefix monotonicity: adding a building never lowers the total
    let prev = 0;
    for (let j = 1; j <= k; j++) {
      const sub = evaluate(funnelState(bsAns.slice(0, j)).s).client.high;
      if (sub < prev) violate('b', 'adding a building lowered the total', bsAns.slice(0, j), { before: prev, after: sub }, 'non-decreasing', j);
      prev = sub;
    }
    // client total == sum of per-business stored totals
    if (ev.storedHigh !== null && Math.round(ev.client.high * 100) !== ev.storedHigh)
      violate('i', 'client total != sum of stored per-business totals', bsAns, { client: ev.client.high, stored_pence: ev.storedHigh }, 'equal', k);
    // the "sum of ceilings" headline for > 1 property
    const live = ev.client.parts.filter((p: any) => p.high !== null).length;
    if (live > 1 && !ev.client.assumptions.some((a: string) => /adds the top of each/.test(a))) violate('i', 'multi-building headline sums ceilings without the caveat', { buildings: k }, ev.client.high, 'caveat shown', k);
  }
  /* the infinity case, deliberately */
  {
    const huge = '9'.repeat(308);
    const bsAns = Array.from({ length: 10 }, () => mk({ sector: 'private_hospital', trigger: 'refurb', spend: huge }));
    const ev = evaluate(funnelState(bsAns).s);
    checks++;
    if (!Number.isFinite(ev.client.high)) violate('a', 'ten buildings at the largest accepted spend sum to Infinity', { buildings: 10, sector: 'private_hospital', trigger: 'refurb', spend: '9 repeated 308 times (accepted by num())' }, { high: ev.client.high, reveal: String(F4.revealAmount(ev.client.high)).match(/<span class="vh">([^<]*)/)?.[1], stored_high_pence: ev.storedHigh }, 'an upper bound on spend; never "£∞"');
    const one1 = evaluate(funnelState([mk({ sector: 'gp', trigger: 'purchase', spend: '50000000000' })]).s);
    if (one1.client.high > 0) violate('a', 'no upper bound or sanity check on spend (a £50bn GP surgery is sized)', { sector: 'gp', trigger: 'purchase', spend: '50000000000' }, { high: one1.client.high }, 'RISK: a plausibility cap or referral above some spend');
  }

  /* ================================================================== GRID B: the engine itself */
  const ENG_TRIGGERS: string[][] = [[], ['purchase'], ['new_build'], ['refurb'], ['fitout'], ['extension'], ['conversion'], ['equipment'], ['purchase', 'refurb'], ['purchase', 'new_build']];
  const BASES: unknown[] = [0, 1, 10000, 100000, 650000, 1000000, 10000000, 50000000, -1000, NaN, Infinity, undefined, '650000'];
  type Facts = Record<string, unknown>;
  const FACTS: [string, Facts][] = [
    ['none', {}],
    ['taxpayer_no', { is_taxpayer: 'no', is_uk_taxpayer: 'no' }],
    ['charity', { charity: true, is_taxpayer: 'no' }],
    ['prior_claim_self', { prior_claim_self: true }],
    ['company_profit_yes', { claimant_type: 'company', sufficient_profit: 'yes' }],
    ['company_profit_no', { claimant_type: 'company', sufficient_profit: 'no' }],
    ['sole_trader', { claimant_type: 'sole_trader' }],
    ['seller_claimed_entitled', { prior_owner_claimed: 'yes', prior_owner_entitled: 'yes' }],
    ['seller_claimed_no_election_2015', { prior_owner_claimed: 'yes', prior_owner_entitled: 'yes', election_document: 'no', election: 'no', acquisition_date: '2015-06-01', past_owner_cessation_date: '2015-06-01', fvr_window_closed: 'yes' }],
    ['seller_claimed_no_election_2025', { prior_owner_claimed: 'yes', prior_owner_entitled: 'yes', election_document: 'no', election: 'no', acquisition_date: '2025-03-01', past_owner_cessation_date: '2025-03-01' }],
    ['seller_claimed_election_£1_2020', { prior_owner_claimed: 'yes', prior_owner_entitled: 'yes', election_document: 'held', election: 'known', election_value: 1, election_content: ['amount', 'plant', 'land', 'interest', 'utrs', 'both'], election_quantified: true, election_joint: true, acquisition_date: '2020-06-01', election_notified_date: '2020-07-01', past_owner_cessation_date: '2020-06-01' }],
    ['seller_never_claimed_entitled_2016', { prior_owner_claimed: 'no', prior_owner_entitled: 'yes', past_owner_cessation_date: '2016-01-01', acquisition_date: '2016-01-01' }],
    ['seller_never_claimed_entitled_2013', { prior_owner_claimed: 'no', prior_owner_entitled: 'yes', past_owner_cessation_date: '2013-01-01', acquisition_date: '2013-01-01' }],
    ['seller_never_claimed_entitled_2011', { prior_owner_claimed: 'no', prior_owner_entitled: 'yes', past_owner_cessation_date: '2011-01-01', acquisition_date: '2011-01-01' }],
    ['seller_not_entitled_nhs', { prior_owner_claimed: 'no', prior_owner_entitled: 'no', earlier_entitled_owner: 'no' }],
    ['seller_unknown', { prior_owner_claimed: 'unsure' }],
    ['seller_pre_2008', { seller_pre_2008: true, prior_owner_entitled: 'no', earlier_entitled_owner: 'no' }],
    ['seller_pre_2008_unknown', { seller_pre_2008: true }],
    ['mixed_dwelling_40pc', { dwelling_setting: 'mixed', residential_fraction: 0.4 }],
    ['grant_30pc', { grant_fraction: 0.3, grant_quantification: 'global' }],
    ['grant_100pc', { grant_fraction: 1 }],
    ['grant_150pc_raw', { grant_fraction: 1.5 }],
    ['grant_neg_raw', { grant_fraction: -0.5 }],
    ['landlord_contrib_50', { landlord_contrib_fraction: 0.5 }],
    ['sl_specialised_yes', { specialised_supported_housing: 'yes' }],
    ['acuity_high', { acuity: 'high' }],
    ['acuity_low', { acuity: 'low' }],
    ['return_in_time', { return_in_time: true, claimant_type: 'company' }],
    ['period_end_2020', { accounting_period_end: '2020-03-31', claimant_type: 'company' }],
    ['period_end_uk_format', { accounting_period_end: '31/03/2025', claimant_type: 'company' }],
  ];
  let b1 = 0;
  const engYield: Record<string, unknown> = {};
  const runEng = (sector: string, trig: string[], baseAmt: unknown, facts: Facts) => {
    const s: any = { ...E.newSession(sector), trigger: [...trig], ...facts };
    if (baseAmt !== undefined) s.base_amount = baseAmt;
    return E.estimate(sector, s);
  };
  for (const sector of SECTORS) for (const trig of ENG_TRIGGERS) for (const [fname, facts] of FACTS) {
    let prevHi = -Infinity, prevB = 0;
    const ref = (() => { try { return runEng(sector, trig, 1000000, {}); } catch { return null; } })();
    for (const bAmt of BASES) {
      b1++; checks += 8;
      const inp = { sector, trigger: trig, base_amount: bAmt, facts: fname };
      let r: any;
      try { r = runEng(sector, trig, bAmt, facts); }
      catch (e) { violate('a', 'engine threw', inp, String(e), 'no throw'); continue; }
      const [qLo, qHi] = r.QE, [tLo, tHi] = r.TS;
      const numeric = typeof bAmt === 'number' && Number.isFinite(bAmt) && bAmt > 0;
      if ([qLo, qHi, tLo, tHi].some((x) => typeof x !== 'number' || Number.isNaN(x))) violate('a', `engine NaN (base_amount ${String(bAmt)})`, { ...inp, base_amount: String(bAmt) }, { QE: r.QE.map(String), TS: r.TS.map(String) }, 'numbers', 0);
      else if ([qLo, qHi, tLo, tHi].some((x) => !Number.isFinite(x))) violate('a', `engine Infinity (base_amount ${String(bAmt)})`, { ...inp, base_amount: String(bAmt) }, { QE: r.QE.map(String), TS: r.TS.map(String) }, 'finite or refused', 0);
      else if ([qLo, qHi, tLo, tHi].some((x) => x < 0)) violate('a', (typeof bAmt === 'number' && bAmt < 0) ? 'engine negative (negative base_amount accepted)' : `engine negative (${fname})`, inp, { QE: r.QE, TS: r.TS }, '>= 0', typeof bAmt === 'number' ? Math.abs(bAmt) : 0);
      // Phase 159b: refused is right — the amount is treated as not given, and the engine says so in its assumptions.
      if (typeof bAmt === 'string' && !(r.QE[1] === 0 && (r.assumptions ?? []).some((a: string) => /not a usable amount/.test(a)))) violate('a', 'engine accepts a numeric STRING base_amount and computes on it', inp, { QE: r.QE }, 'refuse or coerce explicitly');
      if (qLo > qHi + 1e-6 && !(typeof bAmt === 'number' && bAmt < 0) && !fname.includes('grant_')) violate('c', 'engine QE low > high', inp, r.QE, 'low <= high');
      if (tLo > tHi + 1e-6 && !(typeof bAmt === 'number' && bAmt < 0) && !fname.includes('grant_')) violate('c', 'engine TS low > high', inp, r.TS, 'low <= high');
      if (numeric && qHi > (bAmt as number) + 1e-6) violate('c', `engine QE ceiling > spend (${fname})`, inp, { base: bAmt, QE_hi: Math.round(qHi), pct: +(qHi / (bAmt as number) * 100).toFixed(1) }, 'QE <= cost', bAmt as number);
      if (Number.isFinite(qHi) && qHi >= 0 && tHi > qHi + 1e-6) violate('c', 'engine TS > QE', inp, { QE: r.QE, TS: r.TS }, 'TS <= QE');
      if (numeric) {
        if (qHi < prevHi - 1e-6) violate('b', `engine QE falls as base rises (${fname})`, inp, { from: [prevB, prevHi], to: [bAmt, qHi] }, 'non-decreasing');
        prevHi = qHi; prevB = bAmt as number;
      }
      if (bAmt === 1000000 && fname === 'none') engYield[`${sector}/${trig.join('+') || '(none)'}`] = { QE_pct: [+(qLo / 1e4).toFixed(2), +(qHi / 1e4).toFixed(2)], TS: [Math.round(tLo), Math.round(tHi)], outcome: r.outcome };
      // (d) kills, engine level
      if (bAmt === 1000000 && ref) {
        if (fname === 'taxpayer_no' && tHi > 0) violate('d', 'engine: non-taxpayer still gets a tax saving', { sector, trigger: trig, base_amount: 1000000, is_taxpayer: 'no' }, { TS: r.TS.map(Math.round), outcome: r.outcome, cashGates: r.cashGates }, 'TS 0 / referral. The kill lives only in the Q-flow `gate` (sector-*.js G2 gate), not in runEngine; any caller of estimate() that skips the flow (engaged.ts:805, allowance-profit-comparison.ts:210) gets a full saving', 0);
        if (fname === 'charity' && tHi > 0) violate('d', 'engine: charity still gets a tax saving', { sector, trigger: trig, charity: true }, { TS: r.TS.map(Math.round), outcome: r.outcome }, 'TS 0', 0);
        if (fname === 'prior_claim_self' && qHi > 0) violate('d', 'engine: own prior fixtures claim leaves QE intact', { sector, trigger: trig, prior_claim_self: true }, { QE: r.QE.map(Math.round), outcome: r.outcome, flags: r.flags.length }, 'QE nil on the fixtures element (or referral). Only the Q-flow gate stops it', 0);
        if (trig.includes('purchase') && fname === 'seller_claimed_no_election_2015' && qHi > 0) violate('d', 'engine: seller pooled, no election, window closed (2015 purchase) - QE not nil', { sector, trigger: trig, ...facts }, { QE: r.QE.map(Math.round), outcome: r.outcome }, 'OUR READING — tax adviser to confirm: s.187A(3)/(5)-(7) nil (unless a tribunal application or s.187A(6)(b) statements route)', 0);
        if (trig.includes('purchase') && fname === 'seller_never_claimed_entitled_2016' && qHi > 0) violate('d', 'engine: entitled seller never pooled, sale after April 2014 - QE not nil', { sector, trigger: trig, ...facts }, { QE: r.QE.map(Math.round) }, 'nil (s.187A(4))', 0);
        if (trig.includes('purchase') && fname === 'seller_never_claimed_entitled_2013' && qHi === 0) violate('h', 'engine: seller ceased 2013 (inside para 13(2) transitional) treated as nil', { sector, trigger: trig, ...facts }, { QE: r.QE }, 'pooling requirement not in force; claim available', 0);
        if (sector === 'supported_living' && fname === 'none' && qHi / 1e6 > 0.0625 + 1e-9) violate('d', 'SL engine above common-parts x band', { trig }, qHi, '<= 6.25%');
        if (fname === 'grant_150pc_raw' && (qLo < 0 || qHi < 0)) violate('a', 'engine: a grant fraction above 100% (not clamped at the engine boundary) produces a NEGATIVE qualifying expenditure', { sector, trigger: trig, base_amount: 1000000, grant_fraction: 1.5 }, { QE: r.QE.map(Math.round), TS: r.TS.map(Math.round) }, 'clamp to [0,1] in runEngine (only the Q onSet clamps; a back-end caller is not clamped)', 0);
        if (fname === 'grant_neg_raw' && qHi > ref.QE[1] + 1) violate('c', 'engine: a negative grant fraction INCREASES qualifying expenditure above the no-grant figure', { sector, trigger: trig, base_amount: 1000000, grant_fraction: -0.5 }, { QE: r.QE.map(Math.round), no_grant: ref.QE.map(Math.round) }, 'clamp to [0,1]', 0);
      }
    }
  }
  /* empty trigger default per sector, versus the type's documented "empty is read as a purchase" */
  const emptyDefault: Record<string, unknown> = {};
  for (const sector of SECTORS) {
    const e = runEng(sector, [], 1000000, {}); const p = runEng(sector, ['purchase'], 1000000, {});
    emptyDefault[sector] = { empty_QE_hi_pct: +(e.QE[1] / 1e4).toFixed(2), purchase_QE_hi_pct: +(p.QE[1] / 1e4).toFixed(2) };
    checks++;
    if (Math.abs(e.QE[1] - p.QE[1]) > 1) violate('a', `engine: an empty trigger is NOT read as a purchase (${sector})`, { sector, trigger: [], base_amount: 1000000 }, emptyDefault[sector], 'types.ts:93 "empty is read as a purchase"; sectors disagree with each other (care_homes purchase, dental fitout, gp/private_hospital refurb)', 0);
  }
  /* multi-trigger: whole base at the highest band */
  for (const sector of SECTORS) {
    const p = runEng(sector, ['purchase'], 1000000, {}), pr = runEng(sector, ['purchase', 'refurb'], 1000000, {});
    checks++;
    if (pr.QE[1] > p.QE[1] * 1.2) violate('c', `engine: purchase+refurb ticked applies the refurb band to the whole purchase price (${sector})`, { sector, trigger: ['purchase', 'refurb'], base_amount: 1000000 }, { purchase_only_QE_hi: Math.round(p.QE[1]), purchase_plus_refurb_QE_hi: Math.round(pr.QE[1]) }, 'apportion: purchase band on the price, refurb band on the works only. The engine says so in its own assumption ("the full engine apportions each") but the number is the inflated one', 0);
  }

  /* ================================================================== dates: boundaries in the engine's own clocks */
  const S187A = CB.CB_S187A; const ELECTION = CB.CB_ELECTION;
  const dateRows: unknown[] = [];
  for (const [ct, cess] of [['company', '2014-03-31'], ['company', '2014-04-01'], ['company', '2014-04-02'], ['individual', '2014-04-06'], ['individual', '2014-04-07'], ['company', '01/04/2014'], ['company', '04/2014'], ['company', '2014']]) {
    const s = { claimant_type: ct, past_owner_cessation_date: cess };
    dateRows.push({ claimant: ct, cessation: cess, parsed: (() => { const d = new Date(cess as string); return isNaN(d.getTime()) ? 'Invalid' : d.toISOString().slice(0, 10); })(), pooling_in_force: S187A.poolingRequirementInForce(s) });
  }
  const electionRows: unknown[] = [];
  for (const [acq, notified] of [['2024-06-01', '2026-05-31'], ['2024-06-01', '2026-06-01'], ['2023-06-01', '2025-05-31'], ['2023-06-01', '2025-06-01'], ['2022-03-01', '2024-02-29'], ['2022-03-01', '2024-03-01']]) {
    const r = ELECTION.notifiedInTime({ acquisition_date: acq, election_notified_date: notified });
    electionRows.push({ acquisition: acq, notified, in_time: r });
  }
  // s.201(1): "within the period of two years beginning with the date of the acquisition" -> last day = acq + 2y - 1 day (OUR READING)
  for (const row of electionRows as any[]) {
    const acq = new Date(row.acquisition + 'T00:00:00Z');
    // Phase 159d: the code here used the anniversary, against this harness's own comment above and the phase prompt
    // ("2 years beginning with the date ends the day before the anniversary"). It now reads as the comment says.
    const last = new Date(Date.UTC(acq.getUTCFullYear() + 2, acq.getUTCMonth(), acq.getUTCDate()) - 86400000);
    const expected = new Date(row.notified + 'T00:00:00Z') <= last;
    row.expected_our_reading = expected;
    checks++;
    if (row.in_time !== expected) violate('h', 'election 2-year clock is 730.5 days, so the anniversary is in time or late depending on whether 29 Feb falls inside', { acquisition_date: row.acquisition, election_notified_date: row.notified }, { in_time: row.in_time }, `OUR READING — tax adviser to confirm: last day is ${last.toISOString().slice(0, 10)} -> ${expected}`, 0);
  }
  for (const row of dateRows as any[]) {
    checks++;
    // Phase 159b: the engine now refuses a non-ISO date (not known), so the pooling requirement stays in force: the US
    // reading only mattered because it switched the requirement OFF. Its own 'parsed' column is JavaScript's, not the engine's.
    if (row.cessation === '01/04/2014' && row.pooling_in_force === false) violate('h', 'engine parseDate reads a UK dd/mm/yyyy date as US mm/dd/yyyy', { past_owner_cessation_date: '01/04/2014' }, { parsed: row.parsed, pooling_in_force: row.pooling_in_force }, '1 April 2014 (or refuse)', 0);
    if (row.cessation === '2014' && row.pooling_in_force === false) violate('h', 'engine parseDate reads a bare year "2014" as 1 Jan 2014 - a RELIEVING reading (pooling requirement switched off) of a date that could be any day in 2014', { claimant_type: 'company', past_owner_cessation_date: '2014' }, { parsed: row.parsed, pooling_in_force: false }, 'refuse a bare year, or treat as unknown (N4)', 0);
    // Phase 159b: the funnel's month is read by the funnel itself (CB_FUNNEL.monthRange), never by the engine's parseDate.
    if (row.cessation === '04/2014' && row.parsed === 'Invalid' && JSON.stringify(CB.CB_FUNNEL.monthRange?.('04/2014')) !== JSON.stringify(['2014-04', '2014-04'])) violate('h', 'engine parseDate cannot read the funnel\'s own MM/YYYY format (treated as unknown)', { past_owner_cessation_date: '04/2014' }, { parsed: row.parsed, pooling_in_force: row.pooling_in_force }, 'a month, or refuse loudly; today it silently becomes "unknown" - safe (N4) but the funnel date can never be used', 0);
  }
  const windowRows: unknown[] = [];
  for (const pe of ['2023-03-31', '31/03/2025', '03/2025', '2025']) {
    const w = CB.CB_CASH.deriveAmendmentWindow({ accounting_period_end: pe, claimant_type: 'company' }, new Date('2026-10-09'));
    windowRows.push({ period_end: pe, known: w.known, deadline: w.deadline instanceof Date ? w.deadline.toISOString().slice(0, 10) : null, in_time: w.inTime });
  }
  for (const w of windowRows as any[]) if (w.period_end === '31/03/2025' && w.known) violate('h', 'amendment window derived from a UK-format period end', w, w, 'refuse non-ISO'); else if (w.period_end === '31/03/2025') { /* invalid -> unknown: fine */ }
  { const w: any = windowRows.find((x: any) => x.period_end === '2025'); if (w?.known) violate('h', 'a bare year "2025" is accepted as a period end of 1 Jan 2025 by the amendment-window clock', { accounting_period_end: '2025', claimant_type: 'company' }, w, 'refuse a bare year (it is not a period end)', 0); }

  /* funnel date: every date answer gives the same figure (dates ignored) */
  const dateEffect: Record<string, number> = {};
  for (const d of ['1990', '03/2008', '04/2008', '03/2012', '04/2014', '09/2018', '10/2018', '03/2023', '04/2023', '03/2025', '12/2027', null]) dateEffect[String(d)] = one({ sector: 'gp', trigger: 'purchase', date: d }).client.high;
  checks++;
  if (new Set(Object.values(dateEffect)).size === 1) violate('h', 'funnel: the date answer never moves the figure (pre-2008 integral features, 2012/2014 fixtures rules, Oct 2018 SBA, Apr 2023 full expensing, future dates all identical)', { sector: 'gp', trigger: 'purchase', spend: 650000 }, dateEffect, 'OUR READING — tax adviser to confirm: at least a future completion date, and a purchase whose seller held since before April 2008, should be treated differently; a pre-2014 purchase is outside the pooling requirement', 0);
  if (dateAccept['12/2027'] || dateAccept['2027']) violate('h', 'funnel accepts a FUTURE purchase/build date (12/2027) without a word', { date: '12/2027' }, { accepted: true }, 'refuse or route to a "planned project" path', 0);

  /* ================================================================== (g) yield table */
  const yields: Record<string, Record<string, unknown>> = {};
  for (const sec of SECTORS) {
    yields[sec] = {};
    for (const t of F_TRIGGERS) {
      const f = CB.CB_BAND.rangeFor(sec, t, 1000000);
      const s: any = { ...E.newSession(sec), trigger: [FS ? ({ purchase: 'purchase', new_build: 'new_build', refurb: 'refurb', fit_out: 'fitout' } as any)[t] : t], base_amount: 1000000 };
      const r = E.estimate(sec, s);
      yields[sec]![t] = { funnel_pct: [f.low / 1e4, f.high / 1e4], engine_pct_no_facts: [+(r.QE[0] / 1e4).toFixed(2), +(r.QE[1] / 1e4).toFixed(2)] };
    }
  }

  /* ================================================================== the answers that never move the figure */
  const deadAnswers: Record<string, string[]> = {};
  const groups = new Map<string, Set<number>>();
  for (const [k, set] of Object.entries(answerEffect)) {
    const [sec, trig, ans] = k.split('/');
    const q = ans!.split('=')[0]!;
    const key = `${sec}/${trig}/${q}`;
    const g = groups.get(key) ?? new Set<number>();
    for (const v of set) g.add(v); groups.set(key, g);
  }
  // for each (sector,trigger,question) - did varying THIS answer alone ever change the figure? Use one-factor checks:
  const oneFactor: Record<string, Record<string, number>> = {};
  for (const sector of SECTORS) for (const trigger of F_TRIGGERS) {
    const row: Record<string, number> = {};
    for (const [tax, profit] of TAXES) row[`tax=${tax}/${profit ?? '-'}`] = one({ sector, trigger, tax, profit }).client.high;
    for (const prior of PRIORS) row[`prior=${prior}`] = one({ sector, trigger, prior }).client.high;
    if (trigger === 'purchase') for (const seller of SELLERS) row[`seller=${seller}`] = one({ sector, trigger, seller }).client.high;
    for (const w of WORKS) row[`works=${w.works}/${w.works_type ?? '-'}/${w.works_spend ?? '-'}/${w.works_year ?? '-'}`] = one({ sector, trigger, ...w }).client.high;
    for (const entity of ENTITIES) row[`entity=${entity}`] = one({ sector, trigger, entity }).client.high;
    oneFactor[`${sector}/${trigger}`] = row;
    const movers = new Set(Object.entries(row).filter(([k]) => !k.startsWith('tax=no')).map(([, v]) => v));
    if (movers.size === 1) (deadAnswers[`${sector}/${trigger}`] = ['profit', 'prior claim', 'seller claim', 'works (type, spend, year)', 'entity', 'date']);
  }

  /* ================================================================== the num() parser */
  const parse = Object.fromEntries(['£650,000', '650k', '1.5m', '-50000', '1e6', '650 000', '1.000.000', '0.4', '0', '£ 1,250,000.75', '1,5', '12.5.6'].map((t) => {
    const { s } = funnelState([mk({ spend: t })]);
    return [t, s.properties[0].spend];
  }));
  for (const [typed, got] of Object.entries(parse)) {
    const surprising: Record<string, number | null> = { '650k': 650000, '1.5m': 1500000, '-50000': null, '1e6': 1000000, '1.000.000': 1000000, '1,5': null };
    // Phase 159b: "or an error asking again" — refused (null, with a reason on the page) is the other right answer.
    if (typed in surprising && got !== surprising[typed] && !(got === null && F4.parseMoney?.(typed)?.why)) violate('j', `spend parser: "${typed}" is read as ${JSON.stringify(got)}`, { b0_spend: typed }, got, `${JSON.stringify(surprising[typed])} or an error asking again (funnel4.ts:143 num() strips every character but digits and ".")`, 0);
  }

  let n = 0;
  const violations = [...book.values()].sort((a, b) => a.prop.localeCompare(b.prop) || b.count - a.count).map((v) => ({ ...v, id: `X${String(++n)}` }));
  void SPEND_NUM; void parseAnomalies; void groups; void oneFactor; void deadAnswers; void yields; void engYield; void emptyDefault; void dateEffect;
  return { runs: { gridA1: a1, gridA2: a2, gridA3_multi: a3, gridB_engine: b1 }, checks, violations, lockwood };
}
