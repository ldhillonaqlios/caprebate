/**
 * PHASE 160, 10 October 2026 — THE SWEEP'S BUILD (job B, carried in by Phase 159l): A FILING PER RETURN WHERE STAFF
 * RECORD IT. The client has no accountant (src/web/client-filing.ts route CLIENT), so staff record each return's filing
 * (migration 116), as the accountant confirms each by its own link on the other route (Phase 159l). The claim closes
 * once every return already due is recorded as filed; a later one is held in aftercare with its due date (Word question
 * 283). Each test fails on the code before this phase: migration 116 and `staffReturnFilings` do not exist.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as PE from '../src/web/property-events.ts';
import * as PL from '../src/web/pipeline.ts';
import * as R from '../src/web/claim-record.ts';
import { figuresBlock } from '../src/web/claim-record-pages.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-09-01T00:00:00.000Z';

/** A company with no accountant that bought a surgery in June 2019 and refitted it in June 2025, year end 31 December,
 *  still owned, at the defence pack with a reconciliation open and no filing recorded. Today is 8 September 2026. */
function staffRoute(app: App, refit = true) {
  for (const [id, role] of [['u-SALES', 'SALES'], ['u-ADMIN', 'ADMIN'], ['u-SURVEYING', 'SURVEYING']] as const) {
    if (app.db.get('SELECT id FROM users WHERE id = ?', [id]) === undefined) {
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
    }
  }
  const b = `b-${randomUUID()}`, p = `p-${randomUUID()}`, as = `as-${randomUUID()}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type,company_number) VALUES (?,?,?,?,?,?,?)', [b, 'Own Filing Limited', 'gp', 'SURVEY', T, 'COMPANY', '07654321']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)', [p, b, 'Own Filing Surgery', 'ZZ9 9ZZ', T, '2019-06-15']);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 19_500_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${as}`, as, b, 19_500_000, 0.3, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T },
    [{ type: 'purchase', cost: 650000, date: '06/2019' }, ...(refit ? [{ type: 'refurb', cost: 90000, date: '06/2025' }] : [])]);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'DEFENCE_PACK', owner_id: null, surveyor_id: null }).id;
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_START', '2019-01-01');
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_END', '2019-12-31');
  CF.fact(app, claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
  const task = `ct-${randomUUID()}`;
  app.db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at) ' +
    "VALUES (?, ?, 'u-SALES', 'Your year end?', 'why', 'this claim', 'ANSWERED', 'ANSWERED', '31 December', ?, NULL, 'CLIENT', ?, 'year_end', ?)", [task, b, T, T, T]);
  app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, 'u-SALES', ?)", [randomUUID(), b, `ans.${task}`, T]);
  // The client has no accountant: their own written yes, recorded after the claim reached Reports.
  app.db.run("INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, 'u-SALES', 'SALES', 'FORWARD', 'TAX_ADVISER_SIGNOFF', 'REPORTS', NULL, NULL)", [randomUUID(), claim, T]);
  app.db.run("INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, no_accountant_or_adviser, will_file_amendment, last_day_acknowledged, last_day_stated, remains_responsible, written_evidence, recorded_by, recorded_at) " +
    "VALUES (?, ?, ?, 'CLIENT', 'YES', 'YES', 'YES', '2026-12-31', 'YES', 'the client’s email (TEST)', 'u-SALES', ?)", [randomUUID(), claim, b, '2026-09-02T00:00:00.000Z']);
  // The reconciliation the sign-off opens, with no filing on it.
  const s = CF.signOffRow(app, b, as, claim);
  const k = app.db.get<{ commitment_id: string; figure_pence: number }>('SELECT commitment_id, figure_pence FROM tax_adviser_signoffs WHERE id = ?', [s]);
  const fig = app.db.get<{ a: number; h: string }>('SELECT a_qualifying_plant_pence AS a, figures_hash AS h FROM surveyor_commitments WHERE id = ?', [k?.commitment_id ?? '']);
  const ref = app.db.get<{ claim_ref: string }>('SELECT claim_ref FROM claims WHERE id = ?', [claim])?.claim_ref ?? '';
  app.db.run('INSERT INTO claim_reconciliations (id, claim_id, case_id, client_sector, b_basis, surveyor_value_pence, surveyor_commitment_id, surveyor_figures_hash, c_value_pence, c_date_captured, c_cta_reviewer, c_signoff_id, opened_at, snapshot_hash, status) ' +
    "VALUES (?, ?, ?, 'gp', 'a fixture', ?, ?, ?, ?, '2026-09-01', 'CAPREBATE_CTA', ?, ?, ?, 'OPEN_OUTCOME_PENDING')",
    [randomUUID(), claim, ref, fig?.a ?? 0, k?.commitment_id ?? '', fig?.h ?? '', k?.figure_pence ?? 0, s, app.now(), 'f'.repeat(64)]);
  return { b, p, claim };
}
const record = (app: App, claim: string, f: Record<string, string>) => R.recordFiling(CF.recordDeps(app), actor('SALES'), claim, f);
const closing = (app: App, claim: string) => PL.gateOut(app.db, PL.loadPipelineClaim(app.db, claim), 'DEFENCE_PACK', { today: app.now() }).needs.find((n) => /filed|filing/.test(n.what));

describe('job B — a filing per return, where staff record it', () => {
  test('two returns: each recorded on its own; the claim closes once the return already due is filed; the later one waits in aftercare', async () => {
    const app = await testApp();
    const w = staffRoute(app);
    assert.equal(R.accountantFiles(app.db, w.claim), false);
    const each = R.staffReturnFilings(app.db, w.claim, app.now()) ?? [];
    assert.deepEqual(each.map((x) => [x.period_end, x.due_on, x.state]), [['2024-12-31', '2025-12-31', 'NOT_FILED'], ['2025-12-31', '2026-12-31', 'NOT_DUE']]);
    assert.equal(closing(app, w.claim)?.met, false);
    assert.match(closing(app, w.claim)?.why ?? '', /period ending 31 Dec 2024.*no filing is recorded.*period ending 31 Dec 2025.*not due until 31 Dec 2026/);
    // The form asks which return, and one date for the whole claim no longer fits.
    const page = figuresBlock(w.claim, R.figuresPanel(app.db, actor('SALES'), w.claim, app.now())).toString();
    assert.match(page, /This claim goes into 2 tax returns/);
    assert.match(page, /name="period_end"/);
    const vague = record(app, w.claim, { filed_on: '2026-08-20' });
    assert.equal(vague.ok, false);
    assert.match(vague.ok ? '' : vague.why, /more than one tax return/);
    // The 2024 return: recorded; the claim's filing date is that day; the close opens.
    assert.equal(record(app, w.claim, { filed_on: '2026-08-20', period_end: '2024-12-31' }).ok, true);
    assert.equal(app.db.get<{ f: string }>('SELECT filed_on AS f FROM claim_reconciliations WHERE claim_id = ?', [w.claim])?.f, '2026-08-20');
    assert.equal(closing(app, w.claim)?.met, true, closing(app, w.claim)?.why ?? '');
    const twice = record(app, w.claim, { filed_on: '2026-08-21', period_end: '2024-12-31' });
    assert.equal(twice.ok, false, 'a recorded filing does not change');
    // The later return is held in aftercare with its due date, and is recorded there once filed.
    const after = () => R.aftercarePanel(app.db, actor('ADMIN'), w.claim, { today: app.now() }).returns_to_file;
    assert.deepEqual(after().map((x) => [x.period_end, x.due_on]), [['2025-12-31', '2026-12-31']]);
    assert.equal(record(app, w.claim, { filed_on: '2026-09-01', period_end: '2025-12-31' }).ok, true);
    assert.deepEqual(after(), []);
    // Never changed, never deleted.
    assert.throws(() => app.db.run("UPDATE claim_return_filings SET filed_on = '2026-01-01' WHERE claim_id = ?", [w.claim]), /never changed/);
    assert.throws(() => app.db.run('DELETE FROM claim_return_filings WHERE claim_id = ?', [w.claim]), /never deleted/);
    app.close();
  });

  test('only the later return recorded: the one already due still holds the claim; one return only: one date, as before', async () => {
    const app = await testApp();
    const w = staffRoute(app);
    assert.equal(record(app, w.claim, { filed_on: '2026-08-20', period_end: '2025-12-31' }).ok, true);
    assert.equal(closing(app, w.claim)?.met, false);
    const one = staffRoute(app, false);
    assert.equal(R.staffReturnFilings(app.db, one.claim, app.now()), null);
    assert.equal(record(app, one.claim, { filed_on: '2026-08-20' }).ok, true);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claim_return_filings WHERE claim_id = ?', [one.claim])?.n, 0);
    assert.equal(closing(app, one.claim)?.met, true, closing(app, one.claim)?.why ?? '');
    assert.equal(record(app, one.claim, { filed_on: '2026-08-21' }).ok, false, 'one date, recorded once');
    app.close();
  });
});
