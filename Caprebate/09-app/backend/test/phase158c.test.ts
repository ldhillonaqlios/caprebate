/**
 * PHASE 158c — 7 October 2026. The steps staff ticked for other people, found by Phase 158b's run of the invented
 * client from Survey to Closed (04-phase-work/sim-2026-10-06/Friary-House-simulation-findings.md, OneDrive: F34 to F42).
 *
 *   F34, F35  The Valuation gate read the staff tick VALUATION_SIGNED ("Valuation signed by the surveyor"), which the
 *             surveyor could not make and Sales could, while the survey pack had no approved version. The gate now
 *             reads the surveyor's own approval of the pack on a job on the claim, and the tick is retired.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import type { App } from '../src/app.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as CF from './claim-fixtures.ts';

const T0 = '2026-10-07T09:00:00.000Z';
let n = 0;

function staff(app: App): void {
  for (const role of ['SURVEYING', 'SALES', 'ADMIN', 'ACCOUNTING'] as const) {
    app.db.run('INSERT OR IGNORE INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@158c.example.invalid`, `${role.toLowerCase()}@158c.example.invalid`, `${role[0]}${role.slice(1).toLowerCase()} Person`, role, 'x', T0, T0]);
  }
}

function claimAt(app: App, stage: string): { business: string; assessment: string; claim: string } {
  n += 1;
  const business = `b-158c-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Practice ${n} (TEST)`, 'gp', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-158c-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-158c-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'gp', T0, 127_500_00, 255_000_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null,
  });
  return { business, assessment, claim: made.id };
}

const gateNeed = (app: App, claim: string, starts: string) =>
  P.pipelinePanel(app.db, actor('SALES'), P.loadPipelineClaim(app.db, claim)).gate?.needs.find((x) => x.what.startsWith(starts));

describe('F34, F35 — the surveyor’s valuation is the surveyor’s approval of the pack, not a staff tick', () => {
  test('the Valuation gate needs an approved pack on a job on this claim', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'VALUATION');
    CF.noGrants(app, c.claim);
    const before = gateNeed(app, c.claim, 'The surveyor approved and signed the survey pack');
    assert.ok(before !== undefined, 'the need is on the gate');
    assert.equal(before?.met, false);
    assert.match(before?.why ?? '', /Only the surveyor’s approval counts/);
    // Another claim's approval does not open this one.
    const other = claimAt(app, 'VALUATION');
    CF.packApprovedOn(app, other.business, other.assessment, other.claim);
    assert.equal(gateNeed(app, c.claim, 'The surveyor approved')?.met, false);
    CF.packApprovedOn(app, c.business, c.assessment, c.claim);
    const after = gateNeed(app, c.claim, 'The surveyor approved');
    assert.equal(after?.met, true);
    assert.match(after?.why ?? '', /version 1 approved by Surveying Person/);
    app.close();
  });

  test('VALUATION_SIGNED is retired: nobody can tick it, and it is not on the gate', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'VALUATION');
    assert.ok(P.MILESTONES.VALUATION_SIGNED.retired !== undefined);
    for (const role of ['SALES', 'ADMIN'] as const) {
      assert.equal(P.recordMilestone(CF.recordDeps(app), actor(role), c.claim, 'VALUATION_SIGNED', null).ok, false, role);
    }
    assert.equal(gateNeed(app, c.claim, 'Valuation signed by the surveyor'), undefined);
    app.close();
  });
});
