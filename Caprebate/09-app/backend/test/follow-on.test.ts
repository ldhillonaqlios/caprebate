/**
 * THE CRM FOLLOW-ON — THE ADOPTED ROWS THE CRM FOLD FOUND UNBUILT, AND THE DEFECTS THE GUIDE FOUND. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every role
 *    not granted it"                                          → WHO MAY DO WHAT
 *   1 the introducer and the source, where they belong          → ROWS 4.12, 8.5, 8.6
 *   2 the claim team                                            → ROWS 8.4, 23.7
 *   3 a document centre                                         → ROW 22.13
 *   4 reports with a period                                     → ROWS 22.16, 29.11
 *   5 the estimated fee on the claim                            → ROW 23.8
 *   6 the prior-claim position, derived — assert both           → ROW 28.3
 *   7 mandatory documents per stage, built and switched off     → ROW 29.5
 *   8 (a)–(i) the defects the guide found on the demo           → THE DEFECTS
 *
 * Every test that can run over HTTP does, against the seed: the defects were found on rendered pages, and a test that
 * calls the store and never the page is how (a) and (e) went unnoticed.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { APP_ROLES } from '../src/roles.ts';
import { can, NotAuthorised, REGISTERED_ACTIONS, type Actor, type Obj } from '../src/authz.ts';
import { AuditLog } from '../src/audit.ts';
import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';
import * as C from '../src/web/crm.ts';
import * as D from '../src/web/documents.ts';
import * as DB from '../src/web/dashboard.ts';
import * as P from '../src/web/pipeline.ts';
import * as I from '../src/web/introducers.ts';
import * as V from '../src/web/vat.ts';
import * as T from '../src/web/tasks.ts';
import * as F from '../src/web/claim-facts.ts';
import * as MD from '../src/web/mandatory-documents.ts';
import { invoiceWindowNeed } from '../src/web/claim-record.ts';
import { acceptClientBytes, finishUpload, issuedJob } from '../src/web/uploads.ts';
import { formatPence } from '../src/web/shown-range.ts';
import { localDate } from '../src/web/localtime.ts';
import { anyStageLabel, stage as stageOf } from '../src/web/stages.ts';
import { distinctReasons } from '../src/web/tasks-pages.ts';
import { actor, fixedClock, keys } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string; location: string | null };
type Client = {
  get(path: string): Promise<Res>;
  post(path: string, fields: Record<string, string>): Promise<Res>;
  raw(path: string, init: RequestInit): Promise<Res>;
};

const PDF = new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n'));
const BACKEND = join(import.meta.dirname, '..');

/**
 * THE CLOCK IS PASSED, NOT READ — Phase 132, 15 September 2026. The seed carries fixed calendar dates; on the wall
 * clock raising the seeded fee returned 400 before September 2026. The same fixed clock testApp() uses.
 */
async function boot(): Promise<{ made: Made; signIn(who: string): Promise<Client>; close(): void }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-follow-on-')), now: fixedClock() });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const port = (made.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const client = (cookie: string): Client => {
    const raw = async (path: string, init: RequestInit): Promise<Res> => {
      const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
      return { status: x.status, body: await x.text(), location: x.headers.get('location') };
    };
    return {
      raw,
      get: (path) => raw(path, {}),
      post: (path, fields) => raw(path, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(),
      }),
    };
  };
  return {
    made,
    close: () => made.close(),
    async signIn(who) {
      const r = await fetch(`${base}/login`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
      });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return client(r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; '));
    },
  };
}

function who(db: Db, role: 'ADMIN' | 'SALES' | 'ACCOUNTING' | 'SURVEYING'): Actor {
  const u = db.get<{ id: string }>('SELECT id FROM users WHERE role = ? LIMIT 1', [role]);
  assert.ok(u, `no ${role} user`);
  return { id: u.id, role, business_id: null, disabled: false };
}

function deps(made: Made): { db: Db; audit: AuditLog; now: () => string; newId: () => string } {
  return { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
}

function businessNamed(db: Db, name: string): string {
  const b = db.get<{ id: string }>('SELECT id FROM businesses WHERE name = ?', [name]);
  assert.ok(b, `no business named ${name}`);
  return b.id;
}

function count(db: Db, sql: string, params: readonly (string | number | null)[] = []): number {
  return db.get<{ n: number }>(sql, params)?.n ?? -1;
}

const DUNMARROW = 'Dunmarrow Medical Practice Limited';

/** Dunmarrow's assessed claim — the survey job's — and the claim at INVOICE the follow-on seeds on its branch surgery. */
function dunmarrow(db: Db): { business: string; assessed: string; atInvoice: string } {
  const business = businessNamed(db, DUNMARROW);
  const assessed = db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL', [business]);
  const atInvoice = db.get<{ id: string }>("SELECT id FROM claims WHERE business_id = ? AND stage = 'INVOICE'", [business]);
  assert.ok(assessed && atInvoice);
  return { business, assessed: assessed.id, atInvoice: atInvoice.id };
}

/** An upload through the one handler — steps 1 to 7 — as a person, linked to a claim. Returns the logical document. */
async function uploadOnClaim(made: Made, as: Actor, business: string, claim: string, type_code: string): Promise<string> {
  const started = await D.startDocumentUpload({ ...deps(made), store: made.store }, as, {
    business_id: business, type_code, logical_document_id: null, request_id: null, claim_id: claim,
  });
  assert.equal(started.ok, true, started.ok ? '' : started.why);
  if (!started.ok) return '';
  const up = { db: made.app.db, store: made.store, now: made.app.now, actor: as.id, newId: randomUUID, audit: made.app.audit };
  const token = new URL(`http://x${started.url}`).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(up, { doc_id: started.doc_id, token, bytes: PDF });
  const job = issuedJob(made.app.db, started.doc_id);
  assert.ok(w.ok && job !== null, 'the bytes were not accepted');
  if (!w.ok || job === null) return '';
  const done = await finishUpload(up, job, w.written_at);
  assert.equal(done.error, undefined, 'the handler refused the upload');
  return started.logical_document_id;
}

/** The words a person reads on a page: markup and entities taken out. */
function visible(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
}

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('who may do what — two new actions and the one the audit page asks', () => {
  test('claim_team.write, document_centre.enter and audit.read: registered, deny by default, refused for every role not granted them and for a disabled user', () => {
    const claim: Obj = { type: 'claim', id: 'c', business_id: 'b', assigned_surveyor_ids: ['u-SURVEYING'] };
    const document: Obj = {
      type: 'document', id: 'd', business_id: 'b', readers: 'CLAIM_TEAM', carries_value: true, letter_signed: false, assigned_surveyor_ids: [],
    };
    const audit: Obj = { type: 'audit', id: 'audit_log' };
    const granted: readonly [string, Obj, readonly string[]][] = [
      ['claim_team.write', claim, ['ADMIN', 'SALES']],
      ['document_centre.enter', document, ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING']],
      ['audit.read', audit, ['ADMIN']],
    ];
    for (const [action, obj, roles] of granted) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        assert.equal(can(actor(role, `u-${role}`, role === 'CLIENT' ? 'b' : null), action, obj), roles.includes(role), `${role} on ${action}`);
      }
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, obj), false, `a disabled ADMIN on ${action}`);
    }
    assert.equal(can(actor('ADMIN'), 'claim_team.unregistered', claim), false, 'an unregistered action was allowed');
  });
});

/* ================================================================== *
 * ROWS 4.12, 8.5, 8.6 — THE INTRODUCER AND THE SOURCE
 * ================================================================== */

describe('the introducer and the source, where they belong', () => {
  test('THE INTRODUCER AND THE SOURCE are read through the lead — on the organisation page, the claim page and both view.json — never a column and never typed; SURVEYING and ACCOUNTING are given neither', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const firm = I.createIntroducer(deps(h.made), who(db, 'ADMIN'), { firm_name: 'Follow-On Accountants LLP', introducer_type: 'ACCOUNTANT_FIRM' });
      assert.equal(firm.ok, true);
      if (!firm.ok) return;
      // The lead Dunmarrow's assessed claim was converted from is a referral from the firm — its own columns, as a referral sets them.
      db.run("UPDATE leads SET introducer_id = ?, source = 'REFERRAL' WHERE claim_id = ?", [firm.id, d.assessed]);

      const sales = await h.signIn('sales');
      const org = JSON.parse((await sales.get(`/staff/organisations/${d.business}/view.json`)).body) as C.OrganisationView;
      assert.deepEqual((org.referred_by ?? []).map((f) => [f.firm_name, f.leads]), [['Follow-On Accountants LLP', 1]]);
      const orgPage = await sales.get(`/staff/clients/${d.business}`); // Phase 134: the one client page
      assert.match(orgPage.body, /Referred by/);
      assert.ok(orgPage.body.includes('Follow-On Accountants LLP'));

      const claim = JSON.parse((await sales.get(`/staff/claims/${d.assessed}/view.json`)).body) as C.ClaimView;
      assert.equal(claim.origin?.introducer?.firm_name, 'Follow-On Accountants LLP');
      assert.equal(claim.origin?.source.value, 'REFERRAL');
      assert.match(claim.origin?.source.from ?? '', /the lead this claim was converted from/);
      const claimPage = await sales.get(`/staff/claims/${d.assessed}`);
      assert.ok(claimPage.body.includes('Follow-On Accountants LLP') && claimPage.body.includes('Referral'));

      // A claim a person opened has no lead: its source is the organisation's, said so, and no firm referred it.
      const opened = JSON.parse((await sales.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView;
      assert.equal(opened.origin?.lead, null);
      assert.equal(opened.origin?.introducer, null);
      assert.match(opened.origin?.source.from ?? '', /the organisation/);

      // DERIVED, NEVER A COLUMN.
      for (const table of ['claims', 'businesses']) {
        const cols = db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table]).map((x) => x.name);
        assert.equal(cols.some((x) => /introducer|firm/.test(x)), false, `${table} holds a firm`);
      }
      assert.equal(db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', ['claims']).some((x) => x.name === 'source'), false, 'claims holds a source');

      // SURVEYING and ACCOUNTING: no origin on the claim, and the organisation refused outright.
      for (const role of ['surveying', 'accounting']) {
        const c = await h.signIn(role);
        const r = await c.get(`/staff/claims/${d.assessed}/view.json`);
        assert.equal(r.status, 200, role);
        // At the top of the claim — a task's own `origin` (who made the task) is another field, deeper in.
        assert.equal('origin' in (JSON.parse(r.body) as object), false, `${role} was given the origin`);
        assert.equal(r.body.includes('Follow-On Accountants LLP'), false, `${role} was given the firm`);
        assert.equal((await c.get(`/staff/organisations/${d.business}/view.json`)).status, 403, `${role} opened the organisation`);
      }
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROWS 8.4, 23.7 — THE CLAIM TEAM
 * ================================================================== */

describe('the claim team', () => {
  test('THE CLAIM TEAM links the organisation’s own accountant to this claim by migration 020 — a link, never a user; audited with no name; ended, never deleted; refused twice, for a decision maker, for another organisation’s adviser, at the table, and to SURVEYING', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const usersBefore = count(db, 'SELECT COUNT(*) AS n FROM users');
      const sales = await h.signIn('sales');
      const added = await sales.post(`/staff/organisations/${d.business}/contacts`, {
        business_id: d.business, full_name: 'Practice Accountant Contact', contact_type: 'ACCOUNTANT', email: 'accounts@b4.example.invalid',
      });
      assert.equal(added.status, 303);
      const accountant = db.get<{ id: string }>("SELECT id FROM contacts WHERE business_id = ? AND contact_type = 'ACCOUNTANT'", [d.business]);
      const decision = db.get<{ id: string }>("SELECT id FROM contacts WHERE business_id = ? AND contact_type = 'DECISION_MAKER'", [d.business]);
      assert.ok(accountant && decision);

      const before = (JSON.parse((await sales.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView).team;
      assert.deepEqual((before?.candidates ?? []).map((c) => c.id), [accountant.id], 'the decision maker was offered for the team');
      assert.equal((await sales.post(`/staff/claims/${d.atInvoice}/team`, { contact_id: accountant.id })).status, 303);
      const link = db.get<{ id: string }>('SELECT id FROM claim_contacts WHERE claim_id = ? AND contact_id = ? AND unlinked_at IS NULL', [d.atInvoice, accountant.id]);
      assert.ok(link, 'no link was written');
      assert.equal(count(db, 'SELECT COUNT(*) AS n FROM users'), usersBefore, 'the accountant became a user');
      const line = db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CLAIM_TEAM_LINKED' ORDER BY seq DESC LIMIT 1");
      assert.ok(line && line.detail.includes(accountant.id) && !line.detail.includes('Practice Accountant'), 'the audit line names the person, or not the contact');
      const after = (JSON.parse((await sales.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView).team;
      assert.deepEqual((after?.contacts ?? []).map((c) => [c.name, c.type]), [['Practice Accountant Contact', 'Accountant']]);

      // Refused, with the reason, and nothing written.
      const linksBefore = count(db, 'SELECT COUNT(*) AS n FROM claim_contacts');
      const again = await sales.post(`/staff/claims/${d.atInvoice}/team`, { contact_id: accountant.id });
      assert.equal(again.status, 400); assert.match(again.body, /already on this claim/);
      const dm = await sales.post(`/staff/claims/${d.atInvoice}/team`, { contact_id: decision.id });
      assert.equal(dm.status, 400); assert.match(dm.body, /accountant or adviser/);
      const elverton = businessNamed(db, 'Elverton Private Hospital Limited');
      const other = C.addContact(deps(h.made), who(db, 'SALES'), elverton, { full_name: 'Other Adviser Contact', contact_type: 'ADVISER' });
      assert.equal(other.ok, true);
      const otherOrg = await sales.post(`/staff/claims/${d.atInvoice}/team`, { contact_id: other.ok ? other.id : '' });
      assert.equal(otherOrg.status, 400); assert.match(otherOrg.body, /own contacts/);
      assert.equal(count(db, 'SELECT COUNT(*) AS n FROM claim_contacts'), linksBefore);
      // …and by the table, whatever a caller does.
      const sid = who(db, 'SALES').id;
      assert.throws(() => db.run('INSERT INTO claim_contacts (id, claim_id, contact_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), d.atInvoice, decision.id, sid, h.made.app.now()]), /accountant or adviser/);
      assert.throws(() => db.run('INSERT INTO claim_contacts (id, claim_id, contact_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), d.atInvoice, other.ok ? other.id : '', sid, h.made.app.now()]), /own organisation/);
      assert.throws(() => db.run('DELETE FROM claim_contacts WHERE id = ?', [link.id]), /never deleted/);

      // SURVEYING — who reaches this claim through its survey job — links nothing and ends nothing.
      const surveyor = await h.signIn('surveying');
      assert.equal((await surveyor.post(`/staff/claims/${d.atInvoice}/team`, { contact_id: accountant.id })).status, 403);
      assert.equal((await surveyor.post(`/staff/claim-team/${link.id}/end`, {})).status, 403);
      assert.equal(db.get<{ unlinked_at: string | null }>('SELECT unlinked_at FROM claim_contacts WHERE id = ?', [link.id])?.unlinked_at, null);

      // Ended with who and when, once.
      assert.equal((await sales.post(`/staff/claim-team/${link.id}/end`, {})).status, 303);
      const ended = db.get<{ unlinked_at: string | null; unlinked_by: string | null }>('SELECT unlinked_at, unlinked_by FROM claim_contacts WHERE id = ?', [link.id]);
      assert.ok(ended?.unlinked_at !== null && ended?.unlinked_by === sid);
      assert.throws(() => db.run('UPDATE claim_contacts SET unlinked_at = NULL, unlinked_by = NULL WHERE id = ?', [link.id]), /ended once/);
      assert.equal((await sales.post(`/staff/claim-team/${link.id}/end`, {})).status, 400);
    } finally { h.close(); }
  });

  test('THE TEAM PANEL IS BUILT FORWARDS: ADMIN reads the tax adviser as the sign-off record and never a person; SURVEYING is drawn the owner and the surveyor and nothing else; ACCOUNTING no team at all', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const admin = await h.signIn('admin');
      const a = JSON.parse((await admin.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView;
      assert.equal(a.team?.tax_adviser?.state, 'RECORDED');
      if (a.team?.tax_adviser?.state === 'RECORDED') {
        assert.equal(a.team.tax_adviser.adviser, 'CAPREBATE_CTA');
        assert.equal(a.team.tax_adviser.credential, 'Chartered Tax Adviser');
      }
      assert.equal(a.team?.owner, 'Sales User');
      assert.equal(a.team?.surveyor, 'Surveying User');
      assert.match((await admin.get(`/staff/claims/${d.atInvoice}`)).body, /the sign-off record, signed on 1 Sep 2026/i);
      // A claim with no sign-off says so, and is never shown a name in its place.
      const b1 = db.get<{ id: string }>('SELECT c.id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = ?', ['Aldergate Care Group Limited']);
      assert.ok(b1);
      const noSignoff = JSON.parse((await admin.get(`/staff/claims/${b1.id}/view.json`)).body) as C.ClaimView;
      assert.equal(noSignoff.team?.tax_adviser?.state, 'NOT_RECORDED');

      const surveyor = await h.signIn('surveying');
      const s = JSON.parse((await surveyor.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView;
      assert.deepEqual(Object.keys(s.team ?? {}).sort(), ['may_link', 'owner', 'surveyor', 'surveyor_reach']);
      assert.equal(s.team?.may_link, false);

      const accounting = await h.signIn('accounting');
      const x = JSON.parse((await accounting.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as Record<string, unknown>;
      assert.equal('team' in x, false, 'ACCOUNTING was given the team');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROW 22.13 — THE DOCUMENT CENTRE
 * ================================================================== */

describe('the document centre', () => {
  test('THE DOCUMENT CENTRE lists every document each reader may read and no other — each row asked of document.read — with fixed filters and sorts, anything else said, no search of what a document says and no export', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const admin = who(db, 'ADMIN');
      const lease = await uploadOnClaim(h.made, admin, d.business, d.assessed, 'LEASE');
      // A fee invoice, which no upload can create, written as its row would be and linked to the same claim.
      const invoiceDoc = randomUUID();
      db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, 1, ?, ?)',
        [invoiceDoc, d.business, 'INVOICE', admin.id, h.made.app.now()]);
      db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [randomUUID(), d.business, admin.id, 'invoice-1-version-1', 'DISCHARGED', h.made.app.now(), invoiceDoc, 'INVOICE']);
      db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)',
        [randomUUID(), invoiceDoc, d.assessed, admin.id, h.made.app.now()]);

      const ids = (a: Actor): string[] => D.documentCentre(db, a, new URLSearchParams()).rows.map((r) => r.id);
      assert.ok(ids(admin).includes(lease) && ids(admin).includes(invoiceDoc));
      assert.ok(ids(who(db, 'SALES')).includes(lease) && !ids(who(db, 'SALES')).includes(invoiceDoc), 'SALES read the fee invoice');
      assert.ok(ids(who(db, 'ACCOUNTING')).includes(invoiceDoc) && !ids(who(db, 'ACCOUNTING')).includes(lease), 'ACCOUNTING read the lease');
      assert.ok(ids(who(db, 'SURVEYING')).includes(lease) && !ids(who(db, 'SURVEYING')).includes(invoiceDoc), 'SURVEYING read the fee invoice');
      for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
        const a = who(db, role);
        for (const r of D.documentCentre(db, a, new URLSearchParams()).rows) {
          const l = db.get<{ id: string; business_id: string; readers: string; carries_value: number }>(
            'SELECT l.id, l.business_id, t.readers, t.carries_value FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?', [r.id]);
          assert.ok(l && can(a, 'document.read', D.documentObj(db, l)), `${role} was listed a document it may not read`);
        }
      }
      assert.throws(() => D.documentCentre(db, actor('CLIENT', 'u-CLIENT', d.business), new URLSearchParams()), NotAuthorised);

      // FIXED FILTERS AND SORTS — anything else is said, and never searched.
      const leases = D.documentCentre(db, admin, new URLSearchParams({ type: 'LEASE', state: 'RECEIVED', sort: 'type' }));
      assert.ok(leases.rows.length >= 1 && leases.rows.every((r) => r.type.code === 'LEASE' && r.state.key === 'RECEIVED'));
      assert.deepEqual(leases.applied.map((x) => x.key), ['type', 'state']);
      const odd = D.documentCentre(db, admin, new URLSearchParams({ q: 'lease', type: 'NOT_A_TYPE', sort: 'text' }));
      assert.ok(odd.said.some((x) => /^q: not a filter/.test(x)), 'a text search was not said to be refused');
      assert.ok(odd.said.some((x) => /^Type:/.test(x)) && odd.said.some((x) => /^Order:/.test(x)));
      assert.equal(odd.rows.length, odd.read, 'an unapplied filter narrowed the list');

      const sales = await h.signIn('sales');
      const page = await sales.get('/staff/documents');
      assert.equal(page.status, 200);
      assert.ok(page.body.includes('Lease, and any licence for alterations 1'));
      assert.equal(/export\.csv/.test(page.body), false, 'the centre offers an export');
      assert.notEqual((await sales.get('/staff/documents/export.csv')).status, 200, 'an export route answered');
      const surveyor = await h.signIn('surveying');
      const json = await surveyor.get('/staff/documents/view.json');
      assert.equal(json.status, 200);
      assert.equal(json.body.includes(invoiceDoc), false);
      const client = await h.signIn('client');
      assert.equal((await client.get('/staff/documents')).status, 403);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROWS 22.16, 29.11 — REPORTS WITH A PERIOD
 * ================================================================== */

describe('reports with a period — the dashboard over a period is the reports screen', () => {
  test('A PERIOD FROM THE FIXED TABLE: this month, this quarter, a UK financial year and any from-to range of UK dates — anything else dropped and said — and no period is exactly today’s dashboard', async () => {
    const today = '2026-09-12';
    const read = (q: Record<string, string>) => DB.readPeriod(new URLSearchParams(q), today);
    assert.deepEqual(read({ period: 'MONTH' }).period, { key: 'MONTH', from: '2026-09-01', to: '2026-09-30', words: 'this month, September 2026' });
    assert.deepEqual([read({ period: 'QUARTER' }).period.from, read({ period: 'QUARTER' }).period.to], ['2026-07-01', '2026-09-30']);
    assert.deepEqual([read({ period: 'FINANCIAL_YEAR' }).period.from, read({ period: 'FINANCIAL_YEAR' }).period.to], ['2026-04-01', '2027-03-31']);
    assert.deepEqual([read({ period: 'FINANCIAL_YEAR', fy: '2024' }).period.from, read({ period: 'FINANCIAL_YEAR', fy: '2024' }).period.to], ['2024-04-01', '2025-03-31']);
    assert.deepEqual(DB.readPeriod(new URLSearchParams({ period: 'FINANCIAL_YEAR' }), '2027-02-01').period.from, '2026-04-01', 'February is in the year that began the April before');
    assert.deepEqual(read({ period: 'RANGE', from: '2025-11-03', to: '2026-02-14' }).period, { key: 'RANGE', from: '2025-11-03', to: '2026-02-14', words: '2025-11-03 to 2026-02-14' });
    for (const bad of [{ period: 'RANGE', from: '2026-02-14', to: '2025-11-03' }, { period: 'RANGE', from: '14/02/2026', to: '2026-03-01' },
      { period: 'RANGE', from: '2026-02-30', to: '2026-03-01' }, { period: 'WEEK' }]) {
      const r = read(bad);
      assert.equal(r.period.key, 'NONE', JSON.stringify(bad));
      assert.equal(r.said.length, 1, JSON.stringify(bad));
    }
    assert.ok(read({ period: 'FINANCIAL_YEAR', fy: 'soon' }).said.some((x) => /^Financial year/.test(x)));
    assert.ok(read({ period: 'MONTH', sql: 'x' }).said.some((x) => /^sql: not something/.test(x)));

    const h = await boot();
    try {
      const db = h.made.app.db;
      const now = h.made.app.now();
      for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
        const a = who(db, role);
        const plain = DB.dashboard(db, a, now);
        const none = DB.dashboard(db, a, now, DB.NO_PERIOD);
        assert.deepEqual(none, plain, `${role}: no period is not today’s dashboard`);
        assert.ok(plain.tiles.every((t) => !/The period chosen|As at today — a count/.test(t.basis)), `${role}: a tile spoke of a period nobody chose`);
      }
    } finally { h.close(); }
  });

  test('OVER A PERIOD, only what happened inside it is counted and what has no date is counted apart — leads by their date, completed claims by their completion, a lost lead apart — each tile says whether the period applies, and nothing is stored', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const now = h.made.app.now();
      const admin = who(db, 'ADMIN');
      const period = (q: Record<string, string>) => DB.readPeriod(new URLSearchParams(q), localDate(now)).period;
      const tile = (v: DB.Dashboard, key: string) => { const t = v.tiles.find((x) => x.key === key); assert.ok(t, key); return t; };

      const plain = DB.dashboard(db, admin, now);
      const past = DB.dashboard(db, admin, now, period({ period: 'RANGE', from: '2020-01-01', to: '2020-12-31' }));
      assert.ok(tile(plain, 'leads_by_source').lines.length >= 1);
      assert.equal(tile(past, 'leads_by_source').lines.length, 0, 'a lead from 2026 was counted in 2020');
      assert.equal(tile(past, 'leads_by_source').period, 'APPLIED');
      assert.equal(tile(past, 'claims_by_stage').period, 'AS_AT_TODAY');
      assert.deepEqual(tile(past, 'claims_by_stage').lines, tile(plain, 'claims_by_stage').lines, 'a count of what stands today moved with the period');
      assert.match(tile(past, 'claims_by_stage').basis, /As at today/);
      const thisYear = DB.dashboard(db, admin, now, period({ period: 'FINANCIAL_YEAR' }));
      assert.deepEqual(tile(thisYear, 'leads_by_source').lines, tile(plain, 'leads_by_source').lines);
      assert.ok(tile(thisYear, 'expected_completion').lines.some((l) => /Expected to complete in the UK financial year/.test(l.label)));

      // A LOST LEAD CARRIES NO DATE IT WAS LOST: in no period, and counted apart.
      const code = db.get<{ code: string }>("SELECT code FROM reason_lists WHERE list = 'LEAD_LOST' AND active = 1 ORDER BY ord LIMIT 1")?.code ?? '';
      db.run("UPDATE leads SET status = 'LOST', lost_reason = ? WHERE origin = 'REFERRAL'", [code]);
      assert.ok(tile(DB.dashboard(db, admin, now), 'exits_and_lost').lines.some((l) => /^Leads lost/.test(l.label)));
      const lost = tile(DB.dashboard(db, admin, now, period({ period: 'QUARTER' })), 'exits_and_lost');
      assert.equal(lost.lines.some((l) => /^Leads lost/.test(l.label)), false, 'an undated lost lead was placed in the period');
      assert.ok(lost.apart.some((x) => /no date it was lost/.test(x)));
      // A CLAIM COMPLETED IN JANUARY: in the financial year that holds January, and not in this month.
      const b6 = db.get<{ id: string }>('SELECT c.id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = ?', ['Fenmoor Nursing Homes Limited']);
      assert.ok(b6);
      db.run("UPDATE claims SET stage = 'CLOSED', completed_at = '2026-01-15T10:00:00.000Z' WHERE id = ?", [b6.id]);
      const completed = (q: Record<string, string>) => tile(DB.dashboard(db, admin, now, period(q)), 'won_and_completed').lines.find((l) => /^Completed/.test(l.label))?.value ?? '';
      assert.match(completed({ period: 'FINANCIAL_YEAR', fy: '2025' }), /^1 claim/);
      assert.match(completed({ period: 'MONTH' }), /^0 claims/);
      assert.match(completed({}), /^1 claim/);

      // PHASE 158c: the client's acceptance of their survey report (migration 101) is a record of the claim, not a stored report.
      assert.deepEqual(db.all("SELECT name FROM sqlite_master WHERE (name LIKE '%period%' OR name LIKE '%report%') AND name NOT LIKE '%client_report_acceptances%'"), [], 'something is stored for a report');
      const surveyor = await h.signIn('surveying');
      const s = await surveyor.get('/staff/dashboard/view.json?period=QUARTER');
      assert.equal(s.status, 200);
      const sv = JSON.parse(s.body) as DB.Dashboard;
      assert.deepEqual(sv.tiles.map((t) => t.key), ['my_jobs']);
      assert.equal(sv.period.key, 'QUARTER');
      const page = await (await h.signIn('sales')).get('/staff/reports?period=RANGE&from=2026-01-01&to=2026-12-31');
      // PHASE 136: the page behind Home's Reports tile, in plainer words.
      assert.match(page.body, /<h1>Reports<\/h1>/);
      assert.match(page.body, /Showing <strong>1 Jan 2026 to 31 Dec 2026<\/strong>/);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROW 23.8 — THE ESTIMATED FEE
 * ================================================================== */

describe('the estimated fee on the claim', () => {
  test('THE ESTIMATED FEE on the claim is the fee the finance view expects — read, never typed — for invoice.read alone; UNKNOWN wherever the signed figure is not known (N4); gone once our fee is raised', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const expected = V.expectedFees(db).find((e) => e.claim_id === d.atInvoice);
      assert.ok(expected && expected.expected_pence === 493_500, 'the finance view does not expect the seeded fee (3% of £164,500)');
      for (const role of ['admin', 'accounting']) {
        const c = await h.signIn(role);
        const v = JSON.parse((await c.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView;
        assert.equal(v.estimated_fee?.known, true, role);
        assert.equal(v.estimated_fee?.amount, formatPence(expected.expected_pence), role);
        assert.equal(v.estimated_fee?.counted_by_finance, true, role);
      }
      for (const role of ['sales', 'surveying']) {
        const c = await h.signIn(role);
        const r = await c.get(`/staff/claims/${d.atInvoice}/view.json`);
        assert.equal([...keys(JSON.parse(r.body))].includes('estimated_fee'), false, `${role} was given the estimated fee`);
        assert.equal(r.body.includes(formatPence(493_500)), false, `${role} was given the fee as text`);
        assert.equal((await c.get(`/staff/claims/${d.atInvoice}`)).body.includes('Our estimated fee'), false, `${role}’s page draws the fee`);
      }
      // N4: a claim with no sign-off record — the figure the fee needs is not known.
      const b1 = db.get<{ id: string }>('SELECT c.id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = ?', ['Aldergate Care Group Limited']);
      assert.ok(b1);
      const admin = await h.signIn('admin');
      const unknown = JSON.parse((await admin.get(`/staff/claims/${b1.id}/view.json`)).body) as C.ClaimView;
      assert.equal(unknown.estimated_fee?.known, false);
      assert.equal(unknown.estimated_fee?.amount, null);
      assert.match(unknown.estimated_fee?.reading ?? '', /^UNKNOWN — no signed-off figure/);
      assert.equal((await admin.get(`/staff/claims/${b1.id}`)).body.includes('£0'), false, 'not known was drawn as nought');
      // NO AGREED-FEE FIELD, anywhere on the claim.
      assert.equal(db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', ['claims']).some((x) => /fee/.test(x.name)), false);
      // Raised: the claim's money carries the fee, and the estimate is no longer drawn.
      const accounting = await h.signIn('accounting');
      assert.equal((await accounting.post(`/staff/finance/claims/${d.atInvoice}/raise`, { kind: 'FEE' })).status, 303);
      const raised = JSON.parse((await admin.get(`/staff/claims/${d.atInvoice}/view.json`)).body) as C.ClaimView;
      assert.equal('estimated_fee' in raised, false);
      assert.equal(raised.money?.length, 1);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROW 28.3 — THE PRIOR-CLAIM POSITION, DERIVED
 * ================================================================== */

describe('the prior-claim position, derived', () => {
  test('THE PRIOR-CLAIM POSITION IS DERIVED where the funnel’s own answer states it — a "yes" on one property is YES and a recorded answer is refused — and "not sure", "no" and a question never asked read identically, and none of them rules a prior claim out', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const t = h.made.app.now();
      const sales = who(db, 'SALES');
      /** An organisation the funnel created, with the draft the six screens wrote — or none, for a question never asked. */
      const funnelled = (state: Record<string, unknown> | null, labels: readonly string[]): { business: string; properties: string[] } => {
        const business = randomUUID();
        db.run('INSERT INTO businesses (id, name, sector, stage, created_at, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [business, `Prior Claim Test ${business.slice(0, 8)} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', t, 'WEBSITE', t]);
        const properties = labels.map((label) => {
          const id = randomUUID();
          db.run('INSERT INTO properties (id, business_id, label, postcode, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)', [id, business, label, t, t]);
          return id;
        });
        const assessment = randomUUID();
        db.run('INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [assessment, business, 'dental', t, 100_00, 200_00, t]);
        if (state !== null) {
          db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at, submitted_assessment_id) VALUES (?, ?, ?, ?, ?, ?)',
            [randomUUID(), JSON.stringify(state), 'Q3', t, t, assessment]);
        }
        return { business, properties };
      };
      const one = 'The Old Surgery, ZZ9 9AA';
      const reading = (b: { business: string; properties: string[] }): C.PriorClaimFact => C.propertyView(db, sales, b.properties[0] ?? '', { store: null }).existing_ca_claimed;

      // THE ANSWER THAT STATES THE FACT.
      const yes = funnelled({ own_prior_claim: 'yes', previous_owner_claimed: 'dont_know', properties: [{ address: one }] }, [one]);
      const derived = reading(yes);
      assert.equal(derived.value, 'YES');
      assert.equal(derived.derived, true);
      assert.equal(derived.source, C.PRIOR_CLAIM_SOURCE);
      assert.equal(C.priorClaimRuledOutFor(db, { business_id: yes.business, label: one, existing_ca_claimed: null }), false);
      const refused = C.updateProperty(deps(h.made), sales, yes.properties[0] ?? '', { existing_ca_claimed: 'NO' }, { store: null });
      assert.equal(refused.ok, false);
      assert.match(refused.ok ? '' : refused.why, /already known from the client’s own answer/);
      // A stored answer beside a derived one is cleared when the property is saved: the derived one governs.
      db.run("UPDATE properties SET existing_ca_claimed = 'NO' WHERE id = ?", [yes.properties[0] ?? '']);
      assert.equal(C.updateProperty(deps(h.made), sales, yes.properties[0] ?? '', { town: 'Nowhere Town' }, { store: null }).ok, true);
      assert.equal(db.get<{ v: string | null }>('SELECT existing_ca_claimed AS v FROM properties WHERE id = ?', [yes.properties[0] ?? ''])?.v, null);

      // ASSERT BOTH: never asked, and "not sure" — and "no", and a previous owner's "yes", and two properties — all the same reading.
      const neverAsked = reading(funnelled(null, [one]));
      assert.equal(neverAsked.known, false);
      assert.equal(neverAsked.derived, false);
      for (const [why, state, labels] of [
        ['not sure', { own_prior_claim: 'not sure', properties: [{ address: one }] }, [one]],
        ['a question never answered', { properties: [{ address: one }] }, [one]],
        ['the client’s own "no"', { own_prior_claim: 'no', previous_owner_claimed: 'no', properties: [{ address: one }] }, [one]],
        ['a previous owner "yes" — do they KNOW', { own_prior_claim: 'not sure', previous_owner_claimed: 'yes', properties: [{ address: one }] }, [one]],
        ['two properties', { own_prior_claim: 'yes', properties: [{ address: one }, { address: 'Second Site, ZZ9 9AB' }] }, [one, 'Second Site, ZZ9 9AB']],
        ['a property the funnel did not write', { own_prior_claim: 'yes', properties: [{ address: 'Somewhere Else, ZZ9 9AC' }] }, [one]],
      ] as const) {
        const b = funnelled(state as Record<string, unknown>, labels);
        assert.deepEqual(reading(b), neverAsked, `${why} did not read as never asked`);
        assert.equal(C.priorClaimRuledOutFor(db, { business_id: b.business, label: one, existing_ca_claimed: null }), false, `${why} ruled a prior claim out`);
      }
      // Only a recorded NO rules it out — so the refusals above could have failed.
      const recorded = funnelled(null, [one]);
      assert.equal(C.updateProperty(deps(h.made), sales, recorded.properties[0] ?? '', { existing_ca_claimed: 'NO' }, { store: null }).ok, true);
      assert.equal(C.priorClaimRuledOutFor(db, { business_id: recorded.business, label: one, existing_ca_claimed: 'NO' }), true);
      assert.equal(reading(recorded).source, 'recorded by staff');

      const page = await (await h.signIn('sales')).get(`/staff/properties/${yes.properties[0] ?? ''}`);
      assert.match(page.body, /is known from the client’s own answer in the assessment and is not asked/);
      assert.equal(page.body.includes('name="existing_ca_claimed"'), false, 'the form still asks it');
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * ROW 29.5 — MANDATORY DOCUMENTS, BUILT AND SWITCHED OFF
 * ================================================================== */

describe('mandatory documents at a stage — built, and switched off', () => {
  test('MANDATORY DOCUMENTS: switched on in Phase 151b; off, the gate out of DATA_GATHERING is exactly what it was, and the question it waited on is named by its title', async () => {
    // Phase 151b: ON — Word question 220 is closed and the officer said yes to the tax uploads (223), whose receipt
    // policies now exist. Everything below still proves that OFF is exactly the gate as it was.
    assert.equal(MD.MANDATORY_DOCUMENTS.enabled, true);
    /* Phase 151: the question it waited on (Word 47) was answered; it now waits on 220 and 223, named by their titles. */
    assert.equal(MD.MANDATORY_DOCUMENTS_QUESTION, 'May we accept tax returns and tax computations as uploads, and what must be removed from them?');
    assert.match(MD.MANDATORY_DOCUMENTS_ALSO_WAITS_ON, /nothing now/);
    assert.deepEqual(MD.MANDATORY_DOCUMENTS.requires.map((r) => `${r.type_code}:${r.condition}`),
      ['SALE_CONTRACT:BOUGHT', 'CPSE_REPLIES:BOUGHT', 'TAX_RETURN:ALWAYS', 'TAX_COMPUTATION:ALWAYS', 'SBA_ALLOWANCE_STATEMENT:SBA_ON_PURCHASE']); // Phase 159k
    const h = await boot();
    try {
      const db = h.made.app.db;
      const corvale = db.get<{ id: string }>("SELECT c.id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(corvale);
      const pc = P.loadPipelineClaim(db, corvale.id);
      assert.equal(pc.stage, 'DATA_GATHERING');
      const off = P.gateOut(db, pc, 'DATA_GATHERING', { mandatoryDocuments: { ...MD.MANDATORY_DOCUMENTS, enabled: false } });
      assert.deepEqual(off.needs.map((n) => n.what), ['No unresolved s.198 or s.199 election', P.MILESTONES.DATA_GATHERING_COMPLETE.label]);
      assert.deepEqual(MD.mandatoryDocumentNeeds(db, pc, { ...MD.MANDATORY_DOCUMENTS, enabled: false }), []);
      // On, as shipped: the four documents are needed on top — and nothing else changes.
      const shipped = P.gateOut(db, pc, 'DATA_GATHERING');
      assert.deepEqual(shipped.needs.slice(0, 2).map((n) => n.what), off.needs.map((n) => n.what));
      assert.equal(shipped.needs.length, off.needs.length + 5); // Phase 159k: and the seller's structures allowance statement
    } finally { h.close(); }
  });

  test('MANDATORY DOCUMENTS SWITCHED ON — the skip test: a claim cannot leave DATA_GATHERING without a received document of each type required; a request is not a receipt; a condition not known and one never recorded read alike and neither passes', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      /* Phase 151: the machinery is tested on the list this switch carried until Lakhbir's answer, as a fixture — two of
         his four documents (the tax return and computation) cannot be received until Word question 223 is answered, so
         his list cannot open the gate on the demo. His list is tested in the next test. */
      const on: MD.MandatoryDocuments = {
        ...MD.MANDATORY_DOCUMENTS, enabled: true,
        requires: [
          { type_code: 'FIRE_RISK_ASSESSMENT', condition: 'ALWAYS' }, { type_code: 'GRANT_FUNDING_AGREEMENT', condition: 'GRANT_FUNDED' },
          { type_code: 'SALE_CONTRACT', condition: 'ELECTION_MADE' }, { type_code: 'LEASE', condition: 'LEASEHOLD' },
        ],
      };
      const sales = who(db, 'SALES');
      const admin = who(db, 'ADMIN');
      const d = deps(h.made);
      const c = db.get<{ id: string; business_id: string; property_id: string }>(
        "SELECT c.id, c.business_id, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(c);
      // Everything else the gate reads, recorded — so what shuts it below is the documents and nothing else.
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'ELECTION_EXISTS', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_DOC', note: null }).ok, true);
      CF.floorAreaForClaim(h.made.app, c.id); // PHASE 158d (F44): a floor area on record first
      assert.equal(P.recordMilestone(d, sales, c.id, 'DATA_GATHERING_COMPLETE', null).ok, true);
      const pc = () => P.loadPipelineClaim(db, c.id);
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING', { mandatoryDocuments: { ...MD.MANDATORY_DOCUMENTS, enabled: false } }).open, true, 'off, the gate is open on the same records — both ways');

      const need = (label: RegExp) => { const n = P.gateOut(db, pc(), 'DATA_GATHERING', { mandatoryDocuments: on }).needs.find((x) => label.test(x.what)); assert.ok(n, String(label)); return n; };
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING', { mandatoryDocuments: on }).open, false);
      assert.equal(need(/^Fire risk assessment/).met, false);
      assert.equal(need(/^Sale or purchase contract/).met, true, 'an election recorded as absent still required its schedule');
      // N4 — ASSERT BOTH: the grant fact never recorded, then recorded as not known. The same need, and neither passes.
      const neverRecorded = need(/^Grant or NHS premises funding agreement/);
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'GRANTS_EXIST', answer: 'UNKNOWN', value: null, source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      assert.deepEqual(need(/^Grant or NHS premises funding agreement/), neverRecorded);
      assert.equal(neverRecorded.met, false);
      assert.match(neverRecorded.why, /not known/);
      assert.equal(need(/^Lease/).met, false, 'a tenure nobody recorded excused the lease');

      // THE SKIP TEST: the move asks the gate on the server, and the switch shuts it.
      const move = () => P.moveClaim(d, sales, c.id, { kind: 'FORWARD', to: 'SURVEY', next_action: { title: 'Book the survey', owner_id: sales.id, due_on: '2026-12-31' } }, { mandatoryDocuments: on });
      const refused = move();
      assert.equal(refused.ok, false);
      assert.match(refused.ok ? '' : refused.why, /Fire risk assessment is received/);
      // A REQUEST IS NOT A RECEIPT.
      assert.equal(D.createDocumentRequest(d, sales, { business_id: c.business_id, claim_id: c.id, type_code: 'FIRE_RISK_ASSESSMENT', why: 'the gate', holds_up: 'data gathering', due_on: null }).ok, true);
      assert.equal(need(/^Fire risk assessment/).met, false);
      // Received through the one handler; the facts settled; and the gate opens.
      await uploadOnClaim(h.made, admin, c.business_id, c.id, 'FIRE_RISK_ASSESSMENT');
      assert.equal(need(/^Fire risk assessment/).met, true);
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'GRANTS_EXIST', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_DOC', note: null }).ok, true);
      db.run("UPDATE properties SET tenure = 'FREEHOLD' WHERE id = ?", [c.property_id]);
      assert.equal(P.gateOut(db, pc(), 'DATA_GATHERING', { mandatoryDocuments: on }).open, true);
      const moved = move();
      assert.equal(moved.ok, true, moved.ok ? '' : moved.why);
    } finally { h.close(); }
  });

  test('LAKHBIR’S LIST, SWITCHED ON (Phase 151): the sale contract and the CPSE replies only when the client bought the building — not known and never recorded read alike — and the tax return and computation on every claim', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const on: MD.MandatoryDocuments = { ...MD.MANDATORY_DOCUMENTS, enabled: true };
      const sales = who(db, 'SALES');
      const d = deps(h.made);
      const c = db.get<{ id: string; property_id: string }>(
        "SELECT c.id, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Corvale Supported Living Limited'");
      assert.ok(c);
      const pc = P.loadPipelineClaim(db, c.id);
      const need = (label: RegExp) => { const n = MD.mandatoryDocumentNeeds(db, pc, on).find((x) => label.test(x.what)); assert.ok(n, String(label)); return n; };
      assert.ok(db.get("SELECT code FROM document_types WHERE code = 'TAX_RETURN'"), 'migration 045 adds the tax return type');
      assert.equal(need(/^Tax return/).met, false);
      assert.equal(need(/^Tax computation/).met, false);
      // N4 — ASSERT BOTH: never recorded, then recorded as not known. The same need, and neither passes.
      const neverRecorded = need(/^Sale or purchase contract/);
      assert.equal(neverRecorded.met, false);
      assert.match(neverRecorded.why, /whether the client bought the building is not known/);
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'UNKNOWN', value: null, source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      assert.deepEqual(need(/^Sale or purchase contract/), neverRecorded);
      assert.equal(need(/^Pre-contract enquiry replies/).met, false);
      // Recorded NO: a client who built or refitted is excused both.
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      assert.equal(need(/^Sale or purchase contract/).met, true);
      assert.equal(need(/^Pre-contract enquiry replies/).met, true);
      assert.match(need(/^Pre-contract enquiry replies/).why, /did not buy the building/);
      // Recorded YES: both are needed again.
      assert.equal(F.recordFact(d, sales, c.id, { fact_key: 'BOUGHT_THE_BUILDING', answer: 'VALUE', value: 'YES', source_id: 'CLIENT_ANSWER', note: null }).ok, true);
      assert.equal(need(/^Sale or purchase contract/).met, false);
      assert.equal(P.gateOut(db, P.loadPipelineClaim(db, c.id), 'DATA_GATHERING', { mandatoryDocuments: on }).open, false);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE DEFECTS THE GUIDE FOUND ON THE DEMO, 12 SEPTEMBER 2026
 * ================================================================== */

describe('the defects the guide found by running every exercise on the demo', () => {
  test('(a) THE RULES SCREEN SAVES A RULE THAT ASKS THE CLIENT FOR A DOCUMENT, OVER HTTP — the lease included — and changes one', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const admin = await h.signIn('admin');
      const form = (request_type: string): Record<string, string> => ({
        label: 'Ask for the lease when data gathering starts', trigger_event: 'STAGE_ENTERED', trigger_stage: 'DATA_GATHERING', trigger_activity: '',
        effect: 'REQUEST_DOCUMENT', request_type, task_title: 'The lease decides who owns the fixtures.', task_description: 'Data gathering.',
        task_activity_type: 'TASK', task_priority: '', due_in_days: '14', assign_to: 'SUBJECT_OWNER', assign_role: '', attach_to: 'SUBJECT', active: 'yes',
      });
      assert.ok((await admin.get('/staff/automation')).body.includes('name="request_type"'), 'the form does not draw the field');
      const before = count(db, 'SELECT COUNT(*) AS n FROM automation_rules');
      const r = await admin.post('/staff/automation', form('LEASE'));
      assert.equal(r.status, 303, visible(r.body).slice(0, 300));
      assert.equal(count(db, 'SELECT COUNT(*) AS n FROM automation_rules'), before + 1);
      const rule = db.get<{ id: string; request_type: string | null }>("SELECT id, request_type FROM automation_rules WHERE effect = 'REQUEST_DOCUMENT' ORDER BY created_at DESC LIMIT 1");
      assert.equal(rule?.request_type, 'LEASE');
      const changed = await admin.post(`/staff/automation/${rule?.id ?? ''}`, form('FIRE_RISK_ASSESSMENT'));
      assert.equal(changed.status, 303);
      assert.equal(db.get<{ t: string | null }>('SELECT request_type AS t FROM automation_rules WHERE id = ?', [rule?.id ?? ''])?.t, 'FIRE_RISK_ASSESSMENT');
      const none = await admin.post('/staff/automation', form(''));
      assert.equal(none.status, 400);
      assert.match(none.body, /Choose the document the rule asks the client for/);
    } finally { h.close(); }
  });

  test('(b) THE AUDIT LOG PAGE is ADMIN’s alone: kinds, ids and outcomes and never a value; the chain said intact, and broken once a row is changed outside the application; the read is itself a line', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const admin = await h.signIn('admin');
      const reads = count(db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'AUDIT_LOG_READ'");
      const page = await admin.get('/staff/audit?kind=LOGIN_SUCCEEDED');
      assert.equal(page.status, 200);
      assert.match(page.body, /Audit log checked: nothing changed\. All [\d,]+ records were checked/);
      assert.equal(count(db, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'AUDIT_LOG_READ'"), reads + 1, 'the read was not recorded');
      const v = (await import('../src/web/audit-log.ts')).auditLogView(deps(h.made), who(db, 'ADMIN'), new URLSearchParams({ kind: 'LOGIN_SUCCEEDED', outcome: 'SOMETIMES' }));
      assert.ok(v.lines.length >= 1 && v.lines.every((l) => l.kind === 'LOGIN_SUCCEEDED'));
      for (const l of v.lines) assert.deepEqual(Object.keys(l).sort(), ['actor_id', 'actor_role', 'at', 'kind', 'object_id', 'object_type', 'outcome', 'seq']);
      assert.ok(v.said.some((x) => /^Outcome/.test(x)));
      // Never a value: a detail written to the log is not on the page.
      h.made.app.audit.append({ at: h.made.app.now(), kind: 'LIST_EXPORTED', outcome: 'ALLOWED', actor_id: null, actor_role: null, object_type: 'list', object_id: 'CLAIMS', detail: { columns: ['a_detail_that_must_not_be_drawn'] } });
      assert.equal((await admin.get('/staff/audit')).body.includes('a_detail_that_must_not_be_drawn'), false, 'a detail was drawn');
      for (const role of ['sales', 'accounting', 'surveying']) assert.equal((await (await h.signIn(role)).get('/staff/audit')).status, 403, role);
      // Changed outside the application — the triggers bypassed, as sqlite3 on the file would — and the page says so.
      db.execDdl('DROP TRIGGER audit_log_no_update');
      db.run("UPDATE audit_log SET outcome = 'REFUSED' WHERE seq = 1");
      assert.match((await admin.get('/staff/audit')).body, /Audit log problem: a record was changed or removed\. Tell the Admin now\. The problem starts at record 1\./);
    } finally { h.close(); }
  });

  test('(b) npm run verify-audit — the documented command recomputes the chain from the database file: exit 0 intact, exit 1 once a row is changed outside the application, and it writes nothing', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cb-verify-audit-')), 'caprebate.db');
    const db = new Db(file);
    migrate(db, MIGRATIONS_DIR);
    const log = new AuditLog(db);
    for (const kind of ['LOGIN_FAILED', 'LOGIN_FAILED', 'RATE_LIMITED'] as const) log.append({ at: '2026-09-12T10:00:00.000Z', kind, outcome: 'REFUSED', detail: {} });
    db.close();
    const run = () => spawnSync(process.execPath, ['src/cli.ts', 'verify-audit'], { cwd: BACKEND, env: { ...process.env, CAPREBATE_DB: file }, encoding: 'utf8' });
    const ok = run();
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /audit log intact: 3 entries/);
    const again = new Db(file);
    assert.equal(count(again, 'SELECT COUNT(*) AS n FROM audit_log'), 3, 'verifying wrote a line');
    again.execDdl('DROP TRIGGER audit_log_no_update');
    again.run("UPDATE audit_log SET outcome = 'ALLOWED' WHERE seq = 2");
    again.close();
    const broken = run();
    assert.equal(broken.status, 1);
    assert.match(broken.stdout, /AUDIT LOG BROKEN at entry 2 of 3/);
    assert.match(JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')).scripts['verify-audit'] as string, /src\/cli\.ts verify-audit/);
  });

  test('(c) THE ONE-LOGIN NOTICE IS ON EVERY REGISTER PAGE — the identity store, the retention list and a contact’s consent history among them', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const contact = db.get<{ id: string }>("SELECT id FROM contacts WHERE contact_type = 'DECISION_MAKER' LIMIT 1");
      assert.ok(contact);
      const admin = await h.signIn('admin');
      for (const path of ['/staff/compliance', '/staff/compliance/aml', '/staff/compliance/rights', '/staff/compliance/complaints',
        '/staff/compliance/breaches', '/staff/compliance/identity', '/staff/compliance/retention', `/staff/compliance/consent/${contact.id}`]) {
        const r = await admin.get(path);
        assert.equal(r.status, 200, path);
        assert.ok(r.body.includes('KNOWN LIMITATION: ONE PERSON TODAY'), `${path} does not carry the notice`);
      }
    } finally { h.close(); }
  });

  test('(d) THE RULES PAGE SAYS EACH REFUSAL ONCE, the store still refuses each by name, and the seed’s comment names the two places that refuse the demo data', async () => {
    assert.deepEqual(distinctReasons([{ key: 'A', why: 'No rule may send anywhere but the outbox.' },
      { key: 'B', why: 'No rule may send anywhere but the outbox. A notice is written there.' }, { key: 'C', why: 'No rule may send anywhere but the outbox.' }]),
    ['No rule may send anywhere but the outbox. A notice is written there.']);
    const h = await boot();
    try {
      const admin = await h.signIn('admin');
      const page = await admin.get('/staff/automation');
      assert.equal(page.body.split('No rule can send a message itself').length - 1, 1);
      for (const effect of ['SEND_EMAIL', 'SEND_SMS', 'WEBHOOK']) {
        const r = await admin.post('/staff/automation', { label: 'x', trigger_event: 'LEAD_CREATED', effect, task_title: 'x', due_in_days: '1', assign_to: 'SUBJECT_OWNER' });
        assert.equal(r.status, 400, effect);
        assert.match(r.body, /No rule can send a message itself/, effect);
      }
    } finally { h.close(); }
    const seedSource = readFileSync(join(BACKEND, 'src/seed.ts'), 'utf8');
    assert.ok(seedSource.includes('`src/cli.ts` refuses to seed') && seedSource.includes('`tools/demo-server.ts`'));
    assert.equal(seedSource.includes('`app.ts` refuses to seed'), false);
    for (const f of ['src/cli.ts', 'tools/demo-server.ts']) assert.ok(readFileSync(join(BACKEND, f), 'utf8').includes("CAPREBATE_ALLOW_SEED !== '1'"), f);
    assert.equal(readFileSync(join(BACKEND, 'src/app.ts'), 'utf8').includes('CAPREBATE_ALLOW_SEED'), false);
  });

  test('(e) "CHANGE THE CLAIM" REFUSES A NEXT ACTION WITH ITS REASON, OVER HTTP, and writes nothing', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const snapshot = () => JSON.stringify([db.all('SELECT * FROM claims WHERE id = ?', [d.assessed]), db.all('SELECT id, title, status FROM staff_tasks ORDER BY id')]);
      const before = snapshot();
      const sales = await h.signIn('sales');
      for (const fields of [{ next_action: 'Ring the client', priority: 'HIGH' }, { next_action_due: '2026-10-01' }]) {
        const r = await sales.post(`/staff/claims/${d.assessed}`, fields);
        assert.equal(r.status, 400, JSON.stringify(fields));
        assert.match(r.body, /next action is a task now/);
      }
      assert.equal(snapshot(), before, 'a refused change wrote something');
      assert.equal((await sales.post(`/staff/claims/${d.assessed}`, { priority: 'HIGH' })).status, 303, 'the form no longer saves at all');
    } finally { h.close(); }
  });

  test('(f) A CLIENT FINISHES AN UPLOAD FROM A BROWSER: the portal’s page is a form with no script, and its multipart POST goes through the same handler with the same single-use key — received, stripped, and refused the second time', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const client = await h.signIn('client');
      const ticket = await client.post('/portal/documents', { type_code: 'FIRE_RISK_ASSESSMENT' });
      assert.equal(ticket.status, 200);
      assert.match(ticket.body, /enctype="multipart\/form-data"/);
      assert.match(ticket.body, /type="file"/);
      assert.equal(/<script/i.test(ticket.body), false);
      const action = (/action="(\/upload\/put\?[^"]+)"/.exec(ticket.body)?.[1] ?? '').replace(/&amp;/g, '&');
      const doc = new URL(`http://x${action}`).searchParams.get('doc') ?? '';
      assert.ok(doc !== '' && /token=/.test(action));
      const multipart = (file: Uint8Array | null): Buffer => Buffer.concat([
        Buffer.from('--B0UNDARY\r\nContent-Disposition: form-data; name="note"\r\n\r\nnothing\r\n'),
        ...(file === null ? [] : [Buffer.from('--B0UNDARY\r\nContent-Disposition: form-data; name="file"; filename="fire-risk.pdf"\r\nContent-Type: application/pdf\r\n\r\n'),
          Buffer.from(file), Buffer.from('\r\n')]),
        Buffer.from('--B0UNDARY--\r\n'),
      ]);
      const send = (file: Uint8Array | null) => client.raw(action, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=B0UNDARY' }, body: multipart(file) });
      const empty = await send(null);
      assert.equal(empty.status, 400); assert.match(empty.body, /no file was attached/);
      const sent = await send(PDF);
      assert.equal(sent.status, 200, visible(sent.body).slice(0, 300));
      assert.match(sent.body, /Received/);
      const row = db.get<{ strip: string | null; discharged: string | null; failure: string | null }>(
        'SELECT strip_recorded_at AS strip, quarantine_discharged_at AS discharged, failure_code AS failure FROM documents WHERE id = ?', [doc]);
      assert.ok(row && row.strip !== null && row.discharged !== null && row.failure === null, 'the file did not pass the receipt strip');
      assert.ok(count(db, 'SELECT COUNT(DISTINCT contract_step) AS n FROM document_events WHERE doc_id = ?', [doc]) >= 5, 'the handler’s steps are not on the record');
      const reused = await send(PDF);
      assert.equal(reused.status, 409, 'the single-use key was used twice');
      // ONE HANDLER: the router calls the upload's two steps once each, for a PUT and a POST alike.
      const router = readFileSync(join(BACKEND, 'src/web/router.ts'), 'utf8');
      assert.equal(router.split('acceptClientBytes(').length - 1, 1);
      assert.equal(router.split('finishUpload(').length - 1, 1);
    } finally { h.close(); }
  });

  test('(g) AN OPEN CLAIM NOBODY OWNS THAT BREAKS THE ONE-NEXT-ACTION RULE IS ON THE LANDING PAGE FOR SALES AND ADMIN — and on nobody else’s — until it has an owner', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const brackenfell = db.get<{ id: string; claim_ref: string; owner_id: string | null }>(
        "SELECT c.id, c.claim_ref, c.owner_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Brackenfell Dental Partnership LLP'");
      assert.ok(brackenfell && brackenfell.owner_id === null);
      // PHASE 136: ONE PLACE FOR "WHAT NEXT". Home no longer repeats the list: its next-actions row links to Tasks' view
      // "Claims with no next step", which carries the claim nobody owns — for Sales and Admin, and for nobody else.
      const link = '<a class="tilelink" href="/staff/next-actions"><span class="tilename">Claims with no next step</span>';
      for (const role of ['sales', 'admin']) {
        const as = await h.signIn(role);
        assert.ok((await as.get('/staff')).body.includes(link), `${role}’s landing page links to the list`);
        const list = await as.get('/staff/next-actions');
        assert.ok(list.body.includes(brackenfell.claim_ref), `${role}’s list carries the unowned claim`);
      }
      for (const role of ['accounting', 'surveying']) assert.equal((await (await h.signIn(role)).get('/staff')).body.includes(link), false, role);
      const sales = who(db, 'SALES');
      assert.ok(T.myWork(db, sales, h.made.app.now()).unowned_claims_breaking.some((c) => c.id === brackenfell.id));
      db.run('UPDATE claims SET owner_id = ? WHERE id = ?', [sales.id, brackenfell.id]);
      assert.equal(T.myWork(db, sales, h.made.app.now()).unowned_claims_breaking.some((c) => c.id === brackenfell.id), false, 'an owned claim stayed on the unowned list');
      assert.ok(T.myWork(db, sales, h.made.app.now()).claims_without_next_action.some((c) => c.id === brackenfell.id), 'and it is now on its owner’s own list');
    } finally { h.close(); }
  });

  test('(h) WORDS A USER READS, ON THE RENDERED PAGE: a lead with no range, a fact recorded by staff, the surveyor’s facts and its job list’s stages — and no developer’s function name on the dashboard, the claim or the finance invoice', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      const sales = await h.signIn('sales');
      // Phase 137: the range is a column of the leads' List view; the cards carry no range, by the no-lead-score rule.
      const leads = await sales.get('/staff/leads?layout=list');
      assert.ok(leads.body.includes('no range: no assessment was filled in for this lead'));
      assert.equal(leads.body.includes('not shown to this role'), false, 'a lead with no range was said to be hidden');

      const admin = await h.signIn('admin');
      const brackenfell = businessNamed(db, 'Brackenfell Dental Partnership LLP');
      const org = await admin.get(`/staff/clients/${brackenfell}`); // Phase 134: the one client page
      assert.ok(org.body.includes('recorded by staff') && org.body.includes('from the Companies House register record'));
      assert.equal(org.body.includes('from recorded by staff'), false);

      const surveyor = await h.signIn('surveying');
      const claimPage = await surveyor.get(`/staff/claims/${d.assessed}`);
      assert.equal(claimPage.status, 200);
      assert.equal(/<pre>/.test(claimPage.body), false, 'the surveyor’s facts are raw JSON');
      assert.ok(claimPage.body.includes('The claimant, for tax'));
      const jobs = await surveyor.get('/staff/survey');
      // UI tidy phase 10: the stage is drawn as a label in its group's colour.
      assert.ok(jobs.body.includes(`<span class="badge g-survey">${anyStageLabel('SURVEY')}</span>`), 'the job list does not use the procedure’s stage words');
      assert.equal(jobs.body.includes(stageOf('AT_SURVEY')?.label ?? 'missing'), false, 'the job list uses the client portal’s words');

      const invoice = db.get<{ id: string }>('SELECT id FROM invoices WHERE claim_id = ? LIMIT 1', [d.assessed]);
      assert.ok(invoice);
      for (const path of ['/staff/reports', `/staff/finance/${invoice.id}`, `/staff/claims/${d.atInvoice}`, `/staff/claims/${d.assessed}`]) {
        const r = await admin.get(path);
        assert.equal(r.status, 200, path);
        const identifiers = [...visible(r.body).matchAll(/\b([a-z]+[A-Z][a-zA-Z]+|CB_[A-Z]+(?:\.[A-Za-z_]+)?)\b/g)].map((m) => m[1]);
        assert.deepEqual(identifiers, [], `${path} prints a developer’s name`);
      }
    } finally { h.close(); }
  });

  test('(i) ACCOUNTING’S CLAIMS EXPORT SAYS WHAT IT DID NOT APPLY, beside the link and in the audit line; invoice search takes the start of a number, still asked of can()', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const accounting = await h.signIn('accounting');
      const list = await accounting.get('/staff/claims?stage=SURVEY&owner=none');
      assert.equal(list.status, 200);
      assert.match(list.body, /The file does not apply owner or stage/);
      assert.equal((await accounting.get('/staff/claims/export.csv?stage=SURVEY')).status, 200);
      const line = db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'LIST_EXPORTED' ORDER BY seq DESC LIMIT 1");
      assert.deepEqual((JSON.parse(line?.detail ?? '{}') as { not_applied?: string[] }).not_applied, ['stage']);
      const admin = await h.signIn('admin');
      assert.equal((await admin.get('/staff/claims?stage=SURVEY')).body.includes('The file does not apply'), false, 'ADMIN reads the stage');
      assert.equal((await admin.get('/staff/claims/export.csv?stage=SURVEY')).status, 200);
      assert.deepEqual((JSON.parse(db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'LIST_EXPORTED' ORDER BY seq DESC LIMIT 1")?.detail ?? '{}') as { not_applied?: string[] }).not_applied, []);

      const hits = async (c: Client, q: string): Promise<string[]> =>
        (JSON.parse((await c.get(`/staff/search/view.json?q=${encodeURIComponent(q)}`)).body) as { hits: { kind: string; label: string }[] }).hits
          .filter((x) => x.kind === 'INVOICE').map((x) => x.label.replace(/^.+ — invoice /, '')); // Phase 134: the company leads
      assert.deepEqual(await hits(accounting, 'CB-0'), ['CB-000001', 'CB-000002', 'CB-000003']);
      assert.deepEqual(await hits(accounting, 'CB-000002'), ['CB-000002']);
      assert.deepEqual(await hits(accounting, 'CB-3'), ['CB-000003'], 'the whole number stopped working');
      assert.deepEqual(await hits(accounting, '0000'), ['CB-000001', 'CB-000002', 'CB-000003'], 'the printed number’s start, without its letters');
      assert.deepEqual(await hits(accounting, 'CB-0%'), [], 'a wildcard was taken');
      assert.deepEqual(await hits(await h.signIn('sales'), 'CB-0'), [], 'SALES, which may not read an invoice, found one');
    } finally { h.close(); }
  });

  test('(i) THE SEED HAS A CLAIM AT INVOICE READY FOR OUR FEE — its sign-off record, both reports issued, the window open and the trigger reached — and ACCOUNTING raises the fee through the real route', async () => {
    const h = await boot();
    try {
      const db = h.made.app.db;
      const d = dunmarrow(db);
      assert.equal(count(db, "SELECT COUNT(*) AS n FROM claims WHERE stage = 'INVOICE'"), 1);
      assert.equal(count(db, 'SELECT COUNT(*) AS n FROM tax_adviser_signoffs WHERE claim_id = ?', [d.atInvoice]), 1);
      assert.deepEqual(db.all<{ kind: string }>("SELECT kind FROM claim_deliverables WHERE claim_id = ? AND state = 'ISSUED' ORDER BY kind", [d.atInvoice]).map((x) => x.kind),
        ['ACCOUNTANT_COMPUTATION_PACK', 'CLIENT_REPORT']);
      assert.equal(count(db, 'SELECT COUNT(*) AS n FROM invoices WHERE claim_id = ?', [d.atInvoice]), 0);
      const pc = P.loadPipelineClaim(db, d.atInvoice);
      assert.equal(invoiceWindowNeed(db, pc, h.made.app.now()).met, true);
      assert.equal(P.feeTriggerReached(db, pc).met, true);
      assert.equal(T.nextActionReading(db, pc, h.made.app.now()).breaks, null, 'the seeded claim breaks the one-next-action rule');
      const accounting = await h.signIn('accounting');
      const raised = await accounting.post(`/staff/finance/claims/${d.atInvoice}/raise`, { kind: 'FEE' });
      assert.equal(raised.status, 303, visible(raised.body).slice(0, 300));
      const inv = db.get<{ fee_pence: number; claim_value_pence: number }>('SELECT fee_pence, claim_value_pence FROM invoices WHERE claim_id = ?', [d.atInvoice]);
      assert.deepEqual({ ...inv }, { fee_pence: 493_500, claim_value_pence: 16_450_000 });
    } finally { h.close(); }
  });
});
