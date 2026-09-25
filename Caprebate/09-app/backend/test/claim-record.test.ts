/**
 * CRM 6 OF 10 — THE CLAIM'S FACTS, FIGURES, SIGN-OFF, DELIVERABLES AND AFTERCARE.
 * 11 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                   → WHO MAY DO WHAT
 *   "derived first, captured only where nothing derives it, and every value
 *    carrying its source"                                   → THE FACTS PANEL
 *   "SURVEYING only the RELEASED inputs of an assigned job, through
 *    src/payload.ts - built forwards"                       → THE FACTS PANEL, released
 *   "No gate that relieves the client fires on unknown. For every derived gate
 *    you touch, assert the unsure answer AND the absent one" → THE GATES THE FACTS DECIDE
 *   "the amendment window … UNKNOWN whenever either input is, and UNKNOWN does
 *    not pass - as a need on the REPORTS and INVOICE gates" → THE AMENDMENT WINDOW
 *   "the gate CRM 2 built against a null column now reads this record - prove
 *    it opens only on it"                                   → THE SIGN-OFF RECORD
 *   "the four figures … each sealed and hashed … B NOT_PERMITTED_YET … the
 *    surveyor never receives A or B"                        → THE FOUR FIGURES
 *   "the reconciliation log … section 3 schema … variance by its taxonomy"
 *                                                           → THE RECONCILIATION
 *   "the deliverables register … an issued defence pack is immutable and its
 *    hash recorded … decide in can() whether an ISSUED client report is released
 *    to its client, with a test both ways"                  → THE DELIVERABLES REGISTER
 *   "a reasoned negative is told to the client through its deliverable, never as
 *    a stage the portal invents"                            → THE REASONED NEGATIVE
 *   "HMRC enquiry tracking … Clause 13 … a switch, off, reading the letter's
 *    blank … a disposal date set or a sale flagged … a task pointing at the
 *    Disposal Note"                                         → AFTERCARE
 *
 * EVERY REFUSAL HAS ITS NEGATIVE CONTROL: the same act, with the missing thing
 * supplied, succeeds. A refusal that could not have been a success proves nothing.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, NotAuthorised, type Obj } from '../src/authz.ts';
import { RELEASED_FACTS_TO_SURVEYOR } from '../src/payload.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as F from '../src/web/claim-facts.ts';
import * as R from '../src/web/claim-record.ts';
import * as D from '../src/web/documents.ts';
import * as T from '../src/web/tasks.ts';
import { actor, scalars, signatureRecordFor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const SCRIPT = '<script>alert(1)</script>';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

type App = Awaited<ReturnType<typeof testApp>>;
type Org = { business: string; property: string; assessment: string };

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

let n = 0;
function organisation(app: App): Org {
  n += 1;
  const business = `b-cr-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Claim Record ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-cr-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-cr-${n}`;
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
  return { business, property, assessment };
}

function claimAt(app: App, org: Org, stage: string): string {
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: org.business, property_id: org.property, assessment_id: org.assessment, workstream: 'PLANT_AND_MACHINERY',
    stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened(CF.recordDeps(app), null, made.id, stage, 'a test fixture');
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: org.business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null,
    created_by: 'u-SALES',
  });
  return made.id;
}

function fwd(app: App, who: AppRole, claim: string, to: string): P.MoveResult {
  return P.moveClaim(CF.recordDeps(app), actor(who), claim, { kind: 'FORWARD', to });
}

function confirm(app: App, claim: string, milestone: string): void {
  const r = P.recordMilestone(CF.recordDeps(app), actor('SALES'), claim, milestone, null);
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

function need(app: App, claim: string, from: Parameters<typeof P.gateOut>[2], what: string, today?: string): P.Need | undefined {
  return P.gateOut(app.db, P.loadPipelineClaim(app.db, claim), from, today === undefined ? {} : { today }).needs.find((x) => x.what === what);
}

/** A claim walked to TAX_ADVISER_SIGNOFF with a commitment, and the sign-off recorded through the store. */
function signedClaim(app: App, org: Org, figure = '2400000'): string {
  const c = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
  CF.commitmentOn(app, org.business, org.assessment, c);
  const r = R.recordSignOff(CF.recordDeps(app), actor('SALES'), c, {
    adviser: 'Invented Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
    method_note: 'reviewed against the rulebooks', figure, confirmed_switches: 'transaction_tax_in_base,grant_after_ceilings',
  });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
  return c;
}

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('WHO MAY DO WHAT — nine new actions, deny by default, every role not granted refused', () => {
  const GRANTS: Readonly<Record<string, readonly AppRole[]>> = {
    'claim_facts.read': ['ADMIN', 'SALES'],
    'claim_facts.read_released': ['SURVEYING'],
    'claim_facts.record': ['ADMIN', 'SALES'],
    'claim_figures.read': ['ADMIN', 'SALES'],
    'tax_signoff.record': ['ADMIN', 'SALES'],
    'reconciliation.record': ['ADMIN', 'SALES'],
    'deliverable.read': ['ADMIN', 'SALES', 'CLIENT'],
    'deliverable.record': ['ADMIN', 'SALES'],
    'hmrc_enquiry.record': ['ADMIN', 'SALES'],
  };
  const objFor = (action: string): Obj =>
    action.startsWith('claim_facts') ? { type: 'claim_facts', id: 'c1', business_id: 'b1', assigned_surveyor_ids: ['u-SURVEYING'] }
      : action.startsWith('deliverable') ? { type: 'deliverable', id: 'd1', business_id: 'b1', kind: 'REASONED_NEGATIVE', state: 'ISSUED', figure_released: false }
        : action.startsWith('hmrc_enquiry') ? { type: 'hmrc_enquiry', id: 'e1', business_id: 'b1' }
          : { type: 'claim_figures', id: 'c1', business_id: 'b1' };

  test('each role on each action, a client on its own organisation included, a disabled user refused everything — and ACCOUNTING on none', () => {
    for (const [action, granted] of Object.entries(GRANTS)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const who = actor(role, `u-${role}`, 'b1');
        assert.equal(can(who, action, objFor(action)), granted.includes(role), `${role} on ${action}`);
        assert.equal(can({ ...who, disabled: true }, action, objFor(action)), false, `a disabled ${role} on ${action}`);
      }
      assert.equal(granted.includes('ACCOUNTING'), false, `ACCOUNTING reaches ${action}`);
    }
  });

  test('a surveyor reaches the released facts only on a claim an assigned job reaches', () => {
    const s = actor('SURVEYING');
    const facts = (ids: string[]): Obj => ({ type: 'claim_facts', id: 'c1', business_id: 'b1', assigned_surveyor_ids: ids });
    assert.equal(can(s, 'claim_facts.read_released', facts([])), false, 'a claim with no job reached a surveyor');
    assert.equal(can(s, 'claim_facts.read_released', facts(['u-someone-else'])), false, 'another surveyor’s job reached this one');
    assert.equal(can(s, 'claim_facts.read_released', facts(['u-SURVEYING'])), true);
    assert.equal(can(s, 'claim_facts.read', facts(['u-SURVEYING'])), false, 'a surveyor reached the whole panel');
  });

  test('a client reads an ISSUED reasoned negative, s.203 notification or RELEASED client report of their own — and nothing else, both ways', () => {
    const client = actor('CLIENT', 'u-client', 'b1');
    const dl = (kind: string, state = 'ISSUED', figure_released = false, business_id = 'b1'): Obj =>
      ({ type: 'deliverable', id: 'd1', business_id, kind, state, figure_released });
    assert.equal(can(client, 'deliverable.read', dl('REASONED_NEGATIVE')), true);
    assert.equal(can(client, 'deliverable.read', dl('S203_NOTIFICATION')), true);
    assert.equal(can(client, 'deliverable.read', dl('REASONED_NEGATIVE', 'DRAFT')), false, 'a draft reached the client');
    assert.equal(can(client, 'deliverable.read', dl('REASONED_NEGATIVE', 'ISSUED', false, 'b2')), false, 'another client’s deliverable');
    assert.equal(can(client, 'deliverable.read', dl('CLIENT_REPORT')), false, 'a client report before its figure was released');
    assert.equal(can(client, 'deliverable.read', dl('CLIENT_REPORT', 'ISSUED', true)), true);
    for (const kind of ['ACCOUNTANT_COMPUTATION_PACK', 'DEFENCE_PACK']) {
      assert.equal(can(client, 'deliverable.read', dl(kind, 'ISSUED', true)), false, `the client read the ${kind}`);
    }
    // FAILS CLOSED on an object without the fields.
    assert.equal(can(client, 'deliverable.read', { type: 'deliverable', id: 'd1', business_id: 'b1' } as unknown as Obj), false);
  });
});

/* ================================================================== *
 * THE FACTS PANEL
 * ================================================================== */

describe('THE FACTS PANEL — derived first, captured only where nothing derives it, every value with its source', () => {
  test('a derived fact carries its source and the store refuses a recorded one — the claimant type, and taxable profit through the funnel and its break-even switch', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'DATA_GATHERING');
      app.db.run("UPDATE businesses SET claimant_type = 'COMPANY' WHERE id = ?", [org.business]);
      app.db.run("UPDATE properties SET jurisdiction = 'wales', acquisition_date = '2025-06-01' WHERE id = ?", [org.property]);
      app.db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at, submitted_assessment_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), JSON.stringify({ current_year_position: 'profitable' }), 'done', T0, T0, org.assessment]);

      const p = F.factsPanel(app.db, actor('SALES'), c, app.now(), { store: null });
      assert.equal(p.claimant_type.known, true);
      assert.equal(p.claimant_type.capturable, false);
      assert.equal(p.claimant_type.source?.locator, 'the organisation record');
      assert.equal(p.jurisdiction.value, 'wales');
      assert.equal(p.acquisition_date.value, '2025-06-01');
      assert.equal(p.taxable_profit.sufficient_profit.value, 'YES');
      assert.equal(p.taxable_profit.sufficient_profit.capturable, false);
      assert.equal(p.taxable_profit.sufficient_profit.source?.source_id, 'CLIENT_ANSWER');
      assert.equal(p.taxable_profit.breakeven_switch.on, false, 'the break-even switch is not read as shipped');
      assert.equal(p.acquisition_costs.switch.name, 'transaction_tax_in_base');
      assert.equal(p.acquisition_costs.switch.on, false, 'the stamp duty switch is shown on');
      assert.equal(p.buyer_alterations.switch.on, false);

      const d = CF.recordDeps(app);
      for (const key of ['CLAIMANT_TYPE', 'JURISDICTION', 'ACQUISITION_DATE']) {
        assert.equal(F.recordFact(d, actor('SALES'), c, { fact_key: key, answer: 'VALUE', value: 'x', source_id: 'CLIENT_ANSWER' }).ok, false, `${key} was recorded on the claim`);
      }
      const refused = F.recordFact(d, actor('SALES'), c, { fact_key: 'SUFFICIENT_PROFIT', answer: 'VALUE', value: 'NO', source_id: 'CLIENT_ANSWER' });
      assert.equal(refused.ok, false, 'a derived profit position was asked again');

      // Break-even, with the switch OFF as shipped, derives nothing — so it is captured, and not known until it is.
      const other = organisation(app);
      const e = claimAt(app, other, 'DATA_GATHERING');
      app.db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at, submitted_assessment_id) VALUES (?,?,?,?,?,?)',
        [randomUUID(), JSON.stringify({ current_year_position: 'breakeven' }), 'done', T0, T0, other.assessment]);
      const q = F.factsPanel(app.db, actor('SALES'), e, app.now(), { store: null });
      assert.equal(q.taxable_profit.sufficient_profit.known, false);
      assert.equal(q.taxable_profit.sufficient_profit.capturable, true);
      assert.equal(F.recordFact(d, actor('SALES'), e, { fact_key: 'SUFFICIENT_PROFIT', answer: 'VALUE', value: 'NO', source_id: 'CTA' }).ok, true);
    } finally { app.close(); }
  });

  test('N4 — a recorded UNKNOWN and a fact never asked read identically; a value carries its source; no required field forces a guess', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DATA_GATHERING');
      const d = CF.recordDeps(app);
      const read = () => F.factsPanel(app.db, actor('ADMIN'), c, app.now(), { store: null }).accounting_period.end;
      const never = read();
      assert.deepEqual([never.known, never.value, never.display, never.source], [false, null, F.NOT_KNOWN, null]);
      assert.equal(F.recordFact(d, actor('SALES'), c, { fact_key: 'ACCOUNTING_PERIOD_END', answer: 'UNKNOWN', source_id: 'CLIENT_ANSWER' }).ok, true);
      const unsure = read();
      assert.deepEqual([unsure.known, unsure.value, unsure.display], [never.known, never.value, never.display], 'not known and never asked read differently');
      assert.equal(unsure.source?.source_id, 'CLIENT_ANSWER');

      for (const [why, input] of [
        ['no answer', { fact_key: 'ACCOUNTING_PERIOD_END', source_id: 'CLIENT_ANSWER', value: '2025-12-31' }],
        ['no source', { fact_key: 'ACCOUNTING_PERIOD_END', answer: 'VALUE', value: '2025-12-31' }],
        ['not a date', { fact_key: 'ACCOUNTING_PERIOD_END', answer: 'VALUE', value: '31/12/2025', source_id: 'CLIENT_ANSWER' }],
        ['a zero', { fact_key: 'POOL_SPLIT_MAIN', answer: 'VALUE', value: '0', source_id: 'CLIENT_ANSWER' }],
        ['not a choice', { fact_key: 'ELECTION_EXISTS', answer: 'VALUE', value: 'MAYBE', source_id: 'CLIENT_ANSWER' }],
        ['not a fact', { fact_key: 'THE_ESTIMATE', answer: 'VALUE', value: '1', source_id: 'CLIENT_ANSWER' }],
      ] as const) {
        assert.equal(F.recordFact(d, actor('SALES'), c, input).ok, false, `${why} was taken`);
      }
      assert.equal(F.recordFact(d, actor('SALES'), c, { fact_key: 'ACCOUNTING_PERIOD_END', answer: 'VALUE', value: '2025-12-31', source_id: 'CLIENT_DOC' }).ok, true);
      const known = read();
      assert.deepEqual([known.known, known.value, known.source?.source_id, known.source?.prov], [true, '2025-12-31', 'CLIENT_DOC', 'CD']);
      assert.throws(() => F.recordFact(d, actor('ACCOUNTING'), c, { fact_key: 'ACCOUNTING_PERIOD_END', answer: 'UNKNOWN', source_id: 'CTA' }), NotAuthorised);
      assert.throws(() => F.factsPanel(app.db, actor('ACCOUNTING'), c, app.now()), NotAuthorised);
    } finally { app.close(); }
  });

  test('the store — append-only, never a zero, never a value beside UNKNOWN, never a key off the list', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DATA_GATHERING');
      const ins = (key: string, answer: string, pence: number | null) => app.db.run(
        'INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) VALUES (?,?,?,?,NULL,?,NULL,?,NULL,?,?)',
        [randomUUID(), c, key, answer, pence, 'CTA', 'u-SALES', T0]);
      assert.throws(() => ins('POOL_SPLIT_MAIN', 'VALUE', 0));
      assert.throws(() => ins('POOL_SPLIT_MAIN', 'UNKNOWN', 100));
      assert.throws(() => ins('NOT_A_FACT', 'UNKNOWN', null), /not a fact the claim captures/);
      ins('POOL_SPLIT_MAIN', 'VALUE', 100);
      assert.throws(() => app.db.run("UPDATE claim_facts SET answer = 'UNKNOWN'"), /append-only/);
      assert.throws(() => app.db.run('DELETE FROM claim_facts'), /append-only/);
    } finally { app.close(); }
  });

  test('the prior owner chain and the grants — never a person’s name, traced only with its elements, withdrawn and never deleted', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DATA_GATHERING');
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      assert.equal(F.recordOwner(d, sales, c, { position: '1', owner: 'Jane Smith', claimed: 'YES', source_id: 'CLIENT_DOC' }).ok, false, 'a person was named');
      const o = F.recordOwner(d, sales, c, { position: '1', owner: 'Seller Holdings Limited', claimed: 'UNKNOWN', source_id: 'CLIENT_DOC' });
      assert.equal(o.ok, true, o.ok ? '' : o.why);
      assert.equal(F.recordOwner(d, sales, c, { position: '1', owner: 'INDIVIDUAL_NOT_RECORDED', claimed: 'NO', source_id: 'CLIENT_DOC' }).ok, false, 'two owners at one position');
      assert.equal(F.withdrawOwner(d, sales, c, o.ok ? o.id : '').ok, true);
      assert.equal(F.recordOwner(d, sales, c, { position: '1', owner: 'INDIVIDUAL_NOT_RECORDED', claimed: 'NO', source_id: 'CLIENT_DOC' }).ok, true);
      assert.throws(() => app.db.run('DELETE FROM claim_owner_chain'), /never deleted/);

      assert.equal(F.recordGrant(d, sales, c, { kind: 'GRANT', payer_class: 'nhs', traced: 'YES', source_id: 'CLIENT_DOC' }).ok, false, 'traced with no elements');
      assert.equal(F.recordGrant(d, sales, c, { kind: 'GRANT', payer_class: 'Dr Patel', traced: 'NO', source_id: 'CLIENT_DOC' }).ok, false, 'a payer named');
      assert.equal(F.recordGrant(d, sales, c, { kind: 'GRANT', payer_class: 'nhs', amount: '0', traced: 'NO', source_id: 'CLIENT_DOC' }).ok, false, 'a grant of nothing');
      const g = F.recordGrant(d, sales, c, { kind: 'GRANT', payer_class: 'nhs', traced: 'YES', traced_elements: 'fire alarm; nurse call', source_id: 'CLIENT_DOC' });
      assert.equal(g.ok, true, g.ok ? '' : g.why);
      assert.equal(F.withdrawGrant(d, sales, c, g.ok ? g.id : '', null).ok, false, 'a withdrawal with no reason');
      assert.equal(F.withdrawGrant(d, sales, c, g.ok ? g.id : '', 'recorded twice').ok, true);
      assert.throws(() => app.db.run("UPDATE claim_grants SET traced = 'NO'"), /withdrawn once/);
      assert.throws(() => app.db.run('DELETE FROM claim_grants'), /never deleted/);
    } finally { app.close(); }
  });

  test('SURVEYING receives the released inputs alone, built forwards by src/payload.ts — no amount, window, profit position or figure', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      CF.commitmentOn(app, org.business, org.assessment, c);
      app.db.run(
        'INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
          'bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), org.assessment, org.business, 123_456_78, 0.3141, 111_111_11, 22_222_22, 3_333_33, 1.7777, 44_444_44, T0, 'e'.repeat(64)]);
      CF.fact(app, c, 'ELECTION_EXISTS', 'YES');
      CF.fact(app, c, 'ELECTION_VALUE', '98765.43');
      CF.fact(app, c, 'TRANSACTION_TAX', '87654.32');
      CF.fact(app, c, 'POOL_SPLIT_MAIN', '76543.21');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2025-12-31');

      const view = C.claimView(app.db, actor('SURVEYING'), c, { store: null, now: app.now() });
      assert.ok(view.facts !== undefined && 'released_to_surveyor' in view.facts, 'the surveyor received no released facts, or the whole panel');
      assert.deepEqual(Object.keys(view.facts.facts).sort(), [...RELEASED_FACTS_TO_SURVEYOR].sort());
      for (const k of ['figures', 'deliverables', 'aftercare', 'value']) assert.equal(k in view, false, `the surveyor received ${k}`);
      const wire = JSON.stringify(view);
      // Amounts are drawn in whole pounds (src/web/shown-range.ts), so the search looks for what a screen would show AND for the pence.
      for (const bad of ['£98,765', '9876543', '£87,654', '8765432', '£76,543', '7654321', '2025-12-31', '12345678', '£123,457', '0.3141', '1.7777']) {
        assert.equal(wire.includes(bad), false, `the surveyor’s view carries ${bad}`);
      }
      // THE NEGATIVE CONTROL: the same claim, as SALES, carries the amounts and the estimate — the search can find them.
      const sales = JSON.stringify(C.claimView(app.db, actor('SALES'), c, { store: null, now: app.now() }));
      for (const good of ['£98,765', '£87,654', '£76,543', '2025-12-31']) assert.equal(sales.includes(good), true, `SALES’s view lacks ${good} — the search is blind`);
      assert.ok([...scalars(JSON.parse(sales) as unknown)].includes(123_456_78), 'SALES’s view lacks the sealed estimate');
      // ACCOUNTING returns before any of it is built.
      const acc = C.claimView(app.db, actor('ACCOUNTING'), c, { store: null, now: app.now() });
      for (const k of ['facts', 'figures', 'deliverables', 'aftercare']) assert.equal(k in acc, false, `ACCOUNTING received ${k}`);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE GATES THE FACTS DECIDE — the unsure answer AND the absent one
 * ================================================================== */

describe('THE GATES THE FACTS DECIDE — N4 on every one: the recorded UNKNOWN and the absent row both refuse', () => {
  test('DATA_GATHERING: the election — absent, UNKNOWN, a YES missing a part, a notice the clock cannot test and a late notice all refuse; NO passes; a YES notified in time passes', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'DATA_GATHERING');
      confirm(app, c, 'DATA_GATHERING_COMPLETE');
      CF.mustArriveDocuments(app, org.business, c); // Phase 151b: so what shuts the gate below is the election alone
      const resolved = () => F.electionResolved(app.db, { id: c, property_id: org.property }).met;
      assert.equal(resolved(), false, 'ABSENT passed');
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false);
      CF.fact(app, c, 'ELECTION_EXISTS', null);
      assert.equal(resolved(), false, 'UNKNOWN passed');
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false);
      CF.fact(app, c, 'ELECTION_EXISTS', 'YES');
      assert.equal(resolved(), false, 'a YES with nothing recorded passed');
      CF.fact(app, c, 'ELECTION_SECTION', 'S198');
      CF.fact(app, c, 'ELECTION_VALUE', '1');
      CF.fact(app, c, 'ELECTION_ELEMENTS', 'all fixtures in the sale schedule');
      CF.fact(app, c, 'ELECTION_NOTIFIED_ON', null);
      assert.equal(resolved(), false, 'a notice recorded as not known passed');
      CF.fact(app, c, 'ELECTION_NOTIFIED_ON', '2025-09-01');
      assert.equal(resolved(), false, 'a notice with no acquisition date to test it against passed');
      app.db.run("UPDATE properties SET acquisition_date = '2022-06-01' WHERE id = ?", [org.property]);
      assert.equal(F.electionResolved(app.db, { id: c, property_id: org.property }).in_time, false);
      assert.equal(resolved(), false, 'a notice outside the two-year limit passed');
      // s.201(1A): an undetermined tribunal application lodged in time disapplies the limit — its status NOT KNOWN does not.
      CF.fact(app, c, 'ELECTION_TRIBUNAL_APPLIED_ON', '2024-01-01');
      assert.equal(resolved(), false, 'a tribunal application whose status was NEVER ASKED relieved the late notice');
      CF.fact(app, c, 'ELECTION_TRIBUNAL_STATUS', null);
      assert.equal(resolved(), false, 'a tribunal application whose status is NOT KNOWN relieved the late notice');
      CF.fact(app, c, 'ELECTION_TRIBUNAL_STATUS', 'UNDETERMINED');
      assert.equal(resolved(), true, 'an undetermined tribunal application lodged in time did not disapply the limit');
      CF.fact(app, c, 'ELECTION_TRIBUNAL_STATUS', 'DETERMINED');
      assert.equal(resolved(), false, 'a determined application still disapplied the limit');
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false);
      app.db.run("UPDATE properties SET acquisition_date = '2025-06-01' WHERE id = ?", [org.property]);
      assert.equal(resolved(), true);
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, true);

      // And a recorded NO passes on its own.
      const other = claimAt(app, organisation(app), 'DATA_GATHERING');
      CF.noElection(app, other);
      assert.equal(F.electionResolved(app.db, { id: other, property_id: null }).met, true);
    } finally { app.close(); }
  });

  test('VALUATION: every grant traced — absent, UNKNOWN, a YES with none recorded, and a grant not traced or not known all refuse; a NO with a grant still recorded refuses', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'VALUATION');
      confirm(app, c, 'VALUATION_SIGNED');
      const d = CF.recordDeps(app);
      const traced = () => F.grantsTraced(app.db, c).met;
      assert.equal(traced(), false, 'ABSENT passed');
      CF.fact(app, c, 'GRANTS_EXIST', null);
      assert.equal(traced(), false, 'UNKNOWN passed');
      CF.fact(app, c, 'GRANTS_EXIST', 'YES');
      assert.equal(traced(), false, 'a YES with no grant recorded passed');
      const g = F.recordGrant(d, actor('SALES'), c, { kind: 'CONTRIBUTION', payer_class: 'landlord_unconnected', traced: 'UNKNOWN', source_id: 'CLIENT_DOC' });
      assert.equal(g.ok, true);
      assert.equal(traced(), false, 'a grant not known to be traced passed');
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, false);
      CF.fact(app, c, 'GRANTS_EXIST', 'NO');
      assert.equal(traced(), false, 'a NO with a grant still recorded passed');
      assert.equal(F.withdrawGrant(d, actor('SALES'), c, g.ok ? g.id : '', 'the lease shows it was a loan').ok, true);
      assert.equal(traced(), true);
      CF.fact(app, c, 'GRANTS_EXIST', 'YES');
      assert.equal(F.recordGrant(d, actor('SALES'), c, { kind: 'GRANT', payer_class: 'nhs', traced: 'YES', traced_elements: 'nurse call', source_id: 'CLIENT_DOC' }).ok, true);
      assert.equal(traced(), true);
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, true);
    } finally { app.close(); }
  });

  test('THE AMENDMENT WINDOW: UNKNOWN whenever the acquisition date or the accounting period is — recorded as not known or never asked — and on an unknown claimant or a date outside the period; the engine’s own dates otherwise', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'REPORTS');
      const w = () => F.amendmentWindowReading(app.db, { id: c, business_id: org.business, property_id: org.property }, app.now());
      assert.equal(w().state, 'UNKNOWN', 'nothing at all was a window');
      app.db.run("UPDATE businesses SET claimant_type = 'COMPANY' WHERE id = ?", [org.business]);
      CF.fact(app, c, 'ACCOUNTING_PERIOD_START', '2025-01-01');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2025-12-31');
      assert.equal(w().state, 'UNKNOWN', 'an ABSENT acquisition date was a window');
      app.db.run("UPDATE properties SET acquisition_date = '2025-06-01' WHERE id = ?", [org.property]);
      assert.equal(w().state, 'OPEN');
      assert.equal(w().deadline, '2027-12-31');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', null);
      assert.equal(w().state, 'UNKNOWN', 'an accounting period recorded as NOT KNOWN was a window');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2025-12-31');
      app.db.run("UPDATE properties SET acquisition_date = '2024-06-01' WHERE id = ?", [org.property]);
      assert.equal(w().state, 'UNKNOWN', 'an acquisition outside the recorded period was a window');
      app.db.run("UPDATE properties SET acquisition_date = '2025-06-01' WHERE id = ?", [org.property]);
      for (const unknown of ['UNKNOWN', 'CHARITY']) {
        app.db.run('UPDATE businesses SET claimant_type = ? WHERE id = ?', [unknown, org.business]);
        assert.equal(w().state, 'UNKNOWN', `a ${unknown} claimant was a window`);
      }
      app.db.run('UPDATE businesses SET claimant_type = NULL WHERE id = ?', [org.business]);
      assert.equal(w().state, 'UNKNOWN', 'a claimant never recorded was a window');
      // Self assessment: a period ending 31 March 2025 files by 31 January 2026 and amends by 31 January 2027.
      app.db.run("UPDATE businesses SET claimant_type = 'SOLE_TRADER' WHERE id = ?", [org.business]);
      CF.fact(app, c, 'ACCOUNTING_PERIOD_START', '2024-04-01');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2025-03-31');
      app.db.run("UPDATE properties SET acquisition_date = '2024-06-01' WHERE id = ?", [org.property]);
      assert.deepEqual([w().state, w().deadline], ['OPEN', '2027-01-31']);
      // A company whose window closed.
      app.db.run("UPDATE businesses SET claimant_type = 'COMPANY' WHERE id = ?", [org.business]);
      CF.fact(app, c, 'ACCOUNTING_PERIOD_START', '2023-01-01');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2023-12-31');
      app.db.run("UPDATE properties SET acquisition_date = '2023-06-01' WHERE id = ?", [org.property]);
      assert.deepEqual([w().state, w().deadline], ['CLOSED', '2025-12-31']);
    } finally { app.close(); }
  });

  test('THE AMENDMENT WINDOW ON THE GATES: REPORTS needs it OPEN; INVOICE needs the filing inside it — UNKNOWN passes neither, whether recorded or absent', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = signedClaim(app, org);
      const reports = (today?: string) => need(app, c, 'REPORTS', 'The amendment window is open', today);
      const invoice = (today?: string) => need(app, c, 'INVOICE', 'The claim is within the amendment window', today);
      assert.equal(reports(app.now())?.met, false, 'REPORTS passed on an ABSENT window');
      assert.equal(invoice(app.now())?.met, false, 'INVOICE passed on an ABSENT window');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_START', null);
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', null);
      app.db.run("UPDATE businesses SET claimant_type = 'COMPANY' WHERE id = ?", [org.business]);
      app.db.run("UPDATE properties SET acquisition_date = '2025-06-01' WHERE id = ?", [org.property]);
      assert.equal(reports(app.now())?.met, false, 'REPORTS passed on a period recorded as NOT KNOWN');
      assert.equal(invoice(app.now())?.met, false, 'INVOICE passed on a period recorded as NOT KNOWN');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_START', '2025-01-01');
      CF.fact(app, c, 'ACCOUNTING_PERIOD_END', '2025-12-31');
      assert.equal(reports(app.now())?.met, true);
      assert.equal(invoice(app.now())?.met, true, 'an open window with no filing did not pass INVOICE');
      // After the window has closed: no filing recorded refuses; a filing recorded inside the window passes.
      assert.equal(invoice('2028-06-01T12:00:00.000Z')?.met, false, 'a closed window with no filing passed');
      assert.equal(R.recordFiling(CF.recordDeps(app), actor('SALES'), c, { filed_on: '2026-09-01' }).ok, true);
      assert.equal(invoice('2028-06-01T12:00:00.000Z')?.met, true, 'a claim filed inside the window was refused its fee');
      assert.equal(reports('2028-06-01T12:00:00.000Z')?.met, false, 'REPORTS passed on a closed window');
    } finally { app.close(); }
  });

  test('the confirmations CRM 2 of 10 left: DEFENCE_PACK’s is retired and refused, and the others no longer name what a fact now decides', () => {
    assert.ok(P.MILESTONES.DEFENCE_PACK_COMPLETE.retired);
    assert.equal(/election/i.test(P.MILESTONES.DATA_GATHERING_COMPLETE.label), false);
    assert.equal(/grant/i.test(P.MILESTONES.VALUATION_SIGNED.label), false);
    for (const k of ['DATA_GATHERING_COMPLETE', 'VALUATION_SIGNED', 'CLIENT_ACCEPTED_REPORT', 'ACCOUNTANT_CONFIRMED_RETURN'] as const) {
      assert.equal(P.MILESTONES[k].retired, undefined, `${k} was retired though nothing derives it`);
    }
  });
});

/* ================================================================== *
 * THE SIGN-OFF RECORD
 * ================================================================== */

describe('THE SIGN-OFF RECORD — a record, not a signature, and the gate opens only on it', () => {
  test('refused off its stage, with no commitment on this claim, with a person’s name, without its scope, method or figure, dated ahead, or confirming a switch that does not exist', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const d = CF.recordDeps(app);
      const base = {
        adviser: 'Invented Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
        method_note: 'reviewed', figure: '2400000', confirmed_switches: '',
      };
      const early = claimAt(app, org, 'VALUATION');
      CF.commitmentOn(app, org.business, org.assessment, early);
      assert.equal(R.recordSignOff(d, actor('SALES'), early, base).ok, false, 'a sign-off off its stage');
      const c = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      const other = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      CF.commitmentOn(app, org.business, org.assessment, other);
      assert.equal(R.recordSignOff(d, actor('SALES'), c, base).ok, false, 'a sign-off against another claim’s commitment');
      CF.commitmentOn(app, org.business, org.assessment, c);
      for (const [why, change] of [
        ['a person named', { adviser: 'Jane Smith' }],
        ['an owner role for an adviser', { adviser: 'DEVELOPER' }],
        ['no scope', { scope: '' }],
        ['no method', { method_note: '' }],
        ['a figure of nothing', { figure: '0' }],
        ['no credential', { credential: '' }],
        ['a date ahead', { signed_on: '2027-01-01' }],
        ['a switch that does not exist', { confirmed_switches: 'turn_everything_on' }],
      ] as const) {
        assert.equal(R.recordSignOff(d, actor('SALES'), c, { ...base, ...change }).ok, false, `${why} was taken`);
      }
      assert.throws(() => R.recordSignOff(d, actor('ACCOUNTING'), c, base), NotAuthorised);
      assert.throws(() => R.recordSignOff(d, actor('SURVEYING'), c, base), NotAuthorised);
      const ok = R.recordSignOff(d, actor('SALES'), c, { ...base, adviser: 'Ledger Tax Advisers LLP', confirmed_switches: 'transaction_tax_in_base' });
      assert.equal(ok.ok, true, ok.ok ? '' : ok.why);
      const row = app.db.get<{ kind: string; record_hash: string; switch_readings_json: string }>('SELECT kind, record_hash, switch_readings_json FROM tax_adviser_signoffs WHERE claim_id = ?', [c]);
      assert.equal(row?.kind, 'RECORD_NOT_A_SIGNATURE');
      assert.match(row?.record_hash ?? '', /^[0-9a-f]{64}$/);
      assert.deepEqual(JSON.parse(row?.switch_readings_json ?? '[]'), [{ switch: 'transaction_tax_in_base', on: false }]);
      assert.throws(() => app.db.run("UPDATE tax_adviser_signoffs SET scope = 'more'"), /never changes/);
      assert.throws(() => app.db.run('DELETE FROM tax_adviser_signoffs'), /never deleted/);
      const line = app.audit.entries().find((e) => e.kind === 'TAX_SIGNOFF_RECORDED');
      assert.ok(line);
      assert.equal(JSON.stringify(line.detail).includes('Ledger'), false, 'the adviser reached the audit log');
      assert.equal(app.audit.verify().intact, true);
    } finally { app.close(); }
  });

  test('THE GATE OPENS ONLY ON THE RECORD — not the retired column, not a confirmation, not another claim’s record, not a record from before a reopen', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      CF.commitmentOn(app, org.business, org.assessment, c);
      assert.equal(fwd(app, 'ADMIN', c, 'REPORTS').ok, false);
      assert.throws(() => app.db.run('UPDATE claims SET tax_adviser_signoff_at = ? WHERE id = ?', [T0, c]), /E_SIGNOFF_IS_A_RECORD/);
      assert.equal(P.recordMilestone(CF.recordDeps(app), actor('ADMIN'), c, 'VALUATION_SIGNED', null).ok, false);
      const elsewhere = signedClaim(app, org);
      assert.ok(elsewhere);
      assert.equal(fwd(app, 'ADMIN', c, 'REPORTS').ok, false, 'another claim’s sign-off opened this gate');

      const d = CF.recordDeps(app);
      const sign = () => R.recordSignOff(d, actor('SALES'), c, {
        adviser: 'Invented Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the claim', method_note: 'reviewed', figure: '1000',
      });
      assert.equal(sign().ok, true);
      assert.equal(fwd(app, 'SALES', c, 'REPORTS').ok, true);

      // A reopen back to the sign-off invalidates the record made before it; a fresh one opens it again.
      assert.equal(P.moveClaim(d, actor('ADMIN'), c, { kind: 'REOPEN', to: 'TAX_ADVISER_SIGNOFF', reason: 'the scope was wrong' }).ok, true);
      assert.equal(P.gateOut(app.db, P.loadPipelineClaim(app.db, c), 'TAX_ADVISER_SIGNOFF').open, false, 'a sign-off from before the reopen still counted');
      assert.equal(P.claimableFigureReleased(app.db, P.loadPipelineClaim(app.db, c)).released, false);
      assert.equal(sign().ok, true);
      assert.equal(P.gateOut(app.db, P.loadPipelineClaim(app.db, c), 'TAX_ADVISER_SIGNOFF').open, true);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE FOUR FIGURES AND THE RECONCILIATION
 * ================================================================== */

describe('THE FOUR FIGURES — sealed and read from the record that sealed each; B not permitted; the reconciliation in the design’s schema', () => {
  test('A from the sealed estimate, B NOT_PERMITTED_YET naming the shut gate, C the commitment, D the sign-off — each with its hash — and nobody but ADMIN and SALES reads them', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      app.db.run(
        'INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
          'bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), org.assessment, org.business, 300_000_00, 0.3, 200_000_00, 100_000_00, 50_000_00, 1.5, 70_000_00, T0, 'e'.repeat(64)]);
      const c = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      const read = () => R.figuresPanel(app.db, actor('SALES'), c, app.now());
      let p = read();
      assert.equal(p.a_indicative.state, 'SEALED');
      assert.equal(p.a_indicative.state === 'SEALED' ? p.a_indicative.hash : '', 'e'.repeat(64));
      assert.equal(p.b_researched.state, 'NOT_PERMITTED_YET');
      assert.match(p.b_researched.why, /Free lookups are off/);
      assert.match(p.b_researched.why, /Paid lookups wait/);
      assert.equal(p.c_surveyor.state, 'NOT_YET');
      assert.equal(p.d_adviser.state, 'NOT_YET');
      assert.equal(p.claimable_figure.released, false);
      app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SIGNED', ?, ?)", [randomUUID(), org.business, T0, T0]);
      signatureRecordFor(app.db, org.business, T0);
      p = read();
      assert.equal(p.b_researched.state, 'NOT_PERMITTED_YET', 'a signed letter alone permitted the researched estimate');
      assert.doesNotMatch(p.b_researched.why, /Paid lookups wait/);
      assert.equal('value' in p.b_researched || 'figure' in p.b_researched, false, 'B carried a figure');

      CF.commitmentOn(app, org.business, org.assessment, c);
      assert.equal(R.recordSignOff(CF.recordDeps(app), actor('SALES'), c, {
        adviser: 'Invented Tax Advisers LLP', credential: 'CTA', signed_on: '2026-09-01', scope: 's', method_note: 'm', figure: '240000',
      }).ok, true);
      p = read();
      assert.equal(p.c_surveyor.state, 'SEALED');
      assert.equal(p.d_adviser.state, 'SEALED');
      assert.equal(p.d_adviser.state === 'SEALED' ? p.d_adviser.figure : '', '£240,000');
      assert.equal(p.claimable_figure.released, true);
      for (const who of ['ACCOUNTING', 'SURVEYING', 'CLIENT'] as const) {
        assert.throws(() => R.figuresPanel(app.db, actor(who, `u-${who}`, org.business), c, app.now()), NotAuthorised, `${who} read the figures`);
      }
      // No column anywhere can hold a researched estimate, and no fourth copy of a figure exists.
      const tables = app.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((t) => t.name);
      assert.equal(tables.some((t) => /figure/i.test(t)), false, 'a figures table was created');
      for (const t of tables) {
        const cols = app.db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [t]).map((x) => x.name);
        assert.equal(cols.some((x) => /research(ed)?_estimate|estimate_b\b/i.test(x)), false, `${t} has a column for the researched estimate`);
      }
    } finally { app.close(); }
  });

  test('THE RECONCILIATION opens with the first sign-off; its snapshot is fixed; the quote gap is NOT KNOWN and never zero; the variance is tagged before the case closes; the outcome is derived from the enquiry or the lapsed window', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = signedClaim(app, org, '240000');
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      const row = () => app.db.get<{ status: string; b_value_pence: number | null; c_value_pence: number; resolution_path: string | null; d_value_pence: number | null; hmrc_enquiry_opened: number | null }>(
        'SELECT status, b_value_pence, c_value_pence, resolution_path, d_value_pence, hmrc_enquiry_opened FROM claim_reconciliations WHERE claim_id = ?', [c]);
      assert.deepEqual({ ...row() }, { status: 'OPEN_OUTCOME_PENDING', b_value_pence: null, c_value_pence: 240_000_00, resolution_path: null, d_value_pence: null, hmrc_enquiry_opened: null });
      assert.throws(() => app.db.run('UPDATE claim_reconciliations SET c_value_pence = 1'), /snapshot is fixed/);
      assert.throws(() => app.db.run('DELETE FROM claim_reconciliations'), /never deleted/);
      const v = R.reconciliationView(app.db, c, app.now());
      assert.equal(v?.variance.quote_gap, 'not known');
      assert.equal(v?.variance.review_required, true);

      assert.equal(R.recordOutcome(d, sales, c, {}).ok, false, 'a case closed with no variance tag');
      assert.equal(R.recordVariance(d, sales, c, { variance_category: 'NOT_ON_THE_TAXONOMY' }).ok, false);
      assert.equal(R.recordVariance(d, sales, c, { variance_category: 'SURVEY_FINDING', variance_notes: 'more plant found' }).ok, true);
      assert.equal(R.recordVariance(d, sales, c, { variance_category: 'SCOPE_CHANGE' }).ok, false, 'the tag changed');
      assert.equal(R.recordOutcome(d, sales, c, {}).ok, false, 'an outcome with no filing and no enquiry');
      assert.equal(R.recordFiling(d, sales, c, { filed_on: '2026-09-01' }).ok, true);
      assert.equal(R.recordFiling(d, sales, c, { filed_on: '2026-09-02' }).ok, false, 'the filing changed');
      assert.equal(R.recordOutcome(d, sales, c, {}).ok, false, 'an outcome before the enquiry window lapsed');
      const e = R.openEnquiry(d, sales, c, { opened_on: '2026-09-05' });
      assert.equal(e.ok, true);
      assert.equal(R.recordOutcome(d, sales, c, {}).ok, false, 'an outcome while an enquiry is open');
      assert.equal(R.closeEnquiry(d, sales, c, e.ok ? e.id : '', { closed_on: '2026-09-07', outcome: 'AMENDED_DOWN', amended_figure: '200000' }).ok, true);
      assert.equal(R.recordOutcome(d, sales, c, { amount_realised: '0' }).ok, false, 'an amount realised of nothing');
      assert.equal(R.recordOutcome(d, sales, c, {}).ok, true);
      assert.deepEqual({ ...row() }, {
        status: 'RECONCILED', b_value_pence: null, c_value_pence: 240_000_00, resolution_path: 'ENQUIRY_AGREED_REDUCED', d_value_pence: 200_000_00, hmrc_enquiry_opened: 1,
      });
      const after = R.reconciliationView(app.db, c, app.now());
      assert.equal(after?.variance.delivery_gap, '−£40,000');
      assert.equal(after?.variance.quote_gap, 'not known', 'a range became a quoted figure');
      assert.equal(R.recordOutcome(d, sales, c, {}).ok, false, 'the outcome changed');

      // NO ENQUIRY: the outcome is the window lapsing, twelve months after the filing.
      const lapsed = signedClaim(app, organisation(app), '100000');
      assert.equal(R.recordVariance(d, sales, lapsed, { variance_category: 'ENGINE_READ' }).ok, true);
      assert.equal(R.recordFiling(d, sales, lapsed, { filed_on: '2025-06-01' }).ok, true);
      assert.equal(R.recordOutcome(d, sales, lapsed, {}).ok, true);
      assert.equal(app.db.get<{ p: string }>('SELECT resolution_path AS p FROM claim_reconciliations WHERE claim_id = ?', [lapsed])?.p, 'NO_ENQUIRY_WINDOW_LAPSED');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE DELIVERABLES REGISTER
 * ================================================================== */

describe('THE DELIVERABLES REGISTER — tracked, never generated', () => {
  test('a kind with no row reads NOT_STARTED; draft, issued, superseded, forward only; a report stating a figure waits for the sign-off; one draft at a time; nothing deleted; none can be stored yet', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'REPORTS');
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      const line = (kind: R.DeliverableKind) => R.deliverablesPanel(app.db, sales, c).lines.find((l) => l.kind === kind);
      assert.equal(line('CLIENT_REPORT')?.state, 'NOT_STARTED');
      assert.match(line('CLIENT_REPORT')?.stored ?? '', /cannot be stored yet/);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'DRAFT' }).ok, false, 'a report stating a figure drafted before the sign-off');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'ACCOUNTANT_COMPUTATION_PACK', action: 'DRAFT' }).ok, false);
      CF.signOffRow(app, org.business, org.assessment, c);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-01' }).ok, false, 'issued with no draft');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'DRAFT' }).ok, true);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'DRAFT' }).ok, false, 'two drafts at once');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2027-01-01' }).ok, false, 'issued ahead of today');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-01', content_hash: 'not-a-hash' }).ok, false);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-01' }).ok, true);
      assert.equal(line('CLIENT_REPORT')?.state, 'ISSUED');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'DRAFT' }).ok, true);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-02' }).ok, true);
      const versions = app.db.all<{ version: number; state: string }>("SELECT version, state FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' ORDER BY version", [c]);
      assert.deepEqual(versions.map((x) => [x.version, x.state]), [[1, 'SUPERSEDED'], [2, 'ISSUED']]);
      assert.throws(() => app.db.run("UPDATE claim_deliverables SET state = 'DRAFT' WHERE version = 1"), /moves forward only/);
      assert.throws(() => app.db.run('DELETE FROM claim_deliverables'), /never deleted/);
      assert.throws(() => R.recordDeliverable(d, actor('ACCOUNTING'), c, { kind: 'REASONED_NEGATIVE', action: 'DRAFT' }), NotAuthorised);
      assert.throws(() => R.deliverablesPanel(app.db, actor('SURVEYING'), c), NotAuthorised);
    } finally { app.close(); }
  });

  test('AN ISSUED DEFENCE PACK IS IMMUTABLE AND ITS HASH IS RECORDED — refused without one, and never superseded or changed after', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DEFENCE_PACK');
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'DEFENCE_PACK', action: 'DRAFT' }).ok, true);
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: '2026-09-01' }).ok, false, 'a defence pack issued without its hash');
      assert.equal(R.recordDeliverable(d, sales, c, { kind: 'DEFENCE_PACK', action: 'ISSUE', issued_on: '2026-09-01', content_hash: 'b'.repeat(64) }).ok, true);
      assert.throws(() => app.db.run("UPDATE claim_deliverables SET state = 'SUPERSEDED' WHERE kind = 'DEFENCE_PACK'"));
      assert.throws(() => app.db.run("UPDATE claim_deliverables SET content_hash = ? WHERE kind = 'DEFENCE_PACK'", ['c'.repeat(64)]));
      CF.issue(app, c, 'DEFENCE_PACK', 'd'.repeat(64));
      const packs = app.db.all<{ version: number; state: string; content_hash: string }>("SELECT version, state, content_hash FROM claim_deliverables WHERE kind = 'DEFENCE_PACK' ORDER BY version", [c].slice(1));
      assert.deepEqual(packs.map((x) => [x.version, x.state, x.content_hash]), [[1, 'ISSUED', 'b'.repeat(64)], [2, 'ISSUED', 'd'.repeat(64)]]);
    } finally { app.close(); }
  });

  test('THE CLIENT REPORT IS RELEASED TO ITS CLIENT IN can() ONLY ONCE THE SIGN-OFF RECORD EXISTS — both ways, on the document and on the register', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'REPORTS');
      const client = actor('CLIENT', 'u-client', org.business);
      // Written as rows: no CA_REPORT can be uploaded — its type has no receipt policy — so the document is a fixture.
      const doc = randomUUID();
      app.db.run("INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, 'CA_REPORT', 1, 'u-SALES', ?)", [doc, org.business, T0]);
      const dl = randomUUID();
      app.db.run(
        "INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, created_by, created_at, updated_by, updated_at) VALUES (?, ?, 'CLIENT_REPORT', 1, 'CA_REPORT', 'DRAFT', 'u-SALES', ?, 'u-SALES', ?)",
        [dl, c, T0, T0]);
      app.db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = '2026-09-01', logical_document_id = ? WHERE id = ?", [doc, dl]);
      const obj = () => D.documentObj(app.db, { id: doc, business_id: org.business, readers: 'CLAIM_TEAM', carries_value: 1 });

      assert.equal(obj().released_to_client, false);
      assert.equal(can(client, 'document.read', obj()), false, 'an issued report reached its client before the sign-off');
      assert.deepEqual(R.clientDeliverables(app.db, client, org.business), [], 'the register listed the report before the sign-off');

      CF.signOffRow(app, org.business, org.assessment, c);
      assert.equal(obj().released_to_client, true);
      assert.equal(can(client, 'document.read', obj()), true);
      assert.deepEqual(R.clientDeliverables(app.db, client, org.business).map((x) => x.label), ['The client report']);
      assert.equal(can(actor('CLIENT', 'u-other', 'b-somebody-else'), 'document.read', obj()), false, 'another client read it');
      assert.equal(can(actor('SURVEYING'), 'document.read', obj()), false);
      assert.equal(can(actor('ACCOUNTING'), 'document.read', obj()), false);
      assert.equal(JSON.stringify(R.clientDeliverables(app.db, client, org.business)).includes('£'), false, 'the client’s list carries a figure');
    } finally { app.close(); }
  });

  test('THE REASONED NEGATIVE is told to the client through its deliverable — the portal’s stage is unmoved and no stage is invented', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'DATA_GATHERING');
      const client = actor('CLIENT', 'u-client', org.business);
      const stageBefore = app.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [org.business])?.stage;
      const exit = P.moveClaim(CF.recordDeps(app), actor('SALES'), c, { kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'ELECTION_UNRESOLVED' });
      assert.equal(exit.ok, true, exit.ok ? '' : exit.why);
      assert.equal(app.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [org.business])?.stage, stageBefore, 'the portal’s stage moved on an exit');
      assert.deepEqual(R.clientDeliverables(app.db, client, org.business), [], 'the client was told before anything was issued');
      CF.issue(app, c, 'REASONED_NEGATIVE');
      assert.deepEqual(R.clientDeliverables(app.db, client, org.business).map((x) => x.label), ['The reasoned negative']);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * AFTERCARE
 * ================================================================== */

describe('AFTERCARE — HMRC enquiries, clause 13 and the Disposal Note', () => {
  test('an enquiry opens once and closes once, carries its figure when amended, and its correspondence cannot be stored yet', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DEFENCE_PACK');
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      assert.equal(R.openEnquiry(d, sales, c, { opened_on: '2027-01-01' }).ok, false, 'opened ahead of today');
      const e = R.openEnquiry(d, sales, c, { opened_on: '2026-09-01' });
      assert.equal(e.ok, true);
      assert.equal(R.openEnquiry(d, sales, c, { opened_on: '2026-09-02' }).ok, false, 'two open enquiries');
      const id = e.ok ? e.id : '';
      assert.equal(R.closeEnquiry(d, sales, c, id, { closed_on: '2026-09-03', outcome: 'AMENDED_DOWN' }).ok, false, 'amended with no figure');
      assert.equal(R.closeEnquiry(d, sales, c, id, { closed_on: '2026-08-01', outcome: 'NO_CHANGE' }).ok, false, 'closed before it opened');
      assert.equal(R.closeEnquiry(d, sales, c, id, { closed_on: '2026-09-03', outcome: 'NO_CHANGE' }).ok, true);
      assert.equal(R.closeEnquiry(d, sales, c, id, { closed_on: '2026-09-04', outcome: 'AMENDED_UP', amended_figure: '1' }).ok, false, 'closed twice');
      assert.throws(() => app.db.run('DELETE FROM hmrc_enquiries'), /never deleted/);
      const panel = R.aftercarePanel(app.db, sales, c, { openTerms: [] });
      assert.match(panel.correspondence, /cannot accept one/);
      assert.throws(() => R.openEnquiry(d, actor('ACCOUNTING'), c, { opened_on: '2026-09-01' }), NotAuthorised);
    } finally { app.close(); }
  });

  test('CLAUSE 13 IS A SWITCH, OFF, READING THE LETTER’S BLANK — nothing raised off; nothing raised on while the clause is blank; a finance task on, with the clause complete', async () => {
    assert.equal(R.FEE_CLAWBACK.enabled, false, 'the switch ships on');
    const blanks = R.clauseThirteenBlanks();
    assert.equal(blanks.length > 0, true, 'clause 13 of the real letter reads complete — the refusal below would prove nothing');
    assert.equal(R.clawbackReading().reason, 'SWITCH_OFF');
    assert.equal(R.clawbackReading({ gate: { enabled: true } }).reason, 'CLAUSE_13_BLANK', 'on, the real letter’s blank did not refuse');
    assert.equal(R.clawbackReading({ gate: { enabled: true }, openTerms: [] }).applies, true);

    const app = await testApp();
    try {
      staff(app);
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      const reduce = (opts: { gate?: { enabled: boolean }; openTerms?: readonly never[] }): string => {
        const c = signedClaim(app, organisation(app), '240000');
        const e = R.openEnquiry(d, sales, c, { opened_on: '2026-09-01' });
        assert.equal(e.ok, true);
        assert.equal(R.closeEnquiry(d, sales, c, e.ok ? e.id : '', { closed_on: '2026-09-02', outcome: 'AMENDED_DOWN', amended_figure: '200000' }, opts).ok, true);
        return c;
      };
      const financeTasks = (c: string) => app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ? AND owner_role = 'ACCOUNTING'", [c])?.n ?? -1;
      const refusal = (c: string) => app.audit.entries().find((x) => x.kind === 'FEE_CLAWBACK_NOT_APPLIED' && x.object_id === c)?.detail['reason'];

      const off = reduce({});
      assert.equal(financeTasks(off), 0);
      assert.equal(refusal(off), 'SWITCH_OFF');
      const blank = reduce({ gate: { enabled: true } });
      assert.equal(financeTasks(blank), 0, 'a task was raised while clause 13 is blank');
      assert.equal(refusal(blank), 'CLAUSE_13_BLANK');
      const on = reduce({ gate: { enabled: true }, openTerms: [] });
      assert.equal(financeTasks(on), 1, 'the negative control raised no task');
      assert.equal(refusal(on), undefined);
    } finally { app.close(); }
  });

  test('A DISPOSAL DATE SET, OR A SALE IN PROSPECT, raises one task pointing at the Disposal Note — never asked, NO and UNKNOWN raise nothing', async () => {
    assert.equal(existsSync(join(ROOT, R.DISPOSAL_NOTE_PATH)), true, 'the Disposal Note the task points at is not on disk');
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      const tasks = () => app.db.all<{ description: string; owner_role: string | null; status: string }>(
        'SELECT description, owner_role, status FROM staff_tasks WHERE property_id = ? AND title = ?', [org.property, R.DISPOSAL_TASK_TITLE]);
      assert.equal(C.updateProperty(d, sales, org.property, { label: 'Main site, renamed' }, { store: null }).ok, true);
      assert.equal(tasks().length, 0, 'a change to nothing about a sale raised a task');
      for (const v of ['UNKNOWN', 'NO']) {
        assert.equal(C.updateProperty(d, sales, org.property, { sale_in_prospect: v }, { store: null }).ok, true);
        assert.equal(tasks().length, 0, `${v} raised a task`);
      }
      assert.equal(C.updateProperty(d, sales, org.property, { sale_in_prospect: 'MAYBE' }, { store: null }).ok, false);
      assert.equal(C.updateProperty(d, sales, org.property, { sale_in_prospect: 'YES' }, { store: null }).ok, true);
      assert.equal(tasks().length, 1);
      assert.equal(tasks()[0]?.owner_role, 'SALES');
      assert.ok(tasks()[0]?.description.includes(R.DISPOSAL_NOTE_PATH));
      assert.equal(C.updateProperty(d, sales, org.property, { disposal_date: '2026-09-01' }, { store: null }).ok, true);
      assert.equal(tasks().length, 1, 'a second trigger raised a second open task');
      app.db.run("UPDATE staff_tasks SET status = 'COMPLETED', completed_at = ?, completed_by = 'u-SALES' WHERE property_id = ?", [T0, org.property]);
      assert.equal(C.updateProperty(d, sales, org.property, { disposal_date: '2026-09-02' }, { store: null }).ok, true);
      assert.equal(tasks().filter((t) => t.status === 'OPEN').length, 1, 'a new disposal date raised nothing once the task was done');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * OVER HTTP — escaped, and refused to whoever may not act
 * ================================================================== */

describe('OVER HTTP — every staff-supplied value escaped, every route refused to the roles not granted it', () => {
  test('a script recorded as a fact is drawn escaped on the claim page; a surveyor and an accountant are refused every new route and write nothing', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-claim-record-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    try {
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const s = await seed(made.app.db, made.app.hasher, made.app.now);
      const signIn = async (who: string) => {
        let cookie = '';
        const req = async (path: string, init: RequestInit = {}) => {
          const headers = { ...(init.headers as Record<string, string> | undefined) };
          if (cookie !== '') headers['cookie'] = cookie;
          const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
          const set = r.headers.getSetCookie();
          if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
          return { status: r.status, body: await r.text() };
        };
        const post = (path: string, fields: Record<string, string>) => req(path, {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(),
        });
        await post('/login', { email: `${who}@example.invalid`, password: s.password });
        return { req, post };
      };
      const claim = made.app.db.get<{ id: string }>('SELECT c.id FROM claims c JOIN surveyor_jobs j ON j.claim_id = c.id LIMIT 1')?.id ?? '';
      assert.notEqual(claim, '');

      const sales = await signIn('sales');
      const r = await sales.post(`/staff/claims/${claim}/facts`, { fact_key: 'ELECTION_ELEMENTS', answer: 'VALUE', value: SCRIPT, source_id: 'CLIENT_DOC' });
      assert.equal(r.status, 303);
      const page = await sales.req(`/staff/claims/${claim}`);
      assert.equal(page.status, 200);
      assert.equal(page.body.includes(SCRIPT), false, 'a stored script was drawn raw');
      assert.equal(page.body.includes('&lt;script&gt;'), true, 'the fact was not drawn at all — the escape check proves nothing');

      const before = made.app.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM claim_facts) + (SELECT COUNT(*) FROM claim_grants) + (SELECT COUNT(*) FROM tax_adviser_signoffs) + (SELECT COUNT(*) FROM claim_deliverables) + (SELECT COUNT(*) FROM hmrc_enquiries) AS n')?.n;
      for (const who of ['surveying', 'accounting']) {
        const x = await signIn(who);
        for (const [path, fields] of [
          [`/staff/claims/${claim}/facts`, { fact_key: 'GRANTS_EXIST', answer: 'VALUE', value: 'NO', source_id: 'CTA' }],
          [`/staff/claims/${claim}/grants`, { kind: 'GRANT', payer_class: 'nhs', traced: 'NO', source_id: 'CTA' }],
          [`/staff/claims/${claim}/owners`, { position: '1', owner: 'UNKNOWN', claimed: 'UNKNOWN', source_id: 'CTA' }],
          [`/staff/claims/${claim}/signoff`, { adviser: 'Invented Tax Advisers LLP', credential: 'x', signed_on: '2026-09-01', scope: 'x', method_note: 'x', figure: '1' }],
          [`/staff/claims/${claim}/deliverables`, { kind: 'REASONED_NEGATIVE', action: 'DRAFT' }],
          [`/staff/claims/${claim}/enquiries`, { opened_on: '2026-09-01' }],
        ] as const) {
          const res = await x.post(path, fields);
          assert.equal(res.status, 403, `${who} was not refused ${path}`);
        }
      }
      const after = made.app.db.get<{ n: number }>('SELECT (SELECT COUNT(*) FROM claim_facts) + (SELECT COUNT(*) FROM claim_grants) + (SELECT COUNT(*) FROM tax_adviser_signoffs) + (SELECT COUNT(*) FROM claim_deliverables) + (SELECT COUNT(*) FROM hmrc_enquiries) AS n')?.n;
      assert.equal(after, before, 'a refused write left something behind');
    } finally { made.close(); }
  });
});
