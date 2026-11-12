/**
 * PHASE 161m2 (helper B), 11 November 2026: THE TWO TIMED EMAILS, AND THE STEP NEWS ON THE LAYOUT.
 *
 *   1 · letter-reminder (letterRemindersDue): once, 5 working days after the letter was sent, if it is not signed;
 *       never twice; never for a signed letter; a do-not-contact client is refused and not tried again
 *   2 · documents-received (documentsReceivedDigest): at most once a day per client, from 6pm UK time, listing what a
 *       client login uploaded that day; never a member of staff's upload, never a refused file
 *   3 · the step news (stepNewsEmail): survey-booked, survey-done and report-ready in the approved words, with no
 *       figure; every other step keeps its words, its told line as the heading
 * These are new names, so this file is red on the old code. Everything is invented.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUser } from '../../src/core/users.ts';
import { DOCUMENTS_DIGEST_FROM_HOUR, documentsReceivedDigest, LETTER_REMINDER_WORKING_DAYS, letterRemindersDue, stepDef } from '../../src/modules/claims/index.ts';
import { stepNewsEmail } from '../../src/modules/crm/tell-and-move.ts';
import { brandedEmail } from '../../src/integrations/index.ts';
import { testApp } from '../helpers.ts';

type TestApp = Awaited<ReturnType<typeof testApp>>;
type Mail = { to_email: string; subject: string; body: string; html_body: string | null; business_id: string | null };
const ORIGIN = 'https://caprebate.example.invalid';
const T0 = '2026-10-06T09:00:00.000Z';
const mails = (a: TestApp): Mail[] => a.db.all<Mail>('SELECT to_email, subject, body, html_body, business_id FROM outbox ORDER BY rowid');
const heading = (html: string | null): string => /<h1 [^>]*>([^<]*)<\/h1>/.exec(html ?? '')?.[1] ?? '';
const button = (html: string | null): { href: string; label: string } | null => {
  const m = /<a href="([^"]*)" style="display:inline-block;padding:13px 28px[^"]*">([^<]*)<\/a>/.exec(html ?? '');
  return m === null ? null : { href: m[1] ?? '', label: m[2] ?? '' };
};

function business(a: TestApp, name: string): string {
  const id = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,contact_email) VALUES (?,?,?,?,?,?,?)',
    [id, name, 'gp', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE', `office-${id.slice(0, 6)}@example.invalid`]);
  return id;
}
function login(a: TestApp, biz: string | null, email: string, role: 'CLIENT' | 'SALES' = 'CLIENT'): string {
  return createUser(a.db, a.now, { email, display_name: 'Ivy Inventedperson', role, password_hash: 'fake$x', business_id: biz }).id;
}
/** A letter sent at `sent_at`, in `state`. */
function letter(a: TestApp, biz: string, sent_at: string, state: 'SENT' | 'VIEWED' | 'SIGNED' = 'SENT'): string {
  const id = randomUUID();
  a.db.run('INSERT INTO engagements (id, business_id, letter_state, created_at, sent_at, sent_by, signed_at) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    [id, biz, state, sent_at, sent_at, state === 'SIGNED' ? sent_at : null]);
  return id;
}

/* ================================================================== *
 * 1 · LETTER-REMINDER
 * ================================================================== */

describe('161m2 B · 1 · letter-reminder: once, five working days after the letter was sent, if not signed', () => {
  const SENT = '2026-11-02T10:00:00.000Z'; // a Monday
  test('four working days: nothing; five: one email to each client login, in the approved words; again: nothing', async () => {
    const a = await testApp();
    try {
      assert.equal(LETTER_REMINDER_WORKING_DAYS, 5);
      const biz = business(a, 'Invented Surgery Partnership');
      login(a, biz, 'ivy@example.invalid');
      login(a, biz, 'ken@example.invalid');
      letter(a, biz, SENT);
      assert.deepEqual(letterRemindersDue(a, '2026-11-06T16:00:00.000Z', ORIGIN), { reminded: 0, queued: 0 }, 'reminded after four working days');
      assert.equal(mails(a).length, 0);
      assert.deepEqual(letterRemindersDue(a, '2026-11-09T09:00:00.000Z', ORIGIN), { reminded: 1, queued: 2 });
      const m = mails(a);
      assert.deepEqual(m.map((x) => x.to_email).sort(), ['ivy@example.invalid', 'ken@example.invalid']);
      for (const e of m) {
        assert.equal(e.subject, 'Your engagement letter is waiting for you');
        assert.equal(heading(e.html_body), 'Your engagement letter is waiting for you');
        assert.deepEqual(button(e.html_body), { href: `${ORIGIN}/portal/letter`, label: 'Read the letter' });
        assert.match(e.body, /We sent our engagement letter for Invented Surgery Partnership on 2 Nov 2026\. It has not been signed yet\./);
      }
      assert.deepEqual(letterRemindersDue(a, '2026-11-16T09:00:00.000Z', ORIGIN), { reminded: 0, queued: 0 }, 'reminded twice');
      assert.equal(mails(a).length, 2);
    } finally { a.close(); }
  });

  test('a bank holiday is not a working day; a signed letter is never reminded', async () => {
    const a = await testApp();
    try {
      const biz = business(a, 'Invented Christmas Practice');
      login(a, biz, 'noel@example.invalid');
      letter(a, biz, '2026-12-21T10:00:00.000Z'); // Monday; 25 and 28 December are bank holidays
      assert.equal(letterRemindersDue(a, '2026-12-29T10:00:00.000Z', ORIGIN).reminded, 0, 'counted a bank holiday');
      assert.equal(letterRemindersDue(a, '2026-12-30T10:00:00.000Z', ORIGIN).reminded, 1);
      const signed = business(a, 'Invented Signed Limited');
      login(a, signed, 'sig@example.invalid');
      letter(a, signed, SENT, 'SIGNED');
      assert.equal(letterRemindersDue(a, '2027-01-20T10:00:00.000Z', ORIGIN).reminded, 0, 'a signed letter was reminded');
      assert.equal(mails(a).filter((m) => m.business_id === signed).length, 0);
    } finally { a.close(); }
  });

  test('a do-not-contact client is refused by the outbox, recorded, and not tried again', async () => {
    const a = await testApp();
    try {
      const biz = business(a, 'Invented Quiet Limited');
      login(a, biz, 'quiet@example.invalid');
      letter(a, biz, SENT, 'VIEWED');
      a.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [biz]);
      assert.deepEqual(letterRemindersDue(a, '2026-11-10T09:00:00.000Z', ORIGIN), { reminded: 1, queued: 0 });
      assert.equal(mails(a).length, 0);
      assert.equal(a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ENGAGEMENT_LETTER_REMINDED' AND outcome = 'REFUSED'")?.n, 1);
      assert.deepEqual(letterRemindersDue(a, '2026-11-11T09:00:00.000Z', ORIGIN), { reminded: 0, queued: 0 });
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * 2 · DOCUMENTS-RECEIVED, THE DAY'S DIGEST
 * ================================================================== */

function upload(a: TestApp, biz: string, by: string, at: string, opts: { type?: string; failed?: boolean } = {}): void {
  const type = opts.type ?? a.db.get<{ code: string }>('SELECT code FROM document_types WHERE active = 1 ORDER BY ord LIMIT 1')!.code;
  const seq = (a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ?', [biz, type])?.n ?? 0) + 1;
  const l = randomUUID();
  a.db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [l, biz, type, seq, by, at]);
  a.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code, failure_code) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
    [randomUUID(), biz, by, `doc-${seq}`, opts.failed === true ? 'FAILED' : 'RECEIVED', at, l, type, opts.failed === true ? 'NOT_A_PDF' : null]);
}

describe('161m2 B · 2 · documents-received: one digest a day per client, of what the client sent', () => {
  test('before 6pm nothing; at 6pm one email listing the client\'s uploads of that day, not staff\'s or refused ones; once a day', async () => {
    const a = await testApp();
    try {
      assert.equal(DOCUMENTS_DIGEST_FROM_HOUR, 18);
      const biz = business(a, 'Invented Uploads Limited');
      const client = login(a, biz, 'up@example.invalid');
      const sales = login(a, null, 'sales-up@example.invalid', 'SALES');
      const label = a.db.get<{ label: string }>('SELECT label FROM document_types WHERE active = 1 ORDER BY ord LIMIT 1')!.label;
      upload(a, biz, client, '2026-11-10T15:00:00.000Z'); // yesterday
      upload(a, biz, client, '2026-11-11T09:30:00.000Z');
      upload(a, biz, client, '2026-11-11T11:00:00.000Z');
      upload(a, biz, sales, '2026-11-11T12:00:00.000Z');
      upload(a, biz, client, '2026-11-11T13:00:00.000Z', { failed: true });
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T17:59:00.000Z', ORIGIN), { state: 'NOT_YET', clients: 0, queued: 0 });
      assert.equal(mails(a).length, 0);
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T18:05:00.000Z', ORIGIN), { state: 'RAN', clients: 1, queued: 1 });
      const m = mails(a);
      assert.equal(m.length, 1);
      const e = m[0]!;
      assert.equal(e.to_email, a.db.get<{ e: string }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [biz])!.e);
      assert.equal(e.subject, 'Thank you, we have your documents');
      assert.equal(heading(e.html_body), 'Thank you, we have your documents');
      assert.deepEqual(button(e.html_body), { href: `${ORIGIN}/portal/documents`, label: 'See your documents' });
      assert.match(e.body, /We have received the following today:\n\n/);
      // Yesterday's was document 1; today's two by the client are 2 and 3; staff's (4) and the refused one (5) are not listed.
      assert.ok(e.body.includes(`- ${label} 2\n- ${label} 3\n\n`), e.body);
      assert.doesNotMatch(e.body, new RegExp(`${label} (1|4|5)\\b`));
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T21:00:00.000Z', ORIGIN), { state: 'RAN', clients: 0, queued: 0 }, 'twice in a day');
      assert.equal(mails(a).length, 1);
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-12T19:00:00.000Z', ORIGIN), { state: 'RAN', clients: 0, queued: 0 }, 'a day with no uploads');
    } finally { a.close(); }
  });

  test('only staff uploaded: nothing; a do-not-contact client: refused, recorded, not tried again that day', async () => {
    const a = await testApp();
    try {
      const biz = business(a, 'Invented Staff Only Limited');
      const sales = login(a, null, 'sales-only@example.invalid', 'SALES');
      upload(a, biz, sales, '2026-11-11T10:00:00.000Z');
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T19:00:00.000Z', ORIGIN), { state: 'RAN', clients: 0, queued: 0 });
      const quiet = business(a, 'Invented Quiet Uploads Limited');
      const client = login(a, quiet, 'quiet-up@example.invalid');
      upload(a, quiet, client, '2026-11-11T10:00:00.000Z');
      a.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [quiet]);
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T19:10:00.000Z', ORIGIN), { state: 'RAN', clients: 1, queued: 0 });
      assert.deepEqual(documentsReceivedDigest(a, '2026-11-11T19:15:00.000Z', ORIGIN), { state: 'RAN', clients: 0, queued: 0 });
      assert.equal(mails(a).length, 0);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * 3 · THE STEP NEWS
 * ================================================================== */

describe('161m2 B · 3 · the step news: the approved words for the survey and the report; the others keep theirs', () => {
  const portal = `${ORIGIN}/portal`;
  test('report-ready: the approved words, the button to the report, and no figure', () => {
    const e = brandedEmail(stepNewsEmail(stepDef('REPORT')!, { property: 'Invented House, Plymouth', surveyor: null, next: null, portal }), { publicOrigin: ORIGIN });
    assert.equal(e.subject, 'Your capital allowances report is ready');
    assert.equal(heading(e.html), 'Your report is ready');
    assert.deepEqual(button(e.html), { href: `${ORIGIN}/portal/report`, label: 'Read your report' });
    assert.match(e.text, /Your capital allowances report for Invented House, Plymouth is ready\./);
    assert.match(e.text, /Once you accept it, we send your accountant a pack so they can include the claim in your tax return\./);
    assert.doesNotMatch(e.text, /£/);
  });

  test('survey-booked names the surveyor where one is assigned; survey-done says what happens next', () => {
    const booked = brandedEmail(stepNewsEmail(stepDef('SURVEY_BOOKED')!, { property: 'Invented House', surveyor: 'Sam Surveyor', next: null, portal }));
    assert.match(booked.text, /^Your survey is booked\n\nProperty: Invented House\nSurveyor: Sam Surveyor, chartered surveyor\n/);
    const none = brandedEmail(stepNewsEmail(stepDef('SURVEY_BOOKED')!, { property: 'Invented House', surveyor: null, next: null, portal }));
    assert.doesNotMatch(none.text, /Surveyor:/);
    const done = brandedEmail(stepNewsEmail(stepDef('SURVEY_DONE')!, { property: 'Invented House', surveyor: null, next: 'Expert sign-off', portal }));
    assert.equal(done.subject, 'Your survey is done');
    assert.match(done.text, /Thank you for having our surveyor at Invented House\.\n\nWhat happens next\n\n- The surveyor values the fixtures and plant in the building\./);
  });

  test('another step: its told line is the heading, its subject as before, the next phase where a claim moved', () => {
    const e = brandedEmail(stepNewsEmail(stepDef('COMPANY')!, { property: null, surveyor: null, next: 'We research your property', portal }), { publicOrigin: ORIGIN });
    assert.equal(e.subject, 'Cap Rebate news: we have checked your company details');
    assert.equal(heading(e.html), 'Cap Rebate has checked your company details');
    assert.match(e.text, /We are now moving on to the next phase: We research your property\.\n\nYou can follow your claim, step by step, in your portal\./);
    assert.deepEqual(button(e.html), { href: portal, label: 'Open your portal' });
  });
});
