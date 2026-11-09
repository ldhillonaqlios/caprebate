/**
 * THE KEY FILE — every supplier key this build can use, read from ONE file OUTSIDE the repository.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHERE THE KEYS LIVE, AND WHERE THEY NEVER DO
 *
 * The file named by CAPREBATE_SECRETS, or `~/.caprebate-secrets.env` when that is unset. One `NAME=value` a line; a
 * `#` line is a comment. `secrets.example.env` beside package.json lists every name, with no values.
 *
 * A FILE INSIDE THE REPOSITORY IS REFUSED, not read. The repository is the git working copy this file sits in (the
 * nearest folder above it holding `.git`), and the test is made on real paths, so a link from outside that points in
 * is refused too. A key that could be committed by `git add` is a key that one day will be. The .gitignore is an
 * allow-list and ignores `.env` and `.env.*` as well, but a second line of defence that depends on the first is not a
 * second line.
 *
 * NOTHING HERE THROWS. No file, an unreadable file and a refused file are each a STATE, reported in words, and every
 * connector then reads as NOT_CONFIGURED — which leaves its facts asked (N4). A missing key is never a screen error.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EACH KEY GOES ONLY TO THE CONNECTOR THAT OWNS IT
 *
 * `SECRET_KEYS` names the owner of every key. `forOwner('EPC')` hands back a reader that answers for the EPC token
 * and returns null for every other name, including a name that IS in the file. So a bug in one connector cannot
 * read another supplier's key, and a test proves it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO KEY IS EVER PRINTED
 *
 * The store prints as a list of NAMES — `String(store)`, `JSON.stringify(store)` and `util.inspect(store)` alike.
 * Every value loaded is registered with `redactSecrets`, which src/integrations/connectors/http.ts runs over every error before it
 * is kept, and src/core/audit.ts refuses any audit detail that carries one — the audit screen refuses rather than redacts,
 * which is its own rule. Nothing here writes to the console.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

/** Who a key belongs to: the connector that may read it. */
export type SecretOwner =
  | 'CLAUDE_DOCUMENTS' | 'COMPANIES_HOUSE' | 'CQC' | 'EPC' | 'HOMEDATA_ADDRESS' | 'HMLR_TITLE'
  | 'IONOS_EMAIL' | 'IONOS_MAILBOX' | 'GOOGLE_ANALYTICS' | 'DIDIT_IDV'
  /** Not a connector - the sign-in's own key, which seals each person's authenticator app secret. */
  | 'SIGN_IN'
  /** The contact form's security check (src/integrations/connectors/turnstile.ts). */
  | 'CLOUDFLARE_TURNSTILE'
  /** Video calls - a meeting made for each, and joined inside the back office (src/integrations/connectors/zoom.ts). */
  | 'ZOOM'
  /** WhatsApp with each client from the back office (src/integrations/connectors/whatsapp.ts). */
  | 'WHATSAPP'
  /** The building outlines for the report's site plan, from Ordnance Survey's free maps (src/integrations/connectors/os-buildings.ts). */
  | 'OS_MAPS'
  /** 1 Oct 2026: the outside timer that wakes the website to read email replies (POST /hooks/read-replies). */
  | 'REPLY_TIMER'
  /** The live website's own timers (Vercel Cron), GET /hooks/timer/<job> (src/app/timers.ts). */
  | 'TIMERS'
  /** The nightly backup - its encryption key and the second place it is copied to (src/core/backup.ts). */
  | 'BACKUPS'
  /** The reference database - the ONS postcode table and Ordnance Survey's OSTN15 grid (src/integrations/postcodes/reference-db.ts). */
  | 'REFERENCE_DB';

export type SecretKey = {
  readonly name: string;
  readonly owner: SecretOwner;
  /** False only for a value that is public by design (the analytics measurement id is printed in every page). */
  readonly secret: boolean;
  /** The phase that wires it. */
  readonly phase: string;
  /** In plain words, what it is and where it comes from. */
  readonly what: string;
  /**
   * OTHER NAMES THE SAME KEY IS WRITTEN UNDER IN A KEY FILE THAT ALREADY EXISTS.
   *
   * A key file line whose name no connector owns is IGNORED — deliberately, so that a stray line cannot be read as a
   * key — and the ignoring is silent, which is the right behaviour for a stray line and the wrong one for a key
   * somebody typed under a name we did not expect. That happened: the key file on the Mac names the Land Registry
   * certificate HMLR_BG_CERTIFICATE_PATH, the code read HMLR_BG_CERT_PATH, and the line sat there doing nothing
   * while the connector reported that no certificate was installed. Both were right and the two never met.
   *
   * An alias is read as the canonical name. THE CANONICAL NAME IS STILL THE ONE THE CODE ASKS FOR and the one
   * secrets.example.env lists; an alias is a spelling we accept, not a second key. Where a file holds both, the
   * canonical one wins — a file that disagrees with itself is not resolved in favour of the older spelling.
   */
  readonly aliases?: readonly string[];
  /**
   * THE PHASE THAT RETIRED THIS KEY, where one did. A retired key is not asked for — secrets.example.env
   * leaves it out, and a test holds that — because nothing a click runs reads it. It stays in this list only so that
   * the retired connector that owned it (PAID_RETIRED in src/integrations/connectors/paid-registers.ts) still reads its own key in
   * its recorded-answer tests, and so reversing the decision is deleting this one word, not re-typing four keys.
   */
  readonly retired?: string;
};

/**
 * EVERY KEY NAME PHASES 146b TO 146f NEED. secrets.example.env is checked against this list by a test, name for
 * name, so the two cannot drift.
 *
 * READ FROM EACH SUPPLIER'S PUBLISHED DOCUMENTATION, 22 September 2026:
 *   · Companies House — the key is the user name of HTTP Basic authentication, with an empty password.
 *   · CQC — the syndication API takes a subscription key in the `Ocp-Apim-Subscription-Key` header.
 *   · EPC — the service moved in 2025 from epc.opendatacommunities.org (which now redirects) to
 *     get-energy-performance-data.communities.gov.uk. Its API is api.get-energy-performance-data.communities.gov.uk
 *     and takes ONE bearer token, "found on your my account page when you are logged in to the service" (GOV.UK One
 *     Login). The old service's e-mail-plus-key pair is not needed, so there is one EPC name, not two.
 *   · HM Land Registry Business Gateway — RETIRED. the owner decided the title register
 *     is looked up by hand, and took its four details out of the key file. Its four names (HMLR_BG_USERNAME,
 *     HMLR_BG_PASSWORD, HMLR_BG_CERT_PATH with the alias HMLR_BG_CERTIFICATE_PATH, HMLR_BG_CERT_PASSPHRASE) are marked
 *     `retired` below and are no longer in secrets.example.env. Nothing a click runs reads them: the connector that
 *     did is kept, retired, in PAID_RETIRED (src/integrations/connectors/paid-registers.ts).
 *   · IONOS — SMTP for sending and IMAP for reading replies, each a host, port, user and password.
 */
export const SECRET_KEYS: readonly SecretKey[] = Object.freeze([
  { name: 'ANTHROPIC_API_KEY', owner: 'CLAUDE_DOCUMENTS', secret: true, phase: '146e', what: 'the Claude API key that reads client documents' },
  { name: 'COMPANIES_HOUSE_API_KEY', owner: 'COMPANIES_HOUSE', secret: true, phase: '146c', what: 'the Companies House public data API key' },
  { name: 'CQC_SUBSCRIPTION_KEY', owner: 'CQC', secret: true, phase: '146c', what: 'the CQC API subscription key' },
  { name: 'EPC_API_TOKEN', owner: 'EPC', secret: true, phase: '146c', what: 'the energy certificate service’s bearer token, from its account page' },
  // The same key answers "Find my address" at the assessment (src/integrations/connectors/address-lookup.ts), since GoAddress was removed.
  { name: 'HOMEDATA_API_KEY', owner: 'HOMEDATA_ADDRESS', secret: true, phase: '146d', what: 'the Homedata key: the address box at the assessment, and the paid lookups after signing' },
  { name: 'HMLR_BG_USERNAME', owner: 'HMLR_TITLE', secret: true, phase: '146d', retired: '146k', what: 'the Land Registry Business Gateway user name' },
  { name: 'HMLR_BG_PASSWORD', owner: 'HMLR_TITLE', secret: true, phase: '146d', retired: '146k', what: 'the Land Registry Business Gateway password' },
  { name: 'HMLR_BG_CERT_PATH', owner: 'HMLR_TITLE', secret: true, phase: '146d', retired: '146k', what: 'where the Business Gateway client certificate (a .p12 file) is installed', aliases: ['HMLR_BG_CERTIFICATE_PATH'] },
  { name: 'HMLR_BG_CERT_PASSPHRASE', owner: 'HMLR_TITLE', secret: true, phase: '146d', retired: '146k', what: 'the passphrase of that certificate' },
  { name: 'IONOS_SMTP_HOST', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'the IONOS server that sends email' },
  { name: 'IONOS_SMTP_PORT', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'its port' },
  { name: 'IONOS_SMTP_USER', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'the mailbox that sends' },
  { name: 'IONOS_SMTP_PASSWORD', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'that mailbox’s password' },
  { name: 'IONOS_IMAP_HOST', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'the IONOS server that holds replies' },
  { name: 'IONOS_IMAP_PORT', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'its port' },
  { name: 'IONOS_IMAP_USER', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'the mailbox that is read' },
  { name: 'IONOS_IMAP_PASSWORD', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'that mailbox’s password' },
  { name: 'GA4_MEASUREMENT_ID', owner: 'GOOGLE_ANALYTICS', secret: false, phase: '146f', what: 'the Google Analytics measurement id (public: it is printed in every page)' },
  { name: 'DIDIT_API_KEY', owner: 'DIDIT_IDV', secret: true, phase: '151f', what: 'the Didit identity check API key, from its console' },
  { name: 'DIDIT_WEBHOOK_SECRET', owner: 'DIDIT_IDV', secret: true, phase: '151f', what: 'the Didit webhook secret that signs its results' },
  { name: 'DIDIT_WORKFLOW_ID', owner: 'DIDIT_IDV', secret: false, phase: '151f', what: 'the id of the check set up in the Didit console (not secret)' },
  { name: 'CAPREBATE_MFA_KEY', owner: 'SIGN_IN', secret: true, phase: '151k', what: 'the key that seals each person’s authenticator app secret: 32 random bytes, as base64 (src/core/mfa-seal.ts)' },
  { name: 'TURNSTILE_SITE_KEY', owner: 'CLOUDFLARE_TURNSTILE', secret: false, phase: 'turnstile', what: 'the Cloudflare Turnstile site key for the home page’s contact form (public: it is printed in the page)' },
  { name: 'TURNSTILE_SECRET_KEY', owner: 'CLOUDFLARE_TURNSTILE', secret: true, phase: 'turnstile', what: 'the Cloudflare Turnstile secret key, which the server sends to Cloudflare to check the form’s answer' },
  { name: 'ZOOM_ACCOUNT_ID', owner: 'ZOOM', secret: false, phase: 'zoom', what: 'the Zoom account id, from the Server-to-Server OAuth app in the Zoom App Marketplace (not secret)' },
  { name: 'ZOOM_CLIENT_ID', owner: 'ZOOM', secret: false, phase: 'zoom', what: 'the Server-to-Server OAuth app’s client id, which makes, moves and cancels each video call’s meeting' },
  { name: 'ZOOM_CLIENT_SECRET', owner: 'ZOOM', secret: true, phase: 'zoom', what: 'the Server-to-Server OAuth app’s client secret' },
  { name: 'ZOOM_SDK_CLIENT_ID', owner: 'ZOOM', secret: false, phase: 'zoom', what: 'the Meeting SDK app’s client id, so a call is joined inside our own pages (not secret: it is in each join’s signature)' },
  { name: 'ZOOM_SDK_CLIENT_SECRET', owner: 'ZOOM', secret: true, phase: 'zoom', what: 'the Meeting SDK app’s client secret, which signs each join on this server' },
  { name: 'ZOOM_HOST_EMAIL', owner: 'ZOOM', secret: false, phase: 'zoom', what: 'the email of the Zoom user who hosts the calls (a licensed user on our account); absent, the account’s owner' },
  { name: 'ZOOM_PLAN', owner: 'ZOOM', secret: false, phase: '156d', what: 'which Zoom plan we are on: absent means the free plan (calls stop at 40 minutes, no cloud recording); "pro" once a paid licence is bought' },
  { name: 'WHATSAPP_ACCESS_TOKEN', owner: 'WHATSAPP', secret: true, phase: 'whatsapp', what: 'a token from Meta that lets us send WhatsApp messages. It does not run out.' },
  { name: 'WHATSAPP_PHONE_NUMBER_ID', owner: 'WHATSAPP', secret: false, phase: 'whatsapp', what: 'the id Meta gives our WhatsApp number (in WhatsApp Manager; not the number itself)' },
  { name: 'WHATSAPP_APP_SECRET', owner: 'WHATSAPP', secret: true, phase: 'whatsapp', what: 'the Meta app’s secret, which signs every message Meta sends to our webhook' },
  { name: 'WHATSAPP_VERIFY_TOKEN', owner: 'WHATSAPP', secret: true, phase: 'whatsapp', what: 'a word we choose and also type into Meta’s webhook settings, so Meta can check the address is ours' },
  { name: 'WHATSAPP_OPENING_TEMPLATE', owner: 'WHATSAPP', secret: false, phase: 'whatsapp', what: 'the name of our approved opening message template, with one {{1}} for the first name' },
  { name: 'WHATSAPP_TEMPLATE_LANGUAGE', owner: 'WHATSAPP', secret: false, phase: 'whatsapp', what: 'the language code of that template; en_GB if empty' },
  { name: 'OS_DATA_HUB_API_KEY', owner: 'OS_MAPS', secret: true, phase: 'site-plan', what: 'the Ordnance Survey Data Hub project key (the free OS OpenData plan, with the OS Features API added). It fetches the building outlines for the report’s site plan.' },
  { name: 'REPLY_TIMER_TOKEN', owner: 'REPLY_TIMER', secret: true, phase: 'reply-timer', what: 'a long random word, 32 characters or more. Only the outside timer sends it. It wakes the website to read email replies.' },
  // The live website on Vercel (its runbook: 09-app/docs/LIVE-RUNBOOK.md).
  { name: 'CRON_SECRET', owner: 'TIMERS', secret: true, phase: '161h', what: 'a long random word, 32 characters or more. Vercel Cron sends it with every call to the live website\u2019s timers (/hooks/timer/...); without it every call is refused' },
  { name: 'CAPREBATE_BACKUP_KEY', owner: 'BACKUPS', secret: true, phase: '161h', what: 'the key every backup is locked with before it leaves the website: 32 random bytes, as base64 (openssl rand -base64 32). Keep a copy in the password manager: without it no backup can be opened' },
  { name: 'BACKUP_S3_BUCKET', owner: 'BACKUPS', secret: false, phase: '161h', what: 'the name of the bucket the nightly backup goes to, at the second firm (not secret)' },
  { name: 'BACKUP_S3_REGION', owner: 'BACKUPS', secret: false, phase: '161h', what: 'where that bucket is: eu-west-2 is London (not secret)' },
  { name: 'BACKUP_S3_ACCESS_KEY_ID', owner: 'BACKUPS', secret: false, phase: '161h', what: 'the id of the backup user\u2019s access key; the user may only add and read files in that one bucket' },
  { name: 'BACKUP_S3_SECRET_ACCESS_KEY', owner: 'BACKUPS', secret: true, phase: '161h', what: 'that access key\u2019s secret' },
  { name: 'CAPREBATE_REFERENCE_DB_URL', owner: 'REFERENCE_DB', secret: false, phase: '161h', what: 'the address of the reference database (the postcode table and the OSTN15 grid), libsql://...; or the path of the same file on this computer' },
  { name: 'CAPREBATE_REFERENCE_DB_TOKEN', owner: 'REFERENCE_DB', secret: true, phase: '161h', what: 'a token that can only read the reference database. Make it with: turso db tokens create <name> --read-only' },
]);

export type SecretsState = 'LOADED' | 'NO_FILE' | 'REFUSED_INSIDE_REPOSITORY' | 'UNREADABLE';

/** What one connector may read. Never another owner's key. */
export type OwnerSecrets = {
  readonly owner: SecretOwner;
  get(name: string): string | null;
  has(name: string): boolean;
  /** The names this owner needs that the file does not hold. Names only. */
  missing(): readonly string[];
};

export type SecretStore = {
  readonly state: SecretsState;
  /** In plain words. Carries no key and no value. */
  readonly why: string;
  /** Loose file permissions, said rather than refused: anyone else on the machine could read it. */
  readonly readable_by_others: boolean;
  /** Names present in the file and known here. Names only. */
  names(): readonly string[];
  /** Names in the file that no connector owns. They are ignored, never exposed. */
  unknown_names(): readonly string[];
  forOwner(owner: SecretOwner): OwnerSecrets;
};

/* ------------------------------------------------------------------ redaction */

const REGISTERED = new Set<string>();
/** Short values would redact ordinary words ("465" is a port and a number in a sentence), so only these are held. */
const MIN_REDACT = 8;

/** Every secret value loaded in this process, replaced by a marker. Longest first, so a value inside another goes too. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const v of [...REGISTERED].sort((a, b) => b.length - a.length)) {
    if (out.includes(v)) out = out.split(v).join('[key removed]');
  }
  return out;
}

/** True when the text carries a loaded secret. src/core/audit.ts asks this of every detail string. */
export function carriesSecret(text: string): boolean {
  for (const v of REGISTERED) if (text.includes(v)) return true;
  return false;
}

/** For tests only: forget every registered value, so one test's key does not leak into the next one's checks. */
export function forgetRegisteredSecretsForTest(): void { REGISTERED.clear(); }

/* ------------------------------------------------------------------ the repository */

/** The git working copy this file sits in: the nearest folder above it holding `.git`. Real paths. */
export function repositoryRoot(from: string = import.meta.dirname): string {
  let dir = realpathSync(from);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const up = dirname(dir);
    if (up === dir) return realpathSync(join(import.meta.dirname, '..', '..', '..', '..', '..'));
    dir = up;
  }
}

/** The real path of a file that may not exist yet: its folder's real path, then its name. */
function realish(p: string): string {
  if (existsSync(p)) return realpathSync(p);
  const d = dirname(p);
  return existsSync(d) ? join(realpathSync(d), p.slice(d.length + 1)) : resolve(p);
}

export function isInside(file: string, root: string): boolean {
  const f = realish(file);
  const r = existsSync(root) ? realpathSync(root) : resolve(root);
  return f === r || f.startsWith(r.endsWith(sep) ? r : r + sep);
}

export const DEFAULT_SECRETS_FILE = '~/.caprebate-secrets.env';

/**
 * THE LIVE SERVER'S KEY STORE IS SYSTEMD'S.
 *
 * On the live server the unit file says `LoadCredential=caprebate-secrets:/etc/caprebate/caprebate-secrets` (the
 * runbook has the steps). systemd then reads that root-only file when the service starts, puts a copy in a folder of
 * its own that only this service can open (in memory, never swapped to disk), and names the folder in
 * CREDENTIALS_DIRECTORY. WHEN THAT FOLDER HOLDS `caprebate-secrets`, IT IS THE KEY FILE, ahead of CAPREBATE_SECRETS and
 * the home-folder file. Anywhere else - the Mac, the test website - nothing sets CREDENTIALS_DIRECTORY, and the key file
 * is found exactly as before.
 */
export const CREDENTIAL_NAME = 'caprebate-secrets';

/** The key file in systemd's credentials folder, when the folder is named and holds one; otherwise null. */
export function credentialsFile(env: Record<string, string | undefined> = process.env): string | null {
  const dir = (env.CREDENTIALS_DIRECTORY ?? '').trim();
  if (dir === '' || !isAbsolute(dir)) return null;
  const f = join(dir, CREDENTIAL_NAME);
  return existsSync(f) ? f : null;
}

export function secretsPath(env: Record<string, string | undefined> = process.env): string {
  const fromSystemd = credentialsFile(env);
  if (fromSystemd !== null) return fromSystemd;
  const raw = (env.CAPREBATE_SECRETS ?? '').trim() || DEFAULT_SECRETS_FILE;
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

/* ------------------------------------------------------------------ parsing */

/** `NAME=value`, `export NAME=value`, quotes stripped, `#` comments. A line that is none of these is skipped. */
export function parseSecretsFile(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(t);
    if (m === null) continue;
    let v = (m[2] ?? '').trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    if (v !== '') out.set(m[1] ?? '', v);
  }
  return out;
}

/* ------------------------------------------------------------------ the store */

const OWNED = new Map(SECRET_KEYS.map((k) => [k.name, k] as const));

/** Every accepted spelling, to the key it means. A canonical name maps to itself. */
export const KEY_OF_NAME: ReadonlyMap<string, string> = new Map(
  SECRET_KEYS.flatMap((k) => [[k.name, k.name] as const, ...(k.aliases ?? []).map((a) => [a, k.name] as const)]),
);

function makeStore(state: SecretsState, why: string, values: Map<string, string>, readable_by_others: boolean): SecretStore {
  /* An alias is folded onto the canonical name as the file is read, so nothing downstream — the connectors, the
     missing-key words, the names() listing — knows that a file used a different spelling. A canonical line already
     present is never overwritten by an alias. */
  const known = new Map<string, string>();
  for (const [name, v] of values) {
    const canonical = KEY_OF_NAME.get(name);
    if (canonical === undefined) continue;
    if (canonical !== name && known.has(canonical)) continue;
    if (canonical === name || !values.has(canonical)) known.set(canonical, v);
  }
  const unknown = [...values.keys()].filter((k) => !KEY_OF_NAME.has(k)).sort();
  for (const [k, v] of known) if (OWNED.get(k)?.secret === true && v.length >= MIN_REDACT) REGISTERED.add(v);
  const shown = (): string => `secrets (${state}): ${[...known.keys()].sort().join(', ') || 'none'}`;
  const store: SecretStore & { toString(): string; toJSON(): unknown } = {
    state, why, readable_by_others,
    names: () => [...known.keys()].sort(),
    unknown_names: () => unknown,
    forOwner(owner) {
      const mine = SECRET_KEYS.filter((k) => k.owner === owner).map((k) => k.name);
      const get = (name: string): string | null => (mine.includes(name) ? known.get(name) ?? null : null);
      return {
        owner,
        get,
        has: (name) => get(name) !== null,
        missing: () => mine.filter((n) => !known.has(n)),
        toString: () => `secrets for ${owner}: ${mine.filter((n) => known.has(n)).join(', ') || 'none'}`,
        toJSON: () => ({ owner, present: mine.filter((n) => known.has(n)) }),
        [Symbol.for('nodejs.util.inspect.custom')]: () => `secrets for ${owner}`,
      } as OwnerSecrets;
    },
    toString: shown,
    toJSON: () => ({ state, names: [...known.keys()].sort() }),
  };
  Object.defineProperty(store, Symbol.for('nodejs.util.inspect.custom'), { value: shown });
  return Object.freeze(store);
}

/**
 * THE SAME KEYS, WITH SOME REPLACED — the keys Admin saved on Home's Admin tab (src/core/saved-keys.ts), over
 * the key file or the website's settings. Every key is read from `base` by its own owner, so nothing crosses owners.
 */
export function overlaySecrets(base: SecretStore, over: ReadonlyMap<string, string>, why: string): SecretStore {
  const values = new Map<string, string>();
  for (const k of SECRET_KEYS) {
    const v = base.forOwner(k.owner).get(k.name);
    if (v !== null) values.set(k.name, v);
  }
  for (const [n, v] of over) if (KEY_OF_NAME.get(n) === n) values.set(n, v);
  return makeStore(values.size > 0 ? 'LOADED' : base.state, why, values, base.readable_by_others);
}

/** An empty store: every connector NOT_CONFIGURED. What a test, and a machine with no key file, get. */
export function emptySecrets(why = 'no key file is in use'): SecretStore {
  return makeStore('NO_FILE', why, new Map(), false);
}

/**
 *: THE TEST WEBSITE'S KEYS, FROM ITS OWN SETTINGS. The test deployment on
 * Vercel has no key file and cannot have one; its settings arrive as environment variables. This reads ONLY the names
 * it is given, from those variables, and nothing else in the environment. It is called by the test deployment's entry
 * point (api/index.mjs), and only when that deployment has a password of its own; a live server reads the key file.
 */
export function secretsFromEnvironment(env: Record<string, string | undefined>, names: readonly string[],
  why = 'keys read from the test website’s own settings'): SecretStore {
  const values = new Map<string, string>();
  for (const n of names) {
    const v = (env[n] ?? '').trim();
    if (v !== '') values.set(n, v);
  }
  return makeStore('LOADED', why, values, false);
}

/** A store from values in memory. Tests only — a live process reads the file. */
export function secretsFromValues(values: Record<string, string>): SecretStore {
  return makeStore('LOADED', 'keys given in memory (a test)', new Map(Object.entries(values)), false);
}

/**
 * READ THE KEY FILE. Never throws. `repoRoot` is injectable so a test can prove the refusal without touching the
 * real repository.
 */
export function loadSecrets(opts: { env?: Record<string, string | undefined>; repoRoot?: string } = {}): SecretStore {
  const path = secretsPath(opts.env ?? process.env);
  const root = opts.repoRoot ?? repositoryRoot();
  if (isInside(path, root)) {
    return makeStore('REFUSED_INSIDE_REPOSITORY',
      'The key file is inside the code folder, so it was not read. Move it outside, to your home folder.', new Map(), false);
  }
  if (!existsSync(path)) {
    return makeStore('NO_FILE', 'There is no key file yet, so no outside service is set up.', new Map(), false);
  }
  try {
    const mode = statSync(path).mode;
    const text = readFileSync(path, 'utf8');
    const where = credentialsFile(opts.env ?? process.env) === path ? ' from systemd’s credentials folder' : '';
    return makeStore('LOADED', `The key file was read${where}.`, parseSecretsFile(text), (mode & 0o077) !== 0);
  } catch {
    return makeStore('UNREADABLE', 'The key file is there but could not be read.', new Map(), false);
  }
}

/**
 * THE STORE A RUNNING PROCESS USES — the key file, except under the test runner. `node --test` sets
 * NODE_TEST_CONTEXT, and there the answer is the empty store, so no suite ever reads this machine's key file and every
 * suite passes the same with no key and no network (the integration phases' rule 3). CAPREBATE_LIVE_SMOKE=1 is the
 * one way past it, as it is for http.ts.
 */
export function processSecrets(env: Record<string, string | undefined> = process.env): SecretStore {
  if (env.NODE_TEST_CONTEXT !== undefined && env.CAPREBATE_LIVE_SMOKE !== '1') return emptySecrets('the test runner never reads the key file');
  if (useInstead !== null) return useInstead;
  return loadSecrets({ env });
}

/*
 * 30 SEPTEMBER 2026: THE TEST WEBSITE HAS NO KEY FILE; its keys are its settings, read behind the test password
 * (api/index.mjs, configureTestDeploy). Screens that ask `processSecrets()` for the email login (a staff email, a message
 * alert, the settings page) would find none there, so the website hands its store here once it has read it. Never used
 * under the test runner, and a running server with a key file never calls it.
 */
let useInstead: SecretStore | null = null;
export function useProcessSecrets(store: SecretStore): void { useInstead = store; }

/* ------------------------------------------------------------------ the start-up check */

/**
 * A KEY FILE OTHERS CAN OPEN STOPS A LIVE START.
 *
 * THE PRODUCTION SETTING is CAPREBATE_PRODUCTION=1, set by the live server's unit file and by nothing else (the Mac and
 * the test website never set it). On a start with it set, a key file that anyone but the app's own user could read or
 * change (any permission wider than 600), or that belongs to another user, STOPS THE START with a plain message naming
 * the file and what is wrong. Without it the same message is a warning and the app starts, as it always has.
 *
 * WHAT IS NOT CHECKED, AND WHY. A key file in systemd's credentials folder is systemd's: the folder is the service's
 * own, and systemd usually grants the read with an access list on a file root owns, which shows as a wider mode and
 * another owner although nobody else can open it. So that copy is not judged here; the file systemd copies it from is
 * root's, mode 600, as the runbook sets it. No key file at all is not this check's business: every service then reads
 * as not set up, as before (N4). The message carries the file's name and its permissions, NEVER a word of what is in it.
 */
export function isProduction(env: Record<string, string | undefined> = process.env): boolean {
  return (env.CAPREBATE_PRODUCTION ?? '').trim() === '1';
}

export type KeyFileStat = { readonly mode: number; readonly uid: number };

/** What is wrong with the key file's permissions, in words; empty when nothing is. Reads the file's details, never its text. */
export function keyFileLooseness(st: KeyFileStat, myUid: number | null): string[] {
  const out: string[] = [];
  const perms = st.mode & 0o777;
  if ((perms & ~0o600) !== 0) {
    const mode = perms.toString(8).padStart(3, '0');
    out.push((perms & 0o077) !== 0
      ? `its permissions are ${mode}, so others on this server can read or change it (it must be 600)`
      : `its permissions are ${mode}, wider than the 600 it must be`);
  }
  if (myUid !== null && st.uid !== myUid) out.push(`it belongs to another user (user ${String(st.uid)}), not the user this app runs as (user ${String(myUid)})`);
  return out;
}

export type StartCheck = { readonly stop: boolean; readonly lines: readonly string[] };

/** Run before the server or a command starts. Never throws; never prints. The caller prints `lines` and, on `stop`, does not start. */
export function keyFileStartCheck(opts: {
  env?: Record<string, string | undefined>;
  statOf?: (path: string) => KeyFileStat;
  uid?: number | null;
} = {}): StartCheck {
  const env = opts.env ?? process.env;
  const path = secretsPath(env);
  if (credentialsFile(env) === path) return { stop: false, lines: [] };
  let st: KeyFileStat;
  try {
    if (opts.statOf === undefined && !existsSync(path)) return { stop: false, lines: [] };
    st = (opts.statOf ?? statSync)(path);
  } catch {
    return { stop: false, lines: [] };
  }
  const uid = opts.uid !== undefined ? opts.uid : typeof process.getuid === 'function' ? process.getuid() : null;
  const loose = keyFileLooseness(st, uid);
  if (loose.length === 0) return { stop: false, lines: [] };
  const live = isProduction(env);
  const fix = `To fix it: chown the file to the app's own user, then chmod 600 "${path}".`;
  return {
    stop: live,
    lines: [
      `${live ? 'NOT STARTED' : 'Warning'}: the key file ${path} is not locked down: ${loose.join('; ')}.`,
      live ? `This is the live server (CAPREBATE_PRODUCTION=1), so the app will not start until it is. ${fix}`
        : `On the live server this would stop the start. ${fix}`,
    ],
  };
}
