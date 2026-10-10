/**
 * THE SURVEY PACK'S GRANTS — chapter 15. Phase 153a, 4 October 2026: F-15's remainder.
 *
 * Rulebook F (01-rulebooks/Caprebate-Statutory-Rules-Register-F-Contributions-And-Grants-v1.md): money from someone
 * else reduces the spend "to the extent that" it met it (s.532, F-R1), and F3 says "trace it to cost elements; do not
 * pro-rate yet". Until this file, a grant on the claim record (claim_grants, migration 015) was matched only in words,
 * and nothing took it off anything: the survey pack's sums (src/web/pack-sums.ts) had no grant in them at all.
 *
 * TWO ROUTES, AND THE SWITCH CB_CTA.grant_traced_to_elements CHOOSES BETWEEN THEM. It ships OFF.
 *
 *   EQUAL SHARE   the grant_fraction route the public estimate has always used: the grant is a share of the price
 *                 paid, and every item loses that share. A £100,000 grant on a £500,000 price takes 20% off what
 *                 qualifies. OFF, EVERY GRANT TAKES THIS ROUTE.
 *   ITEMS         ON, a grant matched to named rows of the fixture list (claim_grant_elements, migration 078) comes off
 *                 only those rows: it met their spend, so their qualifying part comes down by the share of their spend
 *                 it met, and no other row moves. Split across several rows by their rebuild cost. A grant whose rows
 *                 are none of the pack's counted lines — it paid only for items that never qualify, such as the walls
 *                 or the flats — takes nothing off (Word question 79). A grant matched only in words, or not matched
 *                 at all, keeps the equal share.
 *
 * WHO PAID (F4, F5). Only insurance money after damage is known not to reduce the spend (F-R7). A connected payer — a
 * landlord linked to the client, a company in its group — reduces it unless CB_CTA.connected_contributor_no_reduction is
 * on (F-R10, F-Q1), the same switch the public estimate reads. Everyone else, and a payer not known, reduces it: whether
 * a private payer could claim relief itself (F-R9) is not a fact we hold, and N4 never lets an unknown relieve.
 *
 * N4, IN THIS FILE.
 *   · A grant matched only in words, or not at all, is UNTRACED — never taken as having paid for nothing.
 *   · A grant that reduces and whose amount is not known gives NO TOTAL, and is named in `needed`. A total without it
 *     would read as an answer.
 *   · A pack with no total before grants has none after them.
 *
 * THE ORDER. Grants matched to items come off first, line by line; the equal-share grants then take their share of what
 * is left. Every amount is whole pence in BigInt, each rounding the nearest penny, a half up (pack-sums.ts's own rule).
 * Main pool + special rate pool = what qualifies, to the penny, after grants as before them.
 *
 * PHASE 159i (item 1, Rulebook F F-R12): A THIRD ROUTE, FULL, replaces the equal share where `untraced_full` is on (on
 * in test): a grant that cannot be traced to the items it paid for comes off what qualifies in full — the conservative
 * deduction — after the traced ones. A grant paid to an EARLIER owner (PAST_OWNER) takes nothing off the buyer's sums;
 * it lowers the cap from the earlier sale (s.185, pack-legal.ts). And C23: every route's rows add up to its total.
 *
 * NOTHING HERE READS A DATABASE, A CLOCK OR A SWITCH: the switches are arguments, so both ways are tested
 * (test/pack-grants.test.ts) while the one that ships is off. Whether a grant reduces qualifying spend item by item is
 * the tax adviser's to confirm — FOR THE ACCOUNTANT, ACC-A16.
 */
import { mulDivRound, type Needed, type PackInputs, type PackLine, type PackSums } from './pack-sums.ts';

/** Rulebook F's payer classes — the closed list claim_grants.payer_class holds (migration 015; F.PAYER_CLASSES). */
export const PAYER_CLASS_KEYS: readonly string[] = Object.freeze([
  'nhs', 'local_authority', 'homes_england_gla', 'other_public', 'landlord_unconnected', 'landlord_connected',
  'group_company', 'charity', 'individual', 'insurer', 'UNKNOWN',
]);

/** A connected payer: F-R10, s.537(2)(c). */
const CONNECTED: readonly string[] = Object.freeze(['landlord_connected', 'group_company']);

export type PackGrant = {
  readonly id: string;
  /** PHASE 159i: who received it. A PAST owner's grant lowered what that owner could claim, so it lowers the s.185 cap
   *  (pack-legal.ts), never the buyer's price. Absent is the client's own, as before. */
  readonly paid_to?: 'CLIENT' | 'PAST_OWNER';
  /** PHASE 159i (item 4): the event on the building it paid for (property_events.id); null: not recorded. */
  readonly event_id?: string | null;
  /** Who paid, as a class from the closed list. A key not on it is read as not known. */
  readonly payer_class: string;
  readonly amount_pence: number | null;
  /** The fixture-list rows it paid for. Empty: matched only in words, or not at all — untraced. */
  readonly element_ids: readonly string[];
};

export type GrantSwitches = {
  /** CB_CTA.grant_traced_to_elements. */
  readonly element_trace: boolean;
  /** CB_CTA.connected_contributor_no_reduction. */
  readonly connected_no_reduction: boolean;
  /** PHASE 159i (item 1, Rulebook F F-R12): a grant that cannot be traced to the items it paid for comes off what
   *  qualifies IN FULL — the conservative reading of "to the extent that" (s.532) — in place of the equal share. On in
   *  test. Absent is off. */
  readonly untraced_full?: boolean;
};

export type GrantRoute = 'ITEMS' | 'FULL' | 'EQUAL_SHARE' | 'NOT_TAKEN_OFF' | 'PAST_OWNER';

export type GrantEffect = {
  readonly grant_id: string;
  readonly route: GrantRoute;
  /** Why it takes this route, in words. */
  readonly words: string;
  /** For ITEMS: the pack's lines it met. */
  readonly line_ids: readonly string[];
  /** What it takes off what qualifies, on its own; null until the pack and the grant have a total. */
  readonly reduction_pence: number | null;
};

export type GrantReading = {
  readonly effects: readonly GrantEffect[];
  /** The pack's figures before any grant. */
  readonly before: { readonly qualifying_pence: number | null; readonly main_pool_pence: number | null; readonly special_pool_pence: number | null };
  /** What all the grants take off together; null while there is no total. */
  readonly reduction_pence: number | null;
  /** The pack's sums after the grants: what every total, the legal check, approval and the report read. */
  readonly sums: PackSums;
};

/** Does this payer's money reduce the spend at all, and why. */
export function payerReduces(payer_class: string, sw: GrantSwitches): { readonly reduces: boolean; readonly words: string } {
  const p = PAYER_CLASS_KEYS.includes(payer_class) ? payer_class : 'UNKNOWN';
  if (p === 'insurer') return { reduces: false, words: 'Insurance money after damage does not reduce the spend (Rulebook F, F-R7).' };
  if (CONNECTED.includes(p) && sw.connected_no_reduction) {
    return { reduces: false, words: 'A connected payer’s money is left in, on the switched reading of Rulebook F, F-R10.' };
  }
  if (p === 'UNKNOWN') return { reduces: true, words: 'Who paid is not known, so it is taken off: a payer not known never relieves the claim.' };
  return { reduces: true, words: 'It reduces the spend it met.' };
}

/** The route each grant takes, before any sum. */
export function grantRoute(g: PackGrant, sw: GrantSwitches): { readonly route: GrantRoute; readonly words: string } {
  if (g.paid_to === 'PAST_OWNER') return { route: 'PAST_OWNER', words: 'Paid to an earlier owner. It lowered what that owner could pass on, so it lowers the cap from the earlier sale (s.185), not your price.' };
  const r = payerReduces(g.payer_class, sw);
  if (!r.reduces) return { route: 'NOT_TAKEN_OFF', words: r.words };
  const traced = sw.element_trace && g.element_ids.length > 0;
  if (sw.untraced_full === true && !traced) {
    return { route: 'FULL', words: 'Not matched to the items it paid for, so all of it comes off what qualifies. Match it to items from its papers to take off only what it paid for.' };
  }
  if (!sw.element_trace) {
    return { route: 'EQUAL_SHARE', words: 'Taken off every item in equal share — the grant as a share of the price paid. Matching it to items waits on the tax adviser.' };
  }
  if (g.element_ids.length === 0) {
    return { route: 'EQUAL_SHARE', words: 'Not matched to rows of the fixture list, so it is taken off every item in equal share. A grant matched only in words is not taken as having paid for nothing.' };
  }
  return { route: 'ITEMS', words: 'Matched to rows of the fixture list, so it comes off only those items.' };
}

const ZERO = 0n;

/**
 * Take the claim's grants off the pack's sums. With no grant that reduces, the sums come back unchanged — the same
 * object — so a pack with no grant is exactly the pack it was.
 */
export function applyGrants(inputs: PackInputs, lines: readonly PackLine[], sums: PackSums, grants: readonly PackGrant[], sw: GrantSwitches): GrantReading {
  const before = { qualifying_pence: sums.qualifying_pence, main_pool_pence: sums.main_pool_pence, special_pool_pence: sums.special_pool_pence };
  const routed = grants.map((g) => ({ g, ...grantRoute(g, sw) }));
  const reducing = routed.filter((x) => x.route !== 'NOT_TAKEN_OFF' && x.route !== 'PAST_OWNER');

  const needed: Needed[] = reducing.filter((x) => x.g.amount_pence === null || !Number.isSafeInteger(x.g.amount_pence) || x.g.amount_pence <= 0)
    .map((x) => ({ where: 'GRANT', key: 'grant_amount', line_id: x.g.id, words: 'How much a grant on the claim paid. Until it is known there is no total.' }));

  // The counted lines with a rebuild cost, by their fixture-list row.
  const sumOf = new Map(sums.lines.map((l) => [l.line_id, l] as const));
  const lineOf = new Map(lines.map((l) => [l.id, l] as const));
  const counted = lines.filter((l) => !l.removed && (sumOf.get(l.id)?.cost_pence ?? null) !== null);
  const linesFor = (g: PackGrant): PackLine[] => counted.filter((l) => l.element_id !== null && g.element_ids.includes(l.element_id) && (sumOf.get(l.id)?.cost_pence ?? 0) > 0);

  const total = sums.complete && needed.length === 0;
  if (reducing.length === 0) {
    return { effects: routed.map((x) => ({ grant_id: x.g.id, route: x.route, words: x.words, line_ids: [], reduction_pence: x.route === 'NOT_TAKEN_OFF' || x.route === 'PAST_OWNER' ? 0 : null })), before, reduction_pence: 0, sums };
  }
  if (!total) {
    return {
      effects: routed.map((x) => ({ grant_id: x.g.id, route: x.route, words: x.words, line_ids: x.route === 'ITEMS' ? linesFor(x.g).map((l) => l.id) : [], reduction_pence: x.route === 'NOT_TAKEN_OFF' || x.route === 'PAST_OWNER' ? 0 : null })),
      before, reduction_pence: null,
      sums: { ...sums, qualifying_pence: null, main_pool_pence: null, special_pool_pence: null, share_bp: null, needed: [...sums.needed, ...needed], complete: false },
    };
  }

  const BP = BigInt(sums.building_price_pence as number);
  const R = BigInt(sums.rebuild_pence as number);
  const P = BigInt(inputs.price_paid_pence.value as number);
  const Q = BigInt(sums.qualifying_pence as number);
  const M = BigInt(sums.main_pool_pence as number);

  /** A line's spend and its qualifying part, as a share of the building's price (the pack's rounding 4, per line). */
  const spend = (id: string): { c: bigint; q: bigint } => {
    const s = sumOf.get(id);
    return { c: mulDivRound(BP, BigInt(s?.cost_pence ?? 0), R), q: mulDivRound(BP, BigInt(s?.qualifying_pence ?? 0), R) };
  };
  /** How much of a grant fell on each of its lines: shared by rebuild cost. */
  const metBy = (g: PackGrant, ls: readonly PackLine[]): Map<string, bigint> => {
    const costT = ls.reduce((t, l) => t + BigInt(sumOf.get(l.id)?.cost_pence ?? 0), ZERO);
    const out = new Map<string, bigint>();
    if (costT === ZERO) return out;
    for (const l of ls) out.set(l.id, mulDivRound(BigInt(g.amount_pence as number), BigInt(sumOf.get(l.id)?.cost_pence ?? 0), costT));
    return out;
  };
  /** The qualifying part a line loses when `met` of its spend was met by others: never more than all of it. */
  const loss = (id: string, met: bigint): bigint => {
    const { c, q } = spend(id);
    if (c === ZERO || met >= c) return q;
    return mulDivRound(q, met, c);
  };

  // 1. ITEMS — every grant's share of each of its lines, added up per line, then each line's loss.
  const itemGrants = reducing.filter((x) => x.route === 'ITEMS');
  const metOnLine = new Map<string, bigint>();
  for (const x of itemGrants) for (const [id, a] of metBy(x.g, linesFor(x.g))) metOnLine.set(id, (metOnLine.get(id) ?? ZERO) + a);
  let T = ZERO;
  let TM = ZERO;
  for (const [id, met] of metOnLine) {
    const lost = loss(id, met);
    T += lost;
    if (lineOf.get(id)?.pool === 'MP') TM += lost;
  }
  if (T > Q) T = Q;
  if (TM > M) TM = M;
  const Q0 = Q - T;
  // A line rounded on its own can leave the special pool a penny short of its lines' losses: the pools still add up.
  let M0 = M - TM;
  if (M0 > Q0) M0 = Q0;

  // 1b. PHASE 159i: FULL — each untraced grant's whole amount off what is left, the pools sharing it in proportion.
  const fullGrants = reducing.filter((x) => x.route === 'FULL');
  const AF = fullGrants.reduce((t, x) => t + BigInt(x.g.amount_pence as number), ZERO);
  const fullOff = AF >= Q0 ? Q0 : AF;
  const Q1 = Q0 - fullOff;
  let M1 = Q0 === ZERO ? ZERO : mulDivRound(M0, Q1, Q0);
  if (M1 > Q1) M1 = Q1;

  // 2. EQUAL SHARE — the grants' total as a share of the price paid, off what is left.
  const shareGrants = reducing.filter((x) => x.route === 'EQUAL_SHARE');
  const AU = shareGrants.reduce((t, x) => t + BigInt(x.g.amount_pence as number), ZERO);
  const keep = AU >= P ? ZERO : P - AU;
  const Q2 = mulDivRound(Q1, keep, P);
  let M2 = mulDivRound(M1, keep, P);
  if (M2 > Q2) M2 = Q2;
  const S2 = Q2 - M2;

  /* PHASE 159i (C23): THE ROWS ADD UP TO THE TOTAL. Each route's total is shared across its grants by amount, the
     pennies left by rounding going to the largest remainders, so the rows always sum to what the route took off. */
  const share = (xs: typeof reducing, total: bigint): Map<string, bigint> => {
    const out = new Map<string, bigint>();
    const sumA = xs.reduce((t, x) => t + BigInt(x.g.amount_pence as number), ZERO);
    if (sumA === ZERO) return out;
    const parts = xs.map((x) => { const n = total * BigInt(x.g.amount_pence as number); return { id: x.g.id, q: n / sumA, r: n % sumA }; });
    let left = total - parts.reduce((t, p) => t + p.q, ZERO);
    for (const p of [...parts].sort((a, b) => (a.r === b.r ? 0 : a.r > b.r ? -1 : 1))) { if (left <= ZERO) break; p.q += 1n; left -= 1n; }
    for (const p of parts) out.set(p.id, p.q);
    return out;
  };
  const fullRows = share(fullGrants, fullOff);
  const shareRows = share(shareGrants, Q1 - Q2);
  /* The traced grants: each one's own loss on its lines, scaled to what the route actually took off together (lines two
     grants both paid for cannot lose more than all they qualify for), the pennies to the largest remainders. */
  const ownLoss = new Map<string, bigint>();
  for (const x of itemGrants) { let own = ZERO; for (const [id, a] of metBy(x.g, linesFor(x.g))) own += loss(id, a); ownLoss.set(x.g.id, own); }
  const itemRows = ((): Map<string, bigint> => {
    const out = new Map<string, bigint>();
    const sumOwn = [...ownLoss.values()].reduce((t, v) => t + v, ZERO);
    if (sumOwn === ZERO) { for (const k of ownLoss.keys()) out.set(k, ZERO); return out; }
    const parts = itemGrants.map((x) => { const n = T * (ownLoss.get(x.g.id) ?? ZERO); return { id: x.g.id, q: n / sumOwn, r: n % sumOwn }; });
    let left = T - parts.reduce((t, p) => t + p.q, ZERO);
    for (const p of [...parts].sort((a, b) => (a.r === b.r ? 0 : a.r > b.r ? -1 : 1))) { if (left <= ZERO) break; p.q += 1n; left -= 1n; }
    for (const p of parts) out.set(p.id, p.q);
    return out;
  })();

  const effects: GrantEffect[] = routed.map((x) => {
    if (x.route === 'NOT_TAKEN_OFF' || x.route === 'PAST_OWNER') return { grant_id: x.g.id, route: x.route, words: x.words, line_ids: [], reduction_pence: 0 };
    if (x.route === 'FULL') return { grant_id: x.g.id, route: x.route, words: x.words, line_ids: [], reduction_pence: Number(fullRows.get(x.g.id) ?? ZERO) };
    if (x.route === 'EQUAL_SHARE') {
      return { grant_id: x.g.id, route: x.route, words: x.words, line_ids: [], reduction_pence: Number(shareRows.get(x.g.id) ?? ZERO) };
    }
    const ls = linesFor(x.g);
    const own = itemRows.get(x.g.id) ?? ZERO;
    const words = ls.length === 0
      ? 'It paid only for items this pack does not count. Those items never qualify, or were taken out. So it takes nothing off.'
      : x.words;
    return { grant_id: x.g.id, route: x.route, words, line_ids: ls.map((l) => l.id), reduction_pence: Number(own > Q ? Q : own) };
  });

  const changed = Q2 !== Q;
  return {
    effects, before,
    reduction_pence: Number(Q - Q2),
    sums: changed
      ? { ...sums, qualifying_pence: Number(Q2), main_pool_pence: Number(M2), special_pool_pence: Number(S2), share_bp: BP === ZERO ? null : Number(mulDivRound(Q2, 10000n, BP)) }
      : sums,
  };
}
