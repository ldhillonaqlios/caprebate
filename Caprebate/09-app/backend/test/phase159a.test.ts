/**
 * PHASE 159a, 9 October 2026 — ONE VERSION AFTER SIGN-OFF, THE "UP TO" FIGURE EVERYWHERE, AND THE SMALL FAULTS.
 *
 * From the stress test of 9 October 2026 (04-phase-work/stress-2026-10-09/, OneDrive) and the Lockwood Surgery live run.
 * Each test below is that run's harness case, turned into a test that fails on the code before this phase:
 *   C3, C5, L3   no approval and no legal-check answer once the claim is past the tax adviser's sign-off, or stopped;
 *                "Reopen the valuation" sets aside what was released; the window reads the SIGNED purchase date
 *   C4           a sign-off names the version it signed; a same-total version is never released in its place
 *   C29          a version's return entries never change once sent
 *   E3           "up to £X", never a range
 *   L1           HM Land Registry's INSPIRE download: one same-host redirect with its cookie, still one audit row
 *   C2           the window is open all of its last UK day
 *   C14, C16     the return entries: a rate never beside a blank amount; every row adds up to the penny
 *   C22          a line of nothing needs no pool
 *   L6, L7       the postcode once; chapter 11 reads the one purchase date
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as F from '../src/web/claim-facts.ts';
import * as R from '../src/web/claim-record.ts';
import * as P from '../src/web/pipeline.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as RS from '../src/web/report-signoff.ts';
import * as RE from '../src/web/return-entries.ts';
import * as E from '../src/web/engine.ts';
import * as PS from '../src/web/pack-sums.ts';
import * as CM from '../src/web/pack-cost-model.ts';
import { formatShownRange } from '../src/web/shown-range.ts';
import { callOutside, RateLimiter, type CallDeps, type Transport } from '../src/connectors/http.ts';

const T = '2026-09-08T00:00:00.000Z';
type App = Awaited<ReturnType<typeof testApp>>;
const SAM = actor('SURVEYING', 'u-sam');
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');

async function world(): Promise<App> {
  const app = await testApp();
  for (const [id, role] of [['u-sam', 'SURVEYING'], ['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES'], ['u-SURVEYING', 'SURVEYING'], ['u-ACCOUNTING', 'ACCOUNTING']] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
  }
  return app;
}

const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });

/** A claim at TAX_ADVISER_SIGNOFF with a survey job, as the stress test's h5 harness builds it. */
function setup(app: App, tag: string) {
  const b = `b-${tag}`, p = `p-${tag}`, as = `as-${tag}`, job = `job-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Version Practice ${tag} Limited`, 'gp', 'SURVEY', T, 'COMPANY']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, 'Version Practice', 'ZZ9 9ZZ', T]);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, 100, 200, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${tag}`, as, b, 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T, 'not-a-real-hash']);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'TAX_ADVISER_SIGNOFF', owner_id: null, surveyor_id: null });
  app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, b, as, 'u-sam', 'SEALED', null, T, claim.id]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-epc-${tag}`, b, 'EPC', `RRN-${tag}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, p]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-title-${tag}`, b, 'HMLR_TITLE', `ZZ${tag}`, JSON.stringify({ title_number: `ZZ${tag}`, price_paid: 1050000 }), T, p]);
  CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_START', '2025-01-01');
  CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_END', '2025-12-31');
  return { b, p, job, claim: claim.id };
}
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
function fill(app: App, job: string): string[] {
  const keep = view(app, job).lines.slice(0, 2).map((l: { id: string }) => l.id);
  for (const l of view(app, job).lines) { if (keep.includes(l.id) || l.removed) continue; ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: String(view(app, job).seq) }, true)); }
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[0] as string, qty: '10', rate: '2000', qpct: '100', pool: 'SR', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[1] as string, qty: '100', rate: '300', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'building_rate', value: '1500', reason: 'BCIS', seq: String(view(app, job).seq) }));
  ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
  return keep;
}
function legal(app: App, job: string, answers: [string, string[]][]) {
  for (const [q, v] of answers) ok(L.answerLegal(deps(app), SAM, job, { question: q, values: v, source: 'The client’s contract', seq: String(lview(app, job).seq) }));
}
function approve(app: App, job: string) {
  for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
  return A.approvePack(deps(app), SAM, job, { seq: String(view(app, job).seq), legal_seq: String(lview(app, job).seq) });
}
const pounds = (pence: number) => `${String(Math.floor(pence / 100))}.${String(pence % 100).padStart(2, '0')}`;
function signOff(app: App, claim: string, figure_pence: number, extra: Record<string, string> = {}) {
  return R.recordSignOff(CF.recordDeps(app), ADMIN, claim, { adviser: 'Test Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-08',
    scope: 'the report', method_note: 'read it', figure: pounds(figure_pence), confirmed_switches: '', ...extra });
}
const snapOf = (app: App, job: string, v: number) => A.approvedVersion(deps(app), ADMIN, job, v)!;

describe('C3, C5, L3 — one version after sign-off', () => {
  test('past the sign-off no new version is approved and the legal check takes no answer; the window reads the SIGNED purchase date', async () => {
    const app = await world();
    const a = setup(app, 'A');
    const keep = fill(app, a.job);
    legal(app, a.job, [['G8', ['new_build']], ['G9d', ['2025-06-01']]]);
    ok(approve(app, a.job));
    const s1 = snapOf(app, a.job, 1);
    ok(signOff(app, a.claim, s1.snapshot.sums.qualifying_pence as number));
    // Still at the tax adviser: a newer WORKING purchase date is never read in place of the signed one.
    legal(app, a.job, [['G9d', ['2019-06-01']]]);
    const read = F.acquisitionDateReading(app.db, a.p);
    assert.equal(read.value, '2025-06-01', 'the window read the working pack, not the signed version');
    // On to Reports, where the figures are fixed.
    app.db.run("UPDATE claims SET stage = 'REPORTS' WHERE id = ?", [a.claim]);
    ok(SP.saveLine(deps(app), SAM, a.job, { line: keep[1] as string, qty: '200', rate: '300', qpct: '100', pool: 'MP', reason: 'Recount', seq: String(view(app, a.job).seq) }));
    const v2 = approve(app, a.job);
    assert.equal(v2.ok, false, 'a version was approved after the sign-off');
    assert.match(v2.ok ? '' : (v2 as { why: string }).why, /signed off|fixed/);
    const ans = L.answerLegal(deps(app), SAM, a.job, { question: 'G9d', values: ['2020-01-01'], source: 'x', seq: String(lview(app, a.job).seq) });
    assert.equal(ans.ok, false, 'the legal check took an answer after the sign-off');
    app.close();
  });

  test('C5: a claim that has stopped takes no approval', async () => {
    const app = await world();
    const c = setup(app, 'C');
    fill(app, c.job); legal(app, c.job, [['G8', ['new_build']], ['G9d', ['2025-06-01']]]);
    app.db.run("UPDATE claims SET stage = 'OUTSIDE_AMENDMENT_WINDOW' WHERE id = ?", [c.claim]);
    assert.equal(approve(app, c.job).ok, false);
    app.close();
  });

  test('Reopen the valuation: back to Valuation, and the sign-off, the reports, the acceptance and the release are set aside', async () => {
    const app = await world();
    const a = setup(app, 'R');
    const keep = fill(app, a.job);
    legal(app, a.job, [['G8', ['new_build']], ['G9d', ['2025-06-01']]]);
    ok(approve(app, a.job));
    const s1 = snapOf(app, a.job, 1);
    ok(signOff(app, a.claim, s1.snapshot.sums.qualifying_pence as number));
    ok(R.recordDeliverable(CF.recordDeps(app), SALES, a.claim, { kind: 'CLIENT_REPORT', action: 'DRAFT' }));
    ok(R.recordDeliverable(CF.recordDeps(app), SALES, a.claim, { kind: 'CLIENT_REPORT', action: 'ISSUE', issued_on: '2026-09-08' }));
    CF.clientAccepted(app, a.claim);
    app.db.run("UPDATE claims SET stage = 'REPORTS' WHERE id = ?", [a.claim]);
    const pc = () => P.loadPipelineClaim(app.db, a.claim);
    assert.equal(P.clientAcceptedNeed(app.db, pc()).met, true);
    assert.equal(RS.releasedVersion(app.db, a.b)?.row.version, 1);
    // The admin's button, with a reason.
    const panel = P.pipelinePanel(app.db, ADMIN, pc());
    assert.notEqual(panel.moves?.reopen_valuation ?? null, null, 'no "Reopen the valuation" for the admin');
    assert.match(panel.valuation?.locked ?? '', /fixed/);
    const moved = P.moveClaim(deps(app), ADMIN, a.claim, { kind: 'REOPEN', to: 'VALUATION', reason: 'The purchase date was wrong',
      next_action: { title: 'Approve the pack again', owner_id: 'u-ADMIN', due_on: '2026-09-30' } });
    ok(moved);
    assert.equal(app.db.get<{ s: string }>("SELECT state AS s FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' ORDER BY version DESC LIMIT 1", [a.claim])?.s, 'SUPERSEDED');
    assert.equal(R.signOffSinceEntry(app.db, pc()), undefined, 'the old sign-off still counts');
    assert.equal(RS.releasedVersion(app.db, a.b), null, 'the old version is still released to the client');
    assert.equal(R.releasedReportFingerprint(app.db, a.claim), null);
    assert.equal(P.clientAcceptedNeed(app.db, pc()).met, false, 'the old acceptance still counts');
    const after = P.pipelinePanel(app.db, ADMIN, pc());
    assert.match(after.valuation?.reopened?.reason ?? '', /purchase date was wrong/);
    assert.equal(after.valuation?.locked ?? null, null);
    // The surveyor may now change the figures and approve again.
    ok(SP.saveLine(deps(app), SAM, a.job, { line: keep[1] as string, qty: '200', rate: '300', qpct: '100', pool: 'MP', reason: 'Recount', seq: String(view(app, a.job).seq) }));
    ok(approve(app, a.job));
    app.close();
  });
});

describe('C4 — the sign-off names the version it signed', () => {
  test('a same-total version with the pools moved is never released in place of the one the adviser signed', async () => {
    const app = await world();
    const b = setup(app, 'B');
    const keep = fill(app, b.job);
    legal(app, b.job, [['G8', ['new_build']], ['G9d', ['2025-06-01']]]);
    ok(approve(app, b.job));
    const b1 = snapOf(app, b.job, 1);
    // The adviser signs version 1 (recorded now), THEN the surveyor moves spend between the pools: same total.
    ok(signOff(app, b.claim, b1.snapshot.sums.qualifying_pence as number));
    ok(SP.saveLine(deps(app), SAM, b.job, { line: keep[1] as string, qty: '100', rate: '300', qpct: '100', pool: 'SR', reason: 'An integral feature', seq: String(view(app, b.job).seq) }));
    ok(approve(app, b.job));
    const b2 = snapOf(app, b.job, 2);
    assert.equal(b2.snapshot.sums.qualifying_pence, b1.snapshot.sums.qualifying_pence);
    assert.equal(R.releasedReportFingerprint(app.db, b.claim), b1.row.fingerprint, 'the version the adviser never saw was released');
    assert.equal(RS.releasedVersion(app.db, b.b)?.row.version, 1);
    // And the gate out of sign-off is shut until the newest version is signed.
    const need = R.signOffRecordNeed(app.db, P.loadPipelineClaim(app.db, b.claim));
    assert.equal(need.met, false);
    assert.match(need.why, /version 2/);
    // A sign-off of a figure that is not the newest version's own is refused.
    const wrong = signOff(app, b.claim, (b1.snapshot.sums.qualifying_pence as number) + 100);
    assert.equal(wrong.ok, false);
    ok(signOff(app, b.claim, b2.snapshot.sums.qualifying_pence as number));
    assert.equal(R.releasedReportFingerprint(app.db, b.claim), b2.row.fingerprint);
    assert.equal(app.db.get<{ a: string }>('SELECT approval_id AS a FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', [b.claim])?.a, b2.row.id);
    app.close();
  });
});

describe('C29 — a version’s return entries never change once sent', () => {
  test('the period recorded after the sign-off does not change the spreadsheet already sent; an unsent version reads the claim live', async () => {
    const app = await world();
    const c = setup(app, 'Z');
    fill(app, c.job);
    legal(app, c.job, [['G8', ['new_build']], ['G9d', ['2025-06-01']]]);
    ok(approve(app, c.job));
    const k = snapOf(app, c.job, 1);
    ok(signOff(app, c.claim, k.snapshot.sums.qualifying_pence as number));
    const sent = RE.returnEntriesCsv(k.snapshot, RE.returnContextFor(app.db, k.row.id, c.claim, c.b), k.row.fingerprint);
    // The facts change afterwards.
    CF.fact(app, c.claim, 'ACCOUNTING_PERIOD_START', '2026-01-01');
    const again = RE.returnEntriesCsv(k.snapshot, RE.returnContextFor(app.db, k.row.id, c.claim, c.b), k.row.fingerprint);
    assert.equal(again, sent, 'the spreadsheet of a sent version changed');
    assert.notEqual(RE.returnEntriesCsv(k.snapshot, RE.returnContext(app.db, c.claim, c.b), k.row.fingerprint), sent, 'the control: the live facts did change');
    assert.throws(() => app.db.run("UPDATE return_entry_contexts SET period_start = '2020-01-01'"), /never change/);
    app.close();
  });
});

describe('E3 — "up to £X", never a range', () => {
  test('the shown figure is the ceiling alone, whatever low end is stored', () => {
    assert.equal(formatShownRange({ low_pence: 130_000_00, high_pence: 260_000_00 }), 'up to £260,000');
    assert.equal(formatShownRange({ low_pence: null, high_pence: 195_000_00 }), 'up to £195,000');
    assert.equal(formatShownRange({ low_pence: 1, high_pence: null }), 'no figure was shown');
  });
});

describe('L1 — the INSPIRE download follows one same-host redirect, with its cookie', () => {
  const GATE = { free_gate_open: true, engagement_signed: false, switched_on: true };
  function hmlr(steps: (url: string, init: Parameters<Transport>[1]) => Response): { t: Transport; seen: { url: string; cookie: string | undefined; redirect: string | undefined }[] } {
    const seen: { url: string; cookie: string | undefined; redirect: string | undefined }[] = [];
    const t: Transport = async (url, init) => { seen.push({ url, cookie: init.headers['cookie'], redirect: init.redirect }); return steps(url, init); };
    return { t, seen };
  }
  async function call(t: Transport, service = 'HMLR_INSPIRE') {
    const app = await testApp();
    const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => {} };
    const r = await callOutside(d, { service_id: service, endpoint: '/datasets/inspire/download/Kirklees_Council.zip', actor_id: null, claim_id: null, gate: GATE, as_bytes: true });
    const rows = app.db.all<{ kind: string }>("SELECT kind FROM audit_log WHERE kind = 'CONNECTOR_CALLED'");
    app.close();
    return { r, rows };
  }

  test('a 302 to the same address with an AccessToken cookie: followed once, the cookie sent back, the file kept, one audit row', async () => {
    const { t, seen } = hmlr((_url, init) => init.headers['cookie'] === 'AccessToken=abc'
      ? new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 })
      : new Response(null, { status: 302, headers: { location: '/datasets/inspire/download/Kirklees_Council.zip', 'set-cookie': 'AccessToken=abc; Path=/; HttpOnly; Secure' } }));
    const { r, rows } = await call(t);
    assert.equal(r.outcome, 'OK', r.why);
    assert.equal(seen.length, 2);
    assert.equal(seen[1]?.cookie, 'AccessToken=abc');
    assert.equal(seen[0]?.redirect, 'manual');
    assert.equal(rows.length, 1, 'one call, one audit row');
  });

  test('a redirect to another host, or more than two, is refused and nothing more is sent', async () => {
    const away = hmlr(() => new Response(null, { status: 302, headers: { location: 'https://elsewhere.example.invalid/x' } }));
    const r1 = await call(away.t);
    assert.notEqual(r1.r.outcome, 'OK');
    assert.equal(away.seen.length, 1);
    const loop = hmlr(() => new Response(null, { status: 302, headers: { location: '/again', 'set-cookie': 'A=1' } }));
    const r2 = await call(loop.t);
    assert.notEqual(r2.r.outcome, 'OK');
    assert.equal(loop.seen.length, 3, 'more than two redirects were followed');
    assert.equal(r2.rows.length, 1);
  });

  test('every other service still follows no redirect', async () => {
    const other = hmlr(() => new Response('{}', { status: 200 }));
    const app = await testApp();
    await callOutside({ audit: app.audit, now: app.now, transport: other.t, limiter: new RateLimiter(), sleep: async () => {} },
      { service_id: 'POSTCODES_IO', endpoint: '/postcodes/{postcode}', params: { postcode: 'HD1 3XH' }, actor_id: null, claim_id: null, gate: GATE });
    assert.equal(other.seen[0]?.redirect, undefined);
    app.close();
  });
});

describe('C2 — the window is open all of its last UK day', () => {
  test('a company period ending 30 Sep 2024: open at 09:00 and at 23:30 on 30 Sep 2026; closed from 00:30 on 1 Oct (UK time)', () => {
    const inTime = (at: string) => { const w = E.amendmentWindow('2024-09-30', 'company', at); return w.known ? w.in_time : null; };
    assert.equal(inTime('2026-09-30T09:00:00.000Z'), true);
    assert.equal(inTime('2026-09-30T22:30:00.000Z'), true); // 23:30 BST
    assert.equal(inTime('2026-09-30T23:30:00.000Z'), false); // 00:30 BST, 1 Oct
  });
});

describe('C14, C16 — the return entries', () => {
  const snap = (mp: number, sr: number) => ({ version: 1, business: { name: 'X' }, sums: { main_pool_pence: mp, special_pool_pence: sr } }) as unknown as A.Snapshot;
  test('C14: where the claimant is not known and the two readings differ, no main-pool rate stands beside a blank amount', () => {
    const es = RE.returnEntries(snap(100_000_00, 50_000_00), { period_start: '2025-07-01', is_company: null });
    for (const e of es.filter((x) => x.pool === 'Main pool' && x.entry !== 'Spend that counts, added to the pool')) {
      if (e.amount_pence === null) assert.match(e.how, /^Not worked out/, `a rate beside a blank amount: ${e.how}`);
    }
    assert.equal(es.find((x) => x.return_no === 1 && x.pool === 'Main pool' && x.entry === 'Writing-down allowance')?.amount_pence, null);
  });
  test('C16: every row adds up to the penny — balance brought forward less the allowance is the balance carried forward', () => {
    let worst = 0;
    let seed = 7;
    const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < 2000; t++) {
      const mp = Math.floor(rnd() * 5_000_000_00), sr = Math.floor(rnd() * 5_000_000_00);
      const es = RE.returnEntries(snap(mp, sr), { period_start: '2024-01-01', is_company: true });
      for (const pool of ['Main pool', 'Special rate pool'] as const) {
        let bf = pool === 'Main pool' ? mp : sr;
        for (let i = 1; i <= RE.RETURN_YEARS; i++) {
          const w = es.find((e) => e.return_no === i && e.pool === pool && e.entry === 'Writing-down allowance')?.amount_pence as number;
          const cf = es.find((e) => e.return_no === i && e.pool === pool && e.entry === 'Balance carried forward')?.amount_pence as number;
          worst = Math.max(worst, Math.abs(bf - w - cf)); bf = cf;
        }
      }
    }
    assert.equal(worst, 0, `rows that do not add up, by ${String(worst)}p`);
  });
});

describe('C22 — a line of nothing needs no pool', () => {
  const v = (value: number | null) => ({ value, source: null });
  const inputs = { gia_milli_m2: v(500_000), building_rate_pence: v(2_000_00), price_paid_pence: v(1_000_000_00), land_pence: v(100_000_00) };
  const line = (id: string, qty: number | null, rate: number | null, qpct: number | null, pool: 'MP' | 'SR' | null) =>
    ({ id, label: id, element_id: null, unit: 'nr', pool, pool_source: null, qty_milli: v(qty), rate_pence: v(rate), qpct_bp: v(qpct), removed: false, removed_source: null });
  test('a count of 0, or a share of 0, with no pool chosen: the total stands', () => {
    const good = line('a', 10_000, 100_00, 10_000, 'MP');
    const lines = [good, line('zero', 0, null, null, null), line('nil-share', 5_000, 50_00, 0, null)];
    const s = PS.packSums(inputs as never, lines as never);
    assert.equal(s.complete, true, JSON.stringify(s.needed));
    assert.equal(s.qualifying_pence !== null && s.qualifying_pence > 0, true);
  });
  test('the control: a line that could qualify still needs its pool', () => {
    const s = PS.packSums(inputs as never, [line('a', 10_000, 100_00, 10_000, null)] as never);
    assert.equal(s.complete, false);
  });
});

describe('L6, L7 — the postcode once; chapter 11 reads the one purchase date', () => {
  test('L6: a label that already ends with its postcode is not given it twice', () => {
    assert.equal(SP.propertyLine({ label: '3 Meltham Road, Huddersfield, HD1 3XH', postcode: 'HD1 3XH' }), '3 Meltham Road, Huddersfield, HD1 3XH');
    assert.equal(SP.propertyLine({ label: '3 Meltham Road, Huddersfield, hd13xh', postcode: 'HD1 3XH' }), '3 Meltham Road, Huddersfield, hd13xh');
    assert.equal(SP.propertyLine({ label: 'Lockwood Surgery', postcode: 'HD1 3XH' }), 'Lockwood Surgery, HD1 3XH');
    assert.equal(SP.propertyLine({ label: 'Lockwood Surgery', postcode: null }), 'Lockwood Surgery');
  });
  test('L7: with nothing on the property record, chapter 11 reads the legal check’s purchase date', async () => {
    const app = await world();
    const a = setup(app, 'I');
    fill(app, a.job);
    legal(app, a.job, [['G8', ['new_build']], ['G9d', ['2025-03-14']]]);
    const r = CM.indexReading(app.db, view(app, a.job));
    assert.equal(r.purchase, '2025-03-14');
    assert.equal(r.purchase_from, 'the surveyor');
    app.close();
  });
});
