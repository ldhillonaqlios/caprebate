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
 * (src/web/pack-sums.ts). Rates are never drafted: they are BCIS's, and until BCIS is bought they are the surveyor's.
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
  packSums, parseMoney, parsePercent, parseQuantity, parseRate, worksSums, WORKS_FIELDS,
  type PackInputs, type PackLine, type PackSums, type Pool, type Source, type Valued, type WorksField, type WorksInputs, type WorksSums,
} from './pack-sums.ts';
import { dateWords, eventsOfProperty, KIND_WORDS, purchaseApplies, worksEvents, type PropertyEvent } from './property-events.ts';
import { legalVerdictForJob } from './pack-legal.ts';
import { applyGrants, type GrantReading, type GrantSwitches } from './pack-grants.ts';
import { elementName, packGrantsFor } from './claim-facts.ts';
import { shippedGrantSwitches } from './grant-checks.ts';

/**
 * `grantSwitches` (Phase 153a) is for the tests alone: it stands in for CB_CTA's two grant switches so chapter 15 can be
 * proved both ways. Nothing in src/ or api/ passes it, so a pack always takes the switches as they ship.
 */
export type PackDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string; grantSwitches?: GrantSwitches };

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
  | CostField | WorksField;

/** PHASE 159c: one piece of work on the building, priced on its own cost (chapter 9; src/web/pack-sums.ts worksSums). */
export type WorksView = {
  readonly event: PropertyEvent;
  /** "A refurbishment or refit, June 2025". */
  readonly label: string;
  readonly inputs: WorksInputs;
  readonly sums: WorksSums;
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
  return { kind: 'SURVEYOR', text: e.by_name, by_name: e.by_name, at: e.at, reason: e.reason };
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
  if (grants > 0) problems.push({ code: 'GRANTS_ON_EVENTS', words: 'A grant is on this claim, and the building has work done since. Which spend the grant paid for is not recorded yet, so it is not taken off. There is no total until it is (Phase 159i).' });
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

/** PHASE 153e (Word question 133): the share of the floor area used when no floor plans give the shared areas. */
export const SHARED_FALLBACK_BP = 2500;
export const SHARED_FALLBACK_WORDS = 'Fallback: a flat 25% of the floor area. A test default, not yet checked by a surveyor';

export function packView(d: PackDeps, actor: Actor, job_id: string): PackView {
  const { job, obj } = packJob(d.db, actor, job_id);
  const pack = d.db.get<{ id: string; property_id: string | null }>('SELECT id, property_id FROM survey_packs WHERE job_id = ?', [job.id]);
  const { property, choices } = propertyOf(d.db, job, pack?.property_id);
  const entries = pack === undefined ? [] : d.db.all<EntryRow>(
    'SELECT e.id, e.seq, e.line_key, e.field, e.value, e.pool, e.by_user, u.display_name AS by_name, e.reason, e.at ' +
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
  const inputs: PackInputs = {
    price_paid_pence: resolve(null, 'price_paid', ev.price),
    land_pence: resolve(null, 'land', none),
    gia_milli_m2: resolve(null, 'gia', ev.gia),
    building_rate_pence: resolve(null, 'building_rate', none),
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
      rate_pence: resolve(id, 'rate', none),
      qpct_bp: resolve(id, 'qpct', t === null || t.qpct_bp === null ? none : { value: t.qpct_bp, source: draftSrc('') }),
      removed: rem !== undefined && rem.value === 1,
      removed_source: rem === undefined ? null : surveyorSource(rem),
      template: t, added,
    };
  };

  const lines: ViewLine[] = linesForSector(job.sector).map((t) => lineFrom(t.element_id, t.label, t.unit, t, null));
  if (pack !== undefined) {
    for (const a of d.db.all<{ id: string; label: string; unit: string; by_name: string; added_at: string; reason: string }>(
      'SELECT a.id, a.label, a.unit, u.display_name AS by_name, a.added_at, a.reason FROM survey_pack_added_lines a JOIN users u ON u.id = a.added_by WHERE a.pack_id = ? ORDER BY a.added_at ASC, a.id ASC',
      [pack.id])) {
      lines.push(lineFrom(a.id, a.label, a.unit, null, { by_name: a.by_name, at: a.added_at, reason: a.reason }));
    }
  }

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
  const switches = d.grantSwitches ?? shippedGrantSwitches();
  const onClaim = job.claim_id === null ? [] : packGrantsFor(d.db, job.claim_id);
  // PHASE 153e: VAT the client could not reclaim is part of the price that is shared out (Module 00 C23). The price
  // shown stays the price paid; the sums read it with the counted VAT added.
  const vat = vatReading(resolve(null, 'vat_position', none), resolve(null, 'vat', none));
  const forSums: PackInputs = vat.counted_pence > 0 && inputs.price_paid_pence.value !== null
    ? { ...inputs, price_paid_pence: { value: inputs.price_paid_pence.value + vat.counted_pence, source: inputs.price_paid_pence.source } }
    : inputs;
  const before = packSums(forSums, lines);
  const reading = applyGrants(forSums, lines, before, onClaim, switches);
  const grants: PackGrants = {
    claim_id: job.claim_id, switches, reading,
    amounts_shown: actor.role !== 'SURVEYING' || GRANT_AMOUNTS_TO_SURVEYOR,
    list: onClaim.map((g) => ({ id: g.id, kind: g.kind, payer_class: g.payer_class, amount_pence: g.amount_pence, traced: g.traced,
      element_ids: g.element_ids, element_names: g.element_ids.map(elementName) })),
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
  const works: WorksView[] = worksEvents(events).map((e) => {
    const label = `${KIND_WORDS[e.kind]}, ${dateWords(e.event_date)}`;
    const draft = (f: WorksField): Valued => f === 'works_total' && e.cost_pence !== null
      ? { value: e.cost_pence, source: { kind: 'EVIDENCE', text: e.source === 'ASSESSMENT' ? 'What the client said it cost, at the assessment' : 'What the claim records it cost' } }
      : none;
    const winputs = Object.fromEntries(WORKS_FIELDS.map((f) => [f, resolve(e.id, f, draft(f))])) as unknown as WorksInputs;
    return { event: e, label, inputs: winputs, sums: worksSums(e.id, label, winputs) };
  });

  // PHASE 159d (item 8): the legal check is the purchase's. Failed, with work since, it stops the purchase only.
  const purchaseW3 = applies && works.length > 0 && legalVerdictForJob(d.db, job.id, d.now())?.level === 'RED';

  return {
    job, pack_id: pack?.id ?? null, property, property_choices: choices,
    inputs, lines, sums: combined(reading.sums, applies && !purchaseW3, works, onClaim.length), grants, vat, shared_area, cost,
    events, purchase_applies: applies, purchase_sums: reading.sums, works, purchase_w3: purchaseW3,
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

function insertEntry(d: PackDeps, actor: Actor, pack_id: string, line_key: string | null, field: PackField, value: number | null, pool: Pool | null, reason: string): void {
  d.db.run(
    'INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at) ' +
      'SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ?, ? FROM survey_pack_entries WHERE pack_id = ?',
    [d.newId(), pack_id, line_key, field, value, pool, actor.id, reason.trim(), d.now(), pack_id]);
}

function audit(d: PackDeps, actor: Actor, view: PackView, what: string, line: string | null, fields: readonly string[]): void {
  d.audit.append({ at: d.now(), kind: 'SURVEY_PACK_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'surveyor_job', object_id: view.job.id, detail: { what, line: line ?? '', fields: fields.join(',') } });
}

const PARSE: Readonly<Record<PackInputField, (raw: string) => ReturnType<typeof parseMoney>>> = Object.freeze({
  price_paid: parseMoney, land: parseMoney, gia: parseQuantity, building_rate: parseRate,
});

/** One of the four values that belong to the whole pack. Empty: our draft (or the evidence) again. */
export function savePackValue(d: PackDeps, actor: Actor, job_id: string, f: { field: string; value: string; reason: string; seq: string }): PackResult {
  const field = PACK_INPUT_FIELDS.find((x) => x === f.field);
  if (field === undefined) return { ok: false, field: 'field', why: 'That is not one of the pack’s values.' };
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
    if (value !== null && isMine && now.value === value) return { ok: false, field: 'value', why: 'That is already the value. Nothing changed.' };
    insertEntry(d, actor, pack_id, null, field, value, null, f.reason);
    audit(d, actor, view, 'value', null, [field]);
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
  if (f.field !== 'vat_position' && f.field !== 'vat' && f.field !== 'shared_area') return { ok: false, field: 'field', why: 'That is not one of the pack’s values.' };
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
    const now = field === 'vat_position' ? view.vat.position_source : field === 'vat' ? view.vat.amount_source : view.shared_area.source;
    const was = field === 'vat_position' ? (view.vat.position_source === null ? null : VAT_POSITION_CODES.indexOf(view.vat.position))
      : field === 'vat' ? view.vat.amount_pence : view.shared_area.value;
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
export function saveWorks(d: PackDeps, actor: Actor, job_id: string, f: { event: string; values: Readonly<Partial<Record<WorksField, string>>>; reason: string; seq: string }): PackResult {
  const parsed: Partial<Record<WorksField, number>> = {};
  for (const k of WORKS_FIELDS) {
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
    for (const k of WORKS_FIELDS) {
      const v = parsed[k];
      if (v === undefined) continue;
      if (w.inputs[k].value === v && isEntry(w.inputs[k].source)) continue;
      insertEntry(d, actor, pack_id, w.event.id, k, v, null, f.reason);
      changed.push(k);
    }
    if (changed.length === 0) return { ok: false, why: 'Nothing changed. Type a new value in at least one box.' };
    audit(d, actor, view, 'works', w.event.id, changed);
    return { ok: true };
  });
}

export type LineForm = { line: string; qty: string; rate: string; qpct: string; pool: string; reason: string; seq: string };

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
  return begin(d, actor, job_id, f.reason, f.seq, ({ view, pack_id }) => {
    const l = view.lines.find((x) => x.id === f.line);
    if (l === undefined) return { ok: false, field: 'line', why: 'That line is not in this pack.' };
    if (l.removed) return { ok: false, field: 'line', why: 'That line is taken out. Put it back first.' };
    const changed: string[] = [];
    // Typing the draft's own value stamps it as theirs; typing their own value again changes nothing.
    if (p.v.qty !== null && !(l.qty_milli.value === p.v.qty && isEntry(l.qty_milli.source))) { insertEntry(d, actor, pack_id, l.id, 'qty', p.v.qty, null, f.reason); changed.push('qty'); }
    if (p.v.rate !== null && !(l.rate_pence.value === p.v.rate && isEntry(l.rate_pence.source))) { insertEntry(d, actor, pack_id, l.id, 'rate', p.v.rate, null, f.reason); changed.push('rate'); }
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
export function addLine(d: PackDeps, actor: Actor, job_id: string, f: { label: string; unit: string; qty: string; rate: string; qpct: string; pool: string; reason: string; seq: string }): PackResult {
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
    if (p.v.rate !== null) insertEntry(d, actor, pack_id, id, 'rate', p.v.rate, null, f.reason);
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
