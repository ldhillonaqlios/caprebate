/**
 * PHASE 159l, 10 October 2026 — WHAT THE SECOND LOCKWOOD RUN FOUND (04-phase-work/sim-2026-10-10-lockwood/, L13-L20).
 *
 * Each test fails on the code before this phase:
 *   item 1 (L13)  the company search's accounts type and status are kept with the assessment (migration 114) and shown
 *                 beside the qualifying-activity check on the lead and on the claim, before the research runs
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import { DORMANT_WORDS } from '../src/connectors/companies-house.ts';
import * as W from '../src/web/who-claims.ts';
import * as F4 from '../src/web/funnel4.ts';
import * as PL from '../src/web/pipeline.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-10-10T09:00:00.000Z';
const ADMIN = actor('ADMIN');

/** The four-stage funnel, through to submission, with the company picked from the search's list. */
function submitWithCompany(app: App, results: Record<string, unknown>[], pick: string): string {
  const s: Record<string, unknown> = {};
  F4.markFunnel4(s);
  const steps: [F4.F4Screen, Record<string, string>][] = [
    ['buildings', { b0_sector: 'gp' }], ['spend-on', { b0_trigger: 'purchase' }], ['amounts', { b0_spend: '250000', b0_date: '06/2020' }],
    ['tax', { b0_tax: 'yes', b0_profit: 'profitable' }], ['claims', { b0_prior: 'no', b0_seller: 'dont_know' }], ['works', { b0_works: 'no' }]];
  for (const [id, f] of steps) assert.deepEqual(F4.applyF4(s, id, new URLSearchParams(f)).errors, [], id);
  F4.buildings(s)[0]!['company_results'] = results;
  assert.deepEqual(F4.applyF4(s, 'details', new URLSearchParams({ b0_business: 'Lockwood Surgery', b0_company_number: pick, b0_entity: 'ltd', b0_line1: '1 Invented Road', b0_postcode: 'ZZ1 1ZZ', b0_use: 'own_use' })).errors, []);
  const out = F4.submitEnquiry(app.db, { token: `tok-${randomUUID()}`, state: s as never, screen: 'Q1' as never }, app.now, randomUUID);
  const b = out.parts[0]?.business_id;
  assert.ok(b);
  return b;
}

describe('item 1 (L13) — the dormant flag before the letter', () => {
  const LOCKWOOD = { name: 'LOCKWOOD SURGERY PRIME HEALTH LTD', number: '09037233', status: 'active', office_postcode: null, accounts_type: 'dormant' };

  test('the search’s accounts type is kept with the assessment, and a dormant company shows on the lead and the claim before the research', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [LOCKWOOD, { name: 'OTHER LTD', number: '01234567', status: 'active', office_postcode: null, accounts_type: 'full' }], '09037233');
    assert.deepEqual(app.db.get('SELECT company_number, company_status, company_accounts_type FROM assessments WHERE business_id = ?', [b]),
      { company_number: '09037233', company_status: 'active', company_accounts_type: 'dormant' });
    assert.equal(app.db.get("SELECT COUNT(*) AS n FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY'", [b])?.['n' as never], 0);
    const ev = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(ev.some((l) => /Companies House, from the company search at the assessment: company number 09037233, active, dormant accounts\./.test(l)), ev.join(' | '));
    assert.ok(ev.includes(DORMANT_WORDS));
    assert.match(W.dormantWarning(app.db, b) ?? '', /dormant accounts.*from the company search at the assessment, company number 09037233/);
    app.close();
  });

  test('a type the search could not read is not known, never "not dormant" (N4); the register record, once read, wins', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [{ ...LOCKWOOD, accounts_type: null }], '09037233');
    assert.equal(W.companyAtAssessment(app.db, b)?.accounts_type, null);
    assert.equal(W.dormantWarning(app.db, b), null);
    const ev = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(ev.some((l) => /company number 09037233, active, accounts type not known\./.test(l)), ev.join(' | '));
    assert.ok(!ev.includes(DORMANT_WORDS));
    // The research's register record is newer: it is the one said, and the search's line goes.
    app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at) VALUES (?,?,?,?,?,?)',
      [randomUUID(), b, 'CH_COMPANY', '09037233', JSON.stringify({ company_number: '09037233', company_status: 'active', accounts_type: 'dormant', accounts_made_up_to: '2025-05-31' }), T]);
    const after = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(after.some((l) => /^Companies House: active, dormant accounts made up to 2025-05-31\./.test(l)));
    assert.ok(!after.some((l) => /from the company search at the assessment/.test(l)));
    assert.match(W.dormantWarning(app.db, b) ?? '', /made up to 2025-05-31/);
    app.close();
  });

  test('no company picked: nothing is kept and nothing is said', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [LOCKWOOD], 'none');
    assert.equal(W.companyAtAssessment(app.db, b), null);
    assert.ok(!PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT.some((l) => /Companies House/.test(l)));
    app.close();
  });
});
