/**
 * PHASE 132 — A MONTH THAT DOES NOT HAVE THE DAY ENDS ON ITS LAST DAY. 15 September 2026.
 *
 * src/web/claim-record.ts's addMonths built `Date.UTC(y, m - 1 + months, d)`, which rolls a day the target month does
 * not have into the next month: 29 February 2024 plus twelve months read 1 March 2025, 31 January plus one read
 * 3 March. The enquiry window after a filing is twelve months, so a filing on 29 February was held open a day too long.
 * The engine's CB_CASH.addMonths was clamped on 14 September; this is the same rule.
 *
 * WHAT IT PROVES, EACH ONE BOTH WAYS:
 *   the rule        29 February + 12 → 28 February; 31 August + 1 → 30 September; 31 January + 1 → 28 February;
 *                   a day the target month has reads exactly as before (the negative control)
 *   the caller      recordOutcome with no enquiry dates the lapse on 28 February 2025 for a filing on 29 February 2024,
 *                   and on 1 June 2026 for a filing on 1 June 2025
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as R from '../src/web/claim-record.ts';
import * as T from '../src/web/tasks.ts';
import { actor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

type App = Awaited<ReturnType<typeof testApp>>;

const T0 = '2026-09-08T00:00:00.000Z';

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

let n = 0;
/** A claim walked to TAX_ADVISER_SIGNOFF with a commitment, the sign-off recorded through the store, and the variance tagged. */
function signedClaim(app: App): string {
  n += 1;
  const business = `b-p132d-${n}`;
  const property = `p-p132d-${n}`;
  const assessment = `a-p132d-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Phase 132 Dates ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'PLANT_AND_MACHINERY',
    stage: 'TAX_ADVISER_SIGNOFF', owner_id: null, surveyor_id: null,
  });
  P.recordOpened(CF.recordDeps(app), null, made.id, 'TAX_ADVISER_SIGNOFF', 'a test fixture');
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null,
    created_by: 'u-SALES',
  });
  CF.commitmentOn(app, business, assessment, made.id);
  const d = CF.recordDeps(app);
  const r = R.recordSignOff(d, actor('SALES'), made.id, {
    adviser: 'Invented Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
    method_note: 'reviewed against the rulebooks', figure: '100000', confirmed_switches: 'transaction_tax_in_base,grant_after_ceilings',
  });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
  const v = R.recordVariance(d, actor('SALES'), made.id, { variance_category: 'ENGINE_READ' });
  assert.equal(v.ok, true, v.ok ? '' : v.why);
  return made.id;
}

describe('Phase 132 — claim-record.ts adds months without rolling into the next month', () => {
  test('THE RULE: a day the target month does not have is that month’s last day; a day it has reads exactly as before', () => {
    assert.equal(R.addMonths('2024-02-29', 12), '2025-02-28', '29 February 2024 plus twelve months');
    assert.equal(R.addMonths('2026-08-31', 1), '2026-09-30', '31 August plus one month');
    assert.equal(R.addMonths('2026-01-31', 1), '2026-02-28', '31 January 2026 plus one month');
    assert.equal(R.addMonths('2024-01-31', 1), '2024-02-29', '31 January 2024 plus one month — a leap year');
    assert.equal(R.addMonths('2026-12-31', 2), '2027-02-28', 'across a year end');
    // THE NEGATIVE CONTROL: no overflow, no change.
    assert.equal(R.addMonths('2025-06-01', 12), '2026-06-01');
    assert.equal(R.addMonths('2026-01-28', 1), '2026-02-28');
    assert.equal(R.addMonths('2024-02-29', 48), '2028-02-29', 'a leap day to a leap day');
    assert.equal(R.addMonths('2026-12-31', 1), '2027-01-31', 'a 31st into a month of 31 days');
  });

  test('THE CALLER: with no enquiry the outcome is dated on the lapse — 28 February 2025 for a filing on 29 February 2024; 1 June 2026 for a filing on 1 June 2025', async () => {
    const app = await testApp();
    try {
      staff(app);
      const d = CF.recordDeps(app);
      const sales = actor('SALES');
      const lapse = (claim: string): { path: string | null; on: string | null } => {
        const r = app.db.get<{ p: string | null; on: string | null }>('SELECT resolution_path AS p, d_date_captured AS "on" FROM claim_reconciliations WHERE claim_id = ?', [claim]);
        return { path: r?.p ?? null, on: r?.on ?? null };
      };
      const leap = signedClaim(app);
      CF.filingRecorded(app, leap, '2024-02-29'); // PHASE 158d (F46): the accountant's own date
      const out = R.recordOutcome(d, sales, leap, {});
      assert.equal(out.ok, true, out.ok ? '' : out.why);
      assert.deepEqual(lapse(leap), { path: 'NO_ENQUIRY_WINDOW_LAPSED', on: '2025-02-28' });

      const ordinary = signedClaim(app);
      CF.filingRecorded(app, ordinary, '2025-06-01'); // PHASE 158d (F46): the accountant's own date
      assert.equal(R.recordOutcome(d, sales, ordinary, {}).ok, true);
      assert.deepEqual(lapse(ordinary), { path: 'NO_ENQUIRY_WINDOW_LAPSED', on: '2026-06-01' }, 'the negative control');
    } finally { app.close(); }
  });
});
