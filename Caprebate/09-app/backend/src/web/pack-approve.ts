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
 *   · this exact state of the pack is not already approved.
 *
 * ONE CLICK, AND THEN: the whole report as it stands is written down as one JSON document (keys in a fixed order), its
 * SHA-256 is its fingerprint, and both are kept for ever as the next version. In the same transaction the surveyor's
 * figures are committed to the job (or, after the first time, amended with the version as the reason), so the claim's
 * own stages read them exactly as before. If any of that is refused, nothing is kept. The form carries both counters,
 * so a page drawn before a change cannot approve the changed pack, and a second click on the same state is refused.
 */
import { createHash } from 'node:crypto';
import { authorise, can, type Actor } from '../authz.ts';
import { amendFigures, commitFigures, jobHasEstimate, packJob } from './surveyor.ts';
import { packView, type PackDeps, type PackResult, type PackView } from './survey-pack.ts';
import { legalAllows, legalView, type LegalView } from './pack-legal.ts';
import { chaptersToRead, CHAPTERS } from './pack-chapters.ts';

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
  if (surveyor === null) blockers.push({ key: 'surveyor', words: 'No surveyor is assigned to this job.', href: null });
  if (v.property === null) blockers.push({ key: 'property', words: 'Say which property this pack is for.', href: `${base(job_id)}?ch=10` });
  if (!v.sums.complete) {
    const n = v.sums.needed.length;
    blockers.push({ key: 'sums', href: `${base(job_id)}?ch=4`,
      words: n > 0 ? `${n} value${n === 1 ? ' is' : 's are'} still needed. There is no total until then.` : (v.sums.problems[0]?.words ?? 'The sums are not complete.') });
  }
  const legal = legalAllows(lv.verdict, v.sums.qualifying_pence);
  if (!legal.ok) blockers.push({ key: 'legal', words: `The legal check: ${legal.why}`, href: `${base(job_id)}?ch=7` });

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
  const details = detailsOf(d.db, surveyor);
  if (details === null) blockers.push({ key: 'details', words: 'Add your RICS number below. It goes on the report with your name.', href: `${base(job_id)}?ch=23#details` });
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

export function snapshotOf(v: PackView, lv: LegalView, a: { version: number; at: string; by: { id: string; name: string }; details: Details }) {
  const sumOf = new Map(v.sums.lines.map((l) => [l.line_id, l] as const));
  return {
    format: 'cap-rebate-survey-pack/1',
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
    })),
    sums: {
      rebuild_pence: v.sums.rebuild_pence, building_price_pence: v.sums.building_price_pence,
      elements_cost_pence: v.sums.elements_cost_pence, elements_qualifying_pence: v.sums.elements_qualifying_pence,
      qualifying_pence: v.sums.qualifying_pence, main_pool_pence: v.sums.main_pool_pence,
      special_pool_pence: v.sums.special_pool_pence, share_bp: v.sums.share_bp,
    },
    changes: v.changes,
    legal: {
      verdict: lv.verdict,
      answers: lv.asked.filter((q) => lv.answers.has(q.id)).map((q) => {
        const x = lv.answers.get(q.id)!;
        return { question_id: q.id, ask: q.ask, value: x.value, by: x.by_name, source: x.source_note, at: x.at };
      }),
    },
    pack_seq: v.seq,
    legal_seq: lv.seq,
  };
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
      const json = canonical(snapshotOf(v, lv, { version, at, by: { id: actor.id, name }, details }));
      const fingerprint = fingerprintOf(json);
      d.db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [d.newId(), pack_id, version, v.seq, lv.seq, json, fingerprint, actor.id, at]);

      // The surveyor's figures, committed to the job as the workspace commits them — so the claim reads them as before.
      const figures = {
        a_qualifying_plant: poundsString(s.qualifying_pence as number),
        b_building: poundsString(s.building_price_pence as number),
        c_bare_land: poundsString(v.inputs.land_pence.value as number),
        qualifying_pct: String((s.share_bp as number) / 100),
        method_note: `Survey pack version ${String(version)}, fingerprint ${fingerprint}. Section 562 by rebuild cost, element by element, from the evidence and the surveyor's own changes.`,
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
