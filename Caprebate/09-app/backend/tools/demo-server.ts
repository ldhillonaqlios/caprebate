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

/* PHASE 135: A VIEW-ONLY LOGIN, IN THE DEMO ONLY. The seed is one user per role and gives the view-only role to nobody
   (Phase 132e), so the demo had no way to see the back office as Read only. This launcher adds one, with the seed's
   password; src/seed.ts is unchanged, so no other database gains a user. */
{
  const t = made.app.now();
  const id = 'u-demo-readonly';
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    [id, 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(r.password), t, t],
  );
  r.users.push({ id, email: 'readonly@example.invalid', role: 'READ_ONLY' });
}

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
