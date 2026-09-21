/**
 * THE VERCEL ENTRY POINT — a throwaway TEST deployment of the whole application, with INVENTED data only.
 *
 * It does what `npm run start:demo` does: builds the application on an in-memory database, seeds the invented
 * users and clients, and answers every request with the same server. Nothing is kept: a new instance starts from
 * the seed again, and the data lives only as long as the instance does. Real data never goes here.
 *
 * The code runs as TypeScript directly, as it does everywhere else (Node 24 strips the types).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ready;

async function build() {
  const { createApp } = await import('../Caprebate/09-app/backend/src/server.ts');
  const { seed } = await import('../Caprebate/09-app/backend/src/seed.ts');
  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  const publicOrigin = process.env.CAPREBATE_PUBLIC_ORIGIN ?? (host ? `https://${host}` : undefined);
  const made = await createApp(':memory:', {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-vercel-')),
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
  });
  const r = await seed(made.app.db, made.app.hasher, made.app.now);
  // PHASE 136: the view-only login, as tools/demo-server.ts adds it — here and in the demo only, never in src/seed.ts.
  {
    const t = made.app.now();
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-demo-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(r.password), t, t],
    );
  }
  // No email is sent. The outbox (with a sign-up's confirmation link) goes to the function log, as the demo prints it.
  const shown = new Set();
  setInterval(() => {
    for (const m of made.app.db.all('SELECT id, to_email, subject, body FROM outbox ORDER BY created_at')) {
      if (shown.has(m.id)) continue;
      shown.add(m.id);
      console.log(`--- outbox (not sent) to ${m.to_email}: ${m.subject}\n${m.body}\n---`);
    }
  }, 1000).unref();
  return made.server.listeners('request')[0];
}

export default async function handler(req, res) {
  ready ??= build();
  const listener = await ready;
  return listener(req, res);
}
