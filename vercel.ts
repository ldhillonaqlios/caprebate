/**
 * THE VERCEL SETTINGS FOR BOTH WEBSITES, from one file. Phase 161h, 7 November 2026 (until then this was vercel.json; its
 * text is in git: git show 234f108:vercel.json).
 *
 * WHY A .ts FILE. The live website needs timers (Vercel Cron) that the test website must not have: the test project is on
 * Vercel's free plan, which refuses any timer that runs more than once a day, and its own outside timer (cron-job.org)
 * already wakes it. Crons can only be given in a project's settings file, and both projects build this one repository. A
 * .ts settings file is worked out when each project builds, with that project's own settings, so the timers are given
 * only where CAPREBATE_PRODUCTION=1 (the live project). Proved on a throwaway project on 7 Nov 2026: the crons followed
 * the setting, both ways. Vercel takes one settings file only: vercel.json is gone, not beside it.
 *
 * THE REGION IS NOT HERE: each project's Functions region in its own settings (the test project: Washington, iad1, beside
 * its US database; the live project: London, lhr1). The same throwaway project showed that a region given here was not
 * followed and the project's own setting was (LIVE-RUNBOOK.md, step 2).
 *
 * Nothing else differs between the two: the same build, the same function, the same files carried, the same rewrite.
 * vercelConfig({}) is exactly the old vercel.json; the back end's tests read it from here.
 */
export type Cron = { readonly path: string; readonly schedule: string };

/** The live website's timers (src/web/timers.ts, TIMER_SCHEDULES; a test holds the two equal). Times are UTC. */
export const LIVE_CRONS: readonly Cron[] = Object.freeze([
  { path: '/hooks/timer/every-five-minutes', schedule: '*/5 * * * *' },
  { path: '/hooks/timer/nightly', schedule: '30 1 * * *' },
  { path: '/hooks/timer/backup', schedule: '0 2 * * *' },
]);

export function vercelConfig(env: Readonly<Record<string, string | undefined>>) {
  const live = (env['CAPREBATE_PRODUCTION'] ?? '').trim() === '1';
  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    installCommand: 'npm install --omit=dev',
    buildCommand: 'node Caprebate/09-app/backend/tools/prepare-lasting.mjs',
    outputDirectory: 'public',
    functions: {
      'api/index.mjs': {
        includeFiles: '{Caprebate site.html,Caprebate/**,node_modules/**}',
        maxDuration: 300,
      },
    },
    rewrites: [
      { source: '/(.*)', destination: '/api/index' },
    ],
    ...(live ? { crons: LIVE_CRONS.map((c) => ({ ...c })) } : {}),
  };
}

export const config = vercelConfig(process.env);
