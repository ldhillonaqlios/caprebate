/**
 * THE ROLE TESTS. One per role, and each asserts BOTH what the role returns
 * AND what it refuses — a test that only checks the happy path proves the
 * feature works, not that the control does.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { can, REGISTERED_ACTIONS, READ_ONLY_RULES, canAsReadOnly, type Obj } from '../src/authz.ts';
import { APP_ROLES, toQuarantineRole, type AppRole } from '../src/roles.ts';
import { actor } from './helpers.ts';

const BIZ = 'biz-1';
const OTHER = 'biz-2';

const assessment: Obj = { type: 'assessment', id: 'a1', business_id: BIZ };
const answer: Obj = { type: 'answer', id: 'an1', business_id: BIZ };
const estimate: Obj = { type: 'estimate', id: 'e1', business_id: BIZ };
const invoice: Obj = { type: 'invoice', id: 'i1', business_id: BIZ };
const note: Obj = { type: 'internal_note', id: 'n1', business_id: BIZ };
const reg: Obj = { type: 'register_record', id: 'r1', business_id: BIZ };
const audit: Obj = { type: 'audit', id: 'log' };
const someUser: Obj = { type: 'user', id: 'u-OTHER', role: 'SALES' };

describe('ADMIN — the super user', () => {
  const a = actor('ADMIN');
  test('returns: user administration and the audit log', () => {
    assert.equal(can(a, 'user.create', someUser), true);
    assert.equal(can(a, 'user.disable', someUser), true);
    assert.equal(can(a, 'user.assign_role', someUser), true);
    assert.equal(can(a, 'audit.read', audit), true);
    assert.equal(can(a, 'invoice.read', invoice), true);
  });
  test('refuses: an action nobody has, even for the super user', () => {
    assert.equal(can(a, 'user.delete_permanently', someUser), false);
  });
  test('refuses: everything, once disabled', () => {
    const disabled = { ...a, disabled: true };
    assert.equal(can(disabled, 'user.create', someUser), false);
    assert.equal(can(disabled, 'audit.read', audit), false);
  });
});

describe('SALES — the pipeline', () => {
  const a = actor('SALES');
  test('returns: assessments, answers, notes, research, bookings', () => {
    assert.equal(can(a, 'assessment.read', assessment), true);
    assert.equal(can(a, 'answer.read', answer), true);
    assert.equal(can(a, 'internal_note.read', note), true);
    assert.equal(can(a, 'research.run', { type: 'research', id: 'x', business_id: BIZ }), true);
  });
  test('refuses: user administration, the audit log, and the finance ledger', () => {
    assert.equal(can(a, 'user.create', someUser), false);
    assert.equal(can(a, 'user.assign_role', someUser), false);
    assert.equal(can(a, 'audit.read', audit), false);
    assert.equal(can(a, 'invoice.write', invoice), false);
  });
});

describe("ACCOUNTING — Caprebate's own finance, and nothing else", () => {
  const a = actor('ACCOUNTING');
  test('returns: invoices, and the client name they belong to', () => {
    assert.equal(can(a, 'invoice.read', invoice), true);
    assert.equal(can(a, 'invoice.write', invoice), true);
    assert.equal(can(a, 'business.read', { type: 'business', id: BIZ }), true);
  });
  test('refuses: the questions and answers', () => {
    assert.equal(can(a, 'assessment.read', assessment), false);
    assert.equal(can(a, 'answer.read', answer), false);
  });
  test('refuses: the register data', () => {
    assert.equal(can(a, 'register_record.read', reg), false);
  });
  test('refuses: the internal notes', () => {
    assert.equal(can(a, 'internal_note.read', note), false);
  });
  test("refuses: the surveyor's workings", () => {
    assert.equal(
      can(a, 'surveyor_job.read', { type: 'surveyor_job', id: 'j1', business_id: BIZ, surveyor_id: 'u-SURVEYING' }),
      false,
    );
  });
});

describe('SURVEYING — the review-and-sign workspace, and nothing else', () => {
  const a = actor('SURVEYING');
  const mine: Obj = { type: 'surveyor_job', id: 'j1', business_id: BIZ, surveyor_id: 'u-SURVEYING' };
  const theirs: Obj = { type: 'surveyor_job', id: 'j2', business_id: BIZ, surveyor_id: 'u-someone-else' };
  const unassigned: Obj = { type: 'surveyor_job', id: 'j3', business_id: BIZ, surveyor_id: null };

  test('returns: their OWN job, and the inputs the survey needs', () => {
    assert.equal(can(a, 'surveyor_job.read', mine), true);
    assert.equal(can(a, 'surveyor_job.commit', mine), true);
    assert.equal(can(a, 'assessment.read', assessment), true);
    assert.equal(can(a, 'register_record.read', reg), true);
  });

  test("refuses: ANOTHER surveyor's job — the object decides, not the role", () => {
    assert.equal(can(a, 'surveyor_job.read', theirs), false);
    assert.equal(can(a, 'surveyor_job.commit', theirs), false);
  });

  test('refuses: an UNASSIGNED job. Nobody in particular is not everybody', () => {
    assert.equal(can(a, 'surveyor_job.read', unassigned), false);
  });

  test('refuses: our estimate — there is no estimate.read rule for this role at all', () => {
    assert.equal(can(a, 'estimate.read', estimate), false);
  });

  test('refuses: the finance ledger and the internal notes', () => {
    assert.equal(can(a, 'invoice.read', invoice), false);
    assert.equal(can(a, 'internal_note.read', note), false);
  });
});

describe('CLIENT — their own record only', () => {
  const a = actor('CLIENT', 'u-CLIENT', BIZ);
  test('returns: their own business, assessment, answers and estimate', () => {
    assert.equal(can(a, 'business.read', { type: 'business', id: BIZ }), true);
    assert.equal(can(a, 'assessment.read', assessment), true);
    assert.equal(can(a, 'answer.read', answer), true);
    assert.equal(can(a, 'estimate.read', estimate), true);
  });
  test("refuses: ANOTHER client's record, at every object type", () => {
    assert.equal(can(a, 'business.read', { type: 'business', id: OTHER }), false);
    assert.equal(can(a, 'assessment.read', { type: 'assessment', id: 'a9', business_id: OTHER }), false);
    assert.equal(can(a, 'answer.read', { type: 'answer', id: 'an9', business_id: OTHER }), false);
    assert.equal(can(a, 'estimate.read', { type: 'estimate', id: 'e9', business_id: OTHER }), false);
  });
  test('refuses: internal notes, the finance ledger and the audit log — even on their own business', () => {
    assert.equal(can(a, 'internal_note.read', note), false);
    assert.equal(can(a, 'invoice.read', invoice), false);
    assert.equal(can(a, 'audit.read', audit), false);
  });
});

describe('DENY BY DEFAULT', () => {
  test('an UNREGISTERED action is refused for every role', () => {
    for (const role of APP_ROLES) {
      assert.equal(
        can(actor(role, `u-${role}`, BIZ), 'route.nobody.registered', assessment), false,
        `${role} was allowed an action with no rule — a new route must fail closed`,
      );
    }
  });

  test('a registered action is refused for a role not listed on it', () => {
    // invoice.read exists; SURVEYING is not on it.
    assert.equal(can(actor('SURVEYING'), 'invoice.read', invoice), false);
  });

  test('the guard is not a whitelist of known-bad names: a random action is refused too', () => {
    for (const name of ['', 'x', '__proto__', 'toString', 'constructor', 'hasOwnProperty']) {
      assert.equal(can(actor('ADMIN'), name, assessment), false, `'${name}' was allowed`);
    }
  });

  test('every registered action is refused for at least one role — no action is universal by accident', () => {
    for (const action of REGISTERED_ACTIONS) {
      const refused = APP_ROLES.some(
        (r) => !can(actor(r, `u-${r}`, OTHER), action, assessment),
      );
      assert.equal(refused, true, `${action} was allowed to every role`);
    }
  });
});

describe('the three role vocabularies do not get conflated', () => {
  test('SURVEYING is the one application role the quarantine withholds from', () => {
    const quarantined = APP_ROLES.filter((r: AppRole) => toQuarantineRole(r) === 'SURVEYOR');
    // Phase 132e: READ_ONLY maps to the surveyor's quarantine role too — conservative; it reaches no estimate anyway.
    assert.deepEqual(quarantined, ['SURVEYING', 'READ_ONLY']);
  });
  test('every application role maps to a role the quarantine module declares', () => {
    const known = ['SURVEYOR', 'ANALYST', 'CLIENT_MANAGER', 'CTA', 'CLIENT'];
    for (const r of APP_ROLES) assert.ok(known.includes(toQuarantineRole(r)), `${r} maps outside the module's type`);
  });
});

/* ================================================================== *
 * READ_ONLY — THE VIEW-ONLY LOGIN.           Phase 132e, 16 September 2026
 *
 * Lakhbir: "One main log in for admin/manager/owner, and another log for view
 * only". Every registered action carries an explicit decision in
 * `READ_ONLY_RULES`. These tests loop over the rule table, so a future action
 * added to `RULES` without a view-only decision FAILS HERE, and every "no" is
 * asserted refused on the most favourable object the action could be asked of.
 * ================================================================== */


const RO = actor('READ_ONLY', 'u-READ_ONLY', null);

/** Every shape an object could take, each carrying every field a predicate could turn on, set to the favourable value. */
function favourableObjects(): Obj[] {
  const who = 'u-READ_ONLY';
  const base = {
    id: who, business_id: BIZ, role: 'READ_ONLY', user_id: who, surveyor_id: who, assigned_surveyor_ids: [who],
    owner_id: who, owner_role: 'READ_ONLY', letter_signed: true, released_to_client: true,
    kind: 'CLIENT_REPORT', state: 'ISSUED', figure_released: true, shared: true,
  };
  const types = ['user', 'business', 'assessment', 'answer', 'estimate', 'invoice', 'internal_note', 'register_record',
    'research', 'booking', 'engagement', 'surveyor_job', 'audit', 'working_time', 'contact', 'property', 'claim', 'lead',
    'pipeline', 'staff_task', 'timeline', 'automation_rule', 'email_template', 'email', 'document_type',
    'document_request', 'introducer', 'share_consent', 'introducer_reward', 'introducer_fee', 'claim_facts',
    'claim_figures', 'deliverable', 'hmrc_enquiry', 'compliance', 'identity_person', 'saved_view', 'configuration'];
  const out: Obj[] = types.map((type) => ({ ...base, type }) as unknown as Obj);
  for (const readers of ['CLAIM_EVIDENCE', 'CLAIM_TEAM', 'FINANCE', 'ENGAGEMENT_LETTER']) {
    for (const carries_value of [false, true]) out.push({ ...base, type: 'document', readers, carries_value } as unknown as Obj);
  }
  return out;
}

describe('READ_ONLY — an explicit yes or no on every rule, and a refusal on every rule it is not given', () => {
  test('EVERY REGISTERED ACTION HAS A VIEW-ONLY DECISION WITH A REASON — a new rule without one fails here', () => {
    const missing = REGISTERED_ACTIONS.filter((a) => !Object.prototype.hasOwnProperty.call(READ_ONLY_RULES, a));
    assert.deepEqual(missing, [], `actions with no READ_ONLY decision: ${missing.join(', ')}`);
    const stray = Object.keys(READ_ONLY_RULES).filter((a) => !REGISTERED_ACTIONS.includes(a));
    assert.deepEqual(stray, [], `READ_ONLY decisions for actions nobody registered: ${stray.join(', ')}`);
    for (const [a, d] of Object.entries(READ_ONLY_RULES)) assert.ok(d.why.trim().length > 10, `${a} has no reason`);
  });

  test('EVERY "NO" IS REFUSED, on every object shape set to its most favourable value', () => {
    const objs = favourableObjects();
    let checked = 0;
    for (const action of REGISTERED_ACTIONS) {
      if (READ_ONLY_RULES[action]?.allow !== null) continue;
      for (const o of objs) {
        assert.equal(can(RO, action, o), false, `READ_ONLY was allowed ${action} on a ${o.type}`);
        checked++;
      }
    }
    assert.ok(checked > 0);
  });

  test('EVERY "YES" IS ALLOWED on a favourable object, and a disabled view-only user is refused everything', () => {
    const objs = favourableObjects();
    for (const action of REGISTERED_ACTIONS) {
      const allowedSomewhere = objs.some((o) => can(RO, action, o));
      assert.equal(allowedSomewhere, READ_ONLY_RULES[action]?.allow !== null, `${action}: the decision and can() disagree`);
      for (const o of objs) assert.equal(can({ ...RO, disabled: true }, action, o), false, `a disabled READ_ONLY on ${action}`);
    }
  });

  test('AN ACTION WITH NO DECISION IS REFUSED — deny by default, not a fall-through to the five roles’ table', () => {
    assert.equal(canAsReadOnly(RO, 'a.future_action', estimate), false);
    assert.equal(can(RO, 'a.future_action', estimate), false);
    // canAsReadOnly decides nothing for any other role.
    for (const r of APP_ROLES.filter((x) => x !== 'READ_ONLY')) {
      assert.equal(canAsReadOnly(actor(r, `u-${r}`, BIZ), 'business.read', { type: 'business', id: BIZ }), false);
    }
  });

  test('THE CONSERVATIVE LINES, BY NAME: it writes nothing but its own password, sees no value, money, register or log, and exports nothing', () => {
    const yes = Object.entries(READ_ONLY_RULES).filter(([, d]) => d.allow !== null).map(([a]) => a).sort();
    assert.deepEqual(yes, [
      'answer.read', 'assessment.read', 'automation_rule.read', 'backoffice.enter', 'booking.read', 'business.read',
      'claim.enter', 'claim.read', 'configuration.read', 'contact.read', 'dashboard.enter', 'deliverable.read',
      'document.read', 'document_centre.enter', 'document_request.read', 'document_type.read', 'email_template.read',
      'engagement.read', 'introducer.enter', 'introducer.read', 'introducer_reward.read', 'lead.read',
      'organisation.read', 'pipeline.read', 'property.enter', 'property.read', 'register_record.read',
      'share_consent.read', 'staff_task.read', 'timeline.read', 'user.change_own_password', 'user.read_self',
    ].sort(), 'the view-only yes-list changed — that is a decision, so change this list with it');
    for (const sealed of ['estimate.read', 'claim.read_value', 'claim_figures.read', 'claim_facts.read', 'surveyor_job.read',
      'invoice.read', 'introducer.read_value', 'introducer.read_money', 'introducer_fee.read', 'compliance.read',
      'compliance.identity_read', 'disclosure.read', 'audit.read', 'list.export', 'research.read', 'internal_note.read']) {
      assert.equal(READ_ONLY_RULES[sealed]?.allow, null, `${sealed} must stay no`);
    }
    // Its own password only — never somebody else's account.
    assert.equal(can(RO, 'user.change_own_password', { type: 'user', id: 'u-READ_ONLY', role: 'READ_ONLY' }), true);
    assert.equal(can(RO, 'user.change_own_password', { type: 'user', id: 'u-SALES', role: 'SALES' }), false);
    // A document that carries a value, or the letter, or a finance paper, is refused.
    const doc = (readers: string, carries_value: boolean): Obj => ({ type: 'document', id: 'd', business_id: BIZ, readers, carries_value, letter_signed: true, assigned_surveyor_ids: [] });
    assert.equal(can(RO, 'document.read', doc('CLAIM_EVIDENCE', false)), true);
    assert.equal(can(RO, 'document.read', doc('CLAIM_TEAM', true)), false);
    assert.equal(can(RO, 'document.read', doc('FINANCE', false)), false);
    assert.equal(can(RO, 'document.read', doc('ENGAGEMENT_LETTER', false)), false);
  });
});
