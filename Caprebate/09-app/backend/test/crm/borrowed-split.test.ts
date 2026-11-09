/**
 * THE CRM'S BORROWED STATEMENTS, SPLIT (Phase 161l1). Each statement in src/modules/crm/data-borrowed.ts that read
 * another area's tables is split into the CRM's own read plus a lookup through the owner's front door, or moved to
 * the owner. What the screen shows must not change: the same rows, in the same order, with the same values, and a null
 * wherever the old LEFT JOIN found nothing.
 *
 * So each case below keeps the OLD statement, word for word, and runs it beside the function the CRM now calls, on
 * the seeded database with rows added that the seed does not make: a row whose person is known, one whose person id
 * names nobody, and one with no person at all. The two must give exactly the same rows. The case was green against
 * the old function before the split, and is green against the new one after it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp, fakeHasher, fixedClock } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import type { Db, Param, Row } from '../../src/core/index.ts';
import * as B from '../../src/modules/crm/data-borrowed.ts';
import * as SURVEY from '../../src/modules/survey/index.ts';
import * as INTEGRATIONS from '../../src/integrations/index.ts';
import * as TIMELINE from '../../src/modules/crm/timeline.ts';
import * as INTRODUCERS from '../../src/modules/crm/introducers.ts';
import * as PIPELINE from '../../src/modules/crm/pipeline.ts';
import * as CRM from '../../src/modules/crm/crm.ts';
import * as DASHBOARD from '../../src/modules/crm/dashboard.ts';
import * as ROUTES from '../../src/modules/crm/routes.ts';
import * as COMMUNICATION from '../../src/modules/crm/communication.ts';
import * as VIDEO from '../../src/modules/crm/video-calls.ts';
import * as STAFF_DASHBOARD from '../../src/modules/crm/staff-dashboard.ts';
import * as INBOUND from '../../src/modules/crm/inbound-email.ts';
import * as EMAIL_CHAINS from '../../src/modules/crm/email-chains.ts';
import * as WHATSAPP_IMPORT from '../../src/modules/crm/whatsapp-import.ts';
import * as WHATSAPP from '../../src/modules/crm/whatsapp.ts';
import * as WHATSAPP_PAGE from '../../src/modules/crm/whatsapp-page.ts';

/** The function the CRM now calls by this name: still in its borrowed file, moved to the owner's front door, or split
 * in the CRM file that calls it. */
function from(name: string): Call {
  for (const space of [B, SURVEY, INTEGRATIONS, TIMELINE, INTRODUCERS, PIPELINE, CRM, DASHBOARD, ROUTES, COMMUNICATION, VIDEO, STAFF_DASHBOARD, INBOUND, EMAIL_CHAINS, WHATSAPP_IMPORT, WHATSAPP, WHATSAPP_PAGE] as object[]) {
    const f = (space as Record<string, unknown>)[name];
    if (typeof f === 'function') return f as Call;
  }
  throw new Error(`${name} is not found`);
}

type Info = { name: string; type: string; notnull: number; pk: number };

/** One statement per table the cases fill, every column named, so a case gives only the columns it cares about. */
const INSERTS: Record<string, string> = {
  research_runs: 'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claim_milestones: 'INSERT INTO claim_milestones (id, claim_id, milestone, stage_at, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  claim_stage_moves: 'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  contacts: 'INSERT INTO contacts (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, created_at, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes, updated_at, lead_id, introducer_id, whatsapp_optin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claim_contacts: 'INSERT INTO claim_contacts (id, claim_id, contact_id, linked_by, linked_at, unlinked_by, unlinked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  invoices: 'INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, fee_warning, raised_by, cancelled_at, cancelled_by, cancel_reason, created_at, entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoice_numbers: 'INSERT INTO invoice_numbers (seq, kind, invoice_id, credit_note_id, state, issued_at, issued_by, cancelled_at, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoice_credit_notes: 'INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, corrected_claim_value_pence, issued_on, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  invoice_payments: 'INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, bank_details_confirmed, recorded_by, recorded_at, voided_at, voided_by, void_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  audit_log: 'INSERT INTO audit_log (seq, at, kind, actor_id, actor_role, object_type, object_id, outcome, detail, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  surveyor_jobs: 'INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  survey_packs: 'INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)',
  survey_pack_approvals: 'INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  surveyor_commitments: 'INSERT INTO surveyor_commitments (id, job_id, surveyor_id, a_qualifying_plant_pence, b_building_pence, c_bare_land_pence, qualifying_pct, method_note, committed_at, figures_hash, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  survey_walkthroughs: 'INSERT INTO survey_walkthroughs (id, job_id, booking_id, booked_by, booked_at) VALUES (?, ?, ?, ?, ?)',
  bookings: 'INSERT INTO bookings (id, business_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at, lead_id, cancelled_at, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  video_meetings: 'INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at, cancelled_at, host_opened_at, host_opened_by, host_user_id, call_minutes, call_people, call_checked_at, call_check_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  outbox: 'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id, from_header, reply_to, claim_id, lead_id, contact_id, written_by, send_requested, provider_ref, last_error, thread_key, in_reply_to, references_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  inbound_email: 'INSERT INTO inbound_email (id, received_at, mailbox_uid, message_id, from_address, subject, text_body, matched_outbox_id, business_id, claim_id, contact_id, outcome, queue_reason, client_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  inbound_email_filings: 'INSERT INTO inbound_email_filings (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, rule, filed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  client_messages: 'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  whatsapp_messages: 'INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, error, written_by, filed_by, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  whatsapp_imports: 'INSERT INTO whatsapp_imports (id, business_id, contact_id, phone, status, filename, layout, chat_key, zip_key, file_names, uploaded_by, uploaded_at, us_name, from_date, saved_by, saved_at, added) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  whatsapp_import_lines: 'INSERT INTO whatsapp_import_lines (message_id, import_id, contact_id, sender, attachment, fingerprint) VALUES (?, ?, ?, ?, ?, ?)',
  documents: 'INSERT INTO documents (id, business_id, uploaded_by, filename, declared_type, doc_type, byte_size, sniffed_as, state, strip_recorded_at, quarantine_discharged_at, failure_code, created_at, logical_document_id, version_no, type_code, retention_ref, request_id, original_kept_at, original_delete_after, original_deleted_at, content_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  logical_documents: 'INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
  document_links: 'INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at, unlinked_by, unlinked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  client_tasks: 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at, withdrawn_at, withdrawn_by, due_on, kind, requested_type, claim_id, received_document_id, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  client_task_checks: 'INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  client_message_files: 'INSERT INTO client_message_files (id, message_id, logical_document_id, linked_at) VALUES (?, ?, ?, ?)',
  estimates: 'INSERT INTO estimates (id, assessment_id, business_id, qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, bare_land_pence, multiplier, indicative_lifetime_saving_pence, sealed_at, estimate_hash, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  assessments: 'INSERT INTO assessments (id, business_id, sector, submitted_at, shown_low_pence, shown_high_pence, created_at, company_number, company_status, company_accounts_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  leads: 'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at, prospect_postcode, prospect_event, prospect_event_year, enquiry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  businesses: 'INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, legal_name, company_number, claimant_type, registered_address, trading_address, website, client_status, source, owner_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  claim_deliverables: 'INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, content_hash, logical_document_id, created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  client_report_acceptances: 'INSERT INTO client_report_acceptances (id, claim_id, approval_id, fingerprint, user_id, accepted_at) VALUES (?, ?, ?, ?, ?, ?)',
};

let filler = 0;
/** Puts a row in, filling every required column the case does not care about. Keys and checks are off (see below). */
function put(db: Db, table: string, values: Record<string, Param>): void {
  const sql = INSERTS[table];
  assert.ok(sql !== undefined, `an insert for ${table}`);
  const info = new Map(db.all<Info>('SELECT name, type, "notnull", pk FROM pragma_table_info(?)', [table]).map((c) => [c.name, c]));
  const names = /\(([^)]*)\) VALUES/.exec(sql)![1]!.split(', ');
  assert.deepEqual([...info.keys()].sort(), [...names].sort(), `${table}: the statement names every column`);
  for (const k of Object.keys(values)) assert.ok(info.has(k), `${table}.${k} exists`);
  db.run(sql, names.map((n) => {
    const c = info.get(n)!;
    // A null the schema refuses becomes an id that names nothing: the case still meets a person who is not there.
    if (Object.hasOwn(values, n)) return values[n] === null && c.notnull === 1 ? `${n}-names-nothing` : values[n]!;
    if (c.notnull !== 1) return null;
    filler++;
    return /INT|REAL|NUM/i.test(c.type) ? filler : `${n}-${filler}`;
  }));
}

interface World { db: Db; staff: string; other: string; biz: string; biz2: string; claim: string; claim2: string; lead: string; lead2: string }

let world: Promise<World> | null = null;
function theWorld(): Promise<World> {
  world ??= (async () => {
    const app = await testApp();
    await seed(app.db, fakeHasher(), fixedClock());
    const db = app.db;
    // The cases need rows the workflow's own guards would refuse to make out of order; the reads are what is tested.
    db.execDdl('PRAGMA foreign_keys = OFF');
    db.execDdl('PRAGMA ignore_check_constraints = ON');
    for (const g of db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger'")) db.execDdl(`DROP TRIGGER "${g.name}"`);
    const users = db.all<{ id: string }>("SELECT id FROM users WHERE role <> 'CLIENT' ORDER BY email");
    const staff = users[0]!.id, other = users[1]!.id;
    const claims = db.all<{ id: string; business_id: string }>('SELECT id, business_id FROM claims ORDER BY claim_ref');
    const claim = claims[0]!.id, biz = claims[0]!.business_id;
    const claim2 = claims.find((c) => c.business_id !== biz)!.id;
    const biz2 = claims.find((c) => c.business_id !== biz)!.business_id;
    const lead = db.get<{ id: string }>('SELECT id FROM leads WHERE business_id = ?', [biz])?.id ?? 'lead-j1';
    const t = (n: number): string => `2026-10-0${n}T09:00:00.000Z`;
    const GHOST = 'u-names-nobody';

    // research_runs: a known person, a person who is not there, nobody
    for (const [i, who] of [[1, staff], [2, GHOST], [3, null]] as const) {
      put(db, 'research_runs', { id: `rr-${i}`, business_id: biz, at: t(i), kind: i === 2 ? 'RETRY' : 'RUN', considered: i, fired: 1, not_permitted: 0, failed: 0, actor_id: who });
    }
    // claim_milestones, claim_stage_moves: the seed has some; add a ghost and a nobody
    put(db, 'claim_milestones', { claim_id: claim, milestone: 'ENGAGEMENT_SIGNED_X', recorded_at: t(4), recorded_by: GHOST });
    put(db, 'claim_stage_moves', { claim_id: claim, at: t(5), kind: 'MOVE', from_stage: 'A', to_stage: 'REASONED_NEGATIVE', reason_code: 'NO_SUCH_CODE', actor_id: GHOST });
    put(db, 'claim_stage_moves', { claim_id: claim, at: t(4), kind: 'MOVE', from_stage: 'A', to_stage: 'REASONED_NEGATIVE', reason_code: db.get<{ code: string }>("SELECT code FROM reason_lists WHERE list = 'CLAIM_EXIT' LIMIT 1")!.code, actor_id: null });
    put(db, 'claim_stage_moves', { claim_id: claim, at: t(5), kind: 'MOVE', from_stage: 'B', to_stage: 'C', actor_id: staff });
    // claim_contacts: two contacts, names out of order; one link to a contact that is not there; one unlinked
    put(db, 'contacts', { id: 'ct-z', business_id: biz, full_name: 'Zed Person', contact_type: 'CLIENT' });
    put(db, 'contacts', { id: 'ct-a', business_id: biz, full_name: 'Abe Person', contact_type: 'CLIENT' });
    put(db, 'claim_contacts', { id: 'cc-1', claim_id: claim, contact_id: 'ct-z', linked_at: t(1), linked_by: staff });
    put(db, 'claim_contacts', { id: 'cc-2', claim_id: claim, contact_id: 'ct-a', linked_at: t(2), linked_by: GHOST });
    put(db, 'claim_contacts', { id: 'cc-3', claim_id: claim, contact_id: 'ct-none', linked_at: t(3), linked_by: null });
    put(db, 'contacts', { id: 'ct-a2', business_id: biz, full_name: 'Abe Person', contact_type: 'CLIENT' });
    put(db, 'claim_contacts', { id: 'cc-4', claim_id: claim, contact_id: 'ct-z2', linked_at: t(3), linked_by: null, unlinked_at: t(4) });
    put(db, 'contacts', { id: 'ct-z2', business_id: biz, full_name: 'Aaron Gone', contact_type: 'CLIENT' });
    put(db, 'claim_contacts', { id: 'cc-0', claim_id: claim, contact_id: 'ct-a2', linked_at: t(3), linked_by: null });
    // invoices: on the claim, and the company's own (no claim), each with numbers, notes, payments and changes
    put(db, 'invoices', { id: 'inv-1', business_id: biz, claim_id: claim, kind: 'FEE', created_at: t(1), raised_by: staff, cancelled_by: GHOST, cancelled_at: t(2), fee_pence: 100, invoice_status: 'RAISED' });
    put(db, 'invoices', { id: 'inv-2', business_id: biz, claim_id: claim, kind: 'FEE', created_at: t(2), raised_by: null, fee_pence: 200, invoice_status: 'SENT' });
    put(db, 'invoices', { id: 'inv-3', business_id: biz, claim_id: null, kind: 'FEE', created_at: t(3), raised_by: staff, fee_pence: 300, invoice_status: 'RAISED' });
    put(db, 'invoices', { id: 'inv-4', business_id: biz, claim_id: null, kind: 'FEE', created_at: t(4), raised_by: staff, fee_pence: 400, invoice_status: 'RAISED' });
    put(db, 'invoice_numbers', { seq: 9001, invoice_id: 'inv-1', kind: 'INVOICE' });
    put(db, 'invoice_credit_notes', { id: 'icn-1', invoice_id: 'inv-1', recorded_at: t(3), basis: 'FULL', recorded_by: staff });
    put(db, 'invoice_credit_notes', { id: 'icn-2', invoice_id: 'inv-1', recorded_at: t(4), basis: 'PART', recorded_by: GHOST });
    put(db, 'invoice_numbers', { seq: 9002, credit_note_id: 'icn-1', kind: 'CREDIT_NOTE' });
    put(db, 'invoice_payments', { id: 'ip-1', invoice_id: 'inv-1', recorded_at: t(3), recorded_by: staff, voided_by: GHOST, voided_at: t(4) });
    put(db, 'invoice_payments', { id: 'ip-2', invoice_id: 'inv-1', recorded_at: t(5), recorded_by: null });
    const seq = db.get<{ s: number }>('SELECT MAX(seq) AS s FROM audit_log')!.s;
    put(db, 'audit_log', { seq: seq + 1, at: t(6), kind: 'INVOICE_UPDATED', actor_id: staff, object_id: 'inv-3', detail: '{"a":1}' });
    put(db, 'audit_log', { seq: seq + 2, at: t(7), kind: 'INVOICE_UPDATED', actor_id: GHOST, object_id: 'inv-4', detail: '{"a":2}' });
    put(db, 'audit_log', { seq: seq + 3, at: t(8), kind: 'INVOICE_UPDATED', actor_id: staff, object_id: 'inv-1', detail: '{"a":3}' });
    put(db, 'audit_log', { seq: seq + 4, at: t(9), kind: 'INVOICE_UPDATED', actor_id: null, object_id: 'inv-3', detail: '{"a":4}' });
    // survey: jobs (one on a claim that is not there), packs, approvals, commitments, a walk-through
    put(db, 'surveyor_jobs', { id: 'sj-1', business_id: biz, claim_id: claim, surveyor_id: other, state: 'OPEN', created_at: t(1) });
    put(db, 'surveyor_jobs', { id: 'sj-2', business_id: biz, claim_id: 'claim-none', surveyor_id: other, state: 'OPEN', created_at: t(1) });
    put(db, 'surveyor_jobs', { id: 'sj-3', business_id: biz, claim_id: null, surveyor_id: other, state: 'OPEN', created_at: t(0) });
    put(db, 'survey_packs', { id: 'sp-1', job_id: 'sj-1' });
    put(db, 'survey_pack_approvals', { pack_id: 'sp-1', version: 1, approved_at: t(2), approved_by: staff });
    put(db, 'survey_pack_approvals', { pack_id: 'sp-1', version: 2, approved_at: t(3), approved_by: GHOST });
    put(db, 'surveyor_commitments', { id: 'sc-1', job_id: 'sj-1', committed_at: t(2), surveyor_id: other });
    put(db, 'surveyor_jobs', { id: 'sj-4', business_id: biz, claim_id: claim, surveyor_id: staff, state: 'OPEN', created_at: t(2) });
    put(db, 'surveyor_commitments', { id: 'sc-2', job_id: 'sj-4', committed_at: t(3), surveyor_id: GHOST });
    put(db, 'survey_walkthroughs', { booking_id: 'bk-1' });
    // bookings with video meetings: overlapping times, hosts known, unknown and none
    put(db, 'bookings', { id: 'bk-1', business_id: biz, lead_id: lead, channel: 'video', starts_at: t(1), ends_at: t(2), assigned_to: staff, created_at: t(0) });
    put(db, 'bookings', { id: 'bk-2', business_id: biz, channel: 'video', starts_at: t(1), ends_at: t(3), assigned_to: other, created_at: t(0) });
    put(db, 'bookings', { id: 'bk-3', business_id: biz, channel: 'video', starts_at: t(1), ends_at: t(3), assigned_to: GHOST, created_at: t(0) });
    put(db, 'video_meetings', { booking_id: 'bk-1', meeting_id: 'm-1', join_url: 'https://j/1', passcode: 'p', client_token: 'tok-1', host_user_id: staff, host_opened_by: staff, host_opened_at: t(1), created_at: t(1) });
    put(db, 'video_meetings', { booking_id: 'bk-2', meeting_id: 'm-2', join_url: 'https://j/2', passcode: 'p', client_token: 'tok-2', host_user_id: staff, host_opened_by: GHOST, created_at: t(1) });
    put(db, 'video_meetings', { booking_id: 'bk-3', meeting_id: 'm-3', join_url: 'https://j/3', passcode: 'p', client_token: 'tok-3', host_user_id: null, created_at: t(1) });
    put(db, 'video_meetings', { booking_id: 'bk-none', meeting_id: 'm-4', join_url: 'https://j/4', passcode: 'p', client_token: 'tok-4', created_at: t(1) });
    // outbox: on the company, on a claim that is not there, on a lead alone, on a company that is not there, another kind
    put(db, 'outbox', { id: 'o-1', business_id: biz, kind: 'TEMPLATE', written_by: staff, claim_id: claim, contact_id: 'ct-z', created_at: t(1), to_email: 'a@x.invalid', subject: 'One' });
    put(db, 'outbox', { id: 'o-2', business_id: biz, kind: 'FREE_TYPED', written_by: GHOST, claim_id: 'claim-none', contact_id: null, created_at: t(2), to_email: 'b@x.invalid', subject: 'Two' });
    put(db, 'outbox', { id: 'o-3', business_id: null, lead_id: lead, kind: 'NOTIFICATION', written_by: null, created_at: t(3), to_email: 'c@x.invalid', subject: 'Three' });
    put(db, 'outbox', { id: 'o-4', business_id: 'biz-none', kind: 'NOTIFICATION', written_by: staff, contact_id: 'ct-none', created_at: t(4), to_email: 'd@x.invalid', subject: 'Four' });
    put(db, 'outbox', { id: 'o-5', business_id: biz, kind: 'OTHER_KIND', written_by: staff, created_at: t(5), to_email: 'e@x.invalid', subject: 'Five' });
    put(db, 'outbox', { id: 'o-6', business_id: null, lead_id: lead, kind: 'TEMPLATE', written_by: staff, claim_id: claim, created_at: t(6), to_email: 'f@x.invalid', subject: 'Six' });
    // the client's messages, and the emails that came in: filed directly, filed by a rule, on a company not there, unfiled
    put(db, 'client_messages', { id: 'cm-1', business_id: biz, created_at: t(5), body: 'hello', direction: 'IN' });
    put(db, 'inbound_email', { id: 'ie-1', business_id: biz, contact_id: 'ct-z', client_message_id: 'cm-1', matched_outbox_id: 'o-1', mailbox_uid: '5', received_at: t(1), subject: 'Re: One' });
    put(db, 'inbound_email', { id: 'ie-2', business_id: null, contact_id: 'ct-none', mailbox_uid: '12', received_at: t(2), matched_outbox_id: 'o-none' });
    put(db, 'inbound_email_filings', { id: 'g-1', inbound_email_id: 'ie-2', business_id: biz, client_message_id: 'cm-1', filed_by: staff, rule: 'SENDER' });
    put(db, 'inbound_email', { id: 'ie-3', business_id: 'biz-none', mailbox_uid: '3', received_at: t(3), matched_outbox_id: 'o-4' });
    put(db, 'inbound_email', { id: 'ie-4', business_id: null, mailbox_uid: '20', received_at: t(4) });
    put(db, 'inbound_email', { id: 'ie-5', business_id: biz2, client_message_id: 'cm-none', mailbox_uid: '7', received_at: t(5), matched_outbox_id: 'o-2' });
    put(db, 'inbound_email_filings', { id: 'g-2', inbound_email_id: 'ie-5', business_id: biz, filed_by: GHOST, rule: 'HAND' });
    put(db, 'inbound_email', { id: 'ie-6', business_id: null, mailbox_uid: '9', received_at: t(1) });
    put(db, 'inbound_email_filings', { id: 'g-3', inbound_email_id: 'ie-6', business_id: 'biz-none', filed_by: null, rule: 'HAND' });
    // WhatsApp: messages from a known contact and person, a contact and person not there, nobody; imports and their lines
    put(db, 'whatsapp_messages', { id: 'wm-1', business_id: biz, contact_id: 'ct-z', written_by: staff, phone: '+441', created_at: t(1), direction: 'OUT', body: 'one', status: 'SENT' });
    put(db, 'whatsapp_messages', { id: 'wm-2', business_id: biz, contact_id: 'ct-none', written_by: GHOST, phone: '+441', created_at: t(2), direction: 'IN', body: 'two' });
    put(db, 'whatsapp_messages', { id: 'wm-3', business_id: biz, contact_id: null, written_by: null, phone: '+442', created_at: t(2), direction: 'IN', body: 'three' });
    put(db, 'whatsapp_imports', { id: 'iw-1', business_id: biz, contact_id: 'ct-z', uploaded_by: staff, status: 'SAVED', uploaded_at: t(3), added: 2 });
    put(db, 'whatsapp_imports', { id: 'iw-2', business_id: biz, contact_id: 'ct-none', uploaded_by: staff, status: 'SAVED', uploaded_at: t(4), added: 0 });
    put(db, 'whatsapp_imports', { id: 'iw-3', business_id: biz, contact_id: 'ct-a', uploaded_by: GHOST, status: 'SAVED', uploaded_at: t(5), added: 1 });
    put(db, 'whatsapp_imports', { id: 'iw-4', business_id: biz, contact_id: 'ct-a', uploaded_by: other, status: 'PENDING', uploaded_at: t(5), added: 1 });
    put(db, 'whatsapp_imports', { id: 'iw-5', business_id: biz, contact_id: 'ct-a', uploaded_by: other, status: 'SAVED', uploaded_at: t(5), added: 1 });
    put(db, 'whatsapp_import_lines', { message_id: 'wm-1', import_id: 'iw-1', sender: 'Them' });
    put(db, 'whatsapp_import_lines', { message_id: 'wm-2', import_id: 'iw-3', sender: 'Us' });
    put(db, 'whatsapp_import_lines', { message_id: 'wm-3', import_id: 'iw-none', sender: 'Us' });
    const lead2 = db.get<{ id: string }>('SELECT id FROM leads WHERE business_id = ?', [biz2])?.id ?? 'lead-j1-2';
    return { db, staff, other, biz, biz2, claim, claim2, lead, lead2 };
  })();
  return world;
}

type Call = (db: Db, params: readonly Param[]) => Row[] | Row | undefined;
interface Case { name: string; old: string; get?: boolean; call: Call; params: (w: World) => Param[][]; atLeast: number }

const CASES: Case[] = [
  {
    name: 'listResearchRunsAtKindByBusinessId',
    old: 'SELECT r.at, r.kind, r.considered, r.fired, r.not_permitted, r.failed, u.display_name AS who FROM research_runs r ' +
      'LEFT JOIN users u ON u.id = r.actor_id WHERE r.business_id = ? ORDER BY r.at',
    call: from('listResearchRunsAtKindByBusinessId'), params: (w) => [[w.biz], [w.biz2]], atLeast: 3,
  },
  {
    name: 'listClaimMilestonesRecordedAtMilestoneByClaimId',
    old: 'SELECT cm.recorded_at, cm.milestone, u.display_name AS who FROM claim_milestones cm LEFT JOIN users u ON u.id = cm.recorded_by ' +
      'WHERE cm.claim_id = ? ORDER BY cm.recorded_at',
    call: from('listClaimMilestonesRecordedAtMilestoneByClaimId'), params: (w) => [[w.claim], [w.claim2]], atLeast: 1,
  },
  {
    name: 'getClaimStageMovesLabelByClaimIdToStage', get: true,
    old: "SELECT r.label FROM claim_stage_moves m JOIN reason_lists r ON r.list = 'CLAIM_EXIT' AND r.code = m.reason_code " +
      "WHERE m.claim_id = ? AND m.to_stage = 'REASONED_NEGATIVE' ORDER BY m.at DESC, m.rowid DESC LIMIT 1",
    call: from('getClaimStageMovesLabelByClaimIdToStage'), params: (w) => [[w.claim], [w.claim2], ['claim-none']], atLeast: 1,
  },
  {
    name: 'listClaimStageMovesAtKindByClaimId2',
    old: 'SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
      'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at DESC, m.rowid DESC',
    call: from('listClaimStageMovesAtKindByClaimId2'), params: (w) => [[w.claim], [w.claim2]], atLeast: 3,
  },
  {
    name: 'listClaimStageMovesAtKindByClaimId3',
    old: 'SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
      'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at, m.rowid',
    call: from('listClaimStageMovesAtKindByClaimId3'), params: (w) => [[w.claim], [w.claim2]], atLeast: 3,
  },
  {
    name: 'listClaimContactsIdContactIdByClaimIdUnlinkedAt',
    old: 'SELECT k.id, k.contact_id, k.linked_at, ct.full_name, ct.contact_type, u.display_name AS linked_by FROM claim_contacts k ' +
      'JOIN contacts ct ON ct.id = k.contact_id LEFT JOIN users u ON u.id = k.linked_by ' +
      'WHERE k.claim_id = ? AND k.unlinked_at IS NULL ORDER BY ct.full_name ASC, k.id ASC',
    call: from('listClaimContactsIdContactIdByClaimIdUnlinkedAt'), params: (w) => [[w.claim], [w.claim2]], atLeast: 3,
  },
  {
    name: 'listInvoiceCreditNotesRecordedAtBasisByInvoiceId',
    old: 'SELECT c.recorded_at, c.basis, n.seq, u.display_name AS who FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
      'LEFT JOIN users u ON u.id = c.recorded_by WHERE c.invoice_id = ? ORDER BY c.recorded_at',
    call: from('listInvoiceCreditNotesRecordedAtBasisByInvoiceId'), params: () => [['inv-1'], ['inv-2']], atLeast: 2,
  },
  {
    name: 'listInvoicePaymentsRecordedAtVoidedAtByInvoiceId',
    old: 'SELECT p.recorded_at, p.voided_at, u.display_name AS who, v.display_name AS voider FROM invoice_payments p ' +
      'LEFT JOIN users u ON u.id = p.recorded_by LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.recorded_at',
    call: from('listInvoicePaymentsRecordedAtVoidedAtByInvoiceId'), params: () => [['inv-1'], ['inv-2']], atLeast: 2,
  },
  {
    name: 'listInvoicesIdKindByClaimId',
    old: 'SELECT i.id, i.kind, i.created_at, i.cancelled_at, n.seq, u.display_name AS raiser, x.display_name AS canceller FROM invoices i ' +
      "LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = 'INVOICE' LEFT JOIN users u ON u.id = i.raised_by " +
      'LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.created_at',
    call: from('listInvoicesIdKindByClaimId'), params: (w) => [[w.claim], [w.claim2]], atLeast: 2,
  },
  {
    name: 'listAuditLogAtDetailByKindBusinessId',
    old: 'SELECT a.at, a.detail, u.display_name AS who FROM audit_log a JOIN invoices i ON i.id = a.object_id ' +
      "LEFT JOIN users u ON u.id = a.actor_id WHERE a.kind = 'INVOICE_UPDATED' AND i.business_id = ? AND i.claim_id IS NULL ORDER BY a.seq",
    call: from('listAuditLogAtDetailByKindBusinessId'), params: (w) => [[w.biz], [w.biz2]], atLeast: 3,
  },
  {
    name: 'getSurveyPackApprovalsVersionApprovedAtByClaimId', get: true,
    old: 'SELECT a.version, a.approved_at, u.display_name AS name FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
      'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN users u ON u.id = a.approved_by WHERE j.claim_id = ? ' +
      'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1',
    call: from('getSurveyPackApprovalsVersionApprovedAtByClaimId'), params: (w) => [[w.claim], [w.claim2]], atLeast: 1,
  },
  {
    name: 'listSurveyorCommitmentsCommittedAtJobIdByClaimId',
    old: 'SELECT sc.committed_at, sc.job_id, u.display_name AS who FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
      'LEFT JOIN users u ON u.id = sc.surveyor_id WHERE j.claim_id = ? ORDER BY sc.committed_at',
    call: from('listSurveyorCommitmentsCommittedAtJobIdByClaimId'), params: (w) => [[w.claim], [w.claim2]], atLeast: 2,
  },
  {
    name: 'listSurveyorJobsIdBusinessIdBySurveyorId',
    old: 'SELECT j.id, j.business_id, j.surveyor_id, j.state, cl.id AS claim_id, cl.claim_ref, cl.stage FROM surveyor_jobs j ' +
      'LEFT JOIN claims cl ON cl.id = j.claim_id WHERE j.surveyor_id = ? ORDER BY j.created_at ASC, j.id ASC',
    call: from('listSurveyorJobsIdBusinessIdBySurveyorId'), params: (w) => [[w.other], [w.staff]], atLeast: 3,
  },
  {
    name: 'getSurveyWalkthroughsXByBookingId', get: true,
    old: 'SELECT 1 AS x FROM survey_walkthroughs WHERE booking_id = ?',
    call: from('getSurveyWalkthroughsXByBookingId'), params: () => [['bk-1'], ['bk-2']], atLeast: 1,
  },
  {
    name: 'getVideoMeetingsBookingIdMeetingIdByClientTokenCancelledAt', get: true,
    old: 'SELECT v.booking_id, v.meeting_id, v.join_url, v.passcode, b.starts_at, b.ends_at, b.cancelled_at, b.business_id, b.lead_id FROM video_meetings v JOIN bookings b ON b.id = v.booking_id WHERE v.client_token = ? AND v.cancelled_at IS NULL',
    call: from('getVideoMeetingsBookingIdMeetingIdByClientTokenCancelledAt'), params: () => [['tok-1'], ['tok-3'], ['tok-4'], ['tok-none']], atLeast: 1,
  },
  {
    name: 'getVideoMeetingsHostOpenedAtOpenerByBookingId', get: true,
    old: 'SELECT v.host_opened_at, u.display_name AS opener, 1 AS meeting FROM video_meetings v LEFT JOIN users u ON u.id = v.host_opened_by WHERE v.booking_id = ? ORDER BY v.created_at DESC LIMIT 1',
    call: from('getVideoMeetingsHostOpenedAtOpenerByBookingId'), params: () => [['bk-1'], ['bk-2'], ['bk-3'], ['bk-none'], ['bk-x']], atLeast: 1,
  },
  {
    name: 'getBookingsCountByIdChannel', get: true,
    old: `SELECT count(*) AS n FROM bookings o
    WHERE o.id <> ? AND o.channel = 'video' AND o.cancelled_at IS NULL AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
    AND o.starts_at < ? AND o.ends_at > ?
    AND coalesce((SELECT m.host_user_id FROM video_meetings m WHERE m.booking_id = o.id AND m.cancelled_at IS NULL), '') = ?`,
    call: from('getBookingsCountByIdChannel'), params: (w) => [['bk-x', '2026-10-09T00:00:00.000Z', '2026-10-01T00:00:00.000Z', w.staff], ['bk-1', '2026-10-09T00:00:00.000Z', '2026-10-01T00:00:00.000Z', w.staff],
      ['bk-x', '2026-10-09T00:00:00.000Z', '2026-10-01T00:00:00.000Z', ''], ['bk-x', '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', w.staff]],
    atLeast: 1,
  },
  {
    name: 'getOutboxXByKindLeadId', get: true,
    old: "SELECT 1 AS x FROM outbox o WHERE o.kind IN ('FREE_TYPED','TEMPLATE') AND (o.lead_id = ? OR o.business_id = (SELECT business_id FROM leads WHERE id = ?)) LIMIT 1",
    call: from('getOutboxXByKindLeadId'), params: (w) => [[w.lead, w.lead], [w.lead2, w.lead2], ['lead-none', 'lead-none']], atLeast: 1,
  },
  {
    name: 'listOutboxAtToEmailByKind',
    old: "SELECT o.created_at AS at, o.to_email, b.name AS company, o.subject, o.sent_at, o.send_requested, o.last_error, o.provider_ref FROM outbox o LEFT JOIN businesses b ON b.id = o.business_id " +
      "WHERE o.kind IN ('FREE_TYPED','TEMPLATE','NOTIFICATION') ORDER BY o.created_at DESC LIMIT 8",
    call: from('listOutboxAtToEmailByKind'), params: () => [[]], atLeast: 5,
  },
  {
    name: 'listOutboxIdCreatedAtByBusinessId',
    old: 'SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
      'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.business_id = ? ORDER BY o.created_at, o.id',
    call: from('listOutboxIdCreatedAtByBusinessId'), params: (w) => [[w.biz], [w.biz2], ['biz-none']], atLeast: 4,
  },
  {
    name: 'listOutboxIdCreatedAtByLeadIdBusinessId',
    old: 'SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
      'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at, o.id',
    call: from('listOutboxIdCreatedAtByLeadIdBusinessId'), params: (w) => [[w.lead], [w.lead2]], atLeast: 2,
  },
  {
    name: 'listOutboxCreatedAtKindByBusinessId',
    old: 'SELECT o.created_at, o.kind, o.subject, o.sent_at, c.claim_ref, u.display_name AS who, ct.full_name AS to_name FROM outbox o LEFT JOIN claims c ON c.id = o.claim_id LEFT JOIN users u ON u.id = o.written_by LEFT JOIN contacts ct ON ct.id = o.contact_id WHERE o.business_id = ? ORDER BY o.created_at',
    call: from('listOutboxCreatedAtKindByBusinessId'), params: (w) => [[w.biz], [w.biz2], ['biz-none']], atLeast: 4,
  },
  {
    name: 'listOutboxCreatedAtKindByLeadIdBusinessId',
    old: 'SELECT o.created_at, o.kind, o.subject, o.sent_at, c.claim_ref, u.display_name AS who, ct.full_name AS to_name FROM outbox o LEFT JOIN claims c ON c.id = o.claim_id LEFT JOIN users u ON u.id = o.written_by LEFT JOIN contacts ct ON ct.id = o.contact_id WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at',
    call: from('listOutboxCreatedAtKindByLeadIdBusinessId'), params: (w) => [[w.lead], [w.lead2]], atLeast: 2,
  },
  {
    name: 'listInboundEmailIdReceivedAt',
    old: 'SELECT e.id, e.received_at, e.from_address, e.subject, e.text_body, e.message_id, e.matched_outbox_id, e.claim_id, c.full_name AS contact, m.created_at AS read_at ' +
      'FROM inbound_email e LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id LEFT JOIN contacts c ON c.id = e.contact_id ' +
      'LEFT JOIN client_messages m ON m.id = COALESCE(e.client_message_id, g.client_message_id) ' +
      'WHERE COALESCE(e.business_id, g.business_id) = ? ORDER BY e.received_at, e.id',
    call: from('listInboundEmailIdReceivedAt'), params: (w) => [[w.biz], [w.biz2], ['biz-none']], atLeast: 4,
  },
  {
    name: 'listInboundEmailUidAt',
    old: 'SELECT e.mailbox_uid AS uid, e.received_at AS at, e.from_address, e.subject, e.outcome, e.queue_reason, e.matched_outbox_id AS matched, ' +
      'ob.name AS ours_company, COALESCE(fb.name, gb.name) AS filed_on, u.display_name AS by, g.rule, fb.name AS direct ' +
      'FROM inbound_email e LEFT JOIN outbox o ON o.id = e.matched_outbox_id LEFT JOIN businesses ob ON ob.id = o.business_id ' +
      'LEFT JOIN businesses fb ON fb.id = e.business_id LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id ' +
      'LEFT JOIN businesses gb ON gb.id = g.business_id LEFT JOIN users u ON u.id = g.filed_by ' +
      'ORDER BY CAST(e.mailbox_uid AS INTEGER) DESC LIMIT 12',
    call: from('listInboundEmailUidAt'), params: () => [[]], atLeast: 6,
  },
  {
    name: 'getWhatsappImportLinesImportIdUploadedAtByMessageId', get: true,
    old: 'SELECT l.import_id, i.uploaded_at, u.display_name AS by FROM whatsapp_import_lines l JOIN whatsapp_imports i ON i.id = l.import_id ' +
      'JOIN users u ON u.id = i.uploaded_by WHERE l.message_id = ?',
    call: from('getWhatsappImportLinesImportIdUploadedAtByMessageId'), params: () => [['wm-1'], ['wm-2'], ['wm-3'], ['wm-none']], atLeast: 1,
  },
  {
    name: 'listWhatsappImportsIdContactByBusinessIdStatus',
    old: 'SELECT i.id, c.full_name AS contact, i.status, i.uploaded_at, u.display_name AS by, i.added FROM whatsapp_imports i ' +
      'JOIN contacts c ON c.id = i.contact_id JOIN users u ON u.id = i.uploaded_by WHERE i.business_id = ? AND i.status <> ? ORDER BY i.uploaded_at DESC, i.id',
    call: from('listWhatsappImportsIdContactByBusinessIdStatus'), params: (w) => [[w.biz, 'PENDING'], [w.biz, 'NONE'], [w.biz2, 'PENDING']], atLeast: 3,
  },
  {
    name: 'listWhatsappMessagesCreatedAtDirectionByBusinessId',
    old: 'SELECT w.created_at, w.direction, w.body, w.status, w.error, c.full_name AS contact, u.display_name AS writer, w.phone FROM whatsapp_messages w ' +
      'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by WHERE w.business_id = ? ORDER BY w.created_at',
    call: from('listWhatsappMessagesCreatedAtDirectionByBusinessId'), params: (w) => [[w.biz], [w.biz2]], atLeast: 3,
  },
  {
    name: 'listWhatsappMessagesIdCreatedAtByBusinessId',
    old: 'SELECT w.id, w.created_at, w.direction, w.body, w.status, w.error, w.contact_id, c.full_name AS contact, u.display_name AS writer, w.phone, l.sender FROM whatsapp_messages w ' +
      'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by LEFT JOIN whatsapp_import_lines l ON l.message_id = w.id ' +
      'WHERE w.business_id = ? ORDER BY w.created_at, w.id',
    call: from('listWhatsappMessagesIdCreatedAtByBusinessId'), params: (w) => [[w.biz], [w.biz2]], atLeast: 3,
  },
  {
    name: 'listWhatsappMessagesIdCreatedAtByBusinessIdPhone',
    old: 'SELECT w.id, w.created_at, w.direction, w.body, w.status, w.error, c.full_name AS contact, u.display_name AS writer, l.sender FROM whatsapp_messages w ' +
      'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by LEFT JOIN whatsapp_import_lines l ON l.message_id = w.id ' +
      'WHERE w.business_id = ? AND w.phone = ? ORDER BY w.created_at, w.id',
    call: from('listWhatsappMessagesIdCreatedAtByBusinessIdPhone'), params: (w) => [[w.biz, '+441'], [w.biz, '+442'], [w.biz2, '+441']], atLeast: 3,
  },
];

for (const c of CASES) {
  test(`161l1: ${c.name} gives the rows the old statement gave`, async () => {
    const w = await theWorld();
    let seen = 0;
    for (const p of c.params(w)) {
      const want = c.get === true ? w.db.get(c.old, p) : w.db.all(c.old, p);
      const got = c.call(w.db, p);
      assert.deepEqual(got, want, `${c.name}(${JSON.stringify(p)})`);
      if (c.get === true) { if (want !== undefined && Object.values(want).some((v) => v !== 0 && v !== null)) seen++; }
      else seen += (want as Row[]).length;
    }
    assert.ok(seen >= c.atLeast, `${c.name}: the case meets ${seen} rows, at least ${c.atLeast} wanted`);
  });
}
