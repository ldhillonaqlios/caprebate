/**
 * CRM 9 OF 10 — GLOBAL SEARCH. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "limited by can() INSIDE the query, never filtered afterwards"
 *                                                           → THE SCOPE COMES FROM THE RULE TABLE
 *   "NEVER INDEXED: the identity store, document text, internal note bodies for
 *    a role without internal_note.read, and the estimate"   → NEVER SEARCHED
 *   "identity_persons and identity_search_log … and neither is ever indexed, for
 *    any role. The compliance registers … are not in global search for anyone …
 *    A test asserts both, with a planted name."             → A PLANTED NAME
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seed } from '../src/seed.ts';
import type { AppRole } from '../src/roles.ts';
import type { Actor } from '../src/authz.ts';
import * as SE from '../src/web/search.ts';
import * as R from '../src/web/compliance-rights.ts';
import * as B from '../src/web/compliance-breach.ts';
import * as SI from '../src/web/compliance-identity.ts';
import { testApp } from './helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const PLANTED = 'Quillon Marchbanks-Oyelaran';

type App = Awaited<ReturnType<typeof testApp>>;

async function seeded(): Promise<{ app: App; as: (role: AppRole) => Actor }> {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const as = (role: AppRole): Actor => {
    const u = app.db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY rowid LIMIT 1', [role]);
    assert.ok(u !== undefined, `the seed has no ${role} user`);
    return { id: u.id, role, business_id: null, disabled: false };
  };
  return { app, as };
}

const scopeOf = (r: SE.SearchResult): Record<string, string> => Object.fromEntries(r.scope.map((s) => [s.kind, s.searched]));

/* ================================================================== *
 * THE SCOPE COMES FROM THE RULE TABLE
 * ================================================================== */

describe('the scope of each kind is read from can(), never from a role name', () => {
  test('ADMIN everything; SALES everything but invoices; ACCOUNTING claims and invoices; SURVEYING its own jobs’ properties and claims', async () => {
    const { app, as } = await seeded();
    const expected: Record<string, Record<string, string>> = {
      ADMIN: { ORGANISATION: 'ALL', PROSPECT: 'ALL', CONTACT: 'ALL', PROPERTY: 'ALL', CLAIM: 'ALL', INVOICE: 'ALL', NOTE: 'ALL' },
      SALES: { ORGANISATION: 'ALL', PROSPECT: 'ALL', CONTACT: 'ALL', PROPERTY: 'ALL', CLAIM: 'ALL', INVOICE: 'NOT_SEARCHED', NOTE: 'ALL' },
      ACCOUNTING: { ORGANISATION: 'NOT_SEARCHED', PROSPECT: 'NOT_SEARCHED', CONTACT: 'NOT_SEARCHED', PROPERTY: 'NOT_SEARCHED', CLAIM: 'ALL', INVOICE: 'ALL', NOTE: 'NOT_SEARCHED' },
      SURVEYING: { ORGANISATION: 'NOT_SEARCHED', PROSPECT: 'NOT_SEARCHED', CONTACT: 'NOT_SEARCHED', PROPERTY: 'ASSIGNED', CLAIM: 'ASSIGNED', INVOICE: 'NOT_SEARCHED', NOTE: 'NOT_SEARCHED' },
    };
    for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
      assert.deepEqual(scopeOf(SE.search(app.db, as(role), 'CR-')), expected[role], `${role}’s scope`);
    }
  });

  test('a surveyor finds exactly the claims its jobs are on, and ADMIN every claim — the statement, not a filter, decides', async () => {
    const { app, as } = await seeded();
    const s = as('SURVEYING');
    const mine = new Set(app.db.all<{ claim_id: string }>('SELECT claim_id FROM surveyor_jobs WHERE surveyor_id = ?', [s.id]).map((x) => x.claim_id));
    assert.ok(mine.size > 0, 'the seed assigned the surveyor no job, so this proves nothing');
    const hits = SE.search(app.db, s, 'CR-').hits.filter((h) => h.kind === 'CLAIM').map((h) => h.href.replace('/staff/claims/', ''));
    assert.deepEqual(new Set(hits), mine);
    const all = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n ?? 0;
    assert.equal(SE.search(app.db, as('ADMIN'), 'CR-').hits.filter((h) => h.kind === 'CLAIM').length, Math.min(all, SE.RESULT_LIMIT));
  });

  test('a client is refused, a short term searches nothing and says so, and a wildcard is searched for as itself', async () => {
    const { app, as } = await seeded();
    assert.throws(() => SE.search(app.db, { id: 'u-client', role: 'CLIENT', business_id: 'b', disabled: false }, 'CR-'), /not authorised/);
    const short = SE.search(app.db, as('ADMIN'), 'C');
    assert.equal(short.hits.length, 0);
    assert.equal(short.scope.length, 0);
    assert.match(short.note ?? '', /at least 2 characters/);
    assert.equal(SE.search(app.db, as('ADMIN'), '%%').hits.length, 0, 'a percent sign matched everything');
    assert.equal(SE.search(app.db, as('ADMIN'), '__').hits.length, 0, 'an underscore matched everything');
  });
});

/* ================================================================== *
 * NEVER SEARCHED
 * ================================================================== */

describe('never searched — the identity store, the compliance registers, document text and the estimate', () => {
  test('no statement search can run names any of them', () => {
    const forbidden = /\b(identity_persons|identity_search_log|rights_requests|rights_request_limbs|complaints|breach_incidents|cdd_checks|cdd_beneficial_owners|consent_answers|legal_holds|estimates|documents|document_text|logical_documents|document_versions)\b/;
    assert.ok(SE.STATEMENTS.length >= 9);
    for (const sql of SE.STATEMENTS) assert.equal(forbidden.test(sql), false, `a search statement names a table it must never reach: ${sql.slice(0, 80)}`);
  });

  test('A PLANTED NAME: found as a client’s contact and in a note, and nowhere else — not in S2, its search log, a rights request, a complaint, a breach entry, or a person at an introducing firm', async () => {
    const { app, as } = await seeded();
    const admin = as('ADMIN');
    const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
    const biz = app.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY rowid LIMIT 1');
    assert.ok(biz !== undefined);

    // The stores the registers write through, each given the planted name.
    const doc = randomUUID();
    app.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [doc, biz.id, admin.id, 'x.pdf', 'STORED', T0]);
    const person = SI.recordPerson(d, admin, { doc_id: doc, name: PLANTED, role: Object.keys(SI.PERSON_ROLES)[0] ?? '' });
    assert.ok(person.ok, person.ok ? '' : person.why);
    SI.searchIdentity(d, admin, PLANTED);
    assert.ok(R.logRequest(d, admin, { received_at: '2026-09-08T10:00', received_via: 'POST', request_verbatim: `I am ${PLANTED} and I want my data`, limbs: 'ART_15' }).ok);
    assert.ok(R.logComplaint(d, admin, { received_at: '2026-09-08T10:00', received_via: 'POST', complaint_verbatim: `From ${PLANTED}: I am unhappy` }).ok);
    const breach = B.openIncident(d, admin, {
      kind: 'SECURITY_INCIDENT', discovered_at: '2026-09-08T09:00', awareness_at: '2026-09-08T09:30', awareness_basis: `${PLANTED} reported a lost laptop`,
    });
    const firm = randomUUID();
    app.db.run("INSERT INTO introducers (id, firm_name, created_via, created_at, updated_at) VALUES (?, 'Planted Partners', 'STAFF', ?, ?)", [firm, T0, T0]);
    app.db.run(
      "INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, contact_type, introducer_id) VALUES (?, NULL, ?, 0, 0, ?, 'INTRODUCER', ?)",
      [randomUUID(), PLANTED, T0, firm]);

    // Every one of those rows holds the name.
    const where = app.db.get<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM identity_persons WHERE name = ?) + (SELECT COUNT(*) FROM identity_search_log WHERE term = ?) + ' +
        "(SELECT COUNT(*) FROM rights_requests WHERE request_verbatim LIKE '%' || ? || '%') + (SELECT COUNT(*) FROM complaints WHERE complaint_verbatim LIKE '%' || ? || '%') AS n",
      [PLANTED, PLANTED, PLANTED, PLANTED])?.n;
    assert.equal(where, 4, 'the planted name did not reach the identity store and the registers, so this proves nothing');

    for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
      assert.equal(SE.search(app.db, as(role), 'Marchbanks').hits.length, 0, `${role}’s search reached a register, the identity store or a firm’s person`);
    }
    if (breach.ok) assert.equal(SE.search(app.db, admin, 'lost laptop').hits.length, 0, 'a breach entry was searched');

    // THE CONTROL: the same name as a client's own contact, and in an internal note, IS found — by the roles that read them.
    app.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, 0, 0, ?)', [randomUUID(), biz.id, PLANTED, T0]);
    app.db.run('INSERT INTO internal_notes (id, business_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), biz.id, admin.id, `Spoke to ${PLANTED} about the lease`, T0]);
    const found = SE.search(app.db, admin, 'Marchbanks');
    assert.deepEqual(found.hits.map((h) => h.kind).sort(), ['CONTACT', 'NOTE'], 'the control found something other than the client’s contact and the note');
    assert.deepEqual(SE.search(app.db, as('SALES'), 'Marchbanks').hits.map((h) => h.kind).sort(), ['CONTACT', 'NOTE']);
    assert.equal(SE.search(app.db, as('ACCOUNTING'), 'Marchbanks').hits.length, 0, 'a note or a contact reached accounting through search');
    assert.equal(SE.search(app.db, as('SURVEYING'), 'Marchbanks').hits.length, 0, 'a note or a contact reached a surveyor through search');
  });

  test('the estimate is never searched: a sealed qualifying expenditure, searched for, finds nothing', async () => {
    const { app, as } = await seeded();
    const e = app.db.get<{ q: number }>('SELECT qualifying_expenditure_pence AS q FROM estimates ORDER BY rowid LIMIT 1');
    assert.ok(e !== undefined);
    for (const term of [String(e.q), String(e.q / 100)]) {
      assert.equal(SE.search(app.db, as('ADMIN'), term).hits.length, 0, `searching ${term} found something`);
    }
  });
});
