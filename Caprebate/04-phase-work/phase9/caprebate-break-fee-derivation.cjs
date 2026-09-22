/* =============================================================================
   CAPREBATE — BREAK FEE AND ABORT FEE, DERIVED (Phase 129, 12 September 2026)

   Board item 12984553034, "Decide the break fee, the abort fee and whether a
   fixed fee is ever offered — the engagement letter leaves all three blank".

   WHOSE COST: OURS. What Caprebate has spent on ONE PROPERTY when a client
   walks away at each point in the pipeline. This is NOT caprebate-cost-model.cjs,
   which costs the client's building; the question that asked for this pointed at
   that file and that pointer was wrong (see caprebate-job-economics.cjs, "THE
   NAMES ARE A TRAP").

   NO NUMBER IS NEW HERE. The cost lines are caprebate-job-economics.cjs
   (SECTOR_DIRECT, ROUTES, loadedCost), which is itself held by test to
   03-app/caprebate-business-plan-model.cjs. The fee rate is read out of the
   shipped engine exactly as caprebate-job-economics.test.cjs Suite E does.
   The one injected example input is the dental yield midpoint (22.5%) used by
   the business plan model's own worked £500,000 dental job, and it is labelled.

   RE-COSTED AT 3% BY PHASE 132e (16 September 2026). The fee rate is still
   read from the engine, which now holds the flat 3% Lakhbir decided (answer
   read 15 September 2026). Nothing on the COST side moved: every stage cost,
   the £995 comparison and the loadings are what they were at 5%. What moved
   is the worked example's fee and margin. At 3% the £500,000 dental job's fee
   (£3,375) is BELOW its loaded cost at 25, 100 and 120 jobs a year, so the old
   "a nil abort fee absorbs N completed jobs' margin" sentence has no positive
   margin to divide by; it now says so instead of printing a negative count.
   120 jobs a year is shown because it is the volume Lakhbir gave for the
   engagement gate; 25 and 100 are kept because the papers use them.

   PHASE 146 (22 September 2026) - TWO FEE-DEPENDENT FIGURES THE 3% RE-RUN
   DID NOT PRODUCE. Phase 132e re-ran the worked example at 3% and found that
   job loses money, so the 5% "one nil abort wipes out N jobs" figure had no 3%
   counterpart for any job. The section at the end prints it for the dental
   jobs that DO pay their way at the engine's rate, and the allowances below
   which the break fee is larger than the whole fee the client would have paid.
   Both read FEE_RATE from the engine; the 5% column is the record only.

   WHAT THE MODEL DOES NOT HOLD, AND THIS FILE DOES NOT INVENT
     - How the internal hours split across the pipeline. The model carries one
       figure per job. So the "research run, surveyor not instructed" stage is
       reported as a RANGE: the data line alone, up to the data line plus every
       internal hour.
     - When a surveyor's fee becomes payable by us. No surveyor has been
       approached (item 12927537258) so no surveyor's cancellation terms exist.
       The "surveyor instructed, survey not delivered" stage is therefore
       reported both ways.
   The loadings (failed-enquiry drag, overhead) are shown but are NOT part of the
   pre-estimate: they are not caused by this client leaving.

   RUN
     node caprebate-break-fee-derivation.cjs
   ============================================================================= */

"use strict";

const fs = require("fs");
const path = require("path");
const M = require("./caprebate-job-economics.cjs");

function findUp(rel, depth) {
  let dir = __dirname;
  for (let i = 0; i < depth; i++) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
    dir = path.dirname(dir);
  }
  return null;
}

const SITE = findUp(path.join("..", "Caprebate site.html"), 6) || findUp("Caprebate site.html", 6);
if (!SITE) throw new Error("Caprebate site.html not found; the fee rate is read from the engine, never restated");
const engineSrc = fs.readFileSync(SITE, "utf8");
const E = new Function(
  engineSrc.slice(engineSrc.indexOf("var CB_PLANT"), engineSrc.indexOf("var CB_BOOKING")) +
  "; return {CB_FEE:CB_FEE};")();
const FEE_RATE = E.CB_FEE.RATE;

const gbp = (n) => "£" + Math.round(n).toLocaleString("en-GB");
const LABEL = { dental: "Dental", gp: "GP surgery", care_home: "Care home", private_hospital: "Private hospital" };
const PROPOSED_BREAK_FEE = 995;   /* Lakhbir's own figure in the answer box, "£995 per property?" */

/* The cost to us, on one property, at each point a client could leave. */
function stages(sectorId, routeId) {
  const s = M.SECTOR_DIRECT[sectorId];
  const data = s.data;
  const internal = M.internalCost(sectorId, routeId);
  const surveyor = M.surveyorCost(sectorId, routeId);
  const cta = M.ctaCost(sectorId, routeId);
  const direct = M.directCost(sectorId, routeId);
  if (Math.abs(data + internal + surveyor + cta - direct) > 1e-9) throw new Error("stage lines do not sum to directCost");
  return {
    signed_nothing_started: { lo: 0, hi: 0 },
    research_run_surveyor_not_instructed: { lo: data, hi: data + internal },
    surveyor_instructed_not_delivered: { if_not_liable: data + internal, if_liable: data + internal + surveyor },
    survey_delivered_tax_adviser_not_yet: data + internal + surveyor,
    tax_adviser_reviewed_report_not_delivered: direct,
    lines: { data, internal, surveyor, cta, direct }
  };
}

console.log("Fee rate read from the shipped engine (CB_FEE.RATE): " + FEE_RATE);
console.log("Engine file: " + SITE + "\n");

for (const routeId of ["SURVEYOR_VISIT", "DESK_ONLY"]) {
  console.log("=== ROUTE " + routeId + " — " + M.ROUTES[routeId].label + " ===");
  console.log("Sector | Data | Internal | Surveyor | Tax adviser | Direct | Research run (range) | Surveyor instructed (not liable / liable) | Survey delivered | Adviser reviewed | £995 covers pre-survey max?");
  for (const sec of M.SECTORS) {
    const st = stages(sec, routeId), L = st.lines;
    const r = st.research_run_surveyor_not_instructed, si = st.surveyor_instructed_not_delivered;
    console.log([LABEL[sec], gbp(L.data), gbp(L.internal), gbp(L.surveyor), gbp(L.cta), gbp(L.direct),
      gbp(r.lo) + "–" + gbp(r.hi), gbp(si.if_not_liable) + " / " + gbp(si.if_liable),
      gbp(st.survey_delivered_tax_adviser_not_yet), gbp(st.tax_adviser_reviewed_report_not_delivered),
      (PROPOSED_BREAK_FEE >= r.hi ? "yes, by " + gbp(PROPOSED_BREAK_FEE - r.hi) : "NO, short by " + gbp(r.hi - PROPOSED_BREAK_FEE))
    ].join(" | "));
  }
  console.log("");
}

console.log("=== THE PROPOSED £995, AGAINST A BREAK AFTER THE SURVEYOR IS INSTRUCTED (surveyor visit route, we are liable for the survey) ===");
for (const sec of M.SECTORS) {
  const st = stages(sec, "SURVEYOR_VISIT");
  const loss = st.surveyor_instructed_not_delivered.if_liable;
  console.log(LABEL[sec] + ": cost " + gbp(loss) + "; £995 alone leaves " + gbp(loss - PROPOSED_BREAK_FEE) +
    " unrecovered; £995 plus the surveyor at cost recovers " + gbp(PROPOSED_BREAK_FEE + st.lines.surveyor) +
    " (" + (PROPOSED_BREAK_FEE + st.lines.surveyor >= loss ? "covers it" : "short") + ")");
}
console.log("");

console.log("=== LOADINGS, SHOWN FOR CONTEXT AND NOT PART OF THE PRE-ESTIMATE ===");
for (const jobs of [25, 100, 120]) {
  const c = M.loadedCost("dental", "SURVEYOR_VISIT", jobs, {});
  console.log("Dental, surveyor visit, " + jobs + " jobs/yr: direct " + gbp(c.direct) + ", failed-enquiry drag " +
    gbp(c.failed_enquiry_drag) + ", overhead per job " + gbp(c.overhead_per_job) + ", loaded " + gbp(c.loaded));
}
console.log("");

console.log("=== WORKED EXAMPLE — the business plan model's own £500,000 dental job ===");
const DENTAL_YIELD_MIDPOINT = 0.225;  /* injected: Rulebook I dental 15–30% midpoint, as the business plan model uses */
const allowances = M.allowancesFromPurchasePrice(500000, DENTAL_YIELD_MIDPOINT);
const fee = M.feeOnAllowances(allowances, FEE_RATE);
const dst = stages("dental", "SURVEYOR_VISIT");
console.log("Allowances " + gbp(allowances) + ", fee " + gbp(fee));
for (const jobs of [120, 100, 25]) {
  const c = M.loadedCost("dental", "SURVEYOR_VISIT", jobs, {});
  const margin = fee - c.loaded;
  console.log("  at " + jobs + " jobs/yr: loaded " + gbp(c.loaded) + ", margin on a completed job " + gbp(margin));
  const abortCost = dst.survey_delivered_tax_adviser_not_yet;
  if (margin > 0) {
    console.log("    a nil abort fee after the survey absorbs " + gbp(abortCost) + " = " +
      (abortCost / margin).toFixed(1) + " completed jobs' margin");
  } else {
    console.log("    a completed job already loses " + gbp(-margin) + ", so there is no margin to absorb it; " +
      "a nil abort fee after the survey is a further " + gbp(abortCost) + " unrecovered");
  }
}
console.log("");
console.log("Walk-away days for that job, cost to us / £995 / £995 + surveyor at cost:");
console.log("  Tuesday, signed, nothing started (inside the 14-day window, clause 8): " + gbp(0) + " / nothing payable / nothing payable");
console.log("  Research run, surveyor not instructed: " + gbp(dst.research_run_surveyor_not_instructed.lo) + "–" +
  gbp(dst.research_run_surveyor_not_instructed.hi) + " / " + gbp(995) + " / " + gbp(995));
console.log("  Surveyor instructed, we are liable for the survey: " + gbp(dst.surveyor_instructed_not_delivered.if_liable) +
  " / " + gbp(995) + " / " + gbp(995 + dst.lines.surveyor));
console.log("  Survey delivered, tax adviser not yet: " + gbp(dst.survey_delivered_tax_adviser_not_yet) +
  " / " + gbp(995) + " / " + gbp(995 + dst.lines.surveyor));

console.log("");
console.log("=== PHASE 146 — WHERE A DENTAL JOB DOES PAY ITS WAY AT THE ENGINE RATE (surveyor visit) ===");
const abortAfterSurvey = dst.survey_delivered_tax_adviser_not_yet;
for (const jobs of [120, 100, 25]) {
  const c = M.loadedCost("dental", "SURVEYOR_VISIT", jobs, {});
  const beAllow = c.loaded / FEE_RATE;
  const bePrice = beAllow / DENTAL_YIELD_MIDPOINT;
  console.log("  at " + jobs + " jobs/yr: a completed job breaks even at " + gbp(beAllow) + " of allowances (about " +
    gbp(bePrice) + " purchase price at the 22.5% dental midpoint)");
}
for (const price of [750000, 1000000, 1500000]) {
  const al = M.allowancesFromPurchasePrice(price, DENTAL_YIELD_MIDPOINT);
  const f = M.feeOnAllowances(al, FEE_RATE);
  const parts = [120, 100, 25].map(function (jobs) {
    const m = f - M.loadedCost("dental", "SURVEYOR_VISIT", jobs, {}).loaded;
    return jobs + " jobs/yr margin " + gbp(m) + (m > 0 ? ", one nil abort = " + (abortAfterSurvey / m).toFixed(1) + " jobs" : ", no margin");
  });
  console.log("  " + gbp(price) + " purchase, allowances " + gbp(al) + ", fee " + gbp(f) + ": " + parts.join("; "));
}
console.log("");
console.log("=== PHASE 146 — BELOW WHAT ALLOWANCES IS THE BREAK FEE LARGER THAN THE WHOLE FEE? (engine rate; 5% record) ===");
for (const sec of M.SECTORS) {
  const st = stages(sec, "SURVEYOR_VISIT");
  const after = PROPOSED_BREAK_FEE + st.lines.surveyor;
  console.log("  " + LABEL[sec] + ": £995 alone exceeds the fee below " + gbp(PROPOSED_BREAK_FEE / FEE_RATE) +
    " (5%: " + gbp(PROPOSED_BREAK_FEE / 0.05) + "); £995 plus the surveyor at cost (" + gbp(after) + ") exceeds it below " +
    gbp(after / FEE_RATE) + " (5%: " + gbp(after / 0.05) + ")");
}
console.log("  Worked example: after survey the break fee of " + gbp(PROPOSED_BREAK_FEE + dst.lines.surveyor) + " is " +
  Math.round(100 * (PROPOSED_BREAK_FEE + dst.lines.surveyor) / fee) + "% of the " + gbp(fee) + " fee (at 5% it was " +
  Math.round(100 * (PROPOSED_BREAK_FEE + dst.lines.surveyor) / M.feeOnAllowances(allowances, 0.05)) + "% of " + gbp(M.feeOnAllowances(allowances, 0.05)) + ")");

module.exports = { stages, FEE_RATE, PROPOSED_BREAK_FEE };
