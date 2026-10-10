/**
 * PHASE 159k, 10 October 2026 — THE REMAINING MONEY ITEMS: THE SELLER'S ALLOWANCE STATEMENT, AND THREE READINGS.
 *
 * Carried from Phases 159e and 159i. Each test fails on the code before this phase:
 *   item 1   the seller's structures and buildings allowance statement (s.270IA) is a document type with its own receipt
 *            policy (migration 112); receiving one records SBA_STATEMENT_HELD on its claims; it is asked for among a
 *            purchase's documents from 29 October 2018, and required at the data-gathering gate where the claim takes
 *            the structures allowance on a purchase
 *   item 2   three readings, on in test (money-readings.ts), each a part of a figure the surveyor already gives:
 *            s.33B across the building's pieces of work (survey-pack.ts), the long-life test year by year and land
 *            remediation relief on asbestos removal (allowances.ts, return-entries.ts); the parts frozen with the version
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import * as D from '../src/web/documents.ts';
import * as F from '../src/web/claim-facts.ts';
import * as MD from '../src/web/mandatory-documents.ts';
import * as P from '../src/web/pipeline.ts';
import { addStaffEvent, eventsOnClaim } from '../src/web/property-events.ts';
import { acceptClientBytes, finishUpload, issuedJob } from '../src/web/uploads.ts';
import { pdfOf } from './document-fixtures.ts';
import { testApp, actor } from './helpers.ts';
import * as C from '../src/web/crm.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import { snapshotOf } from '../src/web/pack-approve.ts';
import { writeAssessmentEvents } from '../src/web/property-events.ts';
import { MONEY_READINGS_OFF, MONEY_READINGS_ON } from '../src/web/money-readings.ts';
import { allowancesFor, NO_FACTS, type AllowanceFacts } from '../src/web/allowances.ts';
import { returnEntries } from '../src/web/return-entries.ts';
import { longLifeLimitFor } from '../src/web/long-life-and-remediation.ts';

type Made = Awaited<ReturnType<typeof createApp>>;

async function world() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159k-')) });
  await seed(made.app.db, made.app.hasher, made.app.now);
  const db = made.app.db;
  const j = db.get<{ business_id: string; claim_id: string }>('SELECT business_id, claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL LIMIT 1');
  assert.ok(j);
  const property = db.get<{ p: string }>('SELECT property_id AS p FROM claims WHERE id = ?', [j.claim_id])?.p;
  assert.ok(property);
  const sales: Actor = { id: db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")?.id ?? '', role: 'SALES', business_id: null, disabled: false };
  const deps = { db, audit: made.app.audit, now: made.app.now, newId: randomUUID };
  return { made, db, j, property, sales, deps };
}

/** One upload through the one handler, steps 1 to 7, linked to the claim. */
async function uploadOnClaim(made: Made, as: Actor, business: string, claim: string, type_code: string): Promise<string> {
  const deps = { db: made.app.db, audit: made.app.audit, now: made.app.now, newId: randomUUID, store: made.store };
  const started = await D.startDocumentUpload(deps, as, { business_id: business, type_code, logical_document_id: null, request_id: null, claim_id: claim });
  assert.equal(started.ok, true, started.ok ? '' : started.why);
  if (!started.ok) return '';
  const up = { db: made.app.db, store: made.store, now: made.app.now, actor: as.id, newId: randomUUID, audit: made.app.audit };
  const token = new URL(`http://x${started.url}`).searchParams.get('token') ?? '';
  const w = await acceptClientBytes(up, { doc_id: started.doc_id, token, bytes: new Uint8Array(pdfOf([['ALLOWANCE STATEMENT', 'Qualifying expenditure 450,000']])) });
  const job = issuedJob(made.app.db, started.doc_id);
  assert.ok(w.ok && job !== null);
  if (!w.ok || job === null) return '';
  const done = await finishUpload(up, job, w.written_at);
  assert.equal(done.error, undefined, done.error?.code ?? '');
  return started.doc_id;
}

describe('item 1 — the seller’s structures and buildings allowance statement', () => {
  test('a type of its own, bound to its own receipt policy, carrying a value, read by the claim team, RET-7; its policy is fixed', async () => {
    const w = await world();
    try {
      const t = w.db.get<{ handler_type: string; readers: string; carries_value: number; retention_ref: string; active: number }>(
        "SELECT handler_type, readers, carries_value, retention_ref, active FROM document_types WHERE code = 'SBA_ALLOWANCE_STATEMENT'");
      assert.deepEqual(t, { handler_type: 'SBA_ALLOWANCE_STATEMENT', readers: 'CLAIM_TEAM', carries_value: 1, retention_ref: 'RET-7', active: 1 });
      assert.ok(D.receivableTypes(w.db).some((x) => x.code === 'SBA_ALLOWANCE_STATEMENT'), 'it can be asked for and sent');
      assert.throws(() => w.db.run("UPDATE document_types SET handler_type = NULL WHERE code = 'SBA_ALLOWANCE_STATEMENT'"), /fixed/);
    } finally { w.made.close(); }
  });

  test('received on a claim, it records the statement as held — once, by whoever sent it, from their document', async () => {
    const w = await world();
    try {
      const held = () => F.latestFacts(w.db, w.j.claim_id).get('SBA_STATEMENT_HELD');
      assert.equal(held(), undefined);
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.deepEqual([held()?.answer, held()?.value_text, held()?.source_id], ['VALUE', 'YES', 'CLIENT_DOC']);
      assert.match(held()?.note ?? '', /The seller’s allowance statement was received \(version 1\)\./);
      const n = () => w.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_facts WHERE claim_id = ? AND fact_key = 'SBA_STATEMENT_HELD'", [w.j.claim_id])?.n;
      assert.equal(n(), 1);
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.equal(n(), 1, 'a claim that already says yes records nothing again');
      // Another type records nothing.
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'COMPLETION_STATEMENT');
      assert.equal(n(), 1);
    } finally { w.made.close(); }
  });

  test('required at the gate only where the claim takes the structures allowance on a purchase from 29 October 2018', async () => {
    const w = await world();
    try {
      const need = () => MD.mandatoryDocumentNeeds(w.db, P.loadPipelineClaim(w.db, w.j.claim_id)).find((x) => x.what.startsWith('The seller'));
      assert.equal(need()?.met, true);
      assert.match(need()?.why ?? '', /no structures allowance is taken on the purchase/);
      assert.equal(F.recordFact(w.deps, w.sales, w.j.claim_id, { fact_key: 'SBA_QUALIFYING_EXPENDITURE', answer: 'VALUE', value: '450000', source_id: 'CLIENT_DOC', note: null }).ok, true);
      w.db.run("UPDATE properties SET acquisition_date = '2017-06-01' WHERE id = ?", [w.property]);
      assert.equal(need()?.met, true);
      assert.match(need()?.why ?? '', /bought before 29 October 2018/);
      w.db.run("UPDATE properties SET acquisition_date = '2020-06-03' WHERE id = ?", [w.property]);
      assert.equal(need()?.met, false, 'the allowance is taken and no statement is on the claim');
      await uploadOnClaim(w.made, w.sales, w.j.business_id, w.j.claim_id, 'SBA_ALLOWANCE_STATEMENT');
      assert.equal(need()?.met, true);
    } finally { w.made.close(); }
  });

  test('a purchase from 29 October 2018 lists it among its documents; one before does not', async () => {
    const w = await world();
    try {
      w.db.run('DELETE FROM property_events WHERE property_id = ?', [w.property]);
      const r = addStaffEvent(w.db, randomUUID, w.made.app.now(), w.sales.id, { property_id: w.property, business_id: w.j.business_id }, { kind: 'PURCHASE', date: '06/2020', cost: '540000' });
      assert.equal(r.ok, true);
      const codes = () => eventsOnClaim(w.db, { property_id: w.property, business_id: w.j.business_id, sector: 'gp' })[0]?.documents.map((x) => x.code) ?? [];
      assert.ok(codes().includes('SBA_ALLOWANCE_STATEMENT'));
      w.db.run("UPDATE property_events SET event_date = '2017-06' WHERE property_id = ?", [w.property]);
      assert.equal(codes().includes('SBA_ALLOWANCE_STATEMENT'), false);
    } finally { w.made.close(); }
  });
});

/* ================================================================== item 2 */
const T = '2026-09-08T00:00:00.000Z';
const SAM = actor('SURVEYING', 'u-sam');

/** A company that refitted a GP surgery twice in 2025 (March and September), with a survey job and a pack. */
async function refits(money = MONEY_READINGS_ON) {
  const app = await testApp();
  for (const [id, role] of [['u-sam', 'SURVEYING'], ['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES']] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
  }
  app.db.run("INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES ('b-k','Readings Practice Limited','gp','SURVEY',?,'COMPANY')", [T]);
  app.db.run("INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES ('p-k','b-k','Readings Surgery','ZZ9 9ZZ',?)", [T]);
  app.db.run("INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES ('as-k','b-k','gp',?,NULL,1,?)", [T, T]);
  writeAssessmentEvents(app.db, randomUUID, { property_id: 'p-k', business_id: 'b-k', assessment_id: 'as-k', at: T },
    [{ type: 'refurb', cost: 100000, date: '03/2025' }, { type: 'fit_out', cost: 60000, date: '09/2025' }]);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: 'b-k', property_id: 'p-k', assessment_id: 'as-k', workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null });
  app.db.run("INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES ('job-k','b-k','as-k','u-sam','SEALED',NULL,?,?)", [T, claim.id]);
  const deps = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, money };
  const view = () => SP.packView(deps, SAM, 'job-k');
  const works = (i: number, values: Record<string, string>) => {
    const w = view().works[i];
    assert.ok(w);
    const r = SP.saveWorks(deps, SAM, 'job-k', { event: w.event.id, values, reason: 'From the final account', seq: String(view().seq) });
    assert.equal(r.ok, true, JSON.stringify(r));
  };
  return { app, deps, view, works };
}

describe('item 2 — s.33B across the building’s pieces of work', () => {
  test('repairs on integral features within twelve months above half their replacement cost are capital, in the special rate pool', async () => {
    const r = await refits();
    // March: £100,000 = £40,000 plant (special) + £50,000 other + £10,000 repairs, £6,000 of them on integral features.
    r.works(0, { works_total: '100000', works_main: '0', works_special: '40000', works_bwic: '0', works_demolition: '0', works_other: '50000',
      works_repairs: '10000', works_prelims: '0', works_fees: '0', works_repairs_if: '6000', works_if_replacement: '20000' });
    let w0 = r.view().works[0]!;
    assert.equal(w0.s33b.capital_pence, 0, '£6,000 of £20,000 on its own is not more than half');
    assert.match(w0.s33b.words ?? '', /stay repairs/);
    // September: £60,000 with £5,000 more on the same features: £11,000 in twelve months, more than half of £20,000.
    r.works(1, { works_total: '60000', works_main: '20000', works_special: '0', works_bwic: '0', works_demolition: '0', works_other: '35000',
      works_repairs: '5000', works_prelims: '0', works_fees: '0', works_repairs_if: '5000', works_if_replacement: '20000' });
    w0 = r.view().works[0]!;
    const w1 = r.view().works[1]!;
    assert.equal(w0.s33b.capital_pence, 600_000);
    assert.equal(w0.sums.special_pool_pence, 4_600_000, 'the £6,000 joins the special rate pool');
    assert.equal(w0.sums.repairs_pence, 400_000, 'and leaves the repairs');
    assert.equal(w1.s33b.capital_pence, 500_000);
    assert.match(w1.s33b.words ?? '', /across 2 pieces of work/);
    // Off: nothing moves.
    const off = SP.packView({ ...r.deps, money: MONEY_READINGS_OFF }, SAM, 'job-k');
    assert.deepEqual([off.works[0]?.s33b.capital_pence, off.works[0]?.sums.special_pool_pence], [0, 4_000_000]);
    // A part above its whole stops that work's total and says so.
    r.works(1, { works_repairs_if: '7000' });
    assert.equal(r.view().works[1]?.sums.complete, false);
    assert.ok(r.view().works[1]?.sums.problems.some((p) => p.code === 'WORKS_PART_TOO_BIG'));
    r.app.close();
  });

  test('a work with a repair part and no s.33B parts says it is not checked; the parts are frozen with the version', async () => {
    const r = await refits();
    r.works(0, { works_total: '100000', works_main: '30000', works_special: '10000', works_bwic: '0', works_demolition: '0', works_other: '50000',
      works_repairs: '10000', works_prelims: '0', works_fees: '0', works_long_life: '30000', works_asbestos: '20000' });
    const w0 = r.view().works[0]!;
    assert.match(w0.s33b.words ?? '', /^s\.33B not checked/);
    assert.equal(w0.long_life_pence, 3_000_000);
    assert.equal(w0.asbestos_pence, 2_000_000);
    const snap = snapshotOf(r.view(), L.legalView(r.deps, SAM, 'job-k'), { version: 1, at: T, by: { id: 'u-sam', name: 'Sam' }, details: { rics_number: '1', firm: 'F' } as never }, r.deps) as unknown as
      { readings_159k?: { long_life_test: boolean; asbestos_lrr: boolean; works: { long_life_pence: number | null; asbestos_pence: number | null }[] } };
    assert.equal(snap.readings_159k?.long_life_test, true);
    assert.equal(snap.readings_159k?.asbestos_lrr, true);
    assert.deepEqual(snap.readings_159k?.works[0], { event_id: w0.event.id, long_life_pence: 3_000_000, asbestos_pence: 2_000_000, s33b_capital_pence: 0, s33b_words: w0.s33b.words });
    r.app.close();
  });
});

/** A version as the allowances read it: one refit in June 2025, W1, in a company's year to 31 December 2025. */
const Y = (y: number) => ({ start: `${String(y)}-01-01`, end: `${String(y)}-12-31` });
function refitVersion(o: { long_life?: number | null; asbestos?: number | null; ll_on?: boolean; lrr_on?: boolean; route?: string; main?: number; sector?: string } = {}) {
  return { version: 1, business: { name: 'T' }, job: { sector: o.sector ?? 'gp' }, sums: { main_pool_pence: 0, special_pool_pence: 0 },
    events: { purchase_applies: false, purchase: null,
      works: [{ event_id: 'w', kind: 'REFURBISHMENT', event_date: '2025-06', label: 'A refit, June 2025', inputs: { works_total: 40_000_000 },
        qualifying_pence: (o.main ?? 15_000_000) + 5_000_000, main_pool_pence: o.main ?? 15_000_000, special_pool_pence: 5_000_000, repairs_pence: 1_000_000 }] },
    routes: [{ route: o.route ?? 'W1', kind: 'REFURBISHMENT', event_id: 'w', event_date: '2025-06', period: Y(2025), first_open: Y(2025) }],
    readings_159k: { long_life_test: o.ll_on ?? true, asbestos_lrr: o.lrr_on ?? true, s33b_aggregation: true, purchase_long_life_pence: null,
      works: [{ event_id: 'w', long_life_pence: o.long_life ?? null, asbestos_pence: o.asbestos ?? null, s33b_capital_pence: 0, s33b_words: null }] },
  } as never;
}
const co = (f: Partial<AllowanceFacts> = {}) => ({ period_start: null, is_company: true, facts: { ...NO_FACTS, claimant: 'COMPANY', ...f } });

describe('item 2 — the long-life test, year by year', () => {
  test('over the year’s £100,000, long-life plant goes to the special rate pool; at or under it, it stays; homes never; off, nothing', () => {
    const moved = allowancesFor(refitVersion({ long_life: 12_000_000 }), co()).parts[0]!;
    assert.equal(moved.long_life?.moved, true);
    assert.deepEqual([moved.main_pence, moved.special_pence], [3_000_000, 17_000_000], '£120,000 moves from the main pool');
    assert.match(moved.long_life?.why ?? '', /over the £100,000 limit \(s\.99\)/);
    const stays = allowancesFor(refitVersion({ long_life: 10_000_000 }), co()).parts[0]!;
    assert.equal(stays.long_life?.moved, false);
    assert.equal(stays.main_pence, 15_000_000);
    const homes = allowancesFor(refitVersion({ long_life: 12_000_000, sector: 'supported_living' }), co()).parts[0]!;
    assert.equal(homes.long_life?.moved, false);
    assert.match(homes.long_life?.why ?? '', /homes is never long-life \(s\.93\)/);
    assert.equal(allowancesFor(refitVersion({ long_life: 12_000_000, ll_on: false }), co()).parts[0]!.long_life, null);
    // The limit, in proportion for a short period.
    assert.equal(longLifeLimitFor({ start: '2025-01-01', end: '2025-12-31' }), 100_000_00);
    assert.equal(longLifeLimitFor({ start: '2025-07-01', end: '2025-12-31' }), Math.round(100_000_00 * 184 / 365));
  });
});

describe('item 2 — land remediation relief on asbestos removal', () => {
  test('a company, the asbestos there when it acquired the land, W1: the spend and 50% more, in the return entries, not the allowances', () => {
    const v = refitVersion({ asbestos: 2_000_000 });
    const yes = allowancesFor(v, co({ asbestos_at_acquisition: true }));
    const p = yes.parts[0]!;
    assert.deepEqual([p.lrr?.applies, p.lrr?.deduction_pence, p.lrr?.additional_pence], [true, 2_000_000, 1_000_000]);
    assert.equal(yes.periods[0]?.lrr_pence, 3_000_000);
    // The asbestos is not in the structures allowance's base: £400,000 less £200,000 qualifying, £10,000 repairs, £20,000 asbestos.
    assert.equal(p.sba.base_pence, 40_000_000 - 20_000_000 - 1_000_000 - 2_000_000);
    const rows = returnEntries(v, co({ asbestos_at_acquisition: true }));
    assert.deepEqual(rows.filter((x) => x.entry.startsWith('Land remediation relief')).map((x) => [x.entry, x.amount_pence]),
      [['Land remediation relief: the spend: A refit, June 2025', 2_000_000], ['Land remediation relief: the extra 50%: A refit, June 2025', 1_000_000]]);
    // Not a company, not known, not there when acquired, or a closed year: no relief, and it says why.
    assert.equal(allowancesFor(v, { period_start: null, is_company: false, facts: { ...NO_FACTS, claimant: 'SOLE_TRADER', asbestos_at_acquisition: true } }).parts[0]?.lrr?.applies, false);
    assert.equal(allowancesFor(v, co()).parts[0]?.lrr?.applies, null);
    assert.equal(allowancesFor(v, co({ asbestos_at_acquisition: false })).parts[0]?.lrr?.applies, false);
    assert.equal(allowancesFor(refitVersion({ asbestos: 2_000_000, route: 'W2' }), co({ asbestos_at_acquisition: true })).parts[0]?.lrr?.applies, false);
    assert.equal(allowancesFor(refitVersion({ asbestos: 2_000_000, lrr_on: false }), co({ asbestos_at_acquisition: true })).parts[0]?.lrr, null);
  });

  test('the fact is one the claim records', async () => {
    const r = await refits();
    const claim = r.app.db.get<{ id: string }>("SELECT id FROM claims WHERE business_id = 'b-k'")?.id ?? '';
    const made = F.recordFact({ db: r.app.db, audit: r.app.audit, now: r.app.now, newId: randomUUID }, actor('SALES'), claim,
      { fact_key: 'ASBESTOS_AT_ACQUISITION', answer: 'VALUE', value: 'YES', source_id: 'SURVEYOR', note: null });
    assert.equal(made.ok, true, JSON.stringify(made));
    r.app.close();
  });
});
