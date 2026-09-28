/**
 * PHASE 144 — plain words, CRM screens.
 *
 * The property page's browser tab named the company twice: a property recorded as "Dunmarrow Medical Practice
 * Limited — main site" gave the tab "Dunmarrow Medical Practice Limited — Dunmarrow Medical Practice Limited — main
 * site". The company is said once, then the property ("main site"), through propertyIn in src/web/components.ts.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };

function makeClient(base: string): { get(p: string): Promise<Res>; post(p: string, f: Record<string, string>): Promise<Res> } {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const headers = { ...(init.headers as Record<string, string> | undefined) };
    if (cookie !== '') headers['cookie'] = cookie;
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text() };
  };
  return {
    get: (path) => req(path),
    post: (path, fields) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() }),
  };
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

describe('phase 144 · the property page’s tab title names the company once, then the property', () => {
  let made: Made;
  let base = '';
  let password = '';
  before(async () => {
    const clock = { now: '2026-09-22T10:00:00.000Z' };
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-144-')), now: () => clock.now, sealKey: randomBytes(32) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    password = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
  });
  after(() => made.close());

  test('a property recorded as "Company — main site" gives the tab "Company — main site", not the company twice', async () => {
    const db = made.app.db;
    const p = db.get<{ id: string; label: string; company: string }>(
      "SELECT p.id, p.label, b.name AS company FROM properties p JOIN businesses b ON b.id = p.business_id WHERE b.name LIKE 'Dunmarrow%' AND p.label LIKE '% — main site' LIMIT 1");
    assert.ok(p, 'the seed holds no Dunmarrow main site');
    assert.ok(p.label.startsWith(`${p.company} — `), `the seed's property is no longer recorded with the company in front: ${p.label}`);
    const sales = makeClient(base);
    assert.equal((await sales.post('/login', { email: 'sales@example.invalid', password })).status, 303);
    const r = await sales.get(`/staff/properties/${p.id}`);
    assert.equal(r.status, 200);
    const title = /<title>([\s\S]*?)<\/title>/.exec(r.body)?.[1] ?? '';
    assert.notEqual(title, '', 'the page has no <title>');
    assert.equal(count(title, p.company), 1, `the tab names the company ${count(title, p.company)} times: ${title}`);
    assert.ok(title.startsWith(`${p.company} — main site`), `the tab does not read "company — property": ${title}`);
  });

  test('a property whose name does not start with the company keeps its whole name after the company', async () => {
    const db = made.app.db;
    const p = db.get<{ id: string; company: string }>(
      "SELECT p.id, b.name AS company FROM properties p JOIN businesses b ON b.id = p.business_id WHERE b.name LIKE 'Dunmarrow%' ORDER BY p.label LIMIT 1");
    assert.ok(p);
    db.run('UPDATE properties SET label = ? WHERE id = ?', ['Riverside annexe', p.id]);
    const sales = makeClient(base);
    assert.equal((await sales.post('/login', { email: 'sales@example.invalid', password })).status, 303);
    const r = await sales.get(`/staff/properties/${p.id}`);
    assert.equal(r.status, 200);
    const title = /<title>([\s\S]*?)<\/title>/.exec(r.body)?.[1] ?? '';
    assert.equal(count(title, p.company), 1, title);
    assert.ok(title.startsWith(`${p.company} — Riverside annexe`), title);
  });
});
