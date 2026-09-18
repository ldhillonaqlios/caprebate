/** See demo-server.cjs. In-memory, seeded, for looking at the screens. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

if (process.env.CAPREBATE_ALLOW_SEED !== '1') {
  console.error('refusing to run: this launcher seeds invented data with a known password');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8105);
/* PHASE 133j: the address links in emails point at. In a GitHub Codespace it is the forwarded address of this port;
   otherwise localhost. CAPREBATE_PUBLIC_ORIGIN, if set, wins. */
const cs = process.env.CODESPACE_NAME;
const csDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const publicOrigin = process.env.CAPREBATE_PUBLIC_ORIGIN
  ?? (cs !== undefined && csDomain !== undefined ? `https://${cs}-${port}.${csDomain}` : `http://localhost:${port}`);
const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-demo-')), publicOrigin });
const r = await seed(made.app.db, made.app.hasher, made.app.now);

/* PHASE 133j: NOTHING IS EMAILED — the transport is the outbox stub. So this launcher, and only this launcher, prints
   each new outbox message to the terminal, so a person trying the sign-up can open the confirmation link. The demo's
   data is invented and lives in memory. */
const shown = new Set(made.app.db.all<{ id: string }>('SELECT id FROM outbox').map((m) => m.id));
setInterval(() => {
  for (const m of made.app.db.all<{ id: string; to_email: string; subject: string; body: string }>(
    'SELECT id, to_email, subject, body FROM outbox ORDER BY created_at')) {
    if (shown.has(m.id)) continue;
    shown.add(m.id);
    console.log(`\n--- outbox (not sent) to ${m.to_email}: ${m.subject}\n${m.body}\n---`);
  }
}, 1000).unref();

made.server.listen(port, () => {
  console.log(`caprebate demo on http://localhost:${port}  (links in emails use ${publicOrigin})`);
  for (const u of r.users) console.log(`  ${u.role.padEnd(11)} ${u.email}`);
  console.log(`  password: ${r.password}`);
  console.log('  the website is at /, the back office at /login');
});
