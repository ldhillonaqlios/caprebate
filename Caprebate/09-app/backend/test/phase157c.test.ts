/**
 * PHASE 157c, 6 OCTOBER 2026 — WHAT THE FRIARY HOUSE RUN FOUND, AND A DOCUSIGN-STYLE SIGNATURE.
 *
 * The end-to-end run of an invented client (04-phase-work/sim-2026-10-06, findings F1 to F21) stopped at the engagement
 * letter: nothing prepared or sent one (F21), and it could not be signed (F10). Lakhbir, the same day: "cant it be a
 * docusign style document which captures a signed digital copy?"
 *
 *   1  the free lookups learn the nation from the postcode check (F12); a stopped lookup keeps its reason (F12b)
 *   2  the client's answers kept: the claimant type (F15); the purchase date they gave (F14)
 *   3  documents on the claim (F20), the staff Home card, an empty file (F17)
 *   4  sending the letter (F21): who, when, the email; the time it was first opened
 *   5  the signature drawn or adopted; the record's fingerprint covers it; the certificate of completion; the copy
 *   6  the smaller ones: Zoom (F5), the lead (F7), the next action (F9), the town (F8), the words (F1, F2, F4, F6, F13)
 *
 * Signing stays OFF (ENGAGEMENT_SIGNING): every signature here is made with the switch handed in by the test.
 * Everything is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { createApp } from '../src/server.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { nationFromCountry } from '../src/connectors/nations.ts';
import * as R from '../src/web/research.ts';
import { claimantFor } from '../src/web/pack-legal.ts';
import { acquisitionDateReading, clientSaidPurchaseDate } from '../src/web/claim-facts.ts';
import * as D from '../src/web/documents.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { singleFile } from '../src/web/multipart.ts';
import { newClientDocuments, NEW_DOCUMENT_DAYS } from '../src/web/staff-dashboard.ts';
import { letterState, letterSteps, sendEngagementLetter, signedCopy, SEND_WORDS } from '../src/web/engagement-send.ts';
import { markViewed } from '../src/web/portal.ts';
import {
  ENGAGEMENT_SIGNING, INK_LIMITS, SIGNING_QUESTION, checkSignature, parseInk, seedSignatureRecord, shownLetter, signEngagement,
  type EngagementSigning,
} from '../src/web/signing.ts';
import { buildPdf, flow } from '../src/web/pdf.ts';
import { SIGNATURE_PAD_JS } from '../src/web/signature-pad-script.ts';
import { LETTER_PAGE_CSP } from '../src/web/router.ts';
import { reconcileVideoMeeting } from '../src/web/video-calls.ts';
import { plainNeed } from '../src/web/next-step.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { can } from '../src/authz.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import * as I from '../src/web/introducers.ts';
import { createUser } from '../src/users.ts';
import { docxOf } from './document-fixtures.ts';
import { actor, testApp } from './helpers.ts';
import type { Actor } from '../src/authz.ts';

type TestApp = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-10-06T09:00:00.000Z';
const SIGNING_ON: EngagementSigning = Object.freeze({ enabled: true, solicitor_confirmed: true, question: SIGNING_QUESTION });
const json = (status: number, body: object): Fixture => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function staffUsers(a: TestApp): void {
  for (const role of ['ADMIN', 'SALES', 'SURVEYING', 'ACCOUNTING'] as const) {
    a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'fake$x', T0, T0]);
  }
}
function business(a: TestApp, name = 'Invented Surgery Partnership', sector = 'gp'): string {
  const id = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [id, name, sector, 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
  return id;
}
function clientLogin(a: TestApp, biz: string, email = `client-${biz.slice(0, 8)}@example.invalid`): Actor {
  const u = createUser(a.db, a.now, { email, display_name: 'Ivy Inventedperson', role: 'CLIENT', password_hash: 'fake$x', business_id: biz });
  return { id: u.id, role: 'CLIENT', business_id: biz, disabled: false };
}
let refs = 0;
function claim(a: TestApp, biz: string, stage = 'ENGAGEMENT'): string {
  const id = randomUUID();
  a.db.run("INSERT INTO claims (id, claim_ref, business_id, workstream, stage, created_at, updated_at, completed_at) VALUES (?, ?, ?, 'UNKNOWN', ?, ?, ?, ?)",
    [id, `CR-2026-${String(1000 + refs++)}`, biz, stage, T0, T0, stage === 'CLOSED' ? T0 : null]);
  return id;
}
function settledLetter(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cb-157c-letter-'));
  const p = join(dir, 'letter.docx');
  writeFileSync(p, docxOf(['ENGAGEMENT LETTER', '1. Parties', `This letter is between CAP REBATE LTD and ${name}.`, '2. Fees', 'Our fee is 10 per cent of the relief.']));
  return p;
}
const deps = (a: TestApp) => ({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID });

/** A stroke that is plainly somebody's signature: a long wave across the box. */
const WAVE = JSON.stringify([Array.from({ length: 24 }, (_, i) => [100 + i * 30, 500 + (i % 2 === 0 ? 120 : -120)])]);

/* ================================================================== *
 * 1 · THE FREE LOOKUPS KNOW THE NATION (F12), AND KEEP THEIR REASON (F12b)
 * ================================================================== */

describe('1 · the free lookups learn which part of the UK the property is in', () => {
  test('the postcode check’s country names a nation; anything else is unknown, never guessed', () => {
    assert.deepEqual(['England', 'Wales', 'Scotland', 'Northern Ireland', ' england '].map(nationFromCountry), ['england', 'wales', 'scotland', 'northern_ireland', 'england']);
    for (const x of [null, undefined, '', 'Channel Islands', 'Isle of Man']) assert.equal(nationFromCountry(x), null, String(x));
  });

  async function planningClick(country: string | null) {
    const a = await testApp();
    staffUsers(a);
    const biz = business(a);
    a.db.run("INSERT INTO properties (id, business_id, label, address_line_1, town, postcode, created_at) VALUES (?, ?, 'Invented House, 2 Test Road, Plymouth', 'Invented House', 'Plymouth', 'PL4 9BH', ?)", [randomUUID(), biz, T0]);
    const t = fixtureTransport({
      'GET /postcodes/PL49BH': country === null ? json(404, { status: 404, error: 'Postcode not found' })
        : json(200, { status: 200, result: { postcode: 'PL4 9BH', admin_district: 'Plymouth', region: 'South West', country } }),
    });
    const entry = R.catalogue().find((e) => e.source_id === 'PLANNING')!;
    const out = await R.consultAllowed(
      { db: a.db, audit: a.audit, now: a.now, newId: randomUUID, outside: { transport: t, secrets: secretsFromValues({}), env: { CAPREBATE_LOOKUPS_HERE: '1' }, sleep: async () => {} } },
      actor('ADMIN', 'u-ADMIN'), biz, [{ entry, state: 'NOT_RUN', detail: 'not run yet' }], { free_gate_open: false, engagement_signed: false });
    return { a, t, out };
  }

  test('F12: the postcode is checked ONCE, its country is used, and the planning lookup is asked rather than stopped', async () => {
    const r = await planningClick('England');
    try {
      const pc = r.t.seen.filter((x) => new URL(x.url).host === 'api.postcodes.io');
      assert.equal(pc.length, 1, 'the postcode check was not asked exactly once');
      assert.doesNotMatch(r.out[0]?.detail ?? '', /which part of the UK/);
      assert.ok(r.t.seen.some((x) => new URL(x.url).host !== 'api.postcodes.io'), 'the planning sources were never asked');
      // nothing was written about the property: the nation is used for this click only
      assert.equal(r.a.db.get<{ j: string | null }>('SELECT jurisdiction AS j FROM properties')?.j, null);
    } finally { r.a.close(); }
  });

  test('a postcode the check does not know leaves the nation unknown, exactly as before', async () => {
    const r = await planningClick(null);
    try {
      assert.match(r.out[0]?.detail ?? '', /which part of the UK/);
      assert.equal(r.t.seen.filter((x) => new URL(x.url).host !== 'api.postcodes.io').length, 0);
    } finally { r.a.close(); }
  });

  test('without the waiver nothing is checked at all', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      a.db.run("INSERT INTO properties (id, business_id, label, postcode, created_at) VALUES (?, ?, 'X', 'PL4 9BH', ?)", [randomUUID(), biz, T0]);
      const t = fixtureTransport({});
      const entry = R.catalogue().find((e) => e.source_id === 'PLANNING')!;
      await R.consultAllowed({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID, outside: { transport: t, secrets: secretsFromValues({}), env: {} } },
        actor('ADMIN', 'u-ADMIN'), biz, [{ entry, state: 'NOT_RUN', detail: 'not run yet' }], { free_gate_open: false, engagement_signed: false });
      assert.equal(t.seen.filter((x) => new URL(x.url).host === 'api.postcodes.io').length, 0);
    } finally { a.close(); }
  });

  test('F12b: a lookup the last click stopped keeps the reason that click wrote, not "not switched on"', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      signatureFreeEngagement(a, biz);
      const entry = R.catalogue().find((e) => e.source_id === 'PLANNING')!;
      const why = 'we do not know which part of the UK the property is in, and these planning sources cover England and Wales';
      const d = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
      a.db.tx(() => R.storeResearchOutcomes(d, biz, [{ entry, state: 'NOT_RUN', detail: why, retrieved_at: null, failure_code: null, bundle: null, cost_pence: 0 }], T0));
      const row = R.sourcesFor(a.db, actor('ADMIN', 'u-ADMIN'), biz, { env: { CAPREBATE_LOOKUPS_HERE: '1' } }).sources.find((s) => s.source_id === 'PLANNING');
      assert.equal(row?.state, 'NOT_RUN');
      assert.equal(row?.detail, why);
    } finally { a.close(); }
  });
});

function signatureFreeEngagement(a: TestApp, biz: string): void {
  a.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'NOT_SENT', NULL, ?)", [randomUUID(), biz, T0]);
}

/* ================================================================== *
 * 2 · THE CLIENT'S ANSWERS KEPT (F15, F14)
 * ================================================================== */

function assessment(a: TestApp, biz: string, answers: Record<string, string>): string {
  const id = randomUUID();
  a.db.run('INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, biz, 'gp', T0, 12_750_000, 25_500_000, T0]);
  let ord = 0;
  for (const [q, v] of Object.entries(answers)) {
    a.db.run("INSERT INTO assessment_answers (id, assessment_id, ord, question_id, question_text, state, value) VALUES (?, ?, ?, ?, ?, 'ANSWERED', ?)",
      [randomUUID(), id, ord++, q, q, v]);
  }
  return id;
}

describe('2 · the client’s own answers reach the checks', () => {
  test('F15: the legal check reads the claimant type the way every gate does — the client’s answer first', async () => {
    const a = await testApp();
    try {
      const biz = business(a);
      assert.equal(claimantFor(a.db, biz), 'company', 'nothing known is read as a company, as before');
      assessment(a, biz, { 'Q2-0-entity': 'partnership' });
      assert.equal(claimantFor(a.db, biz), 'partnership');
    } finally { a.close(); }
  });

  test('F14: the purchase date the client gave is shown beside an unknown acquisition date, and never stored as it', async () => {
    const a = await testApp();
    try {
      const biz = business(a);
      const prop = randomUUID();
      a.db.run("INSERT INTO properties (id, business_id, label, postcode, created_at) VALUES (?, ?, 'Invented House, Plymouth', 'PL4 9BH', ?)", [prop, biz, T0]);
      assert.equal(clientSaidPurchaseDate(a.db, prop), null);
      assessment(a, biz, { 'Q2-0-address': 'Invented House, Plymouth', 'Q2-0-trigger': 'purchase', 'Q2-0-date': '06/2019' });
      assert.equal(clientSaidPurchaseDate(a.db, prop), '06/2019');
      const r = acquisitionDateReading(a.db, prop);
      assert.match(r.display, /at the assessment the client said they bought it around 06\/2019\. Confirm the completion date/);
      assert.equal(a.db.get<{ d: string | null }>('SELECT acquisition_date AS d FROM properties WHERE id = ?', [prop])?.d, null);
    } finally { a.close(); }
  });

  test('a date given for building works, or for another address, is not a purchase date', async () => {
    const a = await testApp();
    try {
      const biz = business(a);
      const prop = randomUUID();
      a.db.run("INSERT INTO properties (id, business_id, label, created_at) VALUES (?, ?, 'Invented House, Plymouth', ?)", [prop, biz, T0]);
      assessment(a, biz, { 'Q2-0-address': 'Invented House, Plymouth', 'Q2-0-trigger': 'refurb', 'Q2-0-date': '06/2019',
        'Q2-1-address': 'Another Place, Exeter', 'Q2-1-trigger': 'purchase', 'Q2-1-date': '01/2015' });
      assert.equal(clientSaidPurchaseDate(a.db, prop), null);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * 3 · DOCUMENTS ON THE CLAIM (F20), STAFF TOLD, AN EMPTY FILE (F17)
 * ================================================================== */

describe('3 · a file the client sends reaches their claim, and staff are told', () => {
  async function clientUpload(a: TestApp, biz: string, who: Actor) {
    const store = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-157c-store-')) });
    return D.startDocumentUpload({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID, store }, who, {
      business_id: biz, type_code: 'LEASE', logical_document_id: null, request_id: null, claim_id: null,
    });
  }
  const linked = (a: TestApp, logical: string) => a.db.all<{ claim_id: string | null }>('SELECT claim_id FROM document_links WHERE logical_document_id = ?', [logical]).map((r) => r.claim_id);

  test('F20: with one open claim, the client’s file goes on it; with two, staff choose, as before', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      const who = clientLogin(a, biz);
      const c1 = claim(a, biz);
      const one = await clientUpload(a, biz, who);
      assert.equal(one.ok, true, one.ok ? '' : one.why);
      assert.deepEqual(linked(a, one.ok ? one.logical_document_id : ''), [c1]);
      claim(a, biz, 'SURVEY');
      const two = await clientUpload(a, biz, who);
      assert.deepEqual(linked(a, two.ok ? two.logical_document_id : ''), []);
    } finally { a.close(); }
  });

  test('a closed claim does not count as open', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      const who = clientLogin(a, biz);
      const open = claim(a, biz);
      claim(a, biz, 'CLOSED');
      const r = await clientUpload(a, biz, who);
      assert.deepEqual(linked(a, r.ok ? r.logical_document_id : ''), [open]);
    } finally { a.close(); }
  });

  test('staff Home: "New documents from clients" counts a client’s files of the last 14 days, and not staff uploads', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      const who = clientLogin(a, biz);
      const doc = (by: string, at: string) => a.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), biz, by, 'x.pdf', 'STORED', at]);
      const now = '2026-10-06T12:00:00.000Z';
      assert.equal(NEW_DOCUMENT_DAYS, 14);
      doc(who.id, '2026-10-05T12:00:00.000Z'); doc(who.id, '2026-10-01T12:00:00.000Z');
      doc(who.id, '2026-09-01T12:00:00.000Z'); doc('u-ADMIN', '2026-10-05T12:00:00.000Z');
      assert.deepEqual(newClientDocuments(a, actor('SALES', 'u-SALES'), now).map((x) => [x.id, x.n]), [[biz, 2]]);
    } finally { a.close(); }
  });

  test('F17: a chosen file with nothing in it is "that file is empty"; no file chosen is still "no file was attached"', () => {
    const body = (filename: string, bytes: string) => new Uint8Array(Buffer.from(
      `--B\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n${bytes}\r\n--B--\r\n`, 'latin1'));
    assert.deepEqual(singleFile(body('empty.pdf', ''), 'multipart/form-data; boundary=B'), { ok: false, why: 'that file is empty' });
    assert.deepEqual(singleFile(body('', ''), 'multipart/form-data; boundary=B'), { ok: false, why: 'no file was attached' });
    assert.equal(singleFile(body('full.pdf', '%PDF-1.4 x'), 'multipart/form-data; boundary=B').ok, true);
  });
});

/* ================================================================== *
 * 4 · SENDING THE LETTER (F21)
 * ================================================================== */

describe('4 · Sales and Admin prepare and send the engagement letter', () => {
  test('refused without a login to read it with; then raised, marked sent with who and when, the client emailed, the audit kept', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      const d = { ...deps(a), origin: 'https://caprebate.example.invalid' };
      assert.deepEqual(sendEngagementLetter(d, actor('SALES', 'u-SALES'), biz), { ok: false, why: SEND_WORDS.no_login });
      assert.equal(letterState(a.db, biz).state, 'NONE');
      const who = clientLogin(a, biz, 'ivy@example.invalid');
      const r = sendEngagementLetter(d, actor('SALES', 'u-SALES'), biz);
      assert.deepEqual(r, { ok: true, resent: false, emailed: 1 });
      const s = letterState(a.db, biz);
      assert.equal(s.state, 'SENT');
      assert.equal(s.sent_by, 'SALES Person');
      assert.ok(s.sent_at !== null && s.prepared_at !== null);
      const mail = a.db.all<{ to_email: string; body: string; kind: string }>("SELECT to_email, body, kind FROM outbox WHERE business_id = ? ORDER BY rowid", [biz]);
      assert.equal(mail.length, 1);
      assert.equal(mail[0]?.to_email, 'ivy@example.invalid');
      assert.match(mail[0]?.body ?? '', /https:\/\/caprebate\.example\.invalid\/portal\/letter/);
      const audit = a.audit.entries().filter((e) => e.kind === 'ENGAGEMENT_LETTER_SENT' && e.object_id === biz);
      assert.equal(audit.length, 1);
      assert.deepEqual(audit[0]?.detail, { resent: false, logins: 1 });
      assert.equal(JSON.stringify(audit).includes('ivy@example.invalid'), false, 'the audit names the address');
      void who;
    } finally { a.close(); }
  });

  test('sending again re-sends the email, and the first sent time stays; a letter NOT_SENT is moved to SENT', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      clientLogin(a, biz);
      signatureFreeEngagement(a, biz);
      assert.equal(sendEngagementLetter(deps(a), actor('ADMIN', 'u-ADMIN'), biz).ok, true);
      const first = letterState(a.db, biz).sent_at;
      const again = sendEngagementLetter(deps(a), actor('SALES', 'u-SALES'), biz);
      assert.deepEqual(again, { ok: true, resent: true, emailed: 1 });
      assert.equal(letterState(a.db, biz).sent_at, first);
      assert.equal(letterState(a.db, biz).sent_by, 'ADMIN Person');
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagements WHERE business_id = ?', [biz])?.n, 1);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE business_id = ?', [biz])?.n, 2);
    } finally { a.close(); }
  });

  test('only Sales and Admin may send; a read-only login, the surveyor, accounting and the client may not', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      clientLogin(a, biz);
      const obj = { type: 'engagement', id: biz, business_id: biz } as const;
      assert.equal(can(actor('ADMIN'), 'engagement.send', obj), true);
      assert.equal(can(actor('SALES'), 'engagement.send', obj), true);
      for (const role of ['SURVEYING', 'ACCOUNTING'] as const) assert.equal(can(actor(role), 'engagement.send', obj), false, role);
      assert.equal(can(actor('CLIENT', 'c', biz), 'engagement.send', obj), false);
      assert.throws(() => sendEngagementLetter(deps(a), actor('SURVEYING', 'u-SURVEYING'), biz));
      assert.equal(letterState(a.db, biz).state, 'NONE');
    } finally { a.close(); }
  });

  test('the moment the client first opens it is kept, and opening it again does not move it', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const biz = business(a);
      const who = clientLogin(a, biz);
      sendEngagementLetter(deps(a), actor('SALES', 'u-SALES'), biz);
      markViewed(a.db, who, biz, () => '2026-10-06T10:00:00.000Z');
      markViewed(a.db, who, biz, () => '2026-10-06T11:00:00.000Z');
      const s = letterState(a.db, biz);
      assert.deepEqual([s.state, s.viewed_at], ['VIEWED', '2026-10-06T10:00:00.000Z']);
      assert.match(letterSteps(s).join(' '), /Prepared .*Sent .*by SALES Person\. First opened by the client/);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * 5 · THE SIGNATURE, DRAWN OR ADOPTED; THE CERTIFICATE; THE COPY
 * ================================================================== */

async function signingWorld() {
  const a = await testApp();
  staffUsers(a);
  const biz = business(a, 'Invented Signing Limited', 'dental');
  const who = clientLogin(a, biz, 'signer@example.invalid');
  sendEngagementLetter(deps(a), actor('SALES', 'u-SALES'), biz);
  markViewed(a.db, who, biz, a.now);
  const letterPath = settledLetter('Invented Signing Limited');
  const shown = shownLetter({ name: 'Invented Signing Limited' }, letterPath);
  const session = randomUUID();
  a.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, who.id, randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
  const sign = (extra: { signature_strokes?: string; typed_as_signature?: boolean }) => signEngagement(deps(a), who, biz,
    { full_name: 'Ivy Inventedperson', role: 'Partner', authorised: true, letter_sha256: shown.sha256, ...extra },
    { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath });
  const eng = () => a.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [biz])!.id;
  return { a, biz, who, shown, session, sign, eng };
}
const pdfText = (b: Uint8Array) => Buffer.from(b).toString('latin1');
const hexOf = (s: string) => Buffer.from(s, 'latin1').toString('hex');

describe('5 · a DocuSign-style signature: drawn or adopted, fingerprinted, with a certificate of completion', () => {
  test('still OFF as shipped: the switch is false and the solicitor has not confirmed', () => {
    assert.equal(ENGAGEMENT_SIGNING.enabled, false);
    assert.equal(ENGAGEMENT_SIGNING.solicitor_confirmed, false);
  });

  test('neither drawn nor adopted is refused, never assumed; a tap is too small; nonsense is no signature', async () => {
    const x = await signingWorld();
    try {
      assert.match((x.sign({}) as { why: string }).why, /Draw your signature in the box, or tick/);
      assert.match((x.sign({ signature_strokes: '[[[500,500],[502,501]]]' }) as { why: string }).why, /too small to be a signature/);
      assert.match((x.sign({ signature_strokes: 'not json' }) as { why: string }).why, /Draw your signature/);
      assert.match((x.sign({ signature_strokes: '[[[2000,5]]]' }) as { why: string }).why, /Draw your signature/);
      assert.equal(x.a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures')?.n, 0);
    } finally { x.a.close(); }
  });

  test('the pad’s limits: points are whole numbers 0 to 1000, at most 60 strokes and 3000 points', () => {
    assert.deepEqual(INK_LIMITS, { max_strokes: 60, max_points: 3000, min_points: 8, min_span: 60 });
    assert.equal(parseInk(WAVE).ok, true);
    assert.equal(parseInk(JSON.stringify(Array.from({ length: 61 }, () => [[10, 10], [200, 10]]))).ok, false);
    assert.equal(parseInk(JSON.stringify([Array.from({ length: 3001 }, (_, i) => [i % 1000, 5])])).ok, false);
    assert.equal(parseInk('[[[10.5,3],[200,3],[300,4],[400,5],[500,6],[600,7],[700,8],[800,9]]]').ok, false);
  });

  test('DRAWN: the record keeps the strokes, the method, the signer’s login email and the letter’s times; its fingerprint covers them', async () => {
    const x = await signingWorld();
    try {
      const r = x.sign({ signature_strokes: WAVE, typed_as_signature: true });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const row = x.a.db.get<Record<string, unknown>>('SELECT * FROM engagement_signatures WHERE business_id = ?', [x.biz])!;
      assert.equal(row['record_version'], 2);
      assert.equal(row['signature_method'], 'DRAWN', 'a drawing wins over the tick');
      assert.deepEqual(JSON.parse(String(row['signature_ink'])), JSON.parse(WAVE));
      assert.equal(row['signer_email'], 'signer@example.invalid');
      const e = x.a.db.get<{ created_at: string; sent_at: string; viewed_at: string }>('SELECT created_at, sent_at, viewed_at FROM engagements WHERE business_id = ?', [x.biz])!;
      assert.deepEqual([row['letter_prepared_at'], row['letter_sent_at'], row['letter_viewed_at']], [e.created_at, e.sent_at, e.viewed_at]);
      assert.equal(checkSignature(x.a.db, x.eng()).ok, true);
      // the PDF: the drawing as lines, then the certificate of completion
      const pdf = pdfText(row['pdf'] as Uint8Array);
      assert.match(pdf, / RG\n/);
      assert.match(pdf, /\d+(\.\d+)? \d+(\.\d+)? m\n[\s\S]* l\n[\s\S]*S\nQ/);
      for (const words of ['Certificate of completion', 'Letter sent to the client:', 'Letter first opened by the client:', 'Signed in as: signer@example.invalid', 'How they signed: drew their signature', x.shown.sha256]) {
        assert.ok(pdf.includes(hexOf(words)), `the certificate does not say "${words}"`);
      }
    } finally { x.a.close(); }
  });

  test('the fingerprint covers the drawing: change one stroke and the record no longer checks out', async () => {
    const x = await signingWorld();
    try {
      assert.equal(x.sign({ signature_strokes: WAVE }).ok, true);
      // the never-edited triggers are taken away here only, to show the fingerprint alone would catch an edit
      x.a.db.run('DROP TRIGGER engagement_signatures_no_update');
      x.a.db.run('UPDATE engagement_signatures SET signature_ink = ? WHERE business_id = ?', ['[[[100,100],[900,900],[100,900],[900,100],[500,500],[400,400],[300,300],[200,200]]]', x.biz]);
      assert.equal(checkSignature(x.a.db, x.eng()).ok, false);
    } finally { x.a.close(); }
  });

  test('TYPED: the tick adopts the typed name, and the certificate says so', async () => {
    const x = await signingWorld();
    try {
      assert.equal(x.sign({ typed_as_signature: true }).ok, true);
      const row = x.a.db.get<{ signature_method: string; signature_ink: string | null; pdf: Uint8Array }>('SELECT signature_method, signature_ink, pdf FROM engagement_signatures')!;
      assert.deepEqual([row.signature_method, row.signature_ink], ['TYPED', null]);
      assert.ok(pdfText(row.pdf).includes(hexOf('How they signed: adopted their typed name as their signature')));
      assert.equal(checkSignature(x.a.db, x.eng()).ok, true);
    } finally { x.a.close(); }
  });

  test('a record made before this phase (version 1) still checks out exactly as it did', async () => {
    const a = await testApp();
    try {
      const biz = business(a);
      a.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SIGNED', ?, ?)", [randomUUID(), biz, T0, T0]);
      seedSignatureRecord({ db: a.db, audit: a.audit, now: () => T0, newId: randomUUID }, biz, T0);
      const r = a.db.get<{ engagement_id: string; record_version: number; signature_method: string | null }>('SELECT engagement_id, record_version, signature_method FROM engagement_signatures')!;
      assert.deepEqual([r.record_version, r.signature_method], [1, null]);
      assert.equal(checkSignature(a.db, r.engagement_id).ok, true);
    } finally { a.close(); }
  });

  test('the signed copy: for the client and for Sales and Admin, the stored PDF; nobody else; not before signing', async () => {
    const x = await signingWorld();
    try {
      assert.equal(signedCopy(x.a.db, x.who, x.biz), null, 'a copy before signing');
      assert.equal(x.sign({ signature_strokes: WAVE }).ok, true);
      const stored = x.a.db.get<{ pdf: Uint8Array }>('SELECT pdf FROM engagement_signatures')!.pdf;
      for (const who of [x.who, actor('SALES', 'u-SALES'), actor('ADMIN', 'u-ADMIN')]) {
        const c = signedCopy(x.a.db, who, x.biz);
        assert.ok(c !== null, who.role);
        assert.deepEqual(Buffer.from(c.pdf), Buffer.from(stored));
        assert.match(c.filename, /^engagement-letter-signed-\d{4}-\d{2}-\d{2}\.pdf$/);
      }
      const other = business(x.a, 'Another Invented Limited');
      assert.equal(signedCopy(x.a.db, clientLogin(x.a, other), x.biz), null, 'another client');
    } finally { x.a.close(); }
  });

  test('the PDF draws ink inside its box, after the text', () => {
    const pages = flow([{ text: 'Before' }, { text: '', ink: { strokes: [[[0, 0], [1000, 1000]]], width: 240, height: 80 } }, { text: 'After' }]);
    const pdf = pdfText(buildPdf(pages, { title: 'Ink' }).bytes);
    const m = /([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS/.exec(pdf);
    assert.ok(m !== null, 'no stroke drawn');
    const [x0, y0, x1, y1] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
    assert.equal(Math.round(x1 - x0), 240);
    assert.equal(Math.round(y0 - y1), 80, 'the box is 80 high, drawn downwards');
    assert.ok(pdf.indexOf(' m\n') > pdf.lastIndexOf('ET'), 'the ink is drawn after the text');
  });

  test('the pad’s script: one file, no inline code, valid, and the letter page’s policy allows only our own script', () => {
    assert.doesNotThrow(() => new Function(SIGNATURE_PAD_JS));
    runInNewContext(SIGNATURE_PAD_JS, {}); // no document: it does nothing and does not throw
    assert.doesNotMatch(SIGNATURE_PAD_JS, /innerHTML|eval\(|fetch\(|XMLHttpRequest|localStorage|style\./);
    assert.match(LETTER_PAGE_CSP, /script-src 'self';/);
    assert.doesNotMatch(LETTER_PAGE_CSP, /unsafe-inline|unsafe-eval|https:/);
  });

  test('migration 096: the new columns refuse what they must', async () => {
    const x = await signingWorld();
    try {
      assert.equal(x.sign({ typed_as_signature: true }).ok, true);
      const base = x.a.db.get<Record<string, unknown>>('SELECT * FROM engagement_signatures')!;
      const COLS = ['engagement_id', 'business_id', 'origin', 'user_id', 'session_id', 'signer_name', 'signer_role', 'business_name', 'authority_confirmed',
        'signed_at', 'ip', 'letter_text', 'letter_sha256', 'pdf', 'pdf_sha256', 'record_sha256', 'record_version', 'signature_method', 'signature_ink'] as const;
      const insert = (over: Record<string, unknown>) => x.a.db.run(
        'INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
          'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version, signature_method, signature_ink) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), ...COLS.map((c) => (c in over ? over[c] : base[c]))] as never);
      const biz2 = business(x.a, 'Second Invented Limited');
      const eng2 = randomUUID();
      x.a.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SENT', NULL, ?)", [eng2, biz2, T0]);
      const to2 = { engagement_id: eng2, business_id: biz2, record_sha256: 'e'.repeat(64), pdf_sha256: 'd'.repeat(64) };
      assert.throws(() => insert({ ...to2, record_version: 3 }), /CHECK/);
      assert.throws(() => insert({ ...to2, signature_method: 'STAMPED' }), /CHECK/);
      assert.throws(() => insert({ ...to2, signature_ink: '{not json' }), /CHECK/);
      assert.doesNotThrow(() => insert({ ...to2, signature_method: 'DRAWN', signature_ink: WAVE }), 'the control row was refused');
      assert.throws(() => x.a.db.run('UPDATE engagement_signatures SET signer_email = ?', ['x@example.invalid']), /never/);
      const migration = readFileSync(join(import.meta.dirname, '..', 'migrations', '096-phase157c-letter-sent-and-drawn-signature.sql'), 'utf8');
      assert.doesNotMatch(migration.replace(/--.*$/gm, ''), /DROP|UPDATE|DELETE/i, 'the migration rewrites or removes something');
    } finally { x.a.close(); }
  });
});

/* ================================================================== *
 * 6 · THE SMALLER ONES
 * ================================================================== */

describe('6 · the smaller findings', () => {
  test('F5: on the free plan a video call goes straight to the shared host — no refused call under a member of staff', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157c-zoom-')), publicOrigin: 'https://caprebate.example.invalid', sealKey: randomBytes(32) });
    try {
      const db = made.app.db;
      db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-zs','sam@example.invalid','sam@example.invalid','Sam Sales','SALES','x',?,?,NULL)", [T0, T0]);
      db.run("INSERT INTO businesses (id,name,sector,stage,created_at) VALUES ('b-z','Invented Zoom Limited','dental','ASSESSMENT_SUBMITTED',?)", [T0]);
      db.run("INSERT INTO bookings (id, business_id, assigned_to, channel, entry_point, starts_at, ends_at, created_at) VALUES ('bk-1','b-z','u-zs','video','staff','2026-10-07T09:00:00.000Z','2026-10-07T10:00:00.000Z',?)", [T0]);
      const t = fixtureTransport({
        'POST /oauth/token': json(200, { access_token: 'invented', token_type: 'bearer', expires_in: 3599 }),
        'POST /v2/users/me/meetings': json(201, { id: 83333333333, join_url: 'https://us06web.zoom.us/j/83333333333?pwd=x', password: 'Inv3nt' }),
      });
      made.app.outside = t;
      made.app.secrets = secretsFromValues({ ZOOM_ACCOUNT_ID: 'a', ZOOM_CLIENT_ID: 'b', ZOOM_CLIENT_SECRET: 'c', ZOOM_SDK_CLIENT_ID: 'd', ZOOM_SDK_CLIENT_SECRET: 'e' });
      made.app.zoomPolicy = { international_transfer_approved: true };
      assert.equal(await reconcileVideoMeeting(made.app, 'bk-1'), 'MADE');
      const posted = t.seen.filter((x) => x.method === 'POST' && x.url.includes('/meetings')).map((x) => new URL(x.url).pathname);
      assert.deepEqual(posted, ['/v2/users/me/meetings']);
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'VIDEO_CALL_SHARED_HOST'")?.n, 0);
    } finally { made.close(); }
  });

  test('F9: a converted claim carries the lead’s open follow-up as its next action', async () => {
    const a = await testApp();
    try {
      staffUsers(a);
      const SALES = actor('SALES', 'u-SALES');
      const d = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
      const r = I.intakeReferral(d, SALES, {
        firm_name: 'Invented Ledger LLP', introducer_type: 'ACCOUNTANT_FIRM', contact_name: 'Pat Partner', contact_email: 'pat@ledger.example.invalid',
        prospect_organisation: 'Invented Surgery Partnership', prospect_sector: 'gp',
      }, 'STAFF');
      assert.ok(r.ok, r.ok ? '' : r.why);
      a.db.run("UPDATE staff_tasks SET due_on = '2027-01-01' WHERE lead_id = ?", [r.id]); // the automation's own follow-ups come later
      a.db.run("INSERT INTO staff_tasks (id, title, owner_id, due_on, status, activity_type, lead_id, origin, created_by, created_at, updated_at) VALUES (?, 'Ring the practice manager', 'u-SALES', '2026-10-09', 'OPEN', 'CALL', ?, 'STAFF', 'u-SALES', ?, ?)",
        [randomUUID(), r.id, T0, T0]);
      const biz = business(a);
      for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) assert.equal(P.recordEnquiryCheck(d, SALES, { lead_id: r.id }, { check_key, answer: 'YES', note: null }).ok, true);
      assert.ok(L.updateLead(d, SALES, r.id, { status: 'QUALIFIED' }).ok);
      const c = L.convertLead(d, SALES, r.id, { business_id: biz });
      assert.ok(c.ok, c.ok ? '' : c.why);
      const next = a.db.get<{ title: string; due_on: string; owner_id: string }>(
        'SELECT title, due_on, owner_id FROM staff_tasks WHERE claim_id = ? AND is_next_action = 1', [c.ok ? c.id : '']);
      assert.deepEqual(next, { title: 'Ring the practice manager', due_on: '2026-10-09', owner_id: 'u-SALES' });
    } finally { a.close(); }
  });

  test('F6: the fourth check says what a yes means', () => {
    assert.equal(plainNeed('There is no existing claim conflict on this property').words, 'Confirm no conflicting claim, ours or another adviser’s, on this property');
  });

  test('F1: a button the page script hides stays hidden', () => {
    assert.match(SITE_CSS, /button\[hidden\],\.btn\[hidden\],\.cta\[hidden\]\{display:none!important\}/);
    assert.ok(SITE_CSS.indexOf('button[hidden]') < SITE_CSS.indexOf('button,.btn,.cta{display:inline-flex'));
  });
});

/* ================================================================== *
 * 7 · ON THE SCREEN: the letter section, the routes, the portal, the funnel
 * ================================================================== */

describe('7 · on the screen', () => {
  async function web() {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157c-web-')), publicOrigin: 'https://caprebate.example.invalid' });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    const hash = await made.app.hasher.hash('Invented-Pass-157c');
    for (const role of ['ADMIN', 'SALES', 'SURVEYING'] as const) {
      made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, hash, T0, T0]);
    }
    const biz = randomUUID();
    made.app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Surgery Partnership', 'gp', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    made.app.db.run('INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), biz, 'gp', T0, 12_750_000, 25_500_000, T0]);
    const client = (): { get: (p: string) => Promise<{ status: number; body: string; location: string | null; type: string | null; bytes: Buffer }>; post: (p: string, f: Record<string, string>) => Promise<{ status: number; body: string; location: string | null }> } => {
      let cookie = '';
      const req = async (path: string, init: RequestInit = {}) => {
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
        for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
        const bytes = Buffer.from(await r.arrayBuffer());
        return { status: r.status, body: bytes.toString('utf8'), location: r.headers.get('location'), type: r.headers.get('content-type'), bytes };
      };
      return { get: (p) => req(p), post: (p, f) => req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() }) };
    };
    const as = async (email: string) => {
      const c = client();
      const r = await c.post('/login', { email, password: 'Invented-Pass-157c' });
      assert.equal(r.status, 303, `${email} could not sign in`);
      return c;
    };
    return { made, base, biz, hash, client, as };
  }

  test('the client page: "Engagement letter" with no login says so; with one, Sales sends it and the page says who and when', async () => {
    const w = await web();
    try {
      const sales = await as(w, 'sales@example.invalid');
      const page = await sales.get(`/staff/clients/${w.biz}?done=letter`);
      assert.match(page.body, /id="letter"/);
      assert.doesNotMatch(page.body, /action="\/staff\/clients\/[^"]+\/engagement\/send"/);
      w.made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-cl', 'ivy@example.invalid', 'ivy@example.invalid', 'Ivy Inventedperson', 'CLIENT', w.hash, T0, T0, w.biz]);
      const withLogin = await sales.get(`/staff/clients/${w.biz}?done=letter`);
      assert.match(withLogin.body, /Prepare and send the engagement letter/);
      const sent = await sales.post(`/staff/clients/${w.biz}/engagement/send`, {});
      assert.equal(sent.status, 303);
      assert.match(sent.location ?? '', /\?done=letter-sent#letter$/);
      const after = await sales.get(sent.location ?? '');
      assert.match(after.body, /Sent [^<]*, by SALES Person\./);
      assert.match(after.body, /Send the link again/);
      // the surveyor may not send it
      const surveyor = await as(w, 'surveying@example.invalid');
      const refused = await surveyor.post(`/staff/clients/${w.biz}/engagement/send`, {});
      assert.notEqual(refused.status, 303);
      // the portal: while signing is off there is no drawing pad, so no script and every page's policy
      const ivy = await as(w, 'ivy@example.invalid');
      const letter = await ivy.get('/portal/letter');
      assert.equal(letter.status, 200);
      assert.doesNotMatch(letter.body, /<script|data-sig-pad/);
      assert.match(letter.body, /name="typed_as_signature"/);
      const pdf = await ivy.get('/portal/letter/signed.pdf');
      assert.equal(pdf.status, 404, 'a signed copy before signing');
      assert.equal(w.made.app.db.get<{ v: string | null }>('SELECT viewed_at AS v FROM engagements WHERE business_id = ?', [w.biz])?.v !== null, true, 'opening the letter was not kept');
    } finally { w.made.close(); }
  });

  test('the signed copy over the web: the client and Sales get the PDF; the surveyor does not', async () => {
    const w = await web();
    try {
      w.made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-cl', 'ivy@example.invalid', 'ivy@example.invalid', 'Ivy Inventedperson', 'CLIENT', w.hash, T0, T0, w.biz]);
      const a = w.made.app;
      sendEngagementLetter({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID }, actor('SALES', 'u-SALES'), w.biz);
      const letterPath = settledLetter('Invented Surgery Partnership');
      const session = randomUUID();
      a.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
        [session, 'u-cl', randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
      const r = signEngagement({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID }, { id: 'u-cl', role: 'CLIENT', business_id: w.biz, disabled: false }, w.biz,
        { full_name: 'Ivy Inventedperson', role: 'Partner', authorised: true, letter_sha256: shownLetter({ name: 'Invented Surgery Partnership' }, letterPath).sha256, signature_strokes: WAVE },
        { ip: '203.0.113.9', session_id: session }, { cfg: SIGNING_ON, letterPath });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const stored = Buffer.from(a.db.get<{ pdf: Uint8Array }>('SELECT pdf FROM engagement_signatures')!.pdf);
      const ivy = await as(w, 'ivy@example.invalid');
      const mine = await ivy.get('/portal/letter/signed.pdf');
      assert.equal(mine.status, 200);
      assert.equal(mine.type, 'application/pdf');
      assert.deepEqual(mine.bytes, stored);
      assert.match((await ivy.get('/portal')).body, /href="\/portal\/letter\/signed\.pdf"/);
      const sales = await as(w, 'sales@example.invalid');
      const theirs = await sales.get(`/staff/clients/${w.biz}/engagement/signed.pdf`);
      assert.equal(theirs.status, 200);
      assert.deepEqual(theirs.bytes, stored);
      assert.match((await sales.get(`/staff/clients/${w.biz}?done=letter`)).body, /Download the signed copy/);
      const surveyor = await as(w, 'surveying@example.invalid');
      assert.notEqual((await surveyor.get(`/staff/clients/${w.biz}/engagement/signed.pdf`)).type, 'application/pdf');
    } finally { w.made.close(); }
  });

  test('F13: the portal shows the figure the client was shown — "up to", never a range they never saw', async () => {
    const w = await web();
    try {
      w.made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-cl', 'ivy@example.invalid', 'ivy@example.invalid', 'Ivy Inventedperson', 'CLIENT', w.hash, T0, T0, w.biz]);
      const ivy = await as(w, 'ivy@example.invalid');
      const home = await ivy.get('/portal');
      const claimLink = /href="(\/portal\/claims\/[^"#]+)"/.exec(home.body)?.[1];
      const pages = [home.body, ...(claimLink === undefined ? [] : [(await ivy.get(claimLink)).body])].join('\n');
      assert.match(pages, /The figure you were shown/);
      assert.match(pages, /up to £255,000/);
      assert.doesNotMatch(pages, /£127,500 to £255,000/);
    } finally { w.made.close(); }
  });

  test('F2 and F4: "A GP surgery holds…"; the thank-you page says only the postcode was looked up', async () => {
    const w = await web();
    try {
      const c = w.client();
      await c.get('/assessment');
      await c.post('/assessment/buildings', { b0_sector: 'gp' });
      await c.post('/assessment/spend-on', { b0_trigger: 'purchase' });
      await c.post('/assessment/amounts', { b0_spend: '850000', b0_date: '06/2019' });
      const tax = await c.get('/assessment/tax');
      assert.match(tax.body, /A GP surgery holds fixtures that can qualify/);
      assert.doesNotMatch(tax.body, /GP \/ primary care holds/);
      await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
      await c.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
      await c.post('/assessment/works', { b0_works: 'no' });
      await c.post('/assessment/details', { b0_business: 'Invented Funnel Surgery', b0_entity: 'partnership', b0_line1: 'Invented House', b0_postcode: 'ZZ9 9ZZ' });
      const figure = await c.get('/assessment/figure');
      const slot = /name="slot" value="([^"]+)"/.exec(figure.body)?.[1] ?? '';
      const done = await c.post('/assessment/close', {
        first_name: 'A', surname: 'Person', job_role: 'owner_director', channel: 'phone', phone: '01632 960111', contact_consent: 'on', ...(slot === '' ? {} : { slot }),
      });
      assert.equal(done.status, 200, 'the funnel did not close');
      assert.match(done.body, /We looked up your postcode only to find your address\. No property registers have been checked yet\./);
      assert.doesNotMatch(done.body, /Nothing has been looked up about your property/);
    } finally { w.made.close(); }
  });
});

async function as(w: { as: (email: string) => Promise<{ get: (p: string) => Promise<{ status: number; body: string; location: string | null; type: string | null; bytes: Buffer }>; post: (p: string, f: Record<string, string>) => Promise<{ status: number; body: string; location: string | null }> }> }, email: string) {
  return w.as(email);
}
