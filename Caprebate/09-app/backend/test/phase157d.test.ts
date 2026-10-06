/**
 * PHASE 157d, 6 OCTOBER 2026 — SIGNING FROM AN EMAILED LINK, A SECOND SIGNER, TWO UPLOAD CHECKS AND FOUR DOCUMENT TYPES.
 *
 *   1  a single-use, time-limited link in the letter email opens the letter for signing without a login (off for real
 *      clients; on with ENGAGEMENT_SIGNING_TEST, the test copy only); the certificate records the address it proves
 *   2  staff name who must sign (one or two logins); the letter is signed only when both have; each on the certificate
 *   3  the same file sent twice is kept, and the client is told when they sent it before (F18)
 *   4  a PDF with no end is refused as damaged (F19)
 *   5  the completion statement, accounts, contractor's invoices and plans can be received (F16)
 *
 * Every person, business and file here is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import {
  ENGAGEMENT_SIGNING, ENGAGEMENT_SIGNING_TEST, SIGN_LINK_DAYS, SIGN_WORDS, checkSignature, requiredSigners, setRequiredSigners,
  shownLetter, signByLink, signEngagement, signLinkFor, sha256Hex,
} from '../src/web/signing.ts';
import { TEST_LETTER_PATH } from '../src/web/letter.ts';
import { letterState, letterSteps, sendEngagementLetter, signedCopy } from '../src/web/engagement-send.ts';
import { assertSignedEngagement } from '../src/web/research.ts';
import { pdfLooksComplete } from '../src/web/upload-handler-port.ts';
import { acceptClientBytes, DAMAGED_PDF } from '../src/web/uploads.ts';
import { receiveFile } from '../src/web/client-files-pages.ts';
import * as D from '../src/web/documents.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { classifyHeading, NEVER_TO_MODEL } from '../../../04-phase-work/phase3/caprebate-document-pipeline.ts';
import { receiptPolicyFor } from '../../../04-phase-work/phase3/caprebate-client-doc-ingestion.ts';
import { actor, testApp } from './helpers.ts';
import type { Actor } from '../src/authz.ts';

type TestApp = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-10-06T09:00:00.000Z';
const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex');
const PDF = (body = 'invented') => new Uint8Array(Buffer.from(`%PDF-1.4\n${body}\n%%EOF\n`));

function world0(a: TestApp) {
  a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-SALES','sales@example.invalid','sales@example.invalid','Sales Person','SALES','x',?,?,NULL)", [T0, T0]);
  const biz = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Partners Surgery', 'gp', 'ENGAGEMENT', T0, 'WEBSITE']);
  const login = (id: string, name: string) => {
    a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,'CLIENT','x',?,?,?)",
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, T0, T0, biz]);
    const session = randomUUID();
    a.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
      [session, id, randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
    return { actor: { id, role: 'CLIENT', business_id: biz, disabled: false } as Actor, session };
  };
  return { biz, login };
}
const deps = (a: TestApp) => ({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID });
const SALES = actor('SALES', 'u-SALES');
const sha = () => shownLetter({ name: 'Invented Partners Surgery' }, TEST_LETTER_PATH).sha256;
const input = (name: string) => ({ full_name: name, role: 'Partner', authorised: true, letter_sha256: sha(), typed_as_signature: true });
const OPTS = { cfg: ENGAGEMENT_SIGNING_TEST, letterPath: TEST_LETTER_PATH };

/* ================================================================== *
 * 2 · A SECOND SIGNER
 * ================================================================== */

describe('2 · staff name who must sign; the letter is signed only when both have', () => {
  async function two() {
    const a = await testApp();
    const w = world0(a);
    const ada = w.login('u-ada', 'Ada Partner');
    const bea = w.login('u-bea', 'Bea Partner');
    const cal = w.login('u-cal', 'Cal Practice Manager');
    sendEngagementLetter(deps(a), SALES, w.biz);
    return { a, ...w, ada, bea, cal };
  }

  test('naming: one or two of the business’s own client logins; refused for three, a stranger, or once anyone has signed', async () => {
    const x = await two();
    try {
      assert.match((setRequiredSigners(deps(x.a), SALES, x.biz, ['u-ada', 'u-bea', 'u-cal']) as { why: string }).why, /At most two/);
      assert.match((setRequiredSigners(deps(x.a), SALES, x.biz, ['u-SALES']) as { why: string }).why, /login for this client/);
      assert.throws(() => setRequiredSigners(deps(x.a), actor('SURVEYING', 'u-s'), x.biz, ['u-ada']));
      assert.deepEqual(setRequiredSigners(deps(x.a), SALES, x.biz, ['u-ada', 'u-bea']), { ok: true });
      assert.deepEqual(requiredSigners(x.a.db, letterIdOf(x.a, x.biz)).map((r) => [r.user_id, r.seq]), [['u-ada', 1], ['u-bea', 2]]);
      assert.equal(x.a.audit.entries().filter((e) => e.kind === 'ENGAGEMENT_SIGNERS_SET').length, 1);
      assert.equal(signEngagement(deps(x.a), x.ada.actor, x.biz, input('Ada Partner'), { ip: '203.0.113.9', session_id: x.ada.session }, OPTS).ok, true);
      assert.match((setRequiredSigners(deps(x.a), SALES, x.biz, ['u-cal']) as { why: string }).why, /already signed/);
    } finally { x.a.close(); }
  });

  test('ONE OF TWO IS NOT SIGNED: the letter waits, the gate stays shut; a login not named is refused; nobody signs twice', async () => {
    const x = await two();
    try {
      setRequiredSigners(deps(x.a), SALES, x.biz, ['u-ada', 'u-bea']);
      const first = signEngagement(deps(x.a), x.ada.actor, x.biz, input('Ada Partner'), { ip: '203.0.113.9', session_id: x.ada.session }, OPTS);
      assert.ok(first.ok && first.complete === false);
      assert.notEqual(letterState(x.a.db, x.biz).state, 'SIGNED');
      assert.equal(assertSignedEngagement(x.a.db, x.biz).signed, false);
      assert.match(checkSignature(x.a.db, letterIdOf(x.a, x.biz)).ok ? '' : (checkSignature(x.a.db, letterIdOf(x.a, x.biz)) as { why: string }).why, /waiting for another signature/);
      assert.match(letterSteps(letterState(x.a.db, x.biz)).join(' '), /To be signed by Ada Partner and Bea Partner\. Signed by Ada Partner .*Waiting for the other signature\./);
      assert.deepEqual(signEngagement(deps(x.a), x.cal.actor, x.biz, input('Cal Manager'), { ip: '203.0.113.9', session_id: x.cal.session }, OPTS), { ok: false, why: SIGN_WORDS.not_named });
      assert.deepEqual(signEngagement(deps(x.a), x.ada.actor, x.biz, input('Ada Partner'), { ip: '203.0.113.9', session_id: x.ada.session }, OPTS), { ok: false, why: SIGN_WORDS.you_signed });
    } finally { x.a.close(); }
  });

  test('BOTH SIGNED: the letter is signed, both records check out, and the copy carries both signatures on one certificate', async () => {
    const x = await two();
    try {
      setRequiredSigners(deps(x.a), SALES, x.biz, ['u-ada', 'u-bea']);
      signEngagement(deps(x.a), x.ada.actor, x.biz, input('Ada Partner'), { ip: '203.0.113.9', session_id: x.ada.session }, OPTS);
      const second = signEngagement(deps(x.a), x.bea.actor, x.biz, input('Bea Partner'), { ip: '203.0.113.10', session_id: x.bea.session }, OPTS);
      assert.ok(second.ok && second.complete === true);
      assert.equal(letterState(x.a.db, x.biz).state, 'SIGNED');
      assert.equal(assertSignedEngagement(x.a.db, x.biz).signed, true);
      const rows = x.a.db.all<{ signer_seq: number; record_version: number; user_id: string }>('SELECT signer_seq, record_version, user_id FROM engagement_signatures ORDER BY signer_seq');
      assert.deepEqual(rows.map((r) => [r.signer_seq, r.record_version, r.user_id]), [[1, 3, 'u-ada'], [2, 3, 'u-bea']]);
      const copy = signedCopy(x.a.db, SALES, x.biz);
      assert.ok(copy !== null);
      const pdf = Buffer.from(copy.pdf).toString('latin1');
      for (const w of ['Signer 1', 'Signer 2', 'Name: Ada Partner', 'Name: Bea Partner', 'Signatures: 2 of 2. The letter is signed.']) assert.ok(pdf.includes(hexOf(w)), w);
    } finally { x.a.close(); }
  });

  test('NOBODY NAMED: any one client login signs and the letter is signed, as before', async () => {
    const x = await two();
    try {
      const r = signEngagement(deps(x.a), x.cal.actor, x.biz, input('Cal Manager'), { ip: '203.0.113.9', session_id: x.cal.session }, OPTS);
      assert.ok(r.ok && r.complete);
      assert.equal(assertSignedEngagement(x.a.db, x.biz).signed, true);
    } finally { x.a.close(); }
  });
});

function letterIdOf(a: TestApp, biz: string): string {
  return a.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [biz])!.id;
}

/* ================================================================== *
 * 1 · SIGNING FROM THE EMAILED LINK
 * ================================================================== */

describe('1 · signing from a link in the letter email', () => {
  test('OFF FOR REAL CLIENTS: the shipped setting has no links; sending makes none and the email has none', async () => {
    assert.equal(ENGAGEMENT_SIGNING.links, undefined);
    assert.equal(ENGAGEMENT_SIGNING_TEST.links, true);
    assert.equal(SIGN_LINK_DAYS, 7);
    const a = await testApp();
    try {
      const w = world0(a); w.login('u-ada', 'Ada Partner');
      sendEngagementLetter(deps(a), SALES, w.biz);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_sign_links')?.n, 0);
      assert.doesNotMatch(a.db.get<{ body: string }>('SELECT body FROM outbox')!.body, /\/sign\//);
      assert.deepEqual(signByLink(deps(a), 'a'.repeat(64), input('Ada Partner'), '203.0.113.9', { letterPath: TEST_LETTER_PATH }), { ok: false, why: SIGN_WORDS.links_off });
    } finally { a.close(); }
  });

  test('ON FOR TESTING: each named signer is emailed their own link; only its fingerprint is kept; it signs once, as EMAIL_LINK', async () => {
    const a = await testApp();
    try {
      const w = world0(a); w.login('u-ada', 'Ada Partner'); w.login('u-cal', 'Cal Manager');
      sendEngagementLetter({ ...deps(a), signing: ENGAGEMENT_SIGNING_TEST, origin: 'https://test.example.invalid' }, SALES, w.biz);
      const mails = a.db.all<{ to_email: string; body: string }>('SELECT to_email, body FROM outbox ORDER BY rowid');
      assert.equal(mails.length, 2);
      const tokenOf = (m: { body: string }) => /https:\/\/test\.example\.invalid\/sign\/([0-9a-f]{64})/.exec(m.body)?.[1] ?? '';
      const token = tokenOf(mails.find((m) => m.to_email === 'u-ada@example.invalid')!);
      assert.equal(token.length, 64);
      assert.match(mails[0]!.body, /It works once, for 7 days/);
      const stored = a.db.all<{ token_sha256: string; sent_to: string }>('SELECT token_sha256, sent_to FROM engagement_sign_links ORDER BY sent_to');
      assert.equal(stored.length, 2);
      assert.ok(stored.some((s) => s.token_sha256 === sha256Hex(token)));
      assert.equal(JSON.stringify(stored).includes(token), false, 'the link itself is stored');
      assert.equal(signLinkFor(a.db, token, a.now())?.user_id, 'u-ada');
      const r = signByLink(deps(a), token, input('Ada Partner'), '203.0.113.9', OPTS);
      assert.ok(r.ok && r.complete, r.ok ? '' : r.why);
      const row = a.db.get<{ origin: string; session_id: string | null; link_id: string | null; signer_email: string; pdf: Uint8Array }>('SELECT origin, session_id, link_id, signer_email, pdf FROM engagement_signatures')!;
      assert.deepEqual([row.origin, row.session_id, row.signer_email], ['EMAIL_LINK', null, 'u-ada@example.invalid']);
      assert.ok(row.link_id !== null);
      assert.ok(Buffer.from(row.pdf).toString('latin1').includes(hexOf('Signed from the link we emailed to: u-ada@example.invalid.')));
      assert.ok(a.db.get<{ used_at: string | null }>('SELECT used_at FROM engagement_sign_links WHERE id = ?', [row.link_id])?.used_at);
      assert.equal(checkSignature(a.db, letterIdOf(a, w.biz)).ok, true);
      assert.equal(signLinkFor(a.db, token, a.now()), null, 'a used link still works');
      assert.deepEqual(signByLink(deps(a), token, input('Ada Partner'), '203.0.113.9', OPTS), { ok: false, why: SIGN_WORDS.link });
    } finally { a.close(); }
  });

  test('a link out of date, unknown, or for a login since disabled does not work; nothing about a link changes but its use', async () => {
    const a = await testApp();
    try {
      const w = world0(a); w.login('u-ada', 'Ada Partner');
      sendEngagementLetter({ ...deps(a), signing: ENGAGEMENT_SIGNING_TEST }, SALES, w.biz);
      const token = /\/sign\/([0-9a-f]{64})/.exec(a.db.get<{ body: string }>('SELECT body FROM outbox')!.body)![1]!;
      const later = new Date(Date.parse(a.now()) + 8 * 86_400_000).toISOString();
      assert.equal(signLinkFor(a.db, token, later), null);
      assert.equal(signLinkFor(a.db, 'f'.repeat(64), a.now()), null);
      assert.equal(signLinkFor(a.db, 'not-a-token', a.now()), null);
      assert.throws(() => a.db.run("UPDATE engagement_sign_links SET expires_at = '2099-01-01T00:00:00.000Z'"), /used once/);
      assert.throws(() => a.db.run('DELETE FROM engagement_sign_links'), /never deleted/);
      a.db.run("UPDATE users SET disabled_at = ? WHERE id = 'u-ada'", [T0]);
      assert.equal(signLinkFor(a.db, token, a.now()), null);
    } finally { a.close(); }
  });

  test('THE PUBLIC PAGE: opening the link shows the letter and the pad and uses nothing; signing there uses it; again, it is gone', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-')), testLetter: true, testSigning: true, publicOrigin: 'https://test.example.invalid' });
    try {
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const a = made.app;
      const w = world0(a as never); w.login('u-ada', 'Ada Partner');
      sendEngagementLetter({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID, signing: ENGAGEMENT_SIGNING_TEST }, SALES, w.biz);
      const token = /\/sign\/([0-9a-f]{64})/.exec(a.db.get<{ body: string }>('SELECT body FROM outbox')!.body)![1]!;
      const page = await fetch(`${base}/sign/${token}`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, new RegExp(`action="/sign/${token}"`));
      assert.match(html, /data-sig-pad/);
      assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
      assert.equal(a.db.get<{ u: string | null }>('SELECT used_at AS u FROM engagement_sign_links')?.u, null, 'opening the link used it');
      assert.equal(a.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'VIEWED');
      const letter_sha256 = /name="letter_sha256" value="([0-9a-f]{64})"/.exec(html)?.[1] ?? '';
      const post = await fetch(`${base}/sign/${token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ full_name: 'Ada Partner', signer_role: 'Partner', authorised: 'on', letter_sha256, typed_as_signature: 'on' }).toString() });
      assert.equal(post.status, 200, (await post.clone().text()).slice(0, 400));
      assert.match(await post.text(), /the letter is signed/);
      assert.equal(a.db.get<{ s: string }>('SELECT letter_state AS s FROM engagements')?.s, 'SIGNED');
      const again = await fetch(`${base}/sign/${token}`);
      assert.equal(again.status, 404);
      assert.match(await again.text(), /This link does not work/);
    } finally { made.close(); }
  });

  test('on a copy without links switched on, the page says so and signs nothing', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-')), testLetter: true });
    try {
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const addr = made.server.address();
      const r = await fetch(`http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}/sign/${'a'.repeat(64)}`);
      assert.equal(r.status, 404);
      assert.match(await r.text(), /Signing from a link in an email is not switched on yet/);
    } finally { made.close(); }
  });
});

/* ================================================================== *
 * 3 and 4 · DUPLICATES, AND A DAMAGED PDF
 * ================================================================== */

describe('3, 4 · the same file twice, and a PDF that stops part-way', () => {
  test('F19: a PDF with no end-of-file marker in its last 1,024 bytes is incomplete; one with it, and trailing spaces, is not', () => {
    assert.equal(pdfLooksComplete(PDF()), true);
    assert.equal(pdfLooksComplete(new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog'))), false);
    assert.equal(pdfLooksComplete(new Uint8Array(Buffer.from(`%PDF-1.4\n%%EOF\n${' '.repeat(2000)}`))), false);
    assert.equal(pdfLooksComplete(new Uint8Array(Buffer.from('%PDF-1.4\nbody\n%%EOF\r\n\r\n   '))), true);
  });

  async function uploadWorld() {
    // The real clock: an upload link's expiry is checked against it.
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-store-')) });
    const a = made.app as unknown as TestApp; // its close() closes the database; the server never listened
    const w = world0(a);
    const client = w.login('u-ada', 'Ada Partner').actor;
    const store = made.store;
    const start = async (business = w.biz, who = client) => {
      const s = await D.startDocumentUpload({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID, store }, who, {
        business_id: business, type_code: 'LEASE', logical_document_id: null, request_id: null, claim_id: null,
      });
      assert.ok(s.ok, s.ok ? '' : s.why);
      return { doc_id: s.doc_id, token: new URL(s.url, 'http://x').searchParams.get('token') ?? '' };
    };
    const udeps = { db: a.db, store, now: a.now, actor: client.id, newId: randomUUID, audit: a.audit };
    return { a, w, client, store, start, udeps };
  }

  test('F19: acceptClientBytes refuses a damaged PDF before writing it, in plain words', async () => {
    const x = await uploadWorld();
    try {
      const s = await x.start();
      const r = await acceptClientBytes(x.udeps, { ...s, bytes: new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<< cut off')) });
      assert.deepEqual(r, { ok: false, status: 400, why: DAMAGED_PDF });
      assert.match(DAMAGED_PDF, /damaged or incomplete/);
    } finally { x.a.close(); }
  });

  test('F18: the same bytes sent twice by one business are kept both times, and the second says when the first came; another business’s same bytes do not count', async () => {
    const x = await uploadWorld();
    try {
      const bytes = PDF('the same lease');
      const one = await acceptClientBytes(x.udeps, { ...(await x.start()), bytes });
      assert.ok(one.ok);
      assert.equal(one.sent_before, null);
      const two = await acceptClientBytes(x.udeps, { ...(await x.start()), bytes });
      assert.ok(two.ok);
      assert.ok(two.sent_before !== null, 'the second copy was not recognised');
      assert.equal(x.a.db.get<{ n: number }>('SELECT COUNT(DISTINCT content_sha256) AS n FROM documents WHERE content_sha256 IS NOT NULL')?.n, 1);
      assert.equal(x.a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE content_sha256 IS NOT NULL')?.n, 2, 'a copy was dropped');
      const other = randomUUID();
      x.a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [other, 'Another Invented Ltd', 'dental', 'ENGAGEMENT', T0, 'WEBSITE']);
      x.a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-oth','oth@example.invalid','oth@example.invalid','Oth','CLIENT','x',?,?,?)", [T0, T0, other]);
      const oth = actor('CLIENT', 'u-oth', other);
      const three = await acceptClientBytes({ ...x.udeps, actor: 'u-oth' }, { ...(await x.start(other, oth)), bytes });
      assert.ok(three.ok);
      assert.equal(three.sent_before, null);
      const d = PDF('a different file');
      const four = await acceptClientBytes(x.udeps, { ...(await x.start()), bytes: d });
      assert.ok(four.ok && four.sent_before === null);
    } finally { x.a.close(); }
  });

  test('F18 on the portal: the second send says "You sent us this same file on …"', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-web-')) });
    try {
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const a = made.app;
      const biz = randomUUID();
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Upload Ltd', 'dental', 'ENGAGEMENT', T0, 'WEBSITE']);
      a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-up','up@example.invalid','up@example.invalid','Up','CLIENT',?,?,?,?)",
        [await a.hasher.hash('Invented-Pass-157d'), T0, T0, biz]);
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'up@example.invalid', password: 'Invented-Pass-157d' }).toString() });
      const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const send = async () => {
        const fd = new FormData();
        fd.set('type_code', 'LEASE');
        fd.set('file', new Blob([PDF('DEMISE AND TERM: the same lease twice')], { type: 'application/pdf' }), 'lease.pdf');
        return fetch(`${base}/portal/documents`, { method: 'POST', redirect: 'manual', headers: { cookie }, body: fd });
      };
      const first = await send();
      assert.equal(first.headers.get('location'), '/portal?sent=1#documents');
      const second = await send();
      const to = second.headers.get('location') ?? '';
      assert.match(to, /^\/portal\?sent=1&again=\d{4}-\d{2}-\d{2}#documents$/);
      const page = await (await fetch(base + to.replace(/#.*$/, ''), { headers: { cookie } })).text();
      assert.match(page, /You sent us this same file on \d{1,2} \w+ \d{4}\. We have kept both/);
    } finally { made.close(); }
  });
});

/* ================================================================== *
 * 5 · FOUR DOCUMENT TYPES
 * ================================================================== */

describe('5 · the completion statement, accounts, contractor’s invoices and plans can be received (F16)', () => {
  const FOUR = ['COMPLETION_STATEMENT', 'ACCOUNTS', 'CONTRACTOR_INVOICE', 'PLANS'] as const;

  test('each is bound to the receipt policy of its own name, with RET-7; the completion statement carries a value and only the claim team reads it', async () => {
    const a = await testApp();
    try {
      const rows = a.db.all<{ code: string; handler_type: string | null; retention_ref: string | null; carries_value: number; readers: string }>(
        "SELECT code, handler_type, retention_ref, carries_value, readers FROM document_types WHERE code IN ('COMPLETION_STATEMENT','ACCOUNTS','CONTRACTOR_INVOICE','PLANS') ORDER BY code");
      assert.deepEqual(rows.map((r) => [r.code, r.handler_type, r.retention_ref]), [...FOUR].sort().map((c) => [c, c, 'RET-7']));
      const cs = rows.find((r) => r.code === 'COMPLETION_STATEMENT')!;
      assert.deepEqual([cs.carries_value, cs.readers], [1, 'CLAIM_TEAM']);
      const codes = D.receivableTypes(a.db).map((t) => t.code);
      for (const c of FOUR) assert.ok(codes.includes(c), c);
      assert.throws(() => a.db.run("UPDATE document_types SET handler_type = NULL WHERE code = 'PLANS'"), /fixed/);
      assert.throws(() => a.db.run("DELETE FROM document_types WHERE code = 'PLANS'"), /never deleted/);
      assert.throws(() => a.db.run("UPDATE document_types SET carries_value = 0 WHERE code = 'COMPLETION_STATEMENT'"), /never marked/);
      assert.equal(a.db.all('SELECT * FROM pragma_foreign_key_check').length, 0);
    } finally { a.close(); }
  });

  test('THE STRIP: the figures’ headings are kept; the parties, the bank details, the directors’ report and the title block are not', () => {
    const kept: [string, string][] = [
      ['COMPLETION_STATEMENT', 'Completion statement'], ['COMPLETION_STATEMENT', 'Apportionment of the purchase price'],
      ['COMPLETION_STATEMENT', 'Stamp duty land tax'], ['ACCOUNTS', 'Balance sheet'], ['ACCOUNTS', 'Tangible fixed assets'],
      ['ACCOUNTS', 'Profit and loss account'], ['CONTRACTOR_INVOICE', 'Invoice'], ['CONTRACTOR_INVOICE', 'Application for payment No. 3'],
      ['PLANS', 'Schedule of accommodation'], ['PLANS', 'Ground floor plan'],
    ];
    for (const [type, heading] of kept) {
      const kind = classifyHeading(heading);
      assert.ok(receiptPolicyFor(type as never).retained_segments.includes(kind as never), `${type}: "${heading}" (${kind}) is not kept`);
    }
    for (const heading of ['Bank details for completion monies', "Directors' report", 'Drawn by', 'Related party transactions', 'Seller\'s solicitors']) {
      const kind = classifyHeading(heading);
      for (const type of FOUR) assert.equal(receiptPolicyFor(type as never).retained_segments.includes(kind as never), false, `${type} keeps "${heading}" (${kind})`);
    }
    for (const type of FOUR) assert.equal(receiptPolicyFor(type as never).retained_segments.some((k) => NEVER_TO_MODEL.includes(k)), false);
  });

  test('a client can send each of the four through the one handler (the request and the upload no longer refused)', async () => {
    const a = await testApp();
    try {
      const w = world0(a);
      const client = w.login('u-ada', 'Ada Partner').actor;
      const store = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-157d-four-')) });
      for (const code of FOUR) {
        const s = await D.startDocumentUpload({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID, store }, client, {
          business_id: w.biz, type_code: code, logical_document_id: null, request_id: null, claim_id: null,
        });
        assert.ok(s.ok, `${code}: ${s.ok ? '' : s.why}`);
      }
    } finally { a.close(); }
  });

  test('staff Files: a member of staff’s upload of a damaged PDF is refused with the same words', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-rf-')) });
    try {
      const a = made.app;
      const w = world0(a as never);
      a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-ADMIN','admin@example.invalid','admin@example.invalid','Admin','ADMIN','x',?,?,NULL)", [T0, T0]);
      const r = await receiveFile({ app: a, store: made.store, newId: randomUUID }, actor('ADMIN', 'u-ADMIN'),
        { business_id: w.biz, type_code: 'PLANS', logical_document_id: null, request_id: null, claim_id: null }, new Uint8Array(Buffer.from('%PDF-1.4 cut')));
      assert.deepEqual(r, { ok: false, why: 'That PDF is damaged or incomplete: it stops part-way. Save or export it again, then send it.' });
    } finally { made.close(); }
  });
});

/* ================================================================== *
 * MIGRATIONS 097 AND 098
 * ================================================================== */

describe('migrations 097 and 098: what the tables refuse', () => {
  test('a signature through a link needs its link and no session; in the portal, a session and no link; one signature per place', async () => {
    const a = await testApp();
    try {
      const w = world0(a); const ada = w.login('u-ada', 'Ada Partner');
      sendEngagementLetter(deps(a), SALES, w.biz);
      assert.ok(signEngagement(deps(a), ada.actor, w.biz, input('Ada Partner'), { ip: '203.0.113.9', session_id: ada.session }, OPTS).ok);
      const base = a.db.get<Record<string, unknown>>('SELECT * FROM engagement_signatures')!;
      const COLS = ['engagement_id', 'business_id', 'origin', 'user_id', 'session_id', 'signer_name', 'signer_role', 'business_name', 'authority_confirmed',
        'signed_at', 'ip', 'letter_text', 'letter_sha256', 'pdf', 'pdf_sha256', 'record_sha256', 'record_version', 'signer_seq', 'link_id'] as const;
      const insert = (over: Record<string, unknown>) => a.db.run(
        'INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
          'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version, signer_seq, link_id) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), ...COLS.map((c) => (c in over ? over[c] : base[c]))] as never);
      const fresh = { record_sha256: 'e'.repeat(64), signer_seq: 2 };
      assert.throws(() => insert({ ...fresh, signer_seq: 1 }), /UNIQUE/);
      assert.throws(() => insert({ ...fresh, signer_seq: 3 }), /CHECK/);
      assert.throws(() => insert({ ...fresh, origin: 'EMAIL_LINK' }), /CHECK/, 'a link signature with a session and no link');
      assert.throws(() => insert({ ...fresh, session_id: null }), /CHECK/, 'a portal signature with no session');
      assert.throws(() => a.db.run('UPDATE engagement_signatures SET ip = ?', ['198.51.100.1']), /never edited/);
      assert.throws(() => a.db.run('DELETE FROM engagement_signatures'), /never deleted/);
      const doc = randomUUID();
      a.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [doc, w.biz, 'u-ada', 'x.pdf', 'STORED', T0]);
      assert.throws(() => a.db.run('UPDATE documents SET content_sha256 = ? WHERE id = ?', ['not hex', doc]), /CHECK/);
      a.db.run('UPDATE documents SET content_sha256 = ? WHERE id = ?', ['a'.repeat(64), doc]);
    } finally { a.close(); }
  });
});

describe('2 · on the client page: "Who must sign"', () => {
  test('with two or more client logins and a letter, Sales sees the form, saves two names, and the section says so', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157d-ui-')) });
    try {
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const a = made.app;
      const hash = await a.hasher.hash('Invented-Pass-157d');
      const w = world0(a as never);
      a.db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, 'u-SALES']);
      w.login('u-ada', 'Ada Partner'); w.login('u-bea', 'Bea Partner');
      sendEngagementLetter({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID }, SALES, w.biz);
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'sales@example.invalid', password: 'Invented-Pass-157d' }).toString() });
      const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const page = await (await fetch(`${base}/staff/clients/${w.biz}?done=letter`, { headers: { cookie } })).text();
      assert.match(page, /<legend>Who must sign<\/legend>/);
      assert.match(page, /name="signer" value="u-ada"/);
      const saved = await fetch(`${base}/staff/clients/${w.biz}/engagement/signers`, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        body: 'signer=u-ada&signer=u-bea' });
      assert.equal(saved.status, 303);
      assert.match(saved.headers.get('location') ?? '', /\?done=letter-signers#letter$/);
      const after = await (await fetch(`${base}/staff/clients/${w.biz}?done=letter-signers`, { headers: { cookie } })).text();
      assert.match(after, /To be signed by Ada Partner and Bea Partner\./);
      assert.match(after, /name="signer" value="u-ada" checked/);
    } finally { made.close(); }
  });
});
