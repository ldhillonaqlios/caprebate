/**
 * UI TIDY PHASE 10 — SURVEY JOBS AND A SURVEY JOB, 3 October 2026 (src/web/surveyor-pages.ts, src/web/surveyor.ts).
 * Lakhbir opened the wrong one of Dunmarrow's two surveys. Every job now names its site and its claim number; the job
 * page says which it is, links the client's other jobs, marks its own site, and opens out the left-hand menu.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as S from '../src/web/surveyor.ts';
import { jobSite } from '../src/web/surveyor-pages.ts';
import { stageGroupOf } from '../src/web/look.ts';
import { plainDashText } from '../src/web/plain-dashes.ts';

let H: Harness;
before(async () => { H = await startHarness('uit10'); });
after(() => H.close());

const jobs = (): S.JobRow[] => S.surveyorJobs(H.made.app.db, H.actor('surveying'));
const kpis = (body: string): [string, string][] =>
  [...body.matchAll(/<li class="kpi k-[a-z]+"><span class="kpi-label">([^<]*)<\/span><span class="kpi-value">([^<]*)<\/span>/g)].map((m) => [m[1] ?? '', m[2] ?? '']);

describe('UI tidy phase 10: the Survey jobs list', () => {
  test('every job names its client, its site and its claim number; the client’s two jobs read apart', async () => {
    const body = (await H.get('surveying', '/staff/survey')).body;
    const all = jobs();
    for (const j of all) {
      assert.ok(body.includes(`<a class="rowlink" href="/staff/survey/${j.job_id}">${j.business_name}</a><br><span class="jobsite">${jobSite(j)}</span> <span class="claimref">${j.claim_ref ?? ''}</span>`), j.job_id);
      const g = stageGroupOf(j.claim_stage_key);
      if (g !== null) assert.match(body, new RegExp(`<span class="badge g-${g.key}">${j.stage_label}</span>`));
    }
    const dun = all.filter((j) => j.business_name.startsWith('Dunmarrow'));
    assert.equal(dun.length, 2, 'the seed has two Dunmarrow jobs');
    assert.notEqual(jobSite(dun[0] as S.JobRow), jobSite(dun[1] as S.JobRow));
    assert.notEqual(dun[0]?.claim_ref, dun[1]?.claim_ref);
  });

  test('the boxes count the jobs, those waiting for figures, those in, and the rooms still to count', async () => {
    const all = jobs();
    const sealed = all.filter((j) => j.state === 'SEALED').length;
    assert.deepEqual(kpis((await H.get('surveying', '/staff/survey')).body), [
      ['Jobs open', String(all.length)], ['Waiting for your figures', String(sealed)], ['Figures in', String(all.length - sealed)],
      ['Rooms still to count', String(all.reduce((n, j) => n + Math.max(0, j.rooms_total - j.rooms_counted), 0))],
    ]);
  });

  test('a job on no claim says so instead of a site', () => {
    const j = jobs()[0] as S.JobRow;
    assert.equal(jobSite({ ...j, property_label: null }), 'no site recorded');
    assert.equal(jobSite({ ...j, property_label: `${j.business_name} — west wing` }), 'west wing');
  });

  test('Admin sees the same jobs, each named the same way', async () => {
    const body = (await H.get('admin', '/staff/survey')).body;
    for (const j of jobs()) assert.ok(body.includes(`<span class="jobsite">${jobSite(j)}</span>`), j.job_id);
  });
});

describe('UI tidy phase 10: a survey job', () => {
  const dunJobs = (): S.JobRow[] => jobs().filter((j) => j.business_name.startsWith('Dunmarrow'));

  test('the page says which job it is: the way back names the site, the heading’s line the site and claim, the highlights both', async () => {
    for (const j of dunJobs()) {
      const body = (await H.get('surveying', `/staff/survey/${j.job_id}`)).body;
      assert.match(body, new RegExp(`<li><a href="/staff/survey">Survey jobs</a></li><li><span aria-current="page">${j.business_name}: ${jobSite(j)}</span></li>`));
      assert.ok(body.includes(`<p class="subhead">${jobSite(j)} · <span class="claimref">${j.claim_ref}</span></p>`), j.job_id);
      assert.ok(body.includes(`<div><dt>Site</dt><dd>${jobSite(j)}</dd></div><div><dt>Claim</dt><dd>${j.claim_ref}</dd></div>`), j.job_id);
    }
  });

  test('the client’s other job is a link away, by its site and number', async () => {
    const [a, b] = dunJobs();
    assert.ok(a !== undefined && b !== undefined);
    const body = (await H.get('surveying', `/staff/survey/${a.job_id}`)).body;
    assert.ok(body.includes(`<p class="otherjobs">This client has 2 survey jobs. The other one: <a href="/staff/survey/${b.job_id}">${jobSite(b)}</a> <span class="claimref">${b.claim_ref}</span></p>`));
    const fen = jobs().find((j) => j.business_name.startsWith('Fenmoor'));
    assert.ok(fen !== undefined);
    assert.doesNotMatch((await H.get('surveying', `/staff/survey/${fen.job_id}`)).body, /class="otherjobs"/);
  });

  test('the property lists the job’s own site first, marked “This job”', async () => {
    for (const j of dunJobs()) {
      const body = (await H.get('surveying', `/staff/survey/${j.job_id}`)).body;
      const table = /<h2>The property<\/h2>[\s\S]*?<\/table>/.exec(body)?.[0] ?? '';
      const first = /<tbody><tr( class="thisjob")?>\s*<td>([^<]*)( <span class="badge b-ok">This job<\/span>)?<\/td>/.exec(table);
      assert.equal(first?.[2], plainDashText(j.property_label ?? ''));
      assert.equal(first?.[1], ' class="thisjob"');
      assert.equal((table.match(/This job/g) ?? []).length, 1);
    }
  });

  test('the left-hand menu opens out to the job: its parts, the survey pack and the client’s other job', async () => {
    const [a, b] = dunJobs();
    assert.ok(a !== undefined && b !== undefined);
    const body = (await H.get('surveying', `/staff/survey/${a.job_id}`)).body;
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    assert.ok(nav.includes(`<p class="subtitle">${a.business_name}: ${jobSite(a)}</p>`));
    const items = [...nav.matchAll(/<ul class="subnav">[\s\S]*?<\/ul>/g)].flatMap((m) => [...m[0].matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((x) => [x[1], x[2]]));
    assert.deepEqual(items.slice(0, 6).map((x) => x[1]), ['The property', 'Rooms', 'Rates', 'Evidence', 'Your figures', 'The record']);
    assert.ok(items.some((x) => x[0] === `/staff/survey/${a.job_id}/pack?ch=4` && x[1] === 'Survey pack'));
    assert.ok(items.some((x) => x[0] === `/staff/survey/${b.job_id}` && x[1] === `Their other job: ${jobSite(b)}`));
  });
});
