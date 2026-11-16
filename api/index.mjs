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
 * three, nothing changes, and the identity panel says the records are kept in memory (src/modules/compliance/identity-checks.ts).
 *
 * PHASE 151i, 28 September 2026: ONE PRIVATE DOCUMENT STORE FOR EVERY COPY, SWITCHED OFF UNTIL LAKHBIR CONNECTS ONE.
 * With the lasting database IN USE (not merely set: a copy that fell back to memory keeps the folder) AND a private
 * Vercel Blob store connected (BLOB_STORE_ID, which Vercel adds with its OIDC token, or a read-write token:
 * CAPREBATE_BLOB_TOKEN, else BLOB_READ_WRITE_TOKEN), uploaded documents go to that store (sharedDocumentStore,
 * src/web/shared-objectstore.ts). Anything less keeps a folder on this copy's temporary disk, as before.
 *
 * PHASE 161n1a, 16 November 2026 (ITRoadway's second review, H-01, M-07 and L-06): THE TEST WEBSITE LOCKED DOWN.
 *   - every staff login gives the second step, the invented ones included (TEST_WEBSITE_TWO_FACTOR = 'staff');
 *   - no shared password: the invented seed logins are locked at every start (lockSeedLogins) and cannot sign in;
 *     Lakhbir's own Admin login is made once with `node src/app/cli.ts first-admin`, and he makes one login per tester
 *     in Admin > Users. CAPREBATE_TEST_PASSWORD is read no more;
 *   - no real outside service: TEST_DEPLOY_KEYS holds only keys that reach no real person (the free registers, the
 *     authenticator seal, the contact form's check). Email, Didit, WhatsApp, Zoom, Homedata and the mailbox reader are
 *     never read here (TEST_WEBSITE_REFUSED_KEYS); a start that finds one set says its NAME, so it can be deleted;
 *   - every email stays in the outbox, never sent, and Admin reads it at /staff/dev-outbox (devOutbox), never a log.
 *
 * The code runs as TypeScript directly, as it does everywhere else (Node 24 strips the types).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let ready;

async function build() {
  const started = Date.now(); // PHASE 152: how long this copy took to start, printed below
  // PHASE 160e, 19 October 2026: behind Vercel, the visitor's address is the first in X-Forwarded-For, which Vercel
  // overwrites so a visitor cannot set it (vercel.com/docs/headers/request-headers). Without this, the address on a
  // signature was Vercel's own, and the sign-in limit per network address would count every visitor as one.
  process.env.CAPREBATE_TRUST_PROXY ??= '1';
  const { createApp } = await import('../Caprebate/09-app/backend/src/app/server.ts');
  const { seed } = await import('../Caprebate/09-app/backend/src/app/seed.ts');
  const host = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
  const publicOrigin = process.env.CAPREBATE_PUBLIC_ORIGIN ?? (host ? `https://${host}` : undefined);
  const since = new Date().toISOString();
  const lasting = lastingDatabase(process.env);
  const docs = sharedDocumentStore(process.env, lasting);
  const opened = await openLasting(createApp, seed, lasting, {
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-vercel-')),
    // PHASE 161n1a (H-01): every staff login gives the second step here, as on the live website. The exemption the
    // invented logins had from 29 Sep 2026 is gone from the code (src/core/auth.ts).
    twoFactor: TEST_WEBSITE_TWO_FACTOR,
    // PHASE 161n1a (L-06): the emails the test website saves are read by Admin at /staff/dev-outbox, never in a log.
    // This file and the demo only; the live website refuses it (src/app/server.ts, devOutbox).
    devOutbox: true,
    // 4 OCTOBER 2026 (Phase 153c, Word question 219): uploads are kept on the test website only - invented files - for
    // 7 years, sealed with CAPREBATE_ORIGINALS_KEY from its settings; without the key nothing is kept. Never the default.
    keepOriginals: (await import('../Caprebate/09-app/backend/src/shared/originals.ts')).KEEP_ORIGINALS_TEST_WEBSITE,
    // 4 OCTOBER 2026 (Phase 153d, Word questions 33, 34 and 196): the portal shows the TEST-ONLY engagement letter, its
    // clauses 5, 7(d) and 13 filled with test defaults, not agreed. It is never signed. This file only - never the default.
    testLetter: true,
    // 6 OCTOBER 2026 (Lakhbir: "switch this on for test purposes at the moment"): signing ON FOR TESTING - invented
    // clients sign the TEST COPY of the letter end to end. The real letter is never signable under it. This file only.
    testSigning: true,
    // 20 OCTOBER 2026 (Phase 160f; Lakhbir: "Build and publish on test"): the public notices page, a draft with its
    // proposed facts marked, and its complaint form. This file only - never the default.
    testNotices: true,
    // 4 NOVEMBER 2026 (Phase 161b, the ITRoadway audit): the form tokens are on, in so many words (src/web/form-token.ts).
    formTokens: 'on',
    ...(publicOrigin === undefined ? {} : { publicOrigin }),
  }, 10_000, await sharedDocumentOptions(docs, lasting));
  const made = opened.made;
  console.log(`test deployment: ${opened.why}`);
  // 29 SEPTEMBER 2026: the same reason, on the page that says the records are in memory - so nobody has to read the log.
  if (!opened.lasting) made.app.storageWhy = opened.why;
  console.log(`test deployment: ${documentsWhy(docs, opened.lasting)}`);
  // PHASE 161n1a: the invented logins locked, and only the keys that reach no real person read (names only in the log).
  const t161 = await configureTestDeploy(made, process.env);
  console.log(`test deployment: ${t161.why}`);
  if (t161.refused_set.length > 0) console.log(`test deployment: set in this project's settings and NOT read (delete them): ${t161.refused_set.join(', ')}`);
  // 29 SEPTEMBER 2026: whether the contact form's security check is checked on the server, and if not why (names only).
  const { turnstileWhy } = await import('../Caprebate/09-app/backend/src/integrations/connectors/turnstile.ts');
  console.log(`test deployment: ${turnstileWhy(made.app.secrets)}`);
  // 30 SEPTEMBER 2026: whether video calls get a Zoom meeting, and if not why (names only).
  const { zoomWhy } = await import('../Caprebate/09-app/backend/src/integrations/connectors/zoom.ts');
  console.log(`test deployment: ${zoomWhy(made.app.secrets)}`);
  const { whatsappWhy } = await import('../Caprebate/09-app/backend/src/integrations/connectors/whatsapp.ts');
  console.log(`test deployment: ${whatsappWhy(made.app.secrets)}`);
  // 4 OCTOBER 2026 (Phase 153c): whether uploaded files are kept, and if not why (the key's name only, never its value).
  const { sealKeyFromEnv } = await import('../Caprebate/09-app/backend/src/shared/originals.ts');
  console.log(`test deployment: uploaded files ${sealKeyFromEnv() === null ? 'are NOT kept - CAPREBATE_ORIGINALS_KEY is not set in the settings' : 'are kept for 7 years, sealed'}`);
  // PHASE 154a1 (line 10), 4 October 2026: the function log is no place for an email. (Since Phase 161n1a no email is
  // sent from here at all: the sending login is never read, so every email stays in the outbox.) This used to print every new outbox email - address, subject
  // and body, sign-up links included - against the spec's "no personal data in logs". It now says how many, of which
  // kinds, and how many were sent: never an address, a subject or a body.
  const shown = new Set();
  setInterval(() => {
    // Only what this copy's life has put there: on a lasting database, the older messages were counted before.
    const fresh = [];
    for (const m of made.app.db.all('SELECT id, kind, sent_at FROM outbox WHERE created_at >= ? ORDER BY created_at', [since])) {
      if (shown.has(m.id)) continue;
      shown.add(m.id);
      fresh.push({ kind: m.kind, sent: m.sent_at !== null });
    }
    const line = outboxLogLine(fresh);
    if (line !== null) console.log(line);
  }, 5000).unref();
  // PHASE 152 (the sweep, 28 September 2026): the first request after a deploy answered 504 twice on 28 September, when a
  // copy still built the lasting database itself under a 30-second limit. Since Phase 151i follow-ups 3 to 5 the deploy's
  // build does that and a copy only opens it (13 database calls, measured); on memory the whole start takes under a
  // second on the Mac. This line lets the function log say what a real start took, instead of anyone guessing.
  console.log(`test deployment: this copy started in ${Date.now() - started} ms`);
  return made.server.listeners('request')[0];
}

/** PHASE 154a1 (line 10): new outbox emails as one log line - counts and kinds only. Read by test/core/sweep-fixes.test.ts. */
export function outboxLogLine(rows) {
  if (rows.length === 0) return null;
  const kinds = new Map();
  for (const r of rows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  const sent = rows.filter((r) => r.sent).length;
  const list = [...kinds].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => `${k} ${n}`).join(', ');
  return `test deployment: ${rows.length} new email${rows.length === 1 ? '' : 's'} in the outbox - ${list}; ${sent} sent, ${rows.length - sent} not sent`;
}

/** Who gives a second step on the test website: every staff login (Phase 161n1a, H-01). Read by test/core/invented-logins.test.ts. */
export const TEST_WEBSITE_TWO_FACTOR = 'staff';

/**
 * PHASE 161n1a (H-01 and M-07): THE ONLY KEYS THE TEST WEBSITE READS, each one that reaches no real person. A key is read
 * when it is set in the project's settings AND its name is here. Nothing else in the settings is read.
 *   CAPREBATE_MFA_KEY                     seals each tester's authenticator app secret (src/core/mfa-seal.ts)
 *   COMPANIES_HOUSE_API_KEY, EPC_API_TOKEN, CQC_SUBSCRIPTION_KEY, OS_DATA_HUB_API_KEY
 *                                         the free public registers, looked up for the invented clients
 *   TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY   the public contact form's check against robots (Cloudflare)
 */
export const TEST_DEPLOY_KEYS = Object.freeze(['CAPREBATE_MFA_KEY', 'COMPANIES_HOUSE_API_KEY', 'EPC_API_TOKEN', 'CQC_SUBSCRIPTION_KEY',
  'OS_DATA_HUB_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']);

/**
 * PHASE 161n1a (H-01 and M-07): NEVER READ ON THE TEST WEBSITE, whatever its settings hold. Each one reaches a real
 * person or spends money: email from contact@caprebate.co.uk and the mailbox it reads, Didit's identity checks, WhatsApp,
 * Zoom, Homedata's paid lookups and the outside timer that wakes the mailbox reader. A start that finds one set prints
 * its NAME (never its value) so it is deleted from the test project, and Lakhbir changes it at its provider.
 */
export const TEST_WEBSITE_REFUSED_KEYS = Object.freeze([
  'IONOS_SMTP_HOST', 'IONOS_SMTP_PORT', 'IONOS_SMTP_USER', 'IONOS_SMTP_PASSWORD',
  'IONOS_IMAP_HOST', 'IONOS_IMAP_PORT', 'IONOS_IMAP_USER', 'IONOS_IMAP_PASSWORD',
  'DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID',
  'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_OPENING_TEMPLATE', 'WHATSAPP_TEMPLATE_LANGUAGE',
  'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_SDK_CLIENT_ID', 'ZOOM_SDK_CLIENT_SECRET', 'ZOOM_HOST_EMAIL', 'ZOOM_PLAN',
  'HOMEDATA_API_KEY', 'REPLY_TIMER_TOKEN',
  // Read no more since Phase 161n1a: it was the one password every invented login shared.
  'CAPREBATE_TEST_PASSWORD']);

/**
 * PHASE 161n1a (H-01): THE INVENTED SEED LOGINS CANNOT SIGN IN ON THE TEST WEBSITE. Every login at the reserved domain
 * example.invalid that is not yet locked is locked (disabled_at), and its sessions end; a locked login is refused at the
 * password, at a session and at a reset link (src/core/auth.ts). The invented clients and their claims stay, to test
 * with. Run at every start and after the build's seed, so no copy ever serves an open one. Returns how many it locked.
 */
export function lockSeedLogins(db, now) {
  const t = now();
  const open = db.all("SELECT id FROM users WHERE disabled_at IS NULL AND email_canonical LIKE '%@example.invalid'");
  for (const u of open) {
    db.run('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?', [t, t, u.id]);
    db.run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [t, u.id]);
  }
  return open.length;
}

/**
 * PHASE 161n1a: THE TEST WEBSITE'S START. The invented logins locked (and written to the audit log when any were), and
 * the keys in TEST_DEPLOY_KEYS read from the settings, those names and no other. It says what it did - never a key.
 * `refused_set` names the settings found that are never read here, for Lakhbir to delete.
 */
export async function configureTestDeploy(made, env) {
  const locked = lockSeedLogins(made.app.db, made.app.now);
  if (locked > 0) {
    made.app.audit.append({ at: made.app.now(), kind: 'SEED_LOGINS_LOCKED', outcome: 'ALLOWED', object_type: 'user', object_id: 'example.invalid',
      detail: { locked, why: 'the test website: the invented logins cannot sign in (Phase 161n1a, H-01)' } });
  }
  const { secretsFromEnvironment, useProcessSecrets } = await import('../Caprebate/09-app/backend/src/core/secrets.ts');
  made.app.secrets = secretsFromEnvironment(env, TEST_DEPLOY_KEYS);
  // Every screen that asks the process for a key reads these same settings, and so finds no email login.
  useProcessSecrets(made.app.secrets);
  const set = (k) => (env[k] ?? '').trim() !== '';
  const loaded = TEST_DEPLOY_KEYS.filter(set);
  const refusedSet = TEST_WEBSITE_REFUSED_KEYS.filter(set);
  const people = made.app.db.get("SELECT COUNT(*) AS n FROM users WHERE disabled_at IS NULL")?.n ?? 0;
  return {
    seed_logins_locked: locked, keys_loaded: loaded, refused_set: refusedSet,
    why: `the invented logins cannot sign in${locked > 0 ? ` (${locked} locked now)` : ''}; ${people} login${Number(people) === 1 ? '' : 's'} can; keys read: ${loaded.join(', ') || 'none'}; no email is sent, every one stays in the outbox (Admin: /staff/dev-outbox)`,
  };
}

/**
 * PHASE 151e (line 4): the database this deployment uses. A lasting one when its address and its token are both set;
 * anything less is memory, as before. It says what it chose - never the address and never the token. (Until Phase
 * 161n1a it also needed the test password, so a lasting database never sat behind the public seed password; since then
 * the seed logins cannot sign in at all, lockSeedLogins, so the test password is read no more.)
 */
export const LASTING_DATABASE_KEYS = Object.freeze(['CAPREBATE_DB_URL', 'CAPREBATE_DB_TOKEN']);
/** The names Vercel's Turso integration gives the same two settings (docs.turso.tech/integrations/vercel, 27 Sep 2026). Ours win. */
export const TURSO_INTEGRATION_KEYS = Object.freeze(['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN']);

export function lastingDatabase(env) {
  const pick = (ours, theirs) => ((env[ours] ?? '').trim() || (env[theirs] ?? '').trim());
  const url = pick('CAPREBATE_DB_URL', 'TURSO_DATABASE_URL');
  const token = pick('CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN');
  if (url === '' && token === '') return { location: ':memory:', why: 'no lasting database is set, so the records are kept in memory' };
  if (url === '' || token === '') return { location: ':memory:', why: 'a lasting database needs both its address and its token, so the records are kept in memory' };
  if (!/^(libsql|https):\/\//.test(url)) return { location: ':memory:', why: 'the lasting database address must start libsql:// or https://, so the records are kept in memory' };
  // FASTER CLICKS, part 2 (3 October 2026): CAPREBATE_DB_LOCAL_COPY=on keeps a copy of it next to each copy of the website.
  const localCopy = (env.CAPREBATE_DB_LOCAL_COPY ?? '').trim().toLowerCase() === 'on';
  return { location: url, authToken: token, localCopy, why: 'the records are kept in the lasting database' };
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

/**
 * The createApp options for the shared store, or none. @vercel/blob is loaded only here, only when it is used.
 * PHASE 161a, 4 November 2026 (the ITRoadway audit): @vercel/blob is an OPTIONAL package, so a live install
 * (npm ci --omit=dev --omit=optional) leaves it out. If a store is set but the package is not installed, the
 * documents stay on this copy's temporary disk, as with no store, and the log says why (`docs` is changed to say
 * so). Any other fault still stops the start. `makeClient` is for the tests.
 */
export async function sharedDocumentOptions(docs, lasting, sdk, makeClient) {
  if (!docs.shared || lasting.authToken === undefined) return {};
  const { vercelBlobClient, uploadLinkSecret } = await import('../Caprebate/09-app/backend/src/shared/shared-objectstore.ts');
  let client;
  try {
    client = await (makeClient ?? vercelBlobClient)(docs.token === undefined ? {} : { token: docs.token }, sdk);
  } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !String(e?.message).includes('@vercel/blob')) throw e;
    docs.shared = false;
    delete docs.token;
    docs.why = 'a document store is set but its package (@vercel/blob) is not installed, so uploaded documents stay on this copy\'s temporary disk';
    return {};
  }
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
  void waitMs; // PHASE 151i follow-up 5: a copy no longer waits for another copy's seed - it never seeds a lasting database
  const memory = async (why) => {
    const made = await createApp(':memory:', opts);
    await seedOnce(made, seed);
    return { made, lasting: false, why };
  };
  if (lasting.authToken === undefined) return memory(lasting.why);
  const reason = (e) => openFailure(e, lasting);
  let made;
  let copyWhy = '';
  try {
    // PHASE 151i: `lastingOnly` (the shared document store) goes with the lasting database and never with memory.
    // PHASE 151i follow-up 5: 'require-built' - a copy builds no table; the deploy's build step does (prepareLasting).
    const remote = { ...opts, ...lastingOnly, dbAuthToken: lasting.authToken, schema: 'require-built' };
    // FASTER CLICKS, part 2: with the setting on, first with a local copy of the database; if that cannot open, the
    // lasting database as before, and the log says why.
    if (lasting.localCopy === true) {
      try {
        made = await createApp(lasting.location, { ...remote, dbLocalCopy: join(mkdtempSync(join(tmpdir(), 'cb-copy-')), 'copy.db') });
        copyWhy = ', with a copy of it kept next to this copy of the website';
      } catch (e) {
        copyWhy = `; its local copy could not be opened (${reason(e)}), so every query goes to it`;
      }
    }
    made ??= await createApp(lasting.location, remote);
  } catch (e) {
    if (e?.code === 'E_NOT_BUILT') return memory(`${NOT_BUILT_WORDS} (${String(e.message)}). Until then the records are kept in memory`);
    // PHASE 151i follow-up 3: say what to do, not only what broke.
    const halfBuilt = /already exists|duplicate column/i.test(String(e?.message ?? '')) ? HALF_BUILT_WORDS : '';
    return memory(`the lasting database could not be opened (${reason(e)})${halfBuilt}, so the records are kept in memory`);
  }
  // PHASE 151i follow-up 5: a copy NEVER seeds a lasting database. Two copies seeding one empty database at once each
  // fail on the other's rows and both give up, which left it half seeded on 28 Sep 2026. It only reads where it stands.
  const state = seedState(made);
  if (state === 'complete') return { made, lasting: true, why: `${lasting.why}${copyWhy}` };
  made.close();
  return memory(state === 'empty'
    ? `${NOT_BUILT_WORDS} (its tables are there and its invented records are not). Until then the records are kept in memory`
    : `the lasting database holds a seed that never finished${HALF_BUILT_WORDS}. Until then the records are kept in memory`);
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
export const HALF_BUILT_WORDS = ': the tables were left part built - redeploy, and the build empties the database and builds it again';
/** PHASE 151i follow-up 5: a copy found the lasting database not built, which only the deploy's build step does. */
export const NOT_BUILT_WORDS = 'the lasting database is not built yet: redeploy, and the build builds it';

/** Where a database's invented seed stands, read only: 'empty', 'complete' (the view-only login is written last), or 'part'. */
export function seedState(made) {
  const n = Number(made.app.db.get('SELECT COUNT(*) AS n FROM users')?.n ?? 0);
  if (n === 0) return 'empty';
  return made.app.db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") !== undefined ? 'complete' : 'part';
}

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
export async function prepareLasting(createApp, seed, lasting, opts = {}, openDb = undefined) {
  if (lasting.authToken === undefined) return { prepared: false, why: `nothing to prepare, because ${lasting.why}` };
  // PHASE 151i follow-up 5 (Lakhbir, 28 Sep 2026: "build step empties it"): a database left HALF BUILT - its tables part
  // made, or its invented seed part written - is emptied and built again, once. No copy has ever run on a half-built
  // database (each refuses it and uses memory), so nothing anybody typed is in it. A finished one is never emptied.
  let emptied = false;
  for (let round = 1; round <= 2; round++) {
    let made;
    try {
      made = await createApp(lasting.location, { ...opts, dbAuthToken: lasting.authToken });
    } catch (e) {
      if (round === 1 && /already exists|duplicate column/i.test(String(e?.message ?? ''))) {
        const r = await emptyLasting(lasting, openDb);
        if (r.emptied) { emptied = true; continue; }
        return { prepared: false, why: `the lasting database could not be built (${openFailure(e, lasting)}), and it was not emptied: ${r.why}` };
      }
      return { prepared: false, why: `the lasting database could not be built (${openFailure(e, lasting)})` };
    }
    let s;
    try {
      s = await seedOnce(made, seed);
      // PHASE 161n1a: the invented logins are locked before any copy can serve them (every copy locks them again too).
      if (s.complete) lockSeedLogins(made.app.db, made.app.now);
    } catch (e) {
      s = { seeded: false, complete: false, error: e };
    } finally {
      try { made.close(); } catch { /* already gone */ }
    }
    if (s.complete) {
      const why = emptied ? 'the lasting database was left part built, so it was emptied, built and seeded'
        : s.seeded ? 'the lasting database is built and seeded (its first time)' : 'the lasting database was already built; its tables are up to date';
      return { prepared: true, why };
    }
    const why = s.error === undefined ? '' : ` (${openFailure(s.error, lasting)})`;
    if (round === 1) {
      const r = await emptyLasting(lasting, openDb);
      if (r.emptied) { emptied = true; continue; }
      return { prepared: false, why: `the lasting database holds a seed that never finished${why}, and it was not emptied: ${r.why}` };
    }
    return { prepared: false, why: `the lasting database was emptied and built again, and its seed still did not finish${why}` };
  }
  return { prepared: false, why: 'the lasting database could not be prepared' };
}

/**
 * PHASE 151i follow-up 5: EMPTY A HALF-BUILT TEST DATABASE - every view and table, in one batch with foreign keys off
 * (a table dropped with them on is deleted row by row first, and a child row would stop it). REFUSES a database whose
 * seed finished (its view-only login is there): that one may hold what people typed, and is never emptied here.
 */
export async function emptyLasting(lasting, openDb = undefined) {
  let db;
  try {
    // `openDb` is for the tests (a local file, never the network); absent, the lasting database itself.
    db = openDb === undefined
      ? new (await import('../Caprebate/09-app/backend/src/core/db.ts')).Db(lasting.location, { authToken: lasting.authToken })
      : openDb(lasting);
  } catch (e) {
    return { emptied: false, why: `it could not be opened (${openFailure(e, lasting)})` };
  }
  try {
    return emptyHalfBuilt(db);
  } catch (e) {
    return { emptied: false, why: `emptying it failed (${openFailure(e, lasting)})` };
  } finally {
    try { db.close(); } catch { /* already gone */ }
  }
}

export function emptyHalfBuilt(db) {
  const hasUsers = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'") !== undefined;
  if (hasUsers && db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") !== undefined) {
    return { emptied: false, why: 'its seed finished, so it may hold what people typed, and a finished database is never emptied' };
  }
  const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
  for (let pass = 0; pass < 3; pass++) {
    const objs = db.all("SELECT type, name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'");
    if (objs.length === 0) break;
    const drops = [...objs.filter((o) => o.type === 'view').map((o) => `DROP VIEW IF EXISTS ${q(o.name)};`),
      ...objs.filter((o) => o.type === 'table').map((o) => `DROP TABLE IF EXISTS ${q(o.name)};`)];
    db.execDdl(`PRAGMA foreign_keys = OFF;\n${drops.join('\n')}\nPRAGMA foreign_keys = ON;`);
  }
  const left = db.all("SELECT name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'");
  if (left.length > 0) return { emptied: false, why: `${left.length} tables could not be dropped` };
  if (db.get("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'") !== undefined) db.run('DELETE FROM sqlite_sequence');
  return { emptied: true, why: 'emptied' };
}

/**
 * PHASE 161n1a (M-07): EMPTY THE TEST WEBSITE'S DATABASE, for `node tools/test-website-people.ts --delete --yes` only,
 * on Lakhbir's yes. Every view and table goes (and the triggers with them), as emptyHalfBuilt does, but only a database
 * that holds the test website's FINISHED invented seed: that is the proof it is the test database, because the live
 * website refuses to run on one (src/app/live-website.ts, holdsInventedSeed). Anything else is refused and left alone.
 */
export function emptyTestDatabase(db) {
  const hasUsers = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'") !== undefined;
  if (!hasUsers || db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") === undefined) {
    return { emptied: false, why: 'it does not hold the test website\'s invented seed, so it is not the test database, and it was left alone' };
  }
  const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
  for (let pass = 0; pass < 3; pass++) {
    const objs = db.all("SELECT type, name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'");
    if (objs.length === 0) break;
    const drops = [...objs.filter((o) => o.type === 'view').map((o) => `DROP VIEW IF EXISTS ${q(o.name)};`),
      ...objs.filter((o) => o.type === 'table').map((o) => `DROP TABLE IF EXISTS ${q(o.name)};`)];
    db.execDdl(`PRAGMA foreign_keys = OFF;\n${drops.join('\n')}\nPRAGMA foreign_keys = ON;`);
  }
  const left = db.all("SELECT name FROM sqlite_master WHERE type IN ('view', 'table') AND name NOT LIKE 'sqlite_%'");
  if (left.length > 0) return { emptied: false, why: `${left.length} tables could not be dropped` };
  if (db.get("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'") !== undefined) db.run('DELETE FROM sqlite_sequence');
  return { emptied: true, why: 'emptied' };
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
    // PHASE 151i follow-up 5: the error goes back with the answer, so a seed that failed part way says why.
    if (made.app.db.kind !== 'memory' && count() > 0) return { seeded: false, complete: complete(), error: e };
    throw e;
  }
}

/**
 * PHASE 161h, 7 November 2026: THE LIVE WEBSITE STARTS FROM THIS SAME ENTRY, CHOSEN BY ITS OWN SETTINGS. With
 * CAPREBATE_PRODUCTION=1 (set in the live project, never in this test one) every request goes to the live website
 * (Caprebate/09-app/backend/src/live-website.ts): no seed, no demo logins, no test letter or signing, no notices banner,
 * no STAFF_EXCEPT_INVENTED, form tokens on, and never memory. Anything else: the test website, exactly as before.
 */
export function isLiveDeploy(env) {
  return (env.CAPREBATE_PRODUCTION ?? '').trim() === '1';
}

async function buildLive() {
  const started = Date.now();
  process.env.CAPREBATE_TRUST_PROXY ??= '1';
  const { startLiveWebsite } = await import('../Caprebate/09-app/backend/src/app/live-website.ts');
  const r = await startLiveWebsite(process.env);
  for (const line of r.lines) (r.started ? console.log : console.error)(line);
  if (r.started) console.log(`live website: this copy started in ${Date.now() - started} ms`);
  // A copy that could not start answers 503 to everything; the next copy Vercel starts tries again.
  return r.listener;
}

export default async function handler(req, res) {
  // A copy whose start failed (a lasting database that could not be reached, say) tries again on the next request.
  ready ??= (isLiveDeploy(process.env) ? buildLive() : build()).catch((e) => { ready = undefined; throw e; });
  const listener = await ready;
  return listener(req, res);
}
