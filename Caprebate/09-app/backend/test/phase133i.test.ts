/**
 * PHASE 133i, 18 September 2026 — WHO THE CLIENT'S LETTER PAGE SAYS SETTLES THE OPEN TERMS.
 *
 * Lakhbir Dhillon has no affiliation with CAP REBATE LTD: he is not a director and does not act or sign for it
 * (Lakhbir, 18 September 2026). The client's engagement-letter page said the open terms "sit with Lakhbir Dhillon".
 * They are the company's to settle. This drives the real application: a funnel, a client login, the letter page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

const PASSWORD = 'a-very-long-development-password';
const T = '2026-09-08T00:00:00.000Z';

function makeClient(base: string) {
  const c = {
    cookie: '',
    async req(path: string, init: RequestInit = {}) {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (c.cookie !== '') headers['cookie'] = c.cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) {
        const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
        for (const s of set) { const first = s.split(';')[0] ?? ''; jar.set(first.split('=')[0] ?? '', first); }
        c.cookie = [...jar.values()].join('; ');
      }
      return { status: r.status, body: await r.text() };
    },
    post(path: string, fields: Record<string, string>) {
      return c.req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString() });
    },
  };
  return c;
}

test('the client letter page says the open terms are CAP REBATE LTD’s to settle, and never names Lakhbir', async () => {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-133i-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  try {
    const addr = made.server.address();
    const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    const hash = await made.app.hasher.hash(PASSWORD);
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,NULL)', ['u-SALES', 'sales@example.invalid', 'sales@example.invalid', 'SALES Person', 'SALES', hash, T, T]);
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      made.app.db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
        [`wt-${weekday}`, 'u-SALES', weekday, 0, 24 * 60]);
    }
    const visitor = makeClient(base);
    // PHASE 153f: the six old screens are retired; the same answers go through the four-stage funnel.
    await visitor.req('/assessment');
    await visitor.post('/assessment/buildings', { b0_sector: 'care_homes' });
    await visitor.post('/assessment/spend-on', { b0_trigger: 'purchase' });
    await visitor.post('/assessment/amounts', { b0_spend: '2400000', b0_date: '06/2021' });
    await visitor.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
    await visitor.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
    await visitor.post('/assessment/works', { b0_works: 'no' });
    await visitor.post('/assessment/details', { b0_business: 'Meadowcroft Care Limited', b0_entity: 'ltd', b0_line1: 'Meadowcroft House', b0_postcode: 'ZZ9 9ZZ' });
    const close = await visitor.req('/assessment/figure');
    const slots = [...close.body.matchAll(/name="slot" value="([^"]+)"/g)].map((m) => m[1] ?? '').filter((v) => v !== '');
    const slot = slots[slots.length - 1] ?? '';
    assert.notEqual(slot, '', 'the funnel offered no times at all');
    const submitted = await visitor.post('/assessment/close', { first_name: 'A', surname: 'Person',
      job_role: 'owner_director', channel: 'phone', phone: '01632 960111', contact_consent: 'on', slot });
    assert.equal(submitted.status, 200, 'the funnel did not close');
    const row = made.app.db.get<{ business_id: string }>('SELECT business_id FROM bookings');
    assert.ok(row !== undefined);
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)', ['u-CLIENT', 'client@example.invalid', 'client@example.invalid', 'Client Person', 'CLIENT', hash, T, T, row.business_id]);
    const client = makeClient(base);
    assert.equal((await client.post('/login', { email: 'client@example.invalid', password: PASSWORD })).status, 303);
    const page = await client.req('/portal/letter');
    assert.equal(page.status, 200);
    assert.match(page.body, /left blank on purpose/);
    assert.match(page.body, /These terms are CAP REBATE LTD’s to settle\./);
    assert.doesNotMatch(page.body, /Lakhbir/);
  } finally { made.server.close(); made.app.db.close?.(); }
});
