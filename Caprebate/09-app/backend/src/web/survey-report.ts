/**
 * THE CLIENT'S SURVEY REPORT — the approved version, drawn for the client: as a page, and as a PDF. 2 October 2026.
 *
 * Lakhbir: "once the surveyor approves it gets sent to the client and they would want something visually appealing";
 * the design approved as a mock-up the same day ("Yes, build it as shown").
 *
 * ONE SET OF CONTENTS, TWO DRAWINGS. `reportModel` reads an approved version (src/web/pack-approve.ts, the JSON kept with
 * its fingerprint) and puts every word and figure of the report in one place; `reportHtml` and `reportPdf` only draw it.
 * So the page and the PDF can never say different things, and both are made again, the same, from the kept version
 * whenever they are asked for: nothing new is stored, and the fingerprint on page 5 is the version's own.
 *
 *   1  the cover: who it is for and by, the spend that qualifies and its two pools, the building's key facts, the approval
 *   2  how the figure is worked out: price, land, building, rebuild cost, what qualifies; the sum in full; the four values
 *      and where each came from
 *   3  what qualifies, item by item, each value with its source; the items checked and not in the building
 *   4  the legal check, and what happens next
 *   5  the surveyor's declaration, their name and RICS number, the fingerprint, and how the report was made
 *
 * Page 1 also shows the site plan, when the version has one (stage 6, 2 Oct 2026): the client's building and the buildings
 * round it, from Ordnance Survey's free maps (src/web/site-plan.ts). The site boundary (INSPIRE) is never in it
 * (Lakhbir's rule, 1 Oct 2026).
 */
import { propertyLine } from './survey-pack.ts';
import { h, raw, type Safe } from './html.ts';
import { percentWords, poundsWords, quantityWords, type Source, type Valued } from './pack-sums.ts';
import { answerWords, legalQuestions } from './pack-legal.ts';
import type { Snapshot } from './pack-approve.ts';
import { BASIS_WORDS, baseWords } from './bcis-data.ts';
import { allowancesFor, allowanceWords, type AllowanceWords } from './allowances.ts';
import type { ReturnContext } from './return-entries.ts';
import { buildCanvasPdf, PAGE, textWidth, wrapText, type Op, type PdfFont, type Rgb } from './pdf-canvas.ts';
import { minutesWords } from './survey-video.ts';
import { pickWords, sitePlanOps, sitePlanSvg, type SitePlan } from './site-plan.ts';
import { ukDatesIn } from './localtime.ts';

export const REPORT_TITLE = 'Capital allowances survey report';

export type Chip = { readonly kind: 'EVIDENCE' | 'DRAFT' | 'SURVEYOR' | 'NONE'; readonly words: string };
export type ReportRow = {
  readonly label: string; readonly unit: string;
  readonly qty: string; readonly qty_chip: Chip; readonly rate: string; readonly rate_chip: Chip;
  readonly cost: string; readonly qpct: string; readonly qpct_chip: Chip; readonly qualifying: string;
  /** This item's share of the qualifying total, as a whole percentage, for its bar. */
  readonly share: number;
  /** PHASE 153e: seen on site, or from documents. Null in a version approved before. */
  readonly seen: string | null;
};

export type ReportModel = {
  readonly company: string;
  readonly property: string;
  readonly surveyor: { readonly name: string; readonly rics: string; readonly firm: string | null };
  readonly version: number;
  readonly approved_on: string;
  readonly approved_clock: string;
  readonly fingerprint: string;
  readonly headline: { readonly qualifying: string; readonly share: string; readonly building: string; readonly main: string; readonly special: string; readonly main_pct: number };
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly flow: readonly { readonly label: string; readonly value: string; readonly note: string }[];
  readonly sum_words: readonly string[];
  readonly pools: { readonly main: { readonly total: string; readonly items: readonly string[] }; readonly special: { readonly total: string; readonly items: readonly string[] } };
  readonly sources: readonly { readonly label: string; readonly value: string; readonly chip: Chip; readonly reason: string | null }[];
  readonly groups: readonly { readonly pool: 'SR' | 'MP'; readonly title: string; readonly rows: readonly ReportRow[] }[];
  readonly totals: { readonly cost: string; readonly qualifying: string };
  readonly taken_out: readonly string[];
  readonly legal: { readonly level: string; readonly level_words: string; readonly headline: string; readonly answers: readonly { readonly ask: string; readonly answer: string; readonly source: string }[] };
  readonly next: readonly { readonly title: string; readonly words: string }[];
  readonly declaration: readonly string[];
  readonly automation_note: string;
  /** 2 Oct 2026: how the building was inspected, and what the client sent (src/web/survey-evidence.ts). Null in a version approved before. */
  readonly inspection: string | null;
  /** PHASE 153e: the assumptions the version was approved on (the planning assumption). Empty in a version approved before. */
  readonly assumptions: readonly string[];
  /** 2 Oct 2026, stage 6: the site plan from Ordnance Survey's free maps, as approved; null when the version has none. */
  readonly site_plan: SitePlan | null;
  /** PHASE 153g: the surveyor's chapters (5, 8, 11, 14, 16 to 20, 22) as approved. Empty in a version approved before. */
  readonly chapters: readonly ReportChapter[];
  /** PHASE 159c: each spend on the building, with its own figure, where there is work since. Empty otherwise. */
  readonly events: readonly { readonly label: string; readonly qualifying: string; readonly main: string; readonly special: string; readonly note: string }[];
  /** PHASE 159c: what the cover's figure is for, where it is more than one purchase. Null otherwise (the cover says the share). */
  readonly headline_note: string | null;
  /** PHASE 159c: the opening of section 01, which says how the figure was worked out. */
  readonly method_lede: string;
  /** PHASE 159d (item 6): which way each part of the claim goes in, as approved. Empty in a version approved before. */
  readonly routes: readonly { readonly label: string; readonly words: string }[];
  /** PHASE 159e (item 6): each part's year, its allowances and the pools carried on, from the version and the facts it
   *  was sent on (src/web/allowances.ts) — the same figures as the return entries. */
  readonly allowances: AllowanceWords;
  /** PHASE 159f (item 4): where each rate comes from, in full — the short chip in the table, the whole source here. */
  readonly rate_sources: readonly { readonly label: string; readonly words: string }[];
  /** PHASE 159f (L12): true where any rate is a test rate (invented figures, not BCIS): the report says so at the top. */
  readonly test_rates: boolean;
};

export const PURCHASE_LEDE = 'When you buy a building, its price is split three ways. There is the land, the building itself, and the fixtures that qualify for tax relief. The law says how (section 562 of the Capital Allowances Act 2001). We share it out by what each part would cost to build again today.';
const WORKS_LEDE = 'Work you paid for is claimed on what it cost. The surveyor took each part from the final account. The plant qualifies, with the builder’s work that serves it. So does a fair share of the fees. Any repair part comes off your profits instead.';

type SnapEvents = {
  purchase_applies: boolean;
  purchase_w3?: boolean;
  purchase: { qualifying_pence: number | null; main_pool_pence: number | null; special_pool_pence: number | null } | null;
  works: { label: string; inputs: Record<string, number | null>; qualifying_pence: number | null; main_pool_pence: number | null; special_pool_pence: number | null; repairs_pence: number | null;
    /** PHASE 159l (item 5): each value's source, as approved. A version approved before has none. */
    input_sources?: Record<string, Source | null> }[];
};

/** PHASE 159l (item 5, L20): each piece of work's final-account values, in the order the pack asks them. */
const WORK_VALUE_LABELS: readonly (readonly [string, string])[] = [
  ['works_total', 'the final account, in all'], ['works_main', 'plant and machinery (main pool)'], ['works_special', 'integral features (special rate pool)'],
  ['works_bwic', 'builder’s work for that plant'], ['works_demolition', 'taking out old plant'], ['works_other', 'other building work, which does not qualify'],
  ['works_repairs', 'the repair part'], ['works_prelims', 'preliminaries'], ['works_fees', 'professional fees'],
];

/** Each work's values as rows of "Where each number came from", with their source, as every rate line has one. */
function workSources(ev: SnapEvents | undefined): ReportModel['sources'] {
  if (ev === undefined) return [];
  return ev.works.flatMap((w) => WORK_VALUE_LABELS.map(([k, label]) => {
    const src = w.input_sources === undefined ? undefined : w.input_sources[k] ?? null;
    return { label: `${w.label}: ${label}`, value: poundsWords(w.inputs[k] ?? null), chip: src === undefined || src === null ? { kind: 'NONE' as const, words: '' } : chipOf(src),
      reason: src === undefined ? 'Its source was not kept with this version.' : src === null ? 'Not given.' : src.reason ?? (src.kind === 'EVIDENCE' ? src.text : null) };
  }));
}

export type ReportChapter = {
  readonly n: number; readonly title: string; readonly applies: boolean; readonly not_applies_words: string | null;
  readonly rows: readonly { readonly label: string; readonly value: string | null; readonly missing: string }[];
  readonly items: readonly { readonly label: string; readonly detail: string }[];
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10-02" (or a full time) as "2 October 2026", in UK time for a full time. */
export function longDate(iso: string): string {
  const day = iso.length > 10 ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) : iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m === null ? iso : `${String(Number(m[3]))} ${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** PHASE 159f (item 4): a rate's own source as a label — BCIS, a QS schedule, an invoice, a price book, a test rate, or no
 *  source — never just "Surveyor". The full reference is listed under "Where each rate comes from". */
function rateChip(s: Source | null): Chip {
  const b = s?.basis ?? null;
  if (s === null || s === undefined) return { kind: 'NONE', words: '' };
  if (b === null || b === undefined) return { kind: 'SURVEYOR', words: 'No source' };
  const words = b.kind === 'BCIS' ? 'BCIS' : b.kind === 'TEST_PLACEHOLDER' ? 'TEST RATE' : b.kind === 'QS_SCHEDULE' ? 'QS schedule' : b.kind === 'CONTRACTOR_INVOICE' ? 'Invoice' : 'Price book';
  return { kind: s.kind === 'DRAFT' ? 'DRAFT' : 'SURVEYOR', words };
}

/** The full words for a rate's source: what, its reference, the day it is priced at, and how a BCIS rate was adjusted. */
function rateSourceWords(s: Source | null): string {
  const b = s?.basis ?? null;
  if (s === null || s === undefined) return 'No rate.';
  if (b === null || b === undefined) return 'No source recorded.';
  const loc = b.location === undefined || b.location === null ? '' : `, location factor ${b.location.factor.toFixed(2)}${b.location.area === null ? ' (the UK mean)' : ` (${b.location.area})`}`;
  const ix = b.index === undefined || b.index === null || b.index.factor === null ? '' : `, indexed ×${b.index.factor.toFixed(4)}`;
  // PHASE 159l (item 6): a version approved before says BCIS's quarter as "at 2026-01"; it is read as "at January 2026".
  const ref = b.ref.replace(/ at (\d{4}-(?:0[1-9]|1[0-2]))(?![\d-])/g, (_m, q: string) => ` at ${baseWords(q)}`);
  return `${BASIS_WORDS[b.kind]}: ${ref}${loc}${ix}${b.priced_at === null ? '' : `, priced at ${longDate(b.priced_at)}`}.`;
}

/** For the tests alone: a rate's source in the report's words. */
export const rateWordsForTest = (s: Source | null): string => rateSourceWords(s);

/** A value's source as a label. In the item table (`short`) a surveyor's value says "Surveyor": their name is on page 5. */
function chipOf(s: Source | null, short = false): Chip {
  if (s === null) return { kind: 'NONE', words: '' };
  if (s.kind === 'EVIDENCE') return { kind: 'EVIDENCE', words: 'Evidence' };
  if (s.kind === 'DRAFT') return { kind: 'DRAFT', words: 'Our draft' };
  return { kind: 'SURVEYOR', words: short ? 'Surveyor' : (s.by_name ?? s.text) };
}

const LEVEL: Readonly<Record<string, string>> = Object.freeze({ GREEN: 'Clear', URGENT: 'Clear, with a deadline', AMBER: 'Not settled', RED: 'Fails' });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function inspectionWords(i: Snapshot['inspection'] | undefined): string | null {
  if (i === undefined || i.words === null) return null;
  const sent: string[] = [];
  if (i.photos > 0) sent.push(`${String(i.photos)} photo${i.photos === 1 ? '' : 's'} from the client, covering ${String(i.items_done)} of ${String(i.items_total)} checklist items`);
  if (i.recordings > 0) sent.push(`${i.recordings === 1 ? 'a recorded video call' : `${String(i.recordings)} recorded video calls`} of ${String(i.recorded_minutes)} minutes`);
  // 2 Oct 2026: the client's own videos; a version approved before they existed has none.
  const vids = (i as { videos?: number }).videos ?? 0;
  if (vids > 0) sent.push(`${vids === 1 ? 'a video' : `${String(vids)} videos`} from the client (${minutesWords((i as { video_minutes?: number }).video_minutes ?? 0)})`);
  return `${i.words}${i.note === null ? '' : ` (${i.note})`}.${sent.length === 0 ? '' : ` The surveyor had ${sent.join(', and ')}.`}`;
}

export function reportModel(x: Snapshot, fingerprint: string, ctx: ReturnContext = { period_start: null, is_company: null, facts: null }): ReportModel {
  // PHASE 159c: a version with work since keeps each spend (`events`); `sums` is their total. The section 562 sum below is
  // the purchase's own, so it reads the purchase's figures; the cover reads the total.
  const ev = (x as { events?: SnapEvents }).events;
  const total = x.sums;
  const s = ev === undefined ? total : { ...total,
    qualifying_pence: ev.purchase?.qualifying_pence ?? null, main_pool_pence: ev.purchase?.main_pool_pence ?? null, special_pool_pence: ev.purchase?.special_pool_pence ?? null };
  // PHASE 153a: a version approved before grants came off has no `grants`; one with grants that took nothing off reads as before.
  const gr = (x as { grants?: Snapshot['grants'] }).grants;
  const off = gr !== undefined && gr.reduction_pence !== null && gr.reduction_pence > 0 ? gr : null;
  const beforeShare = s.rebuild_pence === null || s.rebuild_pence === 0 || s.elements_qualifying_pence === null ? null
    : Math.round((s.elements_qualifying_pence * 10000) / s.rebuild_pence);
  const q = (total.qualifying_pence ?? 0);
  const main = total.main_pool_pence ?? 0;
  const mainPct = q === 0 ? 0 : Math.round((main * 100) / q);
  const live = x.lines.filter((l) => !l.removed);
  const totalQ = s.elements_qualifying_pence ?? 0;
  const row = (l: Snapshot['lines'][number]): ReportRow => ({
    label: l.label, unit: l.unit,
    qty: quantityWords(l.qty_milli.value), qty_chip: chipOf(l.qty_milli.source, true),
    rate: poundsWords(l.rate_pence.value), rate_chip: rateChip(l.rate_pence.source),
    cost: poundsWords(l.cost_pence), qpct: percentWords(l.qpct_bp.value), qpct_chip: chipOf(l.qpct_bp.source, true),
    qualifying: poundsWords(l.qualifying_pence),
    share: totalQ === 0 || l.qualifying_pence === null ? 0 : Math.round((l.qualifying_pence * 100) / totalQ),
    seen: (l as { seen?: string }).seen ?? null,
  });
  const sr = live.filter((l) => l.pool === 'SR');
  const mp = live.filter((l) => l.pool === 'MP');
  const iv = x.inputs;
  const value = (v: Valued, w: (n: number | null) => string) => w(v.value);
  const area = (n: number | null) => (n === null ? '—' : `${quantityWords(n)} m²`);
  const perM2 = (n: number | null) => (n === null ? '—' : `${poundsWords(n)} a m²`);
  const questions = legalQuestions(x.job.sector);
  return {
    company: x.business.name,
    property: x.property === null ? '' : propertyLine(x.property),
    surveyor: { name: x.surveyor.name, rics: x.surveyor.rics_number, firm: x.surveyor.firm },
    version: x.version,
    approved_on: longDate(x.approved_at),
    approved_clock: clock(x.approved_at),
    fingerprint,
    headline: {
      qualifying: poundsWords(total.qualifying_pence), share: percentWords(s.share_bp), building: poundsWords(s.building_price_pence),
      main: poundsWords(total.main_pool_pence), special: poundsWords(total.special_pool_pence), main_pct: mainPct,
    },
    facts: [
      { label: 'Floor area', value: value(iv.gia_milli_m2, area) },
      { label: 'Price paid', value: value(iv.price_paid_pence, poundsWords) },
      { label: 'Bare land', value: value(iv.land_pence, poundsWords) },
      { label: 'Rebuild rate', value: `${value(iv.building_rate_pence, perM2)}${iv.building_rate_pence.source?.basis === undefined || iv.building_rate_pence.source.basis === null ? '' : ` (${rateChip(iv.building_rate_pence.source).words})`}` },
    ],
    flow: [
      { label: 'Price paid', value: poundsWords(iv.price_paid_pence.value), note: 'what you paid' },
      // PHASE 153e: VAT the client could not reclaim, where the version counted any. A version approved before has none.
      ...(((x as { vat?: { counted_pence: number } }).vat?.counted_pence ?? 0) > 0
        ? [{ label: 'Plus VAT not reclaimed', value: `+ ${poundsWords((x as { vat?: { counted_pence: number } }).vat?.counted_pence ?? 0)}`, note: 'part of what you spent' }] : []),
      { label: 'Less bare land', value: `– ${poundsWords(iv.land_pence.value)}`, note: 'the land alone' },
      { label: 'The building', value: poundsWords(s.building_price_pence), note: 'price less land' },
      { label: 'Rebuild cost', value: poundsWords(s.rebuild_pence), note: `${area(iv.gia_milli_m2.value)} × ${poundsWords(iv.building_rate_pence.value)}` },
      ...(off === null ? [] : [{ label: 'Less grants', value: `– ${poundsWords(off.reduction_pence)}`, note: 'paid by others' }]),
      { label: 'Qualifies', value: poundsWords(s.qualifying_pence), note: `${percentWords(s.share_bp)} of the building` },
    ],
    sum_words: off === null ? [
      `The qualifying items would cost ${poundsWords(s.elements_qualifying_pence)} to rebuild, out of ${poundsWords(s.rebuild_pence)} for the whole building. That is ${percentWords(s.share_bp)}.`,
      `So ${percentWords(s.share_bp)} of what you paid for the building qualifies: ${poundsWords(s.building_price_pence)} × ${poundsWords(s.elements_qualifying_pence)} ÷ ${poundsWords(s.rebuild_pence)} = ${poundsWords(s.qualifying_pence)}.`,
    ] : [
      `The qualifying items would cost ${poundsWords(s.elements_qualifying_pence)} to rebuild, out of ${poundsWords(s.rebuild_pence)} for the whole building. That is ${percentWords(beforeShare)}.`,
      `So ${percentWords(beforeShare)} of what you paid for the building qualifies before grants: ${poundsWords(s.building_price_pence)} × ${poundsWords(s.elements_qualifying_pence)} ÷ ${poundsWords(s.rebuild_pence)} = ${poundsWords(off.before_qualifying_pence)}.`,
      `Others paid for part of it, so ${poundsWords(off.reduction_pence)} comes off${off.element_trace ? '' : ', in equal share across every item'}: ${poundsWords(s.qualifying_pence)} qualifies.`,
    ],
    pools: {
      main: { total: poundsWords(total.main_pool_pence), items: mp.map((l) => l.label) },
      special: { total: poundsWords(total.special_pool_pence), items: sr.map((l) => l.label) },
    },
    sources: [
      { label: 'Price paid', value: poundsWords(iv.price_paid_pence.value), chip: chipOf(iv.price_paid_pence.source), reason: iv.price_paid_pence.source?.reason ?? (iv.price_paid_pence.source?.kind === 'EVIDENCE' ? iv.price_paid_pence.source.text : null) },
      { label: 'Bare land', value: poundsWords(iv.land_pence.value), chip: chipOf(iv.land_pence.source), reason: iv.land_pence.source?.reason ?? (iv.land_pence.source?.kind === 'EVIDENCE' ? iv.land_pence.source.text : null) },
      { label: 'Floor area', value: area(iv.gia_milli_m2.value), chip: chipOf(iv.gia_milli_m2.source), reason: iv.gia_milli_m2.source?.reason ?? (iv.gia_milli_m2.source?.kind === 'EVIDENCE' ? iv.gia_milli_m2.source.text : null) },
      { label: 'Whole-building rebuild rate', value: perM2(iv.building_rate_pence.value), chip: chipOf(iv.building_rate_pence.source), reason: iv.building_rate_pence.source?.reason ?? (iv.building_rate_pence.source?.kind === 'EVIDENCE' ? iv.building_rate_pence.source.text : null) },
      ...workSources(ev),
    ],
    groups: [
      { pool: 'SR' as const, title: 'Special rate pool — the building’s own systems', rows: sr.map(row) },
      { pool: 'MP' as const, title: 'Main pool — plant and machinery', rows: mp.map(row) },
    ].filter((g) => g.rows.length > 0),
    totals: { cost: poundsWords(s.elements_cost_pence), qualifying: poundsWords(s.elements_qualifying_pence) },
    taken_out: x.lines.filter((l) => l.removed).map((l) => l.label),
    legal: {
      level: x.legal.verdict.level, level_words: LEVEL[x.legal.verdict.level] ?? x.legal.verdict.level, headline: x.legal.verdict.headline,
      answers: x.legal.answers.map((a) => {
        const qq = questions.find((y) => y.id === a.question_id);
        const said = qq === undefined ? String(a.value) : answerWords(qq, a.value);
        return { ask: a.ask, answer: ISO_DAY.test(said) ? longDate(said) : said, source: a.source };
      }),
    },
    next: [
      { title: 'A tax adviser checks the figures.', words: 'Your accountant, or ours, reads this report and signs off the figures before they are used.' },
      { title: 'Your accountant adds the claim to your company tax return.', words: 'They decide how and when to claim the allowances.' },
      { title: 'Keep this report with your tax records.', words: 'If HMRC asks, it shows how each figure was reached and who reached it.' },
    ],
    declaration: [...x.declaration],
    automation_note: x.automation_note,
    inspection: inspectionWords((x as { inspection?: Snapshot['inspection'] }).inspection),
    assumptions: (x as { assumptions?: readonly string[] }).assumptions ?? [],
    site_plan: (x as { site_plan?: SitePlan }).site_plan ?? null,
    chapters: ((x as { chapters?: readonly ReportChapter[] }).chapters ?? []).map((c) => ({ n: c.n, title: c.title, applies: c.applies, not_applies_words: c.not_applies_words,
      rows: c.rows.map((r) => ({ label: r.label, value: r.value, missing: r.missing })), items: c.items.map((i) => ({ label: i.label, detail: i.detail })) })),
    ...eventsPart(ev, purchaseLede(x)),
    routes: ((x as { routes?: readonly { label: string; route: string; words: string }[] }).routes ?? []).map((r) => ({ label: r.label === 'The claim' ? 'Your claim' : r.label, words: ukDatesIn(r.words) })), // PHASE 159j (L17): the PDF as the page
    allowances: allowanceWords(allowancesFor(x, ctx)),
    rate_sources: [{ label: 'The whole-building rate', words: rateSourceWords(iv.building_rate_pence.source) },
      ...live.filter((l) => l.rate_pence.value !== null).map((l) => ({ label: l.label, words: rateSourceWords(l.rate_pence.source) }))],
    test_rates: [iv.building_rate_pence, ...live.map((l) => l.rate_pence)].some((v) => v.source?.basis?.kind === 'TEST_PLACEHOLDER'),
  };
}

/**
 * PHASE 159f (C19, item 6): THE METHOD, IN WORDS THAT MATCH THE ARITHMETIC. Every rate is priced at one day (the purchase
 * date where the index reaches it), so the report says that day, not "build again today"; and it names the way section
 * 562's just apportionment is done. A version approved before Phase 159f keeps the words it was approved with.
 */
function purchaseLede(x: Snapshot): string {
  const p = (x as { pricing?: { priced_at: string | null; purchase: string | null } }).pricing;
  if (p === undefined || p.priced_at === null) return PURCHASE_LEDE;
  const day = `${longDate(p.priced_at)}${p.priced_at === p.purchase ? ', the purchase date' : ''}`;
  return 'When you buy a building, its price is split three ways. There is the land, the building itself, and the fixtures that qualify for tax relief. ' +
    'The law says the price must be shared out justly (section 562 of the Capital Allowances Act 2001). We use the proportional way. ' +
    `The building’s price is shared out as the cost to build each part is. Every cost is priced at ${day}.`;
}

/** PHASE 159c: each spend on the building, and what the cover's figure is for. A version with no work since: nothing. */
function eventsPart(ev: SnapEvents | undefined, lede: string = PURCHASE_LEDE): Pick<ReportModel, 'events' | 'headline_note' | 'method_lede'> & Partial<Pick<ReportModel, 'flow' | 'sum_words'>> {
  if (ev === undefined) return { events: [], headline_note: null, method_lede: lede };
  const rows = [
    // PHASE 159d (item 8): a purchase that failed the legal check is named, with no figure.
    ...(ev.purchase_w3 === true ? [{ label: 'The purchase', qualifying: '£0', main: '£0', special: '£0',
      note: 'Not claimed. The purchase does not pass the second-hand fixtures rules (section 187A), so only the work done since is claimed.' }] : []),
    ...(ev.purchase_applies && ev.purchase !== null ? [{ label: 'The purchase', qualifying: poundsWords(ev.purchase.qualifying_pence), main: poundsWords(ev.purchase.main_pool_pence),
      special: poundsWords(ev.purchase.special_pool_pence), note: 'Shared out from the price, by what each part would cost to build again (section 562).' }] : []),
    ...ev.works.map((w) => ({ label: w.label, qualifying: poundsWords(w.qualifying_pence), main: poundsWords(w.main_pool_pence), special: poundsWords(w.special_pool_pence),
      note: `On its own cost: ${poundsWords(w.inputs['works_total'] ?? null)} in all, from the final account.${(w.repairs_pence ?? 0) > 0 ? ` ${poundsWords(w.repairs_pence)} of it is a repair, which comes off your profits instead and is not in this figure.` : ''}` })),
  ];
  if (ev.purchase_applies) return { events: rows, headline_note: 'for the purchase and the work done since, each worked out on its own', method_lede: lede };
  const cost = ev.works.reduce((a, w) => a + (w.inputs['works_total'] ?? 0), 0);
  const q = ev.works.reduce((a, w) => a + (w.qualifying_pence ?? 0), 0);
  return { events: rows, headline_note: 'for the work done on the building, each piece worked out on its own cost', method_lede: WORKS_LEDE,
    flow: [{ label: 'What the work cost', value: poundsWords(cost), note: 'the final accounts' }, { label: 'Qualifies', value: poundsWords(q), note: 'the plant and its share' }],
    sum_words: ev.works.map((w) => `${w.label}: ${poundsWords(w.qualifying_pence)} of ${poundsWords(w.inputs['works_total'] ?? null)} qualifies.`) };
}

/* ================================================================== *
 * THE PAGE
 * ================================================================== */

const w5 = (pct: number): string => `pk-w${String(Math.max(0, Math.min(100, Math.round(pct / 5) * 5)))}`;

function chipHtml(c: Chip): Safe {
  if (c.kind === 'NONE') return raw('');
  return h`<span class="rp-chip rp-${c.kind === 'EVIDENCE' ? 'ev' : c.kind === 'DRAFT' ? 'dr' : 'sv'}">${c.words}</span>`;
}

export function reportHtml(m: ReportModel, links: { pdf: string | null }): Safe {
  return h`<div class="rp">
    <section class="rp-sheet rp-cover">
      <div class="rp-band"><p class="rp-wm">CAP REBATE</p><h1>Capital allowances survey report</h1><p>What in your building qualifies for tax relief, and how much.</p></div>
      <div class="rp-body">
        <div class="rp-who"><div><span>Prepared for</span><b>${m.company}</b>${m.property}</div>
          <div><span>Prepared by</span><b>${m.surveyor.name}</b>RICS no. ${m.surveyor.rics}${m.surveyor.firm === null ? '' : ` · ${m.surveyor.firm}`}</div></div>
        <div class="rp-hero">
          <div class="rp-big"><p class="rp-lbl">Spend that qualifies</p><p class="rp-fig">${m.headline.qualifying}</p>
            <p>${m.headline_note ?? `${m.headline.share} of the ${m.headline.building} paid for the building`}</p>
            <div class="rp-split" role="img" aria-label="Main pool ${String(m.headline.main_pct)} per cent, special rate pool ${String(100 - m.headline.main_pct)} per cent"><span class="rp-mp ${w5(m.headline.main_pct)}"></span><span class="rp-sr"></span></div>
            <p class="rp-legend"><span><i class="rp-dot rp-dot-mp"></i>Main pool ${m.headline.main}</span><span><i class="rp-dot rp-dot-sr"></i>Special rate pool ${m.headline.special}</span></p></div>
          <div class="rp-facts"><h2>About the building</h2><dl>${m.facts.map((f) => h`<div><dt>${f.label}</dt><dd>${f.value}</dd></div>`)}</dl></div>
        </div>
        <div class="rp-sign"><span class="rp-seal" aria-hidden="true">✓</span><p><b>Approved by the surveyor on ${m.approved_on}.</b> Version ${String(m.version)}. Each figure in this report says where it came from, and every figure the surveyor set carries their name.<br><span class="rp-note">Report reference (fingerprint): ${m.fingerprint.slice(0, 8)}…${m.fingerprint.slice(-7)}</span></p></div>
        ${m.site_plan === null ? raw('') : h`<div class="rp-plan">${sitePlanSvg(m.site_plan, `Site plan: the building at ${m.property}, and the buildings round it`)}
          <div><h2>Site plan</h2><p>${pickWords(m.site_plan)} The grey ones are the buildings round it. North is up.</p>
          <p class="rp-note">The plan shows buildings only, not the legal boundary of the site. ${m.site_plan.attribution}.</p></div></div>`}
        ${links.pdf === null ? raw('') : h`<p><a class="cta" href="${links.pdf}">Download the PDF</a></p>`}
      </div>
    </section>

    <section class="rp-sheet">
      <h2 class="rp-h"><span>01</span>How the figure is worked out</h2>
      ${m.test_rates ? h`<p class="rp-test" role="note"><b>Test rates.</b> Some rates in this report are invented test figures, not BCIS. It is not a real valuation.</p>` : raw('')}
      <p class="rp-lede">${m.method_lede}</p>
      <ol class="rp-flow">${m.flow.map((f, i) => h`<li${i === m.flow.length - 1 ? raw(' class="rp-end"') : raw('')}>${f.label}<b>${f.value}</b><small>${f.note}</small></li>`)}</ol>
      <div class="rp-calc"><p><b>The sum, in full.</b> ${m.sum_words.join(' ')}</p></div>
      <div class="rp-cards">
        <div><h3>Main pool · ${m.pools.main.total}</h3><p>Plant and machinery that is not part of the building’s own systems.${m.pools.main.items.length === 0 ? '' : ` Here: ${m.pools.main.items.join('; ')}.`}</p></div>
        <div><h3>Special rate pool · ${m.pools.special.total}</h3><p>The building’s own systems, called integral features.${m.pools.special.items.length === 0 ? '' : ` Here: ${m.pools.special.items.join('; ')}.`}</p></div>
      </div>
      ${m.events.length === 0 ? raw('') : h`<h3>Each spend on the building</h3>
      <table class="rp-table"><thead><tr><th>Spend</th><th class="n">Qualifies</th><th class="n">Main pool</th><th class="n">Special rate pool</th></tr></thead><tbody>
        ${m.events.map((e) => h`<tr><td>${e.label}<br><span class="rp-note">${e.note}</span></td><td class="n">${e.qualifying}</td><td class="n">${e.main}</td><td class="n">${e.special}</td></tr>`)}
        <tr class="rp-tot"><th scope="row">Total</th><td class="n">${m.headline.qualifying}</td><td class="n">${m.headline.main}</td><td class="n">${m.headline.special}</td></tr></tbody></table>`}
      <h3>Where each number came from</h3>
      <table class="rp-table"><thead><tr><th>Value</th><th class="n">Figure</th><th>Source</th></tr></thead><tbody>
        ${m.sources.map((r) => h`<tr><td>${r.label}</td><td class="n">${r.value}</td><td>${chipHtml(r.chip)}${r.reason === null ? '' : ` “${r.reason}”`}</td></tr>`)}</tbody></table>
      <p class="rp-note">Key: <span class="rp-chip rp-ev">Evidence</span> taken from a record or document · <span class="rp-chip rp-dr">Our draft</span> prepared by Cap Rebate and checked by the surveyor · <span class="rp-chip rp-sv">a name</span> set by the surveyor.</p>
    </section>

    <section class="rp-sheet">
      <h2 class="rp-h"><span>02</span>What qualifies, item by item</h2>
      <p class="rp-lede">Each item’s rebuild cost is how much there is × the rate. The share that qualifies gives its qualifying cost.</p>
      <div class="pk-scroll"><table class="rp-table rp-items"><thead><tr><th>Item</th><th class="n">How much</th><th class="n">Rate</th><th class="n">Rebuild cost</th><th class="n">Qualifies</th><th class="n">Qualifying cost</th></tr></thead>
        ${m.groups.map((g) => h`<tbody><tr class="rp-grp"><th colspan="6" scope="rowgroup">${g.title}</th></tr>${g.rows.map((r) => h`<tr>
          <td>${r.label}<br><span class="rp-note">${r.unit}${r.seen === null ? '' : ` · ${r.seen}`}</span><span class="rp-bar"><i class="rp-bar-${g.pool === 'SR' ? 'sr' : 'mp'} ${w5(r.share)}"></i></span></td>
          <td class="n">${r.qty}<br>${chipHtml(r.qty_chip)}</td><td class="n">${r.rate}<br>${chipHtml(r.rate_chip)}</td><td class="n">${r.cost}</td>
          <td class="n">${r.qpct}<br>${chipHtml(r.qpct_chip)}</td><td class="n">${r.qualifying}</td></tr>`)}</tbody>`)}
        <tbody><tr class="rp-tot"><th scope="row">Total</th><td></td><td></td><td class="n">${m.totals.cost}</td><td></td><td class="n">${m.totals.qualifying}</td></tr></tbody></table></div>
      <p class="rp-note">The bars show each item’s share of the qualifying total. These are rebuild costs. The figure on the cover is the same share of what was actually paid.</p>
      ${m.taken_out.length === 0 ? raw('') : h`<h3>Checked and not in this building (${String(m.taken_out.length)})</h3><p class="rp-note">${m.taken_out.join('; ')}. The surveyor took each out with a reason, kept with this report.</p>`}
      <h3>Where each rate comes from</h3>
      <ul class="rp-sources">${m.rate_sources.map((r) => h`<li><b>${r.label}.</b> ${r.words}</li>`)}</ul>
    </section>

    <section class="rp-sheet">
      <h2 class="rp-h"><span>03</span>Can you claim? The legal check</h2>
      <p><span class="rp-level rp-level-${m.legal.level.toLowerCase()}">${m.legal.level_words}</span> <b>${m.legal.headline}</b></p>
      <p>A buyer from a business that could claim may get nothing on the fixtures. The value must have been fixed in time (sections 187A and 198 of the Act). We asked the questions below. Each answer says where it came from.</p>
      ${m.legal.answers.length === 0 ? raw('') : h`<table class="rp-table"><thead><tr><th>Question</th><th>Answer</th><th>From</th></tr></thead><tbody>
        ${m.legal.answers.map((a) => h`<tr><td>${a.ask}</td><td>${a.answer}</td><td>${a.source}</td></tr>`)}</tbody></table>`}
      ${m.routes.length === 0 ? raw('') : h`<h3>How each part goes in</h3><ul>${m.routes.map((r) => h`<li><b>${r.label}.</b> ${r.words}</li>`)}</ul>`}
      <h3>The allowances, part by part</h3>
      <p>Each part goes into the year its route names. A first-year relief is shown only where the facts on your claim allow it. Your accountant may choose less.</p>
      <table class="rp-table"><thead><tr><th>Part</th><th>How it goes in</th><th>The year it goes in</th><th>Relief in that year</th><th>Added to the pool</th><th>Structures allowance</th></tr></thead><tbody>
        ${m.allowances.parts.map((p) => h`<tr><td>${p.part}</td><td>${p.route}</td><td>${p.year}</td><td>${p.reliefs}</td><td>${p.to_pool}</td><td>${p.sba}</td></tr>`)}</tbody></table>
      <h3>Year by year</h3>
      <table class="rp-table"><thead><tr><th>Year</th><th>First-year relief</th><th>Main pool</th><th>Special rate pool</th><th>Structures allowance</th><th>All allowances</th><th>Main pool carried on</th><th>Special rate pool carried on</th></tr></thead><tbody>
        ${m.allowances.years.map((y) => h`<tr><td>${y.year}</td><td>${y.first_year}</td><td>${y.main}</td><td>${y.special}</td><td>${y.sba}</td><td><b>${y.total}</b></td><td>${y.main_cf}</td><td>${y.special_cf}</td></tr>`)}</tbody></table>
      <h2 class="rp-h"><span>04</span>What happens next</h2>
      <ol class="rp-steps">${m.next.map((s) => h`<li><b>${s.title}</b> ${s.words}</li>`)}</ol>
    </section>

    <section class="rp-sheet">
      <h2 class="rp-h"><span>05</span>The surveyor’s declaration</h2>
      <div class="rp-decl"><ol>${m.declaration.map((d) => h`<li>${d}</li>`)}</ol>
        <div class="rp-sigrow"><div><b>${m.surveyor.name}</b>Surveyor</div><div><b>RICS no. ${m.surveyor.rics}</b>${m.surveyor.firm ?? ''}</div><div><b>${m.approved_on}, ${m.approved_clock}</b>Approved online, version ${String(m.version)}</div></div></div>
      ${m.inspection === null ? raw('') : h`<h3>How the building was inspected</h3><p>${m.inspection}</p>`}
      ${m.assumptions.length === 0 ? raw('') : h`<h3>What we assume</h3>${m.assumptions.map((a) => h`<p>${a}</p>`)}`}
      <h3>The report’s fingerprint</h3>
      <p>This code belongs to this exact report. If a single figure were changed, the code would change. We keep the approved report and its code.</p>
      <p class="pk-fp">${m.fingerprint}</p>
      <div class="rp-ai"><h3>How this report was made</h3><p>${m.automation_note}</p></div>
    </section>
    ${m.chapters.length === 0 ? raw('') : h`<section class="rp-sheet">
      <h2 class="rp-h"><span>06</span>The surveyor’s chapters</h2>
      <p>Each chapter as the surveyor approved it. Anything not on file says so; nothing is filled in for them.</p>
      ${m.chapters.map((c) => h`<h3>${String(c.n)} · ${c.title}</h3>
        ${c.applies ? raw('') : h`<p>${c.not_applies_words ?? ''}</p>`}
        ${c.rows.length === 0 ? raw('') : h`<table class="rp-table"><tbody>${c.rows.map((r) => h`<tr><th scope="row">${r.label}</th><td>${r.value ?? r.missing}</td></tr>`)}</tbody></table>`}
        ${c.items.length === 0 ? raw('') : h`<ul>${c.items.map((i) => h`<li><b>${i.label}</b> ${i.detail}</li>`)}</ul>`}`)}
    </section>`}
  </div>`;
}

/* ================================================================== *
 * THE PDF — the same contents, drawn on A4
 * ================================================================== */

const C = Object.freeze({
  ink: [17, 17, 17] as Rgb, body: [51, 51, 51] as Rgb, mut: [107, 114, 128] as Rgb, white: [255, 255, 255] as Rgb,
  mint: [171, 237, 216] as Rgb, mist: [242, 248, 246] as Rgb, line: [207, 220, 215] as Rgb, mp: [47, 156, 126] as Rgb, sr: [75, 99, 209] as Rgb,
  ok: [29, 107, 53] as Rgb, okbg: [230, 244, 234] as Rgb, warn: [138, 83, 0] as Rgb, warnbg: [255, 245, 224] as Rgb, track: [230, 236, 233] as Rgb,
  ev: [[230, 246, 234], [23, 102, 58], [181, 224, 194]] as const, dr: [[255, 243, 214], [122, 82, 0], [231, 201, 138]] as const, sv: [[233, 236, 253], [45, 63, 168], [191, 199, 245]] as const,
});

const L = 50;            // left margin
const R = PAGE.w - 50;   // right margin
const W = R - L;
const BOTTOM = PAGE.h - 64;

class Canvas {
  readonly pages: Op[][] = [];
  y = 0;
  private readonly footer: string;
  constructor(footer: string) { this.footer = footer; }
  get ops(): Op[] { return this.pages[this.pages.length - 1] ?? []; }
  page(): void { this.pages.push([]); this.y = 56; }
  need(h: number): void { if (this.y + h > BOTTOM) this.page(); }
  text(x: number, y: number, s: string, font: PdfFont, size: number, color: Rgb, align: 'left' | 'right' | 'center' = 'left', spacing?: number): void {
    this.ops.push({ k: 'text', x, y, s, font, size, color, align, ...(spacing === undefined ? {} : { spacing }) });
  }
  /** Prose from the cursor; returns nothing, moves the cursor. */
  para(s: string, o: { x?: number; w?: number; font?: PdfFont; size?: number; color?: Rgb; lead?: number; after?: number } = {}): void {
    const font = o.font ?? 'Helvetica';
    const size = o.size ?? 10;
    const lead = o.lead ?? size * 1.45;
    for (const line of wrapText(s, font, size, o.w ?? W)) {
      this.need(lead);
      this.y += lead;
      this.text(o.x ?? L, this.y - lead * 0.28, line, font, size, o.color ?? C.body);
    }
    this.y += o.after ?? 6;
  }
  heading(num: string, title: string): void {
    this.need(60);
    this.y += 26;
    this.text(L, this.y, num, 'Helvetica-Bold', 11, C.mp, 'left', 1.2);
    this.text(L + 26, this.y, title, 'Times-Bold', 20, C.ink);
    this.y += 9;
    this.ops.push({ k: 'line', x1: L, y1: this.y, x2: R, y2: this.y, color: C.ink, lw: 1.5 });
    this.y += 14;
  }
  chip(x: number, y: number, c: Chip, align: 'left' | 'right' = 'left'): void {
    if (c.kind === 'NONE') return;
    const [bg, fg, edge] = c.kind === 'EVIDENCE' ? C.ev : c.kind === 'DRAFT' ? C.dr : C.sv;
    const size = 7;
    const w = textWidth(c.words, 'Helvetica-Bold', size) + 8;
    const x0 = align === 'right' ? x - w : x;
    this.ops.push({ k: 'rect', x: x0, y: y - 7.5, w, h: 10, r: 5, fill: bg as Rgb, stroke: edge as Rgb, lw: 0.6 });
    this.text(x0 + 4, y, c.words, 'Helvetica-Bold', size, fg as Rgb);
  }
  finish(): Op[][] {
    const total = this.pages.length;
    this.pages.forEach((p, i) => {
      p.push({ k: 'line', x1: L, y1: PAGE.h - 40, x2: R, y2: PAGE.h - 40, color: C.line, lw: 0.6 });
      p.push({ k: 'text', x: L, y: PAGE.h - 28, s: this.footer, font: 'Helvetica', size: 7.5, color: C.mut });
      p.push({ k: 'text', x: R, y: PAGE.h - 28, s: `Page ${String(i + 1)} of ${String(total)}`, font: 'Helvetica', size: 7.5, color: C.mut, align: 'right' });
    });
    return this.pages;
  }
}

/** A line of text cut to fit, with "…" if it had to be. */
function fit(s: string, font: PdfFont, size: number, maxW: number): string {
  if (textWidth(s, font, size) <= maxW) return s;
  let t = s;
  while (t.length > 1 && textWidth(`${t}…`, font, size) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function reportPdf(m: ReportModel): { bytes: Uint8Array; unshown: number } {
  const c = new Canvas(fit(`Cap Rebate · ${REPORT_TITLE} · ${m.company} · version ${String(m.version)}`, 'Helvetica', 7.5, W - 70));

  /* ---------------------------------------------------------- 1 · the cover */
  c.page();
  c.ops.push({ k: 'rect', x: 0, y: 0, w: PAGE.w, h: 215, fill: C.ink });
  c.text(L, 62, 'CAP REBATE', 'Times-Bold', 10, C.mint, 'left', 2.4);
  c.text(L, 112, 'Capital allowances', 'Times-Bold', 30, C.white);
  c.text(L, 148, 'survey report', 'Times-Bold', 30, C.white);
  c.text(L, 182, 'What in your building qualifies for tax relief, and how much.', 'Helvetica', 12, [233, 236, 233]);
  const who = (x: number, label: string, name: string, more: string) => {
    c.ops.push({ k: 'rect', x, y: 242, w: 3, h: 56, fill: C.mint });
    c.text(x + 12, 255, label.toUpperCase(), 'Helvetica', 7.5, C.mut, 'left', 0.8);
    c.text(x + 12, 271, fit(name, 'Helvetica-Bold', 11.5, W / 2 - 24), 'Helvetica-Bold', 11.5, C.ink);
    wrapText(more, 'Helvetica', 9.5, W / 2 - 24).slice(0, 2).forEach((line, i) => c.text(x + 12, 285 + i * 12, line, 'Helvetica', 9.5, C.body));
  };
  who(L, 'Prepared for', m.company, m.property);
  who(L + W / 2 + 6, 'Prepared by', m.surveyor.name, `RICS no. ${m.surveyor.rics}${m.surveyor.firm === null ? '' : ` · ${m.surveyor.firm}`}`);
  // The spend that qualifies, and its two pools.
  const bw = W * 0.56;
  c.ops.push({ k: 'rect', x: L, y: 312, w: bw, h: 190, r: 8, fill: C.mist, stroke: C.line, lw: 0.8 });
  c.text(L + 16, 336, 'SPEND THAT QUALIFIES', 'Helvetica', 8, C.mut, 'left', 0.9);
  c.text(L + 16, 374, m.headline.qualifying, 'Times-Bold', 32, C.ink);
  let yy = 396;
  for (const line of wrapText(m.headline_note ?? `${m.headline.share} of the ${m.headline.building} paid for the building`, 'Helvetica', 10.5, bw - 32)) { c.text(L + 16, yy, line, 'Helvetica', 10.5, C.body); yy += 14; }
  const barY = 440;
  const barW = bw - 32;
  c.ops.push({ k: 'rect', x: L + 16, y: barY, w: barW, h: 11, r: 3, fill: C.sr });
  if (m.headline.main_pct > 0) c.ops.push({ k: 'rect', x: L + 16, y: barY, w: Math.max(6, (barW * m.headline.main_pct) / 100), h: 11, r: 3, fill: C.mp });
  c.ops.push({ k: 'rect', x: L + 16, y: barY + 21, w: 7, h: 7, fill: C.mp });
  c.text(L + 27, barY + 28, `Main pool ${m.headline.main}`, 'Helvetica', 9, C.body);
  c.ops.push({ k: 'rect', x: L + 16, y: barY + 37, w: 7, h: 7, fill: C.sr });
  c.text(L + 27, barY + 44, `Special rate pool ${m.headline.special}`, 'Helvetica', 9, C.body);
  // About the building.
  const fx = L + bw + 14;
  const fw = W - bw - 14;
  c.ops.push({ k: 'rect', x: fx, y: 312, w: fw, h: 190, r: 8, stroke: C.line, lw: 0.8 });
  c.text(fx + 14, 336, 'About the building', 'Times-Bold', 13, C.ink);
  m.facts.forEach((f, i) => {
    const ry = 364 + i * 32;
    c.text(fx + 14, ry, f.label, 'Helvetica', 9.5, C.mut);
    c.text(fx + fw - 14, ry, f.value, 'Helvetica-Bold', 10.5, C.ink, 'right');
    if (i < m.facts.length - 1) c.ops.push({ k: 'line', x1: fx + 14, y1: ry + 12, x2: fx + fw - 14, y2: ry + 12, color: C.line, lw: 0.5 });
  });
  // Approved.
  c.ops.push({ k: 'rect', x: L, y: 524, w: W, h: 70, r: 8, stroke: C.line, lw: 0.8 });
  c.ops.push({ k: 'circle', cx: L + 34, cy: 559, r: 19, fill: C.mint });
  c.ops.push({ k: 'line', x1: L + 25, y1: 559, x2: L + 31, y2: 566, color: C.ink, lw: 2.4 });
  c.ops.push({ k: 'line', x1: L + 31, y1: 566, x2: L + 44, y2: 551, color: C.ink, lw: 2.4 });
  c.text(L + 66, 546, `Approved by the surveyor on ${m.approved_on}. Version ${String(m.version)}.`, 'Helvetica-Bold', 10.5, C.ink);
  c.text(L + 66, 561, 'Each figure says where it came from. Every figure the surveyor set carries their name.', 'Helvetica', 9.5, C.body);
  c.text(L + 66, 577, `Report reference (fingerprint): ${m.fingerprint.slice(0, 8)}…${m.fingerprint.slice(-7)}`, 'Helvetica', 8.5, C.mut);
  // 2 Oct 2026, stage 6: the site plan, from Ordnance Survey's free maps, when the version has one.
  if (m.site_plan !== null) {
    const top = 612;
    const side = 150; // the box ends at the page's bottom margin (BOTTOM, 778)
    c.ops.push({ k: 'rect', x: L, y: top, w: W, h: side + 16, r: 8, stroke: C.line, lw: 0.8 });
    c.ops.push(...sitePlanOps(m.site_plan, L + 8, top + 8, side));
    const tx = L + side + 26;
    const tw = W - side - 40;
    c.text(tx, top + 26, 'Site plan', 'Times-Bold', 13, C.ink);
    let py = top + 46;
    for (const line of wrapText(`${pickWords(m.site_plan)} The grey ones are the buildings round it. North is up.`, 'Helvetica', 9.5, tw)) { c.text(tx, py, line, 'Helvetica', 9.5, C.body); py += 13; }
    py += 6;
    for (const line of wrapText(`The plan shows buildings only, not the legal boundary of the site. ${m.site_plan.attribution}.`, 'Helvetica', 8, tw)) { c.text(tx, py, line, 'Helvetica', 8, C.mut); py += 11; }
  }

  /* ---------------------------------------------------------- 2 · how it is worked out */
  c.page();
  c.heading('01', 'How the figure is worked out');
  // PHASE 159f (L12): a report with any test rate says so before anything else in the method.
  if (m.test_rates) c.para('TEST RATES. Some rates in this report are invented test figures, not BCIS. It is not a real valuation.', { size: 11, color: C.ink, after: 8 });
  c.para(m.method_lede, { size: 11, color: C.ink, after: 12 });
  const boxW = W / m.flow.length;
  m.flow.forEach((f, i) => {
    const x = L + i * boxW;
    const end = i === m.flow.length - 1;
    c.ops.push({ k: 'rect', x, y: c.y, w: boxW, h: 62, fill: end ? C.ink : C.mist, stroke: C.line, lw: 0.6 });
    c.text(x + boxW / 2, c.y + 16, f.label, 'Helvetica', 8.5, end ? C.white : C.body, 'center');
    c.text(x + boxW / 2, c.y + 35, fit(f.value, 'Times-Bold', 12.5, boxW - 8), 'Times-Bold', 12.5, end ? C.white : C.ink, 'center');
    c.text(x + boxW / 2, c.y + 51, fit(f.note, 'Helvetica', 7.5, boxW - 8), 'Helvetica', 7.5, end ? C.white : C.mut, 'center');
  });
  c.y += 76;
  const sum = wrapText(m.sum_words.join(' '), 'Helvetica', 9.5, W - 24);
  c.ops.push({ k: 'rect', x: L, y: c.y, w: W, h: sum.length * 13.5 + 30, r: 6, stroke: C.line, lw: 0.8, dash: 3 });
  c.text(L + 12, c.y + 19, 'The sum, in full.', 'Helvetica-Bold', 9.5, C.ink);
  sum.forEach((line, i) => c.text(L + 12, c.y + 33 + i * 13.5, line, 'Helvetica', 9.5, C.ink));
  c.y += sum.length * 13.5 + 44;
  // The two pools.
  const half = (W - 12) / 2;
  const pools = [
    { title: `Main pool · ${m.pools.main.total}`, words: `Plant and machinery that is not part of the building’s own systems.${m.pools.main.items.length === 0 ? '' : ` Here: ${m.pools.main.items.join('; ')}.`}` },
    { title: `Special rate pool · ${m.pools.special.total}`, words: `The building’s own systems, called integral features.${m.pools.special.items.length === 0 ? '' : ` Here: ${m.pools.special.items.join('; ')}.`}` },
  ];
  const poolLines = pools.map((p) => wrapText(p.words, 'Helvetica', 9.5, half - 24).slice(0, 7));
  const ph = Math.max(...poolLines.map((l) => l.length)) * 13 + 44;
  pools.forEach((p, i) => {
    const x = L + i * (half + 12);
    c.ops.push({ k: 'rect', x, y: c.y, w: half, h: ph, r: 8, stroke: C.line, lw: 0.8 });
    c.text(x + 12, c.y + 20, fit(p.title, 'Times-Bold', 12, half - 24), 'Times-Bold', 12, C.ink);
    poolLines[i]?.forEach((line, j) => c.text(x + 12, c.y + 38 + j * 13, line, 'Helvetica', 9.5, C.body));
  });
  c.y += ph + 22;
  // PHASE 159c: each spend on the building, where there is work since.
  if (m.events.length > 0) {
    c.need(40);
    c.text(L, c.y, 'Each spend on the building', 'Times-Bold', 13, C.ink);
    c.y += 8;
    for (const e of m.events) c.para(`${e.label}: ${e.qualifying} qualifies (main pool ${e.main}, special rate pool ${e.special}). ${e.note}`, { size: 9.5, after: 4 });
    c.para(`Total: ${m.headline.qualifying} qualifies.`, { font: 'Helvetica-Bold', size: 9.5, color: C.ink, after: 14 });
  }
  c.text(L, c.y, 'Where each number came from', 'Times-Bold', 13, C.ink);
  c.y += 16;
  const srcHead = (y: number) => {
    c.text(L, y, 'VALUE', 'Helvetica-Bold', 7.5, C.mut, 'left', 0.6);
    c.text(L + 210, y, 'FIGURE', 'Helvetica-Bold', 7.5, C.mut, 'right', 0.6);
    c.text(L + 224, y, 'SOURCE', 'Helvetica-Bold', 7.5, C.mut, 'left', 0.6);
  };
  srcHead(c.y);
  c.y += 6;
  for (const r of m.sources) {
    const why = r.reason === null ? [] : wrapText(`“${r.reason}”`, 'Helvetica', 9, W - 224 - (textWidth(r.chip.words, 'Helvetica-Bold', 7) + 14));
    const rh = Math.max(1, why.length) * 12 + 12;
    c.need(rh);
    c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.5 });
    c.text(L, c.y + 15, r.label, 'Helvetica', 9.5, C.body);
    c.text(L + 210, c.y + 15, r.value, 'Helvetica', 9.5, C.ink, 'right');
    c.chip(L + 224, c.y + 15, r.chip);
    const cx = L + 224 + (r.chip.kind === 'NONE' ? 0 : textWidth(r.chip.words, 'Helvetica-Bold', 7) + 14);
    why.forEach((line, j) => c.text(cx, c.y + 15 + j * 12, line, 'Helvetica', 9, C.body));
    c.y += rh;
  }
  c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.5 });
  c.y += 16;
  c.para('Key: “Evidence” — taken from a record or document. “Our draft” — prepared by Cap Rebate and checked by the surveyor. A name — set by the surveyor.', { size: 8.5, color: C.mut });

  /* ---------------------------------------------------------- 3 · item by item */
  c.page();
  c.heading('02', 'What qualifies, item by item');
  c.para('Each item’s rebuild cost is how much there is × the rate. The share that qualifies gives its qualifying cost.', { size: 11, color: C.ink, after: 10 });
  const col = { qty: L + 250, rate: L + 305, cost: L + 365, qpct: L + 410, q: R };
  const itemW = 196;
  const tableHead = () => {
    c.need(30);
    c.y += 12;
    c.text(L, c.y, 'ITEM', 'Helvetica-Bold', 7, C.mut, 'left', 0.5);
    for (const [x, t] of [[col.qty, 'HOW MUCH'], [col.rate, 'RATE'], [col.cost, 'REBUILD COST'], [col.qpct, 'QUALIFIES'], [col.q, 'QUALIFYING COST']] as const) c.text(x, c.y, t, 'Helvetica-Bold', 7, C.mut, 'right', 0.5);
    c.y += 6;
    c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.6 });
  };
  tableHead();
  for (const g of m.groups) {
    c.need(52);
    if (c.y < 70) tableHead();
    c.ops.push({ k: 'rect', x: L, y: c.y, w: W, h: 20, fill: C.mist });
    c.text(L + 6, c.y + 14, g.title, 'Helvetica-Bold', 9.5, C.ink);
    c.y += 20;
    for (const r of g.rows) {
      const lines = wrapText(r.label, 'Helvetica', 9.5, itemW).slice(0, 3);
      const rh = Math.max(lines.length * 12 + 26, 36);
      if (c.y + rh > BOTTOM) { c.page(); tableHead(); }
      const top = c.y;
      lines.forEach((line, i) => c.text(L + 2, top + 14 + i * 12, line, 'Helvetica', 9.5, C.ink));
      c.text(L + 2, top + 14 + lines.length * 12, fit(r.seen === null ? r.unit : `${r.unit} · ${r.seen}`, 'Helvetica', 7.5, itemW), 'Helvetica', 7.5, C.mut);
      const by = top + 19 + lines.length * 12;
      c.ops.push({ k: 'rect', x: L + 2, y: by, w: itemW * 0.85, h: 4, r: 2, fill: C.track });
      if (r.share > 0) c.ops.push({ k: 'rect', x: L + 2, y: by, w: Math.max(4, (itemW * 0.85 * r.share) / 100), h: 4, r: 2, fill: g.pool === 'SR' ? C.sr : C.mp });
      c.text(col.qty, top + 14, r.qty, 'Helvetica', 9.5, C.ink, 'right');
      c.chip(col.qty, top + 27, r.qty_chip, 'right');
      c.text(col.rate, top + 14, r.rate, 'Helvetica', 9.5, C.ink, 'right');
      c.chip(col.rate, top + 27, r.rate_chip, 'right');
      c.text(col.cost, top + 14, r.cost, 'Helvetica', 9.5, C.ink, 'right');
      c.text(col.qpct, top + 14, r.qpct, 'Helvetica', 9.5, C.ink, 'right');
      c.chip(col.qpct, top + 27, r.qpct_chip, 'right');
      c.text(col.q, top + 14, r.qualifying, 'Helvetica-Bold', 9.5, C.ink, 'right');
      c.y += rh;
      c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.5 });
    }
  }
  c.need(30);
  c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.ink, lw: 1.5 });
  c.text(L + 2, c.y + 16, 'Total', 'Helvetica-Bold', 10, C.ink);
  c.text(col.cost, c.y + 16, m.totals.cost, 'Helvetica-Bold', 10, C.ink, 'right');
  c.text(col.q, c.y + 16, m.totals.qualifying, 'Helvetica-Bold', 10, C.ink, 'right');
  c.y += 30;
  c.para('The bars show each item’s share of the qualifying total. These are rebuild costs. The figure on the cover is the same share of what was actually paid.', { size: 8.5, color: C.mut, after: 14 });
  if (m.taken_out.length > 0) {
    c.need(40);
    c.y += 10;
    c.text(L, c.y, `Checked and not in this building (${String(m.taken_out.length)})`, 'Times-Bold', 13, C.ink);
    c.y += 6;
    c.para(`${m.taken_out.join('; ')}. The surveyor took each out with a reason, kept with this report.`, { size: 8.5, color: C.mut });
  }
  // PHASE 159f (item 4): where each rate comes from, in full.
  c.need(40);
  c.y += 10;
  c.text(L, c.y, 'Where each rate comes from', 'Times-Bold', 13, C.ink);
  c.y += 6;
  for (const r of m.rate_sources) c.para(`${r.label}. ${r.words}`, { size: 8.5, color: C.mut, after: 2 });

  /* ---------------------------------------------------------- 4 · the legal check, and next */
  c.page();
  c.heading('03', 'Can you claim? The legal check');
  const lv = m.legal.level;
  const [lbg, lfg] = lv === 'GREEN' ? [C.okbg, C.ok] : lv === 'URGENT' ? [C.sv[0] as Rgb, C.sv[1] as Rgb] : [C.warnbg, C.warn];
  const lw = textWidth(m.legal.level_words, 'Helvetica-Bold', 9.5) + 16;
  c.ops.push({ k: 'rect', x: L, y: c.y, w: lw, h: 17, r: 8.5, fill: lbg, stroke: lfg, lw: 0.8 });
  c.text(L + 8, c.y + 12, m.legal.level_words, 'Helvetica-Bold', 9.5, lfg);
  const hl = wrapText(m.legal.headline, 'Helvetica-Bold', 10, W - lw - 10);
  hl.forEach((line, i) => c.text(L + lw + 10, c.y + 12 + i * 13, line, 'Helvetica-Bold', 10, C.ink));
  c.y += Math.max(1, hl.length) * 13 + 14;
  c.para('A buyer from a business that could claim may get nothing on the fixtures. The value must have been fixed in time (sections 187A and 198 of the Act). We asked the questions below. Each answer says where it came from.', { after: 10 });
  if (m.legal.answers.length > 0) {
    const qx = [L, L + 250, L + 380];
    c.y += 10;
    for (const [i, t] of ['QUESTION', 'ANSWER', 'FROM'].entries()) c.text(qx[i] ?? L, c.y, t, 'Helvetica-Bold', 7, C.mut, 'left', 0.5);
    c.y += 6;
    for (const a of m.legal.answers) {
      const cells = [wrapText(a.ask, 'Helvetica', 9, 240), wrapText(a.answer, 'Helvetica', 9, 122), wrapText(a.source, 'Helvetica', 9, W - 380)];
      const rh = Math.max(...cells.map((x) => x.length)) * 12 + 10;
      c.need(rh);
      c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.5 });
      cells.forEach((lines, i) => lines.forEach((line, j) => c.text(qx[i] ?? L, c.y + 14 + j * 12, line, 'Helvetica', 9, C.body)));
      c.y += rh;
    }
    c.ops.push({ k: 'line', x1: L, y1: c.y, x2: R, y2: c.y, color: C.line, lw: 0.5 });
  }
  c.y += 16;
  // PHASE 159d (item 6): which way each part of the claim goes in.
  if (m.routes.length > 0) {
    c.need(40);
    c.text(L, c.y, 'How each part goes in', 'Times-Bold', 13, C.ink);
    c.y += 8;
    for (const r of m.routes) c.para(`${r.label}. ${r.words}`, { size: 9.5, after: 4 });
    c.y += 8;
  }
  // PHASE 159e (item 6): each part's year and allowances, then year by year.
  c.need(40);
  c.text(L, c.y, 'The allowances, part by part', 'Times-Bold', 13, C.ink);
  c.y += 8;
  for (const p of m.allowances.parts) {
    c.para(`${p.part}. ${p.route} The year it goes in: ${p.year}. Relief in that year: ${p.reliefs} Added to the pool: ${p.to_pool}. Structures allowance: ${p.sba}`, { size: 9.5, after: 4 });
  }
  c.need(40);
  c.text(L, c.y + 8, 'Year by year', 'Times-Bold', 13, C.ink);
  c.y += 16;
  for (const y of m.allowances.years) {
    c.para(`${y.year}: all allowances ${y.total} (first-year relief ${y.first_year}; main pool ${y.main}; special rate pool ${y.special}; structures allowance ${y.sba}). Carried on: main pool ${y.main_cf}, special rate pool ${y.special_cf}.`, { size: 9.5, after: 4 });
  }
  c.y += 8;
  c.heading('04', 'What happens next');
  m.next.forEach((s, i) => {
    const title = wrapText(s.title, 'Helvetica-Bold', 10, W - 36);
    const words = wrapText(s.words, 'Helvetica', 10, W - 36);
    c.need((title.length + words.length) * 14 + 14);
    c.ops.push({ k: 'circle', cx: L + 11, cy: c.y + 8, r: 11, fill: C.mint });
    c.text(L + 11, c.y + 12, String(i + 1), 'Helvetica-Bold', 10, C.ink, 'center');
    title.forEach((line, j) => c.text(L + 32, c.y + 12 + j * 14, line, 'Helvetica-Bold', 10, C.ink));
    words.forEach((line, j) => c.text(L + 32, c.y + 12 + (title.length + j) * 14, line, 'Helvetica', 10, C.body));
    c.y += (title.length + words.length) * 14 + 14;
  });

  /* ---------------------------------------------------------- 5 · the declaration */
  c.page();
  c.heading('05', 'The surveyor’s declaration');
  const decl = m.declaration.map((d, i) => wrapText(`${String(i + 1)}.  ${d}`, 'Helvetica', 10.5, W - 40));
  const dh = decl.reduce((a, l) => a + l.length * 15 + 4, 0) + 92;
  c.ops.push({ k: 'rect', x: L, y: c.y, w: W, h: dh, r: 8, stroke: C.ink, lw: 1.5 });
  let dy = c.y + 24;
  for (const lines of decl) { lines.forEach((line) => { c.text(L + 20, dy, line, 'Helvetica', 10.5, C.ink); dy += 15; }); dy += 4; }
  const sw = (W - 40 - 24) / 3;
  const sig = [[m.surveyor.name, 'Surveyor'], [`RICS no. ${m.surveyor.rics}`, m.surveyor.firm ?? ''], [`${m.approved_on}, ${m.approved_clock}`, `Approved online, version ${String(m.version)}`]] as const;
  sig.forEach(([a, b], i) => {
    const x = L + 20 + i * (sw + 12);
    c.ops.push({ k: 'line', x1: x, y1: dy + 12, x2: x + sw, y2: dy + 12, color: C.ink, lw: 0.8 });
    c.text(x, dy + 28, fit(a, 'Helvetica-Bold', 10, sw), 'Helvetica-Bold', 10, C.ink);
    c.text(x, dy + 42, fit(b, 'Helvetica', 9, sw), 'Helvetica', 9, C.body);
  });
  c.y += dh + 26;
  if (m.inspection !== null) {
    c.text(L, c.y, 'How the building was inspected', 'Times-Bold', 13, C.ink);
    c.y += 6;
    c.para(m.inspection, { after: 16 });
    c.y += 10;
  }
  if (m.assumptions.length > 0) {
    c.text(L, c.y, 'What we assume', 'Times-Bold', 13, C.ink);
    c.y += 6;
    for (const a of m.assumptions) c.para(a, { after: 8 });
    c.y += 10;
  }
  c.text(L, c.y, 'The report’s fingerprint', 'Times-Bold', 13, C.ink);
  c.y += 6;
  c.para('This code belongs to this exact report. If a single figure were changed, the code would change. We keep the approved report and its code.', { after: 4 });
  c.para(m.fingerprint, { font: 'Helvetica', size: 8.5, color: C.ink, after: 18 });
  const ai = wrapText(m.automation_note, 'Helvetica', 9.5, W - 32);
  c.need(ai.length * 13 + 44);
  c.ops.push({ k: 'rect', x: L, y: c.y, w: W, h: ai.length * 13 + 40, r: 8, fill: C.mist });
  c.text(L + 16, c.y + 22, 'How this report was made', 'Times-Bold', 11.5, C.ink);
  ai.forEach((line, i) => c.text(L + 16, c.y + 38 + i * 13, line, 'Helvetica', 9.5, C.body));
  c.y += ai.length * 13 + 52;

  /* ---------------------------------------------------------- 6 · PHASE 153g: the surveyor's chapters */
  if (m.chapters.length > 0) {
    c.page();
    c.heading('06', 'The surveyor’s chapters');
    c.para('Each chapter as the surveyor approved it. Anything not on file says so; nothing is filled in for them.', { after: 10 });
    for (const ch of m.chapters) {
      c.need(40);
      c.text(L, c.y, `${String(ch.n)} · ${ch.title}`, 'Times-Bold', 12.5, C.ink);
      c.y += 6;
      if (!ch.applies && ch.not_applies_words !== null) c.para(ch.not_applies_words, { after: 6 });
      for (const r of ch.rows) c.para(`${r.label}: ${r.value ?? r.missing}`, { after: 4 });
      for (const i of ch.items) c.para(`${i.label} — ${i.detail}`, { after: 4 });
      c.y += 10;
    }
  }

  return buildCanvasPdf(c.finish(), { title: `${REPORT_TITLE} · ${m.company} · version ${String(m.version)}` });
}
