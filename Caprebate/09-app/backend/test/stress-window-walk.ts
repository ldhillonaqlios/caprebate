/**
 * PHASE 159j (item 1), 10 October 2026 — THE AMENDMENT WINDOW, CLAIMANT TYPE x YEAR END x PURCHASE YEAR, AS A TABLE.
 *
 * The stress test of 9 October 2026 printed this by hand (04-phase-work/stress-2026-10-09/claim/h3-window.ts, in
 * OneDrive). Here it is made the same way every time — today is fixed at WINDOW_NOW — and each row (the claimant, the
 * year end, the purchase, the period recorded, and the window's state, deadline and words) is recorded in
 * test/fixtures/phase159j/window-table.csv by `node tools/window-table-record.ts`. test/phase159j.test.ts checks every
 * row, so a window that opens or closes differently is never silent. To move rows on purpose: re-record, read the diff.
 */
import { randomUUID } from 'node:crypto';
import { testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import { insertClaim } from '../src/web/crm.ts';
import { amendmentWindowReading } from '../src/web/claim-facts.ts';
import type { App } from '../src/app.ts';

export const WINDOW_NOW = '2026-10-09T12:00:00.000Z';
const T0 = '2026-09-08T00:00:00.000Z';
export const CLAIMANTS: readonly (string | null)[] = ['COMPANY', 'PARTNERSHIP', 'LLP', 'SOLE_TRADER', 'CHARITY', null];
export const YEAR_ENDS: readonly (readonly [string, readonly [number, number]])[] = [['31 Mar', [3, 31]], ['5 Apr', [4, 5]], ['30 Jun', [6, 30]], ['31 Dec', [12, 31]]];

export type WindowClaim = { id: string; business_id: string; property_id: string };
export type WindowRig = { app: App; claimFor: (claimant: string | null, acq: string, start: string | null, end: string | null) => WindowClaim };

/** An in-memory app and a way to make a claim on one building with its purchase date and accounting period. */
export async function windowRig(): Promise<WindowRig> {
  const app = await testApp();
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
  let n = 0;
  const claimFor = (claimant: string | null, acq: string, start: string | null, end: string | null): WindowClaim => {
    n += 1;
    const b = `b-w-${String(n)}`, p = `p-w-${String(n)}`, a = `a-w-${String(n)}`;
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Window ${String(n)}`, 'dental', 'ASSESSMENT_SUBMITTED', T0, claimant]);
    app.db.run('INSERT INTO properties (id,business_id,label,created_at,acquisition_date) VALUES (?,?,?,?,?)', [p, b, 'Main site', T0, acq]);
    app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [a, b, 'dental', T0, 1, 2, T0]);
    const made = insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: a, workstream: 'PLANT_AND_MACHINERY', stage: 'REPORTS', owner_id: null, surveyor_id: null });
    if (start !== null) CF.fact(app, made.id, 'ACCOUNTING_PERIOD_START', start);
    if (end !== null) CF.fact(app, made.id, 'ACCOUNTING_PERIOD_END', end);
    return { id: made.id, business_id: b, property_id: p };
  };
  return { app, claimFor };
}

const pad = (x: number) => String(x).padStart(2, '0');
/** The twelve-month period ending on the year end that contains the purchase. */
export function periodContaining(acq: string, ye: readonly [number, number]): { start: string; end: string } {
  const y = Number(acq.slice(0, 4));
  let end = `${String(y)}-${pad(ye[0])}-${pad(ye[1])}`;
  if (end < acq) end = `${String(y + 1)}-${pad(ye[0])}-${pad(ye[1])}`;
  const e = new Date(end + 'T00:00:00Z'); e.setUTCFullYear(e.getUTCFullYear() - 1); e.setUTCDate(e.getUTCDate() + 1);
  return { start: e.toISOString().slice(0, 10), end };
}

export const WINDOW_HEADER = 'claimant,year_end,acquisition,period_start,period_end,state,deadline,why';

/** Every claimant type x year end x purchase on 15 June of each year 2010-2026, read on WINDOW_NOW. */
export async function windowTable(): Promise<string[]> {
  const { app, claimFor } = await windowRig();
  const rows: string[] = [];
  for (const cl of CLAIMANTS) for (const [yeName, ye] of YEAR_ENDS) for (let y = 2010; y <= 2026; y++) {
    const acq = `${String(y)}-06-15`;
    if (acq > WINDOW_NOW.slice(0, 10)) continue;
    const per = periodContaining(acq, ye);
    const w = amendmentWindowReading(app.db, claimFor(cl, acq, per.start, per.end), WINDOW_NOW);
    rows.push([cl ?? 'null', yeName, acq, per.start, per.end, w.state, w.deadline ?? '', JSON.stringify(w.why)].join(','));
  }
  return rows;
}
