/**
 * THE CLIENT RECORD'S BORROWED STATEMENTS, SPLIT BY OWNER (Phase 161l2). Every statement that waited in
 * src/modules/clients/data-borrowed.ts (now gone) joined the client record's tables to the core's users, the claims'
 * claims and properties, the assessment's assessments, the survey's walk-throughs, the portal's report acceptances or
 * the enquiry checks (now the client record's own: architecture/tables.json). Each is now the owners' own reads, put
 * together in the client record's data file (the users), the CRM's split reads (src/modules/crm/split-reads.ts), the
 * claims' claim row (src/modules/claims/claim-row.ts), admin's data file, or asked through a port (the survey's
 * walk-throughs, the portal's acceptances, the claims' references for the client record's fee list).
 *
 * Each pin keeps the OLD statement, word for word as the borrowed file ran it, and runs it beside the function now
 * called in its place on the seeded database with awkward rows added (test/split-pins.ts): an organisation, claim,
 * property, user or contact that is not there; NULLs; equal sort keys; a company name with LIKE's wildcards in it and a
 * property named in its frame; more rows than a LIMIT keeps. The same rows, in the same order, with the same values.
 * The ports are checked too: filled by their owners' doors, and loud when empty.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Db, Param, Row } from '../../src/core/index.ts';
import * as CLIENTS from '../../src/modules/clients/index.ts';
import * as SPLIT from '../../src/modules/crm/split-reads.ts';
import * as CLAIMS from '../../src/modules/claims/index.ts';
import * as ADMIN from '../../src/modules/admin/data.ts';
import * as SURVEY from '../../src/modules/survey/index.ts';
import * as ACCEPTANCE from '../../src/modules/crm/report-acceptance-port.ts';
import '../../src/modules/portal/index.ts';
import { looseSeededDb, pinAll, put, type Call, type Pin } from '../split-pins.ts';

/** The function now called in the old one's place, by its name. */
function from(name: string): Call {
  for (const space of [SPLIT, CLIENTS, CLAIMS, ADMIN, SURVEY, ACCEPTANCE] as object[]) {
    const f = (space as Record<string, unknown>)[name];
    if (typeof f === 'function') return f as Call;
  }
  throw new Error(`${name} is not found`);
}
/** The client record's fee list as feeList reads it: its own rows, each claim's reference through the claims' port. */
function feesWithRefs(rows: Row[], db: Db): Row[] {
  return CLIENTS.withClaimRefs(rows, CLIENTS.claimRefsFor(db, rows.map((r) => r.claim_ref)));
}

interface World {
  db: Db; staff: string; other: string; biz: string; biz2: string; claim: string; claim2: string;
  B: string[]; C: string[]; P: string[]; L: string[]; T: string[]; I: string[]; K: string[]; A: string[]; M: [string, string][];
}
let world: Promise<World> | null = null;
function theWorld(): Promise<World> {
  world ??= (async () => {
    const db = await looseSeededDb();
    const GHOST = 'u-gone';
    const users = db.all<{ id: string }>("SELECT id FROM users WHERE role <> 'CLIENT' ORDER BY email").map((u) => u.id);
    const [staff, other] = users as [string, string];
    const claims = db.all<{ id: string; business_id: string; property_id: string | null }>('SELECT id, business_id, property_id FROM claims ORDER BY claim_ref');
    const claim = claims[0]!.id, biz = claims[0]!.business_id;
    const c2 = claims.find((c) => c.business_id !== biz)!;
    const claim2 = c2.id, biz2 = c2.business_id;
    const property = claims[0]!.property_id ?? db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [biz])!.id;
    const t = (n: number): string => `2026-10-0${n}T09:00:00.000Z`;
    // organisations: one with LIKE's wildcards in its name, one with a letter outside ASCII, one marked do not contact
    put(db, 'businesses', { id: 'biz-pct', name: 'Pct%_Co', sector: 'dental', stage: 'ENQUIRY', created_at: t(1), source: null, owner_id: GHOST });
    put(db, 'businesses', { id: 'biz-cafe', name: 'Café', sector: 'dental', stage: 'ENQUIRY', created_at: t(1), source: 'WEBSITE', owner_id: staff });
    put(db, 'businesses', { id: 'biz-dnc', name: 'Do Not Ltd', sector: 'dental', stage: 'ENQUIRY', created_at: t(2), client_status: 'DO_NOT_CONTACT' });
    put(db, 'users', { id: 'u-dnc', email: 'dnc@x.invalid', email_canonical: 'dnc@x.invalid', display_name: 'DNC Client', role: 'CLIENT', business_id: 'biz-dnc', created_at: t(1), updated_at: t(1) });
    put(db, 'users', { id: 'u-other', email: 'other@x.invalid', email_canonical: 'other@x.invalid', display_name: 'Other Client', role: 'CLIENT', business_id: biz, created_at: t(1), updated_at: t(1) });
    put(db, 'users', { id: 'u-off', email: 'off@x.invalid', email_canonical: 'off@x.invalid', display_name: 'Aardvark Off', role: 'SALES', disabled_at: t(1), created_at: t(1), updated_at: t(1) });
    put(db, 'users', { id: 'u-twin', email: 'twin@x.invalid', email_canonical: 'twin@x.invalid', display_name: 'Twin Name', role: 'SALES', created_at: t(1), updated_at: t(1) });
    put(db, 'users', { id: 'u-twin2', email: 'twin2@x.invalid', email_canonical: 'twin2@x.invalid', display_name: 'Twin Name', role: 'SALES', created_at: t(1), updated_at: t(1) });
    // properties: named in the company's frame (and with the wildcards matching another name), on a company not there,
    // two with the same label on one company, and more than a search keeps
    const prop = (id: string, business_id: string, label: string, created_at = t(1)): void => put(db, 'properties', { id, business_id, label, created_at, town: 'Leeds', postcode: 'LS1 1AA' });
    prop('pr-pct1', 'biz-pct', 'Pct%_Co — main site');
    prop('pr-pct2', 'biz-pct', 'PctXYCo — other place');
    prop('pr-pct3', 'biz-pct', 'pct%_co — lower case');
    prop('pr-cafe', 'biz-cafe', 'CAFÉ — upper');
    prop('pr-cafe2', 'biz-cafe', 'Café — kitchen');
    prop('pr-orphan', 'biz-none', 'Orphan Site');
    prop('pr-twin1', biz2, 'Same Label', t(2));
    prop('pr-twin2', biz2, 'Same Label', t(2));
    for (let n = 0; n < 30; n++) prop(`pr-loop-${n}`, n % 4 === 0 ? 'biz-none' : biz, `Loop ${String(n % 10).padStart(2, '0')}`);
    // claims: on those properties, on a company not there, an owner not there, closed, and more than a search keeps
    const cl = (id: string, claim_ref: string, business_id: string, property_id: string | null, v: Record<string, Param> = {}): void =>
      put(db, 'claims', { id, claim_ref, business_id, property_id, workstream: 'PLANT_AND_MACHINERY', stage: 'ENQUIRY', created_at: t(1), updated_at: t(1), ...v });
    cl('cl-pct1', 'CR-ZZ-0001', 'biz-pct', 'pr-pct1', { owner_id: GHOST, surveyor_id: staff });
    cl('cl-pct2', 'CR-ZZ-0002', 'biz-pct', 'pr-pct2', { owner_id: null, stage: 'CLOSED', completed_at: t(5) });
    cl('cl-pct3', 'CR-ZZ-0003', 'biz-pct', 'pr-pct3', { stage: 'REASONED_NEGATIVE' });
    cl('cl-cafe', 'CR-ZZ-0004', 'biz-cafe', 'pr-cafe', { owner_id: staff });
    cl('cl-cafe2', 'CR-ZZ-0005', 'biz-cafe', 'pr-cafe2', { owner_id: null, stage: 'CLOSED', completed_at: null, assessment_id: 'as-shown' });
    cl('cl-orphan', 'CR-ZZ-0006', 'biz-none', 'pr-orphan', { stage: 'CLOSED' });
    cl('cl-noprop', 'CR-ZZ-0007', 'biz-pct', 'pr-none', { assessment_id: 'as-none' });
    for (let n = 0; n < 30; n++) cl(`cl-loop-${n}`, `CR-LOOP-${String(n).padStart(2, '0')}`, n % 5 === 0 ? 'biz-none' : n % 2 === 0 ? biz : 'biz-pct', n % 3 === 0 ? null : `pr-loop-${n}`);
    // assessments: figures shown and not, on a company not there, two at the same moment (one lead per assessment at most: a unique index)
    put(db, 'assessments', { id: 'as-shown', business_id: 'biz-cafe', sector: 'dental', submitted_at: t(3), shown_low_pence: 100, shown_high_pence: null, created_at: t(3) });
    put(db, 'assessments', { id: 'as-blank', business_id: 'biz-cafe', sector: 'dental', submitted_at: t(3), shown_low_pence: null, shown_high_pence: null, created_at: t(3) });
    put(db, 'assessments', { id: 'as-orphan', business_id: 'biz-none', sector: 'dental', submitted_at: t(4), created_at: t(4) });
    put(db, 'assessments', { id: 'as-pct', business_id: 'biz-pct', sector: 'dental', submitted_at: t(2), shown_high_pence: 500, created_at: t(2) });
    // introducers, a merged one, and their leads: on claims there and not, none, an assessment with figures and without
    put(db, 'introducers', { id: 'intro-1', firm_name: 'Alpha Accountants', introducer_type: 'ACCOUNTANT', owner_id: staff, created_at: t(1), updated_at: t(1) });
    put(db, 'introducers', { id: 'intro-2', firm_name: 'Alpha Accountants', introducer_type: 'ACCOUNTANT', owner_id: GHOST, created_at: t(1), updated_at: t(1), merged_into_id: 'intro-1', merged_at: t(2) });
    put(db, 'introducers', { id: 'intro-3', firm_name: 'Beta', introducer_type: 'OTHER', owner_id: null, created_at: t(1), updated_at: t(1), merged_into_id: 'intro-none' });
    const lead = (id: string, v: Record<string, Param>): void => put(db, 'leads', { id, origin: 'STAFF', source: 'OTHER', lead_date: t(1), status: 'NEW', created_at: t(1), updated_at: t(1), ...v });
    lead('lead-i1', { business_id: 'biz-pct', introducer_id: 'intro-1', claim_id: 'cl-pct2', owner_id: staff, assessment_id: 'as-pct', status: 'CONVERTED' });
    lead('lead-i2', { business_id: 'biz-cafe', introducer_id: 'intro-1', claim_id: 'cl-pct3', owner_id: GHOST, assessment_id: 'as-shown', status: 'CONVERTED', lead_date: t(2) });
    lead('lead-i3', { business_id: null, prospect_organisation: 'A Prospect', introducer_id: 'intro-2', claim_id: null, assessment_id: 'as-blank', lead_date: t(2) });
    lead('lead-i4', { business_id: 'biz-none', introducer_id: 'intro-1', claim_id: 'claim-none', assessment_id: 'as-none', lead_date: t(2) });
    lead('lead-i5', { business_id: 'biz-cafe', introducer_id: null, claim_id: 'cl-cafe2', assessment_id: null, lead_date: t(3) });
    lead('lead-i6', { business_id: 'biz-cafe', introducer_id: 'intro-1', claim_id: 'cl-orphan', assessment_id: null, lead_date: t(3), status: 'LOST' });
    // tasks: on a claim (its next action), a claim not there, a property, a lead, an introducer, by people known and not
    const task = (id: string, v: Record<string, Param>): void => put(db, 'staff_tasks', { id, title: `Task ${id}`, status: 'OPEN', priority: 'NORMAL', activity_type: 'TASK', is_next_action: 0, origin: 'STAFF', created_at: t(1), updated_at: t(1), ...v });
    task('st-1', { claim_id: 'cl-pct1', business_id: 'biz-pct', is_next_action: 1, owner_id: staff, created_by: GHOST, due_on: '2026-10-02', property_id: 'pr-pct1' });
    task('st-2', { claim_id: 'claim-none', business_id: biz, owner_id: GHOST, created_by: staff, completed_by: other, status: 'COMPLETED', completed_at: t(3), due_on: '2026-10-02' });
    task('st-3', { property_id: 'pr-none', business_id: 'biz-none', lead_id: 'lead-i1', owner_id: null, owner_role: 'SALES', contact_id: 'ct-none', created_at: t(2) });
    task('st-4', { introducer_id: 'intro-1', owner_id: other, cancelled_by: GHOST, status: 'CANCELLED', cancelled_at: t(4), created_at: t(2), lead_id: 'lead-i3' });
    task('st-5', { claim_id: 'cl-loop-1', business_id: 'biz-pct', is_next_action: 1, owner_id: staff, due_on: null, property_id: 'pr-loop-1', automation_run_id: 'run-1' });
    task('st-6', { claim_id: 'cl-cafe2', property_id: 'pr-cafe2', business_id: 'biz-cafe', owner_id: staff, created_at: t(2), lead_id: 'lead-i5' });
    // automation runs: on a claim, a claim not there, none; two at the same moment
    put(db, 'automation_rules', { id: 'rule-x', label: 'A rule', trigger_event: 'STAGE_ENTERED', effect: 'TASK', active: 1, ord: 1, source: 'STAFF', created_at: t(1), updated_at: t(1) });
    put(db, 'automation_runs', { id: 'run-1', rule_id: 'rule-x', at: t(5), trigger_event: 'STAGE_ENTERED', claim_id: 'cl-pct1', outcome: 'FIRED', tasks_created: 1 });
    put(db, 'automation_runs', { id: 'run-2', rule_id: 'rule-x', at: t(5), trigger_event: 'STAGE_ENTERED', claim_id: 'claim-none', outcome: 'FIRED', tasks_created: 0 });
    put(db, 'automation_runs', { id: 'run-3', rule_id: 'rule-none', at: t(6), trigger_event: 'STAGE_ENTERED', claim_id: null, outcome: 'SKIPPED', tasks_created: 0 });
    // notes and messages: on a claim, a claim not there, a property, by people known and not, at the same moment
    const note = (id: string, v: Record<string, Param>): void => put(db, 'internal_notes', { id, body: `A note ${id}`, created_at: t(3), ...v });
    note('n-1', { business_id: 'biz-pct', author_id: staff, claim_id: 'cl-pct1' });
    note('n-2', { business_id: 'biz-pct', author_id: GHOST, claim_id: 'cl-pct2' });
    note('n-3', { business_id: 'biz-pct', author_id: null, claim_id: 'claim-none', property_id: 'pr-pct3' });
    note('n-4', { business_id: 'biz-pct', author_id: staff, claim_id: 'cl-pct3', created_at: t(4) });
    note('n-5', { business_id: 'biz-cafe', author_id: other, claim_id: 'cl-cafe', property_id: 'pr-cafe2' });
    note('n-6', { business_id: 'biz-cafe', author_id: other, claim_id: null, property_id: null });
    note('n-7', { business_id: 'biz-none', author_id: other, claim_id: 'cl-orphan', property_id: 'pr-orphan' });
    const msg = (id: string, v: Record<string, Param>): void => put(db, 'client_messages', { id, direction: 'IN', source: 'PORTAL', body: `Hello ${id}`, created_at: t(3), ...v });
    msg('m-1', { business_id: 'biz-pct', claim_id: 'cl-pct1', author_id: 'u-dnc', contact_id: null });
    msg('m-2', { business_id: 'biz-pct', claim_id: 'claim-none', author_id: GHOST, contact_id: 'ct-none' });
    msg('m-3', { business_id: 'biz-pct', claim_id: null, author_id: staff, direction: 'OUT' });
    msg('m-4', { business_id: 'biz-cafe', claim_id: 'cl-cafe', author_id: null });
    put(db, 'client_message_files', { id: 'mf-1', message_id: 'm-1', logical_document_id: 'ld-x', linked_at: t(3) });
    // fees and percentage entries: on a claim, a claim not there, people known and not
    put(db, 'introducer_fees', { id: 'fee-1', introducer_id: 'intro-1', claim_id: 'cl-pct2', business_id: 'biz-pct', amount_pence: 100, disclosure_recorded_by: staff, paid_recorded_by: GHOST, state: 'PAID', created_at: t(2), updated_at: t(2) });
    put(db, 'introducer_fees', { id: 'fee-2', introducer_id: 'intro-1', claim_id: 'claim-none', business_id: 'biz-pct', amount_pence: 200, state: 'DUE', created_at: t(2), updated_at: t(2) });
    put(db, 'introducer_fees', { id: 'fee-3', introducer_id: 'intro-none', claim_id: 'cl-pct3', business_id: 'biz-pct', amount_pence: 300, state: 'DUE', created_at: t(3), updated_at: t(3) });
    put(db, 'introducer_percentage_entries', { id: 'pe-1', introducer_id: 'intro-1', claim_id: 'cl-pct2', business_id: 'biz-pct', entry_kind: 'INVOICE', basis_pence: 1, percent_bp: 1, amount_pence: 1, created_at: t(2) });
    put(db, 'introducer_percentage_entries', { id: 'pe-2', introducer_id: 'intro-1', claim_id: 'claim-none', business_id: 'biz-pct', entry_kind: 'INVOICE', basis_pence: 2, percent_bp: 2, amount_pence: 2, created_at: t(2) });
    put(db, 'introducer_percentage_entries', { id: 'pe-3', introducer_id: 'intro-2', claim_id: 'cl-pct1', business_id: 'biz-pct', entry_kind: 'CREDIT_NOTE', basis_pence: 3, percent_bp: 3, amount_pence: 3, created_at: t(2) });
    put(db, 'introducer_share_consents', { id: 'sc-1', introducer_id: 'intro-1', lead_id: 'lead-i1', business_id: null, decision: 'GIVE', wording_version: 'v1', route: 'EMAIL', recorded_by: GHOST, recorded_at: t(2) });
    put(db, 'introducer_share_consents', { id: 'sc-2', introducer_id: 'intro-1', lead_id: null, business_id: biz2, decision: 'REFUSE', wording_version: 'v1', route: 'EMAIL', recorded_by: staff, recorded_at: t(2) });
    db.run('DELETE FROM introducer_reward_setting');
    put(db, 'introducer_reward_setting', { id: 1, model: 'FIXED', fee_pence: 100, percent_bp: null, changed_by: GHOST, changed_at: t(1) });
    // enquiry checks: on a lead and a claim, by people known and not, at the same moment
    const check = (id: string, v: Record<string, Param>): void => put(db, 'enquiry_checks', { id, check_key: 'TRADING_CLIENT', answer: 'YES', recorded_at: t(2), ...v });
    check('ec-1', { lead_id: 'lead-i1', recorded_by: staff });
    check('ec-2', { lead_id: 'lead-i1', recorded_by: GHOST, check_key: 'NO_CLAIM_CONFLICT', note: 'n' });
    check('ec-3', { claim_id: 'cl-pct1', recorded_by: other });
    check('ec-4', { claim_id: 'cl-pct1', recorded_by: staff, recorded_at: t(1), check_key: 'UK_HEALTHCARE_PROPERTY' });
    // the client report's acceptances
    put(db, 'client_report_acceptances', { id: 'x-1', claim_id: claim, fingerprint: 'h2', user_id: staff, accepted_at: t(2) });
    put(db, 'client_report_acceptances', { id: 'x-2', claim_id: claim, fingerprint: 'h2', user_id: GHOST, accepted_at: t(1) });
    put(db, 'client_report_acceptances', { id: 'x-3', claim_id: claim, fingerprint: 'h1', user_id: staff, accepted_at: t(0) });
    // bookings: with no company but a lead, assigned to people known, disabled, a client and nobody, cancelled by someone not there
    const booking = (id: string, v: Record<string, Param>): void => put(db, 'bookings', { id, channel: 'video', created_at: t(1), ...v });
    booking('bk-1', { business_id: 'biz-pct', assigned_to: staff, starts_at: t(3), ends_at: t(4) });
    booking('bk-2', { business_id: null, lead_id: 'lead-i3', assigned_to: 'u-off', starts_at: t(3), ends_at: t(4) });
    booking('bk-3', { business_id: 'biz-none', lead_id: 'lead-none', assigned_to: 'u-dnc', starts_at: null, cancelled_at: null, channel: 'phone' });
    booking('bk-4', { business_id: 'biz-pct', assigned_to: GHOST, starts_at: null, cancelled_at: t(5), cancelled_by: GHOST, channel: 'phone' });
    booking('bk-5', { business_id: 'biz-pct', assigned_to: null, starts_at: t(2), cancelled_at: t(5), cancelled_by: staff, channel: 'in_person' });
    put(db, 'booking_changes', { id: 'bc-1', booking_id: 'bk-1', changed_by: staff, at: t(2), cancelled: 0 });
    put(db, 'booking_changes', { id: 'bc-2', booking_id: 'bk-1', changed_by: GHOST, at: t(2), cancelled: 1 });
    put(db, 'call_logs', { id: 'call-1', business_id: 'biz-pct', contact_id: 'ct-none', logged_by: GHOST, logged_at: t(2), outcome: 'NO_ANSWER' });
    put(db, 'call_logs', { id: 'call-2', business_id: 'biz-pct', contact_id: null, logged_by: staff, logged_at: t(2), outcome: 'SPOKE' });
    put(db, 'survey_walkthroughs', { id: 'sw-1', job_id: 'sj-x', booking_id: 'bk-1', booked_by: staff, booked_at: t(1) });
    // working times: for people known, disabled, twins with the same name, and someone not there
    for (const [i, u] of [staff, 'u-off', 'u-twin', 'u-twin2', GHOST, staff].entries()) put(db, 'working_times', { id: `wt-${i}`, user_id: u, weekday: (i % 5) + 1, start_min: 3 + i, end_min: 9 });
    // the client's task checks
    put(db, 'client_tasks', { id: 'ctk-1', business_id: 'biz-pct', asked_by: staff, question: 'q', state: 'ANSWERED', kind: 'QUESTION', created_at: t(1) });
    put(db, 'client_task_checks', { id: 'tc-1', task_id: 'tk-1', outcome: 'ACCEPTED', checked_by: staff, checked_at: t(2) });
    put(db, 'client_task_checks', { id: 'tc-2', task_id: 'tk-2', outcome: 'REJECTED', checked_by: GHOST, checked_at: t(2), reason: 'r' });
    put(db, 'client_task_checks', { id: 'tc-3', task_id: 'tk-3', outcome: 'ACCEPTED', checked_by: null, checked_at: t(2) });
    const ids = (sql: string, extra: string): string[] => [...db.all<{ id: string }>(sql).map((r) => r.id), extra];
    return {
      db, staff, other, biz, biz2, claim, claim2,
      B: ids('SELECT id FROM businesses ORDER BY id', 'biz-none'), C: ids('SELECT id FROM claims ORDER BY id', 'claim-none'),
      P: [...ids('SELECT id FROM properties ORDER BY id', 'pr-none'), property], L: ids('SELECT id FROM leads ORDER BY id', 'lead-none'),
      T: ids('SELECT id FROM staff_tasks ORDER BY id', 'st-none'), I: ids('SELECT id FROM introducers ORDER BY id', 'intro-none'),
      K: ids('SELECT id FROM bookings ORDER BY id', 'bk-none'), A: ids('SELECT id FROM assessments ORDER BY id', 'as-none'),
      M: db.all<{ id: string; business_id: string }>('SELECT id, business_id FROM client_messages ORDER BY id').map((m) => [m.id, m.business_id] as [string, string]),
    };
  })();
  return world;
}

pinAll<World>('161l2 the client record', theWorld, (w): Pin[] => [
  { name: 'getAssessmentsIdBusinessIdById', get: true,
    old: "SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, a.shown_low_pence, a.shown_high_pence FROM assessments a JOIN businesses b ON b.id = a.business_id WHERE a.id = ?",
    call: from('getAssessmentsIdBusinessIdById'), params: w.A.map((x) => [x]), atLeast: 1 },
  { name: 'getAssessmentsIdLeadIdByBusinessId', get: true,
    old: "SELECT a.id, l.id AS lead_id, l.status AS lead_status FROM assessments a LEFT JOIN leads l ON l.assessment_id = a.id WHERE a.business_id = ? ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1",
    call: from('getAssessmentsIdLeadIdByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'getBookingById', get: true,
    old: "SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to LEFT JOIN users cu ON cu.id = k.cancelled_by WHERE k.id = ?",
    call: from('getBookingById'), params: w.K.map((x) => [x]), atLeast: 1 },
  { name: 'getBookingsIdEmailByIdDisabledAt', get: true,
    old: "SELECT u.id, u.email, u.display_name FROM bookings b JOIN users u ON u.id = b.assigned_to\n    WHERE b.id = ? AND u.disabled_at IS NULL AND u.role <> 'CLIENT'",
    call: from('getBookingsIdEmailByIdDisabledAt'), params: w.K.map((x) => [x]), atLeast: 1 },
  { name: 'getBusinessesIdNameById5', get: true,
    old: "SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, u.display_name AS owner_name FROM businesses b LEFT JOIN users u ON u.id = b.owner_id WHERE b.id = ?",
    call: from('getBusinessesIdNameById5'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'getClaimsBusinessIdCompanyById', get: true,
    old: "SELECT c.business_id, b.name AS company, p.label AS property, c.claim_ref AS ref FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?",
    call: from('getClaimsBusinessIdCompanyById'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'getClaimsIdClaimRefById4', get: true,
    old: "SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || ' — %' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?",
    call: from('getClaimsIdClaimRefById4'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'getClientMessagesIdBusinessIdByIdBusinessId', get: true,
    old: "SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, u.display_name AS author, u.role AS author_role, ct.full_name AS contact, c.claim_ref, p.label AS claim_property FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id LEFT JOIN properties p ON p.id = c.property_id WHERE m.id = ? AND m.business_id = ?",
    call: from('getClientMessagesIdBusinessIdByIdBusinessId'), params: w.M.flatMap(([m, b]) => [[m, b], [m, w.biz2]]), atLeast: 1 },
  { name: 'getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint', get: true,
    old: "SELECT x.accepted_at, x.user_id FROM client_report_acceptances x WHERE x.claim_id = ? AND x.fingerprint = ? AND x.accepted_at >= ? ORDER BY x.accepted_at ASC LIMIT 1",
    call: from('getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint'), params: [[w.claim, 'h2', ''], [w.claim, 'h2', '2026-10-01T12:00:00.000Z'], [w.claim, 'h1', ''], [w.claim, 'h2', '2027'], [w.claim2, 'h2', ''], ['claim-none', 'h2', '']], atLeast: 1 },
  { name: 'getClientTaskChecksOutcomeWhoByTaskId', get: true,
    old: "SELECT k.outcome, u.display_name AS who, k.checked_at, k.reason FROM client_task_checks k LEFT JOIN users u ON u.id = k.checked_by WHERE k.task_id = ?",
    call: from('getClientTaskChecksOutcomeWhoByTaskId'), params: ['tk-1', 'tk-2', 'tk-3', 'tk-none'].map((x) => [x]), atLeast: 1 },
  { name: 'getIntroducerFeesIdIntroducerIdById', get: true,
    old: "SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by WHERE f.id = ?",
    call: from('getIntroducerFeesIdIntroducerIdById'), params: ['fee-1', 'fee-2', 'fee-3', 'fee-none'].map((x) => [x]), atLeast: 1 },
  { name: 'getIntroducerRewardSettingModelFeePenceById', get: true,
    old: "SELECT s.model, s.fee_pence, s.percent_bp, s.changed_at, u.display_name AS who FROM introducer_reward_setting s LEFT JOIN users u ON u.id = s.changed_by WHERE s.id = 1",
    call: from('getIntroducerRewardSettingModelFeePenceById'), params: [[]], atLeast: 1 },
  { name: 'getIntroducerShareConsentsIdDecisionByIntroducerIdLeadId', get: true,
    old: "SELECT s.id, s.decision, s.wording_version, s.recorded_at, u.display_name AS who FROM introducer_share_consents s LEFT JOIN users u ON u.id = s.recorded_by WHERE s.introducer_id = ? AND (s.lead_id = ? OR s.business_id = ? OR s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?)) ORDER BY s.rowid DESC LIMIT 1",
    call: from('getIntroducerShareConsentsIdDecisionByIntroducerIdLeadId'), params: [['intro-1', 'lead-i1', w.biz, w.biz], ['intro-1', 'lead-none', w.biz2, w.biz2], ['intro-2', 'lead-i3', 'biz-none', 'biz-none'], ['intro-none', 'x', 'x', 'x']], atLeast: 1 },
  { name: 'getIntroducersIdFirmNameById', get: true,
    old: "SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, u.display_name AS owner_name, i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at FROM introducers i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN introducers m ON m.id = i.merged_into_id WHERE i.id = ?",
    call: from('getIntroducersIdFirmNameById'), params: w.I.map((x) => [x]), atLeast: 1 },
  { name: 'getIntroducersIdTitleByIdJO', get: true,
    old: "SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.id = ?",
    call: from('getIntroducersIdTitleByIdJO'), params: w.T.map((x) => [x]), atLeast: 1 },
  { name: 'getLeadsCOUNTByIntroducerId', get: true,
    old: "SELECT (SELECT COUNT(*) FROM leads WHERE introducer_id = ?) AS referred, (SELECT COUNT(*) FROM leads WHERE introducer_id = ? AND claim_id IS NOT NULL) AS opened, (SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'CLOSED') AS won, (SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'REASONED_NEGATIVE') AS negatives",
    call: from('getLeadsCOUNTByIntroducerId'), params: w.I.map((x) => [x, x, x, x]), atLeast: 1 },
  { name: 'getLeadsCountByIdShownLowPence', get: true,
    old: "SELECT COUNT(*) AS n FROM leads l JOIN assessments a ON a.id = l.assessment_id WHERE l.id = ? AND (a.shown_low_pence IS NOT NULL OR a.shown_high_pence IS NOT NULL)",
    call: from('getLeadsCountByIdShownLowPence'), params: w.L.map((x) => [x]), atLeast: 1 },
  { name: 'getLeadsIntroducerIdBusinessIdByClaimIdIntroducerId', get: true,
    old: "SELECT l.introducer_id, c.business_id FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.claim_id = ? AND l.introducer_id IS NOT NULL",
    call: from('getLeadsIntroducerIdBusinessIdByClaimIdIntroducerId'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'getPropertiesIdBusinessIdById4', get: true,
    old: "SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.id = ?",
    call: from('getPropertiesIdBusinessIdById4'), params: w.P.map((x) => [x]), atLeast: 1 },
  { name: 'getStaffTasksIdBusinessIdById', get: true,
    old: "SELECT t.id, t.business_id, t.property_id, t.claim_id, t.lead_id, t.owner_id, t.activity_type, c.claim_ref FROM staff_tasks t LEFT JOIN claims c ON c.id = t.claim_id WHERE t.id = ?",
    call: from('getStaffTasksIdBusinessIdById'), params: w.T.map((x) => [x]), atLeast: 1 },
  { name: 'getStaffTasksIdBusinessIdByLeadIdStatus', get: true,
    old: "SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, l.prospect_postcode, l.prospect_event, l.prospect_event_year, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, (SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, b.sector AS business_sector, u.display_name AS owner_name, c.claim_ref AS claim_ref FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN claims c ON c.id = l.claim_id WHERE l.id = ?",
    call: from('getStaffTasksIdBusinessIdByLeadIdStatus'), params: w.L.map((x) => [x]), atLeast: 1 },
  { name: 'getStaffTasksIdClaimRefByClaimIdIsNextAction', get: true,
    old: "SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?",
    call: from('getStaffTasksIdClaimRefByClaimIdIsNextAction'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'getStaffTasksIdTitleByClaimIdIsNextAction', get: true,
    old: "SELECT t.id, t.title, t.owner_id, t.owner_role, u.display_name AS owner_name, t.due_on FROM staff_tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE t.claim_id = ? AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')",
    call: from('getStaffTasksIdTitleByClaimIdIsNextAction'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'getSurveyWalkthroughsXByBookingId', get: true,
    old: "SELECT 1 AS x FROM survey_walkthroughs WHERE booking_id = ?",
    call: from('getSurveyWalkthroughsXByBookingId'), params: w.K.map((x) => [x]), atLeast: 1 },
  { name: 'getUsersCountByClientStatusEmailCanonical', get: true,
    old: "SELECT COUNT(*) AS n FROM users u JOIN businesses b ON b.id = u.business_id WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(?)",
    call: from('getUsersCountByClientStatusEmailCanonical'), params: [['dnc@x.invalid'], ['DNC@X.INVALID'], ['other@x.invalid'], ['nobody@x.invalid']], atLeast: 1 },
  { name: 'listAssessmentsIdBusinessId',
    old: "SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, a.shown_low_pence, a.shown_high_pence FROM assessments a JOIN businesses b ON b.id = a.business_id ORDER BY a.submitted_at DESC, a.id DESC LIMIT ?",
    call: from('listAssessmentsIdBusinessId'), params: [[1000], [2], [0]], atLeast: 1 },
  { name: 'listAutomationRunsAtTriggerEvent',
    old: "SELECT r.at, r.trigger_event, r.outcome, r.reason, r.tasks_created, r.outbox_id, c.id AS claim_id, r.lead_id, r.task_id, ar.label FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id LEFT JOIN claims c ON c.id = r.claim_id ORDER BY r.at DESC, r.rowid DESC LIMIT ?",
    call: from('listAutomationRunsAtTriggerEvent'), params: [[100], [2]], atLeast: 1 },
  { name: 'listBookingChangesAtFromStartsAtByBookingId',
    old: "SELECT c.at, c.from_starts_at, c.to_starts_at, u.display_name AS who, c.cancelled FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by WHERE c.booking_id = ? ORDER BY c.at",
    call: from('listBookingChangesAtFromStartsAtByBookingId'), params: w.K.map((x) => [x]), atLeast: 1 },
  { name: 'listBookingChangesFromStartsAtToStartsAtByBookingId',
    old: "SELECT c.from_starts_at, c.to_starts_at, u.display_name AS changed_by_name, c.at, c.cancelled FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by WHERE c.booking_id = ? ORDER BY c.at ASC",
    call: from('listBookingChangesFromStartsAtToStartsAtByBookingId'), params: w.K.map((x) => [x]), atLeast: 1 },
  { name: 'listBookingsCancelled',
    old: "SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to LEFT JOIN users cu ON cu.id = k.cancelled_by WHERE k.cancelled_at IS NOT NULL ORDER BY k.cancelled_at DESC LIMIT 100",
    call: from('listBookingsCancelled'), params: [[]], atLeast: 1 },
  { name: 'listBookingsIdChannelByBusinessIdChannel',
    old: "SELECT b.id, b.channel, b.starts_at, b.ends_at, b.created_at, b.cancelled_at, u.display_name AS who FROM bookings b LEFT JOIN users u ON u.id = b.assigned_to WHERE b.business_id = ? AND b.channel IN ('video','phone') ORDER BY b.created_at, b.id",
    call: from('listBookingsIdChannelByBusinessIdChannel'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listBookingsScheduled',
    old: "SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to LEFT JOIN users cu ON cu.id = k.cancelled_by WHERE k.starts_at IS NOT NULL AND k.starts_at >= ? AND k.starts_at < ? ORDER BY k.starts_at ASC",
    call: from('listBookingsScheduled'), params: [['2000-01-01', '2100-01-01'], ['2026-10-02', '2026-10-04']], atLeast: 1 },
  { name: 'listBookingsWithNoTime',
    old: "SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to LEFT JOIN users cu ON cu.id = k.cancelled_by WHERE k.starts_at IS NULL AND k.cancelled_at IS NULL ORDER BY k.created_at ASC",
    call: from('listBookingsWithNoTime'), params: [[]], atLeast: 1 },
  { name: 'listBusinessesIdName5',
    old: "SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, u.display_name AS owner_name FROM businesses b LEFT JOIN users u ON u.id = b.owner_id ORDER BY b.name ASC LIMIT ?",
    call: from('listBusinessesIdName5'), params: [[1000], [3]], atLeast: 1 },
  { name: 'listCallLogsIdLoggedAtByBusinessId',
    old: "SELECT k.id, k.logged_at, k.outcome, k.notes, k.contact_id, c.full_name AS contact, u.display_name AS writer FROM call_logs k LEFT JOIN contacts c ON c.id = k.contact_id LEFT JOIN users u ON u.id = k.logged_by WHERE k.business_id = ? ORDER BY k.logged_at, k.id",
    call: from('listCallLogsIdLoggedAtByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listClaimsIdClaimRef',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, u.display_name AS owner_name FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.claim_ref ASC",
    call: from('listClaimsIdClaimRef'), params: [[]], atLeast: 1 },
  { name: 'listClaimsIdClaimRefByBusinessId4',
    old: "SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || ' — %' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref",
    call: from('listClaimsIdClaimRefByBusinessId4'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listClaimsIdClaimRefByOwnerId2',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.owner_id IS NULL ORDER BY c.claim_ref ASC",
    call: from('listClaimsIdClaimRefByOwnerId2'), params: [[]], atLeast: 1 },
  { name: 'listClaimsIdClaimRefByPropertyId',
    old: "SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || ' — %' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.property_id = ? ORDER BY c.claim_ref",
    call: from('listClaimsIdClaimRefByPropertyId'), params: w.P.map((x) => [x]), atLeast: 1 },
  { name: 'listClaimsIdCompletedAtByStage',
    old: "SELECT c.id, c.completed_at, l.lead_date FROM claims c LEFT JOIN leads l ON l.claim_id = c.id WHERE c.stage = 'CLOSED'",
    call: from('listClaimsIdCompletedAtByStage'), params: [[]], atLeast: 1 },
  { name: 'listClaimsRows:MONEY',
    old: "SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, NULL AS sector, NULL AS org_source, NULL AS stage, NULL AS workstream, NULL AS owner_id, NULL AS owner_name, NULL AS priority, NULL AS expected_completion, NULL AS property_label, NULL AS property_type, NULL AS jurisdiction, NULL AS postcode, NULL AS lead_source, NULL AS introducer_id, NULL AS firm_name, NULL AS next_action, NULL AS next_action_due, NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate FROM claims c JOIN businesses b ON b.id = c.business_id ORDER BY c.claim_ref DESC LIMIT 1000",
    call: (db) => (SPLIT.listClaimsRows as (db: Db, shape: string) => Row[])(db, 'MONEY'), params: [[]], atLeast: 1 },
  { name: 'listClaimsRows:WORKING',
    old: "SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id ORDER BY c.claim_ref DESC LIMIT 1000",
    call: (db) => (SPLIT.listClaimsRows as (db: Db, shape: string) => Row[])(db, 'WORKING'), params: [[]], atLeast: 1 },
  { name: 'listClaimsRows:VALUE',
    old: "SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, NULL AS q, a.shown_low_pence, a.shown_high_pence, NULL AS has_estimate, c.assessment_id AS value_of FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id LEFT JOIN assessments a ON a.id = c.assessment_id ORDER BY c.claim_ref DESC LIMIT 1000",
    call: (db) => (SPLIT.listClaimsRows as (db: Db, shape: string) => Row[])(db, 'VALUE'), params: [[]], atLeast: 1 },
  { name: 'listClientMessageFilesCreatedAtDirectionByMessageIdJO',
    old: "SELECT m.created_at, m.direction, m.source, u.display_name AS who, ct.full_name AS contact, c.claim_ref, (SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id WHERE m.business_id = ? AND (m.claim_id = ? OR m.claim_id IS NULL) ORDER BY m.created_at",
    call: from('listClientMessageFilesCreatedAtDirectionByMessageIdJO'), params: w.B.flatMap((b) => [[b, w.claim], [b, 'claim-none']]), atLeast: 1 },
  { name: 'listClientMessageFilesCreatedAtDirectionByMessageIdJO2',
    old: "SELECT m.created_at, m.direction, m.source, u.display_name AS who, ct.full_name AS contact, c.claim_ref, (SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id WHERE m.business_id = ? ORDER BY m.created_at",
    call: from('listClientMessageFilesCreatedAtDirectionByMessageIdJO2'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listClientMessagesIdBusinessIdByBusinessId',
    old: "SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, u.display_name AS author, u.role AS author_role, ct.full_name AS contact, c.claim_ref, p.label AS claim_property FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id LEFT JOIN properties p ON p.id = c.property_id WHERE m.business_id = ? ORDER BY m.created_at ASC, m.rowid ASC",
    call: from('listClientMessagesIdBusinessIdByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listEnquiryChecksRecordedAtCheckKeyByClaimId',
    old: "SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ? ORDER BY e.recorded_at",
    call: from('listEnquiryChecksRecordedAtCheckKeyByClaimId'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'listEnquiryChecksRecordedAtCheckKeyByLeadId',
    old: "SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ? ORDER BY e.recorded_at",
    call: from('listEnquiryChecksRecordedAtCheckKeyByLeadId'), params: w.L.map((x) => [x]), atLeast: 1 },
  { name: 'listEnquiryChecksSeqCheckKeyByClaimId',
    old: "SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, u.display_name AS recorder FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ?",
    call: from('listEnquiryChecksSeqCheckKeyByClaimId'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'listEnquiryChecksSeqCheckKeyByLeadId',
    old: "SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, u.display_name AS recorder FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ?",
    call: from('listEnquiryChecksSeqCheckKeyByLeadId'), params: w.L.map((x) => [x]), atLeast: 1 },
  { name: 'listInternalNotesCreatedAtBodyByBusinessId',
    old: "SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || ' — %' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.business_id = ? ORDER BY n.created_at DESC",
    call: from('listInternalNotesCreatedAtBodyByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listInternalNotesCreatedAtBodyByBusinessIdClaimId',
    old: "SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || ' — %' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.business_id = ? AND (n.claim_id = ? OR (n.claim_id IS NULL AND n.property_id IS NULL)) ORDER BY n.created_at DESC",
    call: from('listInternalNotesCreatedAtBodyByBusinessIdClaimId'), params: w.B.flatMap((b) => w.C.map((c) => [b, c])), atLeast: 1 },
  { name: 'listInternalNotesCreatedAtBodyByPropertyIdClaimId',
    old: "SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || ' — %' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.property_id = ? OR n.claim_id IN (SELECT x.id FROM claims x WHERE x.property_id = ?) ORDER BY n.created_at DESC",
    call: from('listInternalNotesCreatedAtBodyByPropertyIdClaimId'), params: w.P.map((x) => [x, x]), atLeast: 1 },
  { name: 'listInternalNotesIdAuthorIdByBusinessId',
    old: "SELECT n.id, n.author_id, n.created_at, n.body, u.display_name AS who, c.claim_ref, cp.label AS claim_property, p.label AS property_label FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.business_id = ? ORDER BY n.created_at ASC, n.rowid ASC",
    call: from('listInternalNotesIdAuthorIdByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listIntroducerFeesIdIntroducerId',
    old: "SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by ORDER BY f.created_at DESC, f.id ASC",
    call: (db, p) => feesWithRefs(CLIENTS.listIntroducerFeesIdIntroducerIdOwn(db, p), db), params: [[]], atLeast: 1 },
  { name: 'listIntroducerFeesIdIntroducerIdByIntroducerId',
    old: "SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by WHERE f.introducer_id = ? ORDER BY f.created_at DESC, f.id ASC",
    call: (db, p) => feesWithRefs(CLIENTS.listIntroducerFeesIdIntroducerIdByIntroducerIdOwn(db, p), db), params: w.I.map((x) => [x]), atLeast: 1 },
  { name: 'listIntroducerPercentageEntriesIdIntroducerId',
    old: "SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, c.claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, e.amount_pence, e.created_at FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id JOIN claims c ON c.id = e.claim_id ORDER BY e.created_at DESC, e.rowid DESC",
    call: from('listIntroducerPercentageEntriesIdIntroducerId'), params: [[]], atLeast: 1 },
  { name: 'listIntroducerPercentageEntriesIdIntroducerIdByIntroducerId',
    old: "SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, c.claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, e.amount_pence, e.created_at FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id JOIN claims c ON c.id = e.claim_id WHERE e.introducer_id = ? ORDER BY e.created_at DESC, e.rowid DESC",
    call: from('listIntroducerPercentageEntriesIdIntroducerIdByIntroducerId'), params: w.I.map((x) => [x]), atLeast: 1 },
  { name: 'listIntroducersIdFirmName2',
    old: "SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, u.display_name AS owner_name, i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at FROM introducers i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN introducers m ON m.id = i.merged_into_id ORDER BY i.firm_name ASC, i.id ASC LIMIT ?",
    call: from('listIntroducersIdFirmName2'), params: [[1000], [1]], atLeast: 1 },
  { name: 'listIntroducersIdTitleByIdJO',
    old: "SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.claim_id = ? ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_on IS NULL, t.due_on ASC, t.created_at DESC",
    call: from('listIntroducersIdTitleByIdJO'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'listIntroducersIdTitleByIdJO2',
    old: "SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN ('OPEN','IN_PROGRESS') AND (t.owner_id = ? OR (t.owner_id IS NULL AND t.owner_role = ?)) ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC",
    call: from('listIntroducersIdTitleByIdJO2'), params: [[w.staff, 'ADMIN'], [w.other, 'SALES'], ['u-none', 'SURVEYING']], atLeast: 1 },
  { name: 'listIntroducersIdTitleByIdJO3',
    old: "SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.due_on IS NOT NULL AND t.due_on <= ? ORDER BY t.due_on ASC, t.created_at ASC LIMIT ?",
    call: from('listIntroducersIdTitleByIdJO3'), params: [['2026-12-31', 100], ['2026-10-02', 1]], atLeast: 1 },
  { name: 'listIntroducersIdTitleByIdJO4',
    old: "SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC LIMIT ?",
    call: from('listIntroducersIdTitleByIdJO4'), params: [[100], [2]], atLeast: 1 },
  { name: 'listLeadsIdBusinessIdByIntroducerId',
    old: "SELECT l.id, l.business_id, COALESCE(b.name, l.prospect_organisation) AS organisation, l.lead_date, l.status, l.claim_id, c.claim_ref, c.stage FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? ORDER BY l.lead_date DESC, l.id ASC",
    call: from('listLeadsIdBusinessIdByIntroducerId'), params: w.I.map((x) => [x]), atLeast: 1 },
  { name: 'listLeadsRows',
    old: "SELECT l.id, l.business_id, l.assessment_id, l.origin, l.source, l.introducer_id, i.firm_name, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, u.display_name AS owner_name, l.priority, l.status, l.claim_id, c.claim_ref, b.name AS business_name, b.sector AS business_sector, (SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, a.shown_low_pence, a.shown_high_pence FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN claims c ON c.id = l.claim_id LEFT JOIN introducers i ON i.id = l.introducer_id LEFT JOIN assessments a ON a.id = l.assessment_id ORDER BY l.lead_date DESC, l.id ASC LIMIT 1000",
    call: (db) => SPLIT.listLeadsRows(db), params: [[]], atLeast: 1 },
  { name: 'listPropertiesIdBusinessId',
    old: "SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id ORDER BY b.name ASC, p.label ASC LIMIT ?",
    call: from('listPropertiesIdBusinessId'), params: [[1000], [3], [0]], atLeast: 1 },
  { name: 'listPropertiesIdBusinessIdByBusinessId',
    old: "SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.business_id = ? ORDER BY p.created_at ASC, p.id ASC",
    call: from('listPropertiesIdBusinessIdByBusinessId'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdBusinessIdByLeadIdStatus',
    old: "SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, l.prospect_postcode, l.prospect_event, l.prospect_event_year, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, (SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, b.sector AS business_sector, u.display_name AS owner_name, c.claim_ref AS claim_ref FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN claims c ON c.id = l.claim_id ORDER BY l.lead_date DESC, l.id ASC LIMIT ?",
    call: from('listStaffTasksIdBusinessIdByLeadIdStatus'), params: [[1000], [2]], atLeast: 1 },
  { name: 'listStaffTasksIdClaimRefByClaimIdIsNextAction',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id ORDER BY c.claim_ref ASC LIMIT ?",
    call: from('listStaffTasksIdClaimRefByClaimIdIsNextAction'), params: [[1000], [2]], atLeast: 1 },
  { name: 'listStaffTasksIdClaimRefByClaimIdIsNextAction2',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id ORDER BY c.claim_ref DESC LIMIT ?",
    call: from('listStaffTasksIdClaimRefByClaimIdIsNextAction2'), params: [[1000], [2]], atLeast: 1 },
  { name: 'listStaffTasksIdClaimRefByClaimIdIsNextAction3',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref ASC",
    call: from('listStaffTasksIdClaimRefByClaimIdIsNextAction3'), params: w.B.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdClaimRefByClaimIdIsNextAction4',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.property_id = ? ORDER BY c.claim_ref ASC",
    call: from('listStaffTasksIdClaimRefByClaimIdIsNextAction4'), params: w.P.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdTitleByBusinessIdLeadId',
    old: "SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.business_id = ? OR t.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY t.created_at",
    call: from('listStaffTasksIdTitleByBusinessIdLeadId'), params: w.B.map((x) => [x, x]), atLeast: 1 },
  { name: 'listStaffTasksIdTitleByClaimId',
    old: "SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.claim_id = ? ORDER BY t.created_at",
    call: from('listStaffTasksIdTitleByClaimId'), params: w.C.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdTitleByIntroducerIdStatus',
    old: "SELECT t.id, t.title, t.description, t.activity_type, t.status, t.due_on, t.completed_at, t.cancelled_at, t.owner_id, t.owner_role, o.display_name AS owner, cu.display_name AS completer, c.full_name AS person FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cu ON cu.id = t.completed_by LEFT JOIN contacts c ON c.id = t.contact_id WHERE t.introducer_id = ? ORDER BY t.status IN ('COMPLETED','CANCELLED'), t.due_on IS NULL, t.due_on ASC, t.completed_at DESC, t.created_at DESC",
    call: from('listStaffTasksIdTitleByIntroducerIdStatus'), params: w.I.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdTitleByLeadId',
    old: "SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.lead_id = ? ORDER BY t.created_at",
    call: from('listStaffTasksIdTitleByLeadId'), params: w.L.map((x) => [x]), atLeast: 1 },
  { name: 'listStaffTasksIdTitleByPropertyIdClaimId',
    old: "SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.property_id = ? OR t.claim_id IN (SELECT c.id FROM claims c WHERE c.property_id = ?) ORDER BY t.created_at",
    call: from('listStaffTasksIdTitleByPropertyIdClaimId'), params: w.P.map((x) => [x, x]), atLeast: 1 },
  { name: 'listUsersIdDisplayNameByDisabledAt',
    old: "SELECT DISTINCT u.id, u.display_name FROM users u JOIN working_times w ON w.user_id = u.id WHERE u.disabled_at IS NULL ORDER BY u.display_name ASC",
    call: from('listUsersIdDisplayNameByDisabledAt'), params: [[]], atLeast: 1 },
  { name: 'searchClaims',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25",
    call: from('searchClaims'), params: [['%', '%'], ['%cr-%', '%none%'], ['%zz%', '%pct%'], ['%loop%', '%loop%'], ['%', '%caf%']], atLeast: 1 },
  { name: 'searchClaimsOfIds',
    old: "SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id IN (SELECT value FROM json_each(?)) AND (lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\') ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25",
    call: from('searchClaimsOfIds'), params: [[JSON.stringify(w.C), '%', '%'], [JSON.stringify([w.claim]), '%', '%'], [JSON.stringify(w.C), '%zz%', '%loop%']], atLeast: 1 },
  { name: 'searchContacts',
    old: "SELECT c.id, c.full_name, c.business_id, c.lead_id, b.name AS business_name FROM contacts c LEFT JOIN businesses b ON b.id = c.business_id WHERE c.introducer_id IS NULL AND (lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\') ORDER BY c.full_name ASC, c.id ASC LIMIT 25",
    call: from('searchContacts'), params: [['%', '%'], ['%a%', '%x%']], atLeast: 1 },
  { name: 'searchNotes',
    old: "SELECT n.id, n.business_id, n.claim_id, n.property_id, substr(n.body, 1, 160) AS snippet, b.name AS business_name FROM internal_notes n JOIN businesses b ON b.id = n.business_id WHERE lower(n.body) LIKE ? ESCAPE '\\' ORDER BY n.created_at DESC, n.id ASC LIMIT 25",
    call: from('searchNotes'), params: [['%'], ['%note%']], atLeast: 1 },
  { name: 'searchOrganisations',
    old: "SELECT b.id, b.name, b.legal_name, b.sector FROM businesses b WHERE lower(b.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.legal_name, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.company_number, '')) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, b.id ASC LIMIT 25",
    call: from('searchOrganisations'), params: [['%', '%', '%'], ['%dent%', '%dent%', '%dent%']], atLeast: 1 },
  { name: 'searchProperties',
    old: "SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\' ORDER BY p.label ASC, p.id ASC LIMIT 25",
    call: from('searchProperties'), params: [['%', '%', '%', '%', '%'], ['%loop%', 'x', 'x', 'x', 'x']], atLeast: 1 },
  { name: 'searchPropertiesOfBusinesses',
    old: "SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.business_id IN (SELECT value FROM json_each(?)) AND (lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\') ORDER BY p.label ASC, p.id ASC LIMIT 25",
    call: from('searchPropertiesOfBusinesses'), params: [[JSON.stringify(w.B), '%', '%', '%', '%', '%'], [JSON.stringify([w.biz]), '%loop%', 'x', 'x', 'x', 'x']], atLeast: 1 },
  { name: 'searchProspects',
    old: "SELECT l.id, l.prospect_organisation FROM leads l WHERE l.business_id IS NULL AND lower(COALESCE(l.prospect_organisation, '')) LIKE ? ESCAPE '\\' ORDER BY l.lead_date DESC, l.id ASC LIMIT 25",
    call: from('searchProspects'), params: [['%'], ['%a%']], atLeast: 1 },

]);

/* The lead backfilled for an organisation: the old INSERT ... SELECT and the split write the same row. */
const BACKFILL_BEFORE = "INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) SELECT ?, b.id, a.id, k.id, cl.id, CASE WHEN a.id IS NOT NULL THEN 'ASSESSMENT' WHEN k.entry_point = 'gated_exit' THEN 'GATED_EXIT' WHEN k.id IS NOT NULL THEN 'BOOKING' ELSE 'STAFF' END, COALESCE(b.source, CASE WHEN a.id IS NOT NULL THEN 'WEBSITE' ELSE 'OTHER' END), NULL, NULL, NULL, COALESCE((SELECT MIN(x.submitted_at) FROM assessments x WHERE x.business_id = b.id), k.created_at, b.created_at), b.owner_id, NULL, NULL, NULL, CASE WHEN cl.id IS NOT NULL THEN 'CONVERTED' ELSE 'NEW' END, NULL, NULL, cl.created_at, b.created_at, b.created_at FROM businesses b LEFT JOIN assessments a ON a.id = (SELECT x.id FROM assessments x WHERE x.business_id = b.id ORDER BY x.submitted_at DESC, x.id DESC LIMIT 1) LEFT JOIN bookings k ON k.id = (SELECT y.id FROM bookings y WHERE y.business_id = b.id ORDER BY y.created_at ASC, y.id ASC LIMIT 1) LEFT JOIN claims cl ON cl.id = COALESCE((SELECT z.id FROM claims z WHERE z.business_id = b.id AND z.assessment_id = a.id ORDER BY z.created_at, z.id LIMIT 1), (SELECT z.id FROM claims z WHERE z.business_id = b.id ORDER BY z.created_at, z.id LIMIT 1)) WHERE b.id = ?";
test('161l2 the client record: the backfilled lead is the row the INSERT ... SELECT wrote, for every organisation', async () => {
  const w = await theWorld();
  const read = (id: string): Row | undefined => w.db.get('SELECT * FROM leads WHERE id = ?', [id]);
  let written = 0;
  // The database's own refusal (a claim already holds a lead: leads_one_per_claim_uq) must come out the same way too.
  const attempt = (write: () => unknown): { row: Row | undefined; refused: string | null } => {
    let refused: string | null = null;
    try { write(); } catch (e) { refused = (e as Error).message; }
    const row = read('lead-old');
    w.db.run("DELETE FROM leads WHERE id = 'lead-old'");
    return { row, refused };
  };
  let refusals = 0;
  for (const b of w.B) {
    const want = attempt(() => w.db.run(BACKFILL_BEFORE, ['lead-old', b]));
    const got = attempt(() => SPLIT.insertLeadsByBusinessIdId(w.db, ['lead-old', b]));
    assert.deepEqual(got, want, b);
    if (want.row !== undefined) written++;
    if (want.refused !== null) refusals++;
  }
  assert.ok(refusals >= 1, 'an organisation whose first claim already has a lead is refused by both');
  // And the values themselves, for every organisation, with the one-lead-per-claim and per-assessment guards off.
  for (const g of w.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'leads' AND sql LIKE '%UNIQUE%'")) w.db.execDdl(`DROP INDEX "${g.name}"`);
  for (const b of w.B) {
    const want = attempt(() => w.db.run(BACKFILL_BEFORE, ['lead-old', b]));
    const got = attempt(() => SPLIT.insertLeadsByBusinessIdId(w.db, ['lead-old', b]));
    assert.deepEqual(got, want, b);
    if (want.row !== undefined) written++;
  }
  assert.ok(written >= 5, `${written} organisations backfilled`);
});

test('161l2 the ports: each is filled by its owner\'s door, and each says so loudly when it is not', async () => {
  const { db, claim } = await theWorld();
  // Filled (the doors above were loaded by this file's imports).
  assert.equal(CLIENTS.isSurveyWalkthrough(db, 'bk-1'), true);
  assert.equal(CLIENTS.isSurveyWalkthrough(db, 'bk-2'), false);
  assert.deepEqual([...CLIENTS.claimRefsFor(db, [claim, 'claim-none', null]).keys()], [claim]);
  assert.ok(ACCEPTANCE.getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint(db, [claim, 'h2', '']) !== undefined);
  // Empty: each fails with words saying what is not set up.
  const unset = undefined as never;
  CLIENTS.setWalkthroughBookingReader(unset);
  assert.throws(() => CLIENTS.isSurveyWalkthrough(db, 'bk-1'), /walk-through is not set up/);
  CLIENTS.setClaimRefsReader(unset);
  assert.throws(() => CLIENTS.claimRefsFor(db, [claim]), /references are not set up/);
  ACCEPTANCE.setReportAcceptanceReader(unset);
  assert.throws(() => ACCEPTANCE.getClientReportAcceptancesAcceptedAtUserIdByClaimIdFingerprint(db, [claim, 'h2', '']), /acceptance of the report is not set up/);
  // Filled again, as the doors fill them.
  await import(`../../src/modules/survey/client-ports.ts?again=${Date.now()}`);
  await import(`../../src/modules/claims/client-ports.ts?again=${Date.now()}`);
  await import(`../../src/modules/portal/crm-ports.ts?again=${Date.now()}`);
  assert.equal(CLIENTS.isSurveyWalkthrough(db, 'bk-1'), true);
});
