/**
 * PHASE 161m1, 11 November 2026: WHO MAY BE SENT THE ONLINE IDENTITY CHECK, AND DIDIT NAMED.
 *
 * Lakhbir: "mention didit and ensure the person who is performing the ID check is the director or owner, admin can
 * bypass". What this file proves (src/modules/compliance/identity-who.ts, src/modules/compliance/identity-checks.ts):
 *   1 · a director passes: one the due diligence check names with a director's authority, and one Companies House
 *       lists (the signatory check said yes for the person who signed our letter);
 *   2 · an owner passes: a person with significant control in the Companies House pull we keep;
 *   3 · anyone else is refused, with the message, audited by the rule's code, and nothing is sent; and a name typed
 *       that is not the contact's is refused too;
 *   4 · an Admin may send it anyway with a reason, audited; with no reason it is refused; a role that is not Admin
 *       cannot, even one that borrows the Admin's right to write the registers;
 *   5 · a client that is not a company: its owner or a partner named on our client record, and Companies House's
 *       readings do not count;
 *   6 · Didit named: the letter's flag is true (version 2 of the rule), the notice's stays false, and the screens say
 *       the check is by Didit.
 * Recorded answers, INVENTED people and keys, no network.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { seed } from '../../src/app/seed.ts';
import type { Actor } from '../../src/core/authz.ts';
import { can } from '../../src/core/authz.ts';
import { fixtureTransport, type Fixture } from '../../src/integrations/connectors/http.ts';
import { secretsFromValues } from '../../src/core/secrets.ts';
import {
  IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, identityCheckMissing, identityTestingWarning, type IdentityCheckConfig,
} from '../../src/integrations/connectors/identity-check.ts';
import {
  ADMIN_MAY_BYPASS_WORDS, ASK_AN_ADMIN_WORDS, identityPanel, ONLY_ADMIN_BYPASSES_WORDS, sendIdentityCheck,
} from '../../src/modules/compliance/identity-checks.ts';
import { clientKindOf, mayBeChecked, TYPED_NAME_WORDS, WHO_MAY_BE_CHECKED } from '../../src/modules/compliance/identity-who.ts';
import { openCheck, updateCheck } from '../../src/modules/compliance/compliance-aml.ts';
import { makeRole } from '../../src/modules/admin/role-editor.ts';
import { INTEGRATIONS_RULES } from '../../src/integrations/logic/rules.ts';
import { COMPLIANCE_RULES } from '../../src/modules/compliance/logic/rules.ts';
import { testApp } from '../helpers.ts';

const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-161m1', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-161m1', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-161m10000001' };
/* The papers done and nothing waived: these tests are about who may be checked, not the papers. */
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true, papers_waived_for_testing: false, waiver_record: null });
const SESSION_OK: Fixture = { status: 201, body: JSON.stringify({ session_id: 'a1b2c3d4-0000-4000-8000-161m10000001', url: 'https://verify.didit.me/en/session/INVENTED161M1', status: 'Not Started' }) };

const newId = (): string => randomBytes(8).toString('hex');

async function world(claimant_type: string | null = 'COMPANY') {
  const app = await testApp();
  const s = await seed(app.db, app.hasher, app.now);
  app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
  app.secrets = secretsFromValues(KEYS);
  const biz = s.businesses[0]!.id; // Aldergate: an engagement, and no signature yet
  app.db.run('UPDATE businesses SET claimant_type = ?, company_number = ? WHERE id = ?', [claimant_type, '09999161', biz]);
  const admin = { id: s.users.find((u) => u.role === 'ADMIN')!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor;
  /** A contact of the client we can reach, INVENTED, with the assessment's role code or none. */
  const person = (full_name: string, job_role: string | null = null): string => {
    const id = newId();
    app.db.run('INSERT INTO contacts (id, business_id, full_name, job_role, contact_consent, marketing_optin, created_at, email) VALUES (?, ?, ?, ?, 1, 0, ?, ?)',
      [id, biz, full_name, job_role, app.now(), `${id}@example.invalid`]);
    return id;
  };
  const audit = (kind: string) => app.db.all<{ object_id: string; outcome: string; actor_id: string | null; detail: string }>(
    'SELECT object_id, outcome, actor_id, detail FROM audit_log WHERE kind = ? ORDER BY seq', [kind]);
  const sent = (): number => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_checks')!.n;
  const cd = { db: app.db, audit: app.audit, now: app.now, newId };
  const send = (actor: Actor, contact_id: string, first_name: string, last_name: string, bypass: { reason: string } | null = null) =>
    sendIdentityCheck({ app, newId }, actor, { business_id: biz, contact_id, cdd_check_id: null, first_name, last_name, bypass }, { config: ON });
  const panel = (actor: Actor, contacts: { id: string; full_name: string }[]) => String(identityPanel(app, actor, { business_id: biz }, contacts));
  return { app, s, biz, admin, person, audit, sent, cd, send, panel };
}

/** A due diligence check on the client naming one contact as the person with authority. */
function authorityOn(w: Awaited<ReturnType<typeof world>>, contact_id: string, basis: string): void {
  const open = openCheck(w.cd, w.admin, { business_id: w.biz, claimant_type: 'LIMITED_COMPANY' });
  assert.equal(open.ok, true, open.ok ? '' : open.why);
  const id = open.ok ? open.id : '';
  const r = updateCheck(w.cd, w.admin, id, { authority_basis: basis, authority_contact_id: contact_id });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

/** A person with significant control in the Companies House pull we keep, INVENTED. */
function psc(w: Awaited<ReturnType<typeof world>>, name: string, extra: Record<string, unknown> = {}): void {
  w.app.db.run('INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), w.biz, 'CH_PSC', `09999161/psc/${newId()}`, JSON.stringify({ psc_name: name, psc_kind: 'individual-person-with-significant-control', company_number: '09999161', ...extra }), w.app.now()]);
}

describe('161m1 · 1 · a director passes', () => {
  test('a director the due diligence check names: sent, and the panel shows them as a director', async () => {
    const w = await world();
    const dir = w.person('Ada Invented');
    authorityOn(w, dir, 'DIRECTOR');
    const r = await w.send(w.admin, dir, 'Ada', 'Invented');
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    assert.equal(w.sent(), 1);
    assert.equal(w.audit('IDENTITY_CHECK_RULE_BYPASSED').length, 0, 'a director needs no bypass');
    const a = mayBeChecked(w.app.db, w.biz, dir, null);
    assert.equal(a.ok && a.role, 'DIRECTOR');
    assert.match(w.panel(w.admin, [{ id: dir, full_name: 'Ada Invented' }]), /Ada Invented \(a director\)/);
  });

  test('a director Companies House lists (the signer, and the signatory check said yes): sent', async () => {
    const w = await world();
    const eng = w.app.db.get<{ id: string }>('SELECT id FROM engagements WHERE business_id = ?', [w.biz])!.id;
    const h = (): string => randomBytes(32).toString('hex');
    w.app.db.run('INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
      'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256) ' +
      "VALUES (?, ?, ?, 'SEED', NULL, NULL, ?, 'Director', 'Invented Business', 1, ?, '192.0.2.1', 'letter', ?, ?, ?, ?)",
    [newId(), eng, w.biz, 'Mr Basil Q. Invented', w.app.now(), h(), new Uint8Array([1]), h(), h()]);
    w.app.db.run("INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) VALUES (?, ?, ?, 'COMPANIES_HOUSE', 'YES', 'CURRENT_DIRECTOR', ?, ?)",
      [newId(), w.biz, eng, w.app.now(), w.admin.id]);
    const dir = w.person('Basil Invented');
    const other = w.person('Cara Invented');
    const a = mayBeChecked(w.app.db, w.biz, dir, null);
    assert.ok(a.ok && a.role === 'DIRECTOR' && a.from.includes('COMPANIES_HOUSE_DIRECTOR'), 'the signer, by the signatory check’s own name rule');
    assert.equal(mayBeChecked(w.app.db, w.biz, other, null).ok, false, 'the yes is about the signer only');
    const r = await w.send(w.admin, dir, 'Basil', 'Invented');
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    const html = w.panel(w.admin, [{ id: dir, full_name: 'Basil Invented' }, { id: other, full_name: 'Cara Invented' }]);
    assert.match(html, /Basil Invented \(a director\)/);
    assert.match(html, /Not a director or an owner on our records:<\/strong> Cara Invented\./);
  });
});

describe('161m1 · 2 · an owner passes', () => {
  test('a person with significant control in the Companies House pull: sent, and shown as an owner', async () => {
    const w = await world();
    psc(w, 'Mrs Dora Jane INVENTED');
    const owner = w.person('Dora Invented');
    const a = mayBeChecked(w.app.db, w.biz, owner, null);
    assert.ok(a.ok && a.role === 'OWNER' && a.from.includes('COMPANIES_HOUSE_PSC'));
    const r = await w.send(w.admin, owner, 'Dora Jane', 'Invented');
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    assert.match(w.panel(w.admin, [{ id: owner, full_name: 'Dora Invented' }]), /Dora Invented \(an owner\)/);
  });

  test('one who has ceased, or a company that controls it, is not an owner here', async () => {
    const w = await world();
    psc(w, 'Eve INVENTED', { psc_ceased_on: '2025-01-01' });
    w.app.db.run('INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(), w.biz, 'CH_PSC', '09999161/psc/corp', JSON.stringify({ psc_name: 'Fred Invented', psc_kind: 'corporate-entity-person-with-significant-control' }), w.app.now()]);
    assert.equal(mayBeChecked(w.app.db, w.biz, w.person('Eve Invented'), null).ok, false);
    assert.equal(mayBeChecked(w.app.db, w.biz, w.person('Fred Invented'), null).ok, false);
  });
});

describe('161m1 · 3 · anyone else is refused, and told why and how to go on', () => {
  test('a finance contact we hold as neither: refused with the message, audited by code, nothing sent', async () => {
    const w = await world();
    const fin = w.person('Gina Invented', 'fd_cfo');
    const r = await w.send(w.admin, fin, 'Gina', 'Invented');
    assert.equal(r.ok, false);
    const why = r.ok ? '' : r.why;
    assert.match(why, /^Not sent\. We send an identity check only to a director or an owner of this client\. We do not hold Gina Invented as one\./);
    assert.match(why, /Are they one\? Then record it on its due diligence check first\. Name them as the person with authority, or add them as an owner\./);
    assert.ok(why.endsWith(ADMIN_MAY_BYPASS_WORDS), 'an Admin is told they may send it anyway');
    assert.equal(w.sent(), 0);
    const row = w.audit('IDENTITY_CHECK_NOT_SENT').at(-1);
    assert.ok(row);
    assert.equal(row.outcome, 'REFUSED');
    assert.equal((JSON.parse(row.detail) as Record<string, unknown>)['why'], 'NOT_DIRECTOR_OR_OWNER');
    assert.doesNotMatch(row.detail, /Gina/, 'no name on the audit chain');
    const html = w.panel(w.admin, [{ id: fin, full_name: 'Gina Invented' }]);
    assert.match(html, /id="identity-not-director-or-owner"/);
    assert.match(html, /Not a director or an owner on our records:<\/strong> Gina Invented\./);
  });

  test('a director, but the name typed is someone else’s: refused', async () => {
    const w = await world();
    const dir = w.person('Hana Invented');
    authorityOn(w, dir, 'DIRECTOR');
    const r = await w.send(w.admin, dir, 'Ivan', 'Stranger');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, new RegExp(TYPED_NAME_WORDS.slice(0, 40).replace(/[.]/g, '\\.')));
    assert.equal(w.sent(), 0);
    assert.equal((JSON.parse(w.audit('IDENTITY_CHECK_NOT_SENT').at(-1)!.detail) as Record<string, unknown>)['why'], 'NAME_NOT_THEIRS');
    // a middle name typed as on the ID, which our record leaves out, is still their name
    assert.equal((await w.send(w.admin, dir, 'Hana Maria', 'Invented')).ok, true);
  });
});

describe('161m1 · 4 · an Admin may send it anyway, once, with a reason', () => {
  test('with a reason: sent, and the reason, the rule and the Admin are on the audit chain', async () => {
    const w = await world();
    const fin = w.person('Jack Invented', 'fd_cfo');
    const r = await w.send(w.admin, fin, 'Jack', 'Invented', { reason: 'The directors asked in writing for the finance director to do it.' });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    assert.equal(w.sent(), 1);
    const by = w.audit('IDENTITY_CHECK_RULE_BYPASSED');
    assert.equal(by.length, 1);
    assert.equal(by[0]!.outcome, 'ALLOWED');
    assert.equal(by[0]!.actor_id, w.admin.id);
    assert.equal(by[0]!.object_id, r.ok ? r.id : '');
    const d = JSON.parse(by[0]!.detail) as Record<string, unknown>;
    assert.equal(d['reason'], 'The directors asked in writing for the finance director to do it.');
    assert.equal(d['rule'], 'NOT_DIRECTOR_OR_OWNER');
    assert.equal((JSON.parse(w.audit('IDENTITY_CHECK_SENT').at(-1)!.detail) as Record<string, unknown>)['rule_bypassed'], 'NOT_DIRECTOR_OR_OWNER');
    assert.match(w.panel(w.admin, [{ id: fin, full_name: 'Jack Invented' }]), /name="bypass_reason"/, 'the Admin sees the box');
    // for this one check only: the next one is refused again
    assert.equal((await w.send(w.admin, fin, 'Jack', 'Invented')).ok, false);
  });

  test('the bypass asked for with no reason, or one the audit chain refuses: refused, nothing sent', async () => {
    const w = await world();
    const fin = w.person('Kim Invented', 'fd_cfo');
    for (const reason of ['', '   ']) {
      const r = await w.send(w.admin, fin, 'Kim', 'Invented', { reason });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /Say why you are sending it to someone who is not a director or an owner\./);
    }
    const r = await w.send(w.admin, fin, 'Kim', 'Invented', { reason: 'ask kim@example.invalid' });
    assert.match(r.ok ? '' : r.why, /Leave email addresses and codes out of the reason\./);
    assert.equal(w.sent(), 0);
    assert.equal(w.audit('IDENTITY_CHECK_RULE_BYPASSED').length, 0);
    assert.equal((JSON.parse(w.audit('IDENTITY_CHECK_NOT_SENT').at(-1)!.detail) as Record<string, unknown>)['why'], 'BYPASS_WITHOUT_REASON');
  });

  test('a role that is not Admin cannot bypass, even one that borrows the Admin’s right to write the registers', async () => {
    const w = await world();
    const d = { db: w.app.db, audit: w.app.audit, now: w.app.now, hasher: w.app.hasher, newId };
    const made = makeRole(d as never, w.admin, { name: 'Compliance Helper 161m1', grants: [
      { action: 'backoffice.enter', as_role: 'ADMIN' }, { action: 'compliance.read', as_role: 'ADMIN' }, { action: 'compliance.write', as_role: 'ADMIN' },
    ] });
    assert.equal(made.ok, true, made.ok ? '' : made.why);
    const helper = { id: w.admin.id, role: made.ok ? made.role : '', business_id: null, disabled: false } as unknown as Actor;
    assert.equal(can(helper, 'compliance.write', { type: 'compliance', id: '__registers__' } as never), true, 'it may send checks');
    const fin = w.person('Leo Invented', 'fd_cfo');
    const plain = await w.send(helper, fin, 'Leo', 'Invented');
    assert.ok((plain.ok ? '' : plain.why).endsWith(ASK_AN_ADMIN_WORDS), 'told to ask an Admin');
    const r = await w.send(helper, fin, 'Leo', 'Invented', { reason: 'I am sure it is fine.' });
    assert.equal(r.ok, false);
    assert.ok((r.ok ? '' : r.why).endsWith(ONLY_ADMIN_BYPASSES_WORDS));
    assert.equal(w.sent(), 0);
    assert.equal(w.audit('IDENTITY_CHECK_RULE_BYPASSED').length, 0);
    assert.equal((JSON.parse(w.audit('IDENTITY_CHECK_NOT_SENT').at(-1)!.detail) as Record<string, unknown>)['why'], 'BYPASS_NOT_ADMIN');
    assert.doesNotMatch(w.panel(helper, [{ id: fin, full_name: 'Leo Invented' }]), /name="bypass_reason"/, 'only an Admin sees the box');
  });
});

describe('161m1 · 5 · a client that is not a company: its owner or a partner, named on our client record', () => {
  test('a sole trader: the owner on our record passes; someone else, or a Companies House reading, does not', async () => {
    const w = await world('SOLE_TRADER');
    assert.equal(clientKindOf('SOLE_TRADER'), 'NOT_A_COMPANY');
    assert.deepEqual(WHO_MAY_BE_CHECKED.NOT_A_COMPANY, { DIRECTOR: false, OWNER: true, TRUSTEE: false });
    const owner = w.person('Mia Invented', 'sole_trader');
    assert.equal((await w.send(w.admin, owner, 'Mia', 'Invented')).ok, true);
    const other = w.person('Ned Invented');
    psc(w, 'Ned INVENTED'); // a Companies House reading names no one for a sole trader, so it is not counted
    const r = await w.send(w.admin, other, 'Ned', 'Invented');
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /^Not sent\. This client is not a company\. We send an identity check only to its owner or a partner, named on our client record\./);
    assert.match(r.ok ? '' : r.why, /Are they its owner or a partner\? Then record it on its due diligence check first\./);
  });

  test('a partnership: a partner the due diligence check names passes; a director’s authority does not count', async () => {
    const w = await world('PARTNERSHIP');
    const partner = w.person('Ola Invented');
    authorityOn(w, partner, 'PARTNER');
    assert.equal((await w.send(w.admin, partner, 'Ola', 'Invented')).ok, true);
    const dir = w.person('Pat Invented');
    authorityOn(w, dir, 'DIRECTOR');
    assert.equal(mayBeChecked(w.app.db, w.biz, dir, null).ok, false, 'a partnership has no directors');
    assert.match(w.panel(w.admin, [{ id: dir, full_name: 'Pat Invented' }]), /This client is not a company\./);
  });

  test('the rest of the kinds, as the rule says', () => {
    for (const t of ['COMPANY', 'LLP', 'CHARITY_COMPANY']) assert.equal(clientKindOf(t), 'COMPANY', t);
    for (const t of ['SOLE_TRADER', 'PARTNERSHIP', 'INDIVIDUAL']) assert.equal(clientKindOf(t), 'NOT_A_COMPANY', t);
    for (const t of ['CHARITY', 'CHARITABLE_TRUST']) assert.equal(clientKindOf(t), 'CHARITY_OR_TRUST', t);
    for (const t of ['UNKNOWN', null, '']) assert.equal(clientKindOf(t), 'NOT_RECORDED', String(t));
    assert.deepEqual(WHO_MAY_BE_CHECKED.COMPANY, { DIRECTOR: true, OWNER: true, TRUSTEE: false });
  });
});

describe('161m1 · 6 · Didit named', () => {
  test('the letter names Didit: its flag is true, as version 2 of the rule; the draft notice’s flag stays false', () => {
    assert.equal(IDENTITY_CHECK.named_in_engagement_letter, true);
    assert.equal(IDENTITY_CHECK.named_in_privacy_notice, false);
    assert.equal(IDENTITY_CHECK.papers_waived_for_testing, true, 'nothing switched on or off by this');
    const rule = INTEGRATIONS_RULES.find((r) => r.id === 'integrations.IDENTITY_CHECK');
    assert.equal(rule?.version, 2);
    assert.equal(rule?.effective_from, '2026-11-11');
    assert.match(rule?.change ?? '', /Clause 18 of the engagement letter now names Didit/);
    const who = COMPLIANCE_RULES.find((r) => r.id === 'compliance.IDENTITY_CHECK_WHO');
    assert.equal(who?.version, 1);
    // the screens name only the paper still missing
    assert.equal(identityTestingWarning(IDENTITY_CHECK), 'Testing only. Our published privacy notice does not name Didit yet. Check yourself or a colleague who agrees. Never check a client.');
    const unwaived: IdentityCheckConfig = { ...IDENTITY_CHECK, papers_waived_for_testing: false };
    assert.ok(identityCheckMissing(unwaived, secretsFromValues(KEYS)).includes('Name that service in the privacy notice.'));
  });

  test('the panel tells the person sending it to say the check is by Didit', async () => {
    const w = await world();
    const html = w.panel(w.admin, [{ id: w.person('Quin Invented'), full_name: 'Quin Invented' }]);
    assert.match(html, /id="identity-by-didit">When you give them the link, tell them the check is done for us by Didit\./);
  });
});
