/**
 * THE SURVEY PACK — the drafts, the surveyor's stamped changes, and the sums. 1 October 2026.
 *
 * Lakhbir: "the idea is API's do most of the work, they check and approve" and "any edits made by the surveyor needs to
 * essentially have their stamp to say thats their number".
 *
 * A VALUE IS ONE OF THREE THINGS, AND THE PACK ALWAYS SAYS WHICH:
 *   EVIDENCE  read from a record we hold: the energy certificate's floor area, the title register's price, the room
 *             counts recorded on the job;
 *   DRAFT     Cap Rebate's, from the fixture list: a line's pool and the share that qualifies, with its authority;
 *   SURVEYOR  typed by the surveyor: their name, the time and their reason, kept for ever (migration 070).
 * Nothing else fills a box. A value we do not hold is NEEDED, and the sums give no total until it is there
 * (src/web/pack-sums.ts). PHASE 159f: rates are DRAFTED from BCIS (src/web/bcis-data.ts) — the whole-building rate and every
 * line measured by floor area — at the purchase date; the surveyor accepts each or types their own with its source.
 *
 * WHO MAY CHANGE IT: the surveyor the job is assigned to (`surveyor_job.commit`, the rule the workspace's figures use).
 * Everyone who may open the job may read the pack.
 *
 * TWO TABS NEVER OVERWRITE EACH OTHER UNSEEN. Every page carries the pack's counter as it was drawn; a change sent from
 * an older page is refused and the page is drawn again with what changed. The check and the write are one transaction.
 *
 * THE PRICE IS IN THE PACK. The workspace withholds a register's price from a surveyor (REGISTER_AMOUNTS_WITHHELD, so
 * they cannot anchor on it). The pack cannot: section 562 shares out the price, so the price is its first input. This
 * follows Lakhbir's decision of 1 October 2026 that the surveyor works from a pre-filled pack and approves it.
 */
import { vatReading, VAT_POSITION_CODES, type VatReading } from './pack-vat.ts';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { packJob, type PackJob } from './surveyor.ts';
import { linesForSector, type LineTemplate } from './pack-lines.ts';
import {
  packSums, parseMoney, parsePercent, parseQuantity, parseRate, poundsWords, worksSums, WORKS_FIELDS, WORKS_PART_FIELDS, worksPartProblems, type WorksPartField,
  mulDivRound, type PackInputs, type PackLine, type PackSums, type Pool, type Source, type Valued, type WorksField, type WorksInputs, type WorksSums,
} from './pack-sums.ts';
import { dateWords, eventsOfProperty, KIND_WORDS, purchaseApplies, worksEvents, type PropertyEvent } from './property-events.ts';
import { legalVerdictForJob } from './pack-legal.ts';
import { applyGrants, payerReduces, type GrantReading, type GrantSwitches } from './pack-grants.ts';
import { moneyReadingsHere, type MoneyReadings } from './money-readings.ts';
import { acquisitionDateReading, elementName, latestFacts, packGrantsFor } from './claim-facts.ts';
import { bcisDataHere, bcisDrafts, bcisLocationNamed, indexBetween, type BcisDraft, type RateBasis } from './bcis-data.ts';
import { councilAreaOf, floorAreaForSite, pricePaidSale, propertyTenure, siteAreaFlag, siteAreaOf } from './who-claims.ts';
import { shippedGrantSwitches } from './grant-checks.ts';

/**
 * `grantSwitches` (Phase 153a) is for the tests alone: it stands in for CB_CTA's two grant switches so chapter 15 can be
 * proved both ways. Nothing in src/ or api/ passes it, so a pack always takes the switches as they ship.
 */
export type PackDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string; grantSwitches?: GrantSwitches; money?: MoneyReadings };

/** Chapter 15's grants: the claim's, as the pack takes them (src/web/pack-grants.ts). */
export type PackGrants = {
  /** The claim the survey job is on; null for a job on no claim, which has no grants to read. */
  readonly claim_id: string | null;
  readonly list: readonly {
    readonly id: string; readonly kind: string; readonly payer_class: string; readonly amount_pence: number | null;
    readonly traced: string; readonly element_ids: readonly string[]; readonly element_names: readonly string[];
  }[];
  readonly switches: GrantSwitches;
  readonly reading: GrantReading;
  /** False for the surveyor (Phase 153c): what each grant paid, and what each takes off, is not shown to them. */
  readonly amounts_shown: boolean;
};

/**
 * PHASE 153c, 4 October 2026 — MAY THE SURVEYOR SEE WHAT EACH GRANT PAID? Built on our recommendation, for Sadique Maskeen
 * (data protection officer) to check. The surveyor's released list (src/payload.ts, releasedFactReader) carries no
 * amount, so the pack does not show one either: chapter 15 shows the surveyor who paid (as a class), what it paid for
 * and how it comes off, but not each grant's amount or what each takes off. The pack's totals — before grants, less
 * grants, the spend that qualifies — are still shown, because they are in the figures the surveyor approves. Every
 * other role sees the amounts. If Sadique says the surveyor may see them, this becomes true and the pack goes on the
 * released list instead.
 */
export const GRANT_AMOUNTS_TO_SURVEYOR = false;

export type PackField = 'price_paid' | 'land' | 'gia' | 'building_rate' | 'qty' | 'rate' | 'qpct' | 'pool' | 'removed' | 'vat_position' | 'vat' | 'shared_area'
  | CostField | WorksField | 'location'
  /* PHASE 159k (item 2): the three readings' parts */ | WorksPartField | 'long_life';

/** PHASE 159c: one piece of work on the building, priced on its own cost (chapter 9; src/web/pack-sums.ts worksSums). */
export type WorksView = {
  readonly event: PropertyEvent;
  /** "A refurbishment or refit, June 2025". */
  readonly label: string;
  readonly inputs: WorksInputs;
  readonly sums: WorksSums;
  /** PHASE 159k (item 2): the readings' parts of this work — each optional, the surveyor's, with a reason. */
  readonly parts: Readonly<Record<WorksPartField, Valued>>;
  /** PHASE 159k: s.33B on this work — the repairs on integral features made capital, in pence (0: not), and why. */
  readonly s33b: { readonly capital_pence: number; readonly words: string | null };
  /** PHASE 159k: of this work's main pool, what is long-life (s.91), and of its cost, the asbestos removal with its share
   *  of the preliminaries and fees (Part 14); null where not given. */
  readonly long_life_pence: number | null;
  readonly asbestos_pence: number | null;
};

/**
 * PHASE 157a, 6 October 2026 — THE COST MODEL'S FIVE VALUES (migration 095; src/web/pack-cost-model.ts). Each the
 * surveyor's, with a reason, for the index dates in chapter 11 and the insurance check in chapter 14. A date is kept as
 * YYYYMMDD; what a figure includes is 1 demolition + 2 professional fees + 4 preliminaries. Never drafted (N4).
 */
export const COST_FIELDS = Object.freeze(['valuation_date', 'insurance', 'insurance_date', 'insurance_includes', 'rebuild_includes'] as const);
export type CostField = (typeof COST_FIELDS)[number];
export type CostValues = Readonly<Record<CostField, Valued>>;
export const INCLUDES_BITS = Object.freeze({ demolition: 1, fees: 2, prelims: 4 } as const);
export const PACK_INPUT_FIELDS = Object.freeze(['price_paid', 'land', 'gia', 'building_rate'] as const);
export type PackInputField = (typeof PACK_INPUT_FIELDS)[number];

type EntryRow = {
  id: string; seq: number; line_key: string | null; field: PackField; value: number | null; pool: Pool | null;
  by_user: string; by_name: string; reason: string; at: string;
  /** PHASE 159f (migration 108): a typed rate's source, all three or none; on 'location', rate_ref is the BCIS area. */
  rate_basis: RateBasis['kind'] | null; rate_ref: string | null; rate_priced_at: string | null;
};

/**
 * PHASE 159f — HOW THE PACK'S RATES ARE PRICED (chapters 9, 10 and 11). The BCIS drafts, the day every rate is brought to
 * (the purchase date, C19), the rates that could not be brought to it, the rates with no source, and section 562 both
 * ways (item 6): the proportional apportionment the report uses, and the residual one beside it for the surveyor.
 */
export type Pricing = {
  readonly bcis: BcisDraft;
  /** The day every rate is priced at, where they are all at one day; else null (see `mixed`). */
  readonly priced_at: string | null;
  /** The purchase date, the day every rate is brought to where the index reaches it. */
  readonly purchase: string | null;
  /** Rates at a day of their own that could not be brought to the purchase date: "Lighting: 2024-03-01". */
  readonly mixed: readonly string[];
  /** Counted rates with no source: the whole-building rate, or a line's label. */
  readonly unsourced: readonly string[];
  readonly residual: { readonly qualifying_pence: number | null; readonly words: string };
  /** PHASE 159g (item 7): where the BCIS location came from — the surveyor's choice, the property's council area, or
   *  neither (the UK mean). The council area is a draft: still the surveyor's to change, with a reason. */
  readonly location_from: 'SURVEYOR' | 'COUNCIL' | null;
};

/** PHASE 159i: the purchase's money adjustments (money-readings.ts), each shown with what it did. */
export type PackMoney = {
  readonly readings: MoneyReadings;
  /** Stamp duty and acquisition fees added to the price shared out (on in test). */
  readonly costs_pence: number;
  /** The land's share of the VAT and those costs, added to the land (C12). */
  readonly land_share_pence: number;
  /** The buyer's own alterations to install plant, claimed on top of the cap (s.25; on in test). */
  readonly alterations_pence: number;
  /** A VAT capital goods scheme adjustment recorded on the claim: a note, not counted. */
  readonly cgs_pence: number | null;
  readonly words: readonly string[];
};

/** PHASE 159i (item 4): a piece of work's own grants and its irrecoverable VAT, applied to its cost-led sums. VAT the
 *  client could not reclaim follows every part of the cost; a grant that paid for this work comes off what qualifies in
 *  full (it cannot be traced to rows of a final account), the pools sharing it. */
export function adjustWorks(w: WorksSums, vat_pence: number | null, grants_pence: readonly (number | null)[], total_pence: number | null): WorksSums {
  if (!w.complete || w.qualifying_pence === null || w.main_pool_pence === null || w.special_pool_pence === null) return w;
  if (grants_pence.some((g) => g === null)) {
    return { ...w, qualifying_pence: null, main_pool_pence: null, special_pool_pence: null, complete: false,
      needed: [...w.needed, { where: 'GRANT', key: 'grant_amount', line_id: w.event_id, words: 'How much a grant that paid for this work paid. Until it is known there is no total.' }] };
  }
  let q = BigInt(w.qualifying_pence), m = BigInt(w.main_pool_pence), r = BigInt(w.repairs_pence ?? 0);
  if (vat_pence !== null && vat_pence > 0 && total_pence !== null && total_pence > 0) {
    const T = BigInt(total_pence), V = BigInt(vat_pence);
    q = mulDivRound(q, T + V, T); m = mulDivRound(m, T + V, T); r = mulDivRound(r, T + V, T);
    if (m > q) m = q;
  }
  const g = grants_pence.reduce<bigint>((t, x) => t + BigInt(x as number), 0n);
  if (g > 0n) {
    const q1 = g >= q ? 0n : q - g;
    m = q === 0n ? 0n : mulDivRound(m, q1, q);
    if (m > q1) m = q1;
    q = q1;
  }
  return { ...w, qualifying_pence: Number(q), main_pool_pence: Number(m), special_pool_pence: Number(q - m), repairs_pence: w.repairs_pence === null ? null : Number(r) };
}

/** PHASE 159g: what the registers already say, for the surveyor to confirm — never a value the pack counts. */
export type RegisterLeads = {
  /** Price Paid's sale at the address, as a lead or a price, in words (items 3 and 4); null when none is held. */
  readonly price_paid: string | null;
  /** A site area far larger than the building (item 5); null when there is none to flag. */
  readonly site_area: string | null;
  /** How the client holds the building and its tenure (items 2 and 4). */
  readonly tenure: string;
};

export type ViewLine = PackLine & {
  readonly template: LineTemplate | null;
  readonly added: { readonly by_name: string; readonly at: string; readonly reason: string } | null;
};

export type PropertyChoice = { readonly id: string; readonly label: string; readonly postcode: string | null };

/**
 * PHASE 159a (the Lockwood run, L6): A PROPERTY AS ONE LINE — its label, then its postcode only where the label does not
 * already end with it. A label typed as a full address ("3 Meltham Road, Huddersfield, HD1 3XH") printed its postcode
 * twice on the report and the pack.
 */
export function propertyLine(p: { readonly label: string; readonly postcode: string | null }): string {
  if (p.postcode === null || p.postcode.trim() === '') return p.label;
  const squash = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return squash(p.label).endsWith(squash(p.postcode)) ? p.label : `${p.label}, ${p.postcode}`;
}

export type Change = {
  readonly seq: number; readonly at: string; readonly by_name: string; readonly reason: string;
  readonly line_key: string | null; readonly line_label: string | null; readonly field: PackField; readonly words: string;
};

export type PackView = {
  readonly job: PackJob;
  readonly pack_id: string | null;
  readonly property: PropertyChoice | null;
  /** The company's properties, offered when nobody has said which one this pack is for. */
  readonly property_choices: readonly PropertyChoice[];
  readonly inputs: PackInputs;
  readonly lines: readonly ViewLine[];
  /** The pack's sums AFTER the claim's grants (Phase 153a, chapter 15); the figures before them are `grants.reading.before`. */
  readonly sums: PackSums;
  readonly grants: PackGrants;
  /** PHASE 153e: chapter 15's VAT half (src/web/pack-vat.ts). Its counted VAT is in `sums`, added to the price paid. */
  readonly vat: VatReading;
  /** PHASE 153e: supported living's shared areas from the floor plans, in thousandths of a m² (the surveyor's, with a reason). */
  readonly shared_area: Valued;
  /** PHASE 157a: the cost model's five values (chapter 11's valuation date, chapter 14's insurance check). */
  readonly cost: CostValues;
  /** PHASE 159c: what happened to the building, in order (migration 105). Empty for a building with none recorded. */
  readonly events: readonly PropertyEvent[];
  /** PHASE 159c: false where the building was not bought (no purchase recorded among its events): no price to share out. */
  readonly purchase_applies: boolean;
  /** PHASE 159c: the purchase's own sums (section 562, after grants). `sums` is these plus every piece of work. */
  readonly purchase_sums: PackSums;
  /** PHASE 159c: each piece of work since, on its own cost. */
  readonly works: readonly WorksView[];
  /** PHASE 159d (item 8): the purchase fails the legal check (RED) and there is work since: the purchase is W3 — not
   *  claimed — and the works stand on their own. False otherwise: a pack with no work stops at the legal check as before. */
  readonly purchase_w3: boolean;
  /** PHASE 159f: how the rates are priced — the BCIS drafts, one day, their sources, and section 562 both ways. */
  readonly pricing: Pricing;
  /** PHASE 159i: the money added to or taken off the purchase, in words and pence. */
  readonly money: PackMoney;
  /** PHASE 159k (item 2): of the purchase's main pool, what has an expected life of 25 years or more (s.91) — the
   *  surveyor's, with a reason; not given, the long-life test is not applied to the purchase. */
  readonly long_life: Valued;
  /** PHASE 159g: the register leads for chapter 9. */
  readonly leads: RegisterLeads;
  /** The pack's counter as this view was read. A change must carry it back. */
  readonly seq: number;
  readonly may_edit: boolean;
  /** Every change a surveyor made, newest first. */
  readonly changes: readonly Change[];
};

export type PackResult = { readonly ok: true } | { readonly ok: false; readonly why: string; readonly field?: string; readonly stale?: boolean };

const INPUT_SUM_KEY: Readonly<Record<PackInputField, keyof PackInputs>> = Object.freeze({
  price_paid: 'price_paid_pence', land: 'land_pence', gia: 'gia_milli_m2', building_rate: 'building_rate_pence',
});

export const INPUT_LABEL: Readonly<Record<PackInputField, string>> = Object.freeze({
  price_paid: 'Price paid', land: 'Bare land within the price', gia: 'Floor area', building_rate: 'Whole-building rebuild rate (BCIS)',
});

/* ================================================================== *
 * READING IT
 * ================================================================== */

function safeJson(s: string): Record<string, unknown> {
  try { const v = JSON.parse(s) as unknown; return v !== null && typeof v === 'object' ? v as Record<string, unknown> : {}; } catch { return {}; }
}

function propertyOf(db: Db, job: PackJob, packProperty: string | null | undefined): { property: PropertyChoice | null; choices: PropertyChoice[] } {
  const all = db.all<PropertyChoice>('SELECT id, label, postcode FROM properties WHERE business_id = ? ORDER BY label ASC, id ASC', [job.business_id]);
  if (packProperty !== undefined && packProperty !== null) return { property: all.find((p) => p.id === packProperty) ?? null, choices: all };
  if (job.claim_id !== null) {
    const pid = db.get<{ p: string | null }>('SELECT property_id AS p FROM claims WHERE id = ?', [job.claim_id])?.p ?? null;
    const found = all.find((p) => p.id === pid);
    if (found !== undefined) return { property: found, choices: all };
  }
  return { property: all.length === 1 ? all[0] as PropertyChoice : null, choices: all };
}

/** What the records say, as EVIDENCE: the title register's price, the energy certificate's floor area. */
function evidenceInputs(db: Db, business_id: string, property: PropertyChoice | null): { price: Valued; gia: Valued } {
  const none: Valued = { value: null, source: null };
  let price = none;
  if (property !== null) {
    const t = db.get<{ fields_json: string; obtained_at: string }>(
      "SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC LIMIT 1",
      [business_id, property.id]);
    const p = t === undefined ? undefined : safeJson(t.fields_json)['price_paid'];
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
      price = { value: Math.round(p * 100), source: { kind: 'EVIDENCE', text: 'HM Land Registry title register', at: t?.obtained_at ?? null } };
    }
  }
  const epcs = db.all<{ fields_json: string; property_id: string | null; obtained_at: string }>(
    "SELECT fields_json, property_id, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'EPC' ORDER BY obtained_at DESC",
    [business_id]);
  const mine = property === null ? [] : epcs.filter((e) => e.property_id === property.id);
  const pick = mine[0] ?? (epcs.length === 1 && epcs[0]?.property_id === null ? epcs[0] : undefined);
  let gia = none;
  if (pick !== undefined) {
    const f = safeJson(pick.fields_json);
    const a = f['epc_total_floor_area_m2'];
    if (typeof a === 'number' && Number.isFinite(a) && a > 0) {
      const rrn = typeof f['epc_rrn'] === 'string' ? ` ${f['epc_rrn'] as string}` : '';
      gia = { value: Math.round(a * 1000), source: { kind: 'EVIDENCE', text: `Energy certificate${rrn}`, at: pick.obtained_at } };
    }
  }
  return { price, gia };
}

/** The room counts recorded on the job, summed for a line counted per room — only when every room it needs is counted. */
function roomDraft(db: Db, job_id: string, rooms: readonly string[]): Valued {
  const rows = db.all<{ room_id: string; room_count: number | null; recorded_at: string; by_name: string | null }>(
    'SELECT c.room_id, c.room_count, c.recorded_at, u.display_name AS by_name FROM surveyor_room_counts c LEFT JOIN users u ON u.id = c.recorded_by WHERE c.job_id = ?',
    [job_id]);
  let total = 0;
  let latest: { at: string; by: string | null } | null = null;
  for (const r of rooms) {
    const row = rows.find((x) => x.room_id === r);
    if (row === undefined || row.room_count === null) return { value: null, source: null };
    total += row.room_count;
    if (latest === null || row.recorded_at > latest.at) latest = { at: row.recorded_at, by: row.by_name };
  }
  return { value: total * 1000, source: { kind: 'SURVEYOR', text: 'Room counts on this job (chapter 6)', by_name: latest?.by ?? null, at: latest?.at ?? null } };
}

/** True for a value a surveyor typed into the pack (it has a reason) — not a room count drafted from the job. */
function isEntry(s: Source | null): boolean {
  return s?.kind === 'SURVEYOR' && s.reason !== undefined && s.reason !== null;
}

function surveyorSource(e: EntryRow): Source {
  const basis: RateBasis | null = e.rate_basis !== null && e.rate_ref !== null
    ? { kind: e.rate_basis, ref: e.rate_ref, priced_at: e.rate_priced_at } : null;
  return { kind: 'SURVEYOR', text: e.by_name, by_name: e.by_name, at: e.at, reason: e.reason, ...(basis === null ? {} : { basis }) };
}

const FIELD_WORDS: Readonly<Record<PackField, string>> = Object.freeze({
  price_paid: 'price paid', land: 'bare land', gia: 'floor area', building_rate: 'whole-building rate',
  qty: 'how much', rate: 'rate', qpct: 'share that qualifies', pool: 'pool', removed: 'taken out',
  vat_position: 'VAT position', vat: 'VAT that could not be reclaimed', shared_area: 'shared areas from the floor plans',
  valuation_date: 'valuation date', insurance: 'insurance rebuild figure', insurance_date: 'date of the insurance figure',
  insurance_includes: 'what the insurance figure includes', rebuild_includes: 'what our rebuild cost includes',
  works_total: 'final account', works_main: 'plant and machinery', works_special: 'integral features',
  works_bwic: 'builder’s work in connection', works_demolition: 'demolition of old plant', works_other: 'work that does not qualify',
  works_repairs: 'repair part', works_prelims: 'preliminaries', works_fees: 'professional fees',
  location: 'BCIS location',
  works_long_life: 'long-life part of the plant', works_asbestos: 'asbestos removal part', works_repairs_if: 'repairs on integral features',
  works_if_replacement: 'replacement cost of those integral features', long_life: 'long-life part of the main pool',
});

/**
 * PHASE 159c: THE PACK'S TOTAL IS THE PURCHASE AND EVERY PIECE OF WORK. Where the building was bought (or has no events
 * recorded: every pack from before), the purchase's section 562 sums stand as they were. Each piece of work adds its own
 * cost-led figure. There is a total only when every part has one (N4). A grant on a building with work since is not
 * yet taken off any part but the purchase, so it stops the total until Phase 159i says which spend it paid for: a grant
 * left on the wrong spend is an over-claim.
 */
function combined(purchase: PackSums, applies: boolean, works: readonly WorksView[], grants: number): PackSums {
  if (works.length === 0) return purchase;
  const needed = [...(applies ? purchase.needed : []), ...works.flatMap((w) => w.sums.needed)];
  const problems = [...(applies ? purchase.problems : []), ...works.flatMap((w) => w.sums.problems)];
  // PHASE 159i (item 4): only a grant whose spend is not recorded stops the total now; one recorded against an event comes off it.
  if (grants > 0) problems.push({ code: 'GRANTS_ON_EVENTS', words: 'A grant is on this claim, and the building has work done since. Say which spend it paid for: the purchase or a piece of work. Until then it is not taken off, and there is no total.' });
  const complete = (applies ? purchase.complete : true) && works.every((w) => w.sums.complete) && problems.length === 0;
  const add = (pick: (x: { qualifying_pence: number | null; main_pool_pence: number | null; special_pool_pence: number | null }) => number | null): number | null => {
    if (!complete) return null;
    return [...(applies ? [purchase] : []), ...works.map((w) => w.sums)].reduce((a, x) => a + (pick(x) ?? 0), 0);
  };
  return {
    ...purchase,
    building_price_pence: applies ? purchase.building_price_pence : null,
    share_bp: applies ? purchase.share_bp : null,
    qualifying_pence: add((x) => x.qualifying_pence),
    main_pool_pence: add((x) => x.main_pool_pence),
    special_pool_pence: add((x) => x.special_pool_pence),
    needed, problems, complete,
  };
}

/**
 * PHASE 159k (item 2, OUR READING, on in test) — s.33B ACROSS THE BUILDING'S PIECES OF WORK. Where, in any twelve months,
 * repairs on integral features pass half of what replacing them would cost, the spend is capital, not a repair: it goes
 * to the special rate pool. Each piece of work gives its repairs on integral features and that replacement cost (both
 * parts of its final account, the surveyor's). A work's repairs are read with every other work's within twelve months of
 * it (by month), against its own replacement cost. A work with no month known is read on its own. Not given: not applied.
 */
export type S33b = { readonly capital: boolean; readonly words: string };

const monthOf = (d: string | null): number | null => {
  const m = d === null ? null : /^(\d{4})-(\d{2})/.exec(d);
  return m === null ? null : Number(m[1]) * 12 + Number(m[2]) - 1;
};

export function s33bDecisions(works: readonly { id: string; date: string | null; parts: Readonly<Record<WorksPartField, Valued>> }[]): Map<string, S33b> {
  const out = new Map<string, S33b>();
  for (const w of works) {
    const r = w.parts.works_repairs_if.value, R0 = w.parts.works_if_replacement.value;
    if (r === null || R0 === null) continue;
    if (R0 === 0) { out.set(w.id, { capital: false, words: 's.33B: no cost to replace the integral features is given. So the repairs stay repairs. Check it.' }); continue; }
    const m = monthOf(w.date);
    const within = works.filter((x) => x.parts.works_repairs_if.value !== null && (x.id === w.id || (m !== null && monthOf(x.date) !== null && Math.abs((monthOf(x.date) as number) - m) <= 11)));
    const total = within.reduce((a, x) => a + (x.parts.works_repairs_if.value as number), 0);
    const capital = total * 2 > R0;
    out.set(w.id, { capital, words: capital
      ? `s.33B: ${poundsWords(total)} on integral features within twelve months${within.length > 1 ? ` (across ${String(within.length)} pieces of work)` : ''} is more than half of ${poundsWords(R0)}, what replacing them would cost. So this work’s ${poundsWords(r)} of it is capital, in the special rate pool, not a repair.`
      : `s.33B: ${poundsWords(total)} on integral features within twelve months is not more than half of ${poundsWords(R0)}, what replacing them would cost. So the repairs stay repairs.` });
  }
  return out;
}

/** PHASE 159k: a work with a repair part whose s.33B parts are not given says so (while the reading is on). */
function s33Unchecked(on: boolean, w: WorksInputs, parts: Readonly<Record<WorksPartField, Valued>>): string | null {
  if (!on || (w.works_repairs.value ?? 0) === 0) return null;
  if (parts.works_repairs_if.value !== null && parts.works_if_replacement.value !== null) return null;
  return 's.33B not checked: give how much of the repairs was on integral features, and what replacing them would cost. Until then the repairs stay repairs.';
}

/** PHASE 153e (Word question 133): the share of the floor area used when no floor plans give the shared areas. */
export const SHARED_FALLBACK_BP = 2500;
export const SHARED_FALLBACK_WORDS = 'Fallback: a flat 25% of the floor area. A test default, not yet checked by a surveyor';

export function packView(d: PackDeps, actor: Actor, job_id: string): PackView {
  const { job, obj } = packJob(d.db, actor, job_id);
  const pack = d.db.get<{ id: string; property_id: string | null }>('SELECT id, property_id FROM survey_packs WHERE job_id = ?', [job.id]);
  const { property, choices } = propertyOf(d.db, job, pack?.property_id);
  const entries = pack === undefined ? [] : d.db.all<EntryRow>(
    'SELECT e.id, e.seq, e.line_key, e.field, e.value, e.pool, e.by_user, u.display_name AS by_name, e.reason, e.at, e.rate_basis, e.rate_ref, e.rate_priced_at ' +
      'FROM survey_pack_entries e JOIN users u ON u.id = e.by_user WHERE e.pack_id = ? ORDER BY e.seq ASC', [pack.id]);
  const latest = new Map<string, EntryRow>();
  for (const e of entries) latest.set(`${e.line_key ?? ''}|${e.field}`, e);
  const last = (line: string | null, field: PackField): EntryRow | undefined => latest.get(`${line ?? ''}|${field}`);

  /** The surveyor's value where their newest entry has one; else the draft. */
  const resolve = (line: string | null, field: PackField, draft: Valued): Valued => {
    const e = last(line, field);
    return e !== undefined && e.value !== null ? { value: e.value, source: surveyorSource(e) } : draft;
  };

  const ev = evidenceInputs(d.db, job.business_id, property);
  const none: Valued = { value: null, source: null };
  // PHASE 159f: BCIS's drafts, at the purchase date, for the pack's chosen location (src/web/bcis-data.ts).
  const acq = property === null ? null : acquisitionDateReading(d.db, property.id);
  const purchase = acq !== null && acq.known && typeof acq.value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(acq.value) ? acq.value.slice(0, 10) : null;
  const locEntry = last(null, 'location');
  /* PHASE 159g (item 7, carried from 159f): THE LOCATION FROM THE PROPERTY'S COUNCIL AREA. Until the surveyor chooses
     (an entry, the UK mean included), the drafts are read at the property's council area where the loaded BCIS table
     names it. The surveyor's choice always wins. */
  const council = locEntry !== undefined || property === null ? null : councilAreaOf(d.db, property.id);
  const fromCouncil = council === null ? null : bcisLocationNamed(council.area);
  const area = locEntry !== undefined ? (locEntry.value !== null ? locEntry.rate_ref : null) : fromCouncil;
  const location_from: Pricing['location_from'] = locEntry !== undefined && locEntry.value !== null ? 'SURVEYOR' : locEntry === undefined && fromCouncil !== null ? 'COUNCIL' : null;
  const bcis = bcisDrafts({ sector: job.sector, area, purchase, lineIds: linesForSector(job.sector).map((t) => t.element_id) });
  const draftOf = (x: { value: number; basis: RateBasis; text: string } | null | undefined): Valued =>
    x === null || x === undefined ? none : { value: x.value, source: { kind: 'DRAFT', text: x.text, basis: x.basis } };
  let inputs: PackInputs = {
    price_paid_pence: resolve(null, 'price_paid', ev.price),
    land_pence: resolve(null, 'land', none),
    gia_milli_m2: resolve(null, 'gia', ev.gia),
    building_rate_pence: resolve(null, 'building_rate', draftOf(bcis.building_rate)),
  };

  // PHASE 153e (Word question 133): the common parts, by floor area from the floor plans, or the labelled 25% fallback.
  const shared_area = resolve(null, 'shared_area', none);
  const sharedDraft: Valued = shared_area.value !== null
    ? { value: shared_area.value, source: { kind: 'SURVEYOR', text: 'The shared areas from the floor plans (chapter 9)', by_name: shared_area.source?.by_name ?? null, at: shared_area.source?.at ?? null } }
    : inputs.gia_milli_m2.value !== null
      ? { value: Math.round((inputs.gia_milli_m2.value * SHARED_FALLBACK_BP) / 10000), source: { kind: 'DRAFT', text: SHARED_FALLBACK_WORDS } }
      : none;

  const lineFrom = (id: string, label: string, unit: string, t: LineTemplate | null, added: ViewLine['added']): ViewLine => {
    const qtyDraft: Valued = t === null ? none
      // A whole-building system follows the pack's floor area, whoever gave it (the certificate, or the surveyor in
      // chapter 9). Its source says so, and carries no reason: it is not a change made on this line.
      : t.qty_from.kind === 'GIA' ? (inputs.gia_milli_m2.value === null ? none : { value: inputs.gia_milli_m2.value, source: {
        kind: inputs.gia_milli_m2.source?.kind ?? 'EVIDENCE', text: 'The floor area (chapter 9)',
        by_name: inputs.gia_milli_m2.source?.by_name ?? null, at: inputs.gia_milli_m2.source?.at ?? null } })
      : t.qty_from.kind === 'ROOMS' ? roomDraft(d.db, job.id, t.qty_from.rooms)
      : t.qty_from.kind === 'SHARED' ? sharedDraft
      : none;
    const draftSrc = (what: string): Source | null => t === null ? null : { kind: 'DRAFT', text: `Fixture list ${t.element_id}${t.authority === '' ? '' : ` — ${t.authority}`}${what}` };
    const poolEntry = last(id, 'pool');
    const pool: Pool | null = poolEntry !== undefined && poolEntry.pool !== null ? poolEntry.pool : t?.pool ?? null;
    const pool_source: Source | null = poolEntry !== undefined && poolEntry.pool !== null ? surveyorSource(poolEntry) : t?.pool !== null && t !== null ? draftSrc('') : null;
    const rem = last(id, 'removed');
    return {
      id, label, element_id: t?.element_id ?? null, unit, pool, pool_source,
      qty_milli: resolve(id, 'qty', qtyDraft),
      rate_pence: resolve(id, 'rate', t === null ? none : draftOf(bcis.lines.get(t.element_id))),
      qpct_bp: resolve(id, 'qpct', t === null || t.qpct_bp === null ? none : { value: t.qpct_bp, source: draftSrc('') }),
      removed: rem !== undefined && rem.value === 1,
      removed_source: rem === undefined ? null : surveyorSource(rem),
      template: t, added,
    };
  };

  let lines: ViewLine[] = linesForSector(job.sector).map((t) => lineFrom(t.element_id, t.label, t.unit, t, null));
  if (pack !== undefined) {
    for (const a of d.db.all<{ id: string; label: string; unit: string; by_name: string; added_at: string; reason: string }>(
      'SELECT a.id, a.label, a.unit, u.display_name AS by_name, a.added_at, a.reason FROM survey_pack_added_lines a JOIN users u ON u.id = a.added_by WHERE a.pack_id = ? ORDER BY a.added_at ASC, a.id ASC',
      [pack.id])) {
      lines.push(lineFrom(a.id, a.label, a.unit, null, { by_name: a.by_name, at: a.added_at, reason: a.reason }));
    }
  }

  /* PHASE 159f (C19): EVERY RATE AT ONE DAY. The share is the qualifying parts' rebuild cost over the whole building's,
     so the two must be priced at the same day or the arithmetic does not match the words. Every sourced rate priced at a
     day other than the purchase date is brought to it by the index; one that cannot be (no index, or no purchase date)
     stays at its own day and is listed, and the pack is not approved while its rates sit at more than one day. */
  const at: { label: string; day: string }[] = [];
  const mixed: string[] = [];
  const unsourced: string[] = [];
  const atPurchase = (label: string, v: Valued, counted: boolean): Valued => {
    if (v.value === null || !counted) return v;
    const b = v.source?.basis ?? null;
    if (b === null || b === undefined) { unsourced.push(label); return v; }
    if (b.priced_at === null) { at.push({ label, day: 'not known' }); return v; }
    if (purchase === null || b.priced_at === purchase) { at.push({ label, day: b.priced_at }); return v; }
    const ix = indexBetween(b.priced_at, purchase);
    if (ix.factor === null) { at.push({ label, day: b.priced_at }); return v; }
    at.push({ label, day: purchase });
    return { value: Math.round(v.value * ix.factor), source: { ...(v.source as Source),
      text: `${v.source?.text ?? ''} — ${(v.value / 100).toFixed(2)} priced at ${b.priced_at}, brought to the purchase date ${purchase} by the index (×${ix.factor.toFixed(4)})`,
      basis: { ...b, priced_at: purchase, index: { factor: ix.factor, from: b.priced_at, to: purchase } } } };
  };
  inputs = { ...inputs, building_rate_pence: atPurchase('The whole-building rate', inputs.building_rate_pence, true) };
  lines = lines.map((l) => (l.removed || l.qty_milli.value === 0 ? l : { ...l, rate_pence: atPurchase(l.label, l.rate_pence, true) }));
  const days = new Set(at.map((x) => x.day));
  if (days.size > 1) for (const x of at) mixed.push(`${x.label}: ${x.day}`);

  const labelOf = new Map(lines.map((l) => [l.id, l.label] as const));
  // PHASE 159c: a works value's line is the event; it is named by its kind and date.
  for (const e of eventsOfProperty(d.db, property?.id ?? null)) labelOf.set(e.id, `${KIND_WORDS[e.kind]}, ${dateWords(e.event_date)}`);
  const changes: Change[] = [...entries].reverse().map((e) => ({
    seq: e.seq, at: e.at, by_name: e.by_name, reason: e.reason, line_key: e.line_key,
    line_label: e.line_key === null ? null : labelOf.get(e.line_key) ?? null, field: e.field,
    words: e.field === 'removed' ? (e.value === 1 ? 'took the line out' : 'put the line back')
      : e.value === null && e.pool === null ? `put our ${FIELD_WORDS[e.field]} back`
      : `set the ${FIELD_WORDS[e.field]}`,
  }));

  // PHASE 153a — the claim's grants come off the sums here, so every total, the legal check, approval and the report
  // read the figure after them. With no grant on the claim the sums are exactly packSums's.
  // PHASE 159i: the money readings (on in test, money-readings.ts) choose the grant routes too: traced grants off their
  // items, an untraced one off in full.
  const money = d.money ?? moneyReadingsHere();
  const switches = d.grantSwitches ?? (money.grant_untraced_full ? { ...shippedGrantSwitches(), element_trace: true, untraced_full: true } : shippedGrantSwitches());
  const allGrants = job.claim_id === null ? [] : packGrantsFor(d.db, job.claim_id);
  // PHASE 159i (item 4): a grant recorded against a piece of work comes off that work, below; the rest are the purchase's.
  const eventsHere = eventsOfProperty(d.db, property?.id ?? null);
  const worksIds = new Set(worksEvents(eventsHere).map((e) => e.id));
  const onClaim = allGrants.filter((g) => g.event_id === null || g.event_id === undefined || !worksIds.has(g.event_id));
  const facts = job.claim_id === null ? new Map() : latestFacts(d.db, job.claim_id);
  const pence = (k: string): number => { const r = facts.get(k); return r !== undefined && r.answer === 'VALUE' && typeof r.value_pence === 'number' && r.value_pence > 0 ? r.value_pence : 0; };
  const yes = (k: string): boolean => { const r = facts.get(k); return r !== undefined && r.answer === 'VALUE' && r.value_text === 'YES'; };
  // PHASE 153e: VAT the client could not reclaim is part of the price that is shared out (Module 00 C23). The price
  // shown stays the price paid; the sums read it with the counted VAT added.
  const vat = vatReading(resolve(null, 'vat_position', none), resolve(null, 'vat', none));
  /* PHASE 159i (item 3, OUR READINGS, on in test): the stamp duty or land transaction tax paid (#11) and the legal and
     other acquisition fees (#13) are part of the price shared out. And C12: that money, and the VAT, is shared between
     the land and the building in the same proportion as the price, so the land takes its part and the fixtures do not
     take all of it. Off, the VAT goes to the building alone, as before. */
  const costs = (money.transaction_tax_in_base ? pence('TRANSACTION_TAX') : 0) + (money.legal_fees_in_base ? pence('ACQUISITION_COSTS') : 0);
  const added = vat.counted_pence + costs;
  const price0 = inputs.price_paid_pence.value, land0 = inputs.land_pence.value;
  const landShare = money.vat_shared_with_land && added > 0 && price0 !== null && price0 > 0 && land0 !== null && land0 > 0
    ? Number(mulDivRound(BigInt(land0), BigInt(added), BigInt(price0))) : 0;
  const forSums: PackInputs = added > 0 && price0 !== null
    ? { ...inputs, price_paid_pence: { value: price0 + added, source: inputs.price_paid_pence.source },
        ...(landShare > 0 && land0 !== null ? { land_pence: { value: land0 + landShare, source: inputs.land_pence.source } } : {}) }
    : inputs;
  const before = packSums(forSums, lines);
  const graded = applyGrants(forSums, lines, before, onClaim, switches);
  /* PHASE 159i (item 3, s.185 plus own s.25, #1, on in test): the buyer's own alterations to install plant are its own
     spend under s.25, claimed in the main pool on top of whatever caps the price's share. Only on a recorded yes with an
     amount. */
  const alterations = money.s185_plus_own_s25 && yes('BUYER_ALTERATIONS') ? pence('BUYER_ALTERATIONS_AMOUNT') : 0;
  const reading: GrantReading = alterations > 0 && graded.sums.complete && graded.sums.qualifying_pence !== null && graded.sums.main_pool_pence !== null
    ? { ...graded, sums: { ...graded.sums, qualifying_pence: graded.sums.qualifying_pence + alterations, main_pool_pence: graded.sums.main_pool_pence + alterations } }
    : graded;
  const cgs = pence('VAT_CGS_ADJUSTMENT');
  const moneyWords: string[] = [];
  if (costs > 0) moneyWords.push(`Stamp duty and purchase fees of £${(costs / 100).toLocaleString('en-GB')} are added to the price shared out.`);
  if (landShare > 0) moneyWords.push(`The land takes its share of the VAT and those costs, £${(landShare / 100).toLocaleString('en-GB')}, in the same proportion as the price.`);
  if (alterations > 0) moneyWords.push(`The buyer’s own alterations to install plant, £${(alterations / 100).toLocaleString('en-GB')}, are claimed on top, in the main pool (s.25).`);
  if (cgs > 0) moneyWords.push(`A VAT capital goods scheme adjustment of £${(cgs / 100).toLocaleString('en-GB')} is recorded. It is a note: it does not change the figure until the tax adviser says how it counts.`);
  const moneyView: PackMoney = { readings: money, costs_pence: costs, land_share_pence: landShare, alterations_pence: alterations, cgs_pence: cgs > 0 ? cgs : null, words: moneyWords };
  const grants: PackGrants = {
    claim_id: job.claim_id, switches, reading,
    amounts_shown: actor.role !== 'SURVEYING' || GRANT_AMOUNTS_TO_SURVEYOR,
    list: onClaim.map((g) => ({ id: g.id, kind: g.kind, payer_class: g.payer_class, amount_pence: g.amount_pence, traced: g.traced,
      element_ids: g.element_ids, element_names: g.element_ids.map(elementName) })),
  };

  // PHASE 159f (item 6): section 562 the other way, beside the proportional sum the report uses. The building's own
  // rebuild cost (the whole less the parts that qualify) comes off the price first; the fixtures take what is left, never
  // more than their own rebuild cost nor the price. Shown to the surveyor; which one is used is put to the tax adviser.
  const ps = reading.sums;
  const residual: Pricing['residual'] = !ps.complete || ps.building_price_pence === null || ps.rebuild_pence === null || ps.elements_qualifying_pence === null
    ? { qualifying_pence: null, words: 'Not worked out until the sums are complete.' }
    : (() => {
      const shell = ps.rebuild_pence - ps.elements_qualifying_pence;
      const q = Math.max(0, Math.min(ps.building_price_pence, ps.elements_qualifying_pence, ps.building_price_pence - shell));
      return { qualifying_pence: q, words: `The residual way: the building less its own rebuild cost (${(shell / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}) leaves ${(q / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })} for the fixtures. The proportional way, which the report uses, gives ${((ps.qualifying_pence ?? 0) / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}. Which is used is a question for the surveyor and the tax adviser.` };
    })();
  const pricing: Pricing = { bcis, priced_at: days.size === 1 ? [...days][0] ?? null : null, purchase, mixed, unsourced, residual, location_from };
  // PHASE 159g: what the registers already say, for chapter 9 — shown, never counted.
  const leads: RegisterLeads = property === null ? { price_paid: null, site_area: null, tenure: 'No property is chosen for this pack.' } : {
    price_paid: pricePaidSale(d.db, job.business_id, property.id)?.words ?? null,
    site_area: siteAreaFlag(siteAreaOf(d.db, job.business_id, property.id), inputs.gia_milli_m2.value === null ? floorAreaForSite(d.db, job.business_id, property.id) : inputs.gia_milli_m2.value / 1000),
    tenure: propertyTenure(d.db, property.id).words,
  };

  const cost: CostValues = {
    valuation_date: resolve(null, 'valuation_date', none), insurance: resolve(null, 'insurance', none),
    insurance_date: resolve(null, 'insurance_date', none), insurance_includes: resolve(null, 'insurance_includes', none),
    rebuild_includes: resolve(null, 'rebuild_includes', none),
  };

  // PHASE 159c: each piece of work on the building, on its own cost. The final account is drafted from what the client
  // said it cost, as evidence of their word; every part of it is the surveyor's, from the final account itself.
  const events = eventsOfProperty(d.db, property?.id ?? null);
  const applies = purchaseApplies(events);
  const worksBase = worksEvents(events).map((e) => {
    const label = `${KIND_WORDS[e.kind]}, ${dateWords(e.event_date)}`;
    const draft = (f: WorksField): Valued => f === 'works_total' && e.cost_pence !== null
      ? { value: e.cost_pence, source: { kind: 'EVIDENCE', text: e.source === 'ASSESSMENT' ? 'What the client said it cost, at the assessment' : 'What the claim records it cost' } }
      : none;
    const winputs = Object.fromEntries(WORKS_FIELDS.map((f) => [f, resolve(e.id, f, draft(f))])) as unknown as WorksInputs;
    // PHASE 159k (item 2): the readings' parts, each optional; a part more than its whole stops the work's total.
    const parts = Object.fromEntries(WORKS_PART_FIELDS.map((f) => [f, resolve(e.id, f, none)])) as unknown as Record<WorksPartField, Valued>;
    const raw = worksSums(e.id, label, winputs);
    const tooBig = worksPartProblems(label, winputs, parts);
    const base: WorksSums = tooBig.length === 0 ? raw : { ...raw, qualifying_pence: null, main_pool_pence: null, special_pool_pence: null, repairs_pence: null, problems: [...raw.problems, ...tooBig], complete: false };
    return { e, label, winputs, parts, base };
  });
  const s33 = money.s33b_aggregation ? s33bDecisions(worksBase.map((w) => ({ id: w.e.id, date: w.e.event_date, parts: w.parts }))) : new Map<string, S33b>();
  const works: WorksView[] = worksBase.map(({ e, label, winputs, parts, base }) => {
    // PHASE 159i (item 4): this work's own grants (the client's, recorded against it) and its irrecoverable VAT.
    const own = allGrants.filter((g) => g.event_id === e.id && g.paid_to !== 'PAST_OWNER' && payerReduces(g.payer_class, switches).reduces).map((g) => g.amount_pence);
    // PHASE 159k (item 2, s.33B): repairs on integral features made capital go to the special rate pool, before VAT and grants.
    const d33 = s33.get(e.id) ?? { capital: false, words: s33Unchecked(money.s33b_aggregation, winputs, parts) };
    const capital = d33.capital && base.complete && base.direct_pence !== null && base.oncost_pence !== null && parts.works_repairs_if.value !== null
      ? parts.works_repairs_if.value + Number(mulDivRound(BigInt(base.oncost_pence), BigInt(parts.works_repairs_if.value), BigInt(base.direct_pence))) : 0;
    const moved: WorksSums = capital > 0 && base.qualifying_pence !== null && base.special_pool_pence !== null && base.repairs_pence !== null
      ? { ...base, qualifying_pence: base.qualifying_pence + capital, special_pool_pence: base.special_pool_pence + capital, repairs_pence: Math.max(0, base.repairs_pence - capital) }
      : base;
    const sums = adjustWorks(moved, e.vat_pence, own, winputs.works_total.value);
    const ll = parts.works_long_life.value, main = winputs.works_main.value;
    const long_life_pence = ll === null || main === null || sums.main_pool_pence === null ? null
      : main === 0 ? 0 : Number(mulDivRound(BigInt(sums.main_pool_pence), BigInt(Math.min(ll, main)), BigInt(main)));
    const asb = parts.works_asbestos.value;
    const asbestos_pence = asb === null || base.direct_pence === null || base.oncost_pence === null || base.direct_pence === 0 ? null
      : asb + Number(mulDivRound(BigInt(base.oncost_pence), BigInt(asb), BigInt(base.direct_pence)));
    return { event: e, label, inputs: winputs, sums, parts, s33b: { capital_pence: capital, words: d33.words }, long_life_pence, asbestos_pence };
  });

  // PHASE 159d (item 8): the legal check is the purchase's. Failed, with work since, it stops the purchase only.
  const purchaseW3 = applies && works.length > 0 && legalVerdictForJob(d.db, job.id, d.now())?.level === 'RED';

  return {
    job, pack_id: pack?.id ?? null, property, property_choices: choices,
    inputs, lines, sums: combined(reading.sums, applies && !purchaseW3, works, onClaim.filter((g) => g.paid_to !== 'PAST_OWNER' && (g.event_id === null || g.event_id === undefined)).length), grants, vat, shared_area, cost,
    events, purchase_applies: applies, purchase_sums: reading.sums, works, purchase_w3: purchaseW3, pricing, money: moneyView, leads,
    long_life: resolve(null, 'long_life', none),
    seq: entries.length === 0 ? 0 : (entries[entries.length - 1] as EntryRow).seq,
    may_edit: can(actor, 'surveyor_job.commit', obj),
    changes,
  };
}

/* ================================================================== *
 * CHANGING IT — every change the surveyor's, with a reason
 * ================================================================== */

type Ready = { view: PackView; pack_id: string };

/**
 * The checks every change makes, in one transaction with the write: the rule, a reason, the property known, and the
 * page not out of date. Returns the pack's id (making the pack on its first change).
 */
function begin(d: PackDeps, actor: Actor, job_id: string, reason: string, expectSeq: string, write: (r: Ready) => PackResult): PackResult {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  const why = reason.trim();
  if (why === '') return { ok: false, field: 'reason', why: 'Say why. Your reason is kept with your change, under your name.' };
  if (why.length > 500) return { ok: false, field: 'reason', why: 'Keep the reason under 500 characters.' };
  if (!/^\d{1,9}$/.test(expectSeq.trim())) return { ok: false, stale: true, why: 'This page is out of date. It is shown again; make your change again.' };
  return d.db.tx(() => {
    const view = packView(d, actor, job_id);
    if (view.seq !== Number(expectSeq.trim())) {
      return { ok: false, stale: true, why: 'This pack changed since you opened it. It is shown again with that change; make yours again if it still applies.' };
    }
    if (view.property === null) return { ok: false, field: 'property_id', why: 'Say which property this pack is for first.' };
    let pack_id = view.pack_id;
    if (pack_id === null) {
      pack_id = d.newId();
      d.db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
        [pack_id, view.job.id, view.property.id, d.now(), actor.id]);
    }
    return write({ view, pack_id });
  });
}

/** PHASE 153g: the same guard for the surveyor's own words (src/web/pack-words.ts): who may, the reason, a page out of date. */
export const beginPackChange = begin;

function insertEntry(d: PackDeps, actor: Actor, pack_id: string, line_key: string | null, field: PackField, value: number | null, pool: Pool | null, reason: string,
  src: { basis: string | null; ref: string | null; priced_at: string | null } = { basis: null, ref: null, priced_at: null }): void {
  d.db.run(
    'INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_basis, rate_ref, rate_priced_at) ' +
      'SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM survey_pack_entries WHERE pack_id = ?',
    [d.newId(), pack_id, line_key, field, value, pool, actor.id, reason.trim(), d.now(), src.basis, src.ref, src.priced_at, pack_id]);
}

/** PHASE 159f: the sources a surveyor may give a rate they type (BCIS's own drafts carry theirs). */
export const RATE_BASES = Object.freeze(['BCIS', 'QS_SCHEDULE', 'CONTRACTOR_INVOICE', 'PRICE_BOOK'] as const);
export type RateSourceForm = { rate_basis?: string; rate_ref?: string; rate_priced_at?: string };

/** A typed rate's source: all three, or none (then the rate has no source, and the pack is not approved with it). */
function parseRateSource(f: RateSourceForm): { ok: true; src: { basis: string | null; ref: string | null; priced_at: string | null } } | { ok: false; why: string; field: string } {
  const basis = (f.rate_basis ?? '').trim(), ref = (f.rate_ref ?? '').replace(/\s+/g, ' ').trim(), at = (f.rate_priced_at ?? '').trim();
  if (basis === '' && ref === '' && at === '') return { ok: true, src: { basis: null, ref: null, priced_at: null } };
  if (!(RATE_BASES as readonly string[]).includes(basis)) return { ok: false, field: 'rate_basis', why: 'Say where the rate comes from: BCIS, a quantity surveyor’s priced schedule, the contractor’s invoice, or a price book.' };
  if (ref === '') return { ok: false, field: 'rate_ref', why: 'Say which one: the BCIS reference, the schedule’s item, the invoice number or the price book’s page.' };
  if (ref.length > 200) return { ok: false, field: 'rate_ref', why: 'Keep the reference under 200 characters.' };
  const d = parsePackDate(at);
  if (!d.ok) return { ok: false, field: 'rate_priced_at', why: `The day the rate is priced at: ${d.why}` };
  return { ok: true, src: { basis, ref, priced_at: packDateIso(d.value) } };
}

function audit(d: PackDeps, actor: Actor, view: PackView, what: string, line: string | null, fields: readonly string[]): void {
  d.audit.append({ at: d.now(), kind: 'SURVEY_PACK_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'surveyor_job', object_id: view.job.id, detail: { what, line: line ?? '', fields: fields.join(',') } });
}

const PARSE: Readonly<Record<PackInputField, (raw: string) => ReturnType<typeof parseMoney>>> = Object.freeze({
  price_paid: parseMoney, land: parseMoney, gia: parseQuantity, building_rate: parseRate,
});

/** One of the four values that belong to the whole pack. Empty: our draft (or the evidence) again. */
export function savePackValue(d: PackDeps, actor: Actor, job_id: string, f: { field: string; value: string; reason: string; seq: string } & RateSourceForm): PackResult {
  const field = PACK_INPUT_FIELDS.find((x) => x === f.field);
  if (field === undefined) return { ok: false, field: 'field', why: 'That is not one of the pack’s values.' };
  const rs = parseRateSource(f);
  if (!rs.ok) return { ok: false, why: rs.why, field: rs.field };
  if (rs.src.basis !== null && (field !== 'building_rate' || f.value.trim() === '')) return { ok: false, field: 'rate_basis', why: 'A source goes with a rate you type. Leave it empty here.' };
  const raw = f.value.trim();
  let value: number | null = null;
  if (raw !== '') {
    const p = PARSE[field](raw);
    if (!p.ok) return { ok: false, field: 'value', why: p.why };
    value = p.value;
  }
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const now = view.inputs[INPUT_SUM_KEY[field]];
    const isMine = isEntry(now.source);
    if (value === null && !isMine) return { ok: false, field: 'value', why: 'Type a value. (An empty box puts our figure back, and this one is not yours to put back.)' };
    const sameSource = now.source?.basis?.ref === (rs.src.ref ?? undefined);
    if (value !== null && isMine && now.value === value && sameSource) return { ok: false, field: 'value', why: 'That is already the value. Nothing changed.' };
    insertEntry(d, actor, pack_id, null, field, value, null, f.reason, rs.src);
    audit(d, actor, view, 'value', null, [field]);
    return { ok: true };
  });
}

/**
 * PHASE 159f: THE PACK'S BCIS LOCATION — the area the location factor is read for, as the loaded location table names
 * it. Empty puts the UK mean back. The surveyor's, with a reason. The factor is kept with it, so the version says what
 * was used even if the table is imported again.
 */
export function savePackLocation(d: PackDeps, actor: Actor, job_id: string, f: { area: string; reason: string; seq: string }): PackResult {
  const want = f.area.replace(/\s+/g, ' ').trim();
  const here = bcisDataHere();
  if (want !== '' && here.data === null) return { ok: false, field: 'area', why: `There is no BCIS location table to choose from: ${here.why}.` };
  const loc = want === '' || here.data === null ? null : here.data.locations.find((l) => l.area.toLowerCase() === want.toLowerCase()) ?? null;
  if (want !== '' && loc === null) return { ok: false, field: 'area', why: 'That area is not in the BCIS location table. Choose one from the list.' };
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const now = view.pricing.bcis.location.area;
    if ((loc?.area ?? null) === now) return { ok: false, field: 'area', why: 'That is already the location. Nothing changed.' };
    d.db.run(
      'INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_ref) ' +
        "SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, NULL, 'location', ?, NULL, ?, ?, ?, ? FROM survey_pack_entries WHERE pack_id = ?",
      [d.newId(), pack_id, loc === null ? null : Math.round(loc.factor * 1000), actor.id, f.reason.trim(), d.now(), loc?.area ?? null, pack_id]);
    audit(d, actor, view, 'location', null, ['location']);
    return { ok: true };
  });
}

/**
 * PHASE 153e — THE PACK'S EXTRA VALUES: chapter 15's VAT position (one of four) and the amount not reclaimed, and
 * supported living's shared areas from the floor plans. Each the surveyor's, with a reason. Empty: back to not recorded.
 */
export function savePackExtra(d: PackDeps, actor: Actor, job_id: string, f: { field: string; value: string; reason: string; seq: string }): PackResult {
  const cost = COST_FIELDS.find((x) => x === f.field);
  if (cost !== undefined) return saveCostValue(d, actor, job_id, cost, f);
  if (f.field !== 'vat_position' && f.field !== 'vat' && f.field !== 'shared_area' && f.field !== 'long_life') return { ok: false, field: 'field', why: 'That is not one of the pack’s values.' };
  const field: PackField = f.field;
  const raw = f.value.trim();
  let value: number | null = null;
  if (raw !== '') {
    if (field === 'vat_position') {
      const i = VAT_POSITION_CODES.indexOf(raw as (typeof VAT_POSITION_CODES)[number]);
      if (i < 0) return { ok: false, field: 'value', why: 'Choose one of the four answers.' };
      value = i;
    } else {
      const p = field === 'shared_area' ? parseQuantity(raw) : parseMoney(raw);
      if (!p.ok) return { ok: false, field: 'value', why: p.why };
      value = p.value;
    }
  }
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const now = field === 'vat_position' ? view.vat.position_source : field === 'vat' ? view.vat.amount_source : field === 'long_life' ? view.long_life.source : view.shared_area.source;
    const was = field === 'vat_position' ? (view.vat.position_source === null ? null : VAT_POSITION_CODES.indexOf(view.vat.position))
      : field === 'vat' ? view.vat.amount_pence : field === 'long_life' ? view.long_life.value : view.shared_area.value;
    if (value === null && now === null) return { ok: false, field: 'value', why: 'Nothing is recorded yet, so there is nothing to clear.' };
    if (value !== null && now !== null && was === value) return { ok: false, field: 'value', why: 'That is already the value. Nothing changed.' };
    insertEntry(d, actor, pack_id, null, field, value, null, f.reason);
    audit(d, actor, view, 'value', null, [field]);
    return { ok: true };
  });
}

/** A date typed as 2026-10-06 (the date box's own form), kept as 20261006; a date that does not exist is refused. */
export function parsePackDate(raw: string): { ok: true; value: number } | { ok: false; why: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (m === null) return { ok: false, why: 'Give the date as day, month and year.' };
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, da));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return { ok: false, why: 'That date does not exist.' };
  if (y < 1900 || y > 2100) return { ok: false, why: 'Give a date between 1900 and 2100.' };
  return { ok: true, value: y * 10000 + mo * 100 + da };
}

/** 20261006 as 2026-10-06, for the cost model and the date box; null for nothing. */
export function packDateIso(v: number | null): string | null {
  if (v === null) return null;
  const s = String(v);
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

/** PHASE 157a: one of the cost model's five values (COST_FIELDS). Empty: back to not recorded. */
function saveCostValue(d: PackDeps, actor: Actor, job_id: string, field: CostField, f: { value: string; reason: string; seq: string }): PackResult {
  const raw = f.value.trim();
  let value: number | null = null;
  if (raw !== '') {
    if (field === 'valuation_date' || field === 'insurance_date') {
      const p = parsePackDate(raw);
      if (!p.ok) return { ok: false, field: 'value', why: p.why };
      value = p.value;
    } else if (field === 'insurance') {
      const p = parseMoney(raw);
      if (!p.ok) return { ok: false, field: 'value', why: p.why };
      if (p.value === 0) return { ok: false, field: 'value', why: 'An insurance figure of nothing cannot be compared. Leave it empty if there is none.' };
      value = p.value;
    } else {
      if (!/^[0-7]$/.test(raw)) return { ok: false, field: 'value', why: 'Choose one of the answers.' };
      value = Number(raw);
    }
  }
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const now = view.cost[field];
    if (value === null && now.source === null) return { ok: false, field: 'value', why: 'Nothing is recorded yet, so there is nothing to clear.' };
    if (value !== null && now.source !== null && now.value === value) return { ok: false, field: 'value', why: 'That is already the value. Nothing changed.' };
    insertEntry(d, actor, pack_id, null, field, value, null, f.reason);
    audit(d, actor, view, 'value', null, [field]);
    return { ok: true };
  });
}

/**
 * PHASE 159c: A PIECE OF WORK'S COST-LED VALUES, from its final account. Only what differs from the value as it stands
 * is written, each as its own entry under the one reason. An empty box leaves that value as it is.
 */
export function saveWorks(d: PackDeps, actor: Actor, job_id: string, f: { event: string; values: Readonly<Partial<Record<WorksField | WorksPartField, string>>>; reason: string; seq: string }): PackResult {
  const parsed: Partial<Record<WorksField | WorksPartField, number>> = {};
  // PHASE 159k (item 2): the readings' parts are saved the same way, each with the one reason.
  for (const k of [...WORKS_FIELDS, ...WORKS_PART_FIELDS]) {
    const raw = (f.values[k] ?? '').trim();
    if (raw === '') continue;
    const p = parseMoney(raw);
    if (!p.ok) return { ok: false, field: k, why: p.why };
    parsed[k] = p.value;
  }
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const w = view.works.find((x) => x.event.id === f.event);
    if (w === undefined) return { ok: false, field: 'event', why: 'That work is not on this building.' };
    const changed: string[] = [];
    for (const k of [...WORKS_FIELDS, ...WORKS_PART_FIELDS]) {
      const v = parsed[k];
      if (v === undefined) continue;
      const now = (WORKS_FIELDS as readonly string[]).includes(k) ? w.inputs[k as WorksField] : w.parts[k as WorksPartField];
      if (now.value === v && isEntry(now.source)) continue;
      insertEntry(d, actor, pack_id, w.event.id, k, v, null, f.reason);
      changed.push(k);
    }
    if (changed.length === 0) return { ok: false, why: 'Nothing changed. Type a new value in at least one box.' };
    audit(d, actor, view, 'works', w.event.id, changed);
    return { ok: true };
  });
}

export type LineForm = { line: string; qty: string; rate: string; qpct: string; pool: string; reason: string; seq: string } & RateSourceForm;

type Parsed = { qty: number | null; rate: number | null; qpct: number | null; pool: Pool | null };
function parseLine(f: Omit<LineForm, 'line' | 'reason' | 'seq'>): { ok: true; v: Parsed } | { ok: false; why: string; field: string } {
  const out: Parsed = { qty: null, rate: null, qpct: null, pool: null };
  if (f.qty.trim() !== '') { const p = parseQuantity(f.qty); if (!p.ok) return { ok: false, why: p.why, field: 'qty' }; out.qty = p.value; }
  if (f.rate.trim() !== '') { const p = parseRate(f.rate); if (!p.ok) return { ok: false, why: p.why, field: 'rate' }; out.rate = p.value; }
  if (f.qpct.trim() !== '') { const p = parsePercent(f.qpct); if (!p.ok) return { ok: false, why: p.why, field: 'qpct' }; out.qpct = p.value; }
  const pool = f.pool.trim();
  if (pool !== '') { if (pool !== 'MP' && pool !== 'SR') return { ok: false, why: 'Choose the main pool or the special rate pool.', field: 'pool' }; out.pool = pool; }
  return { ok: true, v: out };
}

/**
 * Change a line: how much, the rate, the share that qualifies, the pool. Only what differs from the line as it stands
 * is written — each as its own entry under the one reason. An empty box leaves that value as it is.
 */
export function saveLine(d: PackDeps, actor: Actor, job_id: string, f: LineForm): PackResult {
  const p = parseLine(f);
  if (!p.ok) return { ok: false, why: p.why, field: p.field };
  // PHASE 159f: a rate typed with its source; a source with no rate typed is refused, so nothing is half-said.
  const rs = parseRateSource(f);
  if (!rs.ok) return { ok: false, why: rs.why, field: rs.field };
  if (rs.src.basis !== null && p.v.rate === null) return { ok: false, field: 'rate', why: 'Type the rate the source is for.' };
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const l = view.lines.find((x) => x.id === f.line);
    if (l === undefined) return { ok: false, field: 'line', why: 'That line is not in this pack.' };
    if (l.removed) return { ok: false, field: 'line', why: 'That line is taken out. Put it back first.' };
    const changed: string[] = [];
    // Typing the draft's own value stamps it as theirs; typing their own value again changes nothing.
    if (p.v.qty !== null && !(l.qty_milli.value === p.v.qty && isEntry(l.qty_milli.source))) { insertEntry(d, actor, pack_id, l.id, 'qty', p.v.qty, null, f.reason); changed.push('qty'); }
    const sameSource = l.rate_pence.source?.basis?.kind === (rs.src.basis ?? undefined) && l.rate_pence.source?.basis?.ref === (rs.src.ref ?? undefined);
    if (p.v.rate !== null && !(l.rate_pence.value === p.v.rate && isEntry(l.rate_pence.source) && sameSource)) { insertEntry(d, actor, pack_id, l.id, 'rate', p.v.rate, null, f.reason, rs.src); changed.push('rate'); }
    if (p.v.qpct !== null && !(l.qpct_bp.value === p.v.qpct && isEntry(l.qpct_bp.source))) { insertEntry(d, actor, pack_id, l.id, 'qpct', p.v.qpct, null, f.reason); changed.push('qpct'); }
    if (p.v.pool !== null && !(l.pool === p.v.pool && isEntry(l.pool_source))) { insertEntry(d, actor, pack_id, l.id, 'pool', null, p.v.pool, f.reason); changed.push('pool'); }
    if (changed.length === 0) return { ok: false, why: 'Nothing changed. Type a new value in at least one box.' };
    audit(d, actor, view, 'line', l.id, changed);
    return { ok: true };
  });
}

/** Put our draft back for every value on a line the surveyor had set. */
export function revertLine(d: PackDeps, actor: Actor, job_id: string, f: { line: string; reason: string; seq: string }): PackResult {
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const l = view.lines.find((x) => x.id === f.line);
    if (l === undefined) return { ok: false, field: 'line', why: 'That line is not in this pack.' };
    if (l.template === null) return { ok: false, field: 'line', why: 'A line you added has no draft to put back. Take it out instead.' };
    const back: string[] = [];
    if (isEntry(l.qty_milli.source)) { insertEntry(d, actor, pack_id, l.id, 'qty', null, null, f.reason); back.push('qty'); }
    if (isEntry(l.rate_pence.source)) { insertEntry(d, actor, pack_id, l.id, 'rate', null, null, f.reason); back.push('rate'); }
    if (isEntry(l.qpct_bp.source)) { insertEntry(d, actor, pack_id, l.id, 'qpct', null, null, f.reason); back.push('qpct'); }
    if (isEntry(l.pool_source)) { insertEntry(d, actor, pack_id, l.id, 'pool', null, null, f.reason); back.push('pool'); }
    if (back.length === 0) return { ok: false, why: 'Nothing on this line is yours, so there is nothing to put back.' };
    audit(d, actor, view, 'revert', l.id, back);
    return { ok: true };
  });
}

/** Take a line out, or put it back. */
export function setLineRemoved(d: PackDeps, actor: Actor, job_id: string, f: { line: string; reason: string; seq: string }, removed: boolean): PackResult {
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const l = view.lines.find((x) => x.id === f.line);
    if (l === undefined) return { ok: false, field: 'line', why: 'That line is not in this pack.' };
    if (l.removed === removed) return { ok: false, why: removed ? 'That line is already taken out.' : 'That line is already in.' };
    insertEntry(d, actor, pack_id, l.id, 'removed', removed ? 1 : 0, null, f.reason);
    audit(d, actor, view, removed ? 'remove' : 'restore', l.id, ['removed']);
    return { ok: true };
  });
}

/** Add a line the fixture list does not have. */
export function addLine(d: PackDeps, actor: Actor, job_id: string, f: { label: string; unit: string; qty: string; rate: string; qpct: string; pool: string; reason: string; seq: string } & RateSourceForm): PackResult {
  const rs = parseRateSource(f);
  if (!rs.ok) return { ok: false, why: rs.why, field: rs.field };
  const label = f.label.trim().replace(/\s+/g, ' ');
  const unit = f.unit.trim().replace(/\s+/g, ' ');
  if (label === '' || label.length > 200) return { ok: false, field: 'label', why: 'Name the line, in under 200 characters.' };
  if (unit === '' || unit.length > 40) return { ok: false, field: 'unit', why: 'Say what it is counted in, for example "number" or "m²".' };
  const p = parseLine(f);
  if (!p.ok) return { ok: false, why: p.why, field: p.field };
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    if (view.lines.some((l) => !l.removed && l.label.toLowerCase() === label.toLowerCase())) {
      return { ok: false, field: 'label', why: 'The pack already has a line by that name. Change that one instead.' };
    }
    const id = `ADD-${d.newId()}`;
    d.db.run('INSERT INTO survey_pack_added_lines (id, pack_id, label, unit, added_by, added_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, pack_id, label, unit, actor.id, d.now(), f.reason.trim()]);
    if (p.v.qty !== null) insertEntry(d, actor, pack_id, id, 'qty', p.v.qty, null, f.reason);
    if (p.v.rate !== null) insertEntry(d, actor, pack_id, id, 'rate', p.v.rate, null, f.reason, rs.src);
    if (p.v.qpct !== null) insertEntry(d, actor, pack_id, id, 'qpct', p.v.qpct, null, f.reason);
    if (p.v.pool !== null) insertEntry(d, actor, pack_id, id, 'pool', null, p.v.pool, f.reason);
    // An added line with nothing typed still moves the counter, so an older page cannot miss it.
    if (p.v.qty === null && p.v.rate === null && p.v.qpct === null && p.v.pool === null) insertEntry(d, actor, pack_id, id, 'removed', 0, null, f.reason);
    audit(d, actor, view, 'add', id, ['label']);
    return { ok: true };
  });
}

/** Say which property the pack is for, where the company has several. Once said, it stays. */
export function choosePackProperty(d: PackDeps, actor: Actor, job_id: string, property_id: string): PackResult {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  return d.db.tx(() => {
    const view = packView(d, actor, job_id);
    if (view.property !== null) return { ok: false, why: 'This pack’s property is already set.' };
    const chosen = view.property_choices.find((p) => p.id === property_id);
    if (chosen === undefined) return { ok: false, field: 'property_id', why: 'Choose one of this company’s properties.' };
    if (view.pack_id === null) {
      d.db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
        [d.newId(), view.job.id, chosen.id, d.now(), actor.id]);
    } else {
      d.db.run('UPDATE survey_packs SET property_id = ? WHERE id = ? AND property_id IS NULL', [chosen.id, view.pack_id]);
    }
    d.audit.append({ at: d.now(), kind: 'SURVEY_PACK_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'surveyor_job', object_id: view.job.id, detail: { what: 'property', line: '', fields: 'property_id' } });
    return { ok: true };
  });
}
