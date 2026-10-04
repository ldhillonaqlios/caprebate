/**
 * DESK FIRST — HOW MUCH EVIDENCE A JOB NEEDS, AND WHETHER IT CAN BE VALUED FROM THE DESK. Phase 153e, 4 October 2026.
 *
 * Built on our recommendation, for the surveyor to check, in the test system only. Three of the surveyor's questions:
 *   129 "Can you value a building safely without ever visiting it?" — desk-only when the required documents are all in
 *       and no warning sign fires; otherwise "site visit needed". Lakhbir's view (25 Sep): most surveys can be done from
 *       the desk if we have all the information. His input, not the surveyor's sign-off.
 *   130 "When can a video walkthrough replace a site visit?" — never replace: support. The client's checklist, in the
 *       filming script's order, is scored for coverage against a PLACEHOLDER pass mark.
 *   131 "Should the site-visit decision use our hidden estimate or the price paid?" — the price paid (the invoice total
 *       when we hold one; we do not yet), never our hidden estimate. The surveyor is shown the LEVEL ONLY: never the
 *       band, the score or the price behind it. (The survey pack's chapter 9 does show the surveyor the title's price,
 *       because s.562 shares it out; that is the pack's design, recorded for the surveyor with question 131.)
 *
 * THE GRID AND THE SIGNS ARE THE DESKTOP-FIRST POLICY'S (04-phase-work/phase9/strawman-desktop-first-policy.md, 2.4 and
 * 5). Every limit here is a PLACEHOLDER: the policy leaves them all "[SURVEYOR'S CALL]", and nothing is presented to a
 * surveyor as calibrated. Of the policy's warning signs, the ones the records can read are read; the rest wait on the
 * surveyor's own review, which may always escalate.
 *
 * N4: what is not known never relieves. No price: the value band is the top one. A fact not known is a warning sign.
 * NOTHING HERE DECIDES: the surveyor records the inspection basis (survey-evidence.ts, chapter 2), and approval waits
 * for that, as before. This is a reading beside it.
 */
import type { Db } from '../db.ts';
import { checklistView, type ChecklistView } from './survey-evidence.ts';
import { mandatoryDocumentNeeds } from './mandatory-documents.ts';
import { latestFacts } from './claim-facts.ts';

export const DESK_FIRST_TEST = Object.freeze({
  status: 'TEST_ONLY_PLACEHOLDERS' as const,
  /** V1 below the first, V2 below the second, V3 below the third, V4 above: placeholders for the surveyor. */
  value_limits_pence: Object.freeze([25_000_000, 100_000_000, 300_000_000]),
  /** C1 at or below the first, C2 the second, C3 the third, C4 above: placeholders. */
  complexity_limits: Object.freeze([1, 3, 5]),
  /** The video coverage pass mark, in per cent: a placeholder. */
  pass_mark_percent: 80,
  awaiting: 'the surveyor (Word questions 129, 130 and 131)',
});

export type Tier = 'DT-T1' | 'DT-T2' | 'DT-T3' | 'DT-T4';
export const TIER_WORDS: Readonly<Record<Tier, string>> = Object.freeze({
  'DT-T1': 'Desktop only',
  'DT-T2': 'Desktop and a video walkthrough',
  'DT-T3': 'Desktop, a video walkthrough and named extra photos',
  'DT-T4': 'A site visit',
});

/** The policy's grid, 2.4: rows V1 to V4, columns C1 to C4. */
const GRID: readonly (readonly Tier[])[] = [
  ['DT-T1', 'DT-T1', 'DT-T2', 'DT-T3'],
  ['DT-T1', 'DT-T2', 'DT-T3', 'DT-T3'],
  ['DT-T2', 'DT-T3', 'DT-T3', 'DT-T4'],
  ['DT-T2', 'DT-T3', 'DT-T4', 'DT-T4'],
];

/** Which checklist items the script calls optional ("only if safe", "if you can reach it"). Every other one is required. */
export const OPTIONAL_ITEMS: readonly string[] = Object.freeze(['VOIDS', 'WATER-TANK', 'OUT-SHADE', 'ELEC-OTHER']);

export type Coverage = {
  readonly required: number;
  /** Photographed, or marked "not here". "Not safe" is not covered. */
  readonly covered: number;
  readonly percent: number;
  readonly pass_mark_percent: number;
  readonly passes: boolean;
  /** The required items still to do, by title, in the script's order. */
  readonly missing: readonly string[];
};

/** Question 130: the checklist's coverage against the script, with the placeholder pass mark. */
export function videoCoverage(db: Db, job_id: string, cfg = DESK_FIRST_TEST): Coverage | null {
  const v = checklistView(db, job_id);
  return v === null ? null : coverageOf(v, cfg);
}

/** The same score, from a checklist already read. */
export function coverageOf(v: ChecklistView, cfg = DESK_FIRST_TEST): Coverage {
  const required = v.items.filter((i) => !OPTIONAL_ITEMS.includes(i.key));
  const isCovered = (i: (typeof required)[number]) => i.photos.length > 0 || i.mark === 'NOT_HERE';
  const covered = required.filter(isCovered).length;
  const percent = required.length === 0 ? 0 : Math.floor((covered * 100) / required.length);
  return { required: required.length, covered, percent, pass_mark_percent: cfg.pass_mark_percent, passes: percent >= cfg.pass_mark_percent,
    missing: required.filter((i) => !isCovered(i)).map((i) => i.title) };
}

export type DeskFirstReading = {
  readonly tier: Tier;
  readonly verdict: 'DESK_ONLY' | 'DESK_WITH_VIDEO' | 'SITE_VISIT_NEEDED';
  /** The ONLY thing the surveyor is shown. */
  readonly level_words: string;
  /** For staff: why, in words. Never shown to the surveyor: it names the band. */
  readonly why: readonly string[];
  readonly signs: readonly string[];
  readonly value_band: 1 | 2 | 3 | 4;
  readonly complexity_band: 1 | 2 | 3 | 4;
  readonly documents_complete: boolean;
  readonly coverage: Coverage | null;
};

type JobRow = { business_id: string; claim_id: string | null; sector: string };

function band(x: number, limits: readonly number[], inclusive: boolean): 1 | 2 | 3 | 4 {
  const i = limits.findIndex((l) => (inclusive ? x <= l : x < l));
  return (i === -1 ? 4 : i + 1) as 1 | 2 | 3 | 4;
}

/** The price paid from the title register, or the price paid data: the claim's property, else the business's only one. */
function pricePaidPence(db: Db, job: JobRow): number | null {
  const pid = job.claim_id === null ? null : db.get<{ p: string | null }>('SELECT property_id AS p FROM claims WHERE id = ?', [job.claim_id])?.p ?? null;
  for (const source of ['HMLR_TITLE', 'HMLR_PPD']) {
    const rows = db.all<{ fields_json: string; property_id: string | null }>(
      'SELECT fields_json, property_id FROM register_records WHERE business_id = ? AND source_id = ? ORDER BY obtained_at DESC', [job.business_id, source]);
    const r = pid === null ? (rows.length === 1 ? rows[0] : undefined) : rows.find((x) => x.property_id === pid);
    if (r === undefined) continue;
    try {
      const p = (JSON.parse(r.fields_json) as Record<string, unknown>)['price_paid'];
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) return Math.round(p * 100);
    } catch { /* unreadable: not known */ }
  }
  return null;
}

export function deskFirstReading(db: Db, job_id: string, cfg = DESK_FIRST_TEST): DeskFirstReading | null {
  const job = db.get<JobRow>('SELECT j.business_id, j.claim_id, b.sector FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id WHERE j.id = ?', [job_id]);
  if (job === undefined) return null;
  const why: string[] = [];
  const signs: string[] = [];

  // Axis 1: value, on the price paid (question 131). Not known: the top band (N4).
  const price = pricePaidPence(db, job);
  const value_band = price === null ? 4 : band(price, cfg.value_limits_pence, false);
  why.push(price === null ? 'No price paid on the records, so the value is treated as the top band.' : `Value band V${String(value_band)}, from the price paid.`);

  // Axis 2: complexity, a scored composite (policy 2.3), every weight a placeholder.
  const facts = job.claim_id === null ? new Map() : latestFacts(db, job.claim_id);
  const fact = (k: string) => facts.get(k) as { answer: string; value_text: string | null } | undefined;
  let score = 0;
  const bought = fact('BOUGHT_THE_BUILDING');
  if (bought === undefined || bought.answer !== 'VALUE' || bought.value_text !== 'NO') { score += 2; why.push('A purchase, or not known: the price must be shared out (+2).'); }
  if (job.sector === 'private_hospital' || job.sector === 'dental') { score += 2; why.push('Hidden, high-value plant is usual in this sector (+2).'); }
  else if (job.sector === 'care_homes' || job.sector === 'gp') { score += 1; why.push('A middle sector for hidden plant (+1).'); }
  const needs = job.claim_id === null ? [] : mandatoryDocumentNeeds(db, { id: job.claim_id, property_id: db.get<{ p: string | null }>('SELECT property_id AS p FROM claims WHERE id = ?', [job.claim_id])?.p ?? null });
  const documents_complete = job.claim_id !== null && needs.every((n) => n.met);
  if (!documents_complete) { score += 2; why.push('The required documents are not all in (+2).'); }
  const complexity_band = band(score, cfg.complexity_limits, true);
  why.push(`Complexity band C${String(complexity_band)} (score ${String(score)}).`);

  // The policy's warning signs (5) that the records can read. Each forces a visit.
  const election = fact('ELECTION_EXISTS');
  if (election !== undefined && election.answer === 'VALUE' && election.value_text === 'YES' && fact('ELECTION_VALUE')?.answer !== 'VALUE') {
    signs.push('A s.198 or s.199 election exists and the value it fixes is not settled.');
  }
  for (const k of ['ELECTION_EXISTS', 'GRANTS_EXIST', 'BOUGHT_THE_BUILDING']) {
    if (fact(k)?.answer === 'UNKNOWN') signs.push(`A fact that decides the value is not known: ${k.toLowerCase().replace(/_/g, ' ')}.`);
  }
  if (job.sector === 'supported_living') signs.push('Supported living: the split between homes and shared areas needs the surveyor’s eyes until it is measured.');
  if (value_band === 4 || complexity_band === 4) signs.push('The top band on value or complexity: a conservative default until real jobs show otherwise.');

  let tier = (GRID[value_band - 1] as readonly Tier[])[complexity_band - 1] as Tier;
  const coverage = videoCoverage(db, job_id, cfg);
  if (tier !== 'DT-T1' && tier !== 'DT-T4' && coverage !== null && !coverage.passes) {
    signs.push(`The client’s photo and video coverage is ${String(coverage.percent)}%, below the test pass mark of ${String(coverage.pass_mark_percent)}%.`);
  }
  if (signs.length > 0) tier = 'DT-T4';
  const verdict = tier === 'DT-T4' ? 'SITE_VISIT_NEEDED' : tier === 'DT-T1' && documents_complete ? 'DESK_ONLY'
    : tier === 'DT-T1' ? 'SITE_VISIT_NEEDED' : 'DESK_WITH_VIDEO';
  if (tier === 'DT-T1' && !documents_complete) signs.push('Desktop only needs every required document in; until then, a site visit.');
  const shown: Tier = verdict === 'SITE_VISIT_NEEDED' ? 'DT-T4' : tier;
  return {
    tier: shown, verdict, value_band, complexity_band, documents_complete, coverage, why, signs,
    level_words: `${TIER_WORDS[shown]} — a test reading with placeholder limits, for you to confirm or raise.`,
  };
}
