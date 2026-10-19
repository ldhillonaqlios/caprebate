/**
 * UI TIDY PHASE 11 — THE SURVEY PACK, 3 October 2026 (src/web/survey-pack-pages.ts, src/web/survey-video.ts).
 * Lakhbir: "The survey pack doesn't say which of a client's surveys you are looking at. Dunmarrow has two, and I opened
 * the wrong one first", and lengths read "0 min 32 s". The pack names its client, site and claim in a dark band, says
 * which of the client's jobs it is, switches to the other at the same chapter, marks itself in the job's menu, and groups
 * what is still needed. Lengths read "32 s".
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHarness, type Harness } from './ui-tidy-harness.ts';
import * as S from '../src/web/surveyor.ts';
import * as P from '../src/web/survey-pack.ts';
import { jobSite } from '../src/web/surveyor-pages.ts';
import { lengthWords } from '../src/web/survey-video.ts';
import { siteOf } from '../src/web/look.ts';

let H: Harness;
before(async () => { H = await startHarness('uit11'); });
after(() => H.close());

const jobs = (): S.JobRow[] => S.surveyorJobs(H.made.app.db, H.actor('surveying'))
  .sort((a, b) => (a.claim_ref ?? '').localeCompare(b.claim_ref ?? '') || a.job_id.localeCompare(b.job_id));
const head = (body: string): { title: string; facts: string; switches: [string, string][] } | null => {
  const m = /<section class="packhead" aria-label="Which survey pack this is"><div>\s*<p class="packhead-kind">Survey pack<\/p>\s*<p class="packhead-title">([^<]*)<\/p>\s*<p class="packhead-facts">([^<]*)<\/p><\/div>([\s\S]*?)<\/section>/.exec(body);
  if (m === null) return null;
  return { title: m[1] ?? '', facts: m[2] ?? '', switches: [...(m[3] ?? '').matchAll(/<a class="packhead-switch" href="([^"]+)">([^<]+)<\/a>/g)].map((x) => [x[1] ?? '', x[2] ?? '']) };
};

describe('UI tidy phase 11: lengths', () => {
  test('a length reads "32 s", "2 min", "2 min 12 s" — never "0 min 32 s"', () => {
    assert.equal(lengthWords(32), '32 s');
    assert.equal(lengthWords(0), '0 s');
    assert.equal(lengthWords(59.6), '1 min');
    assert.equal(lengthWords(120), '2 min');
    assert.equal(lengthWords(132), '2 min 12 s');
    assert.equal(lengthWords(-5), '0 s');
  });
});

describe('UI tidy phase 11: which pack this is', () => {
  test('each of Dunmarrow’s packs names the client, its site, its claim and postcode, and which of the two it is', async () => {
    const dun = jobs().filter((j) => j.business_name.startsWith('Dunmarrow'));
    assert.equal(dun.length, 2);
    for (const [i, j] of dun.entries()) {
      const body = (await H.get('surveying', `/staff/survey/${j.job_id}/pack?ch=4`)).body;
      const v = P.packView({ db: H.made.app.db, audit: H.made.app.audit, now: H.made.app.now, newId: () => '' } as never, H.actor('surveying'), j.job_id);
      const site = v.property !== null ? siteOf(j.business_name, v.property.label) : jobSite(j);
      const h = head(body);
      assert.ok(h !== null, 'no pack heading');
      assert.equal(h.title, `${j.business_name}: ${site}`);
      const postcode = v.property?.postcode ?? j.property_postcode;
      assert.equal(h.facts, [j.claim_ref, postcode, `survey job ${i + 1} of 2 for this client`].filter((x) => x !== null).join(' · '));
      const other = dun[1 - i] as S.JobRow;
      assert.deepEqual(h.switches, [[`/staff/survey/${other.job_id}/pack?ch=4`, `Switch to ${jobSite(other)}`]]);
    }
  });

  test('the switch keeps the chapter; a client with one job has no switch and no "job n of N"', async () => {
    const [a, b] = jobs().filter((j) => j.business_name.startsWith('Dunmarrow'));
    assert.ok(a !== undefined && b !== undefined);
    assert.deepEqual(head((await H.get('surveying', `/staff/survey/${a.job_id}/pack?ch=10`)).body)?.switches[0]?.[0], `/staff/survey/${b.job_id}/pack?ch=10`);
    const fen = jobs().find((j) => j.business_name.startsWith('Fenmoor'));
    assert.ok(fen !== undefined);
    const h = head((await H.get('surveying', `/staff/survey/${fen.job_id}/pack?ch=4`)).body);
    assert.deepEqual(h?.switches, []);
    assert.doesNotMatch(h?.facts ?? '', /survey job/);
  });

  test('the job’s menu opens out on the pack, with Survey pack marked', async () => {
    const j = jobs()[0] as S.JobRow;
    const body = (await H.get('surveying', `/staff/survey/${j.job_id}/pack?ch=4`)).body;
    const nav = /<nav class="appnav" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
    assert.ok(nav.includes(`<p class="subtitle">${j.business_name}: ${jobSite(j)}</p>`));
    assert.ok(nav.includes(`<a href="/staff/survey/${j.job_id}/pack?ch=4" aria-current="page">Survey pack</a>`));
    const onJob = (await H.get('surveying', `/staff/survey/${j.job_id}`)).body;
    assert.ok(onJob.includes(`<a href="/staff/survey/${j.job_id}/pack?ch=4">Survey pack</a>`), 'Survey pack is marked on the job page');
  });
});

describe('UI tidy phase 11: still needed, in groups', () => {
  test('two lines — chapter 9’s values and chapter 10’s lines — whose counts add up, and every one still listed behind "Show all"', async () => {
    const j = jobs()[0] as S.JobRow;
    const body = (await H.get('surveying', `/staff/survey/${j.job_id}/pack?ch=4`)).body;
    const v = P.packView({ db: H.made.app.db, audit: H.made.app.audit, now: H.made.app.now, newId: () => '' } as never, H.actor('surveying'), j.job_id);
    const n = v.sums.needed.length;
    assert.ok(n > 0, 'the seed’s pack has values still needed');
    assert.match(body, new RegExp(`<h2>Still needed: ${n}</h2>`));
    const counts = [...body.matchAll(/<td><span class="badge b-late">(\d+)<\/span><\/td><td><a href="[^"]+\?ch=(9|10)">Go to chapter (9|10)<\/a><\/td>/g)];
    assert.deepEqual(counts.map((c) => c[2]), [...(v.sums.needed.some((x) => x.where === 'INPUT') ? ['9'] : []), ...(v.sums.needed.some((x) => x.where !== 'INPUT') ? ['10'] : [])]);
    assert.equal(counts.reduce((t, c) => t + Number(c[1]), 0), n);
    const all = /<details class="morelist"><summary>Show all (\d+), one per line<\/summary>\s*<ul class="pk-needed">([\s\S]*?)<\/ul>/.exec(body);
    assert.equal(all?.[1], String(n));
    assert.equal([...(all?.[2] ?? '').matchAll(/<li>/g)].length, Math.min(n, 60));
  });
});
