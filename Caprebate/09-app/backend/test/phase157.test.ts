/**
 * PHASE 157 (THE SWEEP), 6 OCTOBER 2026 — THE LOOSE ENDS PARKED IN THE SWEEP, BUILT.
 *
 * 1 · From Phase 153c: the deletion path for a lost four-stage-funnel enquiry (src/web/enquiry-retention.ts,
 *     leadDeletionPlan; migration 093), under ENQUIRY_RETENTION, which ships OFF (Word question 222, the officer's).
 *
 * Everything here is invented; nothing goes out.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { readFileSync } from 'node:fs';
import { Db, migrate } from '../src/db.ts';
import { MIGRATIONS_DIR } from '../src/app.ts';
import { FUNNEL_EDGES } from '../src/web/funnel-edges.ts';
import { funnelEdges, render } from '../tools/gen-funnel-edges.ts';
import {
  ENQUIRY_RETENTION, FUNNEL_DELETABLE, leadDeletionPlan, sweepEnquiries, type EnquiryRetention,
} from '../src/web/enquiry-retention.ts';

const ON: EnquiryRetention = { ...ENQUIRY_RETENTION, enabled: true, approved_by: 'Invented officer (test only)', review_ref: 'TEST-REVIEW-157' };
const NOW = '2026-10-06T09:00:00.000Z';
const LONG_AGO = '2025-06-01T09:00:00.000Z';

describe('1 · a lost funnel enquiry past the period is deleted with its own rows, or kept with the reason', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-157-')), publicOrigin: 'https://caprebate.example.invalid' });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const a = made.server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  });
  after(() => made.close());

  /** One enquiry through the four-stage funnel, closed by email; its lead's id. */
  async function enquiry(name: string): Promise<{ lead: string; business: string }> {
    let cookie = '';
    const req = async (path: string, f?: Record<string, string>) => {
      const r = await fetch(base + path, { redirect: 'manual', ...(f === undefined ? {} : { method: 'POST', body: new URLSearchParams(f).toString() }),
        headers: { ...(f === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }), ...(cookie ? { cookie } : {}) } });
      for (const s of r.headers.getSetCookie()) { const p = s.split(';')[0] ?? ''; const k = p.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), p].join('; '); }
      return { status: r.status, location: r.headers.get('location'), body: await r.text() };
    };
    await req('/assessment');
    await req('/assessment/buildings', { b0_sector: 'care_homes' });
    await req('/assessment/spend-on', { b0_trigger: 'purchase' });
    await req('/assessment/amounts', { b0_spend: '1500000', b0_date: '06/2021' });
    await req('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
    await req('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' });
    await req('/assessment/works', { b0_works: 'no' });
    const d = await req('/assessment/details', { b0_business: `${name} Care Homes Limited`, b0_entity: 'ltd', b0_line1: '1 Invented Street', b0_town: 'Hinckley', b0_postcode: 'LE10 1DA' });
    assert.equal(d.location, '/assessment/figure', d.body.slice(0, 300));
    const c = await req('/assessment/close', { first_name: name, surname: 'Inventedperson', job_role: 'owner_director', channel: 'email', email: `${name.toLowerCase()}.157@example.invalid`, contact_consent: 'on' });
    assert.ok(c.status === 303 || c.status === 200, `${c.status} ${c.body.slice(0, 200)}`);
    const row = made.app.db.get<{ id: string; business_id: string }>(
      "SELECT l.id, l.business_id FROM leads l JOIN businesses b ON b.id = l.business_id WHERE b.name LIKE ? AND l.enquiry_id IS NOT NULL", [`${name} Care Homes%`]);
    assert.ok(row, 'no funnel lead was made');
    return { lead: row.id, business: row.business_id };
  }
  const lose = (lead: string, at = LONG_AGO): void => {
    made.app.db.run("UPDATE leads SET status = 'LOST', lost_reason = 'NO_RESPONSE', updated_at = ? WHERE id = ?", [at, lead]);
  };
  /** A staff user to set a hold, made once. */
  const staff = (): string => {
    made.app.db.run("INSERT OR IGNORE INTO users (id, email, email_canonical, display_name, role, password_hash, created_at, updated_at) VALUES ('u-157-admin', 'a157@example.invalid', 'a157@example.invalid', 'Admin 157', 'ADMIN', 'x', ?, ?)", [NOW, NOW]);
    return 'u-157-admin';
  };
  const sweep = (cfg: EnquiryRetention = ON) => sweepEnquiries({ db: made.app.db, audit: made.app.audit, now: () => NOW, newId: randomUUID }, cfg);
  /** Literal statements only (tools/lint-sql.cjs): the counts these tests read. */
  const COUNT_SQL: Readonly<Record<string, string>> = {
    'leads|id = ?': 'SELECT COUNT(*) AS n FROM leads WHERE id = ?',
    'businesses|id = ?': 'SELECT COUNT(*) AS n FROM businesses WHERE id = ?',
    'contacts|lead_id = ? OR business_id = ?': 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id = ? OR business_id = ?',
    'properties|business_id = ?': 'SELECT COUNT(*) AS n FROM properties WHERE business_id = ?',
    'assessments|business_id = ?': 'SELECT COUNT(*) AS n FROM assessments WHERE business_id = ?',
  };
  const count = (table: string, where: string, args: unknown[]): number =>
    made.app.db.get<{ n: number }>(COUNT_SQL[`${table}|${where}`] ?? 'SELECT -1 AS n', args as string[])?.n ?? -1;

  test('off, as it ships: nothing is deleted', async () => {
    const e = await enquiry('Olive');
    lose(e.lead);
    const r = sweep(ENQUIRY_RETENTION);
    assert.equal(r.state, 'OFF');
    assert.equal(count('leads', 'id = ?', [e.lead]), 1);
  });

  test('on: the lead, its contact and the organisation it made go together; the deletion log names them and no one', async () => {
    const e = await enquiry('Pippa');
    lose(e.lead);
    assert.ok(count('contacts', 'lead_id = ? OR business_id = ?', [e.lead, e.business]) >= 1, 'the enquiry made no contact');
    const plan = leadDeletionPlan(made.app.db, e.lead, () => true);
    assert.equal(plan.delete, true, plan.delete ? '' : plan.why);
    if (plan.delete) {
      assert.deepEqual([...plan.business_ids], [e.business]);
      for (const t of Object.keys(plan.tables)) assert.ok(FUNNEL_DELETABLE.has(t), t);
    }
    const r = sweep();
    assert.equal(r.state, 'DONE');
    assert.ok(r.state === 'DONE' && r.funnel_leads_deleted >= 1);
    assert.equal(count('leads', 'id = ?', [e.lead]), 0);
    assert.equal(count('businesses', 'id = ?', [e.business]), 0);
    assert.equal(count('contacts', 'lead_id = ? OR business_id = ?', [e.lead, e.business]), 0);
    assert.equal(count('properties', 'business_id = ?', [e.business]), 0);
    assert.equal(count('assessments', 'business_id = ?', [e.business]), 0);
    const log = made.app.db.all<Record<string, unknown>>("SELECT * FROM deletion_log WHERE record_id IN (?, ?)", [e.lead, e.business]);
    assert.deepEqual(log.map((l) => l['record_kind']).sort(), ['FUNNEL_BUSINESS', 'FUNNEL_LEAD']);
    assert.ok(log.every((l) => l['basis_rule'] === 'ENQ-RETENTION'));
    const words = JSON.stringify(log) + JSON.stringify(made.app.audit.entries());
    assert.ok(!words.includes('Pippa') && !words.includes('pippa.157'), 'the person reached a log');
  });

  test('kept, and nothing deleted: a legal hold on the organisation, or a lead lost recently', async () => {
    const withComplaint = await enquiry('Quinn');
    lose(withComplaint.lead);
    made.app.db.run("INSERT INTO legal_holds (id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_by, set_at) VALUES (?, 'LEGAL_HOLD', 'COMPANY', ?, 'DISPUTE', 'An invented dispute', '2027-01-01', ?, ?)",
      [randomUUID(), withComplaint.business, staff(), NOW]);
    const recent = await enquiry('Rhea');
    lose(recent.lead, '2026-09-01T09:00:00.000Z');
    const r = sweep();
    assert.equal(r.state, 'DONE');
    if (r.state === 'DONE') assert.ok(r.funnel_leads_kept.some((k) => k.lead_id === withComplaint.lead && /legal hold/.test(k.why)));
    assert.equal(count('leads', 'id = ?', [withComplaint.lead]), 1);
    assert.equal(count('leads', 'id = ?', [recent.lead]), 1, 'a lead lost a month ago was deleted');
  });

  test('a portal login made for the organisation keeps it', async () => {
    const e = await enquiry('Umar');
    lose(e.lead);
    made.app.db.run("INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, created_at, updated_at, business_id) VALUES (?, 'umar.157@example.invalid', 'umar.157@example.invalid', 'Umar', 'CLIENT', 'x', ?, ?, ?)",
      [randomUUID(), NOW, NOW, e.business]);
    const plan = leadDeletionPlan(made.app.db, e.lead, () => true);
    assert.equal(plan.delete, false);
    if (!plan.delete) assert.match(plan.why, /portal login/);
  });

  test('a row with a reason of its own keeps the lot, and the plan names its table', async () => {
    const e = await enquiry('Sami');
    lose(e.lead);
    made.app.db.run("INSERT INTO website_enquiries (id, created_at, full_name, email, property_type, contact_consent, status, lead_id, handled_by, handled_at) VALUES (?, ?, 'Sami Inventedperson', 'sami.157@example.invalid', 'Care home', 1, 'LEAD', ?, ?, ?)",
      [randomUUID(), NOW, e.lead, staff(), NOW]);
    const plan = leadDeletionPlan(made.app.db, e.lead, () => true);
    assert.equal(plan.delete, false);
    if (!plan.delete) assert.match(plan.why, /website_enquiries/);
    sweep();
    assert.equal(count('leads', 'id = ?', [e.lead]), 1);
  });

  test('the walk is the schema: src/web/funnel-edges.ts is what tools/gen-funnel-edges.ts writes from today\'s migrations', async () => {
    const db = new Db(':memory:');
    migrate(db, MIGRATIONS_DIR);
    assert.equal(render(funnelEdges(db)), readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'funnel-edges.ts'), 'utf8'),
      'the schema gained or lost a foreign key on a funnel table: run node tools/gen-funnel-edges.ts and read the change');
    db.close();
    assert.ok(FUNNEL_EDGES.some((e) => e.parent === 'leads' && e.child === 'website_enquiries'), 'a blocking table is missing from the walk');
  });

  test('the triggers: a lead is still never deleted except under its own deletion-log entry', async () => {
    const e = await enquiry('Tess');
    assert.throws(() => made.app.db.run('DELETE FROM leads WHERE id = ?', [e.lead]), /never deleted/);
    // An entry for a different lead admits nothing.
    made.app.db.run("INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, approved_by, review_ref, executed_by, executed_at, stores_json, backups_pending) VALUES (?, 'FUNNEL_LEAD', 'some-other-lead', 'test', 'ENQ-RETENTION', 'Invented', 'TEST', 'test', ?, '[\"database\"]', 1)",
      [`DEL-ENQ-${randomUUID()}`, NOW]);
    assert.throws(() => made.app.db.run('DELETE FROM leads WHERE id = ?', [e.lead]), /never deleted/);
    // And the organisation's own rows that refuse a delete still refuse one (its lookups choice, here).
    made.app.db.run("INSERT INTO lookups_declined (business_id, declined_at, how) VALUES (?, ?, 'STAFF')", [e.business, NOW]);
    assert.throws(() => made.app.db.run('DELETE FROM lookups_declined WHERE business_id = ?', [e.business]), /kept with their file/);
  });
});
