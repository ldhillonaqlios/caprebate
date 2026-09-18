import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './src/server.ts';
import { seed } from './src/seed.ts';

const docs = mkdtempSync(join(tmpdir(), 'cb-smoke-'));
const made = await createApp(':memory:', { documentRoot: docs });
await seed(made.app.db, made.app.hasher, made.app.now);
await new Promise<void>((r) => made.server.listen(0, () => r()));
const port = (made.server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}`;
let cookie = '';
async function req(p: string, init: RequestInit = {}) {
  const headers: Record<string,string> = { ...(init.headers as Record<string,string> ?? {}) };
  if (cookie) headers.cookie = cookie;
  const r = await fetch(base + p, { redirect: 'manual', ...init, headers });
  const set = r.headers.getSetCookie();
  if (set.length) cookie = set.map(s => s.split(';')[0]).join('; ');
  return { status: r.status, loc: r.headers.get('location'), body: await r.text() };
}
const login = await req('/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'},
  body: new URLSearchParams({ email:'sales@example.invalid', password:'change-this-seed-password' }).toString() });
console.log('login', login.status, '->', login.loc);
for (const p of ['/staff','/staff/assessments','/staff/calendar','/staff/calendar?view=week','/staff/settings']) {
  const r = await req(p);
  console.log(p, r.status, r.body.length, r.status>=400 ? r.body.slice(0,300) : '');
}
// open one assessment
const list = await req('/staff/assessments');
const m = /\/staff\/assessments\/([A-Za-z0-9-]+)/.exec(list.body);
if (m) { const r = await req('/staff/assessments/'+m[1]); console.log('detail', r.status, /I don.t know/.test(r.body), /skipped/i.test(r.body)); }
// booking flow
const cal = await req('/staff/calendar');
const bm = /\/staff\/calendar\/([A-Za-z0-9-]+)"/.exec(cal.body);
console.log('booking link found', !!bm);
if (bm) {
  const bp = await req('/staff/calendar/'+bm[1]);
  console.log('booking page', bp.status);
  const sm = /name="starts_at" value="([^"]+)"/.exec(bp.body);
  console.log('first slot', sm && sm[1]);
  if (sm) {
    const sch = await req(`/staff/calendar/${bm[1]}/schedule`, { method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({ starts_at: sm[1], assigned_to: '' }).toString() });
    console.log('schedule ->', sch.status, sch.loc, sch.status>=400 ? sch.body.slice(0,400):'');
  }
}
made.close();
