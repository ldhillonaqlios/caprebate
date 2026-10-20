/**
 * PHASE 160g, 20 OCTOBER 2026 — THE NOTICES' EIGHT PROPOSED FACTS CONFIRMED.
 *
 * Lakhbir: "Sadique approves, I relay". The eight facts Phase 160f proposed on the public notices page are kept word
 * for word, their "Proposed" marks off, and the approval recorded in the page as relayed by Lakhbir, for testing. The
 * acceptance check would still refuse the page if a mark came back. Nothing here names a real client.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NOTICES_PATH } from '../src/web/notices-site.ts';

const CHECK = join(import.meta.dirname, '..', '..', '..', '03-app', 'caprebate-notices-acceptance.cjs');

describe('the eight facts confirmed', () => {
  const src = readFileSync(NOTICES_PATH, 'utf8');
  test('each fact kept word for word, no mark left, and the approval recorded as relayed', () => {
    const body = src.replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(body, /class="proposed"|\[NOT SET — /);
    for (const fact of [
      /Last confirmed 20 October 2026\./, /Last reviewed 20 October 2026\./,
      /We rely on <strong>legitimate interests<\/strong> \(Article 6\(1\)\(f\) of the UK GDPR\)/,
      /We keep it for <strong>seven years from the end of the accounting period the claim is made in, or/,
      /<strong>Vercel<\/strong>, which hosts our test website and keeps the documents uploaded to it, in a private store \(Vercel Blob\)\. Both are in the United States \(US East\)\./,
      /<strong>Turso<\/strong>, the database behind our test website\. It is in the United States \(US East, Virginia\)\./,
      /Our test website runs in the United States:/,
      /We keep it for seven years from the end of the accounting period the claim is made in, or one year after any\s+enquiry closes, whichever is later\./,
    ]) assert.match(body, fact);
    assert.match(src, /CONFIRMED - Sadique Maskeen \(data protection officer\) approved this and the other seven\s+facts Phase 160f proposed, relayed by Lakhbir \("Sadique approves, I relay"\), for testing\./);
    assert.doesNotMatch(body, /set with our chartered tax adviser/, 'no tax adviser is appointed, so the page does not say one set it');
  });
  test('the acceptance check still refuses --live if a proposed mark comes back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-160g-'));
    const page = join(dir, 'caprebate-notices-page.html');
    writeFileSync(page, src.replace('Last confirmed 20 October 2026.', 'Last confirmed 20 October 2026 <span class="proposed">Proposed, awaiting our data protection officer:</span> the date.'));
    copyFileSync(join(join(import.meta.dirname, '..', '..', '..', '03-app'), 'caprebate-complaint-form.html'), join(dir, 'caprebate-complaint-form.html'));
    const r = spawnSync(process.execPath, [CHECK, '--live', '--page', page, '--form', join(dir, 'caprebate-complaint-form.html')], { encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout.slice(-600));
    assert.match(r.stdout, /FAIL \(--live\): 1 fact\(s\) proposed/);
  });
});
