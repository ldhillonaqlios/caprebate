/**
 * PHASE 153 (28 September 2026) — THE PRIVACY NOTICE AT THE BACK END'S ADDRESS QUESTION, BUILT AND SWITCHED OFF.
 *
 * The free register lookups rest on legitimate interests, and CB_REGISTRY.precondition says they wait on "a published
 * privacy notice reachable from the address question". The site file's funnel drew that link in Phase 153 (harness
 * Suite Q7); the served assessment is this back end's own (src/web/router.ts, screen Q2), so it needs it too.
 *
 *   1. the switch is off, so nothing is drawn;
 *   2. with the switch on, the link to /notices/ is drawn, and it asks nothing (no tick box);
 *   3. the served address question reads CB_REGISTRY.precondition itself (registryGate), not a second switch;
 *   4. end to end: today's served address question carries no /notices/ link, because the switch ships off.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { noticeAtAddress } from '../src/web/components.ts';
import { registryGate } from '../src/web/engine.ts';

describe('Phase 153 — the privacy notice link at the address question', () => {
  test('the switch ships off, so the address question draws no link to /notices/', () => {
    assert.equal(registryGate().enabled, false);
    assert.equal(String(noticeAtAddress(registryGate())), '');
    assert.equal(String(noticeAtAddress({ enabled: false })), '');
  });

  test('with the same switch on, the address question links to /notices/ and asks nothing', () => {
    const out = String(noticeAtAddress({ enabled: true }));
    assert.match(out, /<a href="\/notices\/"[^>]*>Our privacy notice<\/a>/);
    assert.match(out, /free public records/);
    assert.doesNotMatch(out, /type="checkbox"|<input|I agree|consent/i);
  });

  test('the served address question reads CB_REGISTRY.precondition through registryGate, and nothing else', () => {
    const src = readFileSync(new URL('../src/web/router.ts', import.meta.url), 'utf8');
    const q2 = src.slice(src.indexOf("if (id === 'Q2') {"), src.indexOf('Where is it?</label>'));
    assert.ok(q2.length > 0, 'the Q2 screen was not found');
    assert.match(q2, /noticeAtAddress\(registryGate\(\)\)/);
    assert.equal((src.match(/noticeAtAddress\(/g) ?? []).length, 1, 'drawn in exactly one place');
  });

  test('end to end: the served address question carries no /notices/ link while the switch is off', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    try {
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      let cookie = '';
      const keep = (r: Response): Response => {
        const set = r.headers.getSetCookie?.() ?? [];
        for (const c of set) cookie = [cookie, c.split(';')[0]].filter(Boolean).join('; ');
        return r;
      };
      const get = async (path: string) => keep(await fetch(base + path, { headers: { cookie }, redirect: 'manual' }));
      const post = async (path: string, fields: Record<string, string>) => keep(await fetch(base + path, {
        method: 'POST', redirect: 'manual',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      }));
      await get('/assessment');
      await post('/assessment/Q1', { own_prior_claim: 'no' });
      await post('/assessment/Q1a', { previous_owner_claimed: 'dont_know' });
      await post('/assessment/Q1b', { is_uk_taxpayer: 'yes', current_year_position: 'profitable' });
      await post('/assessment/Q1c', { trigger_default: 'purchase' });
      const page = await (await get('/assessment/Q2')).text();
      assert.match(page, /Where is it\?/, 'the address question was reached');
      assert.doesNotMatch(page, /href="\/notices\/"[^>]*>Our privacy notice/);
      assert.doesNotMatch(page, /id="q2-notice"/);
    } finally {
      made.close();
    }
  });
});
