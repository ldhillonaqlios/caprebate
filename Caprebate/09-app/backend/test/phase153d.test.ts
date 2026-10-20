/**
 * PHASE 153d, 4 October 2026 — the commercial papers in test form, built on our recommendation for the director and the
 * solicitor to check. The back end's half; the papers are in OneDrive (06-commercial-and-governance, 08-monday-doc-exports).
 *
 *   line 1        Word question 23  — a fixed disposal fee from the job cost model, never a percentage; a test default
 *   lines 2, 3, 7 Word questions 33, 34, 196 — the TEST-ONLY engagement letter: clauses 5, 7(d) and 13 filled, each
 *                 "test default, not agreed"; shown by the test website alone; never signed; the real letter untouched
 *                 (line 3's refund run against it is in test/finance-claim.test.ts, beside the refund's own test)
 *   line 5        Word question 45  — the money-laundering check's test defaults: a low/medium/high level, 25%, and
 *                 ordinary partnerships, LLPs and trusts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { loadLetter, LETTER_PATH, TEST_LETTER_PATH, TEST_COPY_MARK, TEST_DEFAULT_MARK } from '../src/web/letter.ts';
import { letterFees } from '../src/web/fee-controls.ts';
import { clawbackReading, DISPOSAL_FEE } from '../src/web/claim-record.ts';
import { shownLetter, signingMissing, signEngagement } from '../src/web/signing.ts';
import * as A from '../src/web/compliance-aml.ts';
import type * as C from '../src/web/compliance.ts';
import { actor, testApp } from './helpers.ts';
import { plainDashText } from '../src/web/plain-dashes.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const T0 = '2026-10-04T09:00:00.000Z';

describe('line 1 — Word question 23: a fixed disposal fee, a test default', () => {
  test('£290, worked out in the job cost model as our hours at its rate plus its data line, and marked not agreed', () => {
    assert.equal(DISPOSAL_FEE.pence, 29_000);
    assert.equal(DISPOSAL_FEE.status, 'TEST_DEFAULT_NOT_AGREED');
    assert.match(DISPOSAL_FEE.words, /^£290, fixed, for .*test default, not agreed/i);
  });
  test('the staff task and the aftercare panel carry it; the code that raises the task reads it, never restates a figure', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'claim-record.ts'), 'utf8');
    assert.match(src, /Our fee for this work: \$\{DISPOSAL_FEE\.words\}/);
    assert.match(src, /Our fee for that work: \$\{DISPOSAL_FEE\.words\}/);
    assert.ok(!/£290/.test(src), 'the figure is restated in the back end');
  });
});

describe('lines 2, 3 and 7 — Word questions 33, 34 and 196: the test-only engagement letter', () => {
  const real = loadLetter({ path: LETTER_PATH });
  const testCopy = loadLetter({ path: TEST_LETTER_PATH });
  const clause = (l: typeof real, n: string) => l.paragraphs.map((p) => p.text).join('\n').split(/\n(?=\d{1,2}\.\s)/).find((s) => s.startsWith(`${n}. `)) ?? '';

  test('THE REAL LETTER IS UNTOUCHED: its clause 5, 7(d) and 13 brackets are still there, and it is not a test copy', () => {
    assert.equal(real.test_copy, false);
    const open = real.openTerms.map((t) => `${t.clause.split(' —')[0]} ${t.text}`);
    assert.ok(open.some((t) => t.startsWith('clause 5 ') && t.includes('[X]')));
    assert.ok(open.some((t) => t.startsWith('clause 7 ') && t.includes('named in our privacy notice /')));
    assert.equal(real.openTerms.filter((t) => /^clause 13 —/.test(t.clause)).length, 2);
    assert.ok(!real.paragraphs.some((p) => p.text.includes(TEST_DEFAULT_MARK)));
  });

  test('THE TEST COPY: clause 5 is £995 a property plus a booked surveyor at cost; 7(d) names the privacy notice; 13 is any reduction and counts settlements — each marked', () => {
    assert.equal(testCopy.test_copy, true);
    // PHASE 160d: the letter is drawn without long dashes; the mark is still read from the document's own words.
    assert.ok(testCopy.paragraphs.some((p) => p.text.startsWith(plainDashText(TEST_COPY_MARK))));
    assert.equal(testCopy.test_copy, true);
    const fees = letterFees(testCopy);
    assert.equal(fees.break_fee.state, 'SET');
    assert.equal(fees.break_fee.state === 'SET' ? fees.break_fee.pence : 0, 99_500);
    assert.match(clause(testCopy, '5'), /£995 per property .*plus the charges of any surveyor already booked for the claim, at cost \(test default, not agreed\)/);
    assert.match(testCopy.paragraphs.map((p) => p.text).join('\n'), /they are named in our privacy notice \(test default, not agreed\)/);
    const text = testCopy.paragraphs.map((p) => p.text).join('\n');
    assert.match(text, /this clause applies to any reduction \(test default, not agreed\)/);
    assert.match(text, /accepts a settlement with HM Revenue and Customs \(test default, not agreed\)/);
    assert.equal(testCopy.openTerms.filter((t) => /^clause (5|13) —/.test(t.clause)).length, 0);
    assert.equal(testCopy.openTerms.filter((t) => t.text.includes('privacy notice')).length, 0);
    // Only the three: every other open term of the real letter is still open in the copy.
    assert.deepEqual(testCopy.openTerms.map((t) => t.text),
      real.openTerms.filter((t) => !/^clause (5|13) —/.test(t.clause) && !t.text.includes('privacy notice')).map((t) => t.text));
  });

  test('line 3: with clause 13 filled the refund applies once switched on; it is still off as shipped', () => {
    assert.equal(clawbackReading({ openTerms: testCopy.openTerms, gate: { enabled: true } }).reason, 'APPLIES');
    assert.equal(clawbackReading({ openTerms: real.openTerms, gate: { enabled: true } }).reason, 'CLAUSE_13_BLANK');
    assert.equal(clawbackReading({ openTerms: testCopy.openTerms }).reason, 'SWITCH_OFF');
  });

  test('A TEST COPY IS NEVER SIGNED, whatever the switch says and even with no term open', () => {
    const missing = signingMissing({ enabled: true, solicitor_confirmed: true, question: '' }, { open_terms: 0, specimens: 0, test_copy: true });
    assert.equal(missing.length, 1);
    assert.match(missing[0] ?? '', /test copy of the letter.*never be signed/);
    assert.equal(signingMissing({ enabled: true, solicitor_confirmed: true, question: '' }, { open_terms: 0, specimens: 0, test_copy: false }).length, 0);
    assert.equal(shownLetter({ name: 'Invented Care Limited' }, TEST_LETTER_PATH).test_copy, true);
    assert.equal(shownLetter({ name: 'Invented Care Limited' }).test_copy, false);
  });

  test('a client asked to sign the test copy is refused, with the switch on and the solicitor’s yes', async () => {
    const a = await testApp();
    try {
      const biz = randomUUID();
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Invented Dental Limited', 'dental', 'ENGAGEMENT', T0, 'WEBSITE']);
      a.db.run("INSERT INTO engagements (id, business_id, letter_state, created_at) VALUES (?, ?, 'SENT', ?)", [randomUUID(), biz, T0]);
      a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-cl','cl@example.invalid','cl@example.invalid','Client','CLIENT','x',?,?,?)", [T0, T0, biz]);
      const letter = shownLetter({ name: 'Invented Dental Limited' }, TEST_LETTER_PATH);
      const r = signEngagement({ db: a.db, audit: a.audit, email: a.email, now: a.now, newId: randomUUID }, actor('CLIENT', 'u-cl', biz), biz,
        { full_name: 'Ivy Inventedperson', role: 'Director', authorised: true, letter_sha256: letter.sha256 },
        { ip: '127.0.0.1', session_id: 's-1' }, { cfg: { enabled: true, solicitor_confirmed: true, question: '' }, letterPath: TEST_LETTER_PATH });
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
        assert.equal(page.includes('test default, not agreed'), testLetter);
      } finally { made.close(); }
    }
    const api = readFileSync(join(ROOT, 'api', 'index.mjs'), 'utf8');
    assert.match(api, /^\s*testLetter: true,$/m);
    const server = readFileSync(join(import.meta.dirname, '..', 'src', 'server.ts'), 'utf8');
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
