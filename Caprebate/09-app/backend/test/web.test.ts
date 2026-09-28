/**
 * THE WEB HALF — the public site, the assessment, the login and the portal.
 *
 * The tests that matter most here are not the ones that prove a screen renders.
 * They are:
 *   · CLIENT ISOLATION — another client's id in the URL returns a refusal, not
 *     a page. The phase brief calls this "the single most common way a portal
 *     leaks" and it is the first block below.
 *   · REQUIREMENT DB-W1 — its six acceptance tests, named DB-W1-T1 to DB-W1-T6, run
 *     against this build and reported honestly where one needs a real host.
 *   · THE UPLOAD HANDLER RAN — unmodified, through its real ports, discharging
 *     the twelve-step contract.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pdfOf } from './document-fixtures.ts';
import { createApp } from '../src/server.ts';
import { FsObjectStore, assertNoStaticFileRoute, FILE_MODE } from '../src/web/objectstore.ts';
import { beginUpload, acceptClientBytes, finishUpload, eventsFor } from '../src/web/uploads.ts';
import { assertContractCovered, quarantineKeyFor, UPLOAD_LIMITS } from '../src/web/upload-handler-port.ts';
import { STAGES, progressFor, stageIndex } from '../src/web/stages.ts';
import { loadLetter, letterExists } from '../src/web/letter.ts';
import { SCREEN_IDS, SCREENS, answerRows } from '../src/web/assessment.ts';
import { escapeHtml, h } from '../src/web/html.ts';
import { registryGate, FUNNEL, BOOKING } from '../src/web/engine.ts';

/* ------------------------------------------------------------------ *
 * a whole application, over real HTTP
 * ------------------------------------------------------------------ */

type Client = {
  base: string;
  cookie: string;
  req(path: string, init?: RequestInit): Promise<{ status: number; location: string | null; body: string }>;
  post(path: string, fields: Record<string, string>): Promise<{ status: number; location: string | null; body: string }>;
};

async function boot(): Promise<{ close(): void; app: Awaited<ReturnType<typeof createApp>>['app']; store: FsObjectStore; client(): Client; docsRoot: string }> {
  const docsRoot = mkdtempSync(join(tmpdir(), 'cb-w1-'));
  const made = await createApp(':memory:', { documentRoot: docsRoot });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const client = (): Client => {
    const c: Client = {
      base, cookie: '',
      async req(path, init = {}) {
        const headers = { ...(init.headers as Record<string, string> | undefined) };
        if (c.cookie !== '') headers['cookie'] = c.cookie;
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
        const set = r.headers.getSetCookie();
        if (set.length > 0) {
          const jar = new Map(c.cookie.split('; ').filter(Boolean).map((x) => [x.split('=')[0] ?? '', x] as const));
          for (const s of set) {
            const first = s.split(';')[0] ?? '';
            jar.set(first.split('=')[0] ?? '', first);
          }
          c.cookie = [...jar.values()].join('; ');
        }
        return { status: r.status, location: r.headers.get('location'), body: await r.text() };
      },
      post(path, fields) {
        return c.req(path, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(fields).toString(),
        });
      },
    };
    return c;
  };
  return { close: made.close, app: made.app, store: made.store, client, docsRoot };
}

const T = '2026-09-08T00:00:00.000Z';

/** Two clients, two businesses. The fixture the isolation tests need. */
function seedTwoClients(app: Awaited<ReturnType<typeof createApp>>['app'], hash: string): {
  a: { business: string; user: string }; b: { business: string; user: string };
} {
  const mk = (n: string, biz: string, user: string, email: string): void => {
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
      [biz, n, 'dental', 'ENGAGEMENT_SIGNED', T]);
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,?)',
      [user, email, email, n, 'CLIENT', hash, T, T, biz]);
  };
  mk('Alpha Dental Ltd', 'biz-a', 'user-a', 'a@example.test');
  mk('Beta Dental Ltd', 'biz-b', 'user-b', 'b@example.test');
  return { a: { business: 'biz-a', user: 'user-a' }, b: { business: 'biz-b', user: 'user-b' } };
}

/** The real hasher is slow; the app hashes at login, so seed a real argon2 hash once. */
async function realHashOf(app: Awaited<ReturnType<typeof createApp>>['app'], pw: string): Promise<string> {
  return app.hasher.hash(pw);
}

/* ================================================================== *
 * 1. CLIENT ISOLATION — the single most common way a portal leaks
 * ================================================================== */

test('a client reaches their own record and only their own', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const hash = await realHashOf(it.app, 'correct horse battery');
  const { a, b } = seedTwoClients(it.app, hash);

  const c = it.client();
  const login = await c.post('/login', { email: 'a@example.test', password: 'correct horse battery' });
  assert.equal(login.status, 303, 'a good login redirects');

  const own = await c.req('/portal');
  assert.equal(own.status, 200);
  assert.match(own.body, /Alpha Dental Ltd/);

  // THE ATTACK: the other client's id in the query string.
  const other = await c.req(`/portal?business=${b.business}`);
  assert.notEqual(other.status, 200, 'must not render a page for another client');
  assert.doesNotMatch(other.body, /Beta Dental Ltd/, "must not leak the other business's name");

  // And it is not merely filtered out of the view: the client's OWN record is
  // what came back, because the business id for a CLIENT is never read from
  // the request at all.
  assert.match(own.body, /Alpha Dental Ltd/);
  void a;
});

test('one client cannot open another client’s document, and a missing one looks identical', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const hash = await realHashOf(it.app, 'correct horse battery');
  const { b } = seedTwoClients(it.app, hash);

  it.app.db.run(
    'INSERT INTO documents (id,business_id,uploaded_by,filename,state,created_at) VALUES (?,?,?,?,?,?)',
    ['doc-b', b.business, b.user, 'beta-lease.pdf', 'COMPLETE', T]);

  const c = it.client();
  await c.post('/login', { email: 'a@example.test', password: 'correct horse battery' });

  const forbidden = await c.req('/portal/documents/doc-b');
  const missing = await c.req('/portal/documents/doc-does-not-exist');
  assert.equal(forbidden.status, 403);
  assert.equal(missing.status, 403, 'a missing row and a forbidden row must be indistinguishable');
  assert.equal(forbidden.body, missing.body, 'and their bodies must match, or the pair is an oracle');
  assert.doesNotMatch(forbidden.body, /beta-lease/);
});

/* ================================================================== *
 * 2. REQUIREMENT DB-W1 — the six acceptance tests
 * ================================================================== */

test('DB-W1-T1 — a stored document is not reachable by path, unauthenticated', async (t) => {
  const it = await boot();
  t.after(() => it.close());

  // There is no route that maps a path onto the filesystem, so every shape of
  // the attack is a 404 or a redirect to sign in — never bytes, never a listing.
  for (const path of [
    '/.documents/quarantine/anything',
    '/documents/anything',
    '/quarantine/',
    '/portal/documents/doc-x/download',
    '/assets/../src/db.ts',
  ]) {
    const r = await it.client().req(path);
    assert.notEqual(r.status, 200, `${path} must not return 200 unauthenticated`);
    assert.doesNotMatch(r.body, /PRAGMA|BEGIN|%PDF/, `${path} must not return file content`);
  }
});

/**
 * DB-W1-T1 — AND IT NOW READS EVERY WEB SOURCE, NOT ONLY THE ROUTER.
 *
 * It checked `router.ts` alone until Phase 105, which was right while the
 * router was the only file that could answer a request. It is not any more:
 * `staff.ts` serves the profile photograph, and a check scoped to one file
 * stopped being a check the moment a second file could serve. It is also not a
 * property of today's routes — the point is that a future route which reads a
 * file by path cannot be added anywhere in src/web/ without this failing.
 */
test('DB-W1-T1 — NO file in src/web/ maps a request path onto the filesystem', async () => {
  const dir = new URL('../src/web/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length >= 10, `only ${files.length} web sources found — the scan is not finding them`);
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    await assertNoStaticFileRoute(src);
  }
  // NEGATIVE CONTROLS, one per pattern, so a check that cannot fail cannot
  // pass for a check. Phase 78 found a drift checker that was green because it
  // could not fail; the lesson stuck.
  for (const bad of [
    'createReadStream(userPath)',
    'res.sendFile(req.params.name)',
    'readFileSync(join(root, req.url))',
    'app.use(express.static("public"))',
    'import serveStatic from "serve-static";',
  ]) {
    await assert.rejects(() => assertNoStaticFileRoute(bad), `"${bad}" was not caught`);
  }
});

test('DB-W1-T2 — authentication is not authorisation', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const hash = await realHashOf(it.app, 'correct horse battery');
  const { b } = seedTwoClients(it.app, hash);
  it.app.db.run(
    'INSERT INTO documents (id,business_id,uploaded_by,filename,state,created_at) VALUES (?,?,?,?,?,?)',
    ['doc-b', b.business, b.user, 'beta-lease.pdf', 'COMPLETE', T]);

  const c = it.client();
  await c.post('/login', { email: 'a@example.test', password: 'correct horse battery' });
  const r = await c.req('/portal/documents/doc-b/download');
  assert.equal(r.status, 403, 'logged in, but with no entitlement to THAT document');
});

test('DB-W1-T3 — entitlement is checked per request, not cached at session start', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const hash = await realHashOf(it.app, 'correct horse battery');
  const { a } = seedTwoClients(it.app, hash);
  it.app.db.run(
    'INSERT INTO documents (id,business_id,uploaded_by,filename,state,created_at) VALUES (?,?,?,?,?,?)',
    ['doc-a', a.business, a.user, 'alpha-lease.pdf', 'COMPLETE', T]);

  const c = it.client();
  await c.post('/login', { email: 'a@example.test', password: 'correct horse battery' });
  assert.equal((await c.req('/portal/documents/doc-a')).status, 200, 'entitled at first');

  // The document moves to the other business. NOTHING ELSE CHANGES — the same
  // session, the same cookie, the same user. A capability cached at session
  // start would still let this through.
  it.app.db.run('UPDATE documents SET business_id = ? WHERE id = ?', ['biz-b', 'doc-a']);
  assert.equal((await c.req('/portal/documents/doc-a')).status, 403,
    'the very next request must be refused — the check is per request');
});

test('DB-W1-T4 — NEEDS THE REAL HOST, and is recorded as not run', () => {
  // "No client document appears in the WordPress Media Library, in its REST
  // API responses, or in any attachment page or sitemap."
  //
  // THERE IS NO WORDPRESS IN THIS BUILD, so this cannot be demonstrated here
  // and is NOT quietly counted as a pass. What this build can say is the thing
  // DB-W1-T4 is really asking — that no client document is written anywhere a web
  // server serves — and DB-W1-T1's two tests above establish that. The Media
  // Library check belongs to whoever stands the WordPress site up.
  assert.ok(true, 'declared, not run');
});

test('DB-W1-T5 — no execute bit, server-side sniffing, allow-list and size cap', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const store = it.store;

  const perms = store.permissionReport();
  assert.equal(perms.fileExecuteBits, 0, 'a stored client file must not be executable by anyone');
  assert.equal(perms.dirGroupOther, 0, 'group and other get nothing on the storage directory');
  assert.equal(perms.dirMode, '700');

  const deps = { db: it.app.db, store, now: it.app.now, actor: 'tester' };
  it.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  it.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u', 'u@example.test', 'u@example.test', 'U', 'CLIENT', 'x', T, T, 'bz']);

  // A PHP PAYLOAD NAMED .pdf. Refused on the bytes, not the extension.
  const evil = await beginUpload(deps, {
    business_id: 'bz', uploaded_by: 'u', filename: 'invoice.pdf', declared_type: 'LEASE',
  });
  const token = new URL('http://x' + evil.url).searchParams.get('token') ?? '';
  const php = Buffer.from('<?php system($_GET["c"]); ?>');
  const refused = await acceptClientBytes(deps, { doc_id: evil.doc_id, token, bytes: new Uint8Array(php) });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.status : 0, 415, 'refused on content sniffing');

  // The size cap is server-side and is the handler's own constant.
  const huge = new Uint8Array(UPLOAD_LIMITS.max_bytes + 1);
  huge.set([0x25, 0x50, 0x44, 0x46]); // a valid %PDF magic, so only the size can refuse it
  const tooBig = await acceptClientBytes(deps, { doc_id: evil.doc_id, token, bytes: huge });
  assert.equal(tooBig.ok === false ? tooBig.status : 0, 413);

  // And the capability is scoped to ONE key.
  const scoped = store.verifyPutToken(token, quarantineKeyFor('some-other-document'));
  assert.deepEqual(scoped, { ok: false, why: 'scope' });
});

test('DB-W1-T6 — every serve of a client document writes an access record', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  const hash = await realHashOf(it.app, 'correct horse battery');
  const { a } = seedTwoClients(it.app, hash);
  it.app.db.run(
    'INSERT INTO documents (id,business_id,uploaded_by,filename,state,created_at) VALUES (?,?,?,?,?,?)',
    ['doc-a', a.business, a.user, 'alpha-lease.pdf', 'COMPLETE', T]);

  const c = it.client();
  await c.post('/login', { email: 'a@example.test', password: 'correct horse battery' });
  await c.req('/portal/documents/doc-a/download');
  await c.req('/portal/documents/doc-b/download').catch(() => undefined);

  const rows = it.app.db.all<{ outcome: string; object_id: string; actor_id: string; at: string }>(
    "SELECT outcome, object_id, actor_id, at FROM audit_log WHERE kind = 'DOCUMENT_ACCESSED' ORDER BY seq",
  );
  assert.equal(rows.length, 2, 'both the allowed serve and the refused one are recorded');
  assert.deepEqual(rows.map((r) => r.outcome), ['ALLOWED', 'REFUSED']);
  for (const r of rows) {
    assert.equal(r.actor_id, 'user-a', 'who');
    assert.ok(r.object_id.length > 0, 'what');
    assert.ok(r.at.length > 0, 'when');
  }
});

/* ================================================================== *
 * 3. THE UPLOAD HANDLER — ran, unmodified, through its real ports
 * ================================================================== */

test('the upload handler discharges the receipt contract end to end', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  assertContractCovered();

  it.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  it.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u', 'u@example.test', 'u@example.test', 'U', 'CLIENT', 'x', T, T, 'bz']);

  const deps = { db: it.app.db, store: it.store, now: it.app.now, actor: 'u' };
  const b = await beginUpload(deps, {
    business_id: 'bz', uploaded_by: 'u', filename: 'lease.pdf', declared_type: 'LEASE',
  });
  const token = new URL('http://x' + b.url).searchParams.get('token') ?? '';
  // A REAL PDF, NOT A STRING THAT STARTS "%PDF". Until Phase 113c this was the
  // latter: bytes that pass the magic-number sniffer and are not a PDF, which
  // the old text-only extractor read as plain text. Under the real extractor
  // that would be an unreadable PDF and the strip would run over the marker —
  // the test would still pass and would have stopped meaning anything.
  const bytes = new Uint8Array(pdfOf([[
    'DEMISE AND TERM:', 'Landlord: Acme Holdings Ltd', 'Annual rent 25000',
  ]], { compress: true }));
  const w = await acceptClientBytes(deps, { doc_id: b.doc_id, token, bytes });
  assert.equal(w.ok, true);

  const done = await finishUpload(deps, b.job, w.ok ? w.written_at : T);
  assert.equal(done.job.state, 'DISCHARGED');
  assert.equal(done.discharged, true, 'the unredacted original is gone, with evidence');

  const steps = eventsFor(it.app.db, b.doc_id).map((e) => e.contract_step);
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7], 'every step, in the contract’s order');

  // G1: the raw file was NOT promoted, because FAIL_CLOSED_SETTINGS is used.
  const write = eventsFor(it.app.db, b.doc_id).find((e) => e.contract_step === 6);
  assert.equal((write?.detail as { raw_file_promoted?: boolean }).raw_file_promoted, false);

  // G2: the quarantine object is really gone from the store.
  await assert.rejects(() => it.store.get(quarantineKeyFor(b.doc_id)),
    'the quarantine object must not still be readable');

  // The row a screen renders says the same thing.
  const row = it.app.db.get<{ strip_recorded_at: string | null; quarantine_discharged_at: string | null }>(
    'SELECT strip_recorded_at, quarantine_discharged_at FROM documents WHERE id = ?', [b.doc_id]);
  assert.ok(row?.strip_recorded_at, 'the strip is recorded as a fact');
  assert.ok(row?.quarantine_discharged_at, 'so is the deletion');
});

test('an unclassifiable upload is refused AND its quarantine object is still deleted', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  it.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  it.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
      'VALUES (?,?,?,?,?,?,?,?,?)',
    ['u', 'u@example.test', 'u@example.test', 'U', 'CLIENT', 'x', T, T, 'bz']);

  const deps = { db: it.app.db, store: it.store, now: it.app.now, actor: 'u' };
  const b = await beginUpload(deps, {
    business_id: 'bz', uploaded_by: 'u', filename: 'mystery.pdf', declared_type: null,
  });
  const token = new URL('http://x' + b.url).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(deps, {
    doc_id: b.doc_id, token, bytes: new Uint8Array(Buffer.from('%PDF-1.4\nsomething\n')),
  });
  assert.equal(w.ok, true, 'the bytes are a valid PDF, so the format check passes');

  const done = await finishUpload(deps, b.job, w.ok ? w.written_at : T);
  assert.equal(done.error?.code, 'E_UNRECOGNISED_DOC_TYPE');
  // G2 ON THE FAILURE PATH. A refused upload is not a reason to keep the file.
  await assert.rejects(() => it.store.get(quarantineKeyFor(b.doc_id)),
    'an upload nobody could classify still has its original deleted');
});

/* ================================================================== *
 * 4. the funnel, the vocabulary, the letter, and output escaping
 * ================================================================== */

test('the six screens are CB_FUNNEL’s, in CB_FUNNEL’s order', () => {
  assert.deepEqual([...SCREEN_IDS], [...(FUNNEL.SCREENS as string[])]);
  for (const id of SCREEN_IDS) assert.ok(SCREENS[id].heading.length > 0);
});

test('an unanswered fact stays unanswered — it never becomes a value (N4)', () => {
  const s = FUNNEL.blankState() as Record<string, unknown>;
  const rows = answerRows(s as never);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.notEqual(r.state, 'ANSWERED', 'a blank funnel has answered nothing');
    assert.equal(r.value, null, 'and carries no values');
  }
  // "I don't know" is its own state, not a blank and not a value.
  const dk = FUNNEL.blankState() as Record<string, unknown>;
  dk.own_prior_claim = 'not sure';
  const one = answerRows(dk as never).find((r) => r.question_id === 'Q1');
  assert.equal(one?.state, 'DONT_KNOW');
  assert.equal(one?.value, null);
});

test('the stage vocabulary maps stored keys onto the business flow’s own words', () => {
  assert.equal(STAGES.length, 6);
  for (const s of STAGES) {
    assert.ok(s.label.length > 0);
    assert.ok(s.step >= 1 && s.step <= 11, 'every stage names a business-flow step');
  }
  // Engagement is signed BEFORE the research runs. If this ever inverts, the
  // portal would draw the two-tier gate the wrong way round.
  assert.ok(stageIndex('ENGAGEMENT_SIGNED') < stageIndex('RESEARCH_PART_RUN'));

  // AN UNKNOWN STAGE IS NOT STAGE ZERO.
  const unknown = progressFor('SOMETHING_ELSE');
  assert.equal(unknown.known, false);
  assert.deepEqual(unknown.steps, []);
});

test('the engagement letter is read from the docx and its open terms are shown, not filled', () => {
  assert.ok(letterExists(), 'the letter exists where the brief says it does');
  const L = loadLetter({ clientName: 'Test Care Ltd' });
  assert.ok(L.paragraphs.length > 40);
  assert.ok(L.openTerms.length >= 5, 'the unresolved terms are found, not hard-coded');

  const where = L.openTerms.map((t) => t.clause).join(' ');
  assert.match(where, /clause 4 — Fees/, 'the fee basis and abort fee');
  assert.match(where, /clause 5 — Break Clause/, 'the break fee');

  // NO NUMBER IS INVENTED. Every open term still reads as a placeholder.
  for (const t of L.openTerms) assert.match(t.text, /^\[/);
  // The specimen client name is substituted; the specimen figure is flagged.
  assert.ok(!L.paragraphs.some((p) => p.text.includes('Quenmoor Care Group')));
  assert.ok(L.specimens.some((s) => s.includes('27,788')));
  // THE SPECIMEN NUMBER IS INVENTED since Phase 153 (until then it was a real, dissolved company's,
  // 09183422). No record number: it stays and is FLAGGED. And the suffix is not doubled.
  assert.ok(L.specimens.some((s) => s.includes('98604417')), 'an absent company number is flagged, not passed off');
  assert.ok(!L.paragraphs.some((p) => p.text.includes('Ltd Ltd')), 'the specimen suffix is not doubled');
});

test('the engagement letter replaces the specimen company NUMBER as well as the name', () => {
  const N = loadLetter({ clientName: 'Test Care Ltd', companyNumber: '12345678' });
  assert.ok(!N.paragraphs.some((p) => p.text.includes('98604417')), 'the specimen number is gone');
  assert.ok(N.paragraphs.some((p) => p.text.includes('company number 12345678')), 'the record number is rendered');
  assert.ok(N.paragraphs.some((p) => p.text.includes('Test Care Ltd (Company No. 12345678)')));
  assert.ok(!N.specimens.some((s) => s.includes('98604417')));
  // Blank is absent (N4): the specimen is flagged, never silently kept as the client's.
  const B = loadLetter({ clientName: 'Test Care Ltd', companyNumber: '   ' });
  assert.ok(B.specimens.some((s) => s.includes('98604417')));
});

test('output is escaped, and the gates are reported shut', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
  const evil = '"><img src=x onerror=alert(1)>';
  assert.doesNotMatch(h`<p>${evil}</p>`.html, /<img/, 'an interpolated value cannot introduce a tag');

  const g = registryGate();
  assert.equal(g.enabled, false, 'the free register gate is shut and this build cannot open it');
  assert.ok(g.requires.includes('privacy notice'));
});

test('CB_BOOKING is the only booking model, and video is still gone', () => {
  const ids = BOOKING.CHANNELS.map((c) => c.id);
  assert.deepEqual(ids, ['phone', 'sms_whatsapp', 'email']);
  assert.ok(!ids.includes('video') && !ids.includes('virtual'),
    'video was removed on 3 September 2026 and must not come back through a schema');
  // A channel whose processor is undeclared must not render.
  const renderable = BOOKING.renderableChannels([]).map((c) => c.id);
  assert.ok(!renderable.includes('sms_whatsapp'), 'WhatsApp is a processor and is not declared');
});

test('the bookings table accepts only CB_BOOKING’s channels, and only phone books a moment', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  it.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    ['bz', 'X Ltd', 'dental', 'ASSESSMENT_SUBMITTED', T]);

  assert.throws(() => it.app.db.run(
    'INSERT INTO bookings (id,business_id,channel,entry_point,created_at) VALUES (?,?,?,?,?)',
    ['bk1', 'bz', 'virtual', 'funnel_close', T]), /CHECK|constraint/i,
    'the vocabulary migration 002 invented is unstorable');

  assert.throws(() => it.app.db.run(
    'INSERT INTO bookings (id,business_id,channel,entry_point,starts_at,ends_at,created_at) VALUES (?,?,?,?,?,?,?)',
    ['bk2', 'bz', 'email', 'funnel_close', T, T, T]), /CHECK|constraint/i,
    'a channel that cannot hold a time may not carry one');
});

test('a client’s stored file is written with no execute bit', async (t) => {
  const it = await boot();
  t.after(() => it.close());
  await it.store.putText('documents/probe.json', '{}');
  const st = statSync(join(it.docsRoot, 'documents/probe.json'));
  assert.equal(st.mode & 0o111, 0, 'no execute bit for anyone');
  assert.equal(st.mode & 0o777, FILE_MODE);
});
