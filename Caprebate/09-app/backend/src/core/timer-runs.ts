/**
 * THE LIVE WEBSITE'S TIMER RUNS, AS ADMIN SEES THEM (Phase 161n1d, ITRoadway's second review, M-10). Each run of a timer
 * (src/app/timers.ts) is written to timer_runs (migration 124); this reads back, for each job, its last run and its last
 * good run, for Admin's Connections page. Here, in the core, because the admin area may not import the start-up code.
 * The names are the migration's own list; test/core/alerts-backups-and-headers.test.ts checks they match TIMER_JOBS.
 */
import type { Db } from './db.ts';
import { getTimerRunsLastByJob, getTimerRunsLastGoodByJob } from './data.ts';

export const TIMER_JOB_NAMES = Object.freeze(['every-five-minutes', 'nightly', 'backup'] as const);

export type TimerHealth = { readonly job: string; readonly last: { readonly at: string; readonly ok: boolean } | null; readonly last_good: string | null };

export function timerHealth(db: Db): TimerHealth[] {
  return TIMER_JOB_NAMES.map((job) => {
    const l = getTimerRunsLastByJob<{ at: string; ok: number }>(db, [job]);
    return { job, last: l === undefined ? null : { at: l.at, ok: l.ok === 1 }, last_good: getTimerRunsLastGoodByJob<{ at: string }>(db, [job])?.at ?? null };
  });
}
