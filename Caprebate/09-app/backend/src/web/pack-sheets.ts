/**
 * THE SURVEY PACK'S OTHER TEN CHAPTERS — PHASE 153g, 4 October 2026.
 *
 * Chapters 5, 8, 11, 14, 16, 17, 18, 19, 20 and 22 (the report template's sections of the same numbers,
 * 04-phase-work/phase9/surveyor-valuation-report-template-v2.md). Each is a SHEET: rows read from the pack, the claim, the
 * registers we hold, or the surveyor's own words (src/web/pack-words.ts), and nothing else. One reading, used three ways:
 * the pack's pages (src/web/survey-pack-pages.ts), the approved version (src/web/pack-approve.ts) and the client's report
 * (src/web/survey-report.ts), so the page, the version and the report never disagree.
 *
 * N4: a row with nothing behind it is null, shown as "not on file" (a record), "not written yet" (the surveyor's words)
 * or "not worked out yet" (a sum), never a guess and never a default. No land fraction, dwelling fraction or qualifying
 * percentage is ever drafted here (the template's own rule).
 *
 * The Phase 153e lines each chapter carries are named on the chapter (the order: 04-phase-work/phase153f/
 * survey-pack-chapters-order.md).
 */
import type { Db } from '../db.ts';
import type { PackView, ViewLine } from './survey-pack.ts';
import { packWords, WORD_FIELDS, type WordField } from './pack-words.ts';
import { claimantTypeReading, captured, latestFacts } from './claim-facts.ts';
import { funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
import { proposeRanges } from './sector-ranges.ts';
import { deskFirstReading } from './desk-first.ts';
import { basisOf, evidenceByLine } from './survey-evidence.ts';
import { findingSeen, FINDING_LABELS } from './finding-source.ts';
import { REPORT_ASSUMPTIONS } from './report-assumptions.ts';
import { ESTIMATED_AREA_LABEL } from '../connectors/homedata.ts';
import { BAND } from './engine.ts';
import { poundsWords, percentWords, quantityWords } from './pack-sums.ts';

/** Where a row's value comes from — shown beside it, so nothing reads as more certain than it is. */
export type RowFrom = 'the pack' | 'the claim' | 'Land Registry' | 'the energy certificate' | 'Homedata (estimate)' | 'the client'
  | 'worked out' | 'fixed wording' | 'the surveyor' | 'the documents';

export type SheetRow = {
  readonly label: string;
  /** Null when nothing is behind it (N4). */
  readonly value: string | null;
  readonly from: RowFrom;
  /** For the surveyor's words: who wrote them and when. */
  readonly by?: string;
  /** The word for a missing value: "not on file", "not written yet", "not worked out yet". */
  readonly missing: string;
};

export type Sheet = {
  readonly n: number;
  readonly title: string;
  readonly lede: string;
  /** False where the chapter does not apply to this job (a dwelling split for a dental practice); it still shows why. */
  readonly applies: boolean;
  readonly not_applies_words: string | null;
  readonly rows: readonly SheetRow[];
  /** The surveyor's words this chapter asks for (each a form on the page). */
  readonly words: readonly WordField[];
  /** A list of items (chapter 19's judgement calls). */
  readonly items: readonly { readonly label: string; readonly detail: string }[];
  /** The Phase 153e lines it carries, for the developer's record; not shown to the client. */
  readonly carries: string;
};

export const SHEET_CHAPTERS: readonly number[] = Object.freeze([5, 8, 11, 14, 16, 17, 18, 19, 20, 22]);

const NOT_ON_FILE = 'not on file';
const NOT_WRITTEN = 'not written yet';
const NOT_WORKED = 'not worked out yet';

function record(db: Db, business_id: string, property_id: string | null, source: string): Record<string, unknown> | null {
  const r = db.get<{ fields_json: string }>(
    'SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND (property_id = ? OR ? IS NULL) ORDER BY obtained_at DESC LIMIT 1',
    [business_id, source, property_id, property_id]);
  if (r === undefined) return null;
  try { const o = JSON.parse(r.fields_json) as unknown; return o !== null && typeof o === 'object' ? o as Record<string, unknown> : null; } catch { return null; }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

function docsHeld(db: Db, business_id: string, type_code: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ?', [business_id, type_code])?.n ?? 0;
}

/** The job's own facts the sheets need, read once. */
type Ctx = {
  readonly db: Db; readonly v: PackView;
  readonly words: ReturnType<typeof packWords>;
  readonly triggers: readonly string[] | null;
  readonly funnel: Record<string, unknown> | undefined;
};

function wordsRow(c: Ctx, f: WordField): SheetRow {
  const w = c.words.get(f);
  return { label: WORD_FIELDS[f].label, value: w?.words ?? null, from: 'the surveyor', ...(w === undefined || w.words === null ? {} : { by: w.by_name }), missing: NOT_WRITTEN };
}

function triggersOf(db: Db, v: PackView): { triggers: readonly string[] | null; funnel: Record<string, unknown> | undefined } {
  const a = db.get<{ assessment_id: string | null }>('SELECT assessment_id FROM surveyor_jobs WHERE id = ?', [v.job.id])?.assessment_id ?? null;
  const state = a === null ? undefined : funnelStateFor(db, a);
  if (state === undefined) return { triggers: null, funnel: undefined };
  const t = (sessionFromFunnel(v.job.sector as Parameters<typeof sessionFromFunnel>[0], state).session as { trigger?: unknown }).trigger;
  return { triggers: Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : null, funnel: state };
}

const TRIGGER_WORDS: Readonly<Record<string, string>> = Object.freeze({
  purchase: 'a purchase', new_build: 'a new building', fitout: 'a fit-out', fit_out: 'a fit-out', refurb: 'refurbishment works',
  conversion: 'a conversion', refurb_fitout: 'refurbishment or fit-out',
});

/* ------------------------------------------------------------------ the ten sheets */

function building(c: Ctx): Sheet {
  const { db, v } = c;
  const pid = v.property?.id ?? null;
  const title = record(db, v.job.business_id, pid, 'HMLR_TITLE');
  const epc = record(db, v.job.business_id, pid, 'EPC');
  const hd = record(db, v.job.business_id, pid, 'HOMEDATA_ADDRESS');
  const est = hd?.['estimated_floor_area'] as { floor_area_m2?: unknown } | undefined;
  const gia = v.inputs.gia_milli_m2.value;
  const photos = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM survey_photos p LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL', [v.job.id])?.n ?? 0;
  const plans = docsHeld(db, v.job.business_id, 'PLANS');
  return {
    n: 5, title: 'The building', applies: true, not_applies_words: null,
    lede: 'What the building is, from the records we hold and your own words. Floor area and construction drive the whole split.',
    rows: [
      { label: 'Address', value: v.property === null ? null : `${v.property.label}${v.property.postcode === null ? '' : `, ${v.property.postcode}`}`, from: 'the pack', missing: NOT_ON_FILE },
      { label: 'Title number', value: str(title?.['title_number']), from: 'Land Registry', missing: NOT_ON_FILE },
      { label: 'Floor area in the pack', value: gia === null ? null : `${quantityWords(gia)} m²`, from: 'the pack', missing: 'needed (chapter 9)' },
      { label: 'Floor area on the energy certificate', value: str(epc?.['epc_total_floor_area_m2']) === null ? null : `${str(epc?.['epc_total_floor_area_m2'])} m²`, from: 'the energy certificate', missing: NOT_ON_FILE },
      { label: 'Age band on the energy certificate', value: str(epc?.['epc_construction_age_band']), from: 'the energy certificate', missing: NOT_ON_FILE },
      { label: 'Property type on the energy certificate', value: str(epc?.['epc_property_type']), from: 'the energy certificate', missing: NOT_ON_FILE },
      // Phase 153e line 16: Homedata's floor-area estimate, only where it was fetched (its switch ships off), always labelled.
      ...(typeof est?.floor_area_m2 === 'number' ? [{ label: `Floor area, ${ESTIMATED_AREA_LABEL}`, value: `${String(est.floor_area_m2)} m²`, from: 'Homedata (estimate)' as const, missing: NOT_ON_FILE }] : []),
      // Phase 153e line 4: supported living's shared areas, from the floor plans.
      ...(v.job.sector === 'supported_living' ? [{ label: 'Shared areas, from the floor plans', value: v.shared_area.value === null ? null : `${quantityWords(v.shared_area.value)} m²`, from: 'the pack' as const, missing: 'not measured (chapter 9)' }] : []),
      { label: 'Floor plans held', value: plans === 0 ? null : `${String(plans)}`, from: 'the documents', missing: 'none held' },
      { label: 'Photographs from the client', value: photos === 0 ? null : `${String(photos)}`, from: 'the client', missing: 'none' },
      wordsRow(c, 'construction_type'), wordsRow(c, 'build_year'), wordsRow(c, 'building_other'),
    ],
    words: ['construction_type', 'build_year', 'building_other'], items: [], carries: '153e lines 4 and 16',
  };
}

function dwellings(c: Ctx): Sheet {
  const { v } = c;
  const applies = v.job.sector === 'supported_living' || v.job.sector === 'care_homes';
  const slSwitch = (BAND as { SWITCHES?: { sl_band_by_trigger?: unknown } }).SWITCHES?.sl_band_by_trigger === true;
  return {
    n: 8, title: 'Dwellings', applies,
    not_applies_words: applies ? null : 'Only for supported living and care homes with homes in them. This job has none, so nothing is split out as a dwelling.',
    lede: 'How much of the building is homes, which do not qualify, and how that line was drawn. No fraction is offered: the method and the figure are yours.',
    rows: !applies ? [] : [
      ...(v.job.sector === 'supported_living' ? [
        { label: 'Shared areas, from the floor plans', value: v.shared_area.value === null ? null : `${quantityWords(v.shared_area.value)} m²`, from: 'the pack' as const, missing: 'not measured: the 25% fallback is used, and labelled (chapter 9)' },
        { label: 'Range read by the kind of work', value: slSwitch ? 'on: the range for this job’s own kind of work' : 'off: the refurbishment range, whatever the work (a test switch)', from: 'fixed wording' as const, missing: NOT_ON_FILE },
      ] : []),
      wordsRow(c, 'dwelling_method'), wordsRow(c, 'dwelling_segregation'),
    ],
    words: applies ? ['dwelling_method', 'dwelling_segregation'] : [], items: [], carries: '153e lines 4 and 9',
  };
}

function bareLand(c: Ctx): Sheet {
  const { v } = c;
  const land = v.inputs.land_pence;
  return {
    n: 11, title: 'Bare land', applies: true, not_applies_words: null,
    lede: 'What the site is worth as bare land, and on what evidence. It is the biggest single lever on the split, and no default is offered.',
    rows: [
      { label: 'Bare land value', value: land.value === null ? null : poundsWords(land.value), from: land.source?.kind === 'SURVEYOR' ? 'the surveyor' : 'the pack', ...(land.source?.by_name ? { by: land.source.by_name } : {}), missing: 'needed (chapter 9)' },
      wordsRow(c, 'land_comparables'), wordsRow(c, 'land_voa'), wordsRow(c, 'land_date'), wordsRow(c, 'land_planning_basis'),
      // Phase 153e line 11: the planning assumption, as it goes in the report.
      ...REPORT_ASSUMPTIONS.map((a) => ({ label: 'What we assume about planning', value: a, from: 'fixed wording' as const, missing: NOT_ON_FILE })),
    ],
    words: ['land_comparables', 'land_voa', 'land_date', 'land_planning_basis'], items: [], carries: '153e lines 11 and 12',
  };
}

/** Qualifying spend as a share of cost, over the counted lines of one kind; null if any of them is not complete. */
function share(v: PackView, pick: (l: ViewLine) => boolean): { pct: string | null; count: number } {
  const sum = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  const ls = v.lines.filter((l) => !l.removed && pick(l));
  let cost = 0, q = 0;
  for (const l of ls) {
    const s = sum.get(l.id);
    if (s === undefined || s.cost_pence === null || s.qualifying_pence === null) return { pct: null, count: ls.length };
    cost += s.cost_pence; q += s.qualifying_pence;
  }
  return { pct: ls.length === 0 || cost === 0 ? null : percentWords(Math.round((q * 10000) / cost)), count: ls.length };
}

const judgement = (l: ViewLine) => /JUDGEMENT|CONTESTED/.test(l.template?.status ?? '');

function qualifyingShare(c: Ctx): Sheet {
  const { v } = c;
  const sr = share(v, (l) => l.pool === 'SR'), mp = share(v, (l) => l.pool === 'MP'), jd = share(v, judgement);
  const residual = v.sums.qualifying_pence === null || v.sums.building_price_pence === null ? null : v.sums.building_price_pence - v.sums.qualifying_pence;
  return {
    n: 14, title: 'Qualifying share', applies: true, not_applies_words: null,
    lede: 'Every percentage from chapters 10 and 12 in one place, for one visible sign-off. Worked out from the lines; none is drafted.',
    rows: [
      { label: `Special rate items (${String(sr.count)})`, value: sr.pct, from: 'worked out', missing: NOT_WORKED },
      { label: `Main pool items (${String(mp.count)})`, value: mp.pct, from: 'worked out', missing: NOT_WORKED },
      { label: `Judgement or contested items (${String(jd.count)})`, value: jd.pct, from: 'worked out', missing: jd.count === 0 ? 'none in this pack' : NOT_WORKED },
      { label: 'The building’s structure (what is left after the plant)', value: residual === null ? null : poundsWords(residual), from: 'worked out', missing: NOT_WORKED },
      wordsRow(c, 'qpct_basis'),
      // Phase 153e lines 7, 8 and 10: built in the cost model's own tests; not in the pack until Phase 157 wires it in.
      { label: 'Cost model checks', value: 'Three checks are built in the cost model’s own tests: site costs by job size, the insurance figure, and a past claim. They are not in this pack yet.', from: 'fixed wording', missing: NOT_ON_FILE },
    ],
    words: ['qpct_basis'], items: [], carries: '153e lines 7, 8 and 10',
  };
}

function leaseback(c: Ctx): Sheet {
  return {
    n: 16, title: 'Leaseback', applies: true, not_applies_words: null,
    lede: 'Whether the property was sold and leased back, and its disposal value. No figure is offered: a disposal value is its own piece of work.',
    rows: [
      { label: 'Sale and leaseback', value: null, from: 'the claim', missing: 'not on file: we do not ask yet' },
      wordsRow(c, 'disposal_value'),
    ],
    words: ['disposal_value'], items: [], carries: 'none',
  };
}

function structures(c: Ctx): Sheet {
  const { db, v } = c;
  const facts = v.job.claim_id === null ? null : latestFacts(db, v.job.claim_id);
  const sba = facts === null ? null : captured(facts, 'SBA_QUALIFYING_EXPENDITURE');
  // The LATEST year written: a renovation after 29 October 2018 counts as much as the build (the template's own field).
  const years = [...(c.words.get('build_year')?.words ?? '').matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const year = years.length === 0 ? null : String(Math.max(...years));
  const post2018 = year === null ? null : Number(year) >= 2019 ? 'Yes, from the latest year in chapter 5' : Number(year) <= 2017 ? 'No, from the latest year in chapter 5' : null;
  const residual = v.sums.qualifying_pence === null || v.sums.building_price_pence === null ? null : v.sums.building_price_pence - v.sums.qualifying_pence;
  return {
    n: 17, title: 'Structures allowance', applies: true, not_applies_words: null,
    lede: 'The structures and buildings allowance, which is tested separately from plant. The tax adviser decides it; this chapter holds the facts.',
    rows: [
      { label: 'Built or renovated after 29 October 2018', value: post2018, from: 'worked out', missing: year === null ? 'not known: no year in chapter 5' : 'not known: 2018 needs the exact date' },
      { label: 'The seller’s allowance statement', value: null, from: 'the documents', missing: 'not on file' },
      { label: 'What is left after the plant and the land', value: residual === null ? null : poundsWords(residual), from: 'worked out', missing: NOT_WORKED },
      { label: 'Recorded on the claim', value: sba !== null && sba.known && typeof sba.value === 'string' ? sba.display : null, from: 'the claim', missing: NOT_ON_FILE },
      { label: 'On a later sale', value: 'The structures allowance lowers the base cost for capital gains tax; plant allowances do not.', from: 'fixed wording', missing: NOT_ON_FILE },
    ],
    words: [], items: [], carries: 'none',
  };
}

function otherReliefs(c: Ctx): Sheet {
  const ct = claimantTypeReading(c.db, c.v.job.business_id);
  return {
    n: 18, title: 'Other reliefs', applies: true, not_applies_words: null,
    lede: 'Land remediation relief sits beside capital allowances. These are flags for the tax adviser, not findings.',
    rows: [
      { label: 'A company, for land remediation relief', value: ct.known ? (ct.value === 'COMPANY' ? 'Yes' : `No: ${ct.display}`) : null, from: 'the claim', missing: NOT_ON_FILE },
      { label: 'Contamination taken on from someone else', value: null, from: 'the claim', missing: 'not on file' },
      { label: 'Who caused it', value: 'For the tax adviser.', from: 'fixed wording', missing: NOT_ON_FILE },
    ],
    words: [], items: [], carries: 'none',
  };
}

const CORE: Readonly<Record<string, string>> = Object.freeze({
  care_homes: 'How the shared areas were split from the homes, and whether the property and the care business are in the same group.',
  dental: 'Whether each chair is a fixture or a chattel, and the value of fixtures in a pension scheme’s property.',
  supported_living: 'Whether this is supported living or a registered care home.',
  gp: 'No judgement of its own beyond the fixtures (the template asks whether that is right).',
  private_hospital: 'Main pool against special rate for each item, and the value on a sale and leaseback.',
});

function judgementCalls(c: Ctx): Sheet {
  const { v } = c;
  const items = v.lines.filter((l) => !l.removed && judgement(l)).map((l) => {
    const by = [l.qty_milli.source, l.rate_pence.source, l.qpct_bp.source, l.pool_source].some((s) => s?.kind === 'SURVEYOR') ? 'you set it' : 'our draft';
    const pool = l.pool === null ? 'no pool yet' : l.pool === 'SR' ? 'special rate' : 'main pool';
    const pct = l.qpct_bp.value === null ? 'share needed' : `${percentWords(l.qpct_bp.value)} qualifies`;
    const why = l.template?.authority ? ` · ${l.template.authority}` : '';
    return { label: l.label, detail: `${l.template?.status ?? ''}: ${pool}, ${pct} (${by})${why}` };
  });
  // Phase 153e line 9: the range proposed from approved packs for this sector, once five exist.
  const p = proposeRanges(c.db).proposals.filter((x) => x.sector === v.job.sector);
  return {
    n: 19, title: 'Judgement calls', applies: true, not_applies_words: null,
    lede: 'Every item where the answer is a judgement, and this sector’s main question. Our defaults are labelled; the decision is yours.',
    rows: [
      { label: 'This sector’s main question', value: CORE[v.job.sector] ?? null, from: 'fixed wording', missing: NOT_ON_FILE },
      wordsRow(c, 'sector_core'),
      { label: 'Range from approved packs', value: p.length === 0 ? null : p.map((x) => x.words).join(' '), from: 'worked out', missing: 'none approved yet; five are needed' },
    ],
    words: ['sector_core'], items, carries: '153e lines 5, 6, 9 and 13',
  };
}

function repairsOrCapital(c: Ctx): Sheet {
  const t = c.triggers;
  const works = t !== null && t.some((x) => /refurb|fit_?out|conversion/.test(x));
  const said = (() => {
    const b = c.funnel?.['buildings'];
    const first = Array.isArray(b) ? b[0] as Record<string, unknown> | undefined : undefined;
    if (first === undefined) return null;
    const parts = [str(first['works_type']), str(first['works_spend']) === null ? null : `£${str(first['works_spend'])}`, str(first['works_year'])].filter((x): x is string => x !== null);
    return parts.length === 0 ? null : parts.join(', ');
  })();
  return {
    n: 20, title: 'Repairs or capital', applies: works,
    not_applies_words: works ? null : `Only for refurbishment or fit-out works. This job is ${t === null ? 'of a kind not recorded' : t.map((x) => TRIGGER_WORDS[x] ?? x).join(' and ')}.`,
    lede: 'For refurbishment works: what physically changed. The tax adviser decides repair or capital; your part is what was done.',
    rows: !works ? [] : [
      { label: 'What the client said about the works', value: said, from: 'the client', missing: NOT_ON_FILE },
      wordsRow(c, 'works_scope'),
      // Phase 153e line 15 (Word question 150): like for like cannot be told from a visit alone.
      { label: 'Like for like', value: 'Whether old kit was swapped for the same kind cannot be told from a visit alone. Each item says whether it was seen on site or comes from documents.', from: 'fixed wording', missing: NOT_ON_FILE },
      { label: 'Grants', value: 'Grant-funded spend is taken off first (chapter 15), and never classified here.', from: 'fixed wording', missing: NOT_ON_FILE },
    ],
    words: works ? ['works_scope'] : [], items: [], carries: '153e line 15',
  };
}

function findings(c: Ctx): Sheet {
  const { db, v } = c;
  const basis = basisOf(db, v.job.id)?.basis ?? null;
  const photos = evidenceByLine(db, v.job.id);
  const live = v.lines.filter((l) => !l.removed);
  const site = live.filter((l) => findingSeen(basis, l, photos.get(l.element_id ?? '')?.count ?? 0) === FINDING_LABELS.SITE).length;
  const level = deskFirstReading(db, v.job.id);
  return {
    n: 22, title: 'Findings', applies: true, not_applies_words: null,
    lede: 'Your narrative. Nothing is drafted for you: each box asks the question, and the report carries your answer.',
    rows: [
      { label: 'Items seen on site', value: `${String(site)} of ${String(live.length)}`, from: 'worked out', missing: NOT_WORKED },
      { label: 'Items from documents', value: `${String(live.length - site)} of ${String(live.length)}`, from: 'worked out', missing: NOT_WORKED },
      { label: 'How much evidence this job needs', value: level?.level_words ?? null, from: 'worked out', missing: NOT_WORKED },
      wordsRow(c, 'narrative_description'), wordsRow(c, 'narrative_condition'), wordsRow(c, 'narrative_departures'), wordsRow(c, 'narrative_opinion'),
    ],
    words: ['narrative_description', 'narrative_condition', 'narrative_departures', 'narrative_opinion'], items: [], carries: '153e lines 1 to 3, 14 and 15',
  };
}

/** All ten sheets, in chapter order. */
export function packSheets(db: Db, v: PackView): Sheet[] {
  const t = triggersOf(db, v);
  const c: Ctx = { db, v, words: packWords(db, v.pack_id), triggers: t.triggers, funnel: t.funnel };
  return [building(c), dwellings(c), bareLand(c), qualifyingShare(c), leaseback(c), structures(c), otherReliefs(c), judgementCalls(c), repairsOrCapital(c), findings(c)];
}

export function packSheet(db: Db, v: PackView, n: number): Sheet | null {
  return packSheets(db, v).find((s) => s.n === n) ?? null;
}

/** The sheets as an approved version keeps them: words and figures only, nothing that would change later. */
export function sheetsForVersion(db: Db, v: PackView): { n: number; title: string; applies: boolean; not_applies_words: string | null; rows: { label: string; value: string | null; from: string; by: string | null; missing: string }[]; items: { label: string; detail: string }[] }[] {
  return packSheets(db, v).map((s) => ({
    n: s.n, title: s.title, applies: s.applies, not_applies_words: s.not_applies_words,
    rows: s.rows.map((r) => ({ label: r.label, value: r.value, from: r.from, by: r.by ?? null, missing: r.missing })),
    items: s.items.map((i) => ({ ...i })),
  }));
}
