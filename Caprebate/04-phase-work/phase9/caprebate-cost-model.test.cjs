/* =============================================================================
   CAPREBATE — RESIDUAL COST MODEL, TESTS (Phase 9)

   Board 18422317809. Items 12804374366, 12804380489, 12804374707, 12804317685,
   12804374838.

   Run:  node --test caprebate-cost-model.test.cjs

   ---------------------------------------------------------------------------
   EVERY FIXTURE TABLE IN THIS FILE IS INVENTED.

   The numbers below are NOT the VOA fee scale, NOT Spon's location factors, NOT
   VOA obsolescence scales and NOT CIBSE plant lives. They are round numbers I
   chose so the arithmetic is checkable by eye. They exist to prove the
   MECHANISM works - that a banded scale is looked up correctly, that a
   location factor moves rates from where the book priced them to where the
   property is, on the base the table declares (Phase 132; it used to divide by
   a mean), that depreciation clamps at the end of life - without a single
   licensed figure entering this repository.

   The one exception is 94-against-a-national-mean-of-100 for Cardiff, which is
   the worked example written on the board item itself and is used here only as
   a shape check. The Outer-London tables and every price-book entry added by
   Phase 132 are invented, and describe no real book. (Updated 28 September
   2026, Phase 153: so is the BCIS-shaped table of D30 to D34 - it copies only
   BCIS's published base, a UK mean of 100, and holds no BCIS figure.)

   Nothing in this file may be promoted to a default. When the real tables land
   they go in the module's empty stubs, not here, and these fixtures stay
   invented.
   ============================================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const M = require("./caprebate-cost-model.cjs");

const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 1e-9 : tol);
const codeOf = fn => { try { fn(); return "NO_THROW"; } catch (e) { return e.code || e.name; } };

/* --------------------------------------------------- invented fixtures ---- */

/* A regressive fee scale: the rate falls as the contract grows. Invented. */
const FEE_SCALE_FIXTURE = {
  table_id: "CB_VOA_FEE_SCALE", source: "INVENTED TEST FIXTURE - not VOA data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-27",
  bands: [[0, 100000, 0.20], [100000, 1000000, 0.12], [1000000, null, 0.08]]
};

/* Cardiff 94 against a national mean of 100 - the board's own worked example.
   Phase 132 (14 September 2026): the table no longer carries a bare mean. It
   declares its base and the price book it belongs to, and that book declares
   its rates are priced at the national mean, so Cardiff is still 94 / 100. */
const PS = "invented_book_a";
const NATIONAL_MEAN_BASE = { basis: "national_mean", base_key: "national_mean", base_value: 100 };
const LOCATION_FIXTURE = {
  table_id: "CB_LOCATION_FACTORS", source: "INVENTED TEST FIXTURE - not Spon's/BCIS",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-27",
  price_source: PS,
  index_base: NATIONAL_MEAN_BASE,
  factors: { cardiff: 94, london_inner: 120, national_mean: 100 }
};

/* Phase 132. The price-book register, invented. Book A excludes on-costs from
   its rates, book B includes them, and C, D and E have not recorded the answer
   in the three ways a form can fail to record it. None of these is a real
   book, and none of the answers is a real book's answer. */
const bookEntry = extra => Object.assign({
  index_base: NATIONAL_MEAN_BASE, rates_priced_at_key: "national_mean"
}, extra);
const PRICE_SOURCES_FIXTURE = {
  table_id: "CB_PRICE_SOURCES", source: "INVENTED TEST FIXTURE - describes no real price book",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-09-14",
  sources: {
    invented_book_a: bookEntry({ label: "INVENTED BOOK A", rates_include_oncosts: false }),
    invented_book_b: bookEntry({ label: "INVENTED BOOK B", rates_include_oncosts: true }),
    invented_book_c: bookEntry({ label: "INVENTED BOOK C", rates_include_oncosts: null }),
    invented_book_d: bookEntry({ label: "INVENTED BOOK D", rates_include_oncosts: "unsure" }),
    invented_book_e: bookEntry({ label: "INVENTED BOOK E" })
  }
};

/* An INTERPOLATED contract-size scale quoted the way the real book quotes it -
   as a percentage adjustment, over a stated validity window. Invented, and the
   numbers are chosen so the interpolation is checkable by eye: the window runs
   2,000,000 to 5,000,000, the published adjustment runs +10% down to -5%, and
   the midpoint 3,500,000 sits exactly between the middle two points.
   The REAL window is about GBP 2m to GBP 5m, which is why those bounds are used
   here: the standing worked example is a GBP 6m contract and must refuse. */
const CONTRACT_SIZE_FIXTURE = {
  table_id: "CB_CONTRACT_SIZE_ADJUSTMENT", source: "INVENTED TEST FIXTURE",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-27",
  assumed_contract_value: 3000000,
  quoted_as: "percentage_adjustment",
  valid_from: 2000000,
  valid_to: 5000000,
  points: [[2000000, 10], [3000000, 0], [4000000, -2], [5000000, -5]]
};

/* The same scale quoted as FACTORS instead of percentages, to prove quoted_as
   actually switches the conversion rather than being decoration. */
const CONTRACT_SIZE_AS_FACTORS_FIXTURE = Object.assign({}, CONTRACT_SIZE_FIXTURE, {
  quoted_as: "factor",
  points: [[2000000, 1.10], [3000000, 1.00], [4000000, 0.98], [5000000, 0.95]]
});

/* A straight-line-ish obsolescence scale with a 20% residual floor. Invented. */
const OBSOLESCENCE_FIXTURE = {
  table_id: "CB_VOA_OBSOLESCENCE", source: "INVENTED TEST FIXTURE - not VOA data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-27",
  scales: {
    default: {
      residual_floor: 0.20,
      bands: [[0, 0.25, 1.00], [0.25, 0.50, 0.80], [0.50, 0.75, 0.55],
              [0.75, 1.00, 0.35], [1.00, null, 0.25]]
    },
    /* a scale whose tail dips BELOW its own floor, to prove the floor bites */
    steep: {
      residual_floor: 0.30,
      bands: [[0, 0.50, 0.90], [0.50, 1.00, 0.40], [1.00, null, 0.05]]
    }
  }
};

const PLANT_LIVES_FIXTURE = {
  table_id: "CB_CIBSE_PLANT_LIVES", source: "INVENTED TEST FIXTURE - not CIBSE data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-27",
  default_scale: "default",
  lives_years: { passenger_lift: 20, space_heating: 20, nurse_call: 10, drainage: 50 }
};

/* F-1 building-type adders. Invented, and deliberately NOT the published
   figures: "standard" is 0 so every banded expectation above still holds. */
const FEE_ADDERS_FIXTURE = {
  table_id: "CB_VOA_FEE_BUILDING_TYPE_ADDERS", source: "INVENTED ADDER FIXTURE - not VOA data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-09-12",
  adders: { standard: 0, highly_serviced: 0.05, hospital: 0.02 }
};

const ALL_FIXTURES = {
  CB_VOA_FEE_SCALE: FEE_SCALE_FIXTURE,
  CB_VOA_FEE_BUILDING_TYPE_ADDERS: FEE_ADDERS_FIXTURE,
  CB_LOCATION_FACTORS: LOCATION_FIXTURE,
  CB_PRICE_SOURCES: PRICE_SOURCES_FIXTURE,
  CB_CONTRACT_SIZE_ADJUSTMENT: CONTRACT_SIZE_FIXTURE,
  CB_VOA_OBSOLESCENCE: OBSOLESCENCE_FIXTURE,
  CB_CIBSE_PLANT_LIVES: PLANT_LIVES_FIXTURE
};

const ON = gates => ({ gates: gates, tables: ALL_FIXTURES });

/* Since Phase 129 (F-1) the fee scale and its building-type adder are
   interlocked: the scale alone refuses. Every test that means "the fee scale
   is on" turns both on. */
const E3_BOTH = { leg_e3_voa_fee_scale: true, leg_e3_building_type_adder: true };

/* =============================================================================
   A. NOTHING SHIPPED — the defaults are the whole safety argument
   ============================================================================= */

test("A1 every Phase 9 gate ships false", () => {
  const gates = M.CB_P9_GATES;
  assert.deepEqual(Object.keys(gates).sort(), [
    "leg_e2_drop_prelims_from_erc",
    "leg_e2_oncosts_by_price_source",
    "leg_e2_prelims_banded_by_job_size",
    "leg_e3_building_type_adder",
    "leg_e3_voa_fee_scale",
    "leg_e4_contract_size_outside_window",
    "leg_e4_location_and_contract_size",
    "leg_e5_crosswalk_completeness_gate",
    "leg_e5_per_element_depreciation",
    "leg_e5b_whole_building_depreciation"
  ]);
  for (const k of Object.keys(gates)) {
    assert.equal(gates[k], false, k + " must ship false");
  }
});

test("A2 every licensed or purchased table ships empty and says why", () => {
  for (const id of Object.keys(M.CB_P9_TABLES)) {
    const t = M.CB_P9_TABLES[id];
    assert.equal(t.loaded, false, id + " must ship loaded:false");
    assert.equal(t.verified_at, null, id + " must ship unverified");
    assert.ok(t.licence && t.licence.length > 10, id + " must carry a licence note");
  }
  assert.deepEqual(M.CB_VOA_FEE_SCALE.bands, []);
  assert.deepEqual(M.CB_VOA_FEE_BUILDING_TYPE_ADDERS.adders, {});
  assert.deepEqual(M.CB_LOCATION_FACTORS.factors, {});
  /* Phase 132: the stub declares no base and carries no bare mean */
  assert.equal(M.CB_LOCATION_FACTORS.index_base, null);
  assert.equal(M.CB_LOCATION_FACTORS.price_source, null);
  assert.equal("mean" in M.CB_LOCATION_FACTORS, false);
  assert.deepEqual(M.CB_PRICE_SOURCES.sources, {});
  assert.equal(M.CB_P9_TABLES.CB_PRICE_SOURCES, M.CB_PRICE_SOURCES);
  assert.deepEqual(M.CB_CONTRACT_SIZE_ADJUSTMENT.points, []);
  assert.equal(M.CB_CONTRACT_SIZE_ADJUSTMENT.quoted_as, null);
  assert.equal(M.CB_CONTRACT_SIZE_ADJUSTMENT.valid_from, null);
  assert.equal(M.CB_CONTRACT_SIZE_ADJUSTMENT.valid_to, null);
  assert.deepEqual(M.CB_VOA_OBSOLESCENCE.scales, {});
  assert.deepEqual(M.CB_CIBSE_PLANT_LIVES.lives_years, {});
  /* Phase 147: the CIBSE table names the licence that keeps it empty. */
  assert.equal(M.CB_CIBSE_PLANT_LIVES.loaded, false);
  assert.match(M.CB_CIBSE_PLANT_LIVES.licence, /^NOT CLEARED - licence CIBSE_KNOWLEDGE/);
  assert.deepEqual(M.CB_VOA_BUILDING_OBSOLESCENCE.scales, {});
});

test("A3 a gate turned on over an empty stub refuses rather than guessing", () => {
  assert.equal(
    codeOf(() => M.feesFactor(
      { cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:500000 },
      { gates: { leg_e3_voa_fee_scale: true } })),
    "E_TABLE_NOT_LOADED");
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor(
      { location_key: "cardiff" },
      { gates: { leg_e4_location_and_contract_size: true } })),
    "E_TABLE_NOT_LOADED");
  assert.equal(
    codeOf(() => M.elementDepreciationFactor(
      { element_ref: "passenger_lift", age_years: 5 },
      { gates: { leg_e5_per_element_depreciation: true } })),
    "E_TABLE_NOT_LOADED");
});

test("A4 the refusal names the gate and the licence, so the reader knows who to ask", () => {
  try {
    M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:1 },
      { gates: { leg_e3_voa_fee_scale: true } });
    assert.fail("should have thrown");
  } catch (e) {
    assert.equal(e.detail.gate, "leg_e3_voa_fee_scale");
    assert.match(e.detail.licence, /VOA licence/);
  }
});

/* =============================================================================
   B. LEG-E2 — preliminaries (12804374366)
   ============================================================================= */

test("B1 gate off — the residual path still carries the 18% double count", () => {
  const r = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL });
  assert.equal(r.factor, 1.18);
  assert.ok(r.flags.includes("LEG_E2_DOUBLE_COUNT_PRESENT"));
});

test("B2 gate on — the uplift is removed, and it needs no table to do it", () => {
  const r = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL },
    { gates: { leg_e2_drop_prelims_from_erc: true } });   /* note: no tables passed */
  assert.equal(r.factor, 1);
  assert.equal(r.applied, false);
  assert.ok(r.flags.includes("LEG_E2_APPLIED"));
  assert.match(r.authority, /already inside the estimated replacement/);
});

test("B3 the invoice path is NOT touched by the gate — Wetherspoon still applies", () => {
  const off = M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE });
  const on = M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE },
    { gates: { leg_e2_drop_prelims_from_erc: true } });
  assert.equal(off.factor, 1.18);
  assert.equal(on.factor, 1.18, "LEG-E2 must not reverse Wetherspoon on the invoice path");
  assert.match(on.authority, /Wetherspoon/);
  assert.deepEqual(on.flags, []);
});

test("B4 cost_basis is never defaulted — the two paths go opposite ways", () => {
  assert.equal(codeOf(() => M.prelimsFactor({})), "E_COST_BASIS_REQUIRED");
  assert.equal(codeOf(() => M.prelimsFactor({ cost_basis: "something_else" })),
    "E_COST_BASIS_REQUIRED");
});

test("B5 removing the double count LOWERS the qualifying figure — it was overstating", () => {
  const job = {
    purchase_consideration: 2000000,
    land_fraction_low: 0.25, land_fraction_high: 0.35,
    elements: [
      { element_ref: "space_heating", pool: "special", qty: 1, rate: 300000 },
      { element_ref: "fit_out", pool: "main", qty: 1, rate: 200000 },
      { element_ref: "shell", pool: "nonqual", qty: 1, rate: 900000 }
    ]
  };
  const before = M.residualApportionment(job);
  const after = M.residualApportionment(job, { gates: { leg_e2_drop_prelims_from_erc: true } });
  assert.ok(after.qualifying_pm.high < before.qualifying_pm.high,
    "the fix must reduce the claim; it was a double count in our favour");
  assert.ok(after.apportioned_land.high > before.apportioned_land.high,
    "and the value it releases lands back in land, which is where it belonged");
});

test("B6 and the overstatement is far smaller than 18%, because the ratio partly cancels", () => {
  const job = {
    purchase_consideration: 2000000,
    land_fraction_low: 0.30, land_fraction_high: 0.30,
    elements: [
      { element_ref: "plant", pool: "main", qty: 1, rate: 500000 },
      { element_ref: "shell", pool: "nonqual", qty: 1, rate: 900000 }
    ]
  };
  const before = M.residualApportionment(job).qualifying_pm.high;
  const after = M.residualApportionment(job,
    { gates: { leg_e2_drop_prelims_from_erc: true } }).qualifying_pm.high;
  const overstatement = (before - after) / after;
  assert.ok(overstatement > 0, "there is a real overstatement");
  assert.ok(overstatement < 0.18,
    "but it is materially less than 18% — a common uplift on A and B partly " +
    "cancels in m = PC/(A+B+C). Got " + (overstatement * 100).toFixed(2) + "%");
});

/* -----------------------------------------------------------------------
   B7 to B14 — PHASE 132, 14 September 2026. "Stop counting site overheads
   twice in the cost build-up." Whether the unit rate already carries on-costs
   is a fact about the PRICE BOOK: leg_e2_oncosts_by_price_source reads it off
   CB_PRICE_SOURCES[price_source].rates_include_oncosts. Known true drops
   prelims, known false keeps today's figure, anything else refuses (N4).
   ----------------------------------------------------------------------- */

/* The whole thrown error, so "behaves identically" can be asserted as a deep
   equality rather than as a matching code. */
const errWhole = fn => {
  try { fn(); return null; } catch (e) { return { code: e.code, message: e.message, detail: e.detail }; }
};
const ONCOSTS_ON = { leg_e2_oncosts_by_price_source: true };
const DROP_ON = { leg_e2_drop_prelims_from_erc: true };
const PRELIMS_JOB = {
  purchase_consideration: 2000000,
  land_fraction_low: 0.25, land_fraction_high: 0.35,
  elements: [
    { element_ref: "space_heating", pool: "special", qty: 1, rate: 300000 },
    { element_ref: "fit_out", pool: "main", qty: 1, rate: 200000 },
    { element_ref: "shell", pool: "nonqual", qty: 1, rate: 900000 }
  ]
};

test("B7 the on-costs gate ships false, and off it is identical to today over a representative input set (Phase 132)", () => {
  assert.equal(M.CB_P9_GATES.leg_e2_oncosts_by_price_source, false);
  const sources = [undefined, null, "unsure", PS, "invented_book_b", "invented_book_c",
                   "invented_book_z"];
  let compared = 0;
  for (const basis of [M.COST_BASIS.RESIDUAL, M.COST_BASIS.INVOICE]) {
    for (const rate of [undefined, null, 0, 0.1, 0.18]) {
      for (const drop of [false, true]) {
        /* today's call: no price source, the new gate never mentioned */
        const today = M.prelimsFactor({ cost_basis: basis, prelims_rate: rate },
          { gates: { leg_e2_drop_prelims_from_erc: drop } });
        for (const src of sources) {
          for (const gates of [{ leg_e2_drop_prelims_from_erc: drop },
                               { leg_e2_drop_prelims_from_erc: drop, leg_e2_oncosts_by_price_source: false }]) {
            const now = M.prelimsFactor({ cost_basis: basis, prelims_rate: rate, price_source: src },
              { gates: gates, tables: ALL_FIXTURES });
            assert.deepEqual(now, today,
              basis + " / rate " + rate + " / drop " + drop + " / source " + src);
            compared++;
          }
        }
      }
    }
  }
  assert.equal(compared, 2 * 5 * 2 * 7 * 2);
  /* and today's figures, stated rather than inherited */
  assert.equal(M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_b" }).factor, 1.18);
  assert.equal(M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE, price_source: "invented_book_b" }).factor, 1.18);

  /* through the whole model, a price source on the job moves nothing while the gate is off */
  for (const src of sources) {
    assert.deepEqual(M.residualApportionment(Object.assign({}, PRELIMS_JOB, { price_source: src }),
      { tables: ALL_FIXTURES }), M.residualApportionment(PRELIMS_JOB));
  }
});

test("B8 gate on, a book whose rates INCLUDE on-costs: no prelims uplift, flagged", () => {
  for (const rate of [undefined, 0.12]) {
    const r = M.prelimsFactor(
      { cost_basis: M.COST_BASIS.RESIDUAL, prelims_rate: rate, price_source: "invented_book_b" },
      ON(ONCOSTS_ON));
    assert.equal(r.factor, 1);
    assert.equal(r.rate, 0);
    assert.equal(r.applied, false);
    assert.equal(r.rates_include_oncosts, true);
    assert.deepEqual(r.flags, ["LEG_E2_ONCOSTS_IN_RATES"]);
    assert.match(r.authority, /already include/);
  }
});

test("B9 gate on, a book whose rates EXCLUDE on-costs: today's prelims figure, flagged", () => {
  for (const rate of [undefined, 0.12]) {
    const r = M.prelimsFactor(
      { cost_basis: M.COST_BASIS.RESIDUAL, prelims_rate: rate, price_source: PS }, ON(ONCOSTS_ON));
    const today = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, prelims_rate: rate });
    assert.equal(r.factor, today.factor);
    assert.equal(r.rate, today.rate);
    assert.equal(r.applied, true);
    assert.equal(r.rates_include_oncosts, false);
    assert.deepEqual(r.flags, ["LEG_E2_ONCOSTS_EXCLUDED_BY_SOURCE"]);
  }
  assert.equal(M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: PS }, ON(ONCOSTS_ON)).factor, 1.18);
});

test("B10 N4 gate on, on-costs recorded as null, \"unsure\" or ABSENT refuse identically — never defaulted either way", () => {
  const entry = { label: "INVENTED BOOK X", index_base: NATIONAL_MEAN_BASE, rates_priced_at_key: "national_mean" };
  const tablesWith = extra => Object.assign({}, ALL_FIXTURES, {
    CB_PRICE_SOURCES: Object.assign({}, PRICE_SOURCES_FIXTURE,
      { sources: { invented_book_x: Object.assign({}, entry, extra) } })
  });
  const job = { cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_x" };
  const absent = errWhole(() => M.prelimsFactor(job, { gates: ONCOSTS_ON, tables: tablesWith({}) }));
  assert.equal(absent.code, "E_ONCOSTS_BASIS_UNKNOWN");
  for (const notKnown of [null, undefined, "unsure", "not sure", "true", 1, 0]) {
    const e = errWhole(() => M.prelimsFactor(job,
      { gates: ONCOSTS_ON, tables: tablesWith({ rates_include_oncosts: notKnown }) }));
    assert.deepEqual(e, absent, "rates_include_oncosts " + String(notKnown) + " must behave exactly as an absent one");
  }
  /* the shared fixture's books C (null), D ("unsure") and E (absent) all refuse, directly and through the model */
  for (const book of ["invented_book_c", "invented_book_d", "invented_book_e"]) {
    assert.equal(codeOf(() => M.prelimsFactor(
      { cost_basis: M.COST_BASIS.RESIDUAL, price_source: book }, ON(ONCOSTS_ON))), "E_ONCOSTS_BASIS_UNKNOWN");
    assert.equal(codeOf(() => M.residualApportionment(
      Object.assign({}, PRELIMS_JOB, { price_source: book }), ON(ONCOSTS_ON))), "E_ONCOSTS_BASIS_UNKNOWN");
  }
});

test("B11 N4 gate on, an ABSENT price source and one recorded as \"unsure\" refuse identically; an unlisted one refuses too", () => {
  const absent = errWhole(() => M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL }, ON(ONCOSTS_ON)));
  assert.equal(absent.code, "E_PRICE_SOURCE_REQUIRED");
  assert.equal(absent.detail.reason, "not_stated");
  for (const notKnown of [undefined, null, "", "unsure", "not sure", " Not Sure "]) {
    assert.deepEqual(errWhole(() => M.prelimsFactor(
      { cost_basis: M.COST_BASIS.RESIDUAL, price_source: notKnown }, ON(ONCOSTS_ON))), absent,
      "price_source " + JSON.stringify(notKnown) + " must behave exactly as an absent one");
    assert.deepEqual(
      errWhole(() => M.residualApportionment(Object.assign({}, PRELIMS_JOB, { price_source: notKnown }), ON(ONCOSTS_ON))),
      errWhole(() => M.residualApportionment(PRELIMS_JOB, ON(ONCOSTS_ON))));
  }
  const unlisted = errWhole(() => M.prelimsFactor(
    { cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_z" }, ON(ONCOSTS_ON)));
  assert.equal(unlisted.code, "E_PRICE_SOURCE_REQUIRED");
  assert.equal(unlisted.detail.reason, "not_listed");
  /* over the shipped empty register the gate refuses as a gate over an empty table */
  const stub = errWhole(() => M.prelimsFactor(
    { cost_basis: M.COST_BASIS.RESIDUAL, price_source: PS }, { gates: ONCOSTS_ON }));
  assert.equal(stub.code, "E_TABLE_NOT_LOADED");
  assert.equal(stub.detail.gate, "leg_e2_oncosts_by_price_source");
  assert.equal(stub.detail.table, "CB_PRICE_SOURCES");
});

test("B12 gate on, the invoice path is untouched — Wetherspoon still applies, whatever the book says", () => {
  for (const rate of [undefined, null, 0.1]) {
    const today = M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE, prelims_rate: rate });
    for (const src of [undefined, "unsure", PS, "invented_book_b", "invented_book_c", "invented_book_z"]) {
      const on = M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE, prelims_rate: rate, price_source: src },
        ON(ONCOSTS_ON));
      assert.deepEqual(on, today, "invoice / rate " + rate + " / source " + src);
    }
  }
  const r = M.prelimsFactor({ cost_basis: M.COST_BASIS.INVOICE, price_source: "invented_book_b" }, ON(ONCOSTS_ON));
  assert.equal(r.factor, 1.18);
  assert.match(r.authority, /Wetherspoon/);
});

test("B13 both leg_e2 gates on refuses with E_GATE_CONFLICT — they are alternatives, not layers", () => {
  const both = ON(Object.assign({}, DROP_ON, ONCOSTS_ON));
  for (const src of [undefined, "unsure", PS, "invented_book_b", "invented_book_c"]) {
    const e = errWhole(() => M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: src }, both));
    assert.equal(e.code, "E_GATE_CONFLICT", "source " + src);
    assert.deepEqual(e.detail.gates, ["leg_e2_drop_prelims_from_erc", "leg_e2_oncosts_by_price_source"]);
  }
  assert.equal(codeOf(() => M.residualApportionment(
    Object.assign({}, PRELIMS_JOB, { price_source: "invented_book_b" }), both)), "E_GATE_CONFLICT");
  /* each alone is fine */
  assert.equal(codeOf(() => M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_b" }, ON(DROP_ON))), "NO_THROW");
  assert.equal(codeOf(() => M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_b" }, ON(ONCOSTS_ON))), "NO_THROW");
});

test("B14 through the model: a book with on-costs in its rates gives the dropped-prelims figure, a book without gives today's", () => {
  const today = M.residualApportionment(PRELIMS_JOB);
  const dropped = M.residualApportionment(PRELIMS_JOB, { gates: DROP_ON });
  const inRates = M.residualApportionment(Object.assign({}, PRELIMS_JOB, { price_source: "invented_book_b" }), ON(ONCOSTS_ON));
  const excluded = M.residualApportionment(Object.assign({}, PRELIMS_JOB, { price_source: PS }), ON(ONCOSTS_ON));
  assert.deepEqual(inRates.components, dropped.components);
  assert.deepEqual(inRates.qualifying_pm, dropped.qualifying_pm);
  assert.deepEqual(excluded.components, today.components);
  assert.deepEqual(excluded.qualifying_pm, today.qualifying_pm);
  assert.ok(inRates.qualifying_pm.high < excluded.qualifying_pm.high);
  assert.ok(inRates.flags.includes("LEG_E2_ONCOSTS_IN_RATES"));
  assert.ok(!inRates.flags.includes("LEG_E2_DOUBLE_COUNT_PRESENT"));
  assert.ok(excluded.flags.includes("LEG_E2_ONCOSTS_EXCLUDED_BY_SOURCE"));
  assert.ok(!excluded.flags.includes("LEG_E2_DOUBLE_COUNT_PRESENT"));
});

/* =============================================================================
   C. LEG-E3 — professional fees (12804380489)
   ============================================================================= */

test("C1 gate off — flat 15%, unsourced, and flagged as such", () => {
  const r = M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL });
  assert.equal(near(r.factor, 1.15), true);
  assert.equal(r.banded, false);
  assert.ok(r.flags.includes("LEG_E3_FLAT_FEE_PRESENT"));
  assert.match(r.authority, /NO SOURCE CITED/);
});

test("C2 gate on with an injected scale — the band mechanism works", () => {
  const opts = ON(E3_BOTH);
  assert.equal(M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:50000 }, opts).rate, 0.20);
  assert.equal(M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:500000 }, opts).rate, 0.12);
  assert.equal(M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:5000000 }, opts).rate, 0.08);
});

test("C3 bands are half-open — a value on a boundary lands in exactly one band", () => {
  const opts = ON(E3_BOTH);
  assert.equal(M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:100000 }, opts).rate, 0.12,
    "100000 belongs to the upper band, not the lower one");
  assert.equal(M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:99999.99 }, opts).rate, 0.20);
});

test("C4 the flat rate is wrong in BOTH directions, which is why it cannot be tuned away", () => {
  const opts = ON(E3_BOTH);
  const small = M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:50000 }, opts).rate;
  const large = M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:5000000 }, opts).rate;
  assert.ok(small > M.SPEC_FEES_DEFAULT, "flat 15% UNDERstates a small job");
  assert.ok(large < M.SPEC_FEES_DEFAULT, "flat 15% OVERstates a large job");
});

test("C5 gate on without a construction cost refuses — the scale is banded on it", () => {
  assert.equal(
    codeOf(() => M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL }, ON(E3_BOTH))),
    "E_CONSTRUCTION_COST_REQUIRED");
});

test("C6 the invoice path never uses a scale — the quantum is on the invoice", () => {
  const r = M.feesFactor({ cost_basis: M.COST_BASIS.INVOICE, construction_cost: 5000000 },
    ON(E3_BOTH));
  assert.equal(r.banded, false);
  assert.equal(near(r.factor, 1.15), true);
});

test("C7 the Wetherspoon citation survives the fix — it is the authority, not the casualty", () => {
  const r = M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost:500000 },
    ON(E3_BOTH));
  assert.match(r.authority, /JD Wetherspoon plc v HMRC \[2012\] UKUT 42/);
  assert.match(r.authority, /quantum, not the principle/);
});

/* =============================================================================
   C8-C15. F-1 — the professional-fee rate by building type (12927234375)
   Phase 129, 12 September 2026. Built from the prepared patch of 29 August.
   The adders ship as an EMPTY STUB; FEE_ADDERS_FIXTURE above is invented.
   ============================================================================= */

const RES = (bt, cost) => ({ cost_basis: M.COST_BASIS.RESIDUAL, building_type: bt, construction_cost: cost });

test("C8 branch B — with every fee gate off the flat 15% is untouched, whatever the building type", () => {
  const plain = M.feesFactor({ cost_basis: M.COST_BASIS.RESIDUAL });
  const typed = M.feesFactor(RES("hospital", 500000));
  assert.equal(near(typed.factor, plain.factor), true);
  assert.equal(near(typed.factor, 1.15), true);
  assert.deepEqual(typed.flags, ["LEG_E3_FLAT_FEE_PRESENT"]);
});

test("C9 the adder gate on its own changes nothing while the fee scale is off", () => {
  const r = M.feesFactor(RES("hospital", 500000), ON({ leg_e3_building_type_adder: true }));
  assert.equal(near(r.factor, 1.15), true);
  assert.equal(r.banded, false);
});

test("C10 F1-1 the fee scale on WITHOUT the adder refuses — the under-read is unreachable", () => {
  let caught = null;
  try { M.feesFactor(RES("standard", 500000), ON({ leg_e3_voa_fee_scale: true })); } catch (e) { caught = e; }
  assert.equal(caught && caught.code, "E_BUILDING_TYPE_ADDER_REQUIRED");
  assert.equal(caught.detail.gate, "leg_e3_building_type_adder");
});

test("C11 F1-2 both gates on, building type ABSENT or not recognised: refused, never defaulted (N4, both asserted)", () => {
  assert.equal(codeOf(() => M.feesFactor(RES(undefined, 500000), ON(E3_BOTH))), "E_BUILDING_TYPE_REQUIRED");
  assert.equal(codeOf(() => M.feesFactor(RES("unsure", 500000), ON(E3_BOTH))), "E_BUILDING_TYPE_REQUIRED");
});

test("C12 F1-3 both gates on: the rate is the base band plus the adder, and each source is cited separately", () => {
  const r = M.feesFactor(RES("hospital", 2270000), ON(E3_BOTH));
  assert.equal(near(r.base_rate, 0.08), true);
  assert.equal(near(r.adder_rate, FEE_ADDERS_FIXTURE.adders.hospital), true);
  assert.equal(near(r.rate, 0.08 + FEE_ADDERS_FIXTURE.adders.hospital), true);
  assert.equal(near(r.factor, 1 + r.rate), true);
  assert.ok(r.authority.indexOf(FEE_SCALE_FIXTURE.source) !== -1, "the base scale is cited");
  assert.ok(r.authority.indexOf(FEE_ADDERS_FIXTURE.source) !== -1, "and the adder is cited on its own");
  assert.ok(r.flags.includes("LEG_E3_APPLIED") && r.flags.includes("LEG_E3_BUILDING_TYPE_ADDER_APPLIED"));
});

test("C13 F1-4 the adder does not invert the regressive slope", () => {
  const small = M.feesFactor(RES("highly_serviced", 500000), ON(E3_BOTH)).rate;
  const large = M.feesFactor(RES("highly_serviced", 5000000), ON(E3_BOTH)).rate;
  assert.ok(small > large);
});

test("C14 F1-5 a type with no adder on file is refused, and the shipped empty stub refuses too", () => {
  const partial = Object.assign({}, FEE_ADDERS_FIXTURE, { adders: { standard: 0 } });
  assert.equal(codeOf(() => M.feesFactor(RES("hospital", 500000),
    { gates: E3_BOTH, tables: Object.assign({}, ALL_FIXTURES, { CB_VOA_FEE_BUILDING_TYPE_ADDERS: partial }) })),
    "E_UNKNOWN_BUILDING_TYPE");
  assert.equal(codeOf(() => M.feesFactor(RES("standard", 500000),
    { gates: E3_BOTH, tables: { CB_VOA_FEE_SCALE: FEE_SCALE_FIXTURE } })),
    "E_TABLE_NOT_LOADED");
});

test("C15 the residual model carries the job's building type to the fee, and refuses a job without one once both gates are on", () => {
  const job = bt => ({ purchase_consideration: 2000000, land_value_estimate: 600000, building_type: bt,
    elements: [{ element_ref: "plant", pool: "main", qty: 1, rate: 400000 }] });
  const std = M.residualApportionment(job("standard"), ON(E3_BOTH)).components.A;
  const hosp = M.residualApportionment(job("hospital"), ON(E3_BOTH)).components.A;
  assert.ok(hosp > std, "a hospital's adder raises the fee-loaded component");
  assert.equal(codeOf(() => M.residualApportionment(job(undefined), ON(E3_BOTH))), "E_BUILDING_TYPE_REQUIRED");
  assert.equal(near(M.residualApportionment(job(undefined)).components.A,
                    M.residualApportionment(job("hospital")).components.A), true,
    "and with the gates off the building type moves nothing");
});

/* =============================================================================
   D. LEG-E4 — location and contract size (12804374707)
   ============================================================================= */

test("D1 gate off — national rates, unadjusted, and flagged", () => {
  const r = M.locationAndContractSizeFactor({ location_key: "cardiff" });
  assert.equal(r.factor, 1);
  assert.equal(r.applied, false);
  assert.ok(r.flags.includes("LEG_E4_NO_REGIONAL_ADJUSTMENT"));
});

test("D2 Cardiff at 94 on a declared national-mean base of 100, rates priced at that mean, gives 0.94 — the board's worked example (Phase 132)", () => {
  /* Rewritten 14 September 2026 (Phase 132). This used to read "94 against a
     mean of 100" and the module divided by the table's mean. The figure is the
     same; what produces it is now declared: the table says it is indexed to a
     national mean of 100, and the book says its rates are priced there. The
     contract value sits on the 0% point, so the whole factor is location. */
  const r = M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS, contract_value: 3000000 },
    ON({ leg_e4_location_and_contract_size: true }));
  assert.equal(near(r.location_factor, 0.94), true);
  assert.equal(near(r.factor, 0.94), true);
  assert.deepEqual(r.index_base, NATIONAL_MEAN_BASE);
  assert.equal(r.rates_priced_at_key, "national_mean");
  assert.equal(r.location_index, 94);
  assert.equal(r.rates_priced_at_index, 100);
});

test("D3 a dearer region raises the factor — the adjustment cuts both ways", () => {
  const r = M.locationAndContractSizeFactor(
    { location_key: "london_inner", price_source: PS, contract_value: 3000000 },
    ON({ leg_e4_location_and_contract_size: true }));
  assert.equal(near(r.location_factor, 1.20), true);
});

test("D4 an unlisted region refuses — it will not fall back to the mean", () => {
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor({ location_key: "atlantis" },
      ON({ leg_e4_location_and_contract_size: true }))),
    "E_LOCATION_NOT_IN_TABLE");
});

test("D5 gate on without a location refuses — a national rate is not a silent default", () => {
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor({},
      ON({ leg_e4_location_and_contract_size: true }))),
    "E_LOCATION_KEY_REQUIRED");
});

test("D6 contract size compounds with location, and an absent contract value now REFUSES (Phase 132, N4)", () => {
  const opts = ON({ leg_e4_location_and_contract_size: true });
  const withSize = M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS, contract_value: 2000000 }, opts);
  /* +10% published at the bottom of the window -> a factor of 1.10 */
  assert.equal(near(withSize.contract_size_factor, 1.10), true);
  assert.equal(near(withSize.factor, 0.94 * 1.10), true);

  /* Until 14 September 2026 a job with no contract value took a contract-size
     factor of 1 and the flag LEG_E4_NO_CONTRACT_SIZE: "not stated" became
     "exactly the book's assumed size". That was a pass on an absent fact. */
  assert.equal(codeOf(() => M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS }, opts)), "E_CONTRACT_VALUE_REQUIRED");
});

test("D7 the location factor lands on the TOTAL, before prelims and fees — order asserted", () => {
  const job = {
    purchase_consideration: 2000000, location_key: "cardiff",
    price_source: PS, contract_value: 3000000,   /* the 0% point - contract size neutral */
    land_value_estimate: 600000,
    elements: [{ element_ref: "plant", pool: "main", qty: 1, rate: 1000000 }]
  };
  const r = M.residualApportionment(job, ON({ leg_e4_location_and_contract_size: true }));
  /* A = 1,000,000 x 1.18 (prelims), then x 0.94 (location, once, on the total),
     then x 1.15 (fees). Multiplication commutes, so the FIGURE is the same as
     it was before Phase 97 - what changed is where the factor is applied, and
     that is asserted separately in D8 to D10. */
  assert.equal(near(r.components.A, 1000000 * 0.94 * 1.18 * 1.15, 1e-6), true);
});

/* -----------------------------------------------------------------------
   D8 to D13 — PHASE 97. Spon's Architects' and Builders' says its location
   and contract-size adjustments "need to be applied to the total cost plan
   value, not to individual material or element items". Until 7 September 2026
   this module multiplied the factor into every element inside the costing
   loop. The arithmetic came out the same, because one uniform factor
   distributes out of a sum - so an equality test on the total can NEVER catch
   this defect, and these tests assert the SHAPE instead.
   ----------------------------------------------------------------------- */

test("D8 no element line carries a location factor — the shape the source forbids", () => {
  const job = {
    purchase_consideration: 4000000, location_key: "cardiff", price_source: PS,
    contract_value: 3000000, land_value_estimate: 600000,
    elements: [
      { element_ref: "mechanical", pool: "main",    qty: 1788, rate: 230 },
      { element_ref: "electrical", pool: "main",    qty: 1788, rate: 195 },
      { element_ref: "frame",      pool: "nonqual", qty: 1788, rate: 272 }
    ]
  };
  const r = M.residualApportionment(job, ON({ leg_e4_location_and_contract_size: true }));
  for (const l of r.lines) {
    assert.equal(l.location_adjusted, false, l.element_ref + " must not be location-adjusted");
    assert.equal("location_factor" in l, false,
      l.element_ref + " must not carry a location_factor field at all — a report " +
      "generator that finds one will print it in the line's source column, which " +
      "is exactly the defect");
  }
  assert.equal(r.factors.location.applies_to, "total_cost_plan_value");
  assert.ok(r.flags.includes("LEG_E4_APPLIED_TO_TOTAL"));
  assert.equal(r.cost_plan.applied_per_element, false);
});

test("D9 the factor is applied exactly once, and the totals tie back to the unadjusted lines", () => {
  const job = {
    purchase_consideration: 4000000, location_key: "cardiff", price_source: PS,
    contract_value: 3000000, land_value_estimate: 600000,
    elements: [
      { element_ref: "mechanical", pool: "main",    qty: 1788, rate: 230 },
      { element_ref: "electrical", pool: "main",    qty: 1788, rate: 195 },
      { element_ref: "frame",      pool: "nonqual", qty: 1788, rate: 272 }
    ]
  };
  const r = M.residualApportionment(job, ON({ leg_e4_location_and_contract_size: true }));

  /* the published adjustment at 3,000,000 is 0%, so contract size is neutral
     here and the whole LEG-E4 factor is Cardiff's 0.94 */
  assert.equal(near(r.cost_plan.location_factor_applied_once, 0.94), true);

  const lineSum = r.lines.reduce((t, l) => t + l.cost_before_location_and_fees, 0);
  assert.equal(near(r.cost_plan.line_sum_unadjusted, lineSum, 1e-6), true);
  assert.equal(near(r.components.A + r.components.B,
                    lineSum * 0.94 * r.cost_plan.fees_factor, 1e-6), true);

  /* and the line sum is the raw quantity x rate x prelims, with NO 0.94 in it */
  const raw = (1788 * 230 + 1788 * 195 + 1788 * 272) * 1.18;
  assert.equal(near(lineSum, raw, 1e-6), true);
});

test("D10 the once-only guard is a live guard — a mutant that re-applies per element is caught", () => {
  /* A NEGATIVE CONTROL, because a guard that cannot be shown to fail proves
     nothing. This rebuilds the module with the DEFECT PUT BACK — the location
     factor multiplied into the costing loop, which is what this file did until
     7 September 2026 — and asserts the guard refuses it.

     Note what this establishes and what it does not. The mutant produces the
     SAME components.A and components.B as the corrected module, because one
     uniform factor distributes out of a sum. So no equality test on a total
     could ever have caught this. What catches it is the line no longer being
     explicable by the factors it declares. */
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");

  const src = fs.readFileSync(require.resolve("./caprebate-cost-model.cjs"), "utf8");
  const CORRECT = "const cost = qty * rate * dep.factor * prelims.factor * index;";
  const MUTANT  = "const cost = qty * rate * loc.factor * dep.factor * prelims.factor * index;";
  assert.equal(src.split(CORRECT).length - 1, 1,
    "the costing line this mutation targets has moved — fix the mutation, do " +
    "not delete the test");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cb-p97-"));
  const file = path.join(dir, "mutant.cjs");
  fs.writeFileSync(file, src.replace(CORRECT, MUTANT), "utf8");

  try {
    const Mut = require(file);
    const job = {
      purchase_consideration: 4000000, location_key: "cardiff", price_source: PS,
      contract_value: 3000000, land_value_estimate: 600000,
      elements: [
        { element_ref: "mechanical", pool: "main",    qty: 1788, rate: 230 },
        { element_ref: "frame",      pool: "nonqual", qty: 1788, rate: 272 }
      ]
    };
    const opts = { gates: { leg_e4_location_and_contract_size: true }, tables: ALL_FIXTURES };

    /* the corrected module runs it */
    assert.equal(codeOf(() => M.residualApportionment(job, opts)), "NO_THROW");
    /* the mutant does not */
    assert.equal(codeOf(() => Mut.residualApportionment(job, opts)),
      "E_LOCATION_FACTOR_NOT_APPLIED_ONCE");

    /* and with the gate OFF the mutant passes, because loc.factor is 1 and
       there is nothing to double-apply — which is exactly why this defect
       survived: every shipped configuration is a configuration it hides in. */
    assert.equal(codeOf(() => Mut.residualApportionment(job)), "NO_THROW");
  } finally {
    delete require.cache[require.resolve(file)];
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("D11 the contract-size scale INTERPOLATES rather than stepping", () => {
  const opts = ON({ leg_e4_location_and_contract_size: true });
  const at = v => M.locationAndContractSizeFactor(
    { location_key: "national_mean", price_source: PS, contract_value: v }, opts).contract_size_factor;

  /* tabulated points come back exactly */
  assert.equal(near(at(2000000), 1.10), true);
  assert.equal(near(at(3000000), 1.00), true);
  assert.equal(near(at(5000000), 0.95), true);

  /* halfway between 3,000,000 (0%) and 4,000,000 (-2%) is -1% -> 0.99 */
  assert.equal(near(at(3500000), 0.99), true);
  /* a quarter of the way from 4,000,000 (-2%) to 5,000,000 (-5%) is -2.75% */
  assert.equal(near(at(4250000), 1 + (-2.75) / 100), true);

  /* AND IT IS CONTINUOUS. A step function is what this replaced, so assert the
     absence of a step: one pound either side of a tabulated point must not move
     the factor perceptibly. */
  assert.equal(Math.abs(at(3000001) - at(2999999)) < 1e-6, true);
});

test("D12 a contract value outside the published window REFUSES rather than extrapolating", () => {
  const opts = ON({ leg_e4_location_and_contract_size: true });
  /* THE STANDING WORKED EXAMPLE IS GBP 6m AND THE BOOK STOPS AT GBP 5m, so this
     is the path that fires first when the price book is actually bought. */
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor(
      { location_key: "cardiff", price_source: PS, contract_value: 6000000 }, opts)),
    "E_SCALE_VALUE_OUT_OF_RANGE");
  /* and off the bottom, which is the small-job end */
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor(
      { location_key: "cardiff", price_source: PS, contract_value: 100000 }, opts)),
    "E_SCALE_VALUE_OUT_OF_RANGE");
  /* the boundaries themselves are IN range — a refusal at exactly GBP 5m would
     be an off-by-one dressed up as caution */
  assert.equal(codeOf(() => M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS, contract_value: 5000000 }, opts)), "NO_THROW");
  assert.equal(codeOf(() => M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS, contract_value: 2000000 }, opts)), "NO_THROW");
});

test("D13 quoted_as decides the conversion, and a missing one refuses", () => {
  const asPct = ON({ leg_e4_location_and_contract_size: true });
  const asFac = {
    gates: { leg_e4_location_and_contract_size: true },
    tables: Object.assign({}, ALL_FIXTURES,
      { CB_CONTRACT_SIZE_ADJUSTMENT: CONTRACT_SIZE_AS_FACTORS_FIXTURE })
  };
  const p = M.locationAndContractSizeFactor(
    { location_key: "national_mean", price_source: PS, contract_value: 5000000 }, asPct);
  const f = M.locationAndContractSizeFactor(
    { location_key: "national_mean", price_source: PS, contract_value: 5000000 }, asFac);

  /* -5% and 0.95 are the same adjustment expressed two ways */
  assert.equal(near(p.contract_size_factor, 0.95), true);
  assert.equal(near(f.contract_size_factor, 0.95), true);
  /* but the PUBLISHED figure is reported as the source wrote it, not converted */
  assert.equal(p.contract_size_published, -5);
  assert.equal(f.contract_size_published, 0.95);
  assert.equal(p.contract_size_quoted_as, "percentage_adjustment");

  /* A percentage loaded into a slot that does not say so would multiply every
     cost by minus five and still return a number. So it is never defaulted. */
  const silent = {
    gates: { leg_e4_location_and_contract_size: true },
    tables: Object.assign({}, ALL_FIXTURES, {
      CB_CONTRACT_SIZE_ADJUSTMENT:
        Object.assign({}, CONTRACT_SIZE_FIXTURE, { quoted_as: null })
    })
  };
  assert.equal(
    codeOf(() => M.locationAndContractSizeFactor(
      { location_key: "cardiff", price_source: PS, contract_value: 3000000 }, silent)),
    "E_SCALE_QUOTED_AS_MISSING");
});

test("D14 the scale refuses malformed data rather than interpolating through it", () => {
  const withScale = patch => ({
    gates: { leg_e4_location_and_contract_size: true },
    tables: Object.assign({}, ALL_FIXTURES, {
      CB_CONTRACT_SIZE_ADJUSTMENT: Object.assign({}, CONTRACT_SIZE_FIXTURE, patch)
    })
  });
  const run = patch => codeOf(() => M.locationAndContractSizeFactor(
    { location_key: "cardiff", price_source: PS, contract_value: 3000000 }, withScale(patch)));

  assert.equal(run({ points: [[3000000, 0]] }), "E_SCALE_TOO_SHORT");
  assert.equal(run({ valid_from: null }), "E_SCALE_VALIDITY_WINDOW_MISSING");
  assert.equal(run({ valid_to: 1000000 }), "E_SCALE_VALIDITY_WINDOW_MISSING");
  assert.equal(run({ points: [[3000000, 0], [2000000, 10]] }), "E_SCALE_NOT_ASCENDING");
  assert.equal(run({ points: [[3000000, 0], [3000000, 5]] }), "E_SCALE_NOT_ASCENDING");
  assert.equal(run({ points: [[2000000, 10], [9000000, -5]] }),
    "E_SCALE_POINT_OUTSIDE_WINDOW");
  assert.equal(run({ points: [[2000000, 10], [3000000, "nought"]] }),
    "E_SCALE_POINT_INVALID");
  assert.equal(run({ assumed_contract_value: null }),
    "E_CONTRACT_ASSUMED_VALUE_MISSING");
});

test("D15 percentage-to-factor is one function, and it refuses a units error", () => {
  assert.equal(near(M.percentageAdjustmentToFactor(0), 1), true);
  assert.equal(near(M.percentageAdjustmentToFactor(-5), 0.95), true);
  assert.equal(near(M.percentageAdjustmentToFactor(10), 1.10), true);
  /* -100% or worse zeroes or inverts a cost. That is a units error — somebody
     has passed a factor where a percentage belongs — not a published datum. */
  assert.equal(codeOf(() => M.percentageAdjustmentToFactor(-100)),
    "E_PERCENTAGE_OUT_OF_RANGE");
  assert.equal(codeOf(() => M.percentageAdjustmentToFactor(-250)),
    "E_PERCENTAGE_OUT_OF_RANGE");
  assert.equal(codeOf(() => M.percentageAdjustmentToFactor(undefined)),
    "E_PERCENTAGE_INVALID");
  assert.equal(codeOf(() => M.percentageAdjustmentToFactor(NaN)),
    "E_PERCENTAGE_INVALID");
});

test("D16 the fee scale keeps its BANDS — not everything published is a curve", () => {
  /* The VOA professional fee scale genuinely is banded: every contract inside a
     band carries the same rate, and that is what the source publishes. The
     contract-size correction must not be over-applied to it. */
  assert.equal(M.bandLookup(FEE_SCALE_FIXTURE.bands, 50000, "cost"), 0.20);
  assert.equal(M.bandLookup(FEE_SCALE_FIXTURE.bands, 500000, "cost"), 0.12);
  assert.equal(M.bandLookup(FEE_SCALE_FIXTURE.bands, 5000000, "cost"), 0.08);
  /* a step at the edge, deliberately */
  assert.notEqual(M.bandLookup(FEE_SCALE_FIXTURE.bands, 99999, "cost"),
                  M.bandLookup(FEE_SCALE_FIXTURE.bands, 100000, "cost"));
});

/* -----------------------------------------------------------------------
   D17 to D23 — PHASE 132, 14 September 2026. A DECLARED INDEX BASE PER PRICE
   SOURCE. "Still blocked here, and untouched: WHAT the factor is indexed to"
   (7 September). The factor was raw / mean; it is now
   factors[location_key] / factors[rates_priced_at_key], both from one table
   whose base is declared and checked. The Outer-London table below is
   INVENTED - its base row is 1.00 because that is what an Outer-London base
   means, and every other number in it is made up.
   ----------------------------------------------------------------------- */

const E4_ON = { leg_e4_location_and_contract_size: true };
const OUTER_LONDON_BASE = { basis: "outer_london", base_key: "outer_london", base_value: 1.00 };
const outerLondonTable = priceSource => ({
  table_id: "CB_LOCATION_FACTORS", source: "INVENTED OUTER-LONDON-BASED FIXTURE - not Spon's",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-09-14",
  price_source: priceSource, index_base: OUTER_LONDON_BASE,
  factors: { outer_london: 1.00, inner_london: 1.07, north_west: 0.93, wales: 0.91 }
});
const withSources = sources => Object.assign({}, PRICE_SOURCES_FIXTURE,
  { sources: Object.assign({}, PRICE_SOURCES_FIXTURE.sources, sources) });
const tablesWith = extra => Object.assign({}, ALL_FIXTURES, extra);
const LOC = extra => Object.assign({ location_key: "cardiff", price_source: PS, contract_value: 3000000 }, extra);
const locFactor = (input, tables, gates) => M.locationAndContractSizeFactor(input,
  { gates: gates || E4_ON, tables: tables || ALL_FIXTURES });

test("D17 an Outer-London base: rates priced at the base give the table's own factor, not factor / 100", () => {
  const tables = tablesWith({
    CB_LOCATION_FACTORS: outerLondonTable("invented_outer_book"),
    CB_PRICE_SOURCES: withSources({ invented_outer_book: {
      label: "INVENTED OUTER-LONDON BOOK", rates_include_oncosts: null,
      index_base: OUTER_LONDON_BASE, rates_priced_at_key: "outer_london" } })
  });
  const wales = locFactor(LOC({ location_key: "wales", price_source: "invented_outer_book" }), tables);
  assert.equal(near(wales.location_factor, 0.91), true);
  assert.equal(near(wales.factor, 0.91), true);
  /* the defect this replaced would have read 0.91 / 100 = 0.0091 */
  assert.ok(wales.location_factor > 0.5);
  assert.deepEqual(wales.index_base, OUTER_LONDON_BASE);
  assert.equal(near(locFactor(LOC({ location_key: "inner_london", price_source: "invented_outer_book" }),
    tables).location_factor, 1.07), true);
});

test("D18 rates priced AWAY from the base are moved to the property's location, not divided by the base", () => {
  const tables = tablesWith({
    CB_LOCATION_FACTORS: outerLondonTable("invented_regional_book"),
    CB_PRICE_SOURCES: withSources({ invented_regional_book: {
      label: "INVENTED REGIONAL BOOK", rates_include_oncosts: false,
      index_base: OUTER_LONDON_BASE, rates_priced_at_key: "north_west" } })
  });
  const at = key => locFactor(LOC({ location_key: key, price_source: "invented_regional_book" }), tables);
  assert.equal(near(at("wales").location_factor, 0.91 / 0.93), true);
  assert.notEqual(near(at("wales").location_factor, 0.91), true);
  assert.equal(at("north_west").location_factor, 1);   /* a property where the rates were priced */
  assert.equal(near(at("inner_london").location_factor, 1.07 / 0.93), true);
  assert.equal(at("wales").rates_priced_at_key, "north_west");

  /* and on a national-mean table, a book priced at a dearer region */
  const nm = tablesWith({ CB_PRICE_SOURCES: withSources({
    [PS]: Object.assign({}, PRICE_SOURCES_FIXTURE.sources[PS], { rates_priced_at_key: "london_inner" }) }) });
  assert.equal(near(locFactor(LOC(), nm).location_factor, 94 / 120), true);
});

test("D19 a missing or malformed index base refuses, and a declared base the table does not hold refuses", () => {
  const run = (locPatch, srcPatch) => errWhole(() => locFactor(LOC(), tablesWith({
    CB_LOCATION_FACTORS: Object.assign({}, LOCATION_FIXTURE, locPatch),
    CB_PRICE_SOURCES: withSources({ [PS]: Object.assign({}, PRICE_SOURCES_FIXTURE.sources[PS], srcPatch) })
  })));
  for (const bad of [null, undefined, {},
                     { basis: "outer_londn", base_key: "national_mean", base_value: 100 },
                     { basis: "national_mean", base_key: "", base_value: 100 },
                     { basis: "national_mean", base_key: "unsure", base_value: 100 },
                     { basis: "national_mean", base_key: "national_mean", base_value: 0 },
                     { basis: "national_mean", base_key: "national_mean", base_value: "100" }]) {
    const e = run({ index_base: bad }, {});
    assert.equal(e.code, "E_LOCATION_INDEX_BASE_MISSING", JSON.stringify(bad));
    assert.equal(e.detail.declared_by, "location_table");
  }
  /* the book must declare the base too */
  const fromBook = run({}, { index_base: null });
  assert.equal(fromBook.code, "E_LOCATION_INDEX_BASE_MISSING");
  assert.equal(fromBook.detail.declared_by, "price_source");

  /* a base whose value the table contradicts, or whose row is not there */
  assert.equal(run({ index_base: { basis: "national_mean", base_key: "national_mean", base_value: 1.00 } }, {}).code,
    "E_LOCATION_BASE_NOT_IN_TABLE");
  assert.equal(run({ index_base: { basis: "outer_london", base_key: "outer_london", base_value: 1.00 } }, {}).code,
    "E_LOCATION_BASE_NOT_IN_TABLE");
});

test("D20 a location table and rates from DIFFERENT books, or on different bases, refuse with E_LOCATION_INDEX_BASE_MISMATCH", () => {
  /* book B is listed and on the same national-mean base - but the table is book A's */
  const other = errWhole(() => locFactor(LOC({ price_source: "invented_book_b" })));
  assert.equal(other.code, "E_LOCATION_INDEX_BASE_MISMATCH");
  assert.equal(other.detail.reason, "different_source");
  /* a table that does not say which book it came from cannot be shown to match */
  const unnamed = errWhole(() => locFactor(LOC(), tablesWith({
    CB_LOCATION_FACTORS: Object.assign({}, LOCATION_FIXTURE, { price_source: null }) })));
  assert.equal(unnamed.code, "E_LOCATION_INDEX_BASE_MISMATCH");
  /* same book id, but the book declares a different base from the table */
  for (const base of [OUTER_LONDON_BASE,
                      { basis: "publisher_other", base_key: "national_mean", base_value: 100 },
                      { basis: "national_mean", base_key: "national_mean", base_value: 94 }]) {
    const e = errWhole(() => locFactor(LOC(), tablesWith({ CB_PRICE_SOURCES: withSources({
      [PS]: Object.assign({}, PRICE_SOURCES_FIXTURE.sources[PS], { index_base: base }) }) })));
    assert.equal(e.code, "E_LOCATION_INDEX_BASE_MISMATCH", JSON.stringify(base));
    assert.equal(e.detail.reason, "different_base");
  }
});

test("D21 a loaded table still carrying a bare mean refuses rather than being divided by it", () => {
  /* the exact pre-Phase-132 shape: mean, factors, nothing declared */
  const oldShape = {
    table_id: "CB_LOCATION_FACTORS", source: "INVENTED TEST FIXTURE", licence: "n/a - fixture",
    loaded: true, verified_at: "2026-08-27", mean: 100,
    factors: { cardiff: 94, national_mean: 100 }
  };
  const e = errWhole(() => locFactor(LOC(), tablesWith({ CB_LOCATION_FACTORS: oldShape })));
  assert.equal(e.code, "E_LOCATION_MEAN_DEPRECATED");
  assert.equal(e.detail.mean, 100);
  /* and a mean left beside a declared base refuses too - two bases is not one */
  assert.equal(codeOf(() => locFactor(LOC(), tablesWith({
    CB_LOCATION_FACTORS: Object.assign({}, LOCATION_FIXTURE, { mean: 100 }) }))), "E_LOCATION_MEAN_DEPRECATED");
  /* the shipped stub no longer carries one to copy */
  assert.equal("mean" in M.CB_LOCATION_FACTORS, false);
});

test("D22 the price book must be named, listed, and say where its rates are priced — absent and \"unsure\" refuse identically (N4)", () => {
  const noSource = errWhole(() => locFactor({ location_key: "cardiff", contract_value: 3000000 }));
  assert.equal(noSource.code, "E_PRICE_SOURCE_REQUIRED");
  for (const notKnown of [null, "", "unsure", "not sure"]) {
    assert.deepEqual(errWhole(() => locFactor(LOC({ price_source: notKnown }))), noSource,
      "price_source " + JSON.stringify(notKnown));
  }
  assert.equal(errWhole(() => locFactor(LOC({ price_source: "invented_book_z" }))).detail.reason, "not_listed");
  /* over the shipped empty register */
  const stubTables = Object.assign({}, ALL_FIXTURES);
  delete stubTables.CB_PRICE_SOURCES;
  const stub = errWhole(() => locFactor(LOC(), stubTables));
  assert.equal(stub.code, "E_TABLE_NOT_LOADED");
  assert.equal(stub.detail.table, "CB_PRICE_SOURCES");

  /* where the rates are priced: absent, null, "" and "unsure" are one fact */
  const { rates_priced_at_key: _dropped, ...entryNoKey } = PRICE_SOURCES_FIXTURE.sources[PS];
  const withEntry = entry => tablesWith({ CB_PRICE_SOURCES: withSources({ [PS]: entry }) });
  const absentKey = errWhole(() => locFactor(LOC(), withEntry(entryNoKey)));
  assert.equal(absentKey.code, "E_RATES_PRICING_LOCATION_MISSING");
  for (const notKnown of [null, undefined, "", "unsure", "Not sure"]) {
    assert.deepEqual(errWhole(() => locFactor(LOC(),
      withEntry(Object.assign({}, entryNoKey, { rates_priced_at_key: notKnown })))), absentKey,
      "rates_priced_at_key " + JSON.stringify(notKnown));
  }
  const offTable = errWhole(() => locFactor(LOC(),
    withEntry(Object.assign({}, entryNoKey, { rates_priced_at_key: "atlantis" }))));
  assert.equal(offTable.code, "E_LOCATION_NOT_IN_TABLE");
  assert.equal(offTable.detail.rates_priced_at_key, "atlantis");
});

test("D23 N4 an ABSENT location_key and one recorded as \"unsure\" refuse identically — neither is a factor of 1", () => {
  const absent = errWhole(() => locFactor({ price_source: PS, contract_value: 3000000 }));
  assert.equal(absent.code, "E_LOCATION_KEY_REQUIRED");
  const job = key => Object.assign({
    purchase_consideration: 2000000, land_value_estimate: 600000, price_source: PS, contract_value: 3000000,
    elements: [{ element_ref: "plant", pool: "main", qty: 1, rate: 1000000 }]
  }, key === "ABSENT" ? {} : { location_key: key });
  const absentViaModel = errWhole(() => M.residualApportionment(job("ABSENT"), ON(E4_ON)));
  assert.equal(absentViaModel.code, "E_LOCATION_KEY_REQUIRED");
  /* before Phase 132 "unsure" was looked up as a region and failed E_LOCATION_NOT_IN_TABLE */
  for (const notKnown of [undefined, null, "", "unsure", "not sure", " Unsure "]) {
    const e = errWhole(() => locFactor(LOC({ location_key: notKnown })));
    assert.notEqual(e, null, JSON.stringify(notKnown) + " must refuse, not return a factor");
    assert.deepEqual(e, absent, "location_key " + JSON.stringify(notKnown));
    assert.deepEqual(errWhole(() => M.residualApportionment(job(notKnown), ON(E4_ON))), absentViaModel);
  }
});

/* -----------------------------------------------------------------------
   D24 to D29 — PHASE 132. A CONTRACT OUTSIDE THE BOOK'S £2m-£5m WINDOW.
   leg_e4_contract_size_outside_window ships false and waits on the surveyor.
   Off, both ends refuse as since Phase 97. On, the adjustment is held at the
   nearer limit and flagged with the direction it errs. And with LEG-E4 on, an
   absent contract value is no longer a factor of 1.
   ----------------------------------------------------------------------- */

const OUTSIDE_ON = { leg_e4_location_and_contract_size: true, leg_e4_contract_size_outside_window: true };

test("D24 the outside-window gate ships false; off, a contract above and below the window both still refuse", () => {
  assert.equal(M.CB_P9_GATES.leg_e4_contract_size_outside_window, false);
  for (const gates of [E4_ON, { leg_e4_location_and_contract_size: true, leg_e4_contract_size_outside_window: false }]) {
    for (const v of [6000000, 1000000]) {
      assert.equal(codeOf(() => locFactor(LOC({ contract_value: v }), ALL_FIXTURES, gates)),
        "E_SCALE_VALUE_OUT_OF_RANGE", JSON.stringify(gates) + " at " + v);
    }
  }
  /* on its own, with LEG-E4 off, the new gate changes nothing at all */
  assert.deepEqual(
    M.locationAndContractSizeFactor(LOC({ contract_value: 6000000 }),
      { gates: { leg_e4_contract_size_outside_window: true }, tables: ALL_FIXTURES }),
    M.locationAndContractSizeFactor(LOC({ contract_value: 6000000 })));
});

test("D25 gate on, a GBP 6m contract takes the GBP 5m value, flagged, and the result says it OVERSTATES cost", () => {
  const r = locFactor(LOC({ contract_value: 6000000 }), ALL_FIXTURES, OUTSIDE_ON);
  const atLimit = locFactor(LOC({ contract_value: 5000000 }), ALL_FIXTURES, OUTSIDE_ON);
  assert.equal(near(r.contract_size_factor, 0.95), true);
  assert.equal(r.contract_size_factor, atLimit.contract_size_factor);
  assert.equal(near(r.factor, 0.94 * 0.95), true);
  assert.equal(r.contract_size_held_at_limit, "upper");
  assert.equal(r.contract_size_value_used, 5000000);
  assert.equal(r.contract_size_published, -5);
  assert.ok(r.flags.includes("LEG_E4_CONTRACT_SIZE_HELD_AT_UPPER_LIMIT"));
  assert.ok(!r.flags.includes("LEG_E4_CONTRACT_SIZE_HELD_AT_LOWER_LIMIT"));
  assert.match(r.contract_size_limit_message, /OVERSTATES/);
  /* the boundary itself is inside the window, so it is not held */
  assert.equal(atLimit.contract_size_held_at_limit, null);
  assert.ok(!atLimit.flags.some(f => /HELD_AT/.test(f)));
});

test("D26 gate on, a GBP 1m contract takes the GBP 2m value, flagged, and the result says it UNDERSTATES cost", () => {
  const r = locFactor(LOC({ contract_value: 1000000 }), ALL_FIXTURES, OUTSIDE_ON);
  assert.equal(near(r.contract_size_factor, 1.10), true);
  assert.equal(r.contract_size_held_at_limit, "lower");
  assert.equal(r.contract_size_value_used, 2000000);
  assert.ok(r.flags.includes("LEG_E4_CONTRACT_SIZE_HELD_AT_LOWER_LIMIT"));
  assert.ok(!r.flags.includes("LEG_E4_CONTRACT_SIZE_HELD_AT_UPPER_LIMIT"));
  assert.match(r.contract_size_limit_message, /UNDERSTATES/);
});

test("D27 inside the window the outside-window gate changes nothing — on and off are identical", () => {
  const factorScale = tablesWith({ CB_CONTRACT_SIZE_ADJUSTMENT: CONTRACT_SIZE_AS_FACTORS_FIXTURE });
  for (const tables of [ALL_FIXTURES, factorScale]) {
    for (const v of [2000000, 2500000, 3000000, 3500000, 4250000, 5000000]) {
      assert.deepEqual(locFactor(LOC({ contract_value: v }), tables, OUTSIDE_ON),
                       locFactor(LOC({ contract_value: v }), tables, E4_ON), "at " + v);
    }
  }
  const job = {
    purchase_consideration: 4000000, location_key: "cardiff", price_source: PS,
    contract_value: 3500000, land_value_estimate: 600000,
    elements: [
      { element_ref: "mechanical", pool: "main",    qty: 1788, rate: 230 },
      { element_ref: "frame",      pool: "nonqual", qty: 1788, rate: 272 }
    ]
  };
  assert.deepEqual(M.residualApportionment(job, ON(OUTSIDE_ON)), M.residualApportionment(job, ON(E4_ON)));
});

test("D28 N4 with LEG-E4 on, an ABSENT contract value and one recorded as \"unsure\" refuse identically — never a factor of 1", () => {
  const job = cv => Object.assign({
    purchase_consideration: 2000000, land_value_estimate: 600000, location_key: "cardiff", price_source: PS,
    elements: [{ element_ref: "plant", pool: "main", qty: 1, rate: 1000000 }]
  }, cv === "ABSENT" ? {} : { contract_value: cv });
  for (const gates of [E4_ON, OUTSIDE_ON]) {
    const absent = errWhole(() => locFactor({ location_key: "cardiff", price_source: PS }, ALL_FIXTURES, gates));
    assert.equal(absent.code, "E_CONTRACT_VALUE_REQUIRED");
    const absentViaModel = errWhole(() => M.residualApportionment(job("ABSENT"), { gates, tables: ALL_FIXTURES }));
    assert.equal(absentViaModel.code, "E_CONTRACT_VALUE_REQUIRED");
    for (const notKnown of [undefined, null, "", "unsure", "not sure", " UNSURE"]) {
      const e = errWhole(() => locFactor(LOC({ contract_value: notKnown }), ALL_FIXTURES, gates));
      assert.notEqual(e, null, JSON.stringify(notKnown) + " must refuse, not return a factor of 1");
      assert.deepEqual(e, absent, "contract_value " + JSON.stringify(notKnown));
      assert.deepEqual(errWhole(() => M.residualApportionment(job(notKnown), { gates, tables: ALL_FIXTURES })),
        absentViaModel);
    }
  }
  /* a stated value that is not a number is still invalid, not unknown */
  assert.equal(codeOf(() => locFactor(LOC({ contract_value: "three million" }))), "E_CONTRACT_VALUE_INVALID");
  assert.equal(codeOf(() => locFactor(LOC({ contract_value: -1 }))), "E_CONTRACT_VALUE_INVALID");
  /* and the old pass-with-a-flag is gone from every result */
  assert.ok(!locFactor(LOC()).flags.includes("LEG_E4_NO_CONTRACT_SIZE"));
});

test("D29 interpolateScale's outside option defaults to refuse, rejects an unknown option, and leaves the fee bands alone", () => {
  const s = CONTRACT_SIZE_FIXTURE;
  for (const options of [undefined, {}, { outside: "refuse" }]) {
    assert.equal(codeOf(() => M.interpolateScale(s, 6000000, "contract_value", options)),
      "E_SCALE_VALUE_OUT_OF_RANGE", JSON.stringify(options));
    assert.equal(codeOf(() => M.interpolateScale(s, 1000000, "contract_value", options)),
      "E_SCALE_VALUE_OUT_OF_RANGE", JSON.stringify(options));
  }
  const up = M.interpolateScale(s, 6000000, "contract_value", { outside: "hold_at_limit" });
  assert.equal(up.held_at_limit, "upper");
  assert.equal(up.value_used, 5000000);
  const down = M.interpolateScale(s, 1000000, "contract_value", { outside: "hold_at_limit" });
  assert.equal(down.held_at_limit, "lower");
  assert.equal(down.value_used, 2000000);
  const inside = M.interpolateScale(s, 3500000, "contract_value", { outside: "hold_at_limit" });
  assert.equal(inside.held_at_limit, null);
  assert.equal(inside.value_used, 3500000);
  assert.deepEqual(inside, M.interpolateScale(s, 3500000, "contract_value"));
  for (const bad of ["clamp", "extrapolate", null, true]) {
    assert.equal(codeOf(() => M.interpolateScale(s, 3500000, "contract_value", { outside: bad })),
      "E_SCALE_OUTSIDE_OPTION_INVALID", JSON.stringify(bad));
  }
  /* the fee scale is banded and never reads the new gate */
  for (const cost of [50000, 500000, 5000000, 60000000]) {
    const job = { cost_basis: M.COST_BASIS.RESIDUAL, building_type: "standard", construction_cost: cost };
    assert.deepEqual(
      M.feesFactor(job, ON(Object.assign({ leg_e4_contract_size_outside_window: true }, E3_BOTH))),
      M.feesFactor(job, ON(E3_BOTH)));
  }
});

/* -----------------------------------------------------------------------
   D30 to D34 — PHASE 153 (28 September 2026). DOES THE DECLARED BASE TAKE A
   BCIS TABLE? Phase 132 built the declared base against Spon's (Outer London
   = 1.00). BCIS, not Spon's, is being bought (Word question 218, "Which BCIS
   product did you agree to, and does its licence let our software use its
   rates?", open). BCIS's own page says "All of our location factors are set
   in relation to a UK mean factor of 100", for regions, counties or districts
   (https://www.bcis.co.uk/insight/bcis-basics-using-location-factors-in-construction/).

   THE TABLE BELOW IS INVENTED. It is shaped like BCIS's (a UK mean row at 100,
   district-level keys, rates at the UK mean) and it holds NO BCIS figure: the
   keys name no real place and every number is made up. The contract-size
   half still uses the invented CONTRACT_SIZE_FIXTURE at its 0% point, because
   the shape of BCIS's contract-size data is not public.
   ----------------------------------------------------------------------- */

const BCIS_SHAPED_ID = "invented_bcis_shaped_book";
const UK_MEAN_BASE = { basis: "national_mean", base_key: "uk_mean", base_value: 100 };
const bcisShapedTable = () => ({
  table_id: "CB_LOCATION_FACTORS",
  source: "INVENTED BCIS-SHAPED FIXTURE - not BCIS data; every key and number is made up",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-09-28",
  price_source: BCIS_SHAPED_ID, index_base: UK_MEAN_BASE,
  factors: { uk_mean: 100, invented_district_dear: 108, invented_district_cheap: 92,
             invented_district_at_mean: 100 }
});
const BCIS_SHAPED_ENTRY = {
  label: "INVENTED BCIS-SHAPED BOOK - describes no real product", rates_include_oncosts: null,
  index_base: UK_MEAN_BASE, rates_priced_at_key: "uk_mean"
};
const SPONS_SHAPED_ID = "invented_spons_shaped_book";
const SPONS_SHAPED_ENTRY = {
  label: "INVENTED OUTER-LONDON-BASED BOOK - not Spon's", rates_include_oncosts: null,
  index_base: OUTER_LONDON_BASE, rates_priced_at_key: "outer_london"
};
const bcisTables = locTable => tablesWith({
  CB_LOCATION_FACTORS: locTable || bcisShapedTable(),
  CB_PRICE_SOURCES: withSources({ [BCIS_SHAPED_ID]: BCIS_SHAPED_ENTRY, [SPONS_SHAPED_ID]: SPONS_SHAPED_ENTRY })
});
const BCIS_LOC = extra => Object.assign({ location_key: "invented_district_cheap",
  price_source: BCIS_SHAPED_ID, contract_value: 3000000 }, extra);

test("D30 a table declared on BCIS's base (UK mean = 100) is ACCEPTED, and moves rates priced at the UK mean", () => {
  const at = key => locFactor(BCIS_LOC({ location_key: key }), bcisTables());
  const cheap = at("invented_district_cheap");
  assert.equal(cheap.applied, true);
  assert.equal(near(cheap.location_factor, 0.92), true);
  assert.equal(near(cheap.factor, 0.92), true);           /* contract size neutral at 3,000,000 */
  assert.deepEqual(cheap.index_base, UK_MEAN_BASE);
  assert.equal(cheap.price_source, BCIS_SHAPED_ID);
  assert.equal(cheap.rates_priced_at_key, "uk_mean");
  assert.equal(cheap.rates_priced_at_index, 100);
  assert.equal(near(at("invented_district_dear").location_factor, 1.08), true);
  assert.equal(at("invented_district_at_mean").location_factor, 1);
  assert.equal(at("uk_mean").location_factor, 1);
  /* not read on the wrong scale: a factor near 1, not near 0.0092 or 92 */
  assert.ok(cheap.location_factor > 0.5 && cheap.location_factor < 2);

  /* and through the residual model: applied once, to the total */
  const job = { purchase_consideration: 2000000, land_value_estimate: 600000,
    location_key: "invented_district_dear", price_source: BCIS_SHAPED_ID, contract_value: 3000000,
    elements: [{ element_ref: "plant", pool: "main", qty: 1, rate: 1000000 }] };
  const r = M.residualApportionment(job, { gates: E4_ON, tables: bcisTables() });
  assert.equal(near(r.cost_plan.location_factor_applied_once, 1.08), true);
  assert.equal(near(r.components.A, 1000000 * 1.08 * 1.18 * 1.15, 1e-6), true);
  for (const l of r.lines) assert.equal("location_factor" in l, false);
});

test("D31 a table from a DIFFERENT book is refused where BCIS is expected, and a BCIS table under another book's rates is refused", () => {
  /* an Outer-London-based (Spon's-shaped) table fed to a job priced from the BCIS-shaped book */
  const spTable = outerLondonTable(SPONS_SHAPED_ID);
  const fed = errWhole(() => locFactor(BCIS_LOC({ location_key: "wales" }), bcisTables(spTable)));
  assert.equal(fed.code, "E_LOCATION_INDEX_BASE_MISMATCH");
  assert.equal(fed.detail.reason, "different_source");
  assert.equal(fed.detail.table_price_source, SPONS_SHAPED_ID);
  assert.equal(fed.detail.rates_price_source, BCIS_SHAPED_ID);

  /* the same Outer-London table relabelled as the BCIS-shaped book's: the book's base disagrees */
  const relabelled = errWhole(() => locFactor(BCIS_LOC({ location_key: "wales" }),
    bcisTables(outerLondonTable(BCIS_SHAPED_ID))));
  assert.equal(relabelled.code, "E_LOCATION_INDEX_BASE_MISMATCH");
  assert.equal(relabelled.detail.reason, "different_base");
  assert.deepEqual(relabelled.detail.rates_index_base, UK_MEAN_BASE);
  assert.deepEqual(relabelled.detail.table_index_base, OUTER_LONDON_BASE);

  /* the other way round: the BCIS-shaped table under a job priced from the Outer-London book */
  const reverse = errWhole(() => locFactor(BCIS_LOC({ price_source: SPONS_SHAPED_ID }), bcisTables()));
  assert.equal(reverse.code, "E_LOCATION_INDEX_BASE_MISMATCH");
  assert.equal(reverse.detail.reason, "different_source");

  /* a BCIS-shaped table that claims an Outer-London base it does not hold */
  const claimsOL = Object.assign(bcisShapedTable(), { index_base: OUTER_LONDON_BASE });
  assert.equal(codeOf(() => locFactor(BCIS_LOC(), bcisTables(claimsOL))), "E_LOCATION_BASE_NOT_IN_TABLE");
});

test("D32 a BCIS-shaped table with a MISSING base is refused, whichever side fails to declare it", () => {
  for (const bad of [null, undefined, {}, { basis: "uk_mean", base_key: "uk_mean", base_value: 100 },
                     { basis: "national_mean", base_key: "unsure", base_value: 100 },
                     { basis: "national_mean", base_key: "uk_mean" }]) {
    const t = Object.assign(bcisShapedTable(), { index_base: bad });
    const e = errWhole(() => locFactor(BCIS_LOC(), bcisTables(t)));
    assert.equal(e.code, "E_LOCATION_INDEX_BASE_MISSING", JSON.stringify(bad));
    assert.equal(e.detail.declared_by, "location_table");
  }
  const { index_base: _gone, ...tableNoBase } = bcisShapedTable();
  assert.equal(codeOf(() => locFactor(BCIS_LOC(), bcisTables(tableNoBase))), "E_LOCATION_INDEX_BASE_MISSING");

  /* the book entry must declare it too */
  const noBookBase = tablesWith({ CB_LOCATION_FACTORS: bcisShapedTable(),
    CB_PRICE_SOURCES: withSources({ [BCIS_SHAPED_ID]: Object.assign({}, BCIS_SHAPED_ENTRY, { index_base: null }) }) });
  const fromBook = errWhole(() => locFactor(BCIS_LOC(), noBookBase));
  assert.equal(fromBook.code, "E_LOCATION_INDEX_BASE_MISSING");
  assert.equal(fromBook.detail.declared_by, "price_source");

  /* a units slip: BCIS's base written as 1.00 when the table holds 100 */
  const slip = Object.assign(bcisShapedTable(),
    { index_base: { basis: "national_mean", base_key: "uk_mean", base_value: 1.00 } });
  assert.equal(codeOf(() => locFactor(BCIS_LOC(), bcisTables(slip))), "E_LOCATION_BASE_NOT_IN_TABLE");
});

test("D33 a BCIS-shaped table carrying a BARE MEAN (undeclared) is refused, not divided by it", () => {
  const bare = { table_id: "CB_LOCATION_FACTORS", source: "INVENTED BCIS-SHAPED FIXTURE - not BCIS data",
    licence: "n/a - fixture", loaded: true, verified_at: "2026-09-28", mean: 100,
    factors: { invented_district_cheap: 92, invented_district_dear: 108 } };
  const e = errWhole(() => locFactor(BCIS_LOC(), bcisTables(bare)));
  assert.equal(e.code, "E_LOCATION_MEAN_DEPRECATED");
  assert.equal(e.detail.mean, 100);
  /* a mean left beside a declared BCIS base refuses too */
  assert.equal(codeOf(() => locFactor(BCIS_LOC(), bcisTables(Object.assign(bcisShapedTable(), { mean: 100 })))),
    "E_LOCATION_MEAN_DEPRECATED");
});

test("D34 with a BCIS-shaped table loaded, the shipped gate is still OFF and nothing moves; the shipped stub is empty and names BCIS and Word question 218", () => {
  assert.equal(M.CB_P9_GATES.leg_e4_location_and_contract_size, false);
  const off = M.locationAndContractSizeFactor(BCIS_LOC(), { tables: bcisTables() });
  assert.equal(off.applied, false);
  assert.equal(off.factor, 1);
  assert.ok(off.flags.includes("LEG_E4_NO_REGIONAL_ADJUSTMENT"));
  assert.deepEqual(M.CB_LOCATION_FACTORS.factors, {});
  assert.equal(M.CB_LOCATION_FACTORS.loaded, false);
  assert.match(M.CB_LOCATION_FACTORS.source, /BCIS/);
  assert.match(M.CB_LOCATION_FACTORS.licence, /218/);
  /* the refusal for a missing base names BCIS's published base */
  const t = Object.assign(bcisShapedTable(), { index_base: null });
  assert.match(errWhole(() => locFactor(BCIS_LOC(), bcisTables(t))).message, /BCIS.*UK mean of 100/);
});

/* =============================================================================
   E. LEG-E5 — per-element depreciation (12804317685)
   ============================================================================= */

test("E1 gate off — no depreciation, and flagged", () => {
  const r = M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 15 });
  assert.equal(r.factor, 1);
  assert.equal(r.applied, false);
  assert.ok(r.flags.includes("LEG_E5_NO_DEPRECIATION"));
});

test("E2 gate on with injected scales — the chain age -> life -> ratio -> scale works", () => {
  const opts = ON({ leg_e5_per_element_depreciation: true });
  /* lift, 20y life, 5y old -> ratio 0.25 -> band [0.25,0.50) -> 0.80 */
  const r = M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 }, opts);
  assert.equal(r.expected_life_years, 20);
  assert.equal(near(r.age_ratio, 0.25), true);
  assert.equal(r.factor, 0.80);
});

test("E3 elements of different lives depreciate differently at the SAME age", () => {
  const opts = ON({ leg_e5_per_element_depreciation: true });
  const lift = M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 10 }, opts);
  const call = M.elementDepreciationFactor({ element_ref: "nurse_call", age_years: 10 }, opts);
  const drain = M.elementDepreciationFactor({ element_ref: "drainage", age_years: 10 }, opts);
  assert.equal(near(lift.age_ratio, 0.50), true);
  assert.equal(near(call.age_ratio, 1.00), true);
  assert.equal(near(drain.age_ratio, 0.20), true);
  assert.ok(drain.factor > lift.factor && lift.factor > call.factor,
    "this spread is the entire argument for per-element rather than per-building");
});

test("E4 past its expected life an element does NOT depreciate to zero", () => {
  const opts = ON({ leg_e5_per_element_depreciation: true });
  const r = M.elementDepreciationFactor({ element_ref: "nurse_call", age_years: 40 }, opts);
  assert.ok(r.factor > 0, "a working asset must not be stripped out of the claim");
  assert.equal(r.age_ratio, 1, "the ratio is clamped, not extrapolated");
  assert.equal(r.age_ratio_raw, 4);
  assert.ok(r.flags.includes("ELEMENT_BEYOND_EXPECTED_LIFE"));
});

test("E5 the residual floor bites when the scale would go below it", () => {
  const opts = ON({ leg_e5_per_element_depreciation: true });
  const r = M.elementDepreciationFactor(
    { element_ref: "nurse_call", age_years: 40, obsolescence_scale: "steep" }, opts);
  assert.equal(r.factor, 0.30, "the scale said 0.05; the floor is 0.30");
  assert.ok(r.flags.includes("RESIDUAL_FLOOR_APPLIED"));
});

test("E6 an element with no CIBSE life refuses — it will not assume one", () => {
  assert.equal(
    codeOf(() => M.elementDepreciationFactor({ element_ref: "mystery_widget", age_years: 5 },
      ON({ leg_e5_per_element_depreciation: true }))),
    "E_PLANT_LIFE_NOT_IN_TABLE");
});

test("E7 an element with no age refuses — age is the whole input", () => {
  assert.equal(
    codeOf(() => M.elementDepreciationFactor({ element_ref: "passenger_lift" },
      ON({ leg_e5_per_element_depreciation: true }))),
    "E_ELEMENT_AGE_REQUIRED");
});

test("E8 E5 needs BOTH sources — the VOA licence alone does not unblock it", () => {
  /* CIBSE loaded, VOA obsolescence still an empty stub */
  const halfCleared = {
    gates: { leg_e5_per_element_depreciation: true },
    tables: { CB_CIBSE_PLANT_LIVES: PLANT_LIVES_FIXTURE }
  };
  assert.equal(
    codeOf(() => M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 }, halfCleared)),
    "E_TABLE_NOT_LOADED");
});

/* =============================================================================
   F. THE VALUATION BASIS SWITCH — 12804374838 (the one item that is DONE)
   ============================================================================= */

test("F1 the default basis is the conservative one", () => {
  assert.equal(M.VALUATION_BASIS_DEFAULT, M.VALUATION_BASIS.DRC);
  assert.equal(M.resolveValuationBasis({}).basis, "drc");
  assert.equal(M.resolveValuationBasis({}).basis_source, "default");
});

test("F2 both branches exist and are selectable", () => {
  assert.equal(M.resolveValuationBasis({ valuation_basis: "replacement_new" }).basis, "replacement_new");
  assert.equal(M.resolveValuationBasis({ valuation_basis: "drc" }).basis, "drc");
  assert.equal(codeOf(() => M.resolveValuationBasis({ valuation_basis: "vibes" })),
    "E_UNKNOWN_VALUATION_BASIS");
});

test("F3 the conservative default changes NO number today, because E5 is gated off", () => {
  const job = {
    purchase_consideration: 2000000,
    land_fraction_low: 0.25, land_fraction_high: 0.35,
    elements: [
      { element_ref: "passenger_lift", pool: "main", qty: 1, rate: 400000, age_years: 12 },
      { element_ref: "shell", pool: "nonqual", qty: 1, rate: 800000, age_years: 12 }
    ]
  };
  const drc = M.residualApportionment(Object.assign({ valuation_basis: "drc" }, job));
  const rn = M.residualApportionment(Object.assign({ valuation_basis: "replacement_new" }, job));
  assert.equal(near(drc.qualifying_pm.high, rn.qualifying_pm.high, 1e-6), true,
    "with no obsolescence scales the two bases are arithmetically identical");
});

test("F4 but it SAYS so, rather than labelling undepreciated arithmetic as DRC", () => {
  const r = M.resolveValuationBasis({ valuation_basis: "drc" });
  assert.ok(r.flags.includes("DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE"));
  assert.equal(r.depreciation_effective, false);
});

test("F5 once E5's tables land, the switch actually bites — and DRC is the lower figure", () => {
  const job = {
    purchase_consideration: 2000000, land_value_estimate: 600000,
    elements: [
      { element_ref: "passenger_lift", pool: "main", qty: 1, rate: 400000, age_years: 12 },
      { element_ref: "shell", pool: "nonqual", qty: 1, rate: 800000, age_years: 12,
        obsolescence_scale: "default" }
    ]
  };
  const opts = ON({ leg_e5_per_element_depreciation: true });
  /* 'shell' has no CIBSE life in the fixture, so give it one for this test */
  const lives = Object.assign({}, PLANT_LIVES_FIXTURE, {
    lives_years: Object.assign({}, PLANT_LIVES_FIXTURE.lives_years, { shell: 60 })
  });
  const o = { gates: opts.gates, tables: Object.assign({}, ALL_FIXTURES, { CB_CIBSE_PLANT_LIVES: lives }) };

  const drc = M.residualApportionment(Object.assign({ valuation_basis: "drc" }, job), o);
  const rn = M.residualApportionment(Object.assign({ valuation_basis: "replacement_new" }, job), o);

  assert.equal(drc.valuation_basis.depreciation_effective, true);
  assert.ok(drc.components.A < rn.components.A, "DRC depreciates the plant");
  assert.ok(drc.qualifying_pm.high < rn.qualifying_pm.high,
    "DRC is the lower, more defensible figure — which is why it is the default");
});

test("F6 replacement_new skips depreciation entirely even with the tables loaded", () => {
  const r = M.residualApportionment({
    purchase_consideration: 1000000, land_value_estimate: 300000,
    valuation_basis: "replacement_new",
    elements: [{ element_ref: "passenger_lift", pool: "main", qty: 1, rate: 100000, age_years: 18 }]
  }, ON({ leg_e5_per_element_depreciation: true }));
  assert.equal(r.lines[0].depreciation_factor, 1);
  assert.ok(r.flags.includes("REPLACEMENT_NEW_NO_DEPRECIATION"));
});

test("F7 whose judgement the basis rests on is recorded", () => {
  const unset = M.resolveValuationBasis({ valuation_basis: "replacement_new" });
  assert.equal(unset.basis_source, "config");
  assert.ok(unset.flags.includes("VALUATION_BASIS_NOT_SET_BY_SURVEYOR"));

  const set = M.resolveValuationBasis({ valuation_basis: "replacement_new", basis_set_by: "A. Surveyor MRICS" });
  assert.equal(set.basis_source, "surveyor");
  assert.equal(set.basis_set_by, "A. Surveyor MRICS");
  assert.ok(!set.flags.includes("VALUATION_BASIS_NOT_SET_BY_SURVEYOR"));
});

test("F8 the basis is graded D — surveyor judgement, and a D blocks sign-off", () => {
  assert.equal(M.resolveValuationBasis({}).confidence_grade, "D");
});

/* =============================================================================
   G. THE RESIDUAL MODEL ITSELF
   ============================================================================= */

const JOB = {
  purchase_consideration: 2000000,
  land_fraction_low: 0.25, land_fraction_high: 0.35,
  elements: [
    { element_ref: "space_heating", pool: "special", qty: 1, rate: 250000 },
    { element_ref: "fit_out", pool: "main", qty: 1, rate: 350000 },
    { element_ref: "shell", pool: "nonqual", qty: 1, rate: 900000 }
  ]
};

test("G1 the three parts sum back to the purchase consideration — the s.562 tie-back", () => {
  const r = M.residualApportionment(JOB);
  const hi = r.qualifying_pm.high + r.nonqual_building.high + r.apportioned_land.low;
  const lo = r.qualifying_pm.low + r.nonqual_building.low + r.apportioned_land.high;
  assert.equal(near(hi, 2000000, 1e-6), true);
  assert.equal(near(lo, 2000000, 1e-6), true);
});

test("G1b the two land scenarios are internally coherent, not a min/max of each field", () => {
  const r = M.residualApportionment(JOB);
  /* the low-land run: plant HIGH, building HIGH, land LOW - all three together */
  assert.ok(r.qualifying_pm.high > r.qualifying_pm.low);
  assert.ok(r.nonqual_building.high > r.nonqual_building.low);
  assert.ok(r.apportioned_land.low < r.apportioned_land.high);
  /* a high land value pulls the multiplier down, so it lowers plant AND
     building together - they do not move in opposite directions */
  assert.ok(r.multiplier.at_low_land > r.multiplier.at_high_land);
});

test("G2 a HIGHER land value gives a LOWER qualifying figure — the inversion", () => {
  const r = M.residualApportionment(JOB);
  assert.ok(r.qualifying_pm.low < r.qualifying_pm.high);
  assert.ok(r.components.C_high > r.components.C_low);
  assert.ok(r.apportioned_land.high > r.apportioned_land.low);
});

test("G3 a known land value collapses the range to a point", () => {
  const r = M.residualApportionment(Object.assign({}, JOB, {
    land_value_estimate: 600000, land_fraction_low: undefined, land_fraction_high: undefined
  }));
  assert.equal(near(r.qualifying_pm.low, r.qualifying_pm.high, 1e-6), true);
  assert.equal(r.land_value_estimated, false);
  assert.ok(!r.flags.includes("LAND_VALUE_ESTIMATED"));
});

test("G4 an estimated land value is flagged as estimated", () => {
  assert.ok(M.residualApportionment(JOB).flags.includes("LAND_VALUE_ESTIMATED"));
});

test("G5 qualifying splits between the pools in proportion to costed share", () => {
  const r = M.residualApportionment(JOB);
  const p = r.qualifying_pools.high;
  assert.equal(near(p.main + p.special, r.qualifying_pm.high, 1e-6), true);
  assert.equal(near(p.main / p.special, 350000 / 250000, 1e-9), true);
});

test("G6 the module never claims to be shipped", () => {
  assert.equal(M.residualApportionment(JOB).prepared_not_shipped, true);
});

test("G7 the derived figure inherits the WORST input grade, never A", () => {
  assert.equal(M.residualApportionment(JOB).confidence_grade, "D");
});

test("G8 with every gate off, the model reproduces spec 4.2 exactly", () => {
  const r = M.residualApportionment({
    purchase_consideration: 1000000, land_value_estimate: 300000,
    elements: [{ element_ref: "plant", pool: "main", qty: 2, rate: 100000 }]
  });
  /* A = 2 x 100,000 x 1.00 (no location) x 1.00 (no depreciation) x 1.18 x 1.15 */
  assert.equal(near(r.components.A, 200000 * 1.18 * 1.15, 1e-6), true);
  assert.equal(r.factors.prelims.rate, M.SPEC_PRELIMS_DEFAULT);
  assert.equal(r.factors.fees.rate, M.SPEC_FEES_DEFAULT);
});

test("G9 all four fixes together, on injected fixtures, compose in the documented order", () => {
  const lives = Object.assign({}, PLANT_LIVES_FIXTURE, {
    lives_years: Object.assign({}, PLANT_LIVES_FIXTURE.lives_years, { shell: 60 })
  });
  const o = {
    gates: {
      leg_e2_drop_prelims_from_erc: true,
      leg_e3_voa_fee_scale: true,
      leg_e3_building_type_adder: true,
      leg_e4_location_and_contract_size: true,
      leg_e5_per_element_depreciation: true
    },
    tables: Object.assign({}, ALL_FIXTURES, { CB_CIBSE_PLANT_LIVES: lives })
  };
  const r = M.residualApportionment({
    purchase_consideration: 2000000, land_value_estimate: 600000,
    location_key: "cardiff", price_source: PS, contract_value: 2000000, index_factor: 1.05, building_type: "standard",
    elements: [{ element_ref: "passenger_lift", pool: "main", qty: 1, rate: 400000, age_years: 5 }]
  }, o);

  /* base 400,000
       x 0.80 (20y life, 5y old -> ratio 0.25)   LEG-E5, per element
       x 1.00 (prelims removed)                  LEG-E2, per element
       x 1.05 (index)                            per element
     = the element LINE, which carries no location factor at all; then
       x 0.94 (Cardiff) x 1.10 (contract size at GBP 2m)   LEG-E4, ONCE, on the
                                                           summed cost plan
     = construction cost; then the fee band on that cost.                       */
  const construction = 400000 * 0.94 * 1.10 * 0.80 * 1.00 * 1.05;
  const feeRate = construction < 100000 ? 0.20 : (construction < 1000000 ? 0.12 : 0.08);
  assert.equal(near(r.components.A, construction * (1 + feeRate), 1e-6), true);

  assert.ok(r.flags.includes("LEG_E2_APPLIED"));
  assert.ok(r.flags.includes("LEG_E3_APPLIED"));
  assert.ok(r.flags.includes("LEG_E4_APPLIED"));
  assert.ok(r.flags.includes("LEG_E5_APPLIED"));
});

test("G10 the input guards refuse malformed jobs rather than absorbing them", () => {
  assert.equal(codeOf(() => M.residualApportionment({})), "E_PC_REQUIRED");
  assert.equal(codeOf(() => M.residualApportionment({ purchase_consideration: 1000 })), "E_NO_ELEMENTS");
  assert.equal(codeOf(() => M.residualApportionment({
    purchase_consideration: 1000, land_value_estimate: 1,
    elements: [{ element_ref: "x", pool: "wrong", qty: 1, rate: 1 }]
  })), "E_ELEMENT_POOL_INVALID");
  assert.equal(codeOf(() => M.residualApportionment({
    purchase_consideration: 1000,
    elements: [{ element_ref: "x", pool: "main", qty: 1, rate: 1 }]
  })), "E_LAND_FRACTION_REQUIRED");
});

/* =============================================================================
   H. THE DEPRECIATION METHOD SWITCH — LEG-E5b, board item 12927234437
   -----------------------------------------------------------------------------
   Both methods now exist. Neither is chosen. These tests assert that the
   default changes no number today, that the two methods are exclusive, and
   that neither can run over an empty table.

   THE BUILDING OBSOLESCENCE FIXTURE BELOW IS INVENTED, like every other fixture
   in this file. It is not the VOA whole-building age allowance and must never
   be promoted to a default.
   ============================================================================= */

/* Banded on AGE IN YEARS, not on an age ratio — a building has no CIBSE life.
   Final band is CLOSED at 80 so the clamp behaviour can be asserted. */
const BUILDING_OBSOLESCENCE_FIXTURE = {
  table_id: "CB_VOA_BUILDING_OBSOLESCENCE",
  source: "INVENTED TEST FIXTURE - not VOA data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-08-31",
  default_scale: "default",
  scales: {
    default: {
      residual_floor: 0.30,
      bands: [[0, 10, 1.00], [10, 25, 0.85], [25, 50, 0.60], [50, 80, 0.40]]
    },
    /* a scale whose tail dips below its own floor, to prove the floor bites */
    steep: {
      residual_floor: 0.35,
      bands: [[0, 20, 0.90], [20, 60, 0.50], [60, null, 0.05]]
    }
  }
};

const WITH_BUILDING = gates => ({
  gates: gates,
  tables: Object.assign({}, ALL_FIXTURES, {
    CB_VOA_BUILDING_OBSOLESCENCE: BUILDING_OBSOLESCENCE_FIXTURE
  })
});

/* 'shell' needs a CIBSE life for the per-element arm of the comparison tests. */
const LIVES_WITH_SHELL = Object.assign({}, PLANT_LIVES_FIXTURE, {
  lives_years: Object.assign({}, PLANT_LIVES_FIXTURE.lives_years, { shell: 60 })
});
const WITH_BOTH = gates => ({
  gates: gates,
  tables: Object.assign({}, ALL_FIXTURES, {
    CB_VOA_BUILDING_OBSOLESCENCE: BUILDING_OBSOLESCENCE_FIXTURE,
    CB_CIBSE_PLANT_LIVES: LIVES_WITH_SHELL
  })
});

const DEP_JOB = {
  purchase_consideration: 2000000, land_value_estimate: 600000,
  valuation_basis: "drc",
  building_age_years: 30,
  elements: [
    { element_ref: "passenger_lift", pool: "main", qty: 1, rate: 400000, age_years: 30 },
    { element_ref: "shell", pool: "nonqual", qty: 1, rate: 800000, age_years: 30 }
  ]
};

/* ---- H1–H4: the default is today's behaviour, and it is not a choice ------ */

test("H1 the default method is none — the module does not choose between them", () => {
  assert.equal(M.DEPRECIATION_METHOD_DEFAULT, M.DEPRECIATION_METHOD.NONE);
  const r = M.resolveDepreciationMethod({});
  assert.equal(r.method, "none");
  assert.equal(r.method_source, "default");
  assert.equal(r.effective, false);
  assert.ok(r.flags.includes("DEPRECIATION_METHOD_NONE"));
});

test("H2 with both gates off the whole switch changes no number at all", () => {
  const withOut = M.residualApportionment(DEP_JOB);
  const asNone = M.residualApportionment(
    Object.assign({}, DEP_JOB, { depreciation_method: "none" }));
  assert.equal(near(withOut.qualifying_pm.high, asNone.qualifying_pm.high, 1e-9), true);
  assert.equal(withOut.lines[0].depreciation_factor, 1);
});

test("H3 back-compat: E5 gate on, E5b off, no method stated still runs per-element", () => {
  const r = M.resolveDepreciationMethod({}, WITH_BOTH({ leg_e5_per_element_depreciation: true }));
  assert.equal(r.method, "per_element");
  assert.equal(r.method_source, "e5_gate");
  assert.equal(r.effective, true);
  assert.ok(r.flags.includes("DEPRECIATION_METHOD_INHERITED_FROM_E5_GATE"));
});

test("H4 but the back-compat rule does NOT run the other way — E5b never self-selects", () => {
  const onlyB = M.resolveDepreciationMethod({},
    WITH_BUILDING({ leg_e5b_whole_building_depreciation: true }));
  assert.equal(onlyB.method, "none", "a new method must be chosen, never fallen into");
  assert.ok(onlyB.flags.includes("DEPRECIATION_AVAILABLE_BUT_METHOD_NOT_CHOSEN"));

  const both = M.resolveDepreciationMethod({}, WITH_BOTH({
    leg_e5_per_element_depreciation: true,
    leg_e5b_whole_building_depreciation: true
  }));
  assert.equal(both.method, "none",
    "with a real choice available, inaction must not become a decision");
  assert.ok(both.flags.includes("DEPRECIATION_AVAILABLE_BUT_METHOD_NOT_CHOSEN"));
});

/* ---- H5–H9: the whole-building method itself ----------------------------- */

test("H5 gate off — no whole-building depreciation, and flagged", () => {
  const r = M.wholeBuildingDepreciationFactor({ building_age_years: 30 });
  assert.equal(r.factor, 1);
  assert.equal(r.applied, false);
  assert.ok(r.flags.includes("LEG_E5B_NO_DEPRECIATION"));
});

test("H6 gate on with an injected scale — age lands in the right band", () => {
  const o = WITH_BUILDING({ leg_e5b_whole_building_depreciation: true });
  /* 30y -> band [25,50) -> 0.60 */
  assert.equal(M.wholeBuildingDepreciationFactor({ building_age_years: 30 }, o).factor, 0.60);
  /* 5y -> band [0,10) -> 1.00 */
  assert.equal(M.wholeBuildingDepreciationFactor({ building_age_years: 5 }, o).factor, 1.00);
});

test("H7 it needs ONE table, not two — no CIBSE life is consulted", () => {
  const o = {
    gates: { leg_e5b_whole_building_depreciation: true },
    tables: { CB_VOA_BUILDING_OBSOLESCENCE: BUILDING_OBSOLESCENCE_FIXTURE }
  };
  /* No CB_CIBSE_PLANT_LIVES supplied at all, and it still resolves. */
  assert.equal(M.wholeBuildingDepreciationFactor({ building_age_years: 30 }, o).factor, 0.60);
});

test("H8 past the end of the scale a building does NOT depreciate to zero", () => {
  const o = WITH_BUILDING({ leg_e5b_whole_building_depreciation: true });
  const r = M.wholeBuildingDepreciationFactor({ building_age_years: 140 }, o);
  assert.equal(r.factor, 0.40, "clamped to the last band, never extrapolated");
  assert.equal(r.age_used, 80);
  assert.ok(r.flags.includes("BUILDING_AGE_BEYOND_SCALE"));
});

test("H9 the residual floor bites when the scale would go below it", () => {
  const o = WITH_BUILDING({ leg_e5b_whole_building_depreciation: true });
  const r = M.wholeBuildingDepreciationFactor(
    { building_age_years: 90, building_obsolescence_scale: "steep" }, o);
  assert.equal(r.factor, 0.35, "the floor, not the 0.05 the scale would give");
  assert.ok(r.flags.includes("RESIDUAL_FLOOR_APPLIED"));
});

/* ---- H10–H13: refusals ---------------------------------------------------- */

test("H10 gate on over an empty stub refuses rather than guessing", () => {
  assert.equal(
    codeOf(() => M.wholeBuildingDepreciationFactor({ building_age_years: 30 },
      { gates: { leg_e5b_whole_building_depreciation: true } })),
    "E_TABLE_NOT_LOADED");
});

test("H11 an unknown building age refuses — it will not assume nought", () => {
  const o = WITH_BUILDING({ leg_e5b_whole_building_depreciation: true });
  assert.equal(codeOf(() => M.wholeBuildingDepreciationFactor({}, o)), "E_BUILDING_AGE_REQUIRED");
  assert.equal(codeOf(() => M.wholeBuildingDepreciationFactor({ building_age_years: -1 }, o)),
    "E_BUILDING_AGE_REQUIRED");
});

test("H12 an unlisted scale refuses rather than falling back to the default one", () => {
  const o = WITH_BUILDING({ leg_e5b_whole_building_depreciation: true });
  assert.equal(
    codeOf(() => M.wholeBuildingDepreciationFactor(
      { building_age_years: 30, building_obsolescence_scale: "nonexistent" }, o)),
    "E_BUILDING_OBSOLESCENCE_SCALE_NOT_IN_TABLE");
});

test("H13 an unknown method name refuses rather than silently becoming none", () => {
  assert.equal(codeOf(() => M.resolveDepreciationMethod({ depreciation_method: "straight_line" })),
    "E_UNKNOWN_DEPRECIATION_METHOD");
});

/* ---- H14–H17: the two methods are alternatives, not layers --------------- */

test("H14 stacking both methods on the same asset is an error, not a flag", () => {
  const o = WITH_BOTH({
    leg_e5_per_element_depreciation: true,
    leg_e5b_whole_building_depreciation: true
  });
  assert.equal(
    codeOf(() => M.resolveDepreciationMethod(
      { depreciation_method: "per_element", also_apply_whole_building: true }, o)),
    "E_DEPRECIATION_METHODS_STACKED");
});

test("H15 whole-building applies ONE factor to every element, per-element does not", () => {
  const o = WITH_BOTH({
    leg_e5_per_element_depreciation: true,
    leg_e5b_whole_building_depreciation: true
  });

  const wb = M.residualApportionment(
    Object.assign({}, DEP_JOB, { depreciation_method: "whole_building" }), o);
  assert.equal(wb.lines[0].depreciation_factor, wb.lines[1].depreciation_factor,
    "one building age, one factor, every element");
  assert.equal(wb.lines[0].depreciation_factor, 0.60);

  const pe = M.residualApportionment(
    Object.assign({}, DEP_JOB, { depreciation_method: "per_element" }), o);
  /* lift: 20y life, 30y old -> ratio clamped to 1 -> band [1,null) -> 0.25
     shell: 60y life, 30y old -> ratio 0.50      -> band [0.50,0.75) -> 0.55 */
  assert.notEqual(pe.lines[0].depreciation_factor, pe.lines[1].depreciation_factor,
    "different lives, different factors — this is the whole argument for E5");
  assert.equal(pe.lines[0].depreciation_factor, 0.25);
  assert.equal(pe.lines[1].depreciation_factor, 0.55);
});

test("H16 and the two methods give MATERIALLY different answers — the choice is real", () => {
  const o = WITH_BOTH({
    leg_e5_per_element_depreciation: true,
    leg_e5b_whole_building_depreciation: true
  });
  const wb = M.residualApportionment(
    Object.assign({}, DEP_JOB, { depreciation_method: "whole_building" }), o);
  const pe = M.residualApportionment(
    Object.assign({}, DEP_JOB, { depreciation_method: "per_element" }), o);

  /* Not asserting a direction — which method gives the bigger claim depends
     entirely on the age profile of the plant against the age of the building,
     and that is exactly why a surveyor has to choose rather than us. What IS
     asserted is that the gap is large enough that the choice matters. */
  const gap = Math.abs(wb.qualifying_pm.high - pe.qualifying_pm.high);
  assert.ok(gap / pe.qualifying_pm.high > 0.05,
    "a >5% gap on the qualifying figure — not a rounding difference");
});

test("H17 replacement_new skips depreciation whichever method is selected", () => {
  const o = WITH_BOTH({
    leg_e5_per_element_depreciation: true,
    leg_e5b_whole_building_depreciation: true
  });
  for (const method of ["per_element", "whole_building", "none"]) {
    const r = M.residualApportionment(Object.assign({}, DEP_JOB, {
      valuation_basis: "replacement_new", depreciation_method: method
    }), o);
    assert.equal(r.lines[0].depreciation_factor, 1, method + " must not depreciate on replacement_new");
    assert.ok(r.flags.includes("REPLACEMENT_NEW_NO_DEPRECIATION"));
  }
});

/* ---- H18–H20: attribution and disclosure -------------------------------- */

test("H18 whose judgement the method rests on is recorded, like the basis", () => {
  const cfg = M.resolveDepreciationMethod({ depreciation_method: "whole_building" });
  assert.equal(cfg.method_source, "config");
  assert.ok(cfg.flags.includes("DEPRECIATION_METHOD_NOT_SET_BY_SURVEYOR"));

  const sv = M.resolveDepreciationMethod({
    depreciation_method: "whole_building",
    depreciation_method_set_by: "A. Surveyor MRICS"
  });
  assert.equal(sv.method_source, "surveyor");
  assert.equal(sv.method_set_by, "A. Surveyor MRICS");
  assert.ok(!sv.flags.includes("DEPRECIATION_METHOD_NOT_SET_BY_SURVEYOR"));
});

test("H19 selecting a method whose gate is off says so rather than failing quietly", () => {
  const r = M.resolveDepreciationMethod({ depreciation_method: "whole_building" });
  assert.equal(r.effective, false);
  assert.ok(r.flags.includes("WHOLE_BUILDING_METHOD_SELECTED_BUT_GATE_OFF"));

  const p = M.resolveDepreciationMethod({ depreciation_method: "per_element" });
  assert.ok(p.flags.includes("PER_ELEMENT_METHOD_SELECTED_BUT_GATE_OFF"));
});

test("H20 the method is graded D — a surveyor's call, and a D blocks sign-off", () => {
  assert.equal(M.resolveDepreciationMethod({}).confidence_grade, "D");
});

test("H21 the DRC-without-depreciation warning considers BOTH methods, not just E5", () => {
  /* E5b's gate alone is enough for depreciation to be 'available', so the
     warning must clear — otherwise a DRC report using the whole-building method
     would carry a flag saying no depreciation was possible. */
  const r = M.resolveValuationBasis({ valuation_basis: "drc" },
    WITH_BUILDING({ leg_e5b_whole_building_depreciation: true }));
  assert.equal(r.depreciation_available, true);
  assert.ok(!r.flags.includes("DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE"));
});

test("H22 the result carries the method on its face, so a report can state it", () => {
  const r = M.residualApportionment(DEP_JOB);
  assert.equal(r.depreciation.method, "none");
  assert.equal(r.depreciation.method_source, "default");
  assert.equal(r.factors.whole_building_depreciation, null,
    "no whole-building factor is computed when the method is not selected");
});

/* ==========================================================================
   I5 - the recorded working method (Phase 63, 1 September 2026)
   ======================================================================== */

test("I5-1 the working method is recorded as whole-building", () => {
  assert.equal(M.CB_P9_WORKING_METHOD.depreciation_method,
    M.DEPRECIATION_METHOD.WHOLE_BUILDING);
  assert.equal(M.CB_P9_WORKING_METHOD.stated_by, "Lakhbir Dhillon (Head of Business Development)");
  assert.doesNotMatch(M.CB_P9_WORKING_METHOD.stated_by, /controller|director|principal/i);
});

test("I5-2 recording it did NOT change the default, which stays fail-closed", () => {
  assert.equal(M.DEPRECIATION_METHOD_DEFAULT, M.DEPRECIATION_METHOD.NONE);
  assert.equal(M.CB_P9_WORKING_METHOD.is_the_default, false);
  /* the load-bearing one: with nothing stated and no gate on, still none */
  assert.equal(M.resolveDepreciationMethod({}).method, M.DEPRECIATION_METHOD.NONE);
});

test("I5-3 the working method is NOT surveyor-set, and resolving it says so", () => {
  assert.equal(M.CB_P9_WORKING_METHOD.set_by_surveyor, false);
  const r = M.resolveDepreciationMethod({
    depreciation_method: M.CB_P9_WORKING_METHOD.depreciation_method
  });
  assert.ok(r.flags.includes("DEPRECIATION_METHOD_NOT_SET_BY_SURVEYOR"));
  assert.notEqual(r.method_source, "surveyor");
});

test("I5-4 the working method is not effective while the E5b gate is off", () => {
  const r = M.resolveDepreciationMethod({
    depreciation_method: M.CB_P9_WORKING_METHOD.depreciation_method
  });
  assert.equal(r.effective, false);
  assert.ok(r.flags.includes("WHOLE_BUILDING_METHOD_SELECTED_BUT_GATE_OFF"));
  assert.equal(M.CB_P9_WORKING_METHOD.effective_today, false);
});

test("I5-5 the I4/I5 pairing is carried on the record, not left to memory", () => {
  assert.match(M.CB_P9_WORKING_METHOD.paired_with, /I4/);
});

/* =============================================================================
   J. ATP-F-3 — THE CIBSE-TO-TAXONOMY CROSSWALK COMPLETENESS GATE, board item
      12927234437. Built by Phase 129 on 12 September 2026, switched off.
   Every life below is INVENTED. The taxonomy ids are real ids from the fixture
   taxonomy; the lives attached to them are not CIBSE data.
   ============================================================================= */

const fs = require("node:fs");
const path = require("node:path");

const TWELVE_REFS = Array.from({ length: 12 }, (_, i) => "LS-CH-" + String(i + 1).padStart(3, "0"));

const livesFor = (refs, extra) => ({
  table_id: "CB_CIBSE_PLANT_LIVES", source: "INVENTED TEST FIXTURE - not CIBSE data",
  licence: "n/a - fixture", loaded: true, verified_at: "2026-09-12",
  default_scale: "default",
  lives_years: Object.assign({}, Object.fromEntries(refs.map((r, i) => [r, 10 + i * 5])), extra || {})
});

const withLives = lives => Object.assign({}, ALL_FIXTURES, { CB_CIBSE_PLANT_LIVES: lives });
const XW_ON = { leg_e5_per_element_depreciation: true, leg_e5_crosswalk_completeness_gate: true };
const errOf = fn => { try { fn(); return null; } catch (e) { return { code: e.code, detail: e.detail }; } };

test("J1 the crosswalk gate ships false, and off it changes nothing: no list needed, the reactive guard still fires (F3-3)", () => {
  assert.equal(M.CB_P9_GATES.leg_e5_crosswalk_completeness_gate, false);
  const dflt = M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 },
    ON({ leg_e5_per_element_depreciation: true }));
  const explicitOff = M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 },
    ON({ leg_e5_per_element_depreciation: true, leg_e5_crosswalk_completeness_gate: false }));
  assert.equal(dflt.factor, 0.80);
  assert.deepEqual(explicitOff, dflt);
  assert.ok(!dflt.flags.includes("CROSSWALK_COMPLETENESS_CHECKED"));
  assert.equal(codeOf(() => M.elementDepreciationFactor({ element_ref: "mystery_widget", age_years: 5 },
    ON({ leg_e5_per_element_depreciation: true }))), "E_PLANT_LIFE_NOT_IN_TABLE");
});

test("J2 F3-1 a complete crosswalk of 12 taxonomy ids passes", () => {
  assert.deepEqual(
    M.assertCrosswalkComplete(TWELVE_REFS, { tables: withLives(livesFor(TWELVE_REFS)) }),
    { complete: true, checked: 12 });
});

test("J3 F3-2 missing 2 of the 12 refuses, naming exactly those 2", () => {
  const lives = livesFor(TWELVE_REFS.filter(r => r !== "LS-CH-004" && r !== "LS-CH-011"));
  const e = errOf(() => M.assertCrosswalkComplete(TWELVE_REFS, { tables: withLives(lives) }));
  assert.equal(e.code, "E_CROSSWALK_INCOMPLETE");
  assert.deepEqual(e.detail.missing, ["LS-CH-004", "LS-CH-011"]);
  assert.equal(e.detail.checked, 12);
});

test("J4 N4 a life that is ABSENT and a life recorded as NOT KNOWN refuse identically — neither is a pass, a 0 or a default", () => {
  const absent = livesFor(TWELVE_REFS.slice(0, 11));                      /* LS-CH-012 has no key at all */
  const absentErr = errOf(() => M.assertCrosswalkComplete(TWELVE_REFS, { tables: withLives(absent) }));
  assert.equal(absentErr.code, "E_CROSSWALK_INCOMPLETE");
  assert.deepEqual(absentErr.detail.missing, ["LS-CH-012"]);
  for (const notKnown of [null, undefined, "not sure", "unknown", 0, -5, NaN, Infinity]) {
    const lives = livesFor(TWELVE_REFS.slice(0, 11), { "LS-CH-012": notKnown });
    const e = errOf(() => M.assertCrosswalkComplete(TWELVE_REFS, { tables: withLives(lives) }));
    assert.deepEqual(e, absentErr, "a life of " + String(notKnown) + " must behave exactly as an absent one");
    /* and through the model: the listed, fully known element is not priced either */
    const viaModel = errOf(() => M.elementDepreciationFactor({ element_ref: "LS-CH-001", age_years: 5 },
      { gates: XW_ON, tables: withLives(lives), taxonomy_element_refs: TWELVE_REFS }));
    const viaModelAbsent = errOf(() => M.elementDepreciationFactor({ element_ref: "LS-CH-001", age_years: 5 },
      { gates: XW_ON, tables: withLives(absent), taxonomy_element_refs: TWELVE_REFS }));
    assert.deepEqual(viaModel, viaModelAbsent);
    assert.equal(viaModel.code, "E_CROSSWALK_INCOMPLETE");
  }
});

test("J5 N4 an ABSENT taxonomy list and an EMPTY one refuse identically — the check cannot pass on nothing", () => {
  const tables = withLives(livesFor(TWELVE_REFS));
  assert.equal(codeOf(() => M.assertCrosswalkComplete(undefined, { tables })), "E_TAXONOMY_REFS_REQUIRED");
  assert.equal(codeOf(() => M.assertCrosswalkComplete([], { tables })), "E_TAXONOMY_REFS_REQUIRED");
  const el = { element_ref: "LS-CH-001", age_years: 5 };
  assert.equal(codeOf(() => M.elementDepreciationFactor(el, { gates: XW_ON, tables })), "E_TAXONOMY_REFS_REQUIRED");
  assert.equal(codeOf(() => M.elementDepreciationFactor(el, { gates: XW_ON, tables, taxonomy_element_refs: [] })),
    "E_TAXONOMY_REFS_REQUIRED");
  assert.equal(codeOf(() => M.assertCrosswalkComplete(["LS-CH-001", ""], { tables })), "E_TAXONOMY_REF_INVALID");
});

test("J6 over the shipped empty CIBSE stub the check refuses as a gate over an empty table, and names this gate", () => {
  const e = errOf(() => M.assertCrosswalkComplete(TWELVE_REFS, {}));
  assert.equal(e.code, "E_TABLE_NOT_LOADED");
  assert.equal(e.detail.gate, "leg_e5_crosswalk_completeness_gate");
});

test("J7 the real fixture taxonomy: every id read, none repeated — and today no id has a life, so all of them refuse", () => {
  /* Phase 132g, 16 Sep 2026: the live taxonomy is the 02-modules-and-build-prep/ copy; 03-app/ held an older twin */
  const csv = fs.readFileSync(path.join(__dirname, "..", "..", "02-modules-and-build-prep", "Caprebate-Fixture-Taxonomy-v1.csv"), "utf8");
  const refs = M.taxonomyElementRefs(csv);
  const dataRows = csv.split(/\r?\n/).slice(1).filter(l => l.trim() !== "").length;
  assert.equal(refs.length, dataRows);
  assert.equal(new Set(refs).size, refs.length);
  assert.ok(refs.every(r => /^LS-/.test(r)));
  /* the only lives we hold are the invented element_ref fixture, keyed on names
     like passenger_lift, not on taxonomy ids: that IS the missing crosswalk */
  const e = errOf(() => M.assertCrosswalkComplete(refs, ON({})));
  assert.equal(e.code, "E_CROSSWALK_INCOMPLETE");
  assert.equal(e.detail.missing.length, refs.length);
  /* the reader is quote-aware and refuses a file it cannot read */
  assert.deepEqual(M.taxonomyElementRefs('notes,element_id\n"a, b",LS-X-1\n'), ["LS-X-1"]);
  assert.equal(codeOf(() => M.taxonomyElementRefs("id,name\nLS-X-1,a\n")), "E_TAXONOMY_CSV_NO_ELEMENT_ID");
  assert.equal(codeOf(() => M.taxonomyElementRefs("element_id\n")), "E_TAXONOMY_CSV_EMPTY");
  assert.equal(codeOf(() => M.taxonomyElementRefs("element_id\nLS-X-1\nLS-X-1\n")), "E_TAXONOMY_REF_DUPLICATE");
});

test("J8 gate on, crosswalk incomplete: the job refuses before ANY element is priced, even one that has a life", () => {
  const lives = livesFor(TWELVE_REFS.slice(0, 11));
  assert.equal(codeOf(() => M.elementDepreciationFactor({ element_ref: "LS-CH-001", age_years: 5 },
    { gates: XW_ON, tables: withLives(lives), taxonomy_element_refs: TWELVE_REFS })), "E_CROSSWALK_INCOMPLETE");
});

test("J9 gate on, crosswalk complete: the check changes no number, it only adds its flag", () => {
  const tables = withLives(livesFor(TWELVE_REFS));
  const el = { element_ref: "LS-CH-003", age_years: 7 };
  const off = M.elementDepreciationFactor(el, { gates: { leg_e5_per_element_depreciation: true }, tables });
  const on = M.elementDepreciationFactor(el, { gates: XW_ON, tables, taxonomy_element_refs: TWELVE_REFS });
  assert.equal(on.factor, off.factor);
  assert.ok(on.flags.includes("CROSSWALK_COMPLETENESS_CHECKED"));
  assert.deepEqual(on.flags.filter(f => f !== "CROSSWALK_COMPLETENESS_CHECKED"), off.flags);
});

test("J10 gate on: an element outside the checked taxonomy list refuses, even if it happens to have a life", () => {
  const tables = withLives(livesFor(TWELVE_REFS, { passenger_lift: 20 }));
  assert.equal(codeOf(() => M.elementDepreciationFactor({ element_ref: "passenger_lift", age_years: 5 },
    { gates: XW_ON, tables, taxonomy_element_refs: TWELVE_REFS })), "E_ELEMENT_NOT_IN_TAXONOMY");
});

test("J11 the crosswalk gate on with LEG-E5 off depreciates nothing and asks for nothing", () => {
  const r = M.elementDepreciationFactor({ element_ref: "LS-CH-001", age_years: 5 },
    { gates: { leg_e5_crosswalk_completeness_gate: true } });
  assert.equal(r.factor, 1);
  assert.ok(r.flags.includes("LEG_E5_NO_DEPRECIATION"));
});

test("J12 through the residual model, turning only the crosswalk gate on changes no number", () => {
  const job = {
    purchase_consideration: 2000000, valuation_basis: "drc",
    land_fraction_low: 0.25, land_fraction_high: 0.35,
    elements: [
      { element_ref: "passenger_lift", pool: "main", qty: 1, rate: 400000, age_years: 12 },
      { element_ref: "shell", pool: "nonqual", qty: 1, rate: 800000, age_years: 12 }
    ]
  };
  assert.deepEqual(
    M.residualApportionment(job, { gates: { leg_e5_crosswalk_completeness_gate: true } }),
    M.residualApportionment(job));
});

test("J13 F3-4/F3-5 through the checked path: a longer life survives strictly better at the same age", () => {
  const tables = withLives(livesFor(TWELVE_REFS));                        /* LS-CH-001 life 10, LS-CH-012 life 65 */
  const o = { gates: XW_ON, tables, taxonomy_element_refs: TWELVE_REFS };
  const shortLife = M.elementDepreciationFactor({ element_ref: "LS-CH-001", age_years: 7 }, o);
  const longLife = M.elementDepreciationFactor({ element_ref: "LS-CH-012", age_years: 7 }, o);
  assert.ok(longLife.factor > shortLife.factor, "identical factors would mean the life lookup is not wired");
});

/* =============================================================================
   P153e — PHASE 153e, 4 OCTOBER 2026: FOUR OF THE SURVEYOR'S QUESTIONS IN THIS MODEL'S OWN TEST SYSTEM
   (136 preliminaries by job size; 137 the insurance cross-check; 139 the past claim; 147 the index from dates).
   ============================================================================= */

test("P153e-1 (q136) preliminaries by job size: placeholder bands, only with the gate on, and a job with no size refuses", () => {
  assert.equal(M.CB_P9_GATES.leg_e2_prelims_banded_by_job_size, false, "ships off");
  assert.equal(M.defaultPrelimsRate({}, {}), 0.18, "off: the flat 18% as before");
  const on = { gates: { leg_e2_prelims_banded_by_job_size: true } };
  assert.equal(M.defaultPrelimsRate({ job_size_pounds: 100000 }, on), 0.18);
  assert.equal(M.defaultPrelimsRate({ job_size_pounds: 250000 }, on), 0.15, "a band's floor is in the band");
  assert.equal(M.defaultPrelimsRate({ job_size_pounds: 2000000 }, on), 0.12);
  assert.equal(M.defaultPrelimsRate({ job_size_pounds: 9000000 }, on), 0.10);
  assert.equal(codeOf(() => M.defaultPrelimsRate({}, on)), "E_JOB_SIZE_REQUIRED", "N4: no size is never defaulted");
  assert.match(M.PRELIMS_BANDS_PLACEHOLDER.status, /PLACEHOLDER/);
  const r = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, job_size_pounds: 2000000 }, on);
  assert.equal(near(r.factor, 1.12), true, "the residual path takes the banded rate");
});

test("P153e-2 (q136) the test system runs the by-source rule and the bands together: a book that includes on-costs adds none; one that excludes them takes the band", () => {
  const t = { gates: M.TEST_SYSTEM_GATES, tables: ALL_FIXTURES };
  assert.equal(M.TEST_SYSTEM_GATES.leg_e2_oncosts_by_price_source, true);
  assert.equal(M.TEST_SYSTEM_GATES.leg_e2_drop_prelims_from_erc, undefined, "never the blanket drop");
  const incl = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_b", job_size_pounds: 2000000 }, t);
  assert.equal(incl.factor, 1);
  const excl = M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_a", job_size_pounds: 2000000 }, t);
  assert.equal(near(excl.factor, 1.12), true);
  assert.equal(codeOf(() => M.prelimsFactor({ cost_basis: M.COST_BASIS.RESIDUAL, price_source: "invented_book_c", job_size_pounds: 2000000 }, t)), "E_ONCOSTS_BASIS_UNKNOWN");
});

test("P153e-3 (q147) the index factor from a table and two dates: today's price back to the purchase date; never extrapolated; the real table ships empty", () => {
  const f = M.indexFactorFromTable(M.CB_BCIS_INDEX_PLACEHOLDER, "2021-06-30", "2026-03-01");
  assert.equal(near(f.factor, 322 / 396), true);
  assert.match(f.source, /PLACEHOLDER - INVENTED POINTS, NOT BCIS DATA/);
  assert.equal(codeOf(() => M.indexFactorFromTable(M.CB_BCIS_INDEX_PLACEHOLDER, "2017-06-30", "2026-03-01")), "E_INDEX_DATE_OUTSIDE_TABLE");
  assert.equal(codeOf(() => M.indexFactorFromTable(M.CB_BCIS_INDEX_PLACEHOLDER, "2021-06", "2027-03-01")), "E_INDEX_DATE_OUTSIDE_TABLE");
  assert.equal(codeOf(() => M.indexFactorFromTable(M.CB_BCIS_INDEX_PLACEHOLDER, "last year", "2026-03-01")), "E_INDEX_DATES_REQUIRED");
  assert.equal(M.CB_BCIS_INDEX.loaded, false);
  const base = { purchase_consideration: 1000000, land_value_estimate: 200000, prelims_rate: 0, fees_rate: 0,
    elements: [{ element_ref: "x", pool: "main", qty: 1, rate: 400000 }, { element_ref: "y", pool: "nonqual", qty: 1, rate: 400000 }] };
  assert.equal(codeOf(() => M.residualApportionment(Object.assign({}, base, { index_dates: { purchase: "2021-06-30", valuation: "2026-03-01" } }))), "E_TABLE_NOT_LOADED", "the real table is empty: no guess");
  const r = M.residualApportionment(Object.assign({}, base, { index_dates: { purchase: "2021-06-30", valuation: "2026-03-01" } }), { tables: M.TEST_SYSTEM_TABLES });
  assert.equal(near(r.factors.index_factor, 322 / 396), true);
  assert.equal(near(r.components.A, 400000 * 322 / 396, 1e-6), true);
  assert.equal(codeOf(() => M.residualApportionment(Object.assign({}, base, { index_factor: 1.05, index_dates: { purchase: "2021-06-30", valuation: "2026-03-01" } }), { tables: M.TEST_SYSTEM_TABLES })), "E_INDEX_CONFLICT");
});

test("P153e-4 (q137) the insurance cross-check: like for like first, then within 10% supports; an unknown basis is NOT_COMPARABLE, never support; the word corroborates is never used", () => {
  const T = { tables: M.TEST_SYSTEM_TABLES };
  const same = { demolition: true, fees: true, prelims: true };
  const s = M.insuranceCrossCheck({ ours: { amount: 2000000, date: "2026-03-01", includes: same }, insurance: { amount: 2100000, date: "2026-03-01", includes: same } }, T);
  assert.equal(s.verdict, "SUPPORTS");
  const far = M.insuranceCrossCheck({ ours: { amount: 2000000, date: "2026-03-01", includes: same }, insurance: { amount: 2500000, date: "2026-03-01", includes: same } }, T);
  assert.equal(far.verdict, "DOES_NOT_SUPPORT");
  // Fees in the insurance figure and not ours: ours gains 15% first, and then the two agree.
  const fees = M.insuranceCrossCheck({ ours: { amount: 2000000, date: "2026-03-01", includes: { demolition: true, fees: false, prelims: true } },
    insurance: { amount: 2300000, date: "2026-03-01", includes: same }, adjustments: { fees_rate: 0.15 } }, T);
  assert.equal(fees.verdict, "SUPPORTS");
  assert.equal(near(fees.ours_adjusted, 2300000, 1e-6), true);
  // An older insurance figure is brought to our date by the index before comparing.
  const dated = M.insuranceCrossCheck({ ours: { amount: 396000, date: "2026-03-01", includes: same }, insurance: { amount: 322000, date: "2021-06-30", includes: same } }, T);
  assert.equal(dated.verdict, "SUPPORTS");
  assert.ok(dated.steps.some(x => /brought from 2021-06-30 to 2026-03-01/.test(x)));
  const unknown = M.insuranceCrossCheck({ ours: { amount: 2000000, date: "2026-03-01", includes: same }, insurance: { amount: 2000000, date: "2026-03-01", includes: { demolition: true, fees: null, prelims: true } } }, T);
  assert.equal(unknown.verdict, "NOT_COMPARABLE", "N4: an unknown never lets it support ours");
  const noAdj = M.insuranceCrossCheck({ ours: { amount: 2000000, date: "2026-03-01", includes: { demolition: false, fees: true, prelims: true } }, insurance: { amount: 2000000, date: "2026-03-01", includes: same } }, T);
  assert.equal(noAdj.verdict, "NOT_COMPARABLE");
  assert.equal(M.INSURANCE_SUPPORT_LIMIT_TEST, 0.10);
  assert.ok(!/corroborat/i.test(JSON.stringify([s, far, fees, dated, unknown, noAdj])));
});

/* The past claim, GC-01 (02-modules-and-build-prep/Build-Prep-Care-Homes-Estimate-Engine-Specification.md §9): its
   delivered replacement costs and land, put through the model's apportionment. What can be tested without the original
   quantities is the apportionment itself, and that is what this tests. */
const PAST_CLAIMS = [
  { id: "GC-01", status: "CASE", tuned: "possibly: the flat 15% fees may have been back-solved to it (see the fees note)",
    input: { purchase_consideration: 2706000, land_value_estimate: 838860, prelims_rate: 0, fees_rate: 0,
      elements: [
        { element_ref: "gc01_main", pool: "main", qty: 1, rate: 1320841 * 475641 / 1036124 },
        { element_ref: "gc01_special", pool: "special", qty: 1, rate: 1320841 - 1320841 * 475641 / 1036124 },
        { element_ref: "gc01_building", pool: "nonqual", qty: 1, rate: 1289881 }] },
    expected: { money: { qualifying: 1036124, main: 475641, special: 560483, A: 1320841, B: 1289881 }, split: 0.78 } },
  { id: "UNTUNED-1", status: "EMPTY_SLOT",
    why: "a second finished claim that nothing was tuned to, added the day one closes with the surveyor's agreement (Word question 139)" }
];

test("P153e-5 (q139) THE PAST CLAIM: GC-01 within 5% AND within GBP 25,000 on every money figure, and within 0.01 on the split", () => {
  const c = PAST_CLAIMS[0];
  const r = M.residualApportionment(c.input);
  const actual = { money: { qualifying: r.qualifying_pm.low, main: r.qualifying_pools.low.main, special: r.qualifying_pools.low.special,
    A: r.components.A, B: r.components.B }, split: r.multiplier.at_low_land };
  const v = M.pastClaimWithin(c.expected, actual);
  assert.deepEqual(v.misses, []);
  assert.equal(v.passes, true);
  assert.deepEqual(M.PAST_CLAIM_LIMITS_TEST, { pct: 0.05, pounds: 25000, split: 0.01 });
});

test("P153e-6 (q139) the limits bite: 6% off fails on the percentage, GBP 30,000 off on a big figure fails on the pounds, 0.02 off fails on the split", () => {
  const e = { money: { qualifying: 1000000 }, split: 0.78 };
  assert.equal(M.pastClaimWithin(e, { money: { qualifying: 1060000 }, split: 0.78 }).passes, false);
  assert.equal(M.pastClaimWithin({ money: { qualifying: 10000000 } }, { money: { qualifying: 10030000 } }).passes, false, "0.3% but GBP 30,000");
  assert.equal(M.pastClaimWithin(e, { money: { qualifying: 1000000 }, split: 0.80 }).passes, false);
  assert.equal(M.pastClaimWithin(e, { money: {}, split: 0.78 }).passes, false, "a missing figure is a miss, never a pass");
  assert.equal(M.pastClaimWithin(e, { money: { qualifying: 1020000 }, split: 0.785 }).passes, true);
});

test("P153e-7 (q139) the slot for a second, untuned case is there and empty, and it is never counted as a pass", () => {
  const slot = PAST_CLAIMS.find(c => c.status === "EMPTY_SLOT");
  assert.ok(slot);
  assert.match(slot.why, /nothing was tuned to/);
  assert.equal(PAST_CLAIMS.filter(c => c.status === "CASE").length, 1, "one real case; the second is not invented");
});
