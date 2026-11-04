/**
 * PHASE 161a, 4 November 2026 — THE PACKAGE FLAWS, AND THE TEST WEBSITE'S PACKAGE KEPT OUT OF THE LIVE BUILD.
 *
 * The ITRoadway technical audit (2 Nov 2026), section 4, row 1 (High): "Some third-party packages are out of date and
 * have published security flaws. Update them, and remove the one package that is only needed for the test website."
 * On 4 Nov 2026 npm audit found five high flaws (undici, zod), every one reached through @vercel/blob, which only the
 * test website's document store uses.
 *
 * What these tests hold:
 *   - in the back end, @vercel/blob is a package for the tests only (devDependencies), so the live install,
 *     npm ci --omit=dev, leaves it out; the root package file, which builds only the test website, keeps it. Nothing
 *     in the live start loads it at the top of a file. (Not --omit=optional, as the phase first said: that also drops
 *     the native parts of @node-rs/argon2 and libsql, which are optional packages, and the live server cannot start.);
 *   - which store the test website picks: no store set, the temporary disk; a store set and the package there, the
 *     Blob store; a store set and the package missing, the temporary disk again, and the log says why. Any other
 *     error still stops the start, so a real fault is never hidden;
 *   - npm run check runs npm audit for the live install, so a new high flaw turns the check red;
 *   - the live install keeps the optional packages that carry argon2's and libsql's native parts.
 * No network: the Blob package is never called here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND = join(import.meta.dirname, '..');
const ROOT = join(BACKEND, '..', '..', '..');
const ENTRY = join(ROOT, 'api', 'index.mjs');

type Docs = { shared: boolean; token?: string; why: string };
type Lasting = { authToken?: string };
type Entry = {
  sharedDocumentStore: (env: Record<string, string | undefined>, lasting: Lasting) => Docs;
  sharedDocumentOptions: (docs: Docs, lasting: Lasting, sdk?: unknown, makeClient?: (auth: { token?: string }, sdk?: unknown) => Promise<unknown>) => Promise<Record<string, unknown>>;
  documentsWhy: (docs: Docs, lastingInUse: boolean) => string;
};
const entry = async (): Promise<Entry> => (await import(ENTRY)) as Entry;

const LASTING: Lasting = { authToken: 'invented-161a-database-token' };
const STORE = { BLOB_STORE_ID: 'store_invented161a' };

/** The error Node gives when a package is not installed, as `import('@vercel/blob')` would throw it. */
function notInstalled(): Error {
  const e = new Error("Cannot find package '@vercel/blob' imported from /var/task/Caprebate/09-app/backend/src/web/shared-objectstore.ts") as Error & { code: string };
  e.code = 'ERR_MODULE_NOT_FOUND';
  return e;
}

const pkg = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, string> | undefined>;

test('161a: in the back end @vercel/blob is for the tests only; the root, which builds only the test website, keeps it', () => {
  const back = pkg(join(BACKEND, 'package.json'));
  assert.equal(back.dependencies?.['@vercel/blob'], undefined, 'back end: not a live dependency');
  assert.equal(back.optionalDependencies?.['@vercel/blob'], undefined, 'back end: not an optional one either');
  assert.ok(back.devDependencies?.['@vercel/blob'], 'back end: a package for the tests');
  assert.ok(pkg(join(ROOT, 'package.json')).dependencies?.['@vercel/blob'], 'root: the test website still has it');
});

test('161a: the live install keeps argon2 and libsql whole (their native parts are optional packages)', () => {
  const back = pkg(join(BACKEND, 'package.json'));
  assert.ok(back.dependencies?.['@node-rs/argon2'] && back.dependencies?.libsql);
  assert.doesNotMatch(back.scripts?.['audit:live'] ?? '', /omit=optional/, 'never omit the optional packages');
});

test('161a: nothing in the back end loads @vercel/blob at the top of a file, so the live start never needs it', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|mjs|cjs|js)$/.test(name)) files.push(p);
    }
  };
  walk(join(BACKEND, 'src'));
  for (const f of [...files, ENTRY]) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /^\s*import\s[^;]*from\s+['"]@vercel\/blob['"]/m, `${f} imports @vercel/blob at the top`);
    assert.doesNotMatch(src, /require\(\s*['"]@vercel\/blob['"]\s*\)/, `${f} requires @vercel/blob`);
  }
});

test('161a: no store set - the temporary disk, and the Blob package is never asked for', async () => {
  const { sharedDocumentStore, sharedDocumentOptions } = await entry();
  const docs = sharedDocumentStore({}, LASTING);
  let asked = false;
  const opts = await sharedDocumentOptions(docs, LASTING, undefined, async () => { asked = true; return {}; });
  assert.deepEqual(opts, {});
  assert.equal(asked, false);
  assert.match(docs.why, /temporary disk/);
});

test('161a: a store set and the package there - the Blob store', async () => {
  const { sharedDocumentStore, sharedDocumentOptions, documentsWhy } = await entry();
  const docs = sharedDocumentStore(STORE, LASTING);
  const client = { put: async () => {}, read: async () => null, exists: async () => false, remove: async () => {} };
  const opts = await sharedDocumentOptions(docs, LASTING, undefined, async () => client);
  const shared = opts.sharedDocuments as { client: unknown } | undefined;
  assert.equal(shared?.client, client);
  assert.match(documentsWhy(docs, true), /private document store/);
});

test('161a: a store set and the package not installed - the temporary disk, and the log says why', async () => {
  const { sharedDocumentStore, sharedDocumentOptions, documentsWhy } = await entry();
  const docs = sharedDocumentStore(STORE, LASTING);
  const opts = await sharedDocumentOptions(docs, LASTING, undefined, async () => { throw notInstalled(); });
  assert.deepEqual(opts, {});
  assert.equal(docs.shared, false);
  const why = documentsWhy(docs, true);
  assert.match(why, /not installed/);
  assert.match(why, /temporary disk/);
  assert.doesNotMatch(why, /store_invented161a/, 'never the store id');
});

test('161a: any other fault while opening the store still stops the start', async () => {
  const { sharedDocumentStore, sharedDocumentOptions } = await entry();
  const docs = sharedDocumentStore(STORE, LASTING);
  await assert.rejects(sharedDocumentOptions(docs, LASTING, undefined, async () => { throw new Error('a real fault'); }), /a real fault/);
  const other = new Error("Cannot find package 'something-else'") as Error & { code: string };
  other.code = 'ERR_MODULE_NOT_FOUND';
  await assert.rejects(sharedDocumentOptions(sharedDocumentStore(STORE, LASTING), LASTING, undefined, async () => { throw other; }), /something-else/);
});

test('161a: npm run check runs npm audit for the live install, high and above', () => {
  const p = pkg(join(BACKEND, 'package.json'));
  const scripts = p.scripts ?? {};
  assert.match(scripts['audit:live'] ?? '', /^npm audit --omit=dev --audit-level=high$/);
  assert.match(scripts.check ?? '', /npm run audit:live/);
});
