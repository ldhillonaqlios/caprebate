/**
 * PHASE 161m2 (helper B), 11 November 2026: THE LETTER, IDENTITY, DOCUMENT AND MESSAGE EMAILS ON THE BRANDED LAYOUT.
 *
 * The approved words are 05-reports-and-templates/emails/emails.py; the layout is src/integrations/email/email-layout.ts.
 * This file uses only what the code had before the phase (no new export), so each test here is red on the old code by
 * its assertions, not by a missing name:
 *   1 · letter-ready: the approved words, the HTML version, its heading and its button to the letter
 *   2 · letter-signed: the approved words, the signed PDF still attached, and NO "Not sent yet" sentence in it;
 *       staff-letter-signed: one email to the claim's owner, and none when nobody owns the claim or the client
 *   3 · id-check: the link emailed to a director, only when asked; never for a check an Admin sent anyway; refused for
 *       a do-not-contact client. id-check-done: one email on the first pass, never a second, none on a fail
 *   4 · documents-needed: one email for the request staff raise, to the client's address; none for a do-not-contact one
 *   5 · new-message: the client's alert in the approved words, and the staff alert as a back-office email
 * Everything is invented. The timed emails are in branded-emails-b-timed.test.ts.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { createUser } from '../../src/core/users.ts';
import type { Actor } from '../../src/core/authz.ts';
import { secretsFromValues } from '../../src/core/secrets.ts';
import { fixtureTransport, type Fixture } from '../../src/integrations/connectors/http.ts';
import { canonicalJson, IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, type IdentityCheckConfig } from '../../src/integrations/connectors/identity-check.ts';
import { sendEngagementLetter } from '../../src/modules/claims/engagement-send.ts';
import { SIGNING_QUESTION, shownLetter, signEngagement, type EngagementSigning } from '../../src/modules/claims/signing.ts';
import { markViewed } from '../../src/modules/portal/portal.ts';
import { receiveIdentityResult, sendIdentityCheck } from '../../src/modules/compliance/identity-checks.ts';
import { alertWords } from '../../src/modules/clients/index.ts';
import { docxOf } from '../document-fixtures.ts';
import { actor, testApp } from '../helpers.ts';

type TestApp = Awaited<ReturnType<typeof testApp>>;
type Mail = { to_email: string; subject: string; body: string; html_body: string | null; kind: string; id: string };
const ORIGIN = 'https://caprebate.example.invalid';
const T0 = '2026-10-06T09:00:00.000Z';
const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, signature_confirmed: true, question: SIGNING_QUESTION });
const WAVE = JSON.stringify([Array.from({ length: 24 }, (_, i) => [100 + i * 30, 500 + (i % 2 === 0 ? 120 : -120)])]);

const mails = (db: TestApp['db']): Mail[] => db.all<Mail>('SELECT id, to_email, subject, body, html_body, kind FROM outbox ORDER BY rowid');
/** The heading and the button of the branded HTML version. */
const heading = (html: string | null): string => /<h1 [^>]*>([^<]*)<\/h1>/.exec(html ?? '')?.[1] ?? '';
const button = (html: string | null): { href: string; label: string } | null => {
  const m = /<a href="([^"]*)" style="display:inline-block;padding:13px 28px[^"]*">([^<]*)<\/a>/.exec(html ?? '');
  return m === null ? null : { href: (m[1] ?? '').replace(/&amp;/g, '&'), label: m[2] ?? '' };
};

function staff(a: TestApp): void {
  for (const role of ['ADMIN', 'SALES'] as const) {
    a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'fake$x', T0, T0]);
  }
}
function business(a: TestApp, name: string): string {
  const id = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,contact_email) VALUES (?,?,?,?,?,?,?)',
    [id, name, 'gp', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE', `office-${id.slice(0, 6)}@example.invalid`]);
  return id;
}
function clientLogin(a: TestApp, biz: string, email: string): Actor {
  const u = createUser(a.db, a.now, { email, display_name: 'Ivy Inventedperson', role: 'CLIENT', password_hash: 'fake$x', business_id: biz });
  return { id: u.id, role: 'CLIENT', business_id: biz, disabled: false };
}
let refs = 0;
function claim(a: TestApp, biz: string, owner: string | null): string {
  const id = randomUUID();
  a.db.run("INSERT INTO claims (id, claim_ref, business_id, workstream, stage, created_at, updated_at, owner_id) VALUES (?, ?, ?, 'UNKNOWN', 'ENGAGEMENT', ?, ?, ?)",
    [id, `CR-2026-${String(7000 + refs++)}`, biz, T0, T0, owner]);
  return id;
}
const deps = (a: TestApp) => ({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID, origin: ORIGIN });

/* ================================================================== *
 * 1 · LETTER-READY
 * ================================================================== */

describe('161m2 B · 1 · letter-ready: the approved words, on the branded layout', () => {
  test('every client login gets the approved email: subject, heading, the director sentence, and the button to the letter', async () => {
    const a = await testApp();
    try {
      staff(a);
      const biz = business(a, 'Invented Surgery Partnership');
      clientLogin(a, biz, 'ivy@example.invalid');
      const r = sendEngagementLetter(deps(a), actor('SALES', 'u-SALES'), biz);
      assert.equal(r.ok, true);
      const m = mails(a.db);
      assert.equal(m.length, 1);
      const e = m[0]!;
      assert.equal(e.to_email, 'ivy@example.invalid');
      assert.equal(e.subject, 'Your engagement letter from Cap Rebate');
      assert.ok(e.html_body !== null, 'no HTML version');
      assert.equal(heading(e.html_body), 'Your engagement letter is ready');
      assert.deepEqual(button(e.html_body), { href: `${ORIGIN}/portal/letter`, label: 'Read and sign the letter' });
      assert.match(e.body, /^Your engagement letter is ready\n/);
      assert.match(e.body, /Only a director, partner, member or owner of Invented Surgery Partnership should sign it\./);
      assert.match(e.body, /our fee is 3% of the capital allowances identified;/);
      assert.match(e.body, /Read and sign the letter: https:\/\/caprebate\.example\.invalid\/portal\/letter/);
      assert.doesNotMatch(e.body, /—/, 'a long dash');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * 2 · LETTER-SIGNED, AND THE OWNER TOLD
 * ================================================================== */

async function signingWorld(owner: 'claim' | 'business' | 'none') {
  const a = await testApp();
  staff(a);
  const biz = business(a, 'Invented Signing Limited');
  const who = clientLogin(a, biz, 'signer@example.invalid');
  const c = claim(a, biz, owner === 'claim' ? 'u-SALES' : null);
  if (owner === 'business') a.db.run("UPDATE businesses SET owner_id = 'u-ADMIN' WHERE id = ?", [biz]);
  sendEngagementLetter(deps(a), actor('SALES', 'u-SALES'), biz);
  markViewed(a.db, who, biz, a.now);
  const dir = mkdtempSync(join(tmpdir(), 'cb-161m2-letter-'));
  const letterPath = join(dir, 'letter.docx');
  writeFileSync(letterPath, docxOf(['ENGAGEMENT LETTER', '1. Parties', 'This letter is between CAP REBATE LTD and Invented Signing Limited.', '2. Fees', 'Our fee is 3 per cent of the allowances.']));
  const shown = shownLetter({ name: 'Invented Signing Limited' }, letterPath);
  const session = randomUUID();
  a.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, who.id, randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
  const sign = () => signEngagement(deps(a), who, biz,
    { full_name: 'Ivy Inventedperson', role: 'Partner', authorised: true, letter_sha256: shown.sha256, signature_strokes: WAVE },
    { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath });
  return { a, biz, claim: c, sign };
}

describe('161m2 B · 2 · letter-signed and staff-letter-signed', () => {
  test('letter-signed: the approved words and the signed PDF, and never "Not sent yet" in what the client reads', async () => {
    const x = await signingWorld('claim');
    try {
      const before = mails(x.a.db).length;
      const r = x.sign();
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const copy = mails(x.a.db).slice(before).find((m) => m.kind === 'SIGNED_LETTER');
      assert.ok(copy !== undefined, 'no signed copy queued');
      assert.equal(copy.to_email, 'signer@example.invalid');
      assert.equal(copy.subject, 'Your signed engagement letter');
      assert.equal(heading(copy.html_body), 'Thank you for signing');
      assert.deepEqual(button(copy.html_body), { href: `${ORIGIN}/portal`, label: 'Open your portal' });
      assert.match(copy.body, /You signed our engagement letter for Invented Signing Limited on \d{1,2} [A-Z][a-z]{2} 20\d\d\. Your signed copy is attached to this email, and it is also in your portal\./);
      assert.match(copy.body, /We send you a short identity check, done by our provider Didit\./);
      assert.doesNotMatch(`${copy.body} ${copy.html_body ?? ''}`, /Not sent yet|not switched on/, 'the outbox\'s words reached the client\'s email');
      const files = x.a.db.all<{ filename: string; content_type: string }>('SELECT filename, content_type FROM outbox_inline_files WHERE outbox_id = ?', [copy.id]);
      assert.deepEqual(files, [{ filename: 'engagement-letter-signed.pdf', content_type: 'application/pdf' }], 'the signed PDF is still attached');
    } finally { x.a.close(); }
  });

  test('staff-letter-signed: exactly one email, to the claim\'s owner, as a back-office email with the claim\'s link', async () => {
    const x = await signingWorld('claim');
    try {
      const before = mails(x.a.db).length;
      assert.equal(x.sign().ok, true);
      const toStaff = mails(x.a.db).slice(before).filter((m) => m.kind === 'NOTIFICATION');
      assert.equal(toStaff.length, 1);
      const e = toStaff[0]!;
      assert.equal(e.to_email, 'sales@example.invalid');
      assert.equal(e.subject, 'Engagement letter signed: Invented Signing Limited');
      assert.equal(heading(e.html_body), 'Invented Signing Limited has signed');
      assert.match(e.html_body ?? '', /BACK OFFICE/);
      assert.deepEqual(button(e.html_body), { href: `${ORIGIN}/staff/claims/${x.claim}`, label: 'Open the claim' });
      assert.match(e.body, /Send the identity check to a director or owner\./);
      assert.match(e.body, /Sent by the Cap Rebate back office\./);
    } finally { x.a.close(); }
  });

  test('staff-letter-signed: with no claim owner, the client\'s owner, with the client page; with neither, nobody', async () => {
    const y = await signingWorld('business');
    try {
      const before = mails(y.a.db).length;
      assert.equal(y.sign().ok, true);
      const toStaff = mails(y.a.db).slice(before).filter((m) => m.kind === 'NOTIFICATION');
      assert.deepEqual(toStaff.map((m) => m.to_email), ['admin@example.invalid']);
      assert.equal(button(toStaff[0]!.html_body)?.href, `${ORIGIN}/staff/clients/${y.biz}`);
    } finally { y.a.close(); }
    const z = await signingWorld('none');
    try {
      const before = mails(z.a.db).length;
      assert.equal(z.sign().ok, true);
      assert.deepEqual(mails(z.a.db).slice(before).map((m) => m.kind), ['SIGNED_LETTER'], 'an email to staff with nobody to receive it');
    } finally { z.a.close(); }
  });
});

/* ================================================================== *
 * 3 · ID-CHECK AND ID-CHECK-DONE
 * ================================================================== */

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-161m2', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-161m2', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-161m20000001' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true, papers_waived_for_testing: false, waiver_record: null });
const SESSION = 'a1b2c3d4-0000-4000-8000-161m20000001';
const DIDIT_LINK = 'https://verify.didit.me/en/session/INVENTED161M2';
const SESSION_OK: Fixture = { status: 201, body: JSON.stringify({ session_id: SESSION, url: DIDIT_LINK, status: 'Not Started' }) };
const NOW = '2026-11-11T10:00:00.000Z';
const TS = String(Date.parse(NOW) / 1000);
const mac = (s: string) => createHmac('sha256', KEYS.DIDIT_WEBHOOK_SECRET).update(s, 'utf8').digest('hex');

async function idWorld() {
  const a = await testApp();
  const s = await seed(a.db, a.hasher, a.now);
  a.now = () => NOW;
  a.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
  a.secrets = secretsFromValues(KEYS);
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  const biz = s.businesses[0]!.id;
  const person = (full_name: string, job_role: string | null): string => {
    const id = randomUUID();
    a.db.run('INSERT INTO contacts (id, business_id, full_name, job_role, contact_consent, marketing_optin, created_at, email) VALUES (?, ?, ?, ?, 1, 0, ?, ?)',
      [id, biz, full_name, job_role, T0, `person-${id.slice(0, 6)}@example.invalid`]);
    return id;
  };
  const send = (contact_id: string, first: string, last: string, extra: { email_link?: boolean; bypass?: { reason: string } | null } = {}) =>
    sendIdentityCheck({ app: a, newId: randomUUID }, admin, { business_id: biz, contact_id, cdd_check_id: null, first_name: first, last_name: last, ...extra }, { config: ON });
  const result = (status: string, check_ref: string) => {
    const body = JSON.stringify({ session_id: SESSION, status, vendor_data: check_ref, webhook_type: 'status.updated', created_at: Number(TS) });
    return receiveIdentityResult(a, randomUUID, body, { v2: mac(canonicalJson(JSON.parse(body))), raw: null, timestamp: TS });
  };
  const emailOf = (contact: string): string => a.db.get<{ email: string }>('SELECT email FROM contacts WHERE id = ?', [contact])!.email;
  return { a, s, biz, admin, person, send, result, emailOf };
}

describe('161m2 B · 3 · id-check: staff email the link to the person being checked', () => {
  test('asked for, to a director or owner: one email to them, with the approved words and the button to Didit\'s link', async () => {
    const w = await idWorld();
    try {
      const ada = w.person('Ada Invented', 'owner_director');
      const before = mails(w.a.db).length;
      const r = await w.send(ada, 'Ada', 'Invented', { email_link: true });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const m = mails(w.a.db).slice(before);
      assert.equal(m.length, 1);
      const e = m[0]!;
      assert.equal(e.to_email, w.emailOf(ada));
      assert.equal(e.subject, 'Your identity check for Cap Rebate');
      assert.equal(heading(e.html_body), 'Please complete your identity check');
      assert.deepEqual(button(e.html_body), { href: DIDIT_LINK, label: 'Start the check' });
      assert.match(e.body, /The check is done by Didit, our identity-check provider\. It takes about three minutes on your phone:/);
      assert.match(e.body, /We will never ask for your password, sign-in code or bank details by email or phone\./, 'the security note');
      assert.equal(w.a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'IDENTITY_CHECK_EMAILED' AND outcome = 'ALLOWED'")?.n, 1);
    } finally { w.a.close(); }
  });

  test('not asked for: nothing is emailed, as before', async () => {
    const w = await idWorld();
    try {
      const ada = w.person('Ada Invented', 'owner_director');
      const before = mails(w.a.db).length;
      const r = await w.send(ada, 'Ada', 'Invented');
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      assert.equal(mails(w.a.db).length, before, 'emailed without being asked');
      assert.equal(r.ok ? r.email : null, undefined);
    } finally { w.a.close(); }
  });

  test('a check an Admin sent anyway, to someone who is not a director or an owner, is never emailed: staff are told why', async () => {
    const w = await idWorld();
    try {
      const bob = w.person('Bob Invented', null);
      const before = mails(w.a.db).length;
      const anyway = await w.send(bob, 'Bob', 'Invented', { email_link: true, bypass: { reason: 'Bob runs the practice day to day and the director is abroad.' } });
      assert.equal(anyway.ok, true, anyway.ok ? '' : anyway.why);
      assert.equal(mails(w.a.db).length, before, 'a check sent anyway was emailed');
      assert.deepEqual(anyway.ok ? anyway.email : null, { queued: false, why: 'The link was not emailed: it goes by email only to a director or an owner our rule allows. Give them the link yourself.' });
    } finally { w.a.close(); }
  });

  test('a do-not-contact client: the check is sent, the email is refused, and staff are told', async () => {
    const w = await idWorld();
    try {
      const ada = w.person('Ada Invented', 'owner_director');
      w.a.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [w.biz]);
      const before = mails(w.a.db).length;
      const dnc = await w.send(ada, 'Ada', 'Invented', { email_link: true });
      assert.equal(dnc.ok, true, dnc.ok ? '' : dnc.why);
      assert.equal(mails(w.a.db).length, before, 'a do-not-contact client was emailed');
      assert.deepEqual(dnc.ok ? dnc.email : null, { queued: false, why: 'The link was not emailed: this client asked us not to contact them.' });
    } finally { w.a.close(); }
  });

  test('the panel offers it: a box, ticked, to email the link', async () => {
    const w = await idWorld();
    try {
      const { identityPanel } = await import('../../src/modules/compliance/identity-checks.ts');
      const ada = w.person('Ada Invented', 'owner_director');
      const html = String(identityPanel(w.a, w.admin, { business_id: w.biz }, [{ id: ada, full_name: 'Ada Invented' }]));
      assert.match(html, /<input type="checkbox" id="idc-email" name="email_link" value="yes" checked> Email the link to them\./);
    } finally { w.a.close(); }
  });
});

describe('161m2 B · 3 · id-check-done: the person is told once when Didit says passed', () => {
  test('the first pass emails them once; a second pass does not; a fail never does', async () => {
    const w = await idWorld();
    try {
      const ada = w.person('Ada Invented', 'owner_director');
      const r = await w.send(ada, 'Ada', 'Invented');
      assert.ok(r.ok);
      const before = mails(w.a.db).length;
      assert.equal(w.result('Declined', r.id).outcome, 'FAIL');
      assert.equal(mails(w.a.db).length, before, 'a fail was emailed as complete');
      assert.equal(w.result('Approved', r.id).outcome, 'PASS');
      const m = mails(w.a.db).slice(before);
      assert.equal(m.length, 1);
      assert.equal(m[0]!.to_email, w.emailOf(ada));
      assert.equal(m[0]!.subject, 'Your identity check is complete');
      assert.equal(heading(m[0]!.html_body), 'Your identity check is complete');
      assert.equal(button(m[0]!.html_body)?.label, 'Open your portal');
      assert.match(m[0]!.body, /Thank you, Ada\. Your identity check is complete and there is nothing more you need to do for this step\./);
      assert.equal(w.result('Approved', r.id).outcome, 'PASS');
      assert.equal(mails(w.a.db).length, before + 1, 'told twice');
    } finally { w.a.close(); }
  });

  test('a do-not-contact client is not emailed, and is not tried again', async () => {
    const w = await idWorld();
    try {
      const ada = w.person('Ada Invented', 'owner_director');
      const r = await w.send(ada, 'Ada', 'Invented');
      assert.ok(r.ok);
      w.a.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [w.biz]);
      const before = mails(w.a.db).length;
      w.result('Approved', r.id);
      w.result('Approved', r.id);
      assert.equal(mails(w.a.db).length, before);
      assert.equal(w.a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'IDENTITY_CHECK_DONE_EMAILED'")?.n, 1);
    } finally { w.a.close(); }
  });
});

/* ================================================================== *
 * 4 · DOCUMENTS-NEEDED, THROUGH THE STAFF FORM
 * ================================================================== */

describe('161m2 B · 4 · documents-needed: staff ask, the client is emailed the list once', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let cookie = '';
  let dunmarrow = '', branch = '', typeCode = '';
  const db = () => made.app.db;
  const post = async (path: string, f: Record<string, string>) => {
    const x = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    return { status: x.status, location: x.headers.get('location'), body: await x.text() };
  };
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161m2-docs-')), publicOrigin: ORIGIN });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    const s = await seed(db(), made.app.hasher, made.app.now);
    dunmarrow = db().get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Dunmarrow%'")!.id;
    branch = db().get<{ id: string }>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%branch surgery'", [dunmarrow])!.id;
    db().run("UPDATE businesses SET contact_email = 'office@dunmarrow.example.invalid' WHERE id = ?", [dunmarrow]);
    typeCode = db().get<{ code: string }>("SELECT code FROM document_types WHERE active = 1 AND handler_type IS NOT NULL AND code = 'COMPLETION_STATEMENT'")?.code
      ?? db().get<{ code: string }>('SELECT code FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord LIMIT 1')!.code;
    const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'sales@example.invalid', password: s.password }).toString() });
    cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  });
  after(() => made.close());

  test('one request raised: exactly one email to the client\'s address, listing it, with the approved words', async () => {
    const before = mails(db()).length;
    const r = await post(`/staff/claims/${branch}/document-requests`, { type_code: typeCode, why: 'It shows what was paid for the building.', holds_up: 'The survey.', due_on: '' });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    const m = mails(db()).slice(before);
    assert.equal(m.length, 1);
    const e = m[0]!;
    assert.equal(e.to_email, 'office@dunmarrow.example.invalid');
    assert.equal(e.subject, 'Documents we need for your claim');
    assert.equal(heading(e.html_body), 'Documents we need');
    assert.deepEqual(button(e.html_body), { href: `${ORIGIN}/portal/documents`, label: 'Upload documents' });
    const label = db().get<{ label: string }>('SELECT label FROM document_types WHERE code = ?', [typeCode])!.label;
    assert.match(e.body, /^Documents we need\n\nTo value your claim for [^\n]*branch surgery, we need the following:\n\n- /);
    assert.ok(e.body.includes(`- ${label}\n`), `the request is not listed: ${label}`);
  });

  test('a do-not-contact client: the request is raised, and nothing is emailed', async () => {
    const was = db().get<{ s: string }>('SELECT client_status AS s FROM businesses WHERE id = ?', [dunmarrow])!.s;
    db().run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [dunmarrow]);
    try {
      const before = mails(db()).length;
      const r = await post(`/staff/claims/${branch}/document-requests`, { type_code: typeCode, why: 'It shows what was paid.', holds_up: 'The survey.', due_on: '' });
      assert.equal(r.status, 303, r.body.slice(0, 300));
      assert.equal(mails(db()).length, before);
    } finally {
      db().run('UPDATE businesses SET client_status = ? WHERE id = ?', [was, dunmarrow]);
    }
  });
});

/* ================================================================== *
 * 5 · NEW-MESSAGE
 * ================================================================== */

describe('161m2 B · 5 · new-message: the approved words for the client; the staff alert as a back-office email', () => {
  test('to the client: the approved heading, words and button; never the message', () => {
    const w = alertWords('CLIENT', null, 'b1', ORIGIN) as { subject: string; body: string; html?: string };
    assert.equal(w.subject, 'You have a new message from Cap Rebate');
    assert.equal(heading(w.html ?? null), 'You have a new message');
    assert.deepEqual(button(w.html ?? null), { href: `${ORIGIN}/portal/messages`, label: 'Read the message' });
    assert.match(w.body, /There is a new message from us waiting in your Cap Rebate portal\.\n\nTo keep your details private, we never put the message itself in an email\./);
    assert.doesNotMatch(w.html ?? '', /BACK OFFICE/);
  });

  test('to our staff: its words as before, as a back-office email, with the chat\'s link', () => {
    const w = alertWords('STAFF', 'Corvale Supported Living Limited', 'b1', ORIGIN) as { subject: string; body: string; html?: string };
    assert.match(w.html ?? '', /BACK OFFICE/);
    assert.deepEqual(button(w.html ?? null), { href: `${ORIGIN}/staff/clients/b1?chat=client#chat`, label: 'Open the chat' });
    assert.match(w.body, /Read it and reply in the back office\.\n\nThe message is not in this email\./);
  });
});
