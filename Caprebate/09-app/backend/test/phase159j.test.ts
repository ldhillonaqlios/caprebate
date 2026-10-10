/**
 * PHASE 159j, 10 October 2026 — THE STRESS SUITE IN THE BUILD.
 *
 * The stress test of 9 October 2026 (04-phase-work/stress-2026-10-09/, OneDrive) was a set of harnesses run by hand.
 * Item 1 of this phase keeps them in the suite, seeded so every run makes the same cases:
 *   engine     test/stress-engine-walk.ts — the funnel and the engine over fixed grids and 3,000 seeded multi-building
 *              funnels (engine/harness.ts). Every broken property is a class; only the readings kept on purpose pass.
 *   pack sums  test/stress-pack-walk.ts — 20,000 seeded packs against s.562 worked again in BigInt (claim/h1).
 *   grants     the same file — 10,000 seeded grant runs: pools add up and each grant's row adds to the total (h1, C23).
 *   returns    the same file — 3,000 seeded pools: every row's brought forward less allowance is carried forward (h4, C16).
 *   window     test/stress-window-walk.ts — six claimant types x four year ends x every purchase year, against the table
 *              recorded in test/fixtures/phase159j/window-table.csv (h3), and its named cases.
 * L14 (the Lockwood run of 10 October 2026): the claim page and the sign-off read the adviser's switches as the pack does.
 * Item 5 (carried from Phase 159c): a document names the piece of work it proves, and each event counts its own.
 * Already in the suite before this phase, so not repeated here: the version scenarios (claim/h5) are Phase 159a's C3,
 * C4 and C5 tests (test/phase159a.test.ts), and the legal-path walk (claim/h6) is test/legal-paths.test.ts (Phase 159h).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import * as D from '../src/web/documents.ts';
import { addStaffEvent, eventsOnClaim } from '../src/web/property-events.ts';
import type { Actor } from '../src/authz.ts';
import { factsPanel } from '../src/web/claim-facts.ts';
import { MONEY_READINGS_OFF, MONEY_READINGS_ON, packSwitchReadings } from '../src/web/money-readings.ts';
import { ctaSwitchReadings } from '../src/web/engine.ts';
import { runEngineStress } from './stress-engine-walk.ts';
import { runGrantStress, runPackStress, runReturnStress } from './stress-pack-walk.ts';
import { WINDOW_HEADER, WINDOW_NOW, periodContaining, windowRig, windowTable } from './stress-window-walk.ts';
import * as CF from './claim-fixtures.ts';
import { amendmentWindowReading } from '../src/web/claim-facts.ts';
import { claimRoutes } from '../src/web/claim-route.ts';
import { reportsWindowNeed } from '../src/web/claim-record.ts';

/** The engine harness's findings that are kept ON PURPOSE, each with the Word question that asks the tax adviser. A
 *  class not listed here fails the test; a listed class that no longer appears fails it too, so this list is never stale. */
const KEPT_ON_PURPOSE: Readonly<Record<string, string>> = {
  'engine: seller pooled, no election, window closed (2015 purchase) - QE not nil':
    'Word question 250 — a closed window after a seller pooled and made no election is a referral, not nil',
  'seller claimed (pooled) and no s.198 election/date captured: ceiling unchanged':
    'Word questions 247 and 250 — with the two-year window open, a ceiling can stand until the election is seen',
};

describe('item 1 — the estimate engine, every grid', () => {
  const r = runEngineStress();
  test('the grids are the size the stress test ran', () => {
    assert.deepEqual(r.runs, { gridA1: 9660, gridA2: 16200, gridA3_multi: 3000, gridB_engine: 19500 });
    assert.ok(r.checks > 350_000, `${String(r.checks)} checks`);
  });
  test('no property breaks, apart from the readings kept on purpose', () => {
    const found = r.violations.map((v) => v.cls);
    const unexpected = r.violations.filter((v) => !(v.cls in KEPT_ON_PURPOSE));
    assert.equal(unexpected.length, 0, unexpected.map((v) => `[${v.prop}] x${String(v.count)} ${v.cls}\n  in: ${JSON.stringify(v.input).slice(0, 300)}\n  got: ${JSON.stringify(v.actual).slice(0, 300)}\n  expected: ${v.expected}`).join('\n'));
    assert.deepEqual(found.sort(), Object.keys(KEPT_ON_PURPOSE).sort(), 'a reading kept on purpose no longer shows: take it off the list, and close its question');
  });
  test('Lockwood at the assessment: the purchase and the 2025 refit each add their own band, "up to" one figure everywhere', () => {
    const l = r.lockwood;
    assert.deepEqual(l['errors'], []);
    assert.equal(l['same_without_works'], 195_000, '£650,000 x 30%, the top of the GP purchase band');
    assert.equal(l['client_high'], 258_000, 'the £90,000 refit adds £63,000 at the top of the GP refurbishment band');
    assert.equal(l['stored_high_pence'], 25_800_000);
    assert.equal(l['staff_sees'], 'up to £258,000');
  });
});

describe('item 1 — the pack’s sums, its grants and the return entries, seeded', () => {
  test('20,000 packs: the pools add up, nothing above the building’s price, the share in 0-100%, s.562 to the penny', () => {
    const p = runPackStress();
    assert.equal(p.failures.length, 0, p.failures.slice(0, 10).join('\n'));
    assert.ok(p.complete > 3_000 && p.refused > 10_000, `${String(p.complete)} complete, ${String(p.refused)} refused: the seed reaches both`);
  });
  test('10,000 grant runs: the pools still add up and stay within [0, Q]; each grant’s row adds up to the total (C23)', () => {
    const g = runGrantStress();
    assert.equal(g.failures.length, 0, g.failures.slice(0, 10).join('\n'));
    assert.ok(g.runs > 9_000, `${String(g.runs)} runs`);
  });
  test('3,000 pairs of pools: every return’s brought forward less its allowance is carried forward, to the penny (C16)', () => {
    const x = runReturnStress();
    assert.equal(x.failures.length, 0, x.failures.slice(0, 10).join('\n'));
    assert.equal(x.worst_pence, 0);
    assert.ok(x.rows > 20_000, `${String(x.rows)} rows`);
  });
});

describe('item 1 — the amendment window, every claimant type, year end and purchase year', () => {
  test('every row is the one recorded, and no row is added or lost', async () => {
    const want = readFileSync(new URL('./fixtures/phase159j/window-table.csv', import.meta.url), 'utf8').trim().split('\n');
    assert.equal(want[0], WINDOW_HEADER);
    const got = await windowTable();
    const wantRows = want.slice(1), wantSet = new Set(wantRows), gotSet = new Set(got);
    const moved = got.filter((l) => !wantSet.has(l)), lost = wantRows.filter((l) => !gotSet.has(l));
    assert.ok(wantRows.length > 400, `${String(wantRows.length)} rows recorded`);
    assert.equal(moved.length + lost.length, 0, `${String(moved.length)} rows read differently and ${String(lost.length)} recorded rows were not made:\n${moved.slice(0, 5).join('\n')}`);
  });
  test('the named cases: the last day is open all day; a still-owned 2019 purchase goes into the first open pool; the period must hold the purchase', async () => {
    const { app, claimFor } = await windowRig();
    const last = claimFor('COMPANY', '2024-06-15', '2023-10-01', '2024-09-30');
    for (const t of ['2026-09-30T00:00:00.000Z', '2026-09-30T09:00:00.000Z', '2026-09-30T22:59:59.000Z']) {
      assert.equal(amendmentWindowReading(app.db, last, t).state, 'OPEN', t);
      assert.equal(reportsWindowNeed(app.db, last, t).met, true, t);
    }
    assert.equal(amendmentWindowReading(app.db, last, '2026-10-01T00:00:00.000Z').state, 'CLOSED');
    for (const acq of ['2019-06-15', '2020-06-15']) {
      const per = periodContaining(acq, [12, 31]);
      const c = claimFor('COMPANY', acq, per.start, per.end);
      assert.equal(amendmentWindowReading(app.db, c, WINDOW_NOW).state, 'CLOSED', acq);
      CF.fact(app, c.id, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
      const route = claimRoutes(app.db, c, WINDOW_NOW)[0];
      assert.equal(route?.route, 'W2', acq);
      assert.deepEqual([route?.first_open?.start, route?.first_open?.end], ['2024-01-01', '2024-12-31'], acq);
      assert.equal(reportsWindowNeed(app.db, c, WINDOW_NOW).met, true, acq);
    }
    for (const acq of ['2023-12-31', '2025-01-01']) assert.equal(amendmentWindowReading(app.db, claimFor('COMPANY', acq, '2024-01-01', '2024-12-31'), WINDOW_NOW).state, 'UNKNOWN', acq);
    assert.equal(amendmentWindowReading(app.db, claimFor('COMPANY', '2019-06-15', '2025-01-01', '2025-12-31'), WINDOW_NOW).state, 'UNKNOWN', 'the current period is not the period of a 2019 purchase');
  });
});

describe('item 5 — a document names its event, and each event counts its own', () => {
  async function world() {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159j-')) });
    await seed(made.app.db, made.app.hasher, made.app.now);
    const db = made.app.db;
    const j = db.get<{ business_id: string; claim_id: string }>('SELECT business_id, claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL LIMIT 1');
    assert.ok(j);
    const property = db.get<{ p: string }>('SELECT property_id AS p FROM claims WHERE id = ?', [j.claim_id])?.p;
    assert.ok(property, 'the seeded claim has a building');
    db.run('DELETE FROM property_events WHERE property_id = ?', [property]);
    const user = (role: string) => db.get<{ id: string }>('SELECT id FROM users WHERE role = ? LIMIT 1', [role])?.id ?? '';
    const sales: Actor = { id: user('SALES'), role: 'SALES', business_id: null, disabled: false };
    const add = (kind: string, date: string, cost: string) => {
      const r = addStaffEvent(db, randomUUID, made.app.now(), sales.id, { property_id: property, business_id: j.business_id }, { kind, date, cost });
      assert.equal(r.ok, true, JSON.stringify(r));
      return r.ok ? r.id : '';
    };
    const deps = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID, store: made.store };
    const start = (who: Actor, a: Partial<D.StartArgs>) => D.startDocumentUpload(deps, who, { business_id: j.business_id, type_code: 'CONTRACTOR_INVOICE', logical_document_id: null, request_id: null, claim_id: null, ...a });
    const events = () => eventsOnClaim(db, { property_id: property, business_id: j.business_id, sector: 'gp' });
    const invoices = (event: string) => events().find((e) => e.id === event)?.documents.find((x) => x.code === 'CONTRACTOR_INVOICE');
    return { made, db, j, property, sales, add, deps, start, events, invoices };
  }

  test('with one event, a document that names none is its own, as before', async () => {
    const w = await world();
    try {
      const purchase = w.add('PURCHASE', '03/2025', '650000');
      assert.equal((await w.start(w.sales, { type_code: 'COMPLETION_STATEMENT', claim_id: w.j.claim_id })).ok, true);
      const done = w.events().find((e) => e.id === purchase)?.documents.find((x) => x.code === 'COMPLETION_STATEMENT');
      assert.deepEqual([done?.held, done?.untied], [1, 0]);
      const panel = D.claimDocumentsPanel(w.db, w.sales, { id: w.j.claim_id, business_id: w.j.business_id }, w.made.app.now());
      assert.equal(panel.events?.length, 1, 'one event is offered; the form shows no question for it');
    } finally { w.made.close(); }
  });

  test('a purchase and a refit: an invoice for the refit counts to the refit alone; one that names none is counted apart', async () => {
    const w = await world();
    try {
      const purchase = w.add('PURCHASE', '03/2025', '650000');
      const refit = w.add('REFURBISHMENT', '06/2025', '90000');
      const tied = await w.start(w.sales, { claim_id: w.j.claim_id, event_id: refit });
      assert.equal(tied.ok, true, JSON.stringify(tied));
      assert.equal(w.db.get<{ e: string | null }>('SELECT event_id AS e FROM logical_documents WHERE id = ?', [tied.ok ? tied.logical_document_id : ''])?.e, refit);
      assert.deepEqual([w.invoices(refit)?.held, w.invoices(refit)?.untied], [1, 0]);
      const loose = await w.start(w.sales, { claim_id: w.j.claim_id });
      assert.equal(loose.ok, true);
      assert.deepEqual([w.invoices(refit)?.held, w.invoices(refit)?.untied], [1, 1], 'two events: the untied invoice is not counted to either');
      assert.equal(w.events().find((e) => e.id === purchase)?.documents.some((x) => x.code === 'CONTRACTOR_INVOICE'), false, 'a purchase is not proved by an invoice');
      // A person ties it, and the audit log says who and what it was before.
      const lid = loose.ok ? loose.logical_document_id : '';
      assert.equal(D.setDocumentEvent(w.deps, w.sales, lid, refit).ok, true);
      assert.deepEqual([w.invoices(refit)?.held, w.invoices(refit)?.untied], [2, 0]);
      const row = w.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'DOCUMENT_EVENT_SET' AND object_id = ?", [lid]);
      assert.match(row?.detail ?? '', new RegExp(`"event":"${refit}".*"was":"\\(none\\)"`));
      // The document page names it and offers the events.
      const page = D.documentPage(w.deps, w.sales, lid, 'test', w.made.app.now());
      assert.equal(page.event?.label, 'a refurbishment or refit (June 2025)');
      assert.deepEqual(page.event_choices?.map((e) => e.label), ['the purchase (March 2025)', 'a refurbishment or refit (June 2025)']);
      // Refusals: another client's event; the client naming one; untie with an empty choice.
      w.db.run("INSERT INTO businesses (id,name,sector,stage,created_at) VALUES ('b-other','Other Practice Ltd','gp','ASSESSMENT_SUBMITTED',?)", [w.made.app.now()]);
      w.db.run("INSERT INTO properties (id,business_id,label,created_at) VALUES ('p-other','b-other','Other',?)", [w.made.app.now()]);
      const r = addStaffEvent(w.db, randomUUID, w.made.app.now(), w.sales.id, { property_id: 'p-other', business_id: 'b-other' }, { kind: 'REFURBISHMENT', date: '2024', cost: '' });
      const foreign = r.ok ? r.id : '';
      assert.match((await w.start(w.sales, { claim_id: w.j.claim_id, event_id: foreign }) as { why: string }).why, /not on this client’s buildings/);
      assert.equal(D.setDocumentEvent(w.deps, w.sales, lid, foreign).ok, false);
      const client = w.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'CLIENT' AND business_id = ?", [w.j.business_id]);
      if (client !== undefined) {
        const byClient = await w.start({ id: client.id, role: 'CLIENT', business_id: w.j.business_id, disabled: false }, { event_id: refit });
        assert.equal(byClient.ok, false, 'a client does not choose the event: the request does');
      }
      assert.equal(D.setDocumentEvent(w.deps, w.sales, lid, '').ok, true);
      assert.deepEqual([w.invoices(refit)?.held, w.invoices(refit)?.untied], [1, 1]);
      assert.throws(() => w.db.run('UPDATE logical_documents SET type_code = ? WHERE id = ?', ['ACCOUNTS', lid]), /nothing about a document changes/, 'only its event may change');
    } finally { w.made.close(); }
  });

  test('the client is asked for each piece of work’s final account and invoices, by name, and what answers a request takes its event', async () => {
    const w = await world();
    try {
      const purchase = w.add('PURCHASE', '03/2025', '650000');
      const refit = w.add('REFURBISHMENT', '06/2025', '90000');
      assert.match((D.requestWorkDocuments(w.deps, w.sales, w.j.claim_id, purchase) as { why: string }).why, /not a piece of work/);
      const first = D.requestWorkDocuments(w.deps, w.sales, w.j.claim_id, refit);
      assert.deepEqual(first, { ok: true, asked: 2 });
      assert.deepEqual(D.requestWorkDocuments(w.deps, w.sales, w.j.claim_id, refit), { ok: true, asked: 0 }, 'asked once, not twice');
      const asked = w.db.all<{ question: string; event_id: string }>("SELECT question, event_id FROM client_tasks WHERE kind = 'DOCUMENT' AND event_id = ? ORDER BY question", [refit]);
      assert.deepEqual(asked.map((x) => x.question), [
        'Please upload: Contractor\'s invoices for the works — for a refurbishment or refit (June 2025)',
        'Please upload: Final account, or the contractor\'s cost breakdown by element — for a refurbishment or refit (June 2025)',
      ]);
      const views = D.requestsFor(w.db, w.sales, { business_id: w.j.business_id, claim_id: w.j.claim_id }, w.made.app.now()).filter((r) => r.event !== null);
      assert.ok(views.some((r) => r.type.label === 'Contractor\'s invoices for the works — for a refurbishment or refit (June 2025)'), 'every list that names the request says which work');
      // The file that answers the request takes the work it was asked for.
      const req = w.db.get<{ id: string }>("SELECT id FROM client_tasks WHERE requested_type = 'CONTRACTOR_INVOICE' AND event_id = ?", [refit]);
      const answered = await w.start(w.sales, { request_id: req?.id ?? '' });
      assert.equal(answered.ok, true, JSON.stringify(answered));
      assert.equal(w.db.get<{ e: string | null }>('SELECT event_id AS e FROM logical_documents WHERE id = ?', [answered.ok ? answered.logical_document_id : ''])?.e, refit);
      // A request on a claim may only name an event on that claim's building.
      w.db.run("INSERT INTO properties (id,business_id,label,created_at) VALUES ('p-second',?,'Second site',?)", [w.j.business_id, w.made.app.now()]);
      const r = addStaffEvent(w.db, randomUUID, w.made.app.now(), w.sales.id, { property_id: 'p-second', business_id: w.j.business_id }, { kind: 'FIT_OUT', date: '2024', cost: '' });
      const elsewhere = D.createDocumentRequest(w.deps, w.sales, { business_id: w.j.business_id, claim_id: w.j.claim_id, type_code: 'CONTRACTOR_INVOICE', event_id: r.ok ? r.id : '', why: 'w', holds_up: 'h', due_on: null });
      assert.equal(elsewhere.ok, false);
    } finally { w.made.close(); }
  });
});

describe('L14 — the adviser’s switches read as the survey pack reads them', () => {
  test('on the test system the pack’s money readings read ON on the claim page and the sign-off form; elsewhere every switch reads as CB_CTA says', async () => {
    const cta = ctaSwitchReadings();
    assert.equal(cta.find((x) => x.switch === 'transaction_tax_in_base')?.on, false, 'the public estimate’s own switch stays off');
    const on = packSwitchReadings(cta, MONEY_READINGS_ON);
    // Phase 159k: and s.33B's aggregation (#20), applied by the pack in test.
    for (const k of ['transaction_tax_in_base', 'legal_fees_in_base', 's185_plus_own_s25', 'grant_traced_to_elements', 's33b_aggregation']) assert.equal(on.find((x) => x.switch === k)?.on, true, k);
    assert.deepEqual(on.filter((x) => !['transaction_tax_in_base', 'legal_fees_in_base', 's185_plus_own_s25', 'grant_traced_to_elements', 's33b_aggregation'].includes(x.switch)), cta.filter((x) => !['transaction_tax_in_base', 'legal_fees_in_base', 's185_plus_own_s25', 'grant_traced_to_elements', 's33b_aggregation'].includes(x.switch)));
    assert.deepEqual(packSwitchReadings(cta, MONEY_READINGS_OFF), [...cta]);
    const { app, claimFor } = await windowRig();
    const c = claimFor('COMPANY', '2025-06-15', '2025-01-01', '2025-12-31');
    const ADMIN: Actor = { id: 'u-ADMIN', role: 'ADMIN', business_id: null, disabled: false };
    const was = process.env['CAPREBATE_COST_MODEL_TEST'];
    try {
      process.env['CAPREBATE_COST_MODEL_TEST'] = '1';
      const p = factsPanel(app.db, ADMIN, c.id, WINDOW_NOW);
      assert.equal(p.acquisition_costs.switch.on, true);
      assert.match(p.acquisition_costs.switch.says, /^On, on the test system\. The stamp duty and the purchase fees recorded here are added/);
      assert.equal(p.buyer_alterations.switch.on, true);
      assert.equal(p.grants.switch.on, true);
      delete process.env['CAPREBATE_COST_MODEL_TEST'];
      const q = factsPanel(app.db, ADMIN, c.id, WINDOW_NOW);
      assert.equal(q.acquisition_costs.switch.on, false);
      assert.match(q.acquisition_costs.switch.says, /^Off\. Land transaction tax recorded here is shown, but not added/);
    } finally {
      if (was === undefined) delete process.env['CAPREBATE_COST_MODEL_TEST']; else process.env['CAPREBATE_COST_MODEL_TEST'] = was;
    }
  });
});
