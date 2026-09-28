/**
 * THE VERCEL ENTRY POINT — a throwaway TEST deployment of the whole application, with INVENTED data only.
 *
 * It does what `npm run start:demo` does: builds the application on an in-memory database, seeds the invented
 * users and clients, and answers every request with the same server. Nothing is kept: a new instance starts from
 * the seed again, and the data lives only as long as the instance does. Real data never goes here.
 *
 * PHASE 151e (line 4), 27 September 2026: ONE DATABASE FOR EVERY COPY, SWITCHED OFF UNTIL LAKHBIR OPENS IT. A check
 * sent from one copy and its result received by another met two different memories, and the result was refused. With
 * CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN in the website's settings (or TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, the
 * names Vercel's Turso integration gives them; a Turso database, through Vercel's Marketplace),
 * AND the test password set, every copy uses that one database: the seed runs only when it is empty. Without all
 * three, nothing changes, and the identity panel says the records are kept in memory (src/web/identity-checks.ts).
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
  const since = new Date().toISOString();
  const opened = await openLasting(createApp, seed, lastingDatabase(process.env), {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-vercel-')),
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
  });
  const made = opened.made;
  console.log(`test deployment: ${opened.why}`);
  // PHASE 151e (line 3): a password of its own, and then - only then - the Didit keys from the website's settings.
  const t151e = await configureTestDeploy(made, process.env);
  console.log(`test deployment: ${t151e.why}`);
  // No email is sent. The outbox (with a sign-up's confirmation link) goes to the function log, as the demo prints it.
  const shown = new Set();
  setInterval(() => {
    // Only what this copy's life has put there: on a lasting database, the older messages were printed before.
    for (const m of made.app.db.all('SELECT id, to_email, subject, body FROM outbox WHERE created_at >= ? ORDER BY created_at', [since])) {
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
 *       every login still on the seed password moves to that password, and the seed password stops working; and then
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
  // PHASE 151j: only the logins STILL ON THE PUBLIC SEED PASSWORD move. On a lasting database a person may have chosen
  // their own password (or been given a temporary one); every cold start overwrote it until 28 Sep 2026.
  const { SEED_PASSWORD } = await import('../Caprebate/09-app/backend/src/seed.ts');
  for (const u of made.app.db.all('SELECT id, password_hash FROM users')) {
    if (await made.app.hasher.verify(u.password_hash, SEED_PASSWORD)) {
      made.app.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
    }
  }
  const { secretsFromEnvironment } = await import('../Caprebate/09-app/backend/src/secrets.ts');
  made.app.secrets = secretsFromEnvironment(env, TEST_DEPLOY_KEYS);
  const loaded = TEST_DEPLOY_KEYS.filter((k) => (env[k] ?? '').trim() !== '');
  return { password_changed: true, keys_loaded: loaded, why: `every login now uses the test password; keys read: ${loaded.join(', ') || 'none'}` };
}

/**
 * PHASE 151e (line 4): the database this deployment uses. A lasting one only when its address, its token AND the test
 * password are all set: a database that outlives the instance must never sit behind the seed password, which was
 * public until line 2. Anything less is memory, as before. It says what it chose - never the address and never the token.
 */
export const LASTING_DATABASE_KEYS = Object.freeze(['CAPREBATE_DB_URL', 'CAPREBATE_DB_TOKEN']);
/** The names Vercel's Turso integration gives the same two settings (docs.turso.tech/integrations/vercel, 27 Sep 2026). Ours win. */
export const TURSO_INTEGRATION_KEYS = Object.freeze(['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']);

export function lastingDatabase(env) {
  const pick = (ours, theirs) => ((env[ours] ?? '').trim() || (env[theirs] ?? '').trim());
  const url = pick('CAPREBATE_DB_URL', 'TURSO_DATABASE_URL');
  const token = pick('CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN');
  const pw = (env.CAPREBATE_TEST_PASSWORD ?? '').trim();
  if (url === '' && token === '') return { location: ':memory:', why: 'no lasting database is set, so the records are kept in memory' };
  if (url === '' || token === '') return { location: ':memory:', why: 'a lasting database needs both its address and its token, so the records are kept in memory' };
  if (pw.length < 12) return { location: ':memory:', why: 'a lasting database is used only behind the test password, so the records are kept in memory' };
  if (!/^(libsql|https):\/\//.test(url)) return { location: ':memory:', why: 'the lasting database address must start libsql:// or https://, so the records are kept in memory' };
  return { location: url, authToken: token, why: 'the records are kept in the lasting database' };
}

/**
 * PHASE 151e (line 7), 28 September 2026: THE TEST WEBSITE NEVER GOES DOWN FOR ITS DATABASE. Open the lasting database
 * when it is set; if it cannot be opened, or holds a seed that never finished (a first start cut off by the time
 * limit), use memory as before, and say why - never the address and never the token (only an error's code or name).
 * `waitMs` is how long a copy waits for another copy that is seeding the same empty database at the same moment.
 */
export async function openLasting(createApp, seed, lasting, opts, waitMs = 10_000) {
  const memory = async (why) => {
    const made = await createApp(':memory:', opts);
    await seedOnce(made, seed);
    return { made, lasting: false, why };
  };
  if (lasting.authToken === undefined) return memory(lasting.why);
  const reason = (e) => String(e?.code ?? e?.name ?? 'an error');
  let made;
  try {
    made = await createApp(lasting.location, { ...opts, dbAuthToken: lasting.authToken });
  } catch (e) {
    return memory(`the lasting database could not be opened (${reason(e)}), so the records are kept in memory`);
  }
  try {
    let s = await seedOnce(made, seed);
    for (let waited = 0; !s.complete && waited < waitMs; waited += 1000) {
      await new Promise((r) => setTimeout(r, 1000));
      s = await seedOnce(made, seed);
    }
    if (s.complete) return { made, lasting: true, why: `${lasting.why}${s.seeded ? ' (seeded now, on its first start)' : ''}` };
    made.close();
    return memory('the lasting database holds a seed that never finished: empty it in Turso and redeploy. Until then the records are kept in memory');
  } catch (e) {
    try { made.close(); } catch { /* already gone */ }
    return memory(`the lasting database could not be seeded (${reason(e)}), so the records are kept in memory`);
  }
}

/**
 * The seed and the view-only login, ONLY on an empty database: on a lasting one the second cold start finds them there.
 * Two copies starting at once on an empty database can both try; the one that loses finds the seed there and goes on.
 * `complete` says the seed FINISHED: the view-only login is written last, so a database with users and without it holds
 * a seed that was cut off part way, and nothing here tries to finish it (half a seed run twice is worse than none).
 */
export async function seedOnce(made, seed) {
  const count = () => Number(made.app.db.get('SELECT COUNT(*) AS n FROM users')?.n ?? 0);
  const complete = () => made.app.db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") !== undefined;
  if (count() > 0) return { seeded: false, complete: complete() };
  try {
    const r = await seed(made.app.db, made.app.hasher, made.app.now);
    // PHASE 136: the view-only login, as tools/demo-server.ts adds it — here and in the demo only, never in src/seed.ts.
    const t = made.app.now();
    made.app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-demo-readonly', 'readonly@example.invalid', 'readonly@example.invalid', 'View-only Person', 'READ_ONLY', await made.app.hasher.hash(r.password), t, t],
    );
    return { seeded: true, complete: true };
  } catch (e) {
    if (made.app.db.kind !== 'memory' && count() > 0) return { seeded: false, complete: complete() };
    throw e;
  }
}

export default async function handler(req, res) {
  // A copy whose start failed (a lasting database that could not be reached, say) tries again on the next request.
  ready ??= build().catch((e) => { ready = undefined; throw e; });
  const listener = await ready;
  return listener(req, res);
}
