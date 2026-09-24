/* =============================================================================
   CAPREBATE — JOB ECONOMICS, TESTS (Phase 9)

   Board 18422317809. Item 12955448913.

   Run:  node --test caprebate-job-economics.test.cjs

   ---------------------------------------------------------------------------
   THREE THINGS THESE TESTS DO THAT ORDINARY UNIT TESTS DO NOT.

   1. THEY HOLD THE COST BASE TO THE BUSINESS PLAN MODEL. SECTOR_DIRECT is a
      copy of constants in 03-app/caprebate-business-plan-model.cjs. That file
      is a SCRIPT — requiring it prints a report — so it cannot be imported.
      Suite B parses it instead and asserts every number agrees. Change one
      copy and this fails until you change the other.

   2. THEY HOLD THE FEE RATE TO THE SHIPPED ENGINE. The module defines no fee
      rate on purpose. Suite E loads CB_FEE and CB_BENEFIT out of
      "Caprebate site.html" the same way 03-app/caprebate-regression.cjs does,
      and cross-checks against the REAL fee guard rather than a copy of it.

   3. THEY REPRODUCE A PUBLISHED DOCUMENT. Suite F asserts every cell of the
      cost tables in "Minimum fee — the research" (28 August 2026). Those
      figures were published from an uncommitted parameter variation; if this
      suite goes red, either the model changed or the paper is now wrong, and
      the failure says which cell.

   UNKNOWN IS NOT A BRANCH. Suite D tests BOTH the "not supplied" case and the
   explicitly-undefined case, because a suite that tests only one leaves the
   other uncovered and everything else goes on passing.
   ============================================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const M = require("./caprebate-job-economics.cjs");

const near = (a, b, tol) => Math.abs(a - b) < (tol === undefined ? 1e-9 : tol);

/* PHASE 132e (16 September 2026). Two fee rates appear in this file and they
   must never be confused.
     RATE      the rate we charge: a flat 3% of allowances identified, decided
               by Lakhbir (answer read 15 September 2026). E8 asserts it is the
               shipped engine's CB_FEE.RATE, so it is not an invention of this
               suite. Every CURRENT figure below is computed on it.
     OLD_RATE  5%, the rate the published papers were written on. It is used
               ONLY where a test reproduces a published figure to prove the
               model could have produced it (C6, G3, G4, G9), and each such test
               says so. It is a record, not a price. */
const RATE = 0.03;
const OLD_RATE = 0.05;
const codeOf = fn => { try { fn(); return "NO_THROW"; } catch (e) { return e.code || e.name; } };

/* Locate files by walking up, so this passes whether it is run from
   04-phase-work/phase9 (the Mac, where the junctions did not survive the sync)
   or through the 03-app/phase9 junction (the Acer). Reading the link text is
   not enough; this traverses. */
function findUp(rel, maxUp) {
  let dir = __dirname;
  for (let i = 0; i <= (maxUp || 6); i++) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/* ===========================================================================
   SUITE A — the cost arithmetic, checkable by eye
   =========================================================================== */

test("A1 direct cost, surveyor-visit dental, is the four lines added up", () => {
  /* 1500 surveyor + 600 CTA + 8h x 60 + 50 data */
  assert.equal(M.directCost("dental", "SURVEYOR_VISIT"), 2630);
});

test("A2 direct cost, desk-only dental, applies the route to every line", () => {
  /* 600 flat surveyor + 600 x 0.25 CTA + 4h x 60 + 50 data */
  assert.equal(M.directCost("dental", "DESK_ONLY"), 1040);
});

test("A3 direct cost, straight-through dental", () => {
  /* 60 + 600 x 0.05 + 1h x 60 + 50 */
  assert.equal(M.directCost("dental", "STRAIGHT_THROUGH"), 200);
});

test("A4 the failed-enquiry drag is three failures at the route's desk hours", () => {
  assert.equal(M.failedEnquiryDrag("SURVEYOR_VISIT", {}), 360);
  assert.equal(M.failedEnquiryDrag("DESK_ONLY", {}), 180);
  assert.equal(M.failedEnquiryDrag("STRAIGHT_THROUGH", {}), 45);
});

test("A5 the drag exceeds the entire straight-through delivery cost", () => {
  /* Called out in the research as easy to miss, so it is pinned. */
  assert.ok(M.failedEnquiryDrag("SURVEYOR_VISIT", {}) > M.directCost("dental", "STRAIGHT_THROUGH"));
});

test("A6 a better conversion rate reduces the drag", () => {
  const base = M.failedEnquiryDrag("SURVEYOR_VISIT", { conversionRate: 0.25 });
  const better = M.failedEnquiryDrag("SURVEYOR_VISIT", { conversionRate: 0.5 });
  assert.ok(better < base);
  assert.equal(better, 120);   /* (1/0.5 - 1) x 2 x 60 */
});

test("A7 loaded cost is direct + drag + overhead per job", () => {
  const c = M.loadedCost("dental", "SURVEYOR_VISIT", 25, {});
  assert.equal(c.overhead_per_job, 2400);      /* 60000 / 25 */
  assert.equal(c.marginal, 2990);
  assert.equal(c.loaded, 5390);
});

test("A8 the founder salary is off unless asked for, and doubles the overhead", () => {
  const plain = M.loadedCost("dental", "SURVEYOR_VISIT", 25, {});
  const salaried = M.loadedCost("dental", "SURVEYOR_VISIT", 25,
                                { includeFounderSalary: true });
  assert.equal(plain.includes_founder_salary, false);
  assert.equal(salaried.includes_founder_salary, true);
  assert.equal(salaried.loaded, 7790);
  assert.equal(salaried.loaded - plain.loaded, 2400);
});

test("A9 the overhead placeholder is flagged as one until a real figure is passed", () => {
  assert.equal(M.loadedCost("dental", "DESK_ONLY", 100, {}).overhead_is_placeholder, true);
  assert.equal(
    M.loadedCost("dental", "DESK_ONLY", 100, { overheadPerYear: 84000 })
      .overhead_is_placeholder, false);
});

test("A10 overhead per job dominates at low volume — automation is a volume play", () => {
  /* The single most important finding in the published research, pinned so a
     refactor cannot quietly reverse it. */
  const s1at25 = M.loadedCost("dental", "SURVEYOR_VISIT", 25, { includeFounderSalary: true }).loaded;
  const s3at25 = M.loadedCost("dental", "STRAIGHT_THROUGH", 25, { includeFounderSalary: true }).loaded;
  const s1at200 = M.loadedCost("dental", "SURVEYOR_VISIT", 200, { includeFounderSalary: true }).loaded;
  /* At 25 jobs the most and least automated routes are closer to each other
     than the most automated route is to itself at 200 jobs. */
  assert.ok((s1at25 - s3at25) < (s1at25 - s1at200) * 1.05);
  assert.ok(s3at25 > s1at200);
});

test("A11 unknown sector and unknown route are refused, not defaulted", () => {
  assert.equal(codeOf(() => M.directCost("veterinary", "DESK_ONLY")), "E_UNKNOWN_SECTOR");
  assert.equal(codeOf(() => M.directCost("dental", "DESKTOP")), "E_UNKNOWN_ROUTE");
});

test("A12 nonsensical volumes and conversion rates are refused", () => {
  assert.equal(codeOf(() => M.loadedCost("dental", "DESK_ONLY", 0, {})), "E_BAD_VOLUME");
  assert.equal(codeOf(() => M.loadedCost("dental", "DESK_ONLY", -5, {})), "E_BAD_VOLUME");
  assert.equal(codeOf(() => M.failedEnquiryDrag("DESK_ONLY", { conversionRate: 0 })), "E_BAD_CONVERSION");
  assert.equal(codeOf(() => M.failedEnquiryDrag("DESK_ONLY", { conversionRate: 1.5 })), "E_BAD_CONVERSION");
});

/* ===========================================================================
   SUITE B — the cost base agrees with the business plan model
   =========================================================================== */

test("B1 the business plan model is findable from wherever this suite is run", () => {
  assert.ok(findUp(path.join("03-app", "caprebate-business-plan-model.cjs")),
            "03-app/caprebate-business-plan-model.cjs not found by walking up from " + __dirname);
});

test("B2 SECTOR_DIRECT matches the business plan model's DIRECT table exactly", () => {
  const p = findUp(path.join("03-app", "caprebate-business-plan-model.cjs"));
  const src = fs.readFileSync(p, "utf8");

  /* Parse the four DIRECT rows rather than requiring the file: requiring it
     runs a script that prints a report. */
  const found = {};
  const re = /(\w+):\s*\{\s*surveyor:\s*(\d+),\s*cta:\s*(\d+),\s*hours:\s*(\d+),\s*rate:\s*(\d+),\s*data:\s*(\d+)\s*\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    found[m[1]] = { surveyor: +m[2], cta: +m[3], hours: +m[4], rate: +m[5], data: +m[6] };
  }

  assert.deepEqual(Object.keys(found).sort(), M.SECTORS.slice().sort(),
                   "the two files no longer describe the same sectors");
  M.SECTORS.forEach(s => {
    assert.deepEqual(found[s], M.SECTOR_DIRECT[s],
      `SECTOR_DIRECT.${s} has drifted from the business plan model`);
  });
});

test("B3 the negative control — the parse would actually notice a change", () => {
  /* A test that cannot fail is not a test. This proves B2's comparison bites. */
  const wrong = Object.assign({}, M.SECTOR_DIRECT.dental, { surveyor: 1501 });
  assert.notDeepEqual(wrong, M.SECTOR_DIRECT.dental);
});

test("B4 the surveyor-visit route uses the sector's own surveyor cost", () => {
  M.SECTORS.forEach(s => {
    assert.equal(M.surveyorCost(s, "SURVEYOR_VISIT"), M.SECTOR_DIRECT[s].surveyor);
  });
});

test("B5 THE FINDING — the desk routes are sector-invariant, and it is flagged", () => {
  /* Not a bug to fix here. A finding to carry, and it must stay visible. */
  const desk = M.SECTORS.map(s => M.surveyorCost(s, "DESK_ONLY"));
  assert.equal(new Set(desk).size, 1, "desk-only surveyor cost now varies by sector");

  const visit = M.SECTORS.map(s => M.surveyorCost(s, "SURVEYOR_VISIT"));
  assert.ok(new Set(visit).size > 1, "the visit route should vary by sector");
  assert.ok(Math.max(...visit) / Math.min(...visit) > 2,
            "the published 2.2x spread across sectors has gone");

  assert.equal(M.SECTOR_INVARIANT_SURVEYOR.is_a_finding, true);
  assert.ok(M.SECTOR_INVARIANT_SURVEYOR.applies_to.includes("DESK_ONLY"));
  assert.equal(M.SECTOR_INVARIANT_SURVEYOR.raised_as, "Q92");
});

/* ===========================================================================
   SUITE C — break-even: where each route stops paying for itself
   =========================================================================== */

test("C1 break-even allowances is loaded cost over the fee rate", () => {
  const b = M.breakEvenAllowances("dental", "SURVEYOR_VISIT", 25, RATE, {});
  assert.equal(b.loaded_cost, 5390);
  assert.ok(near(b.break_even_allowances, 179666.67, 0.01));   /* 5390 / 0.03 */
  assert.equal(b.fee_basis, "allowances identified");
});

test("C2 desk-only breaks even on a much smaller job than a visit", () => {
  const desk = M.breakEvenAllowances("dental", "DESK_ONLY", 100, RATE, {});
  const visit = M.breakEvenAllowances("dental", "SURVEYOR_VISIT", 100, RATE, {});
  assert.ok(desk.break_even_allowances < visit.break_even_allowances);
  assert.ok(near(desk.break_even_allowances, 60666.67, 0.01));    /* 1820 / 0.03 */
  assert.ok(near(visit.break_even_allowances, 119666.67, 0.01));  /* 3590 / 0.03 */
});

test("C3 the fee rate must be passed — this module defines none", () => {
  assert.equal(codeOf(() => M.breakEvenAllowances("dental", "DESK_ONLY", 100, undefined, {})),
               "E_BAD_FEE_RATE");
  assert.equal(codeOf(() => M.breakEvenAllowances("dental", "DESK_ONLY", 100, 0, {})),
               "E_BAD_FEE_RATE");
  assert.equal(codeOf(() => M.breakEvenAllowances("dental", "DESK_ONLY", 100, 5, {})),
               "E_BAD_FEE_RATE");
});

test("C4 a target margin raises the break-even proportionally", () => {
  const at0 = M.breakEvenAllowances("gp", "DESK_ONLY", 100, RATE, {});
  const at25 = M.breakEvenAllowances("gp", "DESK_ONLY", 100, RATE, { targetMargin: 0.25 });
  assert.ok(near(at25.break_even_allowances_at_margin,
                 at0.break_even_allowances * 1.25, 1e-6));
});

test("C5 the sector yield must be injected, never taken from this file", () => {
  assert.equal(codeOf(() => M.breakEvenPurchasePrice("dental", "DESK_ONLY", 100, RATE, undefined, {})),
               "E_BAD_YIELD");
  const p = M.breakEvenPurchasePrice("dental", "SURVEYOR_VISIT", 100, RATE, 0.225, {});
  assert.ok(near(p.break_even_purchase_price, (3590 / RATE) / 0.225, 1e-6));
});

test("C6 THE BASIS CHANGE — the published purchase prices are stale, and by how much", () => {
  /* The research published £797,778 for dental / S1 / 100 jobs, on 5% of
     LIFETIME RELIEF at a 40% rate. OLD_RATE reproduces that published figure;
     the basis is now allowances identified. */
  const r = M.reportsBasisChange("dental", "SURVEYOR_VISIT", 100, OLD_RATE, 0.225, 0.40, {});
  assert.ok(near(r.break_even_purchase_price_on_old_basis, 797777.78, 0.5),
            "the old basis no longer reproduces the published £797,778");
  assert.ok(near(r.break_even_purchase_price_now, 319111.11, 0.5));
  assert.equal(r.factor, 2.5);
  /* And the direction is in our favour, which is the counter-intuitive part. */
  assert.ok(r.break_even_purchase_price_now < r.break_even_purchase_price_on_old_basis);
  /* PHASE 132e. At the decided 3% the same job breaks even at £531,852 - higher
     than at 5% of allowances, and still below the published lifetime figure. */
  const at3 = M.reportsBasisChange("dental", "SURVEYOR_VISIT", 100, RATE, 0.225, 0.40, {});
  assert.ok(near(at3.break_even_purchase_price_now, 531851.85, 0.01));
  assert.ok(at3.break_even_purchase_price_now < 797777.78);
});

test("C7 the basis change is worse for company clients, because the rate is lower", () => {
  const unincorp = M.reportsBasisChange("dental", "SURVEYOR_VISIT", 100, RATE, 0.225, 0.40, {});
  const company = M.reportsBasisChange("dental", "SURVEYOR_VISIT", 100, RATE, 0.225, 0.25, {});
  assert.equal(company.factor, 4);
  assert.ok(company.break_even_purchase_price_on_old_basis >
            unincorp.break_even_purchase_price_on_old_basis);
  /* On the CURRENT basis the client's tax rate does not enter our break-even
     at all, which is the substantive consequence of the Q55 decision. */
  assert.equal(company.break_even_purchase_price_now,
               unincorp.break_even_purchase_price_now);
});

test("C8 a bad marginal tax rate is refused", () => {
  assert.equal(codeOf(() => M.reportsBasisChange("dental", "DESK_ONLY", 100, RATE, 0.225, 0, {})),
               "E_BAD_TAX_RATE");
});

/* ===========================================================================
   SUITE D — the Homedata parameter. UNKNOWN IS NOT A BRANCH.

   Rewritten 24 September 2026 by Phase 147. The address lookup is a cost of a
   SIGNED job, once per property (Lakhbir's rule of 4 September 2026: a paid
   call fires only after the letter is signed and a member of staff clicks).
   It was modelled as a cost spent before signature and charged four times
   over to the enquiries that fail. D6 and D11 hold the correction; D1 to D5,
   D7 and D8 still hold the null, and still prove null and zero differ.
   =========================================================================== */

test("D1 the parameter exists, is named, and has no value", () => {
  assert.ok("homedata_cost_per_lookup" in M.PARAMS);
  assert.equal(M.PARAMS.homedata_cost_per_lookup, null);
});

test("D2 not supplied — the cost is flagged unknown and is NOT zero", () => {
  const p = M.addressLookupCost({ properties: 1 });
  assert.equal(p.known, false);
  assert.equal(p.parameter, "homedata_cost_per_lookup");
  /* The property that matters: reading .cost gives undefined, never 0. */
  assert.equal(p.cost, undefined);
  assert.notEqual(p.cost, 0);
  /* It names the question that holds the price, by its title... */
  assert.ok(/How much does a Homedata address lookup cost us each time\?/.test(p.why));
  /* ...and it no longer gives the dead reason for the blank. */
  assert.ok(!/before a client signs|before the gate|Q93/.test(p.why));
  assert.ok(/after the engagement letter is signed/.test(p.when));
});

test("D3 explicitly undefined behaves identically to not supplied", () => {
  /* The state of every caller who never passed the option at all. A suite that
     covers only one of these leaves the other silently uncovered. */
  const a = M.addressLookupCost({ properties: 3 });
  const b = M.addressLookupCost({ properties: 3, homedataCostPerLookup: undefined });
  const c = M.addressLookupCost({ properties: 3, homedataCostPerLookup: null });
  assert.equal(a.known, false);
  assert.equal(b.known, false);
  assert.equal(c.known, false);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.deepEqual(Object.keys(a).sort(), Object.keys(c).sort());
});

test("D4 loaded cost never folds an unknown address lookup into the headline", () => {
  const c = M.loadedCost("dental", "DESK_ONLY", 100, { properties: 11 });
  assert.equal(c.address_lookup.known, false);
  assert.equal(c.loaded_including_address_lookup, null);
  /* And the headline is unchanged by the unknown, rather than nudged by it. */
  assert.equal(c.loaded, M.loadedCost("dental", "DESK_ONLY", 100, {}).loaded);
});

test("D5 the break-even including the address lookup stays null while it is unknown", () => {
  const b = M.breakEvenAllowances("dental", "DESK_ONLY", 100, RATE, { properties: 4 });
  assert.equal(b.address_lookup_known, false);
  assert.equal(b.break_even_allowances_including_address_lookup, null);
  /* Never silently equal to the figure that excludes it. */
  assert.notEqual(b.break_even_allowances_including_address_lookup,
                  b.break_even_allowances);
});

test("D6 supplied — once per property of the signed job, and nothing charged to enquiries that failed", () => {
  const p = M.addressLookupCost({ properties: 11, homedataCostPerLookup: 2.5 });
  assert.equal(p.known, true);
  assert.equal(p.lookups, 11);
  assert.equal(p.cost, 27.5);
  /* The old model divided this by the conversion rate - 4x the truth, charged
     to enquiries that never signed and so cannot have spent a lookup. Gone,
     not relabelled, and the conversion rate does not move the figure. */
  assert.ok(!("cost_per_conversion" in p));
  const atOneInTen = M.addressLookupCost({ properties: 11, homedataCostPerLookup: 2.5,
                                          conversionRate: 0.1 });
  assert.equal(atOneInTen.cost, 27.5);
  /* And the failed-enquiry drag is untouched by the lookup price. */
  const withLookup = M.loadedCost("dental", "SURVEYOR_VISIT", 100,
                                  { properties: 11, homedataCostPerLookup: 2.5 });
  const without = M.loadedCost("dental", "SURVEYOR_VISIT", 100, {});
  assert.equal(withLookup.failed_enquiry_drag, without.failed_enquiry_drag);
});

test("D7 supplied — it flows through to loaded cost and to break-even", () => {
  const c = M.loadedCost("dental", "DESK_ONLY", 100, { properties: 2, homedataCostPerLookup: 3 });
  assert.equal(c.address_lookup.known, true);
  assert.equal(c.loaded_including_address_lookup, c.loaded + 6);
  const b = M.breakEvenAllowances("dental", "DESK_ONLY", 100, RATE,
                                  { properties: 2, homedataCostPerLookup: 3 });
  assert.equal(b.address_lookup_known, true);
  assert.ok(b.break_even_allowances_including_address_lookup > b.break_even_allowances);
});

test("D8 a zero cost per lookup is KNOWN and is not the same as unknown", () => {
  /* The distinction the whole rule rests on: "free" is an answer, "we have not
     asked" is not, and they must not collapse into each other. */
  const zero = M.addressLookupCost({ properties: 5, homedataCostPerLookup: 0 });
  const unknown = M.addressLookupCost({ properties: 5 });
  assert.equal(zero.known, true);
  assert.equal(zero.cost, 0);
  assert.equal(unknown.known, false);
  assert.notEqual(zero.known, unknown.known);
});

test("D9 a nonsensical property count is refused rather than coerced", () => {
  assert.equal(codeOf(() => M.addressLookupCost({ properties: 0 })), "E_BAD_PROPERTY_COUNT");
  assert.equal(codeOf(() => M.addressLookupCost({ properties: 2.5 })), "E_BAD_PROPERTY_COUNT");
  assert.equal(codeOf(() => M.addressLookupCost({ properties: -1 })), "E_BAD_PROPERTY_COUNT");
});

test("D11 nothing in the module still calls the lookup a pre-signature cost", () => {
  /* Phase 147. The name was the claim, so the name is what is tested. */
  assert.equal(M.preSignatureCost, undefined);
  const keysOf = o => JSON.stringify(Object.keys(o));
  const opts = { properties: 2, homedataCostPerLookup: 3 };
  for (const o of [M.loadedCost("dental", "DESK_ONLY", 100, opts),
                   M.breakEvenAllowances("dental", "DESK_ONLY", 100, RATE, opts),
                   M.costingForGate("dental", "SURVEYOR_VISIT", 120, opts)]) {
    assert.ok(!/pre_signature/.test(keysOf(o)), keysOf(o));
  }
  assert.equal(M.costingForGate("dental", "SURVEYOR_VISIT", 120, opts)
                 .loaded_including_address_lookup,
               M.costingForGate("dental", "SURVEYOR_VISIT", 120, {}).loaded + 6);
});

test("D10 the other unpriced parameters are named and empty too", () => {
  assert.equal(M.PARAMS.overhead_per_year, null);
  assert.equal(M.PARAMS.surveyor_review_and_sign_quote, null);
  assert.equal(M.PARAMS.desk_defensibility_answer, null);
});

/* ===========================================================================
   SUITE E — routing, the refusal, and the cross-check against the REAL fee guard
   =========================================================================== */

test("E1 a small job is declined because it fails to cover marginal cost", () => {
  /* Cheapest marginal on dental is desk-only at £1,220; £20,000 of allowances
     at 3% is a £600 fee, well below it. */
  const d = M.routeDecision("dental", 20000, 25, RATE, {});   /* fee £600 */
  assert.equal(d.determined, true);
  assert.ok(near(d.fee, 600, 1e-9));
  assert.equal(d.should_decline, true);
  assert.ok(/loses money however it is run/.test(d.decline_reason));
});

test("E2 the thin band — covers the work but not its share of overhead", () => {
  /* fee must sit between desk-only marginal (1220) and desk-only loaded. */
  const loaded = M.loadedCost("dental", "DESK_ONLY", 25, {}).loaded;   /* 3620 */
  const fee = (1220 + loaded) / 2;
  const d = M.routeDecision("dental", fee / RATE, 25, RATE, {});
  assert.equal(d.should_decline, false);
  assert.equal(d.thin_band, true);
  assert.ok(/not worth building a book of/.test(d.thin_band_note));
});

test("E3 a large job is neither declined nor thin", () => {
  const d = M.routeDecision("dental", 400000, 100, RATE, {});   /* fee £12,000 */
  assert.equal(d.should_decline, false);
  assert.equal(d.thin_band, false);
  assert.equal(d.routes.DESK_ONLY.covers_loaded_cost, true);
  assert.equal(d.routes.SURVEYOR_VISIT.covers_loaded_cost, true);
});

test("E4 THE REFUSAL — no route is recommended while the surveyor question is open", () => {
  assert.equal(M.DESK_DEFENSIBILITY_ANSWERED, false);
  const d = M.routeDecision("care_home", 800000, 100, RATE, {});
  assert.equal(d.recommendation, null);
  assert.ok(/without standing in it/.test(d.recommendation_withheld_because));
  /* But both routes' economics ARE given — refusing to choose is not refusing
     to compute. */
  assert.ok(d.routes.DESK_ONLY.loaded_cost > 0);
  assert.ok(d.routes.SURVEYOR_VISIT.loaded_cost > 0);
});

test("E5 unknown allowances is not zero allowances", () => {
  ["", null, undefined, NaN].forEach(v => {
    const d = M.routeDecision("dental", v, 100, RATE, {});
    assert.equal(d.determined, false, `allowances=${String(v)} should not determine`);
    assert.equal(d.recommendation, null);
    assert.equal(d.routes, null);
    /* Crucially, an absent figure must NOT arrive at should_decline:true — an
       un-costed case is not a case we refuse. */
    assert.notEqual(d.should_decline, true);
  });
});

test("E6 straight-through is carried but flagged unpriceable", () => {
  assert.equal(M.ROUTES.STRAIGHT_THROUGH.priceable, false);
  assert.equal(M.ROUTES.DESK_ONLY.priceable, true);
  assert.equal(M.ROUTES.SURVEYOR_VISIT.priceable, true);
  /* And it is not one of the routes routeDecision will consider. */
  const d = M.routeDecision("dental", 400000, 100, RATE, {});
  assert.deepEqual(Object.keys(d.routes).sort(), ["DESK_ONLY", "SURVEYOR_VISIT"]);
});

/* ---- the shipped engine, loaded exactly as the regression harness does ---- */

const SITE = findUp(path.join("..", "Caprebate site.html"), 6)
          || findUp("Caprebate site.html", 6);

function loadEngine() {
  const src = fs.readFileSync(SITE, "utf8");
  const layerSrc = src.slice(src.indexOf("var CB_PLANT"), src.indexOf("var CB_BOOKING"));
  return new Function(layerSrc +
    "; return {CB_FEE:CB_FEE, CB_FEEGUARD:CB_FEEGUARD, CB_BENEFIT:CB_BENEFIT, "+
    "CB_GATE_CONFIG:CB_GATE_CONFIG, CB_GATE:CB_GATE};")();
}

test("E7 the shipped engine is reachable from this suite", () => {
  assert.ok(SITE, "Caprebate site.html not found by walking up from " + __dirname);
  const E = loadEngine();
  assert.ok(E.CB_FEE && E.CB_BENEFIT && E.CB_FEEGUARD);
});

test("E8 THE FEE RATE IS THE ENGINE'S, and this module restates none", () => {
  const E = loadEngine();
  /* PHASE 132e: the flat 3%. And this suite's RATE is that rate, not a copy
     that could drift from it. */
  assert.equal(E.CB_FEE.RATE, 0.03);
  assert.equal(RATE, E.CB_FEE.RATE);
  /* The module must not carry a copy of it anywhere.

     Precise on purpose. An earlier version of this assertion banned the literal
     0.05 outright and failed on ROUTES.STRAIGHT_THROUGH.cta_share, which is a
     CTA review share and has nothing to do with the fee. A guard that fires on
     an unrelated constant gets deleted rather than fixed, and then nothing
     guards the thing that mattered. So: a fee rate is a numeric literal on a
     line that talks about fees. */
  const own = fs.readFileSync(path.join(__dirname, "caprebate-job-economics.cjs"), "utf8");
  const body = own.slice(own.indexOf('"use strict"'));
  const offenders = body.split("\n").filter(l =>
    /\bfee[_A-Za-z]*\s*[:=]\s*0?\.\d/i.test(l) || /\bFEE_RATE\b\s*=/.test(l));
  assert.deepEqual(offenders, [],
    "the fee rate has been hard-coded into the module; it must be injected");

  /* And the negative control: the guard can actually fire. */
  const planted = ["var FEE_RATE = 0.05;", "  fee_rate: 0.05,"];
  planted.forEach(l => assert.ok(
    /\bfee[_A-Za-z]*\s*[:=]\s*0?\.\d/i.test(l) || /\bFEE_RATE\b\s*=/.test(l),
    "the guard would not notice: " + l));
});

test("E9 both fee-guard switches are still off, and this phase did not touch them", () => {
  const E = loadEngine();
  assert.equal(E.CB_FEEGUARD.fee_cap_at_year_one_benefit, false);
  assert.equal(E.CB_FEEGUARD.fee_warn_when_exceeds_benefit, false);
});

test("E10 CROSS-CHECK — the mutual-loss band exists, on a real CB_BENEFIT comparison", () => {
  const E = loadEngine();
  /* A small company-held job. At 5% the fee guard established that a company
     client's year-one benefit fell short of the fee at any pool split; at 3%
     it depends on the split (see E11), so this job's band may be UNDETERMINED
     and that is a correct answer. */
  const allowances = 30000;
  const fee = allowances * E.CB_FEE.RATE;                 /* £900 */
  const assessment = E.CB_BENEFIT.assess({ allowances: allowances, tax_rate: 0.25 });
  const comparison = E.CB_BENEFIT.compare(fee, assessment);

  const decision = M.routeDecision("dental", allowances, 25, E.CB_FEE.RATE, {});
  const band = M.classifyBand(decision, comparison);

  /* Our side: a £900 fee does not cover £1,220 marginal. */
  assert.equal(decision.should_decline === true || decision.thin_band === true, true);
  /* The band names both sides rather than only ours. */
  assert.ok(["MUTUAL_LOSS", "DECLINE", "UNDETERMINED"].includes(band.band));
  assert.ok(band.our_side === "DECLINE" || band.our_side === "THIN");
});

test("E11 the band carries BOTH break-even fee rates, so the trade-off is visible", () => {
  const E = loadEngine();
  const allowances = 60000;
  const fee = allowances * E.CB_FEE.RATE;
  /* PHASE 132e. At 3% the fee sits inside the undetermined range, which would
     make the band UNDETERMINED and carry no rates at all; so the pool split
     and period are supplied, which is the case the rates are for. */
  const cmp = E.CB_BENEFIT.compare(
    fee, E.CB_BENEFIT.assess({ main: allowances, special: 0, tax_rate: 0.25,
                               period_start: "2025-04-01", is_company: true }));
  const band = M.classifyBand(M.routeDecision("dental", allowances, 100, E.CB_FEE.RATE, {}), cmp);

  assert.ok(typeof band.fee_rate_we_need_on_cheapest_route === "number");
  /* Where the client's break-even rate is BELOW ours, no single rate satisfies
     both sides. That is a finding, not a discount to negotiate. */
  assert.ok(band.no_rate_satisfies_both === true ||
            band.no_rate_satisfies_both === false ||
            band.no_rate_satisfies_both === null);
});

test("E12 a null verdict from the fee guard is not read as false", () => {
  /* CB_BENEFIT returns null when the ends of its range disagree. Null must
     reach UNDETERMINED, never AHEAD_YEAR_ONE. */
  const decision = M.routeDecision("dental", 400000, 100, RATE, {});
  const band = M.classifyBand(decision, { computed: true, fee_exceeds_year_one_benefit: null,
                                          unknowns: ["pool split"] });
  assert.equal(band.band, "UNDETERMINED");
  assert.equal(band.client_side, "unknown");
  assert.deepEqual(band.what_would_settle_it, ["pool split"]);
});

test("E13 an uncomputed comparison is undetermined, not sound", () => {
  const decision = M.routeDecision("dental", 400000, 100, RATE, {});
  assert.equal(M.classifyBand(decision, { computed: false }).band, "UNDETERMINED");
  assert.equal(M.classifyBand(decision, null).band, "UNDETERMINED");
  assert.equal(M.classifyBand(null, null).band, "UNDETERMINED");
});

test("E14 every band is reachable and each has a description", () => {
  const D = (dec, exceeds) => M.classifyBand(dec, { computed: true,
    fee_exceeds_year_one_benefit: exceeds, breakeven_fee_rate_year_one: 0.04 }).band;

  const tiny = M.routeDecision("dental", 20000, 25, RATE, {});      /* declines */
  const big = M.routeDecision("dental", 400000, 100, RATE, {});     /* sound */
  const loaded = M.loadedCost("dental", "DESK_ONLY", 25, {}).loaded;
  const thin = M.routeDecision("dental", ((1220 + loaded) / 2) / RATE, 25, RATE, {});

  assert.equal(D(tiny, true), "MUTUAL_LOSS");
  assert.equal(D(tiny, false), "DECLINE");
  assert.equal(D(thin, true), "MUTUAL_LOSS");
  assert.equal(D(thin, false), "US_THIN_ONLY");
  assert.equal(D(big, true), "CLIENT_POOR_ONLY");
  assert.equal(D(big, false), "SOUND");
  Object.keys(M.BANDS).forEach(b => assert.ok(M.BANDS[b].length > 0));
});

/* ===========================================================================
   SUITE F — the published paper is now re-derivable
   =========================================================================== */

test("F1 marginal cost per job reproduces the published table exactly", () => {
  const p = M.reproducePublishedPaper();
  assert.equal(p.marginal.S1, 2990);
  assert.equal(p.marginal.S2, 1220);
  assert.equal(p.marginal.S3, 245);
});

test("F2 loaded cost, overhead £60k with no founder salary, all twelve cells", () => {
  const p = M.reproducePublishedPaper();
  assert.deepEqual(p.loaded.S1, { 25: 5390, 50: 4190, 100: 3590, 200: 3290 });
  assert.deepEqual(p.loaded.S2, { 25: 3620, 50: 2420, 100: 1820, 200: 1520 });
  assert.deepEqual(p.loaded.S3, { 25: 2645, 50: 1445, 100: 845, 200: 545 });
});

test("F3 loaded cost including a £60,000 founder salary, all twelve cells", () => {
  const p = M.reproducePublishedPaper();
  assert.deepEqual(p.loaded_with_salary.S1, { 25: 7790, 50: 5390, 100: 4190, 200: 3590 });
  assert.deepEqual(p.loaded_with_salary.S2, { 25: 6020, 50: 3620, 100: 2420, 200: 1820 });
  assert.deepEqual(p.loaded_with_salary.S3, { 25: 5045, 50: 2645, 100: 1445, 200: 845 });
});

test("F4 the minimum fee each scenario implies at a 25% margin", () => {
  const p = M.reproducePublishedPaper();
  assert.ok(near(p.minimum_fee_at_margin.S1[25], 6737.5, 0.51));
  assert.ok(near(p.minimum_fee_at_margin.S2[100], 2275, 0.51));
  assert.ok(near(p.minimum_fee_at_margin.S3[200], 681.25, 0.51));
});

test("F5 the £500 test — straight-through at 200 jobs is still short", () => {
  /* The research's most-generous case, reproduced: £500 does not cover a job
     in any scenario at any modelled volume. */
  const p = M.reproducePublishedPaper();
  assert.equal(p.loaded.S3[200] - 500, 45);
  M.SECTORS.length;
  ["S1", "S2", "S3"].forEach(s =>
    [25, 50, 100, 200].forEach(v =>
      assert.ok(p.loaded[s][v] > 500, `£500 unexpectedly covers ${s} at ${v} jobs/yr`)));
});

test("F6 the reference sector is dental, and the paper says so", () => {
  assert.equal(M.reproducePublishedPaper().sector, "dental");
});

test("F7 the negative control — Suite F would notice a route change", () => {
  /* Proving these assertions can fail, rather than assuming it. */
  const p = M.reproducePublishedPaper({ volumes: [25] });
  const shifted = M.loadedCost("dental", "SURVEYOR_VISIT", 25, { overheadPerYear: 61000 }).loaded;
  assert.notEqual(shifted, p.loaded.S1[25]);
});

/* =============================================================================
   SUITE G — THE REBASE (Phase 112, 9 September 2026)

   Five documents on the board priced jobs on LIFETIME RELIEF. Q55 chose
   ALLOWANCES IDENTIFIED. This suite is what makes the replacement figures in
   those documents derivable rather than typed.

   IT VALIDATES ITSELF AGAINST THE PAPERS FIRST. G3 reproduces the published
   OLD-basis crossovers to the pound. If the model could not reproduce the
   figures it is replacing, it would have no standing to replace them.

   THE YIELDS AND THE MINIMUMS ARE FIXTURES HERE, NOT FACTS. The yields are
   Rulebook I midpoints as quoted by the business plan; the minimums are the
   research's recommendation, which was NOT chosen: from Phase 132e there is no
   minimum fee (G18). They stay as fixtures so the old papers' comparisons can
   still be reproduced, and every current figure is on RATE.
   ============================================================================= */

const YIELD = { dental: 0.225, gp: 0.225, care_home: 0.30, private_hospital: 0.35 };
const CANDIDATE_MIN = { dental: 5000, gp: 5000, care_home: 7500, private_hospital: 7500 };

/* The business plan's own assumed mix, §9. */
const PLAN_MIX = [
  { sector: "dental",           share: 0.40, purchase_price:  750000, yield_rate: 0.225 },
  { sector: "gp",               share: 0.20, purchase_price: 1100000, yield_rate: 0.225 },
  { sector: "care_home",        share: 0.30, purchase_price: 1800000, yield_rate: 0.30  },
  { sector: "private_hospital", share: 0.10, purchase_price: 2500000, yield_rate: 0.35  }
];

test("G1 the claimant's tax rate has left our fee — stated, and true of the arithmetic", () => {
  assert.equal(M.claimantTypeEntersTheFee().enters, false);
  /* Two identical properties, two claimant types, one fee. */
  const a = M.allowancesFromPurchasePrice(750000, YIELD.dental);
  assert.equal(M.feeOnAllowances(a, RATE), M.feeOnAllowances(a, RATE));
  assert.equal(M.feeOnAllowances(a, RATE), 5062.5);
  /* And what it still changes: the CLIENT's side, not ours. */
  const at40 = M.effectiveRateOnLifetimeRelief(5062.5, a, 0.40);
  const at25 = M.effectiveRateOnLifetimeRelief(5062.5, a, 0.25);
  assert.equal(at40.fee, at25.fee);
  assert.ok(at25.effective_rate_on_relief > at40.effective_rate_on_relief);
});

test("G2 the fee rate is the shipped engine's, not one this suite invented", () => {
  /* Same cross-check Suite E makes, carried to the fee itself. */
  const E = loadEngine();
  const a = 500000;
  assert.equal(M.feeOnAllowances(a, E.CB_FEE.RATE), E.CB_FEE.readings(a, 0.25).of_allowances);
  assert.equal(M.feeOnAllowances(a, E.CB_FEE.RATE), 15000);
  /* And the rejected reading is the one the five documents were written on. */
  assert.equal(E.CB_FEE.readings(a, 0.25).of_tax_saved, 3750);
});

test("G3 the model reproduces the PUBLISHED old-basis crossovers to the pound", () => {
  /* "Minimum fee, or minimum job size?" §5, and the business plan §6. If these
     did not reproduce, nothing below would have standing to replace them.
     A RECORD: the published figures were on OLD_RATE, so they are reproduced
     on it. */
  const cases = [
    ["dental",           5000, 0.40, 1111111],
    ["dental",           5000, 0.25, 1777778],
    ["gp",               5000, 0.40, 1111111],
    ["care_home",        7500, 0.40, 1250000],
    ["care_home",        7500, 0.25, 2000000],
    ["private_hospital", 7500, 0.40, 1071429],
    ["private_hospital", 7500, 0.25, 1714286]
  ];
  cases.forEach(([s, min, tax, published]) => {
    const c = M.crossoverPurchasePrice(min, OLD_RATE, YIELD[s], { taxRate: tax });
    assert.ok(near(c.crossover_purchase_price_on_old_basis, published, 1),
              `${s} at ${tax}: got ${c.crossover_purchase_price_on_old_basis}, published ${published}`);
  });
});

test("G4 on the allowances base there is ONE crossover per sector (the Phase 112 record, at 5%)", () => {
  /* A RECORD of the Phase 112 rebase, on OLD_RATE. There is no minimum fee
     from Phase 132e, so no crossover is a live figure any more (G18). */
  const expected = { dental: 444444, gp: 444444, care_home: 500000, private_hospital: 428571 };
  Object.keys(expected).forEach(s => {
    const c = M.crossoverPurchasePrice(CANDIDATE_MIN[s], OLD_RATE, YIELD[s], { taxRate: 0.40 });
    assert.ok(near(c.crossover_purchase_price, expected[s], 1), s);
    assert.equal(c.one_crossover_per_sector, true);
    assert.equal(c.claimant_type_enters, false);
    /* One crossover, whatever tax rate is supplied for the comparison. */
    const other = M.crossoverPurchasePrice(CANDIDATE_MIN[s], OLD_RATE, YIELD[s], { taxRate: 0.25 });
    assert.equal(other.crossover_purchase_price, c.crossover_purchase_price);
    assert.equal(c.factor, 2.5);
    assert.equal(other.factor, 4);
  });
});

test("G5 THE REVERSAL — on the plan's own assumed mix the minimum binds on NOTHING", () => {
  /* The published finding: "the minimum applies to three of the four
     revenue-generating sectors and 90% of jobs by volume." */
  /* Still true at 3%: even had the minimum survived, it would bind on none of
     the plan's typical jobs. */
  const b = M.blendedFeePerJob(PLAN_MIX, RATE, CANDIDATE_MIN);
  assert.deepEqual(b.sectors_where_the_minimum_binds, []);
  assert.equal(b.share_of_jobs_where_the_minimum_binds, 0);
  /* And so the two readings of the minimum question price this book alike. */
  assert.equal(b.blended_fee_minimum_retained, b.blended_fee_minimum_withdrawn);
});

test("G6 the blended fee per job, on the plan's mix", () => {
  const b = M.blendedFeePerJob(PLAN_MIX, RATE, CANDIDATE_MIN);
  /* £18,325 at 5% of allowances; £10,995 at the decided 3%. */
  assert.ok(near(b.blended_fee_minimum_retained, 10995, 0.005));
  assert.ok(near(b.blended_fee_minimum_withdrawn, 10995, 0.005));
  /* The published figure was £6,344 on lifetime relief, at the papers' 5%. */
  const publishedOnOldBasis =
      0.40 * 5000 + 0.20 * 5000 + 0.30 * 7500 + 0.10 * (2500000 * 0.35 * 0.25 * OLD_RATE);
  assert.ok(near(publishedOnOldBasis, 6343.75, 0.005));
  assert.ok(b.blended_fee_minimum_retained > publishedOnOldBasis * 1.7);
});

test("G7 the two readings differ only below the crossover, and by the shortfall", () => {
  const below = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 300000,
                    YIELD.dental, RATE, 100, CANDIDATE_MIN.dental);
  assert.equal(below.percentage_fee, 2025);
  assert.equal(below.minimum_binds, true);
  assert.equal(below.minimum_retained.fee, 5000);
  assert.equal(below.minimum_withdrawn.fee, 2025);
  assert.equal(below.the_two_readings_differ_by, 2975);
  /* And this is the band that decides it: retained pays, withdrawn does not. */
  assert.equal(below.minimum_retained.covers_loaded_cost, true);
  assert.equal(below.minimum_withdrawn.covers_loaded_cost, false);

  const above = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 750000,
                    YIELD.dental, RATE, 100, CANDIDATE_MIN.dental);
  assert.equal(above.minimum_binds, false);
  assert.equal(above.the_two_readings_differ_by, 0);
  assert.equal(above.minimum_retained.fee, above.minimum_withdrawn.fee);
});

test("G8 THE YEAR-ONE BAND — at 25 jobs a year the minimum stops protecting", () => {
  /* At 100 jobs the minimum covers loaded cost on every sector; at 25 it does
     not, and there is a band ABOVE the crossover that still loses money. */
  const at100 = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 200000,
                    YIELD.dental, RATE, 100, CANDIDATE_MIN.dental);
  assert.equal(at100.minimum_retained.covers_loaded_cost, true);

  const at25 = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 200000,
                    YIELD.dental, RATE, 25, CANDIDATE_MIN.dental);
  assert.equal(at25.minimum_retained.fee, 5000);
  assert.equal(at25.minimum_retained.loaded_cost, 5390);
  assert.equal(at25.minimum_retained.covers_loaded_cost, false);

  /* Just above the crossover — the minimum no longer applies at all and the
     percentage is still short. Neither reading catches this job. */
  /* At 3% the crossover is £740,741 and break-even at 25 jobs is £798,519. */
  const justAbove = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 770000,
                    YIELD.dental, RATE, 25, CANDIDATE_MIN.dental);
  assert.equal(justAbove.minimum_binds, false);
  assert.ok(justAbove.percentage_fee > CANDIDATE_MIN.dental);
  assert.equal(justAbove.minimum_retained.covers_loaded_cost, false);
  /* It closes at the break-even, which is where it should. */
  const be = M.breakEvenPurchasePrice("dental", "SURVEYOR_VISIT", 25, RATE, YIELD.dental);
  assert.ok(near(be.break_even_purchase_price, 798518.52, 0.02));
});

test("G9 break-even purchase price is now claimant-invariant, at the price as well as the allowances", () => {
  /* C7 asserts it of the allowances. This asserts it of the figure the
     documents actually publish. The published old-basis figures were on
     OLD_RATE and are reproduced on it; the current price is on RATE. */
  const be = M.breakEvenPurchasePrice("care_home", "SURVEYOR_VISIT", 100, RATE, YIELD.care_home);
  assert.ok(near(be.break_even_purchase_price, 694444.44, 0.02));
  const old40 = M.reportsBasisChange("care_home", "SURVEYOR_VISIT", 100, OLD_RATE, YIELD.care_home, 0.40);
  const old25 = M.reportsBasisChange("care_home", "SURVEYOR_VISIT", 100, OLD_RATE, YIELD.care_home, 0.25);
  assert.equal(old40.break_even_purchase_price_now, old25.break_even_purchase_price_now);
  assert.ok(near(old40.break_even_purchase_price_on_old_basis, 1041666.67, 0.02));
  assert.ok(near(old25.break_even_purchase_price_on_old_basis, 1666666.67, 0.02));
});

test("G10 the marginal bands are marginal — no cliff edge, and the rate falls", () => {
  const bands = M.RATE_CARD_BANDS_AS_PUBLISHED;
  const justUnder = M.bandedFee(249999, { bands: bands });
  const justOver  = M.bandedFee(250001, { bands: bands });
  assert.ok(justOver.fee > justUnder.fee);
  assert.ok(justOver.fee - justUnder.fee < 0.11);      /* no cliff */
  assert.equal(M.bandedFee(250000, { bands: bands }).fee, 12500);
  assert.equal(M.bandedFee(1000000, { bands: bands }).fee, 12500 + 30000);
  /* Regressive by construction. */
  const rates = [100000, 500000, 3500000].map(b => M.bandedFee(b, { bands: bands }).effective_rate);
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2]);
  assert.ok(near(rates[2], 117500 / 3500000, 1e-12));
});

test("G11 rescaling the breakpoints is offered, not chosen — and both are priced", () => {
  /* A RECORD of the old rate card: there are no bands from Phase 132e, so the
     bands are passed explicitly (G18 proves they are no longer a default). */
  const CARD = { bands: M.RATE_CARD_BANDS_AS_PUBLISHED };
  const a = M.allowancesFromPurchasePrice(10000000, YIELD.private_hospital);
  const published = M.bandedFee(a, CARD);
  const rescaled  = M.bandedFee(a, { bands: M.rescaledBands(0.40, CARD) });
  assert.deepEqual(M.rescaledBands(0.40, CARD).map(b => b.upTo), [625000, 2500000, Infinity]);
  assert.equal(published.fee, 117500);
  assert.equal(rescaled.fee, 136250);
  assert.ok(rescaled.fee > published.fee);
  /* On the card's own reference job the two agree, which is why the choice is
     invisible on small work and only shows on large. */
  const dental = M.allowancesFromPurchasePrice(750000, YIELD.dental);
  assert.equal(M.bandedFee(dental, CARD).fee, M.bandedFee(dental, { bands: M.rescaledBands(0.40, CARD) }).fee);
});

test("G12 the effective rate ON THE CLIENT'S RELIEF is the fee rate over the tax rate", () => {
  const a = M.allowancesFromPurchasePrice(500000, YIELD.dental);
  const fee = M.feeOnAllowances(a, RATE);
  assert.equal(fee, 3375);
  [[0.40, 0.075], [0.25, 0.12]].forEach(([tax, expected]) => {
    const e = M.effectiveRateOnLifetimeRelief(fee, a, tax);
    assert.ok(near(e.effective_rate_on_relief, expected, 1e-12), String(tax));
    /* 3% of allowances is 3%/taxRate of relief, always. */
    assert.ok(near(e.effective_rate_on_relief, RATE / tax, 1e-12));
  });
});

test("G13 nothing here defaults a fee rate, a yield or a minimum", () => {
  assert.equal(codeOf(() => M.feeOnAllowances(100000)), "E_BAD_FEE_RATE");
  assert.equal(codeOf(() => M.allowancesFromPurchasePrice(500000)), "E_BAD_YIELD");
  assert.equal(codeOf(() => M.crossoverPurchasePrice(0, RATE, 0.225)), "E_BAD_MINIMUM");
  assert.equal(codeOf(() => M.crossoverPurchasePrice(5000, RATE, 0.225, { taxRate: 0 })),
               "E_BAD_TAX_RATE");
  /* A minimum is required even to price the reading that applies none, so the
     two readings are always comparable. */
  assert.equal(codeOf(() => M.priceJobBothReadings("dental", "SURVEYOR_VISIT",
                    500000, 0.225, RATE, 100, null)), "E_BAD_MINIMUM");
  assert.equal(codeOf(() => M.bandedFee(100000, { bands: [{ upTo: 10, rate: 0.05 },
                    { upTo: 5, rate: 0.04 }] })), "E_BAD_BAND_ORDER");
});

test("G14 a mix whose shares do not sum to 1 is refused, not normalised", () => {
  const bad = PLAN_MIX.map((m, i) => i === 0 ? Object.assign({}, m, { share: 0.50 }) : m);
  assert.equal(codeOf(() => M.blendedFeePerJob(bad, RATE, CANDIDATE_MIN)), "E_BAD_MIX_SHARES");
  assert.equal(codeOf(() => M.blendedFeePerJob([], RATE, CANDIDATE_MIN)), "E_BAD_MIX");
  /* No minimums supplied at all is the withdrawn reading - the decided one. */
  const none = M.blendedFeePerJob(PLAN_MIX, RATE);
  assert.equal(none.share_of_jobs_where_the_minimum_binds, 0);
  assert.equal(none.blended_fee_minimum_retained, none.blended_fee_minimum_withdrawn);
});

test("G15 the negative control — Suite G would notice a yield or a base change", () => {
  /* Proving these assertions can fail rather than assuming it. */
  const shifted = M.crossoverPurchasePrice(5000, RATE, 0.226, { taxRate: 0.40 });
  assert.notEqual(Math.round(shifted.crossover_purchase_price), 740741);
  const shiftedMix = PLAN_MIX.map((m, i) =>
      i === 0 ? Object.assign({}, m, { purchase_price: 200000 }) : m);
  const b = M.blendedFeePerJob(shiftedMix, RATE, CANDIDATE_MIN);
  assert.deepEqual(b.sectors_where_the_minimum_binds, ["dental"]);
  assert.ok(near(b.share_of_jobs_where_the_minimum_binds, 0.40, 1e-12));
});

test("G16 the business plan model's REVENUE side is on the decided base too", () => {
  /* Suite B asserts its cost side agrees with this module. Its revenue side was
     the thing Phase 112 rebased, and nothing was checking it. Parsed rather
     than required, for the same reason B2 gives: requiring it runs a script
     that prints a report. */
  const p = findUp(path.join("03-app", "caprebate-business-plan-model.cjs"));
  const src = fs.readFileSync(p, "utf8");

  /* What we charge: a percentage of allowances, with no marginal rate in it. */
  assert.match(src, /const feeDecided\s*=\s*\(price,\s*sector\)\s*=>\s*PCT \* allowances\(price, sector\)/,
               "the model no longer defines feeDecided as a percentage of allowances");
  assert.doesNotMatch(src.slice(src.indexOf("const feeDecided"),
                                src.indexOf("const feeDecided") + 200),
                      /RATE\[/, "feeDecided has picked up a marginal tax rate");

  /* The forecast blends on it, not on the superseded option. */
  const blend = src.slice(src.indexOf("const blendedFee ="), src.indexOf("const blendedDirect"));
  assert.match(blend, /feeDecided/);
  assert.doesNotMatch(blend, /feeOptionB/,
                      "the 24-month forecast is still blending on lifetime relief");

  /* And the rate it uses is the engine's - READ, not restated (Phase 132e).
     No line assigns PCT a number, and no minimum fee table survives. */
  assert.match(src, /return CB_FEE\.RATE;/);
  assert.doesNotMatch(src, /const PCT\s*=\s*0?\.\d/);
  assert.doesNotMatch(src, /MINFEE|Math\.max\(feeDecided/);
  assert.equal(loadEngine().CB_FEE.RATE, 0.03);
});

test("G17 the forecast's headline figures re-derive from this module", () => {
  /* Reproducing the model's blended fee here means the business plan's forecast
     is derivable from something tested, rather than from a script's stdout. */
  /* PHASE 132e: on the flat 3% with no minimum. At 5% these were revenue
     £1,832,500, net £1,313,700 (£1,193,700 with salary) and 8.36 jobs a year. */
  const b = M.blendedFeePerJob(PLAN_MIX, RATE);
  const blendedDirect = PLAN_MIX.reduce((a, m) =>
      a + m.share * M.directCost(m.sector, "SURVEYOR_VISIT"), 0);
  assert.ok(near(blendedDirect, 3988, 0.005));
  const jobs = 100;
  assert.ok(near(jobs * b.blended_fee_minimum_withdrawn, 1099500, 0.01));
  assert.ok(near(jobs * blendedDirect, 398800, 0.01));
  /* 24-month net, overhead £120,000 over two years, with a £120,000 founder salary. */
  assert.ok(near(1099500 - 398800 - 120000, 580700, 0.01));
  assert.ok(near(1099500 - 398800 - 240000, 460700, 0.01));
  /* Jobs a year to cover overhead and a salary. */
  const perJobContribution = b.blended_fee_minimum_withdrawn - blendedDirect;
  assert.ok(near(120000 / perJobContribution, 17.13, 0.01));
});

test("G18 THE FLAT 3% DECISION — no minimum fee, no bands, a discretionary discount that is not a number", () => {
  /* Lakhbir, answer read 15 September 2026: "yes, flat fee of 3% of the
     allowances for 1 or more properties", no bands, no minimum, and "A further
     multi-site discount can be applied depending on site/opportunities". */
  const D = M.FEE_DECISION;
  assert.deepEqual([D.flat, D.bands, D.minimum_fee], [true, false, false]);
  assert.equal(D.rate_source, "CB_FEE.RATE in the shipped engine");
  assert.equal(D.answer_read, "2026-09-15");

  /* The bands are no longer a default: a flat fee has none to fall back on. */
  assert.equal(codeOf(() => M.bandedFee(100000)), "E_NO_BANDS");
  assert.equal(codeOf(() => M.bandedFee(100000, {})), "E_NO_BANDS");
  assert.equal(codeOf(() => M.bandedFee(100000, { bands: undefined })), "E_NO_BANDS");
  assert.equal(codeOf(() => M.rescaledBands(0.40)), "E_NO_BANDS");

  /* The minimum question is closed, and the decided reading is named. */
  const j = M.priceJobBothReadings("dental", "SURVEYOR_VISIT", 300000,
              YIELD.dental, RATE, 120, CANDIDATE_MIN.dental);
  assert.equal(j.decided_reading, "minimum_withdrawn");
  assert.equal(j[j.decided_reading].fee, 2025);
  assert.ok(!("open_question" in j));

  /* The discount: discretionary, no tiers, and its ceiling and approver are
     NAMED NULLS - never a number, and never applied automatically. */
  const dsc = D.multi_site_discount;
  assert.deepEqual([dsc.discretionary, dsc.fixed_tiers, dsc.largest_discount,
                    dsc.approved_by, dsc.applied_automatically],
                   [true, null, null, null, false]);
  assert.equal(dsc.asked, "the largest discount and who approves it");

  /* And the engine carries the same named nulls, and no discount moves its fee. */
  const E = loadEngine();
  const ed = E.CB_FEE.MULTI_SITE_DISCOUNT;
  assert.deepEqual([ed.discretionary, ed.fixed_tiers, ed.largest_discount,
                    ed.approved_by, ed.applied_automatically],
                   [true, null, null, null, false]);
  assert.equal(E.CB_FEE.display(200000, 0.25).amount, 6000);
});


/* ===========================================================================
   SUITE H — the engagement gate's cost input.  PHASE 113d, item 13005159647.

   The gate itself is in the site engine, as CB_GATE, and the regression
   harness's suite T tests its decisions. What is tested HERE is the half that
   belongs to this module: the costing the gate injects, and the promise that
   it never throws, never guesses and never defaults a volume.

   THE DIVISION IS THE DESIGN. Four documents specified this control and none
   implemented it; the danger in finally building it was that the site would
   grow a second cost model. So the site holds a decision and this file holds
   the only arithmetic. H6 asserts that from this side too.
   =========================================================================== */

test("H1 costingForGate reproduces loadedCost exactly — it is not a second sum", () => {
  for (const sec of M.SECTORS) {
    for (const v of [16, 25, 50, 100, 200]) {
      const g = M.costingForGate(sec, "SURVEYOR_VISIT", v);
      const l = M.loadedCost(sec, "SURVEYOR_VISIT", v);
      assert.equal(g.known, true);
      assert.equal(g.loaded, l.loaded);
      assert.equal(g.marginal, l.marginal);
      assert.equal(g.overhead_per_job, l.overhead_per_job);
    }
  }
});

test("H2 it reproduces the published S1 loaded-cost table, cell for cell", () => {
  /* The research paper's own table, overhead GBP 60k and no founder salary. */
  const want = { 25: 5390, 50: 4190, 100: 3590, 200: 3290 };
  for (const v of Object.keys(want)) {
    assert.equal(M.costingForGate("dental", "SURVEYOR_VISIT", Number(v)).loaded,
                 want[v], "dental at " + v + " jobs/yr");
  }
});

test("H3 A MISSING VOLUME IS UNKNOWN, NOT 100 — and it does not throw", () => {
  /* loadedCost() throws E_BAD_VOLUME, which is right for a modelling call a
     person wrote and wrong for a gate: a missing annual volume is a fact about
     the business, not a programming error, and a gate that throws takes a
     screen down. */
  assert.equal(codeOf(() => M.loadedCost("dental", "SURVEYOR_VISIT", null)), "E_BAD_VOLUME");

  const g = M.costingForGate("dental", "SURVEYOR_VISIT", null);
  assert.equal(g.known, false);
  assert.equal(g.parameter, "jobs_per_year");
  assert.equal(g.loaded, null);
  assert.match(g.why, /does not default to 100/);
});

test("H3b UNKNOWN IS NOT A BRANCH — absent, null, 0 and a string all agree", () => {
  /* BOTH the not-supplied case and the explicitly-undefined case, as the
     standing rule requires, plus the two shapes a form can actually produce. */
  const shapes = [undefined, null, 0, -5, "not sure", NaN];
  for (const v of shapes) {
    const g = M.costingForGate("dental", "SURVEYOR_VISIT", v);
    assert.equal(g.known, false, "volume " + String(v));
    assert.equal(g.parameter, "jobs_per_year", "volume " + String(v));
    assert.equal(g.loaded, null, "volume " + String(v));
  }
  /* GATE.current_year_jobs is the 120 Lakhbir gave (Phase 132e). It is a
     record the site restates, and costingForGate never falls back on it: an
     unknown volume passed in is still unknown, whatever GATE holds. */
  assert.equal(M.GATE.current_year_jobs, 120);
  assert.equal(M.costingForGate("dental", "SURVEYOR_VISIT", undefined).known, false);
});

test("H4 an unknown sector or scenario is named, not substituted", () => {
  const a = M.costingForGate("dental", "NO_SUCH_ROUTE", 100);
  assert.deepEqual([a.known, a.parameter, a.loaded], [false, "delivery_scenario", null]);

  const b = M.costingForGate("veterinary", "SURVEYOR_VISIT", 100);
  assert.deepEqual([b.known, b.parameter, b.loaded], [false, "sector", null]);

  /* Supported living is a real sector of the ENGINE and has no cost row here.
     It must come back unknown rather than borrowing another sector's costs. */
  const c = M.costingForGate("supported_living", "SURVEYOR_VISIT", 100);
  assert.deepEqual([c.known, c.parameter], [false, "sector"]);
});

test("H5 the scenario is one value, and moving it moves the cost", () => {
  assert.equal(M.GATE.delivery_scenario_today, "SURVEYOR_VISIT");
  assert.equal(M.ROUTES[M.GATE.delivery_scenario_today].paper_scenario, "S1");

  /* S7.3: when the step-down fires, this is the one place it fires. */
  assert.equal(M.costingForGate("dental", "SURVEYOR_VISIT", 25).loaded, 5390);
  assert.equal(M.costingForGate("dental", "DESK_ONLY", 25).loaded, 3620);
});

test("H6 the threshold is stated once, and it is the documents' sentence", () => {
  /* "the loaded cost plus a 25% target margin" */
  assert.equal(M.GATE.target_margin, 0.25);
  assert.equal(M.GATE.target_margin, M.MODELLING.target_margin);
  assert.equal(M.gateThreshold(5390, 0.25), 6737.5);
  assert.equal(M.gateThreshold(5390), 6737.5);          /* defaults to GATE's */
  assert.equal(codeOf(() => M.gateThreshold(0, 0.25)), "E_BAD_LOADED_COST");
  assert.equal(codeOf(() => M.gateThreshold(5390, 1)), "E_BAD_MARGIN");
});

test("H7 the placeholder overhead is carried through, not presented as measured", () => {
  const withPlaceholder = M.costingForGate("dental", "SURVEYOR_VISIT", 25);
  assert.equal(withPlaceholder.overhead_is_placeholder, true);
  assert.equal(withPlaceholder.overhead_basis, 60000);

  const withReal = M.costingForGate("dental", "SURVEYOR_VISIT", 25, { overheadPerYear: 84000 });
  assert.equal(withReal.overhead_is_placeholder, false);
  assert.equal(withReal.loaded, 5390 + (84000 - 60000) / 25);

  /* The parameter behind it is still a named null in this module. */
  assert.equal(M.PARAMS.overhead_per_year, null);
});

test("H8 THE GATE IN THE SHIPPED SITE USES THIS MODULE, and ships ON at 120 (Phase 132e)", () => {
  const E = loadEngine();
  assert.ok(E.CB_GATE && E.CB_GATE_CONFIG, "CB_GATE is not in the shipped layer");

  /* Switched on by Phase 132e on Lakhbir's decision, with his 120. The costing
     is still not wired on the page, which cannot require this file. */
  assert.equal(E.CB_GATE_CONFIG.enabled, true);
  assert.equal(E.CB_GATE_CONFIG.jobs_per_year, 120);
  assert.equal(E.CB_GATE_CONFIG.jobs_per_year, M.GATE.current_year_jobs);
  assert.equal(E.CB_GATE_CONFIG.costing, null);
  assert.equal(typeof E.CB_GATE_CONFIG.requires, "string");

  /* The two constants the page restates because it cannot require this file. */
  assert.equal(E.CB_GATE_CONFIG.target_margin, M.GATE.target_margin);
  assert.equal(E.CB_GATE_CONFIG.delivery_scenario, M.GATE.delivery_scenario_today);

  /* Wired to the REAL costing, the gate's threshold is this module's number.
     Restored afterwards so nothing downstream sees a configured gate. */
  const cfg = E.CB_GATE_CONFIG;
  const before = { enabled: cfg.enabled, jobs_per_year: cfg.jobs_per_year, costing: cfg.costing };
  try {
    cfg.enabled = false;
    cfg.jobs_per_year = 25;
    cfg.costing = M.costingForGate;
    const g = E.CB_GATE.assess({ fee: 5000, sector: "dental" });
    assert.equal(g.outcome, "FIRE");
    assert.equal(g.loaded_cost, M.costingForGate("dental", "SURVEYOR_VISIT", 25).loaded);
    assert.equal(g.threshold, M.gateThreshold(g.loaded_cost));
    assert.equal(g.shortfall, M.gateThreshold(g.loaded_cost) - 5000);
    /* Off, so it withholds nothing even where it fires. */
    assert.equal(g.withholds_quote, false);
    /* And on, as shipped, it does withhold. */
    cfg.enabled = true;
    assert.equal(E.CB_GATE.assess({ fee: 5000, sector: "dental" }).withholds_quote, true);
  } finally {
    cfg.enabled = before.enabled;
    cfg.jobs_per_year = before.jobs_per_year;
    cfg.costing = before.costing;
  }
});

test("H9 the sector spread the documents quote is the DIRECT one, not the loaded", () => {
  /* Found by suite T on 9 September 2026. Three documents said "the loaded
     cost varies 2.2 times across the sectors". 2.19x is the DIRECT spread.
     The LOADED spread is 1.87x at 100 jobs a year and NARROWS to 1.46x at the
     16 the business plan model's own ramp reaches in year one, because
     overhead per job is sector-invariant and dominates as volume falls.
     The four documents were corrected to these figures in Phase 113d. */
  const r2 = n => Math.round(n * 100) / 100;
  const direct = s => M.directCost(s, "SURVEYOR_VISIT");
  const loaded = (s, v) => M.costingForGate(s, "SURVEYOR_VISIT", v).loaded;

  assert.equal(r2(direct("private_hospital") / direct("dental")), 2.19);
  assert.equal(r2(loaded("private_hospital", 100) / loaded("dental", 100)), 1.87);
  assert.equal(r2(loaded("private_hospital", 16) / loaded("dental", 16)), 1.46);

  /* And the argument for a fee-side test survives, because the VOLUME effect
     is the larger of the two — which is exactly why a gate calibrated on one
     assumed volume is the defect to guard against. */
  assert.ok(loaded("dental", 16) / loaded("dental", 200) >
            loaded("private_hospital", 100) / loaded("dental", 100));
});
