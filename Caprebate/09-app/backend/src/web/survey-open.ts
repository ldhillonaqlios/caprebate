/**
 * OPENING A SURVEY JOB — Phase 158b, 7 October 2026.
 *
 * The Friary House run (04-phase-work/sim-2026-10-06, finding F31) reached Survey and stopped: nothing in the
 * application opened a survey job. `surveyor_jobs` and `estimates` were written only by the seed and the tests, and a
 * surveyor's commit refuses a job with no locked estimate ("Tell the office - do not work around it"). So no real
 * claim could pass Survey.
 *
 * Staff (Admin and Sales: the existing `surveyor_job.assign`, "Give a survey job to a surveyor") now open one from the
 * claim at Survey, choosing a SURVEYING login. Opening it, in one transaction:
 *
 *   1. SEALS THE ESTIMATE for the claim's assessment, unless one is already sealed (that one is kept as it was, never
 *      re-sealed). What is sealed is what the four-stage funnel actually worked out and showed the client: the spend
 *      that counts (the "up to" figure, `assessments.shown_high_pence`) and its share of what the client said was
 *      spent. The funnel does not split the pools, value the land or work out a tax saving, so those are 0 and the
 *      row's `basis` (migration 100) says FUNNEL_CEILING; a page showing the released estimate says "not estimated at
 *      the assessment" for them. The hash binds the values and the time, as the seed's rows are bound.
 *   2. OPENS THE JOB, SEALED, on the claim and its assessment, for the surveyor chosen.
 *   3. LOGS IT (SURVEY_JOB_OPENED): whether an estimate was sealed with it. Never a figure: the log is read by roles the
 *      estimate is hidden from.
 *
 * ONE JOB PER CLAIM. A claim with a job already on it is refused, in words that say whose it is.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { stageLabel } from './look.ts';

export const FUNNEL_CEILING = 'FUNNEL_CEILING';

export type OpenDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export const SURVEY_JOB_WORDS = {
  none: 'There is no such claim.',
  stage: (at: string) => `A survey job is opened at the Survey stage. This claim is at ${at}.`,
  surveyor: 'Choose a surveyor. Only a surveyor’s login can take a survey job.',
  open: (who: string) => `A survey job is already open on this claim, with ${who}.`,
  no_assessment: 'This claim has no assessment, so there is no figure to lock. A person must size it first.',
  no_figure: 'The assessment showed the client no figure, so there is no figure to lock. A person must size it first.',
  not_estimated: 'not estimated at the assessment',
} as const;

type ClaimRow = { id: string; business_id: string; assessment_id: string | null; stage: string };

const objFor = (c: ClaimRow, surveyor_id: string | null) =>
  ({ type: 'surveyor_job' as const, id: c.id, business_id: c.business_id, surveyor_id });

/** The surveyor logins a job may go to, by name. */
export function surveyorChoices(db: Db): { id: string; name: string }[] {
  return db.all<{ id: string; name: string }>(
    "SELECT id, display_name AS name FROM users WHERE role = 'SURVEYING' AND disabled_at IS NULL ORDER BY display_name, id");
}

export type SurveyJobPanel = {
  readonly at_survey: boolean;
  readonly may_open: boolean;
  readonly job: { readonly id: string; readonly surveyor: string | null; readonly opened_at: string; readonly figures_in: boolean } | null;
  readonly surveyors: readonly { id: string; name: string }[];
};

/** What the claim page shows about the claim's survey job. null for a login that may not see claims' survey jobs. */
export function surveyJobPanel(db: Db, actor: Actor, claim_id: string): SurveyJobPanel | null {
  const c = db.get<ClaimRow>('SELECT id, business_id, assessment_id, stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return null;
  const job = db.get<{ id: string; surveyor: string | null; created_at: string; state: string }>(
    'SELECT j.id, u.display_name AS surveyor, j.created_at, j.state FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
      'WHERE j.claim_id = ? ORDER BY j.created_at DESC, j.id LIMIT 1', [claim_id]);
  const may_open = can(actor, 'surveyor_job.assign', objFor(c, null));
  if (!may_open && job === undefined) return null;
  return {
    at_survey: c.stage === 'SURVEY',
    may_open: may_open && c.stage === 'SURVEY' && job === undefined,
    job: job === undefined ? null : { id: job.id, surveyor: job.surveyor, opened_at: job.created_at, figures_in: job.state === 'COMMITTED_AND_RELEASED' },
    surveyors: may_open ? surveyorChoices(db) : [],
  };
}

/** What the client said was spent on the buildings (the funnel's `Q2-N-spend` answers), in pounds; null if none. */
function spendSaid(db: Db, assessment_id: string): number | null {
  const rows = db.all<{ value: string | null }>(
    "SELECT value FROM assessment_answers WHERE assessment_id = ? AND state = 'ANSWERED' AND question_id GLOB 'Q2-[0-9]*-spend'", [assessment_id]);
  const total = rows.reduce((s, r) => { const v = Number(r.value); return Number.isFinite(v) && v > 0 ? s + v : s; }, 0);
  return total > 0 ? total : null;
}

/** Seal the funnel's figure as the assessment's estimate, unless one is sealed already. Inside the caller's transaction. */
function sealFunnelEstimate(d: OpenDeps, business_id: string, assessment_id: string, at: string): { ok: true; sealed: boolean } | { ok: false; why: string } {
  if (d.db.get<{ id: string }>('SELECT id FROM estimates WHERE assessment_id = ?', [assessment_id]) !== undefined) return { ok: true, sealed: false };
  const a = d.db.get<{ shown_high_pence: number | null }>('SELECT shown_high_pence FROM assessments WHERE id = ?', [assessment_id]);
  const high = a?.shown_high_pence ?? null;
  if (high === null || !(high > 0)) return { ok: false, why: SURVEY_JOB_WORDS.no_figure };
  const spent = spendSaid(d.db, assessment_id);
  const pct = spent === null ? 0 : Math.round((high / (spent * 100)) * 10_000) / 10_000;
  const values = {
    qualifying_expenditure_pence: high, qualifying_pct: pct, pool_split_main_pence: 0, pool_split_special_pence: 0,
    bare_land_pence: 0, multiplier: 0, indicative_lifetime_saving_pence: 0, basis: FUNNEL_CEILING,
  };
  const hash = createHash('sha256').update(JSON.stringify({ assessment_id, sealed_at: at, ...values })).digest('hex');
  d.db.run(
    'INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, ' +
      'pool_split_special_pence, bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash, basis) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [d.newId(), assessment_id, business_id, values.qualifying_expenditure_pence, values.qualifying_pct, 0, 0, 0, 0, 0, at, hash, FUNNEL_CEILING]);
  return { ok: true, sealed: true };
}

/** Open a survey job on a claim at Survey, for the surveyor chosen, sealing the estimate with it. */
export function openSurveyJob(
  d: OpenDeps, actor: Actor, claim_id: string, surveyor_id: string | null,
): { ok: true; job_id: string; sealed: boolean } | { ok: false; why: string; field?: string } {
  const c = d.db.get<ClaimRow>('SELECT id, business_id, assessment_id, stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return { ok: false, why: SURVEY_JOB_WORDS.none };
  authorise(actor, 'surveyor_job.assign', objFor(c, surveyor_id));
  if (c.stage !== 'SURVEY') return { ok: false, why: SURVEY_JOB_WORDS.stage(stageLabel(c.stage)) };
  const open = d.db.get<{ surveyor: string | null }>(
    'SELECT u.display_name AS surveyor FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id WHERE j.claim_id = ? LIMIT 1', [claim_id]);
  if (open !== undefined) return { ok: false, why: SURVEY_JOB_WORDS.open(open.surveyor ?? 'nobody assigned') };
  const surveyor = surveyor_id === null ? undefined
    : d.db.get<{ id: string }>("SELECT id FROM users WHERE id = ? AND role = 'SURVEYING' AND disabled_at IS NULL", [surveyor_id]);
  if (surveyor === undefined) return { ok: false, why: SURVEY_JOB_WORDS.surveyor, field: 'surveyor_id' };
  if (c.assessment_id === null) return { ok: false, why: SURVEY_JOB_WORDS.no_assessment };
  const assessment_id = c.assessment_id;

  const at = d.now();
  const job_id = d.newId();
  let out: { ok: true; job_id: string; sealed: boolean } | { ok: false; why: string } = { ok: false, why: SURVEY_JOB_WORDS.no_figure };
  d.db.tx(() => {
    const sealed = sealFunnelEstimate(d, c.business_id, assessment_id, at);
    if (!sealed.ok) { out = sealed; return; }
    d.db.run(
      "INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, 'SEALED', NULL, ?, ?)",
      [job_id, c.business_id, assessment_id, surveyor.id, at, c.id]);
    d.audit.append({
      at, kind: 'SURVEY_JOB_OPENED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: c.id, detail: { job_id, estimate_sealed_now: sealed.sealed },
    });
    out = { ok: true, job_id, sealed: sealed.sealed };
  });
  return out;
}

/** The basis a sealed estimate was built from (migration 100); null for one written before it, or none. */
export function estimateBasis(db: Db, assessment_id: string): string | null {
  return db.get<{ basis: string | null }>('SELECT basis FROM estimates WHERE assessment_id = ?', [assessment_id])?.basis ?? null;
}
