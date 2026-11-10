/**
 * THE CLAIMS' READS OF THE SURVEY'S TABLES GIVE THE SAME ROWS WHEN SPLIT BY OWNER (Phase 161l2; 09-app/docs/ARCHITECTURE.md
 * rule 3).
 *
 * Seven statements the claims ran joined the survey's tables (the packs, their approved versions, their legal answers,
 * the sign-off requests and the jobs) to tables of other owners: the claims' own (the claims, the tax adviser's sign-offs,
 * the stage moves, the document links) and the client record's (the contacts and the companies). Each is now split: the
 * survey runs the part on its own tables, the claims run theirs, the client record gives the names, and the rows are put
 * together in code. This test keeps each statement as it was written before the split, word for word, runs it on a seeded
 * database with awkward rows added (equal sort keys, a pack with no property, a job with no claim, two sign-offs of one
 * version, a figure written as text, a missing figure, a reopening before and after a sign-off, a link taken off, a
 * request whose contact has gone, an unknown id), and expects the new read to give exactly its rows: the same rows, in
 * the same order, with the same values and the same NULLs. Each read is found by its name wherever it lives now, so the
 * test runs unchanged before and after the split.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import type { Db, Param, Row } from '../../src/core/index.ts';
import { fillUsers } from '../../src/core/index.ts';
import { listOutboxIdSentAtLastErrorByIds } from '../../src/integrations/index.ts';

const VOIDING = JSON.stringify(['ENQUIRY', 'ASSESSMENT', 'ENGAGEMENT', 'DATA_GATHERING', 'SURVEY', 'VALUATION', 'TAX_ADVISER_SIGNOFF']);

/* Each statement as it was before the split, word for word: [get or all, the statement, the parameter lists]. */
type Pin = readonly ['get' | 'all', string, (db: Db) => (readonly Param[])[], 'ordered' | 'as a set', ((db: Db, rows: Row[]) => Row[])?];
const BEFORE: Readonly<Record<string, Pin>> = {
  getPackSignoffRequestsIdApprovalIdByTokenSha256: ['get',
    'SELECT r.id, r.approval_id, r.expires_at, c.full_name AS name, b.name AS company, a.snapshot_json, a.fingerprint, x.outcome, x.answered_at, j.claim_id, j.business_id ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN contacts c ON c.id = r.contact_id ' +
    'JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN businesses b ON b.id = j.business_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?',
    (db) => [...db.all<{ t: string }>('SELECT token_sha256 AS t FROM pack_signoff_requests').map((r) => [r.t]), ['0'.repeat(64)]], 'ordered'],
  // Phase 161l1 had already taken the users and the outbox out of this one: its statement as it stood, and the same steps after it.
  listPackSignoffRequestsIdApprovalIdByJobId: ['all',
    'SELECT r.id, r.approval_id, a.version, c.full_name AS contact_name, r.to_email, r.permission_note, r.sent_by AS sent_by_name, r.sent_at, r.expires_at, ' +
    'r.outbox_id AS sent_at_outbox, r.outbox_id AS send_error, x.id AS a_id, x.outcome, x.signer_name, x.signer_firm, x.signer_credential, x.reason, x.answered_at, ' +
    'k.signoff_id AS recorded_signoff ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN contacts c ON c.id = r.contact_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id LEFT JOIN pack_signoff_recorded k ON k.answer_id = x.id ' +
    'WHERE p.job_id = ? ORDER BY r.sent_at DESC, r.rowid DESC',
    (db) => [...db.all<{ id: string }>('SELECT id FROM surveyor_jobs').map((r) => [r.id]), ['no-such-job']], 'ordered',
    (db, rows) => {
      const filled = fillUsers(db, rows, { sent_by_name: 'display_name' });
      const ids = [...new Set(filled.map((r) => r.sent_at_outbox).filter((x): x is string => typeof x === 'string'))];
      const sent = new Map(ids.length === 0 ? [] : listOutboxIdSentAtLastErrorByIds<{ id: string; sent_at: unknown; last_error: unknown }>(db, [JSON.stringify(ids)]).map((o) => [o.id, o]));
      return filled.flatMap((r) => {
        const o = sent.get(String(r.sent_at_outbox));
        return o === undefined ? [] : [{ ...r, sent_at_outbox: o.sent_at, send_error: o.last_error }];
      });
    }],
  // And this one's users: its statement as it stood, and the step after it.
  listSurveyPackApprovalsIdVersionByBusinessIdClaimId: ['all',
    'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, a.approved_by AS approver_name, a.approved_at, a.snapshot_json, j.id AS job_id, j.claim_id ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.business_id = ? AND j.claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')) " +
    'ORDER BY a.approved_at DESC, a.version DESC',
    (db) => [...db.all<{ id: string }>('SELECT id FROM businesses').map((r) => [r.id]), ['no-such-business']], 'ordered',
    (db, rows) => fillUsers(db, rows, { approver_name: 'display_name' })],
  getSurveyPackApprovalsSnapshotJsonVersionByPropertyId: ['get',
    'SELECT a.snapshot_json, a.version, a.approved_at, j.claim_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN claims c ON c.id = j.claim_id ' +
    'JOIN tax_adviser_signoffs s ON s.approval_id = a.id AND s.claim_id = j.claim_id ' +
    'WHERE (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) ' +
    "AND s.recorded_at >= COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = j.claim_id AND m.kind = 'REOPEN' " +
    "AND m.to_stage IN (SELECT value FROM json_each(?))), '') " +
    'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1',
    (db) => [...db.all<{ id: string }>('SELECT id FROM properties').flatMap((r) => [[r.id, r.id, VOIDING], [r.id, r.id, '[]']]), ['no-such-place', 'no-such-place', VOIDING]], 'ordered'],
  listSurveyPackApprovalsFingerprintSnapshotJsonByClaimId: ['all',
    'SELECT a.fingerprint, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence') AND s.recorded_at >= ?) " +
    'ORDER BY a.approved_at DESC, a.version DESC',
    (db) => [...db.all<{ id: string }>('SELECT id FROM claims').flatMap((r) => [[r.id, ''], [r.id, '2026-09-03T00:00:00.000Z'], [r.id, '2099-01-01']]), ['no-such-claim', '']], 'ordered'],
  getSurveyPackLegalAnswersValueJsonAtByQuestionIdPropertyId: ['get',
    'SELECT a.value_json, a.at FROM survey_pack_legal_answers a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    "LEFT JOIN claims c ON c.id = j.claim_id WHERE a.question_id = 'G9d' AND (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) " +
    'ORDER BY a.at DESC, a.seq DESC LIMIT 1',
    (db) => [...db.all<{ id: string }>('SELECT id FROM properties').map((r) => [r.id, r.id]), ['no-such-place', 'no-such-place']], 'ordered'],
  // DISTINCT with no ORDER BY: the statement promised the surveyors, not an order, and its caller reads them as a set.
  listSurveyorJobsSurveyorIdBySurveyorIdClaimId: ['all',
    'SELECT DISTINCT j.surveyor_id FROM surveyor_jobs j WHERE j.surveyor_id IS NOT NULL AND j.claim_id IN (' +
    'SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
    'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL)',
    (db) => [...db.all<{ id: string }>('SELECT id FROM logical_documents').map((r) => [r.id, r.id]), ['no-such-document', 'no-such-document']], 'as a set'],
};

type Read = (db: Db, params?: readonly Param[]) => unknown;
/** Where a read is found now: the claims' or the survey's data files, borrowed first (a borrowed file that is gone reads as empty). */
async function reads(): Promise<(name: string) => Read | undefined> {
  const files = await Promise.all(['claims/data-borrowed.ts', 'claims/data.ts', 'survey/data-borrowed.ts', 'survey/data.ts']
    .map(async (f) => await import(`../../src/modules/${f}`).catch(() => ({})) as Record<string, unknown>));
  return (name) => files.map((m) => m[name]).find((x): x is Read => typeof x === 'function');
}

/** One fixture row, saying which statement failed if one does. */
function put(db: Db, sql: string, params: readonly Param[]): void {
  try { db.run(sql, params); } catch (e) { throw new Error(`the fixture could not run ${sql}: ${(e as Error).message}`); }
}

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Awkward rows on top of the seed. */
function fixture(db: Db): void {
  const user = (role: string): string => db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', [role])?.id ?? assert.fail(`no ${role}`);
  const surveyor = user('SURVEYING'), sales = user('SALES'), admin = user('ADMIN');
  // A claim, with an assessment of its company for a new job to name (the claim's own where it has one).
  const claimRow = (id: string) => db.get<{ id: string; business_id: string; property_id: string; assessment_id: string }>(
    'SELECT c.id, c.business_id, c.property_id, COALESCE(c.assessment_id, (SELECT a.id FROM assessments a WHERE a.business_id = c.business_id ORDER BY a.rowid LIMIT 1)) AS assessment_id ' +
    'FROM claims c WHERE c.id = ?', [id]) ?? assert.fail(`no claim ${id}`);
  // A company with two claims, each with a survey job on it; and a company with two claims on one building.
  const two = db.get<{ business_id: string }>('SELECT j.business_id FROM surveyor_jobs j WHERE j.claim_id IS NOT NULL GROUP BY j.business_id HAVING COUNT(DISTINCT j.claim_id) >= 2 LIMIT 1');
  assert.ok(two !== undefined, 'the seed has a company with survey jobs on two claims');
  const [CA, CB] = db.all<{ id: string }>('SELECT DISTINCT claim_id AS id FROM surveyor_jobs WHERE business_id = ? AND claim_id IS NOT NULL ORDER BY claim_id', [two.business_id]).map((r) => claimRow(r.id));
  assert.ok(CA !== undefined && CB !== undefined);
  const shared = db.get<{ property_id: string }>('SELECT property_id FROM claims GROUP BY property_id HAVING COUNT(*) >= 2 LIMIT 1');
  assert.ok(shared !== undefined, 'the seed has two claims on one building');
  const [CQ1, CQ2] = db.all<{ id: string }>('SELECT id FROM claims WHERE property_id = ? ORDER BY id', [shared.property_id]).map((r) => claimRow(r.id));
  assert.ok(CQ1 !== undefined && CQ2 !== undefined);
  const B = CA.business_id, PA = CA.property_id;

  const job = (c: { business_id: string; assessment_id: string; id: string } | null, business: string, assessment: string, who: string | null): string => {
    const id = randomUUID();
    put(db, 'INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, business, assessment, who, 'SEALED', null, '2026-09-01T09:00:00.000Z', c?.id ?? null]);
    return id;
  };
  const commit = (job_id: string): string => {
    const have = db.get<{ id: string }>('SELECT id FROM surveyor_commitments WHERE job_id = ?', [job_id]);
    if (have !== undefined) return have.id;
    const id = randomUUID();
    put(db, 'INSERT INTO surveyor_commitments (id, job_id, surveyor_id, a_qualifying_plant_pence, b_building_pence, c_bare_land_pence, qualifying_pct, method_note, committed_at, figures_hash, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, job_id, surveyor, 1000, 2000, 300, 0.25, 'a fixture commitment', '2026-09-01T09:00:00.000Z', 'f'.repeat(64), '2026-09-01T09:00:00.000Z']);
    return id;
  };
  const pack = (job_id: string, property: string | null): string => {
    const id = randomUUID();
    put(db, 'INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)', [id, job_id, property, '2026-09-01T09:00:00.000Z', surveyor]);
    return id;
  };
  const approve = (pack_id: string, version: number, at: string, q: unknown): string => {
    const id = randomUUID();
    const snapshot = JSON.stringify(q === undefined ? { fixture: version, sums: {} } : { fixture: version, sums: { qualifying_pence: q } });
    put(db, 'INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, pack_id, version, version, 0, snapshot, version === 3 ? 'a'.repeat(64) : sha(snapshot), version === 2 ? admin : surveyor, at]);
    return id;
  };
  const signoff = (claim: string, commitment: string, approval: string | null, figure: number, at: string): string => {
    const id = randomUUID();
    put(db, 'INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, claim, 'Fixture Advisers Limited', 'Chartered Tax Adviser', '2026-09-01', 'the fixture claim', 'a fixture method', '[]', figure, commitment, 'RECORD_NOT_A_SIGNATURE', 'e'.repeat(64), sales, at, approval]);
    return id;
  };
  const T1 = '2026-09-02T09:00:00.000Z', T2 = '2026-09-03T09:00:00.000Z', T3 = '2026-09-04T09:00:00.000Z', T4 = '2026-09-05T09:00:00.000Z', T5 = '2026-09-06T09:00:00.000Z';

  // CA: two new jobs, one with a pack for its building, one with a pack naming no building; the seed's own job too.
  const seedA = db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY rowid LIMIT 1', [CA.id])?.id ?? assert.fail('no job');
  const JA1 = job(CA, B, CA.assessment_id, surveyor), JA2 = job(CA, B, CA.assessment_id, null);
  const cA = commit(seedA);
  const KA1 = pack(JA1, PA), KA2 = pack(JA2, null), Kseed = pack(seedA, null);
  const A11 = approve(KA1, 1, T1, 1000), A12 = approve(KA1, 2, T3, 2000), A13 = approve(KA1, 3, T3, undefined);
  const A21 = approve(KA2, 1, T3, 2000), A22 = approve(KA2, 2, T3, '2000');
  approve(Kseed, 1, T5, 900);
  // CB: a job whose pack names CA's building (not its own), and the seed's job with no pack.
  const seedB = db.get<{ id: string }>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY rowid LIMIT 1', [CB.id])?.id ?? assert.fail('no job');
  const cB = commit(seedB);
  const JB1 = job(CB, B, CB.assessment_id, surveyor);
  const KB1 = pack(JB1, PA);
  const B11 = approve(KB1, 1, T2, 500);
  // A job on no claim, with a pack for CA's building.
  const KX = pack(job(null, B, CA.assessment_id, surveyor), PA);
  const X11 = approve(KX, 1, T4, 1000);
  // The two claims on one building: one pack naming no building, one naming it; approved at the same moment.
  const JQ1 = job(CQ1, CQ1.business_id, CQ1.assessment_id, surveyor), JQ2 = job(CQ2, CQ2.business_id, CQ2.assessment_id, admin);
  const cQ1 = commit(JQ1), cQ2 = commit(JQ2);
  const KQ1 = pack(JQ1, null), KQ2 = pack(JQ2, CQ2.property_id);
  const Q11 = approve(KQ1, 1, T2, 700), Q21 = approve(KQ2, 1, T2, 700);

  // The sign-offs: matching, not matching, a figure written as text, a missing figure, two of one version, none named.
  signoff(CA.id, cA, A11, 1000, T1);
  const S12 = signoff(CA.id, cA, A12, 2000, T3);
  signoff(CA.id, cA, A21, 2000, T1);
  signoff(CA.id, cA, A22, 2000, T4);
  signoff(CA.id, cA, A13, 1234, T4);
  signoff(CA.id, cA, null, 1, T4);
  signoff(CB.id, cB, B11, 500, T2);
  signoff(CB.id, cB, B11, 500, T4);
  signoff(CQ1.id, cQ1, Q11, 700, T3);
  signoff(CQ2.id, cQ2, Q21, 701, T3);
  signoff(CQ2.id, cQ2, Q21, 700, T5);
  // Reopenings: CA's valuation reopened between its sign-offs; CB reopened to a stage that does not void.
  put(db, 'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), CA.id, T2, sales, 'SALES', 'REOPEN', 'VALUATION', 'SURVEY', null, 'a fixture reopening']);
  put(db, 'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), CB.id, T5, sales, 'SALES', 'REOPEN', 'INVOICE', 'REPORTS', null, 'a fixture reopening']);
  put(db, 'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), CQ2.id, T4, sales, 'SALES', 'REOPEN', 'VALUATION', 'VALUATION', null, 'a fixture reopening']);

  // The legal check's G9d: on several packs, at equal moments, and another question beside it.
  const legal = (pack_id: string, seq: number, q: string, at: string, v: string): void => {
    put(db, 'INSERT INTO survey_pack_legal_answers (id, pack_id, seq, question_id, value_json, by_user, source_note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), pack_id, seq, q, v, surveyor, 'a fixture note', at]);
  };
  legal(KA1, 1, 'G9d', T1, '"2020-01-01"'); legal(KA1, 2, 'G9d', T2, '"2020-02-02"'); legal(KA1, 3, 'G14', T5, '"NO"');
  legal(KA2, 1, 'G9d', T1, '"2021-01-01"'); legal(KA2, 2, 'G9d', T2, '"2021-02-02"');
  legal(KB1, 1, 'G9d', T2, '"2022-02-02"');
  legal(KX, 1, 'G9d', T1, '"2023-01-01"');
  legal(KQ1, 1, 'G9d', T3, '"2024-03-03"'); legal(KQ2, 1, 'G9d', T3, '"2024-03-04"');

  // Documents linked to a claim, to a building, and a link taken off; one with no links.
  const type = db.get<{ code: string }>('SELECT code FROM document_types ORDER BY ord LIMIT 1')?.code ?? assert.fail('no type');
  const doc = (): string => {
    const id = randomUUID();
    const seq = (db.get<{ n: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM logical_documents WHERE business_id = ? AND type_code = ?', [B, type])?.n ?? 1);
    put(db, 'INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, B, type, seq, sales, T1]);
    return id;
  };
  const link = (logical: string, claim: string | null, property: string | null, off: boolean): void => {
    const id = randomUUID();
    put(db, 'INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?, ?)', [id, logical, claim, property, sales, T1]);
    if (off) put(db, 'UPDATE document_links SET unlinked_at = ?, unlinked_by = ? WHERE id = ?', [T2, sales, id]);
  };
  const L1 = doc(), L2 = doc(), L3 = doc();
  doc();
  link(L1, CA.id, null, false); link(L1, null, PA, false); link(L1, CB.id, null, true);
  link(L2, null, CB.property_id, false);
  link(L3, CB.id, null, true);

  // Sign-off requests: answered and not, recorded on the claim, a message that failed, and one whose contact has gone.
  const contacts = db.all<{ id: string }>('SELECT id FROM contacts WHERE business_id = ? ORDER BY id', [B]).map((r) => r.id);
  while (contacts.length < 2) {
    const id = `c-fixture-${String(contacts.length)}`;
    put(db, 'INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)', [id, B, `Person ${id}`, T1, T1]);
    contacts.push(id);
  }
  const outbox = (sent: string | null, error: string | null): string => {
    const id = randomUUID();
    put(db, 'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, business_id, claim_id, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, T1, 'acc@b.example.invalid', 'Fixture', 'Fixture.', 'REPORT_FOR_SIGNOFF', sent, B, CA.id, error]);
    return id;
  };
  let n = 0;
  const request = (approval: string, contact: string, at: string, box: string): string => {
    const id = randomUUID();
    n += 1;
    put(db, 'INSERT INTO pack_signoff_requests (id, approval_id, contact_id, to_email, token_sha256, permission_note, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, approval, contact, 'acc@b.example.invalid', sha(`token-${String(n)}`), 'a fixture note', box, sales, at, '2099-01-01T00:00:00.000Z']);
    return id;
  };
  const answer = (req: string, outcome: 'SIGNED' | 'SENT_BACK', at: string): string => {
    const id = randomUUID();
    put(db, 'INSERT INTO pack_signoff_answers (id, request_id, outcome, signer_name, signer_firm, signer_credential, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      outcome === 'SIGNED' ? [id, req, outcome, 'A Signer', 'Signers Limited', 'Chartered Accountant', null, at] : [id, req, outcome, 'A Signer', null, null, 'Not right.', at]);
    return id;
  };
  const r1 = request(A12, contacts[0] ?? '', T3, outbox(T3, null));
  const r2 = request(A21, contacts[1] ?? '', T3, outbox(null, 'the mail server said no'));
  request(B11, contacts[0] ?? '', T3, outbox(T3, null));
  request(A11, contacts[1] ?? '', T1, outbox(null, null));
  const a1 = answer(r1, 'SIGNED', T4);
  answer(r2, 'SENT_BACK', T4);
  put(db, 'INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', [a1, S12, sales, T5]);
  // A request whose contact is no longer there: the join dropped it, and so must the split.
  db.run('PRAGMA foreign_keys = OFF');
  request(A12, 'c-gone', T5, outbox(T5, null));
  db.run('PRAGMA foreign_keys = ON');
  // Survey jobs on documents L1's claims: a surveyor on two of them, so DISTINCT has work to do.
  void JQ2; void KQ2;
}

test('every read of the survey\'s tables split by owner gives exactly what the statement it replaced gave, and finds rows', async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  fixture(app.db);
  const find = await reads();
  const empty: string[] = [];
  for (const [name, [kind, sql, params, order, after]] of Object.entries(BEFORE)) {
    const read = find(name);
    assert.equal(typeof read, 'function', `${name} is not found`);
    let found = 0;
    for (const p of params(app.db)) {
      const now = (read as Read)(app.db, p);
      const was = kind === 'get' ? app.db.get(sql, p) : after === undefined ? app.db.all<Row>(sql, p) : after(app.db, app.db.all<Row>(sql, p));
      const shown = (x: unknown): string => order === 'as a set' && Array.isArray(x) ? JSON.stringify(x.map((r) => JSON.stringify(r)).sort()) : JSON.stringify(x);
      assert.equal(shown(now), shown(was), `${name}(${JSON.stringify(p)})`);
      found += Array.isArray(was) ? was.length : was === undefined ? 0 : 1;
    }
    if (found === 0) empty.push(name);
  }
  assert.deepEqual(empty, [], 'these reads found no row, so their pins prove nothing');
  app.close();
});
