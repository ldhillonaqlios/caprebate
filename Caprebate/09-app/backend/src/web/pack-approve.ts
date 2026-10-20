/**
 * THE SURVEY PACK'S APPROVAL — read every chapter, then one click; the report frozen and fingerprinted. 2 October 2026.
 *
 * Lakhbir: "whole pack needs to be read through then approve button ungreys like someone reading and accepting T&C";
 * "when the surveyor signs it should be a single CTA approve click"; and the fingerprint, approved ("5) approved").
 *
 * THE BUTTON UNGREYS ONLY WHEN EVERY ONE OF THESE HOLDS, each said in words with a link to where it is put right:
 *   · it is the assigned surveyor;
 *   · the pack says which property it is for;
 *   · the sums are complete — every value in, no problem standing (src/web/pack-sums.ts);
 *   · the legal check allows it — clear, or clear with a deadline, and the figure not above a cap (src/web/pack-legal.ts);
 *   · the surveyor has opened every built chapter — and the legal check again since anyone else last answered it;
 *   · their RICS number is on file;
 *   · the job has its locked estimate (approving commits the figures, which releases it — the existing rule);
 *   · this exact state of the pack is not already approved;
 *   · PHASE 159a (C3, C5, L3): the claim is not past the tax adviser's sign-off, and has not stopped. After that the
 *     signed figures are fixed, and only "Reopen the valuation" on the claim page changes that (src/web/valuation-lock.ts).
 *
 * ONE CLICK, AND THEN: the whole report as it stands is written down as one JSON document (keys in a fixed order), its
 * SHA-256 is its fingerprint, and both are kept for ever as the next version. In the same transaction the surveyor's
 * figures are committed to the job (or, after the first time, amended with the version as the reason), so the claim's
 * own stages read them exactly as before. If any of that is refused, nothing is kept. The form carries both counters,
 * so a page drawn before a change cannot approve the changed pack, and a second click on the same state is refused.
 */
import { claimRoutes } from './claim-route.ts';
import { yearEndKnown } from './claim-facts.ts';
import { REPORT_ASSUMPTIONS } from './report-assumptions.ts';
import { sheetsForVersion } from './pack-sheets.ts';
import { createHash } from 'node:crypto';
import { authorise, can, type Actor } from '../authz.ts';
import { amendFigures, commitFigures, jobHasEstimate, packJob } from './surveyor.ts';
import { packView, type PackDeps, type PackResult, type PackView } from './survey-pack.ts';
import { capped, legalAllows, legalView, type LegalView } from './pack-legal.ts';
import { chaptersToRead, CHAPTERS } from './pack-chapters.ts';
import { basisOf, checklistView, evidenceByLine, walkthroughsOf } from './survey-evidence.ts';
import { findingSeen } from './finding-source.ts';
import { videosOf } from './survey-video.ts';
import { sitePlanOf, type SitePlan } from './site-plan.ts';
import { valuationLock } from './valuation-lock.ts';

export const DECLARATION: readonly string[] = Object.freeze([
  'I have reviewed this report to the extent it sets out.',
  'Cap Rebate drafted its figures from the evidence listed, and each one says where it came from.',
  'I have checked them and changed any I did not agree with. Each change is marked with my name.',
  'I adopt the figures as my own professional opinion.',
]);

export const AUTOMATION_NOTE =
  'Parts of this report were drafted by Cap Rebate’s software from records and documents. Each such figure is marked ' +
  '“Evidence” or “Our draft”. The surveyor read each part before they signed it.';

export type Blocker = { readonly key: string; readonly words: string; readonly href: string | null };

export type ApprovalRow = {
  readonly id: string; readonly version: number; readonly pack_seq: number; readonly legal_seq: number;
  readonly fingerprint: string; readonly approved_by: string; readonly approver_name: string; readonly approved_at: string;
};

export type Details = { readonly rics_number: string; readonly firm: string | null; readonly at: string };

export type Readiness = {
  readonly ready: boolean;
  readonly blockers: readonly Blocker[];
  /** The chapters that must be opened, and those still to open, by number. */
  readonly must_read: readonly number[];
  readonly unread: readonly number[];
  readonly details: Details | null;
  readonly approvals: readonly ApprovalRow[];
  /** The approval of exactly this state of the pack, if there is one. */
  readonly current: ApprovalRow | null;
  readonly may_approve: boolean;
  readonly pack_seq: number;
  readonly legal_seq: number;
};

const base = (job: string) => `/staff/survey/${job}/pack`;

/** The surveyor's details: the newest row. */
export function detailsOf(db: PackDeps['db'], user_id: string | null): Details | null {
  if (user_id === null) return null;
  return db.get<Details>('SELECT rics_number, firm, at FROM surveyor_details WHERE user_id = ? ORDER BY at DESC, rowid DESC LIMIT 1', [user_id]) ?? null;
}

export function approvalsOf(db: PackDeps['db'], pack_id: string | null): ApprovalRow[] {
  if (pack_id === null) return [];
  return db.all<ApprovalRow>(
    'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at ' +
      'FROM survey_pack_approvals a JOIN users u ON u.id = a.approved_by WHERE a.pack_id = ? ORDER BY a.version DESC', [pack_id]);
}

/** Record that the assigned surveyor opened a chapter. Nobody else's opening counts, and nothing else is written. */
export function recordRead(d: PackDeps, actor: Actor, job_id: string, chapter: number, legal_seq: number): void {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 23) return;
  const { obj } = packJob(d.db, actor, job_id);
  if (!can(actor, 'surveyor_job.commit', obj)) return;
  d.db.run('INSERT OR IGNORE INTO survey_pack_reads (id, job_id, user_id, chapter, legal_seq, at) VALUES (?, ?, ?, ?, ?, ?)',
    [d.newId(), job_id, actor.id, chapter, legal_seq, d.now()]);
}

export function readiness(d: PackDeps, actor: Actor, job_id: string, v: PackView, lv: LegalView): Readiness {
  const { obj } = packJob(d.db, actor, job_id);
  const surveyor = v.job.surveyor_id;
  const blockers: Blocker[] = [];
  const may = can(actor, 'surveyor_job.commit', obj);
  // PHASE 159a: first, because nothing else on the pack matters once the claim's figures are fixed.
  const lock = valuationLock(d.db, v.job.claim_id);
  if (lock.locked) blockers.push({ key: 'locked', words: lock.why, href: v.job.claim_id === null ? null : `/staff/claims/${v.job.claim_id}#valuation` });
  if (surveyor === null) blockers.push({ key: 'surveyor', words: 'No surveyor is assigned to this job.', href: null });
  if (v.property === null) blockers.push({ key: 'property', words: 'Say which property this pack is for.', href: `${base(job_id)}?ch=10` });
  if (!v.sums.complete) {
    const n = v.sums.needed.length;
    blockers.push({ key: 'sums', href: `${base(job_id)}?ch=4`,
      words: n > 0 ? `${n} value${n === 1 ? ' is' : 's are'} still needed. There is no total until then.` : (v.sums.problems[0]?.words ?? 'The sums are not complete.') });
  }
  const legal = legalAllows(lv.verdict, ...capped(v));
  // PHASE 159d (item 8): a purchase that fails the legal check, with work since, is not claimed; the works go on.
  if (!legal.ok && !v.purchase_w3) blockers.push({ key: 'legal', words: `The legal check: ${legal.why}`, href: `${base(job_id)}?ch=7` });

  // Every built chapter opened by the surveyor — and the legal check again since anyone else last answered it.
  const reads = surveyor === null ? [] : d.db.all<{ chapter: number; seq: number }>(
    'SELECT chapter, MAX(legal_seq) AS seq FROM survey_pack_reads WHERE job_id = ? AND user_id = ? GROUP BY chapter', [job_id, surveyor]);
  const othersLegal = v.pack_id === null || surveyor === null ? 0 : d.db.get<{ s: number | null }>(
    'SELECT MAX(seq) AS s FROM survey_pack_legal_answers WHERE pack_id = ? AND by_user <> ?', [v.pack_id, surveyor])?.s ?? 0;
  const readAt = new Map(reads.map((r) => [r.chapter, r.seq] as const));
  const unread = chaptersToRead().filter((c) => !readAt.has(c) || (c === 7 && (readAt.get(c) ?? -1) < othersLegal));
  if (unread.length > 0) {
    const names = unread.map((c) => `${c} · ${CHAPTERS.find((x) => x.n === c)?.title ?? ''}`).join('; ');
    blockers.push({ key: 'read', words: `Open every chapter first. Still to open: ${names}.`, href: `${base(job_id)}?ch=${String(unread[0])}` });
  }
  // PHASE 159f (item 3): EVERY RATE SOURCED — the SOP's Valuation gate, made a test. A BCIS draft carries its own; a rate the
  // surveyor typed needs theirs. And (C19) every rate at one day, so the share's arithmetic matches the report's words.
  if (v.pricing.unsourced.length > 0) {
    const n = v.pricing.unsourced.length;
    blockers.push({ key: 'sources', href: `${base(job_id)}?ch=10`,
      words: `Give ${n === 1 ? 'this rate' : `these ${String(n)} rates`} a source: ${v.pricing.unsourced.join('; ')}. A source is BCIS, a QS schedule, an invoice or a price book. Say which one, and the day it is priced at.` });
  }
  if (v.pricing.mixed.length > 0) {
    blockers.push({ key: 'priced_at', href: `${base(job_id)}?ch=11`,
      words: `The rates are priced at different days, and the index cannot bring them to the purchase date: ${v.pricing.mixed.join('; ')}. Price them at one day, or record the purchase date.` });
  }
  // 2 Oct 2026: how the surveyor inspected (chapter 2, src/web/survey-evidence.ts) goes in the report.
  if (basisOf(d.db, job_id) === null) blockers.push({ key: 'basis', words: 'Say how you inspected the building, in chapter 2.', href: `${base(job_id)}?ch=2#inspection` });
  const details = detailsOf(d.db, surveyor);
  if (details === null) blockers.push({ key: 'details', words: 'Add your RICS number below. It goes on the report with your name.', href: `${base(job_id)}?ch=23#details` });
  // PHASE 159e (item 4; C15, L4): each part's year comes from the client's year end, read once at approval.
  if (v.job.claim_id !== null && !yearEndKnown(d.db, { id: v.job.claim_id, business_id: v.job.business_id })) {
    blockers.push({ key: 'year_end', href: `/staff/claims/${v.job.claim_id}#facts`,
      words: 'Record the client’s year end first. Each part of the claim goes into the year it falls in, and that comes from the year end. Ask the client for it, or record the accounting period on the claim.' });
  }
  if (!jobHasEstimate(d.db, job_id)) blockers.push({ key: 'estimate', words: 'This job has no locked estimate, so approving would release nothing. Tell the office.', href: null });

  const approvals = approvalsOf(d.db, v.pack_id);
  const current = approvals.find((a) => a.pack_seq === v.seq && a.legal_seq === lv.seq) ?? null;
  if (current !== null) blockers.push({ key: 'approved', words: `This version is approved: version ${String(current.version)}. Change something to approve a new one.`, href: `${base(job_id)}/version/${String(current.version)}` });

  return { ready: blockers.length === 0 && may, blockers, must_read: chaptersToRead(), unread, details, approvals, current, may_approve: may, pack_seq: v.seq, legal_seq: lv.seq };
}

/* ================================================================== *
 * THE FROZEN VERSION
 * ================================================================== */

/** JSON with every object's keys in alphabetical order, so the same report always gives the same text. */
export function canonical(x: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, walk((v as Record<string, unknown>)[k])]));
    }
    return v === undefined ? null : v;
  };
  return JSON.stringify(walk(x));
}

export function fingerprintOf(json: string): string {
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/** 2 Oct 2026: how the building was inspected, and what the client sent, for the approved version. */
function inspectionOf(d: { db: PackDeps['db'] }, job_id: string) {
  const b = basisOf(d.db, job_id);
  const c = checklistView(d.db, job_id);
  const recs = walkthroughsOf(d.db, job_id).flatMap((w) => w.recordings);
  const vids = videosOf(d.db, job_id);
  return {
    basis: b?.basis ?? null, words: b?.words ?? null, note: b?.note ?? null,
    photos: c?.photos ?? 0, items_done: c?.done ?? 0, items_marked: c?.marked ?? 0, items_total: c?.total ?? 0,
    recordings: recs.length, recorded_minutes: recs.reduce((a, r) => a + r.minutes, 0),
    // 2 Oct 2026: the client's own videos of the building (src/web/survey-video.ts).
    videos: vids.length, video_minutes: Math.round(vids.reduce((a, v) => a + v.duration_ms, 0) / 60_000),
  };
}

function siteOf(d: { db: PackDeps['db'] }, job_id: string): { site_plan?: SitePlan } {
  const p = sitePlanOf(d.db, job_id);
  return p === null ? {} : { site_plan: p };
}

export function snapshotOf(v: PackView, lv: LegalView, a: { version: number; at: string; by: { id: string; name: string }; details: Details }, d: { db: PackDeps['db'] }) {
  const sumOf = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  // PHASE 153e (Word question 150): each finding, seen on site or from documents, frozen with the version.
  const basis = basisOf(d.db, v.job.id)?.basis ?? null;
  const photosByLine = evidenceByLine(d.db, v.job.id);
  return {
    format: 'cap-rebate-survey-pack/1',
    // PHASE 160d, 19 October 2026: a version approved from now on is drawn without long dashes (src/web/survey-report.ts,
    // reportModel). One approved before has no `words` and is drawn exactly as it was made.
    words: 'plain' as const,
    version: a.version,
    approved_at: a.at,
    surveyor: { id: a.by.id, name: a.by.name, rics_number: a.details.rics_number, firm: a.details.firm },
    declaration: DECLARATION,
    automation_note: AUTOMATION_NOTE,
    job: { id: v.job.id, sector: v.job.sector },
    business: { id: v.job.business_id, name: v.job.business_name },
    property: v.property,
    inputs: v.inputs,
    lines: v.lines.map((l) => ({
      id: l.id, label: l.label, element_id: l.element_id, unit: l.unit, pool: l.pool, pool_source: l.pool_source,
      qty_milli: l.qty_milli, rate_pence: l.rate_pence, qpct_bp: l.qpct_bp, removed: l.removed, removed_source: l.removed_source,
      cost_pence: sumOf.get(l.id)?.cost_pence ?? null, qualifying_pence: sumOf.get(l.id)?.qualifying_pence ?? null,
      seen: findingSeen(basis, l, photosByLine.get(l.element_id ?? '')?.count ?? 0),
    })),
    sums: {
      rebuild_pence: v.sums.rebuild_pence, building_price_pence: v.sums.building_price_pence,
      elements_cost_pence: v.sums.elements_cost_pence, elements_qualifying_pence: v.sums.elements_qualifying_pence,
      qualifying_pence: v.sums.qualifying_pence, main_pool_pence: v.sums.main_pool_pence,
      special_pool_pence: v.sums.special_pool_pence, share_bp: v.sums.share_bp,
    },
    // PHASE 153a — chapter 15: the claim's grants and what each took off. `sums` above is the figure after them.
    grants: {
      element_trace: v.grants.switches.element_trace,
      before_qualifying_pence: v.grants.reading.before.qualifying_pence,
      before_main_pool_pence: v.grants.reading.before.main_pool_pence,
      before_special_pool_pence: v.grants.reading.before.special_pool_pence,
      reduction_pence: v.grants.reading.reduction_pence,
      list: v.grants.list.map((g) => {
        const e = v.grants.reading.effects.find((x) => x.grant_id === g.id);
        return { id: g.id, kind: g.kind, payer_class: g.payer_class, amount_pence: g.amount_pence, element_ids: g.element_ids,
          route: e?.route ?? null, words: e?.words ?? null, line_ids: e?.line_ids ?? [], reduction_pence: e?.reduction_pence ?? null };
      }),
    },
    changes: v.changes,
    inspection: inspectionOf(d, v.job.id),
    // PHASE 153e: chapter 15's VAT half, frozen with the version. Its counted VAT is already in `sums`.
    vat: { position: v.vat.position, amount_pence: v.vat.amount_pence, counted_pence: v.vat.counted_pence, words: v.vat.words },
    // PHASE 153e (Word question 145): the planning assumption, frozen with the version (a test reading for the surveyor).
    assumptions: [...REPORT_ASSUMPTIONS],
    // 2 Oct 2026, stage 6: the site plan as it stood at approval (src/web/site-plan.ts), so the report never changes after.
    // Only when there is one: a version approved without a plan keeps the shape every earlier version has.
    ...siteOf(d, v.job.id),
    // PHASE 153g: chapters 5, 8, 11, 14, 16 to 20 and 22, as they stood at approval (src/web/pack-sheets.ts).
    chapters: sheetsForVersion(d.db, v),
    legal: {
      verdict: lv.verdict,
      answers: lv.asked.filter((q) => lv.answers.has(q.id)).map((q) => {
        const x = lv.answers.get(q.id)!;
        return { question_id: q.id, ask: q.ask, value: x.value, by: x.by_name, source: x.source_note, at: x.at };
      }),
    },
    pack_seq: v.seq,
    legal_seq: lv.seq,
    // PHASE 159c: where the building has work done since, each spend as approved: the purchase's own sums and each piece of
    // work on its own cost. `sums` above is their total. A version with no work keeps the shape every earlier version has.
    ...eventsOf(v),
    // PHASE 159k (item 2): the readings' parts as approved, and whether each reading was on. Only where a part is given:
    // a version with none keeps the shape every earlier version has.
    ...readingsOf(v),
    // PHASE 159f: how the rates were priced — the day they are all at, BCIS's drafts and location, and section 562 the
    // residual way beside the proportional one. A version approved before has none and reads as it did.
    pricing: { priced_at: v.pricing.priced_at, purchase: v.pricing.purchase, bcis_kind: v.pricing.bcis.kind, bcis_words: v.pricing.bcis.words,
      location: v.pricing.bcis.location, residual_pence: v.pricing.residual.qualifying_pence },
    // PHASE 159d (item 6): which way each part of the claim goes in, as it stood at approval (src/web/claim-route.ts).
    ...(v.job.claim_id === null ? {} : { routes: claimRoutes(d.db, { id: v.job.claim_id, business_id: v.job.business_id, property_id: v.property?.id ?? null }, a.at)
      /* PHASE 159e (items 4, 7, 8): with each part's own period and, for W2, the first open one — so the return entries
         put each spend in its own period from the facts as they stood at approval, the same period the window read. */
      .map((r) => ({ label: r.label, route: r.route, words: r.words, event_id: r.event_id, kind: r.kind, event_date: r.event_date,
        period: r.period, first_open: r.first_open })) }),
  };
}

/** PHASE 159k (item 2): the long-life and asbestos parts the allowances read, frozen with the version, with the readings
 *  as they stood (money-readings.ts). s.33B is already in the sums. */
function readingsOf(v: PackView): { readings_159k?: {
  long_life_test: boolean; asbestos_lrr: boolean; s33b_aggregation: boolean;
  purchase_long_life_pence: number | null;
  works: { event_id: string; long_life_pence: number | null; asbestos_pence: number | null; s33b_capital_pence: number; s33b_words: string | null }[];
} } {
  const any = v.long_life.value !== null || v.works.some((w) => w.long_life_pence !== null || w.asbestos_pence !== null || w.s33b.capital_pence > 0 || w.s33b.words !== null);
  if (!any) return {};
  const main = v.purchase_sums.main_pool_pence;
  return { readings_159k: {
    long_life_test: v.money.readings.long_life_test, asbestos_lrr: v.money.readings.asbestos_lrr, s33b_aggregation: v.money.readings.s33b_aggregation,
    purchase_long_life_pence: v.long_life.value === null || main === null ? null : Math.min(v.long_life.value, main),
    works: v.works.map((w) => ({ event_id: w.event.id, long_life_pence: w.long_life_pence, asbestos_pence: w.asbestos_pence,
      s33b_capital_pence: w.s33b.capital_pence, s33b_words: w.s33b.words })),
  } };
}

/** PHASE 159c: the events part of a version, only where there is work since. */
function eventsOf(v: PackView): { events?: {
  purchase_applies: boolean;
  purchase_w3?: boolean;
  purchase: { qualifying_pence: number | null; main_pool_pence: number | null; special_pool_pence: number | null } | null;
  works: { event_id: string; kind: string; event_date: string | null; label: string;
    inputs: Record<string, number | null>; qualifying_pence: number | null; main_pool_pence: number | null;
    special_pool_pence: number | null; repairs_pence: number | null;
    input_sources: Record<string, { kind: string; text: string; by_name: string | null; reason: string | null } | null> }[];
} } {
  if (v.works.length === 0) return {};
  return { events: {
    purchase_applies: v.purchase_applies && !v.purchase_w3,
    // PHASE 159d (item 8): the purchase failed the legal check, so it is not claimed; the report says so.
    ...(v.purchase_w3 ? { purchase_w3: true } : {}),
    purchase: v.purchase_applies && !v.purchase_w3 ? { qualifying_pence: v.purchase_sums.qualifying_pence, main_pool_pence: v.purchase_sums.main_pool_pence, special_pool_pence: v.purchase_sums.special_pool_pence } : null,
    works: v.works.map((w) => ({ event_id: w.event.id, kind: w.event.kind, event_date: w.event.event_date, label: w.label,
      inputs: Object.fromEntries(Object.entries(w.inputs).map(([k, x]) => [k, x.value])),
      qualifying_pence: w.sums.qualifying_pence, main_pool_pence: w.sums.main_pool_pence, special_pool_pence: w.sums.special_pool_pence,
      repairs_pence: w.sums.repairs_pence,
      // PHASE 159l (item 5, L20): where each value came from, so the report can say it as it does for every rate.
      input_sources: Object.fromEntries(Object.entries(w.inputs).map(([k, x]) => [k, x.source === null
        ? null : { kind: x.source.kind, text: x.source.text, by_name: x.source.by_name ?? null, reason: x.source.reason ?? null }])) })),
  } };
}

/** An approved version as kept: what snapshotOf wrote, read back from its JSON. */
export type Snapshot = ReturnType<typeof snapshotOf>;

function poundsString(pence: number): string {
  return `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`;
}

export type ApproveResult = PackResult & { readonly version?: number; readonly fingerprint?: string };

class Refused extends Error {
  readonly why: string;
  constructor(why: string) { super(why); this.why = why; }
}

/** The one click. */
export function approvePack(d: PackDeps, actor: Actor, job_id: string, f: { seq: string; legal_seq: string }): ApproveResult {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  if (!/^\d{1,9}$/.test(f.seq.trim()) || !/^\d{1,9}$/.test(f.legal_seq.trim())) return { ok: false, stale: true, why: 'This page is out of date.' };
  try {
    return d.db.tx((): ApproveResult => {
      const v = packView(d, actor, job_id);
      const lv = legalView(d, actor, job_id);
      if (v.seq !== Number(f.seq.trim()) || lv.seq !== Number(f.legal_seq.trim())) {
        return { ok: false, stale: true, why: 'The pack changed since you opened it. Read it again before you approve.' };
      }
      const r = readiness(d, actor, job_id, v, lv);
      if (!r.ready) return { ok: false, why: r.blockers[0]?.words ?? 'This pack cannot be approved yet.' };
      const s = v.sums;
      const details = r.details as Details;
      const pack_id = v.pack_id as string;
      const version = (r.approvals[0]?.version ?? 0) + 1;
      const at = d.now();
      const name = d.db.get<{ n: string }>('SELECT display_name AS n FROM users WHERE id = ?', [actor.id])?.n ?? actor.id;
      const json = canonical(snapshotOf(v, lv, { version, at, by: { id: actor.id, name }, details }, d));
      const fingerprint = fingerprintOf(json);
      d.db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [d.newId(), pack_id, version, v.seq, lv.seq, json, fingerprint, actor.id, at]);

      // The surveyor's figures, committed to the job as the workspace commits them — so the claim reads them as before.
      /* PHASE 159c: with work since, the figure is the purchase and every piece of work. The building figure is the
         purchase's building plus what the work cost; with no purchase it is what the work cost, on no land; the share
         is what qualifies of that. A pack with no work commits exactly as before. */
      const worksCost = v.works.reduce((a, w) => a + (w.inputs.works_total.value ?? 0), 0);
      const purchaseCounts = v.purchase_applies && !v.purchase_w3;   // PHASE 159d (item 8)
      const building = (purchaseCounts ? (s.building_price_pence as number) : 0) + worksCost;
      const figures = {
        a_qualifying_plant: poundsString(s.qualifying_pence as number),
        b_building: poundsString(building),
        c_bare_land: poundsString(purchaseCounts ? (v.inputs.land_pence.value as number) : 0),
        qualifying_pct: v.works.length === 0 ? String((s.share_bp as number) / 100)
          : String(building === 0 ? 0 : Math.round(((s.qualifying_pence as number) * 10000) / building) / 100),
        method_note: v.works.length === 0
          ? `Survey pack version ${String(version)}, fingerprint ${fingerprint}. Section 562 by rebuild cost, element by element, from the evidence and the surveyor's own changes.`
          : `Survey pack version ${String(version)}, fingerprint ${fingerprint}. ${v.purchase_applies ? 'The purchase by section 562, by rebuild cost, element by element; ' : ''}each piece of work since on its own cost, from its final account by element (${v.works.map((w) => w.label).join('; ')}).`,
        rates: [],
      };
      const committed = v.job.state === 'SEALED'
        ? commitFigures(d, actor, job_id, figures)
        : amendFigures(d, actor, job_id, { ...figures, reason: `Survey pack version ${String(version)} approved.` });
      if (!committed.ok) throw new Refused(`The figures could not be committed: ${committed.why}`);

      d.audit.append({ at, kind: 'SURVEY_PACK_APPROVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'surveyor_job', object_id: job_id, detail: { version, fingerprint } });
      return { ok: true, version, fingerprint };
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, why: e.why };
    if (e instanceof Error && /UNIQUE constraint failed: survey_pack_approvals/.test(e.message)) {
      return { ok: false, why: 'This version is already approved.' };
    }
    throw e;
  }
}

/** The surveyor's own details: their RICS number and firm. Given once; stamped onto every approval. */
export function saveDetails(d: PackDeps, actor: Actor, job_id: string, f: { rics_number: string; firm: string }): PackResult {
  const { obj } = packJob(d.db, actor, job_id);
  authorise(actor, 'surveyor_job.commit', obj);
  const rics = f.rics_number.replace(/\s+/g, '');
  if (!/^\d{4,10}$/.test(rics)) return { ok: false, field: 'rics_number', why: 'Type your RICS membership number: 4 to 10 digits.' };
  const firm = f.firm.trim().replace(/\s+/g, ' ');
  if (firm.length > 200) return { ok: false, field: 'firm', why: 'Keep the firm’s name under 200 characters.' };
  const now = detailsOf(d.db, actor.id);
  if (now !== null && now.rics_number === rics && (now.firm ?? '') === firm) return { ok: false, why: 'Those are already your details.' };
  d.db.run('INSERT INTO surveyor_details (id, user_id, rics_number, firm, at) VALUES (?, ?, ?, ?, ?)', [d.newId(), actor.id, rics, firm === '' ? null : firm, d.now()]);
  return { ok: true };
}

/** One approved version, as kept, and whether its fingerprint still matches what is kept. */
export function approvedVersion(d: PackDeps, actor: Actor, job_id: string, version: number): {
  row: ApprovalRow; snapshot: Snapshot; fingerprint_holds: boolean;
} | null {
  packJob(d.db, actor, job_id);
  const r = d.db.get<ApprovalRow & { snapshot_json: string }>(
    'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json ' +
      'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN users u ON u.id = a.approved_by WHERE p.job_id = ? AND a.version = ?',
    [job_id, version]);
  if (r === undefined) return null;
  const { snapshot_json, ...row } = r;
  return { row, snapshot: JSON.parse(snapshot_json) as Snapshot, fingerprint_holds: fingerprintOf(snapshot_json) === r.fingerprint };
}
