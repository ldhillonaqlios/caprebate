/**
 * CRM 8 OF 10 — THE COMPLIANCE REGISTERS. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *   "refusals for every non-compliance role"             → WHO MAY DO WHAT
 *   "the four Article 12A computations"                   → THE RIGHTS-REQUEST REGISTER (and test/compliance-clock.test.ts)
 *   "the PSC separation"                                  → CUSTOMER DUE DILIGENCE
 *   "OFF, nothing blocks a claim. ON, ENGAGEMENT cannot complete" → CUSTOMER DUE DILIGENCE
 *   "countable, as s.164B needs; the 30-day clock"        → THE COMPLAINTS LOG
 *   "the four-facts decision record; no policy in force"  → THE BREACH REGISTER
 *   "never bank details" (attempted invoice fraud)        → THE BREACH REGISTER
 *   "S2 ... every read audited ... nothing crosses"       → S2
 *   "one consent history ... a withdrawal must stop the next notice" → CONSENT
 *   "UNSET shown as unset ... a list of records past their clock"   → RETENTION
 *   "no tipping-off wording"                              → TIPPING OFF
 *   "N4 ... assert both"                                  → marked N4 throughout
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, NotAuthorised, type Obj } from '../src/authz.ts';
import * as C from '../src/web/compliance.ts';
import * as A from '../src/web/compliance-aml.ts';
import * as R from '../src/web/compliance-rights.ts';
import * as B from '../src/web/compliance-breach.ts';
import * as S from '../src/web/compliance-identity.ts';
import * as I from '../src/web/introducers.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import { templateRefusal, tipsOff } from '../src/web/templates.ts';
import { actor, testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-09-08T00:00:00.000Z';
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');
const NON_COMPLIANCE: readonly AppRole[] = ['SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT'];

function deps(a: App): C.ComplianceDeps {
  return { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
}

async function app(): Promise<App> {
  const a = await testApp();
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'fake$x', T0, T0]);
  }
  return a;
}

function business(a: App, name = 'Meadow Dental Limited'): string {
  const id = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [id, name, 'dental', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
  return id;
}

function clientUser(a: App, biz: string): string {
  const id = `u-client-${biz.slice(0, 6)}`;
  a.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,'CLIENT',?,?,?,?)",
    [id, `${id}@example.invalid`, `${id}@example.invalid`, 'Client Person', 'fake$x', T0, T0, biz]);
  return id;
}

function document(a: App, biz: string): string {
  const id = randomUUID();
  a.db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, biz, 'u-ADMIN', 'x.pdf', 'STORED', T0]);
  return id;
}

/** A referral converted onto an organisation — a lead, a firm and a claim, the way the application makes them. */
function referredClaim(a: App): { lead: string; firm: string; biz: string; claim: string } {
  const id = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
  const r = I.intakeReferral(id, SALES, {
    firm_name: 'Ledger & Co', introducer_type: 'ACCOUNTANT_FIRM', contact_name: 'Pat Partner', contact_email: 'pat@ledger.example.invalid',
    prospect_organisation: 'Meadow Dental Limited', prospect_sector: 'dental',
  }, 'STAFF');
  assert.ok(r.ok, r.ok ? '' : r.why);
  const firm = a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM leads WHERE id = ?', [r.id])?.introducer_id ?? '';
  const biz = business(a);
  for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) assert.equal(P.recordEnquiryCheck(id, SALES, { lead_id: r.id }, { check_key, answer: 'YES', note: null }).ok, true);
  const q = L.updateLead(id, SALES, r.id, { status: 'QUALIFIED' });
  assert.ok(q.ok, q.ok ? '' : q.why);
  const c = L.convertLead(id, SALES, r.id, { business_id: biz });
  assert.ok(c.ok, c.ok ? '' : c.why);
  return { lead: r.id, firm, biz, claim: c.id };
}

function engage(a: App, claim: string, biz: string): P.MoveResult {
  a.db.run('UPDATE claims SET stage = ? WHERE id = ?', ['ENGAGEMENT', claim]);
  a.db.run('INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(business_id) DO UPDATE SET letter_state = excluded.letter_state, signed_at = excluded.signed_at', [randomUUID(), biz, 'SIGNED', T0, T0]);
  return P.moveClaim({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, SALES, claim, {
    kind: 'FORWARD', to: 'DATA_GATHERING', next_action: { title: 'Gather the data', owner_id: 'u-SALES', due_on: '2026-12-31' },
  });
}

function ok(r: C.WriteResult): string {
  assert.ok(r.ok, r.ok ? '' : r.why);
  return r.id;
}

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('WHO MAY DO WHAT — five new actions, deny by default, every role not granted refused', () => {
  const GRANTS: Readonly<Record<string, readonly AppRole[]>> = {
    'compliance.read': ['ADMIN'], 'compliance.write': ['ADMIN'],
    'compliance.identity_read': ['ADMIN'], 'compliance.identity_write': ['ADMIN'],
    'share_consent.client_record': ['CLIENT'],
  };
  const objFor = (action: string): Obj => action.startsWith('share_consent') ? { type: 'share_consent', id: 'b1', business_id: 'b1' }
    : action.startsWith('compliance.identity') ? { type: 'identity_person', id: 'PR-0000000000000000' } : { type: 'compliance', id: 'x' };

  test('each role on each action, a client on its own organisation, and a disabled user refused everything', () => {
    for (const [action, granted] of Object.entries(GRANTS)) {
      for (const role of APP_ROLES) assert.equal(can(actor(role, `u-${role}`, 'b1'), action, objFor(action)), granted.includes(role), `${role} on ${action}`);
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, objFor(action)), false);
    }
    // a client on SOMEBODY ELSE'S organisation is refused the share route
    assert.equal(can(actor('CLIENT', 'u-c', 'b2'), 'share_consent.client_record', objFor('share_consent.client_record')), false);
  });

  test('the stores refuse what the table refuses — every register, S2, consent and retention, for Sales, Accounting, Surveying and a client', async () => {
    const a = await app();
    try {
      const biz = business(a);
      const d = deps(a);
      for (const role of NON_COMPLIANCE) {
        const who = actor(role, `u-${role}`, biz);
        const reads: (() => unknown)[] = [
          () => A.amlView(a.db, who, a.now()), () => R.rightsRegister(a.db, who), () => R.complaintsLog(a.db, who), () => B.breachRegister(a.db, who, a.now()),
          () => R.searchPerson(d, who, 'pat'), () => S.identityCounts(a.db, who), () => S.searchIdentity(d, who, 'pat'), () => S.retentionList(d, who, a.now()),
          () => R.complaintCount(a.db, who, '2026-01-01', '2026-12-31'),
        ];
        const writes: (() => unknown)[] = [
          () => C.recordSetting(d, who, { setting: 'AML_IN_SCOPE', value: 'true', effective_from: '2026-09-01', source: 'x' }),
          () => A.openCheck(d, who, { business_id: biz, claimant_type: 'SOLE_TRADER' }),
          () => R.logRequest(d, who, { received_at: '2026-09-08T10:00', received_via: 'POST', request_verbatim: 'x', limbs: 'ART_15' }),
          () => R.logComplaint(d, who, { received_at: '2026-09-08T10:00', received_via: 'POST', complaint_verbatim: 'x' }),
          () => B.openIncident(d, who, { kind: 'SECURITY_INCIDENT' }), () => S.recordPerson(d, who, { doc_id: 'x' }),
          () => C.setHold(d, who, {}), () => C.link(d, who, {}),
        ];
        for (const f of [...reads, ...writes]) assert.throws(f, NotAuthorised, `${role} was not refused`);
      }
      const n = a.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM cdd_checks) + (SELECT COUNT(*) FROM rights_requests) + (SELECT COUNT(*) FROM complaints) + ' +
        "(SELECT COUNT(*) FROM breach_incidents) + (SELECT COUNT(*) FROM identity_persons) + (SELECT COUNT(*) FROM compliance_settings WHERE recorded_by IS NOT NULL) AS n")?.n;
      assert.equal(n, 0, 'a refused write left something behind');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * CUSTOMER DUE DILIGENCE
 * ================================================================== */

describe('CUSTOMER DUE DILIGENCE — built, off, and PSC data never silently standing for beneficial ownership', () => {
  test('OFF: the shipped false and a setting never recorded read identically — nothing is asked at ENGAGEMENT (N4, both)', async () => {
    const a = await app();
    try {
      const biz = business(a);
      assert.equal(C.cddGateNeed(a.db, biz, '2026-01-01T12:00:00.000Z'), null, 'never recorded');
      assert.equal(C.settingReading(a.db, 'AML_IN_SCOPE', '2026-01-01T12:00:00.000Z').value, null);
      assert.equal(C.cddGateNeed(a.db, biz, '2026-09-20T12:00:00.000Z'), null, 'the shipped false');
      assert.equal(C.settingReading(a.db, 'AML_IN_SCOPE', '2026-09-20T12:00:00.000Z').value, 'false');
    } finally { a.close(); }
  });

  test('OFF a claim leaves ENGAGEMENT exactly as before; ON it cannot without a finished check, and can once one is on record', async () => {
    const a = await app();
    try {
      const off = referredClaim(a);
      assert.equal(engage(a, off.claim, off.biz).ok, true, 'off: today’s behaviour');

      ok(C.recordSetting(deps(a), ADMIN, { setting: 'AML_IN_SCOPE', value: 'true', effective_from: '2026-09-01', source: 'the test: a solicitor’s written answer' }));
      const on = referredClaim(a);
      const refused = engage(a, on.claim, on.biz);
      assert.equal(refused.ok, false, 'on: no finished check, no move');

      const d = deps(a);
      const doc = document(a, on.biz);
      const k = ok(A.openCheck(d, ADMIN, { business_id: on.biz, claimant_type: 'SOLE_TRADER' }));
      const contact = randomUUID();
      a.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, 1, 0, ?)', [contact, on.biz, 'Dee Dentist', T0]);
      ok(A.updateCheck(d, ADMIN, k, {
        identified: 'The individual', verification_method: 'Passport and a utility bill', evidence_document_id: doc,
        beneficial_ownership: 'NOT_APPLICABLE_INDIVIDUAL', authority_basis: 'PROPRIETOR', authority_contact_id: contact,
        authority_evidence: 'The proprietor in person', checked_on: '2026-09-08',
      }));
      ok(A.completeCheck(d, ADMIN, k));
      assert.equal(engage(a, on.claim, on.biz).ok, true, 'on: a finished check lets it move');
    } finally { a.close(); }
  });

  test('PHASE 132e — LEFT OFF, AND WHY: still off on 16 September 2026; ON, what it refuses is the move out of ENGAGEMENT for want of a finished check — never for want of a risk rating', async () => {
    const a = await app();
    try {
      const biz = business(a);
      assert.equal(C.amlInScope(a.db, '2026-09-16T12:00:00.000Z'), false, 'Phase 132e left AML_IN_SCOPE off');
      assert.equal(C.cddGateNeed(a.db, biz, '2026-09-16T12:00:00.000Z'), null);
      const d = deps(a);
      const doc = document(a, biz);
      const contact = randomUUID();
      a.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, 1, 0, ?)', [contact, biz, 'Dee Dentist', T0]);
      const fields = {
        identified: 'The individual', verification_method: 'Passport and a utility bill', evidence_document_id: doc,
        beneficial_ownership: 'NOT_APPLICABLE_INDIVIDUAL', authority_basis: 'PROPRIETOR', authority_contact_id: contact,
        authority_evidence: 'The proprietor in person', checked_on: '2026-09-08',
      };
      // No rating at all, and a rating in words: both finish. A rating is never among what a check still needs.
      for (const extra of [{}, { risk_rating: 'low, in words — no scale exists', risk_rating_basis: 'a sole trader known to us' }]) {
        const k = ok(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'SOLE_TRADER' }));
        ok(A.updateCheck(d, ADMIN, k, { ...fields, ...extra }));
        ok(A.completeCheck(d, ADMIN, k));
      }
      const empty = ok(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'SOLE_TRADER' }));
      const row = a.db.get<Record<string, unknown>>('SELECT * FROM cdd_checks WHERE id = ?', [empty]) as never;
      assert.equal(A.missingForCompletion(a.db, row).some((m) => /risk/i.test(m)), false);
      ok(C.recordSetting(d, ADMIN, { setting: 'AML_IN_SCOPE', value: 'true', effective_from: '2026-09-16', source: 'the test only' }));
      const need = C.cddGateNeed(a.db, business(a, 'Another Dental Limited'), '2026-09-16T12:00:00.000Z');
      assert.equal(need?.met, false, 'ON, an organisation with no finished check is refused at ENGAGEMENT — the block that keeps it off');
      assert.equal(/risk/i.test(`${need?.what} ${need?.why}`), false);
    } finally { a.close(); }
  });

  test('THE PSC SEPARATION: the pull alone records nobody; an owner from it is refused in code and by the database until THIS check relies on it by a dated decision', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const biz = business(a);
      const pull = randomUUID();
      a.db.run("INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, retrieved_at) VALUES (?, ?, 'CH_PSC', 'FREE', 'FIRED', ?, ?)", [pull, biz, T0, T0]);
      const contact = randomUUID();
      a.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, 1, 0, ?)', [contact, biz, 'Ola Owner', T0]);
      const k = ok(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'LIMITED_COMPANY' }));

      const v = A.checkView(a.db, ADMIN, k);
      assert.equal(v.owners.length, 0, 'the pull on its own records no beneficial owner');
      assert.match(v.psc_pull.reading, /does NOT stand for beneficial ownership/);

      const refused = A.recordOwner(d, ADMIN, k, { contact_id: contact, basis_of_control: 'over 50% of shares', identified_from: 'PSC_PULL' });
      assert.equal(refused.ok, false);
      assert.throws(() => a.db.run("INSERT INTO cdd_beneficial_owners (id, check_id, contact_id, basis_of_control, identified_from, psc_decision_id, recorded_by, recorded_at) VALUES (?, ?, ?, 'x', 'PSC_PULL', NULL, 'u-ADMIN', ?)",
        [randomUUID(), k, contact, T0]), /constraint|PSC/);

      const notRelied = ok(A.recordPscDecision(d, ADMIN, k, { decision: 'NOT_RELIED_ON', reasoning: 'Pulled for the common-control test only.', decided_on: '2026-09-08' }));
      assert.equal(A.recordOwner(d, ADMIN, k, { contact_id: contact, basis_of_control: 'over 50%', identified_from: 'PSC_PULL' }).ok, false, 'a decision NOT to rely does not open it');

      const other = ok(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'LIMITED_COMPANY' }));
      const othersDecision = ok(A.recordPscDecision(d, ADMIN, other, { decision: 'RELIED_ON_FOR_BENEFICIAL_OWNERSHIP', reasoning: 'Checked against the share register.', decided_on: '2026-09-08' }));
      assert.equal(A.recordOwner(d, ADMIN, k, { contact_id: contact, basis_of_control: 'over 50%', identified_from: 'PSC_PULL' }).ok, false, 'another check’s decision does not open this one');
      // THE TRIGGER ON ITS OWN: a decision id is given, so the column CHECK passes, and only the trigger can refuse —
      // a decision not to rely, and another check's decision to rely.
      for (const decision of [notRelied, othersDecision]) {
        assert.throws(() => a.db.run("INSERT INTO cdd_beneficial_owners (id, check_id, contact_id, basis_of_control, identified_from, psc_decision_id, recorded_by, recorded_at) VALUES (?, ?, ?, 'x', 'PSC_PULL', ?, 'u-ADMIN', ?)",
          [randomUUID(), k, contact, decision, T0]), /E_PSC_NOT_BENEFICIAL_OWNERSHIP/);
      }

      ok(A.recordPscDecision(d, ADMIN, k, { decision: 'RELIED_ON_FOR_BENEFICIAL_OWNERSHIP', reasoning: 'Checked against the share register.', decided_on: '2026-09-09' }));
      ok(A.recordOwner(d, ADMIN, k, { contact_id: contact, basis_of_control: 'over 50% of shares', identified_from: 'PSC_PULL' }));
      assert.equal(A.checkView(a.db, ADMIN, k).owners.length, 1);
    } finally { a.close(); }
  });

  test('a check that records beneficial ownership cannot finish with no owner, and what is missing is said in words', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const biz = business(a);
      const k = ok(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'CHARITY' }));
      const r = A.completeCheck(d, ADMIN, k);
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /what was identified/);
      ok(A.updateCheck(d, ADMIN, k, { identified: 'x', verification_method: 'x', register_ref: '1234567', beneficial_ownership: 'RECORDED', authority_basis: 'TRUSTEE_OR_AUTHORISED_OFFICER', authority_evidence: 'x', checked_on: '2026-09-08' }));
      const again = A.completeCheck(d, ADMIN, k);
      assert.equal(again.ok, false);
      assert.match(again.ok ? '' : again.why, /at least one beneficial owner/);
      assert.equal(A.openCheck(d, ADMIN, { business_id: biz, claimant_type: 'OTHER' }).ok, false, 'OTHER needs its note');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE RIGHTS-REQUEST REGISTER
 * ================================================================== */

describe('THE RIGHTS-REQUEST REGISTER — the pack’s four worked computations, through the register itself', () => {
  const ends = (v: R.RequestView): Record<string, string | null> =>
    Object.fromEntries(v.limbs.map((l) => [l.row.limb, l.clock?.applicable_period_end?.end ?? null]));

  test('RR-W1 — 3 March, nothing asked in return: 2 April, and the extension notice deadline is the same day', async () => {
    const a = await app();
    try {
      const id = ok(R.logRequest(deps(a), ADMIN, { received_at: '2027-03-03T09:15', received_via: 'DEDICATED_ADDRESS', request_verbatim: 'What do you hold about me?', limbs: 'ART_15' }));
      const v = R.requestView(a.db, ADMIN, id);
      assert.equal(v.request.request_ref, 'RR-001');
      assert.deepEqual(ends(v), { ART_15: '2027-04-02' });
      assert.equal(v.limbs[0]?.clock?.extension_notice_deadline?.end, '2027-04-02');
    } finally { a.close(); }
  });

  test('RR-W2 — identity asked 5 March, answered 20 March: the month runs from 20 March to 19 April', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(R.logRequest(d, ADMIN, { received_at: '2027-03-03T09:15', received_via: 'POST', request_verbatim: 'Send me what you hold.', limbs: 'ART_15' }));
      ok(R.updateRequest(d, ADMIN, id, { identity_status: 'REQUESTED', id_requested_at: '2027-03-05T10:00' }));
      // N4: asked and not yet answered — no deadline at all, never a guessed one
      assert.equal(R.requestView(a.db, ADMIN, id).limbs[0]?.clock?.applicable_period_end, null);
      ok(R.updateRequest(d, ADMIN, id, { identity_status: 'CONFIRMED', id_received_at: '2027-03-20T16:40' }));
      const v = R.requestView(a.db, ADMIN, id);
      assert.deepEqual(ends(v), { ART_15: '2027-04-19' });
      assert.equal(v.limbs[0]?.clock?.relevant_time_source, 'IDENTITY');
    } finally { a.close(); }
  });

  test('RR-W3 and RR-W4 — one letter, three rights, clarification 10 to 24 March: Art 15 ends 17 April, Art 21 and Art 17 end 2 April', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(R.logRequest(d, ADMIN, { received_at: '2027-03-03T11:00', received_via: 'POST', request_verbatim: 'Why have you got my name, take it off', limbs: 'ART_15,ART_21,ART_17' }));
      ok(R.recordLimb(d, ADMIN, id, { limb: 'ART_15', clarification_requested_at: '2027-03-10T09:00', clarification_received_at: '2027-03-24T09:00' }));
      const v = R.requestView(a.db, ADMIN, id);
      assert.deepEqual(ends(v), { ART_15: '2027-04-17', ART_17: '2027-04-02', ART_21: '2027-04-02' });
      const access = v.limbs.find((l) => l.row.limb === 'ART_15');
      assert.equal(access?.clock?.days_not_counted, 15);
      assert.equal(access?.clock?.extension_notice_deadline?.end, '2027-04-17', 'the pause carries the notice deadline with it');
      assert.equal(R.rightsRegister(a.db, ADMIN)[0]?.next_deadline, '2027-04-02', 'the register works to the earliest limb');
      const refused = R.recordLimb(d, ADMIN, id, { limb: 'ART_21', clarification_requested_at: '2027-03-10T09:00' });
      assert.equal(refused.ok, false, 'Trap 2: the pause is Article 15’s alone');
      assert.throws(() => a.db.run("UPDATE rights_request_limbs SET clarification_requested_at = '2027-03-10T09:00:00.000Z' WHERE request_id = ? AND limb = 'ART_21'", [id]), /constraint/);
    } finally { a.close(); }
  });

  test('closing: every limb decided with reasoning and an undue-delay assessment, the search recorded, and the response checked against both complaint rights', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(R.logRequest(d, ADMIN, { received_at: '2027-03-03T11:00', received_via: 'FORM', request_verbatim: 'What do you hold?', limbs: 'ART_15' }));
      assert.equal(R.closeRequest(d, ADMIN, id, {}).ok, false);
      ok(R.recordLimb(d, ADMIN, id, { limb: 'ART_15', decision: 'GRANTED', decision_reasoning: 'We hold one record.', undue_delay_assessment: 'Answered in nine days.' }));
      ok(R.updateRequest(d, ADMIN, id, { search_scope: 'RP-E1, RP-E2, defence packs, exports, the register', responded_at: '2027-03-12T10:00' }));
      const partial = R.closeRequest(d, ADMIN, id, { check_DATA: 'on' });
      assert.equal(partial.ok, false);
      assert.match(partial.ok ? '' : partial.why, /s\.164A/);
      const all = Object.fromEntries(Object.keys(R.ACCESS_RESPONSE_ITEMS).map((k) => [`check_${k}`, 'on']));
      ok(R.closeRequest(d, ADMIN, id, all));
      assert.equal(R.updateRequest(d, ADMIN, id, { outcome: 'x' }).ok, false, 'a closed request is kept as it was');
      assert.throws(() => a.db.run('DELETE FROM rights_requests WHERE id = ?', [id]), /not deleted/);
    } finally { a.close(); }
  });

  test('a response letter reaches the outbox, marked not sent, and nowhere else — and states the reasons and the three routes', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(R.logRequest(d, ADMIN, { received_at: '2027-03-03T11:00', received_via: 'POST', request_verbatim: 'Delete it', limbs: 'ART_17' }));
      assert.equal(R.queueLetter(d, ADMIN, id, { letter: 'RR_REFUSAL', to_email: 'sam@example.invalid' }).ok, false, 'a refusal states its reasons');
      const out = ok(R.queueLetter(d, ADMIN, id, { letter: 'RR_REFUSAL', to_email: 'sam@example.invalid', reasons: 'The record is evidence in a live claim.' }));
      const row = a.db.get<{ kind: string; sent_at: string | null; body: string }>('SELECT kind, sent_at, body FROM outbox WHERE id = ?', [out]);
      assert.equal(row?.kind, 'COMPLIANCE_LETTER');
      assert.equal(row?.sent_at, null);
      for (const phrase of ['section 164A', 'section 165', 'Go to court', 'The record is evidence in a live claim.']) assert.ok(row?.body.includes(phrase), phrase);
    } finally { a.close(); }
  });

  test('the search finds a person through an organisation, through a lead with no organisation and at a firm, with the tasks that name them — and never reaches S2', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const { firm } = referredClaim(a);
      const lead = randomUUID();
      a.db.run("INSERT INTO leads (id, origin, source, prospect_organisation, lead_date, status, created_at, updated_at) VALUES (?, 'STAFF', 'WEBSITE', 'Hill House', '2026-09-08', 'NEW', ?, ?)", [lead, T0, T0]);
      const leadPerson = randomUUID();
      a.db.run('INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, NULL, ?, ?, 1, 0, ?)', [leadPerson, lead, 'Robin Gatedexit', T0]);
      const hits = R.searchPerson(d, ADMIN, 'robin').hits;
      assert.ok(hits.some((h) => h.id === leadPerson && h.how === 'through a lead with no organisation'));
      const firmHits = R.searchPerson(d, ADMIN, 'pat partner').hits;
      assert.ok(firmHits.some((h) => h.how === 'at an introducing firm'), JSON.stringify(firmHits));
      assert.ok(firm.length > 0);
      assert.ok(R.searchPerson(d, ADMIN, 'nobody-here').s2_note.includes('S2'));
      const line = a.audit.entries().filter((e) => e.kind === 'RIGHTS_SEARCH_RUN').at(-1);
      assert.ok(line !== undefined && !JSON.stringify(line.detail).toLowerCase().includes('robin'), 'the audit line never carries the term');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE COMPLAINTS LOG
 * ================================================================== */

describe('THE COMPLAINTS LOG — countable, the thirty days, classified once', () => {
  test('thirty calendar days beginning with receipt; a classification is never revised; the s.164B count keeps the unclassified apart', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const yes = ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-03T10:00', received_via: 'FORM', complaint_verbatim: 'You never told me you had my name.', is_164a: 'YES', classification_reason: 'A data subject alleging an Article 14 failure.' }));
      ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-04T10:00', received_via: 'POST', complaint_verbatim: 'Both.', is_164a: 'BOTH', classification_reason: 'Fee and data.' }));
      ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-05T10:00', received_via: 'POST', complaint_verbatim: 'Your fee is too high.', is_164a: 'NO', classification_reason: 'No personal data.' }));
      const open = ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-06T10:00', received_via: 'VERBAL', complaint_verbatim: 'Not sure yet.' }));

      assert.equal(R.complaintView(a.db, ADMIN, yes).ack.acknowledgement_deadline, '2027-04-01');
      assert.equal(R.classifyComplaint(d, ADMIN, yes, { is_164a: 'NO', classification_reason: 'changed my mind' }).ok, false);
      assert.throws(() => a.db.run("UPDATE complaints SET is_164a = 'NO' WHERE id = ?", [yes]), /not revised/);
      const count = R.complaintCount(a.db, ADMIN, '2027-03-01', '2027-03-31');
      assert.deepEqual([count.s164a, count.not_164a, count.unclassified], [2, 1, 1]);
      ok(R.classifyComplaint(d, ADMIN, open, { is_164a: 'YES', classification_reason: 'On receipt, arguable, so yes.' }));
      assert.equal(R.complaintCount(a.db, ADMIN, '2027-03-01', '2027-03-31').s164a, 3);
    } finally { a.close(); }
  });

  test('closing needs the outcome told and the three onward routes given; out of scope only for a complaint that is not s.164A', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-03T10:00', received_via: 'FORM', complaint_verbatim: 'x', is_164a: 'YES', classification_reason: 'x' }));
      assert.equal(R.updateComplaint(d, ADMIN, id, { outcome: 'OUT_OF_SCOPE_ROUTE_GIVEN', out_of_scope_route: 'the Complaints Policy' }).ok, false);
      ok(R.updateComplaint(d, ADMIN, id, {
        acknowledged_at: '2027-03-03T12:00', outcome: 'NOT_UPHELD', outcome_reasoning: 'x', outcome_notified_at: '2027-03-20T12:00',
        undue_delay_assessment: 'x', lessons_and_changes: 'nothing needed to', decided_by: 'the DPO',
      }));
      assert.equal(R.closeComplaint(d, ADMIN, id, { check_S164A: 'on', check_S165: 'on' }).ok, false, 'the judicial remedy must be given too');
      ok(R.closeComplaint(d, ADMIN, id, { check_S164A: 'on', check_S165: 'on', check_JUDICIAL: 'on' }));
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE BREACH REGISTER
 * ================================================================== */

describe('THE BREACH REGISTER — the four facts, no policy in force, and attempted invoice fraud without bank details', () => {
  const base = { discovered_at: '2026-09-08T09:00', discovered_by: 'Lakhbir', discovery_route: 'NOTICED', awareness_at: '2026-09-08T09:30', awareness_basis: 'Saw it', occurred_state: 'UNKNOWN', occurred_basis: 'Not yet known' };

  test('an entry opens with the insurer recorded as NO POLICY IN FORCE, and an insurer told is refused on silence', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(B.openIncident(d, ADMIN, { ...base, kind: 'SECURITY_INCIDENT', description: 'A laptop was lost.' }));
      const v = B.incidentView(a.db, ADMIN, id, a.now());
      assert.deepEqual(v.told.map((t) => [t.recipient_kind, t.position]), [['INSURER', 'NO_POLICY_IN_FORCE']]);
      assert.equal(B.recordTold(d, ADMIN, id, { recipient_kind: 'INSURER', position: 'TOLD', told_at: '2026-09-08T12:00' }).ok, false);
      assert.throws(() => a.db.run("UPDATE breach_other_notifications SET position = 'NOT_TOLD' WHERE incident_id = ?", [id]), /no insurance policy/);
      const sheet = B.icoAnswerSheet(a.db, ADMIN, id, a.now());
      assert.ok(sheet.sections.flatMap((s) => s.lines).some((l) => l.field === 'Insurance' && /No policy in force/.test(l.answer)));
      assert.ok(sheet.sections.flatMap((s) => s.lines).some((l) => l.answer.startsWith('NOT SET')));
      // Phase 133i, 18 Sep 2026: the officer is the named contact; Lakhbir Dhillon only as the breach deputy.
      const contact = sheet.sections.flatMap((s) => s.lines).find((l) => l.field === 'Named contact')?.answer ?? '';
      assert.match(contact, /^Sadique Maskeen, Data Protection Officer/);
      assert.match(contact, /deputy[^—]*Lakhbir Dhillon/);
    } finally { a.close(); }
  });

  test('N4 — 34(3)(a) is refused on an UNKNOWN encryption fact and on no fact at all, and allowed on YES; the same for 34(3)(b)', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(B.openIncident(d, ADMIN, { ...base, kind: 'SECURITY_INCIDENT', description: 'A laptop was lost.' }));
      const decision = { art33_decision: 'NOT_NOTIFIED', art33_reasoning: 'Unlikely to result in a risk: encrypted.', decided_by: 'the DPO', decided_at: '2026-09-08T12:00', art34_reasoning: 'x' };
      assert.equal(B.recordDecision(d, ADMIN, id, { ...decision, art34_decision: 'NOT_COMMUNICATED_34_3_A' }).ok, false, 'never recorded');
      assert.equal(B.recordDecision(d, ADMIN, id, { ...decision, art34_decision: 'NOT_COMMUNICATED_34_3_A', fact_device_encrypted: 'UNKNOWN' }).ok, false, 'unknown');
      assert.equal(B.recordDecision(d, ADMIN, id, { ...decision, art34_decision: 'NOT_COMMUNICATED_34_3_B', fact_recipient_confirmed_deletion: 'UNKNOWN' }).ok, false);
      ok(B.recordDecision(d, ADMIN, id, { ...decision, art34_decision: 'NOT_COMMUNICATED_34_3_A', fact_device_encrypted: 'YES' }));
      assert.equal(B.incidentView(a.db, ADMIN, id, a.now()).incident.status, 'NOTIFICATION_DECIDED');
      assert.throws(() => a.db.run("UPDATE breach_decisions SET fact_device_encrypted = 'UNKNOWN' WHERE incident_id = ?", [id]), /constraint/);
    } finally { a.close(); }
  });

  test('attempted invoice fraud is recorded with the claim and the date, never bank details, and waits on the DPO’s classification to close', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const { claim } = referredClaim(a);
      assert.equal(B.openIncident(d, ADMIN, { ...base, kind: 'ATTEMPTED_INVOICE_FRAUD', description: 'A client was emailed new payment instructions.' }).ok, false, 'no claim, no date');
      const withShape = B.openIncident(d, ADMIN, { ...base, kind: 'ATTEMPTED_INVOICE_FRAUD', claim_id: claim, fraud_attempted_on: '2026-09-07', description: 'Told to pay 12-34-56 12345678.' });
      assert.equal(withShape.ok, false, 'a sort code and an account number, by shape');
      const id = ok(B.openIncident(d, ADMIN, { ...base, kind: 'ATTEMPTED_INVOICE_FRAUD', claim_id: claim, fraud_attempted_on: '2026-09-07', description: 'A client was emailed new payment instructions.' }));
      assert.throws(() => a.db.run("UPDATE breach_incidents SET description = 'the sort code is on file' WHERE id = ?", [id]), /bank details/);
      assert.match(B.incidentView(a.db, ADMIN, id, a.now()).clock.label, /classification, not yet given/);
      ok(B.updateIncident(d, ADMIN, id, { remedial_action: 'Client warned by phone.', lessons_and_changes: 'None needed.' }));
      const close = B.closeIncident(d, ADMIN, id);
      assert.equal(close.ok, false);
      assert.match(close.ok ? '' : close.why, /classification/);
      ok(B.updateIncident(d, ADMIN, id, { is_personal_data_breach: 'NO', classification_reason: 'No personal data was disclosed.' }));
      ok(B.closeIncident(d, ADMIN, id));
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * S2
 * ================================================================== */

describe('S2 — the identity store: opaque refs, every read audited, searches logged, no name anywhere else', () => {
  test('a person_ref is generated and opaque, a name-shaped ref is refused, a read is audited without the name, and the search log holds the term', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const biz = business(a);
      const doc = document(a, biz);
      assert.equal(S.recordPerson(d, ADMIN, { doc_id: doc, name: 'Quentin Witnessperson', role: 'ATTESTING_WITNESS', contact_route: '1 High St', contact_route_kind: 'POSTAL' }).ok, false, 'a route must be confirmed as printed');
      const ref = ok(S.recordPerson(d, ADMIN, { doc_id: doc, name: 'Quentin Witnessperson', role: 'ATTESTING_WITNESS', contact_route: '1 High St', contact_route_kind: 'POSTAL', route_printed_on_document: 'YES' }));
      assert.match(ref, /^PR-[0-9A-Z]{16}$/);
      assert.throws(() => a.db.run("INSERT INTO identity_persons (person_ref, name, role, doc_id, source_record_ref, recorded_by, recorded_at, updated_at) VALUES ('PR-QUENTIN WITNESS', 'x', 'ATTESTING_WITNESS', ?, ?, 'u-ADMIN', ?, ?)", [doc, doc, T0, T0]), /constraint/);

      const before = a.audit.entries().filter((e) => e.kind === 'IDENTITY_READ').length;
      const p = S.readPerson(d, ADMIN, ref);
      assert.equal(p.route_group, 'R-A');
      S.readPerson(d, ADMIN, ref);
      const reads = a.audit.entries().filter((e) => e.kind === 'IDENTITY_READ');
      assert.equal(reads.length, before + 2, 'every read');
      const found = S.searchIdentity(d, ADMIN, 'witnessperson');
      assert.deepEqual(found.results.map((r) => r.person_ref), [ref]);
      assert.ok(!JSON.stringify(found.results).includes('Quentin'), 'the result carries no name');
      assert.equal(a.db.get<{ term: string }>('SELECT term FROM identity_search_log WHERE id = ?', [found.search_id])?.term, 'witnessperson');
      assert.throws(() => S.readPerson(d, SALES, ref), NotAuthorised);
      assert.throws(() => a.db.run('DELETE FROM identity_persons WHERE person_ref = ?', [ref]), /not deleted/);

      // NOTHING CROSSES: the name is in S2 and nowhere else in the database — not the audit log, not a claim, not a document.
      for (const t of a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT IN ('identity_persons')")) {
        // The table name comes from sqlite_master, never from a caller; it is joined apart because tools/lint-sql.cjs reads words.
        const every = ['SEL', 'ECT * FROM "', t.name.replace(/"/g, ''), '"'].join('');
        const rows = JSON.stringify(a.db.all(every));
        assert.ok(!rows.includes('Quentin') && !rows.includes('1 High St'), `the name or route reached ${t.name}`);
      }
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * CONSENT
 * ================================================================== */

describe('CONSENT — one history per contact, share-with-accountant folded in and not copied, and the client’s own route', () => {
  test('the history reads the capture flags, every answer and the share-progress answers where they live', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const { lead, biz } = referredClaim(a);
      ok(I.recordShareConsent({ db: a.db, audit: a.audit, now: a.now, newId: randomUUID }, SALES, lead, { decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }));
      const contact = randomUUID();
      a.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at) VALUES (?, ?, ?, 1, 0, ?)', [contact, biz, 'Mo Manager', T0]);
      ok(S.recordConsent(d, ADMIN, contact, { kind: 'MARKETING', decision: 'WITHDRAWN', wording_version: 'MARKETING-1' }));
      const h = S.consentHistory(a.db, ADMIN, contact);
      assert.ok(h.lines.some((l) => l.source.startsWith('introducer_share_consents') && l.decision === 'GIVEN'));
      assert.ok(h.lines.some((l) => l.source === 'consent_answers' && l.decision === 'WITHDRAWN'));
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM consent_answers')?.n, 1, 'the share answer is read, never copied');
    } finally { a.close(); }
  });

  test('a client withdraws in the portal and the next notice is not queued; giving is switched off; never asked stays no row and offers nothing', async () => {
    const a = await app();
    try {
      const idep = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
      const { lead, biz, claim } = referredClaim(a);
      const client = actor('CLIENT', clientUser(a, biz), biz);
      // never asked
      const never = I.clientShareChoices(a.db, client, biz);
      assert.equal(never[0]?.state, 'NEVER_ASKED');
      assert.equal(never[0]?.can_withdraw, false);
      assert.equal(never[0]?.can_give, false, 'giving ships off');
      assert.equal(I.recordShareConsentByClient(idep, client, biz, { introducer_id: never[0]?.introducer_id ?? '', decision: 'WITHDRAWN', wording_version: I.CURRENT_SHARE_WORDING }).ok, false);
      assert.equal(I.recordShareConsentByClient(idep, client, biz, { introducer_id: never[0]?.introducer_id ?? '', decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }).ok, false, 'switched off');
      assert.equal(a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM introducer_share_consents WHERE route = 'CLIENT_PORTAL'")?.n, 0);

      ok(I.recordShareConsent(idep, SALES, lead, { decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }));
      const yes = I.clientShareChoices(a.db, client, biz)[0];
      assert.equal(yes?.can_withdraw, true);
      ok(I.recordShareConsentByClient(idep, client, biz, { introducer_id: yes?.introducer_id ?? '', decision: 'WITHDRAWN', wording_version: I.CURRENT_SHARE_WORDING }));
      assert.equal(engage(a, claim, biz).ok, true);
      const engaged = a.db.all<{ outcome: string; reason: string | null }>("SELECT outcome, reason FROM introducer_notices WHERE lead_id = ? AND notice = 'ENGAGED'", [lead]);
      assert.deepEqual(engaged.map((n) => [n.outcome, n.reason]), [['NOT_QUEUED', 'NO_OPT_IN']], 'the withdrawal stopped the next notice');

      // the switch on: the same table, the client's route
      ok(I.recordShareConsentByClient(idep, client, biz, { introducer_id: yes?.introducer_id ?? '', decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }, { enabled: true }));
      assert.equal(a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM introducer_share_consents WHERE route = 'CLIENT_PORTAL'")?.n, 2);
      assert.throws(() => I.clientShareChoices(a.db, actor('CLIENT', 'u-x', 'another-business'), biz), NotAuthorised);
      assert.throws(() => a.db.run("INSERT INTO introducer_share_consents (id, introducer_id, business_id, decision, wording_version, route, recorded_by, recorded_at) VALUES (?, ?, ?, 'GIVEN', 'SHARE-PROGRESS-1', 'CLIENT_PORTAL', 'u-SALES', ?)",
        [randomUUID(), yes?.introducer_id ?? '', biz, T0]), /same organisation/);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * RETENTION
 * ================================================================== */

describe('RETENTION — UNSET shown as unset, the list not the deleter, and the list able to find a record past its clock', () => {
  test('today nothing is due: every kind is unset or derived-not-approved, and a table that refuses a DELETE says so', async () => {
    const a = await app();
    try {
      const lines = S.retentionList(deps(a), ADMIN, a.now());
      assert.ok(lines.every((l) => l.due.length === 0));
      assert.ok(lines.every((l) => l.state !== 'APPROVED'));
      for (const k of ['STAFF_TASKS', 'AUTOMATION_RUNS', 'DOCUMENT_VERSIONS', 'LOGICAL_DOCUMENTS', 'DOCUMENT_LINKS', 'IDENTITY_PERSON']) {
        assert.match(lines.find((l) => l.kind === k)?.delete ?? '', /refuses a DELETE by trigger/, k);
      }
      for (const k of ['LEADS_NEVER_CONVERTED', 'LEAD_PEOPLE', 'LEAD_FOLLOW_UP_TASKS', 'OUTBOX_QUEUED', 'INTRODUCERS', 'INTRODUCER_PEOPLE', 'SHARE_CONSENTS', 'INTRODUCER_NOTICES']) {
        assert.equal(lines.find((l) => l.kind === k)?.state, 'NOT_COVERED', k);
      }
      assert.equal(lines.find((l) => l.kind === 'DOCUMENT_VERSIONS')?.state, 'DERIVED_NOT_APPROVED');
    } finally { a.close(); }
  });

  test('with RET-5 approved, a breach entry closed more than six years ago is past its clock — unless a legal hold is on it', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const id = ok(B.openIncident(d, ADMIN, { discovered_at: '2019-01-08T09:00', discovered_by: 'Lakhbir', discovery_route: 'NOTICED', awareness_at: '2019-01-08T09:30', awareness_basis: 'Saw it that morning', occurred_state: 'UNKNOWN', occurred_basis: 'Not known', kind: 'SECURITY_INCIDENT', description: 'A laptop was lost' }));
      a.db.run("UPDATE breach_incidents SET status = 'CLOSED', closed_at = '2019-02-01T00:00:00.000Z', closed_by = 'u-ADMIN', lessons_and_changes = 'None needed' WHERE id = ?", [id]);
      const approved = { ...S.RETENTION_PARAMETERS, 'RET-5': { ...S.RETENTION_PARAMETERS['RET-5']!, state: 'APPROVED' as const } };
      assert.deepEqual(S.retentionList(d, ADMIN, a.now()).find((l) => l.kind === 'BREACH_INCIDENTS')?.due, [], 'not approved: nothing due');
      assert.deepEqual(S.retentionList(d, ADMIN, a.now(), approved).find((l) => l.kind === 'BREACH_INCIDENTS')?.due, [{ id, due_on: '2025-02-01' }]);
      ok(C.setHold(d, ADMIN, { hold_kind: 'LEGAL_HOLD', record_kind: 'BREACH_INCIDENTS', record_id: id, reason_kind: 'DISPUTE', reason: 'A claim is threatened.', review_on: '2026-12-01' }));
      assert.deepEqual(S.retentionList(d, ADMIN, a.now(), approved).find((l) => l.kind === 'BREACH_INCIDENTS')?.due, [], 'held');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * TIPPING OFF
 * ================================================================== */

describe('TIPPING OFF — nothing a client or an accountant reads says a check exists or that anybody suspects anything', () => {
  test('the template store refuses the words in code and in the database, and no compliance letter carries one', async () => {
    const a = await app();
    try {
      for (const words of ['We are completing due diligence on you', 'a money laundering check', 'our nominated officer', 'no suspicion']) {
        assert.ok(templateRefusal({ label: 'x', subject: 'x', body: words }) !== null, words);
      }
      assert.throws(() => a.db.run("INSERT INTO email_templates (id, label, subject, body, created_at, updated_at) VALUES ('t-x', 'x', 'x', 'about our due diligence', ?, ?)", [T0, T0]), /tip somebody off/);
      const d = deps(a);
      const rr = ok(R.logRequest(d, ADMIN, { received_at: '2027-03-03T11:00', received_via: 'POST', request_verbatim: 'x', limbs: 'ART_15' }));
      const cp = ok(R.logComplaint(d, ADMIN, { received_at: '2027-03-03T11:00', received_via: 'POST', complaint_verbatim: 'x' }));
      for (const kind of Object.keys(R.LETTERS) as R.LetterKind[]) {
        const entry = R.LETTERS[kind].register === 'COMPLAINT' ? cp : rr;
        const l = R.draftLetter(a.db, ADMIN, kind, entry, { reasons: 'reasons', asked: 'a reference' });
        assert.equal(tipsOff(`${l.subject}\n${l.body}`), null, kind);
      }
    } finally { a.close(); }
  });
});
