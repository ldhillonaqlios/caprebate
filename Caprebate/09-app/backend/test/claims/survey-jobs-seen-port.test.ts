/**
 * PHASE 161l2: THE CLAIMS' PORT FOR HOW MANY SURVEY JOBS SAW A REGISTER RECORD (src/modules/claims/survey-jobs-seen.ts).
 *
 * The take-back moved from the portal to the claims, and it counts the survey jobs that could see an entry being taken
 * out. The jobs are the survey's table and the survey sits above the claims, so the claims own a port and the survey's
 * front door fills it as it loads (src/modules/survey/survey-jobs-seen.ts). This holds that the port refuses, loudly,
 * when nothing has filled it; that loading the survey's door fills it; and that what it gives is exactly what the
 * survey's statement gave the take-back before (the count of sealed jobs and jobs committed since), for every client
 * and for a time before, between and after the jobs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';

const BACKEND = join(import.meta.dirname, '..', '..');

test('asked before the survey has filled it, the port refuses and says why', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "const p = await import('./src/modules/claims/survey-jobs-seen.ts'); try { p.surveyorJobsSeenSince({}, 'b', '2026-01-01'); console.log('ANSWERED'); } catch (e) { console.log('REFUSED: ' + e.message); }"],
  { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^REFUSED: How many survey jobs saw an entry is not set up\. The survey sets it up when it loads/);
});

test("loading the survey's front door fills it, from that door and no other", () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "await import('./src/modules/survey/index.ts'); const p = await import('./src/modules/claims/survey-jobs-seen.ts'); " +
    "try { p.surveyorJobsSeenSince({ get: () => ({ n: 7 }) }, 'b', '2026-01-01') === 7 ? console.log('FILLED') : console.log('WRONG'); } catch (e) { console.log('REFUSED: ' + e.message); }"],
  { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'FILLED');
});

test("it gives what the survey's statement gave the take-back, for every client and every moment", async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const { surveyorJobsSeenSince } = await import('../../src/modules/claims/survey-jobs-seen.ts');
  const was = (b: string, since: string): number => app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM surveyor_jobs WHERE business_id = ? AND (state = 'SEALED' OR committed_at >= ?)", [b, since])?.n ?? 0;
  const times = ['0000', '2026-01-01', ...app.db.all<{ t: string }>('SELECT committed_at AS t FROM surveyor_jobs WHERE committed_at IS NOT NULL').map((r) => r.t), '9999'];
  let some = 0;
  for (const { id } of app.db.all<{ id: string }>("SELECT id FROM businesses UNION ALL SELECT 'no-such-business'")) {
    for (const t of times) {
      assert.equal(surveyorJobsSeenSince(app.db, id, t), was(id, t), `${id} since ${t}`);
      some += was(id, t);
    }
  }
  assert.ok(some > 0, 'the seed has survey jobs, so the comparison is about something');
  app.close();
});
