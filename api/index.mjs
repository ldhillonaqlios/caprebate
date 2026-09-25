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
  // PHASE 151e (line 3): a password of its own, and then - only then - the Didit keys from the website's settings.
  const t151e = await configureTestDeploy(made, process.env);
  console.log(`test deployment: ${t151e.why}`);
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

/**
 * PHASE 151e (line 3), 25 September 2026 — DIDIT ON THE TEST WEBSITE, AND NEVER BEHIND THE PUBLIC PASSWORD.
 *
 * Every seeded login's password is SEED_PASSWORD, which sits in src/seed.ts, a file that was downloadable from this
 * website until line 2 closed that. Real keys behind that password would let anyone send identity checks on
 * Lakhbir's Didit account. So:
 *   CAPREBATE_TEST_PASSWORD set (twelve characters or more)
 *       every login this deployment seeded moves to that password, and the seed password stops working; and then
 *       the Didit keys are read from the website's settings (TEST_DEPLOY_KEYS, those three and no other name).
 *   not set, or shorter
 *       nothing changes and NO key is read, whatever the settings hold. The identity panel says the keys are missing.
 * It prints what it did - never a password and never a key.
 */
export const TEST_DEPLOY_KEYS = Object.freeze(['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);

export async function configureTestDeploy(made, env) {
  const pw = (env.CAPREBATE_TEST_PASSWORD ?? '').trim();
  if (pw.length < 12) {
    return { password_changed: false, keys_loaded: [], why: 'no test password of twelve characters or more is set, so the seed logins stand and no key is read' };
  }
  const hash = await made.app.hasher.hash(pw);
  made.app.db.run('UPDATE users SET password_hash = ?', [hash]);
  const { secretsFromEnvironment } = await import('../Caprebate/09-app/backend/src/secrets.ts');
  made.app.secrets = secretsFromEnvironment(env, TEST_DEPLOY_KEYS);
  const loaded = TEST_DEPLOY_KEYS.filter((k) => (env[k] ?? '').trim() !== '');
  return { password_changed: true, keys_loaded: loaded, why: `every login now uses the test password; keys read: ${loaded.join(', ') || 'none'}` };
}

export default async function handler(req, res) {
  ready ??= build();
  const listener = await ready;
  return listener(req, res);
}
