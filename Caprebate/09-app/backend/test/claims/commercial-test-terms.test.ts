/**
 * PHASE 153d, 4 October 2026 — the commercial papers in test form, built on our recommendation for the director and the
 * solicitor to check. The back end's half; the papers are in OneDrive (06-commercial-and-governance, 08-monday-doc-exports).
 *
 *   line 1        Word question 23  — a fixed disposal fee from the job cost model, never a percentage; a test default
 *   lines 2, 3, 7 Word questions 33, 34, 196 — the TEST-ONLY engagement letter: clauses 5, 7(d) and 13 were filled, each
 *                 "test default, not agreed"; shown by the test website alone; never signed. PHASE 161m1 (11 November 2026):
 *                 the owner decided every term, so the real letter has no blank and the test copy is the real letter word
 *                 for word with its one header line (line 3's refund run against it is in test/finance/invoices-and-fee-controls.test.ts)
 *   line 5        Word question 45  — the money-laundering check's test defaults: a low/medium/high level, 25%, and
 *                 ordinary partnerships, LLPs and trusts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../src/app/server.ts';
import { seed } from '../../src/app/seed.ts';
import { loadLetter, LETTER_PATH, TEST_LETTER_PATH, TEST_COPY_MARK, TEST_DEFAULT_MARK } from '../../src/modules/claims/letter.ts';
import { letterFees } from '../../src/modules/claims/fee-controls.ts';
import { clawbackReading, DISPOSAL_FEE } from '../../src/modules/claims/claim-record.ts';
import { shownLetter, signingMissing, signEngagement } from '../../src/modules/claims/signing.ts';
import * as A from '../../src/modules/compliance/compliance-aml.ts';
import type * as C from '../../src/modules/compliance/compliance.ts';
import { actor, testApp } from '../helpers.ts';
import { plainDashText } from '../../src/shared/plain-dashes.ts';
import { readZipEntry, DOCX_DOCUMENT_ENTRIES } from '../../src/shared/zip.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..');
const T0 = '2026-10-04T09:00:00.000Z';

describe('line 1 — Word question 23: a fixed disposal fee, a test default', () => {
  test('£290, worked out in the job cost model as our hours at its rate plus its data line, and marked not agreed', () => {
    assert.equal(DISPOSAL_FEE.pence, 29_000);
    assert.equal(DISPOSAL_FEE.status, 'TEST_DEFAULT_NOT_AGREED');
    assert.match(DISPOSAL_FEE.words, /^£290, fixed, for .*test default, not agreed/i);
  });
  test('the staff task and the aftercare panel carry it; the code that raises the task reads it, never restates a figure', () => {
    const src = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'modules', 'claims', 'claim-record.ts'), 'utf8');
    assert.match(src, /Our fee for this work: \$\{DISPOSAL_FEE\.words\}/);
    assert.match(src, /Our fee for that work: \$\{DISPOSAL_FEE\.words\}/);
    assert.ok(!/£290/.test(src), 'the figure is restated in the back end');
  });
});

describe('lines 2, 3 and 7 — Word questions 33, 34 and 196: the test-only engagement letter', () => {
  const real = loadLetter({ path: LETTER_PATH });
  const testCopy = loadLetter({ path: TEST_LETTER_PATH });
  const clause = (l: typeof real, n: string) => l.paragraphs.map((p) => p.text).join('\n').split(/\n(?=\d{1,2}\.\s)/).find((s) => s.startsWith(`${n}. `)) ?? '';

  test('PHASE 161m1: THE REAL LETTER HAS NO BLANK LEFT: every term decided by the owner, and it is not a test copy', () => {
    assert.equal(real.test_copy, false);
    assert.deepEqual(real.openTerms, []);
    assert.ok(!real.paragraphs.some((p) => p.text.includes('[')), 'a square bracket is left in the real letter');
    assert.ok(!real.paragraphs.some((p) => p.text.includes(TEST_DEFAULT_MARK)));
  });

  test('THE TEST COPY IS THE REAL LETTER WORD FOR WORD, with one line under the title: for the test system only, never sent to a client', () => {
    assert.equal(testCopy.test_copy, true);
    // PHASE 160d: the letter is drawn without long dashes; the mark is still read from the document's own words.
    const header = testCopy.paragraphs[1]?.text ?? '';
    assert.ok(header.startsWith(plainDashText(TEST_COPY_MARK)));
    assert.equal(header, 'TEST COPY: for the test system only. This copy is never sent to a client.');
    assert.doesNotMatch(header, /solicitor/);
    assert.deepEqual(testCopy.paragraphs.filter((_, i) => i !== 1), real.paragraphs, 'the test copy differs from the real letter beyond its header line');
    assert.deepEqual(testCopy.openTerms, []);
    assert.ok(!testCopy.paragraphs.some((p) => p.text.includes(TEST_DEFAULT_MARK)));
    // The terms the copy used to carry as test defaults are now the real letter's own words.
    const fees = letterFees(testCopy);
    assert.equal(fees.break_fee.state, 'SET');
    assert.equal(fees.break_fee.state === 'SET' ? fees.break_fee.pence : 0, 99_500);
    assert.match(clause(testCopy, '5'), /£995 per property .*plus the charges of any surveyor already booked for the claim, at cost, in addition/);
    const text = testCopy.paragraphs.map((p) => p.text).join('\n');
    assert.match(text, /they are named in our privacy notice\./);
    assert.match(text, /this clause applies to any reduction in the capital allowances identified/);
    assert.match(text, /applies where the Client accepts a settlement with HM Revenue and Customs/);
  });

  test("PHASE 161m1, THE OWNER'S ANSWERS (11 November 2026): the review note's points written into the letter, and its two reviewer comments gone", () => {
    const text = real.paragraphs.map((p) => p.text).join('\n');
    // 1 and 9: clause 1 supersedes any other document, and the Client is a business.
    assert.match(clause(real, '1'), /It supersedes any engagement form, terms of business or other document issued about the Services, and where any of them differs from this Agreement, this Agreement prevails\./);
    assert.match(clause(real, '1'), /in the course of its business, trade or profession and not as a consumer\./);
    assert.doesNotMatch(text, /accompanying Terms of Business/);
    assert.match(clause(real, '11'), /Where any such document differs from this Agreement, this Agreement prevails\./);
    // Clause 4: the 3% is the only fee, nothing up front; the introducer disclosure.
    assert.match(clause(real, '4'), /It is the only fee we charge for the Services\./);
    assert.match(clause(real, '4'), /We take no payment up front\./);
    assert.match(clause(real, '4'), /we may pay that firm an introduction fee out of our own fee\. It does not increase what the Client pays, and we will tell the Client the amount if asked\./);
    // Clause 5: the current test, invoiced only on early termination, still £995 a property plus a booked surveyor at cost.
    assert.match(clause(real, '5'), /protects our legitimate interest in recovering the costs we commit to when we are instructed.*proportionate to those costs/s);
    assert.match(clause(real, '5'), /only on an invoice we send after that happens\. Nothing is charged in advance\./);
    assert.doesNotMatch(text, /genuine pre-estimate|not a penalty|work carried out up to the date of termination|fees for work already carried out/);
    // 7(a), 10, 13, 14, 16, 18.
    assert.match(clause(real, '7'), /\(a\) the chartered surveyor engaged in connection with the Client's claim, and any chartered tax adviser the Client engages;/);
    assert.match(clause(real, '10'), /the fees paid or payable by the Client under this Agreement or £5,000, whichever is greater, save that/);
    assert.match(clause(real, '10'), /death or personal injury caused by negligence, fraud or fraudulent misrepresentation, or any other liability that cannot be limited or excluded by law\./);
    assert.match(clause(real, '13'), /until HM Revenue and Customs can no longer open an enquiry into the return that includes the claim\./);
    assert.match(clause(real, '14'), /authorise Cap Rebate as its agent with HM Revenue and Customs for the claim, by form 64-8 or by HMRC's online agent authorisation/);
    assert.match(clause(real, '16'), /within six years after it ends/);
    assert.match(clause(real, '16'), /or to a claim made or amended more than six years after this Agreement ends\./);
    assert.match(clause(real, '18'), /must be a director, partner, member or owner of the Client, or someone we agree to in writing\./);
    assert.match(clause(real, '18'), /The check is carried out by Didit, our identity-check provider, as described in our privacy notice\./);
    assert.match(clause(real, '19'), /the agent authority with HM Revenue and Customs at clause 14, and the fee at clause 16 where our work is used within six years/);
    // The numbering is unchanged: clauses 1 to 19, in order.
    assert.deepEqual(real.paragraphs.map((p) => /^(\d{1,2})\.\s/.exec(p.text)?.[1]).filter((n) => n !== undefined).map(Number), Array.from({ length: 19 }, (_, i) => i + 1));
    assert.doesNotMatch(text, /—/, 'a long dash in the letter');
    // 8: no reviewer comment is left in either Word file, and no anchor to one.
    for (const path of [LETTER_PATH, TEST_LETTER_PATH]) {
      const comments = readZipEntry(path, ['word/comments.xml', 'word\\comments.xml']).toString('utf8');
      assert.doesNotMatch(comments, /<w:comment /, `a reviewer comment is left in ${path}`);
      assert.doesNotMatch(readZipEntry(path, DOCX_DOCUMENT_ENTRIES).toString('utf8'), /w:comment(RangeStart|RangeEnd|Reference)/);
    }
  });

  test('line 3: with clause 13 decided the refund applies, in both letters; the switch ships ON since 11 Nov 2026, so it applies as shipped', () => {
    assert.equal(clawbackReading({ openTerms: testCopy.openTerms, gate: { enabled: true } }).reason, 'APPLIES');
    assert.equal(clawbackReading({ openTerms: real.openTerms, gate: { enabled: true } }).reason, 'APPLIES');
    assert.equal(clawbackReading({ openTerms: testCopy.openTerms }).reason, 'APPLIES');
    assert.equal(clawbackReading({ openTerms: real.openTerms }).reason, 'APPLIES');
    assert.equal(clawbackReading({ openTerms: real.openTerms, gate: { enabled: false } }).reason, 'SWITCH_OFF');
  });

  test('A TEST COPY IS NEVER SIGNED, whatever the switch says and even with no term open', () => {
    const missing = signingMissing({ enabled: true, signature_confirmed: true, question: '' }, { open_terms: 0, specimens: 0, test_copy: true });
    assert.equal(missing.length, 1);
    assert.match(missing[0] ?? '', /test copy of the letter.*never be signed/);
    assert.equal(signingMissing({ enabled: true, signature_confirmed: true, question: '' }, { open_terms: 0, specimens: 0, test_copy: false }).length, 0);
    assert.equal(shownLetter({ name: 'Invented Care Limited' }, TEST_LETTER_PATH).test_copy, true);
    assert.equal(shownLetter({ name: 'Invented Care Limited' }).test_copy, false);
  });

  test('a client asked to sign the test copy is refused, with the switch on and the signature confirmed', async () => {
    const a = await testApp();
    try {
      const biz = randomUUID();
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Dental Limited', 'dental', 'ENGAGEMENT', T0, 'WEBSITE']);
      a.db.run("INSERT INTO engagements (id, business_id, letter_state, created_at) VALUES (?, ?, 'SENT', ?)", [randomUUID(), biz, T0]);
      a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-cl','cl@example.invalid','cl@example.invalid','Client','CLIENT','x',?,?,?)", [T0, T0, biz]);
      const letter = shownLetter({ name: 'Invented Dental Limited' }, TEST_LETTER_PATH);
      const r = signEngagement({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID }, actor('CLIENT', 'u-cl', biz), biz,
        { full_name: 'Ivy Inventedperson', role: 'Director', authorised: true, letter_sha256: letter.sha256 },
        { ip: '127.0.0.1', session_id: 's-1' }, { cfg: { enabled: true, signature_confirmed: true, question: '' }, letterPath: TEST_LETTER_PATH });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /test copy/);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM engagement_signatures')?.n, 0);
    } finally { a.close(); }
  });

  test('ONLY THE TEST WEBSITE SHOWS IT: the portal shows the real letter unless createApp is told testLetter, which api/index.mjs alone does', async () => {
    for (const testLetter of [false, true]) {
      const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153d-')), ...(testLetter ? { testLetter } : {}) });
      try {
        await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
        const addr = made.server.address();
        const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
        const s = await seed(made.app.db, made.app.hasher, made.app.now);
        const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email: 'client@example.invalid', password: s.password }).toString() });
        const cookie = login.headers.getSetCookie().map((x) => x.split(';')[0] ?? '').join('; ');
        const page = await (await fetch(`${base}/portal/letter`, { headers: { cookie } })).text();
        assert.equal(page.includes('TEST COPY'), testLetter, `testLetter ${String(testLetter)}`);
        assert.equal(page.includes('This copy is never sent to a client.'), testLetter);
        assert.equal(page.includes('test default, not agreed'), false, 'Phase 161m1: neither letter carries a test default now');
      } finally { made.close(); }
    }
    const api = readFileSync(join(ROOT, 'api', 'index.mjs'), 'utf8');
    assert.match(api, /^\s*testLetter: true,$/m);
    const server = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app', 'server.ts'), 'utf8');
    assert.match(server, /opts\.testLetter === true \? \{ letterPath: TEST_LETTER_PATH \} : \{\}/);
  });
});

describe('line 5 — Word question 45: the money-laundering check’s test defaults', () => {
  function deps(a: Awaited<ReturnType<typeof testApp>>): C.ComplianceDeps {
    return { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
  }
  async function app() {
    const a = await testApp();
    a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-ADMIN','a@example.invalid','a@example.invalid','Admin','ADMIN','x',?,?,NULL)", [T0, T0]);
    const biz = randomUUID();
    a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Partners LLP', 'dental', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
    return { a, biz };
  }
  const ADMIN = actor('ADMIN');

  test('the three new kinds of claimant open a check, and each says what to identify; 25% is the owner test', async () => {
    const { a, biz } = await app();
    try {
      for (const t of ['ORDINARY_PARTNERSHIP', 'LLP', 'TRUST']) {
        const r = A.openCheck(deps(a), ADMIN, { business_id: biz, claimant_type: t });
        assert.equal(r.ok, true, `${t}: ${r.ok ? '' : r.why}`);
        assert.match(A.CLAIMANT_GUIDE[t]?.label ?? '', /test default/);
        assert.match(A.CLAIMANT_GUIDE[t]?.owners ?? '', /more than 25%/);
      }
      assert.equal(A.AML_TEST_DEFAULTS.ownership_threshold_percent, 25);
      assert.equal(A.AML_TEST_DEFAULTS.status, 'TEST_DEFAULT_NOT_AGREED');
      assert.match(A.RISK_RATING_NOTE, /^Test default, not agreed/);
      assert.equal(A.AUTHORITY_BASES['DESIGNATED_MEMBER'], 'A designated member of an LLP');
    } finally { a.close(); }
  });

  test('the risk level is low, medium or high — anything else is refused, by the form and by the table; the words stay beside it', async () => {
    const { a, biz } = await app();
    try {
      const id = A.openCheck(deps(a), ADMIN, { business_id: biz, claimant_type: 'LLP' });
      assert.ok(id.ok);
      const k = id.ok ? id.id : '';
      assert.equal(A.updateCheck(deps(a), ADMIN, k, { risk_level: 'EXTREME' }).ok, false);
      assert.equal(A.updateCheck(deps(a), ADMIN, k, { risk_level: 'MEDIUM', risk_rating: 'One property, a known firm' }).ok, true);
      assert.deepEqual(a.db.get('SELECT risk_level, risk_rating FROM cdd_checks WHERE id = ?', [k]), { risk_level: 'MEDIUM', risk_rating: 'One property, a known firm' });
      assert.throws(() => a.db.run("UPDATE cdd_checks SET risk_level = 'SEVERE' WHERE id = ?", [k]), /constraint/i);
      assert.throws(() => a.db.run("UPDATE cdd_checks SET authority_basis = 'NOBODY' WHERE id = ?", [k]), /constraint/i);
    } finally { a.close(); }
  });

  test('THE TABLE REBUILT KEEPS ITS SEVEN TRIGGERS AND ITS INDEX, and the check is still never deleted', async () => {
    const { a, biz } = await app();
    try {
      const names = a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('trigger','index') AND (tbl_name = 'cdd_checks' OR sql LIKE '%cdd_checks%') AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
      for (const n of ['cdd_checks_business_idx', 'cdd_checks_finished_is_final', 'cdd_checks_no_delete', 'cdd_checks_evidence_is_the_organisations',
        'cdd_checks_authority_is_a_contact_of_the_organisation', 'cdd_checks_complete_needs_its_owners',
        'cdd_psc_decisions_the_organisations_psc_pull', 'cdd_beneficial_owners_on_an_open_check_of_that_organisation']) {
        assert.ok(names.includes(n), `${n} was lost in the rebuild`);
      }
      const r = A.openCheck(deps(a), ADMIN, { business_id: biz, claimant_type: 'TRUST' });
      assert.throws(() => a.db.run('DELETE FROM cdd_checks WHERE id = ?', [r.ok ? r.id : '']), /never deleted/);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM pragma_foreign_key_check')?.n, 0);
    } finally { a.close(); }
  });
});
