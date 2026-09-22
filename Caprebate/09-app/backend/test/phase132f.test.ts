/**
 * PHASE 132f — THE BACK END, 16 September 2026.
 *
 *   line 5   CA2: the list of persons with significant control (and the title register's proprietor) is post-signature,
 *            read off CB_REGISTRY.SOURCES[].postSignature and classifyField — never a second list.
 *   line 1   the regulator named in the dated dual wording of 03-app/caprebate-notices-page.html (draft, for the officer).
 *   line 12  the engagement gate handed phase9's costing, wherever the back end reads a fee before it is invoiced.
 *   line 13  (a) the £1,000 no-claim threshold where the fee is shown against the benefit; (b) the region switches
 *            passed; (c) — no place in the back end uses a site area, so nothing is wired and nothing is tested.
 *
 * EVERY MODULE IS IMPORTED AS A NAMESPACE, so that against the pre-change files each test goes red on its own
 * assertion rather than the whole file failing at import.
 *
 * THE CLOCK IS PASSED, NOT READ: the seed runs on fixedClock() and every view is handed `now`.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { fixedClock } from './helpers.ts';
import * as E from '../src/web/engine.ts';
import * as R from '../src/web/research.ts';
import * as V from '../src/web/vat.ts';
import * as C from '../src/web/crm.ts';
import * as FIN from '../src/web/finance.ts';
import * as INV from '../src/web/invoices.ts';
import * as RIGHTS from '../src/web/compliance-rights.ts';
import * as PC from '../src/web/postcode.ts';
import * as PORT from '../src/web/postcode-port.ts';

const NOW = '2026-09-16T12:00:00.000Z';
const BACKEND = join(import.meta.dirname, '..');
const TREE = join(BACKEND, '..', '..');

type Made = Awaited<ReturnType<typeof createApp>>;

async function made(): Promise<Made> {
  const m = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-132f-')), now: fixedClock() });
  await seed(m.app.db, m.app.hasher, m.app.now);
  return m;
}

function adminOf(m: Made): Actor {
  const u = m.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
  assert.ok(u);
  return { id: u.id, role: 'ADMIN', business_id: null, disabled: false };
}

function dunmarrowAtInvoice(m: Made): { id: string; claim_ref: string; business_id: string; sector: string | null } {
  const c = m.app.db.get<{ id: string; claim_ref: string; business_id: string; sector: string | null }>(
    "SELECT c.id, c.claim_ref, c.business_id, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = ? AND c.stage = 'INVOICE'",
    ['Dunmarrow Medical Practice Limited'],
  );
  assert.ok(c, 'the seeded Dunmarrow claim at INVOICE is missing');
  return c;
}

/* ================================================================== *
 * LINE 5 — CA2 IN THE SOURCES PANEL
 * ================================================================== */

describe('line 5 — the PSC list and the title register proprietor are post-signature, read off the engine', () => {
  const openFree: R.FreeGate = { open: true, requires: 'published' };
  const shutFree: R.FreeGate = { open: false, requires: 'a published privacy notice' };
  const signed: R.SignedEngagement = { signed: true, letter_state: 'SIGNED', signed_at: NOW, why: 'the engagement letter is signed' };
  const unsigned: R.SignedEngagement = { signed: false, letter_state: 'SENT', signed_at: null, why: 'the engagement letter is sent and not yet opened and is not signed' };
  /* "not sure" typed where a boolean belongs — a record that reached the gate un-normalised. */
  const unsure = { ...unsigned, signed: 'not sure' } as unknown as R.SignedEngagement;
  const entry = (id: string): R.CatalogueEntry => {
    const e = R.catalogue().find((c) => c.source_id === id);
    assert.ok(e, `${id} is not in the catalogue`);
    return e;
  };

  test('THE CATALOGUE CARRIES THE ENGINE’S post-signature fields: psc_name on CH_PSC, the personal proprietor on HMLR_TITLE, none on the free facts', () => {
    assert.deepEqual(entry('CH_PSC').post_signature_fields, ['psc_name']);
    assert.deepEqual(entry('HMLR_TITLE').post_signature_fields, ['proprietor_name_personal']);
    for (const free of ['CH_COMPANY', 'HMLR_PPD', 'EPC', 'CQC', 'VOA']) assert.deepEqual(entry(free).post_signature_fields, [], free);
    assert.equal(entry('CH_PSC').tier, 'FREE', 'CH_PSC is free of charge and stays tiered FREE — CA2 is a separate gate, not a price');
  });

  test('IT IS READ, NOT RESTATED: take psc_name off the engine’s postSignature and CH_PSC carries none', () => {
    const post = E.REGISTRY.SOURCES['companies_house']?.postSignature as string[] | undefined;
    assert.ok(Array.isArray(post) && post.includes('psc_name'), 'the engine no longer lists psc_name as post-signature');
    const keep = [...post];
    try {
      post.splice(0, post.length);
      assert.deepEqual(entry('CH_PSC').post_signature_fields, []);
      assert.equal(R.stateUnderGates(entry('CH_PSC'), 'NOT_RUN', openFree, unsigned).state, 'NOT_RUN');
    } finally {
      post.splice(0, post.length, ...keep);
    }
    assert.deepEqual(entry('CH_PSC').post_signature_fields, ['psc_name']);
  });

  test('SIGNED → the PSC list is available (NOT_RUN: permitted, no connector); the free facts on the same publisher too', () => {
    assert.equal(R.stateUnderGates(entry('CH_PSC'), 'NOT_RUN', openFree, signed).state, 'NOT_RUN');
    assert.equal(R.stateUnderGates(entry('HMLR_TITLE'), 'NOT_RUN', openFree, signed).state, 'NOT_RUN');
    assert.equal(R.stateUnderGates(entry('CH_COMPANY'), 'NOT_RUN', openFree, signed).state, 'NOT_RUN');
  });

  test('UNSIGNED, "NOT SURE", NULL AND ABSENT RECORD → NOT YET, by the same answer, and nothing throws', () => {
    for (const [label, eng] of [['unsigned', unsigned], ['not sure', unsure], ['null', null], ['absent', undefined]] as const) {
      const psc = R.stateUnderGates(entry('CH_PSC'), 'NOT_RUN', openFree, eng);
      assert.equal(psc.state, 'NOT_PERMITTED_YET', `CH_PSC opened on an engagement record that was ${label}`);
      assert.match(psc.detail, /we look up the names of people with significant control only once the engagement letter is signed/);
      assert.match(psc.detail, /Until then this lookup is not made/);
      /* The paid title register, by the same N4 line: a "not sure" used to read as truthy and open it. */
      assert.equal(R.stateUnderGates(entry('HMLR_TITLE'), 'NOT_RUN', openFree, eng).state, 'NOT_PERMITTED_YET', `HMLR_TITLE, ${label}`);
      /* The free facts are untouched. */
      assert.equal(R.stateUnderGates(entry('CH_COMPANY'), 'NOT_RUN', openFree, eng).state, 'NOT_RUN', `CH_COMPANY, ${label}`);
      assert.equal(R.stateUnderGates(entry('HMLR_PPD'), 'NOT_RUN', openFree, eng).state, 'NOT_RUN', `HMLR_PPD, ${label}`);
    }
  });

  test('WITH THE NOTICE UNPUBLISHED TOO, the PSC row names both things it waits on; a fired row keeps its provenance', () => {
    const r = R.stateUnderGates(entry('CH_PSC'), 'NOT_RUN', shutFree, unsigned);
    assert.equal(r.state, 'NOT_PERMITTED_YET');
    assert.match(r.detail, /privacy notice/);
    assert.match(r.detail, /engagement letter is signed/);
    assert.equal(R.stateUnderGates(entry('CH_COMPANY'), 'NOT_RUN', shutFree, unsigned).detail.includes('engagement letter is signed'), false);
    assert.equal(R.stateUnderGates(entry('CH_PSC'), 'FIRED', openFree, unsigned).state, 'FIRED');
  });

  test('postSignatureOpen asks classifyField with the record: only signed === true opens it', () => {
    const psc = entry('CH_PSC');
    assert.equal(R.postSignatureOpen(psc, signed), true);
    for (const eng of [unsigned, unsure, null, undefined]) assert.equal(R.postSignatureOpen(psc, eng), false);
    assert.equal(R.postSignatureOpen(entry('EPC'), null), true, 'a source with nothing post-signature is not held by CA2');
  });
});

/* ================================================================== *
 * LINE 1 — THE REGULATOR, IN THE DATED DUAL WORDING
 * ================================================================== */

describe('line 1 (back end) — the regulator is named both ways, copied from the notices page', () => {
  const DUAL = 'the Information Commissioner (from 30 September 2026, the Information Commission)';
  const OFFICE = 'Information Commissioner’s Office (from 30 September 2026, the Information Commission)';

  test('THE ONWARD ROUTE IS BLOCK F OPTION 2 AND 3 OF THE NOTICES PAGE, WORD FOR WORD', () => {
    const html = readFileSync(join(TREE, '03-app', 'caprebate-notices-page.html'), 'utf8');
    const flat = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    const option2 = flat.slice(flat.indexOf('2. Complain to the data protection regulator.'), flat.indexOf('3. Go to court.')).trim();
    assert.ok(option2.length > 100, 'Block F option 2 not found on the notices page');
    assert.ok(option2.includes(DUAL), 'the notices page no longer carries the dual wording');
    const lines = RIGHTS.ONWARD_ROUTE_TEXT.split('\n');
    assert.ok(lines.includes(option2), 'the onward route’s option 2 is not the notices page’s, word for word');
    assert.match(RIGHTS.ONWARD_ROUTE_TEXT, /what we or the regulator decide\./);
  });

  test('NO BARE, PRESENT-TENSE REGULATOR NAME IS LEFT IN A STRING in the compliance modules — comments and document titles apart', () => {
    for (const f of ['compliance-rights.ts', 'compliance-breach.ts', 'compliance-views.ts']) {
      const code = readFileSync(join(BACKEND, 'src', 'web', f), 'utf8').split('\n')
        .filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');
      assert.equal(/the Commissioner\b/.test(code), false, `${f} still says "the Commissioner"`);
      assert.equal(/\bICO\b/.test(code), false, `${f} still says "ICO" in a string`);
      for (const m of code.matchAll(/Information Commissioner(?:\\?['’]s Office)?/g)) {
        const after = code.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 60);
        assert.ok(after.startsWith(' (from 30 September 2026, the Information Commission)'), `${f}: "${m[0]}${after}" is not dated`);
      }
    }
    assert.ok(RIGHTS.ONWARD_ROUTE_ITEMS['S165']?.includes(DUAL));
    assert.ok(RIGHTS.ACCESS_RESPONSE_ITEMS['S165']?.includes(DUAL));
    assert.ok(RIGHTS.REFUSAL_RESPONSE_ITEMS['S165']?.includes(DUAL));
    assert.ok(readFileSync(join(BACKEND, 'src', 'web', 'compliance-views.ts'), 'utf8').includes(OFFICE));
  });
});

/* ================================================================== *
 * LINE 12 — THE ENGAGEMENT GATE, WITH ITS COSTS
 * ================================================================== */

describe('line 12 — the engagement gate is handed phase9’s costing, and stops what it should', () => {
  test('THE COSTING LOADS, AND THE SHIPPED CONFIG IS PUT BACK EXACTLY after every reading', () => {
    assert.equal(E.gateCostingLoaded(), true, 'phase9 job economics did not load — every reading would be UNDETERMINED');
    E.feeGate(4935, 'gp', { jobs_per_year: 'not sure' });
    assert.equal(E.GATE_CONFIG.costing, null, 'the costing was left injected into the shared engine config');
    assert.equal(E.GATE_CONFIG.jobs_per_year, 120);
    assert.equal(E.GATE_CONFIG.enabled, true);
  });

  test('FIRES BELOW THE LINE: a GP fee of £4,935 routes to the engine’s own words; the caveat is on it', () => {
    const g = E.feeGate(4935, 'gp');
    assert.equal(g.outcome, 'FIRE');
    assert.equal(g.withholds_quote, true);
    assert.equal(g.routes_to, E.GATE.COME_BACK);
    assert.equal(E.GATE.COME_BACK, 'we will come back to you with a price');
    assert.ok(g.threshold !== null && g.threshold > 4935 && g.shortfall !== null && g.shortfall > 0);
    assert.equal(g.cost_basis_is_a_placeholder, true);
    assert.match(g.placeholder_caveat, /a guess for now/);
    /* The engine's whole quote agrees: no figure rendered, the reason is the routing sentence. */
    const q = E.feeQuote(164_500, null, { sector: 'gp' });
    assert.equal(q.render, false);
    assert.equal(q.amount, null);
    assert.equal(q.reason, E.GATE.COME_BACK);
    assert.match(q.placeholder_caveat, /a guess for now/);
  });

  test('QUOTES ABOVE THE LINE: the same GP at £10,000, and a dental fee of £4,935, pass — with the caveat still on', () => {
    for (const [fee, sector] of [[10_000, 'gp'], [4935, 'dental']] as const) {
      const g = E.feeGate(fee, sector);
      assert.equal(g.outcome, 'PASS', `${sector} ${fee}`);
      assert.equal(g.withholds_quote, false);
      assert.equal(g.routes_to, null);
      assert.match(g.placeholder_caveat, /a guess for now/);
    }
    const q = E.feeQuote(500_000, null, { sector: 'gp' });
    assert.equal(q.render, true);
    assert.equal(q.amount, 15_000);
  });

  test('CARE HOMES ARE COSTED — the engine’s care_homes is phase9’s care_home', () => {
    assert.equal(E.feeGate(4935, 'care_homes').determined, true);
    assert.equal(E.feeGate(4935, 'care_homes').sector, 'care_homes');
  });

  test('UNKNOWN VOLUME, AS "not sure" AND AS ABSENT, STAYS UNDETERMINED — never a pass, never a refusal, never a throw', () => {
    for (const v of ['not sure', undefined, null]) {
      const g = E.feeGate(4935, 'gp', { jobs_per_year: v });
      assert.equal(g.outcome, 'UNDETERMINED', String(v));
      assert.equal(g.determined, false);
      assert.equal(g.withholds_quote, false);
      assert.equal(g.routes_to, null);
      assert.ok(g.missing.includes('jobs_per_year'));
      assert.match(g.placeholder_caveat, /a guess for now/);
    }
  });

  test('UNKNOWN FEE, AS "not sure" AND AS ABSENT, STAYS UNDETERMINED', () => {
    for (const fee of ['not sure', undefined, null]) {
      const g = E.feeGate(fee, 'gp');
      assert.equal(g.outcome, 'UNDETERMINED', String(fee));
      assert.equal(g.withholds_quote, false);
      assert.ok(g.missing.includes('expected_fee'));
      assert.match(g.placeholder_caveat, /a guess for now/);
    }
  });

  test('SUPPORTED LIVING HAS NO COST ROW, AND AN UNKNOWN SECTOR IS UNKNOWN: both UNDETERMINED, naming the sector', () => {
    for (const sector of ['supported_living', 'not sure', undefined, null]) {
      const g = E.feeGate(1, sector);
      assert.equal(g.outcome, 'UNDETERMINED', String(sector));
      assert.equal(g.withholds_quote, false);
      assert.ok(g.missing.includes('sector'), String(sector));
      assert.match(g.placeholder_caveat, /a guess for now/);
    }
  });

  test('WIRED WHERE THE BACK END READS A FEE BEFORE IT IS INVOICED: the expected fee carries the gate, and the earned fee is not moved', async () => {
    const m = await made();
    try {
      const c = dunmarrowAtInvoice(m);
      assert.equal(c.sector, 'gp');
      const e = V.expectedFeeFor(m.app.db, c);
      assert.equal(e.expected_pence, 493_500, 'the gate moved an earned fee');
      assert.equal(e.gate.outcome, 'FIRE');
      assert.equal(e.gate.routes_to, 'we will come back to you with a price');
      assert.match(e.gate.placeholder_caveat, /a guess for now/);
      assert.equal(V.expectedFees(m.app.db).find((x) => x.claim_id === c.id)?.gate.outcome, 'FIRE', 'the finance view’s list does not carry it');
      assert.equal(V.expectedFeeFor(m.app.db, { ...c, sector: 'dental' }).gate.outcome, 'PASS');
      assert.equal(V.expectedFeeFor(m.app.db, { ...c, sector: 'supported_living' }).gate.outcome, 'UNDETERMINED');
      /* No sign-off: the fee is not known, and neither is the gate. */
      const other = m.app.db.get<{ id: string; claim_ref: string; business_id: string; sector: string | null }>(
        "SELECT c.id, c.claim_ref, c.business_id, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = 'Aldergate Care Group Limited'");
      assert.ok(other);
      const u = V.expectedFeeFor(m.app.db, other);
      assert.equal(u.expected_pence, null);
      assert.equal(u.gate.outcome, 'UNDETERMINED');
      assert.ok(u.gate.missing.includes('expected_fee'));
    } finally { m.close(); }
  });

  test('ON THE CLAIM: the estimated fee reads the routing sentence, keeps its figure for the person pricing it, and carries the caveat', async () => {
    const m = await made();
    try {
      const c = dunmarrowAtInvoice(m);
      const v = C.claimView(m.app.db, adminOf(m), c.id, { now: NOW, store: null });
      const f = v.estimated_fee;
      assert.ok(f, 'ADMIN was not given the estimated fee');
      assert.equal(f.amount, '£4,935', 'the earned fee was withheld from the reader holding invoice.read');
      assert.equal(f.gate.outcome, 'FIRE');
      assert.equal(f.gate.quote_withheld, true);
      assert.match(f.gate.reading, /^WE WILL COME BACK TO YOU WITH A PRICE — /);
      assert.match(f.gate.placeholder_caveat, /a guess for now/);
    } finally { m.close(); }
  });
});

/* ================================================================== *
 * LINE 13 — THREE ENGINE OUTPUTS
 * ================================================================== */

describe('line 13 (a) — the no-claim threshold where the fee is shown against the benefit', () => {
  const base: FIN.ComparisonFacts = {
    claim_value_pence: 2_000_000, entity_type: 'company', tax_rate: 0.25,
    pool_split_main_pence: 0, pool_split_special_pence: 2_000_000, period_start: '2025-04-01',
  };

  test('FIRES: £20,000 special rate at 25% — five-year relief less our £600 is under £1,000; the figures are printed and nothing is refused', () => {
    const r = FIN.feeVersusBenefit(base).recommendation_threshold;
    assert.equal(r.outcome, 'BELOW_THRESHOLD');
    assert.equal(r.fires, true);
    assert.equal(r.threshold, 1000);
    assert.equal(r.refuses_work, false);
    assert.match(r.for_the_tax_adviser, /FOR THE TAX ADVISER — AWAITING REVIEW/);
    const one = r.readings[0]?.threshold;
    assert.ok(one && one.fee === 600 && one.relief !== null && one.relief_after_fee !== null && one.relief_after_fee < 1000);
    assert.equal(one.refuses_work, false);
    assert.equal(one.withholds_quote, false);
    assert.equal(one.moves_figure, false);
  });

  test('DOES NOT FIRE: £500,000 main pool — the relief after our fee is well over £1,000', () => {
    const r = FIN.feeVersusBenefit({ ...base, claim_value_pence: 50_000_000, pool_split_main_pence: 50_000_000, pool_split_special_pence: 0 }).recommendation_threshold;
    assert.equal(r.outcome, 'AT_OR_ABOVE_THRESHOLD');
    assert.equal(r.fires, false);
  });

  test('UNKNOWN RELIEF NEVER FIRES — the rate, the pool split and the entity each "not sure" AND absent', () => {
    const cases: [string, Partial<Record<keyof FIN.ComparisonFacts, unknown>>][] = [
      ['rate not sure, no entity', { tax_rate: 'not sure', entity_type: null }],
      ['rate and entity absent', { tax_rate: undefined, entity_type: undefined }],
      ['rate and entity null', { tax_rate: null, entity_type: null }],
      ['pool split not sure', { pool_split_main_pence: 'not sure', pool_split_special_pence: 'not sure' }],
      ['pool split absent', { pool_split_main_pence: undefined, pool_split_special_pence: undefined }],
      ['allowances not known', { claim_value_pence: null }],
    ];
    for (const [label, over] of cases) {
      const r = FIN.feeVersusBenefit({ ...base, ...over } as unknown as FIN.ComparisonFacts).recommendation_threshold;
      assert.equal(r.outcome, 'UNDETERMINED', label);
      assert.equal(r.fires, false, label);
      assert.ok(r.why !== null && r.why.length > 0, label);
    }
  });

  test('ON A CLAIM’S FEE INVOICE: the seeded invoices carry the reading, and none of them is refused or moved', async () => {
    const m = await made();
    try {
      const rows = INV.claimInvoices(m.app.db, adminOf(m), NOW).filter((r) => r.comparison !== null);
      assert.ok(rows.length > 0, 'no seeded fee invoice to read');
      for (const row of rows) {
        const r = row.comparison?.recommendation_threshold;
        assert.ok(r, 'a fee invoice’s comparison carries no no-claim reading');
        assert.ok(['BELOW_THRESHOLD', 'AT_OR_ABOVE_THRESHOLD', 'UNDETERMINED'].includes(r.outcome));
        assert.equal(r.refuses_work, false);
      }
    } finally { m.close(); }
  });
});

describe('line 13 (b) — the region switches are passed; the Inner London switch stays off and London still refuses', () => {
  const STORE = PORT.inMemoryPostcodeStore({
    table_id: 'CB_ONS_POSTCODE_AUTHORITY', source: 'HAND-TYPED TEST FIXTURE - not an ONS file', licence: 'n/a - fixture',
    loaded: true, verified_at: '2026-08-15T00:00:00.000Z', release: 'AUG_2026', release_year: 2026, record_count: 2,
    byPostcode: {
      'SW1A 1AA': { lad_code: 'E09000033', lad_name: 'Westminster', country_code: 'E92000001', region_code: 'E12000007', terminated_on: null },
      'M1 1AE': { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E92000001', region_code: 'E12000002', terminated_on: null },
    },
  });

  test('AS SHIPPED THE SWITCH IS OFF, AND LONDON REFUSES EXACTLY AS BEFORE', () => {
    assert.equal(PORT.REGION_SWITCHES[PORT.SURVEYOR_INNER_LONDON_ONS_FOURTEEN], false);
    const r = PC.resolveProperty('SW1A 1AA', { store: STORE });
    assert.equal(r.region, PORT.REGION_NOT_CAPTURED);
    assert.equal(r.region_derived, false);
    assert.match(r.why, /rather than taking the cheaper of the two/);
    assert.equal(PC.resolveProperty('M1 1AE', { store: STORE }).region, 'North West');
  });

  test('THE ARGUMENT REACHES THE MODULE: switched on, Westminster is Inner London; "not sure", null and absent refuse as off', () => {
    const on = PC.resolveProperty('SW1A 1AA', { store: STORE, regionSwitches: { [PORT.SURVEYOR_INNER_LONDON_ONS_FOURTEEN]: true } });
    assert.equal(on.region, 'Inner London');
    const off = PC.resolveProperty('SW1A 1AA', { store: STORE }).why;
    for (const sw of [{ [PORT.SURVEYOR_INNER_LONDON_ONS_FOURTEEN]: 'not sure' }, { [PORT.SURVEYOR_INNER_LONDON_ONS_FOURTEEN]: undefined }, {}, null]) {
      const r = PC.resolveProperty('SW1A 1AA', { store: STORE, regionSwitches: sw });
      assert.equal(r.region, PORT.REGION_NOT_CAPTURED, JSON.stringify(sw));
      assert.equal(r.why, off, 'a switch that is not `true` did not refuse field for field as off');
    }
  });
});
