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

  // PHASE 153f, 4 October 2026: the old address screen (Q2) is retired; the four-stage funnel's address screen
  // ("details", stage 3) draws the same link, from the same switch.
  test('the served address question reads CB_REGISTRY.precondition through registryGate, and nothing else', () => {
    const src = readFileSync(new URL('../src/web/router.ts', import.meta.url), 'utf8');
    const f4 = src.slice(src.indexOf('function f4Page('), src.indexOf('function f4FigurePage('));
    assert.ok(f4.length > 0, 'the four-stage screen was not found');
    assert.match(f4, /id === 'details' \? noticeAtAddress\(registryGate\(\)\)/);
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
      // PHASE 153f: the address question is the four-stage funnel's "details" screen.
      await get('/assessment');
      await post('/assessment/buildings', { b0_sector: 'care_homes' });
      await post('/assessment/spend-on', { b0_trigger: 'purchase' });
      await post('/assessment/amounts', { b0_spend: '2400000', b0_date: '06/2021' });
      await post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
      await post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
      await post('/assessment/works', { b0_works: 'no' });
      const page = await (await get('/assessment/details')).text();
      assert.match(page, /Who owns each building, and where is it\?/, 'the address question was reached');
      assert.doesNotMatch(page, /href="\/notices\/"[^>]*>Our privacy notice/);
      assert.doesNotMatch(page, /id="q2-notice"/);
      // and an old link to the retired address screen opens the four-stage funnel.
      assert.equal((await get('/assessment/Q2')).headers.get('location'), '/assessment/buildings');
    } finally {
      made.close();
    }
  });
});
