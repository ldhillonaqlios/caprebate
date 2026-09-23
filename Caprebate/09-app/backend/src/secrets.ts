/**
 * THE KEY FILE — every supplier key this build can use, read from ONE file OUTSIDE the repository. Phase 146b,
 * 22 September 2026.
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
 * Every value loaded is registered with `redactSecrets`, which src/connectors/http.ts runs over every error before it
 * is kept, and src/audit.ts refuses any audit detail that carries one — the audit screen refuses rather than redacts,
 * which is its own rule. Nothing here writes to the console.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

/** Who a key belongs to: the connector that may read it. */
export type SecretOwner =
  | 'CLAUDE_DOCUMENTS' | 'COMPANIES_HOUSE' | 'CQC' | 'EPC' | 'HOMEDATA_ADDRESS' | 'HMLR_TITLE'
  | 'IONOS_EMAIL' | 'IONOS_MAILBOX' | 'GOOGLE_ANALYTICS';

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
   * PHASE 146d: OTHER NAMES THE SAME KEY IS WRITTEN UNDER IN A KEY FILE THAT ALREADY EXISTS.
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
 *   · HM Land Registry Business Gateway — a user name and password on every request, over a TLS connection made
 *     with the client certificate HM Land Registry issues under the network access agreement (a PKCS#12 file and
 *     its passphrase). The certificate FILE stays where the developer installs it; the key file holds its path.
 *   · IONOS — SMTP for sending and IMAP for reading replies, each a host, port, user and password.
 */
export const SECRET_KEYS: readonly SecretKey[] = Object.freeze([
  { name: 'ANTHROPIC_API_KEY', owner: 'CLAUDE_DOCUMENTS', secret: true, phase: '146e', what: 'the Claude API key that reads client documents' },
  { name: 'COMPANIES_HOUSE_API_KEY', owner: 'COMPANIES_HOUSE', secret: true, phase: '146c', what: 'the Companies House public data API key' },
  { name: 'CQC_SUBSCRIPTION_KEY', owner: 'CQC', secret: true, phase: '146c', what: 'the CQC API subscription key' },
  { name: 'EPC_API_TOKEN', owner: 'EPC', secret: true, phase: '146c', what: 'the energy certificate service’s bearer token, from its account page' },
  { name: 'HOMEDATA_API_KEY', owner: 'HOMEDATA_ADDRESS', secret: true, phase: '146d', what: 'the Homedata address lookup key' },
  { name: 'HMLR_BG_USERNAME', owner: 'HMLR_TITLE', secret: true, phase: '146d', what: 'the Land Registry Business Gateway user name' },
  { name: 'HMLR_BG_PASSWORD', owner: 'HMLR_TITLE', secret: true, phase: '146d', what: 'the Land Registry Business Gateway password' },
  { name: 'HMLR_BG_CERT_PATH', owner: 'HMLR_TITLE', secret: true, phase: '146d', what: 'where the Business Gateway client certificate (a .p12 file) is installed', aliases: ['HMLR_BG_CERTIFICATE_PATH'] },
  { name: 'HMLR_BG_CERT_PASSPHRASE', owner: 'HMLR_TITLE', secret: true, phase: '146d', what: 'the passphrase of that certificate' },
  { name: 'IONOS_SMTP_HOST', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'the IONOS server that sends email' },
  { name: 'IONOS_SMTP_PORT', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'its port' },
  { name: 'IONOS_SMTP_USER', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'the mailbox that sends' },
  { name: 'IONOS_SMTP_PASSWORD', owner: 'IONOS_EMAIL', secret: true, phase: '146f', what: 'that mailbox’s password' },
  { name: 'IONOS_IMAP_HOST', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'the IONOS server that holds replies' },
  { name: 'IONOS_IMAP_PORT', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'its port' },
  { name: 'IONOS_IMAP_USER', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'the mailbox that is read' },
  { name: 'IONOS_IMAP_PASSWORD', owner: 'IONOS_MAILBOX', secret: true, phase: '146f', what: 'that mailbox’s password' },
  { name: 'GA4_MEASUREMENT_ID', owner: 'GOOGLE_ANALYTICS', secret: false, phase: '146f', what: 'the Google Analytics measurement id (public: it is printed in every page)' },
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

/** True when the text carries a loaded secret. src/audit.ts asks this of every detail string. */
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
    if (up === dir) return realpathSync(join(import.meta.dirname, '..', '..', '..', '..'));
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

export function secretsPath(env: Record<string, string | undefined> = process.env): string {
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

/** An empty store: every connector NOT_CONFIGURED. What a test, and a machine with no key file, get. */
export function emptySecrets(why = 'no key file is in use'): SecretStore {
  return makeStore('NO_FILE', why, new Map(), false);
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
    return makeStore('LOADED', 'The key file was read.', parseSecretsFile(text), (mode & 0o077) !== 0);
  } catch {
    return makeStore('UNREADABLE', 'The key file is there but could not be read.', new Map(), false);
  }
}

/**
 * PHASE 146f: THE STORE A RUNNING PROCESS USES — the key file, except under the test runner. `node --test` sets
 * NODE_TEST_CONTEXT, and there the answer is the empty store, so no suite ever reads this machine's key file and every
 * suite passes the same with no key and no network (the integration phases' rule 3). CAPREBATE_LIVE_SMOKE=1 is the
 * one way past it, as it is for http.ts.
 */
export function processSecrets(env: Record<string, string | undefined> = process.env): SecretStore {
  if (env.NODE_TEST_CONTEXT !== undefined && env.CAPREBATE_LIVE_SMOKE !== '1') return emptySecrets('the test runner never reads the key file');
  return loadSecrets({ env });
}
