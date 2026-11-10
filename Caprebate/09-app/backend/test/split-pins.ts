/**
 * PINS FOR A JOIN SPLIT BY OWNER (Phase 161l2; the same idea as test/crm/borrowed-split.test.ts). A statement that joined
 * one area's table to another's is replaced by the area's own read plus a read through the other owner's front door.
 * A pin keeps the OLD statement, word for word, runs it beside the new function on a seeded database with awkward rows
 * added (a row whose other half is missing, NULLs, equal sort keys), and expects exactly the same rows: the same rows,
 * in the same order, with the same keys and values. Not a test file itself: the *.test.ts files beside it use it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, fakeHasher, fixedClock } from './helpers.ts';
import { seed } from '../src/app/seed.ts';
import type { Db, Param, Row } from '../src/core/index.ts';

/**
 * The seeded database with its guards off: the cases need rows the workflow would refuse to make (a row naming another
 * that is not there), and the reads are what is tested.
 */
export async function looseSeededDb(): Promise<Db> {
  const app = await testApp();
  await seed(app.db, fakeHasher(), fixedClock());
  const db = app.db;
  db.execDdl('PRAGMA foreign_keys = OFF');
  db.execDdl('PRAGMA ignore_check_constraints = ON');
  for (const g of db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger'")) db.execDdl(`DROP TRIGGER "${g.name}"`);
  return db;
}

/** One statement per table the pins fill, every column named (the build refuses SQL built from variables). */
const INSERTS: Readonly<Record<string, string>> = {
  contacts: 'INSERT INTO contacts (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at, lead_id, introducer_id, whatsapp_optin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  cdd_checks: 'INSERT INTO cdd_checks (id, business_id, claim_id, claimant_type, claimant_type_note, identified, verification_method, register_ref, evidence_document_id, beneficial_ownership, authority_basis, authority_contact_id, authority_evidence, entity_status, sanctions_screen, sanctions_screened_on, risk_rating, risk_level, risk_rating_basis, checked_on, checked_by, state, completed_at, withdrawn_reason, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  cdd_beneficial_owners: 'INSERT INTO cdd_beneficial_owners (id, check_id, contact_id, basis_of_control, identified_from, evidence_document_id, psc_decision_id, verified_how, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  identity_checks: 'INSERT INTO identity_checks (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  rights_requests: 'INSERT INTO rights_requests (id, request_ref, received_at, received_via, received_via_detail, forwarded_at, forwarded_by, requester_as_described, request_verbatim, contact_id, lead_id, person_ref, classification_alternatives, identity_status, identity_route, identity_standard_applied, identity_evidence, identity_outcome, authority_grantor, id_requested_at, id_received_at, fee_status, fee_charged_at, fee_paid_at, clarification, search_scope, search_done_on, records_found, restriction_applied_at, responded_at, response_route, response_content_check, outcome, status, closed_at, closed_by, recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  businesses: 'INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, legal_name, company_number, claimant_type, registered_address, trading_address, website, client_status, source, owner_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  surveyor_jobs: 'INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  survey_packs: 'INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
  survey_walkthroughs: 'INSERT INTO survey_walkthroughs (id, job_id, booking_id, booked_by, booked_at) VALUES (?, ?, ?, ?, ?)',
  bookings: 'INSERT INTO bookings (id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at, lead_id, cancelled_at, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoices: 'INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, fee_warning, raised_by, cancelled_at, cancelled_by, cancel_reason, created_at, entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start, versions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoice_numbers: 'INSERT INTO invoice_numbers (seq, kind, invoice_id, credit_note_id, state, issued_at, issued_by, cancelled_at, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claims: 'INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, owner_id, surveyor_id, priority, next_action, next_action_due, hold_reason, lost_reason, expected_completion, created_at, updated_at, hold_return_stage, completed_at, tax_adviser_signoff_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  properties: 'INSERT INTO properties (id, business_id, label, postcode, created_at, address_line_1, address_line_2, town, jurisdiction, property_type, property_use, tenure, occupier, acquisition_date, acquisition_price_pence, completion_date, disposal_date, previous_owner, construction_notes, existing_ca_claimed, prior_claim_notes, updated_at, sale_in_prospect, uprn, claimant_role, claimant_role_source, tenure_source, lease_end_date, landlord, council_area, council_area_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  booking_changes: 'INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, from_assigned, to_assigned, at, cancelled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  call_logs: 'INSERT INTO call_logs (id, business_id, claim_id, contact_id, outcome, notes, logged_by, logged_at, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  staff_tasks: 'INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type, business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin, automation_run_id, created_by, created_at, updated_at, started_at, completed_at, completed_by, cancelled_at, cancelled_by, cancel_reason, introducer_id, company_subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  leads: 'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at, prospect_postcode, prospect_event, prospect_event_year, enquiry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  assessments: 'INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at, company_number, company_status, company_accounts_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  introducers: 'INSERT INTO introducers (id, firm_name, introducer_type, owner_id, relationship_started_on, notice_contact_id, notes, created_via, created_at, updated_at, merged_into_id, merged_at, merged_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  introducer_fees: 'INSERT INTO introducer_fees (id, introducer_id, claim_id, business_id, amount_pence, disclosure_given_at, disclosure_recorded_by, state, paid_at, paid_recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  introducer_percentage_entries: 'INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, credit_note_id, entry_kind, basis_pence, percent_bp, amount_pence, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  internal_notes: 'INSERT INTO internal_notes (id, business_id, author_id, body, created_at, claim_id, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  client_messages: 'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  client_message_files: 'INSERT INTO client_message_files (id, message_id, logical_document_id, linked_at) VALUES (?, ?, ?, ?)',
  enquiry_checks: 'INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  client_report_acceptances: 'INSERT INTO client_report_acceptances (id, claim_id, approval_id, fingerprint, user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?)',
  automation_runs: 'INSERT INTO automation_runs (id, rule_id, at, trigger_event, stage, claim_id, lead_id, task_id, business_id, actor_id, outcome, reason, tasks_created, outbox_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  automation_rules: 'INSERT INTO automation_rules (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, source, created_at, updated_at, request_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  client_task_checks: 'INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  client_tasks: 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at, withdrawn_at, withdrawn_by, due_on, kind, requested_type, claim_id, received_document_id, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  introducer_share_consents: 'INSERT INTO introducer_share_consents (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  introducer_reward_setting: 'INSERT INTO introducer_reward_setting (id, model, fee_pence, percent_bp, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?)',
  working_times: 'INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
  estimates: 'INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash, basis, versions_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  video_meetings: 'INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at, cancelled_at, host_opened_at, host_opened_by, host_user_id, call_minutes, call_people, call_checked_at, call_check_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  users: 'INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, disabled_at, created_at, updated_at, business_id, welcome_dismissed_at, password_temporary_until, mfa_method, mfa_secret, mfa_last_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claim_deliverables: 'INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, content_hash, logical_document_id, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
};

let filler = 0;
/** Puts a row in, filling every required column the case does not name (a number or a made-up text). */
export function put(db: Db, table: string, values: Record<string, Param>): void {
  const sql = INSERTS[table];
  assert.ok(sql !== undefined, `an insert for ${table}`);
  const info = new Map(db.all<{ name: string; type: string; notnull: number; dflt_value: unknown }>('SELECT name, type, "notnull", dflt_value FROM pragma_table_info(?)', [table]).map((c) => [c.name, c]));
  const names = /\(([^)]*)\) VALUES/.exec(sql)![1]!.split(', ');
  assert.deepEqual([...info.keys()].sort(), [...names].sort(), `${table}: the statement names every column`);
  for (const k of Object.keys(values)) assert.ok(info.has(k), `${table}.${k} exists`);
  db.run(sql, names.map((n) => {
    const c = info.get(n)!;
    // A null the schema refuses becomes an id that names nothing: the case still meets a row whose other half is not there.
    if (Object.hasOwn(values, n)) return values[n] === null && c.notnull === 1 ? `${n}-names-nothing` : values[n] as Param;
    if (c.notnull !== 1) return null;
    if (c.dflt_value !== null) return String(c.dflt_value).replace(/^'(.*)'$/, '$1');
    filler++;
    return /INT|REAL|NUM/i.test(c.type) ? filler : `${n}-${filler}`;
  }));
}

export type Call = (db: Db, params: readonly Param[]) => Row[] | Row | undefined;
/**
 * One pin: the old statement, the function now called in its place, the parameters to try, and how many rows (or
 * found rows, for a get) the case must meet at least, so a case cannot pass by meeting nothing.
 */
export interface Pin { name: string; old: string; get?: boolean; call: Call; params: Param[][]; atLeast: number }

/** One test per pin. */
export function pinAll<W extends { db: Db }>(label: string, world: () => Promise<W>, pins: (w: W) => Pin[]): void {
  test(`${label}: every split statement gives the rows the old statement gave`, async () => {
    const w = await world();
    for (const c of pins(w)) {
      let seen = 0;
      for (const p of c.params) {
        const want = c.get === true ? w.db.get(c.old, p) : w.db.all(c.old, p);
        const got = c.call(w.db, p);
        assert.deepEqual(got, want, `${c.name}(${JSON.stringify(p)})`);
        if (c.get === true) { if (want !== undefined) seen++; } else seen += (want as Row[]).length;
      }
      assert.ok(seen >= c.atLeast, `${c.name}: the case meets ${seen} rows, at least ${c.atLeast} wanted`);
    }
  });
}
