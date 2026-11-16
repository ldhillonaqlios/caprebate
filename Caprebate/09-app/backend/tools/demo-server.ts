/** See demo-server.cjs. In-memory, seeded, for looking at the screens. */
import { turnstileWhy } from '../src/integrations/connectors/turnstile.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app/server.ts';
import { seed } from '../src/app/seed.ts';

/** PHASE 161n1a (L-06): the one line a queued email gets on the terminal: its kind, never an address, a code or a link. */
function demoOutboxLine(kind: string): string {
  return `email of kind ${String(kind).replace(/[^A-Z0-9_]/gi, '')} queued (read it at /staff/dev-outbox)`;
}

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
// PHASE 161n1a (L-06): Admin's outbox page, /staff/dev-outbox, holds the emails; the terminal never does.
const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-demo-')), publicOrigin, devOutbox: true });
const r = await seed(made.app.db, made.app.hasher, made.app.now);

/* PHASE 135: A VIEW-ONLY LOGIN, IN THE DEMO ONLY. The seed is one user per role and gives the view-only role to nobody
   (Phase 132e), so the demo had no way to see the back office as Read only. This launcher adds one, with the seed's
   password; src/app/seed.ts is unchanged, so no other database gains a user. */
{
  const t = made.app.now();
  const id = 'u-demo-readonly';
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    [id, 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(r.password), t, t],
  );
  r.users.push({ id, email: 'readonly@example.invalid', role: 'READ_ONLY' });
}

/* NOTHING IS EMAILED — the transport is the outbox stub. PHASE 161n1a (ITRoadway's second review, L-06): this used to
   print each whole email to the terminal, sign-in codes and links included, where anyone sharing the terminal (a
   Codespace) could take over the account. Now it says only that one was queued, and of what kind; the email itself
   is read by Admin at /staff/dev-outbox. */
const shown = new Set(made.app.db.all<{ id: string }>('SELECT id FROM outbox').map((m) => m.id));
setInterval(() => {
  for (const m of made.app.db.all<{ id: string; kind: string }>('SELECT id, kind FROM outbox ORDER BY created_at')) {
    if (shown.has(m.id)) continue;
    shown.add(m.id);
    console.log(demoOutboxLine(m.kind));
  }
}, 1000).unref();

made.server.listen(port, () => {
  console.log(`caprebate demo on http://localhost:${port}  (links in emails use ${publicOrigin})`);
  for (const u of r.users) console.log(`  ${u.role.padEnd(11)} ${u.email}`);
  console.log(`  password: ${r.password}`);
  console.log('  the website is at /, the back office at /login');
  console.log(`  ${turnstileWhy(made.app.secrets)}`); // 29 Sep 2026: the contact form's security check
  /* PHASE 151k: every staff login asks for a second step at its first sign-in (Phase 151j). Since Phase 161n1a the
     emails are not printed: set up the authenticator app, or read an email code at /staff/dev-outbox signed in as Admin.
     The screenshot tool (tools/demo-sign-in.ts) sets up an app for itself. */
  console.log('  staff logins ask for a second step: use an authenticator app, or read the emailed code at /staff/dev-outbox (Admin)');
});
