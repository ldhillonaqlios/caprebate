/**
 * THE LIVE WEBSITE ON VERCEL — how it starts. Phase 161h, 7 November 2026 (Lakhbir, 6 Nov 2026: "lets keep it as
 * vercel"; the runbook is 09-app/deploy/LIVE-RUNBOOK.md).
 *
 * ONE ENTRY, TWO PROJECTS. Vercel runs api/index.mjs for both the test website (project caprebate-test) and the live one
 * (its own project). The entry decides from its OWN SETTINGS: CAPREBATE_PRODUCTION=1 starts the live website through this
 * file; anything else starts the test website exactly as before. The live project sets it; the test project never does.
 *
 * WHAT THE LIVE WEBSITE NEVER HAS (each is set in api/index.mjs for the test website only, and never here):
 *   no invented seed (and a database holding one is refused), no demo logins, no test password, no test letter, no test
 *   signing, no notices test banner, no STAFF_EXCEPT_INVENTED (every staff login gives a second step: the default), no
 *   memory database (a database that cannot be opened stops the website, it never falls back), and form tokens on.
 * A test-only setting found in the live project's settings stops the start, so one copied across by mistake is seen.
 *
 * THE KEYS are the project's encrypted settings (Vercel, "Sensitive"), read through secretsFromEnvironment with the live
 * list, LIVE_KEYS: every key in SECRET_KEYS that is not retired. A key for an outside service that is missing leaves that
 * service "not set up", as always (N4). A setting the website cannot run safely without, LIVE_REQUIRED, STOPS THE START
 * with a plain message naming it, never its value; every request then answers 503 "not available".
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SECRET_KEYS, secretsFromEnvironment, useProcessSecrets, isProduction } from './secrets.ts';
import { mfaKeyFrom } from './mfa-seal.ts';
import { referenceLocation } from './web/reference-db.ts';
import { CRON_SECRET_MIN_LENGTH } from './web/timers.ts';

export type Env = Readonly<Record<string, string | undefined>>;
type Listener = (req: IncomingMessage, res: ServerResponse) => void;

/** Every live key: the whole list, less the retired ones. The test website's own list (TEST_DEPLOY_KEYS) is not used. */
export const LIVE_KEYS: readonly string[] = Object.freeze(SECRET_KEYS.filter((k) => k.retired === undefined).map((k) => k.name));

/**
 * Settings that belong to the test website or to a computer, never to the live project. Found there, the start stops:
 * each one would switch on something the live website must not have.
 */
export const TEST_ONLY_SETTINGS: readonly string[] = Object.freeze([
  'CAPREBATE_TEST_PASSWORD', 'CAPREBATE_ALLOW_SEED', 'CAPREBATE_SIGNING_TEST', 'CAPREBATE_COST_MODEL_TEST', 'CAPREBATE_LIVE_SMOKE',
  'CAPREBATE_LOCAL_EMAIL', 'CAPREBATE_LOCAL_WHATSAPP', 'CAPREBATE_LOCAL_ZOOM', 'CAPREBATE_LOOKUPS_HERE', 'CAPREBATE_TEST_LOOKUP_LOG',
]);

/** What the live website cannot run safely without, each with what it is. Checked at every start. */
export const LIVE_REQUIRED: ReadonlyArray<{ readonly names: readonly string[]; readonly what: string }> = Object.freeze([
  { names: ['CAPREBATE_DB_URL', 'TURSO_DATABASE_URL'], what: 'the live database’s address' },
  { names: ['CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN'], what: 'the live database’s token' },
  { names: ['BLOB_STORE_ID', 'CAPREBATE_BLOB_TOKEN', 'BLOB_READ_WRITE_TOKEN'], what: 'the private document store (connect the London Blob store to the project)' },
  { names: ['CAPREBATE_MFA_KEY'], what: 'the key that seals each person’s authenticator app secret' },
  { names: ['CRON_SECRET'], what: 'the word the timers are called with' },
  { names: ['CAPREBATE_BACKUP_KEY'], what: 'the key every backup is locked with' },
  { names: ['CAPREBATE_PUBLIC_ORIGIN'], what: 'the website’s own address, https://caprebate.co.uk, for every link in an email' },
]);

const set = (env: Env, n: string): boolean => (env[n] ?? '').trim() !== '';

export type StartCheck = { readonly stop: boolean; readonly lines: readonly string[] };

/** Run before the live website starts. Names only, never a value. On a preview the address may be the preview's own. */
export function liveStartCheck(env: Env): StartCheck {
  const lines: string[] = [];
  const preview = env['VERCEL_ENV'] === 'preview';
  for (const r of LIVE_REQUIRED) {
    if (r.names.some((n) => set(env, n))) continue;
    if (preview && r.names[0] === 'CAPREBATE_PUBLIC_ORIGIN' && set(env, 'VERCEL_BRANCH_URL')) continue;
    lines.push(`${r.names.join(' or ')} is not set (${r.what}).`);
  }
  for (const n of TEST_ONLY_SETTINGS) if (set(env, n)) lines.push(`${n} is set. It belongs to the test website or a computer, never the live website: delete it from the live project.`);
  if (set(env, 'CAPREBATE_PUBLIC_ORIGIN') && !/^https:\/\/[^\s/]+$/.test((env['CAPREBATE_PUBLIC_ORIGIN'] ?? '').trim())) {
    lines.push('CAPREBATE_PUBLIC_ORIGIN must be the website’s address alone, starting https:// (for example https://caprebate.co.uk).');
  }
  if (set(env, 'CRON_SECRET') && (env['CRON_SECRET'] ?? '').trim().length < CRON_SECRET_MIN_LENGTH) lines.push(`CRON_SECRET is shorter than ${CRON_SECRET_MIN_LENGTH} characters.`);
  if (set(env, 'CAPREBATE_BACKUP_KEY') && Buffer.from((env['CAPREBATE_BACKUP_KEY'] ?? '').trim(), 'base64').length !== 32) lines.push('CAPREBATE_BACKUP_KEY is not 32 bytes written as base64 (openssl rand -base64 32).');
  if (set(env, 'CAPREBATE_MFA_KEY') && mfaKeyFrom(secretsFromEnvironment(env, ['CAPREBATE_MFA_KEY'])).state !== 'KEY') lines.push('CAPREBATE_MFA_KEY is not 32 bytes written as base64.');
  const ref = referenceLocation(env);
  if (set(env, 'CAPREBATE_REFERENCE_DB_URL') && ref.kind === 'none') lines.push(`The reference database is set but not usable: ${ref.why}.`);
  return lines.length === 0
    ? { stop: false, lines: [] }
    : { stop: true, lines: ['NOT STARTED: this is the live website (CAPREBATE_PRODUCTION=1), and its settings are not complete:', ...lines.map((l) => `  - ${l}`)] };
}

/** The live database's address and token, from the settings; ours win over the names Vercel's Turso integration gives. */
export function liveDatabase(env: Env): { location: string; authToken: string } {
  const pick = (a: string, b: string): string => (env[a] ?? '').trim() || (env[b] ?? '').trim();
  return { location: pick('CAPREBATE_DB_URL', 'TURSO_DATABASE_URL'), authToken: pick('CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN') };
}

/** A database the test website seeded holds invented people. The live website refuses to run on one. */
export function holdsInventedSeed(db: { get(sql: string, p?: readonly unknown[]): unknown }): boolean {
  return db.get("SELECT id FROM users WHERE id = 'u-demo-readonly' OR email_canonical LIKE '%@example.invalid' LIMIT 1") !== undefined;
}

/** Every request answered 503, with a plain page: what a live website that may not start shows. /api/health says so too. */
export function notAvailable(): Listener {
  return (req, res) => {
    const health = (req.url ?? '').split('?')[0] === '/api/health';
    res.writeHead(503, { 'content-type': health ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(health ? '{"ok":false}' : '<!doctype html><meta charset="utf-8"><title>Cap Rebate</title><p>This website is not available just now. Please try again later.</p>');
  };
}

export type LiveStart = { readonly listener: Listener; readonly lines: readonly string[]; readonly started: boolean };

type CreateApp = (location: string, opts: Record<string, unknown>) => Promise<{ server: { listeners(e: 'request'): unknown[] }; app: { db: { get(sql: string, p?: readonly unknown[]): unknown }; secrets: unknown }; close(): void }>;

/**
 * STARTS THE LIVE WEBSITE, or says why not. Never falls back to memory, and never seeds. `createApp` and `blobClient` are
 * for the tests; absent, the real ones. The lines carry names and reasons only.
 */
export async function startLiveWebsite(env: Env, deps: {
  createApp?: CreateApp;
  blobClient?: (auth: { token?: string }) => Promise<unknown>;
  legal?: (env: Env) => boolean;
} = {}): Promise<LiveStart> {
  if (!isProduction(env as Record<string, string | undefined>)) return { listener: notAvailable(), lines: ['NOT STARTED: CAPREBATE_PRODUCTION is not 1.'], started: false };
  const check = liveStartCheck(env);
  if (check.stop) return { listener: notAvailable(), lines: check.lines, started: false };
  const lines: string[] = [];
  const createApp = deps.createApp ?? ((await import('./server.ts')).createApp as unknown as CreateApp);
  const legalOn = (deps.legal ?? (await import('./server.ts')).legalPagesSetting as (e: Env) => boolean)(env);
  const { uploadLinkSecret, vercelBlobClient } = await import('./web/shared-objectstore.ts');
  const db = liveDatabase(env);
  const token = (env['CAPREBATE_BLOB_TOKEN'] ?? '').trim() || (env['BLOB_READ_WRITE_TOKEN'] ?? '').trim();
  let client: unknown;
  try {
    client = await (deps.blobClient ?? vercelBlobClient)(token === '' ? {} : { token });
  } catch (e) {
    return { listener: notAvailable(), lines: [`NOT STARTED: the document store could not be reached (${e instanceof Error ? e.name : 'an error'}).`], started: false };
  }
  const host = (env['VERCEL_BRANCH_URL'] ?? '').trim();
  const publicOrigin = (env['CAPREBATE_PUBLIC_ORIGIN'] ?? '').trim() || `https://${host}`;
  let made: Awaited<ReturnType<CreateApp>>;
  try {
    made = await createApp(db.location, {
      dbAuthToken: db.authToken,
      schema: 'require-built',
      documentRoot: mkdtempSync(join(tmpdir(), 'cb-live-')),
      sharedDocuments: { client, linkSecret: uploadLinkSecret(db.authToken) },
      formTokens: 'on',
      publicOrigin,
      ...(legalOn ? { legal: true } : {}),
    });
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    return { listener: notAvailable(), lines: [code === 'E_NOT_BUILT'
      ? 'NOT STARTED: the live database is not built. Its tables are made by the release’s build step (tools/prepare-lasting.mjs); release again.'
      : `NOT STARTED: the live database could not be opened (${e instanceof Error ? e.name : 'an error'}).`], started: false };
  }
  if (holdsInventedSeed(made.app.db)) {
    made.close();
    return { listener: notAvailable(), lines: ['NOT STARTED: the live database holds the test website’s invented people. The live website uses a database of its own.'], started: false };
  }
  const secrets = secretsFromEnvironment(env as Record<string, string | undefined>, LIVE_KEYS, 'keys read from the live website’s own settings');
  made.app.secrets = secrets;
  useProcessSecrets(secrets);
  const loaded = LIVE_KEYS.filter((k) => set(env, k));
  lines.push(`live website: started; keys read: ${loaded.join(', ') || 'none'}`);
  lines.push(`live website: legal pages ${legalOn ? 'on (each shows its Draft line until approved)' : 'off (CAPREBATE_LEGAL_PAGES is not on)'}`);
  lines.push(`live website: ${referenceLocation(env).why}`);
  return { listener: made.server.listeners('request')[0] as Listener, lines, started: true };
}

/**
 * THE RELEASE'S BUILD STEP FOR THE LIVE WEBSITE (tools/prepare-lasting.mjs calls it when CAPREBATE_PRODUCTION=1): the
 * migrations, once, by one process, before any copy starts. Never the seed. Unlike the test website's step, a failure
 * here FAILS THE RELEASE, so the website stays on the release before it.
 */
export async function prepareLiveDatabase(env: Env, createApp?: CreateApp): Promise<{ ok: boolean; why: string }> {
  const db = liveDatabase(env);
  if (db.location === '' || db.authToken === '') return { ok: false, why: 'the live database’s address or token is not set (CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN)' };
  const make = createApp ?? ((await import('./server.ts')).createApp as unknown as CreateApp);
  let made: Awaited<ReturnType<CreateApp>>;
  try {
    made = await make(db.location, { dbAuthToken: db.authToken, documentRoot: mkdtempSync(join(tmpdir(), 'cb-prepare-live-')) });
  } catch (e) {
    return { ok: false, why: `the live database could not be built (${e instanceof Error ? e.name : 'an error'})` };
  }
  try {
    if (holdsInventedSeed(made.app.db)) return { ok: false, why: 'the live database holds the test website’s invented people: it is not the live database' };
    return { ok: true, why: 'the live database’s tables are up to date (no seed: this is the live website)' };
  } finally {
    made.close();
  }
}
