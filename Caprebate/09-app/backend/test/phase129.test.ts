/**
 * PHASE 129 — FOUR THINGS BUILT BEFORE THE PERSON THEY WAIT ON HAS ANSWERED, EACH SWITCHED OFF. 12 September 2026.
 *
 * WHAT EACH BLOCK PROVES, BOTH WAYS:
 *   the conveyancing strip        OFF is today's capture byte for byte; ON keeps a company's name and number and strips
 *                                 every individual; a legal form not known and one never recorded read identically (N4)
 *   the per-disclosure log        OFF writes nothing and reads NOT KEPT, never "none" (N4); ON records when, to whom,
 *                                 which data, the lawful basis and by whom, in the recipients document's own words
 *   the data protection officer   OFF is not assignable and refused every action; ON holds the compliance registers
 *   role                          and nothing else
 *   the recommended receipt       recorded for all fourteen types with a reason, identical in code and migration 021;
 *   strips                        recommended OR approved, NO_RECEIPT_POLICY still refuses every one of them
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { APP_ROLES, DPO_ROLE, isAppRole } from '../src/roles.ts';
import { can, canAsDpo, DPO_ROLE_SWITCH, DPO_SCOPE, NotAuthorised, REGISTERED_ACTIONS, type Actor, type Obj } from '../src/authz.ts';
import { assignRole } from '../src/web/settings.ts';
import * as CS from '../src/web/conveyancing-strip.ts';
import * as DL from '../src/web/disclosure-log.ts';
import * as RR from '../src/web/receipt-recommendations.ts';
import * as D from '../src/web/documents.ts';
import { assertHumanCaptureClean, ROLE_TOKENS } from '../src/web/upload-handler-port.ts';
import type { FsObjectStore } from '../src/web/objectstore.ts';
import { actor, scalars, testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-09-08T00:00:00.000Z';
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');
const COMPLIANCE: Obj = { type: 'compliance', id: '__compliance_section__' };

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

function count(a: App, sql: string, params: readonly string[] = []): number {
  return a.db.get<{ n: number }>(sql, [...params])?.n ?? -1;
}

/* ================================================================== *
 * LINE 7 — COMPANY NAMES KEPT, INDIVIDUALS STRIPPED, ON CONVEYANCING UPLOADS
 * ================================================================== */

/** The question's own worked example, and the people every sale contract names. */
const CONTRACT_PARTIES: readonly CS.PartyOnDocument[] = [
  { role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'BODY_CORPORATE', name: 'Fairview Dental Care Ltd', company_number: '12345678' },
  { role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'NATURAL_PERSON', name: 'Dr A Patel' },
  { role: 'ATTESTING_WITNESS', form: 'NATURAL_PERSON', name: 'Jane Smith' },
  { role: 'PROFESSIONAL_CERTIFIER', form: 'NATURAL_PERSON', name: 'Tom Brown' },
  { role: 'TRANSACTION_PARTY', side: 'BUYER', form: 'LLP', name: 'Harbour Care LLP', company_number: 'oc 123456' },
];

describe('line 7 — the conveyancing strip: company names kept, individuals stripped — built, and switched off', () => {
  test('THE CONVEYANCING STRIP SHIPS OFF: the parties of a conveyancing upload are exactly today’s — every one a role token, no name and no number — byte for byte, and the question it waits on is named by its title', () => {
    assert.equal(CS.CONVEYANCING_STRIP.enabled, false);
    assert.equal(CS.CONVEYANCING_STRIP_QUESTION, 'May company names stay on conveyancing uploads if we strip the individuals?');
    for (const doc of ['SALE_CONTRACT', 'CPSE_REPLIES']) {
      const shipped = CS.captureParties(doc, CONTRACT_PARTIES);
      const off = CS.captureParties(doc, CONTRACT_PARTIES, { ...CS.CONVEYANCING_STRIP, enabled: false });
      const today = { ok: true, parties: CS.todaysCapture(CONTRACT_PARTIES) };
      assert.equal(JSON.stringify(shipped), JSON.stringify(today), `${doc}: the shipped switch is not today’s capture`);
      assert.equal(JSON.stringify(off), JSON.stringify(today), `${doc}: off is not today’s capture`);
      assert.ok(shipped.ok);
      assert.deepEqual(shipped.parties.map((p) => p.role_token), ['[SELLER]', '[SELLER]', '[WITNESS]', '[FEE EARNER]', '[BUYER]']);
      for (const p of shipped.parties) {
        assert.equal(p.company, null);
        assert.equal(p.company_number, null);
        assert.doesNotThrow(() => assertHumanCaptureClean({ field_id: 'party_role_token', value: p.role_token, names_replaced_with_role_tokens: true, substitutions: 1 }));
      }
      const out = [...scalars(shipped)].map(String).join(' | ');
      for (const p of CONTRACT_PARTIES) {
        assert.equal(out.includes(p.name), false, `${p.name} was written onward while the switch is off`);
        if (p.company_number !== undefined && p.company_number !== null) assert.equal(out.includes(p.company_number), false);
      }
    }
    const lease = CS.captureParties('LEASE', CONTRACT_PARTIES);
    assert.equal(lease.ok, false);
    assert.deepEqual(CS.captureParties('LEASE', CONTRACT_PARTIES, { ...CS.CONVEYANCING_STRIP, enabled: true }), lease, 'any other type is refused alike, on and off');
    assert.equal(CS.TOKENS_USED.length, 9, 'every role token the strip can produce is one the ingestion module declares');
    for (const t of CS.TOKENS_USED) assert.ok(ROLE_TOKENS.includes(t));
  });

  test('THE CONVEYANCING STRIP SWITCHED ON: a company or LLP party to the transaction keeps its name and registered number; an individual, a sole trader, a partnership, a witness and a fee earner are stripped; a legal form not known and one never recorded read identically and neither keeps a name (N4)', () => {
    const on: CS.ConveyancingStrip = { ...CS.CONVEYANCING_STRIP, enabled: true };
    const r = CS.captureParties('SALE_CONTRACT', CONTRACT_PARTIES, on);
    assert.ok(r.ok);
    const [company, individual, witness, feeEarner, llp] = r.parties;
    assert.equal(company?.company, 'Fairview Dental Care Ltd');
    assert.equal(company?.company_number, '12345678');
    assert.equal(company?.role_token, '[SELLER]');
    assert.equal(llp?.company, 'Harbour Care LLP');
    assert.equal(llp?.company_number, 'OC123456', 'a registered number in Companies House’s shape is kept, normalised');
    for (const p of [individual, witness, feeEarner]) {
      assert.equal(p?.company, null);
      assert.equal(p?.company_number, null);
    }
    const out = [...scalars(r)].map(String).join(' | ');
    for (const name of ['Dr A Patel', 'Jane Smith', 'Tom Brown']) assert.equal(out.includes(name), false, `${name} was kept`);

    const one = (p: CS.PartyOnDocument) => {
      const x = CS.captureParties('CPSE_REPLIES', [p], on);
      assert.ok(x.ok);
      const first = x.parties[0];
      assert.ok(first !== undefined);
      return first;
    };
    assert.equal(one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'SOLE_TRADER', name: 'Fairview Dental Care' }).company, null, 'a sole trader’s trading name is the person’s');
    assert.equal(one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'PARTNERSHIP_ENGLAND_WALES_NI', name: 'Riverside Medical Partnership' }).company, null);
    assert.equal(one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'PARTNERSHIP_SCOTLAND', name: 'Glen Practice' }).company, null, 'the switch keeps company names, and a Scottish firm is not a company');
    assert.equal(one({ role: 'INDIVIDUAL_SIGNATORY', form: 'BODY_CORPORATE', name: 'Fairview Dental Care Ltd' }).company, null, 'only a party to the transaction keeps a name');
    assert.equal(one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'BODY_CORPORATE', name: 'Dr Patel Holdings Ltd' }).company, null, 'a company name that reads as a person’s is stripped by the backstop');
    const badNumber = one({ role: 'TRANSACTION_PARTY', side: 'BUYER', form: 'BODY_CORPORATE', name: 'Meadow Dental Limited', company_number: 'ABC' });
    assert.equal(badNumber.company, 'Meadow Dental Limited');
    assert.equal(badNumber.company_number, null);
    assert.match(badNumber.why, /not in Companies House’s shape/);

    // N4 — assert both: a legal form never recorded and one recorded as not known.
    const absent = one({ role: 'TRANSACTION_PARTY', side: 'SELLER', name: 'Unclear Holdings Ltd', company_number: '87654321' });
    const unknown = one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: 'UNKNOWN', name: 'Unclear Holdings Ltd', company_number: '87654321' });
    const nulled = one({ role: 'TRANSACTION_PARTY', side: 'SELLER', form: null, name: 'Unclear Holdings Ltd', company_number: '87654321' });
    assert.deepEqual(absent, unknown);
    assert.deepEqual(nulled, unknown);
    assert.equal(unknown.company, null);
    assert.equal(unknown.company_number, null);
    assert.match(unknown.why, /not known/);
  });
});

/* ================================================================== *
 * LINE 9 — THE PER-DISCLOSURE LOG
 * ================================================================== */

function disclosureDeps(a: App): DL.DisclosureDeps {
  return { db: a.db, audit: a.audit, now: a.now, newId: randomUUID };
}

const ON: DL.DisclosureLogSwitch = { enabled: true, in_force_from: '2026-09-12', waits_on: 'a test' };

function toTaxAdviser(biz: string): Record<string, string> {
  return {
    business_id: biz, recipient: 'R2_TAX_ADVISER', data_categories: 'CLAIM_COMPUTATION, UPLOADED_DOCUMENTS', occasion: 'REVIEW_OR_SIGNOFF',
    route: 'EMAIL', lawful_basis: 'CONTRACT', disclosed_at: '2026-09-08T09:00:00.000Z',
  };
}

describe('line 9 — the per-disclosure log — built, and switched off', () => {
  test('THE DISCLOSURE LOG SHIPS OFF: recording is refused with nothing written and no audit line, and the reading says NOT KEPT — never none — whatever the table holds (N4)', async () => {
    const a = await app();
    try {
      assert.equal(DL.DISCLOSURE_LOG.enabled, false);
      assert.equal(DL.DISCLOSURE_LOG.in_force_from, null);
      const biz = business(a);
      const refused = DL.recordDisclosure(disclosureDeps(a), SALES, toTaxAdviser(biz));
      assert.deepEqual(refused, { ok: false, why: DL.DISCLOSURE_LOG_OFF });
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM disclosure_log'), 0, 'a row was written while the log is off');
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'DISCLOSURE_RECORDED'"), 0);

      const empty = DL.disclosuresFor(a.db, ADMIN, biz);
      assert.equal(empty.state, 'NOT_KEPT');
      assert.equal(empty.label, DL.NOT_KEPT_LABEL);
      assert.match(empty.label, /not “none”/);
      // A row put there by hand is still not read while the log is off.
      a.db.run('INSERT INTO disclosure_log (id,business_id,recipient,data_categories,occasion,route,lawful_basis,disclosed_at,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), biz, 'R2_TAX_ADVISER', '["CLAIM_COMPUTATION"]', 'REVIEW_OR_SIGNOFF', 'EMAIL', 'CONTRACT', T0, 'u-SALES', T0]);
      assert.deepEqual(DL.disclosuresFor(a.db, ADMIN, biz), empty, 'off reads the same with a row in the table as with none');
      // N4 — switched on with no in-force date reads exactly as off, and records nothing.
      const noDate: DL.DisclosureLogSwitch = { ...ON, in_force_from: null };
      assert.deepEqual(DL.disclosuresFor(a.db, ADMIN, biz, noDate), empty);
      assert.equal(DL.recordDisclosure(disclosureDeps(a), SALES, toTaxAdviser(biz), noDate).ok, false);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM disclosure_log'), 1);
    } finally { a.close(); }
  });

  test('THE DISCLOSURE LOG SWITCHED ON: a disclosure is recorded with when, to whom, which data, the lawful basis and by whom, in the recipients document’s own words; a source is refused as not a recipient; a processor carries only its Article 28 instruction; nothing is changed or deleted', async () => {
    const a = await app();
    try {
      const biz = business(a);
      const other = business(a, 'Elsewhere Care Limited');
      const d = disclosureDeps(a);
      const before = DL.disclosuresFor(a.db, ADMIN, biz, ON);
      assert.equal(before.state, 'KEPT');
      assert.deepEqual(before.rows, []);
      assert.match(before.label, /since the log came into force on 2026-09-12/);
      assert.match(before.label, /not “none”/, 'an empty log is never read as nobody having received the data');

      const first = DL.recordDisclosure(d, SALES, toTaxAdviser(biz), ON);
      assert.ok(first.ok, JSON.stringify(first));
      const held = DL.disclosuresFor(a.db, ADMIN, biz, ON);
      assert.equal(held.rows.length, 1);
      const row = held.rows[0];
      assert.equal(row?.recipient.label, 'R2 — Chartered tax adviser (CTA)');
      assert.deepEqual(row?.categories, ['The claim computation and the entitlement chain', 'Uploaded documents relevant to the work']);
      assert.equal(row?.occasion, 'On review or sign-off');
      assert.equal(row?.route, 'Email');
      assert.match(row?.basis ?? '', /^Contract/);
      assert.equal(row?.recorded_by, 'SALES Person');
      assert.deepEqual(DL.disclosuresFor(a.db, ADMIN, other, ON).rows, [], 'one client’s disclosures are not another’s');

      const line = a.db.get<{ detail: string; actor_id: string }>("SELECT detail, actor_id FROM audit_log WHERE kind = 'DISCLOSURE_RECORDED'");
      assert.equal(line?.actor_id, 'u-SALES');
      const detail = JSON.parse(line?.detail ?? '{}') as Record<string, unknown>;
      assert.equal(detail['recipient'], 'R2_TAX_ADVISER');
      assert.equal(detail['categories'], 2);
      assert.equal(/Person|Meadow/.test(line?.detail ?? ''), false, 'the audit line carries a name');

      const refusal = (input: Record<string, string>) => {
        const r = DL.recordDisclosure(d, ADMIN, input, ON);
        assert.equal(r.ok, false, JSON.stringify(input));
        return r.ok ? '' : r.why;
      };
      assert.equal(refusal({ ...toTaxAdviser(biz), recipient: 'R5_COMPANIES_HOUSE' }), DL.SOURCE_NOT_RECIPIENT);
      assert.equal(refusal({ ...toTaxAdviser(biz), recipient: 'R5' }), DL.SOURCE_NOT_RECIPIENT);
      assert.match(refusal({ ...toTaxAdviser(biz), recipient: 'P1_MICROSOFT', occasion: 'PROCESSOR_HOLDING', route: 'PROCESSOR_SYSTEM' }), /Article 28/);
      assert.match(refusal({ ...toTaxAdviser(biz), recipient: 'R3_CLIENT_ACCOUNTANT', occasion: 'CLIENT_INSTRUCTION', lawful_basis: 'PROCESSOR_ON_INSTRUCTION' }), /lawful basis of its own/);
      assert.match(refusal({ ...toTaxAdviser(biz), recipient: 'R4_HMRC', occasion: 'FILING', route: 'EMAIL' }), /via the client or their agent/);
      assert.match(refusal({ ...toTaxAdviser(biz), data_categories: 'BANK_DETAILS' }), /not a category/);
      assert.match(refusal({ ...toTaxAdviser(biz), data_categories: '' }), /at least one category/);
      assert.match(refusal({ ...toTaxAdviser(biz), disclosed_at: '2027-01-01T00:00:00.000Z' }), /never ahead of it/);
      assert.match(refusal({ ...toTaxAdviser(biz), disclosed_at: 'last Tuesday' }), /moment in time/);
      assert.match(refusal({ ...toTaxAdviser(biz), recipient_user_id: 'u-SALES' }), /surveyor/);
      assert.match(refusal({ ...toTaxAdviser(other), corrects_id: first.ok ? first.id : '' }), /same organisation/);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM disclosure_log'), 1, 'a refusal wrote a row');

      const processor = DL.recordDisclosure(d, ADMIN, {
        business_id: biz, recipient: 'P1_MICROSOFT', data_categories: 'UPLOADED_DOCUMENTS', occasion: 'PROCESSOR_HOLDING',
        route: 'PROCESSOR_SYSTEM', lawful_basis: 'PROCESSOR_ON_INSTRUCTION', disclosed_at: '2026-09-08T10:00:00.000Z',
      }, ON);
      assert.ok(processor.ok);
      const correction = DL.recordDisclosure(d, ADMIN, { ...toTaxAdviser(biz), data_categories: 'CLAIM_COMPUTATION', corrects_id: first.ok ? first.id : '' }, ON);
      assert.ok(correction.ok);
      const after = DL.disclosuresFor(a.db, ADMIN, biz, ON);
      assert.equal(after.rows.length, 3);
      assert.match(after.label, /^3 disclosures/);

      assert.throws(() => a.db.run("UPDATE disclosure_log SET lawful_basis = 'CONSENT'"), /never changed/);
      assert.throws(() => a.db.run('DELETE FROM disclosure_log'), /never deleted/);
      assert.throws(() => a.db.run('INSERT INTO disclosure_log (id,business_id,recipient,data_categories,occasion,route,lawful_basis,disclosed_at,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), biz, 'R5_COMPANIES_HOUSE', '["CONTACT_DETAILS"]', 'FILING', 'EMAIL', 'CONTRACT', T0, 'u-ADMIN', T0]), /CHECK/i, 'the table refuses a source');
      assert.throws(() => a.db.run('INSERT INTO disclosure_log (id,business_id,recipient,data_categories,occasion,route,lawful_basis,disclosed_at,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), biz, 'P2_MONDAY', '["CONTACT_DETAILS"]', 'PROCESSOR_HOLDING', 'PROCESSOR_SYSTEM', 'CONTRACT', T0, 'u-ADMIN', T0]), /CHECK/i, 'the table refuses a processor with a basis of its own');
    } finally { a.close(); }
  });

  test('disclosure.read and disclosure.record: registered, deny by default, refused for every role not granted them and for a disabled user — and the stores refuse what the table refuses', async () => {
    for (const action of ['disclosure.read', 'disclosure.record']) assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
    for (const role of APP_ROLES) {
      const who = actor(role, `u-${role}`, role === 'CLIENT' ? 'b-1' : null);
      assert.equal(can(who, 'disclosure.read', COMPLIANCE), role === 'ADMIN', `${role} on disclosure.read`);
      assert.equal(can(who, 'disclosure.record', COMPLIANCE), role === 'ADMIN' || role === 'SALES', `${role} on disclosure.record`);
    }
    assert.equal(can({ ...ADMIN, disabled: true }, 'disclosure.read', COMPLIANCE), false);
    const a = await app();
    try {
      const biz = business(a);
      for (const role of ['ACCOUNTING', 'SURVEYING', 'CLIENT'] as const) {
        assert.throws(() => DL.recordDisclosure(disclosureDeps(a), actor(role, `u-${role}`, biz), toTaxAdviser(biz), ON), NotAuthorised);
      }
      for (const role of ['SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT'] as const) {
        assert.throws(() => DL.disclosuresFor(a.db, actor(role, `u-${role}`, biz), biz, ON), NotAuthorised);
      }
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM disclosure_log'), 0);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * LINE 10 — A DATA PROTECTION OFFICER ROLE
 * ================================================================== */

const DPO = { id: 'u-dpo', role: DPO_ROLE, business_id: null, disabled: false } as const;
const DPO_AS_ACTOR = DPO as unknown as Actor;

function objectFor(action: string, userId: string): Obj {
  return action.startsWith('user.') ? { type: 'user', id: userId, role: 'ADMIN' } : COMPLIANCE;
}

describe('line 10 — a data protection officer role — defined, scoped to the compliance registers, and switched off', () => {
  test('THE DPO ROLE SHIPS OFF: not one of the five and not assignable — refused by assignRole and by the roles table — and can() refuses a DPO actor every registered action, as before it existed', async () => {
    assert.equal(DPO_ROLE_SWITCH.enabled, false);
    assert.equal(DPO_ROLE_SWITCH.question, 'Do we need a compliance role separate from Admin?');
    assert.deepEqual([...APP_ROLES], ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT', 'READ_ONLY'], 'the role model is the five plus Phase 132e’s view-only role, and no DPO');
    assert.equal(isAppRole(DPO_ROLE), false);
    for (const action of REGISTERED_ACTIONS) {
      assert.equal(can(DPO_AS_ACTOR, action, objectFor(action, DPO.id)), false, `a DPO was allowed ${action} with the role switched off`);
      assert.equal(canAsDpo(DPO, action, objectFor(action, DPO.id)), false);
    }
    assert.equal(canAsDpo(ADMIN, 'compliance.read', COMPLIANCE, { ...DPO_ROLE_SWITCH, enabled: true }), false, 'the DPO table decides nothing for the five roles');
    const a = await app();
    try {
      assert.throws(() => assignRole(a.deps, ADMIN, 'u-SALES', DPO_ROLE), (e: unknown) => (e as { code?: string }).code === 'E_BAD_ROLE');
      assert.equal(a.db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', ['u-SALES'])?.role, 'SALES');
      assert.throws(() => a.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-dpo', 'dpo@example.invalid', 'dpo@example.invalid', 'Officer', DPO_ROLE, 'fake$x', T0, T0]), /FOREIGN KEY/i, 'the roles table holds no DPO row');
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ROLE_ASSIGNED'"), 0);
    } finally { a.close(); }
  });

  test('THE DPO ROLE SWITCHED ON: it holds the compliance registers, S2, the disclosure log’s reading, the back office’s door and its own account, and is refused every other registered action — the audit log, users and roles, settings, claims, documents and money among them; a disabled DPO holds nothing', () => {
    const on = { ...DPO_ROLE_SWITCH, enabled: true };
    // Phase 153c: compliance.breach_names — the restricted list of names a breach entry may need (Word question 181).
    assert.deepEqual([...DPO_SCOPE].sort(), ['backoffice.enter', 'compliance.breach_names', 'compliance.identity_read', 'compliance.identity_write', 'compliance.read', 'compliance.write',
      'disclosure.read', 'document.read_original', 'user.change_own_password', 'user.change_own_profile', 'user.read_self']);
    for (const action of DPO_SCOPE) assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not a registered action`);
    for (const action of REGISTERED_ACTIONS) {
      assert.equal(canAsDpo(DPO, action, objectFor(action, DPO.id), on), DPO_SCOPE.includes(action), `a DPO on ${action}`);
    }
    for (const action of ['audit.read', 'user.create', 'user.assign_role', 'user.list', 'configuration.write', 'dashboard.enter', 'claim.read',
      'document.read', 'invoice.read', 'disclosure.record', 'share_consent.client_record']) {
      assert.equal(canAsDpo(DPO, action, objectFor(action, DPO.id), on), false, `a DPO was allowed ${action}`);
    }
    assert.equal(canAsDpo(DPO, 'user.read_self', { type: 'user', id: 'u-ADMIN', role: 'ADMIN' }, on), false, 'a DPO reads its own account, not somebody else’s');
    assert.equal(canAsDpo(DPO, 'route.nobody.registered', COMPLIANCE, on), false, 'deny by default');
    for (const action of DPO_SCOPE) assert.equal(canAsDpo({ ...DPO, disabled: true }, action, objectFor(action, DPO.id), on), false);
    assert.equal(can(DPO_AS_ACTOR, 'compliance.read', COMPLIANCE), false, 'can() reads the shipped switch, which is off');
  });
});

/* ================================================================== *
 * LINE 13 — A RECOMMENDED RECEIPT STRIP FOR EACH NEW DOCUMENT TYPE
 * ================================================================== */

const FOURTEEN = ['ACCOUNTS', 'CA_REPORT', 'CLAIM_DOCUMENTATION', 'COMPLETION_STATEMENT', 'CONTRACTOR_INVOICE', 'CORRESPONDENCE', 'ENGAGEMENT_LETTER',
  'INVOICE', 'OTHER', 'PLANS', 'SURVEY_PHOTOS', 'SURVEY_REPORT', 'TAX_COMPUTATION', 'VALUATION'];

/** Phase 151b: the fourteen less the tax computation, which has its own receipt policy now (Word question 223). */
/** Phase 157d: and the four the Friary House run found nothing could receive (F16), bound by migration 099. */
const NOW_BOUND = ['TAX_COMPUTATION', 'COMPLETION_STATEMENT', 'ACCOUNTS', 'CONTRACTOR_INVOICE', 'PLANS'];
const STILL_UNBOUND = FOURTEEN.filter((c) => !NOW_BOUND.includes(c));

describe('line 13 — a recommended receipt strip per new document type — recorded, not approved, binding nothing', () => {
  test('RECEIPT STRIP RECOMMENDATIONS: one for each of the fourteen types with no receipt policy, each with its reason, identical in the module and in migration 021 — recorded, not approved', async () => {
    assert.equal(RR.RECEIPT_RECOMMENDATIONS.approved, false);
    assert.equal(RR.RECEIPT_STRIP_QUESTION, 'Which receipt strip should each new document type carry before anyone may upload one?');
    const a = await app();
    try {
      const unbound = a.db.all<{ code: string }>("SELECT code FROM document_types WHERE handler_type IS NULL AND source = 'CRM_SPECIFICATION' ORDER BY code").map((x) => x.code);
      // Phase 151b: the tax computation has its own receipt policy now (Word question 223); its recommendation stays as the record.
      assert.deepEqual(unbound, STILL_UNBOUND);
      assert.deepEqual(RR.RECEIPT_RECOMMENDATIONS.types.map((t) => t.type_code).sort(), FOURTEEN);
      const by = (s: RR.RecommendedStrip) => RR.RECEIPT_RECOMMENDATIONS.types.filter((t) => t.strip === s).map((t) => t.type_code).sort();
      assert.deepEqual(by('KEEP_WHOLE'), ['CA_REPORT', 'CLAIM_DOCUMENTATION', 'ENGAGEMENT_LETTER', 'INVOICE', 'SURVEY_REPORT']);
      assert.deepEqual(by('STRIP_INDIVIDUALS_KEEP_FIGURES'), ['ACCOUNTS', 'COMPLETION_STATEMENT', 'CONTRACTOR_INVOICE', 'PLANS', 'TAX_COMPUTATION', 'VALUATION']);
      assert.deepEqual(by('REFUSE_AS_UPLOAD'), ['CORRESPONDENCE', 'OTHER', 'SURVEY_PHOTOS']);
      const bound = a.db.all<{ handler_type: string }>('SELECT handler_type FROM document_types WHERE handler_type IS NOT NULL').map((x) => x.handler_type);
      for (const t of RR.RECEIPT_RECOMMENDATIONS.types) {
        assert.ok(t.reason.length >= 20 && t.reason.length <= 400, `${t.type_code} has no usable reason`);
        assert.equal(t.modelled_on !== null, t.strip === 'STRIP_INDIVIDUALS_KEEP_FIGURES', `${t.type_code}: modelled on a policy exactly when it strips`);
        if (t.modelled_on !== null) assert.ok(bound.includes(t.modelled_on), `${t.type_code} is modelled on ${t.modelled_on}, which is not an existing policy`);
      }
      const table = a.db.all<{ type_code: string; strip: string; modelled_on: string | null; reason: string }>(
        'SELECT type_code, strip, modelled_on, reason FROM receipt_strip_recommendations ORDER BY type_code');
      const module = [...RR.RECEIPT_RECOMMENDATIONS.types].sort((x, y) => x.type_code.localeCompare(y.type_code))
        .map((t) => ({ type_code: t.type_code, strip: t.strip, modelled_on: t.modelled_on, reason: t.reason }));
      assert.deepEqual(table.map((x) => ({ ...x })), module, 'migration 021 and the module disagree');
      assert.throws(() => a.db.run("UPDATE receipt_strip_recommendations SET strip = 'KEEP_WHOLE'"), /not edited in place/);
      assert.throws(() => a.db.run('DELETE FROM receipt_strip_recommendations'), /never deleted/);
      assert.throws(() => a.db.run("INSERT INTO receipt_strip_recommendations (type_code, strip, modelled_on, reason, drafted_on) VALUES ('LEASE','KEEP_WHOLE',NULL,'a bound type needs no recommendation at all','2026-09-12')"),
        /already has its policy/);
    } finally { a.close(); }
  });

  test('NO_RECEIPT_POLICY IS UNCHANGED BOTH WAYS: recommended or approved, all fourteen still read no receipt policy, are refused an upload before a link is issued, and are refused a request', async () => {
    const a = await app();
    try {
      const biz = business(a);
      const d: D.DocDeps & { store: FsObjectStore } = { db: a.db, audit: a.audit, now: a.now, newId: randomUUID, store: {} as unknown as FsObjectStore };
      const approved: RR.ReceiptRecommendations = { ...RR.RECEIPT_RECOMMENDATIONS, approved: true };
      for (const rec of [RR.RECEIPT_RECOMMENDATIONS, approved]) {
        // Phase 151b: the tax computation is bound now and reads BOUND — asserted just below.
        assert.equal(RR.recommendationReading(a.db, SALES, 'TAX_COMPUTATION', rec).state, 'BOUND');
        for (const code of STILL_UNBOUND) {
          const reading = RR.recommendationReading(a.db, SALES, code, rec);
          assert.equal(reading.strip_now.receivable, false, `${code} became receivable`);
          assert.equal(reading.strip_now.label, D.NO_RECEIPT_POLICY);
          assert.ok(reading.label.includes(D.NO_RECEIPT_POLICY), `${code}: the reading does not say it still cannot be received`);
          assert.equal(reading.state, rec.approved ? 'APPROVED_NOT_BOUND' : 'RECOMMENDED_NOT_APPROVED');
          assert.ok(reading.recommended !== null);
        }
      }
      const types = D.typeList(a.db, SALES);
      for (const code of STILL_UNBOUND) assert.equal(types.find((t) => t.code === code)?.strip.label, D.NO_RECEIPT_POLICY);
      assert.deepEqual(D.receivableTypes(a.db).map((t) => t.code).filter((c) => STILL_UNBOUND.includes(c)), []);
      const docs = count(a, 'SELECT COUNT(*) AS n FROM documents');
      for (const code of STILL_UNBOUND) {
        const r = await D.startDocumentUpload(d, ADMIN, { business_id: biz, type_code: code, logical_document_id: null, request_id: null, claim_id: null });
        assert.deepEqual(r, { ok: false, why: D.NO_RECEIPT_POLICY }, `${code}: an upload was not refused before a link`);
        const q = D.createDocumentRequest(d, ADMIN, { business_id: biz, claim_id: null, type_code: code, why: 'x', holds_up: 'y', due_on: null });
        assert.equal(q.ok, false);
        assert.match(q.ok ? '' : q.why, /nothing could ever receive it/);
      }
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM documents'), docs, 'a document row was written');
      const lease = RR.recommendationReading(a.db, SALES, 'LEASE');
      assert.equal(lease.state, 'NO_RECOMMENDATION');
      assert.equal(lease.strip_now.receivable, true);
      assert.throws(() => RR.recommendationReading(a.db, actor('SURVEYING'), 'ACCOUNTS'), NotAuthorised);
    } finally { a.close(); }
  });
});
