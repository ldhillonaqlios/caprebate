/**
 * THE SURVEY PACK'S SUMS — how the price paid becomes the spend that qualifies. 1 October 2026.
 *
 * Lakhbir: "build the comprehensive report, as best we can and then we engage with a surveyor … each section allowing
 * the surveyor to edit if needed and the numbers matching what they put in, change or take out" — and, of these sums,
 * "this is one thing that cannot fail".
 *
 * THE METHOD IS SECTION 562 OF THE CAPITAL ALLOWANCES ACT 2001, BY REBUILD COST. The price paid, less the bare land, is
 * the price of the building. The building's rebuild cost today is its floor area times a whole-building rate (BCIS).
 * Each element that may qualify — the electrics, a lift, the clinical basins — has its own rebuild cost (how much times
 * a rate) and the share of it that qualifies. The price of the building is then shared out in the same proportion as
 * the rebuild cost: what qualifies = the building's price × the qualifying rebuild cost ÷ the whole rebuild cost. The
 * main pool and the special rate pool are shared out the same way.
 *
 * THIS FILE ONLY ADDS UP. No database, no clock, no page: given the inputs, the same answer every time, so it can be
 * tested on tens of thousands of made-up packs (test/pack-sums.test.ts). The rules it keeps, each tested:
 *
 *   · EVERY AMOUNT IS WHOLE PENCE, worked in BigInt, so nothing is lost to floating point and nothing overflows. Each
 *     rounding is to the nearest penny, a half penny up — and there are exactly four of them (a line's rebuild cost,
 *     its qualifying part, the whole rebuild cost, and the two shares), each named where it happens.
 *   · THE POOLS ADD UP EXACTLY. The main pool is rounded; the special rate pool is what qualifies less the main pool.
 *     So main + special = what qualifies, to the penny, always.
 *   · NOTHING IS GUESSED (N4). One value missing anywhere — a count, a rate, a percentage, a pool, the price, the land,
 *     the floor area, the building rate — and there is NO total: `qualifying_pence` is null and `needed` names every
 *     gap. A partial total would read as an answer.
 *   · A PROBLEM STOPS THE TOTAL TOO: the land at or above the price; elements that cost more than the whole building;
 *     a whole building that costs nothing. Each is named in words.
 *   · A LINE TAKEN OUT counts for nothing, and a line counted as 0 is the same as taking it out.
 */

/** Where a value came from. EVIDENCE: a register, a document, the client. DRAFT: Cap Rebate's. SURVEYOR: theirs. */
export type SourceKind = 'EVIDENCE' | 'DRAFT' | 'SURVEYOR';

export type Source = {
  readonly kind: SourceKind;
  /** In words: "Energy certificate", "Fixture list LS-SR-001", "Surveying User". */
  readonly text: string;
  /** For a surveyor's value: who, when and why. */
  readonly by_name?: string | null;
  readonly at?: string | null;
  readonly reason?: string | null;
};

export type Valued = { readonly value: number | null; readonly source: Source | null };

export type Pool = 'MP' | 'SR';

export type PackLine = {
  readonly id: string;
  readonly label: string;
  /** The fixture list's id (Caprebate-Fixture-Taxonomy-v1.csv), or null for a line a surveyor added. */
  readonly element_id: string | null;
  readonly unit: string;
  /** Main pool or special rate pool; null until somebody decides. */
  readonly pool: Pool | null;
  readonly pool_source: Source | null;
  /** How much, in thousandths of the unit (12.5 m² is 12500), so a count or an area is a whole number. */
  readonly qty_milli: Valued;
  /** Pence per one unit. */
  readonly rate_pence: Valued;
  /** The share that qualifies, in hundredths of a per cent: 100% is 10000. */
  readonly qpct_bp: Valued;
  readonly removed: boolean;
  readonly removed_source: Source | null;
};

export type PackInputs = {
  /** The price paid for the property, in pence. */
  readonly price_paid_pence: Valued;
  /** The bare land within that price, in pence. */
  readonly land_pence: Valued;
  /** The building's floor area, in thousandths of a square metre. */
  readonly gia_milli_m2: Valued;
  /** The whole-building rebuild rate, pence per square metre. */
  readonly building_rate_pence: Valued;
};

export type Needed = { readonly where: 'INPUT' | 'LINE'; readonly key: string; readonly line_id: string | null; readonly words: string };

export type ProblemCode = 'LAND_NOT_BELOW_PRICE' | 'ELEMENTS_EXCEED_BUILDING' | 'NO_REBUILD_COST' | 'TOO_LARGE';
export type Problem = { readonly code: ProblemCode; readonly words: string };

export type LineSum = {
  readonly line_id: string;
  /** Null while a value is missing, or for a line taken out. */
  readonly cost_pence: number | null;
  readonly qualifying_pence: number | null;
  readonly counted: boolean;
};

export type PackSums = {
  readonly lines: readonly LineSum[];
  /** The whole building's rebuild cost; null until the floor area and the rate are both known. */
  readonly rebuild_pence: number | null;
  /** Sum of the counted lines' rebuild costs and qualifying parts, for the lines that are complete (null: TOO_LARGE). */
  readonly elements_cost_pence: number | null;
  readonly elements_qualifying_pence: number | null;
  /** The price of the building: price less land; null until both are known and the land is below the price. */
  readonly building_price_pence: number | null;
  /** The answer. Null unless every value is known and there is no problem. */
  readonly qualifying_pence: number | null;
  readonly main_pool_pence: number | null;
  readonly special_pool_pence: number | null;
  /** What qualifies as a share of the building's price, in hundredths of a per cent. */
  readonly share_bp: number | null;
  readonly needed: readonly Needed[];
  readonly problems: readonly Problem[];
  readonly complete: boolean;
};

/**
 * The largest value any one input may hold: £1bn, a million units (or square metres), £1m a unit, 100%. Above it, a
 * value is refused where it is typed AND read here as missing. Chosen so the whole building's rebuild cost stays below
 * 2^53 pence (a million m² × £1m = 10^14 pence); a sum of lines that still passes 2^53 is refused as TOO_LARGE, never
 * rounded by the computer.
 */
export const LIMITS = Object.freeze({
  money_pence: 100_000_000_000,
  qty_milli: 1_000_000_000,
  rate_pence: 100_000_000,
  qpct_bp: 10_000,
  gia_milli_m2: 1_000_000_000,
});

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
/** A BigInt as a number of pence, or null where it would not be held exactly. */
function exact(v: bigint): number | null { return v <= MAX_SAFE ? Number(v) : null; }

/** a × b ÷ d, to the nearest whole number, a half up. Every argument a whole number, none negative, d above 0. */
export function mulDivRound(a: bigint, b: bigint, d: bigint): bigint {
  if (d <= 0n) throw new RangeError('mulDivRound: d must be above 0');
  return (a * b * 2n + d) / (2n * d);
}

function known(v: Valued, max: number): v is { value: number; source: Source | null } {
  return v.value !== null && Number.isSafeInteger(v.value) && v.value >= 0 && v.value <= max;
}

const INPUT_MAX: Readonly<Record<keyof PackInputs, number>> = Object.freeze({
  price_paid_pence: LIMITS.money_pence, land_pence: LIMITS.money_pence,
  gia_milli_m2: LIMITS.gia_milli_m2, building_rate_pence: LIMITS.rate_pence,
});

const INPUT_WORDS: Readonly<Record<keyof PackInputs, string>> = Object.freeze({
  price_paid_pence: 'The price paid for the property.',
  land_pence: 'The value of the bare land within that price.',
  gia_milli_m2: 'The building’s floor area.',
  building_rate_pence: 'The whole-building rebuild rate (BCIS), per square metre.',
});

/**
 * Add the pack up. Never throws for a pack of whole, non-negative numbers; a value that is not one is treated as
 * missing (and named), never as a number.
 */
export function packSums(inputs: PackInputs, lines: readonly PackLine[]): PackSums {
  const needed: Needed[] = [];
  const problems: Problem[] = [];

  for (const k of Object.keys(INPUT_WORDS) as (keyof PackInputs)[]) {
    if (!known(inputs[k], INPUT_MAX[k])) needed.push({ where: 'INPUT', key: k, line_id: null, words: INPUT_WORDS[k] });
  }

  let costSum = 0n;
  let qualSum = 0n;
  let qualMain = 0n;
  let allLinesComplete = true;
  const out: LineSum[] = [];
  for (const l of lines) {
    if (l.removed) { out.push({ line_id: l.id, cost_pence: null, qualifying_pence: null, counted: false }); continue; }
    const gaps: string[] = [];
    if (!known(l.qty_milli, LIMITS.qty_milli)) gaps.push('how much');
    if (!known(l.rate_pence, LIMITS.rate_pence)) gaps.push('the rate');
    if (!known(l.qpct_bp, LIMITS.qpct_bp)) gaps.push('the share that qualifies');
    if (l.pool !== 'MP' && l.pool !== 'SR') gaps.push('the pool');
    if (gaps.length > 0) {
      allLinesComplete = false;
      needed.push({ where: 'LINE', key: 'line', line_id: l.id, words: `${l.label}: ${gaps.join(', ')}.` });
      out.push({ line_id: l.id, cost_pence: null, qualifying_pence: null, counted: true });
      continue;
    }
    // ROUNDING 1: a line's rebuild cost = how much × rate, from thousandths of a unit.
    const cost = mulDivRound(BigInt(l.qty_milli.value as number), BigInt(l.rate_pence.value as number), 1000n);
    // ROUNDING 2: the part of it that qualifies.
    const qual = mulDivRound(cost, BigInt(l.qpct_bp.value as number), 10000n);
    costSum += cost;
    qualSum += qual;
    if (l.pool === 'MP') qualMain += qual;
    out.push({ line_id: l.id, cost_pence: Number(cost), qualifying_pence: Number(qual), counted: true });
  }

  // ROUNDING 3: the whole building's rebuild cost = floor area × rate.
  const rebuild = known(inputs.gia_milli_m2, LIMITS.gia_milli_m2) && known(inputs.building_rate_pence, LIMITS.rate_pence)
    ? mulDivRound(BigInt(inputs.gia_milli_m2.value), BigInt(inputs.building_rate_pence.value), 1000n)
    : null;

  let buildingPrice: bigint | null = null;
  if (known(inputs.price_paid_pence, LIMITS.money_pence) && known(inputs.land_pence, LIMITS.money_pence)) {
    const p = BigInt(inputs.price_paid_pence.value);
    const land = BigInt(inputs.land_pence.value);
    if (land >= p) problems.push({ code: 'LAND_NOT_BELOW_PRICE', words: 'The land is valued at or above the price paid, so nothing is left for the building. Check the price and the land value.' });
    else buildingPrice = p - land;
  }
  if (rebuild !== null && rebuild === 0n) {
    problems.push({ code: 'NO_REBUILD_COST', words: 'The whole building’s rebuild cost comes to nothing. Check the floor area and the rate.' });
  }
  if (costSum > MAX_SAFE) {
    problems.push({ code: 'TOO_LARGE', words: 'The elements add up to more than this pack can hold. Check the counts and rates.' });
  } else if (rebuild !== null && rebuild > 0n && costSum > rebuild) {
    problems.push({ code: 'ELEMENTS_EXCEED_BUILDING', words: 'The elements cost more to rebuild than the whole building. Check the counts and rates, or the building rate.' });
  }

  const complete = needed.length === 0 && problems.length === 0 && allLinesComplete
    && buildingPrice !== null && rebuild !== null && rebuild > 0n;

  let qualifying: bigint | null = null;
  let main: bigint | null = null;
  let special: bigint | null = null;
  let share: bigint | null = null;
  if (complete && buildingPrice !== null && rebuild !== null) {
    // ROUNDING 4: the building's price shared out as the rebuild cost is. The pools: main rounded, special the rest.
    qualifying = mulDivRound(buildingPrice, qualSum, rebuild);
    main = mulDivRound(buildingPrice, qualMain, rebuild);
    if (main > qualifying) main = qualifying; // cannot happen (qualMain ≤ qualSum); kept so the pools can never go negative
    special = qualifying - main;
    share = mulDivRound(qualSum, 10000n, rebuild);
  }

  return {
    lines: out,
    rebuild_pence: rebuild === null ? null : Number(rebuild),
    elements_cost_pence: exact(costSum),
    elements_qualifying_pence: exact(qualSum),
    building_price_pence: buildingPrice === null ? null : Number(buildingPrice),
    qualifying_pence: qualifying === null ? null : Number(qualifying),
    main_pool_pence: main === null ? null : Number(main),
    special_pool_pence: special === null ? null : Number(special),
    share_bp: share === null ? null : Number(share),
    needed,
    problems,
    complete,
  };
}

/* ------------------------------------------------------------------ reading what a person types */

export type Parsed = { ok: true; value: number } | { ok: false; why: string };

/** Pounds and pence, "£1,050,000" or "1050000.50", to pence. Never negative; at most £1bn. */
export function parseMoney(raw: string): Parsed {
  const s = raw.trim().replace(/[£,\s]/g, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return { ok: false, why: 'Type an amount in pounds, for example 1050000 or 1,050,000.50.' };
  const [whole, frac = ''] = s.split('.');
  const p = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(p) || p > LIMITS.money_pence) return { ok: false, why: 'That amount is too large.' };
  return { ok: true, value: p };
}

/** A count or an area with up to three decimal places, to thousandths. */
export function parseQuantity(raw: string): Parsed {
  const s = raw.trim().replace(/,/g, '');
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(s)) return { ok: false, why: 'Type how much as a number, for example 8 or 640.5.' };
  const [whole, frac = ''] = s.split('.');
  const v = Number(whole) * 1000 + Number((frac + '000').slice(0, 3));
  if (!Number.isSafeInteger(v) || v > LIMITS.qty_milli) return { ok: false, why: 'That is more than this pack can hold.' };
  return { ok: true, value: v };
}

/** A percentage from 0 to 100, up to two decimal places, to hundredths of a per cent. */
export function parsePercent(raw: string): Parsed {
  const s = raw.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return { ok: false, why: 'Type a percentage from 0 to 100, for example 75 or 62.5.' };
  const [whole, frac = ''] = s.split('.');
  const v = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (v > LIMITS.qpct_bp) return { ok: false, why: 'A share cannot be more than 100%.' };
  return { ok: true, value: v };
}

/** A rate in pounds per unit, to pence. */
export function parseRate(raw: string): Parsed {
  const r = parseMoney(raw);
  if (!r.ok) return { ok: false, why: 'Type the rate in pounds, for example 162 or 1,847.50.' };
  if (r.value > LIMITS.rate_pence) return { ok: false, why: 'That rate is too large.' };
  return r;
}

/* ------------------------------------------------------------------ showing it */

export function poundsWords(pence: number | null): string {
  if (pence === null) return '—';
  const whole = Math.floor(pence / 100);
  const p = pence % 100;
  return `£${whole.toLocaleString('en-GB')}${p === 0 ? '' : `.${String(p).padStart(2, '0')}`}`;
}

export function percentWords(bp: number | null): string {
  if (bp === null) return '—';
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  return `${whole}${frac === 0 ? '' : `.${String(frac).padStart(2, '0').replace(/0$/, '')}`}%`;
}

export function quantityWords(milli: number | null): string {
  if (milli === null) return '—';
  const whole = Math.floor(milli / 1000);
  const frac = milli % 1000;
  return `${whole.toLocaleString('en-GB')}${frac === 0 ? '' : `.${String(frac).padStart(3, '0').replace(/0+$/, '')}`}`;
}
