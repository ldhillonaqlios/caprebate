/**
 * PHASE 161l2: THE CLAIMS' LAST STATEMENTS ON THE CLIENT RECORD'S TABLES GIVE WHAT THEY GAVE (09-app/docs/ARCHITECTURE.md
 * rule 3).
 *
 * The statements below were in src/modules/claims/data-borrowed.ts and read the client record's tables (businesses,
 * client_tasks and their checks, internal notes), some joined to the claims' own. Each was moved whole to the client
 * record's data file (src/modules/clients/data.ts) where it reads only that area's tables, or split into the claims'
 * own read plus a read through the client record's front door, put together in code (src/modules/claims/data.ts).
 *
 * Each case keeps the statement it replaced, word for word (with the users joined, as the original was before Phase
 * 161l1 put the names in place through the core), and runs it beside the function the claims now call, on the seeded
 * database with awkward rows added: a business and claims with no owner, the same owner twice, owners that sort before
 * and after each other, a business with no assessment and two businesses that tie on the list's order, questions
 * answered at the same moment, notes written at the same moment, document requests that tie on
 * every key of their order, one with no claim, one received, one for an event, and one with two early answers. The
 * two must give exactly the same rows, in the same order, with the same keys in the same order and the same values.
 * This test was green against the borrowed functions before the split, and is green against the split ones after it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import type { Db, Param, Row } from '../../src/core/index.ts';

type Read = (db: Db, params?: readonly Param[]) => unknown;

/** The function the claims call by this name: still borrowed, in the claims' data file, or in the client record's. */
async function reads(): Promise<(name: string) => Read> {
  const spaces: Record<string, unknown>[] = [];
  for (const p of ['../../src/modules/claims/data-borrowed.ts', '../../src/modules/claims/data.ts', '../../src/modules/clients/data.ts']) {
    try { spaces.push(await import(p) as Record<string, unknown>); } catch { /* a borrowed file emptied and deleted */ }
  }
  return (name) => {
    for (const s of spaces) if (typeof s[name] === 'function') return s[name] as Read;
    throw new Error(`${name} is not found`);
  };
}

/** The statement each read replaced, word for word: [get or all, the text]. */
const ORIGINAL: Readonly<Record<string, readonly ['get' | 'all', string]>> = {
  listBusinessesOByIdBusinessId: ['all', 'SELECT owner_id AS o FROM businesses WHERE id = ? UNION SELECT owner_id AS o FROM claims WHERE business_id = ?'],
  getAssessmentsBusinessIdNameByBusinessIdId: ['get', 'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b WHERE b.id = ?'],
  listAssessmentsBusinessIdNameByBusinessId: ['all', 'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b ORDER BY b.created_at DESC, b.name ASC LIMIT ?'],
  getEngagementSignLinksIdEngagementIdByTokenSha256: ['get', 'SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, b.name AS business_name, ' +
    'b.company_number, u.disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
    'JOIN businesses b ON b.id = e.business_id JOIN users u ON u.id = k.user_id WHERE k.token_sha256 = ?'],
  listClientTasksQuestionAnswerByBusinessIdState: ['all', "SELECT t.question, t.answer, t.answer_state, t.answered_at, t.answered_by_role AS role, u.display_name AS who, " +
    'c.display_name AS checker, k.checked_at FROM client_tasks t LEFT JOIN users u ON u.id = t.answered_by ' +
    'LEFT JOIN client_task_checks k ON k.task_id = t.id LEFT JOIN users c ON c.id = k.checked_by ' +
    "WHERE t.business_id = ? AND t.state = 'ANSWERED' AND t.kind = 'QUESTION' AND (t.claim_id = ? OR t.claim_id IS NULL) " +
    "AND (t.answered_by_role = 'STAFF' OR k.outcome = 'ACCEPTED') ORDER BY t.answered_at DESC"],
  listClientTasksIdFactIdByBusinessIdKind2: ['all', 'SELECT t.id, t.fact_id, t.question, t.why, t.holds_up, t.state, t.answer_state, t.answer, t.answered_at, t.answered_by_role, t.sent_to_portal_at, t.created_at, t.withdrawn_at, t.due_on, ab.display_name AS asked_by_name, an.display_name AS answered_by_name, wb.display_name AS withdrawn_by_name FROM client_tasks t LEFT JOIN users ab ON ab.id = t.asked_by LEFT JOIN users an ON an.id = t.answered_by LEFT JOIN users wb ON wb.id = t.withdrawn_by WHERE t.business_id = ? AND t.kind = \'QUESTION\' ORDER BY t.created_at ASC'],
  listInternalNotesIdBodyByBusinessId: ['all', 'SELECT n.id, n.body, n.created_at, u.display_name AS author_name ' +
    'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id ' +
    'WHERE n.business_id = ? ORDER BY n.created_at DESC'],
  listDocumentFieldVouchesIdBusinessIdByRequestIdJO: ['all', 'SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ab.display_name AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? AND ct.claim_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC'],
  listDocumentFieldVouchesIdBusinessIdByRequestIdJO2: ['all', 'SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ab.display_name AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC'],
};

/** The parameters each read is asked with: a query whose rows are the parameter lists. Every id of the kind it takes. */
const ASKED: Readonly<Record<string, string>> = {
  listBusinessesOByIdBusinessId: "SELECT id, id FROM businesses UNION ALL SELECT 'no-such-business', 'no-such-business'",
  getAssessmentsBusinessIdNameByBusinessIdId: "SELECT id FROM businesses UNION ALL SELECT 'no-such-business'",
  listAssessmentsBusinessIdNameByBusinessId: 'SELECT 1000 UNION ALL SELECT 3 UNION ALL SELECT 0',
  getEngagementSignLinksIdEngagementIdByTokenSha256: "SELECT token_sha256 FROM engagement_sign_links UNION ALL SELECT 'no-such-token'",
  listClientTasksQuestionAnswerByBusinessIdState: "SELECT b.id AS b, c.id AS c FROM businesses b JOIN claims c ON c.business_id = b.id UNION ALL SELECT id, 'no-such-claim' FROM businesses",
  listClientTasksIdFactIdByBusinessIdKind2: 'SELECT id FROM businesses',
  listInternalNotesIdBodyByBusinessId: 'SELECT id FROM businesses',
  listDocumentFieldVouchesIdBusinessIdByRequestIdJO: 'SELECT b.id AS b, c.id AS c FROM businesses b JOIN claims c ON c.business_id = b.id',
  listDocumentFieldVouchesIdBusinessIdByRequestIdJO2: 'SELECT id FROM businesses',
};

function put(db: Db, sql: string, params: readonly Param[]): void {
  try { db.run(sql, params); } catch (e) { throw new Error(`the fixture could not run ${sql}: ${(e as Error).message}`); }
}

/** The awkward rows, on top of the seed. */
function fixture(db: Db, at: () => string): void {
  const user = (role: string): string => db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', [role])?.id ?? '';
  const admin = user('ADMIN'), sales = user('SALES'), client = user('CLIENT');
  const job = db.get<{ business_id: string; claim_id: string }>('SELECT business_id, claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL ORDER BY rowid LIMIT 1');
  assert.ok(job !== undefined, 'the seed has a survey job on a claim');
  const B = job.business_id, C = job.claim_id;
  const claim = db.get<{ property_id: string | null }>('SELECT property_id FROM claims WHERE id = ?', [C]);
  assert.ok(claim !== undefined);

  // OWNERS: a business with none; the claims of another with none, the same one twice, and two that sort either way.
  const owners = [admin, sales].sort();
  db.run('UPDATE businesses SET owner_id = NULL WHERE id = ?', [B]);
  const claims = db.all<{ id: string; business_id: string }>('SELECT id, business_id FROM claims ORDER BY rowid');
  claims.forEach((c, i) => { db.run('UPDATE claims SET owner_id = ? WHERE id = ?', [[null, owners[1], owners[0], owners[1]][i % 4] ?? null, c.id]); });
  const other = db.get<{ id: string }>('SELECT id FROM businesses WHERE id <> ? ORDER BY rowid LIMIT 1', [B]);
  if (other !== undefined) db.run('UPDATE businesses SET owner_id = ? WHERE id = ?', [owners[1] ?? null, other.id]);

  // TWO BUSINESSES THAT TIE on the list's order (the same moment and the same name), with no assessment and no number.
  const tie = '2026-11-10T09:00:00.000Z';
  for (const id of [randomUUID(), randomUUID()]) {
    put(db, 'INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, source, updated_at, company_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, 'Tie Fixture Ltd', 'dental', 'ENQUIRY', null, null, tie, null, null, null]);
  }

  // THE LETTER'S LINK, to a business whose number is not known.
  db.run('UPDATE businesses SET company_number = NULL WHERE id = ?', [B]);
  const engagement = db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [B]);
  assert.ok(engagement !== undefined, 'the seed has a letter for the organisation');
  put(db, 'INSERT INTO engagement_sign_links (id, engagement_id, user_id, token_sha256, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), engagement.id, client, 'a2'.repeat(32), 'client@b.example.invalid', sales, at(), '2099-01-01T00:00:00.000Z']);

  // QUESTIONS answered at the same moment: one by staff, one checked, one with no claim and no asker (a task has one check).
  const same = '2026-11-10T10:00:00.000Z';
  const q1 = randomUUID(), q2 = randomUUID(), q3 = randomUUID();
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, kind, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [q1, B, sales, 'Fixture question one?', 'Because.', 'the claim', 'ANSWERED', 'ANSWERED', 'Yes.', same, sales, 'STAFF', same, 'QUESTION', C]);
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, kind, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [q2, B, sales, 'Fixture question two?', 'Because.', 'the claim', 'ANSWERED', 'ANSWERED', 'No.', same, client, 'CLIENT', same, 'QUESTION', C]);
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, kind, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [q3, B, null, 'Fixture question three?', 'Because.', 'the claim', 'ANSWERED', 'ANSWERED', 'Maybe.', same, client, 'CLIENT', same, 'QUESTION', null]);
  for (const [task, by] of [[q2, sales], [q3, admin]] as const) {
    put(db, 'INSERT INTO client_task_checks (id, task_id, outcome, reason, checked_by, checked_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), task, 'ACCEPTED', null, by, same]);
  }

  // NOTES written at the same moment.
  for (const body of ['Fixture note one.', 'Fixture note two.']) {
    put(db, 'INSERT INTO internal_notes (id, business_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), B, sales, body, same]);
  }

  // DOCUMENT REQUESTS that tie on every key of their order; one with no claim; one received; one for an event; one with
  // two early answers (LIMIT 1 finds the first); one asked by nobody.
  const type = db.get<{ code: string }>('SELECT code FROM document_types WHERE handler_type IS NOT NULL AND active = 1 ORDER BY ord LIMIT 1');
  assert.ok(type !== undefined);
  const r = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const ask = (id: string, claim_id: string | null, asked_by: string | null, due_on: string | null): void => put(db,
    'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, kind, requested_type, claim_id, due_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, B, asked_by, 'Please send it.', 'Because.', 'the claim', 'OPEN', same, 'DOCUMENT', type.code, claim_id, due_on]);
  ask(r[0] as string, C, sales, null);
  ask(r[1] as string, C, null, null);
  ask(r[2] as string, null, sales, null);
  ask(r[3] as string, C, sales, '2026-12-01');
  ask(r[4] as string, C, sales, '2026-12-01');
  for (const [req, answer] of [[r[1], 'yes'], [r[1], 'no']] as const) {
    put(db, "INSERT INTO document_field_vouches (id, request_id, field_id, answer, answered_by, answered_at, asked_on) VALUES (?, ?, ?, ?, ?, ?, 'REQUEST')",
      [randomUUID(), req as string, `fixture_field_${answer}`, answer, client, same]);
  }
  if (claim.property_id !== null) {
    const ev = randomUUID();
    const ord = (db.get<{ m: number | null }>('SELECT MAX(ord) AS m FROM property_events WHERE property_id = ?', [claim.property_id])?.m ?? 0) + 1;
    put(db, "INSERT INTO property_events (id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, assessment_id, created_at, created_by) VALUES (?, ?, ?, ?, 'FIT_OUT', '2025-06', NULL, NULL, 'STAFF', NULL, ?, ?)",
      [ev, claim.property_id, B, ord, same, sales]);
    put(db, 'UPDATE client_tasks SET event_id = ? WHERE id = ?', [ev, r[3] as string]);
  }
  const logical = randomUUID(), doc = randomUUID();
  const seq = (db.get<{ m: number | null }>('SELECT MAX(seq) AS m FROM logical_documents WHERE business_id = ? AND type_code = ?', [B, type.code])?.m ?? 0) + 1;
  put(db, 'INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [logical, B, type.code, seq, sales, at()]);
  put(db, 'INSERT INTO documents (id, business_id, uploaded_by, filename, state, strip_recorded_at, quarantine_discharged_at, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [doc, B, client, 'fixture.pdf', 'RECEIVED', at(), at(), at(), logical, 1, type.code]);
  put(db, "UPDATE client_tasks SET state = 'ANSWERED', answer_state = 'ANSWERED', answer = ?, answered_at = ?, answered_by = ?, " +
    "answered_by_role = ?, received_document_id = ? WHERE id = ? AND state = 'OPEN'", ['fixture.pdf', same, client, 'CLIENT', doc, r[4] as string]);
}

test('161l2: each statement the claims borrowed on the client record gives what it gave, on awkward rows, and finds rows', async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  fixture(app.db, app.now);
  const from = await reads();
  const empty: string[] = [];
  for (const [name, [kind, sql]] of Object.entries(ORIGINAL)) {
    const read = from(name);
    const asked = app.db.all<Row>(ASKED[name] ?? assert.fail(`${name} has no parameters`)).map((r) => Object.values(r) as Param[]);
    let found = 0;
    for (const params of asked) {
      const now = read(app.db, params);
      const was = kind === 'get' ? app.db.get(sql, params) : app.db.all(sql, params);
      assert.equal(JSON.stringify(now), JSON.stringify(was), `${name}(${JSON.stringify(params)})`);
      found += Array.isArray(was) ? was.length : was === undefined ? 0 : 1;
    }
    if (found === 0) empty.push(name);
  }
  assert.deepEqual(empty, [], 'these reads found no row, so their pins prove nothing');
  app.close();
});

test('161l2: the awkward rows are there (so the pins above are asked about them)', async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  fixture(app.db, app.now);
  const n = (sql: string): number => app.db.get<{ n: number }>(sql)?.n ?? 0;
  assert.ok(n('SELECT COUNT(*) AS n FROM claims WHERE owner_id IS NULL') > 0, 'a claim with no owner');
  assert.ok(n("SELECT COUNT(*) AS n FROM businesses WHERE name = 'Tie Fixture Ltd'") === 2, 'two businesses that tie');
  assert.ok(n("SELECT COUNT(*) AS n FROM client_tasks WHERE kind = 'QUESTION' AND answered_at = '2026-11-10T10:00:00.000Z'") === 3, 'three questions answered at the same moment');
  assert.ok(n("SELECT COUNT(*) AS n FROM client_tasks WHERE kind = 'DOCUMENT' AND received_document_id IS NOT NULL") > 0, 'a request received');
  assert.ok(n("SELECT COUNT(*) AS n FROM (SELECT request_id FROM document_field_vouches WHERE request_id IS NOT NULL GROUP BY request_id HAVING COUNT(*) > 1)") > 0, 'a request with two early answers');
  app.close();
});
