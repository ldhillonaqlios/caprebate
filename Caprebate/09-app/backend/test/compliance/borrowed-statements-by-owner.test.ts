/**
 * THE COMPLIANCE SCREENS READ THE SAME ROWS WHEN A JOIN IS SPLIT BY OWNER (09-app/docs/ARCHITECTURE.md rule 3).
 *
 * The audit log page, the money-laundering register, the disclosure log, the identity checks, a person named on a
 * document and the retention list each ran one statement that joined compliance's tables, or the core's, to a table a
 * lower area owns. Each now runs its owner's own statement and asks the other owner through its front door. This test
 * keeps each statement as it was written before the split, runs it on a seeded database with awkward rows added (equal
 * sort keys, a line whose user has gone, a claim named as a number, a client with no claims), and expects the screen to
 * carry exactly its rows: the same rows, in the same order, with the same values and the same NULLs.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { App } from '../../src/core/app.ts';
import type { AuditKind } from '../../src/core/audit.ts';
import { auditLogView, clientAuditCount } from '../../src/modules/compliance/audit-log.ts';
import { amlView } from '../../src/modules/compliance/compliance-aml.ts';
import { disclosuresFor } from '../../src/modules/compliance/disclosure-log.ts';
import { identityChecks } from '../../src/modules/compliance/identity-checks.ts';
import { RECORD_KINDS, readPerson, retentionList } from '../../src/modules/compliance/compliance-identity.ts';
import { actor, testApp } from '../helpers.ts';

const ADMIN = actor('ADMIN');
const T0 = '2026-09-08T09:00:00.000Z';

/* The statements as they were before the split, word for word. */
const BEFORE = {
  officers: 'SELECT o.id, o.office, u.display_name AS who, o.appointed_on, o.ended_on, o.source FROM aml_officers o JOIN users u ON u.id = o.user_id ORDER BY o.appointed_on DESC',
  disclosures: 'SELECT d.id, d.recipient, d.data_categories, d.occasion, d.route, d.lawful_basis, d.disclosed_at, d.corrects_id, u.display_name AS recorder ' +
    'FROM disclosure_log d JOIN users u ON u.id = d.recorded_by WHERE d.business_id = ? ORDER BY d.disclosed_at ASC, d.recorded_at ASC',
  checksByBusiness: 'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.business_id = ? ORDER BY i.sent_at DESC',
  checksByCdd: 'SELECT i.id, c.full_name AS contact, i.sent_at, i.link, i.cdd_check_id, u.display_name AS who FROM identity_checks i ' +
    'JOIN contacts c ON c.id = i.contact_id LEFT JOIN users u ON u.id = i.sent_by WHERE i.cdd_check_id = ? ORDER BY i.sent_at DESC',
  person: 'SELECT p.person_ref, p.name, p.role, p.contact_route, p.contact_route_kind, p.doc_id, p.notice_template, p.notice_route, p.notice_sent_on, p.notice_published_too, ' +
    'p.exemption_article, p.exemption_reason, d.type_code AS doc_type, d.created_at AS doc_created, d.retention_ref ' +
    'FROM identity_persons p JOIN documents d ON d.id = p.source_record_ref WHERE p.person_ref = ?',
  clientCount: 'SELECT COUNT(*) AS n FROM audit_log a WHERE ' +
    '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
    'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
    "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
    "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) ",
  lines: 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) ORDER BY a.seq DESC LIMIT ?',
  clientLines: 'SELECT a.seq, a.at, a.kind, a.actor_role, a.actor_id, a.object_type, a.object_id, a.outcome, u.display_name AS who FROM audit_log a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE (? IS NULL OR a.kind = ?) AND (? IS NULL OR a.outcome = ?) AND ' +
    '(a.object_id = ? OR a.object_id IN (SELECT id FROM claims WHERE business_id = ?) ' +
    'OR a.object_id IN (SELECT id FROM properties WHERE business_id = ?) ' +
    "OR json_extract(a.detail, '$.business') = ? OR json_extract(a.detail, '$.business_id') = ? " +
    "OR json_extract(a.detail, '$.claim') IN (SELECT id FROM claims WHERE business_id = ?)) " +
    'ORDER BY a.seq DESC LIMIT ?',
};

const RECORD_COUNTS_BEFORE: Readonly<Record<string, string>> = {
  RIGHTS_REQUESTS: 'SELECT COUNT(*) AS n FROM rights_requests',
  COMPLAINTS: 'SELECT COUNT(*) AS n FROM complaints',
  BREACH_INCIDENTS: 'SELECT COUNT(*) AS n FROM breach_incidents',
  IDENTITY_PERSON: 'SELECT COUNT(*) AS n FROM identity_persons',
  IDENTITY_SEARCH_LOG: 'SELECT COUNT(*) AS n FROM identity_search_log',
  DOCUMENT_VERSIONS: 'SELECT COUNT(*) AS n FROM documents WHERE logical_document_id IS NOT NULL',
  LOGICAL_DOCUMENTS: 'SELECT COUNT(*) AS n FROM logical_documents',
  DOCUMENT_LINKS: 'SELECT COUNT(*) AS n FROM document_links',
  DELETION_LOG: 'SELECT COUNT(*) AS n FROM deletion_log',
  REGISTER_RECORDS: 'SELECT COUNT(*) AS n FROM register_records',
  LEADS_NEVER_CONVERTED: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'",
  LEAD_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL',
  STAFF_TASKS: 'SELECT COUNT(*) AS n FROM staff_tasks',
  LEAD_FOLLOW_UP_TASKS: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'",
  AUTOMATION_RUNS: 'SELECT COUNT(*) AS n FROM automation_runs',
  OUTBOX_QUEUED: "SELECT COUNT(*) AS n FROM outbox WHERE kind IN ('NOTIFICATION','TEMPLATE','COMPLIANCE_LETTER')",
  INTRODUCERS: 'SELECT COUNT(*) AS n FROM introducers',
  INTRODUCER_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL',
  SHARE_CONSENTS: 'SELECT COUNT(*) AS n FROM introducer_share_consents',
  INTRODUCER_NOTICES: 'SELECT COUNT(*) AS n FROM introducer_notices',
  CONSENT_ANSWERS: 'SELECT COUNT(*) AS n FROM consent_answers',
  CLIENT_MESSAGE: 'SELECT COUNT(*) AS n FROM client_messages',
  TEAM_MESSAGE: 'SELECT COUNT(*) AS n FROM internal_notes',
  CDD_RECORDS: 'SELECT COUNT(*) AS n FROM cdd_checks',
};

type Seeded = { app: App; business: string; claims: string[]; properties: string[]; bare: string; contacts: string[] };

async function seeded(): Promise<Seeded> {
  const { seed } = await import('../../src/app/seed.ts');
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const db = app.db;
  // The client with the most claims, and one with none.
  const business = db.get<{ business_id: string }>('SELECT business_id FROM claims GROUP BY business_id ORDER BY COUNT(*) DESC, business_id LIMIT 1')?.business_id ?? '';
  const claims = db.all<{ id: string }>('SELECT id FROM claims WHERE business_id = ? ORDER BY id', [business]).map((r) => r.id);
  const properties = db.all<{ id: string }>('SELECT id FROM properties WHERE business_id = ? ORDER BY id', [business]).map((r) => r.id);
  const bare = 'b-no-claims';
  db.run("INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at) VALUES (?, ?, 'dental', 'ASSESSMENT_SUBMITTED', NULL, NULL, ?)", [bare, 'No Claims Ltd', T0]);
  assert.ok(claims.length > 0 && properties.length > 0, 'the seed gives a client with claims and properties');
  const people = ['ADMIN', 'SALES', 'SURVEYING'].map((r) => db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', [r])?.id).filter((x): x is string => x !== undefined);
  assert.ok(people.length >= 2, 'the seed gives staff');
  const [p1, p2] = people as [string, string];
  let contacts = db.all<{ id: string }>('SELECT id FROM contacts WHERE business_id = ? ORDER BY id', [business]).map((r) => r.id);
  if (contacts.length < 2) {
    for (const n of [1, 2]) {
      const id = `c-split-${n}`;
      db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)', [id, business, `Person ${n}`, T0, T0]);
    }
    contacts = db.all<{ id: string }>('SELECT id FROM contacts WHERE business_id = ? ORDER BY id', [business]).map((r) => r.id);
  }

  // Officers: two appointed the same day (equal sort keys), one ended.
  for (const [id, office, who, on, ended] of [
    ['o-1', 'NOMINATED_OFFICER', p1, '2026-01-05', null], ['o-2', 'COMPLIANCE_OFFICER', p2, '2026-03-01', null],
    ['o-3', 'COMPLIANCE_OFFICER', p1, '2026-03-01', '2026-06-01'], ['o-4', 'NOMINATED_OFFICER', p2, '2025-11-30', '2026-01-04'],
  ] as const) {
    db.run('INSERT INTO aml_officers (id, office, user_id, appointed_on, source, recorded_by, recorded_at, ended_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, office, who, on, 'Board minute 4', p1, T0, ended]);
  }

  // Disclosures: two at the same moment, recorded at different times, and one that corrects another.
  const disclose = (id: string, at: string, recorded: string, by: string, corrects: string | null): void => {
    db.run('INSERT INTO disclosure_log (id, business_id, recipient, data_categories, occasion, route, lawful_basis, disclosed_at, recorded_by, recorded_at, corrects_id) ' +
      "VALUES (?, ?, 'R4_HMRC', '[\"CONTACT\"]', 'FILING', 'EMAIL', 'LEGAL_OBLIGATION', ?, ?, ?, ?)", [id, business, at, by, recorded, corrects]);
  };
  disclose('d-1', '2026-05-01T10:00:00.000Z', '2026-05-01T11:00:00.000Z', p1, null);
  disclose('d-2', '2026-05-01T10:00:00.000Z', '2026-05-01T10:30:00.000Z', p2, null);
  disclose('d-3', '2026-04-01T10:00:00.000Z', '2026-04-02T10:00:00.000Z', p2, 'd-1');

  // Identity checks: two sent at the same moment, one from a due diligence check.
  db.run("INSERT INTO cdd_checks (id, business_id, claimant_type, state, created_by, created_at, updated_at) VALUES ('k-1', ?, 'LIMITED_COMPANY', 'IN_PROGRESS', ?, ?, ?)", [business, p1, T0, T0]);
  const check = (id: string, contact: string, cdd: string | null, by: string, at: string): void => {
    db.run("INSERT INTO identity_checks (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at) VALUES (?, ?, ?, ?, 'DIDIT', ?, 'https://example.invalid/s', ?, ?)",
      [id, business, contact, cdd, `s-${id}`, by, at]);
  };
  const [c1, c2] = contacts as [string, string];
  check('i-1', c1, 'k-1', p1, '2026-06-01T10:00:00.000Z');
  check('i-2', c2, null, p2, '2026-06-01T10:00:00.000Z');
  check('i-3', c2, 'k-1', p2, '2026-06-02T10:00:00.000Z');

  // A document, and a person named on it.
  db.run("INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, retention_ref) VALUES ('doc-split', ?, ?, 'lease.pdf', 'STORED', ?, 'RET-7')", [business, p1, T0]);
  db.run("INSERT INTO identity_persons (person_ref, name, role, doc_id, source_record_ref, recorded_by, recorded_at, updated_at) VALUES ('PR-0000000000000001', 'A Witness', 'ATTESTING_WITNESS', 'doc-split', 'doc-split', ?, ?, ?)",
    [p1, T0, T0]);

  // Audit lines about the client: its id, a claim, a property, in the detail by each key, a claim named as a number,
  // by a user that does not exist and by nobody.
  const line = (kind: AuditKind, actor_id: string | null, object_id: string | null, detail: Record<string, unknown>, outcome: 'ALLOWED' | 'REFUSED' = 'ALLOWED'): void => {
    app.audit.append({ at: app.now(), kind, outcome, actor_id, actor_role: actor_id === null ? null : 'ADMIN', object_type: 'test', object_id, detail });
  };
  line('CLIENT_SENT_ACCEPTED', p1, business, {});
  line('CLIENT_SENT_ACCEPTED', p2, claims[0] ?? null, {});
  line('CLIENT_SENT_ACCEPTED', 'u-gone', properties[0] ?? null, {}, 'REFUSED');
  line('CLIENT_SENT_ACCEPTED', null, null, { business: business });
  line('CLIENT_SENT_ACCEPTED', p1, null, { business_id: business });
  line('CLIENT_SENT_ACCEPTED', p2, null, { claim: claims[claims.length - 1] ?? '' });
  line('CLIENT_SENT_ACCEPTED', p1, null, { claim: 12345 });
  line('DOCUMENT_REQUEST_RECEIVED', p1, 'unrelated', { claim: 'not-a-claim' });
  return { app, business, claims, properties, bare, contacts };
}

describe('compliance reads split by owner: the same rows as the joined statements', () => {
  test('the audit log page and the client count: every filter, a client with claims, one without, and an unknown kind', async () => {
    const s = await seeded();
    const { app } = s;
    // A claim whose id reads as a number, named in a line's detail as a number (the joined statement compared them as text).
    app.db.run("INSERT INTO claims (id, claim_ref, business_id, workstream, stage, created_at, updated_at) VALUES ('12345', 'CR-2026-9999', ?, 'PLANT_AND_MACHINERY', 'ENQUIRY', ?, ?)", [s.business, T0, T0]);
    try {
      for (const business of [s.business, s.bare, 'no-such-client']) {
        const want = app.db.get<{ n: number }>(BEFORE.clientCount, [business, business, business, business, business, business])?.n;
        assert.equal(clientAuditCount(app.db, business), want, `the count for ${business}`);
      }
      const about = app.db.all(BEFORE.clientLines, ['CLIENT_SENT_ACCEPTED', 'CLIENT_SENT_ACCEPTED', null, null, ...Array(6).fill(s.business), 200]);
      assert.equal(about.length, 7, 'all seven lines about the client, the claim named as a number among them');
      const deps = { db: app.db, audit: app.audit, now: app.now };
      for (const kind of [null, 'CLIENT_SENT_ACCEPTED', 'DOCUMENT_REQUEST_RECEIVED']) {
        for (const outcome of [null, 'ALLOWED', 'REFUSED']) {
          for (const client of [null, s.business, s.bare]) {
            const q = new URLSearchParams();
            if (kind !== null) q.set('kind', kind);
            if (outcome !== null) q.set('outcome', outcome);
            if (client !== null) q.set('client', client);
            const params = [kind, kind, outcome, outcome, ...(client === null ? [] : Array(6).fill(client)), 200];
            const want = app.db.all<Record<string, unknown>>(client === null ? BEFORE.lines : BEFORE.clientLines, params);
            if (client !== null) assert.ok(want.length > 0 || client === s.bare || kind === 'DOCUMENT_REQUEST_RECEIVED' || outcome === 'REFUSED', `lines about ${client}`);
            const got = auditLogView(deps, ADMIN, q).lines.map((l) => ({
              seq: l.seq, kind: l.kind, actor_role: l.actor_role, actor_id: l.actor_id, object_type: l.object_type, object_id: l.object_id, outcome: l.outcome, who: l.who,
            }));
            assert.deepEqual(got, want.map(({ at: _at, ...r }) => r), `kind ${kind}, outcome ${outcome}, client ${client}`);
          }
        }
      }
    } finally { app.close(); }
  });

  test('the officers, the disclosures, the identity checks and a person named on a document', async () => {
    const s = await seeded();
    const { app } = s;
    try {
      const officers = amlView(app.db, ADMIN, '2026-09-08').officers;
      const wantOfficers = app.db.all<Record<string, unknown>>(BEFORE.officers);
      assert.equal(officers.length, 4);
      assert.deepEqual(officers.map((o) => ({ ...o, office: undefined })), wantOfficers.map((o) => ({ ...o, office: undefined })), 'the officers, in order, with each key in place');
      assert.deepEqual(officers.map((o) => Object.keys(o)), wantOfficers.map((o) => Object.keys(o)));

      const { DISCLOSURE_LOG } = await import('../../src/modules/compliance/disclosure-log.ts');
      const on = { ...DISCLOSURE_LOG, enabled: true, in_force_from: DISCLOSURE_LOG.in_force_from ?? '2026-01-01' };
      for (const business of [s.business, s.bare]) {
        const rows = disclosuresFor(app.db, ADMIN, business, on).rows;
        const want = app.db.all<{ id: string; recorder: string; corrects_id: string | null }>(BEFORE.disclosures, [business]);
        assert.deepEqual(rows.map((r) => [r.id, r.recorded_by, r.corrects]), want.map((r) => [r.id, r.recorder, r.corrects_id]), `the disclosures for ${business}`);
      }

      const pick = (r: { id: string; contact: string; sent_at: string; link: string; from_cdd: string | null; sent: string }) => [r.id, r.contact, r.sent_at, r.link, r.from_cdd, r.sent];
      const asLines = (rows: { id: string; contact: string; sent_at: string; link: string; cdd_check_id: string | null; who: string | null }[]) =>
        rows.map((r) => pick({ id: r.id, contact: r.contact, sent_at: r.sent_at, link: r.link, from_cdd: r.cdd_check_id, sent: `${r.who ?? 'a former user'}` }));
      for (const business of [s.business, s.bare]) {
        const got = identityChecks(app.db, { business_id: business }).map(pick).map((r) => [...r.slice(0, 5), String(r[5]).replace(/^.* by /, '')]);
        assert.deepEqual(got, asLines(app.db.all(BEFORE.checksByBusiness, [business])), `the checks for ${business}`);
      }
      for (const cdd of ['k-1', 'no-such-check']) {
        const got = identityChecks(app.db, { cdd_check_id: cdd }).map(pick).map((r) => [...r.slice(0, 5), String(r[5]).replace(/^.* by /, '')]);
        assert.deepEqual(got, asLines(app.db.all(BEFORE.checksByCdd, [cdd])), `the checks from ${cdd}`);
      }
      assert.equal(identityChecks(app.db, { business_id: s.business }).length, 3);

      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
      const person = readPerson(d, ADMIN, 'PR-0000000000000001');
      const want = app.db.get<{ person_ref: string; name: string; doc_id: string; doc_type: string | null; doc_created: string }>(BEFORE.person, ['PR-0000000000000001']);
      assert.deepEqual([person.person_ref, person.name, person.doc_id, person.doc_type], [want?.person_ref, want?.name, want?.doc_id, want?.doc_type]);
      assert.equal(person.received_on, '2026-09-08');
      assert.throws(() => readPerson(d, ADMIN, 'PR-000000000000000X'), /./, 'a person not recorded is not found');
    } finally { app.close(); }
  });

  test('the retention list counts every kind of record as the statements did', async () => {
    const s = await seeded();
    const { app } = s;
    try {
      assert.deepEqual(RECORD_KINDS.map((k) => k.kind).sort(), Object.keys(RECORD_COUNTS_BEFORE).sort(), 'every kind has its statement here');
      const lines = retentionList({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, ADMIN, '2026-09-08');
      for (const l of lines) assert.equal(l.records, app.db.get<{ n: number }>(RECORD_COUNTS_BEFORE[l.kind] ?? '')?.n, l.kind);
      assert.ok(lines.filter((l) => l.records > 0).length >= 4, 'several kinds have records to count');
    } finally { app.close(); }
  });
});
