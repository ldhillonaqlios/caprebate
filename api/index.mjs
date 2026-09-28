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
 * PHASE 151i, 28 September 2026: ONE PRIVATE DOCUMENT STORE FOR EVERY COPY, SWITCHED OFF UNTIL LAKHBIR CONNECTS ONE.
 * With the lasting database IN USE (not merely set: a copy that fell back to memory keeps the folder) AND a private
 * Vercel Blob store connected (BLOB_STORE_ID, which Vercel adds with its OIDC token, or a read-write token:
 * CAPREBATE_BLOB_TOKEN, else BLOB_READ_WRITE_TOKEN), uploaded documents go to that store (sharedDocumentStore,
 * src/web/shared-objectstore.ts). Anything less keeps a folder on this copy's temporary disk, as before.
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
  const lasting = lastingDatabase(process.env);
  const docs = sharedDocumentStore(process.env, lasting);
  const opened = await openLasting(createApp, seed, lasting, {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-vercel-')),
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
  }, 10_000, await sharedDocumentOptions(docs, lasting));
  const made = opened.made;
  console.log(`test deployment: ${opened.why}`);
  console.log(`test deployment: ${documentsWhy(docs, opened.lasting)}`);
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
 * PHASE 151i, 28 September 2026: WHERE UPLOADED DOCUMENTS GO. A shared store only beside a lasting database: a store
 * that outlives a copy must never sit behind the public seed password, and documents in a lasting store whose rows
 * died with a copy's memory would be orphans nobody could find or delete. So, like lastingDatabase, it needs its own
 * setting AND the lasting database's three. It says what it chose - never a token and never the store's id.
 *   BLOB_STORE_ID                              a store connected to the project; the SDK signs in with Vercel's OIDC
 *   CAPREBATE_BLOB_TOKEN, else BLOB_READ_WRITE_TOKEN   a read-write token (outside Vercel, or a store not connected)
 */
export const SHARED_DOCUMENT_KEYS = Object.freeze(['CAPREBATE_BLOB_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID']);

export function sharedDocumentStore(env, lasting) {
  const token = (env.CAPREBATE_BLOB_TOKEN ?? '').trim() || (env.BLOB_READ_WRITE_TOKEN ?? '').trim();
  const storeId = (env.BLOB_STORE_ID ?? '').trim();
  const folder = (why) => ({ shared: false, why: `${why}, so uploaded documents stay on this copy's temporary disk` });
  if (token === '' && storeId === '') return folder('no document store is set');
  if (lasting.authToken === undefined) return folder('a document store is used only beside the lasting database');
  return token === ''
    ? { shared: true, why: 'uploaded documents are kept in the private document store, signed in by Vercel' }
    : { shared: true, token, why: 'uploaded documents are kept in the private document store, signed in by its token' };
}

/** The createApp options for the shared store, or none. @vercel/blob is loaded only here, only when it is used. */
export async function sharedDocumentOptions(docs, lasting, sdk) {
  if (!docs.shared || lasting.authToken === undefined) return {};
  const { vercelBlobClient, uploadLinkSecret } = await import('../Caprebate/09-app/backend/src/web/shared-objectstore.ts');
  const client = await vercelBlobClient(docs.token === undefined ? {} : { token: docs.token }, sdk);
  return { sharedDocuments: { client, linkSecret: uploadLinkSecret(lasting.authToken) } };
}

/** What the log says about documents: the store only when the lasting database actually opened. */
export function documentsWhy(docs, lastingInUse) {
  if (docs.shared && !lastingInUse) return 'the lasting database is not in use, so uploaded documents stay on this copy\'s temporary disk';
  return docs.why;
}

/**
 * PHASE 151e (line 7), 28 September 2026: THE TEST WEBSITE NEVER GOES DOWN FOR ITS DATABASE. Open the lasting database
 * when it is set; if it cannot be opened, or holds a seed that never finished (a first start cut off by the time
 * limit), use memory as before, and say why - never the address and never the token (only an error's code or name).
 * `waitMs` is how long a copy waits for another copy that is seeding the same empty database at the same moment.
 */
export async function openLasting(createApp, seed, lasting, opts, waitMs = 10_000, lastingOnly = {}) {
  const memory = async (why) => {
    const made = await createApp(':memory:', opts);
    await seedOnce(made, seed);
    return { made, lasting: false, why };
  };
  if (lasting.authToken === undefined) return memory(lasting.why);
  const reason = (e) => openFailure(e, lasting);
  let made;
  try {
    // PHASE 151i: `lastingOnly` (the shared document store) goes with the lasting database and never with memory.
    made = await createApp(lasting.location, { ...opts, ...lastingOnly, dbAuthToken: lasting.authToken });
  } catch (e) {
    // PHASE 151i follow-up 3: a first start cut off while it built the tables leaves one table made and not recorded,
    // and every later start stops on it. Say what to do, not only what broke.
    const halfBuilt = /already exists|duplicate column/i.test(String(e?.message ?? '')) ? HALF_BUILT_WORDS : '';
    return memory(`the lasting database could not be opened (${reason(e)})${halfBuilt}, so the records are kept in memory`);
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
 * PHASE 151i follow-up, 28 September 2026: WHY THE LASTING DATABASE WOULD NOT OPEN, IN WORDS A PERSON CAN ACT ON.
 * Line 7 printed only an error's code or name. The libsql library's errors carry an EMPTY code and put everything in
 * the message ("Hrana(Http(\"error trying to connect: ...\"))"), so the live website's first real attempt on Turso
 * logged "could not be opened ()". Now the code (or name) and the library's own words are printed, AFTER every copy
 * of the address, its host name and the token is cut out, and anything else shaped like a token or an address.
 * Never more than 200 characters of it.
 */
/** PHASE 151i follow-up 3: what to do when a first start was cut off while it built the tables (seen 28 Sep 2026). */
export const HALF_BUILT_WORDS = ': the tables were left part built - empty the database in Turso and redeploy';

export function openFailure(e, lasting) {
  const code = String(e?.code ?? '').trim() || String(e?.name ?? '').trim() || 'an error';
  let words = String(e?.message ?? '');
  const hidden = [lasting?.authToken, lasting?.location];
  try { hidden.push(new URL(String(lasting?.location ?? '')).host); } catch { /* not an address: nothing more to hide */ }
  for (const h of hidden) if (typeof h === 'string' && h.trim().length >= 4) words = words.split(h.trim()).join('[hidden]');
  words = words
    .replace(/eyJ[\w-]+(?:\.[\w-]+){1,2}/g, '[hidden]')           // a JSON web token, which is what Turso's tokens are
    .replace(/\b(?:libsql|https?|wss?):\/\/[^\s"')]+/gi, '[address]')
    .replace(/[\w-]+\.turso\.io\b/gi, '[address]')
    .replace(/\s+/g, ' ').trim()
    .slice(0, 200);
  return words === '' || words === code ? code : `${code}: ${words}`;
}

/**
 * PHASE 151i follow-up 4, 28 September 2026: THE LASTING DATABASE IS BUILT ONCE, WHILE VERCEL BUILDS THE DEPLOY.
 * On the live website, 11:46 and 11:50: two copies started within a second of each other on the same empty Turso
 * database, and both ran the migrations and the seed. One added a column the other then added again ("duplicate column
 * name: legal_name"); the seed was left part done. So the tables and the seed are made by ONE process, the deploy's
 * build (vercel.json's buildCommand runs Caprebate/09-app/backend/tools/prepare-lasting.mjs), before any copy starts.
 * The copies then find the database finished, and their own migrate and seedOnce do nothing.
 * IT NEVER STOPS A DEPLOY: whatever happens it says why (never the address or the token), and a copy that then finds the
 * database unfinished runs on memory, as before.
 */
export async function prepareLasting(createApp, seed, lasting, opts = {}) {
  if (lasting.authToken === undefined) return { prepared: false, why: `nothing to prepare, because ${lasting.why}` };
  let made;
  try {
    made = await createApp(lasting.location, { ...opts, dbAuthToken: lasting.authToken });
  } catch (e) {
    const halfBuilt = /already exists|duplicate column/i.test(String(e?.message ?? '')) ? HALF_BUILT_WORDS : '';
    return { prepared: false, why: `the lasting database could not be built (${openFailure(e, lasting)})${halfBuilt}` };
  }
  try {
    const s = await seedOnce(made, seed);
    if (!s.complete) return { prepared: false, why: 'the lasting database holds a seed that never finished: empty it in Turso and redeploy' };
    return { prepared: true, why: s.seeded ? 'the lasting database is built and seeded (its first time)' : 'the lasting database was already built; its tables are up to date' };
  } catch (e) {
    return { prepared: false, why: `the lasting database could not be seeded (${openFailure(e, lasting)})` };
  } finally {
    try { made.close(); } catch { /* already gone */ }
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
